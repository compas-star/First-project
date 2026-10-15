import './style.css';
import { PRESETS, applyPreset, defaultFighter, type FighterParams } from './config';
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim, LIMB_NAME, type Limb } from './sim';
import { POWERS } from './powers';
import { DISCIPLINES } from './disciplines';

const DISCIPLINE_IDS: string[] = DISCIPLINES.map((d) => d.id);
import { View } from './view';

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
let eyes: Eyes = 'fastest';
let paused = false;
let sim: Sim;
let viewScale = 1;
let koShownAt = -1;
let koTimer = 0;
let koReal = 0;

const view = new View($('scene'), $('labels'));

function startFight(): void {
  // Fighters keep a reference to these objects, so speed and strength sliders act live.
  sim?.dispose();
  sim = new Sim(params[0], params[1], (Math.random() * 1e9) | 0);
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
    $(`hp${i}`).style.width = `${(f.hp / f.maxHp) * 100}%`;
    $(`hpn${i}`).textContent = Math.ceil(f.hp).toString();
    $(`n${i}`).textContent = f.p.name;
    $(`s${i}`).innerHTML =
      `тело <b>×${fmt(f.body)}</b> ум <b>×${fmt(f.mind)}</b><br>на экране <b>×${fmt(f.body * viewScale)}</b>` +
      injuries(f);
  });
  $('clock').textContent = `×${viewScale >= 0.1 ? viewScale.toFixed(2) : viewScale.toFixed(3)}`;
  $('eyesLabel').textContent = eyesCaption();
}

function injuries(f: Sim['fighters'][number]): string {
  const list = (Object.keys(f.broken) as Limb[]).filter((l) => f.broken[l]).map((l) => `перелом: ${LIMB_NAME[l]}`);
  if (f.dazed) list.unshift('поплыл');
  return list.length ? `<br><span class="hurt">${list.join('<br>')}</span>` : '';
}

function showKo(): void {
  const w = sim.winner!;
  const l = w.enemy;
  $('koTitle').textContent = `Нокаут. Победил ${w.p.name}`;
  $('koStats').innerHTML = [
    `Бой длился <b>${sim.t.toFixed(2)} с</b> реального времени`,
    l.koReason === 'вылетел с арены' ? `${l.p.name} вылетел с арены` : '',
    `Попаданий: ${w.p.name} <b>${w.hits}</b>, ${l.p.name} <b>${l.hits}</b>`,
    `У победителя осталось <b>${Math.ceil(w.hp)}</b> здоровья`,
  ]
    .filter(Boolean)
    .map((s) => `<div>${s}</div>`)
    .join('');
  $('ko').hidden = false;
}

let last = performance.now();
function frame(now: number): void {
  const realDt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Glide between time scales in log space so switching eyes does not jump.
  // Once the fight is decided, ease toward normal speed so the knockout plays out in reasonable time.
  // A knockout plays in slow motion first, then eases toward normal speed.
  if (sim.winner) koReal += realDt;
  const target = sim.winner ? (koReal < 1.8 ? Math.min(targetScale(), 0.22) : Math.max(targetScale(), 0.5)) : targetScale();
  view.koFocus = sim.winner ? sim.winner.enemy : null;
  const k = 1 - Math.exp(-realDt * 5);
  viewScale = Math.exp(Math.log(viewScale) + (Math.log(target) - Math.log(viewScale)) * k);

  let worldDt = 0;
  if (!paused) {
    // On a slow phone the physics may not keep up; then time simply runs slower.
    worldDt = sim.advance(realDt * viewScale);
  }

  if (sim.winner && koShownAt < 0) {
    const w = sim.winner;
    if (w.enemy.state === 'ko') {
      koTimer += realDt;
      if (w.state === 'ok' && !w.action) sim.startAction(w, 'victory', { dur: 1e9 });
      if (koTimer > 2.4) {
        koShownAt = now;
        showKo();
      }
    }
  }

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
  { key: 'skill', label: 'Техника', hint: 'Высокая: держит дистанцию, входит выпадом и выходит, бьёт чисто. Низкая: лезет вплотную и машет.', min: 0, max: 1, step: 0.01, unit: (v) => `${Math.round(v * 100)}%`, live: true },
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
    const value = p[d.key] as number;
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
      save();
      renderForm();
    });
    styles.appendChild(b);
  }
  form.appendChild(styles);

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
      save();
      renderForm();
      $('sheet').hidden = true;
      startFight();
    });
    box.appendChild(b);
  }
}

function openSheet(): void {
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
$('btnSetup').addEventListener('click', openSheet);
$('btnClose').addEventListener('click', () => ($('sheet').hidden = true));
$('btnFight').addEventListener('click', () => {
  $('sheet').hidden = true;
  startFight();
});
$('koAgain').addEventListener('click', startFight);
$('koSetup').addEventListener('click', () => {
  $('ko').hidden = true;
  openSheet();
});

function resize(): void {
  view.resize();
}
window.addEventListener('resize', resize);
new ResizeObserver(resize).observe($('scene'));

renderPresets();
RAPIER.init().then(() => {
  startFight();
  resize();
  last = performance.now();
  requestAnimationFrame(frame);
});
