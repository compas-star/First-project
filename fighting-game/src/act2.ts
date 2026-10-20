// Act 2 of the main story: «Район» (screenplay = doc tab «Сценарий. Акт 2: Район»). About 25
// days after act 1: win the district tournament, whose final is Сталь, Шрам's son. Lose it
// and Шрам has you thrown out of the district: you live in the sewer (user's call). Starts
// for any career whose act 1 is over (old saves too), on the next check.
import {
  makeFighter, short, save, classOf, addRel, rating,
  type Career, type CareerFighter, type FightResult, type Tier,
} from './career';
import { addMood } from './life';
import { story, main, heavy, npc, place, levelOf } from './story';
import { MAP_BY_ID } from './maps';
import { TV } from './arena';
import { partsLeft, fightToll } from './city';
import { ladder, clubOf } from './clubs';
import { kirpich, scar, kid, gus, shatun, P, type A1Fight } from './act1';
import type { SceneSpec, SceneLine } from './cutscenes';

export type Ending2 = 'champ' | 'final' | 'out';

export interface Act2 {
  start: number;
  done: string[];
  seen: string[];
  pending: string | null;
  flags: Record<string, number>;
  ending?: Ending2;
  /** Career day of the tournament's first day. */
  tourDay: number;
  /** Money staked with Лис on ourselves. */
  bet: number;
}

export const FEE2 = 300;
export const PRIZE2 = 3000;

export const act2 = (c: Career): Act2 | null => c.act2 ?? null;
const day2 = (c: Career, a: Act2) => c.day - a.start + 1;
const did = (a: Act2, id: string) => a.done.includes(id);
/** Act 2 is what the story cards show now. */
export const act2Active = (c: Career) => !!c.act2 && !(c.act2.ending && c.act2.done.includes('end'));
/** Thrown out of the district: home is the sewer. */
export const inSewer = (c: Career) => !!c.act2?.flags.sewer;

/** Begins the act once act 1 is over, its last card closed and the cup known. */
export function ensureAct2(c: Career): string[] {
  const a1 = c.act1;
  if (c.act2 || !a1?.ending || !a1.done.includes('end')) return [];
  // The district comes after the cup of «Подкова» is won (user: you must win it to move on).
  if (ladder(c).stage < 2) return [];
  if (a1.flags.callDue && !a1.flags.called) return [];
  c.act2 = { start: c.day, done: [], seen: [], pending: null, flags: {}, tourDay: c.day + 23, bet: 0 };
  save(c);
  return ['🎬 Начинается акт 2: «Район»'];
}

// ---------- People ----------

function stal(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a2stal', () => heavy(f, 0.08, 'Сталь «Наследник» Железнов', 'muaythai', 'nakmuay'), f);
}
function lis(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a2lis', () => heavy(f, -0.1, 'Лис «Букмекер» Лисин', 'street', 'clerk'), f);
}
/** The district tournament's men: the quarter- and semi-final opponents. */
function rival(c: Career, a: Act2, f: CareerFighter, round: 1 | 2): CareerFighter {
  if (round === 1 && a.flags.kirpichIn) return kirpich(c, f);
  if (round === 2 && c.act1?.flags.kidScar) return kid(c);
  return npc(c, story(c), `a2r${round}`, () => {
    // A man of the district's clubs about our level (not Шрам's first man: he is the final's corner).
    const want = rating(f) + (round === 1 ? -1 : 2);
    const pool = ladder(c).clubs.filter((k) => k.stage === 2).flatMap((k) => k.members.filter((x) => x.id !== k.leader || k.id !== 'iron'));
    const near = pool.filter((x) => Math.abs(rating(x) - want) < 6).sort((x, y) => Math.abs(rating(x) - want) - Math.abs(rating(y) - want));
    if (near.length) return near[Math.floor(Math.random() * Math.min(3, near.length))];
    const m = makeFighter(Math.max(0.02, levelOf(f) + (round === 1 ? -0.02 : 0.03)), 0.5, classOf(f));
    m.story = `${m.story} Заявлен на Турнир района.`;
    return m;
  }, f);
}

const who = (c: Career, m: CareerFighter) => `${short(m)}${clubOf(c, m.id) ? ` (${clubOf(c, m.id)!.name})` : ''}`;
const home = (c: Career) => (c.act1?.flags.lost || inSewer(c) ? MAP_BY_ID.alley : MAP_BY_ID.basement);
const district: Tier = { ...place('ring', 3), name: 'Турнир района' };

// ---------- Scenes ----------

function poster(c: Career, f: CareerFighter): SceneSpec {
  const lines: SceneLine[] = [
    { who: null, text: 'На стене мокрая афиша: «ТУРНИР РАЙОНА. 8 бойцов. Приз — пояс района и $3000. Взнос $300»', shot: 'wide' },
    { who: null, text: 'Внизу мелко: «При поддержке «Железного кулака»»', shot: 'close0' },
    { who: 0, text: 'Ну конечно.', shot: 'close0' },
  ];
  if (c.act1?.ending === 'lost') lines.push({ who: 0, text: 'Двор так двор.', shot: 'wide' });
  if (c.act1?.ending === 'deal') lines.push({ who: 0, text: 'Две тысячи. А на душе как будто должен.', shot: 'close0' });
  return { map: home(c), a: P(f, 0), b: P(f, 1), dist: 2.4, hide: [false, true], lines };
}

function kirpichDoor(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: home(c), a: P(f, 0), b: P(kirpich(c, f), 1), dist: 3.2,
    lines: [
      { who: null, text: 'Дверь открывается. В проёме — Кирпич с огромной сумкой', shot: 'wide', act: (s) => (s.scene!.dist = 1.8) },
      { who: 1, text: 'Гусь меня отпустил.', shot: 'over1' },
      { who: 1, text: 'Буду держать лапы. Бесплатно.', shot: 'over1' },
      { who: 0, text: 'С чего вдруг?', shot: 'over0' },
      { who: 1, text: 'Ты руку дал.', shot: 'close1' },
    ],
  };
}

function stalVisit(c: Career, f: CareerFighter): SceneSpec {
  const lines: SceneLine[] = [
    { who: null, text: 'Вниз спускаются двое. Первым — молодой, наглый', shot: 'low', act: (s) => (s.scene!.dist = 1.8) },
    { who: 1, text: 'И вот тут отец начинал? Пахнет как в подъезде.', shot: 'group' },
    { who: 2, text: 'Знакомься. Мой сын. Фаворит турнира.', shot: 'group' },
    { who: 1, text: 'Ты же подвальный, да? Я тебя в финале подожду. Если дойдёшь.', shot: 'group' },
  ];
  if (c.act1?.flags.kid) lines.push({ who: 1, text: 'Эй, малой. У нас в зале кондиционер. Подумай.', shot: 'over1' });
  lines.push({ who: null, text: 'Что ответить?', shot: 'close0', dur: 2 });
  return { map: home(c), a: P(f, 0), b: P(stal(c, f), 1), dist: 3.2, extra: { p: P(scar(c, f), 1) }, names: { extra: 'Шрам' }, lines };
}

function lisScene(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: MAP_BY_ID.bar, a: P(f, 0), b: P(lis(c, f), 1), dist: 2.2,
    lines: [
      { who: null, text: 'Бар «Подкова». У стойки худой тип в узких очках считает купюры', shot: 'wide' },
      { who: 1, text: 'О, звезда района. Садись. На тебя ставят один к шести. Обидно, да?', shot: 'over1' },
      { who: 0, text: 'Мне всё равно.', shot: 'over0' },
      { who: 1, text: 'А мне нет. Я люблю, когда коэффициент врёт.', shot: 'over1' },
      { who: 1, text: 'Ставишь на себя всё, что есть — выиграешь турнир, получишь вшестеро. Или маленькая просьба: в полуфинале ляжешь — и восемьсот твои сразу.', shot: 'close1' },
    ],
  };
}

function kidFightScene(c: Career, k: CareerFighter, opp: CareerFighter, f: CareerFighter): SceneSpec {
  return {
    map: MAP_BY_ID.roof, a: P(k, 0), b: P(opp, 1), dist: 3, extra: undefined,
    lines: [
      { who: null, text: 'Ночь. Крыша, толпа с телефонами. Первый бой Тимохи', shot: 'wide', act: (s) => (s.scene!.dist = 2.4) },
      { who: 0, text: 'Я не боюсь. Я не боюсь. Я… а если он больше?', shot: 'close0' },
      { who: 2, name: short(f), text: 'Руки вверх, голова вниз.', shot: 'close0' },
      { who: 0, text: 'Это же Михалыча слова!', shot: 'close0' },
    ],
  };
}

function tape2(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: MAP_BY_ID.basement, a: P(f, 0), b: P(f, 1), dist: 2.4, hide: [false, true], names: { tv: 'Михалыч' },
    lines: [
      { who: null, text: 'Кассета «Урок 2»', shot: 'wide', act: () => (TV.on = true) },
      { who: 'tv', text: 'Ноги. Все бьют в голову, а падают от ног. Запомни: дерево рубят снизу.', shot: 'tv' },
      { who: 'tv', text: 'Пояс этот… Восемьдесят девятый год. Финал. Против меня стоял парень, который мне в сыновья годился. Я ему сказал перед боем одну вещь. Зря сказал.', shot: 'tv' },
      { who: null, text: 'Помехи. Запись обрывается', shot: 'tv', act: () => (TV.on = false) },
      { who: 0, text: 'Шрам?', shot: 'close0' },
    ],
  };
}

function weighIn(c: Career, f: CareerFighter): SceneSpec {
  const a = c.act2!;
  const lines: SceneLine[] = [
    { who: null, text: 'Взвешивание. Турнир района через три дня', shot: 'wide', act: (s) => (s.scene!.dist = 0.7) },
    { who: 1, text: 'Подвальный. Ты ещё здесь.', shot: 'over1' },
  ];
  if (a.flags.envelope) lines.push({ who: 1, text: 'Тебя купили дважды. Пояс тебе идёт меньше, чем мне.', shot: 'over1' });
  if (a.flags.shoved) lines.push({ who: null, text: 'Сталь толкает первым. Их растаскивают', shot: 'wide', act: (s) => s.startAction(s.fighters[1], 'attack', { move: MOVE_SHOVE(), zone: 'body' }) });
  lines.push({ who: 2, text: 'Сынок, не трать слова.', shot: 'group' }, { who: null, text: '', shot: 'close0', dur: 1.6 });
  return { map: MAP_BY_ID.ring, a: P(f, 0), b: P(stal(c, f), 1), dist: 2.6, extra: { p: P(scar(c, f), 1) }, names: { extra: 'Шрам' }, lines };
}

import { MOVE_BY_ID } from './moves';
const MOVE_SHOVE = () => MOVE_BY_ID.shove;

function finalFaceoff(c: Career, f: CareerFighter): SceneSpec {
  const a = c.act2!;
  const lines: SceneLine[] = [
    { who: null, text: 'ФИНАЛ ТУРНИРА РАЙОНА', shot: 'wide', act: (s) => (s.scene!.dist = 0.8) },
    { who: 1, text: 'Ну вот и дошёл. Молодец. Дальше не пойдёшь.', shot: 'over1' },
  ];
  if (a.flags.rewound) lines.push({ who: 2, text: 'Он тебе рассказал? Про восемьдесят девятый? Не верь кассетам.', shot: 'group' });
  lines.push({ who: 0, text: 'Посмотрим.', shot: 'close0' });
  return { map: MAP_BY_ID.ring, a: P(f, 0), b: P(stal(c, f), 1), dist: 2.6, extra: { p: P(scar(c, f), 1) }, names: { extra: 'Шрам' }, lines };
}

export function ending2Scene(c: Career, f: CareerFighter, e: Ending2): SceneSpec {
  const s = stal(c, f);
  if (e === 'champ')
    return {
      map: MAP_BY_ID.ring, a: P(f, 0), b: P(s, 1), dist: 2.4, extra: { p: P(scar(c, f), 1) }, names: { extra: 'Шрам' },
      start: (sim) => {
        sim.fighters[1].out = true;
        sim.knockDown(sim.fighters[1], 'нокаут', 'back', 'l');
        sim.startAction(sim.fighters[0], 'victory', { dur: 1e9 });
      },
      lines: [
        { who: null, text: 'ЧЕМПИОН РАЙОНА', shot: 'orbit0', act: (_s, fx) => fx.belt(0) },
        { who: 2, text: 'Встань.', shot: 'group' },
        { who: 2, text: 'Район — твой. Город — мой. Посмотрим.', shot: 'group' },
      ],
    };
  return {
    map: MAP_BY_ID.ring, a: P(f, 0), b: P(s, 1), dist: 1.6, extra: { p: P(scar(c, f), 1) }, names: { extra: 'Шрам' },
    start: (sim) => {
      sim.fighters[0].out = true;
      sim.knockDown(sim.fighters[0], 'нокаут', 'back', 'l');
      if (e === 'final') sim.startAction(sim.fighters[1], 'victory', { dur: 1e9 });
    },
    lines: [
      ...(e === 'final' ? [{ who: 1 as const, text: 'Подвальный — он и есть подвальный.', shot: 'top' as const }] : [{ who: null, text: 'Турнир района выиграл Сталь', shot: 'top' as const }]),
      { who: 2, text: 'А теперь — вон из района. Чтоб я тебя тут не видел.', shot: 'low' },
      { who: null, text: 'Тебя выселили. Теперь твой дом — канализация', shot: 'low' },
    ],
  };
}

// ---------- Fights ----------

function tourFight(c: Career, a: Act2, f: CareerFighter, round: 1 | 2 | 3): A1Fight {
  const opp = round === 3 ? stal(c, f) : rival(c, a, f, round);
  const name = ['', 'Четвертьфинал', 'Полуфинал', 'Финал'][round];
  let pre: SceneSpec | undefined;
  if (round === 3) pre = finalFaceoff(c, f);
  else if (round === 2 && c.act1?.flags.kidScar)
    pre = { map: MAP_BY_ID.ring, a: P(f, 0), b: P(opp, 1), dist: 2.2, lines: [{ who: 1, text: 'Вы меня не взяли. А они взяли.', shot: 'over1' }, { who: 0, text: 'Тимоха…', shot: 'close0' }] };
  else if (round === 1 && a.flags.kirpichIn)
    pre = { map: MAP_BY_ID.ring, a: P(f, 0), b: P(opp, 1), dist: 2.2, lines: [{ who: 1, text: 'Реванш.', shot: 'close1' }] };
  return {
    opp, tier: round === 3 ? { ...district, rules: { ...district.rules, rounds: 5 } } : district, title: `Турнир района, ${name.toLowerCase()}: ${short(f)} против ${short(opp)}`, pre,
    after: (c2, f2, r) => {
      a.done.push(`t${round}`);
      if (round === 2 && a.flags.fix && !a.flags.fixLay && r.won) a.flags.lisEnemy = 1;
      if (!r.won) return finish(c2, a, round === 3 ? 'final' : 'out', [`${name}: поражение от ${short(opp)}`]);
      f2.fame += round;
      if (round === 3) return finish(c2, a, 'champ', [`Финал: Сталь повержен!`]);
      return { lines: [`${name}: победа над ${short(opp)}. ${round === 1 ? 'Сегодня же — полуфинал' : 'Завтра — финал против Стали'}`] };
    },
  };
}

function kidFight(c: Career, a: Act2, f: CareerFighter): A1Fight | null {
  const k = c.roster.find((x) => x.name.includes('Тимоха'));
  if (!k) return null;
  const opp = makeFighter(Math.max(0.01, levelOf(k) - 0.01), 0.5, classOf(k));
  return {
    opp, who: k, tier: { ...place('roof', 1), name: 'Крыша' }, title: `Первый бой Тимохи: против ${short(opp)}`, pre: kidFightScene(c, k, opp, f),
    after: (c2, k2, r) => {
      a.done.push('s6');
      if (r.won) {
        addMood(k2, 30);
        k2.fame += 2;
        a.flags.kidWon = 1;
        return { lines: ['Тимоха победил! Он светится. Известность +2'] };
      }
      return { lines: ['Тимоха проиграл и плачет в полотенце. Боец: «Михалыч говорил: проигрывают все. Встают не все». Тимоха остаётся'] };
    },
  };
}

// ---------- Cards ----------

interface Opt {
  id: string;
  label: string;
  no?: (c: Career, a: Act2, f: CareerFighter) => string | null;
  run(c: Career, a: Act2, f: CareerFighter): { lines: string[]; fight?: A1Fight; scene?: SceneSpec };
}
interface Card {
  id: string;
  title: string;
  who: string;
  when(c: Career, a: Act2): boolean;
  text(c: Career, a: Act2, f: CareerFighter): string;
  scene?(c: Career, f: CareerFighter, a: Act2): SceneSpec;
  /** A fight that cannot be put off (the screen is blocked until it is fought). */
  forced?: boolean;
  opts: Opt[];
}

const CARDS: Card[] = [
  {
    id: 's1', title: 'Афиша', who: 'Район',
    when: () => true,
    text: () => 'На стене афиша: Турнир района через 24 дня. Приз — пояс района и $3000. Взнос $300.',
    scene: poster,
    opts: [{ id: 'ok', label: 'Дальше', run: () => ({ lines: ['Цель: выиграть Турнир района. Взнос $300 — до турнира. Проиграешь — Шрам выживет тебя из района'] }) }],
  },
  {
    id: 's2', title: 'Кирпич у двери', who: 'Кирпич',
    when: (c, a) => day2(c, a) >= 3,
    text: (c) => (c.act1?.flags.kirpichRespect ? 'Кирпич пришёл с сумкой лап: «Буду держать лапы. Бесплатно».' : 'На афише турнира среди восьми фамилий — Кирпичёв. Гусь передал через пацанов: «Кирпич хочет реванша».'),
    scene: (c, f) => (c.act1?.flags.kirpichRespect ? kirpichDoor(c, f) : (undefined as unknown as SceneSpec)),
    opts: [
      { id: 'in', label: '«Заходи»', no: (c) => (c.act1?.flags.kirpichRespect ? null : 'Кирпич не придёт'), run: (_c, a) => {
        a.flags.kirpichGym = 1;
        return { lines: ['Кирпич держит лапы: сила на тренировках растёт на 10% быстрее до конца акта'] };
      } },
      { id: 'no', label: '«Мне не нужна охрана»', no: (c) => (c.act1?.flags.kirpichRespect ? null : 'Кирпич не придёт'), run: (_c, a) => {
        a.flags.kirpichIn = 1;
        return { lines: ['Кирпич пожимает плечами и уходит. Записался на турнир сам'] };
      } },
      { id: 'ok', label: 'Ясно', no: (c) => (c.act1?.flags.kirpichRespect ? 'он стоит у двери' : null), run: (_c, a) => {
        a.flags.kirpichIn = 1;
        return { lines: ['Кирпич — твой соперник в четвертьфинале. И он злой'] };
      } },
    ],
  },
  {
    id: 's3', title: 'Подвальный', who: 'Сталь и Шрам',
    when: (c, a) => day2(c, a) >= 6,
    text: () => 'Шрам привёл сына. Сталь — фаворит турнира и называет тебя «подвальным».',
    scene: stalVisit,
    opts: [
      { id: 'quiet', label: 'Промолчать', run: (_c, a) => {
        a.flags.stalLax = 1;
        return { lines: ['Сталь ухмыляется. Он тебя недооценивает'] };
      } },
      { id: 'reach', label: '«Я дойду»', run: (_c, a, f) => {
        f.fame += 2;
        a.flags.stalAngry = 1;
        return { lines: ['Сталь злится. Известность +2'] };
      } },
      { id: 'shove', label: 'Толкнуть его', run: (c, a, f) => {
        a.flags.shoved = 1;
        addRel(c, f, stal(c, f), -60);
        return { lines: ['Толчок! Вас растаскивают. Шрам: «Ты об этом пожалеешь». Теперь вы со Сталью заклятые враги'] };
      } },
    ],
  },
  {
    id: 's4', title: 'Записка', who: 'Тётя Валя',
    when: (c, a) => day2(c, a) >= 9,
    text: (c) =>
      c.act1?.ending === 'deal'
        ? 'Шрам прислал конверт: $500 и фото Михалыча с поясом. «Бонус. Чтобы ты не передумал».'
        : c.act1?.ending === 'lost'
          ? 'Во дворе поставили забор и табличку «Частная территория. Железный кулак». Тренироваться негде.'
          : 'Под дверью записка: «Ребятки, приходил мужчина в пиджаке. Предлагает за подвал втрое. Платите $200 в неделю — или съезжайте к первому числу. В.»',
    opts: [
      { id: 'pay', label: 'Заплатить вперёд $400', no: (c) => (c.act1?.ending !== 'ours' ? 'не про тебя' : c.money < 400 ? 'нужно $400' : null), run: (c) => {
        c.money -= 400;
        return { lines: ['Тётя Валя довольна: «Вот и ладненько»'] };
      } },
      { id: 'talk', label: 'Поговорить с тётей Валей', no: (c) => (c.act1?.ending !== 'ours' ? 'не про тебя' : null), run: (_c, a) => {
        a.flags.valya = 1;
        return { lines: ['«Михалыч мне двадцать лет полы чинил задаром. Ладно. Но выиграешь турнир — повесишь пояс у меня в прачечной»'] };
      } },
      { id: 'fence', label: 'Перелезать через забор', no: (c) => (c.act1?.ending !== 'lost' ? 'не про тебя' : null), run: () => ({ lines: ['Тренируешься дальше, через забор. Сторож Шрама пока не заметил'] }) },
      { id: 'take', label: 'Взять конверт', no: (c) => (c.act1?.ending !== 'deal' ? 'не про тебя' : null), run: (c, a, f) => {
        c.money += 500;
        addMood(f, -10);
        a.flags.envelope = 1;
        return { lines: ['+$500. На душе гаже'] };
      } },
      { id: 'return', label: 'Вернуть конверт', no: (c) => (c.act1?.ending !== 'deal' ? 'не про тебя' : null), run: (_c, _a, f) => {
        addMood(f, 15);
        f.stats.skill = Math.min(f.caps.skill, f.stats.skill + 0.01);
        return { lines: ['Фото Михалыча оставил себе. Смотришь на него перед тренировкой'] };
      } },
      { id: 'gus', label: 'Позвать Гуся', no: (c) => (c.act1?.flags.gusAlly ? null : 'Гусь тебе не друг'), run: (_c, a) => {
        a.flags.gusUsed = 1;
        return { lines: ['Гусь: «Мужчину в пиджаке я знаю. Поговорю». Всё уладилось'] };
      } },
    ],
  },
  {
    id: 's5', title: 'Лис', who: 'Лис',
    when: (c, a) => day2(c, a) >= 12,
    text: () => 'Букмекер Лис в «Подкове»: поставить на себя (выигрыш вшестеро) или лечь в полуфинале за $800.',
    scene: lisScene,
    opts: [
      { id: 'bet', label: 'Поставить на себя (до $1000)', no: (c) => (c.money < 50 ? 'нужно хотя бы $50' : null), run: (c, a) => {
        a.bet = Math.min(1000, c.money);
        c.money -= a.bet;
        return { lines: [`Ставка $${a.bet} на себя. Выиграешь турнир — получишь $${a.bet * 6}`] };
      } },
      { id: 'fix', label: '«Лягу в полуфинале»', run: (c, a) => {
        c.money += 800;
        a.flags.fix = 1;
        return { lines: ['+$800 сразу. Перед полуфиналом Лис будет в зале'] };
      } },
      { id: 'no', label: '«Я не играю»', run: () => ({ lines: ['Лис улыбается: «Все так говорят. До первого счёта за свет»'] }) },
    ],
  },
  {
    id: 's6', title: 'Первый бой Тимохи', who: 'Тимоха',
    when: (c, a) => day2(c, a) >= 15 && c.roster.some((x) => x.name.includes('Тимоха')),
    text: () => 'Тимоха выходит на свой первый бой на крыше. Ты в его углу.',
    forced: true,
    opts: [{ id: 'go', label: 'В угол Тимохи', run: (c, a, f) => {
      const ft = kidFight(c, a, f);
      if (!ft) {
        a.done.push('s6');
        return { lines: ['Тимохи нет в команде'] };
      }
      return { lines: [], fight: ft };
    } }],
  },
  {
    id: 's7', title: 'Кассета «Урок 2»', who: 'Михалыч (кассета)',
    when: (c, a) => day2(c, a) >= 17,
    text: () => 'Нашлась ещё одна кассета. Михалыч про удары по ногам — и про финал 1989 года.',
    scene: tape2,
    opts: [
      { id: 'train', label: 'Тренироваться по кассете (часть дня)', no: (c, _a, f) => (partsLeft(c, f) < 1 ? 'сегодня уже нет времени' : null), run: (_c, _a, f) => {
        f.craft ??= { hands: 0, legs: 0 };
        f.craft.legs = Math.min(1, f.craft.legs + 0.08);
        f.stats.evasion = Math.min(f.caps.evasion, f.stats.evasion + 0.02);
        f.parts = (f.parts ?? 0) + 1;
        return { lines: ['Урок Михалыча: Ноги +8%, Уклоны +2%'] };
      } },
      { id: 'rewind', label: 'Перемотать назад', no: (c) => (c.act1?.flags.scarSecret ? null : 'нечего искать'), run: (_c, a) => {
        a.flags.rewound = 1;
        return { lines: ['На секунду видно: молодой Шрам в 89-м стоит в углу ринга'] };
      } },
      { id: 'later', label: 'Отложить', run: () => ({ lines: ['Кассета лежит у телевизора'] }) },
    ],
  },
  {
    id: 's8', title: 'Взвешивание', who: 'Сталь',
    when: (c, a) => day2(c, a) >= 21,
    text: (_c, a) => `Взвешивание перед турниром. ${a.flags.fee ? 'Ты в списках.' : 'Взнос ещё не заплачен — $300, иначе тебя не допустят!'}`,
    scene: weighIn,
    opts: [{ id: 'ok', label: 'Дальше', run: () => ({ lines: ['Через три дня — турнир'] }) }],
  },
  {
    id: 't1', title: 'Турнир района: четвертьфинал', who: 'Арена района',
    when: (c, a) => c.day >= a.tourDay,
    forced: true,
    text: (c, a, f) => `Сегодня Турнир района. Четвертьфинал против ${who(c, rival(c, a, f, 1))}.${a.flags.fee ? '' : ` Взнос $${FEE2} не заплачен!`}`,
    opts: [
      { id: 'go', label: 'На бой', no: (c, a) => (!a.flags.fee ? (c.money >= FEE2 ? 'сначала взнос' : `нет $${FEE2} на взнос`) : null), run: (c, a, f) => ({ lines: [], fight: tourFight(c, a, f, 1) }) },
      { id: 'fee', label: `Заплатить взнос $${FEE2}`, no: (c, a) => (a.flags.fee ? 'уже заплачен' : c.money < FEE2 ? 'не хватает денег' : null), run: (c, a) => {
        c.money -= FEE2;
        a.flags.fee = 1;
        a.pending = 't1';
        return { lines: ['Взнос заплачен. На бой!'] };
      } },
      { id: 'cant', label: 'Не допустили', no: (c, a) => (a.flags.fee || c.money >= FEE2 ? 'ты в игре' : null), run: (c, a) => finish(c, a, 'out', ['Без взноса тебя не пустили. Турнир прошёл без тебя']) },
    ],
  },
  {
    id: 'tfix', title: 'Лис в зале', who: 'Лис',
    when: (c, a) => did(a, 't1') && !!a.flags.fix && !a.flags.fixDecided,
    forced: true,
    text: () => 'Лис сидит в первом ряду и смотрит на тебя. Ты обещал лечь в полуфинале.',
    opts: [
      { id: 'lay', label: 'Лечь', run: (c, a) => {
        a.flags.fixDecided = 1;
        a.flags.fixLay = 1;
        a.done.push('t2');
        return finish(c, a, 'out', ['Лёг в третьем раунде. Лис доволен. Шрам смеётся']);
      } },
      { id: 'fight', label: 'Драться по-настоящему', run: (_c, a) => {
        a.flags.fixDecided = 1;
        return { lines: ['Лис этого не забудет'] };
      } },
    ],
  },
  {
    id: 't2', title: 'Турнир района: полуфинал', who: 'Арена района',
    when: (c, a) => did(a, 't1') && (!a.flags.fix || !!a.flags.fixDecided),
    forced: true,
    text: (c, a, f) => `Полуфинал против ${who(c, rival(c, a, f, 2))}.`,
    opts: [{ id: 'go', label: 'На бой', run: (c, a, f) => ({ lines: [], fight: tourFight(c, a, f, 2) }) }],
  },
  {
    id: 't3', title: 'Турнир района: финал', who: 'Сталь',
    when: (c, a) => did(a, 't2') && c.day > a.tourDay,
    forced: true,
    text: () => 'Финал. Сталь. Шрам у его угла.',
    opts: [{ id: 'go', label: 'На бой', run: (c, a, f) => ({ lines: [], fight: tourFight(c, a, f, 3) }) }],
  },

  // --- «Железные кони» after act 1 ---
  {
    id: 'k1', title: 'Жилетка «Коней»', who: 'Шатун',
    when: (c, a) => !!c.act1?.flags.bkJoin && day2(c, a) >= 5,
    text: () => 'Шатун: «Ты наш. Выйди на Турнир района в жилетке «Коней» — $300 сразу и пиво до конца жизни».',
    opts: [
      { id: 'yes', label: 'Выйти в жилетке', run: (c, a) => {
        c.money += 300;
        a.flags.vest = 1;
        return { lines: ['+$300. «Кони» будут орать громче всех. Шрам морщится'] };
      } },
      { id: 'no', label: '«Я выйду сам за себя»', run: (_c, a) => {
        a.flags.bkWar2 = 1;
        return { lines: ['Шатун долго молчит: «Ну смотри». «Кони» обиделись'] };
      } },
    ],
  },
  {
    id: 'k2', title: 'Предупреждение', who: 'Шатун',
    when: (c, a) => !!(c.act1?.flags.bkRespect || (c.act1?.flags.bkJoin && !a.flags.bkWar2)) && c.day >= a.tourDay - 3,
    text: () => 'Ночью у подвала глушит мотор Шатун: «Шрам заплатил «Химикам», чтоб тебя покалечили до турнира. Завтра. Мы будем рядом, но драться — тебе».',
    opts: [{ id: 'ok', label: 'Готовиться', run: (c, a) => {
      a.flags.chemDay = c.day + 1;
      return { lines: ['Завтра придут «Химики». «Кони» прикроют, если что'] };
    } }],
  },
  {
    id: 'k3', title: '«Химики»', who: 'Сёма «Хим»',
    when: (c, a) => !!a.flags.chemDay && c.day >= a.flags.chemDay,
    forced: true,
    text: () => 'У подъезда пацаны в чёрных спортивках. Впереди Сёма «Хим»: «Ничего личного. Заказ».',
    opts: [{ id: 'fight', label: 'Драться', run: (c, a, f) => ({ lines: [], fight: streetFight(c, a, f, 'k3', chem(c, f), [
      { who: null, text: 'Вечер. Чёрные спортивки с полосками. За углом рычат «Кони»', shot: 'low', act: (s) => (s.scene!.dist = 2.2) },
      { who: 1, text: 'Ничего личного, подвальный. Заказ.', shot: 'over1' },
    ], 'Сёма лежит. «Кони» выкатываются из-за угла: «Передайте Шраму — заказ не выполнен»', 'Сёма сильнее. «Кони» отогнали «Химиков», но ты весь в синяках') }) }],
  },
  {
    id: 'k4', title: 'Реванш «Коней»', who: 'Шатун',
    when: (c, a) => !!((c.act1?.flags.bkWar && !c.act1.flags.bkRespect && !c.act1.flags.bkJoin) || a.flags.bkWar2) && c.day >= a.tourDay - 2,
    forced: true,
    text: () => 'Ночь перед турниром. Мотоциклы кругом. Шатун снимает шлем: «Шрам тут ни при чём. Это наше. Один на один».',
    opts: [{ id: 'fight', label: 'Драться', run: (c, a, f) => ({ lines: [], fight: streetFight(c, a, f, 'k4', shatun(c, f), [
      { who: null, text: 'Ночь перед турниром. Фары бьют в глаза', shot: 'low', act: (s) => (s.scene!.dist = 2.2) },
      { who: 1, text: 'Шрам тут ни при чём. Это наше.', shot: 'over1' },
      { who: 0, text: 'Давно пора.', shot: 'close0' },
    ], 'Шатун на асфальте. Протягивает руку: «Всё. Мир. Удачи на турнире»', 'Шатун сильнее. «Кони» уезжают. До турнира — с синяками') }) }],
  },
];

/** A street fight of act 2 (the bikers, the hired «Химики»): a loss leaves him tired before the tournament. */
function streetFight(c: Career, a: Act2, f: CareerFighter, id: string, opp: CareerFighter, lines: SceneLine[], win: string, lose: string): A1Fight {
  return {
    opp, tier: { ...place('alley', 0), name: 'Улица' }, title: `${short(f)} против ${short(opp)}`,
    pre: { map: MAP_BY_ID.alley, a: P(f, 0), b: P(opp, 1), dist: 3.2, lines },
    after: (_c2, f2, r) => {
      a.done.push(id);
      if (r.won) {
        f2.fame += 3;
        addMood(f2, 8);
        if (id === 'k4') a.flags.bkWar2 = 0;
        return { lines: [`${win}. Известность +3`] };
      }
      f2.energy = Math.max(0, (f2.energy ?? 80) - 40);
      addMood(f2, -10);
      return { lines: [`${lose}. Энергия −40`] };
    },
  };
}
function chem(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a2chem', () => heavy(f, 0.03, 'Сёма «Хим» Химичев', 'street', 'gopnik'), f);
}

const BY = Object.fromEntries(CARDS.map((x) => [x.id, x]));

/** The act ends. Losing = thrown out of the district into the sewer. */
function finish(c: Career, a: Act2, e: Ending2, lines: string[]): { lines: string[]; scene?: SceneSpec } {
  if (a.ending) return { lines };
  a.ending = e;
  a.pending = 'end';
  const f = main(c);
  if (e === 'champ') {
    c.money += PRIZE2;
    f.fame += 8;
    addMood(f, 20);
    const L = ladder(c);
    L.stage = Math.max(L.stage, 3);
    lines.push(`Акт 2: «Чемпион района». +$${PRIZE2}, пояс района. Открыт город`);
    if (a.bet) {
      c.money += a.bet * 6;
      lines.push(`Лис платит по ставке: +$${a.bet * 6}`);
    }
    if (c.act1?.flags.lost && !a.flags.valyaLost) lines.push('Шрам по уговору отдаёт ключи от подвала');
    if (c.act1?.flags.lost) c.act1.flags.lost = 0;
  } else {
    a.flags.sewer = 1;
    addMood(f, -20);
    lines.push(`Акт 2: «${e === 'final' ? 'Финалист' : 'Вылет'}». Шрам выжил тебя из района: теперь ты живёшь в канализации. Квартплаты нет, но тренироваться тяжелее (−20%)`);
  }
  return { lines };
}

// ---------- What the career calls ----------

export function act2Check(c: Career): string[] {
  const out = ensureAct2(c);
  const a = act2(c);
  if (!a || a.pending || (a.ending && did(a, 'end'))) return out;
  if (a.ending) {
    a.pending = 'end';
    return out;
  }
  // Every 2-3 days at most, unless it cannot wait (the tournament, a fight at the door).
  const rest = c.day - (a.flags.lastCard ?? -99) < 2;
  const card = CARDS.find((x) => !did(a, x.id) && (!rest || x.forced || x.id === 's8') && x.when(c, a));
  if (card) {
    a.pending = card.id;
    a.flags.lastCard = c.day;
    out.push(`🎬 Сюжет: «${card.title}»`);
  }
  return out;
}

/** Midnight. Day-1 tournament fights left unfought are lost. */
export function act2Day(c: Career): string[] {
  const a = act2(c);
  if (!a) return act2Check(c);
  const out: string[] = [];
  if (!a.ending && c.day > a.tourDay + 1 && !did(a, 't3')) out.push(...finish(c, a, 'out', ['Турнир района прошёл без тебя']).lines);
  else if (!a.ending && c.day > a.tourDay && (a.pending === 't1' || a.pending === 't2' || a.pending === 'tfix')) {
    a.pending = null;
    out.push(...finish(c, a, 'out', ['Не вышел на бой турнира — техническое поражение']).lines);
  }
  out.push(...act2Check(c));
  return out;
}

export function act2Card(c: Career) {
  const a = act2(c);
  if (!a?.pending) return null;
  const f = main(c);
  if (a.pending === 'end') {
    const e = a.ending!;
    return {
      id: 'end', title: e === 'champ' ? 'Чемпион района' : 'Выселен из района', who: e === 'champ' ? 'Шрам' : 'Сталь и Шрам',
      text: e === 'champ' ? 'Пояс района твой. Шрам смотрит на сына, лежащего на ринге.' : 'Шрам сдержал слово: из района тебя выжили. Дом теперь — канализация.',
      film: true, watched: a.seen.includes('end'), forced: false,
      opts: [{ id: 'close', label: e === 'champ' ? 'Акт 2 пройден' : 'Жить дальше', no: null }],
    };
  }
  const card = BY[a.pending];
  const scene = card.scene && !(card.id === 's2' && !c.act1?.flags.kirpichRespect);
  return {
    id: card.id, title: card.title, who: card.who, text: card.text(c, a, f), forced: !!card.forced,
    film: !!scene, watched: a.seen.includes(card.id),
    opts: card.opts.map((o) => ({ id: o.id, label: o.label, no: o.no?.(c, a, f) ?? null })).filter((o) => o.no !== 'не про тебя'),
  };
}

export function act2Film(c: Career): SceneSpec | null {
  const a = act2(c);
  if (!a?.pending) return null;
  const f = main(c);
  if (a.pending === 'end') return ending2Scene(c, f, a.ending!);
  const card = BY[a.pending];
  if (card.id === 's2' && !c.act1?.flags.kirpichRespect) return null;
  return card.scene?.(c, f, a) ?? null;
}

export function act2Seen(c: Career): void {
  const a = act2(c);
  if (a?.pending && !a.seen.includes(a.pending)) a.seen.push(a.pending);
  save(c);
}

export function act2Choose(c: Career, opt: string): { lines: string[]; fight?: A1Fight; scene?: SceneSpec } {
  const a = act2(c);
  if (!a?.pending) return { lines: [] };
  const f = main(c);
  if (a.pending === 'end') {
    a.done.push('end');
    a.pending = null;
    save(c);
    return { lines: [a.ending === 'champ' ? 'Дальше — город. Продолжение следует' : 'Канализация. Продолжение следует'] };
  }
  const card = BY[a.pending];
  const o = card.opts.find((x) => x.id === opt);
  if (!o) return { lines: [] };
  const why = o.no?.(c, a, f);
  if (why) return { lines: [why] };
  const id = a.pending;
  a.pending = null;
  const r = o.run(c, a, f);
  if (!r.fight && !a.done.includes(id) && !(id === 't1' && opt === 'fee')) a.done.push(id);
  if (id === 't1' && opt === 'fee') a.pending = 't1';
  c.log.unshift(...r.lines.map((x) => `🎬 ${x}`));
  // A fight: the next card waits for its result (act2FightDone).
  if (!a.pending && !r.fight) act2Check(c);
  save(c);
  return r;
}

export function act2FightDone(c: Career, f: CareerFighter, fight: A1Fight, r: FightResult): { lines: string[]; scene?: SceneSpec } {
  const a = act2(c)!;
  fightToll(f, false, c.day);
  const res = fight.after(c, f, r);
  if (a.pending && a.pending !== 'end' && a.done.includes(a.pending)) a.pending = null;
  if (!a.pending) act2Check(c);
  c.log.unshift(...res.lines.map((x) => `🎬 ${x}`));
  save(c);
  return res;
}

/** Pays the tournament fee early. */
export function act2Fee(c: Career): string {
  const a = act2(c);
  if (!a || a.ending) return 'Нет турнира';
  if (a.flags.fee) return 'Взнос уже заплачен';
  if (c.money < FEE2) return `Нужно $${FEE2}`;
  c.money -= FEE2;
  a.flags.fee = 1;
  save(c);
  return 'Взнос $300 заплачен: ты в списках Турнира района';
}

export function act2Goal(c: Career): { text: string; debt: number; left: number; fee?: number } | null {
  const a = act2(c);
  if (!a || a.ending) return null;
  return { text: 'Выиграть Турнир района', debt: 0, left: a.tourDay - c.day, fee: a.flags.fee ? 0 : FEE2 };
}

export { gus };
