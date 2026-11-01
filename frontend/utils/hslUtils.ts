export interface HslChannel {
  hue: number;        // -100 to +100
  saturation: number; // -100 to +100
  luminance: number;  // -100 to +100
}

export interface HslSettings {
  red: HslChannel;
  orange: HslChannel;
  yellow: HslChannel;
  green: HslChannel;
  aqua: HslChannel;
  blue: HslChannel;
  purple: HslChannel;
  magenta: HslChannel;
}

export const DEFAULT_HSL_CHANNEL: HslChannel = { hue: 0, saturation: 0, luminance: 0 };

export const DEFAULT_HSL_SETTINGS: HslSettings = {
  red: { ...DEFAULT_HSL_CHANNEL },
  orange: { ...DEFAULT_HSL_CHANNEL },
  yellow: { ...DEFAULT_HSL_CHANNEL },
  green: { ...DEFAULT_HSL_CHANNEL },
  aqua: { ...DEFAULT_HSL_CHANNEL },
  blue: { ...DEFAULT_HSL_CHANNEL },
  purple: { ...DEFAULT_HSL_CHANNEL },
  magenta: { ...DEFAULT_HSL_CHANNEL },
};

export interface ColorWheelGrading {
  shadows: { hue: number; saturation: number; luminance: number };   // Lift
  midtones: { hue: number; saturation: number; luminance: number };  // Gamma
  highlights: { hue: number; saturation: number; luminance: number };// Gain
}

export const DEFAULT_COLOR_GRADING: ColorWheelGrading = {
  shadows: { hue: 0, saturation: 0, luminance: 0 },
  midtones: { hue: 0, saturation: 0, luminance: 0 },
  highlights: { hue: 0, saturation: 0, luminance: 0 },
};

/**
 * Fast RGB (0-255) to HSL (H: 0-360, S: 0-1, L: 0-1)
 */
function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }

  return [h, s, l];
}

/**
 * Fast HSL (H: 0-360, S: 0-1, L: 0-1) to RGB (0-255)
 */
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;

  if (h < 60) { r = c; g = x; b = 0; }
  else if (h < 120) { r = x; g = c; b = 0; }
  else if (h < 180) { r = 0; g = c; b = x; }
  else if (h < 240) { r = 0; g = x; b = c; }
  else if (h < 300) { r = x; g = 0; b = c; }
  else { r = c; g = 0; b = x; }

  return [
    Math.round((r + m) * 255),
    Math.round((g + m) * 255),
    Math.round((b + m) * 255),
  ];
}

const COLOR_BANDS = [
  { key: 'red', center: 0, width: 35 },
  { key: 'orange', center: 30, width: 30 },
  { key: 'yellow', center: 60, width: 30 },
  { key: 'green', center: 120, width: 60 },
  { key: 'aqua', center: 180, width: 35 },
  { key: 'blue', center: 225, width: 50 },
  { key: 'purple', center: 280, width: 45 },
  { key: 'magenta', center: 325, width: 40 },
] as const;

/**
 * Applies 8-Channel HSL and 3-Way Color Grading directly to ImageData.
 */
export function applyHslAndColorGrading(
  imageData: ImageData,
  hsl: HslSettings,
  grading: ColorWheelGrading
): void {
  // Check if any adjustments are active
  let hasHsl = false;
  for (const b of COLOR_BANDS) {
    const ch = hsl[b.key as keyof HslSettings];
    if (ch.hue !== 0 || ch.saturation !== 0 || ch.luminance !== 0) {
      hasHsl = true;
      break;
    }
  }

  const hasGrading =
    grading.shadows.saturation > 0 || grading.shadows.luminance !== 0 ||
    grading.midtones.saturation > 0 || grading.midtones.luminance !== 0 ||
    grading.highlights.saturation > 0 || grading.highlights.luminance !== 0;

  if (!hasHsl && !hasGrading) return;

  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    let [h, s, l] = rgbToHsl(data[i], data[i + 1], data[i + 2]);

    // 1. 8-Channel HSL Mixer
    if (hasHsl && s > 0.05) {
      for (const b of COLOR_BANDS) {
        const ch = hsl[b.key as keyof HslSettings];
        if (ch.hue === 0 && ch.saturation === 0 && ch.luminance === 0) continue;

        let diff = Math.abs(h - b.center);
        if (diff > 180) diff = 360 - diff;

        if (diff < b.width) {
          const weight = Math.cos((diff / b.width) * (Math.PI / 2));
          h += ch.hue * 0.35 * weight;
          s = Math.max(0, Math.min(1, s + (ch.saturation / 100) * 0.5 * weight));
          l = Math.max(0, Math.min(1, l + (ch.luminance / 100) * 0.3 * weight));
        }
      }
    }

    // 2. 3-Way Color Grading (Shadows, Midtones, Highlights)
    if (hasGrading) {
      // Shadow weight (L < 0.5)
      const shadowWeight = Math.max(0, 1 - l * 2);
      if (shadowWeight > 0 && grading.shadows.saturation > 0) {
        const targetH = grading.shadows.hue;
        const blendS = (grading.shadows.saturation / 100) * 0.35 * shadowWeight;
        h = h * (1 - blendS) + targetH * blendS;
        s = Math.min(1, s + blendS * 0.5);
      }
      l = Math.max(0, Math.min(1, l + (grading.shadows.luminance / 100) * 0.2 * shadowWeight));

      // Highlights weight (L > 0.5)
      const highlightWeight = Math.max(0, (l - 0.5) * 2);
      if (highlightWeight > 0 && grading.highlights.saturation > 0) {
        const targetH = grading.highlights.hue;
        const blendS = (grading.highlights.saturation / 100) * 0.35 * highlightWeight;
        h = h * (1 - blendS) + targetH * blendS;
        s = Math.min(1, s + blendS * 0.5);
      }
      l = Math.max(0, Math.min(1, l + (grading.highlights.luminance / 100) * 0.2 * highlightWeight));

      // Midtones weight (bell curve centered at 0.5)
      const midWeight = 1 - Math.abs(l - 0.5) * 2;
      if (midWeight > 0 && grading.midtones.saturation > 0) {
        const targetH = grading.midtones.hue;
        const blendS = (grading.midtones.saturation / 100) * 0.3 * midWeight;
        h = h * (1 - blendS) + targetH * blendS;
      }
      l = Math.max(0, Math.min(1, l + (grading.midtones.luminance / 100) * 0.2 * midWeight));
    }

    const [outR, outG, outB] = hslToRgb(h, s, l);
    data[i] = outR;
    data[i + 1] = outG;
    data[i + 2] = outB;
  }
}
