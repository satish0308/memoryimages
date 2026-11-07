import os
import logging
from typing import Dict, Any, Optional, Tuple
import colorsys
import numpy as np
from PIL import Image
from sqlalchemy.orm import Session

from app.config import settings
from app.models.media import Media, MediaEmbedding
from app.models.person import FaceDetection
from app.services.clip_engine import embed_text, get_image_model, embed_image
from app.services.face_engine import get_face_crop_image

logger = logging.getLogger("memorypics.mood_engine")

MOOD_DESCRIPTIONS = {
    "joyful": "a joyful cheerful happy photo filled with bright smiles, laughter, and pure happiness",
    "serene": "a peaceful calm serene quiet relaxing nature landscape, scenic water, and tranquil view",
    "celebratory": "an energetic celebration party with excitement, cheering, dynamic festive atmosphere",
    "adventurous": "an adventurous outdoor hiking mountain trekking sports travel journey",
    "cozy": "a cozy warm intimate indoor ambiance with coffee, books, and gentle lighting",
    "dramatic": "a dramatic moody intense atmospheric storm, dark clouds, and vivid sunset skyline",
    "romantic": "a romantic sweet gentle loving couple moment together with tenderness and affection",
    "nostalgic": "a nostalgic vintage timeless family memory and treasured retro keepsake"
}

_MOOD_VECTORS: Optional[Dict[str, np.ndarray]] = None
_SMILE_VECTORS: Optional[Tuple[np.ndarray, np.ndarray]] = None

def get_mood_vectors() -> Dict[str, np.ndarray]:
    """Caches normalized 512-dim CLIP text vectors for all mood concepts."""
    global _MOOD_VECTORS
    if _MOOD_VECTORS is not None:
        return _MOOD_VECTORS

    vectors = {}
    for mood, desc in MOOD_DESCRIPTIONS.items():
        vec = embed_text(desc)
        if vec is not None:
            vectors[mood] = vec
    _MOOD_VECTORS = vectors
    return _MOOD_VECTORS

def get_smile_vectors() -> Tuple[np.ndarray, np.ndarray]:
    """Returns normalized CLIP vectors for (smiling, neutral) face expressions."""
    global _SMILE_VECTORS
    if _SMILE_VECTORS is not None:
        return _SMILE_VECTORS

    smile_vec = embed_text("a smiling happy laughing human face with teeth showing and joyful grin")
    neutral_vec = embed_text("a serious neutral blank expressionless human face")
    _SMILE_VECTORS = (smile_vec, neutral_vec)
    return _SMILE_VECTORS

def extract_dominant_color(image: Image.Image) -> Tuple[str, str]:
    """
    Extracts dominant color category and hex string from an image.
    Categories: 'blue', 'green', 'gold', 'red', 'orange', 'purple', 'monochrome', 'vibrant'.
    """
    try:
        small = image.resize((48, 48)).convert("RGB")
        pixels = np.array(small)
        # Average color
        avg_r = int(np.mean(pixels[:, :, 0]))
        avg_g = int(np.mean(pixels[:, :, 1]))
        avg_b = int(np.mean(pixels[:, :, 2]))
        hex_code = f"#{avg_r:02x}{avg_g:02x}{avg_b:02x}"

        # Convert to HSV
        h, s, v = colorsys.rgb_to_hsv(avg_r / 255.0, avg_g / 255.0, avg_b / 255.0)
        hue_deg = h * 360.0

        if s < 0.14:
            return "monochrome", hex_code
        if 75 <= hue_deg <= 165:
            return "green", hex_code
        if 180 <= hue_deg <= 260:
            return "blue", hex_code
        if 35 <= hue_deg < 75:
            return "gold", hex_code
        if 20 <= hue_deg < 35:
            return "orange", hex_code
        if 260 < hue_deg <= 330:
            return "purple", hex_code
        if (0 <= hue_deg < 20) or (330 < hue_deg <= 360):
            return "red", hex_code

        return "vibrant" if s > 0.5 else "gold", hex_code
    except Exception as e:
        logger.warning(f"Error extracting color: {e}")
        return "gold", "#d4af37"

def detect_face_smile(db: Session, face: FaceDetection, thumb_img: Optional[Image.Image] = None) -> bool:
    """Evaluates whether a detected face has a smile or happy expression."""
    try:
        face_cache_path = os.path.join(settings.THUMBNAIL_DIR, f"face_{face.id}_180.webp")
        if not os.path.isfile(face_cache_path):
            crop_bytes = get_face_crop_image(db, face)
            if not crop_bytes:
                return False

        if not os.path.isfile(face_cache_path):
            return False

        face_vec = embed_image(face_cache_path)
        if face_vec is None:
            return False

        smile_vec, neutral_vec = get_smile_vectors()
        if smile_vec is None or neutral_vec is None:
            return False

        smile_sim = float(np.dot(face_vec, smile_vec))
        neutral_sim = float(np.dot(face_vec, neutral_vec))

        return smile_sim > (neutral_sim + 0.02)
    except Exception as e:
        logger.debug(f"Face smile detection error: {e}")
        return False

def analyze_media_mood(db: Session, media: Media) -> Dict[str, Any]:
    """
    Computes emotion, mood, smile, and dominant color for a single media item.
    Updates the Media record in database.
    """
    # 1. Get or compute image embedding
    emb_record = db.query(MediaEmbedding).filter(MediaEmbedding.media_id == media.id).first()
    media_vec = None
    if emb_record and emb_record.vector:
        media_vec = np.frombuffer(emb_record.vector, dtype=np.float32)

    # 2. Extract color from thumbnail or original
    image_path = None
    if media.thumbnail_256_path and os.path.isfile(media.thumbnail_256_path):
        image_path = media.thumbnail_256_path
    elif media.thumbnail_1080_path and os.path.isfile(media.thumbnail_1080_path):
        image_path = media.thumbnail_1080_path
    elif media.original_path and os.path.isfile(media.original_path):
        image_path = media.original_path

    from io import BytesIO
    from app.models.media import SourceType
    from app.services.drive_cache import fetch_google_drive_thumbnail_bytes

    thumb_img = None
    if image_path and os.path.isfile(image_path):
        try:
            thumb_img = Image.open(image_path)
        except Exception:
            pass
    elif media.source_type == SourceType.GOOGLE_DRIVE and media.source_id:
        try:
            thumb_bytes = fetch_google_drive_thumbnail_bytes(media.source_id, db, 256)
            if thumb_bytes:
                thumb_img = Image.open(BytesIO(thumb_bytes))
        except Exception:
            pass

    if thumb_img:
        try:
            dom_color, hex_val = extract_dominant_color(thumb_img)
            media.dominant_color = dom_color
            media.color_hex = hex_val
        except Exception:
            pass

    # If no media embedding yet, generate it
    if media_vec is None and image_path and os.path.isfile(image_path):
        media_vec = embed_image(image_path)
        if media_vec is not None:
            new_emb = MediaEmbedding(media_id=media.id, vector=media_vec.tobytes(), embedding=media_vec.tolist())
            db.add(new_emb)
            db.commit()

    # 3. Classify mood via CLIP cosine similarity
    top_mood = "serene"
    top_score = 0.20
    if media_vec is not None:
        mood_vecs = get_mood_vectors()
        best_mood = None
        best_score = -1.0
        for mood_name, m_vec in mood_vecs.items():
            sim = float(np.dot(media_vec, m_vec))
            if sim > best_score:
                best_score = sim
                best_mood = mood_name
        if best_mood:
            top_mood = best_mood
            top_score = round(max(0.0, best_score), 4)

    media.mood = top_mood
    media.mood_score = top_score

    # 4. Check for smiling faces
    faces = db.query(FaceDetection).filter(FaceDetection.media_id == media.id).all()
    is_smiling = False
    if faces:
        for f in faces[:3]:  # Check up to 3 faces per photo
            if detect_face_smile(db, f, thumb_img=thumb_img):
                is_smiling = True
                break

    media.is_smiling = is_smiling

    # If smiling, bias mood to joyful if close
    if is_smiling and top_mood != "joyful" and top_score < 0.28:
        media.mood = "joyful"

    db.commit()

    return {
        "media_id": media.id,
        "mood": media.mood,
        "mood_score": media.mood_score,
        "is_smiling": media.is_smiling,
        "dominant_color": media.dominant_color,
        "color_hex": media.color_hex
    }

def analyze_all_media_moods(db: Session, limit: int = 200) -> Dict[str, Any]:
    """
    Batch analyzes all photos that haven't had mood or color extracted yet.
    """
    unprocessed = db.query(Media).filter(
        Media.is_deleted == False,
        Media.mood == None
    ).limit(limit).all()

    processed_count = 0
    for m in unprocessed:
        try:
            analyze_media_mood(db, m)
            processed_count += 1
        except Exception as e:
            logger.warning(f"Failed mood analysis for media #{m.id}: {e}")

    return {
        "processed_count": processed_count,
        "total_remaining": db.query(Media).filter(Media.is_deleted == False, Media.mood == None).count()
    }
