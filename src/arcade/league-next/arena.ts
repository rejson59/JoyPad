import { Vector3 } from 'three';
import { A, B, H, RC, RF, GOAL_W, GOAL_H, GOAL_D } from './constants';

// Pole odległości znakowanej wnętrza areny (ujemne = w środku, dodatnie = w ścianie).
// Arena = zaokrąglony prostopadłościan + dwie bramki (unia).

// przód wnęki bramki zaczyna się przed łukiem podłoga/ściana, żeby wlot był płaski
const GZ_FRONT = B - RF - 0.5;
const GZ_CENTER = (GZ_FRONT + B + GOAL_D) / 2;
const GZ_HALF = (B + GOAL_D - GZ_FRONT) / 2;
const GR = 1.0;

export function arenaSdf(x: number, y: number, z: number): number {
  const az = Math.abs(z);
  const qx = Math.abs(x) - (A - RC);
  const qz = az - (B - RC);
  const d2 =
    Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0) - RC;
  const dy = Math.max(-y, y - H);
  const a = d2 + RF;
  const b = dy + RF;
  const main = Math.min(Math.max(a, b), 0) + Math.hypot(Math.max(a, 0), Math.max(b, 0)) - RF;

  // bramka (zaokrąglone pudełko)
  const gx = Math.abs(x) - GOAL_W + GR;
  const gy = Math.abs(y - GOAL_H / 2) - GOAL_H / 2 + GR;
  const gz = Math.abs(az - GZ_CENTER) - GZ_HALF + GR;
  const goal =
    Math.hypot(Math.max(gx, 0), Math.max(gy, 0), Math.max(gz, 0)) +
    Math.min(Math.max(gx, gy, gz), 0) -
    GR;

  return Math.min(main, goal);
}

const E = 0.015;
// normalna skierowana do wnętrza areny
export function arenaNormal(x: number, y: number, z: number, out: Vector3): Vector3 {
  const gx = arenaSdf(x + E, y, z) - arenaSdf(x - E, y, z);
  const gy = arenaSdf(x, y + E, z) - arenaSdf(x, y - E, z);
  const gz = arenaSdf(x, y, z + E) - arenaSdf(x, y, z - E);
  out.set(-gx, -gy, -gz);
  const l = out.length();
  if (l < 1e-6) return out.set(0, 1, 0);
  return out.multiplyScalar(1 / l);
}

export function isInsideGoalMouth(x: number, y: number): boolean {
  return Math.abs(x) < GOAL_W && y < GOAL_H;
}
