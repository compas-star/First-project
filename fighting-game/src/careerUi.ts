// The manager's screens. One thing per screen: the home screen shows your fighter and
// two big actions (train, fight); the gym, the fight ladder, the team and the market are
// their own screens with a way back. Before a fight you see who you meet; after it,
// what you got.
import {
  STAT_KEYS, STAT_INFO, INTENSITY, TIERS, TIER_BY_ID, MAX_ROSTER,
  load, save, reset, newCareer, tick, startTraining, gainOf, busy, skip, skipCost, refreshMarket, buy, sell,
  rating, talentWord, value, opponent, canEnter, enterTour, afterFight, tourFight, roundName, short, odds,
  type Career, type CareerFighter, type Tier, type FightResult, type StatKey,
} from './career';
import { DISCIPLINE_BY_ID } from './disciplines';

export interface CareerHooks {
  /** Show this fight in the arena; `done` gets the result when it is over. */
  fight(me: CareerFighter, opp: CareerFighter, tier: Tier, title: string, done: (r: FightResult) => void): void;
  /** Back to the sandbox. */
  close(): void;
}

type Screen = 'home' | 'gym' | 'fights' | 'preview' | 'result' | 'team' | 'market' | 'log';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class CareerUi {
  c: Career;
  private screen: Screen = 'home';
  private stat: StatKey = 'bodySpeed';
  private toast = '';
  private timer = 0;
  /** The fight about to happen (preview screen). */
  private bill: { tier: Tier; opp: CareerFighter; tour: boolean } | null = null;
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
    // Only the clocks move.
    const now = Date.now();
    document.querySelectorAll<HTMLElement>('#career [data-until]').forEach((el) => {
      const until = Number(el.dataset.until);
      const from = Number(el.dataset.from);
      const t = el.querySelector('.cl');
      if (t) t.textContent = clock(until - now);
      const bar = el.querySelector<HTMLElement>('.bar i');
      if (bar) bar.style.width = `${Math.min(100, (100 * (now - from)) / Math.max(1, until - from))}%`;
      const sk = el.querySelector<HTMLElement>('[data-act="skip"]');
      const f = this.c.roster.find((x) => x.id === el.dataset.id);
      if (sk && f) sk.innerHTML = `Закончить сейчас · <b>${skipCost(f, now)}</b> ◆`;
    });
  }

  private me(): CareerFighter {
    return this.c.roster.find((f) => f.id === this.c.pick) ?? this.c.roster[0];
  }

  private go(s: Screen): void {
    this.screen = s;
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
      : this.screen === 'fights' ? this.fights()
      : this.screen === 'preview' ? this.preview()
      : this.screen === 'result' ? this.result()
      : this.screen === 'team' ? this.team()
      : this.screen === 'market' ? this.market()
      : this.logView();
    $('career').innerHTML = top + (this.toast ? `<div class="toast">${esc(this.toast)}</div>` : '') + body;
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
            <li><b>Тренируй</b> бойца в зале. Тренировка идёт настоящее время, пока она идёт — боец занят. Прибавки маленькие, как в жизни.</li>
            <li><b>Дерись</b>: победа даёт деньги, жетоны и известность. После боя бойцу нужно восстановиться.</li>
            <li><b>Известность</b> открывает лиги выше: от подвала до мирового титула.</li>
            <li><b>Жетоны ◆</b> заканчивают любое ожидание сразу. <b>Деньги $</b> — на тренировки, взносы и новых бойцов.</li>
          </ol>
          <button type="button" data-act="help">Понятно</button>
        </div>`;
    const tour = c.tour
      ? `<button type="button" class="banner" data-act="tourgo">
          <b>Турнир «${esc(TIER_BY_ID[c.tour.tier].name)}» · ${roundName(TIER_BY_ID[c.tour.tier].size, c.tour.round)}</b>
          <span>${esc(short(c.roster.find((x) => x.id === c.tour!.fighter)!))} против ${esc(c.tour.next.name)} · нажми, чтобы выйти на бой</span>
        </button>`
      : '';
    return `${help}${tour}
      ${this.hero(f)}
      <div class="big2">
        <button type="button" class="bigbtn" data-act="to" data-s="gym"><b>Тренировать</b><span>${busy(f) ? 'сейчас занят' : 'выбрать, что качать'}</span></button>
        <button type="button" class="bigbtn primary" data-act="to" data-s="fights"><b>Драться</b><span>бои и турниры</span></button>
      </div>
      <div class="nav3">
        <button type="button" data-act="to" data-s="team">Команда <b>${c.roster.length}/${MAX_ROSTER}</b></button>
        <button type="button" data-act="to" data-s="market">Рынок</button>
        <button type="button" data-act="to" data-s="log">Журнал</button>
      </div>`;
  }

  /** The fighter: who he is, what he can do now and how far he can go, what he is doing. */
  private hero(f: CareerFighter, compact = false): string {
    const d = DISCIPLINE_BY_ID[f.discipline];
    return `<div class="hero">
      <div class="hero-top">
        <div>
          <div class="fname">${esc(f.name)}</div>
          <div class="fmeta">${esc(d.name)} · ${f.height.toFixed(2)} м · ${f.weight} кг · бои ${f.record.w}–${f.record.l}</div>
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
    if (!busy(f)) {
      if (this.c.tour?.fighter === f.id) return `<div class="pill gold">На турнире, ждёт следующего боя</div>`;
      return `<div class="pill green">Свободен: можно тренировать или драться</div>`;
    }
    return `<div class="busybox" data-until="${f.busyUntil}" data-from="${f.busyFrom}" data-id="${f.id}">
      <div class="pill">${f.session ? 'В зале' : 'Отдыхает'}: ${esc(f.busyWhat)} · осталось <b class="cl">${clock(f.busyUntil - Date.now())}</b></div>
      <div class="bar"><i style="width:0"></i></div>
      <button type="button" data-act="skip" data-id="${f.id}" ${this.c.tokens < skipCost(f) ? 'disabled' : ''}>Закончить сейчас · <b>${skipCost(f)}</b> ◆</button>
    </div>`;
  }

  // ---------- Gym ----------

  private gym(): string {
    const f = this.me();
    const c = this.c;
    const free = !busy(f) && c.tour?.fighter !== f.id;
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
      const no = !free ? 'боец занят' : c.money < it.cost ? 'мало денег' : '';
      return `<button type="button" class="ibtn" data-act="train" data-it="${it.id}" ${no ? 'disabled' : ''}>
        <b>${it.name}</b>
        <span class="gain">+${fmtGain(this.stat, g)}</span>
        <span>${it.minutes} мин · $${it.cost}</span>
        <small>${it.injury ? `травма ${Math.round(it.injury * 100)}%` : 'без риска'}${no ? ` · ${no}` : ''}</small>
      </button>`;
    }).join('');
    return `<div class="h1">Зал · ${esc(short(f))}</div>
      ${this.status(f)}
      <div class="fnote">1) Выбери, что качать. 2) Выбери тренировку. Она идёт настоящее время; можно закрыть игру и вернуться. Чем ближе к потолку, тем меньше даёт.</div>
      <div class="trows">${rows}</div>
      <div class="h2">${STAT_INFO[this.stat].name}: какая тренировка?</div>
      <div class="ibtns">${its}</div>`;
  }

  // ---------- Fights ----------

  private fights(): string {
    const c = this.c;
    const f = this.me();
    const why0 = busy(f) ? (f.session ? 'Боец сейчас в зале.' : 'Боец восстанавливается.') : '';
    let html = `<div class="h1">Бои · ${esc(short(f))}</div>
      <div class="fnote">Рейтинг твоего бойца: <b>${rating(f)}</b>, известность <b>${f.fame}</b>. ${why0 ? `<b>${why0}</b> Подожди или закончи жетонами на главном экране.` : 'Разовый бой — быстрые деньги. Турнир — взнос, несколько боёв подряд и большой приз.'}</div>`;
    if (c.tour) html += `<button type="button" class="banner" data-act="tourgo"><b>Идёт турнир «${esc(TIER_BY_ID[c.tour.tier].name)}»</b><span>${roundName(TIER_BY_ID[c.tour.tier].size, c.tour.round)} · против ${esc(c.tour.next.name)}</span></button>`;
    TIERS.forEach((t, i) => {
      const open = f.fame >= t.fame;
      const why = canEnter(c, f, t);
      const rules = t.rules.rounds ? `${t.rules.rounds} раунда по ${t.rules.roundLen >= 120 ? `${t.rules.roundLen / 60} мин` : `${t.rules.roundLen} с`}` : 'до победы';
      const tourNo = why || (c.tour ? 'уже идёт турнир' : c.money < t.fee ? 'мало денег на взнос' : '');
      html += `<div class="tier${open ? '' : ' locked'}">
        <div class="tier-top"><span class="step">${i + 1}</span><div><b>${esc(t.name)}</b><small>соперники: рейтинг ${tierRating(t)} · ${rules}</small></div></div>
        ${open ? `<div class="fnote">${esc(t.desc)}</div>
          <div class="row">
            <button type="button" data-act="single" data-t="${t.id}" ${why ? 'disabled' : ''}><b>Разовый бой</b><br><small>победа +$${t.purse[0]} и 2 ◆ · поражение +$${t.purse[1]}</small></button>
            <button type="button" data-act="tour" data-t="${t.id}" ${tourNo ? 'disabled' : ''}><b>Турнир на ${t.size}</b><br><small>взнос $${t.fee} · приз $${t.prize} и ${t.tokens} ◆</small></button>
          </div>`
        : `<div class="fnote">Откроется при известности <b>${t.fame}</b> (сейчас ${f.fame}).</div><div class="bar"><i style="width:${Math.min(100, (100 * f.fame) / t.fame)}%"></i></div>`}
      </div>`;
    });
    return html;
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
    const title = b.tour ? `Турнир «${b.tier.name}», ${roundName(b.tier.size, this.c.tour!.round)}` : `Разовый бой · ${b.tier.name}`;
    return `<div class="h1">${esc(title)}</div>
      <div class="vs">
        <div class="vside red"><b>${esc(short(me))}</b><span>${esc(DISCIPLINE_BY_ID[me.discipline].name)} · ${me.height.toFixed(2)} м · ${me.weight} кг</span><span>рейтинг ${rating(me)} · ${me.record.w}–${me.record.l}</span></div>
        <div class="vmid">VS</div>
        <div class="vside blue"><b>${esc(short(o))}</b><span>${esc(DISCIPLINE_BY_ID[o.discipline].name)} · ${o.height.toFixed(2)} м · ${o.weight} кг</span><span>рейтинг ${rating(o)} · ${o.record.w}–${o.record.l}</span></div>
      </div>
      <div class="fstory">${esc(o.story)}</div>
      <div class="vtable">${rows}</div>
      <div class="pill ${p >= 55 ? 'green' : p <= 45 ? 'red' : 'gold'}">Букмекеры дают тебе примерно ${p}%</div>
      <button type="button" class="primary wide" data-act="fight">В бой</button>
      ${b.tour ? '' : '<button type="button" data-act="reroll">Другой соперник</button>'}`;
  }

  private result(): string {
    const o = this.outcome!;
    return `<div class="resbox ${o.won ? 'win' : 'loss'}">
        <div class="restitle">${o.won ? 'Победа' : 'Поражение'}</div>
        <div class="fnote">${esc(o.title)}</div>
        <ul>${o.lines.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      </div>
      ${this.hero(this.me(), true)}
      <button type="button" class="primary wide" data-act="to" data-s="home">На главную</button>`;
  }

  // ---------- Team, market, log ----------

  private team(): string {
    const c = this.c;
    const list = c.roster
      .map((f) => {
        const main = f.id === c.pick;
        return `<div class="tcard${main ? ' on' : ''}">
          <div class="hero-top"><div><div class="fname">${esc(f.name)}</div><div class="fmeta">${esc(DISCIPLINE_BY_ID[f.discipline].name)} · бои ${f.record.w}–${f.record.l} · ${busy(f) ? 'занят' : 'свободен'}</div></div><div class="rate"><b>${rating(f)}</b><span>рейтинг</span></div></div>
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
    const next = Math.max(0, c.marketAt + 20 * 60000 - Date.now());
    const full = c.roster.length >= MAX_ROSTER;
    const list = c.market
      .map((f, i) => {
        const price = value(f);
        const no = full ? 'команда полная' : c.money < price ? 'мало денег' : '';
        return `${this.hero(f)}<button type="button" class="primary" data-act="buy" data-i="${i}" ${no ? 'disabled' : ''}>Подписать за $${price}${no ? ` · ${no}` : ''}</button>`;
      })
      .join('');
    return `<div class="h1">Рынок</div>
      <div class="fnote">Свободные бойцы. Смотри не только на рейтинг: потолок (белая чёрточка) показывает, кем он может стать. Новые появятся через ${clock(next)}.</div>
      <button type="button" data-act="refresh" ${c.tokens < 2 ? 'disabled' : ''}>Обновить сейчас · 2 ◆</button>
      ${list || '<div class="fnote">Пока никого.</div>'}`;
  }

  private logView(): string {
    return `<div class="h1">Журнал</div>
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
    switch (b.dataset.act) {
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
        return this.go(this.screen === 'preview' ? (this.bill?.tour ? 'home' : 'fights') : 'home');
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
        this.toast = `${short(me)} в зале: ${STAT_INFO[this.stat].name.toLowerCase()}, ${it.minutes} мин`;
        return this.go('home');
      }
      case 'skip': {
        const f = c.roster.find((x) => x.id === b.dataset.id)!;
        return say(skip(c, f));
      }
      case 'sell': {
        const f = c.roster.find((x) => x.id === b.dataset.id)!;
        if (!confirm(`Продать контракт ${f.name}?`)) return;
        return say(sell(c, f));
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
        if (!confirm('Стереть карьеру и начать сначала?')) return;
        this.c = reset();
        return this.go('home');
      case 'single': {
        const t = TIER_BY_ID[b.dataset.t!];
        this.bill = { tier: t, opp: opponent(t), tour: false };
        return this.go('preview');
      }
      case 'reroll':
        if (this.bill) this.bill.opp = opponent(this.bill.tier);
        return say(null);
      case 'tour': {
        const t = TIER_BY_ID[b.dataset.t!];
        const why = enterTour(c, me, t);
        if (why) return say(why);
        this.bill = { tier: t, opp: c.tour!.next, tour: true };
        return this.go('preview');
      }
      case 'tourgo': {
        const tour = c.tour!;
        const f = c.roster.find((x) => x.id === tour.fighter)!;
        if (busy(f)) return say(`${short(f)} ещё восстанавливается`);
        this.bill = { tier: TIER_BY_ID[tour.tier], opp: tour.next, tour: true };
        return this.go('preview');
      }
      case 'fight':
        return this.fight();
    }
  }

  private fight(): void {
    const b = this.bill!;
    const c = this.c;
    const me = b.tour ? c.roster.find((x) => x.id === c.tour!.fighter)! : this.me();
    const title = b.tour ? `${b.tier.name}, ${roundName(b.tier.size, c.tour!.round)}` : `${b.tier.name}: ${short(me)} против ${short(b.opp)}`;
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.fight(me, b.opp, b.tier, title, (r) => {
      const lines = b.tour ? tourFight(c, me, r) : afterFight(c, me, b.tier, b.opp, r, false);
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
