// ArUco detection + pose estimation, independent of React and Three.js.
//
// js-aruco2 finds markers in an RGBA frame; POSIT turns the four corners of each
// marker into a rotation + translation. The result is returned as plain arrays
// already converted to a Three.js camera frame (x right, y up, looking down -z),
// in "marker edge" units (the marker is 1 x 1).

import { AR, POS } from './arucoLib.js';

export const MARKER_SIZE = 1;

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const normalize = (a) => scale(a, 1 / (Math.hypot(a[0], a[1], a[2]) || 1));

/**
 * Focal length in pixels for a frame of the given size, assuming a typical phone
 * camera field of view along the frame's long side.
 */
export function focalLengthPx(width, height, fovLongSideDeg = 64) {
  return Math.max(width, height) / 2 / Math.tan((fovLongSideDeg * Math.PI) / 360);
}

/** Vertical field of view (degrees) for a Three.js camera matching that focal length. */
export function verticalFovDeg(height, focalPx) {
  return (2 * Math.atan(height / 2 / focalPx) * 180) / Math.PI;
}

/**
 * Convert a POSIT pose (camera frame: x right, y up, z forward; Pc = R * Pm + T)
 * into an orthonormal basis + position in the Three.js camera frame (z toward viewer).
 * Only the marker's right/up axes are trusted; the normal is rebuilt from them.
 */
export function poseToBasis(R, T) {
  const flipZ = (v) => [v[0], v[1], -v[2]];
  const xAxis = normalize(flipZ([R[0][0], R[1][0], R[2][0]]));
  let yAxis = flipZ([R[0][1], R[1][1], R[2][1]]);
  yAxis = normalize(sub(yAxis, scale(xAxis, dot(yAxis, xAxis))));
  const zAxis = cross(xAxis, yAxis);
  return { position: flipZ(T), x: xAxis, y: yAxis, z: zAxis };
}

export function createMarkerTracker({ dictionaryName, width, height, fovLongSideDeg = 64 }) {
  const detector = new AR.Detector({ dictionaryName });
  const focalPx = focalLengthPx(width, height, fovLongSideDeg);
  const posit = new POS.Posit(MARKER_SIZE, focalPx);
  const cx = width / 2;
  const cy = height / 2;

  return {
    focalPx,
    verticalFov: verticalFovDeg(height, focalPx),
    /** @param {{width:number,height:number,data:Uint8ClampedArray}} image RGBA frame */
    detect(image) {
      const found = detector.detect(image);
      const results = [];
      for (const marker of found) {
        const corners = marker.corners.map((c) => ({ x: c.x - cx, y: cy - c.y }));
        let pose;
        try {
          pose = posit.pose(corners);
        } catch {
          continue;
        }
        if (!pose || !pose.bestRotation || !pose.bestTranslation) continue;
        const basis = poseToBasis(pose.bestRotation, pose.bestTranslation);
        // The marker must be in front of the camera.
        if (!(basis.position[2] < 0) || !Number.isFinite(basis.position[0])) continue;
        results.push({ id: marker.id, corners: marker.corners, ...basis });
      }
      return results;
    },
  };
}

/** SVG markup (white margin + black border + data cells) for printing a marker. */
export function markerSvg(dictionaryName, id) {
  return new AR.Dictionary(dictionaryName).generateSVG(id);
}

export function dictionarySize(dictionaryName) {
  return new AR.Dictionary(dictionaryName).codeList.length;
}
