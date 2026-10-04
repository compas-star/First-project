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
