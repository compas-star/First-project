// Main: loop, camera, HUD, toasts, sound, save/load, screens.
(() => {
'use strict';

const cv = document.getElementById('game'), cx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
S.mode = 'menu';

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  S.setCanvas(cx, W, H, DPR);
  S.baseZoom = S.clamp(Math.min(W, H) / 430, .78, 1.5);
}
window.addEventListener('resize', resize);
resize();

// ---------- sound ----------
let actx = null, soundOn = true, lastDrop = 0;
try { soundOn = localStorage.getItem('tribe-sound') !== '0'; } catch (e) {}
const audio = () => { if (!soundOn) return null; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { return null; } return actx; };
const tone = (f, d, type = 'triangle', v = .08, delay = 0) => {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d);
};
S.sound = k => {
  if (k === 'drop') { const n = performance.now(); if (n - lastDrop < 70) return; lastDrop = n; tone(520 + Math.random() * 120, .06, 'sine', .04); }
  else if (k === 'build') { tone(392, .18); tone(523, .18, 'triangle', .08, .09); tone(659, .3, 'triangle', .08, .18); }
  else if (k === 'quest') { tone(659, .12); tone(880, .25, 'triangle', .08, .1); }
};

// ---------- toasts ----------
const toastEl = document.getElementById('toast');
let toastT = 0;
S.toast = (text, dur = 2.4) => { toastEl.textContent = text; toastEl.hidden = false; toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show'); toastT = dur; };

// ---------- HUD ----------
const iconURL = type => { const c = document.createElement('canvas'); c.width = c.height = 48; const g = c.getContext('2d'); S.drawIcon(g, type, 24, 25, 2.6); return c.toDataURL(); };
for (const k of ['wood', 'stone', 'food', 'gp']) { const img = document.querySelector(`[data-icon="${k}"]`); if (img) img.src = iconURL(k); }
const hud = { wood: $('rWood'), stone: $('rStone'), food: $('rFood'), pop: $('rPop'), gp: $('rGp'), era: $('eraLabel'), day: $('dayLabel'), quest: $('questText'), carry: $('carryLabel') };
function $(id) { return document.getElementById(id); }
let hudT = 0;
function updateHud() {
  const g = S.game;
  hud.wood.textContent = Math.floor(g.res.wood);
  hud.stone.textContent = Math.floor(g.res.stone);
  hud.food.textContent = Math.floor(g.res.food);
  hud.food.parentElement.classList.toggle('warn', g.res.food <= 0 && S.workers('p').length > 0);
  hud.pop.textContent = S.workers('p').length + '/' + S.popCap('p');
  hud.gp.textContent = g.gp;
  hud.era.textContent = S.ERAS[S.eraOf(S.campLevel('p'))].name;
  hud.day.textContent = (g.night ? 'Ночь ' : 'День ') + g.day;
  $('dayChip').classList.toggle('night', g.night);
  const q = S.QUESTS[g.questIdx];
  hud.quest.textContent = q ? q.text : '';
  hud.carry.textContent = g.carry.length + '/' + S.carryCap();
}

// ---------- save / load ----------
const KEY = 'tribe-ages-v1';
function serialize() {
  const g = S.game;
  return JSON.stringify({
    v: 1, seed: g.seed, time: g.time, clock: g.clock, day: g.day, res: g.res, gp: g.gp, stats: g.stats, carry: g.carry, questIdx: g.questIdx, upkeepT: g.upkeepT,
    player: { x: g.player.x, y: g.player.y, hp: g.player.dead ? g.player.maxHp : g.player.hp },
    b: g.buildings.map(b => [b.level, b.prog, Math.round(b.hp), b.broken ? 1 : 0]),
    r: S.world.res.filter(r => r.state !== 'ok' || r.amt < r.max).map(r => [r.id, r.state, r.amt, r.hp || 0, Math.round(r.timer)]),
    u: g.units.filter(u => !u.dead && (u.kind === 'worker' || u.kind === 'neutral')).map(u => [u.kind, u.fac, Math.round(u.x), Math.round(u.y), Math.round(u.hp), u.state === 'wait' || u.state === 'follow' ? 'wait' : u.kind === 'neutral' ? 'wander' : 'find', Math.round(u.home.x), Math.round(u.home.y)]),
    rival: g.rival,
  });
}
S.save = () => { if (!S.game || S.mode === 'menu') return; try { localStorage.setItem(KEY, serialize()); } catch (e) {} };
function load() {
  let d; try { d = JSON.parse(localStorage.getItem(KEY)); } catch (e) { return false; }
  if (!d || d.v !== 1) return false;
  const g = S.newGame(d.seed);
  Object.assign(g, { time: d.time, clock: d.clock, day: d.day, res: d.res, gp: d.gp, stats: d.stats, carry: d.carry, questIdx: d.questIdx, upkeepT: d.upkeepT, rival: d.rival });
  g.player.x = d.player.x; g.player.y = d.player.y; g.player.hp = d.player.hp;
  d.b.forEach((s, i) => { const b = g.buildings[i]; if (!b) return; b.level = s[0]; b.prog = s[1] || {}; b.hp = s[2]; b.broken = !!s[3]; });
  for (const [id, state, amt, hp, timer] of d.r) { const r = S.world.res[id]; if (!r) continue; Object.assign(r, { state, amt, hp, timer }); if (state !== 'ok') S.world.dirty.add(r); }
  g.units = g.units.filter(u => u.kind !== 'worker' && u.kind !== 'neutral');
  for (const [kind, fac, x, y, hp, state, hx, hy] of d.u) g.units.push(S.newUnit(kind, fac, x, y, { hp, state, home: { x: hx, y: hy } }));
  g.night = S.game.clock % (S.DAY_LEN + S.NIGHT_LEN) >= S.DAY_LEN;
  return true;
}
const hasSave = () => { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } };

// ---------- screens ----------
function startGame(fresh) {
  audio();
  if (fresh || !load()) S.newGame(Math.floor(Math.random() * 1e9));
  S.attachHelpers(S.game);
  S.cam.x = S.game.player.x; S.cam.y = S.game.player.y; S.cam.z = S.baseZoom;
  setMode('play');
  S.toast(S.game.day === 1 && S.game.questIdx === 0 ? 'Веди поселенца пальцем по экрану' : 'С возвращением, вождь!', 3);
}
function setMode(m) {
  S.mode = m;
  $('menu').hidden = m !== 'menu';
  $('hud').hidden = m === 'menu';
  $('mapBtn').textContent = m === 'map' ? 'Назад' : 'Карта';
  $('questCard').hidden = m !== 'play';
  S.input.joy = null;
}
$('newBtn').onclick = () => {
  const b = $('newBtn');
  if (hasSave() && !b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Стереть сохранение и начать?'; setTimeout(() => { delete b.dataset.armed; b.textContent = 'Новая игра'; }, 3000); return; }
  delete b.dataset.armed; b.textContent = 'Новая игра';
  startGame(true);
};
$('contBtn').onclick = () => startGame(false);
$('mapBtn').onclick = () => setMode(S.mode === 'map' ? 'play' : 'map');
$('menuBtn').onclick = () => { S.save(); $('contBtn').hidden = !hasSave(); setMode('menu'); };
$('soundBtn').onclick = () => { soundOn = !soundOn; try { localStorage.setItem('tribe-sound', soundOn ? '1' : '0'); } catch (e) {} $('soundBtn').textContent = 'Звук: ' + (soundOn ? 'вкл' : 'выкл'); };
$('soundBtn').textContent = 'Звук: ' + (soundOn ? 'вкл' : 'выкл');
$('contBtn').hidden = !hasSave();
document.addEventListener('visibilitychange', () => { if (document.hidden) S.save(); });
window.addEventListener('pagehide', S.save);

// ---------- update ----------
let spawnT = 5, neutralT = 100, saveT = 8;
function update(dt) {
  const g = S.game;
  g.time += dt;
  S.updateClock(dt);
  g.allUnits = g.units.filter(u => !u.dead); if (!g.player.dead) g.allUnits.push(g.player);
  S.updatePlayer(g.player, dt);
  for (const u of g.units) {
    if (u.dead) continue;
    u.atkT -= dt; if (u.swing > 0) u.swing -= dt; if (u.hurt > 0) u.hurt -= dt;
    if (u.kind === 'worker') S.updateWorker(u, dt);
    else if (u.kind === 'neutral') S.updateNeutral(u, dt);
    else if (u.kind === 'warrior') S.updateWarrior(u, dt);
    else S.updateBeast(u, dt);
  }
  const p = g.player; p.atkT -= dt; if (p.swing > 0) p.swing -= dt; if (p.hurt > 0) p.hurt -= dt;
  // light separation so crowds don't stack
  const us = g.allUnits;
  for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
    const a = us[i], b = us[j], dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 > 0 && d2 < 256) { const d = Math.sqrt(d2), push = (16 - d) * .5; const nx = dx / d * push, ny = dy / d * push; if (a.kind !== 'player') { a.x -= nx; a.y -= ny; } if (b.kind !== 'player') { b.x += nx; b.y += ny; } }
  }
  // walls are hard: whoever was outside an enemy wall last frame cannot end up inside (pushes, knockback)
  const R = S.WALL_R - 6;
  for (const u of us) for (const fac of ['p', 'r']) {
    if (u.fac === fac || u.fac === 'n') continue;
    const c = g.camps[fac], key = fac === 'p' ? 'outP' : 'outR';
    let d = Math.hypot(u.x - c.x, u.y - c.y);
    if (S.wallUp(fac) && u[key] && d < R) { const k = R / (d || 1); u.x = c.x + (u.x - c.x) * k; u.y = c.y + (u.y - c.y) * k; d = R; }
    u[key] = d >= R;
  }
  S.updateProjectiles(dt);
  S.updateBuildings(dt);
  S.updatePads(dt);
  S.updateRival(dt);
  S.updateResources(dt);
  S.updateQuests(dt);
  for (const r of g.visRes || []) if (r.shake > 0) r.shake -= dt;
  spawnT -= dt; if (spawnT <= 0) { spawnT = 6; S.spawnWildlife(); }
  neutralT -= dt;
  if (neutralT <= 0) { neutralT = 100; if (g.units.filter(u => u.kind === 'neutral').length < 2) S.spawnNeutral(g.camps.p, 700 + Math.random() * 900); }
  // fx
  for (const f of g.fx) {
    if (f.k === 'p') { f.life -= dt; f.vz -= 400 * dt; f.z = Math.max(0, f.z + f.vz * dt); f.x += f.vx * dt; f.y += f.vy * dt; if (f.z === 0) { f.vx *= .8; f.vy *= .8; } }
    else if (f.k === 'item') { f.t += dt; if (f.t >= f.dur) { f.life = 0; if (f.onDone) f.onDone(); } else f.life = 1; }
    else f.life -= dt;
  }
  g.fx = g.fx.filter(f => f.life > 0);
  g.units = g.units.filter(u => !(u.dead && u.kind !== 'player') && !u.remove);
  saveT -= dt; if (saveT <= 0) { saveT = 8; S.save(); }
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  const t = now / 1000;
  if (S.game && S.mode !== 'menu') {
    if (S.mode === 'play') for (let i = 0; i < (S.speed || 1); i++) update(dt); // S.speed: test hook for fast-forward
    const p = S.game.player;
    S.cam.x += (p.x - S.cam.x) * Math.min(1, dt * 8);
    S.cam.y += (p.y - 20 - S.cam.y) * Math.min(1, dt * 8);
    S.cam.z += (S.baseZoom - S.cam.z) * Math.min(1, dt * 4);
    hudT -= dt; if (hudT <= 0) { hudT = .2; updateHud(); }
    S.render(t);
  } else drawMenuBackdrop(t);
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.hidden = true; }
  requestAnimationFrame(frame);
}

// menu backdrop: a slowly panning generated world
let backdrop = null;
function drawMenuBackdrop(t) {
  if (!backdrop) { backdrop = true; if (!S.game) { S.newGame(12345); S.attachHelpers(S.game); } }
  const g = S.game;
  S.cam.x = g.camps.p.x + Math.sin(t * .05) * 300; S.cam.y = g.camps.p.y + Math.cos(t * .04) * 200; S.cam.z = S.baseZoom * .85;
  S.render(t);
}

requestAnimationFrame(t => { last = t; frame(t); });
})();
