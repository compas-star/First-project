import './style.css';
import { PRESETS, applyPreset, defaultFighter, type FighterParams } from './config';
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim, LIMB_NAME, QUICK, bout, type Limb } from './sim';
import { POWERS } from './powers';
import { PLAN_SHORT, fadeMemory, bestStrike, type Memory } from './brain';
import { MOVE_BY_ID } from './moves';
import { DISCIPLINES, DISCIPLINE_BY_ID, styleStriking, styleGrappling } from './disciplines';
import { train, type TrainProgress } from './train';
import { schoolGenome, describeGenome, genesFor, type Genome } from './genome';

const DISCIPLINE_IDS: string[] = DISCIPLINES.map((d) => d.id);
import { View } from './view';
import { MAPS, MAP_BY_ID, type MapId } from './maps';
import { SKINS, defaultSkin } from './skins';
import { CareerUi } from './careerUi';
import { LabUi } from './labUi';
import { loadEdits } from './moveEdits';
import { toParams, type FightResult } from './career';
import type { Rules } from './sim';

type Eyes = 'fastest' | 'red' | 'blue' | 'real';
const EYES: Eyes[] = ['fastest', 'red', 'blue', 'real'];
const EYES_LABEL: Record<Eyes, string> = {
  fastest: 'Глаза: быстрейший',
  red: 'Глаза: Красный',
  blue: 'Глаза: Синий',
  real: 'Реальное время',
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const STORE_KEY = 'arena-speed-v1';

function load(): [FighterParams, FighterParams] {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const [a, b] = JSON.parse(raw) as [Partial<FighterParams>, Partial<FighterParams>];
      return [
        { ...defaultFighter(0), ...a, powers: [...(a.powers ?? [])] },
        { ...defaultFighter(1), ...b, powers: [...(b.powers ?? [])] },
      ].map((f) => ({ ...f, discipline: DISCIPLINE_IDS.includes(f.discipline) ? f.discipline : 'mma' })) as [
        FighterParams,
        FighterParams,
      ];
    }
  } catch {
    /* storage unavailable */
  }
  return applyPreset(PRESETS[1]);
}

function save(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(params));
  } catch {
    /* storage unavailable */
  }
}

const params = load();
const MAP_KEY = 'arena-map-v1';
let mapId: MapId = 'ring';
try {
  const m = localStorage.getItem(MAP_KEY) as MapId | null;
  if (m && MAP_BY_ID[m]) mapId = m;
} catch {
  /* storage unavailable */
}
// Mode: a quick fight to the finish, or a bout of five-minute rounds with judges.
const MODE_KEY = 'arena-mode-v1';
const MODES = [
  { rounds: 0, name: 'Быстрый бой', desc: 'До нокаута, без раундов. Бойцы обычной прочности.' },
  { rounds: 3, name: '3 раунда', desc: 'По 5 минут. Крепкие бойцы, судьи, усталость копится.' },
  { rounds: 5, name: '5 раундов', desc: 'Чемпионская дистанция: 25 минут боя.' },
  { rounds: 7, name: '7 раундов', desc: '35 минут. Кто выдержит темп до конца.' },
  { rounds: 12, name: '12 раундов', desc: 'Старая боксёрская классика, час боя.' },
];
let rounds = 0;
try {
  rounds = Number(localStorage.getItem(MODE_KEY) ?? 0) || 0;
} catch {
  /* storage unavailable */
}
const SPEEDS = [1, 2, 4, 8];
let speed = 1;
let roundShownAt = -1;

function setMap(id: MapId): void {
  mapId = id;
  try {
    localStorage.setItem(MAP_KEY, id);
  } catch {
    /* storage unavailable */
  }
}
let eyes: Eyes = 'fastest';
let paused = false;
let sim: Sim;
let viewScale = 1;
let koShownAt = -1;
let koTimer = 0;
let koReal = 0;

const view = new View($('scene'), $('labels'));

// ---------- Training ----------
// Sparring runs headless in slices between frames; habits are saved after every round.

const TRAIN = { pairs: 2, fights: 2, rounds: 10, maxT: 30, lr: 0.7 };
const PER_ROUND = TRAIN.pairs * 2 * TRAIN.fights;
let training: {
  who: 0 | 1;
  it: Generator<TrainProgress, Genome>;
  last: TrainProgress | null;
  rounds: number;
  baseFights: number;
  t0: number;
} | null = null;

function startTraining(who: 0 | 1): void {
  const me = params[who];
  const opp = params[1 - who];
  const skill = me.skills?.[me.discipline];
  const start = skill?.genome ?? schoolGenome(me.discipline);
  training = {
    who,
    it: train({ ...me, genome: undefined }, [{ ...opp }], start, { ...TRAIN, seed: (Math.random() * 1e9) | 0, keys: genesFor(me.discipline) }),
    last: null,
    rounds: 0,
    baseFights: skill?.fights ?? 0,
    t0: performance.now(),
  };
  paused = true;
  $('sheet').hidden = true;
  $('ko').hidden = true;
  $('train').hidden = false;
  $('trainTitle').textContent = `${me.name}: спарринги с ${opp.name}`;
  $('trainStop').textContent = 'Хватит';
  showTraining();
}

function keepSkill(who: 0 | 1, g: Genome, fights: number): void {
  const me = params[who];
  me.skills = { ...(me.skills ?? {}), [me.discipline]: { genome: { ...g }, fights, vs: params[1 - who].name } };
  save();
}

function showTraining(done = false): void {
  const t = training!;
  const p = t.last;
  const fights = p ? p.fight : 0;
  const total = p ? p.totalFights : TRAIN.rounds * PER_ROUND;
  $('trainBar').style.width = `${(100 * fights) / total}%`;
  const pct = (v: number | null) => (v === null ? '…' : `${Math.round(v * 100)}%`);
  const me = params[t.who];
  const habits = describeGenome(me.skills?.[me.discipline]?.genome ?? {}, schoolGenome(me.discipline), me.discipline);
  $('trainStats').innerHTML = [
    `Спарринг <b>${Math.min(total, fights + (done ? 0 : 1))}</b> из ${total}, круг <b>${t.rounds}</b> из ${TRAIN.rounds}` +
      (!done && fights >= 2 ? `, осталось ~${Math.max(1, Math.round(((performance.now() - t.t0) / fights) * (total - fights) / 60000))} мин` : ''),
    p?.winRate != null ? `Побед в круге: первом <b>${pct(firstWin)}</b>, последнем <b>${pct(p.winRate)}</b>` : 'Первый круг идёт…',
    `Всего опыта: <b>${t.baseFights + t.rounds * PER_ROUND}</b> спаррингов`,
    habits.length ? `Привычки: ${habits.join(', ')}` : '',
    `<span>Каждый круг ${PER_ROUND} боёв: пробует изменить привычки в обе стороны и оставляет то, что работает лучше. Цифры по кругу шумные.</span>`,
  ]
    .filter(Boolean)
    .map((x) => `<div>${x}</div>`)
    .join('');
}
let firstWin: number | null = null;

function stepTraining(): void {
  const t = training!;
  const until = performance.now() + 28;
  while (performance.now() < until) {
    const r = t.it.next();
    if (r.done) {
      keepSkill(t.who, r.value, t.baseFights + t.rounds * PER_ROUND);
      finishTraining();
      return;
    }
    const p = r.value;
    if (p.round > t.rounds) {
      t.rounds = p.round;
      if (t.rounds === 1) firstWin = p.winRate;
      keepSkill(t.who, p.mean, t.baseFights + t.rounds * PER_ROUND);
    }
    t.last = p;
  }
  showTraining();
}

function finishTraining(): void {
  if (!training) return;
  showTraining(true);
  training = null;
  firstWin = null;
  $('trainStop').textContent = 'В бой';
}

// ---------- Memory across fights ----------
// Each fighter remembers every opponent by name: what landed on him and how he
// reacts. It fades a little with every new fight.

const MEM_KEY = 'arena-memory-v1';
type MemStore = Record<string, { fights: number; mem: Memory }>;
let memStore: MemStore = {};
try {
  memStore = JSON.parse(localStorage.getItem(MEM_KEY) ?? '{}') as MemStore;
} catch {
  /* storage unavailable */
}
const memKey = (me: FighterParams, opp: FighterParams) => `${me.name}→${opp.name}`;
let remembered = true;

/** Stores what both fighters learned in the current fight (once per fight). */
function remember(): void {
  if (remembered || !sim || sim.t < 5) return;
  remembered = true;
  for (const f of sim.fighters) {
    const k = memKey(f.p, f.enemy.p);
    memStore[k] = { fights: (memStore[k]?.fights ?? 0) + 1, mem: fadeMemory(f.mem, 1) };
  }
  try {
    localStorage.setItem(MEM_KEY, JSON.stringify(memStore));
  } catch {
    /* storage unavailable */
  }
}

function recall(): void {
  for (const f of sim.fighters) {
    const past = memStore[memKey(f.p, f.enemy.p)];
    if (!past) continue;
    f.mem = fadeMemory(past.mem);
    const best = bestStrike(f.mem);
    f.say(`помню его по ${past.fights} ${past.fights === 1 ? 'бою' : 'боям'}${best ? `: заходит ${MOVE_BY_ID[best].name}` : ''}`);
  }
}

// A fight of the manager mode in progress: who to tell when it is over.
let careerFight: { done: (r: FightResult) => void } | null = null;

function setCareerDock(on: boolean): void {
  for (const id of ['btnRestart', 'btnSetup', 'btnCareer']) $(id).hidden = on;
}

function startFight(): void {
  if (careerFight) {
    careerFight = null;
    setCareerDock(false);
  }
  // Fighters keep a reference to these objects, so speed and strength sliders act live.
  runFight(params[0], params[1], MAP_BY_ID[mapId], rounds ? bout(rounds) : QUICK);
}

function runFight(a: FighterParams, b: FighterParams, map: (typeof MAPS)[number], rules: Rules): void {
  remember();
  sim?.dispose();
  sim = new Sim(a, b, (Math.random() * 1e9) | 0, map, rules);
  (window as unknown as { __sim: Sim }).__sim = sim;
  roundShownAt = -1;
  $('round').hidden = true;
  remembered = false;
  recall();
  view.setSim(sim);
  koShownAt = -1;
  koTimer = 0;
  koReal = 0;
  $('ko').hidden = true;
  paused = false;
  $('btnPause').textContent = 'Пауза';
}

function targetScale(): number {
  const [a, b] = sim.fighters;
  switch (eyes) {
    case 'real':
      return 1;
    case 'red':
      return 1 / a.mind;
    case 'blue':
      return 1 / b.mind;
    default:
      return 1 / Math.max(a.mind, b.mind);
  }
}

const fmt = (v: number) =>
  v >= 10 || (v >= 1 && Math.abs(v - Math.round(v)) < 0.05) ? v.toFixed(0) : v >= 1 ? v.toFixed(1) : v.toFixed(2);

function eyesCaption(): string {
  const [a, b] = sim.fighters;
  if (eyes === 'real') return 'реальное время';
  const f = eyes === 'red' ? a : eyes === 'blue' ? b : a.mind >= b.mind ? a : b;
  if (eyes === 'fastest' && a.mind === b.mind) return 'восприятие равно';
  return `глазами: ${f.p.name}`;
}

function updateHud(): void {
  sim.fighters.forEach((f, i) => {
    // Consciousness: what is left of it under the head damage that stays.
    const ceiling = 1 - 0.6 * f.trauma;
    $(`hp${i}`).style.width = `${(f.out ? 0 : ceiling * (1 - f.daze)) * 100}%`;
    $(`tr${i}`).style.width = `${(1 - ceiling) * 100}%`;
    $(`bd${i}`).style.width = `${(1 - f.bodyHurt) * 100}%`;
    $(`sp${i}`).style.width = `${Math.max(0, f.stamina) * 100}%`;
    const word = stateWord(f);
    $(`hpn${i}`).textContent = word.text;
    $(`hpn${i}`).style.color = word.color;
    $(`n${i}`).textContent = f.p.name;
    $(`s${i}`).innerHTML =
      `тело <b>×${fmt(f.body)}</b> ум <b>×${fmt(f.mind)}</b><br>на экране <b>×${fmt(f.body * viewScale)}</b>` +
      injuries(f);
  });
  $('clock').textContent = `×${viewScale >= 0.1 ? viewScale.toFixed(2) : viewScale.toFixed(3)}`;
  $('eyesLabel').textContent = eyesCaption();
  if (sim.rules.roundLen) {
    $('clock').textContent = fmtClock(Math.max(0, sim.rules.roundLen - sim.roundT));
    $('eyesLabel').textContent = `раунд ${sim.round} из ${sim.rules.rounds}`;
  }
}

function stateWord(f: Sim['fighters'][number]): { text: string; color: string } {
  if (f.out) return { text: f.koReason === 'нокаут' ? 'без сознания' : 'остановлен', color: '#ff5a4a' };
  if (f.state === 'down') return { text: 'на полу', color: '#ff8a5a' };
  if (f.state === 'ground' && f.grapple) {
    const g = f.grapple;
    const where = g.pos === 'guard' ? 'гард' : g.pos === 'mount' ? 'маунт' : 'сбоку';
    return { text: g.top === f ? `сверху · ${where}` : `снизу · ${where}`, color: g.top === f ? '#7fd88f' : '#f2c14e' };
  }
  if (f.daze > 0.75) return { text: 'на грани', color: '#ff5a4a' };
  if (f.daze > 0.42) return { text: 'плывёт', color: '#ff8a5a' };
  if (f.daze > 0.18) return { text: 'потрясён', color: '#f2c14e' };
  return { text: 'ясно', color: '#e8ecf3' };
}

function injuries(f: Sim['fighters'][number]): string {
  const list = (Object.keys(f.broken) as Limb[]).filter((l) => f.broken[l]).map((l) => `перелом: ${LIMB_NAME[l]}`);
  // Limbs: bruised before they break, and an arm or leg can be hurt without the man being hurt.
  for (const l of Object.keys(f.limbDmg) as Limb[]) {
    if (!f.broken[l] && f.limbDmg[l] > f.limbLimit * 0.5) list.push(`отбита: ${LIMB_NAME[l]}`);
  }
  if (f.knockdowns) list.unshift(`нокдаунов: ${f.knockdowns}`);
  const sub = f.grapple?.sub;
  if (sub) list.unshift(`${sub.by === f ? 'дожимает' : 'в захвате'}: ${sub.kind === 'choke' ? 'удушающий' : sub.kind === 'triangle' ? 'треугольник' : 'рычаг'} ${Math.round(sub.p * 100)}%`);
  if (f.bodyHurt > 0.5) list.unshift('корпус избит');
  if (f.fatigue > 0.5) list.unshift('выдохся');
  const plan = f.state === 'ok' && !sim.winner ? `<br><span class="plan">${PLAN_SHORT[f.plan]}</span>` : '';
  return plan + (list.length ? `<br><span class="hurt">${list.join('<br>')}</span>` : '');
}

function showKo(): void {
  remember();
  $('koAgain').textContent = careerFight ? 'Дальше' : 'Ещё раз';
  $('koSetup').hidden = !!careerFight;
  const w = sim.winner!;
  const l = w.enemy;
  const known = memStore[memKey(w.p, l.p)]?.fights ?? 0;
  $('koTitle').textContent = `${l.koReason === 'нокаут' ? 'Нокаут' : l.koReason.startsWith('решение') ? 'Решение судей' : 'Победа'}. Победил ${w.p.name}`;
  $('koStats').innerHTML = [
    `Бой длился <b>${sim.t >= 120 ? fmtClock(sim.t) : `${sim.t.toFixed(2)} с`}</b> реального времени`,
    `Попаданий: ${w.p.name} <b>${w.hits}</b>, ${l.p.name} <b>${l.hits}</b>`,
    l.koReason && l.koReason !== 'нокаут' ? `Причина: <b>${l.koReason}</b>` : '',
    `Победитель: ${stateWord(w).text}${w.knockdowns ? `, нокдаунов ${w.knockdowns}` : ''}`,
    known > 1 ? `Они дрались уже <b>${known}</b> раз: оба помнят, что заходит` : '',
    sim.rules.roundLen ? `Раунд ${sim.round}, ${fmtClock(sim.roundT)}` : '',
    sim.cards.length ? cardsHtml() : '',
  ]
    .filter(Boolean)
    .map((s) => `<div>${s}</div>`)
    .join('');
  $('ko').hidden = false;
}

const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function cardsHtml(): string {
  const [a, b] = sim.fighters;
  const rows = sim.cards.map(([x, y], i) => `<div>Раунд ${i + 1}: ${a.p.name} <b>${x}</b> — <b>${y}</b> ${b.p.name}</div>`);
  const [ta, tb] = sim.score();
  return rows.join('') + `<div>Итого: <b>${ta}–${tb}</b></div>`;
}

function showRound(): void {
  const [a, b] = sim.fighters;
  $('roundTitle').textContent = `Конец раунда ${sim.round} из ${sim.rules.rounds}`;
  const st = (f: typeof a) =>
    `${f.p.name}: ${stateWord(f).text}, дыхание ${Math.round(Math.max(0, f.stamina) * 100)}%, усталость ${Math.round(f.wear * 100)}%`;
  $('roundStats').innerHTML = cardsHtml() + `<div>${st(a)}</div><div>${st(b)}</div><div>Угол работает: дыхание и голова частично восстановятся.</div>`;
  $('round').hidden = false;
}

function startNextRound(): void {
  $('round').hidden = true;
  roundShownAt = -1;
  sim.nextRound();
}

function showDraw(): void {
  $('koAgain').textContent = careerFight ? 'Дальше' : 'Ещё раз';
  $('koSetup').hidden = !!careerFight;
  $('koTitle').textContent = 'Ничья';
  $('koStats').innerHTML = cardsHtml();
  $('ko').hidden = false;
}

// Highlights: a big caption and a moment of slow motion.
let dramaUntil = 0;
view.onMoment = (text) => {
  dramaUntil = performance.now() + 900;
  if (!view.words) return;
  const el = $('moment');
  el.textContent = text;
  el.classList.remove('show');
  void el.offsetWidth;
  el.classList.add('show');
};

let last = performance.now();
function frame(now: number): void {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Glide between time scales in log space so switching eyes does not jump.
  // Once the fight is decided, ease toward normal speed so the knockout plays out in reasonable time.
  // A knockout plays in slow motion first, then eases toward normal speed.
  if (sim.winner) koReal += realDt;
  let target = sim.winner ? (koReal < 1.8 ? Math.min(targetScale(), 0.22) : Math.max(targetScale(), 0.5)) : targetScale();
  if (now < dramaUntil && !sim.winner) target = Math.min(target, 0.3);
  view.koFocus = sim.winner ? sim.winner.enemy : null;
  const k = 1 - Math.exp(-realDt * 5);
  viewScale = Math.exp(Math.log(viewScale) + (Math.log(target) - Math.log(viewScale)) * k);

  if (training) stepTraining();
  let worldDt = 0;
  const frozen = view.hitStop > 0;
  view.hitStop -= realDt;
  if (!paused && !training && !frozen) {
    // On a slow phone the physics may not keep up; then time simply runs slower.
    worldDt = sim.advance(realDt * viewScale * (sim.winner ? 1 : speed) * (lab.active ? lab.slow : 1));
  }

  // Between rounds: the card, then the next round (by tap or after a few seconds).
  if (sim.betweenRounds) {
    if (roundShownAt < 0) {
      roundShownAt = now;
      showRound();
    } else if (now - roundShownAt > 6000 && !paused) startNextRound();
  }
  if (sim.draw && koShownAt < 0) {
    koShownAt = now;
    showDraw();
  }
  if (sim.winner && koShownAt < 0) {
    const w = sim.winner;
    const decision = w.enemy.koReason.startsWith('решение');
    if (decision) {
      koTimer += realDt;
      if (w.state === 'ok' && !w.action) sim.startAction(w, 'victory', { dur: 1e9 });
      if (koTimer > 1.2) {
        koShownAt = now;
        showKo();
      }
    } else if (w.enemy.state === 'ko') {
      koTimer += realDt;
      if (w.state === 'ok' && !w.action) sim.startAction(w, 'victory', { dur: 1e9 });
      if (koTimer > 2.4) {
        koShownAt = now;
        showKo();
      }
    }
  }

  if (lab.active) lab.update();
  view.render(realDt, worldDt, viewScale);
  updateHud();
  requestAnimationFrame(frame);
}

// ---------- Setup sheet ----------

interface SliderDef {
  key: keyof FighterParams;
  label: string;
  hint: string;
  min: number;
  max: number;
  log?: boolean;
  step?: number;
  unit: (v: number) => string;
  live: boolean;
}

const SLIDERS: SliderDef[] = [
  { key: 'height', label: 'Рост', hint: 'Длина рук и ног, дальность ударов, шаг.', min: 1.2, max: 5, step: 0.05, unit: (v) => `${v.toFixed(2)} м`, live: false },
  { key: 'weight', label: 'Вес', hint: 'Сила удара, устойчивость, телосложение.', min: 35, max: 1500, log: true, unit: (v) => `${Math.round(v)} кг`, live: false },
  { key: 'strength', label: 'Сила', hint: 'Урон и отбрасывание.', min: 0.3, max: 30, log: true, unit: (v) => `×${fmt(v)}`, live: true },
  { key: 'bodySpeed', label: 'Скорость тела', hint: 'Как быстро двигаются руки, ноги и всё тело.', min: 0.3, max: 50, log: true, unit: (v) => `×${fmt(v)}`, live: true },
  { key: 'mindSpeed', label: 'Скорость восприятия', hint: 'Как рано замечает замах и как часто думает.', min: 0.3, max: 50, log: true, unit: (v) => `×${fmt(v)}`, live: true },
  { key: 'aggression', label: 'Агрессия', hint: 'Атаковать или ждать момента.', min: 0, max: 1, step: 0.01, unit: (v) => `${Math.round(v * 100)}%`, live: true },
  { key: 'evasion', label: 'Вертлявость', hint: 'Как много и как красиво уворачивается: уклоны, нырки, отклоны, и сразу контратака. Успевает, только если вовремя заметил удар (восприятие). Уворот не в ту сторону — нарвался.', min: 0, max: 1, step: 0.01, unit: (v) => `${Math.round(v * 100)}%`, live: true },
  { key: 'skill', label: 'Техника', hint: 'Высокая: держит дистанцию, входит выпадом и выходит, бьёт чисто. Низкая: лезет вплотную и машет.', min: 0, max: 1, step: 0.01, unit: (v) => `${Math.round(v * 100)}%`, live: true },
  { key: 'striking', label: 'Ударка', hint: 'Насколько хорош в ударах: сила и чистота попаданий. Сильный ударник не полезет в партер к борцу. Ставится по стилю, можно поменять.', min: 0, max: 1, step: 0.01, unit: (v) => `${Math.round(v * 100)}%`, live: true },
  { key: 'grappling', label: 'Борьба', hint: 'Проходы в ноги, защита от них, контроль внизу и болевые. Кто сильнее в борьбе и слабее в ударах — тянет в партер. Ставится по стилю, можно поменять.', min: 0, max: 1, step: 0.01, unit: (v) => `${Math.round(v * 100)}%`, live: true },
];

let tab: 0 | 1 = 0;

function toSlider(d: SliderDef, v: number): number {
  return d.log ? (Math.log(v / d.min) / Math.log(d.max / d.min)) * 1000 : v;
}
function fromSlider(d: SliderDef, s: number): number {
  return d.log ? d.min * Math.pow(d.max / d.min, s / 1000) : s;
}

function renderForm(): void {
  const p = params[tab];
  const form = $('form');
  form.innerHTML = '';
  const addTitle = (t: string) => {
    const el = document.createElement('div');
    el.className = 'group-title';
    el.textContent = t;
    form.appendChild(el);
  };

  addTitle('Тело · с нового боя');
  for (const d of SLIDERS) {
    if (d.key === 'strength') addTitle('Возможности · меняются сразу');
    if (d.key === 'mindSpeed') {
      const row = document.createElement('label');
      row.className = 'check';
      row.innerHTML = `<input type="checkbox" id="f-link" ${p.linkMind ? 'checked' : ''}> Восприятие = скорости тела`;
      form.appendChild(row);
      row.querySelector('input')!.addEventListener('change', (e) => {
        p.linkMind = (e.target as HTMLInputElement).checked;
        if (p.linkMind) p.mindSpeed = p.bodySpeed;
        save();
        renderForm();
      });
    }
    const value =
      d.key === 'striking' ? p.striking ?? styleStriking(p.discipline) : d.key === 'grappling' ? p.grappling ?? styleGrappling(p.discipline) : (p[d.key] as number);
    const field = document.createElement('div');
    const disabled = d.key === 'mindSpeed' && p.linkMind;
    field.className = `field${disabled ? ' disabled' : ''}`;
    const id = `f-${d.key}`;
    field.innerHTML = `
      <div class="field-top">
        <label for="${id}">${d.label}<small>${d.hint}</small></label>
        <output id="${id}-out">${d.unit(disabled ? p.bodySpeed : value)}</output>
      </div>
      <input type="range" id="${id}" min="${d.log ? 0 : d.min}" max="${d.log ? 1000 : d.max}" step="${d.log ? 1 : d.step ?? 0.01}"
        value="${toSlider(d, disabled ? p.bodySpeed : value)}" ${disabled ? 'disabled' : ''}>`;
    form.appendChild(field);
    const input = field.querySelector('input')!;
    const out = field.querySelector('output')!;
    input.addEventListener('input', () => {
      const v = fromSlider(d, Number(input.value));
      (p[d.key] as number) = v;
      if (d.key === 'bodySpeed' && p.linkMind) p.mindSpeed = v;
      out.textContent = d.unit(v);
      save();
    });
  }

  addTitle('Стиль боя · меняется сразу');
  const styles = document.createElement('div');
  styles.className = 'powers';
  for (const d of DISCIPLINES) {
    const b = document.createElement('button');
    b.type = 'button';
    const on = p.discipline === d.id;
    b.className = `power${on ? ' on' : ''}`;
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = `<b>${d.name}</b><span>${d.desc}</span>`;
    b.addEventListener('click', () => {
      p.discipline = d.id;
      // A new style brings its own striking and wrestling level; the sliders can change it after.
      delete p.striking;
      delete p.grappling;
      save();
      renderForm();
    });
    styles.appendChild(b);
  }
  form.appendChild(styles);

  addTitle('Внешность · с нового боя');
  const skins = document.createElement('div');
  skins.className = 'powers';
  const current = p.skin ?? defaultSkin(p.discipline);
  for (const sk of SKINS) {
    const b = document.createElement('button');
    b.type = 'button';
    const on = current === sk.id;
    b.className = `power${on ? ' on' : ''}`;
    b.setAttribute('aria-pressed', String(on));
    b.innerHTML = `<b>${sk.name}</b><span>${sk.desc}</span>`;
    b.addEventListener('click', () => {
      p.skin = sk.id;
      save();
      renderForm();
    });
    skins.appendChild(b);
  }
  form.appendChild(skins);

  const disc = DISCIPLINE_BY_ID[p.discipline];
  addTitle(`Тренировка · ${disc.name}`);
  const skill = p.skills?.[p.discipline];
  const info = document.createElement('p');
  info.className = 'note';
  const habits = skill ? describeGenome(skill.genome, schoolGenome(p.discipline), p.discipline) : [];
  info.innerHTML = skill
    ? `Опыт: <b>${skill.fights}</b> спаррингов${skill.vs ? ` (последний соперник: ${skill.vs})` : ''}.` +
      (habits.length ? ` Привычки: ${habits.join(', ')}.` : ' Привычки пока как у школы стиля.')
    : `Не тренировался: дерётся так, как учит школа стиля. Тренировка: ${TRAIN.rounds * PER_ROUND} спаррингов с текущим соперником, боец сам подбирает привычки, которые против него работают. Можно остановить в любой момент.`;
  const met = memStore[memKey(p, params[1 - tab])]?.fights ?? 0;
  if (met) info.innerHTML += ` Помнит соперника (${params[1 - tab].name}) по <b>${met}</b> ${met === 1 ? 'бою' : 'боям'}: что на него заходит и как он защищается.`;
  form.appendChild(info);
  const row = document.createElement('div');
  row.className = 'train-row';
  const go = document.createElement('button');
  go.type = 'button';
  go.textContent = `Тренировать против: ${params[1 - tab].name}`;
  go.addEventListener('click', () => startTraining(tab));
  row.appendChild(go);
  if (skill) {
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.textContent = 'Забыть';
    reset.addEventListener('click', () => {
      delete p.skills![p.discipline];
      save();
      renderForm();
    });
    row.appendChild(reset);
  }
  form.appendChild(row);

  addTitle('Сверхсилы · меняются сразу');
  const chips = document.createElement('div');
  chips.className = 'powers';
  for (const pw of POWERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `power${p.powers.includes(pw.id) ? ' on' : ''}`;
    b.setAttribute('aria-pressed', String(p.powers.includes(pw.id)));
    b.innerHTML = `<b>${pw.name}</b><span>${pw.desc}</span>`;
    b.addEventListener('click', () => {
      const i = p.powers.indexOf(pw.id);
      if (i >= 0) p.powers.splice(i, 1);
      else p.powers.push(pw.id);
      save();
      renderForm();
    });
    chips.appendChild(b);
  }
  form.appendChild(chips);
}

function renderPresets(): void {
  const box = $('presets');
  box.innerHTML = '';
  for (const pr of PRESETS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'preset';
    b.innerHTML = `<b>${pr.name}</b><span>${pr.desc}</span>`;
    b.addEventListener('click', () => {
      const [r, bl] = applyPreset(pr);
      Object.assign(params[0], r);
      Object.assign(params[1], bl);
      setMap(pr.map);
      save();
      renderForm();
      $('sheet').hidden = true;
      startFight();
    });
    box.appendChild(b);
  }
}

function renderMaps(): void {
  const box = $('maps');
  box.innerHTML = '';
  for (const m of MAPS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `preset${m.id === mapId ? ' on' : ''}`;
    b.setAttribute('aria-pressed', String(m.id === mapId));
    b.innerHTML = `<b>${m.name}</b><span>${m.desc}</span>`;
    b.addEventListener('click', () => {
      setMap(m.id);
      renderMaps();
    });
    box.appendChild(b);
  }
}

function renderModes(): void {
  const box = $('modes');
  box.innerHTML = '';
  for (const m of MODES) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `preset${m.rounds === rounds ? ' on' : ''}`;
    b.setAttribute('aria-pressed', String(m.rounds === rounds));
    b.innerHTML = `<b>${m.name}</b><span>${m.desc}</span>`;
    b.addEventListener('click', () => {
      rounds = m.rounds;
      try {
        localStorage.setItem(MODE_KEY, String(rounds));
      } catch {
        /* storage unavailable */
      }
      renderModes();
    });
    box.appendChild(b);
  }
}

const WORDS_KEY = 'arena-words-v1';
try {
  view.words = localStorage.getItem(WORDS_KEY) === '1';
} catch {
  /* storage unavailable */
}

function renderWords(): void {
  const box = $('words');
  box.innerHTML = `<label class="check"><input type="checkbox" ${view.words ? 'checked' : ''}> Подписи на экране: мысли бойцов, куда попал, яркие моменты</label>`;
  box.querySelector('input')!.addEventListener('change', (e) => {
    view.words = (e.target as HTMLInputElement).checked;
    try {
      localStorage.setItem(WORDS_KEY, view.words ? '1' : '0');
    } catch {
      /* storage unavailable */
    }
  });
}

function openSheet(): void {
  renderWords();
  renderModes();
  renderMaps();
  renderForm();
  $('sheet').hidden = false;
}

document.querySelectorAll<HTMLButtonElement>('.tabs button').forEach((b) => {
  b.addEventListener('click', () => {
    tab = Number(b.dataset.tab) as 0 | 1;
    document.querySelectorAll('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    renderForm();
  });
});

$('btnPause').addEventListener('click', () => {
  paused = !paused;
  $('btnPause').textContent = paused ? 'Дальше' : 'Пауза';
});
$('btnEyes').addEventListener('click', () => {
  eyes = EYES[(EYES.indexOf(eyes) + 1) % EYES.length];
  $('btnEyes').textContent = EYES_LABEL[eyes];
});
$('btnRestart').addEventListener('click', startFight);
$('btnSpeed').addEventListener('click', () => {
  speed = SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length];
  $('btnSpeed').textContent = `×${speed}`;
});
$('roundGo').addEventListener('click', startNextRound);
$('btnSetup').addEventListener('click', openSheet);
$('btnClose').addEventListener('click', () => ($('sheet').hidden = true));
$('btnFight').addEventListener('click', () => {
  $('sheet').hidden = true;
  startFight();
});
$('koAgain').addEventListener('click', () => {
  if (careerFight) finishCareerFight();
  else startFight();
});
$('trainStop').addEventListener('click', () => {
  if (training) {
    finishTraining();
    return;
  }
  $('train').hidden = true;
  startFight();
});
$('koSetup').addEventListener('click', () => {
  $('ko').hidden = true;
  openSheet();
});

function resize(): void {
  view.resize();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe($('scene'));

// ---------- Manager mode ----------

const career = new CareerUi({
  fight(me, opp, tier, title, done) {
    careerFight = { done };
    setCareerDock(true);
    runFight(toParams(me, 0), toParams(opp, 1), MAP_BY_ID[tier.map], tier.rules);
    // The bill of the fight, as a caption, whatever the words setting.
    const el = $('moment');
    el.textContent = title;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  },
  close() {
    paused = false;
    $('btnPause').textContent = 'Пауза';
    if (careerFight) startFight();
  },
});

function finishCareerFight(): void {
  const cf = careerFight!;
  const [me, opp] = sim.fighters;
  // A draw on the cards goes to the man who landed more.
  const won = sim.winner ? sim.winner === me : me.hits >= opp.hits;
  const loser = won ? opp : me;
  const r: FightResult = {
    won,
    ko: !!sim.winner && !loser.koReason.startsWith('решение'),
    reason: sim.winner ? loser.koReason || 'нокаут' : 'ничья, по попаданиям',
    trauma: me.trauma,
    body: me.bodyHurt,
    broken: Object.values(me.broken).filter(Boolean).length,
    seconds: sim.t,
  };
  $('ko').hidden = true;
  paused = true;
  cf.done(r);
}

// ---------- Strike lab ----------

const lab = new LabUi(
  {
    build(a, b) {
      runFight(a, b, MAP_BY_ID.dojo, QUICK);
      return sim;
    },
    exit() {
      startFight();
    },
  },
  view,
);

(window as unknown as { __lab: LabUi }).__lab = lab;

$('btnLab').addEventListener('click', () => {
  $('sheet').hidden = true;
  lab.start(params[0], params[1]);
});

$('btnCareer').addEventListener('click', () => {
  paused = true;
  $('sheet').hidden = true;
  career.show();
});

renderPresets();
loadEdits();
RAPIER.init().then(() => {
  startFight();
  resize();
  last = performance.now();
  requestAnimationFrame(frame);
});
