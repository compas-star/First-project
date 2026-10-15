import * as THREE from 'three';

// A jointed humanoid built from capsules. Proportions are for a 1.8 m person;
// the fighter scales the root for other heights. The character faces +Z,
// its left side is +X.

export interface Rig {
  root: THREE.Group;
  /** Pivot at the feet, rotated to make the whole body fall over. */
  tilt: THREE.Group;
  pelvis: THREE.Group;
  spine: THREE.Group;
  head: THREE.Group;
  lSh: THREE.Group;
  lEl: THREE.Group;
  rSh: THREE.Group;
  rEl: THREE.Group;
  lHip: THREE.Group;
  lKn: THREE.Group;
  rHip: THREE.Group;
  rKn: THREE.Group;
  lHand: THREE.Object3D;
  rHand: THREE.Object3D;
  lFoot: THREE.Object3D;
  rFoot: THREE.Object3D;
  /** The body meshes, so a skin can repaint them and hang things on them. */
  mesh: Record<'hip' | 'torso' | 'head' | 'visor' | 'lUpper' | 'lFore' | 'rUpper' | 'rFore' | 'lThigh' | 'lShin' | 'rThigh' | 'rShin' | 'lHand' | 'rHand' | 'lFoot' | 'rFoot', THREE.Mesh>;
}

export const PELVIS_Y = 0.95;
const LEG = 0.88;

/** Joint angles in degrees plus a crouch depth in meters. */
export interface Pose {
  crouch: number;
  pelvisTwist: number;
  spineLean: number;
  spineTwist: number;
  spineSide: number;
  headPitch: number;
  lShF: number;
  lShS: number;
  lEl: number;
  rShF: number;
  rShS: number;
  rEl: number;
  lHipF: number;
  lHipS: number;
  lKn: number;
  rHipF: number;
  rHipS: number;
  rKn: number;
  /** Whole-body fall backwards, 90 = lying on the back. */
  bodyTilt: number;
}

export type PoseKey = keyof Pose;
export const POSE_KEYS = [
  'crouch', 'pelvisTwist', 'spineLean', 'spineTwist', 'spineSide', 'headPitch',
  'lShF', 'lShS', 'lEl', 'rShF', 'rShS', 'rEl',
  'lHipF', 'lHipS', 'lKn', 'rHipF', 'rHipS', 'rKn', 'bodyTilt',
] as const satisfies readonly PoseKey[];

export const STANCE: Pose = {
  crouch: 0.06,
  pelvisTwist: -15,
  spineLean: 10,
  spineTwist: -10,
  spineSide: 0,
  headPitch: -8,
  lShF: 60, lShS: 12, lEl: 105,
  rShF: 40, rShS: 18, rEl: 125,
  lHipF: 18, lHipS: 4, lKn: 8,
  rHipF: -14, rHipS: 6, rKn: 10,
  bodyTilt: 0,
};

export function clonePose(p: Pose): Pose {
  return { ...p };
}

export function lerpPose(out: Pose, a: Pose, b: Pose, t: number): Pose {
  for (const k of POSE_KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

const D = THREE.MathUtils.degToRad;

function limb(radius: number, length: number, mat: THREE.Material, girth: number): THREE.Mesh {
  const g = new THREE.CapsuleGeometry(radius, Math.max(0.01, length - radius * 2), 4, 10);
  g.translate(0, -length / 2, 0);
  const m = new THREE.Mesh(g, mat);
  m.scale.set(girth, 1, girth);
  m.castShadow = true;
  return m;
}

function group(parent: THREE.Object3D, x: number, y: number, z: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  parent.add(g);
  return g;
}

export function buildRig(color: number, girth: number): Rig {
  const base = new THREE.Color(color);
  const body = new THREE.MeshStandardMaterial({ color: base, roughness: 0.55, metalness: 0.05 });
  const dark = new THREE.MeshStandardMaterial({
    color: base.clone().multiplyScalar(0.45),
    roughness: 0.7,
  });
  const light = new THREE.MeshStandardMaterial({
    color: base.clone().lerp(new THREE.Color(0xffffff), 0.55),
    roughness: 0.5,
  });
  const visorMat = new THREE.MeshStandardMaterial({ color: 0x0b0d12, roughness: 0.2, metalness: 0.4 });

  const root = new THREE.Group();
  const tilt = group(root, 0, 0, 0);
  const pelvis = group(tilt, 0, PELVIS_Y, 0);

  const hipMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8), dark);
  hipMesh.scale.set(1.15 * girth, 0.7, 0.85 * girth);
  hipMesh.castShadow = true;
  pelvis.add(hipMesh);

  const spine = group(pelvis, 0, 0.05, 0);
  const torsoGeo = new THREE.CapsuleGeometry(0.14, 0.24, 4, 12);
  torsoGeo.translate(0, 0.26, 0);
  const torso = new THREE.Mesh(torsoGeo, body);
  torso.scale.set(1.3 * girth, 1, 0.82 * girth);
  torso.castShadow = true;
  spine.add(torso);

  const head = group(spine, 0, 0.5, 0);
  const headMesh = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), light);
  headMesh.position.y = 0.13;
  headMesh.scale.set(Math.sqrt(girth), 1.08, Math.sqrt(girth));
  headMesh.castShadow = true;
  head.add(headMesh);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.035, 0.03), visorMat);
  visor.position.set(0, 0.15, 0.095 * Math.sqrt(girth));
  head.add(visor);

  const lSh = group(spine, 0.2 * girth, 0.42, 0);
  const rSh = group(spine, -0.2 * girth, 0.42, 0);
  const lUpper = limb(0.055, 0.29, body, girth);
  const rUpper = limb(0.055, 0.29, body, girth);
  lSh.add(lUpper);
  rSh.add(rUpper);
  const lEl = group(lSh, 0, -0.29, 0);
  const rEl = group(rSh, 0, -0.29, 0);
  const lFore = limb(0.045, 0.25, body, girth);
  const rFore = limb(0.045, 0.25, body, girth);
  lEl.add(lFore);
  rEl.add(rFore);
  const fistGeo = new THREE.SphereGeometry(0.062, 12, 8);
  const lHand = new THREE.Mesh(fistGeo, dark);
  const rHand = new THREE.Mesh(fistGeo, dark);
  lHand.position.y = -0.29;
  rHand.position.y = -0.29;
  lHand.castShadow = rHand.castShadow = true;
  lEl.add(lHand);
  rEl.add(rHand);

  const lHip = group(pelvis, 0.1 * girth, -0.02, 0);
  const rHip = group(pelvis, -0.1 * girth, -0.02, 0);
  const lThigh = limb(0.075, 0.44, body, girth);
  const rThigh = limb(0.075, 0.44, body, girth);
  lHip.add(lThigh);
  rHip.add(rThigh);
  const lKn = group(lHip, 0, -0.44, 0);
  const rKn = group(rHip, 0, -0.44, 0);
  const lShin = limb(0.058, 0.44, body, girth);
  const rShin = limb(0.058, 0.44, body, girth);
  lKn.add(lShin);
  rKn.add(rShin);
  const footGeo = new THREE.BoxGeometry(0.11, 0.06, 0.24);
  footGeo.translate(0, 0, 0.05);
  const lFoot = new THREE.Mesh(footGeo, dark);
  const rFoot = new THREE.Mesh(footGeo, dark);
  lFoot.position.y = -0.46;
  rFoot.position.y = -0.46;
  lFoot.castShadow = rFoot.castShadow = true;
  lKn.add(lFoot);
  rKn.add(rFoot);

  return {
    root, tilt, pelvis, spine, head, lSh, lEl, rSh, rEl, lHip, lKn, rHip, rKn, lHand, rHand, lFoot, rFoot,
    mesh: {
      hip: hipMesh, torso, head: headMesh, visor, lUpper, lFore, rUpper, rFore, lThigh, lShin, rThigh, rShin,
      lHand, rHand, lFoot, rFoot,
    },
  };
}

export function applyPose(r: Rig, p: Pose): void {
  // Bend the legs so the feet stay on the ground when the pelvis drops.
  const c = THREE.MathUtils.clamp(p.crouch, 0, LEG * 0.8);
  const bend = Math.acos(THREE.MathUtils.clamp(1 - c / LEG, -1, 1));

  r.tilt.rotation.x = -D(p.bodyTilt);
  r.pelvis.position.y = PELVIS_Y - c;
  r.pelvis.rotation.set(0, D(p.pelvisTwist), 0);
  r.spine.rotation.set(D(p.spineLean), D(p.spineTwist), D(p.spineSide));
  r.head.rotation.set(D(p.headPitch), -D(p.spineTwist + p.pelvisTwist) * 0.85, -D(p.spineSide) * 0.5);

  r.lSh.rotation.set(-D(p.lShF), 0, D(p.lShS));
  r.rSh.rotation.set(-D(p.rShF), 0, -D(p.rShS));
  r.lEl.rotation.set(-D(p.lEl), 0, 0);
  r.rEl.rotation.set(-D(p.rEl), 0, 0);

  r.lHip.rotation.set(-D(p.lHipF) - bend, 0, D(p.lHipS));
  r.rHip.rotation.set(-D(p.rHipF) - bend, 0, -D(p.rHipS));
  r.lKn.rotation.set(D(p.lKn) + bend * 2, 0, 0);
  r.rKn.rotation.set(D(p.rKn) + bend * 2, 0, 0);
}

/** Every object of the rig in a stable order, used to copy poses onto afterimages. */
export function rigNodes(r: Rig): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  r.root.traverse((o) => out.push(o));
  return out;
}
