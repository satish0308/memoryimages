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

def detect_faces_in_image(image_input: Any, conf_threshold: float = 0.7) -> List[Dict[str, float]]:
    """
    Runs UltraFace ONNX model to detect faces in an image file or in-memory PIL Image.
    Returns list of normalized coordinates: box_x, box_y, box_w, box_h (0.0 - 1.0) and confidence.
    """
    sess = get_inference_session()
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

def get_face_crop_image(db: Session, face: FaceDetection) -> Optional[bytes]:
    """Generates a high-quality square WebP headshot crop for a face detection."""
    import io
    from PIL import Image
    from app.services.drive_cache import download_drive_file_to_memory
    Image.MAX_IMAGE_PIXELS = None

    media = db.query(Media).filter(Media.id == face.media_id).first()
    if not media:
        return None

    img = None
    if media.original_path and os.path.exists(media.original_path):
        try:
            img = Image.open(media.original_path)
        except Exception:
            pass
    elif media.thumbnail_1080_path and os.path.exists(media.thumbnail_1080_path):
        try:
            img = Image.open(media.thumbnail_1080_path)
        except Exception:
            pass

    # If local file is missing (in-memory mode), fetch from Google Drive directly into RAM
    if img is None and media.source_id:
        try:
            buf = download_drive_file_to_memory(media.source_id, db)
            if buf:
                img = Image.open(buf)
        except Exception as e:
            logger.warning(f"In-memory download for face crop failed: {e}")

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
        return buf.getvalue()
    except Exception as e:
        logger.error(f"Failed to generate face crop: {e}")
        return None

def is_user_named(name: Optional[str]) -> bool:
    """Checks if a person's name is a meaningful user-assigned name (e.g. 'Mom', 'Dad', 'Satish') vs a placeholder ('Person 9', 'Unnamed Person')."""
    if not name:
        return False
    clean = name.strip()
    if clean.lower() in ("unnamed", "unnamed person", "unknown"):
        return False
    if clean.startswith("Person ") and clean[7:].strip().isdigit():
        return False
    return True

def auto_cluster_faces(db: Session, similarity_threshold: float = 0.80) -> Dict[str, Any]:
    """
    Intelligently clusters face crops with Anchor Retention for user-named people (e.g. 'Mom', 'Dad').

    Guarantees:
    1. ZERO SHUFFLE: Faces already assigned to a named person (like 'Mom') are NEVER reassigned or stolen.
    2. ZERO VANISH: Named people are NEVER overwritten with 'Person X' and NEVER deleted.
    3. SMART RECOGNITION: Computes centroid embeddings for named people and automatically recruits
       new matching unassigned faces into their profile.
    4. Safe clustering: Only unassigned faces are grouped into new placeholder Person records.
    """
    from PIL import Image
    from fastembed import ImageEmbedding
    from app.services.drive_cache import download_drive_file_to_memory
    Image.MAX_IMAGE_PIXELS = None

    faces = db.query(FaceDetection).all()
    if not faces:
        return {"status": "no_faces", "created_people": 0, "assigned_faces": 0}

    # 1. Identify all user-named people (e.g. 'Mom') and lock their existing faces
    named_people = {p.id: p for p in db.query(Person).all() if is_user_named(p.name)}
    locked_face_ids = set()
    for f in faces:
        if f.person_id in named_people:
            locked_face_ids.add(f.id)

    # 2. Extract crops and prepare embeddings for all valid faces
    crops = []
    valid_faces = []

    for f in faces:
        m = db.query(Media).filter(Media.id == f.media_id).first()
        if not m:
            continue
        img = None
        if m.original_path and os.path.exists(m.original_path):
            try:
                img = Image.open(m.original_path)
            except Exception:
                pass
        elif m.thumbnail_1080_path and os.path.exists(m.thumbnail_1080_path):
            try:
                img = Image.open(m.thumbnail_1080_path)
            except Exception:
                pass
        if img is None and m.source_id:
            try:
                buf = download_drive_file_to_memory(m.source_id, db)
                if buf:
                    img = Image.open(buf)
            except Exception:
                pass
        if img is None:
            continue
        try:
            img_rgb = img.convert('RGB')
            W, H = img_rgb.size
            cx = int((f.box_x + f.box_w / 2.0) * W)
            cy = int((f.box_y + f.box_h / 2.0) * H)
            half = int(max(f.box_w * W, f.box_h * H) * 0.6)
            crop = img_rgb.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half))).resize((160, 160))
            crops.append(crop)
            valid_faces.append(f)
        except Exception as e:
            logger.warning(f"Could not crop face {f.id}: {e}")

    if not crops:
        return {"status": "no_crops", "created_people": 0, "assigned_faces": 0}

    embedder = ImageEmbedding(model_name="Qdrant/clip-ViT-B-32-vision")
    embeddings = np.array(list(embedder.embed(crops)))
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    embeddings = embeddings / np.maximum(norms, 1e-6)

    # 3. Compute Centroid vector embeddings for all User-Named People
    person_centroids = {}  # person_id -> normalized centroid vector
    for person_id, person in named_people.items():
        person_indices = [
            i for i, f in enumerate(valid_faces)
            if f.id in locked_face_ids and f.person_id == person_id
        ]
        if person_indices:
            person_embs = embeddings[person_indices]
            centroid = np.mean(person_embs, axis=0)
            norm = np.linalg.norm(centroid)
            if norm > 1e-6:
                person_centroids[person_id] = centroid / norm

    # 4. Smart Recruitment: Compare flexible/unassigned faces against Named People centroids
    newly_matched_to_named = 0
    assigned_flexible_indices = set()

    for i, f in enumerate(valid_faces):
        if f.id in locked_face_ids:
            continue  # Already locked to their named person, NEVER touch

        # Compare face embedding against all named centroids
        best_sim = -1.0
        best_person_id = None
        face_emb = embeddings[i]

        for person_id, centroid in person_centroids.items():
            sim = float(np.dot(face_emb, centroid))
            if sim > best_sim:
                best_sim = sim
                best_person_id = person_id

        # If high match to a named person (e.g. 'Mom'), recruit this face to 'Mom'!
        if best_sim >= similarity_threshold and best_person_id is not None:
            f.person_id = best_person_id
            assigned_flexible_indices.add(i)
            newly_matched_to_named += 1
            logger.info(f"Auto-clustered face #{f.id} to named person '{named_people[best_person_id].name}' (sim: {best_sim:.3f})")

    # 5. Cluster Remaining Unassigned Faces
    remaining_indices = [
        i for i, f in enumerate(valid_faces)
        if f.id not in locked_face_ids and i not in assigned_flexible_indices
    ]

    created_people_count = 0
    assigned_faces_count = newly_matched_to_named

    if remaining_indices:
        rem_embeddings = embeddings[remaining_indices]
        rem_sim_matrix = np.dot(rem_embeddings, rem_embeddings.T)

        visited = set()
        clusters = []
        for r_i in range(len(remaining_indices)):
            if r_i in visited:
                continue
            cluster = [remaining_indices[r_i]]
            visited.add(r_i)
            for r_j in range(r_i + 1, len(remaining_indices)):
                if r_j in visited:
                    continue
                if rem_sim_matrix[r_i, r_j] >= similarity_threshold:
                    cluster.append(remaining_indices[r_j])
                    visited.add(r_j)
            clusters.append(cluster)

        clusters.sort(key=len, reverse=True)

        # Existing placeholder people (Person X) that can be reused
        placeholder_people = [
            p for p in db.query(Person).all()
            if not is_user_named(p.name)
        ]

        # Determine next available index for Person X to avoid name collisions
        existing_numbers = []
        for p in db.query(Person).all():
            if p.name.startswith("Person "):
                try:
                    existing_numbers.append(int(p.name[7:].strip()))
                except ValueError:
                    pass
        next_num = (max(existing_numbers) + 1) if existing_numbers else 1

        for c_idx, cluster_indices in enumerate(clusters):
            # Check if any face in this cluster is already attached to a placeholder person
            person = None
            for idx_in_valid in cluster_indices:
                f = valid_faces[idx_in_valid]
                if f.person_id and f.person_id in [p.id for p in placeholder_people]:
                    person = next((p for p in placeholder_people if p.id == f.person_id), None)
                    if person:
                        break

            if not person:
                person = Person(name=f"Person {next_num}")
                next_num += 1
                db.add(person)
                db.commit()
                db.refresh(person)
                created_people_count += 1

            for idx_in_valid in cluster_indices:
                f = valid_faces[idx_in_valid]
                f.person_id = person.id
                f.cluster_id = person.id
                assigned_faces_count += 1

    db.commit()

    return {
        "status": "completed",
        "total_faces": len(valid_faces),
        "locked_named_faces": len(locked_face_ids),
        "newly_matched_to_named": newly_matched_to_named,
        "created_people": created_people_count,
        "assigned_faces": assigned_faces_count
    }

