import { Sim, rng32 } from './sim';
import type { FighterParams } from './config';
import { GENES, clampGene, type Genome } from './genome';

// Training: a fighter spars many times and keeps the habits that win.
//
// Evolution strategy with mirrored samples: each round, a few random changes
// to the habits are tried in both directions (+change and -change) on the same
// sparring fights (same opponents, same random seeds), so luck cancels out and
// only the effect of the change remains. The habits move toward the side that
// did better. Works the same headless (tools/evolve.ts) and in the browser,
// where it runs in small slices between frames.

/** One sparring fight from the trainee's side: about -2 (crushed) .. +2 (crushed him). */
export function* spar(me: FighterParams, opp: FighterParams, seed: number, maxT: number): Generator<void, number> {
  const sim = new Sim(me, opp, seed);
  let n = 0;
  try {
    while (!sim.winner && sim.t < maxT) {
      sim.step(sim.stepSize());
      if (++n % 400 === 0) yield;
    }
    const [a, b] = sim.fighters;
    const res = sim.winner ? (sim.winner === a ? 1 : -1) : 0;
    // Quicker wins count a bit more, and the health difference breaks ties.
    const speed = sim.winner ? 0.3 * (1 - sim.t / maxT) * res : 0;
    return res + speed + (a.hp - b.hp) / 100;
  } finally {
    sim.dispose();
  }
}

export interface TrainOptions {
  /** Mirrored pairs per round. */
  pairs: number;
  /** Sparring fights per candidate per round. */
  fights: number;
  rounds: number;
  /** Fight length limit, world seconds. */
  maxT: number;
  /** Step size of the habit update. */
  lr: number;
  seed: number;
  /** Genes to train; default all. */
  keys?: string[];
}

export interface TrainProgress {
  round: number;
  fight: number;
  totalFights: number;
  /** Average sparring score of the last finished round, and of the first. */
  form: number | null;
  firstForm: number | null;
  /** Wins / fights in the last finished round. */
  winRate: number | null;
  mean: Genome;
}

function gauss(r: () => number): number {
  return Math.sqrt(-2 * Math.log(Math.max(1e-9, r()))) * Math.cos(2 * Math.PI * r());
}

/**
 * Trains `me` against the opponents. Yields often (for the browser);
 * the generator's return value is the trained genome.
 */
export function* train(
  me: FighterParams,
  opponents: FighterParams[],
  start: Genome,
  o: TrainOptions,
): Generator<TrainProgress, Genome> {
  const r = rng32(o.seed);
  const genes = GENES.filter((g) => !o.keys || o.keys.includes(g.key));
  const mean: Genome = { ...start };
  const totalFights = o.rounds * o.pairs * 2 * o.fights;
  let fight = 0;
  let form: number | null = null;
  let firstForm: number | null = null;
  let winRate: number | null = null;

  for (let round = 0; round < o.rounds; round++) {
    const seeds = Array.from({ length: o.fights }, () => (r() * 1e9) | 0);
    const opps = Array.from({ length: o.fights }, (_, i) => opponents[(round * o.fights + i) % opponents.length]);
    const eps: Genome[] = [];
    const diffs: number[] = [];
    let sum = 0;
    let wins = 0;
    for (let i = 0; i < o.pairs; i++) {
      const e: Genome = {};
      for (const g of genes) e[g.key] = gauss(r) * g.sigma;
      eps.push(e);
      const score = [0, 0];
      for (const sign of [1, -1]) {
        const cand: Genome = { ...mean };
        for (const g of genes) cand[g.key] = clampGene(g.key, (mean[g.key] ?? 0) + sign * e[g.key]);
        const p = { ...me, genome: cand };
        for (let k = 0; k < o.fights; k++) {
          const it = spar(p, opps[k], seeds[k], o.maxT);
          let res = it.next();
          while (!res.done) {
            yield { round, fight, totalFights, form, firstForm, winRate, mean };
            res = it.next();
          }
          score[sign > 0 ? 0 : 1] += res.value;
          if (res.value > 0.5) wins++;
          fight++;
        }
      }
      diffs.push((score[0] - score[1]) / o.fights);
      sum += score[0] + score[1];
    }
    // Normalize the differences so one lucky knockout does not dominate.
    const scale = Math.sqrt(diffs.reduce((s, x) => s + x * x, 0) / diffs.length) || 1;
    for (const g of genes) {
      let step = 0;
      for (let i = 0; i < o.pairs; i++) step += (diffs[i] / scale) * eps[i][g.key];
      mean[g.key] = clampGene(g.key, (mean[g.key] ?? 0) + (o.lr * step) / o.pairs);
    }
    form = sum / (o.pairs * 2 * o.fights);
    firstForm ??= form;
    winRate = wins / (o.pairs * 2 * o.fights);
    yield { round: round + 1, fight, totalFights, form, firstForm, winRate, mean };
  }
  for (const k of Object.keys(mean)) if (Math.abs(mean[k]) < 1e-3) delete mean[k];
  else mean[k] = Math.round(mean[k] * 1000) / 1000;
  return mean;
}

/** Plays a match of fights, returns the trainee's average score and wins. */
export function* evaluate(me: FighterParams, opponents: FighterParams[], seeds: number[], maxT: number): Generator<void, { score: number; wins: number }> {
  let score = 0;
  let wins = 0;
  for (let i = 0; i < seeds.length; i++) {
    const v = yield* spar(me, opponents[i % opponents.length], seeds[i], maxT);
    score += v;
    if (v > 0.5) wins++;
  }
  return { score: score / seeds.length, wins };
}
