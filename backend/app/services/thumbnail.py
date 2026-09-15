import os
from typing import Tuple, Dict, Any
from PIL import Image, ImageOps, ImageFilter
import imagehash
import numpy as np

from app.config import settings

def calculate_blurriness(image: Image.Image) -> float:
    """
    Computes a sharpness/blurriness score using the Laplacian variance.
    Lower score = more blurry.
    Typical threshold: < 100 is blurry.
    """
    try:
        # Convert to grayscale
        gray = image.convert('L')
        # Apply 3x3 Laplacian filter kernel
        laplacian_kernel = ImageFilter.Kernel(
            (3, 3),
            [0, 1, 0, 1, -4, 1, 0, 1, 0],
            scale=1,
            offset=0
        )
        filtered = gray.filter(laplacian_kernel)
        arr = np.array(filtered, dtype=np.float64)
        return float(arr.var())
    except Exception:
        return 999.0

def generate_thumbnails(original_path: str, media_id: int) -> Dict[str, Any]:
    """
    Generates multi-resolution WebP thumbnails, calculates perceptual hash and sharpness score.
    Returns:
      {
        "thumbnail_256_path": str,
        "thumbnail_1080_path": str,
        "width": int,
        "height": int,
        "perceptual_hash": str,
        "blurriness_score": float,
        "is_blurry": bool
      }
    """
    os.makedirs(settings.THUMBNAIL_DIR, exist_ok=True)
    
    thumb_256_rel = f"thumb_{media_id}_256.webp"
    thumb_1080_rel = f"thumb_{media_id}_1080.webp"
    
    thumb_256_path = os.path.join(settings.THUMBNAIL_DIR, thumb_256_rel)
    thumb_1080_path = os.path.join(settings.THUMBNAIL_DIR, thumb_1080_rel)
    
    with Image.open(original_path) as img:
        # Auto-rotate based on EXIF orientation
        img = ImageOps.exif_transpose(img)
        
        # Ensure RGB mode for WebP saving
        if img.mode in ("RGBA", "P"):
            img_rgb = img.convert("RGB")
        else:
            img_rgb = img.convert("RGB")
            
        width, height = img_rgb.size
        
        # Calculate perceptual hash (pHash)
        phash_val = str(imagehash.phash(img_rgb))
        
        # Calculate blurriness
        blur_score = calculate_blurriness(img_rgb)
        is_blurry = blur_score < 80.0
        
        # 1. 256px Thumbnail (aspect-preserved fit for fast masonry grid)
        img_256 = img_rgb.copy()
        img_256.thumbnail((256, 256), Image.Resampling.LANCZOS)
        img_256.save(thumb_256_path, "WEBP", quality=80, method=4)
        
        # 2. 1080px Preview (for modal lightbox)
        img_1080 = img_rgb.copy()
        img_1080.thumbnail((1920, 1080), Image.Resampling.LANCZOS)
        img_1080.save(thumb_1080_path, "WEBP", quality=85, method=4)
        
    return {
        "thumbnail_256_path": thumb_256_path,
        "thumbnail_1080_path": thumb_1080_path,
        "width": width,
        "height": height,
        "perceptual_hash": phash_val,
        "blurriness_score": round(blur_score, 2),
        "is_blurry": is_blurry
    }
