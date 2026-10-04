// World: map generation, tiles, resource nodes, spatial grid, ground chunk cache, minimap.
(() => {
'use strict';

const T = S.TILE, N = S.MAP;
const GRASS = 0, WATER = 1, SAND = 2, DIRT = 3;
S.TILES = { GRASS, WATER, SAND, DIRT };
const CELL = 160;
const COLS = Math.ceil(S.WORLD / CELL);

S.genWorld = seed => {
  const rand = S.rng(seed);
  const w = { seed, tiles: new Uint8Array(N * N), res: [], grid: Array.from({ length: COLS * COLS }, () => []), dirty: new Set() };
  // camps
  const pT = { x: 55, y: 58 };
  const ang = rand() * Math.PI * 2;
  const rT = { x: Math.round(S.clamp(pT.x + Math.cos(ang) * 38, 14, N - 14)), y: Math.round(S.clamp(pT.y + Math.sin(ang) * 38, 14, N - 14)) };
  w.camps = { p: { x: (pT.x + .5) * T, y: (pT.y + .5) * T }, r: { x: (rT.x + .5) * T, y: (rT.y + .5) * T } };
  const campDist = (x, y) => Math.min(Math.hypot(x - pT.x, y - pT.y), Math.hypot(x - rT.x, y - rT.y));

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const n = S.fbm(x / 13, y / 13, seed);
    const dc = campDist(x, y);
    let t = GRASS;
    if (n < .31 && dc > 18) t = WATER;
    if (x < 1 || y < 1 || x >= N - 1 || y >= N - 1) t = WATER;
    if (dc < 5.5) t = DIRT;
    w.tiles[y * N + x] = t;
  }
  for (let y = 1; y < N - 1; y++) for (let x = 1; x < N - 1; x++) {
    const i = y * N + x; if (w.tiles[i] !== GRASS) continue;
    if (w.tiles[i - 1] === WATER || w.tiles[i + 1] === WATER || w.tiles[i - N] === WATER || w.tiles[i + N] === WATER) w.tiles[i] = SAND;
  }

  const add = (kind, x, y) => {
    const r = { id: w.res.length, kind, x, y, v: rand(), state: 'ok', timer: 0 };
    if (kind === 'tree') { r.amt = r.max = 3; r.hp = 3; }
    if (kind === 'rock') { r.amt = r.max = 6 + Math.floor(rand() * 6); }
    if (kind === 'bush') { r.amt = r.max = 4; }
    w.res.push(r);
    w.grid[Math.floor(y / CELL) * COLS + Math.floor(x / CELL)].push(r);
  };
  // keep every camp plot (wonders and farms sit outside the wall) clear of trees and rocks
  const spots = [];
  for (const c of [pT, rT]) for (const l of S.LAYOUT) spots.push({ x: c.x + l.dx / T, y: c.y + l.dy / T, r: l.type.startsWith('wonder') ? 4.5 : l.type === 'farm' ? 4 : 2.5 });
  const onPlot = (tx, ty) => spots.some(p => Math.hypot(tx - p.x, ty - p.y) < p.r);
  const free = (tx, ty) => tx > 1 && ty > 1 && tx < N - 2 && ty < N - 2 && w.tiles[ty * N + tx] === GRASS && !onPlot(tx, ty);
  const taken = new Set();
  const place = (kind, tx, ty) => {
    const k = ty * N + tx; if (taken.has(k) || !free(tx, ty)) return false;
    taken.add(k); add(kind, (tx + .2 + rand() * .6) * T, (ty + .25 + rand() * .55) * T); return true;
  };

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (!free(x, y) || campDist(x, y) < 10) continue;
    const forest = S.fbm(x / 9 + 50, y / 9 + 50, seed + 1);
    const rocky = S.fbm(x / 7 + 200, y / 7, seed + 2);
    if (forest > .56 ? rand() < .78 : rand() < .025) place('tree', x, y);
    else if (rocky > .7 ? rand() < .3 : rand() < .004) place('rock', x, y);
    else if (rand() < (forest > .46 ? .05 : .012)) place('bush', x, y);
  }
  // guaranteed starter resources around both camps
  for (const c of [pT, rT]) {
    for (let i = 0; i < 48; i++) { const a = rand() * 6.283, r = 10 + rand() * 4; place('tree', Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r)); }
    for (let i = 0; i < 6; i++) { const a = rand() * 6.283, r = 11 + rand() * 3; place('rock', Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r)); }
    for (let i = 0; i < 8; i++) { const a = rand() * 6.283, r = 10 + rand() * 3; place('bush', Math.round(c.x + Math.cos(a) * r), Math.round(c.y + Math.sin(a) * r)); }
  }
  // wild spawn spots: forest tiles far from camps
  w.wildSpots = [];
  for (let i = 0; i < 400 && w.wildSpots.length < 60; i++) {
    const x = 3 + Math.floor(rand() * (N - 6)), y = 3 + Math.floor(rand() * (N - 6));
    if (free(x, y) && campDist(x, y) > 16) w.wildSpots.push({ x: (x + .5) * T, y: (y + .5) * T });
  }
  return w;
};

S.tileAt = (x, y) => {
  const tx = Math.floor(x / T), ty = Math.floor(y / T);
  if (tx < 0 || ty < 0 || tx >= N || ty >= N) return WATER;
  return S.world.tiles[ty * N + tx];
};
S.isWater = (x, y) => S.tileAt(x, y) === WATER;

S.forResNear = (x, y, r, fn) => {
  const g = S.world.grid;
  const c0 = Math.max(0, Math.floor((x - r) / CELL)), c1 = Math.min(COLS - 1, Math.floor((x + r) / CELL));
  const r0 = Math.max(0, Math.floor((y - r) / CELL)), r1 = Math.min(COLS - 1, Math.floor((y + r) / CELL));
  for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) for (const res of g[cy * COLS + cx]) fn(res);
};
S.resReady = r => r.state === 'ok' && r.amt > 0;
S.nearestRes = (x, y, kind, maxR, filter) => {
  let best = null, bd = Infinity;
  for (let rad = 200; rad <= maxR + 199; rad += 200) {
    S.forResNear(x, y, Math.min(rad, maxR), r => {
      if (r.kind !== kind || !S.resReady(r) || (filter && !filter(r))) return;
      const d = S.dist2(x, y, r.x, r.y); if (d < bd && d <= maxR * maxR) { bd = d; best = r; }
    });
    if (best) return best;
  }
  return best;
};

// Called when a node is used up; it regrows on a timer.
S.depleteRes = r => {
  if (r.kind === 'tree') { r.state = 'fall'; r.timer = .7; }
  else if (r.kind === 'rock') { r.state = 'gone'; r.timer = 240; }
  else { r.state = 'empty'; r.timer = 70; }
  S.world.dirty.add(r);
  S.minimapDirty = true;
};
S.updateResources = dt => {
  for (const r of S.world.dirty) {
    r.timer -= dt;
    if (r.timer > 0) continue;
    if (r.state === 'fall') { r.state = 'stump'; r.timer = 160; continue; }
    if (r.state === 'stump') { r.state = 'grow'; r.timer = 25; continue; }
    r.state = 'ok'; r.amt = r.max; if (r.kind === 'tree') r.hp = 3;
    S.world.dirty.delete(r); S.minimapDirty = true;
  }
};

// ---------- pathfinding around water ----------
S.clearLine = (x0, y0, x1, y1) => {
  const d = Math.hypot(x1 - x0, y1 - y0), n = Math.ceil(d / 16);
  for (let i = 1; i < n; i++) if (S.isWater(x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)) return false;
  return true;
};
const gScore = new Float32Array(N * N), came = new Int32Array(N * N), closed = new Uint8Array(N * N);
const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, 1.414], [1, -1, 1.414], [-1, 1, 1.414], [-1, -1, 1.414]];
S.findPath = (x0, y0, x1, y1) => {
  const tiles = S.world.tiles;
  const sx = S.clamp(Math.floor(x0 / T), 0, N - 1), sy = S.clamp(Math.floor(y0 / T), 0, N - 1);
  const ex = S.clamp(Math.floor(x1 / T), 0, N - 1), ey = S.clamp(Math.floor(y1 / T), 0, N - 1);
  const start = sy * N + sx, goal = ey * N + ex;
  gScore.fill(Infinity); closed.fill(0); came.fill(-1);
  const heap = [[0, start]]; gScore[start] = 0;
  const h = i => Math.hypot(i % N - ex, Math.floor(i / N) - ey);
  const push = it => { heap.push(it); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { const l = i * 2 + 1, r = l + 1; let m = i; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  let best = start, bestH = h(start), iter = 0;
  while (heap.length && iter++ < 7000) {
    const [, cur] = pop();
    if (closed[cur]) continue; closed[cur] = 1;
    if (cur === goal) { best = goal; break; }
    const hc = h(cur); if (hc < bestH) { bestH = hc; best = cur; }
    const cx = cur % N, cy = Math.floor(cur / N);
    for (const [dx, dy, c] of DIRS) {
      const nx = cx + dx, ny = cy + dy; if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
      const ni = ny * N + nx; if (tiles[ni] === WATER || closed[ni]) continue;
      if (dx && dy && (tiles[cy * N + nx] === WATER || tiles[ny * N + cx] === WATER)) continue; // no corner cutting
      const g = gScore[cur] + c; if (g >= gScore[ni]) continue;
      gScore[ni] = g; came[ni] = cur; push([g + h(ni), ni]);
    }
  }
  const out = [];
  for (let i = best; i !== -1 && i !== start; i = came[i]) out.push({ x: (i % N + .5) * T, y: (Math.floor(i / N) + .5) * T });
  out.reverse();
  // drop waypoints we can see past
  const pts = []; let from = { x: x0, y: y0 };
  for (let i = 0; i < out.length; i++) { const nxt = out[i + 1]; if (nxt && S.clearLine(from.x, from.y, nxt.x, nxt.y)) continue; pts.push(out[i]); from = out[i]; }
  return pts;
};

// ---------- ground rendering (cached chunks) ----------
const CHUNK = 10; // tiles
const chunkCache = new Map();
const GRASS_A = [104, 160, 70], GRASS_B = [134, 184, 84];
S.groundChunk = (cx, cy, q) => {
  const key = cx + ',' + cy + ',' + q;
  let c = chunkCache.get(key);
  if (c) { chunkCache.delete(key); chunkCache.set(key, c); return c; }
  const size = CHUNK * T;
  c = document.createElement('canvas'); c.width = c.height = Math.ceil(size * q);
  const g = c.getContext('2d'); g.scale(q, q);
  const seed = S.world.seed;
  const x0 = cx * CHUNK, y0 = cy * CHUNK;
  // grass base, per tile shade
  for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) {
    const wx = x0 + tx, wy = y0 + ty;
    const n = S.fbm(wx / 6, wy / 6, seed + 9);
    const k = S.clamp((n - .3) / .45, 0, 1);
    g.fillStyle = `rgb(${GRASS_A.map((v, i) => Math.round(v + (GRASS_B[i] - v) * k)).join(',')})`;
    g.fillRect(tx * T - .5, ty * T - .5, T + 1, T + 1);
  }
  // rounded blobs for sand, dirt, water (one tile margin so neighbours bleed in)
  const blob = (type, color, r) => {
    g.fillStyle = color; g.beginPath();
    for (let ty = -1; ty <= CHUNK; ty++) for (let tx = -1; tx <= CHUNK; tx++) {
      const wx = x0 + tx, wy = y0 + ty; if (wx < 0 || wy < 0 || wx >= N || wy >= N) continue;
      const t = S.world.tiles[wy * N + wx];
      if (t === type || (type === SAND && t === WATER)) { g.moveTo((tx + .5) * T + r, (ty + .5) * T); g.arc((tx + .5) * T, (ty + .5) * T, r, 0, 6.283); }
    }
    g.fill();
  };
  blob(SAND, '#d8c690', T * .78);
  blob(DIRT, '#b39668', T * .8);
  blob(WATER, '#3b83c4', T * .74);
  // details
  for (let ty = 0; ty < CHUNK; ty++) for (let tx = 0; tx < CHUNK; tx++) {
    const wx = x0 + tx, wy = y0 + ty, t = S.world.tiles[wy * N + wx];
    const h = i => S.hash2(wx * 7 + i, wy * 13 + i, seed);
    if (t === GRASS) {
      g.strokeStyle = 'rgba(60,110,40,.55)'; g.lineWidth = 1.4; g.beginPath();
      for (let i = 0; i < 3; i++) { const px = tx * T + h(i) * T, py = ty * T + h(i + 9) * T; g.moveTo(px, py); g.lineTo(px - 2, py - 5); g.moveTo(px, py); g.lineTo(px + 2, py - 5); }
      g.stroke();
      if (h(20) < .08) { g.fillStyle = ['#f4e36b', '#f7f2f0', '#d97ab8'][Math.floor(h(21) * 3)]; for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(tx * T + h(22 + i) * T, ty * T + h(30 + i) * T, 2, 0, 6.283); g.fill(); } }
    } else if (t === DIRT) {
      g.fillStyle = 'rgba(120,96,64,.5)';
      for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(tx * T + h(i) * T, ty * T + h(i + 5) * T, 1.5 + h(i + 11) * 2, 0, 6.283); g.fill(); }
    } else if (t === WATER) {
      g.strokeStyle = 'rgba(200,230,255,.35)'; g.lineWidth = 1.5;
      if (h(3) < .4) { const px = tx * T + h(4) * T * .6, py = ty * T + h(5) * T; g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo(px + 6, py - 3, px + 12, py); g.stroke(); }
    }
  }
  chunkCache.set(key, c);
  if (chunkCache.size > 48) chunkCache.delete(chunkCache.keys().next().value);
  return c;
};
S.CHUNK_PX = CHUNK * T;
S.clearGroundCache = () => chunkCache.clear();

// ---------- minimap ----------
S.minimap = null; S.minimapDirty = true;
S.renderMinimap = () => {
  if (!S.minimap) { S.minimap = document.createElement('canvas'); S.minimap.width = S.minimap.height = N * 2; }
  const g = S.minimap.getContext('2d');
  const col = ['#7cb35a', '#3b83c4', '#d8c690', '#b39668'];
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { g.fillStyle = col[S.world.tiles[y * N + x]]; g.fillRect(x * 2, y * 2, 2, 2); }
  for (const r of S.world.res) {
    if (r.state !== 'ok') continue;
    g.fillStyle = r.kind === 'tree' ? '#2f6b2a' : r.kind === 'rock' ? '#8d8f94' : '#b8404a';
    g.fillRect(r.x / T * 2 - 1, r.y / T * 2 - 1, 2, 2);
  }
  S.minimapDirty = false;
};
})();
