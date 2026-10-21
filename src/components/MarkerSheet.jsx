import { useMemo } from 'react';
import { GHOSTS, MARKER_DICTIONARY } from '../ghosts.js';
import { markerSvg } from '../ar/markerPose.js';

// Printable sheet: one marker per ghost, generated from the same ArUco dictionary
// the scanner uses, so what you print is exactly what gets detected.
export default function MarkerSheet() {
  const markers = useMemo(
    () => GHOSTS.map((g) => ({ ghost: g, svg: markerSvg(MARKER_DICTIONARY, g.id) })),
    [],
  );

  return (
    <div className="sheet">
      <header className="sheet-head no-print">
        <div>
          <h1>Marker sheet</h1>
          <p>
            Dictionary <code>{MARKER_DICTIONARY}</code>. Print at a size you like (the markers scale in AR, so any
            size works), keep the white border, and hang them flat and upright. Matte paper avoids glare.
          </p>
        </div>
        <div className="sheet-actions">
          <button className="btn-scan small" onClick={() => window.print()}>
            Print
          </button>
          <a className="link-small" href="#/">
            Back to scanner
          </a>
        </div>
      </header>

      <div className="sheet-grid">
        {markers.map(({ ghost, svg }) => (
          <figure className="sheet-item" key={ghost.id}>
            <div className="sheet-marker" dangerouslySetInnerHTML={{ __html: svg }} />
            <figcaption>
              <strong>#{ghost.id}</strong> {ghost.name}
            </figcaption>
          </figure>
        ))}
      </div>
    </div>
  );
}
