// Main: boot, camera (drag, pinch, wheel), taps, loop, sound, save/load, offline income.
(() => {
'use strict';
const $ = S.$;
const cv = $('game'), cx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;

function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
  S.setCanvas(cx, W, H, DPR);
  S.viewW = W; S.viewH = H;
  S.baseZoom = S.clamp(Math.min(W, H) / 560, .62, 1.3);
}
window.addEventListener('resize', resize);
resize();

// ---------- sound ----------
let actx = null, soundOn = true, lastTapSnd = 0;
try { soundOn = localStorage.getItem('tribe-sound') !== '0'; } catch (e) {}
const audio = () => { if (!soundOn) return null; try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume(); } catch (e) { return null; } return actx; };
const tone = (f, d, type = 'triangle', v = .07, delay = 0) => {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), g = a.createGain(), t = a.currentTime + delay;
  o.type = type; o.frequency.setValueAtTime(f, t); g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(.001, t + d);
  o.connect(g); g.connect(a.destination); o.start(t); o.stop(t + d);
};
S.sound = k => {
  if (k === 'tap') { const n = performance.now(); if (n - lastTapSnd < 45) return; lastTapSnd = n; tone(330 * Math.pow(1.03, Math.min(40, S.game.combo.n)), .07, 'square', .035); }
  else if (k === 'hit') tone(160, .1, 'sawtooth', .06);
  else if (k === 'buy') { tone(523, .08); tone(784, .12, 'triangle', .06, .06); }
  else if (k === 'no') tone(140, .12, 'sine', .05);
  else if (k === 'build') { tone(392, .16); tone(523, .16, 'triangle', .07, .08); tone(659, .28, 'triangle', .07, .16); }
  else if (k === 'goal') { tone(659, .12); tone(880, .22, 'triangle', .07, .1); }
  else if (k === 'deer') { for (let i = 0; i < 5; i++) tone(880 + i * 160, .12, 'sine', .06, i * .05); }
  else if (k === 'era') { [392, 494, 587, 784].forEach((f, i) => tone(f, .35, 'triangle', .08, i * .12)); }
  else if (k === 'wolf') tone(220, .5, 'sawtooth', .04);
};

// ---------- save / load ----------
const KEY = 'tribe-clicker-v2';
S.save = () => { try { S.E.last = Date.now(); localStorage.setItem(KEY, JSON.stringify(S.E)); } catch (e) {} };
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (!d || d.v !== 2) return null;
    const fresh = S.newState(d.seed);
    // merge so saves from older builds pick up new fields
    for (const k in fresh) if (d[k] === undefined) d[k] = fresh[k];
    for (const k of ['w', 'b', 'stats']) d[k] = Object.assign(fresh[k], d[k]);
    return d;
  } catch (e) { return null; }
}
function boot(state) {
  S.E = state;
  S.world = S.genWorld(S.E.seed);
  S.initGame();
  const c = S.game.camp;
  S.cam.x = c.x; S.cam.y = c.y + 150; S.cam.z = S.baseZoom;
  S.renderShop(); S.updateTop();
}
const saved = load();
boot(saved || S.newState(Math.floor(Math.random() * 1e9)));
if (saved) {
  const away = (Date.now() - (saved.last || Date.now())) / 1000;
  const off = S.offlineGain(away);
  if (away > 60 && S.RES.some(k => off.gain[k] >= 1)) {
    const h = Math.floor(off.secs / 3600), m = Math.floor(off.secs % 3600 / 60);
    const parts = S.RES.filter(k => off.gain[k] >= 1).map(k => `<li><img src="${S.ICON[k]}" alt=""> +${S.fmt(off.gain[k])} ${S.RES_NAME[k]}</li>`).join('');
    S.modal(`<h2>С возвращением, вождь!</h2><p>Пока тебя не было ${h ? h + ' ч ' : ''}${m} мин, племя работало само.</p><ul class="gain">${parts}</ul>`,
      [{ label: 'Забрать', fn: () => { for (const k of S.RES) S.gain(k, off.gain[k]); S.sound('build'); } }]);
  }
} else S.toast('Тапай по деревьям и кустам, потом нанимай людей внизу', 4);

// ---------- menu ----------
$('menuBtn').onclick = () => {
  const st = S.E.stats;
  S.modal(`<h2>Эпохи Племени</h2><p class="small">Тапов: ${S.fmt(st.taps)} · оленей: ${st.deer} · волков прогнано: ${st.wolvesKilled} · лучшее комбо: ${st.bestCombo}</p>`, [
    { label: 'Звук: ' + (soundOn ? 'вкл' : 'выкл'), keep: true, fn: el => { soundOn = !soundOn; try { localStorage.setItem('tribe-sound', soundOn ? '1' : '0'); } catch (e) {} el.textContent = 'Звук: ' + (soundOn ? 'вкл' : 'выкл'); } },
    { label: 'Начать заново', keep: true, fn: el => {
      if (el.dataset.armed) { try { localStorage.removeItem(KEY); } catch (e) {} boot(S.newState(Math.floor(Math.random() * 1e9))); $('modal').hidden = true; S.toast('Новое племя начинает путь'); return; }
      el.dataset.armed = '1'; el.textContent = 'Точно? Весь прогресс сотрётся'; el.classList.add('danger');
    } },
    { label: 'Продолжить' },
  ]);
};

// ---------- camera & taps ----------
const ptrs = new Map();
let pinch = null;
const toWorld = (sx, sy) => ({ x: S.cam.x + (sx - W / 2) / S.cam.z, y: S.cam.y + (sy - H / 2) / S.cam.z });
const clampCam = () => {
  const c = S.game.camp;
  S.cam.x = S.clamp(S.cam.x, c.x - 1500, c.x + 1500); S.cam.y = S.clamp(S.cam.y, c.y - 1500, c.y + 1500);
  S.cam.z = S.clamp(S.cam.z, S.baseZoom * .45, S.baseZoom * 1.8);
};
cv.addEventListener('pointerdown', e => {
  audio();
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), moved: false });
  if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: S.cam.z, active: false }; }
});
cv.addEventListener('pointermove', e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y;
  p.x = e.clientX; p.y = e.clientY;
  if (Math.hypot(p.x - p.sx, p.y - p.sy) > 10) p.moved = true;
  if (ptrs.size === 1 && p.moved) { S.cam.x -= dx / S.cam.z; S.cam.y -= dy / S.cam.z; clampCam(); }
  else if (ptrs.size === 2 && pinch) {
    const [a, b] = [...ptrs.values()];
    const d = Math.hypot(a.x - b.x, a.y - b.y);
    if (Math.abs(d - pinch.d) > 12 || pinch.active) { pinch.active = true; S.cam.z = pinch.z * d / pinch.d; clampCam(); }
  }
});
const up = e => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  ptrs.delete(e.pointerId);
  if (!p.moved && !(pinch && pinch.active) && performance.now() - p.t < 450) { const w = toWorld(e.clientX, e.clientY); S.tapWorld(w.x, w.y); }
  if (ptrs.size < 2) pinch = null;
};
cv.addEventListener('pointerup', up);
cv.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = null; });
cv.addEventListener('wheel', e => { e.preventDefault(); S.cam.z *= e.deltaY > 0 ? .9 : 1.1; clampCam(); }, { passive: false });
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden) S.save(); });
window.addEventListener('pagehide', S.save);

// ---------- loop ----------
let last = performance.now(), uiT = 0, saveT = 5;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  for (let i = 0; i < (S.speed || 1); i++) { // S.speed: test hook for fast-forward
    const ev = S.tick(dt);
    if (ev) {
      const rew = Object.keys(ev.reward).map(k => '+' + S.fmt(ev.reward[k]) + ' ' + S.RES_NAME[k]).join(', ');
      S.toast('Цель выполнена! ' + rew, 3); S.sound('goal');
    }
    S.updateCity(dt);
  }
  S.render(now / 1000);
  S.updateCombo();
  S.uiTick(dt);
  uiT -= dt; if (uiT <= 0) { uiT = .25; S.updateTop(); S.renderShop(); }
  saveT -= dt; if (saveT <= 0) { saveT = 5; S.save(); }
  requestAnimationFrame(frame);
}
requestAnimationFrame(t => { last = t; frame(t); });
})();
