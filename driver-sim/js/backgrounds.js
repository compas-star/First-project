// Parallax background layers per biome, dithered sky, clouds and the time-of-day palette.
import { W, HORIZON } from './config.js';
import { makeCanvas, mulberry, rect, px, shade, hex, lerpC, clamp, bayer, css } from './gfx.js';

export const BG_W = 960;
const noise1 = (r, terms) => {
  const t = terms.map(([f, a]) => [f, a, r() * Math.PI * 2]);
  return x => t.reduce((s, [f, a, p]) => s + a * Math.sin((x / BG_W) * Math.PI * 2 * f + p), 0);
};

// A ridge line with slope lighting, dithered haze toward the base, and optional extras.
function ridge(seed, h, base, terms, col, opts = {}) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(BG_W, h);
  const n = noise1(r, terms);
  const tops = new Float32Array(BG_W);
  for (let xx = 0; xx < BG_W; xx++) {
    let top = base - n(xx);
    if (opts.mesa) { const v = n(xx); top = v > opts.mesa ? base - opts.top - (v - opts.mesa) * 0.6 : base - Math.max(0, v) * 0.4; }
    if (opts.peak) { const d = Math.abs(xx - opts.peak[0]); top = Math.min(top, opts.peak[1] + d * 0.45 + Math.sin(d * 0.7) * 1.5); }
    tops[xx] = clamp(top, 0, h - 1);
  }
  const lit = hex(shade(col, 0.22)), mid = hex(col), dark = hex(shade(col, -0.25)), haze = hex(opts.haze || shade(col, 0.12));
  const img = x.getImageData(0, 0, BG_W, h), d = img.data;
  for (let xx = 0; xx < BG_W; xx++) {
    const top = Math.round(tops[xx]);
    const slope = tops[(xx + 3) % BG_W] - tops[(xx + BG_W - 3) % BG_W];
    for (let yy = top; yy < h; yy++) {
      const depth = (yy - top) / Math.max(1, h - top);
      let c = mid;
      const lightAmt = clamp(-slope * 0.25 + 0.5, 0, 1) * (1 - depth * 1.5);
      if (lightAmt > bayer(xx, yy) + 0.25) c = lit;
      else if (slope > 1.5 && depth < 0.5 && bayer(xx, yy) < 0.6) c = dark;
      if (opts.strata && (yy + Math.round(tops[xx] * 0.3)) % 6 === 0) c = dark;
      if (depth > 0.55 && (depth - 0.55) * 2.2 > bayer(xx, yy)) c = haze;
      if (opts.snow && yy < opts.snow + (r() * 3 | 0) && yy - top < 8) c = [232, 238, 244];
      if (yy === top) c = lit;
      const i = (yy * BG_W + xx) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  if (opts.trees) for (let xx = 0; xx < BG_W; xx += 2 + (r() * 3 | 0)) {
    const th = 4 + (r() * 7 | 0), ty = Math.round(tops[xx]) + 2 + (r() * (h - tops[xx]) * 0.5 | 0);
    for (let k = 0; k < th; k++) {
      rect(x, xx - (k >> 1), ty - th + k, (k >> 1) + 1, 1, opts.trees);
      rect(x, xx + 1, ty - th + k, (k >> 1), 1, shade(opts.trees, -0.3));
    }
  }
  if (opts.dots) for (let i = 0; i < BG_W * 0.8; i++) {
    const xx = r() * BG_W | 0, yy = tops[xx] + 3 + r() * (h - tops[xx] - 3);
    rect(x, xx, yy, 2, 1, opts.dots); px(x, xx, yy - 1, shade(opts.dots, 0.2));
  }
  return c;
}

export const LAYERS = {};
let CLOUDS = [];
export function buildBackgrounds() {
  LAYERS.forest = [
    ridge(101, 90, 80, [[2, 8], [5, 4], [11, 2]], '#6a7f9e', { peak: [300, 8], snow: 26, haze: '#8a9ab4' }),
    ridge(111, 60, 46, [[3, 5], [7, 3], [17, 1.5]], '#3e5a52', { trees: '#2c4636' }),
    ridge(102, 40, 30, [[3, 3], [9, 2], [21, 1]], '#24432c', { trees: '#1d3a26' }),
  ];
  LAYERS.woodland = [
    ridge(103, 90, 76, [[2, 7], [6, 4], [13, 1.5]], '#7d8aa4', { haze: '#9aa4b8' }),
    ridge(113, 60, 48, [[3, 4], [8, 2], [19, 1]], '#6a7458', { dots: '#4a5a3a' }),
    ridge(104, 40, 32, [[3, 3], [8, 2], [19, 1]], '#56653a', { trees: '#3f5030' }),
  ];
  LAYERS.plains = [
    ridge(105, 90, 82, [[2, 10], [5, 7], [9, 4]], '#8f86a4', { mesa: 7, top: 20, haze: '#aaa2b8' }),
    ridge(115, 60, 52, [[2, 3], [6, 2], [13, 1]], '#a69a70', { mesa: 2, top: 8 }),
    ridge(106, 40, 34, [[2, 2], [5, 1.5], [12, 0.7]], '#b0a056', { dots: '#8a7e44' }),
  ];
  LAYERS.mesa = [
    ridge(107, 90, 80, [[3, 10], [6, 7], [11, 4]], '#946666', { mesa: 6, top: 36, haze: '#b08a88' }),
    ridge(117, 60, 52, [[3, 7], [7, 5], [15, 2]], '#a8664a', { mesa: 4, top: 22, strata: true }),
    ridge(108, 40, 34, [[3, 4], [7, 3], [15, 1.5]], '#a0583a', { dots: '#5a6a3a' }),
  ];
  LAYERS.desert = [
    ridge(109, 90, 80, [[3, 12], [7, 8], [16, 4], [29, 2]], '#86749a', { haze: '#a898b4' }),
    ridge(119, 60, 52, [[4, 5], [9, 4], [23, 2]], '#9a7a80', { haze: '#b49a98' }),
    ridge(110, 40, 34, [[2, 3], [6, 2], [14, 1]], '#c4a078', { dots: '#7a7a4a' }),
  ];
  // puffy pixel clouds
  const r = mulberry(77);
  CLOUDS = [];
  for (let i = 0; i < 9; i++) {
    const cw = 40 + (r() * 60 | 0), ch = 12 + (r() * 10 | 0);
    const [c, x] = makeCanvas(cw, ch);
    const puffs = Array.from({ length: 6 + (r() * 6 | 0) }, () => [6 + r() * (cw - 12), ch * 0.45 + r() * ch * 0.3, 4 + r() * ch * 0.45]);
    for (let yy = 0; yy < ch; yy++) for (let xx = 0; xx < cw; xx++) {
      let inside = false, top = 1;
      for (const [px0, py0, pr] of puffs) {
        const dd = Math.hypot(xx - px0, (yy - py0) * 1.4);
        if (dd < pr) { inside = true; top = Math.min(top, (yy - (py0 - pr / 1.4)) / (pr * 1.4)); }
      }
      if (!inside || yy > ch - 2) continue;
      const v = yy / ch;
      x.fillStyle = v < 0.35 + bayer(xx, yy) * 0.2 ? '#ffffff' : v < 0.65 + bayer(xx, yy) * 0.2 ? '#dfe4ee' : '#b4bccc';
      x.fillRect(xx, yy, 1, 1);
    }
    CLOUDS.push({ c, x: r() * BG_W, y: 6 + r() * 46, s: 0.3 + r() * 0.5 });
  }
}

// ---------- time of day ----------
// [clock hours, sky top, sky bottom, world tint rgb, tint alpha]
const KEYS = [
  [14.0, '#2e6cc8', '#a8d4ee', '#ffffff', 0],
  [16.2, '#3a6cba', '#f2deac', '#ffd090', 0.08],
  [17.0, '#33468e', '#ffa25a', '#ff9a50', 0.18],
  [17.45, '#24245e', '#e0605a', '#704070', 0.35],
  [17.9, '#10123a', '#4a2a5a', '#202050', 0.55],
  [18.4, '#04050e', '#141932', '#0a0c26', 0.7],
  [30, '#04050e', '#141932', '#0a0c26', 0.7],
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
    night, sunElev: (17.25 - h) / 2.2, h, key: Math.floor(clockSec / 60),
  };
}

// Cached dithered sky gradient + tinted cloud set, rebuilt once per game minute.
const [skyC, skyX] = makeCanvas(W, HORIZON + 14);
const [cloudC, cloudX] = makeCanvas(BG_W, 70);
let skyKey = -1;
function rebuildSky(sky) {
  const h = skyC.height;
  const midC = lerpC(sky.top, sky.bottom, 0.55);
  const img = skyX.createImageData(W, h), d = img.data;
  for (let yy = 0; yy < h; yy++) {
    const t = yy / (h - 1);
    const a = t < 0.6 ? sky.top : midC, b = t < 0.6 ? midC : sky.bottom;
    const f = t < 0.6 ? t / 0.6 : (t - 0.6) / 0.4;
    // quantize into bands, then dither between neighbouring bands
    const bands = 7, q = f * bands, lo = Math.floor(q), fr = q - lo;
    for (let xx = 0; xx < W; xx++) {
      const step = (fr > bayer(xx, yy) ? lo + 1 : lo) / bands;
      const i = (yy * W + xx) * 4;
      d[i] = a[0] + (b[0] - a[0]) * step; d[i + 1] = a[1] + (b[1] - a[1]) * step; d[i + 2] = a[2] + (b[2] - a[2]) * step; d[i + 3] = 255;
    }
  }
  skyX.putImageData(img, 0, 0);
  cloudX.clearRect(0, 0, BG_W, 70);
  for (const cl of CLOUDS) cloudX.drawImage(cl.c, Math.round(cl.x), Math.round(cl.y));
  // tint clouds toward the sky colours (pink and orange at sunset, dark at night)
  cloudX.globalCompositeOperation = 'source-atop';
  cloudX.fillStyle = css(lerpC(sky.bottom, sky.top, 0.3), 0.35 + sky.night * 0.45 + (sky.tintA > 0.1 ? 0.15 : 0));
  cloudX.fillRect(0, 0, BG_W, 70);
  cloudX.fillStyle = css(sky.bottom, 0.25);
  cloudX.fillRect(0, 0, BG_W, 70);
  cloudX.globalCompositeOperation = 'source-over';
}

const STARS = (() => { const r = mulberry(5); return Array.from({ length: 110 }, () => [r() * W | 0, r() * (HORIZON - 6) | 0, r()]); })();
export function drawSky(ctx, sky, sunX, t, bgOffset) {
  if (sky.key !== skyKey) { skyKey = sky.key; rebuildSky(sky); }
  ctx.drawImage(skyC, 0, 0);
  ctx.fillStyle = css(sky.bottom); ctx.fillRect(0, skyC.height, W, 270 - skyC.height);
  if (sky.night > 0) for (const [sx, sy, b] of STARS) {
    const tw = 0.6 + 0.4 * Math.sin(t * 2 + b * 30);
    ctx.fillStyle = `rgba(255,255,240,${sky.night * tw * (0.35 + b * 0.65)})`;
    ctx.fillRect(sx, sy, b > 0.93 ? 2 : 1, 1);
  }
  // sun, sinking ahead of us in the west
  const e = sky.sunElev;
  if (e > -0.15) {
    const sy = Math.round(HORIZON - e * 105);
    const r = Math.round(9 + clamp(1 - e, 0, 1) * 5);
    const col = lerpC([255, 246, 190], [255, 110, 50], clamp(1 - e * 1.4, 0, 1));
    for (const [rr, a] of [[r + 14, 0.08], [r + 8, 0.14], [r + 4, 0.22]]) {
      ctx.fillStyle = css(col, a);
      for (let y = -rr; y <= rr; y++) { const w = Math.round(Math.sqrt(Math.max(0, rr * rr - y * y))); ctx.fillRect(sunX - w, sy + y, w * 2 + 1, 1); }
    }
    ctx.fillStyle = css(col);
    for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y))); ctx.fillRect(sunX - w, sy + y, w * 2 + 1, 1); }
    ctx.fillStyle = css(lerpC(col, [255, 255, 255], 0.5));
    for (let y = -r + 2; y < -r / 3; y++) { const w = Math.round(Math.sqrt(Math.max(0, (r - 3) ** 2 - y * y))); ctx.fillRect(sunX - w, sy + y, w, 1); }
  }
  // clouds drift slowly and shift with the road's curves
  const off = (((bgOffset * 0.5 + t * 1.5) % BG_W) + BG_W) % BG_W;
  ctx.globalAlpha = 1 - sky.night * 0.5;
  ctx.drawImage(cloudC, -off, 0); ctx.drawImage(cloudC, BG_W - off, 0);
  ctx.globalAlpha = 1;
}
