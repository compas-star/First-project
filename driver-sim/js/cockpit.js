// The driver's cab of a 90s intercity coach, drawn at 480x270:
// split windshield, folding entry door, bus mirrors, gauge cluster, switch panel,
// CB radio, desk fan, flat bus steering wheel and big hairy forearms.
import { W, H } from './config.js';
import { makeCanvas, mulberry, rect, px, line, ellipse, circle, poly, shade, clamp, timeStr, css, ditherV, bayer, hex, lerpC } from './gfx.js';
import { drawText } from './font.js';

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
  // ---- wipers parked at the bottom ----
  line(x, 70, DASH_Y - 1, 220, DASH_Y - 9, '#121212', 2); line(x, 220, DASH_Y - 9, 226, DASH_Y - 10, '#2a2a2a');
  line(x, 320, DASH_Y - 1, 392, DASH_Y - 7, '#121212', 2);
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
const HAIR = '#2a180e', HAIR2 = '#4a2e1c';
function buildHand(flip) {
  const [c, x] = makeCanvas(40, 34);
  const r = mulberry(flip ? 31 : 32);
  const sh = (xx, yy, k) => px(x, flip ? 39 - xx : xx, yy, SK[k]);
  // back of the hand
  for (let yy = 10; yy < 34; yy++) for (let xx = 3; xx < 37; xx++) {
    const dx = (xx - 20) / 17, dy = (yy - 21) / 13;
    if (dx * dx + dy * dy > 1) continue;
    sh(xx, yy, dx < -0.55 ? 0 : dx < 0 ? 1 : dx < 0.6 ? 2 : 3);
  }
  // four fingers curled over the rim
  for (let f = 0; f < 4; f++) {
    const fx = 5 + f * 8;
    for (let yy = 1; yy < 15; yy++) for (let xx = 0; xx < 8; xx++) {
      if ((yy < 3 && (xx < 2 || xx > 5)) || (yy < 2 && (xx < 3 || xx > 4))) continue;
      sh(fx + xx, yy, xx < 2 ? 0 : xx < 5 ? 1 : xx < 7 ? 2 : 4);
    }
    sh(fx + 2, 9, 0); sh(fx + 3, 9, 0); sh(fx + 4, 9, 1); // knuckle highlight
    for (let yy = 11; yy < 15; yy++) sh(fx + 7, yy, 4);   // gap between fingers
  }
  // thumb wrapping around the inner side
  for (let yy = 12; yy < 28; yy++) for (let xx = 32; xx < 39; xx++) {
    if ((xx - 35) ** 2 / 12 + (yy - 20) ** 2 / 70 > 1) continue;
    sh(xx, yy, xx < 34 ? 1 : xx < 37 ? 2 : 3);
  }
  // hair on the back of the hand and the first finger joints
  for (let i = 0; i < 70; i++) {
    const xx = 6 + r() * 26, yy = 12 + r() * 20;
    const xa = flip ? 39 - xx : xx;
    line(x, xa, yy, xa + (r() - 0.5) * 3, yy + 1 + r() * 2, r() < 0.75 ? HAIR : HAIR2);
  }
  for (let i = 0; i < 14; i++) { const xx = 6 + r() * 28, xa = flip ? 39 - xx : xx; px(x, xa, 6 + r() * 4, HAIR); }
  // outline
  const img = x.getImageData(0, 0, 40, 34), d = img.data, out = new Uint8ClampedArray(d);
  const o = hex(SK[4]);
  for (let yy = 0; yy < 34; yy++) for (let xx = 0; xx < 40; xx++) {
    const i = (yy * 40 + xx) * 4;
    if (d[i + 3]) continue;
    const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([a, b]) => { const X = xx + a, Y = yy + b; return X >= 0 && X < 40 && Y >= 0 && Y < 34 && d[(Y * 40 + X) * 4 + 3]; });
    if (nb) { out[i] = o[0] * 0.6; out[i + 1] = o[1] * 0.6; out[i + 2] = o[2] * 0.6; out[i + 3] = 255; }
  }
  img.data.set(out); x.putImageData(img, 0, 0);
  return c;
}
function buildArm(watch) {
  const AW = 34, AL = 160;
  const [c, x] = makeCanvas(AW, AL);
  const r = mulberry(watch ? 41 : 42);
  for (let yy = 0; yy < 112; yy++) for (let xx = 0; xx < AW; xx++) {
    const f = xx / (AW - 1);
    const k = f < 0.08 ? 4 : f < 0.25 ? 3 : f < 0.5 ? 2 : f < 0.75 ? 1 : f < 0.9 ? 0 : 3;
    px(x, xx, yy, SK[k]);
  }
  for (let i = 0; i < 520; i++) {
    const xx = 2 + r() * (AW - 4), yy = r() * 108;
    line(x, xx, yy, xx + (r() - 0.5) * 3, yy + 2 + r() * 2, r() < 0.7 ? HAIR : HAIR2);
  }
  if (watch) { // cheap digital wristwatch
    rect(x, 0, 10, AW, 9, '#1a1a1a'); rect(x, 0, 10, AW, 1, '#3a3a3a');
    rect(x, 9, 8, 16, 13, '#6a6a70'); rect(x, 10, 9, 14, 11, '#9aa08a');
    rect(x, 11, 12, 12, 5, '#4a5a3a'); rect(x, 10, 9, 14, 1, '#c8c8d0');
  }
  // rolled-up red flannel sleeve
  for (let yy = 108; yy < AL; yy++) for (let xx = 0; xx < AW; xx++) {
    let col = ((Math.floor(xx / 5) + Math.floor(yy / 5)) % 2) ? '#a8302c' : '#7a1c1a';
    if (xx % 10 === 0 || yy % 10 === 0) col = '#2a0c0c';
    if ((xx + 3) % 10 === 0 || (yy + 3) % 10 === 0) col = '#d8b84a';
    const f = xx / (AW - 1);
    if (f < 0.15) col = shade(col, -0.35); else if (f > 0.7 && f < 0.85) col = shade(col, 0.15);
    if (yy < 118) col = shade(col, yy < 110 ? 0.25 : 0.1);
    px(x, xx, yy, col);
  }
  rect(x, 0, 117, AW, 1, '#3a1010');
  return c;
}

export function initCockpit() {
  base = buildBase();
  handL = buildHand(false); handR = buildHand(true);
  armL = buildArm(true); armR = buildArm(false);
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
function drawWheel(ctx, ang) {
  const { cx, cy, rx, ry, t } = WH;
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
  drawText(ctx, 'PDC', cx, cy - 6, '#c8a050', 1, 'center');
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
  const ctx = lctx;
  const p = game.player;
  ctx.clearRect(0, 0, W, H);
  mirrorGlass(ctx, MIRL, sky, false); mirrorGlass(ctx, MIRR, sky, true);
  ctx.drawImage(base, 0, 0);

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
  const wa = p.wheel * 1.6;
  drawWheel(ctx, wa);
  for (const side of [-1, 1]) {
    const a = -Math.PI / 2 + side * 1.05 + wa;
    const hx = WH.cx + Math.cos(a) * (WH.rx - 4), hy = WH.cy + Math.sin(a) * (WH.ry - 4);
    const ex = side < 0 ? 70 : 350, ey = 360;
    const armA = Math.atan2(ey - hy, ex - hx);
    drawRotated(ctx, side < 0 ? armL : armR, hx + Math.cos(armA) * 10, hy + Math.sin(armA) * 10, armA - Math.PI / 2, 17, 0);
    drawRotated(ctx, side < 0 ? handL : handR, hx, hy, (armA - Math.PI / 2) * 0.5, 20, 12);
  }

  // night: darken the cab before drawing anything that glows
  const tintA = sky.tintA * 0.92;
  if (tintA > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = css(sky.tint.map(v => v * 0.6), tintA);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  const glow = 0.35 + sky.night * 0.65;
  if (sky.night > 0.1) {
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = `rgba(40,90,60,${sky.night * 0.35})`;
    for (const g of Object.values(G)) { ctx.beginPath(); ctx.arc(g[0], g[1], g[2], 0, 6.29); ctx.fill(); }
    ctx.globalCompositeOperation = 'source-over';
  }

  // needles
  needle(ctx, G.speed, p.speed / 80, 135, 270, '#ff6a2a');
  needle(ctx, G.tach, game.audio.rpm || 0.15, 135, 270, '#ff6a2a');
  needle(ctx, G.air, 0.8 - (game.airDrop || 0), 180, 180, '#ffb040');
  needle(ctx, G.oil, 0.35 + p.throttle * 0.25 + Math.min(0.2, p.speed / 300), 180, 180, '#ffb040');
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
  // door lever + lamp
  const open = game.doorsOpen;
  line(ctx, 390, 264, open ? 400 : 380, 254, '#c8c8c8', 2); circle(ctx, open ? 400 : 380, 254, 2, '#c02020');
  rect(ctx, 396, 249, 5, 4, open ? '#ff4a3a' : '#2a1010');

  // destination LCD
  const lcd = `rgba(125,255,122,${0.55 + glow * 0.45})`;
  drawText(ctx, timeStr(game.clock), 314, 196, lcd, 2);
  drawText(ctx, `PAX ${String(game.passengers).padStart(2, '0')}`, 404, 196, lcd, 1, 'right');
  drawText(ctx, game.comfort > 70 ? ':)' : game.comfort > 40 ? ':|' : ':(', 404, 203, lcd, 1, 'right');
  const ns = game.nextStop();
  if (ns) {
    drawText(ctx, 'NEXT STOP', 314, 210, lcd);
    drawText(ctx, ns.name, 314, 217, lcd);
    const dist = Math.max(0, ns.mile - game.mile());
    drawText(ctx, ns.arr ? `DUE ${timeStr(ns.arr)}` : `DEP ${timeStr(ns.dep)}`, 314, 226, lcd);
    drawText(ctx, `${dist.toFixed(1)} MI`, 404, 226, lcd, 1, 'right');
  }
  main.drawImage(layer, 0, 0);
}
