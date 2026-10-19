// The district map (user: like Punch Club): a night street drawn in pixel blocks, every
// building a place to tap. What each place offers lives in careerUi (`place()`).
export type PlaceId = 'flat' | 'basement' | 'cafe' | 'bar' | 'market' | 'site' | 'hospital' | 'arena' | 'gyms' | 'alley' | 'roof';

export interface Place {
  id: PlaceId;
  name: string;
  /** One line under the name on the place's screen. */
  desc: string;
  icon: string;
  /** Where it stands on the 360 x 420 map. */
  x: number;
  y: number;
  w: number;
  h: number;
  wall: string;
  sign: string;
}

export const PLACES: Place[] = [
  { id: 'arena', name: 'Арена', desc: 'Здесь объявляют вечера боёв, турниры и бои за пояс.', icon: '🏟', x: 12, y: 18, w: 170, h: 86, wall: '#3a2f55', sign: '#ff4fa3' },
  { id: 'gyms', name: 'Спортквартал', desc: 'Чужие залы: «Перчатка», «Сиам», Атлетика, Академия, «Олимп».', icon: '🥊', x: 198, y: 30, w: 150, h: 74, wall: '#2c4150', sign: '#4fe3ff' },
  { id: 'cafe', name: 'Пельменная', desc: 'Горячая еда и спортпит из-под прилавка.', icon: '🥟', x: 12, y: 142, w: 96, h: 70, wall: '#5a3a2a', sign: '#ffb347' },
  { id: 'flat', name: 'Дом', desc: 'Съёмная квартира над подвалом. Поесть, отдохнуть, лечь спать.', icon: '🏠', x: 124, y: 122, w: 112, h: 90, wall: '#4a3f3a', sign: '#f2c14e' },
  { id: 'bar', name: '«Подкова»', desc: 'Бар, где всё решается. По пятницам и субботам нужен вышибала.', icon: '🍺', x: 252, y: 138, w: 96, h: 74, wall: '#3f2a3a', sign: '#ff5d73' },
  { id: 'market', name: 'Рынок', desc: 'Ящики, тележки, крики. Грузчикам платят каждый день.', icon: '📦', x: 12, y: 250, w: 110, h: 64, wall: '#3c4a2c', sign: '#9dff6a' },
  { id: 'hospital', name: 'Больница', desc: 'За деньги лечат вдвое быстрее.', icon: '🏥', x: 138, y: 244, w: 84, h: 70, wall: '#c9c9d6', sign: '#ff3b3b' },
  { id: 'site', name: 'Стройка', desc: 'Кран, бетон, бригадир. Работа по будням, полдня.', icon: '🏗', x: 238, y: 236, w: 110, h: 78, wall: '#5a4a2a', sign: '#ffd23f' },
  { id: 'alley', name: 'Подворотня', desc: 'Подпольные бои без судей. Скоро.', icon: '🔦', x: 12, y: 350, w: 150, h: 56, wall: '#2a2530', sign: '#b56bff' },
  { id: 'roof', name: 'Крыши', desc: 'Бои для богатых зевак. Скоро.', icon: '🌃', x: 178, y: 340, w: 170, h: 66, wall: '#252b3a', sign: '#6b8bff' },
];

export const PLACE_BY_ID = Object.fromEntries(PLACES.map((p) => [p.id, p])) as Record<PlaceId, Place>;

/** Little hash for window lights that stay the same each draw. */
const lit = (a: number, b: number) => ((a * 73856093) ^ (b * 19349663)) % 7 < 3;

const R = (x: number, y: number, w: number, h: number, fill: string, extra = '') => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}"${extra}/>`;

/** A grid of windows over part of the wall, some lit. */
function windows(p: Place, x0: number, y0: number, x1: number, y1: number, on = '#ffe39a', off = '#1b1622'): string {
  let out = '';
  for (let yy = y0; yy + 8 <= y1; yy += 14) for (let xx = x0; xx + 7 <= x1; xx += 14) out += R(xx, yy, 7, 8, lit(xx, yy) ? on : off);
  return out;
}

/** What stands behind a building (a dome, a crane, a water tower). */
function back(p: Place): string {
  const { x, y, w } = p;
  if (p.id === 'arena') return `<path d="M${x} ${y + 6}Q${x + w / 2} ${y - 16} ${x + w} ${y + 6}Z" fill="#2e2546" stroke="#1b1622" stroke-width="3"/>`;
  if (p.id === 'site') return `<path d="M${x + w - 16} ${y - 14}V${y + 10}M${x + w - 16} ${y - 12}H${x + w - 76}M${x + w - 62} ${y - 12}V${y - 2}" stroke="#ffd23f" stroke-width="3" fill="none"/>${R(x + w - 66, y - 2, 9, 6, '#8a6a2a')}`;
  if (p.id === 'roof') return `${R(x + 22, y - 22, 16, 22, '#3a4258')}${R(x + 18, y - 26, 24, 6, '#4a5470')}<path d="M${x + w - 30} ${y}V${y - 26}M${x + w - 36} ${y - 20}H${x + w - 24}" stroke="#8a93a8" stroke-width="2"/>${R(x + w - 31, y - 28, 3, 3, '#ff3b3b')}`;
  return '';
}

/** The face of each building: what makes it that place. */
function face(p: Place): string {
  const { x, y, w, h } = p;
  const bottom = y + h;
  switch (p.id) {
    case 'arena': {
      let s = '';
      for (let i = 0; i < 5; i++) s += R(x + 14 + i * 34, y + 28, 6, h - 30, i % 2 ? '#ff4fa3' : '#4fe3ff', ' opacity="0.55"');
      for (let i = 0; i < 18; i++) s += R(x + 8 + i * 9, y + 24, 3, 3, i % 2 ? '#ffe39a' : '#ff4fa3');
      return s + R(x + w / 2 - 18, bottom - 24, 36, 24, '#1b1622') + R(x + w / 2 - 1, bottom - 24, 2, 24, '#3a2f55') + R(x + w / 2 - 22, bottom - 28, 44, 4, '#ff4fa3');
    }
    case 'gyms':
      return windows(p, x + 10, y + 26, x + w - 40, bottom - 4) + R(x + w - 34, y + 34, 26, 4, '#c9c9d6') + R(x + w - 36, y + 29, 5, 14, '#555') + R(x + w - 13, y + 29, 5, 14, '#555') + R(x + w / 2 - 7, bottom - 18, 14, 18, '#1b1622');
    case 'cafe': {
      let s = '';
      for (let i = 0; i < (w - 8) / 8; i++) s += R(x + 4 + i * 8, y + 24, 8, 8, i % 2 ? '#fff3e0' : '#ff8a3d');
      return s + R(x + 8, y + 36, w - 40, h - 44, '#ffcf7a', ' opacity="0.85"') + R(x + 10, y + 40, 10, 6, '#c96a2a') + R(x + w - 26, bottom - 22, 16, 22, '#1b1622');
    }
    case 'flat':
      return windows(p, x + 10, y + 26, x + w - 6, bottom - 22) + R(x + w / 2 + 10, bottom - 18, 14, 18, '#1b1622')
        + R(x + 6, bottom - 18, 40, 16, '#120e16', ' stroke="#f2c14e" stroke-width="2"') + `<text x="${x + 26}" y="${bottom - 7}" class="mtiny" text-anchor="middle">ПОДВАЛ</text>`;
    case 'bar':
      return windows(p, x + 8, y + 28, x + w - 8, bottom - 26, '#ff5d73', '#2a1620') + R(x + w / 2 - 7, bottom - 18, 14, 18, '#1b1622')
        + R(x + w / 2 + 12, bottom - 24, 10, 12, '#ffd23f') + R(x + w / 2 + 22, bottom - 21, 3, 6, '#ffd23f') + R(x + w / 2 + 12, bottom - 26, 10, 3, '#fff');
    case 'market': {
      let s = '';
      for (let k = 0; k < 3; k++) {
        const sx = x + 6 + k * 34;
        for (let i = 0; i < 4; i++) s += R(sx + i * 7, y + 30, 7, 7, (i + k) % 2 ? '#fff' : ['#ff5d73', '#9dff6a', '#4fe3ff'][k]);
        s += R(sx + 2, y + 37, 2, 20, '#555') + R(sx + 24, y + 37, 2, 20, '#555') + R(sx + 5, bottom - 14, 8, 8, '#a8743a') + R(sx + 14, bottom - 12, 8, 6, '#c9933f');
      }
      return s;
    }
    case 'hospital':
      return windows(p, x + 8, y + 40, x + w - 8, bottom - 20, '#bfe8ff', '#8a8a9a') + R(x + w / 2 - 9, y + 26, 18, 5, '#ff3b3b') + R(x + w / 2 - 2.5, y + 24, 5, 10, '#ff3b3b') + R(x + w / 2 - 8, bottom - 18, 16, 18, '#4fa3ff', ' opacity="0.7"');
    case 'site': {
      let s = '';
      for (let yy = y + 26; yy < bottom; yy += 12) s += R(x + 4, yy, w - 8, 2, '#8a6a2a');
      for (let xx = x + 8; xx < x + w; xx += 20) s += R(xx, y + 24, 2, h - 24, '#8a6a2a');
      return s + R(x + 10, bottom - 12, 12, 9, '#c9c9b0') + R(x + 24, bottom - 12, 12, 9, '#b0b09a') + R(x + 17, bottom - 20, 12, 8, '#c9c9b0');
    }
    case 'alley': {
      let s = '';
      for (let yy = y + 26; yy < bottom; yy += 7) for (let xx = x + ((yy / 7) % 2 ? 2 : 8); xx < x + w - 10; xx += 14) s += R(xx, yy, 12, 5, '#3a3040');
      return s + R(x + w - 36, bottom - 18, 14, 18, '#5a5a5a') + R(x + w - 34, bottom - 26, 10, 8, '#ff8a3d') + R(x + w - 32, bottom - 32, 6, 6, '#ffd23f')
        + `<circle cx="${x + w - 29}" cy="${bottom - 22}" r="16" fill="#ff8a3d" opacity="0.15"/>` + `<path d="M${x + 14} ${y + 40}l10 -6l8 10l12 -8" stroke="#b56bff" stroke-width="3" fill="none"/>`;
    }
    case 'roof':
      return windows(p, x + 8, y + 26, x + w - 8, bottom - 4, '#9ab0ff', '#1b1622');
  }
  return '';
}

function building(p: Place, badge: string, here: boolean): string {
  return `<g class="place${here ? ' here' : ''}" data-act="place" data-p="${p.id}">
    ${R(p.x + 4, p.y + 4, p.w, p.h, '#000', ' opacity="0.45"')}
    ${back(p)}
    <rect class="wall" x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.wall}" stroke="#1b1622" stroke-width="3"/>
    ${face(p)}
    <rect x="${p.x + 6}" y="${p.y + 6}" width="${p.w - 12}" height="15" fill="#120e16" stroke="${p.sign}" stroke-width="2"/>
    <text x="${p.x + p.w / 2}" y="${p.y + 17}" class="msign" fill="${p.sign}" text-anchor="middle">${p.name.toUpperCase()}</text>
    ${badge ? `<g class="badge"><rect x="${p.x + p.w - 30}" y="${p.y + p.h - 20}" width="30" height="16" fill="#f2c14e" stroke="#1b1622" stroke-width="2"/><text x="${p.x + p.w - 15}" y="${p.y + p.h - 8}" class="mbadge" text-anchor="middle">${badge}</text></g>` : ''}
    <rect class="hit" x="${p.x - 4}" y="${p.y - 8}" width="${p.w + 8}" height="${p.h + 12}" fill="transparent"/>
  </g>`;
}

/** The whole district: streets, lamps, buildings; badges say what is on where. */
export function mapSvg(badges: Partial<Record<PlaceId, string>>, here: PlaceId | null, night: boolean): string {
  const lamps = [[186, 134], [116, 240], [244, 240], [170, 336]]
    .map(([x, y]) => `<rect x="${x}" y="${y - 22}" width="3" height="22" fill="#555"/><rect x="${x - 3}" y="${y - 26}" width="9" height="5" fill="#ffe39a"/><circle cx="${x + 1}" cy="${y - 18}" r="16" fill="#ffe39a" opacity="0.07"/>`)
    .join('');
  // Two streets across and one down the middle, with dashed lines.
  const roads = `<rect x="0" y="112" width="360" height="22" fill="#26222c"/><rect x="0" y="218" width="360" height="22" fill="#26222c"/><rect x="0" y="322" width="360" height="14" fill="#26222c"/>
    <path d="M0 123H360M0 229H360" stroke="#7a6f55" stroke-width="2" stroke-dasharray="10 8"/>`;
  return `<svg class="citymap" viewBox="0 0 360 420" shape-rendering="crispEdges" role="img" aria-label="Карта района">
    <rect width="360" height="420" fill="${night ? '#0d0b14' : '#1c1830'}"/>
    ${[...Array(24)].map((_, i) => `<rect x="${(i * 53) % 360}" y="${(i * 29) % 16}" width="2" height="2" fill="#fff" opacity="0.5"/>`).join('')}
    ${roads}
    ${PLACES.map((p) => building(p, badges[p.id] ?? '', here === p.id)).join('')}
    ${lamps}
  </svg>`;
}
