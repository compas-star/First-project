// Souvenirs from the towns you visit. Deliver a load or finish a bus route in a town, eat
// there or sleep in a motel there, and you pick up something from its tourist shop: first a
// postcard, then a photo, then a little figure. Postcards and photos are tucked along the top
// of the windshield; figures stand on the dashboard, and the newest one sits on top of the TV.
import { NODES, biomeAtMap } from './world.js';
import { BIOMES } from './track.js';
import { makeCanvas, mulberry, rect, px, poly, ellipse, line, shade, freeze } from './gfx.js';

export const KINDS = ['postcard', 'photo', 'figure'];
const NAME = { postcard: 'A POSTCARD', photo: 'A PHOTO', figure: 'A LITTLE FIGURE' };

// what each town is known for: the picture on its postcards and photos, and its figure
const TOWN = {
  needles: ['river', 'boat'], havasu: ['bridge', 'bridge'], bullhead: ['river', 'boat'],
  kingman: ['route66', 'shield'], peach: ['route66', 'shield'], seligman: ['route66', 'shield'],
  ashfork: ['rocks', 'jackalope'], williams: ['train', 'train'], flagstaff: ['pines', 'globe'],
  winslow: ['corner', 'guitar'], holbrook: ['dino', 'dino'], valle: ['canyon', 'mule'],
  canyon: ['canyon', 'mule'], cameron: ['mesa', 'vase'], page: ['lake', 'boat'],
  sedona: ['redrock', 'rock'], cottonwood: ['vines', 'jackalope'], prescott: ['western', 'boot'],
  campverde: ['fort', 'boot'], wickenburg: ['western', 'boot'], phoenix: ['cactus', 'cactus'],
};
const motif = node => TOWN[node] || ['cactus', 'cactus'];

// Pick up the next souvenir from this town, if there's one left. Returns a message or null.
export function collect(career, node) {
  if (!node || !NODES[node] || NODES[node].type === 'junction') return null;
  const list = career.souvenirs || (career.souvenirs = []);
  const kind = KINDS.find(k => !list.some(s => s.node === node && s.kind === k));
  if (!kind) return null;
  list.push({ node, kind, day: career.day });
  career.save?.();
  return `SOUVENIR: ${NAME[kind]} FROM ${NODES[node].name}`;
}

// ---------- pictures ----------
function ground(node) {
  const n = NODES[node];
  const b = BIOMES[biomeAtMap(n.x, n.y).a] || BIOMES.desert;
  return b.ground[0];
}
// a little landscape for a postcard (sunny) or a photo (golden evening)
function scene(x, X, Y, w, h, node, evening) {
  const m = motif(node)[0], r = mulberry(node.length * 97 + (evening ? 5 : 1));
  const hz = Y + Math.round(h * 0.62);
  const skyA = evening ? '#e8784a' : '#4a7ed0', skyB = evening ? '#ffd27a' : '#b8dcf0';
  for (let yy = Y; yy < hz; yy++) rect(x, X, yy, w, 1, (yy - Y) / (hz - Y) < 0.5 ? skyA : skyB);
  if (evening) rect(x, X + w - 7, hz - 5, 4, 3, '#fff2b0'); else rect(x, X + w - 6, Y + 2, 3, 3, '#fff6c8');
  rect(x, X, hz, w, Y + h - hz, ground(node));
  const water = c => rect(x, X, hz, w, Math.max(2, Math.round(h * 0.18)), c);
  const cx = X + Math.round(w / 2);
  if (m === 'canyon') {
    rect(x, X, hz - 2, w, Y + h - hz + 2, '#b8643a');
    for (let k = 0; k < 4; k++) rect(x, X, hz + k * 2, w, 1, k % 2 ? '#d88a4a' : '#9a4a2a');
    poly(x, [cx - 4, Y + h, cx + 4, Y + h, cx + 1, hz + 1, cx - 1, hz + 1], '#5a2a1a');
  } else if (m === 'mesa' || m === 'lake') {
    rect(x, cx - 5, hz - 5, 10, 5, '#b85a32'); rect(x, cx - 6, hz - 1, 12, 1, '#9a4a2a');
    if (m === 'lake') { water('#3a7ab8'); rect(x, cx - 3, hz + 2, 6, 1, '#b85a32'); }
  } else if (m === 'redrock') {
    poly(x, [cx - 7, hz, cx - 5, hz - 8, cx - 3, hz - 9, cx - 1, hz], '#c0502a');
    poly(x, [cx + 1, hz, cx + 3, hz - 6, cx + 6, hz - 6, cx + 8, hz], '#a8442a');
  } else if (m === 'pines') {
    for (let k = 0; k < 5; k++) { const tx = X + 2 + k * Math.floor(w / 5) + Math.floor(r() * 2), th = 5 + Math.floor(r() * 4); poly(x, [tx, hz + 1, tx + 2, hz - th, tx + 4, hz + 1], '#1e4a26'); }
  } else if (m === 'river') {
    water('#3a86c0'); rect(x, X, hz - 1, w, 1, '#5a8a3a');
  } else if (m === 'bridge') {
    water('#3a86c0');
    rect(x, X + 2, hz - 3, w - 4, 2, '#a89a88');
    for (let k = 0; k < 3; k++) { const ax = X + 4 + k * Math.floor((w - 8) / 3); rect(x, ax, hz - 1, 2, 3, '#8a7c6a'); }
  } else if (m === 'train') {
    rect(x, cx - 6, hz - 4, 10, 4, '#1a1a1a'); rect(x, cx + 2, hz - 7, 3, 3, '#1a1a1a'); rect(x, cx - 6, hz - 2, 10, 1, '#c0202a');
    rect(x, cx - 5, hz - 9, 3, 3, '#e8e8e8'); rect(x, cx - 8, hz - 11, 3, 2, '#d0d0d0');
    rect(x, X, hz, w, 1, '#5a4a3a');
  } else if (m === 'route66') {
    poly(x, [cx - 1, hz, cx + 1, hz, cx + 8, Y + h, cx - 8, Y + h], '#4a4a50');
    rect(x, cx, hz + 2, 1, 1, '#e8c040'); rect(x, cx, hz + 5, 1, 2, '#e8c040');
    rect(x, X + 2, hz - 7, 6, 6, '#f0f0f0'); rect(x, X + 3, hz - 6, 4, 4, '#1a1a1a'); rect(x, X + 4, hz - 1, 2, 2, '#6a6a6a');
  } else if (m === 'dino') {
    ellipse(x, cx, hz - 3, 4, 2, '#3a8a3a'); rect(x, cx + 3, hz - 8, 2, 5, '#3a8a3a'); rect(x, cx + 3, hz - 9, 4, 2, '#3a8a3a');
    rect(x, cx - 7, hz - 3, 4, 1, '#3a8a3a'); rect(x, cx - 2, hz - 1, 1, 2, '#2a6a2a'); rect(x, cx + 2, hz - 1, 1, 2, '#2a6a2a');
  } else if (m === 'western' || m === 'fort') {
    const c = m === 'fort' ? '#c8a070' : '#8a5a3a';
    for (let k = 0; k < 3; k++) { const bx = X + 2 + k * Math.floor((w - 4) / 3), bh = 4 + (k % 2) * 2; rect(x, bx, hz - bh, Math.floor((w - 4) / 3) - 1, bh, shade(c, k * 0.08)); rect(x, bx + 1, hz - bh + 1, 1, 1, '#2a1a10'); }
  } else if (m === 'corner') {
    rect(x, cx - 6, hz - 7, 6, 7, '#b8865a'); rect(x, cx + 3, hz - 8, 1, 8, '#2a2a2a'); rect(x, cx + 2, hz - 9, 3, 1, '#e8d080');
    rect(x, cx + 6, hz - 4, 1, 4, '#2a2a6a'); rect(x, cx + 6, hz - 5, 1, 1, '#d0a080');
  } else if (m === 'rocks') {
    for (let k = 0; k < 3; k++) rect(x, cx - 6 + k * 4, hz - 2 - k, 5, 2 + k, ['#b8a890', '#a89878', '#c8b8a0'][k]);
  } else if (m === 'vines') {
    for (let k = 0; k < 4; k++) rect(x, X, hz + 1 + k * 2, w, 1, '#3a6a2a');
  } else { // cactus
    rect(x, cx - 1, hz - 9, 2, 9, '#2a6a2a'); rect(x, cx - 4, hz - 6, 1, 3, '#2a6a2a'); rect(x, cx - 4, hz - 4, 3, 1, '#2a6a2a');
    rect(x, cx + 3, hz - 7, 1, 3, '#2a6a2a'); rect(x, cx + 1, hz - 5, 3, 1, '#2a6a2a');
  }
}

const CACHE = {};
function card(node, kind) {
  const key = node + kind;
  if (CACHE[key]) return CACHE[key];
  let c, x;
  if (kind === 'postcard') {
    [c, x] = makeCanvas(26, 18);
    rect(x, 0, 0, 26, 18, '#f4efe2');
    scene(x, 2, 2, 22, 12, node, false);
    rect(x, 2, 15, 10, 1, '#c0202a'); rect(x, 14, 15, 10, 1, '#3a5ab0');   // "GREETINGS FROM" lettering
    rect(x, 0, 17, 26, 1, '#bdb6a4');
  } else {
    [c, x] = makeCanvas(15, 18);
    rect(x, 0, 0, 15, 18, '#fbfaf4');
    scene(x, 1, 1, 13, 12, node, true);
    rect(x, 0, 17, 15, 1, '#c8c6bc');
  }
  return (CACHE[key] = freeze(c));
}

// little figures from the tourist shop, standing on a base
function figure(node) {
  const key = node + 'fig';
  if (CACHE[key]) return CACHE[key];
  const f = motif(node)[1];
  const [c, x] = makeCanvas(16, 20);
  const B = 19;                                   // bottom row: the base
  rect(x, 2, B - 1, 12, 2, '#5a3a22'); rect(x, 2, B - 1, 12, 1, '#7a5232');
  if (f === 'dino') {
    ellipse(x, 7, B - 6, 4, 3, '#4aa04a'); rect(x, 9, B - 13, 2, 7, '#4aa04a'); rect(x, 9, B - 14, 5, 2, '#4aa04a'); px(x, 12, B - 14, '#111');
    rect(x, 1, B - 6, 3, 1, '#4aa04a'); rect(x, 0, B - 7, 2, 1, '#4aa04a'); rect(x, 5, B - 3, 1, 2, '#2a7a2a'); rect(x, 9, B - 3, 1, 2, '#2a7a2a');
    for (let k = 0; k < 3; k++) px(x, 5 + k * 2, B - 9, '#e8c040');
  } else if (f === 'cactus') {
    rect(x, 5, B - 4, 6, 3, '#c0603a'); rect(x, 7, B - 15, 3, 11, '#3a8a3a'); rect(x, 4, B - 12, 1, 4, '#3a8a3a'); rect(x, 4, B - 9, 3, 1, '#3a8a3a');
    rect(x, 11, B - 13, 1, 4, '#3a8a3a'); rect(x, 10, B - 10, 2, 1, '#3a8a3a'); px(x, 8, B - 16, '#ff6a8a');
  } else if (f === 'jackalope') {
    ellipse(x, 8, B - 5, 4, 3, '#a8845a'); ellipse(x, 11, B - 10, 2, 2, '#a8845a'); rect(x, 10, B - 15, 1, 4, '#a8845a');
    line(x, 12, B - 12, 14, B - 17, '#e8dcc0'); line(x, 10, B - 12, 8, B - 17, '#e8dcc0'); px(x, 13, B - 16, '#e8dcc0'); px(x, 9, B - 16, '#e8dcc0'); px(x, 12, B - 10, '#111');
  } else if (f === 'boot') {
    rect(x, 6, B - 15, 5, 10, '#8a5a2a'); rect(x, 6, B - 6, 9, 4, '#8a5a2a'); rect(x, 6, B - 15, 5, 2, '#a8743a');
    rect(x, 7, B - 11, 3, 1, '#c8a060'); rect(x, 4, B - 4, 2, 1, '#c0c0c8');
  } else if (f === 'train') {
    rect(x, 2, B - 8, 10, 6, '#1e1e22'); rect(x, 9, B - 12, 4, 10, '#1e1e22'); rect(x, 3, B - 11, 2, 3, '#1e1e22');
    rect(x, 2, B - 4, 11, 1, '#c0202a'); rect(x, 10, B - 11, 2, 2, '#e8d080'); ellipse(x, 4, B - 2, 1, 1, '#555'); ellipse(x, 9, B - 2, 1, 1, '#555');
  } else if (f === 'globe') {
    rect(x, 3, B - 4, 10, 3, '#6a4a2a');
    ellipse(x, 8, B - 10, 5, 5, '#a8d0e8'); poly(x, [6, B - 6, 8, B - 13, 10, B - 6], '#2a5a2a');
    for (let k = 0; k < 6; k++) px(x, 4 + (k * 7) % 9, B - 14 + (k * 5) % 8, '#ffffff');
    px(x, 5, B - 13, '#ffffff'); rect(x, 5, B - 14, 2, 1, 'rgba(255,255,255,0.7)');
  } else if (f === 'shield') {
    rect(x, 7, B - 6, 2, 5, '#555'); rect(x, 3, B - 17, 10, 11, '#f4f4f0'); rect(x, 4, B - 16, 8, 9, '#1e1e1e');
    rect(x, 5, B - 13, 2, 3, '#f4f4f0'); rect(x, 9, B - 13, 2, 3, '#f4f4f0'); rect(x, 4, B - 16, 8, 2, '#f4f4f0');
  } else if (f === 'mule') {
    rect(x, 3, B - 9, 8, 4, '#7a6a5a'); rect(x, 10, B - 13, 3, 5, '#7a6a5a'); rect(x, 11, B - 15, 1, 2, '#7a6a5a');
    for (const lx of [3, 5, 8, 10]) rect(x, lx, B - 5, 1, 4, '#5a4a3a'); rect(x, 5, B - 11, 4, 2, '#c0202a');
  } else if (f === 'boat') {
    rect(x, 1, B - 6, 14, 4, '#f4f4f0'); rect(x, 1, B - 3, 14, 1, '#c0202a'); rect(x, 4, B - 10, 8, 4, '#f4f4f0'); rect(x, 6, B - 14, 2, 4, '#c0202a');
    ellipse(x, 13, B - 6, 2, 2, '#c0202a');
  } else if (f === 'bridge') {
    rect(x, 1, B - 10, 14, 2, '#b8aa96');
    for (const ax of [2, 7, 12]) rect(x, ax, B - 8, 2, 6, '#9a8c7a');
    rect(x, 1, B - 3, 14, 1, '#3a86c0');
  } else if (f === 'vase') {
    ellipse(x, 8, B - 7, 5, 5, '#c87a4a'); rect(x, 6, B - 14, 5, 3, '#c87a4a'); rect(x, 4, B - 8, 9, 1, '#2a1a10'); for (let k = 0; k < 4; k++) px(x, 5 + k * 2, B - 6, '#2a1a10');
  } else if (f === 'guitar') {
    ellipse(x, 8, B - 5, 4, 3, '#c8803a'); rect(x, 7, B - 17, 2, 10, '#6a3a1a'); rect(x, 6, B - 18, 4, 2, '#3a1a0a'); px(x, 8, B - 5, '#2a1a0a');
  } else { // rock
    poly(x, [3, B - 1, 5, B - 14, 8, B - 17, 10, B - 12, 13, B - 1], '#c0502a'); line(x, 6, B - 12, 7, B - 3, '#a0402a');
  }
  return (CACHE[key] = freeze(c));
}

// where things go in each cab: card slots along the top of the glass, figure slots on the left of the dash
const SLOTS = {
  car: { cards: [[94, 16], [122, 15], [150, 17], [292, 16], [320, 15], [348, 17], [376, 15], [404, 17]], figs: [[44, 182], [62, 182], [80, 182], [98, 182], [116, 182]] },
  bus: { cards: [[94, 19], [122, 18], [150, 20], [310, 19], [338, 18], [366, 20]], figs: [[22, 176], [40, 176], [58, 176], [76, 176], [94, 176], [112, 176]] },
};

// draw them all (on the cab layer, before the night tint)
export function drawSouvenirs(ctx, career, cab, tv, sway = 0) {
  const list = career && career.souvenirs;
  if (!list || !list.length) return;
  const S = SLOTS[cab];
  const cards = list.filter(s => s.kind !== 'figure').slice(-S.cards.length);
  cards.forEach((s, i) => {
    const [x, y] = S.cards[i], img = card(s.node, s.kind);
    // a bit of tape holds each one up
    ctx.drawImage(img, x, y);
    rect(ctx, x + Math.floor(img.width / 2) - 3, y - 1, 6, 2, 'rgba(240,235,200,0.7)');
  });
  const figs = list.filter(s => s.kind === 'figure');
  if (!figs.length) return;
  // the newest stands on the TV, the rest line up on the dash (they wobble a little on bumps)
  const top = figs[figs.length - 1];
  const wob = Math.round(sway);
  if (tv) { const img = figure(top.node); ctx.drawImage(img, tv.x + 4 + wob, tv.y - 6 - img.height); }
  const rest = (tv ? figs.slice(0, -1) : figs).slice(-S.figs.length);
  rest.forEach((s, i) => {
    const [x, y] = S.figs[i], img = figure(s.node);
    ctx.drawImage(img, x - wob, y - img.height + 1);
  });
}
