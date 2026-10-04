// City: turns economy levels into what stands on the map, towers, event timers, taps and combo, day/night.
(() => {
'use strict';

S.initGame = () => {
  const camp = S.world.camps.p;
  S.game = { time: 0, clock: 40, night: false, dark: 0, camp, stock: { x: camp.x + S.STOCK.dx, y: camp.y + S.STOCK.dy },
    units: [], proj: [], fx: [], combo: { n: 0, last: -9, shown: 0 }, nextDeer: 45, nextWolves: 110, popupBudget: 4, syncT: 0, towerCd: [0, 0, 0, 0] };
  S.syncWorkers();
};

// ---------- what stands where ----------
let cache = null, sig = '';
S.cityBuildings = () => {
  const E = S.E, b = E.b, c = S.game.camp;
  const s = JSON.stringify(b) + E.era + ',' + E.wonder.idx + ',' + E.wonder.stage;
  if (s === sig && cache) return cache;
  sig = s; const out = [];
  const at = (slot, i = 0) => ({ x: c.x + S.SLOTS[slot][i][0], y: c.y + S.SLOTS[slot][i][1] });
  const ms = l => S.milestones(l);
  out.push(Object.assign({ type: 'center', key: 'center', style: E.era === 0 ? 1 + Math.min(2, ms(b.center)) : E.era === 1 ? (b.center >= 25 ? 5 : 4) : 6 }, at('center')));
  for (let i = 0; i < 8; i++) if (b.house > i * 3) out.push(Object.assign({ type: 'hut', key: 'house', style: E.era === 0 ? (b.house >= 15 ? 2 : 1) : 3 }, at('house', i)));
  if (b.sawmill) out.push(Object.assign({ type: 'storage', key: 'sawmill', style: 1 + Math.min(2, ms(b.sawmill)) }, at('sawmill')));
  if (b.quarry) out.push(Object.assign({ type: 'quarry', key: 'quarry', style: 1 + Math.min(2, ms(b.quarry)) }, at('quarry')));
  if (b.garden) out.push(Object.assign({ type: 'farm', key: 'garden', style: E.era === 0 ? 1 : 2, flat: true }, at('garden')));
  const towers = b.tower ? Math.min(4, 1 + Math.floor(b.tower / 3)) : 0;
  for (let i = 0; i < towers; i++) out.push(Object.assign({ type: 'tower', key: 'tower', style: E.era >= 1 ? 2 : 1, idx: i }, at('tower', i)));
  for (let i = 0; i < 3; i++) {
    if (E.wonder.idx > i) out.push(Object.assign({ type: 'wonder' + i, key: 'wonder', progress: 1 }, at('wonder', i)));
    else if (E.wonder.idx === i && E.wonder.stage > 0) out.push(Object.assign({ type: 'wonder' + i, key: 'wonder', progress: E.wonder.stage / S.WONDER_STAGES }, at('wonder', i)));
  }
  cache = out; return out;
};

// ---------- taps ----------
S.comboMult = () => 1 + Math.max(0, S.game.combo.n - 1) * .05;
S.tapWorld = (wx, wy) => {
  const g = S.game, E = S.E, z = S.cam.z, R = 34 / Math.min(1, z);
  // golden deer first, then wolves
  for (const u of g.units) if (u.kind === 'deer' && Math.hypot(u.x - wx, u.y - 16 - wy) < R * 1.6) { S.catchDeer(u); return; }
  for (const u of g.units) if (u.kind === 'wolf' && !u.dead && Math.hypot(u.x - wx, u.y - 14 - wy) < R * 1.2) { S.hitWolf(u, 1, true); S.sound('hit'); bumpCombo(); return; }
  // resource nodes
  // sprite hit test: the front-most node whose silhouette contains the tap wins; else the nearest one close by
  let best = null, bestY = -Infinity, near = null, bd = R * R;
  const pad = 8 / Math.min(1, z);
  S.forResNear(wx, wy, 120, r => {
    if (!S.resReady(r)) return;
    const hw = (r.kind === 'tree' ? 24 : r.kind === 'rock' ? 22 : 18) + pad, ht = (r.kind === 'tree' ? 78 : r.kind === 'rock' ? 28 : 26) + pad;
    if (Math.abs(wx - r.x) < hw && wy < r.y + pad && wy > r.y - ht && r.y > bestY) { bestY = r.y; best = r; }
    const d = S.dist2(wx, wy, r.x, r.y - ht / 2); if (d < bd) { bd = d; near = r; }
  });
  best = best || near;
  if (best) {
    bumpCombo();
    const res = best.kind === 'tree' ? 'wood' : best.kind === 'rock' ? 'stone' : 'food';
    const v = S.tapValue(res) * S.comboMult();
    S.gain(res, v); E.stats.taps++;
    best.shake = .2; best.tapHits = (best.tapHits || 0) + 1;
    S.fxText(wx, wy - 10, '+' + S.fmt(v), g.combo.n >= 10 ? '#ffd36b' : '#ffffff', 17 + Math.min(10, g.combo.n * .4));
    S.fxBurst(best.x, best.y - (best.kind === 'tree' ? 30 : 10), 4 + Math.min(8, g.combo.n >> 1), best.kind === 'tree' ? ['#c9a26b', '#8a6a3c', '#4b9142'] : best.kind === 'rock' ? ['#b9bcc2', '#7e8288'] : ['#d2384a', '#4b9142'], 90);
    S.sound('tap');
    if (best.tapHits >= 10) { // a fully tapped node pays a bonus and regrows
      best.tapHits = 0;
      const bonus = v * 5; S.gain(res, bonus);
      S.fxText(best.x, best.y - 70, 'Бонус +' + S.fmt(bonus), '#ffd36b', 20);
      if (best.kind === 'tree') { best.fallDir = wx < best.x ? 1 : -1; best.amt = 0; S.depleteRes(best); } else { best.amt = 0; S.depleteRes(best); }
    }
    return;
  }
  // buildings open their shop card
  for (const b of S.cityBuildings()) {
    const w = b.type.startsWith('wonder') ? 110 : b.type === 'farm' ? 100 : 40, h = b.type.startsWith('wonder') ? 130 : b.type === 'farm' ? 60 : 90;
    if (Math.abs(wx - b.x) < w && wy < b.y + 20 && wy > b.y - h) { S.openCard(b.key); return; }
  }
  S.fxBurst(wx, wy, 4, ['#ffffff', '#e8e2d0'], 40, 2);
};
function bumpCombo() {
  const g = S.game, c = g.combo;
  c.n = g.time - c.last < .75 ? Math.min(S.comboMax(), c.n + 1) : 1;
  c.last = g.time;
  S.E.stats.bestCombo = Math.max(S.E.stats.bestCombo, c.n);
}

// ---------- per-frame ----------
S.updateCity = dt => {
  const g = S.game, E = S.E;
  g.time += dt;
  // day / night (purely for mood and wolves)
  g.clock += dt;
  const cyc = 150, ph = g.clock % cyc, night = ph > 110;
  if (night !== g.night) { g.night = night; if (night && E.stats.wolvesSeen > 0) S.toast('Ночь. Волки смелеют'); }
  g.dark = night ? Math.min(1, (ph - 110) / 6, (cyc - ph) / 6) : 0;
  if (g.combo.n && g.time - g.combo.last > 1.2) g.combo.n = 0;

  // events
  g.nextDeer -= dt;
  if (g.nextDeer <= 0) {
    const freq = (S.upgOwned('deer0') ? 1.5 : 1) * (S.upgOwned('deer2') ? 1.5 : 1);
    g.nextDeer = (90 + Math.random() * 80) / freq;
    S.spawnDeer();
  }
  g.nextWolves -= dt * (night ? 1.7 : 1);
  if (g.nextWolves <= 0) {
    g.nextWolves = 100 + Math.random() * 70;
    if (S.pop() >= 3) { const n = 1 + Math.floor(Math.min(4, E.time / 400)); if (S.spawnWolves(n)) S.toast(n > 1 ? 'Стая волков идёт к запасам! Тапай по ним' : 'Волк крадётся к запасам! Тапни по нему', 3); }
  }
  // towers
  const towers = S.cityBuildings().filter(b => b.type === 'tower');
  towers.forEach((t, i) => {
    g.towerCd[i] -= dt;
    if (g.towerCd[i] > 0) return;
    let best = null, bd = 270 * 270;
    for (const u of g.units) if (u.kind === 'wolf' && !u.dead) { const d = S.dist2(t.x, t.y, u.x, u.y); if (d < bd) { bd = d; best = u; } }
    if (best) { g.towerCd[i] = 2.2 / (1 + .12 * E.b.tower); g.proj.push({ x: t.x, y: t.y - 64, target: best, ang: 0 }); }
  });
  // units
  g.syncT -= dt; if (g.syncT <= 0) { g.syncT = .5; S.syncWorkers(); g.popupBudget = Math.min(6, g.popupBudget + 2); }
  for (const u of g.units) {
    if (u.swing > 0) u.swing -= dt; if (u.hurt > 0) u.hurt -= dt;
    if (u.kind === 'worker') S.updateWorker(u, dt);
    else if (u.kind === 'wolf') S.updateWolf(u, dt);
    else if (u.kind === 'deer') S.updateDeer(u, dt);
  }
  g.units = g.units.filter(u => !u.remove);
  // a little separation so workers don't stack
  const us = g.units;
  for (let i = 0; i < us.length; i++) for (let j = i + 1; j < us.length; j++) {
    const a = us[i], b = us[j]; if (a.flies || b.flies) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
    if (d2 > 0 && d2 < 196) { const d = Math.sqrt(d2), p = (14 - d) * .25; a.x -= dx / d * p; a.y -= dy / d * p; b.x += dx / d * p; b.y += dy / d * p; }
  }
  S.updateProjectiles(dt);
  S.updateResources(dt);
  for (const r of g.visRes || []) if (r.shake > 0) r.shake -= dt;
  // fx
  for (const f of g.fx) {
    if (f.k === 'p') { f.life -= dt; f.vz -= 400 * dt; f.z = Math.max(0, f.z + f.vz * dt); f.x += f.vx * dt; f.y += f.vy * dt; if (f.z === 0) { f.vx *= .8; f.vy *= .8; } }
    else if (f.k === 'item') { f.t += dt; if (f.t >= f.dur) { f.life = 0; if (f.onDone) f.onDone(); } else f.life = 1; }
    else f.life -= dt;
  }
  g.fx = g.fx.filter(f => f.life > 0);
};
})();
