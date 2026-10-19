// The sculpted low-poly head (user's reference pictures). Built like a modeller would: for
// each height a rounded-box cross-section (half width, how far the front and the back
// reach), then the features pushed in and out of the front: brow ridge, eye sockets, a nose
// with a bridge, tip and wings, cheekbones, lips, a square chin, jaw corners under the
// ears. Pure math so tools/head.ts can draw it headless. Head-local metres, (0,0,0) at
// the ears; +z is the face, +x his left.

/** Height, half width, front reach, back reach, squareness of the section (2 = round). */
const PROFILE: [number, number, number, number, number][] = [
  [0.121, 0.012, 0.008, 0.014, 2.2],
  [0.116, 0.04, 0.034, 0.055, 2.4],
  [0.104, 0.058, 0.056, 0.08, 2.5],
  [0.085, 0.067, 0.072, 0.094, 2.6],
  [0.06, 0.072, 0.083, 0.102, 2.6],
  [0.035, 0.073, 0.09, 0.104, 2.6],
  [0.012, 0.073, 0.092, 0.103, 2.5],
  [-0.01, 0.072, 0.09, 0.098, 2.4],
  [-0.03, 0.069, 0.088, 0.088, 2.4],
  [-0.05, 0.064, 0.086, 0.068, 2.4],
  [-0.068, 0.059, 0.084, 0.045, 2.5],
  [-0.086, 0.053, 0.08, 0.024, 2.6],
  [-0.1, 0.042, 0.077, 0.012, 2.5],
  [-0.112, 0.029, 0.074, 0.0, 2.3],
  [-0.12, 0.018, 0.066, -0.006, 2.2],
  [-0.125, 0.008, 0.048, -0.01, 2],
];

function section(y: number): [number, number, number, number] {
  const P = PROFILE;
  if (y >= P[0][0]) return [P[0][1], P[0][2], P[0][3], P[0][4]];
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i];
    const b = P[i + 1];
    if (y <= a[0] && y >= b[0]) {
      const t = (a[0] - y) / (a[0] - b[0]);
      const s = t * t * (3 - 2 * t) * 0.5 + t * 0.5;
      return [a[1] + (b[1] - a[1]) * s, a[2] + (b[2] - a[2]) * s, a[3] + (b[3] - a[3]) * s, a[4] + (b[4] - a[4]) * s];
    }
  }
  const z = P[P.length - 1];
  return [z[1], z[2], z[3], z[4]];
}

const gs = (x: number, y: number, x0: number, y0: number, wx: number, wy: number) =>
  Math.exp(-(((x - x0) / wx) ** 2) - ((y - y0) / wy) ** 2);
const spow = (v: number, p: number) => Math.sign(v) * Math.abs(v) ** p;

/** Top of the head and bottom of the chin (for painting the face). */
export const HEAD_TOP = 0.121;
export const HEAD_BOTTOM = -0.125;

/**
 * A point on the head at angle `az` round from the face (deg, + toward his left) and
 * height `y`. `sg` widens the head for heavier men; `sockets` false skips the eye hollows.
 */
export function headPoint(az: number, y: number, sg = 1, sockets = true): [number, number, number] {
  const [w, zf, zb, n] = section(y);
  const A = (az * Math.PI) / 180;
  const s = Math.sin(A);
  const c = Math.cos(A);
  const e = 2 / n;
  let x = w * spow(s, e);
  let z = (c >= 0 ? zf : zb) * spow(c, e);
  const fr = Math.max(0, c) ** 1.5;
  // Features, by where they sit on the face (x across, y up), pushed out of the front.
  const fx = x;
  let d = 0;
  d += 0.007 * gs(fx, y, 0, 0.034, 0.045, 0.007); // brow ridge
  if (sockets) d -= 0.011 * (gs(fx, y, 0.031, 0.013, 0.016, 0.011) + gs(fx, y, -0.031, 0.013, 0.016, 0.011));
  d += (y < 0.026 && y > -0.044 ? 0.004 + 0.018 * Math.min(1, (0.026 - y) / 0.062) : 0) * gs(fx, y, 0, -0.01, 0.0085, 0.1); // bridge
  d += 0.012 * gs(fx, y, 0, -0.037, 0.011, 0.007); // tip
  d += 0.007 * (gs(fx, y, 0.012, -0.042, 0.008, 0.006) + gs(fx, y, -0.012, -0.042, 0.008, 0.006)); // wings
  d -= 0.004 * gs(fx, y, 0, -0.05, 0.016, 0.004); // under the nose
  d += 0.005 * gs(fx, y, 0, -0.06, 0.021, 0.006); // upper lip
  d -= 0.0035 * gs(fx, y, 0, -0.068, 0.022, 0.003); // the line of the mouth
  d += 0.003 * gs(fx, y, 0, -0.075, 0.018, 0.005); // lower lip
  d -= 0.002 * gs(fx, y, 0, -0.086, 0.02, 0.005); // under the lip
  d += 0.006 * gs(fx, y, 0, -0.106, 0.022, 0.01); // chin
  d += 0.005 * (gs(fx, y, 0.05, -0.012, 0.016, 0.014) + gs(fx, y, -0.05, -0.012, 0.016, 0.014)); // cheekbones
  d -= 0.004 * (gs(fx, y, 0.045, -0.055, 0.014, 0.018) + gs(fx, y, -0.045, -0.055, 0.014, 0.018)); // cheek hollows
  z += d * fr;
  // Cheekbones and jaw corners also stand out sideways.
  x += Math.sign(s) * (0.004 * gs(Math.abs(fx), y, 0.06, -0.012, 0.014, 0.016) + 0.005 * gs(Math.abs(az), y, 75, -0.092, 22, 0.012));
  return [x * sg, y, z * sg];
}

/** The head as an indexed grid: finer over the face, coarse round the back. */
export function headGrid(sg = 1): { verts: number[]; uvs: number[]; idx: number[] } {
  const azs: number[] = [];
  for (let a = -180; a < -48; a += 22) azs.push(a);
  for (let a = -48; a <= 48; a += 8) azs.push(a);
  for (let a = 70; a <= 180; a += 22) azs.push(a);
  if (azs[azs.length - 1] !== 180) azs.push(180);
  const ys = [HEAD_TOP, 0.116, 0.104, 0.088, 0.07, 0.054];
  for (let y = 0.044; y >= -0.118; y -= 0.009) ys.push(y);
  ys.push(HEAD_BOTTOM);
  const verts: number[] = [];
  const uvs: number[] = [];
  for (const y of ys) for (const az of azs) {
    verts.push(...headPoint(az, y, sg));
    uvs.push(0.25 + az / 360, (y - HEAD_BOTTOM) / (HEAD_TOP - HEAD_BOTTOM));
  }
  // Close the crown and the underside of the chin.
  const n = azs.length;
  const idx: number[] = [];
  for (let r = 0; r < ys.length - 1; r++) for (let c = 0; c < n - 1; c++) {
    const a = r * n + c;
    idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
  }
  const top = verts.length / 3;
  verts.push(0, HEAD_TOP + 0.002, 0);
  uvs.push(0.5, 1);
  const bot = verts.length / 3;
  verts.push(0, HEAD_BOTTOM - 0.002, 0.01 * sg);
  uvs.push(0.25, 0);
  const last = (ys.length - 1) * n;
  for (let c = 0; c < n - 1; c++) {
    idx.push(top, c, c + 1);
    idx.push(bot, last + c + 1, last + c);
  }
  return { verts, uvs, idx };
}

/** The surface point straight in front of (x, y) on the face, without the eye sockets. */
export function faceSpot(x: number, y: number, sg = 1): [number, number, number] {
  let lo = -60;
  let hi = 60;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (headPoint(mid, y, 1, false)[0] < x) lo = mid;
    else hi = mid;
  }
  return headPoint((lo + hi) / 2, y, sg, false);
}

/** Angle round from the face (deg) of a point x across the face at height y. */
export function faceAz(x: number, y: number): number {
  let lo = -90;
  let hi = 90;
  for (let i = 0; i < 20; i++) {
    const mid = (lo + hi) / 2;
    if (headPoint(mid, y, 1, false)[0] < x) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}
