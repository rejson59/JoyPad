import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  BoxGeometry,
  CircleGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  FogExp2,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PointLight,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
  type Material,
  type Texture,
} from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { FXAAPass } from "three/addons/postprocessing/FXAAPass.js";
import { loadAssets, makeNightEnv, type Assets } from "./assets";
import { buildCity, type AABB, type City, type OrderSlot } from "./city";
import { createCourier, updateCourier, updateScarf, type CourierRig } from "./courier";
import { createParticles, createRibbon, makeFloaterSprite, updateChain, updateRibbon, type Particles, type Ribbon } from "./fx";
import { AudioBus } from "./audio";
import { loc as translate, type Lang } from "./strings";
import type { PadFx } from "../../net/protocol";
import type { MomentEvent } from "../../platform/momentRecorder";
import {
  GRADE_LINES,
  ROSTER,
  clamp,
  damp,
  type CourierDef,
  type Mode,
  type OrderKind,
  type Phase,
  type Snapshot,
} from "./types";

const GRAV = 26;
const JUMP = 10.8;
const SPEED = 10.6;
const WEB_RANGE = 47;
const REEL = 9.5;
const MAX_PIZZAS = 6;
const PIZZA_GRAV = 15;
const SPAWNS = [
  new Vector3(-1.8, 0, 11.2),
  new Vector3(1.8, 0, 11.2),
  new Vector3(-1.8, 0, 13.4),
  new Vector3(1.8, 0, 13.4),
];

interface Runner {
  slot: number;
  def: CourierDef;
  rig: CourierRig;
  webRib: Ribbon;
  scarfRib: Ribbon;
  dots: Mesh[];
  ai: boolean;
  joined: boolean;
  pos: Vector3;
  vel: Vector3;
  facing: Vector3;
  spawn: Vector3;
  grounded: boolean;
  prevY: number;
  impact: number;
  webAnchor: Vector3 | null;
  webLen: number;
  webShot: number;
  flashAnchor: Vector3 | null;
  webFlash: number;
  actionDown: boolean;
  actionTime: number;
  startedGrounded: boolean;
  didJump: boolean;
  fireDown: boolean;
  charge: number;
  throwCd: number;
  pizzas: number;
  score: number;
  combo: number;
  comboT: number;
  bestCombo: number;
  deliveries: number;
  perfects: number;
  misses: number;
  heat: number;
  overdrive: number;
  lastSwing: number;
  coyote: number;
  airJumps: number;
  wall: Vector3;
  stuck: number;
  aimOrder: number;
  sawFall: boolean;
  swingHold: number;
  resupply: number;
  wasEmpty: boolean;
  wish: Vector3;
}

interface Order {
  id: number;
  slot: number;
  pos: Vector3;
  normal: Vector3;
  kind: OrderKind;
  value: number;
  radius: number;
  ttl: number;
  time: number;
  rush: boolean;
  hot: boolean;
  group: Group;
  pillar: Mesh;
  ring: Mesh;
  icon: Sprite;
  arm: Group | null;
}

interface Pizza {
  active: boolean;
  pos: Vector3;
  vel: Vector3;
  owner: number;
  life: number;
  target: number;
  fromAir: boolean;
  fromSwing: boolean;
  mesh: Group;
  spin: number;
}

interface Floater {
  sprite: Sprite;
  life: number;
  max: number;
}

interface Decal {
  mesh: Mesh;
  life: number;
}

export type Quality = "performance" | "balanced" | "quality";

/** Wejście jednego kuriera w jednej klatce — składa je adapter (`bridge.sampleInput`). */
export interface RunnerInput {
  x: number;
  y: number;
  action: boolean;
  fire: boolean;
  /** Kurier rzuca sam, gdy ma klienta w celowniku (pad i klawiatura bez klawisza rzutu). */
  assist: boolean;
}

/** Szwy dla testów w node (bez GPU i bez sieci). Produkcja ich nie ustawia. */
export interface GameEnv {
  createRenderer?: (canvas: HTMLCanvasElement) => WebGLRenderer;
  loadAssets?: () => Promise<Omit<Assets, "env">>;
  makeEnv?: (renderer: WebGLRenderer) => Texture;
}

export interface GameOptions {
  quality?: Quality;
  language?: Lang;
  readInput: (slot: number) => RunnerInput;
  /** Nadpisania wyglądu kuriera per slot: kolory i podpis gracza. */
  styles?: Partial<CourierDef>[];
  /** Po każdym pełnym renderze, póki piksele WebGL są ważne (nagrywanie Moments). */
  onFrame?: (canvas: HTMLCanvasElement) => void;
  onFx?: (slot: number, fx: PadFx) => void;
  onMoment?: (event: MomentEvent) => void;
  /** Start się nie udał (np. brak pamięci GPU) — platforma pokazuje błąd zamiast wiecznego ładowania. */
  onFatal?: (error: unknown) => void;
  env?: GameEnv;
}

function disposeMaterial(material: Material) {
  for (const value of Object.values(material)) {
    const texture = value as Texture | null;
    if (texture && typeof texture === "object" && texture.isTexture) texture.dispose();
  }
  material.dispose();
}

export class Game {
  private canvas: HTMLCanvasElement;
  private minimap: HTMLCanvasElement | null;
  private onSnap: (s: Snapshot) => void;
  private opts: GameOptions;
  private quality: Quality;
  private lang: Lang;
  private renderer: WebGLRenderer;
  private scene = new Scene();
  private camera = new PerspectiveCamera(50, 1, 0.12, 700);
  private composer: EffectComposer | null = null;
  private fxaa: FXAAPass | null = null;
  private audio = new AudioBus();
  private dead = false;
  private ready = false;
  private raf = 0;
  private last = 0;
  private lastPush = 0;
  private time = 0;
  private sinceLoad = 0;
  private playTime = 0;
  private phase: Phase = "loading";
  private mode: Mode = "coop";
  private duration = 120;
  private timeLeft = 120;
  private countdown = 3;
  private saidLate = false;
  private load = 0.08;
  private announcer = "";
  private announcerSub = "";
  private announcerId = 0;
  private annLife = 0;
  private annP = 0;
  private hint = "";
  private stars = 0;
  private grade = "D";
  private mvp = 0;
  private shake = 0;
  private hotCd = 24;
  private spawnCd = 0;
  private orderSeq = 1;
  private assets!: Assets;
  private city!: City;
  private particles!: Particles;
  private players: Runner[] = [];
  private bot!: Runner;
  private orders: Order[] = [];
  private pizzas: Pizza[] = [];
  private floaters: Floater[] = [];
  private decals: Decal[] = [];
  private decalI = 0;
  private crown = new Group();
  private camPos = new Vector3(8, 16, 36);
  private camLook = new Vector3(0, 8, -6);
  private tmp = new Vector3();
  private tmp2 = new Vector3();
  private tmp3 = new Vector3();
  private aimDir = new Vector3();
  private fly = new Vector3();
  private focusV = new Vector3();
  private pausedFrom: Phase = "play";
  private sun!: DirectionalLight;

  constructor(canvas: HTMLCanvasElement, minimap: HTMLCanvasElement | null, onSnap: (s: Snapshot) => void, opts: GameOptions) {
    this.canvas = canvas;
    this.minimap = minimap;
    this.onSnap = onSnap;
    this.opts = opts;
    this.quality = opts.quality ?? "balanced";
    this.lang = opts.language ?? "pl";
    this.renderer = opts.env?.createRenderer
      ? opts.env.createRenderer(canvas)
      : new WebGLRenderer({ canvas, antialias: this.quality !== "performance", powerPreference: "high-performance" });
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.18;
    this.renderer.shadowMap.enabled = this.quality !== "performance";
    this.renderer.shadowMap.type = PCFSoftShadowMap;
    this.renderer.setClearColor(0x120c16, 1);
    this.scene.fog = new FogExp2(0x1a1022, 0.0062);
    this.scene.background = new Color(0x120c18);
    this.scene.add(new HemisphereLight(0xb7c6ef, 0x3a2430, 0.85));
    this.sun = new DirectionalLight(0xe4ecff, 2.35);
    this.sun.position.set(-36, 72, 28);
    this.sun.castShadow = true;
    const shadowSize = this.quality === "quality" ? 2048 : 1024;
    this.sun.shadow.mapSize.set(shadowSize, shadowSize);
    const cam = this.sun.shadow.camera;
    cam.left = -62;
    cam.right = 62;
    cam.top = 62;
    cam.bottom = -62;
    cam.near = 8;
    cam.far = 180;
    this.sun.shadow.bias = -0.00035;
    this.sun.shadow.normalBias = 0.045;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const fill = new DirectionalLight(0xff8a4a, 0.45);
    fill.position.set(24, 14, 36);
    this.scene.add(fill);
    const plaza = new PointLight(0xffb07a, 55, 42, 2);
    plaza.position.set(0, 7, 5);
    this.scene.add(plaza);
    const cool = new PointLight(0x7ad7ff, 30, 36, 2);
    cool.position.set(-10, 9, -8);
    this.scene.add(cool);
    this.resize();
    window.addEventListener("resize", this.resize);
    this.push(true);
    void this.boot();
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.resize);
    this.audio.dispose();
    this.composer?.dispose();
    this.composer = null;
    // Runda kończy się co chwilę (rewanż), a plansza dzieli płótno z platformą — zwalniamy
    // wszystko, co należy do tej rundy: geometrie, materiały, tekstury i render targety.
    this.scene.traverse((object) => {
      const holder = object as Mesh;
      holder.geometry?.dispose();
      const material = holder.material as Material | Material[] | undefined;
      if (Array.isArray(material)) material.forEach(disposeMaterial);
      else if (material) disposeMaterial(material);
    });
    this.scene.clear();
    if (this.assets) {
      const { signs, ...rest } = this.assets;
      for (const texture of [...Object.values(rest), ...Object.values(signs)]) texture.dispose();
    }
    this.renderer.dispose();
    this.renderer.forceContextLoss(); // kontekst wraca do puli przeglądarki od razu
  }

  setMode(mode: Mode) {
    if (this.phase !== "menu") return;
    this.mode = mode;
    this.audio.ui();
    this.push(true);
  }

  setDuration(seconds: number) {
    if (this.phase !== "menu") return;
    this.duration = seconds;
    this.audio.ui();
    this.push(true);
  }

  join(slot: number) {
    const p = this.players[slot];
    if (!p || p.joined || !this.ready) return;
    if (this.phase !== "menu" && this.phase !== "countdown") return;
    p.joined = true;
    this.resetRunner(p, true);
    p.rig.root.visible = true;
    this.audio.ui();
    this.push(true);
  }

  leave(slot: number) {
    const p = this.players[slot];
    if (!p || this.phase !== "menu") return;
    p.joined = false;
    p.rig.root.visible = false;
    p.webAnchor = null;
    this.audio.ui();
    this.push(true);
  }

  start() {
    if (!this.ready) return;
    this.audio.unlock();
    if (!this.players.some((p) => p.joined)) this.join(0);
    for (const p of this.players) {
      if (p.joined) this.resetRunner(p, true);
      p.rig.root.visible = p.joined;
      p.webRib.mesh.visible = false;
      p.scarfRib.mesh.visible = p.joined;
    }
    this.bot.rig.root.visible = false;
    this.bot.webAnchor = null;
    this.clearOrders();
    this.clearPizzas();
    this.timeLeft = this.duration;
    this.countdown = 3;
    this.phase = "countdown";
    this.saidLate = false;
    this.playTime = 0;
    this.hint = "";
    this.hotCd = 22;
    this.spawnOrder(0, false, true);
    this.spawnOrder(0, false, true);
    for (let i = 0; i < 3; i++) this.spawnOrder(0.15);
    this.audio.beep(false);
    this.push(true);
  }

  rematch() {
    this.start();
  }

  toMenu() {
    this.phase = "menu";
    this.clearOrders();
    this.clearPizzas();
    this.bot.rig.root.visible = true;
    this.bot.pos.set(2, 6, 0);
    this.bot.vel.set(0, 0, 0);
    this.bot.pizzas = MAX_PIZZAS;
    for (const p of this.players) {
      if (p.joined) this.resetRunner(p, false);
      p.rig.root.visible = p.joined;
    }
    for (let i = 0; i < 6; i++) this.spawnOrder(0.2);
    this.hint = "";
    this.push(true);
  }

  pause() {
    if (this.phase === "play" || this.phase === "countdown") {
      this.pausedFrom = this.phase;
      this.phase = "paused";
      this.push(true);
    }
  }

  resume() {
    if (this.phase === "paused") {
      this.phase = this.pausedFrom;
      this.push(true);
    }
  }

  endEarly() {
    if (this.phase === "play" || this.phase === "paused" || this.phase === "countdown") {
      this.phase = "play";
      this.timeLeft = 0;
      this.finish();
    }
  }

  /** Dźwięk należy do platformy: przycisk w pasku gry wycisza także muzykę i efekty silnika. */
  setMuted(on: boolean) {
    this.audio.setMuted(on);
  }

  private async boot() {
    try {
      this.load = 0.2;
      this.push(true);
      const raw = await (this.opts.env?.loadAssets ?? loadAssets)();
      if (this.dead) return;
      this.load = 0.72;
      this.push(true);
      const env = (this.opts.env?.makeEnv ?? makeNightEnv)(this.renderer);
      this.scene.environment = env;
      this.scene.environmentIntensity = 0.42;
      this.assets = { ...raw, env };
      this.city = buildCity(this.assets);
      this.scene.add(this.city.group);
      this.particles = createParticles(720);
      this.scene.add(this.particles.points);
      this.makePlayers();
      this.makePizzas();
      this.makeDecals();
      this.makeCrown();
      this.setupPost();
      for (let i = 0; i < 6; i++) this.spawnOrder(0.2);
      this.ready = true;
      this.phase = "menu";
      this.load = 1;
      this.last = performance.now();
      this.push(true);
      this.raf = requestAnimationFrame(this.loop);
    } catch (err) {
      console.error(err);
      if (!this.dead) this.opts.onFatal?.(err);
    }
  }

  private setupPost() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    // Profil sprzętu: „płynność” to goły render, „balans” dokłada bloom i FXAA,
    // „detal” — pełny zestaw z większym cieniem i gęstszym pikselem.
    const composer = new EffectComposer(this.renderer);
    composer.addPass(new RenderPass(this.scene, this.camera));
    if (this.quality !== "performance") composer.addPass(new UnrealBloomPass(new Vector2(w / 2, h / 2), 0.42, 0.62, 0.58));
    if (this.quality !== "performance") {
      this.fxaa = new FXAAPass();
      composer.addPass(this.fxaa);
    }
    composer.addPass(new OutputPass());
    composer.setSize(w, h);
    this.composer = composer;
  }

  /** Kolor i podpis kuriera z profilu gracza (slot platformy), reszta wyglądu zostaje. */
  private dress(base: CourierDef, slot: number): CourierDef {
    const style = this.opts.styles?.[slot];
    return style ? { ...base, ...style } : base;
  }

  private loc(text: string) {
    return translate(text, this.lang);
  }

  /**
   * Rzut półautomatyczny. Telefon ma jedną gałkę i jeden przycisk (sieć), więc rzut pizzy
   * robi kurier: bierze klienta z `pickAim`, „ładuje” do 0,52 jak bot autora i puszcza.
   * Nie rzuca, gdy ma pusty plecak, stoi na ziemi, klient jest dalej niż 30 m albo
   * w jego stronę leci już pizza tego kuriera (bez dubli w jedno okno).
   */
  private autoFire(p: Runner): boolean {
    if (p.pizzas <= 0) return false;
    if (p.charge > 0) return p.charge < 0.52;
    if (p.throwCd > 0 || p.pos.y <= 2 || p.aimOrder < 0) return false;
    const order = this.orders.find((o) => o.id === p.aimOrder);
    if (!order || p.pos.distanceTo(order.pos) >= 30) return false;
    return !this.pizzas.some((z) => z.active && z.owner === p.slot && z.target === p.aimOrder);
  }

  /** Nagroda za dostawę: wibracja pada i — tylko dla prawdziwych przełomów — zdarzenie Moments. */
  private reward(owner: Runner, pts: number, perfect: boolean, hot: boolean) {
    this.opts.onFx?.(owner.slot, "kill");
    const en = this.lang === "en";
    const at = Math.round(this.playTime * 10) / 10;
    if (owner.combo === 5 || owner.combo === 8 || owner.combo === 12) {
      this.opts.onMoment?.({
        kind: "streak", slot: owner.slot, at,
        title: en ? `Streak ×${owner.combo}` : `Seria ×${owner.combo}`,
        detail: en ? `${owner.combo} deliveries in a row` : `${owner.combo} dostaw pod rząd`,
        weight: Math.min(120, 45 + owner.combo * 6),
      });
    } else if (hot) {
      this.opts.onMoment?.({
        kind: "objective", slot: owner.slot, at,
        title: en ? "Hot order delivered" : "Gorące zamówienie dowiezione", detail: `+${pts}`, weight: 80,
      });
    } else if (perfect && pts >= 320) {
      this.opts.onMoment?.({
        kind: "score", slot: owner.slot, at,
        title: en ? "Perfect delivery" : "Perfekcyjna dostawa", detail: `+${pts}`,
        weight: Math.min(100, 30 + Math.round(pts / 12)),
      });
    }
  }

  private makePlayers() {
    const pizzaMat = new MeshStandardMaterial({ map: this.assets.pizza, color: "#f0d2a8", roughness: 0.68 });
    ROSTER.forEach((base, i) => {
      const def = this.dress(base, i);
      const rig = createCourier(def, true);
      (rig.pizzaHand.material as MeshStandardMaterial).map = this.assets.pizza;
      (rig.pizzaHand.material as MeshStandardMaterial).needsUpdate = true;
      rig.root.visible = false;
      this.scene.add(rig.root);
      const webRib = createRibbon();
      const scarfRib = createRibbon();
      this.scene.add(webRib.mesh, scarfRib.mesh);
      const dots = Array.from({ length: 10 }, () => {
        const m = new Mesh(
          new SphereGeometry(0.09, 6, 6),
          new MeshBasicMaterial({ color: def.color, transparent: true, opacity: 0.8, depthWrite: false }),
        );
        m.visible = false;
        this.scene.add(m);
        return m;
      });
      const runner = this.blank(def, rig, webRib, scarfRib, dots, false, SPAWNS[i]);
      this.players.push(runner);
    });
    const botDef: CourierDef = {
      ...ROSTER[1],
      slot: -1,
      name: "DEMO",
      full: "Demo",
      color: "#ff7ad9",
      deep: "#5a1848",
      accent: "#ffd0ef",
      visor: "#ffd6f6",
      scarf: "#ffe6fa",
    };
    const brig = createCourier(botDef, true);
    (brig.pizzaHand.material as MeshStandardMaterial).map = this.assets.pizza;
    brig.pizzaHand.material = pizzaMat;
    this.scene.add(brig.root);
    const webRib = createRibbon();
    const scarfRib = createRibbon();
    this.scene.add(webRib.mesh, scarfRib.mesh);
    this.bot = this.blank(botDef, brig, webRib, scarfRib, [], true, new Vector3(3, 6, -1));
    this.bot.joined = true;
    this.bot.pizzas = MAX_PIZZAS;
    void pizzaMat;
  }

  private blank(
    def: CourierDef,
    rig: CourierRig,
    webRib: Ribbon,
    scarfRib: Ribbon,
    dots: Mesh[],
    ai: boolean,
    spawn: Vector3,
  ): Runner {
    const r: Runner = {
      slot: def.slot,
      def,
      rig,
      webRib,
      scarfRib,
      dots,
      ai,
      joined: false,
      pos: spawn.clone(),
      vel: new Vector3(),
      facing: new Vector3(0, 0, -1),
      spawn: spawn.clone(),
      grounded: true,
      prevY: spawn.y,
      impact: 0,
      webAnchor: null,
      webLen: 12,
      webShot: 1,
      flashAnchor: null,
      webFlash: 0,
      actionDown: false,
      actionTime: 0,
      startedGrounded: true,
      didJump: false,
      fireDown: false,
      charge: 0,
      throwCd: 0,
      pizzas: MAX_PIZZAS,
      score: 0,
      combo: 0,
      comboT: 0,
      bestCombo: 0,
      deliveries: 0,
      perfects: 0,
      misses: 0,
      heat: 0,
      overdrive: 0,
      lastSwing: -10,
      coyote: 0,
      airJumps: 1,
      wall: new Vector3(),
      stuck: 0,
      aimOrder: -1,
      sawFall: false,
      swingHold: 0,
      resupply: 0,
      wasEmpty: false,
      wish: new Vector3(),
    };
    rig.root.position.copy(r.pos);
    return r;
  }

  private makePizzas() {
    const side = new MeshStandardMaterial({ color: "#e0b888", roughness: 0.78 });
    const top = new MeshStandardMaterial({ map: this.assets.pizza, color: "#f3d7b0", roughness: 0.62 });
    for (let i = 0; i < 18; i++) {
      const mesh = new Mesh(new BoxGeometry(0.46, 0.07, 0.46), [side, side, top, side, side, side]);
      mesh.castShadow = true;
      const g = new Group();
      g.add(mesh);
      g.visible = false;
      this.scene.add(g);
      this.pizzas.push({
        active: false,
        pos: new Vector3(),
        vel: new Vector3(),
        owner: 0,
        life: 0,
        target: -1,
        fromAir: false,
        fromSwing: false,
        mesh: g,
        spin: 0,
      });
    }
  }

  private makeDecals() {
    for (let i = 0; i < 24; i++) {
      const mesh = new Mesh(
        new CircleGeometry(0.55, 14),
        new MeshBasicMaterial({
          map: this.assets.splash,
          transparent: true,
          depthWrite: false,
          color: "#ffb15a",
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.scene.add(mesh);
      this.decals.push({ mesh, life: 0 });
    }
  }

  private makeCrown() {
    const mat = new MeshStandardMaterial({ color: "#ffd56a", emissive: "#ffb020", emissiveIntensity: 0.6, metalness: 0.7, roughness: 0.28 });
    for (let i = 0; i < 5; i++) {
      const spike = new Mesh(new ConeGeometry(0.06, 0.22, 6), mat);
      const a = (i / 5) * Math.PI * 2;
      spike.position.set(Math.cos(a) * 0.16, 0.12, Math.sin(a) * 0.16);
      this.crown.add(spike);
    }
    const band = new Mesh(new TorusGeometry(0.16, 0.035, 6, 12), mat);
    band.rotation.x = Math.PI / 2;
    this.crown.add(band);
    this.crown.visible = false;
    this.scene.add(this.crown);
  }

  private resize = () => {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    const cap = this.quality === "performance" ? 1 : this.quality === "balanced" ? 1.25 : 1.5;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, cap));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
    this.composer?.setSize(w, h);
    this.fxaa?.setSize(w, h);
  };

  private loop = (t: number) => {
    if (this.dead) return;
    this.raf = requestAnimationFrame(this.loop);
    if (!this.ready) return;
    const dt = Math.min(0.033, (t - this.last) / 1000 || 0.016);
    this.last = t;
    this.update(dt);
    this.composer?.render();
    this.opts.onFrame?.(this.canvas);
    if (this.minimap) this.drawMini();
    this.push(false);
  };

  private update(dt: number) {
    this.time += dt;
    this.sinceLoad += dt;
    this.audio.tick();
    this.city.update(this.time, dt);

    if (this.phase === "menu") {
      this.bot.rig.root.visible = true;
      this.simulate(this.bot, dt);
      for (const p of this.players) if (p.joined) this.simulate(p, dt);
      this.updateOrders(dt);
      this.updatePizzas(dt);
    } else if (this.phase === "countdown") {
      const prev = Math.ceil(this.countdown);
      this.countdown -= dt;
      const next = Math.ceil(Math.max(0, this.countdown));
      if (next !== prev && next > 0) this.audio.beep(next === 1);
      if (this.countdown <= 0) {
        this.phase = "play";
        this.playTime = 0;
        this.audio.go();
        this.say("START", "Miasto jest głodne", 3);
        this.shake = 0.4;
      }
      for (const p of this.players) if (p.joined) this.pose(p, dt);
      this.updateOrders(dt);
    } else if (this.phase === "play") {
      this.playTime += dt;
      const prev = Math.ceil(this.timeLeft);
      this.timeLeft -= dt;
      if (this.timeLeft < 10 && Math.ceil(this.timeLeft) !== prev && this.timeLeft > 0) this.audio.tickTock();
      if (!this.saidLate && this.timeLeft <= 10) {
        this.saidLate = true;
        this.say("PIZZA STYGNIE", "Ostatnie sekundy zmiany", 3);
      }
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.finish();
      } else {
        for (const p of this.players) if (p.joined) this.simulate(p, dt);
        this.updateOrders(dt);
        this.updatePizzas(dt);
        this.hotCd -= dt;
        if (this.hotCd <= 0) {
          this.hotCd = 34;
          this.spawnOrder(1, true);
          this.say("GORĄCE ZAMÓWIENIE", "Krótki czas. Gruba kasa.", 3);
          this.audio.beep(true);
        }
        this.updateHint();
      }
    } else if (this.phase === "paused") {
      for (const p of this.players) if (p.joined) this.pose(p, dt * 0.35);
    } else if (this.phase === "results") {
      for (const p of this.players) if (p.joined) this.pose(p, dt);
      this.updatePizzas(dt);
    }

    this.particles.update(dt);
    this.updateFloaters(dt);
    this.updateDecals(dt);
    this.updateAmbience(dt);
    this.updateCrown();
    this.updateCamera(dt);
    if (this.annLife > 0) this.annLife -= dt;
  }

  private simulate(p: Runner, dt: number) {
    const input = p.ai ? this.thinkBot(p, dt) : this.readHuman(p);
    const wishX = p.ai ? p.wish.x : input.x;
    const wishZ = p.ai ? p.wish.z : -input.y;
    const action = input.action;
    const fire = input.fire;
    const wasAction = p.actionDown;
    const wasFire = p.fireDown;
    p.actionDown = action;
    p.fireDown = fire;

    if (action && !wasAction) {
      p.actionTime = 0;
      p.didJump = false;
      p.startedGrounded = p.grounded || p.coyote > 0;
    }
    if (action) {
      p.actionTime += dt;
      if (!p.webAnchor && p.actionTime > 0.13) {
        const anchor = this.findAnchor(p);
        if (anchor) this.attach(p, anchor);
        else if (!p.didJump && p.actionTime > 0.18 && p.actionTime < 0.26 && (p.grounded || p.coyote > 0)) {
          this.tryJump(p);
          p.didJump = true;
        }
      }
      if (p.webAnchor) {
        p.webLen = Math.max(4.2, p.webLen - REEL * dt * (p.overdrive > 0 ? 1.28 : 1));
        this.pump(p, wishX, wishZ, dt);
      }
    }
    if (!action && wasAction) {
      if (p.webAnchor) {
        const aerialTap = p.actionTime < 0.2 && !p.startedGrounded;
        if (aerialTap) {
          this.tmp.copy(p.webAnchor).sub(p.pos).normalize();
          p.vel.addScaledVector(this.tmp, 12);
        } else {
          p.vel.multiplyScalar(1.13);
          if (p.vel.length() > 10) p.vel.y += 1.5;
        }
        p.lastSwing = this.time;
        this.audio.whoosh(clamp(p.vel.length() / 22, 0.25, 1));
        p.webAnchor = null;
        p.heat = Math.min(100, p.heat + 3);
      } else if (p.actionTime < 0.16 && !p.didJump) {
        if (p.grounded || p.coyote > 0 || p.startedGrounded) this.tryJump(p);
        else this.zip(p);
      }
    }

    if (p.throwCd > 0) p.throwCd -= dt;
    if (fire && !wasFire && p.pizzas <= 0) {
      this.audio.empty();
      this.floater(p.pos, "PUSTY PLECAK", "Do furgonetki", "#ffb15a");
    }
    if (fire && p.pizzas > 0) p.charge = Math.min(1, p.charge + dt / 0.48);
    if (!fire && wasFire) {
      if (p.pizzas > 0 && p.throwCd <= 0) this.throwPizza(p, Math.max(0.4, p.charge));
      p.charge = 0;
    }
    if (!fire) p.charge = 0;

    p.aimOrder = this.pickAim(p);
    if (p.aimOrder >= 0 && (fire || p.charge > 0)) {
      const o = this.orders.find((ord) => ord.id === p.aimOrder);
      if (o) {
        this.tmp.set(o.pos.x - p.pos.x, 0, o.pos.z - p.pos.z);
        if (this.tmp.lengthSq() > 0.2) p.facing.copy(this.tmp.normalize());
      }
    }

    p.vel.y -= GRAV * dt;
    const moving = wishX * wishX + wishZ * wishZ > 0.02;
    const k = 1 - Math.exp(-(p.grounded ? 13 : 3.6) * dt);
    if (moving && !p.webAnchor) {
      p.vel.x += (wishX * SPEED - p.vel.x) * k;
      p.vel.z += (wishZ * SPEED - p.vel.z) * k;
      p.facing.set(wishX, 0, wishZ).normalize();
    } else if (moving && p.webAnchor) {
      p.facing.set(wishX, 0, wishZ).normalize();
    } else if (p.grounded && !p.webAnchor) {
      const f = Math.exp(-7.5 * dt);
      p.vel.x *= f;
      p.vel.z *= f;
    } else if (p.vel.x * p.vel.x + p.vel.z * p.vel.z > 1.2) {
      p.facing.set(p.vel.x, 0, p.vel.z).normalize();
    }

    const sp = p.vel.length();
    if (sp > 40) p.vel.multiplyScalar(40 / sp);
    p.impact = p.vel.y;
    p.prevY = p.pos.y;
    p.pos.addScaledVector(p.vel, dt);

    if (p.webAnchor) {
      p.webShot = Math.min(1, p.webShot + dt * 14);
      for (let i = 0; i < 3; i++) this.constrain(p);
    }
    const col = this.collide(p);
    if (p.webAnchor && col.hit) {
      const d = p.pos.distanceTo(p.webAnchor);
      if (d > p.webLen) p.webLen = Math.min(50, d);
    }
    if (p.grounded) {
      p.coyote = 0.12;
      p.airJumps = 1;
      if (p.impact < -9) {
        p.rig.landAnim = 0.16;
        this.particles.burst(p.pos.x, p.pos.y + 0.1, p.pos.z, 0xfff2e2, 8, 3, 0.35);
      }
    } else p.coyote = Math.max(0, p.coyote - dt);

    if (p.overdrive > 0) {
      p.overdrive -= dt;
      if (p.overdrive <= 0) {
        p.overdrive = 0;
        p.heat = 35;
      }
    } else p.heat = Math.max(0, p.heat - 4.5 * dt);
    if (p.comboT > 0) {
      p.comboT -= dt;
      if (p.comboT <= 0) p.combo = 0;
    }

    const nearTruck = p.pos.distanceTo(this.city.truck) < 5.15 && p.pos.y < 3.4;
    if (nearTruck && p.pizzas < MAX_PIZZAS) {
      p.resupply += dt;
      if (p.resupply > 0.26) {
        p.resupply = 0;
        p.pizzas++;
        this.audio.resupply();
        this.particles.burst(p.pos.x, p.pos.y + 1.2, p.pos.z, 0xffb15a, 4, 1.5, 0.3);
      }
    } else p.resupply = 0;
    if (p.pizzas === 0) p.wasEmpty = true;
    if (p.wasEmpty && p.pizzas >= MAX_PIZZAS) {
      p.wasEmpty = false;
      this.floater(p.pos, "PEŁNY PLECAK", "Można lecieć", p.def.color);
      if (!p.ai) this.opts.onFx?.(p.slot, "pickup");
    }

    if (p.pos.y < -8 || Math.abs(p.pos.x) > 70) this.respawn(p);
    if (!Number.isFinite(p.pos.x)) this.respawn(p);
    if (p.ai) {
      const slow = Math.hypot(p.vel.x, p.vel.z) < 0.4 && p.grounded && !p.webAnchor;
      p.stuck = slow ? p.stuck + dt : 0;
      if (p.stuck > 2.8) this.respawn(p);
    }

    const speed = Math.hypot(p.vel.x, p.vel.z);
    if (speed > 15 && Math.random() < dt * 18) {
      this.particles.spawn(p.pos.x, p.pos.y + 0.8, p.pos.z, -p.vel.x * 0.05, 0.4, -p.vel.z * 0.05, parseInt(p.def.color.slice(1), 16), 0.35, 12);
    }
    this.pose(p, dt);
    this.drawWeb(p, dt);
    this.drawAim(p);
    this.drawArrow(p);
  }

  private pose(p: Runner, dt: number) {
    p.rig.root.position.copy(p.pos);
    p.rig.root.visible = p.ai ? this.phase === "menu" : p.joined && this.phase !== "loading";
    updateCourier(p.rig, {
      grounded: p.grounded,
      vel: p.vel,
      facing: p.facing,
      swinging: !!p.webAnchor,
      charging: p.fireDown && p.pizzas > 0,
      speed: Math.hypot(p.vel.x, p.vel.z),
      dt,
      overdrive: p.overdrive > 0,
      pizzas: p.pizzas,
      time: this.time,
    });
    updateScarf(p.rig, dt, p.vel, p.webAnchor);
    updateChain(p.scarfRib, p.rig.scarf, 0.07, p.rig.color);
    p.scarfRib.mesh.visible = p.rig.root.visible;
    p.rig.light.visible = false;
    if (p.pizzas > 0 && p.rig.throwAnim <= 0) {
      p.rig.pizzaHand.visible = true;
      this.tmp.copy(p.rig.hand);
      p.rig.visual.worldToLocal(this.tmp);
      p.rig.pizzaHand.position.copy(this.tmp);
    } else p.rig.pizzaHand.visible = false;
  }

  private readHuman(p: Runner) {
    const sample = this.opts.readInput(p.slot);
    return {
      x: clamp(sample.x, -1, 1),
      y: clamp(sample.y, -1, 1),
      action: sample.action,
      fire: sample.fire || (sample.assist && this.autoFire(p)),
    };
  }

  private thinkBot(p: Runner, dt: number) {
    let tx = Math.sin(this.time * 0.18) * 14;
    let tz = -4 + Math.cos(this.time * 0.15) * 8;
    if (p.pizzas <= 1) {
      tx = this.city.truck.x;
      tz = this.city.truck.z + 2;
    } else if (this.orders.length) {
      let best = this.orders[0];
      let bd = Infinity;
      for (const o of this.orders) {
        const d = Math.hypot(o.pos.x - p.pos.x, o.pos.z - p.pos.z) + Math.abs(o.pos.y - p.pos.y) * 0.35;
        if (d < bd) {
          bd = d;
          best = o;
        }
      }
      tx = best.pos.x;
      tz = best.pos.z;
      p.aimOrder = best.id;
    }
    const dx = tx - p.pos.x;
    const dz = tz - p.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    p.wish.set(dx / dist, 0, dz / dist);
    const speed = Math.hypot(p.vel.x, p.vel.z);
    let action = false;
    if (p.webAnchor) {
      p.swingHold += dt;
      if (p.vel.y < -0.5) p.sawFall = true;
      const release = (p.sawFall && p.vel.y > 1.4 && p.swingHold > 0.48) || p.swingHold > 1.35 || p.pos.y > 26;
      action = !release;
      if (release) {
        p.swingHold = 0;
        p.sawFall = false;
      }
    } else if (speed < 8.5 || p.pos.y < 4 || dist > 12) {
      action = p.pizzas > 1 || dist > 6;
    }
    let fire = false;
    if (p.pizzas > 0 && p.throwCd <= 0 && this.orders.length && p.pos.y > 2) {
      const o = this.orders.find((ord) => ord.id === p.aimOrder) ?? this.orders[0];
      const d = p.pos.distanceTo(o.pos);
      if (d < 30) {
        fire = p.charge < 0.52;
      }
    }
    return { x: p.wish.x, y: -p.wish.z, action, fire };
  }

  private tryJump(p: Runner) {
    if (p.grounded || p.coyote > 0) {
      p.vel.y = JUMP;
      p.grounded = false;
      p.coyote = 0;
      p.airJumps = 1;
      this.audio.jump();
      return;
    }
    if (p.wall.lengthSq() > 0.2) {
      p.vel.x = p.wall.x * 9.2;
      p.vel.z = p.wall.z * 9.2;
      p.vel.y = 9.1;
      p.wall.set(0, 0, 0);
      this.audio.jump();
      return;
    }
    if (p.airJumps > 0) {
      p.vel.y = JUMP * 0.92;
      p.airJumps--;
      this.audio.jump();
    }
  }

  private attach(p: Runner, anchor: Vector3) {
    p.webAnchor = anchor.clone();
    p.webLen = Math.min(42, Math.max(4.5, p.pos.distanceTo(anchor)));
    p.webShot = 0;
    this.tmp.copy(anchor).sub(p.pos).normalize();
    p.vel.addScaledVector(this.tmp, 4);
    this.audio.thwip();
  }

  private zip(p: Runner) {
    const anchor = this.findAnchor(p);
    if (!anchor) {
      this.tryJump(p);
      return;
    }
    this.tmp.copy(anchor).sub(p.pos).normalize();
    p.vel.addScaledVector(this.tmp, 26);
    p.vel.y += 3.2;
    p.flashAnchor = anchor.clone();
    p.webFlash = 0.34;
    p.webShot = 0;
    this.audio.thwip();
    this.audio.whoosh(0.7);
  }

  private pump(p: Runner, wishX: number, wishZ: number, dt: number) {
    if (!p.webAnchor) return;
    const ax = p.webAnchor.x - p.pos.x;
    const ay = p.webAnchor.y - p.pos.y;
    const az = p.webAnchor.z - p.pos.z;
    const dist = Math.hypot(ax, ay, az) || 1;
    const rx = ax / dist;
    const rz = az / dist;
    const along = wishX * rx + wishZ * rz;
    p.vel.x += (wishX - rx * along) * 17 * dt;
    p.vel.z += (wishZ - rz * along) * 17 * dt;
    const fa = p.facing.x * rx + p.facing.z * rz;
    p.vel.x += (p.facing.x - rx * fa) * 11 * dt;
    p.vel.z += (p.facing.z - rz * fa) * 11 * dt;
    if (Math.random() < dt * 10) {
      this.particles.spawn(p.rig.hand.x, p.rig.hand.y, p.rig.hand.z, 0, 0.2, 0, 0xffffff, 0.25, 8);
    }
  }

  private constrain(p: Runner) {
    if (!p.webAnchor) return;
    const dx = p.pos.x - p.webAnchor.x;
    const dy = p.pos.y - p.webAnchor.y;
    const dz = p.pos.z - p.webAnchor.z;
    const dist = Math.hypot(dx, dy, dz);
    if (dist > p.webLen && dist > 0.001) {
      const nx = dx / dist;
      const ny = dy / dist;
      const nz = dz / dist;
      p.pos.set(p.webAnchor.x + nx * p.webLen, p.webAnchor.y + ny * p.webLen, p.webAnchor.z + nz * p.webLen);
      const vn = p.vel.x * nx + p.vel.y * ny + p.vel.z * nz;
      if (vn > 0) {
        p.vel.x -= nx * vn;
        p.vel.y -= ny * vn;
        p.vel.z -= nz * vn;
      }
    }
  }

  private findAnchor(p: Runner) {
    const oy = p.pos.y + 1.45;
    let fx = p.facing.x;
    let fz = p.facing.z;
    const sp = Math.hypot(p.vel.x, p.vel.z);
    if (sp > 6) {
      fx = fx * 0.3 + (p.vel.x / sp) * 0.7;
      fz = fz * 0.3 + (p.vel.z / sp) * 0.7;
    }
    const fl = Math.hypot(fx, fz) || 1;
    fx /= fl;
    fz /= fl;
    const dl = Math.hypot(fx, 0.78, fz);
    const ux = fx / dl;
    const uy = 0.78 / dl;
    const uz = fz / dl;
    let best: Vector3 | null = null;
    let bestScore = 0.1;
    for (const a of this.city.anchors) {
      const ax = a.x - p.pos.x;
      const ay = a.y - oy;
      const az = a.z - p.pos.z;
      const dist = Math.hypot(ax, ay, az);
      if (dist < 5.2 || dist > WEB_RANGE) continue;
      const inv = 1 / dist;
      const nx = ax * inv;
      const ny = ay * inv;
      const nz = az * inv;
      if (ny < -0.12) continue;
      const align = nx * ux + ny * uy + nz * uz;
      if (align < 0) continue;
      const distScore = 1 - Math.abs(dist - 21) / 32;
      const score = align * 2.6 + distScore * 0.75 + ny * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
    return best;
  }

  private collide(p: Runner) {
    let grounded = false;
    let hit = false;
    p.wall.set(0, 0, 0);
    const radius = 0.42;
    for (const b of this.city.buildings) {
      const cx = clamp(p.pos.x, b.minX, b.maxX);
      const cz = clamp(p.pos.z, b.minZ, b.maxZ);
      const dx = p.pos.x - cx;
      const dz = p.pos.z - cz;
      const dist = Math.hypot(dx, dz);
      if (dist >= radius) continue;
      if (p.prevY >= b.maxY - 0.12 && p.pos.y <= b.maxY + 0.35 && p.impact <= 6) {
        p.pos.y = b.maxY;
        if (p.vel.y < 0) p.vel.y = 0;
        grounded = true;
        continue;
      }
      if (p.pos.y < b.maxY - 0.08 && p.pos.y + 1.65 > b.minY) {
        hit = true;
        if (dist > 0.001) {
          const nx = dx / dist;
          const nz = dz / dist;
          const push = radius - dist;
          p.pos.x += nx * push;
          p.pos.z += nz * push;
          const vn = p.vel.x * nx + p.vel.z * nz;
          if (vn < 0) {
            p.vel.x -= nx * vn;
            p.vel.z -= nz * vn;
          }
          p.wall.set(nx, 0, nz);
        } else {
          const left = p.pos.x - b.minX;
          const right = b.maxX - p.pos.x;
          const back = p.pos.z - b.minZ;
          const front = b.maxZ - p.pos.z;
          const m = Math.min(left, right, back, front);
          if (m === left) {
            p.pos.x = b.minX - radius;
            p.wall.set(-1, 0, 0);
          } else if (m === right) {
            p.pos.x = b.maxX + radius;
            p.wall.set(1, 0, 0);
          } else if (m === back) {
            p.pos.z = b.minZ - radius;
            p.wall.set(0, 0, -1);
          } else {
            p.pos.z = b.maxZ + radius;
            p.wall.set(0, 0, 1);
          }
          if (p.vel.x * p.wall.x < 0) p.vel.x = 0;
          if (p.vel.z * p.wall.z < 0) p.vel.z = 0;
        }
      }
    }
    if (p.pos.y <= 0) {
      p.pos.y = 0;
      if (p.vel.y < 0) p.vel.y = 0;
      grounded = true;
    }
    p.pos.x = clamp(p.pos.x, -56, 56);
    p.pos.z = clamp(p.pos.z, -44, 36);
    p.grounded = grounded;
    return { grounded, hit };
  }

  private respawn(p: Runner) {
    p.pos.copy(p.spawn);
    p.pos.y = 0.2;
    p.vel.set(0, 0, 0);
    p.webAnchor = null;
    p.stuck = 0;
    if (!p.ai && this.phase === "play") {
      this.floater(p.pos, "POWRÓT DO BAZY", "", p.def.color);
      this.opts.onFx?.(p.slot, "dead");
    }
  }

  private throwPizza(p: Runner, charge: number) {
    const pizza = this.pizzas.find((z) => !z.active);
    if (!pizza) return;
    const speed = 17 + charge * 18;
    const dir = this.aimVector(p, speed);
    pizza.active = true;
    pizza.pos.copy(p.rig.hand);
    pizza.vel.copy(dir).multiplyScalar(speed);
    pizza.owner = p.slot;
    pizza.life = 4;
    pizza.target = p.aimOrder;
    pizza.fromAir = !p.grounded;
    pizza.fromSwing = !!p.webAnchor || this.time - p.lastSwing < 0.75;
    pizza.spin = 8 + Math.random() * 6;
    pizza.mesh.visible = true;
    pizza.mesh.position.copy(pizza.pos);
    p.rig.throwAnim = 0.28;
    p.pizzas--;
    p.throwCd = 0.28;
    p.charge = 0;
    this.audio.throw();
    if (!p.ai) this.opts.onFx?.(p.slot, "fire");
  }

  private aimVector(p: Runner, speed: number) {
    const from = p.rig.hand;
    const order = this.orders.find((o) => o.id === p.aimOrder);
    if (order) {
      const to = this.tmp2.copy(order.pos);
      if (order.kind !== "roof") to.y += 1.2;
      return this.aimDir.copy(ballistic(from, to, speed, PIZZA_GRAV));
    }
    return this.aimDir.set(p.facing.x, 0.38 + p.charge * 0.32, p.facing.z).normalize();
  }

  private pickAim(p: Runner) {
    let best = -1;
    let bestScore = -999;
    for (const order of this.orders) {
      const dx = order.pos.x - p.pos.x;
      const dz = order.pos.z - p.pos.z;
      const dist = Math.hypot(dx, order.pos.y - p.pos.y, dz);
      if (dist < 2 || dist > 40) continue;
      const align = (dx * p.facing.x + dz * p.facing.z) / (Math.hypot(dx, dz) || 1);
      if (align < 0.42) continue;
      const score = align * 3 - dist / 48 + (order.rush ? 0.25 : 0) + (order.hot ? 0.4 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = order.id;
      }
    }
    return best;
  }

  private updatePizzas(dt: number) {
    for (const pizza of this.pizzas) {
      if (!pizza.active) continue;
      pizza.life -= dt;
      pizza.vel.y -= PIZZA_GRAV * dt;
      const target = this.orders.find((o) => o.id === pizza.target);
      if (target) {
        this.tmp.copy(target.pos).sub(pizza.pos);
        if (target.kind !== "roof") this.tmp.y += 2.2;
        if (this.tmp.length() > 0.3) {
          this.tmp.normalize();
          this.tmp2.copy(pizza.vel).normalize().lerp(this.tmp, Math.min(0.55, 2.4 * dt));
          const sp = Math.max(8, pizza.vel.length());
          pizza.vel.copy(this.tmp2).multiplyScalar(sp);
        }
      }
      pizza.pos.addScaledVector(pizza.vel, dt);
      pizza.spin += dt * 14;
      pizza.mesh.position.copy(pizza.pos);
      pizza.mesh.rotation.set(pizza.spin, pizza.spin * 0.6, 0);
      if (Math.random() < 0.7) {
        this.particles.spawn(pizza.pos.x, pizza.pos.y, pizza.pos.z, 0, 0.2, 0, 0xffd7a8, 0.28, 9);
      }
      const owner = this.bySlot(pizza.owner);
      for (const order of this.orders) {
        if (this.hitsOrder(pizza.pos, order)) {
          this.deliver(pizza, order, owner);
          pizza.active = false;
          pizza.mesh.visible = false;
          break;
        }
      }
      if (!pizza.active) continue;
      if (pizza.pos.y < 0.18) {
        this.miss(pizza, owner, new Vector3(pizza.pos.x, 0.05, pizza.pos.z), new Vector3(0, 1, 0));
        continue;
      }
      const hit = this.pizzaBox(pizza.pos, 0.28);
      if (hit) {
        let saved = false;
        for (const order of this.orders) {
          if (pizza.pos.distanceTo(order.pos) < order.radius + 1.4) {
            this.deliver(pizza, order, owner);
            saved = true;
            break;
          }
        }
        if (!saved) this.miss(pizza, owner, pizza.pos.clone(), hit);
        pizza.active = false;
        pizza.mesh.visible = false;
      } else if (pizza.life <= 0) {
        pizza.active = false;
        pizza.mesh.visible = false;
      }
    }
  }

  private hitsOrder(pos: Vector3, o: Order) {
    const dx = pos.x - o.pos.x;
    const dy = pos.y - o.pos.y;
    const dz = pos.z - o.pos.z;
    if (o.kind === "roof") return dx * dx + dy * dy + dz * dz < o.radius * o.radius;
    return Math.hypot(dx, dz) < o.radius && dy > -1.3 && dy < 15.5;
  }

  private deliver(pizza: Pizza, order: Order, owner: Runner | undefined) {
    const perfect = pizza.pos.distanceTo(order.pos) < (order.kind === "door" ? 1.15 : 0.9);
    if (owner) {
      if (owner.comboT > 0) owner.combo++;
      else owner.combo = 1;
      owner.comboT = 6.4;
      owner.bestCombo = Math.max(owner.bestCombo, owner.combo);
      owner.deliveries++;
      if (perfect) owner.perfects++;
      let pts = order.value + Math.round((order.time / order.ttl) * 90);
      if (perfect) pts += 75;
      if (pizza.fromAir) pts += 45;
      if (pizza.fromSwing) pts += 60;
      if (order.hot) pts += 80;
      const mul = (1 + Math.min(owner.combo - 1, 12) * 0.12) * (owner.overdrive > 0 ? 1.5 : 1);
      pts = Math.round(pts * mul);
      if (this.phase === "play" && !owner.ai) owner.score += pts;
      owner.heat = Math.min(100, owner.heat + (perfect ? 18 : 9) + (pizza.fromSwing ? 6 : 0));
      if (owner.heat >= 100 && owner.overdrive <= 0 && !owner.ai) {
        owner.overdrive = 8;
        this.say("ROZGRZANIE", this.loc("{name} wchodzi w strefę").replace("{name}", owner.def.name), 2);
      }
      const tags: string[] = [];
      if (perfect) tags.push("PERFEKT");
      if (pizza.fromSwing) tags.push("SIEĆ");
      else if (pizza.fromAir) tags.push("LOT");
      if (order.rush) tags.push("RUSH");
      if (order.hot) tags.push("VIP");
      if (owner.combo >= 2) tags.push("x" + owner.combo);
      this.floater(order.pos, owner.ai ? "TRENING" : "+" + pts, tags.map((tag) => this.loc(tag)).join(" · "), owner.def.color);
      if (!owner.ai && owner.combo === 5) this.say("SERIA x5", owner.def.full, 2);
      else if (!owner.ai && owner.combo === 8) this.say("SERIA x8", "Piec nie nadąża", 2);
      else if (!owner.ai && perfect) this.say("PERFEKT", owner.def.name, 1);
      if (!owner.ai) this.reward(owner, pts, perfect, order.hot);
      owner.rig.flourish = 0.32;
      this.shake = Math.min(1, this.shake + (perfect ? 0.4 : 0.12));
    }
    this.audio.deliver(perfect);
    this.particles.burst(order.pos.x, order.pos.y + 1, order.pos.z, 0xffd56a, 16, 5, 0.6);
    this.particles.burst(order.pos.x, order.pos.y + 0.6, order.pos.z, 0xff5a3c, 10, 3.5, 0.5);
    this.paint(order.pos, order.normal, "#ffb15a");
    this.removeOrder(order);
  }

  private miss(pizza: Pizza, owner: Runner | undefined, point: Vector3, normal: Vector3) {
    pizza.active = false;
    pizza.mesh.visible = false;
    this.audio.splat();
    this.paint(point, normal, "#e2572a");
    this.particles.burst(point.x, point.y + 0.2, point.z, 0xff7a3c, 8, 2.4, 0.4);
    if (owner && !owner.ai) {
      owner.misses++;
      owner.heat = Math.max(0, owner.heat - 10);
      if (owner.combo >= 3) this.floater(point, "SERIA PRZERWANA", "", "#ff8d8d");
      owner.combo = 0;
      owner.comboT = 0;
    }
  }

  private pizzaBox(pos: Vector3, r: number): Vector3 | null {
    for (const b of this.city.buildings) {
      const cx = clamp(pos.x, b.minX, b.maxX);
      const cy = clamp(pos.y, b.minY, b.maxY);
      const cz = clamp(pos.z, b.minZ, b.maxZ);
      const dx = pos.x - cx;
      const dy = pos.y - cy;
      const dz = pos.z - cz;
      if (dx * dx + dy * dy + dz * dz > r * r) continue;
      return faceNormal(pos, b);
    }
    return null;
  }

  private paint(pos: Vector3, normal: Vector3, color: string) {
    const d = this.decals[this.decalI];
    this.decalI = (this.decalI + 1) % this.decals.length;
    d.life = 9;
    d.mesh.visible = true;
    d.mesh.position.copy(pos).addScaledVector(normal, 0.06);
    d.mesh.lookAt(this.tmp.copy(pos).add(normal));
    const mat = d.mesh.material as MeshBasicMaterial;
    mat.color.set(color);
    mat.opacity = 0.85;
  }

  private updateOrders(dt: number) {
    const want = this.phase === "play"
      ? Math.min(10, 5 + Math.max(0, this.humanCount() - 1) + (this.timeLeft < 28 ? 2 : 0))
      : 6;
    this.spawnCd -= dt;
    if (this.orders.length < want && this.spawnCd <= 0) {
      this.spawnOrder(this.phase === "play" && this.timeLeft < 40 ? 0.4 : 0.22);
      this.spawnCd = 0.45;
    }
    for (let i = this.orders.length - 1; i >= 0; i--) {
      const o = this.orders[i];
      o.time -= dt;
      const k = clamp(o.time / o.ttl, 0, 1);
      const pulse = 0.5 + Math.sin(this.time * (o.rush ? 9 : 4.5) + o.id) * 0.5;
      const mat = o.pillar.material as MeshBasicMaterial;
      mat.opacity = 0.1 + pulse * 0.12 + (1 - k) * 0.08;
      o.pillar.scale.set(1 + (1 - k) * 0.25, 0.65 + k * 0.4, 1 + (1 - k) * 0.25);
      o.ring.rotation.z += dt * (1.5 + (1 - k) * 3);
      const ringMat = o.ring.material as MeshBasicMaterial;
      if (k < 0.28) ringMat.color.set("#ff4d4d");
      else if (o.hot) ringMat.color.set("#ff4f9a");
      else if (o.rush) ringMat.color.set("#ffd36a");
      const locked = this.players.some((p) => p.joined && p.aimOrder === o.id) || this.bot.aimOrder === o.id;
      o.ring.scale.setScalar(locked ? 1.35 : 1);
      if (o.arm) o.arm.rotation.x = Math.sin(this.time * 4 + o.id) * 0.55 - 0.4;
      o.icon.position.y = (o.kind === "roof" ? 3.3 : 8.2) + Math.sin(this.time * 2 + o.id) * 0.15;
      if (o.time <= 0) {
        if (this.phase === "play") this.floater(o.pos, "STYGNIE", "", "#ffb0a0");
        this.removeOrder(o);
      }
    }
  }

  private spawnOrder(rushChance = 0.22, forceHot = false, easy = false) {
    if (!this.city) return;
    const used = new Set(this.orders.map((o) => o.slot));
    const free: number[] = [];
    this.city.slots.forEach((_, i) => {
      if (!used.has(i)) free.push(i);
    });
    if (!free.length) return;
    let idx = free[Math.floor(Math.random() * free.length)];
    if (easy) {
      const ranked = free
        .map((i) => {
          const s = this.city.slots[i];
          const visible = s.normal.z > 0.4 && s.position.y > 3.5 && s.position.y < 16;
          const d = Math.hypot(s.position.x, s.position.z - 2);
          return { i, score: (visible ? 0 : 50) + d * 0.15 + Math.abs(s.position.y - 8) * 0.2 };
        })
        .sort((a, b) => a.score - b.score);
      idx = ranked[0].i;
    }
    const slot = this.city.slots[idx];
    const rush = forceHot || Math.random() < rushChance;
    const ttl = (slot.kind === "door" ? 30 : slot.kind === "roof" ? 26 : 23) * (rush ? 0.6 : 1) * (forceHot ? 0.7 : 1);
    const value = Math.round(slot.value * (rush ? 1.7 : 1) * (forceHot ? 1.45 : 1));
    const order = this.makeOrder(idx, slot, value, ttl, rush, forceHot);
    this.orders.push(order);
    this.scene.add(order.group);
  }

  private makeOrder(slotIndex: number, slot: OrderSlot, value: number, ttl: number, rush: boolean, hot: boolean): Order {
    const group = new Group();
    group.position.copy(slot.position);
    const color = hot ? "#ff4f9a" : rush ? "#ffd36a" : slot.kind === "roof" ? "#ff8ad8" : slot.kind === "door" ? "#ffb15a" : "#8ef6ff";
    const height = slot.kind === "roof" ? 6.5 : 14;
    const pillar = new Mesh(
      new CylinderGeometry(0.11, 0.32, height, 10, 1, true),
      new MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        blending: AdditiveBlending,
        side: DoubleSide,
      }),
    );
    pillar.position.y = height / 2;
    group.add(pillar);
    const ring = new Mesh(
      new TorusGeometry(slot.kind === "door" ? 1.15 : 0.85, 0.045, 8, 24),
      new MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    group.add(ring);
    const icon = new Sprite(new SpriteMaterial({ map: this.assets.emblem, color, transparent: true, depthTest: false }));
    icon.scale.set(1.35, 1.35, 1);
    icon.position.y = slot.kind === "roof" ? 3.3 : 8.2;
    icon.renderOrder = 12;
    group.add(icon);
    const customer = makeCustomer(slot.kind);
    if (slot.kind !== "roof") customer.rotation.y = Math.atan2(slot.normal.x, slot.normal.z);
    group.add(customer);
    return {
      id: this.orderSeq++,
      slot: slotIndex,
      pos: slot.position.clone(),
      normal: slot.normal.clone(),
      kind: slot.kind,
      value,
      radius: slot.radius,
      ttl,
      time: ttl,
      rush,
      hot,
      group,
      pillar,
      ring,
      icon,
      arm: (customer.userData.arm as Group) ?? null,
    };
  }

  private removeOrder(order: Order) {
    this.scene.remove(order.group);
    order.group.traverse((obj) => {
      const mesh = obj as Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as Material | Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
    this.orders = this.orders.filter((o) => o !== order);
  }

  private clearOrders() {
    for (const o of [...this.orders]) this.removeOrder(o);
  }

  private clearPizzas() {
    for (const p of this.pizzas) {
      p.active = false;
      p.mesh.visible = false;
    }
  }

  private drawWeb(p: Runner, dt: number) {
    if (p.webFlash > 0 && p.flashAnchor) {
      p.webFlash -= dt;
      p.webShot = Math.min(1, p.webShot + dt * 8);
      updateRibbon(p.webRib, p.rig.hand, p.flashAnchor, p.webShot, this.time, 0.07, p.rig.color, p.webFlash / 0.34);
      return;
    }
    if (p.webAnchor && p.rig.root.visible) {
      updateRibbon(p.webRib, p.rig.hand, p.webAnchor, Math.max(0.05, p.webShot), this.time, p.overdrive > 0 ? 0.11 : 0.075, p.rig.color, 1);
    } else p.webRib.mesh.visible = false;
  }

  private drawAim(p: Runner) {
    if (!p.dots.length) return;
    const show = p.fireDown && p.pizzas > 0 && p.rig.root.visible && (this.phase === "play" || this.phase === "menu");
    if (!show) {
      for (const d of p.dots) d.visible = false;
      return;
    }
    const speed = 17 + Math.max(0.4, p.charge) * 18;
    const dir = this.aimVector(p, speed);
    const pos = this.tmp3.copy(p.rig.hand);
    const vel = this.fly.copy(dir).multiplyScalar(speed);
    const target = this.orders.find((o) => o.id === p.aimOrder);
    for (let i = 0; i < p.dots.length; i++) {
      vel.y -= PIZZA_GRAV * 0.07;
      if (target) {
        this.tmp.copy(target.pos).sub(pos);
        if (target.kind !== "roof") this.tmp.y += 2;
        if (this.tmp.lengthSq() > 0.05) {
          this.tmp.normalize();
          this.tmp2.copy(vel).normalize().lerp(this.tmp, 0.14);
          vel.copy(this.tmp2.multiplyScalar(Math.max(8, vel.length())));
        }
      }
      pos.addScaledVector(vel, 0.07);
      p.dots[i].visible = true;
      p.dots[i].position.copy(pos);
      (p.dots[i].material as MeshBasicMaterial).opacity = 0.9 - i * 0.07;
    }
  }

  private drawArrow(p: Runner) {
    const arrow = p.rig.arrow;
    if (!p.rig.root.visible || p.ai) {
      arrow.visible = false;
      return;
    }
    let target: Vector3 | null = null;
    if (p.pizzas === 0) target = this.city.truck;
    else if (this.phase === "play" && this.playTime < 18 && this.humanCount() === 1 && p.deliveries < 1 && this.orders[0]) {
      target = this.orders[0].pos;
    }
    if (!target) {
      arrow.visible = false;
      return;
    }
    arrow.visible = true;
    const dx = target.x - p.pos.x;
    const dz = target.z - p.pos.z;
    arrow.rotation.set(0.85, Math.atan2(dx, dz), 0);
    arrow.position.y = 2.35 + Math.sin(this.time * 5) * 0.12;
  }

  private updateFloaters(dt: number) {
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      f.sprite.position.y += dt * 1.15;
      const mat = f.sprite.material as SpriteMaterial;
      mat.opacity = clamp(f.life / f.max, 0, 1);
      const pop = clamp((f.max - f.life) / 0.12, 0, 1);
      f.sprite.scale.set(3.3 * (0.72 + 0.28 * pop), 1.65 * (0.72 + 0.28 * pop), 1);
      if (f.life <= 0) {
        this.scene.remove(f.sprite);
        mat.map?.dispose();
        mat.dispose();
        this.floaters.splice(i, 1);
      }
    }
  }

  private floater(pos: Vector3, text: string, sub: string, color: string) {
    const sprite = makeFloaterSprite(this.loc(text), this.loc(sub), color);
    sprite.position.copy(pos);
    sprite.position.y += 1.6;
    this.scene.add(sprite);
    this.floaters.push({ sprite, life: 1.15, max: 1.15 });
  }

  private updateDecals(dt: number) {
    for (const d of this.decals) {
      if (d.life <= 0) continue;
      d.life -= dt;
      const mat = d.mesh.material as MeshBasicMaterial;
      mat.opacity = clamp(d.life / 2.2, 0, 0.85);
      if (d.life <= 0) d.mesh.visible = false;
    }
  }

  private updateAmbience(dt: number) {
    if (Math.random() < dt * 8) {
      const t = this.city.truck;
      this.particles.spawn(t.x + (Math.random() - 0.5), 2.3, t.z + 0.2, (Math.random() - 0.5) * 0.3, 1.1, (Math.random() - 0.5) * 0.3, 0xfff4e8, 0.9, 12);
    }
    if (Math.random() < dt * 10) {
      const f = this.city.fountain;
      this.particles.spawn(f.x + (Math.random() - 0.5) * 0.3, 1.4, f.z, (Math.random() - 0.5) * 0.4, 2.2, (Math.random() - 0.5) * 0.4, 0xc8f4ff, 0.7, 8);
    }
  }

  private updateCrown() {
    const joined = this.players.filter((p) => p.joined);
    const leader = joined.slice().sort((a, b) => b.score - a.score)[0];
    if (leader && leader.score > 0 && (this.phase === "play" || this.phase === "results")) {
      this.crown.visible = true;
      this.crown.position.set(leader.pos.x, leader.pos.y + 2.28, leader.pos.z);
      this.crown.rotation.y += 0.02;
    } else this.crown.visible = false;
  }

  private updateCamera(dt: number) {
    const humans = this.players.filter((p) => p.joined);
    if (this.phase === "menu" && humans.length === 0) {
      const u = clamp(this.sinceLoad / 6.2, 0, 1);
      const e = u * u * (3 - 2 * u);
      const sway = Math.sin(this.time * 0.17) * 3;
      this.tmp.set(lerp(12, 7 + sway, e), lerp(2.2, 19.5, e), lerp(18, 44, e));
      this.tmp2.set(0, lerp(2.5, 9, e), lerp(-4, -10, e));
    } else if (this.phase === "results") {
      const focus = this.focus();
      const ang = this.time * 0.13;
      this.tmp.set(focus.x + Math.sin(ang) * 26, focus.y + 13, focus.z + Math.cos(ang) * 24);
      this.tmp2.copy(focus);
      this.tmp2.y += 2.5;
    } else {
      const focus = this.focus();
      let spread = 7;
      const group = this.phase === "menu" ? [...humans, this.bot] : humans;
      let vx = 0;
      let vz = 0;
      for (const p of group) {
        spread = Math.max(spread, Math.hypot(p.pos.x - focus.x, p.pos.z - focus.z, (p.pos.y - focus.y) * 0.5));
        vx += p.vel.x;
        vz += p.vel.z;
      }
      const n = Math.max(1, group.length);
      const dist = clamp(15.5 + spread * 1.05, 15.5, 52);
      this.tmp2.set(focus.x + (vx / n) * 0.28, focus.y + 2.4, focus.z + (vz / n) * 0.28);
      this.tmp.set(this.tmp2.x + dist * 0.08, this.tmp2.y + dist * 0.7 + 2, this.tmp2.z + dist * 1.08);
      this.tmp.x += (Math.random() - 0.5) * this.shake * 0.7;
      this.tmp.y += (Math.random() - 0.5) * this.shake * 0.45;
    }
    this.camPos.lerp(this.tmp, 1 - Math.exp(-2.7 * dt));
    this.camLook.lerp(this.tmp2, 1 - Math.exp(-3.1 * dt));
    this.pullCamera();
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);
    const fast = Math.max(0, ...this.players.map((p) => Math.hypot(p.vel.x, p.vel.z)));
    this.camera.fov = damp(this.camera.fov, 50 + clamp(fast / 32, 0, 1) * 8, 3.5, dt);
    this.camera.updateProjectionMatrix();
    this.shake *= Math.exp(-3.2 * dt);
  }

  private pullCamera() {
    const ox = this.camLook.x;
    const oy = this.camLook.y;
    const oz = this.camLook.z;
    const dx = this.camPos.x - ox;
    const dy = this.camPos.y - oy;
    const dz = this.camPos.z - oz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1) return;
    const inv = 1 / len;
    let best = len;
    for (const b of this.city.buildings) {
      const t = rayBox(ox, oy, oz, dx * inv, dy * inv, dz * inv, b, len);
      if (t !== null && t < best) best = t;
    }
    if (best < len - 0.4) {
      const t = Math.max(3.2, best - 0.7);
      this.camPos.set(ox + dx * inv * t, oy + dy * inv * t, oz + dz * inv * t);
    }
  }

  private focus() {
    const list = this.players.filter((p) => p.joined);
    if (!list.length) return this.focusV.set(0, 4, 0);
    this.focusV.set(0, 0, 0);
    for (const p of list) this.focusV.add(p.pos);
    return this.focusV.multiplyScalar(1 / list.length);
  }

  private updateHint() {
    const n = this.humanCount();
    let hint = "";
    if (n <= 1) {
      if (this.playTime < 7) hint = "Przytrzymaj AKCJĘ — sieć. Puść w dole łuku.";
      else if (this.playTime < 15) hint = "Leć na słup światła — kurier rzuci pizzę sam.";
      else if (this.playTime < 23) hint = "Pusty plecak uzupełnisz przy furgonetce. Wyżej = więcej punktów.";
    } else if (this.playTime < 9) {
      hint = "Kto pierwszy trafi w światło, ten ma punkty.";
    }
    hint = this.loc(hint);
    if (hint !== this.hint) {
      this.hint = hint;
      this.push(true);
    }
  }

  private finish() {
    if (this.phase === "results") return;
    this.phase = "results";
    const joined = this.players.filter((p) => p.joined);
    const total = joined.reduce((s, p) => s + p.score, 0);
    const n = Math.max(1, joined.length);
    const rated = rate(total, n);
    this.stars = rated.stars;
    this.grade = rated.grade;
    const mvp = joined.slice().sort((a, b) => b.score - a.score)[0];
    this.mvp = mvp?.slot ?? 0;
    this.audio.fanfare();
    this.say("KONIEC ZMIANY", GRADE_LINES[this.grade] ?? "", 3);
    for (let i = 0; i < 5; i++) {
      this.particles.burst((Math.random() - 0.5) * 16, 6 + Math.random() * 6, 4 + Math.random() * 6, i % 2 ? 0xffd56a : 0xff5a3c, 18, 6, 1.1);
    }
    this.push(true);
  }

  private say(text: string, sub: string, priority: number) {
    if (priority < this.annP && this.annLife > 0.45) return;
    this.announcer = this.loc(text);
    this.announcerSub = this.loc(sub);
    this.announcerId++;
    this.annLife = 1.5;
    this.annP = priority;
    this.push(true);
  }

  private bySlot(slot: number) {
    if (slot < 0) return this.bot;
    return this.players[slot];
  }

  private humanCount() {
    return this.players.filter((p) => p.joined).length;
  }

  private resetRunner(p: Runner, clearScore: boolean) {
    p.pos.copy(p.spawn);
    p.vel.set(0, 0, 0);
    p.facing.set(0, 0, -1);
    p.webAnchor = null;
    p.webFlash = 0;
    p.flashAnchor = null;
    p.pizzas = MAX_PIZZAS;
    p.throwCd = 0;
    p.charge = 0;
    p.grounded = true;
    p.airJumps = 1;
    p.coyote = 0.1;
    p.stuck = 0;
    p.actionDown = false;
    p.fireDown = false;
    p.wasEmpty = false;
    if (clearScore) {
      p.score = 0;
      p.combo = 0;
      p.comboT = 0;
      p.bestCombo = 0;
      p.deliveries = 0;
      p.perfects = 0;
      p.misses = 0;
      p.heat = 0;
      p.overdrive = 0;
    }
    p.rig.root.position.copy(p.pos);
  }

  private drawMini() {
    const map = this.minimap;
    const ctx = map?.getContext("2d");
    if (!map || !ctx) return;
    const w = map.width;
    const h = map.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "rgba(8,6,14,0.72)";
    ctx.fillRect(0, 0, w, h);
    const X = (x: number) => ((x + 54) / 108) * w;
    const Z = (z: number) => ((z + 42) / 78) * h;
    ctx.fillStyle = "rgba(255,255,255,0.07)";
    for (const b of this.city.buildings) {
      ctx.fillRect(X(b.minX), Z(b.minZ), Math.max(2, X(b.maxX) - X(b.minX)), Math.max(2, Z(b.maxZ) - Z(b.minZ)));
    }
    ctx.fillStyle = "#ff6a2c";
    ctx.fillRect(X(-1.2), Z(2.2), 5, 7);
    for (const o of this.orders) {
      ctx.fillStyle = o.hot ? "#ff4f9a" : o.rush ? "#ffd36a" : "#8ef6ff";
      ctx.beginPath();
      ctx.arc(X(o.pos.x), Z(o.pos.z), o.hot ? 4 : 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of this.players) {
      if (!p.joined) continue;
      ctx.fillStyle = p.def.color;
      ctx.beginPath();
      ctx.arc(X(p.pos.x), Z(p.pos.z), 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private push(force: boolean) {
    const now = performance.now();
    if (!force && now - this.lastPush < 110) return;
    this.lastPush = now;
    this.onSnap(this.snapshot());
  }

  private snapshot(): Snapshot {
    const joined = this.players.filter((p) => p.joined);
    const leader = joined.slice().sort((a, b) => b.score - a.score)[0];
    const teamScore = joined.reduce((s, p) => s + p.score, 0);
    return {
      phase: this.phase,
      mode: this.mode,
      duration: this.duration,
      timeLeft: this.timeLeft,
      countdown: this.countdown > 0 ? Math.ceil(this.countdown - 0.001) : 0,
      announcer: this.annLife > 0 ? this.announcer : "",
      announcerSub: this.annLife > 0 ? this.announcerSub : "",
      announcerId: this.announcerId,
      players: this.players.map((p) => ({
        slot: p.slot,
        name: p.def.name,
        full: p.def.full,
        role: p.def.role,
        color: p.def.color,
        joined: p.joined,
        score: p.score,
        combo: p.combo,
        bestCombo: p.bestCombo,
        pizzas: p.pizzas,
        maxPizzas: MAX_PIZZAS,
        deliveries: p.deliveries,
        perfects: p.perfects,
        misses: p.misses,
        heat: p.heat,
        overdrive: p.overdrive,
        swinging: !!p.webAnchor,
        speed: Math.hypot(p.vel.x, p.vel.z),
        lead: !!leader && leader.slot === p.slot && leader.score > 0,
      })),
      teamScore,
      orders: this.orders.length,
      hint: this.hint,
      stars: this.stars,
      grade: this.grade,
      mvp: this.mvp,
      load: this.load,
    };
  }
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function ballistic(from: Vector3, to: Vector3, speed: number, g: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.hypot(dx, dz);
  const v2 = speed * speed;
  const disc = v2 * v2 - g * (g * horiz * horiz + 2 * dy * v2);
  const out = new Vector3(dx, dy, dz);
  if (horiz < 0.2 || disc < 0) return out.normalize();
  const theta = Math.atan((v2 - Math.sqrt(disc)) / (g * horiz));
  out.set(dx, 0, dz).normalize().multiplyScalar(Math.cos(theta));
  out.y = Math.sin(theta);
  return out.normalize();
}

function faceNormal(pos: Vector3, b: AABB) {
  const options = [
    { d: pos.x - b.minX, n: new Vector3(-1, 0, 0) },
    { d: b.maxX - pos.x, n: new Vector3(1, 0, 0) },
    { d: pos.z - b.minZ, n: new Vector3(0, 0, -1) },
    { d: b.maxZ - pos.z, n: new Vector3(0, 0, 1) },
    { d: Math.abs(pos.y - b.maxY), n: new Vector3(0, 1, 0) },
    { d: Math.abs(pos.y - b.minY), n: new Vector3(0, -1, 0) },
  ];
  options.sort((a, c) => a.d - c.d);
  return options[0].n;
}

function rayBox(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, b: AABB, maxT: number) {
  let tmin = 0;
  let tmax = maxT;
  const slabs: [number, number, number, number][] = [
    [ox, dx, b.minX, b.maxX],
    [oy, dy, b.minY, b.maxY],
    [oz, dz, b.minZ, b.maxZ],
  ];
  for (const [o, d, min, max] of slabs) {
    if (Math.abs(d) < 1e-8) {
      if (o < min || o > max) return null;
      continue;
    }
    let t1 = (min - o) / d;
    let t2 = (max - o) / d;
    if (t1 > t2) {
      const s = t1;
      t1 = t2;
      t2 = s;
    }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return null;
  }
  return tmin > 0.05 ? tmin : null;
}

function makeCustomer(kind: OrderKind) {
  const g = new Group();
  const coats = ["#e23b4a", "#f4f1ea", "#2c6cb0", "#22262e", "#d7a441", "#6b4aa3", "#ef7aa4", "#3d8f62"];
  const coat = new MeshStandardMaterial({ color: coats[Math.floor(Math.random() * coats.length)], roughness: 0.7 });
  const skin = new MeshStandardMaterial({ color: Math.random() > 0.5 ? "#f0c2a0" : "#8d5a3c", roughness: 0.62 });
  const hair = new MeshStandardMaterial({ color: Math.random() > 0.5 ? "#2a211c" : "#c4552a", roughness: 0.8 });
  const yBody = kind === "window" ? 0.15 : 0.62;
  const body = new Mesh(new CylinderGeometry(0.16, 0.18, kind === "window" ? 0.38 : 0.55, 8), coat);
  body.position.y = yBody;
  body.castShadow = true;
  const head = new Mesh(new SphereGeometry(0.12, 12, 10), skin);
  head.position.y = kind === "window" ? 0.46 : 1.05;
  const cap = new Mesh(new SphereGeometry(0.125, 10, 8), hair);
  cap.position.y = head.position.y + 0.05;
  cap.scale.y = 0.62;
  const arm = new Group();
  const armMesh = new Mesh(new CylinderGeometry(0.035, 0.04, 0.28, 6), coat);
  armMesh.position.y = -0.08;
  arm.add(armMesh);
  arm.position.set(0.2, head.position.y - 0.16, 0.05);
  g.add(body, head, cap, arm);
  g.userData.arm = arm;
  if (kind === "roof") {
    const phone = new Mesh(new BoxGeometry(0.05, 0.09, 0.012), new MeshBasicMaterial({ color: "#9af6ff" }));
    phone.position.set(0.22, head.position.y - 0.28, 0.12);
    g.add(phone);
  }
  return g;
}

function rate(total: number, n: number) {
  const scale = 0.72 + 0.28 * n;
  const cuts = [450, 1100, 2000, 3200, 4700].map((v) => v * scale);
  let stars = 0;
  for (const c of cuts) if (total >= c) stars++;
  const grade = ["D", "C", "B", "A", "S", "S+"][stars] ?? "D";
  return { stars, grade };
}
