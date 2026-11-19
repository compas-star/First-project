// Pseudo-3D road renderer (classic segment projection), drawn at 320x180.
import { W, H, HORIZON, SEG, ROAD_W, CAM_H, CAM_DEPTH, DRAW_DIST, FOG, METER } from './config.js';
import { makeCanvas, lerpC, hex, css, clamp } from './gfx.js';
import { SPR } from './sprites.js';
import { LAYERS, BG_W } from './backgrounds.js';
import { biomeAt, mileOfSeg } from './track.js';

const [world, wctx] = makeCanvas(W, H);
export const worldCanvas = world;

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

function drawSegment(ctx, s, fog, f) {
  const p1 = s.p1, p2 = s.p2, a = s.alt;
  const x1 = p1.sx, y1 = p1.sy, w1 = p1.sw, x2 = p2.sx, y2 = p2.sy, w2 = p2.sw;
  ctx.fillStyle = fogC(s.ground, fog, f);
  ctx.fillRect(0, y2, W, y1 - y2 + 1);
  quad(ctx, x1, y1, w1 * 1.3, x2, y2, w2 * 1.3, fogC((s.town ? SIDEWALK : SHOULDER)[a], fog, f));
  quad(ctx, x1, y1, w1, x2, y2, w2, fogC(ASPHALT[a], fog, f));
  if (s.zone) {
    const col = fogC(s.zone === 'stop' ? STOPPAINT : APRON, fog, f);
    quad(ctx, x1 + w1 * 0.55, y1, w1 * 0.45, x2 + w2 * 0.55, y2, w2 * 0.45, col);
    if (s.zone === 'gas') quad(ctx, x1 + w1 * 1.15, y1, w1 * 0.2, x2 + w2 * 1.15, y2, w2 * 0.2, col);
  }
  // edge lines
  const white = fogC(WHITE, fog, f);
  if (!s.town) {
    quad(ctx, x1 - w1 * 0.95, y1, w1 * 0.025, x2 - w2 * 0.95, y2, w2 * 0.025, white);
    quad(ctx, x1 + w1 * 0.95, y1, w1 * 0.025, x2 + w2 * 0.95, y2, w2 * 0.025, white);
  }
  const yel = fogC(YELLOW, fog, f);
  if (s.noPass) {
    quad(ctx, x1 - w1 * 0.04, y1, w1 * 0.016, x2 - w2 * 0.04, y2, w2 * 0.016, yel);
    quad(ctx, x1 + w1 * 0.04, y1, w1 * 0.016, x2 + w2 * 0.04, y2, w2 * 0.016, yel);
  } else if (a) {
    quad(ctx, x1, y1, w1 * 0.02, x2, y2, w2 * 0.02, yel);
  }
}

function drawSprite(ctx, spr, scale, sx, sy, clipY, alpha, emissive, night, side = 0) {
  const img = spr.img;
  const dh = spr.h * METER * scale * W / 2;
  const dw = dh * img.width / img.height;
  if (dw < 0.6 || dh < 0.6) return;
  const dx = side < 0 ? sx - dw : side > 0 ? sx : sx - dw / 2, dy = sy - dh;
  if (dx > W || dx + dw < 0) return;
  const clipH = clipY ? Math.max(0, dy + dh - clipY) : 0;
  if (clipH >= dh) return;
  const srcH = img.height * (1 - clipH / dh);
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, 0, 0, img.width, srcH, Math.round(dx), Math.round(dy), Math.round(dw), Math.round(dh - clipH));
  ctx.globalAlpha = 1;
  if (night > 0.05 && (spr.glow || spr.lights)) emissive.push({ spr, dx, dy, dw, dh, clipH, srcH, alpha });
}

// Returns data needed by later passes.
export function renderWorld(game, sky) {
  const ctx = wctx;
  const { track, player } = game;
  const segs = track.segs;
  ctx.clearRect(0, 0, W, H);
  const fog = lerpC(sky.bottom, [128, 128, 140], 0.1);

  // backgrounds with biome cross-fade
  const bio = biomeAt(mileOfSeg(player.z / SEG));
  const layerSets = bio.t > 0 && bio.a !== bio.b ? [[bio.a, 1], [bio.b, bio.t]] : [[bio.a, 1]];
  for (let L = 0; L < 2; L++) {
    for (const [name, alpha] of layerSets) {
      const img = LAYERS[name][L];
      const off = (((game.bgOffset * (L ? 1.6 : 0.7)) % BG_W) + BG_W) % BG_W;
      const y = L ? HORIZON - img.height + 8 : HORIZON - img.height + 3;
      ctx.globalAlpha = alpha;
      ctx.drawImage(img, -off, y); ctx.drawImage(img, BG_W - off, y);
    }
    ctx.globalAlpha = 1;
  }
  // haze over the background so the road blends in
  ctx.fillStyle = css(fog, 0.25);
  ctx.fillRect(0, 0, W, HORIZON + 8);

  const baseIdx = Math.floor(player.z / SEG);
  const base = segs[baseIdx];
  const pct = (player.z % SEG) / SEG;
  const playerY = base.p1.wy + (base.p2.wy - base.p1.wy) * pct;
  const camY = playerY + CAM_H;
  // far ground fill
  ctx.fillStyle = css(lerpC(base.ground, fog, 0.85));
  ctx.fillRect(0, HORIZON + 6, W, H);

  let x = 0, dx = -(base.curve * pct);
  let maxy = H;
  const drawn = [], visible = [];
  for (let n = 0; n < DRAW_DIST; n++) {
    const s = segs[baseIdx + n];
    if (!s) break;
    s.fog = 1 - Math.exp(-Math.pow(n / DRAW_DIST, 2) * FOG);
    project(s.p1, player.x * ROAD_W - x, camY, player.z);
    project(s.p2, player.x * ROAD_W - x - dx, camY, player.z);
    x += dx; dx += s.curve;
    s.clip = maxy;
    drawn.push(s);
    if (s.p1.cz <= CAM_DEPTH * 10 || s.p2.sy >= s.p1.sy || s.p2.sy >= maxy) continue;
    visible.push(s);
    maxy = s.p2.sy;
  }
  for (let k = visible.length - 1; k >= 0; k--) drawSegment(ctx, visible[k], fog, visible[k].fog);

  // sprites and cars, back to front
  const emissive = [];
  const night = sky.night;
  for (let n = drawn.length - 1; n > 0; n--) {
    const s = drawn[n];
    if (s.p1.cz <= 50) continue;
    const alpha = clamp(1 - s.fog * 1.1, 0, 1);
    for (const sp of s.sprites) {
      const spr = SPR[sp.k];
      if (!spr) continue;
      const sx = s.p1.sx + s.p1.scale * sp.o * ROAD_W * W / 2;
      drawSprite(ctx, spr, s.p1.scale, sx, s.p1.sy + 1, s.clip, alpha, emissive, night, Math.abs(sp.o) > 1.2 ? Math.sign(sp.o) : 0);
    }
    for (const car of s.cars) {
      const t = (car.z % SEG) / SEG;
      const scale = s.p1.scale + (s.p2.scale - s.p1.scale) * t;
      const roadX = s.p1.sx + (s.p2.sx - s.p1.sx) * t;
      const sy = s.p1.sy + (s.p2.sy - s.p1.sy) * t;
      const sx = roadX + scale * car.x * ROAD_W * W / 2;
      drawSprite(ctx, car.spr, scale, sx, sy + 1, s.clip, alpha, emissive, night);
    }
  }

  // world tint (golden hour / dusk / night)
  if (sky.tintA > 0) {
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = css(sky.tint, sky.tintA);
    ctx.fillRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
  }
  return { emissive };
}

export function drawEmissive(ctx, emissive, night, ox, oy) {
  if (night <= 0.05) return;
  for (const e of emissive) {
    const { spr, dx, dy, dw, dh, clipH, srcH } = e;
    if (spr.glow) {
      ctx.globalAlpha = night * e.alpha * 0.7;
      ctx.drawImage(spr.glow, 0, 0, spr.img.width, srcH, Math.round(dx + ox), Math.round(dy + oy), Math.round(dw), Math.round(dh - clipH));
    }
    if (spr.lights) for (const l of spr.lights) {
      const lx = dx + l.x * dw + ox, ly = dy + l.y * dh + oy;
      if (ly > dy + dh - clipH) continue;
      const r = Math.max(1.5, dw * (l.r || 0.12));
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, r);
      const c = l.c || (spr.front ? '255,250,220' : '255,40,30');
      g.addColorStop(0, `rgba(${c},${0.55 * night})`); g.addColorStop(1, `rgba(${c},0)`);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g; ctx.fillRect(lx - r, ly - r, r * 2, r * 2);
      ctx.globalCompositeOperation = 'source-over';
    }
  }
  ctx.globalAlpha = 1;
}

export function drawHeadlights(ctx, night) {
  if (night <= 0.05) return;
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(160, 118, 4, 160, 112, 110);
  g.addColorStop(0, `rgba(255,240,200,${0.32 * night})`);
  g.addColorStop(0.5, `rgba(255,230,180,${0.12 * night})`);
  g.addColorStop(1, 'rgba(255,230,180,0)');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.moveTo(10, 120); ctx.lineTo(130, 70); ctx.lineTo(190, 70); ctx.lineTo(310, 120); ctx.closePath(); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}
