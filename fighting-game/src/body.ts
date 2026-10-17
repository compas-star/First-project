import * as THREE from 'three';
import type { Rig } from './rig';

// A comic-book fighter: one continuous skinned body over the rig's joints instead of
// separate capsules, with muscles shaped along each limb (shoulders, biceps, forearms,
// thighs, calves), a torso that narrows at the waist and widens at the chest, and a
// sculpted head with a drawn face. The physics does not change: the skin follows the
// same eleven parts.
//
// Built in the rig's rest pose (arms and legs straight down). Each limb is a tube of
// rings; vertices near a joint are shared between the two bones, so elbows, knees,
// shoulders and the neck bend smoothly.

const BONES = ['pelvis', 'spine', 'head', 'lSh', 'lEl', 'rSh', 'rEl', 'lHip', 'lKn', 'rHip', 'rKn'] as const;
type BoneName = (typeof BONES)[number];
const PARENT: Partial<Record<BoneName, BoneName>> = {
  spine: 'pelvis', head: 'spine', lSh: 'spine', lEl: 'lSh', rSh: 'spine', rEl: 'rSh', lHip: 'pelvis', lKn: 'lHip', rHip: 'pelvis', rKn: 'rHip',
};

export interface ComicLook {
  skin: number;
  shorts: number;
  band: number;
  gloves: number;
  hair: number;
  /** Muscle: 0 soft .. 1 cut. */
  muscle: number;
  /** Belly: 0 flat .. 1 big. */
  belly: number;
}

interface Ring {
  y: number;
  rx: number;
  rz: number;
  /** Centre offset forward (+z) and sideways (+x). */
  oz?: number;
  ox?: number;
}

class Builder {
  pos: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  skinI: number[] = [];
  skinW: number[] = [];

  /**
   * A closed tube through rings at heights y (world, rest pose), bound to `bone`, blending
   * into `below` at its bottom and `above` at its top over `blend` metres.
   */
  tube(
    x: number,
    rings: Ring[],
    bone: number,
    below: number,
    above: number,
    color: (y: number, ang: number) => THREE.Color,
    blendLo = 0.06,
    blendHi = 0.06,
    sides = 14,
  ): void {
    const start = this.pos.length / 3;
    const yLo = Math.min(...rings.map((r) => r.y));
    const yHi = Math.max(...rings.map((r) => r.y));
    // More rings between the given ones, for smooth bends.
    const dense: Ring[] = [];
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i];
      const b = rings[i + 1];
      const steps = Math.max(1, Math.round(Math.abs(b.y - a.y) / 0.025));
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
        // Rings go in either direction of y: keep faces pointing outward.
        if (dense[i + 1].y > dense[i].y) this.idx.push(a, b, d, a, d, c);
        else this.idx.push(a, d, b, a, c, d);
      }
    }
    // Close both ends.
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
    // Shared half and half right at a joint, own bone a little away from it.
    let wb = below >= 0 ? Math.max(0, 1 - (y - lo) / bl) * 0.5 : 0;
    let wa = above >= 0 ? Math.max(0, 1 - (hi - y) / bh) * 0.5 : 0;
    wb = wb * wb * (3 - 2 * wb) * (wb > 0 ? 1 : 0);
    wa = wa * wa * (3 - 2 * wa) * (wa > 0 ? 1 : 0);
    const own = 1 - wb - wa;
    this.skinI.push(bone, below >= 0 ? below : bone, above >= 0 ? above : bone, 0);
    this.skinW.push(own, wb, wa, 0);
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

/**
 * Hides the capsule body and dresses the rig in one comic body. Returns the toon material
 * of the skin so the view can make him shine with sweat later.
 */
export function comicBody(r: Rig, girth: number, look: ComicLook): THREE.MeshToonMaterial {
  for (const m of Object.values(r.mesh)) m.visible = false;
  // Hats, hair and gear the old skins hung on the head and limbs go too.
  for (const g of [r.head, r.lEl, r.rEl, r.lKn, r.rKn, r.spine, r.pelvis, r.lSh, r.rSh, r.lHip, r.rHip]) {
    for (const c of g.children) if ((c as THREE.Mesh).isMesh) c.visible = false;
  }
  const G = girth;
  const mu = look.muscle;
  const skin = new THREE.Color(look.skin);
  const shorts = new THREE.Color(look.shorts);
  const band = new THREE.Color(look.band);
  const shade = (c: THREE.Color, k: number) => c.clone().multiplyScalar(k);
  const B = new Builder();
  const bi = (n: BoneName) => BONES.indexOf(n);

  // Joint heights in the rest pose (see buildRig): pelvis 0.95, spine 1.0, shoulders 1.42,
  // elbows 1.13, wrists 0.84, hips 0.93, knees 0.49, ankles 0.03.
  const shX = 0.2 * G;
  const hipX = 0.1 * G;

  // Hips and shorts: bound to the pelvis.
  B.tube(0, [
    { y: 0.76, rx: 0.13 * G, rz: 0.1 * G },
    { y: 0.86, rx: 0.165 * G, rz: 0.115 * G, oz: -0.005 },
    { y: 0.97, rx: 0.155 * G, rz: 0.11 * G },
    { y: 1.03, rx: 0.145 * G, rz: 0.105 * G },
  ], bi('pelvis'), -1, bi('spine'), (y) => (y > 0.985 ? band : shorts), 0.06, 0.08);

  // The torso: waist, ribs, chest, a little belly; bound to the spine.
  const belly = look.belly;
  B.tube(0, [
    { y: 0.97, rx: 0.15 * G, rz: 0.108 * G },
    { y: 1.06, rx: (0.138 + 0.02 * belly) * G, rz: (0.105 + 0.035 * belly) * G, oz: 0.012 * belly },
    { y: 1.18, rx: (0.16 + 0.01 * mu) * G, rz: (0.112 + 0.02 * belly) * G, oz: 0.008 * belly },
    { y: 1.3, rx: (0.18 + 0.015 * mu) * G, rz: (0.122 + 0.008 * mu) * G, oz: 0.008 },
    { y: 1.38, rx: (0.2 + 0.012 * mu) * G, rz: 0.115 * G, oz: 0.004 },
    { y: 1.45, rx: 0.17 * G, rz: 0.09 * G },
    { y: 1.5, rx: 0.07 * G, rz: 0.06 * G },
  ], bi('spine'), bi('pelvis'), -1, (y, ang) => {
    // A shadow line down the middle of the chest and abs: comic anatomy in one stroke.
    const front = Math.cos(ang) > 0.96 && y > 1.04 && y < 1.36;
    return y < 1.0 ? band : front ? shade(skin, 0.72) : skin;
  }, 0.08, 0.05);

  // The neck, between the shoulders and the head.
  B.tube(0, [
    { y: 1.45, rx: 0.058 * G, rz: 0.06 * G },
    { y: 1.53, rx: 0.05 * Math.sqrt(G), rz: 0.052 * Math.sqrt(G), oz: 0.008 },
    { y: 1.58, rx: 0.046 * Math.sqrt(G), rz: 0.05 * Math.sqrt(G), oz: 0.012 },
  ], bi('spine'), -1, bi('head'), () => skin, 0.05, 0.06);

  for (const side of [1, -1] as const) {
    const L = side > 0;
    const sh = bi(L ? 'lSh' : 'rSh');
    const el = bi(L ? 'lEl' : 'rEl');
    const hp = bi(L ? 'lHip' : 'rHip');
    const kn = bi(L ? 'lKn' : 'rKn');
    const x = side * shX;
    // Shoulder cap (deltoid) and biceps, down to the elbow.
    B.tube(x, [
      { y: 1.47, rx: 0.05 * G, rz: 0.055 * G },
      { y: 1.42, rx: (0.068 + 0.008 * mu) * G, rz: (0.066 + 0.006 * mu) * G },
      { y: 1.33, rx: (0.06 + 0.006 * mu) * G, rz: (0.058 + 0.01 * mu) * G, oz: 0.004 },
      { y: 1.24, rx: (0.054 + 0.004 * mu) * G, rz: (0.057 + 0.01 * mu) * G, oz: 0.008 },
      { y: 1.13, rx: 0.044 * G, rz: 0.046 * G },
    ], sh, el, bi('spine'), () => skin, 0.06, 0.07);
    // Forearm: thick under the elbow, thin at the wrist; the glove covers the hand.
    B.tube(x, [
      { y: 1.15, rx: 0.045 * G, rz: 0.046 * G },
      { y: 1.06, rx: (0.05 + 0.004 * mu) * G, rz: (0.047 + 0.003 * mu) * G },
      { y: 0.95, rx: 0.038 * G, rz: 0.036 * G },
      { y: 0.86, rx: 0.032 * G, rz: 0.03 * G },
    ], el, -1, sh, (y) => (y < 0.9 ? new THREE.Color(0xf0ece4) : skin), 0.05, 0.06);
    // Thigh: thick at the hip, the quad bulging in front, narrowing to the knee.
    const hx = side * hipX;
    B.tube(hx, [
      { y: 0.99, rx: 0.088 * G, rz: 0.09 * G },
      { y: 0.86, rx: (0.088 + 0.006 * mu) * G, rz: (0.092 + 0.006 * mu) * G, oz: 0.006 },
      { y: 0.7, rx: 0.074 * G, rz: 0.078 * G, oz: 0.008 },
      { y: 0.55, rx: 0.058 * G, rz: 0.06 * G },
      { y: 0.48, rx: 0.054 * G, rz: 0.058 * G },
    ], hp, kn, bi('pelvis'), (y) => (y > 0.74 ? shorts : y > 0.72 ? band : skin), 0.07, 0.08);
    // Shin and calf (the calf bulges at the back), down to the ankle.
    B.tube(hx, [
      { y: 0.51, rx: 0.052 * G, rz: 0.055 * G },
      { y: 0.38, rx: (0.054 + 0.004 * mu) * G, rz: (0.062 + 0.006 * mu) * G, oz: -0.012 },
      { y: 0.24, rx: 0.044 * G, rz: 0.046 * G, oz: -0.006 },
      { y: 0.08, rx: 0.034 * G, rz: 0.034 * G },
      { y: 0.03, rx: 0.036 * G, rz: 0.036 * G },
    ], kn, -1, hp, () => skin, 0.05, 0.07);
  }

  const geo = B.geometry();
  const mat = new THREE.MeshToonMaterial({ vertexColors: true });
  const body = new THREE.SkinnedMesh(geo, mat);
  body.castShadow = true;
  body.frustumCulled = false;

  // Bones sit on the rig's joints and move with them.
  const bones = BONES.map((n) => {
    const b = new THREE.Bone();
    (r[n] as THREE.Object3D).add(b);
    return b;
  });
  r.root.add(body);
  // Bind in the rest pose: the rig as built, unrotated, at unit scale.
  r.root.updateMatrixWorld(true);
  body.bind(new THREE.Skeleton(bones));

  // Rigid pieces: head, fists, feet.
  r.head.add(comicHead(G, look));
  for (const [g, side] of [[r.lEl, 1], [r.rEl, -1]] as const) g.add(glove(G, look, side));
  for (const g of [r.lKn, r.rKn]) g.add(foot(G, look));
  void PARENT;
  return mat;
}

const toon = (c: number) => new THREE.MeshToonMaterial({ color: c });

/** A head with a jaw, nose, ears, brows set in a scowl, eyes, and short hair. */
function comicHead(G: number, look: ComicLook): THREE.Group {
  const h = new THREE.Group();
  const sg = Math.sqrt(G);
  const skin = toon(look.skin);
  const dark = toon(new THREE.Color(look.skin).multiplyScalar(0.55).getHex());
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.scale.set(sx, sy, sz);
    mesh.rotation.set(rx, ry, rz);
    mesh.castShadow = true;
    h.add(mesh);
    return mesh;
  };
  // Skull and jaw: a square comic jaw.
  add(new THREE.SphereGeometry(0.1, 18, 14), skin, 0, 0.15, -0.005, 0.95 * sg, 1.08, 1.02 * sg);
  add(new THREE.BoxGeometry(0.15, 0.08, 0.13, 2, 2, 2), skin, 0, 0.075, 0.025, sg, 1, sg);
  add(new THREE.SphereGeometry(0.07, 12, 8), skin, 0, 0.065, 0.045, 1.05 * sg, 0.55, 0.9 * sg);
  // Stubble on the jaw.
  add(new THREE.BoxGeometry(0.152, 0.03, 0.12), dark, 0, 0.045, 0.03, sg, 1, sg);
  // Nose and ears.
  add(new THREE.ConeGeometry(0.018, 0.05, 6), skin, 0, 0.125, 0.105 * sg, 1, 1, 1, Math.PI / 2 + 0.3);
  for (const s of [1, -1]) add(new THREE.SphereGeometry(0.024, 8, 6), skin, s * 0.097 * sg, 0.135, 0, 0.5, 1, 0.8);
  // Eyes: white with a dark pupil looking ahead; heavy brows, angled down to the nose.
  const white = toon(0xf4efe6);
  const ink = toon(0x101014);
  for (const s of [1, -1]) {
    add(new THREE.SphereGeometry(0.017, 10, 8), white, s * 0.036 * sg, 0.158, 0.088 * sg, 1.2, 0.8, 0.6);
    add(new THREE.SphereGeometry(0.008, 8, 6), ink, s * 0.034 * sg, 0.157, 0.098 * sg);
    add(new THREE.BoxGeometry(0.05, 0.014, 0.02), toon(look.hair), s * 0.037 * sg, 0.182, 0.092 * sg, 1, 1, 1, 0, 0, s * 0.28);
  }
  // A mouth line, set hard.
  add(new THREE.BoxGeometry(0.045, 0.007, 0.01), ink, 0, 0.088, 0.088 * sg);
  // Short hair: a cap over the top and back of the skull.
  const hair = new THREE.SphereGeometry(0.104, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.42);
  add(hair, toon(look.hair), 0, 0.165, -0.012, 0.98 * sg, 1.05, 1.06 * sg, -0.25);
  return h;
}

/** A small MMA glove: a padded fist with the team colour at the wrist. */
function glove(G: number, look: ComicLook, side: number): THREE.Group {
  const g = new THREE.Group();
  g.position.y = -0.29;
  const pad = new THREE.Mesh(new THREE.SphereGeometry(0.058, 14, 10), toon(look.gloves));
  pad.scale.set(0.95 * G, 1.05, 1.15 * G);
  pad.castShadow = true;
  g.add(pad);
  const knuckles = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.03, 0.06), toon(look.gloves));
  knuckles.position.set(0, -0.035, 0.012);
  knuckles.scale.set(G, 1, G);
  g.add(knuckles);
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.046, 0.05, 12), toon(look.band));
  cuff.position.y = 0.045;
  cuff.scale.set(G, 1, G);
  g.add(cuff);
  void side;
  return g;
}

/** A bare foot: heel, arch and toes. */
function foot(G: number, look: ComicLook): THREE.Group {
  const g = new THREE.Group();
  g.position.y = -0.46;
  const m = toon(look.skin);
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.055, 0.2, 2, 1, 3), m);
  sole.position.set(0, -0.005, 0.045);
  sole.scale.set(G, 1, 1);
  sole.castShadow = true;
  g.add(sole);
  const toes = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 6), m);
  toes.position.set(0, -0.012, 0.13);
  toes.scale.set(G, 0.55, 0.8);
  g.add(toes);
  const heel = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 6), m);
  heel.position.set(0, 0, -0.04);
  heel.scale.set(G, 0.8, 1);
  g.add(heel);
  return g;
}
