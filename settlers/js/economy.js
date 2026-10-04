// Economy: state, income per second, prices, purchases, taps, buffs, goals, offline income.
// Pure logic, no DOM, so it can be simulated outside the browser.
(() => {
'use strict';

S.newState = seed => {
  const w = {}; for (const k in S.WORKERS) w[k] = 0;
  const b = {}; for (const k in S.BUILDINGS) b[k] = 0; b.center = 1;
  return { v: 2, seed, time: 0, res: { wood: 0, stone: 0, food: 0 }, w, b, upg: {}, wonder: { idx: 0, stage: 0 }, era: 0, gp: 0, goal: 0,
    stats: { taps: 0, deer: 0, wolvesKilled: 0, wolvesSeen: 0, bestCombo: 0, earned: { wood: 0, stone: 0, food: 0 } }, buffs: [], last: Date.now() };
};

// ---------- number formatting ----------
const SUF = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
S.fmt = n => {
  if (!isFinite(n)) return '∞';
  if (n < 0) return '-' + S.fmt(-n);
  if (n < 10 && n % 1) return n.toFixed(1).replace('.', ',');
  if (n < 1000) return String(Math.floor(n));
  let i = 0; while (n >= 1000 && i < SUF.length - 1) { n /= 1000; i++; }
  return (n < 10 ? n.toFixed(2) : n < 100 ? n.toFixed(1) : Math.floor(n).toString()).replace('.', ',') + SUF[i];
};

// ---------- multipliers ----------
const E = () => S.E;
const milestones = lvl => S.MILESTONES.filter(m => lvl >= m).length;
S.milestones = milestones;
S.nextMilestone = lvl => S.MILESTONES.find(m => m > lvl);
S.upgOwned = id => !!E().upg[id];
S.typeMult = k => { let m = 1; for (const u of S.UPGRADES) if (u.kind === 'worker' && u.target === k && E().upg[u.id]) m *= 2; return m; };
S.boost = res => {
  for (const k in S.BUILDINGS) if (S.BUILDINGS[k].boost === res) { const l = E().b[k]; return (1 + .05 * l) * Math.pow(2, milestones(l)); }
  return 1;
};
S.buffMult = kind => E().buffs.filter(b => b.kind === kind).reduce((m, b) => m * b.mult, 1);
S.eraMult = () => S.ERAS[E().era].mult;
S.workerRate = k => { const W = S.WORKERS[k]; return W.rate * S.typeMult(k) * S.boost(W.res) * S.eraMult() * S.buffMult('frenzy'); };
S.rates = () => {
  const r = { wood: 0, stone: 0, food: 0 };
  for (const k in S.WORKERS) if (E().w[k]) r[S.WORKERS[k].res] += E().w[k] * S.workerRate(k);
  return r;
};
S.popCap = () => 3 + E().b.house * 3 * S.ERAS[E().era].pop;
S.pop = () => S.totalWorkers(E());
S.tapMult = () => { let m = 1; for (const u of S.UPGRADES) if (u.tapMult && E().upg[u.id]) m *= u.tapMult; return m; };
S.tapPct = () => S.UPGRADES.reduce((a, u) => a + (u.tapPct && E().upg[u.id] ? u.tapPct : 0), 0);
S.comboMax = () => S.upgOwned('combo') ? 40 : 20;
S.tapValue = res => {
  const s = E();
  const base = s.b.center * Math.pow(2, milestones(s.b.center)) * S.tapMult() * (1 + s.era);
  return (base + S.tapPct() * S.rates()[res]) * S.buffMult('tap');
};

// ---------- prices ----------
const geo = (base, g, c, n) => base * Math.pow(g, c) * (Math.pow(g, n) - 1) / (g - 1);
S.costOf = (kind, key, n = 1) => {
  const s = E(), out = {};
  if (kind === 'worker') { const W = S.WORKERS[key]; for (const r in W.cost) out[r] = Math.ceil(geo(W.cost[r], S.WORKER_GROW, s.w[key], n)); }
  else if (kind === 'building') { const B = S.BUILDINGS[key]; for (const r in B.cost) out[r] = Math.ceil(geo(B.cost[r], B.grow, s.b[key], n)); }
  else if (kind === 'upgrade') return Object.assign({}, S.UPGRADES.find(u => u.id === key).cost);
  else if (kind === 'wonder') return S.wonderStageCost(s.wonder.idx, s.wonder.stage);
  return out;
};
S.canAfford = c => S.RES.every(r => (E().res[r] || 0) >= (c[r] || 0) - 1e-9);
const pay = c => { for (const r in c) E().res[r] -= c[r]; };
S.maxBuy = (kind, key) => {
  let lim = 1000;
  if (kind === 'worker') lim = Math.max(0, S.popCap() - S.pop());
  if (kind === 'building' && S.BUILDINGS[key].max) lim = S.BUILDINGS[key].max - E().b[key];
  let n = 0;
  while (n < lim && S.canAfford(S.costOf(kind, key, n + 1))) n++;
  return n;
};

// ---------- availability ----------
S.workerUnlocked = k => { const W = S.WORKERS[k]; return E().era >= W.era && (!W.unlock || W.unlock(E())); };
S.buildingUnlocked = k => { const B = S.BUILDINGS[k]; return !B.unlock || B.unlock(E()); };
S.buildingName = k => { const B = S.BUILDINGS[k], s = E(); const i = k === 'center' ? Math.min(B.names.length - 1, s.era * 2 + (s.b.center >= 15 ? 1 : 0)) : k === 'wall' ? Math.max(0, s.b.wall - 1) : Math.min(B.names.length - 1, s.era + (k === 'house' && s.b.house >= 15 && s.era === 0 ? 1 : 0)); return B.names[i]; };
S.upgradeVisible = u => !E().upg[u.id] && E().era >= (u.era || 0) && u.req(E());
S.wonderState = () => {
  const s = E(), W = S.WONDERS[s.wonder.idx];
  if (!W) return { done: true };
  if (s.wonder.idx > s.era) return { waitingEra: true, W };
  return { W, unlocked: W.unlock(s), stage: s.wonder.stage };
};
S.canAdvanceEra = () => E().era < S.ERAS.length - 1 && E().wonder.idx > E().era;

// ---------- actions ----------
S.buy = (kind, key, n = 1) => {
  const s = E();
  if (kind === 'worker' && (!S.workerUnlocked(key) || S.popCap() - S.pop() < n)) return false;
  if (kind === 'building' && (!S.buildingUnlocked(key) || (S.BUILDINGS[key].max && s.b[key] + n > S.BUILDINGS[key].max))) return false;
  if (kind === 'upgrade') { const u = S.UPGRADES.find(u => u.id === key); if (!u || !S.upgradeVisible(u)) return false; }
  if (kind === 'wonder') { const st = S.wonderState(); if (!st.W || st.waitingEra || !st.unlocked) return false; }
  const c = S.costOf(kind, key, n);
  if (n < 1 || !S.canAfford(c)) return false;
  pay(c);
  if (kind === 'worker') s.w[key] += n;
  else if (kind === 'building') s.b[key] += n;
  else if (kind === 'upgrade') s.upg[key] = 1;
  else if (kind === 'wonder') { s.wonder.stage++; if (s.wonder.stage >= S.WONDER_STAGES) { s.wonder.idx++; s.wonder.stage = 0; } }
  return true;
};
S.advanceEra = () => { if (!S.canAdvanceEra()) return false; E().era++; return true; };

S.addBuff = (kind, mult, secs) => {
  const s = E(), dur = secs * (S.upgOwned('deer1') ? 2 : 1);
  s.buffs = s.buffs.filter(b => b.kind !== kind);
  s.buffs.push({ kind, mult, until: s.time + dur, dur });
};
S.gain = (res, amt) => { E().res[res] += amt; E().stats.earned[res] += amt; };

// Advance time. Returns the goal that was completed this tick, if any.
S.tick = dt => {
  const s = E();
  s.time += dt;
  const r = S.rates();
  for (const k of S.RES) S.gain(k, r[k] * dt);
  for (let i = 0; i < s.wonder.idx; i++) s.gp += S.WONDERS[i].gp * dt;
  s.buffs = s.buffs.filter(b => b.until > s.time);
  const g = S.GOALS[s.goal];
  if (g && g.check(s)) {
    const rew = {};
    for (const k of S.RES) { const v = Math.max(r[k] * (g.reward.secs || 0), (g.reward.min || {})[k] || 0); if (v > 0) { rew[k] = v; S.gain(k, v); } }
    s.goal++;
    return { goal: g, reward: rew };
  }
  return null;
};

S.offlineGain = secs => {
  const t = Math.min(secs, 8 * 3600), r = S.rates(), out = {};
  for (const k of S.RES) out[k] = r[k] * t * .5;
  return { secs: t, gain: out };
};
})();
