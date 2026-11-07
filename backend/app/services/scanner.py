import os
import re
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
from app.services.thumbnail import generate_thumbnails, open_image_for_thumbnail
from app.services.triage_engine import classify_media_item
from app.config import settings

# Register pillow-heif for transparent HEIC / HEIF loading
try:
    import pillow_heif
    pillow_heif.register_heif_opener()
except Exception:
    pass

RAW_EXTENSIONS = {".dng", ".cr2", ".nef", ".arw", ".rw2", ".orf", ".pef", ".raf"}
VIDEO_EXTENSIONS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v"}
IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tiff", ".bmp"}
SUPPORTED_EXTENSIONS = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS | RAW_EXTENSIONS

_GEOCODE_CACHE: Dict[Tuple[float, float], str] = {}

def reverse_geocode(lat: float, lon: float) -> Optional[str]:
    """Reverse geocodes GPS coordinates into a city/region name with offline GeoNames KD-Tree + online fallback."""
    cache_key = (round(lat, 3), round(lon, 3))
    if cache_key in _GEOCODE_CACHE:
        return _GEOCODE_CACHE[cache_key]

    # 1. High-speed offline reverse geocoder (Instant, zero network requests, handles India/global)
    try:
        import reverse_geocoder as rg
        results = rg.search([(lat, lon)], verbose=False)
        if results:
            r = results[0]
            city = r.get("name")
            admin1 = r.get("admin1")  # State/Province
            country_code = r.get("cc")
            country_names = {
                "IN": "India", "US": "United States", "GB": "United Kingdom",
                "CA": "Canada", "AU": "Australia", "DE": "Germany", "FR": "France",
                "AE": "UAE", "SG": "Singapore", "JP": "Japan"
            }
            country = country_names.get(country_code, country_code)
            parts = [p for p in [city, admin1, country] if p]
            if parts:
                name = ", ".join(parts)
                _GEOCODE_CACHE[cache_key] = name
                return name
    except Exception:
        pass

    # 2. Online Nominatim fallback if offline geocoder misses
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

_all_extracts_cache: Optional[Dict[str, datetime]] = None

def get_all_extracts_cache() -> Dict[str, datetime]:
    """Pre-caches filenames in /data/originals/all_extracts to provide O(1) date resolution."""
    global _all_extracts_cache
    if _all_extracts_cache is not None:
        return _all_extracts_cache

    cache: Dict[str, datetime] = {}
    base_dir = "/data/originals/all_extracts"
    if os.path.exists(base_dir):
        try:
            for root, dirs, files in os.walk(base_dir):
                ym = re.search(r'/(20\d{2})(?:-\d+)?(?:/|$)', root)
                folder_year = int(ym.group(1)) if ym else None
                for f in files:
                    if f not in cache:
                        try:
                            cand = os.path.join(root, f)
                            st = os.stat(cand)
                            dt = datetime.fromtimestamp(st.st_mtime)
                            if folder_year and dt.year != folder_year:
                                dt = datetime(folder_year, dt.month if dt.year < 2025 else 1, dt.day if dt.year < 2025 else 1, 12, 0, 0)
                            cache[f] = dt
                        except Exception:
                            pass
        except Exception:
            pass
    _all_extracts_cache = cache
    return _all_extracts_cache

def infer_captured_date(file_path: str, filename: Optional[str] = None) -> Optional[datetime]:
    """
    Intelligently extracts the true historical capture date when EXIF is missing:
    1. Google Takeout JSON sidecars (e.g., photo.jpg.json, photo.json)
    2. Filename date patterns (WhatsApp, Pixel, Samsung, Windows Camera, Screenshots, ISO dates)
    3. Matching original file in /data/originals/all_extracts (O(1) cached lookup)
    4. Parent directory patterns (e.g. /2019/, /2020-05/, /captures-20230405/)
    """
    import json
    fname = filename or os.path.basename(file_path)

    # 1. Google Takeout sidecar check
    for sidecar in [f"{file_path}.json", f"{os.path.splitext(file_path)[0]}.json", f"{file_path}.JSON"]:
        if os.path.isfile(sidecar):
            try:
                with open(sidecar, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    ts = data.get("photoTakenTime", {}).get("timestamp") or data.get("creationTime", {}).get("timestamp")
                    if ts:
                        return datetime.fromtimestamp(int(ts))
            except Exception:
                pass

    # Clean stripped name by removing upload server prefix (e.g. 20261105_161855_04_d392_)
    stripped = re.sub(r'^\d{8}_\d{6}_[0-9a-fA-F_]+_', '', fname)

    # 2. Filename date patterns
    # WhatsApp (IMG-YYYYMMDD-WA*), Pixel/Android (IMG_YYYYMMDD_*, VID_YYYYMMDD_*), Windows (WIN_YYYYMMDD_*), Screenshots
    m = re.search(r'(?:IMG|VID|PXL|WP|PHOTO|WIN|Screenshot)[-_]?(20\d{2})(\d{2})(\d{2})[-_]?(\d{2})?(\d{2})?(\d{2})?', stripped, re.I)
    if m:
        g = m.groups()
        try:
            y, mon, d = int(g[0]), int(g[1]), int(g[2])
            hh = int(g[3]) if g[3] else 12
            mm = int(g[4]) if g[4] else 0
            ss = int(g[5]) if g[5] else 0
            if 1995 <= y <= 2025 and 1 <= mon <= 12 and 1 <= d <= 31:
                return datetime(y, mon, d, min(23, max(0, hh)), min(59, max(0, mm)), min(59, max(0, ss)))
        except Exception:
            pass

    # Delimited YYYY-MM-DD or YYYY_MM_DD
    m = re.search(r'\b(20\d{2})[-_](0[1-9]|1[0-2])[-_](0[1-9]|[12]\d|3[01])\b', stripped)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), 12, 0, 0)
        except Exception:
            pass

    # 3. Check matching original in /data/originals/all_extracts (O(1) cached lookup)
    if "/uploads/" in file_path:
        cache = get_all_extracts_cache()
        if stripped in cache:
            cand_dt = cache[stripped]
            if cand_dt.year < 2025:
                return cand_dt

    # 4. Parent directory patterns
    ym = re.search(r'/(20\d{2})(?:-\d+)?(?:/|$)', file_path)
    if ym:
        y = int(ym.group(1))
        if 1995 <= y <= 2025:
            return datetime(y, 1, 1, 12, 0, 0)

    m = re.search(r'captures-(20\d{2})(\d{2})(\d{2})', file_path)
    if m:
        try:
            return datetime(int(m.group(1)), int(m.group(2)), int(m.group(3)), 12, 0, 0)
        except Exception:
            pass

    return None

def scan_file(db: Session, file_path: str, source_type: SourceType = SourceType.LOCAL, source_id: Optional[str] = None, user_id: Optional[int] = None) -> Optional[Media]:
    """Scans and ingests a single file into the database."""
    ext = os.path.splitext(file_path)[1].lower()
    if ext not in SUPPORTED_EXTENSIONS:
        return None
        
    if not os.path.isfile(file_path):
        return None

    if user_id is None:
        from app.models.user import User
        primary_user = db.query(User).order_by(User.id.asc()).first()
        user_id = primary_user.id if primary_user else 1
        
    # Check if file path already exists
    existing = db.query(Media).filter(Media.original_path == file_path).first()
    if existing:
        if user_id and existing.user_id != user_id:
            existing.user_id = user_id
            db.commit()
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
        # Attempt date inference from video filename, sidecars, or directory patterns
        inferred_dt = infer_captured_date(file_path, os.path.basename(file_path))
        if inferred_dt:
            captured_at = inferred_dt

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
        img = open_image_for_thumbnail(file_path)
        try:
            exif = extract_exif(img, file_path=file_path)
            if exif["captured_at"] and exif["captured_at"].year <= 2025:
                captured_at = exif["captured_at"]
            else:
                # Fall back to multi-tier date inference if EXIF date is missing
                inferred_dt = infer_captured_date(file_path, os.path.basename(file_path))
                if inferred_dt:
                    captured_at = inferred_dt
                
            width, height = img.size
        finally:
            try:
                img.close()
            except Exception:
                pass
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
    
    # Check if paired video or motion photo exists
    fname_base = os.path.splitext(file_path)[0]
    base_name = os.path.basename(file_path)
    has_motion = any(os.path.isfile(fname_base + e) for e in [".mov", ".MOV", ".mp4", ".MP4"]) or base_name.startswith("MVIMG_") or base_name.endswith("_MP.jpg") or base_name.endswith("_MP.jpeg")

    # Create Media Record
    media = Media(
        user_id=user_id,
        filename=os.path.basename(file_path),
        original_path=file_path,
        file_size=file_size,
        file_hash=file_hash,
        width=width,
        height=height,
        category=category,
        triage_confidence=confidence,
        has_motion_photo=has_motion,
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
    
    try:
        db.add(media)
        db.commit()
        db.refresh(media)
    except Exception as e:
        db.rollback()
        existing = db.query(Media).filter(Media.original_path == file_path).first()
        if existing:
            return existing
        raise e
    
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

def scan_directory(db: Session, dir_path: str, user_id: Optional[int] = None, progress_callback: Optional[Any] = None) -> Dict[str, Any]:
    """Recursively scans a directory for photos with fast-skip for indexed files and progress reporting."""
    if not os.path.isdir(dir_path):
        return {"scanned": 0, "added": 0, "existing": 0, "error": f"Directory not found: {dir_path}"}
        
    if user_id is None:
        from app.models.user import User
        primary_user = db.query(User).order_by(User.id.asc()).first()
        user_id = primary_user.id if primary_user else 1

    # First pass: collect all supported files
    all_files = []
    for root, _, files in os.walk(dir_path):
        for file in files:
            ext = os.path.splitext(file)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                all_files.append(os.path.join(root, file))

    total = len(all_files)
    scanned = 0
    added = 0
    existing = 0

    for i, full_path in enumerate(all_files):
        scanned += 1
        exists = db.query(Media.id).filter(Media.original_path == full_path).first()
        if exists:
            existing += 1
        else:
            media = scan_file(db, full_path, SourceType.LOCAL, user_id=user_id)
            if media:
                if media.original_path == full_path:
                    added += 1
                else:
                    existing += 1

        if progress_callback and (i % 25 == 0 or i == total - 1):
            pct = int(((i + 1) / max(total, 1)) * 100)
            progress_callback(i + 1, total, pct, os.path.basename(full_path), added)

    return {"scanned": scanned, "added": added, "existing": existing, "total": total, "status": "success"}

def scan_file_in_memory(
    db: Session,
    buffer: io.BytesIO,
    filename: str,
    source_type: SourceType = SourceType.GOOGLE_DRIVE,
    source_id: Optional[str] = None,
    thumbnail_link: Optional[str] = None,
    user_id: Optional[int] = None
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
        user_id=user_id,
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

    try:
        db.add(media)
        db.commit()
        db.refresh(media)
    except Exception as e:
        db.rollback()
        existing = db.query(Media).filter(Media.original_path == file_path).first()
        if existing:
            return existing
        raise e

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
