import os
import subprocess
import json
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.media import Media, VideoKeyframe
from app.services.clip_engine import embed_image, embed_text
from app.config import settings

logger = logging.getLogger("memorypics.video_engine")

VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}

def is_video_file(path_or_filename: str) -> bool:
    """Checks if a file has a recognized video extension."""
    ext = os.path.splitext(path_or_filename)[1].lower()
    return ext in VIDEO_EXTENSIONS

def format_timestamp(seconds: float) -> str:
    """Formats seconds into MM:SS or HH:MM:SS format."""
    total_sec = int(round(seconds))
    hours = total_sec // 3600
    minutes = (total_sec % 3600) // 60
    secs = total_sec % 60
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{secs:02d}"
    return f"{minutes:02d}:{secs:02d}"

def probe_video_metadata(video_path: str) -> Dict[str, Any]:
    """Uses ffprobe to extract duration, resolution, codec, and fps of a video file."""
    default_meta = {
        "duration": 0.0,
        "width": 0,
        "height": 0,
        "codec": "unknown",
        "fps": 30.0
    }
    if not os.path.isfile(video_path):
        return default_meta

    try:
        cmd = [
            "ffprobe",
            "-v", "quiet",
            "-print_format", "json",
            "-show_format",
            "-show_streams",
            video_path
        ]
        result = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, timeout=10)
        if result.returncode != 0:
            logger.warning(f"ffprobe failed for {video_path}: {result.stderr}")
            return default_meta

        data = json.loads(result.stdout)
        fmt = data.get("format", {})
        duration = float(fmt.get("duration", 0.0))

        width = 0
        height = 0
        codec = "unknown"
        fps = 30.0

        for stream in data.get("streams", []):
            if stream.get("codec_type") == "video":
                width = int(stream.get("width", 0))
                height = int(stream.get("height", 0))
                codec = str(stream.get("codec_name", "unknown"))
                fps_eval = stream.get("r_frame_rate", "30/1")
                if "/" in fps_eval:
                    num, den = fps_eval.split("/")
                    fps = round(float(num) / max(1.0, float(den)), 1)
                break

        return {
            "duration": round(duration, 2),
            "width": width,
            "height": height,
            "codec": codec,
            "fps": fps
        }
    except Exception as e:
        logger.error(f"Error probing video {video_path}: {e}")
        return default_meta

def extract_video_cover_thumbnail(media_id: int, video_path: str, duration: float = 0.0) -> Optional[str]:
    """
    High-speed video cover frame extractor for library scanning (takes ~0.15s).
    Extracts 1 WebP cover thumbnail frame so the video is immediately ready for display
    in the UI timeline grid without blocking the scanner with 30 keyframes and CLIP runs.
    """
    if not video_path or not os.path.isfile(video_path):
        return None
    os.makedirs(settings.THUMBNAIL_DIR, exist_ok=True)
    thumb_path = os.path.join(settings.THUMBNAIL_DIR, f"thumb_{media_id}_256.webp")
    ts = 0.5 if duration <= 0 else min(1.0, duration * 0.25)
    cmd = [
        "ffmpeg",
        "-y",
        "-ss", str(ts),
        "-i", video_path,
        "-vframes", "1",
        "-vf", "scale='min(512,iw)':-1",
        "-q:v", "80",
        thumb_path
    ]
    try:
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=8)
        if res.returncode == 0 and os.path.isfile(thumb_path):
            return thumb_path
    except Exception as e:
        logger.warning(f"Fast video cover extraction failed for {video_path}: {e}")
    return None

def extract_video_keyframes(
    db: Session,
    media: Media,
    interval_seconds: float = 3.0,
    max_keyframes: int = 30
) -> List[VideoKeyframe]:
    """
    Extracts keyframes from a video file at regular intervals,
    computes CLIP vector embeddings for each frame, and stores them in database.
    """
    video_path = media.original_path
    if not video_path or not os.path.isfile(video_path):
        return []

    # Probe duration if missing
    if not media.duration_seconds or media.duration_seconds <= 0:
        meta = probe_video_metadata(video_path)
        media.duration_seconds = meta["duration"]
        if meta["width"] > 0:
            media.width = meta["width"]
        if meta["height"] > 0:
            media.height = meta["height"]
        db.commit()

    duration = media.duration_seconds or 0.0
    if duration <= 0.5:
        duration = 5.0  # Fallback assumption

    # Determine frame sample timestamps
    timestamps = []
    current_t = min(1.0, duration * 0.5)
    while current_t < duration and len(timestamps) < max_keyframes:
        timestamps.append(round(current_t, 2))
        current_t += interval_seconds

    if not timestamps:
        timestamps = [0.5]

    os.makedirs(settings.THUMBNAIL_DIR, exist_ok=True)
    created_keyframes = []

    # Clean existing keyframes for this media to prevent duplication
    db.query(VideoKeyframe).filter(VideoKeyframe.media_id == media.id).delete()
    db.commit()

    for idx, ts in enumerate(timestamps):
        thumb_filename = f"vid_{media.id}_frame_{idx}_{int(ts*100)}.webp"
        thumb_path = os.path.join(settings.THUMBNAIL_DIR, thumb_filename)

        # ffmpeg fast seek to timestamp and extract 1 frame as WebP
        cmd = [
            "ffmpeg",
            "-y",
            "-ss", str(ts),
            "-i", video_path,
            "-vframes", "1",
            "-vf", "scale='min(512,iw)':-1",
            "-q:v", "80",
            thumb_path
        ]
        try:
            res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=8)
            if res.returncode != 0 or not os.path.isfile(thumb_path):
                logger.warning(f"Failed to extract frame at {ts}s from {video_path}")
                continue

            # Compute visual embedding
            vec = embed_image(thumb_path)
            vec_bytes = vec.tobytes() if vec is not None else None
            vec_list = vec.tolist() if vec is not None else None

            kf = VideoKeyframe(
                media_id=media.id,
                timestamp_seconds=ts,
                thumbnail_path=thumb_path,
                vector=vec_bytes,
                embedding=vec_list
            )
            db.add(kf)
            created_keyframes.append(kf)
        except Exception as e:
            logger.warning(f"Error extracting keyframe at {ts}s: {e}")

    db.commit()

    # If media doesn't have a cover thumbnail yet, set first keyframe as thumbnail
    if created_keyframes and created_keyframes[0].thumbnail_path:
        media.thumbnail_256_path = created_keyframes[0].thumbnail_path
        media.thumbnail_1080_path = created_keyframes[0].thumbnail_path
        db.commit()

    logger.info(f"Extracted {len(created_keyframes)} keyframes for video #{media.id} ({media.filename})")
    return created_keyframes

def search_video_keyframes(
    db: Session,
    query_vector: np.ndarray,
    user_id: Optional[int] = None,
    top_k: int = 15,
    min_similarity: float = 0.16
) -> List[Dict[str, Any]]:
    """
    Finds exact matching moments / keyframes across indexed videos for user_id.
    Returns matched video details, timestamp in seconds, timestamp label, and preview crop.
    """
    q_rows = db.query(
        VideoKeyframe.id,
        VideoKeyframe.media_id,
        VideoKeyframe.timestamp_seconds,
        VideoKeyframe.thumbnail_path,
        VideoKeyframe.vector
    ).join(Media, VideoKeyframe.media_id == Media.id).filter(
        VideoKeyframe.vector.isnot(None),
        Media.is_deleted == False
    )
    if user_id:
        q_rows = q_rows.filter(Media.user_id == user_id)
    rows = q_rows.all()

    if not rows:
        return []

    # Fast vectorized matrix dot product across all video keyframes in 1 BLAS call
    vec_matrix = np.vstack([np.frombuffer(r[4], dtype=np.float32) for r in rows])
    scores = vec_matrix @ query_vector

    results = []
    for idx, (kf_id, media_id, ts, thumb_path, _) in enumerate(rows):
        score = float(scores[idx])
        if score >= min_similarity:
            results.append({
                "keyframe_id": kf_id,
                "media_id": media_id,
                "timestamp_seconds": round(ts, 1),
                "timestamp_label": format_timestamp(ts),
                "similarity": round(score, 4),
                "match_percent": int(round(score * 100)),
                "thumbnail_path": thumb_path
            })

    # Sort highest similarity first
    results.sort(key=lambda x: x["similarity"], reverse=True)

    # Group by media_id to keep the best matching moment per video
    best_per_media = {}
    for r in results:
        mid = r["media_id"]
        if mid not in best_per_media:
            best_per_media[mid] = r

    final_results = list(best_per_media.values())[:top_k]

    # Enrich with Media details via single batch query (eliminates N+1 DB roundtrips)
    target_mids = [item["media_id"] for item in final_results]
    media_q = db.query(Media).filter(Media.id.in_(target_mids), Media.is_deleted == False)
    if user_id:
        media_q = media_q.filter(Media.user_id == user_id)
    media_records = media_q.all()
    media_map = {m.id: m for m in media_records}

    enriched = []
    for item in final_results:
        media = media_map.get(item["media_id"])
        if media:
            enriched.append({
                "id": media.id,
                "filename": media.filename,
                "is_video": True,
                "duration_seconds": media.duration_seconds,
                "matched_timestamp": item["timestamp_seconds"],
                "matched_timestamp_label": item["timestamp_label"],
                "similarity": item["similarity"],
                "match_percent": item["match_percent"],
                "keyframe_thumbnail_url": f"/api/v1/media/{media.id}/keyframe/{item['keyframe_id']}/thumbnail",
                "thumbnail_url": f"/api/v1/media/{media.id}/thumbnail?size=256",
                "category": media.category,
                "captured_at": media.captured_at,
                "location_name": media.location_name
            })

    return enriched
