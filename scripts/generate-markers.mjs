// Writes one PNG per ghost marker into public/markers/ (no dependencies).
// Run with: npm run gen:markers
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { GHOSTS, MARKER_DICTIONARY, markerFileName } from '../src/ghosts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// js-aruco2 is a classic script library: run its sources against one shared context.
const ctx = {};
for (const f of ['cv', 'svd', 'aruco']) {
  const src = fs.readFileSync(path.join(root, 'node_modules/js-aruco2/src', `${f}.js`), 'utf8');
  new Function(src).call(ctx);
}
const dict = new ctx.AR.Dictionary(MARKER_DICTIONARY);

const CELL = 60; // pixels per marker cell -> 600 x 600 image (8x8 data+border, plus 1 cell white margin)

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

// Grayscale PNG from a cell grid (true = white).
function png(grid) {
  const n = grid.length;
  const size = n * CELL;
  const raw = Buffer.alloc((size + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      raw[row + 1 + x] = grid[Math.floor(y / CELL)][Math.floor(x / CELL)] ? 255 : 0;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // grayscale
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// Paint the SVG that js-aruco2 generates (a list of <rect>s on an n x n grid) onto a cell grid.
function gridFromSvg(svg) {
  const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)[1]);
  const grid = Array.from({ length: n }, () => Array(n).fill(true));
  for (const m of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(\w+)"/g)) {
    const [x, y, w, h] = m.slice(1, 5).map(Number);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j][i] = m[5] === 'white';
  }
  return grid;
}

const outDir = path.join(root, 'public', 'markers');
fs.mkdirSync(outDir, { recursive: true });
for (const g of GHOSTS) {
  const file = path.join(outDir, markerFileName(g));
  fs.writeFileSync(file, png(gridFromSvg(dict.generateSVG(g.id))));
  console.log('wrote', path.relative(root, file));
}
