// What he does before a fight (user: before every fight you should choose what to do). One
// choice per fight, applied to his fight parameters.
import type { Career, CareerFighter } from './career';
import type { FighterParams } from './config';
import { partsLeft, energyOf } from './city';

export type PrepId = 'none' | 'warm' | 'study' | 'calm' | 'fire';

export interface Prep {
  id: PrepId;
  name: string;
  desc: string;
  /** Why not now (null = can). */
  no?(c: Career, f: CareerFighter): string | null;
  /** Paid before the fight. */
  cost?(f: CareerFighter): void;
  apply(p: FighterParams): void;
}

export const PREPS: Prep[] = [
  { id: 'none', name: 'Как есть', desc: 'Выйти и драться.', apply: () => {} },
  {
    id: 'warm', name: 'Разминка', desc: 'Разогретый с первого гонга: скорость +3%. Энергия −10.',
    no: (_c, f) => (energyOf(f) < 20 ? 'мало энергии' : null),
    cost: (f) => (f.energy = Math.max(0, energyOf(f) - 10)),
    apply: (p) => (p.bodySpeed *= 1.03),
  },
  {
    id: 'study', name: 'Изучить записи соперника', desc: 'Знаешь его привычки: реакция +6%. Займёт часть дня.',
    no: (c, f) => (partsLeft(c, f) < 1 ? 'нет времени сегодня' : null),
    cost: (f) => (f.parts = (f.parts ?? 0) + 1),
    apply: (p) => (p.mindSpeed *= 1.06),
  },
  {
    id: 'calm', name: 'Беречь силы', desc: 'Спокойный темп: выносливость +12%, меньше лезет вперёд.',
    apply: (p) => {
      p.cardio = (p.cardio ?? 1) * 1.12;
      p.aggression = Math.max(0, p.aggression - 0.1);
    },
  },
  {
    id: 'fire', name: 'Завестись', desc: 'Злой: удар +4%, напор, но техника −4%.',
    apply: (p) => {
      p.strength *= 1.04;
      p.aggression = Math.min(1, p.aggression + 0.15);
      p.skill *= 0.96;
    },
  },
];

export const PREP_BY_ID = Object.fromEntries(PREPS.map((x) => [x.id, x])) as Record<PrepId, Prep>;
