// The region: northern & central Arizona (+ Needles, CA), real towns and highways, 1994.
// Coordinates are real (approximate); road shapes are simplified polylines of the real routes.

const LAT0 = 35, LON0 = -112;
const MI_LON = 69 * Math.cos(LAT0 * Math.PI / 180), MI_LAT = 69;
// map miles: x east, y south
export const toMap = (lat, lon) => [(lon - LON0) * MI_LON, (LAT0 - lat) * MI_LAT];

// type: city (depot, rental, motel), town (stop, gas), junction
// lx/ly = label offset on the paper map
export const NODES = {
  needles: { name: 'NEEDLES', st: 'CA', lat: 34.848, lon: -114.614, type: 'city', lx: -8, ly: 6 },
  j95: { name: 'I-40/AZ-95', lat: 34.712, lon: -114.43, type: 'junction' },
  havasu: { name: 'LAKE HAVASU CITY', lat: 34.483, lon: -114.322, type: 'city', lx: 6, ly: 2 },
  bullhead: { name: 'BULLHEAD CITY', lat: 35.147, lon: -114.568, type: 'town', lx: -16, ly: -9 },
  kingman: { name: 'KINGMAN', lat: 35.189, lon: -114.053, type: 'city', lx: 6, ly: 2 },
  peach: { name: 'PEACH SPRINGS', lat: 35.529, lon: -113.425, type: 'town', lx: -20, ly: -9 },
  seligman: { name: 'SELIGMAN', lat: 35.326, lon: -112.874, type: 'town', lx: -14, ly: 5 },
  ashfork: { name: 'ASH FORK', lat: 35.225, lon: -112.484, type: 'town', lx: -16, ly: 5 },
  williams: { name: 'WILLIAMS', lat: 35.25, lon: -112.191, type: 'city', lx: -14, ly: -9 },
  flagstaff: { name: 'FLAGSTAFF', lat: 35.198, lon: -111.651, type: 'city', lx: 5, ly: -3 },
  winslow: { name: 'WINSLOW', lat: 35.024, lon: -110.697, type: 'town', lx: -12, ly: 5 },
  holbrook: { name: 'HOLBROOK', lat: 34.902, lon: -110.158, type: 'city', lx: -14, ly: 5 },
  valle: { name: 'VALLE', lat: 35.653, lon: -112.139, type: 'town', lx: 5, ly: -2 },
  canyon: { name: 'GRAND CANYON', lat: 36.054, lon: -112.139, type: 'city', lx: -22, ly: -9 },
  cameron: { name: 'CAMERON', lat: 35.876, lon: -111.413, type: 'town', lx: 5, ly: -2 },
  page: { name: 'PAGE', lat: 36.914, lon: -111.456, type: 'city', lx: 5, ly: -2 },
  sedona: { name: 'SEDONA', lat: 34.87, lon: -111.761, type: 'town', lx: 5, ly: -3 },
  cottonwood: { name: 'COTTONWOOD', lat: 34.739, lon: -112.01, type: 'town', lx: -22, ly: -9 },
  prescott: { name: 'PRESCOTT', lat: 34.54, lon: -112.469, type: 'city', lx: -34, ly: -2 },
  campverde: { name: 'CAMP VERDE', lat: 34.563, lon: -111.854, type: 'town', lx: 5, ly: -2 },
  cordes: { name: 'CORDES JCT', lat: 34.33, lon: -112.12, type: 'junction' },
  wickenburg: { name: 'WICKENBURG', lat: 33.969, lon: -112.73, type: 'town', lx: -22, ly: 5 },
  phoenix: { name: 'PHOENIX', lat: 33.448, lon: -112.074, type: 'city', lx: 6, ly: -2 },
};
for (const [id, n] of Object.entries(NODES)) { n.id = id; [n.x, n.y] = toMap(n.lat, n.lon); }

// [from, to, highway, interior points [lat, lon], detour factor]
const ROAD_DATA = [
  ['needles', 'j95', 'I-40', [[34.76, -114.52]]],
  ['j95', 'kingman', 'I-40', [[34.87, -114.14]]],
  ['j95', 'havasu', 'AZ-95', [[34.6, -114.35]]],
  ['kingman', 'bullhead', 'AZ-68', [[35.22, -114.4]], 1.15],
  ['bullhead', 'needles', 'AZ-95', [[34.98, -114.58]]],
  ['kingman', 'seligman', 'I-40', [[35.22, -113.75], [35.27, -113.3]]],
  ['kingman', 'peach', 'US-66', [[35.37, -113.73], [35.49, -113.56]]],
  ['peach', 'seligman', 'US-66', [[35.48, -113.2]]],
  ['seligman', 'ashfork', 'I-40', [[35.28, -112.68]]],
  ['ashfork', 'williams', 'I-40', []],
  ['williams', 'flagstaff', 'I-40', [[35.22, -111.95]]],
  ['flagstaff', 'winslow', 'I-40', [[35.13, -111.3], [35.05, -110.95]]],
  ['winslow', 'holbrook', 'I-40', []],
  ['williams', 'valle', 'AZ-64', [[35.45, -112.17]]],
  ['valle', 'canyon', 'AZ-64', [[35.97, -112.13]]],
  ['flagstaff', 'valle', 'US-180', [[35.33, -111.73], [35.55, -111.98]], 1.12],
  ['canyon', 'cameron', 'AZ-64', [[36.04, -111.83], [35.95, -111.6]], 1.12],
  ['flagstaff', 'cameron', 'US-89', [[35.35, -111.55], [35.6, -111.5]]],
  ['cameron', 'page', 'US-89', [[36.32, -111.47], [36.62, -111.65], [36.8, -111.55]]],
  ['flagstaff', 'sedona', 'AZ-89A', [[35.1, -111.72], [34.98, -111.74]], 1.25],
  ['sedona', 'cottonwood', 'AZ-89A', [[34.8, -111.9]]],
  ['cottonwood', 'prescott', 'AZ-89A', [[34.75, -112.11], [34.62, -112.33]], 1.3],
  ['flagstaff', 'campverde', 'I-17', [[34.98, -111.68], [34.75, -111.78]]],
  ['campverde', 'cordes', 'I-17', [[34.35, -111.98]]],
  ['cordes', 'phoenix', 'I-17', [[34.0, -112.13], [33.75, -112.1]]],
  ['prescott', 'cordes', 'AZ-69', [[34.47, -112.27]]],
  ['ashfork', 'prescott', 'AZ-89', [[34.95, -112.47], [34.76, -112.45]]],
  ['prescott', 'wickenburg', 'US-89', [[34.38, -112.62], [34.22, -112.75]], 1.15],
  ['wickenburg', 'phoenix', 'US-60', [[33.8, -112.55], [33.6, -112.3]]],
  ['kingman', 'wickenburg', 'US-93', [[34.95, -113.9], [34.7, -113.61], [34.35, -113.3], [34.1, -112.95]]],
];

export const ROADS = ROAD_DATA.map(([a, b, hw, pts, det], i) => {
  const A = NODES[a], B = NODES[b];
  const poly = [[A.x, A.y], ...pts.map(([la, lo]) => toMap(la, lo)), [B.x, B.y]];
  let len = 0;
  for (let k = 1; k < poly.length; k++) len += Math.hypot(poly[k][0] - poly[k - 1][0], poly[k][1] - poly[k - 1][1]);
  return { id: i, a, b, hw, poly, miles: Math.round(len * (det || 1.08)) };
});

// outgoing directed edges from a node
export function outEdges(node) {
  const res = [];
  for (const r of ROADS) {
    if (r.a === node) res.push({ road: r, from: r.a, to: r.b, rev: false });
    if (r.b === node) res.push({ road: r, from: r.b, to: r.a, rev: true });
  }
  return res;
}
export const edgePoly = e => e.rev ? [...e.road.poly].reverse() : e.road.poly;
export const heading = (p, q) => Math.atan2(q[0] - p[0], -(q[1] - p[1])); // compass radians, 0 = north
export const normAng = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export const startHeading = e => { const p = edgePoly(e); return heading(p[0], p[1]); };
export const endHeading = e => { const p = edgePoly(e); return heading(p[p.length - 2], p[p.length - 1]); };

// Dijkstra by road miles. Returns a list of directed edges.
export function shortestPath(from, to) {
  if (from === to) return [];
  const dist = { [from]: 0 }, prev = {}, done = new Set();
  while (true) {
    let u = null;
    for (const k in dist) if (!done.has(k) && (u === null || dist[k] < dist[u])) u = k;
    if (u === null) return null;
    if (u === to) break;
    done.add(u);
    for (const e of outEdges(u)) {
      const nd = dist[u] + e.road.miles;
      if (dist[e.to] === undefined || nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = e; }
    }
  }
  const path = [];
  for (let n = to; n !== from; n = prev[n].from) path.unshift(prev[n]);
  return path;
}
export const pathMiles = path => path.reduce((s, e) => s + e.road.miles, 0);
export const pathVia = path => [...new Set(path.map(e => e.road.hw))].join(', ');

// ---------- landscape: nearest biome anchors (lat, lon) ----------
const ANCHORS = [
  ['desert', 35.19, -114.05], ['desert', 34.85, -114.61], ['desert', 35.15, -114.57], ['desert', 34.48, -114.32],
  ['desert', 34.7, -113.61], ['desert', 35.37, -113.73], ['desert', 34.72, -114.45], ['desert', 34.95, -113.9],
  ['sonoran', 33.45, -112.07], ['sonoran', 33.97, -112.73], ['sonoran', 34.1, -112.95], ['sonoran', 33.75, -112.1],
  ['sonoran', 34.35, -113.3], ['sonoran', 33.7, -112.45],
  ['plains', 35.33, -112.88], ['plains', 35.65, -112.14], ['plains', 35.02, -110.7], ['plains', 34.9, -110.16],
  ['plains', 34.33, -112.12], ['plains', 35.48, -113.2], ['plains', 34.76, -112.45], ['plains', 35.45, -112.17],
  ['plains', 35.08, -110.95], ['plains', 35.55, -111.98],
  ['woodland', 35.22, -112.48], ['woodland', 35.28, -112.68], ['woodland', 34.56, -111.85], ['woodland', 34.74, -112.01],
  ['woodland', 35.95, -111.6], ['woodland', 34.47, -112.27], ['woodland', 34.95, -112.47], ['woodland', 34.35, -111.98],
  ['woodland', 34.22, -112.75],
  ['forest', 35.25, -112.19], ['forest', 35.2, -111.65], ['forest', 35.22, -111.95], ['forest', 35.33, -111.73],
  ['forest', 36.05, -112.14], ['forest', 35.97, -112.13], ['forest', 34.54, -112.47], ['forest', 34.98, -111.68],
  ['forest', 35.1, -111.72], ['forest', 35.35, -111.55], ['forest', 34.62, -112.33], ['forest', 36.04, -111.83],
  ['mesa', 34.87, -111.76], ['mesa', 35.88, -111.41], ['mesa', 36.91, -111.46], ['mesa', 36.32, -111.47],
  ['mesa', 36.62, -111.65], ['mesa', 35.53, -113.42], ['mesa', 35.49, -113.56], ['mesa', 35.68, -111.47],
  ['mesa', 34.95, -109.9], ['mesa', 34.8, -111.9],
].map(([b, la, lo]) => { const [x, y] = toMap(la, lo); return { b, x, y }; });

const BLEND_MI = 14;
export function biomeAtMap(x, y) {
  let best = null, bd = 1e9;
  for (const a of ANCHORS) { const d = Math.hypot(a.x - x, a.y - y); if (d < bd) { bd = d; best = a; } }
  let other = null, od = 1e9;
  for (const a of ANCHORS) { if (a.b === best.b) continue; const d = Math.hypot(a.x - x, a.y - y); if (d < od) { od = d; other = a; } }
  const t = Math.max(0, 0.5 - (od - bd) / BLEND_MI);
  return { a: best.b, b: other ? other.b : best.b, t };
}

// ---------- bus jobs: daily departures ----------
export const JOBS = [
  { id: 'r66w', name: 'ROUTE 66 WEST', stops: ['flagstaff', 'williams', 'ashfork', 'seligman', 'peach', 'kingman'], dep: 15.5 },
  { id: 'r66e', name: 'ROUTE 66 EAST', stops: ['kingman', 'peach', 'seligman', 'ashfork', 'williams', 'flagstaff'], dep: 9.5 },
  { id: 'gcs', name: 'CANYON SHUTTLE', stops: ['flagstaff', 'valle', 'canyon'], dep: 8.25 },
  { id: 'gcr', name: 'CANYON RETURN', stops: ['canyon', 'valle', 'williams'], dep: 16 },
  { id: 'i17s', name: 'I-17 EXPRESS', stops: ['flagstaff', 'campverde', 'phoenix'], dep: 10 },
  { id: 'i17n', name: 'MOGOLLON RIM RUN', stops: ['phoenix', 'campverde', 'flagstaff'], dep: 14 },
  { id: 'dsrt', name: 'DESERT RUN', stops: ['kingman', 'wickenburg', 'phoenix'], dep: 12 },
  { id: 'dsrtn', name: 'JOSHUA TREE LINE', stops: ['phoenix', 'wickenburg', 'kingman'], dep: 8 },
  { id: 'pnt', name: 'PAINTED DESERT', stops: ['flagstaff', 'winslow', 'holbrook'], dep: 13 },
  { id: 'pntw', name: 'PETRIFIED FOREST', stops: ['holbrook', 'winslow', 'flagstaff'], dep: 8 },
  { id: 'river', name: 'RIVER RUN', stops: ['kingman', 'bullhead', 'needles'], dep: 11 },
  { id: 'lake', name: 'LAKE LINE', stops: ['needles', 'havasu'], dep: 15 },
  { id: 'lakeb', name: 'LONDON BRIDGE RUN', stops: ['havasu', 'kingman'], dep: 9 },
  { id: 'north', name: 'NORTHERN LINE', stops: ['flagstaff', 'cameron', 'page'], dep: 7 },
  { id: 'norths', name: 'LAKE POWELL RUN', stops: ['page', 'cameron', 'flagstaff'], dep: 15 },
  { id: 'red', name: 'RED ROCK', stops: ['flagstaff', 'sedona', 'cottonwood', 'prescott'], dep: 12 },
  { id: 'redn', name: 'VERDE VALLEY', stops: ['prescott', 'ashfork', 'williams'], dep: 9 },
];
for (const j of JOBS) {
  j.path = [];
  for (let i = 1; i < j.stops.length; i++) j.path.push(...shortestPath(j.stops[i - 1], j.stops[i]));
  j.miles = pathMiles(j.path);
  j.pay = Math.round(35 + j.miles * 0.42);
}

// paper-map geography (lat, lon)
export const GEO = {
  azBorder: [[37, -114.05], [37, -109.05], [33.0, -109.05]],
  nvBorder: [[37, -114.05], [36.2, -114.05], [36.1, -114.74]],
  caBorder: [[35.0, -114.63], [34.3, -114.13], [33.0, -114.7]],
  colorado: [[36.95, -111.45], [36.6, -111.75], [36.25, -111.85], [36.12, -112.1], [36.3, -112.5], [36.2, -113.0], [36.0, -113.6], [36.1, -114.0], [36.1, -114.74],
    [35.6, -114.66], [35.15, -114.6], [34.85, -114.6], [34.65, -114.45], [34.4, -114.2], [34.0, -114.5], [33.0, -114.6]],
  lakes: [[36.15, -114.4, 7, 3], [36.95, -111.45, 6, 2.5], [34.45, -114.27, 2, 4]],
  canyon: [[36.25, -111.85], [36.12, -112.1], [36.3, -112.5], [36.2, -113.0], [36.0, -113.6]],
  labels: [['CALIFORNIA', 34.2, -114.85], ['NEVADA', 36.6, -114.6], ['UTAH', 37.12, -111.0], ['A R I Z O N A', 34.0, -110.8], ['GRAND CANYON', 36.38, -112.55],
    ['LAKE MEAD', 36.3, -114.35], ['LAKE POWELL', 37.05, -111.3], ['MOGOLLON RIM', 34.42, -111.25], ['PAINTED DESERT', 35.6, -110.8], ['NAVAJO NATION', 36.3, -110.4]],
};
