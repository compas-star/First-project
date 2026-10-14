import type { PowerId } from './powers';
import type { DisciplineId } from './disciplines';

// Fighter parameters. Everything a fighter can do follows from these numbers:
// there are no tiers or leagues, a god-like build simply has bigger values.

export interface FighterParams {
  name: string;
  color: number;
  /** Height in meters. */
  height: number;
  /** Weight in kilograms. */
  weight: number;
  /** Muscle strength multiplier, 1 = ordinary trained human. */
  strength: number;
  /** How fast the body moves: limbs, steps, recovery. 1 = ordinary human. */
  bodySpeed: number;
  /** How fast the fighter perceives and decides. 1 = ordinary human. */
  mindSpeed: number;
  /** Keep mindSpeed equal to bodySpeed. */
  linkMind: boolean;
  /** 0..1, how eager to attack. */
  aggression: number;
  /**
   * 0..1 technique. High: keeps distance, steps in with a lunge and out again,
   * clean punches with the body behind them, tight guard. Low: walks in and swings.
   */
  skill: number;
  /** Fighting style: which strikes, what stance, what range. */
  discipline: DisciplineId;
  powers: PowerId[];
}

export const RED = 0xf0533e;
export const BLUE = 0x3fa7ff;

export function defaultFighter(team: 0 | 1): FighterParams {
  return {
    name: team === 0 ? 'Красный' : 'Синий',
    color: team === 0 ? RED : BLUE,
    height: 1.8,
    weight: 78,
    strength: 1,
    bodySpeed: 1,
    mindSpeed: 1,
    linkMind: true,
    aggression: 0.6,
    skill: 0.6,
    discipline: 'mma',
    powers: [],
  };
}

export interface Preset {
  id: string;
  name: string;
  desc: string;
  red: Partial<FighterParams>;
  blue: Partial<FighterParams>;
}

export const PRESETS: Preset[] = [
  {
    id: 'equal',
    name: 'Два обычных',
    desc: 'Одинаковые люди. Честная драка.',
    red: {},
    blue: { aggression: 0.5 },
  },
  {
    id: 'technique',
    name: 'Мастер и драчун',
    desc: 'Красный: техничный, держит дистанцию. Синий: крупнее и злее, но без техники.',
    red: { skill: 0.95, aggression: 0.55, weight: 72, discipline: 'mma' },
    blue: { skill: 0.1, aggression: 0.9, weight: 90, height: 1.86, strength: 1.2, discipline: 'street' },
  },
  {
    id: 'box-vs-thai',
    name: 'Боксёр и таец',
    desc: 'Красный: бокс, руки и работа головой. Синий: тайский бокс, ноги, локти, колени.',
    red: { discipline: 'boxing', skill: 0.85, aggression: 0.65 },
    blue: { discipline: 'muaythai', skill: 0.85, aggression: 0.6 },
  },
  {
    id: 'karate-vs-kick',
    name: 'Каратэ и кикбоксинг',
    desc: 'Красный: каратэ на длинной дистанции, вертушки. Синий: кикбоксер с сериями.',
    red: { discipline: 'karate', skill: 0.9, aggression: 0.55, weight: 70 },
    blue: { discipline: 'kickboxing', skill: 0.8, aggression: 0.7 },
  },
  {
    id: 'quick',
    name: 'Ртуть',
    desc: 'Красный в 12 раз быстрее и телом, и восприятием.',
    red: { bodySpeed: 12, mindSpeed: 12, weight: 70, aggression: 0.8 },
    blue: {},
  },
  {
    id: 'body-vs-mind',
    name: 'Тело против ума',
    desc: 'Красный: тело ×4, ум обычный. Синий: тело ×1.5, ум ×8.',
    red: { bodySpeed: 4, mindSpeed: 1, linkMind: false },
    blue: { bodySpeed: 1.5, mindSpeed: 8, linkMind: false, skill: 0.9 },
  },
  {
    id: 'heavy',
    name: 'Тяжеловес',
    desc: 'Красный: 2.1 м, 140 кг, сила ×2.5. Синий: лёгкий и на 20% быстрее.',
    red: { height: 2.1, weight: 140, strength: 2.5, bodySpeed: 0.9, mindSpeed: 0.9 },
    blue: { height: 1.7, weight: 64, bodySpeed: 1.2, mindSpeed: 1.2, aggression: 0.7 },
  },
  {
    id: 'giant',
    name: 'Гигант и молния',
    desc: 'Красный: 4 м, сила ×8, медленный. Синий: скорость ×20, но слабый удар.',
    red: { height: 4, weight: 700, strength: 8, bodySpeed: 0.7, mindSpeed: 0.7, aggression: 0.5 },
    blue: { height: 1.75, weight: 70, strength: 0.6, bodySpeed: 20, mindSpeed: 20, aggression: 0.75 },
  },
  {
    id: 'demigods',
    name: 'Полубоги',
    desc: 'Красный: сила ×6, каменная кожа, ударная волна. Синий: скорость ×3, рывок, парирование, регенерация.',
    red: { strength: 6, weight: 120, height: 2, skill: 0.6, powers: ['stone', 'shockwave'] },
    blue: { bodySpeed: 3, mindSpeed: 3, strength: 2, skill: 0.85, powers: ['dash', 'parry', 'regen'] },
  },
];

export function applyPreset(p: Preset): [FighterParams, FighterParams] {
  return [
    { ...defaultFighter(0), ...p.red, powers: [...(p.red.powers ?? [])] },
    { ...defaultFighter(1), ...p.blue, powers: [...(p.blue.powers ?? [])] },
  ];
}
