// The strike lab: one fighter, one dummy, a strike on command, in slow motion from any
// side, and an editor for the strike itself. Changes are kept and used in all fights.
import { MOVES, MOVE_BY_ID, type Move, type PunchPath, type KickPath, type Zone } from './moves';
import { STANCE, type PoseKey } from './rig';
import { commit, own, shapeOf, isEdited, resetMove, exportCode, importCode } from './moveEdits';
import type { Sim, Lab } from './sim';
import type { FighterParams } from './config';

export interface LabHooks {
  /** Build a lab fight with these two and return it. */
  build(striker: FighterParams, dummy: FighterParams): Sim;
  exit(): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SPEEDS: [number, string][] = [[1, '×1'], [0.5, '×½'], [0.25, '×¼'], [0.1, '×⅒']];
const VIEWS: ['side' | 'front' | 'back' | 'top' | 'auto', string][] = [['side', 'Сбоку'], ['front', 'Спереди'], ['back', 'Из-за спины'], ['top', 'Сверху'], ['auto', 'Свободно']];
const ZONE_NAME: Record<Zone, string> = { head: 'в голову', body: 'в корпус', leg: 'по ногам' };
const PUNCH_PATHS: [PunchPath, string][] = [['straight', 'прямой'], ['hook', 'сбоку (хук)'], ['upper', 'снизу (апперкот)'], ['swing', 'размашистый'], ['over', 'сверху']];
const KICK_PATHS: [KickPath, string][] = [['teep', 'прямой толчок'], ['round', 'круговой'], ['low', 'низкий'], ['back', 'назад с разворота']];

/** Body sliders for a keyframe: the trunk first, the limbs folded away. */
const TRUNK: [PoseKey, string, number, number][] = [
  ['pelvisTwist', 'Поворот бёдер', -100, 100],
  ['spineTwist', 'Поворот плеч', -70, 70],
  ['spineLean', 'Наклон вперёд', -40, 50],
  ['spineSide', 'Наклон вбок', -45, 45],
  ['crouch', 'Присед', 0, 0.3],
  ['headPitch', 'Голова: подбородок вниз', -30, 35],
];
const LIMBS: [PoseKey, string, number, number][] = [
  ['lShF', 'Левое плечо вперёд', -40, 170], ['lShS', 'Левое плечо в сторону', -30, 100], ['lEl', 'Левый локоть', 0, 155],
  ['rShF', 'Правое плечо вперёд', -40, 170], ['rShS', 'Правое плечо в сторону', -30, 100], ['rEl', 'Правый локоть', 0, 155],
  ['lHipF', 'Левое бедро вперёд', -40, 130], ['lHipS', 'Левое бедро в сторону', -10, 80], ['lKn', 'Левое колено', 0, 150],
  ['rHipF', 'Правое бедро вперёд', -40, 130], ['rHipS', 'Правое бедро в сторону', -10, 80], ['rKn', 'Правое колено', 0, 150],
];

export class LabUi {
  active = false;
  slow = 0.25;
  private sim: Sim | null = null;
  private move: Move = MOVES[0];
  private zone: Zone = 'head';
  private repeat = false;
  private nextW = 0;
  private key = 1;
  private lab: Lab = { dist: 1.1, dummy: 'still', crouch: 0, lean: 0, side: 0, turn: 0 };
  private height = 1.8;
  private watching: { id: number; t: number } | null = null;
  private seenHits = 0;
  private report = 'Нажми «Ударить»';
  private striker!: FighterParams;
  private dummyBase!: FighterParams;

  constructor(private hooks: LabHooks, private view: { camView: string }) {
    $('lab').addEventListener('click', (e) => this.onClick(e));
    $('lab').addEventListener('input', (e) => this.onInput(e));
  }

  start(striker: FighterParams, dummy: FighterParams): void {
    this.active = true;
    this.striker = { ...striker, powers: [] };
    this.dummyBase = { ...dummy, powers: [] };
    document.getElementById('app')!.classList.add('lab');
    $('lab').hidden = false;
    this.view.camView = 'side';
    this.rebuild();
    this.render();
  }

  stop(): void {
    this.active = false;
    document.getElementById('app')!.classList.remove('lab');
    $('lab').hidden = true;
    this.view.camView = 'auto';
    this.hooks.exit();
  }

  private rebuild(): void {
    const evasion = this.lab.dummy === 'dodge' ? 1 : 0;
    const dummy: FighterParams = { ...this.dummyBase, name: 'Манекен', height: this.height, weight: Math.round(78 * (this.height / 1.8) ** 2.4), aggression: 0, evasion, skill: 0.7 };
    this.sim = this.hooks.build(this.striker, dummy);
    this.sim.lab = this.lab;
    // Let them walk to their places before the slow motion starts.
    while (this.sim.t < 2.5) this.sim.step(this.sim.stepSize());
    this.watching = null;
    this.seenHits = 0;
  }

  /** Once per frame: repeat strikes, read what happened. */
  update(): void {
    const sim = this.sim;
    if (!this.active || !sim) return;
    const f = sim.fighters[0];
    if (this.repeat && !f.action && f.state === 'ok' && sim.t >= this.nextW) this.strike();
    // What the last strike did.
    while (this.seenHits < sim.labHits.length) {
      const h = sim.labHits[this.seenHits++];
      const where = h.zone === 'head' ? 'в голову' : h.zone === 'body' ? 'в корпус' : h.zone === 'leg' ? 'по ноге' : 'в руку';
      this.setReport(`${h.blocked ? 'В блок' : 'Попал'} ${where} · урон ${h.dmg.toFixed(1)}`);
      if (this.watching) this.watching.t = -1;
    }
    const w = this.watching;
    if (w && (!f.action || f.action.id !== w.id)) {
      if (w.t >= 0) this.setReport(f.state !== 'ok' ? 'Сам упал' : 'Промах');
      this.watching = null;
      this.nextW = sim.t + 0.9;
    }
    // A dummy knocked over gets up; a striker who fell too.
    for (const x of sim.fighters) {
      x.daze = 0;
      x.trauma = 0;
      x.bodyHurt = 0;
      for (const l of Object.keys(x.broken) as (keyof typeof x.broken)[]) {
        x.broken[l] = false;
        x.limbDmg[l] = 0;
      }
    }
  }

  private setReport(s: string): void {
    this.report = s;
    const el = document.getElementById('labReport');
    if (el) el.textContent = s;
  }

  private strike(): void {
    const sim = this.sim!;
    const f = sim.fighters[0];
    if (f.action || f.state !== 'ok') return;
    const zone = this.move.zones.includes(this.zone) ? this.zone : this.move.zones[0];
    // Step in like a fighter would: far enough to land from where he stands.
    const dist = f.pos.distanceTo(f.enemy.pos);
    const r = sim.attackRange(f, this.move);
    const m = this.move;
    const lunge = m.lunge < 0 ? m.lunge * f.scale : Math.max(m.lunge * f.scale, Math.min(dist - r * 0.85 + 0.05, dist - f.radius - f.enemy.radius - 0.1));
    const a = sim.startAction(f, 'attack', { move: m, zone, lunge });
    this.watching = { id: a.id, t: sim.t };
    this.setReport(`${this.move.name} ${ZONE_NAME[zone]}…`);
  }

  // ---------- Panel ----------

  private render(): void {
    const m = this.move;
    const groups: [string, (x: Move) => boolean][] = [
      ['Руки', (x) => /Hand$/.test(x.limb)],
      ['Ноги', (x) => /Foot$/.test(x.limb)],
      ['Локти и колени', (x) => /Elbow|Knee/.test(x.limb)],
    ];
    const moveChips = groups
      .map(([name, ok]) => `<div class="lgroup">${name}</div><div class="chips">${MOVES.filter(ok)
        .map((x) => `<button type="button" class="chip${x === m ? ' on' : ''}" data-act="move" data-id="${x.id}">${x.name}${isEdited(x.id) ? ' •' : ''}</button>`)
        .join('')}</div>`)
      .join('');
    const zones = m.zones.map((z) => `<button type="button" class="chip${z === this.zone ? ' on' : ''}" data-act="zone" data-z="${z}">${ZONE_NAME[z]}</button>`).join('');
    const speeds = SPEEDS.map(([v, t]) => `<button type="button" class="chip${v === this.slow ? ' on' : ''}" data-act="slow" data-v="${v}">${t}</button>`).join('');
    const views = VIEWS.map(([v, t]) => `<button type="button" class="chip${v === this.view.camView ? ' on' : ''}" data-act="view" data-v="${v}">${t}</button>`).join('');
    const dummy = (['still', 'block', 'dodge'] as const)
      .map((d) => `<button type="button" class="chip${d === this.lab.dummy ? ' on' : ''}" data-act="dummy" data-v="${d}">${d === 'still' ? 'стоит' : d === 'block' ? 'блокирует' : 'уклоняется'}</button>`)
      .join('');
    const heights = [1.65, 1.8, 1.95].map((h) => `<button type="button" class="chip${h === this.height ? ' on' : ''}" data-act="height" data-v="${h}">${h.toFixed(2)} м</button>`).join('');

    $('lab').innerHTML = `
      <div class="lab-head">
        <button type="button" data-act="exit">← Выйти</button>
        <b>Лаборатория ударов</b>
      </div>
      <div class="lab-go">
        <button type="button" class="primary" data-act="strike">Ударить</button>
        <button type="button" class="${this.repeat ? 'on' : ''}" data-act="repeat">${this.repeat ? 'Повтор: вкл' : 'Повтор: выкл'}</button>
      </div>
      <div class="lab-report" id="labReport">${this.report}</div>
      <div class="chips">${zones}</div>
      <div class="lrow"><span>Скорость</span><div class="chips">${speeds}</div></div>
      <div class="lrow"><span>Камера</span><div class="chips">${views}</div></div>
      <details open><summary>Какой удар</summary>${moveChips}</details>
      <details><summary>Манекен</summary>
        ${slider('dist', 'Дистанция', this.lab.dist, 0.5, 2.6, 0.05, (v) => `${v.toFixed(2)} м`)}
        <div class="chips">${dummy}</div>
        <div class="chips">${heights}</div>
        ${slider('crouch', 'Пригнулся', this.lab.crouch, 0, 0.25, 0.01, (v) => `${Math.round(v * 100)} см`)}
        ${slider('lean', 'Наклон вперёд', this.lab.lean, -20, 40, 1, (v) => `${v}°`)}
        ${slider('side', 'Голова вбок', this.lab.side, -30, 30, 1, (v) => `${v}°`)}
        ${slider('turn', 'Развёрнут', (this.lab.turn * 180) / Math.PI, -90, 90, 5, (v) => `${v}°`)}
      </details>
      <details id="labEdit"><summary>Править удар «${m.name}»${isEdited(m.id) ? ' (изменён)' : ''}</summary>${this.editor()}</details>
      <details><summary>Код ударов</summary>
        <div class="fnote">Код содержит все изменённые удары. Скопируй и пришли мне в чат с объяснением, что это за удар и когда его бить.</div>
        <div class="row"><button type="button" data-act="copy">Скопировать код</button><button type="button" data-act="paste">Вставить код</button></div>
        <textarea id="labCode" rows="3" placeholder="сюда появится или вставится код"></textarea>
      </details>`;
  }

  private editor(): string {
    const m = this.move;
    const kick = /Foot$/.test(m.limb);
    const sh = shapeOf(m);
    const paths = m.path ? (kick ? KICK_PATHS : PUNCH_PATHS).map(([p, t]) => `<button type="button" class="chip${p === m.path ? ' on' : ''}" data-act="path" data-v="${p}">${t}</button>`).join('') : '';
    const k = Math.min(this.key, m.keys.length - 1);
    const kf = m.keys[k];
    const keyChips = m.keys.map((x, i) => `<button type="button" class="chip${i === k ? ' on' : ''}" data-act="key" data-i="${i}">${Math.round(x.t * 100)}%</button>`).join('');
    const poseSl = (list: [PoseKey, string, number, number][]) =>
      list.map(([key, name, lo, hi]) => slider(`pose:${key}`, name + (kf.pose[key] === undefined ? ' (стойка)' : ''), kf.pose[key] ?? STANCE[key], lo, hi, key === 'crouch' ? 0.01 : 1, (v) => (key === 'crouch' ? `${Math.round(v * 100)} см` : `${Math.round(v)}°`))).join('');
    return `
      <div class="fnote">Изменения сразу сохраняются и работают во всех боях. Удар бьёт в настоящее положение соперника: траектория задаёт только путь руки или ноги.</div>
      ${slider('m:duration', 'Длительность (у обычного человека)', m.duration, 0.2, 1.6, 0.01, (v) => `${v.toFixed(2)} с`)}
      ${slider('m:a0', 'Начало удара (когда может попасть)', m.active[0], 0.1, 0.9, 0.01, (v) => `${Math.round(v * 100)}%`)}
      ${slider('m:a1', 'Конец удара', m.active[1], 0.15, 0.98, 0.01, (v) => `${Math.round(v * 100)}%`)}
      ${slider('m:reach', 'Дальность', m.reach, 0.2, 1.1, 0.01, (v) => `${v.toFixed(2)} м`)}
      ${slider('m:lunge', 'Шаг вперёд', m.lunge, -0.4, 0.9, 0.01, (v) => `${v.toFixed(2)} м`)}
      ${slider('m:power', 'Сила', m.power, 0.5, 4, 0.05, (v) => `×${v.toFixed(2)}`)}
      ${m.path ? `<div class="lgroup">Траектория</div><div class="chips">${paths}</div>` : '<div class="fnote">У этого удара нет наводки (локоть, колено): его задают только позы.</div>'}
      ${sh ? `
        ${slider('sh:c0', 'Замах: вперёд/назад', sh.chamber[0], -0.4, 0.6, 0.01, cm)}
        ${slider('sh:c1', 'Замах: вверх/вниз', sh.chamber[1], -0.7, 0.5, 0.01, cm)}
        ${slider('sh:c2', 'Замах: в сторону', sh.chamber[2], -0.2, 0.8, 0.01, cm)}
        <label class="check"><input type="checkbox" data-act="arc" ${sh.via ? 'checked' : ''}> Идёт по дуге</label>
        ${sh.via ? `
          ${slider('sh:v0', 'Дуга: вперёд', sh.via[0], -0.2, 0.8, 0.01, cm)}
          ${slider('sh:v1', 'Дуга: вверх/вниз', sh.via[1], -0.7, 0.6, 0.01, cm)}
          ${slider('sh:v2', 'Дуга: в сторону', sh.via[2], -0.2, 0.9, 0.01, cm)}` : ''}` : ''}
      <div class="lgroup">Позы тела по ходу удара</div>
      <div class="chips">${keyChips}<button type="button" class="chip" data-act="addkey">+ поза</button>${k > 0 && k < m.keys.length - 1 ? '<button type="button" class="chip" data-act="delkey">− убрать</button>' : ''}</div>
      ${k > 0 && k < m.keys.length - 1 ? slider('kt', 'Когда (доля удара)', kf.t, 0.02, 0.98, 0.01, (v) => `${Math.round(v * 100)}%`) : '<div class="fnote">Первая и последняя позы — это стойка. Выбери позу посередине.</div>'}
      ${k > 0 && k < m.keys.length - 1 ? poseSl(TRUNK) + `<details><summary>Руки и ноги</summary>${poseSl(LIMBS)}</details>` : ''}
      <button type="button" data-act="resetmove">Вернуть удар как был</button>`;
  }

  // ---------- Events ----------

  private onClick(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b || b.tagName === 'INPUT') {
      if (b?.dataset.act === 'arc') this.toggleArc((b as HTMLInputElement).checked);
      return;
    }
    const m = this.move;
    switch (b.dataset.act) {
      case 'exit':
        return this.stop();
      case 'strike':
        this.strike();
        return;
      case 'repeat':
        this.repeat = !this.repeat;
        break;
      case 'zone':
        this.zone = b.dataset.z as Zone;
        break;
      case 'slow':
        this.slow = Number(b.dataset.v);
        break;
      case 'view':
        this.view.camView = b.dataset.v!;
        break;
      case 'move':
        this.move = MOVE_BY_ID[b.dataset.id!];
        this.key = 1;
        if (!this.move.zones.includes(this.zone)) this.zone = this.move.zones[0];
        break;
      case 'dummy':
        this.lab.dummy = b.dataset.v as Lab['dummy'];
        this.rebuild();
        break;
      case 'height':
        this.height = Number(b.dataset.v);
        this.rebuild();
        break;
      case 'path':
        m.path = b.dataset.v as PunchPath;
        m.shape = undefined;
        commit(m);
        break;
      case 'key':
        this.key = Number(b.dataset.i);
        break;
      case 'addkey': {
        own(m);
        const k = Math.min(Math.max(this.key, 0), m.keys.length - 2);
        const a = m.keys[k];
        const z = m.keys[k + 1];
        m.keys.splice(k + 1, 0, { t: (a.t + z.t) / 2, pose: { ...a.pose } });
        this.key = k + 1;
        commit(m);
        break;
      }
      case 'delkey':
        own(m);
        m.keys.splice(this.key, 1);
        this.key = Math.max(1, this.key - 1);
        commit(m);
        break;
      case 'resetmove':
        resetMove(m.id);
        this.key = 1;
        break;
      case 'copy': {
        const code = exportCode();
        const ta = $<HTMLTextAreaElement>('labCode');
        ta.value = code;
        ta.select();
        navigator.clipboard?.writeText(code).catch(() => {});
        this.setReport(code.length > 20 ? 'Код скопирован' : 'Ты ещё ничего не менял');
        return;
      }
      case 'paste': {
        const r = importCode($<HTMLTextAreaElement>('labCode').value);
        this.report = typeof r === 'number' ? `Загружено ударов: ${r}` : r;
        break;
      }
      default:
        return;
    }
    this.keepOpen(() => this.render());
  }

  private toggleArc(on: boolean): void {
    const m = this.move;
    own(m);
    const sh = m.shape!;
    sh.via = on ? [(sh.chamber[0] + 0.5) / 2, sh.chamber[1] / 2, sh.chamber[2] + 0.15] : null;
    commit(m);
    this.keepOpen(() => this.render());
  }

  private onInput(e: Event): void {
    const el = e.target as HTMLInputElement;
    const id = el.dataset.k;
    if (!id) return;
    const v = Number(el.value);
    const out = el.parentElement?.querySelector('output');
    const fmt = el.dataset.f;
    const m = this.move;
    if (id === 'dist' || id === 'crouch' || id === 'lean' || id === 'side') this.lab[id] = v;
    else if (id === 'turn') this.lab.turn = (v * Math.PI) / 180;
    else if (id.startsWith('m:')) {
      const k = id.slice(2);
      if (k === 'a0') m.active = [Math.min(v, m.active[1] - 0.05), m.active[1]];
      else if (k === 'a1') m.active = [m.active[0], Math.max(v, m.active[0] + 0.05)];
      else (m as unknown as Record<string, number>)[k] = v;
      commit(m);
    } else if (id.startsWith('sh:')) {
      own(m);
      const sh = m.shape!;
      const i = Number(id[4]);
      if (id[3] === 'c') sh.chamber[i] = v;
      else if (sh.via) sh.via[i] = v;
      commit(m);
    } else if (id === 'kt') {
      own(m);
      const k = this.key;
      const lo = m.keys[k - 1].t + 0.02;
      const hi = m.keys[k + 1].t - 0.02;
      m.keys[k].t = Math.min(hi, Math.max(lo, v));
      commit(m);
    } else if (id.startsWith('pose:')) {
      own(m);
      m.keys[this.key].pose[id.slice(5) as PoseKey] = v;
      commit(m);
    }
    if (out && fmt) out.textContent = FORMATS[fmt](v);
  }

  /** Re-render without closing the sections the player has open. */
  private keepOpen(fn: () => void): void {
    const panel = $('lab');
    const open = [...panel.querySelectorAll('details')].map((d) => d.open);
    const scroll = panel.scrollTop;
    fn();
    [...panel.querySelectorAll('details')].forEach((d, i) => {
      if (open[i] !== undefined) d.open = open[i];
    });
    panel.scrollTop = scroll;
  }
}

const cm = (v: number) => `${Math.round(v * 100)} см`;

/** Value formats by name, so an input can update its label without re-rendering. */
const FORMATS: Record<string, (v: number) => string> = {};
let fmtSeq = 0;

function slider(key: string, label: string, value: number, min: number, max: number, step: number, fmt: (v: number) => string): string {
  const f = `f${fmtSeq++}`;
  FORMATS[f] = fmt;
  return `<label class="lslider"><span>${label}</span><output>${fmt(value)}</output>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${value}" data-k="${key}" data-f="${f}"></label>`;
}
