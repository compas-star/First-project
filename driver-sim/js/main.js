import { weatherSky, drawPrecip, drawGlass, drawBolt } from './weather.js';
import { W, H } from './config.js';
import { rect, timeStr } from './gfx.js';
import { drawText, textWidth } from './font.js';
import { buildSprites } from './sprites.js';
import { buildBackgrounds, skyAt, drawSky } from './backgrounds.js';
import { renderWorld, worldCanvas, drawEmissive, drawFlash } from './render.js';
import { initCockpit, renderCockpit, WIPERS, drawWipers } from './cockpit.js';
import { input, initInput } from './input.js';
import { Audio } from './audio.js';
import { VHS, TV_SCREEN } from './vhs.js';
import { Game } from './game.js';
import { Career, RENT_PRICE } from './career.js';
import { Hub } from './hub.js';
import { NODES, shortestPath } from './world.js';
import { drawMap } from './mapview.js';

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
const vhs = new VHS(canvas);
// when a tape won't play, say why (the TV itself shows NO SIGNAL)
vhs.onNote = text => { if (state === 'drive') game.msg(text, 4.5, '#ff8a6a'); };
// browsers (and sandboxed frames) only allow audio to start from a user gesture
for (const ev of ['pointerdown', 'keydown', 'touchend']) addEventListener(ev, () => { try { audio.init(); } catch (e) {} }, true);

const career = new Career();
const hasSave = career.load();
const hub = new Hub(career);
let game = new Game(audio, career);
// title backdrop: a rental car parked in Kingman at golden hour
const demoCareer = new Career(); demoCareer.clock = 16.6 * 3600;
const demo = new Game(audio, demoCareer); demo.startCar('flagstaff'); demo.msgs = [];

let state = 'title', paused = false, report = null, t = 0, titleSel = 0;

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
function setPlaying(on) { document.body.classList.toggle('playing', on); input.pressed.clear(); input.taps.length = 0; }

function drawScene(g) {
  const wx = g.weather;
  const sky = weatherSky(skyAt(g.clock), wx);
  const sh = g.shake;
  const ox = sh ? Math.round((Math.random() - 0.5) * 4 * sh) : 0;
  const oy = sh ? Math.round((Math.random() - 0.5) * 4 * sh) : (g.player.speed > 5 && Math.random() < 0.05 ? 1 : 0);
  drawSky(ctx, sky, g.heading(), t);
  if (wx) drawBolt(ctx, wx);
  const { emissive } = renderWorld(g, sky);
  ctx.drawImage(worldCanvas, ox, oy);
  drawFlash(ctx, sky, ox, oy);
  drawEmissive(ctx, emissive, sky.night, ox, oy, sky.wet || 0);
  if (wx) {
    drawPrecip(ctx, wx, sky.night, ox, oy);
    wx.wipe(WIPERS[g.mode === 'car' ? 'car' : 'bus']);
    drawGlass(ctx, wx, sky);
    drawWipers(ctx, WIPERS[g.mode === 'car' ? 'car' : 'bus'], wx.wiper);
    audio.ambience?.(wx, sky, Math.abs(g.player.speed), state !== 'drive' || paused || g.mapOpen);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  for (const [x0, w] of [[250, 14], [272, 6], [330, 18]]) { ctx.beginPath(); ctx.moveTo(x0, 17); ctx.lineTo(x0 + w, 17); ctx.lineTo(x0 + w - 90, 176); ctx.lineTo(x0 - 90, 176); ctx.fill(); }
  renderCockpit(ctx, g, sky, t);
  return sky;
}

// heavy eyelids when you're exhausted, and black while you sleep
function drawEyes(g) {
  const b = g.blink || 0;
  if (b <= 0) return;
  const h = Math.round(b * (H / 2 + 4));
  ctx.fillStyle = '#050404';
  ctx.fillRect(0, 0, W, h); ctx.fillRect(0, H - h, W, h);
  if (b < 1) { ctx.fillStyle = 'rgba(5,4,4,0.5)'; ctx.fillRect(0, h, W, 6); ctx.fillRect(0, H - h - 6, W, 6); }
}
function needBar(x, y, label, v) {
  drawText(ctx, label, x, y, '#e8e0d0');
  rect(ctx, x + 22, y, 32, 5, '#2a2420');
  const col = v > 50 ? '#7ad06a' : v > 25 ? '#e8c040' : '#e85a3a';
  rect(ctx, x + 22, y, Math.round(32 * v / 100), 5, col);
}
function drawNeeds(c, x, y) {
  box(x - 3, y - 3, 62, 18, 0.55);
  needBar(x, y, 'FOOD', 100 - c.hunger);
  needBar(x, y + 8, 'REST', 100 - c.fatigue);
}

function drawHud(g) {
  drawNeeds(career, 30, 22);
  const m = g.msgs[0];
  if (m) {
    const s = textWidth(m.text, 2) > W - 20 ? 1 : 2;
    const w = textWidth(m.text, s) + 12;
    box(CX - w / 2, 62, w, 5 * s + 8);
    drawText(ctx, m.text, CX, 66, m.color, s, 'center');
  }
  if (g.prompt) {
    const blink = g.action ? Math.floor(t * 3) % 2 === 0 : true;
    // with a tape in, keep it left of the TV (the video covers anything drawn under it)
    const tv = TV_SCREEN[g.mode === 'car' ? 'car' : 'bus'];
    const room = vhs.playing ? tv.x - 12 : W - 20, cx = vhs.playing ? 6 + room / 2 : CX;
    const s = textWidth(g.prompt, 2) > room ? 1 : 2;
    const w = textWidth(g.prompt, s) + 12;
    box(cx - w / 2, 136, w, 18, 0.6);
    if (blink) drawText(ctx, g.prompt, cx, s === 2 ? 140 : 142, g.action ? '#ffd36a' : '#ffffff', s, 'center');
  }
  // junction chooser
  const ch = g.choice;
  const showChoice = ch && ch.opts.length > 1;
  document.body.classList.toggle('junction', !!showChoice && !ch.ring && !ch.split);
  if (showChoice) {
    const head = ch.ring ? `ROUNDABOUT: STEER RIGHT AT YOUR EXIT` : ch.split ? `ROAD SPLITS: STEER ONTO YOUR ROAD` : `AT ${NODES[ch.node].name}: ${input.touch ? 'ROAD BUTTONS' : 'Q / E'}`;
    const w = Math.max(textWidth(head) + 10, ...ch.opts.map(o => textWidth(o.label) + 26));
    // the TV's video sits on top of the game picture, so with a tape in, the box goes above the TV
    const h = 14 + ch.opts.length * 9, tv = TV_SCREEN[g.mode === 'car' ? 'car' : 'bus'];
    const x = W - w - 30, y = vhs.playing ? Math.min(82, tv.y - 3 - h) : 82;
    box(x, y, w, h, 0.8);
    drawText(ctx, head, x + 5, y + 4, '#9aff8a');
    ch.opts.forEach((o, i) => {
      const yy = y + 14 + i * 9;
      if (i === ch.idx && !ch.ring && (!ch.split || g.track.splits.some(sp => sp.choice === ch))) { rect(ctx, x + 2, yy - 2, w - 4, 9, '#2a5a9a'); drawText(ctx, '>', x + 5, yy, '#ffd36a'); }
      drawText(ctx, o.label, x + 12, yy, i === ch.idx ? '#ffffff' : '#c8c8c8');
      if (i === ch.recommended) drawText(ctx, '*', x + w - 8, yy, '#ffd36a');
    });
  }
  if (g.player.reverse) { box(CX - 34, 40, 68, 14, 0.7); drawText(ctx, 'R - REVERSE', CX, 44, '#ffd36a', 1, 'center'); }
  const act = document.getElementById('tAction');
  if (g.action) { act.textContent = { doors: 'OPEN DOORS', park: 'RETURN CAR', deliver: 'DELIVER', fuel: 'REFUEL', coffee: 'COFFEE', eat: 'EAT', sleep: 'SLEEP' }[g.action] || 'OK'; act.classList.add('show'); }
  else act.classList.remove('show');
}

// the paper map, unfolded on your lap
function drawPaperMap(g) {
  const s = g.seg();
  let route = [];
  if (g.mode === 'bus') route = g.job.path;
  else {
    const L = g.locate();
    const ahead = L.node !== g.dest ? (shortestPath(L.node, g.dest) || []) : [];
    route = L.e ? [L.e, ...ahead] : ahead;
  }
  const view = { x: 18, y: 14, w: W - 36, h: H - 40, cx: s.mx, cy: s.my, s: 1.9 };
  box(0, 0, W, H, 0.45);
  drawMap(ctx, view, { route, player: { mx: s.mx, my: s.my, heading: g.heading() }, selected: g.mode !== 'bus' ? g.dest : g.job.stops[g.job.stops.length - 1] }, t);
  const info = g.mode === 'truck' ? `${g.load.cargo} TO ${NODES[g.dest].name}: ${g.milesToDest().toFixed(0)} MI, DUE ${timeStr(g.deadline)}` : g.mode === 'car' ? `TO ${NODES[g.dest].name}: ${g.milesToDest().toFixed(0)} MI` : `${g.job.name}: NEXT ${g.nextStop()?.name || '-'}`;
  box(18, H - 26, W - 36, 14, 0.85);
  drawText(ctx, info, 24, H - 22, '#ffd36a');
  drawText(ctx, input.touch ? 'TAP MAP TO FOLD' : 'M - FOLD THE MAP', W - 24, H - 22, '#c8c8c8', 1, 'right');
  drawTips(g);
}

// how to play, in the corner of the map
const TIPS_KEYS = [
  ['ARROWS / WASD', 'DRIVE AND STEER'], ['SPACE', 'DOORS, GAS, EAT, SLEEP'], ['C', 'CRUISE CONTROL'],
  ['R', 'RADIO'], ['V', 'VHS TAPE (TV)'], ['L', 'HEADLIGHTS'], ['F', 'WEATHER'], ['H', 'HORN'],
  ['U', 'U-TURN (CAR)'], ['M / TAB', 'THIS MAP'], ['N', 'SOUND ON/OFF'], ['P', 'PAUSE'],
];
const TIPS_TOUCH = [
  ['GAS / BRAKE', 'DRIVE, HOLD BRAKE TO BACK UP'], ['ARROWS / WHEEL', 'STEER'], ['BIG BUTTON', 'DOORS, GAS, EAT, SLEEP'],
  ['CRUISE', 'CRUISE CONTROL'], ['RADIO', 'NEXT STATION'], ['VHS', 'PUT IN A TAPE'], ['LIGHTS', 'HEADLIGHTS'],
  ['WEATHER', 'CHANGE THE WEATHER'], ['U-TURN', 'TURN AROUND (CAR)'], ['MAP', 'THIS MAP'], ['II', 'PAUSE'],
];
function drawTips(g) {
  const tips = input.touch ? TIPS_TOUCH : TIPS_KEYS;
  const w = 150, x = W - 22 - w, y = 18, h = 16 + tips.length * 8;
  box(x, y, w, h, 0.82);
  drawText(ctx, 'HOW TO DRIVE', x + w / 2, y + 4, '#ffd36a', 1, 'center');
  tips.forEach(([k, what], i) => {
    drawText(ctx, k, x + 5, y + 14 + i * 8, '#9aff8a');
    drawText(ctx, what, x + w - 5, y + 14 + i * 8, '#e8e0d0', 1, 'right');
  });
}

function drawTitle() {
  box(0, 0, W, H, 0.55);
  drawText(ctx, 'MOTHER ROAD', CX, 22, '#ffd36a', 6, 'center', '#6a2a1a');
  say('DRIVING FOR A LIVING - ARIZONA, 1994', 62, '#f2e2b8', 2);
  rect(ctx, 90, 78, 300, 1, '#8a6a3a');
  say('DRIVE BUS SHIFTS, HAUL FREIGHT ON A DEADLINE, RENT A CAR', 86, '#c8d8ff', 1);
  say('TO GET AROUND. WATCH YOUR MONEY, SLEEP IN MOTELS.', 94, '#c8d8ff', 1);
  const items = hasSave ? [`CONTINUE - DAY ${career.day}, ${career.here.name}, $${career.money.toFixed(0)}`, 'NEW CAREER'] : ['START A NEW CAREER'];
  titleSel = Math.min(titleSel, items.length - 1);
  if (input.take('up')) titleSel = Math.max(0, titleSel - 1);
  if (input.take('down')) titleSel = Math.min(items.length - 1, titleSel + 1);
  let chosen = null;
  items.forEach((it, i) => {
    const y = 112 + i * 20, w = textWidth(it, 1) + 30;
    box(CX - w / 2, y - 4, w, 15, i === titleSel ? 0.9 : 0.6);
    if (i === titleSel) rect(ctx, CX - w / 2, y - 4, 3, 15, '#ffd36a');
    drawText(ctx, it, CX, y + 1, i === titleSel ? '#ffd36a' : '#e8e0d0', 1, 'center');
    for (const tp of input.taps) if (tp.y >= y - 4 && tp.y < y + 11 && Math.abs(tp.x - CX) < w / 2) chosen = i;
  });
  input.taps.length = 0;
  if (input.take('enter') || input.take('action')) chosen = titleSel;
  if (chosen !== null) {
    if (!hasSave || chosen === 1) { career.newGame(); career.save(); }
    input.take('start');
    state = 'hub'; setPlaying(false);
  }
  if (!input.touch) {
    box(70, 168, 340, 84, 0.8);
    ['ARROWS / WASD - DRIVE AND STEER     SPACE - DOORS / FUEL / PARK', 'M - PAPER MAP     STEER ONTO THE ROAD YOU WANT AT SPLITS',
      'C - CRUISE  R - RADIO  H - HORN  L - LIGHTS  F - WEATHER  N - MUTE', 'P - PAUSE (BACK TO MAP IN THE MENU)'].forEach((k, i) => say(k, 176 + i * 18, '#e8e0d0', 1));
  }
}

function drawReport() {
  box(0, 0, W, H, 0.86);
  if (report.mode === 'truck') {
    const L = report.load;
    drawText(ctx, 'LOAD DELIVERED', CX, 24, '#ffd36a', 3, 'center', '#6a2a1a');
    say(`${L.tons} TONS OF ${L.cargo} TO ${NODES[L.dest].name}`, 58, '#ffffff', 2);
    say(`DUE ${timeStr(report.deadline)}   DELIVERED ${timeStr(report.arrived)}`, 84, '#e8e0d0', 1);
    say(report.late <= 0 ? `ON TIME${report.late < -5 ? ` - ${-report.late} MIN EARLY` : ''}! +15% BONUS` : `${report.late} MIN LATE`, 98, report.late <= 0 ? '#9aff8a' : '#ff8a6a', 2);
    say(`LOAD CONDITION: ${Math.round(report.cargo)}%`, 120, report.cargo > 80 ? '#9aff8a' : report.cargo > 50 ? '#ffd36a' : '#ff8a6a', 1);
    say(`${report.miles.toFixed(0)} MILES DRIVEN   CRASHES: ${report.crashes}`, 132, '#e8e0d0', 1);
    drawText(ctx, `PAID: $${report.pay.toFixed(2)}`, CX, 156, '#9aff8a', 3, 'center');
  } else if (report.mode === 'car') {
    drawText(ctx, 'TRIP COMPLETE', CX, 30, '#ffd36a', 3, 'center', '#6a2a1a');
    say(`YOU ARRIVED IN ${NODES[report.node].name}`, 70, '#ffffff', 2);
    say(`${report.miles.toFixed(0)} MILES DRIVEN`, 96, '#e8e0d0', 1);
    say(`GAS BOUGHT ON THE WAY: $${report.fuel.toFixed(2)}`, 108, '#e8e0d0', 1);
    if (report.rescues) say(`TOW TRUCK CALLS: ${report.rescues}`, 120, '#ff8a6a', 1);
    say('THE U-DRIVE CLERK TAKES THE KEYS. "COME BACK SOON!"', 140, '#c8d8ff', 1);
  } else {
    drawText(ctx, 'SHIFT REPORT', CX, 10, '#ffd36a', 3, 'center', '#6a2a1a');
    say(`PAINTED DESERT COACH LINES - ${report.job.name}`, 32, '#c8b48a', 1);
    const cols = [30, 236, 300, 370];
    ['STOP', 'DUE', 'ARRIVED', 'STATUS'].forEach((h, i) => drawText(ctx, h, cols[i], 46, '#8a8a8a', 1));
    report.rows.slice(0, 7).forEach((r, i) => {
      const y = 56 + i * 15;
      const c = r[3] === 'ON TIME' ? '#9aff8a' : r[3] === 'MISSED' ? '#ff8a6a' : '#ffd36a';
      drawText(ctx, r[0], cols[0], y, '#ffffff', 2); drawText(ctx, r[1], cols[1], y + 2, '#e8e0d0', 1);
      drawText(ctx, r[2], cols[2], y + 2, '#e8e0d0', 1); drawText(ctx, r[3], cols[3], y, c, 2);
    });
    const y = 56 + Math.min(7, report.rows.length) * 15 + 8;
    drawText(ctx, `PASSENGERS DELIVERED: ${report.delivered}`, 30, y, '#ffffff', 1);
    drawText(ctx, `AVERAGE COMFORT: ${Math.round(report.avg)}%`, 30, y + 10, '#ffffff', 1);
    drawText(ctx, `BUMPS AND CRASHES: ${report.crashes}`, 30, y + 20, '#ffffff', 1);
    for (let i = 0; i < 5; i++) {
      const full = report.stars >= i + 1, half = !full && report.stars > i;
      drawText(ctx, '*', 290 + i * 30, y - 2, full ? '#ffd36a' : half ? '#a88a3a' : '#3a3a3a', 5);
    }
    drawText(ctx, `PAYCHECK: $${report.pay.toFixed(2)}`, 360, y + 32, '#9aff8a', 2, 'center');
  }
  if (Math.floor(t * 2) % 2 === 0) say(input.touch ? 'TAP TO OPEN YOUR MAP' : 'PRESS ENTER FOR YOUR MAP', 250, '#ffd36a', 2);
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; t += dt;
  if (input.take('mute')) { audio.setMuted(!audio.muted); vhs.setMuted(audio.muted); document.getElementById('tMute').textContent = audio.muted ? 'SOUND OFF' : 'SOUND'; }
  if (state === 'title') {
    audio.update(0, 0, false, true);
    drawScene(demo); drawTitle();
  } else if (state === 'hub') {
    audio.update(0, 0, false, true);
    const r = hub.update(input);
    hub.draw(ctx, t);
    if (r && r.type === 'bus') { game = new Game(audio, career); game.startBus(r.job); state = 'drive'; paused = false; setPlaying(true); }
    if (r && r.type === 'truck') { game = new Game(audio, career); game.startTruck(r.load); state = 'drive'; paused = false; setPlaying(true); }
    if (r && r.type === 'car') { career.add('CAR RENTAL (U-DRIVE)', -RENT_PRICE); game = new Game(audio, career); game.startCar(r.dest); state = 'drive'; paused = false; setPlaying(true); }
    if (r && r.type === 'title') { state = 'title'; setPlaying(false); }
  } else if (state === 'drive') {
    input.take('start');
    if (input.take('vhs')) { if (vhs.dialogOpen) vhs.close(); else vhs.open(); }
    game.tvOn = vhs.playing;
    if (input.take('pause')) paused = !paused;
    if (game.mapOpen && input.taps.length) { input.taps.length = 0; game.mapOpen = false; }
    input.taps.length = 0;
    // the game waits while you're picking a tape
    if (!paused && !vhs.dialogOpen) game.update(dt, input);
    // the radio keeps playing while you're paused or looking at the map
    audio.update(Math.abs(game.player.speed), game.player.throttle, game.offroad && Math.abs(game.player.speed) > 3, paused || game.mapOpen, false);
    drawScene(game); drawEyes(game); drawHud(game);
    if (game.mapOpen) drawPaperMap(game);
    if (paused) {
      box(CX - 110, 90, 220, 70, 0.85); drawText(ctx, 'PAUSED', CX, 98, '#ffd36a', 3, 'center');
      drawText(ctx, 'P - RESUME', CX, 126, '#e8e0d0', 1, 'center');
    }
    if (game.finished && game.finishTimer <= 0) { report = game.report(); career.save(); state = 'report'; setPlaying(false); document.body.classList.remove('junction'); }
  } else if (state === 'report') {
    audio.update(0, 0, false, true);
    drawScene(game); drawReport();
    if (input.take('start') || input.take('action') || input.take('enter')) { state = 'hub'; hub.tab = 0; hub.sel = 0; hub.dest = null; setPlaying(false); }
  }
  // the TV's video sits over the cab while you drive (also paused, not over the map)
  vhs.update(dt, state === 'drive' ? TV_SCREEN[game.mode === 'car' ? 'car' : 'bus'] : null, state === 'drive' && !game.mapOpen, state === 'drive');
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for debugging from the console
window.__game = () => game;
window.__career = career;
window.__state = () => state;
