// Simulation: the bus, the schedule, passengers, fuel and the shift report.
import { SEG, MPH2U, MAX_MPH, TANK_MILES, BUS_FRONT_SEGS, ZONE_LEN, SEG_PER_MILE } from './config.js';
import { clamp, parseTime, timeStr } from './gfx.js';
import { buildTrack, mileOfSeg } from './track.js';
import { Traffic } from './traffic.js';

const CHATTER_GOOD = [
  'PASSENGER: NICE AND SMOOTH, DRIVER.', 'KID: MOM, LOOK! A COW!', 'PASSENGER: GREAT VIEW OUT HERE.',
  'PASSENGER: CAN YOU TURN THE RADIO UP?', 'OLD MAN: I DROVE THIS ROAD IN \'52.', 'KID: ARE WE THERE YET?',
  'PASSENGER: ZZZ...', 'TOURIST: IS THIS THE REAL ROUTE 66?', 'PASSENGER: THAT SUNSET THOUGH.',
];
const CHATTER_BAD = [
  'PASSENGER: HEY! WATCH IT!', 'PASSENGER: I SPILLED MY SODA...', 'KID: I FEEL SICK.',
  'PASSENGER: WHO TAUGHT YOU TO DRIVE?', 'PASSENGER: SLOW DOWN, WILL YA?',
];

export class Game {
  constructor(audio) {
    this.audio = audio;
    this.track = buildTrack();
    this.reset();
  }

  reset() {
    this.track.stops.forEach(s => { s.state = 'pending'; s.arrivedAt = null; if (s.shelter) s.shelter.k = 'shelter_full'; });
    const first = this.track.stops[0];
    this.player = {
      z: (first.idx - BUS_FRONT_SEGS - 10) * SEG, x: 0.5, speed: 0, wheel: 0,
      fuel: 0.5, cruise: false, cruiseSpeed: 0, throttle: 0,
    };
    this.traffic = new Traffic();
    this.clock = parseTime('15:24');
    this.passengers = 0; this.delivered = 0;
    this.comfort = 100; this.comfortSum = 0; this.comfortN = 0;
    this.crashes = 0; this.rescues = 0; this.fuelBought = 0;
    this.msgs = []; this.prompt = null;
    this.doorsOpen = false; this.boarding = null; this.fueling = false;
    this.bgOffset = 0; this.diceSwing = 0; this.diceV = 0; this.shake = 0;
    this.lightsOn = false; this.lightsManual = null;
    this.finished = false; this.finishTimer = 0;
    this.stopIdx = 0; this.announced = {};
    this.chatterT = 45; this.outOfFuelT = 0; this.lowFuelWarned = false;
    this.offroad = false; this.lastSteer = 0;
    // boarding at the depot to start the shift
    this.openDoors(first);
    this.msg('PAINTED DESERT COACH LINES - ROUTE 66 WESTBOUND', 5);
    this.msg('DISPATCH: TANK IS LOW. FILL UP IN WILLIAMS.', 5, '#ffd36a');
  }

  msg(text, dur = 3.5, color = '#ffffff') {
    if (this.msgs.length && this.msgs[this.msgs.length - 1].text === text) return;
    this.msgs.push({ text, t: dur, color });
  }
  mile() { return mileOfSeg(this.player.z / SEG + BUS_FRONT_SEGS); }
  nextStop() { return this.track.stops.find(s => s.state === 'pending' || s.state === 'serving') || null; }
  frontSeg() { return Math.floor(this.player.z / SEG) + BUS_FRONT_SEGS; }

  bump(pen, text, big) {
    this.comfort = Math.max(0, this.comfort - pen);
    this.shake = big ? 1 : 0.5;
    this.crashes++;
    this.audio.bump(big);
    this.msg(text, 3, '#ff8a6a');
  }

  openDoors(stop) {
    this.doorsOpen = true;
    this.audio.door();
    stop.state = 'serving';
    stop.arrivedAt = this.clock;
    const off = stop.off === 'all' ? this.passengers : Math.min(stop.off, this.passengers);
    this.boarding = { stop, off, on: stop.on, t: 0.8 };
    if (stop.arr && !stop.first) {
      const late = Math.round((this.clock - stop.arr) / 60);
      if (late <= 0) this.msg(`${stop.name} - ON TIME${late < -2 ? ` (${-late} MIN EARLY)` : ''}`, 3.5, '#9aff8a');
      else this.msg(`${stop.name} - ${late} MIN LATE`, 3.5, late > 10 ? '#ff8a6a' : '#ffd36a');
    }
  }

  updateBoarding(dt) {
    const b = this.boarding;
    b.t -= dt;
    if (b.t > 0) return;
    if (b.off > 0) { b.off--; this.passengers--; this.delivered++; this.audio.step1(); b.t = 0.35; return; }
    if (b.on > 0) { b.on--; this.passengers++; this.audio.step1(); b.t = 0.35; if (b.on === 0 && b.stop.shelter) b.stop.shelter.k = 'shelter_empty'; return; }
    // done
    this.doorsOpen = false; this.boarding = null;
    this.audio.door();
    b.stop.state = 'done';
    if (b.stop.final) { this.finished = true; this.finishTimer = 2.5; this.audio.chime(); this.msg('END OF THE LINE. GOOD JOB, DRIVER!', 5, '#ffd36a'); return; }
    if (b.stop.first) this.msg(`ALL ABOARD! DEPART ${timeStr(b.stop.dep)} - HEAD WEST`, 4, '#9aff8a');
    else this.msg('ALL ABOARD! DOORS CLOSING.', 2.5, '#9aff8a');
  }

  update(dt, input) {
    const p = this.player, segs = this.track.segs;
    this.clock += dt * 20;
    // show one message at a time; hurry it along when others wait, and drop stale ones
    this.msgs.forEach((m, i) => { m.age = (m.age || 0) + dt; if (i === 0) m.t -= dt * (this.msgs.length > 1 ? 1.8 : 1); });
    this.msgs = this.msgs.filter((m, i) => m.t > 0 && (i === 0 || m.age < 7));

    // ---- one-shot controls ----
    if (input.take('cruise')) {
      if (p.cruise) { p.cruise = false; this.msg('CRUISE OFF', 1.5); }
      else if (p.speed > 15) { p.cruise = true; p.cruiseSpeed = p.speed; this.msg(`CRUISE SET ${Math.round(p.speed)} MPH`, 1.5, '#9aff8a'); }
      else this.msg('CRUISE NEEDS 15+ MPH', 1.5);
    }
    if (input.take('radio')) { const st = this.audio.cycleRadio(); this.msg(st.style ? `RADIO: ${st.label}` : 'RADIO OFF', 1.5, '#ffb040'); }
    if (input.take('lights')) this.lightsManual = !this.lightsOn;
    this.audio.horn(input.horn);

    // ---- stops and pumps ----
    const front = this.frontSeg();
    const stop = this.nextStop();
    this.prompt = null;
    let action = null;
    if (this.boarding) this.updateBoarding(dt);
    else if (this.fueling) {
      p.fuel = Math.min(1, p.fuel + dt * 0.12);
      this.fuelBought += dt * 0.12;
      if (Math.random() < dt * 3) this.audio.pump();
      this.prompt = `FUELING... ${Math.round(p.fuel * 100)}%`;
      if (p.fuel >= 1 || input.take('action') || input.gas) { this.fueling = false; this.msg('TANK FULL. $1.09 A GALLON, WHAT A DEAL.', 3); }
    } else if (!this.finished) {
      if (stop && stop.state === 'pending') {
        const inZone = front >= stop.idx - ZONE_LEN && front <= stop.idx + 2;
        const dist = (stop.idx - front) / SEG_PER_MILE;
        if (dist < 2 && dist > 1.9 && !this.announced[stop.name + 2]) { this.announced[stop.name + 2] = 1; this.msg(`${stop.name} IN 2 MILES`, 3); }
        if (dist < 0.6 && !this.announced[stop.name]) { this.announced[stop.name] = 1; this.audio.bell(); this.msg(`*DING* STOP REQUESTED - ${stop.name}`, 3.5, '#ffd36a'); }
        if (inZone && p.x > 0.15) {
          if (p.speed < 2.5) { action = 'doors'; this.prompt = input.touch ? 'TAP OPEN DOORS' : 'SPACE: OPEN DOORS'; }
          else this.prompt = 'STOP IN THE YELLOW BOX';
        } else if (inZone) this.prompt = 'PULL INTO THE RIGHT LANE';
        if (front > stop.idx + 6) {
          stop.state = 'missed';
          if (stop.shelter) stop.shelter.k = 'shelter_full';
          this.comfort = Math.max(0, this.comfort - 10);
          this.msg(`MISSED THE STOP AT ${stop.name}!`, 4, '#ff8a6a');
          if (stop.final) { this.finished = true; this.finishTimer = 3; }
        }
      }
      for (const pump of this.track.pumps) {
        if (front >= pump.idx - ZONE_LEN && front <= pump.idx + 2 && p.x > 0.15) {
          if (p.speed < 2.5 && p.fuel < 0.97) { action = 'fuel'; this.prompt = input.touch ? 'TAP REFUEL' : 'SPACE: REFUEL'; }
          else if (p.fuel < 0.97) this.prompt = 'STOP AT THE PUMPS TO REFUEL';
        }
      }
      if (input.take('action')) {
        if (action === 'doors') { p.speed = 0; p.cruise = false; this.openDoors(stop); }
        else if (action === 'fuel') { p.speed = 0; p.cruise = false; this.fueling = true; }
      }
    }
    input.take('action');
    this.action = action;

    // ---- driving ----
    const held = this.doorsOpen || this.fueling || this.finished;
    const seg = segs[Math.floor(p.z / SEG)];
    let throttle = held || p.fuel <= 0 ? 0 : input.gas ? 1 : 0;
    const braking = input.brake || held;
    if (braking && p.cruise) { p.cruise = false; if (!held) this.msg('CRUISE OFF', 1.2); }
    if (p.cruise && !held) {
      if (input.gas) p.cruiseSpeed = Math.max(p.cruiseSpeed, p.speed);
      else throttle = p.speed < p.cruiseSpeed ? clamp((p.cruiseSpeed - p.speed) * 0.5, 0, 1) : 0;
    }
    p.throttle = throttle;
    const grade = (seg.p2.wy - seg.p1.wy) / SEG;
    let acc = throttle * 5.5 * (1 - p.speed / MAX_MPH) - 0.6 - p.speed * 0.008 - grade * 40;
    if (braking) acc -= held ? 30 : 16;
    this.offroad = Math.abs(p.x) > 1.12;
    if (this.offroad && p.speed > 22) acc -= 12;
    p.speed = clamp(p.speed + acc * dt, 0, MAX_MPH);
    if (held) p.speed = Math.max(0, p.speed - 30 * dt);

    // steering
    let target = input.analogSteer;
    if (target === null || target === undefined) target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const rate = input.analogSteer != null ? 6 : target === 0 ? 2.6 : 1.6;
    p.wheel += clamp(target - p.wheel, -rate * dt, rate * dt);
    const sp = p.speed / 60;
    p.x += p.wheel * 1.2 * Math.min(1, sp * 1.4) * dt;
    p.x -= seg.curve * 0.2 * sp * sp * dt; // centrifugal drift on curves
    p.x = clamp(p.x, -2.1, 2.1);
    this.bgOffset += seg.curve * sp * dt * 3;

    // solid roadside objects
    if (Math.abs(p.x) > 1.25 && p.speed > 3) {
      const sObj = segs[Math.floor(p.z / SEG) + 6];
      for (const sprite of sObj?.sprites || []) {
        if (Math.abs(sprite.o - p.x) < 0.55 && sprite.k !== 'grass' && sprite.k !== 'fence') {
          p.speed = 0; p.x -= Math.sign(p.x) * 0.25;
          this.bump(15, 'OOF! THAT WAS NOT A ROAD.', true);
          break;
        }
      }
    }

    // move
    p.z += p.speed * MPH2U * dt;
    p.z = Math.min(p.z, this.track.length - SEG * 300);
    const miles = p.speed * dt * 20 / 3600;
    p.fuel = Math.max(0, p.fuel - miles / TANK_MILES * (0.75 + throttle * 0.5) - (held ? 0 : dt * 0.00002));
    if (p.fuel < 0.18 && !this.lowFuelWarned) {
      this.lowFuelWarned = true;
      const next = this.track.pumps.find(g => g.idx > front);
      this.msg(`FUEL LOW!${next ? ` NEXT GAS: ${next.name}` : ''}`, 4, '#ffb040');
    }
    if (p.fuel > 0.3) this.lowFuelWarned = false;
    if (p.fuel <= 0 && p.speed < 0.5 && !held) {
      this.outOfFuelT += dt;
      if (this.outOfFuelT > 0.2 && this.outOfFuelT - dt <= 0.2) this.msg('OUT OF FUEL... WAITING FOR HELP.', 3, '#ff8a6a');
      if (this.outOfFuelT > 4) {
        this.outOfFuelT = 0; p.fuel = 0.25; this.clock += 25 * 60; this.rescues++;
        this.comfort = Math.max(0, this.comfort - 15);
        this.msg('A KIND TRUCKER SHARED SOME DIESEL. (+25 MIN)', 4.5, '#ffd36a');
      }
    }

    // passenger comfort
    const jerk = Math.abs(p.wheel - this.lastSteer) / Math.max(dt, 0.001);
    this.lastSteer = p.wheel;
    let dc = 0.8;
    if (input.brake && p.speed > 20) dc -= 5;
    if (jerk > 2 && p.speed > 35) dc -= 3;
    if (this.offroad && p.speed > 5) dc -= 6;
    this.comfort = clamp(this.comfort + dc * dt, 0, 100);
    if (!held) { this.comfortSum += this.comfort * dt; this.comfortN += dt; }
    this.chatterT -= dt;
    if (this.chatterT < 0 && this.passengers > 0 && !held) {
      const pool = this.comfort > 55 ? CHATTER_GOOD : CHATTER_BAD;
      this.msg(pool[Math.floor(Math.random() * pool.length)], 3.5, '#c8d8ff');
      this.chatterT = 35 + Math.random() * 35;
    }

    // dice and shake
    const lat = seg.curve * sp * sp + p.wheel * sp;
    this.diceV += (-this.diceSwing * 9 - lat * 1.6 - this.diceV * 1.8) * dt;
    this.diceSwing += this.diceV * dt;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    if (this.offroad && p.speed > 3) this.shake = Math.max(this.shake, 0.25);

    this.lightsOn = this.lightsManual ?? (this.clock > parseTime('17:25'));
    this.traffic.update(dt, this);
    if (this.finished) this.finishTimer -= dt;
  }

  report() {
    const stops = this.track.stops.filter(s => !s.first);
    let stars = 5;
    const rows = stops.map(s => {
      if (s.state === 'missed') { stars -= 1; return [s.name, timeStr(s.arr), '--:--', 'MISSED']; }
      const late = Math.round((s.arrivedAt - s.arr) / 60);
      if (late > 10) stars -= 0.5;
      return [s.name, timeStr(s.arr), timeStr(s.arrivedAt), late <= 0 ? 'ON TIME' : `+${late} MIN`];
    });
    const avg = this.comfortN ? this.comfortSum / this.comfortN : 100;
    if (avg < 70) stars -= 0.5; if (avg < 45) stars -= 1;
    stars -= Math.min(2, this.crashes * 0.5) + this.rescues * 0.5;
    stars = clamp(Math.round(stars * 2) / 2, 0.5, 5);
    const onTime = rows.filter(r => r[3] === 'ON TIME').length;
    const pay = 72.5 + onTime * 5 + this.delivered * avg / 100 * 0.75;
    return { rows, avg, stars, pay, delivered: this.delivered, crashes: this.crashes, rescues: this.rescues };
  }
}
