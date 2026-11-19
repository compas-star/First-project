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

function drawScene() {
  const sky = skyAt(game.clock);
  const sh = game.shake;
  const ox = sh ? Math.round((Math.random() - 0.5) * 3 * sh) : 0;
  const oy = Math.round((sh ? (Math.random() - 0.5) * 3 * sh : 0) + (game.player.speed > 5 && Math.random() < 0.08 ? 1 : 0) * 0.5);
  const sunX = Math.round((((200 - game.bgOffset * 0.7) % BG_W) + BG_W) % BG_W - 40);
  drawSky(ctx, sky, sunX, t);
  const { emissive } = renderWorld(game, sky);
  ctx.drawImage(worldCanvas, ox, oy);
  if (game.lightsOn) drawHeadlights(ctx, Math.max(sky.night, 0.4));
  drawEmissive(ctx, emissive, sky.night, ox, oy);
  // grimy windshield glint
  ctx.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(200 + i * 14, 8); ctx.lineTo(214 + i * 14, 8); ctx.lineTo(150 + i * 14, 114); ctx.lineTo(136 + i * 14, 114); ctx.fill(); }
  renderCockpit(ctx, game, sky, t);
  return sky;
}

function drawHud() {
  const m = game.msgs[0];
  if (m) {
    const w = textWidth(m.text) + 8;
    box(160 - w / 2, 21, w, 9);
    drawText(ctx, m.text, 160, 23, m.color, 1, 'center');
  }
  if (game.prompt) {
    const blink = game.action ? Math.floor(t * 3) % 2 === 0 : true;
    const w = textWidth(game.prompt) + 8;
    box(160 - w / 2, 92, w, 9, 0.6);
    if (blink) drawText(ctx, game.prompt, 160, 94, game.action ? '#ffd36a' : '#ffffff', 1, 'center');
  }
  const act = document.getElementById('tAction');
  if (game.action) { act.textContent = game.action === 'doors' ? 'OPEN DOORS' : 'REFUEL'; act.classList.add('show'); }
  else act.classList.remove('show');
}

function drawTitle() {
  box(0, 0, W, H, 0.55);
  drawText(ctx, 'MOTHER ROAD', 160, 22, '#ffd36a', 4, 'center', '#6a2a1a');
  drawText(ctx, 'A BUS DRIVER ON ROUTE 66 - ARIZONA, 1994', 160, 50, '#f2e2b8', 1, 'center');
  rect(ctx, 70, 60, 180, 1, '#8a6a3a');
  const lines = [
    ['FLAGSTAFF > WILLIAMS > ASH FORK >', '#c8d8ff'],
    ['SELIGMAN > PEACH SPRINGS > KINGMAN', '#c8d8ff'],
    ['', ''],
    ['DRIVE WEST. STOP IN THE YELLOW BOXES.', '#ffffff'],
    ['KEEP THE TANK FULL. KEEP THEM COMFY.', '#ffffff'],
  ];
  lines.forEach(([s, c], i) => drawText(ctx, s, 160, 66 + i * 7, c, 1, 'center'));
  if (Math.floor(t * 2) % 2 === 0) drawText(ctx, input.touch ? 'TAP TO START YOUR SHIFT' : 'PRESS ENTER TO START YOUR SHIFT', 160, 104, '#ffd36a', 1, 'center');
  if (!input.touch) {
    box(40, 116, 240, 52, 0.75);
    const keys = [
      'ARROWS / WASD - DRIVE AND STEER', 'SPACE - OPEN DOORS / REFUEL', 'C - CRUISE CONTROL   R - RADIO',
      'H - HORN   L - LIGHTS   M - MUTE   P - PAUSE',
    ];
    keys.forEach((k, i) => drawText(ctx, k, 160, 121 + i * 11, '#e8e0d0', 1, 'center'));
  }
}

function drawReport() {
  box(0, 0, W, H, 0.82);
  drawText(ctx, 'SHIFT REPORT', 160, 8, '#ffd36a', 2, 'center');
  drawText(ctx, 'PAINTED DESERT COACH LINES - RUN 66W', 160, 22, '#c8b48a', 1, 'center');
  drawText(ctx, 'STOP', 40, 34, '#8a8a8a'); drawText(ctx, 'DUE', 150, 34, '#8a8a8a'); drawText(ctx, 'ARRIVED', 190, 34, '#8a8a8a'); drawText(ctx, 'STATUS', 240, 34, '#8a8a8a');
  report.rows.forEach((r, i) => {
    const y = 43 + i * 8;
    const c = r[3] === 'ON TIME' ? '#9aff8a' : r[3] === 'MISSED' ? '#ff8a6a' : '#ffd36a';
    drawText(ctx, r[0], 40, y, '#ffffff'); drawText(ctx, r[1], 150, y, '#e8e0d0'); drawText(ctx, r[2], 190, y, '#e8e0d0'); drawText(ctx, r[3], 240, y, c);
  });
  const y = 43 + report.rows.length * 8 + 6;
  drawText(ctx, `PASSENGERS DELIVERED: ${report.delivered}`, 40, y, '#ffffff');
  drawText(ctx, `AVERAGE COMFORT: ${Math.round(report.avg)}%`, 40, y + 8, '#ffffff');
  drawText(ctx, `BUMPS AND CRASHES: ${report.crashes}`, 40, y + 16, '#ffffff');
  if (report.rescues) drawText(ctx, `RAN OUT OF FUEL: ${report.rescues}X`, 40, y + 24, '#ff8a6a');
  // stars
  for (let i = 0; i < 5; i++) {
    const full = report.stars >= i + 1, half = !full && report.stars > i;
    drawText(ctx, '*', 200 + i * 14, y + 2, full ? '#ffd36a' : half ? '#a88a3a' : '#3a3a3a', 3);
  }
  drawText(ctx, `PAYCHECK: $${report.pay.toFixed(2)}`, 240, y + 22, '#9aff8a', 1, 'center');
  if (Math.floor(t * 2) % 2 === 0) drawText(ctx, input.touch ? 'TAP TO DRIVE AGAIN' : 'PRESS ENTER TO DRIVE AGAIN', 160, 170, '#ffd36a', 1, 'center');
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
    if (paused) { box(110, 70, 100, 24, 0.8); drawText(ctx, 'PAUSED', 160, 76, '#ffd36a', 2, 'center'); }
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
