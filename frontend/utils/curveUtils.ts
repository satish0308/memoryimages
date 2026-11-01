import { CurvePoint, ToneCurves, DEFAULT_CURVE_POINTS } from '@/components/pro-studio/ToneCurveEditor';

/**
 * Builds a 256-entry lookup table (LUT) from control points using monotonic cubic interpolation.
 */
export function buildCurveLut(points: CurvePoint[]): Uint8Array {
  const lut = new Uint8Array(256);
  if (!points || points.length === 0) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  const sorted = [...points].sort((a, b) => a.x - b.x);

  // If curve is default linear identity (0,0) -> (255,255) with intermediate y = x
  let isIdentity = true;
  for (const pt of sorted) {
    if (Math.abs(pt.x - pt.y) > 1) {
      isIdentity = false;
      break;
    }
  }
  if (isIdentity) {
    for (let i = 0; i < 256; i++) lut[i] = i;
    return lut;
  }

  // Pre-calculate slopes for monotonic cubic spline
  const n = sorted.length;
  const dx = new Float32Array(n - 1);
  const dy = new Float32Array(n - 1);
  const m = new Float32Array(n - 1);

  for (let i = 0; i < n - 1; i++) {
    dx[i] = sorted[i + 1].x - sorted[i].x;
    dy[i] = sorted[i + 1].y - sorted[i].y;
    m[i] = dx[i] !== 0 ? dy[i] / dx[i] : 0;
  }

  const tangents = new Float32Array(n);
  tangents[0] = m[0];
  tangents[n - 1] = m[n - 2];

  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) {
      tangents[i] = 0;
    } else {
      tangents[i] = (m[i - 1] + m[i]) / 2;
    }
  }

  // Monotone filter to eliminate overshoot
  for (let i = 0; i < n - 1; i++) {
    if (dy[i] === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
    } else {
      const alpha = tangents[i] / m[i];
      const beta = tangents[i + 1] / m[i];
      const s = alpha * alpha + beta * beta;
      if (s > 9) {
        const tau = 3 / Math.sqrt(s);
        tangents[i] = tau * alpha * m[i];
        tangents[i + 1] = tau * beta * m[i];
      }
    }
  }

  // Interpolate for every x in [0, 255]
  let seg = 0;
  for (let x = 0; x < 256; x++) {
    while (seg < n - 2 && x > sorted[seg + 1].x) {
      seg++;
    }

    const x0 = sorted[seg].x;
    const x1 = sorted[seg + 1].x;
    const y0 = sorted[seg].y;
    const y1 = sorted[seg + 1].y;
    const h = x1 - x0;

    if (h === 0) {
      lut[x] = Math.max(0, Math.min(255, Math.round(y0)));
      continue;
    }

    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;

    // Hermite basis functions
    const h00 = 2 * t3 - 3 * t2 + 1;
    const h10 = t3 - 2 * t2 + t;
    const h01 = -2 * t3 + 3 * t2;
    const h11 = t3 - t2;

    const val = h00 * y0 + h10 * h * tangents[seg] + h01 * y1 + h11 * h * tangents[seg + 1];
    lut[x] = Math.max(0, Math.min(255, Math.round(val)));
  }

  return lut;
}

/**
 * Applies composite RGB, Red, Green, and Blue tone curves to ImageData.
 */
export function applyToneCurves(imageData: ImageData, curves: ToneCurves): void {
  const lutRgb = buildCurveLut(curves.rgb);
  const lutR = buildCurveLut(curves.red);
  const lutG = buildCurveLut(curves.green);
  const lutB = buildCurveLut(curves.blue);

  // Check if any curve is active
  let hasCurve = false;
  for (let i = 0; i < 256; i++) {
    if (lutRgb[i] !== i || lutR[i] !== i || lutG[i] !== i || lutB[i] !== i) {
      hasCurve = true;
      break;
    }
  }
  if (!hasCurve) return;

  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    // 1. Channel specific curves
    let r = lutR[data[i]];
    let g = lutG[data[i + 1]];
    let b = lutB[data[i + 2]];

    // 2. Composite RGB curve
    data[i] = lutRgb[r];
    data[i + 1] = lutRgb[g];
    data[i + 2] = lutRgb[b];
  }
}
