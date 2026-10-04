// Core: namespace, math, seeded noise, input (floating joystick + keyboard).
'use strict';
const S = window.S = {};

S.TILE = 40;          // world units per tile
S.MAP = 110;          // map size in tiles
S.WORLD = S.TILE * S.MAP;

// ---------- math ----------
S.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
S.lerp = (a, b, t) => a + (b - a) * t;
S.dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
S.dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

S.rng = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
S.hash2 = (x, y, s = 0) => {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
S.noise = (x, y, s) => {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = S.hash2(xi, yi, s), b = S.hash2(xi + 1, yi, s), c = S.hash2(xi, yi + 1, s), d = S.hash2(xi + 1, yi + 1, s);
  return S.lerp(S.lerp(a, b, u), S.lerp(c, d, u), v);
};
S.fbm = (x, y, s) => (S.noise(x, y, s) * .6 + S.noise(x * 2.1, y * 2.1, s + 7) * .3 + S.noise(x * 4.3, y * 4.3, s + 13) * .1);

// ---------- input ----------
S.input = { x: 0, y: 0, keys: {}, joy: null };
(() => {
  const inp = S.input;
  const MAXR = 56;
  const isUI = el => el && el.closest && el.closest('button, .ui-block');
  window.addEventListener('pointerdown', e => {
    if (isUI(e.target) || S.mode !== 'play') return;
    if (inp.joy) return;
    inp.joy = { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: e.clientX, y: e.clientY };
  });
  window.addEventListener('pointermove', e => {
    const j = inp.joy; if (!j || j.id !== e.pointerId) return;
    let dx = e.clientX - j.ox, dy = e.clientY - j.oy; const d = Math.hypot(dx, dy);
    if (d > MAXR) { // drag the base along so direction changes stay responsive
      j.ox += dx / d * (d - MAXR); j.oy += dy / d * (d - MAXR);
      dx = e.clientX - j.ox; dy = e.clientY - j.oy;
    }
    j.x = e.clientX; j.y = e.clientY;
  });
  const end = e => { if (inp.joy && inp.joy.id === e.pointerId) inp.joy = null; };
  window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
  window.addEventListener('keydown', e => { inp.keys[e.code] = true; if (e.code.startsWith('Arrow')) e.preventDefault(); });
  window.addEventListener('keyup', e => { inp.keys[e.code] = false; });
  window.addEventListener('blur', () => { inp.keys = {}; inp.joy = null; });
  document.addEventListener('contextmenu', e => e.preventDefault());

  S.readInput = () => {
    let x = 0, y = 0;
    const k = inp.keys;
    if (k.ArrowLeft || k.KeyA) x -= 1; if (k.ArrowRight || k.KeyD) x += 1;
    if (k.ArrowUp || k.KeyW) y -= 1; if (k.ArrowDown || k.KeyS) y += 1;
    if (inp.joy) {
      const dx = inp.joy.x - inp.joy.ox, dy = inp.joy.y - inp.joy.oy, d = Math.hypot(dx, dy);
      if (d > 6) { x = dx / MAXR; y = dy / MAXR; }
    }
    const m = Math.hypot(x, y); if (m > 1) { x /= m; y /= m; }
    inp.x = x; inp.y = y;
  };
  S.JOY_R = MAXR;
})();
