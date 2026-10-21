import aruco from 'js-aruco2';
import posit from 'js-aruco2/src/posit1.js';
const { AR } = aruco, { POS } = posit;

const W = 640, H = 480, f = 500, cx = W / 2, cy = H / 2;
const dict = new AR.Dictionary('ARUCO_MIP_36h12');
const ID = 7;
const code = dict.codeList[ID];

const rad = d => d * Math.PI / 180;
function rotXYZ(rx, ry, rz) {
  const cxr = Math.cos(rx), sxr = Math.sin(rx), cyr = Math.cos(ry), syr = Math.sin(ry), czr = Math.cos(rz), szr = Math.sin(rz);
  const Rx = [[1,0,0],[0,cxr,-sxr],[0,sxr,cxr]], Ry = [[cyr,0,syr],[0,1,0],[-syr,0,cyr]], Rz = [[czr,-szr,0],[szr,czr,0],[0,0,1]];
  const mul = (A,B)=>A.map((r,i)=>B[0].map((_,j)=>r.reduce((s,_,k)=>s+A[i][k]*B[k][j],0)));
  return mul(Rz, mul(Ry, Rx));
}
const mulV = (R, v) => R.map(r => r[0]*v[0]+r[1]*v[1]+r[2]*v[2]);
const T_ = R => R[0].map((_, j) => R.map(r => r[j]));

function render(R, T) {
  const data = new Uint8ClampedArray(W * H * 4);
  const Rt = T_(R);
  const RtT = mulV(Rt, T);
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const d = [(i - cx) / f, -(j - cy) / f, 1];
    const Rd = mulV(Rt, d);
    const s = RtT[2] / Rd[2];
    let val = 110;
    if (s > 0) {
      const p = [s * Rd[0] - RtT[0], s * Rd[1] - RtT[1]];
      const u = (p[0] + 0.5) * 8, v = (0.5 - p[1]) * 8;
      if (u >= -1 && u < 9 && v >= -1 && v < 9) {
        if (u < 0 || u >= 8 || v < 0 || v >= 8) val = 255;
        else {
          const c = Math.floor(u), r = Math.floor(v);
          if (c === 0 || c === 7 || r === 0 || r === 7) val = 0;
          else val = code[(r - 1) * 6 + (c - 1)] === '1' ? 255 : 0;
        }
      }
    }
    const k = (j * W + i) * 4; data[k] = data[k+1] = data[k+2] = val; data[k+3] = 255;
  }
  return data;
}

const R = rotXYZ(rad(-15), rad(25), rad(20)); const T = [0.3, -0.2, 4.5];
const data = render(R, T);
const det = new AR.Detector({ dictionaryName: 'ARUCO_MIP_36h12' });
const markers = det.detect({ width: W, height: H, data });
console.log('detected', markers.map(m => m.id), markers[0]?.corners);
const m = markers[0];
const corners = m.corners.map(c => ({ x: c.x - cx, y: cy - c.y }));
const ps = new POS.Posit(1, f);
const pose = ps.pose(corners);
console.log('truth R', JSON.stringify(R.map(r=>r.map(x=>+x.toFixed(3)))), 'T', T);
console.log('best R', JSON.stringify(pose.bestRotation.map(r=>r.map(x=>+x.toFixed(3)))), 'T', pose.bestTranslation.map(x=>+x.toFixed(3)), 'err', pose.bestError);
console.log('alt R', JSON.stringify(pose.alternativeRotation.map(r=>r.map(x=>+x.toFixed(3)))), 'T', pose.alternativeTranslation.map(x=>+x.toFixed(3)), 'err', pose.alternativeError);
// hypotheses: reproject model corners
const model = [[-.5,.5,0],[.5,.5,0],[.5,-.5,0],[-.5,-.5,0]];
for (const [name, Rr] of [['R', pose.bestRotation], ['R^T', T_(pose.bestRotation)]]) {
  let err = 0;
  model.forEach((p, i) => { const q = mulV(Rr, p).map((v, k) => v + pose.bestTranslation[k]); err += Math.hypot(f*q[0]/q[2]-corners[i].x, f*q[1]/q[2]-corners[i].y); });
  console.log(name, 'reproj err px', (err/4).toFixed(2));
}
