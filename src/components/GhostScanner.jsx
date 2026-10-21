import { useCallback, useEffect, useRef, useState } from 'react';
import { GhostEngine } from '../ar/GhostEngine.js';
import { GHOSTS, markerFileName } from '../ghosts.js';

function cameraErrorMessage(err) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Camera access was blocked. Allow camera permission for this site and try again.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'No camera was found on this device.';
    case 'NotReadableError':
      return 'The camera is busy in another app. Close it and try again.';
    default:
      return err?.message || 'Something spooky happened while starting the camera.';
  }
}

export default function GhostScanner() {
  const containerRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const engineRef = useRef(null);
  const streamRef = useRef(null);
  const toastTimer = useRef(null);

  const [status, setStatus] = useState('idle'); // idle | starting | scanning | error
  const [error, setError] = useState('');
  const [stage, setStage] = useState({ w: 0, h: 0 }); // video box that covers the screen
  const [found, setFound] = useState([]); // ghost ids discovered this session
  const [visible, setVisible] = useState([]); // ghost ids currently in view
  const [toast, setToast] = useState(null);
  const [stats, setStats] = useState({ fps: 0, markers: [] });
  const [photo, setPhoto] = useState(null); // { url } of the last photo taken
  const [photoMsg, setPhotoMsg] = useState('');
  const [flash, setFlash] = useState(false);
  const [saving, setSaving] = useState(false);
  const msgTimer = useRef(null);

  const stopScanning = useCallback(() => {
    clearTimeout(toastTimer.current);
    engineRef.current?.stop();
    engineRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    clearTimeout(msgTimer.current);
    setVisible([]);
    setToast(null);
    setPhotoMsg('');
    setPhoto((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return null;
    });
    setStatus('idle');
  }, []);

  useEffect(() => stopScanning, [stopScanning]);

  // Size the video/canvas stage so it covers the whole screen (like object-fit: cover)
  // while keeping the exact video aspect ratio, which keeps the 3D overlay aligned.
  const layoutStage = useCallback(() => {
    const video = videoRef.current;
    const box = containerRef.current;
    if (!video || !box || !video.videoWidth) return;
    const scale = Math.max(box.clientWidth / video.videoWidth, box.clientHeight / video.videoHeight);
    setStage({ w: video.videoWidth * scale, h: video.videoHeight * scale });
  }, []);

  useEffect(() => {
    window.addEventListener('resize', layoutStage);
    return () => window.removeEventListener('resize', layoutStage);
  }, [layoutStage]);

  const startScanning = async () => {
    if (status === 'starting' || status === 'scanning') return;
    setError('');
    setStatus('starting');

    if (!navigator.mediaDevices?.getUserMedia) {
      setError('This browser cannot access the camera. On a phone, open the site over HTTPS.');
      setStatus('error');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      video.srcObject = stream;
      video.addEventListener('resize', layoutStage);
      await video.play();
      if (!video.videoWidth) {
        await new Promise((resolve) => video.addEventListener('loadedmetadata', resolve, { once: true }));
      }
      layoutStage();

      const engine = new GhostEngine({
        video,
        canvas: canvasRef.current,
        onFound: (ghost) => {
          setFound((prev) => (prev.includes(ghost.id) ? prev : [...prev, ghost.id]));
          setToast(ghost);
          clearTimeout(toastTimer.current);
          toastTimer.current = setTimeout(() => setToast(null), 3500);
        },
        onVisibleChange: setVisible,
        onStats: setStats,
      });
      engineRef.current = engine;
      engine.start();
      setStatus('scanning');
    } catch (err) {
      console.error(err);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setError(cameraErrorMessage(err));
      setStatus('error');
    }
  };

  const showMsg = (text) => {
    setPhotoMsg(text);
    clearTimeout(msgTimer.current);
    msgTimer.current = setTimeout(() => setPhotoMsg(''), 3000);
  };

  // Take a photo (camera + ghosts) and save it: share sheet on phones ("Save Image"),
  // a normal download everywhere else.
  const takePhoto = async () => {
    if (saving || !engineRef.current) return;
    setSaving(true);
    try {
      const box = containerRef.current;
      const blob = await engineRef.current.capturePhoto({ width: box.clientWidth, height: box.clientHeight });
      setFlash(true);
      setTimeout(() => setFlash(false), 250);

      const url = URL.createObjectURL(blob);
      setPhoto((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url };
      });

      const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
      const file = new File([blob], `ghost-scan-${stamp}.jpg`, { type: 'image/jpeg' });
      const isTouch = window.matchMedia?.('(pointer: coarse)').matches;

      if (isTouch && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: 'Ghost Scanner' });
          showMsg('Photo ready to save');
          return;
        } catch (err) {
          if (err?.name === 'AbortError') {
            showMsg('Tap the photo to save it');
            return;
          }
          // anything else: fall through to a plain download
        }
      }
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      showMsg('Photo saved');
    } catch (err) {
      console.error(err);
      showMsg(err?.message || 'Could not take the photo');
    } finally {
      setSaving(false);
    }
  };

  const scanning = status === 'scanning';

  return (
    <div className="scanner" ref={containerRef}>
      <div className="stage" style={{ width: stage.w, height: stage.h }}>
        <video ref={videoRef} className="stage-video" playsInline muted autoPlay />
        <canvas ref={canvasRef} className="stage-canvas" />
      </div>

      {scanning && (
        <>
          <header className="hud-top">
            <span className="hud-title">Ghost Scanner</span>
            <span className="hud-count">
              {found.length} / {GHOSTS.length} found
            </span>
            <button className="btn-ghost" onClick={stopScanning}>
              Stop
            </button>
          </header>

          {visible.length === 0 && (
            <div className="radar" aria-live="polite">
              <div className="radar-sweep" />
              <p>Scanning… point your camera at a marker</p>
            </div>
          )}

          {toast && (
            <div className="toast" style={{ '--glow': toast.glow }} role="status">
              <strong>{toast.name}</strong>
              <span>{toast.blurb}</span>
            </div>
          )}

          {flash && <div className="flash" aria-hidden="true" />}
          {photoMsg && (
            <div className="photo-msg" role="status">
              {photoMsg}
            </div>
          )}

          <footer className="hud-bottom">
            <div className="shutter-row">
              <button className="shutter" onClick={takePhoto} disabled={saving} aria-label="Take a photo">
                <span />
              </button>
              {photo && (
                <a className="photo-thumb" href={photo.url} target="_blank" rel="noreferrer" title="Open last photo">
                  <img src={photo.url} alt="Last photo" />
                </a>
              )}
            </div>
            <ul className="catalog">
              {GHOSTS.map((g) => {
                const isFound = found.includes(g.id);
                return (
                  <li
                    key={g.id}
                    className={isFound ? 'found' : ''}
                    style={{ '--glow': g.glow }}
                    title={isFound ? g.name : 'Not found yet'}
                  >
                    {isFound ? g.name : '???'}
                  </li>
                );
              })}
            </ul>
            <span className="debug">
              {stats.fps} fps · seeing {stats.markers.length ? stats.markers.map((id) => `#${id}`).join(' ') : 'nothing'}
            </span>
          </footer>
        </>
      )}

      {!scanning && (
        <main className="intro">
          <div className="intro-ghost" aria-hidden="true">
            <svg viewBox="0 0 100 120" width="120" height="144">
              <path
                d="M50 6C28 6 14 24 14 46v58l12-10 12 10 12-10 12 10 12-10 12 10V46C86 24 72 6 50 6Z"
                fill="#e9fbff"
              />
              <ellipse cx="38" cy="46" rx="6" ry="9" fill="#130d24" />
              <ellipse cx="62" cy="46" rx="6" ry="9" fill="#130d24" />
              <ellipse cx="50" cy="68" rx="6" ry="7" fill="#130d24" />
            </svg>
          </div>
          <h1>Ghost Scanner</h1>
          <p className="lede">
            Something is haunting the walls. Point your camera at the markers to see who is hiding there.
          </p>
          <button className="btn-scan" onClick={startScanning} disabled={status === 'starting'}>
            {status === 'starting' ? 'Opening camera…' : 'Scan for ghosts'}
          </button>
          {status === 'error' && <p className="error">{error}</p>}
          <a className="link-btn" href="#/builder">
            Build your own ghost
          </a>
          <section className="markers-box" aria-label="Test markers">
            <h2>Test markers</h2>
            <p>
              Open one on another screen (or your computer) and point your phone at it. Or{' '}
              <a href="#/markers">print the whole sheet</a>.
            </p>
            <ul className="marker-links">
              {GHOSTS.map((g) => {
                const href = `${import.meta.env.BASE_URL}markers/${markerFileName(g)}`;
                return (
                  <li key={g.id}>
                    <a href={href} target="_blank" rel="noreferrer" style={{ '--glow': g.glow }}>
                      <img src={href} alt={`Marker ${g.id}`} width="72" height="72" loading="lazy" />
                      <span>
                        #{g.id} {g.name}
                      </span>
                    </a>
                  </li>
                );
              })}
            </ul>
          </section>
        </main>
      )}
    </div>
  );
}
