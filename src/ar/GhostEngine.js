// Camera frame -> ArUco detection -> pose -> Three.js overlay.
// Plain class so the React component only has to start/stop it and listen to events.

import * as THREE from 'three';
import { createMarkerTracker } from './markerPose.js';
import { createGhost } from './ghostModels.js';
import { GHOSTS, GHOSTS_BY_ID, MARKER_DICTIONARY } from '../ghosts.js';

const DETECT_MAX_SIDE = 640; // detection runs on a downscaled copy of the frame
const DETECT_INTERVAL_MS = 33; // ~30 detections per second at most
const GRACE_MS = 350; // keep a ghost around briefly if the marker drops out for a moment
const SMOOTHING = 0.45; // 0..1, higher = snappier, lower = steadier

const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _y = new THREE.Vector3();
const _z = new THREE.Vector3();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export class GhostEngine {
  /**
   * @param {object} opts
   * @param {HTMLVideoElement} opts.video
   * @param {HTMLCanvasElement} opts.canvas  transparent overlay canvas, same box as the video
   * @param {(ghost:object)=>void} [opts.onFound]  first time each ghost is seen
   * @param {(ids:number[])=>void} [opts.onVisibleChange]  ids of ghosts currently on screen
   * @param {(stats:{fps:number, markers:number[]})=>void} [opts.onStats]
   */
  constructor({ video, canvas, onFound, onVisibleChange, onStats }) {
    this.video = video;
    this.canvas = canvas;
    this.onFound = onFound;
    this.onVisibleChange = onVisibleChange;
    this.onStats = onStats;

    this.tracks = new Map(); // marker id -> { root, lastSeen, appear, seen, loading }
    this.found = new Set();
    this.visibleKey = '';
    this.running = false;
    this.lastDetect = 0;
    this.lastFrame = 0;
    this.fpsFrames = 0;
    this.fpsStart = 0;
    this.lastMarkers = [];
  }

  start() {
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(50, 4 / 3, 0.01, 100);
    this.scene.add(new THREE.AmbientLight(0xffffff, 1.4));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(1, 2, 3);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x8f7bff, 1.2);
    rim.position.set(-2, 1, -1);
    this.scene.add(rim);

    this.detectCanvas = document.createElement('canvas');
    this.detectCtx = this.detectCanvas.getContext('2d', { willReadFrequently: true });

    this.configure();
    this.video.addEventListener('resize', this.configure);

    this.resizeObserver = new ResizeObserver(this.handleResize);
    this.resizeObserver.observe(this.canvas);
    this.handleResize();

    this.running = true;
    this.fpsStart = performance.now();
    this.raf = requestAnimationFrame(this.frame);
  }

  // Re-run when the video size is known or changes (e.g. phone rotation).
  configure = () => {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return;
    const s = Math.min(1, DETECT_MAX_SIDE / Math.max(vw, vh));
    this.dw = Math.round(vw * s);
    this.dh = Math.round(vh * s);
    this.detectCanvas.width = this.dw;
    this.detectCanvas.height = this.dh;
    this.tracker = createMarkerTracker({
      dictionaryName: MARKER_DICTIONARY,
      width: this.dw,
      height: this.dh,
    });
    this.camera.fov = this.tracker.verticalFov;
    this.camera.aspect = this.dw / this.dh;
    this.camera.updateProjectionMatrix();
  };

  handleResize = () => {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w && h) this.renderer.setSize(w, h, false);
  };

  frame = (now) => {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);

    const dt = Math.min((now - (this.lastFrame || now)) / 1000, 0.1);
    this.lastFrame = now;

    if (this.tracker && this.video.readyState >= 2 && now - this.lastDetect >= DETECT_INTERVAL_MS) {
      this.lastDetect = now;
      this.detectAndTrack(now);
    }

    this.animate(now, dt);
    this.renderer.render(this.scene, this.camera);

    this.fpsFrames++;
    if (now - this.fpsStart >= 1000) {
      this.onStats?.({ fps: this.fpsFrames, markers: this.lastMarkers });
      this.fpsFrames = 0;
      this.fpsStart = now;
    }
  };

  detectAndTrack(now) {
    this.detectCtx.drawImage(this.video, 0, 0, this.dw, this.dh);
    const image = this.detectCtx.getImageData(0, 0, this.dw, this.dh);
    const markers = this.tracker.detect(image);
    this.lastMarkers = markers.map((m) => m.id);

    for (const marker of markers) {
      const ghost = GHOSTS_BY_ID[marker.id];
      if (!ghost) continue; // a marker we have no ghost for

      let track = this.tracks.get(marker.id);
      if (!track) {
        track = { root: null, lastSeen: now, appear: 0, seen: false, loading: true };
        this.tracks.set(marker.id, track);
        createGhost(ghost)
          .then((root) => {
            if (!this.running) return;
            root.visible = false;
            this.scene.add(root);
            track.root = root;
            track.loading = false;
          })
          .catch((err) => {
            console.error(`Could not load ghost ${ghost.file}`, err);
          });
      }
      track.lastSeen = now;
      if (!track.root) continue;

      _m.makeBasis(_x.fromArray(marker.x), _y.fromArray(marker.y), _z.fromArray(marker.z));
      _m.setPosition(marker.position[0], marker.position[1], marker.position[2]);
      _m.decompose(_p, _q, _s);

      if (!track.seen) {
        track.root.position.copy(_p);
        track.root.quaternion.copy(_q);
        track.seen = true;
      } else {
        track.root.position.lerp(_p, SMOOTHING);
        track.root.quaternion.slerp(_q, SMOOTHING);
      }

      if (!this.found.has(marker.id)) {
        this.found.add(marker.id);
        this.onFound?.(ghost);
      }
    }
  }

  animate(now, dt) {
    const t = now / 1000;
    const visible = [];
    for (const [id, track] of this.tracks) {
      if (!track.root) continue;
      const inView = now - track.lastSeen < GRACE_MS;
      track.appear = THREE.MathUtils.clamp(track.appear + (inView ? dt * 2.5 : -dt * 5), 0, 1);
      if (!inView && track.appear === 0) track.seen = false; // pop in fresh next time

      const root = track.root;
      root.visible = track.appear > 0.001;
      if (!root.visible) continue;
      visible.push(id);

      root.scale.setScalar(Math.max(0.001, easeOutBack(track.appear)));
      const inner = root.userData.inner;
      inner.position.y = root.userData.baseY + Math.sin(t * 2 + id) * 0.04;
      inner.rotation.z = Math.sin(t * 1.4 + id) * 0.06;
      inner.rotation.y = Math.sin(t * 0.9 + id * 2) * 0.25;
    }

    const key = visible.sort().join(',');
    if (key !== this.visibleKey) {
      this.visibleKey = key;
      this.onVisibleChange?.(visible);
    }
  }

  /**
   * Snapshot of what's on screen: the camera frame at full video resolution with the
   * ghosts drawn over it, cropped to the visible area. Resolves to a JPEG Blob.
   * @param {{width:number, height:number}} view  size (CSS px) of the box the stage is cropped to
   */
  capturePhoto(view) {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    const sw = this.canvas.clientWidth;
    const sh = this.canvas.clientHeight;
    if (!this.running || !vw || !vh || !sw || !sh) return Promise.reject(new Error('The camera is not ready yet'));

    // Visible rectangle in stage (CSS) pixels, centred like the on-screen cover layout.
    const bw = Math.min(view?.width || sw, sw);
    const bh = Math.min(view?.height || sh, sh);
    const cx = (sw - bw) / 2;
    const cy = (sh - bh) / 2;

    const k = vw / sw; // video pixels per CSS pixel
    const out = Math.min(1, 2048 / Math.max(bw * k, bh * k)); // keep photos under ~2048 px
    const outW = Math.round(bw * k * out);
    const outH = Math.round(bh * k * out);

    const photo = document.createElement('canvas');
    photo.width = outW;
    photo.height = outH;
    const ctx = photo.getContext('2d');
    ctx.drawImage(this.video, cx * k, cy * k, bw * k, bh * k, 0, 0, outW, outH);

    // Render right now so the WebGL canvas still holds this frame when we copy it.
    this.renderer.render(this.scene, this.camera);
    const g = this.canvas.width / sw; // GL pixels per CSS pixel
    ctx.drawImage(this.canvas, cx * g, cy * g, bw * g, bh * g, 0, 0, outW, outH);

    // Small signature in the corner.
    const fontPx = Math.max(14, Math.round(outH * 0.022));
    ctx.font = `600 ${fontPx}px system-ui, sans-serif`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = fontPx * 0.4;
    ctx.fillText('Ghost Scanner', outW - fontPx, outH - fontPx);

    return new Promise((resolve, reject) =>
      photo.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the photo'))), 'image/jpeg', 0.92),
    );
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.video.removeEventListener('resize', this.configure);
    this.resizeObserver?.disconnect();
    this.scene?.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        mats.forEach((m) => {
          m.map?.dispose();
          m.dispose();
        });
      }
    });
    this.renderer?.dispose();
    this.tracks.clear();
  }
}

export const GHOST_COUNT = GHOSTS.length;
