import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { GHOSTS, GHOSTS_BY_ID, markerFileName } from '../ghosts.js';
import { parseGhostObj } from '../ar/ghostModels.js';
import { MARKER_COUNT, markerDataUrl, markerPngBlob } from '../ar/markerImage.js';
import {
  ARM_STYLES,
  DEFAULT_PARAMS,
  EYE_STYLES,
  HATS,
  MOUTH_STYLES,
  SHAPES,
  buildGhost,
  slugify,
} from '../ghostBuilder/buildGhost.js';
import { toObj } from '../ghostBuilder/meshKit.js';
import { makeZip } from '../ghostBuilder/zip.js';

const PALETTES = [
  ...GHOSTS.map((g) => ({ name: g.name, color: g.color, glow: g.glow })),
  { name: 'Slime', color: '#e8ffd9', glow: '#7dff4f' },
  { name: 'Blood moon', color: '#ffe3e3', glow: '#ff4d4d' },
  { name: 'Midnight', color: '#c9c4ff', glow: '#3b2bff' },
  { name: 'Sunset', color: '#fff0d9', glow: '#ff6a3d' },
];

const nextFreeId = () => Math.max(...GHOSTS.map((g) => g.id)) + 1;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const rand = (lo, hi, step = 0.01) => Number((Math.round((lo + Math.random() * (hi - lo)) / step) * step).toFixed(2));

function download(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---------- small controls ----------

function Slider({ label, value, min, max, step = 0.01, onChange, format }) {
  return (
    <label className="ctl">
      <span className="ctl-label">
        {label} <em>{format ? format(value) : Number(value.toFixed(2))}</em>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Seg({ label, value, options, onChange }) {
  return (
    <div className="ctl">
      <span className="ctl-label">{label}</span>
      <div className="seg" role="group" aria-label={label}>
        {Object.entries(options).map(([key, text]) => {
          const k = Number.isNaN(Number(key)) ? key : Number(key);
          return (
            <button key={key} type="button" className={value === k ? 'on' : ''} onClick={() => onChange(k)}>
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="ctl toggle">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

// ---------- 3D preview ----------

function Preview({ objText, color, glow }) {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);

  useEffect(() => {
    const mount = mountRef.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    camera.position.set(0, 0.15, 4);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x3a2a70, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 1.6);
    sun.position.set(2, 3, 4);
    scene.add(sun);

    const pivot = new THREE.Group();
    scene.add(pivot);
    const view = { yaw: 0.5, pitch: 0.1, dragging: false, lastX: 0, lastY: 0, idle: 0 };
    sceneRef.current = { pivot, view };

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(mount);
    resize();

    const el = renderer.domElement;
    const down = (e) => {
      view.dragging = true;
      view.lastX = e.clientX;
      view.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    };
    const move = (e) => {
      if (!view.dragging) return;
      view.yaw += (e.clientX - view.lastX) * 0.01;
      view.pitch = Math.max(-0.8, Math.min(0.8, view.pitch + (e.clientY - view.lastY) * 0.008));
      view.lastX = e.clientX;
      view.lastY = e.clientY;
    };
    const up = () => {
      view.dragging = false;
      view.idle = 0;
    };
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    let raf;
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!view.dragging) {
        view.idle += 1;
        if (view.idle > 90) view.yaw += 0.008; // gentle spin once you let go
      }
      pivot.rotation.set(view.pitch, view.yaw, 0);
      renderer.render(scene, camera);
    };
    loop();

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      renderer.dispose();
      mount.removeChild(el);
    };
  }, []);

  useEffect(() => {
    const { pivot } = sceneRef.current;
    for (const old of [...pivot.children]) {
      pivot.remove(old);
      old.traverse((c) => {
        if (c.isMesh) {
          c.geometry.dispose();
          c.material.dispose();
        }
      });
    }
    const model = parseGhostObj(objText, { color, glow });
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const centre = box.getCenter(new THREE.Vector3());
    model.position.sub(centre);
    const holder = new THREE.Group();
    holder.add(model);
    holder.scale.setScalar(2 / Math.max(size.x, size.y, size.z, 0.5));
    pivot.add(holder);
  }, [objText, color, glow]);

  return <div className="preview" ref={mountRef} aria-label="3D preview of your ghost. Drag to rotate." />;
}

// ---------- the page ----------

export default function GhostBuilder() {
  const [p, setP] = useState(DEFAULT_PARAMS);
  const [markerId, setMarkerId] = useState(nextFreeId);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const fileRef = useRef(null);
  const set = (key) => (value) => setP((s) => ({ ...s, [key]: value }));

  const slug = slugify(p.name);
  const built = useMemo(() => buildGhost(p), [p]);
  const objText = useMemo(() => toObj(built.objects, p.name), [built, p.name]);

  const markerOk = Number.isInteger(markerId) && markerId >= 0 && markerId < MARKER_COUNT();
  const markerSrc = useMemo(() => (markerOk ? markerDataUrl(markerId) : ''), [markerId, markerOk]);
  const taken = markerOk ? GHOSTS_BY_ID[markerId] : null;

  const entryText = `  {
    id: ${markerId},
    name: ${JSON.stringify(p.name)},
    blurb: ${JSON.stringify(p.blurb)},
    file: '${slug}.obj',
    color: '${p.color}',
    glow: '${p.glow}',
    scale: ${built.scale},
    offset: [${built.offset.join(', ')}],
  },`;

  const flash = (text) => {
    setNote(text);
    setTimeout(() => setNote(''), 3500);
  };

  const designJson = () =>
    JSON.stringify({ app: 'ghost-scanner-builder', version: 1, markerId, builder: p }, null, 2);

  const downloadObj = () => download(new Blob([objText], { type: 'text/plain' }), `${slug}.obj`);

  const downloadMarker = async () => {
    if (!markerOk) return;
    download(await markerPngBlob(markerId), markerFileName({ id: markerId, file: `${slug}.obj` }));
  };

  const downloadZip = async () => {
    if (!markerOk) return;
    setBusy(true);
    try {
      const enc = new TextEncoder();
      const png = new Uint8Array(await (await markerPngBlob(markerId)).arrayBuffer());
      const entryFile = `// How to add this ghost to the site:
// 1. Put ${slug}.obj in public/ghosts/
// 2. Put ${markerFileName({ id: markerId, file: `${slug}.obj` })} in public/markers/
// 3. Paste this entry into the GHOSTS array in src/ghosts.js
//    (check the id is unused; the marker image must match the id)
${entryText}
`;
      const zip = makeZip([
        { name: `${slug}.obj`, data: enc.encode(objText) },
        { name: markerFileName({ id: markerId, file: `${slug}.obj` }), data: png },
        { name: 'ghosts-entry.txt', data: enc.encode(entryFile) },
        { name: `${slug}.ghost.json`, data: enc.encode(designJson()) },
      ]);
      download(new Blob([zip], { type: 'application/zip' }), `${slug}-ghost.zip`);
    } finally {
      setBusy(false);
    }
  };

  const copyEntry = async () => {
    try {
      await navigator.clipboard.writeText(entryText);
      flash('Copied the ghosts.js entry');
    } catch {
      flash('Could not copy. Use the zip instead.');
    }
  };

  const loadDesign = async (file) => {
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (data.app !== 'ghost-scanner-builder' || !data.builder) throw new Error('not a design file');
      setP({ ...DEFAULT_PARAMS, ...data.builder });
      if (Number.isInteger(data.markerId)) setMarkerId(data.markerId);
      flash('Loaded design');
    } catch {
      flash('That is not a ghost design file (.ghost.json)');
    }
  };

  const surprise = () => {
    const pal = pick(PALETTES);
    setP((s) => ({
      ...s,
      shape: pick(Object.keys(SHAPES)),
      height: rand(0.7, 1.7),
      width: rand(0.7, 1.4),
      facets: pick([8, 10, 12, 14]),
      scallops: pick([2, 3, 4, 5, 6]),
      hem: rand(0.03, 0.14),
      lean: rand(-0.3, 0.3),
      eyeCount: pick([1, 2, 2, 2, 3]),
      eyeStyle: pick(Object.keys(EYE_STYLES)),
      eyeSize: rand(0.7, 1.5),
      mouth: pick(Object.keys(MOUTH_STYLES)),
      cheeks: Math.random() < 0.4,
      arms: pick(Object.keys(ARM_STYLES)),
      hat: pick(Object.keys(HATS)),
      bowtie: Math.random() < 0.25,
      pumpkin: Math.random() < 0.15,
      color: pal.color,
      glow: pal.glow,
    }));
  };

  return (
    <div className="builder">
      <header className="builder-head">
        <div>
          <h1>Ghost builder</h1>
          <p>Design a ghost, then download it with a matching marker so it can be added to the haunting.</p>
        </div>
        <a className="link-small" href="#/">
          Back to scanner
        </a>
      </header>

      <div className="builder-body">
        <div className="builder-side">
          <div className="preview-wrap">
            <Preview objText={objText} color={p.color} glow={p.glow} />
            <p className="preview-hint">
              Drag to turn it · {built.triangles} triangles
              {built.triangles > 1500 ? ' (a lot for a phone, try fewer facets)' : ''}
            </p>
          </div>

          <section className="panel export">
            <h2>Marker &amp; export</h2>
            <div className="marker-row">
              {markerOk ? (
                <img className="marker-preview" src={markerSrc} alt={`Marker ${markerId}`} />
              ) : (
                <div className="marker-preview empty">?</div>
              )}
              <div className="marker-fields">
                <label className="ctl">
                  <span className="ctl-label">Marker number (0 to {MARKER_COUNT() - 1})</span>
                  <input
                    type="number"
                    min="0"
                    max={MARKER_COUNT() - 1}
                    value={Number.isNaN(markerId) ? '' : markerId}
                    onChange={(e) => setMarkerId(e.target.value === '' ? NaN : parseInt(e.target.value, 10))}
                  />
                </label>
                {!markerOk && <p className="warn">Pick a whole number from 0 to {MARKER_COUNT() - 1}.</p>}
                {taken && <p className="warn">#{markerId} already belongs to {taken.name}. Pick another number.</p>}
                {markerOk && !taken && <p className="hint">Scanning this marker will show your ghost.</p>}
              </div>
            </div>

            <div className="export-buttons">
              <button className="btn-scan small" onClick={downloadZip} disabled={!markerOk || busy}>
                {busy ? 'Packing…' : 'Download everything (.zip)'}
              </button>
              <button className="btn-ghost" onClick={downloadObj}>
                .obj only
              </button>
              <button className="btn-ghost" onClick={downloadMarker} disabled={!markerOk}>
                Marker PNG
              </button>
              <button className="btn-ghost" onClick={copyEntry} disabled={!markerOk}>
                Copy ghosts.js entry
              </button>
            </div>
            <p className="hint">
              The zip holds the model, the marker image, the <code>ghosts.js</code> entry and a design file you can load
              again later.
            </p>
            {note && (
              <p className="note" role="status">
                {note}
              </p>
            )}
          </section>
        </div>

        <div className="builder-controls">
          <section className="panel">
            <h2>Name</h2>
            <label className="ctl">
              <span className="ctl-label">Ghost name</span>
              <input type="text" maxLength={24} value={p.name} onChange={(e) => set('name')(e.target.value)} />
            </label>
            <label className="ctl">
              <span className="ctl-label">One-line story</span>
              <input type="text" maxLength={80} value={p.blurb} onChange={(e) => set('blurb')(e.target.value)} />
            </label>
            <div className="builder-row">
              <button className="btn-ghost" onClick={surprise}>
                Surprise me
              </button>
              <button className="btn-ghost" onClick={() => setP(DEFAULT_PARAMS)}>
                Reset
              </button>
              <button className="btn-ghost" onClick={() => fileRef.current?.click()}>
                Load design…
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  loadDesign(e.target.files?.[0]);
                  e.target.value = '';
                }}
              />
            </div>
          </section>

          <section className="panel">
            <h2>Body</h2>
            <Seg
              label="Shape"
              value={p.shape}
              options={Object.fromEntries(Object.entries(SHAPES).map(([k, v]) => [k, v.label]))}
              onChange={set('shape')}
            />
            <Slider label="Height" value={p.height} min={0.5} max={2} onChange={set('height')} />
            <Slider label="Width" value={p.width} min={0.5} max={1.6} onChange={set('width')} />
            <Slider label="Lean" value={p.lean} min={-0.5} max={0.5} onChange={set('lean')} />
            <Slider label="Tail points" value={p.scallops} min={2} max={8} step={1} onChange={set('scallops')} />
            <Slider label="Tail ragged-ness" value={p.hem} min={0} max={0.16} onChange={set('hem')} />
            <Slider label="Facets (lower = chunkier)" value={p.facets} min={6} max={16} step={1} onChange={set('facets')} />
          </section>

          <section className="panel">
            <h2>Face</h2>
            <Seg label="Eyes" value={p.eyeCount} options={{ 1: 'One', 2: 'Two', 3: 'Three' }} onChange={set('eyeCount')} />
            <Seg label="Eye style" value={p.eyeStyle} options={EYE_STYLES} onChange={set('eyeStyle')} />
            <Slider label="Eye size" value={p.eyeSize} min={0.5} max={1.8} onChange={set('eyeSize')} />
            <Slider label="Eye spacing" value={p.eyeGap} min={0.06} max={0.26} onChange={set('eyeGap')} />
            <Slider label="Eye height" value={p.eyeHeight} min={0.5} max={0.85} onChange={set('eyeHeight')} />
            <Seg label="Mouth" value={p.mouth} options={MOUTH_STYLES} onChange={set('mouth')} />
            <Slider label="Mouth height" value={p.mouthHeight} min={0.25} max={0.6} onChange={set('mouthHeight')} />
            <Toggle label="Rosy cheeks" checked={p.cheeks} onChange={set('cheeks')} />
          </section>

          <section className="panel">
            <h2>Extras</h2>
            <Seg label="Hat" value={p.hat} options={HATS} onChange={set('hat')} />
            <Seg label="Arms" value={p.pumpkin ? 'hold' : p.arms} options={p.pumpkin ? { hold: 'Holding pumpkin' } : ARM_STYLES} onChange={set('arms')} />
            <Toggle label="Bow tie" checked={p.bowtie} onChange={set('bowtie')} />
            <Toggle label="Holding a tiny pumpkin" checked={p.pumpkin} onChange={set('pumpkin')} />
            <p className="hint">Hat, bow tie and pumpkin colors are fixed so every ghost looks right in the scanner.</p>
          </section>

          <section className="panel">
            <h2>Colors</h2>
            <div className="swatches">
              {PALETTES.map((pal) => (
                <button
                  key={pal.name}
                  type="button"
                  className={`swatch ${p.color === pal.color && p.glow === pal.glow ? 'on' : ''}`}
                  style={{ background: `linear-gradient(135deg, ${pal.color} 50%, ${pal.glow} 50%)` }}
                  title={pal.name}
                  aria-label={pal.name}
                  onClick={() => setP((s) => ({ ...s, color: pal.color, glow: pal.glow }))}
                />
              ))}
            </div>
            <div className="builder-row">
              <label className="ctl color">
                <span className="ctl-label">Body</span>
                <input type="color" value={p.color} onChange={(e) => set('color')(e.target.value)} />
              </label>
              <label className="ctl color">
                <span className="ctl-label">Glow</span>
                <input type="color" value={p.glow} onChange={(e) => set('glow')(e.target.value)} />
              </label>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
