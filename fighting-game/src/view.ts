import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildRig, rigNodes, type Rig } from './rig';
import { syncRig, v, q } from './physics';
import { ARENA_R, FLOOR_R, LIMB_NAME, type Fighter, type Limb, type Sim } from './sim';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildArena, type Arena } from './arena';
import { dress, defaultSkin } from './skins';

// Rendering: the arena, fighters and effects. Effects run partly on real time
// (afterimages, labels) and partly on world time (sparks), so a slowed-down
// view keeps sparks hanging in the air the way the fighters do.

const smooth = (x: number) => {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
};

function floorTexture(): THREE.CanvasTexture {
  const size = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const mid = size / 2;
  const px = mid / FLOOR_R;
  g.fillStyle = '#171b24';
  g.fillRect(0, 0, size, size);
  // One ring per meter, a bolder ring every five.
  for (let r = 1; r <= FLOOR_R; r++) {
    g.beginPath();
    g.arc(mid, mid, r * px, 0, Math.PI * 2);
    g.strokeStyle = r % 5 === 0 ? 'rgba(160,175,200,0.22)' : 'rgba(160,175,200,0.08)';
    g.lineWidth = r % 5 === 0 ? 3 : 2;
    g.stroke();
  }
  for (let a = 0; a < 24; a++) {
    const ang = (a / 24) * Math.PI * 2;
    g.beginPath();
    g.moveTo(mid + Math.cos(ang) * px * 2, mid + Math.sin(ang) * px * 2);
    g.lineTo(mid + Math.cos(ang) * px * ARENA_R, mid + Math.sin(ang) * px * ARENA_R);
    g.strokeStyle = 'rgba(160,175,200,0.05)';
    g.lineWidth = 2;
    g.stroke();
  }
  g.beginPath();
  g.arc(mid, mid, ARENA_R * px, 0, Math.PI * 2);
  g.strokeStyle = 'rgba(242,193,78,0.55)';
  g.lineWidth = 6;
  g.stroke();
  g.fillStyle = 'rgba(160,175,200,0.35)';
  g.font = '600 22px "JetBrains Mono", monospace';
  g.textAlign = 'center';
  for (const r of [5, 10]) g.fillText(`${r} м`, mid, mid - r * px - 8);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

class FighterView {
  rig: Rig;
  nodes: THREE.Object3D[];
  ghosts: { root: THREE.Object3D; nodes: THREE.Object3D[]; mat: THREE.MeshBasicMaterial; age: number }[] = [];
  ghostTimer = 0;
  /** Bare skin: it gets a sweaty shine as he tires. */
  private skinMat: THREE.MeshStandardMaterial;
  /** Bruises and cuts where blows landed, swelling round the eyes. */
  private marks: { mesh: THREE.Mesh; group: THREE.Object3D; n: number }[] = [];
  private swell: THREE.Mesh[] = [];
  ring: THREE.Mesh;
  /** A faint ring in the team colour always under the fighter. */
  mark: THREE.Mesh;
  ringAge = 1;
  lastThink = 0;
  bubble: HTMLDivElement;
  bubbleAge = 9;
  private shownBroken: Record<Limb, boolean> = { lArm: false, rArm: false, lLeg: false, rLeg: false };
  private hurtMat: THREE.MeshStandardMaterial;
  lastThought = -1;

  constructor(
    readonly f: Fighter,
    scene: THREE.Scene,
    labels: HTMLElement,
  ) {
    this.rig = buildRig(f.p.color, f.girth);
    let seed = 0;
    for (const ch of f.p.name) seed = (seed * 31 + ch.charCodeAt(0)) | 0;
    this.skinMat = dress(this.rig, f.p.skin ?? defaultSkin(f.p.discipline), f.p.color, f.girth, seed);
    this.hurtMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(f.p.color).multiplyScalar(0.35).lerp(new THREE.Color(0x5a2a6a), 0.5),
      roughness: 0.8,
    });
    this.nodes = rigNodes(this.rig);
    scene.add(this.rig.root);

    for (let i = 0; i < 12; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: f.p.color,
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const root = this.rig.root.clone(true);
      root.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.material = mat;
          o.castShadow = false;
        }
      });
      root.visible = false;
      const nodes: THREE.Object3D[] = [];
      root.traverse((o) => nodes.push(o));
      scene.add(root);
      this.ghosts.push({ root, nodes, mat, age: 9 });
    }

    this.mark = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.5, 40),
      new THREE.MeshBasicMaterial({ color: f.p.color, transparent: true, opacity: 0.35, depthWrite: false }),
    );
    this.mark.rotation.x = -Math.PI / 2;
    scene.add(this.mark);

    this.ring = new THREE.Mesh(
      new THREE.RingGeometry(0.55, 0.62, 48),
      new THREE.MeshBasicMaterial({ color: f.p.color, transparent: true, opacity: 0, depthWrite: false }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.02;
    scene.add(this.ring);

    this.bubble = document.createElement('div');
    this.bubble.className = `bubble team${f.team}`;
    labels.appendChild(this.bubble);
  }

  update(realDt: number, apparent: number): void {
    const f = this.f;
    const r = this.rig.root;
    syncRig(f.rag, this.rig, f.scale);
    this.showInjuries();
    this.showWear();
    r.updateMatrixWorld(true);

    // Afterimages appear when the fighter looks faster than a normal person.
    const kind = f.action?.kind;
    const moving = f.groundSpeed > 1 || kind === 'attack' || kind === 'dodge';
    this.ghostTimer -= realDt;
    if (((apparent > 1.8 && moving) || kind === 'dash') && this.ghostTimer <= 0) {
      this.ghostTimer = 0.03;
      const g = this.ghosts.reduce((a, b) => (b.age > a.age ? b : a));
      for (let i = 0; i < this.nodes.length; i++) {
        g.nodes[i].position.copy(this.nodes[i].position);
        g.nodes[i].quaternion.copy(this.nodes[i].quaternion);
        g.nodes[i].scale.copy(this.nodes[i].scale);
      }
      g.age = 0;
      g.root.visible = true;
    }
    const life = 0.3;
    for (const g of this.ghosts) {
      g.age += realDt;
      g.mat.opacity = g.age < life ? 0.32 * (1 - g.age / life) : 0;
      g.root.visible = g.age < life;
    }

    // A pulse under the feet each time the fighter makes a decision.
    if (f.thinkSeq !== this.lastThink) {
      this.lastThink = f.thinkSeq;
      if (this.ringAge > 0.12) this.ringAge = 0;
    }
    this.ringAge += realDt;
    const ringMat = this.ring.material as THREE.MeshBasicMaterial;
    ringMat.opacity = Math.max(0, 0.7 * (1 - this.ringAge / 0.35));
    const rs = f.scale * f.girth * (1 + this.ringAge * 1.5);
    this.ring.scale.set(rs, rs, rs);
    this.ring.position.set(f.pos.x, 0.02, f.pos.z);
    const ms = f.scale * f.girth;
    this.mark.scale.set(ms, ms, ms);
    this.mark.position.set(f.pos.x, 0.012, f.pos.z);
    this.mark.visible = f.state === 'ok';

    if (f.thoughtSeq !== this.lastThought) {
      this.lastThought = f.thoughtSeq;
      if (this.bubble.textContent !== f.thought) this.bubble.textContent = f.thought;
      this.bubbleAge = 0;
    }
    this.bubbleAge += realDt;
  }

  /**
   * A blow that landed leaves a mark on the part it hit: a red patch that
   * darkens to purple as more land on the same spot. Hard head blows can cut.
   */
  addMark(part: string, at: THREE.Vector3, dmg: number): boolean {
    const r = this.rig;
    const group = ({
      head: r.head, chest: r.spine, pelvis: r.pelvis, lUpper: r.lSh, lFore: r.lEl, rUpper: r.rSh, rFore: r.rEl,
      lThigh: r.lHip, lShin: r.lKn, rThigh: r.rHip, rShin: r.rKn,
    } as Record<string, THREE.Object3D>)[part];
    if (!group || dmg < 2.5) return false;
    group.updateWorldMatrix(true, false);
    const local = group.worldToLocal(at.clone()).divideScalar(this.f.scale);
    // A blow on the same spot deepens the old mark instead of adding a new one.
    const near = this.marks.find((m) => m.group === group && m.mesh.position.distanceTo(local) < 0.05);
    const cut = part === 'head' && dmg > 9 && Math.random() < 0.35;
    if (near && !cut) {
      near.n += dmg / 6;
      const k = Math.min(1, near.n / 6);
      (near.mesh.material as THREE.MeshStandardMaterial).color.setHex(0xb34848).lerp(new THREE.Color(0x4a2046), k);
      near.mesh.scale.setScalar(1 + 0.6 * k);
      return false;
    }
    if (this.marks.length > 40) return false;
    const mat = new THREE.MeshStandardMaterial({ color: cut ? 0x7a0606 : 0xb34848, roughness: cut ? 0.25 : 0.8 });
    const mesh = cut
      ? new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.008, 0.01), mat)
      : new THREE.Mesh(new THREE.SphereGeometry(0.026, 8, 6), mat);
    mesh.position.copy(local);
    if (cut) mesh.rotation.z = (Math.random() - 0.5) * 1.2;
    group.add(mesh);
    this.marks.push({ mesh, group, n: dmg / 6 });
    return cut;
  }

  /** Swollen eyes and sweat follow the head damage and the tiredness. */
  private showWear(): void {
    const f = this.f;
    if (this.swell.length === 0 && f.trauma > 0.08) {
      const m = new THREE.MeshStandardMaterial({ color: 0x8a4a5a, roughness: 0.6 });
      const z = 0.098 * Math.sqrt(f.girth);
      for (const x of [0.042, -0.042]) {
        const s = new THREE.Mesh(new THREE.SphereGeometry(0.022, 10, 8), m);
        s.position.set(x, 0.165, z);
        this.rig.head.add(s);
        this.swell.push(s);
      }
    }
    // One eye takes more than the other.
    this.swell.forEach((s, i) => s.scale.setScalar(Math.min(1.8, 0.4 + f.trauma * (i ? 2.2 : 3.2))));
    const tired = Math.min(1, f.wear * 1.4 + (1 - Math.max(0, f.stamina)) * 0.3);
    this.skinMat.roughness = 0.7 - 0.45 * tired;
  }

  /** A broken limb turns dark, so it is clear why it hangs. */
  private showInjuries(): void {
    const groups: Record<Limb, THREE.Object3D> = {
      lArm: this.rig.lSh, rArm: this.rig.rSh, lLeg: this.rig.lHip, rLeg: this.rig.rHip,
    };
    for (const l of Object.keys(groups) as Limb[]) {
      if (this.f.broken[l] === this.shownBroken[l]) continue;
      this.shownBroken[l] = this.f.broken[l];
      groups[l].traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        if (this.f.broken[l]) {
          o.userData.mat ??= o.material;
          o.material = this.hurtMat;
        } else if (o.userData.mat) {
          o.material = o.userData.mat;
        }
      });
    }
  }

  headPoint(out: THREE.Vector3): THREE.Vector3 {
    this.rig.head.getWorldPosition(out);
    out.y += 0.45 * this.f.scale;
    return out;
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.rig.root, this.ring, this.mark);
    for (const g of this.ghosts) scene.remove(g.root);
    this.bubble.remove();
  }
}

interface Spark {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  max: number;
  color: THREE.Color;
}

export class View {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  private fighters: FighterView[] = [];
  private crateMeshes: THREE.Mesh[] = [];
  private sparks: Spark[] = [];
  private sparkGeo = new THREE.BufferGeometry();
  private sparkPos: Float32Array;
  private sparkCol: Float32Array;
  private waves: { mesh: THREE.Mesh; age: number; size: number }[] = [];
  private pops: { el: HTMLDivElement; pos: THREE.Vector3; age: number }[] = [];
  private shake = 0;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private arena: Arena | null = null;
  private arenaId = '';
  /** Crowd excitement 0..1: jumps on big blows and knockdowns, settles back. */
  private excite = 0;
  private clockT = 0;
  /** Real seconds the world stays frozen after a heavy blow (hit-stop). */
  hitStop = 0;
  private hitStopCool = 0;
  private sim: Sim | null = null;
  private tmp = new THREE.Vector3();
  private tmp2 = new THREE.Vector3();
  private follow = new THREE.Vector3();
  /** Fighter the camera closes in on after a knockout. */
  koFocus: Fighter | null = null;
  private koZoom = 0;
  /** Real seconds since the player last turned the camera. */
  private sinceTouch = 99;
  private touching = false;

  constructor(
    readonly canvas: HTMLCanvasElement,
    readonly labels: HTMLElement,
  ) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

    this.scene.background = new THREE.Color(0x0b0e14);
    this.scene.fog = new THREE.Fog(0x0b0e14, 22, 55);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(6.5, 3.6, 0);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 1.1, 0);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    // Distance is framed automatically, the player only turns the camera around the fight.
    this.controls.enableZoom = false;
    this.controls.addEventListener('start', () => (this.touching = true));
    this.controls.addEventListener('end', () => {
      this.touching = false;
      this.sinceTouch = 0;
    });
    this.controls.maxPolarAngle = Math.PI * 0.49;

    // Soft reflections for metal and wet surfaces.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.3;

    this.hemi = new THREE.HemisphereLight(0xb8c6e6, 0x1a1410, 0.9);
    this.scene.add(this.hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.2);
    this.sun = sun;
    sun.position.set(8, 16, 6);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -16;
    sc.right = sc.top = 16;
    sc.far = 50;
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight(0x6f8cff, 0.8);
    rim.position.set(-10, 6, -8);
    this.scene.add(rim);


    const max = 400;
    this.sparkPos = new Float32Array(max * 3);
    this.sparkCol = new Float32Array(max * 3);
    this.sparkGeo.setAttribute('position', new THREE.BufferAttribute(this.sparkPos, 3));
    this.sparkGeo.setAttribute('color', new THREE.BufferAttribute(this.sparkCol, 3));
    const points = new THREE.Points(
      this.sparkGeo,
      new THREE.PointsMaterial({
        size: 0.09,
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    );
    points.frustumCulled = false;
    this.scene.add(points);

    for (let i = 0; i < 8; i++) {
      const mesh = new THREE.Mesh(
        new THREE.RingGeometry(0.85, 1, 64),
        new THREE.MeshBasicMaterial({ color: 0xf2c14e, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
      );
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      this.scene.add(mesh);
      this.waves.push({ mesh, age: 9, size: 1 });
    }
  }

  setSim(sim: Sim): void {
    for (const fv of this.fighters) fv.dispose(this.scene);
    for (const m of this.crateMeshes) this.scene.remove(m);
    for (const p of this.pops) p.el.remove();
    this.pops = [];
    this.sparks = [];
    this.sim = sim;
    if (this.arenaId !== sim.map.id) {
      if (this.arena) this.scene.remove(this.arena.group);
      this.arena = buildArena(sim.map, floorTexture);
      this.arenaId = sim.map.id;
      this.scene.add(this.arena.group);
      this.scene.background = new THREE.Color(this.arena.background);
      const [fc, near, far] = this.arena.fog;
      this.scene.fog = new THREE.Fog(fc, near, far);
      this.sun.intensity = this.arena.sun * 2.2;
      this.hemi.intensity = this.arena.hemi;
    }
    this.fighters = sim.fighters.map((f) => new FighterView(f, this.scene, this.labels));

    const wood = this.arena!.crate;
    const edge = new THREE.LineBasicMaterial({ color: 0x3b2a18 });
    this.crateMeshes = sim.crates.map((c) => {
      const geo = new THREE.BoxGeometry(c.half * 2, c.half * 2, c.half * 2);
      const m = new THREE.Mesh(geo, wood);
      m.castShadow = m.receiveShadow = true;
      m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo), edge));
      this.scene.add(m);
      return m;
    });

    const maxScale = Math.max(...sim.fighters.map((f) => f.scale));
    this.controls.target.set(0, 1.1 * maxScale, 0);
    this.follow.copy(this.controls.target);
    const dist = 5 + maxScale * 3.2;
    const dir = this.camera.position.clone().sub(this.controls.target).normalize();
    if (dir.lengthSq() === 0) dir.set(1, 0.4, 0).normalize();
    this.camera.position.copy(this.controls.target).addScaledVector(dir, dist);
  }

  resize(): void {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.fov = this.camera.aspect < 1 ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  /** Turn simulation events into effects. */
  consumeEvents(): void {
    const sim = this.sim;
    if (!sim) return;
    for (const ev of sim.events) {
      if (ev.type === 'hit') {
        const n = Math.min(70, Math.round(8 + ev.power * 5));
        const col = new THREE.Color(ev.stone ? 0xb9b4aa : ev.blocked ? 0x9fc4ff : 0xffd27a);
        this.burst(ev.pos, n, 1.5 + ev.power * 0.7, col, 0.35);
        if (ev.power > 3.5) this.wave(ev.target.pos, Math.min(9, ev.power * 0.5));
        this.shake = Math.max(this.shake, Math.min(0.35, ev.power * 0.025));
        if (!ev.blocked) this.excite = Math.min(1, this.excite + ev.dmg * 0.03);
        // Hit-stop: a short freeze sells the weight of a blow; not again right away.
        if (!ev.blocked && ev.dmg > 4 && this.hitStopCool <= 0) {
          this.hitStop = Math.min(0.14, 0.035 + ev.dmg * 0.006);
          this.hitStopCool = this.hitStop + 0.2;
        }
        if (!ev.blocked && ev.part) {
          const fv = this.fighters.find((x) => x.f === ev.target);
          if (fv?.addMark(ev.part, ev.pos, ev.dmg)) this.burst(ev.pos, 24, 1.2, new THREE.Color(0x9a0a0a), 0.6);
          else if (fv && ev.zone === 'в голову' && ev.target.trauma > 0.25) this.burst(ev.pos, 8, 1, new THREE.Color(0x9a0a0a), 0.5);
        }
        // No numbers: where it landed, and how hard (one to three marks).
        const marks = ev.dmg < 5 ? '' : ev.dmg < 10 ? '!' : ev.dmg < 16 ? '!!' : '!!!';
        this.pop(ev.pos, ev.blocked ? 'в блок' : `${ev.fromBehind ? 'в спину' : ev.zone}${marks}`, ev.target.team);
      } else if (ev.type === 'land') {
        this.burst(ev.pos.clone().setY(0.1), Math.min(60, 10 + ev.power * 3), 1 + ev.power * 0.25, new THREE.Color(0x8b93a6), 0.6);
        if (ev.power > 6) this.wave(ev.pos, Math.min(8, ev.power * 0.35));
        this.shake = Math.max(this.shake, Math.min(0.3, ev.power * 0.02));
      } else if (ev.type === 'crash') {
        this.burst(ev.pos, Math.min(50, 8 + ev.power * 2), 1 + ev.power * 0.3, new THREE.Color(0xc79a62), 0.6);
      } else if (ev.type === 'wave') {
        this.wave(ev.pos, ev.radius);
        this.wave(ev.pos, ev.radius * 0.6);
        this.burst(ev.pos.clone().setY(0.15), 70, 4 + ev.radius, new THREE.Color(0xd9c8a0), 0.7);
        this.shake = Math.max(this.shake, 0.4);
      } else if (ev.type === 'break') {
        this.burst(ev.pos, 30, 3, new THREE.Color(0xff5a4a), 0.5);
        this.pop(ev.pos.clone().setY(ev.pos.y + 0.3), `перелом: ${LIMB_NAME[ev.limb]}`, ev.target.team);
        this.shake = Math.max(this.shake, 0.2);
      } else if (ev.type === 'liver') {
        this.pop(ev.pos, 'печень!', ev.target.team);
        this.excite = 1;
        this.shake = Math.max(this.shake, 0.15);
      } else if (ev.type === 'bell') {
        this.excite = Math.max(this.excite, 0.7);
      } else if (ev.type === 'catch') {
        this.burst(ev.pos, 18, 1.5, new THREE.Color(0xffffff), 0.3);
        this.pop(ev.pos, 'поймал ногу', ev.target.team);
      } else {
        this.burst(ev.pos, 26, 2.5, new THREE.Color(0x7ff0ff), 0.35);
        this.pop(ev.pos, 'парирование', ev.target.team);
      }
    }
    sim.events.length = 0;
  }

  private burst(at: THREE.Vector3, n: number, speed: number, color: THREE.Color, life: number): void {
    for (let i = 0; i < n; i++) {
      if (this.sparks.length >= 400) this.sparks.shift();
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9, Math.random() - 0.5).normalize();
      this.sparks.push({
        pos: at.clone(),
        vel: v.multiplyScalar(speed * (0.4 + Math.random())),
        life: 0,
        max: life * (0.5 + Math.random() * 0.8),
        color,
      });
    }
  }

  private wave(at: THREE.Vector3, size: number): void {
    const w = this.waves.reduce((a, b) => (b.age > a.age ? b : a));
    w.age = 0;
    w.size = size;
    w.mesh.position.set(at.x, 0.05, at.z);
    w.mesh.visible = true;
  }

  private pop(at: THREE.Vector3, text: string, team: 0 | 1): void {
    const el = document.createElement('div');
    el.className = `pop team${team}`;
    el.textContent = text;
    this.labels.appendChild(el);
    this.pops.push({ el, pos: at.clone(), age: 0 });
  }

  /**
   * @param realDt real seconds since last frame
   * @param worldDt world seconds simulated this frame
   * @param viewScale world seconds per real second
   */
  render(realDt: number, worldDt: number, viewScale: number): void {
    const sim = this.sim;
    if (!sim) return;
    this.hitStopCool -= realDt;
    this.consumeEvents();
    this.clockT += realDt;
    if (sim.fighters.some((f) => f.state !== 'ok')) this.excite = Math.max(this.excite, 0.8);
    this.excite = Math.max(0, this.excite - realDt * 0.25);
    this.arena?.update(this.clockT, this.excite);

    for (const fv of this.fighters) fv.update(realDt, fv.f.body * viewScale);
    sim.crates.forEach((c, i) => {
      const m = this.crateMeshes[i];
      m.visible = !c.gone;
      v(c.body.translation(), m.position);
      q(c.body.rotation(), m.quaternion);
    });

    // Sparks follow world time, but never take longer than a few real seconds to fade.
    const fxDt = Math.max(worldDt, realDt * 0.12);
    let k = 0;
    this.sparks = this.sparks.filter((s) => (s.life += fxDt) < s.max);
    for (const s of this.sparks) {
      s.vel.y -= 6 * fxDt;
      s.pos.addScaledVector(s.vel, fxDt);
      const fade = 1 - s.life / s.max;
      this.sparkPos.set([s.pos.x, s.pos.y, s.pos.z], k * 3);
      this.sparkCol.set([s.color.r * fade, s.color.g * fade, s.color.b * fade], k * 3);
      k++;
    }
    this.sparkGeo.setDrawRange(0, k);
    this.sparkGeo.attributes.position.needsUpdate = true;
    this.sparkGeo.attributes.color.needsUpdate = true;

    for (const w of this.waves) {
      if (w.age > 9) continue;
      w.age += fxDt;
      const t = w.age / 0.5;
      w.mesh.visible = t < 1;
      const s = 0.3 + w.size * smooth(t);
      w.mesh.scale.set(s, s, s);
      (w.mesh.material as THREE.MeshBasicMaterial).opacity = 0.6 * (1 - t);
    }

    // Camera follows the middle of the fight.
    const [a, b] = sim.fighters;
    const mid = this.tmp.addVectors(a.pos, b.pos).multiplyScalar(0.5);
    mid.y = Math.max(a.scale, b.scale) * 1.1;
    this.koZoom += ((this.koFocus ? 1 : 0) - this.koZoom) * Math.min(1, realDt * 1.5);
    if (this.koFocus && this.koZoom > 0.001) {
      const p = this.koFocus.rag.pelvis.body.translation();
      mid.lerp(this.tmp2.set(p.x, 0.7 * this.koFocus.scale, p.z), this.koZoom);
    }
    const before = this.follow.clone();
    this.follow.lerp(mid, 1 - Math.exp(-realDt * 4));
    const delta = this.follow.clone().sub(before);
    this.controls.target.add(delta);
    this.camera.position.add(delta);
    // Keep both fighters in frame: on a narrow phone screen the horizontal field of view is what limits.
    const sep = Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z);
    const big = Math.max(a.scale, b.scale);
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const lying = a.state !== 'ok' || b.state !== 'ok' ? 1.0 * big : 0;
    const needW = (sep / 2 + 0.9 * big + lying) / Math.tan(hHalf);
    const needH = (1.3 * big) / Math.tan(vHalf);
    const want = Math.min(45, Math.max(3.5, needW, needH) * 1.08) * (1 - 0.45 * this.koZoom);
    this.controls.update();
    const off = this.camera.position.clone().sub(this.controls.target);
    // Unless the player is steering, swing round to look at the fight from the side.
    this.sinceTouch += realDt;
    if (!this.touching && this.sinceTouch > 3 && sep > 0.3) {
      const axis = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
      const cur = Math.atan2(off.x, off.z);
      const best = axis + Math.PI / 2;
      const d1 = Math.atan2(Math.sin(best - cur), Math.cos(best - cur));
      const d2 = Math.atan2(Math.sin(best + Math.PI - cur), Math.cos(best + Math.PI - cur));
      const diff = Math.abs(d1) < Math.abs(d2) ? d1 : d2;
      if (Math.abs(diff) > 0.35) off.applyAxisAngle(new THREE.Vector3(0, 1, 0), diff * (1 - Math.exp(-realDt * 1.2)));
    }
    const dist = off.length();
    off.multiplyScalar((dist + (want - dist) * (1 - Math.exp(-realDt * 3))) / dist);
    this.camera.position.copy(this.controls.target).add(off);

    this.shake *= Math.exp(-realDt * 9);
    const shakeOffset = new THREE.Vector3(
      (Math.random() - 0.5) * this.shake,
      (Math.random() - 0.5) * this.shake,
      (Math.random() - 0.5) * this.shake,
    );
    this.camera.position.add(shakeOffset);
    this.renderer.render(this.scene, this.camera);
    this.camera.position.sub(shakeOffset);

    this.placeLabels(realDt);
  }

  private project(p: THREE.Vector3): { x: number; y: number; visible: boolean } {
    const v = this.tmp.copy(p).project(this.camera);
    return {
      x: ((v.x + 1) / 2) * this.canvas.clientWidth,
      y: ((1 - v.y) / 2) * this.canvas.clientHeight,
      visible: v.z < 1,
    };
  }

  private placeLabels(realDt: number): void {
    const p = new THREE.Vector3();
    for (const fv of this.fighters) {
      const s = this.project(fv.headPoint(p));
      const show = fv.bubbleAge < 1.6 && s.visible && fv.f.thought !== '';
      fv.bubble.style.opacity = show ? String(Math.min(1, (1.6 - fv.bubbleAge) * 3)) : '0';
      fv.bubble.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
    }
    this.pops = this.pops.filter((pp) => {
      pp.age += realDt;
      if (pp.age > 1.1) {
        pp.el.remove();
        return false;
      }
      const s = this.project(pp.pos);
      pp.el.style.opacity = String(1 - pp.age / 1.1);
      pp.el.style.transform = `translate(${s.x}px, ${s.y - pp.age * 50}px) translate(-50%, -50%)`;
      return true;
    });
  }
}
