// City economy balance for act 1 (no game code yet): 20 days of a fighter's life, three
// day parts (morning, day, evening) + night sleep, satiety, energy, mood, injuries, money.
// Each strategy is a policy run many times; prints what it ends with by day 20.
// tools/run.sh econ [runs]
const RUNS = Number(process.argv[2] ?? 400);

// ---------- Tunables (the numbers the doc proposes) ----------
export const P = {
  days: 20,
  startMoney: 300,
  debt: 1500,
  // satiety / energy per action
  train: { e: -30, s: -15 },
  spar: { e: -30, s: -15 },
  site: { e: -35, s: -25, pay: 45 }, // morning + day, weekdays only
  market: { e: -20, s: -12, pay: 25 },
  bouncer: { e: -25, s: -10, pay: 60, brawl: 0.25 }, // Friday and Saturday evenings
  rest: { e: 15, s: -5, mood: 6 },
  fight: { e: -40, s: -20 },
  idlePart: { s: -4 },
  night: { e: 70, s: -15 },
  food: { cheap: { $: 5, s: 30, mood: -1 }, cafe: { $: 15, s: 60, mood: 2 }, sport: { $: 40, s: 50, mood: 1, boost: 1.2 } },
  // training: one part on a basement apparatus = this many "points" (a point ~ today's normal day / 2)
  sessionPts: 1,
  hungryK: 0.5, // satiety < 30
  starveTonus: -10, // per day at 0 satiety
  minEnergyTrain: 25,
  // fights
  street: [
    { name: 'лёгкий', p: 0.75, win: 60, lose: 15 },
    { name: 'средний', p: 0.5, win: 140, lose: 25 },
    { name: 'тяжёлый', p: 0.3, win: 220, lose: 35 },
  ],
  league: { every: 2, win: 70, lose: 15, p: 0.5 },
  rent: 70, // a week, paid on Sunday night
  binge: { mood: -40, p: 0.35, cost: 40 }, // a lost day when he is miserable
  injury: { win: 0.12, lose: 0.35, days: [2, 4], hospital: 40 },
};

type Act = 'train' | 'spar' | 'site' | 'market' | 'bouncer' | 'rest' | 'street0' | 'street1' | 'street2' | 'league' | 'idle';
interface St {
  day: number; money: number; earned: number; spent: number; s: number; e: number; mood: number;
  pts: number; tonus: number; hurt: number; hungryParts: number; starveDays: number; blocked: number;
  w: number; l: number; injuries: number; food: number; brawls: number; boost: number; binges: number;
}

const rnd = Math.random;
const dow = (d: number) => (d - 1) % 7; // 0 = Monday
const weekday = (d: number) => dow(d) < 5;
const weekend = (d: number) => dow(d) === 4 || dow(d) === 5;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

/** Form vs. the street: points ahead of the curve help; tired, hungry, hurt hurt. */
function winP(st: St, base: number): number {
  const curve = 1.1 * st.day; // what a fighter who trains normally has by now
  let p = base + 0.012 * (st.pts - curve);
  p *= 0.55 + 0.45 * clamp(st.e / 70, 0, 1);
  if (st.s < 30) p *= 0.85;
  if (st.hurt > 0) p *= 0.7;
  p *= 0.9 + 0.2 * ((st.mood + 100) / 200);
  return clamp(p, 0.05, 0.92);
}

function eat(st: St, kind: 'cheap' | 'cafe' | 'sport') {
  const f = P.food[kind];
  if (st.money < f.$) return false;
  st.money -= f.$; st.spent += f.$; st.food += f.$;
  st.s = Math.min(100, st.s + f.s);
  st.mood = clamp(st.mood + f.mood, -100, 100);
  if (kind === 'sport') st.boost = 1.2;
  return true;
}

function fightResult(st: St, won: boolean, win: number, lose: number) {
  const pay = won ? win : lose;
  st.money += pay; st.earned += pay;
  won ? st.w++ : st.l++;
  st.mood = clamp(st.mood + (won ? 12 : -12), -100, 100);
  if (rnd() < (won ? P.injury.win : P.injury.lose)) {
    st.injuries++;
    let d = P.injury.days[0] + Math.floor(rnd() * (P.injury.days[1] - P.injury.days[0] + 1));
    if (st.money >= P.injury.hospital + 40) { st.money -= P.injury.hospital; st.spent += P.injury.hospital; d = Math.ceil(d / 2); }
    st.hurt = Math.max(st.hurt, d);
  }
}

/** Does one part (or two for the site). Returns parts used. */
function act(st: St, a: Act, part: number): number {
  const trainK = () => (st.s < 30 ? P.hungryK : 1) * (0.85 + 0.3 * ((st.mood + 100) / 200)) * st.boost * (st.hurt > 0 ? 0.5 : 1);
  switch (a) {
    case 'train': case 'spar': {
      const c = a === 'train' ? P.train : P.spar;
      if (st.e < P.minEnergyTrain || (a === 'spar' && st.hurt > 0)) { st.blocked++; return act(st, 'rest', part); }
      st.e += c.e; st.s += c.s; st.pts += P.sessionPts * (a === 'spar' ? 1.2 : 1) * trainK();
      st.tonus = Math.min(100, st.tonus + 8);
      if (a === 'spar' && rnd() < 0.04) { st.hurt = 2; st.injuries++; }
      return 1;
    }
    case 'site': if (!weekday(st.day)) return act(st, 'market', part);
      st.e += P.site.e; st.s += P.site.s; st.money += P.site.pay; st.earned += P.site.pay; st.mood -= 2; return 2;
    case 'market': st.e += P.market.e; st.s += P.market.s; st.money += P.market.pay; st.earned += P.market.pay; st.mood -= 1; return 1;
    case 'bouncer': {
      if (!weekend(st.day)) return act(st, 'market', part);
      st.e += P.bouncer.e; st.s += P.bouncer.s; st.money += P.bouncer.pay; st.earned += P.bouncer.pay; st.mood -= 1;
      if (rnd() < P.bouncer.brawl) { st.brawls++; st.e -= 15; if (rnd() > winP(st, 0.7)) { st.mood -= 5; if (rnd() < 0.2) { st.hurt = Math.max(st.hurt, 2); st.injuries++; } } }
      return 1;
    }
    case 'rest': st.e = Math.min(100, st.e + P.rest.e); st.s += P.rest.s; st.mood = clamp(st.mood + P.rest.mood, -100, 100); return 1;
    case 'league': case 'street0': case 'street1': case 'street2': {
      if (st.hurt > 0) { return act(st, 'rest', part); }
      const t = a === 'league' ? { p: P.league.p, win: P.league.win, lose: P.league.lose } : P.street[Number(a.slice(-1))];
      const won = rnd() < winP(st, t.p);
      st.e += P.fight.e; st.s += P.fight.s;
      fightResult(st, won, t.win, t.lose);
      return 1;
    }
    default: st.s += P.idlePart.s; return 1;
  }
}

type Policy = (st: St, part: number) => Act;
type Feeder = (st: St) => void;

/** Eats enough to stay above `keep`, cheapest food unless `cafe`. */
const feed = (keep: number, cafe: boolean, sport = false): Feeder => (st) => {
  let n = 0;
  while (st.s < keep && n++ < 4) {
    if (sport && st.money > 200 && eat(st, 'sport')) continue;
    if (cafe && st.money > 60 && eat(st, 'cafe')) continue;
    if (!eat(st, 'cheap')) break;
  }
};

function run(policy: Policy, feeder: Feeder): St {
  const st: St = { day: 1, money: P.startMoney, earned: 0, spent: 0, s: 80, e: 100, mood: 30, pts: 0, tonus: 60, hurt: 0, hungryParts: 0, starveDays: 0, blocked: 0, w: 0, l: 0, injuries: 0, food: 0, brawls: 0, boost: 1, binges: 0 };
  for (st.day = 1; st.day <= P.days; st.day++) {
    st.boost = 1;
    let trained = false;
    if (st.mood < P.binge.mood && rnd() < P.binge.p) {
      st.binges++; const c = Math.min(st.money, P.binge.cost); st.money -= c; st.spent += c;
      st.s = Math.max(0, st.s - 30); st.e = Math.min(100, st.e + 20); st.mood += 10; st.tonus = Math.max(0, st.tonus - 6);
      if (st.hurt > 0) st.hurt--;
      continue;
    }
    for (let part = 0; part < 3;) {
      feeder(st);
      const a = policy(st, part);
      if (a === 'site' && part > 1) { part += act(st, 'rest', part); continue; }
      const before = st.pts;
      part += act(st, a, part);
      if (st.pts > before) trained = true;
      st.s = clamp(st.s, 0, 100); st.e = clamp(st.e, 0, 100);
      if (st.s < 30) st.hungryParts++;
    }
    feeder(st);
    st.e = Math.min(100, st.e + P.night.e * (st.s < 30 ? 0.8 : 1));
    st.s = Math.max(0, st.s + P.night.s);
    if (st.s <= 0) { st.starveDays++; st.tonus += P.starveTonus; st.mood -= 8; }
    if (st.s < 30) st.mood -= 3;
    if (!trained) st.tonus = Math.max(0, st.tonus - 6);
    if (st.hurt > 0) st.hurt--;
    if (dow(st.day) === 6) { const r = Math.min(st.money, P.rent); st.money -= r; st.spent += r; if (r < P.rent) st.mood -= 10; }
    st.mood = clamp(st.mood, -100, 100); st.tonus = clamp(st.tonus, 0, 100);
  }
  return st;
}

// ---------- Strategies ----------
const STRATS: [string, Policy, Feeder][] = [
  ['Только работа (стройка + вышибала)', (st, p) => (p === 0 ? 'site' : 'bouncer'), feed(40, false)],
  ['Только тренировки', (st) => (st.e >= 25 ? 'train' : 'rest'), feed(50, true)],
  ['Работа + тренировка', (st, p) => (p === 0 ? 'site' : st.e >= 25 ? 'train' : 'rest'), feed(40, false)],
  ['Ровно (работа/тренировки, бой раз в 3 дня)', (st, p) => {
    if (st.day % 3 === 0) return p < 2 ? (st.e > 60 ? 'train' : 'rest') : 'street1';
    if (st.day % 3 === 1) return p === 0 ? 'site' : st.e >= 25 ? 'train' : 'rest';
    return p === 2 ? 'bouncer' : st.e >= 25 ? 'train' : 'rest';
  }, feed(40, true)],
  ['Лига каждые 2 дня + работа', (st, p) => {
    if (st.day % 2 === 0) return p < 2 ? 'rest' : 'league';
    return p === 0 ? 'site' : st.e >= 25 ? 'train' : 'rest';
  }, feed(40, false)],
  ['Боец (подпольные бои через день)', (st, p) => {
    if (st.day % 2 === 0) return p < 2 ? 'rest' : st.hurt ? 'rest' : 'street1';
    return st.e >= 25 ? 'train' : 'rest';
  }, feed(45, true)],
  ['Рисковый (тяжёлые бои через день)', (st, p) => {
    if (st.day % 2 === 0) return p < 2 ? 'rest' : st.hurt ? 'rest' : 'street2';
    return p === 0 ? 'site' : st.e >= 25 ? 'train' : 'rest';
  }, feed(45, false)],
  ['Рынок утром, бой через день', (st, p) => {
    if (p === 0) return 'market';
    if (st.day % 2 === 0 && p === 2 && !st.hurt) return 'street1';
    return st.e >= 25 ? 'train' : 'rest';
  }, feed(45, true)],
  ['Умный (как играл бы человек)', (st, p) => {
    const need = (P.debt - st.money) / Math.max(1, P.days - st.day + 1); // dollars a day still needed
    if (st.mood < -10 && p === 2) return 'rest';
    if (p === 2 && !st.hurt && st.e >= 55 && st.day % 2 === 0) return winP(st, 0.5) > 0.5 ? 'street1' : 'street0';
    if (p === 2 && weekend(st.day) && need > 40) return 'bouncer';
    if (p === 0 && need > 40) return weekday(st.day) ? 'site' : 'market';
    return st.e >= 25 ? 'train' : 'rest';
  }, feed(45, true)],
  ['Голодный «Ровно» (ест только до 15)', (st, p) => {
    if (st.day % 3 === 0) return p < 2 ? (st.e > 60 ? 'train' : 'rest') : 'street1';
    if (st.day % 3 === 1) return p === 0 ? 'site' : st.e >= 25 ? 'train' : 'rest';
    return p === 2 ? 'bouncer' : st.e >= 25 ? 'train' : 'rest';
  }, feed(15, false)],
];

const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
console.log(`runs ${RUNS}, ${P.days} days, debt $${P.debt}; "очки" = тренировки (1 = одна сессия в подвале)`);
console.log('strategy'.padEnd(44), 'деньги  заработ  еда  долг%  очки  тонус настр голод(частей) упор W-L травм драк запой');
for (const [name, pol, fd] of STRATS) {
  const rs = Array.from({ length: RUNS }, () => run(pol, fd));
  const paid = rs.filter((r) => r.money >= P.debt).length / RUNS;
  console.log(name.padEnd(44),
    String(Math.round(avg(rs.map((r) => r.money)))).padStart(6),
    String(Math.round(avg(rs.map((r) => r.earned)))).padStart(8),
    String(Math.round(avg(rs.map((r) => r.food)))).padStart(5),
    String(Math.round(paid * 100)).padStart(5) + '%',
    avg(rs.map((r) => r.pts)).toFixed(1).padStart(5),
    String(Math.round(avg(rs.map((r) => r.tonus)))).padStart(5),
    String(Math.round(avg(rs.map((r) => r.mood)))).padStart(5),
    avg(rs.map((r) => r.hungryParts)).toFixed(1).padStart(8),
    avg(rs.map((r) => r.blocked)).toFixed(1).padStart(10),
    `${avg(rs.map((r) => r.w)).toFixed(1)}-${avg(rs.map((r) => r.l)).toFixed(1)}`.padStart(8),
    avg(rs.map((r) => r.injuries)).toFixed(1).padStart(4),
    avg(rs.map((r) => r.brawls)).toFixed(1).padStart(4),
    avg(rs.map((r) => r.binges)).toFixed(1).padStart(4));
}
