import os
import logging
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Set, Tuple
from sqlalchemy.orm import Session
from sqlalchemy import func, desc

from app.models.media import Media, MediaCategory
from app.models.person import FaceDetection

logger = logging.getLogger("memorypics.burst_engine")

def phash_distance(h1: Optional[str], h2: Optional[str]) -> int:
    """Calculates Hamming distance between two hexadecimal perceptual hashes."""
    if not h1 or not h2:
        return 99
    try:
        val1 = int(h1, 16)
        val2 = int(h2, 16)
        return bin(val1 ^ val2).count('1')
    except Exception:
        return 99

def calculate_photo_quality(media: Media) -> Dict[str, Any]:
    """
    Computes technical quality and composite score for ranking burst photos:
    - Sharpness score (Laplacian variance, normalized 0-100)
    - Facial expression & Smile bonus (0-100)
    - Resolution & Detail score (0-100)
    - Favorite preference bonus
    """
    # 1. Sharpness score
    raw_blur = float(media.blurriness_score or 0.0)
    # Scaled so that blurriness_score 250 -> 100
    sharpness = min(100.0, max(5.0, raw_blur / 2.5))
    if getattr(media, "is_bokeh", False):
        sharpness = max(sharpness, 85.0)  # Portrait mode bokeh has sharp subject focus
    elif media.is_blurry:
        sharpness *= 0.35  # Severe penalty for photos marked blurry

    # 2. Expression & Smile score
    expression = 50.0  # Neutral baseline
    if media.is_smiling:
        expression = 100.0
    elif media.mood == "joyful":
        expression = 85.0
    elif media.mood in ("celebratory", "serene", "adventurous"):
        expression = 70.0

    # 3. Resolution score
    width = media.width or 1000
    height = media.height or 1000
    megapixels = (width * height) / 1_000_000.0
    # Scaled so that 12MP -> 100
    resolution = min(100.0, max(10.0, megapixels * 8.33))

    # 4. Favorite preference
    favorite_bonus = 30.0 if media.is_favorite else 0.0

    # Weighted Composite Score (0 - 100)
    # Focus / Sharpness: 45%
    # Expression / Smile: 30%
    # Resolution / Detail: 15%
    # User Favorite: 10%
    composite = (
        0.45 * sharpness +
        0.30 * expression +
        0.15 * resolution +
        0.10 * favorite_bonus
    )
    composite = min(100.0, max(0.0, composite))

    return {
        "sharpness_score": round(sharpness, 1),
        "expression_score": round(expression, 1),
        "resolution_score": round(resolution, 1),
        "composite_score": round(composite, 1),
        "raw_blurriness": round(raw_blur, 1),
        "is_smiling": bool(media.is_smiling),
        "is_blurry": bool(media.is_blurry),
        "is_bokeh": bool(getattr(media, "is_bokeh", False)),
        "blur_type": getattr(media, "blur_type", "sharp") or "sharp",
        "is_favorite": bool(media.is_favorite),
    }

def detect_burst_clusters(
    db: Session,
    max_time_gap_seconds: float = 4.0,
    max_phash_distance: int = 6,
    category: Optional[MediaCategory] = None,
    user_id: Optional[int] = None
) -> List[Dict[str, Any]]:
    """
    Identifies all burst sequences and visual duplicate clusters across active media.
    Groups photos that either:
      1. Were taken within a rapid burst window (<= max_time_gap_seconds)
      2. Have perceptual near-duplicate hashes (Hamming distance <= max_phash_distance)
    
    Returns clusters ordered chronologically with items ranked by AI Best Shot score.
    Strictly isolated by user_id to prevent multi-tenant data leaks.
    """
    if user_id is None:
        return []

    query = db.query(Media).filter(
        Media.user_id == user_id,
        Media.is_deleted == False,
        Media.is_archived == False
    )
    if category:
        query = query.filter(Media.category == category)

    items = query.order_by(Media.captured_at.asc().nullslast()).all()
    if not items:
        return []

    # Build adjacency graph
    adj: Dict[int, Set[int]] = {m.id: set() for m in items}

    # 1. Connect rapid chronological bursts
    for i in range(len(items) - 1):
        m1 = items[i]
        m2 = items[i + 1]
        if m1.captured_at and m2.captured_at:
            delta = (m2.captured_at - m1.captured_at).total_seconds()
            if 0 <= delta <= max_time_gap_seconds:
                # Same camera, near pHash, or rapid interval <= 2.5s
                dist = phash_distance(m1.perceptual_hash, m2.perceptual_hash)
                same_cam = (m1.camera_model and m1.camera_model == m2.camera_model)
                if delta <= 2.5 or dist <= 12 or same_cam:
                    adj[m1.id].add(m2.id)
                    adj[m2.id].add(m1.id)

    # 2. Connect perceptual near-duplicates (regardless of timestamp)
    phash_items = [m for m in items if m.perceptual_hash]
    for i in range(len(phash_items)):
        for j in range(i + 1, min(len(phash_items), i + 40)):  # Compare with nearby pHashes
            dist = phash_distance(phash_items[i].perceptual_hash, phash_items[j].perceptual_hash)
            if dist <= max_phash_distance:
                adj[phash_items[i].id].add(phash_items[j].id)
                adj[phash_items[j].id].add(phash_items[i].id)

    # 3. Extract connected components
    visited: Set[int] = set()
    raw_clusters: List[List[Media]] = []
    id_to_item = {m.id: m for m in items}

    for m in items:
        if m.id in visited:
            continue
        comp: List[int] = []
        stack = [m.id]
        visited.add(m.id)
        while stack:
            curr = stack.pop()
            comp.append(curr)
            for neighbor in adj.get(curr, []):
                if neighbor not in visited:
                    visited.add(neighbor)
                    stack.append(neighbor)
        if len(comp) > 1:
            raw_clusters.append([id_to_item[x] for x in comp])

    # 4. Format and rank each cluster
    formatted_clusters = []
    for c_items in raw_clusters:
        # Sort items by timestamp ascending
        c_items.sort(key=lambda x: x.captured_at if x.captured_at else datetime.min)
        
        # Calculate scores for all items
        scored_items = []
        for m in c_items:
            q = calculate_photo_quality(m)
            scored_items.append({
                "id": m.id,
                "filename": m.filename,
                "file_size": m.file_size or 0,
                "width": m.width or 0,
                "height": m.height or 0,
                "captured_at": m.captured_at.isoformat() if m.captured_at else None,
                "camera_model": m.camera_model,
                "perceptual_hash": m.perceptual_hash,
                "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256",
                "preview_url": f"/api/v1/media/{m.id}/thumbnail?size=1080",
                "sharpness_score": q["sharpness_score"],
                "expression_score": q["expression_score"],
                "resolution_score": q["resolution_score"],
                "composite_score": q["composite_score"],
                "raw_blurriness": q["raw_blurriness"],
                "is_smiling": q["is_smiling"],
                "is_blurry": q["is_blurry"],
                "is_favorite": q["is_favorite"],
                "is_best_shot": False
            })

        # Rank: highest composite score is the Best Shot
        scored_items.sort(
            key=lambda x: (x["composite_score"], x["sharpness_score"], x["width"] * x["height"], x["id"]),
            reverse=True
        )
        scored_items[0]["is_best_shot"] = True
        best_shot_id = scored_items[0]["id"]

        # Calculate cluster duration
        t_first = c_items[0].captured_at
        t_last = c_items[-1].captured_at
        duration = (t_last - t_first).total_seconds() if (t_first and t_last) else 0.0
        
        cluster_type = "burst" if (duration <= (max_time_gap_seconds * len(c_items)) and duration < 30.0) else "duplicate"
        
        # Calculate reclaimable disk space (all items except best shot)
        reclaimable_bytes = sum(it["file_size"] for it in scored_items if it["id"] != best_shot_id)

        # Min and max id for stable cluster ID
        min_id = min(m.id for m in c_items)
        max_id = max(m.id for m in c_items)
        cluster_id = f"{cluster_type}_{min_id}_{max_id}"

        formatted_clusters.append({
            "id": cluster_id,
            "cluster_type": cluster_type,
            "count": len(scored_items),
            "duration_seconds": round(duration, 2),
            "best_shot_id": best_shot_id,
            "captured_at": c_items[0].captured_at.isoformat() if c_items[0].captured_at else None,
            "reclaimable_bytes": reclaimable_bytes,
            "reclaimable_mb": round(reclaimable_bytes / (1024 * 1024), 2),
            "items": scored_items
        })

    # Sort clusters chronologically descending
    formatted_clusters.sort(
        key=lambda c: c["captured_at"] or "",
        reverse=True
    )

    return formatted_clusters

def get_burst_for_media(db: Session, media_id: int, user_id: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """Returns the burst/duplicate cluster containing the specified media ID, or None."""
    media = db.query(Media).filter(Media.id == media_id).first()
    if not media:
        return None
    uid = user_id if user_id is not None else media.user_id

    # 1. Gather localized candidates for lightning-fast (<30ms) cluster extraction
    candidate_ids = {media.id}
    candidates = [media]

    if media.captured_at:
        w_start = media.captured_at - timedelta(seconds=20)
        w_end = media.captured_at + timedelta(seconds=20)
        time_matches = db.query(Media).filter(
            Media.user_id == uid,
            Media.is_deleted == False,
            Media.is_archived == False,
            Media.captured_at >= w_start,
            Media.captured_at <= w_end
        ).all()
        for m in time_matches:
            if m.id not in candidate_ids:
                candidate_ids.add(m.id)
                candidates.append(m)

    if media.perceptual_hash:
        phash_matches = db.query(Media).filter(
            Media.user_id == uid,
            Media.is_deleted == False,
            Media.is_archived == False,
            Media.perceptual_hash == media.perceptual_hash
        ).all()
        for m in phash_matches:
            if m.id not in candidate_ids:
                candidate_ids.add(m.id)
                candidates.append(m)

    if len(candidates) <= 1:
        # Fallback to full cluster scan if localized didn't yield anything
        clusters = detect_burst_clusters(db, user_id=uid)
        for c in clusters:
            for it in c["items"]:
                if it["id"] == media_id:
                    return c
        return None

    # Sort chronologically
    candidates.sort(key=lambda m: m.captured_at or media.captured_at)

    # Build graph
    adj: Dict[int, Set[int]] = {m.id: set() for m in candidates}
    for i in range(len(candidates)):
        m1 = candidates[i]
        for j in range(i + 1, len(candidates)):
            m2 = candidates[j]
            # Time delta check
            if m1.captured_at and m2.captured_at:
                delta = abs((m2.captured_at - m1.captured_at).total_seconds())
                dist = phash_distance(m1.perceptual_hash, m2.perceptual_hash)
                same_cam = (m1.camera_model and m1.camera_model == m2.camera_model)
                if delta <= 2.5 or (delta <= 4.0 and (dist <= 12 or same_cam)):
                    adj[m1.id].add(m2.id)
                    adj[m2.id].add(m1.id)
            # pHash duplicate check
            dist = phash_distance(m1.perceptual_hash, m2.perceptual_hash)
            if dist <= 6:
                adj[m1.id].add(m2.id)
                adj[m2.id].add(m1.id)

    # Traverse from target media_id
    if not adj.get(media.id):
        clusters = detect_burst_clusters(db, user_id=uid)
        for c in clusters:
            for it in c["items"]:
                if it["id"] == media_id:
                    return c
        return None

    component_ids = set()
    queue = [media.id]
    while queue:
        curr = queue.pop(0)
        if curr not in component_ids:
            component_ids.add(curr)
            for neighbor in adj.get(curr, []):
                if neighbor not in component_ids:
                    queue.append(neighbor)

    if len(component_ids) <= 1:
        return None

    c_items = [m for m in candidates if m.id in component_ids]
    c_items.sort(key=lambda m: m.captured_at or media.captured_at)

    # Determine cluster type
    is_burst = False
    for i in range(len(c_items) - 1):
        if c_items[i].captured_at and c_items[i+1].captured_at:
            if abs((c_items[i+1].captured_at - c_items[i].captured_at).total_seconds()) <= 4.0:
                is_burst = True
                break
    cluster_type = 'burst' if is_burst else 'duplicate'

    # Score items & rank
    scored_items = []
    for item in c_items:
        q = calculate_photo_quality(item)
        scored_items.append({
            'id': item.id,
            'filename': item.filename,
            'file_size': item.file_size or 0,
            'width': item.width or 0,
            'height': item.height or 0,
            'captured_at': item.captured_at.isoformat() if item.captured_at else None,
            'camera_model': item.camera_model,
            'perceptual_hash': item.perceptual_hash,
            'thumbnail_url': f'/api/v1/media/{item.id}/thumbnail?size=256',
            'preview_url': f'/api/v1/media/{item.id}/thumbnail?size=1080',
            **q,
            'is_best_shot': False
        })
    scored_items.sort(key=lambda x: x['composite_score'], reverse=True)
    best_shot_id = scored_items[0]['id']
    for item in scored_items:
        if item['id'] == best_shot_id:
            item['is_best_shot'] = True

    reclaimable_bytes = sum(it['file_size'] for it in scored_items if it['id'] != best_shot_id)
    duration = 0.0
    if c_items[0].captured_at and c_items[-1].captured_at:
        duration = abs((c_items[-1].captured_at - c_items[0].captured_at).total_seconds())

    return {
        'id': f'{cluster_type}_{c_items[0].id}_{c_items[-1].id}',
        'cluster_type': cluster_type,
        'count': len(scored_items),
        'duration_seconds': round(duration, 2),
        'best_shot_id': best_shot_id,
        'captured_at': c_items[0].captured_at.isoformat() if c_items[0].captured_at else None,
        'reclaimable_bytes': reclaimable_bytes,
        'reclaimable_mb': round(reclaimable_bytes / (1024 * 1024), 2),
        'items': scored_items
    }

def resolve_burst_cluster(db: Session, keep_media_id: int, delete_media_ids: List[int]) -> Dict[str, Any]:
    """
    Safely resolves a burst cluster by soft-deleting the non-best shots.
    Adheres strictly to the Zero Auto-Deletion policy.
    """
    if not delete_media_ids:
        return {"status": "no_op", "count": 0, "reclaimed_bytes": 0}

    # Calculate reclaimed bytes
    reclaimed_bytes = db.query(func.sum(Media.file_size)).filter(
        Media.id.in_(delete_media_ids)
    ).scalar() or 0

    deleted_count = db.query(Media).filter(
        Media.id.in_(delete_media_ids)
    ).update({"is_deleted": True}, synchronize_session=False)
    
    db.commit()

    return {
        "status": "resolved",
        "kept_media_id": keep_media_id,
        "deleted_count": deleted_count,
        "reclaimed_bytes": reclaimed_bytes,
        "reclaimed_mb": round(reclaimed_bytes / (1024 * 1024), 2)
    }

def resolve_all_bursts(db: Session, user_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Auto-resolves all detected burst and duplicate clusters:
    Keeps each cluster's AI Best Shot and soft-deletes the remaining redundant copies.
    Strictly isolated by user_id to prevent multi-tenant data leaks.
    """
    if user_id is None:
        return {"status": "all_resolved", "resolved_clusters": 0, "deleted_shots": 0, "reclaimed_bytes": 0, "reclaimed_mb": 0.0}

    clusters = detect_burst_clusters(db, user_id=user_id)
    total_deleted = 0
    total_reclaimed = 0
    resolved_clusters = 0

    for c in clusters:
        best_id = c["best_shot_id"]
        to_delete = [it["id"] for it in c["items"] if it["id"] != best_id]
        if not to_delete:
            continue

        reclaimed = db.query(func.sum(Media.file_size)).filter(
            Media.id.in_(to_delete)
        ).scalar() or 0

        del_cnt = db.query(Media).filter(
            Media.id.in_(to_delete)
        ).update({"is_deleted": True}, synchronize_session=False)

        total_deleted += del_cnt
        total_reclaimed += reclaimed
        resolved_clusters += 1

    db.commit()

    return {
        "status": "all_resolved",
        "resolved_clusters": resolved_clusters,
        "deleted_shots": total_deleted,
        "reclaimed_bytes": total_reclaimed,
        "reclaimed_mb": round(total_reclaimed / (1024 * 1024), 2)
    }
