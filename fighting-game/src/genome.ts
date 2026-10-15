import { MOVES } from './moves';
import { DISCIPLINE_BY_ID, type DisciplineId } from './disciplines';
import { SCHOOL } from './school';

// A fighter's learned habits: small numbers on top of the hand-written AI.
// Plan biases (which game plan he likes), how eager he is, what range he keeps,
// how often he counters, feints, slips or blocks, how long his combinations
// are and which strikes he trusts. Training (train.ts) tunes them on sparring;
// every value 0 means "as the hand-written AI decides".

export type Genome = Record<string, number>;

export interface Gene {
  key: string;
  min: number;
  max: number;
  /** Mutation size. */
  sigma: number;
  name: string;
}

const PLANS = ['outbox', 'pressure', 'counter', 'legs', 'body', 'survive', 'finish'];

export const GENES: Gene[] = [
  ...PLANS.map((p) => ({ key: `p.${p}`, min: -0.6, max: 0.6, sigma: 0.15, name: `план ${p}` })),
  { key: 'eager', min: -1, max: 1, sigma: 0.2, name: 'агрессия' },
  { key: 'dist', min: -0.3, max: 0.3, sigma: 0.06, name: 'дистанция' },
  { key: 'lunge', min: -0.5, max: 0.5, sigma: 0.1, name: 'выпады' },
  { key: 'counter', min: -0.3, max: 0.4, sigma: 0.08, name: 'контратаки' },
  { key: 'feint', min: -0.2, max: 0.4, sigma: 0.08, name: 'финты' },
  { key: 'dodge', min: -0.3, max: 0.3, sigma: 0.08, name: 'уклоны' },
  { key: 'catch', min: -0.3, max: 0.3, sigma: 0.08, name: 'ловля ноги' },
  { key: 'block', min: -0.3, max: 0.3, sigma: 0.08, name: 'блок' },
  { key: 'combo', min: -1.5, max: 2, sigma: 0.4, name: 'серии' },
  { key: 'body', min: -0.2, max: 0.35, sigma: 0.07, name: 'в корпус' },
  ...MOVES.map((m) => ({ key: `m.${m.id}`, min: -2, max: 1.5, sigma: 0.35, name: m.name })),
];

export const GENE_BY_KEY = Object.fromEntries(GENES.map((g) => [g.key, g])) as Record<string, Gene>;

export function clampGene(key: string, v: number): number {
  const g = GENE_BY_KEY[key];
  return g ? Math.min(g.max, Math.max(g.min, v)) : v;
}

/** What a fighter of this style knows before any training of his own. */
export function schoolGenome(disc: DisciplineId): Genome {
  return { ...(SCHOOL[disc] ?? {}) };
}

/** Genes that matter for a style: strikes it never throws are left out. */
export function genesFor(disc: DisciplineId): string[] {
  const w = DISCIPLINE_BY_ID[disc]?.weights ?? {};
  return GENES.filter((g) => !g.key.startsWith('m.') || (w[g.key.slice(2)] ?? 0) > 0).map((g) => g.key);
}

/** Human-readable summary of the strongest habits. */
export function describeGenome(g: Genome, base: Genome, disc: DisciplineId): string[] {
  const keys = genesFor(disc);
  const out: string[] = [];
  const diff = (k: string) => (g[k] ?? 0) - (base[k] ?? 0);
  const say = (k: string, up: string, down: string, th: number) => {
    const v = diff(k);
    if (v > th) out.push(up);
    else if (v < -th) out.push(down);
  };
  say('eager', 'атакует чаще', 'терпеливее', 0.15);
  say('dist', 'держит дальше', 'стоит ближе', 0.04);
  say('lunge', 'длинные выпады', 'короткие входы', 0.1);
  say('counter', 'больше контратак', 'меньше контратак', 0.06);
  say('feint', 'больше финтов', 'меньше финтов', 0.06);
  say('dodge', 'больше уклонов', 'меньше уклонов', 0.06);
  say('block', 'чаще блок', 'реже блок', 0.06);
  say('catch', 'ловит ноги', 'не ловит ноги', 0.06);
  say('combo', 'длинные серии', 'короткие серии', 0.4);
  say('body', 'чаще в корпус', 'чаще в голову', 0.06);
  const moves = MOVES.filter((m) => keys.includes(`m.${m.id}`)).map((m) => ({ m, v: diff(`m.${m.id}`) })).sort((a, b) => b.v - a.v);
  const fav = moves.filter((x) => x.v > 0.3).slice(0, 3).map((x) => x.m.name);
  if (fav.length) out.push(`любит: ${fav.join(', ')}`);
  return out;
}
