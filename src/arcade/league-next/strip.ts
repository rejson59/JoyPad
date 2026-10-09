import * as THREE from 'three';

export interface OutlinePt {
  x: number;
  z: number;
  ox: number; // normalna zewnętrzna
  oz: number;
  len: number;
}

export interface ProfPt {
  s: number; // przesunięcie do wnętrza (ujemne = na zewnątrz)
  y: number;
  ns: number; // normalna w płaszczyźnie profilu
  ny: number;
  v: number;
}

// Zaokrąglony prostokąt (przeciwnie do ruchu wskazówek zegara), z dodatkowymi punktami podziału na liniach z=±b
export function roundedOutline(
  a: number,
  b: number,
  r: number,
  opts: { step?: number; arc?: number; breaks?: number[] } = {},
): OutlinePt[] {
  const step = opts.step ?? 3;
  const arcSeg = opts.arc ?? 14;
  const breaks = opts.breaks ?? [];
  const raw: { x: number; z: number; ox: number; oz: number }[] = [];

  const line = (x0: number, z0: number, x1: number, z1: number, ox: number, oz: number, brk?: number[]) => {
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n = Math.max(1, Math.ceil(len / step));
    const ts: number[] = [];
    for (let i = 0; i < n; i++) ts.push(i / n);
    if (brk) {
      for (const bx of brk) {
        const t = (bx - x0) / (x1 - x0);
        if (t > 0.0001 && t < 0.9999) ts.push(t);
      }
    }
    ts.sort((p, q) => p - q);
    for (const t of ts) raw.push({ x: x0 + (x1 - x0) * t, z: z0 + (z1 - z0) * t, ox, oz });
  };
  const arc = (cx: number, cz: number, a0: number) => {
    for (let i = 0; i < arcSeg; i++) {
      const t = a0 + (i / arcSeg) * (Math.PI / 2);
      raw.push({ x: cx + r * Math.cos(t), z: cz + r * Math.sin(t), ox: Math.cos(t), oz: Math.sin(t) });
    }
  };
  line(a, -(b - r), a, b - r, 1, 0);
  arc(a - r, b - r, 0);
  line(a - r, b, -(a - r), b, 0, 1, breaks);
  arc(-(a - r), b - r, Math.PI / 2);
  line(-a, b - r, -a, -(b - r), -1, 0);
  arc(-(a - r), -(b - r), Math.PI);
  line(-(a - r), -b, a - r, -b, 0, -1, breaks);
  arc(a - r, -(b - r), Math.PI * 1.5);
  raw.push({ ...raw[0] });

  const out: OutlinePt[] = [];
  let acc = 0;
  for (let i = 0; i < raw.length; i++) {
    if (i > 0) acc += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
    out.push({ ...raw[i], len: acc });
  }
  return out;
}

// Profil z listy punktów [s,y] – normalne skierowane (dy,-ds)
export function makeProfile(pts: [number, number][]): ProfPt[] {
  const res: ProfPt[] = [];
  let v = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[Math.min(pts.length - 1, i + 1)];
    const ds = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const l = Math.hypot(ds, dy) || 1;
    if (i > 0) v += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    res.push({ s: pts[i][0], y: pts[i][1], ns: dy / l, ny: -ds / l, v });
  }
  return res;
}

export function arcPoints(cs: number, cy: number, r: number, a0: number, a1: number, n: number): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n;
    out.push([cs + r * Math.cos(t), cy + r * Math.sin(t)]);
  }
  return out;
}

export interface StripOpts {
  uScale: number;
  vScale: number;
  skip?: (x: number, y: number, z: number) => boolean;
  color?: (x: number, y: number, z: number) => [number, number, number];
}

export function buildStrip(outline: OutlinePt[], prof: ProfPt[], o: StripOpts): THREE.BufferGeometry {
  const n = outline.length;
  const m = prof.length;
  const pos = new Float32Array(n * m * 3);
  const nor = new Float32Array(n * m * 3);
  const uv = new Float32Array(n * m * 2);
  const col = o.color ? new Float32Array(n * m * 3) : null;
  for (let i = 0; i < n; i++) {
    const p = outline[i];
    for (let j = 0; j < m; j++) {
      const q = prof[j];
      const k = i * m + j;
      const x = p.x - p.ox * q.s;
      const z = p.z - p.oz * q.s;
      pos[k * 3] = x;
      pos[k * 3 + 1] = q.y;
      pos[k * 3 + 2] = z;
      nor[k * 3] = -p.ox * q.ns;
      nor[k * 3 + 1] = q.ny;
      nor[k * 3 + 2] = -p.oz * q.ns;
      uv[k * 2] = p.len / o.uScale;
      uv[k * 2 + 1] = q.v / o.vScale;
      if (col && o.color) {
        const c = o.color(x, q.y, z);
        col[k * 3] = c[0];
        col[k * 3 + 1] = c[1];
        col[k * 3 + 2] = c[2];
      }
    }
  }
  const idx: number[] = [];
  const cells: number[][] = [];
  for (let i = 0; i < n - 1; i++) {
    for (let j = 0; j < m - 1; j++) {
      const a = i * m + j;
      const b = (i + 1) * m + j;
      const c = (i + 1) * m + j + 1;
      const d = i * m + j + 1;
      if (o.skip) {
        const cx = (pos[a * 3] + pos[b * 3] + pos[c * 3] + pos[d * 3]) / 4;
        const cy = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1] + pos[d * 3 + 1]) / 4;
        const cz = (pos[a * 3 + 2] + pos[b * 3 + 2] + pos[c * 3 + 2] + pos[d * 3 + 2]) / 4;
        if (o.skip(cx, cy, cz)) continue;
      }
      cells.push([a, b, c, d]);
    }
  }
  // kontrola nawinięcia
  let flip = false;
  for (const [a, b, c] of cells) {
    const e1x = pos[b * 3] - pos[a * 3], e1y = pos[b * 3 + 1] - pos[a * 3 + 1], e1z = pos[b * 3 + 2] - pos[a * 3 + 2];
    const e2x = pos[c * 3] - pos[a * 3], e2y = pos[c * 3 + 1] - pos[a * 3 + 1], e2z = pos[c * 3 + 2] - pos[a * 3 + 2];
    const fx = e1y * e2z - e1z * e2y, fy = e1z * e2x - e1x * e2z, fz = e1x * e2y - e1y * e2x;
    if (Math.abs(fx) + Math.abs(fy) + Math.abs(fz) < 1e-6) continue;
    flip = fx * nor[a * 3] + fy * nor[a * 3 + 1] + fz * nor[a * 3 + 2] < 0;
    break;
  }
  for (const [a, b, c, d] of cells) {
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.userData = { n, m };
  return g;
}

// Losowy punkt na powierzchni paska (bilinearnie)
export function samplePointOnStrip(g: THREE.BufferGeometry, rnd: () => number, out: THREE.Vector3, lift = 0.5) {
  const { n, m } = g.userData as { n: number; m: number };
  const pos = g.getAttribute('position') as THREE.BufferAttribute;
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const i = Math.floor(rnd() * (n - 1));
  const j = Math.floor(rnd() * (m - 1));
  const u = rnd();
  const v = rnd();
  const p = (ii: number, jj: number, comp: 'x' | 'y' | 'z') => pos[comp === 'x' ? 'getX' : comp === 'y' ? 'getY' : 'getZ'](ii * m + jj);
  const bl = (comp: 'x' | 'y' | 'z') =>
    (p(i, j, comp) * (1 - u) + p(i + 1, j, comp) * u) * (1 - v) + (p(i, j + 1, comp) * (1 - u) + p(i + 1, j + 1, comp) * u) * v;
  out.set(bl('x'), bl('y'), bl('z'));
  const k = i * m + j;
  out.x += nor.getX(k) * lift;
  out.y += nor.getY(k) * lift;
  out.z += nor.getZ(k) * lift;
  return out;
}
