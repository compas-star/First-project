// Light two-lane traffic: oncoming cars and slower vehicles to overtake.
import { SEG, DRAW_DIST, MPH2U } from './config.js';
import { carSprite, CAR_TYPES, CAR_COLORS } from './sprites.js';
import { BIOMES } from './track.js';

export class Traffic {
  constructor() { this.cars = []; this.tOn = 3; this.tSame = 14; }

  spawn(game, dir) {
    const p = game.player;
    const z = p.z + (DRAW_DIST - 4) * SEG;
    const lane = dir > 0 ? 0.5 : -0.5;
    if (z >= game.track.length - SEG * 4) return;
    // no traffic on roundabouts, side streets and turns
    if (game.track.segs[Math.floor(z / SEG)]?.quiet || game.seg().quiet) return;
    if (this.cars.some(c => Math.abs(c.z - z) < 6000 && Math.sign(c.lane) === Math.sign(lane))) return;
    const type = CAR_TYPES[Math.floor(Math.random() * CAR_TYPES.length)];
    const col = Math.floor(Math.random() * CAR_COLORS.length);
    const mph = dir > 0 ? 34 + Math.random() * 16 : 48 + Math.random() * 16;
    this.cars.push({
      z, x: lane, lane, dir, mph, type,
      spr: carSprite(type, dir > 0 ? 'rear' : 'front', col), honked: false,
    });
  }

  update(dt, game) {
    const p = game.player;
    const seg = Math.floor(p.z / SEG);
    const bio = BIOMES[(game.track.segs[seg] || game.track.segs[0]).bio.a];
    const hr = (game.clock % 86400) / 3600;
    const busy = bio.traffic * (hr > 18.3 || hr < 6.5 ? 0.6 : 1);
    if (!game.finished) {
      this.tOn -= dt; this.tSame -= dt;
      if (this.tOn <= 0) { this.spawn(game, -1); this.tOn = (4 + Math.random() * 9) / busy; }
      if (this.tSame <= 0) { this.spawn(game, 1); this.tSame = (14 + Math.random() * 20) / busy; }
    }
    for (const c of this.cars) {
      c.z += c.dir * c.mph * MPH2U * dt;
      const dist = c.z - p.z;
      let target = c.lane;
      if (c.dir < 0 && dist > 0 && dist < 9000 && game.mainX() < 0.1) {
        target = -1.05; // swerve onto the shoulder
        if (!c.honked && dist < 7000) { c.honked = true; game.audio.honk(0.6); }
      }
      c.x += Math.sign(target - c.x) * Math.min(Math.abs(target - c.x), 1.2 * dt);
      // collisions with the bus
      const wide = c.type === 'semi' || c.type === 'rv' ? 0.72 : 0.62;
      if (dist > 0 && dist < 900 && Math.abs(c.x - game.mainX()) < wide) {
        if (c.dir > 0) {
          if (p.speed > c.mph) {
            p.speed = Math.max(0, c.mph - 6);
            c.z = p.z + 1000;
            game.bump(12, 'BUMP! EASY THERE, DRIVER.');
          }
        } else {
          p.speed = 0;
          c.dead = true;
          game.bump(30, 'CRASH! THE PASSENGERS ARE NOT AMUSED.', true);
        }
      }
      if (dist < -2500 || dist > (DRAW_DIST + 20) * SEG) c.dead = true;
    }
    this.cars = this.cars.filter(c => !c.dead);
    // attach cars to segments for the renderer
    const segs = game.track.segs;
    for (let n = 0; n < DRAW_DIST; n++) { const s = segs[seg + n]; if (s) s.cars.length = 0; }
    if (segs[seg - 1]) segs[seg - 1].cars.length = 0;
    for (const c of this.cars) {
      const s = segs[Math.floor(c.z / SEG)];
      if (s) s.cars.push(c);
    }
  }
}
