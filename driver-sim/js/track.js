// The route: Historic Route 66 from Flagstaff to Kingman, Arizona (compressed).
import { SEG, SEG_PER_MILE, DRAW_DIST, RUMBLE, ZONE_LEN } from './config.js';
import { mulberry, hex, lerpC, easeIn, easeInOut, parseTime } from './gfx.js';
import { BUILDINGS, ADS_COUNT, welcomeSprite } from './sprites.js';

export const PRE_MILES = 0.6;
export const END_MILE = 163;
export const segOfMile = m => Math.round((m + PRE_MILES) * SEG_PER_MILE);
export const mileOfSeg = i => i / SEG_PER_MILE - PRE_MILES;

export const BIOMES = {
  forest: {
    ground: ['#3d6a2c', '#376227'], veg: [['pine', 0.5], ['pine2', 0.25], ['pine3', 0.17], ['rock', 0.08]],
    density: 0.6, curves: [0, 1, 1, 2, 2, 3], hill: 2200, len: [90, 260], traffic: 1,
  },
  woodland: {
    ground: ['#6c7a3c', '#657236'], veg: [['juniper', 0.4], ['juniper2', 0.2], ['pine3', 0.12], ['rock', 0.13], ['grass', 0.15]],
    density: 0.4, curves: [0, 1, 2, 2], hill: 1500, len: [150, 350], traffic: 0.9,
  },
  plains: {
    ground: ['#b6a45a', '#ae9c53'], veg: [['grass', 0.55], ['sage', 0.3], ['juniper2', 0.08], ['rock', 0.07]],
    density: 0.3, curves: [0, 0, 1, 1, 2], hill: 900, len: [200, 500], traffic: 0.8,
  },
  mesa: {
    ground: ['#a5643e', '#9c5c38'], veg: [['juniper', 0.3], ['redrock', 0.3], ['boulder', 0.15], ['grass', 0.25]],
    density: 0.35, curves: [0, 2, 3, 3, 4], hill: 2600, len: [100, 260], traffic: 0.7,
  },
  desert: {
    ground: ['#d0b089', '#c8a880'], veg: [['creosote', 0.42], ['joshua', 0.22], ['barrel', 0.12], ['rock', 0.12], ['saguaro', 0.06], ['boulder', 0.06]],
    density: 0.3, curves: [0, 0, 0, 1, 2], hill: 700, len: [300, 800], traffic: 0.7,
  },
};
export const BIOME_NAMES = Object.keys(BIOMES);
for (const b of Object.values(BIOMES)) b.groundRGB = b.ground.map(hex);

const BANDS = [[-99, 'forest'], [38, 'woodland'], [56, 'plains'], [96, 'mesa'], [118, 'desert']];
const BLEND = 1.5;
export function biomeAt(m) {
  let k = 0;
  while (k + 1 < BANDS.length && m >= BANDS[k + 1][0]) k++;
  const cur = BANDS[k][1];
  if (k + 1 < BANDS.length && m > BANDS[k + 1][0] - BLEND)
    return { a: cur, b: BANDS[k + 1][1], t: (m - (BANDS[k + 1][0] - BLEND)) / (2 * BLEND) };
  if (k > 0 && m < BANDS[k][0] + BLEND)
    return { a: BANDS[k - 1][1], b: cur, t: (m - (BANDS[k][0] - BLEND)) / (2 * BLEND) };
  return { a: cur, b: cur, t: 0 };
}

export const TOWNS = [
  { name: 'FLAGSTAFF', mile: 0, from: -0.6, to: 1.2, stop: { dep: '15:30', on: 14, first: true } },
  { name: 'WILLIAMS', mile: 32, from: -0.7, to: 0.9, stop: { arr: '16:15', off: 3, on: 5 }, gas: 0.45 },
  { name: 'ASH FORK', mile: 51, from: -0.5, to: 0.5, stop: { arr: '16:45', off: 2, on: 1 } },
  { name: 'SELIGMAN', mile: 74, from: -0.7, to: 0.8, stop: { arr: '17:25', off: 4, on: 6 }, gas: 0.45 },
  { name: 'PEACH SPRINGS', mile: 111, from: -0.5, to: 0.6, stop: { arr: '18:20', off: 5, on: 2 }, gas: 0.4 },
  { name: 'TRUXTON', mile: 128, from: -0.3, to: 0.35, gas: 0 },
  { name: 'KINGMAN', mile: 161, from: -1.0, to: 2.0, stop: { arr: '19:35', off: 'all', final: true } },
];

export function buildTrack(seed = 66) {
  const r = mulberry(seed);
  const total = segOfMile(END_MILE) + DRAW_DIST + 20;
  const segs = [];
  const ranges = TOWNS.map(t => [segOfMile(t.mile + t.from), segOfMile(t.mile + t.to), t]);
  const add = (curve, y1, y2) => {
    const i = segs.length;
    segs.push({ i, curve, p1: { wy: y1, wz: i * SEG }, p2: { wy: y2, wz: (i + 1) * SEG }, sprites: [], cars: [] });
  };
  let y = 0;
  while (segs.length < total) {
    const i = segs.length;
    const town = ranges.find(([a, b]) => i >= a && i < b);
    if (town) { for (let k = i; k < town[1]; k++) add(0, y, y); continue; }
    let next = total;
    for (const [a] of ranges) if (a > i && a < next) next = a;
    const bio = BIOMES[biomeAt(mileOfSeg(i)).a];
    let len = Math.round(bio.len[0] + r() * (bio.len[1] - bio.len[0]));
    if (next - i < len + 60) len = next - i;
    const curve = len < 60 ? 0 : bio.curves[Math.floor(r() * bio.curves.length)] * (r() < 0.5 ? -1 : 1);
    let target = y + (r() * 2 - 1) * bio.hill;
    target = Math.max(-4500, Math.min(4500, target));
    if (len < 40) target = y;
    const enter = Math.floor(len * 0.25), leave = Math.floor(len * 0.25), hold = len - enter - leave;
    const y0 = y;
    for (let k = 0; k < len; k++) {
      let c;
      if (k < enter) c = easeIn(0, curve, k / enter);
      else if (k < enter + hold) c = curve;
      else c = easeInOut(curve, 0, (k - enter - hold) / leave);
      add(c, easeInOut(y0, target, k / len), easeInOut(y0, target, (k + 1) / len));
    }
    y = target;
  }

  // colours, zones and flags
  for (const s of segs) {
    const m = mileOfSeg(s.i);
    const b = biomeAt(m);
    const alt = Math.floor(s.i / RUMBLE) % 2;
    s.alt = alt;
    s.ground = lerpC(BIOMES[b.a].groundRGB[alt], BIOMES[b.b].groundRGB[alt], b.t);
    s.noPass = Math.abs(s.curve) > 0.6 || Math.abs(s.p2.wy - s.p1.wy) > 14;
    const j = 1 + (r() - 0.5) * 0.07;
    s.ground = s.ground.map(v => v * j);
    s.dirt = lerpC(s.ground, [150, 130, 100], 0.35);
  }
  // asphalt wear: tar-snake cracks and patches spanning several segments
  for (let i = 0; i < segs.length; i++) {
    if (r() < 0.012) { const o = r() * 1.6 - 0.8, len = 4 + Math.floor(r() * 18); for (let k = 0; k < len && segs[i + k]; k++) segs[i + k].crack = o + Math.sin(k * 0.7) * 0.05; }
    if (r() < 0.004) { const o = r() * 1.2 - 0.6, w = 0.12 + r() * 0.2, len = 3 + Math.floor(r() * 8); for (let k = 0; k < len && segs[i + k]; k++) segs[i + k].patch = [o, w]; }
  }
  for (const [a, b] of ranges) for (let k = a; k < b; k++) segs[k].town = true;

  const stops = [], pumps = [];
  const place = (i, k, o, extra) => { if (segs[i]) { const sp = { k, o, ...extra }; segs[i].sprites.push(sp); return sp; } };
  const busy = new Set(); // right-side segments reserved for stops/pumps
  const reserve = (idx) => { for (let k = idx - ZONE_LEN - 6; k <= idx + 10; k++) busy.add(k); };

  for (const [a, b, t] of ranges) {
    if (t.stop) {
      const idx = segOfMile(t.mile);
      for (let k = idx - ZONE_LEN; k <= idx; k++) segs[k].zone = 'stop';
      reserve(idx);
      const sh = place(idx, 'shelter_full', 1.55);
      stops.push({
        name: t.name, mile: t.mile, idx, shelter: sh,
        arr: t.stop.arr ? parseTime(t.stop.arr) : null, dep: t.stop.dep ? parseTime(t.stop.dep) : null,
        off: t.stop.off || 0, on: t.stop.on || 0, final: !!t.stop.final, first: !!t.stop.first,
        state: 'pending', arrivedAt: null,
      });
      if (t.stop.first) place(idx + 6, 'depot', 2.7);
    }
    if (t.gas !== undefined) {
      const idx = segOfMile(t.mile + t.gas);
      for (let k = idx - ZONE_LEN; k <= idx; k++) segs[k].zone = 'gas';
      reserve(idx);
      place(idx, 'gas', 2.35);
      place(idx - ZONE_LEN - 4, 'price', 1.7);
      pumps.push({ name: t.name, mile: t.mile + t.gas, idx });
    }
    place(a + 2, welcomeSprite(t.name), 1.8);
    place(a + 8, 'speed35', 1.5);
    place(b + 3, 'speed65', 1.5);
    place(b + 14, 'shield', 1.5);
    for (let k = a + 4; k < b; k += 16) { place(k, 'lamp', -1.45); if (!busy.has(k + 8)) place(k + 8, 'lamp', 1.45); }
    for (const side of [-1, 1]) {
      let k = a + 6 + Math.floor(r() * 6);
      while (k < b - 3) {
        if (side === 1 && busy.has(k)) { k += 4; continue; }
        const key = BUILDINGS[Math.floor(r() * BUILDINGS.length)];
        place(k, key, side * (2.5 + r() * 0.6));
        k += 9 + Math.floor(r() * 9);
      }
    }
  }

  // countryside
  let nextAd = segOfMile(3);
  for (const s of segs) {
    const i = s.i, m = mileOfSeg(i);
    if (s.town || m < -0.5) continue;
    if (i % SEG_PER_MILE === 0) place(i, 'mile', 1.32);
    if (i % 22 === 0) place(i, 'pole', -1.65);
    if (i % (SEG_PER_MILE * 7) === 40) place(i, 'shield', 1.5);
    if (i >= nextAd) {
      place(i, 'bb' + Math.floor(r() * ADS_COUNT), (r() < 0.5 ? -1 : 1) * (2.1 + r() * 0.6));
      nextAd = i + Math.floor(SEG_PER_MILE * (2 + r() * 3));
    }
    const b = biomeAt(m);
    const bn = r() < b.t ? b.b : b.a;
    const bio = BIOMES[bn];
    if (r() < 0.5) place(i, bn === 'desert' || bn === 'mesa' ? 'pebbles2' : 'pebbles', (r() < 0.5 ? -1 : 1) * (1.36 + r() * 1.4));
    for (const side of [-1, 1]) {
      if (r() < bio.density * 0.55) {
        let roll = r(), key = bio.veg[0][0];
        for (const [k, w] of bio.veg) { if (roll < w) { key = k; break; } roll -= w; }
        const big = key.startsWith('pine') || key === 'joshua' || key === 'saguaro' || key === 'boulder' || key.startsWith('juniper');
        const off = side * ((big ? 1.9 : 1.4) + r() * r() * 7);
        place(i, key, off);
      }
    }
    if (bn === 'plains') {
      if (i % 5 === 0) { place(i, 'fence', -1.95); place(i, 'fence', 1.95); }
      if (r() < 0.004) place(i, r() < 0.5 ? 'cow' : 'cow2', (r() < 0.5 ? -1 : 1) * (2.6 + r() * 3));
      if (r() < 0.0012) place(i, 'windmill', (r() < 0.5 ? -1 : 1) * (3 + r() * 3));
    }
  }
  return { segs, stops, pumps, length: segs.length * SEG };
}
