import * as THREE from 'three';
import { Car } from './Car';
import { Ball } from './Ball';
import { BoostPad } from './pads';
import { A, B, BALL_R, GOAL_W } from './constants';

export type Role = 'attack' | 'support' | 'defend' | 'kickoff';

export interface BotContext {
  ball: Ball;
  cars: Car[];
  pads: BoostPad[];
  time: number;
  kickoff: boolean;
}

const V = THREE.Vector3;
const _pred = new V();
const _g = new V();
const _tb = new V();
const _f = new V();
const _tv = new V();
const _cr = new V();
const _l = new V();
const _dir = new V();
const _qi = new THREE.Quaternion();
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

export class BotBrain {
  role: Role = 'attack';
  target = new V();
  wantBoost = false;
  private thinkT = Math.random() * 0.2;
  private stuckT = 0;
  private reverseT = 0;
  private reverseSteer = 1;
  private act: { kind: 'dodge'; t: number; f1: boolean; f2: boolean } | null = null;
  private aerialUntil = 0;
  private aerialFlip = false;
  private nextAct = 0;
  private nextAerial = 0;
  private nextFlipJump = 0;
  private skill: number;

  constructor(public car: Car, difficulty: number) {
    this.skill = [0.45, 0.75, 1.0][difficulty] ?? 0.75;
  }

  private pickPad(ctx: BotContext, maxDist: number): boolean {
    const car = this.car;
    let best: BoostPad | null = null;
    let bs = 1e9;
    for (const p of ctx.pads) {
      if (!p.active) continue;
      const d = Math.hypot(p.x - car.pos.x, p.z - car.pos.z);
      if (d > maxDist) continue;
      const s = d - (p.big ? 10 : 0);
      if (s < bs) {
        bs = s;
        best = p;
      }
    }
    if (best) {
      this.target.set(best.x, 0, best.z);
      this.wantBoost = false;
      return true;
    }
    return false;
  }

  private plan(ctx: BotContext) {
    const car = this.car;
    const ball = ctx.ball;
    const own = car.team === 0 ? B : -B;
    const enemy = -own;
    const bp = ball.pos;
    const dist = car.pos.distanceTo(bp);
    const carSpeed = Math.max(8, car.vel.length());
    const tLead = clamp(dist / (carSpeed + 6), 0, 1.3) * (0.4 + 0.6 * this.skill);
    _pred.copy(bp).addScaledVector(ball.vel, tLead);
    _pred.y = Math.max(BALL_R, _pred.y - 3.25 * tLead * tLead);
    _pred.x = clamp(_pred.x, -A + 3, A - 3);
    _pred.z = clamp(_pred.z, -B + 2.5, B - 2.5);
    this.wantBoost = false;

    if (this.role === 'kickoff') {
      this.target.copy(bp);
      this.wantBoost = true;
      return;
    }
    if (this.role === 'attack') {
      _g.set(0, 0, enemy).sub(_pred);
      _g.y = 0;
      _g.normalize();
      _tb.copy(_pred).sub(car.pos);
      _tb.y = 0;
      const d = _tb.length();
      _tb.normalize();
      const aligned = _tb.dot(_g) > 0.5;
      if (aligned || d < 5.5) {
        this.target.copy(_pred);
        this.wantBoost = d > 8;
      } else {
        this.target.copy(_pred).addScaledVector(_g, -8);
        this.target.x = clamp(this.target.x, -A + 5, A - 5);
        this.target.z = clamp(this.target.z, -B + 5, B - 5);
        this.wantBoost = d > 26 && car.boost > 30;
      }
      if (car.boost < 12 && d > 28) this.pickPad(ctx, 35);
      return;
    }
    if (this.role === 'support') {
      const zt = (_pred.z + own * 0.35) * 0.6;
      this.target.set(_pred.x * 0.6, 0, clamp(zt, -B + 8, B - 8));
      if (car.boost < 55 && this.pickPad(ctx, 45)) return;
      this.wantBoost = car.pos.distanceTo(this.target) > 30 && car.boost > 40;
      return;
    }
    // defend
    _dir.set(_pred.x, 0, _pred.z - own);
    const dGoal = _dir.length();
    _dir.normalize();
    const off = clamp(dGoal * 0.35, 6, 20);
    this.target.set(clamp(_dir.x * off, -GOAL_W * 1.3, GOAL_W * 1.3), 0, own + _dir.z * off);
    if (car.boost < 40 && dGoal > 35 && this.pickPad(ctx, 30)) return;
    this.wantBoost = car.pos.distanceTo(this.target) > 26 && car.boost > 25;
  }

  update(dt: number, ctx: BotContext) {
    const car = this.car;
    const inp = car.input;
    inp.throttle = 0;
    inp.steer = 0;
    inp.pitch = 0;
    inp.roll = 0;
    inp.boost = false;
    inp.handbrake = false;
    inp.jump = false;
    if (car.demolished || car.frozen) {
      this.act = null;
      return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.plan(ctx);
      this.thinkT = 0.09 + (1 - this.skill) * 0.22;
    }
    if (car.grounded) this.drive(dt, ctx);
    else this.air(ctx);
    this.overlayAct(dt);
  }

  private drive(dt: number, ctx: BotContext) {
    const car = this.car;
    const inp = car.input;
    const n = car.groundN;
    const ball = ctx.ball;

    _f.copy(car.heading);
    _f.addScaledVector(n, -_f.dot(n));
    _f.normalize();
    _tv.copy(this.target).sub(car.pos);
    _tv.addScaledVector(n, -_tv.dot(n));
    const dist = _tv.length();
    const speed = car.fwdSpeed;

    // zablokowanie
    if (Math.abs(speed) < 1.4 && dist > 4) this.stuckT += dt;
    else this.stuckT = Math.max(0, this.stuckT - dt * 2);
    if (this.stuckT > 0.9) {
      this.reverseT = 0.8;
      this.reverseSteer = Math.random() < 0.5 ? -1 : 1;
      this.stuckT = 0;
    }
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      inp.throttle = -1;
      inp.steer = this.reverseSteer;
      return;
    }

    const ang = Math.atan2(_cr.crossVectors(_f, _tv).dot(n), _f.dot(_tv));
    const noise = (1 - this.skill) * 0.22 * Math.sin(ctx.time * 1.7 + car.index * 2.3);
    inp.steer = clamp(-(ang + noise) * 2.8, -1, 1);
    inp.throttle = 1;

    const attacker = this.role === 'attack' || this.role === 'kickoff';
    if (!attacker && dist < 3.2) {
      inp.throttle = speed > 4 ? -0.6 : dist > 1.2 ? 0.35 : 0;
      inp.boost = false;
    }
    if (Math.abs(ang) > 1.1 && speed > 7) inp.handbrake = true;
    if (Math.abs(ang) > 2.3 && dist < 10 && speed < 5) {
      inp.throttle = -1;
      inp.steer = -inp.steer;
    }
    inp.boost = this.wantBoost && Math.abs(ang) < 0.24 && car.boost > 3 && speed > (this.skill < 0.6 ? 6 : 2);

    // dodge w piłkę
    if (!this.act && attacker && ctx.time > this.nextAct && this.skill > 0.4 && !car.onWall) {
      const dx = ball.pos.x - car.pos.x;
      const dz = ball.pos.z - car.pos.z;
      const dxz = Math.hypot(dx, dz);
      const range = this.role === 'kickoff' ? 6.8 : 4.3;
      if (dxz < range && dxz > 2 && ball.pos.y < 2.7 && speed > 7) {
        _tb.set(dx, 0, dz).normalize();
        if (_tb.dot(_f) > 0.9 && Math.random() < 0.35 + 0.6 * this.skill) {
          this.act = { kind: 'dodge', t: 0, f1: false, f2: false };
          this.nextAct = ctx.time + 1.4;
        }
      }
    }
    // aerial
    if (attacker && this.skill > 0.9 && ctx.time > this.nextAerial && car.boost > 35 && !this.act) {
      const dx = ball.pos.x - car.pos.x;
      const dz = ball.pos.z - car.pos.z;
      if (ball.pos.y > 4.5 && ball.pos.y < 13 && Math.hypot(dx, dz) < 20 && Math.abs(ball.vel.y) < 12) {
        this.aerialUntil = ctx.time + 1.6;
        this.aerialFlip = false;
        this.nextAerial = ctx.time + 4;
        inp.jumpPressed = true;
      }
    }
    if (ctx.time < this.aerialUntil) inp.jump = true;
  }

  private air(ctx: BotContext) {
    const car = this.car;
    const inp = car.input;
    const ball = ctx.ball;
    _qi.copy(car.quat).invert();
    if (ctx.time < this.aerialUntil) {
      inp.jump = ctx.time > this.aerialUntil - 1.5 && ctx.time < this.aerialUntil - 1.32;
      _dir.copy(ball.pos).addScaledVector(ball.vel, 0.12).sub(car.pos);
      const d = _dir.length();
      _dir.normalize();
      _l.copy(_dir).applyQuaternion(_qi);
      inp.pitch = clamp(-_l.y * 4, -1, 1);
      inp.steer = clamp(_l.x * 4, -1, 1);
      _cr.set(0, 1, 0).applyQuaternion(_qi);
      inp.roll = clamp(_cr.x * 2.5, -1, 1);
      inp.boost = _l.z < -0.85 && car.boost > 4 && d > 1.8;
      if (d < 3.0 && car.hasFlip && !this.aerialFlip && car.flipWindow > 0) {
        this.aerialFlip = true;
        inp.jumpPressed = true;
        inp.pitch = 1;
        inp.steer = 0;
      }
      return;
    }
    // wyrównanie do lądowania
    _l.set(0, 1, 0).applyQuaternion(_qi);
    inp.roll = _l.y < 0 ? (_l.x >= 0 ? 1 : -1) : clamp(_l.x * 3.5, -1, 1);
    inp.pitch = clamp(-_l.z * 3.5, -1, 1);
    if (car.contactTimer > 0 && _l.y < -0.3 && ctx.time > this.nextFlipJump) {
      inp.jumpPressed = true;
      this.nextFlipJump = ctx.time + 1.2;
    }
  }

  private overlayAct(dt: number) {
    const a = this.act;
    if (!a) return;
    const car = this.car;
    const inp = car.input;
    a.t += dt;
    if (!a.f1) {
      inp.jumpPressed = true;
      a.f1 = true;
    }
    inp.jump = a.t < 0.1;
    if (a.t >= 0.14 && !a.f2 && !car.grounded) {
      a.f2 = true;
      inp.jumpPressed = true;
    }
    if (a.f2 && a.t < 0.45) {
      inp.pitch = 1;
      inp.steer = 0;
      inp.roll = 0;
    }
    if (a.t > 0.95 || (car.grounded && a.t > 0.35)) this.act = null;
  }
}
