import RAPIER from '@dimforge/rapier3d-compat';
import { Sim } from '../src/sim';
import { PRESETS, applyPreset } from '../src/config';
const N = Number(process.argv[3] ?? 5);
const which = process.argv[2] !== undefined && process.argv[2] !== '' ? process.argv[2].split(',').map(Number) : PRESETS.map((_,i)=>i);
RAPIER.init().then(() => {
  for (const pi of which) {
    const pr = PRESETS[pi];
    const wins=[0,0]; let draws=0; const durs:number[]=[]; const stat:any={}; const distSum=[0,0]; let distN=0;
    const moves:any={};
    for (let s=1;s<=N;s++){
      const [a,b]=applyPreset(pr); const sim=new Sim(a,b,s*7+1);
      const seqs=[0,0]; const seen=new Set<number>();
      while(!sim.winner && sim.t<60){ sim.step(sim.stepSize());
        const [A,B]=sim.fighters; if(A.state==='ok'&&B.state==='ok'){ distSum[0]+=A.pos.distanceTo(B.pos); distN++; }
        sim.fighters.forEach((f,i)=>{ if(f.thoughtSeq!==seqs[i]){seqs[i]=f.thoughtSeq; const k=i+':'+(f.thought.startsWith('план')?f.thought:f.thought.split(':')[0]); if(/план|финт|ловлю/.test(f.thought)) stat[k]=(stat[k]??0)+1;}
          if(f.action?.kind==='attack'&&!seen.has(f.action.id)){seen.add(f.action.id); const k=i+':'+f.action.move!.id; moves[k]=(moves[k]??0)+1;} });
        for(const e of sim.events) if(e.type==='hit'){ const k=(e.target.team?'R→B ':'B→R ')+(e.blocked?'блок':e.zone); stat[k]=(stat[k]??0)+1; } else if (e.type==='break'||e.type==='parry'||e.type==='wave'||e.type==='catch') { const k=e.type; stat[k]=(stat[k]??0)+1; }
        sim.events.length=0;
      }
      if(!sim.winner) draws++; else { wins[sim.winner.team]++; durs.push(sim.t); }
      sim.dispose();
    }
    durs.sort((x,y)=>x-y);
    console.log(`${pr.name}: red ${wins[0]} blue ${wins[1]} draw ${draws} median ${durs[durs.length>>1]?.toFixed(1)}s avgDist ${(distSum[0]/distN).toFixed(2)}`);
    console.log('   moves', Object.entries(moves).sort().map(([k,v])=>k+'='+v).join(' '));
    console.log('   ', Object.entries(stat).sort((a:any,b:any)=>b[1]-a[1]).map(([k,v])=>k+'='+v).join(' | '));
  }
});
