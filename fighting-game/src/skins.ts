import { headVarOf } from './headShape';
import * as THREE from 'three';
import type { Rig } from './rig';
import type { ComicLook } from './body';
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
  | 'ninja' | 'gladiator' | 'robot' | 'clerk' | 'sumo' | 'zombie' | 'wrestler' | 'bjj'
  | 'rider' | 'artist' | 'brute' | 'feral'
  | 'worker' | 'sovboxer' | 'vdv' | 'gopnik' | 'ironfist'
  | 'velvet' | 'barkhat' | 'docker' | 'student' | 'yard' | 'titan';

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
  { id: 'wrestler', name: 'Борец', desc: 'Трико, наушники-защита, борцовки.' },
  { id: 'bjj', name: 'Джиу-джитсер', desc: 'Плотное ги, цветной пояс, босиком.' },
  { id: 'luchador', name: 'Рестлер', desc: 'Маска лучадора, трико, наколенники, высокие сапоги.' },
  { id: 'biker', name: 'Байкер', desc: 'Кожаная куртка, джинсы, бандана, борода и очки.' },
  { id: 'ninja', name: 'Ниндзя', desc: 'Чёрный костюм, маска с прорезью, повязка с лентами.' },
  { id: 'gladiator', name: 'Гладиатор', desc: 'Шлем с гребнем, наплечник, кожаная юбка, сандалии.' },
  { id: 'robot', name: 'Терминатор', desc: 'Кожаная куртка, тёмные очки, короткая стрижка. Не устаёт и не улыбается.' },
  { id: 'clerk', name: 'Офисный клерк', desc: 'Рубашка, галстук, брюки и очки. Пришёл после работы.' },
  { id: 'sumo', name: 'Сумоист', desc: 'Маваси и пучок волос на макушке.' },
  { id: 'zombie', name: 'Бродяга', desc: 'Рваная футболка, драные штаны, длинные патлы. Терять нечего.' },
  { id: 'rider', name: 'Призрачный байкер', desc: 'Кожанка с шипами, цепь через грудь, бритый череп и мрачный взгляд.' },
  { id: 'artist', name: 'Художник', desc: 'Сбежал со страницы комикса: светлый хвост, рваные джинсы, карандаш за ухом.' },
  { id: 'brute', name: 'Громила', desc: 'Гора мышц, бритая голова, драные фиолетовые штаны.' },
  { id: 'feral', name: 'Зверь', desc: 'Бакенбарды, взъерошенные волосы, жёлтая майка, бинты на кулаках.' },
  { id: 'worker', name: 'Заводской', desc: 'Синий рабочий комбинезон на голое тело, бинты, рабочие ботинки.' },
  { id: 'sovboxer', name: 'Советский боксёр', desc: 'Красная майка, красные трусы с белым поясом, белые высокие боксёрки.' },
  { id: 'vdv', name: 'Десантник', desc: 'Тельняшка, камуфляжные штаны, берцы.' },
  { id: 'gopnik', name: 'Пацан с района', desc: 'Чёрный спортивный костюм с тремя белыми полосками, бритый затылок.' },
  { id: 'ironfist', name: '«Железный кулак»', desc: 'Чёрные тайские шорты с золотым поясом, золотой монгкол на голове.' },
  { id: 'velvet', name: '«Бархатные»', desc: 'Чёрный костюм, золотая цепь, тёмные очки.' },
  { id: 'barkhat', name: 'Промоутер', desc: 'Бордовый бархатный пиджак, брюки, цепь и очки.' },
  { id: 'docker', name: 'Докер', desc: 'Бушлат, рабочие штаны, вязаная шапка, борода.' },
  { id: 'student', name: 'Студент', desc: 'Синяя форма университета, белые перчатки и боксёрки.' },
  { id: 'yard', name: 'Пацан со двора', desc: 'Бордовый спортивный костюм с золотыми полосками, цепь.' },
  { id: 'titan', name: 'Чемпион города', desc: 'Золотые трусы, чёрные перчатки, бритая голова.' },
];

export const SKIN_BY_ID = Object.fromEntries(SKINS.map((s) => [s.id, s])) as Record<SkinId, Skin>;

/** What a fighter of a style wears unless chosen otherwise. */
export function defaultSkin(disc: DisciplineId): SkinId {
  return ({ mma: 'mma', boxing: 'boxer', muaythai: 'nakmuay', kickboxing: 'kick', karate: 'karateka', street: 'biker', wrestling: 'wrestler', bjj: 'bjj' } as const)[disc];
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

/** Dresses a rig in a skin. Call before cloning it for afterimages. Returns the bare-skin material (for sweat). */
export function dress(r: Rig, id: SkinId, team: number, girth: number, seed: number): THREE.MeshStandardMaterial {
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
    case 'wrestler': {
      t.eyes(eye);
      t.cap(hair, 0.32, 1.03);
      const sing = t.mat(team, 0.4, 0.1);
      t.paint(['torso', 'hip'], sing);
      for (const hip of [r.lHip, r.rHip]) t.tube(hip, 0.1, 0.02, -0.18, sing);
      // Ear guards and the strap over the head.
      const gear = t.mat(0x1a1a1e, 0.5);
      for (const x of [0.105, -0.105]) t.ball(H, 0.045, gear, [x * Math.sqrt(girth), 0.13, 0], [0.5, 1, 0.9]);
      t.add(H, new THREE.TorusGeometry(0.11, 0.01, 6, 20, Math.PI), gear, [0, 0.14, 0], [0, Math.PI / 2, 0], [Math.sqrt(girth), 1.15, 1]);
      t.boots(t.teamDark, -0.2);
      break;
    }
    case 'bjj': {
      t.eyes(eye);
      t.cap(hair, 0.4);
      const gi = t.mat(team === 0xf0533e ? 0xf4f4f0 : 0x1d3c78, 0.85);
      t.paint(['torso', 'hip', 'lUpper', 'rUpper', 'lFore', 'rFore', 'lThigh', 'rThigh', 'lShin', 'rShin'], gi);
      for (const kn of [r.lKn, r.rKn]) t.tube(kn, 0.07, 0, -0.38, gi, 1.05);
      const belt = t.mat([0x7a2fbf, 0x6b3a1e, 0x111111][Math.abs(seed) % 3], 0.6);
      t.band(r.pelvis, 0.16 * girth, 0.024, belt, 0.08, 1.15, 0.85);
      t.box(r.pelvis, [0.035, 0.15, 0.01], belt, [0.04, -0.01, 0.135 * girth], [0, 0, 0.15]);
      t.band(r.spine, 0.1 * girth, 0.025, t.mat(team, 0.6), 0.44, 1.1, 1);
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
  return skin;
}

/**
 * The comic look of a skin: grotesque proportions, outfit, head and hands. The team colour
 * always shows on something big (shorts, trousers, a mask or a jacket's trim).
 */
export function comicLook(id: SkinId, team: number, seed: number, strength: number, girth: number): ComicLook {
  const tone = TONES[Math.abs(seed) % TONES.length];
  const hair = [0x1d1612, 0x3b2a1c, 0x6b4a2a, 0x0e0e10][Math.abs(seed >> 3) % 4];
  const bulk = Math.min(1.35, Math.max(0.8, 0.7 + 0.45 * strength + 0.25 * (girth - 1)));
  const belly = Math.min(1, Math.max(0, (girth - 1.15) * 2));
  const base: ComicLook = {
    skin: tone, bulk, arms: bulk, belly, head: 'face', hair: 'crop', hairColor: hair, beard: false,
    hands: 'mma', handColor: 0x18181d, top: 'none', topColor: 0xffffff, bottom: 'trunks', bottomColor: team, band: 0xf2efe8,
    shoes: 0, shoeColor: 0x111111, extras: [],
  };
  const dark = new THREE.Color(team).multiplyScalar(0.45).getHex();
  switch (id) {
    case 'boxer':
      return { ...base, hands: 'boxing', handColor: team, bottom: 'trunks', shoes: 0.3, shoeColor: 0x151515, hair: 'crop' };
    case 'mma':
      return { ...base, bottom: 'shorts', hair: Math.abs(seed) % 2 ? 'crop' : 'mohawk', extras: ['scar'] };
    case 'kick':
      return { ...base, hands: 'boxing', handColor: 0x111111, bottom: 'long', bottomColor: team, hair: 'spiky' };
    case 'nakmuay':
      return { ...base, hands: 'boxing', handColor: 0xb71c1c, bottom: 'trunks', hair: 'headband', maskColor: team, band: 0xf2c14e };
    case 'karateka':
      return { ...base, hands: 'bare', top: 'gi', topColor: 0xf2f2ee, bottom: 'long', bottomColor: 0xf2f2ee, hair: 'headband', maskColor: team };
    case 'bjj':
      return { ...base, hands: 'bare', top: 'gi', topColor: 0x2b3b8f, bottom: 'long', bottomColor: 0x2b3b8f, hair: 'crop', beard: true, band: team };
    case 'wrestler':
      return { ...base, hands: 'bare', bottom: 'singlet', bottomColor: team, shoes: 0.25, shoeColor: dark, hair: 'crop' };
    case 'luchador':
      return { ...base, head: 'mask', maskColor: team, bottom: 'long', bottomColor: dark, hands: 'wraps', shoes: 0.3, shoeColor: team, extras: ['kneepads'] };
    case 'biker':
      return { ...base, top: 'vest', topColor: 0x1a1414, bottom: 'long', bottomColor: 0x2d4a78, hair: 'bandana', maskColor: team, beard: true, shoes: 0.25, shoeColor: 0x2a1a10, hands: 'fingerless', handColor: 0x1a1414, extras: ['shades', 'belt'] };
    case 'ninja':
      return { ...base, head: 'mask', maskColor: 0x111116, top: 'long', topColor: 0x15151b, bottom: 'long', bottomColor: 0x15151b, hands: 'wraps', band: team, extras: [] };
    case 'gladiator':
      return { ...base, head: 'helmet', maskColor: 0xb08a3e, bottom: 'shorts', bottomColor: 0x6b3f22, band: team, shoes: 0.2, shoeColor: 0x6b3f22, hands: 'wraps', extras: ['belt'] };
    case 'robot':
      return { ...base, hair: 'crop', hairColor: 0x1a1612, top: 'jacket', topColor: 0x111114, bottom: 'long', bottomColor: 0x1a1a20, band: team, shoes: 0.28, shoeColor: 0x111111, hands: 'fingerless', handColor: 0x111114, extras: ['shades', 'belt'] };
    case 'clerk':
      return { ...base, top: 'long', topColor: 0xeef0f4, bottom: 'long', bottomColor: 0x2b2f3a, shoes: 0.12, shoeColor: 0x111111, hands: 'bare', hair: 'crop', band: team, extras: ['shades'] };
    case 'sumo':
      return { ...base, bulk: 1.3, arms: 1.1, belly: 1, bottom: 'mawashi', bottomColor: team, hands: 'bare', hair: 'topknot' };
    case 'zombie':
      return { ...base, top: 'tee', topColor: 0x6b6250, bottom: 'torn', bottomColor: 0x3a4a5a, band: team, hands: 'wraps', hair: 'long', hairColor: 0x2a2a20, beard: true };
    case 'rider':
      // A biker with a nod to the Ghost Rider: leather, spikes, a chain, a shaved head.
      return { ...base, hair: 'bald', top: 'jacket', topColor: 0x141012, bottom: 'long', bottomColor: 0x1f2433, band: team, shoes: 0.3, shoeColor: 0x141012, hands: 'fingerless', handColor: 0x141012, extras: ['spikes', 'chain', 'belt', 'scar'] };
    case 'artist':
      // Out of the comic page: a blond ponytail, torn jeans, fingerless gloves, a pencil.
      return { ...base, hair: 'ponytail', hairColor: 0xf1d36b, top: 'vest', topColor: team, bottom: 'torn', bottomColor: 0x3f6db3, shoes: 0.22, shoeColor: 0xe8e2d6, hands: 'fingerless', handColor: 0x1a1a1a, extras: ['pencil'] };
    case 'brute':
      return { ...base, bulk: 1.45, arms: 1.4, belly: 0.25, hair: 'crop', hairColor: 0x1a1410, bottom: 'torn', bottomColor: 0x5a2d82, band: team, hands: 'wraps' };
    case 'worker':
      // Overalls: a bib over the bare chest, trousers to the boots.
      return { ...base, top: 'vest', topColor: 0x2a4a8a, bottom: 'long', bottomColor: 0x2a4a8a, band: team, hands: 'wraps', shoes: 0.28, shoeColor: 0x2a1f16, hair: 'crop' };
    case 'sovboxer':
      return { ...base, top: 'vest', topColor: 0xc8102e, bottom: 'trunks', bottomColor: 0xc8102e, band: 0xf4f4f0, hands: 'boxing', handColor: 0xc8102e, shoes: 0.38, shoeColor: 0xf0eee8, hair: 'crop' };
    case 'vdv':
      return { ...base, top: 'tee', topColor: 0x1f4fa8, pattern: 'telnyashka', stripeColor: 0xf4f4f0, bottom: 'long', bottomColor: 0x5a6a3a, band: team, hands: 'fingerless', handColor: 0x1a1a1a, shoes: 0.34, shoeColor: 0x151515, hair: 'crop' };
    case 'gopnik':
      return { ...base, top: 'long', topColor: 0x15151a, pattern: 'tracksuit', stripeColor: 0xf4f4f0, bottom: 'long', bottomColor: 0x15151a, band: team, hands: 'bare', shoes: 0.14, shoeColor: 0xe8e8e4, hair: 'bald' };
    case 'ironfist':
      return { ...base, hands: 'boxing', handColor: 0x111111, bottom: 'trunks', bottomColor: 0x111111, band: 0xd4a72c, hair: 'headband', maskColor: 0xd4a72c, capColor: 0xd4a72c, shoes: 0 };
    case 'velvet':
      return { ...base, top: 'jacket', topColor: 0x111114, bottom: 'long', bottomColor: 0x15151a, band: team, hands: 'bare', shoes: 0.12, shoeColor: 0x0a0a0a, hair: 'crop', extras: ['chain', 'shades'] };
    case 'barkhat':
      return { ...base, top: 'jacket', topColor: 0x5a1030, bottom: 'long', bottomColor: 0x1a1418, band: team, hands: 'bare', shoes: 0.12, shoeColor: 0x0a0a0a, hair: 'crop', hairColor: 0x9a9a98, extras: ['chain', 'shades'] };
    case 'docker':
      return { ...base, top: 'jacket', topColor: 0x1f2a3a, bottom: 'long', bottomColor: 0x3a3a30, band: team, hands: 'wraps', shoes: 0.28, shoeColor: 0x3a2416, hair: 'bandana', maskColor: 0x2a2a2e, capColor: 0x2a2a2e, beard: true };
    case 'student':
      return { ...base, top: 'tee', topColor: 0x2a62c8, bottom: 'shorts', bottomColor: 0x2a62c8, band: 0xf4f4f0, hands: 'boxing', handColor: 0xf2f2ee, shoes: 0.3, shoeColor: 0xf2f2ee, hair: 'crop' };
    case 'yard':
      return { ...base, top: 'long', topColor: 0x5a1424, pattern: 'tracksuit', stripeColor: 0xd4a72c, bottom: 'long', bottomColor: 0x5a1424, band: team, hands: 'bare', shoes: 0.14, shoeColor: 0xe8e8e4, hair: 'crop', extras: ['chain'] };
    case 'titan':
      return { ...base, bulk: Math.max(1.3, bulk), arms: Math.max(1.25, bulk), hands: 'boxing', handColor: 0x111111, bottom: 'trunks', bottomColor: 0xd4a72c, band: 0x111111, shoes: 0.34, shoeColor: 0x111111, hair: 'bald' };
    case 'feral':
      return { ...base, hair: 'spiky', hairColor: 0x161214, top: 'vest', topColor: 0xf2c418, bottom: 'long', bottomColor: 0x1d2a63, band: team, shoes: 0.25, shoeColor: 0x2a1a10, hands: 'wraps', extras: ['belt'] };
  }
  return base;
}

/**
 * The low-poly look (after Absolver): the same characters as the comic look (bikers, boxers,
 * wrestlers... with their clothes, gloves and boots), built in facets with carved faces.
 * Only the luchador and the ninja wear masks (pattern in the team colour).
 */
export function absolverLook(id: SkinId, team: number, seed: number, strength: number, girth: number): ComicLook {
  const base = comicLook(id, team, seed, strength, girth);
  const r = (n: number) => {
    let h = (seed ^ Math.imul(n + 1, 0x9e3779b9)) | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const porcelain = [0xece6d8, 0xe2d6bc, 0xd8d0c0, 0xc8b89a];
  // Masks that fit the character.
  const MASK: Partial<Record<SkinId, number>> = {
    luchador: base.maskColor ?? team, ninja: 0x18181e, gladiator: 0xb08a3e, robot: 0x8a9098,
    rider: 0xe8e0cc, brute: 0x6a7a5a, zombie: 0xb8b0a0, sumo: 0xf0e8d8,
  };
  const HAIR: Partial<Record<SkinId, ComicLook['hair']>> = { ninja: 'hood', luchador: 'bald', gladiator: 'mohawk', zombie: 'long', brute: 'crop' };
  const extras: ComicLook['extras'] = base.extras.filter((e) => e === 'spikes' || e === 'chain' || e === 'belt' || e === 'kneepads' || e === 'shades' || e === 'scar');
  if (id === 'ninja' || id === 'karateka' || id === 'rider') extras.push('scarf');
  return {
    ...base,
    low: true,
    bulk: Math.min(1.25, base.bulk),
    arms: Math.min(1.15, base.arms),
    // Faces in facets; only the luchador and the ninja keep their masks.
    head: id === 'luchador' || id === 'ninja' ? 'mask' : 'face',
    face: headVarOf(r),
    hair: HAIR[id] ?? base.hair,
    capColor: id === 'ninja' ? 0x15151b : base.maskColor ?? team,
    maskKind: id === 'luchador' ? 3 : id === 'ninja' ? 0 : Math.floor(r(5) * 4),
    maskColor: MASK[id] ?? porcelain[Math.floor(r(7) * porcelain.length)],
    maskAccent: id === 'luchador' ? 0xf4efe6 : team,
    band: id === 'ninja' || id === 'karateka' ? team : base.band,
    extras,
  };
}
