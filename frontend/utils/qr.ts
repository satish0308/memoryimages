/**
 * Pure TypeScript Zero-Dependency QR Code Generator
 * Generates standard QR Code (ISO/IEC 18004) Model 2 matrices and SVG strings.
 * Self-contained: runs anywhere without external npm packages.
 */

// GF(256) Math
const GF256_EXP = new Uint8Array(512);
const GF256_LOG = new Uint8Array(256);
let gf_val = 1;
for (let i = 0; i < 255; i++) {
  GF256_EXP[i] = gf_val;
  GF256_EXP[i + 255] = gf_val;
  GF256_LOG[gf_val] = i;
  gf_val <<= 1;
  if (gf_val & 256) gf_val ^= 0x11d;
}

function gfMul(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return GF256_EXP[GF256_LOG[a] + GF256_LOG[b]];
}

// Polynomial division for Reed-Solomon Error Correction
function rsGeneratorPoly(degree: number): Uint8Array {
  let poly = new Uint8Array([1]);
  for (let i = 0; i < degree; i++) {
    const nextPoly = new Uint8Array(poly.length + 1);
    const factor = GF256_EXP[i];
    for (let j = 0; j < poly.length; j++) {
      nextPoly[j] ^= gfMul(poly[j], factor);
      nextPoly[j + 1] ^= poly[j];
    }
    poly = nextPoly;
  }
  return poly;
}

function rsComputeRemainder(data: Uint8Array, ecCount: number): Uint8Array {
  const gen = rsGeneratorPoly(ecCount);
  const remainder = new Uint8Array(ecCount);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ remainder[0];
    for (let j = 0; j < ecCount - 1; j++) {
      remainder[j] = remainder[j + 1] ^ gfMul(gen[j + 1], factor);
    }
    remainder[ecCount - 1] = gfMul(gen[ecCount], factor);
  }
  return remainder;
}

// Version table parameters: [version, totalCodewords, ecCodewords, ecBlocks]
// Using EC Level L (Low) or M (Medium) for maximum data density
interface VersionInfo {
  version: number;
  size: number;
  totalCodewords: number;
  ecCodewords: number;
  numBlocks: number;
  alignmentPatterns: number[];
}

const VERSIONS: VersionInfo[] = [
  { version: 1, size: 21, totalCodewords: 26, ecCodewords: 10, numBlocks: 1, alignmentPatterns: [] },
  { version: 2, size: 25, totalCodewords: 44, ecCodewords: 16, numBlocks: 1, alignmentPatterns: [6, 18] },
  { version: 3, size: 29, totalCodewords: 70, ecCodewords: 26, numBlocks: 1, alignmentPatterns: [6, 22] },
  { version: 4, size: 33, totalCodewords: 100, ecCodewords: 36, numBlocks: 2, alignmentPatterns: [6, 26] },
  { version: 5, size: 37, totalCodewords: 134, ecCodewords: 48, numBlocks: 2, alignmentPatterns: [6, 30] },
  { version: 6, size: 41, totalCodewords: 172, ecCodewords: 64, numBlocks: 4, alignmentPatterns: [6, 34] },
];

export function generateQrMatrix(text: string): boolean[][] {
  const utf8Bytes = new TextEncoder().encode(text);
  const dataLen = utf8Bytes.length;

  // Find smallest version that fits
  let vi: VersionInfo | null = null;
  for (const v of VERSIONS) {
    const dataCapacity = v.totalCodewords - v.ecCodewords;
    // Overhead: 4 bits mode + 8 bits count + data + 4 bits terminator
    if (dataLen + 2 <= dataCapacity) {
      vi = v;
      break;
    }
  }

  if (!vi) {
    vi = VERSIONS[VERSIONS.length - 1]; // Fallback to max version
  }

  const dataCapacity = vi.totalCodewords - vi.ecCodewords;
  const bitBuffer: number[] = [];

  function writeBits(val: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((val >> i) & 1);
    }
  }

  // 1. Mode indicator: 0100 (Byte mode)
  writeBits(0b0100, 4);

  // 2. Character count (8 bits for V1-9)
  writeBits(Math.min(dataLen, 255), 8);

  // 3. Data bytes
  for (let i = 0; i < dataLen && bitBuffer.length / 8 < dataCapacity; i++) {
    writeBits(utf8Bytes[i], 8);
  }

  // 4. Terminator: 0000 (up to 4 bits or remaining)
  const remBits = dataCapacity * 8 - bitBuffer.length;
  writeBits(0, Math.min(4, Math.max(0, remBits)));

  // 5. Pad to byte boundary
  while (bitBuffer.length % 8 !== 0) {
    bitBuffer.push(0);
  }

  // Convert bitBuffer to bytes
  const dataBytes = new Uint8Array(dataCapacity);
  for (let i = 0; i < bitBuffer.length; i += 8) {
    let byte = 0;
    for (let j = 0; j < 8; j++) {
      byte = (byte << 1) | (bitBuffer[i + j] || 0);
    }
    dataBytes[i / 8] = byte;
  }

  // 6. Pad with 0xEC and 0x11
  let padToggle = true;
  for (let i = Math.floor(bitBuffer.length / 8); i < dataCapacity; i++) {
    dataBytes[i] = padToggle ? 0xec : 0x11;
    padToggle = !padToggle;
  }

  // 7. Error Correction Coding (Interleaved if numBlocks > 1)
  const numBlocks = vi.numBlocks;
  const blockDataLen = Math.floor(dataCapacity / numBlocks);
  const blockEcLen = Math.floor(vi.ecCodewords / numBlocks);
  const allCodewords = new Uint8Array(vi.totalCodewords);

  const blockDatas: Uint8Array[] = [];
  const blockEcs: Uint8Array[] = [];

  let dataOffset = 0;
  for (let b = 0; b < numBlocks; b++) {
    const len = (b < dataCapacity % numBlocks) ? blockDataLen + 1 : blockDataLen;
    const bData = dataBytes.slice(dataOffset, dataOffset + len);
    dataOffset += len;
    blockDatas.push(bData);
    blockEcs.push(rsComputeRemainder(bData, blockEcLen));
  }

  // Interleave data
  let outIdx = 0;
  const maxDataLen = Math.max(...blockDatas.map((b) => b.length));
  for (let i = 0; i < maxDataLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      if (i < blockDatas[b].length) {
        allCodewords[outIdx++] = blockDatas[b][i];
      }
    }
  }

  // Interleave EC
  for (let i = 0; i < blockEcLen; i++) {
    for (let b = 0; b < numBlocks; b++) {
      allCodewords[outIdx++] = blockEcs[b][i];
    }
  }

  // Matrix creation
  const size = vi.size;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));
  const isFunction: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  function setFunction(r: number, c: number, val: boolean) {
    if (r >= 0 && r < size && c >= 0 && c < size) {
      matrix[r][c] = val;
      isFunction[r][c] = true;
    }
  }

  // 8. Place Finder Patterns (7x7 at (0,0), (0, size-7), (size-7, 0))
  function placeFinder(top: number, left: number) {
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        const row = top + r;
        const col = left + c;
        if (row >= 0 && row < size && col >= 0 && col < size) {
          if (r >= 0 && r <= 6 && c >= 0 && c <= 6) {
            const isDark = (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4));
            setFunction(row, col, isDark);
          } else {
            setFunction(row, col, false); // Separator
          }
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // 9. Timing patterns
  for (let i = 8; i < size - 8; i++) {
    setFunction(6, i, i % 2 === 0);
    setFunction(i, 6, i % 2 === 0);
  }

  // 10. Alignment patterns
  const alignCoords = vi.alignmentPatterns;
  for (const r of alignCoords) {
    for (const c of alignCoords) {
      if (isFunction[r][c]) continue; // Skip if collides with finder
      for (let dr = -2; dr <= 2; dr++) {
        for (let dc = -2; dc <= 2; dc++) {
          const isDark = Math.max(Math.abs(dr), Math.abs(dc)) !== 1;
          setFunction(r + dr, c + dc, isDark);
        }
      }
    }
  }

  // 11. Dark module
  setFunction(4 * vi.version + 9, 8, true);

  // Reserve format info areas
  for (let i = 0; i < 9; i++) {
    if (!isFunction[8][i]) setFunction(8, i, false);
    if (!isFunction[i][8]) setFunction(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    if (!isFunction[8][size - 1 - i]) setFunction(8, size - 1 - i, false);
    if (!isFunction[size - 1 - i][8]) setFunction(size - 1 - i, 8, false);
  }

  // 12. Place Data bits in 2-column zig-zag
  const allBits: number[] = [];
  for (let i = 0; i < allCodewords.length; i++) {
    for (let b = 7; b >= 0; b--) {
      allBits.push((allCodewords[i] >> b) & 1);
    }
  }

  let bitIdx = 0;
  let upwards = true;
  for (let right = size - 1; right > 0; right -= 2) {
    if (right === 6) right--; // Skip vertical timing column
    const rows = upwards
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const r of rows) {
      for (const c of [right, right - 1]) {
        if (!isFunction[r][c]) {
          const bit = bitIdx < allBits.length ? allBits[bitIdx++] : 0;
          // Apply standard Mask 0: (row + col) % 2 == 0
          const mask = (r + c) % 2 === 0;
          matrix[r][c] = (bit === 1) !== mask;
        }
      }
    }
    upwards = !upwards;
  }

  // 13. Format Information (EC Level M = 00, Mask 0 = 000 -> 0b00000, BCH code gives 0x4a5b)
  // Masked with 0x5412 -> 0b101010000010010
  const formatBits = 0x4a5b ^ 0x5412; // 0x1e49 -> 0b001111001001001
  for (let i = 0; i < 15; i++) {
    const bit = ((formatBits >> i) & 1) === 1;
    // Top-left
    if (i < 6) matrix[8][i] = bit;
    else if (i === 6) matrix[8][7] = bit;
    else if (i === 7) matrix[8][8] = bit;
    else if (i === 8) matrix[7][8] = bit;
    else matrix[14 - i][8] = bit;

    // Split corners
    if (i < 8) matrix[size - 1 - i][8] = bit;
    else matrix[8][size - 15 + i] = bit;
  }

  return matrix;
}

/**
 * Returns SVG path definition string representing the QR Code matrix
 */
export function generateQrSvgPath(matrix: boolean[][], scale: number = 10, margin: number = 2): { path: string; size: number } {
  const n = matrix.length;
  const totalSize = (n + margin * 2) * scale;
  let path = '';

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) {
        const x = (c + margin) * scale;
        const y = (r + margin) * scale;
        path += `M${x},${y}h${scale}v${scale}h-${scale}z `;
      }
    }
  }

  return { path, size: totalSize };
}
