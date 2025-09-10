import sharp from "sharp";

// Utilities for drift detection using phase correlation on 256x256 tiles.

export type DriftResult = { dx: number; dy: number; peakValue: number };

// Load grayscale float image from a Buffer (values in [0,1])
export async function loadGrayFloatFromBuffer(buf: Buffer): Promise<{ pixels: Float64Array; width: number; height: number }>{
  const { data, info } = await sharp(buf).greyscale().raw().toBuffer({ resolveWithObject: true });
  const channels = info.channels ?? 1;
  const width = info.width ?? 0;
  const height = info.height ?? 0;
  // If multiple channels slipped through, only take the first
  const out = new Float64Array(width * height);
  if (channels === 1) {
    for (let i = 0; i < out.length; i++) out[i] = (data as any)[i] / 255;
  } else {
    // Interleaved channels
    for (let i = 0; i < out.length; i++) out[i] = (data as any)[i * channels] / 255;
  }
  return { pixels: out, width, height };
}

// Hann window helpers
function hann(n: number): Float64Array {
  const w = new Float64Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (n - 1)));
  return w;
}

function applyHannWindow(img: Float64Array, width: number, height: number) {
  const wy = hann(height);
  const wx = hann(width);
  for (let y = 0; y < height; y++) {
    const wyv = wy[y];
    for (let x = 0; x < width; x++) img[y * width + x] *= wyv * wx[x];
  }
}

// 1D radix-2 FFT (in-place). Length must be a power of two.
function fftRadix2(re: Float64Array, im: Float64Array, invert: boolean) {
  const n = re.length;
  if ((n & (n - 1)) !== 0) throw new Error(`fftRadix2 length must be power of two, got ${n}`);

  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }

  for (let len = 2; len <= n; len <<= 1) {
    const ang = 2 * Math.PI / len * (invert ? -1 : 1);
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      for (let k = 0; k < (len >> 1); k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + (len >> 1)];
        const vIm = im[i + k + (len >> 1)];
        // t = w * v
        const tRe = vRe * wRe - vIm * wIm;
        const tIm = vRe * wIm + vIm * wRe;
        re[i + k] = uRe + tRe;
        im[i + k] = uIm + tIm;
        re[i + k + (len >> 1)] = uRe - tRe;
        im[i + k + (len >> 1)] = uIm - tIm;
        // w *= wlen
        const nwRe = wRe * wlenRe - wIm * wlenIm;
        const nwIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nwRe; wIm = nwIm;
      }
    }
  }
}

// 2D FFT/IFFT on separate real/imag arrays with dimensions width x height
function fft2D(re: Float64Array, im: Float64Array, width: number, height: number) {
  const rowRe = new Float64Array(width);
  const rowIm = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    const off = y * width;
    for (let x = 0; x < width; x++) { rowRe[x] = re[off + x]; rowIm[x] = im[off + x]; }
    fftRadix2(rowRe, rowIm, false);
    for (let x = 0; x < width; x++) { re[off + x] = rowRe[x]; im[off + x] = rowIm[x]; }
  }
  const colRe = new Float64Array(height);
  const colIm = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) { const idx = y * width + x; colRe[y] = re[idx]; colIm[y] = im[idx]; }
    fftRadix2(colRe, colIm, false);
    for (let y = 0; y < height; y++) { const idx = y * width + x; re[idx] = colRe[y]; im[idx] = colIm[y]; }
  }
}

function ifft2D(re: Float64Array, im: Float64Array, width: number, height: number) {
  const rowRe = new Float64Array(width);
  const rowIm = new Float64Array(width);
  for (let y = 0; y < height; y++) {
    const off = y * width;
    for (let x = 0; x < width; x++) { rowRe[x] = re[off + x]; rowIm[x] = im[off + x]; }
    fftRadix2(rowRe, rowIm, true);
    for (let x = 0; x < width; x++) { re[off + x] = rowRe[x]; im[off + x] = rowIm[x]; }
  }
  const colRe = new Float64Array(height);
  const colIm = new Float64Array(height);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) { const idx = y * width + x; colRe[y] = re[idx]; colIm[y] = im[idx]; }
    fftRadix2(colRe, colIm, true);
    for (let y = 0; y < height; y++) { const idx = y * width + x; re[idx] = colRe[y]; im[idx] = colIm[y]; }
  }
  // Normalize (overall 1/(W*H))
  const norm = width * height;
  for (let i = 0; i < re.length; i++) { re[i] /= norm; im[i] /= norm; }
}

// Phase correlation on two same-sized images (assumed power-of-two dims)
export function phaseCorrelationShift(a: Float64Array, b: Float64Array, width: number, height: number): DriftResult {
  const A = a.slice(0);
  const B = b.slice(0);
  applyHannWindow(A, width, height);
  applyHannWindow(B, width, height);

  const Ar = A; const Ai = new Float64Array(A.length);
  const Br = B; const Bi = new Float64Array(B.length);
  fft2D(Ar, Ai, width, height);
  fft2D(Br, Bi, width, height);

  const Rr = new Float64Array(Ar.length);
  const Ri = new Float64Array(Ai.length);
  for (let i = 0; i < Ar.length; i++) {
    const pr = Ar[i] * Br[i] + Ai[i] * Bi[i];
    const pi = Ai[i] * Br[i] - Ar[i] * Bi[i];
    const mag = Math.hypot(pr, pi) + 1e-12;
    Rr[i] = pr / mag; Ri[i] = pi / mag;
  }
  ifft2D(Rr, Ri, width, height);

  let peak = -Infinity, peakIdx = 0;
  for (let i = 0; i < Rr.length; i++) if (Rr[i] > peak) { peak = Rr[i]; peakIdx = i; }
  const peakY = Math.floor(peakIdx / width);
  const peakX = peakIdx % width;

  let dy = peakY; let dx = peakX;
  if (dy > Math.floor(height / 2)) dy -= height;
  if (dx > Math.floor(width / 2)) dx -= width;
  return { dy, dx, peakValue: peak };
}

// Translate an image buffer (width x height) by integer pixels, filling with transparency.
export async function translateImage(buf: Buffer, width: number, height: number, tX: number, tY: number): Promise<Buffer> {
  if (tX === 0 && tY === 0) return buf;
  // Compute crop rect from source and destination offset
  const srcLeft = tX < 0 ? -tX : 0;
  const srcTop = tY < 0 ? -tY : 0;
  const dstLeft = tX > 0 ? tX : 0;
  const dstTop = tY > 0 ? tY : 0;
  const cropW = width - Math.abs(tX);
  const cropH = height - Math.abs(tY);
  if (cropW <= 0 || cropH <= 0) {
    // Shifted completely outside; return transparent image
    return sharp({ create: { width, height, channels: 4, background: { r:0,g:0,b:0,alpha:0 } } }).png().toBuffer();
  }
  const cropped = await sharp(buf).extract({ left: srcLeft, top: srcTop, width: cropW, height: cropH }).png().toBuffer();
  return sharp({ create: { width, height, channels: 4, background: { r:0,g:0,alpha:0,b:0 } } })
    .composite([{ input: cropped, left: dstLeft, top: dstTop }])
    .png()
    .toBuffer();
}

// Compute drift using the CENTER 256×256 tile between baseComposite and rawComposite (both 768×768),
// then return the translated rawComposite aligned onto base coordinates.
export async function alignCompositeOverBase(
  baseComposite: Buffer,
  rawComposite: Buffer,
  tileSize: number
): Promise<{ aligned: Buffer; dx: number; dy: number; peakValue: number }>{
  const gridSize = tileSize * 3;
  // Extract center tiles
  const baseCenter = await sharp(baseComposite).extract({ left: tileSize, top: tileSize, width: tileSize, height: tileSize }).png().toBuffer();
  const rawCenter = await sharp(rawComposite).extract({ left: tileSize, top: tileSize, width: tileSize, height: tileSize }).png().toBuffer();

  const A = await loadGrayFloatFromBuffer(baseCenter);
  const B = await loadGrayFloatFromBuffer(rawCenter);
  // Only proceed when dimensions are 256×256 (power of two)
  if (A.width !== tileSize || A.height !== tileSize || B.width !== tileSize || B.height !== tileSize) {
    return { aligned: rawComposite, dx: 0, dy: 0, peakValue: 0 };
  }
  const { dx, dy, peakValue } = phaseCorrelationShift(A.pixels, B.pixels, tileSize, tileSize);
  const tX = Math.round(-dx);
  const tY = Math.round(-dy);
  const translated = await translateImage(rawComposite, gridSize, gridSize, tX, tY);
  return { aligned: translated, dx, dy, peakValue };
}

