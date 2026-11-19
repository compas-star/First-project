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
