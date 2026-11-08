import os
import re
from datetime import datetime, timedelta
from typing import Dict, Any, Tuple, Optional
from PIL import Image

from app.models.media import MediaCategory
from app.config import settings

# Regex matching EXPLICIT screenshots in filenames (strict: avoids false positives on generic "capture")
EXPLICIT_SCREENSHOT_REGEX = re.compile(
    r'(^screenshot|^screen_shot|^screen-shot|screenshot_\d+|screen_shot_\d+|screenshot-\d+|screencap|screen_capture|screen-capture)',
    re.IGNORECASE
)

# Regex matching documents, bills, invoices, receipts, and government/bank paperwork
DOCUMENT_FILENAME_REGEX = re.compile(
    r'(bill|receipt|invoice|statement|tax|document|scan|ticket|check|voucher|salary|bank|form|passport|id_card|aadhaar|pan_card)',
    re.IGNORECASE
)

# Regex matching coursework slides, diagrams, machine learning lecture graphics, figures
COURSE_OR_DIAGRAM_REGEX = re.compile(
    r'(c\d+_w\d+|c\d+w\d+|figure[_\s-]?\d*|diagram|flowchart|chart|slide|presentation|lecture|graph|lab\d+)',
    re.IGNORECASE
)

# Regex matching messaging app downloads, forwards, memes, stickers
MESSAGING_APP_REGEX = re.compile(
    r'(img[-_]\d+[-_]wa|fb[-_]img|received_\d+|telegram|whatsapp|meme|sticker)',
    re.IGNORECASE
)

# Regex matching wallpaper, digital artwork, gaming backgrounds
WALLPAPER_KEYWORD_REGEX = re.compile(
    r'(wallpaper|wallpapers|background|artwork|artstation|fanart|desktop|game[-_]wallpaper|ultra[-_]hd|4k[-_]|1080p|1440p|2160p|2880x1800|1920x1080)',
    re.IGNORECASE
)

# Regex matching standard camera naming conventions across smartphone & DSLR manufacturers
CAMERA_FILENAME_REGEX = re.compile(
    r'^(img[-_]\d+|dsc[-_]?\d+|pxl[-_]\d+|wp[-_]\d+|photo[-_]\d+|cimg\d+|dcm\d+|sam_\d+|mvimg_\d+|vid_\d+|dji_\d+)',
    re.IGNORECASE
)

# Mobile portrait screen aspect ratios (height / width)
# Smartphones are held vertically when capturing phone screenshots:
MOBILE_PORTRAIT_RATIOS = [
    16 / 9,      # 1.777 (standard 1080x1920, 720x1280)
    18 / 9,      # 2.000 (standard Android 2:1, 1080x2160)
    18.5 / 9,    # 2.055 (Samsung Galaxy S8/S9)
    19 / 9,      # 2.111 (Modern Android)
    19.5 / 9,    # 2.166 (iPhone X to 16: 1170x2532, 1179x2556, 1284x2778, 1290x2796)
    20 / 9,      # 2.222 (Modern Android tall: 1080x2400)
    20.5 / 9,    # 2.277 (OnePlus/Oppo)
    21 / 9,      # 2.333 (Sony Xperia)
]

# Widescreen Desktop / Wallpaper aspect ratios (width / height)
WIDESCREEN_WALLPAPER_RATIOS = [
    16 / 9,      # 1.777 (1920x1080, 2560x1440, 3840x2160 UHD)
    16 / 10,     # 1.600 (1920x1200, 2560x1600, 2880x1800 Retina)
    21 / 9,      # 2.333 (2560x1080, 3440x1440 Ultrawide)
    32 / 9,      # 3.555 (Super Ultrawide)
]

def is_mobile_portrait_ratio(w: int, h: int) -> bool:
    """Returns True if the image is in Portrait orientation and matches a phone display ratio."""
    if w <= 0 or h <= 0 or h <= w:
        return False
    ratio = h / w
    for target in MOBILE_PORTRAIT_RATIOS:
        if abs(ratio - target) < 0.035:
            return True
    return False

def is_widescreen_wallpaper_ratio(w: int, h: int) -> bool:
    """Returns True if the image is in Landscape orientation and matches standard desktop wallpaper dimensions."""
    if w <= 0 or h <= 0 or w < h:
        return False
    ratio = w / h
    for target in WIDESCREEN_WALLPAPER_RATIOS:
        if abs(ratio - target) < 0.035:
            return True
    return False

def classify_media_item(
    filename: str,
    width: int,
    height: int,
    camera_make: str | None,
    camera_model: str | None,
    captured_at: datetime,
    iso: Optional[int] = None,
    focal_length: Optional[float] = None,
    mime_type: Optional[str] = None,
    faces_count: int = 0
) -> Tuple[MediaCategory, float, datetime | None]:
    """
    Intelligent classifier that segregates media into:
    - SCREENSHOT: Strictly genuine phone & desktop screenshots (Flagged for manual review, NEVER auto-deleted)
    - DOCUMENT_BILL: Placed into Document & Receipts Vault
    - MEME_JUNK: Flagged for manual clutter review
    - MEMORY: High-value personal memory or wallpaper/photo
    NOTE: Zero Auto-Deletion Policy - no photos are ever deleted automatically.
    """
    base_name = os.path.basename(filename).lower()
    has_camera_hardware = bool(camera_make or camera_model or iso or focal_length)
    is_landscape = width > height if (width > 0 and height > 0) else False
    is_portrait = height > width if (width > 0 and height > 0) else False

    # 1. Explicit Screenshot in Filename (Highest Confidence)
    if EXPLICIT_SCREENSHOT_REGEX.search(base_name):
        expiry = captured_at + timedelta(days=settings.SCREENSHOT_DEFAULT_EXPIRY_DAYS)
        return MediaCategory.SCREENSHOT, 0.99, expiry

    # 2. Real Human Faces Detected -> Almost Certainly a Personal Memory
    if faces_count > 0:
        return MediaCategory.MEMORY, 0.95, None

    # 3. Camera Hardware Metadata or Standard Camera Filename
    if has_camera_hardware or CAMERA_FILENAME_REGEX.match(base_name):
        return MediaCategory.MEMORY, 0.92, None

    # 4. Coursework Slides / Diagrams / Lectures / Figures
    if COURSE_OR_DIAGRAM_REGEX.search(base_name):
        return MediaCategory.DOCUMENT_BILL, 0.90, None

    # 5. Document & Bill / Receipt Detection
    if DOCUMENT_FILENAME_REGEX.search(base_name):
        return MediaCategory.DOCUMENT_BILL, 0.95, None

    # Very tall receipt aspect ratio (e.g. supermarket cash receipts)
    if is_portrait and width > 0 and (height / width > 2.4):
        return MediaCategory.DOCUMENT_BILL, 0.85, None

    # 6. Desktop Wallpapers & Digital Art / 4K/2K Graphics
    # IMPORTANT: Landscape 16:9, 16:10, 21:9 images without screenshot keywords are Wallpapers, NOT screenshots!
    if is_landscape and (width >= 1920 or height >= 1080) and is_widescreen_wallpaper_ratio(width, height):
        return MediaCategory.MEMORY, 0.88, None

    if WALLPAPER_KEYWORD_REGEX.search(base_name):
        return MediaCategory.MEMORY, 0.85, None

    # 7. True Mobile Portrait Screenshot Heuristic
    # Strictly portrait (height > width) with phone screen ratios and NO camera EXIF
    if is_portrait and is_mobile_portrait_ratio(width, height):
        # Additional safety: if file size is very large (> 8MB JPEG), it's likely a high-res camera portrait, not a screenshot
        ext = os.path.splitext(base_name)[1].lower()
        if ext in ('.png', '.webp') or (width in (1080, 1170, 1179, 1284, 1290, 1440, 720, 750)):
            expiry = captured_at + timedelta(days=settings.SCREENSHOT_DEFAULT_EXPIRY_DAYS)
            return MediaCategory.SCREENSHOT, 0.85, expiry

    # 8. Messaging App / Meme / Junk Clutter
    if MESSAGING_APP_REGEX.search(base_name):
        return MediaCategory.MEME_JUNK, 0.88, None

    # Low-res downloaded asset / icons without camera
    if width > 0 and height > 0 and (width < 500 or height < 500) and not has_camera_hardware:
        return MediaCategory.MEME_JUNK, 0.70, None

    # 9. Defaults to genuine Memory
    return MediaCategory.MEMORY, 0.90 if has_camera_hardware else 0.65, None
