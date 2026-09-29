import * as THREE from 'three';
import { arenaSdf, arenaNormal } from './arena';
import { GRAV, RIDE, MAX_SPEED, SUPERSONIC, CAR_HALF } from './constants';
import { CarInput, newInput } from './types';

type V3 = THREE.Vector3;
const V = THREE.Vector3;
const Q = THREE.Quaternion;

const _f = new V();
const _u = new V();
const _n = new V();
const _wp = new V();
const _acc = new V();
const _rr = new V();
const _vp = new V();
const _t1 = new V();
const _t2 = new V();
const _t3 = new V();
const _t4 = new V();
const _tt = new V();
const _wl = new V();
const _gF = new V();
const _gR = new V();
const _gN = new V();
const _gv = new V();
const _q1 = new Q();
const _qi = new Q();
const _qT = new Q();
const _m4 = new THREE.Matrix4();

const WHEEL_PTS = [new V(-0.42, -0.19, -0.46), new V(0.42, -0.19, -0.46), new V(-0.42, -0.19, 0.46), new V(0.42, -0.19, 0.46)];
const CORNERS: V3[] = [];
for (const sx of [-1, 1])
  for (const sz of [-1, 1]) {
    CORNERS.push(new V(sx * CAR_HALF.x, -CAR_HALF.y, sz * CAR_HALF.z));
    CORNERS.push(new V(sx * CAR_HALF.x, 0.28, sz * CAR_HALF.z));
  }
const INV_I = new V(1 / 0.55, 1 / 0.75, 1 / 0.29);

const CURV: [number, number][] = [
  [0, 0.69],
  [5, 0.398],
  [10, 0.235],
  [15, 0.138],
  [17.5, 0.11],
  [23, 0.089],
];
function steerCurv(s: number) {
  if (s <= 0) return CURV[0][1];
  for (let i = 1; i < CURV.length; i++) {
    if (s <= CURV[i][0]) {
      const t = (s - CURV[i - 1][0]) / (CURV[i][0] - CURV[i - 1][0]);
      return CURV[i - 1][1] + (CURV[i][1] - CURV[i - 1][1]) * t;
    }
  }
  return CURV[CURV.length - 1][1];
}
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export interface CarEvents {
  onJump?: (c: Car) => void;
  onDodge?: (c: Car) => void;
  onLand?: (c: Car, impact: number) => void;
  onBump?: (c: Car, impact: number, p: V3) => void;
}

export class Car {
  pos = new V();
  vel = new V();
  quat = new Q();
  angVel = new V();
  prevPos = new V();
  prevQuat = new Q();
  input: CarInput = newInput();
  boost = 33.3;
  boosting = false;
  grounded = false;
  groundN = new V(0, 1, 0);
  groundedTimer = 0;
  contactTimer = 0;
  noGroundTimer = 0;
  hasFlip = false;
  flipWindow = 0;
  dodgeTimer = 0;
  jumping = false;
  jumpHold = 0;
  frozen = false;
  demolished = false;
  respawnTimer = 0;
  supersonic = false;
  fwdSpeed = 0;
  accel = 0;
  slip = 0;
  heading = new V(0, 0, -1);
  wheelContacts = 0;
  onWall = false;

  constructor(
    public team: number,
    public index: number,
    public name: string,
    public isPlayer: boolean,
  ) {}

  savePrev() {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
  }

  forward(out: V3) {
    return out.set(0, 0, -1).applyQuaternion(this.quat);
  }
  up(out: V3) {
    return out.set(0, 1, 0).applyQuaternion(this.quat);
  }
  right(out: V3) {
    return out.set(1, 0, 0).applyQuaternion(this.quat);
  }

  placeAt(x: number, z: number, yaw: number) {
    this.pos.set(x, RIDE, z);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.quat.setFromAxisAngle(new V(0, 1, 0), yaw);
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.grounded = true;
    this.groundN.set(0, 1, 0);
    this.boost = 33.3;
    this.boosting = false;
    this.dodgeTimer = 0;
    this.jumping = false;
    this.hasFlip = true;
    this.flipWindow = 1.25;
    this.noGroundTimer = 0;
    this.demolished = false;
    this.heading.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  }

  // samonaprawa – ustawia auto kołami do dołu
  flipUpright() {
    this.forward(_t1);
    _t1.y = 0;
    if (_t1.lengthSq() < 0.01) _t1.set(0, 0, -1);
    _t1.normalize();
    const yaw = Math.atan2(-_t1.x, -_t1.z);
    this.quat.setFromAxisAngle(new V(0, 1, 0), yaw);
    this.angVel.set(0, 0, 0);
    this.pos.y += 0.4;
    this.vel.y = Math.max(this.vel.y, 2);
    this.noGroundTimer = 0.1;
  }

  private invI(v: V3, out: V3) {
    _qi.copy(this.quat).invert();
    out.copy(v).applyQuaternion(_qi);
    out.set(out.x * INV_I.x, out.y * INV_I.y, out.z * INV_I.z);
    return out.applyQuaternion(this.quat);
  }

  step(dt: number, ev: CarEvents) {
    const inp = this.input;
    if (this.demolished || this.frozen) {
      this.boosting = false;
      inp.jumpPressed = false;
      this.accel = 0;
      return;
    }
    this.noGroundTimer = Math.max(0, this.noGroundTimer - dt);
    this.contactTimer = Math.max(0, this.contactTimer - dt);
    this.groundedTimer = Math.max(0, this.groundedTimer - dt);
    this.dodgeTimer = Math.max(0, this.dodgeTimer - dt);

    // boost
    this.boosting = inp.boost && this.boost > 0.01;
    if (this.boosting) this.boost = Math.max(0, this.boost - 33.3 * dt);

    this.forward(_f);
    this.up(_u);

    // kontakt kół
    const eps = this.grounded ? 0.32 : 0.13;
    let contacts = 0;
    _acc.set(0, 0, 0);
    for (const w of WHEEL_PTS) {
      _wp.copy(w).applyQuaternion(this.quat).add(this.pos);
      const d = -arenaSdf(_wp.x, _wp.y, _wp.z);
      if (d < eps) {
        contacts++;
        arenaNormal(_wp.x, _wp.y, _wp.z, _n);
        _acc.add(_n);
      }
    }
    this.wheelContacts = contacts;
    let stick = false;
    if (contacts >= 2 && this.noGroundTimer <= 0 && _acc.lengthSq() > 0.2) {
      _acc.normalize();
      if (_acc.y > -0.35 && _acc.dot(_u) > 0.45) stick = true;
    }

    // skok / dodge
    if (inp.jumpPressed) {
      inp.jumpPressed = false;
      const canFirst = stick || this.groundedTimer > 0 || this.contactTimer > 0;
      if (canFirst && this.noGroundTimer <= 0) {
        this.doJump(ev);
        stick = false;
      } else if (this.hasFlip && this.flipWindow > 0 && !stick) {
        this.doDodge(ev);
      }
    }

    const prevSpeed = this.vel.length();
    if (stick) {
      this.groundStep(dt, _acc, ev);
    } else {
      this.airStep(dt, ev);
    }

    // limity
    const sp = this.vel.length();
    if (sp > MAX_SPEED) this.vel.multiplyScalar(MAX_SPEED / sp);
    this.forward(_f);
    this.fwdSpeed = this.vel.dot(_f);
    this.supersonic = sp >= SUPERSONIC;
    this.accel = (sp - prevSpeed) / dt;

    if (!isFinite(this.pos.x + this.pos.y + this.pos.z + this.vel.x + this.vel.y + this.vel.z + this.quat.w)) {
      this.placeAt(0, 30, 0);
    }
  }

  private doJump(ev: CarEvents) {
    this.up(_u);
    this.forward(_f);
    if (_u.y < -0.25) {
      this.vel.y += 2.9;
      this.angVel.addScaledVector(_f, (Math.random() < 0.5 ? -1 : 1) * 4.2);
    } else {
      this.vel.addScaledVector(_u, 2.92);
    }
    this.jumping = true;
    this.jumpHold = 0;
    this.hasFlip = true;
    this.flipWindow = 1.25;
    this.noGroundTimer = 0.14;
    this.grounded = false;
    this.groundedTimer = 0;
    this.contactTimer = 0;
    ev.onJump?.(this);
  }

  private doDodge(ev: CarEvents) {
    const inp = this.input;
    this.hasFlip = false;
    let dy = clamp(inp.pitch, -1, 1);
    let dx = clamp(inp.steer + inp.roll, -1, 1);
    const mag = Math.hypot(dx, dy);
    this.up(_u);
    if (mag > 0.25) {
      dx /= mag;
      dy /= mag;
      this.forward(_t1);
      _t1.y = 0;
      if (_t1.lengthSq() < 0.05) _t1.copy(_u).setY(0);
      _t1.normalize();
      this.right(_t2);
      _t2.y = 0;
      _t2.normalize();
      const imp = 5.2;
      this.vel.addScaledVector(_t1, dy * imp * (dy < 0 ? 0.85 : 1));
      this.vel.addScaledVector(_t2, dx * imp * 0.9);
      if (this.vel.y > 0) this.vel.y *= 0.35;
      _wl.set(-dy * 6.4, 0, -dx * 6.4);
      this.angVel.copy(_wl).applyQuaternion(this.quat);
      this.dodgeTimer = 0.65;
      ev.onDodge?.(this);
    } else {
      this.vel.addScaledVector(_u, 2.92);
      ev.onJump?.(this);
    }
    this.jumping = false;
  }

  private groundStep(dt: number, nIn: V3, ev: CarEvents) {
    const inp = this.input;
    const n = this.groundN.copy(nIn);
    const wasGrounded = this.grounded;
    this.grounded = true;
    this.groundedTimer = 0.1;
    this.contactTimer = 0.12;
    this.hasFlip = true;
    this.flipWindow = 1.25;
    this.dodgeTimer = 0;
    this.jumping = false;
    this.onWall = n.y < 0.75;

    // składowa normalna prędkości
    const vn = this.vel.dot(n);
    const speedBefore = this.vel.length();
    this.vel.addScaledVector(n, -vn);
    if (vn > -3) {
      const l = this.vel.length();
      if (l > 1e-4) this.vel.multiplyScalar(Math.min(speedBefore, MAX_SPEED) / l);
    } else if (!wasGrounded) {
      ev.onLand?.(this, -vn);
    }

    // grawitacja styczna
    _gv.set(0, -GRAV, 0);
    _gv.addScaledVector(n, -_gv.dot(n));
    this.vel.addScaledVector(_gv, dt);

    // kierunek jazdy (rzut na płaszczyznę)
    const heading = (out: V3) => {
      this.forward(out);
      out.addScaledVector(n, -out.dot(n));
      if (out.lengthSq() < 0.01) {
        out.copy(this.heading).addScaledVector(n, -this.heading.dot(n));
      }
      if (out.lengthSq() < 1e-6) out.set(0, 0, -1).addScaledVector(n, n.z);
      return out.normalize();
    };
    heading(_gF);
    const vf0 = this.vel.dot(_gF);
    const thr = inp.throttle;
    const hb = inp.handbrake;

    // skręt
    const sp0 = Math.abs(vf0);
    const eff = Math.max(sp0, 1.8 * Math.abs(thr));
    const dirSign = vf0 >= -0.3 ? 1 : -1;
    const yawRate = -inp.steer * steerCurv(sp0) * eff * (Math.abs(vf0) < 0.3 ? Math.sign(thr || 1) : dirSign) * (hb ? 1.6 : 1);
    _q1.setFromAxisAngle(n, yawRate * dt);
    this.quat.premultiply(_q1).normalize();
    heading(_gF);
    this.heading.copy(_gF);
    _gR.crossVectors(_gF, n);

    let vf = this.vel.dot(_gF);
    let vl = this.vel.dot(_gR);

    // przyspieszanie
    let acc = 0;
    if (thr !== 0) {
      const s = Math.sign(thr);
      if (vf * s < -0.3) acc = s * 35 * Math.abs(thr);
      else {
        const spd = Math.abs(vf);
        const curve = spd < 13.5 ? 1 - (0.1 * spd) / 13.5 : Math.max(0, (14.1 - spd) / 0.6) * 0.9;
        acc = s * 16 * curve * Math.abs(thr);
      }
    } else if (!this.boosting) {
      const c = 5.25 * dt;
      if (Math.abs(vf) < c) vf = 0;
      else vf -= Math.sign(vf) * c;
    }
    if (this.boosting && vf < MAX_SPEED) acc += 9.92;
    vf += acc * dt;
    if (hb) vf *= Math.exp(-0.3 * dt);

    // tarcie boczne
    const klat = hb ? 1.5 : 26;
    const kill = vl * (1 - Math.exp(-klat * dt));
    vl -= kill;
    this.slip = Math.abs(vl);
    if (!hb) vf += (vf >= 0 ? 1 : -1) * Math.abs(kill) * 0.9;
    vf = clamp(vf, -14.1 - (this.boosting ? 0 : 0), MAX_SPEED);

    this.vel.copy(_gF).multiplyScalar(vf).addScaledVector(_gR, vl);
    this.pos.addScaledVector(this.vel, dt);

    // dopasowanie orientacji
    _m4.makeBasis(_gR, n, _t1.copy(_gF).negate());
    _qT.setFromRotationMatrix(_m4);
    this.quat.slerp(_qT, 1 - Math.exp(-16 * dt));
    this.angVel.set(0, 0, 0);

    // przyklejenie na wysokość zawieszenia
    const dc = -arenaSdf(this.pos.x, this.pos.y, this.pos.z);
    arenaNormal(this.pos.x, this.pos.y, this.pos.z, _gN);
    const corr = clamp(RIDE - dc, -0.05, 0.3);
    this.pos.addScaledVector(_gN, corr);
  }

  private airStep(dt: number, ev: CarEvents) {
    const inp = this.input;
    this.grounded = false;
    this.onWall = false;
    this.slip = 0;
    this.forward(_f);
    this.up(_u);

    // grawitacja
    this.vel.y -= GRAV * dt;

    // przytrzymany skok
    if (this.jumping) {
      this.jumpHold += dt;
      if (inp.jump && this.jumpHold < 0.2) this.vel.addScaledVector(_u, 14.58 * dt);
      else this.jumping = false;
    }
    if (this.flipWindow > 0) this.flipWindow -= dt;

    // boost w powietrzu
    if (this.boosting && this.vel.length() < MAX_SPEED) this.vel.addScaledVector(_f, 9.92 * dt);

    // sterowanie obrotem
    _qi.copy(this.quat).invert();
    _wl.copy(this.angVel).applyQuaternion(_qi);
    if (this.dodgeTimer <= 0) {
      const rollIn = clamp(inp.roll + (inp.handbrake ? inp.steer : 0), -1, 1);
      const yawIn = inp.handbrake ? 0 : inp.steer;
      const kp = 1 - Math.exp(-(inp.pitch !== 0 ? 9 : 3.5) * dt);
      const ky = 1 - Math.exp(-(yawIn !== 0 ? 9 : 3.5) * dt);
      const kr = 1 - Math.exp(-(rollIn !== 0 ? 9 : 3.5) * dt);
      _wl.x += (-inp.pitch * 5.0 - _wl.x) * kp;
      _wl.y += (-yawIn * 4.2 - _wl.y) * ky;
      _wl.z += (-rollIn * 5.0 - _wl.z) * kr;
    } else {
      _wl.y *= Math.exp(-6 * dt);
    }
    this.angVel.copy(_wl).applyQuaternion(this.quat);

    // integracja
    this.pos.addScaledVector(this.vel, dt);
    const wlen = this.angVel.length();
    if (wlen > 1e-5) {
      _t1.copy(this.angVel).multiplyScalar(1 / wlen);
      _q1.setFromAxisAngle(_t1, wlen * dt);
      this.quat.premultiply(_q1).normalize();
    }

    // kolizje z areną (8 narożników)
    for (let iter = 0; iter < 2; iter++) {
      for (const c of CORNERS) {
        _rr.copy(c).applyQuaternion(this.quat);
        _wp.copy(_rr).add(this.pos);
        const s = arenaSdf(_wp.x, _wp.y, _wp.z);
        if (s <= 0) continue;
        arenaNormal(_wp.x, _wp.y, _wp.z, _n);
        this.pos.addScaledVector(_n, s * 0.95);
        this.contactTimer = 0.12;
        _vp.copy(this.angVel).cross(_rr).add(this.vel);
        const vn = _vp.dot(_n);
        if (vn >= 0) continue;
        const e = vn < -2 ? 0.28 : 0.04;
        _t2.crossVectors(_rr, _n);
        this.invI(_t2, _t3);
        _t4.crossVectors(_t3, _rr);
        const denom = 1 + _n.dot(_t4);
        const j = (-(1 + e) * vn) / denom;
        this.vel.addScaledVector(_n, j);
        this.angVel.addScaledVector(_t3, j);
        // tarcie
        _tt.copy(_vp).addScaledVector(_n, -vn);
        const tl = _tt.length();
        if (tl > 1e-4) {
          _tt.multiplyScalar(1 / tl);
          const jt = Math.min(0.4 * j, tl / denom);
          this.vel.addScaledVector(_tt, -jt);
          _t2.crossVectors(_rr, _tt);
          this.invI(_t2, _t3);
          this.angVel.addScaledVector(_t3, -jt);
        }
        if (-vn > 3) ev.onBump?.(this, -vn, _wp);
      }
    }
    const aw = this.angVel.length();
    if (aw > 7.5) this.angVel.multiplyScalar(7.5 / aw);
  }
}
