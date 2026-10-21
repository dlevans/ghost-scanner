// Tiny low-poly mesh helpers (no dependencies) + an OBJ writer.
// A mesh is { v: [[x,y,z],...], f: [[i,j,k,...],...] } with 0-based indices.

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a) => {
  const l = Math.hypot(...a) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

export const mesh = (v = [], f = []) => ({ v, f });

export function translate(m, [x, y, z]) {
  m.v = m.v.map((p) => [p[0] + x, p[1] + y, p[2] + z]);
  return m;
}

// Make a closed mesh's faces point outward (checks the signed volume).
export function fixWinding(m) {
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
export function lathe(profile, segs, warp) {
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
      f.push([idx(i, s), idx(i + 1, s), idx(i + 1, s + 1), idx(i, s + 1)]);
    }
  }
  return mesh(v, f);
}

export function ellipsoid([rx, ry, rz], lat = 4, lon = 6) {
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
export function limb(p0, p1, r0, r1, segs = 5) {
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

// Capped cylinder / cone standing on y=0 (r1 may be ~0 for a cone).
export function cylinder(r0, r1, h, segs = 8) {
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

export const triangleCount = (m) => m.f.reduce((n, face) => n + face.length - 2, 0);

/** objects = [[name, mesh], ...] -> OBJ text with one named `o` object per part. */
export function toObj(objects, comment = 'low-poly ghost') {
  const lines = [`# ${comment.replace(/[\r\n]+/g, ' ')}`, '# made with the Ghost Scanner ghost builder'];
  let offset = 1;
  for (const [name, m] of objects) {
    lines.push(`o ${name}`);
    for (const p of m.v) lines.push(`v ${p[0].toFixed(4)} ${p[1].toFixed(4)} ${p[2].toFixed(4)}`);
    for (const face of m.f) lines.push(`f ${face.map((i) => i + offset).join(' ')}`);
    offset += m.v.length;
  }
  return lines.join('\n') + '\n';
}
