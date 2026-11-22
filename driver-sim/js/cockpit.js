// The driver's cab of a 90s intercity coach, drawn at 480x270:
// split windshield, folding entry door, bus mirrors, gauge cluster, switch panel,
// CB radio, desk fan, flat bus steering wheel and big hairy forearms.
import { wAng } from './weather.js';
import { TV_SCREEN } from './vhs.js';
import { drawSouvenirs } from './souvenirs.js';
import { W, H } from './config.js';
import { makeCanvas, mulberry, rect, px, line, ellipse, circle, poly, shade, clamp, timeStr, css, ditherV, bayer, hex, lerpC, freeze } from './gfx.js';
import { drawText } from './font.js';
import { NODES } from './world.js';

const [layer, lctx] = makeCanvas(W, H);
let base, handL, handR, armL, armR;

const DASH_Y = 176;
const WH = { cx: 210, cy: 258, rx: 104, ry: 46, t: 9 };
const G = {
  air: [148, 175, 10], oil: [148, 199, 10], speed: [190, 186, 22],
  tach: [238, 186, 17], fuel: [274, 175, 10], temp: [274, 199, 10],
};
const FAN = [384, 150, 12];
const MIRL = [26, 44, 34, 48], MIRR = [342, 38, 34, 46]; // x, y, w, h of exterior mirror glass

// ---------- static cab ----------
function gaugeFace(x, [cx, cy, r], o) {
  circle(x, cx, cy, r + 2, '#6c6c70'); circle(x, cx, cy, r + 1, '#3a3a3e');
  for (let a = 200; a < 340; a += 4) { const t = a * Math.PI / 180; px(x, cx + Math.cos(t) * (r + 1.5), cy + Math.sin(t) * (r + 1.5), '#a8a8b0'); }
  circle(x, cx, cy, r, '#0c0c0e');
  const n = o.ticks;
  for (let k = 0; k <= n; k++) {
    const t = (o.start + (k / n) * o.sweep) * Math.PI / 180;
    const major = k % (o.major || 1) === 0;
    const red = o.red !== undefined && k / n >= o.red;
    const c = red ? '#e84a3a' : '#e8e8e0';
    px(x, cx + Math.cos(t) * (r - 1), cy + Math.sin(t) * (r - 1), c);
    if (major) px(x, cx + Math.cos(t) * (r - 2), cy + Math.sin(t) * (r - 2), c);
    if (major && o.nums) drawText(x, String(o.nums[k / (o.major || 1)] ?? ''), cx + Math.cos(t) * (r - 7), cy + Math.sin(t) * (r - 7) - 2, '#c8c8c0', 1, 'center');
  }
  if (o.label) drawText(x, o.label, cx, cy + (o.sweep < 200 ? 3 : 7), '#7a7a74', 1, 'center');
}

function toggle(x, x0, y0, label, up) {
  rect(x, x0, y0, 11, 14, '#141414'); rect(x, x0 + 1, y0 + 1, 9, 12, '#2a2a2c');
  circle(x, x0 + 5, y0 + 7, 3, '#8a8a90'); px(x, x0 + 4, y0 + 6, '#d8d8e0');
  if (up) { rect(x, x0 + 4, y0 + 1, 3, 6, '#c8c8d0'); rect(x, x0 + 4, y0 + 1, 1, 6, '#ffffff'); }
  else { rect(x, x0 + 4, y0 + 7, 3, 6, '#c8c8d0'); rect(x, x0 + 4, y0 + 7, 1, 6, '#ffffff'); }
  drawText(x, label, x0 + 5.5, y0 + 16, '#8a8478', 1, 'center');
}

function buildBase() {
  const [c, x] = makeCanvas(W, H);
  const r = mulberry(3);
  // ---- headliner / overhead ----
  ditherV(x, 0, 0, W, 17, ['#57524b', '#3e3a35', '#2a2724']);
  rect(x, 0, 16, W, 1, '#1a1816');
  rect(x, 150, 0, 180, 14, '#141414'); rect(x, 152, 2, 176, 10, '#1e1e1e');
  for (let xx = 156; xx < 326; xx += 12) px(x, xx, 7, '#555');
  drawText(x, 'PAINTED DESERT COACH', 240, 4, '#6a6458', 1, 'center');
  rect(x, 60, 3, 30, 9, '#c8c0a8'); rect(x, 61, 4, 28, 7, '#e8e0c8'); // dome light
  for (let xx = 100; xx < 140; xx += 3) rect(x, xx, 4, 2, 8, '#2a2724'); // speaker grille
  // ---- tinted band on top of the glass ----
  x.fillStyle = 'rgba(30,90,80,0.32)'; x.fillRect(0, 17, 412, 20);
  x.fillStyle = 'rgba(30,90,80,0.18)'; x.fillRect(0, 37, 412, 4);
  // ---- pillars, centre post, door ----
  poly(x, [0, 0, 24, 0, 14, DASH_Y, 0, DASH_Y], '#2a2622');
  line(x, 23, 0, 13, DASH_Y, '#4a443e'); line(x, 21, 0, 11, DASH_Y, '#1c1a18');
  rect(x, 299, 17, 7, DASH_Y - 17, '#161616'); rect(x, 300, 17, 1, DASH_Y - 17, '#3a3a3a');
  poly(x, [396, 0, 414, 0, 412, DASH_Y, 398, DASH_Y], '#2a2622');
  line(x, 397, 0, 399, DASH_Y, '#4a443e');
  // folding door: frames and lower panels (upper panes stay see-through)
  rect(x, 412, 17, 68, 6, '#2c2c30');
  for (const [x0, x1] of [[412, 416], [444, 450], [476, 480]]) rect(x, x0, 17, x1 - x0, 140, '#1c1c1e');
  rect(x, 446, 17, 1, 140, '#4a4a4e');
  ditherV(x, 412, 156, 68, H - 156, ['#5a5a62', '#44444a', '#2e2e34']);
  for (let yy = 164; yy < H; yy += 7) rect(x, 414, yy, 64, 1, '#3a3a40');
  for (const xx of [418, 452]) for (let yy = 160; yy < H; yy += 16) px(x, xx, yy, '#8a8a90');
  rect(x, 446, 156, 2, H - 156, '#1c1c1e');
  rect(x, 422, 120, 14, 3, '#9a9aa0'); rect(x, 456, 120, 14, 3, '#9a9aa0'); // grab bars
  // ---- exterior "bunny ear" mirrors on arms ----
  line(x, 16, 20, 40, 44, '#1a1a1a', 3); line(x, 380, 18, 362, 38, '#1a1a1a', 3);
  for (const [mx, my, mw, mh] of [MIRL, MIRR]) {
    // frame only: hollow so the live mirror image shows through
    rect(x, mx - 3, my - 3, mw + 6, 3, '#141414'); rect(x, mx - 3, my + mh, mw + 6, 3, '#141414');
    rect(x, mx - 3, my, 3, mh, '#141414'); rect(x, mx + mw, my, 3, mh, '#141414');
    rect(x, mx - 2, my - 2, mw + 4, 1, '#3a3a3a');
  }
  // ---- bugs and grime on the glass ----
  for (let i = 0; i < 9; i++) {
    const bx = 30 + r() * 360, by = 50 + r() * 110;
    if (bx > 296 && bx < 308) continue;
    const col = ['200,190,60', '120,140,40', '60,40,20'][i % 3];
    x.fillStyle = `rgba(${col},0.8)`; x.fillRect(bx, by, 2, 2); x.fillRect(bx - 1, by + 1, 1, 1);
    for (let k = 1; k < 4 + r() * 6; k++) { x.fillStyle = `rgba(${col},${0.5 - k * 0.05})`; x.fillRect(bx + 1 + k * 0.4, by + 2 + k, 1, 1); }
  }
  for (let yy = 140; yy < DASH_Y; yy++) for (let xx = 14; xx < 396; xx++) {
    const v = (yy - 140) / 36;
    if (bayer(xx, yy) < v * 0.22 && r() < 0.5) { x.fillStyle = 'rgba(150,120,80,0.35)'; x.fillRect(xx, yy, 1, 1); }
  }
  // ---- dashboard ----
  rect(x, 0, DASH_Y, 412, 11, '#4b4540'); rect(x, 0, DASH_Y, 412, 1, '#6d655c');
  for (let xx = 30; xx < 400; xx += 7) if (xx < 118 || xx > 304) rect(x, xx, DASH_Y + 4, 4, 2, '#24211e');
  ditherV(x, 0, DASH_Y + 11, 412, H - DASH_Y - 11, ['#3c3733', '#2c2825', '#1d1b19']);
  rect(x, 0, DASH_Y + 11, 412, 1, '#252220');
  for (let i = 0; i < 700; i++) px(x, r() * 412, DASH_Y + 12 + r() * 80, r() < 0.5 ? '#423c37' : '#26221f');
  // gauge binnacle
  poly(x, [118, 186, 130, 156, 290, 156, 302, 186], '#2a2623');
  rect(x, 130, 156, 160, 1, '#5a534c');
  rect(x, 132, 160, 156, 56, '#121110'); rect(x, 132, 160, 156, 1, '#2a2826');
  gaugeFace(x, G.speed, { start: 135, sweep: 270, ticks: 16, major: 4, nums: [0, 20, 40, 60, 80], red: 0.82, label: 'MPH' });
  gaugeFace(x, G.tach, { start: 135, sweep: 270, ticks: 12, major: 3, nums: [0, 1, 2, 3, 4], red: 0.75, label: 'RPM' });
  gaugeFace(x, G.air, { start: 180, sweep: 180, ticks: 6, label: 'AIR' });
  gaugeFace(x, G.oil, { start: 180, sweep: 180, ticks: 6, label: 'OIL' });
  gaugeFace(x, G.fuel, { start: 180, sweep: 180, ticks: 4, label: 'FUEL' });
  gaugeFace(x, G.temp, { start: 180, sweep: 180, ticks: 6, red: 0.8, label: 'TEMP' });
  rect(x, 180, 197, 21, 7, '#050505'); // odometer window
  // sunglasses on the binnacle
  rect(x, 140, 152, 7, 4, '#111'); rect(x, 149, 152, 7, 4, '#111'); rect(x, 147, 153, 2, 1, '#888');
  px(x, 141, 152, '#5a7a9a'); px(x, 150, 152, '#5a7a9a');
  // radio
  rect(x, 20, 192, 96, 28, '#151413'); rect(x, 21, 193, 94, 26, '#2a2826'); rect(x, 21, 193, 94, 1, '#7a7a7e');
  rect(x, 32, 196, 54, 10, '#120a02');
  circle(x, 27, 205, 4, '#555'); circle(x, 27, 205, 2, '#999'); circle(x, 106, 205, 4, '#555'); circle(x, 106, 205, 2, '#999');
  for (let i = 0; i < 5; i++) { rect(x, 33 + i * 11, 210, 9, 5, '#555'); rect(x, 33 + i * 11, 210, 9, 1, '#999'); }
  drawText(x, 'AM/FM', 98, 197, '#8a8478', 1, 'center');
  // switch panel
  rect(x, 16, 226, 104, 32, '#1e1c1a'); rect(x, 16, 226, 104, 1, '#4a443e');
  ['HDL', 'MRK', 'WIP', 'DEF', 'FAN', 'DOM'].forEach((l, i) => toggle(x, 20 + i * 16.5, 229, l, i === 4));
  // CB radio slung under the dash + mic on a coiled cord
  rect(x, 6, 258, 70, 12, '#1a1a1a'); rect(x, 8, 260, 30, 6, '#200404'); drawText(x, 'CB', 48, 261, '#7a7a74');
  rect(x, 60, 260, 12, 6, '#333');
  for (let yy = 214; yy < 258; yy += 3) { px(x, 9 + ((yy / 3) % 2 ? 1 : -1), yy, '#111'); px(x, 9, yy + 1, '#111'); }
  rect(x, 3, 200, 10, 15, '#111'); rect(x, 4, 201, 8, 13, '#222'); for (let yy = 203; yy < 212; yy += 2) rect(x, 5, yy, 6, 1, '#111');
  // right dash: things sitting on top
  rect(x, 312, 164, 12, 13, '#b8b0a0'); rect(x, 312, 164, 3, 13, '#d8d0c0'); rect(x, 324, 167, 3, 7, '#a8a090');
  rect(x, 311, 162, 14, 3, '#2a2a2a'); rect(x, 313, 168, 10, 2, '#5a3a2a'); // thermos mug
  poly(x, [332, 178, 338, 168, 372, 168, 368, 178], '#c8b48a'); poly(x, [334, 177, 339, 170, 369, 170, 366, 177], '#f0ead8');
  rect(x, 349, 166, 8, 3, '#8a8a8a');
  for (let i = 0; i < 4; i++) line(x, 341 - i, 171 + i * 2, 365 - i, 171 + i * 2, '#9a8a6a');
  // desk fan base and neck (blades drawn live)
  rect(x, FAN[0] - 8, 172, 16, 5, '#2a3a4a'); rect(x, FAN[0] - 8, 172, 16, 1, '#4a6a8a');
  rect(x, FAN[0] - 1, FAN[1] + 10, 3, 12, '#2a3a4a');
  // destination LCD
  rect(x, 308, 190, 102, 50, '#141210'); rect(x, 310, 192, 98, 46, '#0c200e');
  for (let yy = 192; yy < 238; yy += 2) rect(x, 310, yy, 98, 1, 'rgba(0,0,0,0.25)');
  // door control
  rect(x, 360, 246, 46, 22, '#1a1a1a'); rect(x, 362, 248, 42, 18, '#2c2c2e');
  drawText(x, 'DOOR', 372, 251, '#8a8478', 1, 'center');
  // steering column
  ditherV(x, 196, 250, 28, 20, ['#2a2623', '#151311']);
  // interior mirror mount
  rect(x, 238, 14, 4, 6, '#111');
  return c;
}

// ---------- hands and forearms (native detail) ----------
const SK = ['#f0c4a0', '#dda47e', '#c88a64', '#a86c4a', '#7a4a32'];
const HAIR = '#4a2c1a', HAIR2 = '#6a4228';
// Hand seen from the driver's seat: back of the hand, knuckles on top of the rim,
// fingers curling over it, thumb lying along the rim toward the hub.
function buildHand(flip) {
  const HW = 48, HH = 38;
  const [c0, x] = makeCanvas(HW, HH);
  const r = mulberry(flip ? 51 : 52);
  const P = (xx, yy, col) => px(x, flip ? HW - 1 - xx : xx, yy, col);
  // thumb resting along the rim toward 12 o'clock
  for (let t = 0; t <= 1; t += 0.02) {
    const cx = 35 + t * 10, cy = 20 - t * 4, rad = 4 - t * 1.2;
    for (let dy = -5; dy <= 5; dy++) for (let dx = -5; dx <= 5; dx++) {
      if (Math.hypot(dx, dy) > rad) continue;
      P(Math.round(cx + dx), Math.round(cy + dy), SK[dy < -rad * 0.3 ? 1 : dy < rad * 0.4 ? 2 : 3]);
    }
  }
  for (const [nx, ny] of [[44, 14], [45, 14], [44, 15], [45, 15]]) P(nx, ny, '#f2d4c4');
  // back of the hand, tapering to the wrist
  for (let yy = 9; yy < HH; yy++) {
    const f = (yy - 9) / (HH - 10);
    const l = Math.round(3 + f * 9), rr = Math.round(39 - f * 6);
    for (let xx = l; xx <= rr; xx++) {
      const u = (xx - l) / Math.max(1, rr - l);
      let k = u < 0.1 ? 0 : u < 0.45 ? 1 : u < 0.8 ? 2 : 3;
      if (yy > HH - 4) k = Math.min(4, k + 1);
      P(xx, yy, SK[k]);
    }
  }
  // tendons
  for (const kx of [8, 17, 26, 34]) for (let t = 0.12; t < 0.8; t += 0.04) {
    const xx = Math.round(kx + (22 - kx) * t), yy = Math.round(11 + (HH - 14) * t);
    if (Math.round(t * 25) % 3) P(xx, yy, SK[0]);
  }
  // curled fingers: short, rounded, darker where they turn over the rim
  for (let f = 0; f < 4; f++) {
    const fx = 3 + f * 9;
    for (let yy = 1; yy < 11; yy++) for (let xx = 0; xx < 9; xx++) {
      if (yy < 3 && (xx < 1 || xx > 7)) continue;
      if (yy < 2 && (xx < 2 || xx > 6)) continue;
      let k = yy < 3 ? 3 : yy < 5 ? 2 : xx < 2 ? 0 : xx < 6 ? 1 : 2;
      if (xx === 8) k = 3;
      P(fx + xx, yy, SK[k]);
    }
    for (let xx = 2; xx < 6; xx++) P(fx + xx, 5, SK[0]);   // middle knuckle catches the light
    for (let xx = 1; xx < 6; xx++) P(fx + xx, 10, SK[0]);  // main knuckle
    P(fx + 2, 11, SK[0]); P(fx + 3, 11, SK[0]);
  }
  // hair growing from the wrist toward the knuckles
  for (let i = 0; i < 32; i++) {
    const yy = 13 + r() * 21, f = (yy - 9) / (HH - 10);
    const l = 5 + f * 9, rr = 37 - f * 6, xx = l + r() * (rr - l);
    const a = Math.atan2(yy - (HH + 6), xx - 22) + (r() - 0.5) * 0.5;
    for (let k = 0; k < 2 + r() * 2; k++) P(Math.round(xx + Math.cos(a) * k), Math.round(yy + Math.sin(a) * k), r() < 0.7 ? HAIR : HAIR2);
  }
  for (let f = 0; f < 4; f++) for (let i = 0; i < 3; i++) P(4 + f * 9 + Math.floor(r() * 6), 6 + Math.floor(r() * 3), HAIR2);
  // tilt the knuckle line to follow the rim (a vertical shear keeps the pixels crisp)
  const SH = 0.22, HY = HH + 12;
  const [c, y] = makeCanvas(HW, HY);
  for (let xx = 0; xx < HW; xx++) {
    const off = Math.round((flip ? xx : HW - 1 - xx) * SH);
    y.drawImage(c0, xx, 0, 1, HH, xx, off, 1, HH);
  }
  // outline
  const img = y.getImageData(0, 0, HW, HY), d = img.data, out = new Uint8ClampedArray(d);
  const o = hex(SK[4]);
  for (let yy = 0; yy < HY; yy++) for (let xx = 0; xx < HW; xx++) {
    const i = (yy * HW + xx) * 4;
    if (d[i + 3]) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const X = xx + a, Y = yy + b; return X >= 0 && X < HW && Y >= 0 && Y < HY && d[(Y * HW + X) * 4 + 3]; });
    if (nb) { out[i] = o[0] * 0.55; out[i + 1] = o[1] * 0.55; out[i + 2] = o[2] * 0.55; out[i + 3] = 255; }
  }
  img.data.set(out); y.putImageData(img, 0, 0);
  return c;
}

// Forearms are drawn live as shaded polygons so they stay crisp at any angle.
const HAIRS = (() => { const r = mulberry(77); return Array.from({ length: 150 }, () => [0.02 + r() * 0.7, (r() - 0.5) * 0.86, (r() - 0.5) * 0.7, r() < 0.7]); })();
function drawArm(ctx, wx, wy, ex, ey, watch) {
  const dx = ex - wx, dy = ey - wy, L = Math.hypot(dx, dy);
  const d = [dx / L, dy / L], n = [-d[1], d[0]];
  const wid = u => 24 + 18 * u;
  const P = (u, v) => [wx + d[0] * u * L + n[0] * v * wid(u), wy + d[1] * u * L + n[1] * v * wid(u)];
  const quad = (u0, u1, v0, v1, col) => {
    const a = P(u0, v0), b = P(u1, v0), c = P(u1, v1), e = P(u0, v1);
    ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.lineTo(c[0], c[1]); ctx.lineTo(e[0], e[1]); ctx.closePath(); ctx.fill();
  };
  // light comes from the upper left: the side whose normal points that way is brighter
  const lit = (n[0] * -0.8 + n[1] * -0.6) > 0 ? 1 : -1;
  quad(0, 0.76, -0.56, 0.56, '#5a3420');
  const bands = 7;
  for (let b = 0; b < bands; b++) {
    const v0 = -0.5 + b / bands, v1 = v0 + 1 / bands + 0.01;
    const s = ((v0 + v1) / 2) * lit;
    const k = s > 0.3 ? 0 : s > 0.08 ? 1 : s > -0.15 ? 2 : s > -0.35 ? 3 : 4;
    quad(0, 0.76, v0, v1, SK[k]);
  }
  ctx.fillStyle = HAIR;
  for (const [u, v, a, dark] of HAIRS) {
    const [hx, hy] = P(u, v);
    const ang = Math.atan2(-d[1], -d[0]) + a;
    line(ctx, hx, hy, hx + Math.cos(ang) * 3, hy + Math.sin(ang) * 3, dark ? HAIR : HAIR2);
  }
  if (watch) {
    quad(0.03, 0.1, -0.52, 0.52, '#161616');
    quad(0.035, 0.095, -0.2, 0.2, '#8a8a90');
    quad(0.045, 0.085, -0.14, 0.14, '#9aa58a');
  }
  // rolled-up red flannel sleeve
  quad(0.72, 1.3, -0.6, 0.6, '#8a2420');
  for (const v of [-0.36, -0.06, 0.24, 0.5]) quad(0.8, 1.3, v, v + 0.07, '#3a0e0c');
  for (const u of [0.86, 0.96, 1.06, 1.16]) quad(u, u + 0.025, -0.6, 0.6, '#3a0e0c');
  for (const v of [-0.22, 0.1, 0.38]) quad(0.8, 1.3, v, v + 0.02, '#d8b84a');
  quad(0.72, 0.8, -0.62, 0.62, '#b8443a');
  quad(0.72, 0.735, -0.62, 0.62, '#d86a5a');
  quad(0.79, 0.8, -0.62, 0.62, '#4a1210');
  quad(0.8, 1.3, -0.6 * lit, -0.45 * lit, 'rgba(0,0,0,0.3)');
}

export function initCockpit() {
  base = freeze(buildBase());
  carBase = freeze(buildCarBase());
  handL = freeze(buildHand(false)); handR = freeze(buildHand(true));
}

function drawRotated(ctx, img, x, y, ang, ox, oy) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(ang);
  ctx.drawImage(img, -ox, -oy); ctx.restore();
}
function needle(ctx, [cx, cy, r], frac, start, sweep, col) {
  const a = (start + clamp(frac, 0, 1) * sweep) * Math.PI / 180;
  line(ctx, cx, cy, cx + Math.cos(a) * (r - 2), cy + Math.sin(a) * (r - 2), col);
  line(ctx, cx, cy, cx - Math.cos(a) * 3, cy - Math.sin(a) * 3, col);
  rect(ctx, cx - 1, cy - 1, 3, 3, '#3a3a3a'); px(ctx, cx - 1, cy - 1, '#8a8a8a');
}

// Steering wheel: a flat ellipse seen from above. The rim doesn't change when it turns;
// the spokes, grips and hands slide around it.
// wipers: [pivot x, pivot y, length] for each vehicle; they sweep when it rains
export const WIPERS = { bus: [[70, DASH_Y - 1, 152], [320, DASH_Y - 1, 74]], car: [[130, 185, 126], [246, 185, 140]] };
// (the car's pivots sit at the foot of the windscreen, just under the dash lip: they're drawn on
// the cab layer over the hood, then the dashboard goes back over their bases)
// drawn on the view before the cab goes over it, so the dashboard hides their bottom ends
// A little TV/VCR combo sitting on the dash, rabbit ears and all. While a tape plays, the
// YouTube player sits over the screen (see vhs.js); otherwise the screen is dark glass.
function drawTV(ctx, sc, on, t) {
  const x = sc.x - 6, y = sc.y - 6, w = sc.w + 12, h = sc.h + 18;
  line(ctx, x + w / 2 - 4, y, x + w / 2 - 20, y - 22, '#2a2a2a', 1);
  line(ctx, x + w / 2 + 4, y, x + w / 2 + 22, y - 18, '#2a2a2a', 1);
  rect(ctx, x + w / 2 - 6, y - 3, 12, 4, '#202022');
  rect(ctx, x, y, w, h, '#2c2b2e'); rect(ctx, x, y, w, 1, '#4a494e'); rect(ctx, x, y + h - 1, w, 1, '#141416');
  rect(ctx, x + 2, y + 2, w - 4, sc.h + 8, '#18181a');
  // screen with rounded corners
  rect(ctx, sc.x, sc.y, sc.w, sc.h, on ? '#000' : '#1e2522');
  for (const [cx, cy] of [[sc.x, sc.y], [sc.x + sc.w - 2, sc.y], [sc.x, sc.y + sc.h - 2], [sc.x + sc.w - 2, sc.y + sc.h - 2]]) rect(ctx, cx, cy, 2, 2, '#18181a');
  if (!on) {
    // switched off: dark curved glass with a soft reflection
    rect(ctx, sc.x + 2, sc.y + 2, sc.w - 4, sc.h - 4, '#222a27');
    rect(ctx, sc.x + 5, sc.y + 4, 18, 2, 'rgba(255,255,255,0.10)'); rect(ctx, sc.x + 5, sc.y + 6, 9, 2, 'rgba(255,255,255,0.06)');
    rect(ctx, sc.x + 4, sc.y + 4, 2, 12, 'rgba(255,255,255,0.05)');
    rect(ctx, sc.x + sc.w - 14, sc.y + sc.h - 7, 9, 2, 'rgba(255,255,255,0.04)');
  }
  // the VCR slot, the label and the power light underneath
  const by = sc.y + sc.h + 4;
  rect(ctx, x + 6, by + 2, 26, 3, '#0a0a0a'); rect(ctx, x + 6, by + 1, 26, 1, '#3c3b40');
  drawText(ctx, 'VHS', x + w - 18, by, '#8a8a90', 1, 'center');
  rect(ctx, x + w - 7, by + 2, 3, 3, on ? (Math.floor(t * 2) % 4 ? '#5aff5a' : '#2a8a2a') : '#7a2020');
}
function tvGlow(ctx, sc, sky, t) {
  if (sky.night < 0.2) return;
  const flick = 0.75 + 0.25 * Math.sin(t * 7) * Math.sin(t * 2.3);
  const cx = sc.x + sc.w / 2, cy = sc.y + sc.h / 2;
  const g = ctx.createRadialGradient(cx, cy, 4, cx, cy, 90);
  g.addColorStop(0, `rgba(120,150,255,${0.22 * sky.night * flick})`); g.addColorStop(1, 'rgba(120,150,255,0)');
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g; ctx.fillRect(cx - 90, cy - 90, 180, 180);
  ctx.globalCompositeOperation = 'source-over';
}
export function drawWipers(ctx, pivots, w, thick = 2) {
  const a = wAng(w);
  for (const [px0, py0, len] of pivots) {
    const ex = px0 + Math.cos(a) * len, ey = py0 + Math.sin(a) * len;
    line(ctx, px0, py0, ex, ey, '#121212', thick);
    // the rubber blade along the outer part of the arm
    const bx = px0 + Math.cos(a) * len * 0.3, by = py0 + Math.sin(a) * len * 0.3;
    line(ctx, bx + 1, by + 1, ex + 1, ey + 1, '#2a2a2a', 1);
    rect(ctx, px0 - 2, py0 - 2, 5, 4, '#1a1a1a');
  }
}
// Where a hand goes when it leaves the wheel: the radio's tuning knob, and the TV's tape slot.
const REACH = {
  bus: { radio: { x: 106, y: 207, side: -1 }, tape: { x: 331, y: 186, side: 1, slot: 170 } },
  car: { radio: { x: 368, y: 212, side: 1 }, tape: { x: 389, y: 194, side: 1, slot: 178 } },
};
const ease = u => u * u * (3 - 2 * u);
// a black VHS cassette: label, two reels behind the window
function cassette(ctx, x, y, h = 15) {
  if (h < 1) return;
  const w = 26; x = Math.round(x); y = Math.round(y); h = Math.round(h);
  // a light edge so it shows up against the dark TV
  rect(ctx, x - 1, y - 1, w + 2, h + 1, '#6a6a70');
  rect(ctx, x, y, w, h, '#0c0c0e');
  if (h >= 4) { rect(ctx, x + 3, y + 1, w - 6, Math.min(4, h - 2), '#e8e2cc'); rect(ctx, x + 4, y + 2, 9, 1, '#c0202a'); }
  if (h >= 10) { rect(ctx, x + 7, y + h - 5, 12, 3, '#3a3a40'); px(ctx, x + 9, y + h - 4, '#8a8a90'); px(ctx, x + 16, y + h - 4, '#8a8a90'); }
}
// Both hands on the wheel, except when one is off putting a tape in or tuning the radio:
// it reaches over in an arc, does its thing, and comes back.
function drawHands(ctx, game, geo, elbows, cab, wa) {
  const hand = game.hand, R = hand && REACH[cab][hand.kind];
  for (const side of [-1, 1]) {
    const a = -Math.PI / 2 + side * 1.0 + wa * 0.6;
    let hx = geo.cx + Math.cos(a) * (geo.rx - 4), hy = geo.cy + Math.sin(a) * (geo.ry - 4);
    let tape = null;
    if (R && R.side === side) {
      const u = Math.min(1, hand.t / hand.dur);
      // out (0-35%), at it (35-65%), back (65-100%)
      const e = u < 0.35 ? ease(u / 0.35) : u < 0.65 ? 1 : ease((1 - u) / 0.35);
      const lift = Math.sin(e * Math.PI) * 16;
      hx += (R.x - hx) * e; hy += (R.y - hy) * e - lift;
      if (hand.kind === 'radio' && u >= 0.35 && u < 0.65) hx += Math.sin((u - 0.35) * 60) * 1.5;   // a twist of the knob
      if (hand.kind === 'tape') {
        // the cassette is held up in the fingers, then slides into the slot
        // held in the fingertips on the way over, then pushed into the slot until it's gone
        if (u < 0.35) tape = { x: hx - 13, y: hy - 25, h: 15 };
        else if (u < 0.5) { const h = 15 * (1 - (u - 0.35) / 0.15); tape = { x: R.x - 13, y: R.slot + 2 - h, h }; }
      }
    }
    drawArm(ctx, hx, hy + 26, side < 0 ? elbows[0] : elbows[1], 360, side < 0);
    ctx.drawImage(side < 0 ? handL : handR, Math.round(hx - 24), Math.round(hy - 12));
    if (tape) cassette(ctx, tape.x, tape.y, tape.h);
  }
}
function drawWheel(ctx, ang, geo = WH, badge = 'PDC') {
  const { cx, cy, rx, ry, t } = geo;
  for (let yy = Math.floor(cy - ry - 1); yy < H; yy++) for (let xx = cx - rx - 2; xx <= cx + rx + 2; xx++) {
    const dx = xx - cx, dy = yy - cy;
    const o = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    const i = (dx * dx) / ((rx - t) ** 2) + (dy * dy) / ((ry - t * 0.8) ** 2);
    if (o > 1 || i < 1) continue;
    const a = Math.atan2(dy / ry, dx / rx);
    const edge = o > 0.93 ? 0 : i < 1.08 ? 2 : 1;
    let c = ['#141210', '#2c2826', '#1e1b19'][edge];
    if (a < -0.6 && a > -2.6 && edge === 1 && bayer(xx, yy) < 0.5 + Math.sin(a * 2) * 0.2) c = '#423c37';
    if (a < -1.2 && a > -2.1 && edge === 1 && o > 0.75 && o < 0.86) c = '#5e5650';
    const g = (((a - ang) * 180 / Math.PI) % 12 + 12) % 12; if (edge === 1 && g < 1.5) c = '#121010';
    ctx.fillStyle = c; ctx.fillRect(xx, yy, 1, 1);
  }
  // spokes and hub
  for (const s of [Math.PI, 0, Math.PI / 2]) {
    const a = s + ang;
    const ex = cx + Math.cos(a) * (rx - t), ey = cy + Math.sin(a) * (ry - t * 0.8);
    line(ctx, cx + Math.cos(a) * 20, cy + Math.sin(a) * 9, ex, ey, '#24201e', 7);
    line(ctx, cx + Math.cos(a) * 20, cy + Math.sin(a) * 9 - 3, ex, ey - 3, '#3a3531');
  }
  ellipse(ctx, cx, cy, 26, 12, '#1a1816'); ellipse(ctx, cx, cy, 23, 10, '#2e2a27');
  ellipse(ctx, cx, cy - 1, 15, 6, '#3a3632');
  drawText(ctx, badge, cx, cy - 6, '#c8a050', 1, 'center');
}

function mirrorGlass(ctx, [mx, my, mw, mh], sky, flip) {
  ctx.fillStyle = css(lerpC(sky.top, sky.bottom, 0.6)); ctx.fillRect(mx, my, mw, mh * 0.45);
  ctx.fillStyle = css(lerpC(sky.bottom, [120, 110, 90], 0.5)); ctx.fillRect(mx, my + mh * 0.45, mw, mh * 0.55);
  // the side of our own bus and the road behind
  const bx = flip ? mx : mx + mw - 10;
  ctx.fillStyle = '#5a5a60'; ctx.fillRect(bx, my, 10, mh);
  ctx.fillStyle = '#c8c8c8'; ctx.fillRect(bx + (flip ? 9 : 0), my, 1, mh);
  ctx.fillStyle = '#4a4a50';
  ctx.beginPath(); ctx.moveTo(mx + mw / 2 - 2, my + mh * 0.45); ctx.lineTo(mx + mw / 2 + 2, my + mh * 0.45);
  ctx.lineTo(flip ? mx + mw : mx + mw - 4, my + mh); ctx.lineTo(flip ? mx + 4 : mx, my + mh); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(mx + 2, my + 2, 3, mh - 4);
}

export function renderCockpit(main, game, sky, t) {
  if (game.mode === 'car') return renderCarCockpit(main, game, sky, t);
  const ctx = lctx;
  const p = game.player;
  ctx.clearRect(0, 0, W, H);
  mirrorGlass(ctx, MIRL, sky, false); mirrorGlass(ctx, MIRR, sky, true);
  ctx.drawImage(base, 0, 0);

  const truck = game.mode === 'truck';
  if (truck) {
    // the mirror shows the sleeper berth curtain behind you
    rect(ctx, 196, 19, 88, 18, '#0e0e0e'); rect(ctx, 198, 20, 84, 15, '#6a2a2a');
    for (let k = 0; k < 84; k += 6) rect(ctx, 198 + k, 20, 2, 15, '#5a2222');
    rect(ctx, 198, 20, 84, 2, '#8a8a8a');
  } else {
  // interior mirror with passengers
  rect(ctx, 196, 19, 88, 18, '#0e0e0e'); rect(ctx, 198, 20, 84, 15, '#5a544c');
  rect(ctx, 198, 20, 84, 4, '#7a746a');
  rect(ctx, 234, 24, 12, 11, '#3a3632'); rect(ctx, 235, 21, 10, 4, css(lerpC(sky.bottom, [200, 220, 230], 0.3)));
  const heads = ['#3a2a1a', '#e8c890', '#6a4a32', '#9a9a9a', '#c87a3a', '#1a1a1a', '#d8a070'];
  let n = 0;
  const shown = Math.round(game.passengers / 40 * 16);
  for (let row = 0; row < 4; row++) {
    const y = 31 - row * 3, sz = 6 - row;
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
      const sx = side < 0 ? 232 - (k + 1) * (sz + 2) - row * 2 : 248 + k * (sz + 2) + row * 2;
      rect(ctx, sx, y, sz + 1, 4, '#2a4a8a'); rect(ctx, sx, y, sz + 1, 1, '#4a6aaa');
      if (n < shown || (game.passengers > 0 && n === 0)) rect(ctx, sx + 1, y - 2, Math.max(2, sz - 1), 3, heads[n % heads.length]);
      n++;
    }
  }
  rect(ctx, 198, 20, 84, 1, '#a8a298');
  }

  if (truck) {
    // a truck cab, not a bus: company plate, a cab door with a side window, parking brake knob
    rect(ctx, 152, 2, 176, 10, '#1e1e1e');
    drawText(ctx, 'DESERT FREIGHT CO.', 240, 4, '#8a6a3a', 1, 'center');
    ctx.clearRect(444, 23, 7, 133);
    rect(ctx, 412, 17, 68, 12, '#3a3a40'); rect(ctx, 412, 100, 68, 56, '#3a3a40');
    rect(ctx, 412, 17, 6, 139, '#2c2c30'); rect(ctx, 474, 17, 6, 139, '#2c2c30');
    rect(ctx, 418, 29, 56, 2, '#1c1c1e'); rect(ctx, 418, 98, 56, 2, '#1c1c1e');
    rect(ctx, 424, 112, 30, 6, '#26262a'); rect(ctx, 426, 113, 12, 3, '#8a8a90');   // door handle
    rect(ctx, 360, 246, 28, 12, '#1c1a18');
    poly(ctx, [366, 252, 371, 247, 376, 252, 371, 257], '#e8c020');
    drawText(ctx, 'P', 371, 250, '#111', 1, 'center');
  }
  // fuzzy dice
  const sw = game.diceSwing;
  const dx = 240 + Math.sin(sw) * 14, dy = 36 + Math.cos(sw) * 16;
  line(ctx, 240, 36, dx, dy, '#e8e8e8');
  for (const [ox, oy, col] of [[-4, 0, '#e85aa0'], [1, 3, '#f4f4f4']]) {
    const bx = dx + ox, by = dy + oy;
    rect(ctx, bx - 3, by, 7, 7, col); rect(ctx, bx - 3, by + 6, 7, 1, shade(col, -0.3));
    for (let i = 0; i < 6; i++) px(ctx, bx - 4 + ((i * 5) % 9), by - 1 + ((i * 3) % 9), col);
    const dot = col === '#f4f4f4' ? '#111' : '#fff';
    px(ctx, bx, by + 3, dot); px(ctx, bx - 2, by + 1, dot);
  }

  // desk fan, blades spinning
  const [fx, fy, fr] = FAN;
  circle(ctx, fx, fy, fr + 1, '#2a3a4a');
  circle(ctx, fx, fy, fr, 'rgba(160,190,210,0.25)');
  for (let k = 0; k < 3; k++) {
    const a = t * 22 + k * 2.09;
    ctx.fillStyle = 'rgba(70,100,130,0.55)';
    ctx.beginPath(); ctx.moveTo(fx, fy);
    ctx.lineTo(fx + Math.cos(a) * fr, fy + Math.sin(a) * fr); ctx.lineTo(fx + Math.cos(a + 0.6) * fr, fy + Math.sin(a + 0.6) * fr); ctx.fill();
  }
  for (let a = 0; a < 6.28; a += 0.5) line(ctx, fx, fy, fx + Math.cos(a) * fr, fy + Math.sin(a) * fr, 'rgba(30,40,50,0.5)');
  circle(ctx, fx, fy, 3, '#4a6a8a');

  // steering wheel, arms and hands
  const wa = p.wheel * 0.85;
  drawWheel(ctx, wa, WH, truck ? 'DF' : 'PDC');
  drawTV(ctx, TV_SCREEN.bus, game.tvOn, t);
  drawSouvenirs(ctx, game.career, 'bus', TV_SCREEN.bus, (game.diceSwing || 0) * 3);
  drawHands(ctx, game, WH, [40, 380], 'bus', wa);
  // night: darken the cab before drawing anything that glows
  const tintA = sky.tintA * 0.92;
  if (tintA > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = css(sky.tint.map(v => v * 0.6), tintA);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (game.tvOn) tvGlow(ctx, game.mode === 'car' ? TV_SCREEN.car : TV_SCREEN.bus, sky, t);
  const glow = 0.35 + sky.night * 0.65;
  if (sky.night > 0.1) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(40,90,60,${sky.night * 0.35})`;
    for (const g of Object.values(G)) { ctx.beginPath(); ctx.arc(g[0], g[1], g[2], 0, 6.29); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  }

  // needles
  needle(ctx, G.speed, Math.abs(p.speed) / 80, 135, 270, '#ff6a2a');
  needle(ctx, G.tach, game.audio.rpm || 0.15, 135, 270, '#ff6a2a');
  needle(ctx, G.air, 0.8 - (game.airDrop || 0), 180, 180, '#ffb040');
  needle(ctx, G.oil, 0.35 + p.throttle * 0.25 + Math.min(0.2, Math.abs(p.speed) / 300), 180, 180, '#ffb040');
  needle(ctx, G.fuel, p.fuel, 180, 180, '#ffb040');
  needle(ctx, G.temp, 0.5, 180, 180, '#ffb040');
  drawText(ctx, String(Math.floor(game.odometer || 0)).padStart(5, '0'), 190.5, 198, '#e8e8e0', 1, 'center');

  // warning lamps along the bottom of the cluster
  const lamps = [
    ['C', p.cruise, '#5aff5a'], ['=', game.lightsOn, '#5a9aff'], ['F', p.fuel < 0.18 && Math.floor(t * 2) % 2 === 0, '#ffb030'],
    ['D', game.doorsOpen, '#ff4a3a'], ['!', game.doorsOpen || game.fueling, '#ff4a3a'],
  ];
  lamps.forEach(([ch, on, col], i) => {
    const lx = 158 + i * 22, ly = 207;
    rect(ctx, lx, ly, 9, 8, '#050505'); rect(ctx, lx + 1, ly + 1, 7, 6, on ? col : '#1c1c1c');
    drawText(ctx, ch, lx + 4.5, ly + 1.5, on ? '#111' : '#3a3a3a', 1, 'center');
  });

  // radio display
  drawText(ctx, game.audio.radioLabel(), 59, 199, `rgba(255,170,60,${glow})`, 1, 'center');
  const lcd = `rgba(125,255,122,${0.55 + glow * 0.45})`;
  if (truck) {
    // trip computer: the load, where it goes and when it's due
    drawText(ctx, timeStr(game.clock), 314, 196, lcd, 2);
    drawText(ctx, `${Math.round(game.cargo)}%`, 404, 196, game.cargo > 60 ? lcd : '#ff8a6a', 1, 'right');
    drawText(ctx, game.load.cargo.slice(0, 14), 314, 210, lcd);
    drawText(ctx, NODES[game.dest].name.slice(0, 14), 314, 217, lcd);
    const left = Math.round((game.deadline - game.clock) / 60);
    drawText(ctx, `DUE ${timeStr(game.deadline)}`, 314, 226, left < 0 ? '#ff8a6a' : lcd);
    drawText(ctx, `${(game.milesLeft ?? game.milesToDest()).toFixed(0)} MI`, 404, 226, lcd, 1, 'right');
    main.drawImage(layer, 0, 0);
    return;
  }
  // door lever + lamp
  const open = game.doorsOpen;
  line(ctx, 390, 264, open ? 400 : 380, 254, '#c8c8c8', 2); circle(ctx, open ? 400 : 380, 254, 2, '#c02020');
  rect(ctx, 396, 249, 5, 4, open ? '#ff4a3a' : '#2a1010');

  // destination LCD
  drawText(ctx, timeStr(game.clock), 314, 196, lcd, 2);
  drawText(ctx, `PAX ${String(game.passengers).padStart(2, '0')}`, 404, 196, lcd, 1, 'right');
  drawText(ctx, game.comfort > 70 ? ':)' : game.comfort > 40 ? ':|' : ':(', 404, 203, lcd, 1, 'right');
  const ns = game.nextStop();
  if (ns) {
    drawText(ctx, 'NEXT STOP', 314, 210, lcd);
    drawText(ctx, ns.name, 314, 217, lcd);
    const dist = game.distTo(ns.idx);
    drawText(ctx, ns.arr ? `DUE ${timeStr(ns.arr)}` : `DEP ${timeStr(ns.dep)}`, 314, 226, lcd);
    drawText(ctx, `${dist.toFixed(1)} MI`, 404, 226, lcd, 1, 'right');
  }
  main.drawImage(layer, 0, 0);
}

// ======================= RENTAL CAR CAB =======================
const CAR_DASH = 182;
const CWH = { cx: 206, cy: 280, rx: 78, ry: 46, t: 9 };
const CG = { speed: [184, 208, 20], tach: [238, 208, 16], fuel: [156, 226, 7], temp: [266, 226, 7] };
let carBase;

function buildCarBase() {
  const [c, x] = makeCanvas(W, H);
  const r = mulberry(8);
  ditherV(x, 0, 0, W, 15, ['#8a8478', '#6a655c', '#4a463f']);
  rect(x, 0, 14, W, 1, '#2a2622');
  poly(x, [0, 0, 48, 0, 18, CAR_DASH, 0, CAR_DASH], '#3a3a40'); line(x, 47, 0, 17, CAR_DASH, '#5a5a62');
  poly(x, [432, 0, W, 0, W, CAR_DASH, 462, CAR_DASH], '#3a3a40'); line(x, 433, 0, 463, CAR_DASH, '#5a5a62');
  poly(x, [50, 14, 170, 14, 166, 30, 54, 30], '#7a7268'); rect(x, 56, 28, 108, 1, '#5a544c');
  rect(x, 238, 13, 4, 6, '#222');
  // hood of the rental, beige like every rental in 1994
  poly(x, [24, CAR_DASH, 120, 160, 360, 160, 456, CAR_DASH], '#b8a27c');
  poly(x, [120, 160, 360, 160, 366, 163, 114, 163], '#d8c8a4');
  poly(x, [150, 166, 330, 166, 336, 170, 144, 170], 'rgba(255,255,255,0.12)');
  rect(x, 238, 157, 4, 4, '#c8c8c8');
  // bugs on the glass
  for (let i = 0; i < 6; i++) { const bx = 60 + r() * 360, by = 40 + r() * 100; x.fillStyle = 'rgba(80,70,30,0.7)'; x.fillRect(bx, by, 2, 1); }
  // dashboard
  rect(x, 0, CAR_DASH, W, 8, '#4c505a'); rect(x, 0, CAR_DASH, W, 1, '#6c707a');
  ditherV(x, 0, CAR_DASH + 8, W, H - CAR_DASH - 8, ['#40444e', '#33363e', '#24262c']);
  for (let i = 0; i < 600; i++) px(x, r() * W, CAR_DASH + 9 + r() * 80, r() < 0.5 ? '#464a54' : '#2a2c32');
  // binnacle
  poly(x, [140, 192, 150, 184, 276, 184, 286, 192], '#2a2c32');
  rect(x, 146, 190, 134, 44, '#121316'); rect(x, 146, 190, 134, 1, '#2a2c32');
  gaugeFace(x, CG.speed, { start: 135, sweep: 270, ticks: 20, major: 4, nums: [0, 20, 40, 60, 80, 100], red: 0.86, label: 'MPH' });
  gaugeFace(x, CG.tach, { start: 135, sweep: 270, ticks: 12, major: 2, nums: [0, 1, 2, 3, 4, 5, 6], red: 0.8, label: 'RPM' });
  gaugeFace(x, CG.fuel, { start: 180, sweep: 180, ticks: 4 });
  gaugeFace(x, CG.temp, { start: 180, sweep: 180, ticks: 4, red: 0.8 });
  drawText(x, 'F', 156, 216, '#7a7a74', 1, 'center'); drawText(x, 'T', 266, 216, '#7a7a74', 1, 'center');
  // vents, radio, climate
  for (const [vx, vy, vw] of [[20, 192, 50], [300, 188, 86], [410, 192, 50]]) { rect(x, vx, vy, vw, 10, '#16171a'); for (let k = vy + 2; k < vy + 10; k += 2) rect(x, vx + 1, k, vw - 2, 1, '#3a3c44'); }
  rect(x, 304, 202, 80, 24, '#16171a'); rect(x, 305, 203, 78, 22, '#2a2c32'); rect(x, 305, 203, 78, 1, '#5a5c64');
  rect(x, 312, 206, 46, 8, '#08100a'); rect(x, 312, 217, 46, 3, '#0a0a0a'); 
  circle(x, 368, 210, 4, '#4a4c54'); circle(x, 368, 210, 2, '#8a8c94');
  for (let i = 0; i < 3; i++) { circle(x, 318 + i * 26, 236, 6, '#16171a'); circle(x, 318 + i * 26, 236, 4, '#4a4c54'); px(x, 318 + i * 26, 232, '#e84a3a'); }
  drawText(x, 'FAN   TEMP   VENT', 344, 245, '#6a6c74', 1, 'center');
  // glovebox and a can of soda in the cup holder
  rect(x, 398, 208, 72, 32, '#2e3036'); rect(x, 398, 208, 72, 1, '#4a4c54'); rect(x, 426, 214, 16, 3, '#6a6c74');
  rect(x, 318, 252, 10, 14, '#c82a2a'); rect(x, 318, 252, 10, 2, '#d8d8d8'); rect(x, 320, 256, 2, 8, '#e84a4a');
  // folded paper map lying on the dash
  poly(x, [380, CAR_DASH - 1, 386, CAR_DASH - 9, 440, CAR_DASH - 9, 436, CAR_DASH - 1], '#efe6cc');
  for (const fx of [398, 416]) line(x, fx, CAR_DASH - 9, fx - 2, CAR_DASH - 1, '#b8ac90');
  line(x, 392, CAR_DASH - 6, 428, CAR_DASH - 4, '#d8382e');
  ditherV(x, 186, 250, 40, 20, ['#2a2c32', '#141518']);
  return c;
}

function renderCarCockpit(main, game, sky, t) {
  const ctx = lctx;
  const p = game.player;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(carBase, 0, 0);
  if (game.weather) {
    drawWipers(ctx, WIPERS.car, game.weather.wiper, 3);
    ctx.drawImage(carBase, 0, CAR_DASH, W, H - CAR_DASH, 0, CAR_DASH, W, H - CAR_DASH);
  }
  // rear-view mirror: back window and empty back seat
  rect(ctx, 196, 18, 88, 18, '#0e0e0e'); rect(ctx, 198, 19, 84, 15, css(lerpC(sky.top, sky.bottom, 0.6)));
  rect(ctx, 198, 28, 84, 6, '#5a5048'); rect(ctx, 204, 26, 30, 4, '#6a6058'); rect(ctx, 246, 26, 30, 4, '#6a6058');
  rect(ctx, 198, 19, 84, 1, '#a8a298');
  // pine-tree air freshener swinging from the mirror
  const sw = game.diceSwing;
  const fx = 236 + Math.sin(sw) * 10, fy = 36 + Math.cos(sw) * 12;
  line(ctx, 236, 36, fx, fy, '#e8e8e8');
  for (let k = 0; k < 4; k++) rect(ctx, fx - 1 - k, fy + 1 + k * 3, 3 + k * 2, 3, k % 2 ? '#2a8a3a' : '#3aa84a');
  rect(ctx, fx, fy + 13, 1, 2, '#6a4a2a');
  // wheel, arms, hands
  const wa = p.wheel * 0.85;
  drawWheel(ctx, wa, CWH);
  rect(ctx, CWH.cx - 14, CWH.cy - 10, 28, 9, '#2a2826'); drawText(ctx, 'SRS', CWH.cx, CWH.cy - 8, '#5a5650', 1, 'center');
  drawTV(ctx, TV_SCREEN.car, game.tvOn, t);
  drawSouvenirs(ctx, game.career, 'car', TV_SCREEN.car, (game.diceSwing || 0) * 3);
  drawHands(ctx, game, CWH, [30, 380], 'car', wa);
  const tintA = sky.tintA * 0.92;
  if (tintA > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = css(sky.tint.map(v => v * 0.6), tintA);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  if (game.tvOn) tvGlow(ctx, game.mode === 'car' ? TV_SCREEN.car : TV_SCREEN.bus, sky, t);
  const glow = 0.35 + sky.night * 0.65;
  if (sky.night > 0.1) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(30,60,110,${sky.night * 0.4})`;
    for (const g of Object.values(CG)) { ctx.beginPath(); ctx.arc(g[0], g[1], g[2], 0, 6.29); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  }
  needle(ctx, CG.speed, Math.abs(p.speed) / 100, 135, 270, '#ff6a2a');
  needle(ctx, CG.tach, (game.audio.rpm || 0.15) * 0.9, 135, 270, '#ff6a2a');
  needle(ctx, CG.fuel, p.fuel, 180, 180, '#ffb040');
  needle(ctx, CG.temp, 0.45, 180, 180, '#ffb040');
  drawText(ctx, String(Math.floor(game.odometer)).padStart(6, '0'), 211, 224, '#e8e8e0', 1, 'center');
  const lamps = [['C', p.cruise, '#5aff5a'], ['=', game.lightsOn, '#5a9aff'], ['F', p.fuel < 0.15 && Math.floor(t * 2) % 2 === 0, '#ffb030']];
  lamps.forEach(([ch, on, col], i) => {
    const lx = 190 + i * 14, ly = 194;
    rect(ctx, lx, ly, 9, 7, '#050505'); rect(ctx, lx + 1, ly + 1, 7, 5, on ? col : '#1c1c1c');
    drawText(ctx, ch, lx + 4.5, ly + 1, on ? '#111' : '#3a3a3a', 1, 'center');
  });
  // radio display shows the station and the clock
  const amber = `rgba(255,170,60,${glow})`;
  drawText(ctx, game.audio.radioLabel(), 335, 207, amber, 1, 'center');
  drawText(ctx, timeStr(game.clock), 362, 197, `rgba(120,220,255,${glow})`, 1, 'center');
  // sticky note with the destination
  ctx.fillStyle = '#f4e46a'; ctx.fillRect(84, 194, 50, 28); ctx.fillStyle = '#e0cc4a'; ctx.fillRect(84, 194, 50, 3);
  drawText(ctx, 'RETURN TO', 109, 199, '#5a4a1a', 1, 'center');
  drawText(ctx, NODES[game.dest].name.slice(0, 12), 109, 206, '#1a1a6a', 1, 'center');
  drawText(ctx, `${(game.milesLeft ?? game.milesToDest()).toFixed(0)} MI`, 109, 214, '#c0202a', 1, 'center');
  main.drawImage(layer, 0, 0);
}
