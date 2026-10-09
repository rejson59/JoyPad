import {
  CapsuleGeometry,
  Color,
  ConeGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  SphereGeometry,
  Sprite,
  Vector3,
  BackSide,
  TorusGeometry,
  CylinderGeometry,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import type { CourierDef } from "./types";
import { makeLabel } from "./fx";

export interface CourierRig {
  root: Group;
  visual: Group;
  torso: Group;
  armL: Group;
  armR: Group;
  foreL: Group;
  foreR: Group;
  legL: Group;
  legR: Group;
  shinL: Group;
  shinR: Group;
  visor: Mesh;
  bag: Group;
  pizzaHand: Mesh;
  label: Sprite;
  ring: Mesh;
  arrow: Group;
  light: PointLight;
  hand: Vector3;
  neck: Vector3;
  scarf: Vector3[];
  scarfPrev: Vector3[];
  color: Color;
  runPhase: number;
  throwAnim: number;
  landAnim: number;
  flourish: number;
}

function inked(geo: ConstructorParameters<typeof Mesh>[0], mat: MeshStandardMaterial, outline = "#140810") {
  const mesh = new Mesh(geo, mat);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const shell = new Mesh(geo, new MeshBasicMaterial({ color: outline, side: BackSide }));
  shell.scale.setScalar(1.065);
  shell.castShadow = false;
  mesh.add(shell);
  return mesh;
}

export function createCourier(def: CourierDef, withLabel = true): CourierRig {
  const root = new Group();
  root.name = def.name;
  const visual = new Group();
  root.add(visual);

  const suit = new MeshStandardMaterial({
    color: def.color,
    roughness: 0.42,
    metalness: 0.38,
    emissive: new Color(def.deep),
    emissiveIntensity: 0.18,
  });
  const dark = new MeshStandardMaterial({
    color: def.deep,
    roughness: 0.55,
    metalness: 0.28,
  });
  const accent = new MeshStandardMaterial({
    color: def.accent,
    roughness: 0.35,
    metalness: 0.55,
    emissive: new Color(def.accent),
    emissiveIntensity: 0.12,
  });
  const visorMat = new MeshStandardMaterial({
    color: def.visor,
    emissive: new Color(def.visor),
    emissiveIntensity: 2.4,
    roughness: 0.12,
    metalness: 0.2,
  });
  const skin = new MeshStandardMaterial({ color: def.skin, roughness: 0.62, metalness: 0.02 });
  const bagMat = new MeshStandardMaterial({ color: "#c4552a", roughness: 0.72, metalness: 0.08 });

  const hips = new Group();
  hips.position.y = 0.9;
  visual.add(hips);

  const torso = new Group();
  hips.add(torso);
  const chest = inked(new RoundedBoxGeometry(0.42, 0.48, 0.24, 2, 0.07), suit);
  chest.position.y = 0.28;
  torso.add(chest);
  const stripe = new Mesh(new RoundedBoxGeometry(0.44, 0.07, 0.26, 1, 0.02), accent);
  stripe.position.y = 0.18;
  torso.add(stripe);
  const strap = new Mesh(new RoundedBoxGeometry(0.08, 0.42, 0.27, 1, 0.02), dark);
  strap.position.set(-0.1, 0.28, 0);
  torso.add(strap);
  const strap2 = strap.clone();
  strap2.position.x = 0.1;
  torso.add(strap2);

  const hood = inked(new SphereGeometry(0.175, 16, 12), dark);
  hood.position.y = 0.66;
  hood.scale.set(1.05, 1.08, 1.05);
  torso.add(hood);
  const jaw = new Mesh(new RoundedBoxGeometry(0.12, 0.07, 0.1, 1, 0.02), skin);
  jaw.position.set(0, 0.55, 0.08);
  torso.add(jaw);
  const visor = new Mesh(new RoundedBoxGeometry(0.2, 0.055, 0.08, 2, 0.02), visorMat);
  visor.position.set(0, 0.64, 0.12);
  torso.add(visor);
  const earL = new Mesh(new SphereGeometry(0.035, 8, 6), accent);
  earL.position.set(-0.16, 0.64, 0.02);
  torso.add(earL);
  const earR = earL.clone();
  earR.position.x = 0.16;
  torso.add(earR);

  const bag = new Group();
  bag.position.set(0, 0.28, -0.18);
  const bagBox = inked(new RoundedBoxGeometry(0.3, 0.36, 0.16, 2, 0.04), bagMat);
  bag.add(bagBox);
  const flap = new Mesh(new RoundedBoxGeometry(0.26, 0.06, 0.12, 1, 0.02), accent);
  flap.position.set(0, 0.16, 0.04);
  bag.add(flap);
  torso.add(bag);

  const mkArm = (side: number) => {
    const arm = new Group();
    arm.position.set(0.24 * side, 0.44, 0);
    const upper = inked(new CapsuleGeometry(0.055, 0.22, 3, 8), suit);
    upper.position.y = -0.16;
    arm.add(upper);
    const fore = new Group();
    fore.position.y = -0.32;
    const foreMesh = inked(new CapsuleGeometry(0.048, 0.2, 3, 8), dark);
    foreMesh.position.y = -0.14;
    fore.add(foreMesh);
    const shooter = new Mesh(new CylinderGeometry(0.03, 0.03, 0.06, 8), accent);
    shooter.rotation.z = Math.PI / 2;
    shooter.position.set(0.04 * side, -0.22, 0.04);
    fore.add(shooter);
    const glove = new Mesh(new SphereGeometry(0.05, 8, 6), accent);
    glove.position.y = -0.28;
    fore.add(glove);
    arm.add(fore);
    torso.add(arm);
    return { arm, fore };
  };
  const left = mkArm(-1);
  const right = mkArm(1);

  const mkLeg = (side: number) => {
    const leg = new Group();
    leg.position.set(0.1 * side, 0, 0);
    const thigh = inked(new CapsuleGeometry(0.07, 0.26, 3, 8), dark);
    thigh.position.y = -0.2;
    leg.add(thigh);
    const shin = new Group();
    shin.position.y = -0.4;
    const shinMesh = inked(new CapsuleGeometry(0.055, 0.24, 3, 8), suit);
    shinMesh.position.y = -0.18;
    shin.add(shinMesh);
    const boot = new Mesh(new RoundedBoxGeometry(0.12, 0.08, 0.2, 1, 0.02), accent);
    boot.position.set(0, -0.34, 0.03);
    shin.add(boot);
    const pad = new Mesh(new RoundedBoxGeometry(0.1, 0.06, 0.08, 1, 0.015), accent);
    pad.position.set(0, -0.02, 0.06);
    shin.add(pad);
    leg.add(shin);
    hips.add(leg);
    return { leg, shin };
  };
  const legL = mkLeg(-1);
  const legR = mkLeg(1);

  const pizzaHand = new Mesh(
    new RoundedBoxGeometry(0.28, 0.05, 0.28, 1, 0.01),
    new MeshStandardMaterial({ color: "#e7c49a", roughness: 0.75 }),
  );
  pizzaHand.position.set(0.32, 1.05, 0.18);
  pizzaHand.visible = false;
  visual.add(pizzaHand);

  const ring = new Mesh(
    new TorusGeometry(0.46, 0.025, 8, 24),
    new MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.85 }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.04;
  root.add(ring);

  const label = withLabel ? makeLabel(def.name, def.color) : makeLabel("", def.color);
  if (!withLabel) label.visible = false;
  root.add(label);

  const arrow = new Group();
  arrow.visible = false;
  const shaft = new Mesh(new CylinderGeometry(0.03, 0.03, 0.7, 6), new MeshBasicMaterial({ color: "#ffb15a" }));
  shaft.position.y = 0.45;
  const head = new Mesh(new ConeGeometry(0.1, 0.22, 8), new MeshBasicMaterial({ color: "#ff6a2c" }));
  head.position.y = 0.9;
  arrow.add(shaft, head);
  arrow.position.y = 2.4;
  root.add(arrow);

  const light = new PointLight(def.color, 0, 5.5, 2);
  light.position.y = 1.2;
  root.add(light);

  const scarf = Array.from({ length: 6 }, (_, i) => new Vector3(0, 1.45 - i * 0.02, -0.12 - i * 0.12));
  const scarfPrev = scarf.map((p) => p.clone());

  return {
    root,
    visual,
    torso,
    armL: left.arm,
    armR: right.arm,
    foreL: left.fore,
    foreR: right.fore,
    legL: legL.leg,
    legR: legR.leg,
    shinL: legL.shin,
    shinR: legR.shin,
    visor,
    bag,
    pizzaHand,
    label,
    ring,
    arrow,
    light,
    hand: new Vector3(),
    neck: new Vector3(),
    scarf,
    scarfPrev,
    color: new Color(def.color),
    runPhase: Math.random() * 6,
    throwAnim: 0,
    landAnim: 0,
    flourish: 0,
  };
}

export interface Pose {
  grounded: boolean;
  vel: Vector3;
  facing: Vector3;
  swinging: boolean;
  charging: boolean;
  speed: number;
  dt: number;
  overdrive: boolean;
  pizzas: number;
  time: number;
}

export function updateCourier(rig: CourierRig, pose: Pose) {
  const { dt, vel, facing, grounded, swinging, charging } = pose;
  const sp = pose.speed;
  rig.runPhase += dt * (4.5 + sp * 0.85);
  if (rig.throwAnim > 0) rig.throwAnim = Math.max(0, rig.throwAnim - dt);
  if (rig.landAnim > 0) rig.landAnim = Math.max(0, rig.landAnim - dt);
  if (rig.flourish > 0) rig.flourish = Math.max(0, rig.flourish - dt);

  const yaw = Math.atan2(facing.x, facing.z);
  rig.visual.rotation.y = yaw;
  const bankTarget = swinging ? Math.max(-0.45, Math.min(0.45, -vel.x * 0.03 + vel.z * 0.01)) : 0;
  rig.visual.rotation.z += (bankTarget - rig.visual.rotation.z) * Math.min(1, dt * 6);
  const lean = swinging ? 0.45 : !grounded ? 0.18 : sp > 1 ? 0.12 : 0.02;
  rig.torso.rotation.x += (lean - rig.torso.rotation.x) * Math.min(1, dt * 8);
  rig.torso.rotation.z = Math.sin(rig.runPhase * 0.5) * (grounded && sp > 1 ? 0.04 : 0.01);

  const swingPose = swinging;
  const air = !grounded && !swingPose;
  if (grounded && sp > 0.7 && rig.throwAnim <= 0) {
    const s = Math.sin(rig.runPhase);
    rig.legL.rotation.x = s * 0.75;
    rig.legR.rotation.x = -s * 0.75;
    rig.shinL.rotation.x = Math.max(0, -s) * 0.9;
    rig.shinR.rotation.x = Math.max(0, s) * 0.9;
    rig.armL.rotation.x = -s * 0.55;
    rig.armR.rotation.x = s * 0.55;
    rig.foreL.rotation.x = 0.15;
    rig.foreR.rotation.x = 0.15;
    rig.torso.position.y = Math.abs(Math.sin(rig.runPhase * 2)) * 0.035;
  } else if (swingPose) {
    rig.armR.rotation.x = -2.65;
    rig.armR.rotation.z = -0.25;
    rig.foreR.rotation.x = -0.2;
    rig.armL.rotation.x = -0.5;
    rig.armL.rotation.z = 0.3;
    rig.legL.rotation.x = 0.35;
    rig.legR.rotation.x = -0.15;
    rig.shinL.rotation.x = 0.4;
    rig.shinR.rotation.x = 0.5;
    rig.torso.position.y = 0;
  } else if (air) {
    const tuck = vel.y > 2 ? -0.7 : 0.25;
    rig.legL.rotation.x = tuck;
    rig.legR.rotation.x = tuck * 0.8;
    rig.shinL.rotation.x = 0.7;
    rig.shinR.rotation.x = 0.55;
    rig.armL.rotation.x = -0.9;
    rig.armR.rotation.x = charging ? -1.3 : -0.45;
    rig.armL.rotation.z = 0.2;
    rig.armR.rotation.z = -0.15;
    rig.torso.position.y = 0;
  } else {
    const b = Math.sin(pose.time * 2.2);
    rig.legL.rotation.x = 0;
    rig.legR.rotation.x = 0;
    rig.shinL.rotation.x = 0.05;
    rig.shinR.rotation.x = 0.05;
    rig.armL.rotation.x = 0.12 + b * 0.04;
    rig.armR.rotation.x = 0.12 - b * 0.04;
    rig.armL.rotation.z = 0.08;
    rig.armR.rotation.z = -0.08;
    rig.foreL.rotation.x = 0.2;
    rig.foreR.rotation.x = 0.2;
    rig.torso.position.y = b * 0.012;
  }

  if (rig.throwAnim > 0) {
    const k = rig.throwAnim / 0.28;
    rig.armR.rotation.x = -0.2 - (1 - k) * 1.5;
    rig.foreR.rotation.x = -0.8 * (1 - k);
    rig.torso.rotation.y = (1 - k) * 0.3;
  } else {
    rig.torso.rotation.y *= 0.8;
  }

  const squash = rig.landAnim > 0 ? 1 - (rig.landAnim / 0.16) * 0.18 : 1;
  const stretch = rig.flourish > 0 ? 1 + (rig.flourish / 0.35) * 0.06 : 1;
  rig.visual.scale.set(1 / Math.sqrt(squash) * stretch, squash, 1 / Math.sqrt(squash));

  const visorMat = rig.visor.material as MeshStandardMaterial;
  visorMat.emissiveIntensity = pose.overdrive ? 3.4 + Math.sin(pose.time * 18) * 1.2 : 1.8 + Math.sin(pose.time * 3) * 0.25;
  rig.bag.scale.setScalar(0.85 + Math.min(6, pose.pizzas) / 6 * 0.25);
  rig.ring.rotation.z += dt * (1.4 + sp * 0.05);
  const ringMat = rig.ring.material as MeshBasicMaterial;
  ringMat.opacity = swinging ? 0.95 : 0.55;

  rig.root.updateWorldMatrix(true, true);
  _hand.set(0.02, -0.28, 0.06);
  rig.foreR.localToWorld(_hand);
  rig.hand.copy(_hand);
  _hand.set(0, 0.62, -0.08);
  rig.torso.localToWorld(_hand);
  rig.neck.copy(_hand);
}

const _hand = new Vector3();

export function updateScarf(rig: CourierRig, dt: number, vel: Vector3, anchor: Vector3 | null) {
  const pts = rig.scarf;
  const prev = rig.scarfPrev;
  const neck = rig.neck;
  if (pts[1].distanceTo(neck) > 4) {
    for (let i = 0; i < pts.length; i++) {
      pts[i].set(neck.x, neck.y - i * 0.05, neck.z - 0.12 - i * 0.14);
      prev[i].copy(pts[i]);
    }
  }
  pts[0].copy(neck);
  const windX = -vel.x * 0.22;
  const windY = -1.6 - Math.abs(vel.y) * 0.05;
  const windZ = -vel.z * 0.22;
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i];
    const ox = p.x;
    const oy = p.y;
    const oz = p.z;
    const vx = (p.x - prev[i].x) * 0.9;
    const vy = (p.y - prev[i].y) * 0.9;
    const vz = (p.z - prev[i].z) * 0.9;
    prev[i].set(ox, oy, oz);
    p.x += vx + windX * dt;
    p.y += vy + windY * dt;
    p.z += vz + windZ * dt;
    if (anchor && i === pts.length - 1) {
      p.x += (anchor.x - p.x) * 0.002;
    }
  }
  const rest = 0.16;
  for (let k = 0; k < 3; k++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dz = b.z - a.z;
      const d = Math.hypot(dx, dy, dz) || 0.0001;
      const diff = (d - rest) / d;
      const inv = i === 1 ? 0 : 0.45;
      a.x += dx * diff * inv;
      a.y += dy * diff * inv;
      a.z += dz * diff * inv;
      const invB = 1 - inv;
      b.x -= dx * diff * invB;
      b.y -= dy * diff * invB;
      b.z -= dz * diff * invB;
    }
    pts[0].copy(rig.neck);
  }
}
