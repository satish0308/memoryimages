import os
import hashlib
from datetime import datetime
import io
import json
import urllib.request
from typing import Optional, Tuple, Dict, Any
from PIL import Image, ExifTags
from sqlalchemy.orm import Session

# Prevent DecompressionBombWarning for ultra high-res / composite mobile photos
Image.MAX_IMAGE_PIXELS = None

from app.models.media import Media, SourceType
from app.services.thumbnail import generate_thumbnails
from app.services.triage_engine import classify_media_item
from app.config import settings

SUPPORTED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".webp", ".heic", ".tiff", ".bmp",
    ".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"
}

_GEOCODE_CACHE: Dict[Tuple[float, float], str] = {}

def reverse_geocode(lat: float, lon: float) -> Optional[str]:
    """Reverse geocodes GPS coordinates into a city/region name with in-memory caching."""
    cache_key = (round(lat, 3), round(lon, 3))
    if cache_key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[cache_key]

    try:
        url = f"https://nominatim.openstreetmap.org/reverse?format=json&lat={lat}&lon={lon}&zoom=12"
        req = urllib.request.Request(url, headers={"User-Agent": "MyMemoryPics/1.0 (contact@memorypics.local)"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            data = json.loads(resp.read().decode())
            addr = data.get("address", {})
            city = addr.get("city") or addr.get("town") or addr.get("suburb") or addr.get("village") or addr.get("county")
            state = addr.get("state")
            country = addr.get("country")
            parts = [p for p in [city, state, country] if p]
            name = ", ".join(parts) if parts else data.get("display_name", "")
            if name:
                _GEOCODE_CACHE[cache_key] = name
                return name
    except Exception:
        pass
    return None

def compute_file_hash(filepath: str) -> str:
    hasher = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()

def _convert_gps_to_degrees(value) -> Optional[float]:
    """Helper function to convert GPS coordinates stored in EXIF to decimal degrees."""
    try:
        d = float(value[0])
        m = float(value[1])
        s = float(value[2])
        return d + (m / 60.0) + (s / 3600.0)
    except Exception:
        return None

def extract_gps_from_bytes(buf: bytes) -> Optional[Tuple[float, float]]:
    """
    Exhaustively scans image buffer for GPS coordinates, including multi-picture
    concatenated JPEGs (e.g. Xiaomi Portrait mode, Samsung dual-camera captures).
    """
    # 1. Primary image check
    try:
        img = Image.open(io.BytesIO(buf))
        raw_exif = img.getexif()
        if raw_exif:
            gps_ifd = raw_exif.get_ifd(ExifTags.IFD.GPSInfo)
            if gps_ifd and 2 in gps_ifd and 4 in gps_ifd:
                lat = _convert_gps_to_degrees(gps_ifd[2])
                lon = _convert_gps_to_degrees(gps_ifd[4])
                lat_ref = gps_ifd.get(1, "N")
                lon_ref = gps_ifd.get(3, "E")
                if lat is not None and lon is not None:
                    if str(lat_ref).strip().upper() != "N":
                        lat = -lat
                    if str(lon_ref).strip().upper() != "E":
                        lon = -lon
                    return round(lat, 6), round(lon, 6)
    except Exception:
        pass

    # 2. Concatenated / Embedded JPEG scan (search for \xff\xd8\xff markers after offset 0)
    pos = 0
    while True:
        pos = buf.find(b"\xff\xd8\xff", pos + 2)
        if pos == -1:
            break
        try:
            sub_img = Image.open(io.BytesIO(buf[pos:]))
            sub_exif = sub_img.getexif()
            if sub_exif:
                gps_ifd = sub_exif.get_ifd(ExifTags.IFD.GPSInfo)
                if gps_ifd and 2 in gps_ifd and 4 in gps_ifd:
                    lat = _convert_gps_to_degrees(gps_ifd[2])
                    lon = _convert_gps_to_degrees(gps_ifd[4])
                    lat_ref = gps_ifd.get(1, "N")
                    lon_ref = gps_ifd.get(3, "E")
                    if lat is not None and lon is not None:
                        if str(lat_ref).strip().upper() != "N":
                            lat = -lat
                        if str(lon_ref).strip().upper() != "E":
                            lon = -lon
                        return round(lat, 6), round(lon, 6)
        except Exception:
            pass
    return None

def extract_exif(image: Image.Image, file_path: Optional[str] = None) -> Dict[str, Any]:
    metadata = {
        "captured_at": None,
        "camera_make": None,
        "camera_model": None,
        "iso": None,
        "focal_length": None,
        "exposure_time": None,
        "latitude": None,
        "longitude": None,
        "location_name": None
    }
    
    try:
        # Check both _getexif() and getexif() IFDs for complete tag coverage
        legacy_exif = image._getexif() or {}
        raw_exif = image.getexif()
        exif_ifd = {}
        gps_ifd = {}
        if raw_exif:
            try:
                exif_ifd = raw_exif.get_ifd(ExifTags.IFD.Exif) or {}
            except Exception:
                pass
            try:
                gps_ifd = raw_exif.get_ifd(ExifTags.IFD.GPSInfo) or {}
            except Exception:
                pass

        # Merge tag dictionaries
        all_tags = {}
        for k, v in legacy_exif.items():
            name = ExifTags.TAGS.get(k, k)
            all_tags[name] = v
        for k, v in exif_ifd.items():
            name = ExifTags.TAGS.get(k, k)
            all_tags[name] = v

        metadata["camera_make"] = str(all_tags.get("Make", "")).strip() or None
        metadata["camera_model"] = str(all_tags.get("Model", "")).strip() or None

        # Clean model name if vendor provides friendly tag (e.g. tag 39424 for Xiaomi)
        if all_tags.get(39424):
            metadata["camera_model"] = str(all_tags.get(39424)).strip()
        
        # DateTimeOriginal
        date_str = all_tags.get("DateTimeOriginal") or all_tags.get("DateTimeDigitized") or all_tags.get("DateTime")
        if date_str and isinstance(date_str, str):
            try:
                metadata["captured_at"] = datetime.strptime(date_str[:19], "%Y:%m:%d %H:%M:%S")
            except Exception:
                pass

        # ISO
        iso_val = all_tags.get("ISOSpeedRatings") or all_tags.get("PhotographicSensitivity")
        if iso_val:
            try:
                metadata["iso"] = int(iso_val)
            except Exception:
                pass

        # Focal Length
        fl = all_tags.get("FocalLength")
        if fl is not None:
            try:
                metadata["focal_length"] = round(float(fl), 1)
            except Exception:
                pass

        # Exposure Time
        exp = all_tags.get("ExposureTime")
        if exp is not None:
            try:
                exp_f = float(exp)
                if 0 < exp_f < 1:
                    metadata["exposure_time"] = f"1/{int(round(1.0 / exp_f))}s"
                else:
                    metadata["exposure_time"] = f"{round(exp_f, 2)}s"
            except Exception:
                metadata["exposure_time"] = str(exp)
                
        # GPS Info from GPSInfo IFD or legacy tag 34853
        gps_data = all_tags.get("GPSInfo") or gps_ifd or legacy_exif.get(34853)
        if gps_data and isinstance(gps_data, dict):
            gps_tags = {}
            for k, v in gps_data.items():
                tag_name = ExifTags.GPSTAGS.get(k, k)
                gps_tags[tag_name] = v
                
            lat_val = gps_tags.get("GPSLatitude")
            lat_ref = gps_tags.get("GPSLatitudeRef")
            lon_val = gps_tags.get("GPSLongitude")
            lon_ref = gps_tags.get("GPSLongitudeRef")
            
            if lat_val and lat_ref and lon_val and lon_ref:
                lat = _convert_gps_to_degrees(lat_val)
                lon = _convert_gps_to_degrees(lon_val)
                if lat is not None and lon is not None:
                    if str(lat_ref).strip().upper() != "N":
                        lat = -lat
                    if str(lon_ref).strip().upper() != "E":
                        lon = -lon
                    metadata["latitude"] = round(lat, 6)
                    metadata["longitude"] = round(lon, 6)

        # If GPS not found in direct EXIF, check file buffer for embedded/multi-picture JPEGs
        if metadata["latitude"] is None and file_path and os.path.isfile(file_path):
            try:
                with open(file_path, "rb") as fp:
                    embedded_coords = extract_gps_from_bytes(fp.read())
                    if embedded_coords:
                        metadata["latitude"] = embedded_coords[0]
                        metadata["longitude"] = embedded_coords[1]
            except Exception:
                pass

        # Auto-resolve reverse geocode location name
        if metadata["latitude"] is not None and metadata["longitude"] is not None:
            metadata["location_name"] = reverse_geocode(metadata["latitude"], metadata["longitude"])

    except Exception as e:
        pass
        
    return metadata

def scan_file(db: Session, file_path: str, source_type: SourceType = SourceType.LOCAL, source_id: Optional[str] = None) -> Optional[Media]:
    """Scans and ingests a single file into the database."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return None
        
    if not os.path.isfile(file_path):
        return None
        
    # Check if file path already exists
    existing = db.query(Media).filter(Media.original_path == file_path).first()
    if existing:
        return existing
        
    stat = os.stat(file_path)
    file_size = stat.st_size
    file_hash = compute_file_hash(file_path)
    
    # Check if duplicate hash exists
    duplicate_hash = db.query(Media).filter(Media.file_hash == file_hash).first()
    if duplicate_hash:
        return duplicate_hash
        
    captured_at = datetime.fromtimestamp(stat.st_mtime)

    # Check if video file
    from app.services.video_engine import is_video_file, probe_video_metadata, extract_video_keyframes
    from app.models.media import MediaCategory
    if is_video_file(file_path):
        meta = probe_video_metadata(file_path)
        media = Media(
            filename=os.path.basename(file_path),
            original_path=file_path,
            file_size=file_size,
            file_hash=file_hash,
            mime_type=f"video/{ext.lstrip('.')}" if ext != ".mov" else "video/quicktime",
            width=meta.get("width", 1280),
            height=meta.get("height", 720),
            duration_seconds=meta.get("duration", 0.0),
            category=MediaCategory.MEMORY,
            captured_at=captured_at,
            source_type=source_type,
            source_id=source_id
        )
        db.add(media)
        db.commit()
        db.refresh(media)
        try:
            extract_video_keyframes(db, media)
        except Exception as e:
            print(f"Error extracting keyframes for {file_path}: {e}")
        return media
    
    # Open image to inspect & extract EXIF
    try:
        with Image.open(file_path) as img:
            exif = extract_exif(img, file_path=file_path)
            if exif["captured_at"]:
                captured_at = exif["captured_at"]
                
            width, height = img.size
    except Exception:
        # Not a valid image file
        return None
        
    # Classify Category (Memory vs Screenshot vs Bill vs Meme)
    category, confidence, expires_at = classify_media_item(
        filename=os.path.basename(file_path),
        width=width,
        height=height,
        camera_make=exif["camera_make"],
        camera_model=exif["camera_model"],
        captured_at=captured_at
    )
    
    # Create Media Record
    media = Media(
        filename=os.path.basename(file_path),
        original_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        width=width,
        height=height,
        category=category,
        triage_confidence=confidence,
        captured_at=captured_at,
        expires_at=expires_at,
        camera_make=exif["camera_make"],
        camera_model=exif["camera_model"],
        iso=exif["iso"],
        focal_length=exif["focal_length"],
        exposure_time=exif["exposure_time"],
        latitude=exif["latitude"],
        longitude=exif["longitude"],
        location_name=exif.get("location_name"),
        source_type=source_type,
        source_id=source_id
    )
    
    db.add(media)
    db.commit()
    db.refresh(media)
    
    # Generate multi-tier WebP thumbnails & blurriness/phash
    try:
        thumb_data = generate_thumbnails(file_path, media.id)
        media.thumbnail_256_path = thumb_data["thumbnail_256_path"]
        media.thumbnail_1080_path = thumb_data["thumbnail_1080_path"]
        media.perceptual_hash = thumb_data["perceptual_hash"]
        media.blurriness_score = thumb_data["blurriness_score"]
        media.is_blurry = thumb_data["is_blurry"]
        if "blur_type" in thumb_data:
            media.blur_type = thumb_data["blur_type"]
        if "is_bokeh" in thumb_data:
            media.is_bokeh = thumb_data["is_bokeh"]
        db.commit()
    except Exception as e:
        print(f"Error generating thumbnail for {file_path}: {e}")
        
    return media

def scan_directory(db: Session, dir_path: str) -> Dict[str, Any]:
    """Recursively scans a directory for photos."""
    if not os.path.isdir(dir_path):
        return {"scanned": 0, "added": 0, "error": f"Directory not found: {dir_path}"}
        
    scanned = 0
    added = 0
    
    for root, _, files in os.walk(dir_path):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                scanned += 1
                full_path = os.path.join(root, file)
                media = scan_file(db, full_path, SourceType.LOCAL)
                if media:
                    added += 1
                    
    return {"scanned": scanned, "added": added, "status": "success"}

def scan_file_in_memory(
    db: Session,
    buffer: io.BytesIO,
    filename: str,
    source_type: SourceType = SourceType.GOOGLE_DRIVE,
    source_id: Optional[str] = None,
    thumbnail_link: Optional[str] = None
) -> Optional[Media]:
    """
    Ingests a photo purely in-memory with zero local disk writes or volume storage consumption.
    Extracts EXIF/GPS, runs categorization and face detection on RAM buffers.
    """
    data_bytes = buffer.getvalue()
    if len(data_bytes) == 0:
        return None

    file_size = len(data_bytes)
    file_hash = hashlib.sha256(data_bytes).hexdigest()

    # Check for duplicate by source_id or file_hash
    if source_id:
        existing = db.query(Media).filter(
            Media.source_type == source_type,
            Media.source_id == source_id
        ).first()
        if existing:
            return existing

    duplicate = db.query(Media).filter(Media.file_hash == file_hash).first()
    if duplicate:
        return duplicate

    try:
        buffer.seek(0)
        with Image.open(buffer) as img:
            exif = extract_exif(img)
            # Deep embedded scan on buffer bytes if GPS missing
            if exif["latitude"] is None:
                embedded = extract_gps_from_bytes(data_bytes)
                if embedded:
                    exif["latitude"] = embedded[0]
                    exif["longitude"] = embedded[1]
                    exif["location_name"] = reverse_geocode(embedded[0], embedded[1])

            width, height = img.size
            captured_at = exif["captured_at"] or datetime.utcnow()

            # In-memory blurriness and perceptual hash
            try:
                import imagehash
                from app.services.thumbnail import calculate_blurriness
                img_rgb = img.convert("RGB")
                blur_score = calculate_blurriness(img_rgb)
                is_blurry = blur_score < 80.0
                phash_val = str(imagehash.phash(img_rgb))
            except Exception:
                blur_score = 100.0
                is_blurry = False
                phash_val = None

    except Exception as e:
        return None

    # Triage classification
    category, confidence, expires_at = classify_media_item(
        filename=filename,
        width=width,
        height=height,
        camera_make=exif["camera_make"],
        camera_model=exif["camera_model"],
        captured_at=captured_at
    )

    # In-memory virtual path (zero local disk persistence)
    virtual_path = f"gdrive://{source_id}/{filename}" if source_id else f"memory://{file_hash}/{filename}"

    media = Media(
        filename=filename,
        original_path=virtual_path,
        file_size=file_size,
        file_hash=file_hash,
        perceptual_hash=phash_val,
        width=width,
        height=height,
        category=category,
        triage_confidence=confidence,
        blurriness_score=blur_score,
        is_blurry=is_blurry,
        captured_at=captured_at,
        expires_at=expires_at,
        camera_make=exif["camera_make"],
        camera_model=exif["camera_model"],
        iso=exif["iso"],
        focal_length=exif["focal_length"],
        exposure_time=exif["exposure_time"],
        latitude=exif["latitude"],
        longitude=exif["longitude"],
        location_name=exif.get("location_name"),
        thumbnail_256_path=f"gdrive_cdn://{source_id}" if thumbnail_link else None,
        source_type=source_type,
        source_id=source_id
    )

    db.add(media)
    db.commit()
    db.refresh(media)

    # In-memory face detection
    try:
        from app.services.face_engine import detect_faces_in_image
        buffer.seek(0)
        with Image.open(buffer) as img_faces:
            face_boxes = detect_faces_in_image(img_faces)
            if face_boxes:
                from app.models.person import FaceDetection
                for b in face_boxes:
                    fd = FaceDetection(
                        media_id=media.id,
                        box_x=b["box_x"],
                        box_y=b["box_y"],
                        box_w=b["box_w"],
                        box_h=b["box_h"],
                        confidence=b["confidence"]
                    )
                    db.add(fd)
                db.commit()
    except Exception:
        pass

    return media
