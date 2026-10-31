import os
import io
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from PIL import Image
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.models.media import Media
from app.models.person import Person, FaceDetection

logger = logging.getLogger("memorypics.face_engine")

Image.MAX_IMAGE_PIXELS = None

# Model Paths
MODEL_DIR = "/data/models" if os.path.exists("/data/models") else "/data/db/models"
DETECTOR_PATH = os.path.join(MODEL_DIR, "version-RFB-320.onnx")
ARCFACE_PATH = os.path.join(MODEL_DIR, "arcface.onnx")
YOLO_PATH = os.path.join(MODEL_DIR, "yolov8n.onnx")

_detector_session = None
_arcface_session = None
_yolo_session = None

def get_detector_session():
    global _detector_session
    if _detector_session is not None:
        return _detector_session
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
        logger.warning(f"ArcFace model not found at {ARCFACE_PATH}")
        return None
    try:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        _arcface_session = ort.InferenceSession(ARCFFACE_PATH if 'ARCFACE_PATH' in locals() else ARCFACE_PATH, opts)
        return _arcface_session
    except Exception as e:
        logger.error(f"Failed to load ArcFace biometric model: {e}")
        return None

def get_yolo_session():
    global _yolo_session
    if _yolo_session is not None:
        return _yolo_session
    if not os.path.exists(YOLO_PATH):
        logger.warning(f"YOLOv8 pet model not found at {YOLO_PATH}")
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

def load_media_image(media: Media, db: Session) -> Optional[Image.Image]:
    """Loads an image into a PIL Image object from local disk or in-memory cloud stream."""
    if media.mime_type and media.mime_type.startswith("video/"):
        return None

    if media.original_path and os.path.isfile(media.original_path):
        try:
            return Image.open(media.original_path)
        except Exception:
            pass

    if media.thumbnail_1080_path and os.path.isfile(media.thumbnail_1080_path):
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

def detect_faces_in_image(image_input: Any, conf_threshold: float = 0.75, min_size: int = 45) -> List[Dict[str, float]]:
    """Runs UltraFace ONNX model to detect faces in an image file or in-memory PIL Image."""
    sess = get_detector_session()
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
            if conf < conf_threshold:
                continue

            bx = float(np.clip(x1, 0.0, 1.0))
            by = float(np.clip(y1, 0.0, 1.0))
            bw = float(np.clip(x2 - bx, 0.01, 1.0 - bx))
            bh = float(np.clip(y2 - by, 0.01, 1.0 - by))

            # 1. Pixel dimension and relative dimension validation
            pixel_w = bw * orig_w
            pixel_h = bh * orig_h
            if pixel_w < min_size or pixel_h < min_size:
                continue
            if bw < 0.030 or bh < 0.030:
                continue

            # 2. Pixel aspect ratio validation: human faces are roughly 0.48 <= w/h <= 1.48
            pixel_aspect = pixel_w / max(pixel_h, 1.0)
            if pixel_aspect < 0.48 or pixel_aspect > 1.48:
                continue

            results.append({
                "box_x": round(bx, 4),
                "box_y": round(by, 4),
                "box_w": round(bw, 4),
                "box_h": round(bh, 4),
                "confidence": round(float(conf), 3)
            })
        return results
    except Exception as e:
        logger.error(f"Face detection failed: {e}")
        return []

def extract_arcface_embedding(face_crop: Image.Image) -> Optional[np.ndarray]:
    """Computes a 512-dimensional L2-normalized biometric face embedding using ArcFace."""
    sess = get_arcface_session()
    if sess is None:
        return None
    try:
        if face_crop.width < 35 or face_crop.height < 35:
            return None

        crop_112 = face_crop.convert("RGB").resize((112, 112), Image.Resampling.LANCZOS)
        arr = np.array(crop_112).astype("float32")
        arr = (arr - 127.5) / 128.0
        arr = np.expand_dims(arr, axis=0)

        output = sess.run(None, {"input_1": arr})[0]
        raw_embedding = output[0]
        norm = float(np.linalg.norm(raw_embedding))

        # Texture artifact rejection: on genuine human faces, ArcFace raw norm is between 1.8 and 6.0.
        # Water ripples, rocks, ground noise, and foliage produce saturated norms > 6.5.
        if norm < 1.5 or norm > 6.5:
            logger.debug(f"Rejected non-face crop with abnormal ArcFace activation norm: {norm:.2f}")
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

def process_faces_for_media(db: Session, media: Media, overwrite: bool = False) -> List[FaceDetection]:
    """Detects faces & computes ArcFace 512-d embeddings for a photo (supports local and cloud in-memory)."""
    existing = db.query(FaceDetection).filter(FaceDetection.media_id == media.id).all()
    if existing and not overwrite:
        # Check if embeddings need computation
        updated = False
        img = None
        for f in existing:
            if not f.embedding_str:
                if img is None:
                    img = load_media_image(media, db)
                if img:
                    W, H = img.size
                    cx = int((f.box_x + f.box_w / 2.0) * W)
                    cy = int((f.box_y + f.box_h / 2.0) * H)
                    half = int(max(f.box_w * W, f.box_h * H) * 0.65)
                    crop = img.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))
                    emb = extract_arcface_embedding(crop)
                    if emb is not None:
                        f.embedding_str = ",".join(f"{x:.5f}" for x in emb)
                        updated = True
        if updated:
            db.commit()
        return existing

    if existing and overwrite:
        for f in existing:
            db.delete(f)
        db.commit()

    img = load_media_image(media, db)
    if img is None:
        return []

    W, H = img.size
    detected = detect_faces_in_image(img)
    created_detections = []

    for d in detected:
        # Extract crop for ArcFace 512-d embedding
        cx = int((d["box_x"] + d["box_w"] / 2.0) * W)
        cy = int((d["box_y"] + d["box_h"] / 2.0) * H)
        half = int(max(d["box_w"] * W, d["box_h"] * H) * 0.65)
        crop = img.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))
        
        # Verify crop size and ArcFace validation
        if crop.width < 45 or crop.height < 45:
            continue

        emb = extract_arcface_embedding(crop)
        # If crop is not a genuine human face (rejected by ArcFace norm), do not save it!
        if emb is None:
            continue

        emb_str = ",".join(f"{x:.5f}" for x in emb)

        face = FaceDetection(
            media_id=media.id,
            person_id=None,
            box_x=d["box_x"],
            box_y=d["box_y"],
            box_w=d["box_w"],
            box_h=d["box_h"],
            confidence=d["confidence"],
            embedding_str=emb_str
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

    if created_detections:
        db.commit()
        for f in created_detections:
            db.refresh(f)

    return created_detections

def get_face_crop_image(db: Session, face: FaceDetection) -> Optional[bytes]:
    """Generates a square WebP avatar crop for a face detection."""
    media = db.query(Media).filter(Media.id == face.media_id).first()
    if not media:
        return None

    img = load_media_image(media, db)
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
    """Checks if a person's name is a meaningful user-assigned name."""
    if not name:
        return False
    clean = name.strip()
    if clean.lower() in ("unnamed", "unnamed person", "unknown"):
        return False
    if clean.startswith("Person ") and clean[7:].strip().isdigit():
        return False
    return True

def auto_cluster_faces(db: Session, user_id: Optional[int] = None, similarity_threshold: float = 0.45) -> Dict[str, Any]:
    """
    Intelligently clusters face crops using ArcFace 512-d Biometric Cosine Similarity with Anchor Retention.
    Guarantees:
    1. ZERO SHUFFLE: Faces already assigned to user-named people (like 'Mom') are NEVER reassigned.
    2. SMART RECOGNITION: Computes ArcFace centroid embeddings for named people and recruits matching faces.
    3. High-precision ArcFace threshold: 0.45 cosine similarity.
    """
    faces_query = db.query(FaceDetection).join(Media, FaceDetection.media_id == Media.id).filter(Media.is_deleted == False)
    if user_id:
        faces_query = faces_query.filter(Media.user_id == user_id)
    faces = faces_query.all()

    if not faces:
        return {"status": "no_faces", "created_people": 0, "assigned_faces": 0}

    # Ensure all faces have ArcFace embeddings
    for f in faces:
        if not f.embedding_str:
            media = db.query(Media).filter(Media.id == f.media_id).first()
            if media:
                img = load_media_image(media, db)
                if img:
                    W, H = img.size
                    cx = int((f.box_x + f.box_w / 2.0) * W)
                    cy = int((f.box_y + f.box_h / 2.0) * H)
                    half = int(max(f.box_w * W, f.box_h * H) * 0.65)
                    crop = img.crop((max(0, cx - half), max(0, cy - half), min(W, cx + half), min(H, cy + half)))
                    emb = extract_arcface_embedding(crop)
                    if emb is not None:
                        f.embedding_str = ",".join(f"{x:.5f}" for x in emb)
    db.commit()

    # Parse embeddings
    valid_faces = []
    embs_list = []
    for f in faces:
        if f.embedding_str:
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

    # 1. User-Named People & Centroids
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

    # 3. Cluster Remaining Unassigned Faces
    rem_indices = [
        i for i, f in enumerate(valid_faces)
        if f.id not in locked_face_ids and i not in assigned_indices
    ]

    created_people_count = 0
    assigned_faces_count = newly_matched_to_named

    if rem_indices:
        rem_embs = embeddings[rem_indices]
        sim_matrix = np.dot(rem_embs, rem_embs.T)

        visited = set()
        clusters = []
        for r_i in range(len(rem_indices)):
            if r_i in visited:
                continue
            cluster = [rem_indices[r_i]]
            visited.add(r_i)
            for r_j in range(r_i + 1, len(rem_indices)):
                if r_j in visited:
                    continue
                if sim_matrix[r_i, r_j] >= (similarity_threshold + 0.05):
                    cluster.append(rem_indices[r_j])
                    visited.add(r_j)
            if len(cluster) >= 2 or len(valid_faces) < 10:
                clusters.append(cluster)

        clusters.sort(key=len, reverse=True)

        # Clean up empty unnamed person records before allocating clusters
        all_unnamed = (
            db.query(Person)
            .filter(
                Person.user_id == user_id if user_id else True,
                Person.is_pet == False
            )
            .all()
        )
        for p in all_unnamed:
            if not is_user_named(p.name):
                fc = db.query(FaceDetection).filter(FaceDetection.person_id == p.id).count()
                if fc == 0:
                    db.delete(p)
        db.commit()

        existing_numbers = []
        for p in people_query.all():
            if p.name.startswith("Person "):
                try:
                    existing_numbers.append(int(p.name[7:].strip()))
                except ValueError:
                    pass
        next_num = (max(existing_numbers) + 1) if existing_numbers else 1

        for cluster in clusters:
            person = Person(user_id=user_id, name=f"Person {next_num}")
            next_num += 1
            db.add(person)
            db.commit()
            db.refresh(person)
            created_people_count += 1

            for idx in cluster:
                f = valid_faces[idx]
                f.person_id = person.id
                f.cluster_id = person.id
                assigned_faces_count += 1

        # Final purge of empty unnamed person records
        all_unnamed = (
            db.query(Person)
            .filter(
                Person.user_id == user_id if user_id else True,
                Person.is_pet == False
            )
            .all()
        )
        for p in all_unnamed:
            if not is_user_named(p.name):
                fc = db.query(FaceDetection).filter(FaceDetection.person_id == p.id).count()
                if fc == 0:
                    db.delete(p)
        db.commit()

        # Sequentially renumber remaining unnamed people
        remaining_unnamed = [
            p for p in db.query(Person).filter(Person.user_id == user_id if user_id else True, Person.is_pet == False).order_by(Person.id.asc()).all()
            if not is_user_named(p.name)
        ]
        for idx, p in enumerate(remaining_unnamed, start=1):
            p.name = f"Person {idx}"
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
    """Scans user library photos, detects faces with UltraFace and computes ArcFace 512-d embeddings."""
    query = db.query(Media).filter(
        Media.is_deleted == False,
        (Media.mime_type == None) | (~Media.mime_type.startswith("video/"))
    )
    if user_id:
        query = query.filter(Media.user_id == user_id)
    photos = query.order_by(Media.captured_at.desc()).limit(max_photos).all()

    total_detected = 0
    photos_processed = 0

    for photo in photos:
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
