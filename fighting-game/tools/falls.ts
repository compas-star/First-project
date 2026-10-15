import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
RAPIER.init().then(() => {
  for (const pi of [0,1,2,4,8]) {
    const stat:any={}; let maxSpeed=0; const durs:number[]=[];
    for (let s=1;s<=3;s++){
      const [a,b]=applyPreset(PRESETS[pi]); const sim=new Sim(a,b,s*11);
      const prevState=['ok','ok'];
      while(!sim.winner && sim.t<45){ sim.step(sim.stepSize());
        sim.fighters.forEach((f,i)=>{ if(f.state!=='ok' && prevState[i]==='ok'){ stat[f.fall]=(stat[f.fall]??0)+1; } prevState[i]=f.state;
          for(const p of f.rag.parts){ const v=p.body.linvel(); maxSpeed=Math.max(maxSpeed, Math.hypot(v.x,v.y,v.z)/Math.max(1,f.body)); } });
        sim.events.length=0; }
      durs.push(sim.t); sim.dispose();
    }
    console.log(PRESETS[pi].name, 'falls', JSON.stringify(stat), 'max part speed/body', maxSpeed.toFixed(1), 'dur', durs.map(d=>d.toFixed(0)).join(','));
  }
});
