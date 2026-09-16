/**
 * FAST GUNS — logo background stripper v2.
 * v2: border-connected background -> FULLY transparent (no haze), partial
 * alpha only on a thin ring that touches opaque emblem pixels.
 * Output verified: corners + edge ring must be alpha 0.
 */
import sharp from "sharp";

const SRC = "upload/FAST.png"; // ALWAYS from the original — never the processed output
const SIZE = 512;

const { data, info } = await sharp(SRC)
  .resize(SIZE, SIZE, { fit: "cover" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width;
const H = info.height;
const px = new Uint8ClampedArray(data);

const idx = (x, y) => (y * W + x) * 4;
const lum = (i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];

// Any border-connected pixel darker than SOFT_T belongs to the background.
// 26 = safely below the guns' dark-gray bodies (35+) while covering bg noise.
const SOFT_T = 26;

const visited = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) stack.push([x, 0], [x, H - 1]);
for (let y = 0; y < H; y++) stack.push([0, y], [W - 1, y]);

while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (visited[p]) continue;
  const i = idx(x, y);
  if (lum(i) >= SOFT_T) continue;
  visited[p] = 1;
  px[i + 3] = 0; // hard kill — no haze
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

// Feather: only semi-transparent pixels DIRECTLY adjacent to opaque emblem.
const alphaAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 255 : px[idx(x, y) + 3]);
const softAdj = [];
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    if (px[i + 3] !== 0) continue;
    const nOpaque =
      (alphaAt(x - 1, y) === 255 ? 1 : 0) +
      (alphaAt(x + 1, y) === 255 ? 1 : 0) +
      (alphaAt(x, y - 1) === 255 ? 1 : 0) +
      (alphaAt(x, y + 1) === 255 ? 1 : 0);
    if (nOpaque >= 2) softAdj.push(i);
  }
}
for (const i of softAdj) px[i + 3] = 150;

// Alpha-aware trim: bounding box of all visible pixels, then square with padding
let minX = W, minY = H, maxX = -1, maxY = -1;
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    if (px[idx(x, y) + 3] > 8) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
}
if (maxX < 0) throw new Error("no visible pixels after flood fill!");
minX = Math.max(0, minX - 2); minY = Math.max(0, minY - 2);
maxX = Math.min(W - 1, maxX + 2); maxY = Math.min(H - 1, maxY + 2);
const cropW = maxX - minX + 1, cropH = maxY - minY + 1;

const trimmed = await sharp(px, { raw: { width: W, height: H, channels: 4 } })
  .extract({ left: minX, top: minY, width: cropW, height: cropH })
  .png()
  .toBuffer();
const meta = await sharp(trimmed).metadata();
const side = Math.max(meta.width, meta.height);
const pad = Math.round(side * 0.03);
const canvas = side + pad * 2;

const finalPng = await sharp(trimmed)
  .resize({
    width: meta.width >= meta.height ? canvas - pad * 2 : null,
    height: meta.height > meta.width ? canvas - pad * 2 : null,
    fit: "inside",
  })
  .extend({ top: pad, bottom: pad, left: pad, right: pad, background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();

await sharp(finalPng)
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toFile("public/fastguns-logo.png");

for (const s of [16, 32, 48]) {
  await sharp(finalPng).resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(`public/icons/icon-${s}.png`);
}
for (const s of [180, 192, 512]) {
  await sharp(finalPng)
    .resize(Math.round(s * 0.82), Math.round(s * 0.82), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .flatten({ background: "#050505" })
    .resize(s, s, { fit: "contain", background: "#050505" })
    .png()
    .toFile(`public/icons/icon-${s}.png`);
}

// ---- verification ----
const { data: v, info: vi } = await sharp("public/fastguns-logo.png").raw().toBuffer({ resolveWithObject: true });
const VW = vi.width, VH = vi.height, CH = vi.channels;
const A = (x, y) => v[(y * VW + x) * CH + 3];
let edgeHaze = 0, total = 0;
for (let y = 0; y < VH; y++) {
  for (let x = 0; x < VW; x++) {
    const d = Math.min(x, y, VW - 1 - x, VH - 1 - y);
    if (d < 24) { total++; if (A(x, y) > 0) edgeHaze++; }
  }
}
console.log(`size ${VW}x${VH} | corner alphas: ${A(2,2)},${A(VW-3,2)},${A(2,VH-3)},${A(VW-3,VH-3)} | opaque px in 24px edge band: ${edgeHaze}/${total}`);
console.log(`trimmed emblem: ${meta.width}x${meta.height}`);
