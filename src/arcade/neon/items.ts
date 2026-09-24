import * as THREE from 'three';
import { Track } from './track';
import { Kart, ItemType } from './kart';
import { Particles } from './particles';
import { itemBoxTexture } from './textures';

interface Box {
  group: THREE.Group;
  pos: THREE.Vector3;
  active: boolean;
  timer: number;
}
interface Rocket {
  group: THREE.Group;
  s: number;
  lat: number;
  owner: Kart;
  target: Kart | null;
  pos: THREE.Vector3;
  life: number;
}
interface Mine {
  group: THREE.Group;
  light: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  owner: Kart;
  age: number;
}

export interface ItemEvents {
  onPickup(k: Kart): void;
  onExplosion(p: THREE.Vector3, victim: Kart | null): void;
  onUse(k: Kart, item: ItemType): void;
}

export class ItemManager {
  group = new THREE.Group();
  boxes: Box[] = [];
  rockets: Rocket[] = [];
  mines: Mine[] = [];
  private boxGeo = new THREE.BoxGeometry(1.7, 1.7, 1.7);
  private boxMat: THREE.MeshStandardMaterial;
  private coreMat: THREE.MeshBasicMaterial;
  private tmp = new THREE.Vector3();

  constructor(private track: Track, private fx: Particles, private smoke: Particles, private ev: ItemEvents) {
    const tex = itemBoxTexture();
    this.boxMat = new THREE.MeshStandardMaterial({
      map: tex,
      emissiveMap: tex,
      emissive: new THREE.Color(0.8, 0.8, 0.8),
      transparent: true,
      opacity: 0.8,
      roughness: 0.1,
      metalness: 0.3,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.0, 1.0, 1.0), toneMapped: false, wireframe: true });
    for (const s of track.itemRows) {
      for (const lat of [-7.5, -2.5, 2.5, 7.5]) {
        const p = new THREE.Vector3();
        track.sample(s, lat, p);
        p.y += 1.4;
        const g = new THREE.Group();
        const m = new THREE.Mesh(this.boxGeo, this.boxMat);
        g.add(m);
        const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.5), this.coreMat);
        g.add(core);
        g.position.copy(p);
        this.group.add(g);
        this.boxes.push({ group: g, pos: p, active: true, timer: 0 });
      }
    }
  }

  static rollItem(place: number, total: number): ItemType {
    const f = (place - 1) / Math.max(1, total - 1);
    const r = Math.random();
    if (f < 0.15) {
      if (r < 0.3) return 'boost';
      if (r < 0.75) return 'mine';
      return 'shield';
    }
    if (f < 0.6) {
      if (r < 0.28) return 'boost';
      if (r < 0.58) return 'rocket';
      if (r < 0.78) return 'mine';
      if (r < 0.9) return 'shield';
      return 'triple';
    }
    if (r < 0.35) return 'triple';
    if (r < 0.7) return 'rocket';
    if (r < 0.9) return 'boost';
    return 'shield';
  }

  use(k: Kart, karts: Kart[]) {
    if (!k.item || k.rolling > 0 || k.itemCooldown > 0) return;
    const item = k.item;
    k.itemCooldown = 0.35;
    switch (item) {
      case 'boost':
        k.startBoost(1.5, 0);
        k.item = null;
        break;
      case 'triple':
        k.startBoost(1.2, 0);
        k.itemCount--;
        if (k.itemCount <= 0) k.item = null;
        break;
      case 'shield':
        k.shieldTime = 7;
        k.item = null;
        break;
      case 'mine': {
        const f = k.forward(this.tmp);
        const p = k.pos.clone().addScaledVector(f, -3.2);
        p.y = k.pos.y;
        this.spawnMine(p, k);
        k.item = null;
        break;
      }
      case 'rocket': {
        const sorted = [...karts].sort((a, b) => b.progress - a.progress);
        const idx = sorted.indexOf(k);
        const target = idx > 0 ? sorted[idx - 1] : null;
        this.spawnRocket(k, target);
        k.item = null;
        break;
      }
    }
    this.ev.onUse(k, item);
  }

  private spawnMine(p: THREE.Vector3, owner: Kart) {
    const g = new THREE.Group();
    const metal = new THREE.MeshStandardMaterial({ color: 0x1a1a22, metalness: 0.9, roughness: 0.3 });
    const core = new THREE.Mesh(new THREE.SphereGeometry(0.55, 20, 14), metal);
    core.castShadow = true;
    g.add(core);
    const spikeGeo = new THREE.ConeGeometry(0.12, 0.45, 8);
    const dirs = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [0, 0, -1],
      [0.7, 0.7, 0],
      [-0.7, 0.7, 0],
      [0, 0.7, 0.7],
      [0, 0.7, -0.7],
    ];
    for (const d of dirs) {
      const s = new THREE.Mesh(spikeGeo, metal);
      const v = new THREE.Vector3(d[0], d[1], d[2]).normalize();
      s.position.copy(v).multiplyScalar(0.6);
      s.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), v);
      g.add(s);
    }
    const light = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.82, 0.04, 0.04), toneMapped: false });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.06, 8, 32), light);
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), light);
    eye.position.y = 0.58;
    g.add(eye);
    g.position.copy(p).add(new THREE.Vector3(0, 0.6, 0));
    this.group.add(g);
    this.mines.push({ group: g, light, pos: g.position, owner, age: 0 });
  }

  private spawnRocket(owner: Kart, target: Kart | null) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.22, 1.4, 16),
      new THREE.MeshStandardMaterial({ color: 0xdd2233, metalness: 0.6, roughness: 0.3 }),
    );
    body.rotation.x = Math.PI / 2;
    body.castShadow = true;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.8, roughness: 0.2 }));
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.95;
    g.add(nose);
    for (let i = 0; i < 4; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.5, 0.35), new THREE.MeshStandardMaterial({ color: 0x222222 }));
      fin.position.z = -0.55;
      fin.rotation.z = (i / 4) * Math.PI * 2;
      fin.translateY(0.3);
      g.add(fin);
    }
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.7, 0.7, 0.18), toneMapped: false }));
    glow.position.z = -0.8;
    g.add(glow);
    this.group.add(g);
    const s = owner.s + 3;
    const pos = new THREE.Vector3();
    this.track.sample(s, owner.proj.lateral, pos);
    this.rockets.push({ group: g, s, lat: owner.proj.lateral, owner, target, pos, life: 8 });
  }

  explode(p: THREE.Vector3, victim: Kart | null) {
    this.fx.burst(p, 70, 18, [4, 1.6, 0.4], 0.9, 0.7, { gravity: 6, drag: 2.5 });
    this.fx.burst(p, 40, 10, [3, 0.4, 2.5], 0.6, 0.5, { gravity: 2, drag: 3 });
    this.smoke.burst(p, 25, 5, [0.18, 0.16, 0.2], 2.5, 1.6, { gravity: -1.5, drag: 2, grow: 2.5 });
    this.ev.onExplosion(p, victim);
  }

  update(dt: number, t: number, karts: Kart[]) {
    // skrzynki
    const hue = (t * 0.2) % 1;
    this.coreMat.color.setHSL(hue, 1, 0.6).multiplyScalar(1.35);
    for (const b of this.boxes) {
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) {
          b.active = true;
          b.group.visible = true;
        }
        const sc = Math.max(0, 1 - b.timer / 0.3);
        b.group.scale.setScalar(b.timer < 0.3 ? sc : 0.001);
        continue;
      }
      b.group.scale.setScalar(Math.min(1, b.group.scale.x + dt * 3));
      b.group.rotation.set(t * 0.9, t * 1.3, t * 0.4);
      b.group.position.y = b.pos.y + Math.sin(t * 2 + b.pos.x) * 0.2;
      for (const k of karts) {
        const dx = k.pos.x - b.pos.x;
        const dz = k.pos.z - b.pos.z;
        const dy = k.pos.y + 0.8 - b.pos.y;
        if (dx * dx + dz * dz + dy * dy < 4.5 && !k.item && k.rolling <= 0) {
          b.active = false;
          b.timer = 3;
          b.group.visible = false;
          this.fx.burst(b.pos, 30, 9, [1.5, 2.5, 4], 0.5, 0.6, { drag: 3 });
          this.fx.burst(b.pos, 20, 7, [4, 1, 3], 0.4, 0.5, { drag: 3 });
          k.rolling = 1.3;
          this.ev.onPickup(k);
          break;
        }
      }
    }

    // rakiety
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const r = this.rockets[i];
      r.life -= dt;
      r.s += 78 * dt;
      if (r.target) {
        let ahead = r.target.progress - (r.owner.progress + (r.s - r.owner.s));
        ahead = r.target.s - r.s;
        if (ahead < -this.track.length / 2) ahead += this.track.length;
        if (ahead > this.track.length / 2) ahead -= this.track.length;
        if (ahead < 70) r.lat += (r.target.proj.lateral - r.lat) * Math.min(1, dt * 5);
      }
      const { yaw } = this.track.sample(r.s, r.lat, r.pos);
      r.pos.y += 0.8;
      r.group.position.copy(r.pos);
      r.group.rotation.set(0, yaw, Math.sin(t * 20) * 0.2);
      this.fx.emit(r.pos.x, r.pos.y, r.pos.z, (Math.random() - 0.5) * 2, Math.random(), (Math.random() - 0.5) * 2, 4, 1.8, 0.5, 0.7, 0.25, { drag: 2 });
      this.smoke.emit(r.pos.x, r.pos.y, r.pos.z, 0, 0.8, 0, 0.35, 0.33, 0.38, 1.0, 1.2, { drag: 1, grow: 2 });
      let hit: Kart | null = null;
      for (const k of karts) {
        if (k === r.owner && r.life > 7.6) continue;
        if (k.pos.distanceToSquared(r.pos) < 5.5) {
          hit = k;
          break;
        }
      }
      if (hit || r.life <= 0) {
        const took = hit ? hit.hit() : false;
        this.explode(r.pos.clone(), took ? hit : null);
        this.group.remove(r.group);
        this.rockets.splice(i, 1);
      }
    }

    // miny
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.age += dt;
      const blink = Math.sin(t * 10) > 0 ? 1.2 : 0.12;
      m.light.color.setRGB(blink, 0.15, 0.15);
      m.group.rotation.y += dt;

      if (m.age < 0.6) continue;
      let hit: Kart | null = null;
      for (const k of karts) {
        if (k.pos.distanceToSquared(m.pos) < 5.2) {
          hit = k;
          break;
        }
      }
      if (hit || m.age > 60) {
        const took = hit ? hit.hit() : false;
        this.explode(m.pos.clone(), took ? hit : null);
        this.group.remove(m.group);
        this.mines.splice(i, 1);
      }
    }
  }
}
