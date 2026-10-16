// "Записать бой": keeps the last seconds of the fight (every body segment of both
// fighters, what they do, the blows) and packs them into a text code the player can send
// to Claude, who turns it back into stick-figure frames (tools/replay.ts + tools/watch.py).
import * as THREE from 'three';
import { partPoint } from './physics';
import type { Sim } from './sim';

const FPS = 15;
const KEEP = 12;
const PARTS = ['pelvis', 'chest', 'head', 'lUpper', 'lFore', 'rUpper', 'rFore', 'lThigh', 'lShin', 'rThigh', 'rShin'];

interface Frame {
  t: number;
  /** Per fighter: both ends of each part's segment, centimetres. */
  seg: number[][];
  act: string[];
}

export class Recorder {
  private frames: Frame[] = [];
  private hits: { t: number; who: number; zone: string; dmg: number; blocked: boolean }[] = [];
  private sim: Sim | null = null;
  private next = 0;
  private a = new THREE.Vector3();
  private b = new THREE.Vector3();

  private seen = 0;

  /** Called every frame: hooks onto a new fight's physics steps. */
  watch(sim: Sim): void {
    if (sim === this.sim) return;
    this.sim = sim;
    this.frames = [];
    this.hits = [];
    this.next = 0;
    this.seen = 0;
    sim.onStep = () => this.step(sim);
  }

  private step(sim: Sim): void {
    // The view empties the event list once a frame; read only what is new.
    if (sim.events.length < this.seen) this.seen = 0;
    for (const ev of sim.events.slice(this.seen)) {
      if (ev.type !== 'hit') continue;
      const e = ev as { target?: unknown; zone?: string; dmg?: number; blocked?: boolean };
      this.hits.push({ t: Math.round(sim.t * 100) / 100, who: e.target === sim.fighters[0] ? 0 : 1, zone: e.zone ?? '', dmg: Math.round((e.dmg ?? 0) * 10) / 10, blocked: !!e.blocked });
    }
    this.seen = sim.events.length;
    if (sim.t < this.next) return;
    this.next = sim.t + 1 / FPS;
    this.frames.push({
      t: Math.round(sim.t * 100) / 100,
      seg: sim.fighters.map((f) => {
        const out: number[] = [];
        for (const name of PARTS) {
          const p = f.rag.byName[name as keyof typeof f.rag.byName];
          const h = p.def.hit;
          partPoint(p, this.a.set(h.a[0], h.a[1], h.a[2]).multiplyScalar(f.scale), this.a);
          partPoint(p, this.b.set(h.b[0], h.b[1], h.b[2]).multiplyScalar(f.scale), this.b);
          for (const x of [this.a.x, this.a.y, this.a.z, this.b.x, this.b.y, this.b.z]) out.push(Math.round(x * 100));
        }
        return out;
      }),
      act: sim.fighters.map((f) => (f.state !== 'ok' ? f.state : f.action ? f.action.kind + (f.action.move ? `:${f.action.move.id}` : '') : '')),
    });
    const keepFrom = sim.t - KEEP;
    while (this.frames.length && this.frames[0].t < keepFrom) this.frames.shift();
    while (this.hits.length && this.hits[0].t < keepFrom) this.hits.shift();
  }

  get seconds(): number {
    return this.frames.length ? this.frames[this.frames.length - 1].t - this.frames[0].t : 0;
  }

  /** The kept seconds as a code: gzip where the browser can, plain otherwise. */
  async code(note = ''): Promise<string> {
    const sim = this.sim;
    if (!sim || !this.frames.length) return '';
    // Each value as the change from the frame before: small numbers, packs well.
    const prev: number[][] = [[], []];
    const frames = this.frames.map((f) => [f.t, ...f.seg.map((s, k) => {
      const d = s.map((x, i) => x - (prev[k][i] ?? 0));
      prev[k] = s;
      return d;
    }), f.act]);
    const json = JSON.stringify({
      v: 1, fps: FPS, parts: PARTS, note,
      names: sim.fighters.map((f) => f.p.name), styles: sim.fighters.map((f) => f.p.discipline),
      map: sim.map.id, frames, hits: this.hits,
    });
    const bytes = new TextEncoder().encode(json);
    if (typeof CompressionStream !== 'undefined') {
      const gz = await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer();
      return 'БОЙ1:' + b64(new Uint8Array(gz));
    }
    return 'БОЙ0:' + b64(bytes);
  }
}

function b64(u: Uint8Array): string {
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}
