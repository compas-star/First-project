// Procedurally generated pixel-art sprites. Everything is drawn in code,
// so the game ships with no image files.
import { makeCanvas, mulberry, rect, px, line, ellipse, shade, poly, refine, hex, freeze } from './gfx.js';
import { drawText, textWidth } from './font.js';
import { carHi, houseHi, motelHi, dinerHi, storeHi, ponderosa, juniperTree } from './art.js';

export const SPR = {};
// h = height in metres, solid = bus bumps into it, glow = emissive layer for night,
// lights = relative points that get a bloom at night.
function upscale(src, sc) { const [c, x] = makeCanvas(src.width * sc, src.height * sc); x.drawImage(src, 0, 0, c.width, c.height); return c; }
function reg(key, img, h, opts = {}) {
  const sc = opts.scale || 2;
  const out = freeze(refine(img, opts));
  const glow = opts.glow ? freeze(sc === 1 ? opts.glow : upscale(opts.glow, sc)) : undefined;
  SPR[key] = { ...opts, img: out, glow, h, solid: !!opts.solid };
  return SPR[key];
}

// A canvas pair: main image + "glow" layer for things that light up at night.
function pair(w, h) {
  const [c, x] = makeCanvas(w, h);
  const [g, gx] = makeCanvas(w, h);
  return { c, x, g, gx, both(fn) { fn(x); fn(gx); } };
}

function blob(ctx, cx, cy, rx, ry, base, r, rough = 0.25) {
  const light = shade(base, 0.2), dark = shade(base, -0.3);
  for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) {
    const d = (x * x) / (rx * rx) + (y * y) / (ry * ry);
    if (d > 1 - r() * rough) continue;
    let c = base;
    const s = (x / rx) * 0.6 + (y / ry) * 0.8;
    if (s < -0.45) c = light; else if (s > 0.45) c = dark;
    if (r() < 0.12) c = r() < 0.5 ? light : dark;
    px(ctx, cx + x, cy + y, c);
  }
}

// ---------- vegetation ----------
function pine(seed, col, layers) {
  const r = mulberry(seed);
  const w = 29, h = 1 + (layers - 1) * 8 + 15 + 8, cx = 14;
  const [c, x] = makeCanvas(w, h);
  const light = shade(col, 0.18), dark = shade(col, -0.32);
  rect(x, cx - 1, h - 10, 3, 10, '#4b3322'); rect(x, cx + 1, h - 10, 1, 10, '#33231a');
  for (let L = 0; L < layers; L++) {
    const top = 1 + L * 8, lh = 15, halfMax = 3 + L * (10 / layers) * 1.25;
    for (let yy = 0; yy < lh; yy++) {
      const half = Math.round(halfMax * (yy / lh)) + 1;
      for (let xx = -half; xx <= half; xx++) {
        if (yy === lh - 1 && r() < 0.5) continue;
        if (Math.abs(xx) === half && r() < 0.35) continue;
        let cc = col; const rel = xx / half;
        if (rel < -0.45) cc = light; else if (rel > 0.3) cc = dark;
        if (r() < 0.12) cc = r() < 0.5 ? dark : light;
        px(x, cx + xx, top + yy, cc);
      }
    }
  }
  return c;
}

function juniper(seed, col = '#4f6b3a') {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(24, 20);
  rect(x, 11, 15, 2, 5, '#5a4030');
  blob(x, 12, 9, 11, 8, col, r, 0.35);
  return c;
}
function rock(seed, col, w = 18, h = 11) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(w, h);
  blob(x, w >> 1, h - (h >> 1), (w >> 1) - 1, (h >> 1), col, r, 0.15);
  rect(x, 1, h - 1, w - 2, 1, shade(col, -0.45));
  return c;
}
function tuft(seed, col = '#d8c46a') {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(13, 8);
  for (let i = 0; i < 9; i++) {
    const bx = 2 + Math.floor(r() * 9);
    line(x, bx, 7, bx + Math.round((r() - 0.5) * 4), 1 + Math.floor(r() * 3), r() < 0.5 ? col : shade(col, -0.25));
  }
  return c;
}
function bush(seed, col, w, h, rough) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(w, h);
  blob(x, w >> 1, h >> 1, (w >> 1) - 1, (h >> 1) - 1, col, r, rough);
  return c;
}
function joshua(seed) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(34, 46);
  const bark = '#6b5a45', dark = '#4a3d30';
  line(x, 17, 45, 17, 26, bark, 3);
  const ends = [];
  const branch = (x0, y0, x1, y1) => { line(x, x0, y0, x1, y1, bark, 2); ends.push([x1, y1]); };
  branch(17, 30, 9, 20); branch(17, 27, 25, 15);
  line(x, 9, 20, 6, 12, bark, 2); ends.push([6, 12]);
  line(x, 25, 15, 28, 9, bark, 2); ends.push([28, 9]);
  branch(17, 27, 18, 13);
  for (let i = 0; i < 18; i++) px(x, 16 + Math.floor(r() * 3), 26 + Math.floor(r() * 19), dark);
  for (const [ex, ey] of ends) for (let k = 0; k < 16; k++) {
    const a = r() * Math.PI * 2, l = 2 + r() * 4;
    line(x, ex, ey, ex + Math.cos(a) * l, ey + Math.sin(a) * l * 0.8, r() < 0.5 ? '#5d7a3a' : '#7f9c4c');
  }
  return c;
}
function saguaro() {
  const [c, x] = makeCanvas(20, 46);
  const g = '#3f7a3a', d = '#2c5a2a', l = '#5f9a4a';
  rect(x, 7, 3, 7, 43, g); rect(x, 8, 2, 5, 1, g); rect(x, 7, 3, 1, 43, l);
  rect(x, 10, 4, 1, 42, d); rect(x, 13, 4, 1, 42, d);
  rect(x, 2, 22, 6, 4, g); rect(x, 2, 10, 4, 14, g); rect(x, 2, 10, 1, 14, l); rect(x, 3, 9, 2, 1, g);
  rect(x, 13, 17, 5, 4, g); rect(x, 15, 6, 4, 13, g); rect(x, 18, 6, 1, 13, d); rect(x, 16, 5, 2, 1, g);
  return c;
}
function barrel() {
  const [c, x] = makeCanvas(10, 10);
  const r = mulberry(7);
  blob(x, 5, 6, 4, 4, '#4f8a3a', r, 0.05);
  px(x, 4, 2, '#e85a3a'); px(x, 5, 2, '#f8c84a'); px(x, 6, 2, '#e85a3a');
  return c;
}


// ---------- hi-res vegetation (drawn at native detail) ----------
function cyl(x, x0, y0, w, h, base, rnd) {
  // vertical cylinder lit from the upper left, with a rounded top
  const c = [shade(base, 0.35), shade(base, 0.15), base, shade(base, -0.2), shade(base, -0.42)];
  for (let yy = 0; yy < h; yy++) {
    const top = yy < w / 2 ? Math.round(w / 2 - Math.sqrt(Math.max(0, (w / 2) ** 2 - (w / 2 - yy) ** 2))) : 0;
    for (let xx = top; xx < w - top; xx++) {
      const f = xx / (w - 1);
      let k = f < 0.18 ? 1 : f < 0.32 ? 0 : f < 0.6 ? 2 : f < 0.82 ? 3 : 4;
      if (xx % 3 === 2 && k < 4) k++; // ribs
      px(x, x0 + xx, y0 + yy, c[k]);
      if (xx % 3 === 1 && rnd() < 0.08) px(x, x0 + xx, y0 + yy, '#e8e0b0'); // spines
    }
  }
}
function saguaroHi(seed) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(44, 100);
  const g = ['#3f7a3a', '#467f3c', '#3a6e38'][seed % 3];
  const lh = 30 + Math.floor(r() * 18), rh = 22 + Math.floor(r() * 18);
  // left arm
  cyl(x, 4, lh - 22, 9, 30, g, r); cyl(x, 4, lh + 2, 14, 8, g, r);
  // right arm
  cyl(x, 31, rh - 24, 9, 32, g, r); cyl(x, 24, rh + 2, 14, 8, g, r);
  cyl(x, 15, 4, 14, 96, g, r);
  px(x, 21, 4, '#f4e070'); px(x, 22, 4, '#f4e070');
  return c;
}
function pineHi(seed, col, hgt) {
  const r = mulberry(seed);
  const w = 64, h = hgt, cx = 32;
  const [c, x] = makeCanvas(w, h);
  const bark = '#5a3a26';
  rect(x, cx - 3, h - 26, 6, 26, bark); rect(x, cx - 3, h - 26, 2, 26, '#7a5236'); rect(x, cx + 2, h - 26, 1, 26, '#3a2418');
  for (let yy = h - 26; yy < h; yy += 3) px(x, cx - 1 + (yy % 2), yy, '#3a2418');
  const dark = shade(col, -0.45), mid = col, light = shade(col, 0.22), hi = shade(col, 0.4);
  const top = 3, bottom = h - 18;
  // dark silhouette
  for (let yy = top; yy < bottom; yy++) {
    const f = (yy - top) / (bottom - top);
    const hw = Math.round(2 + f * 27 + Math.sin(yy * 0.9) * 2);
    rect(x, cx - hw, yy, hw * 2, 1, dark);
  }
  // branch clumps
  for (let i = 0; i < 140; i++) {
    const yy = top + 2 + r() * (bottom - top - 4);
    const f = (yy - top) / (bottom - top);
    const hw = 2 + f * 26;
    const xx = cx + (r() * 2 - 1) * hw * 0.95;
    const rx = 3 + Math.floor(r() * 4), ry = 2 + Math.floor(r() * 2);
    for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
      if ((dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) > 1 - r() * 0.3) continue;
      const sidel = (xx - cx) / hw;
      let cc = dy < 0 ? (sidel < 0 ? light : mid) : (dy > ry / 2 ? dark : mid);
      if (dy === -ry && sidel < 0.2) cc = hi;
      if (sidel > 0.55 && dy >= 0) cc = dark;
      px(x, xx + dx, yy + dy, cc);
    }
  }
  return c;
}
function joshuaHi(seed) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(70, 96);
  const bark = '#6e5c48', shag = '#4e4234', shag2 = '#8a7660';
  const ends = [];
  const limb = (x0, y0, x1, y1, t) => {
    line(x, x0, y0, x1, y1, bark, t);
    for (let i = 0; i < 12; i++) { const k = r(); px(x, x0 + (x1 - x0) * k + (r() - 0.5) * t, y0 + (y1 - y0) * k, r() < 0.5 ? shag : shag2); }
  };
  limb(35, 95, 35, 52, 6); ends.push();
  const fork = (x0, y0, depth, dir) => {
    const len = 10 + r() * 10, ang = -Math.PI / 2 + dir * (0.4 + r() * 0.5);
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    limb(x0, y0, x1, y1, Math.max(2, 5 - depth));
    if (depth < 2 && r() < 0.85) { fork(x1, y1, depth + 1, -0.7); fork(x1, y1, depth + 1, 0.8); }
    else ends.push([x1, y1]);
  };
  fork(35, 54, 0, -1); fork(35, 54, 0, 1); fork(35, 58, 1, 0.1);
  // shaggy dead-leaf skirt on the trunk
  for (let yy = 56; yy < 80; yy++) for (let i = 0; i < 3; i++) px(x, 31 + r() * 9, yy, r() < 0.6 ? shag : shag2);
  for (const [ex, ey] of ends) for (let k = 0; k < 40; k++) {
    const a = r() * Math.PI * 2, l = 3 + r() * 7;
    const col = Math.sin(a) < -0.2 ? '#93b25a' : Math.cos(a) > 0.3 ? '#4a6630' : '#6a8a42';
    line(x, ex, ey, ex + Math.cos(a) * l, ey + Math.sin(a) * l * 0.9, col);
  }
  return c;
}
function shrub(seed, base, w, h, sparse) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(w, h);
  for (let i = 0; i < 6; i++) line(x, w / 2, h - 1, w / 2 + (r() - 0.5) * w * 0.8, h * (0.2 + r() * 0.4), '#5a4a38');
  const n = Math.floor(w * h * (sparse ? 0.25 : 0.5));
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI, rad = Math.sqrt(r());
    const xx = w / 2 + Math.cos(a) * rad * (w / 2 - 1), yy = h - 1 - Math.sin(a) * rad * (h - 2);
    const up = (h - yy) / h, left = xx < w / 2;
    px(x, xx, yy, up > 0.6 && left ? shade(base, 0.3) : up < 0.3 ? shade(base, -0.35) : r() < 0.3 ? shade(base, -0.15) : base);
  }
  return c;
}
function pebbles(seed, base) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(24, 8);
  for (let i = 0; i < 9; i++) {
    const xx = 2 + r() * 20, yy = 3 + r() * 4, s = 1 + Math.floor(r() * 2);
    rect(x, xx, yy, s + 1, s, shade(base, (r() - 0.5) * 0.4)); px(x, xx, yy, shade(base, 0.35));
    rect(x, xx, yy + s, s + 1, 1, shade(base, -0.5));
  }
  return c;
}

// ---------- roadside furniture ----------
function pole() {
  const [c, x] = makeCanvas(15, 72);
  rect(x, 7, 0, 2, 72, '#5a4030'); rect(x, 8, 0, 1, 72, '#3e2c20');
  rect(x, 0, 6, 15, 2, '#5a4030');
  for (const ix of [1, 5, 9, 13]) rect(x, ix, 4, 1, 2, '#cfd8dc');
  return c;
}
function fencePost() { const [c, x] = makeCanvas(3, 12); rect(x, 0, 0, 3, 12, '#7a6248'); rect(x, 2, 0, 1, 12, '#5a4632'); return c; }
function mileMarker() {
  const [c, x] = makeCanvas(5, 14);
  rect(x, 2, 5, 1, 9, '#888'); rect(x, 0, 0, 5, 6, '#2a7a3a'); rect(x, 1, 2, 3, 1, '#fff');
  return c;
}
function shield66() {
  const [c, x] = makeCanvas(17, 28);
  rect(x, 8, 15, 1, 13, '#8a8a8a');
  rect(x, 1, 1, 15, 15, '#111'); rect(x, 2, 2, 13, 13, '#f4f4ee');
  px(x, 1, 1, 'rgba(0,0,0,0)'); x.clearRect(1, 1, 1, 1); x.clearRect(15, 1, 1, 1);
  rect(x, 2, 2, 13, 4, '#111');
  drawText(x, 'US', 5, 1, '#f4f4ee');
  drawText(x, '66', 5, 8, '#111');
  return c;
}
function speedSign(n) {
  const [c, x] = makeCanvas(13, 26);
  rect(x, 6, 14, 1, 12, '#8a8a8a');
  rect(x, 0, 0, 13, 15, '#111'); rect(x, 1, 1, 11, 13, '#f4f4ee');
  drawText(x, 'MPH', 6, 2, '#111', 1, 'center');
  drawText(x, String(n), 6, 8, '#111', 1, 'center');
  return c;
}
function yieldSign() {
  const [c, x] = makeCanvas(15, 26);
  rect(x, 7, 12, 1, 14, '#8a8a8a');
  poly(x, [0, 0, 15, 0, 7.5, 13], '#c0202a');
  poly(x, [3.5, 2, 11.5, 2, 7.5, 9], '#f4f4ee');
  return c;
}
function stopSign() {
  const [c, x] = makeCanvas(15, 28);
  rect(x, 7, 14, 1, 14, '#8a8a8a');
  poly(x, [4, 0, 11, 0, 15, 4, 15, 11, 11, 15, 4, 15, 0, 11, 0, 4], '#c0202a');
  drawText(x, 'STOP', 8, 5, '#f4f4ee', 1, 'center');
  return c;
}
function diamond(text, col = '#e8c020') {
  const [c, x] = makeCanvas(17, 28);
  rect(x, 8, 15, 1, 13, '#8a8a8a');
  poly(x, [8.5, 0, 17, 8.5, 8.5, 17, 0, 8.5], '#222');
  poly(x, [8.5, 1.5, 15.5, 8.5, 8.5, 15.5, 1.5, 8.5], col);
  text.forEach((t, i) => drawText(x, t, 9, 4 + i * 6 - (text.length - 1) * 2, '#111', 1, 'center'));
  return c;
}
function roundSign() {
  const [c, x] = makeCanvas(17, 28);
  rect(x, 8, 15, 1, 13, '#8a8a8a');
  poly(x, [8.5, 0, 17, 8.5, 8.5, 17, 0, 8.5], '#222');
  poly(x, [8.5, 1.5, 15.5, 8.5, 8.5, 15.5, 1.5, 8.5], '#e8c020');
  for (let a = 0; a < 3; a++) {
    const t = a * 2.1;
    for (let k = 0; k < 6; k++) { const u = t + k * 0.22; px(x, 8 + Math.round(Math.cos(u) * 4), 8 + Math.round(Math.sin(u) * 4), '#111'); }
    px(x, 8 + Math.round(Math.cos(t + 1.3) * 4), 8 + Math.round(Math.sin(t + 1.3) * 4) - 1, '#111');
  }
  return c;
}
function mailbox(seed) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(8, 14);
  rect(x, 3, 5, 2, 9, '#5a4030');
  const col = ['#2a2a2a', '#c0c0c0', '#2f5a9a', '#a83232'][Math.floor(r() * 4)];
  rect(x, 0, 1, 8, 5, col); rect(x, 1, 0, 6, 1, col); rect(x, 7, 1, 1, 3, shade(col, -0.3));
  rect(x, 6, 0, 1, 3, '#d02a2a');
  return c;
}
function welcome(name) {
  const tw = Math.max(textWidth('WELCOME TO'), textWidth(name));
  const w = tw + 8, h = 26;
  const [c, x] = makeCanvas(w, h);
  rect(x, 3, 14, 2, 12, '#4a3020'); rect(x, w - 5, 14, 2, 12, '#4a3020');
  rect(x, 0, 0, w, 16, '#3a2414'); rect(x, 1, 1, w - 2, 14, '#7a4e2e');
  for (let yy = 3; yy < 15; yy += 4) rect(x, 1, yy, w - 2, 1, '#6a4226');
  drawText(x, 'WELCOME TO', w / 2, 2, '#f2e2b8', 1, 'center');
  drawText(x, name, w / 2, 9, '#ffd36a', 1, 'center');
  return c;
}
const ADS = [
  ['#f2e6c8', ['MOTEL 66', '#c0302a'], ['COLOR TV - POOL', '#2a4a8a'], ['VACANCY', '#2a8a3a']],
  ['#2a5a8a', ["ROSIE'S DINER", '#ffe08a'], ['PIE 99C', '#ffffff'], ['JUST AHEAD', '#ffe08a']],
  ['#c0302a', ['DRINK', '#ffffff'], ['FIZZ COLA', '#ffe08a'], ['ICE COLD', '#ffffff']],
  ['#f5d24a', ['SEE THE', '#3a2a1a'], ['GIANT', '#c0302a'], ['JACKALOPE!', '#3a2a1a']],
  ['#ffffff', ['TRADING POST', '#8a3a1a'], ['TURQUOISE', '#2a9a9a'], ['MOCCASINS', '#8a3a1a']],
  ['#3a3a3a', ['RATTLESNAKE', '#e8c84a'], ['RANCH', '#e8c84a'], ['14 MILES', '#ffffff']],
  ['#7ac0d8', ['PHOTO SHACK', '#1a2a4a'], ['FILM IN', '#1a2a4a'], ['1 HOUR!', '#c0302a']],
  ['#2a6a3a', ['BUCKLE UP', '#ffffff'], ['ARIZONA', '#ffffff'], ['LOVES YOU', '#ffe08a']],
  ['#1a1a2a', ['BOWLING', '#ff5ad0'], ['ARCADE', '#5ad0ff'], ['OPEN LATE', '#ffe08a']],
  ['#f0f0e8', ['CALL GARY', '#c0302a'], ['INJURY LAW', '#1a1a2a'], ['555-0199', '#1a1a2a']],
  ['#e87a2a', ['CACTUS JACK', '#ffffff'], ['FIREWORKS', '#ffe08a'], ['& JERKY', '#ffffff']],
  ['#5a3a7a', ['ROUTE 66', '#ffe08a'], ['GET YOUR', '#ffffff'], ['KICKS!', '#ffe08a']],
];
function billboard(ad) {
  const [c, x] = makeCanvas(64, 42);
  rect(x, 10, 26, 3, 16, '#5a4030'); rect(x, 50, 26, 3, 16, '#5a4030'); rect(x, 8, 32, 48, 2, '#5a4030');
  rect(x, 0, 0, 64, 27, '#2a2a2a'); rect(x, 1, 1, 62, 25, ad[0]);
  for (let i = 1; i < 4; i++) drawText(x, ad[i][0], 32, 3 + (i - 1) * 7.5, ad[i][1], 1, 'center');
  return c;
}

// ---------- buildings ----------
function motel(seed) {
  const r = mulberry(seed);
  const p = pair(98, 46);
  const wall = ['#e8d8b8', '#f0c8b0', '#d8e8d8'][Math.floor(r() * 3)];
  const door = ['#3a8a9a', '#c05a3a', '#5a7a3a'][Math.floor(r() * 3)];
  const { x, gx } = p;
  rect(x, 0, 24, 80, 22, wall); rect(x, 0, 22, 80, 3, '#c86a4a'); rect(x, 0, 44, 80, 2, shade(wall, -0.35));
  for (let i = 0; i < 8; i++) {
    const dx = 2 + i * 10;
    rect(x, dx, 30, 4, 14, door); rect(x, dx + 6, 30, 3, 5, '#9ac8d8');
    if (r() < 0.6) rect(gx, dx + 6, 30, 3, 5, '#ffd27a');
  }
  rect(x, 86, 32, 3, 14, '#555');
  rect(x, 79, 0, 17, 33, '#1a3a5a'); rect(x, 80, 1, 15, 31, '#2a5a7a');
  'MOTEL'.split('').forEach((ch, i) => p.both(ctx => drawText(ctx, ch, 87.5, 2 + i * 6, '#ff5a5a', 1, 'center')));
  return reg('motel' + seed, p.c, 11, { glow: p.g, solid: true });
}
function diner(seed) {
  const p = pair(64, 36);
  const { x, gx } = p;
  rect(x, 0, 13, 64, 23, '#d8d8d8'); rect(x, 0, 13, 64, 1, '#f4f4f4');
  rect(x, 0, 22, 64, 2, '#c0302a'); rect(x, 0, 33, 64, 3, '#8a8a8a');
  rect(x, 3, 15, 58, 6, '#7ab0c8'); rect(gx, 3, 15, 58, 6, '#ffe2a0');
  for (let i = 0; i < 6; i++) rect(x, 3 + i * 10, 15, 1, 6, '#e8e8e8');
  rect(x, 28, 24, 8, 9, '#6a4a3a');
  rect(x, 16, 2, 32, 10, '#1a1a1a'); rect(x, 18, 11, 2, 2, '#555'); rect(x, 44, 11, 2, 2, '#555');
  p.both(ctx => drawText(ctx, 'DINER', 32, 4, '#5ad0ff', 1, 'center'));
  return reg('diner' + seed, p.c, 9, { glow: p.g, solid: true });
}
function house(seed) {
  const r = mulberry(seed);
  const p = pair(42, 32);
  const { x, gx } = p;
  const wall = ['#c8b090', '#a8c0c8', '#e0d0a0', '#b89a80', '#d8c8c0'][Math.floor(r() * 5)];
  const roof = ['#6a4a3a', '#4a4a52', '#8a5a3a'][Math.floor(r() * 3)];
  rect(x, 3, 13, 36, 19, wall); rect(x, 3, 31, 36, 1, shade(wall, -0.4));
  for (let yy = 0; yy < 12; yy++) { const hw = Math.round((yy / 11) * 20); rect(x, 21 - hw, 2 + yy, hw * 2, 1, yy === 11 ? shade(roof, -0.3) : roof); }
  rect(x, 18, 21, 6, 10, shade(wall, -0.5));
  for (const wx of [7, 29]) { rect(x, wx, 17, 6, 5, '#5a7a8a'); rect(x, wx + 2, 17, 1, 5, wall); if (r() < 0.7) rect(gx, wx, 17, 6, 5, '#ffd27a'); }
  return reg('house' + seed, p.c, 7, { glow: p.g, solid: true });
}
const STORE_NAMES = ['CURIOS', 'GROCERY', 'HARDWARE', 'CAFE', 'BARBER', 'ANTIQUES', 'GIFTS', 'SALOON', 'LAUNDRY', 'VIDEO'];
function store(seed) {
  const r = mulberry(seed);
  const p = pair(56, 38);
  const { x, gx } = p;
  const wood = ['#9a6a42', '#8a5a3a', '#b08a5a', '#7a8a9a'][Math.floor(r() * 4)];
  rect(x, 0, 0, 56, 38, wood);
  for (let yy = 2; yy < 38; yy += 3) rect(x, 0, yy, 56, 1, shade(wood, -0.15));
  rect(x, 3, 3, 50, 9, '#f2e6c8');
  const name = STORE_NAMES[Math.floor(r() * STORE_NAMES.length)];
  drawText(x, name, 28, 5, '#6a2a1a', 1, 'center');
  for (let i = 0; i < 7; i++) rect(x, 2 + i * 8, 15, 8, 4, i % 2 ? '#f4f4ee' : '#c0302a');
  rect(x, 5, 21, 18, 10, '#5a7a8a'); rect(x, 33, 21, 18, 10, '#5a7a8a'); rect(x, 25, 21, 6, 17, '#3a2a1a');
  rect(gx, 5, 21, 18, 10, '#ffd890'); rect(gx, 33, 21, 18, 10, '#ffd890');
  return reg('store' + seed, p.c, 9, { glow: p.g, solid: true });
}
function church() {
  const p = pair(36, 52);
  const { x, gx } = p;
  rect(x, 4, 26, 28, 26, '#ecebe2'); rect(x, 4, 51, 28, 1, '#a8a8a0');
  for (let yy = 0; yy < 8; yy++) rect(x, 18 - yy * 2, 18 + yy, yy * 4, 1, '#6a3a2a');
  rect(x, 14, 6, 8, 14, '#ecebe2'); rect(x, 13, 4, 10, 2, '#6a3a2a');
  rect(x, 17, 0, 2, 6, '#c8a050'); rect(x, 15, 1, 6, 1, '#c8a050');
  rect(x, 15, 40, 6, 12, '#6a3a2a'); rect(x, 8, 32, 4, 7, '#6a8ac0'); rect(x, 24, 32, 4, 7, '#6a8ac0');
  rect(gx, 8, 32, 4, 7, '#ffcf7a'); rect(gx, 24, 32, 4, 7, '#ffcf7a');
  return reg('church', p.c, 13, { glow: p.g, solid: true });
}
function waterTower() {
  const [c, x] = makeCanvas(32, 66);
  line(x, 8, 30, 4, 65, '#6a6a70', 2); line(x, 24, 30, 28, 65, '#6a6a70', 2);
  line(x, 6, 45, 26, 58, '#6a6a70'); line(x, 26, 45, 6, 58, '#6a6a70');
  ellipse(x, 16, 18, 14, 13, '#b8b8c0'); rect(x, 2, 18, 29, 10, '#b8b8c0');
  rect(x, 20, 8, 8, 18, '#9a9aa4'); rect(x, 3, 27, 27, 2, '#8a8a94');
  drawText(x, 'H2O', 16, 17, '#3a5a8a', 1, 'center');
  return reg('tower', c, 16, { solid: true });
}
function gasStation() {
  const p = pair(96, 42);
  const { x, gx } = p;
  rect(x, 72, 18, 24, 24, '#d8c8a8'); rect(x, 72, 16, 24, 3, '#c0302a');
  rect(x, 75, 22, 12, 8, '#6a8a9a'); rect(gx, 75, 22, 12, 8, '#ffe2a0'); rect(x, 89, 26, 5, 16, '#4a3a2a');
  rect(x, 0, 6, 70, 7, '#ececec'); rect(x, 0, 11, 70, 2, '#c0302a'); rect(x, 0, 13, 70, 1, '#8a8a8a');
  p.both(ctx => drawText(ctx, 'GAS', 35, 6, '#c0302a', 1, 'center'));
  rect(gx, 2, 14, 66, 1, '#fff6c8');
  rect(x, 6, 14, 3, 28, '#bcbcbc'); rect(x, 61, 14, 3, 28, '#bcbcbc');
  for (const pxx of [20, 42]) {
    rect(x, pxx, 27, 8, 15, '#c0302a'); rect(x, pxx + 1, 29, 6, 4, '#1a1a1a'); rect(gx, pxx + 1, 29, 6, 4, '#7aff7a');
    rect(x, pxx + 2, 35, 4, 1, '#f4f4f4'); rect(x, pxx - 2, 37, 12, 5, '#9a9a9a');
  }
  return reg('gas', p.c, 7, { glow: p.g, solid: true });
}
function priceSign() {
  const p = pair(22, 48);
  const { x, gx } = p;
  rect(x, 10, 20, 2, 28, '#7a7a7a');
  rect(x, 0, 0, 22, 21, '#1a1a1a'); rect(x, 1, 1, 20, 19, '#f4f4ee');
  rect(x, 1, 1, 20, 7, '#c0302a');
  p.both(ctx => drawText(ctx, 'GAS', 11, 2, '#ffffff', 1, 'center'));
  p.both(ctx => drawText(ctx, '1.09', 11, 10, '#1a1a1a', 1, 'center'));
  rect(x, 15, 16, 1, 1, '#1a1a1a'); // the little 9/10
  return reg('price', p.c, 7, { glow: p.g, solid: true });
}
function streetLight() {
  const p = pair(14, 52);
  const { x, gx } = p;
  rect(x, 11, 4, 2, 48, '#7a7a7a'); rect(x, 3, 3, 10, 2, '#7a7a7a');
  rect(x, 1, 4, 6, 2, '#4a4a4a'); rect(gx, 1, 6, 6, 1, '#fff2b0'); rect(x, 1, 6, 6, 1, '#d8d0b0');
  return reg('lamp', p.c, 8, { glow: p.g, lights: [{ x: 4 / 14, y: 6 / 52, c: '255,230,160', r: 0.35 }], solid: true });
}
function shelter(full) {
  const [c, x] = makeCanvas(46, 30);
  rect(x, 0, 2, 30, 3, '#2a4a6a'); rect(x, 1, 5, 2, 23, '#5a5a62'); rect(x, 27, 5, 2, 23, '#5a5a62');
  rect(x, 3, 5, 24, 14, '#8aa8b8'); rect(x, 3, 5, 24, 1, '#c8dce4');
  rect(x, 5, 20, 20, 2, '#7a5236'); rect(x, 6, 22, 1, 5, '#4a3020'); rect(x, 23, 22, 1, 5, '#4a3020');
  rect(x, 39, 5, 1, 25, '#9a9a9a'); rect(x, 33, 0, 13, 9, '#1a5aa0'); drawText(x, 'BUS', 39.5, 2, '#ffffff', 1, 'center');
  if (full) {
    const r = mulberry(91);
    const shirts = ['#c0302a', '#2a6aa0', '#e8c84a', '#3a8a4a', '#8a4aa0'];
    [5, 11, 17, 23, 31].forEach((pxx, i) => {
      const s = shirts[i % shirts.length];
      rect(x, pxx, 21, 2, 8, '#2a2a3a'); rect(x, pxx - 1, 15, 4, 7, s);
      rect(x, pxx, 11, 3, 4, ['#e0b08a', '#a06a4a', '#6a4a32', '#f0c8a0'][Math.floor(r() * 4)]);
      if (i === 4) rect(x, pxx + 3, 23, 4, 5, '#6a3a2a');
    });
  }
  return c;
}
function depot() {
  const p = pair(84, 40);
  const { x, gx } = p;
  rect(x, 0, 8, 84, 32, '#8a4a3a');
  for (let yy = 10; yy < 40; yy += 3) for (let xx = (yy % 6 ? 0 : 3); xx < 84; xx += 6) rect(x, xx, yy, 1, 1, '#6a3a2a');
  rect(x, 6, 0, 72, 10, '#1a2a4a');
  p.both(ctx => drawText(ctx, 'BUS DEPOT', 42, 3, '#ffd36a', 1, 'center'));
  rect(x, 8, 18, 20, 10, '#7a9aaa'); rect(x, 56, 18, 20, 10, '#7a9aaa'); rect(x, 34, 18, 16, 22, '#4a5a62');
  rect(gx, 8, 18, 20, 10, '#ffe2a0'); rect(gx, 56, 18, 20, 10, '#ffe2a0');
  return reg('depot', p.c, 10, { glow: p.g, solid: true });
}
function cow(seed) {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(22, 14);
  const body = r() < 0.5 ? '#2a2a2a' : '#7a4a2a';
  rect(x, 3, 3, 14, 6, body);
  for (let i = 0; i < 4; i++) rect(x, 4 + Math.floor(r() * 10), 3 + Math.floor(r() * 4), 3, 2, '#ececec');
  rect(x, 16, 1, 5, 4, body); rect(x, 19, 3, 2, 2, '#d8a8a0'); px(x, 17, 0, '#ddd');
  for (const lx of [4, 7, 13, 15]) rect(x, lx, 9, 1, 4, body);
  rect(x, 2, 3, 1, 4, body);
  return c;
}
function windmill() {
  const [c, x] = makeCanvas(28, 66);
  line(x, 14, 16, 6, 65, '#7a7a80'); line(x, 14, 16, 22, 65, '#7a7a80');
  for (let yy = 26; yy < 64; yy += 10) { const k = (yy - 16) / 49; line(x, 14 - k * 8, yy, 14 + k * 8, yy + 8, '#6a6a70'); }
  for (let a = 0; a < 12; a++) {
    const t = a * Math.PI / 6;
    line(x, 14 + Math.cos(t) * 3, 11 + Math.sin(t) * 3, 14 + Math.cos(t) * 10, 11 + Math.sin(t) * 10, '#9a9aa0');
  }
  rect(x, 15, 9, 12, 2, '#9a9aa0'); rect(x, 22, 6, 5, 7, '#b8b8c0');
  return c;
}

// ---------- 90s traffic ----------
export const CAR_COLORS = ['#a83232', '#2f5a9a', '#e0d8c0', '#3a6a3a', '#7a5a3a', '#c0a060', '#5a5a6a', '#8a2a4a', '#d8d8d8', '#2a2a2a', '#3a8a8a', '#c86a2a'];

function car(type, view, col) {
  const dims = { sedan: [32, 21], wagon: [32, 22], pickup: [32, 24], van: [32, 28], semi: [36, 46], rv: [36, 40] }[type];
  const [W, H] = dims;
  const p = pair(W, H);
  const { x, gx } = p;
  const light = shade(col, 0.25), dark = shade(col, -0.35);
  const glass = view === 'rear' ? '#26303a' : '#6f93ab';
  const lights = [];
  const tire = (tx, ty, tw, th) => rect(x, tx, ty, tw, th, '#141414');
  const lamp = (lx, ly, lw, lh) => {
    const c = view === 'rear' ? '#c8202a' : '#e8e4c8';
    const g = view === 'rear' ? '#ff3030' : '#fffbe0';
    rect(x, lx, ly, lw, lh, c); rect(gx, lx, ly, lw, lh, g);
    lights.push({ x: (lx + lw / 2) / W, y: (ly + lh / 2) / H });
  };
  rect(x, 0, H - 1, W, 1, 'rgba(0,0,0,0.35)');
  if (type === 'semi') {
    if (view === 'rear') {
      tire(3, H - 8, 6, 7); tire(W - 9, H - 8, 6, 7);
      rect(x, 1, 0, W - 2, 38, '#d8d8d0'); rect(x, 1, 0, W - 2, 1, '#f4f4ee'); rect(x, W / 2, 1, 1, 36, '#9a9a94');
      for (const lx of [10, 25]) rect(x, lx, 8, 1, 24, '#8a8a84');
      rect(x, 1, 37, W - 2, 2, '#4a4a4a'); lamp(2, 34, 4, 3); lamp(W - 6, 34, 4, 3);
      rect(x, 3, 39, 5, 6, '#111'); rect(x, W - 8, 39, 5, 6, '#111');
      rect(x, 10, 41, 16, 1, '#c0c0c0');
    } else {
      tire(3, H - 7, 6, 6); tire(W - 9, H - 7, 6, 6);
      rect(x, 0, 2, 2, 22, '#c8c8c8'); rect(x, W - 2, 2, 2, 22, '#c8c8c8');
      rect(x, 3, 4, W - 6, 36, col); rect(x, 3, 4, W - 6, 1, light);
      rect(x, 5, 7, W - 10, 11, glass); rect(x, 6, 8, 6, 1, '#a8c8d8');
      rect(x, 11, 20, 14, 15, '#b8b8b8'); for (let yy = 21; yy < 35; yy += 2) rect(x, 12, yy, 12, 1, '#7a7a7a');
      lamp(4, 26, 6, 3); lamp(W - 10, 26, 6, 3);
      rect(x, 2, 37, W - 4, 4, '#c8c8c8');
    }
  } else if (type === 'rv') {
    tire(4, H - 6, 6, 5); tire(W - 10, H - 6, 6, 5);
    rect(x, 1, 1, W - 2, H - 6, '#ece4d0'); rect(x, 1, 14, W - 2, 3, '#8a4a2a'); rect(x, 1, 17, W - 2, 2, '#d8822a');
    if (view === 'rear') {
      rect(x, 10, 4, 16, 7, '#26303a'); rect(x, W - 6, 3, 2, 25, '#8a8a8a');
      ellipse(x, 18, 25, 6, 5, '#3a3a3a'); lamp(2, 26, 3, 5); lamp(W - 5, 26, 3, 5);
    } else {
      rect(x, 3, 3, W - 6, 10, glass); rect(x, 4, 4, 8, 1, '#a8c8d8');
      lamp(3, 26, 6, 3); lamp(W - 9, 26, 6, 3); rect(x, 11, 25, 14, 5, '#5a5a5a');
    }
    rect(x, 1, H - 8, W - 2, 3, '#7a7a7a');
  } else {
    const tall = type === 'van' ? 9 : type === 'pickup' ? 4 : type === 'wagon' ? 2 : 0;
    const by = 9 + tall;
    tire(2, H - 6, 5, 5); tire(W - 7, H - 6, 5, 5);
    // body
    rect(x, 1, by, W - 2, H - by - 4, col); rect(x, 1, by, W - 2, 1, light); rect(x, 1, H - 6, W - 2, 1, dark);
    // cabin
    const ct = 2, inset = type === 'van' ? 1 : type === 'pickup' && view === 'rear' ? 8 : 5;
    for (let yy = ct; yy < by; yy++) {
      const ins = type === 'van' ? inset : Math.round(inset - (yy - ct) * (inset - 2) / Math.max(1, by - ct));
      rect(x, ins, yy, W - ins * 2, 1, col);
    }
    rect(x, inset + 1, ct + 1, W - (inset + 1) * 2, by - ct - 1, glass);
    if (view === 'front') rect(x, inset + 2, ct + 2, 5, 1, '#a8c8d8');
    if (type === 'van' && view === 'rear') rect(x, W / 2, ct + 1, 1, by - ct - 1, col);
    if (type === 'wagon' && view === 'rear') rect(x, 6, by + 2, W - 12, 5, '#8a5a32');
    if (type === 'pickup' && view === 'rear') { rect(x, 3, by + 1, W - 6, 1, dark); rect(x, 3, by + 6, W - 6, 1, dark); }
    // lights / grille / plate
    if (view === 'rear') { lamp(2, by + 2, 5, 3); lamp(W - 7, by + 2, 5, 3); rect(x, 13, by + 4, 6, 3, '#e8e2c8'); }
    else { lamp(2, by + 2, 6, 2); lamp(W - 8, by + 2, 6, 2); rect(x, 10, by + 2, 12, 3, '#2a2a2a'); for (let gxx = 11; gxx < 21; gxx += 2) rect(x, gxx, by + 2, 1, 3, '#8a8a8a'); }
    rect(x, 0, H - 6, W, 2, view === 'front' ? '#a8a8a8' : '#3a3a3a');
  }
  const h = { sedan: 1.45, wagon: 1.5, pickup: 1.75, van: 2.1, semi: 4.1, rv: 3.5 }[type];
  return { img: p.c, glow: p.g, lights, h, solid: true };
}

export const CAR_TYPES = ['sedan', 'sedan', 'sedan', 'wagon', 'pickup', 'pickup', 'van', 'semi', 'semi', 'rv'];
export function carSprite(type, view, colorIdx) {
  const key = `car_${type}_${view}_${colorIdx}`;
  if (!SPR[key]) {
    const c = carHi(type, view, CAR_COLORS[colorIdx], colorIdx * 13 + type.length);
    const h = { sedan: 1.45, wagon: 1.5, pickup: 1.75, van: 2.1, semi: 4.1, rv: 3.5 }[type];
    SPR[key] = { ...c, h, solid: true, img: freeze(refine(c.img, { flat: true, smooth: true, scale: 1 })), front: view === 'front', type };
  }
  return SPR[key];
}

// green highway guide sign, e.g. ["FLAGSTAFF", "32 MI"]
export function greenSign(lines) {
  const key = 'green_' + lines.join('|');
  if (SPR[key]) return key;
  const tw = Math.max(...lines.map(l => textWidth(l))) + 8;
  const h = lines.length * 7 + 5;
  const [c, x] = makeCanvas(tw, h + 10);
  rect(x, 3, h, 2, 10, '#8a8a8a'); rect(x, tw - 5, h, 2, 10, '#8a8a8a');
  rect(x, 0, 0, tw, h, '#e8e8e0'); rect(x, 1, 1, tw - 2, h - 2, '#1f6a3a');
  lines.forEach((l, i) => drawText(x, l, tw / 2, 3 + i * 7, '#f4f4ee', 1, 'center'));
  reg(key, c, 3.2 + lines.length * 0.6, { solid: true });
  return key;
}
// route marker: interstate (red/blue shield), US (white shield), state (white circle)
export function routeShield(hw) {
  const key = 'shield_' + hw;
  if (SPR[key]) return key;
  const [kind, num] = hw.split('-');
  const [c, x] = makeCanvas(19, 30);
  rect(x, 9, 16, 1, 14, '#8a8a8a');
  if (kind === 'I') {
    rect(x, 1, 1, 17, 16, '#f4f4ee'); rect(x, 2, 6, 15, 10, '#1a3a8a'); rect(x, 2, 2, 15, 4, '#c0202a');
    x.clearRect(1, 1, 1, 1); x.clearRect(17, 1, 1, 1); x.clearRect(1, 16, 3, 1); x.clearRect(15, 16, 3, 1);
    drawText(x, num, 9.5, 8, '#ffffff', 1, 'center');
  } else if (kind === 'US') {
    rect(x, 1, 1, 17, 16, '#111'); rect(x, 2, 2, 15, 14, '#f4f4ee');
    drawText(x, num, 9.5, 7, '#111', 1, 'center'); drawText(x, 'US', 9.5, 2, '#111', 1, 'center');
  } else {
    rect(x, 1, 1, 17, 16, '#111'); ellipse(x, 9, 9, 7, 7, '#f4f4ee');
    drawText(x, num, 9.5, 7, '#111', 1, 'center');
  }
  reg(key, c, 2.8, { solid: true });
  return key;
}
function rentalOffice() {
  const p = pair(70, 40);
  const { x, gx } = p;
  rect(x, 0, 14, 70, 26, '#e8e4d8'); rect(x, 0, 12, 70, 3, '#2a6ab0');
  rect(x, 6, 0, 58, 12, '#2a6ab0'); rect(x, 7, 1, 56, 10, '#f4f4ee');
  p.both(c => drawText(c, 'U-DRIVE', 35, 3, '#c0202a', 1, 'center'));
  rect(x, 6, 20, 24, 12, '#6a8a9a'); rect(gx, 6, 20, 24, 12, '#ffe2a0'); rect(x, 40, 20, 10, 20, '#3a4a5a');
  drawText(x, 'RENTALS', 35, 34, '#2a6ab0', 1, 'center');
  return reg('rental', p.c, 6, { glow: p.g, solid: true });
}

export function welcomeSprite(name) {
  const key = 'welcome_' + name;
  if (!SPR[key]) reg(key, welcome(name), 4, { solid: true });
  return key;
}

export const BUILDINGS = [];
export const ADS_COUNT = ADS.length;

export function buildSprites() {
  reg('pine', ponderosa(1, 160), 18, { solid: true, scale: 1, smooth: true });
  reg('pine2', ponderosa(2, 190), 22, { solid: true, scale: 1, smooth: true });
  reg('pine3', ponderosa(3, 120), 13, { solid: true, scale: 1, smooth: true });
  reg('juniper', juniperTree(4), 4, { solid: true, scale: 1, smooth: true });
  reg('juniper2', juniperTree(5, '#647a48'), 3.2, { solid: true, scale: 1, smooth: true });
  reg('rock', rock(6, '#8a7f72'), 1.1);
  reg('redrock', rock(7, '#a0583a'), 1.3);
  reg('boulder', rock(8, '#9a5a3c', 30, 18), 3.5, { solid: true });
  reg('grass', tuft(9), 0.7);
  reg('sage', shrub(10, '#8a9a6a', 30, 16, true), 1.0, { scale: 1 });
  reg('creosote', shrub(11, '#6d7a3a', 34, 20, true), 1.2, { scale: 1 });
  reg('joshua', joshuaHi(12), 7.5, { solid: true, scale: 1 });
  reg('saguaro', saguaroHi(13), 7, { solid: true, scale: 1 });
  reg('barrel', barrel(), 0.8);
  reg('pebbles', pebbles(14, '#9a8a78'), 0.35, { scale: 1, noOutline: true });
  reg('pebbles2', pebbles(15, '#b09070'), 0.35, { scale: 1, noOutline: true });
  reg('pole', pole(), 10, { solid: true });
  reg('fence', fencePost(), 1.3);
  reg('mile', mileMarker(), 1.3);
  reg('shield', shield66(), 2.8, { solid: true });
  reg('speed35', speedSign(35), 2.8, { solid: true });
  reg('speed65', speedSign(65), 2.8, { solid: true });
  reg('speed25', speedSign(25), 2.8, { solid: true });
  reg('yield', yieldSign(), 2.6, { solid: true });
  reg('stop', stopSign(), 2.8, { solid: true });
  reg('roundabout', roundSign(), 2.8, { solid: true });
  reg('deadend', diamond(['DEAD', 'END']), 2.8, { solid: true });
  reg('mailbox0', mailbox(1), 1.25); reg('mailbox1', mailbox(2), 1.25); reg('mailbox2', mailbox(3), 1.25);
  ADS.forEach((ad, i) => reg('bb' + i, billboard(ad), 7.5, { solid: true }));
  reg('cow', cow(13), 1.6); reg('cow2', cow(14), 1.6);
  reg('windmill', windmill(), 11, { solid: true });
  reg('shelter_full', shelter(true), 3.2, { solid: true });
  reg('shelter_empty', shelter(false), 3.2, { solid: true });
  depot(); rentalOffice(); gasStation(); priceSign(); streetLight(); church(); waterTower();
  const bld = (key, art, h) => { reg(key, art.img, h, { glow: art.glow, solid: true, scale: 1, smooth: true }); BUILDINGS.push(key); };
  for (let i = 0; i < 4; i++) bld('motel' + i, motelHi(20 + i), 10.5);
  for (let i = 0; i < 3; i++) bld('diner' + i, dinerHi(30 + i), 8.5);
  for (let i = 0; i < 10; i++) bld('house' + i, houseHi(40 + i), 8);
  for (let i = 0; i < 10; i++) bld('store' + i, storeHi(60 + i), 9.5);
  BUILDINGS.push('church', 'tower');
}
