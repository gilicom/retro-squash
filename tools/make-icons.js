/**
 * Generate the PWA icons in public/icons/ without any image library.
 *
 * Usage:  node tools/make-icons.js
 *
 * The icon is the favicon design (dark rounded tile, cream front wall with
 * the red out line and service line, yellow ball) rasterised with 4x4
 * supersampling and written as RGBA PNGs through zlib. The maskable variant
 * keeps the artwork inside the 80 % safe zone on a full-bleed background.
 */
import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const outDir = join(root, 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const BG = hex('#0b0f16');
const WALL = hex('#e8dcc0');
const LINE = hex('#d8232a');
const BALL = hex('#f5e16a');

/**
 * Shapes in a 64-unit design space (same as favicon.svg), painted in order.
 * @param {boolean} maskable scale the artwork into the safe zone
 */
function shapes(maskable) {
  const s = maskable ? 0.72 : 1;
  const o = (64 - 64 * s) / 2;
  const t = (v) => o + v * s;
  return [
    { kind: 'rrect', x: 0, y: 0, w: 64, h: 64, r: maskable ? 0 : 12, color: BG },
    { kind: 'rect', x: t(9), y: t(9), w: 46 * s, h: 46 * s, color: LINE },
    { kind: 'rect', x: t(11), y: t(11), w: 42 * s, h: 42 * s, color: WALL },
    { kind: 'rect', x: t(10), y: t(39), w: 44 * s, h: 2 * s, color: LINE },
    { kind: 'circle', cx: t(40), cy: t(26), r: 6 * s, color: BALL },
  ];
}

function inside(sh, x, y) {
  switch (sh.kind) {
    case 'rect':
      return x >= sh.x && x < sh.x + sh.w && y >= sh.y && y < sh.y + sh.h;
    case 'circle':
      return (x - sh.cx) ** 2 + (y - sh.cy) ** 2 <= sh.r ** 2;
    case 'rrect': {
      if (x < sh.x || x >= sh.x + sh.w || y < sh.y || y >= sh.y + sh.h) return false;
      const r = sh.r;
      const cx = Math.min(Math.max(x, sh.x + r), sh.x + sh.w - r);
      const cy = Math.min(Math.max(y, sh.y + r), sh.y + sh.h - r);
      return (x - cx) ** 2 + (y - cy) ** 2 <= r * r;
    }
    default:
      return false;
  }
}

function raster(size, maskable) {
  const list = shapes(maskable);
  const px = Buffer.alloc(size * size * 4);
  const SS = 4;
  const scale = 64 / size;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const ux = (x + (sx + 0.5) / SS) * scale;
          const uy = (y + (sy + 0.5) / SS) * scale;
          let c = null;
          for (const sh of list) if (inside(sh, ux, uy)) c = sh.color;
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 255; }
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      const cov = a / n;
      // Premultiplied average -> straight alpha.
      px[i] = cov ? Math.round(r / (a / 255)) : 0;
      px[i + 1] = cov ? Math.round(g / (a / 255)) : 0;
      px[i + 2] = cov ? Math.round(b / (a / 255)) : 0;
      px[i + 3] = Math.round(cov);
    }
  }
  return px;
}

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, px) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const rows = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0;
    px.copy(rows, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const files = [
  ['icon-192.png', 192, false],
  ['icon-512.png', 512, false],
  ['icon-maskable-512.png', 512, true],
  ['apple-touch-icon.png', 180, true],
];
for (const [name, size, maskable] of files) {
  const buf = png(size, raster(size, maskable));
  writeFileSync(join(outDir, name), buf);
  console.log(`${name}  ${size}x${size}  ${(buf.length / 1024).toFixed(1)} kB`);
}
