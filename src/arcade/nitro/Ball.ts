import * as THREE from 'three';
import { arenaSdf, arenaNormal } from './arena';
import { GRAV, BALL_R } from './constants';
import { makeBallTextures, makeGlowTexture } from './textures';

const V = THREE.Vector3;
const _n = new V();
const _r = new V();
const _vc = new V();
const _slip = new V();
const _t = new V();
const _q = new THREE.Quaternion();

export interface BallEvents {
  onBounce?: (strength: number, p: THREE.Vector3, n: THREE.Vector3) => void;
}

const sstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export class Ball {
  pos = new V(0, BALL_R + 0.02, 0);
  vel = new V();
  quat = new THREE.Quaternion();
  angVel = new V();
  prevPos = new V();
  prevQuat = new THREE.Quaternion();
  mesh: THREE.Mesh;
  shell: THREE.Mesh;
  halo: THREE.Sprite;
  light: THREE.PointLight;
  group = new THREE.Group();
  lastTouchTeam = -1;
  lastTouchCar = -1;
  prevTouchCar = -1;
  prevTouchTeam = -1;
  touchTime = 0;
  hitFlash = 0;
  colorCur = new THREE.Color(0.5, 0.85, 1.0);
  colorTarget = new THREE.Color(0.5, 0.85, 1.0);
  private emissiveMat: THREE.MeshStandardMaterial;
  private haloMat: THREE.SpriteMaterial;
  private shellMat: THREE.ShaderMaterial;
  onGround = false;

  constructor() {
    const tx = makeBallTextures();
    this.emissiveMat = new THREE.MeshStandardMaterial({
      map: tx.map,
      emissiveMap: tx.emissive,
      emissive: new THREE.Color(0.5, 0.85, 1.0),
      emissiveIntensity: 2.2,
      bumpMap: tx.bump,
      bumpScale: 3.5,
      metalness: 0.75,
      roughness: 0.28,
      envMapIntensity: 1.7,
    });
    this.mesh = new THREE.Mesh(new THREE.SphereGeometry(BALL_R, 64, 48), this.emissiveMat);
    this.mesh.castShadow = true;
    this.shellMat = new THREE.ShaderMaterial({
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(0.5, 0.85, 1) },
        uPower: { value: 2.6 },
        uIntensity: { value: 1.4 },
      },
      vertexShader: `varying vec3 vN; varying vec3 vV;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uPower; uniform float uIntensity; varying vec3 vN; varying vec3 vV;
        void main(){ float f = pow(1.0 - clamp(dot(normalize(vN), normalize(vV)),0.0,1.0), uPower); gl_FragColor = vec4(uColor*f*uIntensity, f); }`,
    });
    this.shell = new THREE.Mesh(new THREE.SphereGeometry(BALL_R * 1.07, 40, 28), this.shellMat);
    this.haloMat = new THREE.SpriteMaterial({
      map: makeGlowTexture(128),
      color: new THREE.Color(0.5, 0.85, 1),
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.halo = new THREE.Sprite(this.haloMat);
    this.halo.renderOrder = 6;
    this.halo.scale.setScalar(6);
    this.light = new THREE.PointLight(0x88ccff, 14, 16, 2);
    this.group.add(this.mesh, this.shell, this.halo, this.light);
  }

  reset() {
    this.pos.set(0, BALL_R + 0.03, 0);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.quat.identity();
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
    this.lastTouchCar = -1;
    this.lastTouchTeam = -1;
    this.prevTouchCar = -1;
    this.prevTouchTeam = -1;
    this.colorTarget.set(0.55, 0.85, 1.0);
    this.hitFlash = 0;
  }

  savePrev() {
    this.prevPos.copy(this.pos);
    this.prevQuat.copy(this.quat);
  }

  step(dt: number, ev: BallEvents) {
    this.vel.y -= GRAV * dt;
    this.vel.multiplyScalar(Math.exp(-0.03 * dt));
    const sp = this.vel.length();
    if (sp > 60) this.vel.multiplyScalar(60 / sp);
    this.pos.addScaledVector(this.vel, dt);
    this.angVel.multiplyScalar(Math.exp(-0.04 * dt));
    const w = this.angVel.length();
    if (w > 1e-5) {
      _t.copy(this.angVel).multiplyScalar(1 / w);
      _q.setFromAxisAngle(_t, w * dt);
      this.quat.premultiply(_q).normalize();
    }
    this.collide(dt, ev);
    if (!isFinite(this.pos.x + this.pos.y + this.pos.z)) this.reset();
  }

  private collide(dt: number, ev: BallEvents) {
    let contact = false;
    this.onGround = false;
    for (let i = 0; i < 3; i++) {
      const s = arenaSdf(this.pos.x, this.pos.y, this.pos.z) + BALL_R;
      if (s <= 0) break;
      arenaNormal(this.pos.x, this.pos.y, this.pos.z, _n);
      this.pos.addScaledVector(_n, s);
      contact = true;
      if (_n.y > 0.7) this.onGround = true;
      const vn = this.vel.dot(_n);
      if (vn < 0) {
        const e = 0.6 * sstep(0.5, 2.5, -vn);
        const jn = -(1 + e) * vn;
        this.vel.addScaledVector(_n, jn);
        _r.copy(_n).multiplyScalar(-BALL_R);
        _vc.copy(this.angVel).cross(_r).add(this.vel);
        _slip.copy(_vc).addScaledVector(_n, -_vc.dot(_n));
        const sl = _slip.length();
        if (sl > 1e-4) {
          const jt = Math.min(0.3 * jn, sl / 3.5);
          _slip.multiplyScalar(1 / sl);
          this.vel.addScaledVector(_slip, -jt);
          _t.copy(_r).cross(_slip).multiplyScalar(-jt / (0.4 * BALL_R * BALL_R));
          this.angVel.add(_t);
        }
        if (-vn > 2) ev.onBounce?.(-vn, this.pos, _n);
      }
    }
    if (contact) {
      arenaNormal(this.pos.x, this.pos.y, this.pos.z, _n);
      // toczenie
      const vn = this.vel.dot(_n);
      _t.copy(this.vel).addScaledVector(_n, -vn);
      _vc.crossVectors(_n, _t).multiplyScalar(1 / BALL_R);
      const wn = this.angVel.dot(_n);
      _slip.copy(this.angVel).addScaledVector(_n, -wn);
      const k = 1 - Math.exp(-5 * dt);
      this.angVel.addScaledVector(_vc.sub(_slip), k);
      // opory toczenia
      if (Math.abs(vn) < 1.2) this.vel.addScaledVector(_t, -(1 - Math.exp(-0.12 * dt)));
    }
  }

  updateVisual(alpha: number, dt: number, time: number) {
    this.group.position.lerpVectors(this.prevPos, this.pos, alpha);
    _q.slerpQuaternions(this.prevQuat, this.quat, alpha);
    this.mesh.quaternion.copy(_q);
    this.colorCur.lerp(this.colorTarget, 1 - Math.exp(-6 * dt));
    this.hitFlash = Math.max(0, this.hitFlash - dt * 2.2);
    const speed = this.vel.length();
    const sp = Math.min(1, speed / 40);
    const pulse = 0.9 + 0.1 * Math.sin(time * 4);
    this.emissiveMat.emissive.copy(this.colorCur);
    this.emissiveMat.emissiveIntensity = (1.8 + sp * 2.2 + this.hitFlash * 5) * pulse;
    this.haloMat.color.copy(this.colorCur);
    this.haloMat.opacity = 0.3 + sp * 0.45 + this.hitFlash * 0.5;
    this.halo.scale.setScalar(5 + sp * 3 + this.hitFlash * 4);
    this.shellMat.uniforms.uColor.value.copy(this.colorCur);
    this.shellMat.uniforms.uIntensity.value = 1.0 + sp * 1.4 + this.hitFlash * 2;
    this.light.color.copy(this.colorCur);
    this.light.intensity = 10 + sp * 20 + this.hitFlash * 30;
  }
}
