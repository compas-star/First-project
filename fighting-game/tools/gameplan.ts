// Corner's plan, drilled strikes and tonus, headless.
// run.sh gameplan [seeds]  — red: muaythai with a plan per round (legs, body, pressure)
// against the same man without one; then a boxer with a drilled low kick.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { MAP_BY_ID } from '../src/maps';
import { makeFighter, toParams, WCLASSES, TIERS, type CareerFighter } from '../src/career';
const N = Number(process.argv[2] ?? 3);
const LOW = new Set(['lowkick', 'calfkick']);
const BODY = new Set(['bodykick', 'rknee', 'teep', 'shovel', 'lknee']);
function run(a: CareerFighter, b: CareerFighter, seed: number) {
  const pa = toParams(a, 0), pb = toParams(b, 1);
  const sim = new Sim(pa, pb, seed, MAP_BY_ID.void, TIERS[Number(process.env.TIER ?? 3)].rules);
  const per: Record<string, number>[] = [{}, {}, {}];
  const plans: Record<string, number>[] = [{}, {}, {}];
  const prev = [null, null] as unknown[];
  const lames: string[] = [];
  let cards = 0;
  let lowLanded = 0;
  while (!sim.winner && !sim.draw && sim.t < 200) {
    if (sim.betweenRounds) sim.nextRound();
    const h = sim.stepSize();
    sim.step(h);
    const f = sim.fighters[0];
    const r = sim.round - 1;
    plans[r][f.plan] = (plans[r][f.plan] ?? 0) + h;
    sim.fighters.forEach((x, i) => {
      if (x.action !== prev[i] && x.action?.kind === 'attack' && x.action.move && i === 0) {
        const id = x.action.move.id;
        const k = LOW.has(id) ? 'low' : BODY.has(id) ? 'body' : 'other';
        per[r][k] = (per[r][k] ?? 0) + 1;
        per[r]['#' + id] = (per[r]['#' + id] ?? 0) + 1;
      }
      prev[i] = x.action;
    });
    for (const ev of sim.events) if (ev.type === 'hit' && !ev.blocked && ev.target.team === 1 && ev.zone && /Thigh|Shin/.test(String(ev.part))) lowLanded++;
    if (sim.cards.length !== cards || sim.winner || sim.draw) {
      cards = sim.cards.length;
      const e = sim.fighters[1];
      lames.push(`R${cards}:${Math.max(e.lame('lLeg'), e.lame('rLeg')).toFixed(2)}/${lowLanded}`);
    }
    sim.events.length = 0;
  }
  console.log('   lame/legHits', lames.join(' '), sim.winner ? `winner ${sim.winner.team} r${sim.round} ${sim.winner.enemy.koReason}` : 'draw', 'simT', sim.t.toFixed(0));
  sim.dispose();
  return { per, plans };
}
const fmt = (o: Record<string, number>) => Object.entries(o).filter(([k]) => !k.startsWith('#')).map(([k, v]) => `${k}=${v.toFixed(0)}`).join(' ');
RAPIER.init().then(() => {
  const cls = WCLASSES[1];
  for (const plan of process.env.ONLY ? [['legs', 'legs', 'pressure']] : process.env.SKIP ? [] : [undefined, ['legs', 'body', 'pressure']]) {
    console.log('plan', plan ?? 'auto');
    for (let s = 1; s <= N; s++) {
      const a = makeFighter(0.35, 0.6, cls), b = makeFighter(0.35, 0.6, cls);
      a.discipline = 'muaythai';
      a.gamePlan = plan;
      const { per, plans } = run(a, b, s * 7);
      console.log(' seed', s, per.map((p, i) => `R${i + 1}[${fmt(p)} | ${fmt(plans[i])}]`).join('  '));
    }
  }
  for (const drill of [0, 0.8]) {
    let low = 0, tot = 0;
    for (let s = 1; s <= N; s++) {
      const a = makeFighter(0.35, 0.6, cls), b = makeFighter(0.35, 0.6, cls);
      a.discipline = 'boxing';
      a.craft = drill ? { hands: 0, legs: drill } : undefined;
      const { per } = run(a, b, s * 11);
      for (const p of per) for (const [k, v] of Object.entries(p)) if (k.startsWith('#')) { tot += v; if (/kick|teep|knee/.test(k)) low += v; }
    }
    console.log(`boxer, legs ${drill}: kicks ${low} of ${tot} strikes`);
  }
  const f = makeFighter(0.35, 0.6, cls);
  for (const t of [0, 60, 100]) {
    f.tonus = t;
    const p = toParams(f, 0);
    console.log(`tonus ${t}: speed ${p.bodySpeed.toFixed(3)} strength ${p.strength.toFixed(3)} cardio ${p.cardio!.toFixed(3)} mind ${p.mindSpeed.toFixed(3)}`);
  }
});
