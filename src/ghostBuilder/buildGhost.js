// Parametric ghost: builder settings in, named OBJ parts out.
// Part names follow the convention the scanner uses to pick materials
// (body, eyeL/eyeR/eye*, mouth, cheek*, hat*, partyHat*, crown*, horn*, bow*, pumpkin, stem, arm*).

import { cylinder, ellipsoid, lathe, limb, translate, triangleCount } from './meshKit.js';

export const SHAPES = {
  classic: { label: 'Classic', profile: [[0.5, 0], [0.52, 0.15], [0.5, 0.35], [0.46, 0.55], [0.38, 0.75], [0.24, 0.9], [0, 1]] },
  round: { label: 'Round', profile: [[0.5, 0], [0.56, 0.15], [0.58, 0.35], [0.55, 0.55], [0.45, 0.75], [0.28, 0.9], [0, 1]] },
  wispy: { label: 'Wispy', profile: [[0.32, 0], [0.36, 0.15], [0.34, 0.35], [0.38, 0.55], [0.36, 0.75], [0.24, 0.9], [0, 1]] },
  bell: { label: 'Bell', profile: [[0.62, 0], [0.55, 0.15], [0.46, 0.35], [0.4, 0.55], [0.33, 0.75], [0.2, 0.9], [0, 1]] },
};

export const EYE_STYLES = { round: 'Round', tall: 'Tall', wide: 'Wide', dot: 'Tiny' };
export const MOUTH_STYLES = { oh: 'Oh', wide: 'Grin', wail: 'Wail', tiny: 'Tiny', none: 'None' };
export const ARM_STYLES = { down: 'Down', up: 'Raised', none: 'None' };
export const HATS = { none: 'None', top: 'Top hat', witch: 'Witch', party: 'Party', crown: 'Crown', horns: 'Horns' };

export const DEFAULT_PARAMS = {
  name: 'My Ghost',
  blurb: 'Haunts the walls.',
  shape: 'classic',
  height: 1,
  width: 1,
  facets: 12,
  scallops: 4,
  hem: 0.09,
  lean: 0,
  eyeCount: 2,
  eyeStyle: 'round',
  eyeSize: 1,
  eyeGap: 0.15,
  eyeHeight: 0.68,
  mouth: 'oh',
  mouthHeight: 0.5,
  cheeks: false,
  arms: 'down',
  hat: 'none',
  bowtie: false,
  pumpkin: false,
  color: '#e9fbff',
  glow: '#6fe3ff',
};

const EYE_BASE = { round: [0.065, 0.085], tall: [0.05, 0.14], wide: [0.09, 0.07], dot: [0.035, 0.035] };
const MOUTH_BASE = { oh: [0.07, 0.06], wide: [0.11, 0.03], wail: [0.1, 0.15], tiny: [0.04, 0.03] };

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export const slugify = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'ghost';

export function buildGhost(input) {
  const p = { ...DEFAULT_PARAMS, ...input };
  const H = clamp(p.height, 0.5, 2);
  const W = clamp(p.width, 0.5, 1.6);
  const segs = clamp(Math.round(p.facets), 6, 16);
  const shape = SHAPES[p.shape] || SHAPES.classic;
  const profile = shape.profile.map(([r, y]) => [r * W, y * H]);

  // Body radius at height y (linear between profile rings), and the lean shift at y.
  const radiusAt = (y) => {
    if (y <= profile[0][1]) return profile[0][0];
    for (let i = 1; i < profile.length; i++) {
      const [r1, y1] = profile[i];
      const [r0, y0] = profile[i - 1];
      if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0 || 1);
    }
    return 0;
  };
  const shiftX = (y) => p.lean * Math.pow(Math.max(0, 1 - y / H), 2);
  // z of the front surface at sideways offset x (relative to the body axis).
  const frontZ = (x, y) => {
    const r = radiusAt(y);
    return Math.sqrt(Math.max(r * r - x * x, (0.3 * r) ** 2)) * 0.97;
  };

  const objects = [];

  // ---- body ----
  objects.push([
    'body',
    lathe(profile, segs, (pt, i, s, a) => {
      let [x, y, z] = pt;
      if (i === 0) y += p.hem * Math.cos(a * p.scallops) * H;
      else if (i === 1) y += p.hem * 0.35 * Math.cos(a * p.scallops) * H;
      x += shiftX(y);
      return [x, y, z];
    }),
  ]);

  // ---- eyes ----
  const eyeY = p.eyeHeight * H;
  const [erx, ery] = EYE_BASE[p.eyeStyle] || EYE_BASE.round;
  const eyeSize = [erx * p.eyeSize, ery * p.eyeSize, 0.05];
  const gap = p.eyeGap * W;
  const eyeAt = (name, x, y) =>
    objects.push([name, translate(ellipsoid(eyeSize), [x + shiftX(y), y, frontZ(x, y)])]);
  if (p.eyeCount === 1) {
    eyeAt('eye', 0, eyeY);
  } else {
    eyeAt('eyeL', -gap, eyeY);
    eyeAt('eyeR', gap, eyeY);
    if (p.eyeCount >= 3) eyeAt('eyeThird', 0, eyeY + 0.2 * H * 0.6);
  }

  // ---- mouth + cheeks ----
  const mouthY = Math.min(p.mouthHeight * H, eyeY - 0.1 * H);
  if (p.mouth !== 'none') {
    const [mrx, mry] = MOUTH_BASE[p.mouth] || MOUTH_BASE.oh;
    objects.push([
      'mouth',
      translate(ellipsoid([mrx, mry, 0.04]), [shiftX(mouthY), mouthY, frontZ(0, mouthY)]),
    ]);
  }
  if (p.cheeks) {
    const cy = mouthY - 0.02 * H;
    const cx = Math.max(gap * 2, 0.22 * W);
    for (const [name, sx] of [['cheekL', -1], ['cheekR', 1]]) {
      objects.push([name, translate(ellipsoid([0.09, 0.05, 0.03]), [sx * cx + shiftX(cy), cy, frontZ(sx * cx, cy)])]);
    }
  }

  // ---- bow tie ----
  if (p.bowtie) {
    const by = 0.3 * H;
    const bz = frontZ(0, by);
    const bx = shiftX(by);
    objects.push(['bowL', translate(ellipsoid([0.09, 0.06, 0.04]), [bx - 0.09, by, bz])]);
    objects.push(['bowR', translate(ellipsoid([0.09, 0.06, 0.04]), [bx + 0.09, by, bz])]);
    objects.push(['bowKnot', translate(ellipsoid([0.035, 0.04, 0.05]), [bx, by, bz + 0.005])]);
  }

  // ---- arms (a held pumpkin always pulls them forward) ----
  const armY = 0.55 * H;
  const ar = radiusAt(armY);
  const ax = shiftX(armY);
  const arms = p.pumpkin ? 'hold' : p.arms;
  if (arms !== 'none') {
    for (const [name, s] of [['armL', -1], ['armR', 1]]) {
      const start = [s * ar * 0.95 + ax, armY, 0.02];
      let end;
      if (arms === 'up') end = [s * (ar + 0.2) + ax, armY + 0.3, 0.12];
      else if (arms === 'hold') end = [s * 0.2 + ax, 0.3 * H, radiusAt(0.3 * H) * 0.95];
      else end = [s * (ar + 0.2) + ax, armY - 0.13, 0.16];
      objects.push([name, limb(start, end, 0.065, 0.045)]);
    }
  }

  // ---- held pumpkin ----
  if (p.pumpkin) {
    const py = 0.3 * H;
    const pz = radiusAt(py) * 0.95;
    objects.push(['pumpkin', translate(ellipsoid([0.2, 0.16, 0.2], 4, 8), [ax, py, pz])]);
    objects.push(['stem', translate(cylinder(0.035, 0.025, 0.1, 5), [ax, py + 0.13, pz])]);
  }

  // ---- hats ----
  const ws = 0.75 + 0.25 * W; // hats shrink a little on thin ghosts
  const hy = 0.93 * H;
  const hx = shiftX(hy);
  if (p.hat === 'top') {
    objects.push(['hatBrim', translate(cylinder(0.36 * ws, 0.36 * ws, 0.04, 10), [hx, hy, 0])]);
    objects.push(['hat', translate(cylinder(0.22 * ws, 0.2 * ws, 0.3, 10), [hx, hy + 0.03, 0])]);
    objects.push(['hatBand', translate(cylinder(0.225 * ws, 0.225 * ws, 0.06, 10), [hx, hy + 0.05, 0])]);
  } else if (p.hat === 'witch') {
    objects.push(['hatBrim', translate(cylinder(0.4 * ws, 0.4 * ws, 0.03, 10), [hx, hy, 0])]);
    objects.push(['hat', translate(cylinder(0.21 * ws, 0.012, 0.5, 10), [hx, hy + 0.02, 0])]);
    objects.push(['hatBand', translate(cylinder(0.215 * ws, 0.215 * ws, 0.05, 10), [hx, hy + 0.04, 0])]);
  } else if (p.hat === 'party') {
    objects.push(['partyHat', translate(cylinder(0.17 * ws, 0.012, 0.42, 8), [hx, hy - 0.02, 0])]);
    objects.push(['partyPom', translate(ellipsoid([0.045, 0.045, 0.045]), [hx, hy + 0.41, 0])]);
  } else if (p.hat === 'crown') {
    objects.push(['crown', translate(cylinder(0.2 * ws, 0.22 * ws, 0.12, 8), [hx, hy - 0.02, 0])]);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      objects.push([
        `crownPoint${i + 1}`,
        translate(cylinder(0.04, 0.008, 0.11, 4), [hx + Math.cos(a) * 0.2 * ws, hy + 0.1, Math.sin(a) * 0.2 * ws]),
      ]);
    }
  } else if (p.hat === 'horns') {
    for (const [name, s] of [['hornL', -1], ['hornR', 1]]) {
      objects.push([
        name,
        limb([s * 0.15 * ws + hx, hy - 0.04, 0], [s * 0.3 * ws + hx, hy + 0.26, 0], 0.055, 0.01),
      ]);
    }
  }

  // ---- bounds + suggested placement on a marker (marker edge = 1 unit) ----
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const [, m] of objects) {
    for (const v of m.v) {
      for (let k = 0; k < 3; k++) {
        if (v[k] < min[k]) min[k] = v[k];
        if (v[k] > max[k]) max[k] = v[k];
      }
    }
  }
  const size = [max[0] - min[0], max[1] - min[1], max[2] - min[2]];
  const scale = Math.round(clamp(Math.min(1.1 / size[1], 1.3 / size[0]), 0.4, 1.1) * 100) / 100;
  const centre = (lo, hi) => Math.round(-((lo + hi) / 2) * scale * 100) / 100 + 0; // +0 turns -0 into 0
  const offset = [centre(min[0], max[0]), centre(min[1], max[1]), 0.45];
  const triangles = objects.reduce((n, [, m]) => n + triangleCount(m), 0);

  return { objects, bounds: { min, max, size }, scale, offset, triangles };
}
