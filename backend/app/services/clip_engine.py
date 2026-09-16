import os
import logging
from typing import List, Dict, Any, Optional
import numpy as np
from sqlalchemy.orm import Session

from app.models.media import Media, MediaEmbedding

logger = logging.getLogger(__name__)

_image_model = None
_text_model = None

def get_image_model():
    global _image_model
    if _image_model is None:
        from fastembed import ImageEmbedding
        _image_model = ImageEmbedding(model_name="Qdrant/clip-ViT-B-32-vision")
    return _image_model

def get_text_model():
    global _text_model
    if _text_model is None:
        from fastembed import TextEmbedding
        _text_model = TextEmbedding(model_name="Qdrant/clip-ViT-B-32-text")
    return _text_model

def embed_image(image_path: str) -> Optional[np.ndarray]:
    """Generates a 512-dim CLIP embedding vector for an image file."""
    if not os.path.isfile(image_path):
        return None
    try:
        model = get_image_model()
        embeddings = list(model.embed([image_path]))
        if not embeddings:
            return None
        vec = np.array(embeddings[0], dtype=np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec
    except Exception as e:
        logger.error(f"Error embedding image {image_path}: {e}")
        return None

def embed_text(text: str) -> Optional[np.ndarray]:
    """Generates a normalized 512-dim CLIP embedding vector for a text query."""
    try:
        model = get_text_model()
        embeddings = list(model.embed([text.strip()]))
        if not embeddings:
            return None
        vec = np.array(embeddings[0], dtype=np.float32)
        norm = np.linalg.norm(vec)
        if norm > 0:
            vec = vec / norm
        return vec
    except Exception as e:
        logger.error(f"Error embedding query '{text}': {e}")
        return None

def index_media(db: Session, media: Media) -> bool:
    """Computes and stores CLIP embedding for a single media item."""
    # Use 256px thumbnail for fast visual embedding, fallback to original
    target_path = None
    if media.thumbnail_256_path and os.path.isfile(media.thumbnail_256_path):
        target_path = media.thumbnail_256_path
    elif media.original_path and os.path.isfile(media.original_path):
        target_path = media.original_path

    if not target_path:
        return False

    vec = embed_image(target_path)
    if vec is None:
        return False

    existing = db.query(MediaEmbedding).filter(MediaEmbedding.media_id == media.id).first()
    if existing:
        existing.vector = vec.tobytes()
    else:
        new_emb = MediaEmbedding(media_id=media.id, vector=vec.tobytes())
        db.add(new_emb)

    db.commit()
    return True

def index_all_unindexed(db: Session, limit: int = 500) -> int:
    """Batch indexes all media files that do not have CLIP embeddings yet."""
    # Subquery existing media IDs in media_embeddings
    indexed_subquery = db.query(MediaEmbedding.media_id).subquery()
    unindexed = db.query(Media).filter(
        Media.is_deleted == False,
        ~Media.id.in_(indexed_subquery)
    ).limit(limit).all()

    if not unindexed:
        return 0

    image_paths = []
    media_map = []

    for m in unindexed:
        path = m.thumbnail_256_path if (m.thumbnail_256_path and os.path.isfile(m.thumbnail_256_path)) else m.original_path
        if path and os.path.isfile(path):
            image_paths.append(path)
            media_map.append(m)

    if not image_paths:
        return 0

    try:
        model = get_image_model()
        embeddings = list(model.embed(image_paths))
        indexed_count = 0
        for m, emb in zip(media_map, embeddings):
            vec = np.array(emb, dtype=np.float32)
            norm = np.linalg.norm(vec)
            if norm > 0:
                vec = vec / norm
            emb_entry = MediaEmbedding(media_id=m.id, vector=vec.tobytes())
            db.add(emb_entry)
            indexed_count += 1

        db.commit()
        return indexed_count
    except Exception as e:
        logger.error(f"Batch indexing error: {e}")
        return 0

def semantic_search(
    db: Session, 
    query: str, 
    top_k: int = 50, 
    min_similarity: float = 0.16
) -> List[Dict[str, Any]]:
    """
    Performs vector cosine similarity search across all indexed photos.
    Returns matched media items with similarity percentage.
    """
    q_vec = embed_text(query)
    if q_vec is None:
        return []

    # Fetch all stored embeddings
    rows = db.query(MediaEmbedding.media_id, MediaEmbedding.vector).all()
    if not rows:
        return []

    media_ids = [r[0] for r in rows]
    vectors = [np.frombuffer(r[1], dtype=np.float32) for r in rows]

    matrix = np.vstack(vectors)
    # Vectors are already unit normalized, so cosine similarity is matrix @ q_vec
    scores = matrix @ q_vec

    # Filter and rank
    results = []
    for mid, score in zip(media_ids, scores):
        val = float(score)
        if val >= min_similarity:
            results.append((mid, val))

    results.sort(key=lambda x: x[1], reverse=True)
    top_results = results[:top_k]

    if not top_results:
        return []

    # Retrieve media objects
    id_to_score = {mid: score for mid, score in top_results}
    target_ids = list(id_to_score.keys())

    media_items = db.query(Media).filter(
        Media.id.in_(target_ids),
        Media.is_deleted == False
    ).all()

    # Sort media items according to ranking score
    media_dict = {m.id: m for m in media_items}
    ordered = []
    for mid, score in top_results:
        if mid in media_dict:
            m = media_dict[mid]
            ordered.append({
                "id": m.id,
                "filename": m.filename,
                "category": m.category,
                "captured_at": m.captured_at,
                "is_favorite": m.is_favorite,
                "is_blurry": m.is_blurry,
                "similarity": round(score, 4),
                "match_percent": int(round(score * 100)),
                "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256"
            })

    return ordered
