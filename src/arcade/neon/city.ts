import { AdditiveBlending, BackSide, BoxGeometry, BufferAttribute, BufferGeometry, Color, ConeGeometry, CylinderGeometry, DoubleSide, Euler, Float32BufferAttribute, Group, InstancedMesh, LineSegments, Matrix4, Mesh, MeshBasicMaterial, MeshPhysicalMaterial, MeshStandardMaterial, Object3D, PMREMGenerator, PlaneGeometry, Quaternion, Scene, ShaderMaterial, SphereGeometry, Texture, TorusGeometry, Vector3, WebGLRenderer } from 'three';
import { Track, ROAD_HALF } from './track';
import { GeoBuilder } from './geo';
import {
  facadeTexture,
  roadTextures,
  groundTexture,
  barrierTexture,
  chevronTexture,
  checkerTexture,
  billboardTexture,
  screenTexture,
  glowSprite,
} from './textures';

export const MOON_DIR = new Vector3(-0.45, 0.55, -0.7).normalize();

// Linear-light values are deliberately restrained; the original archive was
// tuned for an overexposed bloom pass and washed out mobile displays.
const NEON: [number, number, number][] = [
  [0, 1.45, 1.8],
  [1.8, 0.18, 1.45],
  [1.35, 0.22, 1.9],
  [1.9, 0.78, 0.12],
  [0.22, 1.8, 0.56],
  [1.9, 0.12, 0.34],
];

function rng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function makeSkyMaterial() {
  return new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uMoonDir: { value: MOON_DIR.clone() }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uMoonDir; uniform float uTime;
      varying vec3 vDir;
      float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float noise(vec2 p){ vec2 i=floor(p); vec2 f=fract(p); f=f*f*(3.0-2.0*f);
        float a=hash(vec3(i,0.0)); float b=hash(vec3(i+vec2(1,0),0.0)); float c=hash(vec3(i+vec2(0,1),0.0)); float d=hash(vec3(i+vec2(1,1),0.0));
        return mix(mix(a,b,f.x),mix(c,d,f.x),f.y); }
      void main(){
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 top = vec3(0.004,0.006,0.022);
        vec3 mid = vec3(0.035,0.018,0.09);
        vec3 hor = vec3(0.36,0.09,0.28);
        vec3 col = mix(mid, top, smoothstep(0.0,0.55,h));
        col = mix(hor, col, smoothstep(-0.02,0.22,h));
        col += vec3(0.55,0.22,0.06)*exp(-max(h,0.0)*14.0)*0.55;
        // chmury
        vec2 cp = d.xz/(h+0.25)*2.0 + vec2(uTime*0.01,0.0);
        float cl = noise(cp)*0.6 + noise(cp*2.3)*0.3 + noise(cp*5.1)*0.1;
        cl = smoothstep(0.45,0.9,cl) * smoothstep(0.0,0.25,h) * (1.0-smoothstep(0.5,0.9,h));
        col = mix(col, vec3(0.16,0.07,0.2), cl*0.7);
        // gwiazdy
        vec3 sp = floor(d*420.0);
        float st = hash(sp);
        float star = step(0.9972, st) * smoothstep(0.06,0.35,h) * (1.0-cl);
        float tw = 0.55+0.45*sin(uTime*2.5+st*120.0);
        col += vec3(star*tw*1.6);
        // księżyc
        float md = dot(d, normalize(uMoonDir));
        float disk = smoothstep(0.99955,0.99975,md);
        float crater = noise(d.xy*900.0)*0.25;
        col += vec3(1.0,0.97,0.92)*disk*(3.2-crater*3.0);
        col += vec3(0.35,0.4,0.7)*pow(max(md,0.0),300.0)*1.2;
        col += vec3(0.25,0.25,0.5)*pow(max(md,0.0),16.0)*0.18;
        if(h<0.0) col = mix(hor*0.4, vec3(0.02,0.01,0.03), smoothstep(0.0,-0.2,h));
        gl_FragColor = vec4(col,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}

export function makeEnvironment(renderer: WebGLRenderer) {
  const envScene = new Scene();
  const sky = new Mesh(new SphereGeometry(100, 32, 16), makeSkyMaterial());
  envScene.add(sky);
  // kolorowe panele imitujące neony miasta w odbiciach
  const r = rng(99);
  for (let i = 0; i < 40; i++) {
    const c = NEON[i % NEON.length];
    const m = new MeshBasicMaterial({ color: new Color(c[0] * 0.8, c[1] * 0.8, c[2] * 0.8), side: DoubleSide });
    const p = new Mesh(new PlaneGeometry(4 + r() * 8, 1 + r() * 12), m);
    const a = r() * Math.PI * 2;
    const dist = 40 + r() * 30;
    p.position.set(Math.cos(a) * dist, -5 + r() * 25, Math.sin(a) * dist);
    p.lookAt(0, p.position.y, 0);
    envScene.add(p);
  }
  // ciepłe okna
  for (let i = 0; i < 80; i++) {
    const m = new MeshBasicMaterial({ color: new Color(0.72, 0.52, 0.32), side: DoubleSide });
    const p = new Mesh(new PlaneGeometry(1.5, 1.5), m);
    const a = r() * Math.PI * 2;
    p.position.set(Math.cos(a) * 60, r() * 30, Math.sin(a) * 60);
    p.lookAt(0, p.position.y, 0);
    envScene.add(p);
  }
  const floor = new Mesh(new PlaneGeometry(400, 400), new MeshBasicMaterial({ color: 0x050308 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -10;
  envScene.add(floor);
  const pmrem = new PMREMGenerator(renderer);
  const rt = pmrem.fromScene(envScene, 0.02);
  pmrem.dispose();
  return rt.texture;
}

export interface CityOptions {
  rain: boolean;
}

export class City {
  group = new Group();
  sky: Mesh;
  skyMat: ShaderMaterial;
  startLights: MeshBasicMaterial[] = [];
  private barrierTex: Texture;
  private billboardMats: MeshBasicMaterial[] = [];
  private beaconMat: MeshBasicMaterial;
  private padMats: MeshBasicMaterial[] = [];
  private traffic!: InstancedMesh;
  private trafficData: { axis: number; c: number; y: number; p: number; v: number }[] = [];
  private rain?: LineSegments;
  private rainMat?: ShaderMaterial;
  private landmarkRings: Mesh[] = [];
  private arches: MeshBasicMaterial[] = [];
  private tmpM = new Matrix4();
  private tmpQ = new Quaternion();
  private tmpS = new Vector3();
  private tmpP = new Vector3();

  constructor(private track: Track, opts: CityOptions) {
    this.skyMat = makeSkyMaterial();
    this.sky = new Mesh(new SphereGeometry(3000, 48, 24), this.skyMat);
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);
    this.barrierTex = barrierTexture();
    this.beaconMat = new MeshBasicMaterial({ color: new Color(0.82, 0.04, 0.04), toneMapped: false });

    this.buildGround();
    this.buildRoad();
    this.buildBarriersAndSupports();
    this.buildLamps();
    this.buildArches();
    this.buildStartGate();
    this.buildBoostPads();
    this.buildBuildings();
    this.buildTraffic();
    if (opts.rain) this.buildRain();
  }

  private buildGround() {
    const t = groundTexture();
    t.repeat.set(5000 / 60, 5000 / 60);
    const m = new MeshStandardMaterial({ map: t, roughness: 0.55, metalness: 0.15, envMapIntensity: 0.6 });
    const g = new Mesh(new PlaneGeometry(5000, 5000), m);
    g.rotation.x = -Math.PI / 2;
    g.position.y = -0.05;
    g.receiveShadow = true;
    this.group.add(g);
  }

  private buildRoad() {
    const tr = this.track;
    const N = tr.N;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      const cx = tr.px[i];
      const cy = tr.py[i] + 0.04;
      const cz = tr.pz[i];
      const nx = tr.nx[i];
      const nz = tr.nz[i];
      pos.push(cx + nx * ROAD_HALF, cy, cz + nz * ROAD_HALF);
      pos.push(cx - nx * ROAD_HALF, cy, cz - nz * ROAD_HALF);
      const v = (k * tr.spacing) / 24;
      uv.push(0, v, 1, v);
      if (k < N) {
        const a = k * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const { map, rough } = roadTextures();
    const m = new MeshStandardMaterial({
      map,
      roughnessMap: rough,
      roughness: 0.75,
      metalness: 0.25,
      envMapIntensity: 1.4,
    });
    const road = new Mesh(g, m);
    road.receiveShadow = true;
    this.group.add(road);
  }

  private buildBarriersAndSupports() {
    const tr = this.track;
    const N = tr.N;
    const barrierMat = new MeshStandardMaterial({
      color: 0x1a1d26,
      metalness: 0.8,
      roughness: 0.3,
      emissive: 0xffffff,
      emissiveMap: this.barrierTex,
      emissiveIntensity: 0.72,
      side: DoubleSide,
    });
    const skirtMat = new MeshStandardMaterial({ color: 0x2a2c34, roughness: 0.85, metalness: 0.1, side: DoubleSide });
    const railMats = [
      new MeshBasicMaterial({ color: new Color(0.15, 1.15, 1.6), toneMapped: false, side: DoubleSide }),
      new MeshBasicMaterial({ color: new Color(1.35, 0.15, 1.0), toneMapped: false, side: DoubleSide }),
    ];
    for (const side of [1, -1]) {
      const bp: number[] = [];
      const buv: number[] = [];
      const sp: number[] = [];
      const rp: number[] = [];
      const idx: number[] = [];
      for (let k = 0; k <= N; k++) {
        const i = k % N;
        const off = side * (ROAD_HALF + 0.15);
        const x = tr.px[i] + tr.nx[i] * off;
        const z = tr.pz[i] + tr.nz[i] * off;
        const y = tr.py[i];
        bp.push(x, y, z, x, y + 1.1, z);
        const u = (k * tr.spacing) / 8;
        buv.push(u, 0, u, 1);
        sp.push(x, -0.5, z, x, y + 0.02, z);
        const off2 = side * (ROAD_HALF + 0.15);
        const rx = tr.px[i] + tr.nx[i] * off2;
        const rz = tr.pz[i] + tr.nz[i] * off2;
        rp.push(rx - tr.nx[i] * 0.12 * side, y + 1.12, rz - tr.nz[i] * 0.12 * side, rx + tr.nx[i] * 0.12 * side, y + 1.12, rz + tr.nz[i] * 0.12 * side);
        if (k < N) {
          const a = k * 2;
          idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
        }
      }
      const bg = new BufferGeometry();
      bg.setAttribute('position', new Float32BufferAttribute(bp, 3));
      bg.setAttribute('uv', new Float32BufferAttribute(buv, 2));
      bg.setIndex(idx);
      bg.computeVertexNormals();
      const b = new Mesh(bg, barrierMat);
      b.castShadow = true;
      this.group.add(b);

      const sg = new BufferGeometry();
      sg.setAttribute('position', new Float32BufferAttribute(sp, 3));
      sg.setIndex(idx);
      sg.computeVertexNormals();
      this.group.add(new Mesh(sg, skirtMat));

      const rg = new BufferGeometry();
      rg.setAttribute('position', new Float32BufferAttribute(rp, 3));
      rg.setIndex(idx);
      this.group.add(new Mesh(rg, railMats[side === 1 ? 0 : 1]));
    }

    // spód estakady
    const under: number[] = [];
    const uidx: number[] = [];
    for (let k = 0; k <= N; k++) {
      const i = k % N;
      const y = tr.py[i] - 0.6;
      under.push(tr.px[i] + tr.nx[i] * ROAD_HALF, y, tr.pz[i] + tr.nz[i] * ROAD_HALF);
      under.push(tr.px[i] - tr.nx[i] * ROAD_HALF, y, tr.pz[i] - tr.nz[i] * ROAD_HALF);
      if (k < N) {
        const a = k * 2;
        uidx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
      }
    }
    const ug = new BufferGeometry();
    ug.setAttribute('position', new Float32BufferAttribute(under, 3));
    ug.setIndex(uidx);
    ug.computeVertexNormals();
    this.group.add(new Mesh(ug, skirtMat));

    // filary
    const pillarData: Matrix4[] = [];
    for (let i = 0; i < N; i += 28) {
      const h = tr.py[i];
      if (h < 4) continue;
      for (const lat of [-7, 7]) {
        const x = tr.px[i] + tr.nx[i] * lat;
        const z = tr.pz[i] + tr.nz[i] * lat;
        const m = new Matrix4().compose(new Vector3(x, (h - 0.6) / 2, z), new Quaternion(), new Vector3(1.6, h - 0.6, 1.6));
        pillarData.push(m);
      }
    }
    if (pillarData.length) {
      const pm = new InstancedMesh(
        new CylinderGeometry(1, 1.15, 1, 16),
        new MeshStandardMaterial({ color: 0x3a3c46, roughness: 0.7, metalness: 0.2 }),
        pillarData.length,
      );
      pillarData.forEach((m, i) => pm.setMatrixAt(i, m));
      pm.castShadow = true;
      pm.receiveShadow = true;
      this.group.add(pm);
    }
  }

  private buildLamps() {
    const tr = this.track;
    const spacingIdx = Math.round(40 / tr.spacing);
    const poles: Matrix4[] = [];
    const heads: Matrix4[] = [];
    const pools: Matrix4[] = [];
    let alt = 1;
    for (let i = 0; i < tr.N; i += spacingIdx) {
      alt *= -1;
      const side = alt;
      const lat = side * (ROAD_HALF + 1.0);
      const x = tr.px[i] + tr.nx[i] * lat;
      const z = tr.pz[i] + tr.nz[i] * lat;
      const y = tr.py[i];
      const yaw = Math.atan2(tr.tx[i], tr.tz[i]);
      const q = new Quaternion().setFromEuler(new Euler(0, yaw, 0));
      poles.push(new Matrix4().compose(new Vector3(x, y + 4.5, z), q, new Vector3(0.18, 9, 0.18)));
      // ramię
      const ax = tr.px[i] + tr.nx[i] * (lat - side * 2.2);
      const az = tr.pz[i] + tr.nz[i] * (lat - side * 2.2);
      heads.push(new Matrix4().compose(new Vector3(ax, y + 8.9, az), q, new Vector3(4.6, 0.18, 0.6)));
      const px = tr.px[i] + tr.nx[i] * (lat - side * 5);
      const pz = tr.pz[i] + tr.nz[i] * (lat - side * 5);
      const pq = new Quaternion().setFromEuler(new Euler(-Math.PI / 2, 0, 0));
      pools.push(new Matrix4().compose(new Vector3(px, y + 0.07, pz), pq, new Vector3(16, 16, 1)));
    }
    const poleMesh = new InstancedMesh(
      new CylinderGeometry(1, 1, 1, 8),
      new MeshStandardMaterial({ color: 0x2a2d38, metalness: 0.9, roughness: 0.35 }),
      poles.length,
    );
    poles.forEach((m, i) => poleMesh.setMatrixAt(i, m));
    poleMesh.castShadow = true;
    this.group.add(poleMesh);
    const headMesh = new InstancedMesh(
      new BoxGeometry(1, 1, 1),
      new MeshBasicMaterial({ color: new Color(1.25, 1.1, 0.85), toneMapped: false }),
      heads.length,
    );
    heads.forEach((m, i) => headMesh.setMatrixAt(i, m));
    this.group.add(headMesh);
    const poolMesh = new InstancedMesh(
      new PlaneGeometry(1, 1),
      new MeshBasicMaterial({
        map: glowSprite(),
        color: new Color(0.55, 0.45, 0.32),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
      }),
      pools.length,
    );
    pools.forEach((m, i) => poolMesh.setMatrixAt(i, m));
    this.group.add(poolMesh);
  }

  private buildArches() {
    const tr = this.track;
    const step = Math.round(170 / tr.spacing);
    let k = 0;
    for (let i = step; i < tr.N - 40; i += step) {
      const c = NEON[k % NEON.length];
      k++;
      const mat = new MeshBasicMaterial({ color: new Color(c[0], c[1], c[2]), toneMapped: false });
      this.arches.push(mat);
      const g = new Group();
      const torus = new Mesh(new TorusGeometry(ROAD_HALF + 2.5, 0.3, 8, 64, Math.PI), mat);
      g.add(torus);
      const torus2 = new Mesh(new TorusGeometry(ROAD_HALF + 3.3, 0.12, 6, 64, Math.PI), mat);
      torus2.position.z = 0.8;
      g.add(torus2);
      g.position.set(tr.px[i], tr.py[i], tr.pz[i]);
      g.rotation.y = Math.atan2(tr.tx[i], tr.tz[i]);
      this.group.add(g);
    }
  }

  private buildStartGate() {
    const tr = this.track;
    const g = new Group();
    g.position.set(tr.px[0], tr.py[0], tr.pz[0]);
    g.rotation.y = Math.atan2(tr.tx[0], tr.tz[0]);
    const metal = new MeshStandardMaterial({ color: 0x22252e, metalness: 0.9, roughness: 0.25 });
    for (const s of [-1, 1]) {
      const p = new Mesh(new BoxGeometry(1.4, 12, 1.4), metal);
      p.position.set(s * (ROAD_HALF + 1.4), 6, 0);
      p.castShadow = true;
      g.add(p);
      const strip = new Mesh(
        new BoxGeometry(0.2, 11, 0.2),
        new MeshBasicMaterial({ color: new Color(0.15, 1.15, 1.6), toneMapped: false }),
      );
      strip.position.set(s * (ROAD_HALF + 1.4), 6, 0.75);
      g.add(strip);
    }
    const beam = new Mesh(new BoxGeometry((ROAD_HALF + 2.2) * 2, 3, 1.2), metal);
    beam.position.set(0, 12, 0);
    beam.castShadow = true;
    g.add(beam);
    const screenMat = new MeshBasicMaterial({ map: screenTexture(), toneMapped: false, color: new Color(0.85, 0.85, 0.85) });
    for (const s of [1, -1]) {
      const screen = new Mesh(new PlaneGeometry(16, 2.4), screenMat);
      screen.position.set(0, 12, s * 0.62);
      if (s === -1) screen.rotation.y = Math.PI;
      g.add(screen);
    }
    const chk = checkerTexture();
    chk.repeat.set(6, 1);
    const line = new Mesh(new PlaneGeometry(ROAD_HALF * 2, 2.5), new MeshStandardMaterial({ map: chk, roughness: 0.5 }));
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.07;
    line.receiveShadow = true;
    g.add(line);
    // światła startowe
    for (let i = 0; i < 5; i++) {
      const m = new MeshBasicMaterial({ color: new Color(0.1, 0.02, 0.02), toneMapped: false });
      this.startLights.push(m);
      const l = new Mesh(new SphereGeometry(0.5, 16, 12), m);
      l.position.set(-4 + i * 2, 10, -0.7);
      g.add(l);
    }
    this.group.add(g);
  }

  private buildBoostPads() {
    const tr = this.track;
    const tex = chevronTexture('#ffb000');
    const tmp = new Vector3();
    for (const pad of tr.boostPads) {
      const { yaw } = tr.sample(pad.s, pad.lateral, tmp);
      const m = new MeshBasicMaterial({
        map: tex,
        color: new Color(1.35, 0.8, 0.14),
        transparent: true,
        blending: AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      this.padMats.push(m);
      const g = new Group();
      g.position.set(tmp.x, tmp.y + 0.08, tmp.z);
      g.rotation.y = yaw;
      const plane = new Mesh(new PlaneGeometry(5, 8), m);
      plane.rotation.set(-Math.PI / 2, 0, Math.PI);
      g.add(plane);
      this.group.add(g);
    }
    // skocznia — znaczniki
    const rampTex = chevronTexture('#00f0ff');
    const { yaw } = tr.sample(tr.rampS + tr.rampLen * 0.5, 0, tmp);
    const rm = new MeshBasicMaterial({
      map: rampTex,
      color: new Color(0.16, 1.35, 1.8),
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      toneMapped: false,
    });
    this.padMats.push(rm);
    for (const lat of [-7, 0, 7]) {
      const p = new Vector3();
      tr.sample(tr.rampS + tr.rampLen * 0.6, lat, p);
      const g = new Group();
      g.position.set(p.x, p.y + 0.12, p.z);
      g.rotation.y = yaw;
      const plane = new Mesh(new PlaneGeometry(5, 10), rm);
      plane.rotation.set(-Math.PI / 2 + 0.12, 0, Math.PI);
      g.add(plane);
      this.group.add(g);
    }
  }

  private buildBuildings() {
    const tr = this.track;
    const r = rng(2024);
    const VARIANTS = 6;
    const facades = Array.from({ length: VARIANTS }, (_, i) => facadeTexture(i));
    const builders = Array.from({ length: VARIANTS }, () => new GeoBuilder());
    const roof = new GeoBuilder();
    const neon = new GeoBuilder(true);
    const beacons: Vector3[] = [];
    const bbCandidates: { x: number; z: number; w: number; d: number; h: number; tx: number; tz: number }[] = [];

    // uproszczone próbki toru do sprawdzania kolizji
    const samples: [number, number][] = [];
    for (let i = 0; i < tr.N; i += 6) samples.push([tr.px[i], tr.pz[i]]);
    const LANDMARK = { x: 20, z: -250 };

    const nearestTrack = (x: number, z: number) => {
      let bd = Infinity;
      let bx = 0;
      let bz = 0;
      for (const s of samples) {
        const dx = s[0] - x;
        const dz = s[1] - z;
        const d = dx * dx + dz * dz;
        if (d < bd) {
          bd = d;
          bx = s[0];
          bz = s[1];
        }
      }
      return { d: Math.sqrt(bd), x: bx, z: bz };
    };

    const SP = 58;
    for (let gx = -1500; gx <= 1400; gx += SP) {
      for (let gz = -1400; gz <= 1100; gz += SP) {
        const x = gx + (r() - 0.5) * 12;
        const z = gz + (r() - 0.5) * 12;
        const w = 20 + r() * 22;
        const d = 20 + r() * 22;
        const near = nearestTrack(x, z);
        const half = Math.max(w, d) * 0.72;
        if (near.d < ROAD_HALF + 10 + half) continue;
        if (Math.hypot(x - LANDMARK.x, z - LANDMARK.z) < 70) continue;
        if (r() < 0.06) continue; // place
        const centerDist = Math.hypot(x + 60, z + 150);
        let h = 25 + r() * 70;
        if (r() < 0.22) h += 80 + r() * 160;
        if (centerDist > 900) h *= 0.8;
        if (near.d < 60) h = Math.max(h, 40);
        const v = Math.floor(r() * VARIANTS);
        const b = builders[v];
        const uOff = Math.floor(r() * 8) * 0.5;
        const vOff = Math.floor(r() * 4) * 0.25;
        const type = r();
        if (type < 0.55) {
          b.box(x, 0, z, w, h, d, { uOff, vOff });
          roof.box(x, h, z, w, 0.01, d, { walls: false, top: true });
        } else if (type < 0.85) {
          const h1 = h * (0.45 + r() * 0.2);
          b.box(x, 0, z, w, h1, d, { uOff, vOff });
          roof.box(x, h1, z, w, 0.01, d, { walls: false, top: true });
          const w2 = w * (0.55 + r() * 0.25);
          const d2 = d * (0.55 + r() * 0.25);
          b.box(x, h1, z, w2, h - h1, d2, { uOff: uOff + 0.25, vOff });
          roof.box(x, h, z, w2, 0.01, d2, { walls: false, top: true });
          if (r() < 0.5) {
            const c = NEON[Math.floor(r() * NEON.length)];
            neon.box(x, h1 - 0.8, z, w + 0.3, 0.5, d + 0.3, { color: c });
          }
        } else {
          // smukła wieża z iglicą
          const w2 = Math.min(w, d) * 0.8;
          b.box(x, 0, z, w2, h, w2, { uOff, vOff });
          roof.box(x, h, z, w2, 0.01, w2, { walls: false, top: true });
          roof.box(x, h, z, w2 * 0.5, 6, w2 * 0.5, { top: true });
          roof.box(x, h + 6, z, 0.8, 30, 0.8, { top: true });
          beacons.push(new Vector3(x, h + 36.5, z));
        }
        if (h > 110) beacons.push(new Vector3(x + w * 0.35, h + 1.2, z + d * 0.35));
        // neonowe krawędzie
        if (near.d < 420 && r() < 0.45) {
          const c = NEON[Math.floor(r() * NEON.length)];
          const hh = type < 0.55 ? h : h * 0.5;
          const ww = type < 0.85 ? w : Math.min(w, d) * 0.8;
          const dd = type < 0.85 ? d : Math.min(w, d) * 0.8;
          for (const sx of [-1, 1])
            for (const sz of [-1, 1]) neon.box(x + (sx * ww) / 2, 0, z + (sz * dd) / 2, 0.45, hh, 0.45, { color: c });
          neon.box(x, hh - 0.4, z, ww + 0.5, 0.45, dd + 0.5, { color: c });
        }
        // poziome pasy LED
        if (near.d < 300 && r() < 0.25) {
          const c = NEON[Math.floor(r() * NEON.length)];
          const n = 2 + Math.floor(r() * 4);
          for (let k = 1; k <= n; k++) {
            const yy = (Math.min(h, 80) / (n + 1)) * k;
            neon.box(x, yy, z, w + 0.25, 0.25, d + 0.25, { color: c });
          }
        }
        if (near.d < ROAD_HALF + 10 + half + 45 && h > 35) bbCandidates.push({ x, z, w, d, h, tx: near.x, tz: near.z });
      }
    }

    facades.forEach((f, i) => {
      const mat = new MeshStandardMaterial({
        map: f.map,
        emissiveMap: f.emissive,
        emissive: new Color(0.72, 0.68, 0.64),
        roughnessMap: f.rough,
        roughness: 1,
        metalness: 0.55,
        envMapIntensity: 1.1,
      });
      const mesh = new Mesh(builders[i].build(), mat);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    });
    const roofMesh = new Mesh(roof.build(), new MeshStandardMaterial({ color: 0x1b1c22, roughness: 0.8, metalness: 0.3 }));
    roofMesh.receiveShadow = true;
    roofMesh.castShadow = true;
    this.group.add(roofMesh);
    const neonMesh = new Mesh(neon.build(), new MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
    this.group.add(neonMesh);

    // światła ostrzegawcze
    const bm = new InstancedMesh(new SphereGeometry(0.9, 8, 6), this.beaconMat, beacons.length);
    beacons.forEach((p, i) => {
      this.tmpM.makeTranslation(p.x, p.y, p.z);
      bm.setMatrixAt(i, this.tmpM);
    });
    this.group.add(bm);

    // billboardy
    const chosen = bbCandidates.filter((_, i) => i % 3 === 0).slice(0, 34);
    chosen.forEach((c, i) => {
      const mat = new MeshBasicMaterial({
        map: billboardTexture(i),
        transparent: true,
        toneMapped: false,
        color: new Color(0.9, 0.9, 0.9),
        side: DoubleSide,
        depthWrite: false,
      });
      this.billboardMats.push(mat);
      const dx = c.tx - c.x;
      const dz = c.tz - c.z;
      const bw = 26;
      const bh = 13;
      const plane = new Mesh(new PlaneGeometry(bw, bh), mat);
      const y = Math.min(c.h - bh / 2 - 2, 18 + (i % 4) * 8);
      if (Math.abs(dx) > Math.abs(dz)) {
        const s = Math.sign(dx);
        plane.position.set(c.x + s * (c.w / 2 + 0.8), y, c.z);
        plane.rotation.y = (s * Math.PI) / 2;
      } else {
        const s = Math.sign(dz);
        plane.position.set(c.x, y, c.z + s * (c.d / 2 + 0.8));
        plane.rotation.y = s > 0 ? 0 : Math.PI;
      }
      this.group.add(plane);
    });

    // centralna wieża-landmark
    const lm = new Group();
    lm.position.set(LANDMARK.x, 0, LANDMARK.z);
    const towerMat = new MeshPhysicalMaterial({
      color: 0x0a0f1c,
      metalness: 1,
      roughness: 0.12,
      clearcoat: 1,
      envMapIntensity: 1.8,
    });
    const tower = new Mesh(new CylinderGeometry(10, 26, 380, 6, 1), towerMat);
    tower.position.y = 190;
    tower.castShadow = true;
    lm.add(tower);
    const spire = new Mesh(new ConeGeometry(5, 90, 6), towerMat);
    spire.position.y = 425;
    lm.add(spire);
    const tip = new Mesh(new SphereGeometry(2.5, 16, 12), this.beaconMat);
    tip.position.y = 472;
    lm.add(tip);
    for (let i = 0; i < 6; i++) {
      const c = NEON[i % NEON.length];
      const ring = new Mesh(
        new TorusGeometry(34 - i * 3.2, 0.9, 8, 96),
        new MeshBasicMaterial({ color: new Color(c[0], c[1], c[2]), toneMapped: false }),
      );
      ring.position.y = 60 + i * 50;
      ring.rotation.x = Math.PI / 2;
      lm.add(ring);
      this.landmarkRings.push(ring);
    }
    // krawędzie wieży
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const edge = new Mesh(
        new BoxGeometry(0.6, 380, 0.6),
        new MeshBasicMaterial({ color: new Color(0.16, 1.05, 1.45), toneMapped: false }),
      );
      edge.position.set(Math.cos(a) * 18.5, 190, Math.sin(a) * 18.5);
      edge.lookAt(Math.cos(a) * 10, 380, Math.sin(a) * 10);
      edge.rotateX(Math.PI / 2);
      lm.add(edge);
    }
    this.group.add(lm);
  }

  private buildTraffic() {
    const COUNT = 260;
    const r = rng(555);
    const geo = new BoxGeometry(1.8, 0.7, 4.5);
    const mat = new MeshBasicMaterial({ toneMapped: false });
    this.traffic = new InstancedMesh(geo, mat, COUNT);
    this.traffic.frustumCulled = false;
    const col = new Color();
    for (let i = 0; i < COUNT; i++) {
      const axis = r() < 0.5 ? 0 : 1;
      const lane = Math.floor(r() * 16);
      const c = -900 + lane * 110 + (r() - 0.5) * 10;
      const y = 45 + Math.floor(r() * 5) * 22;
      const v = (r() < 0.5 ? -1 : 1) * (25 + r() * 35);
      this.trafficData.push({ axis, c, y, p: -1400 + r() * 2800, v });
      if (v > 0) col.setRGB(1.35, 1.25, 1.1);
      else col.setRGB(1.35, 0.12, 0.1);
      if (r() < 0.15) col.setRGB(0.14, 1.1, 1.55);
      this.traffic.setColorAt(i, col);
    }
    this.group.add(this.traffic);
  }

  private buildRain() {
    const COUNT = 5000;
    const base = new Float32Array(COUNT * 2 * 3);
    const end = new Float32Array(COUNT * 2);
    const r = rng(77);
    for (let i = 0; i < COUNT; i++) {
      const x = r();
      const y = r();
      const z = r();
      for (let k = 0; k < 2; k++) {
        base.set([x, y, z], (i * 2 + k) * 3);
        end[i * 2 + k] = k;
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(base, 3));
    g.setAttribute('aEnd', new BufferAttribute(end, 1));
    this.rainMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { uCam: { value: new Vector3() }, uTime: { value: 0 }, uVel: { value: new Vector3() } },
      vertexShader: /* glsl */ `
        attribute float aEnd;
        uniform vec3 uCam; uniform float uTime; uniform vec3 uVel;
        varying float vA;
        void main(){
          vec3 size = vec3(70.0, 40.0, 70.0);
          vec3 p = position;
          p.y = fract(p.y - uTime * 0.9);
          vec3 off = fract(p - uCam / size) - 0.5;
          vec3 wp = uCam + off * size;
          vec3 fall = vec3(0.12, -1.0, 0.05) * 32.0 - uVel * 0.6;
          wp += normalize(fall) * aEnd * 0.9;
          vA = 0.25 * (1.0 - smoothstep(20.0, 35.0, length(off.xz * size.xz)));
          gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){ gl_FragColor = vec4(0.7, 0.8, 1.0, vA); }`,
    });
    this.rain = new LineSegments(g, this.rainMat);
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
  }

  update(t: number, dt: number, camPos: Vector3, camVel: Vector3) {
    this.sky.position.copy(camPos);
    this.skyMat.uniforms.uTime.value = t;
    this.barrierTex.offset.x = -t * 0.6;
    // migające światła
    const blink = Math.sin(t * 3) > 0.3 ? 1.2 : 0.12;
    this.beaconMat.color.setRGB(blink, blink * 0.05, blink * 0.05);
    // billboardy — lekkie migotanie hologramów
    this.billboardMats.forEach((m, i) => {
      const f = Math.sin(t * 13 + i * 7.1) * Math.sin(t * 3.3 + i);
      const glitch = f > 0.97 ? 0.2 : 1;
      m.opacity = (0.85 + 0.15 * Math.sin(t * 2 + i)) * glitch;
    });
    this.padMats.forEach((m, i) => {
      m.opacity = 0.6 + 0.4 * Math.sin(t * 8 + i);
    });
    this.arches.forEach((m, i) => {
      const c = NEON[i % NEON.length];
      const k = 0.8 + 0.3 * Math.sin(t * 2 + i);
      m.color.setRGB(c[0] * k, c[1] * k, c[2] * k);
    });
    this.landmarkRings.forEach((ring, i) => {
      ring.rotation.z = t * (0.2 + i * 0.07) * (i % 2 ? 1 : -1);
      ring.position.y = 60 + i * 50 + Math.sin(t * 0.8 + i) * 3;
    });
    // ruch powietrzny
    for (let i = 0; i < this.trafficData.length; i++) {
      const d = this.trafficData[i];
      d.p += d.v * dt;
      if (d.p > 1500) d.p -= 3000;
      if (d.p < -1500) d.p += 3000;
      if (d.axis === 0) {
        this.tmpP.set(d.p, d.y, d.c);
        this.tmpQ.setFromAxisAngle(Object3D.DEFAULT_UP, Math.PI / 2);
      } else {
        this.tmpP.set(d.c, d.y, d.p);
        this.tmpQ.identity();
      }
      this.tmpS.set(1, 1, 1);
      this.tmpM.compose(this.tmpP, this.tmpQ, this.tmpS);
      this.traffic.setMatrixAt(i, this.tmpM);
    }
    this.traffic.instanceMatrix.needsUpdate = true;
    if (this.rainMat) {
      this.rainMat.uniforms.uCam.value.copy(camPos);
      this.rainMat.uniforms.uTime.value = t;
      this.rainMat.uniforms.uVel.value.copy(camVel);
    }
  }
}
