// js-aruco2 is written as classic scripts that publish themselves with `this.AR = AR`,
// which bundlers can't see as exports. Load the sources as raw text and run them against
// one shared context object instead (same order a <script> tag list would use).
import cvSrc from 'js-aruco2/src/cv.js?raw';
import svdSrc from 'js-aruco2/src/svd.js?raw';
import arucoSrc from 'js-aruco2/src/aruco.js?raw';
import positSrc from 'js-aruco2/src/posit1.js?raw';

const ctx = {};
for (const src of [cvSrc, svdSrc, arucoSrc, positSrc]) {
  new Function(src).call(ctx);
}

export const AR = ctx.AR;
export const POS = ctx.POS;
