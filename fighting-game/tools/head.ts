// Dumps the sculpted head as triangles for tools/head.py. run.sh head > out.json
import { headGrid } from '../src/headShape';
const { verts, idx } = headGrid(1);
console.log(JSON.stringify({ verts, idx }));
