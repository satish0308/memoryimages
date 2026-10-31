import io
import os
import logging
from typing import Optional, Tuple
import numpy as np
from PIL import Image
import cv2
from sqlalchemy.orm import Session

from app.models.media import Media

logger = logging.getLogger("memorypics.enhancement_engine")

MODEL_PATH = "/data/db/models/2x-ESRGAN.onnx"
_upscaler_session = None

def get_upscaler_session():
    """Lazy-loads ONNX runtime session for 2x-ESRGAN super-resolution."""
    global _upscaler_session
    if _upscaler_session is not None:
        return _upscaler_session
    if not os.path.exists(MODEL_PATH):
        alt_path = "/data/models/2x-ESRGAN.onnx"
        if os.path.exists(alt_path):
            model_file = alt_path
        else:
            logger.warning(f"2x-ESRGAN model not found at {MODEL_PATH}")
            return None
    else:
        model_file = MODEL_PATH

    try:
        import onnxruntime as ort
        opts = ort.SessionOptions()
        opts.log_severity_level = 3
        opts.intra_op_num_threads = 4
        _upscaler_session = ort.InferenceSession(model_file, opts)
        logger.info("Loaded 2x-ESRGAN super-resolution ONNX session")
        return _upscaler_session
    except Exception as e:
        logger.error(f"Failed to initialize 2x-ESRGAN ONNX session: {e}")
        return None

def auto_white_balance(img_rgb: np.ndarray) -> np.ndarray:
    """Corrects color casts using the Gray-World illuminant algorithm."""
    result = img_rgb.astype(np.float32)
    avg_r = np.mean(result[:, :, 0])
    avg_g = np.mean(result[:, :, 1])
    avg_b = np.mean(result[:, :, 2])
    avg_gray = (avg_r + avg_g + avg_b) / 3.0

    if avg_r > 5 and avg_g > 5 and avg_b > 5:
        scale_r = np.clip(avg_gray / avg_r, 0.8, 1.25)
        scale_g = np.clip(avg_gray / avg_g, 0.8, 1.25)
        scale_b = np.clip(avg_gray / avg_b, 0.8, 1.25)

        result[:, :, 0] *= scale_r
        result[:, :, 1] *= scale_g
        result[:, :, 2] *= scale_b

    return np.clip(result, 0, 255).astype(np.uint8)

def apply_unsharp_mask(img_rgb: np.ndarray, strength: float = 0.35, sigma: float = 1.0) -> np.ndarray:
    """Enhances high-frequency edge sharpness while preserving flat areas."""
    blurred = cv2.GaussianBlur(img_rgb, (0, 0), sigma)
    sharpened = cv2.addWeighted(img_rgb, 1.0 + strength, blurred, -strength, 0)
    return np.clip(sharpened, 0, 255).astype(np.uint8)

def enhance_auto_magic(img_rgb: np.ndarray) -> np.ndarray:
    """
    Combines Auto White Balance, Adaptive CLAHE Shadow Balancing,
    Vibrance Tuning, and Edge Clarity.
    """
    # 1. Neutralize color cast
    balanced = auto_white_balance(img_rgb)

    # 2. LAB Color Space Contrast Equalization
    lab = cv2.cvtColor(balanced, cv2.COLOR_RGB2LAB)
    l_channel, a_channel, b_channel = cv2.split(lab)

    clahe = cv2.createCLAHE(clipLimit=2.2, tileGridSize=(8, 8))
    enhanced_l = clahe.apply(l_channel)

    # Blend 70% CLAHE + 30% original L to avoid over-dramatization
    blended_l = cv2.addWeighted(enhanced_l, 0.70, l_channel, 0.30, 0)
    lab_merged = cv2.merge([blended_l, a_channel, b_channel])
    rgb_clahe = cv2.cvtColor(lab_merged, cv2.COLOR_LAB2RGB)

    # 3. HSV Vibrance Bump (boost muted colors more than saturated colors)
    hsv = cv2.cvtColor(rgb_clahe, cv2.COLOR_RGB2HSV).astype(np.float32)
    s_channel = hsv[:, :, 1]
    # Muted pixels (low saturation) receive a gentle boost
    vibrance_factor = 1.0 + 0.20 * (1.0 - (s_channel / 255.0))
    hsv[:, :, 1] = np.clip(s_channel * vibrance_factor, 0, 255)
    rgb_vibrant = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)

    # 4. Subtle detail clarity
    return apply_unsharp_mask(rgb_vibrant, strength=0.30, sigma=1.0)

def enhance_shadow_recovery(img_rgb: np.ndarray, strength: float = 0.6) -> np.ndarray:
    """
    Brightens heavily backlit and underexposed subjects/faces without washing out highlights.
    """
    lab = cv2.cvtColor(img_rgb, cv2.COLOR_RGB2LAB)
    l_chan, a_chan, b_chan = cv2.split(lab)

    # Compute shadow mask: pixels with low luminance get highest boost
    shadow_mask = np.clip((140.0 - l_chan.astype(np.float32)) / 140.0, 0.0, 1.0)
    shadow_mask = cv2.GaussianBlur(shadow_mask, (25, 25), 0)

    clahe = cv2.createCLAHE(clipLimit=3.5, tileGridSize=(8, 8))
    boosted_l = clahe.apply(l_chan).astype(np.float32)
    # Gamma lift for dark shadows
    gamma_lift = 255.0 * np.power(l_chan.astype(np.float32) / 255.0, 0.65)

    recovered_l = l_chan.astype(np.float32) * (1.0 - shadow_mask * strength) + \
                  ((boosted_l * 0.5 + gamma_lift * 0.5) * (shadow_mask * strength))

    final_l = np.clip(recovered_l, 0, 255).astype(np.uint8)
    merged_lab = cv2.merge([final_l, a_chan, b_chan])
    result_rgb = cv2.cvtColor(merged_lab, cv2.COLOR_LAB2RGB)

    return apply_unsharp_mask(result_rgb, strength=0.20, sigma=1.0)

def enhance_dehaze(img_rgb: np.ndarray, omega: float = 0.70, t0: float = 0.18) -> np.ndarray:
    """
    Clears atmospheric fog, haze, and washed-out outdoor skies using Dark Channel Prior.
    """
    norm_img = img_rgb.astype(np.float32) / 255.0
    
    # 1. Dark Channel
    dark_channel = np.min(norm_img, axis=2)
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (15, 15))
    dark_channel = cv2.erode(dark_channel, kernel)

    # 2. Estimate Atmospheric Light A from top 0.1% brightest in dark channel
    num_top = max(1, int(dark_channel.size * 0.001))
    flat_dark = dark_channel.flatten()
    indices = np.argpartition(flat_dark, -num_top)[-num_top:]
    flat_img = norm_img.reshape(-1, 3)
    A = np.max(flat_img[indices], axis=0)
    A = np.clip(A, 0.25, 0.95)

    # 3. Transmission Map with bilateral smoothing to preserve sharp boundaries
    trans = 1.0 - omega * dark_channel
    trans_smooth = cv2.GaussianBlur(trans, (21, 21), 0)
    trans_smooth = np.clip(trans_smooth, t0, 1.0)

    # 4. Recover Scene Radiance
    dehazed = np.zeros_like(norm_img)
    for c in range(3):
        dehazed[:, :, c] = (norm_img[:, :, c] - A[c]) / trans_smooth + A[c]

    dehazed_rgb = np.clip(dehazed * 255.0, 0, 255).astype(np.uint8)

    # 5. Tone Boost for lush landscapes
    hsv = cv2.cvtColor(dehazed_rgb, cv2.COLOR_RGB2HSV).astype(np.float32)
    hsv[:, :, 1] = np.clip(hsv[:, :, 1] * 1.15, 0, 255)
    vibrant_rgb = cv2.cvtColor(hsv.astype(np.uint8), cv2.COLOR_HSV2RGB)

    return apply_unsharp_mask(vibrant_rgb, strength=0.25, sigma=1.0)

def enhance_super_res(img: Image.Image, tile_size: int = 256) -> Image.Image:
    """
    Runs 2x-ESRGAN super-resolution to double pixel resolution and synthesize crisp details.
    Uses tiling to keep memory usage under 150MB RAM.
    """
    sess = get_upscaler_session()
    w, h = img.size

    # Fallback to Lanczos + unsharp if model not ready
    if sess is None or min(w, h) >= 1400:
        upscaled = img.resize((w * 2, h * 2), Image.Resampling.LANCZOS)
        up_arr = np.array(upscaled)
        sharp_arr = apply_unsharp_mask(up_arr, strength=0.40, sigma=1.2)
        return Image.fromarray(sharp_arr)

    # Direct inference for small images
    if w <= tile_size and h <= tile_size:
        arr = np.array(img.convert('RGB')).astype(np.float32) / 255.0
        arr = np.transpose(arr, (2, 0, 1))
        arr = np.expand_dims(arr, 0)
        out = sess.run(None, {'input': arr})[0]
        out_arr = np.clip(out[0] * 255.0, 0, 255).astype(np.uint8)
        out_arr = np.transpose(out_arr, (1, 2, 0))
        return Image.fromarray(out_arr)

    # Tiled inference for larger images up to 1400px
    arr = np.array(img.convert('RGB')).astype(np.float32) / 255.0
    out_h, out_w = h * 2, w * 2
    out_arr = np.zeros((out_h, out_w, 3), dtype=np.float32)

    step = tile_size - 16
    for y in range(0, h, step):
        for x in range(0, w, step):
            x2 = min(x + tile_size, w)
            y2 = min(y + tile_size, h)
            tile = arr[y:y2, x:x2, :]
            th, tw, _ = tile.shape

            pad_h = (tile_size - th) if th < tile_size else 0
            pad_w = (tile_size - tw) if tw < tile_size else 0
            if pad_h > 0 or pad_w > 0:
                tile = np.pad(tile, ((0, pad_h), (0, pad_w), (0, 0)), mode='reflect')

            tile_in = np.expand_dims(np.transpose(tile, (2, 0, 1)), 0)
            tile_out = sess.run(None, {'input': tile_in})[0][0]
            tile_out = np.transpose(tile_out, (1, 2, 0))[:th * 2, :tw * 2, :]

            out_arr[y * 2:y2 * 2, x * 2:x2 * 2, :] = tile_out

    res = np.clip(out_arr * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(res)

def process_image_enhancement(img: Image.Image, preset: str = "auto_magic") -> Image.Image:
    """Dispatches to the requested enhancement preset."""
    img_rgb = img.convert('RGB')
    
    if preset == "super_res":
        return enhance_super_res(img_rgb)
    
    arr = np.array(img_rgb)
    if preset == "shadow_fix":
        enhanced_arr = enhance_shadow_recovery(arr)
    elif preset == "dehaze":
        enhanced_arr = enhance_dehaze(arr)
    else:
        enhanced_arr = enhance_auto_magic(arr)

    return Image.fromarray(enhanced_arr)

def get_enhanced_image_bytes(media: Media, preset: str, db: Session, max_preview_dim: int = 1600) -> Optional[bytes]:
    """
    Loads media into RAM (local disk, Google Drive in-memory, or MinIO S3),
    applies the requested enhancement preset, and returns WebP bytes.
    """
    from app.services.face_engine import load_media_image

    img = load_media_image(media, db)
    if img is None:
        return None

    # For fast interactive preview, downsample if image is extremely high-res
    w, h = img.size
    if max(w, h) > max_preview_dim and preset != "super_res":
        scale = max_preview_dim / float(max(w, h))
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)

    enhanced = process_image_enhancement(img, preset=preset)

    buf = io.BytesIO()
    enhanced.save(buf, format="WEBP", quality=92, method=4)
    return buf.getvalue()
