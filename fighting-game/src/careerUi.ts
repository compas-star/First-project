// The manager's screens. One thing per screen: the home screen shows your fighter and
// two big actions (train, fight); the gym, the fight ladder, the team and the market are
// their own screens with a way back. Before a fight you see who you meet; after it,
// what you got.
import {
  STAT_KEYS, STAT_INFO, FADE_AFTER, fadeOf, fmtDelta, INTENSITY, TIERS, TIER_BY_ID, MAX_ROSTER,
  load, save, reset, newCareer, tick, busy, refreshMarket, buy, sell,
  rating, talentWord, value, opponent, toParams, afterFight, tourFight, roundName, roundTier, short, odds,
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
import { GYMS, gymOf, gymOpen, moveGym, gymCap, type GymId } from './gyms';
import {
  PARTS, JOBS, FOODS, TRAIN_ENERGY, MIN_TRAIN_ENERGY, HUNGRY, RENT, satOf, energyOf, partOf, partsLeft, cannot, jobClosed,
  trainNow, work, eat, rest, sessionGain, sessionCraft, needWord, DOW, treat, treatCost, beer, fightToll,
  buyFood, eatStock, pantryOf, pantryCount,
} from './city';
import { MAP_BY_ID } from './maps';
import { PREPS, PREP_BY_ID, type PrepId } from './prep';
import { mapSvg, PLACES, PLACE_BY_ID, type PlaceId } from './cityMap';
import { placeSvg } from './placeArt';
import type { SceneSpec } from './cutscenes';
import { homeSvg, APPARATUS, type HomeObj } from './homeArt';
import {
  ladder, clubStage, cup, cupCanJoin, cupJoin, cupMyMatch, cupAdvance, cupFought, ambushFight, ambushDone, clubOf, ranked, nextStageNeeds,
  cupTier, cupCallDue, cupCallDone, cupTonight, cupNight, cupResult, cupCountRest, cupBet, cupPerson, coef, isOurs, nightDay,
  STREET_TIER, CUP_TIER, CUP_PRIZE, CUP_FEE, CUP_NIGHTS, CUP_ROUND_NAME, STAGE_NAME, type Club, type CupMatch,
} from './clubs';
import { callDue, callScene, callDone, trainTip, streetRep, act1Pay, watchLesson, basementLost, act, type A1Fight } from './act1';
import { actCheck, actCard, actFilm, actSeen, actChoose, actFightDone, actGoal, forcedNow } from './acts';
import { act2Fee, inSewer } from './act2';
import { act3Act, act3BrFight, act3Sides, BK_PRIZE, CH_PRIZE } from './act3';
import { tapesNote } from './tapes';
import { brMine, brPerson, brTonight, brCoef, brOurs, brDecide, brCount, brBet, ROUND_NAME } from './bracket';

export interface CareerHooks {
  /** Show this fight in the arena; `done` gets the result when it is over. */
  fight(
    me: CareerFighter, opp: CareerFighter, tier: Tier, title: string, done: (r: FightResult) => void,
    tweak?: (p: FighterParams) => void,
    /** Scenes: the bar before a bar brawl; a title fight gets face to face and the belt. */
    opts?: { intro?: 'bar' | 'story'; barName?: string; title?: boolean; cls?: string; talk?: { who: 0 | 1 | null; text: string }[]; scene?: SceneSpec; tapes?: boolean },
  ): void;
  /** A story scene on the engine (no fight); `done` when it ends or is skipped. */
  scene(spec: SceneSpec, done: () => void): void;
  /** Back to the sandbox. */
  close(): void;
}

type Screen = 'prep' | 'cup' | 'a3br' | 'a3sides' | 'clubs' | 'club' | 'map' | 'more' | 'place' | 'save' | 'cal' | 'rank' | 'profile' | 'bracket' | 'home' | 'gym' | 'fights' | 'preview' | 'result' | 'team' | 'market' | 'log';

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
  /** The quick bar's sheet over any screen: the food stock, or where to go. */
  private qs: 'eat' | 'go' | null = null;
  /** Which of an apparatus's exercises is picked. */
  private appSel = 0;
  /** The club open on the club screen. */
  private clubId = '';
  private visited: PlaceId | null = null;
  /** What happened in the last fight (result screen). */
  private outcome: { won: boolean; title: string; lines: string[] } | null = null;
  /** The fight about to start (cup, story...): preparation first, then `go`. */
  private prep: { me: CareerFighter; opp: CareerFighter; tier: Tier; title: string; note?: string; bet?: { r: number; i: number }; go: (tweak: (p: FighterParams) => void) => void } | null = null;
  private prepPick: PrepId = 'none';
  /** The open thing in a place's interior. */
  private pSheet: string | null = null;
  /** A bet being placed in the cup: which fight and on whom. */
  private betSel: { r: number; i: number; on: string } | null = null;
  /** Which tournament of act 3 the bracket screen shows. */
  private brWhich: 'bk' | 'ch' = 'bk';

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
    actCheck(this.c);
    if (storyCheck(this.c).length) save(this.c);
    this.render();
    // The very first scene plays by itself.
    const card = actCard(this.c);
    if (card?.id === 's1' && !card.watched) this.playFilm();
    else if (callDue(this.c)) this.playCall();
    else if (cupCallDue(this.c)) this.playCupCall();
    clearInterval(this.timer);
    this.timer = window.setInterval(() => this.everySecond(), 1000);
  }

  /** The fight club's call: a short film with voices in the phone; the cup opens after it. */
  private playCall(): void {
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.scene(callScene(this.c), () => {
      callDone(this.c);
      this.toast = 'Кубок «Подковы» открыт: Город → Арена → «Кубок»';
      this.screen = 'home';
      this.show();
    });
  }

  /** Two days before a cup: the barman of «Подкова» rings (mumbled through the phone). */
  private playCupCall(): void {
    const c = this.c;
    const f = this.me();
    const cp = cup(c);
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.scene({
      map: MAP_BY_ID.basement, a: { ...toParams(f, 0), name: short(f) }, b: { ...toParams(f, 1), name: short(f) }, dist: 2.4, hide: [false, true],
      lines: [
        { who: null, text: 'Утро. Звонит телефон', shot: 'wide' },
        { who: 2, name: '📞 Бармен «Подковы»', text: `Алло, чемпион! В субботу Кубок «Подковы», номер ${cp.n}. Шестнадцать человек, тысяча долларов победителю.`, shot: 'close0' },
        { who: 2, name: '📞 Бармен «Подковы»', text: `Запись до субботы, взнос полтинник. Байкеры уже записались. Ты-то будешь?`, shot: 'close0' },
        { who: 0, text: 'Буду.', shot: 'close0', act: (s) => s.gesture(s.fighters[0], 'nod', 1) },
      ],
    }, () => {
      cupCallDone(c);
      this.toast = `Кубок «Подковы» в ${weekday(cp.day)} — запишись (баннер на главной)`;
      this.screen = 'home';
      this.show();
    });
  }

  /** Plays the open act 1 card's film, then back here with its choices. */
  private playFilm(): void {
    const spec = actFilm(this.c);
    if (!spec) return;
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.scene(spec, () => {
      actSeen(this.c);
      this.screen = 'home';
      this.show();
    });
  }

  /** A fight of act 1: its scene first, then the result, then a scene after it if any. */
  private a1Fight(fight: A1Fight): void {
    const c = this.c;
    const f = fight.who ?? c.roster.find((x) => x.id === c.pick) ?? c.roster[0];
    this.toPrep({ me: f, opp: fight.opp, tier: fight.tier, title: fight.title, note: fight.note ?? tapesNote(c, fight.opp) ?? undefined, go: (tweak) => this.a1Go(fight, f, tweak) });
  }

  private a1Go(fight: A1Fight, f: CareerFighter, tweak: (p: FighterParams) => void): void {
    const c = this.c;
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.fight(f, fight.opp, fight.tier, fight.title, (r) => {
      const res = actFightDone(c, f, fight, r);
      this.outcome = { won: r.won, title: `${fight.title} · ${r.won ? 'победа' : 'поражение'}`, lines: res.lines };
      this.screen = 'result';
      if (res.scene) this.hooks.scene(res.scene, () => this.show());
      else this.show();
    }, tweak, { scene: fight.pre, cls: classOf(f).name, tapes: fight.tapes });
  }

  /** Act 1: the goal and the open scene. */
  private goalCard(): string {
    const c = this.c;
    const g = actGoal(c);
    const goal = g
      ? `<div class="goal slim${g.btns?.length ? ' wrap' : ''}"><div>🎯 ${g.debt > 0 ? `Долг Гусю <b>$${g.debt}</b>` : esc(g.text)}${g.left < 0 ? '' : ` · ${g.left > 0 ? `<b>${g.left}</b> дн.` : '<b>сегодня!</b>'}`}</div>
          ${g.btns?.length ? `<div class="a3btns">${g.btns.map((x) => `<button type="button" data-act="a3" data-o="${x.id}" ${x.no ? 'disabled' : ''}>${esc(x.label)}${x.no ? ` <small>(${esc(x.no)})</small>` : ''}</button>`).join('')}</div>` : ''}
          ${g.fee ? `<div class="row"><button type="button" data-act="a2fee" ${c.money >= g.fee ? '' : 'disabled'}>Взнос $${g.fee}</button></div>` : ''}
          ${g.debt > 0 ? `<div class="row">${[100, 300].map((n) => `<button type="button" data-act="a1pay" data-n="${n}" ${c.money >= n ? '' : 'disabled'}>$${n}</button>`).join('')}<button type="button" data-act="a1pay" data-n="${g.debt}" ${c.money >= g.debt ? '' : 'disabled'}>Всё</button></div>` : ''}
        </div>`
      : '';
    return goal;
  }

  /** The blocking screen: no sleeping, no walking away. */
  private forcedView(kind: 'card' | 'ambush'): string {
    const c = this.c;
    if (kind === 'ambush') {
      const a = ambushFight(c)!;
      return `<div class="incident story act1 forced">
        <div class="h2">👊 У подъезда</div>
        <div class="who">${esc(a.club.name)}</div>
        <div>Утро перед финалом. У подъезда ждёт ${esc(short(a.opp))}: «Привет от ${esc(a.club.name)}. До финала ты не дойдёшь». Мимо не пройти.</div>
        <div class="incopts"><button type="button" class="primary" data-act="ambush">Драться</button></div>
      </div>`;
    }
    return this.act1CardHtml().replace('class="incident story act1"', 'class="incident story act1 forced"') +
      '<div class="fnote">От этого не уйти: пока не разберёшься, день не закончится.</div>';
  }

  private act1CardHtml(): string {
    const card = actCard(this.c);
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
    // A fight the story will not let him walk past covers every screen until it is fought.
    const forced = this.screen === 'result' || this.screen === 'prep' ? null : forcedNow(c);
    const body =
      forced ? this.forcedView(forced.kind)
      : this.screen === 'home' ? this.home()
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
      : this.screen === 'a3br' ? this.a3brView()
      : this.screen === 'a3sides' ? this.a3sidesView()
      : this.screen === 'prep' ? this.prepView()
      : this.screen === 'clubs' ? this.clubsView()
      : this.screen === 'club' ? this.clubView()
      : this.screen === 'more' ? this.moreView()
      : this.logView();
    const ask = this.asking
      ? `<div class="askbox"><div>${esc(this.asking.text)}</div><div class="row"><button type="button" class="primary" data-act="yes">Да</button><button type="button" data-act="no">Нет</button></div></div>`
      : '';
    // The pixel font has no ◆: the token sign is drawn in another font.
    const nav = main && !forced
      ? `<nav class="cnav">${([['home', '🏠', 'Дом'], ['map', '🗺', 'Город'], ['cal', '📅', 'Бои'], ['team', '👥', 'Команда'], ['more', '☰', 'Ещё']] as const)
          .map(([id, icon, name]) => `<button type="button" class="${this.screen === id ? 'on' : ''}" data-act="to" data-s="${id}"><span>${icon}</span>${name}</button>`).join('')}</nav>`
      : '';
    const inSheet = this.screen === 'home' && !!this.sheet && !forced;
    const quick = forced || this.screen === 'result' || this.screen === 'prep' ? '' : this.quickBar();
    const qsheet = this.qs && !forced ? `<div class="sheetbg" data-act="qsx"></div><div class="sheet"><div class="sheethead"><b>${this.qs === 'eat' ? '🍞 Запасы еды' : '🧭 Куда пойти'}</b><button type="button" class="qx" data-act="qsx">✕</button></div>${this.qs === 'eat' ? this.stockHtml() : this.goHtml()}</div>` : '';
    const toast = this.toast ? `<div class="toast">${esc(this.toast)}</div>` : '';
    const sheet = inSheet ? `<div class="sheetbg" data-act="sheetx"></div><div class="sheet">${toast}${this.sheetHtml(this.sheet!)}</div>` : '';
    $('career').innerHTML = (top + quick + ask + (inSheet ? '' : toast) + body + nav + sheet + qsheet).replace(/◆/g, '<i class="gem">◆</i>');
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
    const cpc = ladder(c).open ? cup(c) : null;
    const calls = (c.incidents?.length ?? 0) + (pendingChapter(c) ? 1 : 0) + (cpc && cpc.call && !cpc.ours && !cpc.rounds.length ? 1 : 0);
    const card = actCard(c);
    cupAdvance(c);
    const amb = ambushFight(c);
    const myCup = cupMyMatch(c);
    const tonightCup = ladder(c).open ? cupTonight(c) : null;
    const cpSoon = ladder(c).open ? cup(c) : null;
    const soon = cpSoon && !cpSoon.ours && !cpSoon.rounds.length && cpSoon.day - c.day <= 2 && cpSoon.day >= c.day ? cpSoon : null;
    const banners = [
      amb ? `<button type="button" class="banner hot" data-act="ambush">👊 У подъезда ждёт ${esc(short(amb.opp))} из ${esc(amb.club.name)} — разобраться</button>` : '',
      soon ? `<button type="button" class="banner hot" data-act="cupjoin">📞 Кубок «Подковы» ${soon.day === c.day ? 'сегодня' : soon.day === c.day + 1 ? 'завтра' : 'послезавтра'} — записаться · $${CUP_FEE}</button>` : '',
      myCup ? `<button type="button" class="banner hot" data-act="to" data-s="cup">🏆 Вечер Кубка «Подковы» — твой бой</button>` : tonightCup ? `<button type="button" class="banner" data-act="to" data-s="cup">🏆 Сегодня вечер Кубка: ${CUP_ROUND_NAME[tonightCup.r].toLowerCase()} — смотреть и ставить</button>` : '',
      card ? `<button type="button" class="banner hot" data-act="obj" data-o="tv">🎬 ${esc(card.title)} — ${card.film && !card.watched ? 'включи телевизор' : 'выбери, что делать'}</button>` : '',
      calls ? `<button type="button" class="banner" data-act="obj" data-o="phone">📞 Звонков: ${calls}</button>` : '',
    ].join('');
    const look = HOME_LOOK[f.discipline] ?? HOME_LOOK.mma;
    const art = homeSvg({
      badges: { tv: card ? '!' : '', phone: calls ? String(calls) : '', calendar: c.events.some((e) => e.f && !e.done && e.day === c.day) ? '!' : '' },
      tvOn: !!card, lost: !!a?.flags.lost, sewer: inSewer(c), skin: SKIN_TONES[f.name.length % SKIN_TONES.length], shorts: look[0], hair: look[1],
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
      const k = opt.k as StatKey;
      const capNote = opt.craft ? '' : f.stats[k] >= gymCap(c, f, k) - 1e-3
        ? `<div class="pill red">Здешние тренажёры больше не дают роста: ${fmtStat(k, gymCap(c, f, k))}. Нужен зал получше (Город → Спортквартал)</div>`
        : `<div class="fnote">Потолок этого зала: ${fmtStat(k, gymCap(c, f, k))}</div>`;
      const idle = c.day - (f.worked?.[k] ?? c.day);
      const lostK = f.faded?.[k] ?? 0;
      const fade = !opt.craft && idle >= FADE_AFTER - 1
        ? `<div class="fade ${idle >= FADE_AFTER ? 'on' : 'warn'}">Не тренировал ${idle} дн.${idle >= FADE_AFTER ? ` — уходит −${fmtDelta(k, fadeOf(f, k))} за ночь${lostK > 0 ? `, уже ушло −${fmtDelta(k, lostK)}` : ''}. Тренировка сейчас остановит` : ' — с завтрашней ночи начнёт уходить'}</div>`
        : '';
      return `${head(ap.name)}${lost}${tabs}<div class="fmeta">${opt.name} сейчас: <b>${cur}</b>${satOf(f) < HUNGRY ? ' · <b>голодный — вполсилы</b>' : ''}</div>${capNote}${fade}<div class="ibtns">${its}</div>`;
    }
    switch (o) {
      case 'bed':
        return `${head('Кровать')}<button type="button" class="primary" data-act="nextday">🌙 Спать — новый день</button>
          <button type="button" data-act="rest" ${partsLeft(c, f) ? '' : 'disabled'}>😌 Вздремнуть · 1 часть · +15⚡</button>
          ${DOW(c.day) === 6 ? `<div class="fnote">Ночью квартплата $${RENT}.</div>` : ''}`;
      case 'fridge': {
        const x = FOODS[0];
        return `${head('Холодильник')}${this.stockHtml()}
          <div class="h2">Доширак с полки</div>
          <div class="ibtns"><button type="button" class="ibtn" data-act="eat" data-f="${x.id}" ${c.money < x.price ? 'disabled' : ''}><b>${x.name}</b><span class="gain">+${x.sat}</span><span>$${x.price}</span><small>сытость ${Math.round(satOf(f))}</small></button></div>
          <button type="button" data-act="place" data-p="cafe">🥟 В Пельменную — нормальная еда и спортпит</button>`;
      }
      case 'tv': {
        const tape = act(c)?.done.includes('s3') && !act(c)?.flags.tape2;
        const card = this.act1CardHtml() || this.storyCard();
        // The story so far (user: act 2 got lost): the last story lines from the journal.
        const past = (c.storyLog ?? []).slice(0, 12);
        const recap = past.length ? `<details class="newsbox"><summary class="h2">📖 Что было</summary>${past.map((x) => `<div>${esc(x)}</div>`).join('')}</details>` : '';
        return `${head('Телевизор')}${card || '<div class="fnote">По телевизору ничего нового.</div>'}${recap}
          ${tape ? '<button type="button" data-act="a1tape">📼 Кассета Михалыча «Урок 1» · часть дня</button>' : ''}
          <div class="newsbox"><div class="h2">Новости боёв</div>${(c.news ?? []).slice(0, 4).map((x) => `<div>${esc(x)}</div>`).join('')}</div>`;
      }
      case 'phone': {
        const cpp = ladder(c).open ? cup(c) : null;
        const remind = cpp && !cpp.ours && !cpp.rounds.length && cpp.call
          ? `<div class="incident"><div class="h2">📞 Бармен «Подковы»</div><div>Кубок №${cpp.n} — ${dayName(cpp.day)} (${weekday(cpp.day)}). 16 бойцов, $1000 победителю, взнос $${CUP_FEE}.</div><button type="button" class="primary" data-act="cupjoin">Записаться</button></div>`
          : '';
        const list = remind + this.storyCard() + this.incidents();
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

  /** Always at hand (user: eat, sleep, go anywhere without walking through the city). */
  private quickBar(): string {
    const c = this.c;
    const f = this.me();
    const n = pantryCount(c);
    return `<div class="qbar">
      <button type="button" data-act="qs" data-q="eat">🍞<span>Есть${n ? ` (${n})` : ''}</span></button>
      <button type="button" data-act="rest" ${partsLeft(c, f) ? '' : 'disabled'}>😌<span>Отдых</span></button>
      <button type="button" data-act="gymgo" data-t="stats">💪<span>Зал</span></button>
      <button type="button" data-act="qs" data-q="go">🧭<span>Куда</span></button>
      <button type="button" data-act="nextday" class="${partsLeft(c, f) ? '' : 'primary'}">🌙<span>Спать</span></button>
    </div>`;
  }

  /** The food stock: eat one, no money, no time. */
  private stockHtml(): string {
    const c = this.c;
    const f = this.me();
    const p = pantryOf(c);
    const have = FOODS.filter((x) => (p[x.id] ?? 0) > 0);
    return `<div class="fmeta">${esc(short(f))}: сытость <b>${Math.round(satOf(f))}</b> / 100</div>
      ${have.length
        ? `<div class="ibtns">${have.map((x) => `<button type="button" class="ibtn" data-act="eatstock" data-f="${x.id}" ${satOf(f) >= 95 ? 'disabled' : ''}><b>${x.name}</b><span class="gain">+${x.sat}</span><span>есть ${p[x.id]}</span><small>${x.note}</small></button>`).join('')}</div>`
        : '<div class="fnote">Запасов нет. Купи «с собой» в Пельменной или на рынке.</div>'}
      <div class="row"><button type="button" data-act="place" data-p="cafe">🥟 Пельменная</button><button type="button" data-act="place" data-p="market">📦 Рынок</button></div>`;
  }

  /** Every place in one tap, with what is on there today. */
  private goHtml(): string {
    const c = this.c;
    const b = this.placeBadges();
    const WHAT: Partial<Record<PlaceId, string>> = {
      flat: 'дом, сон, тренировка в подвале', cafe: 'еда и спортпит, с собой', market: 'работа грузчиком, доширак', site: 'работа на стройке',
      bar: '«Подкова»: вышибала, пиво, кубок', hospital: 'лечение', arena: 'бои, календарь, рейтинг', gyms: 'залы города',
    };
    const BADGE: Record<string, string> = { БОЙ: 'бой сегодня', $: 'есть работа', '+': 'можно лечиться', Zz: 'пора спать', '!': 'тебя ждут' };
    const places = PLACES.filter((p) => WHAT[p.id]).map((p) => `<button type="button" class="goline" data-act="place" data-p="${p.id}"><span>${p.icon}</span><b>${esc(p.name)}</b><small>${esc(WHAT[p.id]!)}</small>${b[p.id] ? `<em>${BADGE[b[p.id]!] ?? b[p.id]}</em>` : ''}</button>`).join('');
    const extra = [
      `<button type="button" class="goline" data-act="gymgo" data-t="stats"><span>💪</span><b>Твой зал</b><small>${esc(gymOf(c).name)}: тренировка</small></button>`,
      ladder(c).open ? `<button type="button" class="goline" data-act="to" data-s="cup"><span>🏆</span><b>Кубок «Подковы»</b><small>сетка, ставки, свой бой</small></button>` : '',
      `<button type="button" class="goline" data-act="to" data-s="cal"><span>📅</span><b>Бои</b><small>календарь и запись</small></button>`,
      `<button type="button" class="goline" data-act="to" data-s="map"><span>🗺</span><b>Карта района</b><small>всё как на улице</small></button>`,
    ].join('');
    return `<div class="golist">${extra}${places}</div>`;
  }

  /** What is on today at each place (badges on the map and in «Куда пойти»). */
  private placeBadges(): Partial<Record<PlaceId, string>> {
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
    return b;
  }

  /** The district with badges for what is on today. */
  private cityMap(): string {
    return mapSvg(this.placeBadges(), this.visited, true);
  }

  /** One place on the map: what can be done there. */
  private place(): string {
    const c = this.c;
    const f = this.me();
    const p = PLACE_BY_ID[this.placeId];
    const food = (ids: string[]) => `<div class="h2">Еда</div><div class="ibtns">${FOODS.filter((x) => ids.includes(x.id)).map((x) => `<button type="button" class="ibtn" data-act="eat" data-f="${x.id}" ${c.money < x.price ? 'disabled' : ''}>
      <b>${x.name}</b><span class="gain">+${x.sat}</span><span>$${x.price}</span><small>${x.note}</small></button>`).join('')}</div>
      <div class="h2">🎒 С собой <small>(в запасах: ${pantryCount(c)})</small></div><div class="buyrow">${FOODS.filter((x) => ids.includes(x.id)).map((x) => [1, 3].map((n) => `<button type="button" data-act="buy" data-f="${x.id}" data-n="${n}" ${c.money < x.price * n ? 'disabled' : ''}>${x.name} ×${n} · $${x.price * n}</button>`).join('')).join('')}</div>
      <div class="fnote">Запасы не портятся. Есть их можно где угодно: кнопка 🍞 сверху.</div>`;
    const job = (id: string) => {
      const j = JOBS.find((x) => x.id === id)!;
      const why = jobClosed(c, f, j);
      return `<div class="h2">Работа</div><div class="ibtns"><button type="button" class="ibtn wide" data-act="work" data-j="${j.id}" ${why ? 'disabled' : ''}>
        <b>${j.name}</b><span class="gain">+$${j.pay}</span><span>${j.parts === 2 ? '2 части дня' : '1 часть дня'} · −${j.e}⚡</span><small>${why ?? j.desc}</small></button></div>`;
    };
    const restBtn = (label: string) => `<button type="button" data-act="rest" ${partsLeft(c, f) ? '' : 'disabled'}>${label}</button>`;
    // Pixel interiors (user: every building like the home): tap a thing, a sheet opens.
    const art = p.id === 'flat' ? '' : placeSvg(p.id, { cupOn: !!(ladder(c).open && cupTonight(c)) });
    if (art) {
      const g = (id: GymId) => {
        const gm = GYMS.find((x) => x.id === id)!;
        const why = gymOpen(c, gm);
        const mine = gymOf(c).id === id;
        return `<div class="fnote">${esc(gm.desc)}</div><div class="fmeta">${gm.price ? `$${gm.price}/неделю` : 'бесплатно'} · тренажёры до ${Math.round(gm.level * 100)}% таланта</div>
          ${mine ? `<div class="pill green">Команда ходит сюда</div><button type="button" class="primary" data-act="gymgo" data-t="stats">🥊 Тренироваться</button>` : `<button type="button" class="primary" data-act="gymmove" data-g="${id}" ${why || c.money < gm.price ? 'disabled' : ''}>Перейти${why ? ` · ${why}` : c.money < gm.price ? ' · мало денег' : ''}</button>`}`;
      };
      const SHEETS: Record<string, [string, () => string]> = {
        counter: ['Обед', () => food(['cafe'])],
        sport: ['Спортпит', () => food(['sport'])],
        stall: ['Прилавок', () => food(['cheap'])],
        crates: ['Ящики', () => job('market')],
        bags: ['Цемент', () => job('site')],
        beer: ['Стойка', () => `<button type="button" data-act="beer" ${partsLeft(c, f) && (c.money >= 8 || streetRep(c) >= 2) ? '' : 'disabled'}>🍺 Пиво с мужиками · 1 часть · ${streetRep(c) >= 2 ? 'за счёт заведения' : '$8'} · настроение +10</button>`],
        door: ['Дверь', () => job('bouncer')],
        desk: ['Приёмная', () => {
          const cost = treatCost(c, f);
          return cost
            ? `<button type="button" class="primary" data-act="treat" ${c.money >= cost ? '' : 'disabled'}>💊 Лечиться · $${cost} · вдвое быстрее</button>`
            : `<div class="fnote">${short(f)} здоров${f.treated ? ' (уже лечится)' : ''}. Сюда — после тяжёлого боя или травмы.</div>`;
        }],
        g_boxing: ['Клуб «Перчатка»', () => g('boxing')], g_thai: ['Лагерь «Сиам»', () => g('thai')], g_power: ['Атлетический центр', () => g('power')],
        g_mind: ['Академия реакции', () => g('mind')], g_elite: ['Центр «Олимп»', () => g('elite')],
      };
      const sh = this.pSheet ? SHEETS[this.pSheet] : undefined;
      const sheet = sh ? `<div class="sheetbg" data-act="psheetx"></div><div class="sheet"><div class="sheethead"><b>${sh[0]}</b><button type="button" class="qx" data-act="psheetx">✕</button></div>${sh[1]()}</div>` : '';
      return `<div class="h1">${p.icon} ${esc(p.name)}</div>${this.dayBar()}${this.status(f)}${art}<div class="fnote">${esc(p.desc)} Тапай по вещам и людям.</div>${p.id === 'gyms' ? `<div class="fnote">Команда сейчас ходит в «${esc(gymOf(c).name)}».</div>` : ''}${sheet}`;
    }
    let body = '';
    switch (p.id) {
      case 'flat':
        body = `${food(['cheap'])}
          <div class="h2">Отдых</div>${restBtn('😌 Отдохнуть · 1 часть · +15⚡, настроение')}
          <button type="button" data-act="to" data-s="gym" ${gymOf(c).id === 'basement' ? '' : 'disabled'}>🥊 ${inSewer(c) ? 'Тренироваться в канализации (−20%)' : basementLost(c) ? 'Тренироваться во дворе (−20%)' : 'Спуститься в подвал'}${gymOf(c).id === 'basement' ? ' · тренировка' : ' · команда ходит в другой зал'}</button>
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
        body = `<button type="button" class="primary" data-act="to" data-s="cup">🏆 Кубок «Подковы»</button>
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
      ${statsTable(f, this.c.roster.includes(f) ? this.c.day : undefined)}
      ${this.c.roster.includes(f) && !compact ? `<div class="fnote">${FADE_RULE}</div>` : ''}
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
        <div class="fmeta">Тренажёры: до <b>${Math.round(g.level * 100)}%</b> таланта</div>
        ${mine ? (c.gymUntil && g.price ? `<div class="fnote">Оплачено до ${dayName(c.gymUntil)}</div>` : '') : `<button type="button" data-act="gymmove" data-g="${g.id}" ${why || c.money < g.price ? 'disabled' : ''}>Перейти${why ? ` · ${why}` : c.money < g.price ? ' · мало денег' : ''}</button>`}</div>`;
    }).join('');
    return `<div class="fnote">Вся команда тренируется в одном зале. Тренажёры зала решают, до какого уровня можно дорасти (процент от таланта); бонус умножает прирост. Качество, которое не тренировали ${FADE_AFTER} дня, понемногу уходит. Плата раз в неделю; нет денег — команда вернётся в подвал.</div>${rows}`;
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
        ${statsFade(f, k, c.day)}
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
    return `<div class="fnote">${FADE_RULE}</div><div class="fnote">Выбери качество и жми тренировку — она сразу идёт и занимает часть дня. Чем ближе к потолку, тем меньше даёт. ${satOf(f) < HUNGRY ? '<b>Голодный: прирост вдвое меньше — сначала поешь.</b>' : ''}</div>
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
      <div class="qbox"><div class="h2">Перед боем</div>${PREPS.map((x) => {
        const no = x.no?.(this.c, me) ?? null;
        return `<button type="button" class="gprow${this.prepPick === x.id ? ' on' : ''}" data-act="prepick" data-p="${x.id}" ${no ? 'disabled' : ''}><span>${esc(x.name)}</span><b>${esc(no ?? x.desc)}</b></button>`;
      }).join('')}</div>
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

  /** The cup of «Подкова»: sign up, the fight nights, watching and betting, our fights. */
  private cupView(): string {
    const c = this.c;
    const L = ladder(c);
    const cp = cup(c);
    cupAdvance(c);
    const f = this.me();
    const who = (id: string) => cupPerson(c, cp, id);
    const night = cupNight(c, cp);
    const tonight = cupTonight(c);
    const head = `<div class="poster"><div class="h1">🏆 Кубок «Подковы» №${cp.n}</div>
      <div class="fnote">16 бойцов, без весовых категорий. Четыре субботы подряд: 1/8 финала (1 раунд), четвертьфиналы и полуфиналы (по 3), финал (5). Призы: $${CUP_PRIZE.join(' / $')}. Взнос $${CUP_FEE}. Победа в Кубке — дорога в район.</div>
      <div class="fmeta">Ступень: <b>${STAGE_NAME[L.stage]}</b>. Дальше: ${esc(nextStageNeeds(c))}.</div></div>`;
    if (!L.open) return `${head}<div class="pill">Пока закрыто. Откроется по сюжету.</div><button type="button" data-act="to" data-s="clubs">🏴 Клубы</button>`;
    const why = cupCanJoin(c, f);
    const sign = cp.ours
      ? `<div class="pill green">В сетке: ${esc(short(who(cp.ours)))}</div>`
      : cp.rounds.length
        ? '<div class="pill">Запись закрыта. Можно смотреть бои и ставить.</div>'
        : `<button type="button" class="primary" data-act="cupjoin" ${why ? 'disabled' : ''}>Записаться · $${CUP_FEE}${why ? ` · ${why}` : ''}</button>`;
    const when = (d: number) => (d === c.day ? '<b>сегодня</b>' : `${dayName(d)} (${weekday(d)})`);
    const sched = Array.from({ length: CUP_NIGHTS }, (_, r) => `<div class="cupsched${r === night ? ' on' : ''}${cp.rounds[r]?.every((m) => m.w) ? ' done' : ''}"><span>${CUP_ROUND_NAME[r]}</span><span>${when(nightDay(cp, r))}</span></div>`).join('');
    const betOf = (r: number, i: number) => cp.bets.find((x) => x.r === r && x.i === i);
    const row = (m: CupMatch, r: number, i: number, live: boolean) => {
      const A = who(m.a), Bm = who(m.b);
      const [ka, kb] = coef(c, cp, m);
      const mine = isOurs(cp, m);
      const bt = betOf(r, i);
      const side = (x: CareerFighter, k: number) => `${this.manLine(x, m.w === x.id ? ' <em>✔</em>' : m.w ? '' : ` <i class="kf">×${k.toFixed(2)}</i>`)}`;
      let acts = '';
      if (!m.w && live) {
        if (mine) acts = `<button type="button" class="primary" data-act="cupfight">⚔ Подготовка и бой</button>`;
        else acts = `<div class="row"><button type="button" data-act="cupwatch" data-r="${r}" data-i="${i}">👁 Смотреть</button>${bt ? '' : `<button type="button" data-act="betpick" data-r="${r}" data-i="${i}">💵 Ставка</button>`}</div>`;
      } else if (!m.w && !mine && !bt) acts = `<button type="button" data-act="betpick" data-r="${r}" data-i="${i}">💵 Ставка</button>`;
      const sel = this.betSel && this.betSel.r === r && this.betSel.i === i && !m.w
        ? `<div class="betbox"><div class="row">${[[m.a, ka], [m.b, kb]].map(([id, k]) => `<button type="button" class="${this.betSel!.on === id ? 'primary' : ''}" data-act="betside" data-on="${id}">${esc(short(who(id as string)))} ×${(k as number).toFixed(2)}</button>`).join('')}</div>
          <div class="row">${[10, 25, 50, 100].map((n) => `<button type="button" data-act="betgo" data-n="${n}" ${c.money >= n ? '' : 'disabled'}>$${n}</button>`).join('')}</div></div>`
        : '';
      const how = m.how === 'odds' ? '<small class="fnote">досчитан</small>' : m.how === 'forfeit' ? '<small class="fnote">неявка</small>' : '';
      return `<div class="cupm${mine ? ' mine' : ''}">${side(A, ka)}${side(Bm, kb)}${how}
        ${bt ? `<div class="pill ${bt.paid ? (bt.on === m.w ? 'green' : 'red') : 'gold'}">Ставка $${bt.stake} на ${esc(short(who(bt.on)))} ×${bt.k.toFixed(2)}</div>` : ''}${acts}${sel}</div>`;
    };
    let nightHtml = '';
    if (cp.done) nightHtml = `<div class="pill gold">Кубок окончен. Следующий — через две недели.</div>`;
    else if (!cp.rounds.length) {
      nightHtml = `<div class="h2">Участники</div><div class="fnote">Сетку тянут в первый вечер. Сильнейших разводят по разным половинам.</div>
        ${[...cp.entrants].sort((x, y) => rating(y) - rating(x)).map((m) => this.manLine(m)).join('')}`;
    } else {
      const r = Math.min(night, cp.rounds.length - 1);
      const live = !!tonight && tonight.r === r;
      const ms = cp.rounds[r];
      const third = r === CUP_NIGHTS - 1 && cp.third ? row(cp.third, r, -1, live) : '';
      const left = live ? tonight!.ms.filter((m) => !m.w && !isOurs(cp, m)).length : 0;
      nightHtml = `<div class="h2">${CUP_ROUND_NAME[r]} · ${when(nightDay(cp, r))}</div>
        ${live ? '<div class="fnote">Вечер боёв. Смотри чужие бои, ставь у букмекера. Свой бой — когда будешь готов.</div>' : '<div class="fnote">Ставки уже принимают.</div>'}
        ${third}${ms.map((m, i) => row(m, r, i, live)).join('')}
        ${left ? `<button type="button" data-act="cupcount">⏩ Досчитать остальные бои вечера (${left})</button>` : ''}`;
      const past = cp.rounds.slice(0, r).map((R, k) => `<details><summary>${CUP_ROUND_NAME[k]}</summary>${R.map((m, i) => row(m, k, i, false)).join('')}</details>`).join('');
      nightHtml += past;
    }
    const won = cp.bets.filter((x) => x.paid && x.on === (x.i < 0 ? cp.third : cp.rounds[x.r]?.[x.i])?.w).reduce((s0, x) => s0 + Math.round(x.stake * x.k), 0);
    const spent = cp.bets.reduce((s0, x) => s0 + x.stake, 0);
    return `${head}${sign}<div class="qbox">${sched}</div>${nightHtml}
      ${cp.bets.length ? `<div class="fnote">Ставки за Кубок: поставлено $${spent}, выиграно $${won}</div>` : ''}
      <button type="button" data-act="to" data-s="clubs">🏴 Клубы</button>
      ${L.history.length ? `<div class="newsbox"><div class="h2">Прошлые Кубки</div>${L.history.slice(0, 5).map((x) => `<div>${esc(x)}</div>`).join('')}</div>` : ''}`;
  }

  /** «Дела в городе»: act 3's side lines start only from here (user: the player goes, they do not come). */
  private a3sidesView(): string {
    const list = act3Sides(this.c);
    return `<div class="h1">📌 Дела в городе</div>
      <div class="fnote">Побочные истории. Сами не приходят — только если пойдёшь.</div>
      <div class="a3sides">${list.map((x) => `<button type="button" data-act="a3" data-o="${x.id}" ${x.no ? 'disabled' : ''}>${esc(x.label)}${x.no ? `<small>${esc(x.no)}</small>` : ''}</button>`).join('') || '<div class="pill">Пока делать нечего</div>'}</div>`;
  }

  /** Act 3's tournaments (Кубок Бархата, the city championship): the nights, bets, watching, our fight. */
  private a3brView(): string {
    const c = this.c;
    const a = c.act3;
    const br = a?.[this.brWhich];
    if (!a || !br) return this.home();
    const who = (id: string) => brPerson(c, br, id);
    const tn = brTonight(c, br);
    const when = (d: number) => (d === c.day ? '<b>сегодня</b>' : `${dayName(d)} (${weekday(d)})`);
    const head = `<div class="poster"><div class="h1">🏆 ${esc(br.name)}</div>
      <div class="fnote">${this.brWhich === 'bk'
        ? `8 бойцов города. Первая суббота — четвертьфиналы, вторая — полуфиналы и финал. Призы $${BK_PRIZE.join(' / $')}. Победитель получает в чемпионате слабого соперника.`
        : `8 бойцов без весовых категорий. Три субботы: четвертьфинал (3 раунда), полуфинал (3), финал (5). Приз $${CH_PRIZE} и пояс города.`}</div></div>`;
    const sched = ROUND_NAME.map((n, r) => `<div class="cupsched${r === tn ? ' on' : ''}${br.rounds[r]?.every((m) => m.w) ? ' done' : ''}"><span>${n}</span><span>${when(br.nights[r])}</span></div>`).join('');
    const sign = br.ours ? `<div class="pill green">В сетке: ${esc(short(who(br.ours)))}</div>` : '<div class="pill">Ты не записан. Можно смотреть и ставить.</div>';
    const row = (m: CupMatch, r: number, i: number, live: boolean) => {
      const [ka, kb] = brCoef(c, br, m);
      const mine = brOurs(br, m);
      const bt = br.bets.find((x) => x.r === r && x.i === i);
      const side = (x: CareerFighter, k: number) => this.manLine(x, m.w === x.id ? ' <em>✔</em>' : m.w ? '' : ` <i class="kf">×${k.toFixed(2)}</i>`);
      let acts = '';
      if (!m.w && live) acts = mine ? '<button type="button" class="primary" data-act="brfight">⚔ Подготовка и бой</button>'
        : `<div class="row"><button type="button" data-act="brwatch" data-r="${r}" data-i="${i}">👁 Смотреть</button>${bt ? '' : `<button type="button" data-act="brbetpick" data-r="${r}" data-i="${i}">💵 Ставка</button>`}</div>`;
      else if (!m.w && !mine && !bt) acts = `<button type="button" data-act="brbetpick" data-r="${r}" data-i="${i}">💵 Ставка</button>`;
      const sel = this.betSel && this.betSel.r === r && this.betSel.i === i && !m.w
        ? `<div class="betbox"><div class="row">${[[m.a, ka], [m.b, kb]].map(([id, k]) => `<button type="button" class="${this.betSel!.on === id ? 'primary' : ''}" data-act="betside" data-on="${id}">${esc(short(who(id as string)))} ×${(k as number).toFixed(2)}</button>`).join('')}</div>
          <div class="row">${[25, 50, 100, 250].map((n) => `<button type="button" data-act="brbetgo" data-n="${n}" ${c.money >= n ? '' : 'disabled'}>$${n}</button>`).join('')}</div></div>`
        : '';
      const how = m.how === 'odds' ? '<small class="fnote">досчитан</small>' : m.how === 'forfeit' ? '<small class="fnote">неявка</small>' : '';
      return `<div class="cupm${mine ? ' mine' : ''}">${side(who(m.a), ka)}${side(who(m.b), kb)}${how}
        ${bt ? `<div class="pill ${bt.paid ? (bt.on === m.w ? 'green' : 'red') : 'gold'}">Ставка $${bt.stake} на ${esc(short(who(bt.on)))} ×${bt.k.toFixed(2)}</div>` : ''}${acts}${sel}</div>`;
    };
    const cur = br.done ? br.rounds.length - 1 : br.rounds.findIndex((R) => R.some((m) => !m.w));
    const r = cur < 0 ? br.rounds.length - 1 : cur;
    const live = tn === r;
    const left = live ? br.rounds[r].filter((m) => !m.w && !brOurs(br, m)).length : 0;
    const night = `<div class="h2">${ROUND_NAME[r]} · ${when(br.nights[r])}</div>
      <div class="fnote">${br.done ? 'Турнир окончен.' : live ? 'Вечер боёв. Смотри чужие бои, ставь. Свой бой — когда будешь готов.' : 'Ставки уже принимают.'}</div>
      ${br.rounds[r].map((m, i) => row(m, r, i, live)).join('')}
      ${left ? `<button type="button" data-act="brcount">⏩ Досчитать остальные бои вечера (${left})</button>` : ''}
      ${br.rounds.slice(0, r).map((R, k) => `<details><summary>${ROUND_NAME[k]}</summary>${R.map((m, i) => row(m, k, i, false)).join('')}</details>`).join('')}`;
    return `${head}${sign}<div class="qbox">${sched}</div>${night}`;
  }

  /** Before a fight: who he is, the odds, what to do beforehand, the plan per round. */
  private prepView(): string {
    const pr = this.prep;
    if (!pr) return this.home();
    const c = this.c;
    const me = pr.me;
    const o = pr.opp;
    const p = Math.round(100 * odds(me, o));
    const rows = STAT_KEYS.map((k) => {
      const a = me.stats[k];
      const z = o.stats[k];
      const cls = (x: number, y: number) => (x > y * 1.03 ? 'better' : x < y * 0.97 ? 'worse' : '');
      return `<div class="vrow"><b class="${cls(a, z)}">${fmtStat(k, a)}</b><span>${STAT_INFO[k].name}</span><b class="${cls(z, a)}">${fmtStat(k, z)}</b></div>`;
    }).join('');
    const opts = PREPS.map((x) => {
      const no = x.no?.(c, me) ?? null;
      return `<button type="button" class="gprow${this.prepPick === x.id ? ' on' : ''}" data-act="prepick" data-p="${x.id}" ${no ? 'disabled' : ''}><span>${esc(x.name)}</span><b>${esc(no ?? x.desc)}</b></button>`;
    }).join('');
    const k = clubOf(c, o.id);
    return `<div class="h1">${esc(pr.title)}</div>
      <div class="vs">
        <div class="vside red"><b>${esc(short(me))}</b><span>${esc(DISCIPLINE_BY_ID[me.discipline].name)} · ${me.height.toFixed(2)} м · ${me.weight} кг</span><span>рейтинг ${rating(me)}</span></div>
        <div class="vmid">VS</div>
        <div class="vside blue"><b>${esc(short(o))}</b><span>${esc(DISCIPLINE_BY_ID[o.discipline].name)} · ${o.height.toFixed(2)} м · ${o.weight} кг</span><span>рейтинг ${rating(o)}${k ? ` · ${esc(k.name)}` : ''}</span></div>
      </div>
      ${pr.note ? `<div class="fnote">${esc(pr.note)}</div>` : ''}
      <div class="fstory">${esc(o.story)}</div>
      <div class="vtable">${rows}</div>
      <div class="pill ${p >= 55 ? 'green' : p <= 45 ? 'red' : 'gold'}">Шансы примерно ${p}%</div>
      <div class="qbox"><div class="h2">Перед боем</div>${opts}</div>
      ${this.planEditor(me, pr.tier.rules.rounds)}
      <button type="button" class="primary wide" data-act="prepgo">⚔ В бой</button>`;
  }

  /** The first look at a fight night plays its opening: the cellar full, the card of the night. */
  private cupIntro(): boolean {
    const c = this.c;
    const t = ladder(c).open ? cupTonight(c) : null;
    const cp = cup(c);
    if (!t || cp.seen.includes(t.r)) return false;
    cp.seen.push(t.r);
    save(c);
    const m = t.ms[t.ms.length - 1];
    const A = cupPerson(c, cp, m.a);
    const B = cupPerson(c, cp, m.b);
    const pairs = t.ms.length;
    $('career').hidden = true;
    clearInterval(this.timer);
    this.hooks.scene({
      map: MAP_BY_ID.bar, a: { ...toParams(A, 0), name: short(A) }, b: { ...toParams(B, 1), name: short(B) }, dist: 3.2,
      lines: [
        { who: null, text: 'Суббота. Подвал «Подковы» набит битком. Дым, крики, ставки на салфетках', shot: 'wide', act: (s) => (s.scene!.dist = 2.0) },
        { who: null, text: `Кубок «Подковы» №${cp.n}. ${CUP_ROUND_NAME[t.r]}! ${pairs > 1 ? `Сегодня ${pairs} ${pairs < 5 ? 'боя' : 'боёв'}` : 'Один бой — за всё'}`, shot: 'group' },
        { who: null, text: `Главный бой вечера: ${short(A)} против ${short(B)}`, shot: 'over0' },
        { who: null, text: 'Букмекер у стойки: «Ставки до гонга, господа!»', shot: 'low' },
      ],
    }, () => {
      this.screen = 'cup';
      this.show();
    });
    return true;
  }

  /** Opens the preparation screen for a fight. */
  private toPrep(pr: NonNullable<CareerUi['prep']>): void {
    this.prep = pr;
    this.prepPick = 'none';
    this.sheet = null;
    this.go('prep');
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
      ${L.clubs.filter((k) => k.stage <= clubStage(this.c)).map(card).join('')}
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
      case 'pobj': {
        const o = b.dataset.o!;
        const go: Record<string, Screen> = { cellar: 'cup', cup: 'cup', ring: 'cal', board: 'rank', flags: 'clubs' };
        if (go[o]) {
          this.pSheet = null;
          if (go[o] === 'cup' && this.cupIntro()) return;
          return this.go(go[o]);
        }
        this.pSheet = o;
        return say(null);
      }
      case 'psheetx':
        this.pSheet = null;
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
        const tip = r.ok && this.sheet ? trainTip(c, this.sheet) : null;
        return say(r.ok ? `${short(me)}: ${r.text}${tip ? ` · ${tip}` : ''}` : r.text);
      }
      case 'helpagain':
        c.seenHelp = false;
        return this.go('home');
      case 'to':
        this.sheet = null;
        this.qs = null;
        if (b.dataset.s === 'cup' && this.cupIntro()) return;
        if (b.dataset.s === 'preview') this.prepPick = 'none';
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
        // The question must not hide under the place's bottom sheet (the tap looked dead).
        this.pSheet = null;
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
      case 'buy': {
        const r = buyFood(c, FOODS.find((x) => x.id === b.dataset.f)!, Number(b.dataset.n) || 1);
        return say(r.text);
      }
      case 'eatstock': {
        const r = eatStock(c, me, b.dataset.f as 'cheap' | 'cafe' | 'sport');
        return say(r.text);
      }
      case 'qs':
        this.pSheet = null;
        this.sheet = null;
        this.qs = this.qs === b.dataset.q ? null : (b.dataset.q as 'eat' | 'go');
        return say(null);
      case 'qsx':
        this.qs = null;
        return say(null);
      case 'eat': {
        this.pSheet = null;
        const r = eat(c, me, FOODS.find((x) => x.id === b.dataset.f)!);
        return say(r.text);
      }
      case 'work': {
        this.pSheet = null;
        const r = work(c, me, JOBS.find((x) => x.id === b.dataset.j)!);
        return say(r.text);
      }
      case 'rest':
        return say(rest(c, me).text);
      case 'beer':
        this.pSheet = null;
        return say(beer(c, me).text);
      case 'treat':
        this.pSheet = null;
        return say(treat(c, me).text);
      case 'a1film':
        this.sheet = null;
        return this.playFilm();
      case 'a2fee':
        return say(act2Fee(c));
      case 'a3': {
        const r = act3Act(c, b.dataset.o!);
        if (r.fight) return this.a1Fight(r.fight);
        if (r.screen === 'sides') return this.go('a3sides');
        if (r.screen) {
          this.brWhich = r.screen;
          return this.go('a3br');
        }
        if (r.opened) {
          this.toast = 'Открылась история — карточка на главной';
          return this.go('home');
        }
        return say(r.lines.join(' · ') || null);
      }
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
        const r = actChoose(c, b.dataset.o!);
        if (r.fight) return this.a1Fight(r.fight);
        if (r.scene) {
          this.toast = r.lines.join(' · ');
          $('career').hidden = true;
          clearInterval(this.timer);
          return this.hooks.scene(r.scene, () => this.show());
        }
        return say(r.lines.join(' · ') || null);
      }
      case 'cupjoin':
        return say(cupJoin(c, me));
      case 'club':
        this.clubId = b.dataset.k!;
        return this.go('club');
      case 'cupfight': {
        const m = cupMyMatch(c);
        if (!m) return say('Сегодня твоего боя нет');
        const cp = cup(c);
        const f = c.roster.find((x) => x.id === cp.ours)!;
        const opp = cupPerson(c, cp, m.a === f.id ? m.b : m.a);
        const k = clubOf(c, opp.id);
        const r = m === cp.third ? 2 : cp.rounds.findIndex((R) => R.includes(m));
        const name = m === cp.third ? 'бой за 3-е место' : CUP_ROUND_NAME[r].toLowerCase();
        const title = `Кубок «Подковы», ${name}: ${short(f)} против ${short(opp)}`;
        const tier = cupTier(r === CUP_NIGHTS - 1 && m === cp.third ? 2 : r);
        return this.toPrep({ me: f, opp, tier, title, note: k ? `${k.name}: «${k.motto}»` : 'Одиночка без клуба', go: (tweak) => {
          $('career').hidden = true;
          clearInterval(this.timer);
          this.hooks.fight(f, opp, tier, title, (res) => {
            fightToll(f, true, c.day);
            const lines = cupFought(c, f, m, res.won);
            this.outcome = { won: res.won, title, lines };
            this.screen = 'result';
            const champ = res.won && cp.done && cp.rounds[CUP_NIGHTS - 1][0] === m;
            if (champ) this.hooks.scene(cupChampScene(f, opp, cp.n), () => this.show());
            else this.show();
          }, tweak, { cls: classOf(f).name, scene: {
            map: MAP_BY_ID.bar, a: { ...toParams(f, 0), name: short(f) }, b: { ...toParams(opp, 1), name: short(opp) }, dist: 3,
            lines: [
              { who: null, text: `Кубок «Подковы». ${m === cp.third ? 'Бой за третье место' : CUP_ROUND_NAME[r]}`, shot: 'wide', act: (s) => (s.scene!.dist = 1.6) },
              { who: null, text: `В красном углу — ${short(f)}! В синем${k ? ` — ${k.name},` : ' —'} ${short(opp)}!`, shot: 'group' },
              { who: 1, text: r === CUP_NIGHTS - 1 ? 'Кубок мой.' : 'Быстро закончим.', shot: 'over1' },
            ],
          } });
        } });
      }
      case 'cupwatch': {
        const cp = cup(c);
        const r = Number(b.dataset.r);
        const i = Number(b.dataset.i);
        const m = i < 0 ? cp.third : cp.rounds[r]?.[i];
        if (!m || m.w) return say(null);
        const A = cupPerson(c, cp, m.a);
        const B = cupPerson(c, cp, m.b);
        const title = `Кубок «Подковы», ${CUP_ROUND_NAME[r].toLowerCase()}: ${short(A)} против ${short(B)}`;
        $('career').hidden = true;
        clearInterval(this.timer);
        this.hooks.fight(A, B, cupTier(i < 0 ? 2 : r), title, (res) => {
          const lines = cupResult(c, m, res.won ? m.a : m.b);
          this.toast = [`Победил ${short(res.won ? A : B)}${res.ko ? ' досрочно' : ''}`, ...lines].join(' · ');
          this.screen = 'cup';
          this.show();
        });
        return;
      }
      case 'brfight': {
        const fight = act3BrFight(c, this.brWhich);
        if (!fight) return say('Сегодня твоего боя нет');
        return this.a1Fight(fight);
      }
      case 'brwatch': {
        const br = c.act3?.[this.brWhich];
        const r = Number(b.dataset.r);
        const m = br?.rounds[r]?.[Number(b.dataset.i)];
        if (!br || !m || m.w) return say(null);
        const A = brPerson(c, br, m.a);
        const B = brPerson(c, br, m.b);
        $('career').hidden = true;
        clearInterval(this.timer);
        this.hooks.fight(A, B, { ...CUP_TIER, name: br.name, map: 'ring', rules: { ...CUP_TIER.rules, rounds: br.len[r] } }, `${br.name}, ${ROUND_NAME[r].toLowerCase()}: ${short(A)} против ${short(B)}`, (res) => {
          const lines = brDecide(c, br, m, res.won ? m.a : m.b, 'ring');
          save(c);
          this.toast = [`Победил ${short(res.won ? A : B)}${res.ko ? ' досрочно' : ''}`, ...lines].join(' · ');
          this.screen = 'a3br';
          this.show();
        });
        return;
      }
      case 'brcount': {
        const br = c.act3?.[this.brWhich];
        if (!br) return say(null);
        const lines = brCount(c, br);
        save(c);
        return say(lines.join(' · ') || 'Остальные бои вечера досчитаны');
      }
      case 'brbetpick': {
        const br = c.act3?.[this.brWhich];
        const r = Number(b.dataset.r);
        const i = Number(b.dataset.i);
        const m = br?.rounds[r]?.[i];
        this.betSel = m ? { r, i, on: m.a } : null;
        return say(null);
      }
      case 'brbetgo': {
        const sel = this.betSel;
        const br = c.act3?.[this.brWhich];
        this.betSel = null;
        if (!sel || !br) return say(null);
        const t = brBet(c, br, sel.r, sel.i, sel.on, Number(b.dataset.n));
        save(c);
        return say(t);
      }
      case 'cupcount':
        return say(cupCountRest(c).join(' · ') || 'Остальные бои вечера досчитаны');
      case 'betpick': {
        const cp = cup(c);
        const r = Number(b.dataset.r);
        const i = Number(b.dataset.i);
        const m = i < 0 ? cp.third : cp.rounds[r]?.[i];
        this.betSel = m ? { r, i, on: m.a } : null;
        return say(null);
      }
      case 'betside':
        if (this.betSel) this.betSel.on = b.dataset.on!;
        return say(null);
      case 'betgo': {
        const sel = this.betSel;
        this.betSel = null;
        if (!sel) return say(null);
        return say(cupBet(c, sel.r, sel.i, sel.on, Number(b.dataset.n)));
      }
      case 'prepick':
        this.prepPick = b.dataset.p as PrepId;
        return say(null);
      case 'prepgo': {
        const pr = this.prep;
        if (!pr) return say(null);
        const pp = PREP_BY_ID[this.prepPick];
        if (pp.no?.(c, pr.me)) return say(pp.no(c, pr.me));
        pp.cost?.(pr.me);
        this.prep = null;
        save(c);
        return pr.go((p) => pp.apply(p));
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
        this.pSheet = null;
        this.qs = null;
        this.sheet = null;
        this.placeId = b.dataset.p as PlaceId;
        this.visited = this.placeId;
        return this.go('place');
      case 'gymgo':
        this.qs = null;
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
        this.qs = null;
        const fz = forcedNow(c);
        if (fz) return say(`Сначала разберись: ${fz.title}`);
        const a3 = c.act3;
        const brToday = a3 && !a3.ending && ((a3.bk && brMine(c, a3.bk)) || (a3.ch && brMine(c, a3.ch)));
        if (brToday && !this.asking && b.dataset.sure !== '1')
          return ask('Сегодня твой бой турнира. Не выйдешь — техническое поражение. Закончить день?', () => {
            b.dataset.sure = '1';
            b.click();
          });
        const done = (err: string | null) => {
          if (err) return say(err);
          this.calDay = c.day;
          // Tonight's losses from going without training, with numbers (user: show how much and why).
          const night: string[] = [];
          for (let i = 1; i < c.log.length && !c.log[i].startsWith('—'); i++) if (c.log[i].startsWith('📉')) night.push(c.log[i]);
          this.toast = [`Новый день: ${dayName(c.day)}, ${weekday(c.day)}`, ...night].join(' · ');
          if (callDue(c)) return this.playCall();
          if (cupCallDue(c)) return this.playCupCall();
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
        this.bill = { tier: roundTier(TIER_BY_ID[tour.tier], current(tour).length, TIER_BY_ID[tour.tier].size / 2), opp: person(c, m.a === f.id ? m.b : m.a), tour: true };
        return this.go('preview');
      }
      case 'watch': {
        const tour = c.tour!;
        const m = current(tour)[Number(b.dataset.i)];
        const t = roundTier(TIER_BY_ID[tour.tier], current(tour).length, TIER_BY_ID[tour.tier].size / 2);
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
    }, (p) => PREP_BY_ID[this.prepPick].apply(p), { title: !!b.title, cls: classOf(me).name });
    PREP_BY_ID[this.prepPick].cost?.(me);
  }
}

/** The cup is ours: the man down, the belt on, the crowd. */
function cupChampScene(f: CareerFighter, opp: CareerFighter, n: number): SceneSpec {
  return {
    map: MAP_BY_ID.bar, a: { ...toParams(f, 0), name: short(f) }, b: { ...toParams(opp, 1), name: short(opp) }, dist: 2.2,
    start: (sim) => {
      sim.fighters[1].out = true;
      sim.knockDown(sim.fighters[1], 'нокаут', 'back', 'l');
      sim.startAction(sim.fighters[0], 'victory', { dur: 1e9 });
    },
    lines: [
      { who: null, text: `КУБОК «ПОДКОВЫ» №${n}`, shot: 'orbit0', act: (_s, fx) => fx.belt(0) },
      { who: null, text: 'Подвал ревёт. Бармен ставит бутылку на стойку: за счёт заведения', shot: 'low' },
      { who: 0, text: 'Это только начало.', shot: 'close0' },
    ],
  };
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
/** How long a quality has gone without work and what it loses (his own fighters). */
function statsFade(f: CareerFighter, k: StatKey, day?: number): string {
  {
    if (day === undefined || !f.worked) return '';
    const idle = day - (f.worked[k] ?? day);
    const lost = f.faded?.[k] ?? 0;
    const d = fadeOf(f, k);
    if (idle >= FADE_AFTER && d > 0) return `<div class="fade on">▼ уходит −${fmtDelta(k, d)} за ночь · без тренировки ${idle} дн.${lost > 0 ? ` · уже −${fmtDelta(k, lost)}` : ''}</div>`;
    if (idle >= FADE_AFTER) return `<div class="fade">без тренировки ${idle} дн. · ниже уже не упадёт${lost > 0 ? ` · ушло −${fmtDelta(k, lost)}` : ''}</div>`;
    if (idle === FADE_AFTER - 1) return `<div class="fade warn">без тренировки ${idle} дн. · с завтрашней ночи начнёт уходить</div>`;
    return '';
  }
}

function statsTable(f: CareerFighter, day?: number): string {
  return `<div class="stats">${STAT_KEYS.map((k) => `<div class="stat"><span>${STAT_INFO[k].name}</span>${bar(f, k)}<b>${fmtStat(k, f.stats[k])}</b></div>${statsFade(f, k, day)}`).join('')}</div>`;
}

/** The rule behind the fade, in one place. */
const FADE_RULE = `Форма держится ${FADE_AFTER} дня после тренировки или боя. Дальше каждую ночь качество теряет 0,3% своего диапазона, но не ниже 15% пути к таланту. Бой держит всё сразу; скакалка — скорость и выносливость, маятник — уклоны и реакцию, мешок, гантели и покрышки — силу, зеркало — технику.`;

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
