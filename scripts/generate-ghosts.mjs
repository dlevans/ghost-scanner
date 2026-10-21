// Generates a set of low-poly ghost OBJ files into public/ghosts/.
// Each OBJ contains named objects (body, eyeL, eyeR, mouth, ...) so the app can
// give every part its own material. Replace any of these with your own OBJ files
// and point to them in src/ghosts.js.
//
// Run: npm run gen:ghosts

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'ghosts');
fs.mkdirSync(OUT, { recursive: true });

// ---------- tiny mesh helpers -------------------------------------------------

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const mesh = (v = [], f = []) => ({ v, f });

function translate(m, [x, y, z]) {
  m.v = m.v.map((p) => [p[0] + x, p[1] + y, p[2] + z]);
  return m;
}

// Make a closed mesh's faces point outward (checks the signed volume).
function fixWinding(m) {
  let vol = 0;
  for (const face of m.f) {
    for (let i = 1; i < face.length - 1; i++) {
      vol += dot(m.v[face[0]], cross(m.v[face[i]], m.v[face[i + 1]]));
    }
  }
  if (vol < 0) m.f = m.f.map((face) => [...face].reverse());
  return m;
}

// Lathe around the Y axis. profile = [[radius, y], ...] bottom -> top (last radius may be 0).
function lathe(profile, segs, warp) {
  const v = [];
  const f = [];
  const rings = profile.length;
  for (let i = 0; i < rings; i++) {
    const [r, y] = profile[i];
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      let p = [r * Math.cos(a), y, r * Math.sin(a)];
      if (warp) p = warp(p, i, s, a, rings);
      v.push(p);
    }
  }
  const idx = (i, s) => i * segs + (s % segs);
  for (let i = 0; i < rings - 1; i++) {
    for (let s = 0; s < segs; s++) {
      // outward-facing winding
      f.push([idx(i, s), idx(i + 1, s), idx(i + 1, s + 1), idx(i, s + 1)]);
    }
  }
  return mesh(v, f);
}

function ellipsoid([rx, ry, rz], lat = 4, lon = 6) {
  const v = [[0, ry, 0]];
  const f = [];
  for (let i = 1; i < lat; i++) {
    const t = (i / lat) * Math.PI;
    for (let s = 0; s < lon; s++) {
      const a = (s / lon) * Math.PI * 2;
      v.push([rx * Math.sin(t) * Math.cos(a), ry * Math.cos(t), rz * Math.sin(t) * Math.sin(a)]);
    }
  }
  v.push([0, -ry, 0]);
  const bottom = v.length - 1;
  for (let s = 0; s < lon; s++) f.push([0, 1 + s, 1 + ((s + 1) % lon)]);
  for (let i = 0; i < lat - 2; i++) {
    for (let s = 0; s < lon; s++) {
      const a = 1 + i * lon + s;
      const b = 1 + i * lon + ((s + 1) % lon);
      f.push([a, a + lon, b + lon, b]);
    }
  }
  const last = 1 + (lat - 2) * lon;
  for (let s = 0; s < lon; s++) f.push([last + ((s + 1) % lon), last + s, bottom]);
  return fixWinding(mesh(v, f));
}

// Tapered 5-sided limb between two points.
function limb(p0, p1, r0, r1, segs = 5) {
  const dir = norm(sub(p1, p0));
  const helper = Math.abs(dir[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const u = norm(cross(dir, helper));
  const w = cross(dir, u);
  const v = [];
  const f = [];
  for (const [p, r] of [[p0, r0], [p1, r1]]) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      const c = Math.cos(a) * r;
      const d = Math.sin(a) * r;
      v.push([p[0] + u[0] * c + w[0] * d, p[1] + u[1] * c + w[1] * d, p[2] + u[2] * c + w[2] * d]);
    }
  }
  for (let s = 0; s < segs; s++) f.push([s, (s + 1) % segs, segs + ((s + 1) % segs), segs + s]);
  v.push(p0, p1);
  for (let s = 0; s < segs; s++) {
    f.push([2 * segs, (s + 1) % segs, s]);
    f.push([2 * segs + 1, segs + s, segs + ((s + 1) % segs)]);
  }
  return fixWinding(mesh(v, f));
}

function cylinder(r0, r1, h, segs = 8) {
  const v = [];
  const f = [];
  for (const [r, y] of [[r0, 0], [r1, h]]) {
    for (let s = 0; s < segs; s++) {
      const a = (s / segs) * Math.PI * 2;
      v.push([r * Math.cos(a), y, r * Math.sin(a)]);
    }
  }
  for (let s = 0; s < segs; s++) f.push([s, segs + s, segs + ((s + 1) % segs), (s + 1) % segs]);
  v.push([0, 0, 0], [0, h, 0]);
  for (let s = 0; s < segs; s++) {
    f.push([2 * segs, (s + 1) % segs, s]);
    f.push([2 * segs + 1, segs + s, segs + ((s + 1) % segs)]);
  }
  return fixWinding(mesh(v, f));
}

// ---------- OBJ writer --------------------------------------------------------

function writeObj(file, objects) {
  const lines = [`# low-poly ghost: ${file}`];
  let offset = 1;
  for (const [name, m] of objects) {
    lines.push(`o ${name}`);
    for (const p of m.v) lines.push(`v ${p[0].toFixed(4)} ${p[1].toFixed(4)} ${p[2].toFixed(4)}`);
    for (const face of m.f) lines.push(`f ${face.map((i) => i + offset).join(' ')}`);
    offset += m.v.length;
  }
  fs.writeFileSync(path.join(OUT, file), lines.join('\n') + '\n');
  const tris = objects.reduce((n, [, m]) => n + m.f.reduce((k, face) => k + face.length - 2, 0), 0);
  console.log(`${file.padEnd(14)} ${objects.length} parts, ${tris} triangles`);
}

// ---------- body shapes -------------------------------------------------------

// Classic dome-and-skirt ghost, base at y=0, front faces +Z.
function body({ height = 1, width = 1, segs = 12, scallops = 4, hem = 0.09, bend = 0 } = {}) {
  const profile = [
    [0.5, 0],
    [0.52, 0.15],
    [0.5, 0.35],
    [0.46, 0.55],
    [0.38, 0.75],
    [0.24, 0.9],
    [0.0, 1.0],
  ].map(([r, y]) => [r * width, y * height]);
  return lathe(profile, segs, (p, i, s, a) => {
    let [x, y, z] = p;
    if (i === 0) y += hem * Math.cos(a * scallops) * height;
    else if (i === 1) y += hem * 0.35 * Math.cos(a * scallops) * height;
    if (bend) x += bend * Math.pow(1 - y / height, 2);
    return [x, y, z];
  });
}

const eyes = (y, z, gap, size = [0.065, 0.1, 0.05]) => [
  ['eyeL', translate(ellipsoid(size), [-gap, y, z])],
  ['eyeR', translate(ellipsoid(size), [gap, y, z])],
];

// ---------- the ghosts --------------------------------------------------------

// 0 - Boo-ris: the classic.
writeObj('boo.obj', [
  ['body', body()],
  ...eyes(0.68, 0.4, 0.16),
  ['mouth', translate(ellipsoid([0.07, 0.06, 0.04]), [0, 0.5, 0.43])],
  ['armL', limb([-0.44, 0.52, 0.02], [-0.66, 0.4, 0.18], 0.07, 0.05)],
  ['armR', limb([0.44, 0.52, 0.02], [0.66, 0.4, 0.18], 0.07, 0.05)],
]);

// 1 - Gloom: tall, thin and sorrowful.
writeObj('gloom.obj', [
  ['body', body({ height: 1.6, width: 0.72, segs: 10, scallops: 5, hem: 0.07 })],
  ...eyes(1.12, 0.3, 0.12, [0.05, 0.14, 0.04]),
  ['mouth', translate(ellipsoid([0.05, 0.1, 0.04]), [0, 0.82, 0.34])],
  ['armL', limb([-0.32, 1.0, 0.0], [-0.46, 0.5, 0.12], 0.05, 0.035)],
  ['armR', limb([0.32, 1.0, 0.0], [0.46, 0.5, 0.12], 0.05, 0.035)],
]);

// 2 - Chubbs: short, round and rosy.
writeObj('chubbs.obj', [
  ['body', body({ height: 0.78, width: 1.3, segs: 12, scallops: 3, hem: 0.07 })],
  ...eyes(0.5, 0.5, 0.2, [0.06, 0.08, 0.05]),
  ['cheekL', translate(ellipsoid([0.09, 0.05, 0.03]), [-0.34, 0.4, 0.45])],
  ['cheekR', translate(ellipsoid([0.09, 0.05, 0.03]), [0.34, 0.4, 0.45])],
  ['mouth', translate(ellipsoid([0.05, 0.035, 0.03]), [0, 0.38, 0.55])],
  ['armL', limb([-0.6, 0.38, 0.05], [-0.78, 0.46, 0.14], 0.08, 0.06)],
  ['armR', limb([0.6, 0.38, 0.05], [0.78, 0.46, 0.14], 0.08, 0.06)],
]);

// 3 - Sir Spook: a gentleman in a top hat.
writeObj('sir-spook.obj', [
  ['body', body()],
  ...eyes(0.68, 0.4, 0.15, [0.055, 0.085, 0.045]),
  ['mouth', translate(ellipsoid([0.1, 0.03, 0.03]), [0, 0.5, 0.42])],
  ['hatBrim', translate(cylinder(0.36, 0.36, 0.04, 10), [0, 0.93, 0])],
  ['hat', translate(cylinder(0.22, 0.2, 0.3, 10), [0, 0.96, 0])],
  ['hatBand', translate(cylinder(0.225, 0.225, 0.06, 10), [0, 0.98, 0])],
  ['armL', limb([-0.44, 0.5, 0.02], [-0.6, 0.3, 0.12], 0.06, 0.045)],
  ['armR', limb([0.44, 0.5, 0.02], [0.6, 0.3, 0.12], 0.06, 0.045)],
]);

// 4 - The Wailer: a wispy ghost with a swept tail and a wide-open mouth.
writeObj('wailer.obj', [
  ['body', body({ height: 1.25, width: 0.85, segs: 10, scallops: 2, hem: 0.12, bend: 0.5 })],
  ...eyes(0.88, 0.34, 0.14, [0.055, 0.12, 0.045]),
  ['mouth', translate(ellipsoid([0.1, 0.15, 0.04]), [0, 0.62, 0.37])],
  ['armL', limb([-0.38, 0.8, 0.02], [-0.6, 1.0, 0.12], 0.055, 0.04)],
  ['armR', limb([0.38, 0.8, 0.02], [0.6, 1.0, 0.12], 0.055, 0.04)],
]);

// 5 - Jack-o'-Ghost: clutching a very small pumpkin.
writeObj('jack.obj', [
  ['body', body({ height: 0.95, width: 1.05 })],
  ...eyes(0.66, 0.4, 0.15),
  ['mouth', translate(ellipsoid([0.06, 0.05, 0.04]), [0, 0.5, 0.42])],
  ['pumpkin', translate(ellipsoid([0.2, 0.16, 0.2], 4, 8), [0, 0.28, 0.5])],
  ['stem', translate(cylinder(0.035, 0.025, 0.1, 5), [0, 0.4, 0.5])],
  ['armL', limb([-0.42, 0.48, 0.05], [-0.2, 0.3, 0.46], 0.065, 0.05)],
  ['armR', limb([0.42, 0.48, 0.05], [0.2, 0.3, 0.46], 0.065, 0.05)],
]);
