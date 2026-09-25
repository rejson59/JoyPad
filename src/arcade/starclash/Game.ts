// @ts-nocheck
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { Sfx } from './audio';

export type ShipClass = 'interceptor' | 'fighter' | 'heavy';
export const CLASSES = {
  interceptor: { name: 'Interceptor „Wraith”', hp: 70, shield: 45, speed: 95, boost: 175, turn: 2.3, dmg: 7, rate: 0.085, missiles: 6, scale: 0.85, radius: 5, price: 2500 },
  fighter: { name: 'Myśliwiec „Valkyrie”', hp: 110, shield: 65, speed: 75, boost: 145, turn: 1.75, dmg: 10, rate: 0.12, missiles: 8, scale: 1, radius: 6, price: 0 },
  heavy: { name: 'Niszczyciel „Titan”', hp: 230, shield: 110, speed: 55, boost: 105, turn: 1.15, dmg: 17, rate: 0.17, missiles: 12, scale: 1.5, radius: 9, price: 6000 },
};
export interface Upgrades { guns: number; armor: number; engine: number; }

const LASER_SPEED = 650;
const ARENA = 1600;
const CALLSIGNS = ['Viper', 'Ghost', 'Raven', 'Nomad', 'Specter', 'Hawk', 'Orion', 'Blaze', 'Kestrel', 'Onyx', 'Havoc', 'Reaper', 'Talon', 'Cobra', 'Jackal', 'Zephyr'];

const V = () => new THREE.Vector3();
const _v1 = V(), _v2 = V(), _v3 = V(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

function glowTexture(inner = 'rgba(255,255,255,1)', mid = 'rgba(255,255,255,0.35)') {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d'); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner); gr.addColorStop(0.2, mid); gr.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function smokeTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  for (let i = 0; i < 40; i++) {
    const x = 64 + rand(-25, 25), y = 64 + rand(-25, 25), r = rand(15, 35);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.12)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  }
  return new THREE.CanvasTexture(c);
}
function panelTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#b8bcc4'; g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 260; i++) {
    const s = 180 + Math.random() * 60 | 0; g.fillStyle = `rgb(${s},${s},${s + 6})`;
    g.fillRect(rand(0, 512), rand(0, 512), rand(10, 120), rand(10, 80));
  }
  g.strokeStyle = 'rgba(40,40,50,0.6)'; g.lineWidth = 1.5;
  for (let i = 0; i < 90; i++) { g.strokeRect(rand(0, 512) | 0, rand(0, 512) | 0, rand(20, 140) | 0, rand(20, 100) | 0); }
  for (let i = 0; i < 400; i++) { g.fillStyle = 'rgba(30,30,30,0.5)'; g.fillRect(rand(0, 512), rand(0, 512), 2, 2); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function planetTexture() {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 512; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, 512);
  const cols = ['#3b2a4a', '#8a5a3c', '#c79a6a', '#6d4a3a', '#d8b890', '#7a4f36', '#b98a5a', '#4a3040'];
  cols.forEach((cl, i) => grd.addColorStop(i / (cols.length - 1), cl));
  g.fillStyle = grd; g.fillRect(0, 0, 1024, 512);
  for (let i = 0; i < 1400; i++) {
    const y = rand(0, 512); g.fillStyle = `rgba(${rand(80, 230) | 0},${rand(50, 160) | 0},${rand(30, 110) | 0},0.08)`;
    g.fillRect(0, y, 1024, rand(1, 8));
  }
  for (let i = 0; i < 30; i++) {
    g.fillStyle = 'rgba(255,230,200,0.06)'; g.beginPath();
    g.ellipse(rand(0, 1024), rand(100, 400), rand(20, 80), rand(6, 20), 0, 0, 7); g.fill();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---------------- Particles ----------------
class Particles {
  constructor(scene, max, map, blending) {
    this.max = max; this.i = 0;
    this.pos = new Float32Array(max * 3); this.col = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.s0 = new Float32Array(max); this.s1 = new Float32Array(max);
    this.c0 = new Float32Array(max * 3); this.c1 = new Float32Array(max * 3); this.drag = new Float32Array(max); this.a0 = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('size', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = geo;
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, scale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float scale; void main(){ vC=color; vA=alpha; vec4 mv=modelViewMatrix*vec4(position,1.);
        gl_PointSize = size*scale/max(-mv.z,0.1); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t=texture2D(map,gl_PointCoord); if(vA<=0.001) discard; gl_FragColor=vec4(vC*t.rgb, t.a*vA); }`,
      transparent: true, depthWrite: false, blending,
    });
    this.points = new THREE.Points(geo, mat); this.points.frustumCulled = false; scene.add(this.points);
  }
  spawn(p, v, life, s0, s1, c0, c1, drag = 0, a0 = 1) {
    const i = this.i; this.i = (this.i + 1) % this.max; const k = i * 3;
    this.pos[k] = p.x; this.pos[k + 1] = p.y; this.pos[k + 2] = p.z;
    this.vel[k] = v.x; this.vel[k + 1] = v.y; this.vel[k + 2] = v.z;
    this.life[i] = life; this.maxLife[i] = life; this.s0[i] = s0; this.s1[i] = s1; this.drag[i] = drag; this.a0[i] = a0;
    this.c0[k] = c0[0]; this.c0[k + 1] = c0[1]; this.c0[k + 2] = c0[2];
    this.c1[k] = c1[0]; this.c1[k + 1] = c1[1]; this.c1[k + 2] = c1[2];
  }
  update(dt) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const k = i * 3;
      const t = 1 - Math.max(this.life[i], 0) / this.maxLife[i];
      const d = Math.exp(-this.drag[i] * dt);
      this.vel[k] *= d; this.vel[k + 1] *= d; this.vel[k + 2] *= d;
      this.pos[k] += this.vel[k] * dt; this.pos[k + 1] += this.vel[k + 1] * dt; this.pos[k + 2] += this.vel[k + 2] * dt;
      this.size[i] = this.s0[i] + (this.s1[i] - this.s0[i]) * Math.sqrt(t);
      const ct = Math.min(1, t * 1.6);
      this.col[k] = this.c0[k] + (this.c1[k] - this.c0[k]) * ct;
      this.col[k + 1] = this.c0[k + 1] + (this.c1[k + 1] - this.c0[k + 1]) * ct;
      this.col[k + 2] = this.c0[k + 2] + (this.c1[k + 2] - this.c0[k + 2]) * ct;
      this.alpha[i] = this.a0[i] * (t < 0.08 ? t / 0.08 : 1 - (t - 0.08) / 0.92);
    }
    const a = this.geo.attributes;
    a.position.needsUpdate = a.color.needsUpdate = a.size.needsUpdate = a.alpha.needsUpdate = true;
  }
  clear() { this.life.fill(0); }
}

// ---------------- Game ----------------
export class Game {
  [key: string]: any;
  constructor(container: HTMLElement, opts: { lowFx?: boolean } = {}) {
    this.container = container;
    this.lowFx = !!opts.lowFx;
    this.padMode = false;
    this.humanShips = [];
    this.readCtrl = null;
    this.onShipFx = null;
    this.alive = true;
    this.sfx = new Sfx();
    const r = this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(devicePixelRatio, this.lowFx ? 1.25 : 1.75));
    r.setSize(innerWidth, innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(r.domElement);
    this.overlay = document.createElement('canvas');
    Object.assign(this.overlay.style, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    container.appendChild(this.overlay); this.octx = this.overlay.getContext('2d');

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.3, 12000);
    this.scene.add(this.camera);
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    if (!this.lowFx) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.9, 0.55, 0.85);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
    }

    this.glowTex = glowTexture(); this.smokeTex = smokeTexture(); this.panelTex = panelTexture();
    this.buildEnvironment();
    this.fire = new Particles(this.scene, 7000, this.glowTex, THREE.AdditiveBlending);
    this.smoke = new Particles(this.scene, 2500, this.smokeTex, THREE.NormalBlending);

    this.lightPool = [];
    for (let i = 0; i < 6; i++) { const l = new THREE.PointLight(0xffaa66, 0, 250, 1.6); this.scene.add(l); this.lightPool.push({ l, t: 0, max: 0, dur: 1 }); }

    this.laserGeo = new THREE.BoxGeometry(0.28, 0.28, 7);
    this.laserMats = [new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 5) }), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 0.8, 0.3) })];
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 64);

    this.ships = []; this.lasers = []; this.missiles = []; this.debris = []; this.rings = [];
    this.mode = 'hangar'; this.time = 0; this.shake = 0; this.paused = false;
    this.keys = {}; this.cursor = { x: 0, y: 0 }; this.mouseDown = false;
    this.hitMarker = 0; this.dmgDirs = []; this.killfeed = []; this.messages = [];
    this.onHud = null; this.onEnd = null; this.onPause = null; this.onShipFx = null;
    this.hudTimer = 0;
    this.bindInput();
    this.resize();
    this.setHangarShip('fighter');
    this.last = performance.now();
    this.loop();
  }

  resize = () => {
    const w = this.container.clientWidth || innerWidth, h = this.container.clientHeight || innerHeight;
    this.cw = w; this.ch = h;
    this.renderer.setSize(w, h); this.composer.setSize(w, h);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    const pr = Math.min(devicePixelRatio, 2);
    this.overlay.width = w * pr; this.overlay.height = h * pr; this.overlay.style.width = w + 'px'; this.overlay.style.height = h + 'px';
    this.octx.setTransform(pr, 0, 0, pr, 0, 0);
    this.fire && (this.fire.points.material.uniforms.scale.value = h * 0.9, this.smoke.points.material.uniforms.scale.value = h * 0.9);
  };

  // ---------- Environment ----------
  buildEnvironment() {
    this.sunDir = new THREE.Vector3(0.6, 0.35, -0.7).normalize();
    const sky = this.sky = new THREE.Group(); this.scene.add(sky);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { sunDir: { value: this.sunDir } },
      vertexShader: `varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.); }`,
      fragmentShader: `varying vec3 vDir; uniform vec3 sunDir;
      float h(vec3 p){ p=fract(p*0.3183099+.1); p*=17.; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float n(vec3 x){ vec3 i=floor(x), f=fract(x); f=f*f*(3.-2.*f);
        return mix(mix(mix(h(i),h(i+vec3(1,0,0)),f.x),mix(h(i+vec3(0,1,0)),h(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(h(i+vec3(0,0,1)),h(i+vec3(1,0,1)),f.x),mix(h(i+vec3(0,1,1)),h(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 p){ float v=0., a=.5; for(int i=0;i<6;i++){ v+=a*n(p); p*=2.03; a*=.5; } return v; }
      void main(){ vec3 d=normalize(vDir);
        float n1=fbm(d*2.2+vec3(3.)); float n2=fbm(d*4.5+vec3(n1*2.));
        float band = exp(-pow(d.y*2.2 + sin(d.x*3.)*0.3, 2.));
        vec3 col=vec3(0.002,0.003,0.008);
        col+=vec3(0.30,0.07,0.38)*pow(n1,3.2)*1.3*band;
        col+=vec3(0.04,0.20,0.42)*pow(n2,4.)*1.4*(0.4+band);
        col+=vec3(0.5,0.18,0.08)*pow(fbm(d*8.),6.)*band*1.5;
        float dark = smoothstep(0.45,0.7,fbm(d*6.+11.)); col*=1.-dark*0.7*band;
        float s=max(dot(d,sunDir),0.);
        col+=vec3(1.,.75,.5)*pow(s,900.)*30.+vec3(1.,.55,.25)*pow(s,40.)*0.35+vec3(.6,.3,.2)*pow(s,6.)*0.05;
        gl_FragColor=vec4(col,1.); }`,
    });
    sky.add(new THREE.Mesh(new THREE.SphereGeometry(6000, 64, 32), skyMat));
    // stars
    const N = 9000, sp = new Float32Array(N * 3), sc = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) {
      const v = new THREE.Vector3().randomDirection().multiplyScalar(5500); sp.set([v.x, v.y, v.z], i * 3);
      const b = Math.pow(Math.random(), 6) * 3 + 0.25; const t = Math.random();
      const c = t < 0.2 ? [1, 0.75, 0.6] : t < 0.5 ? [0.7, 0.8, 1] : [1, 1, 1];
      sc.set([c[0] * b, c[1] * b, c[2] * b], i * 3);
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
    sky.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })));
    // sun flare
    const sunAnchor = new THREE.Object3D(); sunAnchor.position.copy(this.sunDir).multiplyScalar(5000); sky.add(sunAnchor);
    const flare = new Lensflare();
    const hex = glowTexture('rgba(255,255,255,0.6)', 'rgba(255,220,180,0.15)');
    flare.addElement(new LensflareElement(glowTexture('rgba(255,250,240,1)', 'rgba(255,200,140,0.5)'), 700, 0, new THREE.Color(1, 0.9, 0.8)));
    [[60, 0.6], [80, 0.7], [120, 0.9], [70, 1]].forEach(([s, d]) => flare.addElement(new LensflareElement(hex, s, d, new THREE.Color(0.5, 0.7, 1))));
    sunAnchor.add(flare);

    // env map
    const pm = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), skyMat));
    this.scene.environment = pm.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.9;

    // lights
    const sun = this.sun = new THREE.DirectionalLight(0xfff0dd, 4.2);
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc2 = sun.shadow.camera; sc2.left = sc2.bottom = -90; sc2.right = sc2.top = 90; sc2.near = 1; sc2.far = 1200;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.05;
    this.scene.add(sun, sun.target);
    this.scene.add(new THREE.HemisphereLight(0x3a4a80, 0x301810, 0.35));

    // planet
    const planet = new THREE.Mesh(new THREE.SphereGeometry(900, 96, 64), new THREE.MeshStandardMaterial({ map: planetTexture(), roughness: 0.9, metalness: 0 }));
    planet.position.set(-2200, -700, -3200); planet.rotation.z = 0.35; this.planet = planet; this.scene.add(planet);
    const atm = new THREE.Mesh(new THREE.SphereGeometry(960, 64, 48), new THREE.ShaderMaterial({
      side: THREE.BackSide, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
      uniforms: { sunDir: { value: this.sunDir } },
      vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN=normalize(mat3(modelMatrix)*normal); vec4 w=modelMatrix*vec4(position,1.); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
      fragmentShader: `uniform vec3 sunDir; varying vec3 vN; varying vec3 vW; void main(){ vec3 v=normalize(cameraPosition-vW);
        float f=pow(1.-abs(dot(v,vN)),1.)*0.0; float rim=pow(max(dot(-vN,v),0.),3.); float l=clamp(dot(-vN,sunDir)*0.8+0.3,0.,1.);
        gl_FragColor=vec4(vec3(1.,.6,.35)*rim*l*1.6+f,1.); }`,
    }));
    planet.add(atm);
    // rings
    const ringTex = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 8; const g = c.getContext('2d');
      for (let x = 0; x < 512; x++) { const a = Math.random() * 0.5 + 0.2 * Math.sin(x * 0.1) + 0.2; g.fillStyle = `rgba(220,190,150,${clamp(a, 0, 1) * (x < 30 ? x / 30 : 1)})`; g.fillRect(x, 0, 1, 8); }
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const rg = new THREE.RingGeometry(1150, 1900, 128, 1);
    const pos = rg.attributes.position, uv = rg.attributes.uv;
    for (let i = 0; i < pos.count; i++) { const l = Math.hypot(pos.getX(i), pos.getY(i)); uv.setXY(i, (l - 1150) / 750, 0.5); }
    const pr = new THREE.Mesh(rg, new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, roughness: 1, depthWrite: false }));
    pr.rotation.x = Math.PI / 2.3; planet.add(pr);

    // asteroids
    this.asteroids = [];
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x6b625a, roughness: 0.95, metalness: 0.05, flatShading: true });
    const geos = [];
    for (let g = 0; g < 6; g++) {
      const geo = new THREE.IcosahedronGeometry(1, 3); const p = geo.attributes.position;
      const ph = [rand(0, 9), rand(0, 9), rand(0, 9), rand(0, 9)];
      for (let i = 0; i < p.count; i++) {
        _v1.fromBufferAttribute(p, i);
        const n = 1 + 0.25 * Math.sin(_v1.x * 2.1 + ph[0]) * Math.cos(_v1.y * 1.7 + ph[1]) + 0.12 * Math.sin(_v1.z * 5 + ph[2]) + 0.06 * Math.sin((_v1.x + _v1.y) * 9 + ph[3]);
        _v1.multiplyScalar(n); _v1.y *= 0.8; p.setXYZ(i, _v1.x, _v1.y, _v1.z);
      }
      geo.computeVertexNormals(); geos.push(geo);
    }
    for (let i = 0; i < 140; i++) {
      const r = Math.pow(Math.random(), 2.5) * 55 + 4;
      const m = new THREE.Mesh(geos[i % 6], rockMat); m.scale.set(r, r * rand(0.7, 1.1), r * rand(0.8, 1.3));
      const a = rand(0, Math.PI * 2), d = rand(150, ARENA);
      m.position.set(Math.cos(a) * d, rand(-250, 250), Math.sin(a) * d);
      if (Math.abs(m.position.z) > 550 && Math.abs(m.position.x) < 200) m.position.x += 400;
      m.rotation.set(rand(0, 6), rand(0, 6), rand(0, 6)); m.castShadow = m.receiveShadow = true;
      m.userData = { r: r * 1.05, spin: new THREE.Vector3(rand(-0.1, 0.1), rand(-0.1, 0.1), rand(-0.1, 0.1)) };
      this.scene.add(m); this.asteroids.push(m);
    }
    // space dust
    const DN = 1200, dp = new Float32Array(DN * 3); for (let i = 0; i < DN * 3; i++) dp[i] = rand(-120, 120);
    const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
    this.dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.35, color: 0x8899aa, transparent: true, opacity: 0.6, depthWrite: false }));
    this.dust.frustumCulled = false; this.scene.add(this.dust);
  }

  // ---------- Ships ----------
  buildShipModel(cls: ShipClass, team: number) {
    const g = new THREE.Group();
    const accent = team === 0 ? new THREE.Color(0x2f7fff) : new THREE.Color(0xe0321f);
    const hullMat = new THREE.MeshStandardMaterial({ map: this.panelTex, color: team === 0 ? 0xc9ced8 : 0x8a8580, metalness: 0.85, roughness: 0.38, roughnessMap: this.panelTex });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22252c, metalness: 0.9, roughness: 0.5 });
    const accMat = new THREE.MeshStandardMaterial({ color: accent, metalness: 0.6, roughness: 0.3, emissive: accent, emissiveIntensity: 0.25 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a1a30, metalness: 0.2, roughness: 0.05, clearcoat: 1, emissive: 0x0a3060, emissiveIntensity: 0.6 });
    const add = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const L = cls === 'interceptor' ? 10 : cls === 'heavy' ? 9 : 8;
    const body = new THREE.CylinderGeometry(cls === 'heavy' ? 1.8 : 1.15, 0.35, L, 10).rotateX(Math.PI / 2);
    add(body, hullMat).scale.set(1, 0.7, 1);
    add(new THREE.ConeGeometry(0.35, 2.2, 10).rotateX(-Math.PI / 2), darkMat, 0, 0, -L / 2 - 1.1).scale.set(1, 0.7, 1);
    add(new THREE.SphereGeometry(0.75, 20, 12), glass, 0, 0.55, -L * 0.12).scale.set(0.85, 0.6, 2.1);
    add(new THREE.BoxGeometry(0.2, 0.08, L * 0.8), accMat, 0, 0.78, 0.8);
    // wings
    const ws = new THREE.Shape();
    if (cls === 'interceptor') { ws.moveTo(0, -1.5); ws.lineTo(6.5, 3.2); ws.lineTo(6.8, 4.2); ws.lineTo(0, 3.5); }
    else if (cls === 'heavy') { ws.moveTo(0, -2.5); ws.lineTo(5, 0); ws.lineTo(5.5, 4); ws.lineTo(0, 4.5); }
    else { ws.moveTo(0, -1); ws.lineTo(5.5, 1.8); ws.lineTo(5.8, 3.3); ws.lineTo(0, 3.2); }
    const wg = new THREE.ExtrudeGeometry(ws, { depth: 0.22, bevelEnabled: true, bevelSize: 0.08, bevelThickness: 0.06, bevelSegments: 1 }).rotateX(Math.PI / 2);
    const wtip = [];
    for (const s of [1, -1]) {
      const w = add(wg, hullMat, 0.6 * s, 0.05, 0); w.scale.x = s;
      if (cls === 'interceptor') w.rotation.z = -0.12 * s;
      const stripe = add(new THREE.BoxGeometry(2.4, 0.25, 0.3), accMat, (cls === 'heavy' ? 3.2 : 3.4) * s, 0.12, 2.2); stripe.rotation.y = -0.4 * s;
      const tipX = cls === 'heavy' ? 5.8 : cls === 'interceptor' ? 7.1 : 6.3;
      add(new THREE.CylinderGeometry(0.14, 0.14, 3.2, 8).rotateX(Math.PI / 2), darkMat, tipX * s, 0.05, cls === 'heavy' ? 1.8 : 2);
      wtip.push(new THREE.Vector3(tipX * s, 0.05, cls === 'heavy' ? 0 : 0.2));
      // engine pods
      const podR = cls === 'heavy' ? 1.05 : 0.7, px = cls === 'heavy' ? 2.6 : 1.55;
      add(new THREE.CylinderGeometry(podR, podR * 0.85, 4, 14).rotateX(Math.PI / 2), darkMat, px * s, -0.1, L / 2 - 1.3);
      add(new THREE.TorusGeometry(podR * 0.9, 0.12, 8, 20), accMat, px * s, -0.1, L / 2 + 0.7);
      if (cls === 'heavy') add(new THREE.BoxGeometry(1.2, 1.4, 5), hullMat, 1.4 * s, 0.9, 0.5);
    }
    if (cls === 'heavy') { add(new THREE.CylinderGeometry(0.35, 0.35, 3, 8).rotateX(Math.PI / 2), darkMat, 0, 1.3, -3); }
    // fin
    const fs = new THREE.Shape(); fs.moveTo(0, 0); fs.lineTo(2.5, 0); fs.lineTo(3.2, 2.2); fs.lineTo(2.2, 2.2);
    add(new THREE.ExtrudeGeometry(fs, { depth: 0.15, bevelEnabled: false }).rotateY(-Math.PI / 2), accMat, 0.07, 0.4, L / 2 - 3.2);
    // engines glow
    const engines = [];
    const podR = cls === 'heavy' ? 1.05 : 0.7, px = cls === 'heavy' ? 2.6 : 1.55;
    const ec = team === 0 ? new THREE.Color(0.5, 1.4, 4) : new THREE.Color(4, 1.3, 0.4);
    for (const s of [1, -1]) {
      const disc = new THREE.Mesh(new THREE.CircleGeometry(podR * 0.78, 20), new THREE.MeshBasicMaterial({ color: ec }));
      disc.position.set(px * s, -0.1, L / 2 + 0.72); g.add(disc);
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: ec, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      spr.position.set(px * s, -0.1, L / 2 + 1.4); spr.scale.setScalar(podR * 5); g.add(spr);
      // plume
      const plume = new THREE.Mesh(new THREE.ConeGeometry(podR * 0.7, 6, 16, 1, true).rotateX(Math.PI / 2).translate(0, 0, 3),
        new THREE.MeshBasicMaterial({ color: ec.clone().multiplyScalar(0.35), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      plume.position.set(px * s, -0.1, L / 2 + 0.75); g.add(plume);
      engines.push({ spr, plume, local: new THREE.Vector3(px * s, -0.1, L / 2 + 1), r: podR });
    }
    const light = new THREE.PointLight(ec, 0, 40, 2); light.position.set(0, 0, L / 2 + 3); g.add(light);
    return { g, engines, wtip, hullMat, light, L };
  }

  makeShip(cls: ShipClass, team: number, isPlayer = false, up: Upgrades = null, name: string | null = null, humanSlot = -1) {
    const c = CLASSES[cls];
    const group = new THREE.Group(); const model = this.buildShipModel(cls, team);
    model.g.scale.setScalar(c.scale); group.add(model.g); this.scene.add(group);
    const shieldMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { op: { value: 0 }, col: { value: team === 0 ? new THREE.Color(0.3, 0.7, 1.5) : new THREE.Color(1.5, 0.5, 0.3) } },
      vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vec4 mv=modelViewMatrix*vec4(position,1.); vN=normalize(normalMatrix*normal); vV=normalize(-mv.xyz); gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform float op; uniform vec3 col; varying vec3 vN; varying vec3 vV; void main(){ float f=pow(1.-abs(dot(vN,vV)),2.2); gl_FragColor=vec4(col*(f+0.08)*op*2.,1.); }`,
    });
    const shield = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), shieldMat);
    shield.scale.set(c.radius * 1.1, c.radius * 0.6, c.radius * 1.3); shield.visible = false; group.add(shield);
    const u = up || { guns: 0, armor: 0, engine: 0 };
    const hp = c.hp * (1 + u.armor * 0.12), sh = c.shield * (1 + u.armor * 0.12);
    const s = {
      cls, team, isPlayer, group, model, shield, shieldMat, humanSlot, name: name || (isPlayer ? 'TY' : CALLSIGNS[Math.random() * CALLSIGNS.length | 0] + '-' + (Math.random() * 90 + 10 | 0)),
      hp, maxHp: hp, sh, maxSh: sh, speed: c.speed * (1 + u.engine * 0.07), boost: c.boost * (1 + u.engine * 0.07), turn: c.turn * (1 + u.engine * 0.05),
      dmg: c.dmg * (1 + u.guns * 0.12), rate: c.rate, radius: c.radius, scale: c.scale,
      vel: new THREE.Vector3(), throttle: 0.6, curSpeed: 0, fireCd: 0, gunSide: 0, missiles: c.missiles, missileCd: 0,
      energy: 1, heat: 0, overheat: false, lastHit: -10, shieldFlash: 0, dead: false, target: null, kills: 0,
      ai: { state: 'attack', timer: 0, acc: rand(0.55, 0.85), evadeDir: new THREE.Vector3() }, bank: 0, boosting: false,
    };
    this.ships.push(s); return s;
  }

  clearBattle() {
    for (const s of this.ships) this.scene.remove(s.group);
    for (const l of this.lasers) this.scene.remove(l.mesh);
    for (const m of this.missiles) this.scene.remove(m.mesh);
    for (const d of this.debris) this.scene.remove(d.mesh);
    for (const r of this.rings) this.scene.remove(r.mesh);
    this.ships = []; this.lasers = []; this.missiles = []; this.debris = []; this.rings = [];
    this.fire.clear(); this.smoke.clear(); this.player = null; this.killfeed = []; this.dmgDirs = [];
    this.humanShips = [];
  }

  setHangarShip(cls: ShipClass) {
    this.clearBattle(); this.mode = 'hangar';
    const s = this.makeShip(cls, 0, false); s.throttle = 0.3; this.hangarShip = s;
    s.group.position.set(0, 0, 0); this.hangarAngle = this.hangarAngle || 0.6;
    if (document.pointerLockElement) document.exitPointerLock();
  }

  startBattle(cls: ShipClass, up: Upgrades, battles = 0) {
    this.sfx.init();
    this.clearBattle(); this.mode = 'battle'; this.paused = false; this.time = 0;
    this.stats = { kills: 0, damage: 0, shots: 0, hits: 0 };
    const p = this.player = this.makeShip(cls, 0, true, up);
    p.group.position.set(0, 0, 750); p.vel.set(0, 0, -p.speed * 0.6);
    const pool: ShipClass[] = ['interceptor', 'fighter', 'fighter', 'heavy'];
    const diff = clamp(battles * 0.03, 0, 0.25);
    for (let i = 0; i < 11; i++) {
      const team = i < 5 ? 0 : 1; const cls2 = pool[Math.random() * pool.length | 0];
      const s = this.makeShip(cls2, team, false, team === 1 ? { guns: battles / 3 | 0, armor: battles / 3 | 0, engine: 0 } : null);
      const k = team === 0 ? i : i - 5;
      s.group.position.set((k - 2.5) * 45 + rand(-8, 8), rand(-30, 30), (team === 0 ? 780 : -780) + rand(-30, 30));
      if (team === 1) { s.group.rotation.y = Math.PI; s.ai.acc = clamp(s.ai.acc + diff, 0, 0.95); }
      s.vel.set(0, 0, team === 0 ? -40 : 40);
    }
    this.camera.position.set(0, 10, 790);
    this.msg('BITWA ROZPOCZĘTA — ZNISZCZ WSZYSTKIE WROGIE JEDNOSTKI', 4);
    this.ended = false; this.cursor.x = this.cursor.y = 0;
    this.lockPointer();
  }

  /** Tryb kanapowy JoyPad: ludzcy gracze z padów + boty sojusznicze vs. eskadra wroga. */
  startBattleSquad(humans: { cls: ShipClass; up: Upgrades | null; name: string }[], opts: { enemies?: number; allyBots?: number; difficulty?: number } = {}) {
    const enemies = opts.enemies ?? 8, allyBots = opts.allyBots ?? 2, difficulty = opts.difficulty ?? 1;
    this.sfx.init();
    this.clearBattle(); this.mode = 'battle'; this.paused = false; this.time = 0;
    this.stats = { kills: 0, damage: 0, shots: 0, hits: 0 };
    const pool: ShipClass[] = ['interceptor', 'fighter', 'fighter', 'heavy'];
    humans.forEach((h, i) => {
      const p = this.makeShip(h.cls, 0, true, h.up, h.name, i);
      p.group.position.set((i - (humans.length - 1) / 2) * 55, rand(-15, 15), 750);
      p.vel.set(0, 0, -p.speed * 0.6);
      this.humanShips.push(p);
    });
    this.player = this.humanShips[0] || null;
    for (let i = 0; i < allyBots; i++) {
      const s = this.makeShip(pool[Math.random() * pool.length | 0], 0, false, null);
      s.group.position.set(rand(-140, 140), rand(-40, 40), 800 + rand(0, 60));
      s.vel.set(0, 0, -40);
    }
    const up = { guns: difficulty, armor: difficulty, engine: 0 };
    for (let i = 0; i < enemies; i++) {
      const s = this.makeShip(pool[Math.random() * pool.length | 0], 1, false, up);
      const k = i - (enemies - 1) / 2;
      s.group.position.set(k * 45 + rand(-8, 8), rand(-30, 30), -780 + rand(-30, 30));
      s.group.rotation.y = Math.PI;
      s.ai.acc = clamp(s.ai.acc + difficulty * 0.06, 0, 0.95);
      s.vel.set(0, 0, 40);
    }
    this.camera.position.set(0, 10, 790);
    this.msg('BITWA ROZPOCZĘTA — ZNISZCZ WSZYSTKIE WROGIE JEDNOSTKI', 4);
    this.ended = false; this.cursor.x = this.cursor.y = 0;
    if (!this.padMode) this.lockPointer();
  }

  lockPointer() { const el = this.renderer.domElement; el.requestPointerLock && el.requestPointerLock(); }
  msg(t, d = 3) { this.messages.push({ t, d }); }

  // ---------- Input ----------
  bindInput() {
    this._on = [];
    const listen = (target: any, type: string, fn: any, opts?: any) => { target.addEventListener(type, fn, opts); this._on.push([target, type, fn, opts]); };
    listen(window, 'keydown', (e: KeyboardEvent) => {
      this.keys[e.code] = true;
      if (this.mode === 'battle' && e.code === 'KeyR') this.cycleTarget();
      if (this.mode === 'battle' && e.code === 'KeyF') this.fireMissile(this.player);
      if (e.code === 'Space') e.preventDefault();
    });
    listen(window, 'keyup', (e: KeyboardEvent) => { this.keys[e.code] = false; });
    listen(window, 'mousemove', (e: MouseEvent) => {
      if (this.padMode || this.mode !== 'battle') return;
      if (document.pointerLockElement) { this.cursor.x += e.movementX; this.cursor.y += e.movementY; }
      else { this.cursor.x = e.clientX - this.cw / 2; this.cursor.y = e.clientY - this.ch / 2; }
      const R = Math.min(this.cw, this.ch) * 0.32; const l = Math.hypot(this.cursor.x, this.cursor.y);
      if (l > R) { this.cursor.x *= R / l; this.cursor.y *= R / l; }
    });
    const el = this.renderer.domElement;
    listen(el, 'mousedown', (e: MouseEvent) => {
      if (this.padMode || this.mode !== 'battle') return;
      if (!document.pointerLockElement && !this.ended) { this.lockPointer(); }
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.fireMissile(this.player);
    });
    listen(window, 'mouseup', (e: MouseEvent) => { if (e.button === 0) this.mouseDown = false; });
    listen(el, 'contextmenu', (e: Event) => e.preventDefault());
    listen(document, 'pointerlockchange', () => {
      if (this.padMode) return;
      if (this.mode === 'battle' && !this.ended) { this.paused = !document.pointerLockElement; this.onPause && this.onPause(this.paused); }
    });
    listen(window, 'resize', this.resize);
  }

  destroy() {
    this.alive = false;
    for (const [t, ty, fn, o] of this._on || []) t.removeEventListener(ty, fn, o);
    this._on = [];
    if (document.pointerLockElement) document.exitPointerLock();
    try { this.sfx && this.sfx.ctx && this.sfx.ctx.close(); } catch { /* ignore */ }
    try { this.renderer.dispose(); this.renderer.domElement.remove(); this.overlay.remove(); } catch { /* ignore */ }
  }

  resume() {
    if (this.padMode) { this.paused = false; this.onPause && this.onPause(false); }
    else this.lockPointer();
  }

  cycleTarget(p = this.player) {
    if (!p || p.dead) return;
    const fwd = _v1.set(0, 0, -1).applyQuaternion(p.group.quaternion);
    let best = null, bs = -Infinity;
    for (const s of this.ships) {
      if (s.team === p.team || s.dead || s === p.target) continue;
      const d = _v2.subVectors(s.group.position, p.group.position); const dist = d.length();
      const score = d.normalize().dot(fwd) * 2 - dist / 1500;
      if (score > bs) { bs = score; best = s; }
    }
    if (best) { p.target = best; p.lockT = 0; this.sfx.beep(1200, 0.05); }
  }

  // ---------- Combat ----------
  fireLaser(s, aimDir = null) {
    const fwd = _v1.set(0, 0, -1).applyQuaternion(s.group.quaternion);
    const dir = (aimDir ? aimDir.clone() : fwd.clone());
    const cls = CLASSES[s.cls];
    const tip = s.model.wtip[s.gunSide]; s.gunSide = 1 - s.gunSide;
    const origin = tip.clone().multiplyScalar(cls.scale).applyQuaternion(s.group.quaternion).add(s.group.position).addScaledVector(fwd, 3);
    const mesh = new THREE.Mesh(this.laserGeo, this.laserMats[s.team]);
    mesh.position.copy(origin); mesh.quaternion.setFromUnitVectors(_v2.set(0, 0, -1), dir);
    if (s.cls === 'heavy') mesh.scale.set(1.8, 1.8, 1.3);
    this.scene.add(mesh);
    const vel = dir.multiplyScalar(LASER_SPEED).add(s.vel);
    this.lasers.push({ mesh, vel, life: 1.5, owner: s, dmg: s.dmg, prev: origin.clone() });
    // muzzle flash
    const c = s.team === 0 ? [0.5, 1.2, 3] : [3, 0.8, 0.3];
    this.fire.spawn(origin, s.vel, 0.07, 3 * cls.scale, 5 * cls.scale, c, c, 0, 1);
    const vol = this.volAt(origin);
    this.sfx.laser(s.isPlayer ? 0.8 : vol * 0.5, s.cls === 'heavy' ? 0.6 : s.cls === 'interceptor' ? 1.3 : 1);
    if (s.isPlayer) this.stats.shots++;
  }
  fireMissile(s) {
    if (!s || s.dead || s.missiles <= 0 || s.missileCd > 0 || this.paused) return;
    s.missiles--; s.missileCd = 1.2;
    const q = s.group.quaternion;
    const mesh = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.2, 8).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.7, roughness: 0.4 }));
    mesh.add(body);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.glowTex, color: new THREE.Color(4, 2.2, 1), blending: THREE.AdditiveBlending, depthWrite: false }));
    spr.scale.setScalar(4); spr.position.z = 1.3; mesh.add(spr);
    mesh.position.copy(s.group.position).add(_v1.set(0, -1.5 * s.scale, 0).applyQuaternion(q));
    mesh.quaternion.copy(q); this.scene.add(mesh);
    const locked = s.isPlayer ? (s.lockT >= 1 ? s.target : null) : s.target;
    this.missiles.push({ mesh, vel: s.vel.clone().add(_v2.set(0, -8, 0).applyQuaternion(q)), speed: 60, life: 7, owner: s, target: locked, arm: 0.3 });
    this.sfx.missile(s.isPlayer ? 1 : this.volAt(mesh.position));
    if (s.isPlayer) this.msg(locked ? 'RAKIETA ODPALONA — NAMIERZONO CEL' : 'RAKIETA ODPALONA (bez namierzania)', 1.5);
    if (locked && locked.isPlayer) this.msg('⚠ RAKIETA NA OGONIE!', 2);
  }
  volAt(p) { const d = this.camera.position.distanceTo(p); return clamp(1 - d / 900, 0, 1); }

  damage(s, amt, from, hitPos) {
    if (s.dead) return;
    s.lastHit = this.time;
    if (s.sh > 0) { const a = Math.min(s.sh, amt); s.sh -= a; amt -= a; s.shieldFlash = 1; }
    s.hp -= amt;
    if (from && from.isPlayer) { this.hitMarker = 0.18; this.stats.damage += amt; this.stats.hits++; }
    if (s.isPlayer) {
      this.shake = Math.max(this.shake, 0.6);
      if (from) this.dmgDirs.push({ pos: from.group.position.clone(), t: 1.2 });
      this.sfx.hit(1);
    }
    if (s.humanSlot >= 0 && this.onShipFx) this.onShipFx(s.humanSlot, 'hit');
    if (s.isPlayer === false && from && !from.dead && s.ai && Math.random() < 0.5) s.target = from;
    const c = s.sh > 0 ? [0.6, 1.2, 3] : [3, 1.8, 0.8];
    for (let i = 0; i < 10; i++) this.fire.spawn(hitPos, _v1.randomDirection().multiplyScalar(rand(15, 60)).add(s.vel), rand(0.2, 0.5), 0.8, 0.1, c, [1, 0.3, 0.1], 2);
    if (s.hp <= 0) this.kill(s, from);
  }
  kill(s, from) {
    s.dead = true; s.hp = 0;
    this.explode(s.group.position.clone(), s.scale * 1.6, s.vel, s);
    this.scene.remove(s.group);
    if (from) { from.kills++; if (from.isPlayer) { this.stats.kills++; this.msg(`ZNISZCZONO: ${s.name}`, 2.5); } }
    if (s.humanSlot >= 0 && this.onShipFx) this.onShipFx(s.humanSlot, 'dead');
    if (from && from.humanSlot >= 0 && this.onShipFx) this.onShipFx(from.humanSlot, 'kill');
    this.killfeed.unshift({ t: 6, a: from ? from.name : 'Kolizja', at: from ? from.team : 2, b: s.name, bt: s.team });
    if (this.killfeed.length > 6) this.killfeed.pop();
    if (s.isPlayer) this.msg('TWÓJ STATEK ZOSTAŁ ZNISZCZONY', 4);
  }
  explode(pos, sc, vel, ship = null) {
    const v0 = vel ? vel.clone().multiplyScalar(0.3) : V();
    // light
    const L = this.lightPool.reduce((a, b) => (a.t < b.t ? a : b)); L.l.position.copy(pos); L.max = 900 * sc; L.t = 1; L.dur = 1.2 * sc; L.l.distance = 250 * sc; L.l.color.setRGB(1, 0.6, 0.3);
    // core flash
    this.fire.spawn(pos, v0, 0.25, 30 * sc, 60 * sc, [6, 5, 4], [3, 1.5, 0.5], 0, 1);
    for (let i = 0; i < 70; i++) {
      const d = _v1.randomDirection(); const sp = rand(5, 35) * sc;
      this.fire.spawn(_v2.copy(pos).addScaledVector(d, rand(0, 3) * sc), _v3.copy(d).multiplyScalar(sp).add(v0), rand(0.6, 1.6), rand(5, 10) * sc, rand(14, 24) * sc, [4, 2.2, 0.8], [0.4, 0.06, 0.02], 1.5, 0.9);
    }
    for (let i = 0; i < 120; i++) {
      const d = _v1.randomDirection();
      this.fire.spawn(pos, _v3.copy(d).multiplyScalar(rand(40, 160) * sc).add(v0), rand(0.4, 1.8), rand(0.8, 1.6) * sc, 0.1, [5, 4, 2.5], [2, 0.5, 0.1], 1.2, 1);
    }
    for (let i = 0; i < 40; i++) {
      const d = _v1.randomDirection();
      this.smoke.spawn(_v2.copy(pos).addScaledVector(d, rand(0, 4) * sc), _v3.copy(d).multiplyScalar(rand(3, 14) * sc).add(v0), rand(3, 6), rand(8, 14) * sc, rand(28, 50) * sc, [0.25, 0.22, 0.2], [0.08, 0.08, 0.09], 0.4, 0.7);
    }
    // shockwave
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(2, 1.4, 1), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    ring.position.copy(pos); ring.lookAt(_v1.copy(pos).add(_v2.randomDirection())); this.scene.add(ring);
    this.rings.push({ mesh: ring, t: 0, sc });
    // debris
    if (ship) {
      const mat = ship.model.hullMat;
      for (let i = 0; i < 12; i++) {
        const geo = new THREE.TetrahedronGeometry(rand(0.4, 1.4) * sc, 0);
        const m = new THREE.Mesh(geo, mat); m.position.copy(pos); m.castShadow = true; this.scene.add(m);
        this.debris.push({ mesh: m, vel: _v1.randomDirection().multiplyScalar(rand(15, 55)).add(v0).clone(), spin: V().randomDirection().multiplyScalar(rand(2, 8)), life: rand(2.5, 5), burn: Math.random() < 0.6 });
      }
    }
    const d = this.camera.position.distanceTo(pos);
    this.shake = Math.max(this.shake, clamp(1.5 * sc - d / 250, 0, 2));
    this.sfx.explosion(clamp(1.1 - d / 1400, 0.05, 1) * Math.min(1, sc));
  }

  enemiesOf(team) { return this.ships.filter((s) => s.team !== team && !s.dead); }

  // ---------- Update ----------
  updateShipPhysics(s, dt) {
    const g = s.group;
    const fwd = _v1.set(0, 0, -1).applyQuaternion(g.quaternion);
    const target = s.boosting ? s.boost : s.speed * s.throttle;
    s.curSpeed += (target - s.curSpeed) * (1 - Math.exp(-dt * 1.5));
    const desired = _v2.copy(fwd).multiplyScalar(s.curSpeed);
    if (s.strafe) desired.add(_v3.set(s.strafe * 25, 0, 0).applyQuaternion(g.quaternion));
    s.vel.lerp(desired, 1 - Math.exp(-dt * (s.cls === 'heavy' ? 1.1 : 1.8)));
    g.position.addScaledVector(s.vel, dt);
    // asteroid collisions
    for (const a of this.asteroids) {
      const r = a.userData.r * 0.85 + s.radius * 0.6;
      const d = _v3.subVectors(g.position, a.position); const l = d.length();
      if (l < r) {
        d.normalize(); g.position.copy(a.position).addScaledVector(d, r);
        const vn = s.vel.dot(d); if (vn < 0) { s.vel.addScaledVector(d, -vn * 1.6); this.damage(s, Math.min(60, -vn * 0.5), null, g.position.clone().addScaledVector(d, -s.radius * 0.5)); }
      }
    }
    // arena bounds
    if (g.position.length() > ARENA * 1.15 && s.isPlayer) { this.warnBounds = true; this.damage(s, dt * 10, null, g.position.clone()); } else if (s.isPlayer) this.warnBounds = g.position.length() > ARENA;
    // shield
    if (this.time - s.lastHit > 4 && s.sh < s.maxSh) s.sh = Math.min(s.maxSh, s.sh + s.maxSh * 0.12 * dt);
    s.shieldFlash = Math.max(0, s.shieldFlash - dt * 2.5);
    s.shield.visible = s.shieldFlash > 0; s.shieldMat.uniforms.op.value = s.shieldFlash;
    s.fireCd -= dt; s.missileCd -= dt;
    // engines
    const t = clamp(s.curSpeed / s.speed, 0, 2);
    for (const e of s.model.engines) {
      const f = 0.85 + Math.random() * 0.3;
      e.spr.scale.setScalar(e.r * (3 + t * 3) * f); e.plume.scale.set(1, 1, 0.3 + t * (s.boosting ? 1.8 : 0.8) * f);
      if (Math.random() < 0.6) {
        const wp = _v3.copy(e.local).multiplyScalar(s.scale).applyQuaternion(g.quaternion).add(g.position);
        const c = s.team === 0 ? [0.4, 0.9, 2.5] : [2.5, 0.9, 0.3];
        this.fire.spawn(wp, _v2.copy(s.vel).multiplyScalar(0.85), 0.35, e.r * 1.6 * s.scale, 0.1, c, [0.1, 0.1, 0.3], 0, 0.6);
      }
    }
    s.model.light.intensity = 20 + t * 40;
    // damage smoke
    if (s.hp < s.maxHp * 0.4 && Math.random() < 0.5) {
      const p = _v3.copy(g.position).add(_v2.randomDirection().multiplyScalar(s.radius * 0.4));
      this.smoke.spawn(p, _v2.copy(s.vel).multiplyScalar(0.2), 2, 2 * s.scale, 7 * s.scale, [0.2, 0.2, 0.2], [0.05, 0.05, 0.05], 0.5, 0.6);
      if (Math.random() < 0.4) this.fire.spawn(p, s.vel, 0.3, 2 * s.scale, 0.5, [4, 1.5, 0.4], [1, 0.2, 0], 0, 0.9);
    }
  }

  updatePlayer(dt) {
    const p = this.player; if (!p || p.dead) return;
    const k = this.keys, g = p.group;
    if (k.KeyW) p.throttle = Math.min(1, p.throttle + dt * 0.6);
    if (k.KeyS) p.throttle = Math.max(0, p.throttle - dt * 0.6);
    p.boosting = (k.ShiftLeft || k.ShiftRight) && p.energy > 0.05 && !p.boostLock;
    if (p.boosting) p.energy -= dt * 0.28; else p.energy = Math.min(1, p.energy + dt * 0.14);
    if (p.energy <= 0.05) p.boostLock = true; if (p.energy > 0.3) p.boostLock = false;
    p.strafe = (k.KeyE ? 1 : 0) - (k.KeyQ ? 1 : 0);
    const R = Math.min(innerWidth, innerHeight) * 0.32;
    let nx = this.cursor.x / R, ny = this.cursor.y / R;
    const dz = (v) => (Math.abs(v) < 0.04 ? 0 : (v - Math.sign(v) * 0.04) / 0.96);
    nx = dz(nx); ny = dz(ny);
    const turn = p.turn * (p.boosting ? 0.7 : 1);
    const roll = ((k.KeyA ? 1 : 0) - (k.KeyD ? 1 : 0)) * turn * 1.4;
    _e.set(-ny * turn * dt, -nx * turn * dt, roll * dt); _q.setFromEuler(_e); g.quaternion.multiply(_q).normalize();
    p.bank += (-nx * 0.5 - p.bank) * (1 - Math.exp(-dt * 4)); p.model.g.rotation.z = p.bank;
    // guns
    p.heat = Math.max(0, p.heat - dt * 0.33); if (p.overheat && p.heat < 0.35) p.overheat = false;
    if ((this.mouseDown || k.Space) && p.fireCd <= 0 && !p.overheat) {
      p.fireCd = p.rate; p.heat += p.cls === 'heavy' ? 0.05 : 0.035; if (p.heat >= 1) { p.overheat = true; this.msg('PRZEGRZANIE DZIAŁ!', 1.5); }
      let aim = null;
      if (p.target && !p.target.dead) {
        const lead = this.leadPoint(p, p.target);
        const d = _v2.subVectors(lead, g.position).normalize(); const fwd = _v3.set(0, 0, -1).applyQuaternion(g.quaternion);
        if (d.dot(fwd) > 0.994) aim = d.clone();
      }
      this.fireLaser(p, aim);
    }
    // target & lock
    if (!p.target || p.target.dead) { p.target = null; this.cycleTarget(); }
    if (p.target) {
      const d = _v2.subVectors(p.target.group.position, g.position); const dist = d.length();
      const fwd = _v3.set(0, 0, -1).applyQuaternion(g.quaternion);
      if (d.normalize().dot(fwd) > 0.93 && dist < 900) { const before = p.lockT || 0; p.lockT = Math.min(1, before + dt * 0.8); if (before < 1 && p.lockT >= 1) this.sfx.beep(1600, 0.25, 0.08); else if (Math.random() < dt * 8) this.sfx.beep(900, 0.03, 0.04); }
      else p.lockT = Math.max(0, (p.lockT || 0) - dt * 1.5);
    }
    this.sfx.engine(clamp(p.curSpeed / p.boost, 0, 1), true);
  }

  /** Sterowanie gracza z pada/klawiatury (tryb kanapowy JoyPad). */
  updateSquadHuman(p, ctrl, dt) {
    if (!p || p.dead || !ctrl) return;
    const g = p.group;
    const dz = (v: number) => (Math.abs(v) < 0.08 ? 0 : (v - Math.sign(v) * 0.08) / 0.92);
    const x = dz(ctrl.x), y = dz(ctrl.y);
    const mag = Math.min(1, Math.hypot(x, y));
    p.throttle = 0.35 + mag * 0.65;
    p.strafe = 0;
    p.boosting = (ctrl.boost || mag >= 0.96) && p.energy > 0.05 && !p.boostLock;
    if (p.boosting) p.energy -= dt * 0.28; else p.energy = Math.min(1, p.energy + dt * 0.14);
    if (p.energy <= 0.05) p.boostLock = true; if (p.energy > 0.3) p.boostLock = false;
    const turn = p.turn * (p.boosting ? 0.7 : 1);
    _e.set(-y * turn * dt, -x * turn * dt, 0); _q.setFromEuler(_e); g.quaternion.multiply(_q).normalize();
    p.bank += (-x * 0.5 - p.bank) * (1 - Math.exp(-dt * 4)); p.model.g.rotation.z = p.bank;
    p.heat = Math.max(0, p.heat - dt * 0.33); if (p.overheat && p.heat < 0.35) p.overheat = false;
    if (ctrl.fire && p.fireCd <= 0 && !p.overheat) {
      p.fireCd = p.rate; p.heat += p.cls === 'heavy' ? 0.05 : 0.035; if (p.heat >= 1) p.overheat = true;
      let aim = null;
      if (p.target && !p.target.dead) {
        const lead = this.leadPoint(p, p.target);
        const d = _v2.subVectors(lead, g.position).normalize(); const fwd = _v3.set(0, 0, -1).applyQuaternion(g.quaternion);
        if (d.dot(fwd) > 0.994) aim = d.clone();
      }
      this.fireLaser(p, aim);
    }
    if (!p.target || p.target.dead) { p.target = null; this.cycleTarget(p); }
    if (p.target) {
      const d = _v2.subVectors(p.target.group.position, g.position); const dist = d.length();
      const fwd = _v3.set(0, 0, -1).applyQuaternion(g.quaternion);
      if (d.normalize().dot(fwd) > 0.93 && dist < 900) {
        const before = p.lockT || 0; p.lockT = Math.min(1, before + dt * 0.8);
        if (before < 1 && p.lockT >= 1) this.sfx.beep(1600, 0.25, 0.08); else if (Math.random() < dt * 8) this.sfx.beep(900, 0.03, 0.04);
      } else p.lockT = Math.max(0, (p.lockT || 0) - dt * 1.5);
      if (p.lockT >= 1) this.fireMissile(p); // fireMissile sam pilnuje cooldownu rakiet
    }
    if (p === this.humanShips[0]) this.sfx.engine(clamp(p.curSpeed / p.boost, 0, 1), true);
  }

  leadPoint(from, t) {
    const d = from.group.position.distanceTo(t.group.position);
    const tt = d / LASER_SPEED; return t.group.position.clone().addScaledVector(t.vel, tt).addScaledVector(from.vel, -tt * 0.9);
  }

  updateAI(s, dt) {
    const g = s.group, ai = s.ai;
    if (!s.target || s.target.dead || Math.random() < dt * 0.1) {
      let best = null, bd = Infinity;
      for (const o of this.ships) if (o.team !== s.team && !o.dead) { const d = o.group.position.distanceTo(g.position) * (o.isPlayer ? 0.8 : 1); if (d < bd) { bd = d; best = o; } }
      s.target = best;
    }
    const t = s.target; ai.timer -= dt;
    const fwd = _v1.set(0, 0, -1).applyQuaternion(g.quaternion).clone();
    let aim;
    s.boosting = false; s.throttle = 0.85;
    if (!t) { aim = V(); }
    else {
      const dist = g.position.distanceTo(t.group.position);
      if (ai.state === 'attack') {
        if (dist < 45 + s.radius * 3) { ai.state = 'break'; ai.timer = rand(1.5, 2.5); ai.evadeDir.randomDirection(); }
        else if (s.hp < s.maxHp * 0.35 && Math.random() < dt * 0.3) { ai.state = 'evade'; ai.timer = rand(2, 3.5); ai.evadeDir.randomDirection(); }
      } else if (ai.timer <= 0) ai.state = 'attack';
      if (ai.state === 'attack') {
        aim = this.leadPoint(s, t);
        aim.add(_v2.set(Math.sin(this.time * 1.3 + s.radius), Math.cos(this.time * 0.9), Math.sin(this.time * 0.7)).multiplyScalar((1 - ai.acc) * dist * 0.08));
        if (dist > 450) s.boosting = true; if (dist < 150) s.throttle = 0.6;
      } else {
        aim = g.position.clone().addScaledVector(ai.evadeDir, 200).addScaledVector(fwd, 100); s.boosting = ai.state === 'evade' || Math.random() < 0.5;
      }
      // fire
      const toAim = _v2.subVectors(aim, g.position).normalize();
      if (ai.state === 'attack' && toAim.dot(fwd) > 0.985 && dist < 700 && s.fireCd <= 0) { s.fireCd = s.rate * rand(1.6, 2.6); this.fireLaser(s); }
      if (ai.state === 'attack' && toAim.dot(fwd) > 0.9 && dist < 650 && dist > 120 && s.missiles > 0 && s.missileCd <= 0 && Math.random() < dt * 0.12) this.fireMissile(s);
    }
    // obstacle avoidance
    const avoid = V();
    for (const a of this.asteroids) {
      const d = _v2.subVectors(g.position, a.position); const l = d.length(); const r = a.userData.r + s.radius + 40;
      if (l < r) avoid.addScaledVector(d.normalize(), (r - l) / r * 3);
    }
    for (const o of this.ships) { if (o === s || o.dead) continue; const d = _v2.subVectors(g.position, o.group.position); const l = d.length(); if (l < 25) avoid.addScaledVector(d.normalize(), (25 - l) / 25 * 2); }
    if (g.position.length() > ARENA) avoid.addScaledVector(g.position.clone().normalize(), -2);
    const dir = _v3.subVectors(aim, g.position).normalize().add(avoid).normalize();
    const up = _v2.set(0, 1, 0).applyQuaternion(g.quaternion);
    _m.lookAt(g.position, _v1.copy(g.position).add(dir), up); _q.setFromRotationMatrix(_m);
    const before = g.quaternion.clone();
    g.quaternion.rotateTowards(_q, s.turn * 0.9 * dt);
    // bank visual
    const yawRate = new THREE.Vector3(0, 0, -1).applyQuaternion(before).cross(new THREE.Vector3(0, 0, -1).applyQuaternion(g.quaternion)).dot(up);
    s.bank += (clamp(yawRate / dt * 0.6, -1, 1) - s.bank) * (1 - Math.exp(-dt * 3)); s.model.g.rotation.z = s.bank;
  }

  updateProjectiles(dt) {
    for (let i = this.lasers.length - 1; i >= 0; i--) {
      const L = this.lasers[i]; L.prev.copy(L.mesh.position); L.mesh.position.addScaledVector(L.vel, dt); L.life -= dt;
      let hit = false; const p = L.mesh.position;
      for (const s of this.ships) {
        if (s.dead || s.team === L.owner.team) continue;
        // segment-sphere
        const seg = _v1.subVectors(p, L.prev); const len = seg.length(); seg.divideScalar(len || 1);
        const tt = clamp(_v2.subVectors(s.group.position, L.prev).dot(seg), 0, len);
        const cp = _v3.copy(L.prev).addScaledVector(seg, tt);
        if (cp.distanceTo(s.group.position) < s.radius) { this.damage(s, L.dmg, L.owner.dead ? null : L.owner, cp.clone()); hit = true; break; }
      }
      if (!hit) for (const a of this.asteroids) {
        if (p.distanceTo(a.position) < a.userData.r * 0.9) {
          hit = true;
          for (let j = 0; j < 8; j++) this.fire.spawn(p, _v1.randomDirection().multiplyScalar(rand(10, 40)), rand(0.2, 0.5), 0.8, 0.1, [3, 2, 1], [1, 0.3, 0.1], 2);
          this.smoke.spawn(p, V(), 1.5, 2, 6, [0.3, 0.28, 0.25], [0.1, 0.1, 0.1], 0, 0.5); break;
        }
      }
      if (hit || L.life <= 0) { this.scene.remove(L.mesh); this.lasers.splice(i, 1); }
    }
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const M = this.missiles[i]; M.life -= dt; M.arm -= dt; M.speed = Math.min(260, M.speed + dt * 220);
      const fwd = _v1.set(0, 0, -1).applyQuaternion(M.mesh.quaternion);
      if (M.target && !M.target.dead && M.arm < 0.1) {
        const tp = M.target.group.position.clone().addScaledVector(M.target.vel, M.mesh.position.distanceTo(M.target.group.position) / M.speed * 0.8);
        _m.lookAt(M.mesh.position, tp, _v2.set(0, 1, 0)); _q.setFromRotationMatrix(_m); M.mesh.quaternion.rotateTowards(_q, 2.6 * dt);
      }
      M.vel.lerp(fwd.clone().multiplyScalar(M.speed), 1 - Math.exp(-dt * 4));
      M.mesh.position.addScaledVector(M.vel, dt);
      const back = _v2.copy(M.mesh.position).addScaledVector(fwd, -1.4);
      this.fire.spawn(back, _v3.copy(M.vel).multiplyScalar(0.1), 0.25, 1.6, 0.3, [4, 2.2, 0.8], [1, 0.2, 0.05], 0, 1);
      this.smoke.spawn(back, _v3.randomDirection().multiplyScalar(1.5), 2.5, 1, 4.5, [0.5, 0.5, 0.52], [0.2, 0.2, 0.22], 0.3, 0.45);
      let boom = false;
      if (M.arm <= 0) for (const s of this.ships) {
        if (s.dead || s.team === M.owner.team) continue;
        if (s.group.position.distanceTo(M.mesh.position) < s.radius + 3) { this.damage(s, 55, M.owner.dead ? null : M.owner, M.mesh.position.clone()); boom = true; break; }
      }
      if (!boom) for (const a of this.asteroids) if (a.position.distanceTo(M.mesh.position) < a.userData.r * 0.9) { boom = true; break; }
      if (boom || M.life <= 0) { this.explode(M.mesh.position.clone(), 0.5, M.vel.clone().multiplyScalar(0.2)); this.scene.remove(M.mesh); this.missiles.splice(i, 1); }
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i]; d.life -= dt; d.mesh.position.addScaledVector(d.vel, dt);
      d.mesh.rotation.x += d.spin.x * dt; d.mesh.rotation.y += d.spin.y * dt; d.mesh.rotation.z += d.spin.z * dt;
      if (d.burn && Math.random() < 0.7) {
        this.fire.spawn(d.mesh.position, V(), 0.4, 1.8, 0.3, [4, 1.8, 0.5], [0.6, 0.1, 0], 0, Math.min(1, d.life));
        this.smoke.spawn(d.mesh.position, V(), 1.8, 1, 4, [0.2, 0.2, 0.2], [0.05, 0.05, 0.05], 0, 0.4 * Math.min(1, d.life));
      }
      if (d.life <= 0) { this.scene.remove(d.mesh); this.debris.splice(i, 1); }
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; const k = r.t / 1.1;
      r.mesh.scale.setScalar(1 + k * 90 * r.sc); r.mesh.material.opacity = Math.pow(1 - k, 2);
      if (k >= 1) { this.scene.remove(r.mesh); this.rings.splice(i, 1); }
    }
    for (const L of this.lightPool) { if (L.t > 0) { L.t = Math.max(0, L.t - dt / L.dur); L.l.intensity = L.max * L.t * L.t; } }
  }

  updateCamera(dt) {
    const cam = this.camera;
    if (this.mode === 'hangar') {
      const s = this.hangarShip; this.hangarAngle += dt * 0.25;
      s.group.rotation.set(Math.sin(this.time * 0.5) * 0.08, this.hangarAngle, Math.sin(this.time * 0.7) * 0.1);
      s.group.position.y = Math.sin(this.time) * 0.4;
      const dist = 22 * s.scale;
      cam.position.set(dist * 0.9, dist * 0.28, dist * 0.55); cam.lookAt(-3, 0, 0);
      cam.fov = 45; cam.updateProjectionMatrix();
      return;
    }
    const p = this.player;
    const tgt = p && !p.dead ? p : this.spectate();
    if (!tgt) return;
    const g = tgt.group;
    const off = _v1.set(0, 4.5 * tgt.scale, 17 * tgt.scale).applyQuaternion(g.quaternion);
    const desired = _v2.copy(g.position).add(off);
    const k = 1 - Math.exp(-dt * 10);
    cam.position.lerp(desired, k);
    // hard follow to avoid lag at high speed
    cam.position.addScaledVector(tgt.vel, dt * (1 - k));
    const look = _q.copy(g.quaternion);
    cam.quaternion.slerp(look, 1 - Math.exp(-dt * 7));
    const tfov = 68 + (tgt.boosting ? 12 : 0) + clamp(tgt.curSpeed / 20, 0, 5);
    cam.fov += (tfov - cam.fov) * (1 - Math.exp(-dt * 3)); cam.updateProjectionMatrix();
    if (this.shake > 0) { cam.position.add(_v3.randomDirection().multiplyScalar(this.shake * 0.5)); this.shake = Math.max(0, this.shake - dt * 1.8); }
    if (tgt.boosting) cam.position.add(_v3.randomDirection().multiplyScalar(0.06));
  }
  spectate() { return this.ships.find((s) => !s.dead && s.team === 0) || this.ships.find((s) => !s.dead); }

  loop = () => {
    requestAnimationFrame(this.loop);
    const now = performance.now(); let dt = Math.min(0.05, (now - this.last) / 1000); this.last = now;
    if (this.paused) dt = 0;
    this.time += dt;
    for (const a of this.asteroids) { a.rotation.x += a.userData.spin.x * dt; a.rotation.y += a.userData.spin.y * dt; }
    this.planet.rotation.y += dt * 0.004;
    if (this.mode === 'battle' && dt > 0) {
      if (this.readCtrl) {
        for (const h of this.humanShips) if (!h.dead) this.updateSquadHuman(h, this.readCtrl(h.humanSlot), dt);
      } else {
        this.updatePlayer(dt);
      }
      for (const s of this.ships) if (!s.dead && !s.isPlayer) this.updateAI(s, dt);
      for (const s of this.ships) if (!s.dead) this.updateShipPhysics(s, dt);
      this.updateProjectiles(dt);
      this.checkEnd(dt);
    } else if (this.mode === 'hangar') {
      const s = this.hangarShip; s.curSpeed = s.speed * 0.4;
      for (const e of s.model.engines) { const f = 0.85 + Math.random() * 0.3; e.spr.scale.setScalar(e.r * 4 * f); e.plume.scale.set(1, 1, 0.5 * f); }
      s.model.light.intensity = 30;
      this.sfx.engine(0, false);
    }
    if (this.mode !== 'battle') this.sfx.engine(0, false);
    this.fire.update(dt); this.smoke.update(dt);
    this.updateCamera(dt);
    this.sky.position.copy(this.camera.position);
    // dust wrap
    const dp = this.dust.geometry.attributes.position; const c = this.camera.position;
    for (let i = 0; i < dp.count; i++) {
      let x = dp.getX(i), y = dp.getY(i), z = dp.getZ(i);
      if (x - c.x > 120) x -= 240; else if (x - c.x < -120) x += 240;
      if (y - c.y > 120) y -= 240; else if (y - c.y < -120) y += 240;
      if (z - c.z > 120) z -= 240; else if (z - c.z < -120) z += 240;
      dp.setXYZ(i, x, y, z);
    }
    dp.needsUpdate = true;
    // shadow follows focus
    const focus = this.mode === 'hangar' ? this.hangarShip.group.position : (this.player && !this.player.dead ? this.player.group.position : this.camera.position);
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 500); this.sun.target.position.copy(focus);
    if (this.lowFx) this.renderer.render(this.scene, this.camera); else this.composer.render();
    this.drawOverlay(dt);
    this.hudTimer -= dt;
    if (this.onHud && (this.hudTimer <= 0)) { this.hudTimer = 0.1; this.onHud(this.hudState()); }
  };

  checkEnd(dt) {
    if (this.ended) return;
    const enemies = this.ships.filter((s) => s.team === 1 && !s.dead).length;
    const humansAlive = this.humanShips.length
      ? this.humanShips.filter((s) => !s.dead).length
      : this.ships.filter((s) => s.team === 0 && !s.dead).length;
    let result = null;
    if (enemies === 0) result = 'win'; else if (humansAlive === 0) result = 'lose';
    else if (!this.humanShips.length && this.player && this.player.dead) result = 'dead';
    if (result) {
      this.endTimer = (this.endTimer ?? 3.5) - dt;
      if (this.endTimer <= 0) {
        this.ended = true; this.endTimer = null;
        if (document.pointerLockElement) document.exitPointerLock();
        const win = result === 'win';
        const s = this.stats; const credits = Math.round(s.kills * 400 + s.damage * 3 + (win ? 1500 : 300));
        this.onEnd && this.onEnd({ win, kills: s.kills, damage: Math.round(s.damage), accuracy: s.shots ? Math.round((s.hits / s.shots) * 100) : 0, credits, xp: Math.round(credits * 0.6), time: Math.round(this.time), survived: humansAlive > 0, ships: this.humanShips.map((h) => ({ name: h.name, slot: h.humanSlot, kills: h.kills, alive: !h.dead })) });
      }
    }
  }

  hudState() {
    const p = this.player;
    const allies = this.ships.filter((s) => s.team === 0 && !s.dead).length, enemies = this.ships.filter((s) => s.team === 1 && !s.dead).length;
    this.messages = this.messages.filter((m) => (m.d -= 0.1) > 0);
    this.killfeed = this.killfeed.filter((k) => (k.t -= 0.1) > 0);
    if (!p) return { mode: this.mode };
    const t = p.target && !p.target.dead ? p.target : null;
    return {
      mode: this.mode, hp: p.hp, maxHp: p.maxHp, sh: p.sh, maxSh: p.maxSh, energy: p.energy, heat: p.heat, overheat: p.overheat,
      speed: Math.round(p.vel.length() * 3.6), throttle: p.throttle, boosting: p.boosting, missiles: p.missiles, kills: this.stats?.kills || 0, allies, enemies,
      target: t ? { name: t.name, cls: CLASSES[t.cls].name, hp: t.hp / t.maxHp, sh: t.sh / t.maxSh, dist: Math.round(t.group.position.distanceTo(p.group.position)) } : null,
      lock: p.lockT || 0, dead: p.dead, msg: this.messages[this.messages.length - 1]?.t, killfeed: this.killfeed.slice(), time: Math.round(this.time), bounds: this.warnBounds,
      roster: this.ships.map((s) => ({ name: s.name, team: s.team, dead: s.dead, cls: s.cls, me: s.isPlayer, kills: s.kills })),
    };
  }

  // ---------- 2D overlay ----------
  project(p) { const v = _v1.copy(p).project(this.camera); return { x: (v.x + 1) / 2 * this.cw, y: (1 - v.y) / 2 * this.ch, behind: v.z > 1 }; }
  drawOverlay(dt) {
    const c = this.octx, W = this.cw, H = this.ch; c.clearRect(0, 0, W, H);
    if (this.mode !== 'battle' || this.paused || this.ended) return;
    const p = this.player; const alive = p && !p.dead;
    c.lineWidth = 1.5; c.font = '600 11px ui-monospace, monospace'; c.textAlign = 'center';
    // ships markers
    for (const s of this.ships) {
      if (s.dead || s === p) continue;
      const pr = this.project(s.group.position); if (pr.behind) continue;
      const dist = this.camera.position.distanceTo(s.group.position);
      const sz = clamp(900 / dist * s.scale, 8, 40);
      const col = s.team === 0 ? 'rgba(90,180,255,0.85)' : 'rgba(255,80,60,0.9)';
      c.strokeStyle = col; c.fillStyle = col;
      const isT = alive && s === p.target;
      if (s.team === 1) {
        const q = sz * (isT ? 1.4 : 1), l = q * 0.4;
        c.beginPath();
        for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(pr.x + sx * q, pr.y + sy * q - sy * l); c.lineTo(pr.x + sx * q, pr.y + sy * q); c.lineTo(pr.x + sx * q - sx * l, pr.y + sy * q); }
        c.stroke();
        c.fillStyle = 'rgba(0,0,0,0.5)'; c.fillRect(pr.x - q, pr.y - q - 8, q * 2, 3);
        c.fillStyle = col; c.fillRect(pr.x - q, pr.y - q - 8, q * 2 * (s.hp / s.maxHp), 3);
        c.fillStyle = 'rgba(120,200,255,0.9)'; c.fillRect(pr.x - q, pr.y - q - 12, q * 2 * (s.sh / s.maxSh), 2);
        if (isT) {
          c.fillStyle = col; c.fillText(`${s.name}  ${Math.round(dist)}m`, pr.x, pr.y + q + 14);
          const lp = this.project(this.leadPoint(p, s));
          if (!lp.behind) { c.beginPath(); c.arc(lp.x, lp.y, 6, 0, 7); c.moveTo(lp.x - 10, lp.y); c.lineTo(lp.x - 4, lp.y); c.moveTo(lp.x + 4, lp.y); c.lineTo(lp.x + 10, lp.y); c.stroke();
            c.setLineDash([2, 4]); c.beginPath(); c.moveTo(pr.x, pr.y); c.lineTo(lp.x, lp.y); c.stroke(); c.setLineDash([]); }
          if (p.lockT > 0) {
            c.strokeStyle = p.lockT >= 1 ? 'rgba(255,40,40,1)' : 'rgba(255,200,60,0.9)';
            c.beginPath(); c.arc(pr.x, pr.y, q * 1.6, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.lockT); c.stroke();
            if (p.lockT >= 1) { c.fillStyle = 'rgba(255,40,40,1)'; c.fillText('NAMIERZONO', pr.x, pr.y - q * 1.6 - 8); }
          }
        }
      } else {
        c.beginPath(); c.moveTo(pr.x, pr.y - 8); c.lineTo(pr.x + 6, pr.y + 4); c.lineTo(pr.x - 6, pr.y + 4); c.closePath(); c.stroke();
        if (dist < 500) c.fillText(s.name, pr.x, pr.y - 12);
      }
    }
    // offscreen target arrow
    if (alive && p.target && !p.target.dead) {
      const pr = this.project(p.target.group.position);
      const off = pr.behind || pr.x < 0 || pr.x > W || pr.y < 0 || pr.y > H;
      if (off) {
        let dx = pr.x - W / 2, dy = pr.y - H / 2; if (pr.behind) { dx = -dx; dy = -dy; }
        const a = Math.atan2(dy, dx), r = Math.min(W, H) * 0.38;
        const x = W / 2 + Math.cos(a) * r, y = H / 2 + Math.sin(a) * r;
        c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = 'rgba(255,80,60,0.9)';
        c.beginPath(); c.moveTo(14, 0); c.lineTo(-6, -9); c.lineTo(-6, 9); c.closePath(); c.fill(); c.restore();
      }
    }
    // incoming missiles warning
    if (alive) for (const m of this.missiles) if (m.target === p) {
      const pr = this.project(m.mesh.position); let dx = pr.x - W / 2, dy = pr.y - H / 2; if (pr.behind) { dx = -dx; dy = -dy; }
      const a = Math.atan2(dy, dx), r = Math.min(W, H) * 0.3;
      c.fillStyle = `rgba(255,${(Math.sin(this.time * 20) > 0 ? 200 : 50)},0,0.95)`; c.fillText('▲ RAKIETA', W / 2 + Math.cos(a) * r, H / 2 + Math.sin(a) * r);
    }
    if (!alive) return;
    // crosshair (ship forward)
    const fwdP = this.project(_v2.copy(p.group.position).addScaledVector(_v3.set(0, 0, -1).applyQuaternion(p.group.quaternion), 400));
    c.strokeStyle = 'rgba(160,230,255,0.9)'; c.beginPath();
    c.arc(fwdP.x, fwdP.y, 16, 0.3, Math.PI - 0.3); c.moveTo(fwdP.x + 16 * Math.cos(Math.PI + 0.3), fwdP.y + 16 * Math.sin(Math.PI + 0.3)); c.arc(fwdP.x, fwdP.y, 16, Math.PI + 0.3, Math.PI * 2 - 0.3);
    c.moveTo(fwdP.x - 28, fwdP.y); c.lineTo(fwdP.x - 20, fwdP.y); c.moveTo(fwdP.x + 20, fwdP.y); c.lineTo(fwdP.x + 28, fwdP.y); c.stroke();
    c.fillStyle = 'rgba(160,230,255,0.9)'; c.fillRect(fwdP.x - 1, fwdP.y - 1, 2, 2);
    // heat arc
    c.strokeStyle = p.overheat ? 'rgba(255,60,40,0.95)' : `rgba(255,${200 - p.heat * 150 | 0},60,0.8)`; c.lineWidth = 3;
    c.beginPath(); c.arc(fwdP.x, fwdP.y, 34, Math.PI * 0.75, Math.PI * 0.75 + Math.PI * 0.5 * p.heat); c.stroke(); c.lineWidth = 1.5;
    // mouse cursor (tylko tryb komputerowy)
    if (!this.padMode) {
      const R = Math.min(W, H) * 0.32;
      c.strokeStyle = 'rgba(255,255,255,0.12)'; c.beginPath(); c.arc(W / 2, H / 2, R, 0, 7); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.7)'; c.beginPath(); c.arc(W / 2 + this.cursor.x, H / 2 + this.cursor.y, 5, 0, 7); c.stroke();
      c.strokeStyle = 'rgba(255,255,255,0.2)'; c.beginPath(); c.moveTo(W / 2, H / 2); c.lineTo(W / 2 + this.cursor.x, H / 2 + this.cursor.y); c.stroke();
    }
    // hit marker
    if (this.hitMarker > 0) {
      this.hitMarker -= dt; c.strokeStyle = `rgba(255,255,255,${this.hitMarker * 5})`; c.lineWidth = 2; c.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.moveTo(fwdP.x + sx * 6, fwdP.y + sy * 6); c.lineTo(fwdP.x + sx * 13, fwdP.y + sy * 13); }
      c.stroke(); c.lineWidth = 1.5;
    }
    // damage direction
    const inv = p.group.quaternion.clone().invert();
    this.dmgDirs = this.dmgDirs.filter((d) => (d.t -= dt) > 0);
    for (const d of this.dmgDirs) {
      const rel = _v1.subVectors(d.pos, p.group.position).applyQuaternion(inv);
      const a = Math.atan2(rel.z, rel.x) ;
      c.strokeStyle = `rgba(255,30,20,${d.t * 0.7})`; c.lineWidth = 8; c.beginPath(); c.arc(W / 2, H / 2, Math.min(W, H) * 0.22, a - 0.3, a + 0.3); c.stroke(); c.lineWidth = 1.5;
    }
    // radar
    const rx = 120, ry = H - 120, rr = 95, range = 1400;
    c.fillStyle = 'rgba(5,15,25,0.55)'; c.beginPath(); c.arc(rx, ry, rr, 0, 7); c.fill();
    c.strokeStyle = 'rgba(100,200,255,0.35)'; c.beginPath(); c.arc(rx, ry, rr, 0, 7); c.arc(rx, ry, rr * 0.5, 0, 7); c.moveTo(rx - rr, ry); c.lineTo(rx + rr, ry); c.moveTo(rx, ry - rr); c.lineTo(rx, ry + rr); c.stroke();
    const sw = (this.time * 1.5) % (Math.PI * 2);
    const grd = c.createConicGradient ? c.createConicGradient(sw, rx, ry) : null;
    if (grd) { grd.addColorStop(0, 'rgba(100,220,255,0.25)'); grd.addColorStop(0.15, 'rgba(100,220,255,0)'); grd.addColorStop(1, 'rgba(100,220,255,0)'); c.fillStyle = grd; c.beginPath(); c.arc(rx, ry, rr, 0, 7); c.fill(); }
    for (const s of this.ships) {
      if (s.dead || s === p) continue;
      const rel = _v1.subVectors(s.group.position, p.group.position).applyQuaternion(inv);
      let x = rel.x / range * rr, y = rel.z / range * rr; const l = Math.hypot(x, y); if (l > rr - 4) { x *= (rr - 4) / l; y *= (rr - 4) / l; }
      c.fillStyle = s.team === 0 ? '#5ab4ff' : '#ff5040';
      c.beginPath(); c.arc(rx + x, ry + y, s === p.target ? 4.5 : 3, 0, 7); c.fill();
      if (Math.abs(rel.y) > 30) { c.strokeStyle = c.fillStyle; c.beginPath(); c.moveTo(rx + x, ry + y); c.lineTo(rx + x, ry + y + (rel.y > 0 ? -7 : 7)); c.stroke(); }
    }
    for (const m of this.missiles) { const rel = _v1.subVectors(m.mesh.position, p.group.position).applyQuaternion(inv); const x = rel.x / range * rr, y = rel.z / range * rr; if (Math.hypot(x, y) < rr) { c.fillStyle = '#ffcc33'; c.fillRect(rx + x - 1, ry + y - 1, 2, 2); } }
    c.fillStyle = '#fff'; c.beginPath(); c.moveTo(rx, ry - 6); c.lineTo(rx + 4, ry + 4); c.lineTo(rx - 4, ry + 4); c.fill();
  }
}
