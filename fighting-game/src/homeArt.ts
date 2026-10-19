// The career's home screen (user: by default you see your home in pixel art — the fighter,
// the TV with Михалыч, the fridge; scroll down to the basement and tap an apparatus to
// train). One tall SVG on a 4-unit pixel grid; every thing is a `data-act="obj"` group.
export type HomeObj =
  | 'bed' | 'fridge' | 'tv' | 'door' | 'calendar' | 'phone' | 'me'
  | 'bag' | 'rope' | 'dumbbell' | 'mirror' | 'ball' | 'tires' | 'belt';

const R = (x: number, y: number, w: number, h: number, c: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"${extra}/>`;
const label = (x: number, y: number, t: string) => `<text x="${x}" y="${y}" class="hlabel" text-anchor="middle">${t}</text>`;
const badge = (x: number, y: number, t: string) =>
  `<g class="hbadge">${R(x - 5, y - 6, 10, 9, '#f2c14e', ' stroke="#1b1622" stroke-width="1"')}<text x="${x}" y="${y + 1}" class="hbtext" text-anchor="middle">${t}</text></g>`;
const obj = (id: HomeObj, inner: string, hit: [number, number, number, number]) =>
  `<g class="hobj" data-act="obj" data-o="${id}">${inner}${R(hit[0], hit[1], hit[2], hit[3], 'transparent', ' class="hit"')}</g>`;

export interface HomeState {
  /** Badges on things: '!' a new scene on the TV, a count of calls... */
  badges: Partial<Record<HomeObj, string>>;
  /** The TV plays (a scene waits). */
  tvOn: boolean;
  /** The basement is lost: a padlock on its door, training in the yard. */
  lost: boolean;
  /** Fighter's colours. */
  skin: string;
  shorts: string;
  hair: string;
  /** Parts of the day spent (0..3): the window darkens toward evening. */
  part: number;
  /** He is asleep in bed (the day is over). */
  sleepy: boolean;
  /** Thrown out of the district (act 2 lost): home is a sewer tunnel. */
  sewer?: boolean;
}

/** A standing fighter, 12 x 30, feet at (x, y). */
function guy(x: number, y: number, s: HomeState): string {
  const t = y - 30;
  return [
    R(x + 3, t, 6, 2, s.hair), R(x + 2, t + 2, 8, 6, s.skin), R(x + 2, t + 2, 8, 2, s.hair),
    R(x + 4, t + 5, 1, 1, '#1a1a1a'), R(x + 7, t + 5, 1, 1, '#1a1a1a'),
    R(x + 1, t + 8, 10, 9, s.skin), R(x + 3, t + 10, 6, 1, 'rgba(0,0,0,0.18)'), R(x + 5, t + 12, 2, 4, 'rgba(0,0,0,0.12)'),
    R(x - 1, t + 9, 2, 8, s.skin), R(x + 11, t + 9, 2, 8, s.skin), R(x - 1, t + 16, 2, 2, '#c43a3a'), R(x + 11, t + 16, 2, 2, '#c43a3a'),
    R(x + 1, t + 17, 10, 5, s.shorts), R(x + 2, t + 22, 3, 7, s.skin), R(x + 7, t + 22, 3, 7, s.skin),
    R(x + 1, t + 29, 4, 1, '#222'), R(x + 7, t + 29, 4, 1, '#222'),
  ].join('');
}

function room(s: HomeState): string {
  const sky = ['#2a3a6a', '#3a4a7a', '#3a2a5a', '#120e22'][Math.min(3, s.part)];
  let o = '';
  // Wall with stripes, a skirting board, floor boards.
  o += R(0, 0, 160, 92, '#3b2f4a');
  for (let x = 4; x < 160; x += 12) o += R(x, 0, 4, 92, '#43354f');
  o += R(0, 88, 160, 4, '#2a2030');
  o += R(0, 92, 160, 28, '#5a3a28');
  for (let y = 96; y < 120; y += 6) o += R(0, y, 160, 1, '#4a2e1e');
  for (let x = 10; x < 160; x += 26) o += R(x, 92, 1, 28, '#4a2e1e');
  // The window: the district at night.
  o += R(62, 12, 36, 28, '#1b1622') + R(64, 14, 32, 24, sky);
  o += R(66, 26, 6, 12, '#14101c') + R(73, 22, 8, 16, '#181424') + R(82, 28, 6, 10, '#14101c') + R(89, 24, 6, 14, '#181424');
  for (const [x, y] of [[67, 28], [75, 25], [77, 30], [84, 31], [91, 27], [91, 32]]) o += R(x, y, 2, 2, '#ffe39a');
  if (s.part >= 2) o += R(88, 16, 4, 4, '#f4f0d0');
  o += R(79, 14, 2, 24, '#1b1622') + R(64, 25, 32, 1, '#1b1622');
  // Rug.
  o += R(46, 104, 60, 10, '#7a2a3a') + R(48, 106, 56, 6, '#8e3446');
  // Bed.
  o += obj('bed', R(4, 76, 40, 4, '#6a4a30') + R(4, 80, 40, 14, '#4a3020') + R(6, 70, 36, 10, '#c8ccd4') + R(6, 70, 10, 8, '#e8ecf0') + R(16, 72, 26, 8, '#3a5a9a') + R(4, 64, 3, 30, '#4a3020') + R(41, 70, 3, 24, '#4a3020')
    + (s.sleepy ? `<text x="30" y="66" class="hz">z Z</text>` : '') + label(24, 100, 'кровать'), [2, 60, 44, 44]);
  // The phone on the wall over the bed.
  o += obj('phone', R(22, 34, 10, 14, '#a8262a') + R(23, 35, 8, 4, '#6a1418') + R(24, 41, 6, 5, '#e8d8c0') + R(31, 46, 1, 14, '#1b1622') + label(27, 31, 'телефон') + (s.badges.phone ? badge(33, 36, s.badges.phone) : ''), [18, 24, 18, 26]);
  // The calendar.
  o += obj('calendar', R(104, 14, 20, 22, '#e8e4d8') + R(104, 14, 20, 5, '#c43a3a') + [0, 1, 2, 3].map((r) => [0, 1, 2, 3].map((k) => R(106 + k * 4, 21 + r * 3, 2, 2, r * 4 + k === 5 ? '#c43a3a' : '#8a8478')).join('')).join('') + label(114, 42, 'календарь') + (s.badges.calendar ? badge(124, 16, s.badges.calendar) : ''), [100, 10, 28, 34]);
  // The TV on its stand, with the video player.
  const screen = s.tvOn
    ? R(55, 62, 22, 14, '#2a3a5a') + R(62, 64, 8, 9, '#c99a7a') + R(61, 63, 10, 3, '#b0b4b8') + R(63, 67, 2, 1, '#1a1a1a') + R(67, 67, 2, 1, '#1a1a1a') + R(64, 70, 4, 1, '#9a9a9a') + R(55, 72, 22, 1, 'rgba(255,255,255,0.25)')
    : R(55, 62, 22, 14, '#1a2024') + R(57, 63, 4, 2, 'rgba(255,255,255,0.12)');
  o += obj('tv', R(50, 84, 32, 10, '#4a3020') + R(52, 86, 28, 4, '#1a1a1c') + R(74, 87, 3, 1, '#40ff60') + R(52, 58, 28, 26, '#2a2620') + screen + R(64, 52, 1, 6, '#888') + R(70, 50, 1, 8, '#888')
    + label(66, 100, 'телевизор') + (s.badges.tv ? badge(80, 58, s.badges.tv) : ''), [48, 46, 36, 50]);
  // The fridge.
  o += obj('fridge', R(130, 44, 24, 50, '#d8dce0') + R(130, 62, 24, 1, '#9aa0a8') + R(150, 50, 2, 8, '#8a9098') + R(150, 66, 2, 12, '#8a9098') + R(134, 48, 4, 4, '#ff5d73') + R(140, 70, 5, 3, '#4fe3ff') + R(130, 92, 24, 2, '#7a8088')
    + label(142, 100, 'холодильник'), [128, 40, 28, 64]);
  // The door to the street.
  o += obj('door', R(104, 50, 20, 42, '#6a4630') + R(106, 52, 16, 18, '#5a3a24') + R(106, 72, 16, 18, '#5a3a24') + R(120, 70, 2, 3, '#f2c14e') + R(108, 46, 12, 3, '#ffe39a')
    + label(114, 112, 'на улицу →'), [100, 44, 28, 60]);
  // Him.
  if (!s.sleepy) o += obj('me', guy(86, 112, s) + label(92, 118, 'боец'), [82, 78, 20, 42]);
  return o;
}

/** The sewer (act 2 lost): the same things, made of what was found down there. */
function sewerRoom(s: HomeState): string {
  let o = '';
  // Tunnel: dark bricks in an arch, a channel of water in the middle of the floor.
  o += R(0, 0, 160, 120, '#1e2a26');
  for (let y = 0; y < 92; y += 6) {
    o += R(0, y, 160, 1, '#16201c');
    for (let x = (y / 6) % 2 ? 0 : 6; x < 160; x += 12) o += R(x, y, 1, 6, '#16201c');
  }
  for (let x = 0; x < 160; x += 4) {
    const d = Math.abs(x - 78) / 80;
    o += R(x, 0, 4, Math.round(22 * d * d), '#0c1210');
  }
  o += R(0, 88, 160, 32, '#2e3430');
  o += R(0, 98, 160, 10, '#1d4a44') + R(0, 98, 160, 1, '#3a8a7a');
  for (const x of [12, 44, 90, 132]) o += R(x, 102, 8, 1, '#4fa898');
  o += R(0, 20, 160, 4, '#4a5048') + R(0, 25, 160, 2, '#3a403a') + R(70, 27, 3, 6, '#4a5048') + R(71, 33, 1, 4, '#3a8a7a');
  // A lamp on a wire.
  o += R(98, 0, 1, 10, '#111') + R(96, 10, 5, 4, '#ffe39a') + `<circle cx="98" cy="13" r="18" fill="#ffe39a" opacity="0.1"/>`;
  // Mattress = bed.
  o += obj('bed', R(4, 82, 40, 6, '#8a7a5a') + R(4, 86, 40, 2, '#5a4a3a') + R(6, 80, 10, 4, '#a89a80') + R(16, 81, 26, 5, '#4a5a3a')
    + (s.sleepy ? `<text x="30" y="76" class="hz">z Z</text>` : '') + label(24, 96, 'матрас'), [2, 70, 44, 30]);
  // The phone on a pipe, the calendar scratched on the bricks.
  o += obj('phone', R(22, 38, 10, 14, '#a8262a') + R(23, 39, 8, 4, '#6a1418') + R(24, 45, 6, 5, '#e8d8c0') + label(27, 35, 'телефон') + (s.badges.phone ? badge(33, 40, s.badges.phone) : ''), [18, 28, 18, 26]);
  o += obj('calendar', [0, 1, 2, 3, 4].map((k) => R(108 + k * 3, 34, 1, 8, '#c8d0c0')).join('') + R(106, 37, 16, 1, '#c8d0c0') + [0, 1, 2].map((k) => R(108 + k * 3, 46, 1, 8, '#c8d0c0')).join('') + label(116, 62, 'календарь') + (s.badges.calendar ? badge(126, 34, s.badges.calendar) : ''), [102, 28, 28, 38]);
  // The old TV on a crate (the tapes came along).
  const screen = s.tvOn
    ? R(55, 62, 22, 14, '#2a3a5a') + R(62, 64, 8, 9, '#c99a7a') + R(61, 63, 10, 3, '#b0b4b8') + R(63, 67, 2, 1, '#1a1a1a') + R(67, 67, 2, 1, '#1a1a1a') + R(55, 72, 22, 1, 'rgba(255,255,255,0.25)')
    : R(55, 62, 22, 14, '#1a2024') + R(57, 63, 4, 2, 'rgba(255,255,255,0.12)');
  o += obj('tv', R(50, 84, 32, 10, '#7a5a30') + R(50, 88, 32, 1, '#5a4020') + R(52, 58, 28, 26, '#2a2620') + screen + R(64, 52, 1, 6, '#888')
    + label(66, 116, 'телевизор') + (s.badges.tv ? badge(80, 58, s.badges.tv) : ''), [48, 46, 36, 50]);
  // A cooler box = the fridge.
  o += obj('fridge', R(132, 72, 22, 16, '#3a7ac8') + R(132, 72, 22, 4, '#e8ecf0') + R(140, 70, 6, 2, '#e8ecf0') + label(143, 96, 'ящик с едой'), [128, 64, 30, 36]);
  // The ladder up = the door.
  o += obj('door', R(108, 66, 2, 32, '#8a8a80') + R(120, 66, 2, 32, '#8a8a80') + [0, 1, 2, 3, 4].map((k) => R(110, 70 + k * 6, 10, 1, '#8a8a80')).join('') + R(106, 62, 18, 4, '#3a403a')
    + label(115, 116, '↑ наверх'), [102, 58, 26, 46]);
  if (!s.sleepy) o += obj('me', guy(86, 112, s) + label(92, 118, 'боец'), [82, 78, 20, 42]);
  return o;
}

function basement(s: HomeState): string {
  const y0 = 124;
  let o = '';
  // Stairs down on the left, then the bricks, the concrete floor.
  o += R(0, 120, 160, 4, '#1b1622');
  o += R(0, y0, 160, 88, '#5a3a30');
  for (let y = y0; y < y0 + 88; y += 6) {
    o += R(0, y, 160, 1, '#3e2620');
    for (let x = (y / 6) % 2 ? 0 : 6; x < 160; x += 12) o += R(x, y, 1, 6, '#3e2620');
  }
  o += R(0, y0 + 88, 160, 22, '#4a4a46');
  for (const [x, y, w] of [[0, 130, 22], [0, 140, 16], [0, 150, 10]]) o += R(x, y, w, 4, '#6a5040') + R(x, y + 4, w, 6, '#2a2020');
  // Pipes and the bulb.
  o += R(0, y0 + 2, 160, 3, '#6a6a6a') + R(0, y0 + 7, 160, 2, '#555');
  o += R(79, y0 + 9, 1, 8, '#111') + R(77, y0 + 17, 5, 5, '#ffe39a') + `<circle cx="79" cy="${y0 + 20}" r="16" fill="#ffe39a" opacity="0.12"/>`;
  o += `<text x="80" y="${y0 + 32}" class="hsign" text-anchor="middle">${s.sewer ? 'КАНАЛИЗАЦИЯ' : s.lost ? 'ПОДВАЛ ЗАКРЫТ — ДВОР' : 'ПОДВАЛ'}</text>`;
  // Михалыч's belt on the wall.
  o += obj('belt', R(54, y0 + 38, 30, 5, '#2a1a10') + R(64, y0 + 36, 10, 9, '#c9a640') + R(66, y0 + 38, 6, 5, '#e8c860') + label(69, y0 + 52, 'пояс'), [52, y0 + 34, 34, 20]);
  // The bag on its chain.
  o += obj('bag', R(30, y0 + 9, 1, 18, '#999') + R(25, y0 + 27, 12, 34, '#6a2a1a') + R(25, y0 + 31, 12, 3, '#9a9a8a') + R(25, y0 + 55, 12, 3, '#4a1a10') + label(31, y0 + 70, 'мешок'), [20, y0 + 8, 22, 66]);
  // The skipping rope on a hook.
  o += obj('rope', R(46, y0 + 40, 2, 3, '#888') + `<path d="M47 ${y0 + 43}q-6 14 0 22q6 -8 0 -22" stroke="#4fe3ff" stroke-width="2" fill="none"/>` + R(44, y0 + 63, 3, 5, '#c43a3a') + R(48, y0 + 63, 3, 5, '#c43a3a') + label(48, y0 + 76, 'скакалка'), [40, y0 + 38, 16, 42]);
  // Dumbbells on the floor.
  o += obj('dumbbell', R(56, y0 + 82, 4, 8, '#333') + R(60, y0 + 85, 10, 2, '#888') + R(70, y0 + 82, 4, 8, '#333') + R(78, y0 + 84, 3, 6, '#333') + R(81, y0 + 86, 8, 2, '#888') + R(89, y0 + 84, 3, 6, '#333') + label(74, y0 + 98, 'гантели'), [52, y0 + 78, 44, 24]);
  // The mirror.
  o += obj('mirror', R(98, y0 + 40, 22, 44, '#6a4630') + R(100, y0 + 42, 18, 40, '#9ac8e0') + R(102, y0 + 44, 3, 14, '#d8f0ff') + R(107, y0 + 46, 2, 8, '#d8f0ff') + label(109, y0 + 92, 'зеркало'), [96, y0 + 36, 26, 60]);
  // The ball on a rope (pendulum).
  o += obj('ball', R(136, y0 + 9, 1, 40, '#ccc') + R(131, y0 + 49, 11, 10, '#e8e0d0') + R(133, y0 + 51, 3, 2, '#fff') + R(131, y0 + 57, 11, 2, '#c8c0b0') + label(137, y0 + 68, 'маятник'), [126, y0 + 8, 22, 64]);
  // Old tyres.
  o += obj('tires', R(124, y0 + 80, 30, 6, '#1a1a1a') + R(124, y0 + 74, 30, 6, '#222') + R(128, y0 + 76, 22, 2, '#3a3a3a') + R(128, y0 + 82, 22, 2, '#333') + label(139, y0 + 98, 'покрышки'), [120, y0 + 70, 38, 32]);
  if (s.sewer) o += R(0, y0, 160, 110, 'rgba(20,60,50,0.35)');
  else if (s.lost) o += R(0, y0, 160, 110, 'rgba(10,10,20,0.35)');
  return o;
}

export function homeSvg(s: HomeState): string {
  return `<svg class="homeart" viewBox="0 0 160 234" shape-rendering="crispEdges" role="img" aria-label="Дом и подвал">${s.sewer ? sewerRoom(s) : room(s)}${basement(s)}</svg>`;
}

/** What each apparatus trains: a quality (StatKey) or hands/legs. */
export const APPARATUS: Partial<Record<HomeObj, { name: string; what: { k: string; craft?: 'hands' | 'legs'; name: string }[] }>> = {
  bag: { name: 'Мешок на цепи', what: [{ k: 'strength', craft: 'hands', name: 'Руки' }, { k: 'strength', name: 'Сила удара' }] },
  rope: { name: 'Скакалка', what: [{ k: 'bodySpeed', name: 'Скорость' }, { k: 'cardio', name: 'Выносливость' }] },
  dumbbell: { name: 'Гантели', what: [{ k: 'strength', name: 'Сила удара' }] },
  mirror: { name: 'Тень у зеркала', what: [{ k: 'skill', name: 'Техника' }] },
  ball: { name: 'Маятник', what: [{ k: 'evasion', name: 'Уклоны' }, { k: 'mindSpeed', name: 'Реакция' }] },
  tires: { name: 'Покрышки', what: [{ k: 'strength', craft: 'legs', name: 'Ноги' }] },
};
