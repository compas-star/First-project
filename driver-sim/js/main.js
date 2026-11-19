import { W, H, SEG } from './config.js';
import { makeCanvas, rect, timeStr } from './gfx.js';
import { drawText, textWidth } from './font.js';
import { buildSprites } from './sprites.js';
import { buildBackgrounds, skyAt, drawSky, BG_W } from './backgrounds.js';
import { renderWorld, worldCanvas, drawEmissive, drawHeadlights } from './render.js';
import { initCockpit, renderCockpit } from './cockpit.js';
import { input, initInput } from './input.js';
import { Audio } from './audio.js';
import { Game } from './game.js';

const canvas = document.getElementById('screen');
canvas.width = W; canvas.height = H;
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;

buildSprites();
buildBackgrounds();
initCockpit();
initInput(canvas);
if (document.body.classList.contains('touch')) input.touch = true;
const audio = new Audio();
// browsers (and sandboxed frames) only allow audio to start from a user gesture
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, () => { try { audio.init(); } catch (e) {} }, true);
const game = new Game(audio);
let state = 'title', paused = false, report = null, t = 0;

function fit() {
  const vw = innerWidth, vh = innerHeight;
  let s = Math.min(vw / W, vh / H);
  if (s >= 2) s = Math.floor(s * 2) / 2;
  canvas.style.width = Math.floor(W * s) + 'px';
  canvas.style.height = Math.floor(H * s) + 'px';
}
addEventListener('resize', fit); fit();

function box(x, y, w, h, a = 0.7) { ctx.fillStyle = `rgba(10,8,6,${a})`; ctx.fillRect(x, y, w, h); }
const CX = W / 2;
function say(str, y, color, s = 2, shadow = '#000') {
  if (textWidth(str, s) > W - 12) s = 1;
  drawText(ctx, str, CX, y, color, s, 'center', shadow);
}

function drawScene() {
  const sky = skyAt(game.clock);
  const sh = game.shake;
  const ox = sh ? Math.round((Math.random() - 0.5) * 4 * sh) : 0;
  const oy = sh ? Math.round((Math.random() - 0.5) * 4 * sh) : (game.player.speed > 5 && Math.random() < 0.05 ? 1 : 0);
  const sunX = Math.round((((300 - game.bgOffset * 1.0) % BG_W) + BG_W) % BG_W - 60);
  drawSky(ctx, sky, sunX, t, game.bgOffset);
  const { emissive } = renderWorld(game, sky);
  ctx.drawImage(worldCanvas, ox, oy);
  if (game.lightsOn) drawHeadlights(ctx, Math.max(sky.night, 0.4));
  drawEmissive(ctx, emissive, sky.night, ox, oy);
  // faint reflections on the glass
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (const [x0, w] of [[250, 14], [272, 6], [330, 18]]) { ctx.beginPath(); ctx.moveTo(x0, 17); ctx.lineTo(x0 + w, 17); ctx.lineTo(x0 + w - 90, 176); ctx.lineTo(x0 - 90, 176); ctx.fill(); }
  renderCockpit(ctx, game, sky, t);
  return sky;
}

function drawHud() {
  const m = game.msgs[0];
  if (m) {
    const s = textWidth(m.text, 2) > W - 20 ? 1 : 2;
    const w = textWidth(m.text, s) + 12;
    box(CX - w / 2, 62, w, 5 * s + 8);
    drawText(ctx, m.text, CX, 66, m.color, s, 'center');
  }
  if (game.prompt) {
    const blink = game.action ? Math.floor(t * 3) % 2 === 0 : true;
    const w = textWidth(game.prompt, 2) + 12;
    box(CX - w / 2, 136, w, 18, 0.6);
    if (blink) drawText(ctx, game.prompt, CX, 140, game.action ? '#ffd36a' : '#ffffff', 2, 'center');
  }
  const act = document.getElementById('tAction');
  if (game.action) { act.textContent = game.action === 'doors' ? 'OPEN DOORS' : 'REFUEL'; act.classList.add('show'); }
  else act.classList.remove('show');
}

function drawTitle() {
  box(0, 0, W, H, 0.55);
  drawText(ctx, 'MOTHER ROAD', CX, 26, '#ffd36a', 6, 'center', '#6a2a1a');
  say('A BUS DRIVER ON ROUTE 66 - ARIZONA, 1994', 66, '#f2e2b8', 2);
  rect(ctx, 90, 82, 300, 1, '#8a6a3a');
  say('FLAGSTAFF > WILLIAMS > ASH FORK > SELIGMAN', 90, '#c8d8ff', 1);
  say('> PEACH SPRINGS > KINGMAN', 98, '#c8d8ff', 1);
  say('DRIVE WEST. STOP IN THE YELLOW BOXES.', 112, '#ffffff', 1);
  say('KEEP THE TANK FULL AND THE PASSENGERS COMFY.', 120, '#ffffff', 1);
  if (Math.floor(t * 2) % 2 === 0) say(input.touch ? 'TAP TO START YOUR SHIFT' : 'PRESS ENTER TO START YOUR SHIFT', 136, '#ffd36a', 2);
  if (!input.touch) {
    box(70, 160, 340, 74, 0.8);
    ['ARROWS / WASD - DRIVE AND STEER', 'SPACE - OPEN DOORS / REFUEL', 'C - CRUISE CONTROL     R - RADIO',
      'H - HORN   L - LIGHTS   M - MUTE   P - PAUSE'].forEach((k, i) => say(k, 167 + i * 16, '#e8e0d0', 1));
  }
}

function drawReport() {
  box(0, 0, W, H, 0.84);
  drawText(ctx, 'SHIFT REPORT', CX, 10, '#ffd36a', 3, 'center', '#6a2a1a');
  say('PAINTED DESERT COACH LINES - RUN 66 WEST', 32, '#c8b48a', 1);
  const cols = [30, 236, 300, 370];
  ['STOP', 'DUE', 'ARRIVED', 'STATUS'].forEach((h, i) => drawText(ctx, h, cols[i], 46, '#8a8a8a', 1));
  report.rows.forEach((r, i) => {
    const y = 56 + i * 15;
    const c = r[3] === 'ON TIME' ? '#9aff8a' : r[3] === 'MISSED' ? '#ff8a6a' : '#ffd36a';
    drawText(ctx, r[0], cols[0], y, '#ffffff', 2); drawText(ctx, r[1], cols[1], y + 2, '#e8e0d0', 1);
    drawText(ctx, r[2], cols[2], y + 2, '#e8e0d0', 1); drawText(ctx, r[3], cols[3], y, c, 2);
  });
  const y = 56 + report.rows.length * 15 + 8;
  drawText(ctx, `PASSENGERS DELIVERED: ${report.delivered}`, 30, y, '#ffffff', 1);
  drawText(ctx, `AVERAGE COMFORT: ${Math.round(report.avg)}%`, 30, y + 10, '#ffffff', 1);
  drawText(ctx, `BUMPS AND CRASHES: ${report.crashes}`, 30, y + 20, '#ffffff', 1);
  if (report.rescues) drawText(ctx, `RAN OUT OF FUEL: ${report.rescues}X`, 30, y + 30, '#ff8a6a', 1);
  for (let i = 0; i < 5; i++) {
    const full = report.stars >= i + 1, half = !full && report.stars > i;
    drawText(ctx, '*', 290 + i * 30, y - 2, full ? '#ffd36a' : half ? '#a88a3a' : '#3a3a3a', 5);
  }
  drawText(ctx, `PAYCHECK: $${report.pay.toFixed(2)}`, 360, y + 32, '#9aff8a', 2, 'center');
  if (Math.floor(t * 2) % 2 === 0) say(input.touch ? 'TAP TO DRIVE AGAIN' : 'PRESS ENTER TO DRIVE AGAIN', 250, '#ffd36a', 2);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; t += dt;
  if (input.take('mute')) { audio.setMuted(!audio.muted); document.getElementById('tMute').textContent = audio.muted ? 'SOUND OFF' : 'SOUND'; }
  if (state === 'title') {
    if (input.take('start')) { audio.init(); state = 'drive'; input.pressed.clear(); document.body.classList.add('playing'); }
    drawScene(); drawTitle();
  } else if (state === 'drive') {
    input.take('start');
    if (input.take('pause')) paused = !paused;
    if (!paused) game.update(dt, input);
    audio.update(game.player.speed, game.player.throttle, game.offroad && game.player.speed > 3, paused);
    drawScene(); drawHud();
    if (paused) { box(CX - 70, 100, 140, 34, 0.8); drawText(ctx, 'PAUSED', CX, 108, '#ffd36a', 3, 'center'); }
    if (game.finished && game.finishTimer <= 0) { report = game.report(); state = 'report'; input.pressed.clear(); document.body.classList.remove('playing'); }
  } else if (state === 'report') {
    audio.update(0, 0, false, false);
    drawScene(); drawReport();
    if (input.take('start') || input.take('action')) { game.reset(); state = 'drive'; input.pressed.clear(); document.body.classList.add('playing'); }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for debugging from the console
window.__game = game;
window.__setState = s => { state = s; };
