import * as THREE from 'three';
import { headGrid, headPoint, faceSpot, faceAz, hairShell, withHead, HEAD_TOP, HEAD_BOTTOM, type HeadVar } from './headShape';
import type { Rig } from './rig';

// Fighters drawn like people in a comic: one continuous skinned body over the rig's joints
// instead of separate capsules, human proportions with an athletic build, soft lines drawn
// on the bare muscles, and a head, hands and outfit from a look. The
// physics does not change: the skin follows the same eleven parts.
//
// Built in the rig's rest pose (arms and legs straight down). Each limb is a tube of
// rings; vertices near a joint are shared between the two bones, so elbows, knees,
// shoulders and the neck bend smoothly.

const BONES = ['pelvis', 'spine', 'head', 'lSh', 'lEl', 'rSh', 'rEl', 'lHip', 'lKn', 'rHip', 'rKn'] as const;
type BoneName = (typeof BONES)[number];

export type HeadKind = 'face' | 'skull' | 'mask' | 'brute' | 'helmet';
export type HairKind = 'crop' | 'bald' | 'mohawk' | 'ponytail' | 'long' | 'spiky' | 'topknot' | 'bandana' | 'headband' | 'hood';
export type HandKind = 'boxing' | 'mma' | 'wraps' | 'claws' | 'fingerless' | 'bare';
export type TopKind = 'none' | 'vest' | 'tee' | 'long' | 'jacket' | 'gi';
export type BottomKind = 'trunks' | 'shorts' | 'long' | 'torn' | 'singlet' | 'mawashi';

export interface ComicLook {
  /** The low look's face shape (headShape.ts); missing = a plain one. */
  face?: HeadVar;
  skin: number;
  /** Body: 0.8 wiry .. 1.6 a slab of muscle (shoulders, chest, arms). */
  bulk: number;
  /** Fists and forearms, Popeye-style. */
  arms: number;
  belly: number;
  head: HeadKind;
  hair: HairKind;
  hairColor: number;
  beard: boolean;
  /** Eyes: white, or glowing in this colour. */
  glow?: number;
  hands: HandKind;
  handColor: number;
  top: TopKind;
  topColor: number;
  bottom: BottomKind;
  bottomColor: number;
  band: number;
  /** Shoes up the shin to this height (0 = barefoot). */
  shoes: number;
  shoeColor: number;
  extras: ('spikes' | 'chain' | 'flames' | 'shades' | 'pencil' | 'belt' | 'kneepads' | 'scar' | 'antenna' | 'scarf' | 'tabard' | 'pauldron')[];
  /** Low-poly look (Absolver): faceted body, porcelain mask, cloth, soft light, no ink. */
  low?: boolean;
  /** Mask pattern for the low look: 0 plain, 1 stripe, 2 split, 3 brow. */
  maskKind?: number;
  /** Mask / helmet colour. */
  maskColor?: number;
  /** Low look: the mask's pattern colour (the team) and a bandana / headband colour. */
  maskAccent?: number;
  capColor?: number;
  /** Cloth pattern: a sailor's striped vest (тельняшка) or a tracksuit's side stripes. */
  pattern?: 'telnyashka' | 'tracksuit';
  stripeColor?: number;
}

interface Ring {
  y: number;
  rx: number;
  rz: number;
  oz?: number;
  ox?: number;
}

type Painter = (y: number, ang: number) => THREE.Color;

class Builder {
  step = 0.018;
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  skinI: number[] = [];
  skinW: number[] = [];

  tube(x: number, rings: Ring[], bone: number, below: number, above: number, color: Painter, blendLo = 0.06, blendHi = 0.06, sides = 16): void {
    const start = this.pos.length / 3;
    const yLo = Math.min(...rings.map((r) => r.y));
    const yHi = Math.max(...rings.map((r) => r.y));
    const dense: Ring[] = [];
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i];
      const b = rings[i + 1];
      const steps = Math.max(1, Math.round(Math.abs(b.y - a.y) / this.step));
      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const s = t * t * (3 - 2 * t);
        dense.push({
          y: a.y + (b.y - a.y) * t,
          rx: a.rx + (b.rx - a.rx) * s,
          rz: a.rz + (b.rz - a.rz) * s,
          oz: (a.oz ?? 0) + ((b.oz ?? 0) - (a.oz ?? 0)) * s,
          ox: (a.ox ?? 0) + ((b.ox ?? 0) - (a.ox ?? 0)) * s,
        });
      }
    }
    dense.push(rings[rings.length - 1]);
    for (const r of dense) {
      for (let j = 0; j < sides; j++) {
        const ang = (j / sides) * Math.PI * 2;
        this.pos.push(x + (r.ox ?? 0) + Math.sin(ang) * r.rx, r.y, (r.oz ?? 0) + Math.cos(ang) * r.rz);
        const c = color(r.y, ang);
        this.col.push(c.r, c.g, c.b);
        this.weights(r.y, yLo, yHi, bone, below, above, blendLo, blendHi);
      }
    }
    const n = dense.length;
    for (let i = 0; i < n - 1; i++) {
      for (let j = 0; j < sides; j++) {
        const a = start + i * sides + j;
        const b = start + i * sides + ((j + 1) % sides);
        const c = a + sides;
        const d = b + sides;
        if (dense[i + 1].y > dense[i].y) this.idx.push(a, b, d, a, d, c);
        else this.idx.push(a, d, b, a, c, d);
      }
    }
    for (const [ri, up] of [[0, dense[1].y < dense[0].y], [n - 1, dense[n - 1].y > dense[n - 2].y]] as const) {
      const r = dense[ri];
      const centre = this.pos.length / 3;
      this.pos.push(x + (r.ox ?? 0), r.y, r.oz ?? 0);
      const c = color(r.y, 0);
      this.col.push(c.r, c.g, c.b);
      this.weights(r.y, yLo, yHi, bone, below, above, blendLo, blendHi);
      for (let j = 0; j < sides; j++) {
        const a = start + ri * sides + j;
        const b = start + ri * sides + ((j + 1) % sides);
        if (up) this.idx.push(centre, a, b);
        else this.idx.push(centre, b, a);
      }
    }
  }

  private weights(y: number, lo: number, hi: number, bone: number, below: number, above: number, bl: number, bh: number): void {
    let wb = below >= 0 ? Math.max(0, 1 - (y - lo) / bl) * 0.5 : 0;
    let wa = above >= 0 ? Math.max(0, 1 - (hi - y) / bh) * 0.5 : 0;
    wb = wb * wb * (3 - 2 * wb) * (wb > 0 ? 1 : 0);
    wa = wa * wa * (3 - 2 * wa) * (wa > 0 ? 1 : 0);
    this.skinI.push(bone, below >= 0 ? below : bone, above >= 0 ? above : bone, 0);
    this.skinW.push(1 - wb - wa, wb, wa, 0);
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.skinI, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.skinW, 4));
    g.setIndex(this.idx);
    g.computeVertexNormals();
    return g;
  }
}

const C = (c: number) => new THREE.Color(c);

const BRUISE_NEW = C(0xb34848);
const BRUISE_OLD = C(0x4a2046);
const BROKEN = C(0x4a1f3a);

/**
 * Damage painted into the body's vertex colours: bruises where blows land (red, going
 * purple as more land on the same spot), a broken limb darkened. Only bare skin bruises.
 */
export class ComicSkin {
  private base: Float32Array;
  private skin: Uint8Array;
  private hurt: Float32Array;
  private broken = new Set<number>();
  private rest: THREE.Matrix4[];
  private tmp = new THREE.Vector3();

  constructor(readonly mesh: THREE.SkinnedMesh, skinColor: THREE.Color) {
    const col = mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    this.base = Float32Array.from(col.array as Float32Array);
    const n = col.count;
    this.skin = new Uint8Array(n);
    this.hurt = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const d = Math.abs(this.base[i * 3] - skinColor.r) + Math.abs(this.base[i * 3 + 1] - skinColor.g) + Math.abs(this.base[i * 3 + 2] - skinColor.b);
      this.skin[i] = d < 0.01 ? 1 : 0;
    }
    // Bone space -> the body's rest pose, where the vertices are stored.
    this.rest = mesh.skeleton.boneInverses.map((m) => mesh.bindMatrixInverse.clone().multiply(m.clone().invert()));
  }

  boneOf(group: THREE.Object3D): number {
    return this.mesh.skeleton.bones.findIndex((b) => b.parent === group);
  }

  /** A blow at `local` (in the bone's group frame) bruises the skin around it. */
  bruise(bone: number, local: THREE.Vector3, amount: number): void {
    if (bone < 0) return;
    const p = this.tmp.copy(local).applyMatrix4(this.rest[bone]);
    const pos = this.mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const si = this.mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
    // The blow's point may sit off the surface: start from the nearest vertex of that part.
    let best = Infinity;
    let bi = -1;
    for (let i = 0; i < pos.count; i++) {
      if (si.getX(i) !== bone) continue;
      const dx = pos.getX(i) - p.x, dy = pos.getY(i) - p.y, dz = pos.getZ(i) - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < best) { best = d2; bi = i; }
    }
    if (bi < 0) return;
    p.set(pos.getX(bi), pos.getY(bi), pos.getZ(bi));
    const R = 0.08;
    for (let i = 0; i < pos.count; i++) {
      if (!this.skin[i]) continue;
      const dx = pos.getX(i) - p.x, dy = pos.getY(i) - p.y, dz = pos.getZ(i) - p.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > R * R) continue;
      const w = 1 - Math.sqrt(d2) / R;
      this.hurt[i] = Math.min(6, this.hurt[i] + amount * w * (0.6 + 0.4 * Math.random()));
    }
    this.paint();
  }

  setBroken(bones: number[], on: boolean): void {
    for (const b of bones) if (on) this.broken.add(b); else this.broken.delete(b);
    this.paint();
  }

  private paint(): void {
    const col = this.mesh.geometry.getAttribute('color') as THREE.BufferAttribute;
    const si = this.mesh.geometry.getAttribute('skinIndex') as THREE.BufferAttribute;
    const c = new THREE.Color();
    const b = new THREE.Color();
    for (let i = 0; i < col.count; i++) {
      c.setRGB(this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2]);
      const h = this.hurt[i];
      if (h > 0.05) {
        b.copy(BRUISE_NEW).lerp(BRUISE_OLD, Math.min(1, h / 4));
        c.lerp(b, Math.min(0.85, 0.35 + 0.25 * h));
      }
      if (this.broken.size && this.broken.has(si.getX(i))) c.lerp(BROKEN, 0.55);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }
}
const toonMats = new Map<string, THREE.MeshToonMaterial | THREE.MeshStandardMaterial>();
/** Set while a low-poly body is built: parts get flat-shaded soft materials instead of toon. */
let LOW = false;
function toon(c: number, glow = 0): THREE.MeshToonMaterial {
  const k = `${c}|${glow}|${LOW}`;
  let m = toonMats.get(k);
  if (!m) {
    m = LOW ? lowMat(c, 0.75) : new THREE.MeshToonMaterial({ color: c });
    if (glow) {
      m.emissive = new THREE.Color(c);
      m.emissiveIntensity = glow;
    }
    toonMats.set(k, m);
  }
  return m as THREE.MeshToonMaterial;
}

/** A soft, flat-shaded material for the low-poly look; the pixel view keeps it as it is. */
function lowMat(c: number, rough: number, vertexColors = false): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: 0, flatShading: true, vertexColors });
  m.userData.keep = true;
  m.userData.outlineParameters = { thickness: 0.004, color: [0.06, 0.05, 0.06], alpha: 0.8, visible: true };
  return m;
}

/** Flames lick: every flame mesh flickers on its own phase. */
function flicker(mesh: THREE.Mesh, base: number): void {
  const ph = Math.random() * 10;
  mesh.onBeforeRender = () => {
    const t = performance.now() / 1000;
    mesh.scale.y = base * (0.75 + 0.35 * Math.abs(Math.sin(t * 9 + ph)) + 0.15 * Math.sin(t * 23 + ph * 2));
  };
}

/** Hides the capsule body and dresses the rig in one comic body. */
export function comicBody(r: Rig, girth: number, L: ComicLook): ComicSkin {
  for (const m of Object.values(r.mesh)) m.visible = false;
  for (const g of [r.head, r.lEl, r.rEl, r.lKn, r.rKn, r.spine, r.pelvis, r.lSh, r.rSh, r.lHip, r.rHip]) {
    for (const c of g.children) if ((c as THREE.Mesh).isMesh) c.visible = false;
  }
  LOW = !!L.low;
  const G = girth;
  const U = L.bulk;
  const A = L.arms;
  const skin = C(L.skin);
  const ink = L.low ? skin : skin.clone().multiplyScalar(0.72);
  const topC = C(L.topColor);
  const topInk = L.low ? topC.clone().multiplyScalar(0.8) : topC.clone().multiplyScalar(0.55);
  const botC = C(L.bottomColor);
  const band = C(L.band);
  const stripeC = C(L.stripeColor ?? 0xf4f4f0);
  // Тельняшка: 3 cm stripes (the body is built finer for them, even in the low look).
  const tel = (y: number) => L.pattern === 'telnyashka' && Math.floor(y / 0.03) % 2 === 0;
  const fine = L.pattern === 'telnyashka' ? 0.01 : 0;
  const shoe = C(L.shoeColor);
  const B = new Builder();
  if (L.low) B.step = 0.075;
  if (L.low) {
    // Few sides and coarse rings: the facets are the look.
    const tube = B.tube.bind(B);
    B.tube = (x, rings, bone, below, above, color, lo, hi, sides = 16) => tube(x, rings, bone, below, above, color, lo, hi, Math.max(6, Math.round(sides * 0.45)));
  }
  const bi = (n: BoneName) => BONES.indexOf(n);
  const front = (ang: number, w: number) => Math.cos(ang) > Math.cos(w);
  const torsoCovered = L.top !== 'none' || L.bottom === 'singlet';
  const sleeve = L.top === 'tee' ? 1.31 : L.top === 'long' || L.top === 'jacket' || L.top === 'gi' ? 0.88 : 9;
  const legEnd = L.bottom === 'long' || L.bottom === 'torn' ? 0.06 : L.bottom === 'shorts' ? 0.7 : L.bottom === 'singlet' ? 0.8 : L.bottom === 'mawashi' ? 0.88 : 0.78;
  const bottomCol = (y: number, ang: number): THREE.Color => {
    // Torn jeans: the knees show through ragged holes.
    if (L.bottom === 'torn' && y > 0.44 && y < 0.55 && front(ang, 0.9) && Math.sin(ang * 7 + y * 60) > -0.3) return skin;
    if (L.pattern === 'tracksuit' && L.bottom === 'long' && Math.abs(Math.sin(ang)) > 0.86) return stripeC;
    if (L.bottom === 'long' && Math.abs(Math.sin(ang)) > 0.97) return botC.clone().multiplyScalar(0.7);
    return botC;
  };

  // Hips: bound to the pelvis.
  B.tube(0, [
    { y: 0.76, rx: 0.13 * G, rz: 0.1 * G },
    { y: 0.86, rx: 0.165 * G, rz: 0.118 * G, oz: -0.006 },
    { y: 0.97, rx: 0.152 * G, rz: 0.11 * G },
    { y: 1.03, rx: 0.14 * G, rz: 0.104 * G },
  ], bi('pelvis'), -1, bi('spine'), (y, ang) => {
    if (L.bottom === 'mawashi') return y > 0.9 || (front(ang, 0.5) && y > 0.8) ? botC : y > 0.9 ? botC : skin;
    if (y > 0.985 && L.top !== 'gi' && L.bottom !== 'singlet') return L.extras.includes('belt') ? C(0x2a1a10) : band;
    return L.top === 'gi' && y > 0.96 ? topC : bottomCol(y, ang);
  }, 0.06, 0.08, 20);

  // The trunk: a comic V, narrow waist, a slab of chest and lats; bound to the spine.
  const belly = L.belly;
  const step0 = B.step;
  if (fine) B.step = fine;
  B.tube(0, [
    { y: 0.97, rx: 0.145 * G, rz: 0.106 * G },
    { y: 1.06, rx: (0.13 + 0.03 * belly) * G, rz: (0.1 + 0.045 * belly) * G, oz: 0.015 * belly },
    { y: 1.17, rx: (0.15 + 0.015 * U + 0.01 * belly) * G, rz: (0.108 + 0.022 * belly + 0.01 * U) * G, oz: 0.01 * belly },
    { y: 1.29, rx: (0.16 + 0.03 * U) * G, rz: (0.112 + 0.016 * U) * G, oz: 0.012 },
    { y: 1.38, rx: (0.17 + 0.032 * U) * G, rz: (0.108 + 0.01 * U) * G, oz: 0.006 },
    { y: 1.45, rx: (0.14 + 0.028 * U) * G, rz: 0.088 * G },
    { y: 1.5, rx: 0.075 * G, rz: 0.062 * G },
  ], bi('spine'), bi('pelvis'), -1, (y, ang) => {
    if (y < 1.0 && L.top !== 'gi' && L.bottom !== 'singlet') return L.extras.includes('belt') ? C(0x2a1a10) : band;
    if (L.top === 'gi') return Math.abs(Math.sin(ang - 0.25)) < 0.12 && Math.cos(ang) > 0 && y > 1.12 ? topInk : y < 1.02 ? C(0x111111) : topC;
    if (L.top === 'jacket') {
      // Open leather jacket: the chest shows between the lapels.
      if (front(ang, 0.35) && y > 1.02) return y > 1.26 && front(ang, 0.22) ? ink : skin;
      return Math.abs(Math.sin(ang)) > 0.96 ? topInk : topC;
    }
    if (torsoCovered) {
      if (L.pattern === 'telnyashka' && L.top !== 'vest') return y > 1.47 && front(ang, 0.5) ? skin : tel(y) ? stripeC : topC;
      if (L.pattern === 'tracksuit') return front(ang, 0.07) && y > 1.0 ? stripeC : y > 1.46 ? topC.clone().multiplyScalar(0.75) : topC;
      if (L.bottom === 'singlet') return front(ang, 0.6) || Math.cos(ang) < -0.8 || y < 1.36 ? botC : skin;
      if (L.top === 'vest') return front(ang, 0.4) && y > 1.25 ? skin : L.pattern === 'telnyashka' && tel(y) ? stripeC : topC;
      return topC;
    }
    // Bare torso: inked anatomy. Pecs, a six-pack, the line down the middle.
    const fr = Math.cos(ang);
    if (fr > 0.2 && y > 1.255 && y < 1.275 + 0.01 * U && Math.abs(Math.sin(ang)) > 0.08) return ink;
    if (fr > 0.97 && y > 1.04 && y < 1.36) return ink;
    if (belly < 0.4 && fr > 0.85 && (Math.abs(y - 1.12) < 0.006 || Math.abs(y - 1.18) < 0.006 || Math.abs(y - 1.07) < 0.005)) return ink;
    if (belly < 0.4 && Math.abs(Math.abs(Math.sin(ang)) - 0.55) < 0.05 && fr > 0 && y > 1.03 && y < 1.22) return ink;
    return skin;
  }, 0.08, 0.05, 24);
  B.step = step0;

  // The neck: bull-necked for the big ones.
  const nk = 0.048 + 0.012 * U;
  B.tube(0, [
    { y: 1.44, rx: (nk + 0.015) * G, rz: (nk + 0.01) * G },
    { y: 1.53, rx: nk * Math.sqrt(G), rz: nk * Math.sqrt(G), oz: 0.01 },
    { y: 1.58, rx: (nk - 0.005) * Math.sqrt(G), rz: nk * Math.sqrt(G), oz: 0.014 },
  ], bi('spine'), -1, bi('head'), () => (L.top === 'gi' || L.head === 'skull' ? (L.head === 'skull' ? C(0x14100e) : skin) : skin), 0.05, 0.06);

  for (const side of [1, -1] as const) {
    const left = side > 0;
    const sh = bi(left ? 'lSh' : 'rSh');
    const el = bi(left ? 'lEl' : 'rEl');
    const hp = bi(left ? 'lHip' : 'rHip');
    const kn = bi(left ? 'lKn' : 'rKn');
    const x = side * (0.19 + 0.012 * U) * G;
    const armCol = (y: number, ang: number): THREE.Color => {
      if (y > sleeve) {
        if (tel(y)) return stripeC;
        if (L.pattern === 'tracksuit' && Math.sin(ang) * side > 0.8) return stripeC;
        if (L.top === 'jacket' && Math.abs(y - 0.9) < 0.02) return topInk;
        return Math.abs(Math.sin(ang)) > 0.97 ? topInk : topC;
      }
      // Ink on bare arms: where the shoulder cap meets the arm, the biceps' edge.
      if (Math.abs(y - 1.34) < 0.008 && Math.sin(ang) * side > -0.2) return ink;
      if (y > 1.17 && y < 1.3 && Math.abs(Math.cos(ang) - 0.55) < 0.06) return ink;
      if (L.hands === 'wraps' || L.hands === 'mma' || L.hands === 'fingerless') if (y < 0.92) return C(0xf0ece4);
      return skin;
    };
    // Shoulder cap (deltoid) and biceps, down to the elbow.
    if (fine) B.step = fine;
    B.tube(x, [
      { y: 1.48, rx: 0.05 * G, rz: 0.055 * G },
      { y: 1.42, rx: (0.058 + 0.016 * U) * G, rz: (0.058 + 0.014 * U) * G },
      { y: 1.33, rx: (0.048 + 0.014 * U) * G, rz: (0.05 + 0.015 * U) * G, oz: 0.006 },
      { y: 1.24, rx: (0.045 + 0.012 * U) * G, rz: (0.048 + 0.015 * U) * G, oz: 0.01 },
      { y: 1.13, rx: 0.042 * G, rz: 0.045 * G },
    ], sh, el, bi('spine'), armCol, 0.06, 0.07);
    // Forearm: Popeye forearms for the big ones, thin at the wrist.
    B.tube(x, [
      { y: 1.15, rx: 0.044 * G, rz: 0.046 * G },
      { y: 1.05, rx: (0.042 + 0.01 * A) * G, rz: (0.04 + 0.008 * A) * G },
      { y: 0.95, rx: (0.035 + 0.005 * A) * G, rz: (0.033 + 0.004 * A) * G },
      { y: 0.86, rx: 0.032 * G, rz: 0.03 * G },
    ], el, -1, sh, armCol, 0.05, 0.06);
    B.step = step0;
    // Thigh and shin.
    const hx = side * 0.1 * G;
    // Loose cloth trousers in the low look, gathered into wraps at the calf.
    const bag = L.low && L.top === 'gi' ? 1.18 : 1;
    const legCol = (y: number, ang: number): THREE.Color => {
      if (L.bottom === 'mawashi') return skin;
      if (y > legEnd) return bottomCol(y, ang);
      if (L.bottom === 'shorts' && y > legEnd - 0.02) return band;
      if (L.extras.includes('kneepads') && y > 0.44 && y < 0.56) return C(0x1a1a1a);
      if (y < L.shoes) return y > L.shoes - 0.02 ? shoe.clone().multiplyScalar(0.6) : shoe;
      if (L.top === 'gi') return topC;
      if (Math.abs(y - 0.6) < 0.007 && front(ang, 1.0)) return ink;
      return skin;
    };
    B.tube(hx, [
      { y: 0.99, rx: 0.088 * G, rz: 0.09 * G },
      { y: 0.86, rx: (0.084 + 0.016 * U) * G * bag, rz: (0.09 + 0.014 * U) * G * bag, oz: 0.008 },
      { y: 0.7, rx: (0.07 + 0.008 * U) * G * bag, rz: (0.076 + 0.008 * U) * G * bag, oz: 0.01 },
      { y: 0.55, rx: 0.058 * G * bag, rz: 0.06 * G * bag },
      { y: 0.48, rx: 0.054 * G * bag, rz: 0.058 * G * bag },
    ], hp, kn, bi('pelvis'), legCol, 0.07, 0.08);
    B.tube(hx, [
      { y: 0.51, rx: 0.052 * G * bag, rz: 0.055 * G * bag },
      { y: 0.38, rx: (0.052 + 0.01 * U) * G * bag, rz: (0.06 + 0.012 * U) * G * bag, oz: -0.013 },
      { y: 0.24, rx: 0.044 * G, rz: 0.046 * G, oz: -0.006 },
      { y: 0.08, rx: (L.shoes > 0.1 ? 0.044 : 0.034) * G, rz: (L.shoes > 0.1 ? 0.046 : 0.034) * G },
      { y: 0.03, rx: 0.036 * G, rz: 0.036 * G },
    ], kn, -1, hp, legCol, 0.05, 0.07);
  }

  const geo = B.geometry();
  const mat = L.low ? lowMat(0xffffff, 0.8, true) : new THREE.MeshToonMaterial({ vertexColors: true });
  const body = new THREE.SkinnedMesh(geo, mat);
  body.castShadow = true;
  body.frustumCulled = false;
  const bones = BONES.map((n) => {
    const b = new THREE.Bone();
    (r[n] as THREE.Object3D).add(b);
    return b;
  });
  r.root.add(body);
  r.root.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(bones));

  const skinOut = new ComicSkin(body, skin);
  r.head.add(L.low ? maskHead(G, L) : comicHead(G, L));
  for (const [g, side] of [[r.lEl, 1], [r.rEl, -1]] as const) g.add(L.low ? lowHand(G, L) : hand(G, L, side));
  for (const g of [r.lKn, r.rKn]) g.add(L.low ? lowFoot(G, L) : foot(G, L));
  extras(r, G, L);
  LOW = false;
  return skinOut;
}

function mesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, p: [number, number, number], s: [number, number, number] = [1, 1, 1], rot: [number, number, number] = [0, 0, 0]): THREE.Mesh {
  const o = new THREE.Mesh(geo, m);
  o.position.set(...p);
  o.scale.set(...s);
  o.rotation.set(...rot);
  o.castShadow = true;
  parent.add(o);
  return o;
}

/** The head: a face with a comic jaw and a scowl, or a flaming skull, a mask, a brute. */
function comicHead(G: number, L: ComicLook): THREE.Group {
  const h = new THREE.Group();
  const sg = Math.sqrt(G);
  // Comic heads sit a touch forward and big on a big neck.
  h.position.set(0, 0, 0.01);
  h.scale.setScalar(1.0);
  const skin = toon(L.skin);
  const dark = toon(C(L.skin).multiplyScalar(0.5).getHex());
  const inkM = toon(0x0c0a0c);
  const white = toon(0xf4efe6);
  const hairM = toon(L.hairColor);

  if (L.head === 'skull') {
    // Bone white skull, black sockets with burning points, teeth; flames around it.
    const bone = toon(0xeee6d2);
    mesh(h, new THREE.SphereGeometry(0.1, 18, 14), bone, [0, 0.16, 0], [0.95 * sg, 1.05, 1.02 * sg]);
    mesh(h, new THREE.BoxGeometry(0.11, 0.06, 0.1), bone, [0, 0.08, 0.03], [sg, 1, sg]);
    for (const s of [1, -1]) {
      mesh(h, new THREE.SphereGeometry(0.028, 10, 8), inkM, [s * 0.038 * sg, 0.155, 0.08 * sg], [1, 1.1, 0.6]);
      mesh(h, new THREE.SphereGeometry(0.01, 8, 6), toon(L.glow ?? 0xff3a10, 2.5), [s * 0.038 * sg, 0.155, 0.098 * sg]);
    }
    mesh(h, new THREE.ConeGeometry(0.014, 0.03, 3), inkM, [0, 0.12, 0.1 * sg], [1, 1, 1], [Math.PI, 0, 0]);
    for (let i = -2; i <= 2; i++) mesh(h, new THREE.BoxGeometry(0.012, 0.022, 0.01), white, [i * 0.016, 0.07, 0.083 * sg]);
    mesh(h, new THREE.BoxGeometry(0.09, 0.004, 0.012), inkM, [0, 0.07, 0.085 * sg]);
    // Fire: rings of flickering cones, hottest inside.
    const fire = [toon(0xff5a1a, 1.6), toon(0xffb21f, 2.2), toon(0xfff07a, 2.6)];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const rr = 0.07 + 0.02 * (i % 3);
      const f = mesh(h, new THREE.ConeGeometry(0.03, 0.16, 5), fire[i % 3], [Math.sin(a) * rr, 0.24, Math.cos(a) * rr * 0.9 - 0.02], [1, 1, 1], [-0.35 * Math.cos(a), 0, 0.35 * Math.sin(a)]);
      f.castShadow = false;
      flicker(f, 1);
    }
    return h;
  }

  // Skull and jaw. The brute has a small skull and a huge jaw; everyone has a square one.
  const brute = L.head === 'brute';
  mesh(h, new THREE.SphereGeometry(0.1, 18, 14), skin, [0, 0.15, -0.005], [(brute ? 0.9 : 0.95) * sg, brute ? 0.92 : 1.06, 1.02 * sg]);
  mesh(h, new THREE.BoxGeometry(brute ? 0.17 : 0.15, brute ? 0.1 : 0.085, 0.13, 2, 2, 2), skin, [0, 0.07, 0.03], [sg, 1, sg]);
  mesh(h, new THREE.SphereGeometry(0.072, 12, 8), skin, [0, 0.06, 0.05], [1.05 * sg, 0.6, 0.95 * sg]);
  if (L.beard) mesh(h, new THREE.BoxGeometry(0.16, 0.07, 0.14), hairM, [0, 0.045, 0.035], [sg, 1, sg]);
  else mesh(h, new THREE.BoxGeometry(0.152, 0.03, 0.125), dark, [0, 0.04, 0.03], [sg, 1, sg]);
  if (brute) mesh(h, new THREE.BoxGeometry(0.16, 0.035, 0.05), skin, [0, 0.185, 0.07 * sg], [sg, 1, 1]);
  mesh(h, new THREE.ConeGeometry(0.02, 0.055, 6), skin, [0, 0.125, 0.11 * sg], [1, 1, 1], [Math.PI / 2 + 0.3, 0, 0]);
  for (const s of [1, -1]) mesh(h, new THREE.SphereGeometry(0.026, 8, 6), skin, [s * 0.098 * sg, 0.135, 0], [0.5, 1, 0.8]);

  if (L.head === 'mask' || L.head === 'helmet') {
    // A luchador mask over the skull: team colour, white eye and mouth patches.
    const mm = toon(L.maskColor ?? 0xd02020);
    mesh(h, new THREE.SphereGeometry(0.106, 18, 14), mm, [0, 0.15, -0.003], [0.97 * sg, 1.08, 1.04 * sg]);
    if (L.head === 'helmet') {
      mesh(h, new THREE.BoxGeometry(0.16, 0.04, 0.03), toon(0x42f5e6, 2), [0, 0.15, 0.1 * sg], [sg, 1, 1]);
      return h;
    }
    for (const s of [1, -1]) mesh(h, new THREE.SphereGeometry(0.03, 10, 8), white, [s * 0.038 * sg, 0.16, 0.085 * sg], [1.3, 0.8, 0.5], [0, 0, s * 0.4]);
  }
  // Eyes: white with an ink pupil, or glowing; heavy brows in a scowl.
  for (const s of [1, -1]) {
    if (L.glow) mesh(h, new THREE.SphereGeometry(0.016, 10, 8), toon(L.glow, 2.4), [s * 0.036 * sg, 0.158, 0.092 * sg], [1.3, brute ? 0.6 : 0.8, 0.5]);
    else {
      mesh(h, new THREE.SphereGeometry(0.013, 10, 8), white, [s * 0.035 * sg, 0.156, 0.088 * sg], [1.35, 0.6, 0.6]);
      mesh(h, new THREE.SphereGeometry(0.0075, 8, 6), toon(0x2a1c14), [s * 0.034 * sg, 0.156, 0.096 * sg], [1, 0.9, 0.6]);
    }
    mesh(h, new THREE.BoxGeometry(0.056, brute ? 0.022 : 0.016, 0.022), L.head === 'mask' ? inkM : hairM, [s * 0.036 * sg, 0.176, 0.094 * sg], [1, 0.8, 1], [0, 0, s * 0.14]);
  }
  // A closed mouth.
  mesh(h, new THREE.BoxGeometry(0.042, 0.006, 0.01), toon(C(L.skin).multiplyScalar(0.45).getHex()), [0, 0.09, 0.09 * sg]);
  if (L.extras.includes('scar')) mesh(h, new THREE.BoxGeometry(0.008, 0.07, 0.006), toon(0x8a2a2a), [0.045 * sg, 0.16, 0.096 * sg], [1, 1, 1], [0, 0, 0.3]);
  if (L.extras.includes('shades')) {
    for (const s of [1, -1]) mesh(h, new THREE.BoxGeometry(0.05, 0.026, 0.01), inkM, [s * 0.036 * sg, 0.16, 0.1 * sg]);
    mesh(h, new THREE.BoxGeometry(0.17, 0.008, 0.008), inkM, [0, 0.168, 0.1 * sg], [sg, 1, 1]);
  }
  if (L.head === 'mask') return h;

  // Hair.
  const cap = (top: number) => new THREE.SphereGeometry(0.106, 18, 12, 0, Math.PI * 2, 0, Math.PI * top);
  switch (L.hair) {
    case 'crop':
      mesh(h, cap(0.42), hairM, [0, 0.165, -0.012], [0.98 * sg, 1.05, 1.06 * sg], [-0.25, 0, 0]);
      break;
    case 'mohawk':
      for (let i = 0; i < 7; i++) mesh(h, new THREE.ConeGeometry(0.022, 0.09, 4), hairM, [0, 0.25 - Math.abs(i - 2) * 0.012, 0.07 - i * 0.03], [1, 1, 1], [-0.3 - i * 0.18, 0, 0]);
      break;
    case 'spiky':
      for (let i = 0; i < 11; i++) {
        const a = (i / 11) * Math.PI * 2;
        mesh(h, new THREE.ConeGeometry(0.03, 0.11, 4), hairM, [Math.sin(a) * 0.06, 0.24, Math.cos(a) * 0.05 - 0.02], [1, 1, 1], [-0.6 * Math.cos(a) - 0.3, 0, 0.6 * Math.sin(a)]);
      }
      mesh(h, cap(0.45), hairM, [0, 0.165, -0.012], [0.98 * sg, 1.05, 1.06 * sg], [-0.2, 0, 0]);
      // Sideburns down the cheeks.
      for (const s of [1, -1]) mesh(h, new THREE.BoxGeometry(0.03, 0.09, 0.05), hairM, [s * 0.09 * sg, 0.1, 0.03], [1, 1, 1], [0, 0, s * 0.15]);
      break;
    case 'ponytail':
    case 'long':
      mesh(h, cap(0.5), hairM, [0, 0.162, -0.012], [1.02 * sg, 1.08, 1.08 * sg], [-0.2, 0, 0]);
      if (L.hair === 'ponytail') {
        const t = mesh(h, new THREE.CylinderGeometry(0.03, 0.012, 0.22, 8), hairM, [0, 0.12, -0.12], [1, 1, 1], [0.35, 0, 0]);
        t.position.y = 0.08;
      } else mesh(h, new THREE.BoxGeometry(0.2, 0.2, 0.05), hairM, [0, 0.09, -0.08], [sg, 1, 1]);
      break;
    case 'topknot':
      mesh(h, cap(0.38), hairM, [0, 0.165, -0.012], [0.98 * sg, 1.05, 1.06 * sg], [-0.2, 0, 0]);
      mesh(h, new THREE.SphereGeometry(0.035, 10, 8), hairM, [0, 0.27, -0.02]);
      break;
    case 'bandana':
      mesh(h, cap(0.4), toon(L.maskColor ?? 0xb3202a), [0, 0.168, -0.01], [1.02 * sg, 1.06, 1.08 * sg], [-0.22, 0, 0]);
      mesh(h, new THREE.BoxGeometry(0.03, 0.08, 0.02), toon(L.maskColor ?? 0xb3202a), [0, 0.15, -0.115], [1, 1, 1], [0.4, 0, 0]);
      break;
    case 'headband':
      mesh(h, cap(0.42), hairM, [0, 0.165, -0.012], [0.98 * sg, 1.05, 1.06 * sg], [-0.25, 0, 0]);
      mesh(h, new THREE.TorusGeometry(0.1, 0.012, 6, 20), toon(L.maskColor ?? 0xd02020), [0, 0.2, 0], [sg, sg, 1], [Math.PI / 2 - 0.2, 0, 0]);
      break;
    case 'bald':
      break;
  }
  if (L.extras.includes('pencil')) mesh(h, new THREE.CylinderGeometry(0.006, 0.006, 0.13, 6), toon(0xf2c14e), [0.105 * sg, 0.17, 0], [1, 1, 1], [0.3, 0, 1.2]);
  if (L.extras.includes('antenna')) mesh(h, new THREE.CylinderGeometry(0.004, 0.004, 0.12, 4), inkM, [0.05, 0.3, -0.02]);
  return h;
}

/**
 * The low look's head: a carved face in facets (or a mask for the luchador and the ninja),
 * with hair, a hood or headgear.
 */
/** A painted face (pixel art) wrapped on the sculpted head (`headGrid` UVs: u = 0.25 + az/360,
 *  v by height): hairline, brows, lips, beard, scar. The shape itself is modelled. */
function faceMat(L: ComicLook): THREE.MeshStandardMaterial {
  const W = 256;
  const H = 128;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const g = cv.getContext('2d')!;
  const css = (c: THREE.Color) => `#${c.getHexString()}`;
  const skin = C(L.skin);
  const hair = C(L.hairColor);
  g.fillStyle = css(skin);
  g.fillRect(0, 0, W, H);
  const X = (deg: number) => W * (0.25 + deg / 360);
  const Y = (y: number) => (H * (HEAD_TOP - y)) / (HEAD_TOP - HEAD_BOTTOM);
  /** A patch on the face, in metres across (x) and up (y). */
  const face = (x0: number, x1: number, y0: number, y1: number, c: string) => {
    const a0 = X(faceAz(x0, (y0 + y1) / 2));
    const a1 = X(faceAz(x1, (y0 + y1) / 2));
    g.fillStyle = c;
    g.fillRect(Math.round(a0), Math.round(Y(y1)), Math.max(1, Math.round(a1 - a0)), Math.max(1, Math.round(Y(y0) - Y(y1))));
  };
  // Hairline, unless shaved or covered: low at the back and sides, higher over the forehead.
  if (L.hair !== 'bald' && L.hair !== 'hood') {
    g.fillStyle = css(hair);
    g.fillRect(0, 0, W, Y(0.075));
    g.fillRect(X(55), 0, W - X(55), Y(0.0));
    g.fillRect(0, 0, X(-55), Y(0.0));
    g.fillRect(X(100), 0, X(260) - X(100), Y(-0.07));
  }
  // Brows over the sockets, a touch of colour on the lips.
  const brow = css(hair.clone().multiplyScalar(0.75));
  face(0.014, 0.047, 0.026, 0.032, brow);
  face(-0.047, -0.014, 0.026, 0.032, brow);
  face(-0.017, 0.017, -0.066, -0.056, css(skin.clone().lerp(new THREE.Color(0x9a4a44), 0.3)));
  face(-0.015, 0.015, -0.078, -0.07, css(skin.clone().lerp(new THREE.Color(0x9a4a44), 0.22)));
  if (L.beard) {
    g.fillStyle = css(hair);
    g.fillRect(X(-62), Y(-0.06), X(62) - X(-62), H - Y(-0.06));
    g.fillRect(X(-62), Y(-0.02), X(-38) - X(-62), Y(-0.06) - Y(-0.02));
    g.fillRect(X(38), Y(-0.02), X(62) - X(38), Y(-0.06) - Y(-0.02));
    face(-0.02, 0.02, -0.058, -0.052, css(hair));
    face(-0.016, 0.016, -0.071, -0.066, css(skin.clone().multiplyScalar(0.55)));
  }
  if (L.extras.includes('scar')) for (let i = 0; i < 6; i++) face(0.03 + i * 0.003, 0.033 + i * 0.003, 0.03 - i * 0.008, 0.038 - i * 0.008, '#8a3030');
  const tex = new THREE.CanvasTexture(cv);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8, metalness: 0, flatShading: true });
  m.userData.keep = true;
  m.userData.outlineParameters = { thickness: 0.004, color: [0.06, 0.05, 0.06], alpha: 0.8, visible: true };
  return m;
}

function maskHead(G: number, L: ComicLook): THREE.Group {
  return withHead(L.face, () => maskHeadOf(G, L));
}

function maskHeadOf(G: number, L: ComicLook): THREE.Group {
  const h = new THREE.Group();
  const sg = Math.sqrt(G);
  const skinM = toon(L.skin);
  const hairM = toon(L.hairColor);
  const maskM = toon(L.maskColor ?? 0xece6d8);
  const dark = toon(0x121014);
  const accent = toon(L.maskAccent ?? L.band);
  if (L.head === 'mask') {
    // Skull and neck in skin (seen at the back and sides), the mask over the face.
    mesh(h, new THREE.IcosahedronGeometry(0.098, 1), skinM, [0, 0.15, -0.012], [0.92 * sg, 1.08, 1.0 * sg]);
    mesh(h, new THREE.IcosahedronGeometry(0.1, 1), maskM, [0, 0.14, 0.03], [0.9 * sg, 1.12, 0.78 * sg]);
    // A ridge down the nose and a chin point.
    mesh(h, new THREE.ConeGeometry(0.018, 0.07, 4), maskM, [0, 0.13, 0.1 * sg], [1, 1, 0.8], [0.15, Math.PI / 4, 0]);
    mesh(h, new THREE.ConeGeometry(0.04, 0.06, 5), maskM, [0, 0.055, 0.055 * sg], [1.2, 1, 0.9], [Math.PI, 0, 0]);
    // Eye slits, slanted.
    for (const s of [1, -1]) mesh(h, new THREE.BoxGeometry(0.042, 0.011, 0.02), dark, [s * 0.034 * sg, 0.165, 0.098 * sg], [1, 1, 1], [0, -s * 0.35, s * 0.18]);
    // Pattern.
    const k = L.maskKind ?? 0;
    if (k === 1) mesh(h, new THREE.BoxGeometry(0.009, 0.13, 0.012), accent, [0.02 * sg, 0.16, 0.112 * sg], [1, 1, 1], [-0.12, 0, 0]);
    else if (k === 2) {
      // War paint: two slanted marks under each eye.
      for (const sd of [1, -1]) for (const dy of [0, 0.022]) mesh(h, new THREE.BoxGeometry(0.03, 0.007, 0.012), accent, [sd * 0.04 * sg, 0.128 - dy, 0.102 * sg], [1, 1, 1], [0, -sd * 0.4, sd * 0.35]);
    } else if (k === 3) mesh(h, new THREE.BoxGeometry(0.09, 0.016, 0.014), accent, [0, 0.19, 0.1 * sg], [sg, 1, 1], [-0.15, 0, 0]);
  } else {
    // A sculpted low-poly head (user's references, `headShape.ts`): skull, brow, sockets,
    // nose, cheekbones, lips, chin, jaw. Brows, lips, hair and beard are painted (`faceMat`).
    const shade = toon(C(L.skin).multiplyScalar(0.8).getHex());
    const CY = 0.145;
    const grid = headGrid(sg);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(grid.verts, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(grid.uvs, 2));
    geo.setIndex(grid.idx);
    geo.computeVertexNormals();
    mesh(h, geo, faceMat(L), [0, CY, 0]);
    // Eyeballs set into the sockets, a dark iris on each.
    const eyeW = toon(0xe4ded2);
    const iris = toon(0x2a1c14);
    for (const sd of [1, -1]) {
      const [x, y, z] = faceSpot(sd * 0.031, 0.012, sg);
      const zc = z - 0.011;
      mesh(h, new THREE.IcosahedronGeometry(0.0082, 1), eyeW, [x, CY + y - 0.0006, zc], [1.25, 0.62, 0.85]);
      mesh(h, new THREE.IcosahedronGeometry(0.0034, 0), iris, [x - sd * 0.0008, CY + y - 0.0004, zc + 0.0062], [1, 1, 0.55]);
    }
    // Ears.
    for (const sd of [1, -1]) {
      const [x, , z] = headPoint(sd * 90, 0.0, sg, false);
      mesh(h, new THREE.DodecahedronGeometry(0.018, 0), shade, [x + sd * 0.003, CY - 0.006, z - 0.008], [0.45, 1.15, 0.8]);
    }
    if (L.extras.includes('shades')) {
      for (const sd of [1, -1]) {
        const [x, y, z] = faceSpot(sd * 0.031, 0.013, sg);
        mesh(h, new THREE.BoxGeometry(0.036, 0.018, 0.006), dark, [x, CY + y, z + 0.004], [1, 1, 1], [0, sd * 0.25, 0]);
      }
      const [, y, z] = faceSpot(0, 0.02, sg);
      mesh(h, new THREE.BoxGeometry(0.12, 0.005, 0.005), dark, [0, CY + y, z + 0.006], [sg, 1, 1]);
    }
  }
  // Hair, hood or headgear, all in facets. A modelled face gets hair grown to its own skull.
  const faceHead = L.head !== 'mask';
  const cap = (c: THREE.Material, top = 0.92, long = false) => {
    if (!faceHead) return mesh(h, new THREE.IcosahedronGeometry(0.1, 1), c, [0, 0.175, -0.025], [0.96 * sg, top, 1.0 * sg]);
    const sh = hairShell(sg, top >= 1 ? 0.011 : 0.007, long);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(sh.verts, 3));
    geo.setIndex(sh.idx);
    geo.computeVertexNormals();
    return mesh(h, geo, c, [0, 0.145, 0]);
  };
  switch (L.hair) {
    case 'hood': {
      // Open in front so the mask shows.
      const hood = toon(L.capColor ?? L.topColor).clone();
      hood.side = THREE.DoubleSide;
      mesh(h, new THREE.SphereGeometry(0.122, 7, 5, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9), hood, [0, 0.16, -0.025], [1.0 * sg, 1.1, 1.0 * sg]);
      mesh(h, new THREE.ConeGeometry(0.07, 0.14, 5), hood, [0, 0.13, -0.12], [1, 1, 1], [-2.3, 0, 0]);
      break;
    }
    case 'topknot':
    case 'ponytail':
      cap(hairM, 1.0);
      mesh(h, new THREE.IcosahedronGeometry(0.035, 0), hairM, [0, 0.255, -0.06]);
      if (L.hair === 'ponytail') mesh(h, new THREE.CylinderGeometry(0.025, 0.008, 0.2, 5), hairM, [0, 0.14, -0.13], [1, 1, 1], [0.4, 0, 0]);
      break;
    case 'long':
      cap(hairM, 1.0, true);
      if (!faceHead) mesh(h, new THREE.BoxGeometry(0.19, 0.2, 0.05, 1, 2, 1), hairM, [0, 0.1, -0.075], [sg, 1, 1]);
      else mesh(h, new THREE.BoxGeometry(0.15, 0.12, 0.04, 1, 2, 1), hairM, [0, 0.06, -0.09], [sg, 1, 1], [0.15, 0, 0]);
      break;
    case 'mohawk':
      for (let i = 0; i < 6; i++) mesh(h, new THREE.ConeGeometry(0.022, 0.08, 3), hairM, [0, 0.25 - Math.abs(i - 2) * 0.012, 0.06 - i * 0.03], [1, 1, 1], [-0.3 - i * 0.2, 0, 0]);
      break;
    case 'spiky':
      cap(hairM);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        mesh(h, new THREE.ConeGeometry(0.03, 0.1, 3), hairM, [Math.sin(a) * 0.055, 0.24, Math.cos(a) * 0.045 - 0.02], [1, 1, 1], [-0.6 * Math.cos(a) - 0.3, 0, 0.6 * Math.sin(a)]);
      }
      break;
    case 'bandana':
      cap(toon(L.capColor ?? 0xb3202a), 1.0);
      mesh(h, new THREE.BoxGeometry(0.03, 0.09, 0.02), toon(L.capColor ?? 0xb3202a), [0, 0.15, -0.12], [1, 1, 1], [0.4, 0, 0]);
      break;
    case 'headband':
      cap(hairM);
      if (faceHead) {
        // A band round the forehead, fitted to the skull.
        const [, , zf] = headPoint(0, 0.06, sg, false);
        const [xs] = headPoint(90, 0.06, sg, false);
        const [, , zb] = headPoint(180, 0.06, sg, false);
        mesh(h, new THREE.TorusGeometry(1, 0.012, 4, 12), toon(L.capColor ?? 0xd02020), [0, 0.145 + 0.06, (zf + zb) / 2], [xs + 0.01, (zf - zb) / 2 + 0.01, 1], [Math.PI / 2 - 0.12, 0, 0]);
      } else mesh(h, new THREE.TorusGeometry(0.1, 0.014, 4, 9), toon(L.capColor ?? 0xd02020), [0, 0.2, 0.005], [sg, sg, 1], [Math.PI / 2 - 0.2, 0, 0]);
      break;
    case 'bald':
      break;
    default:
      cap(hairM);
  }
  return h;
}

/** Low look: gloves or fists in facets (boxing gloves, MMA gloves, wraps, bare). */
function lowHand(G: number, L: ComicLook): THREE.Group {
  const g = new THREE.Group();
  g.position.y = -0.29;
  const handM = toon(L.handColor);
  const skin = toon(L.skin);
  const cuff = toon(0xf0ece4);
  if (L.hands === 'boxing') {
    mesh(g, new THREE.DodecahedronGeometry(0.075, 0), handM, [0, -0.01, 0.008], [1.0 * G, 1.1, 1.2 * G]);
    mesh(g, new THREE.CylinderGeometry(0.048, 0.05, 0.07, 6), cuff, [0, 0.06, 0], [G, 1, G]);
    return g;
  }
  const fist = L.hands === 'mma' || L.hands === 'fingerless' ? handM : L.hands === 'wraps' ? cuff : skin;
  mesh(g, new THREE.DodecahedronGeometry(0.054, 0), fist, [0, -0.005, 0.008], [0.95 * G, 1.1, 1.15 * G]);
  if (L.hands !== 'bare') mesh(g, new THREE.CylinderGeometry(0.038, 0.044, 0.06, 6), L.hands === 'fingerless' ? handM : cuff, [0, 0.045, 0], [G, 1, G]);
  return g;
}

/** Low look: shoes or boots, or bare feet. */
function lowFoot(G: number, L: ComicLook): THREE.Group {
  const g = new THREE.Group();
  g.position.y = -0.46;
  const m = toon(L.shoes > 0 ? L.shoeColor : L.skin);
  mesh(g, new THREE.BoxGeometry(0.085, 0.06, 0.21), m, [0, -0.005, 0.045], [G * (L.shoes ? 1.12 : 1), L.shoes ? 1.15 : 1, 1]);
  mesh(g, new THREE.DodecahedronGeometry(0.045, 0), m, [0, -0.005, 0.13], [G, 0.65, 0.8]);
  if (L.shoes > 0) mesh(g, new THREE.BoxGeometry(0.095, 0.016, 0.23), toon(0x2a2420), [0, -0.035, 0.045], [G, 1, 1]);
  return g;
}

/** Hands: boxing gloves, MMA gloves, wrapped fists, claws. */
function hand(G: number, L: ComicLook, side: number): THREE.Group {
  const g = new THREE.Group();
  g.position.y = -0.29;
  const A = 1 + 0.1 * (L.arms - 1);
  const handM = toon(L.handColor);
  const skin = toon(L.skin);
  if (L.hands === 'boxing') {
    mesh(g, new THREE.SphereGeometry(0.075, 16, 12), handM, [0, -0.01, 0.008], [1.05 * G * A, 1.15 * A, 1.25 * G * A]);
    mesh(g, new THREE.SphereGeometry(0.03, 8, 6), handM, [side * 0.055 * G, 0.02, 0.03], [0.8, 1.2, 1]);
    mesh(g, new THREE.CylinderGeometry(0.048, 0.05, 0.07, 12), toon(0xf2efe8), [0, 0.06, 0], [G, 1, G]);
    return g;
  }
  const fist = L.hands === 'mma' ? handM : skin;
  mesh(g, new THREE.SphereGeometry(0.056, 14, 10), fist, [0, 0, 0], [0.95 * G * A, 1.05 * A, 1.15 * G * A]);
  mesh(g, new THREE.BoxGeometry(0.075, 0.03, 0.06), fist, [0, -0.035, 0.012], [G * A, 1, G * A]);
  if (L.hands === 'mma' || L.hands === 'wraps' || L.hands === 'fingerless') {
    mesh(g, new THREE.CylinderGeometry(0.042, 0.046, 0.05, 12), toon(L.hands === 'fingerless' ? L.handColor : 0xf0ece4), [0, 0.04, 0], [G, 1, G]);
  }
  if (L.hands === 'claws') {
    // Three blades out of the knuckles.
    const steel = toon(0xd8e2ea, 0.15);
    for (const dx of [-0.022, 0, 0.022]) mesh(g, new THREE.BoxGeometry(0.006, 0.17, 0.016), steel, [dx * G, -0.12, 0.02], [1, 1, 1], [0.08, 0, 0]);
  }
  return g;
}

/** Feet: bare, or shoes and boots. */
function foot(G: number, L: ComicLook): THREE.Group {
  const g = new THREE.Group();
  g.position.y = -0.46;
  const m = toon(L.shoes > 0 ? L.shoeColor : L.skin);
  mesh(g, new THREE.BoxGeometry(0.085, 0.055, 0.2, 2, 1, 3), m, [0, -0.005, 0.045], [G * (L.shoes ? 1.15 : 1), L.shoes ? 1.2 : 1, L.shoes ? 1.1 : 1]);
  mesh(g, new THREE.SphereGeometry(0.045, 10, 6), m, [0, -0.012, 0.13], [G, 0.55, 0.8]);
  mesh(g, new THREE.SphereGeometry(0.04, 10, 6), m, [0, 0, -0.04], [G, 0.8, 1]);
  if (L.shoes > 0) mesh(g, new THREE.BoxGeometry(0.1, 0.018, 0.24), toon(0xf2efe8), [0, -0.035, 0.045], [G, 1, 1]);
  return g;
}

/** Spikes, chains, flames on the shoulders, a belt buckle. */
function extras(r: Rig, G: number, L: ComicLook): void {
  const steel = toon(0xc9d1d8, 0.1);
  if (L.extras.includes('spikes')) {
    for (const [g, s] of [[r.lSh, 1], [r.rSh, -1]] as const) {
      for (let i = 0; i < 3; i++) mesh(g, new THREE.ConeGeometry(0.014, 0.06, 5), steel, [s * 0.05 * G, 0.04, -0.03 + i * 0.03], [1, 1, 1], [0, 0, -s * 0.9]);
    }
  }
  if (L.extras.includes('chain')) {
    // A chain across the chest, shoulder to hip.
    for (let i = 0; i < 12; i++) {
      const t = i / 11;
      mesh(r.spine, new THREE.TorusGeometry(0.014, 0.005, 4, 8), steel, [(0.15 - 0.3 * t) * G, 0.42 - 0.38 * t, 0.125 * G + 0.02 * Math.sin(t * Math.PI)], [1, 1, 1], [0, i % 2 ? Math.PI / 2 : 0, 0.8]);
    }
  }
  if (L.extras.includes('flames')) {
    // Flames on the shoulders too, the rider's trademark.
    const fire = [toon(0xff5a1a, 1.6), toon(0xffb21f, 2.2)];
    for (const [g, s] of [[r.lSh, 1], [r.rSh, -1]] as const) {
      for (let i = 0; i < 3; i++) {
        const f = mesh(g, new THREE.ConeGeometry(0.025, 0.12, 5), fire[i % 2], [s * 0.03 * G, 0.07, -0.03 + i * 0.03], [1, 1, 1], [0, 0, -s * 0.3]);
        f.castShadow = false;
        flicker(f, 1);
      }
    }
  }
  const cloth = (c: number) => {
    const m = toon(c);
    m.side = THREE.DoubleSide;
    return m;
  };
  if (L.extras.includes('scarf')) {
    // A scarf in the team colour round the neck, a tail over the back.
    mesh(r.spine, new THREE.TorusGeometry(0.075 * G, 0.03, 4, 7), cloth(L.band), [0, 0.47, 0.01], [1, 1, 1.1], [Math.PI / 2 - 0.15, 0, 0]);
    mesh(r.spine, new THREE.BoxGeometry(0.1, 0.32, 0.015), cloth(L.band), [0.04, 0.32, -0.13 * G], [1, 1, 1], [0.15, 0, 0.08]);
  }
  if (L.extras.includes('tabard')) {
    // Cloth flaps hanging from the sash, front and back.
    const flap = new THREE.PlaneGeometry(0.2 * G, 0.42, 1, 2);
    flap.translate(0, -0.21, 0);
    mesh(r.pelvis, flap, cloth(L.topColor), [0, 0.05, 0.125 * G], [1, 1, 1], [-0.08, 0, 0]);
    mesh(r.pelvis, flap, cloth(L.topColor), [0, 0.05, -0.12 * G], [1, 1, 1], [0.08, 0, 0]);
    // The sash itself, knotted on the side.
    mesh(r.pelvis, new THREE.TorusGeometry(0.15 * G, 0.028, 4, 8), cloth(L.band), [0, 0.06, 0], [1, 0.75, 1], [Math.PI / 2, 0, 0]);
    mesh(r.pelvis, new THREE.BoxGeometry(0.05, 0.22, 0.012), cloth(L.band), [0.14 * G, -0.06, 0.06], [1, 1, 1], [0, 0.5, 0.15]);
  }
  if (L.extras.includes('pauldron')) {
    // One armoured shoulder: layered plates.
    for (let i = 0; i < 3; i++) mesh(r.lSh, new THREE.SphereGeometry(0.085 - i * 0.012, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), toon(i % 2 ? 0x6a5a48 : 0x4a3e32), [0.02, 0.03 - i * 0.04, 0], [1.1 * G, 0.8, 1.05 * G], [0, 0, -0.35]);
  }
  if (L.extras.includes('belt')) mesh(r.pelvis, new THREE.BoxGeometry(0.06, 0.045, 0.02), toon(0xd8b25a, 0.2), [0, 0.03, 0.115 * G]);
}
