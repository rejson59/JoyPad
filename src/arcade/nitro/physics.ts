import * as THREE from 'three';
import { Car } from './Car';
import { Ball } from './Ball';
import { BALL_R, SUPERSONIC } from './constants';

const V = THREE.Vector3;
const _d = new V();
const _pl = new V();
const _cl = new V();
const _nl = new V();
const _n = new V();
const _cw = new V();
const _r = new V();
const _vc = new V();
const _vrel = new V();
const _dd = new V();
const _dir = new V();
const _tan = new V();
const _cr = new V();
const _up = new V();
const _qi = new THREE.Quaternion();

const HX = 0.47;
const HY = 0.27;
const HZ = 0.7;

export interface HitInfo {
  power: number; // zmiana prędkości piłki
  point: THREE.Vector3;
  normal: THREE.Vector3;
}

// Zwraca informacje o uderzeniu lub null
export function collideCarBall(car: Car, ball: Ball): HitInfo | null {
  if (car.demolished) return null;
  _d.copy(ball.pos).sub(car.pos);
  _qi.copy(car.quat).invert();
  _pl.copy(_d).applyQuaternion(_qi);
  _cl.set(Math.max(-HX, Math.min(HX, _pl.x)), Math.max(-HY, Math.min(HY, _pl.y)), Math.max(-HZ, Math.min(HZ, _pl.z)));
  _nl.copy(_pl).sub(_cl);
  let dist = _nl.length();
  if (dist >= BALL_R) return null;
  if (dist < 1e-5) {
    // środek piłki wewnątrz bryły
    const ox = HX - Math.abs(_pl.x);
    const oy = HY - Math.abs(_pl.y);
    const oz = HZ - Math.abs(_pl.z);
    _nl.set(0, 0, 0);
    if (ox <= oy && ox <= oz) {
      _nl.x = Math.sign(_pl.x) || 1;
      dist = -ox;
    } else if (oy <= oz) {
      _nl.y = Math.sign(_pl.y) || 1;
      dist = -oy;
    } else {
      _nl.z = Math.sign(_pl.z) || 1;
      dist = -oz;
    }
    _cl.copy(_pl).addScaledVector(_nl, -dist);
  } else {
    _nl.multiplyScalar(1 / dist);
  }
  _n.copy(_nl).applyQuaternion(car.quat);
  const pen = BALL_R - dist;
  _cw.copy(_cl).applyQuaternion(car.quat).add(car.pos);
  _r.copy(_cw).sub(car.pos);
  _vc.copy(car.angVel).cross(_r).add(car.vel);
  _vrel.copy(ball.vel).sub(_vc);
  const vn = _vrel.dot(_n);
  ball.pos.addScaledVector(_n, pen);
  if (vn >= 0) return null;

  const speedRel = -vn;
  const mC = 6;
  const mB = 1;
  const e = speedRel > 1.0 ? 0.6 : 0.0;
  let dv = (1 + e) * speedRel * (mC / (mC + mB));
  const sp = Math.min(1, _vrel.length() / 23);
  dv *= 1 + 0.45 * sp;
  // kierunek: mieszanka normalnej kontaktu i kierunku od środka auta (spłaszczony w pionie)
  _up.set(0, 1, 0).applyQuaternion(car.quat);
  _dd.copy(ball.pos).sub(car.pos).addScaledVector(_up, 0.12);
  _dd.y *= 0.6;
  _dd.normalize();
  _dir.copy(_n).multiplyScalar(0.6).addScaledVector(_dd, 0.4).normalize();
  // nie pozwól wpychać piłki w auto
  if (_dir.dot(_n) < 0.3) _dir.copy(_n);
  ball.vel.addScaledVector(_dir, dv);
  // reakcja auta
  car.vel.addScaledVector(_n, -dv * (mB / mC) * 0.35);
  // rotacja piłki od tarcia
  _tan.copy(_vrel).addScaledVector(_n, -vn);
  _cr.crossVectors(_n, _tan).multiplyScalar(0.55 / BALL_R);
  ball.angVel.add(_cr);
  const bs = ball.vel.length();
  if (bs > 60) ball.vel.multiplyScalar(60 / bs);
  return { power: dv, point: _cw, normal: _n };
}

// kolizje aut (3 kule na auto)
const SPH = [-0.44, 0, 0.44];
const SR = 0.46;
const _a = new V();
const _b = new V();
const _dn = new V();

export interface CarHit {
  a: Car;
  b: Car;
  demolished: Car | null;
  attacker: Car | null;
  strength: number;
  point: THREE.Vector3;
}

const _fwd = new V();

export function collideCars(a: Car, b: Car, out: CarHit): boolean {
  if (a.demolished || b.demolished) return false;
  if (a.pos.distanceToSquared(b.pos) > 6) return false;
  let hit = false;
  let maxStrength = 0;
  for (const za of SPH) {
    for (const zb of SPH) {
      _a.set(0, 0.03, za).applyQuaternion(a.quat).add(a.pos);
      _b.set(0, 0.03, zb).applyQuaternion(b.quat).add(b.pos);
      _dn.copy(_a).sub(_b);
      const dist = _dn.length();
      if (dist >= SR * 2 || dist < 1e-6) continue;
      _dn.multiplyScalar(1 / dist);
      const pen = SR * 2 - dist;
      a.pos.addScaledVector(_dn, pen * 0.5);
      b.pos.addScaledVector(_dn, -pen * 0.5);
      const vn = _vrel.copy(a.vel).sub(b.vel).dot(_dn);
      if (vn < 0) {
        const j = -(1 + 0.35) * vn * 0.5;
        a.vel.addScaledVector(_dn, j);
        b.vel.addScaledVector(_dn, -j);
        hit = true;
        if (-vn > maxStrength) {
          maxStrength = -vn;
          out.point.copy(_a).add(_b).multiplyScalar(0.5);
        }
      }
    }
  }
  if (!hit) return false;
  out.a = a;
  out.b = b;
  out.strength = maxStrength;
  out.demolished = null;
  out.attacker = null;
  if (a.team !== b.team && maxStrength > 5) {
    // czy któryś uderzył przodem przy prędkości ponaddźwiękowej
    const tryDemo = (att: Car, vic: Car) => {
      if (att.vel.length() < SUPERSONIC - 0.6) return;
      att.forward(_fwd);
      _dd.copy(vic.pos).sub(att.pos).normalize();
      if (_fwd.dot(_dd) > 0.6) {
        out.demolished = vic;
        out.attacker = att;
      }
    };
    tryDemo(a, b);
    if (!out.demolished) tryDemo(b, a);
  }
  return true;
}
