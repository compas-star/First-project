// Units: player, workers, neutral settlers, wildlife, rival warriors, combat, projectiles, fx.
(() => {
'use strict';

let nextId = 1;
S.newUnit = (kind, fac, x, y, extra = {}) => {
  const st = S.UNIT[kind];
  const u = Object.assign({ id: nextId++, kind, fac, x, y, hp: st.hp, maxHp: st.hp, speed: st.speed, face: 1, walk: 0, moving: false,
    atkT: 0, swing: 0, hurt: 0, state: 'idle', carry: [], home: { x, y }, t: Math.random() * 10, dead: false }, extra);
  return u;
};

const isHuman = u => u.kind === 'player' || u.kind === 'worker' || u.kind === 'warrior' || u.kind === 'neutral';
const isBeast = u => u.kind === 'wolf' || u.kind === 'bear';
S.hostile = (a, b) => {
  if (a.dead || b.dead || a === b) return false;
  if ((a.fac === 'p' && b.fac === 'r') || (a.fac === 'r' && b.fac === 'p')) return true;
  if (isBeast(a) && isHuman(b) && b.fac !== 'n') return true;
  if (isBeast(b) && isHuman(a) && a.fac !== 'n') return true;
  return false;
};
S.eraMul = fac => 1 + .6 * S.eraOf(S.campLevel(fac));

// ---------- fx ----------
S.fxText = (x, y, text, color = '#fff') => S.game.fx.push({ k: 'text', x, y, text, color, life: 1.2 });
S.fxItem = (type, x0, y0, to, onDone) => S.game.fx.push({ k: 'item', type, x0, y0, to, t: 0, dur: .35, onDone });
S.fxBurst = (x, y, n, colors, spd = 80, size = 3) => {
  for (let i = 0; i < n; i++) { const a = Math.random() * 6.283, s = Math.random() * spd; S.game.fx.push({ k: 'p', x, y, z: 6, vx: Math.cos(a) * s, vy: Math.sin(a) * s * .6, vz: 60 + Math.random() * 90, life: .5 + Math.random() * .5, color: colors[i % colors.length], size }); }
};

// ---------- movement ----------
const OFFS = [0, .5, -.5, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4];
S.moveDir = (u, dx, dy, dt, mul = 1) => {
  const d = Math.hypot(dx, dy); if (d < .001) { u.moving = false; return; }
  const step = u.speed * mul * dt, base = Math.atan2(dy, dx);
  for (const o of OFFS) {
    const a = base + o, nx = u.x + Math.cos(a) * step, ny = u.y + Math.sin(a) * step;
    if (S.isWater(nx, ny)) continue;
    const wall = S.wallBlocks(u, u.x, u.y, nx, ny);
    if (wall) { u.blocked = wall; u.moving = false; return; }
    u.x = S.clamp(nx, 30, S.WORLD - 30); u.y = S.clamp(ny, 30, S.WORLD - 30);
    u.moving = true; u.blocked = null;
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
  u.losT = (u.losT || 0) - dt;
  if (u.losT <= 0) { u.losT = .35; u.los = S.clearLine(u.x, u.y, tx, ty); }
  if (!u.los) { // water in the way: follow an A* path, refreshed when the goal moves or every few seconds
    const key = Math.floor(tx / S.TILE) * 1000 + Math.floor(ty / S.TILE);
    u.pathT = (u.pathT || 0) - dt;
    if (u.pathKey !== key || !u.path || u.pathT <= 0) { u.path = S.findPath(u.x, u.y, tx, ty); u.pathKey = key; u.pathT = 3; }
    while (u.path.length && Math.hypot(u.path[0].x - u.x, u.path[0].y - u.y) < 22) u.path.shift();
    if (u.path.length) { gx = u.path[0].x; gy = u.path[0].y; }
  }
  const gd = Math.hypot(gx - u.x, gy - u.y);
  S.moveDir(u, gx - u.x, gy - u.y, Math.min(dt, gd / (u.speed * mul) + .001), mul);
  return false;
};

// ---------- combat ----------
S.damage = (target, dmg, src) => {
  if (target.isBuilding) { S.damageBuilding(target, dmg); return; }
  if (target.dead) return;
  target.hp -= dmg; target.hurt = .25;
  if (src) { const d = Math.hypot(target.x - src.x, target.y - src.y) || 1; target.x += (target.x - src.x) / d * 4; target.y += (target.y - src.y) / d * 4; }
  if (target.hp <= 0) S.kill(target, src);
};
S.kill = (u, by) => {
  const g = S.game;
  u.hp = 0; u.dead = true;
  S.fxBurst(u.x, u.y, 12, u.kind === 'bear' ? ['#6b4426', '#8a5a33'] : u.kind === 'wolf' ? ['#8b8e96', '#5e6168'] : ['#c94b3a', '#7a2b22'], 90);
  if (u.kind === 'player') { g.carry.length = 0; u.respawn = 4; S.toast('Ты ранен. Очнёшься у костра'); return; }
  if (u.kind === 'worker' && u.fac === 'p') S.toast('Погиб поселенец');
  const meat = u.kind === 'deer' ? S.UNIT.deer.meat : u.kind === 'bear' ? 6 : u.kind === 'wolf' ? 2 : 0;
  if (meat && by && by.kind === 'player') {
    let got = 0;
    for (let i = 0; i < meat && g.carry.length < S.carryCap(); i++) { g.carry.push('food'); got++; }
    if (got) S.fxText(u.x, u.y - 30, '+' + got + ' мясо', '#ffb2a1');
  }
  if (u.kind === 'warrior' && by && by.fac === 'p') { g.res.wood += 5; S.fxText(u.x, u.y - 30, '+5 дерева', '#ffe08a'); }
};
const tryAttack = (u, target, dmg, cd) => {
  if (u.atkT > 0) return;
  u.atkT = cd; u.swing = .25;
  u.face = target.x >= u.x ? 1 : -1;
  S.damage(target, dmg, u);
};
S.findHostile = (u, r, pred) => {
  let best = null, bd = r * r;
  for (const o of S.game.allUnits) {
    if (!S.hostile(u, o) || (pred && !pred(o))) continue;
    const d = S.dist2(u.x, u.y, o.x, o.y); if (d < bd) { bd = d; best = o; }
  }
  return best;
};

// ---------- gathering (shared by player and workers) ----------
S.gatherHit = (u, r, power, cap) => {
  const carry = u.kind === 'player' ? S.game.carry : u.carry;
  if (carry.length >= cap || !S.resReady(r)) return false;
  u.swing = .2; u.face = r.x >= u.x ? 1 : -1;
  const yieldItem = (type, n) => {
    for (let i = 0; i < n && carry.length < cap; i++) {
      if (u.kind === 'player') { carry.push(type); S.fxItem(type, r.x, r.y - 20, u); }
      else carry.push(type);
    }
  };
  if (r.kind === 'tree') {
    r.hp -= power; r.shake = .2;
    S.fxBurst(r.x, r.y - 12, 3, ['#c9a26b', '#8a6a3c'], 50, 2.5);
    if (r.hp <= 0) { r.fallDir = u.x <= r.x ? 1 : -1; yieldItem('wood', r.amt); r.amt = 0; S.depleteRes(r); }
  } else if (r.kind === 'rock') {
    yieldItem('stone', 1); r.amt--; r.shake = .15;
    S.fxBurst(r.x, r.y - 8, 3, ['#b9bcc2', '#7e8288'], 50, 2.5);
    if (r.amt <= 0) S.depleteRes(r);
  } else {
    yieldItem('food', 1); r.amt--; r.shake = .15;
    if (r.amt <= 0) S.depleteRes(r);
  }
  return true;
};

// ---------- player ----------
S.updatePlayer = (p, dt) => {
  const g = S.game;
  if (p.dead) {
    p.respawn -= dt;
    if (p.respawn <= 0) { const c = g.camps.p; p.dead = false; p.hp = p.maxHp; p.x = c.x + 30; p.y = c.y + 40; }
    return;
  }
  S.readInput();
  const inp = S.input;
  if (inp.x || inp.y) S.moveDir(p, inp.x, inp.y, dt, Math.hypot(inp.x, inp.y));
  else p.moving = false;
  const inCamp = S.dist(p, g.camps.p) < S.WALL_R;
  p.hp = Math.min(p.maxHp, p.hp + (inCamp ? 6 : .6) * dt);

  const mul = S.eraMul('p');
  // fight first
  const foe = S.findHostile(p, 48) || S.nearestDeer(p, 40);
  if (foe) { tryAttack(p, foe, S.UNIT.player.dmg * mul, S.UNIT.player.cd); return; }
  // gather
  p.gatherT = (p.gatherT || 0) - dt;
  if (p.gatherT <= 0) {
    const cap = S.carryCap();
    let best = null, bd = 46 * 46;
    S.forResNear(p.x, p.y, 50, r => { if (!S.resReady(r)) return; const d = S.dist2(p.x, p.y, r.x, r.y); if (d < bd) { bd = d; best = r; } });
    if (best) {
      if (g.carry.length >= cap) { if (!p.fullMsg || p.fullMsg < g.time) { S.fxText(p.x, p.y - 60, 'Полно! Неси в лагерь', '#ffd36b'); p.fullMsg = g.time + 2.5; } }
      else { S.gatherHit(p, best, mul, cap); p.gatherT = .3 / Math.sqrt(mul); }
    }
  }
};
S.nearestDeer = (u, r) => {
  let best = null, bd = r * r;
  for (const o of S.game.units) if (o.kind === 'deer' && !o.dead) { const d = S.dist2(u.x, u.y, o.x, o.y); if (d < bd) { bd = d; best = o; } }
  return best;
};

// ---------- workers ----------
const RES_KIND = { wood: 'tree', stone: 'rock', food: 'bush' };
S.updateWorker = (u, dt) => {
  const g = S.game, camp = g.camps[u.fac], stock = S.stockPos(u.fac);
  const hungry = u.fac === 'p' && g.res.food <= 0;
  const mul = hungry ? .6 : 1;
  const cap = S.UNIT.worker.carry + Math.floor(S.storageCarry(u.fac) / 4);

  // flee from danger unless safe behind own wall
  const threat = S.findHostile(u, 140, o => o.kind !== 'worker');
  if (threat && !(S.wallUp(u.fac) && S.dist(u, camp) < S.WALL_R - 10)) {
    if (S.dist(threat, u) < 34 && !threat.isBuilding) tryAttack(u, threat, S.UNIT.worker.dmg, S.UNIT.worker.cd);
    S.releaseClaim(u);
    u.state = 'flee'; S.moveTo(u, camp.x, camp.y, dt, 1.15, 30); return;
  }
  if (u.state === 'flee') u.state = u.carry.length ? 'return' : 'find';

  if (u.state === 'idle' || u.state === 'find') {
    const job = u.fac === 'p' ? S.pickJob() : ['wood', 'wood', 'stone', 'food'][u.id % 4];
    let r = S.nearestRes(u.x, u.y, RES_KIND[job], 1100, r => !r.claim || r.claim === u.id);
    if (!r) for (const k of ['wood', 'stone', 'food']) { r = S.nearestRes(u.x, u.y, RES_KIND[k], 1100, r => !r.claim); if (r) break; }
    if (!r) { u.state = 'idle'; S.moveTo(u, camp.x + Math.sin(u.t) * 60, camp.y + Math.cos(u.t) * 60, dt, .5); return; }
    r.claim = u.id; u.res = r; u.state = 'go';
  }
  if (u.state === 'go') {
    const r = u.res;
    if (!r || !S.resReady(r)) { S.releaseClaim(u); u.state = u.carry.length ? 'return' : 'find'; return; }
    if (S.moveTo(u, r.x - 14 * Math.sign(r.x - u.x || 1), r.y + 6, dt, mul, 6)) u.state = 'work';
    return;
  }
  if (u.state === 'work') {
    const r = u.res;
    u.workT = (u.workT || 0) - dt;
    if (!r || !S.resReady(r)) { S.releaseClaim(u); u.state = u.carry.length >= Math.min(cap, 2) ? 'return' : 'find'; return; }
    if (u.workT <= 0) { u.workT = .55 / mul; S.gatherHit(u, r, .75 * S.eraMul(u.fac), cap); }
    if (u.carry.length >= cap) { S.releaseClaim(u); u.state = 'return'; }
    return;
  }
  if (u.state === 'return') {
    if (S.moveTo(u, stock.x + (u.id % 5 - 2) * 8, stock.y + 10, dt, mul, 14)) {
      for (const it of u.carry) { if (u.fac === 'p') { g.res[it]++; g.stats[it]++; } else g.rival.res[it]++; }
      if (u.fac === 'p' && u.carry.length && S.dist(g.player, u) < 500) S.fxText(u.x, u.y - 40, '+' + u.carry.length, '#fff');
      u.carry.length = 0; u.state = 'find';
    }
  }
};
S.releaseClaim = u => { if (u.res && u.res.claim === u.id) u.res.claim = 0; u.res = null; };

// ---------- neutral settlers ----------
S.updateNeutral = (u, dt) => {
  const g = S.game, p = g.player, camp = g.camps.p;
  if (u.state === 'wander' || u.state === 'idle') {
    u.t += dt;
    S.moveTo(u, u.home.x + Math.cos(u.t * .4) * 60, u.home.y + Math.sin(u.t * .55) * 40, dt, .45, 6);
    if (!p.dead && S.dist(u, p) < 70) { u.state = 'follow'; S.fxText(u.x, u.y - 50, 'Иду с тобой!', '#bfe3ff'); }
    return;
  }
  if (u.state === 'follow') {
    const followers = g.units.filter(o => o.kind === 'neutral' && o.state === 'follow');
    const idx = followers.indexOf(u);
    const tx = p.x - p.face * (36 + idx * 26), ty = p.y + 8;
    S.moveTo(u, tx, ty, dt, Math.min(1.6, 1 + S.dist(u, p) / 300), 10);
    if (S.dist(u, camp) < 230) u.state = 'wait';
    return;
  }
  if (u.state === 'wait') {
    u.t += dt;
    S.moveTo(u, camp.x + Math.cos(u.id) * 90, camp.y + 110 + Math.sin(u.t) * 10, dt, .6, 8);
    if (S.workers('p').length < S.popCap('p')) {
      u.kind = 'worker'; u.fac = 'p'; u.state = 'find'; u.speed = S.UNIT.worker.speed;
      S.toast('Новый поселенец в лагере!'); S.fxBurst(u.x, u.y - 20, 10, ['#ffe08a', '#ffffff'], 70);
    }
  }
};

// ---------- wildlife ----------
S.updateBeast = (u, dt) => {
  const g = S.game, st = S.UNIT[u.kind];
  if (u.kind === 'deer') {
    let threat = null, bd = st.flee * st.flee;
    for (const o of g.allUnits) if (isHuman(o) && !o.dead) { const d = S.dist2(u.x, u.y, o.x, o.y); if (d < bd) { bd = d; threat = o; } }
    if (threat) S.moveDir(u, u.x - threat.x, u.y - threat.y, dt, 1);
    else { u.t += dt; S.moveTo(u, u.home.x + Math.cos(u.t * .3) * 90, u.home.y + Math.sin(u.t * .4) * 70, dt, .3, 8); }
    return;
  }
  const aggro = st.aggro * (g.night ? 1.4 : 1);
  // dawn sends raiders home
  if (u.raid && !g.night) { u.raid = false; u.home = S.randomWildSpot(); }
  let target = u.target && !u.target.dead && S.dist(u, u.target) < aggro * 1.8 ? u.target : S.findHostile(u, u.raid ? 220 : aggro);
  u.target = target;
  if (!u.raid && S.dist(u, u.home) > st.leash) { u.target = null; target = null; u.state = 'home'; }
  if (u.state === 'home') { if (S.moveTo(u, u.home.x, u.home.y, dt, 1, 30)) u.state = 'idle'; u.hp = Math.min(u.maxHp, u.hp + 5 * dt); return; }
  if (target) {
    if (S.dist(u, target) <= st.range) tryAttack(u, target, st.dmg, st.cd);
    else { S.moveTo(u, target.x, target.y, dt, 1, st.range * .8); if (u.blocked) { if (u.raid) tryAttack(u, u.blocked, st.dmg, st.cd); else { u.target = null; u.state = 'home'; } } }
    return;
  }
  if (u.raid) {
    const c = g.camps.p;
    S.moveTo(u, c.x, c.y, dt, .9, 40);
    if (u.blocked) tryAttack(u, u.blocked, st.dmg, st.cd);
    return;
  }
  u.t += dt;
  S.moveTo(u, u.home.x + Math.cos(u.t * .25 + u.id) * 120, u.home.y + Math.sin(u.t * .3 + u.id) * 90, dt, .35, 10);
};

// ---------- rival warriors ----------
S.updateWarrior = (u, dt) => {
  const g = S.game, st = S.UNIT.warrior;
  if (!g.night && u.state !== 'home') u.state = 'home';
  if (u.state === 'home') {
    const c = g.camps.r;
    if (S.moveTo(u, c.x, c.y, dt, 1, 60)) u.remove = true;
    const foe = S.findHostile(u, 60); if (foe && S.dist(u, foe) < st.range) tryAttack(u, foe, st.dmg, st.cd);
    return;
  }
  u.thinkT = (u.thinkT || 0) - dt;
  if (u.thinkT <= 0 || !u.target || u.target.dead || (u.target.isBuilding && u.target.level === 0)) {
    u.thinkT = .5;
    u.target = S.findHostile(u, 220) || S.nearestBuilding('p', u.x, u.y, 450);
  }
  const t = u.target;
  if (t) {
    const reach = st.range + (t.isBuilding ? t.radius : 0);
    if (S.dist(u, t) <= reach) tryAttack(u, t, st.dmg, st.cd);
    else { S.moveTo(u, t.x, t.y, dt, 1, reach * .8); if (u.blocked) tryAttack(u, u.blocked, st.dmg, st.cd); }
  } else {
    const c = g.camps.p; S.moveTo(u, c.x, c.y, dt, 1, 50);
    if (u.blocked) tryAttack(u, u.blocked, st.dmg, st.cd);
  }
};

// ---------- projectiles ----------
S.updateProjectiles = dt => {
  const g = S.game;
  for (const a of g.proj) {
    const t = a.target;
    if (!t || t.dead) { a.dead = true; continue; }
    const dx = t.x - a.x, dy = (t.y - 18) - a.y, d = Math.hypot(dx, dy);
    if (d < 12) { S.damage(t, a.dmg, null); a.dead = true; continue; }
    a.x += dx / d * 520 * dt; a.y += dy / d * 520 * dt; a.ang = Math.atan2(dy, dx);
  }
  g.proj = g.proj.filter(a => !a.dead);
};

// ---------- population control ----------
S.randomWildSpot = () => { const s = S.world.wildSpots; return Object.assign({}, s[Math.floor(Math.random() * s.length)]); };
S.spawnWildlife = () => {
  const g = S.game;
  const count = k => g.units.filter(u => u.kind === k && !u.dead && !u.raid).length;
  const want = { wolf: 7, bear: 3, deer: 10 };
  for (const k in want) {
    if (count(k) >= want[k]) continue;
    for (let i = 0; i < 10; i++) {
      const s = S.randomWildSpot();
      if (S.dist(s, g.player) < 700 || S.dist(s, g.camps.p) < 800) continue;
      const pack = k === 'wolf' ? 2 : 1;
      for (let j = 0; j < pack; j++) g.units.push(S.newUnit(k, 'w', s.x + j * 20, s.y + j * 12, { state: 'idle', home: s }));
      break;
    }
  }
};
S.spawnRaid = (kind, n, from) => {
  const g = S.game;
  for (let i = 0; i < n; i++) {
    let x = from.x + (Math.random() - .5) * 80, y = from.y + (Math.random() - .5) * 80;
    const u = S.newUnit(kind, kind === 'warrior' ? 'r' : 'w', x, y, { raid: true, state: 'raid' });
    g.units.push(u);
  }
};
})();
