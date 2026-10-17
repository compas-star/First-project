import * as THREE from 'three';
import type { Rig } from './rig';

// Comic-book fighters: one continuous skinned body over the rig's joints instead of
// separate capsules, grotesque comic proportions (V-shaped trunks, big forearms and fists),
// ink lines drawn on the bare muscles, and a head, hands and outfit from a look. The
// physics does not change: the skin follows the same eleven parts.
//
// Built in the rig's rest pose (arms and legs straight down). Each limb is a tube of
// rings; vertices near a joint are shared between the two bones, so elbows, knees,
// shoulders and the neck bend smoothly.

const BONES = ['pelvis', 'spine', 'head', 'lSh', 'lEl', 'rSh', 'rEl', 'lHip', 'lKn', 'rHip', 'rKn'] as const;
type BoneName = (typeof BONES)[number];

export type HeadKind = 'face' | 'skull' | 'mask' | 'brute' | 'helmet';
export type HairKind = 'crop' | 'bald' | 'mohawk' | 'ponytail' | 'long' | 'spiky' | 'topknot' | 'bandana' | 'headband';
export type HandKind = 'boxing' | 'mma' | 'wraps' | 'claws' | 'fingerless' | 'bare';
export type TopKind = 'none' | 'vest' | 'tee' | 'long' | 'jacket' | 'gi';
export type BottomKind = 'trunks' | 'shorts' | 'long' | 'torn' | 'singlet' | 'mawashi';

export interface ComicLook {
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
  extras: ('spikes' | 'chain' | 'flames' | 'shades' | 'pencil' | 'belt' | 'kneepads' | 'scar' | 'antenna')[];
  /** Mask / helmet colour. */
  maskColor?: number;
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
      const steps = Math.max(1, Math.round(Math.abs(b.y - a.y) / 0.018));
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
const toonMats = new Map<string, THREE.MeshToonMaterial>();
function toon(c: number, glow = 0): THREE.MeshToonMaterial {
  const k = `${c}|${glow}`;
  let m = toonMats.get(k);
  if (!m) {
    m = new THREE.MeshToonMaterial({ color: c });
    if (glow) {
      m.emissive = new THREE.Color(c);
      m.emissiveIntensity = glow;
    }
    toonMats.set(k, m);
  }
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
export function comicBody(r: Rig, girth: number, L: ComicLook): THREE.MeshToonMaterial {
  for (const m of Object.values(r.mesh)) m.visible = false;
  for (const g of [r.head, r.lEl, r.rEl, r.lKn, r.rKn, r.spine, r.pelvis, r.lSh, r.rSh, r.lHip, r.rHip]) {
    for (const c of g.children) if ((c as THREE.Mesh).isMesh) c.visible = false;
  }
  const G = girth;
  const U = L.bulk;
  const A = L.arms;
  const skin = C(L.skin);
  const ink = skin.clone().multiplyScalar(0.42);
  const topC = C(L.topColor);
  const topInk = topC.clone().multiplyScalar(0.55);
  const botC = C(L.bottomColor);
  const band = C(L.band);
  const shoe = C(L.shoeColor);
  const B = new Builder();
  const bi = (n: BoneName) => BONES.indexOf(n);
  const front = (ang: number, w: number) => Math.cos(ang) > Math.cos(w);
  const torsoCovered = L.top !== 'none' || L.bottom === 'singlet';
  const sleeve = L.top === 'tee' ? 1.31 : L.top === 'long' || L.top === 'jacket' || L.top === 'gi' ? 0.88 : 9;
  const legEnd = L.bottom === 'long' || L.bottom === 'torn' ? 0.06 : L.bottom === 'shorts' ? 0.7 : L.bottom === 'singlet' ? 0.8 : L.bottom === 'mawashi' ? 0.88 : 0.78;
  const bottomCol = (y: number, ang: number): THREE.Color => {
    // Torn jeans: the knees show through ragged holes.
    if (L.bottom === 'torn' && y > 0.44 && y < 0.55 && front(ang, 0.9) && Math.sin(ang * 7 + y * 60) > -0.3) return skin;
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
  B.tube(0, [
    { y: 0.97, rx: 0.145 * G, rz: 0.106 * G },
    { y: 1.06, rx: (0.13 + 0.03 * belly) * G, rz: (0.1 + 0.045 * belly) * G, oz: 0.015 * belly },
    { y: 1.17, rx: (0.15 + 0.03 * U + 0.01 * belly) * G, rz: (0.108 + 0.022 * belly + 0.01 * U) * G, oz: 0.01 * belly },
    { y: 1.29, rx: (0.16 + 0.055 * U) * G, rz: (0.115 + 0.022 * U) * G, oz: 0.012 },
    { y: 1.38, rx: (0.17 + 0.06 * U) * G, rz: (0.112 + 0.012 * U) * G, oz: 0.006 },
    { y: 1.45, rx: (0.14 + 0.05 * U) * G, rz: 0.088 * G },
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
      if (L.bottom === 'singlet') return front(ang, 0.6) || Math.cos(ang) < -0.8 || y < 1.36 ? botC : skin;
      if (L.top === 'vest') return front(ang, 0.4) && y > 1.25 ? skin : topC;
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

  // The neck: bull-necked for the big ones.
  const nk = 0.05 + 0.02 * U;
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
    const x = side * (0.19 + 0.025 * U) * G;
    const armCol = (y: number, ang: number): THREE.Color => {
      if (y > sleeve) {
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
    B.tube(x, [
      { y: 1.48, rx: 0.05 * G, rz: 0.055 * G },
      { y: 1.42, rx: (0.06 + 0.03 * U) * G, rz: (0.06 + 0.025 * U) * G },
      { y: 1.33, rx: (0.05 + 0.025 * U) * G, rz: (0.052 + 0.026 * U) * G, oz: 0.006 },
      { y: 1.24, rx: (0.046 + 0.02 * U) * G, rz: (0.05 + 0.026 * U) * G, oz: 0.012 },
      { y: 1.13, rx: 0.042 * G, rz: 0.045 * G },
    ], sh, el, bi('spine'), armCol, 0.06, 0.07);
    // Forearm: Popeye forearms for the big ones, thin at the wrist.
    B.tube(x, [
      { y: 1.15, rx: 0.044 * G, rz: 0.046 * G },
      { y: 1.05, rx: (0.042 + 0.022 * A) * G, rz: (0.04 + 0.018 * A) * G },
      { y: 0.95, rx: (0.035 + 0.012 * A) * G, rz: (0.033 + 0.01 * A) * G },
      { y: 0.86, rx: 0.032 * G, rz: 0.03 * G },
    ], el, -1, sh, armCol, 0.05, 0.06);
    // Thigh and shin.
    const hx = side * 0.1 * G;
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
      { y: 0.86, rx: (0.084 + 0.016 * U) * G, rz: (0.09 + 0.014 * U) * G, oz: 0.008 },
      { y: 0.7, rx: (0.07 + 0.008 * U) * G, rz: (0.076 + 0.008 * U) * G, oz: 0.01 },
      { y: 0.55, rx: 0.058 * G, rz: 0.06 * G },
      { y: 0.48, rx: 0.054 * G, rz: 0.058 * G },
    ], hp, kn, bi('pelvis'), legCol, 0.07, 0.08);
    B.tube(hx, [
      { y: 0.51, rx: 0.052 * G, rz: 0.055 * G },
      { y: 0.38, rx: (0.052 + 0.01 * U) * G, rz: (0.06 + 0.012 * U) * G, oz: -0.013 },
      { y: 0.24, rx: 0.044 * G, rz: 0.046 * G, oz: -0.006 },
      { y: 0.08, rx: (L.shoes > 0.1 ? 0.044 : 0.034) * G, rz: (L.shoes > 0.1 ? 0.046 : 0.034) * G },
      { y: 0.03, rx: 0.036 * G, rz: 0.036 * G },
    ], kn, -1, hp, legCol, 0.05, 0.07);
  }

  const geo = B.geometry();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true });
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

  r.head.add(comicHead(G, L));
  for (const [g, side] of [[r.lEl, 1], [r.rEl, -1]] as const) g.add(hand(G, L, side));
  for (const g of [r.lKn, r.rKn]) g.add(foot(G, L));
  extras(r, G, L);
  return mat;
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
  h.scale.setScalar(1.12);
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
      mesh(h, new THREE.SphereGeometry(0.018, 10, 8), white, [s * 0.036 * sg, 0.158, 0.088 * sg], [1.3, brute ? 0.6 : 0.85, 0.6]);
      mesh(h, new THREE.SphereGeometry(0.0085, 8, 6), inkM, [s * 0.033 * sg, 0.157, 0.099 * sg]);
    }
    mesh(h, new THREE.BoxGeometry(0.056, brute ? 0.022 : 0.016, 0.022), L.head === 'mask' ? inkM : hairM, [s * 0.037 * sg, 0.182, 0.094 * sg], [1, 1, 1], [0, 0, s * 0.32]);
  }
  // A grim mouth, teeth bared.
  mesh(h, new THREE.BoxGeometry(0.05, 0.016, 0.01), inkM, [0, 0.088, 0.09 * sg]);
  mesh(h, new THREE.BoxGeometry(0.04, 0.006, 0.011), white, [0, 0.09, 0.091 * sg]);
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

/** Hands: boxing gloves, MMA gloves, wrapped fists, claws. */
function hand(G: number, L: ComicLook, side: number): THREE.Group {
  const g = new THREE.Group();
  g.position.y = -0.29;
  const A = 1 + 0.25 * (L.arms - 1);
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
  if (L.extras.includes('belt')) mesh(r.pelvis, new THREE.BoxGeometry(0.06, 0.045, 0.02), toon(0xd8b25a, 0.2), [0, 0.03, 0.115 * G]);
}
