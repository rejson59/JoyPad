import { ACESFilmicToneMapping, BufferGeometry, Color, DirectionalLight, Float32BufferAttribute, FogExp2, HalfFloatType, HemisphereLight, Material, Mesh, Object3D, PCFSoftShadowMap, PerspectiveCamera, PointLight, SRGBColorSpace, Scene, SpotLight, Vector2, Vector3, WebGLRenderTarget, WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Track } from './track';
import { City, makeEnvironment, MOON_DIR } from './city';
import { Kart, ItemType } from './kart';
import { Particles } from './particles';
import { ItemManager } from './items';
import { driveAI, aiUseItem } from './ai';
import { AudioFX } from './audio';

export const KART_COLORS = [
  { name: 'Cyber Błękit', color: 0x0a4cff, accent: 0x00f0ff, css: '#00f0ff' },
  { name: 'Neon Róż', color: 0xd4145a, accent: 0xff2bd6, css: '#ff2bd6' },
  { name: 'Toksyczna Zieleń', color: 0x1f9e3a, accent: 0x7cff4f, css: '#7cff4f' },
  { name: 'Plazma Pomarańcz', color: 0xff5a00, accent: 0xffb000, css: '#ffb000' },
  { name: 'Fiolet Kwantowy', color: 0x5b1ac9, accent: 0xb04dff, css: '#b04dff' },
  { name: 'Chrom Biel', color: 0xd8dde6, accent: 0x4fd1ff, css: '#e8f0ff' },
];

const AI_NAMES = ['Nova', 'Blaze', 'Kira', 'Vex', 'Orion', 'Luna', 'Zed'];
export const NEON_RACE_DURATION = 210;

export interface NeonExternalInput {
  x: number;
  y: number;
  action: boolean;
}

export interface GameSettings {
  name: string;
  colorIdx: number;
  difficulty: number;
  quality: number;
  laps: number;
  rain: boolean;
  /** Optional JoyPad bridge. The first player can still use the keyboard. */
  playerCount?: number;
  aiCount?: number;
  playerNames?: string[];
  playerColorIdx?: number[];
  displayMode?: 'shared' | 'split';
  readInput?: (slot: number) => NeonExternalInput;
  playerSlots?: number[];
  onFx?: (slot: number, fx: 'fire' | 'hit' | 'pickup' | 'win' | 'dead') => void;
}

export interface Standing {
  slot: number;
  name: string;
  color: string;
  isPlayer: boolean;
  place: number;
  lap: number;
  progress: number;
  finished: boolean;
  time: number;
  bestLap: number;
}

export interface HudState {
  phase: 'intro' | 'countdown' | 'race' | 'finished';
  countdown: string | null;
  speed: number;
  lap: number;
  laps: number;
  place: number;
  total: number;
  item: ItemType | null;
  itemCount: number;
  rolling: boolean;
  driftLevel: number;
  drifting: boolean;
  boosting: boolean;
  shield: boolean;
  raceTime: number;
  lapTime: number;
  bestLap: number;
  message: string;
  messageId: number;
  wrongWay: boolean;
  standings: Standing[];
  results: Standing[] | null;
  paused: boolean;
  musicOn: boolean;
  airborne: boolean;
}

export interface TouchState {
  left: boolean;
  right: boolean;
  gas: boolean;
  brake: boolean;
  drift: boolean;
  item: boolean;
}

function mergeStatic(parent: Object3D, skip: Set<Object3D>) {
  const byMat = new Map<Material, BufferGeometry[]>();
  const cast = new Map<Material, boolean>();
  const remove: Mesh[] = [];
  for (const ch of parent.children) {
    if (!(ch instanceof Mesh) || skip.has(ch) || ch.children.length) continue;
    const mat = ch.material as Material;
    ch.updateMatrix();
    let g = ch.geometry.index ? ch.geometry.toNonIndexed() : ch.geometry.clone();
    g.applyMatrix4(ch.matrix);
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    if (!g.attributes.uv) {
      g.setAttribute('uv', new Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    g.clearGroups();
    g = g as BufferGeometry;
    if (!byMat.has(mat)) byMat.set(mat, []);
    byMat.get(mat)!.push(g);
    cast.set(mat, cast.get(mat) || ch.castShadow);
    remove.push(ch);
  }
  remove.forEach((m) => parent.remove(m));
  byMat.forEach((geos, mat) => {
    const merged = mergeGeometries(geos, false);
    if (!merged) return;
    const m = new Mesh(merged, mat);
    m.castShadow = !!cast.get(mat);
    m.receiveShadow = true;
    parent.add(m);
  });
}

const FinalShader = {
  uniforms: {
    tDiffuse: { value: null },
    uSpeed: { value: 0 },
    uTime: { value: 0 },
    uHit: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uSpeed; uniform float uTime; uniform float uHit;
    varying vec2 vUv;
    void main(){
      vec2 uv = vUv; vec2 c = uv - 0.5;
      float r = length(c);
      float amt = uSpeed * 0.035 * smoothstep(0.12, 0.75, r);
      vec3 col = vec3(0.0);
      for (int i = 0; i < 8; i++) { float k = float(i) / 7.0; col += texture2D(tDiffuse, uv - c * amt * k).rgb; }
      col /= 8.0;
      float ca = (0.004 + uSpeed * 0.01 + uHit * 0.03) * r;
      col.r = mix(col.r, texture2D(tDiffuse, uv + c * ca).r, 0.7);
      col.b = mix(col.b, texture2D(tDiffuse, uv - c * ca).b, 0.7);
      col *= 1.0 - smoothstep(0.4, 0.95, r) * 0.6;
      col = mix(col, col * vec3(1.5, 0.45, 0.45), uHit * 0.55);
      float g = fract(sin(dot(uv * (uTime + 1.0), vec2(12.9898, 78.233))) * 43758.5453);
      col += (g - 0.5) * 0.02;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class NeonRushScene {
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera: PerspectiveCamera;
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private finalPass: ShaderPass;
  private track: Track;
  private city: City;
  private karts: Kart[] = [];
  private players: Kart[] = [];
  player: Kart;
  private splitCameras: PerspectiveCamera[] = [];
  private externalAction = new Map<number, boolean>();
  private sparks: Particles;
  private smoke: Particles;
  private items: ItemManager;
  audio = new AudioFX();
  private moon: DirectionalLight;
  private headlight: SpotLight;
  private boostLight: PointLight;
  private raf = 0;
  private last = 0;
  private acc = 0;
  private time = 0;
  private phase: HudState['phase'] = 'intro';
  private phaseTime = 0;
  private raceTime = 0;
  private keys = new Set<string>();
  touch: TouchState = { left: false, right: false, gas: false, brake: false, drift: false, item: false };
  private paused = false;
  private camPos = new Vector3();
  private camLook = new Vector3();
  private camVel = new Vector3();
  private camYaw = 0;
  private shake = 0;
  private hitFx = 0;
  private lookBack = false;
  private baseMax: number;
  private hudTimer = 0;
  private message = '';
  private messageId = 0;
  private wrongTimer = 0;
  private startPress = -1;
  private countdownStep = -1;
  private results: Standing[] | null = null;
  private finishTimer = -1;
  private minimap: HTMLCanvasElement | null = null;
  private mmBounds = { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
  private mmPath: Path2D | null = null;
  private frame = 0;
  private padCooldown = new Map<Kart, number>();
  private itemPressed = false;
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private disposed = false;

  constructor(
    private container: HTMLElement,
    private settings: GameSettings,
    private onHud: (h: HudState) => void,
  ) {
    const q = settings.quality;
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    const dpr = window.devicePixelRatio || 1;
    const pr = q === 0 ? Math.min(dpr, 1) * 0.75 : q === 1 ? Math.min(dpr, 1.25) : Math.min(dpr, 2);
    this.renderer = new WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.82;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.position = 'absolute';
    this.renderer.domElement.style.inset = '0';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.renderer.domElement.setAttribute('aria-label', 'Neonowy Pęd 3D');

    this.camera = new PerspectiveCamera(70, width / height, 0.25, 6000);
    this.scene.fog = new FogExp2(new Color(0.11, 0.04, 0.1), 0.0017);
    this.scene.environment = makeEnvironment(this.renderer);

    // światła
    const hemi = new HemisphereLight(0x5a66ff, 0x2a1020, 0.24);
    this.scene.add(hemi);
    this.moon = new DirectionalLight(0xa8b8ff, 0.72);
    this.moon.castShadow = true;
    const sm = q === 0 ? 512 : q === 1 ? 1024 : 2048;
    this.moon.shadow.mapSize.set(sm, sm);
    const sc = this.moon.shadow.camera;
    sc.left = -55;
    sc.right = 55;
    sc.top = 55;
    sc.bottom = -55;
    sc.near = 1;
    sc.far = 400;
    this.moon.shadow.bias = -0.0004;
    this.moon.shadow.normalBias = 0.03;
    this.scene.add(this.moon);
    this.scene.add(this.moon.target);

    this.track = new Track();
    this.city = new City(this.track, { rain: settings.rain });
    this.scene.add(this.city.group);

    this.sparks = new Particles(q === 0 ? 2500 : 5000, true, pr);
    this.smoke = new Particles(q === 0 ? 1500 : 3000, false, pr);
    this.scene.add(this.smoke.points);
    this.scene.add(this.sparks.points);

    // karty
    const diffMul = [0.88, 1.0, 1.12][settings.difficulty];
    this.baseMax = 38 * diffMul;
    const others = KART_COLORS.filter((_, i) => i !== settings.colorIdx);
    const extraColors = [
      { color: 0xffd400, accent: 0xfff27a, css: '#fff27a' },
      { color: 0x222831, accent: 0xff3b3b, css: '#ff3b3b' },
    ];
    const aiColors = [...others, ...extraColors];
    const playerCount = Math.max(1, Math.min(4, settings.playerCount ?? 1));
    const aiCount = Math.max(0, Math.min(7, settings.aiCount ?? 8 - playerCount));
    const gridOrder = Array.from({ length: Math.min(8, playerCount + aiCount) }, (_, index) => index);
    const L = this.track.length;
    gridOrder.forEach((slot) => {
      const isPlayer = slot < playerCount;
      const playerIndex = slot;
      const aiIdx = slot - playerCount;
      const playerColor = KART_COLORS[(settings.playerColorIdx?.[playerIndex] ?? (settings.colorIdx + playerIndex)) % KART_COLORS.length];
      const c = isPlayer ? playerColor : aiColors[Math.max(0, aiIdx) % aiColors.length];
      const skillBase = [0.96, 1.0, 1.03][settings.difficulty];
      const k = new Kart({
        name: isPlayer ? settings.playerNames?.[playerIndex] || (playerIndex === 0 ? settings.name || 'Ty' : `Gracz ${playerIndex + 1}`) : AI_NAMES[Math.max(0, aiIdx) % AI_NAMES.length],
        color: c.color,
        accent: c.accent,
        isPlayer,
        skill: isPlayer ? 1 : skillBase - Math.max(0, aiIdx) * 0.012 + Math.random() * 0.02,
      });
      (k as Kart & { css: string }).css = c.css;
      const row = Math.floor(slot / 2);
      const lat = (slot % 2 === 0 ? 4.5 : -4.5) * 1;
      k.place_at(this.track, L - 10 - row * 8 - (slot % 2) * 3, lat);
      k.maxSpeed = this.baseMax;
      k.lap = 0;
      k.halfway = true;
      k.aiLane = lat;
      k.aiItemTimer = 1 + Math.random() * 3;
      mergeStatic(k.body, new Set());
      k.group.traverse((o) => {
        if (o.name === 'wheelspin') mergeStatic(o, new Set());
      });
      this.scene.add(k.group);
      this.karts.push(k);
      if (isPlayer) {
        this.players.push(k);
        if (playerIndex === 0) this.player = k;
      }
    });
    this.player = this.players[0] || this.karts[0];
    this.splitCameras = this.players.map(() => new PerspectiveCamera(68, 1, 0.25, 6000));

    // reflektory gracza
    this.headlight = new SpotLight(0xe8f0ff, 38, 90, 0.5, 0.55, 1.6);
    this.headlight.position.set(0, 0.6, 1.4);
    this.headlight.target.position.set(0, 0, 20);
    this.player.body.add(this.headlight);
    this.player.body.add(this.headlight.target);
    this.boostLight = new PointLight(0xff8a30, 0, 10, 2);
    this.boostLight.position.set(0, 0.7, -2.2);
    this.player.body.add(this.boostLight);

    this.items = new ItemManager(this.track, this.sparks, this.smoke, {
      onPickup: (k) => {
        if (k === this.player) this.audio.play('pickup');
        if (k.cfg.isPlayer) this.settings.onFx?.(this.settings.playerSlots?.[this.players.indexOf(k)] ?? this.players.indexOf(k), 'pickup');
      },
      onExplosion: (p, victim) => {
        const d = p.distanceTo(this.player.pos);
        this.audio.play('explosion', Math.max(0.05, 1 - d / 120));
        if (d < 40) this.shake = Math.max(this.shake, 1 - d / 40);
        if (victim?.cfg.isPlayer) this.settings.onFx?.(this.settings.playerSlots?.[this.players.indexOf(victim)] ?? this.players.indexOf(victim), 'hit');
        if (victim === this.player) {
          this.hitFx = 1;
          this.audio.play('hit');
          this.flash('TRAFIONY!');
        }
      },
      onUse: (k, item) => {
        const near = k.pos.distanceTo(this.player.pos);
        const v = k === this.player ? 1 : Math.max(0, 0.6 - near / 100);
        if (item === 'boost' || item === 'triple') this.audio.play('boost', v);
        if (item === 'rocket') this.audio.play('shoot', v);
        if (item === 'shield') this.audio.play('shield', v);
        if (item === 'mine') this.audio.play('bump', v);
      },
    });
    this.scene.add(this.items.group);

    // postprocessing
    const size = new Vector2();
    this.renderer.getDrawingBufferSize(size);
    const rt = new WebGLRenderTarget(size.x, size.y, {
      type: HalfFloatType,
      samples: q === 2 ? 4 : q === 1 ? 2 : 0,
    });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new Vector2(size.x / 2, size.y / 2), 0.34, 0.38, 0.94);
    this.composer.addPass(this.bloom);
    this.finalPass = new ShaderPass(FinalShader);
    this.composer.addPass(this.finalPass);
    this.composer.addPass(new OutputPass());
    this.composer.setPixelRatio(pr);
    this.composer.setSize(width, height);

    // minimapa
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (let i = 0; i < this.track.N; i++) {
      minX = Math.min(minX, this.track.px[i]);
      maxX = Math.max(maxX, this.track.px[i]);
      minZ = Math.min(minZ, this.track.pz[i]);
      maxZ = Math.max(maxZ, this.track.pz[i]);
    }
    this.mmBounds = { minX, maxX, minZ, maxZ };

    // kamera startowa
    this.player.forward(this.tmp);
    this.camYaw = this.player.yaw;
    this.camPos.copy(this.player.pos).addScaledVector(this.tmp, 10).add(new Vector3(0, 3, 0));
    this.camLook.copy(this.player.pos);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    document.addEventListener('visibilitychange', this.onVisibility);
  }

  start() {
    this.audio.init(this.settings.rain);
    this.audio.resume();
    this.audio.startMusic();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  setMinimap(c: HTMLCanvasElement | null) {
    this.minimap = c;
    this.mmPath = null;
  }

  togglePause() {
    if (this.phase === 'finished' && this.results) return;
    this.paused = !this.paused;
    if (this.paused) this.audio.suspend();
    else {
      this.audio.resume();
      this.last = performance.now();
    }
    this.emitHud();
  }

  toggleMusic() {
    this.audio.toggleMusic();
    this.emitHud();
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.audio.dispose();
    this.scene.traverse((o) => {
      const m = o as Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private onVisibility = () => {
    if (document.hidden && !this.paused && this.phase !== 'finished') this.togglePause();
  };

  private onKeyDown = (e: KeyboardEvent) => {
    const k = e.code;
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(k)) e.preventDefault();
    if (e.repeat) return;
    this.keys.add(k);
    if (k === 'Escape' || k === 'KeyP') this.togglePause();
    if (k === 'KeyM') this.toggleMusic();
    if (k === 'KeyR' && this.phase === 'race' && !this.paused) this.respawn(this.player);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onResize = () => {
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
  };

  private respawn(k: Kart) {
    const s = k.s;
    k.place_at(this.track, s, 0);
    k.pos.y += 0.5;
    k.airborne = true;
    k.vy = 0;
    k.drifting = false;
    k.spinTime = 0;
    k.spinAngle = 0;
    this.flash('RESPAWN');
  }

  private flash(msg: string) {
    this.message = msg;
    this.messageId++;
  }

  private readInput(slot = 0) {
    const car = this.players[slot] || this.player;
    const external = this.settings.readInput?.(slot);
    // Telefoniczne pady są kierunkowe: wychylenie w górę oznacza gaz,
    // a przycisk akcji uruchamia krótkie turbo. Pierwszy slot zachowuje
    // również klawiaturę jako pełny fallback.
    const hasExternal = Boolean(external && (Math.abs(external.x) > 0.02 || Math.abs(external.y) > 0.02 || external.action));
    if (external && (slot > 0 || hasExternal)) {
      car.controls.throttle = Math.max(0, Math.min(1, -external.y));
      car.controls.brake = Math.max(0, Math.min(1, external.y));
      car.controls.steer = Math.max(-1, Math.min(1, -external.x));
      car.controls.drift = false;
      const wasPressed = this.phase === 'race' ? (this.externalAction.get(slot) ?? false) : false;
      if (external.action && !wasPressed && this.phase === 'race') {
        if (car.item && car.rolling <= 0) this.items.use(car, this.karts);
        else car.startBoost(0.16, 4);
        this.settings.onFx?.(this.settings.playerSlots?.[slot] ?? slot, 'fire');
      }
      this.externalAction.set(slot, this.phase === 'race' ? external.action : false);
      return;
    }
    if (slot > 0) {
      car.controls.throttle = 0;
      car.controls.brake = 0;
      car.controls.steer = 0;
      car.controls.drift = false;
      this.externalAction.set(slot, false);
      return;
    }
    const k = this.keys;
    const t = this.touch;
    let throttle = k.has('KeyW') || k.has('ArrowUp') || t.gas ? 1 : 0;
    let brake = k.has('KeyS') || k.has('ArrowDown') || t.brake ? 1 : 0;
    let steer = 0;
    if (k.has('KeyA') || k.has('ArrowLeft') || t.left) steer += 1;
    if (k.has('KeyD') || k.has('ArrowRight') || t.right) steer -= 1;
    let drift = k.has('ShiftLeft') || k.has('ShiftRight') || k.has('Space') || t.drift;
    let item = k.has('KeyE') || k.has('ControlLeft') || k.has('KeyX') || k.has('Enter') || t.item;
    this.lookBack = k.has('KeyC');
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p) continue;
      const ax = p.axes[0] || 0;
      if (Math.abs(ax) > 0.15) steer = -ax;
      const rt = p.buttons[7]?.value || 0;
      const lt = p.buttons[6]?.value || 0;
      if (rt > 0.1 || p.buttons[0]?.pressed) throttle = Math.max(throttle, rt > 0.1 ? rt : 1);
      if (lt > 0.1) brake = Math.max(brake, lt);
      if (p.buttons[5]?.pressed || p.buttons[1]?.pressed) drift = true;
      if (p.buttons[2]?.pressed || p.buttons[4]?.pressed) item = true;
      if (p.buttons[3]?.pressed) this.lookBack = true;
      break;
    }
    const c = car.controls;
    c.throttle = throttle;
    c.brake = brake;
    c.steer = Math.max(-1, Math.min(1, steer));
    c.drift = drift;
    if (item && !this.itemPressed && this.phase === 'race') {
      if (car.item && car.rolling <= 0) this.items.use(car, this.karts);
      else car.startBoost(0.16, 4);
    }
    this.itemPressed = this.phase === 'race' ? item : false;
  }

  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > 0.1) dt = 0.1;
    if (this.paused) return;
    this.update(dt);
    if (this.settings.displayMode === 'split' && this.players.length > 1) this.renderSplit();
    else this.composer.render(dt);
  };

  /** Shared world, multiple chase cameras. Bloom is intentionally reduced in split mode. */
  private renderSplit() {
    const size = new Vector2();
    this.renderer.getDrawingBufferSize(size);
    const count = Math.min(4, this.players.length);
    const columns = count <= 2 ? count : 2;
    const rows = Math.ceil(count / columns);
    const panelW = Math.floor(size.x / columns);
    const panelH = Math.floor(size.y / rows);
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, size.x, size.y);
    this.renderer.setClearColor(0x05030c, 1);
    this.renderer.clear(true, true, true);
    this.renderer.setScissorTest(true);
    for (let i = 0; i < count; i++) {
      const p = this.players[i];
      const camera = this.splitCameras[i];
      const col = i % columns;
      const row = Math.floor(i / columns);
      const x = col * panelW;
      const y = size.y - (row + 1) * panelH;
      const forward = p.forward(this.tmp2);
      const distance = 6.6 + Math.max(0, p.vf / this.baseMax) * 1.1;
      camera.position.set(p.pos.x - forward.x * distance, p.pos.y + 2.5, p.pos.z - forward.z * distance);
      camera.lookAt(p.pos.x + forward.x * 4, p.pos.y + 1.1, p.pos.z + forward.z * 4);
      camera.aspect = panelW / Math.max(1, panelH);
      camera.updateProjectionMatrix();
      this.renderer.setViewport(x, y, panelW, panelH);
      this.renderer.setScissor(x, y, panelW, panelH);
      this.renderer.render(this.scene, camera);
    }
    this.renderer.setScissorTest(false);
    this.renderer.setViewport(0, 0, size.x, size.y);
  }

  private update(dt: number) {
    this.time += dt;
    this.phaseTime += dt;
    this.frame++;
    const raceOn = this.phase === 'race' || this.phase === 'finished';

    // fazy
    if (this.phase === 'intro' && this.phaseTime > 3.2) {
      this.phase = 'countdown';
      this.phaseTime = 0;
    }
    if (this.phase === 'countdown') {
      const step = Math.floor(this.phaseTime);
      if (step !== this.countdownStep && step < 3) {
        this.countdownStep = step;
        this.audio.play('beep');
      }
      this.city.startLights.forEach((m, i) => {
        const on = this.phaseTime > (i * 3) / 5;
        m.color.setRGB(on ? 1.8 : 0.1, on ? 0.08 : 0.02, on ? 0.08 : 0.02);
      });
      this.players.forEach((_, slot) => this.readInput(slot));
      const c = this.player.controls;
      if (c.throttle > 0) {
        if (this.startPress < 0) this.startPress = this.phaseTime;
      } else this.startPress = -1;
      if (this.phaseTime >= 3) {
        this.phase = 'race';
        this.phaseTime = 0;
        this.raceTime = 0;
        this.audio.play('go');
        this.flash('START!');
        this.city.startLights.forEach((m) => m.color.setRGB(0.1, 1.7, 0.25));
        if (this.startPress > 2.2 && c.throttle > 0) {
          this.player.startBoost(1.3, 4);
          this.audio.play('boost');
          this.flash('RAKIETOWY START!');
        }
        this.karts.forEach((k) => {
          if (!k.cfg.isPlayer && Math.random() < 0.5 * k.cfg.skill) k.startBoost(0.8 + Math.random() * 0.5, 4);
        });
      }
    }
    if (this.phase === 'race' || this.phase === 'finished') this.raceTime += dt;
    if (this.phase === 'race' && this.raceTime >= NEON_RACE_DURATION) {
      // A stalled kart must not leave the JoyPad round without a result.
      this.players.forEach((k) => {
        if (!k.finished) {
          k.finished = true;
          k.finishTime = this.raceTime;
        }
      });
      this.phase = 'finished';
      this.phaseTime = 0;
      this.finishTimer = 0.35;
    }
    if (this.phase === 'race') this.players.forEach((_, slot) => { if (!this.players[slot].finished) this.readInput(slot); });

    // fizyka w stałym kroku
    const h = 1 / 120;
    this.acc += dt;
    let steps = 0;
    const leader = this.player;
    while (this.acc >= h && steps < 12) {
      this.acc -= h;
      steps++;
      for (const k of this.karts) {
        if (raceOn && (!k.cfg.isPlayer || k.finished)) {
          driveAI(k, this.track, this.karts, leader, k.cfg.isPlayer ? this.baseMax * 0.9 : this.baseMax, h);
          if (k.finished) k.maxSpeed = this.baseMax * 0.8;
        }
        if (k.cfg.isPlayer && !k.finished) k.maxSpeed = this.baseMax;
        const lvl = k.update(h, this.track, raceOn);
        if (lvl > 0 && k === this.player) this.audio.play('boost', 0.6 + lvl * 0.15);
      }
      this.collideKarts();
    }

    // zdarzenia
    const L = this.track.length;
    for (const k of this.karts) {
      // boost pady
      const cd = (this.padCooldown.get(k) || 0) - dt;
      this.padCooldown.set(k, cd);
      if (cd <= 0 && !k.airborne) {
        for (const p of this.track.boostPads) {
          let ds = k.s - p.s;
          if (ds > L / 2) ds -= L;
          if (ds < -L / 2) ds += L;
          if (Math.abs(ds) < 4.5 && Math.abs(k.proj.lateral - p.lateral) < 3) {
            k.startBoost(1.1, 4);
            this.padCooldown.set(k, 0.8);
            if (k === this.player) {
              this.audio.play('boost', 0.8);
              this.shake = Math.max(this.shake, 0.25);
            }
          }
        }
      }
      // losowanie przedmiotu
      if (k.rolling > 0) {
        k.rolling -= dt;
        if (k.rolling <= 0) {
          k.rolling = 0;
          k.item = ItemManager.rollItem(k.place, this.karts.length);
          k.itemCount = k.item === 'triple' ? 3 : 1;
          if (k === this.player) this.audio.play('item');
        }
      }
      k.itemCooldown = Math.max(0, k.itemCooldown - dt);
      if (raceOn && (!k.cfg.isPlayer || k.finished)) aiUseItem(k, this.karts, () => this.items.use(k, this.karts), dt);

      // okrążenia
      if (k.lapCrossed) {
        k.lapCrossed = false;
        if (k.lap > 1) {
          k.lapTimes.push(this.raceTime - k.lapStart);
        }
        k.lapStart = this.raceTime;
        if (k.lap > this.settings.laps && !k.finished) {
          k.finished = true;
          k.finishTime = this.raceTime;
          if (k.cfg.isPlayer) {
            this.settings.onFx?.(this.settings.playerSlots?.[this.players.indexOf(k)] ?? this.players.indexOf(k), 'win');
            if (k === this.player) {
              this.audio.play('finish');
              this.flash(`META! MIEJSCE ${k.place}`);
            }
            if (this.players.every((player) => player.finished)) {
              this.phase = 'finished';
              this.phaseTime = 0;
              this.finishTimer = 4.5;
            }
          }
        } else if (k.cfg.isPlayer && k === this.player && k.lap > 1) {
          this.audio.play('lap');
          if (k.lap === this.settings.laps) this.flash('OSTATNIE OKRĄŻENIE!');
          else this.flash(`OKRĄŻENIE ${k.lap}/${this.settings.laps}`);
        }
      }
      // utknięcie AI
      if (!k.cfg.isPlayer && raceOn && Math.abs(k.vf) < 1.5 && k.spinTime <= 0) {
        k.aiLaneTimer -= dt * 0.2;
        (k as Kart & { stuck?: number }).stuck = ((k as Kart & { stuck?: number }).stuck || 0) + dt;
        if (((k as Kart & { stuck?: number }).stuck || 0) > 3) {
          k.place_at(this.track, k.s, 0);
          (k as Kart & { stuck?: number }).stuck = 0;
        }
      } else (k as Kart & { stuck?: number }).stuck = 0;
    }

    // miejsca
    const sorted = [...this.karts].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.progress - a.progress;
    });
    sorted.forEach((k, i) => (k.place = i + 1));

    this.items.update(dt, this.time, this.karts);
    this.emitParticles(dt);
    this.sparks.update(dt);
    this.smoke.update(dt);

    // dźwięki gracza
    const p = this.player;
    if (p.wallHit > 4 && this.frame % 6 === 0) {
      this.audio.play('wall', Math.min(1, p.wallHit / 15));
      this.shake = Math.max(this.shake, Math.min(0.6, p.wallHit / 30));
    }
    if (p.landingImpact > 4) {
      this.audio.play('land', Math.min(1, p.landingImpact / 14));
      this.shake = Math.max(this.shake, Math.min(0.7, p.landingImpact / 20));
      const q = p.pos;
      this.smoke.burst(q, 18, 5, [0.3, 0.3, 0.35], 1.5, 0.9, { drag: 3, grow: 2 });
      this.sparks.burst(q, 25, 8, [4, 2.5, 1], 0.3, 0.4, { gravity: 20, drag: 1 });
    }
    this.audio.setEngine(
      p.vf / this.baseMax,
      p.controls.throttle,
      p.boostTime > 0,
      p.drifting,
      p.driftLevel,
      p.airborne,
    );

    // zły kierunek
    const fx = Math.sin(p.yaw);
    const fz = Math.cos(p.yaw);
    const dot = fx * p.proj.tx + fz * p.proj.tz;
    if (this.phase === 'race' && dot < -0.4 && Math.abs(p.vf) > 3) this.wrongTimer += dt;
    else this.wrongTimer = Math.max(0, this.wrongTimer - dt * 2);

    // wyniki
    if (this.finishTimer > 0) {
      this.finishTimer -= dt;
      if (this.finishTimer <= 0) this.buildResults(sorted);
    }

    this.hitFx = Math.max(0, this.hitFx - dt * 1.5);
    this.updateCamera(dt);
    this.updateLights();
    this.city.update(this.time, dt, this.camera.position, this.camVel);

    const speedRatio = Math.max(0, p.vf / this.baseMax);
    const u = this.finalPass.uniforms;
    u.uSpeed.value += ((p.boostTime > 0 ? 1 : 0) * 0.8 + Math.max(0, speedRatio - 0.6) * 0.5 - u.uSpeed.value) * Math.min(1, dt * 4);
    u.uTime.value = this.time % 100;
    u.uHit.value = this.hitFx;

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 1 / 20;
      this.emitHud();
    }
    if (this.frame % 2 === 0) this.drawMinimap();
  }

  private collideKarts() {
    const ks = this.karts;
    const R = 2.2;
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const a = ks[i];
        const b = ks[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        if (Math.abs(b.pos.y - a.pos.y) > 2) continue;
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const ov = (R - d) / 2;
        a.pos.x -= nx * ov;
        a.pos.z -= nz * ov;
        b.pos.x += nx * ov;
        b.pos.z += nz * ov;
        const rv = (b.vel.x - a.vel.x) * nx + (b.vel.z - a.vel.z) * nz;
        if (rv < 0) {
          // tarcza / turbo daje przewagę masy
          const ma = 1 + (a.shieldTime > 0 ? 3 : 0) + (a.boostTime > 0 ? 1 : 0);
          const mb = 1 + (b.shieldTime > 0 ? 3 : 0) + (b.boostTime > 0 ? 1 : 0);
          const jimp = (-(1 + 0.5) * rv) / (1 / ma + 1 / mb);
          a.vel.x -= (nx * jimp) / ma;
          a.vel.z -= (nz * jimp) / ma;
          b.vel.x += (nx * jimp) / mb;
          b.vel.z += (nz * jimp) / mb;
          if ((a === this.player || b === this.player) && -rv > 2.5) {
            this.audio.play('bump', Math.min(1, -rv / 12));
            this.shake = Math.max(this.shake, Math.min(0.4, -rv / 30));
            this.tmp.set((a.pos.x + b.pos.x) / 2, a.pos.y + 0.5, (a.pos.z + b.pos.z) / 2);
            this.sparks.burst(this.tmp, 20, 7, [4, 2.8, 1.2], 0.25, 0.4, { gravity: 18, drag: 1 });
          }
        }
      }
    }
  }

  private emitParticles(dt: number) {
    const sp = this.sparks;
    const sm = this.smoke;
    const w = this.tmp;
    for (const k of this.karts) {
      const near = k.pos.distanceToSquared(this.camera.position) < 150 * 150;
      if (!near) continue;
      const speed = Math.abs(k.vf);
      // drift — iskry i dym
      if (k.drifting && !k.airborne) {
        const colors: [number, number, number][] = [
          [3, 2.4, 1.2],
          [0.6, 1.8, 5],
          [5, 1.8, 0.2],
          [3.2, 0.6, 5],
        ];
        const c = colors[k.driftLevel];
        for (const wi of [2, 3]) {
          k.wheelWorld(wi, w);
          const n = k.driftLevel > 0 ? 3 : 1;
          for (let i = 0; i < n; i++) {
            sp.emit(
              w.x,
              w.y + 0.1,
              w.z,
              -k.vel.x * 0.15 + (Math.random() - 0.5) * 5,
              2 + Math.random() * 4,
              -k.vel.z * 0.15 + (Math.random() - 0.5) * 5,
              c[0],
              c[1],
              c[2],
              0.18 + k.driftLevel * 0.06,
              0.25 + Math.random() * 0.25,
              { gravity: 22, drag: 1.5 },
            );
          }
          // Time-based, short-lived wisps instead of an opaque plume at camera height.
          if (Math.random() < 1 - Math.exp(-10 * dt))
            sm.emit(w.x, w.y + 0.2, w.z, (Math.random() - 0.5) * 1.5, 0.8 + Math.random(), (Math.random() - 0.5) * 1.5, 0.55, 0.55, 0.6, 0.48, 0.45, {
              drag: 2.5,
              grow: 0.65,
              opacity: 0.24,
            });
        }
      }
      // mokra nawierzchnia — rozbryzg wody
      if (this.settings.rain && speed > 14 && !k.airborne && Math.random() < 1 - Math.exp(-12 * dt)) {
        for (const wi of [2, 3]) {
          k.wheelWorld(wi, w);
          sm.emit(
            w.x,
            w.y + 0.12,
            w.z,
            -k.vel.x * 0.25 + (Math.random() - 0.5) * 2,
            0.25 + Math.random() * 0.5,
            -k.vel.z * 0.25 + (Math.random() - 0.5) * 2,
            0.45,
            0.5,
            0.6,
            0.18 + Math.min(speed, 70) * 0.003,
            0.22,
            { drag: 4, gravity: 6, grow: 0.45, opacity: 0.16 },
          );
        }
      }
      // turbo — płomienie
      if (k.boostTime > 0) {
        for (const ei of [0, 1]) {
          k.exhaustWorld(ei, w);
          const f = k.forward(this.tmp2);
          const cc: [number, number, number] =
            k.boostKind === 1 ? [0.6, 1.8, 5] : k.boostKind === 2 ? [5, 1.8, 0.3] : k.boostKind === 3 ? [3.2, 0.6, 5] : [5, 2.2, 0.6];
          for (let i = 0; i < 2; i++)
            sp.emit(
              w.x,
              w.y,
              w.z,
              k.vel.x * 0.6 - f.x * 12 + (Math.random() - 0.5) * 2,
              (Math.random() - 0.3) * 2,
              k.vel.z * 0.6 - f.z * 12 + (Math.random() - 0.5) * 2,
              cc[0],
              cc[1],
              cc[2],
              0.45,
              0.2 + Math.random() * 0.15,
              { drag: 3 },
            );
        }
      }
      // uderzenie o ścianę
      if (k.wallHit > 3) {
        w.set(k.pos.x + k.proj.nx * k.wallSide * 0.9, k.pos.y + 0.5, k.pos.z + k.proj.nz * k.wallSide * 0.9);
        for (let i = 0; i < Math.min(12, k.wallHit); i++)
          sp.emit(
            w.x,
            w.y,
            w.z,
            k.vel.x * 0.5 + (Math.random() - 0.5) * 8,
            Math.random() * 6,
            k.vel.z * 0.5 + (Math.random() - 0.5) * 8,
            5,
            3,
            1.2,
            0.2,
            0.35 + Math.random() * 0.3,
            { gravity: 25, drag: 0.8 },
          );
      }
      // obracanie po trafieniu — dym
      if (k.spinTime > 0 && Math.random() < 0.5) {
        sm.emit(k.pos.x, k.pos.y + 0.8, k.pos.z, (Math.random() - 0.5) * 2, 2, (Math.random() - 0.5) * 2, 0.2, 0.2, 0.22, 1.6, 1.3, { drag: 1, grow: 2 });
        sp.emit(k.pos.x, k.pos.y + 1.2, k.pos.z, (Math.random() - 0.5) * 6, 3 + Math.random() * 3, (Math.random() - 0.5) * 6, 0.5, 2, 5, 0.25, 0.4, { gravity: 10 });
      }
    }
    void dt;
  }

  private updateCamera(dt: number) {
    const p = this.player;
    const cam = this.camera;
    const prev = cam.position.clone();
    const up = this.tmp2.set(0, 1, 0);
    const speedRatio = Math.max(0, p.vf / this.baseMax);
    const boosting = p.boostTime > 0;

    if (this.phase === 'intro') {
      const t = Math.min(1, this.phaseTime / 3.2);
      const e = t * t * (3 - 2 * t);
      const ang = p.yaw + Math.PI * (1 - e) * 1.2 + Math.PI * 0.0;
      const r = 12 - e * 5.5;
      const hgt = 4 - e * 1.6;
      const back = ang + Math.PI;
      this.camPos.set(p.pos.x + Math.sin(back) * -r, p.pos.y + hgt, p.pos.z + Math.cos(back) * -r);
      this.camPos.set(p.pos.x - Math.sin(ang) * r, p.pos.y + hgt, p.pos.z - Math.cos(ang) * r);
      this.camLook.set(p.pos.x, p.pos.y + 1, p.pos.z);
      this.camYaw = p.yaw;
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      cam.fov = 60;
    } else if (this.phase === 'finished' && this.finishTimer < 3.5) {
      const a = this.time * 0.35;
      this.camPos.lerp(new Vector3(p.pos.x + Math.sin(a) * 9, p.pos.y + 3.5, p.pos.z + Math.cos(a) * 9), 1 - Math.exp(-3 * dt));
      this.camLook.lerp(new Vector3(p.pos.x, p.pos.y + 1, p.pos.z), 1 - Math.exp(-6 * dt));
      cam.position.copy(this.camPos);
      cam.lookAt(this.camLook);
      cam.fov += (60 - cam.fov) * dt * 2;
    } else {
      // kurs kamery — mix kierunku jazdy i kursu kartu
      let heading = p.yaw;
      const sp2 = p.vel.x * p.vel.x + p.vel.z * p.vel.z;
      if (sp2 > 16 && p.vf > 0) {
        const vh = Math.atan2(p.vel.x, p.vel.z);
        let d = vh - p.yaw;
        while (d > Math.PI) d -= Math.PI * 2;
        while (d < -Math.PI) d += Math.PI * 2;
        heading = p.yaw + d * 0.55;
      }
      if (p.spinTime > 0) heading = this.camYaw;
      let dy = heading - this.camYaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      this.camYaw += dy * (1 - Math.exp(-5.5 * dt));
      const dir = this.lookBack ? -1 : 1;
      const fx = Math.sin(this.camYaw) * dir;
      const fz = Math.cos(this.camYaw) * dir;
      const dist = 6.4 + speedRatio * 1.2 + (boosting ? 0.8 : 0);
      const hgt = 2.35 + speedRatio * 0.2;
      const target = new Vector3(p.pos.x - fx * dist, p.pos.y + hgt, p.pos.z - fz * dist);
      const groundAtCam = p.pos.y;
      target.y = Math.max(target.y, groundAtCam + 1.2);
      const kxz = 1 - Math.exp(-12 * dt);
      const ky = 1 - Math.exp((p.airborne ? -3 : -8) * dt);
      this.camPos.x += (target.x - this.camPos.x) * kxz;
      this.camPos.z += (target.z - this.camPos.z) * kxz;
      this.camPos.y += (target.y - this.camPos.y) * ky;
      const look = new Vector3(p.pos.x + fx * 4, p.pos.y + 1.15, p.pos.z + fz * 4);
      this.camLook.lerp(look, 1 - Math.exp(-15 * dt));
      cam.position.copy(this.camPos);
      // wstrząsy
      if (this.shake > 0.001) {
        const s = this.shake * 0.35;
        cam.position.x += (Math.random() - 0.5) * s;
        cam.position.y += (Math.random() - 0.5) * s;
        cam.position.z += (Math.random() - 0.5) * s;
      }
      // mikro wibracje przy prędkości
      cam.position.y += Math.sin(this.time * 40) * 0.008 * speedRatio;
      cam.lookAt(this.camLook);
      // przechył kamery w drifcie
      cam.rotateZ(-p.steerSmooth * 0.02 * speedRatio - (p.drifting ? p.driftDir * 0.025 : 0));
      const targetFov = 68 + speedRatio * 9 + (boosting ? 9 : 0);
      cam.fov += (targetFov - cam.fov) * (1 - Math.exp(-4 * dt));
    }
    this.shake = Math.max(0, this.shake - dt * 2.2);
    up.set(0, 1, 0);
    cam.updateProjectionMatrix();
    this.camVel.copy(cam.position).sub(prev).divideScalar(Math.max(dt, 1e-3));
  }

  private updateLights() {
    const p = this.player;
    this.moon.target.position.copy(p.pos);
    this.moon.position.copy(p.pos).addScaledVector(MOON_DIR, 150);
    // przyciąganie do siatki texeli (redukcja migotania cieni)
    this.moon.target.updateMatrixWorld();
    const boost = p.boostTime > 0;
    this.boostLight.intensity = boost ? 6 + Math.random() * 3 : 0;
    this.boostLight.color.setHex(p.boostKind === 1 ? 0x4aa8ff : p.boostKind === 3 ? 0xc050ff : 0xff8a30);
  }

  private buildResults(sorted: Kart[]) {
    const L = this.track.length;
    const totalDist = L * this.settings.laps;
    this.results = sorted.map((k, i) => {
      let time = k.finishTime;
      if (!k.finished) {
        const done = Math.max(0, k.progress);
        const avg = done > 50 ? done / this.raceTime : this.baseMax * 0.8;
        time = this.raceTime + (totalDist - done) / Math.max(avg, 5);
      }
      return {
        slot: this.karts.indexOf(k),
        name: k.cfg.name,
        color: (k as Kart & { css: string }).css,
        isPlayer: k.cfg.isPlayer,
        place: i + 1,
        lap: k.lap,
        progress: Math.max(0, Math.min(1, k.progress / Math.max(1, totalDist))),
        finished: k.finished,
        time,
        bestLap: k.lapTimes.length ? Math.min(...k.lapTimes) : 0,
      };
    });
    this.results.sort((a, b) => a.time - b.time);
    this.results.forEach((r, i) => (r.place = i + 1));
    this.emitHud();
  }

  private emitHud() {
    const p = this.player;
    let countdown: string | null = null;
    if (this.phase === 'countdown') countdown = String(3 - Math.floor(this.phaseTime));
    if (this.phase === 'race' && this.phaseTime < 1) countdown = 'START!';
    const standings = [...this.karts]
      .sort((a, b) => a.place - b.place)
      .map((k) => ({
        slot: this.karts.indexOf(k),
        name: k.cfg.name,
        color: (k as Kart & { css: string }).css,
        isPlayer: k.cfg.isPlayer,
        place: k.place,
        lap: k.lap,
        progress: Math.max(0, Math.min(1, k.progress / Math.max(1, this.track.length * this.settings.laps))),
        finished: k.finished,
        time: k.finishTime,
        bestLap: k.lapTimes.length ? Math.min(...k.lapTimes) : 0,
      }));
    this.onHud({
      phase: this.phase,
      countdown,
      speed: Math.round(Math.abs(p.vf) * 4.6),
      lap: Math.min(this.settings.laps, Math.max(1, p.lap)),
      laps: this.settings.laps,
      place: p.place,
      total: this.karts.length,
      item: p.item,
      itemCount: p.itemCount,
      rolling: p.rolling > 0,
      driftLevel: p.driftLevel,
      drifting: p.drifting,
      boosting: p.boostTime > 0,
      shield: p.shieldTime > 0,
      raceTime: this.phase === 'race' || this.phase === 'finished' ? (p.finished ? p.finishTime : this.raceTime) : 0,
      lapTime: this.phase === 'race' ? this.raceTime - p.lapStart : 0,
      bestLap: p.lapTimes.length ? Math.min(...p.lapTimes) : 0,
      message: this.message,
      messageId: this.messageId,
      wrongWay: this.wrongTimer > 1.2,
      standings,
      results: this.results,
      paused: this.paused,
      musicOn: this.audio.musicOn,
      airborne: p.airborne,
    });
  }

  private drawMinimap() {
    const c = this.minimap;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    const W = c.width;
    const H = c.height;
    const b = this.mmBounds;
    const pad = W * 0.08;
    const sc = Math.min((W - pad * 2) / (b.maxX - b.minX), (H - pad * 2) / (b.maxZ - b.minZ));
    const ox = (W - (b.maxX - b.minX) * sc) / 2;
    const oy = (H - (b.maxZ - b.minZ) * sc) / 2;
    const mx = (x: number) => ox + (x - b.minX) * sc;
    const my = (z: number) => oy + (z - b.minZ) * sc;
    if (!this.mmPath) {
      const path = new Path2D();
      for (let i = 0; i <= this.track.N; i += 4) {
        const j = i % this.track.N;
        if (i === 0) path.moveTo(mx(this.track.px[j]), my(this.track.pz[j]));
        else path.lineTo(mx(this.track.px[j]), my(this.track.pz[j]));
      }
      path.closePath();
      this.mmPath = path;
    }
    ctx.clearRect(0, 0, W, H);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0,240,255,0.25)';
    ctx.lineWidth = W * 0.06;
    ctx.stroke(this.mmPath);
    ctx.strokeStyle = 'rgba(20,20,35,0.95)';
    ctx.lineWidth = W * 0.035;
    ctx.stroke(this.mmPath);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 1;
    ctx.stroke(this.mmPath);
    // meta
    ctx.fillStyle = '#fff';
    ctx.fillRect(mx(this.track.px[0]) - 2, my(this.track.pz[0]) - 6, 4, 12);
    // pociski
    ctx.fillStyle = '#ff4040';
    for (const r of this.items.rockets) {
      ctx.beginPath();
      ctx.arc(mx(r.pos.x), my(r.pos.z), W * 0.012, 0, Math.PI * 2);
      ctx.fill();
    }
    const list = [...this.karts].sort((a) => (a.cfg.isPlayer ? 1 : -1));
    for (const k of list) {
      const x = mx(k.pos.x);
      const y = my(k.pos.z);
      const col = (k as Kart & { css: string }).css;
      if (k.cfg.isPlayer) {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(-k.yaw + Math.PI);
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        const s = W * 0.04;
        ctx.moveTo(0, -s);
        ctx.lineTo(s * 0.7, s * 0.8);
        ctx.lineTo(-s * 0.7, s * 0.8);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      } else {
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(x, y, W * 0.022, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.stroke();
      }
    }
  }
}
