// Small pixel-art helpers shared by all generated graphics.

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

// Deterministic RNG so the route looks the same every run.
export function mulberry(seed) {
  let a = seed | 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hex(h) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}
export function css(c, a) {
  if (a !== undefined) return `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
  return `rgb(${c[0] | 0},${c[1] | 0},${c[2] | 0})`;
}
export function lerp(a, b, t) { return a + (b - a) * t; }
export function lerpC(a, b, t) { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }
export function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
export function shade(h, f) {
  const c = hex(h);
  const t = f < 0 ? [0, 0, 0] : [255, 255, 255];
  const m = lerpC(c, t, Math.abs(f));
  return '#' + m.map(v => (v | 0).toString(16).padStart(2, '0')).join('');
}

export function rect(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
export function px(ctx, x, y, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, 1, 1); }

// Bresenham line drawn with square "pixels" for crisp retro lines.
export function line(ctx, x0, y0, x1, y1, c, t = 1) {
  ctx.fillStyle = c;
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  const o = Math.floor(t / 2);
  for (let n = 0; n < 2000; n++) {
    ctx.fillRect(x0 - o, y0 - o, t, t);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

// Filled ellipse, row by row (no anti-aliasing).
export function ellipse(ctx, cx, cy, rx, ry, c, noise, rnd) {
  ctx.fillStyle = c;
  for (let y = -ry; y <= ry; y++) {
    const w = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
    if (w <= 0) continue;
    if (noise && rnd) {
      for (let x = -w; x <= w; x++) if (rnd() > noise || Math.abs(x) < w - 1) ctx.fillRect(cx + x, cy + y, 1, 1);
    } else ctx.fillRect(cx - w, cy + y, w * 2 + 1, 1);
  }
}

export function circle(ctx, cx, cy, r, c) { ellipse(ctx, cx, cy, r, r, c); }

// Ring outline drawn with pixels.
export function ring(ctx, cx, cy, r, c) {
  ctx.fillStyle = c;
  for (let a = 0; a < 360; a += 2) {
    const rad = a * Math.PI / 180;
    ctx.fillRect(Math.round(cx + Math.cos(rad) * r), Math.round(cy + Math.sin(rad) * r), 1, 1);
  }
}

export function poly(ctx, pts, c) {
  ctx.fillStyle = c;
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  ctx.closePath();
  ctx.fill();
}

export const easeIn = (a, b, p) => a + (b - a) * Math.pow(p, 2);
export const easeInOut = (a, b, p) => a + (b - a) * ((-Math.cos(p * Math.PI) / 2) + 0.5);

export function timeStr(sec) {
  sec = Math.max(0, sec);
  const h = Math.floor(sec / 3600) % 24, m = Math.floor(sec / 60) % 60;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}
export function parseTime(s) { const [h, m] = s.split(':').map(Number); return h * 3600 + m * 60; }

// ---------- 16-bit style helpers ----------
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + 0.5) / 16);
export const bayer = (x, y) => BAYER[(y & 3) * 4 + (x & 3)];

// Vertical dithered gradient between colours (array of hex stops).
export function ditherV(ctx, x, y, w, h, stops) {
  const cols = stops.map(hex);
  const img = ctx.getImageData(x, y, w, h), d = img.data;
  for (let yy = 0; yy < h; yy++) {
    const t = (yy / Math.max(1, h - 1)) * (cols.length - 1);
    const k = Math.min(cols.length - 2, Math.floor(t)), f = t - k;
    for (let xx = 0; xx < w; xx++) {
      const c = f > bayer(x + xx, y + yy) ? cols[k + 1] : cols[k];
      const i = (yy * w + xx) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, x, y);
}

// Post-process a sprite: 2x upscale, outline, ambient-occlusion shading and texture noise.
export function refine(src, opts = {}) {
  const sc = opts.scale || 2;
  const w = src.width * sc, h = src.height * sc;
  const [c, x] = makeCanvas(w, h);
  x.drawImage(src, 0, 0, w, h);
  const img = x.getImageData(0, 0, w, h), d = img.data;
  const a = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = d[i * 4 + 3] > 0 ? 1 : 0;
  const r = mulberry(w * 31 + h);
  const out = new Uint8ClampedArray(d);
  for (let yy = 0; yy < h; yy++) for (let xx = 0; xx < w; xx++) {
    const i = yy * w + xx, p = i * 4;
    if (a[i]) {
      // edge pixels get darker (outline), lit from the upper left
      const edgeR = xx + 1 >= w || !a[i + 1], edgeB = yy + 1 >= h || !a[i + w];
      const edgeL = xx === 0 || !a[i - 1], edgeT = yy === 0 || !a[i - w];
      let f = 1;
      if (edgeR || edgeB) f *= opts.noOutline ? 0.85 : 0.55;
      else if (edgeL || edgeT) f *= 1.12;
      if (!opts.flat) f *= 1 - (yy / h) * 0.18;          // darker toward the ground
      if (!opts.smooth) f *= 1 + (r() - 0.5) * 0.12;      // grain
      if (!opts.smooth && ((xx + yy) & 1) && r() < 0.15) f *= 0.92;
      out[p] = d[p] * f; out[p + 1] = d[p + 1] * f; out[p + 2] = d[p + 2] * f;
    }
  }
  img.data.set(out);
  x.putImageData(img, 0, 0);
  return c;
}
