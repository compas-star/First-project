// The player's changes to the strikes, made in the lab. Stored as differences from the
// built-in moves, applied to the shared move objects at start-up (so the fights, the AI
// and the career all use them), and passed around as a text code.
import { MOVES, MOVE_BY_ID, type Keyframe, type Move, type PathShape } from './moves';
import { SHAPES, KICKS } from './strikes';

/** What can be changed in a move. */
export type MoveEdit = Partial<Pick<Move, 'duration' | 'active' | 'reach' | 'lunge' | 'power' | 'path' | 'keys' | 'shape'>>;

const KEY = 'arena-moves-v1';
const FIELDS = ['duration', 'active', 'reach', 'lunge', 'power', 'path', 'keys', 'shape'] as const;

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x)) as T;

/** The moves as they ship, to reset to and to diff against. */
const BASE: Record<string, Move> = Object.fromEntries(MOVES.map((m) => [m.id, clone(m)]));

let edits: Record<string, MoveEdit> = {};

export function loadEdits(): void {
  try {
    edits = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, MoveEdit>;
  } catch {
    edits = {};
  }
  for (const id of Object.keys(edits)) apply(id);
}

function store(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(edits));
  } catch {
    /* storage unavailable */
  }
}

function apply(id: string): void {
  const m = MOVE_BY_ID[id];
  const b = BASE[id];
  if (!m || !b) return;
  const e = edits[id] ?? {};
  for (const k of FIELDS) {
    const v = e[k] ?? b[k];
    (m as unknown as Record<string, unknown>)[k] = v === undefined ? undefined : clone(v);
  }
}

/** The path shape the move uses now (its own, or the path's standard one). */
export function shapeOf(m: Move): PathShape | null {
  if (!m.path) return null;
  if (m.shape) return m.shape;
  const kick = /Foot$/.test(m.limb);
  return (kick ? KICKS : SHAPES)[m.path as never] ?? null;
}

/** Record that a move was changed in place: keep only what differs from the built-in one. */
export function commit(m: Move): void {
  const b = BASE[m.id];
  const e: MoveEdit = {};
  for (const k of FIELDS) {
    const now = (m as unknown as Record<string, unknown>)[k];
    if (JSON.stringify(now) !== JSON.stringify((b as unknown as Record<string, unknown>)[k])) (e as Record<string, unknown>)[k] = clone(now);
  }
  if (Object.keys(e).length) edits[m.id] = e;
  else delete edits[m.id];
  store();
}

/** Before changing a move's keyframes or shape, give it its own copies (the built-ins share objects). */
export function own(m: Move): void {
  m.keys = m.keys.map((k: Keyframe) => ({ t: k.t, pose: { ...k.pose } }));
  const sh = shapeOf(m);
  if (sh && !m.shape) m.shape = clone(sh);
}

export function isEdited(id: string): boolean {
  return !!edits[id];
}

export function resetMove(id: string): void {
  delete edits[id];
  apply(id);
  store();
}

const PREFIX = 'УДАР1:';

/** A text code with the given moves' changes (all changed moves if none given). */
export function exportCode(ids?: string[]): string {
  const pick = Object.fromEntries(Object.entries(edits).filter(([id]) => !ids || ids.includes(id)));
  const json = JSON.stringify({ v: 1, moves: pick });
  return PREFIX + btoa(unescape(encodeURIComponent(json)));
}

/** Takes a code from exportCode; returns how many moves it changed, or an error text. */
export function importCode(code: string): number | string {
  try {
    const raw = code.trim().replace(/^УДАР1:/, '');
    const data = JSON.parse(decodeURIComponent(escape(atob(raw)))) as { v: number; moves: Record<string, MoveEdit> };
    let n = 0;
    for (const [id, e] of Object.entries(data.moves ?? {})) {
      if (!BASE[id]) continue;
      edits[id] = e;
      apply(id);
      n++;
    }
    store();
    return n;
  } catch {
    return 'Код не читается';
  }
}

export function baseOf(id: string): Move {
  return BASE[id];
}
