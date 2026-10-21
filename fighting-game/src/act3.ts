// Act 3 of the main story: «Город» (screenplay = doc tab «Сценарий. Акт 3: Город»). About 100
// days: make a name on the «Городской ринг» (nobody knows of the city championship yet), then
// the poster and 45 days to the championship's final. A story scene at most every 5 days
// (user: let the player play, not watch); fights are the game in between. Тимоха's line is the
// heart of it: the manager's choices quietly add up (`risk`) and decide what Мясник does to him.
// Rich old saves (user: $9000 from before act 3 existed) are robbed in the first days and the
// act starts over, after a flashback of acts 1-2 played as an old tape.
import {
  makeFighter, short, save, classOf, rating, MAX_ROSTER,
  type Career, type CareerFighter, type FightResult, type Tier,
  storyNote,
} from './career';
import { addMood } from './life';
import { story, main, heavy, npc, place, levelOf } from './story';
import { MAP_BY_ID } from './maps';
import { TV } from './arena';
import { partsLeft, fightToll, cannot, DOW, energyOf } from './city';
import { ladder } from './clubs';
import { kid, gus, kirpich, shatun, P, type A1Fight, type Act1Card } from './act1';
import type { SceneSpec, SceneLine } from './cutscenes';

export type Ending3 = 'city' | 'final' | 'sold';

export interface Act3 {
  v: 1;
  /** Career day of the act's day 1; 0 while the prologue (the robbery) is still ahead. */
  start: number;
  /** Career day of the robbery (rich saves), 0 = none. */
  rob: number;
  done: string[];
  seen: string[];
  pending: string | null;
  flags: Record<string, number>;
  /** Wins and losses on the «Городской ринг». */
  wins: number;
  losses: number;
  /** The next man of the city ring (kept so the preview and the fight agree). */
  opp?: CareerFighter;
  /** How much power over Тимоха the manager has handed Бархат (hidden), and why. */
  risk: number;
  why: string[];
  /** Career day of the poster (the city championship announced), 0 = not yet. */
  m: number;
  ending?: Ending3;
}

/** Days between two story scenes (user: something every 5-6 days, not every other day). */
export const GAP3 = 5;
/** A rich save is robbed down to this (his stash behind the pipe). */
export const STASH = 300;
export const ROB_OVER = 2000;
/** Days from the poster to the championship's final; the poster comes no sooner than this act day. */
export const COUNTDOWN = 45;
export const POSTER_AT = 45;
export const POSTER_LATEST = 60;

export const act3 = (c: Career): Act3 | null => c.act3 ?? null;
const did = (a: Act3, id: string) => a.done.includes(id);
/** The act's own day (1 = the first city day: after the robbery, after the sewer). */
const ad = (c: Career, a: Act3) => (a.start && !a.flags.sewer ? c.day - (a.flags.cityDay ?? a.start) + 1 : 0);
const week = (day: number) => Math.floor((day - 1) / 7);
const FRI = 4;
const nextSat = (day: number) => day + ((5 - DOW(day) + 7) % 7);

export const act3Active = (c: Career) => !!c.act3 && !(c.act3.ending && c.act3.done.includes('end'));
/** Wins needed on the city ring: five (seven without Бархат's contract). */
export const need = (a: Act3) => 5 + (a.flags.solo ? 2 : 0);
/** The championship's final (a Saturday), once the poster is up. */
export const finalDay = (a: Act3) => (a.m ? nextSat(a.m + COUNTDOWN) : 0);

/** Begins the act once act 2 is over and its last card closed. */
export function ensureAct3(c: Career): string[] {
  const a2 = c.act2;
  if (c.act3 || !a2?.ending || !a2.done.includes('end')) return [];
  const rich = c.money > ROB_OVER;
  c.act3 = {
    v: 1, start: rich ? 0 : c.day, rob: rich ? c.day + 5 + Math.floor(Math.random() * 6) : 0,
    done: [], seen: [], pending: null, flags: {}, wins: 0, losses: 0, risk: 0, why: [], m: 0,
  };
  if (!rich) begin(c, c.act3);
  ladder(c);
  save(c);
  return ['🎬 Начинается акт 3: «Город»'];
}

/** Day 1 of the city: from the sewer the way up comes first. */
function begin(c: Career, a: Act3): void {
  a.start = c.day;
  if (inSewer(c)) a.flags.sewer = 1;
  else a.flags.cityDay = c.day;
}

const inSewer = (c: Career) => !!c.act2?.flags.sewer;

// ---------- People ----------

function barkhat(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a3barkhat', () => {
    const m = heavy(f, 0.0, 'Бархат «Промоутер» Бархатов', 'boxing', 'barkhat');
    m.height = 1.8;
    m.weight = 92;
    return m;
  }, f);
}
function stal(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a2stal', () => heavy(f, 0.08, 'Сталь «Наследник» Железнов', 'muaythai', 'nakmuay'), f);
}
function lis(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a2lis', () => heavy(f, -0.1, 'Лис «Букмекер» Лисин', 'street', 'clerk'), f);
}
function nik(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a2nik', () => {
    const m = heavy(f, -0.04, 'Николаич «Старая школа» Орлов', 'boxing', 'sovboxer');
    m.weight = 78;
    return m;
  }, f);
}
function robber(c: Career, f: CareerFighter, n: number): CareerFighter {
  return npc(c, story(c), `a3rob${n}`, () => heavy(f, 0.02, n ? 'Капюшон «Второй»' : 'Капюшон «Первый»', 'street', 'velvet'), f);
}
/** The city gangs' men, as they are in the clubs (the same men in the cups). */
const club = (c: Career, id: string) => ladder(c).clubs.find((k) => k.id === id)!;
export const butcher = (c: Career) => club(c, 'velvet').members.find((m) => m.id === club(c, 'velvet').leader) ?? club(c, 'velvet').members[0];
/** Тимоха: the one in the team if he is there, else the boy of the story. */
export function timokha(c: Career): CareerFighter {
  return c.roster.find((x) => x.name.includes('Тимоха')) ?? kid(c);
}
const kidIn = (c: Career) => c.roster.some((x) => x.name.includes('Тимоха'));

/** Home in a scene: the basement, the yard, or the sewer. */
const home = (c: Career) => (c.act1?.flags.lost || inSewer(c) ? MAP_BY_ID.alley : MAP_BY_ID.basement);
const cityRing: Tier = { ...place('ring', 3), name: 'Городской ринг' };

// ---------- Scenes: the prologue (robbery and flashback) ----------

function robberyScene(c: Career, f: CareerFighter): SceneSpec {
  const r1 = robber(c, f, 0);
  const morning = morningScene(c, f);
  return {
    map: MAP_BY_ID.alley, a: P(f, 0), b: P(r1, 1), dist: 3.4, extra: { p: P(robber(c, f, 1), 1), side: -0.8 }, names: { extra: 'Капюшон' },
    lines: [
      { who: null, text: 'Ночь. Дождь. Короткая дорога домой — через подворотню', shot: 'over0', act: (s) => (s.scene!.dist = 2.2) },
      { who: null, text: 'Сзади шаги. Впереди тоже', shot: 'low' },
      { who: 1, text: 'Чемпион, да? Слышали, слышали. При деньгах, говорят.', shot: 'over1' },
      { who: 0, text: 'Проходи мимо.', shot: 'over0' },
      { who: null, text: 'Удар трубой по затылку', shot: 'close0', dur: 1.6, act: (s) => s.knockDown(s.fighters[0], 'удар сзади', 'timber', 'l') },
      { who: 2, name: 'Голос сверху', text: 'Всё забирай. И цепь сними.', shot: 'low' },
      { who: 2, name: 'Голос сверху', text: 'Хватит. Он нам ещё пригодится.', shot: 'low' },
      { who: null, text: 'Темно', shot: 'low', dur: 1.4 },
    ],
    next: flashback(c, f, morning),
  };
}

/** Acts 1-2 as the fighter lies in the rain: short worn-tape scenes of what this save lived through. */
function flashback(c: Career, f: CareerFighter, after: SceneSpec): SceneSpec {
  const a1 = c.act1;
  const a2 = c.act2;
  const segs: SceneSpec[] = [];
  const me = P(f, 0);
  const alone = (map: SceneSpec['map'], lines: SceneLine[], extra: Partial<SceneSpec> = {}): SceneSpec => ({ map, a: me, b: P(f, 1), dist: 2.4, hide: [false, true], lines, vhs: true, ...extra });
  segs.push(alone(MAP_BY_ID.basement, [
    { who: null, text: 'Подвал. Старый телевизор', shot: 'wide', act: () => (TV.on = true) },
    { who: 'tv', text: 'Ключи теперь твои, малой. Мешок, пояс, долги. Больше у меня ничего нет.', shot: 'tv' },
  ], { names: { tv: 'Михалыч' } }));
  if (a1?.ending === 'ours')
    segs.push({
      map: MAP_BY_ID.basement, a: me, b: P(gus(c, f), 1), dist: 1.6, vhs: true, extra: { p: P(kirpich(c, f), 1) }, names: { extra: 'Кирпич' },
      start: (s) => s.knockDown(s.fighters[1], 'нокаут', 'back', 'r'),
      lines: [{ who: null, text: 'Тридцатое. Гусь на полу. Подвал остался твоим', shot: 'wide' }],
    });
  else if (a1?.ending === 'lost')
    segs.push(alone(MAP_BY_ID.alley, [{ who: null, text: 'Тридцатое. Ключи ушли Гусю. Тренировался во дворе, под дождём', shot: 'wide' }]));
  else if (a1?.ending === 'deal')
    segs.push(alone(MAP_BY_ID.basement, [{ who: null, text: 'Сделка со Шрамом. Пояс Михалыча ушёл на чужую стену', shot: 'wide' }]));
  if (a1?.flags.bkJoin || a1?.flags.bkRespect || a1?.flags.bkWar)
    segs.push({
      map: MAP_BY_ID.alley, a: me, b: P(shatun(c, f), 1), dist: 1.8, vhs: true,
      lines: [{
        who: null, shot: 'over1',
        text: a1.flags.bkJoin ? 'Жилет «Железных коней». Шатун хлопает по плечу: «Ты наш»' : a1.flags.bkRespect ? 'Дуэль с Шатуном. Он протягивает руку: «Уважаю»' : 'Война с «Конями». Фары в глаза, рёв моторов',
      }],
    });
  if ((ladder(c).cupWins ?? 0) > 0)
    segs.push({
      map: MAP_BY_ID.bar, a: me, b: P(f, 1), dist: 2.4, hide: [false, true], vhs: true,
      start: (s) => s.startAction(s.fighters[0], 'victory', { dur: 1e9 }),
      lines: [{ who: null, text: 'Кубок «Подковы». Первый пояс', shot: 'orbit0', act: (_s, fx) => fx.belt(0) }],
    });
  const friends = [kidIn(c) ? 'Тимоха' : '', a2?.flags.mentor ? 'Николаич' : '', a2?.flags.desHelp || (a2 && did2(c, 'd1') && !a2.flags.desCold) ? '«Десант»' : '', a2?.flags.chemOut ? '«Химики» ушли из района' : ''].filter(Boolean);
  if (friends.length)
    segs.push({
      map: MAP_BY_ID.basement, a: me, b: P(timokha(c), 1), dist: 2.2, vhs: true, hide: [false, !kidIn(c)],
      ...(a2?.flags.mentor ? { extra: { p: P(nik(c, f), 1) } } : {}),
      lines: [{ who: null, text: friends.join('. ') + '.', shot: 'wide' }],
    });
  if (a2?.ending)
    segs.push({
      map: MAP_BY_ID.ring, a: me, b: P(stal(c, f), 1), dist: 1.6, vhs: true,
      start: (s) => {
        const [w, l] = a2.ending === 'champ' ? [0, 1] : [1, 0];
        s.knockDown(s.fighters[l], 'нокаут', 'back', 'l');
        s.startAction(s.fighters[w], 'victory', { dur: 1e9 });
      },
      lines: [{ who: null, text: a2.ending === 'champ' ? 'Финал района. Сталь на полу. Пояс района твой' : 'Финал района. «Подвальный — он и есть подвальный». Канализация', shot: 'wide' }],
    });
  segs.push(alone(MAP_BY_ID.basement, [
    { who: 'tv', text: 'Упал — встань. Всё остальное ерунда.', shot: 'tv', act: () => (TV.on = true) },
  ], { names: { tv: 'Михалыч' } }));
  for (let i = 0; i < segs.length; i++) segs[i].next = segs[i + 1] ?? after;
  return segs[0];
}
const did2 = (c: Career, id: string) => !!c.act2?.done.includes(id);

function morningScene(c: Career, f: CareerFighter): SceneSpec {
  const k = timokha(c);
  return {
    map: home(c), a: P(f, 0), b: P(k, 1), dist: 2.2,
    lines: [
      { who: null, text: 'Утро. Голова гудит', shot: 'wide' },
      { who: 1, text: 'Очнулся! Тебя дворник нашёл. Двое суток лежал.', shot: 'over1' },
      { who: 0, text: 'Деньги?', shot: 'over0' },
      { who: 1, text: 'Всё вынесли. Цепь, пояс… всё.', shot: 'close1' },
      { who: null, text: 'Тайник за трубой. Старая заначка: $300', shot: 'close0' },
      { who: 0, text: 'Ну что. Сначала.', shot: 'close0' },
    ],
  };
}

// ---------- Scenes of chapter 1 ----------

function barkhatScene(c: Career, f: CareerFighter, a: Act3): SceneSpec {
  const lines: SceneLine[] = [
    { who: null, text: '«Подкова». В дверь входит человек в бордовом бархатном пиджаке', shot: 'wide', act: (s) => (s.scene!.dist = 1.8) },
    { who: 1, text: 'Аркадий Бархатов. Можно просто Бархат. Я вожу бои в городе.', shot: 'over1' },
  ];
  if (a.flags.robbed) lines.push({ who: 1, text: 'Слышал, тебя обнесли. Бывает. Голодные дерутся лучше.', shot: 'close1' });
  else if (a.flags.wasSewer) lines.push({ who: 1, text: 'Люблю истории про тех, кто поднялся со дна. Их хорошо продавать.', shot: 'close1' });
  lines.push(
    { who: 1, text: 'Район — это деревня. Город платит настоящие деньги. «Городской ринг», по пятницам.', shot: 'over1' },
    { who: 1, text: 'Подпиши — и я сделаю тебе имя. За скромные сорок процентов.', shot: 'close1' },
    { who: null, text: 'Что ответить?', shot: 'close0', dur: 2 },
  );
  return { map: MAP_BY_ID.bar, a: P(f, 0), b: P(barkhat(c, f), 1), dist: 2.8, extra: { p: P(butcher(c), 1) }, names: { extra: 'Мясник' }, lines };
}

function kidScene(c: Career, f: CareerFighter, lines: SceneLine[], map = home(c)): SceneSpec {
  return { map, a: P(f, 0), b: P(timokha(c), 1), dist: 2.2, lines };
}

/** The first ring fight with Тимоха in the corner (a funny scene: the bucket and the towel). */
function cornerScene(c: Career, f: CareerFighter, opp: CareerFighter): SceneSpec {
  return {
    map: MAP_BY_ID.ring, a: P(f, 0), b: P(opp, 1), dist: 3,
    lines: [
      { who: null, text: '«Городской ринг». Настоящие канаты, настоящий свет', shot: 'wide', act: (s) => (s.scene!.dist = 2.4) },
      { who: 2, name: 'Тимоха', text: 'Так. Вода, полотенце, капа… где капа? А, она у меня во рту.', shot: 'close0' },
      { who: 2, name: 'Тимоха', text: 'Если что — я кидаю ведро! То есть полотенце. Не ведро!', shot: 'close0' },
      { who: 0, text: 'Тимоха. Просто стой рядом.', shot: 'close0' },
    ],
  };
}

// ---------- Fights ----------

/** The next man on the city ring: a city gang's man about our level, a bit better each win. */
export function ringOpp(c: Career, a: Act3, f: CareerFighter): CareerFighter {
  if (a.opp) return a.opp;
  const step = [-3, -1, 1, 2, 3, 4, 5, 6][Math.min(7, a.wins)];
  const want = rating(f) + step + (a.flags.gift === 1 ? -9 : 0) + (a.flags.hard === 1 ? 4 : 0);
  const beaten = new Set(Object.keys(a.flags).filter((k) => k.startsWith('beat_')).map((k) => k.slice(5)));
  const pool = ladder(c).clubs.filter((k) => k.stage === 3).flatMap((k) => k.members.filter((m) => m.id !== k.leader && !beaten.has(m.id)));
  const near = pool.filter((m) => Math.abs(rating(m) - want) < 6).sort((x, y) => Math.abs(rating(x) - want) - Math.abs(rating(y) - want));
  let m = near[0];
  if (!m) {
    m = makeFighter(Math.max(0.02, Math.min(1, (want - 17) / 67)), 0.5, classOf(f));
    m.story = `${m.story} Дерётся на «Городском ринге».`;
  }
  a.opp = m;
  return m;
}

const purse = (a: Act3) => Math.round([500, 600, 700, 800, 900, 1000, 1000, 1000][Math.min(7, a.wins)] * (1 - (a.flags.cut ?? 0) / 100));

function ringFight(c: Career, a: Act3, f: CareerFighter, midweek: boolean): A1Fight {
  const gift = a.flags.gift === 1;
  let opp = ringOpp(c, a, f);
  // Лис's gift: the man is paid to lie down (slow, soft, no will to win).
  if (gift) {
    opp = JSON.parse(JSON.stringify(opp)) as CareerFighter;
    for (const k of Object.keys(opp.stats) as (keyof CareerFighter['stats'])[]) opp.stats[k] *= k === 'skill' || k === 'evasion' ? 0.4 : 0.7;
    opp.aggression = 0.05;
  }
  let pre: SceneSpec | undefined;
  if (a.flags.kidCorner === 1 && !a.flags.cornerSeen) pre = cornerScene(c, f, opp);
  else if (gift)
    pre = { map: MAP_BY_ID.ring, a: P(f, 0), b: P(opp, 1), dist: 2.4, lines: [
      { who: null, text: 'Соперник не смотрит в глаза. В первом ряду Лис машет рукой', shot: 'over1' },
    ] };
  return {
    opp, tier: cityRing, pre,
    title: `Городской ринг${midweek ? ' (вызов)' : ''}: ${short(f)} против ${short(opp)}`,
    after: (c2, f2, r) => {
      a.opp = undefined;
      if (pre && a.flags.kidCorner === 1) a.flags.cornerSeen = 1;
      if (gift) {
        a.flags.gift = 2;
        a.flags.giftDay = c2.day;
      }
      a.flags.hard = 0;
      const pay = r.won ? purse(a) : Math.round(100 * (1 - (a.flags.cut ?? 0) / 100));
      c2.money += pay;
      if (r.won) {
        a.wins++;
        a.flags[`beat_${opp.id}`] = 1;
        f2.record.w++;
        f2.fame += 2;
        addMood(f2, 8);
        const left = need(a) - a.wins;
        return { lines: [`Победа на Городском ринге над ${short(opp)}: +$${pay}${a.flags.cut ? ` (Бархат взял ${a.flags.cut}%)` : ''}. ${left > 0 ? `До имени в городе — ещё ${left}` : 'Город знает твоё имя'}`] };
      }
      a.losses++;
      f2.record.l++;
      addMood(f2, -8);
      return { lines: [`Поражение от ${short(opp)}. За выход +$${pay}. Следующая пятница — новый шанс`] };
    },
  };
}

/** «Подземка»: fights in the old metro tunnel, the way out of the sewer. */
function underFight(c: Career, a: Act3, f: CareerFighter): A1Fight {
  const opp = makeFighter(Math.max(0.02, levelOf(f) - 0.02), 0.5, classOf(f));
  opp.story = `${opp.story} Дерётся в «Подземке».`;
  return {
    opp, tier: { ...place('basement', 0), name: '«Подземка»' }, title: `«Подземка»: ${short(f)} против ${short(opp)}`,
    pre: { map: MAP_BY_ID.basement, a: P(f, 0), b: P(opp, 1), dist: 3, lines: [{ who: null, text: 'Старый тоннель метро. Фонари на рельсах, ставки на ящиках', shot: 'low' }] },
    after: (c2, f2, r) => {
      a.flags.underDay = c2.day;
      if (r.won) {
        a.flags.under = (a.flags.under ?? 0) + 1;
        c2.money += 150;
        f2.fame += 1;
        return { lines: [`«Подземка»: победа, +$150. ${a.flags.under >= 2 ? 'Про тебя заговорили наверху' : 'Ещё одна — и про тебя заговорят наверху'}`] };
      }
      return { lines: ['«Подземка»: поражение. Завтра снова'] };
    },
  };
}

/** Тимоха against Мясник: what happens to him depends on the risk (and on whether we were there). */
function kidFight(c: Career, a: Act3): A1Fight {
  const k = timokha(c);
  const opp = butcher(c);
  return {
    opp, who: k, tier: { ...place('ring', 3), name: 'Разогрев «Городского ринга»' }, title: `Разогрев: Тимоха против ${short(opp)}`,
    pre: {
      map: MAP_BY_ID.ring, a: P(k, 0), b: P(opp, 1), dist: 3, extra: { p: P(barkhat(c, main(c)), 1), side: 1.2 }, names: { extra: 'Бархат' },
      lines: [
        { who: null, text: 'Разогрев «Городского ринга». Тимоха против Мясника', shot: 'wide', act: (s) => (s.scene!.dist = 2.2) },
        { who: 0, text: 'Он же… он же в два раза больше меня.', shot: 'close0' },
        { who: 2, text: 'Деньги любят смелых, мальчик.', shot: 'group' },
        ...(a.flags.present ? [{ who: null, text: 'Ты в углу Тимохи. Полотенце в руке', shot: 'low' as const }] : [{ who: null, text: 'Тебя в зале нет', shot: 'low' as const }]),
      ],
    },
    after: (c2, k2, r) => {
      a.done.push('t6');
      const sev = r.won ? 0 : Math.max(0, a.risk - (a.flags.present ? 1 : 0));
      const hurt = r.won ? 1 : sev <= 1 ? 1 : sev <= 3 ? 2 : 3;
      a.flags.kidHurt = hurt;
      a.flags.hospDay = c2.day;
      const days = [0, 7, 21, 9999][hurt];
      k2.busyFrom = c2.day;
      k2.busyUntil = c2.day + days;
      k2.busyWhat = ['', 'сломан нос', 'рука в гипсе', 'разбито колено'][hurt];
      a.pending = 't7';
      if (r.won) return { lines: ['Тимоха выстоял против Мясника! Сломан нос, но он победил. Зал ревёт'] };
      return { lines: [
        a.flags.present && hurt < 3 ? 'Ты выбросил полотенце. Тимоху избили' : 'Мясник добивал лежачего',
        ['', 'У Тимохи сломан нос. Через неделю в строю', 'У Тимохи сломана рука: три недели в гипсе', 'Колено Тимохи разбито. Врач: «Ходить будет. Драться — никогда»'][hurt],
      ] };
    },
  };
}

// ---------- Cards ----------

interface Opt {
  id: string;
  label: string;
  no?: (c: Career, a: Act3, f: CareerFighter) => string | null;
  run(c: Career, a: Act3, f: CareerFighter): { lines: string[]; fight?: A1Fight; scene?: SceneSpec };
}
interface Card {
  id: string;
  title: string;
  who: string;
  when(c: Career, a: Act3): boolean;
  text(c: Career, a: Act3, f: CareerFighter): string;
  scene?(c: Career, f: CareerFighter, a: Act3): SceneSpec;
  /** Cannot be put off (the screen is blocked until it is dealt with). */
  forced?: boolean;
  /** Goes on right from the last scene (does not wait the 5 days). */
  follow?: boolean;
  opts: Opt[];
}

/** A step toward what Мясник does to Тимоха. */
function risk(a: Act3, n: number, why: string): void {
  a.risk = Math.max(0, a.risk + n);
  if (n > 0) a.why.push(why);
}

const CARDS: Card[] = [
  // --- The prologue of rich saves ---
  {
    id: 'rob', title: 'Подворотня', who: 'Двое в капюшонах',
    when: (c, a) => !!a.rob && c.day >= a.rob,
    forced: true,
    text: () => 'Ночь, дождь. Короткая дорога домой через подворотню. Сзади шаги.',
    scene: (c, f) => robberyScene(c, f),
    opts: [{ id: 'up', label: 'Встать', run: (c, a, f) => {
      const lost = c.money - STASH;
      c.money = STASH;
      a.flags.robbed = 1;
      a.flags.chain = 1;
      f.busyFrom = c.day;
      f.busyUntil = c.day + 2;
      f.busyWhat = 'сотрясение';
      a.rob = 0;
      begin(c, a);
      a.start = c.day + 1;
      if (a.flags.cityDay) a.flags.cityDay = c.day + 1;
      return { lines: [`Ограбили: −$${lost}, цепь и пояс района. Осталась заначка $${STASH}. Сотрясение: 2 дня без тренировок. Акт 3 начинается заново`] };
    } }],
  },
  // --- From the sewer: «Из-под земли» ---
  {
    id: 'u1', title: 'Гусь в тоннеле', who: 'Гусь',
    when: (c, a) => !!a.flags.sewer && !a.rob,
    text: () => 'В канализации светит фонарь. Гусь: «Дожили. Под землёй тоже дерутся — в старом метро. «Подземка», $150 за победу, без раундов».',
    scene: (c, f) => ({
      map: MAP_BY_ID.alley, a: P(f, 0), b: P(gus(c, f), 1), dist: 2.4,
      lines: [
        { who: null, text: 'Канализация. Капает. Луч фонаря', shot: 'low' },
        { who: 1, text: 'Дожили, чемпион. Ну ничего. Под землёй тоже дерутся.', shot: 'over1' },
        { who: 1, text: 'Старое метро. «Подземка». Сто пятьдесят за победу, раундов нет. Две победы — и про тебя заговорят наверху.', shot: 'close1' },
      ],
    }),
    opts: [{ id: 'ok', label: 'Пойдём', run: () => ({ lines: ['Открыта «Подземка»: бой раз в день, кнопка на главной. Нужны 2 победы'] }) }],
  },
  {
    id: 'u3', title: 'Наверх', who: 'Тётя Валя',
    when: (c, a) => !!a.flags.sewer && did(a, 'u1') && ((a.flags.under ?? 0) >= 2 || c.day - a.start >= 20),
    follow: true,
    text: () => 'Под дверью канализационного люка — записка: «У меня комната над прачечной освободилась. Приходи. В.»',
    opts: [{ id: 'up', label: 'Наверх', run: (c, a) => {
      if (c.act2) c.act2.flags.sewer = 0;
      a.flags.sewer = 0;
      a.flags.wasSewer = 1;
      a.flags.cityDay = c.day + 1;
      return { lines: ['Выбрался из канализации: комната над прачечной тёти Вали. Район видит в тебе того, кто вернулся'] };
    } }],
  },

  // --- Chapter 1 «Чужой город» ---
  {
    id: 'b1', title: 'Бархатный пиджак', who: 'Бархат',
    when: (c, a) => ad(c, a) >= 1 && !a.flags.sewer,
    text: () => 'В «Подкову» зашёл промоутер Бархат: «Городской ринг» по пятницам, настоящие деньги. Контракт — за 40% гонораров.',
    scene: (c, f, a) => barkhatScene(c, f, a),
    opts: [
      { id: 'sign', label: 'Подписать (40% Бархату)', run: (_c, a) => {
        a.flags.cut = 40;
        return { lines: ['Контракт подписан: 40% гонораров — Бархату. Цель: 5 побед на Городском ринге'] };
      } },
      { id: 'haggle', label: 'Торговаться (25%)', no: (_c, _a, f) => (f.fame < 20 ? 'нужна известность 20' : null), run: (_c, a) => {
        a.flags.cut = 25;
        return { lines: ['Бархат морщится: «Двадцать пять. Ради будущего». Цель: 5 побед на Городском ринге'] };
      } },
      { id: 'solo', label: '«Я сам по себе»', run: (_c, a) => {
        a.flags.solo = 1;
        return { lines: ['Без контракта: деньги все твои, но через отборочные. Цель: 7 побед на Городском ринге'] };
      } },
    ],
  },
  {
    id: 't1', title: 'Возьми меня в город', who: 'Тимоха',
    when: (c, a) => ad(c, a) >= 6,
    text: (c) => `${c.act1?.flags.kidScar && !kidIn(c) ? 'Тимоха ушёл от Шрама и пришёл к тебе. ' : ''}Тимоха собрал сумку: «Возьми меня в город. Ты же обещал».`,
    scene: (c, f) => kidScene(c, f, [
      { who: null, text: 'У двери стоит Тимоха с потёртой спортивной сумкой', shot: 'wide' },
      { who: 1, text: 'Возьми меня в город. Я буду в углу стоять. Воду носить. Что угодно.', shot: 'over1' },
      { who: 1, text: 'Ты же обещал.', shot: 'close1' },
    ]),
    opts: [
      { id: 'take', label: 'Взять в угол', run: (c, a) => {
        a.flags.kidCorner = 1;
        if (!kidIn(c) && c.roster.length < MAX_ROSTER) c.roster.push(kid(c));
        return { lines: ['Тимоха в твоём углу на Городском ринге'] };
      } },
      { id: 'early', label: '«Рано. Качайся»', run: (_c, a) => {
        risk(a, 1, 'Сказал ему: «Рано, качайся»');
        return { lines: ['Тимоха кивает и уходит. Видно — обиделся'] };
      } },
    ],
  },
  {
    id: 's1', title: 'Сталь в баре', who: 'Сталь',
    when: (c, a) => ad(c, a) >= 12,
    text: (c) => (c.act2?.ending === 'champ' ? 'Шрам выгнал сына после поражения в финале района. Сталь пьёт один в «Подкове»: «Доволен?»' : 'Сталь пьёт один в «Подкове». Отец с ним не разговаривает: «Чемпион района, а дома — чужой». Смотрит на тебя: «Чего уставился?»'),
    scene: (c, f) => ({
      map: MAP_BY_ID.bar, a: P(f, 0), b: P(stal(c, f), 1), dist: 2.2,
      lines: [
        { who: null, text: '«Подкова». Поздно. За стойкой один Сталь', shot: 'wide' },
        { who: 1, text: c.act2?.ending === 'champ' ? 'Доволен? Отец выставил меня за дверь. Сказал — позор семьи.' : 'Чего уставился? Пояс района у меня, а отец всё равно смотрит сквозь меня.', shot: 'over1' },
        { who: 1, text: 'Всю жизнь он воюет с Михалычем. С покойником. А я так, приложение.', shot: 'close1' },
      ],
    }),
    opts: [
      { id: 'gym', label: 'Позвать в свой зал', run: (_c, a) => {
        a.flags.stalFriend = 1;
        return { lines: ['Сталь долго молчит, потом кивает: «Только без жалости». Спарринг-партнёр: скорость и техника растут на 10% быстрее'] };
      } },
      { id: 'leave', label: 'Уйти', run: () => ({ lines: ['Сталь остаётся один со стаканом'] }) },
      { id: 'mock', label: 'Подколоть', run: (_c, a) => {
        a.flags.stalEnemy = 1;
        return { lines: ['«Ещё увидимся», — Сталь швыряет стакан. Говорят, наутро он пошёл к Бархату'] };
      } },
    ],
  },
  {
    id: 't2', title: 'Деньги маме', who: 'Тимоха',
    when: (c, a) => ad(c, a) >= 17,
    text: () => 'Тимоха мнётся: «Мама болеет. Лекарства дорогие. Двести долларов… я отдам».',
    scene: (c, f) => kidScene(c, f, [
      { who: 1, text: 'Слушай… мама болеет. Лекарства — двести долларов. Я отдам. Честно.', shot: 'over1' },
      { who: null, text: 'Он не смотрит в глаза', shot: 'close1' },
    ]),
    opts: [
      { id: 'give', label: 'Дать $200', no: (c) => (c.money < 200 ? 'нужно $200' : null), run: (c, a) => {
        c.money -= 200;
        a.flags.momPaid = 1;
        addMood(timokha(c), 20);
        return { lines: ['Тимоха сжимает деньги: «Я не забуду»'] };
      } },
      { id: 'later', label: '«Разберёмся потом»', run: (_c, a) => {
        risk(a, 1, 'Не дал денег на лекарства маме');
        return { lines: ['«Ладно», — тихо говорит Тимоха. Деньги ему всё равно нужны'] };
      } },
    ],
  },
  {
    id: 'n1', title: 'Ника', who: 'Ника Соколова',
    when: (c, a) => ad(c, a) >= 22,
    text: () => 'Звонит журналистка Ника Соколова из «Вечернего города»: просит интервью. И говорит про вырезку: «Финал-89. Михалыч — Железнов. Судья потом исчез».',
    scene: (c, f) => ({
      map: home(c), a: P(f, 0), b: P(f, 1), dist: 2.4, hide: [false, true],
      lines: [
        { who: null, text: 'Звонит телефон', shot: 'wide' },
        { who: 2, name: '📞 Ника Соколова', text: 'Добрый вечер. Ника Соколова, «Вечерний город». Хочу про вас написать.', shot: 'close0' },
        { who: 2, name: '📞 Ника Соколова', text: 'И ещё. У меня вырезка: финал восемьдесят девятого. Михалыч — Железнов. Судья потом исчез. Вам это ни о чём не говорит?', shot: 'close0' },
      ],
    }),
    opts: [
      { id: 'yes', label: 'Дать интервью', run: (_c, a, f) => {
        a.flags.nika = 1;
        f.fame += 3;
        return { lines: ['Интервью в «Вечернем городе». Известность +3. Ника обещает копать дальше'] };
      } },
      { id: 'no', label: 'Отказать', run: () => ({ lines: ['Ника вежливо прощается: «Я всё равно напишу»'] }) },
    ],
  },
  {
    id: 't3', title: '«Разрешаешь?»', who: 'Тимоха',
    when: (c, a) => ad(c, a) >= 27,
    text: () => 'Тимоха сияет: «Бархат позвал меня на разогрев! Триста долларов за бой!» И смотрит на тебя: «Разрешаешь?»',
    scene: (c, f) => kidScene(c, f, [
      { who: 1, text: 'Бархат позвал меня! На разогрев перед Городским рингом! Триста долларов!', shot: 'over1' },
      { who: 1, text: 'Маме на лекарства хватит. Ну… разрешаешь?', shot: 'close1' },
    ]),
    opts: [
      { id: 'yes', label: 'Разрешить', run: (_c, a) => {
        risk(a, 2, 'Разрешил ему драться у Бархата');
        a.flags.kidBout = 1;
        return { lines: ['Тимоха записан на разогрев. Бархат доволен'] };
      } },
      { id: 'self', label: '«Решай сам»', run: (_c, a) => {
        risk(a, 1, 'Сказал: «Решай сам»');
        a.flags.kidBout = 1;
        return { lines: ['Тимоха решил: он идёт'] };
      } },
      { id: 'no', label: 'Запретить', run: (_c, a) => {
        if (a.risk >= 2) {
          a.flags.kidBout = 1;
          a.flags.secret = 1;
          return { lines: ['Тимоха молча уходит. Ты ещё не знаешь, что он всё равно записался'] };
        }
        addMood(timokha(_c), -10);
        return { lines: ['Тимоха обиделся, но остался. На разогрев он не пойдёт'] };
      } },
    ],
  },
  {
    id: 'l1', title: 'Подарок Лиса', who: 'Лис',
    when: (c, a) => ad(c, a) >= 31,
    text: () => 'Лис в «Подкове»: «Теперь я у Бархата. Следующий бой — соперник ляжет. Подарок. Ты только будешь должен услугу».',
    scene: (c, f) => ({
      map: MAP_BY_ID.bar, a: P(f, 0), b: P(lis(c, f), 1), dist: 2.2,
      lines: [
        { who: null, text: 'Лис за угловым столиком считает купюры', shot: 'wide' },
        { who: 1, text: 'О, звезда. Я теперь у Бархата, знаешь? Растём.', shot: 'over1' },
        { who: 1, text: 'Следующий бой — соперник ляжет. Подарок от фирмы. Ты только будешь должен одну маленькую услугу.', shot: 'close1' },
      ],
    }),
    opts: [
      { id: 'take', label: 'Принять подарок', run: (_c, a) => {
        a.flags.gift = 1;
        a.flags.owe = 1;
        risk(a, 2, 'Взял подарок Лиса — Бархат забрал «услугу» Тимохой');
        return { lines: ['Следующий бой на Городском ринге будет лёгким. Ты должен Бархату услугу'] };
      } },
      { id: 'no', label: 'Отказаться', run: (_c, a) => {
        a.flags.hard = 1;
        return { lines: ['Лис пожимает плечами: «Как знаешь». Следующий соперник будет злым'] };
      } },
    ],
  },
  {
    id: 'l2', title: 'Газета', who: '«Вечерний город»',
    when: (c, a) => a.flags.gift === 2,
    follow: true,
    text: () => 'Утром в «Вечернем городе» фото: ты жмёшь руку Лису. Заголовок: «Договорной бой на Городском ринге?»',
    opts: [{ id: 'ok', label: 'Ясно', run: (c, a, f) => {
      a.flags.gift = 3;
      a.flags.paperScandal = 1;
      f.fame = Math.max(0, f.fame - 5);
      addMood(f, -12);
      if (a.flags.nika) a.flags.nikaCold = 1;
      return { lines: [`Тебя кинули: Лис сам слил фото. Известность −5.${a.flags.nika ? ' Ника тебе больше не верит.' : ''} Бархат держит тебя за горло`] };
    } }],
  },
  {
    id: 't4', title: 'Новые перчатки', who: 'Тимоха',
    when: (c, a) => ad(c, a) >= 38 && !!a.flags.kidBout,
    text: (c, a) => `Тимоха пришёл в фирменных перчатках и куртке с бархатной нашивкой: «Аркадий Геннадьевич сказал, у меня талант».${a.risk >= 3 ? ' На тренировки он больше не ходит.' : ''}`,
    scene: (c, f, a) => kidScene(c, f, [
      { who: null, text: 'Тимоха в новой куртке с бархатной нашивкой', shot: 'wide' },
      { who: 1, text: 'Смотри, какие перчатки! Аркадий Геннадьевич подарил. Сказал — у меня талант.', shot: 'over1' },
      ...(a.risk >= 3 ? [{ who: 1 as const, text: 'А ты меня всё в подвале держишь. Ты мне не отец!', shot: 'close1' as const }] : []),
    ]),
    opts: [
      { id: 'glad', label: 'Порадоваться за него', run: (_c, a) => {
        risk(a, 1, 'Порадовался подаркам Бархата');
        return { lines: ['Тимоха счастлив. Бархат — тоже'] };
      } },
      { id: 'warn', label: 'Предупредить про Бархата', run: () => ({ lines: ['Тимоха слушает. Кажется, задумался'] }) },
      { id: 'pay', label: 'Отдать свои $300: «Только не дерись»', no: (c) => (c.money < 300 ? 'нужно $300' : null), run: (c, a) => {
        c.money -= 300;
        risk(a, -2, '');
        a.flags.kidDoubt = 1;
        return { lines: ['Тимоха смотрит на деньги долго. «Я подумаю». Он сомневается'] };
      } },
      { id: 'mock', label: 'Высмеять', run: (_c, a) => {
        risk(a, 1, 'Высмеял его при всех');
        a.flags.quarrel = 1;
        return { lines: ['Тимоха хлопнул дверью'] };
      } },
    ],
  },
  {
    id: 't5', title: 'Звонок', who: 'Тимоха',
    when: (c, a) => ad(c, a) >= 43 && !!a.flags.kidBout,
    text: (_c, a) => `${a.flags.secret ? 'Ты запретил, но он всё равно записался. ' : ''}Поздно вечером звонит Тимоха: «Мне соперника поменяли. Какой-то Мясник». Голос дрожит.`,
    scene: (c, f) => ({
      map: home(c), a: P(f, 0), b: P(f, 1), dist: 2.4, hide: [false, true],
      lines: [
        { who: null, text: 'Поздно вечером звонит телефон', shot: 'wide' },
        { who: 2, name: '📞 Тимоха', text: 'Это я. Мне соперника поменяли. Завтра. Какой-то… Мясник.', shot: 'close0' },
        { who: 2, name: '📞 Тимоха', text: 'Да ничего, я справлюсь. Наверное.', shot: 'close0' },
      ],
    }),
    opts: [
      { id: 'come', label: 'Приехать на его бой', run: (_c, a) => {
        a.flags.present = 1;
        risk(a, -1, '');
        a.pending = 't6';
        return { lines: ['Ты будешь в его углу. С полотенцем'] };
      } },
      { id: 'talk', label: 'Отговорить', run: (_c, a) => {
        if (a.flags.quarrel && !a.flags.kidDoubt) {
          a.pending = 't6';
          return { lines: ['«Ты мне не отец», — и гудки. Он не послушал'] };
        }
        a.flags.kidDone = 1;
        a.flags.kidSafe = 1;
        return { lines: ['Тимоха долго молчит. Потом: «Ладно. Не пойду». Бархат в ярости — но Тимоха цел'] };
      } },
      { id: 'fine', label: '«Справишься»', run: (_c, a) => {
        risk(a, 1, 'Сказал по телефону: «Справишься»');
        a.pending = 't6';
        return { lines: ['«Да… справлюсь». Гудки'] };
      } },
    ],
  },
  {
    id: 't6', title: 'Разогрев', who: 'Тимоха и Мясник',
    when: () => false,
    forced: true,
    text: () => 'Разогрев «Городского ринга». Тимоха против Мясника.',
    opts: [{ id: 'go', label: 'Смотреть бой', run: (c, a) => ({ lines: [], fight: kidFight(c, a) }) }],
  },
  {
    id: 't7', title: 'Больница', who: 'Тимоха',
    when: () => false,
    follow: true,
    text: (c, a) => hospitalText(c, a),
    scene: (c, f, a) => hospitalScene(c, f, a),
    opts: [
      { id: 'pay', label: 'Оплатить операцию $600', no: (c, a) => (a.flags.kidHurt === 1 ? 'не нужно' : c.money < 600 ? 'нужно $600' : null), run: (c, a) => {
        c.money -= 600;
        a.flags.opPaid = 1;
        const k = timokha(c);
        if (a.flags.kidHurt === 2) k.busyUntil = Math.max(c.day, k.busyUntil - 7);
        a.flags.kidDone = 1;
        return { lines: [a.flags.kidHurt === 2 ? 'Операция прошла: рука заживёт на неделю быстрее' : 'Операция не вернёт колено. Но Тимоха это запомнит'] };
      } },
      { id: 'sit', label: 'Посидеть с ним', run: (c, a) => {
        a.flags.visits = (a.flags.visits ?? 0) + 1;
        a.flags.kidDone = 1;
        addMood(timokha(c), 10);
        return { lines: ['Ты просидел с ним до ночи. Он так ничего и не сказал'] };
      } },
      { id: 'revenge', label: '«Я найду Мясника»', run: (_c, a) => {
        a.flags.revenge = 1;
        a.flags.kidDone = 1;
        return { lines: ['Мясник будет ждать. Тимоха смотрит в потолок'] };
      } },
    ],
  },
  {
    id: 't8', title: 'Решение Тимохи', who: 'Тимоха',
    when: (c, a) => a.flags.kidHurt === 3 && c.day >= (a.flags.hospDay ?? 0) + 12,
    text: (c, a) => ((a.flags.visits ?? 0) >= 2 || a.flags.opPaid ? 'Тимоха на костылях пришёл в подвал: «Драться не буду. Буду стоять в твоём углу. Катменом. Возьмёшь?»' : 'На двери записка: «Уехал к маме в деревню. Не ищи. Т.»'),
    opts: [{ id: 'ok', label: 'Дальше', run: (c, a) => {
      if ((a.flags.visits ?? 0) >= 2 || a.flags.opPaid) {
        a.flags.cutman = 1;
        return { lines: ['Тимоха — катмен в твоём углу: между раундами ты восстанавливаешься лучше'] };
      }
      a.flags.kidGone = 1;
      c.roster = c.roster.filter((x) => !x.name.includes('Тимоха'));
      if (!c.roster.some((x) => x.id === c.pick)) c.pick = c.roster[0].id;
      return { lines: ['Тимоха уехал. Из команды — навсегда'] };
    } }],
  },
  {
    id: 'm1', title: 'Афиша', who: 'Бархат',
    when: (c, a) => (a.wins >= need(a) && ad(c, a) >= POSTER_AT && kidSettled(a)) || ad(c, a) >= POSTER_LATEST,
    forced: true,
    text: (c, a) => (a.wins >= need(a) ? 'После боя Бархат выходит в ринг с микрофоном: «Чемпионат города! Первый с восемьдесят девятого года!» И называет твоё имя.' : 'Николаич пробил тебе место через старые связи: «Чемпионат города. Первый с восемьдесят девятого. Ты в списке. Последним».'),
    scene: (c, f) => posterScene(c, f),
    opts: [{ id: 'ok', label: 'Дальше', run: (c, a) => {
      a.m = c.day;
      if (a.wins < need(a)) a.flags.lastSeed = 1;
      return { lines: [`Объявлен Чемпионат города: финал через ${finalDay(a) - c.day} дн. Восемь бойцов без весовых категорий, приз $8000. Чемпион — Титан`] };
    } }],
  },
];

const kidSettled = (a: Act3) => !!a.flags.kidDone || (!a.flags.kidBout && did(a, 't3'));

function hospitalText(c: Career, a: Act3): string {
  const h = a.flags.kidHurt ?? 1;
  if (h < 3) return h === 1 ? 'Тимоха с пластырем на носу: «Ерунда. Заживёт». Но в глаза не смотрит.' : 'Тимоха с рукой в гипсе. Отвернулся к стене.';
  const said = did(a, 't3') && a.why.includes('Разрешил ему драться у Бархата') ? 'Ты же сказал — можно.' : a.flags.owe ? 'Ты же взял их подарок.' : 'Ты же сам сказал — решай сам.';
  return `Тимоха смотрит в потолок: «${said}» Что привело к этому: ${a.why.join('; ')}.`;
}

function hospitalScene(c: Career, f: CareerFighter, a: Act3): SceneSpec {
  const h = a.flags.kidHurt ?? 1;
  return {
    map: home(c), a: P(f, 0), b: P(timokha(c), 1), dist: 1.8,
    start: (s) => {
      if (h >= 3) s.knockDown(s.fighters[1], 'больница', 'back', 'l');
    },
    lines: h >= 3
      ? [
          { who: null, text: 'Больница. Белый свет. Тимоха лежит, нога в гипсе до бедра', shot: 'top' },
          { who: 1, text: hospitalText(c, a).match(/«(.+?)»/)?.[1] ?? '', shot: 'close1' },
          { who: null, text: 'Он больше ничего не говорит', shot: 'low' },
        ]
      : [
          { who: null, text: 'Больница', shot: 'wide' },
          { who: 1, text: h === 1 ? 'Ерунда. Нос — это ерунда.' : 'Три недели. Три недели в гипсе.', shot: 'over1' },
        ],
  };
}

function posterScene(c: Career, f: CareerFighter): SceneSpec {
  const titan = titanOf(c, f);
  return {
    map: MAP_BY_ID.ring, a: P(f, 0), b: P(titan, 1), dist: 3.2, extra: { p: P(barkhat(c, f), 1), side: 1.1 }, names: { extra: 'Бархат' },
    lines: [
      { who: 2, text: 'Дамы и господа! Чемпионат города! Первый с тысяча девятьсот восемьдесят девятого года!', shot: 'group', act: (s) => (s.scene!.dist = 1.6) },
      { who: 2, text: 'Восемь бойцов. Без весовых категорий. Восемь тысяч долларов. И пояс города!', shot: 'group' },
      { who: 2, text: `И среди них — ${short(f)}!`, shot: 'close0' },
      { who: null, text: 'К канатам выходит гигант. Титан, чемпион города', shot: 'low' },
      { who: 1, text: 'Увидимся в финале. Если дойдёшь.', shot: 'over1' },
    ],
  };
}

/** The city champion: a head taller, 118 kg, never lost. */
export function titanOf(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a3titan', () => {
    const m = heavy(f, 0.12, 'Титан «Чемпион города» Бережной', 'boxing', 'titan');
    m.height = 1.98;
    m.weight = 118;
    m.record = { w: 31, l: 0, ko: 24 };
    return m;
  }, f);
}

const BY = Object.fromEntries(CARDS.map((x) => [x.id, x]));

// ---------- What the career calls ----------

export function act3Check(c: Career): string[] {
  const out = ensureAct3(c);
  const a = act3(c);
  if (!a || a.pending || (a.ending && did(a, 'end'))) return out;
  if (a.ending) {
    a.pending = 'end';
    return out;
  }
  // A scene every 5 days at most, unless it cannot wait or goes on from the last one.
  const rest = c.day - (a.flags.lastCard ?? -99) < GAP3;
  const card = CARDS.find((x) => !did(a, x.id) && (!rest || x.forced || x.follow) && x.when(c, a));
  if (card) {
    a.pending = card.id;
    if (!card.follow) a.flags.lastCard = c.day;
    out.push(`🎬 Сюжет: «${card.title}»`);
  }
  return out;
}

/** Midnight. */
export function act3Day(c: Career): string[] {
  const a = act3(c);
  if (!a) return act3Check(c);
  const out: string[] = [];
  // Тимоха's line needs no fight: settled once the call would have come.
  if (!a.flags.kidBout && did(a, 't3') && !a.flags.kidDone) a.flags.kidDone = 1;
  out.push(...act3Check(c));
  return out;
}

export function act3Card(c: Career): Act1Card | null {
  const a = act3(c);
  if (!a?.pending) return null;
  const f = main(c);
  if (a.pending === 'end')
    return { id: 'end', title: 'Конец акта 3', who: '', text: '', film: false, watched: true, forced: false, opts: [{ id: 'close', label: 'Дальше', no: null }] };
  const card = BY[a.pending];
  return {
    id: card.id, title: card.title, who: card.who, text: card.text(c, a, f), forced: !!card.forced,
    film: !!card.scene, watched: a.seen.includes(card.id),
    opts: card.opts.map((o) => ({ id: o.id, label: o.label, no: o.no?.(c, a, f) ?? null })),
  };
}

export function act3Film(c: Career): SceneSpec | null {
  const a = act3(c);
  if (!a?.pending || a.pending === 'end') return null;
  return BY[a.pending].scene?.(c, main(c), a) ?? null;
}

export function act3Seen(c: Career): void {
  const a = act3(c);
  if (a?.pending && !a.seen.includes(a.pending)) a.seen.push(a.pending);
  save(c);
}

export function act3Choose(c: Career, opt: string): { lines: string[]; fight?: A1Fight; scene?: SceneSpec } {
  const a = act3(c);
  if (!a?.pending) return { lines: [] };
  const f = main(c);
  if (a.pending === 'end') {
    a.done.push('end');
    a.pending = null;
    save(c);
    return { lines: ['Продолжение следует'] };
  }
  const card = BY[a.pending];
  const o = card.opts.find((x) => x.id === opt);
  if (!o) return { lines: [] };
  const why = o.no?.(c, a, f);
  if (why) return { lines: [why] };
  const id = a.pending;
  a.pending = null;
  const r = o.run(c, a, f);
  if (!r.fight && !a.done.includes(id)) a.done.push(id);
  c.log.unshift(...r.lines.map((x) => `🎬 ${x}`));
  storyNote(c, r.lines);
  if (!a.pending && !r.fight) act3Check(c);
  save(c);
  return r;
}

export function act3FightDone(c: Career, f: CareerFighter, fight: A1Fight, r: FightResult): { lines: string[]; scene?: SceneSpec } {
  const a = act3(c)!;
  fightToll(f, false, c.day);
  const res = fight.after(c, f, r);
  if (a.pending && a.pending !== 'end' && a.done.includes(a.pending)) a.pending = null;
  if (!a.pending) act3Check(c);
  c.log.unshift(...res.lines.map((x) => `🎬 ${x}`));
  storyNote(c, res.lines);
  save(c);
  return res;
}

/** Buttons on the goal card: the ring on Fridays, a call-out midweek, «Подземка», a visit. */
export function act3Buttons(c: Career): { id: string; label: string; no: string | null }[] {
  const a = act3(c);
  if (!a || a.ending || !a.start || a.pending) return [];
  const f = main(c);
  const out: { id: string; label: string; no: string | null }[] = [];
  if (a.flags.sewer && did(a, 'u1') && (a.flags.under ?? 0) < 2)
    out.push({ id: 'under', label: '🚇 Бой в «Подземке» ($150)', no: a.flags.underDay === c.day ? 'сегодня уже дрался' : cannot(c, f, 1, 20) });
  if (did(a, 'b1') && !a.m) {
    const fri = DOW(c.day) === FRI;
    const foughtFri = a.flags.friWeek === week(c.day);
    const foughtCh = a.flags.chWeek === week(c.day);
    if (fri) out.push({ id: 'ring', label: `🥊 Городской ринг: ${short(ringOpp(c, a, f))}`, no: foughtFri ? 'на этой неделе уже был' : cannot(c, f, 1, 20) });
    else out.push({ id: 'call', label: `📣 Вызов на ринг: ${short(ringOpp(c, a, f))} (сил больше)`, no: foughtCh ? 'вызов — раз в неделю' : cannot(c, f, 1, 35) });
  }
  if ((a.flags.kidHurt ?? 0) >= 2 && !did(a, 't8') && !a.flags.kidGone && c.day > (a.flags.hospDay ?? 0))
    out.push({ id: 'visit', label: '🏥 Навестить Тимоху', no: a.flags.visitDay === c.day ? 'сегодня уже был' : partsLeft(c, f) < 1 ? 'сегодня уже поздно' : null });
  return out;
}

export function act3Act(c: Career, id: string): { lines: string[]; fight?: A1Fight } {
  const a = act3(c);
  if (!a) return { lines: [] };
  const f = main(c);
  const b = act3Buttons(c).find((x) => x.id === id);
  if (!b) return { lines: ['Сейчас нельзя'] };
  if (b.no) return { lines: [b.no] };
  if (id === 'under') return { lines: [], fight: underFight(c, a, f) };
  if (id === 'ring' || id === 'call') {
    if (id === 'ring') a.flags.friWeek = week(c.day);
    else {
      a.flags.chWeek = week(c.day);
      f.energy = Math.max(0, energyOf(f) - 15);
    }
    save(c);
    return { lines: [], fight: ringFight(c, a, f, id === 'call') };
  }
  if (id === 'visit') {
    a.flags.visitDay = c.day;
    a.flags.visits = (a.flags.visits ?? 0) + 1;
    f.parts = (f.parts ?? 0) + 1;
    addMood(timokha(c), 8);
    save(c);
    const n = a.flags.visits;
    return { lines: [n >= 2 ? 'Тимоха впервые улыбнулся: «Опять ты. Принёс апельсины?»' : 'Посидел с Тимохой. Он молчит, но не отворачивается'] };
  }
  return { lines: [] };
}

export function act3Goal(c: Career): { text: string; debt: number; left: number } | null {
  const a = act3(c);
  if (!a || a.ending) return null;
  if (!a.start) return { text: 'Акт 3 «Город»: осваивайся', debt: 0, left: -1 };
  if (a.flags.sewer) return { text: `Из-под земли: победы в «Подземке» ${a.flags.under ?? 0}/2`, debt: 0, left: -1 };
  if (!a.m) {
    const toFri = (FRI - DOW(c.day) + 7) % 7;
    return { text: `Сделай себе имя: победы на Городском ринге ${a.wins}/${need(a)} · бой по пятницам`, debt: 0, left: toFri };
  }
  return { text: 'Чемпионат города · финал', debt: 0, left: finalDay(a) - c.day };
}

/** The city championship's poster is up (the countdown runs). */
export const posterUp = (c: Career) => !!c.act3?.m;
