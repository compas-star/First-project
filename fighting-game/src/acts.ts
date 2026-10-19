// The main story's acts behind one face: the UI asks here and gets act 2 once it runs,
// act 1 before that.
import { save, type Career, type CareerFighter, type FightResult } from './career';
import { act1Card, act1Film, act1Seen, act1Choose, act1FightDone, act1Goal, act1Check, ensureAct1, type A1Fight, type Act1Card } from './act1';
import { act2Active, act2Card, act2Film, act2Seen, act2Choose, act2FightDone, act2Goal, act2Check } from './act2';
import { ambushFight } from './clubs';
import type { SceneSpec } from './cutscenes';

/** Opens what is due in the running act (and starts act 2 once act 1 is closed). */
export function actCheck(c: Career): string[] {
  ensureAct1(c);
  const out = act1Check(c);
  out.push(...act2Check(c));
  return out;
}

export const actCard = (c: Career): Act1Card | null => (act2Active(c) ? act2Card(c) : act1Card(c));
export const actFilm = (c: Career): SceneSpec | null => (act2Active(c) ? act2Film(c) : act1Film(c));
export const actSeen = (c: Career): void => (act2Active(c) ? act2Seen(c) : act1Seen(c));

export function actChoose(c: Career, opt: string): { lines: string[]; fight?: A1Fight; scene?: SceneSpec } {
  if (act2Active(c)) return act2Choose(c, opt);
  const r = act1Choose(c, opt);
  // Closing act 1's last card starts act 2.
  if (act2Check(c).length) save(c);
  return r;
}

export function actFightDone(c: Career, f: CareerFighter, fight: A1Fight, r: FightResult): { lines: string[]; scene?: SceneSpec } {
  return act2Active(c) ? act2FightDone(c, f, fight, r) : act1FightDone(c, f, fight, r);
}

export function actGoal(c: Career): { text: string; debt: number; left: number; fee?: number } | null {
  return act2Active(c) ? act2Goal(c) : act1Goal(c);
}

/** Something the story will not let him walk past: a fight at the door, a tournament bout. */
export function forcedNow(c: Career): { kind: 'card' | 'ambush'; title: string } | null {
  const amb = ambushFight(c);
  if (amb) return { kind: 'ambush', title: `У подъезда ждёт ${amb.opp.name}` };
  const card = actCard(c);
  if (card?.forced) return { kind: 'card', title: card.title };
  return null;
}
