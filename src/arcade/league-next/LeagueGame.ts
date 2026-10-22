import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import {
  A, B, BALL_R, GOAL_W, GOAL_H, GOAL_D, STEP, TEAM_HEX, TEAM_LIGHT, BOOST_PADS, ACCENTS,
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
import { NameTag } from './markers';
import {
  OVERTIME_MAX_SECONDS, autoLevel, driveToward, type LeagueSnapshot, type RosterEntry, type StickSample, teamSize,
} from './bridge';
import type { Language } from '../../platform/i18n';
import type { PadFx } from '../../net/protocol';
import type { MomentEvent } from '../../platform/momentRecorder';
import { BotBrain, BotContext, Role } from './ai';
import {
  FeedItem, GameSettings, Phase, PlayerStat, newInput,
} from './types';

const V = THREE.Vector3;
const WORLD_UP = new V(0, 1, 0);
const _a = new V();
const _b = new V();
const _c = new V();
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

/** Szwy dla testów w node (bez GPU). Produkcja ich nie ustawia. */
export interface LeagueEnv {
  createRenderer?: (canvas: HTMLCanvasElement) => THREE.WebGLRenderer;
  makeEnvironment?: (renderer: THREE.WebGLRenderer) => THREE.Texture;
}

export interface LeagueOptions {
  /** 0 = płynność, 1 = balans, 2 = detal (profil sprzętu z ustawień rundy). */
  quality: 0 | 1 | 2;
  language: Language;
  goalLimit: number;
  matchSeconds: number;
  /** Gałka i boost danego slotu (składa je adapter z pada i klawiatury). */
  readInput: (slot: number) => StickSample;
  onHud: (snapshot: LeagueSnapshot) => void;
  onFinish: (snapshot: LeagueSnapshot) => void;
  /** Po każdym pełnym renderze, póki piksele WebGL są ważne (nagrywanie Moments). */
  onFrame?: (canvas: HTMLCanvasElement) => void;
  onFx?: (slot: number, fx: PadFx) => void;
  onMoment?: (event: MomentEvent) => void;
  onFatal?: (error: unknown) => void;
  /** Wyłącza wstrząsy kamery (prefers-reduced-motion). */
  reducedMotion?: boolean;
  env?: LeagueEnv;
}

/* Wspólna kamera „transmisyjna”: stoi po stronie +X i patrzy w −X pod stałym kątem, więc prawo
   ekranu = −Z, a gałka ma jedno znaczenie dla wszystkich graczy. Kąt jest stromy, żeby nieprzezroczysty
   panel ściany (do 6,4 m) przysłaniał tylko wąski pas przy samej bandzie. */
const CAM_PITCH = (56 * Math.PI) / 180;
const CAM_COS = Math.cos(CAM_PITCH);
const CAM_SIN = Math.sin(CAM_PITCH);
const CAM_MIN = 30;
const CAM_MAX = 92;
const CAM_MARGIN = 5;
/** Ile sekund po końcowym gwizdku trwa oprawa, zanim platforma pokaże wynik. */
const END_HOLD = 3.2;
/** Powtórka gola: ostatnie 4,5 s (nagrywamy 50 klatek na sekundę). */
const REPLAY_FRAMES = 50 * 4.5;

interface Frame {
  t: number;
  d: Float32Array;
}

const KICK_SPOTS: [number, number][] = [
  [-20.48, 25.6],
  [20.48, 25.6],
  [-2.56, 38.4],
  [2.56, 38.4],
  [0, 46.08],
];

export class LeagueGame {
  renderer: THREE.WebGLRenderer;
  scene = new THREE.Scene();
  camera: THREE.PerspectiveCamera;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  private fx: ShaderPass | null = null;
  private stadium!: Stadium;
  private ball!: Ball;
  private cars: Car[] = [];
  private visuals: CarVisual[] = [];
  private bots: (BotBrain | null)[] = [];
  private stats: PlayerStat[] = [];
  private trails: Trail[] = [];
  private pads: BoostPad[] = [];
  private fxAdd!: Particles;
  private fxNorm!: Particles;
  private ballTrail!: Trail;
  private audio = new AudioEngine();
  private canvas: HTMLCanvasElement;
  private opts: LeagueOptions;
  private roster: RosterEntry[];
  private markers: (NameTag | undefined)[] = [];
  private mode = 2;
  private activeT = 0;
  private started = false;
  private finished = false;
  private limitReached = false;
  private muted = false;
  private focus = new V(0, 1.2, 0);
  private camDist = 60;
  private skipEdge = false;
  private skipLatch = false;
  private stuckT: number[] = [];
  private track = Array.from({ length: 6 }, () => new V());
  settings: GameSettings;
  private keyLight!: THREE.DirectionalLight;
  private boostLight!: THREE.PointLight;
  private goalLight!: THREE.PointLight;
  private raf = 0;
  private lastT = 0;
  private time = 0;
  private accum = 0;
  private alpha = 0;
  private hudT = 0;
  private mmT = 0;
  private minimap: HTMLCanvasElement | null = null;
  private disposed = false;

  // stan meczu
  private phase: Phase = 'countdown';
  private paused = false;
  private scores: [number, number] = [0, 0];
  private timeLeft = 300;
  private overtime = false;
  private overtimeT = 0;
  private countT = 0;
  private lastCountInt = -1;
  private goBanner = 0;
  private goalT = 0;
  private goalTeam = 0;
  private goalInfo: { team: number; name: string; speed: number } | null = null;
  private recStop = false;
  private winner = -1;
  private endT = 0;
  private timeScale = 1;
  private feed: (FeedItem & { t: number })[] = [];
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

  // replay
  private rec: Frame[] = [];
  private recAcc = 0;
  private replayFrames: Frame[] = [];
  private replayT = 0;
  private replayDur = 1;
  private replaySkip = false;

  // kamera
  private camPos = new V(0, 20, 60);
  private camLook = new V();
  private camUp = new V(0, 1, 0);
  private camSnap = true;
  private shake = 0;
  private fov = 75;
  private orbit = 0;
  private fxSpeed = 0;


  constructor(canvas: HTMLCanvasElement, minimap: HTMLCanvasElement | null, roster: RosterEntry[], opts: LeagueOptions) {
    this.canvas = canvas;
    this.minimap = minimap;
    this.roster = roster;
    this.opts = opts;
    this.settings = { quality: opts.quality, volume: 0.8, music: true, fov: 50, shake: !opts.reducedMotion, showFps: false };
    this.renderer = opts.env?.createRenderer
      ? opts.env.createRenderer(canvas)
      : new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, 16 / 9, 0.1, 2500);
    this.audio.volume = this.settings.volume;
    this.audio.musicOn = this.settings.music;

    this.scene.fog = new THREE.FogExp2(0x0a1424, 0.0024);
    this.scene.environment = (opts.env?.makeEnvironment ?? makeEnvironment)(this.renderer);
    this.scene.environmentIntensity = 0.85;
    this.buildWorld();
    this.applyQuality();
    window.addEventListener('resize', this.onResize);
    this.onResize();
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

    // światła
    this.scene.add(new THREE.HemisphereLight(0x7f9fff, 0x1b2b22, 1.6));
    this.keyLight = new THREE.DirectionalLight(0xfff1de, 6.5);
    this.keyLight.castShadow = true;
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
    const fillB = new THREE.DirectionalLight(0x3f7cff, 2.0);
    fillB.position.set(0, 35, 70);
    const fillO = new THREE.DirectionalLight(0xff8a2e, 2.0);
    fillO.position.set(0, 35, -70);
    this.scene.add(fillB, fillO);
    this.boostLight = new THREE.PointLight(0xffaa55, 0, 14, 2);
    this.scene.add(this.boostLight);
    this.goalLight = new THREE.PointLight(0xffffff, 0, 60, 1.6);
    this.scene.add(this.goalLight);

  }

  applyQuality() {
    const q = this.settings.quality;
    const pr = Math.min(window.devicePixelRatio || 1, q >= 2 ? 2 : q === 1 ? 1.5 : 1);
    this.renderer.setPixelRatio(pr);
    const sm = q >= 2 ? 4096 : q === 1 ? 2048 : 1024;
    this.keyLight.shadow.mapSize.set(sm, sm);
    if (this.keyLight.shadow.map) {
      this.keyLight.shadow.map.dispose();
      this.keyLight.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
    this.keyLight.castShadow = true;
    this.renderer.shadowMap.enabled = q >= 1 || true;
    this.buildComposer();
    this.onResize();
  }

  private buildComposer() {
    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    const q = this.settings.quality;
    if (q < 1) {
      this.bloom = null;
      this.fx = null;
      return;
    }
    const w = this.canvas.clientWidth || 1280;
    const h = this.canvas.clientHeight || 720;
    const pr = this.renderer.getPixelRatio();
    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, { type: THREE.HalfFloatType, samples: 4 });
    const comp = new EffectComposer(this.renderer, rt);
    comp.setPixelRatio(pr);
    comp.setSize(w, h);
    comp.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), q >= 2 ? 0.62 : 0.5, 0.7, 0.92);
    comp.addPass(this.bloom);
    this.fx = new ShaderPass(FxShader);
    comp.addPass(this.fx);
    comp.addPass(new OutputPass());
    this.composer = comp;
  }

  private onResize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (this.composer) this.composer.setSize(w, h);
  };


  /* ================= samochody ================= */
  private clearCars() {
    for (const tag of this.markers) tag?.dispose();
    this.markers = [];
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
    this.audio.clearEngines();
  }

  private spawnCars() {
    this.clearCars();
    this.stuckT = [];
    for (const entry of this.roster) {
      const car = new Car(entry.team, entry.index, entry.name, entry.human);
      // Karoseria jest w kolorze drużyny (czytelność składów), a gracz jest rozpoznawalny po
      // kolorze swojego slotu: smuga, światło pod autem i etykieta nad dachem.
      const accent = entry.human ? entry.color : ACCENTS[(entry.index * 3 + 1) % ACCENTS.length];
      const vis = new CarVisual({
        body: entry.index % 3,
        accent,
        wheel: (entry.index + 1) % 3,
        paint: TEAM_HEX[entry.team],
        flame: TEAM_LIGHT[entry.team],
      });
      this.scene.add(vis.group);
      const trail = new Trail(16, 0.16);
      trail.color.set(accent).multiplyScalar(1.6);
      this.scene.add(trail.mesh);
      this.cars.push(car);
      this.visuals.push(vis);
      this.trails.push(trail);
      this.bots.push(entry.human ? null : new BotBrain(car, 1));
      this.stats.push({ name: entry.name, team: entry.team, goals: 0, assists: 0, saves: 0, shots: 0, demos: 0, score: 0, isPlayer: entry.human });
      if (entry.human) {
        const tag = new NameTag(entry.name, entry.color);
        this.scene.add(tag.sprite);
        this.markers[entry.index] = tag;
      }
    }
  }

  private placeForKickoff() {
    const mode = this.mode;
    let spots: [number, number][];
    if (mode === 1) spots = [[KICK_SPOTS[0], KICK_SPOTS[1], KICK_SPOTS[4]][Math.floor(Math.random() * 3)]];
    else if (mode === 2) spots = [KICK_SPOTS[0], KICK_SPOTS[1]];
    else spots = [KICK_SPOTS[0], KICK_SPOTS[1], KICK_SPOTS[4]];
    spots = [...spots].sort(() => Math.random() - 0.5);
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

  private setPhaseExtras() {
    for (const v of this.visuals) v.setVisible(true);
    this.ball.group.visible = true;
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
    this.camSnap = true;
    this.setPhaseExtras();
    this.stadium.setScreen({ mode: 'score', blue: this.scores[0], orange: this.scores[1], label: '' });
    this.exciteBoost = 0;
  }

  /** Start meczu: skład z platformy, odliczanie 3…2…1 i gwizdek. */
  start() {
    this.started = true;
    this.spawnCars();
    this.mode = teamSize(this.roster);
    this.scores = [0, 0];
    this.timeLeft = this.opts.matchSeconds;
    this.overtime = false;
    this.overtimeT = 0;
    this.winner = -1;
    this.feed = [];
    this.rec = [];
    this.timers = [];
    this.paused = false;
    this.lastShot = null;
    this.touches = [];
    this.activeT = 0;
    this.finished = false;
    this.limitReached = false;
    this.beginKickoff();
    this.audio.resume();
    this.audio.setMusicLevel(0.2);
    this.audio.setCrowd(0.5);
    this.audio.whistle();
  }

  setPaused(p: boolean) {
    this.paused = p;
    if (p) this.audio.silenceEngines();
    this.emitHud(true); // nakładka pauzy w platformie ma reagować od razu, nie po 66 ms throttlingu HUD-u
  }

  isPaused() {
    return this.paused;
  }

  /** Dźwięk należy do platformy: przycisk w pasku gry wycisza muzykę, kibiców i silniki. */
  setMuted(on: boolean) {
    if (this.muted === on) return;
    this.muted = on;
    this.audio.setVolume(on ? 0 : this.settings.volume);
  }

  /* ================= most do platformy ================= */
  private t(pl: string, en: string) {
    return this.opts.language === 'en' ? en : pl;
  }

  private slotOf(car: Car): number {
    return this.roster[car.index]?.slot ?? -1;
  }

  /** Haptyka pada — tylko dla ludzi (boty nie mają pada). */
  private haptic(car: Car, fx: PadFx) {
    if (car.isPlayer) this.opts.onFx?.(this.slotOf(car), fx);
  }

  /** Telemetria Moments: wyłącznie zdarzenia wynikające z konkretnego stanu meczu. */
  private moment(car: Car | null, kind: MomentEvent['kind'], title: string, detail: string, weight: number) {
    if (!car || !car.isPlayer) return;
    this.opts.onMoment?.({ kind, slot: this.slotOf(car), title, detail, at: Math.round(this.activeT * 10) / 10, weight: clamp(Math.round(weight), 20, 120) });
  }

  /** Migawka stanu dla platformy (HUD i wynik). */
  snapshot(): LeagueSnapshot {
    return {
      phase: this.phase === 'menu' || this.phase === 'garage' ? 'countdown' : this.phase,
      paused: this.paused,
      scores: [this.scores[0], this.scores[1]],
      time: this.overtime ? Math.max(0, OVERTIME_MAX_SECONDS - this.overtimeT) : Math.max(0, this.timeLeft),
      overtime: this.overtime,
      // odliczanie startuje od 3,2 s — bez przycięcia HUD pokazywałby przez 0,2 s „4” zamiast 3-2-1
      countdown: this.phase === 'countdown' ? Math.min(3, Math.max(1, Math.ceil(this.countT))) : 0,
      goalBanner: this.phase === 'goal' && this.goalT > 0.25 ? this.goalInfo : null,
      winner: this.winner,
      goalLimit: this.opts.goalLimit,
      toast: this.toast,
      cars: this.cars.map((car, i) => {
        const entry = this.roster[i];
        const st = this.stats[i];
        return {
          index: i, slot: entry.slot, name: entry.name, color: entry.color, team: entry.team, human: entry.human,
          goals: st.goals, assists: st.assists, saves: st.saves, shots: st.shots, demos: st.demos, score: st.score,
          boost: Math.round(car.boost), demolished: car.demolished,
        };
      }),
    };
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
      this.opts.onFrame?.(this.canvas);
    } catch (e) {
      if (!this.errLogged) {
        this.errLogged = true;
        console.error('Błąd pętli gry:', e);
        this.opts.onFatal?.(e);
      }
    }
  };
  private errLogged = false;
  private engT = 0;
  private lastCrowd = -1;

  /** Zbocze narastające „boost” któregokolwiek człowieka — pomija powtórkę gola. */
  private pollSkip() {
    let pressed = false;
    for (const entry of this.roster) if (entry.human && this.opts.readInput(entry.slot).boost) pressed = true;
    this.skipEdge = pressed && !this.skipLatch;
    this.skipLatch = pressed;
  }

  private update(dt: number) {
    // Konstruktor od razu uruchamia pętlę, a mecz zaczyna się dopiero od `start()` (skład z platformy).
    if (!this.started) return;
    this.time += dt;
    this.pollSkip();
    if (this.paused) {
      this.updateCamera(0);
      this.emitHud();
      return;
    }

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
      case 'countdown':
        this.applyHumanInput(dt);
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
          this.camSnap = false;
        }
        break;
      case 'playing':
        this.applyHumanInput(dt);
        this.simulate(dt);
        this.activeT += dt;
        this.tickClock(dt);
        this.record(dt);
        break;
      case 'goal':
        this.goalT += dt;
        this.timeScale = this.goalT < 1.1 ? 0.3 : 1;
        this.applyHumanInput(dt);
        this.simulate(dt * this.timeScale);
        if (!this.recStop) this.record(dt);
        if (this.goalT > 0.9) this.recStop = true;
        if (this.goalT > 3.0) this.startReplay();
        break;
      case 'replay':
        this.updateReplay(dt);
        break;
      case 'ended':
        this.endT += dt;
        if (this.endT > END_HOLD && !this.finished) {
          this.finished = true;
          this.opts.onFinish(this.snapshot());
        }
        break;
      default:
        break;
    }
    if (this.phase !== 'goal') this.timeScale = 1;

    this.updateVisuals(dt);
    this.updateCamera(dt);
    this.updateMarkers();
    this.emitHud();
    this.drawMinimap();
  }

  /**
   * Gałka każdego człowieka → gaz, skręt i boost jego auta. W powietrzu auto samo się wyrównuje
   * (pad nie ma drążków pitch/roll), a zablokowane na dachu odwraca się po chwili.
   */
  private applyHumanInput(dt: number) {
    for (const car of this.cars) {
      if (!car.isPlayer) continue;
      const input = car.input;
      if (car.frozen || car.demolished) {
        input.throttle = 0; input.steer = 0; input.pitch = 0; input.roll = 0; input.boost = false; input.handbrake = false;
        continue;
      }
      const stick = this.opts.readInput(this.slotOf(car));
      car.forward(_cf);
      const n = car.grounded ? car.groundN : WORLD_UP;
      const cmd = driveToward([_cf.x, _cf.y, _cf.z], [n.x, n.y, n.z], car.fwdSpeed, stick);
      input.throttle = cmd.throttle;
      input.steer = cmd.steer;
      input.handbrake = cmd.handbrake;
      input.boost = stick.boost;
      input.jump = false;
      input.jumpPressed = false;
      if (car.grounded) {
        input.pitch = 0;
        input.roll = 0;
      } else {
        _q.copy(car.quat).invert();
        _a.set(0, 1, 0).applyQuaternion(_q);
        const level = autoLevel([_a.x, _a.y, _a.z]);
        input.pitch = level.pitch;
        input.roll = level.roll;
      }
      this.recoverIfStuck(car, dt);
    }
  }

  /** Auto na dachu albo na boku i prawie bez ruchu przez ponad 2 s wraca na koła. */
  private recoverIfStuck(car: Car, dt: number) {
    car.up(_cf);
    const stuck = _cf.y < 0.25 && car.vel.length() < 3;
    this.stuckT[car.index] = stuck ? (this.stuckT[car.index] ?? 0) + dt : 0;
    if (this.stuckT[car.index] > 2.2) {
      this.stuckT[car.index] = 0;
      car.flipUpright();
      this.burst(car.pos, 14, [1.4, 1.8, 3], 5, 0.5, 0.35);
    }
  }

  private tickClock(dt: number) {
    if (this.overtime) {
      this.overtimeT += dt;
      // dogrywka ma sufit: bez gola po OVERTIME_MAX_SECONDS mecz kończy się uczciwym remisem
      if (this.overtimeT >= OVERTIME_MAX_SECONDS) this.endMatch();
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
        this.toastMsg(this.t('DOGRYWKA! ZŁOTY GOL', 'OVERTIME! GOLDEN GOAL'), 3);
        this.audio.whistle();
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
        if (c.isPlayer) this.shake = Math.max(this.shake, Math.min(0.6, impact * 0.05));
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
    // ball again vs arena after pushes (prosta ochrona przed wciśnięciem w ścianę)
    // pady
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
          this.audio.pickup(p.big, p.group.position);
          if (p.big) this.haptic(c, 'pickup');
          this.burst(_a.set(p.x, 0.5, p.z), p.big ? 26 : 8, [3, 1.6, 0.3], p.big ? 9 : 4, 0.6, 0.3);
          break;
        }
      }
    }
    // gol
    if (this.phase === 'playing') {
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
    this.visuals[c.index].setVisible(this.phase !== 'garage');
    this.trails[c.index].reset();
    this.burst(c.pos, 24, [1.2, 2, 3], 7, 0.7, 0.4);
    this.haptic(c, 'respawn');
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
    if (power > 14) this.haptic(car, 'hit');
    if (power > 4) {
      const col = car.team === 0 ? [0.8, 1.6, 4] : [4, 1.9, 0.6];
      this.burst(h.point, Math.min(40, 6 + power), col, 5 + power * 0.35, 0.55, 0.32);
      this.fxAdd.emit({
        x: h.point.x, y: h.point.y, z: h.point.z, life: 0.32, size0: 0.5, size1: 3 + power * 0.14,
        r: col[0], g: col[1], b: col[2], a0: 0.85, a1: 0,
      });
    }
    if (car.isPlayer) this.shake = Math.max(this.shake, Math.min(0.5, power * 0.02));
    else if (power > 20) this.shake = Math.max(this.shake, 0.12);

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
      this.pushFeed(`${st.name} — ${this.t('OBRONA!', 'SAVE!')}`, car.team, 'save');
      this.audio.cheerSmall();
      this.lastShot = null;
      if (car.isPlayer) this.toastMsg(this.t('OBRONA!', 'SAVE!'), 1.6);
      this.moment(car, 'objective', this.t('Obrona', 'Save'), this.t('Strzał w światło bramki zatrzymany', 'A shot on target stopped'), 55);
    }
  }

  private onCarCar(h: CarHit) {
    if (h.strength > 3) {
      this.audio.bump(h.strength * 1.2, h.point);
      this.burst(h.point, 8, [3, 2, 0.8], 5, 0.4, 0.3);
      if (h.a.isPlayer || h.b.isPlayer) this.shake = Math.max(this.shake, Math.min(0.5, h.strength * 0.04));
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
    this.pushFeed(`${this.stats[att.index].name} ${this.t('zdemolował', 'demolished')} ${this.stats[v.index].name}`, att.team, 'demo');
    if (att.isPlayer) this.toastMsg(this.t('ZDEMOLOWANO!', 'DEMOLISHED!'), 1.4);
    this.haptic(att, 'kill');
    this.haptic(v, 'dead');
    if (v.isPlayer) this.shake = 0.8;
  }

  private onGoal(team: number) {
    const ball = this.ball;
    this.scores[team]++;
    this.goalTeam = team;
    const last = ball.lastTouchCar >= 0 ? this.cars[ball.lastTouchCar] : null;
    let name = this.t('Samobój', 'Own goal');
    let scorerIdx = -1;
    let assistIdx = -1;
    if (last && last.team === team) {
      name = last.name;
      scorerIdx = last.index;
      const st = this.stats[last.index];
      st.goals++;
      st.score += 100;
      // asysta: ostatni dotyk partnera z drużyny strzelca w oknie 6 s
      const prev = [...this.touches].reverse().find((t) => t.car !== last.index && this.cars[t.car].team === team && this.time - t.time < 6);
      if (prev) {
        assistIdx = prev.car;
        this.stats[prev.car].assists++;
        this.stats[prev.car].score += 50;
      }
    } else if (last) {
      name = `${last.name} (${this.t('samobój', 'own goal')})`;
    }
    this.goalInfo = { team, name, speed: Math.round(ball.vel.length() * 4.5) };
    this.phase = 'goal';
    this.goalT = 0;
    this.recStop = false;
    this.pushFeed(`${this.t('GOL!', 'GOAL!')} ${name}`, team, 'goal');
    this.goalExplosion(team);
    this.audio.goal();
    this.exciteBoost = 1;
    this.shake = Math.max(this.shake, 0.6);
    this.stadium.setScreen({ mode: 'goal', blue: this.scores[0], orange: this.scores[1], team });
    if (this.scores[team] >= this.opts.goalLimit) this.limitReached = true;
    this.reportGoal(team, scorerIdx, assistIdx);
  }

  /** Gol, asysta, wyrównanie w końcówce i złoty gol — każde zdarzenie z konkretnego stanu meczu. */
  private reportGoal(team: number, scorerIdx: number, assistIdx: number) {
    const speed = this.goalInfo?.speed ?? 0;
    const score = `${this.scores[0]}:${this.scores[1]}`;
    const scorer = scorerIdx >= 0 ? this.cars[scorerIdx] : null;
    const equalizer = this.scores[team] === this.scores[1 - team] && !this.overtime && this.timeLeft < 45;
    if (this.overtime) this.moment(scorer, 'objective', this.t('Złoty gol w dogrywce', 'Golden goal in overtime'), `${speed} km/h · ${score}`, 120);
    else if (equalizer) this.moment(scorer, 'objective', this.t('Wyrównanie w końcówce', 'Late equalizer'), `${speed} km/h · ${score}`, 95);
    else this.moment(scorer, 'score', this.t('Gol', 'Goal'), `${speed} km/h · ${score}`, 50 + speed / 3);
    if (assistIdx >= 0) this.moment(this.cars[assistIdx], 'score', this.t('Asysta', 'Assist'), score, 45);
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
    this.goalLight.intensity = 900;
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
    // fajerwerki
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
    const humanWon = this.roster.some((entry) => entry.human && entry.team === this.winner);
    this.audio.whistle();
    this.audio.endJingle(humanWon);
    for (const c of this.cars) {
      c.frozen = true;
      c.input = newInput();
    }
    this.audio.silenceEngines();
    this.stadium.setScreen({ mode: 'end', blue: this.scores[0], orange: this.scores[1] });
    if (this.winner < 2) this.goalExplosion(this.winner);
    this.exciteBoost = 1;
  }

  private afterGoal() {
    if (this.overtime || this.limitReached || (this.timeLeft <= 0 && this.scores[0] !== this.scores[1])) {
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
    this.replayFrames = this.rec.slice(-REPLAY_FRAMES);
    this.replayT = 0;
    this.replayDur = this.replayFrames[this.replayFrames.length - 1].t - this.replayFrames[0].t;
    this.phase = 'replay';
    this.replaySkip = false;
    this.camSnap = true;
    for (const t of this.trails) t.reset();
    this.ballTrail.reset();
    this.stadium.setScreen({ mode: 'replay' });
    this.audio.whistle();
    this.audio.silenceEngines();
  }

  private updateReplay(dt: number) {
    this.replayT += dt;
    if (this.skipEdge) this.replaySkip = true;
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
    const ph = this.phase;
    const active = ph !== 'garage';
    for (let i = 0; i < this.cars.length; i++) {
      const c = this.cars[i];
      if (c.demolished || !active) {
        this.trails[i].update(this.camera.position, 0);
        continue;
      }
      // płomienie boosta
      if (c.boosting) {
        const cl = c.team === 0 ? [0.7, 1.7, 4.5] : [4.5, 1.8, 0.5];
        for (const sx of [-0.15, 0.15]) {
          const n = 2;
          for (let k = 0; k < n; k++) {
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
        if (Math.random() < 0.5) {
          _a.set(0, 0, 0.9).applyQuaternion(c.quat).add(c.pos);
          this.fxNorm.emit({
            x: _a.x, y: _a.y, z: _a.z, vx: c.vel.x * 0.3 + (Math.random() - 0.5), vy: c.vel.y * 0.3 + 0.4, vz: c.vel.z * 0.3 + (Math.random() - 0.5),
            life: 0.6, size0: 0.3, size1: 1.1, r: 0.3, g: 0.3, b: 0.35, a0: 0.22, a1: 0, drag: 1.5,
          });
        }
      }
      // poślizg – dym i iskry
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
      // ślad ponaddźwiękowy
      const tr = this.trails[i];
      if (c.supersonic) {
        _a.copy(c.pos);
        tr.push(_a);
        tr.update(this.camera.position, 0.85);
      } else {
        tr.reset();
        tr.update(this.camera.position, 0);
      }
    }
    // ślad piłki
    const sp = this.ball.vel.length();
    this.ballTrail.color.copy(this.ball.colorCur).multiplyScalar(1.5);
    if (sp > 12 && active) {
      this.ballTrail.push(this.ball.group.position);
      this.ballTrail.update(this.camera.position, clamp((sp - 12) / 35, 0, 1));
    } else {
      this.ballTrail.reset();
      this.ballTrail.update(this.camera.position, 0);
    }
    // światło gola
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
      if (this.phase !== 'garage') v.setVisible(!c.demolished);
      if (doEng)
        this.audio.engineUpdate(
          c.index, c.pos, clamp(Math.abs(c.fwdSpeed) / 23, 0, 1), c.input.throttle, c.boosting, false,
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

    // światło kierunkowe podąża za akcją
    const player = this.cars.find((c) => c.isPlayer && c.boosting && !c.demolished);
    _a.copy(this.focus);
    _a.x = clamp(_a.x, -A + 10, A - 10);
    _a.z = clamp(_a.z, -B + 10, B - 10);
    _a.y = 0;
    const snap = 0.5;
    _a.x = Math.round(_a.x / snap) * snap;
    _a.z = Math.round(_a.z / snap) * snap;
    this.keyLight.target.position.copy(_a);
    this.keyLight.position.set(_a.x + 24, 62, _a.z + 16);

    // światło boosta gracza
    if (player) {
      _b.set(0, 0, 1.2).applyQuaternion(player.quat).add(player.pos);
      this.boostLight.position.copy(_b);
      this.boostLight.color.set(TEAM_LIGHT[player.team]);
      this.boostLight.intensity += (26 - this.boostLight.intensity) * Math.min(1, dt * 20);
    } else {
      this.boostLight.intensity += (0 - this.boostLight.intensity) * Math.min(1, dt * 14);
    }

    const scale = this.renderer.domElement.height / (2 * Math.tan((this.camera.fov * Math.PI) / 360));
    this.stadium.update(dt, this.time, this.excite, scale);
    this.updateEffects(dt);
    this.fxAdd.update(dt, scale);
    this.fxNorm.update(dt, scale);

    // ekran wyników
    if (ph === 'playing' || ph === 'countdown') {
      this.stadium.setScreen({ mode: 'score', blue: this.scores[0], orange: this.scores[1], time: this.timeText(), label: this.overtime ? this.t('DOGRYWKA', 'OVERTIME') : '' });
    }
    // dźwięk
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

  /* ================= kamera ================= */
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

  /**
   * Kamera wspólna: ostrość na piłce i autach graczy, dystans dobrany tak, żeby wszystko mieściło się
   * w kadrze (oddala się szybko, przybliża powoli). Boty daleko od akcji nie wymuszają oddalenia.
   */
  private broadcastCam(dt: number) {
    const ball = this.ball.group.position;
    let count = 0;
    this.track[count++].copy(ball);
    let wx = ball.x * 2;
    let wz = ball.z * 2;
    let weight = 2;
    for (const c of this.cars) {
      if (c.demolished && !c.isPlayer) continue;
      const p = this.carRenderPos(c, _c);
      if (!c.isPlayer && p.distanceTo(ball) > 46) continue;
      wx += p.x;
      wz += p.z;
      weight++;
      if (count < this.track.length) this.track[count++].copy(p);
    }
    this.focus.set(clamp(wx / weight, -(A - 8), A - 8), 1.2, clamp(wz / weight, -(B - 4), B - 4));
    const t = Math.tan((this.settings.fov * Math.PI) / 360);
    const aspect = this.camera.aspect || 16 / 9;
    let need = CAM_MIN;
    for (let i = 0; i < count; i++) {
      const p = this.track[i];
      const r = Math.abs(p.z - this.focus.z);
      const u = Math.abs(-(p.x - this.focus.x) * CAM_SIN + (p.y - this.focus.y) * CAM_COS);
      need = Math.max(need, (r + CAM_MARGIN) / (aspect * t), (u + CAM_MARGIN) / t);
    }
    need = Math.min(CAM_MAX, need * 1.1);
    this.camDist = this.camSnap ? need : this.camDist + (need - this.camDist) * (1 - Math.exp(-(need > this.camDist ? 3.2 : 1.1) * dt));
    _b.set(CAM_COS, CAM_SIN, 0).multiplyScalar(this.camDist).add(this.focus);
    const k = this.camSnap ? 1 : 1 - Math.exp(-5 * dt);
    this.camPos.lerp(_b, k);
    this.camLook.lerp(this.focus, k);
    this.camUp.set(0, 1, 0);
  }

  /** Etykiety nad autami graczy (nick w kolorze slotu). */
  private updateMarkers() {
    for (const car of this.cars) {
      const tag = this.markers[car.index];
      if (!tag) continue;
      const p = this.carRenderPos(car, _c);
      tag.place(p, this.camera.position, this.camera.fov, !car.demolished && this.phase !== 'ended');
    }
  }

  private updateCamera(dt: number) {
    const ph = this.phase;
    const cam = this.camera;
    let fovTarget = this.settings.fov;
    if (ph === 'ended') {
      this.orbit += dt * 0.25;
      _a.set(Math.cos(this.orbit) * 46, 17 + Math.sin(this.orbit * 1.7) * 3, Math.sin(this.orbit) * 46 * 1.15);
      this.camPos.lerp(_a, this.camSnap ? 1 : 1 - Math.exp(-3 * dt));
      _b.copy(this.ball.group.position).multiplyScalar(0.5);
      _b.y = 3;
      this.camLook.lerp(_b, this.camSnap ? 1 : 1 - Math.exp(-3 * dt));
      this.camUp.set(0, 1, 0);
      fovTarget = 62;
    } else if (ph === 'goal' && this.goalT >= 0.9) {
      this.orbit += dt * 0.55;
      _c.copy(this.ball.group.position);
      const sign = this.goalTeam === 0 ? -1 : 1;
      _c.z = clamp(_c.z, -(B + GOAL_D - 2), B + GOAL_D - 2);
      _c.x = clamp(_c.x, -GOAL_W, GOAL_W);
      _c.y = Math.min(_c.y, 5);
      _a.set(_c.x + Math.cos(this.orbit) * 12, 4 + Math.sin(this.time * 0.6), _c.z - sign * 6 + Math.sin(this.orbit) * 10);
      this.clampInside(_a, 0.8);
      this.camPos.lerp(_a, 1 - Math.exp(-2.5 * dt));
      this.camLook.lerp(_c, 1 - Math.exp(-5 * dt));
      this.camUp.set(0, 1, 0);
    } else if (ph === 'replay' && this.replayT / this.replayDur >= 0.62) {
      const sign = this.goalTeam === 0 ? -1 : 1;
      _a.set(this.ball.group.position.x * 0.25, 2.6, sign * (B + GOAL_D - 1.2));
      this.camPos.copy(_a);
      this.camLook.copy(this.ball.group.position);
      this.camUp.set(0, 1, 0);
      fovTarget = 70;
    } else {
      this.broadcastCam(dt);
    }
    this.camSnap = false;

    this.fov += (fovTarget - this.fov) * Math.min(1, dt * 5);
    if (Math.abs(cam.fov - this.fov) > 0.01) {
      cam.fov = this.fov;
      cam.updateProjectionMatrix();
    }
    this.shake = Math.max(0, this.shake - dt * 2.4);
    cam.position.copy(this.camPos);
    if (this.settings.shake && this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake * 0.5;
      cam.position.y += (Math.random() - 0.5) * this.shake * 0.5;
      cam.position.z += (Math.random() - 0.5) * this.shake * 0.5;
    }
    cam.up.copy(this.camUp);
    cam.lookAt(this.camLook);
    cam.getWorldDirection(_a);
    this.audio.updateListener(cam.position, _a, this.camUp);
  }

  /* ================= render ================= */
  private render() {
    let fastest = 0;
    if (this.phase === 'playing' || this.phase === 'goal') {
      for (const c of this.cars) if (c.isPlayer && !c.demolished) fastest = Math.max(fastest, c.vel.length() * (c.boosting ? 1 : 0.35));
    }
    // kamera wspólna stoi w miejscu, więc rozmycie prędkości jest tylko subtelnym akcentem
    const target = clamp((fastest - 14) / 9, 0, 1) * 0.5;
    this.fxSpeed += (target - this.fxSpeed) * 0.08;
    if (this.composer && this.fx) {
      const u = this.fx.uniforms;
      u.uTime.value = this.time;
      u.uSpeed.value = this.fxSpeed;
      u.uFlash.value = this.flash * 0.6;
      u.uFlashColor.value.copy(this.flashColor);
      u.uAberr.value = 1 + this.shake * 4;
      this.composer.render();
    } else {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /* ================= HUD / minimapa ================= */
  private toastMsg(t: string, sec: number) {
    this.toast = t;
    this.toastT = sec;
  }

  private pushFeed(text: string, team: number, kind: FeedItem['kind']) {
    this.feed.push({ id: this.feedId++, text, team, kind, t: this.time });
    if (this.feed.length > 5) this.feed.shift();
  }

  private emitHud(force = false) {
    const now = performance.now();
    if (!force && now - this.hudT < 66) return;
    this.hudT = now;
    this.opts.onHud(this.snapshot());
  }

  /** Minimapa w orientacji kamery: długość boiska poziomo, niebiescy bronią lewej bramki. */
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
    const sz = (W - 16) / (2 * (B + 4));
    const sx = (Hh - 16) / (2 * A);
    const X = (z: number) => W / 2 - z * sz;
    const Y = (x: number) => Hh / 2 + x * sx;
    g.fillStyle = 'rgba(6,12,24,0.7)';
    g.strokeStyle = 'rgba(120,190,255,0.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    if (typeof g.roundRect === 'function') g.roundRect(X(B), Y(-A), 2 * B * sz, 2 * A * sx, 14);
    else g.rect(X(B), Y(-A), 2 * B * sz, 2 * A * sx);
    g.fill();
    g.stroke();
    g.strokeStyle = 'rgba(255,255,255,0.25)';
    g.beginPath();
    g.moveTo(X(0), Y(-A));
    g.lineTo(X(0), Y(A));
    g.stroke();
    g.beginPath();
    g.arc(X(0), Y(0), 8 * sx, 0, Math.PI * 2);
    g.stroke();
    for (const s of [1, -1]) {
      g.fillStyle = s > 0 ? 'rgba(60,130,255,0.9)' : 'rgba(255,140,40,0.9)';
      g.fillRect(X(s * B) - 1.5, Y(-GOAL_W), 3, GOAL_W * 2 * sx);
    }
    for (const p of this.pads) {
      g.fillStyle = p.active ? (p.big ? 'rgba(255,200,60,1)' : 'rgba(255,170,60,0.7)') : 'rgba(255,255,255,0.12)';
      g.beginPath();
      g.arc(X(p.z), Y(p.x), p.big ? 3.2 : 1.6, 0, Math.PI * 2);
      g.fill();
    }
    for (const car of this.cars) {
      if (car.demolished) continue;
      g.save();
      g.translate(X(car.pos.z), Y(car.pos.x));
      car.forward(_a);
      // kierunek jazdy na ekranie: prawo = −Z, dół = +X
      g.rotate(Math.atan2(-_a.z, -_a.x));
      g.fillStyle = car.team === 0 ? '#4a90ff' : '#ff8a2a';
      g.strokeStyle = car.isPlayer ? this.roster[car.index].color : 'rgba(0,0,0,0.6)';
      g.lineWidth = car.isPlayer ? 2.5 : 1;
      const r = car.isPlayer ? 6 : 4.5;
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
    g.arc(X(this.ball.pos.z), Y(this.ball.pos.x), 4.2, 0, Math.PI * 2);
    g.fill();
    g.shadowBlur = 0;
  }

  /* ================= sprzątanie ================= */
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.audio.dispose();
    this.clearCars();
    this.stadium.dispose();
    this.fxAdd.dispose();
    this.fxNorm.dispose();
    this.composer?.dispose();
    this.composer = null;
    // Mecz kończy się co chwilę (rewanż), a plansza dzieli płótno z platformą: zwalniamy wszystko,
    // co należy do tej rundy — geometrie, materiały, tekstury (stadion ma ich dużo) i render targety.
    this.scene.traverse((object) => {
      const holder = object as THREE.Mesh;
      holder.geometry?.dispose();
      const material = holder.material as THREE.Material | THREE.Material[] | undefined;
      const release = (m: THREE.Material) => {
        for (const value of Object.values(m)) {
          const texture = value as THREE.Texture | null;
          if (texture && typeof texture === 'object' && texture.isTexture) texture.dispose();
        }
        m.dispose();
      };
      if (Array.isArray(material)) material.forEach(release);
      else if (material) release(material);
    });
    this.scene.environment?.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // kontekst wraca do puli przeglądarki od razu
  }
}
