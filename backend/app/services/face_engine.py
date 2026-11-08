import os
import io
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from PIL import Image, ImageFile
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.config import settings
from app.models.media import Media, MediaCategory
from app.models.person import Person, FaceDetection

logger = logging.getLogger("memorypics.face_engine")

Image.MAX_IMAGE_PIXELS = None
ImageFile.LOAD_TRUNCATED_IMAGES = True

# Model Paths
MODEL_DIR = "/data/db/models" if os.path.exists("/data/db") else "/data/models"
os.makedirs(MODEL_DIR, exist_ok=True)
SCRFD_PATH = os.path.join(MODEL_DIR, "scrfd.onnx")
ARCFACE_PATH = os.path.join(MODEL_DIR, "arcface.onnx")
DETECTOR_PATH = os.path.join(MODEL_DIR, "version-RFB-320.onnx")
YOLO_PATH = os.path.join(MODEL_DIR, "yolov8n.onnx")

_scrfd_session = None
_detector_session = None
_arcface_session = None
_yolo_session = None

def ensure_models():
    """Ensures state-of-the-art ONNX models for SCRFD face detection and ArcFace biometrics are available on disk."""
    import urllib.request
    import zipfile
    
    os.makedirs(MODEL_DIR, exist_ok=True)
    
    # 1. InsightFace Buffalo_SC bundle contains SCRFD (det_500m.onnx) and ArcFace (w600k_mbf.onnx)
    if not os.path.exists(SCRFD_PATH) or not os.path.exists(ARCFACE_PATH):
        logger.info("Downloading state-of-the-art InsightFace models (SCRFD + ArcFace)...")
        try:
            url = "https://github.com/deepinsight/insightface/releases/download/v0.7/buffalo_sc.zip"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (MemoryPics FaceEngine)"})
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = resp.read()
            with zipfile.ZipFile(io.BytesIO(data)) as zf:
                if not os.path.exists(SCRFD_PATH) and "det_500m.onnx" in zf.namelist():
                    with open(SCRFD_PATH, "wb") as f:
                        f.write(zf.read("det_500m.onnx"))
                    logger.info(f"SCRFD face detector saved to {SCRFD_PATH}")
                if not os.path.exists(ARCFACE_PATH) and "w600k_mbf.onnx" in zf.namelist():
                    with open(ARCFACE_PATH, "wb") as f:
                        f.write(zf.read("w600k_mbf.onnx"))
                    logger.info(f"ArcFace biometric model saved to {ARCFACE_PATH}")
        except Exception as e:
            logger.error(f"Failed to auto-download InsightFace models: {e}")

    # 2. UltraFace fallback detector
    if not os.path.exists(DETECTOR_PATH):
        logger.info(f"Downloading UltraFace fallback detector model to {DETECTOR_PATH}...")
        try:
            url = "https://raw.githubusercontent.com/Linzaer/Ultra-Light-Fast-Generic-Face-Detector-1MB/master/models/onnx/version-RFB-320.onnx"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (MemoryPics FaceEngine)"})
            with urllib.request.urlopen(req, timeout=30) as resp, open(DETECTOR_PATH, "wb") as f:
                f.write(resp.read())
            logger.info("UltraFace fallback detector downloaded successfully.")
        except Exception as e:
            logger.error(f"Failed to auto-download UltraFace fallback model: {e}")

def get_scrfd_session():
    global _scrfd_session
    if _scrfd_session is not None:
        return _scrfd_session
    if not os.path.exists(SCRFD_PATH):
        ensure_models()
    if not os.path.exists(SCRFD_PATH):
        return None
    try:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        _scrfd_session = ort.InferenceSession(SCRFD_PATH, opts)
        return _scrfd_session
    except Exception as e:
        logger.error(f"Failed to load SCRFD detector model: {e}")
        return None

def get_detector_session():
    global _detector_session
    if _detector_session is not None:
        return _detector_session
    if not os.path.exists(DETECTOR_PATH):
        ensure_models()
    if not os.path.exists(DETECTOR_PATH):
        logger.warning(f"Face detector model not found at {DETECTOR_PATH}")
        return None
    try:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        _detector_session = ort.InferenceSession(DETECTOR_PATH, opts)
        return _detector_session
    except Exception as e:
        logger.error(f"Failed to load face detection model: {e}")
        return None

def get_arcface_session():
    global _arcface_session
    if _arcface_session is not None:
        return _arcface_session
    if not os.path.exists(ARCFACE_PATH):
        ensure_models()
    if not os.path.exists(ARCFACE_PATH):
        logger.warning(f"ArcFace model not found at {ARCFACE_PATH}")
        return None
    try:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        _arcface_session = ort.InferenceSession(ARCFACE_PATH, opts)
        return _arcface_session
    except Exception as e:
        logger.error(f"Failed to load ArcFace biometric model: {e}")
        return None

def get_yolo_session():
    global _yolo_session
    if _yolo_session is not None:
        return _yolo_session
    if not os.path.exists(YOLO_PATH):
        logger.debug(f"YOLOv8 pet model not found at {YOLO_PATH}")
        return None
    try:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        _yolo_session = ort.InferenceSession(YOLO_PATH, opts)
        return _yolo_session
    except Exception as e:
        logger.error(f"Failed to load YOLOv8 model: {e}")
        return None

def hard_nms(box_scores: np.ndarray, iou_threshold: float = 0.3, top_k: int = -1) -> np.ndarray:
    """Non-maximum suppression to eliminate overlapping bounding boxes."""
    if len(box_scores) == 0:
        return np.array([])
    scores = box_scores[:, -1]
    boxes = box_scores[:, :-1]
    picked = []
    indexes = np.argsort(scores)
    indexes = indexes[-top_k:] if top_k > 0 else indexes
    
    while len(indexes) > 0:
        current = indexes[-1]
        picked.append(current)
        if len(indexes) == 1:
            break
        current_box = boxes[current, :]
        indexes = indexes[:-1]
        rest_boxes = boxes[indexes, :]
        
        x1 = np.maximum(rest_boxes[:, 0], current_box[0])
        y1 = np.maximum(rest_boxes[:, 1], current_box[1])
        x2 = np.minimum(rest_boxes[:, 2], current_box[2])
        y2 = np.minimum(rest_boxes[:, 3], current_box[3])
        
        w = np.maximum(0.0, x2 - x1)
        h = np.maximum(0.0, y2 - y1)
        intersection = w * h
        
        area_current = (current_box[2] - current_box[0]) * (current_box[3] - current_box[1])
        area_rest = (rest_boxes[:, 2] - rest_boxes[:, 0]) * (rest_boxes[:, 3] - rest_boxes[:, 1])
        union = area_rest + area_current - intersection
        iou = intersection / np.maximum(union, 1e-6)
        
        indexes = indexes[iou <= iou_threshold]
        
    return box_scores[picked, :]

def load_media_image(media: Media, db: Session, prefer_preview: bool = True) -> Optional[Image.Image]:
    """Loads an image into a PIL Image object from local disk or in-memory cloud stream."""
    is_video = (media.mime_type and media.mime_type.startswith("video/")) or (
        media.original_path and os.path.splitext(media.original_path)[1].lower() in (
            '.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv',
            '.m4v', '.3gp', '.3g2', '.mpg', '.mpeg', '.ts', '.mts', '.m2ts', '.vob', '.ogv', '.asf'
        )
    )
    if is_video and not (media.thumbnail_1080_path or media.thumbnail_256_path):
        return None

    if prefer_preview and media.thumbnail_1080_path and os.path.isfile(media.thumbnail_1080_path):
        try:
            return Image.open(media.thumbnail_1080_path)
        except Exception:
            pass

    if not is_video and media.original_path and os.path.isfile(media.original_path):
        try:
            return Image.open(media.original_path)
        except Exception:
            pass

    if not prefer_preview and media.thumbnail_1080_path and os.path.isfile(media.thumbnail_1080_path):
        try:
            return Image.open(media.thumbnail_1080_path)
        except Exception:
            pass

    # S3 / MinIO storage
    source_type_str = str(media.source_type.value if hasattr(media.source_type, "value") else media.source_type)
    if source_type_str == "s3_minio" and media.source_id:
        try:
            from app.services.s3_storage import get_s3_bytes
            data = get_s3_bytes(media.source_id)
            if data:
                return Image.open(io.BytesIO(data))
        except Exception as e:
            logger.warning(f"Could not load S3 image for media #{media.id}: {e}")

    # Google Drive streaming
    if source_type_str == "google_drive" and media.source_id:
        try:
            from app.services.drive_cache import fetch_google_drive_thumbnail_bytes, download_drive_file_to_memory
            thumb_bytes = fetch_google_drive_thumbnail_bytes(media.source_id, db, size=1080)
            if thumb_bytes:
                return Image.open(io.BytesIO(thumb_bytes))
            buf = download_drive_file_to_memory(media.source_id, db)
            if buf:
                return Image.open(buf)
        except Exception as e:
            logger.warning(f"Could not load Google Drive image for media #{media.id}: {e}")

    return None

def detect_faces_scrfd(img: Image.Image, conf_threshold: float = 0.5) -> List[Dict[str, Any]]:
    """
    Runs InsightFace SCRFD 500M detector with Feature Pyramid Networks & 5-point facial landmark keypoints.
    State-of-the-art accuracy on small, rotated, and crowded faces.
    """
    sess = get_scrfd_session()
    if sess is None:
        return []

    try:
        orig_w, orig_h = img.size
        if orig_w == 0 or orig_h == 0:
            return []

        # 640x640 Feature Pyramid Network input
        target_size = (640, 640)
        resized = img.resize(target_size, Image.Resampling.BILINEAR)
        arr = np.array(resized).astype(np.float32)
        arr = arr[:, :, ::-1]  # RGB to BGR
        arr = (arr - 127.5) / 128.0
        arr = np.transpose(arr, (2, 0, 1))
        arr = np.expand_dims(arr, axis=0)

        outputs = sess.run(None, {"input.1": arr})
        strides = [8, 16, 32]
        num_anchors = 2

        scores_list = outputs[0:3]
        bboxes_list = outputs[3:6]
        kpss_list = outputs[6:9]

        proposals = []
        landmarks_list = []

        for idx, stride in enumerate(strides):
            scores = scores_list[idx]
            bboxes = bboxes_list[idx] * stride
            kpss = kpss_list[idx] * stride

            feat_h = target_size[1] // stride
            feat_w = target_size[0] // stride
            anchor_centers = np.stack(np.mgrid[:feat_h, :feat_w][::-1], axis=-1).astype(np.float32) * stride
            anchor_centers = np.repeat(anchor_centers.reshape((-1, 2)), num_anchors, axis=0)

            pos_inds = np.where(scores >= conf_threshold)[0]
            for p in pos_inds:
                cx, cy = anchor_centers[p]
                dx1, dy1, dx2, dy2 = bboxes[p]
                x1 = max(0.0, float(cx - dx1))
                y1 = max(0.0, float(cy - dy1))
                x2 = min(640.0, float(cx + dx2))
                y2 = min(640.0, float(cy + dy2))
                score = float(scores[p, 0])

                # 5 landmarks (x, y) normalized [0, 1]
                lm = (kpss[p].reshape((5, 2)) + np.array([cx, cy])) / 640.0

                proposals.append([x1 / 640.0, y1 / 640.0, x2 / 640.0, y2 / 640.0, score])
                landmarks_list.append(lm)

        if not proposals:
            return []

        proposals_arr = np.array(proposals)
        scores = proposals_arr[:, 4]
        boxes = proposals_arr[:, :4]
        indexes = np.argsort(scores)
        picked_indices = []

        while len(indexes) > 0:
            current = indexes[-1]
            picked_indices.append(current)
            if len(indexes) == 1:
                break
            indexes = indexes[:-1]
            rest_boxes = boxes[indexes, :]
            cur_box = boxes[current, :]

            x1 = np.maximum(rest_boxes[:, 0], cur_box[0])
            y1 = np.maximum(rest_boxes[:, 1], cur_box[1])
            x2 = np.minimum(rest_boxes[:, 2], cur_box[2])
            y2 = np.minimum(rest_boxes[:, 3], cur_box[3])

            w_int = np.maximum(0.0, x2 - x1)
            h_int = np.maximum(0.0, y2 - y1)
            intersection = w_int * h_int

            area_current = (cur_box[2] - cur_box[0]) * (cur_box[3] - cur_box[1])
            area_rest = (rest_boxes[:, 2] - rest_boxes[:, 0]) * (rest_boxes[:, 3] - rest_boxes[:, 1])
            iou = intersection / np.maximum(area_rest + area_current - intersection, 1e-6)
            indexes = indexes[iou <= 0.35]

        results = []
        for idx in picked_indices:
            p = proposals_arr[idx]
            bx = float(np.clip(p[0], 0.0, 1.0))
            by = float(np.clip(p[1], 0.0, 1.0))
            bw = float(np.clip(p[2] - bx, 0.015, 1.0 - bx))
            bh = float(np.clip(p[3] - by, 0.015, 1.0 - by))

            # Reject boxes with unviable aspect ratio (non-faces)
            aspect = (bw * orig_w) / max(bh * orig_h, 1.0)
            if aspect < 0.40 or aspect > 2.0:
                continue

            results.append({
                "box_x": round(bx, 4),
                "box_y": round(by, 4),
                "box_w": round(bw, 4),
                "box_h": round(bh, 4),
                "confidence": round(float(p[4]), 3),
                "landmarks": landmarks_list[idx]
            })

        return results
    except Exception as e:
        logger.error(f"SCRFD detection error: {e}")
        return []

def detect_faces_ultraface(img_rgb: Image.Image, conf_threshold: float = 0.70) -> List[Dict[str, Any]]:
    """Fallback UltraFace RFB-320 detector."""
    sess = get_detector_session()
    if sess is None:
        return []
    try:
        orig_w, orig_h = img_rgb.size
        resized = img_rgb.resize((320, 240))
        arr = np.array(resized).astype('float32')
        arr = (arr - 127.0) / 128.0
        arr = np.transpose(arr, (2, 0, 1))
        arr = np.expand_dims(arr, axis=0)

        confidences, boxes = sess.run(None, {'input': arr})
        probs = confidences[0, :, 1]
        raw_boxes = boxes[0]

        mask = probs > conf_threshold
        if not np.any(mask):
            return []

        subset_boxes = raw_boxes[mask]
        subset_probs = probs[mask].reshape(-1, 1)
        box_scores = np.hstack((subset_boxes, subset_probs))
        picked = hard_nms(box_scores, iou_threshold=0.3)

        results = []
        for row in picked:
            x1, y1, x2, y2, conf = row
            if conf < conf_threshold:
                continue
            bx = float(np.clip(x1, 0.0, 1.0))
            by = float(np.clip(y1, 0.0, 1.0))
            bw = float(np.clip(x2 - bx, 0.015, 1.0 - bx))
            bh = float(np.clip(y2 - by, 0.015, 1.0 - by))
            results.append({
                "box_x": round(bx, 4),
                "box_y": round(by, 4),
                "box_w": round(bw, 4),
                "box_h": round(bh, 4),
                "confidence": round(float(conf), 3),
                "landmarks": None
            })
        return results
    except Exception as e:
        logger.error(f"UltraFace fallback failed: {e}")
        return []

def align_face_crop(img: Image.Image, landmarks_norm: np.ndarray, output_size=(112, 112)) -> Optional[Image.Image]:
    """
    Warps and aligns face crop to standard ArcFace reference template using 5-point facial landmarks.
    Template coordinates: Left eye, Right eye, Nose tip, Left mouth corner, Right mouth corner.
    """
    try:
        import cv2
        W, H = img.size
        src_pts = (landmarks_norm * np.array([W, H], dtype=np.float32)).astype(np.float32)
        dst_pts = np.array([
            [38.2946, 51.6963],
            [73.5318, 51.5014],
            [56.0252, 71.7366],
            [41.5493, 92.3655],
            [70.7299, 92.2041]
        ], dtype=np.float32)

        M, _ = cv2.estimateAffinePartial2D(src_pts, dst_pts)
        if M is not None:
            img_np = np.array(img.convert("RGB"))
            warped = cv2.warpAffine(img_np, M, output_size, borderMode=cv2.BORDER_REFLECT)
            return Image.fromarray(warped)
    except Exception as e:
        logger.debug(f"Affine alignment error: {e}")
    return None

def detect_faces_in_image(image_input: Any, conf_threshold: float = 0.30) -> List[Dict[str, Any]]:
    """Runs state-of-the-art SCRFD detector, with automatic fallback to UltraFace."""
    if isinstance(image_input, Image.Image):
        img_rgb = image_input.convert('RGB')
    elif isinstance(image_input, str) and os.path.exists(image_input):
        with Image.open(image_input) as img:
            img_rgb = img.convert('RGB')
    else:
        return []

    # 1. Primary: SCRFD 500M (multi-scale with 5 facial landmarks)
    scrfd_results = detect_faces_scrfd(img_rgb, conf_threshold=conf_threshold)
    if scrfd_results:
        return scrfd_results

    # 2. Fallback: UltraFace RFB-320
    return detect_faces_ultraface(img_rgb, conf_threshold=max(0.65, conf_threshold))

def extract_arcface_embedding(face_crop: Image.Image) -> Optional[np.ndarray]:
    """Computes a 512-dimensional L2-normalized biometric face embedding using ArcFace."""
    sess = get_arcface_session()
    if sess is None:
        return None
    try:
        if face_crop.width < 20 or face_crop.height < 20:
            return None

        crop_112 = face_crop.convert("RGB").resize((112, 112), Image.Resampling.LANCZOS)
        arr = np.array(crop_112).astype("float32")
        arr = (arr - 127.5) / 128.0

        # Handle NCHW vs NHWC input dynamically
        inputs = sess.get_inputs()
        inp_name = inputs[0].name
        if len(inputs[0].shape) == 4 and inputs[0].shape[1] == 3:
            arr = np.transpose(arr, (2, 0, 1))
        arr = np.expand_dims(arr, axis=0)

        output = sess.run(None, {inp_name: arr})[0]
        raw_embedding = output[0]
        norm = float(np.linalg.norm(raw_embedding))

        # Rejection of zero, NaN, or completely degraded activations
        if norm < 0.1 or np.isnan(norm):
            logger.debug(f"Rejected crop with abnormal ArcFace activation norm: {norm:.2f}")
            return None

        embedding = raw_embedding / norm
        return embedding
    except Exception as e:
        logger.warning(f"ArcFace embedding extraction error: {e}")
        return None

def detect_pets_in_image(image_input: Any, conf_threshold: float = 0.45) -> List[Dict[str, Any]]:
    """Runs YOLOv8n ONNX to detect dogs and cats in an image."""
    sess = get_yolo_session()
    if sess is None:
        return []

    try:
        if isinstance(image_input, Image.Image):
            img_rgb = image_input.convert('RGB')
        elif isinstance(image_input, str) and os.path.exists(image_input):
            with Image.open(image_input) as img:
                img_rgb = img.convert('RGB')
        else:
            return []

        orig_w, orig_h = img_rgb.size
        if orig_w == 0 or orig_h == 0:
            return []

        resized = img_rgb.resize((640, 640))
        arr = np.array(resized).astype('float32') / 255.0
        arr = np.transpose(arr, (2, 0, 1))
        arr = np.expand_dims(arr, axis=0)

        out = sess.run(None, {'images': arr})[0]  # Shape: (1, 84, 8400)
        predictions = np.transpose(out[0], (1, 0))  # Shape: (8400, 84)

        boxes = predictions[:, 0:4]
        scores = predictions[:, 4:]

        cat_scores = scores[:, 15]
        dog_scores = scores[:, 16]

        pet_candidates = []
        for i in range(len(predictions)):
            c_score = float(cat_scores[i])
            d_score = float(dog_scores[i])
            best_pet_score = max(c_score, d_score)
            if best_pet_score >= conf_threshold:
                pet_type = "cat" if c_score > d_score else "dog"
                cx, cy, w, h = boxes[i]
                bx = max(0.0, float((cx - w / 2.0) / 640.0))
                by = max(0.0, float((cy - h / 2.0) / 640.0))
                bw = min(1.0 - bx, float(w / 640.0))
                bh = min(1.0 - by, float(h / 640.0))
                pet_candidates.append([bx, by, bx + bw, by + bh, best_pet_score, 1 if pet_type == "cat" else 2])

        if not pet_candidates:
            return []

        candidates_arr = np.array(pet_candidates)
        picked = hard_nms(candidates_arr[:, :5], iou_threshold=0.35)

        results = []
        for row in picked:
            x1, y1, x2, y2, conf = row
            orig_match = next((c for c in pet_candidates if abs(c[0] - x1) < 1e-4 and abs(c[1] - y1) < 1e-4), None)
            pet_type = "cat" if orig_match and orig_match[5] == 1 else "dog"
            bx = float(np.clip(x1, 0.0, 1.0))
            by = float(np.clip(y1, 0.0, 1.0))
            bw = float(np.clip(x2 - bx, 0.05, 1.0 - bx))
            bh = float(np.clip(y2 - by, 0.05, 1.0 - by))
            results.append({
                "box_x": round(bx, 4),
                "box_y": round(by, 4),
                "box_w": round(bw, 4),
                "box_h": round(bh, 4),
                "confidence": round(float(conf), 3),
                "pet_type": pet_type
            })
        return results
    except Exception as e:
        logger.error(f"Pet detection failed: {e}")
        return []

def process_faces_for_media(
    db: Session,
    media: Media,
    overwrite: bool = False,
    conf_threshold: Optional[float] = None
) -> List[FaceDetection]:
    """Detects faces & computes ArcFace 512-d embeddings for a photo (supports local and cloud in-memory)."""
    existing = db.query(FaceDetection).filter(FaceDetection.media_id == media.id).all()
    if existing and not overwrite:
        # Check if embeddings need computation
        updated = False
        img = None
        for f in existing:
            # Skip pet faces from ArcFace biometric embedding
            if f.person and f.person.is_pet:
                continue
            if not f.embedding_str:
                if img is None:
                    img = load_media_image(media, db, prefer_preview=True)
                if img:
                    crop = None
                    if getattr(f, "landmarks_str", None):
                        try:
                            lms = np.array([[float(c) for c in pt.split(":")] for pt in f.landmarks_str.split(",")])
                            crop = align_face_crop(img, lms)
                        except Exception:
                            crop = None
                    if crop is None:
                        W, H = img.size
                        cx = int((f.box_x + f.box_w / 2.0) * W)
                        cy = int((f.box_y + f.box_h / 2.0) * H)
                        half = int(max(f.box_w * W, f.box_h * H) * 0.65)
                        crop = img.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))
                    emb = extract_arcface_embedding(crop)
                    if emb is not None:
                        f.embedding_str = ",".join(f"{x:.5f}" for x in emb)
                        updated = True
        media.faces_scanned = True
        db.commit()
        return existing

    if existing and overwrite:
        for f in existing:
            db.delete(f)
        db.commit()

    img = load_media_image(media, db, prefer_preview=True)
    if img is None:
        media.faces_scanned = True
        db.commit()
        return []

    # Adaptive confidence threshold: screenshots and document previews often contain
    # smaller embedded portraits, profile avatars, or downscaled photos where SCRFD confidence is 0.25 - 0.45.
    if conf_threshold is None:
        is_screenshot_or_doc = (
            (hasattr(media, "category") and media.category in (MediaCategory.SCREENSHOT, MediaCategory.DOCUMENT_BILL))
            or (media.filename and any(k in media.filename.lower() for k in ("screenshot", "screen_shot", "snap", "docs", "doc_")))
        )
        conf_threshold = 0.25 if is_screenshot_or_doc else 0.30

    W, H = img.size
    detected = detect_faces_in_image(img, conf_threshold=conf_threshold)
    created_detections = []

    for d in detected:
        crop = None
        landmarks_str = None
        if d.get("landmarks") is not None:
            try:
                lms = d["landmarks"]
                landmarks_str = ",".join(f"{pt[0]:.4f}:{pt[1]:.4f}" for pt in lms)
                crop = align_face_crop(img, lms)
            except Exception as e:
                logger.debug(f"Failed to align crop: {e}")
                crop = None

        if crop is None:
            cx = int((d["box_x"] + d["box_w"] / 2.0) * W)
            cy = int((d["box_y"] + d["box_h"] / 2.0) * H)
            half = int(max(d["box_w"] * W, d["box_h"] * H) * 0.65)
            crop = img.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))
        
        # Verify crop size and ArcFace validation
        if crop.width < 20 or crop.height < 20:
            continue

        emb = extract_arcface_embedding(crop)
        emb_str = ",".join(f"{x:.5f}" for x in emb) if emb is not None else None

        face = FaceDetection(
            media_id=media.id,
            person_id=None,
            box_x=d["box_x"],
            box_y=d["box_y"],
            box_w=d["box_w"],
            box_h=d["box_h"],
            confidence=d["confidence"],
            embedding_str=emb_str,
            landmarks_str=landmarks_str
        )
        db.add(face)
        created_detections.append(face)

    # Pet Detection (Cats & Dogs)
    pets = detect_pets_in_image(img)
    for pet in pets:
        pet_name = f"My {pet['pet_type'].capitalize()}"
        person = db.query(Person).filter(
            Person.user_id == media.user_id,
            Person.is_pet == True,
            Person.pet_type == pet['pet_type']
        ).first()
        if not person:
            person = Person(
                user_id=media.user_id,
                name=pet_name,
                is_pet=True,
                pet_type=pet['pet_type']
            )
            db.add(person)
            db.commit()
            db.refresh(person)

        pet_face = FaceDetection(
            media_id=media.id,
            person_id=person.id,
            box_x=pet["box_x"],
            box_y=pet["box_y"],
            box_w=pet["box_w"],
            box_h=pet["box_h"],
            confidence=pet["confidence"]
        )
        db.add(pet_face)
        created_detections.append(pet_face)

    media.faces_scanned = True
    db.commit()
    for f in created_detections:
        db.refresh(f)

    return created_detections

def get_face_crop_image(db: Session, face: FaceDetection) -> Optional[bytes]:
    """Generates a square WebP avatar crop for a face detection with automatic disk caching."""
    # 1. Fast-path: Check persistent disk cache first
    face_cache_path = os.path.join(settings.THUMBNAIL_DIR, f"face_{face.id}_180.webp")
    if os.path.isfile(face_cache_path):
        try:
            with open(face_cache_path, "rb") as f:
                return f.read()
        except Exception:
            pass

    media = db.query(Media).filter(Media.id == face.media_id).first()
    if not media:
        return None

    # Prefer 1080p preview when cropping 180px face avatar to eliminate 48MP RAM bloat
    img = load_media_image(media, db, prefer_preview=True)
    if img is None:
        return None

    try:
        img_rgb = img.convert('RGB')
        W, H = img_rgb.size
        cx = int((face.box_x + face.box_w / 2.0) * W)
        cy = int((face.box_y + face.box_h / 2.0) * H)
        half = int(max(face.box_w * W, face.box_h * H) * 0.65)
        crop_x1 = max(0, cx - half)
        crop_y1 = max(0, cy - half)
        crop_x2 = min(W, cx + half)
        crop_y2 = min(H, cy + half)

        cropped = img_rgb.crop((crop_x1, crop_y1, crop_x2, crop_y2)).resize((180, 180), Image.Resampling.LANCZOS)
        buf = io.BytesIO()
        cropped.save(buf, format="WEBP", quality=90)
        crop_bytes = buf.getvalue()

        # Persist to disk for instantaneous subsequent loads
        try:
            os.makedirs(settings.THUMBNAIL_DIR, exist_ok=True)
            with open(face_cache_path, "wb") as f:
                f.write(crop_bytes)
        except Exception as write_err:
            logger.debug(f"Could not write face crop to disk: {write_err}")

        return crop_bytes
    except Exception as e:
        logger.error(f"Failed to generate face crop: {e}")
        return None

def is_user_named(name: Optional[str]) -> bool:
    """Checks if a person's name is a meaningful user-assigned name."""
    if not name:
        return False
    clean = name.strip()
    if clean.lower() in ("unnamed", "unnamed person", "unknown"):
        return False
    if clean.startswith("Person ") and clean[7:].strip().isdigit():
        return False
    return True

def auto_cluster_faces(db: Session, user_id: Optional[int] = None, similarity_threshold: float = 0.48) -> Dict[str, Any]:
    """
    Intelligently clusters face crops using ArcFace 512-d Biometric Cosine Similarity with Anchor Retention.
    Guarantees:
    1. ZERO SHUFFLE: Faces already assigned to user-named people (like 'Mom') are NEVER reassigned.
    2. SMART RECOGNITION: Computes ArcFace centroid embeddings for named people and recruits matching faces.
    3. COHESIVE CLUSTERING: Leader-Centroid matching eliminates false-positive chaining drift.
    4. NOISE REDUCTION: Isolated 1-photo background stranger faces stay unassigned without polluting People gallery.
    """
    if user_id is None:
        media_user = db.query(Media.user_id).filter(Media.user_id != None).first()
        user_id = media_user[0] if media_user else 1

    faces_query = db.query(FaceDetection).join(Media, FaceDetection.media_id == Media.id).filter(
        Media.is_deleted == False,
        (Media.user_id == user_id) | (Media.user_id == None)
    )
    faces = faces_query.all()

    if not faces:
        return {"status": "no_faces", "created_people": 0, "assigned_faces": 0}

    # Ensure all human faces have ArcFace embeddings (skip pets)
    # Group missing faces by media_id to decode each image at most once and prefer 1080p preview
    unembedded_faces = [f for f in faces if not f.embedding_str and not (f.person and f.person.is_pet)]
    if unembedded_faces:
        faces_by_media: Dict[int, List[FaceDetection]] = {}
        for f in unembedded_faces:
            faces_by_media.setdefault(f.media_id, []).append(f)

        media_records = db.query(Media).filter(Media.id.in_(list(faces_by_media.keys()))).all()
        media_map = {m.id: m for m in media_records}

        processed_count = 0
        for mid, m_faces in faces_by_media.items():
            media = media_map.get(mid)
            if not media:
                continue
            img = load_media_image(media, db, prefer_preview=True)
            if not img:
                continue
            W, H = img.size
            for f in m_faces:
                crop = None
                if getattr(f, "landmarks_str", None):
                    try:
                        lms = np.array([[float(c) for c in pt.split(":")] for pt in f.landmarks_str.split(",")])
                        crop = align_face_crop(img, lms)
                    except Exception:
                        crop = None
                if crop is None:
                    cx = int((f.box_x + f.box_w / 2.0) * W)
                    cy = int((f.box_y + f.box_h / 2.0) * H)
                    half = int(max(f.box_w * W, f.box_h * H) * 0.65)
                    crop = img.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))
                emb = extract_arcface_embedding(crop)
                if emb is not None:
                    f.embedding_str = ",".join(f"{x:.5f}" for x in emb)
                    processed_count += 1
                    if processed_count % 50 == 0:
                        db.commit()
        db.commit()

    # Parse embeddings
    valid_faces = []
    embs_list = []
    for f in faces:
        if f.embedding_str and not (f.person and f.person.is_pet):
            try:
                vec = np.array([float(x) for x in f.embedding_str.split(",")], dtype=np.float32)
                norm = np.linalg.norm(vec)
                if norm > 1e-6:
                    vec = vec / norm
                    valid_faces.append(f)
                    embs_list.append(vec)
            except Exception:
                pass

    if not valid_faces:
        return {"status": "no_valid_embeddings", "created_people": 0, "assigned_faces": 0}

    embeddings = np.array(embs_list)

    # 1. User-Named People & Centroids (Anchor Retention)
    people_query = db.query(Person)
    if user_id:
        people_query = people_query.filter(Person.user_id == user_id)
    named_people = {p.id: p for p in people_query.all() if is_user_named(p.name)}

    locked_face_ids = set()
    person_centroids = {}
    for person_id, person in named_people.items():
        person_indices = [
            i for i, f in enumerate(valid_faces)
            if f.person_id == person_id
        ]
        if person_indices:
            for idx in person_indices:
                locked_face_ids.add(valid_faces[idx].id)
            p_embs = embeddings[person_indices]
            centroid = np.mean(p_embs, axis=0)
            norm = np.linalg.norm(centroid)
            if norm > 1e-6:
                person_centroids[person_id] = centroid / norm

    # 2. Recruitment to Named Centroids
    newly_matched_to_named = 0
    assigned_indices = set()

    for i, f in enumerate(valid_faces):
        if f.id in locked_face_ids:
            continue

        best_sim = -1.0
        best_person_id = None
        face_emb = embeddings[i]

        for person_id, centroid in person_centroids.items():
            sim = float(np.dot(face_emb, centroid))
            if sim > best_sim:
                best_sim = sim
                best_person_id = person_id

        if best_sim >= similarity_threshold and best_person_id is not None:
            f.person_id = best_person_id
            assigned_indices.add(i)
            newly_matched_to_named += 1

    # 3. Cluster Remaining Unassigned Faces with Leader-Centroid Matching
    rem_indices = [
        i for i, f in enumerate(valid_faces)
        if f.id not in locked_face_ids and i not in assigned_indices
    ]

    created_people_count = 0
    assigned_faces_count = newly_matched_to_named

    if rem_indices:
        clusters = []
        cluster_centroids = []

        for r_i in rem_indices:
            face_emb = embeddings[r_i]
            if not cluster_centroids:
                clusters.append([r_i])
                cluster_centroids.append(face_emb.copy())
                continue

            c_matrix = np.array(cluster_centroids)
            sims = np.dot(c_matrix, face_emb)
            best_c_idx = int(np.argmax(sims))
            best_sim = float(sims[best_c_idx])

            if best_sim >= (similarity_threshold + 0.02):
                clusters[best_c_idx].append(r_i)
                k = len(clusters[best_c_idx])
                new_c = cluster_centroids[best_c_idx] * ((k - 1) / k) + face_emb * (1 / k)
                cluster_centroids[best_c_idx] = new_c / max(float(np.linalg.norm(new_c)), 1e-6)
            else:
                clusters.append([r_i])
                cluster_centroids.append(face_emb.copy())

        # Clean up empty unnamed person records before allocating clusters (1 bulk query)
        all_unnamed = (
            db.query(Person)
            .filter(
                Person.user_id == user_id if user_id else True,
                Person.is_pet == False
            )
            .all()
        )
        active_pids = set(
            pid for (pid,) in db.query(FaceDetection.person_id).filter(FaceDetection.person_id != None).distinct()
        )
        unnamed_pids_to_del = [
            p.id for p in all_unnamed if not is_user_named(p.name) and p.id not in active_pids
        ]
        if unnamed_pids_to_del:
            db.query(Person).filter(Person.id.in_(unnamed_pids_to_del)).delete(synchronize_session=False)
            db.commit()

        # Find available Person numbers
        existing_numbers = []
        for p in people_query.all():
            if p.name.startswith("Person "):
                try:
                    existing_numbers.append(int(p.name[7:].strip()))
                except ValueError:
                    pass
        next_num = (max(existing_numbers) + 1) if existing_numbers else 1

        # Multi-face clusters (or singletons if library has < 5 total faces) become Person profiles
        min_cluster_size = 2 if len(valid_faces) >= 5 else 1
        viable_clusters = [c for c in clusters if len(c) >= min_cluster_size]
        viable_clusters.sort(key=len, reverse=True)

        for cluster in viable_clusters:
            person = Person(user_id=user_id, name=f"Person {next_num}")
            next_num += 1
            db.add(person)
            db.flush()  # Flushes person.id in memory without disk commit stalls
            created_people_count += 1

            for idx in cluster:
                f = valid_faces[idx]
                f.person_id = person.id
                f.cluster_id = person.id
                assigned_faces_count += 1

        db.commit()

        # Final purge of empty unnamed person records (1 bulk query)
        active_pids = set(
            pid for (pid,) in db.query(FaceDetection.person_id).filter(FaceDetection.person_id != None).distinct()
        )
        all_unnamed_fresh = (
            db.query(Person)
            .filter(
                Person.user_id == user_id if user_id else True,
                Person.is_pet == False
            )
            .all()
        )
        unnamed_pids_to_del2 = [
            p.id for p in all_unnamed_fresh if not is_user_named(p.name) and p.id not in active_pids
        ]
        if unnamed_pids_to_del2:
            db.query(Person).filter(Person.id.in_(unnamed_pids_to_del2)).delete(synchronize_session=False)
            db.commit()

        # Sequentially renumber remaining unnamed people
        remaining_unnamed = [
            p for p in db.query(Person).filter(Person.user_id == user_id if user_id else True, Person.is_pet == False).order_by(Person.id.asc()).all()
            if not is_user_named(p.name)
        ]
        renumbered = False
        for idx, p in enumerate(remaining_unnamed, start=1):
            expected = f"Person {idx}"
            if p.name != expected:
                p.name = expected
                renumbered = True
        if renumbered:
            db.commit()

    db.commit()

    return {
        "status": "completed",
        "total_faces": len(valid_faces),
        "locked_named_faces": len(locked_face_ids),
        "newly_matched_to_named": newly_matched_to_named,
        "created_people": created_people_count,
        "assigned_faces": assigned_faces_count
    }

def index_all_library_faces(db: Session, user_id: Optional[int] = None, max_photos: int = 250) -> Dict[str, Any]:
    """Scans user library photos, detects faces with SCRFD 500M (InsightFace) and computes ArcFace 512-d embeddings."""
    ensure_models()
    query = db.query(Media).filter(
        Media.is_deleted == False,
        (Media.mime_type == None) | (~Media.mime_type.startswith("video/")),
        (Media.faces_scanned == False) | (Media.faces_scanned == None)
    )
    if user_id:
        query = query.filter(Media.user_id == user_id)
    photos = query.order_by(Media.captured_at.desc()).limit(max_photos).all()

    total_detected = 0
    photos_processed = 0

    for photo in photos:
        detections = process_faces_for_media(db, photo)
        total_detected += len(detections)
        photos_processed += 1

    return {
        "status": "completed",
        "photos_processed": photos_processed,
        "faces_detected": total_detected
    }
