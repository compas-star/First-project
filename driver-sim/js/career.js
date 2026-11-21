// Career: where you are, what time it is, your money and the ledger. Saved in the browser.
import { NODES, JOBS } from './world.js';
import { timeStr } from './gfx.js';
import { collect } from './souvenirs.js';

const KEY = 'motherRoad.career.v2';
export const RENT_PRICE = 29.95, MOTEL_PRICE = 24.95, MEAL_PRICE = 6.45, GAS_PRICE = 1.09, TOW_PRICE = 45;

export class Career {
  constructor() { this.newGame(); }
  newGame() {
    this.node = 'kingman';
    this.clock = 8 * 3600;           // seconds since day 1, 00:00
    this.money = 150;
    this.ledger = [];
    this.stats = { shifts: 0, miles: 0, passengers: 0, stars: 0 };
    this.hunger = 20; this.fatigue = 10;   // 0 = full / rested, 100 = starving / exhausted
    this.souvenirs = [];
    this.add('STARTING SAVINGS', 150, true);
  }
  get day() { return Math.floor(this.clock / 86400) + 1; }
  get time() { return timeStr(this.clock); }
  get here() { return NODES[this.node]; }

  add(text, amount, initial) {
    if (!initial) this.money = Math.round((this.money + amount) * 100) / 100;
    this.ledger.unshift({ day: this.day, time: this.time, text, amount });
    if (this.ledger.length > 40) this.ledger.length = 40;
    if (!initial) this.save();
  }

  // next departure of a job (absolute clock), at or after "from"
  nextDeparture(job, from = this.clock) {
    const dayStart = Math.floor(from / 86400) * 86400;
    let t = dayStart + job.dep * 3600;
    if (t < from + 5 * 60) t += 86400;
    return t;
  }
  jobsFrom(node) { return JOBS.filter(j => j.stops[0] === node); }

  sleep() {
    const dayStart = Math.floor(this.clock / 86400) * 86400;
    let wake = dayStart + 7 * 3600;
    if (wake <= this.clock) wake += 86400;
    this.clock = wake;
    this.fatigue = 0; this.hunger = Math.min(100, this.hunger + 25);
    this.add(`MOTEL IN ${this.here.name}`, -MOTEL_PRICE);
    return collect(this, this.node);
  }
  eat() {
    this.clock += 35 * 60;
    this.hunger = 0; this.fatigue = Math.max(0, this.fatigue - 8);
    this.add(`DINER IN ${this.here.name}`, -MEAL_PRICE);
    return collect(this, this.node);
  }

  save() {
    try { localStorage.setItem(KEY, JSON.stringify({ node: this.node, clock: this.clock, money: this.money, ledger: this.ledger, stats: this.stats, hunger: this.hunger, fatigue: this.fatigue, taken: this.taken || [], souvenirs: this.souvenirs || [] })); } catch (e) { /* storage may be unavailable */ }
  }
  load() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (!d || !NODES[d.node]) return false;
      Object.assign(this, { hunger: 20, fatigue: 10 }, d);
      return true;
    } catch (e) { return false; }
  }
  static hasSave() { try { return !!localStorage.getItem(KEY); } catch (e) { return false; } }
}
