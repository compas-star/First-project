// Units on screen: visible workers (they show the economy, they don't drive it), wolf raids, the golden deer, arrows, fx.
(() => {
'use strict';

let nextId = 1;
S.newUnit = (kind, x, y, extra = {}) => Object.assign({ id: nextId++, kind, x, y, speed: 110, face: 1, walk: 0, moving: false,
  swing: 0, hurt: 0, state: 'idle', carry: [], t: Math.random() * 10, dead: false }, extra);

// ---------- fx ----------
S.fxText = (x, y, text, color = '#fff', size = 15) => { const fx = S.game.fx; if (fx.length < 220) fx.push({ k: 'text', x, y, text, color, size, life: 1.1 }); };
S.fxItem = (type, x0, y0, to, onDone) => S.game.fx.push({ k: 'item', type, x0, y0, to, t: 0, dur: .45, onDone });
S.fxBurst = (x, y, n, colors, spd = 80, size = 3) => {
  const fx = S.game.fx;
  for (let i = 0; i < n && fx.length < 400; i++) { const a = Math.random() * 6.283, s = Math.random() * spd; fx.push({ k: 'p', x, y, z: 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s * .6, vz: 60 + Math.random() * 90, life: .5 + Math.random() * .5, color: colors[i % colors.length], size }); }
};

// ---------- movement ----------
const OFFS = [0, .5, -.5, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4];
S.moveDir = (u, dx, dy, dt, mul = 1) => {
  const d = Math.hypot(dx, dy); if (d < .001) { u.moving = false; return; }
  const step = u.speed * mul * dt, base = Math.atan2(dy, dx);
  for (const o of OFFS) {
    const a = base + o, nx = u.x + Math.cos(a) * step, ny = u.y + Math.sin(a) * step;
    if (S.isWater(nx, ny) && !u.flies) continue;
    if (u.kind === 'wolf' && S.E.b.wall > 0) { // the wall keeps wolves out
      const c = S.game.camp, R = S.WALL_R - 6;
      if (Math.hypot(u.x - c.x, u.y - c.y) >= R && Math.hypot(nx - c.x, ny - c.y) < R) { u.blocked = true; u.moving = false; return; }
    }
    u.x = S.clamp(nx, 30, S.WORLD - 30); u.y = S.clamp(ny, 30, S.WORLD - 30);
    u.moving = true; u.blocked = false;
    if (Math.abs(Math.cos(a)) > .2) u.face = Math.cos(a) > 0 ? 1 : -1;
    u.walk += step * .09;
    return;
  }
  u.moving = false;
};
S.moveTo = (u, tx, ty, dt, mul = 1, stop = 4) => {
  const dx = tx - u.x, dy = ty - u.y, d = Math.hypot(dx, dy);
  if (d <= stop) { u.moving = false; return true; }
  let gx = tx, gy = ty;
  if (!u.flies) {
    u.losT = (u.losT || 0) - dt;
    if (u.losT <= 0) { u.losT = .4; u.los = S.clearLine(u.x, u.y, tx, ty); }
    if (!u.los) { // water in the way: follow an A* path
      const key = Math.floor(tx / S.TILE) * 1000 + Math.floor(ty / S.TILE);
      u.pathT = (u.pathT || 0) - dt;
      if (u.pathKey !== key || !u.path || u.pathT <= 0) { u.path = S.findPath(u.x, u.y, tx, ty); u.pathKey = key; u.pathT = 3; }
      while (u.path.length && Math.hypot(u.path[0].x - u.x, u.path[0].y - u.y) < 22) u.path.shift();
      if (u.path.length) { gx = u.path[0].x; gy = u.path[0].y; }
    }
  }
  const gd = Math.hypot(gx - u.x, gy - u.y);
  S.moveDir(u, gx - u.x, gy - u.y, Math.min(dt, gd / (u.speed * mul) + .001), mul);
  return false;
};

// ---------- visible workers ----------
const VIS_MAX = 36;
S.syncWorkers = () => {
  const g = S.game, E = S.E, total = S.pop();
  const want = {};
  for (const k in S.WORKERS) { const n = E.w[k]; want[k] = n ? Math.min(n, Math.max(1, Math.round(n / Math.max(total, 1) * VIS_MAX))) : 0; }
  for (const k in want) {
    const have = g.units.filter(u => u.kind === 'worker' && u.job === k);
    for (let i = have.length; i < want[k]; i++) { // new people walk out from the fire
      const c = g.camp;
      g.units.push(S.newUnit('worker', c.x + (Math.random() - .5) * 40, c.y + 30, { job: k, state: 'find', speed: 95 + Math.random() * 30, born: 1 }));
    }
    for (let i = want[k]; i < have.length; i++) { const u = have[i]; if (u.target) u.target.claim = 0; u.remove = true; }
  }
  g.units = g.units.filter(u => !u.remove);
};
const nodeKind = { tree: 'tree', rock: 'rock', bush: 'bush' };
S.updateWorker = (u, dt) => {
  const g = S.game, W = S.WORKERS[u.job], camp = g.camp, stock = g.stock;
  if (u.born > 0) u.born -= dt;
  if (u.state === 'find') {
    u.tripStart = g.time;
    if (nodeKind[W.node]) {
      const r = S.nearestRes(u.x, u.y, W.node, 1300, r => !r.claim);
      if (r) { r.claim = u.id; u.target = r; u.tx = r.x - 14 * Math.sign(r.x - u.x || 1); u.ty = r.y + 6; }
      else { u.target = null; const a = Math.random() * 6.283; u.tx = camp.x + Math.cos(a) * 500; u.ty = camp.y + Math.sin(a) * 500; }
    } else if (W.node === 'farm') {
      const f = S.SLOTS.garden[0]; u.tx = camp.x + f[0] + (Math.random() - .5) * 170; u.ty = camp.y + f[1] + (Math.random() - .5) * 90; u.target = null;
    } else { // hunters head into the woods
      const a = Math.random() * 6.283, d = 450 + Math.random() * 300; u.tx = camp.x + Math.cos(a) * d; u.ty = camp.y + Math.sin(a) * d; u.target = null;
      if (S.isWater(u.tx, u.ty)) { u.tx = camp.x - Math.cos(a) * d; u.ty = camp.y - Math.sin(a) * d; }
    }
    u.state = 'go';
  }
  if (u.state === 'go') {
    if (u.target && !S.resReady(u.target)) { u.target.claim = 0; u.state = 'find'; return; }
    if (S.moveTo(u, u.tx, u.ty, dt, 1, 8)) { u.state = 'work'; u.workT = 2.2 + Math.random() * 1.5; u.hitT = 0; }
    return;
  }
  if (u.state === 'work') {
    u.workT -= dt; u.hitT -= dt;
    if (u.hitT <= 0) {
      u.hitT = .55; u.swing = .25;
      const r = u.target;
      if (r) { u.face = r.x >= u.x ? 1 : -1; r.shake = .15; if (S.onScreen(r.x, r.y)) S.fxBurst(r.x, r.y - 14, 2, r.kind === 'tree' ? ['#c9a26b', '#8a6a3c'] : r.kind === 'rock' ? ['#b9bcc2', '#7e8288'] : ['#d2384a', '#4b9142'], 40, 2.5); }
    }
    if (u.workT <= 0) {
      const r = u.target;
      if (r) { // each trip wears the node down a bit so the forest visibly thins near camp and regrows
        r.claim = 0;
        if (r.kind === 'tree') { r.hp -= 1; if (r.hp <= 0) { r.fallDir = u.x <= r.x ? 1 : -1; r.amt = 0; S.depleteRes(r); } }
        else { r.amt -= 1; if (r.amt <= 0) S.depleteRes(r); }
      }
      u.carry = [W.res, W.res, W.res].slice(0, 1 + (u.id % 3));
      u.state = 'back';
    }
    return;
  }
  if (u.state === 'back') {
    if (S.moveTo(u, stock.x + (u.id % 7 - 3) * 9, stock.y + 12, dt, 1, 14)) {
      // show what this little figure stands for: its share of the real income over the trip
      const share = S.E.w[u.job] / Math.max(1, g.units.filter(o => o.kind === 'worker' && o.job === u.job).length);
      const amt = S.workerRate(u.job) * share * Math.max(4, g.time - u.tripStart);
      if (S.onScreen(u.x, u.y) && g.popupBudget > 0) { g.popupBudget--; S.fxText(u.x, u.y - 46, '+' + S.fmt(amt), '#fff4c2', 13); }
      u.carry = []; u.state = 'find';
    }
  }
};

// ---------- wolves ----------
S.spawnWolves = n => {
  const g = S.game, c = g.camp;
  for (let i = 0; i < 30; i++) {
    const a = Math.random() * 6.283, x = c.x + Math.cos(a) * 780, y = c.y + Math.sin(a) * 780;
    if (S.isWater(x, y) || x < 60 || y < 60 || x > S.WORLD - 60 || y > S.WORLD - 60) continue;
    for (let j = 0; j < n; j++) g.units.push(S.newUnit('wolf', x + j * 22, y + (j % 2) * 18, { hp: 3, maxHp: 3, speed: 105, state: 'raid' }));
    S.E.stats.wolvesSeen++;
    return { x, y };
  }
  return null;
};
S.updateWolf = (u, dt) => {
  const g = S.game, st = g.stock;
  if (u.state === 'raid') {
    if (S.moveTo(u, st.x, st.y, dt, 1, 30)) {
      // reached the stores: grab some food and run
      const loss = Math.min(S.E.res.food * .04, Math.max(5, S.rates().food * 20));
      S.E.res.food = Math.max(0, S.E.res.food - loss);
      if (loss >= 1) S.fxText(u.x, u.y - 40, '-' + S.fmt(loss) + ' еды', '#ff9b8a', 16);
      u.state = 'flee'; u.speed = 150; S.sound('wolf');
    }
    if (u.blocked) { u.state = 'howl'; u.howlT = 0; }
    return;
  }
  if (u.state === 'howl') { // stuck at the wall, towers do the rest
    u.howlT -= dt;
    if (u.howlT <= 0) { u.howlT = 2 + Math.random() * 2; u.swing = .25; }
    if (!g.night && Math.random() < dt * .05) u.state = 'flee';
    return;
  }
  if (u.state === 'flee') {
    const c = g.camp, dx = u.x - c.x, dy = u.y - c.y, d = Math.hypot(dx, dy) || 1;
    S.moveDir(u, dx / d, dy / d, dt);
    if (d > 1000) u.remove = true;
  }
};
S.hitWolf = (u, dmg, byTap) => {
  if (u.dead) return;
  u.hp -= dmg; u.hurt = .2;
  S.fxBurst(u.x, u.y - 12, 5, ['#8b8e96', '#5e6168'], 70);
  if (u.hp > 0) return;
  u.dead = true; u.remove = true;
  S.E.stats.wolvesKilled++;
  const meat = Math.max(15, S.rates().food * 12);
  S.gain('food', meat);
  S.fxText(u.x, u.y - 40, '+' + S.fmt(meat) + ' мяса', '#ffd2c4', 16);
  S.fxBurst(u.x, u.y - 10, 14, ['#8b8e96', '#c94b3a', '#5e6168'], 110);
};

// ---------- golden deer ----------
S.spawnDeer = () => {
  const g = S.game, cam = S.cam, z = cam.z;
  const halfW = S.viewW / 2 / z, halfH = S.viewH / 2 / z;
  const dir = Math.random() < .5 ? 1 : -1;
  const y = cam.y + (Math.random() * .5 - .1) * halfH;
  const x0 = cam.x - dir * (halfW + 60), x1 = cam.x + dir * (halfW + 80);
  g.units.push(S.newUnit('deer', x0, y, { flies: true, speed: (halfW * 2 + 140) / 7, tx: x1, ty: y + (Math.random() - .5) * 120, face: dir, state: 'run' }));
};
S.updateDeer = (u, dt) => {
  u.t += dt;
  if (Math.random() < dt * 14) S.game.fx.push({ k: 'p', x: u.x + (Math.random() - .5) * 20, y: u.y - 10, z: 10 + Math.random() * 20, vx: 0, vy: 0, vz: 20, life: .7, color: Math.random() < .5 ? '#ffe27a' : '#fff6cf', size: 3 });
  if (S.moveTo(u, u.tx, u.ty, dt, 1, 6)) u.remove = true;
};
S.catchDeer = u => {
  const E = S.E;
  u.remove = true; E.stats.deer++;
  S.fxBurst(u.x, u.y - 16, 30, ['#ffe27a', '#fff6cf', '#ffb84a'], 160, 4);
  S.sound('deer');
  const roll = Math.random();
  if (roll < .45) { S.addBuff('frenzy', 7, 20); S.toast('Золотой олень: доход ×7 на 20 секунд!', 3); }
  else if (roll < .75) {
    const r = S.rates(), got = [];
    for (const k of S.RES) { const v = Math.max(20, Math.min(E.res[k] * .15, r[k] * 600)); S.gain(k, v); got.push('+' + S.fmt(v) + ' ' + S.RES_NAME[k]); }
    S.toast('Золотой олень: ' + got.join(', '), 3.5);
  } else { S.addBuff('tap', 15, 12); S.toast('Золотой олень: тапы ×15 на 12 секунд!', 3); }
};

// ---------- arrows ----------
S.updateProjectiles = dt => {
  const g = S.game;
  for (const a of g.proj) {
    const t = a.target;
    if (!t || t.dead || t.remove) { a.dead = true; continue; }
    const dx = t.x - a.x, dy = (t.y - 14) - a.y, d = Math.hypot(dx, dy);
    if (d < 12) { S.hitWolf(t, 1, false); a.dead = true; continue; }
    a.x += dx / d * 520 * dt; a.y += dy / d * 520 * dt; a.ang = Math.atan2(dy, dx);
  }
  g.proj = g.proj.filter(a => !a.dead);
};
})();
