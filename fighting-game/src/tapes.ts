// «Кассеты» (act 3, user: when Сталь went over to Бархат, real fights should run in the
// background so the man who meets you knows your habits). Two things, both real:
// 1. Sparring: while the career screen is open, Титан (and Сталь, if he is Бархат's) spar with
//    a copy of our fighter in small slices between frames, training their habits (genome, the
//    same evolution as «Тренировать против»). The genome is kept on the story man.
// 2. The tapes themselves: before the fight they get the memory every man who fought ours has
//    of him (what he throws, after what, how he answers), merged under their name (main.ts).
import { toParams, save, type Career, type CareerFighter } from './career';
import { train, type TrainProgress } from './train';
import { schoolGenome, genesFor, type Genome } from './genome';
import { kindName, makeMemory, type Memory } from './brain';
import { main } from './story';
import { titanOf } from './act3';

const OPTS = { pairs: 2, fights: 2, rounds: 4, maxT: 40, lr: 0.7 };

let run: { it: Generator<TrainProgress, Genome>; who: CareerFighter; rounds: number; fights: number } | null = null;

/** Sparring runs while the tapes are with Бархат and the championship is not over. */
export const tapesOn = (c: Career) => !!c.act3?.flags.tapes && !c.act3.ending && !c.act3.ch?.done;

/** The men learning ours: Титан, and Сталь if he went over to Бархат and is still in it. */
function learners(c: Career): CareerFighter[] {
  const f = main(c);
  const out = [titanOf(c, f)];
  const st = c.story?.npc.a2stal;
  if (c.act3?.flags.stalEnemy && st) out.push(st);
  return out;
}

/** A slice of background sparring (call once a frame with a time budget, ms). */
export function tapesStep(c: Career, ms: number): void {
  if (!tapesOn(c)) {
    run = null;
    return;
  }
  const a = c.act3!;
  if (!run) {
    const men = learners(c);
    const who = men[(a.flags.tapeTurn ?? 0) % men.length];
    a.flags.tapeTurn = (a.flags.tapeTurn ?? 0) + 1;
    const me = { ...toParams(who, 0), genome: undefined };
    const ours = toParams(main(c), 1);
    const start = who.genome ?? schoolGenome(who.discipline);
    run = { it: train(me, [ours], start, { ...OPTS, seed: (Math.random() * 1e9) | 0, keys: genesFor(who.discipline) }), who, rounds: 0, fights: 0 };
  }
  const until = performance.now() + ms;
  while (performance.now() < until) {
    const r = run.it.next();
    if (r.done) {
      run.who.genome = r.value;
      run = null;
      return;
    }
    if (r.value.fight > run.fights) {
      a.flags.tapeFights = (a.flags.tapeFights ?? 0) + r.value.fight - run.fights;
      run.fights = r.value.fight;
    }
    if (r.value.round > run.rounds) {
      run.rounds = r.value.round;
      run.who.genome = { ...r.value.mean };
      save(c);
    }
  }
}

const MEM_KEY = 'arena-memory-v1';
type MemStore = Record<string, { fights: number; mem: Memory }>;

function store(): MemStore {
  try {
    return JSON.parse(localStorage.getItem(MEM_KEY) ?? '{}') as MemStore;
  } catch {
    return {};
  }
}

const add = (into: Record<string, number>, from: Record<string, number> | undefined) => {
  for (const [k, v] of Object.entries(from ?? {})) into[k] = (into[k] ?? 0) + v;
};

/** Everything the men who fought `target` remember of him, as one memory (the tapes). */
export function tapesOf(target: string, learner: string): { mem: Memory; fights: number } {
  const m = makeMemory();
  let fights = 0;
  for (const [k, v] of Object.entries(store())) {
    const [who, of] = k.split('→');
    if (of !== target || who === learner) continue;
    fights += v.fights;
    add(m.oppMoves, v.mem.oppMoves);
    add(m.kinds, v.mem.kinds);
    add(m.oppReact as Record<string, number>, v.mem.oppReact);
    for (const [blow, next] of Object.entries(v.mem.follow ?? {})) add((m.follow[blow] ??= {}), next);
    for (const [blow, ans] of Object.entries(v.mem.answer ?? {})) add((m.answer[blow] ??= {}), ans);
  }
  return { mem: m, fights };
}

/** What the tapes tell about ours, in words, for the fight's preview. */
export function tapesNote(c: Career, opp: CareerFighter): string | null {
  const a = c.act3;
  if (!a?.flags.tapes || !learners(c).some((m) => m.id === opp.id)) return null;
  const me = toParams(main(c), 0).name;
  const t = tapesOf(me, toParams(opp, 1).name);
  const top = Object.entries(t.mem.kinds).sort((x, y) => y[1] - x[1])[0];
  const spar = a.flags.tapeFights ?? 0;
  return `${opp.name.replace(/^(\S+) «.+» (\S+)$/, '$1 $2')} изучил твои кассеты: ${t.fights} твоих боёв, ${spar} спаррингов с твоей копией.${top ? ` Ждёт твой ${kindName(top[0])}.` : ''} Совет: смени план на бой.`;
}
