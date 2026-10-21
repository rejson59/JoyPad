import * as THREE from 'three';
import { makeBoltTexture, makeGlowTexture, makeBeamTexture } from './textures';

let sharedTex: { bolt: THREE.Texture; glow: THREE.Texture; beam: THREE.Texture } | null = null;
function getTex() {
  if (!sharedTex) sharedTex = { bolt: makeBoltTexture(), glow: makeGlowTexture(128), beam: makeBeamTexture() };
  return sharedTex;
}

export class BoostPad {
  active = true;
  timer = 0;
  vis = 1;
  group = new THREE.Group();
  private ringMat: THREE.MeshBasicMaterial;
  private boltMat: THREE.MeshBasicMaterial;
  private glowMat: THREE.MeshBasicMaterial;
  private orb: THREE.Mesh | null = null;
  private orbMat: THREE.MeshStandardMaterial | null = null;
  private beam: THREE.Mesh | null = null;
  private beamMat: THREE.MeshBasicMaterial | null = null;
  private halo: THREE.Sprite | null = null;
  private haloMat: THREE.SpriteMaterial | null = null;
  private phase = Math.random() * 6;
  pop = 0;

  constructor(
    public x: number,
    public z: number,
    public big: boolean,
  ) {
    const t = getTex();
    this.group.position.set(x, 0, z);
    const rad = big ? 1.9 : 1.0;
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(rad, rad * 1.1, 0.07, 6),
      new THREE.MeshStandardMaterial({ color: 0x141a28, metalness: 0.85, roughness: 0.3 }),
    );
    base.position.y = 0.035;
    base.receiveShadow = true;
    this.group.add(base);
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 1.2, 0.25), transparent: true });
    const ring = new THREE.Mesh(new THREE.RingGeometry(rad * 0.66, rad * 0.9, 6), this.ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.075;
    this.group.add(ring);
    this.boltMat = new THREE.MeshBasicMaterial({
      map: t.bolt,
      color: new THREE.Color(3, 2.1, 0.5),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const bolt = new THREE.Mesh(new THREE.PlaneGeometry(rad * 1.1, rad * 1.1), this.boltMat);
    bolt.rotation.x = -Math.PI / 2;
    bolt.position.y = 0.085;
    this.group.add(bolt);
    this.glowMat = new THREE.MeshBasicMaterial({
      map: t.glow,
      color: new THREE.Color(1.6, 0.75, 0.15),
      transparent: true,
      opacity: big ? 0.8 : 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(rad * 3.6, rad * 3.6), this.glowMat);
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.06;
    this.group.add(glow);

    if (big) {
      this.orbMat = new THREE.MeshStandardMaterial({
        color: 0x331a00,
        emissive: new THREE.Color(1.0, 0.5, 0.1),
        emissiveIntensity: 3,
        metalness: 0.3,
        roughness: 0.4,
      });
      this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(0.66, 1), this.orbMat);
      this.orb.position.y = 1.6;
      this.group.add(this.orb);
      this.haloMat = new THREE.SpriteMaterial({
        map: t.glow,
        color: new THREE.Color(2.2, 1.0, 0.2),
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      this.halo = new THREE.Sprite(this.haloMat);
      this.halo.scale.setScalar(4.2);
      this.halo.position.y = 1.6;
      this.group.add(this.halo);
      this.beamMat = new THREE.MeshBasicMaterial({
        map: t.beam,
        color: new THREE.Color(1.4, 0.65, 0.12),
        transparent: true,
        opacity: 0.55,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      this.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1.35, 5.5, 24, 1, true), this.beamMat);
      this.beam.position.y = 2.8;
      this.group.add(this.beam);
    }
  }

  pickup() {
    this.active = false;
    this.timer = this.big ? 10 : 4;
  }

  reset() {
    this.active = true;
    this.timer = 0;
  }

  update(dt: number, time: number) {
    if (!this.active) {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.active = true;
        this.pop = 1;
      }
    }
    this.pop = Math.max(0, this.pop - dt * 2);
    this.vis += ((this.active ? 1 : 0) - this.vis) * Math.min(1, dt * (this.active ? 7 : 14));
    const pulse = 0.75 + 0.25 * Math.sin(time * 4 + this.phase);
    const v = this.vis;
    const k = v * (pulse + this.pop * 1.5);
    this.ringMat.color.setRGB(2.6 * k + 0.05, 1.2 * k + 0.04, 0.25 * k + 0.02);
    this.boltMat.opacity = v * (0.6 + 0.4 * pulse);
    this.glowMat.opacity = (this.big ? 0.8 : 0.5) * v * (0.7 + this.pop);
    if (this.orb && this.orbMat && this.halo && this.haloMat && this.beam && this.beamMat) {
      this.orb.visible = v > 0.03;
      this.orb.rotation.y = time * 1.6 + this.phase;
      this.orb.rotation.x = time * 0.9;
      this.orb.position.y = 1.6 + Math.sin(time * 2 + this.phase) * 0.18;
      this.orb.scale.setScalar(v * (1 + this.pop * 0.5));
      this.halo.position.y = this.orb.position.y;
      this.haloMat.opacity = 0.75 * v;
      this.beamMat.opacity = 0.5 * v * (0.8 + 0.2 * pulse);
      this.beam.visible = v > 0.03;
    }
  }
}
