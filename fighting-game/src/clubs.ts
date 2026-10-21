// Clubs and the ladder (user: different clubs with their own looks; competitions open one
// by one as part of the story; a weekly tournament where you meet club men and loners,
// paid for 1st-3rd; held over two days; before the final a club may send a man to beat you
// up). Design in the doc tab «Клубы и турниры».
import {
  makeFighter, rating, odds, short, save, STAT_INFO, WCLASSES,
  type Career, type CareerFighter, type StatKey, type Tier,
} from './career';
import { addMood } from './life';
import { energyOf } from './city';
import type { SkinId } from './skins';
import type { DisciplineId } from './disciplines';

export interface Club {
  id: string;
  name: string;
  /** Ladder stage it belongs to. */
  stage: number;
  motto: string;
  desc: string;
  /** Club colours: main, accent (CSS). */
  colors: [string, string];
  skin: SkinId;
  leader: string;
  members: CareerFighter[];
}

/** What the career keeps about the ladder and this week's tournament. */
export interface Ladder {
  /** Highest open stage (1 = the basement of «Подкова»). */
  stage: number;
  /** The weekly tournament is open to us (act 1 opens it). */
  open: boolean;
  clubs: Club[];
  cup: Cup | null;
  cupWins: number;
  /** Leaders beaten by ours (club ids). */
  beaten: string[];
  /** Past results, newest first. */
  history: string[];
}

export interface CupMatch {
  a: string;
  b: string;
  w: string | null;
  /** How it was decided: 'ring' (fought or watched), 'odds' (counted), 'forfeit'. */
  how?: 'ring' | 'odds' | 'forfeit';
}

/** A bet with the bookmaker of «Подкова» on one fight of the cup. */
export interface Bet {
  r: number;
  /** Fight index in its round (-1 = the bout for third place). */
  i: number;
  on: string;
  stake: number;
  /** The coefficient taken. */
  k: number;
  paid?: boolean;
}

/**
 * The cup of «Подкова» (user: tournaments felt weak; 16 men, a fight night every week, watch the
 * others' fights and bet on them, preparation before every fight). Four Saturdays in a row:
 * last 16, quarter-finals, semi-finals, the final (and the bout for third place). Winning it is
 * the way up the ladder; losing means signing up for the next one, two weeks after.
 */
export interface Cup {
  v: 2;
  /** Season number. */
  n: number;
  /** Career day of the first fight night (a Saturday); the next nights a week apart. */
  day: number;
  /** The 16 men (one place is a loner's until ours signs up). */
  entrants: CareerFighter[];
  ours: string | null;
  /** The bracket: rounds[0] last 16 ... rounds[3] the final; filled night by night. */
  rounds: CupMatch[][];
  third: CupMatch | null;
  done: boolean;
  bets: Bet[];
  /** Nights whose opening film was played. */
  seen: number[];
  /** The reminder call two days before (1 = due, 2 = heard). */
  call?: number;
  /** A club man waiting at the door before the final. */
  ambush?: { club: string; man: CareerFighter; settled: boolean };
}

export const CUP_FEE = 50;
export const CUP_PRIZE = [1000, 400, 150];
export const CUP_NIGHTS = 4;
export const CUP_ROUND_NAME = ['1/8 финала', 'Четвертьфиналы', 'Полуфиналы', 'Финал'];
/** The cup's place: the cellar of the bar. Rounds per night: 1, 3, 3, 5 (third place 3). */
export const CUP_TIER: Tier = {
  id: 'cup', name: 'Кубок «Подковы»', desc: '', map: 'bar',
  rules: { roundLen: 180, clock: 3, rounds: 1, tough: 1.2, standing: true },
  level: [0, 0.2], fame: 0, purse: [0, 0], fee: CUP_FEE, prize: CUP_PRIZE[0], tokens: 2, size: 16,
};
export const cupTier = (r: number): Tier => ({ ...CUP_TIER, rules: { ...CUP_TIER.rules, rounds: [1, 3, 3, 5][r] ?? 3 } });
/** A night fight at the door. */
export const STREET_TIER: Tier = {
  id: 'street', name: 'У подъезда', desc: '', map: 'alley',
  rules: { roundLen: 0, rounds: 0, tough: 1, standing: true },
  level: [0, 0], fame: 0, purse: [0, 0], fee: 0, prize: 0, tokens: 0, size: 8,
};

const DOW = (d: number) => (d - 1) % 7;
const SAT = 5;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));

// ---------- The clubs of the basement ----------

interface Man {
  name: string;
  level: number;
  disc: DisciplineId;
  weight: number;
  height: number;
  /** Stat multipliers: who he is. */
  tilt: Partial<Record<StatKey, number>>;
  story: string;
  legs?: number;
  aggression?: number;
}

const BIKERS: Man[] = [
  { name: 'Шатун «Хозяин дороги» Громов', level: 0.25, disc: 'street', weight: 104, height: 1.88, tilt: { strength: 1.18, bodySpeed: 0.9, cardio: 0.9 }, story: 'Лидер «Железных коней». Медленный, но один его хук кладёт. Говорит мало, курит в углу.', aggression: 0.7 },
  { name: 'Глушитель «Без тормозов» Рябов', level: 0.15, disc: 'street', weight: 88, height: 1.82, tilt: { strength: 1.08, skill: 0.85 }, story: 'Правая рука Шатуна. Злой, бьёт после гонга. Его ненавидит весь подвал.', aggression: 0.95 },
  { name: 'Ржавый «Бывший» Котельников', level: 0.12, disc: 'boxing', weight: 80, height: 1.78, tilt: { skill: 1.15, evasion: 1.1, cardio: 0.82 }, story: 'Бывший боксёр, выгнали из секции за пьянку. Защита хорошая, дыхалка — нет.' },
  { name: 'Шина «Медведь» Бурков', level: 0.06, disc: 'street', weight: 125, height: 1.97, tilt: { strength: 1.2, bodySpeed: 0.85, skill: 0.8 }, story: 'Огромный и неуклюжий новичок. Сила как у медведя.' },
  { name: 'Рита «Лиса» Ветрова', level: 0.1, disc: 'kickboxing', weight: 60, height: 1.68, tilt: { bodySpeed: 1.12, evasion: 1.12, strength: 0.85 }, story: 'Единственная у байкеров, кто бьёт ногами. Быстрая, в лёгком весе.', legs: 0.4 },
];

const FACTORY: Man[] = [
  { name: 'Палыч «Мастер» Сафонов', level: 0.24, disc: 'boxing', weight: 84, height: 1.76, tilt: { skill: 1.25, mindSpeed: 1.12, bodySpeed: 0.88, cardio: 0.9 }, story: 'Лидер «Цеха №5», мастер с тракторного. Учился у того же тренера, что и Михалыч. Техника и хитрость вместо скорости.' },
  { name: 'Сварщик «Двужильный» Зуев', level: 0.13, disc: 'mma', weight: 86, height: 1.8, tilt: { cardio: 1.25, strength: 1.05 }, story: 'Ни разу не устал. Работает в две смены и тренируется в третью.' },
  { name: 'Лёха «Близнец» Котов', level: 0.1, disc: 'boxing', weight: 76, height: 1.79, tilt: { bodySpeed: 1.05 }, story: 'Один из близнецов Котовых. Пока не начнут драться — не различишь.' },
  { name: 'Серый «Близнец» Котов', level: 0.1, disc: 'kickboxing', weight: 76, height: 1.79, tilt: { bodySpeed: 1.05 }, story: 'Второй из близнецов. Этот бьёт ногами.', legs: 0.3 },
  { name: 'Малой «Пацан» Лаптев', level: 0.03, disc: 'street', weight: 66, height: 1.72, tilt: { bodySpeed: 1.08 }, story: 'Ровесник Тимохи. Смотрит на наш подвал с интересом.' },
];

// ---------- The clubs of the district (stage 2, act 2) ----------

const IRON: Man[] = [
  { name: 'Кувалда «Правая рука» Ткачёв', level: 0.36, disc: 'muaythai', weight: 92, height: 1.86, tilt: { strength: 1.15, cardio: 1.1 }, story: 'Старший в «Железном кулаке» после Шрама. Спарринг-партнёр Стали. Бьёт коленями в клинче.', legs: 0.5 },
  { name: 'Гвоздь «Тихий» Лаврин', level: 0.28, disc: 'muaythai', weight: 72, height: 1.75, tilt: { skill: 1.15, evasion: 1.1 }, story: 'Молчит, кланяется перед боем, ломает рёбра локтем.', legs: 0.45 },
  { name: 'Бур «Сверло» Осипов', level: 0.25, disc: 'kickboxing', weight: 81, height: 1.8, tilt: { bodySpeed: 1.1 }, story: 'Быстрые лоу-кики. Шрам привёз его из другого города.', legs: 0.5 },
  { name: 'Стас «Мажор» Шрамов', level: 0.2, disc: 'muaythai', weight: 77, height: 1.83, tilt: { strength: 0.95, skill: 1.05 }, story: 'Племянник Шрама. Дорогие шорты, дорогая машина, средний удар.', legs: 0.3 },
  { name: 'Ли «Тайка» Кан', level: 0.24, disc: 'muaythai', weight: 63, height: 1.68, tilt: { bodySpeed: 1.12, evasion: 1.1, strength: 0.88 }, story: 'Тренировалась в Таиланде. Шрам платит ей больше всех.', legs: 0.6 },
];

const OCTOBER: Man[] = [
  { name: 'Белов «Комсорг» Белов', level: 0.34, disc: 'boxing', weight: 79, height: 1.78, tilt: { skill: 1.2, mindSpeed: 1.1 }, story: 'Лидер «Красного Октября», мастер спорта ещё той страны. Двойка — как метроном.' },
  { name: 'Дед «Сорок пятый» Миронов', level: 0.22, disc: 'boxing', weight: 86, height: 1.76, tilt: { skill: 1.25, bodySpeed: 0.85, cardio: 0.85 }, story: 'Ему за пятьдесят. Медленный, но ни одного лишнего движения.' },
  { name: 'Ваня «Пионер» Шустов', level: 0.18, disc: 'boxing', weight: 64, height: 1.7, tilt: { bodySpeed: 1.15, cardio: 1.1 }, story: 'Бегает по рингу как заведённый. Лучший ученик Комсорга.' },
  { name: 'Гена «Молот» Крутов', level: 0.26, disc: 'boxing', weight: 98, height: 1.9, tilt: { strength: 1.2 }, story: 'Тяжеловес клуба. Апперкот, после которого не встают.' },
  { name: 'Олег «Левша» Зорин', level: 0.21, disc: 'boxing', weight: 73, height: 1.77, tilt: { evasion: 1.15 }, story: 'Боксирует от обороны и всех злит.' },
];

const DESANT: Man[] = [
  { name: 'Батя «Второго августа» Корнеев', level: 0.35, disc: 'street', weight: 95, height: 1.84, tilt: { strength: 1.15, cardio: 1.15, skill: 0.95 }, story: 'Лидер «Десанта», ветеран. Армейский рукопашный бой, ни шагу назад.', aggression: 0.8 },
  { name: 'Сапёр «Без права на ошибку» Лужин', level: 0.24, disc: 'kickboxing', weight: 80, height: 1.8, tilt: { mindSpeed: 1.12 }, story: 'Спокойный, считает каждый удар.', legs: 0.35 },
  { name: 'Танкист «Броня» Дрозд', level: 0.22, disc: 'street', weight: 108, height: 1.93, tilt: { strength: 1.12, bodySpeed: 0.88 }, story: 'Его не пробить. Он и не уворачивается.' },
  { name: 'Связист «Позывной Сокол» Рыжов', level: 0.17, disc: 'kickboxing', weight: 70, height: 1.76, tilt: { bodySpeed: 1.1 }, story: 'Самый молодой в клубе. Ногами бьёт выше головы.', legs: 0.4 },
  { name: 'Старшина «Устав» Гаврилов', level: 0.2, disc: 'boxing', weight: 85, height: 1.81, tilt: { cardio: 1.2 }, story: 'Двенадцать раундов на мешке каждое утро.' },
];

const CHEMISTS: Man[] = [
  { name: 'Сёма «Хим» Химичев', level: 0.31, disc: 'street', weight: 78, height: 1.79, tilt: { bodySpeed: 1.1, skill: 0.9 }, story: 'Лидер «Химиков» с района у химзавода. Улыбается, когда его бьют.', aggression: 0.9 },
  { name: 'Жека «Семки» Пронин', level: 0.18, disc: 'street', weight: 70, height: 1.74, tilt: { evasion: 1.1 }, story: 'Сидит на корточках у ринга до самого гонга.', aggression: 0.85 },
  { name: 'Толян «Барсетка» Кошкин', level: 0.2, disc: 'boxing', weight: 90, height: 1.85, tilt: { strength: 1.1 }, story: 'Был боксёром до армии. Теперь — до первой бутылки.' },
  { name: 'Вован «Шнурок» Мельник', level: 0.14, disc: 'street', weight: 62, height: 1.7, tilt: { bodySpeed: 1.12, strength: 0.88 }, story: 'Мелкий и вёрткий. Бьёт исподтишка.', aggression: 0.95 },
  { name: 'Костян «Карбид» Ершов', level: 0.24, disc: 'kickboxing', weight: 84, height: 1.82, tilt: { strength: 1.08 }, story: 'Спокойнее остальных. Поэтому опаснее.', legs: 0.3 },
];

// ---------- The city's gangs (stage 3, act 3 only: user) ----------

const VELVET: Man[] = [
  { name: 'Мясник «Тесак» Мясоедов', level: 0.44, disc: 'street', weight: 110, height: 1.92, tilt: { strength: 1.2, bodySpeed: 0.9, skill: 0.9 }, story: 'Главный у «Бархатных», цепной пёс Бархата. Добивает лежачих.', aggression: 0.95 },
  { name: 'Шпала «Длинный» Ветлугин', level: 0.34, disc: 'kickboxing', weight: 88, height: 1.95, tilt: { bodySpeed: 1.05 }, story: 'Охранник Бархата. Длинные ноги, длинные руки, короткий разговор.', legs: 0.4 },
  { name: 'Перстень «Тихий» Гольдман', level: 0.32, disc: 'boxing', weight: 79, height: 1.78, tilt: { skill: 1.12 }, story: 'Бьёт в перстнях, если судья не смотрит.' },
  { name: 'Костюм «Двойка» Белых', level: 0.27, disc: 'boxing', weight: 84, height: 1.82, tilt: { cardio: 1.1 }, story: 'Водитель Бархата. Всегда в костюме, даже на ринге.' },
  { name: 'Рыжая «Касса» Лунёва', level: 0.28, disc: 'muaythai', weight: 64, height: 1.7, tilt: { bodySpeed: 1.1, evasion: 1.1 }, story: 'Считает деньги Бархата и чужие рёбра.', legs: 0.5 },
];

const PORT: Man[] = [
  { name: 'Якорь «Бригадир» Шульга', level: 0.42, disc: 'street', weight: 102, height: 1.87, tilt: { strength: 1.18, cardio: 1.1 }, story: 'Бригадир докеров. Таскает мешки по сто кило и не любит бархатных.', aggression: 0.7 },
  { name: 'Кран «Стрела» Осокин', level: 0.33, disc: 'boxing', weight: 96, height: 1.9, tilt: { strength: 1.12 }, story: 'Длинный прямой, как стрела портового крана.' },
  { name: 'Боцман «Шторм» Ильин', level: 0.29, disc: 'street', weight: 90, height: 1.8, tilt: { cardio: 1.15 }, story: 'Ходил в море двадцать лет. Качку держит лучше всех.' },
  { name: 'Трюм «Молчун» Сазонов', level: 0.26, disc: 'boxing', weight: 81, height: 1.77, tilt: { skill: 1.05 }, story: 'Ни слова за весь бой. Ни шагу назад.' },
  { name: 'Чайка «Юнга» Носов', level: 0.21, disc: 'kickboxing', weight: 68, height: 1.74, tilt: { bodySpeed: 1.12 }, story: 'Самый молодой в порту. Прыгает как чайка за рыбой.', legs: 0.35 },
];

const STUDENTS: Man[] = [
  { name: 'Гоша «Отличник» Лавров', level: 0.41, disc: 'kickboxing', weight: 77, height: 1.81, tilt: { skill: 1.2, mindSpeed: 1.15 }, story: 'Лучший в секции университета. Красный диплом и красивая двоечка.', legs: 0.45 },
  { name: 'Вадим «Аспирант» Кольцов', level: 0.32, disc: 'boxing', weight: 86, height: 1.85, tilt: { mindSpeed: 1.12 }, story: 'Пишет диссертацию о биомеханике удара. Проверяет на людях.' },
  { name: 'Ира «Сессия» Белкина', level: 0.27, disc: 'kickboxing', weight: 60, height: 1.69, tilt: { bodySpeed: 1.1, evasion: 1.12 }, story: 'Сдаёт сессию и соперников досрочно.', legs: 0.5 },
  { name: 'Миша «Первокурсник» Пак', level: 0.20, disc: 'karate', weight: 70, height: 1.75, tilt: { bodySpeed: 1.08 }, story: 'Пришёл из каратэ. Всё ещё кланяется.', legs: 0.4 },
  { name: 'Лёва «Профессор» Гринберг', level: 0.24, disc: 'boxing', weight: 92, height: 1.83, tilt: { skill: 1.15, bodySpeed: 0.9 }, story: 'Тренер Лаврентьев говорит, он думает быстрее, чем бьёт.' },
];

const YARD: Man[] = [
  { name: 'Баян «Хозяин двора» Баянов', level: 0.40, disc: 'street', weight: 95, height: 1.84, tilt: { strength: 1.1, skill: 1.05 }, story: 'Держит подпольные бои во дворе-колодце. Принимает ставки и долги.', aggression: 0.8 },
  { name: 'Зуб «Золотой» Каримов', level: 0.31, disc: 'street', weight: 80, height: 1.79, tilt: { bodySpeed: 1.08 }, story: 'Улыбается золотыми зубами. Своих зубов осталось мало.', aggression: 0.9 },
  { name: 'Шарик «Колобок» Пухов', level: 0.25, disc: 'boxing', weight: 112, height: 1.76, tilt: { strength: 1.15, bodySpeed: 0.88 }, story: 'Круглый и тяжёлый. Катится вперёд и давит.' },
  { name: 'Сява «Карась» Ершов', level: 0.22, disc: 'street', weight: 66, height: 1.71, tilt: { evasion: 1.12 }, story: 'Выскальзывает из любого угла.', aggression: 0.85 },
  { name: 'Дэн «Ставка» Минаев', level: 0.28, disc: 'kickboxing', weight: 83, height: 1.83, tilt: { cardio: 1.05 }, story: 'Ставит на себя всё до копейки. Пока везёт.', legs: 0.35 },
];

function cityClubs(): Club[] {
  const make = (list: Man[], skin: SkinId) => list.map((m) => man(m, skin));
  const vel = make(VELVET, 'velvet');
  const port = make(PORT, 'docker');
  const uni = make(STUDENTS, 'student');
  const yard = make(YARD, 'yard');
  return [
    { id: 'velvet', name: '«Бархатные»', stage: 3, motto: 'Всё решают деньги', desc: 'Люди промоутера Бархата: чёрные костюмы, перстни, золотые цепи. Охрана, сборщики, бойцы. Главный — Мясник.', colors: ['#111114', '#d4a72c'], skin: 'velvet', leader: vel[0].id, members: vel },
    { id: 'port', name: '«Порт»', stage: 3, motto: 'Груз дойдёт', desc: 'Докеры и грузчики: бушлаты, вязаные шапки, огромные руки. Не любят бархатных. С ними можно дружить.', colors: ['#1f2a3a', '#e2b04a'], skin: 'docker', leader: port[0].id, members: port },
    { id: 'uni', name: '«Студенты»', stage: 3, motto: 'Знание — сила', desc: 'Секция университета, тренер Лаврентьев. Синяя форма, белые перчатки. Не банда: честная техника.', colors: ['#2a62c8', '#f4f4f0'], skin: 'student', leader: uni[0].id, members: uni },
    { id: 'yard', name: '«Двор»', stage: 3, motto: 'Ставь на своего', desc: 'Подпольные бои во дворе-колодце у Баяна: бордовые спортивки, золотые зубы, ставки. Быстрые деньги, быстрые долги.', colors: ['#5a1424', '#d4a72c'], skin: 'yard', leader: yard[0].id, members: yard },
  ];
}

function districtClubs(): Club[] {
  const make = (list: Man[], skin: SkinId) => list.map((m) => man(m, skin));
  const iron = make(IRON, 'ironfist');
  const oct = make(OCTOBER, 'sovboxer');
  const des = make(DESANT, 'vdv');
  const chem = make(CHEMISTS, 'gopnik');
  return [
    { id: 'iron', name: '«Железный кулак»', stage: 2, motto: 'Сталь закаляется в огне', desc: 'Клуб Шрама. Тайский бокс, чёрные шорты с золотом, золотые монгколы. Деньги, порядок и Сталь — сын хозяина.', colors: ['#111111', '#d4a72c'], skin: 'ironfist', leader: iron[0].id, members: iron },
    { id: 'october', name: '«Красный Октябрь»', stage: 2, motto: 'Работай двоечкой', desc: 'Старая школа бокса при ДК «Красный Октябрь». Красные майки и трусы, белые боксёрки, вымпелы на стенах. Чистый бокс, никаких ног.', colors: ['#c8102e', '#f4f4f0'], skin: 'sovboxer', leader: oct[0].id, members: oct },
    { id: 'desant', name: '«Десант»', stage: 2, motto: 'Никто, кроме нас', desc: 'Клуб ветеранов. Тельняшки, камуфляж, берцы. Армейский рукопашный бой, выносливость и упрямство.', colors: ['#1f4fa8', '#f4f4f0'], skin: 'vdv', leader: des[0].id, members: des },
    { id: 'chem', name: '«Химики»', stage: 2, motto: 'Чё, с какого района?', desc: 'Пацаны из района у химзавода. Чёрные спортивные костюмы с полосками, бритые затылки. Грязно, быстро, толпой.', colors: ['#15151a', '#f4f4f0'], skin: 'gopnik', leader: chem[0].id, members: chem },
  ];
}

function man(m: Man, skin: SkinId): CareerFighter {
  const cls = WCLASSES.find((w) => m.weight <= w.hi) ?? WCLASSES[2];
  const f = makeFighter(m.level, 0.4 + m.level, cls);
  f.name = m.name;
  f.story = m.story;
  f.discipline = m.disc;
  f.weight = m.weight;
  f.height = m.height;
  f.skin = skin;
  if (m.aggression !== undefined) f.aggression = m.aggression;
  for (const [k, v] of Object.entries(m.tilt) as [StatKey, number][]) {
    const info = STAT_INFO[k];
    f.stats[k] = clamp(f.stats[k] * v, info.lo, info.hi);
    f.caps[k] = clamp(Math.max(f.caps[k] * v, f.stats[k] + 0.02), info.lo, info.hi);
  }
  if (m.legs) f.craft = { hands: 0.2, legs: m.legs };
  return f;
}

function makeClubs(): Club[] {
  const bikers = BIKERS.map((m) => man(m, 'biker'));
  const factory = FACTORY.map((m) => man(m, 'worker'));
  return [
    { id: 'horses', name: '«Железные кони»', stage: 1, motto: 'Кто не с нами — тот под колёсами', desc: 'Байкеры. Чёрная кожа, жилетки с конём на спине. Дерутся грязно и тяжело. Тусуются у «Подковы».', colors: ['#1a1a1e', '#ff5d3a'], skin: 'biker', leader: bikers[0].id, members: bikers },
    { id: 'shop5', name: '«Цех №5»', stage: 1, motto: 'Смена кончилась — смена началась', desc: 'Заводские с тракторного. Синие комбинезоны, номер цеха на спине. Дисциплина, выносливость, честные бои. Враждуют с байкерами.', colors: ['#2a4a8a', '#f2c14e'], skin: 'worker', leader: factory[0].id, members: factory },
    ...districtClubs(),
  ];
}

export function ladder(c: Career): Ladder {
  c.ladder ??= { stage: 1, open: false, clubs: makeClubs(), cup: null, cupWins: 0, beaten: [], history: [] };
  // Older saves: the district's clubs join; the factory men get their overalls.
  if (!c.ladder.clubs.some((k) => k.stage === 2)) {
    c.ladder.clubs.push(...districtClubs());
    const shop = c.ladder.clubs.find((k) => k.id === 'shop5');
    if (shop) {
      shop.skin = 'worker';
      for (const m of shop.members) m.skin = 'worker';
    }
  }
  // Act 3: the city's gangs (only from then on).
  if (c.act3 && !c.ladder.clubs.some((k) => k.stage === 3)) c.ladder.clubs.push(...cityClubs());
  return c.ladder;
}

/** Known beyond the basement (district champion or higher): before that no sponsors, no
 * interviews, no champions calling him out (user: odd for a nobody from a basement). */
export const known = (c: Career) => ladder(c).stage >= 3;

/** Clubs that come to the weekly cup and show in the list: the district's once act 2 runs. */
export const clubStage = (c: Career) => (c.act3 ? 3 : ladder(c).stage >= 2 || c.act2 ? 2 : 1);

export const clubOf = (c: Career, id: string): Club | null => ladder(c).clubs.find((k) => k.members.some((m) => m.id === id)) ?? null;
export const isLeader = (c: Career, id: string) => ladder(c).clubs.some((k) => k.leader === id);
/** Club members by strength. */
export const ranked = (k: Club) => [...k.members].sort((a, b) => rating(b) - rating(a));

/** Who stands where in the ladder's tiers of the old calendar (tier ids allowed at each stage). */
const STAGE_TIERS: Record<number, string[]> = { 1: [], 2: ['basement', 'roof'], 3: ['basement', 'roof', 'club', 'city'], 4: ['basement', 'roof', 'club', 'city', 'nation'], 5: ['basement', 'roof', 'club', 'city', 'nation', 'world'] };
export const STAGE_NAME = ['', 'Подвал', 'Район', 'Город', 'Страна', 'Мир'];

/** Why a calendar event is closed by the ladder (null = open). */
export function ladderLock(c: Career, tierId: string, title: boolean): string | null {
  const L = ladder(c);
  if (title) return L.stage >= 5 ? null : 'бои за мировой пояс — на последней ступени';
  return STAGE_TIERS[L.stage]?.includes(tierId) ? null : `откроется на ступени «${STAGE_NAME[Math.min(5, L.stage + 1)]}»`;
}

/** What is still needed for the next stage. */
export function nextStageNeeds(c: Career): string {
  const L = ladder(c);
  if (L.stage >= 2) return 'дальше — по сюжету';
  return 'выиграть Кубок «Подковы»';
}

function checkStage(c: Career): string[] {
  const L = ladder(c);
  if (L.stage === 1 && L.cupWins > 0) {
    L.stage = 2;
    return ['🏆 Кубок твой! Открыта ступень «Район»'];
  }
  return [];
}

// ---------- The cup of «Подкова» ----------

/** The next Saturday (today if it is one). */
const nextSat = (day: number) => day + ((SAT - DOW(day) + 7) % 7);
export const nightDay = (cp: Cup, r: number) => cp.day + 7 * r;

/** Loners of the district, about the clubs' level. */
function loner(c: Career): CareerFighter {
  const top = [0, 0.16, 0.3, 0.45][clubStage(c)];
  const f = makeFighter(0.02 + Math.random() * top, 0.5, WCLASSES[Math.floor(Math.random() * 3)]);
  f.story = `${f.story} Без клуба.`;
  return f;
}

/** 16 men: the clubs' men (two or three per club from the district on), loners for the rest. */
function field(c: Career): CareerFighter[] {
  const L = ladder(c);
  const top = clubStage(c);
  const out: CareerFighter[] = [];
  for (const k of L.clubs.filter((x) => x.stage <= top && x.stage >= top - 1)) {
    const r = ranked(k);
    const n = top === 1 ? r.length : k.stage === top ? 3 : 2;
    out.push(...r.slice(0, n));
  }
  while (out.length > 16) out.splice(1 + Math.floor(Math.random() * (out.length - 1)), 1);
  while (out.length < 16) out.push(loner(c));
  return out;
}

/** The cup now signing up or running; a new one two weeks after the last ended (the first a
 * week after it was announced). Old weekly cups are replaced (the fee paid back). */
export function cup(c: Career): Cup {
  const L = ladder(c);
  const old = L.cup as unknown as (Cup & { v?: number }) | null;
  if (old && old.v !== 2) {
    if (old.ours && !old.done) c.money += 30;
    L.cup = null;
  }
  if (!L.cup || (L.cup.done && c.day > nightDay(L.cup, CUP_NIGHTS - 1))) {
    const after = L.cup ? nightDay(L.cup, CUP_NIGHTS - 1) + 14 : c.day + 7;
    L.cup = { v: 2, n: (L.cup?.n ?? 0) + 1, day: nextSat(Math.max(after, c.day + 1)), entrants: field(c), ours: null, rounds: [], third: null, done: false, bets: [], seen: [] };
  }
  return L.cup;
}

export const cupPerson = (c: Career, cp: Cup, id: string) => c.roster.find((f) => f.id === id) ?? cp.entrants.find((f) => f.id === id)!;

export function cupCanJoin(c: Career, f: CareerFighter): string | null {
  const L = ladder(c);
  const cp = cup(c);
  if (!L.open) return 'откроется по сюжету';
  if (c.act3?.flags.podkovaLost && !c.act3.ending) return '«Подкова» у Бархата';
  if (cp.ours) return cp.ours === f.id ? 'уже записан' : 'записан другой твой боец';
  if (cp.rounds.length) return 'запись закрыта';
  if (c.money < CUP_FEE) return `взнос $${CUP_FEE}`;
  return null;
}

export function cupJoin(c: Career, f: CareerFighter): string {
  const why = cupCanJoin(c, f);
  if (why) return why;
  const cp = cup(c);
  c.money -= CUP_FEE;
  cp.ours = f.id;
  // Ours takes the place of the weakest loner.
  const lone = cp.entrants.filter((m) => !clubOf(c, m.id)).sort((x, y) => rating(x) - rating(y))[0] ?? cp.entrants[cp.entrants.length - 1];
  cp.entrants = cp.entrants.filter((m) => m !== lone);
  save(c);
  return `${short(f)} в сетке Кубка «Подковы». Первый бой — ${dayWord(c, cp.day)}, взнос $${CUP_FEE}`;
}

const dayWord = (c: Career, d: number) => (d === c.day ? 'сегодня' : d === c.day + 1 ? 'завтра' : `через ${d - c.day} дн.`);

/** Seeds 1..16 in bracket order: the best two can only meet in the final. */
const SEED = [0, 15, 7, 8, 4, 11, 3, 12, 2, 13, 5, 10, 6, 9, 1, 14];

/** The bracket is drawn on the first night: seeded by strength, ours in a free place. */
function draw(c: Career, cp: Cup): void {
  const men = [...cp.entrants].sort((x, y) => rating(y) - rating(x));
  if (cp.ours) men.splice(4 + Math.floor(Math.random() * (men.length - 3)), 0, cupPerson(c, cp, cp.ours));
  const ids = SEED.map((k) => men[k].id);
  cp.rounds = [[0, 2, 4, 6, 8, 10, 12, 14].map((i) => ({ a: ids[i], b: ids[i + 1], w: null }))];
}

const loserOf = (m: CupMatch) => (m.w === m.a ? m.b : m.a);
export const isOurs = (cp: Cup, m: CupMatch) => !!cp.ours && (m.a === cp.ours || m.b === cp.ours);

/** The bookmaker's coefficients for a fight: [on a, on b] (a 7% margin). */
export function coef(c: Career, cp: Cup, m: CupMatch): [number, number] {
  const p = odds(cupPerson(c, cp, m.a), cupPerson(c, cp, m.b));
  const k = (q: number) => Math.max(1.05, Math.round((0.93 / Math.max(0.04, q)) * 100) / 100);
  return [k(p), k(1 - p)];
}

/** Which night it is (the round being fought today, or the next one), -1 when over. */
export function cupNight(c: Career, cp = cup(c)): number {
  if (cp.done) return -1;
  for (let r = 0; r < CUP_NIGHTS; r++) if (c.day <= nightDay(cp, r)) return r;
  return CUP_NIGHTS - 1;
}

/** Tonight's fights (empty if no fight night today). */
export function cupTonight(c: Career): { r: number; ms: CupMatch[] } | null {
  const cp = cup(c);
  cupAdvance(c);
  const r = cupNight(c, cp);
  if (r < 0 || c.day !== nightDay(cp, r) || !cp.rounds[r]) return null;
  return { r, ms: r === CUP_NIGHTS - 1 && cp.third ? [cp.third, ...cp.rounds[r]] : cp.rounds[r] };
}

/** Our fight tonight, if any. */
export function cupMyMatch(c: Career): CupMatch | null {
  const t = cupTonight(c);
  const cp = cup(c);
  return t?.ms.find((m) => isOurs(cp, m) && !m.w) ?? null;
}

/** Sets a winner, pays the bets on that fight. */
function decide(c: Career, cp: Cup, m: CupMatch, w: string, how: CupMatch['how']): string[] {
  if (m.w) return [];
  m.w = w;
  m.how = how;
  const out: string[] = [];
  for (const b of cp.bets) {
    const bm = b.i < 0 ? cp.third : cp.rounds[b.r]?.[b.i];
    if (bm !== m || b.paid) continue;
    b.paid = true;
    if (b.on === w) {
      const win = Math.round(b.stake * b.k);
      c.money += win;
      out.push(`Ставка сыграла: +$${win}`);
    } else out.push(`Ставка $${b.stake} сгорела`);
  }
  if (out.length) c.log.unshift(...out.map((x) => `💵 ${x}`));
  return out;
}

/** A fight of others counted by the odds (not watched). */
const coin = (c: Career, cp: Cup, m: CupMatch) => decide(c, cp, m, Math.random() < odds(cupPerson(c, cp, m.a), cupPerson(c, cp, m.b)) ? m.a : m.b, 'odds');

/** Draws the bracket on the first night and builds each next round once the last is decided. */
export function cupAdvance(c: Career): void {
  const cp = ladder(c).cup;
  if (!cp || cp.v !== 2 || cp.done) return;
  if (c.day >= cp.day && !cp.rounds.length) draw(c, cp);
  for (let r = 0; r < CUP_NIGHTS - 1; r++) {
    const R = cp.rounds[r];
    if (!R || cp.rounds[r + 1] || !R.every((m) => m.w)) continue;
    const next: CupMatch[] = [];
    for (let i = 0; i < R.length; i += 2) next.push({ a: R[i].w!, b: R[i + 1].w!, w: null });
    cp.rounds.push(next);
    if (r + 1 === CUP_NIGHTS - 1) cp.third = { a: loserOf(R[0]), b: loserOf(R[1]), w: null };
  }
}

/** A fight of the night decided: watched in the arena, or ours. */
export function cupResult(c: Career, m: CupMatch, w: string): string[] {
  const cp = cup(c);
  const out = decide(c, cp, m, w, 'ring');
  cupAdvance(c);
  out.push(...settleIfDone(c));
  save(c);
  return out;
}

/** Counts the rest of tonight's fights (except ours). */
export function cupCountRest(c: Career): string[] {
  const t = cupTonight(c);
  if (!t) return [];
  const cp = cup(c);
  const out: string[] = [];
  for (const m of t.ms) if (!m.w && !isOurs(cp, m)) out.push(...coin(c, cp, m));
  cupAdvance(c);
  out.push(...settleIfDone(c));
  save(c);
  return out;
}

/** A bet on a fight not yet decided. */
export function cupBet(c: Career, r: number, i: number, on: string, stake: number): string {
  const cp = cup(c);
  const m = i < 0 ? cp.third : cp.rounds[r]?.[i];
  if (!m || m.w) return 'Этот бой уже решён';
  if (c.money < stake) return 'Не хватает денег';
  if (cp.bets.some((b) => b.r === r && b.i === i)) return 'На этот бой ставка уже есть';
  const [ka, kb] = coef(c, cp, m);
  const k = on === m.a ? ka : kb;
  c.money -= stake;
  cp.bets.push({ r, i, on, stake, k });
  save(c);
  return `Ставка $${stake} на ${short(cupPerson(c, cp, on))} ×${k.toFixed(2)}: выигрыш $${Math.round(stake * k)}`;
}

/** After our fight in the cup. Returns lines for the result screen. */
export function cupFought(c: Career, f: CareerFighter, m: CupMatch, won: boolean): string[] {
  const L = ladder(c);
  const cp = L.cup!;
  const oppId = m.a === f.id ? m.b : m.a;
  const out: string[] = [];
  const opp = cupPerson(c, cp, oppId);
  const k = clubOf(c, oppId);
  if (won) {
    f.record.w++;
    f.fame += 1;
    if (k && k.leader === oppId && !L.beaten.includes(k.id)) {
      L.beaten.push(k.id);
      f.fame += 3;
      out.push(`Лидер ${k.name} повержен! Известность +3`);
    }
  } else f.record.l++;
  addMood(f, won ? 6 : -6);
  out.push(...decide(c, cp, m, won ? f.id : oppId, 'ring'));
  cupAdvance(c);
  out.push(...settleIfDone(c));
  if (!won && !cp.done && m !== cp.third && cp.rounds.indexOf(cp.rounds.find((R) => R.includes(m))!) < CUP_NIGHTS - 2)
    out.push('Ты выбыл. Следующий Кубок — через две недели после этого');
  save(c);
  return [`${won ? 'Победа' : 'Поражение'}: ${short(opp)}${k ? ` (${k.name})` : ''}`, ...out];
}

/** Hands out prizes once the final and the bronze are decided. */
function settleIfDone(c: Career): string[] {
  const L = ladder(c);
  const cp = L.cup!;
  const fin = cp.rounds[CUP_NIGHTS - 1]?.[0];
  if (cp.done || !fin?.w || !cp.third?.w) return [];
  cp.done = true;
  const out: string[] = [];
  const places = [fin.w, loserOf(fin), cp.third.w];
  const champ = cupPerson(c, cp, places[0]);
  L.history.unshift(`Кубок №${cp.n}: победил ${short(champ)}${clubOf(c, champ.id) ? ` (${clubOf(c, champ.id)!.name})` : ''}`);
  L.history.length = Math.min(L.history.length, 12);
  const i = cp.ours ? places.indexOf(cp.ours) : -1;
  if (i >= 0) {
    c.money += CUP_PRIZE[i];
    const f = c.roster.find((x) => x.id === cp.ours)!;
    f.fame += [8, 4, 2][i];
    if (i === 0) L.cupWins++;
    out.push(`${['🥇 Кубок «Подковы» твой', '🥈 Второе место', '🥉 Третье место'][i]}: +$${CUP_PRIZE[i]}`);
  }
  out.push(...checkStage(c));
  // The clubs' men get a little better after every cup.
  for (const k of L.clubs) for (const m of k.members) for (const s of Object.keys(m.stats) as StatKey[]) m.stats[s] = Math.min(m.caps[s], m.stats[s] + 0.01);
  c.log.unshift(...out.map((x) => `🏆 ${x}`));
  return out;
}

/** Midnight: last night's fights not fought are counted (ours = forfeit); the ambush before the final. */
export function cupDay(c: Career): string[] {
  const L = ladder(c);
  if (!L.open) return [];
  const cp = cup(c);
  if (cp.done) return [];
  cupAdvance(c);
  const out: string[] = [];
  for (let r = 0; r < CUP_NIGHTS; r++) {
    if (c.day <= nightDay(cp, r)) break;
    const ms = [...(cp.rounds[r] ?? []), ...(r === CUP_NIGHTS - 1 && cp.third ? [cp.third] : [])];
    for (const m of ms) {
      if (m.w) continue;
      if (isOurs(cp, m)) {
        out.push(...decide(c, cp, m, m.a === cp.ours ? m.b : m.a, 'forfeit'));
        out.push('Не вышел на бой Кубка — техническое поражение');
      } else coin(c, cp, m);
    }
    cupAdvance(c);
  }
  out.push(...settleIfDone(c));
  // At war with «Железные кони» (act 1): they come far more often, and it is them.
  const war = !!c.act1?.flags.bkWar && !c.act1.flags.bkRespect && !c.act1.flags.bkJoin;
  const fin = cp.rounds[CUP_NIGHTS - 1]?.[0];
  if (c.day === nightDay(cp, CUP_NIGHTS - 1) - 1 && fin && isOurs(cp, fin) && !cp.ambush && Math.random() < (war ? 0.75 : 0.4)) {
    const opp = fin.a === cp.ours ? fin.b : fin.a;
    const k = (war ? L.clubs.find((x) => x.id === 'horses') : null) ?? clubOf(c, opp) ?? L.clubs[0];
    const pool = ranked(k).filter((m) => m.id !== opp);
    const thug = pool[Math.floor(Math.random() * pool.length)] ?? k.members[0];
    cp.ambush = { club: k.id, man: thug, settled: false };
    out.push(`Вечером у подъезда ждёт ${short(thug)} из ${k.name}`);
  }
  if (c.day === cp.day - 1 && cp.ours) out.push('Завтра — первый вечер Кубка «Подковы»');
  // Two days before (user: a reminder by phone to sign up): the barman of «Подкова» calls.
  if (c.day >= cp.day - 2 && c.day < cp.day && !cp.ours && !cp.call) {
    cp.call = 1;
    out.push(`📞 Звонил бармен «Подковы»: Кубок №${cp.n} через ${cp.day - c.day} дн., запись открыта`);
  }
  return out;
}

/** The man at the door: fight him (no way round it). */
export function ambushFight(c: Career): { opp: CareerFighter; club: Club } | null {
  const cp = ladder(c).cup;
  if (!cp?.ambush || cp.ambush.settled) return null;
  const club = ladder(c).clubs.find((k) => k.id === cp.ambush!.club)!;
  return { opp: cp.ambush.man, club };
}

export function ambushDone(c: Career, f: CareerFighter, won: boolean): string[] {
  const cp = ladder(c).cup!;
  cp.ambush!.settled = true;
  if (won) {
    f.fame += 2;
    addMood(f, 8);
    save(c);
    return ['Отбился у подъезда. Весь подвал уже знает. Известность +2'];
  }
  f.energy = Math.max(0, energyOf(f) - 45);
  addMood(f, -10);
  save(c);
  return ['Избили у подъезда. На финал выйдешь помятым: энергии почти нет'];
}


/** The reminder call is waiting to be played (once per cup). */
export const cupCallDue = (c: Career) => !!ladder(c).open && ladder(c).cup?.call === 1 && !ladder(c).cup?.ours;
export function cupCallDone(c: Career): void {
  if (ladder(c).cup) ladder(c).cup!.call = 2;
  save(c);
}
