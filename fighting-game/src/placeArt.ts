// Pixel interiors of the city's places (user: every building should look like the home: pixel
// art with little people, tap a thing to do something). One SVG per place, 160 x 120 on the same
// grid as the home; things are `data-act="pobj"` groups that open a bottom sheet.
import type { PlaceId } from './cityMap';

const R = (x: number, y: number, w: number, h: number, c: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"${extra}/>`;
const label = (x: number, y: number, t: string) => `<text x="${x}" y="${y}" class="hlabel" text-anchor="middle">${t}</text>`;
const sign = (x: number, y: number, t: string) => `<text x="${x}" y="${y}" class="hsign" text-anchor="middle">${t}</text>`;
const obj = (id: string, inner: string, hit: [number, number, number, number]) =>
  `<g class="hobj" data-act="pobj" data-o="${id}">${inner}${R(hit[0], hit[1], hit[2], hit[3], 'transparent', ' class="hit"')}</g>`;

/** A little person, 10 x 24, feet at (x, y). */
function man(x: number, y: number, top: string, legs: string, skin = '#d8a880', hair = '#2a1a10', extra = ''): string {
  const t = y - 24;
  return [
    R(x + 2, t, 6, 2, hair), R(x + 2, t + 2, 6, 5, skin), R(x + 3, t + 4, 1, 1, '#1a1a1a'), R(x + 6, t + 4, 1, 1, '#1a1a1a'),
    R(x + 1, t + 7, 8, 8, top), R(x - 1, t + 8, 2, 6, top), R(x + 9, t + 8, 2, 6, top), R(x - 1, t + 14, 2, 2, skin), R(x + 9, t + 14, 2, 2, skin),
    R(x + 1, t + 15, 8, 2, legs), R(x + 2, t + 17, 2, 6, legs), R(x + 6, t + 17, 2, 6, legs), R(x + 1, t + 23, 3, 1, '#151515'), R(x + 6, t + 23, 3, 1, '#151515'),
    extra,
  ].join('');
}

function walls(base: string, stripe: string, floor: string, line: string): string {
  let o = R(0, 0, 160, 86, base);
  for (let x = 4; x < 160; x += 12) o += R(x, 0, 3, 86, stripe);
  o += R(0, 86, 160, 34, floor);
  for (let y = 92; y < 120; y += 7) o += R(0, y, 160, 1, line);
  return o;
}

function cafe(): string {
  let o = walls('#5a3a2a', '#634030', '#3a2a22', '#2e211b');
  o += sign(80, 12, 'ПЕЛЬМЕННАЯ');
  o += R(10, 20, 30, 18, '#1b1622') + R(12, 22, 26, 14, '#ffe39a') + label(25, 31, 'МЕНЮ');
  // Counter with the cook.
  o += obj('counter', man(64, 70, '#f0f0f0', '#3a3a4a', '#e0b090', '#f0f0f0', R(66, 44, 6, 3, '#f0f0f0')) + R(40, 62, 70, 24, '#8a5a3a') + R(40, 62, 70, 3, '#b07a4a')
    + R(50, 56, 8, 6, '#e8e8e8') + R(52, 54, 4, 2, '#f8f8f8') + R(92, 57, 10, 5, '#c0c0c0') + label(75, 96, 'обед'), [38, 40, 74, 50]);
  // Fridge with sports food.
  o += obj('sport', R(124, 30, 26, 56, '#d8dce0') + R(126, 34, 22, 20, '#9ad0f0') + R(128, 38, 6, 8, '#ff5d73') + R(136, 40, 6, 6, '#4fe3ff') + R(128, 60, 18, 2, '#9aa0a8')
    + label(137, 96, 'спортпит'), [122, 26, 30, 72]);
  // A table with a man eating.
  o += R(8, 94, 30, 4, '#6a4a30') + R(12, 98, 3, 12, '#4a3020') + R(31, 98, 3, 12, '#4a3020') + man(16, 110, '#3a5ac8', '#2a2a3a') + R(19, 90, 6, 3, '#e8e8e8');
  return o;
}

function market(): string {
  let o = R(0, 0, 160, 60, '#2a3a6a') + R(0, 60, 160, 60, '#4a4a40');
  for (let x = 0; x < 160; x += 10) o += R(x, 60, 1, 60, '#3e3e36');
  // Stalls with awnings.
  const stall = (x: number, col: string) => R(x, 30, 44, 6, col) + R(x, 36, 44, 2, '#1b1622') + R(x + 2, 38, 2, 24, '#6a4a30') + R(x + 40, 38, 2, 24, '#6a4a30') + R(x, 54, 44, 8, '#8a6a40');
  o += obj('stall', stall(6, '#c43a3a') + R(10, 50, 6, 4, '#9dff6a') + R(18, 50, 6, 4, '#ff8a3a') + R(26, 50, 6, 4, '#c43a3a') + R(34, 50, 6, 4, '#f2c14e')
    + man(22, 54, '#8a3a6a', '#3a2a4a', '#e0b090', '#e8e8e8') + label(28, 72, 'лапша, крупы'), [4, 26, 48, 50]);
  o += stall(58, '#3a8ac4') + R(64, 50, 30, 4, '#c8b080');
  // Crates and the loader's job.
  o += obj('crates', R(110, 74, 18, 14, '#a07a40') + R(112, 76, 14, 2, '#7a5a30') + R(128, 80, 18, 14, '#a07a40') + R(118, 62, 18, 12, '#a07a40') + R(130, 66, 2, 6, '#7a5a30')
    + man(140, 112, '#3a5a2a', '#2a2a2a') + R(96, 96, 22, 10, '#5a5a5a') + R(98, 106, 4, 4, '#222') + R(112, 106, 4, 4, '#222')
    + label(124, 118, 'грузить ящики'), [92, 58, 66, 62]);
  o += man(70, 104, '#2a2a2a', '#2a2a3a', '#d8a880', '#111') + man(80, 106, '#6a2a2a', '#3a3a3a');
  return o;
}

function site(): string {
  let o = R(0, 0, 160, 70, '#3a4a7a') + R(0, 70, 160, 50, '#6a5a3a');
  // Crane.
  o += R(120, 6, 4, 64, '#ffd23f') + R(70, 6, 76, 3, '#ffd23f') + R(90, 9, 1, 26, '#222') + R(86, 35, 10, 6, '#8a8a8a');
  for (let y = 10; y < 70; y += 6) o += R(120, y, 4, 1, '#c4a020');
  // Scaffold with a building.
  o += R(8, 20, 60, 50, '#8a7a6a');
  for (let y = 26; y < 70; y += 10) o += R(8, y, 60, 2, '#5a4a3a');
  for (let x = 8; x < 70; x += 14) o += R(x, 20, 2, 50, '#5a4a3a');
  // Cement bags and the foreman's job.
  o += obj('bags', R(20, 84, 30, 8, '#c8c0b0') + R(24, 78, 22, 6, '#c8c0b0') + R(30, 72, 12, 6, '#c8c0b0') + man(60, 108, '#ff8a3a', '#3a3a4a', '#d8a880', '#ffd23f')
    + man(84, 106, '#3a5ac8', '#2a2a3a', '#e0b090', '#ffd23f') + R(92, 86, 16, 3, '#ffffff') + label(50, 118, 'таскать цемент'), [14, 66, 100, 54]);
  o += sign(100, 66, 'СТРОЙКА');
  return o;
}

function bar(cupOn: boolean): string {
  let o = walls('#3f2a3a', '#47303f', '#2a1e24', '#22181d');
  o += R(8, 10, 22, 30, '#ff4fa3') + label(19, 28, 'ROCK') + sign(80, 12, '«ПОДКОВА»');
  // Bar counter with the barman.
  o += obj('beer', R(96, 18, 56, 3, '#5a3a24') + [100, 108, 116, 124, 132, 140].map((x, i) => R(x, 10, 4, 8, ['#3a8a3a', '#c48a2a', '#8a2a2a'][i % 3])).join('')
    + man(118, 70, '#1a1a1a', '#2a2a2a', '#e0b090', '#3a2a10', R(117, 54, 12, 2, '#f0f0f0')) + R(92, 62, 64, 24, '#6a4a30') + R(92, 62, 64, 3, '#8a6a40')
    + R(104, 56, 4, 6, '#f2c14e') + R(140, 56, 4, 6, '#f2c14e') + label(124, 96, 'пиво'), [90, 8, 68, 92]);
  // The door with the bouncer.
  o += obj('door', R(40, 30, 22, 56, '#2a1a10') + R(42, 32, 18, 52, '#4a2a1a') + R(56, 58, 2, 3, '#f2c14e') + man(64, 86, '#111111', '#1a1a2a', '#c99a7a', '#111')
    + label(56, 96, 'вышибала'), [38, 26, 40, 72]);
  // Stairs down to the cellar: the cup.
  o += obj('cellar', R(8, 86, 26, 30, '#140e12') + [0, 1, 2, 3].map((k) => R(10 + k * 2, 90 + k * 6, 22 - k * 4, 2, '#3a2a30')).join('') + R(6, 50, 30, 30, '#e8e4d8')
    + R(6, 50, 30, 6, cupOn ? '#ff4fa3' : '#8a8478') + sign(21, 62, 'КУБОК') + label(21, 74, cupOn ? 'сегодня!' : 'подвал') + label(21, 118, 'в подвал'), [4, 46, 34, 74]);
  return o;
}

function hospital(): string {
  let o = walls('#c9c9d6', '#bdbdcc', '#8a9aa8', '#7a8a98');
  o += R(70, 6, 20, 20, '#ffffff') + R(77, 9, 6, 14, '#ff3b3b') + R(73, 13, 14, 6, '#ff3b3b');
  o += obj('desk', R(52, 64, 56, 22, '#e8e8f0') + R(52, 64, 56, 3, '#a8b8c8') + man(76, 64, '#f0f0f8', '#f0f0f8', '#e0b090', '#6a4a2a') + R(58, 58, 10, 6, '#3a5ac8')
    + label(80, 96, 'лечиться'), [50, 36, 60, 64]);
  // Beds.
  o += R(6, 70, 34, 6, '#ffffff') + R(6, 76, 34, 4, '#7a8a98') + R(8, 66, 8, 4, '#f0f0f0') + R(120, 70, 34, 6, '#ffffff') + R(120, 76, 34, 4, '#7a8a98') + R(144, 66, 8, 4, '#f0f0f0');
  o += R(18, 66, 18, 5, '#3a5ac8');
  return o;
}

function arena(cupOn: boolean): string {
  let o = R(0, 0, 160, 120, '#1a1428');
  for (let x = 0; x < 160; x += 16) o += R(x, 0, 8, 50, '#221a33');
  // The cup poster.
  o += obj('cup', R(8, 8, 40, 46, '#e8e4d8') + R(8, 8, 40, 10, cupOn ? '#ff4fa3' : '#c43a3a') + sign(28, 16, 'КУБОК') + label(28, 28, '«ПОДКОВЫ»') + label(28, 38, '16 бойцов')
    + label(28, 48, '$1000') + label(28, 64, 'кубок'), [6, 6, 44, 62]);
  // The ring: fight nights on the calendar.
  o += obj('ring', R(56, 64, 70, 30, '#3a5ac8') + R(56, 62, 70, 2, '#ff4fa3') + R(56, 56, 70, 2, '#ff4fa3') + R(56, 50, 2, 44, '#ccc') + R(124, 50, 2, 44, '#ccc')
    + man(76, 80, '#c43a3a', '#c43a3a') + man(100, 80, '#3a5ac8', '#3a5ac8') + label(91, 104, 'вечера боёв'), [52, 44, 78, 64]);
  // Rankings board and club flags.
  o += obj('board', R(132, 8, 24, 36, '#0e0e14') + [0, 1, 2, 3, 4].map((k) => R(135, 12 + k * 6, 18, 2, k ? '#4fe3ff' : '#f2c14e')).join('') + label(144, 52, 'рейтинг'), [130, 6, 28, 50]);
  o += obj('flags', R(60, 8, 2, 30, '#888') + R(62, 8, 14, 10, '#1a1a1e') + R(64, 10, 10, 6, '#ff5d3a') + R(90, 8, 2, 30, '#888') + R(92, 8, 14, 10, '#2a4a8a') + R(94, 10, 10, 6, '#f2c14e')
    + label(84, 46, 'клубы'), [58, 6, 52, 44]);
  // The crowd.
  for (let x = 4; x < 160; x += 9) o += R(x, 106, 7, 14, ['#3a2a4a', '#2a3a4a', '#4a2a2a'][(x / 9) % 3 | 0]) + R(x + 1, 100, 5, 6, '#c99a7a');
  return o;
}

function gyms(): string {
  let o = R(0, 0, 160, 120, '#2c4150');
  const door = (id: string, x: number, name: string, col: string) => obj(id, R(x, 20, 34, 66, '#1b2a34') + R(x + 2, 22, 30, 10, col) + R(x + 10, 50, 14, 36, '#3a2a20') + R(x + 21, 68, 2, 3, '#f2c14e')
    + R(x + 4, 36, 10, 10, '#9ad0f0') + R(x + 20, 36, 10, 10, '#9ad0f0') + label(x + 17, 98, name), [x - 1, 18, 36, 84]);
  o += door('g_boxing', 4, 'Перчатка', '#c43a3a') + door('g_thai', 42, 'Сиам', '#3a5ac8') + door('g_power', 80, 'Атлетика', '#ff8a3a') + door('g_mind', 118, 'Академия', '#9a4aff');
  o += sign(80, 12, 'СПОРТКВАРТАЛ');
  o += obj('g_elite', R(40, 104, 80, 14, '#f2c14e') + label(80, 114, '«ОЛИМП» — для известных'), [38, 102, 84, 18]);
  return o;
}

function soon(name: string): string {
  return R(0, 0, 160, 120, '#14101c') + sign(80, 60, name) + label(80, 74, 'скоро');
}

export function placeSvg(id: PlaceId, s: { cupOn: boolean }): string {
  const inner = id === 'cafe' ? cafe() : id === 'market' ? market() : id === 'site' ? site() : id === 'bar' ? bar(s.cupOn) : id === 'hospital' ? hospital()
    : id === 'arena' ? arena(s.cupOn) : id === 'gyms' ? gyms() : id === 'alley' ? soon('ПОДВОРОТНЯ') : id === 'roof' ? soon('КРЫШИ') : '';
  return inner ? `<svg class="homeart" viewBox="0 0 160 120" shape-rendering="crispEdges" role="img">${inner}</svg>` : '';
}
