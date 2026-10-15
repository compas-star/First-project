import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
RAPIER.init().then(() => {
  for (const pi of [0,1,2,3]) {
    const time:any={}; let changes=0;
    for (let s=1;s<=2;s++){
      const [a,b]=applyPreset(PRESETS[pi]); const sim=new Sim(a,b,s*13); const prev=['',''];
      while(!sim.winner && sim.t<40){ const h=sim.stepSize(); sim.step(h); sim.fighters.forEach((f,i)=>{ const k=i+':'+f.plan; time[k]=(time[k]??0)+h; if(f.plan!==prev[i]){changes++;prev[i]=f.plan;} }); sim.events.length=0; }
      sim.dispose();
    }
    console.log(PRESETS[pi].name, 'changes', changes, Object.entries(time).map(([k,v]:any)=>k+'='+v.toFixed(0)).join(' '));
  }
});
