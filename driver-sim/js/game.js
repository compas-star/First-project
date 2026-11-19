// Simulation: a bus shift or a rental-car trip on the map's roads.
import { SEG, MPH2U, BUS_FRONT_SEGS, ZONE_LEN, SEG_PER_MILE, DRAW_DIST, TIME_SCALE } from './config.js';
import { clamp, timeStr, mulberry } from './gfx.js';
import { Track } from './track.js';
import { Traffic } from './traffic.js';
import { NODES, outEdges, shortestPath, pathMiles, startHeading, endHeading, normAng } from './world.js';
import { GAS_PRICE, TOW_PRICE } from './career.js';

const CHATTER_GOOD = [
  'PASSENGER: NICE AND SMOOTH, DRIVER.', 'KID: MOM, LOOK! A COW!', 'PASSENGER: GREAT VIEW OUT HERE.',
  'PASSENGER: CAN YOU TURN THE RADIO UP?', 'OLD MAN: I DROVE THIS ROAD IN \'52.', 'KID: ARE WE THERE YET?',
  'PASSENGER: ZZZ...', 'TOURIST: IS THIS THE REAL ROUTE 66?', 'PASSENGER: WHAT A VIEW.',
];
const CHATTER_BAD = [
  'PASSENGER: HEY! WATCH IT!', 'PASSENGER: I SPILLED MY SODA...', 'KID: I FEEL SICK.',
  'PASSENGER: WHO TAUGHT YOU TO DRIVE?', 'PASSENGER: SLOW DOWN, WILL YA?',
];
export const VEHICLES = {
  bus: { type: 'bus', camH: 1100, maxMph: 68, accel: 5.5, brake: 16, tank: 120, steer: 1.2, tankGal: 0 },
  car: { type: 'car', camH: 600, maxMph: 88, accel: 9, brake: 24, tank: 330, steer: 1.45, tankGal: 16 },
};

export class Game {
  constructor(audio, career) {
    this.audio = audio; this.career = career;
    this.track = null; this.player = { z: 0, x: 0.5, speed: 0, wheel: 0, fuel: 1, throttle: 0 };
    this.msgs = []; this.diceSwing = 0; this.diceV = 0; this.shake = 0; this.clock = career.clock;
    this.passengers = 0; this.comfort = 100; this.odometer = 48213;
  }

  resetDrive(vehicle) {
    this.vehicle = VEHICLES[vehicle];
    this.traffic = new Traffic();
    this.clock = this.career.clock;
    this.passengers = 0; this.delivered = 0;
    this.comfort = 100; this.comfortSum = 0; this.comfortN = 0;
    this.crashes = 0; this.rescues = 0; this.spentFuel = 0; this.milesDriven = 0;
    this.msgs = []; this.prompt = null; this.action = null;
    this.doorsOpen = false; this.boarding = null; this.fueling = false;
    this.diceSwing = 0; this.diceV = 0; this.shake = 0;
    this.lightsManual = null; this.finished = false; this.finishTimer = 0; this.result = null;
    this.announced = {}; this.chatterT = 45; this.outOfFuelT = 0; this.lowFuelWarned = false;
    this.offroad = false; this.lastSteer = 0; this.airDrop = 0; this.mapOpen = false;
    this.stops = []; this.choice = null; this.tailAdded = false;
    this.odometer = vehicle === 'bus' ? 48213 : 23871;
  }

  // ---------- trip setup ----------
  startBus(job) {
    this.resetDrive('bus');
    this.mode = 'bus'; this.job = job;
    const dep = this.career.nextDeparture(job);
    this.clock = Math.max(this.clock, dep - 6 * 60);
    const r = mulberry(job.id.length * 977 + Math.floor(dep / 86400));
    this.track = new Track(job.id.charCodeAt(0) * 31 + job.id.length);
    this.track.appendStart(job.stops[0], startHeading(job.path[0]));
    for (const e of job.path) this.track.appendEdge(e);
    this.track.appendTail(); this.tailAdded = true;
    // stops from the town centres the route passes
    let miles = 0, k = 0;
    const markAt = {};
    for (const m of this.track.marks) if (!markAt[m.node + m.idx]) markAt[m.node + m.idx] = m;
    let edgeIdx = 0;
    for (const m of this.track.marks) {
      if (!job.stops.includes(m.node) || NODES[m.node].type === 'junction') continue;
      if (this.stops.some(s => s.node === m.node)) continue;
      while (edgeIdx < job.path.length && this.track.legs[edgeIdx].s1 - 1 <= m.idx) { miles += job.path[edgeIdx].road.miles; edgeIdx++; }
      const first = k === 0, final = m.node === job.stops[job.stops.length - 1];
      const arr = first ? null : Math.ceil((dep + (miles / 45) * 3600 + (k - 1) * 300) / 300) * 300;
      this.stops.push({
        name: NODES[m.node].name, node: m.node, idx: m.idx, shelter: m.shelter, first, final, arr, dep: first ? dep : null,
        off: final ? 'all' : first ? 0 : 1 + Math.floor(r() * 5), on: final ? 0 : first ? 8 + Math.floor(r() * 12) : Math.floor(r() * 6),
        state: 'pending', arrivedAt: null,
      });
      if (m.shelter) m.shelter.k = 'shelter_full';
      k++;
    }
    const first = this.stops[0];
    this.player = { z: (first.idx - BUS_FRONT_SEGS - 10) * SEG, x: 0.5, speed: 0, wheel: 0, fuel: 1, cruise: false, cruiseSpeed: 0, throttle: 0 };
    this.openDoors(first);
    this.msg(`PAINTED DESERT COACH LINES - ${job.name}`, 5);
    this.msg(`${job.stops.map(s => NODES[s].name).join(' > ')}`, 5, '#c8d8ff');
  }

  startCar(dest) {
    this.resetDrive('car');
    this.mode = 'car'; this.dest = dest;
    const from = this.career.node;
    const plan = shortestPath(from, dest) || [];
    this.track = new Track(Math.floor(this.clock) % 9973 + 7);
    const h = plan.length ? startHeading(plan[0]) : 0;
    this.track.appendStart(from, h);
    if (plan.length) this.track.appendEdge(plan[0]); else { this.track.appendTail(); this.tailAdded = true; }
    const startMark = this.track.marks[0];
    this.player = { z: (startMark.idx - BUS_FRONT_SEGS - 8) * SEG, x: 0.5, speed: 0, wheel: 0, fuel: 1, cruise: false, cruiseSpeed: 0, throttle: 0 };
    this.msg(`U-DRIVE RENTALS: DROP IT OFF IN ${NODES[dest].name}`, 5);
    this.msg('PRESS M FOR THE MAP. Q / E PICK A ROAD AT JUNCTIONS.', 5, '#c8d8ff');
  }

  msg(text, dur = 3.5, color = '#ffffff') {
    if (this.msgs.length && this.msgs[this.msgs.length - 1].text === text) return;
    this.msgs.push({ text, t: dur, color });
  }
  frontSeg() { return Math.floor(this.player.z / SEG) + BUS_FRONT_SEGS; }
  seg() { return this.track.segs[Math.floor(this.player.z / SEG)]; }
  heading() {
    const s = this.seg(), n = this.track.segs[s.i + 1] || s;
    return s.heading + normAng(n.heading - s.heading) * ((this.player.z % SEG) / SEG);
  }
  nextStop() { return this.stops.find(s => s.state === 'pending' || s.state === 'serving') || null; }
  distTo(idx) { return Math.max(0, (idx - this.frontSeg()) / SEG_PER_MILE); }
  // car: miles left to the destination along the planned roads
  milesToDest() {
    const leg = this.track.legs[this.track.legs.length - 1];
    if (!leg) return 0;
    const onLeg = this.distTo(leg.s1 - 1);
    if (leg.e.to === this.dest) return onLeg;
    const rest = shortestPath(leg.e.to, this.dest);
    return onLeg + (rest ? pathMiles(rest) : 0);
  }
  lastNode() { const leg = this.track.legs[this.track.legs.length - 1]; return leg ? leg.e.to : this.career.node; }

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
    if (stop.arr) {
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
    this.doorsOpen = false; this.boarding = null;
    this.audio.door();
    b.stop.state = 'done';
    if (b.stop.first && this.clock < b.stop.dep) this.clock = b.stop.dep; // wait for the scheduled departure
    if (b.stop.final) { this.finish(b.stop.node); this.audio.chime(); this.msg('END OF THE LINE. GOOD JOB, DRIVER!', 5, '#ffd36a'); return; }
    this.msg(b.stop.first ? `ALL ABOARD! DEPARTING ${timeStr(this.clock)}` : 'ALL ABOARD! DOORS CLOSING.', 3, '#9aff8a');
  }

  finish(node) { this.finished = true; this.finishTimer = 2.5; this.endNode = node; }

  // ---------- junctions (car) ----------
  buildChoice(leg) {
    const node = leg.e.to;
    let outs = outEdges(node).filter(e => e.road.id !== leg.e.road.id);
    if (!outs.length) outs = outEdges(node);
    const inH = endHeading(leg.e);
    const opts = outs.map(e => {
      const rel = normAng(startHeading(e) - inH);
      const dir = Math.abs(rel) > 2.6 ? 'U-TURN' : rel < -0.6 ? 'LEFT' : rel > 0.6 ? 'RIGHT' : 'AHEAD';
      return { e, rel, label: `${dir}: ${e.road.hw} ${NODES[e.to].name}` };
    }).sort((a, b) => a.rel - b.rel);
    const plan = node !== this.dest ? shortestPath(node, this.dest) : null;
    let idx = plan && plan.length ? opts.findIndex(o => o.e.road.id === plan[0].road.id && o.e.to === plan[0].to) : -1;
    if (idx < 0) { let best = 1e9; opts.forEach((o, i) => { if (Math.abs(o.rel) < best) { best = Math.abs(o.rel); idx = i; } }); }
    return { node, opts, idx, recommended: idx };
  }

  updateJunction(input) {
    if (this.mode !== 'car' || this.tailAdded) return;
    const leg = this.track.legs[this.track.legs.length - 1];
    const left = leg.s1 - this.frontSeg();
    if (!this.choice && left < 900) {
      this.choice = this.buildChoice(leg);
      if (this.choice.opts.length > 1) this.msg(`JUNCTION AHEAD AT ${NODES[this.choice.node].name}`, 3, '#9aff8a');
    }
    if (this.choice) {
      if (input.take('prevRoute')) this.choice.idx = Math.max(0, this.choice.idx - 1);
      if (input.take('nextRoute')) this.choice.idx = Math.min(this.choice.opts.length - 1, this.choice.idx + 1);
      if (left < DRAW_DIST + 60) {
        const o = this.choice.opts[this.choice.idx];
        this.track.appendEdge(o.e);
        this.choice = null;
      }
    }
  }

  // ---------- per frame ----------
  update(dt, input) {
    const p = this.player, segs = this.track.segs, V = this.vehicle;
    if (input.take('map')) this.mapOpen = !this.mapOpen;
    if (this.mapOpen) { input.take('action'); return; }
    this.clock += dt * TIME_SCALE;
    this.msgs.forEach((m, i) => { m.age = (m.age || 0) + dt; if (i === 0) m.t -= dt * (this.msgs.length > 1 ? 1.8 : 1); });
    this.msgs = this.msgs.filter((m, i) => m.t > 0 && (i === 0 || m.age < 7));

    if (input.take('cruise')) {
      if (p.cruise) { p.cruise = false; this.msg('CRUISE OFF', 1.5); }
      else if (p.speed > 15) { p.cruise = true; p.cruiseSpeed = p.speed; this.msg(`CRUISE SET ${Math.round(p.speed)} MPH`, 1.5, '#9aff8a'); }
      else this.msg('CRUISE NEEDS 15+ MPH', 1.5);
    }
    if (input.take('radio')) { const st = this.audio.cycleRadio(); this.msg(st.style ? `RADIO: ${st.label}` : 'RADIO OFF', 1.5, '#ffb040'); }
    if (input.take('lights')) this.lightsManual = !this.lightsOn;
    this.audio.horn(input.horn);
    this.updateJunction(input);

    // ---- stops, parking and pumps ----
    const front = this.frontSeg();
    this.prompt = null;
    let action = null;
    const touch = input.touch;
    if (this.boarding) this.updateBoarding(dt);
    else if (this.fueling) {
      const add = Math.min(1 - p.fuel, dt * 0.12);
      p.fuel += add;
      if (V.tankGal) { const cost = add * V.tankGal * GAS_PRICE; this.spentFuel += cost; this.pendingFuel += cost; }
      if (Math.random() < dt * 3) this.audio.pump();
      this.prompt = `FUELING... ${Math.round(p.fuel * 100)}%`;
      if (p.fuel >= 0.999 || input.take('action') || input.gas) {
        this.fueling = false;
        if (V.tankGal) { this.career.add(`GAS - ${this.pumpName}`, -Math.round(this.pendingFuel * 100) / 100); }
        this.msg(V.tankGal ? `PAID $${this.pendingFuel.toFixed(2)} FOR GAS.` : 'TANK FULL. COMPANY CARD, NO CHARGE.', 3);
      }
    } else if (!this.finished) {
      if (this.mode === 'bus') {
        const stop = this.nextStop();
        if (stop && stop.state === 'pending') {
          const inZone = front >= stop.idx - ZONE_LEN && front <= stop.idx + 2;
          const dist = (stop.idx - front) / SEG_PER_MILE;
          if (dist < 2 && dist > 1.9 && !this.announced[stop.name + 2]) { this.announced[stop.name + 2] = 1; this.msg(`${stop.name} IN 2 MILES`, 3); }
          if (dist < 0.6 && !this.announced[stop.name]) { this.announced[stop.name] = 1; this.audio.bell(); this.msg(`DING DING! STOP REQUESTED - ${stop.name}`, 3.5, '#ffd36a'); }
          if (inZone && p.x > 0.15) {
            if (p.speed < 2.5) { action = 'doors'; this.prompt = touch ? 'TAP OPEN DOORS' : 'SPACE: OPEN DOORS'; }
            else this.prompt = 'STOP IN THE YELLOW BOX';
          } else if (inZone) this.prompt = 'PULL INTO THE RIGHT LANE';
          if (front > stop.idx + 6) {
            stop.state = 'missed';
            this.comfort = Math.max(0, this.comfort - 10);
            this.msg(`MISSED THE STOP AT ${stop.name}!`, 4, '#ff8a6a');
            if (stop.final) this.finish(stop.node);
          }
          if (input.take('action') && action === 'doors') { p.speed = 0; p.cruise = false; this.openDoors(stop); }
        }
      } else {
        // car: park in any town's yellow box to end the trip there
        const m = this.track.marks.find(mk => NODES[mk.node].type !== 'junction' && front >= mk.idx - ZONE_LEN && front <= mk.idx + 2 && (mk.node !== this.career.node || this.milesDriven > 3));
        if (m && p.x > 0.15) {
          const isDest = m.node === this.dest;
          if (p.speed < 2.5) { action = 'park'; this.prompt = `${touch ? 'TAP' : 'SPACE:'} END TRIP IN ${NODES[m.node].name}`; this.parkNode = m.node; }
          else if (isDest) this.prompt = 'STOP IN THE YELLOW BOX TO RETURN THE CAR';
        }
        if (input.take('action') && action === 'park') { p.speed = 0; this.finish(this.parkNode); this.audio.chime(); this.msg(`ARRIVED IN ${NODES[this.parkNode].name}.`, 4, '#ffd36a'); }
      }
      if (!action) for (const pump of this.track.pumps) {
        if (front >= pump.idx - ZONE_LEN && front <= pump.idx + 2 && p.x > 0.15 && this.track.segs[pump.idx]?.zone === 'gas') {
          if (p.speed < 2.5 && p.fuel < 0.97) { action = 'fuel'; this.prompt = touch ? 'TAP REFUEL' : 'SPACE: REFUEL'; this.pumpName = pump.name; }
          else if (p.fuel < 0.97) this.prompt = 'STOP AT THE PUMPS TO REFUEL';
        }
      }
      if (input.take('action') && action === 'fuel') { p.speed = 0; p.cruise = false; this.fueling = true; this.pendingFuel = 0; }
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
    let acc = throttle * V.accel * (1 - p.speed / V.maxMph) - 0.6 - p.speed * 0.008 - grade * 40;
    if (braking) acc -= held ? 30 : V.brake;
    this.offroad = Math.abs(p.x) > 1.12;
    if (this.offroad && p.speed > 22) acc -= 12;
    p.speed = clamp(p.speed + acc * dt, 0, V.maxMph);
    if (held) p.speed = Math.max(0, p.speed - 30 * dt);

    let target = input.analogSteer;
    if (target === null || target === undefined) target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const rate = input.analogSteer != null ? 6 : target === 0 ? 2.6 : 1.6;
    p.wheel += clamp(target - p.wheel, -rate * dt, rate * dt);
    const sp = p.speed / 60;
    p.x += p.wheel * V.steer * Math.min(1, sp * 1.4) * dt;
    p.x -= seg.curve * 0.2 * sp * sp * dt;
    p.x = clamp(p.x, -2.1, 2.1);

    if (Math.abs(p.x) > 1.25 && p.speed > 3) {
      const sObj = segs[Math.floor(p.z / SEG) + 6];
      for (const sprite of sObj?.sprites || []) {
        if (sprite.solid && Math.abs(sprite.o - p.x) < 0.55) {
          p.speed = 0; p.x -= Math.sign(p.x) * 0.25;
          this.bump(15, 'OOF! THAT WAS NOT A ROAD.', true);
          break;
        }
      }
    }

    p.z += p.speed * MPH2U * dt;
    p.z = Math.min(p.z, this.track.length - SEG * (DRAW_DIST + 20));
    const miles = p.speed * dt * TIME_SCALE / 3600;
    this.odometer += miles; this.milesDriven += miles;
    this.airDrop = clamp(this.airDrop + (input.brake && p.speed > 1 ? dt * 0.25 : -dt * 0.05), 0, 0.3);
    p.fuel = Math.max(0, p.fuel - miles / V.tank * (0.75 + throttle * 0.5));
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
        if (this.mode === 'car') { this.career.add('TOW TRUCK + GAS CAN', -TOW_PRICE); this.msg(`TOW TRUCK BROUGHT GAS. -$${TOW_PRICE} (+25 MIN)`, 4.5, '#ffd36a'); }
        else { this.comfort = Math.max(0, this.comfort - 15); this.msg('A KIND TRUCKER SHARED SOME DIESEL. (+25 MIN)', 4.5, '#ffd36a'); }
      }
    }

    if (this.mode === 'bus') {
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
    }

    const lat = seg.curve * sp * sp + p.wheel * sp;
    this.diceV += (-this.diceSwing * 9 - lat * 1.6 - this.diceV * 1.8) * dt;
    this.diceSwing += this.diceV * dt;
    this.shake = Math.max(0, this.shake - dt * 1.5);
    if (this.offroad && p.speed > 3) this.shake = Math.max(this.shake, 0.25);

    const hr = (this.clock % 86400) / 3600;
    this.lightsOn = this.lightsManual ?? (hr > 17.4 || hr < 6.9);
    this.traffic.update(dt, this);
    if (this.finished) this.finishTimer -= dt;
  }

  // ---------- results ----------
  report() {
    this.career.clock = this.clock;
    this.career.node = this.endNode;
    this.career.stats.miles += Math.round(this.milesDriven);
    if (this.mode === 'car') {
      return { mode: 'car', node: this.endNode, miles: this.milesDriven, fuel: this.spentFuel, rescues: this.rescues, crashes: this.crashes };
    }
    const stops = this.stops.filter(s => !s.first);
    let stars = 5;
    const rows = stops.map(s => {
      if (s.state === 'missed') { stars -= 1; return [s.name, timeStr(s.arr), '--:--', 'MISSED']; }
      if (!s.arrivedAt) return [s.name, timeStr(s.arr), '--:--', '-'];
      const late = Math.round((s.arrivedAt - s.arr) / 60);
      if (late > 10) stars -= 0.5;
      return [s.name, timeStr(s.arr), timeStr(s.arrivedAt), late <= 0 ? 'ON TIME' : `+${late} MIN`];
    });
    const avg = this.comfortN ? this.comfortSum / this.comfortN : 100;
    if (avg < 70) stars -= 0.5; if (avg < 45) stars -= 1;
    stars -= Math.min(2, this.crashes * 0.5) + this.rescues * 0.5;
    stars = clamp(Math.round(stars * 2) / 2, 0.5, 5);
    const onTime = rows.filter(r => r[3] === 'ON TIME').length;
    const tips = Math.round(this.delivered * avg / 100 * 0.75 * 100) / 100;
    const pay = this.job.pay + onTime * 5 + tips;
    this.career.add(`SHIFT: ${this.job.name}`, pay);
    this.career.stats.shifts++; this.career.stats.passengers += this.delivered;
    return { mode: 'bus', job: this.job, rows, avg, stars, pay, delivered: this.delivered, crashes: this.crashes, rescues: this.rescues };
  }
}
