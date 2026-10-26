// Screens of «Свои турниры» (custom.ts): your fighters, the editor with the points, the
// tournament bracket, moving fighters between devices. Drawn in the career's section (#career,
// data-mode="custom") so it looks like the career; its own buttons carry data-cu.
import {
  CSTATS, CSTAT_NAME, CSTAT_DESC, LEVELS, BUDGET, BODY, STYLES, levelCost, left, spent, fullName, shortName, ratingOf, chance,
  toFighter, blankFighter, randomFighter, copyFighter, autoSpend, loadStore, saveStore, startTour, tourMan, roundName,
  decideMatch, countMatch, currentRound, type CustomFighter, type CustomStore, type CMatch,
} from './custom';
import { DISCIPLINE_BY_ID } from './disciplines';
import { SKINS, defaultSkin } from './skins';
import { MAP_BY_ID, type MapId } from './maps';
import { place } from './story';
import { packCode, unpackCode, saveTextFile } from './saveCode';
import type { CareerHooks } from './careerUi';

type Screen = 'list' | 'edit' | 'tsetup' | 'tour' | 'xfer';
const $ = (id: string) => document.getElementById(id) as HTMLElement;
const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
const MAPS: MapId[] = ['ring', 'cage', 'alley', 'dojo', 'roof', 'bar', 'basement'];

/** How good a rating is, in the story's terms. */
const levelWord = (r: number) => (r >= 70 ? 'легенда' : r >= 58 ? 'чемпион города' : r >= 45 ? 'боец города' : r >= 32 ? 'районный' : r >= 20 ? 'подвальный' : 'новичок');

export class CustomUi {
  private s: CustomStore = loadStore();
  private screen: Screen = 'list';
  private ed: CustomFighter | null = null;
  private toast = '';
  private asking: { text: string; yes: () => void } | null = null;
  private setup = { size: 8, rounds: 3, map: 'ring' as MapId, picked: [] as string[] };
  private code = '';

  constructor(private hooks: CareerHooks) {
    const root = $('career');
    root.addEventListener('click', (e) => {
      if (root.dataset.mode !== 'custom') return;
      const b = (e.target as HTMLElement).closest('[data-cu]') as HTMLElement | null;
      if (b && !(b as HTMLButtonElement).disabled) this.act(b);
    });
    root.addEventListener('input', (e) => {
      if (root.dataset.mode !== 'custom' || !this.ed) return;
      const el = e.target as HTMLInputElement;
      const k = el.dataset.cuIn;
      if (!k) return;
      const f = this.ed;
      if (k === 'first' || k === 'nick' || k === 'last') f[k] = el.value.slice(0, 18);
      else if (k === 'height') f.height = Number(el.value) / 100;
      else if (k === 'weight') f.weight = Number(el.value);
      else if (k === 'aggr') f.aggression = Number(el.value) / 100;
      const out = el.parentElement?.querySelector('output');
      if (out) out.textContent = k === 'height' ? `${f.height.toFixed(2)} м` : k === 'weight' ? `${f.weight} кг` : k === 'aggr' ? `${Math.round(f.aggression * 100)}%` : '';
    });
    root.addEventListener('change', (e) => {
      if (root.dataset.mode !== 'custom') return;
      const el = e.target as HTMLInputElement;
      if (el.id === 'cuFile' && el.files?.[0]) void el.files[0].text().then((t) => this.importCode(t));
    });
  }

  get open(): boolean {
    return !$('career').hidden && $('career').dataset.mode === 'custom';
  }

  show(): void {
    this.s = loadStore();
    const root = $('career');
    root.dataset.mode = 'custom';
    root.hidden = false;
    this.render();
  }

  hide(): void {
    $('career').hidden = true;
    $('career').dataset.mode = '';
    this.hooks.close();
  }

  private save(): void {
    saveStore(this.s);
  }

  private go(s: Screen): void {
    this.screen = s;
    this.render();
    $('career').scrollTop = 0;
  }

  private say(t: string | null): void {
    if (t) this.toast = t;
    this.render();
  }

  private ask(text: string, yes: () => void): void {
    this.asking = { text, yes };
    this.render();
  }

  render(): void {
    const tabs: [Screen, string][] = [['list', '👥 Бойцы'], ['tsetup', '🏆 Турнир'], ['xfer', '📤 Перенос']];
    const cur = this.screen === 'edit' ? 'list' : this.screen === 'tour' ? 'tsetup' : this.screen;
    const top = `<div class="ctop"><button type="button" data-cu="exit">← Арена</button><div class="wallet"><b>Свои турниры</b></div></div>
      <div class="row cutabs">${tabs.map(([id, n]) => `<button type="button" class="${cur === id ? 'primary' : ''}" data-cu="to" data-s="${id === 'tsetup' && this.s.tour && !this.s.tour.done ? 'tour' : id}">${n}</button>`).join('')}</div>`;
    const body = this.screen === 'edit' ? this.editView() : this.screen === 'tsetup' ? this.setupView() : this.screen === 'tour' ? this.tourView() : this.screen === 'xfer' ? this.xferView() : this.listView();
    const ask = this.asking ? `<div class="askbox"><div>${esc(this.asking.text)}</div><div class="row"><button type="button" class="primary" data-cu="yes">Да</button><button type="button" data-cu="no">Нет</button></div></div>` : '';
    const toast = this.toast ? `<div class="toast">${esc(this.toast)}</div>` : '';
    this.toast = '';
    $('career').innerHTML = top + ask + toast + body;
  }

  // ---------- Fighters ----------

  private card(f: CustomFighter, btns: string): string {
    const r = ratingOf(f);
    return `<div class="hero cucard"><div class="fname">${esc(fullName(f))}</div>
      <div class="fmeta">${esc(DISCIPLINE_BY_ID[f.disc].name)} · ${f.height.toFixed(2)} м · ${f.weight} кг · рейтинг <b>${r}</b> (${levelWord(r)})</div>
      <div class="fmeta">Бои ${f.wins}–${f.losses}${f.titles ? ` · 🏆 ${f.titles}` : ''}</div>
      <div class="cubars">${CSTATS.map((k) => `<span title="${CSTAT_NAME[k]}"><i>${CSTAT_NAME[k].slice(0, 4)}</i><b style="width:${(f.lv[k] / LEVELS) * 100}%"></b></span>`).join('')}</div>
      ${btns}</div>`;
  }

  private listView(): string {
    const s = this.s;
    const list = s.fighters.map((f) => this.card(f, `<div class="row">
        <button type="button" data-cu="edit" data-id="${f.id}">✏️ Изменить</button>
        <button type="button" data-cu="spar" data-id="${f.id}">👊 Бой</button>
        <button type="button" data-cu="copy" data-id="${f.id}">⧉ Копия</button>
        <button type="button" data-cu="code1" data-id="${f.id}">📋 Код</button>
        <button type="button" data-cu="del" data-id="${f.id}">✕</button></div>`)).join('');
    return `<div class="h1">👥 Мои бойцы</div>
      <div class="fnote">Собери своего бойца: стиль, тело, внешность и ${BUDGET} очков на навыки. Один навык до максимума стоит 30 очков — всё сразу не прокачать.</div>
      <div class="row"><button type="button" class="primary" data-cu="new">➕ Новый боец</button><button type="button" data-cu="rand">🎲 Случайный</button><button type="button" data-cu="rand8">🎲×8</button></div>
      ${list || '<div class="pill">Бойцов пока нет. Создай своего или сгенерируй случайных.</div>'}
      ${s.hall.length ? `<div class="newsbox"><div class="h2">🏆 Зал славы</div>${s.hall.slice(0, 10).map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}`;
  }

  private editView(): string {
    const f = this.ed!;
    const pts = left(f);
    const r = ratingOf(f);
    const stats = CSTATS.map((k) => {
      const l = f.lv[k];
      const next = l < LEVELS ? levelCost(l + 1) : 0;
      return `<div class="custat"><div class="cuhead"><b>${CSTAT_NAME[k]}</b><small>${CSTAT_DESC[k]}</small></div>
        <div class="cuctl"><button type="button" data-cu="lv" data-k="${k}" data-d="-1" ${l ? '' : 'disabled'}>−</button>
        <div class="culv">${Array.from({ length: LEVELS }, (_, i) => `<i class="${i < l ? 'on' : ''}"></i>`).join('')}</div>
        <button type="button" data-cu="lv" data-k="${k}" data-d="1" ${l < LEVELS && next <= pts ? '' : 'disabled'}>+${next ? ` <small>${next}</small>` : ''}</button></div></div>`;
    }).join('');
    const styles = STYLES.map((d) => `<button type="button" class="${f.disc === d ? 'primary' : ''}" data-cu="disc" data-v="${d}">${esc(DISCIPLINE_BY_ID[d].name)}</button>`).join('');
    const skin = f.skin ?? defaultSkin(f.disc);
    const skins = SKINS.map((k) => `<button type="button" class="${skin === k.id ? 'primary' : ''}" data-cu="skin" data-v="${k.id}">${esc(k.name)}</button>`).join('');
    return `<div class="h1">✏️ Боец</div>
      <div class="cupts">Очки: <b>${pts}</b> из ${BUDGET} · рейтинг <b>${r}</b> (${levelWord(r)})</div>
      <div class="cunames">
        <label>Имя<input data-cu-in="first" value="${esc(f.first)}" maxlength="18"></label>
        <label>Прозвище<input data-cu-in="nick" value="${esc(f.nick)}" maxlength="18"></label>
        <label>Фамилия<input data-cu-in="last" value="${esc(f.last)}" maxlength="18"></label>
      </div>
      <div class="h2">Стиль</div><div class="cuchips">${styles}</div>
      <div class="fnote">${esc(DISCIPLINE_BY_ID[f.disc].desc)}</div>
      <div class="h2">Тело</div>
      <label class="curange"><span>Рост</span><input type="range" data-cu-in="height" min="${BODY.hLo * 100}" max="${BODY.hHi * 100}" value="${Math.round(f.height * 100)}"><output>${f.height.toFixed(2)} м</output></label>
      <label class="curange"><span>Вес</span><input type="range" data-cu-in="weight" min="${BODY.wLo}" max="${BODY.wHi}" value="${f.weight}"><output>${f.weight} кг</output></label>
      <label class="curange"><span>Агрессия</span><input type="range" data-cu-in="aggr" min="0" max="100" value="${Math.round(f.aggression * 100)}"><output>${Math.round(f.aggression * 100)}%</output></label>
      <div class="fnote">Тяжёлый бьёт сильнее и стоит крепче, но быстрее устаёт. Высокий дальше достаёт.</div>
      <div class="h2">Навыки · очки: ${pts}</div>${stats}
      <div class="row"><button type="button" data-cu="auto">🎲 Раскидать остаток</button><button type="button" data-cu="reset">↺ Сбросить очки</button></div>
      <div class="h2">Внешность</div><div class="cuchips">${skins}</div>
      <div class="row cusave"><button type="button" class="primary" data-cu="save">💾 Сохранить</button><button type="button" data-cu="cancel">Отмена</button></div>`;
  }

  // ---------- Tournament ----------

  private setupView(): string {
    const s = this.s;
    const st = this.setup;
    st.picked = st.picked.filter((id) => s.fighters.some((f) => f.id === id));
    const sizes = [4, 8, 16].map((n) => `<button type="button" class="${st.size === n ? 'primary' : ''}" data-cu="size" data-v="${n}">${n} бойцов</button>`).join('');
    const rounds = [[0, 'До конца'], [1, '1 раунд'], [3, '3 раунда'], [5, '5 раундов']].map(([n, t]) => `<button type="button" class="${st.rounds === n ? 'primary' : ''}" data-cu="rounds" data-v="${n}">${t}</button>`).join('');
    const maps = MAPS.map((m) => `<button type="button" class="${st.map === m ? 'primary' : ''}" data-cu="map" data-v="${m}">${esc(MAP_BY_ID[m].name)}</button>`).join('');
    const men = s.fighters.map((f) => {
      const on = st.picked.includes(f.id);
      return `<button type="button" class="cupick${on ? ' on' : ''}" data-cu="pick" data-id="${f.id}">${on ? '✅' : '⬜'} ${esc(shortName(f))} <small>${esc(DISCIPLINE_BY_ID[f.disc].name)} · ${f.weight} кг · ${ratingOf(f)}</small></button>`;
    }).join('');
    const fill = Math.max(0, st.size - st.picked.length);
    return `<div class="h1">🏆 Новый турнир</div>
      ${s.tour && !s.tour.done ? '<button type="button" data-cu="to" data-s="tour">▶ Вернуться к текущему турниру</button>' : ''}
      <div class="h2">Участники</div><div class="cuchips">${sizes}</div>
      <div class="h2">Бой</div><div class="cuchips">${rounds}</div>
      <div class="h2">Арена</div><div class="cuchips">${maps}</div>
      <div class="h2">Твои бойцы (${st.picked.length}/${st.size})</div>
      <div class="cupicks">${men || '<div class="fnote">Своих бойцов нет — турнир соберётся из случайных.</div>'}</div>
      ${fill ? `<div class="fnote">Остальные ${fill} — случайные бойцы.</div>` : ''}
      <button type="button" class="primary wide" data-cu="start">🏆 Начать турнир</button>`;
  }

  private tourView(): string {
    const t = this.s.tour;
    if (!t) return this.setupView();
    const r = t.rounds_.length - 1;
    const R = currentRound(t);
    const row = (m: CMatch, live: boolean) => {
      const A = tourMan(t, m.a), B = tourMan(t, m.b);
      const p = Math.round(chance(A, B) * 100);
      const side = (f: CustomFighter, pc: number) => `<div class="cupman${m.w === f.id ? ' won' : ''}"><b>${esc(shortName(f))}</b><small>${esc(DISCIPLINE_BY_ID[f.disc].name)} · ${f.weight} кг · ${ratingOf(f)}</small>${m.w ? (m.w === f.id ? ' <em>✔</em>' : '') : ` <i class="kf">${pc}%</i>`}</div>`;
      return `<div class="cupm">${side(A, p)}${side(B, 100 - p)}${m.how === 'odds' ? '<small class="fnote">досчитан</small>' : ''}
        ${!m.w && live ? `<div class="row"><button type="button" class="primary" data-cu="watch" data-i="${R.indexOf(m)}">👁 Смотреть</button><button type="button" data-cu="count" data-i="${R.indexOf(m)}">⏩ Досчитать</button></div>` : ''}</div>`;
    };
    const champ = t.done && t.champ ? tourMan(t, t.champ) : null;
    return `<div class="h1">🏆 Турнир · ${t.men.length} бойцов</div>
      <div class="fnote">${esc(MAP_BY_ID[t.map].name)} · ${t.rounds ? `${t.rounds} раунд.` : 'до конца'}</div>
      ${champ ? `<div class="poster"><div class="h1">👑 ${esc(fullName(champ))}</div><div class="fnote">Чемпион турнира!</div></div><button type="button" class="primary wide" data-cu="to" data-s="tsetup">Новый турнир</button>` : ''}
      ${!t.done ? `<div class="h2">${roundName(t, r)}</div>${R.map((m) => row(m, true)).join('')}
        ${R.filter((m) => !m.w).length > 1 ? '<button type="button" data-cu="countall">⏩ Досчитать все бои раунда</button>' : ''}` : ''}
      ${t.rounds_.slice(0, t.done ? t.rounds_.length : r).map((RR, k) => `<details${t.done && k === t.rounds_.length - 1 ? ' open' : ''}><summary>${roundName(t, k)}</summary>${RR.map((m) => row(m, false)).join('')}</details>`).join('')}`;
  }

  // ---------- Moving between devices ----------

  private xferView(): string {
    return `<div class="h1">📤 Перенос бойцов</div>
      <div class="fnote">Скачай файл с бойцами и открой его на другом устройстве. Или скопируй код и пришли его себе или другу.</div>
      <div class="row"><button type="button" class="primary" data-cu="file">💾 Скачать файл</button><button type="button" data-cu="codeall">📋 Код всех бойцов</button></div>
      ${this.code ? `<textarea class="savecode" readonly>${esc(this.code)}</textarea><button type="button" data-cu="copycode">Скопировать</button>` : ''}
      <div class="h2">Загрузить</div>
      <button type="button" data-cu="loadfile">📂 Загрузить файл</button><input type="file" id="cuFile" accept=".txt,text/plain" hidden>
      <textarea class="savecode" id="cuPaste" placeholder="вставь сюда код бойца или бойцов"></textarea>
      <button type="button" data-cu="paste">Добавить из кода</button>
      <div class="fnote">Загруженные бойцы добавятся к твоим. Боец с тем же номером заменится.</div>`;
  }

  private async importCode(text: string): Promise<void> {
    const many = await unpackCode<{ fighters: CustomFighter[] }>('БОЙЦЫ', text);
    const one = many ? null : await unpackCode<CustomFighter>('БОЕЦ', text);
    const got = many?.fighters ?? (one ? [one] : []);
    if (!got.length) return this.say('Это не код бойцов');
    for (const f of got) {
      if (!f?.lv || !f.disc) continue;
      const i = this.s.fighters.findIndex((x) => x.id === f.id);
      if (i >= 0) this.s.fighters[i] = f;
      else this.s.fighters.push(f);
    }
    this.save();
    this.screen = 'list';
    this.say(`Загружено бойцов: ${got.length}`);
  }

  // ---------- Fights ----------

  /** A fight in the arena between two custom men; `done` gets whether the first one won. */
  private fight(a: CustomFighter, b: CustomFighter, rounds: number, map: MapId, title: string, final: boolean, done: (aWon: boolean) => void): void {
    $('career').hidden = true;
    this.hooks.fight(toFighter(a), toFighter(b), { ...place(map, rounds), name: title }, title, (r) => {
      done(r.won);
      this.show();
    }, undefined, final ? { title: true, cls: 'Чемпион турнира' } : undefined);
  }

  private act(b: HTMLElement): void {
    const s = this.s;
    const id = b.dataset.id;
    const f = id ? s.fighters.find((x) => x.id === id) : undefined;
    switch (b.dataset.cu) {
      case 'exit':
        return this.hide();
      case 'yes': {
        const a = this.asking;
        this.asking = null;
        if (a) a.yes();
        return this.render();
      }
      case 'no':
        this.asking = null;
        return this.render();
      case 'to':
        return this.go(b.dataset.s as Screen);
      case 'new':
        this.ed = blankFighter();
        return this.go('edit');
      case 'rand':
        s.fighters.push(randomFighter());
        this.save();
        return this.say('Добавлен случайный боец');
      case 'rand8':
        for (let i = 0; i < 8; i++) s.fighters.push(randomFighter());
        this.save();
        return this.say('Добавлено 8 случайных бойцов');
      case 'edit':
        if (!f) return;
        this.ed = JSON.parse(JSON.stringify(f));
        return this.go('edit');
      case 'copy':
        if (!f) return;
        s.fighters.push(copyFighter(f));
        this.save();
        return this.say('Копия добавлена');
      case 'del':
        if (!f) return;
        return this.ask(`Удалить ${shortName(f)}?`, () => {
          s.fighters = s.fighters.filter((x) => x !== f);
          this.save();
        });
      case 'spar': {
        if (!f) return;
        const opp = randomFighter();
        return this.fight(f, opp, 0, 'ring', `Пробный бой: ${shortName(f)} против ${shortName(opp)}`, false, (won) => {
          const me = this.s.fighters.find((x) => x.id === f.id);
          if (me) won ? me.wins++ : me.losses++;
          this.save();
          this.toast = won ? 'Победа!' : 'Поражение';
        });
      }
      case 'code1':
        if (!f) return;
        void packCode('БОЕЦ', f).then((c) => {
          this.code = c;
          void navigator.clipboard?.writeText(c).catch(() => undefined);
          this.screen = 'xfer';
          this.say('Код бойца скопирован');
        });
        return;
      // --- editor ---
      case 'lv': {
        const e = this.ed!;
        const k = b.dataset.k as keyof CustomFighter['lv'];
        const d = Number(b.dataset.d);
        if (d > 0 && (e.lv[k] >= LEVELS || levelCost(e.lv[k] + 1) > left(e))) return;
        e.lv[k] = Math.max(0, Math.min(LEVELS, e.lv[k] + d));
        return this.render();
      }
      case 'disc':
        this.ed!.disc = b.dataset.v as CustomFighter['disc'];
        if (!this.ed!.skin || SKINS.every((x) => x.id !== this.ed!.skin)) this.ed!.skin = defaultSkin(this.ed!.disc);
        return this.render();
      case 'skin':
        this.ed!.skin = b.dataset.v as CustomFighter['skin'];
        return this.render();
      case 'auto':
        autoSpend(this.ed!);
        return this.render();
      case 'reset':
        for (const k of CSTATS) this.ed!.lv[k] = 0;
        return this.render();
      case 'save': {
        const e = this.ed!;
        if (spent(e) > BUDGET) return this.say('Очков больше, чем можно');
        const i = s.fighters.findIndex((x) => x.id === e.id);
        if (i >= 0) s.fighters[i] = e;
        else s.fighters.push(e);
        this.save();
        this.ed = null;
        this.screen = 'list';
        return this.say(`${shortName(e)} сохранён${left(e) ? ` (остались неистраченные очки: ${left(e)})` : ''}`);
      }
      case 'cancel':
        this.ed = null;
        return this.go('list');
      // --- tournament ---
      case 'size':
        this.setup.size = Number(b.dataset.v);
        this.setup.picked = this.setup.picked.slice(0, this.setup.size);
        return this.render();
      case 'rounds':
        this.setup.rounds = Number(b.dataset.v);
        return this.render();
      case 'map':
        this.setup.map = b.dataset.v as MapId;
        return this.render();
      case 'pick': {
        const p = this.setup.picked;
        const i = p.indexOf(id!);
        if (i >= 0) p.splice(i, 1);
        else if (p.length < this.setup.size) p.push(id!);
        else return this.say(`Уже выбрано ${this.setup.size}`);
        return this.render();
      }
      case 'start': {
        const go = () => {
          const men = this.setup.picked.map((x) => s.fighters.find((m) => m.id === x)!).filter(Boolean);
          while (men.length < this.setup.size) men.push(randomFighter());
          s.tour = startTour(men, this.setup.rounds, this.setup.map);
          this.save();
          this.go('tour');
        };
        if (s.tour && !s.tour.done) return this.ask('Текущий турнир не закончен. Начать новый?', go);
        return go();
      }
      case 'watch': {
        const t = s.tour!;
        const R = currentRound(t);
        const m = R[Number(b.dataset.i)];
        if (!m || m.w) return;
        const final = R.length === 1;
        const A = tourMan(t, m.a), B = tourMan(t, m.b);
        return this.fight(A, B, t.rounds, t.map, `${roundName(t, t.rounds_.length - 1)}: ${shortName(A)} против ${shortName(B)}`, final, (won) => {
          this.s = loadStore();
          const tt = this.s.tour!;
          const mm = currentRound(tt).find((x) => x.a === m.a && x.b === m.b)!;
          decideMatch(this.s, mm, won ? m.a : m.b, 'ring');
          this.save();
          this.toast = `Победил ${shortName(won ? A : B)}`;
          if (tt.done) this.toast = `👑 ${fullName(tourMan(tt, tt.champ!))} — чемпион турнира!`;
        });
      }
      case 'count': {
        const m = currentRound(s.tour!)[Number(b.dataset.i)];
        if (!m || m.w) return;
        countMatch(s, m);
        this.save();
        return this.say(`Победил ${shortName(tourMan(s.tour!, m.w!))}`);
      }
      case 'countall':
        for (const m of [...currentRound(s.tour!)]) if (!m.w) countMatch(s, m);
        this.save();
        return this.say('Бои раунда досчитаны');
      // --- moving ---
      case 'file':
        void packCode('БОЙЦЫ', { fighters: s.fighters }).then((c) => saveTextFile(`arena-fighters-${new Date().toISOString().slice(0, 10)}.txt`, c)).then((t) => this.say(t));
        return;
      case 'codeall':
        void packCode('БОЙЦЫ', { fighters: s.fighters }).then((c) => {
          this.code = c;
          this.render();
        });
        return;
      case 'copycode':
        void navigator.clipboard?.writeText(this.code).then(() => this.say('Скопировано'), () => this.say('Не получилось — выдели код и скопируй'));
        return;
      case 'loadfile':
        ($('cuFile') as HTMLInputElement | null)?.click();
        return;
      case 'paste':
        void this.importCode(($('cuPaste') as HTMLTextAreaElement).value);
        return;
    }
  }
}
