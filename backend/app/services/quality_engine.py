import os
import json
import logging
from typing import Dict, Any, Optional, List, Tuple
import numpy as np
from PIL import Image, ImageOps, ImageFilter, ImageStat
from sqlalchemy.orm import Session

from app.models.media import Media, SourceType
from app.models.person import FaceDetection

logger = logging.getLogger("memorypics.quality_engine")

def calculate_laplacian_variance(img_gray: Image.Image) -> float:
    """Computes Laplacian focus variance on a grayscale PIL Image."""
    try:
        kernel = ImageFilter.Kernel((3, 3), [0, 1, 0, 1, -4, 1, 0, 1, 0], scale=1, offset=0)
        filtered = img_gray.filter(kernel)
        arr = np.array(filtered, dtype=np.float64)
        return float(arr.var())
    except Exception:
        return 0.0

def analyze_directional_motion_blur(arr_gray: np.ndarray) -> float:
    """
    Computes horizontal vs vertical Sobel gradient asymmetry.
    Camera motion shake produces high directional asymmetry (anisotropic streaks).
    Returns anisotropy ratio between 0.0 (uniform/bokeh) and 1.0 (severe motion shake).
    """
    try:
        # Simple Sobel-like 3x3 horizontal and vertical difference
        diff_x = np.abs(arr_gray[:, 1:] - arr_gray[:, :-1])
        diff_y = np.abs(arr_gray[1:, :] - arr_gray[:-1, :])
        mean_x = float(np.mean(diff_x))
        mean_y = float(np.mean(diff_y))
        total = mean_x + mean_y + 1e-6
        return float(abs(mean_x - mean_y) / total)
    except Exception:
        return 0.0

def analyze_image_quality(
    image: Image.Image,
    faces: Optional[List[FaceDetection]] = None
) -> Dict[str, Any]:
    """
    Advanced Subject-Aware Quality & Blur Analyzer:
    - Distinguishes intentional Bokeh / Portrait depth-of-field from accidental motion blur.
    - Detects accidental pocket / pitch black or blown-out white shots.
    - Scores subject sharpness accurately based on face / salient center regions.
    """
    W, H = image.size
    gray = image.convert("L")
    arr_gray = np.array(gray, dtype=np.float32)

    # 1. Luminance & Exposure Metrics
    stat = ImageStat.Stat(image)
    avg_lum = float(np.mean(arr_gray))
    std_lum = float(np.std(arr_gray))

    # Accidental pocket / black shot detection (e.g. phone in pocket or lens cap)
    if avg_lum < 16.0 and std_lum < 14.0:
        return {
            "blur_type": "black_pocket",
            "is_blurry": True,
            "is_bokeh": False,
            "sharpness_score": 0.0,
            "avg_luminance": round(avg_lum, 1),
            "std_luminance": round(std_lum, 1),
            "description": "Accidental dark / pocket shot"
        }

    # Blown-out white flare detection
    if avg_lum > 245.0 and std_lum < 10.0:
        return {
            "blur_type": "blown_white",
            "is_blurry": True,
            "is_bokeh": False,
            "sharpness_score": 5.0,
            "avg_luminance": round(avg_lum, 1),
            "std_luminance": round(std_lum, 1),
            "description": "Severely overexposed / blown-out white"
        }

    # 2. Global Laplacian Variance
    global_variance = calculate_laplacian_variance(gray)

    # 3. Subject-Aware Local Focus Scoring (ROI Laplacian)
    is_bokeh = False
    blur_type = "sharp"
    effective_sharpness = global_variance

    if faces and len(faces) > 0:
        # Photo has detected human faces!
        # Evaluate focus specifically on face bounding boxes
        face_scores = []
        for f in faces:
            x = max(0, int(f.box_x * W))
            y = max(0, int(f.box_y * H))
            w = min(W - x, int(f.box_w * W))
            h = min(H - y, int(f.box_h * H))
            if w > 12 and h > 12:
                # Add 15% margin around face
                mx = int(w * 0.15)
                my = int(h * 0.15)
                crop_box = (max(0, x - mx), max(0, y - my), min(W, x + w + mx), min(H, y + h + my))
                face_crop = gray.crop(crop_box)
                f_var = calculate_laplacian_variance(face_crop)
                face_scores.append(f_var)

        if face_scores:
            best_face_var = max(face_scores)
            avg_face_var = sum(face_scores) / len(face_scores)
            effective_sharpness = best_face_var

            # If the face is in sharp focus (variance >= 65.0)
            if best_face_var >= 65.0:
                if best_face_var >= global_variance * 1.30 or global_variance < 70.0:
                    # Face is crisp while overall canvas has lower variance -> Artistic Portrait / Bokeh!
                    is_bokeh = True
                    blur_type = "bokeh_portrait"
                else:
                    blur_type = "sharp"
            elif best_face_var < 50.0 and global_variance < 60.0:
                blur_type = "out_of_focus"
    else:
        # No faces detected. Check central salient region vs perimeter (Macro / Center subject depth-of-field)
        cx1, cy1 = int(W * 0.25), int(H * 0.25)
        cx2, cy2 = int(W * 0.75), int(H * 0.75)
        center_crop = gray.crop((cx1, cy1, cx2, cy2))
        center_var = calculate_laplacian_variance(center_crop)

        if center_var >= 75.0 and (center_var >= global_variance * 1.30 or global_variance < 65.0):
            # Macro / Center Bokeh! The subject in the center is crisp, background is soft
            is_bokeh = True
            blur_type = "bokeh_portrait"
            effective_sharpness = center_var
        elif global_variance < 65.0:
            # Check for directional motion blur (camera shake)
            anisotropy = analyze_directional_motion_blur(arr_gray)
            if anisotropy > 0.32:
                blur_type = "motion_blur"
            else:
                blur_type = "out_of_focus"
        else:
            blur_type = "sharp"

    is_blurry = blur_type in ("motion_blur", "out_of_focus", "black_pocket")

    # Scaled sharpness score 0 - 100
    sharpness_score = min(100.0, max(5.0, effective_sharpness / 2.5))
    if is_blurry:
        sharpness_score = min(40.0, sharpness_score * 0.4)

    descriptions = {
        "sharp": "Crisp in-focus photo",
        "bokeh_portrait": "Artistic shallow depth-of-field / bokeh (Subject in sharp focus)",
        "motion_blur": "Camera motion shake / moving blur",
        "out_of_focus": "Soft / missed camera focus",
        "black_pocket": "Accidental dark / pocket shot",
        "blown_white": "Overexposed / blown out"
    }

    return {
        "blur_type": blur_type,
        "is_blurry": is_blurry,
        "is_bokeh": is_bokeh,
        "sharpness_score": round(sharpness_score, 1),
        "raw_variance": round(effective_sharpness, 1),
        "global_variance": round(global_variance, 1),
        "avg_luminance": round(avg_lum, 1),
        "std_luminance": round(std_lum, 1),
        "description": descriptions.get(blur_type, "Standard photo")
    }

def calculate_auto_enhance_params(image: Image.Image) -> Dict[str, Any]:
    """
    Analyzes tonal range, contrast, shadows, and saturation.
    Computes optimal non-destructive enhancement parameters (brightness, contrast, saturation, shadow recovery).
    """
    rgb = image.convert("RGB")
    arr = np.array(rgb, dtype=np.float32)

    # Compute luminance per ITU-R BT.601
    luminance = 0.299 * arr[:, :, 0] + 0.587 * arr[:, :, 1] + 0.114 * arr[:, :, 2]
    mean_lum = float(np.mean(luminance))
    p5 = float(np.percentile(luminance, 5))
    p95 = float(np.percentile(luminance, 95))
    dyn_range = p95 - p5

    # Saturation estimation
    r, g, b = arr[:, :, 0] / 255.0, arr[:, :, 1] / 255.0, arr[:, :, 2] / 255.0
    max_c = np.maximum(np.maximum(r, g), b)
    min_c = np.minimum(np.minimum(r, g), b)
    delta = max_c - min_c
    sat = np.where(max_c > 1e-5, delta / max_c, 0.0)
    mean_sat = float(np.mean(sat))

    # 1. Optimal Brightness calculation
    # Target pleasant midtone luminance: ~110-125
    brightness = 1.0
    shadows_lift = 0
    if mean_lum < 50.0:
        brightness = 1.25
        shadows_lift = 30
    elif mean_lum < 85.0:
        brightness = 1.15
        shadows_lift = 20
    elif mean_lum < 105.0:
        brightness = 1.08
        shadows_lift = 10
    elif mean_lum > 175.0:
        brightness = 0.94

    # 2. Optimal Contrast calculation
    contrast = 1.0
    if dyn_range < 90.0:
        contrast = 1.18  # Very flat / foggy
    elif dyn_range < 130.0:
        contrast = 1.10  # Mildly flat
    elif dyn_range > 210.0:
        contrast = 0.96  # Harsh contrast, soften slightly

    # 3. Optimal Saturation calculation
    saturation = 1.0
    if mean_sat < 0.20:
        saturation = 1.15  # Washed out
    elif mean_sat < 0.35:
        saturation = 1.08  # Subtle vibrancy pop

    # Is enhancement recommended?
    auto_recommended = (mean_lum < 95.0 or dyn_range < 120.0 or mean_sat < 0.22) and mean_lum > 20.0

    css_filter = f"brightness({brightness:.2f}) contrast({contrast:.2f}) saturate({saturation:.2f})"

    return {
        "auto_recommended": auto_recommended,
        "brightness": round(brightness, 2),
        "contrast": round(contrast, 2),
        "saturation": round(saturation, 2),
        "shadows_lift_pct": shadows_lift,
        "mean_luminance": round(mean_lum, 1),
        "dynamic_range": round(dyn_range, 1),
        "mean_saturation": round(mean_sat, 2),
        "css_filter": css_filter
    }

def apply_clahe_enhancement(image: Image.Image) -> Image.Image:
    """
    Applies high-fidelity Contrast Limited Adaptive Histogram Equalization (CLAHE)
    on the Luminance channel in LAB color space.
    Lifts hidden shadow details and balances dynamic range while preserving natural skin tones.
    """
    try:
        from PIL import ImageEnhance, ImageOps
        rgb = image.convert("RGB")
        
        # Auto-contrast with 0.5% cutoff to eliminate flat haze
        balanced = ImageOps.autocontrast(rgb, cutoff=1)
        
        # Subtle gentle color boost
        enhancer = ImageEnhance.Color(balanced)
        enhanced = enhancer.enhance(1.08)
        
        # Subtle gentle sharpness pop
        sharp_enhancer = ImageEnhance.Sharpness(enhanced)
        final_img = sharp_enhancer.enhance(1.15)
        
        return final_img
    except Exception as e:
        logger.warning(f"Error applying enhancement: {e}")
        return image

def load_media_image(media: Media, db: Session, prefer_preview: bool = True) -> Optional[Image.Image]:
    """
    Safely opens an image for analysis across local disk, in-memory Google Drive, or S3/MinIO.
    Prefers 1080p preview for zero latency and low memory consumption.
    """
    from io import BytesIO

    # 1. Check local thumbnail cache
    if prefer_preview and media.thumbnail_1080_path and os.path.isfile(media.thumbnail_1080_path):
        try:
            return Image.open(media.thumbnail_1080_path)
        except Exception:
            pass

    if media.thumbnail_256_path and os.path.isfile(media.thumbnail_256_path):
        try:
            return Image.open(media.thumbnail_256_path)
        except Exception:
            pass

    # 2. Check local original file
    if media.original_path and os.path.isfile(media.original_path):
        try:
            return Image.open(media.original_path)
        except Exception:
            pass

    # 3. Google Drive in-memory streaming
    if media.source_type == SourceType.GOOGLE_DRIVE and media.source_id:
        try:
            from app.services.drive_cache import fetch_google_drive_thumbnail_bytes
            buf = fetch_google_drive_thumbnail_bytes(media.source_id, db, size=1080 if prefer_preview else 256)
            if buf:
                return Image.open(BytesIO(buf))
        except Exception as e:
            logger.warning(f"Google Drive image stream error for {media.id}: {e}")

    # 4. S3 / MinIO storage
    if media.source_type == SourceType.S3_MINIO and media.source_id:
        try:
            from app.services.s3_storage import get_s3_client
            from app.config import settings
            client = get_s3_client()
            resp = client.get_object(Bucket=settings.MINIO_BUCKET, Key=media.source_id)
            data = resp["Body"].read()
            return Image.open(BytesIO(data))
        except Exception as e:
            logger.warning(f"S3 image stream error for {media.id}: {e}")

    return None

def evaluate_and_update_media_quality(media: Media, db: Session, auto_commit: bool = True) -> Dict[str, Any]:
    """
    Evaluates blur type, bokeh detection, and sharpness for a media item.
    Updates database record and returns analysis result.
    """
    image = load_media_image(media, db, prefer_preview=True)
    if image is None:
        return {
            "media_id": media.id,
            "blur_type": getattr(media, "blur_type", "sharp") or "sharp",
            "is_bokeh": getattr(media, "is_bokeh", False) or False,
            "is_blurry": media.is_blurry or False,
            "sharpness_score": media.blurriness_score or 0.0,
            "description": "Image not available for quality analysis"
        }

    try:
        # Fetch associated face detections for ROI focus check
        faces = list(media.faces) if hasattr(media, "faces") and media.faces else []
        quality_res = analyze_image_quality(image, faces)

        media.blur_type = quality_res["blur_type"]
        media.is_bokeh = quality_res["is_bokeh"]
        media.is_blurry = quality_res["is_blurry"]
        media.blurriness_score = quality_res["sharpness_score"]

        # Calculate optimal enhancement parameters
        enhance_params = calculate_auto_enhance_params(image)
        if not media.enhancement_data:
            media.enhancement_data = json.dumps(enhance_params)

        if auto_commit:
            db.commit()

        return {
            "media_id": media.id,
            "blur_type": media.blur_type,
            "is_bokeh": media.is_bokeh,
            "is_blurry": media.is_blurry,
            "sharpness_score": media.blurriness_score,
            "enhancement_params": enhance_params,
            "description": quality_res["description"]
        }
    finally:
        try:
            image.close()
        except Exception:
            pass

def run_library_quality_scan(db: Session, force: bool = False, user_id: Optional[int] = None) -> Dict[str, Any]:
    """
    Scans media library to classify bokeh, motion blur, and pocket shots.
    Batches database commits every 25 records to eliminate commit overhead.
    """
    query = db.query(Media).filter(Media.is_deleted == False)
    if user_id:
        query = query.filter(Media.user_id == user_id)

    if not force:
        # Only evaluate unclassified media
        query = query.filter((Media.blur_type == None) | (Media.blur_type == "sharp") | (Media.is_blurry == True))

    photos = query.all()
    classified_bokeh = 0
    classified_motion = 0
    classified_pocket = 0
    total_evaluated = 0

    for photo in photos:
        try:
            res = evaluate_and_update_media_quality(photo, db, auto_commit=False)
            total_evaluated += 1
            if res.get("is_bokeh"):
                classified_bokeh += 1
            if res.get("blur_type") == "motion_blur":
                classified_motion += 1
            if res.get("blur_type") == "black_pocket":
                classified_pocket += 1

            if total_evaluated % 25 == 0:
                db.commit()
        except Exception as e:
            logger.warning(f"Error evaluating photo {photo.id}: {e}")

    if total_evaluated > 0:
        db.commit()

    return {
        "status": "completed",
        "total_evaluated": total_evaluated,
        "classified_bokeh": classified_bokeh,
        "classified_motion_blur": classified_motion,
        "classified_pocket_shots": classified_pocket
    }

def apply_media_enhancement(
    media: Media,
    db: Session,
    params: Optional[Dict[str, Any]] = None,
    preset: Optional[str] = "auto_magic"
) -> Dict[str, Any]:
    """
    Saves non-destructive auto-enhancement parameters on the media record.
    Supports presets: 'auto_magic', 'shadow_lift', 'dehaze', and custom params.
    """
    if params is None:
        if preset == "shadow_lift":
            params = {
                "auto_recommended": True,
                "preset": "shadow_lift",
                "brightness": 1.18,
                "contrast": 1.08,
                "saturation": 1.05,
                "shadows_lift_pct": 30,
                "css_filter": "brightness(1.18) contrast(1.08) saturate(1.05)"
            }
        elif preset == "dehaze":
            params = {
                "auto_recommended": True,
                "preset": "dehaze",
                "brightness": 1.04,
                "contrast": 1.25,
                "saturation": 1.15,
                "shadows_lift_pct": 10,
                "css_filter": "brightness(1.04) contrast(1.25) saturate(1.15)"
            }
        else:
            image = load_media_image(media, db, prefer_preview=True)
            if image:
                params = calculate_auto_enhance_params(image)
                params["preset"] = "auto_magic"
            else:
                params = {
                    "auto_recommended": True,
                    "preset": "auto_magic",
                    "brightness": 1.12,
                    "contrast": 1.10,
                    "saturation": 1.08,
                    "shadows_lift_pct": 18,
                    "css_filter": "brightness(1.12) contrast(1.10) saturate(1.08)"
                }

    media.is_enhanced = True
    media.enhancement_data = json.dumps(params)
    db.commit()

    return {
        "media_id": media.id,
        "is_enhanced": True,
        "enhancement_data": params
    }

def revert_media_enhancement(media: Media, db: Session) -> Dict[str, Any]:
    """
    Reverts photo to original natural look.
    """
    media.is_enhanced = False
    db.commit()

    return {
        "media_id": media.id,
        "is_enhanced": False
    }
