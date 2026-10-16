// The lab, two tabs. Combinations: tap blows in order to build one, watch your fighter
// throw it at a dummy in slow motion from any side, save it, and fighters will use it
// in their fights when its first blow fits the moment. A strike: drag handles in the
// arena (wind-up, arc, shoulders, hips) and throw it at the dummy to see.
import { MOVES, MOVE_BY_ID, type Move, type Zone } from './moves';
import { combos, loadCombos, addCombo, removeCombo, toggleAi, comboName, exportCombos, importCombos, type ComboStep } from './combos';
import type { Sim, Lab } from './sim';
import { StrikeEditor } from './strikeEditor';
import { isEdited, resetMove, exportCode, importCode, commit, shapeOf } from './moveEdits';
import type * as THREE from 'three';
import type { FighterParams } from './config';

export interface LabHooks {
  /** Build a lab fight with these two and return it. */
  build(striker: FighterParams, dummy: FighterParams): Sim;
  exit(): void;
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const SPEEDS: [number, string][] = [[1, '×1'], [0.5, '×½'], [0.25, '×¼'], [0.1, '×⅒']];
const VIEWS: ['side' | 'front' | 'back' | 'top' | 'auto', string][] = [['side', 'Сбоку'], ['front', 'Спереди'], ['back', 'Сзади'], ['top', 'Сверху'], ['auto', 'Свободно']];
const ZONE_SHORT: Record<Zone, string> = { head: 'голова', body: 'корпус', leg: 'ноги' };

interface LabView {
  camView: string;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: { enabled: boolean };
  canvas: HTMLCanvasElement;
}

export class LabUi {
  active = false;
  slow = 0.5;
  private tab: 'combo' | 'strike' = 'combo';
  private editor: StrikeEditor;
  private single: Move = MOVE_BY_ID.jab;
  private zone: Zone = 'head';
  private repeat = false;
  private nextW = 0;
  private sim: Sim | null = null;
  /** The combination being built. */
  private steps: ComboStep[] = [];
  private lab: Lab = { dist: 1.1, dummy: 'still', crouch: 0, lean: 0, side: 0, turn: 0 };
  /** The combination being shown: hits counted against its length. */
  private show: { n: number; hits: number; blocked: number; started: number } | null = null;
  private seenHits = 0;
  private report = 'Нажимай удары внизу по порядку, потом «Показать»';
  private striker!: FighterParams;
  private dummyBase!: FighterParams;

  constructor(private hooks: LabHooks, private view: LabView) {
    loadCombos();
    this.editor = new StrikeEditor(view, () => this.sim);
    this.editor.onChange = () => {
      const t = document.getElementById('labEdited');
      if (t) t.textContent = isEdited(this.single.id) ? 'изменён' : '';
    };
    $('lab').addEventListener('click', (e) => this.onClick(e));
    $('lab').addEventListener('input', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset.k === 'dist') {
        this.lab.dist = Number(el.value);
        const out = el.parentElement?.querySelector('output');
        if (out) out.textContent = `${this.lab.dist.toFixed(2)} м`;
      }
    });
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
    this.syncEditor();
  }

  private syncEditor(): void {
    this.editor.active = this.active && this.tab === 'strike';
    this.editor.move = this.single;
    this.editor.zone = this.zone;
  }

  stop(): void {
    this.active = false;
    document.getElementById('app')!.classList.remove('lab');
    $('lab').hidden = true;
    this.view.camView = 'auto';
    this.editor.active = false;
    this.hooks.exit();
  }

  private rebuild(): void {
    const evasion = this.lab.dummy === 'dodge' ? 1 : 0;
    const dummy: FighterParams = { ...this.dummyBase, name: 'Манекен', aggression: 0, evasion, skill: 0.7 };
    this.sim = this.hooks.build(this.striker, dummy);
    this.sim.lab = this.lab;
    // Let them walk to their places before the slow motion starts.
    while (this.sim.t < 2.5) this.sim.step(this.sim.stepSize());
    this.show = null;
    this.seenHits = 0;
  }

  /** Once per frame: count what the combination landed, keep both fresh. */
  update(): void {
    const sim = this.sim;
    if (!this.active || !sim) return;
    const f = sim.fighters[0];
    while (this.seenHits < sim.labHits.length) {
      const h = sim.labHits[this.seenHits++];
      if (this.show) {
        if (h.blocked) this.show.blocked++;
        else this.show.hits++;
      }
    }
    this.editor.update();
    if (this.tab === 'strike' && this.repeat && !f.action && f.state === 'ok' && !this.show && sim.t >= this.nextW) this.play([{ move: this.single.id, zone: zoneFor(this.single, this.zone) }]);
    const s = this.show;
    if (s && !f.action && sim.t > s.started + 0.3) {
      this.nextW = sim.t + 0.8;
      this.show = null;
      this.setReport(
        f.state !== 'ok' ? 'Упал по ходу удара'
        : s.n === 1 ? (s.hits ? 'Попал' : s.blocked ? 'В блок' : 'Промах')
        : `Попало ${s.hits} из ${s.n}${s.blocked ? `, в блок ${s.blocked}` : ''}`,
      );
    }
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

  /** The fighter throws these blows in order, flowing one into the next like in a fight. */
  private play(steps: ComboStep[]): void {
    const sim = this.sim!;
    const f = sim.fighters[0];
    if (!steps.length) return this.setReport('Сначала нажми хотя бы один удар');
    if (f.action || f.state !== 'ok') return;
    const m = MOVE_BY_ID[steps[0].move];
    // Step in like a fighter would: far enough to land from where he stands.
    const dist = f.pos.distanceTo(f.enemy.pos);
    const r = sim.attackRange(f, m);
    const lunge = m.lunge < 0 ? m.lunge * f.scale : Math.max(m.lunge * f.scale, Math.min(dist - r * 0.85 + 0.05, dist - f.radius - f.enemy.radius - 0.1));
    sim.startAction(f, 'attack', { move: m, zone: zoneFor(m, steps[0].zone), lunge });
    f.script = { steps, i: 1 };
    f.comboLeft = steps.length - 1;
    this.show = { n: steps.length, hits: 0, blocked: 0, started: sim.t };
    this.setReport(`${comboName(steps)}…`);
  }

  // ---------- Panel ----------

  private render(): void {
    const groups: [string, (x: Move) => boolean][] = [
      ['Руки', (x) => /Hand$/.test(x.limb)],
      ['Ноги', (x) => /Foot$/.test(x.limb)],
      ['Локти и колени', (x) => /Elbow|Knee/.test(x.limb)],
    ];
    const palette = groups
      .map(([name, ok]) => `<div class="lgroup">${name}</div><div class="chips">${MOVES.filter(ok)
        .map((x) => `<button type="button" class="chip" data-act="add" data-id="${x.id}">${x.name}</button>`)
        .join('')}</div>`)
      .join('');
    const built = this.steps.length
      ? this.steps.map((s, i) => `<div class="cstep"><button type="button" class="cmain" data-act="zone" data-i="${i}"><b>${i + 1}. ${MOVE_BY_ID[s.move].name}</b><span>${ZONE_SHORT[s.zone]}${MOVE_BY_ID[s.move].zones.length > 1 ? ' ↻' : ''}</span></button><button type="button" class="cx" data-act="del" data-i="${i}" aria-label="убрать">✕</button></div>`).join('')
      : '<div class="fnote">Пока пусто. Нажимай удары ниже — они встанут сюда по порядку. Нажми на удар в связке, чтобы сменить, куда он бьёт.</div>';
    const saved = combos()
      .map((c) => `<div class="csaved"><div><b>${comboName(c.steps)}</b><span>${c.steps.map((s) => ZONE_SHORT[s.zone]).join(' · ')}</span></div>
        <div class="crow">
          <button type="button" data-act="playsaved" data-id="${c.id}">Показать</button>
          <button type="button" class="${c.ai ? 'on' : ''}" data-act="ai" data-id="${c.id}">${c.ai ? 'В боях: да' : 'В боях: нет'}</button>
          <button type="button" data-act="remove" data-id="${c.id}" aria-label="удалить">✕</button>
        </div></div>`)
      .join('');
    const speeds = SPEEDS.map(([v, t]) => `<button type="button" class="chip${v === this.slow ? ' on' : ''}" data-act="slow" data-v="${v}">${t}</button>`).join('');
    const views = VIEWS.map(([v, t]) => `<button type="button" class="chip${v === this.view.camView ? ' on' : ''}" data-act="view" data-v="${v}">${t}</button>`).join('');
    const dummy = (['still', 'block', 'dodge'] as const)
      .map((d) => `<button type="button" class="chip${d === this.lab.dummy ? ' on' : ''}" data-act="dummy" data-v="${d}">${d === 'still' ? 'стоит' : d === 'block' ? 'блокирует' : 'уклоняется'}</button>`)
      .join('');

    const common = `
      <div class="lrow"><span>Скорость</span><div class="chips">${speeds}</div></div>
      <div class="lrow"><span>Камера</span><div class="chips">${views}</div></div>
      <div class="lrow"><span>Манекен</span><div class="chips">${dummy}</div></div>
      <label class="lslider"><span>Дистанция до манекена</span><output>${this.lab.dist.toFixed(2)} м</output>
        <input type="range" min="0.6" max="2.4" step="0.05" value="${this.lab.dist}" data-k="dist"></label>`;
    const head = `
      <div class="lab-head">
        <button type="button" data-act="exit">← Выйти</button>
        <div class="ltabs"><button type="button" class="${this.tab === 'combo' ? 'on' : ''}" data-act="tab" data-v="combo">Связки</button><button type="button" class="${this.tab === 'strike' ? 'on' : ''}" data-act="tab" data-v="strike">Удар</button></div>
      </div>`;
    if (this.tab === 'strike') {
      $('lab').innerHTML = head + this.strikeTab(groups) + common;
      return;
    }
    $('lab').innerHTML = head + `
      <div class="lgroup">Твоя связка</div>
      <div class="cbuilt">${built}</div>
      <div class="lab-go3">
        <button type="button" class="primary" data-act="play">Показать</button>
        <button type="button" data-act="save" ${this.steps.length > 1 ? '' : 'disabled'}>Сохранить</button>
        <button type="button" data-act="clear" ${this.steps.length ? '' : 'disabled'}>Очистить</button>
      </div>
      <div class="lab-report" id="labReport">${this.report}</div>
      ${palette}
      ${common}
      <div class="lgroup">Сохранённые связки</div>
      <div class="fnote">Связки с «В боях: да» бойцы бьют сами в боях, когда первый удар подходит по дистанции и моменту.</div>
      ${saved || '<div class="fnote">Пока нет. Собери связку из двух и больше ударов и нажми «Сохранить».</div>'}
      <details><summary>Код связок (прислать мне)</summary>
        <div class="row"><button type="button" data-act="copy">Скопировать код</button><button type="button" data-act="paste">Вставить код</button></div>
        <textarea id="labCode" rows="3" placeholder="сюда появится или вставится код"></textarea>
      </details>`;
  }

  private strikeTab(groups: [string, (x: Move) => boolean][]): string {
    const m = this.single;
    const pick = groups
      .map(([name, ok]) => `<div class="lgroup">${name}</div><div class="chips">${MOVES.filter(ok)
        .map((x) => `<button type="button" class="chip${x === m ? ' on' : ''}" data-act="pick" data-id="${x.id}">${x.name}${isEdited(x.id) ? ' •' : ''}</button>`)
        .join('')}</div>`)
      .join('');
    const zones = m.zones.map((z) => `<button type="button" class="chip${z === this.zone ? ' on' : ''}" data-act="szone" data-z="${z}">${ZONE_SHORT[z]}</button>`).join('');
    const arc = m.path ? `<button type="button" data-act="arc">${shapeOf(m)?.via ? 'Дуга: да' : 'Дуга: нет'}</button>` : '';
    return `
      <div class="fnote">Тащи шары прямо на арене. <b style="color:#f2c14e">Жёлтый</b> — откуда идёт замах, <b style="color:#ff8a3a">оранжевый</b> — через что идёт дуга, <b style="color:#ff4a3a">красное кольцо</b> — куда бьёт. <b style="color:#3fa7ff">Синий</b> — плечи в момент удара (влево-вправо поворот, вверх-вниз наклон), <b style="color:#7fd88f">зелёный</b> — бёдра (поворот и присед). Камеру крути вокруг, где нет шаров.</div>
      <div class="lab-go3">
        <button type="button" class="primary" data-act="sstrike">Ударить</button>
        <button type="button" class="${this.repeat ? 'on' : ''}" data-act="repeat">${this.repeat ? 'Повтор: да' : 'Повтор: нет'}</button>
        ${arc || '<span></span>'}
      </div>
      <div class="lab-report" id="labReport">${this.report}</div>
      <div class="lrow"><span>Куда</span><div class="chips">${zones}</div></div>
      <div class="lab-go3">
        <button type="button" data-act="faster">Быстрее</button>
        <button type="button" data-act="slower">Медленнее</button>
        <button type="button" data-act="sreset">Как было</button>
      </div>
      <div class="fnote">${m.name}: ${m.duration.toFixed(2)} с <span id="labEdited">${isEdited(m.id) ? 'изменён' : ''}</span>${m.path ? '' : ' · у этого удара нет траектории, только плечи и бёдра'}</div>
      ${pick}
      <details><summary>Код ударов (прислать мне)</summary>
        <div class="row"><button type="button" data-act="scopy">Скопировать код</button><button type="button" data-act="spaste">Вставить код</button></div>
        <textarea id="labCode" rows="3" placeholder="сюда появится или вставится код"></textarea>
      </details>`;
  }

  // ---------- Events ----------

  private onClick(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b || (b as HTMLButtonElement).disabled) return;
    const i = Number(b.dataset.i);
    switch (b.dataset.act) {
      case 'exit':
        return this.stop();
      case 'tab':
        this.tab = b.dataset.v as 'combo' | 'strike';
        this.repeat = false;
        this.report = this.tab === 'strike' ? 'Выбери удар и тащи шары на арене' : 'Нажимай удары внизу по порядку, потом «Показать»';
        break;
      case 'pick':
        this.single = MOVE_BY_ID[b.dataset.id!];
        this.zone = zoneFor(this.single, this.zone);
        break;
      case 'szone':
        this.zone = b.dataset.z as Zone;
        break;
      case 'sstrike':
        this.play([{ move: this.single.id, zone: zoneFor(this.single, this.zone) }]);
        return;
      case 'repeat':
        this.repeat = !this.repeat;
        break;
      case 'arc':
        this.editor.toggleArc();
        break;
      case 'faster':
      case 'slower':
        this.single.duration = Math.round(this.single.duration * (b.dataset.act === 'faster' ? 0.9 : 1.1) * 100) / 100;
        commit(this.single);
        break;
      case 'sreset':
        resetMove(this.single.id);
        break;
      case 'scopy': {
        const code = exportCode();
        const ta = $<HTMLTextAreaElement>('labCode');
        ta.value = code;
        ta.select();
        navigator.clipboard?.writeText(code).catch(() => {});
        this.setReport(code.length > 20 ? 'Код скопирован' : 'Ты ещё ничего не менял');
        return;
      }
      case 'spaste': {
        const r = importCode($<HTMLTextAreaElement>('labCode').value);
        this.report = typeof r === 'number' ? `Загружено ударов: ${r}` : r;
        break;
      }
      case 'add': {
        const m = MOVE_BY_ID[b.dataset.id!];
        const prev = this.steps[this.steps.length - 1]?.zone ?? 'head';
        this.steps.push({ move: m.id, zone: zoneFor(m, prev) });
        break;
      }
      case 'zone': {
        const s = this.steps[i];
        const zs = MOVE_BY_ID[s.move].zones;
        s.zone = zs[(zs.indexOf(s.zone) + 1) % zs.length];
        break;
      }
      case 'del':
        this.steps.splice(i, 1);
        break;
      case 'clear':
        this.steps = [];
        break;
      case 'play':
        this.play(this.steps);
        return;
      case 'save':
        addCombo(this.steps);
        this.report = `Сохранено: ${comboName(this.steps)}`;
        break;
      case 'playsaved': {
        const c = combos().find((x) => x.id === b.dataset.id);
        if (c) this.play(c.steps);
        return;
      }
      case 'ai':
        toggleAi(b.dataset.id!);
        break;
      case 'remove':
        removeCombo(b.dataset.id!);
        break;
      case 'slow':
        this.slow = Number(b.dataset.v);
        break;
      case 'view':
        this.view.camView = b.dataset.v!;
        break;
      case 'dummy':
        this.lab.dummy = b.dataset.v as Lab['dummy'];
        this.rebuild();
        break;
      case 'copy': {
        const code = exportCombos();
        const ta = $<HTMLTextAreaElement>('labCode');
        ta.value = code;
        ta.select();
        navigator.clipboard?.writeText(code).catch(() => {});
        this.setReport(combos().length ? 'Код скопирован' : 'Сохранённых связок пока нет');
        return;
      }
      case 'paste': {
        const r = importCombos($<HTMLTextAreaElement>('labCode').value);
        this.report = typeof r === 'number' ? `Загружено связок: ${r}` : r;
        break;
      }
      default:
        return;
    }
    const panel = $('lab');
    const scroll = panel.scrollTop;
    const open = [...panel.querySelectorAll('details')].map((d) => d.open);
    this.render();
    this.syncEditor();
    [...panel.querySelectorAll('details')].forEach((d, k) => (d.open = open[k] ?? d.open));
    panel.scrollTop = scroll;
  }
}

function zoneFor(m: Move, want: Zone): Zone {
  return m.zones.includes(want) ? want : m.zones[0];
}
