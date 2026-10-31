import math
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from collections import Counter
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.models.media import Media, MediaCategory

def get_time_of_day(dt: datetime) -> str:
    hour = dt.hour
    if 5 <= hour < 12:
        return "Morning"
    elif 12 <= hour < 17:
        return "Afternoon"
    elif 17 <= hour < 21:
        return "Evening"
    else:
        return "Night"

def haversine_km(lat1: Optional[float], lon1: Optional[float], lat2: Optional[float], lon2: Optional[float]) -> Optional[float]:
    if None in (lat1, lon1, lat2, lon2):
        return None
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2)**2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2)**2
    return 2 * R * math.atan2(math.sqrt(a), math.sqrt(1 - a))

def cluster_events(db: Session, max_gap_hours: int = 4, user_id: Optional[int] = None, min_photos: int = 5) -> List[Dict[str, Any]]:
    """
    Groups memory photos into spatiotemporal events / outing stories.
    Intelligently connects multi-day trips in the same city/region (<= 36h gap)
    and single-day outings (<= 4h gap). Filters out isolated single photos (< min_photos).
    Strictly isolated by user_id to prevent multi-tenant data leaks.
    """
    if user_id is None:
        return []

    photos = db.query(Media).filter(
        Media.user_id == user_id,
        Media.category == MediaCategory.MEMORY,
        Media.is_deleted == False,
        Media.is_archived == False
    ).order_by(Media.captured_at.asc()).all()

    if not photos:
        return []

    clusters: List[List[Media]] = []
    current_cluster: List[Media] = []

    for photo in photos:
        if not photo.captured_at:
            continue

        if not current_cluster:
            current_cluster.append(photo)
            continue

        prev = current_cluster[-1]
        delta_h = (photo.captured_at - prev.captured_at).total_seconds() / 3600.0

        prev_city = prev.location_name.split(",")[0].strip() if prev.location_name else None
        curr_city = photo.location_name.split(",")[0].strip() if photo.location_name else None

        dist = haversine_km(prev.latitude, prev.longitude, photo.latitude, photo.longitude)

        # Smart clustering criteria:
        # 1. Close in time (<= max_gap_hours, e.g. 4h) - continuous outing
        # 2. Multi-day trip in same destination/region:
        #    delta_h <= 36h AND (identical city or dist <= 35km)
        is_same_trip = False
        if delta_h <= max_gap_hours:
            is_same_trip = True
        elif delta_h <= 36.0:
            if prev_city and curr_city and prev_city.lower() == curr_city.lower():
                is_same_trip = True
            elif dist is not None and dist <= 35.0:
                is_same_trip = True

        if is_same_trip:
            current_cluster.append(photo)
        else:
            if len(current_cluster) >= min_photos:
                clusters.append(current_cluster)
            current_cluster = [photo]

    if len(current_cluster) >= min_photos:
        clusters.append(current_cluster)

    # Convert clusters to event payloads, ordered newest first (descending)
    clusters.sort(key=lambda c: c[-1].captured_at, reverse=True)
    return [_create_event_payload(c) for c in clusters]

def _create_event_payload(cluster: List[Media]) -> Dict[str, Any]:
    # Cluster is sorted asc by captured_at
    cluster_sorted = sorted([m for m in cluster if m.captured_at], key=lambda m: m.captured_at)
    if not cluster_sorted:
        cluster_sorted = cluster

    start_time = cluster_sorted[0].captured_at or datetime.utcnow()
    end_time = cluster_sorted[-1].captured_at or start_time

    duration_days = (end_time.date() - start_time.date()).days

    # Identify primary city / landmark
    cities = [m.location_name.split(",")[0].strip() for m in cluster if m.location_name]
    top_city = Counter(cities).most_common(1)[0][0] if cities else None

    start_day_str = start_time.strftime("%a, %b %d, %Y")
    end_day_str = end_time.strftime("%a, %b %d, %Y")
    time_of_day = get_time_of_day(start_time)

    if top_city:
        if duration_days >= 1:
            title = f"Trip to {top_city} ({start_time.strftime('%b %d')} - {end_time.strftime('%b %d, %Y')})"
            date_label = f"{start_time.strftime('%b %d')} - {end_time.strftime('%b %d, %Y')}"
        else:
            title = f"{top_city} • {time_of_day}"
            date_label = start_day_str
    else:
        if duration_days >= 1:
            title = f"Outing ({start_time.strftime('%b %d')} - {end_time.strftime('%b %d, %Y')})"
            date_label = f"{start_time.strftime('%b %d')} - {end_time.strftime('%b %d, %Y')}"
        else:
            title = f"{start_day_str} ({time_of_day})"
            date_label = start_day_str

    # Select best cover: prefer favorite, then non-blurry, largest resolution
    favorites = [m for m in cluster if m.is_favorite]
    sharp_photos = [m for m in cluster if not m.is_blurry]
    if favorites and not favorites[0].is_blurry:
        cover = favorites[0]
    elif sharp_photos:
        cover = max(sharp_photos, key=lambda m: (m.width or 0) * (m.height or 0))
    else:
        cover = cluster[0]

    return {
        "id": f"event_{start_time.strftime('%Y%m%d%H%M')}_{cover.id}",
        "title": title,
        "date": date_label,
        "photo_count": len(cluster),
        "cover_id": cover.id,
        "cover_thumbnail_url": f"/api/v1/media/{cover.id}/thumbnail?size=1080",
        "media_ids": [m.id for m in cluster_sorted],
        "items": [{
            "id": m.id,
            "filename": m.filename,
            "category": m.category,
            "width": m.width,
            "height": m.height,
            "captured_at": m.captured_at,
            "is_favorite": m.is_favorite,
            "is_blurry": m.is_blurry,
            "thumbnail_url": f"/api/v1/media/{m.id}/thumbnail?size=256"
        } for m in cluster_sorted]
    }
