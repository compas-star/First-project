// Game state: camps, buildings and build pads, unloading, rival AI, day/night, raids, quests.
(() => {
'use strict';

const RADIUS = { center: 40, hut: 30, storage: 34, tower: 22, wall: 0, wonder0: 80, wonder1: 90, farm: 55 };
const PLOT = { center: 50, hut: 66, storage: 74, tower: 54, wall: 74, wonder0: 150, wonder1: 160, farm: 120 };
const BASE_HP = { center: 400, hut: 120, storage: 160, farm: 100, wonder0: 1, wonder1: 1 };

S.maxHp = b => {
  const L = S.BLD[b.type].levels[b.level];
  if (!L) return 1;
  return L.hp || (BASE_HP[b.type] || 100) * (1 + .5 * (b.level - 1));
};

S.newGame = seed => {
  const world = S.world = S.genWorld(seed);
  const g = S.game = {
    seed, time: 0, clock: 0, day: 1, night: false,
    res: { wood: 0, stone: 0, food: 5 }, gp: 0, stats: { wood: 0, stone: 0, food: 0 },
    carry: [], units: [], buildings: [], proj: [], fx: [], questIdx: 0, upkeepT: 0,
    camps: world.camps,
    rival: { res: { wood: 10, stone: 0, food: 10 }, orderIdx: 0, spawnT: 10 },
  };
  let id = 1;
  const mk = (fac, l) => {
    const c = g.camps[fac];
    const b = { id: id++, isBuilding: true, fac, type: l.type, x: c.x + l.dx, y: c.y + l.dy, minC: l.minC, level: l.type === 'center' ? 1 : 0, prog: {}, hp: 1, acc: 0, cd: 0 };
    b.radius = RADIUS[b.type]; b.hp = S.maxHp(b);
    g.buildings.push(b); return b;
  };
  for (const l of S.LAYOUT) mk('p', l);
  for (const l of S.LAYOUT) if (!l.type.startsWith('wonder') && l.type !== 'farm') mk('r', l);
  // rival head start
  const rh = g.buildings.find(b => b.fac === 'r' && b.type === 'hut'); rh.level = 1; rh.hp = S.maxHp(rh);

  const pc = g.camps.p;
  g.player = S.newUnit('player', 'p', pc.x + 20, pc.y + 60);
  for (let i = 0; i < 2; i++) g.units.push(S.newUnit('worker', 'r', g.camps.r.x + i * 20, g.camps.r.y + 50, { state: 'find' }));
  g.allUnits = [g.player, ...g.units];
  // neutral settlers: one close for the tutorial, the rest further out
  const rand = S.rng(seed + 77);
  const dists = [420, 900, 1300, 1700];
  for (const d of dists) S.spawnNeutral(pc, d, rand);
  S.spawnWildlife(); S.spawnWildlife(); S.spawnWildlife();
  S.minimapDirty = true;
  S.clearGroundCache();
  return g;
};

S.spawnNeutral = (from, dist, rand = Math.random) => {
  const g = S.game;
  for (let i = 0; i < 30; i++) {
    const a = rand() * 6.283, d = dist * (.85 + rand() * .3);
    const x = from.x + Math.cos(a) * d, y = from.y + Math.sin(a) * d;
    if (x < 80 || y < 80 || x > S.WORLD - 80 || y > S.WORLD - 80 || S.isWater(x, y) || S.dist({ x, y }, g.camps.r) < 500) continue;
    g.units.push(S.newUnit('neutral', 'n', x, y, { state: 'wander' }));
    return;
  }
};

// ---------- queries ----------
S.bOf = (fac, type) => S.game.buildings.filter(b => b.fac === fac && b.type === type);
S.campLevel = fac => S.game.buildings.find(b => b.fac === fac && b.type === 'center').level;
S.stockPos = fac => { const c = S.game.camps[fac]; return { x: c.x + S.STOCK.dx, y: c.y + S.STOCK.dy }; };
S.storageCarry = fac => { const b = S.bOf(fac, 'storage')[0]; return b && b.level ? S.BLD.storage.levels[b.level].carry : 0; };
S.carryCap = () => 10 + S.storageCarry('p');
S.popCap = fac => S.bOf(fac, 'hut').reduce((s, b) => s + (b.level ? S.BLD.hut.levels[b.level].pop : 0), 0);
S.workers = fac => S.game.units.filter(u => u.kind === 'worker' && u.fac === fac && !u.dead);
S.wallB = fac => S.bOf(fac, 'wall')[0];
S.wallUp = fac => { const w = S.wallB(fac); return !!(w && w.level > 0 && !w.broken); };
S.wallBlocks = (u, x0, y0, x1, y1) => {
  if (u.fac === 'n') return null;
  for (const fac of ['p', 'r']) {
    if (u.fac === fac || !S.wallUp(fac)) continue;
    const c = S.game.camps[fac], R = S.WALL_R - 6;
    if (Math.hypot(x0 - c.x, y0 - c.y) >= R && Math.hypot(x1 - c.x, y1 - c.y) < R) return S.wallB(fac);
  }
  return null;
};
S.nearestBuilding = (fac, x, y, r) => {
  let best = null, bd = r * r;
  for (const b of S.game.buildings) {
    if (b.fac !== fac || b.level < 1 || b.type === 'wall' || b.type.startsWith('wonder')) continue;
    const d = S.dist2(x, y, b.x, b.y); if (d < bd) { bd = d; best = b; }
  }
  return best;
};
S.damageBuilding = (b, dmg) => {
  if (b.level < 1 || b.type.startsWith('wonder')) return;
  if (b.type === 'wall' && b.broken) return;
  b.hp -= dmg; b.hurt = .2;
  if (b.hp > 0) return;
  const name = S.BLD[b.type].levels[b.level].name;
  if (b.type === 'wall') { b.broken = true; b.hp = 0; if (b.fac === 'p') S.toast('Стена пробита!'); return; }
  if (b.type === 'center') { b.hp = S.maxHp(b); return; }
  b.level--; b.hp = S.maxHp(b);
  S.fxBurst(b.x, b.y, 20, ['#7a5a3a', '#4a3a2a', '#999'], 120, 4);
  if (b.fac === 'p') S.toast('Разрушено: ' + name);
};

// ---------- pads ----------
S.padInfo = b => {
  const def = S.BLD[b.type], next = def.levels[b.level + 1];
  if (!next) return null;
  const cl = S.campLevel(b.fac);
  if (b.level === 0 && cl < b.minC) return null;
  if (cl < next.req) return null;
  const info = { b, next, cost: next.cost || {} };
  if (b.level === 0 || b.type === 'wall') { info.x = b.x; info.y = b.y; info.size = PLOT[b.type]; info.plot = b.level === 0; }
  else { info.x = b.x + def.pad[0]; info.y = b.y + def.pad[1]; info.size = 50; info.plot = false; }
  if (next.needs && S.game.lvl(next.needs) < 1) info.locked = 'Сначала построй: ' + S.BLD[next.needs].levels[1].name;
  return info;
};
S.activePads = () => S.game.buildings.filter(b => b.fac === 'p').map(S.padInfo).filter(Boolean);
S.remaining = info => { const out = {}; for (const r in info.cost) { const left = info.cost[r] - (info.b.prog[r] || 0); if (left > 0) out[r] = left; } return out; };

const levelUp = b => {
  const g = S.game;
  b.level++; b.prog = {}; b.broken = false; b.hp = S.maxHp(b);
  if (b.fac !== 'p') return;
  const L = S.BLD[b.type].levels[b.level];
  S.fxBurst(b.x, b.y - 20, 26, ['#ffe08a', '#ffffff', '#c9a26b'], 160, 4);
  S.sound('build');
  if (b.type === 'center' && S.eraOf(b.level) !== S.eraOf(b.level - 1)) { S.toast('Новая эпоха: ' + S.ERAS[S.eraOf(b.level)].name + '!', 4); S.clearGroundCache(); }
  else S.toast('Построено: ' + L.name);
};

let padT = 0, unloadT = 0, needMsgT = 0;
S.updatePads = dt => {
  const g = S.game, p = g.player;
  if (p.dead) return;
  // unload at the stockpile / fire
  unloadT -= dt;
  const st = S.stockPos('p');
  if (g.carry.length && (S.dist(p, st) < 85 || S.dist(p, g.camps.p) < 75) && unloadT <= 0) {
    unloadT = .045;
    const it = g.carry.pop();
    S.fxItem(it, p.x, p.y - 30 - g.carry.length * 7, st, () => { g.res[it]++; g.stats[it]++; });
    S.sound('drop');
  }
  // feed the pad the player stands on
  padT -= dt;
  if (padT > 0) return;
  for (const info of S.activePads()) {
    const h = info.size / 2;
    if (Math.abs(p.x - info.x) > h || Math.abs(p.y - info.y) > h) continue;
    if (info.locked) { if (needMsgT < g.time) { S.fxText(info.x, info.y - 40, info.locked, '#ffd36b'); needMsgT = g.time + 2; } return; }
    const left = S.remaining(info);
    const types = Object.keys(left);
    if (!types.length) { levelUp(info.b); return; }
    for (const r of types) {
      const i = g.carry.lastIndexOf(r);
      if (i >= 0) {
        g.carry.splice(i, 1); info.b.prog[r] = (info.b.prog[r] || 0) + 1;
        S.fxItem(r, p.x, p.y - 30, { x: info.x, y: info.y }); padT = .04; S.sound('drop');
        if (!Object.keys(S.remaining(info)).length) levelUp(info.b);
        return;
      }
    }
    for (const r of types) {
      if (g.res[r] >= 1) {
        g.res[r]--; info.b.prog[r] = (info.b.prog[r] || 0) + 1;
        S.fxItem(r, st.x, st.y - 20, { x: info.x, y: info.y }); padT = .04; S.sound('drop');
        if (!Object.keys(S.remaining(info)).length) levelUp(info.b);
        return;
      }
    }
    if (needMsgT < g.time) { S.fxText(info.x, info.y - 40, 'Не хватает: ' + types.map(r => S.RES_NAME[r].toLowerCase()).join(', '), '#ffd36b'); needMsgT = g.time + 2; }
    return;
  }
};

// ---------- job balancing for player workers ----------
let jobCache = null, jobT = 0;
S.pickJob = () => {
  const g = S.game;
  if (!jobCache || jobT < g.time) {
    const need = { wood: 15, stone: 6, food: 8 + S.workers('p').length * 3 };
    const pads = S.activePads().filter(i => !i.locked).sort((a, b) => sumCost(a) - sumCost(b)).slice(0, 3);
    for (const i of pads) { const l = S.remaining(i); for (const r in l) need[r] += l[r]; }
    if (S.campLevel('p') < 2) need.stone = 0;
    jobCache = need; jobT = g.time + 2;
  }
  const busy = { wood: 0, stone: 0, food: 0 };
  for (const u of S.workers('p')) if (u.res) busy[u.res.kind === 'tree' ? 'wood' : u.res.kind === 'rock' ? 'stone' : 'food']++;
  let best = 'wood', bs = Infinity;
  for (const r of S.RES) { if (!jobCache[r]) continue; const s = (g.res[r] + busy[r] * 6) / jobCache[r]; if (s < bs) { bs = s; best = r; } }
  return best;
};
const sumCost = i => Object.values(S.remaining(i)).reduce((a, b) => a + b, 0);

// ---------- buildings tick ----------
const towerHostile = (b, o) => !o.dead && o.kind !== 'deer' && o.fac !== 'n' && o.fac !== b.fac;
S.updateBuildings = dt => {
  const g = S.game;
  for (const b of g.buildings) {
    if (b.hurt > 0) b.hurt -= dt;
    if (b.level < 1) continue;
    const L = S.BLD[b.type].levels[b.level];
    if (b.type === 'tower') {
      b.cd -= dt;
      if (b.cd <= 0) {
        let best = null, bd = L.range * L.range;
        for (const o of g.allUnits) if (towerHostile(b, o)) { const d = S.dist2(b.x, b.y, o.x, o.y); if (d < bd) { bd = d; best = o; } }
        if (best) { b.cd = L.cd; g.proj.push({ x: b.x, y: b.y - 62, target: best, dmg: L.dmg, ang: 0 }); }
      }
    } else if (b.type === 'farm' && b.fac === 'p') {
      b.acc += dt; if (b.acc >= L.food) { b.acc = 0; g.res.food++; }
    } else if (b.type.startsWith('wonder')) {
      b.acc += dt; if (b.acc >= 10) { b.acc = 0; g.gp += L.gp; if (S.dist(g.player, b) < 600) S.fxText(b.x, b.y - 120, '+' + L.gp + ' очко богов', '#e9c6ff'); }
    } else if (b.type === 'wall') {
      const max = S.maxHp(b);
      if (b.hp < max && !(b.hurt > 0)) { b.hp = Math.min(max, b.hp + max * .015 * dt); if (b.broken && b.hp > max * .35) b.broken = false; }
    }
  }
  // food upkeep for workers
  g.upkeepT += dt;
  if (g.upkeepT >= 40) { g.upkeepT = 0; const n = S.workers('p').length; if (n) { g.res.food = Math.max(0, g.res.food - n); if (g.res.food === 0) S.toast('Поселенцы голодают: добудь еды'); } }
};

// ---------- rival tribe ----------
let rivalT = 0;
S.updateRival = dt => {
  const g = S.game, rv = g.rival;
  rivalT -= dt; if (rivalT > 0) return; rivalT = 1;
  rv.res.wood += .12; rv.res.stone += .06; rv.res.food += .1;
  const type = S.RIVAL_ORDER[rv.orderIdx];
  if (type) {
    const cl = S.campLevel('r');
    const cand = S.bOf('r', type).filter(b => { const n = S.BLD[type].levels[b.level + 1]; return n && cl >= n.req && !(type === 'center' && b.level >= 5); }).sort((a, b) => a.level - b.level)[0];
    if (!cand) rv.orderIdx++;
    else {
      const cost = S.BLD[type].levels[cand.level + 1].cost || {};
      if (S.RES.every(r => (rv.res[r] || 0) >= (cost[r] || 0))) {
        for (const r in cost) rv.res[r] -= cost[r];
        levelUp(cand); rv.orderIdx++;
        S.fxBurst(cand.x, cand.y - 20, 14, ['#ffb0a0', '#ffffff'], 120, 3);
      }
    }
  }
  rv.spawnT -= 1;
  if (rv.spawnT <= 0) {
    rv.spawnT = 45;
    if (S.workers('r').length < Math.max(2, S.popCap('r')) && rv.res.food >= 5) {
      rv.res.food -= 5; const c = g.camps.r;
      g.units.push(S.newUnit('worker', 'r', c.x, c.y + 40, { state: 'find' }));
    }
  }
};

// ---------- day / night ----------
S.updateClock = dt => {
  const g = S.game;
  g.clock += dt;
  const cyc = S.DAY_LEN + S.NIGHT_LEN, ph = g.clock % cyc;
  const night = ph >= S.DAY_LEN;
  if (night !== g.night) {
    g.night = night;
    if (night) {
      S.toast('Наступает ночь. Волки выходят на охоту');
      if (g.day >= 2) {
        const n = Math.min(6, 1 + Math.floor(g.day / 2));
        const c = g.camps.p;
        for (let i = 0; i < 20; i++) {
          const a = Math.random() * 6.283, x = c.x + Math.cos(a) * 900, y = c.y + Math.sin(a) * 900;
          if (!S.isWater(x, y) && x > 60 && y > 60 && x < S.WORLD - 60 && y < S.WORLD - 60) { S.spawnRaid('wolf', n, { x, y }); break; }
        }
      }
      if (g.day >= 3 && g.day % 2 === 1) {
        const n = 1 + Math.floor(S.campLevel('r') / 2) + Math.floor(g.day / 6);
        S.spawnRaid('warrior', n, g.camps.r);
        S.toast('Соседнее племя идёт в набег!', 3.5);
      }
    } else { g.day++; S.toast('День ' + g.day); }
  }
  // phase 0..1 of darkness for rendering
  const fade = 8;
  g.dark = night ? Math.min(1, (ph - S.DAY_LEN) / fade, (cyc - ph) / fade) : 0;
};

// ---------- quests ----------
const qHelpers = g => {
  g.lvl = type => Math.max(0, ...S.bOf('p', type).map(b => b.level));
  g.plotOf = type => {
    const list = S.bOf('p', type).map(S.padInfo).filter(Boolean);
    const i = list.find(i => !i.locked) || list[0];
    return i ? { x: i.x, y: i.y } : null;
  };
  g.stockPos = () => S.stockPos('p');
  // where to go next for a build goal: the pad if we can afford it, otherwise the missing resource
  g.buildTarget = type => {
    const info = S.bOf('p', type).map(S.padInfo).filter(i => i && !i.locked)[0];
    if (!info) return g.plotOf(type);
    const left = S.remaining(info);
    for (const r in left) {
      const have = g.res[r] + g.carry.filter(c => c === r).length;
      if (have < left[r]) {
        if (g.carry.length >= S.carryCap()) return g.stockPos();
        return g.nearestRes(r === 'wood' ? 'tree' : r === 'stone' ? 'rock' : 'bush') || { x: info.x, y: info.y };
      }
    }
    return { x: info.x, y: info.y };
  };
  g.nearestRes = kind => S.nearestRes(g.player.x, g.player.y, kind, 2500);
  g.workers = () => S.workers('p');
  g.nearestNeutral = () => {
    let best = null, bd = Infinity;
    for (const u of g.units) if (u.kind === 'neutral' && u.state === 'wander') { const d = S.dist(u, g.player); if (d < bd) { bd = d; best = u; } }
    const f = g.units.find(u => u.kind === 'neutral' && u.state === 'follow');
    return f ? g.camps.p : best;
  };
};
S.attachHelpers = qHelpers;
// Where the guide arrow points: once the bag is full, stay on "go to camp" until it is empty.
S.guideTarget = () => {
  const g = S.game;
  if (g.carry.length >= S.carryCap()) g.returning = true;
  if (g.carry.length === 0) g.returning = false;
  if (g.returning) return S.stockPos('p');
  const q = S.QUESTS[g.questIdx];
  return q ? q.target(g) : null;
};
let questT = 0;
S.updateQuests = dt => {
  const g = S.game;
  questT -= dt; if (questT > 0) return; questT = .5;
  const q = S.QUESTS[g.questIdx];
  if (q && q.check(g)) { g.questIdx++; S.toast('Цель выполнена!'); S.sound('quest'); }
};
})();
