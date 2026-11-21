// Builds the drivable pseudo-3D road from the map: each highway edge becomes a run of segments
// whose curves follow the real road's turns, whose scenery follows the real landscape,
// and whose towns sit where they are on the map. Edges are appended as you drive.
import { SEG, SEG_PER_MILE, RUMBLE, ZONE_LEN, DRAW_DIST, ROAD_W } from './config.js';
import { mulberry, hex, lerpC, easeInOut } from './gfx.js';
import { BUILDINGS, ADS_COUNT, welcomeSprite, greenSign, routeShield, carSprite, gantrySign } from './sprites.js';
import { NODES, heading, normAng, biomeAtMap, outEdges } from './world.js';

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

const HALF = { city: 1.6, town: 1.2, junction: 0 };
const halfSegs = node => Math.round(HALF[NODES[node].type] * SEG_PER_MILE);
const TAU = Math.PI * 2;
export const RING = 240;         // segments around a roundabout: a wide, gentle circle
const EXIT_T = 16;               // segments of the swing out of a roundabout
export const BR_M = 90;          // how far ahead a branch road is drawn before it's built for real
const VEER = 0.6;                // radians: the swing into and out of a roundabout
const STREETS = ['ELM ST', 'OAK AVE', 'MAPLE ST', 'PINE ST', 'CEDAR AVE', 'MESA DR', 'DESERT VIEW DR', 'JUNIPER LN',
  'SUNSET DR', 'CANYON RD', 'BIRCH AVE', 'CACTUS ST', 'COYOTE TRL', 'ASPEN AVE', 'SAGE ST', 'COPPER ST'];

const DINERS = ['DESERT ROSE CAFE', "MOM'S KITCHEN", 'CHUCKWAGON DINER', 'SUNSET GRILL', 'COYOTE CAFE', 'HI-WAY DINER', 'SILVER SPOON', 'PIE PALACE'];
const MOTELS = ['SLEEPY CACTUS MOTEL', 'STARLITE MOTOR INN', 'WAGON WHEEL MOTEL', 'DESERT SANDS LODGE', 'PINE VIEW MOTEL', 'TUMBLEWEED INN', 'OASIS MOTOR COURT', 'BIG SKY MOTEL'];
function serviceNames(key) {
  let h = 7;
  for (const ch of String(key)) h = (h * 31 + ch.charCodeAt(0)) % 9973;
  return { diner: DINERS[h % DINERS.length], motel: MOTELS[(h >> 3) % MOTELS.length] };
}

export const reverseEdge = e => ({ road: e.road, from: e.to, to: e.from, rev: !e.rev });
// What sits at a node: a highway split you steer into (interchanges, and leaving the big cities),
// a roundabout (dead ends, small-town forks) or a plain crossroads.
export function nodeKind(id) {
  const n = NODES[id], deg = outEdges(id).length;
  // no roundabouts: where three or more roads meet, the road splits and you steer onto yours;
  // elsewhere (two roads, or a dead end where you turn back) the road simply bends
  if (n.type === 'junction' || deg >= 3) return 'split';
  return 'cross';
}

// ---------- road splits ----------
// Every road leaving a split is a "ribbon". All ribbons start on top of each other and peel apart,
// each at its own angle theta. Positions are worked out in one shared frame, so the ribbon you are
// on can be swapped for another one at any moment without anything on screen moving.
export const SPLIT_LS = 280;               // segments over which the roads ease apart (slowly: time to steer across once you see them part)
export const SPLIT_Q = SPLIT_LS + 220;     // whole split, including where the other roads curve away
export const SPLIT_LOCK = SPLIT_LS + 45;   // past this the roads are apart: your choice is made
const splitF = q => q <= 0 ? 0 : q <= SPLIT_LS ? q * q / (2 * SPLIT_LS) : SPLIT_LS / 2 + (q - SPLIT_LS);
export const splitSlope = q => q <= 0 ? 0 : Math.min(1, q / SPLIT_LS);
export const splitL = (sp, j, q) => SEG * sp.theta[j] * splitF(q);
const splitG = q => q > SPLIT_LS + 40 ? 1.5 * (q - SPLIT_LS - 40) ** 2 : 0;
// lateral position of ribbon j seen from ribbon `ref`, in half-road widths (positive = right)
export function splitOff(sp, j, ref, q) {
  if (j === ref) return 0;
  return (splitL(sp, j, q) - splitL(sp, ref, q) + Math.sign(sp.theta[j] - sp.theta[ref]) * splitG(q)) / ROAD_W;
}
export function splitPos(j, k) {
  if (k === 2) return j ? 'RIGHT' : 'LEFT';
  if (k === 3) return ['LEFT', 'MIDDLE', 'RIGHT'][j];
  return j === 0 ? 'FAR LEFT' : j === k - 1 ? 'FAR RIGHT' : j < (k - 1) / 2 ? 'LEFT' : j > (k - 1) / 2 ? 'RIGHT' : 'MIDDLE';
}
const arrowFor = rel => rel < -0.5 ? '<' : rel > 0.5 ? '>' : '^';

// ---------- service roads ----------
// A one-way side road that leaves the highway on the right, runs past gas, a diner and a motel,
// and rejoins. Its lateral offset from the highway is g(q) (world units).
const LOOP_R = 90, LOOP_D = 4.4, LOOP_SLOT = 60;
const LOOP_TOWN_K = 80;
const loopLen = n => 2 * LOOP_R + 20 + n * LOOP_SLOT;
const LOOP_TOWN_END = LOOP_TOWN_K + loopLen(3);
const smooth = t => t * t * (3 - 2 * t);
export function loopG(lp, q) {
  const L = lp.L, D = LOOP_D * ROAD_W;
  if (q <= 0 || q >= L) return 0;
  if (q < LOOP_R) return D * smooth(q / LOOP_R);
  if (q > L - LOOP_R) return D * smooth((L - q) / LOOP_R);
  return D;
}
// Put the highway (on = false) or the service road (on = true) under the camera: the segments
// are rewritten in place, the other road becomes the "branch" drawn beside it.
export function applyLoop(lp, on) {
  lp.on = on;
  const G = q => loopG(lp, q);
  for (const s of lp.segs) {
    const q = s.lq, o1 = G(q) / ROAD_W, o2 = G(q + 1) / ROAD_W;
    s.curve = s.base.curve + (on ? G(q + 2) - 2 * G(q + 1) + G(q) : 0);
    s.heading = s.base.heading + (on ? (G(q + 2) - G(q + 1)) / SEG : 0);
    s.zone = on ? s.svcZone : s.mainZone;
    s.oneway = on ? true : s.base.oneway;
    s.carOff = on ? -o1 : 0;
    s.noL = on ? Math.abs(o1 - 0.95) < 0.99 && o1 > 0.01 : false;
    s.noR = on ? false : Math.abs(o1 - 0.95) < 0.99 && o1 > 0.01;
    if (o1 > 0.01 || o2 > 0.01) {
      const b = on ? { o1: -o1, o2: -o2, zone: s.mainZone, noR: Math.abs(o1 - 0.95) < 0.99 } : { o1, o2, zone: s.svcZone, svc: true, noL: Math.abs(o1 - 0.95) < 0.99 };
      s.br = [b];
    } else s.br = null;
    for (const sp of s.sprites) {
      if (sp.att === 'svc') sp.o = (on ? 0 : o1) + sp.lo;
      else { if (sp.o0 === undefined) sp.o0 = sp.o; sp.o = sp.o0 - (on ? o1 : 0); }
    }
  }
}

// ---------- road profiles: each road is built once, so it looks the same in both directions ----------
const PROFILES = new Map();
export function profile(road) {
  let P = PROFILES.get(road.id);
  if (P) return P;
  const r = mulberry(4211 + road.id * 7919);
  const poly = road.poly;
  const cum = [0];
  for (let k = 1; k < poly.length; k++) cum.push(cum[k - 1] + Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]));
  const Lp = cum[cum.length - 1];
  const N = Math.max(240, Math.round(road.miles * SEG_PER_MILE));
  const hA = halfSegs(road.a), hB = halfSegs(road.b);
  const lo = hA + 6, hi = N - hB - 6;
  const curves = new Float32Array(N);
  for (let k = 1; k < poly.length - 1; k++) {
    const d = normAng(heading(poly[k], poly[k + 1]) - heading(poly[k - 1], poly[k]));
    if (Math.abs(d) < 1e-4) continue;
    const pos = cum[k] / Lp * N;
    const T = Math.min(Math.max(30, Math.round(Math.abs(d) * 140) + 30), Math.max(30, hi - lo));
    let st = Math.round(pos - T / 2);
    st = Math.max(lo, Math.min(hi - T, st));
    let wsum = 0; for (let q = 0; q < T; q++) wsum += Math.sin(Math.PI * (q + 0.5) / T);
    for (let q = 0; q < T; q++) if (st + q >= 0 && st + q < N) curves[st + q] += d * SEG * Math.sin(Math.PI * (q + 0.5) / T) / wsum;
  }
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
  P = { road, N, hA, hB, curves, ys, H: new Float32Array(N), mx: new Float32Array(N), my: new Float32Array(N), bio: [], town: [], cross: new Uint8Array(N), crossAt: [], sprites: [] };
  let h = heading(poly[0], poly[1]);
  for (let q = 0; q < N; q++) {
    const [mx, my] = posAt((q + 0.5) / N);
    h += curves[q] / SEG;
    P.H[q] = h; P.mx[q] = mx; P.my[q] = my;
    P.bio.push(biomeAtMap(mx, my));
    P.town.push(q < hA && NODES[road.a].type !== 'junction' ? road.a : q >= N - hB && NODES[road.b].type !== 'junction' ? road.b : null);
  }
  // side streets in the bigger towns
  for (const [half, qc] of [[hA, 66], [hB, N - 1 - 66]]) {
    if (half < 150) continue;
    P.crossAt.push(qc);
    for (let q = qc - 2; q <= qc + 2; q++) P.cross[q] = q === qc - 2 || q === qc + 2 ? 2 : 1;
  }
  decorateProfile(P, r);
  PROFILES.set(road.id, P);
  return P;
}

// Scenery for a profile. Space is kept free near both town centres for the stops and pumps
// of either direction (positive offsets are on the right when driving from road.a to road.b).
function decorateProfile(P, r) {
  const N = P.N, mid = Math.round(N / 2);
  const truck = P.road.miles > 55;
  // keep the right-hand side clear where each direction's service road runs out of town
  const depA = NODES[P.road.a].type !== 'junction', depB = NODES[P.road.b].type !== 'junction';
  const reserved = (q, side) => side > 0 ? (q <= 70 || (depA && q <= LOOP_TOWN_END + 10) || q >= N - 70)
    : (q <= 70 || (depB && q >= N - 1 - LOOP_TOWN_END - 10) || q >= N - 71);
  const nearCross = q => P.crossAt.some(c => Math.abs(q - c) < 7);
  let nextAd = 300;
  for (let q = 0; q < N; q++) {
    const sp = [];
    P.sprites.push(sp);
    const add = (k, o, solid) => sp.push({ k, o, solid });
    if (P.cross[q]) continue;
    if (P.town[q]) {
      if (q % 16 === 0 && !reserved(q, -1)) add('lamp', -1.45);
      if (q % 16 === 8 && !reserved(q, 1)) add('lamp', 1.45);
      for (const side of [-1, 1]) {
        if (reserved(q, side) || nearCross(q)) continue;
        if (r() < 0.085) add(BUILDINGS[Math.floor(r() * BUILDINGS.length)], side * (2.5 + r() * 0.6));
      }
      continue;
    }
    if (truck && (Math.abs(q - mid) < 240 || Math.abs(q - (N - 1 - mid)) < 240)) continue;
    if (q % SEG_PER_MILE === 0 && !reserved(q, 1)) add('mile', 1.32);
    if (q % 22 === 0 && !reserved(q, -1)) add('pole', -1.65);
    if (q >= nextAd) {
      const sd = r() < 0.5 ? -1 : 1;
      if (!reserved(q, sd)) add('bb' + Math.floor(r() * ADS_COUNT), sd * (2.1 + r() * 0.6), true);
      nextAd = q + Math.floor(SEG_PER_MILE * (2 + r() * 3));
    }
    const b = P.bio[q];
    const bn = r() < b.t ? b.b : b.a;
    const bio = BIOMES[bn];
    const ps = r() < 0.5 ? -1 : 1, pr = r();
    if (pr < 0.5 && !reserved(q, ps)) add(bn === 'desert' || bn === 'mesa' || bn === 'sonoran' ? 'pebbles2' : 'pebbles', ps * (1.36 + r() * 1.4));
    for (const side of [-1, 1]) {
      if (reserved(q, side)) { r(); continue; }
      if (r() < bio.density * 0.55) {
        let roll = r(), key = bio.veg[0][0];
        for (const [kk, w] of bio.veg) { if (roll < w) { key = kk; break; } roll -= w; }
        const big = key.startsWith('pine') || key === 'joshua' || key === 'saguaro' || key === 'boulder' || key.startsWith('juniper');
        add(key, side * ((big ? 1.9 : 1.4) + r() * r() * 7));
      }
    }
    if (bn === 'plains') {
      if (q % 5 === 0) { add('fence', -1.95); add('fence', 1.95); }
      if (r() < 0.004) add(r() < 0.5 ? 'cow' : 'cow2', (r() < 0.5 ? -1 : 1) * (2.6 + r() * 3));
      if (r() < 0.0012) add('windmill', (r() < 0.5 ? -1 : 1) * (3 + r() * 3));
    }
  }
}

// Curves of a sine-shaped turn by `delta` over T segments (exactly what appendTurn builds).
export function turnCurves(delta, T) {
  let wsum = 0; for (let k = 0; k < T; k++) wsum += Math.sin(Math.PI * (k + 0.5) / T);
  const c = [];
  for (let k = 0; k < T; k++) c.push(delta * SEG * Math.sin(Math.PI * (k + 0.5) / T) / wsum);
  return c;
}
function edgeCurves(e, k0, n) {
  const P = profile(e.road), out = [];
  for (let k = k0; k < P.N && out.length < n; k++) out.push(e.rev ? -P.curves[P.N - 1 - k] : P.curves[k]);
  return out;
}
// Where a branch road sits relative to the track: walk from its start, adding up the difference
// between its curves and the track's. Calls fn(i, o1, o2, dx) for segments i0+q, q < n.
export function walkBranch(segs, br, n, fn) {
  let D = 0, dx = 0;
  const m = Math.min(n, br.curves.length);
  for (let q = 0; q < m; q++) {
    const s = segs[br.i0 + q];
    if (!s) break;
    const D2 = D + dx;
    if (fn) fn(br.i0 + q, D, D2, dx);
    D = D2; dx += br.curves[q] - s.curve;
  }
  return { D, dx };
}

// heading on entering edge-order segment k of a directed edge
export function entryHeading(e, k) {
  const P = profile(e.road);
  if (!e.rev) return P.H[k] - P.curves[k] / SEG;
  return P.H[P.N - 1 - k] + Math.PI;
}
export const edgeSegs = e => profile(e.road).N;

function pickVeg(bioName, r) {
  const bio = BIOMES[bioName];
  let roll = r(), key = bio.veg[0][0];
  for (const [k, w] of bio.veg) { if (roll < w) { key = k; break; } roll -= w; }
  return key;
}

export class Track {
  constructor(seed = 66, opts = {}) {
    this.segs = []; this.r = mulberry(seed);
    this.y = 0; this.heading = 0; this.legs = []; this.pumps = []; this.services = []; this.marks = []; this.forks = []; this.notices = []; this.splits = []; this.loops = []; this.branches = [];
    this.pending = null; this.ring = null; this.sideStreets = !!opts.sideStreets;
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
    this.heading += curve / SEG;
    const s = {
      i, curve, alt, bio, ground, dirt: lerpC(ground, [150, 130, 100], 0.35),
      p1: { wy: y1, wz: i * SEG }, p2: { wy: y2, wz: (i + 1) * SEG }, sprites: [], cars: [],
      noPass: Math.abs(curve) > 0.6 || Math.abs(y2 - y1) > 14,
      heading: this.heading, mx: info.mx, my: info.my, town: info.town || null,
      leg: info.leg || null, k: info.k, node: info.node || null,
      cross: info.cross || 0, quiet: !!info.quiet,
    };
    if (!s.cross && !s.quiet) {
      if (r() < 0.012) this.crackRun = [r() * 1.6 - 0.8, 4 + Math.floor(r() * 18)];
      if (this.crackRun && this.crackRun[1]-- > 0) s.crack = this.crackRun[0] + Math.sin(i * 0.7) * 0.05;
      if (r() < 0.004) this.patchRun = [r() * 1.2 - 0.6, 0.12 + r() * 0.2, 3 + Math.floor(r() * 8)];
      if (this.patchRun && this.patchRun[2]-- > 0) s.patch = [this.patchRun[0], this.patchRun[1]];
    }
    this.segs.push(s);
    return s;
  }

  place(i, k, o, extra) { const s = this.segs[i]; if (!s) return null; const sp = { k, o, ...extra }; s.sprites.push(sp); return sp; }

  // Throw away everything from segment `at` onwards (to build a different road there).
  truncate(at) {
    if (at >= this.segs.length) return;
    this.segs.length = at;
    const last = this.segs[at - 1];
    this.heading = last.heading; this.y = last.p2.wy;
    this.legs = this.legs.filter(l => l.s0 < at);
    for (const l of this.legs) if (l.s1 > at) { l.s1 = at; l.cut = true; }
    this.marks = this.marks.filter(m => m.idx < at);
    this.pumps = this.pumps.filter(p => p.idx < at);
    this.services = this.services.filter(p => p.idx < at);
    this.forks = this.forks.filter(f => f.a < at);
    this.notices = this.notices.filter(n => n.idx < at);
    this.splits = this.splits.filter(sp => sp.s0 <= at);
    this.loops = this.loops.filter(lp => lp.a < at);
    this.branches = this.branches.filter(b => b.i0 < at);
    this.pending = null; this.ring = null;
  }

  // A directed highway edge (or the rest of it, from edge-order segment k0).
  appendEdge(e, k0 = 0, opts = {}) {
    const P = profile(e.road), N = P.N;
    const s0 = this.segs.length;
    const leg = { e, s0, s1: 0, k0 };
    const qOf = k => e.rev ? N - 1 - k : k;
    const yStart = e.rev ? P.ys[N - k0] : P.ys[k0];
    const off = this.y - yStart;
    this.heading = entryHeading(e, k0);
    for (let k = k0; k < N; k++) {
      const q = qOf(k);
      const curve = e.rev ? -P.curves[q] : P.curves[q];
      const ya = (e.rev ? P.ys[q + 1] : P.ys[q]) + off, yb = (e.rev ? P.ys[q] : P.ys[q + 1]) + off;
      const s = this.push(curve, ya, yb, { bio: P.bio[q], mx: P.mx[q], my: P.my[q], town: P.town[q], leg, k, cross: P.cross[q] });
      for (const sp of P.sprites[q]) s.sprites.push({ k: sp.k, o: e.rev ? -sp.o : sp.o, solid: sp.solid });
    }
    this.y = (e.rev ? P.ys[0] : P.ys[N]) + off;
    leg.s1 = this.segs.length;
    this.legs.push(leg);
    const at = k => k >= k0 && k < N ? s0 + (k - k0) : -1;
    const put = (k, key, o, extra) => { const i = at(k); return i >= 0 ? this.place(i, key, o, extra) : null; };
    const hDep = e.rev ? P.hB : P.hA, hArr = e.rev ? P.hA : P.hB;
    const svcFrom = NODES[e.from].type !== 'junction';
    const kSign = svcFrom ? Math.max(hDep, LOOP_TOWN_END) : hDep;
    put(kSign + 12, routeShield(e.road.hw), 1.5, { solid: true });
    put(kSign + 30, greenSign([NODES[e.to].name, `${e.road.miles} MI`]), 1.7);
    // side streets
    if (this.sideStreets) for (const qc of P.crossAt) {
      const kc = e.rev ? N - 1 - qc : qc, i = at(kc);
      if (i < 0) continue;
      const base = { bio: P.bio[qc], mx: P.mx[qc], my: P.my[qc], town: P.town[qc], node: P.town[qc] };
      this.sideBranches(i - 2, { kind: 'leg', e, kc }, base);
    }
    // mid-route truck stop on long, empty stretches
    const loops = [];
    if (e.road.miles > 55) {
      const m = Math.round(N / 2);
      put(m - 200 - 260, greenSign(['TRUCK STOP', '2 MI']), 1.7);
      const nm = serviceNames(e.road.id * 7 + (e.rev ? 3 : 0));
      loops.push([m - 200, 'TRUCK STOP', [['gas', 'TRUCK STOP'], ['diner', nm.diner], ['motel', nm.motel]]]);
    }
    // the departure stop of a bus line
    if (opts.depart) {
      for (let k = 20; k <= 60; k++) { const i = at(k); if (i >= 0) this.segs[i].zone = 'stop'; }
      const shelter = put(60, 'shelter_full', 1.55, { solid: true });
      if (NODES[e.from].type === 'city') put(40, 'depot', 2.9, { solid: true });
      this.marks.push({ node: e.from, idx: at(60), shelter });
    }
    if (svcFrom) {
      const nm = serviceNames(e.from);
      loops.push([LOOP_TOWN_K, NODES[e.from].name, [['gas', NODES[e.from].name], ['diner', nm.diner], ['motel', nm.motel]], e.from]);
    }
    if (NODES[e.to].type !== 'junction') this.townCenter(e.to, s0 + (N - 1 - k0), at(N - hArr), s0);
    for (const [kl, title, items, town] of loops) this.serviceLoop(at, kl, title, items, town);
    this.pending = { node: e.to, at: this.segs.length, e };
    return leg;
  }

  // A service road from edge-order k0: gas, diner and motel in a row on its right-hand side.
  serviceLoop(at, k0, title, items, town = null) {
    const L = loopLen(items.length);
    for (let q = -2; q < L; q++) if (at(k0 + q) < 0) return;   // only on a whole stretch of road
    const lp = { a: at(k0), L, on: false, segs: [], title, town };
    for (let q = -2; q < L; q++) {
      const s = this.segs[at(k0 + q)];
      s.loop = lp; s.lq = q;
      s.base = { curve: s.curve, heading: s.heading, oneway: s.oneway };
      s.mainZone = s.zone; s.svcZone = undefined;
      lp.segs.push(s);
    }
    const r = this.r;
    const putS = (q, key, lo, extra) => { const s = this.segs[at(k0 + q)]; if (s) s.sprites.push({ k: key, att: 'svc', lo, o: lo, ...extra }); };
    const want = items.map(([type]) => type === 'gas' ? 'GAS' : type === 'diner' ? 'FOOD' : 'LODGING').join(' ');
    // well clear of the road, and not right at the mouth of a roundabout exit
    this.place(at(Math.max(k0 - 70, 34)), greenSign(['SERVICES', want]), 2.15, { solid: true });
    // the striped marker where the service road leaves, and again where it comes back
    for (const q of [Math.round(LOOP_R * 0.62), Math.round(L - LOOP_R * 0.62)]) {
      const s = this.segs[at(k0 + q)];
      s.sprites.push({ k: 'gore', o: loopG(lp, q) / 2 / ROAD_W, solid: true, side: 0 });
    }
    items.forEach(([type, name], n) => {
      const kz = LOOP_R + 20 + n * LOOP_SLOT + ZONE_LEN;
      for (let q = kz - ZONE_LEN; q <= kz; q++) this.segs[at(k0 + q)].svcZone = type === 'gas' ? 'gas' : 'lot';
      const i = at(k0 + kz);
      if (type === 'gas') {
        putS(kz, 'gas', 2.35, { solid: true }); putS(kz - ZONE_LEN - 4, 'price', 1.7, { solid: true });
        this.pumps.push({ name, idx: i, loop: lp });
      } else {
        putS(kz, type === 'diner' ? 'diner' + Math.floor(r() * 3) : 'motel' + Math.floor(r() * 4), 2.75, { solid: true });
        putS(kz - ZONE_LEN - 8, greenSign([type === 'diner' ? 'FOOD' : 'LODGING', name]), 1.7, { solid: true });
        this.services.push({ type, name, idx: i, loop: lp });
      }
    });
    // a few lamps and bushes along it
    for (let q = LOOP_R; q < L - LOOP_R; q += 18) putS(q, 'lamp', -1.4, { solid: true });
    applyLoop(lp, false);
    this.loops.push(lp);
  }

  // Centre of a town: bus stop / parking box, gas station, welcome sign.
  townCenter(nodeId, E, a, s0) {
    const n = NODES[nodeId];
    const ok = q => q >= s0 && this.segs[q];
    for (let q = E - ZONE_LEN; q <= E; q++) if (ok(q)) this.segs[q].zone = 'stop';
    const shelter = ok(E) ? this.place(E, 'shelter_full', 1.55, { solid: true }) : null;
    if (n.type === 'city' && ok(E - 18)) this.place(E - 18, 'rental', 2.9);
    if (a >= 0 && ok(a + 8)) { this.place(a + 2, welcomeSprite(n.name), 1.8, { solid: true }); this.place(a + 8, 'speed35', 1.5, { solid: true }); }
    this.marks.push({ node: nodeId, idx: E, shelter });
  }

  // A flat run of segments that turns by `delta` radians (sine-shaped).
  appendTurn(delta, T, info, deco) {
    let wsum = 0; for (let k = 0; k < T; k++) wsum += Math.sin(Math.PI * (k + 0.5) / T);
    const h0 = this.heading, s0 = this.segs.length;
    for (let k = 0; k < T; k++) {
      const s = this.push(delta * SEG * Math.sin(Math.PI * (k + 0.5) / T) / wsum, this.y, this.y, { quiet: true, ...info });
      if (deco) deco(s, k);
    }
    this.heading = h0 + delta;
    this.segs[this.segs.length - 1].heading = this.heading;
    return s0;
  }
  // A straight, flat run (side streets).
  appendStraight(T, info, deco) {
    const s0 = this.segs.length;
    for (let k = 0; k < T; k++) { const s = this.push(0, this.y, this.y, { quiet: true, ...info }); if (deco) deco(s, k); }
    return s0;
  }
  nodeInfo(node) {
    const n = NODES[node];
    return { bio: biomeAtMap(n.x, n.y), mx: n.x, my: n.y, town: n.type !== 'junction' ? node : null, node };
  }

  // A town crossroads: a cross street, then the swing onto the next road.
  appendCross(node, out) {
    const info = this.nodeInfo(node);
    const delta = normAng(entryHeading(out, 0) - this.heading);
    const c0 = this.appendStraight(10, info, (s, k) => {
      if (k >= 3) s.cross = k === 3 || k === 9 ? 2 : 1;
    });
    if (info.town) this.place(c0 + 1, greenSign([STREETS[Math.floor(this.r() * STREETS.length)]]), -1.6);
    this.appendTurn(delta, Math.round(18 + Math.abs(delta) * 22), info);
    if (this.sideStreets && info.town && Math.abs(delta) < 0.5)
      this.sideBranches(c0 + 4, { kind: 'node', node }, { ...info, quiet: false });
    return c0;
  }

  // A roundabout. The bus goes straight to its exit; a car keeps circling until it steers out.
  appendRoundabout(node, exitEdge) {
    const info = this.nodeInfo(node);
    const pre = this.segs.length;
    if (this.segs[pre - 50]) this.place(pre - 50, 'roundabout', 1.5, { solid: true });
    this.notices.push({ idx: pre, text: 'ROUNDABOUT AHEAD - SLOW DOWN', color: '#ffd36a' });
    this.appendStraight(6, info, (s, k) => { if (k === 4) s.yieldline = true; });
    this.place(pre + 4, 'yield', 1.4, { solid: true });
    this.appendTurn(VEER, 22, info, s => { s.stub = -1; });
    const rs = this.segs.length, hr0 = this.heading;
    const exits = outEdges(node).map(e => {
      let x = (((hr0 - (entryHeading(e, 0) - VEER)) % TAU) + TAU) % TAU / TAU * RING;
      if (x < 3) x += RING;
      return { e, x: Math.round(x) };
    }).sort((a, b) => a.x - b.x);
    this.ring = { node, rs, hr0, exits, laps: 0, info };
    if (exitEdge) {
      const ex = exits.find(x => x.e.road.id === exitEdge.road.id && x.e.to === exitEdge.to);
      this.appendRing(ex.x, false);
      this.appendExit(exitEdge);
    } else for (let l = 0; l < 4; l++) this.appendRing(RING, true);
  }
  appendRing(n, forks) {
    const R = this.ring, r = this.r;
    for (let c = 0; c < n; c++) {
      const j = this.segs.length - R.rs;
      const s = this.push(-TAU * SEG / RING, this.y, this.y, { quiet: true, ...R.info });
      s.island = true; s.oneway = true;
      const jj = j % RING;
      for (const ex of R.exits) {
        const d = jj - (ex.x % RING);
        if (d >= 0 && d <= 17) s.noR = true;
        if (d === -12 || d === -12 + RING) this.place(s.i, greenSign([ex.e.road.hw, NODES[ex.e.to].name]), 1.45);
        // each exit is a real road leaving the circle on the right
        if (d === 0) {
          const h = this.segs[s.i - 1].heading, e = ex.e;
          const curves = turnCurves(normAng(entryHeading(e, 0) - h), EXIT_T).concat(edgeCurves(e, 0, BR_M));
          this.branches.push({ i0: s.i, curves, kind: 'exit', e, fixed: !forks, info: R.info, build: tr => tr.appendExit(e, R.info) });
        }
      }
      if (j % 6 === 0) this.place(s.i, r() < 0.5 ? 'grass' : 'sage', -1.45 - r() * 0.4);
      if (j % 18 === 9) this.place(s.i, pickVeg(R.info.bio.a, r), -2.4 - r() * 0.8);
      const nearExit = R.exits.some(ex => { const d = ((jj - (ex.x % RING)) % RING + RING) % RING; return d < 66 || d > RING - 16; });
      if (j % 12 === 3 && R.info.town && !nearExit) this.place(s.i, BUILDINGS[Math.floor(r() * BUILDINGS.length)], 2.6 + r() * 0.5);
    }
    if (forks) R.laps++;
  }
  appendExit(e, ringInfo) {
    const info = ringInfo || (this.ring ? this.ring.info : this.nodeInfo(e.from));
    this.ring = null;
    this.appendTurn(normAng(entryHeading(e, 0) - this.heading), EXIT_T, info, s => { s.stub = -1; });
    return this.appendEdge(e, 0);
  }

  // Turn around on the spot (a hairpin to the left) and drive the edge the other way.
  appendUturn(e, k0, info) {
    let delta = normAng(entryHeading(e, k0) - this.heading);
    if (delta > 0.3) delta -= TAU;
    this.appendTurn(delta, 34, info, s => { s.wide = true; });
    return this.appendEdge(e, k0);
  }

  // A dead-end residential street with a turning circle; you come back out to a stop sign.
  appendSideStreet(side, ret, base) {
    const r = this.r;
    const name = STREETS[Math.floor(r() * STREETS.length)];
    const info = { ...base, quiet: true };
    const bioName = info.bio.a;
    this.appendTurn(side * Math.PI / 2, 22, info, (s, k) => { if (k < 6) s.cross = 1; s.street = true; });
    const houses = (s, k, len) => {
      s.street = true;
      for (const sd of [-1, 1]) {
        if (k % 11 === (sd > 0 ? 3 : 8) && k > 4 && k < len - 2) {
          this.place(s.i, 'house' + Math.floor(r() * 10), sd * (2.25 + r() * 0.35), { solid: true });
          this.place(s.i - 2, 'mailbox' + Math.floor(r() * 3), sd * 1.3);
        }
        if (k % 13 === 6 && r() < 0.5) this.place(s.i, pickVeg(bioName, r), sd * (1.6 + r() * 0.3));
        if (k % 17 === 9 && r() < 0.45) {
          const type = ['sedan', 'wagon', 'pickup', 'van'][Math.floor(r() * 4)], col = Math.floor(r() * 12);
          // parked along the curb
          const view = sd > 0 ? 'rear' : 'front';
          carSprite(type, view, col);
          this.place(s.i, `car_${type}_${view}_${col}`, sd * 1.32, { solid: true });
        }
      }
      if (k % 24 === 12) this.place(s.i, 'lamp', 1.4);
    };
    const a = this.appendStraight(70, info, (s, k) => houses(s, k, 70));
    this.place(a + 2, greenSign([name]), 1.5);
    this.place(a + 6, 'speed25', 1.4, { solid: true });
    this.place(a + 12, 'deadend', 1.45, { solid: true });
    this.appendTurn(-Math.PI, 40, info, (s, k) => {
      s.street = true; s.island = true;
      if (k % 8 === 4) this.place(s.i, 'house' + Math.floor(r() * 10), 2.3 + r() * 0.3, { solid: true });
      if (k % 10 === 2) this.place(s.i, pickVeg(bioName, r), -1.5);
    });
    this.appendStraight(70, info, (s, k) => houses(s, k, 70));
    const t0 = this.appendStraight(4, info, (s, k) => { s.street = true; if (k === 2) s.stopline = true; });
    this.place(t0, 'stop', 1.4, { solid: true });
    const tj = this.segs.length;
    // the road to the left at the stop sign, drawn; the right turn is built
    const L = this.planReturn(ret, -1, this.heading);
    this.appendReturn(ret, 1, base);
    this.branches.push({ i0: tj, curves: turnCurves(L.delta, L.T).concat(edgeCurves(L.e, L.k0, BR_M)), kind: 'tee', build: tr => tr.appendReturn(ret, -1, base) });
    this.notices.push({ idx: tj - 30, text: 'STOP SIGN: STEER LEFT OR RIGHT', color: '#ffd36a' });
  }
  // Back onto the main road from a side street: dir +1 = right, -1 = left.
  appendReturn(ret, dir, base) {
    const { e, k0, delta, T } = this.planReturn(ret, dir, this.heading);
    this.appendTurn(delta, T, { ...base, quiet: true }, (s, k) => { if (k < 5) s.cross = 1; });
    return this.appendEdge(e, k0);
  }
  planReturn(ret, dir, heading) {
    const want = heading + dir * Math.PI / 2;
    let e, k0;
    if (ret.kind === 'leg') {
      const fwd = Math.abs(normAng(want - entryHeading(ret.e, ret.kc))) < Math.PI / 2;
      const N = edgeSegs(ret.e);
      if (fwd) { e = ret.e; k0 = Math.min(N - 1, ret.kc + 4); } else { e = reverseEdge(ret.e); k0 = Math.min(N - 1, N - 1 - ret.kc + 4); }
    } else {
      let best = 1e9;
      for (const o of outEdges(ret.node)) { const d = Math.abs(normAng(entryHeading(o, 0) - want)); if (d < best) { best = d; e = o; } }
      k0 = 0;
    }
    const delta = normAng(entryHeading(e, k0) - heading);
    return { e, k0, delta, T: Math.round(18 + Math.abs(delta) * 14) };
  }
  // Residential streets to the left and right of a crossing (drawn now, built when you turn in).
  sideBranches(i0, ret, base) {
    for (const side of [-1, 1]) {
      const curves = turnCurves(side * Math.PI / 2, 22).concat(new Array(BR_M).fill(0));
      this.branches.push({ i0, curves, kind: 'side', side, build: tr => tr.appendSideStreet(side, ret, base) });
    }
  }

  // Advance signs for a split, a mile and a bit before it (ending at segment `end`).
  splitSigns(end, edges) {
    const rels = edges.map(e => normAng(entryHeading(e, 0) - this.segs[Math.min(end, this.segs.length) - 1].heading));
    const lines = edges.map((e, j) => {
      const a = arrowFor(rels[j]), t = `${e.road.hw} ${NODES[e.to].name}`;
      return a === '<' ? '< ' + t : a === '>' ? t + ' >' : '^ ' + t;
    });
    const town = this.segs[end - 1]?.town;
    const i = town ? end - 26 : end - 190;
    if (this.segs[i]) this.place(i, greenSign(lines), town ? -1.75 : 1.75, { solid: true });
    if (!town && this.segs[end - 60]) this.place(end - 60, greenSign(['ROAD SPLITS', 'KEEP LEFT OR RIGHT']), 1.75, { solid: true });
  }

  // A split at a node: the roads in `edges` (ordered left to right) peel apart and you drive
  // onto ribbon `ref`. `fixed` = the bus, which can't change its mind.
  appendSplit(node, edges, ref, fixed) {
    const info = this.nodeInfo(node), k = edges.length;
    const rels = edges.map(e => normAng(entryHeading(e, 0) - this.heading));
    const spacing = k <= 2 ? 0.38 : k === 3 ? 0.34 : 0.3;
    const mean = rels.reduce((a, b) => a + b, 0) / k;
    const c = Math.max(-0.3, Math.min(0.3, mean * 0.4));
    const sp = { node, info, edges, k, rels, fixed, theta: edges.map((e, j) => c + (j - (k - 1) / 2) * spacing), seed: Math.floor(this.r() * 1e9), deco: [] };
    if (info.town) this.appendStraight(10, info, (s, q) => { if (q >= 3) s.cross = q === 3 || q === 9 ? 2 : 1; });
    else this.appendStraight(20, { ...info, quiet: true });
    sp.s0 = this.segs.length;
    this.decorateSplit(sp);
    this.splits.push(sp);
    return this.appendSplitRun(sp, ref, 0);
  }

  // Scenery for a split, attached to its ribbons so it is the same whichever road you take.
  decorateSplit(sp) {
    const r = mulberry(sp.seed), k = sp.k, town = sp.info.town;
    const add = (q, j, o, key, extra) => { if (q >= 0 && q < SPLIT_Q) (sp.deco[q] ||= []).push({ j, o, k: key, ...extra }); };
    const gap = (j, q) => (splitL(sp, j + 1, q) - splitL(sp, j, q)) / ROAD_W;  // centre to centre
    // the sign bridge, one panel per road
    const mid = Math.floor((k - 1) / 2);
    const meanL = q => sp.theta.reduce((a, t, j) => a + splitL(sp, j, q), 0) / k;
    const panels = sp.edges.map((e, j) => ({ arrow: arrowFor(sp.rels[j]), lines: [e.road.hw, NODES[e.to].name] }));
    add(3, mid, (meanL(3) - splitL(sp, mid, 3)) / ROAD_W, gantrySign(panels, Math.max(9, k * 3.6 + 2)), { center: true });
    const bio = BIOMES[sp.info.bio.a];
    const veg = () => { let roll = r(), key = bio.veg[0][0]; for (const [kk, w] of bio.veg) { if (roll < w) { key = kk; break; } roll -= w; } return key; };
    for (let j = 0; j < k; j++) {
      // where this road parts from the next one: a striped marker, then its route shield
      let qn = SPLIT_LS;
      if (j < k - 1) { for (let q = 0; q < SPLIT_Q; q++) if (gap(j, q) >= 2.1) { qn = q; break; } add(qn, j, gap(j, qn) / 2, 'gore', { solid: true, side: 0 }); }
      const e = sp.edges[j];
      let qs = SPLIT_LS + 10;
      if (j < k - 1) { for (let q = qn; q < SPLIT_Q; q++) if (gap(j, q) >= 3.6) { qs = q; break; } }
      add(qs, j, 1.45, routeShield(e.road.hw), { solid: true, side: 1 });
      add(qs + 40, j, j === k - 1 ? 1.75 : Math.min(1.7, gap(j, qs + 40) - 2.5), greenSign([NODES[e.to].name]), { solid: true, side: 1 });
    }
    for (let q = 0; q < SPLIT_Q; q++) {
      // outside the outermost roads
      for (const [j, side] of [[0, -1], [k - 1, 1]]) {
        if (town) {
          if (q % 16 === (side > 0 ? 8 : 0)) add(q, j, side * 1.45, 'lamp', { solid: true });
          if (r() < 0.085) add(q, j, side * (2.5 + r() * 0.6), BUILDINGS[Math.floor(r() * BUILDINGS.length)], { solid: true });
        } else {
          if (r() < 0.5) add(q, j, side * (1.36 + r() * 1.4), bio === BIOMES.forest || bio === BIOMES.woodland || bio === BIOMES.plains ? 'pebbles' : 'pebbles2');
          if (r() < bio.density * 0.55) {
            const key = veg(), big = key.startsWith('pine') || key === 'joshua' || key === 'saguaro' || key === 'boulder' || key.startsWith('juniper');
            add(q, j, side * ((big ? 1.9 : 1.4) + r() * r() * 7), key, { solid: big });
          }
          if (q % 22 === 0 && side < 0) add(q, j, -1.65, 'pole');
        }
      }
      // in the growing wedge between two roads
      for (let j = 0; j < k - 1; j++) {
        const g = gap(j, q) - 2;          // edge to edge
        if (g < 1.6) continue;
        // nothing in the wedge stops you while you can still cross to another road
        const firm = q > SPLIT_LOCK + 20;
        if (town) { if (q % 16 === 4 && g > 2.2) add(q, j, 1.4, 'lamp', { solid: firm }); continue; }
        if (r() < bio.density * 0.5 * Math.min(1, (g - 1.6) / 3)) {
          const key = veg(), big = key.startsWith('pine') || key === 'joshua' || key === 'saguaro' || key === 'boulder' || key.startsWith('juniper');
          if (big && g < 3.5) continue;
          add(q, j, 1.5 + r() * (g - 1), key, { solid: big && firm, side: 0 });
        }
      }
    }
  }

  // Build the split from position q onward, driving on ribbon `ref`, then the road it leads to.
  appendSplitRun(sp, ref, q0) {
    sp.ref = ref;
    const L = q => splitL(sp, ref, q);
    for (let q = q0; q < SPLIT_Q; q++) {
      const s = this.push(L(q + 2) - 2 * L(q + 1) + L(q), this.y, this.y, { ...sp.info, quiet: true });
      s.split = sp; s.q = q; s.ref = ref;
      const offs = [], br = [];
      for (let j = 0; j < sp.k; j++) offs.push(splitOff(sp, j, ref, q));
      const covered = (j, x) => offs.some((o, m) => m !== j && Math.abs(o - x) < 0.99);
      s.noL = covered(ref, -0.95); s.noR = covered(ref, 0.95);
      for (let j = 0; j < sp.k; j++) {
        if (j === ref) continue;
        const o1 = offs[j], o2 = splitOff(sp, j, ref, q + 1);
        if (Math.min(Math.abs(o1), Math.abs(o2)) < 70) br.push({ j, o1, o2, noL: covered(j, o1 - 0.95), noR: covered(j, o1 + 0.95) });
      }
      if (br.length) s.br = br;
      for (const d of sp.deco[q] || []) {
        const o = offs[d.j] + d.o;
        if (Math.abs(o) > 90) continue;
        s.sprites.push({ k: d.k, o, solid: !!d.solid, side: d.center ? 0 : d.side ?? (Math.abs(d.o) > 1.2 ? Math.sign(d.o) : 0) });
      }
    }
    const e = sp.edges[ref];
    const delta = normAng(entryHeading(e, 0) - this.heading);
    this.appendTurn(delta, Math.round(14 + Math.abs(delta) * 22), sp.info);
    return this.appendEdge(e, 0);
  }

  // Whatever comes after arriving at a node, for a fixed route (the bus).
  appendNode(node, out) {
    const kind = nodeKind(node);
    if (kind === 'split') {
      const inId = this.legs.length ? this.legs[this.legs.length - 1].e.road.id : -1;
      let outs = outEdges(node).filter(e => e.road.id !== inId);
      if (!outs.length) outs = outEdges(node);
      const h = this.heading;
      outs.sort((a, b) => normAng(entryHeading(a, 0) - h) - normAng(entryHeading(b, 0) - h));
      const ref = outs.findIndex(e => e.road.id === out.road.id && e.to === out.to);
      if (outs.length > 1 && ref >= 0) {
        this.splitSigns(this.segs.length, outs);
        this.notices.push({ idx: this.segs.length, text: `ROUTE: KEEP ${splitPos(ref, outs.length)} FOR ${out.road.hw} ${NODES[out.to].name}`, color: '#ffd36a' });
        return this.appendSplit(node, outs, ref, true);
      }
      this.appendCross(node, out);
      return this.appendEdge(out, 0);
    }
    if (kind === 'roundabout') return this.appendRoundabout(node, out);
    this.appendCross(node, out);
    return this.appendEdge(out, 0);
  }

  // Straight continuation so the renderer always has road ahead after the final stop.
  appendTail(n = DRAW_DIST + 240) {
    const last = this.segs[this.segs.length - 1];
    const r = this.r;
    for (let q = 0; q < n; q++) {
      const ahead = (q + 1) / SEG_PER_MILE;
      const town = q < 100 && last.town ? last.town : null;
      const s = this.push(0, this.y, this.y, { bio: last.bio, mx: last.mx + Math.sin(this.heading) * ahead, my: last.my - Math.cos(this.heading) * ahead, town });
      if (town && r() < 0.15) this.place(s.i, BUILDINGS[Math.floor(r() * BUILDINGS.length)], (r() < 0.5 ? -1 : 1) * (2.5 + r() * 0.6));
      else if (!town && r() < 0.3) this.place(s.i, pickVeg(last.bio.a, r), (r() < 0.5 ? -1 : 1) * (1.6 + r() * 4));
    }
    this.pending = null;
  }
}
