// The manager's screen: the team, the gym, fights and tournaments, the market.
import {
  STAT_KEYS, STAT_INFO, INTENSITY, TIERS, TIER_BY_ID, MAX_ROSTER,
  load, save, reset, newCareer, tick, startTraining, gainOf, busy, skip, skipCost, refreshMarket, buy, sell,
  rating, talentWord, value, opponent, canEnter, enterTour, afterFight, tourFight, roundName, short,
  type Career, type CareerFighter, type Tier, type FightResult, type StatKey,
} from './career';
import { DISCIPLINE_BY_ID } from './disciplines';

export interface CareerHooks {
  /** Show this fight in the arena; `done` gets the result when it is over. */
  fight(me: CareerFighter, opp: CareerFighter, tier: Tier, title: string, done: (r: FightResult) => void): void;
  /** Back to the sandbox. */
  close(): void;
}

type Tab = 'team' | 'fights' | 'market' | 'log';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class CareerUi {
  c: Career;
  tab: Tab = 'team';
  private stat: StatKey = 'bodySpeed';
  private toast = '';
  private timer = 0;

  constructor(private hooks: CareerHooks) {
    this.c = load() ?? newCareer();
    save(this.c);
    $('careerBody').addEventListener('click', (e) => this.onClick(e));
    $('careerClose').addEventListener('click', () => this.hide());
    document.querySelectorAll<HTMLButtonElement>('#careerTabs button').forEach((b) =>
      b.addEventListener('click', () => {
        this.tab = b.dataset.tab as Tab;
        this.render();
      }),
    );
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
    document.querySelectorAll<HTMLElement>('[data-until]').forEach((el) => {
      const until = Number(el.dataset.until);
      const from = Number(el.dataset.from);
      const left = Math.max(0, until - now);
      const t = el.querySelector('.cl');
      if (t) t.textContent = clock(left);
      const bar = el.querySelector<HTMLElement>('.bar i');
      if (bar) bar.style.width = `${Math.min(100, (100 * (now - from)) / Math.max(1, until - from))}%`;
      const sk = el.querySelector<HTMLElement>('[data-act="skip"]');
      const f = this.c.roster.find((x) => x.id === el.dataset.id);
      if (sk && f) sk.textContent = `Ускорить · ${skipCost(f, now)} ж`;
    });
  }

  private me(): CareerFighter {
    return this.c.roster.find((f) => f.id === this.c.pick) ?? this.c.roster[0];
  }

  render(): void {
    const c = this.c;
    $('careerMoney').innerHTML = `<b>$${c.money.toLocaleString('ru')}</b> · <b>${c.tokens}</b> жетонов`;
    document.querySelectorAll<HTMLButtonElement>('#careerTabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === this.tab));
    const body = this.tab === 'team' ? this.team() : this.tab === 'fights' ? this.fights() : this.tab === 'market' ? this.market() : this.logView();
    $('careerBody').innerHTML = (this.toast ? `<div class="toast">${esc(this.toast)}</div>` : '') + body;
    this.toast = '';
  }

  // ---------- Team and gym ----------

  private team(): string {
    const c = this.c;
    const me = this.me();
    const tabs = c.roster
      .map((f) => `<button type="button" class="pickf${f.id === me.id ? ' on' : ''}" data-act="pick" data-id="${f.id}"><b>${esc(short(f))}</b><span>рейтинг ${rating(f)}${busy(f) ? ' · занят' : ''}</span></button>`)
      .join('');
    return `<div class="presets">${tabs}</div>${this.card(me)}${this.gym(me)}`;
  }

  private card(f: CareerFighter): string {
    const d = DISCIPLINE_BY_ID[f.discipline];
    const rows = STAT_KEYS.map((k) => {
      const info = STAT_INFO[k];
      const span = info.hi - info.lo;
      const now = ((f.stats[k] - info.lo) / span) * 100;
      const cap = ((f.caps[k] - info.lo) / span) * 100;
      return `<div class="stat"><span>${info.name}</span><div class="sbar"><i style="width:${now}%"></i><em style="left:${cap}%"></em></div><b>${fmtStat(k, f.stats[k])}</b></div>`;
    }).join('');
    return `<div class="fcard">
      <div class="fname">${esc(f.name)}</div>
      <div class="fmeta">${esc(d.name)} · ${f.height.toFixed(2)} м · ${f.weight} кг · рейтинг <b>${rating(f)}</b> · известность <b>${f.fame}</b></div>
      <div class="fstory">${esc(f.story)}</div>
      <div class="fmeta">Бои: <b>${f.record.w}</b>–<b>${f.record.l}</b>${f.record.ko ? `, ${f.record.ko} досрочно` : ''} · тренер говорит: <b>${talentWord(f)}</b></div>
      <div class="stats">${rows}</div>
      <div class="fnote">Полоса — сейчас, чёрточка — его потолок (примерно, точно не знает никто).</div>
      ${this.status(f)}
    </div>`;
  }

  private status(f: CareerFighter): string {
    if (!busy(f)) return this.c.tour?.fighter === f.id ? `<div class="fbusy">На турнире: ${roundName(TIER_BY_ID[this.c.tour.tier].size, this.c.tour.round)} впереди</div>` : '';
    return `<div class="fbusy" data-until="${f.busyUntil}" data-from="${f.busyFrom}" data-id="${f.id}">
      <div>${esc(f.busyWhat)} · осталось <span class="cl">${clock(f.busyUntil - Date.now())}</span></div>
      <div class="bar"><i style="width:0"></i></div>
      <button type="button" data-act="skip" data-id="${f.id}">Ускорить · ${skipCost(f)} ж</button>
    </div>`;
  }

  private gym(f: CareerFighter): string {
    const stats = STAT_KEYS.map((k) => `<button type="button" class="chip${k === this.stat ? ' on' : ''}" data-act="stat" data-k="${k}">${STAT_INFO[k].name}</button>`).join('');
    const info = STAT_INFO[this.stat];
    const free = !busy(f) && this.c.tour?.fighter !== f.id;
    const its = INTENSITY.map((it) => {
      const g = gainOf(f, this.stat, it);
      return `<button type="button" class="power" data-act="train" data-it="${it.id}" ${free && this.c.money >= it.cost ? '' : 'disabled'}>
        <b>${it.name}</b><span>${it.minutes} мин · $${it.cost}<br>≈ +${fmtGain(this.stat, g)}${it.injury ? ` · риск травмы ${Math.round(it.injury * 100)}%` : ''}</span></button>`;
    }).join('');
    return `<div class="group-title">Зал</div>
      <div class="chips">${stats}</div>
      <div class="fnote"><b>${info.drill}.</b> ${info.desc} Чем ближе к потолку, тем меньше даёт.</div>
      <div class="powers">${its}</div>
      ${this.c.roster.length > 1 ? `<button type="button" data-act="sell" data-id="${f.id}">Продать контракт · $${Math.round(value(f) * 0.6)}</button>` : ''}`;
  }

  // ---------- Fights ----------

  private fights(): string {
    const c = this.c;
    const me = this.me();
    let html = `<div class="fnote">Выступает: <b>${esc(me.name)}</b> (рейтинг ${rating(me)}, известность ${me.fame}). Выбрать другого — во вкладке «Команда».</div>`;
    if (c.tour) {
      const t = TIER_BY_ID[c.tour.tier];
      const who = c.roster.find((f) => f.id === c.tour!.fighter)!;
      const opp = c.tour.next;
      html += `<div class="fcard tour">
        <div class="fname">Турнир «${esc(t.name)}»: ${roundName(t.size, c.tour.round)}</div>
        <div class="fmeta">${esc(short(who))} против <b>${esc(opp.name)}</b></div>
        <div class="fmeta">${esc(DISCIPLINE_BY_ID[opp.discipline].name)} · ${opp.height.toFixed(2)} м · ${opp.weight} кг · рейтинг <b>${rating(opp)}</b> · ${opp.record.w}–${opp.record.l}</div>
        <div class="fstory">${esc(opp.story)}</div>
        <button type="button" class="primary wide" data-act="tourfight" ${busy(who) ? 'disabled' : ''}>На бой</button>
      </div>`;
    }
    for (const t of TIERS) {
      const locked = me.fame < t.fame;
      const why = canEnter(c, me, t);
      html += `<div class="tier${locked ? ' locked' : ''}">
        <div class="fname">${esc(t.name)}${locked ? ` · нужна известность ${t.fame}` : ''}</div>
        <div class="fnote">${esc(t.desc)} Соперники: рейтинг ~${tierRating(t)}.</div>
        <div class="row">
          <button type="button" data-act="single" data-t="${t.id}" ${why ? 'disabled' : ''}>Бой<br><small>победа $${t.purse[0]} · проигрыш $${t.purse[1]}</small></button>
          <button type="button" data-act="tour" data-t="${t.id}" ${why || c.tour || c.money < t.fee ? 'disabled' : ''}>Турнир на ${t.size}<br><small>взнос $${t.fee} · приз $${t.prize}</small></button>
        </div>
      </div>`;
    }
    return html;
  }

  // ---------- Market ----------

  private market(): string {
    const c = this.c;
    const list = c.market
      .map((f, i) => `${this.card(f)}<button type="button" class="primary" data-act="buy" data-i="${i}" ${c.money < value(f) || c.roster.length >= MAX_ROSTER ? 'disabled' : ''}>Подписать · $${value(f)}</button>`)
      .join('');
    const next = Math.max(0, c.marketAt + 20 * 60000 - Date.now());
    return `<div class="fnote">Новые бойцы появятся через ${clock(next)}. В команде ${c.roster.length} из ${MAX_ROSTER}.</div>
      <button type="button" data-act="refresh" ${c.tokens < 2 ? 'disabled' : ''}>Обновить сейчас · 2 жетона</button>${list}`;
  }

  private logView(): string {
    return `<div class="log">${this.c.log.map((s) => `<div>${esc(s)}</div>`).join('')}</div>
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
      case 'pick':
        c.pick = b.dataset.id!;
        save(c);
        return say(null);
      case 'stat':
        this.stat = b.dataset.k as StatKey;
        return say(null);
      case 'train':
        return say(startTraining(c, me, this.stat, INTENSITY.find((x) => x.id === b.dataset.it)!) ?? `${short(me)} ушёл в зал`);
      case 'skip': {
        const f = c.roster.find((x) => x.id === b.dataset.id)!;
        return say(skip(c, f));
      }
      case 'sell':
        if (!confirm(`Продать контракт ${me.name}?`)) return;
        return say(sell(c, me));
      case 'buy':
        return say(buy(c, c.market[Number(b.dataset.i)]));
      case 'refresh':
        if (c.tokens < 2) return;
        c.tokens -= 2;
        refreshMarket(c);
        save(c);
        return say(null);
      case 'reset':
        if (!confirm('Стереть карьеру и начать сначала?')) return;
        this.c = reset();
        return say(null);
      case 'single': {
        const t = TIER_BY_ID[b.dataset.t!];
        const opp = opponent(t);
        this.go(me, opp, t, `${t.name}: ${short(me)} против ${short(opp)}`, (r) => afterFight(c, me, t, opp, r, false));
        return;
      }
      case 'tour': {
        const t = TIER_BY_ID[b.dataset.t!];
        const why = enterTour(c, me, t);
        if (why) return say(why);
        return say(`${short(me)} в турнирной сетке. Первый соперник: ${c.tour!.next.name}`);
      }
      case 'tourfight': {
        const tour = c.tour!;
        const t = TIER_BY_ID[tour.tier];
        const f = c.roster.find((x) => x.id === tour.fighter)!;
        this.go(f, tour.next, t, `${t.name}, ${roundName(t.size, tour.round)}`, (r) => tourFight(c, f, r));
        return;
      }
    }
  }

  private go(me: CareerFighter, opp: CareerFighter, t: Tier, title: string, after: (r: FightResult) => string[]): void {
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.fight(me, opp, t, title, (r) => {
      const lines = after(r);
      this.tab = 'fights';
      this.toast = lines.join(' · ');
      this.show();
    });
  }
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

function fmtStat(k: StatKey, v: number): string {
  return k === 'skill' || k === 'evasion' ? `${Math.round(v * 100)}%` : `×${v.toFixed(2)}`;
}

function fmtGain(k: StatKey, g: number): string {
  return k === 'skill' || k === 'evasion' ? `${(g * 100).toFixed(1)}%` : `${g.toFixed(3)}`;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!);
