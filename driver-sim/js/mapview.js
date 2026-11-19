// The paper road atlas: terrain tints, rivers, borders, highways with shields, towns,
// plus live overlays (highlighted route, "you are here" arrow, selected destination).
import { makeCanvas, mulberry, bayer, hex, lerpC } from './gfx.js';
import { drawText, textWidth } from './font.js';
import { NODES, ROADS, GEO, toMap, biomeAtMap, edgePoly } from './world.js';

const TINT = {
  forest: '#bfd6a0', woodland: '#d8deae', plains: '#f0e3b4', mesa: '#eecaa6', desert: '#f2e1bd', sonoran: '#eed8ae',
};
const TINT_RGB = Object.fromEntries(Object.entries(TINT).map(([k, v]) => [k, hex(v)]));
const OUTSIDE = hex('#e2dccd');
const geo = pts => pts.map(([la, lo]) => toMap(la, lo));
const RIVER = geo(GEO.colorado), CANYON = geo(GEO.canyon);

function inArizona(x, y) {
  const lat = 35 - y / 69, lon = -112 + x / (69 * Math.cos(35 * Math.PI / 180));
  if (lat > 37 || lon > -109.05) return false;
  if (lat >= 36.1) return lon > -114.05;
  // west border follows the Colorado River
  const r = GEO.colorado;
  for (let k = 1; k < r.length; k++) {
    const [la1, lo1] = r[k - 1], [la2, lo2] = r[k];
    if (lat <= la1 && lat >= la2 && la1 !== la2) return lon > lo1 + (lo2 - lo1) * (lat - la1) / (la2 - la1);
  }
  return lon > -114.6;
}

const cache = new Map();
function base(view) {
  const key = [view.w, view.h, view.cx.toFixed(1), view.cy.toFixed(1), view.s].join(',');
  if (cache.has(key)) return cache.get(key);
  if (cache.size > 6) cache.clear();
  const { w, h, s } = view;
  const [c, x] = makeCanvas(w, h);
  const toS = (mx, my) => [(mx - view.cx) * s + w / 2, (my - view.cy) * s + h / 2];
  // terrain
  const img = x.createImageData(w, h), d = img.data;
  const r = mulberry(9);
  for (let yy = 0; yy < h; yy += 2) for (let xx = 0; xx < w; xx += 2) {
    const mx = (xx - w / 2) / s + view.cx, my = (yy - h / 2) / s + view.cy;
    let col;
    if (!inArizona(mx, my)) col = OUTSIDE;
    else {
      const b = biomeAtMap(mx, my);
      col = TINT_RGB[b.a];
      if (b.t > 0) col = lerpC(col, TINT_RGB[b.b], b.t);
    }
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const X = xx + dx, Y = yy + dy;
      if (X >= w || Y >= h) continue;
      const i = (Y * w + X) * 4;
      const n = (bayer(X, Y) - 0.5) * 10 + (r() - 0.5) * 6;
      d[i] = col[0] + n; d[i + 1] = col[1] + n; d[i + 2] = col[2] + n; d[i + 3] = 255;
    }
  }
  x.putImageData(img, 0, 0);
  const poly = (pts, color, width, dash) => {
    x.strokeStyle = color; x.lineWidth = width; x.setLineDash(dash || []); x.lineJoin = 'round';
    x.beginPath(); pts.forEach(([mx, my], i) => { const [a, b] = toS(mx, my); i ? x.lineTo(a, b) : x.moveTo(a, b); }); x.stroke();
    x.setLineDash([]);
  };
  // grand canyon, rivers, lakes
  poly(CANYON, 'rgba(150,80,50,0.5)', Math.max(4, s * 5));
  poly(CANYON, 'rgba(110,60,40,0.6)', Math.max(1, s * 1.5));
  poly(RIVER, '#5a8ac8', Math.max(1.5, s * 1.4));
  for (const [la, lo, rw, rh] of GEO.lakes) {
    const [a, b] = toS(...toMap(la, lo));
    x.fillStyle = '#7aa8d8'; x.beginPath(); x.ellipse(a, b, rw * s, rh * s, -0.4, 0, 6.29); x.fill();
  }
  // state borders
  for (const k of ['azBorder', 'nvBorder', 'caBorder']) poly(geo(GEO[k]), 'rgba(120,70,140,0.7)', 1.2, [5, 3]);
  for (const [t, la, lo] of GEO.labels) {
    const [a, b] = toS(...toMap(la, lo));
    drawText(x, t, a, b, t.startsWith('A R') ? 'rgba(120,70,140,0.55)' : 'rgba(110,80,60,0.6)', t.startsWith('A R') ? 2 : 1, 'center');
  }
  // highways
  const order = { AZ: 0, US: 1, I: 2 };
  const roads = [...ROADS].sort((a, b) => order[a.hw.split('-')[0]] - order[b.hw.split('-')[0]]);
  for (const rd of roads) {
    const kind = rd.hw.split('-')[0];
    if (kind === 'I') { poly(rd.poly, '#3a2a2a', 4); poly(rd.poly, '#d8382e', 2.4); }
    else if (kind === 'US') { poly(rd.poly, '#3a2a2a', 3); poly(rd.poly, '#e8704a', 1.6); }
    else { poly(rd.poly, '#3a3a3a', 2.4); poly(rd.poly, '#f4f0e0', 1); }
  }
  // shields and mileage
  for (const rd of roads) {
    const p = rd.poly, m = p[Math.floor(p.length / 2)], q = p[Math.max(0, Math.floor(p.length / 2) - 1)];
    const [a, b] = toS((m[0] + q[0]) / 2, (m[1] + q[1]) / 2);
    const [kind, num] = rd.hw.split('-');
    const tw = textWidth(num) + 4;
    if (kind === 'I') { x.fillStyle = '#1a3a8a'; x.fillRect(a - tw / 2, b - 4, tw, 8); x.fillStyle = '#c0202a'; x.fillRect(a - tw / 2, b - 4, tw, 2); drawText(x, num, a, b - 2, '#fff', 1, 'center'); }
    else if (kind === 'US') { x.fillStyle = '#111'; x.fillRect(a - tw / 2 - 1, b - 5, tw + 2, 9); x.fillStyle = '#fff'; x.fillRect(a - tw / 2, b - 4, tw, 7); drawText(x, num, a, b - 3, '#111', 1, 'center'); }
    else { x.fillStyle = '#111'; x.beginPath(); x.ellipse(a, b, tw / 2 + 1, 5, 0, 0, 6.29); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.ellipse(a, b, tw / 2, 4, 0, 0, 6.29); x.fill(); drawText(x, num, a, b - 2, '#111', 1, 'center'); }
    if (s >= 1.5) drawText(x, String(rd.miles), a, b + 6, '#a8302a', 1, 'center');
  }
  // compass rose and scale bar
  const cx0 = w - 22, cy0 = 26;
  x.fillStyle = 'rgba(60,40,30,0.7)';
  x.beginPath(); x.moveTo(cx0, cy0 - 12); x.lineTo(cx0 + 4, cy0); x.lineTo(cx0 - 4, cy0); x.fill();
  x.strokeStyle = 'rgba(60,40,30,0.7)'; x.beginPath(); x.arc(cx0, cy0, 7, 0, 6.29); x.stroke();
  drawText(x, 'N', cx0, cy0 - 21, '#3a2a1a', 1, 'center');
  const bar = 50 * s;
  x.fillStyle = '#3a2a1a'; x.fillRect(8, h - 12, bar, 2); x.fillRect(8, h - 15, 1, 6); x.fillRect(8 + bar, h - 15, 1, 6);
  drawText(x, '50 MI', 8 + bar + 4, h - 15, '#3a2a1a');
  // folds and a coffee ring
  for (const fx of [w / 3, (2 * w) / 3]) { x.fillStyle = 'rgba(80,60,40,0.18)'; x.fillRect(Math.round(fx), 0, 1, h); x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(Math.round(fx) + 1, 0, 1, h); }
  x.fillStyle = 'rgba(80,60,40,0.18)'; x.fillRect(0, Math.round(h / 2), w, 1); x.fillStyle = 'rgba(255,255,255,0.25)'; x.fillRect(0, Math.round(h / 2) + 1, w, 1);
  x.strokeStyle = 'rgba(140,90,40,0.25)'; x.lineWidth = 2; x.beginPath(); x.arc(w * 0.82, h * 0.78, 14, 0.3, 5.6); x.stroke();
  cache.set(key, c);
  return c;
}

export function mapToScreen(view, mx, my) { return [view.x + (mx - view.cx) * view.s + view.w / 2, view.y + (my - view.cy) * view.s + view.h / 2]; }

export function nodeAt(view, sx, sy) {
  let best = null, bd = 12;
  for (const n of Object.values(NODES)) {
    if (n.type === 'junction') continue;
    const [a, b] = mapToScreen(view, n.x, n.y);
    const d = Math.hypot(a - sx, b - sy);
    if (d < bd) { bd = d; best = n.id; }
  }
  return best;
}

export function drawMap(ctx, view, opts = {}, t = 0) {
  ctx.save();
  ctx.beginPath(); ctx.rect(view.x, view.y, view.w, view.h); ctx.clip();
  ctx.drawImage(base(view), view.x, view.y);
  const S = (mx, my) => mapToScreen(view, mx, my);
  // highlighted route (felt-tip highlighter)
  if (opts.route && opts.route.length) {
    ctx.strokeStyle = 'rgba(255,220,40,0.6)'; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath();
    opts.route.forEach((e, i) => edgePoly(e).forEach(([mx, my], k) => { const [a, b] = S(mx, my); (i === 0 && k === 0) ? ctx.moveTo(a, b) : ctx.lineTo(a, b); }));
    ctx.stroke();
  }
  // towns and labels
  for (const n of Object.values(NODES)) {
    if (n.type === 'junction') continue;
    const [a, b] = S(n.x, n.y);
    if (n.type === 'city') { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(a) - 3, Math.round(b) - 3, 7, 7); ctx.fillStyle = '#f2c84a'; ctx.fillRect(Math.round(a) - 2, Math.round(b) - 2, 5, 5); }
    else { ctx.fillStyle = '#1a1a1a'; ctx.fillRect(Math.round(a) - 2, Math.round(b) - 2, 5, 5); ctx.fillStyle = '#f4f0e0'; ctx.fillRect(Math.round(a) - 1, Math.round(b) - 1, 3, 3); }
    const lx = a + (n.lx ?? 5), ly = b + (n.ly ?? -3);
    const col = n.id === opts.here ? '#c0202a' : n.id === opts.selected ? '#1a4a9a' : '#2a1a10';
    for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) drawText(ctx, n.name, lx + ox, ly + oy, 'rgba(244,236,214,0.9)');
    drawText(ctx, n.name, lx, ly, col);
  }
  // selected destination: red marker circle
  if (opts.selected) {
    const n = NODES[opts.selected], [a, b] = S(n.x, n.y);
    ctx.strokeStyle = '#c0202a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(a, b, 9, 7, -0.2, 0, 6.29); ctx.stroke();
  }
  // you are here
  if (opts.player) {
    const [a, b] = S(opts.player.mx, opts.player.my);
    const pulse = 5 + Math.sin(t * 6) * 1.5;
    ctx.strokeStyle = 'rgba(200,30,30,0.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(a, b, pulse + 3, 0, 6.29); ctx.stroke();
    const hd = opts.player.heading ?? 0;
    const tip = [a + Math.sin(hd) * 7, b - Math.cos(hd) * 7];
    const l = [a + Math.sin(hd + 2.5) * 5, b - Math.cos(hd + 2.5) * 5], r = [a + Math.sin(hd - 2.5) * 5, b - Math.cos(hd - 2.5) * 5];
    ctx.fillStyle = '#d0202a'; ctx.beginPath(); ctx.moveTo(...tip); ctx.lineTo(...l); ctx.lineTo(...r); ctx.fill();
    ctx.strokeStyle = '#3a0a0a'; ctx.stroke();
  } else if (opts.here) {
    const n = NODES[opts.here], [a, b] = S(n.x, n.y);
    ctx.strokeStyle = '#c0202a'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(a, b, 6 + Math.sin(t * 5), 0, 6.29); ctx.stroke();
  }
  ctx.restore();
  // paper edge
  ctx.strokeStyle = '#8a7a5a'; ctx.lineWidth = 1; ctx.strokeRect(view.x + 0.5, view.y + 0.5, view.w - 1, view.h - 1);
}

export const FULL_VIEW = { cx: -22, cy: -12, s: 1 };
