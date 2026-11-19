// Builds the drivable pseudo-3D road from the map: each highway edge becomes a run of segments
// whose curves follow the real road's turns, whose scenery follows the real landscape,
// and whose towns sit where they are on the map. Edges are appended as you drive.
import { SEG, SEG_PER_MILE, RUMBLE, ZONE_LEN, DRAW_DIST } from './config.js';
import { mulberry, hex, lerpC, easeInOut } from './gfx.js';
import { BUILDINGS, ADS_COUNT, welcomeSprite, greenSign, routeShield } from './sprites.js';
import { NODES, edgePoly, heading, normAng, biomeAtMap } from './world.js';

export const BIOMES = {
  forest: {
    ground: ['#3d6a2c', '#376227'], veg: [['pine', 0.5], ['pine2', 0.25], ['pine3', 0.17], ['rock', 0.08]],
    density: 0.6, curves: [0, 1, 1, 2], hill: 2200, len: [120, 300], traffic: 1,
  },
  woodland: {
    ground: ['#6c7a3c', '#657236'], veg: [['juniper', 0.4], ['juniper2', 0.2], ['pine3', 0.12], ['rock', 0.13], ['grass', 0.15]],
    density: 0.4, curves: [0, 1, 1, 2], hill: 1500, len: [150, 350], traffic: 0.9,
  },
  plains: {
    ground: ['#b6a45a', '#ae9c53'], veg: [['grass', 0.55], ['sage', 0.3], ['juniper2', 0.08], ['rock', 0.07]],
    density: 0.3, curves: [0, 0, 1, 1], hill: 900, len: [200, 500], traffic: 0.8,
  },
  mesa: {
    ground: ['#a5643e', '#9c5c38'], veg: [['juniper', 0.3], ['redrock', 0.3], ['boulder', 0.15], ['grass', 0.25]],
    density: 0.35, curves: [0, 1, 2, 2], hill: 2600, len: [120, 280], traffic: 0.7,
  },
  desert: {
    ground: ['#d0b089', '#c8a880'], veg: [['creosote', 0.45], ['joshua', 0.28], ['barrel', 0.1], ['rock', 0.11], ['boulder', 0.06]],
    density: 0.3, curves: [0, 0, 0, 1], hill: 700, len: [300, 800], traffic: 0.7,
  },
  sonoran: {
    ground: ['#c8a47a', '#c09c72'], veg: [['saguaro', 0.32], ['creosote', 0.3], ['barrel', 0.14], ['rock', 0.12], ['boulder', 0.12]],
    density: 0.36, curves: [0, 0, 1, 1], hill: 900, len: [250, 600], traffic: 0.9,
  },
};
for (const b of Object.values(BIOMES)) b.groundRGB = b.ground.map(hex);

const HALF = { city: 1.3, town: 0.9, junction: 0 };
const halfSegs = node => Math.round(HALF[NODES[node].type] * SEG_PER_MILE);

export class Track {
  constructor(seed = 66) {
    this.segs = []; this.r = mulberry(seed);
    this.y = 0; this.heading = null; this.legs = []; this.pumps = []; this.marks = [];
    this.nextAd = 300; this.centerAt = null; this.reserved = null;
  }
  get length() { return this.segs.length * SEG; }

  push(curve, y1, y2, info) {
    const i = this.segs.length;
    const r = this.r;
    const alt = Math.floor(i / RUMBLE) % 2;
    const bio = info.bio;
    let ground = lerpC(BIOMES[bio.a].groundRGB[alt], BIOMES[bio.b].groundRGB[alt], bio.t);
    const j = 1 + (r() - 0.5) * 0.07;
    ground = ground.map(v => v * j);
    const s = {
      i, curve, alt, bio, ground, dirt: lerpC(ground, [150, 130, 100], 0.35),
      p1: { wy: y1, wz: i * SEG }, p2: { wy: y2, wz: (i + 1) * SEG }, sprites: [], cars: [],
      noPass: Math.abs(curve) > 0.6 || Math.abs(y2 - y1) > 14,
      heading: info.heading, mx: info.mx, my: info.my, town: info.town || null,
    };
    if (r() < 0.012) this.crackRun = [r() * 1.6 - 0.8, 4 + Math.floor(r() * 18)];
    if (this.crackRun && this.crackRun[1]-- > 0) s.crack = this.crackRun[0] + Math.sin(i * 0.7) * 0.05;
    if (r() < 0.004) this.patchRun = [r() * 1.2 - 0.6, 0.12 + r() * 0.2, 3 + Math.floor(r() * 8)];
    if (this.patchRun && this.patchRun[2]-- > 0) s.patch = [this.patchRun[0], this.patchRun[1]];
    this.segs.push(s);
    return s;
  }

  place(i, k, o, extra) { const s = this.segs[i]; if (!s) return null; const sp = { k, o, ...extra }; s.sprites.push(sp); return sp; }

  // Arriving half of a town, ending at its centre (used to start a trip inside a town).
  appendStart(nodeId, hdg) {
    const N = halfSegs(nodeId) || 60;
    const n = NODES[nodeId];
    const s0 = this.segs.length;
    this.heading = hdg;
    const bio = biomeAtMap(n.x, n.y);
    for (let j = 0; j < N; j++) {
      const back = (N - j) / SEG_PER_MILE;
      this.push(0, this.y, this.y, { bio, heading: hdg, mx: n.x - Math.sin(hdg) * back, my: n.y + Math.cos(hdg) * back, town: n.type !== 'junction' ? nodeId : null });
    }
    this.centerAt = this.segs.length - 1;
    this.decorate(s0, this.segs.length);
    this.centerAt = null;
    this.townCenter(nodeId, this.segs.length - 1, s0);
  }

  // A directed highway edge from one node to the next.
  appendEdge(e) {
    const r = this.r;
    const poly = edgePoly(e);
    const cum = [0];
    for (let k = 1; k < poly.length; k++) cum.push(cum[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
    const Lp = cum[cum.length - 1];
    const N = Math.max(240, Math.round(e.road.miles * SEG_PER_MILE));
    const hA = halfSegs(e.from), hB = halfSegs(e.to);
    const lo = hA + 6, hi = N - hB - 6;
    const curves = new Float32Array(N);
    const h0 = heading(poly[0], poly[1]);
    if (this.heading === null) this.heading = h0;
    // turns: the first one swings us from our current heading onto the road
    const events = [[lo, normAng(h0 - this.heading)]];
    for (let k = 1; k < poly.length - 1; k++)
      events.push([cum[k] / Lp * N, normAng(heading(poly[k], poly[k + 1]) - heading(poly[k - 1], poly[k]))]);
    for (const [pos, d] of events) {
      if (Math.abs(d) < 1e-4) continue;
      let T = Math.min(Math.max(30, Math.round(Math.abs(d) * 140) + 30), Math.max(30, hi - lo));
      let st = Math.round(pos - T / 2);
      st = Math.max(lo, Math.min(hi - T, st));
      let wsum = 0; for (let k = 0; k < T; k++) wsum += Math.sin(Math.PI * (k + 0.5) / T);
      for (let k = 0; k < T; k++) if (st + k >= 0 && st + k < N) curves[st + k] += d * SEG * Math.sin(Math.PI * (k + 0.5) / T) / wsum;
    }
    // map position for each segment
    const posAt = f => {
      const d = f * Lp;
      let k = 1; while (k < cum.length - 1 && cum[k] < d) k++;
      const t = (d - cum[k - 1]) / Math.max(1e-6, cum[k] - cum[k - 1]);
      return [poly[k - 1][0] + (poly[k][0] - poly[k - 1][0]) * t, poly[k - 1][1] + (poly[k][1] - poly[k - 1][1]) * t];
    };
    // gentle wiggles that cancel out, so the heading always matches the map
    let k = lo + 40;
    while (k < hi - 60) {
      const [mx, my] = posAt(k / N);
      const bio = BIOMES[biomeAtMap(mx, my).a];
      const L = Math.round(bio.len[0] + r() * (bio.len[1] - bio.len[0]));
      if (k + L > hi) break;
      const amp = bio.curves[Math.floor(r() * bio.curves.length)] * 0.7 * (r() < 0.5 ? -1 : 1);
      for (let j = 0; j < L; j++) curves[k + j] += amp * Math.sin(2 * Math.PI * (j + 0.5) / L);
      k += L + Math.floor(r() * 120);
    }
    // hills, flat through towns
    const ys = new Float32Array(N + 1);
    ys[0] = this.y;
    let j = 0;
    while (j < N) {
      if (j < hA || j >= N - hB) { ys[j + 1] = ys[j]; j++; continue; }
      const [mx, my] = posAt(j / N);
      const bio = BIOMES[biomeAtMap(mx, my).a];
      let len = Math.round(bio.len[0] + r() * (bio.len[1] - bio.len[0]));
      len = Math.min(len, N - hB - j);
      let target = ys[j] + (r() * 2 - 1) * bio.hill;
      target = Math.max(-4500, Math.min(4500, target));
      if (len < 40) target = ys[j];
      const y0 = ys[j];
      for (let q = 0; q < len; q++) ys[j + q + 1] = easeInOut(y0, target, (q + 1) / len);
      j += len;
    }
    const s0 = this.segs.length;
    let h = this.heading;
    for (let q = 0; q < N; q++) {
      const [mx, my] = posAt((q + 0.5) / N);
      h += curves[q] / SEG;
      const town = q < hA && NODES[e.from].type !== 'junction' ? e.from : q >= N - hB && NODES[e.to].type !== 'junction' ? e.to : null;
      this.push(curves[q], ys[q], ys[q + 1], { bio: biomeAtMap(mx, my), heading: h, mx, my, town });
    }
    this.heading = h; this.y = ys[N];
    const s1 = this.segs.length;
    this.legs.push({ e, s0, s1 });
    // roadside: route shield and mileage sign leaving town
    this.place(s0 + hA + 12, routeShield(e.road.hw), 1.5, { solid: true });
    this.place(s0 + hA + 30, greenSign([NODES[e.to].name, `${e.road.miles} MI`]), 1.7);
    // mid-route truck stop on long, empty stretches
    if (e.road.miles > 55) {
      const m = s0 + Math.round(N / 2);
      for (let q = m - ZONE_LEN; q <= m; q++) this.segs[q].zone = 'gas';
      this.place(m, 'gas', 2.35); this.place(m - ZONE_LEN - 4, 'price', 1.7);
      this.place(m - 200, greenSign(['TRUCK STOP', '2 MI']), 1.7);
      this.place(m + 30, BUILDINGS[Math.floor(r() * BUILDINGS.length)], -2.6);
      this.pumps.push({ name: 'TRUCK STOP', idx: m });
      this.reserved = [m - ZONE_LEN - 8, m + 12];
    }
    this.centerAt = NODES[e.to].type !== 'junction' ? s1 - 1 : null;
    this.decorate(s0, s1);
    this.reserved = null; this.centerAt = null;
    if (NODES[e.to].type !== 'junction') this.townCenter(e.to, s1 - 1, s1 - hB);
    else this.marks.push({ node: e.to, idx: s1 - 1 });
    return { s0, s1 };
  }

  // Straight continuation so the renderer always has road ahead after the final stop.
  appendTail(n = DRAW_DIST + 240) {
    const last = this.segs[this.segs.length - 1];
    const s0 = this.segs.length;
    for (let q = 0; q < n; q++) {
      const ahead = (q + 1) / SEG_PER_MILE;
      const town = q < 100 && last.town ? last.town : null;
      this.push(0, this.y, this.y, { bio: last.bio, heading: this.heading, mx: last.mx + Math.sin(this.heading) * ahead, my: last.my - Math.cos(this.heading) * ahead, town });
    }
    this.centerAt = null;
    this.decorate(s0, this.segs.length);
  }

  // Centre of a town: bus stop / parking box, gas station, welcome sign.
  townCenter(nodeId, E, a) {
    const n = NODES[nodeId];
    for (let q = E - ZONE_LEN; q <= E; q++) this.segs[q].zone = 'stop';
    const shelter = this.place(E, 'shelter_full', 1.55, { solid: true });
    const g = E - 60;
    for (let q = g - ZONE_LEN; q <= g; q++) if (this.segs[q] && this.segs[q].town) this.segs[q].zone = 'gas';
    this.place(g, 'gas', 2.35); this.place(g - ZONE_LEN - 4, 'price', 1.7);
    this.pumps.push({ name: n.name, idx: g });
    if (n.type === 'city') this.place(E - 18, 'rental', 2.9);
    this.place(a + 2, welcomeSprite(n.name), 1.8, { solid: true });
    this.place(a + 8, 'speed35', 1.5, { solid: true });
    this.marks.push({ node: nodeId, idx: E, shelter });
  }

  decorate(s0, s1) {
    const r = this.r, segs = this.segs;
    for (let i = s0; i < s1; i++) {
      const s = segs[i];
      if (s.town) {
        // town blocks: streetlights and buildings on both sides, leaving room for the bus stop and pumps
        if (i % 16 === 0) this.place(i, 'lamp', -1.45);
        const nearCenter = this.isReserved(i);
        if (i % 16 === 8 && !nearCenter) this.place(i, 'lamp', 1.45);
        for (const side of [-1, 1]) {
          if (side === 1 && nearCenter) continue;
          if (r() < 0.085) this.place(i, BUILDINGS[Math.floor(r() * BUILDINGS.length)], side * (2.5 + r() * 0.6));
        }
        continue;
      }
      if (this.reserved && i >= this.reserved[0] && i <= this.reserved[1]) continue;
      if (i % SEG_PER_MILE === 0) this.place(i, 'mile', 1.32);
      if (i % 22 === 0) this.place(i, 'pole', -1.65);
      if (i >= this.nextAd) {
        this.place(i, 'bb' + Math.floor(r() * ADS_COUNT), (r() < 0.5 ? -1 : 1) * (2.1 + r() * 0.6), { solid: true });
        this.nextAd = i + Math.floor(SEG_PER_MILE * (2 + r() * 3));
      }
      const b = s.bio;
      const bn = r() < b.t ? b.b : b.a;
      const bio = BIOMES[bn];
      if (r() < 0.5) this.place(i, bn === 'desert' || bn === 'mesa' || bn === 'sonoran' ? 'pebbles2' : 'pebbles', (r() < 0.5 ? -1 : 1) * (1.36 + r() * 1.4));
      for (const side of [-1, 1]) {
        if (r() < bio.density * 0.55) {
          let roll = r(), key = bio.veg[0][0];
          for (const [k, w] of bio.veg) { if (roll < w) { key = k; break; } roll -= w; }
          const big = key.startsWith('pine') || key === 'joshua' || key === 'saguaro' || key === 'boulder' || key.startsWith('juniper');
          this.place(i, key, side * ((big ? 1.9 : 1.4) + r() * r() * 7));
        }
      }
      if (bn === 'plains') {
        if (i % 5 === 0) { this.place(i, 'fence', -1.95); this.place(i, 'fence', 1.95); }
        if (r() < 0.004) this.place(i, r() < 0.5 ? 'cow' : 'cow2', (r() < 0.5 ? -1 : 1) * (2.6 + r() * 3));
        if (r() < 0.0012) this.place(i, 'windmill', (r() < 0.5 ? -1 : 1) * (3 + r() * 3));
      }
    }
  }
  // the last 120 segments of each arriving town half hold the stop and the pumps
  isReserved(i) { return this.centerAt !== null && i >= this.centerAt - 120 && i <= this.centerAt + 4; }
}
