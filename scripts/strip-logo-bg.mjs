/**
 * FAST GUNS — logo background stripper.
 * Flood-fills the outside-connected near-black background to transparency,
 * preserving the black metal INSIDE the emblem (guns, tattoos, chains).
 * Soft alpha on the anti-aliased boundary ring for clean edges.
 */
import sharp from "sharp";
import { readFileSync } from "node:fs";

const SRC = "public/fastguns-logo.png";
const SIZE = 512;

const { data, info } = await sharp(SRC)
  .resize(SIZE, SIZE, { fit: "cover" })
  .ensureAlpha()
  .raw()
  .toBuffer({ resolveWithObject: true });

const W = info.width;
const H = info.height;
const px = new Uint8ClampedArray(data); // RGBA

const idx = (x, y) => (y * W + x) * 4;
const lum = (i) => 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];

// Flood fill from every border pixel through "dark" pixels (the background).
// DARK_T: definitely background. SOFT_T: boundary ring gets proportional alpha.
const DARK_T = 22; // luminance below this = background
const SOFT_T = 58; // up to this = semi-transparent edge

const visited = new Uint8Array(W * H);
const stack = [];
for (let x = 0; x < W; x++) {
  stack.push([x, 0], [x, H - 1]);
}
for (let y = 0; y < H; y++) {
  stack.push([0, y], [W - 1, y]);
}

while (stack.length) {
  const [x, y] = stack.pop();
  if (x < 0 || y < 0 || x >= W || y >= H) continue;
  const p = y * W + x;
  if (visited[p]) continue;
  const i = idx(x, y);
  const L = lum(i);
  if (L >= SOFT_T) continue; // solid emblem pixel — stop here
  visited[p] = 1;
  // alpha: 0 for hard background, proportional for the soft boundary ring
  if (L <= DARK_T) {
    px[i + 3] = 0;
  } else {
    px[i + 3] = Math.round(((L - DARK_T) / (SOFT_T - DARK_T)) * 255 * 0.85);
  }
  stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
}

// Pass 2: pixel-perfect cleanup — kill stray semi-transparent specks far from the emblem
// (single-pixel alpha islands with no opaque neighbours).
const alphaAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 255 : px[idx(x, y) + 3]);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const i = idx(x, y);
    const a = px[i + 3];
    if (a === 0 || a === 255) continue;
    const nOpaque =
      (alphaAt(x - 1, y) > 200 ? 1 : 0) +
      (alphaAt(x + 1, y) > 200 ? 1 : 0) +
      (alphaAt(x, y - 1) > 200 ? 1 : 0) +
      (alphaAt(x, y + 1) > 200 ? 1 : 0);
    if (nOpaque === 0) px[i + 3] = 0;
  }
}

// Trim transparent margins, then re-square with tight padding.
const trimmed = await sharp(px, { raw: { width: W, height: H, channels: 4 } })
  .trim({ threshold: 8 })
  .png()
  .toBuffer();
const meta = await sharp(trimmed).metadata();
const side = Math.max(meta.width, meta.height);
const pad = Math.round(side * 0.04);
const canvas = side + pad * 2;

const finalPng = await sharp(trimmed)
  .resize({
    width: meta.width >= meta.height ? canvas - pad * 2 : null,
    height: meta.height > meta.width ? canvas - pad * 2 : null,
    fit: "inside",
  })
  .extend({
    top: pad,
    bottom: pad,
    left: pad,
    right: pad,
    background: { r: 0, g: 0, b: 0, alpha: 0 },
  })
  .png()
  .toBuffer();

await sharp(finalPng).resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile("public/fastguns-logo.png");

// Icon set: transparent for in-browser favicons, black-backed for apple/maskable
for (const s of [16, 32, 48]) {
  await sharp(finalPng).resize(s, s, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toFile(`public/icons/icon-${s}.png`);
}
for (const s of [180, 192, 512]) {
  await sharp(finalPng)
    .resize(Math.round(s * 0.82), Math.round(s * 0.82), { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .extend({ top: 0, bottom: 0, left: 0, right: 0, background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .flatten({ background: "#050505" })
    .resize(s, s, { fit: "contain", background: "#050505" })
    .png()
    .toFile(`public/icons/icon-${s}.png`);
}

console.log("DONE — logo trimmed to", meta.width, "x", meta.height, "→ squared", canvas);
