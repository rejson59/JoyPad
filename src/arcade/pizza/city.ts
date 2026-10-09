import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PlaneGeometry,
  PointLight,
  RepeatWrapping,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  AdditiveBlending,
  BackSide,
  BufferGeometry,
  Float32BufferAttribute,
  Points,
  PointsMaterial,
  SpotLight,
  CatmullRomCurve3,
  TubeGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { Assets } from "./assets";
import { cloneRepeat } from "./assets";
import type { OrderKind } from "./types";

export interface AABB {
  minX: number;
  minY: number;
  minZ: number;
  maxX: number;
  maxY: number;
  maxZ: number;
}

export interface OrderSlot {
  position: Vector3;
  normal: Vector3;
  kind: OrderKind;
  value: number;
  radius: number;
  building: number;
}

export interface City {
  group: Group;
  buildings: AABB[];
  anchors: Vector3[];
  slots: OrderSlot[];
  truck: Vector3;
  truckRing: Mesh;
  fountain: Vector3;
  moon: Mesh;
  heli: SpotLight;
  heliCone: Mesh;
  siren: Group;
  antenna: Mesh;
  peds: { mesh: Group; path: Vector3[]; t: number; speed: number }[];
  update: (time: number, dt: number) => void;
}

interface Spec {
  x: number;
  z: number;
  w: number;
  d: number;
  h: number;
  tint: string;
  sign: string;
  signColor: string;
}

const SPECS: Spec[] = [
  { x: -6, z: -32, w: 16, d: 16, h: 46, tint: "#c5d0de", sign: "WEBZA", signColor: "#9af6ff" },
  { x: -30, z: -28, w: 18, d: 14, h: 32, tint: "#e4c2ba", sign: "PEPERONI", signColor: "#ff6a55" },
  { x: 18, z: -30, w: 20, d: 15, h: 27, tint: "#ead4c2", sign: "FORNO", signColor: "#ffb15a" },
  { x: 40, z: -24, w: 13, d: 13, h: 38, tint: "#d4c6e4", sign: "NOC", signColor: "#e0b0ff" },
  { x: -46, z: -4, w: 12, d: 18, h: 24, tint: "#cfe0d2", sign: "BASILICO", signColor: "#b6ff7a" },
  { x: -42, z: 16, w: 12, d: 12, h: 14, tint: "#e6d8c4", sign: "OLIVE", signColor: "#d6ff7a" },
  { x: 46, z: -2, w: 12, d: 20, h: 28, tint: "#ecc8d4", sign: "DIAVOLA", signColor: "#ff5f98" },
  { x: 44, z: 16, w: 12, d: 11, h: 12, tint: "#c9dcec", sign: "MARINA", signColor: "#7ee7ff" },
  { x: -24, z: 24, w: 18, d: 9, h: 8, tint: "#f0d0c4", sign: "OTWARTE", signColor: "#ff8a3d" },
  { x: 2, z: 26, w: 16, d: 8, h: 7, tint: "#f0e2cc", sign: "PIZZA 24H", signColor: "#ffd36a" },
  { x: 26, z: 23, w: 16, d: 9, h: 9, tint: "#dcecd4", sign: "GORĄCE", signColor: "#d6ff6a" },
];

function windowTex() {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#141820";
  g.fillRect(0, 0, 128, 256);
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 3; x++) {
      const on = Math.random() > 0.35;
      const warm = Math.random() > 0.45;
      g.fillStyle = on ? (warm ? "#ffb15a" : "#8fd4ff") : "#0c1018";
      g.fillRect(10 + x * 38, 10 + y * 30, 24, 18);
    }
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  return t;
}

export function buildCity(assets: Assets): City {
  const group = new Group();
  const buildings: AABB[] = [];
  const anchors: Vector3[] = [];
  const slots: OrderSlot[] = [];

  const sky = new Mesh(
    new SphereGeometry(420, 32, 20),
    new ShaderMaterial({
      side: BackSide,
      fog: false,
      uniforms: {
        uTop: { value: new Color("#050712") },
        uMid: { value: new Color("#171033") },
        uHor: { value: new Color("#2a1424") },
        uGlow: { value: new Color("#ff6a3c") },
      },
      vertexShader: `
        varying vec3 vP;
        void main() {
          vP = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vP;
        uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uHor; uniform vec3 uGlow;
        void main() {
          vec3 d = normalize(vP);
          float h = d.y;
          vec3 col = mix(uHor, uMid, smoothstep(0.0, 0.28, h));
          col = mix(col, uTop, smoothstep(0.18, 0.72, h));
          float glow = pow(max(0.0, 1.0 - abs(d.y)), 8.0);
          col += uGlow * glow * 0.42;
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    }),
  );
  group.add(sky);

  const starGeo = new BufferGeometry();
  const starPos = new Float32Array(400 * 3);
  for (let i = 0; i < 400; i++) {
    const y = 40 + Math.random() * 220;
    const a = Math.random() * Math.PI * 2;
    const r = 80 + Math.random() * 260;
    starPos[i * 3] = Math.cos(a) * r;
    starPos[i * 3 + 1] = y;
    starPos[i * 3 + 2] = Math.sin(a) * r;
  }
  starGeo.setAttribute("position", new Float32BufferAttribute(starPos, 3));
  const stars = new Points(
    starGeo,
    new PointsMaterial({ color: "#d7e6ff", size: 1.4, sizeAttenuation: true, fog: false, transparent: true, opacity: 0.85 }),
  );
  group.add(stars);

  const moon = new Mesh(new SphereGeometry(10, 24, 18), new MeshBasicMaterial({ color: "#fff1cf", fog: false }));
  moon.position.set(-70, 120, -160);
  group.add(moon);
  const moonGlow = new Mesh(
    new SphereGeometry(16, 16, 12),
    new MeshBasicMaterial({ color: "#ffe0a0", transparent: true, opacity: 0.18, fog: false, depthWrite: false }),
  );
  moon.add(moonGlow);

  const ground = new Mesh(
    new PlaneGeometry(220, 180),
    new MeshStandardMaterial({
      map: assets.asphalt,
      roughness: 0.38,
      metalness: 0.62,
      color: "#8d97a8",
      envMapIntensity: 1.15,
    }),
  );
  assets.asphalt.repeat.set(14, 11);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const concrete = assets.concrete.clone();
  concrete.wrapS = concrete.wrapT = RepeatWrapping;
  concrete.repeat.set(8, 6);
  concrete.needsUpdate = true;
  const addSidewalk = (x: number, z: number, w: number, d: number) => {
    const m = new Mesh(
      new PlaneGeometry(w, d),
      new MeshStandardMaterial({ map: concrete, color: "#b7bcc8", roughness: 0.86, metalness: 0.05 }),
    );
    m.rotation.x = -Math.PI / 2;
    m.position.set(x, 0.025, z);
    m.receiveShadow = true;
    group.add(m);
  };
  addSidewalk(0, -18, 78, 8);
  addSidewalk(0, 16, 70, 6);
  addSidewalk(-36, 2, 6, 36);
  addSidewalk(36, 2, 6, 36);

  const paint = new MeshBasicMaterial({ color: "#f4f1ea" });
  const dash = (x: number, z: number, w: number, d: number, rot = 0) => {
    const m = new Mesh(new PlaneGeometry(w, d), paint);
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = rot;
    m.position.set(x, 0.035, z);
    group.add(m);
  };
  for (let x = -28; x <= 28; x += 4) dash(x, 4, 1.6, 0.12);
  for (let i = -3; i <= 3; i++) dash(-8 + i * 0.45, 4, 0.28, 2.4);
  for (let i = -3; i <= 3; i++) dash(14 + i * 0.45, 4, 0.28, 2.4);

  const puddleMat = new MeshStandardMaterial({
    color: "#1a2438",
    roughness: 0.08,
    metalness: 0.9,
    transparent: true,
    opacity: 0.55,
    envMapIntensity: 1.4,
  });
  [[-8, 7], [12, 1], [4, 12], [-20, 6], [22, 8], [-2, -6]].forEach(([x, z], i) => {
    const p = new Mesh(new CircleGeometry(1.6 + (i % 3) * 0.45, 16), puddleMat);
    p.rotation.x = -Math.PI / 2;
    p.position.set(x, 0.04, z);
    group.add(p);
  });

  SPECS.forEach((spec, index) => addBuilding(group, assets, spec, index, buildings, anchors, slots));
  addSkyline(group);
  addCrane(group, anchors);
  addGantry(group, anchors);
  addBillboard(group, assets, anchors);
  const lamps = addLamps(group, anchors);
  const truckBits = addTruck(group, assets, buildings);
  const fountain = addFountain(group);
  addProps(group, assets);
  const trees = addTrees(group);
  const peds = addPeds(group);
  const siren = addSiren(group);
  const antenna = addAntenna(group);
  const heliBits = addHeli(group);
  addStringLights(group);

  const city: City = {
    group,
    buildings,
    anchors,
    slots,
    truck: truckBits.pos,
    truckRing: truckBits.ring,
    fountain: fountain.pos,
    moon,
    heli: heliBits.light,
    heliCone: heliBits.cone,
    siren,
    antenna,
    peds,
    update(time: number, dt: number) {
      moon.position.x = -70 + Math.sin(time * 0.02) * 4;
      siren.rotation.y = time * 3.2;
      const ant = antenna.material as MeshBasicMaterial;
      ant.color.setHSL(0, 0.8, 0.4 + Math.sin(time * 6) * 0.4);
      heliBits.pivot.position.x = Math.sin(time * 0.13) * 36;
      heliBits.pivot.position.z = -8 + Math.cos(time * 0.1) * 18;
      heliBits.light.target.position.set(heliBits.pivot.position.x * 0.3, 0, heliBits.pivot.position.z * 0.2);
      heliBits.light.target.updateMatrixWorld();
      fountain.water.position.y = 0.55 + Math.sin(time * 2.4) * 0.04;
      truckBits.ring.scale.setScalar(1 + Math.sin(time * 3) * 0.04);
      (truckBits.ring.material as MeshBasicMaterial).opacity = 0.35 + Math.sin(time * 4) * 0.12;
      lamps.forEach((lamp, i) => {
        const mat = lamp.material as MeshBasicMaterial;
        mat.opacity = 0.045 + Math.sin(time * 1.7 + i) * 0.01;
      });
      trees.forEach((tree, i) => {
        tree.rotation.z = Math.sin(time * 0.6 + i) * 0.015;
      });
      for (const ped of peds) {
        ped.t += ped.speed * dt;
        const path = ped.path;
        const seg = path.length;
        const f = (ped.t % 1) * seg;
        const i0 = Math.floor(f) % seg;
        const i1 = (i0 + 1) % seg;
        const u = f - Math.floor(f);
        ped.mesh.position.lerpVectors(path[i0], path[i1], u);
        ped.mesh.position.y = 0;
        const dx = path[i1].x - path[i0].x;
        const dz = path[i1].z - path[i0].z;
        ped.mesh.rotation.y = Math.atan2(dx, dz);
        const arm = ped.mesh.userData.arm as Group | undefined;
        if (arm) arm.rotation.x = Math.sin(time * 6 + ped.t * 20) * 0.4;
      }
    },
  };
  return city;
}

function addBuilding(
  group: Group,
  assets: Assets,
  spec: Spec,
  index: number,
  buildings: AABB[],
  anchors: Vector3[],
  slots: OrderSlot[],
) {
  const { x, z, w, d, h, tint } = spec;
  const box = new Mesh(
    new BoxGeometry(w, h, d),
    new MeshStandardMaterial({ color: "#121018", roughness: 0.9, metalness: 0.04 }),
  );
  box.position.set(x, h / 2, z);
  box.castShadow = true;
  box.receiveShadow = true;
  group.add(box);
  buildings.push({ minX: x - w / 2, maxX: x + w / 2, minY: 0, maxY: h, minZ: z - d / 2, maxZ: z + d / 2 });

  const faces: { n: Vector3; width: number; cx: number; cz: number }[] = [
    { n: new Vector3(0, 0, 1), width: w, cx: x, cz: z + d / 2 },
    { n: new Vector3(0, 0, -1), width: w, cx: x, cz: z - d / 2 },
    { n: new Vector3(1, 0, 0), width: d, cx: x + w / 2, cz: z },
    { n: new Vector3(-1, 0, 0), width: d, cx: x - w / 2, cz: z },
  ];

  for (const face of faces) {
    const rx = Math.max(1, face.width / 7);
    const ry = Math.max(1, h / 7);
    const map = cloneRepeat(assets.facade, rx, ry);
    const em = cloneRepeat(assets.facadeGlow, rx, ry);
    const mat = new MeshStandardMaterial({
      map,
      emissiveMap: em,
      emissive: new Color("#ffffff"),
      emissiveIntensity: 1.25,
      color: tint,
      roughness: 0.82,
      metalness: 0.08,
    });
    const plane = new Mesh(new PlaneGeometry(face.width - 0.3, h - 0.2), mat);
    plane.position.set(face.cx + face.n.x * 0.08, h / 2, face.cz + face.n.z * 0.08);
    plane.lookAt(face.cx + face.n.x * 2, h / 2, face.cz + face.n.z * 2);
    plane.receiveShadow = true;
    group.add(plane);

    const toCenter = -face.n.x * x + -face.n.z * z;
    const inner = face.n.x * -x + face.n.z * -z > 0.5 || toCenter > 0;
    const facingPlaza = face.n.x * (0 - x) + face.n.z * (2 - z) > 0;
    if (facingPlaza) {
      const storeH = Math.min(3.3, h * 0.45);
      const glass = new Mesh(
        new PlaneGeometry(face.width * 0.72, storeH),
        new MeshStandardMaterial({
          color: "#1a120c",
          emissive: new Color(spec.signColor),
          emissiveIntensity: 0.55,
          roughness: 0.15,
          metalness: 0.4,
          transparent: true,
          opacity: 0.92,
        }),
      );
      glass.position.set(face.cx + face.n.x * 0.12, storeH / 2 + 0.15, face.cz + face.n.z * 0.12);
      glass.lookAt(face.cx + face.n.x * 3, storeH / 2, face.cz + face.n.z * 3);
      group.add(glass);

      const awning = new Mesh(
        new BoxGeometry(face.width * 0.78, 0.12, 1.1),
        new MeshStandardMaterial({ color: spec.signColor, roughness: 0.55, emissive: new Color(spec.signColor), emissiveIntensity: 0.25 }),
      );
      awning.position.set(face.cx + face.n.x * 0.7, storeH + 0.3, face.cz + face.n.z * 0.7);
      group.add(awning);

      if (inner || facingPlaza) {
        const signTex = assets.signs[spec.sign] ?? assets.signs.WEBZA;
        const sign = new Mesh(
          new PlaneGeometry(Math.min(6.5, face.width * 0.7), 1.7),
          new MeshStandardMaterial({
            map: signTex,
            emissiveMap: signTex,
            emissive: new Color("#ffffff"),
            emissiveIntensity: 1.8,
            roughness: 0.35,
          }),
        );
        const sy = Math.min(h - 1.5, Math.max(4.8, h * 0.42));
        sign.position.set(face.cx + face.n.x * 0.2, sy, face.cz + face.n.z * 0.2);
        sign.lookAt(face.cx + face.n.x * 4, sy, face.cz + face.n.z * 4);
        group.add(sign);
        const housing = new Mesh(
          new BoxGeometry(Math.min(6.7, face.width * 0.72), 1.9, 0.18),
          new MeshStandardMaterial({ color: "#1a1216", roughness: 0.5, metalness: 0.4 }),
        );
        housing.position.copy(sign.position);
        housing.quaternion.copy(sign.quaternion);
        housing.translateZ(-0.12);
        group.add(housing);
      }
    }
  }

  const roofMap = cloneRepeat(assets.roof, w / 6, d / 6);
  const roof = new Mesh(
    new BoxGeometry(w + 0.6, 0.35, d + 0.6),
    new MeshStandardMaterial({ map: roofMap, color: "#9aa0aa", roughness: 0.9, metalness: 0.05 }),
  );
  roof.position.set(x, h + 0.15, z);
  roof.castShadow = true;
  roof.receiveShadow = true;
  group.add(roof);

  const lip = new Mesh(
    new BoxGeometry(w + 1.1, 0.28, d + 1.1),
    new MeshStandardMaterial({ color: "#2a242c", roughness: 0.7, metalness: 0.2 }),
  );
  lip.position.set(x, h - 0.05, z);
  group.add(lip);

  if (h > 16) {
    const hut = new Mesh(new BoxGeometry(2.2, 1.6, 2.2), new MeshStandardMaterial({ color: "#3a3340", roughness: 0.8 }));
    hut.position.set(x - w * 0.2, h + 1.1, z + d * 0.15);
    hut.castShadow = true;
    group.add(hut);
    for (let i = 0; i < 3; i++) {
      const ac = new Mesh(new BoxGeometry(1.1, 0.7, 0.8), new MeshStandardMaterial({ color: "#cfd5dc", roughness: 0.45, metalness: 0.4 }));
      ac.position.set(x + (i - 1) * 1.6, h + 0.7, z - d * 0.22);
      ac.castShadow = true;
      group.add(ac);
    }
  }
  if (h > 28) {
    const tank = new Mesh(new CylinderGeometry(1.3, 1.3, 2.4, 12), new MeshStandardMaterial({ color: "#d5d8de", roughness: 0.4, metalness: 0.55 }));
    tank.position.set(x + w * 0.22, h + 1.8, z - 1);
    tank.castShadow = true;
    group.add(tank);
    const cap = new Mesh(new ConeGeometry(1.45, 0.7, 12), new MeshStandardMaterial({ color: "#b9c0c8", metalness: 0.5, roughness: 0.35 }));
    cap.position.set(x + w * 0.22, h + 3.3, z - 1);
    group.add(cap);
    anchors.push(new Vector3(x + w * 0.22, h + 3.6, z - 1));
  }

  const edgeY = h + 0.8;
  const stepsX = Math.max(2, Math.floor(w / 4));
  const stepsZ = Math.max(2, Math.floor(d / 4));
  for (let i = 0; i <= stepsX; i++) {
    const px = x - w / 2 + (w * i) / stepsX;
    anchors.push(new Vector3(px, edgeY, z - d / 2));
    anchors.push(new Vector3(px, edgeY, z + d / 2));
  }
  for (let i = 1; i < stepsZ; i++) {
    const pz = z - d / 2 + (d * i) / stepsZ;
    anchors.push(new Vector3(x - w / 2, edgeY, pz));
    anchors.push(new Vector3(x + w / 2, edgeY, pz));
  }

  if (h > 12) {
    const side = index % 2 === 0 ? 1 : -1;
    const fx = x + side * (w / 2 + 0.35);
    for (let y = 4; y < h - 2; y += 4) {
      const plat = new Mesh(
        new BoxGeometry(1.1, 0.08, Math.min(4.5, d * 0.55)),
        new MeshStandardMaterial({ color: "#6d5838", roughness: 0.7, metalness: 0.3 }),
      );
      plat.position.set(fx, y, z);
      plat.castShadow = true;
      group.add(plat);
      anchors.push(new Vector3(fx, y + 0.4, z));
      const ladder = new Mesh(
        new CylinderGeometry(0.04, 0.04, 4, 5),
        new MeshStandardMaterial({ color: "#8a9098", metalness: 0.7, roughness: 0.35 }),
      );
      ladder.position.set(fx - side * 0.35, y - 2, z);
      group.add(ladder);
    }
  }

  const plazaFaces = faces.filter((f) => f.n.x * (0 - x) + f.n.z * (2 - z) > 0);
  for (const face of plazaFaces) {
    slots.push({
      position: new Vector3(face.cx + face.n.x * 0.7, 1.05, face.cz + face.n.z * 0.7),
      normal: face.n.clone(),
      kind: "door",
      value: 110 + Math.round(h * 1.2),
      radius: 2.5,
      building: index,
    });
    const floors = Math.max(1, Math.floor((h - 6) / 4.5));
    const cols = Math.max(1, Math.floor(face.width / 5));
    for (let fy = 0; fy < floors; fy++) {
      for (let c = 0; c < cols; c++) {
        if ((fy + c + index) % 3 === 0) continue;
        const along = (c + 0.5) / cols - 0.5;
        const y = 5.2 + fy * 4.5;
        if (y > h - 2) continue;
        let px = face.cx + face.n.x * 0.65;
        let pz = face.cz + face.n.z * 0.65;
        if (Math.abs(face.n.z) > 0.5) px += along * (face.width - 1.5);
        else pz += along * (face.width - 1.5);
        slots.push({
          position: new Vector3(px, y, pz),
          normal: face.n.clone(),
          kind: "window",
          value: 150 + Math.round(y * 7),
          radius: 2.15,
          building: index,
        });
      }
    }
  }
  slots.push({
    position: new Vector3(x + (index % 2 ? 1.4 : -1.2), h + 0.55, z + 0.4),
    normal: new Vector3(0, 1, 0),
    kind: "roof",
    value: 190 + Math.round(h * 4),
    radius: 2.3,
    building: index,
  });
}

function addSkyline(group: Group) {
  const tex = windowTex();
  const dummy = new Object3D();
  const positions: { x: number; z: number; w: number; d: number; h: number }[] = [];
  for (let i = 0; i < 22; i++) {
    const x = -150 + (i % 11) * 28 + (i % 3) * 4;
    const z = -90 - Math.floor(i / 11) * 28 - (i % 4) * 6;
    const w = 10 + (i % 4) * 4;
    const d = 10 + (i % 3) * 3;
    const h = 18 + ((i * 17) % 48);
    positions.push({ x, z, w, d, h });
    const m = new Mesh(
      new BoxGeometry(w, h, d),
      new MeshStandardMaterial({
        color: "#1a2030",
        map: tex,
        emissiveMap: tex,
        emissive: new Color("#ffe0b0"),
        emissiveIntensity: 0.35,
        roughness: 0.85,
      }),
    );
    m.position.set(x, h / 2, z);
    group.add(m);
  }
  void dummy;
  void positions;
}

function addCrane(group: Group, anchors: Vector3[]) {
  const mast = new Mesh(
    new BoxGeometry(0.7, 22, 0.7),
    new MeshStandardMaterial({ color: "#f0b429", roughness: 0.45, metalness: 0.4, emissive: "#5a3a08", emissiveIntensity: 0.2 }),
  );
  mast.position.set(24, 11, -6);
  mast.castShadow = true;
  group.add(mast);
  const arm = new Mesh(
    new BoxGeometry(34, 0.45, 0.45),
    new MeshStandardMaterial({ color: "#f0b429", roughness: 0.45, metalness: 0.35 }),
  );
  arm.position.set(8, 20.2, -6);
  group.add(arm);
  const cab = new Mesh(new BoxGeometry(1.4, 1.3, 1.4), new MeshStandardMaterial({ color: "#222", roughness: 0.4, metalness: 0.5 }));
  cab.position.set(22.5, 19.2, -6);
  group.add(cab);
  for (let x = -8; x <= 24; x += 4) anchors.push(new Vector3(x, 20.6, -6));
  for (let i = 0; i < 4; i++) {
    const cable = new Mesh(new CylinderGeometry(0.02, 0.02, 6, 4), new MeshStandardMaterial({ color: "#ddd", metalness: 0.8, roughness: 0.3 }));
    cable.position.set(-4 + i * 6, 17, -6);
    group.add(cable);
  }
}

function addGantry(group: Group, anchors: Vector3[]) {
  const mat = new MeshStandardMaterial({ color: "#cfd6df", metalness: 0.65, roughness: 0.32 });
  const beam = new Mesh(new BoxGeometry(46, 0.28, 0.28), mat);
  beam.position.set(0, 11.2, 7);
  group.add(beam);
  const beam2 = new Mesh(new BoxGeometry(36, 0.22, 0.22), mat);
  beam2.position.set(2, 16.5, -2);
  group.add(beam2);
  for (const [x, y, z] of [[-20, 0, 7], [20, 0, 7], [-14, 0, -2], [18, 0, -2]] as const) {
    const pole = new Mesh(new CylinderGeometry(0.12, 0.16, y === 0 ? 11.2 : 16.5, 8), mat);
    pole.position.set(x, (y === 0 ? 11.2 : 16.5) / 2, z);
    pole.castShadow = true;
    group.add(pole);
  }
  for (let x = -20; x <= 20; x += 4) anchors.push(new Vector3(x, 11.5, 7));
  for (let x = -14; x <= 16; x += 4) anchors.push(new Vector3(x, 16.8, -2));
}

function addBillboard(group: Group, assets: Assets, anchors: Vector3[]) {
  const frame = new Mesh(
    new BoxGeometry(11.2, 6.6, 0.35),
    new MeshStandardMaterial({ color: "#1a1214", roughness: 0.55, metalness: 0.35 }),
  );
  frame.position.set(-18, 11.5, -16);
  group.add(frame);
  const face = new Mesh(
    new PlaneGeometry(10.4, 5.8),
    new MeshStandardMaterial({ map: assets.billboard, roughness: 0.45, metalness: 0.05, emissive: "#ff8844", emissiveMap: assets.billboard, emissiveIntensity: 0.28 }),
  );
  face.position.set(-18, 11.5, -15.8);
  group.add(face);
  for (const x of [-22, -14]) {
    const pole = new Mesh(new CylinderGeometry(0.16, 0.2, 8.2, 8), new MeshStandardMaterial({ color: "#888", metalness: 0.6, roughness: 0.4 }));
    pole.position.set(x, 4.1, -16);
    pole.castShadow = true;
    group.add(pole);
  }
  anchors.push(new Vector3(-22, 15, -16), new Vector3(-14, 15, -16), new Vector3(-18, 15.2, -16));

  const small = new Mesh(
    new PlaneGeometry(5.5, 3.2),
    new MeshStandardMaterial({ map: assets.emblem, emissiveMap: assets.emblem, emissive: "#ffffff", emissiveIntensity: 0.4, roughness: 0.4 }),
  );
  small.position.set(30, 8.5, -14);
  small.lookAt(30, 8, 10);
  group.add(small);
}

function addLamps(group: Group, anchors: Vector3[]) {
  const cones: Mesh[] = [];
  const spots: [number, number][] = [
    [-16, 10], [0, 12], [16, 10], [-10, -8], [8, -6], [28, 4], [-28, 4], [0, -12],
  ];
  spots.forEach(([x, z], i) => {
    const pole = new Mesh(
      new CylinderGeometry(0.08, 0.12, 7.2, 8),
      new MeshStandardMaterial({ color: "#2c3038", metalness: 0.7, roughness: 0.35 }),
    );
    pole.position.set(x, 3.6, z);
    pole.castShadow = true;
    group.add(pole);
    const head = new Mesh(
      new SphereGeometry(0.22, 10, 8),
      new MeshBasicMaterial({ color: i % 2 ? "#ffd7a8" : "#ffe8c8" }),
    );
    head.position.set(x, 7.3, z);
    group.add(head);
    const cone = new Mesh(
      new ConeGeometry(1.7, 6.4, 14, 1, true),
      new MeshBasicMaterial({
        color: "#ffb56a",
        transparent: true,
        opacity: 0.055,
        side: DoubleSide,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    cone.position.set(x, 4.1, z);
    group.add(cone);
    cones.push(cone);
    anchors.push(new Vector3(x, 7.5, z));
  });
  return cones;
}

function addTruck(group: Group, assets: Assets, buildings: AABB[]) {
  const root = new Group();
  root.position.set(0, 0, 4);
  const bodyMat = new MeshStandardMaterial({ color: "#c4322e", roughness: 0.48, metalness: 0.25, emissive: "#3a0c0c", emissiveIntensity: 0.25 });
  const body = new Mesh(new RoundedBoxGeometry(2.4, 1.5, 4.4, 2, 0.12), bodyMat);
  body.position.y = 1.15;
  body.castShadow = true;
  root.add(body);
  const cabin = new Mesh(new RoundedBoxGeometry(2.2, 1.35, 1.5, 2, 0.1), new MeshStandardMaterial({ color: "#f2efe8", roughness: 0.4, metalness: 0.2 }));
  cabin.position.set(0, 1.15, 2.15);
  cabin.castShadow = true;
  root.add(cabin);
  const glass = new Mesh(
    new BoxGeometry(1.9, 0.7, 0.08),
    new MeshStandardMaterial({ color: "#9fd8ff", roughness: 0.1, metalness: 0.6, emissive: "#224455", emissiveIntensity: 0.3 }),
  );
  glass.position.set(0, 1.35, 2.9);
  root.add(glass);
  const awning = new Mesh(new BoxGeometry(3.1, 0.08, 1.5), new MeshStandardMaterial({ color: "#fff6ea", roughness: 0.6 }));
  awning.position.set(0, 2.05, 0.2);
  root.add(awning);
  const stripe = new Mesh(new BoxGeometry(3.12, 0.12, 1.52), new MeshStandardMaterial({ color: "#e23b32", emissive: "#e23b32", emissiveIntensity: 0.3 }));
  stripe.position.set(0, 1.92, 0.2);
  root.add(stripe);
  const sign = new Mesh(
    new PlaneGeometry(2.2, 0.7),
    new MeshStandardMaterial({
      map: assets.signs.WEBZA,
      emissiveMap: assets.signs.WEBZA,
      emissive: "#ffffff",
      emissiveIntensity: 1.6,
    }),
  );
  sign.position.set(0, 2.35, 1.0);
  root.add(sign);
  for (const [x, z] of [[-0.9, 1.5], [0.9, 1.5], [-0.9, -1.5], [0.9, -1.5]] as const) {
    const wheel = new Mesh(new CylinderGeometry(0.32, 0.32, 0.22, 12), new MeshStandardMaterial({ color: "#1a1a1a", roughness: 0.7 }));
    wheel.rotation.z = Math.PI / 2;
    wheel.position.set(x, 0.32, z);
    root.add(wheel);
    const hub = new Mesh(new CylinderGeometry(0.12, 0.12, 0.24, 8), new MeshStandardMaterial({ color: "#ddd", metalness: 0.8, roughness: 0.3 }));
    hub.rotation.z = Math.PI / 2;
    hub.position.set(x, 0.32, z);
    root.add(hub);
  }
  for (let i = 0; i < 4; i++) {
    const box = new Mesh(new RoundedBoxGeometry(0.42, 0.1, 0.42, 1, 0.02), new MeshStandardMaterial({ map: assets.pizza, color: "#e6c7a2", roughness: 0.7 }));
    box.position.set(-0.7 + (i % 2) * 0.5, 2.15 + Math.floor(i / 2) * 0.12, -0.8);
    root.add(box);
  }
  const light = new PointLight("#ff9a55", 36, 16, 2);
  light.position.set(0, 2.6, 0.4);
  root.add(light);
  const headL = new PointLight("#fff1d2", 8, 7, 2);
  headL.position.set(-0.6, 1.1, 3);
  root.add(headL);
  group.add(root);
  buildings.push({ minX: -1.3, maxX: 1.3, minY: 0, maxY: 2.5, minZ: 1.6, maxZ: 6.4 });

  const ring = new Mesh(
    new TorusGeometry(5.1, 0.07, 8, 40),
    new MeshBasicMaterial({ color: "#ffb15a", transparent: true, opacity: 0.45 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0, 0.08, 4);
  group.add(ring);
  return { pos: new Vector3(0, 0, 4), ring };
}

function addFountain(group: Group) {
  const pos = new Vector3(-16, 0, 1);
  const basin = new Mesh(
    new CylinderGeometry(2.3, 2.5, 0.7, 20),
    new MeshStandardMaterial({ color: "#d5dbe4", roughness: 0.35, metalness: 0.45 }),
  );
  basin.position.set(pos.x, 0.35, pos.z);
  basin.castShadow = true;
  basin.receiveShadow = true;
  group.add(basin);
  const water = new Mesh(
    new CylinderGeometry(1.9, 1.9, 0.18, 20),
    new MeshStandardMaterial({
      color: "#7fd4ff",
      roughness: 0.08,
      metalness: 0.2,
      transparent: true,
      opacity: 0.75,
      emissive: "#1a6ea8",
      emissiveIntensity: 0.4,
    }),
  );
  water.position.set(pos.x, 0.6, pos.z);
  group.add(water);
  const jet = new Mesh(
    new CylinderGeometry(0.08, 0.16, 1.4, 8),
    new MeshBasicMaterial({ color: "#d8f6ff", transparent: true, opacity: 0.55 }),
  );
  jet.position.set(pos.x, 1.3, pos.z);
  group.add(jet);
  const light = new PointLight("#7fd8ff", 18, 10, 2);
  light.position.set(pos.x, 1.2, pos.z);
  group.add(light);
  return { pos, water };
}

function addProps(group: Group, assets: Assets) {
  const benchMat = new MeshStandardMaterial({ color: "#6b4a32", roughness: 0.75 });
  const metal = new MeshStandardMaterial({ color: "#9aa3ad", metalness: 0.7, roughness: 0.35 });
  [[-8, 9], [10, 9], [-6, -4], [20, 6]].forEach(([x, z]) => {
    const seat = new Mesh(new BoxGeometry(1.5, 0.08, 0.45), benchMat);
    seat.position.set(x, 0.48, z);
    seat.castShadow = true;
    group.add(seat);
    const back = new Mesh(new BoxGeometry(1.5, 0.4, 0.08), benchMat);
    back.position.set(x, 0.72, z - 0.2);
    group.add(back);
  });
  [[-12, 8], [18, 2], [6, -10]].forEach(([x, z]) => {
    const dump = new Mesh(new RoundedBoxGeometry(1.3, 1.1, 0.8, 2, 0.06), new MeshStandardMaterial({ color: "#2f6b45", roughness: 0.6 }));
    dump.position.set(x, 0.55, z);
    dump.castShadow = true;
    group.add(dump);
  });
  const scooter = new Group();
  scooter.position.set(2.4, 0, 8.2);
  const deck = new Mesh(new BoxGeometry(0.28, 0.08, 1.1), metal);
  deck.position.y = 0.32;
  scooter.add(deck);
  const stem = new Mesh(new CylinderGeometry(0.03, 0.03, 0.7, 6), metal);
  stem.position.set(0, 0.7, 0.45);
  stem.rotation.x = 0.3;
  scooter.add(stem);
  const wheelGeo = new TorusGeometry(0.18, 0.04, 6, 12);
  const w1 = new Mesh(wheelGeo, new MeshStandardMaterial({ color: "#222", roughness: 0.6 }));
  w1.position.set(0, 0.18, 0.45);
  const w2 = w1.clone();
  w2.position.z = -0.45;
  scooter.add(w1, w2);
  const box = new Mesh(new RoundedBoxGeometry(0.42, 0.36, 0.42, 1, 0.04), new MeshStandardMaterial({ map: assets.pizza, color: "#f0d2a8", roughness: 0.7 }));
  box.position.set(0, 0.7, -0.15);
  scooter.add(box);
  group.add(scooter);

  [[-4, 14], [8, 15], [22, 12]].forEach(([x, z]) => {
    const can = new Mesh(new CylinderGeometry(0.18, 0.2, 0.7, 10), metal);
    can.position.set(x, 0.35, z);
    group.add(can);
  });
}

function addTrees(group: Group) {
  const tops: Group[] = [];
  [[-22, 8], [14, -2], [-8, -14], [32, 8], [-34, 8]].forEach(([x, z], i) => {
    const g = new Group();
    const trunk = new Mesh(new CylinderGeometry(0.12, 0.18, 1.8, 6), new MeshStandardMaterial({ color: "#5a4030", roughness: 0.9 }));
    trunk.position.y = 0.9;
    trunk.castShadow = true;
    g.add(trunk);
    const leaf = new MeshStandardMaterial({ color: i % 2 ? "#1e4d32" : "#246044", roughness: 0.8 });
    const a = new Mesh(new SphereGeometry(0.85, 10, 8), leaf);
    a.position.y = 2.1;
    a.castShadow = true;
    const b = new Mesh(new SphereGeometry(0.6, 8, 6), leaf);
    b.position.set(0.4, 2.4, 0.2);
    g.add(a, b);
    g.position.set(x, 0, z);
    group.add(g);
    tops.push(g);
  });
  return tops;
}

function addPeds(group: Group) {
  const coats = ["#c13b4a", "#245c8a", "#d7a441", "#3d8f62", "#6b4c9a", "#d8d2c8", "#222833"];
  const peds: City["peds"] = [];
  const routes = [
    [new Vector3(-20, 0, 10), new Vector3(-4, 0, 11), new Vector3(12, 0, 10), new Vector3(22, 0, 8)],
    [new Vector3(18, 0, -8), new Vector3(4, 0, -10), new Vector3(-12, 0, -8), new Vector3(-22, 0, -4)],
    [new Vector3(-30, 0, 6), new Vector3(-30, 0, -6), new Vector3(-34, 0, 2)],
    [new Vector3(30, 0, 8), new Vector3(34, 0, -2), new Vector3(28, 0, -8)],
  ];
  routes.forEach((path, r) => {
    for (let k = 0; k < 2; k++) {
      const ped = new Group();
      const coat = new MeshStandardMaterial({ color: coats[(r * 2 + k) % coats.length], roughness: 0.7 });
      const body = new Mesh(new CapsuleGeometry(0.16, 0.34, 3, 6), coat);
      body.position.y = 0.72;
      body.castShadow = true;
      const head = new Mesh(new SphereGeometry(0.12, 10, 8), new MeshStandardMaterial({ color: "#e0b08a", roughness: 0.6 }));
      head.position.y = 1.12;
      const hair = new Mesh(new SphereGeometry(0.125, 8, 6), new MeshStandardMaterial({ color: k % 2 ? "#2a211c" : "#6a3a28", roughness: 0.8 }));
      hair.position.y = 1.18;
      hair.scale.y = 0.7;
      const arm = new Group();
      const armMesh = new Mesh(new CapsuleGeometry(0.04, 0.22, 2, 5), coat);
      armMesh.position.y = -0.12;
      arm.add(armMesh);
      arm.position.set(0.2, 0.9, 0);
      ped.add(body, head, hair, arm);
      ped.userData.arm = arm;
      group.add(ped);
      peds.push({ mesh: ped, path, t: Math.random(), speed: 0.045 + Math.random() * 0.03 });
    }
  });
  return peds;
}

function addSiren(group: Group) {
  const g = new Group();
  g.position.set(18, 28.4, -30);
  const red = new Mesh(new SphereGeometry(0.18, 8, 8), new MeshBasicMaterial({ color: "#ff2a2a" }));
  red.position.x = 0.35;
  const blue = new Mesh(new SphereGeometry(0.18, 8, 8), new MeshBasicMaterial({ color: "#2a6bff" }));
  blue.position.x = -0.35;
  g.add(red, blue);
  group.add(g);
  return g;
}

function addAntenna(group: Group) {
  const pole = new Mesh(new CylinderGeometry(0.04, 0.06, 4, 6), new MeshStandardMaterial({ color: "#ccc", metalness: 0.8, roughness: 0.3 }));
  pole.position.set(-6, 49, -32);
  group.add(pole);
  const tip = new Mesh(new SphereGeometry(0.12, 8, 8), new MeshBasicMaterial({ color: "#ff3355" }));
  tip.position.set(-6, 51.1, -32);
  group.add(tip);
  return tip;
}

function addHeli(group: Group) {
  const pivot = new Group();
  pivot.position.set(10, 32, -6);
  const body = new Mesh(new SphereGeometry(0.7, 10, 8), new MeshStandardMaterial({ color: "#e8eef5", metalness: 0.4, roughness: 0.35 }));
  body.scale.set(1.6, 0.55, 0.7);
  const tail = new Mesh(new BoxGeometry(1.6, 0.12, 0.18), new MeshStandardMaterial({ color: "#d0d6de", metalness: 0.4, roughness: 0.4 }));
  tail.position.set(-1.3, 0.1, 0);
  pivot.add(body, tail);
  const light = new SpotLight("#ffe2b0", 18, 70, 0.45, 0.6, 1.2);
  light.position.set(0, 0, 0);
  light.target.position.set(0, -20, 8);
  pivot.add(light);
  pivot.add(light.target);
  const cone = new Mesh(
    new ConeGeometry(6, 18, 16, 1, true),
    new MeshBasicMaterial({ color: "#ffe6bf", transparent: true, opacity: 0.035, depthWrite: false, blending: AdditiveBlending, side: DoubleSide }),
  );
  cone.position.y = -9;
  pivot.add(cone);
  group.add(pivot);
  return { pivot, light, cone };
}

function addStringLights(group: Group) {
  const a = new Vector3(-24, 7.2, 20);
  const b = new Vector3(2, 8.4, 22);
  const c = new Vector3(26, 7.4, 19);
  const curve = new CatmullRomCurve3([a, b, c]);
  const tube = new Mesh(new TubeGeometry(curve, 24, 0.025, 5, false), new MeshStandardMaterial({ color: "#222", metalness: 0.5, roughness: 0.4 }));
  group.add(tube);
  const colors = ["#ff5a4a", "#ffd36a", "#7ef0ff", "#d6ff6a", "#ff8ad8"];
  for (let i = 0; i <= 16; i++) {
    const p = curve.getPoint(i / 16);
    const bulb = new Mesh(new SphereGeometry(0.09, 8, 6), new MeshBasicMaterial({ color: colors[i % colors.length] }));
    bulb.position.copy(p);
    bulb.position.y -= 0.12;
    group.add(bulb);
  }
}

