// The manager's screens. One thing per screen: the home screen shows your fighter and
// two big actions (train, fight); the gym, the fight ladder, the team and the market are
// their own screens with a way back. Before a fight you see who you meet; after it,
// what you got.
import {
  STAT_KEYS, STAT_INFO, INTENSITY, TIERS, TIER_BY_ID, MAX_ROSTER,
  load, save, reset, newCareer, tick, startTraining, gainOf, busy, refreshMarket, buy, sell,
  rating, talentWord, value, opponent, afterFight, tourFight, roundName, short, odds,
  person, current, myMatch, settle, settleOthers, finished, closeTour,
  rankings, rankOf, relOf, relWord, rivalsOf, titleBout, tierOf, TITLE_PURSE,
  DAY_MS, MARKET_DAYS, dayName, weekday, weekStart, eventsOn, evById, dayCost, nextDay, canBook, book, unbook, rebook,
  challenge, startTour, evTitle, bookedOn,
  type Career, type CareerFighter, type Tier, type FightResult, type StatKey, type Ev,
} from './career';
import { DISCIPLINE_BY_ID } from './disciplines';

export interface CareerHooks {
  /** Show this fight in the arena; `done` gets the result when it is over. */
  fight(me: CareerFighter, opp: CareerFighter, tier: Tier, title: string, done: (r: FightResult) => void): void;
  /** Back to the sandbox. */
  close(): void;
}

type Screen = 'cal' | 'rank' | 'profile' | 'bracket' | 'home' | 'gym' | 'fights' | 'preview' | 'result' | 'team' | 'market' | 'log';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class CareerUi {
  c: Career;
  private screen: Screen = 'home';
  private stat: StatKey = 'bodySpeed';
  private toast = '';
  private timer = 0;
  /** The fight about to happen (preview screen). */
  private bill: { tier: Tier; opp: CareerFighter; tour: boolean; title?: boolean; ev?: Ev } | null = null;
  /** The day open in the calendar. */
  private calDay = 0;
  /** A question waiting for Да / Нет (the browser's confirm() is blocked inside the artifact). */
  private asking: { text: string; run: () => void } | null = null;
  /** The fighter shown on the profile screen. */
  private profileId = '';
  /** What happened in the last fight (result screen). */
  private outcome: { won: boolean; title: string; lines: string[] } | null = null;

  constructor(private hooks: CareerHooks) {
    this.c = load() ?? newCareer();
    save(this.c);
    $('career').addEventListener('click', (e) => this.onClick(e));
  }

  get open(): boolean {
    return !$('career').hidden;
  }

  show(): void {
    $('career').hidden = false;
    tick(this.c);
    this.render();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.everySecond(), 1000);
  }

  hide(): void {
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.close();
  }

  private everySecond(): void {
    const done = tick(this.c);
    if (done.length) {
      this.toast = done.join(' · ');
      this.render();
      return;
    }
    // Only the day's clock moves.
    const left = this.c.dayAt + DAY_MS - Date.now();
    document.querySelectorAll<HTMLElement>('#career .daybar').forEach((el) => {
      const t = el.querySelector('.cl');
      if (t) t.textContent = clock(left);
      const bar = el.querySelector<HTMLElement>('.bar i');
      if (bar) bar.style.width = `${Math.min(100, 100 - (100 * left) / DAY_MS)}%`;
      const nb = el.querySelector<HTMLElement>('[data-act="nextday"] b');
      if (nb) nb.textContent = this.dayBtn();
    });
  }

  private me(): CareerFighter {
    return this.c.roster.find((f) => f.id === this.c.pick) ?? this.c.roster[0];
  }

  private go(s: Screen): void {
    this.screen = s;
    if (s === 'cal' && this.calDay < this.c.day) this.calDay = this.c.day;
    this.render();
    $('career').scrollTop = 0;
  }

  render(): void {
    const c = this.c;
    const top = `<div class="ctop">
      ${this.screen === 'home' ? '<button type="button" data-act="sandbox">← Песочница</button>' : '<button type="button" data-act="back">← Назад</button>'}
      <div class="wallet"><span title="деньги">$<b>${c.money.toLocaleString('ru')}</b></span><span title="жетоны: ускоряют ожидание">◆ <b>${c.tokens}</b></span></div>
    </div>
    <div class="cheats">
      <span>Тест:</span>
      <button type="button" data-act="cheat" data-k="tokens" data-v="100">+100 ◆</button>
      <button type="button" data-act="cheat" data-k="money" data-v="500">+$500</button>
      <button type="button" data-act="cheat" data-k="money" data-v="-500">−$500</button>
    </div>`;
    const body =
      this.screen === 'home' ? this.home()
      : this.screen === 'gym' ? this.gym()
      : this.screen === 'fights' || this.screen === 'cal' ? this.calendar()
      : this.screen === 'preview' ? this.preview()
      : this.screen === 'bracket' ? this.bracket()
      : this.screen === 'rank' ? this.rankView()
      : this.screen === 'profile' ? this.profile()
      : this.screen === 'result' ? this.result()
      : this.screen === 'team' ? this.team()
      : this.screen === 'market' ? this.market()
      : this.logView();
    const ask = this.asking
      ? `<div class="askbox"><div>${esc(this.asking.text)}</div><div class="row"><button type="button" class="primary" data-act="yes">Да</button><button type="button" data-act="no">Нет</button></div></div>`
      : '';
    $('career').innerHTML = top + ask + (this.toast ? `<div class="toast">${esc(this.toast)}</div>` : '') + body;
    this.toast = '';
  }

  // ---------- Home ----------

  private home(): string {
    const c = this.c;
    const f = this.me();
    const help = c.seenHelp
      ? ''
      : `<div class="help">
          <div class="h2">Как играть</div>
          <ol>
            <li>Карьера идёт <b>по дням</b>. Каждый день боец либо <b>тренируется</b>, либо <b>дерётся</b>, либо отдыхает.</li>
            <li>В <b>календаре</b> — вечера боёв, турниры и бои за пояс. Запишись заранее; в день боя нажми «На бой».</li>
            <li>День идёт ${DAY_MS / 60000} минуты настоящего времени. <b>Жетоны ◆</b> заканчивают его сразу. <b>Деньги $</b> — на тренировки, взносы и бойцов.</li>
            <li>Победы дают деньги и <b>известность</b>; она открывает лиги выше. После тяжёлого боя боец несколько дней лечится.</li>
          </ol>
          <button type="button" data-act="help">Понятно</button>
        </div>`;
    const tour = this.tourBanner();
    return `${help}${this.dayBar()}${tour}${this.today()}
      ${this.hero(f)}
      <div class="big2">
        <button type="button" class="bigbtn" data-act="to" data-s="gym"><b>Тренировать</b><span>${busy(c, f) ? 'сегодня занят' : 'занимает день'}</span></button>
        <button type="button" class="bigbtn primary" data-act="to" data-s="cal"><b>Календарь</b><span>бои, турниры, пояс</span></button>
      </div>
      <div class="nav4">
        <button type="button" data-act="to" data-s="rank">Рейтинг</button>
        <button type="button" data-act="to" data-s="team">Команда <b>${c.roster.length}/${MAX_ROSTER}</b></button>
        <button type="button" data-act="to" data-s="market">Рынок</button>
        <button type="button" data-act="to" data-s="log">Журнал</button>
      </div>
      <div class="newsbox"><div class="h2">Новости мира боёв</div>${(c.news ?? []).slice(0, 4).map((x) => `<div>${esc(x)}</div>`).join('')}<div class="fnote">Бойцы мира дерутся каждый день, даже когда игра закрыта.</div></div>`;
  }

  private dayBtn(): string {
    const n = dayCost(this.c);
    return n ? `Следующий день · ${n} ◆` : 'Следующий день';
  }

  /** Today's date, the day's clock, and the button that ends it. */
  private dayBar(): string {
    const c = this.c;
    const left = c.dayAt + DAY_MS - Date.now();
    return `<div class="daybar">
      <div class="dtop"><b>📅 ${dayName(c.day)}, ${weekday(c.day)}</b><span>день ${c.day} · до конца дня <b class="cl">${clock(left)}</b></span></div>
      <div class="bar"><i style="width:${Math.min(100, 100 - (100 * left) / DAY_MS)}%"></i></div>
      <button type="button" data-act="nextday"><b>${this.dayBtn()}</b></button>
    </div>`;
  }

  /** Our fights today, and the next ones booked. */
  private today(): string {
    const c = this.c;
    const mine = c.events.filter((e) => e.f && !e.done && e.day >= c.day).sort((a, b) => a.day - b.day);
    if (!mine.length) return '<div class="fnote">Боёв не назначено. Запишись на вечер боёв или турнир в календаре.</div>';
    return mine.slice(0, 3).map((e) => this.evCard(e, true)).join('');
  }

  /** The fighter: who he is, what he can do now and how far he can go, what he is doing. */
  private hero(f: CareerFighter, compact = false): string {
    const d = DISCIPLINE_BY_ID[f.discipline];
    return `<div class="hero">
      <div class="hero-top">
        <div>
          <div class="fname">${esc(f.name)}</div>
          <div class="fmeta">${esc(d.name)} · ${f.height.toFixed(2)} м · ${f.weight} кг · бои ${f.record.w}–${f.record.l}</div>
          <div class="fmeta">${this.c.champion === f.id ? '<b class="belt">🏆 Чемпион мира</b>' : `<b>#${rankOf(this.c, f)}</b> в мировом рейтинге`}${rivalsOf(this.c, f).length ? ` · <span class="rival">враги: ${rivalsOf(this.c, f).map((x) => esc(short(x))).join(', ')}</span>` : ''}</div>
        </div>
        <div class="rate"><b>${rating(f)}</b><span>рейтинг</span></div>
      </div>
      ${compact ? '' : `<div class="fstory">${esc(f.story)}</div>`}
      ${this.status(f)}
      ${statsTable(f)}
      <div class="fnote">Полоса — уровень сейчас, белая чёрточка — его потолок (примерно). Тренер: <b>${talentWord(f)}</b>. Известность <b>${f.fame}</b>.</div>
    </div>`;
  }

  private status(f: CareerFighter): string {
    const c = this.c;
    if (!c.roster.includes(f)) return '';
    if (!busy(c, f)) {
      if (c.tour?.fighter === f.id) return `<div class="pill gold">На турнире, ждёт следующего боя</div>`;
      const b = bookedOn(c, f, c.day);
      return b ? `<div class="pill gold">Сегодня бой: ${esc(evTitle(b))}</div>` : `<div class="pill green">Сегодня свободен: можно тренировать или драться</div>`;
    }
    const days = f.busyUntil - c.day;
    return `<div class="pill">${f.session ? 'В зале' : 'Отдыхает'}: ${esc(f.busyWhat)} · ${days <= 1 ? 'свободен завтра' : `свободен с ${dayName(f.busyUntil)} (через ${days} дн.)`}</div>`;
  }

  // ---------- Gym ----------

  private gym(): string {
    const f = this.me();
    const c = this.c;
    const free = !busy(c, f) && c.tour?.fighter !== f.id;
    const rows = STAT_KEYS.map((k) => {
      const info = STAT_INFO[k];
      const room = f.caps[k] - f.stats[k];
      return `<button type="button" class="trow${k === this.stat ? ' on' : ''}" data-act="stat" data-k="${k}">
        <div class="trow-top"><b>${info.name}</b><span>${fmtStat(k, f.stats[k])} <em>→ до ~${fmtStat(k, roundCap(k, f.caps[k]))}</em></span></div>
        ${bar(f, k)}
        <small>${info.drill}. ${info.desc}${room < 0.005 ? ' <b>Упёрся в потолок.</b>' : ''}</small>
      </button>`;
    }).join('');
    const its = INTENSITY.map((it) => {
      const g = gainOf(f, this.stat, it);
      let fight = '';
      for (let d = c.day; d < c.day + it.days; d++) if (bookedOn(c, f, d)) fight = d === c.day ? 'сегодня бой' : 'завтра бой';
      const no = !free ? 'боец занят' : fight || (c.money < it.cost ? 'мало денег' : '');
      return `<button type="button" class="ibtn" data-act="train" data-it="${it.id}" ${no ? 'disabled' : ''}>
        <b>${it.name}</b>
        <span class="gain">+${fmtGain(this.stat, g)}</span>
        <span>${it.days === 1 ? '1 день' : `${it.days} дня`} · $${it.cost}</span>
        <small>${it.injury ? `травма ${Math.round(it.injury * 100)}%` : 'без риска'}${no ? ` · ${no}` : ''}</small>
      </button>`;
    }).join('');
    return `<div class="h1">Зал · ${esc(short(f))}</div>
      ${this.status(f)}
      <div class="fnote">1) Выбери, что качать. 2) Выбери тренировку. Она занимает день (тяжёлая — два), прибавка — когда день закончится. В дни тренировки драться нельзя. Чем ближе к потолку, тем меньше даёт.</div>
      <div class="trows">${rows}</div>
      <div class="h2">${STAT_INFO[this.stat].name}: какая тренировка?</div>
      <div class="ibtns">${its}</div>`;
  }

  // ---------- Fights ----------

  /** Four weeks of the fight world; tap a day to see what is on and sign up. */
  private calendar(): string {
    const c = this.c;
    const f = this.me();
    const open = (e: Ev) => e.kind === 'title' || f.fame >= TIER_BY_ID[e.tier].fame;
    const start = weekStart(c.day);
    let grid = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'].map((d) => `<span class="cwd">${d}</span>`).join('');
    for (let d = start; d < start + 28; d++) {
      const evs = eventsOn(c, d).filter(open);
      const ours = evs.some((e) => e.f && !e.done);
      const marks = (evs.some((e) => e.kind === 'title') ? '🏆' : '') + (evs.some((e) => e.kind === 'tour') ? '<i class="mt">Т</i>' : '') + (evs.some((e) => e.kind === 'night') ? '<i class="mn">•</i>' : '');
      const cls = [d < c.day ? 'past' : '', d === c.day ? 'today' : '', d === this.calDay ? 'on' : '', ours ? 'ours' : ''].filter(Boolean).join(' ');
      grid += `<button type="button" class="cday ${cls}" data-act="calday" data-d="${d}"><b>${dateOf1(d)}</b><span>${marks}</span></button>`;
    }
    const day = this.calDay;
    const evs = eventsOn(c, day).sort((a, b) => order(a) - order(b));
    const list = evs.filter(open).map((e) => this.evCard(e, false)).join('');
    const locked = TIERS.find((t) => f.fame < t.fame);
    return `<div class="h1">Календарь · ${esc(short(f))}</div>
      ${this.dayBar()}
      <div class="fnote">• вечер боёв (разовый бой) · <b>Т</b> турнир · 🏆 бой за пояс · рамка — твой бой. Показаны лиги, открытые твоему бойцу (рейтинг ${rating(f)}, известность ${f.fame}).</div>
      <div class="cal">${grid}</div>
      <div class="h2">${dayName(day)}, ${weekday(day)}${day === c.day ? ' · сегодня' : ''}</div>
      ${list || '<div class="fnote">В этот день для твоего бойца ничего нет. Можно тренироваться.</div>'}
      ${locked ? `<div class="fnote">Следующая лига «${esc(locked.name)}» откроется при известности <b>${locked.fame}</b>.</div>` : ''}`;
  }

  /** One event: what it is, whether ours is in, and what can be done about it. */
  private evCard(e: Ev, withDate: boolean): string {
    const c = this.c;
    const t = TIER_BY_ID[e.tier];
    const f = e.f ? c.roster.find((x) => x.id === e.f) ?? this.me() : this.me();
    const when = withDate ? `${e.day === c.day ? 'Сегодня' : `${dayName(e.day)}, ${weekday(e.day)}`} · ` : '';
    const rules = t.rules.rounds ? `${t.rules.rounds} раунда по ${t.rules.roundLen >= 120 ? `${t.rules.roundLen / 60} мин` : `${t.rules.roundLen} с`}` : '';
    let head = '';
    let info = '';
    if (e.kind === 'night') {
      head = `Вечер боёв · ${esc(t.name)}`;
      info = `разовый бой · соперники ${tierRating(t)} · ${rules} · победа $${t.purse[0]} и 2 ◆ · поражение $${t.purse[1]}`;
    } else if (e.kind === 'tour') {
      head = `Турнир на ${t.size} · ${esc(t.name)}`;
      info = `соперники ${tierRating(t)} · все раунды в один день · взнос $${t.fee} · приз $${t.prize} и ${t.tokens} ◆`;
    } else {
      const champ = c.champion ? person(c, c.champion) : null;
      head = '🏆 Бой за пояс чемпиона мира';
      info = `${champ ? `чемпион ${esc(short(champ))}` : ''} · 5 раундов · $${TITLE_PURSE[0]} за победу, $${TITLE_PURSE[1]} за поражение`;
    }
    let body = '';
    if (e.done && e.f) body = `<div class="pill">${esc(short(f))}: бой проведён</div>`;
    else if (e.f) {
      const opp = e.kind === 'night' && e.opp ? person(c, e.opp) : e.kind === 'title' ? titleBout(c, f) : null;
      const vs = opp ? ` против ${esc(short(opp))} <small>(рейтинг ${rating(opp)}, ${opp.record.w}–${opp.record.l})</small>` : '';
      const today = e.day === c.day;
      const go = !today ? '' : e.kind === 'tour'
        ? (c.tour ? '<button type="button" class="primary" data-act="tourgo">К сетке</button>' : `<button type="button" class="primary" data-act="evgo" data-ev="${e.id}">На турнир</button>`)
        : `<button type="button" class="primary" data-act="evgo" data-ev="${e.id}">На бой</button>`;
      body = `<div class="pill gold">Записан ${esc(short(f))}${vs}</div>
        <div class="row">${go}${e.kind === 'night' && !today ? `<button type="button" data-act="evre" data-ev="${e.id}">Другой соперник</button>` : ''}${c.tour && today && e.kind === 'tour' ? '' : `<button type="button" data-act="evdrop" data-ev="${e.id}">Сняться${e.kind === 'tour' ? ' (взнос сгорит)' : ''}</button>`}</div>`;
    } else if (e.day >= c.day) {
      const why = canBook(c, f, e);
      body = `<button type="button" class="${why ? '' : 'primary'}" data-act="evbook" data-ev="${e.id}" ${why ? 'disabled' : ''}>Записать ${esc(short(f))}${e.kind === 'tour' ? ` · $${t.fee}` : ''}${why ? ` · ${why}` : ''}</button>`;
    }
    return `<div class="evcard ${e.kind}${e.f && !e.done ? ' ours' : ''}"><b>${when}${head}</b><small>${info}</small>${body}</div>`;
  }

  private preview(): string {
    const b = this.bill!;
    const me = b.tour ? this.c.roster.find((x) => x.id === this.c.tour!.fighter)! : this.me();
    const o = b.opp;
    const p = Math.round(100 * odds(me, o));
    const rows = STAT_KEYS.map((k) => {
      const a = me.stats[k];
      const z = o.stats[k];
      const cls = (x: number, y: number) => (x > y * 1.03 ? 'better' : x < y * 0.97 ? 'worse' : '');
      return `<div class="vrow"><b class="${cls(a, z)}">${fmtStat(k, a)}</b><span>${STAT_INFO[k].name}</span><b class="${cls(z, a)}">${fmtStat(k, z)}</b></div>`;
    }).join('');
    const title = b.title ? (this.c.champion === me.id ? 'Защита пояса чемпиона' : 'Бой за пояс чемпиона мира') : b.tour ? `Турнир «${b.tier.name}», ${roundName(current(this.c.tour!).length)}` : `Разовый бой · ${b.tier.name}`;
    const feel = relOf(this.c, me, o);
    return `<div class="h1">${esc(title)}</div>
      <div class="vs">
        <div class="vside red"><b>${esc(short(me))}</b><span>${esc(DISCIPLINE_BY_ID[me.discipline].name)} · ${me.height.toFixed(2)} м · ${me.weight} кг</span><span>рейтинг ${rating(me)} · ${me.record.w}–${me.record.l}</span></div>
        <div class="vmid">VS</div>
        <div class="vside blue"><b>${esc(short(o))}</b><span>${esc(DISCIPLINE_BY_ID[o.discipline].name)} · ${o.height.toFixed(2)} м · ${o.weight} кг</span><span>рейтинг ${rating(o)} · ${o.record.w}–${o.record.l}</span></div>
      </div>
      <div class="fstory">${esc(o.story)}</div>
      <div class="fmeta">Места в рейтинге: ${this.rankLabel(me)} и ${this.rankLabel(o)}${relWord(feel) ? ` · <span class="${feel < 0 ? 'rival' : 'friend'}">${relWord(feel)}</span>` : ''}</div>
      ${feel <= -50 ? '<div class="pill red">Заклятые враги: гонорар ×1,5, известность ×2. Оба лезут вперёд злее и небрежнее.</div>' : ''}
      <div class="vtable">${rows}</div>
      <div class="pill ${p >= 55 ? 'green' : p <= 45 ? 'red' : 'gold'}">Букмекеры дают тебе примерно ${p}%</div>
      <button type="button" class="primary wide" data-act="fight">В бой</button>
`;
  }

  private tourBanner(): string {
    const c = this.c;
    if (!c.tour) return '';
    const t = c.tour;
    const me = t.fighter;
    const out = t.rounds.some((r) => r.some((m) => (m.a === me || m.b === me) && m.w && m.w !== me));
    const mine = myMatch(t);
    const status = finished(t)
      ? 'турнир окончен, посмотри итог'
      : out
        ? 'твой боец выбыл, турнир идёт'
        : mine && !mine.w
          ? `${roundName(current(t).length)}: против ${short(person(c, mine.a === me ? mine.b : mine.a))}`
          : 'прошёл дальше, ждёт следующего раунда';
    return `<button type="button" class="banner" data-act="tourgo"><b>Турнир «${esc(TIER_BY_ID[t.tier].name)}»</b><span>${esc(status)} · открыть сетку</span></button>`;
  }

  /** The bracket: every fight of the round, ours to fight, the others to watch or skip. */
  private bracket(): string {
    const c = this.c;
    const t = c.tour;
    if (!t) return '<div class="fnote">Турнира сейчас нет.</div>';
    const tier = TIER_BY_ID[t.tier];
    const round = current(t);
    const me = t.fighter;
    const alive = !t.rounds.some((r) => r.some((m) => (m.a === me || m.b === me) && m.w && m.w !== me));
    const name = (id: string) => {
      const p = person(c, id);
      return `<span class="${id === me ? 'mine' : ''}">${esc(short(p))} <small>${rating(p)}</small></span>`;
    };
    const rows = round
      .map((m, i) => {
        const ours = m.a === me || m.b === me;
        const res = m.w ? `<b class="bw">→ ${esc(short(person(c, m.w)))}</b>` : '';
        const btns = m.w
          ? ''
          : ours
            ? `<button type="button" class="primary" data-act="myfight">На бой</button>`
            : `<button type="button" data-act="watch" data-i="${i}">Смотреть</button><button type="button" data-act="skipone" data-i="${i}">Пропустить</button>`;
        return `<div class="bmatch${ours ? ' ours' : ''}"><div class="bpair">${name(m.a)}<i>—</i>${name(m.b)}</div>${res}<div class="bbtn">${btns}</div></div>`;
      })
      .join('');
    const past = t.rounds.slice(0, -1)
      .map((r) => `<details><summary>${roundName(r.length)}</summary>${r.map((m) => `<div class="bpast">${esc(short(person(c, m.a)))} — ${esc(short(person(c, m.b)))}: <b>${esc(short(person(c, m.w!)))}</b></div>`).join('')}</details>`)
      .reverse()
      .join('');
    const othersLeft = round.some((m) => !m.w && m.a !== me && m.b !== me);
    const done = finished(t);
    return `<div class="h1">Турнир «${esc(tier.name)}»</div>
      <div class="fnote">${tier.size} бойцов · приз $${tier.prize} и ${tier.tokens} ◆ · ${alive ? 'твой боец в сетке' : done ? '' : 'твой боец выбыл'}</div>
      ${done ? `<div class="pill gold">Победитель турнира: ${esc(person(c, round[0].w!).name)}</div><button type="button" class="primary wide" data-act="closetour">Завершить турнир</button>` : ''}
      ${done ? '' : `<div class="h2">${roundName(round.length)}</div>`}
      <div class="bracket">${rows}</div>
      ${othersLeft ? '<button type="button" data-act="skipall">Пропустить все чужие бои</button>' : ''}
      ${!alive && !done ? '<button type="button" data-act="closetour">Досчитать турнир до конца</button>' : ''}
      ${past}`;
  }

  private result(): string {
    const o = this.outcome!;
    return `<div class="resbox ${o.won ? 'win' : 'loss'}">
        <div class="restitle">${o.won ? 'Победа' : 'Поражение'}</div>
        <div class="fnote">${esc(o.title)}</div>
        <ul>${o.lines.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      </div>
      ${this.c.tour ? '<button type="button" class="primary wide" data-act="to" data-s="bracket">К турнирной сетке</button>' : ''}
      ${this.hero(this.me(), true)}
      <button type="button" class="${this.c.tour ? '' : 'primary '}wide" data-act="to" data-s="home">На главную</button>
      ${this.c.tour ? '' : '<div class="fnote">Бой занял день. Нажми «Следующий день» на главной, когда будешь готов.</div>'}`;
  }

  // ---------- Team, market, log ----------

  private team(): string {
    const c = this.c;
    const list = c.roster
      .map((f) => {
        const main = f.id === c.pick;
        return `<div class="tcard${main ? ' on' : ''}">
          <div class="hero-top"><div><div class="fname">${esc(f.name)}</div><div class="fmeta">${esc(DISCIPLINE_BY_ID[f.discipline].name)} · бои ${f.record.w}–${f.record.l} · ${busy(c, f) ? 'занят' : 'свободен'}</div></div><div class="rate"><b>${rating(f)}</b><span>рейтинг</span></div></div>
          <div class="row">
            ${main ? '<div class="pill gold">Сейчас выбран</div>' : `<button type="button" class="primary" data-act="pick" data-id="${f.id}">Выбрать</button>`}
            ${c.roster.length > 1 ? `<button type="button" data-act="sell" data-id="${f.id}">Продать · $${Math.round(value(f) * 0.6)}</button>` : '<span></span>'}
          </div>
        </div>`;
      })
      .join('');
    return `<div class="h1">Команда · ${c.roster.length} из ${MAX_ROSTER}</div>
      <div class="fnote">Выбранный боец показывается на главном экране, его ты тренируешь и выставляешь на бои. Остальные могут в это время тренироваться.</div>
      ${list}
      <button type="button" data-act="to" data-s="market">Найти бойцов на рынке</button>`;
  }

  private market(): string {
    const c = this.c;
    const next = Math.max(1, c.marketAt + MARKET_DAYS - c.day);
    const full = c.roster.length >= MAX_ROSTER;
    const list = c.market
      .map((f, i) => {
        const price = value(f);
        const no = full ? 'команда полная' : c.money < price ? 'мало денег' : '';
        return `${this.hero(f)}<button type="button" class="primary" data-act="buy" data-i="${i}" ${no ? 'disabled' : ''}>Подписать за $${price}${no ? ` · ${no}` : ''}</button>`;
      })
      .join('');
    return `<div class="h1">Рынок</div>
      <div class="fnote">Свободные бойцы. Смотри не только на рейтинг: потолок (белая чёрточка) показывает, кем он может стать. Новые появятся через ${next} дн.</div>
      <button type="button" data-act="refresh" ${c.tokens < 2 ? 'disabled' : ''}>Обновить сейчас · 2 ◆</button>
      ${list || '<div class="fnote">Пока никого.</div>'}`;
  }

  private rankLabel(f: CareerFighter): string {
    return this.c.champion === f.id ? '🏆 чемпион' : `#${rankOf(this.c, f)}`;
  }

  /** The world's rankings: the champion, the top twenty, and where ours stand. */
  private rankView(): string {
    const c = this.c;
    const all = rankings(c);
    const mine = new Set(c.roster.map((x) => x.id));
    const me = this.me();
    const row = (f: CareerFighter, i: number) => {
      const place = c.champion === f.id ? '🏆' : `${i + (c.champion ? 0 : 1)}`;
      const feel = relOf(c, me, f);
      return `<button type="button" class="rrow${mine.has(f.id) ? ' mine' : ''}" data-act="profile" data-id="${f.id}">
        <span class="rpl">${place}</span><span class="rnm">${esc(short(f))}${feel <= -50 && f !== me ? ' <i class="rival">⚔</i>' : ''}</span>
        <span class="rst">${esc(DISCIPLINE_BY_ID[f.discipline].name)} · ${f.record.w}–${f.record.l}</span><b>${rating(f)}</b></button>`;
    };
    const top = all.slice(0, 21).map((f, i) => row(f, i)).join('');
    const below = all.map((f, i) => [f, i] as const).filter(([f, i]) => i > 20 && mine.has(f.id)).map(([f, i]) => row(f, i)).join('');
    return `<div class="h1">Мировой рейтинг</div>
      <div class="fnote">Место зависит от очков: победа над тем, кто выше, даёт много, над слабым — мало. Чемпион — тот, у кого пояс; отобрать его можно только в бою за пояс (нужно быть в первой тройке). ⚔ — заклятый враг твоего бойца.</div>
      <div class="rlist">${top}${below ? `<div class="fnote">…</div>${below}` : ''}</div>`;
  }

  /** Any fighter of the world: who he is, his record, what he thinks of yours. */
  private profile(): string {
    const c = this.c;
    const f = person(c, this.profileId);
    if (!f) return '<div class="fnote">Нет такого бойца.</div>';
    const ours = c.roster.includes(f);
    const feelings = c.roster.filter((x) => x !== f).map((x) => {
      const v = relOf(c, x, f);
      return `<div>${esc(short(x))}: ${relWord(v) || 'нейтрально'} <small>(${v})</small></div>`;
    }).join('');
    const t = tierOf(f);
    return `<div class="h1">${this.rankLabel(f)} · ${esc(f.name)}</div>
      ${this.hero(f, false)}
      <div class="fmeta">Лига: «${esc(t.name)}» · побед нокаутом ${f.record.ko}</div>
      ${ours ? '' : `<div class="newsbox"><div class="h2">Отношения с твоими</div>${feelings || '<div>—</div>'}</div>
      <button type="button" class="primary wide" data-act="challenge" ${f.id === c.champion ? 'disabled' : ''}>Вызвать ${esc(short(this.me()))} против него</button>
      ${f.id === c.champion ? '<div class="fnote">С чемпионом дерутся только за пояс.</div>' : ''}`}`;
  }

  private logView(): string {
    return `<div class="h1">Журнал</div>
      <div class="newsbox"><div class="h2">Новости</div>${(this.c.news ?? []).map((x) => `<div>${esc(x)}</div>`).join('')}</div>
      <div class="log">${this.c.log.map((s) => `<div>${esc(s)}</div>`).join('')}</div>
      <button type="button" data-act="reset">Начать карьеру заново</button>`;
  }

  // ---------- Actions ----------

  private onClick(e: Event): void {
    const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
    if (!b || (b as HTMLButtonElement).disabled) return;
    const c = this.c;
    const me = this.me();
    const say = (msg: string | null) => {
      if (msg) this.toast = msg;
      this.render();
    };
    // Any other tap drops an unanswered question.
    if (b.dataset.act !== 'yes') this.asking = null;
    const ask = (text: string, run: () => void) => {
      this.asking = { text, run };
      this.render();
      $('career').scrollTop = 0;
    };
    switch (b.dataset.act) {
      case 'yes': {
        const run = this.asking?.run;
        this.asking = null;
        if (run) run();
        else this.render();
        return;
      }
      case 'no':
        return say(null);
      case 'cheat': {
        // For testing: the player sets his own tokens and money, separately.
        const v = Number(b.dataset.v);
        if (b.dataset.k === 'tokens') c.tokens = Math.max(0, c.tokens + v);
        else c.money = Math.max(0, c.money + v);
        const what = b.dataset.k === 'tokens' ? `${v > 0 ? '+' : '−'}${Math.abs(v)} жетонов` : `${v > 0 ? '+' : '−'}$${Math.abs(v)}`;
        c.log.unshift(`Тест: ${what}`);
        save(c);
        return say(what);
      }
      case 'sandbox':
        return this.hide();
      case 'back':
        return this.go(this.screen === 'preview' ? (this.bill?.tour ? 'bracket' : 'cal') : this.screen === 'profile' ? 'rank' : 'home');
      case 'to':
        return this.go(b.dataset.s as Screen);
      case 'help':
        c.seenHelp = true;
        save(c);
        return say(null);
      case 'pick':
        c.pick = b.dataset.id!;
        save(c);
        return say(`Выбран ${short(this.me())}`);
      case 'stat':
        this.stat = b.dataset.k as StatKey;
        return say(null);
      case 'train': {
        const it = INTENSITY.find((x) => x.id === b.dataset.it)!;
        const err = startTraining(c, me, this.stat, it);
        if (err) return say(err);
        this.toast = `${short(me)} в зале: ${STAT_INFO[this.stat].name.toLowerCase()}, ${it.days === 1 ? 'до конца дня' : `${it.days} дня`}`;
        return this.go('home');
      }
      case 'nextday': {
        const done = (err: string | null) => {
          if (err) return say(err);
          this.calDay = c.day;
          this.toast = `Новый день: ${dayName(c.day)}, ${weekday(c.day)}`;
          return this.go(this.screen === 'cal' ? 'cal' : 'home');
        };
        const err = nextDay(c);
        if (err === 'tour' || err === 'fight')
          return ask(err === 'tour' ? 'Твой боец ещё в турнире. Сняться и закончить день?' : 'Сегодня у твоего бойца бой. Не выходить на бой и закончить день? (известность −1)', () => done(nextDay(c, true)));
        return done(err);
      }
      case 'calday':
        this.calDay = Number(b.dataset.d);
        return say(null);
      case 'evbook': {
        const e = evById(c, Number(b.dataset.ev))!;
        const err = book(c, me, e);
        return say(err ?? `${short(me)} записан: ${evTitle(e)}, ${dayName(e.day)}`);
      }
      case 'evre':
        rebook(c, evById(c, Number(b.dataset.ev))!);
        return say(null);
      case 'evdrop': {
        const e = evById(c, Number(b.dataset.ev))!;
        return ask(e.kind === 'tour' ? 'Сняться с турнира? Взнос не вернут.' : 'Отказаться от боя?', () => {
          unbook(c, e);
          say('Заявка снята');
        });
      }
      case 'evgo': {
        const e = evById(c, Number(b.dataset.ev))!;
        const f = c.roster.find((x) => x.id === e.f)!;
        if (busy(c, f)) return say(`${short(f)} не готов к бою: ${f.busyWhat}`);
        if (e.kind === 'tour') {
          const err = startTour(c, f, e);
          if (err) return say(err);
          this.toast = `Жеребьёвка прошла: ${TIER_BY_ID[e.tier].size} бойцов. Смотри сетку.`;
          return this.go('bracket');
        }
        const opp = e.kind === 'title' ? titleBout(c, f) : person(c, e.opp!);
        if (!opp) return say('Права на бой за пояс больше нет: ты выпал из тройки');
        this.bill = { tier: e.kind === 'title' ? TIERS[5] : TIER_BY_ID[e.tier], opp, tour: false, title: e.kind === 'title', ev: e };
        c.pick = f.id;
        return this.go('preview');
      }
      case 'sell': {
        const f = c.roster.find((x) => x.id === b.dataset.id)!;
        return ask(`Продать контракт ${f.name} за $${Math.round(value(f) * 0.6)}?`, () => say(sell(c, f) ?? `${short(f)} продан`));
      }
      case 'buy': {
        const err = buy(c, c.market[Number(b.dataset.i)]);
        if (err) return say(err);
        this.toast = `${short(this.me())} в команде и выбран основным`;
        return this.go('home');
      }
      case 'refresh':
        if (c.tokens < 2) return;
        c.tokens -= 2;
        refreshMarket(c);
        save(c);
        return say(null);
      case 'reset':
        return ask('Стереть карьеру и начать сначала?', () => {
          this.c = reset();
          this.go('home');
        });
      case 'profile':
        this.profileId = b.dataset.id!;
        return this.go('profile');
      case 'challenge': {
        const err = challenge(c, me, person(c, this.profileId));
        if (err) return say(err);
        const e = c.events.find((x) => x.f === me.id && x.opp === this.profileId && !x.done)!;
        this.calDay = e.day;
        this.toast = `Вызов принят: бой ${dayName(e.day)}, ${evTitle(e)}`;
        return this.go('cal');
      }
      case 'tourgo':
        return this.go('bracket');
      case 'myfight': {
        const tour = c.tour!;
        const f = c.roster.find((x) => x.id === tour.fighter)!;
        if (busy(c, f)) return say(`${short(f)} ещё восстанавливается`);
        const m = myMatch(tour)!;
        this.bill = { tier: TIER_BY_ID[tour.tier], opp: person(c, m.a === f.id ? m.b : m.a), tour: true };
        return this.go('preview');
      }
      case 'watch': {
        const tour = c.tour!;
        const m = current(tour)[Number(b.dataset.i)];
        const t = TIER_BY_ID[tour.tier];
        const A = person(c, m.a);
        const B = person(c, m.b);
        $('career').hidden = true;
        clearInterval(this.timer);
        this.hooks.fight(A, B, t, `${t.name}, ${roundName(current(tour).length)}: ${short(A)} против ${short(B)}`, (r) => {
          settle(c, m, r.won ? m.a : m.b);
          this.toast = `Победил ${person(c, r.won ? m.a : m.b).name}${r.ko ? ' досрочно' : ''}`;
          this.screen = 'bracket';
          this.show();
        });
        return;
      }
      case 'skipone':
        settle(c, current(c.tour!)[Number(b.dataset.i)]);
        return say(null);
      case 'skipall':
        settleOthers(c);
        return say('Чужие бои раунда прошли');
      case 'closetour': {
        const line = closeTour(c);
        this.toast = line;
        return this.go('home');
      }
      case 'fight':
        return this.fight();
    }
  }

  private fight(): void {
    const b = this.bill!;
    const c = this.c;
    const me = b.tour ? c.roster.find((x) => x.id === c.tour!.fighter)! : this.me();
    const title = b.title ? `Бой за пояс: ${short(me)} против ${short(b.opp)}` : b.tour ? `${b.tier.name}, ${roundName(current(c.tour!).length)}` : `${b.tier.name}: ${short(me)} против ${short(b.opp)}`;
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.fight(me, b.opp, b.tier, title, (r) => {
      if (b.ev) b.ev.done = true;
      const lines = b.tour ? tourFight(c, me, r) : afterFight(c, me, b.tier, b.opp, r, false, !!b.title);
      this.outcome = { won: r.won, title: `${title} · ${r.won ? (r.ko ? 'досрочно' : 'по очкам') : r.reason}`, lines };
      this.bill = null;
      this.screen = 'result';
      this.show();
    });
  }
}

/** Current level against how far he can go, for each quality. */
function statsTable(f: CareerFighter): string {
  return `<div class="stats">${STAT_KEYS.map((k) => `<div class="stat"><span>${STAT_INFO[k].name}</span>${bar(f, k)}<b>${fmtStat(k, f.stats[k])}</b></div>`).join('')}</div>`;
}

function bar(f: CareerFighter, k: StatKey): string {
  const info = STAT_INFO[k];
  const span = info.hi - info.lo;
  const now = ((f.stats[k] - info.lo) / span) * 100;
  const cap = ((f.caps[k] - info.lo) / span) * 100;
  return `<div class="sbar"><i style="width:${now}%"></i><em style="left:${cap}%"></em></div>`;
}

const tierCache = new Map<string, string>();
function tierRating(t: Tier): string {
  // A typical opponent there, as a number (sampled once).
  let r = tierCache.get(t.id);
  if (!r) {
    const a = Array.from({ length: 40 }, () => rating(opponent(t)));
    a.sort((x, y) => x - y);
    r = `${a[6]}–${a[33]}`;
    tierCache.set(t.id, r);
  }
  return r;
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Day of the month, with the month's short name on the 1st. */
function dateOf1(day: number): string {
  const s = dayName(day);
  return s.startsWith('1 ') ? s.slice(0, 5) : s.split(' ')[0];
}

const order = (e: Ev) => (e.kind === 'title' ? 0 : e.kind === 'tour' ? 1 : 2);

const pct = (k: StatKey) => k === 'skill' || k === 'evasion';

function fmtStat(k: StatKey, v: number): string {
  return pct(k) ? `${Math.round(v * 100)}%` : v.toFixed(2);
}

/** The ceiling is only known roughly. */
function roundCap(k: StatKey, v: number): number {
  return pct(k) ? Math.round(v * 20) / 20 : Math.round(v * 20) / 20;
}

function fmtGain(k: StatKey, g: number): string {
  return pct(k) ? `${(g * 100).toFixed(1)}%` : g.toFixed(3);
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
