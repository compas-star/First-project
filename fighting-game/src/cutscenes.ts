import * as THREE from 'three';
import type { FighterParams } from './config';
import type { MapDef } from './maps';
import { MOVE_BY_ID } from './moves';
import type { Fighter, Sim } from './sim';

// Cutscenes on the game's own engine: the fighters in their looks on the map, no AI, a
// scripted camera, captions and lines in comic boxes. Each is a few seconds; a tap skips.

export interface CutLine {
  at: number;
  /** Who speaks (team), or null for a caption across the screen. */
  who: 0 | 1 | null;
  text: string;
  /** A speaker who is not one of the two (the man behind, a voice on the TV): his name. */
  name?: string;
}

export interface Cut {
  map: MapDef;
  a: FighterParams;
  b: FighterParams;
  dur: number;
  /** Distance they stand at when it starts. */
  dist: number;
  drunk?: [boolean, boolean];
  /** Men not shown (a scene with one man in it). */
  hide?: [boolean, boolean];
  /** A third man standing by (Кирпич behind Гусь): where he stands, given the two. */
  extra?: { p: FighterParams; place: (s: Sim) => { at: THREE.Vector3; facing: number } };
  /** Once the scene is built (knock one down, put on a belt...). */
  start?: (s: Sim) => void;
  beats: { at: number; run: (s: Sim, fx: CutFx) => void }[];
  lines: CutLine[];
  cam: (t: number, cam: THREE.PerspectiveCamera, s: Sim) => void;
}

/** What a beat can ask of the view. */
export interface CutFx {
  belt(team: number): void;
  confetti(at: THREE.Vector3): void;
}

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];
const sm = (x: number) => {
  const t = THREE.MathUtils.clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
const v = new THREE.Vector3();
const tgt = new THREE.Vector3();

function head(f: Fighter, out: THREE.Vector3): THREE.Vector3 {
  const p = f.rag.byName.head.body.translation();
  return out.set(p.x, p.y + 0.12 * f.scale, p.z);
}

/** The line between them (a -> b), the side across it, their middle. */
function frame(s: Sim) {
  const [a, b] = s.fighters;
  const mid = a.pos.clone().add(b.pos).multiplyScalar(0.5);
  const axis = b.pos.clone().sub(a.pos).setY(0);
  if (axis.lengthSq() < 1e-6) axis.set(0, 0, 1);
  axis.normalize();
  const side = new THREE.Vector3(axis.z, 0, -axis.x);
  return { a, b, mid, axis, side };
}

/** Over one man's shoulder at the other's face. */
function overShoulder(cam: THREE.PerspectiveCamera, from: Fighter, to: Fighter, sideSign: number, side: THREE.Vector3): void {
  head(from, v);
  head(to, tgt);
  const back = tgt.clone().sub(v).setY(0).normalize();
  cam.position.copy(v).addScaledVector(back, -0.55 * from.scale).addScaledVector(side, 0.35 * sideSign * from.scale);
  cam.position.y += 0.08;
  cam.lookAt(tgt.x, tgt.y - 0.05, tgt.z);
}

/** Close on one man's face from in front, a little to the side. */
function closeUp(cam: THREE.PerspectiveCamera, f: Fighter, side: THREE.Vector3, sideSign: number): void {
  head(f, tgt);
  const fwd = new THREE.Vector3(Math.sin(f.facing), 0, Math.cos(f.facing));
  cam.position.copy(tgt).addScaledVector(fwd, 1.0 * f.scale).addScaledVector(side, 0.35 * sideSign);
  cam.position.y -= 0.05;
  cam.lookAt(tgt.x, tgt.y - 0.05, tgt.z);
}

// ---------- The bar: getting a drunk fighter out ----------

export function barCut(me: FighterParams, bouncer: FighterParams, map: MapDef, barName: string): Cut {
  return {
    map, a: me, b: bouncer, dur: 8.2, dist: 2.0, drunk: [true, false],
    lines: [
      { at: 0.2, who: null, text: `Бар ${barName}, три часа ночи` },
      { at: 1.6, who: 0, text: pick(['О, менеджер! Ик… Щас я ему покажу…', 'Он первый начал! Ну… почти.', 'Ты чё приехал? Я ещё не допил!']) },
      { at: 3.8, who: 1, text: pick(['Забирай своего чемпиона. Или вынесу обоих.', 'Выход там. Сам дойдёшь или помочь?', 'Ещё раз тронешь стойку — пожалеешь.']) },
      { at: 6.0, who: 0, text: pick(['Ну давай, шкаф…', 'Иди сюда, я тебя… ик… научу.', 'Подержи моё пиво.']) },
    ],
    beats: [
      { at: 3.6, run: (s) => (s.scene!.dist = 1.15) },
      { at: 4.2, run: (s) => s.gesture(s.fighters[1], 'beckon', 1.2) },
    ],
    cam: (t, cam, s) => {
      const { a, b, mid, side } = frame(s);
      if (t < 3.6) {
        // In through the door: wide and high from the side, pushing in on the two of them.
        const k = sm(t / 3.6);
        const r = THREE.MathUtils.lerp(4.6, 3.0, k);
        cam.position.copy(mid).addScaledVector(side, r);
        cam.position.y = THREE.MathUtils.lerp(2.4, 1.6, k);
        cam.lookAt(mid.x, 1.1, mid.z);
      } else if (t < 5.8) overShoulder(cam, a, b, 1, side);
      else closeUp(cam, a, side, -1);
    },
  };
}

// ---------- Face to face before a big fight ----------

export function faceoffCut(a: FighterParams, b: FighterParams, map: MapDef, opts: { title: boolean; hate: boolean; recA: string; recB: string }): Cut {
  const lines: CutLine[] = [
    { at: 0.2, who: null, text: opts.title ? 'БОЙ ЗА ПОЯС — ЛИЦОМ К ЛИЦУ' : 'ЗАКЛЯТЫЕ ВРАГИ — ЛИЦОМ К ЛИЦУ' },
    { at: 1.4, who: null, text: `${a.name} (${opts.recA})  против  ${b.name} (${opts.recB})` },
  ];
  const sayA = opts.hate
    ? pick(['В прошлый раз тебе повезло.', 'Я тебя похороню.', 'Ты ещё помнишь, как пахнет канвас?'])
    : opts.title ? pick(['Пояс мой.', 'Я пришёл забрать то, что моё.', 'Смотри внимательно. Это последнее, что ты увидишь стоя.']) : pick(['Готовься.', 'Без обид. Работа такая.']);
  const sayB = opts.hate
    ? pick(['Повезёт тебе, если встанешь.', 'Говори-говори. Скоро будешь шептать.', 'Я ждал этого боя.'])
    : opts.title ? pick(['Приди и возьми.', 'Ты не первый, кто так говорит.', 'Пояс никуда не уходит.']) : pick(['Посмотрим.', 'Удачи. Она тебе понадобится.']);
  lines.push({ at: 4.2, who: 0, text: sayA }, { at: 6.0, who: 1, text: sayB });
  const beats: Cut['beats'] = [{ at: 1.0, run: (s) => (s.scene!.dist = 0.62) }];
  let dur = 8.4;
  if (opts.hate) {
    beats.push(
      { at: 7.3, run: (s) => s.startAction(s.fighters[1], 'attack', { move: MOVE_BY_ID.shove, zone: 'body' }) },
      { at: 7.8, run: (s) => (s.scene!.dist = 2.4) },
    );
    lines.push({ at: 7.6, who: null, text: 'Толчок! Их растаскивают!' });
    dur = 9.8;
  }
  return {
    map, a, b, dur, dist: 2.8, lines, beats,
    cam: (t, cam, s) => {
      const { a: A, b: B, mid, side } = frame(s);
      if (t < 4.0) {
        // Side on, low, closing in as they walk up to each other.
        const k = sm(t / 4);
        const r = THREE.MathUtils.lerp(4.2, 1.7, k);
        cam.position.copy(mid).addScaledVector(side, r);
        cam.position.y = THREE.MathUtils.lerp(1.3, 1.55, k) * A.scale;
        head(A, v);
        cam.lookAt(mid.x, v.y - 0.1 - 0.4 * (1 - k), mid.z);
      } else if (t < 5.9) overShoulder(cam, B, A, 1, side);
      else if (t < 7.2) overShoulder(cam, A, B, -1, side);
      else {
        cam.position.copy(mid).addScaledVector(side, 3.4);
        cam.position.y = 1.7;
        cam.lookAt(mid.x, 1.1, mid.z);
      }
    },
  };
}

// ---------- The belt ----------

export function beltCut(champ: FighterParams, loser: FighterParams, map: MapDef, cls: string): Cut {
  const beats: Cut['beats'] = [{ at: 1.6, run: (_s, fx) => fx.belt(0) }];
  for (let i = 0; i < 14; i++) {
    beats.push({
      at: 1.7 + i * 0.35,
      run: (s, fx) => {
        const p = s.fighters[0].pos;
        fx.confetti(new THREE.Vector3(p.x + (Math.random() - 0.5) * 2.5, 2.6 + Math.random(), p.z + (Math.random() - 0.5) * 2.5));
      },
    });
  }
  return {
    map, a: champ, b: loser, dur: 7.4, dist: 2.6,
    start: (s) => {
      const [w, l] = s.fighters;
      l.out = true;
      s.knockDown(l, 'нокаут', 'back', 'l');
      s.startAction(w, 'victory', { dur: 1e9 });
    },
    lines: [
      { at: 1.8, who: null, text: `НОВЫЙ ЧЕМПИОН — ${cls.toUpperCase()}` },
      { at: 3.6, who: 0, text: pick(['Я же говорил!', 'Это для всех, кто начинал в подвале!', 'Кто следующий?', 'Мама, я чемпион!']) },
    ],
    beats,
    cam: (t, cam, s) => {
      // Low, looking up at him, circling slowly and rising.
      const w = s.fighters[0];
      const ang = 0.6 + t * 0.32;
      const r = 2.4 - 0.25 * sm(t / 7);
      cam.position.set(w.pos.x + Math.sin(w.facing + ang) * r, 0.55 + 0.5 * sm(t / 7), w.pos.z + Math.cos(w.facing + ang) * r);
      head(w, tgt);
      cam.lookAt(w.pos.x, tgt.y - 0.35, w.pos.z);
    },
  };
}

// ---------- Story talk ----------

/** Two men talk (story chapters): a wide shot, then over the listener's shoulder on whoever speaks. */
export function talkCut(a: FighterParams, b: FighterParams, map: MapDef, title: string, said: { who: 0 | 1 | null; text: string }[], dist = 1.5): Cut {
  const per = 2.5;
  const lines: CutLine[] = [{ at: 0.2, who: null, text: title }];
  said.forEach((l, i) => lines.push({ at: 1.4 + i * per, who: l.who, text: l.text }));
  const dur = 1.4 + said.length * per + 0.4;
  return {
    map, a, b, dur, dist, lines, beats: [],
    cam: (t, cam, s) => {
      const { a: A, b: B, mid, side } = frame(s);
      const i = Math.floor((t - 1.4) / per);
      const who = i >= 0 && i < said.length ? said[i].who : null;
      if (who === 0) overShoulder(cam, B, A, -1, side);
      else if (who === 1) overShoulder(cam, A, B, 1, side);
      else {
        const k = sm(t / 1.4);
        cam.position.copy(mid).addScaledVector(side, THREE.MathUtils.lerp(3.6, 2.6, k));
        cam.position.y = 1.5 * A.scale;
        cam.lookAt(mid.x, 1.35 * A.scale, mid.z);
      }
    },
  };
}

// ---------- Story scenes (act 1) ----------

/** How a line of a story scene is shot. */
export type Shot =
  | 'wide' // from the side, both in frame, pushing in a little
  | 'tv' // in on the old TV's screen
  | 'over0' // over his (team 1's) shoulder on ours
  | 'over1' // over ours' shoulder on him
  | 'group' // over ours' shoulder, wider: him and the man behind him
  | 'close0' // ours alone, close
  | 'close1' // him alone, close
  | 'low' // low on the floor, looking up at both
  | 'top' // from above, coming down
  | 'orbit0'; // round ours, slowly

export interface SceneLine {
  /** 0 ours, 1 him, 2 the man behind, 'tv' the voice on the tape, null a caption. */
  who: 0 | 1 | 2 | 'tv' | null;
  text: string;
  shot: Shot;
  /** Seconds on screen (by its length if not given). */
  dur?: number;
  /** Something done as the line starts (a shove, a gesture, the TV comes on). */
  act?: (s: Sim, fx: CutFx) => void;
}

export interface SceneSpec {
  map: MapDef;
  a: FighterParams;
  b: FighterParams;
  dist: number;
  hide?: [boolean, boolean];
  extra?: { p: FighterParams; side?: number };
  /** Names for 2 and 'tv'. */
  names?: { extra?: string; tv?: string };
  start?: (s: Sim) => void;
  lines: SceneLine[];
}

const lineDur = (l: SceneLine) => l.dur ?? THREE.MathUtils.clamp(1.3 + l.text.length * 0.05, 2.2, 5.5);

/** A scripted scene of the story: each line has its speaker and its shot. */
export function storyCut(spec: SceneSpec, tv: { pos: THREE.Vector3; facing: THREE.Vector3 }): Cut {
  const lines: CutLine[] = [];
  const beats: Cut['beats'] = [];
  const spans: { t0: number; t1: number; shot: Shot }[] = [];
  let t = 0.1;
  for (const l of spec.lines) {
    const d = lineDur(l);
    const who = l.who === 0 || l.who === 1 ? l.who : l.who === null ? null : 1;
    const name = l.who === 2 ? spec.names?.extra : l.who === 'tv' ? spec.names?.tv : undefined;
    lines.push({ at: t, who: l.who === null ? null : who, text: l.text, name });
    if (l.act) beats.push({ at: t, run: l.act });
    spans.push({ t0: t, t1: t + d, shot: l.shot });
    t += d;
  }
  const behind = (s: Sim) => {
    const { a, b, side } = frame(s);
    const away = b.pos.clone().sub(a.pos).setY(0).normalize();
    const at = b.pos.clone().addScaledVector(away, 0.95 * b.scale).addScaledVector(side, (spec.extra?.side ?? 0.6) * b.scale);
    return { at, facing: Math.atan2(-away.x, -away.z) };
  };
  return {
    map: spec.map, a: spec.a, b: spec.b, dur: t + 0.3, dist: spec.dist, lines, beats, hide: spec.hide, start: spec.start,
    extra: spec.extra ? { p: spec.extra.p, place: behind } : undefined,
    cam: (time, cam, s) => {
      const sp = spans.find((x) => time >= x.t0 && time < x.t1) ?? spans[spans.length - 1];
      const k = sm((time - sp.t0) / Math.max(0.1, sp.t1 - sp.t0));
      const { a: A, b: B, mid, side } = frame(s);
      switch (sp.shot) {
        case 'tv': {
          const d = THREE.MathUtils.lerp(1.6, 0.95, k);
          cam.position.copy(tv.pos).addScaledVector(tv.facing, d);
          cam.position.y += 0.08 * (1 - k);
          cam.lookAt(tv.pos);
          break;
        }
        case 'over0':
          overShoulder(cam, B, A, 1, side);
          break;
        case 'over1':
          overShoulder(cam, A, B, -1, side);
          break;
        case 'group': {
          head(A, v);
          head(B, tgt);
          const back = tgt.clone().sub(v).setY(0).normalize();
          cam.position.copy(v).addScaledVector(back, -1.0 * A.scale).addScaledVector(side, -0.55 * A.scale);
          cam.position.y += 0.15;
          const look = tgt.clone().addScaledVector(back, 0.45).addScaledVector(side, 0.25);
          cam.lookAt(look.x, look.y - 0.1, look.z);
          break;
        }
        case 'close0':
          closeUp(cam, A, side, -1);
          break;
        case 'close1':
          closeUp(cam, B, side, 1);
          break;
        case 'low':
          cam.position.copy(mid).addScaledVector(side, 2.6);
          cam.position.y = 0.35;
          cam.lookAt(mid.x, 1.2 * A.scale, mid.z);
          break;
        case 'top': {
          const h = THREE.MathUtils.lerp(3.4, 2.2, k);
          cam.position.copy(mid).addScaledVector(side, 1.2);
          cam.position.y = h;
          cam.lookAt(mid.x, 0.3, mid.z);
          break;
        }
        case 'orbit0': {
          const ang = 0.4 + time * 0.3;
          cam.position.set(A.pos.x + Math.sin(A.facing + ang) * 2.3, 1.3, A.pos.z + Math.cos(A.facing + ang) * 2.3);
          head(A, tgt);
          cam.lookAt(A.pos.x, tgt.y - 0.3, A.pos.z);
          break;
        }
        default: {
          const hidden = spec.hide?.[1];
          const c = hidden ? A.pos.clone() : mid;
          const r = THREE.MathUtils.lerp(hidden ? 3.0 : 3.8, hidden ? 2.2 : 2.8, k);
          cam.position.copy(c).addScaledVector(side, r);
          cam.position.y = 1.55 * A.scale;
          cam.lookAt(c.x, 1.25 * A.scale, c.z);
        }
      }
    },
  };
}
