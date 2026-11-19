// Parallax background layers per biome, plus sky / time-of-day palette.
import { makeCanvas, mulberry, rect, px, shade, hex, lerpC, clamp } from './gfx.js';

export const BG_W = 640;
const noise1 = (r, terms) => {
  const t = terms.map(([f, a]) => [f, a, r() * Math.PI * 2]);
  return x => t.reduce((s, [f, a, p]) => s + a * Math.sin((x / BG_W) * Math.PI * 2 * f + p), 0);
};

function ridge(seed, h, base, terms, col, opts = {}) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(BG_W, h);
  const n = noise1(r, terms);
  const hi = shade(col, 0.15), lo = shade(col, -0.2);
  for (let xx = 0; xx < BG_W; xx++) {
    let top = base - n(xx);
    if (opts.mesa) { const v = n(xx) ; top = v > opts.mesa ? base - opts.top : base - Math.max(0, v) * 0.35; }
    if (opts.peak) { const d = Math.abs(xx - opts.peak[0]); top = Math.min(top, opts.peak[1] + d * 0.42 + (d < 30 ? (r() * 1.5) : 0)); }
    if (opts.teeth && xx % 3 === 0) top -= (r() * opts.teeth) | 0;
    top = Math.round(clamp(top, 0, h - 1));
    rect(x, xx, top, 1, h - top, col);
    px(x, xx, top, hi);
    if (opts.snow && top < opts.snow) rect(x, xx, top, 1, Math.min(opts.snow - top, 4 + (r() * 3 | 0)), '#e8eef4');
    for (let yy = top + 2; yy < h; yy++) if (r() < 0.04) px(x, xx, yy, r() < 0.5 ? hi : lo);
    if (opts.strata) for (let yy = top + 3; yy < h; yy += 4) px(x, xx, yy, lo);
  }
  if (opts.trees) for (let xx = 0; xx < BG_W; xx += 2 + (r() * 3 | 0)) {
    const th = 3 + (r() * 5 | 0); const ty = h - 3 - (r() * 6 | 0);
    for (let k = 0; k < th; k++) rect(x, xx - (k >> 1), ty - th + k, (k >> 1) * 2 + 1, 1, opts.trees);
  }
  return c;
}

export const LAYERS = {};
export function buildBackgrounds() {
  LAYERS.forest = [
    ridge(101, 60, 50, [[2, 6], [5, 3], [11, 1.5]], '#5d7290', { peak: [200, 6], snow: 18 }),
    ridge(102, 34, 26, [[3, 3], [7, 2], [17, 1]], '#24432c', { teeth: 5, trees: '#1d3a26' }),
  ];
  LAYERS.woodland = [
    ridge(103, 60, 50, [[2, 5], [6, 3], [13, 1]], '#6f7f98'),
    ridge(104, 34, 28, [[3, 3], [8, 2], [19, 1]], '#4f6036', { trees: '#3f5030' }),
  ];
  LAYERS.plains = [
    ridge(105, 60, 54, [[2, 8], [5, 6], [9, 3]], '#8a7f9a', { mesa: 6, top: 14 }),
    ridge(106, 34, 30, [[2, 2], [5, 1.5], [12, 0.7]], '#a8964e'),
  ];
  LAYERS.mesa = [
    ridge(107, 60, 52, [[3, 8], [6, 6], [11, 3]], '#8e5a58', { mesa: 5, top: 26 }),
    ridge(108, 34, 30, [[3, 6], [7, 4], [15, 2]], '#a0583a', { mesa: 4, top: 18, strata: true }),
  ];
  LAYERS.desert = [
    ridge(109, 60, 52, [[3, 9], [7, 6], [16, 3], [29, 1.5]], '#7d6a8c'),
    ridge(110, 34, 30, [[2, 3], [6, 2], [14, 1]], '#c09a72'),
  ];
}

// ---------- time of day ----------
// [clock hours, sky top, sky bottom, world tint rgb, tint alpha]
const KEYS = [
  [14.0, '#3a7bd5', '#a8d4ee', '#ffffff', 0],
  [16.2, '#4677c4', '#f0dca8', '#ffd090', 0.08],
  [17.0, '#3b4f9a', '#ffa25a', '#ff9a50', 0.18],
  [17.45, '#2a2a6a', '#e0605a', '#704070', 0.35],
  [17.9, '#12143a', '#4a2a5a', '#202050', 0.55],
  [18.4, '#05060f', '#151a34', '#0a0c26', 0.7],
  [30, '#05060f', '#151a34', '#0a0c26', 0.7],
];
const KEYS_RGB = KEYS.map(k => [k[0], hex(k[1]), hex(k[2]), hex(k[3]), k[4]]);

export function skyAt(clockSec) {
  const h = clockSec / 3600;
  let k = 0;
  while (k < KEYS_RGB.length - 2 && h > KEYS_RGB[k + 1][0]) k++;
  const A = KEYS_RGB[k], B = KEYS_RGB[k + 1];
  const t = clamp((h - A[0]) / (B[0] - A[0]), 0, 1);
  const night = clamp((h - 17.6) / 0.8, 0, 1);
  return {
    top: lerpC(A[1], B[1], t), bottom: lerpC(A[2], B[2], t),
    tint: lerpC(A[3], B[3], t), tintA: A[4] + (B[4] - A[4]) * t,
    night, sunElev: (17.25 - h) / 2.2, h,
  };
}

const STARS = (() => { const r = mulberry(5); return Array.from({ length: 70 }, () => [r() * 320 | 0, r() * 58 | 0, r()]); })();
export function drawSky(ctx, sky, sunX, t) {
  const g = ctx.createLinearGradient(0, 0, 0, 70);
  g.addColorStop(0, `rgb(${sky.top.map(v => v | 0)})`);
  g.addColorStop(1, `rgb(${sky.bottom.map(v => v | 0)})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 320, 180);
  // banded dithering for that 90s look
  ctx.fillStyle = 'rgba(0,0,0,0.04)';
  for (let y = 0; y < 70; y += 4) ctx.fillRect(0, y, 320, 1);
  if (sky.night > 0) for (const [sx, sy, b] of STARS) {
    const tw = 0.6 + 0.4 * Math.sin(t * 2 + b * 30);
    ctx.fillStyle = `rgba(255,255,240,${sky.night * tw * (0.4 + b * 0.6)})`;
    ctx.fillRect(sx, sy, 1, 1);
  }
  // sun, sinking ahead of us in the west
  const e = sky.sunElev;
  if (e > -0.15) {
    const sy = Math.round(62 - e * 70);
    const r = Math.round(6 + clamp(1 - e, 0, 1) * 3);
    const col = lerpC([255, 244, 180], [255, 110, 50], clamp(1 - e * 1.4, 0, 1));
    ctx.fillStyle = `rgba(${col.map(v => v | 0)},0.25)`;
    for (let y = -r - 3; y <= r + 3; y++) { const w = Math.round(Math.sqrt(Math.max(0, (r + 3) ** 2 - y * y))); ctx.fillRect(sunX - w, sy + y, w * 2 + 1, 1); }
    ctx.fillStyle = `rgb(${col.map(v => v | 0)})`;
    for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y))); ctx.fillRect(sunX - w, sy + y, w * 2 + 1, 1); }
  }
}
