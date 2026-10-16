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

// ---------- Classics ----------
// The standard combinations of each style, built in. Boxing numbers: 1 jab, 2 cross,
// 3 lead hook, 4 rear hook, 5 lead uppercut, 6 rear uppercut. A fighter uses one only
// if it belongs to his style and every blow in it is in his arsenal.

export interface Classic {
  id: string;
  name: string;
  styles: string[];
  steps: ComboStep[];
}

const H = (move: string): ComboStep => ({ move, zone: 'head' });
const B = (move: string): ComboStep => ({ move, zone: 'body' });
const L = (move: string): ComboStep => ({ move, zone: 'leg' });
const BOX = ['boxing', 'mma', 'kickboxing', 'muaythai', 'street', 'wrestling', 'bjj'];
const KICK = ['kickboxing', 'muaythai', 'mma'];

export const CLASSICS: Classic[] = [
  // Boxing basics.
  { id: 'b12', name: '1-2: двойка', styles: BOX, steps: [H('jab'), H('cross')] },
  { id: 'b112', name: '1-1-2: двойной джеб и кросс', styles: BOX, steps: [H('jab'), H('jab'), H('cross')] },
  { id: 'b123', name: '1-2-3: тройка', styles: BOX, steps: [H('jab'), H('cross'), H('hook')] },
  { id: 'b1232', name: '1-2-3-2', styles: ['boxing', 'mma', 'kickboxing'], steps: [H('jab'), H('cross'), H('hook'), H('cross')] },
  { id: 'b32', name: '3-2: хук и кросс', styles: ['boxing', 'mma', 'kickboxing'], steps: [H('hook'), H('cross')] },
  { id: 'b232', name: '2-3-2', styles: ['boxing', 'kickboxing'], steps: [H('cross'), H('hook'), H('cross')] },
  { id: 'b1632', name: '1-6-3-2: с апперкотом', styles: ['boxing', 'mma'], steps: [H('jab'), H('uppercut'), H('hook'), H('cross')] },
  { id: 'b1252', name: '1-2-5-2', styles: ['boxing'], steps: [H('jab'), H('cross'), H('luppercut'), H('cross')] },
  { id: 'b523', name: '5-2-3: апперкот, кросс, хук', styles: ['boxing', 'mma'], steps: [H('luppercut'), H('cross'), H('hook')] },
  { id: 'b64', name: '6-3: апперкот и хук', styles: ['boxing', 'mma', 'street'], steps: [H('uppercut'), H('hook')] },
  { id: 'b1b3', name: 'Джеб в корпус, хук в голову', styles: ['boxing', 'mma', 'kickboxing'], steps: [B('jab'), H('hook')] },
  { id: 'b33', name: 'Двойной хук: печень и голова', styles: ['boxing', 'mma'], steps: [B('hook'), H('hook')] },
  { id: 'bsh3', name: 'Лопата и хук', styles: ['boxing'], steps: [B('shovel'), H('hook')] },
  { id: 'b2b3', name: 'Кросс в корпус, хук в голову', styles: ['boxing', 'mma'], steps: [B('cross'), H('hook')] },
  { id: 'b1o', name: 'Джеб и оверхенд', styles: ['boxing', 'mma', 'street'], steps: [H('jab'), H('overhand')] },
  { id: 'b12ch', name: '1-2 и хук на отходе', styles: ['boxing'], steps: [H('jab'), H('cross'), H('checkhook')] },
  // Kicking styles.
  { id: 'k12l', name: '1-2 и лоу-кик', styles: KICK, steps: [H('jab'), H('cross'), L('lowkick')] },
  { id: 'k123l', name: 'Голландская: 1-2-3 и лоу', styles: ['kickboxing', 'muaythai'], steps: [H('jab'), H('cross'), H('hook'), L('lowkick')] },
  { id: 'k1bk', name: 'Джеб и в корпус ногой', styles: KICK, steps: [H('jab'), B('bodykick')] },
  { id: 'k12hk', name: '1-2 и хай-кик', styles: ['kickboxing', 'muaythai', 'mma', 'karate'], steps: [H('jab'), H('cross'), H('headkick')] },
  { id: 'k12bk', name: '1-2 и ногой в корпус', styles: KICK, steps: [H('jab'), H('cross'), B('bodykick')] },
  { id: 'kl2', name: 'Лоу-кик и кросс', styles: KICK, steps: [L('lowkick'), H('cross')] },
  { id: 'k1c', name: 'Джеб и по икре', styles: ['mma', 'kickboxing'], steps: [H('jab'), L('calfkick')] },
  { id: 'kc2', name: 'По икре и кросс', styles: ['mma', 'kickboxing'], steps: [L('calfkick'), H('cross')] },
  { id: 'k1lk', name: 'Джеб и передней ногой', styles: ['kickboxing', 'karate', 'mma'], steps: [H('jab'), B('leadkick')] },
  { id: 'k3l', name: 'Хук и лоу-кик', styles: ['muaythai', 'kickboxing'], steps: [H('hook'), L('lowkick')] },
  // Muay Thai.
  { id: 't2tp', name: 'Тип и кросс', styles: ['muaythai', 'kickboxing'], steps: [B('teep'), H('cross')] },
  { id: 't1kn', name: 'Джеб и колено', styles: ['muaythai', 'mma'], steps: [H('jab'), B('rknee')] },
  { id: 't3kn', name: 'Хук и колено', styles: ['muaythai', 'mma'], steps: [H('hook'), B('rknee')] },
  { id: 'tel', name: 'Два локтя', styles: ['muaythai'], steps: [H('lelbow'), H('relbow')] },
  { id: 't12el', name: '1-2 и локоть', styles: ['muaythai', 'mma'], steps: [H('jab'), H('cross'), H('relbow')] },
  { id: 'tkn2', name: 'Колено, колено', styles: ['muaythai'], steps: [B('lknee'), B('rknee')] },
  // Karate.
  { id: 'kz12', name: 'Кизами и гьяку (джеб, кросс)', styles: ['karate'], steps: [H('jab'), H('cross')] },
  { id: 'kfk2', name: 'Прямой ногой и кросс', styles: ['karate', 'kickboxing'], steps: [B('frontkick'), H('cross')] },
  { id: 'klk2', name: 'Передней ногой и кросс', styles: ['karate', 'kickboxing'], steps: [B('leadkick'), H('cross')] },
  { id: 'k1sk', name: 'Джеб и с разворота ногой', styles: ['karate', 'kickboxing'], steps: [H('jab'), B('spinkick')] },
  // MMA.
  { id: 'm12o', name: 'Двойка и оверхенд', styles: ['mma'], steps: [H('jab'), H('cross'), H('overhand')] },
  { id: 'msp2', name: 'Супермен и хук', styles: ['mma'], steps: [H('superman'), H('hook')] },
  // Street.
  { id: 's2h', name: 'Размашистые с двух рук', styles: ['street'], steps: [H('haymaker'), H('lhaymaker')] },
  { id: 'ssh', name: 'Толкнуть и размашистый', styles: ['street'], steps: [B('shove'), H('haymaker')] },
  { id: 's1h', name: 'Тычок и размашистый', styles: ['street'], steps: [H('jab'), H('haymaker')] },
  { id: 'shkn', name: 'Хук и колено', styles: ['street'], steps: [H('rhook'), B('rknee')] },
].filter((c) => c.steps.every((s) => MOVE_BY_ID[s.move] && MOVE_BY_ID[s.move].zones.includes(s.zone)));

const OFF_KEY = 'arena-classics-off-v1';
let off = new Set<string>();
try {
  off = new Set(JSON.parse(localStorage.getItem(OFF_KEY) ?? '[]') as string[]);
} catch {
  /* storage unavailable */
}

export const classicOn = (id: string) => !off.has(id);

export function toggleClassic(id: string): void {
  if (off.has(id)) off.delete(id);
  else off.add(id);
  try {
    localStorage.setItem(OFF_KEY, JSON.stringify([...off]));
  } catch {
    /* storage unavailable */
  }
}
