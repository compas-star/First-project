// The driver's cab: dashboard, gauges, steering wheel and big hairy forearms.
import { W, H } from './config.js';
import { makeCanvas, mulberry, rect, px, line, ellipse, ring, circle, poly, shade, clamp, timeStr, css } from './gfx.js';
import { drawText } from './font.js';

const [layer, lctx] = makeCanvas(W, H);
let base, wheelImg, handL, handR, armImg;

const WHEEL_CX = 160, WHEEL_CY = 198, WHEEL_R = 64;
const SPEEDO = [141, 121, 12];
const FUEL = [181, 124, 9];

function buildBase() {
  const [c, x] = makeCanvas(W, H);
  const r = mulberry(3);
  // roof, pillars, visor
  rect(x, 0, 0, W, 6, '#24201d');
  poly(x, [0, 0, 13, 0, 5, 117, 0, 117], '#2c2723');
  poly(x, [W - 13, 0, W, 0, W, 117, W - 5, 117], '#2c2723');
  line(x, 12, 0, 4, 117, '#3d3631');
  line(x, W - 13, 0, W - 5, 117, '#3d3631');
  poly(x, [16, 6, 122, 6, 118, 16, 20, 16], '#6a5a48');
  rect(x, 20, 15, 98, 1, '#4a3e32'); for (let xx = 24; xx < 116; xx += 3) px(x, xx, 8, '#7d6b56');
  rect(x, 196, 6, 104, 3, '#5a4c3e');
  // wipers parked at the bottom of the glass
  line(x, 58, 115, 150, 109, '#141414'); line(x, 170, 115, 262, 109, '#141414');
  // dashboard
  rect(x, 0, 116, W, H - 116, '#37322e');
  rect(x, 0, 116, W, 1, '#5d554d'); rect(x, 0, 117, W, 2, '#2a2623');
  for (let i = 0; i < 400; i++) px(x, r() * W, 119 + r() * 60, r() < 0.5 ? '#3c3732' : '#322d29');
  // gauge hood
  poly(x, [110, 117, 116, 105, 204, 105, 210, 117], '#26221f');
  rect(x, 116, 105, 88, 1, '#4a433d');
  rect(x, 112, 108, 96, 30, '#1c1917');
  // speedometer face
  circle(x, SPEEDO[0], SPEEDO[1], SPEEDO[2] + 1, '#5a5a5a'); circle(x, SPEEDO[0], SPEEDO[1], SPEEDO[2], '#0d0d0d');
  for (let v = 0; v <= 80; v += 10) {
    const a = (150 + (v / 80) * 240) * Math.PI / 180;
    px(x, SPEEDO[0] + Math.cos(a) * (SPEEDO[2] - 1), SPEEDO[1] + Math.sin(a) * (SPEEDO[2] - 1), '#e8e8e0');
    if (v % 20 === 0) px(x, SPEEDO[0] + Math.cos(a) * (SPEEDO[2] - 2), SPEEDO[1] + Math.sin(a) * (SPEEDO[2] - 2), '#9a9a90');
  }
  drawText(x, 'MPH', SPEEDO[0], SPEEDO[1] + 4, '#6a6a64', 1, 'center');
  // fuel face
  circle(x, FUEL[0], FUEL[1], FUEL[2] + 1, '#5a5a5a'); circle(x, FUEL[0], FUEL[1], FUEL[2], '#0d0d0d');
  drawText(x, 'E', FUEL[0] - 7, FUEL[1] + 1, '#c84a3a'); drawText(x, 'F', FUEL[0] + 5, FUEL[1] + 1, '#e8e8e0');
  for (let k = 0; k <= 4; k++) { const a = Math.PI + (k / 4) * Math.PI; px(x, FUEL[0] + Math.cos(a) * 8, FUEL[1] + Math.sin(a) * 8, '#e8e8e0'); }
  // odometer window
  rect(x, 195, 110, 13, 8, '#0d0d0d');
  // radio
  rect(x, 14, 124, 72, 20, '#1c1a18'); rect(x, 14, 124, 72, 1, '#4a4440');
  rect(x, 18, 127, 44, 9, '#140c04');
  circle(x, 70, 133, 4, '#3a3632'); circle(x, 70, 133, 2, '#5a5652'); circle(x, 80, 133, 3, '#3a3632');
  for (let i = 0; i < 5; i++) rect(x, 18 + i * 9, 138, 7, 3, '#3a3632');
  // clipboard with the timetable
  poly(x, [24, 108, 60, 106, 62, 117, 22, 117], '#c8b48a');
  rect(x, 38, 105, 8, 3, '#8a8a8a');
  for (let i = 0; i < 4; i++) line(x, 27, 110 + i * 2, 57, 109 + i * 2, '#8a7a5a');
  // destination LCD
  rect(x, 224, 121, 92, 32, '#1a1816'); rect(x, 226, 123, 88, 28, '#0f2410');
  // lamp labels
  const lamps = [['CRUISE', 18], ['LIGHTS', 48], ['FUEL', 76]];
  for (const [t, lx] of lamps) { rect(x, lx, 150, 4, 3, '#1a1a1a'); drawText(x, t, lx + 2, 155, '#6a645c', 1, 'center'); }
  rect(x, 290, 156, 4, 3, '#1a1a1a'); drawText(x, 'DOOR', 292, 161, '#6a645c', 1, 'center');
  // coffee cup on the dash
  rect(x, 292, 104, 9, 12, '#e8e0d0'); rect(x, 291, 103, 11, 2, '#c84a3a'); rect(x, 301, 107, 2, 5, '#e8e0d0');
  rect(x, 292, 108, 9, 3, '#8a5a3a');
  // rear-view mirror mount
  rect(x, 158, 0, 4, 4, '#1a1a1a');
  return c;
}

function buildWheel() {
  const s = WHEEL_R * 2 + 12;
  const [c, x] = makeCanvas(s, s);
  const cx = s / 2, cy = s / 2;
  for (let yy = 0; yy < s; yy++) for (let xx = 0; xx < s; xx++) {
    const d = Math.hypot(xx + 0.5 - cx, yy + 0.5 - cy);
    if (d > WHEEL_R - 4 && d < WHEEL_R + 4) {
      const a = Math.atan2(yy - cy, xx - cx);
      let c = d > WHEEL_R + 1.5 ? '#1b1816' : d < WHEEL_R - 2 ? '#3e3833' : '#2b2724';
      if (Math.sin(a * 2 + 2.4) > 0.6 && d < WHEEL_R) c = '#4a433d';
      px(x, xx, yy, c);
    }
  }
  for (let a = 0; a < 360; a += 6) { const t = a * Math.PI / 180; px(x, cx + Math.cos(t) * WHEEL_R, cy + Math.sin(t) * WHEEL_R, '#141210'); }
  // spokes
  for (const a of [180, 0, 90]) {
    const t = a * Math.PI / 180;
    line(x, cx + Math.cos(t) * 12, cy + Math.sin(t) * 12, cx + Math.cos(t) * (WHEEL_R - 3), cy + Math.sin(t) * (WHEEL_R - 3), '#2b2724', 5);
  }
  circle(x, cx, cy, 14, '#2b2724'); circle(x, cx, cy, 9, '#45403a');
  drawText(x, 'PDC', cx, cy - 2, '#c8a050', 1, 'center');
  return c;
}

const SKIN = '#d39a74', SKIN_D = '#b07a56', SKIN_L = '#e6b38e', OUT = '#6a4030', HAIR = '#2e1c12';
function buildHand(flip) {
  const [c, x] = makeCanvas(24, 22);
  const r = mulberry(flip ? 11 : 12);
  ellipse(x, 12, 12, 10, 8, OUT); ellipse(x, 12, 12, 9, 7, SKIN);
  for (let i = 0; i < 4; i++) {
    const fx = 4 + i * 4;
    rect(x, fx, 3, 4, 6, OUT); rect(x, fx + 1, 4, 2, 5, SKIN_L); px(x, fx + 1, 4, '#f0c8a8');
  }
  rect(x, 4, 9, 16, 1, SKIN_D);
  const tx = flip ? 19 : 2;
  rect(x, tx, 8, 4, 8, OUT); rect(x, tx + 1, 9, 2, 6, SKIN);
  for (let i = 0; i < 26; i++) {
    const hx = 5 + r() * 14, hy = 11 + r() * 8;
    line(x, hx, hy, hx + (r() - 0.3) * 2, hy + 1 + r(), HAIR);
  }
  for (let i = 0; i < 6; i++) px(x, 5 + r() * 14, 6 + r() * 2, HAIR);
  return c;
}
function buildArm() {
  const [c, x] = makeCanvas(22, 120);
  const r = mulberry(21);
  rect(x, 1, 0, 20, 120, OUT);
  rect(x, 2, 0, 18, 120, SKIN);
  rect(x, 2, 0, 4, 120, SKIN_D); rect(x, 16, 0, 4, 120, SKIN_L);
  for (let i = 0; i < 260; i++) {
    const hx = 2 + r() * 18, hy = r() * 78;
    line(x, hx, hy, hx + (r() - 0.5) * 2, hy + 2, r() < 0.8 ? HAIR : '#4a2e1e');
  }
  // rolled-up flannel sleeve
  const plaid = (yy, xx) => ((Math.floor(xx / 4) + Math.floor(yy / 4)) % 2 ? '#a02a2a' : '#6a1818');
  for (let yy = 80; yy < 120; yy++) for (let xx = 0; xx < 22; xx++) {
    let col = plaid(yy, xx);
    if (xx % 8 === 0 || yy % 8 === 0) col = '#2a0c0c';
    if (yy < 86) col = shade(col, 0.2);
    px(x, xx, yy, col);
  }
  rect(x, 0, 85, 22, 1, '#3a1010');
  return c;
}

export function initCockpit() {
  base = buildBase();
  wheelImg = buildWheel();
  handL = buildHand(false); handR = buildHand(true);
  armImg = buildArm();
}

function drawRotated(ctx, img, x, y, ang, ox, oy, sc = 1) {
  ctx.save(); ctx.translate(Math.round(x), Math.round(y)); ctx.rotate(ang); ctx.scale(sc, sc);
  ctx.drawImage(img, -ox, -oy); ctx.restore();
}

function needle(ctx, cx, cy, r, ang, col) {
  line(ctx, cx, cy, cx + Math.cos(ang) * r, cy + Math.sin(ang) * r, col);
  px(ctx, cx, cy, '#888');
}

function drawMirror(ctx, game) {
  rect(ctx, 127, 3, 66, 15, '#111'); rect(ctx, 129, 4, 62, 12, '#4a4440');
  rect(ctx, 129, 4, 62, 3, '#6a625a');          // ceiling
  rect(ctx, 157, 7, 6, 9, '#2a2622');           // aisle
  rect(ctx, 156, 5, 8, 3, '#8ab0c8');           // rear window
  const heads = ['#3a2a1a', '#e8c890', '#6a4a32', '#9a9a9a', '#c87a3a', '#1a1a1a'];
  let n = 0;
  for (let row = 0; row < 4; row++) {
    const y = 13 - row * 2, sz = 4 - row;
    for (const side of [-1, 1]) for (let k = 0; k < 2; k++) {
      const sx = side < 0 ? 155 - (k + 1) * (sz + 2) - row : 165 + k * (sz + 2) + row;
      rect(ctx, sx, y, sz + 1, 3, '#2a4a8a');
      const filled = n < Math.round(game.passengers / 40 * 16) || (game.passengers > 0 && n === 0);
      if (filled) rect(ctx, sx + 1, y - 1, Math.max(1, sz - 1), 2, heads[n % heads.length]);
      n++;
    }
  }
  rect(ctx, 129, 4, 62, 1, '#8a8278');
}

export function renderCockpit(main, game, sky, t) {
  const ctx = lctx;
  const p = game.player;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(base, 0, 0);
  drawMirror(ctx, game);

  // fuzzy dice swinging from the mirror
  const sw = game.diceSwing;
  const dx = 150 + Math.sin(sw) * 10, dy = 17 + Math.cos(sw) * 12;
  line(ctx, 150, 17, dx, dy, '#d8d8d8');
  rect(ctx, dx - 3, dy, 5, 5, '#e85aa0'); px(ctx, dx - 2, dy + 1, '#fff'); px(ctx, dx, dy + 3, '#fff');
  rect(ctx, dx + 1, dy + 3, 4, 4, '#f4f4f4'); px(ctx, dx + 2, dy + 4, '#111');

  // needles
  const sa = (150 + (clamp(p.speed, 0, 80) / 80) * 240) * Math.PI / 180;
  needle(ctx, SPEEDO[0], SPEEDO[1], SPEEDO[2] - 2, sa, '#ff6a2a');
  const fa = Math.PI + clamp(p.fuel, 0, 1) * Math.PI;
  needle(ctx, FUEL[0], FUEL[1], 7, fa, '#ffb040');
  drawText(ctx, String(Math.round(p.speed)).padStart(2, '0'), 201.5, 112, '#e8e8e0', 1, 'center');

  // steering wheel + hands + arms
  const wa = p.wheel * 1.75; // radians
  const handPos = side => {
    const a = -Math.PI / 2 + side * 0.98 + wa;
    return [WHEEL_CX + Math.cos(a) * WHEEL_R, WHEEL_CY + Math.sin(a) * WHEEL_R, a];
  };
  drawRotated(ctx, wheelImg, WHEEL_CX, WHEEL_CY, wa, wheelImg.width / 2, wheelImg.height / 2);
  for (const side of [-1, 1]) {
    const [hx, hy, a] = handPos(side);
    const ex = side < 0 ? 62 : 258, ey = 250;
    const armA = Math.atan2(ey - hy, ex - hx);
    const wx = hx + Math.cos(armA) * 6, wy = hy + Math.sin(armA) * 6;
    drawRotated(ctx, armImg, wx, wy, armA - Math.PI / 2, 11, 0, 1.25);
    drawRotated(ctx, side < 0 ? handL : handR, hx, hy, a + Math.PI / 2, 12, 11, 1.35);
  }

  // night: darken the cab, then add the instrument glow
  const tintA = sky.tintA * 0.9;
  if (tintA > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = css(sky.tint.map(v => v * 0.7), tintA);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  const glow = 0.35 + sky.night * 0.65;
  // radio display
  const radio = game.audio.radioLabel();
  drawText(ctx, radio, 40, 129, `rgba(255,170,60,${glow})`, 1, 'center');
  // lamps
  const lamp = (x, y, on, col) => rect(ctx, x, y, 4, 3, on ? col : '#1a1a1a');
  lamp(18, 150, p.cruise, '#5aff5a');
  lamp(48, 150, game.lightsOn, '#5a9aff');
  lamp(76, 150, p.fuel < 0.18 && Math.floor(t * 2) % 2 === 0, '#ffb030');
  lamp(290, 156, game.doorsOpen, '#ff4a3a');
  // destination LCD
  const lcd = `rgba(125,255,122,${0.55 + glow * 0.45})`;
  drawText(ctx, timeStr(game.clock), 229, 126, lcd, 2);
  drawText(ctx, `PAX ${String(game.passengers).padStart(2, '0')}`, 311, 126, lcd, 1, 'right');
  drawText(ctx, game.comfort > 70 ? ':)' : game.comfort > 40 ? ':|' : ':(', 311, 133, lcd, 1, 'right');
  const ns = game.nextStop();
  if (ns) {
    drawText(ctx, ns.name, 229, 139, lcd);
    const dist = Math.max(0, ns.mile - game.mile());
    drawText(ctx, ns.arr ? `DUE ${timeStr(ns.arr)}` : `DEP ${timeStr(ns.dep)}`, 229, 145, lcd);
    drawText(ctx, `${dist.toFixed(1)}MI`, 311, 145, lcd, 1, 'right');
  }
  main.drawImage(layer, 0, 0);
}
