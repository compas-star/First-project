// Combinations the player builds in the lab: blows in order, each to a zone. Fighters
// throw them in fights when the first blow fits the moment (see think() in ai.ts), and
// carry on through the list while the other man is still standing in front of them.
import { MOVE_BY_ID, type Zone } from './moves';

export interface ComboStep {
  move: string;
  zone: Zone;
}

export interface Combo {
  id: string;
  steps: ComboStep[];
  /** Fighters use it in their fights. */
  ai: boolean;
}

const KEY = 'arena-combos-v1';
let list: Combo[] = [];

export function loadCombos(): Combo[] {
  try {
    list = (JSON.parse(localStorage.getItem(KEY) ?? '[]') as Combo[]).filter((c) => c.steps.every((s) => MOVE_BY_ID[s.move]));
  } catch {
    list = [];
  }
  return list;
}

export const combos = (): Combo[] => list;

function store(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* storage unavailable */
  }
}

export function addCombo(steps: ComboStep[]): Combo {
  const c: Combo = { id: `c${Date.now().toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`, steps: steps.map((s) => ({ ...s })), ai: true };
  list.push(c);
  store();
  return c;
}

export function removeCombo(id: string): void {
  list = list.filter((c) => c.id !== id);
  store();
}

export function toggleAi(id: string): void {
  const c = list.find((x) => x.id === id);
  if (c) c.ai = !c.ai;
  store();
}

export const comboName = (steps: ComboStep[]) => steps.map((s) => MOVE_BY_ID[s.move].name).join(' → ');

const PREFIX = 'КОМБО1:';

export function exportCombos(): string {
  const json = JSON.stringify({ v: 1, combos: list.map((c) => c.steps) });
  return PREFIX + btoa(unescape(encodeURIComponent(json)));
}

export function importCombos(code: string): number | string {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(code.trim().replace(/^КОМБО1:/, ''))))) as { combos: ComboStep[][] };
    let n = 0;
    for (const steps of data.combos ?? []) {
      if (!steps.length || !steps.every((s) => MOVE_BY_ID[s.move])) continue;
      addCombo(steps);
      n++;
    }
    return n;
  } catch {
    return 'Код не читается';
  }
}
