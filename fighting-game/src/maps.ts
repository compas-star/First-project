// Fighting places. Each map has its own floor and boundaries in physics (ring
// ropes, a cage fence, alley walls, a rooftop parapet) and its own look in the
// view. `room()` tells the AI how far a point is from the nearest boundary, so
// fighters stay off the ropes unless they are driven there.

export type MapId = 'ring' | 'cage' | 'alley' | 'dojo' | 'roof' | 'void' | 'bar' | 'basement';

export interface MapDef {
  id: MapId;
  name: string;
  desc: string;
  /** Fighting floor: a circle of radius `size`, a square of half-size `size`, or an octagon. */
  shape: 'circle' | 'square' | 'octagon';
  size: number;
  /** Boundary on the fighting floor's edge. */
  edge: 'none' | 'ropes' | 'fence' | 'walls' | 'parapet' | 'alley';
  /** Height of the fighting floor (a ring stands on a platform). */
  floorY: number;
  /** Ground around a raised floor, or nothing (fall = out). */
  outside: 'ground' | 'none';
  crates: boolean;
  /** Distance between the fighters at the start. */
  start: number;
}

export const MAPS: MapDef[] = [
  { id: 'ring', name: 'Ринг', desc: 'Боксёрский ринг на помосте, канаты пружинят, зрители вокруг.', shape: 'square', size: 3.4, edge: 'ropes', floorY: 0, outside: 'ground', crates: false, start: 2.6 },
  { id: 'cage', name: 'Октагон', desc: 'Восьмиугольная клетка с сеткой, как в ММА.', shape: 'octagon', size: 4.6, edge: 'fence', floorY: 0, outside: 'ground', crates: false, start: 2.8 },
  { id: 'alley', name: 'Подворотня', desc: 'Узкий переулок между стенами, баки и ящики, мокрый асфальт, неон.', shape: 'square', size: 7, edge: 'alley', floorY: 0, outside: 'none', crates: true, start: 2.6 },
  { id: 'dojo', name: 'Додзё', desc: 'Деревянный пол, татами, бумажные стены и фонари.', shape: 'square', size: 4.5, edge: 'walls', floorY: 0, outside: 'none', crates: false, start: 2.6 },
  { id: 'roof', name: 'Крыша', desc: 'Ночная крыша над городом. Бортик низкий, упасть можно.', shape: 'square', size: 6, edge: 'parapet', floorY: 0, outside: 'none', crates: true, start: 2.8 },
  { id: 'bar', name: 'Бар', desc: 'Тесный бар: стойка, табуреты, ящики с бутылками, неон. Драка без правил.', shape: 'square', size: 3.8, edge: 'walls', floorY: 0, outside: 'none', crates: true, start: 2.2 },
  { id: 'basement', name: 'Подвал', desc: 'Подвал под прачечной: трубы, мешок на цепи, старый телевизор и пояс на стене.', shape: 'square', size: 3.4, edge: 'walls', floorY: 0, outside: 'none', crates: false, start: 2.4 },
  { id: 'void', name: 'Пустота', desc: 'Огромная площадка с ящиками, место для полубогов.', shape: 'circle', size: 13.5, edge: 'none', floorY: 0, outside: 'none', crates: true, start: 0 },
];

export const MAP_BY_ID = Object.fromEntries(MAPS.map((m) => [m.id, m])) as Record<MapId, MapDef>;

/** Alley walls run along x at ±ALLEY_HALF; its ends are open. */
export const ALLEY_HALF = 2.8;

/**
 * Distance from (x, z) to the nearest boundary the fighters should keep off,
 * and the direction toward open floor (written into `inward`).
 */
export function room(map: MapDef, x: number, z: number, inward: { x: number; z: number }): number {
  if (map.edge === 'alley') {
    // Walls on the sides, a long way to the open ends.
    const side = ALLEY_HALF - Math.abs(x);
    const end = map.size - Math.abs(z);
    if (side < end) {
      inward.x = -Math.sign(x) || 1;
      inward.z = 0;
      return side;
    }
    inward.x = 0;
    inward.z = -Math.sign(z) || 1;
    return end;
  }
  if (map.shape === 'square') {
    const dx = map.size - Math.abs(x);
    const dz = map.size - Math.abs(z);
    if (dx < dz) {
      inward.x = -Math.sign(x) || 1;
      inward.z = 0;
      return dx;
    }
    inward.x = 0;
    inward.z = -Math.sign(z) || 1;
    return dz;
  }
  const r = Math.hypot(x, z) || 1e-6;
  inward.x = -x / r;
  inward.z = -z / r;
  const R = map.shape === 'octagon' ? map.size * Math.cos(Math.PI / 8) : map.size;
  return R - r;
}
