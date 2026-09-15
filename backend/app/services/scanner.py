import os
import hashlib
from datetime import datetime
from typing import Optional, Tuple, Dict, Any
from PIL import Image, ExifTags
from sqlalchemy.orm import Session

from app.models.media import Media, SourceType
from app.services.thumbnail import generate_thumbnails
from app.services.triage_engine import classify_media_item
from app.config import settings

SUPPORTED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".heic", ".tiff", ".bmp"}

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

def extract_exif(image: Image.Image) -> Dict[str, Any]:
    metadata = {
        "captured_at": None,
        "camera_make": None,
        "camera_model": None,
        "iso": None,
        "focal_length": None,
        "exposure_time": None,
        "latitude": None,
        "longitude": None
    }
    
    try:
        exif_raw = image.getexif()
        if not exif_raw:
            return metadata
            
        named_exif = {}
        for tag_id, val in exif_raw.items():
            tag_name = ExifTags.TAGS.get(tag_id, tag_id)
            named_exif[tag_name] = val
            
        metadata["camera_make"] = str(named_exif.get("Make", "")).strip() or None
        metadata["camera_model"] = str(named_exif.get("Model", "")).strip() or None
        
        # DateTimeOriginal
        date_str = named_exif.get("DateTimeOriginal") or named_exif.get("DateTime")
        if date_str and isinstance(date_str, str):
            try:
                metadata["captured_at"] = datetime.strptime(date_str, "%Y:%m:%d %H:%M:%S")
            except Exception:
                pass
                
        # GPS Info
        gps_info = exif_raw.get_ifd(ExifTags.IFD.GPSInfo)
        if gps_info:
            gps_tags = {}
            for k, v in gps_info.items():
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
                    if lat_ref != "N":
                        lat = -lat
                    if lon_ref != "E":
                        lon = -lon
                    metadata["latitude"] = lat
                    metadata["longitude"] = lon
    except Exception:
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
    
    # Open image to inspect & extract EXIF
    try:
        with Image.open(file_path) as img:
            exif = extract_exif(img)
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
        latitude=exif["latitude"],
        longitude=exif["longitude"],
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
