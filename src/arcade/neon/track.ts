import * as THREE from 'three';

export const ROAD_HALF = 12; // połowa szerokości jezdni (m)
export const BARRIER = ROAD_HALF - 0.2;

// Punkty kontrolne toru [x, y(wysokość), z]
const CONTROL_POINTS: [number, number, number][] = [
  [0, 0, 0],
  [160, 0, 0],
  [300, 0, -10],
  [420, 0, -70],
  [480, 2, -190],
  [470, 10, -320],
  [400, 20, -430],
  [270, 26, -480],
  [110, 26, -480],
  [-40, 22, -440],
  [-150, 12, -360],
  [-200, 3, -250],
  [-260, 0, -165],
  [-380, 0, -150],
  [-500, 0, -210],
  [-600, 0, -130],
  [-620, 0, 30],
  [-540, 0, 170],
  [-400, 7, 230],
  [-250, 9, 200],
  [-150, 2, 110],
  [-80, 0, 25],
];

export interface Projection {
  idx: number;
  s: number;
  lateral: number;
  height: number;
  tx: number;
  ty: number;
  tz: number;
  nx: number;
  nz: number;
  cx: number;
  cz: number;
}

export class Track {
  curve: THREE.CatmullRomCurve3;
  length: number;
  N: number;
  spacing: number;
  px: Float32Array;
  py: Float32Array;
  pz: Float32Array;
  tx: Float32Array;
  ty: Float32Array;
  tz: Float32Array;
  nx: Float32Array;
  nz: Float32Array;
  rampS: number;
  rampLen = 26;
  rampHeight = 3.2;
  boostPads: { s: number; lateral: number }[] = [];
  itemRows: number[] = [];

  constructor() {
    const pts = CONTROL_POINTS.map((c) => new THREE.Vector3(c[0], c[1], c[2]));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    const approxLen = this.curve.getLength();
    this.N = Math.round(approxLen / 1.0);
    const spaced = this.curve.getSpacedPoints(this.N);
    this.length = approxLen;
    this.spacing = approxLen / this.N;
    const N = this.N;
    this.px = new Float32Array(N);
    this.py = new Float32Array(N);
    this.pz = new Float32Array(N);
    this.tx = new Float32Array(N);
    this.ty = new Float32Array(N);
    this.tz = new Float32Array(N);
    this.nx = new Float32Array(N);
    this.nz = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      this.px[i] = spaced[i].x;
      this.py[i] = spaced[i].y;
      this.pz[i] = spaced[i].z;
    }
    // wygładzenie wysokości
    for (let pass = 0; pass < 6; pass++) {
      const copy = this.py.slice();
      for (let i = 0; i < N; i++) {
        let sum = 0;
        for (let k = -4; k <= 4; k++) sum += copy[(i + k + N) % N];
        this.py[i] = sum / 9;
      }
    }
    // skocznia
    this.rampS = this.nearestIndexGlobal(-335, -158) * this.spacing;
    const rampStartIdx = Math.round(this.rampS / this.spacing);
    const rampSamples = Math.round(this.rampLen / this.spacing);
    for (let k = 0; k <= rampSamples; k++) {
      const i = (rampStartIdx + k) % N;
      const f = k / rampSamples;
      this.py[i] += this.rampHeight * Math.pow(f, 1.25);
    }
    // wektory styczne i normalne
    for (let i = 0; i < N; i++) {
      const a = (i - 1 + N) % N;
      const b = (i + 1) % N;
      let dx = this.px[b] - this.px[a];
      let dz = this.pz[b] - this.pz[a];
      const l = Math.hypot(dx, dz) || 1;
      dx /= l;
      dz /= l;
      this.tx[i] = dx;
      this.tz[i] = dz;
      const dy = this.py[b] - this.py[i];
      this.ty[i] = dy / this.spacing;
      // lewa strona: (tz, -tx)
      this.nx[i] = dz;
      this.nz[i] = -dx;
    }
    // Boost pady
    const padS = [0.08, 0.27, 0.46, 0.63, 0.82];
    padS.forEach((f, k) => {
      this.boostPads.push({ s: f * this.length, lateral: k % 2 === 0 ? 5 : -5 });
    });
    this.itemRows = [0.15, 0.36, 0.55, 0.74, 0.92].map((f) => f * this.length);
  }

  nearestIndexGlobal(x: number, z: number): number {
    let best = 0;
    let bd = Infinity;
    for (let i = 0; i < this.N; i++) {
      const dx = this.px[i] - x;
      const dz = this.pz[i] - z;
      const d = dx * dx + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  wrap(i: number) {
    const N = this.N;
    return ((i % N) + N) % N;
  }

  wrapS(s: number) {
    const L = this.length;
    return ((s % L) + L) % L;
  }

  nearestIndex(x: number, y: number, z: number, hint: number, range = 40): number {
    let best = hint;
    let bd = Infinity;
    for (let k = -range; k <= range; k++) {
      const i = this.wrap(hint + k);
      const dx = this.px[i] - x;
      const dz = this.pz[i] - z;
      const dy = (this.py[i] - y) * 0.5;
      const d = dx * dx + dz * dz + dy * dy;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    return best;
  }

  project(x: number, y: number, z: number, hint: number, out: Projection, range = 40): Projection {
    const i = this.nearestIndex(x, y, z, hint, range);
    let f = ((x - this.px[i]) * this.tx[i] + (z - this.pz[i]) * this.tz[i]) / this.spacing;
    let j = i;
    if (f < 0) {
      j = this.wrap(i - 1);
      f += 1;
    }
    f = Math.min(1, Math.max(0, f));
    const k = this.wrap(j + 1);
    const cx = this.px[j] + (this.px[k] - this.px[j]) * f;
    const cz = this.pz[j] + (this.pz[k] - this.pz[j]) * f;
    const cy = this.py[j] + (this.py[k] - this.py[j]) * f;
    let nx = this.nx[j] + (this.nx[k] - this.nx[j]) * f;
    let nz = this.nz[j] + (this.nz[k] - this.nz[j]) * f;
    const nl = Math.hypot(nx, nz) || 1;
    nx /= nl;
    nz /= nl;
    out.idx = i;
    out.s = (j + f) * this.spacing;
    out.lateral = (x - cx) * nx + (z - cz) * nz;
    out.height = cy;
    out.tx = -nz;
    out.tz = nx;
    out.ty = this.ty[j];
    out.nx = nx;
    out.nz = nz;
    out.cx = cx;
    out.cz = cz;
    return out;
  }

  sample(s: number, lateral: number, out: THREE.Vector3): { yaw: number; idx: number } {
    const ss = this.wrapS(s) / this.spacing;
    const j = Math.floor(ss) % this.N;
    const f = ss - Math.floor(ss);
    const k = this.wrap(j + 1);
    const cx = this.px[j] + (this.px[k] - this.px[j]) * f;
    const cz = this.pz[j] + (this.pz[k] - this.pz[j]) * f;
    const cy = this.py[j] + (this.py[k] - this.py[j]) * f;
    const nx = this.nx[j] + (this.nx[k] - this.nx[j]) * f;
    const nz = this.nz[j] + (this.nz[k] - this.nz[j]) * f;
    out.set(cx + nx * lateral, cy, cz + nz * lateral);
    return { yaw: Math.atan2(this.tx[j], this.tz[j]), idx: j };
  }

  yawAt(s: number) {
    const j = Math.floor(this.wrapS(s) / this.spacing) % this.N;
    return Math.atan2(this.tx[j], this.tz[j]);
  }

  // zakręt na odcinku przed nami (rad)
  curvatureAhead(s: number, dist: number) {
    const a = this.yawAt(s);
    let maxd = 0;
    for (let d = 10; d <= dist; d += 10) {
      let diff = this.yawAt(s + d) - a;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      maxd = Math.max(maxd, Math.abs(diff));
    }
    return maxd;
  }
}
