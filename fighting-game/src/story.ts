// The career's story lines (user: the campaign had no story). Five lines run side by side,
// a chapter at a time: an old debt and the collector Гусь, the champion who sneers at us,
// the bookmaker Лис and a fixed fight, a kid at the door, and the rival gym «Железный
// кулак». A chapter is a card on the home screen with choices; some choices start a fight
// with a scene before it (talkCut). One open chapter at a time, a few days apart.
import { known } from './clubs';
import {
  makeFighter, short, value, rating, champOf, classOf, rankOf, save, afterFight, addRel, MAX_ROSTER,
  type Career, type CareerFighter, type Tier, type FightResult,
} from './career';
import { addMood } from './life';
import type { MapId } from './maps';
import { WCLASSES } from './career';

export interface StoryState {
  done: string[];
  /** Day each chapter was played. */
  at: Record<string, number>;
  flags: Record<string, number>;
  /** People of the story who fight: kept so they come back as the same men. */
  npc: Record<string, CareerFighter>;
  pending?: string;
  last: number;
}

export interface StoryFight {
  opp: CareerFighter;
  tier: Tier;
  title: string;
  /** The scene before it: who says what (0 ours, 1 him, null a caption). */
  talk: { who: 0 | 1 | null; text: string }[];
  /** A real bout (counts in his record, pays a purse). */
  official?: boolean;
  titleFight?: boolean;
  after(c: Career, f: CareerFighter, r: FightResult): string[];
}

export interface StoryOut {
  lines: string[];
  fight?: StoryFight;
}

interface Opt {
  id: string;
  label: string;
  /** Why it cannot be chosen now, if so. */
  no?: (c: Career, f: CareerFighter) => string | null;
  run(c: Career, s: StoryState, f: CareerFighter): StoryOut;
}

interface Chapter {
  id: string;
  line: string;
  title: string;
  who: string;
  when(c: Career, s: StoryState, f: CareerFighter): boolean;
  text(c: Career, s: StoryState, f: CareerFighter): string;
  opts: Opt[];
}

export const LINE_NAME: Record<string, string> = {
  debt: '💸 Долг',
  rival: '👑 Чемпион',
  fix: '🦊 Букмекер',
  kid: '🧒 Пацан',
  gym: '🏚 Война залов',
};

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export function story(c: Career): StoryState {
  c.story ??= { done: [], at: {}, flags: {}, npc: {}, last: 0 };
  return c.story;
}

export const main = (c: Career) => c.roster.find((x) => x.id === c.pick) ?? c.roster[0];
/** The makeFighter level that gives about his rating (rating ≈ 17 + 67 × level). */
export const levelOf = (f: CareerFighter) => clamp((rating(f) - 17) / 67, 0, 1);
const since = (c: Career, s: StoryState, id: string) => (s.at[id] === undefined ? -1 : c.day - s.at[id]);
const did = (s: StoryState, id: string) => s.done.includes(id);

/** A place to fight a story fight: rounds or none. */
export function place(map: MapId, rounds: number, purse: [number, number] = [0, 0]): Tier {
  return {
    id: 'story', name: 'Сюжет', desc: '', map,
    rules: rounds ? { roundLen: 180, clock: 3, rounds, tough: 1.4, standing: true } : { roundLen: 0, rounds: 0, tough: 1, standing: true },
    level: [0, 0], fame: 0, purse, fee: 0, prize: 0, tokens: 0, size: 8,
  };
}

/** A man of the story, made once and kept. */
export function npc(c: Career, s: StoryState, key: string, make: () => CareerFighter, f?: CareerFighter): CareerFighter {
  // One made too strong (before the level fix) is made again.
  const old = s.npc[key];
  if (old && f && rating(old) > rating(f) + 10) delete s.npc[key];
  return (s.npc[key] ??= make());
}

/** A story opponent about as good as ours, `d` levels better (0.05 ≈ 3 rating points), never above `cap`. */
export function heavy(f: CareerFighter, d: number, name: string, disc: CareerFighter['discipline'], skin?: CareerFighter['skin'], cap = 1): CareerFighter {
  const m = makeFighter(clamp(Math.min(levelOf(f) + d, cap), 0.02, 1), 0.5, classOf(f));
  m.name = name;
  m.discipline = disc;
  if (skin) m.skin = skin;
  return m;
}

/** Days the fighter is out (hurt, in a cell...); a booking in that time is dropped. */
function away(c: Career, f: CareerFighter, days: number, what: string): string[] {
  const out: string[] = [];
  f.busyFrom = c.day;
  f.busyUntil = Math.max(f.busyUntil, c.day + days);
  f.busyWhat = what;
  f.session = undefined;
  f.queue = [];
  for (const e of c.events) if (e.f === f.id && !e.done && e.day < c.day + days && e.day >= c.day) {
    e.f = undefined;
    e.opp = undefined;
    out.push(`${short(f)} пропускает бой: запись снята`);
  }
  return out;
}

// ---------- The chapters ----------

const CHAPTERS: Chapter[] = [
  // --- The debt ---
  {
    id: 'debt1', line: 'debt', title: 'Гость из прошлого', who: 'Гусь',
    when: (c) => c.day >= 3,
    text: () => 'В зал заходит лысый мужик в кожанке, за ним двое. «Я Гусь. Прошлый хозяин этого подвала задолжал моим людям полторы тысячи. Подвал теперь твой — значит, и долг твой.»',
    opts: [
      { id: 'pay', label: 'Платить по $150 в неделю', run: (c, s) => {
        s.flags.debt = 1500;
        s.flags.debtPay = 1;
        s.flags.debtDay = c.day + 7;
        return { lines: ['Гусь кивает: «Каждый понедельник. Не опаздывай.» Долг $1500'] };
      } },
      { id: 'no', label: '«Я ничего не должен»', run: (_c, s) => {
        s.flags.debt = 1500;
        s.flags.debtAngry = 1;
        return { lines: ['Гусь улыбается: «Посмотрим.» Долг $1500, Гусь злится'] };
      } },
    ],
  },
  {
    id: 'debt2', line: 'debt', title: 'Человек Гуся', who: 'Гусь',
    when: (c, s) => did(s, 'debt1') && (s.flags.debt ?? 0) > 0 && since(c, s, 'debt1') >= (s.flags.debtAngry ? 5 : 10),
    text: (c, s, f) => `Гусь снова здесь, с ним здоровяк по кличке Кирпич. «Долг $${s.flags.debt}. Давай по-спортивному: Кирпич и твой ${short(f)}, один на один. Твой победит — спишу половину. Проиграет — долг плюс пятьсот.»`,
    opts: [
      { id: 'fight', label: 'Принять бой в подворотне', no: (c, f) => (f.busyUntil > c.day ? `${short(f)} сегодня занят` : null), run: (c, s, f) => {
        const opp = npc(c, s, 'brick', () => heavy(f, 0.02, 'Кирпич «Бетон» Громов', 'street', 'robot', 0.15), f);
        return { lines: [], fight: {
          opp, tier: place('alley', 0), title: `Долг Гусю: ${short(f)} против Кирпича`,
          talk: [{ who: null, text: 'Подворотня за баром, полночь' }, { who: 1, text: 'Гусь сказал — не убивать. Сильно.' }, { who: 0, text: 'Посмотрим, кто кого.' }],
          after: (c2, f2, r) => {
            if (r.won) {
              s.flags.debt = Math.round((s.flags.debt ?? 0) / 2);
              f2.fame += 3;
              addMood(f2, 10);
              return [`Кирпич лежит. Гусь сплёвывает: «Половина — твоя.» Долг $${s.flags.debt}, известность +3`];
            }
            s.flags.debt = (s.flags.debt ?? 0) + 500;
            addMood(f2, -10);
            return [`Кирпич оказался крепче. Долг вырос до $${s.flags.debt}`, ...away(c2, f2, 2, 'отходит после подворотни')];
          },
        } };
      } },
      { id: 'pay', label: 'Отдать $500 сразу', no: (c) => (c.money < 500 ? 'нет $500' : null), run: (c, s) => {
        c.money -= 500;
        s.flags.debt = Math.max(0, (s.flags.debt ?? 0) - 500);
        return { lines: [`Отдал $500. Гусь доволен. Долг $${s.flags.debt}`] };
      } },
    ],
  },
  {
    id: 'debt3', line: 'debt', title: 'Последний разговор', who: 'Гусь',
    when: (c, s) => did(s, 'debt2') && (s.flags.debt ?? 0) > 0 && since(c, s, 'debt2') >= 10,
    text: (c, s, f) => `Гусь приходит один, снимает кожанку. «Надоело. Я сам когда-то дрался. Выйдет ${short(f)} против меня в баре «Подкова». Победит — долга нет, и ещё штука сверху. Нет — отдашь всё, что должен, до копейки.»`,
    opts: [
      { id: 'fight', label: 'Бой в «Подкове»', no: (c, f) => (f.busyUntil > c.day ? `${short(f)} сегодня занят` : null), run: (c, s, f) => {
        const opp = npc(c, s, 'goose', () => heavy(f, 0.05, 'Гусь «Кожанка» Бугров', 'boxing', 'biker', 0.25), f);
        return { lines: [], fight: {
          opp, tier: place('bar', 0), title: `${short(f)} против Гуся`,
          talk: [{ who: null, text: 'Бар «Подкова». Столы сдвинуты к стенам' }, { who: 1, text: 'Я двадцать лет выбиваю долги. Знаешь, почему меня зовут Гусь?' }, { who: 0, text: 'Потому что шипишь?' }, { who: 1, text: 'Потому что щиплю до крови.' }],
          after: (c2, f2, r) => {
            if (r.won) {
              s.flags.debt = 0;
              c2.money += 1000;
              f2.fame += 5;
              addMood(f2, 15);
              return ['Гусь сидит на полу, вытирает кровь: «Квиты. И держи — заслужил.» Долга нет, +$1000, известность +5'];
            }
            const d = s.flags.debt ?? 0;
            c2.money = Math.max(0, c2.money - d);
            s.flags.debt = 0;
            addMood(f2, -12);
            return [`Гусь забрал своё: −$${d}. Долга больше нет, но осадок остался`, ...away(c2, f2, 3, 'залечивает бой с Гусём')];
          },
        } };
      } },
      { id: 'pay', label: (() => 'Отдать весь долг')(), no: (c) => (c.money < (c.story?.flags.debt ?? 0) ? 'не хватает денег' : null), run: (c, s) => {
        c.money -= s.flags.debt ?? 0;
        const d = s.flags.debt;
        s.flags.debt = 0;
        return { lines: [`Отдал Гусю $${d}. «Приятно иметь с тобой дело.» Долга нет`] };
      } },
    ],
  },

  // --- The champion ---
  {
    id: 'rival1', line: 'rival', title: 'Пресс-конференция', who: 'Чемпион',
    when: (c, _s, f) => known(c) && c.day >= 6 && f.fame >= 12 && !!champOf(c, classOf(f)),
    text: (c, _s, f) => {
      const ch = champOf(c, classOf(f))!;
      return `На пресс-конференции чемпион ${short(ch)} кивает на нашего бойца: «${short(f)}? Это кто? Я таких на разминке роняю. Пусть сначала научится стоять.» Зал смеётся.`;
    },
    opts: [
      { id: 'bold', label: '«Скоро пояс будет моим»', run: (c, s, f) => {
        const ch = champOf(c, classOf(f))!;
        s.flags.rivalId = 1;
        s.npc.champ = ch;
        addRel(c, f, ch, -40);
        f.fame += 3;
        return { lines: [`Зал взрывается. ${short(ch)} больше не смеётся. Известность +3, вражда с чемпионом`] };
      } },
      { id: 'quiet', label: 'Промолчать', run: (c, s, f) => {
        s.npc.champ = champOf(c, classOf(f))!;
        addMood(f, -6);
        return { lines: [`${short(f)} проглотил. Настроение хуже`] };
      } },
    ],
  },
  {
    id: 'rival2', line: 'rival', title: 'Засада', who: 'Люди чемпиона',
    when: (c, s, f) => did(s, 'rival1') && since(c, s, 'rival1') >= 7 && f.fame >= 22,
    text: (_c, s, f) => `${short(f)} выходит из зала поздно вечером. У дверей ждут двое в капюшонах. «${s.npc.champ ? short(s.npc.champ) : 'Чемпион'} передаёт привет. Пояс тебе не нужен.»`,
    opts: [
      { id: 'fight', label: 'Драться', no: (c, f) => (f.busyUntil > c.day ? `${short(f)} сегодня занят` : null), run: (c, s, f) => {
        const opp = heavy(f, 0, 'Громила в капюшоне', 'street', 'zombie');
        return { lines: [], fight: {
          opp, tier: place('alley', 0), title: `Засада: ${short(f)} против громилы`,
          talk: [{ who: null, text: 'Задний двор зала, фонарь мигает' }, { who: 1, text: 'Ничего личного. Работа.' }, { who: 0, text: 'Тогда и у меня — работа.' }],
          after: (c2, f2, r) => {
            if (r.won) {
              f2.fame += 4;
              addMood(f2, 12);
              if (s.npc.champ) addRel(c2, f2, s.npc.champ, -20);
              return ['Второй сбежал сам. Видео с камеры у бара разлетелось по сети: известность +4'];
            }
            addMood(f2, -10);
            return ['Их было двое. Сломанное ребро', ...away(c2, f2, 5, 'лечит рёбра после засады')];
          },
        } };
      } },
      { id: 'run', label: 'Уйти через чёрный ход', run: (_c, _s, f) => {
        addMood(f, -10);
        return { lines: [`${short(f)} ушёл, но злится на себя`] };
      } },
    ],
  },
  {
    id: 'rival3', line: 'rival', title: 'Пояс зовёт', who: 'Чемпион',
    when: (c, s, f) => did(s, 'rival2') && since(c, s, 'rival2') >= 8 && (rankOf(c, f) <= 5 || since(c, s, 'rival2') >= 25),
    text: (c, s, f) => {
      const ch = champOf(c, classOf(f)) ?? s.npc.champ;
      return `${ch ? short(ch) : 'Чемпион'} выходит в эфир: «Ладно, ${short(f)}. Хочешь пояс — приходи и возьми. Через неделю никто не вспомнит твоё имя.» Промоутеры готовы поставить бой хоть завтра.`;
    },
    opts: [
      { id: 'fight', label: 'Бой за пояс', no: (c, f) => (f.busyUntil > c.day ? `${short(f)} ещё не готов` : null), run: (c, s, f) => {
        const ch = champOf(c, classOf(f)) ?? s.npc.champ!;
        if (ch === f) return { lines: [`${short(f)} уже чемпион — вызов смешон`] };
        return { lines: [], fight: {
          opp: ch, tier: place('ring', 5), title: `Бой за пояс: ${short(f)} против ${short(ch)}`, official: true, titleFight: true,
          talk: [{ who: null, text: 'Полный зал. Пояс на столе' }, { who: 1, text: 'Я помню, как ты молчал на пресс-конференции.' }, { who: 0, text: 'Сегодня говорить будут руки.' }],
          after: (_c2, f2, r) => (r.won ? [`${short(f2)} забрал пояс у человека, который над ним смеялся`] : [`${short(ch)} оставил пояс себе. Но это не конец`]),
        } };
      } },
      { id: 'wait', label: 'Ещё не время', run: (_c, _s, f) => {
        f.fame = Math.max(0, f.fame - 4);
        return { lines: ['Пресса пишет, что мы испугались. Известность −4'] };
      } },
    ],
  },

  // --- The bookmaker ---
  {
    id: 'fix1', line: 'fix', title: 'Предложение', who: 'Лис',
    when: (c, _s, f) => known(c) && c.day >= 12 && f.fame >= 8 && c.events.some((e) => e.f === f.id && !e.done && e.day > c.day),
    text: (_c, _s, f) => `Вечером звонит вкрадчивый голос: «Меня зовут Лис. На следующем бою ${short(f)} ляжет. Тихо, красиво. Тысяча двести наличными. Подумай.»`,
    opts: [
      { id: 'yes', label: 'Согласиться ($1200)', run: (_c, s) => {
        s.flags.fix = 1;
        return { lines: ['Лис: «Умный человек.» Следующий бой должен быть проигран'] };
      } },
      { id: 'no', label: 'Послать Лиса', run: (_c, s) => {
        s.flags.fixNo = 1;
        return { lines: ['Лис: «Жаль. Тогда сделаем иначе.»'] };
      } },
    ],
  },
  {
    id: 'fix2', line: 'fix', title: 'Подставной соперник', who: 'Лис',
    when: (c, s) => did(s, 'fix1') && (s.flags.fixNo === 1 || s.flags.fixBroken === 1) && since(c, s, 'fix1') >= 5,
    text: (_c, s, f) => s.flags.fixBroken
      ? `Лис потерял на ставках кучу денег: ${short(f)} выиграл бой, который должен был слить. «Ты мне должен. Мой человек выйдет против тебя — честно. Почти.»`
      : `Лис нашёл способ: он заплатил организаторам, и следующий соперник ${short(f)} — «случайный» парень, который на голову сильнее. Бой уже стоит в афише.`,
    opts: [
      { id: 'fight', label: 'Выйти на бой', no: (c, f) => (f.busyUntil > c.day ? `${short(f)} сегодня занят` : null), run: (c, s, f) => {
        const opp = heavy(f, 0.08, 'Тихон «Подстава» Лисин', pick(['kickboxing', 'muaythai', 'mma']));
        return { lines: [], fight: {
          opp, tier: place('ring', 3, [600, 150]), title: `Подстава Лиса: ${short(f)} против ${short(opp)}`, official: true,
          talk: [{ who: null, text: 'Ринг. Лис в первом ряду' }, { who: 1, text: 'Ничего личного. Мне просто хорошо заплатили.' }, { who: 0, text: 'Мне тоже. За то, чтобы ты лёг.' }],
          after: (_c2, f2, r) => {
            if (r.won) {
              f2.fame += 6;
              s.flags.foxDone = 1;
              return ['Подстава не сработала: зал ревёт, Лис ушёл до конца боя. Известность +6'];
            }
            return ['Подставной оказался слишком хорош. Лис улыбается из первого ряда'];
          },
        } };
      } },
      { id: 'drop', label: 'Сняться с боя', run: (_c, _s, f) => {
        f.fame = Math.max(0, f.fame - 5);
        return { lines: ['Снялись. Пишут, что испугались. Известность −5'] };
      } },
    ],
  },
  {
    id: 'fix3', line: 'fix', title: 'Слухи', who: 'Журналист',
    when: (c, s) => did(s, 'fix1') && s.flags.fixPaid === 1 && since(c, s, 'fix1') >= 4,
    text: (_c, _s, f) => `Журналист звонит: «У меня запись вашего разговора с Лисом про бой, где ${short(f)} лёг. Напечатать или договоримся?»`,
    opts: [
      { id: 'pay', label: 'Заплатить $500 за молчание', no: (c) => (c.money < 500 ? 'нет $500' : null), run: (c) => {
        c.money -= 500;
        return { lines: ['Запись удалена. Наверное'] };
      } },
      { id: 'no', label: 'Пусть печатает', run: (c, _s, f) => {
        f.fame = Math.max(0, f.fame - 12);
        addMood(f, -15);
        return { lines: ['Скандал: «Договорной бой!» Известность −12, настроение на нуле'] };
      } },
    ],
  },

  // --- The kid ---
  {
    id: 'kid1', line: 'kid', title: 'Пацан у дверей', who: 'Тимоха',
    when: (c) => c.day >= 9 && c.roster.length < MAX_ROSTER,
    text: () => 'Уже неделю худой парень лет восемнадцати стоит у окна зала и повторяет движения. «Возьмите меня. Денег нет. Но я буду пахать больше всех.»',
    opts: [
      { id: 'take', label: 'Взять бесплатно', no: (c) => (c.roster.length >= MAX_ROSTER ? 'команда полна' : null), run: (c, s) => {
        const k = makeFighter(0.0, 0.92, WCLASSES[0]);
        k.name = 'Тимоха «Малой» Решетников';
        k.story = 'Пришёл с улицы, неделю простоял у окна зала. Денег нет, таланта — вагон.';
        k.traits = ['grinder', 'loyal'];
        k.mood = 60;
        c.roster.push(k);
        s.flags.kidId = 1;
        s.npc.kid = k;
        return { lines: ['Тимоха в команде. Пашет с утра до ночи'] };
      } },
      { id: 'no', label: 'Прогнать', run: () => ({ lines: ['Пацан ушёл. Говорят, его взял «Железный кулак»'] }) },
    ],
  },
  {
    id: 'kid2', line: 'kid', title: 'Спарринг', who: 'Тимоха',
    when: (c, s) => did(s, 'kid1') && !!s.flags.kidId && c.roster.some((x) => x === s.npc.kid || x.id === s.npc.kid?.id) && since(c, s, 'kid1') >= 12,
    text: (c, s) => {
      const vet = c.roster.filter((x) => x.id !== s.npc.kid?.id).sort((a, b) => rating(b) - rating(a))[0];
      return `Тимоха просит спарринг со старшим${vet ? ` (${short(vet)})` : ''}: «Хочу понять, как дерутся настоящие.»`;
    },
    opts: [
      { id: 'yes', label: 'Пусть старший его поучит', run: (c, s) => {
        const kid = c.roster.find((x) => x.id === s.npc.kid?.id);
        const vet = c.roster.filter((x) => x !== kid).sort((a, b) => rating(b) - rating(a))[0];
        if (!kid) return { lines: [] };
        for (const k of ['skill', 'evasion', 'mindSpeed'] as const) kid.stats[k] = Math.min(kid.caps[k], kid.stats[k] + 0.04);
        if (vet) {
          vet.tonus = Math.min(100, (vet.tonus ?? 60) + 12);
          addMood(vet, 6);
        }
        return { lines: [`Тимоха получил по шее и многое понял: техника, уклоны, реакция подросли${vet ? `. ${short(vet)} в тонусе` : ''}`] };
      } },
      { id: 'no', label: 'Рано ему', run: (c, s) => {
        const kid = c.roster.find((x) => x.id === s.npc.kid?.id);
        if (kid) addMood(kid, -10);
        return { lines: ['Тимоха расстроился'] };
      } },
    ],
  },

  // --- The gym war ---
  {
    id: 'gym1', line: 'gym', title: '«Железный кулак»', who: 'Шрам',
    when: (c) => c.day >= 7,
    text: (_c, _s, f) => `В зал заходит Шрам, хозяин «Железного кулака» — лучшего зала района. «Продай мне своего бойца — ${short(f)}. Дам вдвое больше, чем он стоит. Всё равно у тебя он сгниёт в этом подвале.»`,
    opts: [
      { id: 'sell', label: (() => 'Продать (×2 цены)')(), no: (c) => (c.roster.length < 2 ? 'он у тебя один' : null), run: (c, _s, f) => {
        const price = value(f) * 2;
        c.money += price;
        c.roster = c.roster.filter((x) => x !== f);
        for (const e of c.events) if (e.f === f.id && !e.done) e.f = undefined;
        c.pick = c.roster[0].id;
        (c.world ??= []).push(f);
        return { lines: [`${short(f)} ушёл в «Железный кулак». +$${price}`] };
      } },
      { id: 'no', label: '«Он не продаётся»', run: (_c, s) => {
        s.flags.war = 1;
        return { lines: ['Шрам: «Тогда мы вас раздавим.» Война залов началась'] };
      } },
    ],
  },
  {
    id: 'gym2', line: 'gym', title: 'Вызов', who: 'Шрам',
    when: (c, s) => s.flags.war === 1 && since(c, s, 'gym1') >= 6,
    text: (_c, _s, f) => `Боец «Железного кулака» публично вызывает нашего — ${short(f)}: «Подвальные крысы. Один бой — и все узнают, чего вы стоите.» Ставка $500.`,
    opts: [
      { id: 'fight', label: 'Принять вызов', no: (c, f) => (f.busyUntil > c.day ? `${short(f)} сегодня занят` : null), run: (c, s, f) => {
        const opp = npc(c, s, 'iron1', () => heavy(f, 0.04, 'Борис «Кувалда» Железнов', 'mma'), f);
        return { lines: [], fight: {
          opp, tier: place('dojo', 3, [500, 0]), title: `Война залов: ${short(f)} против ${short(opp)}`, official: true,
          talk: [{ who: null, text: 'Зал «Железного кулака». Обе команды у ринга' }, { who: 1, text: 'Из подвала — в подвал.' }, { who: 0, text: 'Посмотрим, кто будет мыть пол.' }],
          after: (_c2, f2, r) => {
            if (r.won) {
              f2.fame += 5;
              return ['«Железный кулак» молчит. Подвал празднует. Известность +5'];
            }
            addMood(f2, -10);
            return ['Шрам ухмыляется: «Я же говорил.»'];
          },
        } };
      } },
      { id: 'no', label: 'Отказаться', run: (_c, _s, f) => {
        f.fame = Math.max(0, f.fame - 3);
        addMood(f, -6);
        return { lines: ['Над нами смеётся весь район. Известность −3'] };
      } },
    ],
  },
  {
    id: 'gym3', line: 'gym', title: 'Переманивание', who: 'Шрам',
    when: (c, s) => did(s, 'gym2') && since(c, s, 'gym2') >= 8 && c.roster.length > 1,
    text: (c) => {
      const w = [...c.roster].sort((a, b) => (a.mood ?? 0) - (b.mood ?? 0))[0];
      return `${short(w)} получил звонок от Шрама: зарплата вдвое больше, если перейдёт в «Железный кулак». ${short(w)} думает.`;
    },
    opts: [
      { id: 'bonus', label: 'Премия $300, чтобы остался', no: (c) => (c.money < 300 ? 'нет $300' : null), run: (c) => {
        const w = [...c.roster].sort((a, b) => (a.mood ?? 0) - (b.mood ?? 0))[0];
        c.money -= 300;
        addMood(w, 35);
        return { lines: [`${short(w)} остаётся: «Своих не бросают.»`] };
      } },
      { id: 'talk', label: 'Поговорить по душам', run: (c) => {
        const w = [...c.roster].sort((a, b) => (a.mood ?? 0) - (b.mood ?? 0))[0];
        if ((w.mood ?? 0) > -10 || (w.traits ?? []).includes('loyal')) {
          addMood(w, 15);
          return { lines: [`${short(w)} остаётся`] };
        }
        c.roster = c.roster.filter((x) => x !== w);
        for (const e of c.events) if (e.f === w.id && !e.done) e.f = undefined;
        if (c.pick === w.id) c.pick = c.roster[0].id;
        (c.world ??= []).push(w);
        return { lines: [`${short(w)} ушёл в «Железный кулак»`] };
      } },
    ],
  },
  {
    id: 'gym4', line: 'gym', title: 'Последний бой за район', who: 'Шрам',
    when: (c, s) => did(s, 'gym3') && since(c, s, 'gym3') >= 8,
    text: (_c, _s, f) => `Шрам ставит всё: «Мой лучший против твоего лучшего. Проиграю — закрываю зал, тренажёры твои. Проиграешь — уберёшься из района.» ${short(f)} готов.`,
    opts: [
      { id: 'fight', label: 'Финальный бой', no: (c, f) => (f.busyUntil > c.day ? `${short(f)} ещё не готов` : null), run: (c, s, f) => {
        const opp = npc(c, s, 'iron2', () => heavy(f, 0.07, 'Шрам-младший «Сталь» Железнов', 'muaythai'), f);
        return { lines: [], fight: {
          opp, tier: place('cage', 3, [800, 0]), title: `Последний бой за район: ${short(f)} против ${short(opp)}`, official: true,
          talk: [{ who: null, text: 'Клетка. Весь район пришёл смотреть' }, { who: 1, text: 'Отец сказал: после боя ваш подвал станет складом.' }, { who: 0, text: 'Твой отец много говорит.' }],
          after: (_c2, f2, r) => {
            if (r.won) {
              s.flags.iron = 1;
              f2.fame += 8;
              return ['«Железный кулак» закрыт. Шрам отдал ключи: его зал теперь твой (в зале выбери «Железный кулак», бесплатно). Известность +8'];
            }
            addMood(f2, -15);
            s.flags.ironLost = 1;
            return ['Проиграли. Шрам празднует, но район помнит, что подвал не сдался'];
          },
        } };
      } },
      { id: 'no', label: 'Не сейчас', run: () => ({ lines: ['Шрам ждёт. Он подождёт ещё'] }) },
    ],
  },
];

const BY_ID = Object.fromEntries(CHAPTERS.map((ch) => [ch.id, ch]));

/** The open chapter, if any. */
export function pendingChapter(c: Career): { id: string; line: string; lineName: string; title: string; who: string; text: string; opts: { id: string; label: string; no: string | null }[]; status: string } | null {
  const s = story(c);
  const ch = s.pending ? BY_ID[s.pending] : null;
  const f = main(c);
  if (!ch || !f) return null;
  const status = (s.flags.debt ?? 0) > 0 && ch.line === 'debt' ? `Долг Гусю: $${s.flags.debt}` : '';
  return {
    id: ch.id, line: ch.line, lineName: LINE_NAME[ch.line], title: ch.title, who: ch.who, text: ch.text(c, s, f),
    opts: ch.opts.map((o) => ({ id: o.id, label: o.label, no: o.no?.(c, f) ?? null })),
    status,
  };
}

/** Opens the next chapter if it is time (called at midnight and when the career opens). */
export function storyCheck(c: Career): string[] {
  // While act 1 runs, its scenes are the story.
  if (c.act1 && !c.act1.ending) return [];
  if (c.act2 && !c.act2.ending) return [];
  const s = story(c);
  if (s.pending || c.day - s.last < 3) return [];
  const f = main(c);
  if (!f) return [];
  // Lines take turns: the one played least recently first.
  const lastOf = (line: string) => Math.max(-1, ...CHAPTERS.filter((x) => x.line === line && s.at[x.id] !== undefined).map((x) => s.at[x.id]));
  const cands = CHAPTERS.filter((ch) => !did(s, ch.id) && ch.when(c, s, f));
  // Only the first open chapter of each line.
  const firsts = cands.filter((ch) => !cands.some((o) => o.line === ch.line && CHAPTERS.indexOf(o) < CHAPTERS.indexOf(ch)));
  firsts.sort((a, b) => lastOf(a.line) - lastOf(b.line));
  const ch = firsts[0];
  if (!ch) return [];
  s.pending = ch.id;
  return [`📖 ${LINE_NAME[ch.line]}: «${ch.title}»`];
}

/** Weekly payments and other things a story does by itself, at midnight. */
export function storyDay(c: Career): string[] {
  const s = story(c);
  const out: string[] = [];
  if (s.flags.debtPay && (s.flags.debt ?? 0) > 0 && c.day >= (s.flags.debtDay ?? 0)) {
    s.flags.debtDay = c.day + 7;
    if (c.money >= 150) {
      c.money -= 150;
      s.flags.debt = Math.max(0, (s.flags.debt ?? 0) - 150);
      out.push(`Платёж Гусю $150. Осталось $${s.flags.debt}${s.flags.debt ? '' : ' — долг закрыт!'}`);
    } else {
      s.flags.debtAngry = 1;
      s.flags.debt = (s.flags.debt ?? 0) + 100;
      out.push(`Нечем платить Гусю: долг +$100 (теперь $${s.flags.debt}). Гусь злится`);
    }
  }
  out.push(...storyCheck(c));
  return out;
}

/** The manager's choice in the open chapter. */
export function storyChoose(c: Career, opt: string): StoryOut {
  const s = story(c);
  const ch = s.pending ? BY_ID[s.pending] : null;
  const f = main(c);
  if (!ch || !f) return { lines: [] };
  const o = ch.opts.find((x) => x.id === opt);
  if (!o) return { lines: [] };
  const why = o.no?.(c, f);
  if (why) return { lines: [why] };
  const out = o.run(c, s, f);
  s.pending = undefined;
  s.done.push(ch.id);
  s.at[ch.id] = c.day;
  s.last = c.day;
  c.log.unshift(...out.lines.map((x) => `📖 ${x}`));
  save(c);
  return out;
}

/** After a story fight: records and purse for a real bout, then what the story makes of it. */
export function storyFightDone(c: Career, f: CareerFighter, sf: StoryFight, r: FightResult): string[] {
  const out: string[] = [];
  if (sf.official) out.push(...afterFight(c, f, sf.tier, sf.opp, r, false, !!sf.titleFight));
  out.push(...sf.after(c, f, r));
  c.log.unshift(...out.map((x) => `📖 ${x}`));
  save(c);
  return out;
}

/** Any career fight: the bookmaker's deal is settled here. */
export function storyAfterFight(c: Career, f: CareerFighter, won: boolean): string[] {
  const s = c.story;
  if (!s?.flags.fix || f !== main(c)) return [];
  s.flags.fix = 0;
  if (!won) {
    c.money += 1200;
    s.flags.fixPaid = 1;
    addMood(f, -12);
    return ['Лис передал конверт: +$1200. На душе гадко'];
  }
  s.flags.fixBroken = 1;
  return ['Ты выиграл бой, который обещал слить. Лис этого не забудет'];
}
