// Simulation: a bus shift or a rental-car trip on the map's roads.
import { Weather, NAMES as WX_NAMES } from './weather.js';
import { SEG, MPH2U, BUS_FRONT_SEGS, ZONE_LEN, SEG_PER_MILE, DRAW_DIST, TIME_SCALE, ROAD_W } from './config.js';
import { clamp, timeStr, mulberry } from './gfx.js';
import { Track, nodeKind, reverseEdge, edgeSegs, RING, SPLIT_LOCK, splitL, splitSlope, splitPos, loopG, applyLoop, walkBranch, BR_M } from './track.js';
import { Traffic } from './traffic.js';
import { NODES, outEdges, shortestPath, pathMiles, startHeading, endHeading, normAng } from './world.js';
import { GAS_PRICE, TOW_PRICE, MEAL_PRICE, MOTEL_PRICE } from './career.js';

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
  bus: { type: 'bus', camH: 1100, revMph: 7, maxMph: 68, accel: 5.5, brake: 16, tank: 120, steer: 1.2, tankGal: 0 },
  truck: { type: 'truck', camH: 1150, revMph: 6, maxMph: 65, accel: 5.4, brake: 13, tank: 400, steer: 1.05, tankGal: 0 },
  car: { type: 'car', camH: 600, revMph: 14, maxMph: 88, accel: 9, brake: 24, tank: 330, steer: 1.45, tankGal: 16 },
};

const WX_SAY = {
  clear: 'THE SKY IS CLEARING UP', cloudy: 'CLOUDS ROLLING IN', rain: 'IT STARTS TO RAIN',
  storm: 'A THUNDERSTORM IS COMING', dust: 'DUST STORM AHEAD - SLOW DOWN', snow: 'IT STARTS TO SNOW',
  dustEnd: 'OUT OF THE DUST AT LAST', snowEnd: 'THE SNOW TURNS TO RAIN DOWN HERE',
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
    this.busy = null; this.blink = 0; this.blinking = null;
    this.stops = []; this.choice = null; this.junction = null; this.tailAdded = false; this.revT = 0; this.roadHint = null; this.wrongWayLeg = null; this.camYaw = 0;
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
    this.track.appendEdge(job.path[0], 0, { depart: true });
    for (let i = 1; i < job.path.length; i++) this.track.appendNode(job.path[i].from, job.path[i]);
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
    this.player = { z: (first.idx - BUS_FRONT_SEGS - 10) * SEG, x: 0.5, speed: 0, wheel: 0, fuel: 1, cruise: false, cruiseSpeed: 0, throttle: 0, reverse: false };
    this.openDoors(first);
    this.msg(`PAINTED DESERT COACH LINES - ${job.name}`, 5);
    this.msg(`${job.stops.map(s => NODES[s].name).join(' > ')}`, 5, '#c8d8ff');
  }

  startCar(dest) {
    this.resetDrive('car');
    this.mode = 'car'; this.dest = dest;
    const from = this.career.node;
    this.startNode = from;
    const plan = shortestPath(from, dest) || [];
    this.track = new Track(Math.floor(this.clock) % 9973 + 7, { sideStreets: true });
    this.track.appendEdge(plan.length ? plan[0] : outEdges(from)[0], 0);
    this.player = { z: 3 * SEG, x: 0.5, speed: 0, wheel: 0, fuel: 1, cruise: false, cruiseSpeed: 0, throttle: 0, reverse: false };
    this.msg(`U-DRIVE RENTALS: DROP IT OFF IN ${NODES[dest].name}`, 5);
    this.msg('STOP ANYWHERE IN TOWN TO RETURN IT. M = MAP, U = U-TURN.', 5, '#c8d8ff');
  }

  // A freight haul: from here to load.dest by the deadline, by whatever roads you like.
  startTruck(load) {
    this.resetDrive('truck');
    this.mode = 'truck'; this.dest = load.dest; this.load = load;
    const from = this.career.node;
    this.startNode = from;
    this.clock += 20 * 60;   // hooking up the trailer
    this.deadline = Math.ceil((this.clock + load.hours * 3600) / 900) * 900;
    this.cargo = 100; this.warned = {};
    // heavier loads pull away slower
    this.vehicle = { ...VEHICLES.truck, accel: VEHICLES.truck.accel * (1.2 - load.tons / 50) };
    const plan = shortestPath(from, load.dest) || [];
    this.track = new Track(Math.floor(this.clock) % 9973 + 11, { sideStreets: true });
    this.track.appendEdge(plan.length ? plan[0] : outEdges(from)[0], 0);
    this.player = { z: 3 * SEG, x: 0.5, speed: 0, wheel: 0, fuel: 1, cruise: false, cruiseSpeed: 0, throttle: 0, reverse: false };
    this.msg(`DESERT FREIGHT: ${load.tons} TONS OF ${load.cargo}`, 5);
    this.msg(`DELIVER TO ${NODES[load.dest].name} BY ${timeStr(this.deadline)}. PICK ANY ROUTE.`, 5, '#c8d8ff');
  }
  get free() { return this.mode !== 'bus'; }   // car and truck choose their own roads

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
  // where we are on the network: the node ahead and the miles to it (and the way back)
  locate() {
    const s = this.seg();
    if (s.leg) {
      const N = edgeSegs(s.leg.e);
      return { node: s.leg.e.to, miles: (N - s.k) / SEG_PER_MILE, back: s.leg.e.from, backMiles: s.k / SEG_PER_MILE, e: s.leg.e };
    }
    // on a turn, roundabout or side street: use the next stretch of highway we are heading for
    const segs = this.track.segs;
    for (let j = s.i + 1; j < Math.min(segs.length, s.i + 700); j++) {
      const t = segs[j];
      if (t.leg) { const N = edgeSegs(t.leg.e); return { node: t.leg.e.to, miles: (N - t.k + (j - s.i)) / SEG_PER_MILE, back: t.leg.e.from, backMiles: Math.max(0, t.k - (j - s.i)) / SEG_PER_MILE, e: t.leg.e }; }
    }
    return { node: s.node || s.town || this.track.pending?.node || this.career.node, miles: 0 };
  }
  // car: miles left to the destination (turning around if that is shorter)
  milesToDest() {
    const L = this.locate();
    const via = (node, m) => { if (node === this.dest) return m; const p = shortestPath(node, this.dest); return p ? m + pathMiles(p) : 1e9; };
    const ahead = via(L.node, L.miles);
    const back = L.back ? via(L.back, L.backMiles) : 1e9;
    return Math.min(ahead, back);
  }
  wrongWay() {
    const L = this.locate();
    if (!L.back || L.node === this.dest) return false;
    const via = (node, m) => { if (node === this.dest) return m; const p = shortestPath(node, this.dest); return p ? m + pathMiles(p) : 1e9; };
    return via(L.back, L.backMiles) + 3 < via(L.node, L.miles);
  }
  lastNode() { return this.locate().node; }

  bump(pen, text, big) {
    this.comfort = Math.max(0, this.comfort - pen);
    if (this.mode === 'truck') {
      this.cargo = Math.max(0, this.cargo - pen * (this.load.fragile ? 0.9 : 0.45));
      text = big ? `CRASH! THE ${this.load.cargo} SHIFTS IN THE TRAILER. LOAD ${Math.round(this.cargo)}%` : `BUMP! LOAD ${Math.round(this.cargo)}%`;
    }
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

  // ---------- food, coffee and sleep ----------
  drinkCoffee() {
    const c = this.career;
    c.add(`COFFEE - ${this.pumpName}`, -0.75);
    c.fatigue = Math.max(0, c.fatigue - 18); c.hunger = Math.max(0, c.hunger - 3);
    this.clock += 8 * 60;
    this.msg('HOT, BLACK AND STRONG. YOU FEEL MORE AWAKE.', 3, '#ffd36a');
  }
  updateBusy(dt) {
    const b = this.busy, c = this.career;
    b.t -= dt;
    this.prompt = b.type === 'eat' ? 'EATING... THE PIE IS GOOD' : 'SLEEPING... ZZZ';
    if (b.t > 0) return;
    if (b.type === 'eat') {
      c.add(`MEAL - ${b.sv.name}`, -MEAL_PRICE);
      c.hunger = 0; c.fatigue = Math.max(0, c.fatigue - 8);
      this.clock += 35 * 60;
      this.msg('FULL AND HAPPY. BACK ON THE ROAD.', 3, '#9aff8a');
    } else {
      c.add(`MOTEL - ${b.sv.name}`, -MOTEL_PRICE);
      const hr = (this.clock % 86400) / 3600;
      // a night's sleep: until 07:00 if it's late, otherwise eight hours
      let wake = this.clock + 8 * 3600;
      if (hr > 18 || hr < 4) { const day = Math.floor(this.clock / 86400) * 86400; wake = day + 7 * 3600; if (wake <= this.clock) wake += 86400; }
      this.clock = wake;
      c.fatigue = 0; c.hunger = Math.min(100, c.hunger + 25);
      this.audio.door();
      const morning = (this.clock % 86400) / 3600 < 11;
      this.msg(morning ? `GOOD MORNING! IT'S ${timeStr(this.clock)}.` : `YOU WAKE UP REFRESHED AT ${timeStr(this.clock)}.`, 4, '#ffd36a');
    }
    this.busy = null;
  }
  // hunger and tiredness grow with game time; being tired makes your eyes close
  updateNeeds(dt) {
    const c = this.career, hrs = dt * TIME_SCALE / 3600;
    if (this.busy) { this.blink = this.busy.type === 'sleep' ? 1 : 0; return; }
    c.hunger = Math.min(100, c.hunger + hrs * 13);
    c.fatigue = Math.min(100, c.fatigue + hrs * 6.5 * (c.hunger > 85 ? 1.6 : 1));
    const f = c.fatigue;
    this.blinkT = (this.blinkT ?? 6) - dt;
    if (f > 70 && this.blinkT <= 0 && !this.blinking) {
      this.blinking = { t: 0, dur: 0.25 + (f - 70) / 30 * 1.4 };
      this.blinkT = (3 + Math.random() * 10) * (1.3 - (f - 70) / 30);
    }
    if (this.blinking) {
      const bl = this.blinking;
      bl.t += dt;
      const u = bl.t / bl.dur;
      this.blink = u < 0.3 ? u / 0.3 : u > 0.75 ? Math.max(0, (1 - u) / 0.25) : 1;
      if (u >= 1) { this.blinking = null; this.blink = 0; }
    } else this.blink = 0;
    this.needT = (this.needT ?? 20) - dt;
    if (this.needT <= 0) {
      this.needT = 25 + Math.random() * 20;
      if (f > 92) this.msg('YOU KEEP NODDING OFF. FIND A MOTEL!', 3.5, '#ff8a6a');
      else if (f > 75) this.msg('YAWN... YOUR EYES FEEL HEAVY.', 3, '#ffb040');
      else if (c.hunger > 90) this.msg('YOU FEEL WEAK. YOU NEED A REAL MEAL.', 3.5, '#ff8a6a');
      else if (c.hunger > 70) this.msg('GRUMBLE... YOUR STOMACH WANTS A DINER.', 3, '#ffb040');
    }
  }

  finish(node) { this.finished = true; this.finishTimer = 2.5; this.endNode = node; }

  // ---------- junctions, roundabouts, side streets (car) ----------
  buildChoice(pd) {
    const node = pd.node, kind = nodeKind(node), ring = kind === 'roundabout', split = kind === 'split';
    let outs = outEdges(node);
    if (!ring) { const f = outs.filter(e => e.road.id !== pd.e.road.id); if (f.length) outs = f; }
    const inH = endHeading(pd.e);
    const opts = outs.map(e => {
      const rel = normAng(startHeading(e) - inH);
      const dir = Math.abs(rel) > 2.6 ? 'BACK' : rel < -0.6 ? 'LEFT' : rel > 0.6 ? 'RIGHT' : 'AHEAD';
      return { e, rel, label: `${dir}: ${e.road.hw} ${NODES[e.to].name}` };
    }).sort((a, b) => a.rel - b.rel);
    if (split) opts.forEach((o, j) => { o.label = `${splitPos(j, opts.length)}: ${o.e.road.hw} ${NODES[o.e.to].name}`; });
    const plan = node !== this.dest ? shortestPath(node, this.dest) : null;
    let idx = plan && plan.length ? opts.findIndex(o => o.e.road.id === plan[0].road.id && o.e.to === plan[0].to) : -1;
    if (idx < 0) { let best = 1e9; opts.forEach((o, i) => { if (Math.abs(o.rel) < best) { best = Math.abs(o.rel); idx = i; } }); }
    return { node, opts, idx, recommended: plan && plan.length ? idx : -1, ring, split: split && opts.length > 1 };
  }

  cutTrack(at) {
    this.track.truncate(at);
    this.traffic.cars = this.traffic.cars.filter(c => c.z < (at - 2) * SEG);
    this.choice = null; this.junction = null;
  }

  forkTest(f, input) {
    const p = this.player;
    if (f.kind === 'exit') return p.wheel > 0.3 && p.speed > 0;
    if (f.kind === 'side') return Math.abs(p.speed) < 24 && p.speed > 0 && Math.abs(p.wheel) > 0.8;
    if (f.kind === 'tee') return p.wheel < -0.35;
    return false;
  }

  takeFork(f, i) {
    const tr = this.track, s = this.seg();
    const cut = Math.min(tr.segs.length, Math.max(i + 2, f.cut || 0));
    if (f.kind === 'exit') {
      const info = tr.ring && tr.ring.info;
      this.cutTrack(cut);
      tr.appendExit(f.e, info);
      this.msg(`EXIT: ${f.e.road.hw} TO ${NODES[f.e.to].name}`, 3, '#9aff8a');
    } else if (f.kind === 'side') {
      const side = Math.sign(this.player.wheel);
      const base = { bio: s.bio, mx: s.mx, my: s.my, town: f.town, node: f.town };
      this.cutTrack(cut);
      tr.appendSideStreet(side, f.ret, base);
      this.msg(`TURNING ${side > 0 ? 'RIGHT' : 'LEFT'} ONTO A SIDE STREET`, 2.5, '#c8d8ff');
    } else if (f.kind === 'tee') {
      this.cutTrack(cut);
      tr.appendReturn(f.ret, -1, f.base);
    }
  }

  uturn() {
    const p = this.player, s = this.seg(), i = Math.floor(p.z / SEG);
    if (this.mode === 'bus') { this.msg('NO U-TURNS IN A BUS. HOLD BRAKE TO BACK UP.', 3, '#ffb040'); return; }
    if (Math.abs(p.speed) > 15) { this.msg('SLOW DOWN TO TURN AROUND', 2, '#ffb040'); return; }
    if (s.island) { this.msg('JUST KEEP GOING AROUND THE CIRCLE', 2.5, '#ffb040'); return; }
    if (s.loop && s.loop.on) { this.msg('FOLLOW THE SERVICE ROAD BACK TO THE HIGHWAY', 2.5, '#ffb040'); return; }
    if (s.street) { this.msg('USE THE TURNING CIRCLE AT THE END', 2.5, '#ffb040'); return; }
    if (!s.leg) { this.msg("CAN'T TURN AROUND HERE", 2, '#ffb040'); return; }
    const N = edgeSegs(s.leg.e);
    const k0 = Math.min(N - 1, N - 1 - s.k + 2);
    const back = reverseEdge(s.leg.e);
    this.cutTrack(i + 2);
    this.track.appendUturn(back, k0, { bio: s.bio, mx: s.mx, my: s.my, town: s.town, node: s.town });
    p.cruise = false;
    this.msg(`U-TURN: BACK TOWARD ${NODES[back.to].name}`, 3, '#c8d8ff');
  }

  updateRoads(input) {
    const tr = this.track, p = this.player;
    const i = Math.floor(p.z / SEG), front = this.frontSeg();
    this.roadHint = null;
    for (const n of tr.notices) if (!n.done && front > n.idx - 150 && front < n.idx) { n.done = true; this.msg(n.text, 3, n.color); }
    if (input.take('uturn')) this.uturn();
    this.updateSplit(this.dt || 0);
    if (!this.free) return;
    for (const f of tr.forks) {
      if (f.used || i < f.a || i > f.b || this.seg().loop?.on) continue;
      if (this.forkTest(f, input)) { f.used = true; this.takeFork(f, i); break; }
    }
    // hints for side streets and roundabout exits
    for (const f of tr.forks) {
      if (f.used || i < f.a - (f.kind === 'exit' ? 6 : 30) || i > f.b) continue;
      if (f.kind === 'side' && p.speed < 30 && !this.choice) this.roadHint = 'SIDE STREET: STEER HARD LEFT OR RIGHT';
      if (f.kind === 'exit' && this.choice && this.choice.recommended >= 0) {
        const want = this.choice.opts[this.choice.recommended].e;
        if (want.road.id === f.e.road.id && want.to === f.e.to) this.roadHint = `YOUR EXIT (${f.e.road.hw}): STEER RIGHT >`;
      }
      if (f.kind === 'tee') this.roadHint = 'STOP SIGN: STEER LEFT OR RIGHT';
    }
    if (tr.ring && tr.segs.length - i < DRAW_DIST + 90) tr.appendRing(RING, true);
    this.resolvePending(input);
    this.resolvePending(input);
  }

  // build the next junction (crossroads or roundabout) once it comes into view
  resolvePending(input) {
    const tr = this.track, i = Math.floor(this.player.z / SEG), front = this.frontSeg();
    const pd = tr.pending;
    if (pd) {
      const left = pd.at - front;
      if ((!this.choice || this.choice.node !== pd.node) && left < 900 && !this.activeSplit()) {
        this.junction = null;
        this.choice = this.buildChoice(pd);
        if (this.choice.split) {
          tr.splitSigns(pd.at, this.choice.opts.map(o => o.e));
          this.msg(`THE ROAD SPLITS AT ${NODES[pd.node].name}`, 3, '#9aff8a');
        } else if (this.choice.opts.length > 1 && !this.choice.ring) this.msg(`JUNCTION AHEAD AT ${NODES[pd.node].name}`, 3, '#9aff8a');
      }
      if (left < DRAW_DIST + 60 && this.choice && this.choice.node === pd.node) {
        tr.pending = null;
        if (this.choice.ring) tr.appendRoundabout(pd.node);
        else if (this.choice.split) {
          const sp = tr.appendSplit(pd.node, this.choice.opts.map(o => o.e), this.choice.idx, false);
          tr.splits[tr.splits.length - 1].choice = this.choice;
        }
        else {
          const o = this.choice.opts[this.choice.idx];
          this.junction = { cut: pd.at, node: pd.node, idx: this.choice.idx };
          tr.appendCross(pd.node, o.e);
          tr.appendEdge(o.e);
        }
      }
    }
    const ch = this.choice;
    if (ch && !ch.ring && !ch.split) {
      if (input.take('prevRoute')) ch.idx = Math.max(0, ch.idx - 1);
      if (input.take('nextRoute')) ch.idx = Math.min(ch.opts.length - 1, ch.idx + 1);
      const j = this.junction;
      if (j && ch.idx !== j.idx && i < j.cut - 2) {
        const o = ch.opts[ch.idx];
        tr.truncate(j.cut);
        this.traffic.cars = this.traffic.cars.filter(c => c.z < (j.cut - 2) * SEG);
        tr.appendCross(j.node, o.e);
        tr.appendEdge(o.e);
        j.idx = ch.idx;
      }
      if (j && i > j.cut + 14) { this.choice = null; this.junction = null; }
    }
  }

  // a split you are approaching or driving through, before your road is settled
  activeSplit() {
    const i = Math.floor(this.player.z / SEG);
    return this.track.splits.find(sp => !sp.locked && i > sp.s0 - 400 && i < sp.s0 + SPLIT_LOCK) || null;
  }
  // In a split, whichever road you are closest to is the road you are on.
  updateSplit(dt) {
    this.camYaw -= this.camYaw * Math.min(1, dt * 2.2);
    const s = this.seg(), sp = s.split, p = this.player;
    const act = this.activeSplit();
    if (act && act.choice && this.free) {
      const ch = act.choice, i = Math.floor(p.z / SEG);
      if (ch.recommended >= 0 && ch.recommended !== act.ref && i > act.s0 - 200) {
        const o = ch.opts[ch.recommended];
        this.roadHint = `STEER ${ch.recommended < act.ref ? '< LEFT' : 'RIGHT >'} FOR ${o.e.road.hw} ${NODES[o.e.to].name}`;
      }
    }
    this.updateLoop(s);
    this.updateBranches(s);
    if (!sp) return;
    if (s.ref !== sp.ref) {
      // backed up into a stretch built for the other road: rebuild it for the road you're on
      const ch = this.choice;
      this.cutTrack(s.i);
      this.choice = ch;
      this.track.heading += (sp.theta[sp.ref] - sp.theta[s.ref]) * splitSlope(s.q);
      this.track.appendSplitRun(sp, sp.ref, s.q);
      return;
    }
    const qf = s.q + (p.z % SEG) / SEG;
    if (!sp.locked && qf > SPLIT_LOCK) {
      sp.locked = true;
      const e = sp.edges[sp.ref];
      if (sp.choice) { if (this.choice === sp.choice) this.choice = null; this.msg(`${e.road.hw} TO ${NODES[e.to].name}`, 3, '#9aff8a'); }
    }
    if (sp.locked && qf < SPLIT_LOCK - 8 && sp.choice) { sp.locked = false; if (this.free) this.choice = sp.choice; }
    if (sp.fixed || sp.locked) return;
    const Lr = splitL(sp, sp.ref, qf), Lp = Lr + p.x * ROAD_W;
    // measured to the middle of each road's right-hand lane, where you normally drive
    const lane = 0.5 * ROAD_W;
    let best = sp.ref, bd = Math.abs(Lp - Lr - lane) - 0.25 * ROAD_W;
    for (let j = 0; j < sp.k; j++) { const d = Math.abs(Lp - splitL(sp, j, qf) - lane); if (d < bd) { bd = d; best = j; } }
    if (best === sp.ref) return;
    // swap roads: rebuild what's ahead around the new road, keeping the view exactly where it was
    const yaw = (sp.theta[best] - sp.theta[sp.ref]) * splitSlope(qf);
    p.x = (Lp - splitL(sp, best, qf)) / ROAD_W;
    const ch = this.choice;
    this.cutTrack(s.i);
    this.choice = ch;
    this.track.heading += yaw;
    this.track.appendSplitRun(sp, best, s.q);
    this.camYaw += yaw;
    if (sp.choice) sp.choice.idx = best;
  }

  // Service roads: steer right onto one where it leaves the highway, and back where it rejoins.
  updateLoop(s) {
    const p = this.player, tr = this.track, i = s.i;
    const near = tr.loops.find(lp => i >= lp.a - 160 && i < lp.a + lp.L);
    if (near && !near.on && i < near.a + 40) {
      const c = this.career, needs = [];
      if (p.fuel < 0.6) needs.push('GAS'); if (c.hunger > 45) needs.push('FOOD'); if (c.fatigue > 50 && this.free) needs.push('A BED');
      if (needs.length) this.roadHint = `NEED ${needs.join(' / ')}? KEEP RIGHT ONTO THE SERVICE ROAD`;
    }
    const lp = s.loop;
    if (!lp) return;
    const q = s.lq + (p.z % SEG) / SEG;
    const g = loopG(lp, q), slope = (loopG(lp, q + 0.5) - loopG(lp, q - 0.5)) / SEG;
    const Lp = (lp.on ? g : 0) + p.x * ROAD_W;
    // compared with the right-hand lane of each road
    const dMain = Math.abs(Lp - 0.5 * ROAD_W), dSvc = Math.abs(Lp - g - 0.5 * ROAD_W);
    const want = lp.on ? !(dMain + 0.3 * ROAD_W < dSvc) : (g > 0.3 * ROAD_W && dSvc + 0.3 * ROAD_W < dMain);
    if (want === lp.on && !(lp.on && (q > lp.L - 4 || q < 1))) return;
    if (lp.on && (q > lp.L - 4 || q < 1)) { applyLoop(lp, false); p.x = Lp / ROAD_W; return; }
    applyLoop(lp, want);
    p.x = (Lp - (want ? g : 0)) / ROAD_W;
    this.camYaw += want ? slope : -slope;
    if (want) this.msg(`SERVICE ROAD - ${lp.title}`, 2.5, '#c8d8ff');
  }
  // Branch roads: roundabout exits, side streets, the other way at a stop sign. Steer into one to take it.
  branchesAt(i) {
    const out = [];
    for (const br of this.track.branches) {
      if (i < br.i0 || i >= br.i0 + BR_M) continue;
      const st = walkBranch(this.track.segs, br, i - br.i0);
      out.push({ br, D: st.D, dx: st.dx });
    }
    return out;
  }
  updateBranches(s) {
    const p = this.player, tr = this.track, i = s.i, pct = (p.z % SEG) / SEG;
    // hints as they come up
    for (const br of tr.branches) {
      if (br.fixed || i < br.i0 - 40 || i > br.i0 + (br.kind === 'exit' ? 17 : 6)) continue;
      if (br.kind === 'side' && Math.abs(p.speed) < 35) this.roadHint = 'SIDE STREETS: STEER LEFT OR RIGHT TO TURN IN';
      if (br.kind === 'tee') this.roadHint = 'STOP SIGN: STEER LEFT OR RIGHT';
      if (br.kind === 'exit' && i > br.i0 - 9 && !tr.branches.some(o => o.kind === 'exit' && o !== br && o.i0 < br.i0 && i - o.i0 < 16)) {
        const ch = this.choice, want = ch && ch.recommended >= 0 ? ch.opts[ch.recommended].e : null;
        const mine = want && want.road.id === br.e.road.id && want.to === br.e.to;
        this.roadHint = mine ? `YOUR EXIT: ${br.e.road.hw} - KEEP RIGHT >` : `EXIT: ${br.e.road.hw} ${NODES[br.e.to].name}`;
      }
    }
    if (p.speed <= 0.5) return;
    for (const { br, D, dx } of this.branchesAt(i)) {
      if (br.fixed) continue;
      const Dp = D + dx * pct, Lp = p.x * ROAD_W;
      if (Math.abs(Dp) < 0.3 * ROAD_W) continue;
      // you have to be steering that way, so drifting in your lane never turns you off by accident
      if (Math.sign(p.wheel) !== Math.sign(Dp) || Math.abs(p.wheel) < 0.25) continue;
      if (br.kind !== 'exit' && Math.abs(p.speed) > 32) continue;
      const lane = 0.5 * ROAD_W;
      if (!(Math.abs(Lp - Dp - lane) + 0.25 * ROAD_W < Math.abs(Lp - lane))) continue;
      // take it: rebuild the road from where the branch starts, keeping the view where it was
      const ghost = { i0: br.i0, curves: [], fixed: true, oneway: !!s.island || !!s.oneway, kind: 'ghost' };
      for (let q = 0; q < 60 && tr.segs[br.i0 + q]; q++) ghost.curves.push(tr.segs[br.i0 + q].curve);
      const ch = this.choice;
      this.cutTrack(br.i0);
      if (br.kind !== 'exit') this.choice = ch;
      br.build(tr);
      tr.branches.push(ghost);
      p.x = (Lp - Dp) / ROAD_W;
      this.camYaw += dx / SEG;
      p.cruise = false;
      if (br.kind === 'exit') this.msg(`EXIT: ${br.e.road.hw} TO ${NODES[br.e.to].name}`, 3, '#9aff8a');
      else if (br.kind === 'side') this.msg(`TURNING ${br.side > 0 ? 'RIGHT' : 'LEFT'} ONTO A SIDE STREET`, 2.5, '#c8d8ff');
      return;
    }
  }

  // where the player is across the highway (for traffic), even when on a service road
  mainX() { const s = this.seg(); return this.player.x - (s.carOff || 0); }

  wrongWayCheck() {
    // heading the wrong way?
    const s = this.seg();
    if (s.leg && this.wrongWayLeg !== s.leg && s.k > 60 && this.wrongWay()) {
      this.wrongWayLeg = s.leg;
      this.msg(`WRONG WAY TO ${NODES[this.dest].name}? PRESS U TO TURN AROUND`, 4, '#ffb040');
    }
  }

  // ---------- per frame ----------
  update(dt, input) {
    this.dt = dt;
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
    if (input.take('radio')) { const st = this.audio.cycleRadio(); this.msg(st.off ? 'RADIO OFF' : `RADIO: ${st.label}`, 2.5, '#ffb040'); }
    if (input.take('lights')) this.lightsManual = !this.lightsOn;
    // weather: changes by itself now and then; F (or the WEATHER button) changes it by hand
    const bioName = (this.seg().bio || {}).a;
    if (!this.weather) { this.weather = new Weather(); this.weather.start(bioName, this.clock); }
    if (input.take('weather')) { const k = this.weather.cycle(bioName); this.msg(`WEATHER: ${WX_NAMES[k]}`, 2.5, '#c8d8ff'); }
    const turned = this.weather.update(dt, dt * TIME_SCALE, bioName, Math.abs(p.speed), this.audio);
    if (turned) this.msg(WX_SAY[turned], 3.5, '#c8d8ff');
    this.audio.horn(input.horn);
    this.updateRoads(input);
    // route checks are a little costly: a few times a second is plenty
    this.routeT = (this.routeT || 0) - dt;
    if (this.free && this.routeT <= 0) { this.routeT = 0.5; this.milesLeft = this.milesToDest(); this.wrongWayCheck(); }

    if (this.mode === 'truck' && !this.finished) {
      const left = (this.deadline - this.clock) / 60;
      for (const m of [120, 60, 30, 0]) if (left <= m && !this.warned[m]) {
        this.warned[m] = 1;
        if (m > 0) this.msg(`${m >= 60 ? m / 60 + ' HOUR' + (m > 60 ? 'S' : '') : m + ' MINUTES'} LEFT TO DELIVER`, 3.5, '#ffb040');
        else this.msg(`YOU'RE LATE! THE ${this.load.cargo} WAS DUE AT ${timeStr(this.deadline)}`, 4, '#ff8a6a');
      }
    }
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
    } else if (this.busy) this.updateBusy(dt);
    else if (!this.finished) {
      // pumps, diners and motels come first, so stopping at them never ends the trip by mistake
      for (const pump of this.track.pumps) {
        if (front >= pump.idx - ZONE_LEN && front <= pump.idx + 2 && p.x > 0.15 && this.track.segs[pump.idx]?.zone === 'gas') {
          const slow = Math.abs(p.speed) < 2.5;
          if (p.fuel < 0.97) {
            if (slow) { action = 'fuel'; this.prompt = touch ? 'TAP REFUEL' : 'SPACE: REFUEL'; this.pumpName = pump.name; }
            else this.prompt = 'STOP AT THE PUMPS TO REFUEL';
          } else if (slow && this.career.fatigue > 12) { action = 'coffee'; this.prompt = `${touch ? 'TAP' : 'SPACE:'} BUY A COFFEE (75 CENTS)`; this.pumpName = pump.name; }
        }
      }
      if (!action) for (const sv of this.track.services) {
        if (front < sv.idx - ZONE_LEN || front > sv.idx + 2 || p.x <= 0.15 || (sv.loop && !sv.loop.on)) continue;
        const slow = Math.abs(p.speed) < 2.5;
        if (sv.type === 'diner') {
          if (!slow) this.prompt = `${sv.name}: PULL IN TO EAT`;
          else if (this.career.hunger < 8) this.prompt = "YOU'RE NOT HUNGRY RIGHT NOW";
          else { action = 'eat'; this.prompt = `${touch ? 'TAP' : 'SPACE:'} EAT AT ${sv.name} ($${MEAL_PRICE})`; this.service = sv; }
        } else {
          if (!slow) this.prompt = `${sv.name}: PULL IN TO SLEEP`;
          else if (this.mode === 'bus') this.prompt = 'NO NAPS DURING A SHIFT';
          else if (this.career.fatigue < 20) this.prompt = "YOU'RE NOT TIRED YET";
          else { action = 'sleep'; this.prompt = `${touch ? 'TAP' : 'SPACE:'} SLEEP AT ${sv.name} ($${MOTEL_PRICE})`; this.service = sv; }
        }
      }
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
          if (front > stop.idx + 6 && front <= stop.idx + 70 && !this.prompt) this.prompt = 'PASSED THE STOP - HOLD BRAKE TO BACK UP';
          if (front > stop.idx + 70) {
            stop.state = 'missed';
            this.comfort = Math.max(0, this.comfort - 10);
            this.msg(`MISSED THE STOP AT ${stop.name}!`, 4, '#ff8a6a');
            if (stop.final) this.finish(stop.node);
          }
        }
      } else if (this.mode === 'truck' && !action) {
        // truck: deliver anywhere in the destination town
        const tw = this.seg().town;
        if (tw === this.dest && p.x > 0.15 && !this.seg().island) {
          if (Math.abs(p.speed) < 2.5) { action = 'deliver'; this.prompt = `${touch ? 'TAP' : 'SPACE:'} DELIVER THE ${this.load.cargo}`; }
          else if (p.speed < 40 && !this.prompt) this.prompt = `${NODES[tw].name}: STOP TO DELIVER THE LOAD`;
        }
      } else if (!action) {
        // car: stop anywhere in a town (right lane) to end the trip there
        const tw = this.seg().town;
        if (tw && (tw !== this.startNode || this.milesDriven > 3) && p.x > 0.15 && !this.seg().island) {
          if (Math.abs(p.speed) < 2.5) { action = 'park'; this.prompt = `${touch ? 'TAP' : 'SPACE:'} RETURN THE CAR IN ${NODES[tw].name}`; this.parkNode = tw; }
          else if (tw === this.dest && p.speed < 40 && !this.prompt) this.prompt = `${NODES[tw].name}: STOP ANYWHERE TO RETURN THE CAR`;
        }
      }
      if (input.take('action')) {
        if (action === 'doors') { p.speed = 0; p.cruise = false; this.openDoors(this.nextStop()); }
        else if (action === 'deliver') { p.speed = 0; this.deliveredAt = this.clock; this.finish(this.dest); this.audio.chime(); this.msg(`LOAD DELIVERED IN ${NODES[this.dest].name}.`, 4, '#ffd36a'); }
        else if (action === 'park') { p.speed = 0; this.finish(this.parkNode); this.audio.chime(); this.msg(`ARRIVED IN ${NODES[this.parkNode].name}.`, 4, '#ffd36a'); }
        else if (action === 'fuel') { p.speed = 0; p.cruise = false; this.fueling = true; this.pendingFuel = 0; }
        else if (action === 'coffee') this.drinkCoffee();
        else if (action === 'eat') { p.speed = 0; p.cruise = false; this.busy = { type: 'eat', t: 3, sv: this.service }; this.msg(`A TABLE AT ${this.service.name}...`, 2.5, '#ffd36a'); }
        else if (action === 'sleep') { p.speed = 0; p.cruise = false; this.busy = { type: 'sleep', t: 3.5, sv: this.service }; this.audio.door(); }
      }
    }
    input.take('action');
    if (!this.prompt && this.roadHint) this.prompt = this.roadHint;
    this.action = action;

    // ---- driving ----
    const held = this.doorsOpen || this.fueling || this.finished || !!this.busy;
    this.updateNeeds(dt);
    const seg = segs[Math.floor(p.z / SEG)];
    let throttle = held || p.fuel <= 0 ? 0 : input.gas ? 1 : 0;
    // gears: hold the brake at a standstill to back up, press gas at a standstill to go forward again
    if (!held && input.brake && !input.gas && Math.abs(p.speed) < 0.3) {
      this.revT += dt;
      if (this.revT > 0.45 && !p.reverse) { p.reverse = true; p.cruise = false; this.msg('REVERSE', 1.2, '#ffd36a'); }
    } else if (!input.brake) this.revT = 0;
    if (p.reverse && input.gas && p.speed > -0.3) p.reverse = false;
    let onRoad = Math.abs(p.x) <= 1.12;
    const pct0 = (p.z % SEG) / SEG;
    const side = (seg.br || []).map(b => b.o1 + (b.o2 - b.o1) * pct0).concat(this.branchesAt(seg.i).map(b => (b.D + b.dx * pct0) / ROAD_W));
    if (!onRoad) onRoad = side.some(o => Math.abs(p.x - o) <= 1.12);
    this.offroad = !onRoad;
    if (p.reverse) {
      if (held) p.speed = Math.min(0, p.speed + 30 * dt);
      else if (input.brake && p.fuel > 0) p.speed = Math.max(-V.revMph, p.speed - 6 * dt);
      else if (input.gas) p.speed = Math.min(0, p.speed + V.brake * dt);
      else p.speed = Math.min(0, p.speed + 2.5 * dt);
      throttle = input.brake && !held ? 0.4 : 0;
      p.throttle = throttle;
      if (this.mode !== 'car' && p.speed < -0.5) { this.beepT = (this.beepT || 0) - dt; if (this.beepT <= 0) { this.beepT = 0.6; this.audio.beep?.(); } }
    } else {
      const braking = input.brake || held;
      if (braking && p.cruise) { p.cruise = false; if (!held) this.msg('CRUISE OFF', 1.2); }
      if (p.cruise && !held) {
        if (input.gas) p.cruiseSpeed = Math.max(p.cruiseSpeed, p.speed);
        else throttle = p.speed < p.cruiseSpeed ? clamp((p.cruiseSpeed - p.speed) * 0.5, 0, 1) : 0;
      }
      p.throttle = throttle;
      const grade = (seg.p2.wy - seg.p1.wy) / SEG;
      let acc = throttle * V.accel * (1 - p.speed / V.maxMph) - 0.6 - p.speed * 0.008 - grade * 40;
      // low gear: with the gas down you always crawl up a hill, however heavy the load
      if (throttle > 0 && p.speed < 12) acc = Math.max(acc, 1.5 * throttle);
      // a wet or snowy road: the brakes bite less
      const grip = 1 - (this.weather ? this.weather.wet * (this.weather.snow > 0.5 ? 0.4 : 0.22) : 0);
      if (braking) acc -= held ? 30 : V.brake * grip;
      if (this.offroad && p.speed > 22) acc -= 12;
      p.speed = clamp(p.speed + acc * dt, 0, V.maxMph);
      if (held) p.speed = Math.max(0, p.speed - 30 * dt);
    }

    let target = input.analogSteer;
    if (target === null || target === undefined) target = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    // eyes shut: your hands drift on the wheel
    if (this.blink > 0.7) { if (this.dozeDrift === undefined) this.dozeDrift = (Math.random() - 0.5) * 0.7; target = this.dozeDrift; } else this.dozeDrift = undefined;
    const rate = input.analogSteer != null ? 6 : target === 0 ? 2.6 : 1.6;
    p.wheel += clamp(target - p.wheel, -rate * dt, rate * dt);
    const sp = p.speed / 60;
    p.x += p.wheel * V.steer * Math.min(1, Math.abs(sp) * 1.4) * dt;
    p.x -= seg.curve * 0.2 * sp * sp * dt;
    {
      // you can wander across to a road beside you (a split or a service road), but no further
      let lo = -2.1, hi = 2.1;
      for (const o of side) if (Math.abs(o) < 12) { lo = Math.min(lo, o - 2.1); hi = Math.max(hi, o + 2.1); }
      p.x = clamp(p.x, lo, hi);
    }

    if (Math.abs(p.x) > 1.25 && Math.abs(p.speed) > 3) {
      const sObj = segs[Math.floor(p.z / SEG) + (p.speed > 0 ? 6 : -1)];
      for (const sprite of sObj?.sprites || []) {
        if (sprite.solid && Math.abs(sprite.o - p.x) < 0.55) {
          p.speed = 0; p.x -= Math.sign(p.x) * 0.25;
          this.bump(15, 'OOF! THAT WAS NOT A ROAD.', true);
          break;
        }
      }
    }

    p.z += p.speed * MPH2U * dt;
    p.z = clamp(p.z, 0, this.track.length - SEG * (DRAW_DIST + 20));
    if (p.z === 0 && p.speed < 0) p.speed = 0;
    const miles = Math.abs(p.speed) * dt * TIME_SCALE / 3600;
    this.odometer += miles; this.milesDriven += miles;
    this.airDrop = clamp(this.airDrop + (input.brake && p.speed > 1 ? dt * 0.25 : -dt * 0.05), 0, 0.3);
    p.fuel = Math.max(0, p.fuel - miles / V.tank * (0.75 + throttle * 0.5));
    if (p.fuel < 0.18 && !this.lowFuelWarned) {
      this.lowFuelWarned = true;
      const next = this.track.pumps.find(g => g.idx > front);
      this.msg(`FUEL LOW!${next ? ` NEXT GAS: ${next.name}` : ''}`, 4, '#ffb040');
    }
    if (p.fuel > 0.3) this.lowFuelWarned = false;
    if (p.fuel <= 0 && Math.abs(p.speed) < 0.5 && !held) {
      this.outOfFuelT += dt;
      if (this.outOfFuelT > 0.2 && this.outOfFuelT - dt <= 0.2) this.msg('OUT OF FUEL... WAITING FOR HELP.', 3, '#ff8a6a');
      if (this.outOfFuelT > 4) {
        this.outOfFuelT = 0; p.fuel = 0.25; this.clock += 25 * 60; this.rescues++;
        if (this.mode === 'truck') { this.msg('ROAD SERVICE BROUGHT DIESEL. (+25 MIN)', 4.5, '#ffd36a'); }
        else if (this.mode === 'car') { this.career.add('TOW TRUCK + GAS CAN', -TOW_PRICE); this.msg(`TOW TRUCK BROUGHT GAS. -$${TOW_PRICE} (+25 MIN)`, 4.5, '#ffd36a'); }
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
    if (this.offroad && Math.abs(p.speed) > 3) this.shake = Math.max(this.shake, 0.25);

    const hr = (this.clock % 86400) / 3600;
    const wx = this.weather;
    this.lightsOn = this.lightsManual ?? (hr > 17.4 || hr < 6.9 || (wx && (wx.rain > 0.4 || wx.dust > 0.4 || wx.snow > 0.4)));
    this.traffic.update(dt, this);
    if (this.finished) this.finishTimer -= dt;
  }

  // ---------- results ----------
  report() {
    this.career.clock = this.clock;
    this.career.node = this.endNode;
    this.career.stats.miles += Math.round(this.milesDriven);
    if (this.mode === 'truck') {
      const L = this.load, late = Math.round(((this.deliveredAt ?? this.clock) - this.deadline) / 60);
      let pay = L.pay * (late <= 0 ? 1.15 : Math.max(0.3, 1 - late / 240));
      pay *= 0.4 + 0.6 * this.cargo / 100;
      pay = Math.round(pay * 100) / 100;
      this.career.add(`FREIGHT: ${L.cargo} TO ${NODES[L.dest].name}`, pay);
      this.career.stats.loads = (this.career.stats.loads || 0) + 1;
      this.career.taken = [...(this.career.taken || []).slice(-30), L.id];
      return { mode: 'truck', load: L, late, deadline: this.deadline, arrived: this.deliveredAt, cargo: this.cargo, pay, miles: this.milesDriven, crashes: this.crashes, rescues: this.rescues };
    }
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
