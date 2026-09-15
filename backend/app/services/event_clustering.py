from datetime import datetime, timedelta
from typing import List, Dict, Any
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

def cluster_events(db: Session, max_gap_hours: int = 4) -> List[Dict[str, Any]]:
    """
    Groups memory photos into spatiotemporal events / outings.
    Photos taken within `max_gap_hours` are linked together into an event.
    """
    photos = db.query(Media).filter(
        Media.category == MediaCategory.MEMORY,
        Media.is_deleted == False,
        Media.is_archived == False
    ).order_by(desc(Media.captured_at)).all()

    if not photos:
        return []

    events = []
    current_cluster = [photos[0]]

    for i in range(1, len(photos)):
        prev_photo = photos[i - 1]
        curr_photo = photos[i]

        if prev_photo.captured_at and curr_photo.captured_at:
            delta = abs((prev_photo.captured_at - curr_photo.captured_at).total_seconds() / 3600.0)
            if delta <= max_gap_hours:
                current_cluster.append(curr_photo)
                continue

        # End of current cluster
        events.append(_create_event_payload(current_cluster))
        current_cluster = [curr_photo]

    if current_cluster:
        events.append(_create_event_payload(current_cluster))

    return events

def _create_event_payload(cluster: List[Media]) -> Dict[str, Any]:
    first = cluster[0]
    last = cluster[-1]
    
    start_time = min(m.captured_at for m in cluster if m.captured_at) if any(m.captured_at for m in cluster) else datetime.utcnow()
    day_str = start_time.strftime("%A, %b %d, %Y")
    time_of_day = get_time_of_day(start_time)
    
    # Check for location
    location_names = [m.location_name for m in cluster if m.location_name]
    if location_names:
        title = f"{location_names[0]} {time_of_day}"
    else:
        title = f"{day_str} ({time_of_day})"

    # Select best cover: not blurry, largest size
    sharp_photos = [m for m in cluster if not m.is_blurry]
    cover = sharp_photos[0] if sharp_photos else cluster[0]

    return {
        "title": title,
        "date": day_str,
        "photo_count": len(cluster),
        "cover_id": cover.id,
        "cover_thumbnail_url": f"/api/v1/media/{cover.id}/thumbnail?size=1080",
        "media_ids": [m.id for m in cluster],
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
        } for m in cluster]
    }
