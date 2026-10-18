import type { PowerId } from './powers';
import type { DisciplineId } from './disciplines';
import type { Genome } from './genome';
import type { SkinId } from './skins';
import type { MapId } from './maps';

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
  /** 0..1 elusiveness: how much and how well he slips, ducks and rolls instead of blocking. */
  evasion: number;
  /** Engine, 1 = ordinary: how long the wind lasts and how fast it comes back. */
  cardio?: number;
  /** 0..1 how good a striker; missing = what his style makes of him. */
  striking?: number;
  /** 0..1 how good a wrestler and ground fighter; missing = what his style makes of him. */
  grappling?: number;
  /** Fighting style: which strikes, what stance, what range. */
  discipline: DisciplineId;
  powers: PowerId[];
  /** Habits learned in training, per style; missing = what the style's school teaches. */
  skills?: Partial<Record<DisciplineId, Skill>>;
  /** Look; missing = what his style wears. */
  skin?: SkinId;
  /** Overrides the habits outright (used while training). */
  genome?: Genome;
  /** Strikes he has drilled, 0..1 by move id: thrown more, quicker, harder; a strike
   *  outside his style becomes his own. */
  moves?: Record<string, number>;
  /** The corner's plan for each round (brain PlanId, or 'auto'). */
  roundPlan?: string[];
}

export interface Skill {
  genome: Genome;
  /** Sparring fights trained. */
  fights: number;
  /** Whom he trained against, last. */
  vs?: string;
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
    evasion: 0.3,
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
  map: MapId;
}

export const PRESETS: Preset[] = [
  {
    id: 'equal',
    map: 'ring',
    name: 'Два обычных',
    desc: 'Одинаковые люди. Честная драка.',
    red: {},
    blue: { aggression: 0.5 },
  },
  {
    id: 'technique',
    map: 'alley',
    name: 'Мастер и драчун',
    desc: 'Красный: техничный, держит дистанцию. Синий: крупнее и злее, но без техники.',
    red: { skill: 0.95, aggression: 0.55, weight: 72, discipline: 'mma', skin: 'ninja', evasion: 0.85 },
    blue: { skill: 0.1, aggression: 0.9, weight: 90, height: 1.86, strength: 1.2, discipline: 'street', skin: 'biker' },
  },
  {
    id: 'box-vs-thai',
    map: 'ring',
    name: 'Боксёр и таец',
    desc: 'Красный: бокс, руки и работа головой. Синий: тайский бокс, ноги, локти, колени.',
    red: { discipline: 'boxing', skill: 0.85, aggression: 0.65, evasion: 0.75 },
    blue: { discipline: 'muaythai', skill: 0.85, aggression: 0.6 },
  },
  {
    id: 'karate-vs-kick',
    map: 'dojo',
    name: 'Каратэ и кикбоксинг',
    desc: 'Красный: каратэ на длинной дистанции, вертушки. Синий: кикбоксер с сериями.',
    red: { discipline: 'karate', skill: 0.9, aggression: 0.55, weight: 70 },
    blue: { discipline: 'kickboxing', skill: 0.8, aggression: 0.7 },
  },
  {
    id: 'wrestler-vs-boxer',
    map: 'cage',
    name: 'Борец и боксёр',
    desc: 'Красный: борец, проходы в ноги и удары сверху. Синий: боксёр, руки и уклоны.',
    red: { discipline: 'wrestling', skill: 0.8, aggression: 0.65, weight: 84 },
    blue: { discipline: 'boxing', skill: 0.85, aggression: 0.6, evasion: 0.7 },
  },
  {
    id: 'bjj-vs-thai',
    map: 'cage',
    name: 'Джиу-джитсу и тайский бокс',
    desc: 'Красный тянет в партер за болевым. Синий бьёт ногами и коленями.',
    red: { discipline: 'bjj', skill: 0.85, aggression: 0.5 },
    blue: { discipline: 'muaythai', skill: 0.85, aggression: 0.65 },
  },
  {
    id: 'quick',
    map: 'cage',
    name: 'Ртуть',
    desc: 'Красный в 12 раз быстрее и телом, и восприятием.',
    red: { bodySpeed: 12, mindSpeed: 12, weight: 70, aggression: 0.8, skin: 'ninja' },
    blue: {},
  },
  {
    id: 'body-vs-mind',
    map: 'cage',
    name: 'Тело против ума',
    desc: 'Красный: тело ×4, ум обычный. Синий: тело ×1.5, ум ×8.',
    red: { bodySpeed: 4, mindSpeed: 1, linkMind: false, skin: 'luchador' },
    blue: { bodySpeed: 1.5, mindSpeed: 8, linkMind: false, skill: 0.9, skin: 'robot' },
  },
  {
    id: 'heavy',
    map: 'roof',
    name: 'Тяжеловес',
    desc: 'Красный: 2.1 м, 140 кг, сила ×2.5. Синий: лёгкий и на 20% быстрее.',
    red: { height: 2.1, weight: 140, strength: 2.5, bodySpeed: 0.9, mindSpeed: 0.9, skin: 'sumo' },
    blue: { height: 1.7, weight: 64, bodySpeed: 1.2, mindSpeed: 1.2, aggression: 0.7, skin: 'clerk' },
  },
  {
    id: 'giant',
    map: 'void',
    name: 'Гигант и молния',
    desc: 'Красный: 4 м, сила ×8, медленный. Синий: скорость ×20, но слабый удар.',
    red: { height: 4, weight: 700, strength: 8, bodySpeed: 0.7, mindSpeed: 0.7, aggression: 0.5, skin: 'zombie' },
    blue: { height: 1.75, weight: 70, strength: 0.6, bodySpeed: 20, mindSpeed: 20, aggression: 0.75, skin: 'ninja' },
  },
  {
    id: 'demigods',
    map: 'void',
    name: 'Полубоги',
    desc: 'Красный: сила ×6, каменная кожа, ударная волна. Синий: скорость ×3, рывок, парирование, регенерация.',
    red: { strength: 6, weight: 120, height: 2, skill: 0.6, powers: ['stone', 'shockwave'], skin: 'gladiator' },
    blue: { bodySpeed: 3, mindSpeed: 3, strength: 2, skill: 0.85, powers: ['dash', 'parry', 'regen'], skin: 'robot' },
  },
  {
    id: 'comix',
    map: 'alley',
    name: 'Призрак и Художник',
    desc: 'Мрачный байкер в коже с шипами против парня, сбежавшего со страницы комикса.',
    red: { weight: 92, height: 1.88, strength: 1.3, aggression: 0.8, discipline: 'street', skin: 'rider' },
    blue: { weight: 74, height: 1.8, bodySpeed: 1.1, evasion: 0.6, skill: 0.75, discipline: 'kickboxing', skin: 'artist' },
  },
  {
    id: 'brute-feral',
    map: 'roof',
    name: 'Громила и Зверь',
    desc: 'Гора мышц против бешеного бойца с бакенбардами.',
    red: { weight: 130, height: 2.0, strength: 2, bodySpeed: 0.9, aggression: 0.85, discipline: 'street', skin: 'brute' },
    blue: { weight: 80, height: 1.72, bodySpeed: 1.15, mindSpeed: 1.15, aggression: 0.9, discipline: 'mma', skin: 'feral' },
  },
];

export function applyPreset(p: Preset): [FighterParams, FighterParams] {
  return [
    { ...defaultFighter(0), skin: undefined, ...p.red, powers: [...(p.red.powers ?? [])] },
    { ...defaultFighter(1), skin: undefined, ...p.blue, powers: [...(p.blue.powers ?? [])] },
  ];
}
