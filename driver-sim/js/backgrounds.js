// Parallax background layers per biome, dithered sky, clouds and the time-of-day palette.
import { W, HORIZON } from './config.js';
import { makeCanvas, mulberry, rect, px, shade, hex, lerpC, clamp, bayer, css, freeze } from './gfx.js';

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
  const gully = noise1(r, [[37, 1], [61, 0.7], [97, 0.5], [151, 0.3]]);
  for (let xx = 0; xx < BG_W; xx++) {
    const top = Math.round(tops[xx]);
    const slope = tops[(xx + 2) % BG_W] - tops[(xx + BG_W - 2) % BG_W];
    const g = gully(xx) / 2.5;
    for (let yy = top; yy < h; yy++) {
      const depth = (yy - top) / Math.max(1, h - top);
      // facet lighting: slopes facing the light are bright, gullies cut dark streaks down the face
      let v = 0.5 - slope * 0.16 + g * 0.45 * (1 - depth * 0.7);
      v += (bayer(xx, yy) - 0.5) * 0.18;
      let c = v > 0.68 ? lit : v > 0.36 ? mid : dark;
      if (opts.strata && (yy + Math.round(tops[xx] * 0.3)) % 6 === 0) c = dark;
      if (opts.snow && yy - top < 6 + g * 4 && yy < opts.snow + 6) c = v > 0.4 ? [240, 244, 250] : [196, 206, 222];
      if (yy === top) c = v > 0.3 ? lit : mid;
      // atmospheric haze toward the base, in three dithered steps
      const hz = Math.floor(Math.min(1, Math.pow(depth, 1.4) * 0.85 + (bayer(xx + 1, yy) - 0.5) * 0.22) * 3) / 3;
      const i = (yy * BG_W + xx) * 4;
      d[i] = c[0] + (haze[0] - c[0]) * Math.max(0, hz); d[i + 1] = c[1] + (haze[1] - c[1]) * Math.max(0, hz); d[i + 2] = c[2] + (haze[2] - c[2]) * Math.max(0, hz); d[i + 3] = 255;
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
  LAYERS.sonoran = [
    ridge(121, 90, 80, [[4, 10], [9, 7], [19, 4], [33, 2]], '#8a6e8a', { haze: '#b0a0b0' }),
    ridge(122, 60, 52, [[5, 6], [11, 4], [27, 2]], '#9a7068', { haze: '#b8a090' }),
    ridge(123, 40, 34, [[3, 3], [7, 2], [16, 1]], '#b89a70', { dots: '#5a7a3a' }),
  ];
  LAYERS.desert = [
    ridge(109, 90, 80, [[3, 12], [7, 8], [16, 4], [29, 2]], '#86749a', { haze: '#a898b4' }),
    ridge(119, 60, 52, [[4, 5], [9, 4], [23, 2]], '#9a7a80', { haze: '#b49a98' }),
    ridge(110, 40, 34, [[2, 3], [6, 2], [14, 1]], '#c4a078', { dots: '#7a7a4a' }),
  ];
  for (const k in LAYERS) LAYERS[k] = LAYERS[k].map(freeze);
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
  [0, '#04050e', '#141932', '#0a0c26', 0.7],
  [5.3, '#04050e', '#141932', '#0a0c26', 0.7],
  [6.0, '#2a2a5e', '#c8705a', '#604070', 0.38],
  [6.6, '#4a6aaa', '#f4b88a', '#ffb070', 0.15],
  [7.6, '#3672c8', '#b8d8ee', '#ffe8c0', 0.03],
  [9.0, '#2e6cc8', '#a8d4ee', '#ffffff', 0],
  [14.0, '#2e6cc8', '#a8d4ee', '#ffffff', 0],
  [16.2, '#3a6cba', '#f2deac', '#ffd090', 0.08],
  [17.0, '#33468e', '#ffa25a', '#ff9a50', 0.18],
  [17.45, '#24245e', '#e0605a', '#704070', 0.35],
  [17.9, '#10123a', '#4a2a5a', '#202050', 0.55],
  [18.4, '#04050e', '#141932', '#0a0c26', 0.7],
  [24, '#04050e', '#141932', '#0a0c26', 0.7],
];
const KEYS_RGB = KEYS.map(k => [k[0], hex(k[1]), hex(k[2]), hex(k[3]), k[4]]);

export function skyAt(clockSec) {
  const h = (clockSec % 86400) / 3600;
  let k = 0;
  while (k < KEYS_RGB.length - 2 && h > KEYS_RGB[k + 1][0]) k++;
  const A = KEYS_RGB[k], B = KEYS_RGB[k + 1];
  const t = clamp((h - A[0]) / (B[0] - A[0]), 0, 1);
  const night = h > 12 ? clamp((h - 17.6) / 0.8, 0, 1) : clamp((6.2 - h) / 0.8, 0, 1);
  // sun: rises in the east-southeast, sets in the west-southwest (November)
  const dayF = (h - 6.6) / (17.25 - 6.6);
  const sunEl = Math.sin(clamp(dayF, -0.1, 1.1) * Math.PI) * 0.6;
  const sunAz = (110 + clamp(dayF, -0.1, 1.1) * 140) * Math.PI / 180;
  return {
    top: lerpC(A[1], B[1], t), bottom: lerpC(A[2], B[2], t),
    tint: lerpC(A[3], B[3], t), tintA: A[4] + (B[4] - A[4]) * t,
    night, sunEl, sunAz, h, key: Math.floor(clockSec / 60),
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

// stars all the way round the sky, so they turn with you; denser along the Milky Way
const STARS = (() => {
  const r = mulberry(5), out = [];
  for (let i = 0; i < 300; i++) out.push([r() * BG_W | 0, r() * (HORIZON - 4) | 0, r()]);
  return out;
})();
// the Milky Way: a faint dithered band of dust and tiny stars arching across part of the sky
const MILKY = (() => {
  const [c, x] = makeCanvas(BG_W, HORIZON);
  const r = mulberry(11);
  for (let i = 0; i < 6000; i++) {
    const u = r();                       // along the band
    const bx = 140 + u * 680;
    const by = 6 + u * 62;
    const spread = 10 + Math.sin(u * Math.PI) * 9;
    const g = (r() + r() + r() - 1.5) * spread;
    const px = Math.round(bx + g * 0.6), py = Math.round(by + g);
    if (py < 0 || py >= HORIZON - 3) continue;
    const bright = r();
    x.fillStyle = bright > 0.985 ? 'rgba(255,255,245,0.9)' : bright > 0.9 ? 'rgba(220,215,255,0.35)' : 'rgba(170,165,210,0.13)';
    x.fillRect(px, py, 1, 1);
  }
  // the fixed stars go into the same picture; only the bright ones twinkle (drawn each frame)
  for (const [sx, sy, b] of STARS) if (b <= 0.9) { x.fillStyle = `rgba(255,255,240,${0.25 + b * 0.6})`; x.fillRect(sx, sy, 1, 1); }
  return c;
})();
const BRIGHT = STARS.filter(s => s[2] > 0.9);
// the moon: a small cratered disc, cached
const MOON = (() => {
  const [c, x] = makeCanvas(15, 15);
  for (let y = -7; y <= 7; y++) for (let xx = -7; xx <= 7; xx++) {
    const d = Math.hypot(xx, y);
    if (d > 6.6) continue;
    const shade = xx + y > 4 ? '#c8c6b6' : '#eceadc';
    x.fillStyle = shade; x.fillRect(xx + 7, y + 7, 1, 1);
  }
  for (const [cx, cy, cr] of [[5, 5, 1.6], [9, 8, 1.2], [6, 10, 0.9], [10, 4, 0.8]]) {
    x.fillStyle = 'rgba(150,148,130,0.6)';
    for (let y = -2; y <= 2; y++) for (let xx = -2; xx <= 2; xx++) if (Math.hypot(xx, y) <= cr) x.fillRect(cx + xx, cy + y, 1, 1);
  }
  return c;
})();
const MOON_GLOW = (() => {
  const [c, x] = makeCanvas(53, 53);
  for (const [rr, a] of [[26, 0.05], [16, 0.08], [10, 0.12]]) {
    x.fillStyle = `rgba(210,215,255,${a})`;
    for (let y = -rr; y <= rr; y++) { const w = Math.round(Math.sqrt(Math.max(0, rr * rr - y * y))); x.fillRect(26 - w, 26 + y, w * 2 + 1, 1); }
  }
  x.drawImage(MOON, 19, 19);
  return c;
})();
const MOON_AZ = 200 * Math.PI / 180, MOON_EL = 0.42;
export function drawSky(ctx, sky, hdg, t) {
  const bgOffset = hdg * (1920 / (2 * Math.PI));
  if (sky.key !== skyKey) { skyKey = sky.key; rebuildSky(sky); }
  ctx.drawImage(skyC, 0, 0);
  ctx.fillStyle = css(sky.bottom); ctx.fillRect(0, skyC.height, W, 270 - skyC.height);
  const clear = 1 - (sky.cloud || 0);
  const starA = sky.night * clear * clear;
  if (starA > 0.02) {
    const off = ((bgOffset * 0.8 % BG_W) + BG_W) % BG_W;
    ctx.globalAlpha = starA;
    ctx.drawImage(MILKY, -off, 0); ctx.drawImage(MILKY, BG_W - off, 0);
    ctx.globalAlpha = 1;
    for (const [sx0, sy, b] of BRIGHT) {
      let sx = sx0 - off; if (sx < 0) sx += BG_W;
      if (sx >= W) continue;
      const tw = 0.6 + 0.4 * Math.sin(t * 2 + b * 30);
      ctx.fillStyle = `rgba(255,255,240,${starA * tw * (0.3 + b * 0.7)})`;
      ctx.fillRect(sx, sy, b > 0.95 ? 2 : 1, 1);
    }
    // the moon, with a soft halo
    let mrel = MOON_AZ - hdg;
    while (mrel > Math.PI) mrel -= 2 * Math.PI; while (mrel < -Math.PI) mrel += 2 * Math.PI;
    if (Math.abs(mrel) < 1.1) {
      const mx = Math.round(W / 2 + Math.tan(mrel) * W / 2), my = Math.round(HORIZON - Math.tan(MOON_EL) * W / 2) + 30;
      const ma = sky.night * (1 - (sky.cloud || 0) * 0.85);
      ctx.globalAlpha = ma;
      ctx.drawImage(MOON_GLOW, mx - 26, my - 26);
      ctx.globalAlpha = 1;
    }
  }
  // sun: placed by its real compass direction relative to where we are heading
  let rel = sky.sunAz - hdg;
  while (rel > Math.PI) rel -= 2 * Math.PI; while (rel < -Math.PI) rel += 2 * Math.PI;
  const sunVis = sky.sunVis ?? 1;
  if (Math.abs(rel) < 1.2 && sky.sunEl > -0.1 && sunVis > 0.02) {
    ctx.globalAlpha = sunVis;
    const sunX = Math.round(W / 2 + Math.tan(rel) * W / 2);
    const sy = Math.round(HORIZON - Math.tan(sky.sunEl) * W / 2);
    const low = clamp(1 - sky.sunEl * 5, 0, 1);
    const r = Math.round(9 + low * 5);
    const col = lerpC([255, 246, 190], [255, 110, 50], low);
    for (const [rr, a] of [[r + 14, 0.08], [r + 8, 0.14], [r + 4, 0.22]]) {
      ctx.fillStyle = css(col, a);
      for (let y = -rr; y <= rr; y++) { const w = Math.round(Math.sqrt(Math.max(0, rr * rr - y * y))); ctx.fillRect(sunX - w, sy + y, w * 2 + 1, 1); }
    }
    ctx.fillStyle = css(col);
    for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(Math.max(0, r * r - y * y))); ctx.fillRect(sunX - w, sy + y, w * 2 + 1, 1); }
    ctx.fillStyle = css(lerpC(col, [255, 255, 255], 0.5));
    for (let y = -r + 2; y < -r / 3; y++) { const w = Math.round(Math.sqrt(Math.max(0, (r - 3) ** 2 - y * y))); ctx.fillRect(sunX - w, sy + y, w, 1); }
    ctx.globalAlpha = 1;
  }
  // clouds drift slowly and shift with the road's curves
  const off = (((bgOffset * 0.5 + t * 1.5) % BG_W) + BG_W) % BG_W;
  ctx.globalAlpha = 1 - sky.night * 0.5;
  ctx.drawImage(cloudC, -off, 0); ctx.drawImage(cloudC, BG_W - off, 0);
  // overcast: a second, lower deck of cloud and a grey lid over the top of the sky
  const cl = sky.cloud || 0;
  if (cl > 0.03) {
    const off2 = (((bgOffset * 0.7 + t * 3 + 700) % BG_W) + BG_W) % BG_W;
    ctx.globalAlpha = Math.min(1, cl * 1.2) * (1 - sky.night * 0.4);
    ctx.drawImage(cloudC, -off2, 22); ctx.drawImage(cloudC, BG_W - off2, 22);
    const off3 = (((bgOffset * 0.6 + t * 2 + 1300) % BG_W) + BG_W) % BG_W;
    ctx.drawImage(cloudC, -off3, 44); ctx.drawImage(cloudC, BG_W - off3, 44);
    ctx.globalAlpha = 1;
    const lid = ctx.createLinearGradient(0, 0, 0, HORIZON);
    const g = lerpC(sky.top, sky.bottom, 0.4);
    lid.addColorStop(0, css(g, cl * 0.75)); lid.addColorStop(1, css(sky.bottom, cl * 0.25));
    ctx.fillStyle = lid; ctx.fillRect(0, 0, W, HORIZON + 6);
  }
  ctx.globalAlpha = 1;
}
