import sharp from 'sharp';
import { mkdirSync } from 'fs';

const SRC = '/home/z/my-project/upload/FAST.png';
const OUT = '/home/z/my-project/public';
mkdirSync(`${OUT}/icons`, { recursive: true });

const sizes = [
  { name: 'fastguns-logo.png', size: 512 },       // main logo asset
  { name: 'icons/icon-512.png', size: 512 },      // PWA
  { name: 'icons/icon-192.png', size: 192 },      // PWA
  { name: 'icons/icon-180.png', size: 180 },      // apple-touch-icon
  { name: 'icons/icon-32.png', size: 32 },        // favicon 32
  { name: 'icons/icon-16.png', size: 16 },        // favicon 16
];

for (const { name, size } of sizes) {
  await sharp(SRC)
    .resize(size, size, { fit: 'cover' })
    .png({ compressionLevel: 9, quality: 90 })
    .toFile(`${OUT}/${name}`);
  console.log('wrote', name, size);
}
// favicon.ico via 32px png is fine for modern browsers; also produce a 48px
await sharp(SRC).resize(48, 48, { fit: 'cover' }).png({ compressionLevel: 9 }).toFile(`${OUT}/icons/icon-48.png`);
console.log('done');
