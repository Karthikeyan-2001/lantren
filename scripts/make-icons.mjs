// Draws the Lantern app icons (an arch window with one flame) as PNGs with no
// image dependencies. Run: node scripts/make-icons.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const INK = [0x14, 0x11, 0x0f];
const SOOT = [0x2a, 0x24, 0x1f];
const ASH = [0x8c, 0x82, 0x79];
const EMBER = [0xff, 0x7a, 0x3d];
const CORE = [0xff, 0xd9, 0xa8];

const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);

/** Colour at a point in unit space (0..1). `scale` shrinks the art for maskable safe zones. */
function sample(x, y, scale) {
  const u = (x - 0.5) / scale + 0.5;
  const v = (y - 0.5) / scale + 0.5;
  let c = INK;

  // Arch window: a half circle sitting on a rectangle.
  const half = 0.23;
  const top = 0.4;
  const bottom = 0.84;
  const archDist = (inset) => {
    const r = half - inset;
    if (v > bottom - inset) return 1;
    if (v >= top) return Math.abs(u - 0.5) - r;
    return Math.hypot(u - 0.5, v - top) - r;
  };
  if (archDist(0) < 0) c = ASH;
  if (archDist(0.012) < 0) c = SOOT;

  // Warm glow behind the flame.
  if (archDist(0.012) < 0) {
    const g = Math.max(0, 1 - Math.hypot(u - 0.5, v - 0.62) / 0.26);
    c = mix(c, EMBER, g * g * 0.35);
  }

  // Flame: a teardrop whose half-width varies with height.
  const flame = (fTop, fBottom, width) => {
    const t = (v - fTop) / (fBottom - fTop);
    if (t <= 0 || t >= 1) return false;
    const w = width * 1.75 * Math.pow(t, 0.9) * Math.pow(1 - t, 0.45);
    return Math.abs(u - 0.5) < w;
  };
  if (flame(0.36, 0.78, 0.13)) c = EMBER;
  if (flame(0.56, 0.76, 0.06)) c = CORE;
  return c;
}

function render(size, scale) {
  const ss = 3;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    const row = py * (size * 4 + 1);
    raw[row] = 0;
    for (let px = 0; px < size; px++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = sample((px + (sx + 0.5) / ss) / size, (py + (sy + 0.5) / ss) / size, scale);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      }
      const o = row + 1 + px * 4;
      raw[o] = Math.round(acc[0] / (ss * ss));
      raw[o + 1] = Math.round(acc[1] / (ss * ss));
      raw[o + 2] = Math.round(acc[2] / (ss * ss));
      raw[o + 3] = 255;
    }
  }
  return png(size, size, raw);
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(w, h, raw) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('public/icons', { recursive: true });
writeFileSync('public/icons/icon-192.png', render(192, 1));
writeFileSync('public/icons/icon-512.png', render(512, 1));
writeFileSync('public/icons/icon-maskable-512.png', render(512, 0.72));
console.log('icons written to public/icons');
