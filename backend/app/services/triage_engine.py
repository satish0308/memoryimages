import os
import re
from datetime import datetime, timedelta
from typing import Dict, Any, Tuple
from PIL import Image

from app.models.media import MediaCategory
from app.config import settings

SCREENSHOT_FILENAME_REGEX = re.compile(
    r'(screenshot|screen_shot|screen-shot|screencap|capture|sc_\d+|screenshot_\d+)',
    re.IGNORECASE
)

DOCUMENT_FILENAME_REGEX = re.compile(
    r'(bill|receipt|invoice|statement|tax|document|scan|ticket|check|voucher)',
    re.IGNORECASE
)

MESSAGING_APP_REGEX = re.compile(
    r'(img-\d+-wa|fb_img|received_\d+|telegram|whatsapp|meme)',
    re.IGNORECASE
)

# Common mobile screen aspect ratios (width/height or height/width)
# NOTE: 4/3 and 3/2 are standard camera sensor dimensions and are excluded to avoid false positives on stripped-EXIF camera photos
SCREEN_RATIOS = [
    16 / 9,      # 1.777 (standard desktop/phones)
    18 / 9,      # 2.000 (standard Android 2:1)
    18.5 / 9,    # 2.055 (Samsung Infinity Display)
    19 / 9,      # 2.111 (Modern Android)
    19.5 / 9,    # 2.166 (iPhone X to 16)
    20 / 9,      # 2.222 (Modern Android tall screen)
    20.5 / 9,    # 2.277
    21 / 9,      # 2.333 (Ultra-tall Sony/Motorola)
    16 / 10,     # 1.600 (MacBook / tablet screen)
]

def is_screen_aspect_ratio(w: int, h: int) -> bool:
    if w <= 0 or h <= 0:
        return False
    ratio = max(w, h) / min(w, h)
    for target in SCREEN_RATIOS:
        if abs(ratio - target) < 0.035:
            return True
    return False

def classify_media_item(
    filename: str,
    width: int,
    height: int,
    camera_make: str | None,
    camera_model: str | None,
    captured_at: datetime
) -> Tuple[MediaCategory, float, datetime | None]:
    """
    Intelligent classifier that segregates media into:
    - SCREENSHOT: Flagged for manual review (default 30 days, NEVER auto-deleted)
    - DOCUMENT_BILL: Placed into Document & Receipts Vault
    - MEME_JUNK: Flagged for manual clutter review
    - MEMORY: High-value personal memory
    NOTE: Zero Auto-Deletion Policy - no photos are ever deleted automatically.
    """
    base_name = os.path.basename(filename).lower()
    has_camera_exif = bool(camera_make or camera_model)
    
    # 1. Explicit or heuristic Screenshot Detection
    if SCREENSHOT_FILENAME_REGEX.search(base_name):
        expiry = captured_at + timedelta(days=settings.SCREENSHOT_DEFAULT_EXPIRY_DAYS)
        return MediaCategory.SCREENSHOT, 0.98, expiry

    # Aspect ratio check without camera hardware EXIF
    if not has_camera_exif and is_screen_aspect_ratio(width, height):
        # High likelihood of being a phone screenshot
        expiry = captured_at + timedelta(days=settings.SCREENSHOT_DEFAULT_EXPIRY_DAYS)
        return MediaCategory.SCREENSHOT, 0.85, expiry

    # 2. Document & Bill / Receipt Detection
    if DOCUMENT_FILENAME_REGEX.search(base_name):
        return MediaCategory.DOCUMENT_BILL, 0.95, None

    # Very tall receipt aspect ratio (e.g. height is 2.5x to 4x width)
    if width > 0 and height > 0 and (height / width > 2.4):
        return MediaCategory.DOCUMENT_BILL, 0.80, None

    # 3. Messaging App / Meme / Junk Clutter
    if MESSAGING_APP_REGEX.search(base_name):
        return MediaCategory.MEME_JUNK, 0.88, None

    # Small thumbnail or low-res downloaded asset without camera
    if not has_camera_exif and width > 0 and height > 0 and (width < 600 or height < 600):
        return MediaCategory.MEME_JUNK, 0.70, None

    # 4. Defaults to genuine Memory
    return MediaCategory.MEMORY, 0.90 if has_camera_exif else 0.60, None
