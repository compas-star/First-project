// Weather: clear skies most of the time, with clouds, rain, thunderstorms, dust storms and
// snow up in the high country. It changes on its own every hour or two of game time,
// fading in and out slowly. W cycles it by hand.
import { W, H, HORIZON } from './config.js';
import { clamp, lerpC, css, line } from './gfx.js';

export const KINDS = ['clear', 'cloudy', 'rain', 'storm', 'dust', 'snow'];
// what each kind does, at full strength
const LOOK = {
  clear: { cloud: 0, rain: 0, dust: 0, snow: 0 },
  cloudy: { cloud: 0.75, rain: 0, dust: 0, snow: 0 },
  rain: { cloud: 0.9, rain: 0.6, dust: 0, snow: 0 },
  storm: { cloud: 1, rain: 1, dust: 0, snow: 0 },
  dust: { cloud: 0.15, rain: 0, dust: 1, snow: 0 },
  snow: { cloud: 0.95, rain: 0, dust: 0, snow: 1 },
};
const HIGH = new Set(['forest', 'woodland']);
const DRY = new Set(['desert', 'sonoran', 'plains', 'mesa']);

export const NAMES = { clear: 'CLEAR SKIES', cloudy: 'OVERCAST', rain: 'RAIN', storm: 'THUNDERSTORM', dust: 'DUST STORM', snow: 'SNOW' };

export class Weather {
  constructor(seed = Math.random() * 1e9) {
    this.r = seed;
    this.kind = 'clear'; this.timer = 0; this.manual = false;
    // current mix, eased toward the target kind
    this.cloud = 0; this.rain = 0; this.dust = 0; this.snow = 0;
    this.flash = 0; this.boltT = 8; this.thunder = [];
    this.wiper = 0; this.wiperPhase = 0; this.wiperOn = false;
    this.drops = []; this.glass = [];
    this.wet = 0;          // how wet the road is (lags behind the rain)
  }
  rand() { this.r = (this.r * 16807 + 11) % 2147483647; return this.r / 2147483647; }

  // pick what comes next, by landscape
  pick(bio) {
    const r = this.rand();
    const high = HIGH.has(bio), dry = DRY.has(bio);
    if (r < 0.42) return 'clear';
    if (r < 0.62) return 'cloudy';
    if (r < 0.77) return high ? 'snow' : 'rain';
    if (r < 0.88) return 'storm';
    if (dry && r < 0.96) return 'dust';
    return high ? 'snow' : 'cloudy';
  }
  // start a trip with some weather already in place
  start(bio, clock) {
    this.r = (Math.floor(clock / 3600) * 7919 + 17) % 2147483647 || 1;
    for (let k = 0; k < 3; k++) this.rand();
    this.kind = this.pick(bio);
    if (this.rand() < 0.35) this.kind = 'clear';
    this.timer = 3600 * (1 + this.rand() * 2);
    this.snapTo(this.kind);
  }
  snapTo(kind) { const L = LOOK[kind]; this.cloud = L.cloud; this.rain = L.rain; this.dust = L.dust; this.snow = L.snow; this.wet = L.rain > 0 || L.snow > 0 ? 1 : 0; this.cover = L.snow; }
  cycle(bio) {
    let i = KINDS.indexOf(this.kind);
    i = (i + 1) % KINDS.length;
    this.kind = KINDS[i]; this.manual = true; this.timer = 3600 * 3;
    return this.kind;
  }

  // gdt: game seconds passed. dt: real seconds. Returns a message when the weather turns.
  update(dt, gdt, bio, speed, audio) {
    let said = null;
    this.timer -= gdt;
    if (this.timer <= 0) {
      const next = this.pick(bio);
      this.timer = 3600 * (0.8 + this.rand() * 2.2);
      if (next !== this.kind) { this.kind = next; this.manual = false; said = next; }
    }
    // snow turns to rain down low, rain turns to snow up high
    let kind = this.kind;
    if (!this.manual && kind === 'snow' && !HIGH.has(bio)) kind = 'rain';
    if (!this.manual && kind === 'dust' && !DRY.has(bio)) kind = 'cloudy';
    const L = LOOK[kind];
    // about a real minute to fade from one kind to the next (faster when you press W)
    const k = Math.min(1, dt * (this.manual ? 0.5 : 0.06));
    this.cloud += (L.cloud - this.cloud) * k;
    this.rain += (L.rain - this.rain) * k;
    this.dust += (L.dust - this.dust) * k;
    this.snow += (L.snow - this.snow) * k;
    const target = this.rain > 0.08 || this.snow > 0.3 ? 1 : 0;
    this.wet += clamp(target - this.wet, -dt * 0.01, dt * 0.05);
    // snow settles on the ground slowly and melts slowly
    this.cover = clamp((this.cover || 0) + (this.snow > 0.4 ? dt * 0.03 : -dt * 0.01), 0, 1);
    // lightning in a storm: a flash, then thunder a few seconds later
    this.flash = Math.max(0, this.flash - dt * 4);
    if (this.rain > 0.85 && kind === 'storm') {
      this.boltT -= dt;
      if (this.boltT <= 0) {
        this.boltT = 6 + this.rand() * 16;
        const near = this.rand();
        this.flash = 0.5 + near * 0.5;
        this.bolt = { x: 40 + this.rand() * (W - 80), seed: this.rand() * 1e6, t: 0.35 };
        this.thunder.push({ t: 0.6 + (1 - near) * 4, big: near });
      }
    }
    if (this.bolt) { this.bolt.t -= dt; if (this.bolt.t <= 0) this.bolt = null; }
    for (const th of this.thunder) { th.t -= dt; if (th.t <= 0) audio?.thunder?.(th.big); }
    this.thunder = this.thunder.filter(th => th.t > 0);

    // wipers: on whenever something is landing on the glass, faster in heavy rain
    const fall = Math.max(this.rain, this.snow * 0.7);
    if (fall > 0.08) this.wiperOn = true;
    const period = fall > 0.7 ? 1.1 : fall > 0.3 ? 1.5 : 3.2;  // seconds per sweep and back (with a pause when light)
    const prev = this.wiper;
    if (this.wiperOn || this.wiperPhase > 0) {
      this.wiperPhase += dt / period;
      if (this.wiperPhase >= 1) { this.wiperPhase = this.wiperOn ? this.wiperPhase % 1 : 0; if (fall <= 0.04) this.wiperOn = false; }
      const ph = this.wiperPhase;
      const sweep = 0.8;   // the active part of the cycle; the rest is a rest at the bottom
      const u = ph < sweep ? ph / sweep : 0;
      this.wiper = Math.sin(u * Math.PI);
      if (prev < 0.98 && this.wiper >= 0.98 || prev > 0.02 && this.wiper <= 0.02 && u > 0.5) audio?.wiper?.();
    }
    this.wiperPrev = prev;

    // particles in the air
    this.updateDrops(dt, speed, fall);
    // drops on the glass
    if (this.rain > 0.05) {
      const n = this.rain * dt * (40 + speed * 0.8);
      const count = Math.floor(n) + (this.rand() < n % 1 ? 1 : 0);
      for (let i = 0; i < count && this.glass.length < 260; i++)
        this.glass.push({ x: this.rand() * W, y: 18 + this.rand() * 160, r: this.rand() < 0.2 ? 2 : 1, slide: this.rand() < 0.25 ? 4 + this.rand() * 8 : 0, age: 0 });
    }
    for (const d of this.glass) {
      d.age += dt;
      // at speed the air pushes the drops up the glass; parked, they run down
      d.y += (speed > 30 ? -(speed - 30) * 0.15 : d.slide) * dt;
    }
    if (this.rain < 0.05) for (const d of this.glass) d.age += dt * 3;   // drying off
    this.glass = this.glass.filter(d => d.age < (this.rain > 0.05 ? 30 : 6) && d.y > 10 && d.y < 190);
    return said;
  }
  // clear drops the wiper passed over this frame
  wipe(pivots) {
    if (!this.wiperOn && this.wiperPhase === 0) return;
    const a0 = wAng(this.wiperPrev), a1 = wAng(this.wiper);
    const lo = Math.min(a0, a1) - 0.05, hi = Math.max(a0, a1) + 0.05;
    this.glass = this.glass.filter(d => !pivots.some(([px, py, len]) => {
      const dx = d.x - px, dy = d.y - py, r = Math.hypot(dx, dy);
      if (r > len + 3) return false;
      let a = Math.atan2(dy, dx); if (a < 0) a += 2 * Math.PI;
      return a >= lo && a <= hi;
    }));
  }

  updateDrops(dt, speed, fall) {
    const want = Math.round(this.rain * 260 + this.snow * 220 + this.dust * 120);
    const cx = W / 2, cy = HORIZON + 10;
    const v = speed / 60;
    while (this.drops.length < want) this.drops.push(this.newDrop(true));
    if (this.drops.length > want) this.drops.length = want;
    for (const d of this.drops) {
      if (d.kind === 'dust') {
        d.x += (-90 - v * 40) * d.z * dt; d.y += Math.sin(d.x * 0.05 + d.z * 9) * 8 * dt;
      } else {
        // falling, and streaming out from the middle of the view as you drive
        const fx = (d.x - cx) / W, fy = (d.y - cy) / H;
        const fallV = d.kind === 'rain' ? 380 : 32;
        d.x += (fx * v * 520 + (d.kind === 'snow' ? Math.sin(d.y * 0.04 + d.z * 7) * 14 : -30)) * d.z * dt;
        d.y += (fallV + Math.max(0, fy) * v * 380 + Math.min(0, fy) * v * 200) * d.z * dt;
      }
      if (d.x < -10 || d.x > W + 10 || d.y > H || d.y < -20) Object.assign(d, this.newDrop(false));
    }
  }
  newDrop(anywhere) {
    const r = this.rand();
    const total = this.rain + this.snow + this.dust || 1;
    const kind = r * total < this.rain ? 'rain' : r * total < this.rain + this.snow ? 'snow' : 'dust';
    const z = 0.4 + this.rand() * 0.6;
    if (kind === 'dust') return { kind, x: anywhere ? this.rand() * W : W + 5, y: 20 + this.rand() * 170, z };
    // new ones appear near the middle of the view, or across the top
    const mid = !anywhere && this.rand() < 0.5;
    return { kind, z, x: mid ? W / 2 + (this.rand() - 0.5) * 200 : this.rand() * W, y: anywhere ? this.rand() * H : mid ? HORIZON - 20 + this.rand() * 40 : -10 };
  }
}

// wiper angle: parked pointing right along the bottom of the glass, sweeping up and over to the left
export const wAng = w => 2 * Math.PI - 0.06 - w * 2.3;

// rain, snow and dust in the air, in front of the world and behind the glass
export function drawPrecip(ctx, wx, night, ox = 0, oy = 0) {
  if (!wx.drops.length) return;
  const lit = 1 - night * 0.55;
  const rainC = `rgba(${200 * lit | 0},${210 * lit | 0},${225 * lit | 0},0.45)`;
  ctx.fillStyle = rainC;
  for (const d of wx.drops) {
    const x = d.x + ox, y = d.y + oy;
    if (d.kind === 'rain') {
      const len = 3 + d.z * 6;
      const sx = (d.x - W / 2) / W * 3;
      ctx.globalAlpha = 0.35 + d.z * 0.45;
      line(ctx, x, y, x - 1 + sx, y - len, rainC);
    } else if (d.kind === 'snow') {
      ctx.globalAlpha = 0.6 + d.z * 0.4;
      ctx.fillStyle = `rgb(${235 * lit | 0},${238 * lit | 0},${245 * lit | 0})`;
      const s = d.z > 0.8 ? 2 : 1;
      ctx.fillRect(Math.round(x), Math.round(y), s, s);
    } else {
      ctx.globalAlpha = 0.3 + d.z * 0.3;
      ctx.fillStyle = `rgb(${190 * lit | 0},${150 * lit | 0},${100 * lit | 0})`;
      ctx.fillRect(Math.round(x), Math.round(y), 2 + d.z * 4 | 0, 1);
    }
  }
  ctx.globalAlpha = 1;
}

// drops sitting on the windshield
export function drawGlass(ctx, wx, sky) {
  if (!wx.glass.length) return;
  const night = sky.night;
  const hi = css(lerpC([230, 236, 245], [120, 130, 150], night), 0.55);
  const rim = css(lerpC([40, 50, 60], [5, 6, 10], night), 0.35);
  for (const d of wx.glass) {
    const a = d.age > 20 ? clamp(1 - (d.age - 20) / 10, 0, 1) : 1;
    ctx.globalAlpha = a;
    const x = Math.round(d.x), y = Math.round(d.y);
    ctx.fillStyle = rim; ctx.fillRect(x, y + d.r, d.r + 1, 1); ctx.fillRect(x + d.r, y, 1, d.r);
    ctx.fillStyle = hi; ctx.fillRect(x, y, d.r, d.r);
    if (d.slide) { ctx.fillStyle = 'rgba(200,210,225,0.12)'; ctx.fillRect(x, y - 6, 1, 6); }
  }
  ctx.globalAlpha = 1;
}

// a jagged bolt across the sky
export function drawBolt(ctx, wx) {
  const b = wx.bolt; if (!b) return;
  let s = b.seed;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  let x = b.x, y = 0;
  ctx.globalAlpha = Math.min(1, b.t * 4);
  while (y < HORIZON + 4) {
    const nx = x + (rnd() - 0.5) * 18, ny = y + 4 + rnd() * 8;
    line(ctx, x, y, nx, ny, '#f4f4ff', 1);
    if (rnd() < 0.12) line(ctx, nx, ny, nx + (rnd() - 0.5) * 30, ny + 10, '#c8c8ff', 1);
    x = nx; y = ny;
  }
  ctx.globalAlpha = 1;
}

// how the weather changes the sky colours, haze and light
export function weatherSky(sky, wx) {
  if (!wx) return sky;
  const day = 1 - sky.night;
  const c = wx.cloud, d = wx.dust;
  const grey = lerpC([124, 128, 136], [16, 18, 24], sky.night);
  const brown = lerpC([196, 156, 108], [40, 30, 22], sky.night);
  let top = lerpC(sky.top, lerpC(grey, [0, 0, 0], 0.15), c * 0.85);
  let bottom = lerpC(sky.bottom, grey, c * 0.8);
  top = lerpC(top, brown, d * 0.6); bottom = lerpC(bottom, brown, d * 0.85);
  // dull and grey under the clouds, brown in the dust
  const dim = c * 0.32 * day + d * 0.25 * day;
  let tint = sky.tint, tintA = sky.tintA;
  if (dim > 0) {
    const col = d > c ? [120, 90, 60] : [70, 78, 96];
    tint = lerpC(tint, col, dim / (tintA + dim));
    tintA = tintA + dim * (1 - tintA);
  }
  const fogMul = 1 + c * 0.5 + wx.rain * 1.6 + wx.snow * 2.2 + d * 4;
  const q = v => Math.round(v * 20);
  return {
    ...sky, top, bottom, tint, tintA, fogMul,
    snowCover: wx.cover || 0, cloud: c, sunVis: clamp(1 - c * 1.05 - d * 0.6, 0, 1), wet: wx.wet, flash: wx.flash,
    key: sky.key * 100000 + q(c) * 4000 + q(d) * 200 + q(wx.rain) * 10 + Math.round((wx.cover || 0) * 9),
  };
}
