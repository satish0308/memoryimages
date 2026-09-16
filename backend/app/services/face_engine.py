import os
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from PIL import Image
from sqlalchemy.orm import Session

from app.models.media import Media
from app.models.person import Person, FaceDetection

logger = logging.getLogger("memorypics.face_engine")

MODEL_PATH = "/data/models/version-RFB-320.onnx"
_session = None

def get_inference_session():
    global _session
    if _session is not None:
        return _session
    if not os.path.exists(MODEL_PATH):
        logger.warning(f"Face model not found at {MODEL_PATH}")
        return None
    try:
        import onnxruntime as ort
        # Suppress ONNX runtime verbose initializer warnings
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        _session = ort.InferenceSession(MODEL_PATH, opts)
        return _session
    except Exception as e:
        logger.error(f"Failed to load face detection model: {e}")
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

def detect_faces_in_image(image_path: str, conf_threshold: float = 0.7) -> List[Dict[str, float]]:
    """
    Runs UltraFace ONNX model to detect faces in an image file.
    Returns list of normalized coordinates: box_x, box_y, box_w, box_h (0.0 - 1.0) and confidence.
    """
    sess = get_inference_session()
    if sess is None or not os.path.exists(image_path):
        return []

    try:
        with Image.open(image_path) as img:
            img_rgb = img.convert('RGB')
            orig_w, orig_h = img_rgb.size
            if orig_w == 0 or orig_h == 0:
                return []
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
            # Clamp to [0, 1]
            bx = float(np.clip(x1, 0.0, 1.0))
            by = float(np.clip(y1, 0.0, 1.0))
            bw = float(np.clip(x2 - bx, 0.01, 1.0 - bx))
            bh = float(np.clip(y2 - by, 0.01, 1.0 - by))
            results.append({
                "box_x": round(bx, 4),
                "box_y": round(by, 4),
                "box_w": round(bw, 4),
                "box_h": round(bh, 4),
                "confidence": round(float(conf), 3)
            })
        return results
    except Exception as e:
        logger.error(f"Face detection failed on {image_path}: {e}")
        return []

def process_faces_for_media(db: Session, media: Media, overwrite: bool = False) -> List[FaceDetection]:
    """
    Detects faces for a single media item and persists them to the database.
    """
    if not media.original_path or not os.path.isfile(media.original_path):
        return []

    existing = db.query(FaceDetection).filter(FaceDetection.media_id == media.id).all()
    if existing and not overwrite:
        return existing

    if existing and overwrite:
        for f in existing:
            db.delete(f)
        db.commit()

    detected = detect_faces_in_image(media.original_path)
    created_detections = []
    for d in detected:
        face = FaceDetection(
            media_id=media.id,
            person_id=None,
            box_x=d["box_x"],
            box_y=d["box_y"],
            box_w=d["box_w"],
            box_h=d["box_h"],
            confidence=d["confidence"]
        )
        db.add(face)
        created_detections.append(face)

    if created_detections:
        db.commit()
        for f in created_detections:
            db.refresh(f)

    return created_detections

def index_all_library_faces(db: Session) -> Dict[str, Any]:
    """Scans all library photos and detects faces."""
    photos = db.query(Media).filter(Media.is_deleted == False).all()
    total_detected = 0
    photos_processed = 0

    for photo in photos:
        # Check if already processed
        has_faces = db.query(FaceDetection).filter(FaceDetection.media_id == photo.id).first()
        if not has_faces:
            detections = process_faces_for_media(db, photo)
            total_detected += len(detections)
            photos_processed += 1

    return {
        "status": "completed",
        "photos_processed": photos_processed,
        "faces_detected": total_detected
    }
