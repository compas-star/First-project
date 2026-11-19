// The hub: your paper map on the table and a clipboard with jobs, car rental, motel and money.
import { W, H } from './config.js';
import { rect, timeStr } from './gfx.js';
import { drawText, textWidth } from './font.js';
import { NODES, JOBS, shortestPath, pathMiles, pathVia } from './world.js';
import { drawMap, nodeAt, FULL_VIEW } from './mapview.js';
import { RENT_PRICE, MOTEL_PRICE } from './career.js';

const MAP = { x: 4, y: 4, w: 296, h: 262, ...FULL_VIEW };
const PX = 306, PW = 170;
const TABS = ['JOBS', 'CAR', 'MOTEL', 'MONEY'];
const money = v => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;
const dur = miles => { const m = Math.round(miles / 50 * 60); return `${Math.floor(m / 60)}H ${String(m % 60).padStart(2, '0')}M`; };

export class Hub {
  constructor(career) { this.career = career; this.tab = 0; this.sel = 0; this.scroll = 0; this.dest = null; this.buttons = []; this.note = null; }

  jobList() {
    const here = this.career.node;
    const mine = JOBS.filter(j => j.stops[0] === here);
    const others = JOBS.filter(j => j.stops[0] !== here).sort((a, b) => (shortestPathMiles(here, a.stops[0]) - shortestPathMiles(here, b.stops[0])));
    return [...mine, ...others];
  }
  destList() {
    const here = this.career.node;
    return Object.values(NODES).filter(n => n.type !== 'junction' && n.id !== here).sort((a, b) => shortestPathMiles(here, a.id) - shortestPathMiles(here, b.id));
  }

  // returns an action for main.js: {type:'bus', job} | {type:'car', dest} | {type:'title'} | null
  update(input) {
    let result = null;
    const c = this.career;
    if (input.take('left')) { this.tab = (this.tab + 3) % 4; this.sel = 0; this.scroll = 0; }
    if (input.take('right')) { this.tab = (this.tab + 1) % 4; this.sel = 0; this.scroll = 0; }
    const list = this.tab === 0 ? this.jobList() : this.tab === 1 ? this.destList() : [];
    if (list.length) {
      if (input.take('up')) this.sel = Math.max(0, this.sel - 1);
      if (input.take('down')) this.sel = Math.min(list.length - 1, this.sel + 1);
      if (this.tab === 1) this.dest = list[this.sel].id;
    }
    // taps on buttons or the map
    for (const tap of input.taps.splice(0)) {
      const b = this.buttons.find(b => tap.x >= b.x && tap.x < b.x + b.w && tap.y >= b.y && tap.y < b.y + b.h);
      if (b) { const r = b.fn(); if (r) result = r; continue; }
      if (tap.x < MAP.x + MAP.w) {
        const n = nodeAt(MAP, tap.x, tap.y);
        if (n && n !== c.node) { this.tab = 1; this.dest = n; this.sel = this.destList().findIndex(d => d.id === n); }
      }
    }
    if (input.take('enter') || input.take('action')) { const r = this.primary && this.primary(); if (r) result = r; }
    if (input.take('pause')) result = { type: 'title' };
    return result;
  }

  draw(ctx, t) {
    const c = this.career;
    this.buttons = []; this.primary = null;
    ctx.fillStyle = '#5a4030'; ctx.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 6) { ctx.fillStyle = y % 12 ? '#563c2c' : '#5e4434'; ctx.fillRect(0, y, W, 3); } // wooden table
    // route to show on the map
    let route = null;
    const list = this.tab === 0 ? this.jobList() : this.tab === 1 ? this.destList() : [];
    if (this.tab === 0 && list[this.sel]) route = list[this.sel].path;
    if (this.tab === 1 && this.dest) route = shortestPath(c.node, this.dest);
    drawMap(ctx, MAP, { here: c.node, selected: this.tab === 1 ? this.dest : null, route }, t);
    rect(ctx, MAP.x + 4, MAP.y + MAP.h - 30, 104, 14, 'rgba(244,236,214,0.92)');
    drawText(ctx, 'ARIZONA ROAD MAP 1994', MAP.x + 8, MAP.y + MAP.h - 26, '#5a2a1a');

    // clipboard
    rect(ctx, PX - 2, 2, PW + 2, H - 4, '#8a6a42'); rect(ctx, PX, 10, PW - 2, H - 14, '#f2ecdc');
    rect(ctx, PX + PW / 2 - 20, 0, 40, 10, '#9a9aa0'); rect(ctx, PX + PW / 2 - 16, 2, 32, 4, '#c8c8d0');
    for (let y = 40; y < H - 6; y += 8) rect(ctx, PX + 2, y, PW - 6, 1, '#dcd4c0');
    const x0 = PX + 6;
    drawText(ctx, c.here.name, x0, 14, '#1a1a4a', textWidth(c.here.name, 2) < PW - 12 ? 2 : 1);
    drawText(ctx, `DAY ${c.day}  ${c.time}`, x0, 27, '#3a3a3a');
    drawText(ctx, money(c.money), PX + PW - 8, 27, c.money < 0 ? '#c0202a' : '#1a7a2a', 1, 'right');
    // tabs
    TABS.forEach((name, i) => {
      const bx = PX + 2 + i * 41, by = 36;
      rect(ctx, bx, by, 40, 12, i === this.tab ? '#2a5a9a' : '#c8bea4');
      drawText(ctx, name, bx + 20, by + 4, i === this.tab ? '#fff' : '#3a2a1a', 1, 'center');
      this.buttons.push({ x: bx, y: by, w: 40, h: 12, fn: () => { this.tab = i; this.sel = 0; this.scroll = 0; } });
    });
    const y0 = 54;
    if (this.tab === 0) this.drawJobs(ctx, x0, y0, list);
    else if (this.tab === 1) this.drawCar(ctx, x0, y0, list);
    else if (this.tab === 2) this.drawMotel(ctx, x0, y0);
    else this.drawMoney(ctx, x0, y0);
    if (this.note) { drawText(ctx, this.note, x0, H - 12, '#c0202a'); }
    drawText(ctx, '< > TABS   ^ v SELECT   ENTER: GO', PX + PW / 2, H - 4 - 2, '#9a8a6a', 1, 'center');
  }

  button(ctx, x, y, w, label, fn, primary) {
    rect(ctx, x, y, w, 15, '#1a1a1a'); rect(ctx, x + 1, y + 1, w - 2, 13, primary ? '#c8402a' : '#4a6a3a');
    drawText(ctx, label, x + w / 2, y + 5, '#fff', 1, 'center');
    this.buttons.push({ x, y, w, h: 15, fn });
    if (primary) this.primary = fn;
  }

  drawJobs(ctx, x0, y0, list) {
    const c = this.career;
    const rows = 9;
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + rows) this.scroll = this.sel - rows + 1;
    list.slice(this.scroll, this.scroll + rows).forEach((j, k) => {
      const i = k + this.scroll, y = y0 + k * 10;
      const here = j.stops[0] === c.node;
      if (i === this.sel) rect(ctx, x0 - 3, y - 2, PW - 8, 10, '#f4dc7a');
      drawText(ctx, `${timeStr(j.dep * 3600)} ${j.name}`, x0, y, here ? '#1a1a1a' : '#8a8274');
      drawText(ctx, `$${j.pay}`, PX + PW - 8, y, here ? '#1a7a2a' : '#8a8274', 1, 'right');
      this.buttons.push({ x: x0 - 3, y: y - 2, w: PW - 8, h: 10, fn: () => { this.sel = i; } });
    });
    const j = list[this.sel];
    if (!j) return;
    const y = y0 + rows * 10 + 4;
    rect(ctx, x0 - 3, y - 3, PW - 8, 1, '#8a7a5a');
    const stops = j.stops.map(s => NODES[s].name);
    drawText(ctx, stops.slice(0, 3).join(' > ') + (stops.length > 3 ? ' >' : ''), x0, y, '#1a1a4a');
    if (stops.length > 3) drawText(ctx, stops.slice(3).join(' > '), x0, y + 8, '#1a1a4a');
    drawText(ctx, `${j.miles} MI VIA ${pathVia(j.path)}`.slice(0, 40), x0, y + 18, '#3a3a3a');
    const dep = c.nextDeparture(j);
    const dayTxt = Math.floor(dep / 86400) + 1 === c.day ? 'TODAY' : `DAY ${Math.floor(dep / 86400) + 1}`;
    drawText(ctx, `DEPARTS ${dayTxt} ${timeStr(dep)}  PAY $${j.pay}+TIPS`, x0, y + 28, '#3a3a3a');
    if (j.stops[0] === c.node) {
      this.button(ctx, x0, y + 40, PW - 14, 'START SHIFT', () => ({ type: 'bus', job: j }), true);
    } else {
      drawText(ctx, `STARTS IN ${NODES[j.stops[0]].name}`, x0, y + 38, '#c0202a');
      this.button(ctx, x0, y + 48, PW - 14, `RENT A CAR TO ${NODES[j.stops[0]].name}`.slice(0, 34), () => { this.tab = 1; this.dest = j.stops[0]; this.sel = this.destList().findIndex(d => d.id === j.stops[0]); }, true);
    }
  }

  drawCar(ctx, x0, y0, list) {
    const c = this.career;
    drawText(ctx, 'U-DRIVE RENTALS - 1 DAY $29.95', x0, y0, '#2a5a9a');
    drawText(ctx, 'TAP A TOWN ON THE MAP', x0, y0 + 9, '#6a5a4a');
    const rows = 7;
    if (this.sel < this.scroll) this.scroll = this.sel;
    if (this.sel >= this.scroll + rows) this.scroll = this.sel - rows + 1;
    list.slice(this.scroll, this.scroll + rows).forEach((n, k) => {
      const i = k + this.scroll, y = y0 + 22 + k * 10;
      if (n.id === this.dest) rect(ctx, x0 - 3, y - 2, PW - 8, 10, '#f4dc7a');
      drawText(ctx, n.name, x0, y, '#1a1a1a');
      drawText(ctx, `${shortestPathMiles(c.node, n.id)} MI`, PX + PW - 8, y, '#5a5a5a', 1, 'right');
      this.buttons.push({ x: x0 - 3, y: y - 2, w: PW - 8, h: 10, fn: () => { this.sel = i; this.dest = n.id; } });
    });
    if (!this.dest) return;
    const path = shortestPath(c.node, this.dest);
    const miles = pathMiles(path);
    const y = y0 + 22 + rows * 10 + 4;
    rect(ctx, x0 - 3, y - 3, PW - 8, 1, '#8a7a5a');
    drawText(ctx, `TO ${NODES[this.dest].name}`, x0, y, '#1a1a4a');
    drawText(ctx, `${miles} MI VIA ${pathVia(path)}`.slice(0, 40), x0, y + 9, '#3a3a3a');
    drawText(ctx, `ABOUT ${dur(miles)} DRIVING`, x0, y + 18, '#3a3a3a');
    drawText(ctx, `RENTAL ${money(RENT_PRICE)} + GAS ~${money(miles / 25 * 1.09)}`, x0, y + 27, '#3a3a3a');
    this.button(ctx, x0, y + 38, PW - 14, 'RENT & DRIVE', () => ({ type: 'car', dest: this.dest }), true);
  }

  drawMotel(ctx, x0, y0) {
    const c = this.career;
    drawText(ctx, `MOTEL IN ${c.here.name}`.slice(0, 40), x0, y0, '#1a1a4a');
    drawText(ctx, 'CLEAN ROOMS - COLOR TV - POOL', x0, y0 + 10, '#3a3a3a');
    drawText(ctx, `ONE NIGHT ${money(MOTEL_PRICE)}`, x0, y0 + 20, '#3a3a3a');
    drawText(ctx, 'SLEEP UNTIL 07:00 TOMORROW', x0, y0 + 30, '#3a3a3a');
    this.button(ctx, x0, y0 + 44, PW - 14, 'CHECK IN', () => { c.sleep(); this.note = 'GOOD MORNING! RISE AND SHINE.'; }, true);
    drawText(ctx, 'TIP: BUS SHIFTS ALSO PASS THE', x0, y0 + 72, '#6a5a4a');
    drawText(ctx, 'TIME - THE BUS LEAVES ON TIME.', x0, y0 + 80, '#6a5a4a');
  }

  drawMoney(ctx, x0, y0) {
    const c = this.career;
    drawText(ctx, `SHIFTS ${c.stats.shifts}  MILES ${c.stats.miles}  RIDERS ${c.stats.passengers}`, x0, y0, '#1a1a4a');
    c.ledger.slice(0, 18).forEach((e, i) => {
      const y = y0 + 12 + i * 9;
      drawText(ctx, `D${e.day} ${e.text}`.slice(0, 30), x0, y, '#3a3a3a');
      drawText(ctx, money(e.amount), PX + PW - 8, y, e.amount < 0 ? '#c0202a' : '#1a7a2a', 1, 'right');
    });
  }
}

const pmCache = {};
function shortestPathMiles(a, b) {
  const k = a + '>' + b;
  if (pmCache[k] === undefined) { const p = shortestPath(a, b); pmCache[k] = p ? pathMiles(p) : 9999; }
  return pmCache[k];
}
