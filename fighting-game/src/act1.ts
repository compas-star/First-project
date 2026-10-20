// Act 1 of the main story: «Подвал» (screenplay in the doc «Сценарий. Акт 1», edited by the
// user). The fighter gets Михалыч's basement and a debt of $1500 to the collector Гусь, due
// in 20 days. Scenes open by the act's day; each is a card on the career home, most with a
// scene played on the engine first (storyCut), then the manager's choice. Three endings:
// the basement is ours, lost, or sold to Шрам.
import {
  makeFighter, short, save, toParams, classOf, MAX_ROSTER,
  type Career, type CareerFighter, type FightResult, type Tier,
} from './career';
import { addMood } from './life';
import { story, main, heavy, npc, place, levelOf } from './story';
import { MAP_BY_ID } from './maps';
import { TV } from './arena';
import { partsLeft, fightToll } from './city';
import { ladder } from './clubs';
import type { SceneSpec, SceneLine } from './cutscenes';
import type { FighterParams } from './config';

export type Ending = 'ours' | 'lost' | 'deal';

export interface Act1 {
  /** Career day the act began on (its day 1). */
  start: number;
  debt: number;
  /** How the debt is paid, from scene 2: weekly / all at the end / by a fight. */
  plan: 'pay' | 'bold' | 'sport' | null;
  /** Scenes played, and scenes whose film was watched. */
  done: string[];
  seen: string[];
  pending: string | null;
  flags: Record<string, number>;
  ending?: Ending;
  /** When the Кирпич fight and Гусь's visit come (career days). */
  kirpichDay: number;
  gusDay: number;
  roofNext: number;
}

const DEBT = 1500;
const CUP_TIP = 'Гусь: «Хочешь денег — по субботам турнир в подвале «Подковы». Записывайся на арене. Только подготовься как следует»';

export const act = (c: Career): Act1 | null => c.act1 ?? null;
/** The act's own day number (1..20). */
export const actDay = (c: Career, a: Act1) => c.day - a.start + 1;
const did = (a: Act1, id: string) => a.done.includes(id);

/** Begins the act for a career that has not had it (a new one, or an old save). */
export function ensureAct1(c: Career): void {
  if (c.act1) {
    if (c.act1.done.includes('s2') || c.act1.ending) ladder(c).open = true;
    return;
  }
  const s = story(c);
  // The old debt, kid and gym-war lines are told by the act now.
  for (const id of ['debt1', 'debt2', 'debt3', 'kid1', 'kid2', 'gym1', 'gym2', 'gym3', 'gym4']) if (!s.done.includes(id)) s.done.push(id);
  if (s.pending && /^(debt|kid|gym)/.test(s.pending)) s.pending = undefined;
  s.flags.debt = 0;
  s.flags.debtPay = 0;
  c.act1 = { start: c.day, debt: DEBT, plan: null, done: [], seen: [], pending: null, flags: {}, kirpichDay: c.day + 6, gusDay: c.day + 17, roofNext: c.day + 11 };
  act1Check(c);
  save(c);
}

// ---------- People ----------

export function gus(c: Career, f: CareerFighter): CareerFighter {
  const s = story(c);
  return npc(c, s, 'a1gus', () => heavy(f, 0.06, 'Гусь «Коллектор» Гусев', 'boxing', 'biker', 0.3), f);
}
export function kirpich(c: Career, f: CareerFighter): CareerFighter {
  const s = story(c);
  return npc(c, s, 'a1kirpich', () => {
    // A wall of a man, whatever ours weighs: the story fight is not a bout.
    const m = heavy(f, 0.05, 'Кирпич «Стена» Кирпичёв', 'street', 'robot', 0.17);
    m.height = 1.96;
    m.weight = 112;
    return m;
  }, f);
}
/** «Железные кони» in the story: made at our level (the cup has its own, grown-up copies). */
export function glush(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a1glush', () => {
    const m = heavy(f, 0.01, 'Глушитель «Без тормозов» Рябов', 'street', 'biker', 0.16);
    m.aggression = 0.95;
    return m;
  }, f);
}
export function shatun(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a1shatun', () => {
    const m = heavy(f, 0.06, 'Шатун «Хозяин дороги» Громов', 'street', 'biker', 0.25);
    m.height = 1.88;
    m.weight = 104;
    return m;
  }, f);
}
function rusty(c: Career, f: CareerFighter): CareerFighter {
  return npc(c, story(c), 'a1rusty', () => heavy(f, -0.02, 'Ржавый «Бывший» Котельников', 'boxing', 'biker', 0.13), f);
}

export function scar(c: Career, f: CareerFighter): CareerFighter {
  const s = story(c);
  return npc(c, s, 'a1scar', () => heavy(f, 0.2, 'Шрам «Хозяин» Железнов', 'muaythai', 'clerk'), f);
}
export function kid(c: Career): CareerFighter {
  const s = story(c);
  return (s.npc.a1kid ??= (() => {
    const k = makeFighter(0.0, 0.92, classOf(main(c)));
    k.name = 'Тимоха «Малой» Решетников';
    k.story = 'Пацан с района, неделю простоял у окна подвала. Денег нет, таланта — вагон.';
    k.traits = ['grinder', 'loyal'];
    k.mood = 60;
    k.discipline = 'kickboxing';
    return k;
  })());
}

export const P = (f: CareerFighter, team: 0 | 1): FighterParams => {
  const p = toParams(f, team);
  p.name = short(f);
  return p;
};
const B = MAP_BY_ID.basement;

// ---------- Scenes on the engine ----------

const tvOn = () => (TV.on = true);

function scene1(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: B, a: P(f, 0), b: P(f, 1), dist: 2.4, hide: [false, true], names: { tv: 'Михалыч' },
    lines: [
      { who: null, text: 'Район Стальная. Подвал под прачечной', shot: 'wide' },
      { who: null, text: 'На тумбе пузатый телевизор и видик. На кассете: «Новому хозяину. Михалыч»', shot: 'tv', act: tvOn },
      { who: 'tv', text: 'Раз ты это смотришь — меня уже нет, а подвал твой. Не радуйся.', shot: 'tv' },
      { who: 'tv', text: 'Здесь течёт крыша, мешок держится на честном слове, и есть один долг. Полторы тысячи. Придёт человек по кличке Гусь.', shot: 'tv' },
      { who: 'tv', text: 'И ещё. Если придёт человек со шрамом через бровь и предложит денег — не бери. Всё. Руки вверх, голова вниз.', shot: 'close0' },
      { who: 0, text: 'Ну что, старик. Посмотрим.', shot: 'wide', act: (s) => s.gesture(s.fighters[0], 'nod', 1) },
    ],
  };
}

function scene2(c: Career, f: CareerFighter): SceneSpec {
  const g = gus(c, f);
  return {
    map: B, a: P(f, 0), b: P(g, 1), dist: 3.4, extra: { p: P(kirpich(c, f), 1) }, names: { extra: 'Кирпич' },
    lines: [
      { who: null, text: 'День 2. По лестнице в подвал спускаются гости', shot: 'wide', act: (s) => (s.scene!.dist = 1.7) },
      { who: 1, text: 'Добрый вечер. Соболезную. Прекрасный был человек. Платил плохо.', shot: 'group' },
      { who: 1, text: 'Тысяча пятьсот. До двадцатого числа. Не будет денег — будет новый хозяин. Я даже знаю, кто.', shot: 'group' },
      { who: 2, text: 'Хе.', shot: 'group', dur: 1.6 },
      { who: null, text: 'Что ответить Гусю?', shot: 'close0', dur: 2.2 },
    ],
  };
}

function scene3(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: B, a: P(f, 0), b: P(f, 1), dist: 2.4, hide: [false, true], names: { tv: 'Михалыч' },
    lines: [
      { who: null, text: 'За раздевалкой нашлась вторая кассета: «Урок 1»', shot: 'wide' },
      { who: 'tv', text: 'Джеб — это не удар, это вопрос. Ты спрашиваешь: «ты там?». А кросс — это уже ответ.', shot: 'tv', act: tvOn },
      { who: 'tv', text: 'Кстати. Шрама я тоже учил джебу. Хороший был парень. До того, как понял, сколько стоит чужая победа.', shot: 'close0' },
    ],
  };
}

function scene4(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: MAP_BY_ID.alley, a: P(f, 0), b: P(kirpich(c, f), 1), dist: 3,
    lines: [
      { who: null, text: 'Пятница. За баром «Подкова»', shot: 'low', act: (s) => (s.scene!.dist = 2.2) },
      { who: 1, text: 'Гусь сказал — не убивать.', shot: 'over1' },
      { who: 1, text: 'Сильно.', shot: 'close1', dur: 1.8, act: (s) => s.gesture(s.fighters[1], 'shake', 1) },
      { who: 0, text: 'Тогда не тяни.', shot: 'over0' },
    ],
  };
}

function scene4down(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: MAP_BY_ID.alley, a: P(f, 0), b: P(kirpich(c, f), 1), dist: 1.6,
    start: (s) => {
      s.fighters[1].out = true;
      s.knockDown(s.fighters[1], 'нокаут', 'back', 'l');
    },
    lines: [
      { who: null, text: 'Кирпич лежит. Дождь', shot: 'top' },
      { who: 1, text: 'Хорошо бьёшь. Меня так с армии не клали.', shot: 'low' },
    ],
  };
}

function scene5(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: B, a: P(f, 0), b: P(scar(c, f), 1), dist: 3.2,
    lines: [
      { who: null, text: 'В подвал входят начищенные ботинки', shot: 'low', act: (s) => (s.scene!.dist = 1.6) },
      { who: 1, text: 'Тот же запах. Сырость и чужие надежды.', shot: 'over1' },
      { who: 1, text: 'Я закрою твой долг Гусю. Весь. И сверху две тысячи тебе. А ты отдашь мне ключи.', shot: 'over1' },
      { who: 0, text: 'Зачем тебе подвал? У тебя целый зал.', shot: 'over0' },
      { who: null, text: 'Шрам молча оборачивается к стене. Там висит старый тёмный пояс', shot: 'close1' },
      { who: 1, text: 'Ностальгия. Думай до двадцатого.', shot: 'close1' },
    ],
  };
}

function scene6(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: B, a: P(f, 0), b: P(kid(c), 1), dist: 2.6,
    lines: [
      { who: null, text: 'Утро. У окна кто-то повторяет удары в воздух', shot: 'wide' },
      { who: 0, text: 'Ты кто?', shot: 'over0' },
      { who: 1, text: 'Тимоха. Я тут неделю стою. Возьмите меня, а? Денег нет, но я всё буду делать. Полы мыть.', shot: 'over1' },
      { who: 1, text: 'И я знаю, где ночью на крышах дерутся за деньги. Вам же нужны деньги?', shot: 'close1' },
    ],
  };
}

function scene8(c: Career, f: CareerFighter, a: Act1): SceneSpec {
  const g = gus(c, f);
  const paid = a.debt <= 0;
  const lines: SceneLine[] = paid
    ? [
        { who: null, text: 'Бар «Подкова». Гусь ждёт за дальним столом', shot: 'wide', act: (s) => (s.scene!.dist = 1.7) },
        { who: 1, text: 'Деньги вы отдали. А вот человек, который купил долг, очень надеялся, что не отдадите.', shot: 'group' },
        { who: 0, text: 'Шрам?', shot: 'over0', dur: 1.8 },
        { who: 1, text: 'Я этого не говорил. А теперь — для души. Разомнёмся? Без ставок.', shot: 'group' },
      ]
    : [
        { who: null, text: 'Бар «Подкова». Гусь пьёт чай за дальним столом', shot: 'wide', act: (s) => (s.scene!.dist = 1.9) },
        { who: 1, text: `Двадцатое через ${Math.max(1, a.start + 19 - c.day)} дн. А у вас, сколько я знаю, не хватает $${a.debt}.`, shot: 'group' },
        { who: 1, text: 'Я человек вежливый. Предупреждаю один раз. Двадцатого я приду не один.', shot: 'group' },
        { who: 2, text: 'Хе.', shot: 'group', dur: 1.6 },
      ];
  return { map: MAP_BY_ID.bar, a: P(f, 0), b: P(g, 1), dist: 3, extra: { p: P(kirpich(c, f), 1), side: 0.8 }, names: { extra: 'Кирпич' }, lines };
}

function sceneGusDown(c: Career, f: CareerFighter, a: Act1, map = MAP_BY_ID.bar): SceneSpec {
  const lines: SceneLine[] = [
    { who: null, text: 'Гусь сидит на полу, вытирает рот', shot: 'top' },
    { who: 1, text: 'Квиты. И вот что, парень. Не Михалыч был должен. Долг купил Шрам. За старика. Чтобы подвал достался ему.', shot: 'low' },
  ];
  if (a.plan === 'bold') lines.push({ who: 1, text: 'Ты мне сразу понравился. Если Шрам полезет ещё — позвони.', shot: 'over1' });
  return {
    map, a: P(f, 0), b: P(gus(c, f), 1), dist: 1.5,
    start: (s) => {
      s.fighters[1].out = true;
      s.knockDown(s.fighters[1], 'нокаут', 'back', 'l');
    },
    lines,
  };
}

// --- «Железные кони» (the biker line) ---

function sceneB1(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: MAP_BY_ID.bar, a: P(f, 0), b: P(glush(c, f), 1), dist: 2.6, extra: { p: P(shatun(c, f), 1), side: 0.9 }, names: { extra: 'Шатун' },
    lines: [
      { who: null, text: 'Бар «Подкова». У стойки — кожаные жилетки с конём на спине', shot: 'wide', act: (s) => (s.scene!.dist = 1.4) },
      { who: 1, text: 'О. Наследник Михалыча. Это наш стол, подвальный.', shot: 'over1' },
      { who: null, text: 'Глушитель смахивает твою кружку на пол', shot: 'close0', act: (s) => s.gesture(s.fighters[1], 'beckon', 1) },
      { who: 2, text: 'Глушитель, не шуми. Хотя… давай посмотрим, что он умеет.', shot: 'group' },
    ],
  };
}

function sceneB2(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: B, a: P(f, 0), b: P(f, 1), dist: 2.4, hide: [false, true],
    lines: [
      { who: null, text: 'Утро. На двери подвала — красный конь из баллончика', shot: 'wide' },
      { who: null, text: 'Внутри порезан мешок. Опилки по всему полу', shot: 'low' },
      { who: 0, text: 'Ну всё.', shot: 'close0', act: (s) => s.gesture(s.fighters[0], 'shake', 1) },
    ],
  };
}

function sceneB3(c: Career, f: CareerFighter, a: Act1): SceneSpec {
  const lines: SceneLine[] = [
    { who: null, text: 'Рёв моторов. В подвал спускается Шатун, за ним — Глушитель', shot: 'low', act: (s) => (s.scene!.dist = 1.9) },
    { who: 1, text: 'Тесно у тебя. Михалыч тоже был упрямый.', shot: 'group' },
  ];
  if (a.flags.bkWin) lines.push({ who: 2, text: 'Это он меня тогда…', shot: 'group' }, { who: 1, text: 'Помолчи.', shot: 'over1' });
  lines.push(
    { who: 1, text: 'Предлагаю раз. Надевай жилетку. Гусю скажем — он отстанет на пятьсот. Будешь драться за «Коней».', shot: 'over1' },
    { who: 1, text: 'Не наденешь — значит, ты сам по себе. А сам по себе на нашей улице долго не живут.', shot: 'close1' },
  );
  return { map: B, a: P(f, 0), b: P(shatun(c, f), 1), dist: 3.2, extra: { p: P(glush(c, f), 1) }, names: { extra: 'Глушитель' }, lines };
}

function sceneB4(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: MAP_BY_ID.alley, a: P(f, 0), b: P(glush(c, f), 1), dist: 3.4, extra: { p: P(shatun(c, f), 1), side: 0.9 }, names: { extra: 'Шатун' },
    lines: [
      { who: null, text: 'Ночь. Фары бьют в глаза. Мотоциклы кругом у подъезда', shot: 'low', act: (s) => (s.scene!.dist = 2.2) },
      { who: 2, text: 'Ты сказал «нет». У нас за «нет» отвечают.', shot: 'group' },
      { who: 1, text: 'Я первый. Я давно хотел.', shot: 'over1' },
      { who: 0, text: 'Ну давай.', shot: 'close0' },
    ],
  };
}

// --- The 20th ---

/** Who stays out of the 20th: Кирпич, if he owes us respect or the bikers took him outside. */
const kirpichOut = (a: Act1) => !!(a.flags.kirpichRespect || a.flags.bkJoin || a.flags.bkRespect);

function scene20(c: Career, f: CareerFighter, a: Act1): SceneSpec {
  const lines: SceneLine[] = [
    { who: null, text: 'Двадцатое. Полночь. Дверь подвала вылетает с одного удара', shot: 'low', act: (s) => (s.scene!.dist = 2.0) },
    { who: 1, text: 'Двадцатое число. Я пунктуальный человек.', shot: 'group' },
    { who: 1, text: `Не хватает $${a.debt}. Ключи на стол — или по-плохому.`, shot: 'group' },
    { who: 0, text: 'Это дом Михалыча. Не отдам.', shot: 'close0' },
  ];
  if (a.flags.bkJoin || a.flags.bkRespect)
    lines.push(
      { who: null, text: 'С улицы — рёв моторов. В проёме Шатун и «Железные кони»', shot: 'wide' },
      { who: null, text: a.flags.bkJoin ? 'Шатун: «Это наш человек. Кирпич, пойдём покурим. Пусть разберутся один на один»' : 'Шатун: «Подвальный своё отбил честно. Кирпич, пойдём покурим. Один на один — по-нашему»', shot: 'group' },
      { who: 1, text: 'Ну что ж. Двадцать лет не выходил.', shot: 'over1' },
    );
  else if (a.flags.kirpichRespect)
    lines.push(
      { who: 2, text: 'Гусь, я пас. Я ему руку жал.', shot: 'group' },
      { who: 1, text: 'Тогда сам. Двадцать лет не выходил.', shot: 'over1' },
    );
  else
    lines.push(
      { who: 1, text: 'Кирпич, разомни его. Что останется — моё.', shot: 'group' },
      { who: 2, text: 'Хе.', shot: 'group', dur: 1.6 },
    );
  return { map: B, a: P(f, 0), b: P(gus(c, f), 1), dist: 3.4, extra: { p: P(kirpich(c, f), 1) }, names: { extra: 'Кирпич' }, lines };
}

function scene20b(c: Career, f: CareerFighter): SceneSpec {
  return {
    map: B, a: P(f, 0), b: P(gus(c, f), 1), dist: 2.4,
    lines: [
      { who: null, text: 'Кирпич лежит у стены. Гусь медленно снимает кожанку', shot: 'low', act: (s) => (s.scene!.dist = 1.8) },
      { who: 1, text: 'Михалыч бы гордился. Жаль, что зря.', shot: 'over1' },
      { who: 0, text: 'Ещё не зря.', shot: 'close0', act: (s) => s.gesture(s.fighters[0], 'wipe', 1) },
    ],
  };
}

export function endingScene(c: Career, f: CareerFighter, e: Ending): SceneSpec {
  if (e === 'ours')
    return {
      map: B, a: P(f, 0), b: P(f, 1), dist: 2.4, hide: [false, true], names: { tv: 'Михалыч' },
      lines: [
        { who: null, text: 'Двадцатое. Третья кассета: «Если подвал выстоял»', shot: 'orbit0', act: tvOn },
        { who: 'tv', text: 'Ну вот. А я в тебя верил. Теперь слушай: пояс на стене — не для красоты. Забери настоящий.', shot: 'tv' },
        { who: null, text: 'Акт 1 пройден. Подвал ваш', shot: 'orbit0' },
      ],
    };
  if (e === 'lost')
    return {
      map: MAP_BY_ID.alley, a: P(f, 0), b: P(scar(c, f), 1), dist: 2.2,
      lines: [
        { who: null, text: 'Утро. У двери подвала меняют замок. Шрам смотрит', shot: 'wide' },
        { who: 1, text: 'Не переживай. Я повешу пояс старика на видное место.', shot: 'over1' },
        { who: 0, text: 'Я его заберу.', shot: 'close0' },
      ],
    };
  return {
    map: B, a: P(f, 0), b: P(scar(c, f), 1), dist: 2.2,
    lines: [
      { who: null, text: 'Шрам снимает пояс Михалыча со стены', shot: 'wide' },
      { who: 1, text: 'Умный выбор. Старик бы не понял. А ты понял.', shot: 'over1' },
      { who: null, text: `${short(f)} смотрит в пол`, shot: 'close0' },
    ],
  };
}

// ---------- Fights ----------

export interface A1Fight {
  opp: CareerFighter;
  /** Who fights for us (default: the picked fighter). */
  who?: CareerFighter;
  tier: Tier;
  title: string;
  pre?: SceneSpec;
  /** Result lines, and a scene to play after it if any. */
  after(c: Career, f: CareerFighter, r: FightResult): { lines: string[]; scene?: SceneSpec };
}

function kirpichFight(c: Career, a: Act1, f: CareerFighter): A1Fight {
  return {
    opp: kirpich(c, f), tier: place('alley', 0), title: `Подворотня: ${short(f)} против Кирпича`, pre: scene4(c, f),
    after: (c2, f2, r) => {
      if (!a.done.includes('s4')) a.done.push('s4');
      if (!a.done.includes('s4h') && a.flags.kirpichHome) a.done.push('s4h');
      a.flags.kirpichHome = 0;
      if (r.won) {
        a.debt = Math.max(0, a.debt - 500);
        a.pending = 's4b';
        f2.fame += 2;
        return { lines: [`Кирпич на земле. Гусь списывает $500: долг $${a.debt}`], scene: scene4down(c2, f2) };
      }
      a.debt += 300;
      a.flags.kirpichHome = 0;
      out(c2, f2, 2, 'отходит после драки с Кирпичом');
      ladder(c2).open = true;
      return { lines: [`Кирпич оказался сильнее. Гусь: «Будешь должен больше: $${a.debt}. В субботу турнир в подвале «Подковы» — запишись. Только подготовься как следует»`, `${short(f2)} 2 дня лечится`] };
    },
  };
}

function roofFight(c: Career, a: Act1, f: CareerFighter): A1Fight {
  const opp = makeFighter(Math.max(0.02, levelOf(f) + (Math.random() - 0.5) * 0.06), 0.5, classOf(f));
  const first = !a.flags.roofs;
  const tier: Tier = { ...place('roof', 1, [0, 0]), name: 'Крыша' };
  return {
    opp, tier, title: `Ночь на крыше: ${short(f)} против ${short(opp)}`,
    pre: {
      map: MAP_BY_ID.roof, a: P(f, 0), b: P(opp, 1), dist: 3, names: { extra: 'Тимоха' },
      lines: [
        { who: null, text: 'Ночь. Крыша над районом, вокруг толпа с телефонами', shot: 'wide', act: (s) => (s.scene!.dist = 2.4) },
        ...(first ? [{ who: 2 as const, text: 'Только не смотри вниз.', shot: 'close0' as const }] : []),
      ],
    },
    after: (c2, f2, r) => {
      a.flags.roofs = (a.flags.roofs ?? 0) + 1;
      a.roofNext = c2.day + 3;
      if (r.won) {
        f2.fame += 1;
        a.pending = 's7pay';
        return { lines: ['Победа на крыше: $300 наличными. Отдать сразу Гусю?'] };
      }
      c2.money += 50;
      out(c2, f2, 3, 'отходит после крыши');
      return { lines: ['Поражение на крыше. $50 за выход, 3 дня лечения'] };
    },
  };
}

function gusFight(c: Career, a: Act1, f: CareerFighter, friendly: boolean): A1Fight {
  const g = gus(c, f);
  const respect = !!a.flags.kirpichRespect;
  const pre: SceneSpec = {
    map: MAP_BY_ID.bar, a: P(f, 0), b: P(g, 1), dist: 2.4, extra: { p: P(kirpich(c, f), 1), side: 0.8 }, names: { extra: 'Кирпич' },
    lines: respect
      ? [{ who: 2, text: 'Я не лезу. Честно так честно.', shot: 'group' }]
      : [{ who: 2, text: 'Хе. Гусь, я рядом.', shot: 'group' }],
  };
  return {
    opp: g, tier: { ...place('bar', 0), name: 'Бар' }, title: `${friendly ? 'Для души' : 'За долг'}: ${short(f)} против Гуся`, pre,
    after: (c2, f2, r) => {
      a.done.push(friendly ? 's8f' : 's8fight');
      if (friendly) {
        if (r.won) {
          a.flags.gusAlly = 1;
          f2.fame += 3;
        }
        return finish(c2, a, 'ours', r.won ? ['Гусь жмёт руку: «Звони, если что». Известность +3'] : ['Гусь доволен: «Рука ещё помнит»']);
      }
      if (r.won) {
        a.debt = 0;
        f2.fame += 5;
        if (a.plan === 'bold') a.flags.gusAlly = 1;
        a.flags.scarTruth = 1;
        const res = finish(c2, a, 'ours', ['Гусь на полу. Долг списан, известность +5']);
        return { lines: res.lines, scene: sceneGusDown(c2, f2, a) };
      }
      return finish(c2, a, 'lost', ['Гусь оказался сильнее. Ключи на стол']);
    },
  };
}

/** A biker of «Железные кони» in the story. */
function bikerFight(opp: CareerFighter, map: 'bar' | 'alley' | 'basement', title: string, pre: SceneSpec | undefined, after: A1Fight['after']): A1Fight {
  return { opp, tier: { ...place(map, 0), name: map === 'bar' ? 'Бар' : map === 'alley' ? 'Улица' : 'Подвал' }, title, pre, after };
}

/** The 20th: Кирпич first (unless he stays out), then Гусь. Win both and the basement stays. */
function fight20Kirpich(c: Career, a: Act1, f: CareerFighter): A1Fight {
  return {
    opp: kirpich(c, f), tier: { ...place('basement', 0), name: 'Подвал' }, title: `Двадцатое: ${short(f)} против Кирпича`,
    after: (c2, f2, r) => {
      if (!a.done.includes('d20')) a.done.push('d20');
      if (r.won) {
        a.pending = 'd20b';
        f2.fame += 2;
        return { lines: ['Кирпич у стены. Но это ещё не всё: Гусь снимает кожанку'] };
      }
      a.done.push('d20b');
      return finish(c2, a, 'lost', ['Кирпич оказался сильнее. Гусь поднимает ключи с пола']);
    },
  };
}

function fight20Gus(c: Career, a: Act1, f: CareerFighter): A1Fight {
  return {
    opp: gus(c, f), tier: { ...place('basement', 0), name: 'Подвал' }, title: `Двадцатое: ${short(f)} против Гуся`,
    after: (c2, f2, r) => {
      for (const id of ['d20', 'd20b']) if (!a.done.includes(id)) a.done.push(id);
      if (r.won) {
        f2.fame += 6;
        a.flags.scarTruth = 1;
        if (a.plan === 'bold') a.flags.gusAlly = 1;
        const res = finish(c2, a, 'ours', ['Гусь на полу. Подвал отбит! Долг списан, известность +6']);
        return { lines: res.lines, scene: sceneGusDown(c2, f2, a, B) };
      }
      return finish(c2, a, 'lost', ['Гусь оказался сильнее. Ключи у него']);
    },
  };
}

// ---------- Cards ----------

interface Opt {
  id: string;
  label: string;
  no?: (c: Career, a: Act1, f: CareerFighter) => string | null;
  run(c: Career, a: Act1, f: CareerFighter): { lines: string[]; fight?: A1Fight; scene?: SceneSpec };
}

interface Card {
  id: string;
  title: string;
  who: string;
  /** When it opens. */
  when(c: Career, a: Act1): boolean;
  text(c: Career, a: Act1, f: CareerFighter): string;
  scene?(c: Career, f: CareerFighter, a: Act1): SceneSpec;
  /** Cannot be put off: the screen is blocked until it is dealt with. */
  forced?: boolean;
  opts: Opt[];
}

const CARDS: Card[] = [
  // The 20th comes before anything else that day.
  {
    id: 'd20', title: 'Двадцатое', who: 'Гусь и Кирпич',
    when: (c, a) => actDay(c, a) >= 20 && a.debt > 0,
    forced: true,
    text: (_c, a) => `Полночь двадцатого. Гусь${kirpichOut(a) ? '' : ' и Кирпич'} в подвале. Не хватает $${a.debt}. Отдать ключи — или драться${kirpichOut(a) ? ' с Гусем' : ': сначала Кирпич, потом Гусь'}. Победишь — подвал твой.`,
    scene: scene20,
    opts: [
      { id: 'fight', label: 'Драться за подвал', run: (c, a, f) => ({ lines: [], fight: kirpichOut(a) ? fight20Gus(c, a, f) : fight20Kirpich(c, a, f) }) },
      { id: 'pay', label: 'Отдать деньги', no: (c, a) => (c.money < a.debt ? `нужно $${a.debt}` : null), run: (c, a) => {
        c.money -= a.debt;
        a.debt = 0;
        return finish(c, a, 'ours', ['Гусь пересчитал до купюры: «Успел. Квиты»']);
      } },
      { id: 'keys', label: 'Отдать ключи', run: (c, a) => finish(c, a, 'lost', ['Ключи легли на пол. Гусь даже не посмотрел']) },
    ],
  },
  {
    id: 'd20b', title: 'Гусь снимает кожанку', who: 'Гусь',
    when: () => false,
    forced: true,
    text: () => 'Кирпич лежит у стены. Гусь снимает кожанку: «Ну, раз так — я сам». Последний бой за подвал.',
    scene: (c, f) => scene20b(c, f),
    opts: [{ id: 'fight', label: 'Драться', run: (c, a, f) => ({ lines: [], fight: fight20Gus(c, a, f) }) }],
  },
  {
    id: 's1', title: 'Ключи', who: 'Михалыч (кассета)',
    when: () => true,
    text: () => 'Тебе достался подвал под прачечной. На тумбе — старый телевизор и кассета «Новому хозяину».',
    scene: scene1,
    opts: [{ id: 'ok', label: 'Дальше', run: (_c, a) => ({ lines: [`Цель: закрыть долг $${a.debt} до 20-го дня. Иначе подвал отберут`] }) }],
  },
  {
    id: 's2', title: 'Гусь', who: 'Гусь и Кирпич',
    when: (c, a) => actDay(c, a) >= 2,
    text: () => 'Коллектор Гусь пришёл за долгом Михалыча: $1500 до двадцатого. За его плечом молчит здоровенный Кирпич.',
    scene: (c, f) => scene2(c, f),
    opts: [
      { id: 'pay', label: '«Дай время, отдадим»', run: (c, a) => {
        a.plan = 'pay';
        a.flags.gusView = 1;
        ladder(c).open = true;
        return { lines: ['Гусь: «Разумно. По понедельникам, сто пятьдесят. Остальное — двадцатого». Каждый понедельник $150', CUP_TIP] };
      } },
      { id: 'bold', label: '«Михалыч тебе ничего не должен»', run: (c, a) => {
        a.plan = 'bold';
        a.debt += 200;
        a.flags.gusView = 3;
        ladder(c).open = true;
        return { lines: [`Гусь улыбается: «Тогда двадцатого — вся сумма. И процент за дерзость». Долг $${a.debt}`, CUP_TIP] };
      } },
      { id: 'sport', label: '«Давай решим по-спортивному»', run: (c, a) => {
        a.plan = 'sport';
        a.flags.gusView = 2;
        a.kirpichDay = a.start + 4;
        ladder(c).open = true;
        return { lines: ['Гусь оглядывается: «Кирпич, слышал? В пятницу, в подворотне». Бой с Кирпичом — на 5-й день', CUP_TIP] };
      } },
    ],
  },
  {
    id: 's3', title: 'Вторая кассета', who: 'Михалыч (кассета)',
    when: (c, a) => actDay(c, a) >= 4,
    text: () => 'За раздевалкой нашлась вторая кассета. На ней: «Урок 1».',
    scene: scene3,
    opts: [
      { id: 'listen', label: 'Послушать до конца (часть дня)', no: (c, _a, f) => (partsLeft(c, f) < 1 ? 'сегодня уже нет времени' : null), run: (c, a, f) => ({ lines: [lesson(c, a, f)] }) },
      { id: 'later', label: 'Отложить, не до того', run: () => ({ lines: ['Кассета лежит дома, у телевизора. Можно посмотреть потом'] }) },
    ],
  },
  {
    id: 's4', title: 'Подворотня', who: 'Кирпич',
    when: (c, a) => c.day >= a.kirpichDay,
    text: (_c, a) => `Кирпич ждёт за баром «Подкова». Бой без раундов, до конца. Победа спишет $500 долга${a.plan === 'sport' ? ' — так договорились с Гусем' : ''}.`,
    opts: [
      { id: 'go', label: 'Идти', no: (c, _a, f) => (f.busyUntil > c.day ? `${short(f)} ещё не готов` : partsLeft(c, f) < 1 ? 'сегодня уже поздно — завтра' : null), run: (c, a, f) => ({ lines: [], fight: kirpichFight(c, a, f) }) },
      { id: 'skip', label: 'Не идти', run: (c, a) => {
        a.flags.kirpichHome = 1;
        a.kirpichDay = c.day + 1;
        a.done.push('s4');
        return { lines: ['Не пошёл. Кирпич такого не прощает — жди гостей'] };
      } },
    ],
  },
  {
    id: 's4h', title: 'Стук в дверь', who: 'Кирпич',
    when: (c, a) => !!a.flags.kirpichHome && c.day >= a.kirpichDay,
    text: () => 'Утро. В дверь колотят. На пороге Кирпич: «Не пришёл в подворотню — подворотня пришла к тебе». Драться придётся прямо в подвале.',
    opts: [{ id: 'fight', label: 'Драться', run: (c, a, f) => ({ lines: [], fight: { ...kirpichFight(c, a, f), tier: place('basement', 0), title: `Подвал: ${short(f)} против Кирпича`, pre: undefined } }) }],
  },
  {
    id: 's4b', title: 'Кирпич на земле', who: 'Кирпич',
    when: () => false,
    text: () => '«Хорошо бьёшь. Меня так с армии не клали.»',
    opts: [
      { id: 'hand', label: 'Протянуть руку', run: (_c, a) => {
        a.flags.kirpichRespect = 1;
        return { lines: ['Кирпич поднимается: «Запомню»'] };
      } },
      { id: 'leave', label: 'Уйти молча', run: () => ({ lines: ['Кирпич остаётся человеком Гуся'] }) },
      { id: 'taunt', label: '«Передай Гусю: следующий — он»', run: (c, a, f) => {
        f.fame += 3;
        a.flags.taunt = 1;
        a.gusDay = a.start + 14;
        return { lines: ['Известность +3. Гусь придёт раньше — и злее'] };
      } },
    ],
  },
  {
    id: 's5', title: 'Человек в пиджаке', who: 'Шрам',
    when: (c, a) => actDay(c, a) >= 8,
    text: () => 'В подвал зашёл Шрам, хозяин «Железного кулака». Предлагает закрыть долг и дать $2000 сверху — за ключи от подвала.',
    scene: scene5,
    opts: [
      { id: 'deal', label: '«Договорились»', run: (c, a) => finish(c, a, 'deal', ['Шрам закрыл долг и отсчитал $2000. Ключи у него']) },
      { id: 'no', label: '«Нет»', run: (_c, a) => {
        a.flags.scarEnemy = 1;
        return { lines: ['Шрам: «Тогда двадцатого я всё равно приду. Уже как хозяин»'] };
      } },
      { id: 'ask', label: '«Что ты сделал Михалычу?»', no: (_c, a) => (a.flags.tape2 ? null : 'сначала послушай вторую кассету'), run: (_c, a) => {
        a.flags.scarEnemy = 1;
        a.flags.scarSecret = 1;
        return { lines: ['Шрам впервые теряет спокойствие: «Это он мне сделал». Уходит'] };
      } },
    ],
  },
  {
    id: 's6', title: 'Пацан у окна', who: 'Тимоха',
    when: (c, a) => actDay(c, a) >= 10,
    text: () => 'Худой пацан неделю стоит у окна подвала и повторяет удары. Просится в команду и знает, где ночью дерутся за деньги.',
    scene: (c, f) => scene6(c, f),
    opts: [
      { id: 'take', label: '«Заходи»', no: (c) => (c.roster.length >= MAX_ROSTER ? 'команда полна' : null), run: (c, a) => {
        c.roster.push(kid(c));
        a.flags.kid = 1;
        a.flags.roofsOpen = 1;
        return { lines: ['Тимоха в команде. И крыши теперь открыты: бой раз в три ночи'] };
      } },
      { id: 'roofs', label: '«Расскажи про крыши, а в команду рано»', run: (_c, a) => {
        a.flags.roofsOpen = 1;
        a.flags.kidScar = 1;
        return { lines: ['Тимоха рассказал про крыши и ушёл обиженный'] };
      } },
      { id: 'home', label: '«Иди домой, пацан»', run: (_c, a) => {
        a.flags.kidScar = 1;
        return { lines: ['Пацан ушёл. Говорят, его подобрал Шрам'] };
      } },
    ],
  },
  {
    id: 's7', title: 'Ночной бой на крыше', who: 'Тимоха',
    when: (c, a) => !!a.flags.roofsOpen && a.debt > 0 && c.day >= a.roofNext && actDay(c, a) >= 12,
    text: () => 'Сегодня ночью на крыше бой за деньги: один раунд, победителю $300. Проигравшему — $50 и синяки.',
    opts: [
      { id: 'go', label: 'Драться', no: (c, _a, f) => (f.busyUntil > c.day ? `${short(f)} ещё не готов` : partsLeft(c, f) < 1 ? 'сегодня уже поздно' : null), run: (c, a, f) => ({ lines: [], fight: roofFight(c, a, f) }) },
      { id: 'skip', label: 'Не сегодня', run: (c, a) => {
        a.roofNext = c.day + 3;
        return { lines: ['Следующий бой на крыше — через три ночи'] };
      } },
    ],
  },
  {
    id: 's7pay', title: 'Деньги с крыши', who: 'Тимоха',
    when: () => false,
    text: (_c, a) => `$300 наличными. Долг Гусю: $${a.debt}.`,
    opts: [
      { id: 'debt', label: 'Сразу Гусю', run: (_c, a) => {
        a.debt = Math.max(0, a.debt - 300);
        return { lines: [`Гусь пересчитал: «Приятно иметь с вами дело». Долг $${a.debt}`] };
      } },
      { id: 'keep', label: 'Себе', run: (c) => {
        c.money += 300;
        return { lines: ['+$300 в кассу'] };
      } },
    ],
  },
  {
    id: 's8', title: 'Гусь приходит сам', who: 'Гусь',
    when: (c, a) => c.day >= a.gusDay,
    text: (_c, a) => (a.debt > 0 ? `Гусь ждёт в «Подкове». Долг ещё $${a.debt}. Предупреждает: двадцатого он придёт не один.` : 'Долг отдан, но Гусь всё равно зовёт в «Подкову»: поговорить.'),
    scene: (c, f, a) => scene8(c, f, a),
    opts: [
      { id: 'wait', label: '«Приходи. Встречу»', no: (_c, a) => (a.debt <= 0 ? 'долг уже отдан' : null), run: (_c, a, f) => {
        a.flags.gusWarned = 1;
        addMood(f, 5);
        return { lines: ['Гусь допивает чай: «Как скажешь». Двадцатого — разборка в подвале'] };
      } },
      { id: 'pay', label: '«Отдам всё сейчас»', no: (c, a) => (a.debt <= 0 ? 'долг уже отдан' : c.money < a.debt ? `нужно $${a.debt}` : null), run: (c, a) => {
        c.money -= a.debt;
        a.debt = 0;
        return finish(c, a, 'ours', ['Гусь пересчитал до купюры: «Квиты»']);
      } },
      { id: 'keys', label: '«Забирай ключи»', no: (_c, a) => (a.debt <= 0 ? 'долг уже отдан' : null), run: (c, a) => finish(c, a, 'lost', ['Ключи легли на стол']) },
      { id: 'friendly', label: '«Давай» (без ставок)', no: (c, a, f) => (a.debt > 0 ? 'сначала долг' : f.busyUntil > c.day ? `${short(f)} ещё не готов` : null), run: (c, a, f) => ({ lines: [], fight: gusFight(c, a, f, true) }) },
      { id: 'later', label: '«В другой раз»', no: (_c, a) => (a.debt > 0 ? 'сначала долг' : null), run: (c, a) => finish(c, a, 'ours', ['Гусь пожимает плечами: «Как знаете»']) },
    ],
  },

  // --- «Железные кони»: the bikers who run the street ---
  {
    id: 'b1', title: 'Чужой стол', who: '«Железные кони»',
    when: (c, a) => actDay(c, a) >= 3 && did(a, 's2'),
    text: () => 'В «Подкове» байкеры «Железных коней». Глушитель смахнул твою кружку: «Это наш стол, подвальный». Шатун смотрит и ухмыляется.',
    scene: sceneB1,
    opts: [
      { id: 'out', label: '«Выйдем»', run: (c, a, f) => ({ lines: [], fight: bikerFight(glush(c, f), 'alley', `За «Подковой»: ${short(f)} против Глушителя`, undefined, (c2, f2, r) => {
        a.done.push('b1');
        a.flags.bkWar = 1;
        a.flags.bkNext = c2.day + 3;
        if (r.won) {
          a.flags.bkWin = 1;
          f2.fame += 2;
          addMood(f2, 8);
          return { lines: ['Глушитель в луже. Шатун перестал ухмыляться. Известность +2. «Кони» этого не забудут'] };
        }
        addMood(f2, -8);
        return { lines: ['Глушитель сильнее. Байкеры ржут вслед'] };
      }) }) },
      { id: 'leave', label: 'Уйти', run: (c, a, f) => {
        a.flags.bkMock = 1;
        a.flags.bkNext = c.day + 3;
        addMood(f, -8);
        return { lines: ['Ушёл. В спину свистят. На районе говорят: подвальный струсил'] };
      } },
      { id: 'joke', label: '«Сначала научись пить»', run: (c, a, f) => {
        a.flags.bkWar = 1;
        a.flags.bkNext = c.day + 3;
        f.fame += 1;
        return { lines: ['Бар хохочет. Глушитель багровеет. Известность +1, «Коням» не смешно'] };
      } },
    ],
  },
  {
    id: 'b2', title: 'Конь на двери', who: '«Железные кони»',
    when: (c, a) => did(a, 'b1') && c.day >= (a.flags.bkNext ?? 0) && actDay(c, a) >= 6,
    text: () => 'На двери подвала нарисован красный конь. Внутри порезан мешок. Метка «Коней»: это их улица.',
    scene: sceneB2,
    opts: [
      { id: 'garage', label: 'Пойти к ним в гаражи', no: (c, _a, f) => (partsLeft(c, f) < 1 ? 'сегодня уже поздно' : null), run: (c, a, f) => ({ lines: [], fight: bikerFight(rusty(c, f), 'alley', `Гаражи: ${short(f)} против Ржавого`, {
        map: MAP_BY_ID.alley, a: P(f, 0), b: P(rusty(c, f), 1), dist: 3,
        lines: [
          { who: null, text: 'Гаражи «Коней». Пахнет бензином', shot: 'wide', act: (s) => (s.scene!.dist = 2.2) },
          { who: 1, text: 'Шатуна нет. Есть я. Бывший КМС, между прочим.', shot: 'over1' },
        ],
      }, (c2, f2, r) => {
        a.done.push('b2');
        a.flags.bkWar = 1;
        a.flags.bkNext = c2.day + 3;
        if (r.won) {
          c2.money += 80;
          f2.fame += 2;
          a.flags.bkWin = (a.flags.bkWin ?? 0) + 1;
          return { lines: ['Ржавый сдался. В гараже нашёлся новый мешок — забрал как компенсацию (+$80). Известность +2'] };
        }
        addMood(f2, -6);
        return { lines: ['Ржавый оказался крепче. Ушёл ни с чем'] };
      }) }) },
      { id: 'paint', label: 'Закрасить и зашить мешок ($20)', no: (c) => (c.money < 20 ? 'нужно $20' : null), run: (c, a) => {
        c.money -= 20;
        a.flags.bkNext = c.day + 3;
        return { lines: ['Закрасил. Конь проступает сквозь краску'] };
      } },
      { id: 'over', label: 'Нарисовать поверх кулак', run: (c, a, f) => {
        a.flags.bkWar = 1;
        a.flags.bkNext = c.day + 3;
        addMood(f, 6);
        return { lines: ['Поверх коня — кулак. Теперь это война'] };
      } },
    ],
  },
  {
    id: 'b3', title: 'Предложение Шатуна', who: 'Шатун',
    when: (c, a) => did(a, 'b2') && c.day >= (a.flags.bkNext ?? 0) && actDay(c, a) >= 10,
    text: () => 'Шатун сам спустился в подвал: «Надевай жилетку «Коней» — Гусь скинет пятьсот. Не наденешь — ты сам по себе».',
    scene: sceneB3,
    opts: [
      { id: 'join', label: 'Надеть жилетку', run: (c, a, f) => {
        a.flags.bkJoin = 1;
        a.debt = Math.max(0, a.debt - 500);
        f.skin = 'biker';
        addMood(f, -5);
        return { lines: [`Теперь ты «Конь». Гусь скинул $500: долг $${a.debt}. Двадцатого «Кони» будут рядом. «Цех №5» тебе этого не простит`] };
      } },
      { id: 'duel', label: '«Один на один. Здесь»', run: (c, a, f) => ({ lines: [], fight: bikerFight(shatun(c, f), 'basement', `Подвал: ${short(f)} против Шатуна`, undefined, (c2, f2, r) => {
        a.done.push('b3');
        if (r.won) {
          a.flags.bkRespect = 1;
          a.flags.bkWar = 0;
          f2.fame += 4;
          return { lines: ['Шатун поднимается, сплёвывает: «Уважаю. Двадцатого приду посмотреть». Известность +4'] };
        }
        a.flags.bkWar = 1;
        out(c2, f2, 2, 'отходит после Шатуна');
        return { lines: ['Шатун уходит не оглядываясь. Война продолжается. 2 дня лечения'] };
      }) }) },
      { id: 'no', label: '«Я сам по себе»', run: (_c, a) => {
        a.flags.bkWar = 1;
        return { lines: ['Шатун кивает: «Как скажешь». Жди гостей'] };
      } },
    ],
  },
  {
    id: 'b4', title: 'Фары у подъезда', who: '«Железные кони»',
    when: (c, a) => did(a, 'b3') && !!a.flags.bkWar && !a.flags.bkRespect && !a.flags.bkJoin && actDay(c, a) >= 14,
    forced: true,
    text: () => 'Ночь. У подъезда кругом мотоциклы. Глушитель выходит в свет фар — драться придётся.',
    scene: (c, f) => sceneB4(c, f),
    opts: [{ id: 'fight', label: 'Драться', run: (c, a, f) => ({ lines: [], fight: bikerFight(glush(c, f), 'alley', `У подъезда: ${short(f)} против Глушителя`, undefined, (c2, f2, r) => {
      a.done.push('b4');
      if (r.won) {
        a.flags.bkRespect = 1;
        a.flags.bkWar = 0;
        f2.fame += 3;
        return { lines: ['Глушитель на асфальте. Шатун глушит мотор: «Ладно, подвальный. Живи». Известность +3'] };
      }
      const lost = Math.min(c2.money, 100);
      c2.money -= lost;
      addMood(f2, -10);
      out(c2, f2, 2, 'отходит после драки у подъезда');
      return { lines: [`Глушитель сильнее. «Кони» забрали из кассы $${lost}. 2 дня лечения`] };
    }) }) }],
  },
];

const BY = Object.fromEntries(CARDS.map((x) => [x.id, x]));

/** Михалыч's first lesson: free hands and technique (once). */
function lesson(c: Career, a: Act1, f: CareerFighter): string {
  if (a.flags.tape2) return 'Урок уже пройден';
  a.flags.tape2 = 1;
  f.craft ??= { hands: 0, legs: 0 };
  f.craft.hands = Math.min(1, f.craft.hands + 0.08);
  f.stats.skill = Math.min(f.caps.skill, f.stats.skill + 0.02);
  f.parts = (f.parts ?? 0) + 1;
  return 'Урок Михалыча: Руки +8%, Техника +2%';
}

/** The second tape from the flat, if it was put off. */
export function watchLesson(c: Career): { text: string; scene?: SceneSpec } {
  const a = act(c);
  const f = main(c);
  if (!a || !did(a, 's3') || a.flags.tape2) return { text: 'Кассет больше нет' };
  if (partsLeft(c, f) < 1) return { text: 'Сегодня уже нет времени' };
  const t = lesson(c, a, f);
  save(c);
  return { text: t, scene: scene3(c, f) };
}

function out(c: Career, f: CareerFighter, days: number, what: string): void {
  f.busyFrom = c.day;
  f.busyUntil = Math.max(f.busyUntil, c.day + days);
  f.busyWhat = what;
  f.treated = false;
}

/** The act ends: what each ending leaves behind. */
function finish(c: Career, a: Act1, e: Ending, lines: string[]): { lines: string[]; scene?: SceneSpec } {
  if (a.ending) return { lines };
  a.ending = e;
  a.pending = 'end';
  const f = main(c);
  if (e === 'deal') {
    a.debt = 0;
    c.money += 2000;
    addMood(f, -20);
    a.flags.lost = 1;
    lines.push('Акт 1: «Сделка». +$2000, долга нет. Подвал и пояс Михалыча теперь у Шрама');
  } else if (e === 'lost') {
    a.flags.lost = 1;
    addMood(f, -15);
    lines.push('Акт 1: «Зал потерян». Тренировки теперь во дворе (на 20% хуже). Подвал можно будет вернуть');
  } else {
    a.debt = 0;
    addMood(f, 15);
    lines.push('Акт 1: «Зал наш». Подвал ваш');
  }
  return { lines };
}

// ---------- What the career calls ----------

/** Opens the next scene if it is time (career shown, and at midnight). */
export function act1Check(c: Career): string[] {
  const a = act(c);
  if (!a || a.pending || (a.ending && did(a, 'end'))) return [];
  if (a.ending) {
    a.pending = 'end';
    return [];
  }
  const card = CARDS.find((x) => !did(a, x.id) && x.when(c, a));
  if (!card) return [];
  a.pending = card.id;
  return [`🎬 Сюжет: «${card.title}»`];
}

/** Midnight: Monday payments, the 20th. Runs after the date moved on. */
export function act1Day(c: Career): string[] {
  const a = act(c);
  // The morning after the act ends with no basement (or nobody told him about the cup): the
  // fight club calls. Played by the career screen (`callDue`).
  if (a?.ending && !a.flags.called && (a.flags.lost || !ladder(c).open)) a.flags.callDue = 1;
  if (!a || a.ending) return act1Check(c);
  const out: string[] = [];
  if (a.plan === 'pay' && a.debt > 0 && (c.day - 1) % 7 === 0 && c.day > a.start) {
    const due = Math.min(150, a.debt);
    if (c.money >= due) {
      c.money -= due;
      a.debt -= due;
      out.push(`Платёж Гусю $${due}. Осталось $${a.debt}`);
    } else {
      a.debt += 100;
      out.push(`Нечем платить Гусю: долг +$100 (теперь $${a.debt}). Кирпич придёт завтра`);
      if (!did(a, 's4')) a.kirpichDay = Math.min(a.kirpichDay, c.day + 1);
    }
  }
  // The alley was ignored: Кирпич comes to the door the next morning.
  if (a.pending === 's4' && c.day > a.kirpichDay) {
    a.pending = null;
    a.done.push('s4');
    a.flags.kirpichHome = 1;
    a.kirpichDay = c.day;
    out.push('Не пришёл в подворотню. Утром в дверь стучит Кирпич');
  }
  // The 20th: paid up = the basement is ours; not = Гусь and Кирпич come (the 'd20' card,
  // which cannot be skipped) and it goes to the fists.
  if (actDay(c, a) >= 20 && !a.ending) {
    if (a.debt <= 0) {
      const r = finish(c, a, 'ours', ['Двадцатое. Долг отдан']);
      if (a.pending && a.pending !== 'end') a.pending = 'end';
      out.push(...r.lines);
    } else if (a.pending !== 'd20' && a.pending !== 'd20b' && !did(a, 'd20')) {
      a.pending = 'd20';
      out.push('🎬 Двадцатое. В дверь подвала стучат');
    }
  }
  out.push(...act1Check(c));
  return out;
}

export interface Act1Card {
  id: string;
  title: string;
  who: string;
  text: string;
  /** A film to watch first; the choices show once it was seen (or skipped). */
  film: boolean;
  watched: boolean;
  /** Cannot be put off: the screen is blocked until it is dealt with. */
  forced?: boolean;
  opts: { id: string; label: string; no: string | null }[];
}

export function act1Card(c: Career): Act1Card | null {
  const a = act(c);
  if (!a?.pending) return null;
  const f = main(c);
  if (a.pending === 'end') {
    const e = a.ending!;
    return {
      id: 'end', title: e === 'ours' ? 'Двадцатое. Зал наш' : e === 'lost' ? 'Двадцатое. Зал потерян' : 'Сделка',
      who: e === 'ours' ? 'Михалыч (кассета)' : 'Шрам',
      text: e === 'ours' ? 'Подвал выстоял. На третьей кассете Михалыч говорит последнее.' : e === 'lost' ? 'Замок на двери подвала поменяли. Шрам доволен.' : 'Шрам забирает пояс Михалыча.',
      film: true, watched: a.seen.includes('end'),
      opts: [{ id: 'close', label: e === 'ours' ? 'Акт 1 пройден' : 'Жить дальше', no: null }],
    };
  }
  const card = BY[a.pending];
  return {
    id: card.id, title: card.title, who: card.who, text: card.text(c, a, f),
    film: !!card.scene, watched: a.seen.includes(card.id), forced: !!card.forced || card.id === 's4h',
    opts: card.opts.map((o) => ({ id: o.id, label: o.label, no: o.no?.(c, a, f) ?? null })),
  };
}

/** The film of the open card. */
export function act1Film(c: Career): SceneSpec | null {
  const a = act(c);
  if (!a?.pending) return null;
  const f = main(c);
  if (a.pending === 'end') return endingScene(c, f, a.ending!);
  return BY[a.pending].scene?.(c, f, a) ?? null;
}

export function act1Seen(c: Career): void {
  const a = act(c);
  if (a?.pending && !a.seen.includes(a.pending)) a.seen.push(a.pending);
  save(c);
}

export function act1Choose(c: Career, opt: string): { lines: string[]; fight?: A1Fight; scene?: SceneSpec } {
  const a = act(c);
  if (!a?.pending) return { lines: [] };
  const f = main(c);
  if (a.pending === 'end') {
    a.done.push('end');
    a.pending = null;
    save(c);
    return { lines: [a.ending === 'ours' ? 'Открыт турнир района. Дальше — акт 2' : 'Акт 2 начнётся с поиска нового зала'] };
  }
  const card = BY[a.pending];
  const o = card.opts.find((x) => x.id === opt);
  if (!o) return { lines: [] };
  const why = o.no?.(c, a, f);
  if (why) return { lines: [why] };
  const id = a.pending;
  a.pending = null;
  const r = o.run(c, a, f);
  // A fight keeps the card's scene open until the fight is over (its result sets what's next).
  // The roof fight comes back every few nights: never marked done.
  if (!r.fight && !a.done.includes(id) && id !== 's7') a.done.push(id);
  c.log.unshift(...r.lines.map((x) => `🎬 ${x}`));
  // A fight: the next card waits for its result (act1FightDone).
  if (!a.pending && !r.fight) act1Check(c);
  save(c);
  return r;
}

export function act1FightDone(c: Career, f: CareerFighter, fight: A1Fight, r: FightResult): { lines: string[]; scene?: SceneSpec } {
  const a = act(c)!;
  fightToll(f);
  const res = fight.after(c, f, r);
  if (a.pending && a.pending !== 'end' && did(a, a.pending)) a.pending = null;
  if (!a.pending) act1Check(c);
  c.log.unshift(...res.lines.map((x) => `🎬 ${x}`));
  save(c);
  return res;
}

/** Pays Гусь part of the debt. */
export function act1Pay(c: Career, amount: number): string {
  const a = act(c);
  if (!a || a.ending || a.debt <= 0) return 'Долга нет';
  const n = Math.min(amount, a.debt, c.money);
  if (n <= 0) return 'Нет денег';
  c.money -= n;
  a.debt -= n;
  save(c);
  return a.debt ? `Гусю отдано $${n}. Осталось $${a.debt}` : 'Долг Гусю закрыт! Он всё равно зайдёт поговорить';
}

/** The act's goal line for the home screen. */
export function act1Goal(c: Career): { text: string; debt: number; left: number } | null {
  const a = act(c);
  if (!a || a.ending) return null;
  const left = a.start + 19 - c.day;
  return { text: a.debt > 0 ? `Закрыть долг Гусю до 20-го дня` : 'Долг отдан. Дождаться двадцатого', debt: a.debt, left };
}

/** Training in the yard once the basement is gone. */
export const basementLost = (c: Career) => !!c.act1?.flags.lost;

/** The fight club's call is waiting to be played. */
export const callDue = (c: Career) => !!c.act1?.flags.callDue && !c.act1.flags.called;

/** A call from a strange number: an ad for the fight club, cut off by the first rule. */
export function callScene(c: Career): SceneSpec {
  const f = main(c);
  return {
    map: c.act1?.flags.lost ? MAP_BY_ID.alley : B, a: P(f, 0), b: P(f, 1), dist: 2.4, hide: [false, true],
    lines: [
      { who: null, text: 'Утро. Звонит телефон. Номер незнакомый', shot: 'wide' },
      { who: 2, name: '📞 Голос', text: 'Алло! Бойцовский клуб в подвале «Подковы»! Каждую субботу турнир, призы до трёхсот, взнос тридцать! Клубы, байкеры, заводские!', shot: 'close0' },
      { who: 2, name: '📞 Голос сзади', text: 'Первое правило бойцовского клуба: никому не говорить о бойцовском клубе! Тайлер!', shot: 'close0' },
      { who: 2, name: '📞 Голос', text: 'Ооой… Я забыл. Слушай. Ты ничего не слышал.', shot: 'close0' },
      { who: 0, text: '…Суббота. Подвал «Подковы».', shot: 'wide', act: (s) => s.gesture(s.fighters[0], 'nod', 1) },
    ],
  };
}

/** After the call: the cup is open. */
export function callDone(c: Career): void {
  if (!c.act1) return;
  c.act1.flags.called = 1;
  c.act1.flags.callDue = 0;
  ladder(c).open = true;
  save(c);
}
