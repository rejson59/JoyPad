import * as THREE from 'three';

export interface EmitOpts {
  gravity?: number;
  drag?: number;
  grow?: number;
}

/** System cząsteczek na GPU (pozycja/kolor/rozmiar/alfa), symulacja na CPU */
export class Particles {
  points: THREE.Points;
  private max: number;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private alpha: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private baseSize: Float32Array;
  private grav: Float32Array;
  private drag: Float32Array;
  private grow: Float32Array;
  private baseCol: Float32Array;
  private cursor = 0;
  private geo: THREE.BufferGeometry;

  constructor(max: number, additive: boolean, pixelRatio: number) {
    this.max = max;
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.baseCol = new Float32Array(max * 3);
    this.size = new Float32Array(max);
    this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    this.grow = new Float32Array(max);
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -9999;
    this.geo = new THREE.BufferGeometry();
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uPR: { value: pixelRatio } },
      vertexShader: /* glsl */ `
        attribute float aSize; attribute float aAlpha; attribute vec3 color;
        uniform float uPR;
        varying vec3 vColor; varying float vAlpha;
        void main(){
          vColor = color; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = aSize * uPR * (420.0 / max(0.1, -mv.z));
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: additive
        ? /* glsl */ `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a = a*a;
          gl_FragColor = vec4(vColor * a * vAlpha, 1.0);
        }`
        : /* glsl */ `
        varying vec3 vColor; varying float vAlpha;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.1, d) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(this.geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 5;
  }

  emit(
    x: number,
    y: number,
    z: number,
    vx: number,
    vy: number,
    vz: number,
    r: number,
    g: number,
    b: number,
    size: number,
    life: number,
    o: EmitOpts = {},
  ) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.max;
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx;
    this.vel[i * 3 + 1] = vy;
    this.vel[i * 3 + 2] = vz;
    this.baseCol[i * 3] = r;
    this.baseCol[i * 3 + 1] = g;
    this.baseCol[i * 3 + 2] = b;
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.grav[i] = o.gravity ?? 0;
    this.drag[i] = o.drag ?? 1;
    this.grow[i] = o.grow ?? 0;
  }

  burst(p: THREE.Vector3, count: number, speed: number, color: [number, number, number], size: number, life: number, o: EmitOpts = {}) {
    for (let k = 0; k < count; k++) {
      const u = Math.random() * 2 - 1;
      const th = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - u * u);
      const sp = speed * (0.3 + Math.random() * 0.7);
      this.emit(
        p.x,
        p.y,
        p.z,
        s * Math.cos(th) * sp,
        Math.abs(u) * sp * 0.8 + speed * 0.2,
        s * Math.sin(th) * sp,
        color[0],
        color[1],
        color[2],
        size * (0.5 + Math.random()),
        life * (0.5 + Math.random() * 0.8),
        o,
      );
    }
  }

  update(dt: number) {
    const n = this.max;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) {
        if (this.alpha[i] !== 0) {
          this.alpha[i] = 0;
          this.pos[i * 3 + 1] = -9999;
        }
        continue;
      }
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      const dr = Math.exp(-this.drag[i] * dt);
      this.vel[i * 3] *= dr;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * dr - this.grav[i] * dt;
      this.vel[i * 3 + 2] *= dr;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = t < 0.7 ? t / 0.7 : 1;
      this.size[i] = this.baseSize[i] * (1 + this.grow[i] * (1 - t));
      this.col[i * 3] = this.baseCol[i * 3];
      this.col[i * 3 + 1] = this.baseCol[i * 3 + 1];
      this.col[i * 3 + 2] = this.baseCol[i * 3 + 2];
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.color.needsUpdate = true;
    this.geo.attributes.aSize.needsUpdate = true;
    this.geo.attributes.aAlpha.needsUpdate = true;
  }
}
