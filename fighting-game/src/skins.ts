import * as THREE from 'three';
import type { Rig } from './rig';
import type { DisciplineId } from './disciplines';

// Looks. A skin repaints the body parts and hangs simple shapes on the rig:
// gloves, masks, belts, helmets. Everything is built from primitives, so it
// stays light on a phone. The team colour always shows on something (shorts,
// mask, belt, visor), so red and blue stay easy to tell apart.
//
// Rig coordinates are for a 1.8 m person: pelvis group at 0.95 m, the torso
// runs up the spine group to ~0.42, the head sphere sits 0.13 above the head
// group (radius 0.11, face toward +Z), arms hang 0.29 + 0.25 from the
// shoulders, legs 0.44 + 0.44 from the hips. Left is +X.

export type SkinId =
  | 'boxer' | 'mma' | 'kick' | 'nakmuay' | 'karateka' | 'luchador' | 'biker'
  | 'ninja' | 'gladiator' | 'robot' | 'clerk' | 'sumo' | 'zombie';

export interface Skin {
  id: SkinId;
  name: string;
  desc: string;
}

export const SKINS: Skin[] = [
  { id: 'boxer', name: 'Боксёр', desc: 'Голый торс, атласные шорты, большие перчатки, высокие боксёрки.' },
  { id: 'mma', name: 'Боец ММА', desc: 'Короткие шорты, открытые перчатки, капа, босиком.' },
  { id: 'kick', name: 'Кикбоксер', desc: 'Длинные атласные штаны, перчатки, футы.' },
  { id: 'nakmuay', name: 'Тайский боксёр', desc: 'Монгкол на голове, повязки на руках, шорты с полосой.' },
  { id: 'karateka', name: 'Каратист', desc: 'Белое ги, чёрный пояс, повязка на лоб, босиком.' },
  { id: 'luchador', name: 'Рестлер', desc: 'Маска лучадора, трико, наколенники, высокие сапоги.' },
  { id: 'biker', name: 'Байкер', desc: 'Кожаная куртка, джинсы, бандана, борода и очки.' },
  { id: 'ninja', name: 'Ниндзя', desc: 'Чёрный костюм, маска с прорезью, повязка с лентами.' },
  { id: 'gladiator', name: 'Гладиатор', desc: 'Шлем с гребнем, наплечник, кожаная юбка, сандалии.' },
  { id: 'robot', name: 'Робот', desc: 'Металл, светящийся визор и антенна.' },
  { id: 'clerk', name: 'Офисный клерк', desc: 'Рубашка, галстук, брюки и очки. Пришёл после работы.' },
  { id: 'sumo', name: 'Сумоист', desc: 'Маваси и пучок волос на макушке.' },
  { id: 'zombie', name: 'Зомби', desc: 'Серо-зелёная кожа, рваная одежда, горящие глаза.' },
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s])) as Record<SkinId, Skin>;

/** What a fighter of a style wears unless chosen otherwise. */
export function defaultSkin(disc: DisciplineId): SkinId {
  return ({ mma: 'mma', boxing: 'boxer', muaythai: 'nakmuay', kickboxing: 'kick', karate: 'karateka', street: 'biker' } as const)[disc];
}

const TONES = [0xe8b896, 0xd19a72, 0xa86f4c, 0x7a4a30, 0xf0c8a8];

type V3 = [number, number, number];

/** Small helper that paints the rig and adds shapes to it. */
class Tailor {
  private mats = new Map<string, THREE.MeshStandardMaterial>();
  constructor(
    readonly r: Rig,
    readonly team: number,
    readonly girth: number,
  ) {}

  mat(color: number, rough = 0.6, metal = 0, glow = 0): THREE.MeshStandardMaterial {
    const key = `${color}|${rough}|${metal}|${glow}`;
    let m = this.mats.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
      if (glow) {
        m.emissive = new THREE.Color(color);
        m.emissiveIntensity = glow;
      }
      this.mats.set(key, m);
    }
    return m;
  }

  get teamDark(): number {
    return new THREE.Color(this.team).multiplyScalar(0.45).getHex();
  }

  paint(parts: (keyof Rig['mesh'])[], m: THREE.Material): void {
    for (const p of parts) this.r.mesh[p].material = m;
  }

  /** A shape on a rig group. */
  add(parent: THREE.Object3D, geo: THREE.BufferGeometry, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0], scale: V3 = [1, 1, 1]): THREE.Mesh {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(...pos);
    mesh.rotation.set(...rot);
    mesh.scale.set(...scale);
    mesh.castShadow = true;
    parent.add(mesh);
    return mesh;
  }

  ball(parent: THREE.Object3D, r: number, m: THREE.Material, pos: V3, scale: V3 = [1, 1, 1]): THREE.Mesh {
    return this.add(parent, new THREE.SphereGeometry(r, 14, 10), m, pos, [0, 0, 0], scale);
  }

  box(parent: THREE.Object3D, size: V3, m: THREE.Material, pos: V3, rot: V3 = [0, 0, 0]): THREE.Mesh {
    return this.add(parent, new THREE.BoxGeometry(...size), m, pos, rot);
  }

  /** A band round a limb or the body (torus lying in the XZ plane). */
  band(parent: THREE.Object3D, radius: number, tube: number, m: THREE.Material, y: number, sx = 1, sz = 1): THREE.Mesh {
    return this.add(parent, new THREE.TorusGeometry(radius, tube, 8, 24), m, [0, y, 0], [Math.PI / 2, 0, 0], [sx, sz, 1]);
  }

  /** A sleeve or trouser leg: a tube around part of a limb, from y0 down to y1. */
  tube(parent: THREE.Object3D, radius: number, y0: number, y1: number, m: THREE.Material, flare = 1): THREE.Mesh {
    const h = y0 - y1;
    const g = new THREE.CylinderGeometry(radius, radius * flare, h, 14, 1);
    return this.add(parent, g, m, [0, (y0 + y1) / 2, 0], [0, 0, 0], [this.girth, 1, this.girth]);
  }

  eyes(m: THREE.Material, size = 0.016): void {
    const h = this.r.head;
    const z = 0.1 * Math.sqrt(this.girth);
    this.ball(h, size, m, [0.038, 0.15, z]);
    this.ball(h, size, m, [-0.038, 0.15, z]);
  }

  /** Hair or a cap: the top of a slightly bigger sphere over the head. */
  cap(m: THREE.Material, height = 0.55, grow = 1.08): THREE.Mesh {
    const g = new THREE.SphereGeometry(0.11 * grow, 16, 10, 0, Math.PI * 2, 0, Math.PI * height);
    return this.add(this.r.head, g, m, [0, 0.135, -0.004], [-0.25, 0, 0], [Math.sqrt(this.girth), 1.08, Math.sqrt(this.girth)]);
  }

  /** A whole mask over the head. */
  hood(m: THREE.Material): THREE.Mesh {
    return this.ball(this.r.head, 0.117, m, [0, 0.13, 0], [Math.sqrt(this.girth), 1.1, Math.sqrt(this.girth)]);
  }

  gloves(color: number, size = 0.085): void {
    for (const h of [this.r.mesh.lHand, this.r.mesh.rHand]) {
      h.material = this.mat(color, 0.35);
      h.scale.set(size / 0.062, (size * 1.1) / 0.062, (size * 1.2) / 0.062);
    }
  }

  wraps(color: number): void {
    for (const el of [this.r.lEl, this.r.rEl]) this.tube(el, 0.05, -0.18, -0.27, this.mat(color, 0.8));
  }

  shorts(color: number, long = 0.2, stripe?: number): void {
    const m = this.mat(color, 0.35, 0.1);
    this.r.mesh.hip.material = m;
    for (const hip of [this.r.lHip, this.r.rHip]) {
      this.tube(hip, 0.1, 0.02, -long, m, 0.95);
      if (stripe !== undefined) this.tube(hip, 0.103, -long + 0.05, -long + 0.01, this.mat(stripe, 0.4));
    }
    this.band(this.r.pelvis, 0.155 * this.girth, 0.03, this.mat(stripe ?? 0xffffff, 0.4), 0.06, 1.12, 0.85);
  }

  boots(color: number, top = -0.28): void {
    const m = this.mat(color, 0.5);
    for (const kn of [this.r.lKn, this.r.rKn]) this.tube(kn, 0.068, top, -0.44, m);
    this.paint(['lFoot', 'rFoot'], m);
  }
}

/** Dresses a rig in a skin. Call before cloning it for afterimages. */
export function dress(r: Rig, id: SkinId, team: number, girth: number, seed: number): void {
  const t = new Tailor(r, team, girth);
  const tone = TONES[Math.abs(seed) % TONES.length];
  const skin = t.mat(tone, 0.7);
  const all: (keyof Rig['mesh'])[] = ['hip', 'torso', 'head', 'lUpper', 'lFore', 'rUpper', 'rFore', 'lThigh', 'lShin', 'rThigh', 'rShin', 'lHand', 'rHand', 'lFoot', 'rFoot'];
  t.paint(all, skin);
  r.mesh.visor.visible = false;
  const eye = t.mat(0x1a1410, 0.4);
  const hair = t.mat([0x1d1612, 0x3b2a1c, 0x6b4a2a, 0x0e0e10][Math.abs(seed >> 3) % 4], 0.9);
  const H = r.head;

  switch (id) {
    case 'boxer':
      t.eyes(eye);
      t.cap(hair, 0.42);
      t.shorts(team, 0.22, 0xf2f2f2);
      t.gloves(team, 0.088);
      t.boots(0x111111, -0.24);
      break;
    case 'mma':
      t.eyes(eye);
      t.cap(hair, 0.36, 1.04);
      t.shorts(team, 0.16, t.teamDark);
      t.gloves(0x111111, 0.07);
      t.ball(H, 0.03, t.mat(team, 0.3), [0, 0.085, 0.09], [1.4, 0.5, 0.6]);
      break;
    case 'kick': {
      t.eyes(eye);
      t.cap(hair, 0.45);
      const pants = t.mat(team, 0.3, 0.1);
      t.shorts(team, 0.42, 0xf2c14e);
      for (const kn of [r.lKn, r.rKn]) t.tube(kn, 0.08, 0, -0.38, pants, 1.15);
      t.gloves(team, 0.085);
      t.paint(['lFoot', 'rFoot'], t.mat(0xf5f5f5, 0.6));
      break;
    }
    case 'nakmuay': {
      t.eyes(eye);
      t.cap(hair, 0.32, 1.03);
      t.shorts(team, 0.14, 0xf2c14e);
      // Mongkol: a stiff ring round the head with a tail at the back.
      const mong = t.mat(0xf3e6c4, 0.5);
      t.add(H, new THREE.TorusGeometry(0.108, 0.016, 8, 24), mong, [0, 0.18, 0], [Math.PI / 2 - 0.25, 0, 0], [Math.sqrt(girth), Math.sqrt(girth), 1]);
      t.box(H, [0.02, 0.1, 0.02], mong, [0, 0.16, -0.14], [0.6, 0, 0]);
      // Prajioud bands on the upper arms.
      for (const sh of [r.lSh, r.rSh]) t.band(sh, 0.062 * girth, 0.014, t.mat(team, 0.5), -0.1);
      t.wraps(0xf4f4f4);
      t.gloves(team, 0.075);
      break;
    }
    case 'karateka': {
      t.eyes(eye);
      t.cap(hair, 0.45);
      const gi = t.mat(0xf4f4f0, 0.85);
      t.paint(['torso', 'hip', 'lUpper', 'rUpper', 'lThigh', 'rThigh', 'lShin', 'rShin'], gi);
      for (const el of [r.lEl, r.rEl]) t.tube(el, 0.055, 0, -0.14, gi, 1.15);
      for (const kn of [r.lKn, r.rKn]) t.tube(kn, 0.072, 0, -0.36, gi, 1.1);
      // Lapels and the black belt with its two ends.
      t.box(r.spine, [0.05, 0.3, 0.02], t.mat(0xe6e6e0, 0.9), [0.03, 0.27, 0.115 * girth], [0, 0, 0.35]);
      const belt = t.mat(0x111111, 0.7);
      t.band(r.pelvis, 0.16 * girth, 0.022, belt, 0.08, 1.15, 0.85);
      t.box(r.pelvis, [0.035, 0.16, 0.01], belt, [0.05, -0.01, 0.135 * girth], [0, 0, 0.15]);
      t.box(r.pelvis, [0.035, 0.15, 0.01], belt, [-0.03, -0.01, 0.135 * girth], [0, 0, -0.2]);
      // Hachimaki in the team colour.
      t.add(H, new THREE.TorusGeometry(0.112, 0.012, 6, 24), t.mat(team, 0.6), [0, 0.18, 0], [Math.PI / 2, 0, 0], [Math.sqrt(girth), Math.sqrt(girth), 1]);
      break;
    }
    case 'luchador': {
      // Mask in the team colour with white eye patches and a pattern on the brow.
      t.hood(t.mat(team, 0.35, 0.1));
      const white = t.mat(0xffffff, 0.4);
      for (const x of [0.04, -0.04]) t.ball(H, 0.03, white, [x, 0.155, 0.093 * Math.sqrt(girth)], [1.3, 0.8, 0.5]);
      t.eyes(eye, 0.012);
      t.box(H, [0.012, 0.09, 0.012], t.mat(0xf2c14e, 0.4, 0.3), [0, 0.215, 0.08], [0.6, 0, 0]);
      t.ball(H, 0.025, skin, [0, 0.085, 0.092], [1.4, 0.7, 0.5]);
      // Singlet, knee pads, high boots.
      const sing = t.mat(t.teamDark, 0.35, 0.1);
      t.paint(['torso', 'hip'], sing);
      for (const hip of [r.lHip, r.rHip]) t.tube(hip, 0.1, 0.02, -0.15, sing);
      for (const kn of [r.lKn, r.rKn]) t.ball(kn, 0.07, t.mat(0x111111, 0.6), [0, -0.02, 0.03], [girth, 1, girth]);
      t.boots(team, -0.1);
      t.band(r.pelvis, 0.16 * girth, 0.035, t.mat(0xf2c14e, 0.3, 0.7), 0.08, 1.12, 0.85);
      break;
    }
    case 'biker': {
      t.eyes(eye);
      const leather = t.mat(0x1b1b1d, 0.45, 0.2);
      t.paint(['torso', 'lUpper', 'rUpper', 'lFore', 'rFore'], leather);
      const jeans = t.mat(0x2c3e66, 0.85);
      t.paint(['hip', 'lThigh', 'rThigh', 'lShin', 'rShin'], jeans);
      t.boots(0x3a2416, -0.3);
      // Collar, bandana in team colour, beard and dark glasses.
      t.band(r.spine, 0.1 * girth, 0.03, leather, 0.44, 1.1, 1);
      t.cap(t.mat(team, 0.7), 0.42, 1.09);
      t.box(H, [0.02, 0.07, 0.02], t.mat(team, 0.7), [0, 0.16, -0.12], [0.4, 0, 0]);
      t.ball(H, 0.07, t.mat(0x3a2a1c, 0.95), [0, 0.07, 0.05], [1.05 * Math.sqrt(girth), 0.9, 0.8]);
      t.box(H, [0.12, 0.03, 0.02], t.mat(0x050505, 0.15, 0.6), [0, 0.155, 0.105 * Math.sqrt(girth)]);
      break;
    }
    case 'ninja': {
      const black = t.mat(0x0d0e12, 0.8);
      t.paint(all, black);
      t.hood(black);
      t.box(H, [0.12, 0.035, 0.02], skin, [0, 0.155, 0.1 * Math.sqrt(girth)]);
      t.eyes(eye, 0.012);
      const tie = t.mat(team, 0.6);
      t.add(H, new THREE.TorusGeometry(0.118, 0.012, 6, 24), tie, [0, 0.19, 0], [Math.PI / 2, 0, 0], [Math.sqrt(girth), Math.sqrt(girth), 1]);
      t.box(H, [0.03, 0.18, 0.008], tie, [0.03, 0.1, -0.13], [0.3, 0, 0.2]);
      t.box(H, [0.03, 0.16, 0.008], tie, [-0.02, 0.1, -0.13], [0.3, 0, -0.15]);
      t.band(r.pelvis, 0.155 * girth, 0.025, tie, 0.08, 1.12, 0.85);
      break;
    }
    case 'gladiator': {
      t.eyes(eye);
      const bronze = t.mat(0xb08d57, 0.35, 0.8);
      const leather = t.mat(0x5a3a22, 0.8);
      // Helmet with a crest in the team colour.
      t.cap(bronze, 0.5, 1.12);
      t.box(H, [0.025, 0.07, 0.24], t.mat(team, 0.7), [0, 0.27, -0.01]);
      t.box(H, [0.03, 0.06, 0.02], bronze, [0, 0.15, 0.11]);
      // Shoulder guard on the lead arm, a strap across the chest.
      t.add(r.lSh, new THREE.SphereGeometry(0.085, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bronze, [0, 0.02, 0], [0, 0, -0.4], [girth, 1, girth]);
      t.box(r.spine, [0.04, 0.42, 0.02], leather, [0, 0.26, 0.115 * girth], [0, 0, 0.6]);
      // Skirt of leather strips and greaves, sandals.
      t.paint(['hip'], leather);
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        t.box(r.pelvis, [0.06, 0.2, 0.012], i % 2 ? leather : t.mat(team, 0.7), [Math.sin(a) * 0.15 * girth, -0.1, Math.cos(a) * 0.12 * girth], [0, a, 0]);
      }
      for (const kn of [r.lKn, r.rKn]) t.tube(kn, 0.066, -0.06, -0.34, bronze);
      t.paint(['lFoot', 'rFoot'], leather);
      break;
    }
    case 'robot': {
      const steel = t.mat(0x9aa3ad, 0.3, 0.85);
      const joint = t.mat(0x2a2f36, 0.5, 0.6);
      t.paint(all, steel);
      t.paint(['lHand', 'rHand', 'hip'], joint);
      // Visor and chest light glow in the team colour, an antenna on top.
      const glow = t.mat(team, 0.2, 0, 2.2);
      t.box(H, [0.17, 0.04, 0.03], glow, [0, 0.155, 0.095 * Math.sqrt(girth)]);
      t.box(r.spine, [0.09, 0.05, 0.02], glow, [0, 0.33, 0.13 * girth]);
      t.add(H, new THREE.CylinderGeometry(0.006, 0.006, 0.12), joint, [0.05, 0.28, 0]);
      t.ball(H, 0.016, glow, [0.05, 0.34, 0]);
      for (const g of [r.lEl, r.rEl, r.lKn, r.rKn]) t.ball(g, 0.055, joint, [0, 0, 0], [girth, 1, girth]);
      break;
    }
    case 'clerk': {
      t.eyes(eye);
      t.cap(hair, 0.4);
      const shirt = t.mat(0xeef1f6, 0.8);
      t.paint(['torso', 'lUpper', 'rUpper', 'lFore', 'rFore'], shirt);
      const trousers = t.mat(0x2b2e36, 0.8);
      t.paint(['hip', 'lThigh', 'rThigh', 'lShin', 'rShin'], trousers);
      t.paint(['lFoot', 'rFoot'], t.mat(0x0c0c0c, 0.3, 0.2));
      // Tie in the team colour, glasses, a belt.
      t.box(r.spine, [0.045, 0.24, 0.015], t.mat(team, 0.5), [0, 0.3, 0.12 * girth]);
      t.box(H, [0.13, 0.035, 0.01], t.mat(0x111111, 0.3, 0.5), [0, 0.155, 0.107 * Math.sqrt(girth)]);
      t.band(r.pelvis, 0.155 * girth, 0.018, t.mat(0x1a1210, 0.4), 0.07, 1.12, 0.85);
      break;
    }
    case 'sumo': {
      t.eyes(eye);
      t.cap(t.mat(0x0b0b0d, 0.8), 0.35, 1.04);
      t.ball(H, 0.035, t.mat(0x0b0b0d, 0.8), [0, 0.25, -0.05], [1, 0.8, 1.4]);
      // Mawashi: a thick belt with the front panel.
      const maw = t.mat(team, 0.6);
      t.band(r.pelvis, 0.15 * girth, 0.05, maw, 0.02, 1.12, 0.9);
      t.box(r.pelvis, [0.12, 0.16, 0.03], maw, [0, -0.06, 0.13 * girth]);
      t.paint(['hip'], maw);
      break;
    }
    case 'zombie': {
      const rot = t.mat(0x8aa07a, 0.9);
      t.paint(all, rot);
      const rag = t.mat(0x6b5a44, 0.95);
      t.paint(['torso', 'rUpper', 'hip', 'lThigh', 'rThigh', 'lShin'], rag);
      t.eyes(t.mat(team, 0.3, 0, 2.5), 0.017);
      t.cap(t.mat(0x2a2a22, 0.95), 0.3, 1.05);
      // Torn patches and stains.
      const blood = t.mat(0x5a1414, 0.9);
      t.box(r.spine, [0.08, 0.05, 0.01], blood, [0.05, 0.2, 0.12 * girth], [0, 0, 0.5]);
      t.box(r.spine, [0.06, 0.04, 0.01], rot, [-0.06, 0.32, 0.12 * girth], [0, 0, -0.3]);
      t.band(r.pelvis, 0.155 * girth, 0.02, t.mat(team, 0.7), 0.07, 1.12, 0.85);
      break;
    }
  }
}
