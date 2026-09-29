import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  A, B, BALL_R, GOAL_W, GOAL_H, GOAL_D, STEP, TEAM_HEX, TEAM_LIGHT, BOOST_PADS, BOT_NAMES, ACCENTS,
} from './constants';
import { arenaSdf, arenaNormal } from './arena';
import { Car } from './Car';
import { Ball } from './Ball';
import { CarVisual } from './carModel';
import { collideCarBall, collideCars, CarHit, HitInfo } from './physics';
import { BoostPad } from './pads';
import { Stadium, makeEnvironment } from './stadium';
import { Particles, Trail } from './particles';
import { AudioEngine } from './audio';
import { BotBrain, BotContext, Role } from './ai';
import { CarInput, newInput } from './types';
import type { HumanCtrl, NitroEventData, NitroMatchSpec, RosterHuman } from './types';

/**
 * NITRO LEAGUE — silnik car-soccera 3D w adaptacji JoyPad.
 *
 * Wersja JoyPad różni się od demo standalone:
 * - wielu ludzi naraz (do 4) z wejściami wstrzykiwanymi przez `readCtrl`,
 * - split-screen przez viewport/scissor bez heavy post-processingu (płynność),
 * - limit goli i zdarzenia dla Moments (`onEvent`) oraz haptyki (`onPadFx`),
 * - wspomagania dla padów dotykowych (auto-skok, asysta kierunku, auto-odwrócenie),
 * - poprawiona jasność świateł na profilach jakości (ekspozycja + bloom skalowane).
 */

const V = THREE.Vector3;
const WORLD_UP = new V(0, 1, 0);
const _a = new V();
const _b = new V();
const _c = new V();
const _d = new V();
const _e = new V();
const _n = new V();
const _cf = new V();
const _q = new THREE.Quaternion();
const clamp = (x: number, a: number, b: number) => Math.min(b, Math.max(a, x));

const FxShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uSpeed: { value: 0 },
    uFlash: { value: 0 },
    uFlashColor: { value: new THREE.Color(1, 1, 1) },
    uAberr: { value: 1 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uSpeed; uniform float uFlash; uniform vec3 uFlashColor; uniform float uAberr;
    varying vec2 vUv;
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c);
      float amt = uSpeed * 0.06 * smoothstep(0.12, 0.75, r);
      float ab = uAberr * r * r * 0.010 + uSpeed * 0.004 * r;
      vec3 col = vec3(0.0);
      for (int i = 0; i < 6; i++) {
        float t = float(i) / 5.0;
        vec2 o = c * (-amt * t);
        col.r += texture2D(tDiffuse, vUv + o + c * ab).r;
        col.g += texture2D(tDiffuse, vUv + o).g;
        col.b += texture2D(tDiffuse, vUv + o - c * ab).b;
      }
      col /= 6.0;
      col *= 1.0 - 0.6 * smoothstep(0.32, 0.98, r);
      col = mix(col, col * vec3(0.94, 1.0, 1.1), 0.3);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, 1.12);
      col += uFlashColor * uFlash;
      float n = fract(sin(dot(vUv * vec2(1920.0, 1080.0) + uTime, vec2(12.9898, 78.233))) * 43758.5453);
      col += (n - 0.5) * 0.018;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export interface GameCallbacks {
  onSettings?: (p: { quality?: number }) => void;
}

/** Kamera + jej stan śledzenia — jedno „oko" jednego człowieka. */
class CamRig {
  cam: THREE.PerspectiveCamera;
  pos = new V(0, 20, 60);
  look = new V();
  up = new V(0, 1, 0);
  fwd = new V(0, 0, -1);
  snap = true;
  ballCam = true;
  fov = 75;
  orbit = Math.random() * 6;
  carIdx = -1;

  constructor(aspect: number) {
    this.cam = new THREE.PerspectiveCamera(75, aspect, 0.1, 2500);
  }
}

export type PadFxKind = 'hit' | 'dead' | 'pickup' | 'win' | 'lose' | 'fire';

export class Game {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private fx: ShaderPass | null = null;
  private stadium!: Stadium;
  private ball!: Ball;
  private cars: Car[] = [];
  private visuals: CarVisual[] = [];
  private bots: (BotBrain | null)[] = [];
  private stats: { name: string; team: number; goals: number; assists: number; saves: number; shots: number; demos: number; score: number }[] = [];
  private trails: Trail[] = [];
  private pads: BoostPad[] = [];
  private fxAdd!: Particles;
  private fxNorm!: Particles;
  private ballTrail!: Trail;
  private audio = new AudioEngine();
  private keyLight!: THREE.DirectionalLight;
  private boostLight!: THREE.PointLight;
  private goalLight!: THREE.PointLight;
  private raf = 0;
  private lastT = 0;
  private time = 0;
  private accum = 0;
  private alpha = 0;
  private fpsAcc = 0;
  private fpsN = 0;
  private fps = 60;
  private disposed = false;

  /* ===== wejścia ludzi (JoyPad) ===== */
  /** Indeksy aut sterowanych przez ludzi (równolegle do `cars`). */
  private humans: number[] = [];
  private roster: RosterHuman[] = [];
  /** Adapter dostarcza wejścia dla i-tego człowieka. */
  readCtrl: ((human: number, dt: number) => HumanCtrl) | null = null;

  /* ===== stan meczu ===== */
  private phase: 'menu' | 'countdown' | 'playing' | 'goal' | 'replay' | 'ended' = 'menu';
  private paused = false;
  private spec: NitroMatchSpec = { humans: [], botCount: 2, difficulty: 1, minutes: 3, goalLimit: 0 };
  private perTeam = 1;
  private scores: [number, number] = [0, 0];
  private timeLeft = 180;
  private overtime = false;
  private overtimeT = 0;
  private countT = 0;
  private lastCountInt = -1;
  private goBanner = 0;
  private goalT = 0;
  private goalTeam = 0;
  private goalInfo: { team: number; name: string; speed: number } | null = null;
  private scorerIdx = -1;
  private recStop = false;
  private winner = -1;
  private endT = 0;
  private demoT = 0;
  private timeScale = 1;
  private feed: { id: number; text: string; team: number; kind: 'goal' | 'save' | 'demo' | 'info' | 'boost'; t: number }[] = [];
  private feedId = 1;
  private toast: string | null = null;
  private toastT = 0;
  private roleT = 0;
  private lastShot: { team: number; time: number } | null = null;
  private touches: { car: number; time: number }[] = [];
  private excite = 0.2;
  private exciteBoost = 0;
  private flash = 0;
  private flashColor = new THREE.Color();
  private timers: { t: number; fn: () => void }[] = [];

  /* ===== hooki JoyPad ===== */
  onEvent: ((e: NitroEventData) => void) | null = null;
  onPadFx: ((human: number, fx: PadFxKind) => void) | null = null;
  afterRender: ((canvas: HTMLCanvasElement) => void) | null = null;

  /* ===== replay ===== */
  private rec: { t: number; d: Float32Array }[] = [];
  private recAcc = 0;
  private replayFrames: { t: number; d: Float32Array }[] = [];
  private replayT = 0;
  private replayDur = 1;
  private replaySkip = false;

  /* ===== kamery ===== */
  private rigs: CamRig[] = [];
  private shake = 0;
  private fxSpeed = 0;

  /* ===== wspomagania ===== */
  private assistJumpCd: number[] = [];
  private assistFlipT: number[] = [];
  private assistFlipCd: number[] = [];

  constructor(
    private container: HTMLElement,
    private cb: GameCallbacks,
    public settings: { quality: number; volume: number; music: boolean; fov: number; shake: boolean },
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: settings.quality >= 1, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    // v1.8: ekspozycja skalowanaprofilem — wyższe jakości nie wypalają świateł do bieli.
    this.renderer.toneMappingExposure = [0.92, 1.0, 1.06][settings.quality] ?? 1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);
    this.audio.volume = settings.volume;
    this.audio.musicOn = settings.music;

    this.scene.fog = new THREE.FogExp2(0x0a1424, 0.0024);
    this.scene.environment = makeEnvironment(this.renderer);
    this.scene.environmentIntensity = 0.72;
    this.buildWorld();
    this.applyQuality();
    window.addEventListener('resize', this.onResize);
    this.onResize();
    this.startDemo();
    this.lastT = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  /* ================= konfiguracja świata ================= */
  private buildWorld() {
    const q = this.settings.quality;
    this.stadium = new Stadium(q);
    this.scene.add(this.stadium.group);
    this.pads = BOOST_PADS.map(([x, z, big]) => new BoostPad(x, z, big));
    for (const p of this.pads) this.scene.add(p.group);
    this.ball = new Ball();
    this.scene.add(this.ball.group);
    this.fxAdd = new Particles(5000, true);
    this.fxNorm = new Particles(1800, false);
    this.scene.add(this.fxAdd.points, this.fxNorm.points);
    this.ballTrail = new Trail(30, 0.55);
    this.scene.add(this.ballTrail.mesh);

    // światła — v1.8: przygaszone o ~35% względem demo, żeby jasne materiały
    // na profilu „ostrym" nie przekalibrowywały obrazu do bieli.
    this.scene.add(new THREE.HemisphereLight(0x7f9fff, 0x1b2b22, 1.05));
    this.keyLight = new THREE.DirectionalLight(0xfff1de, 4.6);
    this.keyLight.castShadow = q >= 1;
    const sc = this.keyLight.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 5;
    sc.far = 180;
    sc.updateProjectionMatrix();
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.04;
    this.scene.add(this.keyLight, this.keyLight.target);
    const fillB = new THREE.DirectionalLight(0x3f7cff, 1.35);
    fillB.position.set(0, 35, 70);
    const fillO = new THREE.DirectionalLight(0xff8a2e, 1.35);
    fillO.position.set(0, 35, -70);
    this.scene.add(fillB, fillO);
    this.boostLight = new THREE.PointLight(0xffaa55, 0, 14, 2);
    this.scene.add(this.boostLight);
    this.goalLight = new THREE.PointLight(0xffffff, 0, 60, 1.6);
    this.scene.add(this.goalLight);
  }

  applyQuality() {
    const q = this.settings.quality;
    // Split i słabsze profile dostają twardszy limit DPR — to one scalają się najkosztowniej.
    const cap = this.splitView() ? 1.25 : q >= 2 ? 2 : q === 1 ? 1.5 : 1;
    const pr = Math.min(window.devicePixelRatio || 1, cap);
    this.renderer.setPixelRatio(pr);
    this.renderer.shadowMap.enabled = q >= 1;
    this.keyLight.castShadow = q >= 1;
    const sm = q >= 2 ? 2048 : 1024;
    this.keyLight.shadow.mapSize.set(sm, sm);
    if (this.keyLight.shadow.map) {
      this.keyLight.shadow.map.dispose();
      this.keyLight.shadow.map = null as unknown as null;
    }
    this.buildComposer();
    this.onResize();
  }

  private buildComposer() {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    const q = this.settings.quality;
    // Heavy post-processing tylko dla pojedynczego widoku i jakości >= zbalansowanej.
    if (q < 1 || this.splitView()) {
      this.bloom = null;
      this.fx = null;
      return;
    }
    const w = this.container.clientWidth || 1280;
    const h = this.container.clientHeight || 720;
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(Math.max(2, w * pr), Math.max(2, h * pr), { type: THREE.HalfFloatType, samples: 4 });
    const comp = new EffectComposer(this.renderer, rt);
    comp.setPixelRatio(pr);
    comp.setSize(w, h);
    comp.addPass(new RenderPass(this.scene, this.rigs[0]?.cam ?? new THREE.PerspectiveCamera()));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), q >= 2 ? 0.45 : 0.38, 0.7, 0.92);
    comp.addPass(this.bloom);
    this.fx = new ShaderPass(FxShader);
    comp.addPass(this.fx);
    comp.addPass(new OutputPass());
    this.composer = comp;
  }

  private onResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    for (const rig of this.rigs) {
      const [rw, rh] = this.rigSize(rig);
      rig.cam.aspect = rw / rh;
      rig.cam.updateProjectionMatrix();
    }
    if (this.composer) this.composer.setSize(w, h);
  };

  /** Rozmiar (logiczny) widoku danego riga — przy splitzie dzielony na siatkę. */
  private rigSize(_rig: CamRig): [number, number] {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    if (!this.splitView()) return [w, h];
    const n = this.rigs.length;
    const cols = n <= 2 ? n : 2;
    const rows = Math.ceil(n / cols);
    return [w / cols, h / rows];
  }

  /** Żądanie adaptera: podzielony ekran (displayMode = split). */
  splitRequested = false;
  /** Split tylko gdy żądany, ludzie >1 i w fazach gry; demo zawsze pojedyncze. */
  private splitView() {
    return this.splitRequested && this.humans.length > 1 && (this.phase === 'countdown' || this.phase === 'playing' || this.phase === 'goal' || this.phase === 'ended');
  }

  setSettings(s: { quality?: number; volume?: number; music?: boolean; fov?: number; shake?: boolean }) {
    const prevQ = this.settings.quality;
    Object.assign(this.settings, s);
    this.audio.setVolume(this.settings.volume);
    this.audio.setMusic(this.settings.music);
    if (s.quality !== undefined && s.quality !== prevQ) {
      this.renderer.toneMappingExposure = [0.92, 1.0, 1.06][this.settings.quality] ?? 1;
      this.stadium.group.removeFromParent();
      this.stadium.dispose();
      this.stadium = new Stadium(this.settings.quality);
      this.scene.add(this.stadium.group);
      this.applyQuality();
    }
  }

  unlockAudio() {
    this.audio.resume();
    this.audio.setMusicLevel(this.phase === 'menu' ? 0.5 : 0.22);
  }

  /* ================= samochody ================= */
  private clearCars() {
    for (const v of this.visuals) {
      v.group.removeFromParent();
      v.dispose();
    }
    for (const t of this.trails) {
      t.mesh.removeFromParent();
      t.dispose();
    }
    this.cars = [];
    this.visuals = [];
    this.trails = [];
    this.bots = [];
    this.stats = [];
    this.humans = [];
    this.roster = [];
    this.audio.clearEngines();
  }

  /** v1.8: roster z adaptera — ludzie najpierw (naprzemiennie drużyny), boty uzupełniają. */
  private spawnRoster(spec: NitroMatchSpec) {
    this.clearCars();
    this.spec = spec;
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    const total = Math.min(6, spec.humans.length + spec.botCount);
    this.perTeam = Math.max(1, Math.min(3, Math.ceil(total / 2)));
    let idx = 0;
    const addCar = (team: number, name: string, human: RosterHuman | null) => {
      const car = new Car(team, idx, name, !!human);
      const accent = human?.accent || ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
      const vis = new CarVisual({
        body: human ? 0 : Math.floor(Math.random() * 3),
        accent,
        wheel: human ? 0 : Math.floor(Math.random() * 3),
        paint: TEAM_HEX[team],
        flame: TEAM_LIGHT[team],
      });
      this.scene.add(vis.group);
      const trail = new Trail(16, 0.16);
      trail.color.set(accent).multiplyScalar(1.6);
      this.scene.add(trail.mesh);
      this.cars.push(car);
      this.visuals.push(vis);
      this.trails.push(trail);
      this.bots.push(human ? null : new BotBrain(car, spec.difficulty));
      this.stats.push({ name, team, goals: 0, assists: 0, saves: 0, shots: 0, demos: 0, score: 0 });
      if (human) {
        this.humans.push(idx);
        this.roster.push(human);
        this.assistJumpCd.push(0);
        this.assistFlipT.push(0);
        this.assistFlipCd.push(0);
      }
      idx++;
    };
    for (const h of spec.humans) addCar(Math.max(0, Math.min(1, h.team)), h.name || 'GRACZ', h);
    for (let t = 0; t < total - spec.humans.length; t++) {
      const team = t % 2;
      if (this.cars.filter((c) => c.team === team).length < this.perTeam) addCar(team, names.pop() || 'Bot', null);
      else addCar((team + 1) % 2, names.pop() || 'Bot', null);
    }
    this.syncRigs();
  }

  private syncRigs() {
    const w = this.container.clientWidth || 1280;
    const h = this.container.clientHeight || 720;
    const prev = this.rigs;
    this.rigs = this.humans.map((carIdx, i) => {
      const old = prev[i];
      const rig = old ?? new CamRig(w / h);
      rig.carIdx = rig.carIdx === -2 ? -2 : carIdx;
      rig.snap = true;
      return rig;
    });
    this.applyViewMode();
    if (this.rigs.length === 0) {
      const rig = prev[0] ?? new CamRig(w / h);
      rig.carIdx = -1;
      this.rigs = [rig];
    }
    this.buildComposer();
  }

  /** Wspólna arena = kamera sędziowska przy >1 człowieku; split = rig na każdego. */
  setViewMode(displayMode: 'shared' | 'split') {
    this.splitRequested = displayMode === 'split';
    this.applyViewMode();
  }

  private applyViewMode() {
    const spectate = !this.splitRequested && this.humans.length > 1;
    this.rigs.forEach((rig, i) => {
      if (spectate) rig.carIdx = i === 0 ? -2 : this.humans[i];
      else rig.carIdx = this.humans[i] ?? -1;
    });
    if (this.rigs.length === 1 && spectate) this.rigs[0].carIdx = -2;
  }

  private placeForKickoff() {
    const spots = [KICK_SPOTS[0], KICK_SPOTS[1], KICK_SPOTS[2]].sort(() => Math.random() - 0.5);
    for (const team of [0, 1]) {
      const cs = this.cars.filter((c) => c.team === team);
      cs.forEach((c, i) => {
        const s = spots[i % spots.length];
        const sign = team === 0 ? 1 : -1;
        const x = s[0] * sign;
        const z = s[1] * sign;
        const len = Math.hypot(x, z) || 1;
        const yaw = Math.atan2(x / len, z / len);
        c.placeAt(x, z, yaw);
        c.frozen = true;
        c.input = newInput();
      });
    }
    for (const t of this.trails) t.reset();
  }

  /* ================= start / fazy ================= */
  startDemo() {
    this.phase = 'menu';
    this.spec = { humans: [], botCount: 4, difficulty: 2, minutes: 3, goalLimit: 0 };
    this.spawnRoster({ humans: [], botCount: 4, difficulty: 2, minutes: 3, goalLimit: 0 });
    this.placeForKickoff();
    for (const c of this.cars) c.frozen = false;
    this.ball.reset();
    for (const p of this.pads) p.reset();
    this.scores = [0, 0];
    this.paused = false;
    this.timers = [];
    this.camSnapAll();
    this.demoT = 0;
    this.audio.silenceEngines();
    this.audio.setMusicLevel(0.5);
    this.stadium.setScreen({ mode: 'menu', blue: 0, orange: 0, time: '3:00', label: 'NITRO LEAGUE' });
  }

  private camSnapAll() {
    for (const rig of this.rigs) rig.snap = true;
  }

  startMatch(spec: NitroMatchSpec) {
    this.spec = spec;
    this.spawnRoster(spec);
    this.scores = [0, 0];
    this.timeLeft = spec.minutes * 60;
    this.overtime = false;
    this.overtimeT = 0;
    this.winner = -1;
    this.feed = [];
    this.rec = [];
    this.timers = [];
    this.paused = false;
    this.lastShot = null;
    this.touches = [];
    this.beginKickoff();
    this.audio.setMusicLevel(0.2);
    this.audio.setCrowd(0.5);
    this.audio.whistle();
  }

  restartMatch() {
    this.startMatch(this.spec);
  }

  private beginKickoff() {
    this.placeForKickoff();
    this.ball.reset();
    for (const p of this.pads) p.reset();
    this.phase = 'countdown';
    this.countT = 3.2;
    this.lastCountInt = -1;
    this.goBanner = 0;
    this.goalInfo = null;
    this.recStop = false;
    this.rec = [];
    this.touches = [];
    this.lastShot = null;
    this.camSnapAll();
    this.stadium.setScreen({ mode: 'score', blue: this.scores[0], orange: this.scores[1], label: '' });
    this.exciteBoost = 0;
  }

  quitToMenu() {
    this.startDemo();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.audio.silenceEngines();
  }

  isPaused() {
    return this.paused;
  }

  /* ================= pętla ================= */
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, (now - this.lastT) / 1000);
    this.lastT = now;
    try {
      this.update(dt);
      this.render();
      if (this.afterRender) this.afterRender(this.renderer.domElement);
    } catch (e) {
      if (!this.errLogged) {
        this.errLogged = true;
        console.error('Błąd pętli Nitro League:', e);
      }
    }
  };
  private errLogged = false;
  private lowT = 0;
  private engT = 0;
  private lastCrowd = -1;

  private update(dt: number) {
    this.time += dt;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      this.fps = this.fpsN / this.fpsAcc;
      this.fpsAcc = 0;
      this.fpsN = 0;
      if (this.time > 8 && !this.paused && this.phase !== 'menu') {
        this.lowT = this.fps < 28 ? this.lowT + 0.5 : Math.max(0, this.lowT - 0.5);
        if (this.lowT >= 7 && this.settings.quality > 0) {
          this.lowT = 0;
          const nq = this.settings.quality - 1;
          this.setSettings({ quality: nq });
          this.cb.onSettings?.({ quality: nq });
          this.toastMsg('Obniżono jakość grafiki dla płynności', 3);
        }
      }
    }
    const inGame = this.phase === 'countdown' || this.phase === 'playing' || this.phase === 'goal' || this.phase === 'replay' || this.phase === 'ended';

    this.toastT -= dt;
    if (this.toastT <= 0) this.toast = null;
    this.feed = this.feed.filter((f) => this.time - f.t < 6);
    if (this.goBanner > 0) this.goBanner -= dt;
    this.flash = Math.max(0, this.flash - dt * 1.6);
    this.exciteBoost = Math.max(0, this.exciteBoost - dt * 0.12);
    for (let i = this.timers.length - 1; i >= 0; i--) {
      this.timers[i].t -= dt;
      if (this.timers[i].t <= 0) {
        const f = this.timers[i].fn;
        this.timers.splice(i, 1);
        f();
      }
    }

    switch (this.phase) {
      case 'menu':
        this.applyDemo(dt);
        this.simulate(dt);
        break;
      case 'countdown':
        this.applyHumanInputs(dt);
        this.simulate(dt);
        this.countT -= dt;
        {
          const ci = Math.ceil(this.countT);
          if (ci !== this.lastCountInt && ci >= 1 && ci <= 3) {
            this.lastCountInt = ci;
            this.audio.count(false);
          }
        }
        if (this.countT <= 0) {
          this.phase = 'playing';
          this.goBanner = 1.0;
          this.audio.count(true);
          for (const c of this.cars) c.frozen = false;
          for (const rig of this.rigs) rig.snap = false;
        }
        break;
      case 'playing':
        this.applyHumanInputs(dt);
        this.simulate(dt);
        this.tickClock(dt);
        this.record(dt);
        break;
      case 'goal': {
        this.goalT += dt;
        this.timeScale = this.goalT < 1.1 ? 0.3 : 1;
        this.applyHumanInputs(dt);
        this.simulate(dt * this.timeScale);
        if (!this.recStop) this.record(dt);
        if (this.goalT > 0.9) this.recStop = true;
        if (this.goalT > 3.0) {
          // W split-screenie pomijamy powtórkę — każdy widzi własną kamerę, a runda płynie.
          if (this.splitRequested && this.humans.length > 1) this.afterGoal();
          else this.startReplay();
        }
        break;
      }
      case 'replay':
        this.updateReplay(dt);
        break;
      case 'ended':
        this.endT += dt;
        break;
    }
    if (this.phase !== 'goal') this.timeScale = 1;
    void inGame;

    this.updateVisuals(dt);
    this.updateCamera(dt);
    this.drawMinimap();
  }

  private applyDemo(dt: number) {
    if (this.demoT > 0) {
      this.demoT += dt;
      if (this.demoT > 2.2) {
        this.demoT = 0;
        this.placeForKickoff();
        for (const c of this.cars) c.frozen = false;
        this.ball.reset();
        this.camSnapAll();
      }
    }
  }

  /** v1.8: wejścia wszystkich ludzi + wspomagania padów. */
  private applyHumanInputs(dt: number) {
    if (!this.readCtrl) return;
    for (let h = 0; h < this.humans.length; h++) {
      const car = this.cars[this.humans[h]];
      if (!car) continue;
      const ctrl = this.readCtrl(h, dt);
      const i = car.input as CarInput;
      i.throttle = clamp(ctrl.throttle, -1, 1);
      i.steer = clamp(ctrl.steer, -1, 1);
      i.pitch = clamp(ctrl.pitch, -1, 1);
      i.roll = clamp(ctrl.roll, -1, 1);
      i.jump = ctrl.jump;
      i.jumpPressed = ctrl.jumpPressed;
      i.boost = ctrl.boost;
      i.handbrake = ctrl.handbrake;
      this.applyAssists(h, car, dt, ctrl);
    }
  }

  /**
   * Wspomagania (v1.8): dotykowy pad nie ma przycisków skoku/obrotu —
   * silnik dopomaga w najmniej intuicyjnych momentach zamiast karzyć.
   */
  private applyAssists(h: number, car: Car, dt: number, ctrl: HumanCtrl) {
    if (car.demolished || car.frozen) return;
    this.assistJumpCd[h] = Math.max(0, this.assistJumpCd[h] - dt);
    this.assistFlipCd[h] = Math.max(0, this.assistFlipCd[h] - dt);

    // asysta kierunku: przy ledwo dotkniętej gałce delikatnie przygładza tor do piłki
    if (Math.abs(ctrl.steer) < 0.22 && Math.abs(car.fwdSpeed) > 3) {
      _a.copy(this.ball.pos).sub(car.pos);
      _a.y = 0;
      const dist = _a.length();
      if (dist < 30 && dist > 2) {
        _a.normalize();
        car.forward(_cf);
        _cf.y = 0;
        _cf.normalize();
        const cross = _cf.x * _a.z - _cf.z * _a.x;
        const dot = _cf.x * _a.x + _cf.z * _a.z;
        const angle = Math.atan2(cross, dot);
        if (Math.abs(angle) < 0.55) car.input.steer = clamp(angle * 0.55, -0.5, 0.5);
      }
    }
    // auto-skok do piłki nad głową (pady bez drugiej gałki)
    if (this.roster[h]?.autoJump && this.assistJumpCd[h] <= 0 && car.grounded && !car.jumping) {
      _a.copy(this.ball.pos).sub(car.pos);
      if (_a.y > 1.6 && _a.y < 4.2 && Math.hypot(_a.x, _a.z) < 2.4 && this.ball.vel.y < 2.5) {
        car.input.jumpPressed = true;
        this.assistJumpCd[h] = 1.4;
      }
    }
    // auto-odwrócenie na kołach zamiast utknięcia na dachu
    car.up(_b);
    if (_b.y < 0.25 && car.vel.lengthSq() < 16) {
      this.assistFlipT[h] = (this.assistFlipT[h] ?? 0) + dt;
      if (this.assistFlipT[h] > 1.0 && (this.assistFlipCd[h] ?? 0) <= 0) {
        car.flipUpright();
        this.assistFlipT[h] = 0;
        this.assistFlipCd[h] = 2.5;
      }
    } else {
      this.assistFlipT[h] = 0;
    }
  }

  private tickClock(dt: number) {
    if (this.overtime) {
      this.overtimeT += dt;
      return;
    }
    this.timeLeft -= dt;
    const t = Math.ceil(this.timeLeft);
    if (t <= 5 && t >= 1 && t !== this.lastCountInt) {
      this.lastCountInt = t;
      this.audio.count(false);
    }
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      if (this.scores[0] === this.scores[1]) {
        this.overtime = true;
        this.overtimeT = 0;
        this.toastMsg('DOGRYWKA! ZŁOTY GOL', 3);
        this.audio.whistle();
        this.emit('overtime', 0, '');
      } else if (this.ball.pos.y < 2.5) {
        this.endMatch();
      }
    }
  }

  /* ================= symulacja ================= */
  private botCtx: BotContext = { ball: null as unknown as Ball, cars: [], pads: [], time: 0, kickoff: false };

  private simulate(dt: number) {
    this.accum += dt;
    let steps = 0;
    while (this.accum >= STEP && steps < 12) {
      this.physicsStep(STEP);
      this.accum -= STEP;
      steps++;
    }
    if (steps >= 12) this.accum = 0;
    this.alpha = this.accum / STEP;
  }

  private carEvents = {
    onJump: (c: Car) => this.audio.jump(c.pos),
    onDodge: (c: Car) => {
      this.audio.dodge(c.pos);
      this.burst(c.pos, 8, [1.2, 1.2, 1.4], 4, 0.4, 0.5);
    },
    onLand: (c: Car, impact: number) => {
      if (impact > 2.5) {
        this.audio.bump(impact * 0.6, c.pos);
        this.dust(c.pos, Math.min(10, impact * 2));
      }
    },
    onBump: (c: Car, impact: number, p: THREE.Vector3) => {
      if (impact > 4) {
        this.audio.bump(impact, p);
        this.burst(p, 10, [3, 1.8, 0.6], 6, 0.5, 0.35);
        if (this.humans.includes(c.index)) this.shake = Math.max(this.shake, Math.min(0.6, impact * 0.05));
      }
    },
  };

  private ballEvents = {
    onBounce: (strength: number, p: THREE.Vector3) => {
      this.audio.bounce(strength, p);
      if (strength > 6) this.dust(p, Math.min(8, strength * 0.6));
    },
  };

  private hitInfo = { a: null as unknown as Car, b: null as unknown as Car, demolished: null, attacker: null, strength: 0, point: new V() } as CarHit;

  private physicsStep(dt: number) {
    const ball = this.ball;
    for (const c of this.cars) c.savePrev();
    ball.savePrev();

    this.roleT -= dt;
    const ctx = this.botCtx;
    ctx.ball = ball;
    ctx.cars = this.cars;
    ctx.pads = this.pads;
    ctx.time = this.time;
    ctx.kickoff = ball.lastTouchCar === -1;
    if (this.roleT <= 0) {
      this.assignRoles(ctx);
      this.roleT = 0.25;
    }
    for (const b of this.bots) if (b) b.update(dt, ctx);

    for (const c of this.cars) {
      if (c.demolished) {
        c.respawnTimer -= dt;
        if (c.respawnTimer <= 0) this.respawn(c);
        continue;
      }
      c.step(dt, this.carEvents);
    }
    ball.step(dt, this.ballEvents);

    for (const c of this.cars) {
      const h = collideCarBall(c, ball);
      if (h) this.onCarBall(c, h);
    }
    for (let i = 0; i < this.cars.length; i++)
      for (let j = i + 1; j < this.cars.length; j++) {
        if (collideCars(this.cars[i], this.cars[j], this.hitInfo)) this.onCarCar(this.hitInfo);
      }
    for (const p of this.pads) {
      if (!p.active) continue;
      const rad = p.big ? 2.5 : 1.7;
      for (const c of this.cars) {
        if (c.demolished) continue;
        const dx = c.pos.x - p.x;
        const dz = c.pos.z - p.z;
        if (dx * dx + dz * dz < rad * rad && c.pos.y < (p.big ? 2.2 : 1.2)) {
          if (c.boost >= 99.9 && !p.big) continue;
          c.boost = Math.min(100, c.boost + (p.big ? 100 : 12));
          p.pickup();
          const humanIdx = this.humans.indexOf(c.index);
          this.audio.pickup(p.big, humanIdx >= 0 ? this.rigs[0]?.cam.position ?? p.group.position : p.group.position);
          if (humanIdx >= 0) this.onPadFx?.(humanIdx, 'pickup');
          this.burst(_a.set(p.x, 0.5, p.z), p.big ? 26 : 8, [3, 1.6, 0.3], p.big ? 9 : 4, 0.6, 0.3);
          break;
        }
      }
    }
    if (this.phase === 'playing' || this.phase === 'menu') {
      if (ball.pos.z > B + BALL_R) this.onGoal(1);
      else if (ball.pos.z < -(B + BALL_R)) this.onGoal(0);
    }
  }

  private assignRoles(ctx: BotContext) {
    const ball = ctx.ball;
    for (const team of [0, 1]) {
      const cs = this.cars.filter((c) => c.team === team && !c.demolished);
      const enemySign = team === 0 ? -1 : 1;
      const scored = cs.map((c) => {
        const ahead = (c.pos.z - ball.pos.z) * enemySign > 1.5;
        return { c, s: c.pos.distanceTo(ball.pos) + (ahead ? 14 : 0) };
      });
      scored.sort((x, y) => x.s - y.s);
      scored.forEach((e, rank) => {
        const brain = this.bots[e.c.index];
        if (!brain) return;
        let role: Role = rank === 0 ? 'attack' : rank === 1 ? 'support' : 'defend';
        if (ctx.kickoff && rank === 0) role = 'kickoff';
        brain.role = role;
      });
    }
  }

  private respawn(c: Car) {
    const sign = c.team === 0 ? 1 : -1;
    const x = (Math.random() - 0.5) * 12;
    const z = sign * (B - 6);
    c.placeAt(x, z, sign > 0 ? 0 : Math.PI);
    c.boost = 33.3;
    c.frozen = false;
    this.visuals[c.index].setVisible(true);
    const humanIdx = this.humans.indexOf(c.index);
    if (humanIdx >= 0) this.onPadFx?.(humanIdx, 'pickup');
    this.trails[c.index].reset();
    this.burst(c.pos, 24, [1.2, 2, 3], 7, 0.7, 0.4);
  }

  /* ---------- zdarzenia ---------- */
  private onCarBall(car: Car, h: HitInfo) {
    const ball = this.ball;
    const power = h.power;
    if (ball.lastTouchCar !== car.index) {
      ball.prevTouchCar = ball.lastTouchCar;
      ball.prevTouchTeam = ball.lastTouchTeam;
    }
    ball.lastTouchCar = car.index;
    ball.lastTouchTeam = car.team;
    ball.colorTarget.set(TEAM_LIGHT[car.team]).multiplyScalar(1.15);
    ball.hitFlash = Math.max(ball.hitFlash, clamp(power / 22, 0.15, 1));
    this.touches.push({ car: car.index, time: this.time });
    if (this.touches.length > 6) this.touches.shift();
    if (power > 2.5) this.audio.hit(power, h.point);
    if (power > 4) {
      const col = car.team === 0 ? [0.8, 1.6, 4] : [4, 1.9, 0.6];
      this.burst(h.point, Math.min(40, 6 + power), col, 5 + power * 0.35, 0.55, 0.32);
      this.fxAdd.emit({
        x: h.point.x, y: h.point.y, z: h.point.z, life: 0.32, size0: 0.5, size1: 3 + power * 0.14,
        r: col[0], g: col[1], b: col[2], a0: 0.85, a1: 0,
      });
    }
    const humanIdx = this.humans.indexOf(car.index);
    if (humanIdx >= 0) {
      this.shake = Math.max(this.shake, Math.min(0.5, power * 0.02));
      if (power > 9) this.onPadFx?.(humanIdx, 'hit');
    } else if (power > 20) {
      this.shake = Math.max(this.shake, 0.12);
    }

    // statystyki: strzał / obrona
    const st = this.stats[car.index];
    const enemyZ = car.team === 0 ? -B : B;
    const vz = ball.vel.z;
    if (Math.sign(vz) === Math.sign(enemyZ) && Math.abs(vz) > 11 && this.phase === 'playing') {
      const t = (enemyZ - ball.pos.z) / vz;
      const x = ball.pos.x + ball.vel.x * t;
      const y = ball.pos.y + ball.vel.y * t - 3.25 * t * t;
      if (Math.abs(x) < GOAL_W + 0.8 && y < GOAL_H + 0.8 && y > -1 && t < 3.5) {
        if (!this.lastShot || this.lastShot.team !== car.team || this.time - this.lastShot.time > 1.2) {
          st.shots++;
          st.score += 20;
          this.lastShot = { team: car.team, time: this.time };
        }
      }
    }
    if (this.lastShot && this.lastShot.team !== car.team && this.time - this.lastShot.time < 3.2 && this.phase === 'playing') {
      st.saves++;
      st.score += 50;
      this.pushFeed(`${st.name} — OBRONA!`, car.team, 'save');
      this.audio.cheerSmall();
      this.lastShot = null;
      if (humanIdx >= 0) this.toastMsg('OBRONA!', 1.6);
      this.emit('save', car.team, st.name);
    }
  }

  private onCarCar(h: CarHit) {
    if (h.strength > 3) {
      this.audio.bump(h.strength * 1.2, h.point);
      this.burst(h.point, 8, [3, 2, 0.8], 5, 0.4, 0.3);
      if (this.humans.includes(h.a.index) || this.humans.includes(h.b.index)) this.shake = Math.max(this.shake, Math.min(0.5, h.strength * 0.04));
    }
    if (h.demolished && h.attacker) this.demolish(h.demolished, h.attacker);
  }

  private demolish(v: Car, att: Car) {
    v.demolished = true;
    v.respawnTimer = 3;
    v.boosting = false;
    this.visuals[v.index].setVisible(false);
    this.audio.demolish(v.pos);
    this.burst(v.pos, 70, [4, 2, 0.5], 12, 1.0, 0.5);
    for (let i = 0; i < 22; i++)
      this.fxAdd.emit({
        x: v.pos.x + (Math.random() - 0.5) * 0.8, y: v.pos.y + Math.random() * 0.5, z: v.pos.z + (Math.random() - 0.5) * 0.8,
        vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6, vz: (Math.random() - 0.5) * 8,
        life: 0.5 + Math.random() * 0.4, size0: 1.6, size1: 4, r: 3.4, g: 1.3, b: 0.3, a0: 0.9, a1: 0, drag: 2,
      });
    for (let i = 0; i < 26; i++)
      this.fxNorm.emit({
        x: v.pos.x, y: v.pos.y + 0.3, z: v.pos.z,
        vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4, vz: (Math.random() - 0.5) * 6,
        life: 1.2 + Math.random(), size0: 1, size1: 3.6, r: 0.08, g: 0.08, b: 0.09, a0: 0.55, a1: 0, drag: 1.4,
      });
    const st = this.stats[att.index];
    st.demos++;
    st.score += 25;
    this.pushFeed(`${st.name} zdemolował ${this.stats[v.index].name}`, att.team, 'demo');
    const attHuman = this.humans.indexOf(att.index);
    if (attHuman >= 0) {
      this.toastMsg('ZDEMOLOWANO!', 1.4);
      this.onPadFx?.(attHuman, 'fire');
    }
    const vHuman = this.humans.indexOf(v.index);
    if (vHuman >= 0) this.onPadFx?.(vHuman, 'dead');
    this.emit('demo', att.team, st.name, undefined, this.stats[v.index].name);
  }

  private onGoal(team: number) {
    const ball = this.ball;
    if (this.phase === 'menu') {
      if (this.demoT > 0) return;
      this.goalExplosion(team);
      this.demoT = 0.001;
      return;
    }
    this.scores[team]++;
    this.goalTeam = team;
    const last = ball.lastTouchCar >= 0 ? this.cars[ball.lastTouchCar] : null;
    let name = 'Samobój';
    if (last && last.team === team) {
      name = last.name;
      const st = this.stats[last.index];
      st.goals++;
      st.score += 100;
      const prev = [...this.touches].reverse().find((t) => t.car !== last.index && this.cars[t.car].team === team && this.time - t.time < 6);
      if (prev) {
        this.stats[prev.car].assists++;
        this.stats[prev.car].score += 50;
      }
    } else if (last) {
      name = `${last.name} (samobój)`;
    }
    this.scorerIdx = ball.lastTouchCar;
    this.goalInfo = { team, name, speed: Math.round(ball.vel.length() * 4.5) };
    this.phase = 'goal';
    this.goalT = 0;
    this.recStop = false;
    this.pushFeed(`GOL! ${name}`, team, 'goal');
    this.goalExplosion(team);
    this.audio.goal();
    this.exciteBoost = 1;
    this.shake = Math.max(this.shake, 0.6);
    this.stadium.setScreen({ mode: 'goal', blue: this.scores[0], orange: this.scores[1], team });
    for (let h = 0; h < this.humans.length; h++) {
      const humanTeam = this.cars[this.humans[h]].team;
      this.onPadFx?.(h, humanTeam === team ? 'win' : 'lose');
    }
    this.emit('goal', team, name, this.goalInfo.speed);
    // limit goli — mecz kończy się natychmiast po eksplozji (bez powtórki)
    if (this.spec.goalLimit > 0 && this.scores[team] >= this.spec.goalLimit) {
      this.timers.push({ t: 2.2, fn: () => this.endMatch() });
    }
  }

  private goalExplosion(team: number) {
    const sign = team === 0 ? -1 : 1;
    const col = team === 0 ? [0.8, 1.9, 5] : [5, 2.1, 0.5];
    const cx = 0;
    const cy = 3;
    const cz = sign * (B + 3);
    this.flash = 0.9;
    this.flashColor.setRGB(col[0] * 0.25, col[1] * 0.25, col[2] * 0.25);
    this.goalLight.color.setRGB(col[0] / 5, col[1] / 5, col[2] / 5);
    this.goalLight.position.set(0, 6, sign * (B - 4));
    this.goalLight.intensity = 700;
    for (let i = 0; i < 46; i++) {
      const a = Math.random() * 6.28;
      const s = 4 + Math.random() * 12;
      this.fxAdd.emit({
        x: cx + (Math.random() - 0.5) * 8, y: cy + Math.random() * 4, z: cz,
        vx: Math.cos(a) * s * 0.6, vy: Math.random() * s * 0.8, vz: -sign * s * (0.5 + Math.random()),
        life: 0.9 + Math.random() * 0.8, size0: 3, size1: 9, r: col[0], g: col[1], b: col[2], a0: 0.8, a1: 0, drag: 1.5,
      });
    }
    for (let i = 0; i < 240; i++) {
      const a = Math.random() * 6.28;
      const e = (Math.random() - 0.3) * 1.4;
      const s = 6 + Math.random() * 20;
      this.fxAdd.emit({
        x: cx, y: cy, z: cz, vx: Math.cos(a) * s, vy: e * s * 0.7 + 4, vz: -sign * Math.abs(Math.sin(a)) * s,
        life: 1.2 + Math.random() * 1.2, size0: 0.4, size1: 0.02, r: col[0] * 1.4, g: col[1] * 1.4, b: col[2] * 1.4,
        a0: 1, a1: 0, gravity: 9, drag: 0.6, type: 2,
      });
    }
    const palette = [[1, 0.2, 0.3], [0.2, 0.7, 1], [1, 0.85, 0.15], [0.3, 1, 0.5], [1, 0.4, 0.9], [1, 1, 1]];
    for (let i = 0; i < 320; i++) {
      const c = palette[Math.floor(Math.random() * palette.length)];
      this.fxNorm.emit({
        x: (Math.random() - 0.5) * 60, y: 18 + Math.random() * 6, z: (Math.random() - 0.5) * 80,
        vx: (Math.random() - 0.5) * 3, vy: -Math.random() * 3, vz: (Math.random() - 0.5) * 3,
        life: 5 + Math.random() * 3, size0: 0.3, size1: 0.3, r: c[0], g: c[1], b: c[2], a0: 1, a1: 1, gravity: 0.8, drag: 0.5, type: 1, spin: 6,
      });
    }
    for (let k = 0; k < 7; k++) {
      this.timers.push({
        t: 0.3 + k * 0.42,
        fn: () => {
          const p = new V((Math.random() - 0.5) * 60, 26 + Math.random() * 12, (Math.random() - 0.5) * 70);
          const c = palette[Math.floor(Math.random() * palette.length)];
          for (let i = 0; i < 90; i++) {
            const th = Math.random() * 6.28;
            const ph = Math.acos(2 * Math.random() - 1);
            const s = 8 + Math.random() * 6;
            this.fxAdd.emit({
              x: p.x, y: p.y, z: p.z, vx: Math.sin(ph) * Math.cos(th) * s, vy: Math.cos(ph) * s, vz: Math.sin(ph) * Math.sin(th) * s,
              life: 1.4 + Math.random() * 0.6, size0: 0.55, size1: 0.05, r: c[0] * 3, g: c[1] * 3, b: c[2] * 3, a0: 1, a1: 0, gravity: 5, drag: 1.1, type: 2,
            });
          }
          this.fxAdd.emit({ x: p.x, y: p.y, z: p.z, life: 0.25, size0: 3, size1: 14, r: c[0] * 3, g: c[1] * 3, b: c[2] * 3, a0: 0.8, a1: 0 });
          this.audio.cheerSmall();
        },
      });
    }
  }

  private endMatch() {
    if (this.phase === 'ended') return;
    this.phase = 'ended';
    this.endT = 0;
    this.winner = this.scores[0] === this.scores[1] ? 2 : this.scores[0] > this.scores[1] ? 0 : 1;
    this.audio.whistle();
    this.audio.endJingle(this.winner !== 2);
    for (const c of this.cars) {
      c.frozen = true;
      c.input = newInput();
    }
    this.audio.silenceEngines();
    this.stadium.setScreen({ mode: 'end', blue: this.scores[0], orange: this.scores[1] });
    if (this.winner !== 2) this.goalExplosion(this.winner);
    this.exciteBoost = 1;
    this.emit('end', this.winner, '');
  }

  private afterGoal() {
    if (this.overtime || (this.timeLeft <= 0 && this.scores[0] !== this.scores[1])) {
      this.endMatch();
    } else if (this.spec.goalLimit > 0 && (this.scores[0] >= this.spec.goalLimit || this.scores[1] >= this.spec.goalLimit)) {
      this.endMatch();
    } else {
      this.beginKickoff();
      this.audio.whistle();
    }
  }

  /* ---------- powtórka ---------- */
  private record(dt: number) {
    this.recAcc += dt;
    if (this.recAcc < 1 / 50) return;
    this.recAcc = 0;
    const nc = this.cars.length;
    const d = new Float32Array(7 + nc * 12);
    const b = this.ball;
    d[0] = b.pos.x; d[1] = b.pos.y; d[2] = b.pos.z;
    d[3] = b.quat.x; d[4] = b.quat.y; d[5] = b.quat.z; d[6] = b.quat.w;
    this.cars.forEach((c, i) => {
      const o = 7 + i * 12;
      d[o] = c.pos.x; d[o + 1] = c.pos.y; d[o + 2] = c.pos.z;
      d[o + 3] = c.quat.x; d[o + 4] = c.quat.y; d[o + 5] = c.quat.z; d[o + 6] = c.quat.w;
      d[o + 7] = c.boosting ? 1 : 0;
      d[o + 8] = c.demolished ? 1 : 0;
      d[o + 9] = c.fwdSpeed;
      d[o + 10] = c.input.steer;
      d[o + 11] = c.grounded ? 1 : 0;
    });
    this.rec.push({ t: this.time, d });
    while (this.rec.length > 50 * 6.5) this.rec.shift();
  }

  private startReplay() {
    if (this.rec.length < 20) {
      this.afterGoal();
      return;
    }
    this.replayFrames = this.rec.slice();
    this.replayT = 0;
    this.replayDur = this.replayFrames[this.replayFrames.length - 1].t - this.replayFrames[0].t;
    this.phase = 'replay';
    this.replaySkip = false;
    this.camSnapAll();
    for (const t of this.trails) t.reset();
    this.ballTrail.reset();
    this.stadium.setScreen({ mode: 'replay' });
    this.audio.whistle();
    this.audio.silenceEngines();
  }

  private updateReplay(dt: number) {
    this.replayT += dt;
    if (this.readCtrl) {
      const ctrl = this.readCtrl(0, dt);
      if (ctrl.jumpPressed || ctrl.boost) this.replaySkip = true;
    }
    if (this.replayT >= this.replayDur || this.replaySkip) {
      this.stadium.setScreen({ mode: 'score', blue: this.scores[0], orange: this.scores[1] });
      this.afterGoal();
      return;
    }
    const f = this.replayFrames;
    const t0 = f[0].t + this.replayT;
    let i = Math.min(f.length - 2, Math.floor((this.replayT / this.replayDur) * (f.length - 1)));
    while (i > 0 && f[i].t > t0) i--;
    while (i < f.length - 2 && f[i + 1].t < t0) i++;
    const a = f[i];
    const b = f[i + 1];
    const k = clamp((t0 - a.t) / Math.max(1e-4, b.t - a.t), 0, 1);
    const lp = (o: number) => a.d[o] + (b.d[o] - a.d[o]) * k;
    const ball = this.ball;
    _a.copy(ball.pos);
    ball.pos.set(lp(0), lp(1), lp(2));
    ball.prevPos.copy(ball.pos);
    ball.quat.set(a.d[3], a.d[4], a.d[5], a.d[6]).slerp(_q.set(b.d[3], b.d[4], b.d[5], b.d[6]), k);
    ball.prevQuat.copy(ball.quat);
    ball.vel.copy(ball.pos).sub(_a).multiplyScalar(dt > 0 ? 1 / dt : 0);
    this.cars.forEach((c, ci) => {
      const o = 7 + ci * 12;
      c.pos.set(lp(o), lp(o + 1), lp(o + 2));
      c.prevPos.copy(c.pos);
      c.quat.set(a.d[o + 3], a.d[o + 4], a.d[o + 5], a.d[o + 6]).slerp(_q.set(b.d[o + 3], b.d[o + 4], b.d[o + 5], b.d[o + 6]), k);
      c.prevQuat.copy(c.quat);
      c.boosting = a.d[o + 7] > 0.5;
      c.demolished = a.d[o + 8] > 0.5;
      c.fwdSpeed = a.d[o + 9];
      c.input.steer = a.d[o + 10];
      c.grounded = a.d[o + 11] > 0.5;
      _cf.set(0, 0, -1).applyQuaternion(c.quat);
      c.vel.copy(_cf).multiplyScalar(c.fwdSpeed);
      c.supersonic = Math.abs(c.fwdSpeed) > 22;
    });
    this.alpha = 1;
  }

  /* ================= efekty ================= */
  private burst(p: THREE.Vector3, n: number, col: number[], speed: number, life: number, size: number) {
    for (let i = 0; i < n; i++) {
      const th = Math.random() * 6.28;
      const ph = Math.acos(2 * Math.random() - 1);
      const s = speed * (0.35 + Math.random() * 0.9);
      this.fxAdd.emit({
        x: p.x, y: p.y, z: p.z, vx: Math.sin(ph) * Math.cos(th) * s, vy: Math.abs(Math.cos(ph)) * s + 1, vz: Math.sin(ph) * Math.sin(th) * s,
        life: life * (0.6 + Math.random() * 0.7), size0: size, size1: 0.03, r: col[0], g: col[1], b: col[2], a0: 1, a1: 0, gravity: 8, drag: 0.8, type: 2,
      });
    }
  }

  private dust(p: THREE.Vector3, n: number) {
    for (let i = 0; i < n; i++) {
      const th = Math.random() * 6.28;
      const s = 1 + Math.random() * 3;
      this.fxNorm.emit({
        x: p.x, y: Math.max(0.15, p.y - 0.15), z: p.z, vx: Math.cos(th) * s, vy: 0.4 + Math.random(), vz: Math.sin(th) * s,
        life: 0.7 + Math.random() * 0.6, size0: 0.5, size1: 1.7, r: 0.45, g: 0.5, b: 0.5, a0: 0.28, a1: 0, drag: 2.2,
      });
    }
  }

  private updateEffects(dt: number) {
    const active = true;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (c.demolished || !active) {
        this.trails[i].update(this.rigs[0]?.cam.position ?? new V(), 0);
        continue;
      }
      if (c.boosting) {
        const cl = c.team === 0 ? [0.7, 1.7, 4.5] : [4.5, 1.8, 0.5];
        for (const sx of [-0.15, 0.15]) {
          for (let k = 0; k < 2; k++) {
            _a.set(sx, -0.05, 0.86).applyQuaternion(c.quat).add(c.pos);
            _b.set(0, 0, 1).applyQuaternion(c.quat);
            const sp = 3 + Math.random() * 5;
            this.fxAdd.emit({
              x: _a.x, y: _a.y, z: _a.z,
              vx: c.vel.x * 0.8 + _b.x * sp + (Math.random() - 0.5) * 1.2, vy: c.vel.y * 0.8 + _b.y * sp + (Math.random() - 0.5) * 1.2, vz: c.vel.z * 0.8 + _b.z * sp + (Math.random() - 0.5) * 1.2,
              life: 0.2 + Math.random() * 0.25, size0: 0.32, size1: 0.05, r: cl[0], g: cl[1], b: cl[2], a0: 0.85, a1: 0, drag: 1.2,
            });
          }
        }
      }
      if (c.grounded && (c.slip > 3.2 || (c.input.handbrake && Math.abs(c.fwdSpeed) > 6))) {
        for (const sx of [-0.42, 0.42]) {
          _a.set(sx, -0.17, 0.46).applyQuaternion(c.quat).add(c.pos);
          this.fxNorm.emit({
            x: _a.x, y: _a.y + 0.05, z: _a.z, vx: (Math.random() - 0.5) * 1.5, vy: 0.5 + Math.random() * 0.8, vz: (Math.random() - 0.5) * 1.5,
            life: 0.8, size0: 0.35, size1: 1.5, r: 0.7, g: 0.72, b: 0.75, a0: 0.3, a1: 0, drag: 2,
          });
          if (Math.random() < 0.4)
            this.fxAdd.emit({
              x: _a.x, y: _a.y, z: _a.z, vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: (Math.random() - 0.5) * 3,
              life: 0.3, size0: 0.14, size1: 0.02, r: 3, g: 1.6, b: 0.5, a0: 1, a1: 0, gravity: 9, type: 2,
            });
        }
      }
      const tr = this.trails[i];
      if (c.supersonic) {
        _a.copy(c.pos);
        tr.push(_a);
        tr.update(this.rigs[0]?.cam.position ?? new V(), 0.85);
      } else {
        tr.reset();
        tr.update(this.rigs[0]?.cam.position ?? new V(), 0);
      }
    }
    const sp = this.ball.vel.length();
    this.ballTrail.color.copy(this.ball.colorCur).multiplyScalar(1.5);
    if (sp > 12 && active) {
      this.ballTrail.push(this.ball.group.position);
      this.ballTrail.update(this.rigs[0]?.cam.position ?? new V(), clamp((sp - 12) / 35, 0, 1));
    } else {
      this.ballTrail.reset();
      this.ballTrail.update(this.rigs[0]?.cam.position ?? new V(), 0);
    }
    this.goalLight.intensity = Math.max(0, this.goalLight.intensity - dt * 700);
  }

  /* ================= wizualizacja ================= */
  private updateVisuals(dt: number) {
    const alpha = this.phase === 'replay' ? 1 : this.alpha;
    const engineOn = (this.phase === 'playing' || this.phase === 'goal' || this.phase === 'countdown' || this.phase === 'replay') && !this.paused;
    this.engT -= dt;
    const doEng = this.engT <= 0;
    if (doEng) this.engT = 0.05;
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      const v = this.visuals[i];
      if (!c || !v) continue;
      v.group.position.lerpVectors(c.prevPos, c.pos, alpha);
      v.group.quaternion.slerpQuaternions(c.prevQuat, c.quat, alpha);
      v.update(dt, c.fwdSpeed, c.input.steer, c.boosting, c.grounded, this.time, c.accel);
      if (this.phase !== 'menu') v.setVisible(!c.demolished);
      if (doEng)
        this.audio.engineUpdate(
          c.index, c.pos, clamp(Math.abs(c.fwdSpeed) / 23, 0, 1), c.input.throttle, c.boosting, this.humans.includes(c.index),
          engineOn && !c.demolished,
        );
    }
    this.ball.updateVisual(alpha, dt, this.time);
    const ph = this.phase;
    let excite = 0.25 + this.exciteBoost * 0.75;
    if (ph === 'playing') {
      const bz = Math.abs(this.ball.pos.z) / B;
      excite += 0.25 * clamp(bz - 0.5, 0, 0.5) * 2 + clamp(this.ball.vel.length() / 90, 0, 0.25);
    }
    this.excite = clamp(excite, 0, 1);
    for (const p of this.pads) p.update(dt, this.time);

    // światło kluczowe podąża za akcją (piłka + ludzie)
    _a.copy(this.ball.group.position);
    for (const idx of this.humans) {
      const c = this.cars[idx];
      if (c && !c.demolished && (ph === 'playing' || ph === 'countdown')) _a.lerp(c.pos, 0.3);
    }
    _a.x = clamp(_a.x, -A + 10, A - 10);
    _a.z = clamp(_a.z, -B + 10, B - 10);
    _a.y = 0;
    const snap = 0.5;
    _a.x = Math.round(_a.x / snap) * snap;
    _a.z = Math.round(_a.z / snap) * snap;
    this.keyLight.target.position.copy(_a);
    this.keyLight.position.set(_a.x + 24, 62, _a.z + 16);

    // światło boosta pierwszego człowieka (kluczowe dla podglądu)
    const first = this.cars[this.humans[0] ?? -1];
    if (first && first.boosting && !first.demolished) {
      _b.set(0, 0, 1.2).applyQuaternion(first.quat).add(first.pos);
      this.boostLight.position.copy(_b);
      this.boostLight.color.set(TEAM_LIGHT[first.team]);
      this.boostLight.intensity += (26 - this.boostLight.intensity) * Math.min(1, dt * 20);
    } else {
      this.boostLight.intensity += (0 - this.boostLight.intensity) * Math.min(1, dt * 14);
    }

    const scale = this.renderer.domElement.height / (2 * Math.tan(((this.rigs[0]?.cam.fov ?? 75) * Math.PI) / 360));
    this.stadium.update(dt, this.time, this.excite, scale);
    this.updateEffects(dt);
    this.fxAdd.update(dt, scale);
    this.fxNorm.update(dt, scale);

    if (ph === 'playing' || ph === 'countdown') {
      this.stadium.setScreen({ mode: 'score', blue: this.scores[0], orange: this.scores[1], time: this.timeText(), label: this.overtime ? 'DOGRYWKA' : '' });
    }
    const cl = 0.25 + this.excite * 0.7;
    if (Math.abs(cl - this.lastCrowd) > 0.05) {
      this.lastCrowd = cl;
      this.audio.setCrowd(cl);
    }
  }

  private timeText() {
    const t = this.overtime ? this.overtimeT : Math.max(0, this.timeLeft);
    const m = Math.floor(t / 60);
    const s = Math.floor(t % 60);
    return `${this.overtime ? '+' : ''}${m}:${s.toString().padStart(2, '0')}`;
  }

  /* ================= kamery ================= */
  private clampInside(p: THREE.Vector3, margin = 0.7) {
    for (let i = 0; i < 3; i++) {
      const s = arenaSdf(p.x, p.y, p.z);
      if (s > -margin) {
        arenaNormal(p.x, p.y, p.z, _n);
        p.addScaledVector(_n, s + margin);
      }
    }
  }

  private carRenderPos(car: Car, out: THREE.Vector3) {
    return out.lerpVectors(car.prevPos, car.pos, this.phase === 'replay' ? 1 : this.alpha);
  }

  private chaseCam(dt: number, rig: CamRig, car: Car, ballCam: boolean, intro: number) {
    const cp = this.carRenderPos(car, _c);
    const bp = this.ball.group.position;
    const onSurface = car.grounded && !car.demolished;
    const upRef = onSurface ? car.groundN : WORLD_UP;
    const k = rig.snap ? 1 : 1 - Math.exp(-4 * dt);
    rig.up.lerp(upRef, k).normalize();

    car.forward(_cf);
    const dBall = _e.copy(bp).sub(cp);
    const bDist = dBall.length();
    if (ballCam && bDist > 1.5) {
      dBall.multiplyScalar(1 / bDist);
      _b.copy(dBall);
    } else if (ballCam) {
      _b.copy(_cf);
    } else {
      if (car.vel.lengthSq() > 9 && car.fwdSpeed > 0) {
        _a.copy(car.vel).normalize();
        _b.copy(_cf).lerp(_a, 0.55);
      } else _b.copy(_cf);
      if (onSurface) _b.addScaledVector(rig.up, -_b.dot(rig.up));
      else _b.y *= 0.3;
      _b.normalize();
    }
    const kf = rig.snap ? 1 : 1 - Math.exp(-(ballCam ? 9 : 5.5) * dt);
    rig.fwd.lerp(_b, kf).normalize();

    _a.copy(rig.fwd);
    if (!onSurface || rig.up.y > 0.7) _a.y = clamp(_a.y, -0.22, 0.34);
    _a.normalize();
    const i2 = intro * intro;
    const dist = 3.7 * (1 + 3.2 * i2);
    const height = 1.35 + 5.5 * i2;
    _b.copy(cp).addScaledVector(_a, -dist).addScaledVector(rig.up, height);
    this.clampInside(_b, 0.8);

    if (ballCam && bDist > 1.5) {
      _d.copy(cp).addScaledVector(dBall, Math.min(bDist, 26) * 0.8).addScaledVector(rig.up, 0.3);
    } else {
      _d.copy(cp).addScaledVector(rig.fwd, 7).addScaledVector(rig.up, 0.55);
    }
    const kp = rig.snap ? 1 : 1 - Math.exp(-18 * dt);
    rig.pos.lerp(_b, kp);
    rig.look.lerp(_d, rig.snap ? 1 : 1 - Math.exp(-15 * dt));
  }

  private updateCamera(dt: number) {
    const ph = this.phase;
    for (const rig of this.rigs) {
      const car = this.cars[rig.carIdx];
      let fovTarget = this.settings.fov;
      if (rig.carIdx === -2) {
        // Kamera sędziowska (wspólna arena przy wielu graczach): prowadzi piłkę.
        const bp = this.ball.group.position;
        _b.copy(this.ball.vel);
        _b.y = 0;
        if (_b.lengthSq() < 0.5) {
          _b.copy(rig.fwd);
          _b.y = 0;
        }
        if (_b.lengthSq() < 0.01) _b.set(0, 0, 1);
        _b.normalize();
        _a.copy(bp).addScaledVector(_b, -13);
        _a.y = bp.y * 0.3 + 6.5;
        this.clampInside(_a, 0.8);
        rig.pos.lerp(_a, rig.snap ? 1 : 1 - Math.exp(-2.6 * dt));
        rig.look.lerp(bp, rig.snap ? 1 : 1 - Math.exp(-6 * dt));
        rig.up.lerp(WORLD_UP, Math.min(1, dt * 4)).normalize();
        fovTarget = Math.max(58, this.settings.fov - 8);
      } else if (ph === 'menu' || ph === 'ended' || !car || this.humans.length === 0) {
        rig.orbit += dt * (ph === 'ended' ? 0.25 : 0.1);
        const r = ph === 'ended' ? 46 : 58;
        _a.set(Math.cos(rig.orbit) * r, 17 + Math.sin(rig.orbit * 1.7) * 3, Math.sin(rig.orbit) * r * 1.15);
        rig.pos.lerp(_a, rig.snap ? 1 : 1 - Math.exp(-3 * dt));
        _b.copy(this.ball.group.position).multiplyScalar(0.5);
        _b.y = 3;
        rig.look.lerp(_b, rig.snap ? 1 : 1 - Math.exp(-3 * dt));
        rig.up.set(0, 1, 0);
        fovTarget = 62;
      } else if (ph === 'countdown') {
        this.chaseCam(dt, rig, car, true, clamp(this.countT / 3.2, 0, 1));
      } else if (ph === 'goal') {
        if (this.goalT < 0.9) this.chaseCam(dt, rig, car, rig.ballCam, 0);
        else {
          rig.orbit += dt * 0.55;
          _c.copy(this.ball.group.position);
          const sign = this.goalTeam === 0 ? -1 : 1;
          _c.z = clamp(_c.z, -(B + GOAL_D - 2), B + GOAL_D - 2);
          _c.x = clamp(_c.x, -GOAL_W, GOAL_W);
          _c.y = Math.min(_c.y, 5);
          _a.set(_c.x + Math.cos(rig.orbit) * 12, 4 + Math.sin(this.time * 0.6), _c.z - sign * 6 + Math.sin(rig.orbit) * 10);
          this.clampInside(_a, 0.8);
          rig.pos.lerp(_a, 1 - Math.exp(-2.5 * dt));
          rig.look.lerp(_c, 1 - Math.exp(-5 * dt));
          rig.up.set(0, 1, 0);
        }
      } else if (ph === 'replay') {
        if (rig === this.rigs[0]) {
          const r = this.replayT / this.replayDur;
          const sc = this.cars[this.scorerIdx >= 0 ? this.scorerIdx : 0] || this.cars[0];
          if (r < 0.62 && sc) {
            this.chaseCam(dt, rig, sc, true, 0);
          } else {
            const sign = this.goalTeam === 0 ? -1 : 1;
            _a.set(this.ball.group.position.x * 0.25, 2.6, sign * (B + GOAL_D - 1.2));
            rig.pos.copy(_a);
            rig.look.copy(this.ball.group.position);
            rig.up.set(0, 1, 0);
            fovTarget = 70;
          }
        }
      } else {
        this.chaseCam(dt, rig, car, rig.ballCam, 0);
      }
      if (car && (ph === 'playing' || ph === 'goal') && !car.demolished) {
        if (car.boosting) fovTarget += 5;
        if (car.supersonic) fovTarget += 5;
      }
      rig.fov += (fovTarget - rig.fov) * Math.min(1, dt * 5);
      if (Math.abs(rig.cam.fov - rig.fov) > 0.01) {
        rig.cam.fov = rig.fov;
        rig.cam.updateProjectionMatrix();
      }
      rig.snap = false;
      rig.cam.position.copy(rig.pos);
      if (this.settings.shake && this.shake > 0.001) {
        rig.cam.position.x += (Math.random() - 0.5) * this.shake * 0.5;
        rig.cam.position.y += (Math.random() - 0.5) * this.shake * 0.5;
        rig.cam.position.z += (Math.random() - 0.5) * this.shake * 0.5;
      }
      rig.cam.up.copy(rig.up);
      rig.cam.lookAt(rig.look);
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);
    const main = this.rigs[0]?.cam;
    if (main) {
      main.getWorldDirection(_a);
      this.audio.updateListener(main.position, _a, main.up);
    }
  }

  /* ================= render ================= */
  private render() {
    const first = this.cars[this.humans[0] ?? -1];
    let target = 0;
    if (first && (this.phase === 'playing' || this.phase === 'goal') && !first.demolished) {
      target = clamp((first.vel.length() - 14) / 9, 0, 1) * (first.boosting ? 1 : 0.35);
    }
    this.fxSpeed += (target - this.fxSpeed) * 0.08;
    if (this.splitView()) {
      const el = this.renderer.domElement;
      const w = this.container.clientWidth || el.clientWidth;
      const h = this.container.clientHeight || el.clientHeight;
      this.renderer.setScissorTest(true);
      const n = this.rigs.length;
      const cols = n <= 2 ? n : 2;
      const rows = Math.ceil(n / cols);
      const pw = w / cols;
      const ph = h / rows;
      for (let i = 0; i < n; i++) {
        const rig = this.rigs[i];
        const x = (i % cols) * pw;
        const y = Math.floor(i / cols) * ph;
        rig.cam.aspect = pw / ph;
        rig.cam.updateProjectionMatrix();
        this.renderer.setViewport(x, h - y - ph, pw, ph);
        this.renderer.setScissor(x, h - y - ph, pw, ph);
        this.renderer.render(this.scene, rig.cam);
      }
      this.renderer.setScissorTest(false);
      this.renderer.setViewport(0, 0, w, h);
      return;
    }
    if (this.composer && this.fx) {
      const u = this.fx.uniforms;
      u.uTime.value = this.time;
      u.uSpeed.value = this.fxSpeed;
      u.uFlash.value = this.flash * 0.6;
      u.uFlashColor.value.copy(this.flashColor);
      u.uAberr.value = 1 + this.shake * 4;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.rigs[0]?.cam ?? new THREE.PerspectiveCamera());
    }
  }

  /* ================= nagrywanie podglądów biblioteki ================= */
  /** Jeden pełny kadr (symulacja + render) na żądanie harnessu — bez rAF. */
  captureFrame(fps: number) {
    this.update(1 / (fps * 2));
    this.update(1 / (fps * 2));
    this.render();
    return this.renderer.domElement;
  }

  /** Podgląd: start meczu samych botów (demo ligowe) z krótkim odliczaniem. */
  startCaptureMatch(fps: number) {
    this.startMatch({ humans: [], botCount: 4, difficulty: 2, minutes: 3, goalLimit: 0 });
    this.countT = 0.15;
    for (let n = 0; n < 24; n++) this.captureFrame(fps);
  }

  /* ================= HUD dla adaptera ================= */
  private toastMsg(t: string, sec: number) {
    this.toast = t;
    this.toastT = sec;
  }

  private pushFeed(text: string, team: number, kind: 'goal' | 'save' | 'demo' | 'info' | 'boost') {
    this.feed.push({ id: this.feedId++, text, team, kind, t: this.time });
    if (this.feed.length > 5) this.feed.shift();
  }

  private emit(kind: NitroEventData['kind'], team: number, name: string, speed?: number, victim?: string) {
    this.onEvent?.({ kind, team, name, speed, victim });
  }

  phaseNow() {
    return this.phase;
  }

  scoresNow(): [number, number] {
    return [this.scores[0], this.scores[1]];
  }

  overtimeNow() {
    return this.overtime;
  }

  timeNow() {
    return this.overtime ? this.overtimeT : Math.max(0, this.timeLeft);
  }

  countdownNow() {
    if (this.phase === 'countdown') return Math.max(1, Math.ceil(this.countT));
    if (this.goBanner > 0) return 0;
    return -1;
  }

  goalBannerNow() {
    return this.phase === 'goal' && this.goalT > 0.25 ? this.goalInfo : null;
  }

  winnerNow() {
    return this.winner;
  }

  statsNow() {
    return this.stats.map((x) => ({ ...x }));
  }

  humansNow() {
    return this.humans.map((carIdx, h) => ({
      carIdx,
      boost: this.cars[carIdx]?.boost ?? 0,
      speed: Math.round((this.cars[carIdx]?.vel.length() ?? 0) * 4.5),
      supersonic: !!this.cars[carIdx]?.supersonic,
      demolished: !!this.cars[carIdx]?.demolished,
      respawn: this.cars[carIdx]?.demolished ? Math.max(0, this.cars[carIdx].respawnTimer) : 0,
      team: this.cars[carIdx]?.team ?? 0,
      roster: this.roster[h],
    }));
  }

  fpsNow() {
    return Math.round(this.fps);
  }

  toastNow() {
    return this.toastT > 0 ? this.toast : null;
  }

  /** Ostatni wpis kibicowskiego feedu — status HUD adaptera. */
  feedNow() {
    return this.feed.length ? this.feed[this.feed.length - 1].text : '';
  }

  /** Przełącza kamerę piłka/auto dla i-tego człowieka. */
  toggleBallCam(h = 0) {
    const rig = this.rigs[h];
    if (!rig || rig.carIdx < 0) return;
    rig.ballCam = !rig.ballCam;
    this.toastMsg(rig.ballCam ? 'KAMERA NA PIŁKĘ' : 'KAMERA NA AUTO', 1.2);
  }

  /* ================= minimapa (opcjonalna) ================= */
  attachMinimap(c: HTMLCanvasElement | null) {
    this.minimap = c;
  }
  private minimap: HTMLCanvasElement | null = null;
  private mmT = 0;

  private drawMinimap() {
    const c = this.minimap;
    if (!c) return;
    const now = performance.now();
    if (now - this.mmT < 50) return;
    this.mmT = now;
    const g = c.getContext('2d');
    if (!g) return;
    const W = c.width;
    const Hh = c.height;
    g.clearRect(0, 0, W, Hh);
    const flip = (this.cars[this.humans[0] ?? -1]?.team ?? 0) === 1 ? -1 : 1;
    const sx = (W - 16) / (2 * A);
    const sz = (Hh - 16) / (2 * (B + 4));
    const X = (x: number) => W / 2 + x * flip * sx;
    const Y = (z: number) => Hh / 2 + z * flip * sz;
    g.fillStyle = 'rgba(6,12,24,0.7)';
    g.strokeStyle = 'rgba(120,190,255,0.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    const rx = Math.min(X(-A), X(A));
    const ry = Math.min(Y(-B), Y(B));
    if (typeof g.roundRect === 'function') g.roundRect(rx, ry, 2 * A * sx, 2 * B * sz, 14);
    else g.rect(rx, ry, 2 * A * sx, 2 * B * sz);
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.moveTo(X(-A), Y(0));
    g.lineTo(X(A), Y(0));
    g.stroke();
    g.beginPath();
    g.arc(X(0), Y(0), 8 * sx, 0, Math.PI * 2);
    g.stroke();
    for (const s of [1, -1]) {
      g.fillStyle = s > 0 ? 'rgba(60,130,255,0.9)' : 'rgba(255,140,40,0.9)';
      const gx = X(-GOAL_W);
      const gy = Y(s * B);
      g.fillRect(Math.min(gx, X(GOAL_W)), gy - 1.5, GOAL_W * 2 * sx, 3);
    }
    for (const car of this.cars) {
      if (car.demolished) continue;
      g.save();
      g.translate(X(car.pos.x), Y(car.pos.z));
      car.forward(_a);
      g.rotate(Math.atan2(_a.x * flip, -_a.z * flip));
      g.fillStyle = car.team === 0 ? '#4a90ff' : '#ff8a2a';
      g.strokeStyle = this.humans.includes(car.index) ? '#fff' : 'rgba(0,0,0,0.6)';
      g.lineWidth = this.humans.includes(car.index) ? 2 : 1;
      const r = this.humans.includes(car.index) ? 6 : 4.5;
      g.beginPath();
      g.moveTo(0, -r * 1.3);
      g.lineTo(r, r);
      g.lineTo(-r, r);
      g.closePath();
      g.fill();
      g.stroke();
      g.restore();
    }
    g.fillStyle = '#fff';
    g.shadowColor = '#fff';
    g.shadowBlur = 8;
    g.beginPath();
    g.arc(X(this.ball.pos.x), Y(this.ball.pos.z), 4.2, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }

  /* ================= sprzątanie ================= */
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.audio.dispose();
    this.clearCars();
    this.stadium.dispose();
    this.fxAdd.dispose();
    this.fxNorm.dispose();
    if (this.composer) this.composer.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

const KICK_SPOTS: [number, number][] = [
  [-20.48, 25.6],
  [20.48, 25.6],
  [0, 46.08],
];

