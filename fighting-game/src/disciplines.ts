import type { Pose } from './rig';

// Fighting styles. A style decides which strikes a fighter reaches for, how he
// stands and at what range he likes to fight. Technique (skill) still decides
// how well he does it.

export type DisciplineId = 'mma' | 'boxing' | 'muaythai' | 'kickboxing' | 'karate' | 'street';

export interface Stance {
  /** Lead foot ahead of the pelvis, rear foot behind, half-width between feet (m for 1.8 m). */
  footFwd: number;
  footBack: number;
  footWidth: number;
  /** Changes to the guard and posture. */
  pose: Partial<Pose>;
}

export interface Discipline {
  id: DisciplineId;
  name: string;
  desc: string;
  /** How often each strike is chosen; strikes not listed are never used. */
  weights: Record<string, number>;
  stance: Stance;
  /** Multiplier on the preferred fighting distance. */
  range: number;
  /** Extra head movement and bounce. */
  headMove: number;
  bounce: number;
}

export const DISCIPLINES: Discipline[] = [
  {
    id: 'mma',
    name: 'ММА',
    desc: 'Всё понемногу: двойки, лоу-кики, колени и локти в ближнем бою.',
    weights: {
      jab: 2, cross: 2, hook: 1.4, rhook: 1, luppercut: 0.5, uppercut: 0.8, overhand: 1, superman: 0.3, backfist: 0.15,
      lelbow: 0.5, relbow: 0.5, rknee: 0.8, teep: 0.6, lowkick: 1.5, calfkick: 0.8, bodykick: 1.1, headkick: 0.5,
      leadkick: 0.5, spinkick: 0.15,
    },
    stance: { footFwd: 0.18, footBack: 0.22, footWidth: 0.13, pose: { crouch: 0.1 } },
    range: 1,
    headMove: 1,
    bounce: 1,
  },
  {
    id: 'boxing',
    name: 'Бокс',
    desc: 'Только руки: джеб, двойки, хуки и апперкоты, нырки и уклоны головой.',
    weights: { jab: 3, cross: 2.5, hook: 2, rhook: 1.5, luppercut: 1, uppercut: 1.2, overhand: 0.8 },
    stance: {
      footFwd: 0.2, footBack: 0.24, footWidth: 0.1,
      pose: { crouch: 0.12, spineLean: 14, headPitch: 10, lShF: 62, lEl: 112, rShF: 44, rEl: 130 },
    },
    range: 0.95,
    headMove: 1.6,
    bounce: 1.3,
  },
  {
    id: 'muaythai',
    name: 'Тайский бокс',
    desc: 'Прямая стойка, длинная защита, тип, лоу-кики, удары ногой в корпус, локти и колени.',
    weights: {
      jab: 1.4, cross: 1.4, hook: 0.9, rhook: 0.7, uppercut: 0.4, teep: 2, lowkick: 2.2, bodykick: 2.3, headkick: 1,
      leadkick: 1, lelbow: 1.2, relbow: 1.2, rknee: 1.6,
    },
    stance: {
      footFwd: 0.15, footBack: 0.16, footWidth: 0.16,
      pose: { crouch: 0.02, spineLean: 3, pelvisTwist: -6, spineTwist: -4, lShF: 78, lEl: 82, rShF: 70, rEl: 96 },
    },
    range: 0.95,
    headMove: 0.4,
    bounce: 0.5,
  },
  {
    id: 'kickboxing',
    name: 'Кикбоксинг',
    desc: 'Серии руками, которые заканчиваются ударом ногой.',
    weights: {
      jab: 2, cross: 2, hook: 1.5, rhook: 1.2, uppercut: 0.8, teep: 0.7, lowkick: 1.5, calfkick: 0.6, bodykick: 1.5,
      headkick: 1, leadkick: 1, spinkick: 0.3,
    },
    stance: { footFwd: 0.18, footBack: 0.2, footWidth: 0.12, pose: { crouch: 0.07 } },
    range: 1,
    headMove: 0.9,
    bounce: 1.1,
  },
  {
    id: 'karate',
    name: 'Каратэ',
    desc: 'Длинная боковая стойка, прыжки на дистанции, резкие входы, удары ногами и с разворота.',
    weights: {
      jab: 1.5, cross: 2, teep: 1, bodykick: 1.2, headkick: 1.4, leadkick: 1.6, spinkick: 1, backfist: 0.8, superman: 0.4,
    },
    stance: {
      footFwd: 0.28, footBack: 0.3, footWidth: 0.06,
      pose: { crouch: 0.12, pelvisTwist: -28, spineTwist: -14, spineLean: 4, lShF: 50, lEl: 72, rShF: 28, rEl: 100 },
    },
    range: 1.3,
    headMove: 0.3,
    bounce: 1.6,
  },
  {
    id: 'street',
    name: 'Уличная драка',
    desc: 'Размашистые удары, пинки и колени, без системы.',
    weights: { haymaker: 1.6, lhaymaker: 1.3, wildupper: 0.9, shove: 0.6, flail: 0.8, jab: 0.5, cross: 1, hook: 0.7, rhook: 1, overhand: 1, stomp: 0.35, rknee: 0.6 },
    stance: { footFwd: 0.12, footBack: 0.14, footWidth: 0.15, pose: { crouch: 0.03 } },
    range: 0.7,
    headMove: 0.3,
    bounce: 0.2,
  },
];

export const DISCIPLINE_BY_ID = Object.fromEntries(DISCIPLINES.map((d) => [d.id, d])) as Record<DisciplineId, Discipline>;
