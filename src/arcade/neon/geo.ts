import * as THREE from 'three';

type V3 = [number, number, number];

/** Szybki builder geometrii — łączy tysiące prostopadłościanów w jeden draw call */
export class GeoBuilder {
  pos: number[] = [];
  nor: number[] = [];
  uv: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  useColor: boolean;

  constructor(useColor = false) {
    this.useColor = useColor;
  }

  quad(a: V3, b: V3, c: V3, d: V3, n: V3, uvs: number[], color?: V3) {
    const base = this.pos.length / 3;
    this.pos.push(...a, ...b, ...c, ...d);
    for (let i = 0; i < 4; i++) this.nor.push(...n);
    this.uv.push(...uvs);
    if (this.useColor) {
      const cc = color || [1, 1, 1];
      for (let i = 0; i < 4; i++) this.col.push(...cc);
    }
    this.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  box(
    cx: number,
    y0: number,
    cz: number,
    w: number,
    h: number,
    d: number,
    o: { uScale?: number; vScale?: number; uOff?: number; vOff?: number; color?: V3; top?: boolean; walls?: boolean } = {},
  ) {
    const us = o.uScale ?? 16;
    const vs = o.vScale ?? 32;
    const uo = o.uOff ?? 0;
    const vo = o.vOff ?? 0;
    const x0 = cx - w / 2;
    const x1 = cx + w / 2;
    const z0 = cz - d / 2;
    const z1 = cz + d / 2;
    const y1 = y0 + h;
    const vt = vo + h / vs;
    const col = o.color;
    if (o.walls !== false) {
      const uw = w / us;
      const ud = d / us;
      this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1], [uo, vo, uo + uw, vo, uo + uw, vt, uo, vt], col);
      this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1], [uo + 0.37, vo, uo + 0.37 + uw, vo, uo + 0.37 + uw, vt, uo + 0.37, vt], col);
      this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0], [uo + 0.61, vo, uo + 0.61 + ud, vo, uo + 0.61 + ud, vt, uo + 0.61, vt], col);
      this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0], [uo + 0.13, vo, uo + 0.13 + ud, vo, uo + 0.13 + ud, vt, uo + 0.13, vt], col);
    }
    if (o.top) {
      this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0], [0, 0, w / 20, 0, w / 20, d / 20, 0, d / 20], col);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.useColor) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}
