import os
import math
import logging
from typing import List, Dict, Any, Optional, Set, Tuple
from datetime import datetime, timedelta
import numpy as np
from sqlalchemy.orm import Session
from sqlalchemy import text, and_, or_, func, desc

from app.models.media import Media, MediaEmbedding
from app.models.person import FaceDetection, Person
from app.services.clip_engine import embed_image
from app.services.burst_engine import phash_distance

logger = logging.getLogger(__name__)

def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculates great-circle distance between two GPS coordinates in meters."""
    R = 6371000.0  # Earth radius in meters
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2 +
         math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return R * c

def format_distance(meters: float) -> str:
    if meters < 1000:
        return f"{int(meters)}m away"
    return f"{meters / 1000.0:.1f}km away"

def format_time_delta(td: timedelta, is_before: bool) -> str:
    secs = abs(int(td.total_seconds()))
    if secs < 60:
        return "Same minute"
    mins = secs // 60
    if mins < 60:
        return f"{mins}m {'earlier' if is_before else 'later'}"
    hours = mins // 60
    rem_mins = mins % 60
    if rem_mins == 0:
        return f"{hours}h {'earlier' if is_before else 'later'}"
    return f"{hours}h {rem_mins}m {'earlier' if is_before else 'later'}"

def format_media_item(media: Media, badge: Optional[str] = None, score: float = 0.0) -> Dict[str, Any]:
    return {
        "id": media.id,
        "filename": media.filename,
        "width": media.width or 1280,
        "height": media.height or 720,
        "captured_at": media.captured_at.isoformat() if media.captured_at else None,
        "camera_make": media.camera_make,
        "camera_model": media.camera_model,
        "latitude": media.latitude,
        "longitude": media.longitude,
        "location_name": media.location_name,
        "is_favorite": media.is_favorite or False,
        "is_blurry": media.is_blurry or False,
        "mood": media.mood,
        "mood_score": media.mood_score or 0.0,
        "is_smiling": media.is_smiling or False,
        "dominant_color": media.dominant_color,
        "color_hex": media.color_hex,
        "thumbnail_url": f"/api/v1/media/{media.id}/thumbnail?size=256",
        "preview_url": f"/api/v1/media/{media.id}/thumbnail?size=1080",
        "match_badge": badge,
        "similarity_score": round(float(score), 3)
    }

def get_or_create_media_embedding(db: Session, media: Media) -> Optional[np.ndarray]:
    """Retrieves existing CLIP vector from database if available."""
    emb_record = db.query(MediaEmbedding).filter(MediaEmbedding.media_id == media.id).first()
    if emb_record and emb_record.vector:
        try:
            vec = np.frombuffer(emb_record.vector, dtype=np.float32)
            if len(vec) == 512:
                return vec
        except Exception:
            pass
    return None

def find_similar_photos(
    db: Session,
    media_id: int,
    user_id: int,
    facet: str = "all",
    limit: int = 50
) -> Optional[Dict[str, Any]]:
    """
    Computes multi-dimensional similarity for a target photo:
    1. Visual & Graphic Look (CLIP cosine distance + pHash)
    2. Same People & Faces (ArcFace biometric embeddings + Person clusters)
    3. Nearby Geographic Location (GPS Haversine distance & city)
    4. Same Outing / Temporal Window (within ±4 hours)
    """
    target = db.query(Media).filter(
        Media.id == media_id,
        Media.user_id == user_id,
        Media.is_deleted == False
    ).first()
    if not target:
        return None

    # Target info payload
    target_faces = db.query(FaceDetection).filter(FaceDetection.media_id == target.id).all()
    target_person_ids = [f.person_id for f in target_faces if f.person_id]
    target_persons = db.query(Person).filter(Person.id.in_(target_person_ids)).all() if target_person_ids else []
    person_name_map = {p.id: p.name for p in target_persons}

    target_info = {
        **format_media_item(target),
        "people": [
            {"id": p.id, "name": p.name}
            for p in target_persons
        ]
    }

    visual_matches: List[Dict[str, Any]] = []
    people_matches: List[Dict[str, Any]] = []
    location_matches: List[Dict[str, Any]] = []
    time_matches: List[Dict[str, Any]] = []

    all_candidate_scores: Dict[int, Dict[str, Any]] = {}

    def add_candidate(mid: int, media_obj: Media, facet_name: str, score: float, badge: str):
        if mid == target.id:
            return
        if mid not in all_candidate_scores:
            all_candidate_scores[mid] = {
                "media": media_obj,
                "scores": {},
                "badges": []
            }
        all_candidate_scores[mid]["scores"][facet_name] = score
        if badge and badge not in all_candidate_scores[mid]["badges"]:
            all_candidate_scores[mid]["badges"].append(badge)

    # ---------------------------------------------------------
    # 1. FACET: Visual & Graphics (CLIP 512-d + pHash)
    # ---------------------------------------------------------
    target_vec = get_or_create_media_embedding(db, target)
    if target_vec is not None:
        from app.database import is_postgres
        if is_postgres:
            try:
                vec_str = "[" + ",".join(f"{x:.6f}" for x in target_vec) + "]"
                sql = text("""
                    SELECT me.media_id, (1.0 - (me.embedding <=> :t_vec::vector)) AS score
                    FROM media_embeddings me
                    JOIN media m ON m.id = me.media_id
                    WHERE me.embedding IS NOT NULL 
                      AND me.media_id != :tid
                      AND m.user_id = :uid
                      AND m.is_deleted = false
                      AND (me.embedding <=> :t_vec::vector) <= 0.85
                    ORDER BY me.embedding <=> :t_vec::vector ASC
                    LIMIT :top_k;
                """)
                rows = db.execute(sql, {"t_vec": vec_str, "tid": target.id, "uid": user_id, "top_k": limit * 2}).fetchall()
                if rows:
                    vis_media_ids = [r[0] for r in rows]
                    media_map = {m.id: m for m in db.query(Media).filter(Media.id.in_(vis_media_ids)).all()}
                    for r in rows:
                        m = media_map.get(r[0])
                        if m:
                            cos_sim = float(r[1])
                            pct = int(round(cos_sim * 100))
                            badge = f"{pct}% Visual Match"
                            item = format_media_item(m, badge=badge, score=cos_sim)
                            visual_matches.append(item)
                            add_candidate(m.id, m, "visual", cos_sim, badge)
            except Exception as e:
                logger.warning(f"[similarity_engine] pgvector search error: {e}")

        if not visual_matches:
            # Fallback in-memory dot product across user's embeddings
            rows = db.query(MediaEmbedding.media_id, MediaEmbedding.vector)\
                     .join(Media, Media.id == MediaEmbedding.media_id)\
                     .filter(
                         Media.user_id == user_id,
                         Media.is_deleted == False,
                         Media.id != target.id,
                         MediaEmbedding.vector.isnot(None)
                     ).limit(1000).all()
            if rows:
                v_ids = [r[0] for r in rows]
                v_matrix = np.vstack([np.frombuffer(r[1], dtype=np.float32) for r in rows])
                dots = v_matrix @ target_vec
                top_indices = np.argsort(dots)[::-1][:limit]
                v_media_map = {m.id: m for m in db.query(Media).filter(Media.id.in_([v_ids[idx] for idx in top_indices])).all()}
                for idx in top_indices:
                    sim = float(dots[idx])
                    if sim >= 0.20:
                        m = v_media_map.get(v_ids[idx])
                        if m:
                            pct = int(round(sim * 100))
                            badge = f"{pct}% Visual Match"
                            item = format_media_item(m, badge=badge, score=sim)
                            visual_matches.append(item)
                            add_candidate(m.id, m, "visual", sim, badge)

    # In addition, check perceptual hash (pHash) matches for visual composition
    vis_matched_ids = {vm["id"] for vm in visual_matches}
    if target.perceptual_hash and len(visual_matches) < limit:
        # Fast scalar projection (id, perceptual_hash) across up to 5,000 photos without instantiating heavy ORM objects
        phash_candidates = db.query(Media.id, Media.perceptual_hash).filter(
            Media.user_id == user_id,
            Media.id != target.id,
            Media.is_deleted == False,
            Media.perceptual_hash.isnot(None)
        ).order_by(desc(Media.captured_at)).limit(5000).all()

        matching_phash_map: Dict[int, int] = {}
        for mid, phash_str in phash_candidates:
            if mid in vis_matched_ids:
                continue
            dist = phash_distance(target.perceptual_hash, phash_str)
            if dist <= 14:
                matching_phash_map[mid] = dist
                if len(matching_phash_map) >= (limit - len(visual_matches)):
                    break

        if matching_phash_map:
            matched_media = db.query(Media).filter(Media.id.in_(list(matching_phash_map.keys()))).all()
            for m in matched_media:
                dist = matching_phash_map[m.id]
                vis_matched_ids.add(m.id)
                sim = max(0.60, 1.0 - (dist / 35.0))
                pct = int(round(sim * 100))
                badge = f"{pct}% Visual Look"
                item = format_media_item(m, badge=badge, score=sim)
                visual_matches.append(item)
                add_candidate(m.id, m, "visual", sim, badge)

    # ---------------------------------------------------------
    # 2. FACET: People & Faces (ArcFace + Person Clusters)
    # ---------------------------------------------------------
    if target_person_ids:
        # Match other media having the same identified persons
        matching_face_media = db.query(Media)\
            .join(FaceDetection, FaceDetection.media_id == Media.id)\
            .filter(
                Media.user_id == user_id,
                Media.id != target.id,
                Media.is_deleted == False,
                FaceDetection.person_id.in_(target_person_ids)
            )\
            .group_by(Media.id)\
            .order_by(desc(Media.captured_at))\
            .limit(limit).all()

        if matching_face_media:
            # Batch query faces across all matched media in 1 query, eliminating N+1 roundtrips
            match_mids = [m.id for m in matching_face_media]
            all_m_faces = db.query(FaceDetection.media_id, FaceDetection.person_id).filter(
                FaceDetection.media_id.in_(match_mids)
            ).all()
            faces_by_mid: Dict[int, Set[int]] = {}
            for mid, pid in all_m_faces:
                if pid in target_person_ids:
                    faces_by_mid.setdefault(mid, set()).add(pid)

            for m in matching_face_media:
                m_pids = faces_by_mid.get(m.id, set())
                matched_names = [person_name_map[pid] for pid in m_pids if pid in person_name_map]
                badge = f"Featuring {', '.join(matched_names[:2])}" if matched_names else "Same Person"
                score = 0.85 + (0.05 * len(m_pids))
                item = format_media_item(m, badge=badge, score=score)
                people_matches.append(item)
                add_candidate(m.id, m, "people", score, badge)

    # Check for biometric face embeddings if target has unassigned faces
    target_face_embs = []
    for tf in target_faces:
        if tf.embedding_str:
            try:
                vec = np.array([float(x) for x in tf.embedding_str.split(",")], dtype=np.float32)
                norm = np.linalg.norm(vec)
                if norm > 0:
                    target_face_embs.append(vec / norm)
            except Exception:
                pass

    if target_face_embs and len(people_matches) < limit:
        # Scan other user face detections with ArcFace embeddings
        existing_people_ids = {item["id"] for item in people_matches}
        other_faces = db.query(FaceDetection, Media)\
            .join(Media, Media.id == FaceDetection.media_id)\
            .filter(
                Media.user_id == user_id,
                Media.id != target.id,
                Media.is_deleted == False,
                FaceDetection.embedding_str.isnot(None)
            )\
            .limit(600).all()

        for f, m in other_faces:
            if m.id in existing_people_ids or m.id == target.id:
                continue
            try:
                f_vec = np.array([float(x) for x in f.embedding_str.split(",")], dtype=np.float32)
                norm = np.linalg.norm(f_vec)
                if norm > 0:
                    f_vec = f_vec / norm
                    sims = [float(np.dot(f_vec, t_vec)) for t_vec in target_face_embs]
                    max_sim = max(sims)
                    if max_sim >= 0.65:
                        existing_people_ids.add(m.id)
                        p_name = person_name_map.get(f.person_id, "Matching Face") if f.person_id else "Matching Face"
                        badge = f"{p_name} ({int(max_sim*100)}%)"
                        item = format_media_item(m, badge=badge, score=max_sim)
                        people_matches.append(item)
                        add_candidate(m.id, m, "people", max_sim, badge)
                        if len(people_matches) >= limit:
                            break
            except Exception:
                continue

    # ---------------------------------------------------------
    # 3. FACET: Nearby Location & Landmarks (GPS + City)
    # ---------------------------------------------------------
    if target.latitude is not None and target.longitude is not None:
        # Search candidate photos within ~0.25 deg bounding box (~25km)
        lat_min, lat_max = target.latitude - 0.25, target.latitude + 0.25
        lon_min, lon_max = target.longitude - 0.25, target.longitude + 0.25

        geo_candidates = db.query(Media).filter(
            Media.user_id == user_id,
            Media.id != target.id,
            Media.is_deleted == False,
            Media.latitude.isnot(None),
            Media.longitude.isnot(None),
            Media.latitude >= lat_min,
            Media.latitude <= lat_max,
            Media.longitude >= lon_min,
            Media.longitude <= lon_max
        ).limit(300).all()

        geo_scored: List[Tuple[Media, float]] = []
        for gm in geo_candidates:
            dist_m = haversine_distance_meters(target.latitude, target.longitude, gm.latitude, gm.longitude)
            if dist_m <= 25000:  # Within 25 km
                geo_scored.append((gm, dist_m))

        geo_scored.sort(key=lambda x: x[1])
        for gm, dist_m in geo_scored[:limit]:
            badge = format_distance(dist_m)
            # Score decays exponentially with distance: 1.0 at 0m, 0.5 at 5km, 0.2 at 25km
            loc_score = math.exp(-dist_m / 6000.0)
            item = format_media_item(gm, badge=badge, score=loc_score)
            location_matches.append(item)
            add_candidate(gm.id, gm, "location", loc_score, badge)

    elif target.location_name:
        # Match on location name or city string
        loc_candidates = db.query(Media).filter(
            Media.user_id == user_id,
            Media.id != target.id,
            Media.is_deleted == False,
            Media.location_name.ilike(f"%{target.location_name.strip()}%")
        ).limit(limit).all()

        for lm in loc_candidates:
            badge = f"At {target.location_name}"
            score = 0.75
            item = format_media_item(lm, badge=badge, score=score)
            location_matches.append(item)
            add_candidate(lm.id, lm, "location", score, badge)

    # ---------------------------------------------------------
    # 4. FACET: Same Outing & Temporal Context (±4 hours)
    # ---------------------------------------------------------
    if target.captured_at:
        w_start = target.captured_at - timedelta(hours=4)
        w_end = target.captured_at + timedelta(hours=4)

        t_candidates = db.query(Media).filter(
            Media.user_id == user_id,
            Media.id != target.id,
            Media.is_deleted == False,
            Media.captured_at >= w_start,
            Media.captured_at <= w_end
        ).order_by(func.abs(func.extract('epoch', Media.captured_at) - func.extract('epoch', target.captured_at))).limit(limit).all()

        for tm in t_candidates:
            diff = tm.captured_at - target.captured_at
            badge = format_time_delta(diff, is_before=(diff.total_seconds() < 0))
            secs = abs(diff.total_seconds())
            t_score = math.exp(-secs / 7200.0)  # Decay across 2 hours
            item = format_media_item(tm, badge=badge, score=t_score)
            time_matches.append(item)
            add_candidate(tm.id, tm, "time", t_score, badge)

    # ---------------------------------------------------------
    # 5. Combined Composite Ranking
    # ---------------------------------------------------------
    combined_results: List[Dict[str, Any]] = []
    for mid, cdata in all_candidate_scores.items():
        m_obj = cdata["media"]
        scores = cdata["scores"]
        badges = cdata["badges"]

        # Multi-attribute weighted composite score
        composite = (
            scores.get("visual", 0.0) * 0.45 +
            scores.get("people", 0.0) * 0.30 +
            scores.get("location", 0.0) * 0.15 +
            scores.get("time", 0.0) * 0.10
        )
        # Bonus for multi-facet intersections (e.g. same person + same place)
        facet_count = len(scores)
        if facet_count > 1:
            composite += (facet_count - 1) * 0.12

        primary_badge = " • ".join(badges[:2]) if badges else "Similar Photo"
        combined_results.append({
            **format_media_item(m_obj, badge=primary_badge, score=composite),
            "matched_facets": list(scores.keys()),
            "facet_scores": scores
        })

    combined_results.sort(key=lambda x: x["similarity_score"], reverse=True)

    # Select results according to requested facet
    if facet == "visual":
        selected_results = visual_matches
    elif facet == "people":
        selected_results = people_matches
    elif facet == "location":
        selected_results = location_matches
    elif facet == "time":
        selected_results = time_matches
    else:
        selected_results = combined_results[:limit]

    return {
        "target_photo": target_info,
        "counts": {
            "all": len(combined_results),
            "visual": len(visual_matches),
            "people": len(people_matches),
            "location": len(location_matches),
            "time": len(time_matches)
        },
        "results": selected_results,
        "facets": {
            "visual": visual_matches[:12],
            "people": people_matches[:12],
            "location": location_matches[:12],
            "time": time_matches[:12]
        }
    }
