import * as THREE from 'three';
import { makePaintTexture, makeWheelTexture, makeTreadTexture, makeGlowTexture, makeFlameTexture } from './textures';

export interface CarStyle {
  body: number;
  accent: string;
  wheel: number;
  paint: string; // kolor nadwozia
  flame: string; // kolor płomienia
}

interface Section {
  z: number;
  yb: number;
  yt: number;
  w: number;
}

interface BodyDef {
  body: Section[];
  cabin: Section[];
  wing: { w: number; y: number; z: number; d: number; h: number } | null;
  fin: boolean;
  bodyExp: number;
  cabinExp: number;
  hoodVents: boolean;
}

export const BODY_NAMES = ['Octane', 'Dominus', 'Breakout'];

const BODIES: BodyDef[] = [
  {
    body: [
      { z: -0.74, yb: -0.05, yt: -0.01, w: 0.1 },
      { z: -0.7, yb: -0.08, yt: 0.03, w: 0.3 },
      { z: -0.58, yb: -0.1, yt: 0.07, w: 0.41 },
      { z: -0.4, yb: -0.1, yt: 0.1, w: 0.45 },
      { z: -0.15, yb: -0.1, yt: 0.13, w: 0.46 },
      { z: 0.2, yb: -0.1, yt: 0.14, w: 0.47 },
      { z: 0.5, yb: -0.1, yt: 0.16, w: 0.46 },
      { z: 0.68, yb: -0.09, yt: 0.15, w: 0.42 },
      { z: 0.74, yb: -0.07, yt: 0.11, w: 0.3 },
      { z: 0.76, yb: -0.05, yt: 0.07, w: 0.1 },
    ],
    cabin: [
      { z: -0.22, yb: 0.11, yt: 0.14, w: 0.37 },
      { z: -0.08, yb: 0.12, yt: 0.28, w: 0.34 },
      { z: 0.08, yb: 0.13, yt: 0.33, w: 0.33 },
      { z: 0.3, yb: 0.14, yt: 0.33, w: 0.33 },
      { z: 0.46, yb: 0.15, yt: 0.25, w: 0.35 },
      { z: 0.58, yb: 0.16, yt: 0.19, w: 0.36 },
    ],
    wing: { w: 0.86, y: 0.3, z: 0.62, d: 0.22, h: 0.15 },
    fin: false,
    bodyExp: 3.2,
    cabinExp: 2.4,
    hoodVents: true,
  },
  {
    body: [
      { z: -0.78, yb: -0.06, yt: -0.02, w: 0.12 },
      { z: -0.74, yb: -0.09, yt: 0.0, w: 0.34 },
      { z: -0.62, yb: -0.11, yt: 0.05, w: 0.44 },
      { z: -0.35, yb: -0.11, yt: 0.09, w: 0.48 },
      { z: -0.05, yb: -0.11, yt: 0.11, w: 0.49 },
      { z: 0.3, yb: -0.11, yt: 0.12, w: 0.49 },
      { z: 0.6, yb: -0.11, yt: 0.14, w: 0.48 },
      { z: 0.74, yb: -0.1, yt: 0.13, w: 0.42 },
      { z: 0.79, yb: -0.08, yt: 0.09, w: 0.28 },
      { z: 0.81, yb: -0.06, yt: 0.05, w: 0.1 },
    ],
    cabin: [
      { z: 0.02, yb: 0.09, yt: 0.12, w: 0.38 },
      { z: 0.14, yb: 0.1, yt: 0.24, w: 0.35 },
      { z: 0.3, yb: 0.11, yt: 0.27, w: 0.34 },
      { z: 0.48, yb: 0.12, yt: 0.25, w: 0.35 },
      { z: 0.62, yb: 0.13, yt: 0.16, w: 0.38 },
    ],
    wing: { w: 0.94, y: 0.27, z: 0.7, d: 0.26, h: 0.13 },
    fin: false,
    bodyExp: 3.6,
    cabinExp: 2.6,
    hoodVents: true,
  },
  {
    body: [
      { z: -0.8, yb: -0.06, yt: -0.04, w: 0.08 },
      { z: -0.76, yb: -0.09, yt: -0.02, w: 0.28 },
      { z: -0.55, yb: -0.11, yt: 0.02, w: 0.42 },
      { z: -0.2, yb: -0.11, yt: 0.06, w: 0.47 },
      { z: 0.15, yb: -0.11, yt: 0.1, w: 0.48 },
      { z: 0.5, yb: -0.11, yt: 0.15, w: 0.47 },
      { z: 0.7, yb: -0.1, yt: 0.16, w: 0.42 },
      { z: 0.76, yb: -0.08, yt: 0.12, w: 0.28 },
      { z: 0.78, yb: -0.06, yt: 0.08, w: 0.1 },
    ],
    cabin: [
      { z: -0.05, yb: 0.05, yt: 0.08, w: 0.32 },
      { z: 0.08, yb: 0.07, yt: 0.24, w: 0.3 },
      { z: 0.26, yb: 0.1, yt: 0.3, w: 0.3 },
      { z: 0.45, yb: 0.13, yt: 0.26, w: 0.32 },
      { z: 0.6, yb: 0.15, yt: 0.2, w: 0.36 },
    ],
    wing: null,
    fin: true,
    bodyExp: 3.0,
    cabinExp: 2.3,
    hoodVents: false,
  },
];

function loft(secs: Section[], expo: number, splitRoof: boolean, ring = 40): THREE.BufferGeometry {
  const S = secs.length;
  const zmin = secs[0].z;
  const zmax = secs[S - 1].z;
  const pos = new Float32Array(S * (ring + 1) * 3);
  const uv = new Float32Array(S * (ring + 1) * 2);
  const p = 2 / expo;
  for (let i = 0; i < S; i++) {
    const s = secs[i];
    const yc = (s.yb + s.yt) / 2;
    const hh = (s.yt - s.yb) / 2;
    for (let j = 0; j <= ring; j++) {
      const th = (j / ring) * Math.PI * 2;
      const c = Math.cos(th);
      const sn = Math.sin(th);
      const cx = Math.sign(c) * Math.pow(Math.abs(c), p);
      const cy = Math.sign(sn) * Math.pow(Math.abs(sn), p);
      const k = i * (ring + 1) + j;
      pos[k * 3] = s.w * cx;
      pos[k * 3 + 1] = yc + hh * cy;
      pos[k * 3 + 2] = s.z;
      uv[k * 2] = j / ring;
      uv[k * 2 + 1] = (s.z - zmin) / (zmax - zmin);
    }
  }
  const idx: number[] = [];
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < ring; j++) {
      const a = i * (ring + 1) + j;
      const b = a + ring + 1;
      const c = b + 1;
      const d = a + 1;
      idx.push(a, c, b, a, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < S; i++) {
    const k0 = i * (ring + 1);
    const k1 = k0 + ring;
    const nx = nor.getX(k0) + nor.getX(k1);
    const ny = nor.getY(k0) + nor.getY(k1);
    const nz = nor.getZ(k0) + nor.getZ(k1);
    const l = Math.hypot(nx, ny, nz) || 1;
    nor.setXYZ(k0, nx / l, ny / l, nz / l);
    nor.setXYZ(k1, nx / l, ny / l, nz / l);
  }
  if (splitRoof) {
    const paint: number[] = [];
    const glass: number[] = [];
    for (let t = 0; t < idx.length; t += 3) {
      const ny = (nor.getY(idx[t]) + nor.getY(idx[t + 1]) + nor.getY(idx[t + 2])) / 3;
      (ny > 0.78 ? paint : glass).push(idx[t], idx[t + 1], idx[t + 2]);
    }
    g.setIndex([...paint, ...glass]);
    g.clearGroups();
    g.addGroup(0, paint.length, 0);
    g.addGroup(paint.length, glass.length, 1);
  }
  return g;
}

let shared: { glow: THREE.Texture; flame: THREE.Texture; tread: THREE.Texture } | null = null;
function getShared() {
  if (!shared) shared = { glow: makeGlowTexture(128), flame: makeFlameTexture(), tread: makeTreadTexture() };
  return shared;
}

export class CarVisual {
  group = new THREE.Group();
  root = new THREE.Group(); // wnętrze (przechyły)
  wheels: { pivot: THREE.Group; spin: THREE.Group; front: boolean }[] = [];
  flames: { group: THREE.Group; outer: THREE.Mesh; inner: THREE.Mesh }[] = [];
  underglow: THREE.Mesh;
  blob: THREE.Mesh;
  flameAmt = 0;
  private paintTex: THREE.Texture;
  private wheelTex: THREE.Texture;
  private steer = 0;
  private lean = 0;
  private pitch = 0;
  private flameMats: THREE.MeshBasicMaterial[] = [];
  readonly def: BodyDef;

  constructor(public style: CarStyle) {
    const sh = getShared();
    this.def = BODIES[style.body % BODIES.length];
    const def = this.def;
    this.group.add(this.root);

    this.paintTex = makePaintTexture(style.paint, style.accent);
    const paint = new THREE.MeshPhysicalMaterial({
      map: this.paintTex,
      color: 0xffffff,
      metalness: 0.5,
      roughness: 0.3,
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.5,
    });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x070c16,
      metalness: 0.9,
      roughness: 0.06,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      envMapIntensity: 2.4,
    });
    const dark = new THREE.MeshStandardMaterial({ color: 0x0b0d13, roughness: 0.55, metalness: 0.5 });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.35, metalness: 0.7, envMapIntensity: 1.2 });
    const trim = new THREE.MeshStandardMaterial({
      color: new THREE.Color(style.accent),
      emissive: new THREE.Color(style.accent),
      emissiveIntensity: 1.6,
      roughness: 0.4,
      metalness: 0.3,
    });
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 5.4, 6) });
    const tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 0.12, 0.1) });

    // nadwozie
    const bodyMesh = new THREE.Mesh(loft(def.body, def.bodyExp, false), paint);
    bodyMesh.castShadow = true;
    this.root.add(bodyMesh);
    const cabinMesh = new THREE.Mesh(loft(def.cabin, def.cabinExp, true), [paint, glass]);
    cabinMesh.castShadow = true;
    this.root.add(cabinMesh);

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, cast = false) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.castShadow = cast;
      this.root.add(m);
      return m;
    };
    const zf = def.body[0].z;
    const zr = def.body[def.body.length - 1].z;
    // podwozie, splittery, progi
    add(new THREE.BoxGeometry(0.84, 0.06, 1.25), dark, 0, -0.1, 0);
    add(new THREE.BoxGeometry(0.86, 0.022, 0.14), carbon, 0, -0.105, zf + 0.09);
    add(new THREE.BoxGeometry(0.74, 0.03, 0.12), carbon, 0, -0.095, zr - 0.06);
    for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.05, 0.62), carbon, sx * 0.455, -0.075, 0);
    // grill i światła
    add(new THREE.BoxGeometry(0.34, 0.05, 0.03), dark, 0, -0.02, zf + 0.06);
    add(new THREE.BoxGeometry(0.5, 0.014, 0.014), trim, 0, 0.012, zf + 0.045);
    for (const sx of [-1, 1]) {
      const hl = add(new THREE.SphereGeometry(0.055, 14, 10), headMat, sx * 0.265, 0.03, zf + 0.13);
      hl.scale.set(2.1, 0.7, 0.8);
      hl.rotation.y = sx * 0.4;
      add(new THREE.BoxGeometry(0.2, 0.026, 0.02), tailMat, sx * 0.19, 0.095, zr - 0.02);
    }
    // wloty na masce
    if (def.hoodVents) {
      for (const sx of [-1, 1]) {
        const v = add(new THREE.BoxGeometry(0.14, 0.006, 0.3), carbon, sx * 0.14, def.body[3].yt + 0.004, -0.34);
        v.rotation.x = 0.06;
      }
    }
    // skrzydło / płetwa
    if (def.wing) {
      const w = def.wing;
      add(new THREE.BoxGeometry(w.w, 0.022, w.d), carbon, 0, w.y, w.z, true);
      add(new THREE.BoxGeometry(w.w + 0.02, 0.028, 0.02), trim, 0, w.y + 0.005, w.z + w.d / 2);
      for (const sx of [-1, 1]) {
        add(new THREE.BoxGeometry(0.03, w.h, 0.07), carbon, sx * w.w * 0.32, w.y - w.h / 2, w.z, true);
        add(new THREE.BoxGeometry(0.02, 0.06, w.d + 0.02), paint, sx * (w.w / 2), w.y + 0.02, w.z);
      }
    }
    if (def.fin) {
      add(new THREE.BoxGeometry(0.02, 0.16, 0.34), paint, 0, 0.3, 0.5, true);
      add(new THREE.BoxGeometry(0.7, 0.02, 0.12), carbon, 0, 0.2, 0.66, true);
    }
    // wydechy
    for (const sx of [-1, 1]) {
      const ex = add(new THREE.CylinderGeometry(0.034, 0.04, 0.08, 14), carbon, sx * 0.15, -0.05, zr + 0.01);
      ex.rotation.x = Math.PI / 2;
    }

    // koła
    this.wheelTex = makeWheelTexture(style.accent, style.wheel);
    const tireMat = new THREE.MeshStandardMaterial({
      color: 0x141518,
      roughness: 0.85,
      metalness: 0.05,
      bumpMap: sh.tread,
      bumpScale: 1.4,
    });
    (tireMat.bumpMap as THREE.Texture).repeat.set(28, 1);
    const rimMat = new THREE.MeshStandardMaterial({ map: this.wheelTex, metalness: 0.9, roughness: 0.28, transparent: false, envMapIntensity: 1.6 });
    const rimBack = new THREE.MeshStandardMaterial({ color: 0x0b0c10, roughness: 0.7, metalness: 0.4 });
    const tireGeo = new THREE.TorusGeometry(0.156, 0.058, 14, 32);
    const rimGeo = new THREE.CircleGeometry(0.168, 32);
    const hubGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.12, 20);
    const wellGeo = new THREE.CircleGeometry(0.235, 28);
    const wpos: [number, number, number][] = [
      [-0.44, 0.02, -0.46],
      [0.44, 0.02, -0.46],
      [-0.44, 0.02, 0.46],
      [0.44, 0.02, 0.46],
    ];
    wpos.forEach((wp, i) => {
      const pivot = new THREE.Group();
      pivot.position.set(wp[0], wp[1], wp[2]);
      const spin = new THREE.Group();
      const side = wp[0] > 0 ? 1 : -1;
      const tire = new THREE.Mesh(tireGeo, tireMat);
      tire.rotation.y = Math.PI / 2;
      tire.scale.z = 1.75;
      tire.castShadow = true;
      spin.add(tire);
      const hub = new THREE.Mesh(hubGeo, rimBack);
      hub.rotation.z = Math.PI / 2;
      spin.add(hub);
      const face = new THREE.Mesh(rimGeo, rimMat);
      face.rotation.y = side * (Math.PI / 2);
      face.position.x = side * 0.066;
      spin.add(face);
      pivot.add(spin);
      this.root.add(pivot);
      this.wheels.push({ pivot, spin, front: i < 2 });
      // ciemna studnia koła na burcie
      const well = new THREE.Mesh(wellGeo, rimBack);
      well.rotation.y = side * (Math.PI / 2);
      well.position.set(side * 0.462, wp[1] + 0.03, wp[2]);
      this.root.add(well);
    });

    // płomienie
    const flameGeoO = new THREE.ConeGeometry(0.08, 1, 16, 1, true);
    flameGeoO.translate(0, 0.5, 0);
    flameGeoO.rotateX(Math.PI / 2);
    const flameGeoI = new THREE.ConeGeometry(0.045, 1, 12, 1, true);
    flameGeoI.translate(0, 0.5, 0);
    flameGeoI.rotateX(Math.PI / 2);
    const fc = new THREE.Color(style.flame);
    for (const sx of [-1, 1]) {
      const g = new THREE.Group();
      g.position.set(sx * 0.15, -0.05, zr + 0.06);
      const mo = new THREE.MeshBasicMaterial({
        map: sh.flame,
        color: new THREE.Color(fc.r * 3.2, fc.g * 3.2, fc.b * 3.2),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mi = new THREE.MeshBasicMaterial({
        map: sh.flame,
        color: new THREE.Color(4.5, 4.5, 4.5),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.flameMats.push(mo, mi);
      const outer = new THREE.Mesh(flameGeoO, mo);
      const inner = new THREE.Mesh(flameGeoI, mi);
      g.add(outer, inner);
      g.visible = false;
      this.root.add(g);
      this.flames.push({ group: g, outer, inner });
    }

    // neon pod autem + cień kontaktowy
    const ugMat = new THREE.MeshBasicMaterial({
      map: sh.glow,
      color: new THREE.Color(style.accent).multiplyScalar(1.6),
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.underglow = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 2.3), ugMat);
    this.underglow.rotation.x = -Math.PI / 2;
    this.underglow.position.y = -0.17;
    this.root.add(this.underglow);
    const blobMat = new THREE.MeshBasicMaterial({ map: sh.glow, color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false });
    this.blob = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.95), blobMat);
    this.blob.rotation.x = -Math.PI / 2;
    this.blob.position.y = -0.183;
    this.blob.renderOrder = 1;
    this.root.add(this.blob);
  }

  update(dt: number, fwdSpeed: number, steerIn: number, boosting: boolean, grounded: boolean, time: number, accel: number) {
    // koła
    const spinRate = fwdSpeed / 0.2;
    this.steer += (steerIn - this.steer) * Math.min(1, dt * 12);
    const steerAng = -this.steer * (0.5 - Math.min(0.32, Math.abs(fwdSpeed) * 0.012));
    for (const w of this.wheels) {
      w.spin.rotation.x -= spinRate * dt;
      if (w.front) w.pivot.rotation.y = steerAng;
    }
    // przechyły nadwozia
    const speedFrac = Math.min(1, Math.abs(fwdSpeed) / 20);
    const targetLean = grounded ? -this.steer * speedFrac * 0.05 : 0;
    this.lean += (targetLean - this.lean) * Math.min(1, dt * 6);
    const targetPitch = grounded ? THREE.MathUtils.clamp(-accel * 0.004, -0.04, 0.04) : 0;
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6);
    this.root.rotation.z = this.lean;
    this.root.rotation.x = this.pitch;
    // płomienie
    const target = boosting ? 1 : 0;
    this.flameAmt += (target - this.flameAmt) * Math.min(1, dt * (boosting ? 14 : 9));
    for (let i = 0; i < this.flames.length; i++) {
      const f = this.flames[i];
      const amt = this.flameAmt;
      f.group.visible = amt > 0.03;
      if (!f.group.visible) continue;
      const fl = 0.85 + 0.3 * Math.sin(time * 61 + i * 2.1) * Math.sin(time * 37 + i);
      const len = (0.55 + 1.5 * amt) * fl;
      f.outer.scale.set(0.7 + 0.5 * amt, 0.7 + 0.5 * amt, len);
      f.inner.scale.set(0.8 + 0.4 * amt, 0.8 + 0.4 * amt, len * 0.55);
    }
    // neon
    (this.underglow.material as THREE.MeshBasicMaterial).opacity = (grounded ? 0.85 : 0.55) * (0.85 + 0.15 * Math.sin(time * 3));
  }

  setVisible(v: boolean) {
    this.group.visible = v;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.paintTex.dispose();
    this.wheelTex.dispose();
    this.flameMats.forEach((m) => m.dispose());
  }
}
