import * as THREE from 'three';
import { Track, BARRIER, Projection } from './track';
import { glowSprite } from './textures';

export type ItemType = 'boost' | 'triple' | 'rocket' | 'mine' | 'shield';

export interface KartConfig {
  name: string;
  color: number;
  accent: number;
  isPlayer: boolean;
  skill: number;
}

export interface Controls {
  throttle: number;
  brake: number;
  steer: number;
  drift: boolean;
}

let sharedGlow: THREE.Texture | null = null;
let sharedShadow: THREE.Texture | null = null;

function shadowTexture() {
  if (sharedShadow) return sharedShadow;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  sharedShadow = new THREE.CanvasTexture(c);
  return sharedShadow;
}

export class Kart {
  cfg: KartConfig;
  group = new THREE.Group();
  body = new THREE.Group();
  private wheelPivots: THREE.Group[] = [];
  private wheelSpins: THREE.Group[] = [];
  private flames: THREE.Mesh[] = [];
  private flameMats: THREE.MeshBasicMaterial[] = [];
  private tailMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private shieldMesh: THREE.Mesh;
  private shieldMat: THREE.MeshBasicMaterial;

  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  yaw = 0;
  yawRate = 0;
  vf = 0;
  vl = 0;
  steerSmooth = 0;
  controls: Controls = { throttle: 0, brake: 0, steer: 0, drift: false };
  private prevDrift = false;

  maxSpeed = 38;
  accel = 21;

  airborne = false;
  airTime = 0;
  vy = 0;
  landingImpact = 0;
  drifting = false;
  driftDir = 0;
  driftCharge = 0;
  driftLevel = 0;
  boostTime = 0;
  boostKind = 0; // 0 zwykły, 1..3 poziom driftu, 4 pad
  spinTime = 0;
  spinAngle = 0;
  shieldTime = 0;
  hitFlash = 0;
  wallHit = 0;
  wallSide = 0;

  item: ItemType | null = null;
  itemCount = 0;
  rolling = 0;
  itemCooldown = 0;

  lap = 0;
  s = 0;
  prevS = 0;
  halfway = true;
  idx = 0;
  progress = 0;
  finished = false;
  finishTime = 0;
  place = 1;
  lapTimes: number[] = [];
  lapStart = 0;
  proj: Projection = { idx: 0, s: 0, lateral: 0, height: 0, tx: 0, ty: 0, tz: 1, nx: 1, nz: 0, cx: 0, cz: 0 };

  // zawieszenie
  private pitch = 0;
  private pitchV = 0;
  private roll = 0;
  private rollV = 0;
  private bounce = 0;
  private bounceV = 0;
  private groundPitch = 0;
  private hop = 0;
  private visualDriftYaw = 0;
  private lastVf = 0;
  private wheelSpin = 0;
  private radius = [0.36, 0.36, 0.42, 0.42];

  // AI
  aiLane = 0;
  aiLaneTimer = 0;
  aiItemTimer = 0;

  constructor(cfg: KartConfig) {
    this.cfg = cfg;
    this.group.rotation.order = 'YXZ';
    this.group.add(this.body);
    if (!sharedGlow) sharedGlow = glowSprite();

    const paint = new THREE.MeshPhysicalMaterial({
      color: cfg.color,
      metalness: 0.55,
      roughness: 0.22,
      clearcoat: 1,
      clearcoatRoughness: 0.04,
      envMapIntensity: 1.6,
    });
    const accent = new THREE.MeshPhysicalMaterial({
      color: cfg.accent,
      metalness: 0.7,
      roughness: 0.3,
      clearcoat: 0.8,
      envMapIntensity: 1.4,
    });
    const carbon = new THREE.MeshStandardMaterial({ color: 0x111216, metalness: 0.6, roughness: 0.45 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.12, envMapIntensity: 2 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0b0b0d, roughness: 0.92, metalness: 0 });
    const glass = new THREE.MeshPhysicalMaterial({
      color: 0x0a1020,
      metalness: 0.2,
      roughness: 0.02,
      clearcoat: 1,
      envMapIntensity: 2.5,
      emissive: new THREE.Color(cfg.accent).multiplyScalar(0.15),
    });
    const accentColor = new THREE.Color(cfg.accent);
    const neonMat = new THREE.MeshBasicMaterial({ color: accentColor.clone().multiplyScalar(1.35), toneMapped: false });

    const cast = (m: THREE.Mesh) => {
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };

    // podłoga
    const floor = cast(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.12, 2.6), carbon));
    floor.position.set(0, 0.3, 0);
    this.body.add(floor);

    // karoseria — profil boczny wyciągnięty
    const shape = new THREE.Shape();
    shape.moveTo(-1.25, 0.32);
    shape.lineTo(1.2, 0.3);
    shape.quadraticCurveTo(1.5, 0.33, 1.38, 0.48);
    shape.lineTo(0.55, 0.64);
    shape.quadraticCurveTo(0.25, 0.72, 0.05, 0.7);
    shape.lineTo(-0.55, 0.74);
    shape.quadraticCurveTo(-1.0, 0.8, -1.15, 1.0);
    shape.lineTo(-1.32, 0.95);
    shape.quadraticCurveTo(-1.38, 0.6, -1.25, 0.32);
    const ext = new THREE.ExtrudeGeometry(shape, {
      depth: 0.8,
      bevelEnabled: true,
      bevelThickness: 0.14,
      bevelSize: 0.1,
      bevelSegments: 5,
      curveSegments: 16,
    });
    ext.rotateY(-Math.PI / 2);
    ext.translate(0.4, 0, 0);
    const shell = cast(new THREE.Mesh(ext, paint));
    this.body.add(shell);

    // boczne sponsony
    for (const s of [-1, 1]) {
      const pod = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 1.3, 6, 16), accent));
      pod.rotation.x = Math.PI / 2;
      pod.position.set(s * 0.68, 0.45, -0.05);
      this.body.add(pod);
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.05, 1.3), neonMat);
      strip.position.set(s * 0.89, 0.45, -0.05);
      this.body.add(strip);
    }
    // przednie skrzydło
    const fw = cast(new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 0.38), accent));
    fw.position.set(0, 0.28, 1.42);
    this.body.add(fw);
    for (const s of [-1, 1]) {
      const ep = cast(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.45), carbon));
      ep.position.set(s * 1.0, 0.34, 1.42);
      this.body.add(ep);
    }
    // tylny spoiler
    const sp = cast(new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.45), accent));
    sp.position.set(0, 1.28, -1.25);
    sp.rotation.x = -0.12;
    this.body.add(sp);
    const spNeon = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.03, 0.03), neonMat);
    spNeon.position.set(0, 1.25, -1.47);
    this.body.add(spNeon);
    for (const s of [-1, 1]) {
      const st = cast(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.18), carbon));
      st.position.set(s * 0.5, 1.08, -1.2);
      this.body.add(st);
      const ep = cast(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.3, 0.55), paint));
      ep.position.set(s * 0.9, 1.25, -1.25);
      this.body.add(ep);
    }
    // silnik i wydechy
    const engine = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.7, 20), chrome));
    engine.rotation.x = Math.PI / 2;
    engine.position.set(0, 0.62, -1.15);
    this.body.add(engine);
    const exhaustMat = new THREE.MeshBasicMaterial({ color: accentColor.clone().multiplyScalar(1.05), toneMapped: false });
    for (const s of [-1, 1]) {
      const ex = cast(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.4, 16, 1, true), chrome));
      ex.rotation.x = Math.PI / 2;
      ex.position.set(s * 0.32, 0.62, -1.45);
      this.body.add(ex);
      const inner = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), exhaustMat);
      inner.position.set(s * 0.32, 0.62, -1.62);
      inner.rotation.y = Math.PI;
      this.body.add(inner);
      // płomienie
      const fm = new THREE.MeshBasicMaterial({
        color: new THREE.Color(1.45, 0.55, 0.12),
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.12, 1, 12, 1, true), fm);
      flame.geometry.translate(0, -0.5, 0);
      flame.rotation.x = -Math.PI / 2;
      flame.position.set(s * 0.32, 0.62, -1.62);
      this.body.add(flame);
      this.flames.push(flame);
      this.flameMats.push(fm);
      // rdzeń płomienia
      const core = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.6, 8, 1, true), fm);
      core.geometry.translate(0, -0.3, 0);
      flame.add(core);
    }

    // kierowca
    const suit = new THREE.MeshStandardMaterial({ color: 0x1c1e26, roughness: 0.7 });
    const torso = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.35, 6, 12), suit));
    torso.position.set(0, 0.95, -0.35);
    torso.rotation.x = -0.25;
    this.body.add(torso);
    const helmet = cast(new THREE.Mesh(new THREE.SphereGeometry(0.27, 24, 18), paint));
    helmet.position.set(0, 1.38, -0.28);
    this.body.add(helmet);
    const visor = new THREE.Mesh(new THREE.SphereGeometry(0.275, 24, 12, Math.PI / 2 - 0.9, 1.8, 1.1, 0.75), glass);
    visor.position.copy(helmet.position);
    this.body.add(visor);
    const hstripe = new THREE.Mesh(new THREE.TorusGeometry(0.272, 0.018, 6, 32), neonMat);
    hstripe.position.copy(helmet.position);
    hstripe.rotation.y = Math.PI / 2;
    this.body.add(hstripe);
    for (const s of [-1, 1]) {
      const arm = cast(new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.45, 4, 8), suit));
      arm.position.set(s * 0.26, 0.98, 0.0);
      arm.rotation.x = -1.1;
      arm.rotation.z = s * 0.25;
      this.body.add(arm);
    }
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.03, 8, 20), carbon);
    wheel.position.set(0, 0.98, 0.3);
    wheel.rotation.x = -0.6;
    this.body.add(wheel);
    // szyba
    const ws = new THREE.Mesh(new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, 0.9), glass);
    ws.scale.set(1.1, 0.5, 1.2);
    ws.position.set(0, 0.7, 0.5);
    this.body.add(ws);

    // światła
    const headMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.95, 1.05), toneMapped: false });
    for (const s of [-1, 1]) {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.06, 0.05), headMat);
      hl.position.set(s * 0.42, 0.5, 1.39);
      hl.rotation.x = -0.2;
      this.body.add(hl);
    }
    this.tailMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.95, 0.025, 0.05), toneMapped: false });
    const tl = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.06, 0.04), this.tailMat);
    tl.position.set(0, 0.85, -1.4);
    this.body.add(tl);

    // koła
    const wheelPos: [number, number, number][] = [
      [0.86, 0.36, 0.92],
      [-0.86, 0.36, 0.92],
      [0.9, 0.42, -0.92],
      [-0.9, 0.42, -0.92],
    ];
    wheelPos.forEach((p, i) => {
      const r = this.radius[i];
      const w = i < 2 ? 0.34 : 0.46;
      const pivot = new THREE.Group();
      pivot.position.set(p[0], r, p[2]);
      const spin = new THREE.Group();
      spin.name = 'wheelspin';
      pivot.add(spin);
      const tire = cast(new THREE.Mesh(new THREE.CylinderGeometry(r, r, w, 28), rubber));
      tire.rotation.z = Math.PI / 2;
      spin.add(tire);
      const tread = new THREE.Mesh(new THREE.TorusGeometry(r - 0.01, 0.025, 6, 28), rubber);
      tread.rotation.y = Math.PI / 2;
      spin.add(tread);
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.66, r * 0.66, w + 0.02, 20), chrome);
      rim.rotation.z = Math.PI / 2;
      spin.add(rim);
      const side = Math.sign(p[0]);
      for (let k = 0; k < 5; k++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.03, r * 1.2, 0.07), carbon);
        spoke.position.x = side * (w / 2 + 0.015);
        spoke.rotation.x = (k / 5) * Math.PI;
        spin.add(spoke);
      }
      const hub = new THREE.Mesh(new THREE.TorusGeometry(r * 0.5, 0.02, 6, 20), neonMat);
      hub.rotation.y = Math.PI / 2;
      hub.position.x = side * (w / 2 + 0.03);
      spin.add(hub);
      this.group.add(pivot);
      this.wheelPivots.push(pivot);
      this.wheelSpins.push(spin);
    });

    // neonowa poświata pod podwoziem
    this.glowMat = new THREE.MeshBasicMaterial({
      map: sharedGlow,
      color: accentColor.clone().multiplyScalar(0.82),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 5.2), this.glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.12;
    this.group.add(glow);
    const shadow = new THREE.Mesh(
      new THREE.PlaneGeometry(2.6, 3.6),
      new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, depthWrite: false }),
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.1;
    shadow.renderOrder = 1;
    this.group.add(shadow);

    // tarcza
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(0.18, 0.9, 1.6),
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
      wireframe: true,
    });
    this.shieldMesh = new THREE.Mesh(new THREE.IcosahedronGeometry(2.1, 2), this.shieldMat);
    this.shieldMesh.position.y = 0.8;
    this.shieldMesh.visible = false;
    this.group.add(this.shieldMesh);
  }

  place_at(track: Track, s: number, lateral: number) {
    const { yaw, idx } = track.sample(s, lateral, this.pos);
    this.yaw = yaw;
    this.idx = idx;
    this.s = track.wrapS(s);
    this.prevS = this.s;
    this.vel.set(0, 0, 0);
    this.group.position.copy(this.pos);
    this.group.rotation.y = yaw;
  }

  forward(out: THREE.Vector3) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  startBoost(time: number, kind: number) {
    this.boostTime = Math.max(this.boostTime, time);
    this.boostKind = kind;
  }

  hit(): boolean {
    if (this.shieldTime > 0) {
      this.shieldTime = 0;
      return false;
    }
    if (this.spinTime > 0) return false;
    this.spinTime = 1.4;
    this.vel.multiplyScalar(0.3);
    this.drifting = false;
    this.driftCharge = 0;
    this.boostTime = 0;
    this.hitFlash = 1;
    return true;
  }

  /** zwraca poziom mini-turbo po zakończeniu driftu (0 = brak) */
  update(dt: number, track: Track, raceStarted: boolean): number {
    const c = this.controls;
    let releasedLevel = 0;
    if (!raceStarted) {
      c.throttle = 0;
      c.steer = 0;
    }
    if (this.spinTime > 0) {
      this.spinTime -= dt;
      const f = Math.max(0, this.spinTime / 1.4);
      this.spinAngle = Math.PI * 4 * (1 - f * f);
      c.throttle = 0;
      c.steer = 0;
      if (this.spinTime <= 0) this.spinAngle = 0;
    }
    this.shieldTime = Math.max(0, this.shieldTime - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2);

    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const lx = fz;
    const lz = -fx;
    let vf = this.vel.x * fx + this.vel.z * fz;
    let vl = this.vel.x * lx + this.vel.z * lz;

    // sterowanie wygładzone
    const sr = 1 - Math.exp(-7 * dt);
    this.steerSmooth += (c.steer - this.steerSmooth) * sr;
    const steer = this.steerSmooth;

    // drift
    const driftPressed = c.drift && !this.prevDrift;
    this.prevDrift = c.drift;
    if (driftPressed && !this.airborne && raceStarted && this.spinTime <= 0) {
      this.hop = 1;
      if (Math.abs(c.steer) > 0.25 && vf > 12) {
        this.drifting = true;
        this.driftDir = Math.sign(c.steer);
        this.driftCharge = 0;
        this.driftLevel = 0;
      }
    }
    if (this.drifting) {
      if (!c.drift || vf < 8 || this.spinTime > 0) {
        releasedLevel = this.driftLevel;
        if (this.driftLevel > 0) {
          const t = [0, 0.7, 1.2, 1.9][this.driftLevel];
          this.startBoost(t, this.driftLevel);
        }
        this.drifting = false;
        this.driftCharge = 0;
        this.driftLevel = 0;
      } else if (!this.airborne) {
        this.driftCharge += dt * (0.75 + 0.6 * Math.max(0, steer * this.driftDir));
        this.driftLevel = this.driftCharge > 3.1 ? 3 : this.driftCharge > 1.9 ? 2 : this.driftCharge > 0.9 ? 1 : 0;
      }
    }

    const boosting = this.boostTime > 0;
    if (boosting) this.boostTime -= dt;
    const maxS = this.maxSpeed * (boosting ? 1.38 : 1);

    const slopeF = this.proj.ty * (fx * this.proj.tx + fz * this.proj.tz);

    if (!this.airborne) {
      if (c.throttle > 0 && vf < maxS) {
        const k = Math.max(0, 1 - Math.max(0, vf) / maxS);
        vf += this.accel * c.throttle * (0.35 + 0.65 * Math.sqrt(k)) * dt;
      }
      if (boosting) vf = Math.min(vf + 42 * dt, maxS + 2);
      if (vf > maxS) vf -= (vf - maxS) * 1.2 * dt;
      if (c.brake > 0) {
        if (vf > 0.5) vf -= 38 * c.brake * dt;
        else vf = Math.max(vf - 14 * dt, -11);
      }
      if (c.throttle === 0 && c.brake === 0) {
        vf -= Math.sign(vf) * Math.min(Math.abs(vf), 5 * dt);
      }
      // grawitacja na zboczu
      vf -= 9.81 * slopeF * 0.85 * dt;

      // skręt
      const speedF = Math.min(1, Math.abs(vf) / 9);
      const hiDamp = 1 - 0.32 * Math.min(1, Math.abs(vf) / this.maxSpeed);
      let steerEff = steer;
      if (this.drifting) steerEff = this.driftDir * (0.95 + 0.55 * steer * this.driftDir);
      const targetYR = steerEff * (this.drifting ? 2.35 : 2.0) * speedF * hiDamp * Math.sign(vf || 1);
      this.yawRate += (targetYR - this.yawRate) * (1 - Math.exp(-9 * dt));

      // przyczepność boczna
      const grip = this.drifting ? 2.0 : this.spinTime > 0 ? 1.2 : 8.5;
      vl *= Math.exp(-grip * dt);
      if (this.drifting) vl -= this.driftDir * Math.abs(vf) * 0.25 * dt; // wyrzut na zewnątrz
    } else {
      this.yawRate *= Math.exp(-2 * dt);
      this.yawRate += steer * 0.8 * dt;
      vf *= Math.exp(-0.05 * dt);
    }

    this.yaw += this.yawRate * dt;
    const nfx = Math.sin(this.yaw);
    const nfz = Math.cos(this.yaw);
    // prędkość zachowuje kierunek względem nowego kursu (fizyka pojazdu)
    this.vel.x = nfx * vf + nfz * vl;
    this.vel.z = nfz * vf - nfx * vl;
    this.accLong = (vf - this.lastVf) / Math.max(dt, 1e-4);
    this.lastVf = vf;
    this.vf = vf;
    this.vl = vl;

    // integracja
    const oldY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    track.project(this.pos.x, this.pos.y, this.pos.z, this.idx, this.proj);
    this.idx = this.proj.idx;
    const groundY = this.proj.height;

    this.landingImpact = 0;
    if (!this.airborne) {
      const vyGround = (groundY - oldY) / Math.max(dt, 1e-4);
      if ((vyGround < this.vy - 5 && Math.abs(vf) > 15) || groundY < oldY - 0.6) {
        this.airborne = true;
        this.airTime = 0;
        this.pos.y = oldY + this.vy * dt;
      } else {
        this.pos.y = groundY;
        this.vy = this.vy + (vyGround - this.vy) * Math.min(1, dt * 30);
      }
    } else {
      this.airTime += dt;
      this.vy -= 24 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= groundY) {
        this.landingImpact = Math.max(0, -this.vy);
        this.pos.y = groundY;
        this.airborne = false;
        this.bounceV -= this.landingImpact * 0.05;
        this.vy = 0;
        if (this.airTime > 0.45) this.startBoost(0.5, 4);
      }
    }

    // bariery
    this.wallHit = 0;
    const lim = BARRIER - 1.0;
    const lat = this.proj.lateral;
    if (Math.abs(lat) > lim) {
      const sgn = Math.sign(lat);
      const pen = Math.abs(lat) - lim;
      this.pos.x -= this.proj.nx * pen * sgn;
      this.pos.z -= this.proj.nz * pen * sgn;
      const vn = (this.vel.x * this.proj.nx + this.vel.z * this.proj.nz) * sgn;
      if (vn > 0) {
        this.vel.x -= this.proj.nx * sgn * vn * 1.3;
        this.vel.z -= this.proj.nz * sgn * vn * 1.3;
        const fr = 1 - Math.min(0.45, vn * 0.025);
        this.vel.x *= fr;
        this.vel.z *= fr;
        this.wallHit = vn;
        this.wallSide = sgn;
        // wyrównanie do toru
        const trackYaw = Math.atan2(this.proj.tx, this.proj.tz);
        let d = trackYaw - this.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        if (Math.abs(d) < Math.PI / 2) this.yaw += d * Math.min(1, vn * 0.03);
        this.yawRate *= 0.5;
      }
    }

    // okrążenia
    this.prevS = this.s;
    this.s = this.proj.s;
    const L = track.length;
    const ds = this.s - this.prevS;
    if (this.s > L * 0.45 && this.s < L * 0.55) this.halfway = true;
    if (ds < -L / 2) {
      if (this.halfway) {
        this.lap++;
        this.halfway = false;
        this.lapCrossed = true;
      }
    } else if (ds > L / 2) {
      this.lap--;
      this.halfway = true;
    }
    this.progress = (this.lap - 1) * L + this.s;

    this.animate(dt, slopeF);
    return releasedLevel;
  }

  accLong = 0;
  lapCrossed = false;

  private animate(dt: number, slopeF: number) {
    // zawieszenie — sprężyna z tłumieniem
    const targetPitch = THREE.MathUtils.clamp(-this.accLong * 0.004, -0.09, 0.09);
    const latAcc = this.vf * this.yawRate;
    const targetRoll = THREE.MathUtils.clamp(latAcc * 0.0045, -0.12, 0.12);
    const k = 160;
    const cd = 14;
    this.pitchV += ((targetPitch - this.pitch) * k - this.pitchV * cd) * dt;
    this.pitch += this.pitchV * dt;
    this.rollV += ((targetRoll - this.roll) * k - this.rollV * cd) * dt;
    this.roll += this.rollV * dt;
    this.bounceV += (-this.bounce * 220 - this.bounceV * 12) * dt;
    this.bounce += this.bounceV * dt;
    // drgania silnika
    const rumble = this.airborne ? 0 : Math.sin(performance.now() * 0.05 + this.cfg.color) * 0.004 * (0.3 + Math.abs(this.vf) / this.maxSpeed);

    this.hop = Math.max(0, this.hop - dt * 4);
    const hopY = Math.sin(this.hop * Math.PI) * 0.35 * (this.hop > 0 ? 1 : 0);
    const gp = this.airborne ? this.groundPitch + dt * 0.3 : -Math.atan(slopeF);
    this.groundPitch += (gp - this.groundPitch) * Math.min(1, dt * (this.airborne ? 1.5 : 12));

    const targetDY = this.drifting ? this.driftDir * 0.32 : 0;
    this.visualDriftYaw += (targetDY - this.visualDriftYaw) * Math.min(1, dt * 6);

    this.group.position.copy(this.pos);
    this.group.rotation.y = this.yaw + this.spinAngle;
    this.group.rotation.x = this.groundPitch;
    this.body.position.y = this.bounce + hopY + rumble;
    this.body.rotation.x = this.pitch;
    this.body.rotation.z = this.roll;
    this.body.rotation.y = this.visualDriftYaw * 0.3;
    this.group.rotation.y += this.visualDriftYaw * 0.7;

    // koła
    this.wheelSpin += (this.vf / 0.4) * dt;
    const steerAngle = this.drifting ? -this.driftDir * 0.25 + this.steerSmooth * 0.2 : this.steerSmooth * 0.45;
    for (let i = 0; i < 4; i++) {
      this.wheelSpins[i].rotation.x = this.wheelSpin * (0.4 / this.radius[i]);
      if (i < 2) this.wheelPivots[i].rotation.y = steerAngle;
      this.wheelPivots[i].position.y = this.radius[i] + Math.min(0, this.bounce) * 0.3;
    }

    // światła
    const braking = this.controls.brake > 0 && this.vf > 1;
    const tl = braking ? 5 : 1.6;
    this.tailMat.color.setRGB(tl, tl * 0.03, tl * 0.06);

    // płomienie
    const boosting = this.boostTime > 0;
    const fl = boosting ? 1.4 + Math.random() * 0.6 : this.controls.throttle > 0 ? 0.25 + Math.random() * 0.15 : 0.05;
    let fc = [3, 1.2, 0.3];
    if (boosting) {
      if (this.boostKind === 1) fc = [0.4, 1.4, 4];
      else if (this.boostKind === 2) fc = [4, 1.6, 0.2];
      else if (this.boostKind === 3) fc = [2.6, 0.4, 4];
      else fc = [4, 2.2, 0.8];
    } else fc = [0.6, 1.2, 3];
    this.flames.forEach((f, i) => {
      f.scale.set(1 + (boosting ? 0.6 : 0), fl * 1.6, 1 + (boosting ? 0.6 : 0));
      this.flameMats[i].color.setRGB(fc[0], fc[1], fc[2]);
      this.flameMats[i].opacity = boosting ? 0.9 : 0.6;
    });

    const g = 1.0 + Math.sin(performance.now() * 0.004) * 0.2 + (boosting ? 0.6 : 0);
    const ac = new THREE.Color(this.cfg.accent);
    this.glowMat.color.setRGB(ac.r * g * 1.3, ac.g * g * 1.3, ac.b * g * 1.3);

    this.shieldMesh.visible = this.shieldTime > 0;
    if (this.shieldMesh.visible) {
      this.shieldMesh.rotation.y += dt * 1.5;
      this.shieldMesh.rotation.x += dt * 0.7;
      this.shieldMat.opacity = 0.2 + Math.sin(performance.now() * 0.01) * 0.08 + (this.shieldTime < 1.5 ? Math.random() * 0.2 : 0);
    }
  }

  wheelWorld(i: number, out: THREE.Vector3) {
    this.wheelPivots[i].getWorldPosition(out);
    out.y -= this.radius[i] * 0.9;
    return out;
  }

  exhaustWorld(i: number, out: THREE.Vector3) {
    return this.flames[i].getWorldPosition(out);
  }
}
