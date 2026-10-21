// Browser-side marker images (same ArUco dictionary the scanner detects).
import { AR } from './arucoLib.js';
import { MARKER_DICTIONARY } from '../ghosts.js';

const CELL = 60; // px per marker cell -> 600 x 600 image
let dictionary;

export const MARKER_COUNT = () => (dictionary ??= new AR.Dictionary(MARKER_DICTIONARY)).codeList.length;

function gridFromSvg(svg) {
  const n = Number(/viewBox="0 0 (\d+) \d+"/.exec(svg)[1]);
  const grid = Array.from({ length: n }, () => Array(n).fill(true));
  for (const m of svg.matchAll(/<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)" fill="(\w+)"/g)) {
    const [x, y, w, h] = m.slice(1, 5).map(Number);
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) grid[j][i] = m[5] === 'white';
  }
  return grid;
}

export function markerCanvas(id) {
  dictionary ??= new AR.Dictionary(MARKER_DICTIONARY);
  const grid = gridFromSvg(dictionary.generateSVG(id));
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = grid.length * CELL;
  const ctx = canvas.getContext('2d');
  grid.forEach((row, j) =>
    row.forEach((white, i) => {
      ctx.fillStyle = white ? '#fff' : '#000';
      ctx.fillRect(i * CELL, j * CELL, CELL, CELL);
    }),
  );
  return canvas;
}

export const markerDataUrl = (id) => markerCanvas(id).toDataURL('image/png');

export const markerPngBlob = (id) =>
  new Promise((resolve, reject) =>
    markerCanvas(id).toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the marker image'))), 'image/png'),
  );
