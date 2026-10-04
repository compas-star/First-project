// Rendering: ground, y-sorted sprites, buildings by era, units, fx, night lighting, guide arrow, joystick, map view.
(() => {
'use strict';

S.cam = { x: 0, y: 0, z: 1 };
const FAC_COL = { p: '#3b7dd8', r: '#c9453a', n: '#a39577', w: '#777' };
const FAC_DARK = { p: '#25569e', r: '#8e2b23', n: '#786d55', w: '#555' };
const OUT = 'rgba(30,22,14,.55)';

let ctx, W, H, DPR;
S.setCanvas = (c, w, h, dpr) => { ctx = c; W = w; H = h; DPR = dpr; };

// ---------- primitives ----------
const ell = (x, y, rx, ry, fill) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 6.283); ctx.fillStyle = fill; ctx.fill(); };
const shadow = (x, y, rx, ry = rx * .38) => ell(x, y, rx, ry, 'rgba(20,30,10,.25)');
const poly = (pts, fill, stroke) => { ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.2; ctx.stroke(); } };
const rect = (x, y, w, h, fill) => { ctx.fillStyle = fill; ctx.fillRect(x, y, w, h); };

S.drawIcon = (c, type, x, y, s = 1) => {
  const old = ctx; ctx = c;
  if (type === 'wood') {
    for (const [dx, dy] of [[-3, 2], [3, 2], [0, -3]]) { ctx.save(); ctx.translate(x + dx * s, y + dy * s); rect(-6 * s, -2.6 * s, 12 * s, 5.2 * s, '#9a6b3a'); ell(6 * s, 0, 1.6 * s, 2.6 * s, '#e3c48f'); ctx.restore(); }
  } else if (type === 'stone') {
    poly([x - 7 * s, y + 4 * s, x - 5 * s, y - 3 * s, x + 1 * s, y - 6 * s, x + 7 * s, y - 2 * s, x + 6 * s, y + 4 * s], '#9ea3aa', 'rgba(40,40,40,.35)');
    poly([x - 4 * s, y - 2 * s, x + 1 * s, y - 5 * s, x + 4 * s, y - 2 * s], '#c4c8ce');
  } else if (type === 'food') {
    for (const [dx, dy] of [[-3, 1], [3, 1], [0, -3], [0, 3]]) ell(x + dx * s, y + dy * s, 3.2 * s, 3.2 * s, '#d2384a');
    ell(x - 1 * s, y - 4 * s, 1.2 * s, 1.2 * s, '#ffb3bd');
  } else if (type === 'gp') {
    ctx.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = (i % 2 ? 3 : 7) * s; ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.closePath(); ctx.fillStyle = '#b07ce8'; ctx.fill();
  }
  ctx = old;
};
const icon = (type, x, y, s) => S.drawIcon(ctx, type, x, y, s);

// ---------- resources ----------
function drawTree(r, t) {
  let { x, y } = r;
  if (r.state === 'stump') { shadow(x, y, 9); ell(x, y - 2, 8, 4.5, '#7a5530'); ell(x, y - 3, 6, 3, '#d9b98a'); return; }
  let sc = 1;
  if (r.state === 'grow') sc = .25 + .75 * (1 - r.timer / 25);
  const shake = r.shake > 0 ? Math.sin(t * 60) * 2 : 0;
  ctx.save(); ctx.translate(x + shake, y);
  const p = S.game.player; // see-through when the tree hides the player
  if (r.y > p.y && r.y - p.y < 75 && Math.abs(r.x - p.x) < 28) ctx.globalAlpha = .45;
  if (r.state === 'fall') { const k = 1 - r.timer / .7; ctx.rotate(k * k * 1.5 * (r.fallDir || 1)); ctx.globalAlpha = Math.min(1, r.timer * 3); }
  ctx.scale(sc, sc);
  if (r.state !== 'fall') shadow(0, 0, 20);
  const pine = r.v < .55;
  rect(-3.5, -18, 7, 18, '#6e4a2a');
  if (pine) {
    const g1 = r.v < .25 ? '#2c6634' : '#336f39', g2 = '#3f8545';
    poly([-22, -14, 22, -14, 0, -44], g1); poly([-18, -30, 18, -30, 0, -60], g2); poly([-13, -46, 13, -46, 0, -74], g1);
    poly([0, -74, 13, -46, 4, -46], 'rgba(255,255,255,.08)');
  } else {
    const c1 = r.v > .8 ? '#4d8a35' : '#3f8a3a';
    ell(-10, -30, 14, 13, c1); ell(10, -30, 14, 13, c1); ell(0, -44, 17, 15, c1); ell(-3, -48, 9, 7, '#5aa548');
  }
  ctx.restore();
}
function drawRock(r) {
  const k = r.state === 'ok' ? .55 + .45 * r.amt / r.max : 0;
  if (!k) return;
  const s = 16 * k, x = r.x + (r.shake > 0 ? Math.sin(r.shake * 90) * 1.5 : 0), y = r.y;
  shadow(x, y, s * 1.4);
  poly([x - s * 1.3, y, x - s, y - s * 1.1, x - s * .1, y - s * 1.5, x + s * .9, y - s, x + s * 1.3, y], '#8f949b', OUT);
  poly([x - s * .9, y - s * 1.05, x - s * .1, y - s * 1.45, x + s * .7, y - s * .95, x - s * .1, y - s * .7], '#b5b9bf');
  if (r.v > .5) poly([x + s * .3, y - s * .2, x + s * 1.2, y - s * .1, x + s * 1.1, y - s * .7, x + s * .5, y - s * .8], '#7c8188');
}
function drawBush(r) {
  const { x, y } = r;
  shadow(x, y, 15);
  ell(x - 7, y - 9, 10, 9, '#3d7d36'); ell(x + 7, y - 9, 10, 9, '#3d7d36'); ell(x, y - 15, 11, 9, '#4b9142');
  if (r.state === 'ok') for (let i = 0; i < r.amt; i++) { const a = i * 2.1 + r.v * 6; ell(x + Math.cos(a) * 8, y - 11 + Math.sin(a) * 5, 2.8, 2.8, '#d2384a'); }
}

// ---------- buildings ----------
function flag(x, y, col, t) {
  rect(x - 1, y - 30, 2, 30, '#5b4128');
  poly([x + 1, y - 30, x + 15 + Math.sin(t * 4) * 2, y - 26, x + 1, y - 21], col);
}
function fire(x, y, t, big = 1) {
  for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; ell(x + Math.cos(a) * 15 * big, y + Math.sin(a) * 7 * big, 4.5, 3.5, '#8d9096'); }
  rect(x - 10, y - 3, 20, 4, '#6e4a2a');
  const f = 1 + Math.sin(t * 13) * .12 + Math.sin(t * 7.3) * .08;
  poly([x - 9 * big, y, x, y - 30 * f * big, x + 9 * big, y], '#f08a24');
  poly([x - 5 * big, y, x + 1, y - 19 * f * big, x + 5 * big, y], '#ffd25a');
}
function drawCenter(b, t) {
  const { x, y } = b, L = b.level, col = FAC_COL[b.fac];
  if (L >= 3 && L < 4) { // big hide tent
    shadow(x, y - 60, 46);
    poly([x - 44, y - 58, x, y - 138, x + 44, y - 58], '#b08458', OUT); poly([x - 9, y - 58, x, y - 88, x + 9, y - 58], '#4b3523');
    for (const dx of [-6, 0, 6]) rect(x + dx - 1, y - 148, 2, 16, '#6e4a2a');
  }
  if (L >= 4 && L < 6) { // mud-brick hall
    const w = L === 5 ? 120 : 96, h = L === 5 ? 66 : 50;
    shadow(x, y - 58, w * .55);
    rect(x - w / 2, y - 60 - h, w, h, '#c9a46a'); rect(x - w / 2 - 6, y - 66 - h, w + 12, 10, '#a8834e');
    rect(x - 10, y - 86, 20, 26, '#5a3e26'); ell(x, y - 66 - h - 8, 9, 9, '#d6a24a');
    for (let i = -1; i <= 1; i += 2) rect(x + i * w * .3 - 6, y - 60 - h * .7, 12, 12, '#4a3a2a');
  }
  if (L >= 6) { // stone keep
    shadow(x, y - 58, 70);
    rect(x - 60, y - 140, 120, 80, '#a3a6ab'); for (let i = 0; i < 6; i++) rect(x - 60 + i * 21, y - 152, 13, 12, '#a3a6ab');
    rect(x - 12, y - 92, 24, 32, '#4a3a2a'); poly([x - 70, y - 140, x - 40, y - 180, x - 10, y - 140], '#b9463a');
    flag(x + 40, y - 150, col, t);
  }
  fire(x, y, t, L >= 2 ? 1.15 : 1);
  if (L >= 2) { rect(x + 38, y - 44, 8, 44, '#7a5530'); rect(x + 35, y - 46, 14, 8, col); rect(x + 35, y - 30, 14, 5, '#d9b98a'); rect(x - 46, y + 10, 26, 7, '#6e4a2a'); }
}
function drawHut(b) {
  const { x, y } = b, L = b.level, col = FAC_COL[b.fac];
  shadow(x, y, 34);
  if (L === 1) {
    poly([x - 30, y, x - 4, y - 46, x + 26, y], '#8a6a3c', OUT);
    ctx.strokeStyle = 'rgba(60,40,20,.5)'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let i = -2; i <= 2; i++) { ctx.moveTo(x - 4, y - 46); ctx.lineTo(x + i * 12, y); } ctx.stroke();
    poly([x - 8, y, x - 3, y - 18, x + 4, y], '#3d2b1a');
    rect(x + 14, y - 10, 10, 3, col);
  } else if (L === 2) {
    rect(x - 26, y - 26, 52, 26, '#b48a5a'); poly([x - 34, y - 24, x, y - 64, x + 34, y - 24], '#d2b25e', OUT);
    poly([x - 34, y - 24, x, y - 64, x - 8, y - 24], 'rgba(255,255,255,.12)');
    rect(x - 7, y - 20, 14, 20, '#4a3523'); rect(x - 26, y - 30, 52, 4, col);
  } else {
    rect(x - 32, y - 40, 64, 40, '#c9a46a'); rect(x - 36, y - 46, 72, 8, '#a8834e');
    rect(x - 8, y - 24, 16, 24, '#5a3e26'); rect(x + 14, y - 32, 10, 10, '#3e2f22'); rect(x - 24, y - 32, 10, 10, '#3e2f22');
    rect(x - 36, y - 50, 72, 4, col);
  }
}
function drawStorage(b) {
  const { x, y } = b, L = b.level;
  shadow(x, y, 40);
  if (L <= 2) {
    const w = L === 1 ? 56 : 76;
    for (let row = 0; row < 3; row++) for (let i = 0; i < 4 - row; i++) { const lx = x - w / 2 + 8 + i * (w - 16) / 3.4 + row * 8, ly = y - 6 - row * 9; ell(lx, ly, 8, 5, '#8a5f33'); ell(lx + 6, ly, 3, 4.5, '#e3c48f'); }
    rect(x - w / 2, y - 52, 4, 52, '#6e4a2a'); rect(x + w / 2 - 4, y - 52, 4, 52, '#6e4a2a');
    poly([x - w / 2 - 8, y - 48, x, y - 66, x + w / 2 + 8, y - 48], L === 1 ? '#8a6a3c' : '#d2b25e', OUT);
  } else {
    rect(x - 26, y - 56, 52, 56, '#c9a46a'); poly([x - 34, y - 54, x, y - 92, x + 34, y - 54], '#d2b25e', OUT); rect(x - 7, y - 22, 14, 22, '#5a3e26');
    ell(x - 46, y - 6, 9, 6, '#d2384a'); ell(x + 46, y - 6, 9, 6, '#9ea3aa');
  }
}
function drawTower(b, t) {
  const { x, y } = b, L = b.level, col = FAC_COL[b.fac];
  shadow(x, y, 24);
  if (L === 1) {
    for (const dx of [-14, 12]) rect(x + dx, y - 62, 4, 62, '#6e4a2a');
    ctx.strokeStyle = '#6e4a2a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - 12, y - 10); ctx.lineTo(x + 12, y - 40); ctx.moveTo(x + 12, y - 10); ctx.lineTo(x - 12, y - 40); ctx.stroke();
    rect(x - 20, y - 66, 40, 8, '#8a6a3c'); rect(x - 20, y - 78, 40, 4, '#8a6a3c');
    poly([x - 24, y - 78, x, y - 98, x + 24, y - 78], '#a07a48', OUT); flag(x + 18, y - 96, col, t);
  } else {
    rect(x - 20, y - 82, 40, 82, '#a3a6ab'); rect(x - 20, y - 82, 8, 82, '#b8bbc0');
    for (let i = 0; i < 4; i++) rect(x - 22 + i * 12, y - 92, 8, 10, '#a3a6ab');
    rect(x - 4, y - 60, 8, 14, '#3e3a36'); flag(x + 14, y - 92, col, t);
  }
}
function drawFarm(b, t) {
  const { x, y } = b, w = 200, h = 120, L = b.level;
  rect(x - w / 2, y - h / 2, w, h, '#8a6a42');
  for (let i = 0; i < 7; i++) {
    const ry = y - h / 2 + 12 + i * 16;
    for (let j = 0; j < 14; j++) {
      const rx = x - w / 2 + 8 + j * 13.5, sway = Math.sin(t * 2 + j * .5 + i) * 1.5;
      ctx.strokeStyle = L === 2 ? '#e2c04a' : '#9cc24a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx + sway, ry - 9); ctx.stroke();
    }
  }
  if (L === 2) { rect(x - w / 2, y + h / 2 - 4, w, 5, '#4f8fd1'); }
  ctx.strokeStyle = '#6e4a2a'; ctx.lineWidth = 2; ctx.strokeRect(x - w / 2, y - h / 2, w, h);
}
function drawWonder0(b) {
  const { x, y } = b;
  shadow(x, y, 90, 34);
  const n = 10, pts = [];
  for (let i = 0; i < n; i++) { const a = i / n * 6.283; pts.push({ a, x: x + Math.cos(a) * 78, y: y + Math.sin(a) * 34 }); }
  pts.sort((p, q) => p.y - q.y);
  for (const p of pts) { rect(p.x - 8, p.y - 44, 16, 44, '#9a9ea5'); rect(p.x - 8, p.y - 44, 5, 44, '#b8bcc2'); }
  for (let i = 0; i < n; i += 2) { const a = i / n * 6.283, a2 = (i + 1) / n * 6.283; const x1 = x + Math.cos(a) * 78, y1 = y + Math.sin(a) * 34, x2 = x + Math.cos(a2) * 78, y2 = y + Math.sin(a2) * 34; if (Math.sin(a) > -.2) poly([x1 - 9, y1 - 44, x2 + 9, y2 - 44, x2 + 9, y2 - 52, x1 - 9, y1 - 52], '#8a8e95'); }
  ell(x, y - 6, 12, 6, '#7d6b8f');
}
function drawWonder1(b) {
  const { x, y } = b;
  shadow(x, y, 110, 40);
  const tiers = [[200, 34], [150, 30], [104, 28], [62, 26]];
  let yy = y;
  tiers.forEach(([w, h], i) => { rect(x - w / 2, yy - h, w, h, i % 2 ? '#d9b77c' : '#cfa96a'); rect(x - w / 2, yy - h, w, 4, '#e8cf9a'); yy -= h; });
  rect(x - 14, y - 118, 28, 118, 'rgba(120,80,40,.35)');
  for (let i = 0; i < 12; i++) rect(x - 14, y - 10 - i * 9.5, 28, 2, '#a07a48');
  rect(x - 20, yy - 24, 40, 24, '#b07ce8'); poly([x - 26, yy - 24, x, yy - 42, x + 26, yy - 24], '#8a56c4');
}
function drawWallStake(x, y, level, broken, i) {
  if (broken && i % 3 === 0) { rect(x - 9, y - 4, 18, 5, level === 1 ? '#6e4a2a' : '#8d9096'); return; }
  if (level === 1) { rect(x - 4, y - 28, 8, 28, '#8a5f33'); poly([x - 4, y - 28, x, y - 36, x + 4, y - 28], '#8a5f33'); rect(x - 4, y - 28, 3, 28, '#a77a48'); }
  else { rect(x - 9, y - 30, 18, 30, '#9ea2a8'); rect(x - 9, y - 30, 18, 4, '#b9bdc2'); if (i % 2) rect(x - 9, y - 38, 9, 8, '#9ea2a8'); }
}

// ---------- units ----------
function drawHuman(u, t, carry) {
  const { x, y } = u, f = u.face;
  const hurt = u.hurt > 0;
  const tunic = hurt ? '#ff6b5b' : u.kind === 'player' ? '#2f6fd0' : FAC_COL[u.fac];
  const ph = u.moving ? Math.sin(u.walk) : 0;
  shadow(x, y, 11);
  ctx.strokeStyle = '#4a3523'; ctx.lineWidth = 3.4; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x - 3, y - 12); ctx.lineTo(x - 3 + ph * 5, y - 1); ctx.moveTo(x + 3, y - 12); ctx.lineTo(x + 3 - ph * 5, y - 1); ctx.stroke();
  // back stack behind body
  if (carry && carry.length) drawStack(x - f * 10, y - 22, carry, u.walk, u.moving);
  ctx.fillStyle = tunic; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - 8, y - 28, 16, 17, 4) : ctx.rect(x - 8, y - 28, 16, 17); ctx.fill();
  rect(x - 8, y - 15, 16, 3, '#5b4128');
  ell(x, y - 34, 6.5, 6.5, '#e8b98a');
  ctx.fillStyle = u.kind === 'player' ? '#3a2616' : u.fac === 'r' ? '#2a1d14' : '#6b4a2a';
  ctx.beginPath(); ctx.arc(x, y - 35, 6.8, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
  if (u.kind === 'player') rect(x - 7, y - 37, 14, 2.4, '#ffcc2e');
  if (S.eraOf(S.campLevel(u.fac === 'n' ? 'p' : u.fac)) >= 1 && (u.kind === 'warrior' || u.kind === 'player')) { ctx.fillStyle = '#c7913a'; ctx.beginPath(); ctx.arc(x, y - 36, 7.2, Math.PI, 0); ctx.fill(); }
  ell(x + f * 3, y - 34, 1.2, 1.4, '#2a1d14');
  // arm + tool
  const sw = u.swing > 0 ? Math.sin((1 - u.swing / .25) * Math.PI) : 0;
  ctx.save(); ctx.translate(x + f * 6, y - 24); ctx.scale(f, 1); ctx.rotate(-.9 + sw * 2.0);
  ctx.strokeStyle = '#e8b98a'; ctx.lineWidth = 3.2; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(6, 6); ctx.stroke();
  if (u.kind !== 'neutral') {
    ctx.strokeStyle = '#6e4a2a'; ctx.lineWidth = 2.4; ctx.beginPath(); ctx.moveTo(4, 8); ctx.lineTo(14, -6); ctx.stroke();
    if (u.kind === 'warrior') { ctx.strokeStyle = '#c7c9cc'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(14, -6); ctx.lineTo(20, -14); ctx.stroke(); }
    else poly([12, -8, 18, -9, 17, -2, 12, -3], S.eraOf(S.campLevel(u.fac === 'n' ? 'p' : u.fac)) >= 1 ? '#c7913a' : '#8d9096');
  }
  ctx.restore();
  if (u.kind === 'neutral') {
    if (u.state === 'wander') { const by = y - 58 + Math.sin(t * 4) * 3; ell(x, by, 9, 9, '#ffcc2e'); ctx.fillStyle = '#3a2616'; ctx.font = 'bold 13px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', x, by + 1); }
    if (u.state === 'wait') { ell(x, y - 58, 11, 9, 'rgba(255,255,255,.9)'); ctx.save(); ctx.translate(x, y - 52); ctx.scale(.3, .3); poly([-30, 0, -4, -46, 26, 0], '#8a6a3c'); ctx.restore(); }
  }
  if (u.fac === 'p' && u.kind === 'worker' && S.game.res.food <= 0) { ctx.fillStyle = '#fff'; ctx.font = '11px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.fillText('голоден', x, y - 48); }
}
function drawStack(x, y, items, walk, moving) {
  for (let i = 0; i < items.length; i++) {
    const sway = moving ? Math.sin(walk * .5 + i * .25) * i * .18 : 0;
    const iy = y - i * 7.2, ix = x + sway;
    const it = items[i];
    if (it === 'wood') { rect(ix - 9, iy - 3.5, 18, 7, '#9a6b3a'); ell(ix + 9, iy, 2, 3.5, '#e3c48f'); rect(ix - 9, iy - 3.5, 18, 2, '#b4824c'); }
    else if (it === 'stone') { ell(ix, iy, 8, 4.2, '#9ea3aa'); ell(ix - 2, iy - 1.5, 4, 2, '#c4c8ce'); }
    else { ell(ix, iy, 8, 4, '#a57a43'); ell(ix - 3, iy - 3, 2.6, 2.6, '#d2384a'); ell(ix + 2, iy - 3.4, 2.6, 2.6, '#d2384a'); }
  }
}
function drawBeast(u, t) {
  const { x, y } = u, f = u.face, ph = u.moving ? Math.sin(u.walk * 1.3) : 0;
  const hurt = u.hurt > 0;
  if (u.kind === 'deer') {
    shadow(x, y, 16);
    ctx.strokeStyle = '#7a5530'; ctx.lineWidth = 2.2; ctx.beginPath();
    for (const [dx, s] of [[-9, 1], [-5, -1], [6, 1], [10, -1]]) { ctx.moveTo(x + dx * f, y - 14); ctx.lineTo(x + dx * f + ph * 4 * s, y); } ctx.stroke();
    ell(x, y - 17, 15, 7, hurt ? '#ff8b7b' : '#b98a55'); ell(x - 13 * f, y - 19, 3, 3, '#f3ebe0');
    poly([x + 10 * f, y - 20, x + 16 * f, y - 32, x + 20 * f, y - 30, x + 14 * f, y - 18], '#b98a55');
    ell(x + 19 * f, y - 32, 5, 3.6, '#a87a48');
    ctx.strokeStyle = '#6e4a2a'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x + 17 * f, y - 35); ctx.lineTo(x + 14 * f, y - 46); ctx.moveTo(x + 15 * f, y - 41); ctx.lineTo(x + 10 * f, y - 44); ctx.moveTo(x + 20 * f, y - 35); ctx.lineTo(x + 24 * f, y - 45); ctx.stroke();
    return;
  }
  const bear = u.kind === 'bear', s = bear ? 1.45 : 1;
  const body = hurt ? '#ff8b7b' : bear ? '#6b4426' : '#7d8088', dark = bear ? '#4f311b' : '#5e6168';
  shadow(x, y, 16 * s);
  ctx.strokeStyle = dark; ctx.lineWidth = 3 * s; ctx.lineCap = 'round'; ctx.beginPath();
  for (const [dx, sg] of [[-9, 1], [-5, -1], [6, 1], [10, -1]]) { ctx.moveTo(x + dx * f * s, y - 9 * s); ctx.lineTo(x + dx * f * s + ph * 4 * sg, y); } ctx.stroke();
  if (!bear) { ctx.strokeStyle = body; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x - 13 * f, y - 13); ctx.quadraticCurveTo(x - 22 * f, y - 16, x - 24 * f, y - 8); ctx.stroke(); }
  ell(x, y - 13 * s, 15 * s, 7.5 * s, body);
  ell(x + 14 * f * s, y - 17 * s, 7 * s, 6 * s, body);
  ell(x + 20 * f * s, y - 15 * s, 4 * s, 3 * s, dark);
  if (bear) { ell(x + 11 * f * s, y - 23 * s, 2.6 * s, 2.6 * s, dark); ell(x + 17 * f * s, y - 23 * s, 2.6 * s, 2.6 * s, dark); }
  else { poly([x + 10 * f, y - 21, x + 12 * f, y - 29, x + 15 * f, y - 21], body); poly([x + 14 * f, y - 21, x + 17 * f, y - 28, x + 18 * f, y - 20], body); }
  const eye = S.game.dark > .3 ? '#ffe45a' : '#1e1e1e';
  ell(x + 16 * f * s, y - 18 * s, 1.3 * s, 1.3 * s, eye);
}
function hpBar(x, y, hp, max, col = '#5bd16a') {
  if (hp >= max || hp <= 0) return;
  rect(x - 14, y, 28, 4, 'rgba(0,0,0,.5)'); rect(x - 14, y, 28 * hp / max, 4, hp / max < .35 ? '#ff5a46' : col);
}

// ---------- pads ----------
const PAD_FONT = '600 13px Rubik, sans-serif';
function drawPad(info, t) {
  const { x, y, size } = info, h = size / 2, g = S.game;
  const p = g.player, on = Math.abs(p.x - x) < h && Math.abs(p.y - y) < h;
  ctx.save();
  ctx.fillStyle = info.locked ? 'rgba(60,60,60,.25)' : on ? 'rgba(255,230,140,.35)' : 'rgba(255,255,255,.18)';
  ctx.strokeStyle = info.locked ? 'rgba(80,80,80,.7)' : '#fff8dc';
  ctx.lineWidth = 2.5; ctx.setLineDash([8, 6]); ctx.lineDashOffset = -t * 20;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - h, y - h, size, size, 10) : ctx.rect(x - h, y - h, size, size); ctx.fill(); ctx.stroke(); ctx.setLineDash([]);
  const total = Object.values(info.cost).reduce((a, b) => a + b, 0) || 1;
  const done = Object.keys(info.cost).reduce((a, r) => a + Math.min(info.cost[r], info.b.prog[r] || 0), 0);
  if (done > 0) { ctx.fillStyle = 'rgba(120,200,90,.45)'; ctx.fillRect(x - h + 3, y + h - 3 - (size - 6) * done / total, size - 6, (size - 6) * done / total); }
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  if (!info.plot) { ctx.fillStyle = '#fff8dc'; ctx.font = 'bold 20px Rubik, sans-serif'; ctx.fillText('▲', x, y); }
  // label
  const label = (info.plot ? '' : '↑ ') + info.next.name;
  ctx.font = PAD_FONT;
  const lw = ctx.measureText(label).width + 14, ly = y - h - 16;
  ctx.fillStyle = 'rgba(30,24,16,.72)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x - lw / 2, ly - 10, lw, 20, 6) : ctx.rect(x - lw / 2, ly - 10, lw, 20); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText(label, x, ly + 1);
  // costs
  const left = S.remaining(info), keys = Object.keys(left);
  if (info.locked) { ctx.fillStyle = '#ffd36b'; ctx.font = '12px Rubik, sans-serif'; ctx.fillText('🔒', x, y + (info.plot ? 0 : 22)); }
  else if (keys.length) {
    const cw = 50, cx0 = x - (keys.length * cw) / 2 + cw / 2, cy = y + h + 14;
    keys.forEach((r, i) => {
      const cx = cx0 + i * cw;
      ctx.fillStyle = 'rgba(30,24,16,.72)'; ctx.beginPath(); ctx.roundRect ? ctx.roundRect(cx - 23, cy - 10, 46, 20, 6) : ctx.rect(cx - 23, cy - 10, 46, 20); ctx.fill();
      icon(r, cx - 12, cy, .8);
      ctx.fillStyle = g.res[r] + g.carry.filter(c => c === r).length >= left[r] ? '#c9f5a8' : '#fff'; ctx.font = '600 12px Rubik, sans-serif'; ctx.textAlign = 'left'; ctx.fillText(left[r], cx - 3, cy + 1); ctx.textAlign = 'center';
    });
  }
  ctx.restore();
}

// ---------- main render ----------
const lightCanvas = document.createElement('canvas');
S.render = t => {
  const g = S.game, cam = S.cam, z = cam.z;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  ctx.fillStyle = '#2d5a2a'; ctx.fillRect(0, 0, W, H);
  if (S.mode === 'map') { drawMap(t); return; }
  const left = cam.x - W / 2 / z, top = cam.y - H / 2 / z, right = cam.x + W / 2 / z, bottom = cam.y + H / 2 / z;
  ctx.setTransform(z * DPR, 0, 0, z * DPR, (W / 2 - cam.x * z) * DPR, (H / 2 - cam.y * z) * DPR);

  // ground
  const q = Math.min(2, Math.round(z * DPR * 2) / 2), CP = S.CHUNK_PX;
  for (let cy = Math.floor(top / CP); cy <= Math.floor(bottom / CP); cy++) for (let cx = Math.floor(left / CP); cx <= Math.floor(right / CP); cx++) {
    if (cx < 0 || cy < 0 || cx * CP >= S.WORLD || cy * CP >= S.WORLD) continue;
    ctx.drawImage(S.groundChunk(cx, cy, q), cx * CP, cy * CP, CP, CP);
  }
  const vis = (x, y, m = 120) => x > left - m && x < right + m && y > top - m && y < bottom + m * 2;

  // flat layer: farms, stockpile, pads
  for (const b of g.buildings) if (b.type === 'farm' && b.level > 0 && vis(b.x, b.y, 200)) drawFarm(b, t);
  for (const fac of ['p', 'r']) {
    const st = S.stockPos(fac);
    if (!vis(st.x, st.y)) continue;
    ell(st.x, st.y, 40, 20, 'rgba(90,70,40,.35)');
    const res = fac === 'p' ? g.res : g.rival.res;
    const piles = [['wood', -18, 0], ['stone', 14, -4], ['food', 0, 10]];
    for (const [r, dx, dy] of piles) { const n = Math.min(6, Math.ceil((res[r] || 0) / 10)); for (let i = 0; i < n; i++) icon(r, st.x + dx + (i % 3) * 5 - 5, st.y + dy - Math.floor(i / 3) * 6 - i * .5, 1.1); }
  }
  for (const info of S.activePads()) if (vis(info.x, info.y, 200)) drawPad(info, t);

  // sprites, y-sorted
  const list = [];
  for (const r of g.visRes = collectRes(left, top, right, bottom)) list.push({ y: r.y, k: 'r', o: r });
  for (const b of g.buildings) {
    if (b.level < 1 || b.type === 'farm') continue;
    if (b.type === 'wall') {
      const c = g.camps[b.fac], n = b.level === 1 ? 150 : 90;
      for (let i = 0; i < n; i++) { const a = i / n * 6.283, x = c.x + Math.cos(a) * S.WALL_R, y = c.y + Math.sin(a) * S.WALL_R; if (vis(x, y, 40)) list.push({ y, k: 'w', x, i, b }); }
      continue;
    }
    if (vis(b.x, b.y, 220)) list.push({ y: b.y, k: 'b', o: b });
  }
  for (const u of g.allUnits) if (!u.dead && vis(u.x, u.y)) list.push({ y: u.y, k: 'u', o: u });
  list.sort((a, b) => a.y - b.y);
  for (const e of list) {
    if (e.k === 'r') { const r = e.o; if (r.kind === 'tree') drawTree(r, t); else if (r.kind === 'rock') drawRock(r); else drawBush(r); }
    else if (e.k === 'w') drawWallStake(e.x, e.y, e.b.level, e.b.broken, e.i);
    else if (e.k === 'b') {
      const b = e.o;
      ({ center: drawCenter, hut: drawHut, storage: drawStorage, tower: drawTower, wonder0: drawWonder0, wonder1: drawWonder1 })[b.type](b, t);
      if (b.hp < S.maxHp(b) && b.type !== 'wall') hpBar(b.x, b.y + 8, b.hp, S.maxHp(b), '#e8c25a');
    } else {
      const u = e.o;
      if (u.kind === 'wolf' || u.kind === 'bear' || u.kind === 'deer') { drawBeast(u, t); hpBar(u.x, u.y - 34, u.hp, u.maxHp); }
      else { drawHuman(u, t, u.kind === 'player' ? g.carry : u.carry); hpBar(u.x, u.y - 52, u.hp, u.maxHp); }
    }
  }
  // walls hp bar near gate pad
  for (const fac of ['p', 'r']) { const w = S.wallB(fac); if (w && w.level && w.hp < S.maxHp(w)) { const c = g.camps[fac]; hpBar(c.x, c.y + S.WALL_R + 12, w.hp, S.maxHp(w), '#e8c25a'); } }

  // arrows
  ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = 2;
  for (const a of g.proj) { ctx.beginPath(); ctx.moveTo(a.x - Math.cos(a.ang) * 12, a.y - Math.sin(a.ang) * 12); ctx.lineTo(a.x, a.y); ctx.stroke(); }

  // fx
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const f of g.fx) {
    if (f.k === 'p') { ctx.globalAlpha = Math.min(1, f.life * 2); rect(f.x - f.size / 2, f.y - f.z - f.size / 2, f.size, f.size, f.color); }
    else if (f.k === 'item') {
      const k = Math.min(1, f.t / f.dur), tx = f.to.x, ty = f.to.y - (f.to.kind ? 40 : 10);
      const x = f.x0 + (tx - f.x0) * k, y = f.y0 + (ty - f.y0) * k - Math.sin(k * Math.PI) * 40;
      icon(f.type, x, y, 1);
    } else if (f.k === 'text') {
      ctx.globalAlpha = Math.min(1, f.life * 2); ctx.font = '600 15px Rubik, sans-serif';
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(20,14,8,.8)'; const y = f.y - (1.2 - f.life) * 30;
      ctx.strokeText(f.text, f.x, y); ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, y);
    }
    ctx.globalAlpha = 1;
  }

  // night
  if (g.dark > 0) drawNight(z, t);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  drawGuide(t);
  drawJoystick();
};

function collectRes(l, tp, r, b) {
  const out = [];
  S.forResNear((l + r) / 2, (tp + b) / 2, Math.max(r - l, b - tp) / 2 + 120, res => {
    if (res.state === 'gone') return;
    if (res.x > l - 60 && res.x < r + 60 && res.y > tp - 20 && res.y < b + 100) out.push(res);
  });
  return out;
}

function drawNight(z, t) {
  const g = S.game;
  if (lightCanvas.width !== Math.round(W * DPR) || lightCanvas.height !== Math.round(H * DPR)) { lightCanvas.width = Math.round(W * DPR); lightCanvas.height = Math.round(H * DPR); }
  const l = lightCanvas.getContext('2d');
  l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'source-over';
  l.clearRect(0, 0, lightCanvas.width, lightCanvas.height);
  l.fillStyle = `rgba(12,16,42,${.66 * g.dark})`; l.fillRect(0, 0, lightCanvas.width, lightCanvas.height);
  l.globalCompositeOperation = 'destination-out';
  const toS = (x, y) => [((x - S.cam.x) * z + W / 2) * DPR, ((y - S.cam.y) * z + H / 2) * DPR];
  const light = (x, y, r) => { const [sx, sy] = toS(x, y), rr = r * z * DPR * (1 + Math.sin(t * 9 + x) * .02); const gr = l.createRadialGradient(sx, sy, 0, sx, sy, rr); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(.55, 'rgba(0,0,0,.75)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); l.fillStyle = gr; l.fillRect(sx - rr, sy - rr, rr * 2, rr * 2); };
  for (const fac of ['p', 'r']) { const c = g.camps[fac]; light(c.x, c.y - 10, 300); }
  for (const b of g.buildings) if (b.level > 0 && (b.type === 'tower' || b.type === 'hut' || b.type.startsWith('wonder'))) light(b.x, b.y - 30, b.type === 'tower' ? 170 : 110);
  light(g.player.x, g.player.y - 20, 150);
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(lightCanvas, 0, 0); ctx.restore();
}

function drawGuide(t) {
  const g = S.game, p = g.player;
  if (p.dead) return;
  const target = S.guideTarget();
  if (!target) return;
  const z = S.cam.z, sx = (target.x - S.cam.x) * z + W / 2, sy = (target.y - S.cam.y) * z + H / 2;
  const m = 46, onScreen = sx > m && sx < W - m && sy > m + 60 && sy < H - m;
  ctx.save();
  if (onScreen) {
    const by = sy - 60 * z - 14 + Math.sin(t * 5) * 6;
    ctx.translate(sx, by); poly([-11, -14, 11, -14, 0, 4], '#ffcc2e', 'rgba(60,40,10,.8)');
  } else {
    const cx = W / 2, cy = H / 2, a = Math.atan2(sy - cy, sx - cx);
    const ex = S.clamp(cx + Math.cos(a) * W, m, W - m), ey = S.clamp(cy + Math.sin(a) * H, m + 70, H - m - 20);
    ctx.translate(ex, ey); ctx.rotate(a);
    ell(0, 0, 20, 20, 'rgba(30,24,16,.6)');
    poly([14, 0, -6, -10, -2, 0, -6, 10], '#ffcc2e');
  }
  ctx.restore();
}
function drawJoystick() {
  const j = S.input.joy; if (!j) return;
  ctx.globalAlpha = .55;
  ctx.beginPath(); ctx.arc(j.ox, j.oy, S.JOY_R, 0, 6.283); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.6)'; ctx.lineWidth = 2; ctx.stroke();
  const dx = j.x - j.ox, dy = j.y - j.oy, d = Math.hypot(dx, dy), k = d > S.JOY_R ? S.JOY_R / d : 1;
  ctx.beginPath(); ctx.arc(j.ox + dx * k, j.oy + dy * k, 24, 0, 6.283); ctx.fillStyle = 'rgba(255,255,255,.8)'; ctx.fill();
  ctx.globalAlpha = 1;
}

// ---------- strategic map (overview for now) ----------
function drawMap(t) {
  const g = S.game;
  if (S.minimapDirty || !S.minimap) S.renderMinimap();
  const pad = 16, top = 70;
  const size = Math.min(W - pad * 2, H - top - 90), ox = (W - size) / 2, oy = top;
  const k = size / S.WORLD;
  ctx.fillStyle = '#1e2a1c'; ctx.fillRect(0, 0, W, H);
  ctx.imageSmoothingEnabled = false; ctx.drawImage(S.minimap, ox, oy, size, size); ctx.imageSmoothingEnabled = true;
  ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 1; ctx.strokeRect(ox, oy, size, size);
  const P = (x, y) => [ox + x * k, oy + y * k];
  for (const fac of ['p', 'r']) {
    const c = g.camps[fac], [x, y] = P(c.x, c.y);
    if (S.wallUp(fac)) { ctx.beginPath(); ctx.arc(x, y, S.WALL_R * k, 0, 6.283); ctx.strokeStyle = FAC_COL[fac]; ctx.lineWidth = 2; ctx.stroke(); }
    for (const b of g.buildings) if (b.fac === fac && b.level > 0 && b.type !== 'wall') { const [bx, by] = P(b.x, b.y); ctx.fillStyle = FAC_COL[fac]; ctx.fillRect(bx - 3, by - 3, 6, 6); }
    ctx.font = '600 13px Rubik, sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.7)';
    const label = fac === 'p' ? 'Твой лагерь' : 'Соседнее племя', lv = S.BLD.center.levels[S.campLevel(fac)].name;
    ctx.strokeText(label, x, y - 18); ctx.fillStyle = '#fff'; ctx.fillText(label, x, y - 18);
    ctx.font = '11px Rubik, sans-serif'; ctx.strokeText(lv, x, y + 22); ctx.fillText(lv, x, y + 22);
  }
  for (const u of g.units) {
    if (u.dead) continue;
    const [x, y] = P(u.x, u.y);
    ctx.fillStyle = u.kind === 'neutral' ? '#ffcc2e' : u.fac === 'p' ? '#9cc8ff' : u.fac === 'r' ? '#ff9a8a' : u.kind === 'deer' ? '#d9b98a' : '#3a3a3a';
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
  const [px, py] = P(g.player.x, g.player.y);
  ctx.beginPath(); ctx.arc(px, py, 5 + Math.sin(t * 6), 0, 6.283); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#2f6fd0'; ctx.lineWidth = 2; ctx.stroke();
  // legend
  ctx.font = '12px Rubik, sans-serif'; ctx.textAlign = 'left'; ctx.fillStyle = 'rgba(255,255,255,.8)';
  const ly = oy + size + 22;
  const items = [['#ffcc2e', 'поселенцы'], ['#3a3a3a', 'звери'], ['#ff9a8a', 'соседи']];
  let lx = ox; for (const [c, s] of items) { ctx.fillStyle = c; ctx.fillRect(lx, ly - 5, 8, 8); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillText(s, lx + 12, ly); lx += ctx.measureText(s).width + 30; }
}
})();
