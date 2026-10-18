// Timeline of the last moments before the quick-minded fighter is knocked out standing idle.
import RAPIER from '@dimforge/rapier3d-compat';
import { Sim, QUICK } from '../src/sim';
import { MAP_BY_ID } from '../src/maps';
import { PRESETS, applyPreset } from '../src/config';
const MIND = Number(process.argv[2] ?? 3), N = Number(process.argv[3] ?? 10);
RAPIER.init().then(() => {
  (globalThis as { __noLook?: boolean }).__noLook = true;
  let shown = 0;
  for (let s = 1; s <= N && shown < 6; s++) {
    const [a, b] = applyPreset(PRESETS[0]);
    a.mindSpeed = MIND; a.linkMind = false;
    const sim = new Sim(a, b, s * 17 + 4000, MAP_BY_ID.void, { ...QUICK, standing: true });
    const me = sim.fighters[0], he = sim.fighters[1];
    const log: string[] = [];
    let last = '';
    while (!sim.winner && sim.t < 90) {
      sim.step(sim.stepSize());
      const ma = me.action, ha = he.action;
      const line = `me:${ma ? ma.kind + (ma.move ? ':' + ma.move.id : '') + `(${ma.t.toFixed(2)}/${ma.dur.toFixed(2)})` : '-'} "${me.thought}" daze${me.daze.toFixed(2)} | he:${ha ? ha.kind + (ha.move ? ':' + ha.move.id : '') + (ha.feint ? '(feint)' : '') + ` id${ha.id} imp${(ha.impactW - sim.t).toFixed(2)}` : '-'} handled${me.handledThreat}`;
      const key = line.replace(/\(\d\.\d\d\/[\d.]+\)|imp-?[\d.]+/g, '');
      if (key !== last) { log.push(`${sim.t.toFixed(2)} ${line}`); last = key; }
      for (const ev of sim.events) if (ev.type === 'hit') log.push(`${sim.t.toFixed(2)}   HIT ${ev.target === me ? 'me' : 'he'} ${ev.zone} dmg${ev.dmg.toFixed(0)}${ev.blocked ? ' blocked' : ''}`);
      sim.events.length = 0;
      if (me.out && !me.action) break;
    }
    if (me.out) {
      shown++;
      console.log(`--- fight ${s} KO at ${sim.t.toFixed(2)} reactDelay ${me.reactDelay.toFixed(3)}`);
      const t0 = sim.t - 1.0;
      console.log(log.filter((l) => parseFloat(l) > t0).join('\n'));
    }
    sim.dispose();
  }
});
