import * as THREE from 'three';
import { ALLEY_HALF, type MapDef } from './maps';

// The look of each map: floor, ring or cage, walls, lights, crowd, city.
// Everything is primitives and canvas textures, cheap enough for a phone.
// Walls are drawn one-sided facing inward, so the orbiting camera sees
// through them from outside.

export interface Arena {
  group: THREE.Group;
  background: number;
  fog: [number, number, number];
  /** Brightness of the main light and the sky light. */
  sun: number;
  hemi: number;
  /** Crates look: wood, metal bins, roof units. */
  crate: THREE.Material;
  /** Called every frame: crowd and blinking lights. `excite` 0..1 jumps on big blows. */
  update(t: number, excite: number): void;
}

function canvas(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat?: [number, number]): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  return tex;
}

function noise(g: CanvasRenderingContext2D, w: number, h: number, n: number, color: string, size = 2): void {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) g.fillRect(Math.random() * w, Math.random() * h, size, size);
}

const std = (color: number, rough = 0.8, metal = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });

function mesh(g: THREE.BufferGeometry, m: THREE.Material, shadow = true): THREE.Mesh {
  const o = new THREE.Mesh(g, m);
  o.receiveShadow = shadow;
  o.castShadow = shadow;
  return o;
}


/** A sky dome: a vertical gradient, with extras drawn on it (stars, glow, silhouettes). */
function skyDome(stops: [number, string][], draw?: (g: CanvasRenderingContext2D, w: number, h: number) => void, r = 95): THREE.Mesh {
  const tex = canvas(1024, 512, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 512);
    for (const [k, c] of stops) gr.addColorStop(k, c);
    g.fillStyle = gr;
    g.fillRect(0, 0, 1024, 512);
    draw?.(g, 1024, 512);
  });
  tex.wrapS = THREE.RepeatWrapping;
  // Seen from inside: flip so text reads the right way.
  tex.repeat.x = -1;
  const dome = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16), new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false }));
  dome.renderOrder = -10;
  return dome;
}

/** Stars scattered over the upper half of a dome texture. */
function stars(g: CanvasRenderingContext2D, w: number, h: number, n: number, top = 0.55): void {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * 0.8 + 0.2;
    g.fillStyle = `rgba(220,230,255,${a})`;
    const s = Math.random() < 0.08 ? 2 : 1;
    g.fillRect(Math.random() * w, Math.random() * h * top, s, s);
  }
}

/** A soft beam of light from a lamp: an additive cone that fades toward the floor. */
function beam(group: THREE.Group, from: THREE.Vector3, to: THREE.Vector3, radius: number, color: number, strength = 0.18): THREE.Mesh {
  const len = from.distanceTo(to);
  const fade = canvas(4, 256, (g) => {
    const gr = g.createLinearGradient(0, 0, 0, 256);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 4, 256);
  });
  const geo = new THREE.CylinderGeometry(0.15, radius, len, 24, 1, true);
  geo.translate(0, -len / 2, 0);
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    color, alphaMap: fade, transparent: true, opacity: strength, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.FrontSide, fog: false,
  }));
  m.position.copy(from);
  m.lookAt(to);
  m.rotateX(-Math.PI / 2);
  group.add(m);
  return m;
}

/** A glowing sign: text drawn with a neon halo onto a plane. */
function neonSign(text: string, color: string, w: number, h: number, font = '900 110px "Russo One", Arial Black, sans-serif'): THREE.Mesh {
  const tex = canvas(512, Math.round(512 * h / w), (g) => {
    const H = g.canvas.height;
    g.fillStyle = '#05060a';
    g.fillRect(0, 0, 512, H);
    g.strokeStyle = color;
    g.lineWidth = 6;
    g.shadowColor = color;
    g.shadowBlur = 24;
    g.strokeRect(10, 10, 492, H - 20);
    g.fillStyle = '#fff';
    g.font = font;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 256, H / 2 + 4);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = color;
    g.globalAlpha = 0.55;
    g.fillRect(0, 0, 512, H);
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.5, roughness: 0.5 }));
}

/** Falling streaks (rain) or slow drifting flakes (petals, ash) in a box round the fight. */
function fallers(group: THREE.Group, n: number, half: number, height: number, kind: 'rain' | 'petal', color: number): (t: number) => void {
  const pos = new Float32Array(n * 6);
  const seed = Array.from({ length: n }, () => Math.random());
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const obj = kind === 'rain'
    ? new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.45, depthWrite: false }))
    : new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.035, transparent: true, opacity: 0.9, depthWrite: false }));
  obj.frustumCulled = false;
  group.add(obj);
  const xs = seed.map(() => (Math.random() * 2 - 1) * half);
  const zs = seed.map(() => (Math.random() * 2 - 1) * half);
  return (t) => {
    for (let i = 0; i < n; i++) {
      const sp = kind === 'rain' ? 9 + seed[i] * 3 : 0.5 + seed[i] * 0.4;
      const y = height - ((t * sp + seed[i] * height) % height);
      const sway = kind === 'rain' ? 0 : Math.sin(t * 1.3 + seed[i] * 20) * 0.6;
      const x = xs[i] + sway + (kind === 'rain' ? -0.04 * y : 0);
      const z = zs[i] + (kind === 'rain' ? 0 : Math.cos(t * 0.9 + seed[i] * 13) * 0.4);
      pos.set([x, y, z, x + (kind === 'rain' ? 0.05 : 0), y + (kind === 'rain' ? 0.35 : 0), z], i * 6);
    }
    geo.attributes.position.needsUpdate = true;
  };
}

/** Camera flashes in the crowd: tiny white bursts, more when something big lands. */
function flashes(group: THREE.Group, inner: number, outer: number, y0: number, y1: number): (t: number, excite: number) => void {
  const n = 14;
  const mats: THREE.MeshBasicMaterial[] = [];
  const ms: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const m = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), m);
    o.scale.setScalar(1.5);
    group.add(o);
    mats.push(m);
    ms.push(o);
  }
  const life = new Float32Array(n);
  let last = 0;
  return (t, excite) => {
    const dt = Math.min(0.1, Math.max(0, t - last));
    last = t;
    for (let i = 0; i < n; i++) {
      life[i] -= dt * 6;
      if (life[i] <= 0 && Math.random() < dt * (0.25 + 4 * excite)) {
        life[i] = 1;
        const a = Math.random() * Math.PI * 2;
        const r = inner + Math.random() * (outer - inner);
        ms[i].position.set(Math.sin(a) * r, y0 + Math.random() * (y1 - y0), Math.cos(a) * r);
      }
      mats[i].opacity = Math.max(0, life[i]);
    }
  };
}

/** A crowd of simple figures on tiers around the fight; they bounce when something big lands. */
function crowd(group: THREE.Group, inner: number, rows: number, baseY: number, shape: 'square' | 'circle'): (t: number, excite: number) => void {
  const per = 34;
  const n = rows * per * (shape === 'square' ? 1.2 : 1);
  const body = new THREE.CapsuleGeometry(0.2, 0.5, 2, 6);
  body.translate(0, 0.45, 0);
  const inst = new THREE.InstancedMesh(body, new THREE.MeshStandardMaterial({ roughness: 0.9 }), Math.round(n));
  inst.castShadow = false;
  const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.13, 8, 6), new THREE.MeshStandardMaterial({ roughness: 0.8 }), Math.round(n));
  const places: { x: number; y: number; z: number; ph: number; fan: number }[] = [];
  const m = new THREE.Matrix4();
  const col = new THREE.Color();
  for (let i = 0; i < inst.count; i++) {
    const row = i % rows;
    const k = Math.floor(i / rows) / (inst.count / rows);
    const a = k * Math.PI * 2 + row * 0.13;
    const r = inner + row * 1.1;
    let x = Math.sin(a) * r;
    let z = Math.cos(a) * r;
    if (shape === 'square') {
      const s = Math.max(Math.abs(Math.sin(a)), Math.abs(Math.cos(a)));
      x /= s;
      z /= s;
    }
    const y = baseY + row * 0.55;
    places.push({ x, y, z, ph: Math.random() * 6.28, fan: 0.4 + Math.random() * 0.8 });
    col.setHSL(Math.random(), 0.25 + Math.random() * 0.3, 0.12 + Math.random() * 0.18);
    inst.setColorAt(i, col);
    col.setHSL(0.07, 0.35, 0.25 + Math.random() * 0.35);
    heads.setColorAt(i, col);
  }
  group.add(inst, heads);
  let level = 0;
  return (t, excite) => {
    level += (excite - level) * 0.08;
    for (let i = 0; i < inst.count; i++) {
      const p = places[i];
      const jump = Math.max(0, Math.sin(t * (2 + 6 * level * p.fan) + p.ph)) * (0.03 + 0.35 * level * p.fan);
      m.makeRotationY(Math.atan2(-p.x, -p.z));
      m.setPosition(p.x, p.y + jump, p.z);
      inst.setMatrixAt(i, m);
      m.setPosition(p.x, p.y + jump + 1.02, p.z);
      heads.setMatrixAt(i, m);
    }
    inst.instanceMatrix.needsUpdate = true;
    heads.instanceMatrix.needsUpdate = true;
  };
}

function ring(map: MapDef): Arena {
  const group = new THREE.Group();
  const S = map.size;
  const top = canvas(1024, 1024, (g) => {
    g.fillStyle = '#34406a';
    g.fillRect(0, 0, 1024, 1024);
    noise(g, 1024, 1024, 9000, 'rgba(0,0,0,0.04)', 3);
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.lineWidth = 6;
    g.strokeRect(40, 40, 944, 944);
    g.fillStyle = 'rgba(242,193,78,0.35)';
    g.font = '900 130px "Russo One", Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('АРЕНА', 512, 512);
    // Corner colours.
    g.fillStyle = 'rgba(240,83,62,0.5)';
    g.beginPath();
    g.moveTo(0, 1024);
    g.lineTo(180, 1024);
    g.lineTo(0, 844);
    g.fill();
    g.fillStyle = 'rgba(63,167,255,0.5)';
    g.beginPath();
    g.moveTo(1024, 0);
    g.lineTo(844, 0);
    g.lineTo(1024, 180);
    g.fill();
  });
  const W = S * 2 + 0.6;
  const apron = canvas(1024, 128, (g) => {
    g.fillStyle = '#121a33';
    g.fillRect(0, 0, 1024, 128);
    g.fillStyle = '#f2c14e';
    g.font = '700 64px "Russo One", Arial Black, sans-serif';
    g.textBaseline = 'middle';
    for (let x = 30; x < 1024; x += 360) g.fillText('ARENA FIGHT', x, 66);
  });
  const sides = std(0xffffff, 0.7, 0, { map: apron });
  const platform = new THREE.Mesh(new THREE.BoxGeometry(W, 1.1, W), [sides, sides, std(0xffffff, 0.85, 0, { map: top }), sides, sides, sides]);
  platform.position.y = -0.55;
  platform.receiveShadow = true;
  group.add(platform);
  const floor = mesh(new THREE.CircleGeometry(30, 64), std(0x111318, 0.95), false);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -1.1;
  floor.receiveShadow = true;
  group.add(floor);
  // Posts with corner pads, three ropes a side.
  const corners: [number, number, number][] = [[S, S, 0x3fa7ff], [-S, -S, 0xf0533e], [S, -S, 0xeeeeee], [-S, S, 0xeeeeee]];
  for (const [x, z, c] of corners) {
    const post = mesh(new THREE.CylinderGeometry(0.07, 0.07, 1.55, 10), std(0x22252c, 0.4, 0.6));
    post.position.set(x, 0.77, z);
    const pad = mesh(new THREE.BoxGeometry(0.2, 1.0, 0.2), std(c, 0.5));
    pad.position.set(x * 0.985, 0.85, z * 0.985);
    group.add(post, pad);
  }
  const ropeCol = [0xd23b3b, 0xf2f2f2, 0x3b6fd2];
  [0.5, 0.9, 1.3].forEach((y, i) => {
    const m = std(ropeCol[i], 0.4);
    for (const sgn of [-1, 1]) {
      const a = mesh(new THREE.CylinderGeometry(0.025, 0.025, S * 2, 8), m);
      a.rotation.z = Math.PI / 2;
      a.position.set(0, y, sgn * S);
      const b = mesh(new THREE.CylinderGeometry(0.025, 0.025, S * 2, 8), m);
      b.rotation.x = Math.PI / 2;
      b.position.set(sgn * S, y, 0);
      group.add(a, b);
    }
  });
  // Lighting rig over the ring.
  const rig = mesh(new THREE.BoxGeometry(W + 1, 0.25, W + 1), std(0x15171c, 0.6, 0.5), false);
  rig.position.y = 7.5;
  group.add(rig);
  const lampMat = std(0xffffff, 0.3, 0, { emissive: 0xfff3d6, emissiveIntensity: 2 });
  for (const x of [-S * 0.6, S * 0.6]) for (const z of [-S * 0.6, S * 0.6]) {
    const lamp = mesh(new THREE.BoxGeometry(0.7, 0.08, 0.7), lampMat, false);
    lamp.position.set(x, 7.35, z);
    group.add(lamp);
  }
  const spot = new THREE.SpotLight(0xfff1dc, 60, 20, Math.PI / 5, 0.5, 1.4);
  spot.position.set(0, 7.2, 0);
  spot.target.position.set(0, 0, 0);
  group.add(spot, spot.target);
  // Beams from the rig down onto the canvas, through the smoke of the hall.
  for (const x of [-S * 0.6, S * 0.6]) for (const z of [-S * 0.6, S * 0.6]) {
    beam(group, new THREE.Vector3(x, 7.3, z), new THREE.Vector3(x * 0.4, 0, z * 0.4), 1.4, 0xfff0d0, 0.05);
  }
  // Coloured sweeping lights over the crowd.
  const sweeps = [0xff3f8e, 0x3fb6ff, 0xffc23f, 0x9a5bff].map((c, i) => {
    const b = beam(group, new THREE.Vector3(Math.sin(i * 1.57) * (S + 10), 11, Math.cos(i * 1.57) * (S + 10)), new THREE.Vector3(0, 0, 0), 1.6, c, 0.06);
    return { b, i };
  });
  // The hall: a dark dome, haze toward the floor, banners with the event's name.
  group.add(skyDome([[0, '#020205'], [0.55, '#0b0a18'], [0.75, '#1a1030'], [1, '#05040a']], (g, w, h) => {
    for (let i = 0; i < 6; i++) {
      const x = (i / 6) * w;
      g.fillStyle = i % 2 ? '#7a1028' : '#10306a';
      g.fillRect(x + 30, h * 0.38, 110, 70);
      g.fillStyle = '#f2c14e';
      g.font = '700 22px Arial Black, sans-serif';
      g.fillText('НОЧЬ БОЁВ', x + 36, h * 0.38 + 42);
    }
  }, 40));
  const bounce = crowd(group, S + 3.2, 5, -1.1, 'square');
  const flash = flashes(group, S + 3.5, S + 8, -0.2, 2.6);
  return {
    group, background: 0x07080c, fog: [0x07080c, 14, 34], sun: 1.2, hemi: 0.45,
    crate: std(0x8b6a45, 0.85),
    update: (t, e) => {
      bounce(t, e);
      flash(t, e);
      for (const { b, i } of sweeps) {
        const a = t * 0.35 + i * 1.57;
        b.lookAt(Math.sin(a) * (S + 6), -1, Math.cos(a * 1.3) * (S + 6));
        b.rotateX(-Math.PI / 2);
      }
    },
  };
}

function cage(map: MapDef): Arena {
  const group = new THREE.Group();
  const S = map.size;
  const mat = canvas(1024, 1024, (g) => {
    g.fillStyle = '#2a2c33';
    g.fillRect(0, 0, 1024, 1024);
    noise(g, 1024, 1024, 8000, 'rgba(255,255,255,0.03)', 3);
    g.translate(512, 512);
    g.strokeStyle = 'rgba(220,40,40,0.7)';
    g.lineWidth = 10;
    g.beginPath();
    g.arc(0, 0, 180, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.font = '900 120px "Russo One", Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('MMA', 0, 0);
  });
  const oct = mesh(new THREE.CircleGeometry(S + 0.3, 8), std(0xffffff, 0.85, 0, { map: mat }), false);
  oct.rotation.x = -Math.PI / 2;
  oct.rotation.z = Math.PI / 8;
  oct.position.y = 0.002;
  oct.receiveShadow = true;
  const ground = mesh(new THREE.CircleGeometry(30, 48), std(0x101216, 0.95), false);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground, oct);
  // Chain-link fence panels, black posts with pads, a rail on top.
  const link = canvas(128, 128, (g) => {
    g.clearRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(30,32,36,0.95)';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(0, 0);
    g.lineTo(128, 128);
    g.moveTo(128, 0);
    g.lineTo(0, 128);
    g.stroke();
  }, [8, 6]);
  const fenceMat = new THREE.MeshStandardMaterial({ map: link, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 });
  const apo = S * Math.cos(Math.PI / 8);
  const len = 2 * S * Math.sin(Math.PI / 8);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const panel = new THREE.Mesh(new THREE.PlaneGeometry(len, 1.9), fenceMat);
    panel.position.set(Math.sin(a) * apo, 0.95, Math.cos(a) * apo);
    panel.rotation.y = a;
    const rail = mesh(new THREE.CylinderGeometry(0.06, 0.06, len, 8), std(0x18191d, 0.5, 0.3));
    rail.rotation.z = Math.PI / 2;
    rail.position.set(Math.sin(a) * apo, 1.92, Math.cos(a) * apo);
    rail.rotation.y = a;
    const pa = a + Math.PI / 8;
    const post = mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.95, 10), std(0x111111, 0.5));
    post.position.set(Math.sin(pa) * S, 0.97, Math.cos(pa) * S);
    group.add(panel, rail, post);
  }
  const spot = new THREE.SpotLight(0xf6f3ff, 55, 20, Math.PI / 4.5, 0.5, 1.4);
  spot.position.set(0, 7.5, 0);
  group.add(spot, spot.target);
  // A cold white ring of lamps over the cage, beams through the haze.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    beam(group, new THREE.Vector3(Math.sin(a) * S * 0.7, 8, Math.cos(a) * S * 0.7), new THREE.Vector3(Math.sin(a) * S * 0.3, 0, Math.cos(a) * S * 0.3), 1.2, 0xdfe8ff, 0.04);
  }
  const ringLamp = mesh(new THREE.TorusGeometry(S * 0.7, 0.08, 6, 48), std(0xffffff, 0.3, 0, { emissive: 0xe8f0ff, emissiveIntensity: 2 }), false);
  ringLamp.rotation.x = Math.PI / 2;
  ringLamp.position.y = 8;
  group.add(ringLamp);
  group.add(skyDome([[0, '#010103'], [0.6, '#070b14'], [0.78, '#12203a'], [1, '#030407']], (g, w, h) => {
    // Big screens round the hall.
    for (let i = 0; i < 4; i++) {
      const x = (i / 4) * w + 60;
      g.fillStyle = '#0b1830';
      g.fillRect(x, h * 0.36, 150, 80);
      g.fillStyle = '#d33';
      g.fillRect(x + 6, h * 0.36 + 6, 66, 68);
      g.fillStyle = '#36f';
      g.fillRect(x + 78, h * 0.36 + 6, 66, 68);
    }
  }, 42));
  const bounce = crowd(group, S + 3.5, 6, 0, 'circle');
  const flash = flashes(group, S + 3.8, S + 9, 0.6, 4);
  return {
    group, background: 0x050608, fog: [0x050608, 14, 34], sun: 1.1, hemi: 0.4,
    crate: std(0x8b6a45, 0.85),
    update: (t, e) => {
      bounce(t, e);
      flash(t, e);
    },
  };
}

function alley(map: MapDef): Arena {
  const group = new THREE.Group();
  const L = map.size + 5;
  const asphalt = canvas(512, 1024, (g) => {
    g.fillStyle = '#1c1e22';
    g.fillRect(0, 0, 512, 1024);
    noise(g, 512, 1024, 20000, 'rgba(255,255,255,0.035)', 2);
    noise(g, 512, 1024, 6000, 'rgba(0,0,0,0.25)', 3);
    g.strokeStyle = 'rgba(0,0,0,0.5)';
    g.lineWidth = 3;
    for (let i = 0; i < 8; i++) {
      g.beginPath();
      let x = Math.random() * 512;
      let y = Math.random() * 1024;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) g.lineTo((x += (Math.random() - 0.5) * 80), (y += Math.random() * 60));
      g.stroke();
    }
  }, [1, 2]);
  const floor = mesh(new THREE.PlaneGeometry(ALLEY_HALF * 2 + 1.2, L * 2), std(0xffffff, 0.35, 0.25, { map: asphalt }), false);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  // Wet puddles catch the neon.
  for (const [x, z, r] of [[0.8, 1.5, 0.9], [-1.2, -2.5, 1.2], [1.4, -5, 0.7], [-0.6, 5.2, 1]] as const) {
    const p = mesh(new THREE.CircleGeometry(r, 24), std(0x0b0d12, 0.05, 0.6), false);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.004, z);
    p.scale.set(1, 0.6, 1);
    p.receiveShadow = true;
    group.add(p);
  }
  // Brick walls with lit windows, drawn facing inward.
  const brick = canvas(512, 512, (g) => {
    g.fillStyle = '#3a2220';
    g.fillRect(0, 0, 512, 512);
    for (let y = 0; y < 512; y += 32) {
      for (let x = (y / 32) % 2 ? -32 : 0; x < 512; x += 64) {
        g.fillStyle = `hsl(${8 + Math.random() * 10}, ${35 + Math.random() * 15}%, ${18 + Math.random() * 10}%)`;
        g.fillRect(x + 2, y + 2, 60, 28);
      }
    }
    noise(g, 512, 512, 3000, 'rgba(0,0,0,0.3)', 4);
  }, [L / 2, 2]);
  const wallMat = std(0xffffff, 0.95, 0, { map: brick, side: THREE.FrontSide });
  for (const sgn of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(L * 2, 8), wallMat);
    w.position.set(sgn * (ALLEY_HALF + 0.3), 4, 0);
    w.rotation.y = -sgn * Math.PI / 2;
    w.receiveShadow = true;
    group.add(w);
    for (let i = 0; i < 7; i++) {
      const lit = Math.random() < 0.5;
      const win = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.2), std(lit ? 0xffd38a : 0x0e1118, 0.4, 0, lit ? { emissive: 0xffb860, emissiveIntensity: 1.2 } : {}));
      win.position.set(sgn * (ALLEY_HALF + 0.29), 3.5 + (i % 2) * 2.2, -L + 2 + i * (L * 2 - 4) / 7);
      win.rotation.y = -sgn * Math.PI / 2;
      group.add(win);
    }
  }
  // Neon sign and a street lamp.
  const neonTex = canvas(512, 160, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 512, 160);
    g.shadowColor = '#ff3fa8';
    g.shadowBlur = 30;
    g.fillStyle = '#ff7fc8';
    g.font = '900 110px "Russo One", Arial Black, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('БАР 24', 256, 84);
  });
  const neonMat = new THREE.MeshStandardMaterial({ map: neonTex, emissive: 0xffffff, emissiveMap: neonTex, emissiveIntensity: 1.6, roughness: 0.5 });
  const neon = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.75), neonMat);
  neon.position.set(ALLEY_HALF + 0.25, 3.3, -1.5);
  neon.rotation.y = -Math.PI / 2;
  const neonLight = new THREE.PointLight(0xff4fb0, 14, 9, 1.6);
  neonLight.position.set(ALLEY_HALF - 0.6, 3, -1.5);
  group.add(neon, neonLight);
  const pole = mesh(new THREE.CylinderGeometry(0.06, 0.08, 4.5, 8), std(0x2a2c30, 0.5, 0.6));
  pole.position.set(-ALLEY_HALF + 0.3, 2.25, 3.5);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), std(0xfff0c8, 0.3, 0, { emissive: 0xffd99a, emissiveIntensity: 3 }));
  bulb.position.set(-ALLEY_HALF + 0.75, 4.4, 3.5);
  const lamp = new THREE.PointLight(0xffd59a, 22, 12, 1.5);
  lamp.position.copy(bulb.position).y -= 0.2;
  group.add(pole, bulb, lamp);
  // More signs down the alley: a cyan noodle bar, a red hotel, a green pharmacy cross.
  const signs: [string, string, number, number, number, number][] = [
    ['ЛАПША', '#3ff0ff', -1, 3.6, 4.5, 0x3ff0ff],
    ['ОТЕЛЬ', '#ff3a3a', 1, 4.6, 6.5, 0xff3a3a],
    ['24/7', '#7dff5a', -1, 2.9, -5, 0x7dff5a],
    ['КЛУБ', '#b66bff', 1, 3.1, -7.5, 0xb66bff],
  ];
  const signLights: THREE.PointLight[] = [];
  for (const [txt, css, side, y, z, c] of signs) {
    const sg = neonSign(txt, css, 1.8, 0.6);
    sg.position.set(side * (ALLEY_HALF + 0.25), y, z);
    sg.rotation.y = -side * Math.PI / 2;
    const l = new THREE.PointLight(c, 8, 7, 1.7);
    l.position.set(side * (ALLEY_HALF - 0.5), y, z);
    group.add(sg, l);
    signLights.push(l);
  }
  // A fire in an oil drum: warm light that breathes.
  const drum = mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.85, 14), std(0x3a2a1e, 0.7, 0.5));
  drum.position.set(ALLEY_HALF - 0.5, 0.43, 5.5);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.6, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85 }));
  flame.position.set(ALLEY_HALF - 0.5, 1.15, 5.5);
  const fireLight = new THREE.PointLight(0xff7a2a, 10, 8, 1.6);
  fireLight.position.set(ALLEY_HALF - 0.5, 1.4, 5.5);
  group.add(drum, flame, fireLight);
  // Fire escapes: dark iron landings high on the walls.
  const iron = std(0x15161a, 0.6, 0.6);
  for (const [sgn, z] of [[-1, -3], [1, 1.5], [-1, 7]] as const) {
    for (const y of [3.2, 5.6]) {
      const land = mesh(new THREE.BoxGeometry(0.9, 0.06, 2.2), iron, false);
      land.position.set(sgn * (ALLEY_HALF - 0.15), y, z);
      const rail = mesh(new THREE.BoxGeometry(0.04, 0.8, 2.2), iron, false);
      rail.position.set(sgn * (ALLEY_HALF - 0.6), y + 0.4, z);
      group.add(land, rail);
    }
  }
  // A strip of night sky over the alley, city glow on the horizon.
  group.add(skyDome([[0, '#04040a'], [0.45, '#140c26'], [0.62, '#4a1840'], [0.72, '#140a18'], [1, '#040406']], (g, w, h) => stars(g, w, h, 160, 0.4)));
  const rain = fallers(group, 380, ALLEY_HALF + 0.2, 8, 'rain', 0xaac4ff);
  let flick = 0;
  return {
    group, background: 0x07080d, fog: [0x0a0814, 8, 26], sun: 0.35, hemi: 0.35,
    crate: std(0x2f4a33, 0.6, 0.5),
    update: (t) => {
      flick = Math.sin(t * 23) > 0.97 ? 0.3 : 1;
      neonMat.emissiveIntensity = 1.6 * flick;
      neonLight.intensity = 14 * flick;
      signLights[1].intensity = Math.sin(t * 17 + 1) > 0.96 ? 1 : 8;
      const f = 0.8 + 0.2 * Math.sin(t * 13) + 0.1 * Math.sin(t * 31);
      fireLight.intensity = 10 * f;
      flame.scale.set(1, f, 1);
      rain(t);
    },
  };
}

function dojo(map: MapDef): Arena {
  const group = new THREE.Group();
  const S = map.size;
  const planks = canvas(512, 512, (g) => {
    for (let y = 0; y < 512; y += 64) {
      g.fillStyle = `hsl(28, ${40 + Math.random() * 10}%, ${30 + Math.random() * 8}%)`;
      g.fillRect(0, y, 512, 62);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(0, y + 62, 512, 2);
      for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(60,30,10,0.12)';
        g.fillRect(Math.random() * 512, y + Math.random() * 60, 60 + Math.random() * 120, 1.5);
      }
    }
  }, [4, 4]);
  const floor = mesh(new THREE.PlaneGeometry(S * 2 + 0.4, S * 2 + 0.4), std(0xffffff, 0.55, 0, { map: planks }), false);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  group.add(floor);
  // Tatami in the middle.
  const tatami = canvas(256, 512, (g) => {
    g.fillStyle = '#b9b98a';
    g.fillRect(0, 0, 256, 512);
    for (let y = 0; y < 512; y += 4) {
      g.fillStyle = `rgba(80,90,40,${0.06 + Math.random() * 0.06})`;
      g.fillRect(0, y, 256, 2);
    }
    g.fillStyle = '#20283a';
    g.fillRect(0, 0, 14, 512);
    g.fillRect(242, 0, 14, 512);
  });
  const tm = std(0xffffff, 0.9, 0, { map: tatami });
  const n = 4;
  const tw = (S * 1.5) / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < 2; j++) {
    const t = mesh(new THREE.PlaneGeometry(tw * 0.98, S * 0.75 * 0.98), tm, false);
    t.rotation.x = -Math.PI / 2;
    t.position.set(-S * 0.75 + tw * (i + 0.5), 0.003, -S * 0.375 + j * S * 0.75);
    t.receiveShadow = true;
    group.add(t);
  }
  // Shoji walls facing inward, dark beams.
  const shoji = canvas(256, 256, (g) => {
    g.fillStyle = '#efe6cf';
    g.fillRect(0, 0, 256, 256);
    g.strokeStyle = '#4a3020';
    g.lineWidth = 6;
    for (let x = 0; x <= 256; x += 64) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, 256);
      g.stroke();
    }
    for (let y = 0; y <= 256; y += 85) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(256, y);
      g.stroke();
    }
  }, [S, 1]);
  const wallMat = std(0xffffff, 0.9, 0, { map: shoji, emissive: 0x3a2a14, emissiveIntensity: 0.25 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const w = new THREE.Mesh(new THREE.PlaneGeometry(S * 2 + 0.4, 2.6), wallMat);
    w.position.set(Math.sin(a) * (S + 0.2), 1.3, Math.cos(a) * (S + 0.2));
    w.rotation.y = a + Math.PI;
    group.add(w);
  }
  // A scroll on the far wall and paper lanterns.
  const scroll = canvas(160, 400, (g) => {
    g.fillStyle = '#f4ecd8';
    g.fillRect(0, 0, 160, 400);
    g.fillStyle = '#1a1010';
    g.font = '700 120px serif';
    g.textAlign = 'center';
    g.fillText('武', 80, 160);
    g.fillText('道', 80, 300);
  });
  const sc = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 1.5), std(0xffffff, 0.9, 0, { map: scroll }));
  sc.position.set(0, 1.5, -S - 0.15);
  group.add(sc);
  const lantern = std(0xffe2b0, 0.6, 0, { emissive: 0xff9a40, emissiveIntensity: 1.4 });
  for (const [x, z] of [[-S * 0.6, -S * 0.6], [S * 0.6, S * 0.6], [S * 0.6, -S * 0.6], [-S * 0.6, S * 0.6]]) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), lantern);
    l.scale.y = 1.3;
    l.position.set(x, 2.4, z);
    const light = new THREE.PointLight(0xffb060, 6, 7, 1.6);
    light.position.copy(l.position);
    group.add(l, light);
  }
  // Evening outside: a sunset over mountains, cherry petals drifting in.
  group.add(skyDome([[0, '#1d1240'], [0.35, '#6a2a5a'], [0.55, '#e0704a'], [0.62, '#ffc070'], [0.7, '#3a2030'], [1, '#120a08']], (g, w, h) => {
    g.fillStyle = '#ffe6a8';
    g.beginPath();
    g.arc(w * 0.3, h * 0.6, 34, 0, Math.PI * 2);
    g.fill();
    for (const [c, base, amp] of [['#4a2a48', 0.6, 60], ['#2a1830', 0.66, 40]] as const) {
      g.fillStyle = c;
      g.beginPath();
      g.moveTo(0, h);
      for (let x = 0; x <= w; x += 16) g.lineTo(x, h * base - Math.abs(Math.sin(x * 0.011) * amp + Math.sin(x * 0.031) * amp * 0.4));
      g.lineTo(w, h);
      g.fill();
    }
  }, 60));
  beam(group, new THREE.Vector3(-S - 2, 5, -S), new THREE.Vector3(S * 0.3, 0, S * 0.2), 1.8, 0xffb070, 0.1);
  const petals = fallers(group, 120, S + 1, 4, 'petal', 0xffb3cf);
  return {
    group, background: 0x1a120c, fog: [0x1a120c, 12, 30], sun: 0.9, hemi: 0.7,
    crate: std(0x8b6a45, 0.85),
    update: (t) => petals(t),
  };
}

function roof(map: MapDef): Arena {
  const group = new THREE.Group();
  const S = map.size;
  const tiles = canvas(512, 512, (g) => {
    g.fillStyle = '#4a4c50';
    g.fillRect(0, 0, 512, 512);
    noise(g, 512, 512, 12000, 'rgba(0,0,0,0.12)', 3);
    g.strokeStyle = 'rgba(0,0,0,0.35)';
    g.lineWidth = 3;
    for (let i = 0; i <= 512; i += 128) {
      g.beginPath();
      g.moveTo(i, 0);
      g.lineTo(i, 512);
      g.moveTo(0, i);
      g.lineTo(512, i);
      g.stroke();
    }
  }, [S / 2, S / 2]);
  const floor = mesh(new THREE.BoxGeometry(S * 2 + 0.5, 0.4, S * 2 + 0.5), std(0xffffff, 0.9, 0, { map: tiles }), false);
  floor.position.y = -0.2;
  floor.receiveShadow = true;
  group.add(floor);
  const wall = mesh(new THREE.BoxGeometry(S * 2 + 0.5, 18, S * 2 + 0.5), std(0x26282e, 0.9), false);
  wall.position.y = -9.4;
  group.add(wall);
  const par = std(0x5c5e64, 0.85);
  for (const sgn of [-1, 1]) {
    const a = mesh(new THREE.BoxGeometry(S * 2 + 0.5, 0.45, 0.2), par);
    a.position.set(0, 0.22, sgn * (S + 0.15));
    const b = mesh(new THREE.BoxGeometry(0.2, 0.45, S * 2 + 0.5), par);
    b.position.set(sgn * (S + 0.15), 0.22, 0);
    group.add(a, b);
  }
  // A night city: towers with lit windows all round, far below.
  const win = canvas(256, 512, (g) => {
    g.fillStyle = '#0b0e16';
    g.fillRect(0, 0, 256, 512);
    for (let y = 8; y < 512; y += 24) for (let x = 8; x < 256; x += 24) {
      if (Math.random() < 0.35) {
        g.fillStyle = Math.random() < 0.7 ? '#ffd38a' : '#9fd0ff';
        g.fillRect(x, y, 12, 14);
      }
    }
  });
  const towerMat = new THREE.MeshStandardMaterial({ map: win, emissive: 0xffffff, emissiveMap: win, emissiveIntensity: 0.9, roughness: 0.9 });
  const tower = new THREE.BoxGeometry(1, 1, 1);
  const count = 140;
  const towers = new THREE.InstancedMesh(tower, towerMat, count);
  const m = new THREE.Matrix4();
  for (let i = 0; i < count; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 16 + Math.random() * 45;
    const w = 3 + Math.random() * 6;
    const h = 8 + Math.random() * (r > 35 ? 50 : 26);
    m.compose(new THREE.Vector3(Math.sin(a) * r, -20 + h / 2, Math.cos(a) * r), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random()), new THREE.Vector3(w, h, w));
    towers.setMatrixAt(i, m);
  }
  group.add(towers);
  // Stars and the moon.
  const starGeo = new THREE.BufferGeometry();
  const pos = new Float32Array(600 * 3);
  for (let i = 0; i < 600; i++) {
    const a = Math.random() * Math.PI * 2;
    const e = 0.1 + Math.random() * 1.3;
    pos.set([Math.cos(a) * Math.cos(e) * 90, Math.sin(e) * 90, Math.sin(a) * Math.cos(e) * 90], i * 3);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xbfd0ff, size: 0.35, fog: false })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(4, 20, 14), new THREE.MeshBasicMaterial({ color: 0xf1ecd6, fog: false }));
  moon.position.set(-40, 38, -60);
  const glow = new THREE.Mesh(new THREE.SphereGeometry(7, 20, 14), new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0.18, fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.position.copy(moon.position);
  group.add(moon, glow);
  // An antenna with a blinking red light.
  const mast = mesh(new THREE.CylinderGeometry(0.05, 0.08, 4, 8), std(0x3a3c42, 0.5, 0.6));
  mast.position.set(S - 0.6, 2, -S + 0.6);
  const blink = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), new THREE.MeshBasicMaterial({ color: 0xff2020 }));
  blink.position.set(S - 0.6, 4.05, -S + 0.6);
  group.add(mast, blink);
  group.add(skyDome([[0, '#030614'], [0.4, '#1a1440'], [0.56, '#7a2a6a'], [0.64, '#ff6a5a'], [0.7, '#2a1030'], [1, '#05040a']], (g, w, h) => stars(g, w, h, 300, 0.45), 100));
  // A billboard on the next roof and a water tower behind us.
  const board = neonSign('АРЕНА', '#ff3fa8', 6, 2);
  board.position.set(-S - 7, 6, -S - 6);
  board.rotation.y = Math.PI / 4;
  const legs = mesh(new THREE.BoxGeometry(0.2, 6, 0.2), std(0x1a1b20, 0.6, 0.5), false);
  legs.position.set(-S - 7, 2.5, -S - 6);
  group.add(board, legs);
  const tankM = std(0x5a3a28, 0.8);
  const tank = mesh(new THREE.CylinderGeometry(1, 1, 1.8, 16), tankM);
  tank.position.set(S + 3, 3.2, S - 2);
  const cap = mesh(new THREE.ConeGeometry(1.1, 0.7, 16), tankM);
  cap.position.set(S + 3, 4.45, S - 2);
  group.add(tank, cap);
  for (const [dx, dz] of [[-0.7, -0.7], [0.7, -0.7], [-0.7, 0.7], [0.7, 0.7]]) {
    const l = mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), std(0x222228, 0.6, 0.5));
    l.position.set(S + 3 + dx, 1.1, S - 2 + dz);
    group.add(l);
  }
  const boardLight = new THREE.PointLight(0xff3fa8, 18, 16, 1.5);
  boardLight.position.set(-S - 5, 5, -S - 4);
  group.add(boardLight);
  return {
    group, background: 0x0a1020, fog: [0x1a1030, 30, 110], sun: 0.6, hemi: 0.55,
    crate: std(0x8a9096, 0.45, 0.6),
    update: (t) => {
      blink.visible = Math.sin(t * 3) > 0.6;
    },
  };
}

function voidArena(map: MapDef, floorTex: THREE.Texture): Arena {
  const group = new THREE.Group();
  const floor = mesh(new THREE.CircleGeometry(map.size, 96), std(0xffffff, 0.9, 0, { map: floorTex }), false);
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const lip = new THREE.Mesh(
    new THREE.CylinderGeometry(map.size, map.size * 0.92, 1.2, 96, 1, true),
    std(0x10131a, 1, 0, { side: THREE.DoubleSide }),
  );
  lip.position.y = -0.6;
  group.add(floor, lip);
  group.add(skyDome([[0, '#05030c'], [0.5, '#120a2a'], [0.7, '#0a1830'], [1, '#020208']], (g, w, h) => {
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * w, y = h * (0.2 + Math.random() * 0.5), r = 40 + Math.random() * 120;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, i % 2 ? 'rgba(180,60,200,0.18)' : 'rgba(60,140,255,0.16)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    stars(g, w, h, 500, 0.8);
  }));
  return {
    group, background: 0x0b0e14, fog: [0x0b0e14, 22, 55], sun: 2.2, hemi: 0.9,
    crate: std(0x8b6a45, 0.85),
    update: () => {},
  };
}

export function buildArena(map: MapDef, voidFloor: () => THREE.Texture): Arena {
  switch (map.id) {
    case 'ring':
      return ring(map);
    case 'cage':
      return cage(map);
    case 'alley':
      return alley(map);
    case 'dojo':
      return dojo(map);
    case 'roof':
      return roof(map);
    default:
      return voidArena(map, voidFloor());
  }
}
