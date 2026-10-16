// Shaping a single strike with the mouse (or a finger) right in the arena: handles in the
// 3D scene for where the fist or foot loads (wind-up) and the arc it travels, and for the
// shoulders and the hips at the moment of impact. The path is drawn from the fighter's
// real body to the dummy's real head or body, so what you drag is what he throws.
import * as THREE from 'three';
import type { Move, Zone, Keyframe } from './moves';
import { STANCE } from './rig';
import { strikeFrame } from './strikes';
import { own, commit, shapeOf } from './moveEdits';
import type { Sim } from './sim';

interface ViewLike {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  controls: { enabled: boolean };
  canvas: HTMLCanvasElement;
}

type HandleId = 'chamber' | 'via' | 'shoulders' | 'hips';

const COLORS: Record<HandleId, number> = { chamber: 0xf2c14e, via: 0xff8a3a, shoulders: 0x3fa7ff, hips: 0x7fd88f };

export class StrikeEditor {
  move: Move | null = null;
  zone: Zone = 'head';
  private group = new THREE.Group();
  private handles = {} as Record<HandleId, THREE.Mesh>;
  private target: THREE.Mesh;
  private line: THREE.Line;
  private drag: { id: HandleId; plane: THREE.Plane; x: number; y: number; key: Keyframe; base: Record<string, number> } | null = null;
  private ray = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  /** Called after every change, so the panel can show it is edited. */
  onChange: () => void = () => {};

  constructor(private view: ViewLike, private getSim: () => Sim | null) {
    const ball = new THREE.SphereGeometry(0.075, 20, 14);
    for (const id of Object.keys(COLORS) as HandleId[]) {
      const mat = new THREE.MeshBasicMaterial({ color: COLORS[id], depthTest: false, transparent: true, opacity: 0.9 });
      const mesh = new THREE.Mesh(ball, mat);
      mesh.renderOrder = 10;
      mesh.userData.id = id;
      this.handles[id] = mesh;
      this.group.add(mesh);
    }
    this.target = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.015, 8, 24), new THREE.MeshBasicMaterial({ color: 0xff4a3a, depthTest: false }));
    this.target.renderOrder = 10;
    this.group.add(this.target);
    this.line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: 0xf2c14e, depthTest: false }));
    this.line.renderOrder = 9;
    this.group.add(this.line);
    this.group.visible = false;
    view.scene.add(this.group);
    const c = view.canvas;
    c.addEventListener('pointerdown', (e) => this.down(e), true);
    window.addEventListener('pointermove', (e) => this.moveTo(e));
    window.addEventListener('pointerup', () => this.up());
  }

  private on = false;

  set active(on: boolean) {
    this.on = on;
    this.group.visible = on;
    if (!on) this.up();
  }

  get active(): boolean {
    return this.on;
  }

  /** The keyframe that holds the body at impact (made if missing). */
  private impactKey(m: Move): Keyframe {
    const at = m.active[0] + 0.1 * (m.active[1] - m.active[0]);
    let best = -1;
    let d = 1;
    m.keys.forEach((k, i) => {
      if (i === 0 || i === m.keys.length - 1) return;
      if (Math.abs(k.t - at) < d) {
        d = Math.abs(k.t - at);
        best = i;
      }
    });
    if (best >= 0 && d < 0.2) return m.keys[best];
    own(m, false);
    const k: Keyframe = { t: at, pose: {} };
    const i = m.keys.findIndex((x) => x.t > at);
    m.keys.splice(i < 0 ? m.keys.length - 1 : i, 0, k);
    commit(m);
    return k;
  }

  /** Every frame: put the handles where the strike's points are on the live bodies. */
  update(): void {
    const sim = this.getSim();
    const m = this.move;
    if (!this.active || !sim || !m) return;
    const f = sim.fighters[0];
    // While he throws it, the handles get out of the way.
    this.group.visible = !f.action && f.state === 'ok';
    if (!this.group.visible) return;
    const zone = m.zones.includes(this.zone) ? this.zone : m.zones[0];
    const fr = strikeFrame(f, m, zone);
    const sh = shapeOf(m);
    const at = (c: [number, number, number], res: THREE.Vector3) =>
      res.copy(fr.origin).addScaledVector(fr.fwd, c[0] * fr.s).addScaledVector(fr.up, c[1] * fr.s).addScaledVector(fr.out, c[2] * fr.s);
    const pathed = !!m.path && !!sh;
    this.handles.chamber.visible = pathed;
    this.handles.via.visible = pathed && !!sh!.via;
    this.line.visible = pathed;
    this.target.visible = true;
    this.target.position.copy(fr.target);
    this.target.lookAt(this.view.camera.position);
    if (pathed) {
      const ch = new THREE.Vector3();
      // A built-in straight punch loads from where the fist is; a drawn one from the drawn point.
      if (!m.shape && m.path === 'straight' && /Hand$/.test(m.limb)) ch.copy(fr.fist).addScaledVector(fr.up, sh!.chamber[1] * fr.s);
      else at(sh!.chamber, ch);
      this.handles.chamber.position.copy(ch);
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 8; i++) pts.push(new THREE.Vector3().lerpVectors(fr.fist, ch, i / 8));
      const via = sh!.via ? at(sh!.via, new THREE.Vector3()) : null;
      if (via) this.handles.via.position.copy(via);
      for (let i = 1; i <= 24; i++) {
        const t = i / 24;
        if (via) pts.push(new THREE.Vector3().copy(ch).multiplyScalar((1 - t) * (1 - t)).addScaledVector(via, 2 * (1 - t) * t).addScaledVector(fr.target, t * t));
        else pts.push(new THREE.Vector3().lerpVectors(ch, fr.target, t));
      }
      this.line.geometry.setFromPoints(pts);
    }
    // Body handles a little in front of the chest and the hips.
    const chest = f.rag.byName.chest.body.translation();
    const pelvis = f.rag.pelvis.body.translation();
    this.handles.shoulders.position.set(chest.x, chest.y + 0.18 * f.scale, chest.z).addScaledVector(fr.fwd, 0.25 * f.scale);
    this.handles.hips.position.set(pelvis.x, pelvis.y, pelvis.z).addScaledVector(fr.fwd, 0.28 * f.scale);
  }

  private pick(e: PointerEvent): HandleId | null {
    const r = this.view.canvas.getBoundingClientRect();
    this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.view.camera);
    // Generous: the closest handle within a finger's reach on the screen.
    let best: HandleId | null = null;
    let bd = 0.09;
    for (const id of Object.keys(this.handles) as HandleId[]) {
      const h = this.handles[id];
      if (!h.visible) continue;
      const p = h.position.clone().project(this.view.camera);
      const d = Math.hypot(p.x - this.ndc.x, (p.y - this.ndc.y) / (r.width / r.height));
      if (d < bd) {
        bd = d;
        best = id;
      }
    }
    return best;
  }

  private down(e: PointerEvent): void {
    if (!this.active || !this.group.visible || !this.move) return;
    const id = this.pick(e);
    if (!id) return;
    e.stopImmediatePropagation();
    e.preventDefault();
    this.view.controls.enabled = false;
    const m = this.move;
    const n = new THREE.Vector3();
    this.view.camera.getWorldDirection(n);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(n, this.handles[id].position);
    if (id === 'shoulders' || id === 'hips') own(m, false);
    const key = id === 'shoulders' || id === 'hips' ? this.impactKey(m) : m.keys[0];
    const base = { ...STANCE, ...key.pose } as unknown as Record<string, number>;
    if (id === 'chamber' || id === 'via') this.ownShape();
    this.drag = { id, plane, x: e.clientX, y: e.clientY, key, base };
  }

  /** Give the move its own path shape, keeping where the built-in one goes. */
  private ownShape(): void {
    const m = this.move!;
    if (m.shape) return;
    const sim = this.getSim();
    const wasStraight = m.path === 'straight' && /Hand$/.test(m.limb);
    own(m);
    if (wasStraight && sim) {
      // Built-in straight punches load from the fist's own place: make that the drawn point.
      const f = sim.fighters[0];
      const fr = strikeFrame(f, m, m.zones[0]);
      const d = this.handles.chamber.position.clone().sub(fr.origin);
      m.shape!.chamber = [d.dot(fr.fwd) / fr.s, d.dot(fr.up) / fr.s, d.dot(fr.out) / fr.s];
    }
  }

  private moveTo(e: PointerEvent): void {
    const d = this.drag;
    const sim = this.getSim();
    if (!d || !sim || !this.move) return;
    const m = this.move;
    if (d.id === 'chamber' || d.id === 'via') {
      const r = this.view.canvas.getBoundingClientRect();
      this.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.ray.setFromCamera(this.ndc, this.view.camera);
      const p = new THREE.Vector3();
      if (!this.ray.ray.intersectPlane(d.plane, p)) return;
      const fr = strikeFrame(sim.fighters[0], m, m.zones.includes(this.zone) ? this.zone : m.zones[0]);
      const rel = p.sub(fr.origin);
      const c: [number, number, number] = [rel.dot(fr.fwd) / fr.s, rel.dot(fr.up) / fr.s, rel.dot(fr.out) / fr.s];
      const clampC = (v: number) => Math.round(THREE.MathUtils.clamp(v, -1, 1.2) * 100) / 100;
      const sh = m.shape!;
      if (d.id === 'chamber') sh.chamber = [clampC(c[0]), clampC(c[1]), clampC(c[2])];
      else sh.via = [clampC(c[0]), clampC(c[1]), clampC(c[2])];
    } else {
      // Screen drag: sideways turns, up and down leans (shoulders) or sinks (hips).
      const dx = e.clientX - d.x;
      const dy = e.clientY - d.y;
      const k = d.key.pose;
      if (d.id === 'shoulders') {
        k.spineTwist = Math.round(THREE.MathUtils.clamp(d.base.spineTwist + dx * 0.4, -70, 70));
        k.spineLean = Math.round(THREE.MathUtils.clamp(d.base.spineLean + dy * 0.3, -40, 50));
      } else {
        k.pelvisTwist = Math.round(THREE.MathUtils.clamp(d.base.pelvisTwist + dx * 0.5, -100, 100));
        k.crouch = Math.round(THREE.MathUtils.clamp(d.base.crouch + dy * 0.0015, 0, 0.3) * 100) / 100;
      }
    }
    commit(m);
    this.onChange();
  }

  private up(): void {
    if (!this.drag) return;
    this.drag = null;
    this.view.controls.enabled = true;
  }

  /** Arc on or off: a straight line from the wind-up, or a curve through the orange handle. */
  toggleArc(): void {
    const m = this.move;
    if (!m?.path) return;
    this.ownShape();
    const sh = m.shape!;
    sh.via = sh.via ? null : [(sh.chamber[0] + 0.45) / 2, sh.chamber[1] * 0.5 + 0.05, sh.chamber[2] + 0.25];
    commit(m);
    this.onChange();
  }
}
