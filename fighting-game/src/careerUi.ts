// The manager's screens. One thing per screen: the home screen shows your fighter and
// two big actions (train, fight); the gym, the fight ladder, the team and the market are
// their own screens with a way back. Before a fight you see who you meet; after it,
// what you got.
import {
  STAT_KEYS, STAT_INFO, INTENSITY, TIERS, TIER_BY_ID, MAX_ROSTER,
  load, save, reset, newCareer, tick, busy, refreshMarket, buy, sell,
  rating, talentWord, value, opponent, toParams, afterFight, tourFight, roundName, short, odds,
  person, current, myMatch, settle, settleOthers, finished, closeTour,
  rankings, rankOf, relOf, WCLASSES, classOf, sameClass, isChamp, champOf, type WClass, relWord, rivalsOf, titleBout, tierOf, TITLE_PURSE,
  MARKET_DAYS, dayName, weekday, weekStart, eventsOn, evById, nextDay, canBook, book, unbook, rebook,
  challenge, startTour, evTitle, bookedOn,
  tonusOf, tonusWord, CRAFT_NAME, CRAFT_TIERS, TIER_OPEN, craftOf, craftMoves, type Craft, moveName, styleCost, changeStyle,
  type Career, type CareerFighter, type Tier, type FightResult, type StatKey, type Ev,
} from './career';
import { DISCIPLINE_BY_ID, type DisciplineId } from './disciplines';
import { PLAN_NAME } from './brain';
import { TRAITS, moodWord, resolve, afterBrawl, drunk, barIncident } from './life';
import type { FighterParams } from './config';
import { exportSave, importSave } from './saveCode';
import { cloudFlush, cloudRestore, cloudAt, cloudState } from './cloud';
import { pendingChapter, storyChoose, storyCheck, storyFightDone } from './story';
import { GYMS, gymOf, gymOpen, moveGym, type GymId } from './gyms';
import {
  PARTS, JOBS, FOODS, TRAIN_ENERGY, MIN_TRAIN_ENERGY, HUNGRY, RENT, satOf, energyOf, partOf, partsLeft, cannot, jobClosed,
  trainNow, work, eat, rest, sessionGain, sessionCraft, needWord, DOW, treat, treatCost, beer, fightToll,
} from './city';
import { MAP_BY_ID } from './maps';
import { mapSvg, PLACE_BY_ID, type PlaceId } from './cityMap';
import type { SceneSpec } from './cutscenes';
import { homeSvg, APPARATUS, type HomeObj } from './homeArt';
import {
  ladder, cup, cupCanJoin, cupJoin, cupMyMatch, cupAdvance, cupFought, ambushFight, ambushDone, clubOf, ranked, nextStageNeeds,
  CUP_TIER, STREET_TIER, CUP_PRIZE, CUP_FEE, STAGE_NAME, type Club, type CupMatch,
} from './clubs';
import { ensureAct1, act1Check, act1Card, act1Film, act1Seen, act1Choose, act1FightDone, act1Pay, act1Goal, watchLesson, basementLost, act, type A1Fight } from './act1';

export interface CareerHooks {
  /** Show this fight in the arena; `done` gets the result when it is over. */
  fight(
    me: CareerFighter, opp: CareerFighter, tier: Tier, title: string, done: (r: FightResult) => void,
    tweak?: (p: FighterParams) => void,
    /** Scenes: the bar before a bar brawl; a title fight gets face to face and the belt. */
    opts?: { intro?: 'bar' | 'story'; barName?: string; title?: boolean; cls?: string; talk?: { who: 0 | 1 | null; text: string }[]; scene?: SceneSpec },
  ): void;
  /** A story scene on the engine (no fight); `done` when it ends or is skipped. */
  scene(spec: SceneSpec, done: () => void): void;
  /** Back to the sandbox. */
  close(): void;
}

type Screen = 'cup' | 'clubs' | 'club' | 'map' | 'more' | 'place' | 'save' | 'cal' | 'rank' | 'profile' | 'bracket' | 'home' | 'gym' | 'fights' | 'preview' | 'result' | 'team' | 'market' | 'log';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class CareerUi {
  c: Career;
  private screen: Screen = 'home';
  private stat: StatKey = 'bodySpeed';
  private gymTab: 'stats' | 'moves' | 'style' | 'halls' = 'stats';
  private move: Craft = 'hands';
  private toast = '';
  private timer = 0;
  /** The fight about to happen (preview screen). */
  private bill: { tier: Tier; opp: CareerFighter; tour: boolean; title?: boolean; ev?: Ev } | null = null;
  /** The day open in the calendar. */
  private calDay = 0;
  /** The weight class shown in the rankings. */
  private rankCls: WClass | null = null;
  /** A question waiting for Да / Нет (the browser's confirm() is blocked inside the artifact). */
  private asking: { text: string; run: () => void } | null = null;
  /** The fighter shown on the profile screen. */
  private profileId = '';
  /** The place on the map open now, and the last one visited (marked on the map). */
  private placeId: PlaceId = 'flat';
  /** The panel open over the home screen (a thing tapped in the flat or the basement). */
  private sheet: HomeObj | null = null;
  /** Which of an apparatus's exercises is picked. */
  private appSel = 0;
  /** The club open on the club screen. */
  private clubId = '';
  private visited: PlaceId | null = null;
  /** What happened in the last fight (result screen). */
  private outcome: { won: boolean; title: string; lines: string[] } | null = null;

  constructor(private hooks: CareerHooks) {
    this.c = load() ?? newCareer();
    save(this.c);
    $('career').addEventListener('click', (e) => this.onClick(e));
    // A save file picked on the save screen.
    $('career').addEventListener('change', (e) => {
      const input = e.target as HTMLInputElement;
      if (input.id !== 'saveFile' || !input.files?.[0]) return;
      input.files[0].text().then((code) => {
        this.asking = {
          text: 'Заменить игру на этом устройстве игрой из файла?',
          run: () => {
            importSave(code.trim()).then((err) => {
              if (err) {
                this.toast = err;
                this.render();
                return;
              }
              this.c = load() ?? newCareer();
              this.toast = 'Сохранение загружено. Связки и удары подхватятся после перезапуска страницы.';
              this.go('home');
            });
          },
        };
        this.render();
      });
    });
  }

  get open(): boolean {
    return !$('career').hidden;
  }

  show(): void {
    $('career').hidden = false;
    tick(this.c);
    ensureAct1(this.c);
    act1Check(this.c);
    if (storyCheck(this.c).length) save(this.c);
    this.render();
    // The very first scene plays by itself.
    const card = act1Card(this.c);
    if (card?.id === 's1' && !card.watched) this.playFilm();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.everySecond(), 1000);
  }

  /** Plays the open act 1 card's film, then back here with its choices. */
  private playFilm(): void {
    const spec = act1Film(this.c);
    if (!spec) return;
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.scene(spec, () => {
      act1Seen(this.c);
      this.screen = 'home';
      this.show();
    });
  }

  /** A fight of act 1: its scene first, then the result, then a scene after it if any. */
  private a1Fight(fight: A1Fight): void {
    const c = this.c;
    const f = c.roster.find((x) => x.id === c.pick) ?? c.roster[0];
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.fight(f, fight.opp, fight.tier, fight.title, (r) => {
      const res = act1FightDone(c, f, fight, r);
      this.outcome = { won: r.won, title: `${fight.title} · ${r.won ? 'победа' : 'поражение'}`, lines: res.lines };
      this.screen = 'result';
      if (res.scene) this.hooks.scene(res.scene, () => this.show());
      else this.show();
    }, undefined, { scene: fight.pre, cls: classOf(f).name });
  }

  /** Act 1: the goal and the open scene. */
  private goalCard(): string {
    const c = this.c;
    const g = act1Goal(c);
    const goal = g
      ? `<div class="goal slim"><div>🎯 ${g.debt > 0 ? `Долг Гусю <b>$${g.debt}</b>` : esc(g.text)} · ${g.left > 0 ? `<b>${g.left}</b> дн.` : '<b>сегодня!</b>'}</div>
          ${g.debt > 0 ? `<div class="row">${[100, 300].map((n) => `<button type="button" data-act="a1pay" data-n="${n}" ${c.money >= n ? '' : 'disabled'}>$${n}</button>`).join('')}<button type="button" data-act="a1pay" data-n="${g.debt}" ${c.money >= g.debt ? '' : 'disabled'}>Всё</button></div>` : ''}
        </div>`
      : '';
    return goal;
  }

  private act1CardHtml(): string {
    const card = act1Card(this.c);
    if (!card) return '';
    const showOpts = !card.film || card.watched;
    return `<div class="incident story act1">
      <div class="h2">🎬 ${esc(card.title)}</div>
      <div class="who">${esc(card.who)}</div>
      <div>${esc(card.text)}</div>
      ${card.film ? `<button type="button" class="${card.watched ? '' : 'primary'}" data-act="a1film">▶ ${card.watched ? 'Пересмотреть сцену' : 'Смотреть сцену'}</button>` : ''}
      ${showOpts ? `<div class="incopts">${card.opts.map((o) => `<button type="button" data-act="a1" data-o="${o.id}" ${o.no ? 'disabled' : ''}>${esc(o.label)}${o.no ? `<br><small>${esc(o.no)}</small>` : ''}</button>`).join('')}</div>` : '<div class="fnote">Сначала посмотри сцену — потом выбор.</div>'}
    </div>`;
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
    const main = MAIN_SCREENS.includes(this.screen);
    const top = `<div class="ctop">
      ${main ? '<button type="button" data-act="sandbox">← Арена</button>' : '<button type="button" data-act="back">← Назад</button>'}
      <div class="wallet"><span title="деньги">$<b>${c.money.toLocaleString('ru')}</b></span><span title="жетоны">◆ <b>${c.tokens}</b></span></div>
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
      : this.screen === 'save' ? this.saveView()
      : this.screen === 'place' ? this.place()
      : this.screen === 'map' ? this.mapView()
      : this.screen === 'cup' ? this.cupView()
      : this.screen === 'clubs' ? this.clubsView()
      : this.screen === 'club' ? this.clubView()
      : this.screen === 'more' ? this.moreView()
      : this.logView();
    const ask = this.asking
      ? `<div class="askbox"><div>${esc(this.asking.text)}</div><div class="row"><button type="button" class="primary" data-act="yes">Да</button><button type="button" data-act="no">Нет</button></div></div>`
      : '';
    // The pixel font has no ◆: the token sign is drawn in another font.
    const nav = main
      ? `<nav class="cnav">${([['home', '🏠', 'Дом'], ['map', '🗺', 'Город'], ['cal', '📅', 'Бои'], ['team', '👥', 'Команда'], ['more', '☰', 'Ещё']] as const)
          .map(([id, icon, name]) => `<button type="button" class="${this.screen === id ? 'on' : ''}" data-act="to" data-s="${id}"><span>${icon}</span>${name}</button>`).join('')}</nav>`
      : '';
    const inSheet = this.screen === 'home' && !!this.sheet;
    const toast = this.toast ? `<div class="toast">${esc(this.toast)}</div>` : '';
    const sheet = inSheet ? `<div class="sheetbg" data-act="sheetx"></div><div class="sheet">${toast}${this.sheetHtml(this.sheet!)}</div>` : '';
    $('career').innerHTML = (top + ask + (inSheet ? '' : toast) + body + nav + sheet).replace(/◆/g, '<i class="gem">◆</i>');
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
            <li>Это твой дом. <b>Тапай по вещам</b>: холодильник — еда, кровать — сон, телевизор — сюжет, дверь — город.</li>
            <li>Листай вниз — <b>подвал</b>. Тап по тренажёру — тренировка.</li>
            <li>День = утро, день, вечер. Каждое дело занимает часть дня. Следи за сытостью и энергией.</li>
          </ol>
          <button type="button" data-act="help">Понятно</button>
        </div>`;
    const a = act(c);
    const calls = (c.incidents?.length ?? 0) + (pendingChapter(c) ? 1 : 0) + (this.clubCall() ? 1 : 0);
    const card = act1Card(c);
    cupAdvance(c);
    const amb = ambushFight(c);
    const myCup = cupMyMatch(c);
    const banners = [
      amb ? `<button type="button" class="banner hot" data-act="ambush">👊 У подъезда ждёт ${esc(short(amb.opp))} из ${esc(amb.club.name)} — разобраться</button>` : '',
      myCup ? `<button type="button" class="banner hot" data-act="to" data-s="cup">🏆 Турнир сегодня — твой бой</button>` : '',
      card ? `<button type="button" class="banner hot" data-act="obj" data-o="tv">🎬 ${esc(card.title)} — ${card.film && !card.watched ? 'включи телевизор' : 'выбери, что делать'}</button>` : '',
      calls ? `<button type="button" class="banner" data-act="obj" data-o="phone">📞 Звонков: ${calls}</button>` : '',
    ].join('');
    const look = HOME_LOOK[f.discipline] ?? HOME_LOOK.mma;
    const art = homeSvg({
      badges: { tv: card ? '!' : '', phone: calls ? String(calls) : '', calendar: c.events.some((e) => e.f && !e.done && e.day === c.day) ? '!' : '' },
      tvOn: !!card, lost: !!a?.flags.lost, skin: SKIN_TONES[f.name.length % SKIN_TONES.length], shorts: look[0], hair: look[1],
      part: partOf(f), sleepy: partsLeft(c, f) === 0 && !bookedOn(c, f, c.day),
    });
    const fights = c.events.some((e) => e.f && !e.done && e.day >= c.day) ? this.today() : '';
    return `${help}${this.dayBar()}${this.goalCard()}${banners}${this.tourBanner()}${fights}
      <div class="homebox">${art}</div>
      <div class="fnote">Тапни по вещи. Ниже — подвал с тренажёрами.</div>`;
  }

  /** The panel for a thing in the flat or the basement. */
  private sheetHtml(o: HomeObj): string {
    const c = this.c;
    const f = this.me();
    const head = (t: string) => `<div class="sheethead"><b>${t}</b><button type="button" class="qx" data-act="sheetx">✕</button></div>`;
    const ap = APPARATUS[o];
    if (ap) {
      const opt = ap.what[Math.min(this.appSel, ap.what.length - 1)];
      const tabs = ap.what.length > 1 ? `<div class="row gtabs">${ap.what.map((w, i) => `<button type="button" class="${w === opt ? 'primary' : ''}" data-act="appsel" data-i="${i}">${w.name}</button>`).join('')}</div>` : '';
      const cur = opt.craft ? `${Math.round(craftOf(f, opt.craft) * 100)}%` : fmtStat(opt.k as StatKey, f.stats[opt.k as StatKey]);
      const its = INTENSITY.map((it) => {
        const g = opt.craft ? `+${(sessionCraft(f, opt.craft, it, c) * 100).toFixed(1)}%` : `+${fmtGain(opt.k as StatKey, sessionGain(f, opt.k as StatKey, it, c))}`;
        const no = cannot(c, f, 1, Math.max(TRAIN_ENERGY[it.id], MIN_TRAIN_ENERGY));
        return `<button type="button" class="ibtn" data-act="atrain" data-it="${it.id}" ${no ? 'disabled' : ''}><b>${it.name}</b><span class="gain">${g}</span><span>1 часть · −${TRAIN_ENERGY[it.id]}⚡</span><small>${no ?? (it.injury ? `травма ${Math.round(it.injury * 100)}%` : 'без риска')}</small></button>`;
      }).join('');
      const lost = act(c)?.flags.lost ? '<div class="fnote">Подвал закрыт — тренируешься во дворе, на 20% хуже.</div>' : '';
      return `${head(ap.name)}${lost}${tabs}<div class="fmeta">${opt.name} сейчас: <b>${cur}</b>${satOf(f) < HUNGRY ? ' · <b>голодный — вполсилы</b>' : ''}</div><div class="ibtns">${its}</div>`;
    }
    switch (o) {
      case 'bed':
        return `${head('Кровать')}<button type="button" class="primary" data-act="nextday">🌙 Спать — новый день</button>
          <button type="button" data-act="rest" ${partsLeft(c, f) ? '' : 'disabled'}>😌 Вздремнуть · 1 часть · +15⚡</button>
          ${DOW(c.day) === 6 ? `<div class="fnote">Ночью квартплата $${RENT}.</div>` : ''}`;
      case 'fridge': {
        const x = FOODS[0];
        return `${head('Холодильник')}<div class="fnote">На полке доширак. Нормальная еда и спортпит — в Пельменной (город).</div>
          <div class="ibtns"><button type="button" class="ibtn" data-act="eat" data-f="${x.id}" ${c.money < x.price ? 'disabled' : ''}><b>${x.name}</b><span class="gain">+${x.sat}</span><span>$${x.price}</span><small>сытость ${Math.round(satOf(f))}</small></button></div>
          <button type="button" data-act="to" data-s="map">🗺 В город, в Пельменную</button>`;
      }
      case 'tv': {
        const tape = act(c)?.done.includes('s3') && !act(c)?.flags.tape2;
        const card = this.act1CardHtml() || this.storyCard();
        return `${head('Телевизор')}${card || '<div class="fnote">По телевизору ничего нового.</div>'}
          ${tape ? '<button type="button" data-act="a1tape">📼 Кассета Михалыча «Урок 1» · часть дня</button>' : ''}
          <div class="newsbox"><div class="h2">Новости боёв</div>${(c.news ?? []).slice(0, 4).map((x) => `<div>${esc(x)}</div>`).join('')}</div>`;
      }
      case 'phone': {
        const list = this.clubCallHtml() + this.storyCard() + this.incidents();
        return `${head('Телефон')}${list || '<div class="fnote">Тишина. Никто не звонит.</div>'}`;
      }
      case 'door':
        return `${head('На улицу')}<button type="button" class="primary" data-act="to" data-s="map">🗺 Карта района</button>
          <div class="fnote">Работа, еда, чужие залы, бар, больница, арена.</div>`;
      case 'calendar':
        return `${head('Календарь')}${this.today()}<button type="button" class="primary" data-act="to" data-s="cal">📅 Бои и турниры</button>`;
      case 'belt':
        return `${head('Пояс Михалыча')}<div class="fnote">Старый тёмный пояс. Михалыч говорил: «не для красоты».</div>`;
      default:
        return `${head(esc(short(f)))}${this.hero(f)}`;
    }
  }

  /** After act 1, if nobody told him about the cup: a call from a strange number. */
  private clubCall(): boolean {
    const c = this.c;
    const a = c.act1;
    return !!a && !ladder(c).open && (!!a.ending || c.day - a.start >= 19);
  }

  private clubCallHtml(): string {
    if (!this.clubCall()) return '';
    return `<div class="incident story call">
      <div class="h2">📞 Незнакомый номер</div>
      <div class="who">Голос в трубке, сзади шум и музыка</div>
      <div>— Алло! Бойцовский клуб в подвале «Подковы»! Каждую субботу турнир, призы до трёхсот, взнос тридцать, клубы, байкеры, заводские…</div>
      <div><i>Второй голос, издалека:</i> — Первое правило бойцовского клуба: никому не говорить о бойцовском клубе! Тайлер!</div>
      <div>— Ооой… Я забыл. Слушай. Ты ничего не слышал. Суббота, подвал «Подковы». Записывайся на арене.</div>
      <div class="incopts"><button type="button" class="primary" data-act="clubcall">«Я ничего не слышал»</button></div>
    </div>`;
  }

  /** The district map, opened by its own button. */
  private mapView(): string {
    return `${this.dayBar()}<div class="mapbox">${this.cityMap()}</div><div class="fnote">Тапни здание: работа, еда, залы, бои.</div>`;
  }

  /** Everything that is not every day. */
  private moreView(): string {
    const c = this.c;
    return `<div class="h1">Ещё</div>
      <div class="nav4">
        <button type="button" data-act="to" data-s="clubs">🏴 Клубы</button>
        <button type="button" data-act="to" data-s="rank">🏆 Рейтинг</button>
        <button type="button" data-act="to" data-s="market">🛒 Рынок бойцов</button>
        <button type="button" data-act="to" data-s="log">📜 Журнал</button>
        <button type="button" data-act="to" data-s="gym">🥊 Зал: стиль и залы</button>
      </div>
      <button type="button" data-act="to" data-s="save">💾 Сохранение и перенос</button>
      <button type="button" data-act="helpagain">❓ Как играть</button>
      <div class="cheats">
        <span>Тест:</span>
        <button type="button" data-act="cheat" data-k="tokens" data-v="100">+100 ◆</button>
        <button type="button" data-act="cheat" data-k="money" data-v="500">+$500</button>
        <button type="button" data-act="cheat" data-k="money" data-v="-500">−$500</button>
        <button type="button" data-act="peak">До пика</button>
        <button type="button" data-act="testbar">🍺 Бар</button>
      </div>
      <div class="newsbox"><div class="h2">Новости мира боёв</div>${(c.news ?? []).slice(0, 6).map((x) => `<div>${esc(x)}</div>`).join('')}</div>`;
  }

  /** The open story chapter: who speaks, what happened, the choices. */
  private storyCard(): string {
    const ch = pendingChapter(this.c);
    if (!ch) return '';
    return `<div class="incident story">
      <div class="h2">${esc(ch.lineName)} · ${esc(ch.title)}</div>
      <div class="who">${esc(ch.who)}</div>
      <div>${esc(ch.text)}</div>
      ${ch.status ? `<div class="pill gold">${esc(ch.status)}</div>` : ''}
      <div class="incopts">${ch.opts.map((o) => `<button type="button" data-act="story" data-o="${o.id}" ${o.no ? 'disabled' : ''}>${esc(o.label)}${o.no ? `<br><small>${esc(o.no)}</small>` : ''}</button>`).join('')}</div>
    </div>`;
  }

  /** What happened to ours and waits for the manager's word. */
  private incidents(): string {
    const list = this.c.incidents ?? [];
    return list
      .map((i) => `<div class="incident">
        <div class="h2">${{ bar: '🍺 Драка в баре', binge: '🍾 Загул', street: '🚓 Уличная драка', skip: '💤 Прогул', sponsor: '💰 Спонсор', interview: '🎤 Интервью', love: '💘 Любовь', leave: '🚪 Хочет уйти' }[i.kind]}</div>
        <div>${esc(i.text)}</div>
        <div class="incopts">${i.opts.map((o) => `<button type="button" data-act="inc" data-i="${i.id}" data-o="${o.id}">${esc(o.label)}</button>`).join('')}</div>
        <div class="fnote">Не решишь до конца дня — будет «${esc(i.opts[i.opts.length - 1].label.toLowerCase())}».</div>
      </div>`)
      .join('');
  }

  /** Today's date, the part of the day the picked fighter is in, and the button that ends it. */
  private dayBar(): string {
    const c = this.c;
    const f = this.me();
    const p = partOf(f);
    const dots = [0, 1, 2].map((i) => `<span class="pdot${i < p ? ' used' : i === p ? ' now' : ''}">${PARTS[i]}</span>`).join('');
    // One compact strip: date, parts of the day, needs, sleep.
    return `<div class="daybar slim">
      <div class="dtop"><b>${dayName(c.day)}, ${weekday(c.day)}</b><div class="parts">${dots}</div></div>
      <div class="dline"><div class="needs">${needBar('🍞', satOf(f))}${needBar('⚡', energyOf(f))}</div>
      <button type="button" data-act="nextday" class="sleep ${partsLeft(c, f) ? '' : 'primary'}" title="Спать — новый день">🌙</button></div>
    </div>`;
  }

  /** The district with badges for what is on today. */
  private cityMap(): string {
    const c = this.c;
    const f = this.me();
    const b: Partial<Record<PlaceId, string>> = {};
    if (c.roster.some((x) => bookedOn(c, x, c.day)) || c.tour) b.arena = 'БОЙ';
    if (!jobClosed(c, f, JOBS[0])) b.site = '$';
    if (!jobClosed(c, f, JOBS[1])) b.market = '$';
    if (DOW(c.day) === 4 || DOW(c.day) === 5) b.bar = '$';
    if (treatCost(c, f)) b.hospital = '+';
    if (!partsLeft(c, f)) b.flat = 'Zz';
    const pend = act(c)?.pending;
    if (pend === 's4') b.alley = '!';
    if (pend === 's7') b.roof = '!';
    if (pend === 's8') b.bar = '!';
    return mapSvg(b, this.visited, true);
  }

  /** One place on the map: what can be done there. */
  private place(): string {
    const c = this.c;
    const f = this.me();
    const p = PLACE_BY_ID[this.placeId];
    const food = (ids: string[]) => `<div class="h2">Еда</div><div class="ibtns">${FOODS.filter((x) => ids.includes(x.id)).map((x) => `<button type="button" class="ibtn" data-act="eat" data-f="${x.id}" ${c.money < x.price ? 'disabled' : ''}>
      <b>${x.name}</b><span class="gain">+${x.sat}</span><span>$${x.price}</span><small>${x.note}</small></button>`).join('')}</div>`;
    const job = (id: string) => {
      const j = JOBS.find((x) => x.id === id)!;
      const why = jobClosed(c, f, j);
      return `<div class="h2">Работа</div><div class="ibtns"><button type="button" class="ibtn wide" data-act="work" data-j="${j.id}" ${why ? 'disabled' : ''}>
        <b>${j.name}</b><span class="gain">+$${j.pay}</span><span>${j.parts === 2 ? '2 части дня' : '1 часть дня'} · −${j.e}⚡</span><small>${why ?? j.desc}</small></button></div>`;
    };
    const restBtn = (label: string) => `<button type="button" data-act="rest" ${partsLeft(c, f) ? '' : 'disabled'}>${label}</button>`;
    let body = '';
    switch (p.id) {
      case 'flat':
        body = `${food(['cheap'])}
          <div class="h2">Отдых</div>${restBtn('😌 Отдохнуть · 1 часть · +15⚡, настроение')}
          <button type="button" data-act="to" data-s="gym" ${gymOf(c).id === 'basement' ? '' : 'disabled'}>🥊 ${basementLost(c) ? 'Тренироваться во дворе (−20%)' : 'Спуститься в подвал'}${gymOf(c).id === 'basement' ? ' · тренировка' : ' · команда ходит в другой зал'}</button>
          ${act(c)?.done.includes('s3') && !act(c)?.flags.tape2 ? '<button type="button" data-act="a1tape">📼 Кассета Михалыча «Урок 1» · часть дня</button>' : ''}
          ${DOW(c.day) === 6 ? `<div class="fnote">Сегодня ночью квартплата: $${RENT}.</div>` : `<div class="fnote">Квартплата $${RENT} — в ночь с воскресенья на понедельник.</div>`}`;
        break;
      case 'cafe':
        body = food(['cafe', 'sport']);
        break;
      case 'market':
        body = job('market') + food(['cheap']);
        break;
      case 'site':
        body = job('site');
        break;
      case 'bar':
        body = `${job('bouncer')}<div class="h2">Посидеть</div><button type="button" data-act="beer" ${partsLeft(c, f) && c.money >= 8 ? '' : 'disabled'}>🍺 Пиво с мужиками · 1 часть · $8 · настроение +10</button>`;
        break;
      case 'hospital': {
        const cost = treatCost(c, f);
        body = cost
          ? `<button type="button" class="primary" data-act="treat" ${c.money >= cost ? '' : 'disabled'}>💊 Лечиться · $${cost} · вдвое быстрее</button>`
          : `<div class="fnote">${short(f)} здоров${f.treated ? ' (уже лечится)' : ''}. Сюда — после тяжёлого боя или травмы.</div>`;
        break;
      }
      case 'arena':
        body = `<button type="button" class="primary" data-act="to" data-s="cup">🏆 Турнир недели</button>
          <button type="button" data-act="to" data-s="clubs">🏴 Клубы</button>
          ${this.today()}<button type="button" data-act="to" data-s="cal">📅 Календарь</button><button type="button" data-act="to" data-s="rank">Рейтинг</button>`;
        break;
      case 'gyms':
        body = `<div class="fnote">Команда сейчас ходит в «${esc(gymOf(c).name)}».</div>
          <button type="button" class="primary" data-act="gymgo" data-t="stats" ${gymOf(c).id === 'basement' ? 'disabled' : ''}>🥊 Тренироваться${gymOf(c).id === 'basement' ? ' · сначала выбери зал' : ''}</button>
          <button type="button" data-act="gymgo" data-t="halls">Выбрать зал</button>`;
        break;
      default:
        body = '<div class="fnote">Скоро: подпольные бои, следующий шаг.</div>';
    }
    return `<div class="h1">${p.icon} ${esc(p.name)}</div><div class="fnote">${esc(p.desc)}</div>${this.dayBar()}${this.status(f)}<div class="qbox city">${body}</div>`;
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
          <div class="fmeta">${isChamp(this.c, f) ? `<b class="belt">🏆 Чемпион мира</b>, ${classOf(f).name.toLowerCase()}` : `<b>#${rankOf(this.c, f)}</b> в рейтинге, ${classOf(f).name.toLowerCase()}`}${rivalsOf(this.c, f).length ? ` · <span class="rival">враги: ${rivalsOf(this.c, f).map((x) => esc(short(x))).join(', ')}</span>` : ''}</div>
        </div>
        <div class="rate"><b>${rating(f)}</b><span>рейтинг</span></div>
      </div>
      ${compact ? '' : `<div class="fstory">${esc(f.story)}</div>`}
      <div class="traits">${(f.traits ?? []).map((t) => `<span class="trait" title="${esc(TRAITS[t].desc)}">${TRAITS[t].icon} ${TRAITS[t].name}</span>`).join('')}${this.c.roster.includes(f) ? `<span class="trait mood">${moodWord(f).icon} ${moodWord(f).text}</span>` : ''}</div>
      ${compact || !this.c.roster.includes(f) ? '' : `<div class="fnote">${(f.traits ?? []).map((t) => TRAITS[t].desc).join(' ')}</div>`}
      ${this.status(f)}
      ${statsTable(f)}
      ${this.c.roster.includes(f) ? tonusRow(f) : ''}
      <div class="fnote">Полоса — уровень сейчас, белая чёрточка — его потолок (примерно). Тренер: <b>${talentWord(f)}</b>. Известность <b>${f.fame}</b>.</div>
    </div>`;
  }

  private status(f: CareerFighter): string {
    const c = this.c;
    if (!c.roster.includes(f)) return '';
    if (!busy(c, f)) {
      if (c.tour?.fighter === f.id) return `<div class="pill gold">На турнире, ждёт следующего боя</div>`;
      const b = bookedOn(c, f, c.day);
      const left = partsLeft(c, f);
      return b ? `<div class="pill gold">Сегодня вечером бой: ${esc(evTitle(b))}</div>` : left ? `<div class="pill green">Сейчас ${PARTS[partOf(f)]}: осталось частей дня — ${left}</div>` : `<div class="pill">День прожит: пора спать</div>`;
    }
    const days = f.busyUntil - c.day;
    return `<div class="pill">${f.session ? 'В зале' : 'Отдыхает'}: ${esc(f.busyWhat)} · ${days <= 1 ? 'свободен завтра' : `свободен с ${dayName(f.busyUntil)} (через ${days} дн.)`}. Есть и отдыхать можно.</div>`;
  }

  // ---------- Gym ----------

  private gym(): string {
    const f = this.me();
    const tabs = `<div class="row gtabs">${(
      [['stats', 'Качества'], ['moves', 'Приёмы'], ['style', 'Стиль'], ['halls', 'Залы']] as const
    ).map(([id, name]) => `<button type="button" class="${this.gymTab === id ? 'primary' : ''}" data-act="gymtab" data-t="${id}">${name}</button>`).join('')}</div>`;
    const head = `<div class="h1">Зал · ${esc(short(f))}</div>
      ${this.dayBar()}
      ${this.status(f)}
      ${tonusRow(f)}
      <div class="fnote">Тренировка занимает <b>часть дня</b> и тратит энергию и сытость. Любая держит <b>тонус</b>, даже на потолке. День без зала — минус форма.</div>
      ${tabs}`;
    if (this.gymTab === 'moves') return head + this.movesTab(f);
    if (this.gymTab === 'style') return head + this.styleTab(f);
    if (this.gymTab === 'halls') return head + this.hallsTab();
    return head + this.statsTab(f);
  }

  private movesTab(f: CareerFighter): string {
    const c = this.c;
    const disc = DISCIPLINE_BY_ID[f.discipline];
    const sel: Craft = this.move === 'legs' ? 'legs' : 'hands';
    const its = INTENSITY.map((it) => {
      const g = sessionCraft(f, sel, it, c);
      const no = cannot(c, f, 1, Math.max(TRAIN_ENERGY[it.id], MIN_TRAIN_ENERGY));
      return `<button type="button" class="ibtn" data-act="train" data-it="${it.id}" data-m="${sel}" ${no ? 'disabled' : ''}>
        <b>${it.name}</b><span class="gain">+${(g * 100).toFixed(1)}%</span><span>1 часть · −${TRAIN_ENERGY[it.id]}⚡</span>
        <small>${it.injury ? `травма ${Math.round(it.injury * 100)}%` : 'без риска'}${no ? ` · ${no}` : ''}</small></button>`;
    }).join('');
    const rows = (['hands', 'legs'] as Craft[]).map((k) => {
      const L = craftOf(f, k);
      const tiers = CRAFT_TIERS[k].map((ids, t) => {
        const open = L > 0 && L >= TIER_OPEN[t];
        const names = ids.map((id) => {
          const mine = (disc.weights[id] ?? 0) > 0;
          return `<span class="mv${open || mine ? ' on' : ''}">${esc(moveName(id))}${mine ? '' : open ? ' ✦' : ''}</span>`;
        }).join(' ');
        return `<div class="ctier"><small>${open ? 'открыто' : t === 0 ? 'с первой тренировки' : `откроется на ${Math.round(TIER_OPEN[t] * 100)}%`}</small> ${names}</div>`;
      }).join('');
      return `<button type="button" class="trow${k === sel ? ' on' : ''}" data-act="move" data-m="${k}">
        <div class="trow-top"><b>${CRAFT_NAME[k]}</b><span>${Math.round(L * 100)}%</span></div>
        <div class="sbar"><i style="width:${L * 100}%"></i>${TIER_OPEN.slice(1).map((o) => `<em style="left:${o * 100}%"></em>`).join('')}</div>
        ${tiers}</button>`;
    }).join('');
    return `<div class="fnote">Качай <b>руки</b> или <b>ноги</b>. Чем выше, тем чаще, быстрее и сильнее он бьёт этим, а на 35% и 70% открываются более сложные удары. ✦ — удар не из его стиля, теперь он его бьёт. Чем выше техника, тем быстрее учится.</div>
      <div class="trows">${rows}</div>
      <div class="h2">${CRAFT_NAME[sel]}: тренировать</div>
      <div class="ibtns">${its}</div>`;
  }

  private hallsTab(): string {
    const c = this.c;
    const cur = gymOf(c);
    const NAMES: Record<string, string> = { bodySpeed: 'скорость', strength: 'сила', mindSpeed: 'реакция', skill: 'техника', evasion: 'уклоны', cardio: 'выносливость', hands: 'руки', legs: 'ноги', tonus: 'тонус' };
    const rows = GYMS.filter((g) => g.id !== 'iron' || c.story?.flags.iron).map((g) => {
      const why = gymOpen(c, g);
      const bonus = Object.entries(g.bonus).map(([k, v]) => `${NAMES[k]} +${Math.round(((v as number) - 1) * 100)}%`).join(', ') || 'без бонусов';
      const mine = g.id === cur.id;
      return `<div class="hero"><div class="fname">${esc(g.name)}${mine ? ' <span class="pill green">вы здесь</span>' : ''}</div>
        <div class="fnote">${esc(g.desc)}</div>
        <div class="fmeta"><b>${bonus}</b> · ${g.price ? `$${g.price}/неделю` : 'бесплатно'}</div>
        ${mine ? (c.gymUntil && g.price ? `<div class="fnote">Оплачено до ${dayName(c.gymUntil)}</div>` : '') : `<button type="button" data-act="gymmove" data-g="${g.id}" ${why || c.money < g.price ? 'disabled' : ''}>Перейти${why ? ` · ${why}` : c.money < g.price ? ' · мало денег' : ''}</button>`}</div>`;
    }).join('');
    return `<div class="fnote">Вся команда тренируется в одном зале. Бонус зала умножает прирост от тренировок. Плата списывается раз в неделю; нет денег — команда вернётся в подвал.</div>${rows}`;
  }

  private styleTab(f: CareerFighter): string {
    const c = this.c;
    const ids: DisciplineId[] = ['mma', 'boxing', 'muaythai', 'kickboxing', 'karate', 'street'];
    const cost = styleCost(f);
    const rows = ids.map((id) => {
      const d = DISCIPLINE_BY_ID[id];
      const top = Object.entries(d.weights).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([m]) => moveName(m)).join(', ');
      const mine = id === f.discipline;
      return `<div class="hero"><div class="fname">${esc(d.name)}${mine ? ' <span class="pill green">его стиль</span>' : ''}</div>
        <div class="fnote">${esc(top)}</div>
        ${mine ? '' : `<button type="button" data-act="style" data-d="${id}" ${c.money < cost || busy(c, f) ? 'disabled' : ''}>Переучить · 3 дня · $${cost}</button>`}</div>`;
    }).join('');
    return `<div class="fnote">Стиль задаёт стойку, дистанцию и любимые удары. Руки и ноги при смене стиля остаются как были.</div>${rows}`;
  }

  private statsTab(f: CareerFighter): string {
    const c = this.c;
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
      const g = sessionGain(f, this.stat, it, c);
      const no = cannot(c, f, 1, Math.max(TRAIN_ENERGY[it.id], MIN_TRAIN_ENERGY));
      return `<button type="button" class="ibtn" data-act="train" data-it="${it.id}" ${no ? 'disabled' : ''}>
        <b>${it.name}</b>
        <span class="gain">+${fmtGain(this.stat, g)}</span>
        <span>1 часть · −${TRAIN_ENERGY[it.id]}⚡</span>
        <small>${it.injury ? `травма ${Math.round(it.injury * 100)}%` : 'без риска'}${no ? ` · ${no}` : ''}</small>
      </button>`;
    }).join('');
    return `<div class="fnote">Выбери качество и жми тренировку — она сразу идёт и занимает часть дня. Чем ближе к потолку, тем меньше даёт. ${satOf(f) < HUNGRY ? '<b>Голодный: прирост вдвое меньше — сначала поешь.</b>' : ''}</div>
      <div class="trows">${rows}</div>
      <div class="h2">${STAT_INFO[this.stat].name}: тренировать</div>
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
      const champ = champOf(c, classOf(f));
      head = `🏆 Бой за пояс чемпиона мира · ${classOf(f).name.toLowerCase()}`;
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
    const title = b.title ? (isChamp(this.c, me) ? 'Защита пояса чемпиона' : 'Бой за пояс чемпиона мира') : b.tour ? `Турнир «${b.tier.name}», ${roundName(current(this.c.tour!).length)}` : `Разовый бой · ${b.tier.name}`;
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
      ${this.planEditor(me, b.tier.rules.rounds)}
      <button type="button" class="primary wide" data-act="fight">В бой</button>
`;
  }

  /** The corner's plan, a tap per round cycles what he is told. */
  private planEditor(f: CareerFighter, rounds: number): string {
    if (!rounds) return '';
    const plan = f.gamePlan ?? [];
    const rows = Array.from({ length: rounds }, (_, r) => {
      const o = plan[r] ?? 'auto';
      return `<button type="button" class="gprow${o === 'auto' ? '' : ' on'}" data-act="gp" data-r="${r}"><span>Раунд ${r + 1}</span><b>${GP_LABEL[o]}</b></button>`;
    }).join('');
    const noLegs = plan.slice(0, rounds).includes('legs') && !['lowkick', 'calfkick'].some((id) => (DISCIPLINE_BY_ID[f.discipline].weights[id] ?? 0) > 0 || (craftMoves(f)[id] ?? 0) > 0);
    return `<div class="qbox"><div class="h2">План на бой</div>
      <div class="fnote">Жми на раунд, чтобы сменить задачу. Дисциплинированный (с техникой) держится плана лучше; если соперник поплыл, добивать он всё равно будет.</div>
      ${rows}
      ${noLegs ? '<div class="pill red">Бить по ногам нечем: покачай в зале «Ноги» (Приёмы)</div>' : ''}
      ${plan.some((x) => x !== 'auto') ? '<button type="button" data-act="gpclear">Сбросить: пусть решает сам</button>' : ''}
    </div>`;
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
      ${this.c.ladder?.cup && !this.c.ladder.cup.done && this.c.ladder.cup.ours ? '<button type="button" class="primary wide" data-act="to" data-s="cup">К турниру</button>' : ''}
      ${this.hero(this.me(), true)}
      <button type="button" class="${this.c.tour ? '' : 'primary '}wide" data-act="to" data-s="home">На главную</button>
      ${this.c.tour ? '' : '<div class="fnote">Бой занял вечер. Когда будешь готов — спать (🌙).</div>'}`;
  }

  // ---------- Team, market, log ----------

  /** A fighter's line in a bracket or a club list: name, club, rating. */
  private manLine(f: CareerFighter, extra = ''): string {
    const k = clubOf(this.c, f.id);
    const mine = this.c.roster.some((x) => x.id === f.id);
    return `<div class="cupman${mine ? ' mine' : ''}"><span class="cdot" style="background:${k ? k.colors[0] : '#555'};border-color:${k ? k.colors[1] : '#999'}"></span><b>${esc(short(f))}</b><small>${k ? esc(k.name) : mine ? 'твой' : 'без клуба'} · ${rating(f)}</small>${extra}</div>`;
  }

  /** The weekly tournament: sign up, the bracket over two days, our fights. */
  private cupView(): string {
    const c = this.c;
    const L = ladder(c);
    const cp = cup(c);
    cupAdvance(c);
    const f = this.me();
    const who = (id: string) => c.roster.find((x) => x.id === id) ?? cp.entrants.find((x) => x.id === id);
    const my = cupMyMatch(c);
    const match = (m: CupMatch | null, name: string) => {
      if (!m) return '';
      const A = who(m.a), Bm = who(m.b);
      if (!A || !Bm) return '';
      const mine = m === my;
      return `<div class="cupm${mine ? ' mine' : ''}"><div class="cupr">${name}</div>
        ${this.manLine(A, m.w === m.a ? ' <em>✔</em>' : '')}${this.manLine(Bm, m.w === m.b ? ' <em>✔</em>' : '')}
        ${mine ? `<button type="button" class="primary" data-act="cupfight">⚔ На бой</button>` : ''}</div>`;
    };
    const head = `<div class="h1">🏆 Подвальный турнир</div>
      <div class="fnote">Подвал бара «Подкова». 8 бойцов: клубы и одиночки. <b>Суббота</b> — четвертьфиналы и полуфиналы, <b>воскресенье</b> — финал и бой за 3-е место. Платят за 1–3 место: $${CUP_PRIZE.join(' / $')}. Взнос $${CUP_FEE}.</div>
      <div class="fmeta">Ступень: <b>${STAGE_NAME[L.stage]}</b>. Дальше: ${esc(nextStageNeeds(c))}.</div>`;
    if (!L.open) return `${head}<div class="pill">Пока закрыто. Откроется по сюжету.</div><button type="button" data-act="to" data-s="clubs">🏴 Клубы подвала</button>`;
    const day1 = cp.day === c.day ? 'сегодня' : `${dayName(cp.day)} (${weekday(cp.day)})`;
    const why = cupCanJoin(c, f);
    const sign = cp.ours
      ? `<div class="pill green">Записан: ${esc(short(c.roster.find((x) => x.id === cp.ours) ?? f))}. Турнир ${day1}</div>`
      : `<button type="button" class="primary" data-act="cupjoin" ${why ? 'disabled' : ''}>Записаться · $${CUP_FEE}${why ? ` · ${why}` : ''}</button>`;
    const bracket = cp.qf.length
      ? `<div class="h2">Суббота</div>${cp.qf.map((m, i) => match(m, `Четвертьфинал ${i + 1}`)).join('')}${cp.sf.map((m, i) => match(m, `Полуфинал ${i + 1}`)).join('')}
        ${cp.final ? `<div class="h2">Воскресенье</div>${match(cp.third, 'За 3-е место')}${match(cp.final, 'Финал')}` : ''}`
      : `<div class="fnote">Сетку тянут в день турнира. Клубы обычно выставляют по 2–3 человека.</div>`;
    const done = cp.done ? `<div class="pill gold">Турнир окончен. Следующий — в следующую субботу.</div>` : '';
    return `${head}${sign}${done}${bracket}
      <button type="button" data-act="to" data-s="clubs">🏴 Клубы подвала</button>
      ${L.history.length ? `<div class="newsbox"><div class="h2">Прошлые турниры</div>${L.history.slice(0, 5).map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}`;
  }

  private clubsView(): string {
    const L = ladder(this.c);
    const card = (k: Club) => {
      const r = ranked(k);
      return `<button type="button" class="clubcard" data-act="club" data-k="${k.id}" style="border-color:${k.colors[1]};background:${k.colors[0]}">
        <b style="color:${k.colors[1]}">${esc(k.name)}</b><span>«${esc(k.motto)}»</span>
        <small>${k.members.length} бойцов · сильнейший: ${esc(short(r[0]))} (${rating(r[0])})${L.beaten.includes(k.id) ? ' · лидер побеждён ✔' : ''}</small></button>`;
    };
    return `<div class="h1">🏴 Клубы</div>
      <div class="fnote">Ступень «${STAGE_NAME[L.stage]}». Чтобы подняться выше: ${esc(nextStageNeeds(this.c))}.</div>
      ${L.clubs.filter((k) => k.stage <= L.stage).map(card).join('')}
      <div class="fnote">Клубы следующих ступеней откроются позже.</div>`;
  }

  private clubView(): string {
    const L = ladder(this.c);
    const k = L.clubs.find((x) => x.id === this.clubId);
    if (!k) return this.clubsView();
    const rows = ranked(k).map((m, i) => `<div class="clubman">
      <div class="cmtop"><b>${i + 1}. ${esc(m.name)}${m.id === k.leader ? ' 👑' : ''}</b><span>${rating(m)}</span></div>
      <div class="fmeta">${esc(DISCIPLINE_BY_ID[m.discipline].name)} · ${m.height.toFixed(2)} м · ${m.weight} кг · ${m.record.w}–${m.record.l}</div>
      <div class="fnote">${esc(m.story)}</div></div>`).join('');
    return `<div class="clubhead" style="background:${k.colors[0]};border-color:${k.colors[1]}"><div class="h1" style="color:${k.colors[1]}">${esc(k.name)}</div><div>«${esc(k.motto)}»</div></div>
      <div class="fnote">${esc(k.desc)}</div>
      <div class="h2">Состав по силе</div>${rows}
      ${L.beaten.includes(k.id) ? '<div class="pill gold">Ты побил их лидера</div>' : `<div class="fnote">Победи лидера (👑) в турнире — это нужно, чтобы подняться на следующую ступень.</div>`}`;
  }

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
    return isChamp(this.c, f) ? '🏆 чемпион' : `#${rankOf(this.c, f)}`;
  }

  /** The world's rankings: the champion, the top twenty, and where ours stand. */
  private rankView(): string {
    const c = this.c;
    const me = this.me();
    const cls = this.rankCls ?? classOf(me);
    const all = rankings(c, cls);
    const mine = new Set(c.roster.map((x) => x.id));
    const champ = !!c.belts?.[cls.id];
    const row = (f: CareerFighter, i: number) => {
      const place = isChamp(c, f) ? '🏆' : `${i + (champ ? 0 : 1)}`;
      const feel = relOf(c, me, f);
      return `<button type="button" class="rrow${mine.has(f.id) ? ' mine' : ''}" data-act="profile" data-id="${f.id}">
        <span class="rpl">${place}</span><span class="rnm">${esc(short(f))}${feel <= -50 && f !== me ? ' <i class="rival">⚔</i>' : ''}</span>
        <span class="rst">${esc(DISCIPLINE_BY_ID[f.discipline].name)} · ${f.record.w}–${f.record.l}</span><b>${rating(f)}</b></button>`;
    };
    const top = all.slice(0, 21).map((f, i) => row(f, i)).join('');
    const below = all.map((f, i) => [f, i] as const).filter(([f, i]) => i > 20 && mine.has(f.id)).map(([f, i]) => row(f, i)).join('');
    const tabs = WCLASSES.map((w) => `<button type="button" class="${w === cls ? 'primary' : ''}" data-act="rankcls" data-c="${w.id}">${w.name}<br><small>${w.lo === 56 ? 'до 70' : w.hi > 100 ? 'от 86' : '71–85'} кг</small></button>`).join('');
    return `<div class="h1">Мировой рейтинг</div>
      <div class="row3">${tabs}</div>
      <div class="fnote">Бои — только внутри своего веса, в каждом весе свой пояс. Место зависит от очков: победа над тем, кто выше, даёт много, над слабым — мало. Чемпион — тот, у кого пояс; отобрать его можно только в бою за пояс (нужно быть в первой тройке). ⚔ — заклятый враг твоего бойца.</div>
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
      <button type="button" class="primary wide" data-act="challenge" ${isChamp(c, f) || !sameClass(f, this.me()) ? 'disabled' : ''}>Вызвать ${esc(short(this.me()))} против него</button>
      ${isChamp(c, f) ? '<div class="fnote">С чемпионом дерутся только за пояс.</div>' : !sameClass(f, this.me()) ? `<div class="fnote">Он в другом весе (${classOf(f).name.toLowerCase()}), твой боец — ${classOf(this.me()).name.toLowerCase()}.</div>` : ''}`}`;
  }

  private logView(): string {
    return `<div class="h1">Журнал</div>
      <div class="newsbox"><div class="h2">Новости</div>${(this.c.news ?? []).map((x) => `<div>${esc(x)}</div>`).join('')}</div>
      <div class="log">${this.c.log.map((s) => `<div>${esc(s)}</div>`).join('')}</div>
      <button type="button" data-act="to" data-s="save">💾 Сохранение и перенос</button>
      <button type="button" data-act="reset">Начать карьеру заново</button>`;
  }

  /** Copy the save out as a code, or paste one in from another device. */
  private saveView(): string {
    const ago = cloudAt ? Math.max(0, Math.round((Date.now() - cloudAt) / 60000)) : -1;
    const cloud = cloudState === 'on'
      ? `<div class="pill green">☁ Облачное сохранение включено: игра сама копируется в твой аккаунт claude.ai. ${ago < 0 ? 'Копии ещё нет.' : ago === 0 ? 'Последняя копия — только что.' : `Последняя копия — ${ago} мин назад.`}</div>
        <div class="row"><button type="button" data-act="cloudsave">Сохранить сейчас</button><button type="button" data-act="cloudload">Загрузить из облака</button></div>
        <div class="fnote">Если браузер потеряет игру, при следующем открытии она вернётся из облака сама.</div>`
      : `<div class="pill">☁ Облако недоступно здесь (игра открыта не на claude.ai или ты не вошёл). Используй файл ниже.</div>`;
    return `<div class="h1">Сохранение</div>
      ${cloud}
      <div class="h2">Файл сохранения</div>
      <div class="fnote">Вся игра одним файлом: карьера, бойцы, деньги, связки, удары, настройки. Сохрани его себе (в файлы телефона, в облако, отправь в мессенджер), а на другом устройстве загрузи.</div>
      <div class="row"><button type="button" class="primary" data-act="savefile">Скачать файл</button><button type="button" data-act="loadfile">Загрузить файл</button></div>
      <input type="file" id="saveFile" accept=".txt,text/plain" hidden>
      <details class="oldcode"><summary>Перенос кодом (если файл не получается)</summary>
      <div class="h2">1. На этом устройстве</div>
      <button type="button" class="primary wide" data-act="savemake">Сделать код</button>
      <textarea id="saveOut" class="savecode" readonly placeholder="Здесь появится код"></textarea>
      <button type="button" data-act="savecopy">Скопировать</button>
      <div class="h2">2. На другом устройстве</div>
      <div class="fnote">Открой игру там, зайди сюда же, вставь код и нажми «Загрузить». Игра там заменится этой.</div>
      <textarea id="saveIn" class="savecode" placeholder="Вставь код СЕЙВ1:…"></textarea>
      <button type="button" class="primary wide" data-act="saveload">Загрузить</button>
      </details>`;
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
      case 'cloudsave':
        cloudFlush(true).then((ok) => say(ok ? 'Сохранено в облако' : 'Не получилось сохранить, попробуй позже'));
        return;
      case 'cloudload':
        return ask('Заменить игру в этом браузере копией из облака?', () => {
          cloudRestore().then((err) => {
            if (err) return say(err);
            this.c = load() ?? newCareer();
            this.toast = 'Игра загружена из облака';
            this.go('home');
          });
        });
      case 'savemake':
        save(c);
        exportSave().then((code) => {
          const ta = document.getElementById('saveOut') as HTMLTextAreaElement | null;
          if (!ta) return;
          ta.value = code;
          ta.focus();
          ta.select();
        });
        return;
      case 'savecopy': {
        const ta = document.getElementById('saveOut') as HTMLTextAreaElement | null;
        if (!ta?.value) return say('Сначала нажми «Сделать код»');
        ta.focus();
        ta.select();
        const done = () => {
          this.toast = `Код скопирован (${Math.round(ta.value.length / 1000)} тыс. знаков). Отправь его себе и вставь на другом устройстве.`;
          const keep = ta.value;
          this.render();
          const again = document.getElementById('saveOut') as HTMLTextAreaElement | null;
          if (again) again.value = keep;
        };
        // The clipboard can be closed inside the artifact: then the code stays selected to copy by hand.
        let copied = false;
        try {
          copied = document.execCommand('copy');
        } catch {
          copied = false;
        }
        if (copied) return done();
        navigator.clipboard?.writeText(ta.value).then(done, () => {
          this.toast = 'Браузер не дал скопировать сам: код выделен, скопируй его вручную (долгое нажатие → Копировать)';
          const keep = ta.value;
          this.render();
          const again = document.getElementById('saveOut') as HTMLTextAreaElement | null;
          if (again) {
            again.value = keep;
            again.select();
          }
        });
        return;
      }
      case 'savefile':
        save(c);
        exportSave().then((code) => saveFile(code)).then(
          (msg) => say(msg),
          () => say('Не получилось скачать файл: попробуй перенос кодом ниже'),
        );
        return;
      case 'loadfile':
        (document.getElementById('saveFile') as HTMLInputElement | null)?.click();
        return;
      case 'saveload': {
        const code = (document.getElementById('saveIn') as HTMLTextAreaElement | null)?.value.trim() ?? '';
        if (!code) return say('Вставь код в поле');
        return ask('Заменить игру на этом устройстве игрой из кода?', () => {
          importSave(code).then((err) => {
            if (err) return say(err);
            this.c = load() ?? newCareer();
            this.toast = 'Сохранение загружено. Связки и удары подхватятся после перезапуска страницы.';
            this.go('home');
          });
        });
      }
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
      case 'testbar':
        barIncident(c, me);
        this.screen = 'home';
        return say('Тест: драка в баре');
      case 'peak': {
        // For testing: the chosen fighter at the top of what he can ever become.
        for (const k of STAT_KEYS) me.stats[k] = me.caps[k];
        c.log.unshift(`Тест: ${short(me)} натренирован до пика`);
        save(c);
        return say(`${short(me)} на пике: все качества на его потолке (рейтинг ${rating(me)})`);
      }
      case 'sandbox':
        return this.hide();
      case 'back':
        return this.go(this.screen === 'preview' ? (this.bill?.tour ? 'bracket' : 'cal') : this.screen === 'profile' ? 'rank' : this.screen === 'place' ? 'map' : this.screen === 'gym' && this.gymTab !== 'stats' ? 'more' : 'home');
      case 'obj':
        this.sheet = b.dataset.o as HomeObj;
        this.appSel = 0;
        if (this.screen !== 'home') return this.go('home');
        return say(null);
      case 'sheetx':
        this.sheet = null;
        return say(null);
      case 'appsel':
        this.appSel = Number(b.dataset.i);
        return say(null);
      case 'atrain': {
        const ap = this.sheet ? APPARATUS[this.sheet] : undefined;
        if (!ap) return say(null);
        const w = ap.what[Math.min(this.appSel, ap.what.length - 1)];
        const it = INTENSITY.find((x) => x.id === b.dataset.it)!;
        const r = trainNow(c, me, w.k as StatKey, it, w.craft);
        return say(r.ok ? `${short(me)}: ${r.text}` : r.text);
      }
      case 'helpagain':
        c.seenHelp = false;
        return this.go('home');
      case 'to':
        this.sheet = null;
        return this.go(b.dataset.s as Screen);
      case 'story': {
        const out = storyChoose(c, b.dataset.o!);
        if (!out.fight) return say(out.lines.join(' · ') || null);
        const sf = out.fight;
        const f = c.roster.find((x) => x.id === c.pick) ?? c.roster[0];
        $('career').hidden = true;
        clearInterval(this.timer);
        this.hooks.fight(f, sf.opp, sf.tier, sf.title, (r) => {
          const lines = storyFightDone(c, f, sf, r);
          this.outcome = { won: r.won, title: `${sf.title} · ${r.won ? 'победа' : 'поражение'}`, lines };
          this.screen = 'result';
          this.show();
        }, undefined, { intro: 'story', talk: sf.talk, title: sf.titleFight, cls: classOf(f).name });
        return;
      }
      case 'gymmove': {
        const id = b.dataset.g as GymId;
        const g = GYMS.find((x) => x.id === id)!;
        return ask(`Перейти в «${g.name.replace(/[«»]/g, '')}»?${g.price ? ` $${g.price} за неделю, дальше списывается каждую неделю.` : ''}`, () =>
          say(moveGym(c, id) ?? `Команда тренируется в зале «${g.name.replace(/[«»]/g, '')}»`));
      }
      case 'inc': {
        const inc = (c.incidents ?? []).find((x) => x.id === Number(b.dataset.i));
        if (!inc) return say(null);
        const out = resolve(c, inc, b.dataset.o!);
        if (!out.brawl) return say(out.lines.join(' · '));
        const { f, opp, tier } = out.brawl;
        c.pick = f.id;
        const title = `Бар: ${short(f)} (пьяный) против ${short(opp)}`;
        $('career').hidden = true;
        clearInterval(this.timer);
        this.hooks.fight(f, opp, tier, title, (r) => {
          const lines = afterBrawl(c, f, r.won);
          this.outcome = { won: r.won, title: r.won ? 'Вытащил из бара' : 'Вышибала оказался сильнее', lines };
          this.screen = 'result';
          this.show();
        }, drunk, { intro: 'bar', barName: inc.text.match(/«[^»]+»/)?.[0] });
        return;
      }
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
        const m = b.dataset.m;
        const r = trainNow(c, me, this.stat, it, m as Craft | undefined);
        return say(r.ok ? `${short(me)}: ${r.text}` : r.text);
      }
      case 'eat': {
        const r = eat(c, me, FOODS.find((x) => x.id === b.dataset.f)!);
        return say(r.text);
      }
      case 'work': {
        const r = work(c, me, JOBS.find((x) => x.id === b.dataset.j)!);
        return say(r.text);
      }
      case 'rest':
        return say(rest(c, me).text);
      case 'beer':
        return say(beer(c, me).text);
      case 'treat':
        return say(treat(c, me).text);
      case 'a1film':
        this.sheet = null;
        return this.playFilm();
      case 'a1pay':
        return say(act1Pay(c, Number(b.dataset.n)));
      case 'a1tape': {
        const r = watchLesson(c);
        if (!r.scene) return say(r.text);
        this.toast = r.text;
        $('career').hidden = true;
        clearInterval(this.timer);
        return this.hooks.scene(r.scene, () => this.show());
      }
      case 'a1': {
        const r = act1Choose(c, b.dataset.o!);
        if (r.fight) return this.a1Fight(r.fight);
        if (r.scene) {
          this.toast = r.lines.join(' · ');
          $('career').hidden = true;
          clearInterval(this.timer);
          return this.hooks.scene(r.scene, () => this.show());
        }
        return say(r.lines.join(' · ') || null);
      }
      case 'clubcall':
        ladder(c).open = true;
        save(c);
        this.sheet = null;
        return say('Турнир открыт: Город → Арена → «Турнир недели». Первая суббота — скоро');
      case 'cupjoin':
        return say(cupJoin(c, me));
      case 'club':
        this.clubId = b.dataset.k!;
        return this.go('club');
      case 'cupfight': {
        const m = cupMyMatch(c);
        if (!m) return say('Сегодня твоего боя нет');
        const f = c.roster.find((x) => x.id === c.ladder!.cup!.ours)!;
        const cp = c.ladder!.cup!;
        const opp = cp.entrants.find((x) => x.id === (m.a === f.id ? m.b : m.a))!;
        const k = clubOf(c, opp.id);
        const title = `Подвальный турнир: ${short(f)} против ${short(opp)}${k ? ` (${k.name})` : ''}`;
        $('career').hidden = true;
        clearInterval(this.timer);
        this.hooks.fight(f, opp, CUP_TIER, title, (r) => {
          fightToll(f, true);
          const lines = cupFought(c, f, m, r.won);
          this.outcome = { won: r.won, title, lines };
          this.screen = 'result';
          this.show();
        }, undefined, { cls: classOf(f).name });
        return;
      }
      case 'ambush': {
        const a = ambushFight(c);
        if (!a) return say(null);
        const f = c.roster.find((x) => x.id === c.ladder!.cup!.ours) ?? me;
        const title = `У подъезда: ${short(f)} против ${short(a.opp)} (${a.club.name})`;
        $('career').hidden = true;
        clearInterval(this.timer);
        this.hooks.fight(f, a.opp, STREET_TIER, title, (r) => {
          const lines = ambushDone(c, f, r.won);
          this.outcome = { won: r.won, title, lines };
          this.screen = 'result';
          this.show();
        }, undefined, { scene: {
          map: MAP_BY_ID.alley, a: { ...toParams(f, 0), name: short(f) }, b: { ...toParams(a.opp, 1), name: short(a.opp) }, dist: 3,
          lines: [
            { who: null, text: 'Утро перед финалом. У подъезда кто-то курит', shot: 'low', act: (s) => (s.scene!.dist = 2.2) },
            { who: 1, text: `Привет от ${a.club.name}. До финала ты не дойдёшь.`, shot: 'over1' },
            { who: 0, text: 'Посмотрим.', shot: 'close0' },
          ],
        } });
        return;
      }
      case 'place':
        this.placeId = b.dataset.p as PlaceId;
        this.visited = this.placeId;
        return this.go('place');
      case 'gymgo':
        this.gymTab = b.dataset.t as 'stats' | 'halls';
        return this.go('gym');
      case 'gymtab':
        this.gymTab = b.dataset.t as 'stats' | 'moves' | 'style' | 'halls';
        return say(null);
      case 'move':
        this.move = b.dataset.m as Craft;
        return say(null);
      case 'style': {
        const d = b.dataset.d as DisciplineId;
        return ask(`Переучить ${short(me)} на «${DISCIPLINE_BY_ID[d].name}»? 3 дня, $${styleCost(me)}.`, () =>
          say(changeStyle(c, me, d) ?? `${short(me)} переучивается: ${DISCIPLINE_BY_ID[d].name}`));
      }
      case 'gp': {
        const r = Number(b.dataset.r);
        const who = this.bill?.tour && c.tour ? c.roster.find((x) => x.id === c.tour!.fighter) ?? me : me;
        const plan = (who.gamePlan ??= []);
        while (plan.length <= r) plan.push('auto');
        plan[r] = GP_OPTS[(GP_OPTS.indexOf(plan[r]) + 1) % GP_OPTS.length];
        save(c);
        return say(null);
      }
      case 'gpclear':
        (this.bill?.tour && c.tour ? c.roster.find((x) => x.id === c.tour!.fighter) ?? me : me).gamePlan = [];
        save(c);
        return say('План боя сброшен: решает сам');
      case 'nextday': {
        const done = (err: string | null) => {
          if (err) return say(err);
          this.calDay = c.day;
          this.toast = `Новый день: ${dayName(c.day)}, ${weekday(c.day)}`;
          return this.go(this.screen === 'cal' || this.screen === 'gym' ? this.screen : 'home');
        };
        const err = nextDay(c);
        if (err === 'tour' || err === 'fight')
          return ask(err === 'tour' ? 'Твой боец ещё в турнире. Сняться и закончить день?' : 'Сегодня у твоего бойца бой. Не выходить на бой и закончить день? (известность −1)', () => done(nextDay(c, true)));
        return done(err);
      }
      case 'rankcls':
        this.rankCls = WCLASSES.find((w) => w.id === b.dataset.c) ?? null;
        return say(null);
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
    }, undefined, { title: !!b.title, cls: classOf(me).name });
  }
}

const MAIN_SCREENS: Screen[] = ['home', 'map', 'cal', 'team', 'more'];
const SKIN_TONES = ['#e0b090', '#c99a7a', '#a87a5a', '#8a5a3a', '#f0c8a0'];
/** Shorts and hair colours of the little figure at home, by style. */
const HOME_LOOK: Record<string, [string, string]> = {
  mma: ['#2a2a2a', '#2a1a10'], boxing: ['#c43a3a', '#1a1a1a'], muaythai: ['#3a5ac8', '#1a1010'],
  kickboxing: ['#d8a020', '#3a2010'], karate: ['#e8e8e8', '#1a1a1a'], street: ['#3a4a6a', '#5a3a20'],
  wrestling: ['#6a2a8a', '#2a1a10'], bjj: ['#2a4a8a', '#1a1a1a'],
};

const GP_OPTS = ['auto', 'outbox', 'pressure', 'counter', 'legs', 'body'];
const GP_LABEL: Record<string, string> = { auto: 'сам решает', ...PLAN_NAME };

function tonusRow(f: CareerFighter): string {
  const t = tonusOf(f);
  return `<div class="stats"><div class="stat"><span>Тонус</span><div class="sbar tonus"><i style="width:${t}%"></i></div><b>${Math.round(t)}</b></div></div><div class="fnote">Форма: <b>${tonusWord(f)}</b></div>`;
}

/** Offers the save as a file: through claude.ai's downloads where it runs, else a plain link. */
async function saveFile(code: string): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
  const name = `arena-save-${day}.txt`;
  const c = (window as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude;
  const dl = c?.use ? ((await c.use('downloads').catch(() => null)) as { save(r: { filename: string; data: string }): Promise<unknown> } | null) : null;
  if (dl) {
    try {
      await dl.save({ filename: name, data: code });
      return `Файл ${name} сохранён`;
    } catch (e) {
      const why = (e as { code?: string }).code;
      if (why === 'declined') return 'Скачивание отменено';
      if (why === 'rate_limited') return 'Окно скачивания уже открыто';
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([code], { type: 'text/plain' }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
  return `Файл ${name} скачан`;
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

/** A need (satiety, energy) as a labelled bar, coloured by how low it is. */
function needBar(name: string, v: number): string {
  return `<div class="need ${needWord(v)}"><span>${name}</span><div class="sbar"><i style="width:${Math.round(v)}%"></i></div><b>${Math.round(v)}</b></div>`;
}

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
