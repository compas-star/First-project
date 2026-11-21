// Pseudo-3D road renderer (classic segment projection), drawn at 320x180.
import { W, H, HORIZON, SEG, ROAD_W, CAM_DEPTH, DRAW_DIST, FOG, METER } from './config.js';
import { makeCanvas, lerpC, hex, css, clamp } from './gfx.js';
import { SPR } from './sprites.js';
import { walkBranch, BR_M } from './track.js';
import { LAYERS, BG_W } from './backgrounds.js';

const [world, wctx] = makeCanvas(W, H);
export const worldCanvas = world;
// the world before the night tint, for the parts your headlights light up
const [litC, litX] = makeCanvas(W, H);

// the headlight beam, drawn small and scaled up smoothly so its edges are soft
const LS = 4, LW = W / LS, LH = Math.ceil(H / LS);
const [beamC, beamX] = makeCanvas(LW, LH);
const [warmC, warmX] = makeCanvas(LW, LH);
const [tintC, tintX] = makeCanvas(LW, LH);
let beamSegs = [], wetNow = 0, snowNow = 0;
const SNOW = [226, 230, 238];

const ASPHALT = [hex('#55555b'), hex('#515157')];
const SHOULDER = [hex('#7e796b'), hex('#75705f')];
const SIDEWALK = [hex('#9c988e'), hex('#94908a')];
const WHITE = hex('#d8d8d0');
const YELLOW = hex('#d8b03a');
const STOPPAINT = hex('#a8923e');
const APRON = hex('#8c8a86');

function project(p, camX, camY, camZ) {
  p.cz = p.wz - camZ;
  p.scale = CAM_DEPTH / p.cz;
  p.sx = Math.round(W / 2 + p.scale * (-camX) * W / 2);
  p.sy = Math.round(HORIZON - p.scale * (p.wy - camY) * W / 2);
  p.sw = Math.round(p.scale * ROAD_W * W / 2);
}

function quad(ctx, x1, y1, w1, x2, y2, w2, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(x1 - w1, y1); ctx.lineTo(x2 - w2, y2); ctx.lineTo(x2 + w2, y2); ctx.lineTo(x1 + w1, y1);
  ctx.closePath(); ctx.fill();
}

const fogC = (c, fog, f) => css(lerpC(c, fog, f));

const WET = hex('#34343c');
const GRASS = hex('#5f7a3a'), CURB = hex('#b8b4a8');
function drawSegment(ctx, s, fog, f) {
  const p1 = s.p1, p2 = s.p2, a = s.alt;
  // other roads beside this one: static (splits, service roads) and this frame's branch roads
  const BR = s.dbr ? (s.br ? s.br.concat(s.dbr) : s.dbr) : s.br;
  const x1 = p1.sx, y1 = p1.sy, w1 = p1.sw, x2 = p2.sx, y2 = p2.sy, w2 = p2.sw;
  const asphalt = fogC(wetNow ? lerpC(ASPHALT[a], WET, wetNow) : ASPHALT[a], fog, f);
  ctx.fillStyle = fogC(snowNow ? lerpC(s.ground, SNOW, snowNow) : s.ground, fog, f);
  ctx.fillRect(0, y2, W, y1 - y2 + 1);
  if (s.cross) {
    // a crossing street: asphalt from one side of the view to the other
    ctx.fillStyle = asphalt;
    ctx.fillRect(0, y2, W, y1 - y2 + 1);
  } else {
    // other roads of a split: their verges first, so every road's asphalt goes over every verge
    if (BR) for (const b of BR) {
      const bx1 = x1 + b.o1 * w1, bx2 = x2 + b.o2 * w2;
      if (!s.town) quad(ctx, bx1, y1, w1 * 1.55, bx2, y2, w2 * 1.55, fogC(s.dirt, fog, f));
      quad(ctx, bx1, y1, w1 * 1.3, bx2, y2, w2 * 1.3, fogC((s.town ? SIDEWALK : SHOULDER)[a], fog, f));
    }
    if (!s.town && !s.street) quad(ctx, x1, y1, w1 * 1.55, x2, y2, w2 * 1.55, fogC(s.dirt, fog, f));
    quad(ctx, x1, y1, w1 * 1.3, x2, y2, w2 * 1.3, fogC((s.town || s.street ? SIDEWALK : SHOULDER)[a], fog, f));
  }
  // an opening to the side: a roundabout exit or entry
  if (s.stub) quad(ctx, x1 + s.stub * w1 * 2.4, y1, w1 * 1.45, x2 + s.stub * w2 * 2.4, y2, w2 * 1.45, asphalt);
  // the roundabout's central island, always on the left
  if (s.island) {
    quad(ctx, x1 - w1 * 2.6, y1, w1 * 1.45, x2 - w2 * 2.6, y2, w2 * 1.45, fogC(GRASS.map(v => v * (a ? 0.94 : 1)), fog, f));
    quad(ctx, x1 - w1 * 1.13, y1, w1 * 0.06, x2 - w2 * 1.13, y2, w2 * 0.06, fogC(CURB, fog, f));
  }
  if (BR) {
    for (const b of BR) quad(ctx, x1 + b.o1 * w1, y1, w1, x2 + b.o2 * w2, y2, w2, asphalt);
    quad(ctx, x1, y1, w1, x2, y2, w2, asphalt);
    // their paint: a centre line, and edge lines where no other road covers them
    const white = fogC(WHITE, fog, f), yel = fogC(YELLOW, fog, f);
    for (const b of BR) {
      const bx1 = x1 + b.o1 * w1, bx2 = x2 + b.o2 * w2;
      if (b.zone) {
        const zc = fogC(b.zone === 'stop' ? STOPPAINT : APRON, fog, f);
        quad(ctx, bx1 + w1 * 0.55, y1, w1 * 0.45, bx2 + w2 * 0.55, y2, w2 * 0.45, zc);
        if (b.zone !== 'stop') quad(ctx, bx1 + w1 * 1.15, y1, w1 * 0.2, bx2 + w2 * 1.15, y2, w2 * 0.2, zc);
      }
      if (b.svc || b.oneway) { if (s.i % 4 < 2) quad(ctx, bx1, y1, w1 * 0.018, bx2, y2, w2 * 0.018, white); }
      else if (a) quad(ctx, bx1, y1, w1 * 0.02, bx2, y2, w2 * 0.02, yel);
      if (s.town) continue;
      if (!b.noL) quad(ctx, bx1 - w1 * 0.95, y1, w1 * 0.025, bx2 - w2 * 0.95, y2, w2 * 0.025, white);
      if (!b.noR) quad(ctx, bx1 + w1 * 0.95, y1, w1 * 0.025, bx2 + w2 * 0.95, y2, w2 * 0.025, white);
    }
  } else quad(ctx, x1, y1, w1, x2, y2, w2, asphalt);
  if (s.cross) {
    if (s.cross === 2) for (let o = -0.85; o <= 0.86; o += 0.24) quad(ctx, x1 + w1 * o, y1, w1 * 0.08, x2 + w2 * o, y2, w2 * 0.08, fogC(WHITE, fog, f));
    return;
  }
  if (s.stopline) quad(ctx, x1 + w1 * 0.5, y1, w1 * 0.48, x2 + w2 * 0.5, y2, w2 * 0.48, fogC(WHITE, fog, f));
  if (s.yieldline) for (let o = 0.1; o < 1; o += 0.18) quad(ctx, x1 + w1 * o, y1, w1 * 0.05, x2 + w2 * o, y2, w2 * 0.05, fogC(WHITE, fog, f));
  // wheel tracks: slightly darker bands in each lane
  const track = fogC(ASPHALT[a].map(v => v * 0.9), fog, f);
  for (const o of [-0.72, -0.28, 0.28, 0.72]) quad(ctx, x1 + w1 * o, y1, w1 * 0.07, x2 + w2 * o, y2, w2 * 0.07, track);
  if (s.patch) quad(ctx, x1 + w1 * s.patch[0], y1, w1 * s.patch[1], x2 + w2 * s.patch[0], y2, w2 * s.patch[1], fogC(ASPHALT[a].map(v => v * 0.78), fog, f));
  if (s.crack !== undefined) quad(ctx, x1 + w1 * s.crack, y1, Math.max(0.5, w1 * 0.008), x2 + w2 * s.crack, y2, Math.max(0.5, w2 * 0.008), fogC([30, 30, 34], fog, f));
  if (s.zone) {
    const col = fogC(s.zone === 'stop' ? STOPPAINT : APRON, fog, f);
    quad(ctx, x1 + w1 * 0.55, y1, w1 * 0.45, x2 + w2 * 0.55, y2, w2 * 0.45, col);
    if (s.zone !== 'stop') quad(ctx, x1 + w1 * 1.15, y1, w1 * 0.2, x2 + w2 * 1.15, y2, w2 * 0.2, col);
  }
  if (s.street) return; // quiet residential streets: no paint
  // edge lines
  const white = fogC(WHITE, fog, f);
  if (!s.town) {
    if (s.stub !== -1 && !s.noL) quad(ctx, x1 - w1 * 0.95, y1, w1 * 0.025, x2 - w2 * 0.95, y2, w2 * 0.025, white);
    if (s.stub !== 1 && !s.noR) quad(ctx, x1 + w1 * 0.95, y1, w1 * 0.025, x2 + w2 * 0.95, y2, w2 * 0.025, white);
  }
  if (s.oneway) {
    // roundabout: a dashed white lane line instead of the yellow centre line
    if (s.i % 4 < 2) quad(ctx, x1, y1, w1 * 0.018, x2, y2, w2 * 0.018, white);
  } else {
    const yel = fogC(YELLOW, fog, f);
    if (s.noPass) {
      quad(ctx, x1 - w1 * 0.04, y1, w1 * 0.016, x2 - w2 * 0.04, y2, w2 * 0.016, yel);
      quad(ctx, x1 + w1 * 0.04, y1, w1 * 0.016, x2 + w2 * 0.04, y2, w2 * 0.016, yel);
    } else if (a) {
      quad(ctx, x1, y1, w1 * 0.02, x2, y2, w2 * 0.02, yel);
    }
  }
  // raised reflectors on the centre line
  if (s.i % 6 === 0 && w1 > 30) { ctx.fillStyle = fogC([250, 220, 120], fog, f); const r = Math.max(1, Math.round(w1 * 0.012)); ctx.fillRect(x1 - r, y1 - r, r * 2, r); }
}

let hazeRGB = [128, 128, 128];

// Mipmaps: each sprite keeps halved copies, so tiny distant sprites are drawn
// from a small source instead of being squeezed down from the full-size image.
const MIPS = new WeakMap();
function mips(img) {
  let m = MIPS.get(img);
  if (!m) {
    m = [img];
    let c = img;
    while (c.height >= 8 && c.width >= 4) {
      const [n, nx] = makeCanvas(c.width >> 1, c.height >> 1);
      nx.drawImage(c, 0, 0, n.width, n.height);
      m.push(n); c = n;
    }
    MIPS.set(img, m);
  }
  return m;
}
function level(img, dh) {
  const m = mips(img);
  const L = Math.max(0, Math.min(m.length - 1, Math.floor(Math.log2(img.height / Math.max(1, dh)))));
  return m[L];
}
// Haze silhouettes: one flat copy per mip in the current haze colour, rebuilt only when the colour changes.
const SIL = new WeakMap();
let hazeKey = '';
function silhouette(src) {
  let s = SIL.get(src);
  if (!s) { s = { key: '', c: makeCanvas(src.width, src.height) }; SIL.set(src, s); }
  if (s.key !== hazeKey) {
    const [c, x] = s.c;
    x.globalCompositeOperation = 'copy';
    x.drawImage(src, 0, 0);
    x.globalCompositeOperation = 'source-in';
    x.fillStyle = hazeKey;
    x.fillRect(0, 0, c.width, c.height);
    x.globalCompositeOperation = 'source-over';
    s.key = hazeKey;
  }
  return s.c[0];
}

function drawSprite(ctx, spr, scale, sx, sy, clipY, alpha, emissive, night, side = 0) {
  const full = spr.img;
  const dh = spr.h * METER * scale * W / 2;
  const dw = dh * full.width / full.height;
  if (dw < 0.6 || dh < 0.6) return;
  const dx = side < 0 ? sx - dw : side > 0 ? sx : sx - dw / 2, dy = sy - dh;
  if (dx > W || dx + dw < 0) return;
  const clipH = clipY ? Math.max(0, dy + dh - clipY) : 0;
  if (clipH >= dh) return;
  const img = level(full, dh);
  const srcH = Math.max(1, Math.round(img.height * (1 - clipH / dh)));
  const rx = Math.round(dx), ry = Math.round(dy), rw = Math.max(1, Math.round(dw)), rh = Math.max(1, Math.round(dh - clipH));
  ctx.drawImage(img, 0, 0, img.width, srcH, rx, ry, rw, rh);
  // distant objects fade into the haze colour instead of turning see-through
  const haze = 1 - alpha;
  if (haze > 0.04) {
    ctx.globalAlpha = Math.min(1, haze);
    ctx.drawImage(silhouette(img), 0, 0, img.width, srcH, rx, ry, rw, rh);
    ctx.globalAlpha = 1;
  }
  if (night > 0.05 && (spr.glow || spr.lights)) emissive.push({ spr, dx, dy, dw, dh, clipH, alpha });
}

// Returns data needed by later passes.
export function renderWorld(game, sky) {
  const ctx = wctx;
  const { track, player } = game;
  const segs = track.segs;
  ctx.clearRect(0, 0, W, H);
  const fog = lerpC(sky.bottom, [128, 128, 140], 0.1);
  const fogD = FOG * (sky.fogMul || 1);
  wetNow = (sky.wet || 0) * 0.55;
  snowNow = (sky.snowCover || 0) * 0.8;

  // backgrounds with biome cross-fade
  const bio = (segs[Math.floor(player.z / SEG)] || segs[0]).bio;
  // camYaw: after you swap roads in a split the view eases round to the new road
  const yaw = game.camYaw || 0;
  const hdg = game.heading() - yaw;
  hazeRGB = fog;
  // quantised so silhouettes are rebuilt only now and then as the sky changes
  hazeKey = `rgb(${(fog[0] >> 2) << 2},${(fog[1] >> 2) << 2},${(fog[2] >> 2) << 2})`;
  // when the landscape changes, the old ranges sink below the horizon and the new ones rise
  let name = bio.a, sink = 0;
  if (bio.a !== bio.b && bio.t > 0) {
    if (bio.t < 0.5) sink = bio.t * 2; else { name = bio.b; sink = (1 - bio.t) * 2; }
  }
  sink = sink * sink * (3 - 2 * sink);
  for (let L = 0; L < 3; L++) {
    const img = LAYERS[name][L];
    const off = Math.round((((hdg * (1920 / (2 * Math.PI)) * [1.0, 1.04, 1.08][L]) % BG_W) + BG_W) % BG_W);
    const y = Math.round(HORIZON - img.height + [4, 8, 12][L] + sink * (img.height + 4));
    ctx.drawImage(img, -off, y); ctx.drawImage(img, BG_W - off, y);
  }
  // a little haze on the mountains only (not on the sky)
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = css(fog, 0.15);
  ctx.fillRect(0, 0, W, HORIZON + 12);
  ctx.globalCompositeOperation = 'source-over';

  const baseIdx = Math.floor(player.z / SEG);
  const base = segs[baseIdx];
  const pct = (player.z % SEG) / SEG;
  const playerY = base.p1.wy + (base.p2.wy - base.p1.wy) * pct;
  const camY = playerY + game.vehicle.camH;
  // far ground fill
  ctx.fillStyle = css(lerpC(base.ground, fog, 0.85));
  ctx.fillRect(0, HORIZON + 6, W, H);

  // branch roads (roundabout exits, side streets) in view: work out where they run this frame
  for (let n = 0; n < DRAW_DIST; n++) { const s = segs[baseIdx + n]; if (!s) break; s.dbr = null; }
  for (const br of track.branches) {
    if (br.i0 >= baseIdx + DRAW_DIST || br.i0 + BR_M <= baseIdx) continue;
    walkBranch(segs, br, BR_M, (i, D1, D2) => {
      if (i < baseIdx || i >= baseIdx + DRAW_DIST) return;
      const o1 = D1 / ROAD_W, o2 = D2 / ROAD_W;
      if (Math.min(Math.abs(o1), Math.abs(o2)) > 70) return;
      const sep = Math.abs(o1) > 1.95;
      (segs[i].dbr ||= []).push({ o1, o2, oneway: br.oneway, noL: !sep, noR: !sep });
    });
  }
  let x = 0, dx = -(base.curve * pct) + yaw * SEG;
  let maxy = H;
  const drawn = [], visible = [];
  for (let n = 0; n < DRAW_DIST; n++) {
    const s = segs[baseIdx + n];
    if (!s) break;
    s.fog = 1 - Math.exp(-Math.pow(n / DRAW_DIST, 2) * fogD);
    project(s.p1, player.x * ROAD_W - x, camY, player.z);
    project(s.p2, player.x * ROAD_W - x - dx, camY, player.z);
    x += dx; dx += s.curve;
    s.clip = maxy;
    drawn.push(s);
    if (s.p1.cz <= CAM_DEPTH * 10 || s.p2.sy >= s.p1.sy || s.p2.sy >= maxy) continue;
    visible.push(s);
    s.n = n;
    maxy = s.p2.sy;
  }
  for (let k = visible.length - 1; k >= 0; k--) drawSegment(ctx, visible[k], fog, visible[k].fog);

  // sprites and cars, back to front
  const emissive = [];
  const night = sky.night;
  let lastPole = null;
  for (let n = drawn.length - 1; n > 0; n--) {
    const s = drawn[n];
    if (s.p1.cz <= 50) continue;
    const alpha = clamp(1 - s.fog * 0.9, 0, 1);
    for (const sp of s.sprites) {
      const spr = SPR[sp.k];
      if (!spr) continue;
      const sx = s.p1.sx + s.p1.scale * sp.o * ROAD_W * W / 2;
      if (sp.k === 'pole') {
        const ph = spr.h * METER * s.p1.scale * W / 2, pw = ph * spr.img.width / spr.img.height;
        const top = s.p1.sy - ph * 0.92, l = sx - pw * 0.45, rr = sx + pw * 0.45;
        if (lastPole && lastPole.n - n < 40) {
          ctx.strokeStyle = `rgba(25,22,20,${alpha * 0.9})`; ctx.lineWidth = 1;
          for (const [a0, a1] of [[lastPole.l, l], [lastPole.r, rr]]) {
            ctx.beginPath(); ctx.moveTo(a0, lastPole.top);
            ctx.quadraticCurveTo((a0 + a1) / 2, (lastPole.top + top) / 2 + Math.max(1, (top - lastPole.top) * 0.18 + ph * 0.05), a1, top);
            ctx.stroke();
          }
        }
        lastPole = { l, r: rr, top, n };
      }
      drawSprite(ctx, spr, s.p1.scale, sx, s.p1.sy + 1, s.clip, alpha, emissive, night, sp.side ?? (Math.abs(sp.o) > 1.2 ? Math.sign(sp.o) : 0));
    }
    for (const car of s.cars) {
      const t = (car.z % SEG) / SEG;
      const scale = s.p1.scale + (s.p2.scale - s.p1.scale) * t;
      const roadX = s.p1.sx + (s.p2.sx - s.p1.sx) * t;
      const sy = s.p1.sy + (s.p2.sy - s.p1.sy) * t;
      const sx = roadX + scale * (car.x + (s.carOff || 0)) * ROAD_W * W / 2;
      drawSprite(ctx, car.spr, scale, sx, sy + 1, s.clip, alpha, emissive, night);
    }
  }

  // remember the beam's path along the road, and the world as it looks in full light
  beamSegs = game.lightsOn && sky.tintA > 0.08 ? visible.filter(s => s.n < 90) : [];
  buildBeam(game, sky);
  if (sky.flash > 0) { litX.clearRect(0, 0, W, H); litX.drawImage(world, 0, 0); }
  // world tint (golden hour / dusk / night)
  if (beamBox) {
    ctx.globalCompositeOperation = 'source-atop';
    // plain tint everywhere but the beam's box, the soft one inside it
    const B = beamBox;
    ctx.fillStyle = css(sky.tint, sky.tintA);
    ctx.fillRect(0, 0, W, B.Y); ctx.fillRect(0, B.Y + B.BH, W, H);
    ctx.fillRect(0, B.Y, B.X, B.BH); ctx.fillRect(B.X + B.BW, B.Y, W, B.BH);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(tintC, B.x0, B.y0, B.bw, B.bh, B.X, B.Y, B.BW, B.BH);
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = 'source-over';
  } else if (sky.tintA > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = css(sky.tint, sky.tintA);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  return { emissive };
}

// A blurred copy of a glow layer (made once): shrink it with smoothing, then grow it back.
const HALO = new WeakMap();
function halo(img) {
  let h = HALO.get(img);
  if (h) return h;
  const sw = Math.max(2, Math.round(img.width / 6)), sh = Math.max(2, Math.round(img.height / 6));
  const [a, ax] = makeCanvas(sw + 4, sh + 4);
  ax.imageSmoothingEnabled = true;
  ax.drawImage(img, 2, 2, sw, sh);
  const [b, bx] = makeCanvas((sw + 4) * 3, (sh + 4) * 3);
  bx.imageSmoothingEnabled = true;
  bx.filter = 'blur(2px)';
  bx.drawImage(a, 0, 0, b.width, b.height);
  bx.filter = 'none';
  HALO.set(img, b);
  return b;
}
// Cached soft glow sprites, one per colour: a wide faint halo with a small hot core.
const GLOWS = {};
function glowSprite(c) {
  if (GLOWS[c]) return GLOWS[c];
  const [g, x] = makeCanvas(64, 64);
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${c},1)`); gr.addColorStop(0.12, `rgba(${c},0.75)`);
  gr.addColorStop(0.35, `rgba(${c},0.22)`); gr.addColorStop(1, `rgba(${c},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return (GLOWS[c] = g);
}
export function drawEmissive(ctx, emissive, night, ox, oy, wet = 0) {
  if (night <= 0.05) return;
  const sm = ctx.imageSmoothingEnabled;
  for (const e of emissive) {
    const { spr, dx, dy, dw, dh, clipH } = e;
    if (spr.glow) {
      const gl = level(spr.glow, dh);
      const srcH = Math.max(1, Math.round(gl.height * (1 - clipH / dh)));
      const rx = Math.round(dx + ox), ry = Math.round(dy + oy), rw = Math.round(dw), rh = Math.round(dh - clipH);
      ctx.globalAlpha = night * e.alpha * 0.75;
      ctx.drawImage(gl, 0, 0, gl.width, srcH, rx, ry, rw, rh);
      // the light spilling round the windows: a blurred copy, added on top
      if (dh > 40) {
        const hc = halo(spr.glow), f = 1 - clipH / dh, pad = dw * 0.08;
        ctx.globalCompositeOperation = 'lighter';
        ctx.imageSmoothingEnabled = true;
        ctx.globalAlpha = night * e.alpha * 0.28;
        ctx.drawImage(hc, 0, 0, hc.width, Math.max(1, hc.height * f), dx + ox - pad, dy + oy - pad, dw + pad * 2, (dh + pad * 2) * f);
        ctx.imageSmoothingEnabled = sm;
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    if (spr.lights) {
      ctx.imageSmoothingEnabled = true;
      ctx.globalCompositeOperation = 'lighter';
      for (const l of spr.lights) {
        const lx = dx + l.x * dw + ox, ly = dy + l.y * dh + oy;
        if (ly > dy + dh - clipH) continue;
        const front = spr.front && !l.c;
        const c = l.c || (front ? '255,244,214' : '255,46,30');
        const r = Math.max(2.5, dw * (l.r || 0.12) * (front ? 2.6 : 1.9));
        const img = glowSprite(c);
        ctx.globalAlpha = Math.min(1, night * (front ? 0.95 : 0.8));
        ctx.drawImage(img, lx - r, ly - r, r * 2, r * 2);
        // oncoming headlights flare sideways a little
        if (front && r > 4) { ctx.globalAlpha = night * 0.25; ctx.drawImage(img, lx - r * 2.2, ly - r * 0.25, r * 4.4, r * 0.5); }
        // on a wet road every light shimmers in a long streak below it
        if (wet > 0.05) {
          const base = dy + dh + oy;
          ctx.globalAlpha = night * wet * (front ? 0.5 : 0.4);
          ctx.drawImage(img, lx - r * 0.45, base - r * 0.2, r * 0.9, Math.min(60, r * 5 + (base - ly) * 1.5));
        }
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.imageSmoothingEnabled = sm;
    }
  }
  ctx.globalAlpha = 1;
}

// Headlights: a soft pool of light along the road ahead. It follows the road over hills and
// round bends, fades out with distance and to the sides, and shows the world's true colours
// (not just a brighter tint) where it falls.
let beamBox = null, beamStrength = 0;
// Headlights: a soft pool of light along the road ahead. It follows the road over hills and
// round bends and fades out with distance and to the sides. It's drawn small and scaled up
// smoothly, then cut out of the night tint, so the world shows its true colours where it falls.
function buildBeam(game, sky) {
  beamBox = null;
  beamStrength = clamp(sky.tintA * 1.4, 0, 1);
  if (!beamSegs.length || beamStrength <= 0) return;
  const px = game.player.x;
  beamX.clearRect(0, 0, LW, LH);
  beamX.globalCompositeOperation = 'lighter';
  let x0 = LW, x1 = 0, y0 = LH, y1 = 0;
  // nested bands: wide and faint at the edges, bright in the middle of your lane
  const bands = [[2.0, 0.09], [1.1, 0.25], [0.5, 0.3]];
  for (const s of beamSegs) {
    const n = s.n + 0.5;
    const near = 0.35 + 0.65 * clamp((n - 2) / 9, 0, 1);
    const far = n < 12 ? 1 : Math.exp(-Math.pow((n - 12) / 34, 2));
    const a = near * far;
    if (a < 0.01) continue;
    const p1 = s.p1, p2 = s.p2;
    const c1 = (p1.sx + p1.sw * px) / LS, c2 = (p2.sx + p2.sw * px) / LS;
    const ya = p1.sy / LS + 0.5, yb = p2.sy / LS - 0.5;
    const wa = p1.sw * 2 / LS, wb = p2.sw * 2 / LS;
    x0 = Math.min(x0, c1 - wa, c2 - wb); x1 = Math.max(x1, c1 + wa, c2 + wb); y0 = Math.min(y0, yb); y1 = Math.max(y1, ya);
    for (const [k, al] of bands) {
      const w1 = p1.sw * k / LS, w2 = p2.sw * k / LS;
      beamX.fillStyle = `rgba(255,255,255,${al * a})`;
      beamX.beginPath();
      beamX.moveTo(c1 - w1, ya); beamX.lineTo(c2 - w2, yb); beamX.lineTo(c2 + w2, yb); beamX.lineTo(c1 + w1, ya);
      beamX.closePath(); beamX.fill();
    }
  }
  beamX.globalCompositeOperation = 'source-over';
  // bounding box in small pixels, a pixel of margin for the soft edge
  x0 = Math.max(0, Math.floor(x0) - 1); y0 = Math.max(0, Math.floor(y0) - 1);
  x1 = Math.min(LW, Math.ceil(x1) + 1); y1 = Math.min(LH, Math.ceil(y1) + 1);
  if (x1 <= x0 || y1 <= y0) return;
  const bw = x1 - x0, bh = y1 - y0;
  beamBox = { x0, y0, bw, bh, X: x0 * LS, Y: y0 * LS, BW: bw * LS, BH: bh * LS };
  // a warm copy of the shape
  warmX.globalCompositeOperation = 'copy';
  warmX.drawImage(beamC, 0, 0);
  warmX.globalCompositeOperation = 'source-in';
  warmX.fillStyle = 'rgb(255,226,170)';
  warmX.fillRect(0, 0, LW, LH);
  warmX.globalCompositeOperation = 'source-over';
  // the night tint, with a soft hole where the beam falls: the world shows its true colours there
  tintX.globalCompositeOperation = 'copy';
  tintX.fillStyle = css(sky.tint, sky.tintA);
  tintX.fillRect(0, 0, LW, LH);
  tintX.globalCompositeOperation = 'destination-out';
  tintX.globalAlpha = beamStrength;
  tintX.drawImage(beamC, 0, 0);
  // and a faint warm colour where the light falls, so it reads as light and not just colour
  tintX.globalCompositeOperation = 'source-over';
  tintX.globalAlpha = 0.1 + 0.1 * sky.night;
  tintX.drawImage(warmC, 0, 0);
  tintX.globalAlpha = 1;
}

// A lightning flash lights the whole landscape for a moment.
export function drawFlash(ctx, sky, ox, oy) {
  if (!(sky.flash > 0)) return;
  ctx.globalAlpha = Math.min(1, sky.flash) * 0.85;
  ctx.drawImage(litC, ox, oy);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = `rgba(200,205,255,${sky.flash * 0.25})`;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
}
