// Hi-detail pixel art: 90s cars, Route 66 buildings and trees. Drawn at native resolution.
import { makeCanvas, mulberry, rect, px, line, ellipse, circle, poly, shade, ditherV } from './gfx.js';
import { drawText, textWidth } from './font.js';

export function pair(w, h) {
  const [c, x] = makeCanvas(w, h);
  const [g, gx] = makeCanvas(w, h);
  return { c, x, g, gx, both(fn) { fn(x); fn(gx); } };
}
const clear = (x, x0, y0, w = 1, h = 1) => x.clearRect(x0, y0, w, h);
function vshade(x, x0, y0, w, h, base, hi = 0.2, lo = -0.3) {
  if (w <= 0 || h <= 0) return;
  ditherV(x, Math.round(x0), Math.round(y0), Math.round(w), Math.round(h), [shade(base, hi), base, base, shade(base, lo)]);
}
function chrome(x, x0, y0, w, h) { ditherV(x, x0, y0, w, h, ['#f4f4f4', '#b8b8bc', '#78787e', '#a8a8ae']); }
function glass(x, x0, y0, w, h, light) {
  ditherV(x, x0, y0, w, h, light ? ['#c8dcec', '#8aa8c4', '#5a7896', '#40566e'] : ['#4a5a6c', '#2a3440', '#1a2028']);
}

// ======================= CARS =======================
const CAR_DIMS = { sedan: [64, 40], wagon: [64, 42], pickup: [64, 46], van: [64, 54], semi: [76, 96], rv: [76, 84] };

export function carHi(type, view, col, seed) {
  const r = mulberry(seed);
  const [W, H] = CAR_DIMS[type];
  const p = pair(W, H);
  const { x, gx } = p;
  const lt = shade(col, 0.22), dk = shade(col, -0.3), dd = shade(col, -0.5);
  const lights = [];
  const rear = view === 'rear';
  const lamp = (lx, ly, lw, lh, kind) => {
    const c = kind === 'tail' ? ['#8a1018', '#c8202a', '#ff6a6a'] : kind === 'amber' ? ['#8a5a10', '#e8a02a', '#ffd88a'] : ['#8a8a80', '#e8e8dc', '#ffffff'];
    rect(x, lx, ly, lw, lh, c[0]); rect(x, lx + 1, ly + 1, lw - 2, lh - 2, c[1]); rect(x, lx + 1, ly + 1, lw - 2, 1, c[2]);
    rect(gx, lx, ly, lw, lh, kind === 'tail' ? '#ff3a30' : kind === 'amber' ? '#ffb030' : '#fffbe8');
    if (kind !== 'amber') lights.push({ x: (lx + lw / 2) / W, y: (ly + lh / 2) / H });
  };
  // ground shadow
  x.fillStyle = 'rgba(0,0,0,0.4)'; x.fillRect(3, H - 3, W - 6, 3); x.fillRect(6, H - 4, W - 12, 1);
  const tire = (tx, ty, tw, th) => { rect(x, tx, ty, tw, th, '#121212'); rect(x, tx, ty, tw, 1, '#2e2e2e'); for (let yy = ty + 2; yy < ty + th; yy += 2) rect(x, tx + 1, yy, tw - 2, 1, '#1c1c1c'); };

  if (type === 'semi') {
    if (rear) {
      tire(5, 76, 17, 17); tire(W - 22, 76, 17, 17);
      ditherV(x, 2, 0, W - 4, 76, ['#f2f2ea', '#dcdcd4', '#c4c4bc', '#aeaea6']);
      for (let xx = 10; xx < W - 6; xx += 8) rect(x, xx, 2, 1, 72, 'rgba(0,0,0,0.08)');
      rect(x, 2, 0, W - 4, 2, '#8a8a84'); rect(x, 2, 0, 2, 76, '#9a9a94'); rect(x, W - 4, 0, 2, 76, '#7a7a74');
      rect(x, W / 2 - 1, 3, 2, 70, '#6a6a64');
      for (const hx of [4, W - 8]) for (const hy of [8, 28, 48, 66]) rect(x, hx, hy, 4, 4, '#5a5a54');
      for (const bx of [22, 30, 44, 52]) { chrome(x, bx, 4, 2, 70); rect(x, bx - 2, 36, 6, 3, '#8a8a8a'); }
      for (const mx of [6, 36, 38, 40, W - 8]) { rect(x, mx, 1, 2, 2, '#e8a02a'); rect(gx, mx, 1, 2, 2, '#ffb030'); }
      rect(x, 0, 74, W, 5, '#2a2a2a');
      lamp(4, 75, 8, 4, 'tail'); lamp(W - 12, 75, 8, 4, 'tail'); lamp(14, 75, 5, 4, 'amber'); lamp(W - 19, 75, 5, 4, 'amber');
      chrome(x, 12, 84, W - 24, 3);
      rect(x, 3, 80, 11, 13, '#0e0e0e'); rect(x, W - 14, 80, 11, 13, '#0e0e0e');
      rect(x, 4, 90, 9, 1, '#5a5a5a'); rect(x, W - 13, 90, 9, 1, '#5a5a5a');
    } else {
      tire(7, 78, 15, 15); tire(W - 22, 78, 15, 15);
      vshade(x, 6, 14, W - 12, 60, col);
      vshade(x, 10, 1, W - 20, 15, lt, 0.15, -0.1); rect(x, 12, 0, W - 24, 1, lt);
      for (let i = 0; i < 5; i++) { rect(x, 18 + i * 9, 0, 3, 2, '#e8a02a'); rect(gx, 18 + i * 9, 0, 3, 2, '#ffb030'); }
      rect(x, 8, 15, W - 16, 4, dd);
      glass(x, 10, 19, 26, 17, true); glass(x, 40, 19, 26, 17, true); rect(x, 36, 19, 4, 17, dk);
      line(x, 14, 34, 24, 20, 'rgba(255,255,255,0.35)'); line(x, 44, 34, 54, 20, 'rgba(255,255,255,0.35)');
      rect(x, 20, 30, 8, 6, '#141820');
      chrome(x, 23, 40, 30, 32);
      for (let xx = 25; xx < 52; xx += 3) rect(x, xx, 42, 1, 28, '#3a3a3e');
      rect(x, 23, 40, 30, 1, '#ffffff');
      lamp(9, 52, 12, 8, 'head'); lamp(W - 21, 52, 12, 8, 'head'); lamp(9, 61, 12, 3, 'amber'); lamp(W - 21, 61, 12, 3, 'amber');
      chrome(x, 0, 6, 4, 46); chrome(x, W - 4, 6, 4, 46); rect(x, 0, 6, 4, 2, '#222'); rect(x, W - 4, 6, 4, 2, '#222');
      rect(x, 1, 20, 5, 18, '#1a1a1a'); rect(x, W - 6, 20, 5, 18, '#1a1a1a');
      chrome(x, 2, 72, W - 4, 7);
    }
  } else if (type === 'rv') {
    tire(7, 70, 14, 13); tire(W - 21, 70, 14, 13);
    ditherV(x, 2, 2, W - 4, 66, ['#f6f0e0', '#ece4d0', '#dcd2bc', '#c8bea8']);
    clear(x, 2, 2, 2, 1); clear(x, W - 4, 2, 2, 1);
    rect(x, 2, 36, W - 4, 4, '#7a3a1a'); rect(x, 2, 40, W - 4, 3, '#d8822a'); rect(x, 2, 43, W - 4, 2, '#e8b84a');
    if (rear) {
      glass(x, 18, 8, 40, 16, false); rect(x, 18, 8, 40, 1, '#8a8a8a');
      for (const lx of [W - 10, W - 5]) rect(x, lx, 4, 1, 58, '#9a9a9a');
      for (let yy = 8; yy < 60; yy += 6) rect(x, W - 10, yy, 6, 1, '#9a9a9a');
      circle(x, 34, 54, 12, '#2a2a2a'); circle(x, 34, 54, 9, '#3a3a3a'); circle(x, 34, 54, 4, '#8a8a8a');
      lamp(3, 48, 6, 14, 'tail'); lamp(W - 9, 48, 6, 14, 'tail');
    } else {
      glass(x, 4, 8, W - 8, 24, true); rect(x, W / 2 - 1, 8, 2, 24, '#2a2a2a');
      line(x, 10, 30, 22, 10, 'rgba(255,255,255,0.4)');
      rect(x, 22, 52, 32, 10, '#2a2a2a'); for (let yy = 53; yy < 61; yy += 2) rect(x, 23, yy, 30, 1, '#7a7a7a');
      lamp(5, 52, 14, 6, 'head'); lamp(W - 19, 52, 14, 6, 'head');
    }
    chrome(x, 0, 66, W, 5);
  } else {
    // sedan / wagon / pickup / van
    const S = {
      sedan: { roof: 4, belt: 17, bot: 33, it: 15, ib: 7 },
      wagon: { roof: 3, belt: 18, bot: 35, it: 10, ib: 6 },
      pickup: { roof: rear ? 4 : 5, belt: rear ? 20 : 20, bot: 38, it: rear ? 15 : 14, ib: rear ? 12 : 7 },
      van: { roof: 2, belt: 26, bot: 46, it: 5, ib: 3 },
    }[type];
    const { roof, belt, bot, it, ib } = S;
    const ty = bot - 4;
    tire(4, ty, 11, H - 3 - ty); tire(W - 15, ty, 11, H - 3 - ty);
    rect(x, 14, bot, W - 28, H - 3 - bot, '#0c0c0c');
    // body
    vshade(x, 1, belt, W - 2, bot - belt, col, 0.25, -0.35);
    clear(x, 1, belt); clear(x, W - 2, belt);
    rect(x, 1, belt + 1, 1, bot - belt - 1, lt); rect(x, W - 2, belt + 1, 1, bot - belt - 1, dk);
    // cabin / greenhouse
    for (let yy = roof; yy < belt; yy++) {
      const f = (yy - roof) / Math.max(1, belt - roof);
      const ins = Math.round(it + (ib - it) * f);
      rect(x, ins, yy, W - ins * 2, 1, yy === roof ? lt : col);
      px(x, ins, yy, lt); px(x, W - ins - 1, yy, dk);
    }
    const gTop = roof + 2, gBot = belt - 1;
    for (let yy = gTop; yy < gBot; yy++) {
      const f = (yy - roof) / Math.max(1, belt - roof);
      const ins = Math.round(it + (ib - it) * f) + 2;
      const k = (yy - gTop) / Math.max(1, gBot - gTop);
      const gc = rear ? (k < 0.3 ? '#4a5a6c' : k < 0.7 ? '#2a3440' : '#1e252e') : (k < 0.3 ? '#b8d0e4' : k < 0.6 ? '#7e9cb8' : '#566e88');
      rect(x, ins, yy, W - ins * 2, 1, gc);
    }
    if (type === 'van' && rear) rect(x, W / 2 - 1, gTop, 2, gBot - gTop, col);
    if (type === 'van') { rect(x, 3, belt + 2, W - 6, 1, dk); }
    // reflections
    line(x, W * 0.62, gBot - 1, W * 0.62 + (gBot - gTop) * 0.7, gTop, rear ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.4)');
    // occupants
    if (rear) {
      for (const hx of r() < 0.7 ? [0.36, 0.66] : [0.36]) { circle(x, W * hx, gBot - 3, 3, '#11161c'); rect(x, W * hx - 4, gBot - 1, 9, 2, '#11161c'); }
    } else {
      circle(x, W * 0.66, gBot - 4, 3, '#2a2a30'); rect(x, W * 0.66 - 4, gBot - 2, 9, 2, '#2a2a30');
      line(x, W * 0.28, gBot - 1, W * 0.45, gBot - 3, '#222'); line(x, W * 0.55, gBot - 1, W * 0.72, gBot - 3, '#222'); // wipers
      rect(x, ib - 4, belt - 5, 4, 3, dd); rect(x, W - ib, belt - 5, 4, 3, dd); // mirrors
    }
    rect(x, 2, belt, W - 4, 1, lt);
    if (rear) {
      rect(x, 5, belt + 4, W - 10, 1, dk); rect(x, 5, belt + 5, W - 10, 1, lt);
      if (type === 'pickup') { rect(x, 4, belt + 1, W - 8, 2, dd); rect(x, 8, belt + 8, W - 16, 1, dk); }
      if (type === 'wagon') ditherV(x, 8, belt + 6, W - 16, 7, ['#9a6a3a', '#7a4e2a', '#6a4224']);
      if (type === 'van' || type === 'pickup') { lamp(2, belt + 2, 5, 12, 'tail'); lamp(W - 7, belt + 2, 5, 12, 'tail'); }
      else { lamp(3, belt + 3, 13, 6, 'tail'); lamp(W - 16, belt + 3, 13, 6, 'tail'); lamp(13, belt + 3, 3, 6, 'amber'); lamp(W - 16, belt + 3, 3, 6, 'amber'); }
      rect(x, W / 2 - 7, bot - 10, 14, 7, '#2a2a2a'); rect(x, W / 2 - 6, bot - 9, 12, 5, '#ece6cc'); rect(x, W / 2 - 6, bot - 9, 12, 1, '#a83030');
      for (let i = 0; i < 4; i++) rect(x, W / 2 - 4 + i * 2.5, bot - 7, 1, 2, '#3a3a5a');
      rect(x, 10, bot, 4, 2, '#3a3a3a');
    } else {
      rect(x, 3, belt + 1, W - 6, 1, dk);
      lamp(4, belt + 4, 13, 5, 'head'); lamp(W - 17, belt + 4, 13, 5, 'head');
      lamp(2, belt + 4, 3, 5, 'amber'); lamp(W - 5, belt + 4, 3, 5, 'amber');
      rect(x, 18, belt + 4, W - 36, 6, '#151515');
      for (let yy = belt + 5; yy < belt + 10; yy += 2) rect(x, 19, yy, W - 38, 1, '#8a8a8e');
      rect(x, W / 2 - 1, belt + 5, 3, 3, '#d8d8d8');
      rect(x, W / 2 - 6, bot - 8, 12, 5, '#ece6cc');
    }
    if (r() < 0.65) chrome(x, 0, bot - 4, W, 4); else { rect(x, 0, bot - 4, W, 4, '#2a2a2a'); rect(x, 0, bot - 4, W, 1, '#4a4a4a'); }
  }
  return { img: p.c, glow: p.g, lights };
}

// ======================= BUILDINGS =======================
function windowHi(x, gx, wx, wy, ww, wh, lit, r, frame = '#f0ece0') {
  rect(x, wx - 1, wy - 1, ww + 2, wh + 2, frame);
  glass(x, wx, wy, ww, wh, true);
  const cur = ['#c84a3a', '#e8d8a0', '#5a8a5a', '#d8a0b0'][Math.floor(r() * 4)];
  rect(x, wx, wy, 2, wh, cur); rect(x, wx + ww - 2, wy, 2, wh, cur);
  rect(x, wx, wy + (wh >> 1), ww, 1, frame); rect(x, wx + (ww >> 1), wy, 1, wh, frame);
  rect(x, wx - 2, wy + wh + 1, ww + 4, 1, shade(frame, -0.3));
  if (lit) { rect(gx, wx, wy, ww, wh, '#ffd890'); rect(gx, wx, wy, 2, wh, '#e89a5a'); rect(gx, wx + ww - 2, wy, 2, wh, '#e89a5a'); }
}

export function houseHi(seed) {
  const r = mulberry(seed);
  const adobe = r() < 0.4;
  const W = 92, H = 66;
  const p = pair(W, H);
  const { x, gx } = p;
  if (adobe) {
    const wall = ['#d8b08a', '#c89a72', '#e0c09a', '#d0a482'][Math.floor(r() * 4)];
    vshade(x, 6, 18, 80, 46, wall, 0.08, -0.15);
    for (let i = 0; i < 160; i++) px(x, 6 + r() * 80, 18 + r() * 46, shade(wall, (r() - 0.5) * 0.2));
    rect(x, 4, 14, 84, 5, shade(wall, -0.05)); rect(x, 4, 14, 84, 1, shade(wall, 0.2));
    clear(x, 4, 14, 2, 2); clear(x, 86, 14, 2, 2);
    for (let vx = 12; vx < 84; vx += 12) { rect(x, vx, 20, 4, 3, '#5a3a20'); px(x, vx, 20, '#7a5230'); }
    rect(x, 38, 38, 14, 26, '#5a3a24'); rect(x, 39, 39, 12, 24, '#7a4e2e');
    for (let yy = 42; yy < 62; yy += 5) rect(x, 39, yy, 12, 1, '#5a3a24');
    px(x, 48, 52, '#e8c060');
    windowHi(x, gx, 14, 32, 14, 12, r() < 0.7, r, '#3a5a8a');
    windowHi(x, gx, 62, 32, 14, 12, r() < 0.7, r, '#3a5a8a');
    // chile ristra + pots
    for (let yy = 26; yy < 40; yy += 2) { px(x, 34, yy, '#c82a1a'); px(x, 35, yy + 1, '#a81a10'); }
    rect(x, 22, 58, 6, 6, '#b8603a'); rect(x, 21, 57, 8, 1, '#c8704a'); for (let i = 0; i < 6; i++) px(x, 22 + r() * 6, 52 + r() * 5, '#4a7a3a');
  } else {
    const wall = ['#c8d0d4', '#e8dcb8', '#a8c0b8', '#d8c0a8', '#f0ece0', '#b8a8c8'][Math.floor(r() * 6)];
    const roof = ['#5a4a42', '#4a4a52', '#7a4a32', '#3a4a3a'][Math.floor(r() * 4)];
    vshade(x, 8, 28, 76, 36, wall, 0.1, -0.15);
    for (let yy = 30; yy < 64; yy += 3) rect(x, 8, yy, 76, 1, shade(wall, -0.12));
    rect(x, 8, 28, 76, 2, shade(wall, -0.45)); // eave shadow
    for (let yy = 0; yy < 26; yy++) {
      const hw = Math.round((yy / 25) * 44);
      const row = yy % 3 === 0 ? shade(roof, -0.25) : roof;
      rect(x, 46 - hw, 3 + yy, hw * 2, 1, row);
      if (yy % 3 === 1) for (let xx = 46 - hw + (yy % 6 ? 2 : 5); xx < 46 + hw; xx += 6) px(x, xx, 3 + yy, shade(roof, -0.35));
    }
    line(x, 46, 2, 1, 28, '#f0ece0'); line(x, 46, 2, 91, 28, '#f0ece0');
    rect(x, 64, 0, 7, 14, '#8a4a3a'); rect(x, 63, 0, 9, 2, '#6a3a2a');
    if (r() < 0.7) { // TV antenna, very 90s
      rect(x, 30, 0, 1, 14, '#6a6a6a');
      for (let i = 0; i < 4; i++) rect(x, 25 + i, 2 + i * 2, 11 - i * 2, 1, '#7a7a7a');
    }
    windowHi(x, gx, 14, 36, 14, 14, r() < 0.7, r);
    windowHi(x, gx, 64, 36, 14, 14, r() < 0.7, r);
    if (r() < 0.5) { rect(x, 66, 50, 10, 6, '#c8c8c0'); rect(x, 66, 50, 10, 1, '#e8e8e0'); for (let i = 0; i < 4; i++) rect(x, 67 + i * 2, 52, 1, 3, '#7a7a7a'); }
    // porch
    rect(x, 34, 40, 24, 3, roof); rect(x, 35, 43, 2, 21, '#e8e4d8'); rect(x, 55, 43, 2, 21, '#e8e4d8');
    rect(x, 40, 44, 12, 20, shade(wall, -0.55)); rect(x, 41, 45, 10, 18, '#7a4a32'); px(x, 49, 54, '#e8c060');
    rect(x, 38, 63, 16, 2, '#9a9a94');
  }
  // mailbox
  rect(x, 1, 50, 1, 14, '#5a4030'); rect(x, 0, 46, 5, 4, '#4a4a52'); rect(x, 4, 45, 1, 3, '#c82a1a');
  return { img: p.c, glow: p.g };
}

export function motelHi(seed) {
  const r = mulberry(seed);
  const W = 200, H = 94;
  const p = pair(W, H);
  const { x, gx } = p;
  const wall = ['#efe2c4', '#f4cfc0', '#d8ecdc', '#f0e8d0'][Math.floor(r() * 4)];
  const trim = ['#2a9aa0', '#d8604a', '#4a8a4a', '#e8a02a'][Math.floor(r() * 4)];
  const door = ['#2a7a8a', '#b84a3a', '#3a6a3a', '#8a5a2a'][Math.floor(r() * 4)];
  // sign on a tall pole
  rect(x, 20, 34, 4, 60, '#6a6a70'); rect(x, 21, 34, 1, 60, '#9a9aa0');
  rect(x, 2, 2, 44, 34, '#1a2a3a'); rect(x, 4, 4, 40, 30, '#24486a');
  p.both(c => drawText(c, 'MOTEL', 24, 7, '#ff5a5a', 2, 'center'));
  p.both(c => drawText(c, 'VACANCY', 24, 23, '#6aff7a', 1, 'center'));
  for (let i = 0; i < 9; i++) { px(x, 6 + i * 4.5, 31, '#ffe08a'); px(gx, 6 + i * 4.5, 31, '#ffe08a'); }
  poly(x, [46, 10, 58, 18, 46, 26], '#e8a02a'); poly(gx, [46, 10, 58, 18, 46, 26], '#ffb030');
  // rooms
  vshade(x, 52, 44, 112, 48, wall, 0.08, -0.18);
  rect(x, 50, 38, 116, 6, trim); rect(x, 50, 38, 116, 1, shade(trim, 0.3)); rect(x, 50, 44, 116, 2, shade(wall, -0.45));
  for (let i = 0; i < 6; i++) {
    const dx = 56 + i * 18;
    rect(x, dx, 56, 8, 34, shade(door, -0.3)); rect(x, dx + 1, 57, 6, 33, door); px(x, dx + 6, 74, '#e8c060');
    drawText(x, String(i + 1), dx + 4, 59, '#f0e8d0', 1, 'center');
    windowHi(x, gx, dx + 10, 58, 6, 10, r() < 0.55, r, '#f0ece0');
    rect(x, dx + 10, 70, 6, 4, '#a8a8a0'); rect(x, dx + 10, 70, 6, 1, '#d8d8d0');
    rect(x, dx + 3, 48, 3, 2, '#fff2c0'); rect(gx, dx + 3, 48, 3, 2, '#fff2c0');
    rect(x, dx - 2, 46, 1, 46, '#c8c8c0');
  }
  rect(x, 52, 90, 112, 4, '#a8a49a');
  // soda machine + ice
  rect(x, 164, 62, 9, 28, '#c82a2a'); rect(x, 165, 64, 7, 10, '#f0f0f0'); rect(gx, 165, 64, 7, 10, '#ffffff');
  // office
  vshade(x, 172, 32, 28, 60, shade(wall, -0.05), 0.08, -0.18);
  rect(x, 170, 28, 30, 5, trim);
  p.both(c => drawText(c, 'OFFICE', 186, 36, '#ff8a3a', 1, 'center'));
  windowHi(x, gx, 176, 48, 20, 18, true, r);
  rect(x, 180, 72, 10, 20, '#5a3a2a');
  return { img: p.c, glow: p.g };
}

export function dinerHi(seed) {
  const r = mulberry(seed);
  const W = 140, H = 76;
  const p = pair(W, H);
  const { x, gx } = p;
  const band = ['#c8202a', '#2a8aa0', '#3a5aa8'][seed % 3];
  // roof sign
  rect(x, 34, 2, 72, 20, '#141414'); rect(x, 36, 4, 68, 16, '#1e1e1e');
  p.both(c => drawText(c, 'DINER', 70, 6, '#5ad0ff', 2, 'center'));
  rect(x, 44, 22, 2, 8, '#555'); rect(x, 94, 22, 2, 8, '#555');
  // stainless body with rounded ends
  ditherV(x, 4, 28, 132, 40, ['#fafafa', '#d4d6dc', '#a8aab2', '#c8cad0']);
  for (const [cx0, dir] of [[4, 1], [135, -1]]) for (let k = 0; k < 4; k++) clear(x, cx0 + (dir < 0 ? -k : 0), 28 + k, 4 - k, 1);
  for (let yy = 56; yy < 68; yy += 2) rect(x, 4, yy, 132, 1, '#9a9ca4');
  rect(x, 4, 50, 132, 5, band); rect(x, 4, 50, 132, 1, shade(band, 0.3));
  // windows with booths and diners
  for (let i = 0; i < 10; i++) {
    const wx = 10 + i * 12;
    if (i === 5) continue;
    glass(x, wx, 32, 10, 15, true); rect(gx, wx, 32, 10, 15, '#ffe2a0');
    rect(x, wx, 42, 10, 5, '#8a2a2a');
    if (r() < 0.55) { circle(x, wx + 5, 39, 2, ['#3a2a1a', '#e8c890', '#6a4a32', '#9a9a9a'][Math.floor(r() * 4)]); rect(x, wx + 3, 41, 5, 2, ['#2a4a8a', '#c8a03a', '#4a7a4a'][Math.floor(r() * 3)]); }
  }
  rect(x, 70, 32, 8, 34, '#6a6a72'); glass(x, 71, 34, 6, 12, true); circle(x, 74, 52, 2, '#c8c8c8');
  // checker skirt
  for (let xx = 4; xx < 136; xx += 2) for (let yy = 68; yy < 74; yy += 2) rect(x, xx, yy, 2, 2, ((xx + yy) / 2) % 2 ? '#111' : '#eee');
  return { img: p.c, glow: p.g };
}

const STORE_NAMES = ['CURIOS', 'GROCERY', 'HARDWARE', 'CAFE', 'BARBER', 'ANTIQUES', 'GIFTS', 'SALOON', 'LAUNDRY', 'VIDEO', 'TRADING POST', 'ROCK SHOP'];
export function storeHi(seed) {
  const r = mulberry(seed);
  const W = 116, H = 80;
  const p = pair(W, H);
  const { x, gx } = p;
  const wood = ['#a8744a', '#8a5a3a', '#c09a6a', '#7a8a9a', '#a85a4a'][Math.floor(r() * 5)];
  // stepped false front
  vshade(x, 0, 10, W, 70, wood, 0.12, -0.2);
  vshade(x, 20, 0, W - 40, 12, wood, 0.12, -0.05);
  for (let xx = 2; xx < W; xx += 4) rect(x, xx, 12, 1, 68, shade(wood, -0.15));
  for (let xx = 22; xx < W - 20; xx += 4) rect(x, xx, 1, 1, 10, shade(wood, -0.15));
  rect(x, 0, 10, 20, 1, shade(wood, 0.3)); rect(x, W - 20, 10, 20, 1, shade(wood, 0.3)); rect(x, 20, 0, W - 40, 1, shade(wood, 0.3));
  // sign board
  const name = STORE_NAMES[Math.floor(r() * STORE_NAMES.length)];
  const s = textWidth(name, 2) < W - 20 ? 2 : 1;
  rect(x, 8, 14, W - 16, 15, '#f2e6c8'); rect(x, 8, 14, W - 16, 1, '#fff8e0'); rect(x, 8, 28, W - 16, 1, '#a89a7a');
  drawText(x, name, W / 2, s === 2 ? 17 : 19, '#7a2a1a', s, 'center');
  // awning
  for (let i = 0; i < 14; i++) { const ax = 4 + i * 8; poly(x, [ax, 34, ax + 8, 34, ax + 8, 40, ax + 4, 42, ax, 40], i % 2 ? '#f4f0e4' : '#c0302a'); }
  rect(x, 4, 34, 108, 1, '#7a1a14');
  // display windows with stuff
  for (const wx of [8, 70]) {
    glass(x, wx, 44, 38, 24, true); rect(gx, wx, 44, 38, 24, '#ffd890');
    rect(x, wx - 2, 42, 42, 2, '#f0ece0'); rect(x, wx - 2, 68, 42, 2, '#f0ece0');
    for (let i = 0; i < 14; i++) rect(x, wx + 2 + r() * 32, 56 + r() * 10, 2 + r() * 3, 3, ['#c84a3a', '#e8c84a', '#3a8ac8', '#4a9a4a', '#a86ac8'][Math.floor(r() * 5)]);
    rect(x, wx, 62, 38, 1, '#7a5a3a');
  }
  rect(x, 50, 44, 16, 36, '#3a2a1a'); rect(x, 51, 45, 14, 34, '#5a4030'); glass(x, 53, 47, 10, 14, true); px(x, 62, 64, '#e8c060');
  rect(x, 0, 76, W, 4, '#6a4a2a'); for (let xx = 0; xx < W; xx += 6) rect(x, xx, 76, 1, 4, '#4a3020');
  if (r() < 0.6) { rect(x, 10, 70, 22, 2, '#7a5236'); rect(x, 11, 72, 1, 4, '#4a3020'); rect(x, 30, 72, 1, 4, '#4a3020'); }
  return { img: p.c, glow: p.g };
}

// ======================= TREES =======================
function clump(x, cx, cy, rx, ry, col, r) {
  const hi = shade(col, 0.32), lt = shade(col, 0.15), dk = shade(col, -0.3), dd = shade(col, -0.5);
  for (let dy = -ry; dy <= ry; dy++) for (let dx = -rx; dx <= rx; dx++) {
    const d = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);
    if (d > 1 - r() * 0.35) continue;
    const s = dx / rx * 0.5 + dy / ry;
    let c = s < -0.7 ? hi : s < -0.2 ? lt : s < 0.45 ? col : s < 0.8 ? dk : dd;
    if (r() < 0.1) c = r() < 0.5 ? dk : lt;
    px(x, cx + dx, cy + dy, c);
  }
}

export function ponderosa(seed, h) {
  const r = mulberry(seed);
  const W = 72, cx = 36;
  const [c, x] = makeCanvas(W, h);
  const col = ['#2e5a30', '#335f34', '#2a5230'][seed % 3];
  // tall orange-brown trunk with bark plates
  for (let yy = 6; yy < h; yy++) {
    const tw = Math.max(2, Math.round(2 + (yy / h) * 6));
    for (let k = 0; k < tw; k++) {
      const f = k / tw;
      let cc = f < 0.3 ? '#b86a3a' : f < 0.7 ? '#9a5230' : '#6a3420';
      if ((yy + k * 3) % 7 === 0) cc = '#4a2414';
      px(x, cx - (tw >> 1) + k, yy, cc);
    }
  }
  // branches carrying clumps; crown widest a third of the way down
  const crownBot = h - 30;
  for (let yy = 4; yy < crownBot; yy += 6 + Math.floor(r() * 3)) {
    const f = (yy - 4) / (crownBot - 4);
    const reach = 5 + Math.sin(Math.min(1, f * 1.4) * Math.PI * 0.85) * 26;
    for (const side of [-1, 1]) {
      if (r() < 0.15) continue;
      const len = reach * (0.6 + r() * 0.4);
      const ex = cx + side * len, ey = yy - 2 - r() * 3;
      line(x, cx, yy + 2, ex, ey, '#5a3420', 2);
      const n = 1 + Math.floor(len / 9);
      for (let k = 0; k < n; k++) {
        const t = 0.45 + (k / Math.max(1, n)) * 0.6;
        clump(x, cx + (ex - cx) * t, yy + (ey - yy) * t - 1, 5 + Math.floor(r() * 3), 3 + Math.floor(r() * 2), col, r);
      }
    }
    if (f < 0.15) clump(x, cx, yy, 5, 4, col, r);
  }
  return c;
}

export function juniperTree(seed, col = '#56703e') {
  const r = mulberry(seed);
  const [c, x] = makeCanvas(56, 44);
  line(x, 28, 43, 26, 30, '#6a5040', 3); line(x, 27, 34, 18, 24, '#6a5040', 2); line(x, 27, 32, 36, 22, '#6a5040', 2);
  for (let i = 0; i < 9; i++) clump(x, 12 + r() * 32, 10 + r() * 18, 7 + Math.floor(r() * 4), 5 + Math.floor(r() * 3), col, r);
  for (let i = 0; i < 8; i++) px(x, 14 + r() * 28, 8 + r() * 20, '#8aa0b8'); // dusty blue berries
  return c;
}
