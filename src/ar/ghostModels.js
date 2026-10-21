// Loads ghost OBJ files, gives each named part a material, and wraps the result
// in a group that is ready to be pinned to a marker.

import * as THREE from 'three';
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js';

const loader = new OBJLoader();
const templates = new Map(); // ghost id -> Promise<THREE.Group>

function bodyMaterial(ghost) {
  return new THREE.MeshStandardMaterial({
    color: ghost.color,
    emissive: ghost.glow,
    emissiveIntensity: 0.3,
    roughness: 0.65,
    metalness: 0,
    flatShading: true,
    transparent: true,
    opacity: 0.9,
    side: THREE.DoubleSide,
  });
}

function solid(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.8, flatShading: true, ...extra });
}

// Pick a material from the OBJ object name. Unknown parts get the ghost body look.
function materialFor(name, ghost, body) {
  const n = name.toLowerCase();
  if (n.startsWith('eye') || n.startsWith('mouth')) return new THREE.MeshBasicMaterial({ color: '#130d24' });
  if (n.startsWith('cheek')) return solid('#ff8fb0', { emissive: '#ff4f86', emissiveIntensity: 0.25 });
  if (n.startsWith('hatband')) return solid('#8a35e8', { emissive: '#6a1fc0', emissiveIntensity: 0.3 });
  if (n.startsWith('hat')) return solid('#1c1a2e');
  if (n.startsWith('pumpkin')) return solid('#ff7a1a', { emissive: '#ff5a00', emissiveIntensity: 0.45 });
  if (n.startsWith('stem')) return solid('#3f8f3a');
  return body; // body, arms, anything else
}

function loadTemplate(ghost) {
  const url = `${import.meta.env.BASE_URL}ghosts/${ghost.file}`;
  return loader.loadAsync(url).then((obj) => {
    const body = bodyMaterial(ghost);
    obj.traverse((child) => {
      if (!child.isMesh) return;
      child.geometry.computeVertexNormals();
      child.material = materialFor(child.name, ghost, body);
    });
    return obj;
  });
}

// Soft additive glow that sits on the wall behind the ghost.
function makeHalo(color) {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({
      map: texture,
      color,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    }),
  );
  mesh.position.z = 0.05;
  mesh.renderOrder = -1;
  return mesh;
}

/**
 * Returns a THREE.Group positioned in marker space (marker centre = origin,
 * +x right, +y up, +z out of the wall). `group.userData.inner` is the part to
 * animate (bob / sway).
 */
export async function createGhost(ghost) {
  if (!templates.has(ghost.id)) templates.set(ghost.id, loadTemplate(ghost));
  const template = await templates.get(ghost.id);

  const model = template.clone(true);
  const inner = new THREE.Group();
  inner.position.set(...ghost.offset);
  inner.scale.setScalar(ghost.scale);
  inner.add(model);

  const root = new THREE.Group();
  root.add(makeHalo(ghost.glow));
  root.add(inner);
  root.userData.inner = inner;
  root.userData.baseY = ghost.offset[1];
  return root;
}
