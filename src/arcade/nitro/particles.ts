import * as THREE from 'three';

export interface EmitOpts {
  x: number;
  y: number;
  z: number;
  vx?: number;
  vy?: number;
  vz?: number;
  life: number;
  size0: number;
  size1?: number;
  r: number;
  g: number;
  b: number;
  a0?: number;
  a1?: number;
  gravity?: number;
  drag?: number;
  type?: number; // 0 miękka, 1 konfetti, 2 iskra
  spin?: number;
}

export class Particles {
  points: THREE.Points;
  private cap: number;
  private px: Float32Array;
  private py: Float32Array;
  private pz: Float32Array;
  private vx: Float32Array;
  private vy: Float32Array;
  private vz: Float32Array;
  private age: Float32Array;
  private life: Float32Array;
  private s0: Float32Array;
  private s1: Float32Array;
  private cr: Float32Array;
  private cg: Float32Array;
  private cb: Float32Array;
  private a0: Float32Array;
  private a1: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private rot: Float32Array;
  private spin: Float32Array;
  private typ: Float32Array;
  private posA: THREE.BufferAttribute;
  private colA: THREE.BufferAttribute;
  private sizeA: THREE.BufferAttribute;
  private rotA: THREE.BufferAttribute;
  private typeA: THREE.BufferAttribute;
  private next = 0;
  material: THREE.ShaderMaterial;

  constructor(cap: number, additive: boolean) {
    this.cap = cap;
    const mk = () => new Float32Array(cap);
    this.px = mk(); this.py = mk(); this.pz = mk();
    this.vx = mk(); this.vy = mk(); this.vz = mk();
    this.age = mk(); this.life = mk();
    this.s0 = mk(); this.s1 = mk();
    this.cr = mk(); this.cg = mk(); this.cb = mk();
    this.a0 = mk(); this.a1 = mk();
    this.grav = mk(); this.drag = mk();
    this.rot = mk(); this.spin = mk(); this.typ = mk();
    this.age.fill(1);
    this.life.fill(0.0001);
    const g = new THREE.BufferGeometry();
    this.posA = new THREE.BufferAttribute(new Float32Array(cap * 3), 3);
    this.colA = new THREE.BufferAttribute(new Float32Array(cap * 4), 4);
    this.sizeA = new THREE.BufferAttribute(new Float32Array(cap), 1);
    this.rotA = new THREE.BufferAttribute(new Float32Array(cap), 1);
    this.typeA = new THREE.BufferAttribute(new Float32Array(cap), 1);
    this.posA.setUsage(THREE.DynamicDrawUsage);
    this.colA.setUsage(THREE.DynamicDrawUsage);
    this.sizeA.setUsage(THREE.DynamicDrawUsage);
    this.rotA.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posA);
    g.setAttribute('aColor', this.colA);
    g.setAttribute('aSize', this.sizeA);
    g.setAttribute('aRot', this.rotA);
    g.setAttribute('aType', this.typeA);
    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uScale: { value: 800 } },
      vertexShader: `
        attribute vec4 aColor; attribute float aSize; attribute float aRot; attribute float aType;
        varying vec4 vColor; varying float vRot; varying float vType; uniform float uScale;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(aSize * uScale / max(0.1, -mv.z), 420.0);
          vColor = aColor; vRot = aRot; vType = aType;
        }`,
      fragmentShader: `
        varying vec4 vColor; varying float vRot; varying float vType;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float a = 0.0;
          if (vType < 0.5) {
            float d = length(p) * 2.0; a = 1.0 - smoothstep(0.0, 1.0, d); a *= a;
          } else if (vType < 1.5) {
            float c = cos(vRot), s = sin(vRot);
            vec2 q = mat2(c, -s, s, c) * p;
            float flip = abs(cos(vRot * 1.7));
            a = step(abs(q.x), 0.22) * step(abs(q.y), 0.08 + 0.32 * flip);
          } else {
            float d = length(p) * 2.0; a = pow(max(1.0 - d, 0.0), 2.2);
          }
          gl_FragColor = vec4(vColor.rgb, vColor.a * a);
          if (gl_FragColor.a < 0.004) discard;
        }`,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 10 : 9;
  }

  emit(o: EmitOpts) {
    const i = this.next;
    this.next = (this.next + 1) % this.cap;
    this.px[i] = o.x; this.py[i] = o.y; this.pz[i] = o.z;
    this.vx[i] = o.vx ?? 0; this.vy[i] = o.vy ?? 0; this.vz[i] = o.vz ?? 0;
    this.age[i] = 0;
    this.life[i] = o.life;
    this.s0[i] = o.size0;
    this.s1[i] = o.size1 ?? o.size0;
    this.cr[i] = o.r; this.cg[i] = o.g; this.cb[i] = o.b;
    this.a0[i] = o.a0 ?? 1;
    this.a1[i] = o.a1 ?? 0;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 0;
    this.typ[i] = o.type ?? 0;
    this.rot[i] = Math.random() * 6.28;
    this.spin[i] = (o.spin ?? 0) * (Math.random() < 0.5 ? -1 : 1);
  }

  update(dt: number, scale: number) {
    this.material.uniforms.uScale.value = scale;
    const pa = this.posA.array as Float32Array;
    const ca = this.colA.array as Float32Array;
    const sa = this.sizeA.array as Float32Array;
    const ra = this.rotA.array as Float32Array;
    const ta = this.typeA.array as Float32Array;
    for (let i = 0; i < this.cap; i++) {
      if (this.age[i] >= this.life[i]) {
        sa[i] = 0;
        ca[i * 4 + 3] = 0;
        continue;
      }
      this.age[i] += dt;
      const t = Math.min(1, this.age[i] / this.life[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vx[i] *= dr;
      this.vy[i] = this.vy[i] * dr - this.grav[i] * dt;
      this.vz[i] *= dr;
      this.px[i] += this.vx[i] * dt;
      this.py[i] += this.vy[i] * dt;
      this.pz[i] += this.vz[i] * dt;
      if (this.py[i] < 0.02 && this.typ[i] === 1) {
        this.py[i] = 0.02;
        this.vy[i] = 0;
        this.vx[i] *= 0.9;
        this.vz[i] *= 0.9;
        this.spin[i] *= 0.5;
      }
      this.rot[i] += this.spin[i] * dt;
      pa[i * 3] = this.px[i];
      pa[i * 3 + 1] = this.py[i];
      pa[i * 3 + 2] = this.pz[i];
      sa[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * t;
      ca[i * 4] = this.cr[i];
      ca[i * 4 + 1] = this.cg[i];
      ca[i * 4 + 2] = this.cb[i];
      ca[i * 4 + 3] = this.a0[i] + (this.a1[i] - this.a0[i]) * t;
      ra[i] = this.rot[i];
      ta[i] = this.typ[i];
    }
    this.posA.needsUpdate = true;
    this.colA.needsUpdate = true;
    this.sizeA.needsUpdate = true;
    this.rotA.needsUpdate = true;
    this.typeA.needsUpdate = true;
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }
}

// Wstęga (ślad)
export class Trail {
  mesh: THREE.Mesh;
  private pts: THREE.Vector3[] = [];
  private pos: Float32Array;
  private col: Float32Array;
  private posA: THREE.BufferAttribute;
  private colA: THREE.BufferAttribute;
  color = new THREE.Color(1, 1, 1);
  private tmpD = new THREE.Vector3();
  private tmpS = new THREE.Vector3();
  private tmpC = new THREE.Vector3();

  constructor(private n: number, private width: number) {
    this.pos = new Float32Array(n * 2 * 3);
    this.col = new Float32Array(n * 2 * 3);
    const g = new THREE.BufferGeometry();
    this.posA = new THREE.BufferAttribute(this.pos, 3);
    this.colA = new THREE.BufferAttribute(this.col, 3);
    this.posA.setUsage(THREE.DynamicDrawUsage);
    this.colA.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posA);
    g.setAttribute('color', this.colA);
    const idx: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    g.setIndex(idx);
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    );
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 8;
  }

  reset() {
    this.pts.length = 0;
  }

  push(p: THREE.Vector3) {
    this.pts.unshift(p.clone());
    if (this.pts.length > this.n) this.pts.pop();
  }

  update(cam: THREE.Vector3, intensity: number) {
    const n = this.n;
    const m = this.pts.length;
    this.mesh.visible = m > 2 && intensity > 0.01;
    if (!this.mesh.visible) return;
    for (let i = 0; i < n; i++) {
      const p = this.pts[Math.min(i, m - 1)];
      const pn = this.pts[Math.min(i + 1, m - 1)];
      const pp = this.pts[Math.max(i - 1, 0)];
      this.tmpD.copy(pp).sub(pn);
      if (this.tmpD.lengthSq() < 1e-8) this.tmpD.set(0, 0, 1);
      this.tmpC.copy(p).sub(cam);
      this.tmpS.crossVectors(this.tmpD, this.tmpC).normalize();
      const t = i / (n - 1);
      const w = this.width * (1 - t * 0.85) * (i < m ? 1 : 0);
      const f = Math.pow(1 - t, 1.6) * intensity * (i < m ? 1 : 0);
      const k = i * 2;
      this.pos[k * 3] = p.x + this.tmpS.x * w;
      this.pos[k * 3 + 1] = p.y + this.tmpS.y * w;
      this.pos[k * 3 + 2] = p.z + this.tmpS.z * w;
      this.pos[k * 3 + 3] = p.x - this.tmpS.x * w;
      this.pos[k * 3 + 4] = p.y - this.tmpS.y * w;
      this.pos[k * 3 + 5] = p.z - this.tmpS.z * w;
      for (let s = 0; s < 2; s++) {
        this.col[(k + s) * 3] = this.color.r * f;
        this.col[(k + s) * 3 + 1] = this.color.g * f;
        this.col[(k + s) * 3 + 2] = this.color.b * f;
      }
    }
    this.posA.needsUpdate = true;
    this.colA.needsUpdate = true;
  }

  dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
