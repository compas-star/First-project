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

export const act = (c: Career): Act1 | null => c.act1 ?? null;
/** The act's own day number (1..20). */
export const actDay = (c: Career, a: Act1) => c.day - a.start + 1;
const did = (a: Act1, id: string) => a.done.includes(id);

/** Begins the act for a career that has not had it (a new one, or an old save). */
export function ensureAct1(c: Career): void {
  if (c.act1) return;
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

function gus(c: Career, f: CareerFighter): CareerFighter {
  const s = story(c);
  return npc(c, s, 'a1gus', () => heavy(f, 0.06, 'Гусь «Коллектор» Гусев', 'boxing', 'biker', 0.3), f);
}
function kirpich(c: Career, f: CareerFighter): CareerFighter {
  const s = story(c);
  return npc(c, s, 'a1kirpich', () => {
    // A wall of a man, whatever ours weighs: the story fight is not a bout.
    const m = heavy(f, 0.05, 'Кирпич «Стена» Кирпичёв', 'street', 'robot', 0.17);
    m.height = 1.96;
    m.weight = 112;
    return m;
  }, f);
}
function scar(c: Career, f: CareerFighter): CareerFighter {
  const s = story(c);
  return npc(c, s, 'a1scar', () => heavy(f, 0.2, 'Шрам «Хозяин» Железнов', 'muaythai', 'clerk'), f);
}
function kid(c: Career): CareerFighter {
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

const P = (f: CareerFighter, team: 0 | 1): FighterParams => {
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
        { who: null, text: 'Бар «Подкова». Столы сдвинуты к стенам', shot: 'wide', act: (s) => (s.scene!.dist = 1.9) },
        { who: 1, text: `Двадцатое число через ${Math.max(1, a.start + 19 - c.day)} дн. А у вас, сколько я знаю, не хватает $${a.debt}.`, shot: 'group' },
        { who: 1, text: 'Предлагаю по-старому. Я двадцать лет не выходил. Победишь — долга нет. Нет — ключи на стол.', shot: 'group' },
        { who: null, text: 'Гусь снимает кожанку и вешает на стул', shot: 'close0', dur: 2.2 },
      ];
  return { map: MAP_BY_ID.bar, a: P(f, 0), b: P(g, 1), dist: 3, extra: { p: P(kirpich(c, f), 1), side: 0.8 }, names: { extra: 'Кирпич' }, lines };
}

function sceneGusDown(c: Career, f: CareerFighter, a: Act1): SceneSpec {
  const lines: SceneLine[] = [
    { who: null, text: 'Гусь сидит на полу, вытирает рот', shot: 'top' },
    { who: 1, text: 'Квиты. И вот что, парень. Не Михалыч был должен. Долг купил Шрам. За старика. Чтобы подвал достался ему.', shot: 'low' },
  ];
  if (a.plan === 'bold') lines.push({ who: 1, text: 'Ты мне сразу понравился. Если Шрам полезет ещё — позвони.', shot: 'over1' });
  return {
    map: MAP_BY_ID.bar, a: P(f, 0), b: P(gus(c, f), 1), dist: 1.5,
    start: (s) => {
      s.fighters[1].out = true;
      s.knockDown(s.fighters[1], 'нокаут', 'back', 'l');
    },
    lines,
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
      a.done.push('s4');
      if (r.won) {
        a.debt = Math.max(0, a.debt - 500);
        a.pending = 's4b';
        f2.fame += 2;
        return { lines: [`Кирпич на земле. Гусь списывает $500: долг $${a.debt}`], scene: scene4down(c2, f2) };
      }
      a.debt += 300;
      out(c2, f2, 2, 'отходит после подворотни');
      return { lines: [`Кирпич оказался сильнее. Долг +$300: теперь $${a.debt}. Гусь: «Ничего. Двадцатое всё равно наступит».`, `${short(f2)} 2 дня лечится`] };
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
  opts: Opt[];
}

const CARDS: Card[] = [
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
        return { lines: ['Гусь: «Разумно. По понедельникам, сто пятьдесят. Остальное — двадцатого». Каждый понедельник $150'] };
      } },
      { id: 'bold', label: '«Михалыч тебе ничего не должен»', run: (_c, a) => {
        a.plan = 'bold';
        a.debt += 200;
        a.flags.gusView = 3;
        return { lines: [`Гусь улыбается: «Тогда двадцатого — вся сумма. И процент за дерзость». Долг $${a.debt}`] };
      } },
      { id: 'sport', label: '«Давай решим по-спортивному»', run: (c, a) => {
        a.plan = 'sport';
        a.flags.gusView = 2;
        a.kirpichDay = a.start + 4;
        return { lines: ['Гусь оглядывается: «Кирпич, слышал? В пятницу, в подворотне». Бой с Кирпичом — на 5-й день'] };
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
      { id: 'skip', label: 'Не идти', run: (_c, a) => {
        a.debt += 200;
        a.done.push('s4');
        return { lines: [`Гусь недоволен: «Неуважение стоит денег». Долг $${a.debt}`] };
      } },
    ],
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
    text: (_c, a) => (a.debt > 0 ? `Гусь ждёт в «Подкове». Долг ещё $${a.debt}. Он предлагает решить по-старому — на кулаках.` : 'Долг отдан, но Гусь всё равно зовёт в «Подкову»: поговорить.'),
    scene: (c, f, a) => scene8(c, f, a),
    opts: [
      { id: 'fight', label: '«Дерёмся»', no: (c, a, f) => (a.debt <= 0 ? 'долг уже отдан' : f.busyUntil > c.day ? `${short(f)} ещё не готов` : null), run: (c, a, f) => ({ lines: [], fight: gusFight(c, a, f, false) }) },
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
  // The 20th has passed and nothing was settled: the basement goes.
  if (actDay(c, a) > 20 && !a.ending) {
    const r = finish(c, a, a.debt > 0 ? 'lost' : 'ours', [a.debt > 0 ? 'Двадцатое прошло. Долг не отдан — подвал забирают' : 'Двадцатое прошло. Долг отдан']);
    if (a.pending && a.pending !== 'end') a.pending = 'end';
    out.push(...r.lines);
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
    film: !!card.scene, watched: a.seen.includes(card.id),
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
  if (!a.pending) act1Check(c);
  save(c);
  return r;
}

export function act1FightDone(c: Career, f: CareerFighter, fight: A1Fight, r: FightResult): { lines: string[]; scene?: SceneSpec } {
  const a = act(c)!;
  fightToll(f);
  const res = fight.after(c, f, r);
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
