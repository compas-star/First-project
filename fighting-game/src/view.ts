import * as THREE from 'three';
import type { Sound } from './sound';

/** How loud the crowd is on each map. */
const CROWD: Record<string, number> = { ring: 1, cage: 1, dojo: 0.35, roof: 0.5, alley: 0.45, void: 0 };
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { OutlineEffect } from 'three/examples/jsm/effects/OutlineEffect.js';
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
  /** Pixel look: scene drawn this many times smaller and blown up sharp; 0 = smooth. */
  pixel = 0;
  private outline: OutlineEffect | null = null;
  /** Three tones of light, hard edges between them (cel shading). */
  private toonRamp: THREE.DataTexture | null = null;
  private toonCache = new Map<THREE.Material, THREE.Material>();
  private toonBig = new Map<THREE.Material, THREE.Material>();
  private litArena: unknown = null;
  /** Pixel look: the scene goes to a small target, then through a palette pass to the screen. */
  private rt: THREE.WebGLRenderTarget | null = null;
  private post: { scene: THREE.Scene; cam: THREE.OrthographicCamera; mat: THREE.ShaderMaterial } | null = null;
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
  /** Thought bubbles and hit captions over the fighters (off: a clean picture). */
  words = false;
  /** Called on a highlight (the HUD shows a banner and slows time). */
  onMoment?: (text: string, focus: Fighter) => void;
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private arena: Arena | null = null;
  private arenaId = '';
  /** Sound for the fight (set by main); null = silent (headless tools). */
  sound: Sound | null = null;
  private viewScale = 1;
  private koHeard: Sim | null = null;
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
  /** A fixed camera angle around the fight (the lab), or automatic. */
  camView: 'auto' | 'side' | 'front' | 'back' | 'top' = 'auto';
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

  /** Switches the pixel look (0 = off, else the size of one pixel in screen pixels). */
  setPixel(n: number): void {
    this.pixel = n;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.canvas.style.imageRendering = '';
    // A touch darker: a night fight, and bright floors do not burn out in the palette.
    this.renderer.toneMappingExposure = n ? 0.82 : 1;
    this.renderer.shadowMap.type = n ? THREE.BasicShadowMap : THREE.PCFSoftShadowMap;
    if (n && !this.outline) this.outline = new OutlineEffect(this.renderer, { defaultThickness: 0.011, defaultColor: [0.02, 0.01, 0.03], defaultAlpha: 1 });
    this.toonAll();
    this.resize();
  }

  /**
   * The pixel look, in two layers. The world (arena, crowd, sparks) is drawn small, then
   * blown up sharp through a palette pass: a night grade (shadows lean purple), colours cut
   * to a few steps with an ordered 4x4 dither, as old games had it. The fighters are drawn
   * on top at full resolution like comic figures: hard cel bands and thick black outlines.
   */
  private renderPixel(): void {
    const r = this.renderer;
    const size = r.getDrawingBufferSize(new THREE.Vector2());
    // One big pixel = n screen points, whatever the device's pixel density.
    const n = this.pixel * r.getPixelRatio();
    const w = Math.max(1, Math.round(size.x / n));
    const h = Math.max(1, Math.round(size.y / n));
    if (!this.rt || this.rt.width !== w || this.rt.height !== h) {
      this.rt?.dispose();
      this.rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
    }
    if (!this.post) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { tDiffuse: { value: null }, levels: { value: 9 }, res: { value: new THREE.Vector2() } },
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
        fragmentShader: `
          uniform sampler2D tDiffuse; uniform float levels; uniform vec2 res; varying vec2 vUv;
          #define B2(a) fract(dot(floor(a), vec2(0.5, floor(a).y * 0.75)))
          #define B4(a) (B2(0.5 * (a)) * 0.25 + B2(a))
          void main() {
            gl_FragColor = texture2D(tDiffuse, vUv);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
            vec3 col = gl_FragColor.rgb;
            float l = dot(col, vec3(0.299, 0.587, 0.114));
            // Night grade: dark parts lean purple-blue, bright parts stay warm.
            col = mix(col * vec3(0.82, 0.78, 1.12) + vec3(0.025, 0.0, 0.05), col, smoothstep(0.08, 0.7, l));
            col = mix(vec3(l), col, 1.15);
            // The dither follows the big pixels, not the screen's.
            // Bright floors stay clean; the dither lives in the mid and dark tones.
            float d = (B4(floor(vUv * res)) - 0.5) * (1.0 - smoothstep(0.7, 0.92, l));
            col = floor(clamp(col, 0.0, 1.0) * levels + 0.5 + d * 0.6) / levels;
            gl_FragColor = vec4(col, 1.0);
          }`,
        depthTest: false,
        depthWrite: false,
      });
      const scene = new THREE.Scene();
      scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
      this.post = { scene, cam: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), mat };
    }
    // Fighters live on layer 1: left out of the world pass, but still casting their shadows there.
    for (const fv of this.fighters) {
      fv.rig.root.traverse((o) => o.layers.set(1));
      for (const g of fv.ghosts) g.root.traverse((o) => o.layers.set(1));
    }
    this.sun.shadow.camera.layers.enable(1);
    // Lights shine on both layers (the arena's lamps too, once per arena).
    if (this.litArena !== this.arena) {
      this.litArena = this.arena;
      this.scene.traverse((o) => {
        if ((o as THREE.Light).isLight) o.layers.enableAll();
      });
    }
    const cam = this.camera;
    // 1) The world, small.
    cam.layers.set(0);
    r.setRenderTarget(this.rt);
    r.render(this.scene, cam);
    r.setRenderTarget(null);
    // 2) Blown up through the palette.
    this.post.mat.uniforms.tDiffuse.value = this.rt.texture;
    this.post.mat.uniforms.res.value.set(w, h);
    r.render(this.post.scene, this.post.cam);
    // 3) The fighters on top, sharp, outlined.
    const keepClear = r.autoClear;
    const keepShadows = r.shadowMap.autoUpdate;
    r.autoClear = false;
    r.shadowMap.autoUpdate = false;
    r.clearDepth();
    cam.layers.set(1);
    // The outline pass clears by its own setting: here it must draw over the world.
    const ol = this.outline as unknown as { autoClear: boolean };
    const olClear = ol.autoClear;
    ol.autoClear = false;
    // No sky in this pass: the world is already on screen.
    const bg = this.scene.background;
    this.scene.background = null;
    this.outline!.render(this.scene, cam);
    this.scene.background = bg;
    ol.autoClear = olClear;
    cam.layers.enableAll();
    r.autoClear = keepClear;
    r.shadowMap.autoUpdate = keepShadows;
  }

  /** Lit surfaces get the cel-shaded twin of their material in the pixel look, and back. */
  private toonAll(): void {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh || Array.isArray(m.material)) return;
      const ud = m.userData as { orig?: THREE.Material };
      if (this.pixel) {
        const orig = ud.orig ?? m.material;
        // Floors, walls, the sky: no outline on surfaces that big.
        if (!m.geometry.boundingSphere) m.geometry.computeBoundingSphere();
        const big = (m.geometry.boundingSphere?.radius ?? 0) * Math.max(m.scale.x, m.scale.y, m.scale.z) > 2.5;
        const toon = this.toonOf(orig, big);
        if (toon !== orig) {
          ud.orig = orig;
          m.material = toon;
        }
      } else if (ud.orig) {
        m.material = ud.orig;
        delete ud.orig;
      }
    });
  }

  private toonOf(mat: THREE.Material, big: boolean): THREE.Material {
    const std = mat as THREE.MeshStandardMaterial;
    if (!std.isMeshStandardMaterial && !(mat as THREE.MeshPhongMaterial).isMeshPhongMaterial && !(mat as THREE.MeshLambertMaterial).isMeshLambertMaterial) return mat;
    const cache = big ? this.toonBig : this.toonCache;
    let t = cache.get(mat);
    if (!t) {
      if (!this.toonRamp) {
        // Dark, mid, lit, highlight: four hard bands.
        // Comic shading: deep shadow, flat colour, a hard highlight.
        const d = new Uint8Array([55, 55, 55, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
        this.toonRamp = new THREE.DataTexture(d, 3, 1, THREE.RGBAFormat);
        this.toonRamp.minFilter = this.toonRamp.magFilter = THREE.NearestFilter;
        this.toonRamp.needsUpdate = true;
      }
      const toon = new THREE.MeshToonMaterial({
        color: std.color,
        map: std.map ?? null,
        emissive: std.emissive ?? new THREE.Color(0),
        emissiveIntensity: std.emissiveIntensity ?? 1,
        emissiveMap: std.emissiveMap ?? null,
        transparent: mat.transparent,
        opacity: mat.opacity,
        side: mat.side,
        depthWrite: mat.depthWrite,
        gradientMap: this.toonRamp,
      });
      // Big flat surfaces (floor, walls, sky) get no outline, only bodies and props.
      toon.userData.outlineParameters = { visible: !mat.transparent && !big };
      t = toon;
      cache.set(mat, t);
    }
    return t;
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
    if (this.pixel) queueMicrotask(() => this.toonAll());

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
    const snd = this.sound;
    const slow = this.viewScale;
    for (const ev of sim.events) {
      if (ev.type === 'swing') {
        snd?.swing(ev.power, slow);
      } else if (ev.type === 'hit') {
        snd?.hit(ev.dmg, ev.zone, ev.blocked, slow);
        // Sweat flies off a head that is hit clean.
        if (!ev.blocked && ev.zone === 'в голову' && ev.dmg > 3) this.burst(ev.pos, Math.min(30, 6 + ev.dmg), 1.8 + ev.dmg * 0.08, new THREE.Color(0xd8ecff), 0.5);
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
        // The pixel look speaks comics: a big clean blow gets its sound word.
        if (this.pixel && !ev.blocked && ev.dmg >= 8) {
          const words = /голов/.test(ev.zone) ? ['БАМ!', 'ХРЯСЬ!', 'ТРЕСК!', 'БАЦ!'] : /корп/.test(ev.zone) ? ['БУМ!', 'ШМЯК!', 'ХЛОП!'] : ['ХЛЁСТ!', 'ТЫЩ!', 'ШЛЕП!'];
          this.pop(ev.pos, words[Math.floor(Math.random() * words.length)], ev.target.team, ev.dmg >= 15 ? 'comic big' : 'comic');
        } else this.pop(ev.pos, ev.blocked ? 'в блок' : `${ev.fromBehind ? 'в спину' : ev.zone}${marks}`, ev.target.team);
      } else if (ev.type === 'land') {
        snd?.land(ev.power, slow);
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
        snd?.crunch(slow);
        this.burst(ev.pos, 30, 3, new THREE.Color(0xff5a4a), 0.5);
        this.pop(ev.pos.clone().setY(ev.pos.y + 0.3), `перелом: ${LIMB_NAME[ev.limb]}`, ev.target.team);
        this.shake = Math.max(this.shake, 0.2);
      } else if (ev.type === 'liver') {
        snd?.crunch(slow);
        this.pop(ev.pos, 'печень!', ev.target.team);
        this.excite = 1;
        this.shake = Math.max(this.shake, 0.15);
      } else if (ev.type === 'moment') {
        if (this.excite < 0.8) snd?.roar(0.5);
        this.excite = 1;
        this.onMoment?.(ev.text, ev.focus);
      } else if (ev.type === 'bell') {
        snd?.bell(ev.round > 1 ? 1 : 2);
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

  private pop(at: THREE.Vector3, text: string, team: 0 | 1, extra = ''): void {
    if (!this.words) return;
    const el = document.createElement('div');
    el.className = `pop team${team} ${extra}`;
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
    this.viewScale = viewScale;
    this.sound?.frame(this.excite, CROWD[sim.map.id] ?? 0.4, worldDt > 0);
    this.consumeEvents();
    // The end: the crowd roars and the bell rings it out.
    if (sim.winner && this.koHeard !== sim) {
      this.koHeard = sim;
      this.sound?.roar(1);
      this.sound?.bell(3);
    }
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
    if (this.camView !== 'auto' && !this.touching && sep > 0.1) {
      // Fixed angle from the line between the fighters: red is the striker.
      const axis = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
      const yaw = axis + (this.camView === 'side' || this.camView === 'top' ? Math.PI / 2 : this.camView === 'front' ? 0.4 : Math.PI - 0.4);
      const pitch = this.camView === 'top' ? 1.25 : 0.22;
      const len = off.length();
      const goal = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(len);
      off.lerp(goal, 1 - Math.exp(-realDt * 5));
    } else if (!this.touching && this.sinceTouch > 3 && sep > 0.3) {
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
    if (this.pixel && this.outline) this.renderPixel();
    else this.renderer.render(this.scene, this.camera);
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
      const show = this.words && fv.bubbleAge < 1.6 && s.visible && fv.f.thought !== '';
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
