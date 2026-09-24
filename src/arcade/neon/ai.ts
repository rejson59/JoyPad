import * as THREE from 'three';
import { Track } from './track';
import { Kart } from './kart';

const tmp = new THREE.Vector3();

function wrapAngle(a: number) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

export function driveAI(k: Kart, track: Track, karts: Kart[], leaderRef: Kart, baseMax: number, dt: number) {
  const c = k.controls;
  const L = track.length;

  // gumka (rubber-banding) względem gracza
  let diff = leaderRef.progress - k.progress;
  if (k === leaderRef) diff = 0;
  let band = 1;
  if (diff > 0) band += Math.min(0.1, diff / 1400);
  else band -= Math.min(0.07, -diff / 1800);
  k.maxSpeed = baseMax * k.cfg.skill * band;

  // zmiana pasa
  k.aiLaneTimer -= dt;
  if (k.aiLaneTimer <= 0) {
    k.aiLaneTimer = 2 + Math.random() * 4;
    k.aiLane = (Math.random() - 0.5) * 14;
    // celuj w boost pad
    for (const p of track.boostPads) {
      let d = p.s - k.s;
      if (d < 0) d += L;
      if (d < 120 && Math.random() < k.cfg.skill - 0.2) k.aiLane = p.lateral;
    }
  }
  // omijanie innych
  let lane = k.aiLane;
  for (const o of karts) {
    if (o === k) continue;
    let d = o.s - k.s;
    if (d < -L / 2) d += L;
    if (d > L / 2) d -= L;
    if (d > 0 && d < 14 && Math.abs(o.proj.lateral - lane) < 3) {
      lane += o.proj.lateral > lane ? -4 : 4;
    }
  }
  lane = THREE.MathUtils.clamp(lane, -8.5, 8.5);

  const look = 11 + Math.max(0, k.vf) * 0.5;
  track.sample(k.s + look, lane, tmp);
  const desired = Math.atan2(tmp.x - k.pos.x, tmp.z - k.pos.z);
  const err = wrapAngle(desired - k.yaw);
  let steer = THREE.MathUtils.clamp(err * 2.6, -1, 1);

  const curv = track.curvatureAhead(k.s, 30 + Math.max(0, k.vf) * 1.2);
  const targetSpeed = k.maxSpeed * (1 - THREE.MathUtils.clamp(curv - 0.5, 0, 1) * 0.3);
  c.throttle = 1;
  c.brake = 0;
  if (k.vf > targetSpeed + 3) {
    c.throttle = 0;
    if (k.vf > targetSpeed + 8) c.brake = 0.5;
  }

  // drift w ostrych zakrętach
  if (!k.drifting) {
    c.drift = false;
    if (curv > 0.7 && Math.abs(steer) > 0.55 && k.vf > 22 && Math.random() < 0.05 * k.cfg.skill) {
      c.drift = true;
    }
  } else {
    c.drift = true;
    // korekta w drifcie
    if (Math.sign(steer) !== k.driftDir && Math.abs(err) > 0.2) steer = -k.driftDir;
    if (curv < 0.3 || k.driftLevel >= 2 || (Math.abs(err) > 0.5 && Math.sign(err) !== k.driftDir)) c.drift = false;
  }
  c.steer = steer;

  // cofanie przy zakleszczeniu
  if (Math.abs(err) > 1.6 && k.vf < 5) {
    c.throttle = 0;
    c.brake = 1;
    c.steer = -Math.sign(err);
  }
}

export function aiUseItem(k: Kart, karts: Kart[], use: () => void, dt: number) {
  if (!k.item || k.rolling > 0) return;
  k.aiItemTimer -= dt;
  if (k.aiItemTimer > 0) return;
  const it = k.item;
  let should = false;
  if (it === 'rocket') should = k.place > 1;
  else if (it === 'mine') {
    should = karts.some((o) => o !== k && k.progress - o.progress > 3 && k.progress - o.progress < 40) || Math.random() < 0.01;
  } else if (it === 'shield') should = true;
  else should = Math.random() < 0.05;
  if (should) {
    use();
    k.aiItemTimer = 0.6 + Math.random() * 2.5;
  }
}
