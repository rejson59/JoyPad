import type { FloatText, GameMode, KillEvent, Light, MapId, Particle, PlayerConfig, PowerUpState, ShellState, TankState, WallState } from './types';
import { MAPS, WORLD_H, WORLD_W } from './maps';
import { gameAudio } from './audio';
import type { PadFx, PadInput } from '../net/protocol';

export interface HudTank {
  id: number; name: string; color: string;
  hp: number; maxHp: number; alive: boolean;
  kills: number; deaths: number; lives: number;
  shield: number; isBot: boolean; respawn: number;
  rapid: boolean; big: boolean; speed: boolean;
}

export interface HudState {
  tanks: HudTank[];
  timeLeft: number;
  killLimit: number;
  mode: GameMode;
  killFeed: KillEvent[];
  countdown: number;
  paused: boolean;
}

interface EngineOpts {
  players: PlayerConfig[];
  mapId: MapId;
  mode: GameMode;
  killLimit: number;
  lives: number;
  timeLimit: number;
  onHud: (h: HudState) => void;
  onKill: (k: KillEvent) => void;
  onGameOver: (winnerId: number | null, tanks: HudTank[]) => void;
  /** Analogowe wejście z telefonów-padów, indeks = id gracza (slot). */
  padInputs?: PadInput[];
  /** Zdarzenia dla haptyki / dźwięku na telefonie danego gracza. */
  onPadFx?: (slot: number, fx: PadFx) => void;
  /** HUD per gracz na telefon. */
  onPadHud?: (slot: number, tank: HudTank, hud: HudState) => void;
}

function rand(a: number, b: number) { return a + Math.random() * (b - a); }
function clamp(v: number, a: number, b: number) { return Math.max(a, Math.min(b, v)); }
function lerp(a: number, b: number, t: number) { return a + (b - a) * t; }
function angDiff(a: number, b: number) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}
function dist(x1: number, y1: number, x2: number, y2: number) { return Math.hypot(x2 - x1, y2 - y1); }

/* --- Telefon w trybie „KIERUNEK” (jedziesz tam, gdzie pchasz gałkę) --- */
/** Jak szybko kadłub dogania kierunek z gałki [rad/s] — 180° zawrócenia trwa ~0,4 s. */
const PAD_TURN_SPEED = 8.5;
/** Jak szybko prędkość dogania gałkę [1/s] — lekka bezwładność, ale bez „pływania”. */
const PAD_DIR_RESPONSE = 5.5;
/** Martwa strefa wektora kierunku — drżący palec nie rusza czołgu. */
const PAD_DIR_DEAD = 0.14;

/* --- Joystick celowania (obrót wieży) --- */
/** Szybkość obrotu wieży za gałką celowania [rad/s] — pół obrotu w ~0,3 s. */
const PAD_AIM_SPEED = 11;
/** Martwa strefa celowania. */
const PAD_AIM_DEAD = 0.2;
/** Ile sekund wieża trzyma cel po puszczeniu gałki, zanim wróci do kierunku kadłuba. */
const PAD_AIM_HOLD = 1.6;

export class TankGame {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  ground: HTMLCanvasElement;
  gctx: CanvasRenderingContext2D;
  lightCanvas: HTMLCanvasElement;
  lctx: CanvasRenderingContext2D;
  opts: EngineOpts;
  map = MAPS.desert;

  tanks: TankState[] = [];
  shells: ShellState[] = [];
  walls: WallState[] = [];
  particles: Particle[] = [];
  texts: FloatText[] = [];
  powerups: PowerUpState[] = [];
  lights: Light[] = [];
  rain: { x: number; y: number; s: number }[] = [];
  dust: { x: number; y: number; s: number; a: number; v: number }[] = [];

  keys = new Set<string>();
  running = false;
  raf = 0;
  lastT = 0;
  elapsed = 0;
  timeLeft = 300;
  countdown = 3.6;
  timeScale = 1;
  slowMo = 0;
  trauma = 0;
  killFeed: KillEvent[] = [];
  killId = 0;
  gameOver = false;
  paused = false;
  hudTimer = 0;
  powerupTimer = 5;
  stats = { shots: 0, explosions: 0 };
  finished = false;
  dpr = 1;
  viewScale = 1;
  viewX = 0; viewY = 0;

  keyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    this.keys.add(e.code);
    if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
  };
  keyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  resize = () => this.fitCanvas();
  blur = () => { this.keys.clear(); };

  constructor(canvas: HTMLCanvasElement, opts: EngineOpts) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.opts = opts;
    this.map = MAPS[opts.mapId];
    this.timeLeft = opts.timeLimit;
    this.ground = document.createElement('canvas');
    this.ground.width = WORLD_W; this.ground.height = WORLD_H;
    this.gctx = this.ground.getContext('2d')!;
    this.lightCanvas = document.createElement('canvas');
    this.lightCanvas.width = WORLD_W; this.lightCanvas.height = WORLD_H;
    this.lctx = this.lightCanvas.getContext('2d')!;
    this.paintGround();
    this.initEntities();
    for (let i = 0; i < 160; i++) this.rain.push({ x: rand(0, WORLD_W), y: rand(0, WORLD_H), s: rand(700, 1200) });
    for (let i = 0; i < 40; i++) this.dust.push({ x: rand(0, WORLD_W), y: rand(0, WORLD_H), s: rand(60, 220), a: rand(0.03, 0.1), v: rand(40, 140) });
  }

  /** Aktualizuje etykiety telefonów bez resetowania bieżącej rundy. */
  setPlayerNames(names: Record<number, string>) {
    for (const tank of this.tanks) {
      const next = names[tank.id];
      if (!next || tank.cfg.isBot) continue;
      tank.cfg = { ...tank.cfg, name: next };
    }
    this.opts.players = this.opts.players.map(player => {
      const next = names[player.id];
      return next && !player.isBot ? { ...player, name: next } : player;
    });
  }

  initEntities() {
    this.walls = this.map.buildWalls();
    const enabled = this.opts.players.filter(p => p.enabled);
    this.tanks = enabled.map((cfg, i) => {
      const s = this.map.spawns[i % this.map.spawns.length];
      return {
        id: cfg.id, cfg, x: s.x, y: s.y, vx: 0, vy: 0,
        hullAngle: s.angle, turretAngle: s.angle,
        barrelHeat: 0, recoil: 0, hp: 100, maxHp: 100,
        alive: true, respawnTimer: 0, kills: 0, deaths: 0,
        lives: this.opts.mode === 'survival' ? this.opts.lives : 999,
        shield: 0, rapidUntil: 0, bigUntil: 0, speedUntil: 0,
        trackPhase: 0, throttle: 0, lastShot: -9, spawnShield: 2,
        aiState: cfg.isBot ? { targetAngle: s.angle, nextThink: 0, strafeDir: 1, wantFire: false, stuckTimer: 0, lastX: s.x, lastY: s.y, waypoint: { x: WORLD_W / 2, y: WORLD_H / 2 } } : undefined,
        muzzle: 0, enginePitch: 0,
      } as TankState;
    });
  }

  // ---------- ground painting ----------
  paintGround() {
    const g = this.gctx;
    const mapId = this.map.id;
    // base
    const grad = g.createLinearGradient(0, 0, WORLD_W, WORLD_H);
    if (mapId === 'desert') {
      grad.addColorStop(0, '#c2a468'); grad.addColorStop(0.5, '#b99a62'); grad.addColorStop(1, '#a98852');
    } else if (mapId === 'nightcity') {
      grad.addColorStop(0, '#26272e'); grad.addColorStop(0.5, '#23242a'); grad.addColorStop(1, '#1b1c21');
    } else {
      grad.addColorStop(0, '#50663f'); grad.addColorStop(0.5, '#4a5d3a'); grad.addColorStop(1, '#3d4e32');
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    // noise speckle
    for (let i = 0; i < 9000; i++) {
      const x = Math.random() * WORLD_W, y = Math.random() * WORLD_H;
      const s = rand(1, 3.5);
      g.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
      g.fillRect(x, y, s, s);
    }

    if (mapId === 'desert') {
      // dunes: soft wavy bands
      for (let i = 0; i < 14; i++) {
        const y = rand(0, WORLD_H);
        g.strokeStyle = `rgba(120,90,50,${rand(0.08, 0.2)})`;
        g.lineWidth = rand(18, 60);
        g.beginPath();
        for (let x = 0; x <= WORLD_W; x += 40) g.lineTo(x, y + Math.sin(x * 0.008 + i) * 22);
        g.stroke();
      }
      // stones
      for (let i = 0; i < 120; i++) {
        const x = rand(0, WORLD_W), y = rand(0, WORLD_H), r = rand(2, 7);
        g.fillStyle = 'rgba(60,45,30,0.5)';
        g.beginPath(); g.ellipse(x + 2, y + 2, r, r * 0.7, 0, 0, 7); g.fill();
        g.fillStyle = '#8a734f';
        g.beginPath(); g.ellipse(x, y, r, r * 0.7, 0, 0, 7); g.fill();
      }
      // dry cracks
      g.strokeStyle = 'rgba(70,55,35,0.35)'; g.lineWidth = 1.5;
      for (let i = 0; i < 40; i++) {
        let x = rand(0, WORLD_W), y = rand(0, WORLD_H);
        g.beginPath(); g.moveTo(x, y);
        for (let s = 0; s < 5; s++) { x += rand(-30, 30); y += rand(-30, 30); g.lineTo(x, y); }
        g.stroke();
      }
    } else if (mapId === 'nightcity') {
      // roads
      g.fillStyle = '#17181d';
      g.fillRect(0, 440, WORLD_W, 120);
      g.fillRect(640, 0, 120, WORLD_H);
      // lane markings
      g.fillStyle = 'rgba(250,204,21,0.55)';
      for (let x = 20; x < WORLD_W; x += 70) { g.fillRect(x, 496, 36, 6); }
      for (let y = 20; y < WORLD_H; y += 70) { if (y > 420 && y < 580) continue; g.fillRect(697, y, 6, 36); }
      // sidewalks
      g.strokeStyle = 'rgba(255,255,255,0.08)'; g.lineWidth = 3;
      for (let x = 0; x < WORLD_W; x += 60) { g.beginPath(); g.moveTo(x, 430); g.lineTo(x, 440); g.stroke(); g.beginPath(); g.moveTo(x, 560); g.lineTo(x, 570); g.stroke(); }
      // crosswalks
      g.fillStyle = 'rgba(255,255,255,0.28)';
      for (let i = 0; i < 8; i++) { g.fillRect(600 - i * 0, 0, 0, 0); }
      for (let x = 560; x < 760; x += 26) { g.fillRect(x, 445, 14, 30); g.fillRect(x, 525, 14, 30); }
      for (let y = 360; y < 560; y += 26) { g.fillRect(645, y, 30, 14); g.fillRect(725, y, 30, 14); }
      // wet puddles (reflective)
      for (let i = 0; i < 26; i++) {
        const x = rand(0, WORLD_W), y = rand(0, WORLD_H);
        const pw = rand(40, 150), ph = rand(20, 60);
        const pg = g.createRadialGradient(x, y, 4, x, y, pw / 2);
        pg.addColorStop(0, 'rgba(120,160,220,0.28)');
        pg.addColorStop(1, 'rgba(120,160,220,0)');
        g.fillStyle = pg;
        g.beginPath(); g.ellipse(x, y, pw / 2, ph / 2, 0, 0, 7); g.fill();
      }
      // neon stains
      const neons = ['rgba(236,72,153,0.10)', 'rgba(34,211,238,0.10)', 'rgba(168,85,247,0.10)'];
      for (let i = 0; i < 16; i++) {
        const x = rand(0, WORLD_W), y = rand(0, WORLD_H), r = rand(80, 220);
        const ng = g.createRadialGradient(x, y, 10, x, y, r);
        ng.addColorStop(0, neons[i % 3]); ng.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = ng; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
    } else {
      // forest: mud patches
      for (let i = 0; i < 40; i++) {
        const x = rand(0, WORLD_W), y = rand(0, WORLD_H), r = rand(40, 140);
        const mg = g.createRadialGradient(x, y, 5, x, y, r);
        mg.addColorStop(0, 'rgba(62,48,32,0.55)'); mg.addColorStop(1, 'rgba(62,48,32,0)');
        g.fillStyle = mg; g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
      }
      // grass tufts
      for (let i = 0; i < 700; i++) {
        const x = rand(0, WORLD_W), y = rand(0, WORLD_H);
        g.strokeStyle = `rgba(${Math.floor(rand(60, 110))},${Math.floor(rand(120, 170))},${Math.floor(rand(50, 90))},0.7)`;
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(x, y); g.lineTo(x - 3, y - rand(4, 9));
        g.moveTo(x, y); g.lineTo(x + 3, y - rand(4, 9));
        g.moveTo(x, y); g.lineTo(x, y - rand(5, 11));
        g.stroke();
      }
      // puddles
      for (let i = 0; i < 14; i++) {
        const x = rand(0, WORLD_W), y = rand(0, WORLD_H);
        g.fillStyle = 'rgba(150,180,200,0.25)';
        g.beginPath(); g.ellipse(x, y, rand(30, 90), rand(15, 40), rand(0, 3), 0, 7); g.fill();
        g.strokeStyle = 'rgba(40,50,35,0.4)'; g.lineWidth = 3; g.stroke();
      }
      // dirt road cross
      g.save();
      g.strokeStyle = 'rgba(101,84,60,0.85)'; g.lineCap = 'round';
      g.lineWidth = 90;
      g.beginPath(); g.moveTo(0, 500); g.quadraticCurveTo(800, 440, 1600, 520); g.stroke();
      g.lineWidth = 70;
      g.beginPath(); g.moveTo(800, 0); g.quadraticCurveTo(760, 500, 830, 1000); g.stroke();
      g.strokeStyle = 'rgba(80,66,46,0.5)'; g.lineWidth = 3;
      g.restore();
    }

    // vignette border walls frame: dark edge
    const eg = g.createLinearGradient(0, 0, 0, 26);
    g.fillStyle = 'rgba(0,0,0,0.55)';
    g.fillRect(0, 0, WORLD_W, 14); g.fillRect(0, WORLD_H - 14, WORLD_W, 14);
    g.fillRect(0, 0, 14, WORLD_H); g.fillRect(WORLD_W - 14, 0, 14, WORLD_H);
    void eg;
  }

  fitCanvas() {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const pw = parent.clientWidth, ph = parent.clientHeight;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.canvas.width = pw * this.dpr;
    this.canvas.height = ph * this.dpr;
    this.canvas.style.width = pw + 'px';
    this.canvas.style.height = ph + 'px';
    const s = Math.min(pw / WORLD_W, ph / WORLD_H);
    this.viewScale = s * this.dpr;
    this.viewX = (pw * this.dpr - WORLD_W * this.viewScale) / 2;
    this.viewY = (ph * this.dpr - WORLD_H * this.viewScale) / 2;
  }

  start() {
    gameAudio.init();
    if (this.map.weather === 'rain') gameAudio.startRain();
    this.tanks.forEach(t => gameAudio.startEngine(t.id));
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('resize', this.resize);
    window.addEventListener('blur', this.blur);
    this.fitCanvas();
    this.running = true;
    this.lastT = performance.now();
    let lastCount = 4;
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min((now - this.lastT) / 1000, 0.05);
      this.lastT = now;
      // countdown beeps
      const c = Math.ceil(this.countdown);
      if (c !== lastCount && c >= 1 && c <= 3 && !this.paused) { gameAudio.countdownBeep(false); lastCount = c; }
      if (!this.paused && !this.gameOver) {
        if (this.countdown > 0) {
          this.countdown -= dt;
          if (this.countdown <= 0) { this.countdown = 0; gameAudio.countdownBeep(true); this.addText(WORLD_W / 2, WORLD_H / 2 - 60, 'OGNIA!', '#fbbf24', 64); }
        } else {
          // slow-mo
          if (this.slowMo > 0) { this.slowMo -= dt; this.timeScale = lerp(this.timeScale, 0.35, 0.2); }
          else this.timeScale = lerp(this.timeScale, 1, 0.12);
          this.update(dt * this.timeScale, dt);
        }
      }
      this.render(dt);
      // hud throttle
      this.hudTimer -= dt;
      if (this.hudTimer <= 0) { this.hudTimer = 0.08; this.emitHud(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('blur', this.blur);
    gameAudio.stopAllEngines();
    gameAudio.stopRain();
  }

  togglePause() {
    if (this.gameOver || this.countdown > 0) return;
    this.paused = !this.paused;
    gameAudio.uiClick();
    this.emitHud();
  }

  emitHud() {
    const tanks: HudTank[] = this.tanks.map(t => ({
      id: t.id, name: t.cfg.name + (t.cfg.isBot ? ' (BOT)' : ''), color: t.cfg.color,
      hp: Math.max(0, Math.round(t.hp)), maxHp: t.maxHp, alive: t.alive,
      kills: t.kills, deaths: t.deaths, lives: t.lives,
      shield: t.shield, isBot: t.cfg.isBot, respawn: t.respawnTimer,
      rapid: t.rapidUntil > this.elapsed, big: t.bigUntil > this.elapsed, speed: t.speedUntil > this.elapsed,
    }));
    const hud: HudState = { tanks, timeLeft: this.timeLeft, killLimit: this.opts.killLimit, mode: this.opts.mode, killFeed: [...this.killFeed].reverse().slice(0, 5), countdown: this.countdown, paused: this.paused };
    this.opts.onHud(hud);
    if (this.opts.onPadHud) for (const ht of tanks) if (!ht.isBot) this.opts.onPadHud(ht.id, ht, hud);
  }

  // ================= UPDATE =================
  update(sdt: number, rdt: number) {
    this.elapsed += sdt;
    this.timeLeft -= sdt;
    if (this.timeLeft <= 0) { this.timeLeft = 0; this.endGame(null); return; }
    this.trauma = Math.max(0, this.trauma - rdt * 1.6);

    // powerup spawner
    this.powerupTimer -= sdt;
    if (this.powerupTimer <= 0) {
      this.powerupTimer = rand(6, 10);
      if (this.powerups.filter(p => !p.taken).length < 3) this.spawnPowerup();
    }

    for (const t of this.tanks) this.updateTank(t, sdt);
    this.updateShells(sdt);
    this.updateParticles(sdt);
    this.updatePowerups(sdt);
    this.updateLights(rdt);
    this.updateWeather(sdt);
    for (const t of this.texts) { t.life -= sdt; t.y -= 40 * sdt; }
    this.texts = this.texts.filter(t => t.life > 0);

    // tank-tank collision
    for (let i = 0; i < this.tanks.length; i++) for (let j = i + 1; j < this.tanks.length; j++) {
      const a = this.tanks[i], b = this.tanks[j];
      if (!a.alive || !b.alive) continue;
      const d = dist(a.x, a.y, b.x, b.y);
      const min = 52;
      if (d < min && d > 0.01) {
        const nx = (b.x - a.x) / d, ny = (b.y - a.y) / d;
        const overlap = (min - d) / 2;
        a.x -= nx * overlap; a.y -= ny * overlap;
        b.x += nx * overlap; b.y += ny * overlap;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          const imp = -rel * 0.6;
          a.vx -= imp * nx; a.vy -= imp * ny;
          b.vx += imp * nx; b.vy += imp * ny;
          if (Math.abs(rel) > 120) { gameAudio.hitMetal(); this.sparks((a.x + b.x) / 2, (a.y + b.y) / 2, 6); }
        }
      }
    }

    // survival check
    if (this.opts.mode === 'survival') {
      const contenders = this.tanks.filter(t => t.lives > 0 || t.alive);
      const aliveNow = this.tanks.filter(t => t.alive);
      if (aliveNow.length <= 1 && this.tanks.length > 1 && this.elapsed > 2) {
        // if only one alive and others dead with no lives -> that one wins; if all dead -> draw
        const outOfLives = this.tanks.filter(t => !t.alive && t.lives <= 0);
        if (outOfLives.length >= this.tanks.length - 1) {
          const winner = aliveNow[0]?.id ?? null;
          this.endGame(winner);
        }
      }
      void contenders;
    }
  }

  updateTank(t: TankState, dt: number) {
    if (!t.alive) {
      t.respawnTimer -= dt;
      if (t.respawnTimer <= 0) {
        if (this.opts.mode === 'deathmatch') this.respawn(t);
        else if (t.lives > 0) this.respawn(t);
      }
      gameAudio.updateEngine(t.id, 0, false);
      return;
    }
    t.spawnShield = Math.max(0, t.spawnShield - dt);
    t.shield = Math.max(0, t.shield - dt);
    t.barrelHeat = Math.max(0, t.barrelHeat - dt * 1.4);
    t.recoil = Math.max(0, t.recoil - dt * 60);
    t.muzzle = Math.max(0, t.muzzle - dt * 6);

    let fwd = 0, turn = 0, fire = false;
    /**
     * Telefon w trybie „KIERUNEK”: wektor w przestrzeni ekranu (x = prawo, y = DÓŁ).
     * Czołg jedzie wtedy dokładnie tam, gdzie pchasz gałkę, a kadłub sam obraca się
     * w stronę jazdy — koniec z „pcham w dół, a on cofa się w bok”.
     */
    let padDir: { x: number; y: number; mag: number } | null = null;
    /** Kierunek wieży z joysticka celowania (kąt w świecie gry) albo null. */
    let padAim: number | null = null;
    if (t.cfg.isBot && t.aiState) {
      const out = this.botControl(t, dt);
      fwd = out.fwd; turn = out.turn; fire = out.fire;
    } else {
      const c = t.cfg.controls;
      const down = (arr: string[]) => arr.some(k => this.keys.has(k));
      const kbFwd = (down(c.forward) ? 1 : 0) - (down(c.back) ? 1 : 0);
      const kbTurn = (down(c.right) ? 1 : 0) - (down(c.left) ? 1 : 0);
      if (down(c.fire)) fire = true;

      const pad = this.opts.padInputs?.[t.id];
      if (pad?.fire) fire = true;
      if (pad) {
        const ax = pad.aimX ?? 0, ay = pad.aimY ?? 0;
        if (Math.hypot(ax, ay) > PAD_AIM_DEAD) padAim = Math.atan2(ay, ax);
      }

      if (kbFwd !== 0 || kbTurn !== 0) {
        // Klawiatura ma pierwszeństwo — ktoś przy komputerze przejął ten slot.
        fwd = kbFwd;
        turn = kbTurn;
      } else if (pad) {
        if (pad.steer === 'direct') {
          const dx = pad.dirX ?? 0, dy = pad.dirY ?? 0;
          const m = Math.hypot(dx, dy);
          if (m > PAD_DIR_DEAD) padDir = { x: dx / m, y: dy / m, mag: Math.min(1, m) };
        } else {
          // Tryb „CZOŁG” oraz starsze telefony: góra = przód, dół = tył, lewo/prawo = obrót.
          if (Math.abs(pad.fwd) > 0.08) fwd += pad.fwd;
          if (Math.abs(pad.turn) > 0.08) turn += pad.turn;
        }
      }
      fwd = clamp(fwd, -1, 1);
      turn = clamp(turn, -1, 1);
    }

    const speedy = t.speedUntil > this.elapsed;
    const accel = (this.map.id === 'forest' ? 260 : 320) * (speedy ? 1.5 : 1);
    const maxSp = (this.map.id === 'forest' ? 195 : 235) * (speedy ? 1.4 : 1);
    const drag = this.map.id === 'desert' ? 1.6 : this.map.id === 'forest' ? 2.6 : 2.1;

    if (padDir) {
      /* ---- jazda „po gałce”: kierunek z telefonu = kierunek na mapie ---- */
      const want = Math.atan2(padDir.y, padDir.x);
      // kadłub dogania kierunek jazdy krótszą drogą (pivot w miejscu, jak prawdziwy czołg)
      const d = angDiff(t.hullAngle, want);
      const step = PAD_TURN_SPEED * dt;
      t.hullAngle += Math.abs(d) > step ? Math.sign(d) * step : d;
      // prędkość podąża za gałką z niewielką bezwładnością; `boost` kasuje opór powietrza,
      // żeby pełne wychylenie dawało taką samą prędkość jak jazda na klawiaturze
      const k = Math.min(1, dt * PAD_DIR_RESPONSE);
      const target = maxSp * padDir.mag * (1 + drag / PAD_DIR_RESPONSE);
      t.vx += (padDir.x * target - t.vx) * k;
      t.vy += (padDir.y * target - t.vy) * k;
      t.throttle = lerp(t.throttle, padDir.mag, Math.min(1, dt * 8));
      this.skidDust(t, dt);
    } else {
      /* ---- sterowanie klasyczne: gaz (przód/tył) + obrót kadłuba ---- */
      const turnSp = 2.6 * (fwd < 0 ? 0.8 : 1);
      t.hullAngle += turn * turnSp * dt;
      // throttle with inertia
      t.throttle = lerp(t.throttle, fwd, Math.min(1, dt * (fwd !== 0 ? 3.2 : 5)));
      const fx = Math.cos(t.hullAngle), fy = Math.sin(t.hullAngle);
      t.vx += fx * t.throttle * accel * dt;
      t.vy += fy * t.throttle * accel * dt;
    }
    if (padAim !== null) {
      // wieża celuje tam, gdzie wskazuje prawa gałka — niezależnie od jazdy
      const d = angDiff(t.turretAngle, padAim);
      const step = PAD_AIM_SPEED * dt;
      t.turretAngle += Math.abs(d) > step ? Math.sign(d) * step : d;
      t.aimHoldUntil = this.elapsed + PAD_AIM_HOLD;
      t.aiming = true;
    } else {
      t.aiming = false;
      // po puszczeniu gałki wieża chwilę trzyma cel, potem wraca nad kadłub
      if (!(t.aimHoldUntil && this.elapsed < t.aimHoldUntil)) {
        t.turretAngle += angDiff(t.turretAngle, t.hullAngle) * Math.min(1, dt * 4.5);
      }
    }
    // friction / drag
    t.vx -= t.vx * Math.min(1, drag * dt);
    t.vy -= t.vy * Math.min(1, drag * dt);
    const sp = Math.hypot(t.vx, t.vy);
    if (sp > maxSp) { t.vx = t.vx / sp * maxSp; t.vy = t.vy / sp * maxSp; }

    t.x += t.vx * dt;
    t.y += t.vy * dt;
    t.x = clamp(t.x, 30, WORLD_W - 30);
    t.y = clamp(t.y, 30, WORLD_H - 30);

    // wall collision (circle vs rect)
    for (const wl of this.walls) {
      if (wl.destroyed) continue;
      const cx = clamp(t.x, wl.x, wl.x + wl.w), cy = clamp(t.y, wl.y, wl.y + wl.h);
      const dx = t.x - cx, dy = t.y - cy;
      const d = Math.hypot(dx, dy);
      const r = 24;
      if (d < r) {
        if (d > 0.01) {
          const nx = dx / d, ny = dy / d;
          t.x = cx + nx * r; t.y = cy + ny * r;
          const dot = t.vx * nx + t.vy * ny;
          if (dot < 0) { t.vx -= dot * nx * 1.4; t.vy -= dot * ny * 1.4; }
        } else {
          t.x -= t.vx * dt * 2; t.y -= t.vy * dt * 2;
          t.vx *= -0.3; t.vy *= -0.3;
        }
      }
    }

    // track animation + dust + track marks
    const speed = Math.hypot(t.vx, t.vy);
    t.trackPhase += speed * dt * 0.09;
    if (speed > 40) {
      if (Math.random() < speed / 240 * 0.5) {
        const bx = t.x - Math.cos(t.hullAngle) * 26, by = t.y - Math.sin(t.hullAngle) * 26;
        this.addParticle({
          x: bx + rand(-6, 6), y: by + rand(-6, 6),
          vx: rand(-30, 30) - t.vx * 0.15, vy: rand(-40, -5),
          life: rand(0.5, 1.1), maxLife: 1.1, size: rand(5, 10), grow: 14,
          color: this.map.id === 'desert' ? 'rgba(194,164,104,' : this.map.id === 'nightcity' ? 'rgba(120,120,130,' : 'rgba(110,125,85,',
          alpha: 0.5, type: 'dust', rotation: rand(0, 6), rotSpeed: rand(-2, 2), gravity: -20, drag: 1.5, glow: false,
        });
      }
      // engine exhaust
      if (Math.random() < 0.25) {
        const ex = t.x - Math.cos(t.hullAngle) * 30 + rand(-4, 4), ey = t.y - Math.sin(t.hullAngle) * 30 + rand(-4, 4);
        this.addParticle({
          x: ex, y: ey, vx: -t.vx * 0.1 + rand(-15, 15), vy: -30 + rand(-10, 10),
          life: rand(0.4, 0.8), maxLife: 0.8, size: rand(3, 6), grow: 10,
          color: 'rgba(60,60,65,', alpha: 0.4, type: 'smoke', rotation: 0, rotSpeed: 1, gravity: -30, drag: 1, glow: false,
        });
      }
      this.drawTrackMarks(t);
    }

    // fire
    const rapid = t.rapidUntil > this.elapsed;
    const cooldown = rapid ? 0.32 : 0.85;
    if (fire && this.elapsed - t.lastShot >= cooldown && t.barrelHeat < 1.6) {
      this.fireShell(t);
    }

    // powerup pickup
    for (const p of this.powerups) {
      if (p.taken) continue;
      if (dist(t.x, t.y, p.x, p.y) < 40) {
        p.taken = true;
        this.applyPowerup(t, p);
      }
    }

    gameAudio.updateEngine(t.id, t.throttle, true);
  }

  /**
   * Kurz spod gąsienic przy ostrym skręcie „po gałce” (tryb KIERUNEK): pojawia się,
   * gdy czołg jedzie wyraźnie bokiem do kadłuba. Czysto wizualne — daje wyczucie,
   * że maszyna właśnie zawraca.
   */
  skidDust(t: TankState, dt: number) {
    const speed = Math.hypot(t.vx, t.vy);
    if (speed < 70) return;
    const slip = Math.abs(angDiff(t.hullAngle, Math.atan2(t.vy, t.vx)));
    if (slip < 0.5) return;
    if (Math.random() > Math.min(0.85, slip * dt * 12)) return;
    const sx = Math.cos(t.hullAngle + Math.PI / 2), sy = Math.sin(t.hullAngle + Math.PI / 2);
    const color = this.map.id === 'desert' ? 'rgba(194,164,104,' : this.map.id === 'nightcity' ? 'rgba(120,120,130,' : 'rgba(110,125,85,';
    for (const s of [-13, 13]) {
      this.addParticle({
        x: t.x + sx * s - Math.cos(t.hullAngle) * 10 + rand(-4, 4),
        y: t.y + sy * s - Math.sin(t.hullAngle) * 10 + rand(-4, 4),
        vx: -t.vx * 0.1 + rand(-30, 30), vy: -t.vy * 0.1 + rand(-30, 5),
        life: rand(0.4, 0.9), maxLife: 0.9, size: rand(5, 10), grow: 16,
        color, alpha: 0.45, type: 'dust', rotation: rand(0, 6), rotSpeed: rand(-2, 2),
        gravity: -18, drag: 1.6, glow: false,
      });
    }
  }

  botControl(t: TankState, dt: number): { fwd: number; turn: number; fire: boolean } {
    const ai = t.aiState!;
    ai.nextThink -= dt;
    // find nearest enemy
    let best: TankState | null = null, bd = 1e9;
    for (const o of this.tanks) {
      if (o.id === t.id || !o.alive) continue;
      const d = dist(t.x, t.y, o.x, o.y);
      if (d < bd) { bd = d; best = o; }
    }
    if (ai.nextThink <= 0) {
      ai.nextThink = 0.35;
      if (best) {
        const aimX = best.x + best.vx * (bd / 900) * 0.7;
        const aimY = best.y + best.vy * (bd / 900) * 0.7;
        ai.targetAngle = Math.atan2(aimY - t.y, aimX - t.x);
        // waypoint: circle strafe around enemy at ~350px
        if (Math.random() < 0.3) ai.strafeDir *= -1;
        const orbit = ai.targetAngle + Math.PI / 2 * ai.strafeDir;
        const wantDist = bd > 480 ? ai.targetAngle : bd < 220 ? ai.targetAngle + Math.PI : orbit;
        ai.waypoint = { x: t.x + Math.cos(wantDist) * 200, y: t.y + Math.sin(wantDist) * 200 };
        // fire decision with line of sight
        const dd = Math.abs(angDiff(t.turretAngle, ai.targetAngle));
        ai.wantFire = dd < 0.22 && bd < 950 && this.hasLineOfSight(t.x, t.y, best.x, best.y) && Math.random() < 0.85;
      }
      // stuck detection
      const moved = dist(t.x, t.y, ai.lastX, ai.lastY);
      if (moved < 8) ai.stuckTimer += 0.35; else ai.stuckTimer = 0;
      ai.lastX = t.x; ai.lastY = t.y;
      if (ai.stuckTimer > 0.7) {
        ai.waypoint = { x: rand(100, WORLD_W - 100), y: rand(100, WORLD_H - 100) };
        ai.stuckTimer = -1.2; // reverse time
      }
    }
    // wall ahead check -> steer
    const lookX = t.x + Math.cos(t.hullAngle) * 90, lookY = t.y + Math.sin(t.hullAngle) * 90;
    let avoid = 0;
    if (this.pointInWall(lookX, lookY) || lookX < 50 || lookX > WORLD_W - 50 || lookY < 50 || lookY > WORLD_H - 50) avoid = 1;

    const desired = Math.atan2(ai.waypoint.y - t.y, ai.waypoint.x - t.x);
    let diff = angDiff(t.hullAngle, desired);
    if (ai.stuckTimer < 0) diff = angDiff(t.hullAngle, desired + Math.PI); // reversing handled below
    let turn = 0, fwd: number;
    if (avoid) { turn = ai.strafeDir; fwd = 0.4; }
    else if (Math.abs(diff) > 0.25) { turn = diff > 0 ? 1 : -1; fwd = Math.abs(diff) < 1.1 ? 0.65 : 0.15; }
    else { fwd = 1; }
    if (ai.stuckTimer < 0 && ai.stuckTimer > -1.2 + 0.35) { fwd = -1; turn = -ai.strafeDir; }
    // aim turret: hull turns toward enemy when close to firing
    if (best && bd < 700) {
      const aimDiff = angDiff(t.hullAngle, ai.targetAngle);
      if (Math.abs(aimDiff) < 0.5) { turn = aimDiff > 0 ? 0.6 : -0.6; }
    }
    return { fwd, turn, fire: ai.wantFire };
  }

  hasLineOfSight(x1: number, y1: number, x2: number, y2: number): boolean {
    const steps = 12;
    for (let i = 1; i < steps; i++) {
      const x = lerp(x1, x2, i / steps), y = lerp(y1, y2, i / steps);
      if (this.pointInWall(x, y)) return false;
    }
    return true;
  }
  pointInWall(x: number, y: number): boolean {
    for (const w of this.walls) {
      if (w.destroyed) continue;
      if (x > w.x && x < w.x + w.w && y > w.y && y < w.y + w.h) return true;
    }
    return false;
  }

  fireShell(t: TankState) {
    t.lastShot = this.elapsed;
    this.opts.onPadFx?.(t.id, 'fire');
    t.barrelHeat += 0.55;
    t.recoil = 14;
    t.muzzle = 1;
    const big = t.bigUntil > this.elapsed;
    const mx = t.x + Math.cos(t.turretAngle) * 46, my = t.y + Math.sin(t.turretAngle) * 46;
    const spd = big ? 780 : 920;
    this.shells.push({
      x: mx, y: my,
      vx: Math.cos(t.turretAngle) * spd + t.vx * 0.3,
      vy: Math.sin(t.turretAngle) * spd + t.vy * 0.3,
      angle: t.turretAngle, owner: t.id, life: 2.2, bounces: 0, big, trail: [],
    });
    this.stats.shots++;
    gameAudio.shoot(big);
    // recoil kick
    t.vx -= Math.cos(t.turretAngle) * (big ? 120 : 70);
    t.vy -= Math.sin(t.turretAngle) * (big ? 120 : 70);
    // muzzle flash
    this.addLight(mx, my, big ? 260 : 190, big ? '255,180,80' : '255,220,150', 0.9, 0.12, true);
    for (let i = 0; i < (big ? 14 : 8); i++) {
      this.addParticle({
        x: mx, y: my,
        vx: Math.cos(t.turretAngle + rand(-0.3, 0.3)) * rand(200, 600),
        vy: Math.sin(t.turretAngle + rand(-0.3, 0.3)) * rand(200, 600),
        life: rand(0.08, 0.2), maxLife: 0.2, size: rand(4, 9), grow: -20,
        color: 'rgba(255,220,150,', alpha: 1, type: 'flash', rotation: 0, rotSpeed: 0, gravity: 0, drag: 2, glow: true,
      });
    }
    for (let i = 0; i < 6; i++) {
      this.addParticle({
        x: mx, y: my,
        vx: Math.cos(t.turretAngle) * rand(60, 160) + rand(-40, 40),
        vy: Math.sin(t.turretAngle) * rand(60, 160) + rand(-40, 40) - 20,
        life: rand(0.6, 1.4), maxLife: 1.4, size: rand(6, 12), grow: 16,
        color: 'rgba(200,200,205,', alpha: 0.55, type: 'smoke', rotation: rand(0, 6), rotSpeed: rand(-3, 3), gravity: -30, drag: 1.8, glow: false,
      });
    }
    // shell casing eject
    const cx = t.x - Math.cos(t.turretAngle) * 10 + Math.cos(t.turretAngle + Math.PI / 2) * 18;
    const cy = t.y - Math.sin(t.turretAngle) * 10 + Math.sin(t.turretAngle + Math.PI / 2) * 18;
    this.addParticle({
      x: cx, y: cy, vx: Math.cos(t.turretAngle + Math.PI / 2) * rand(120, 200), vy: Math.sin(t.turretAngle + Math.PI / 2) * rand(120, 200) - 60,
      life: 1.2, maxLife: 1.2, size: 3.5, grow: 0, color: 'rgba(212,175,55,', alpha: 1, type: 'casing',
      rotation: rand(0, 6), rotSpeed: rand(-12, 12), gravity: 500, drag: 0.6, glow: false,
    });
    // ground scorch puff
    this.trauma = Math.min(1, this.trauma + (big ? 0.25 : 0.12));
  }

  updateShells(dt: number) {
    for (const s of this.shells) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.trail.push({ x: s.x, y: s.y, a: 1 });
      if (s.trail.length > 10) s.trail.shift();
      for (const tr of s.trail) tr.a -= dt * 3;
      // tracer glow particle occasionally
      if (Math.random() < 0.6) {
        this.addParticle({
          x: s.x, y: s.y, vx: rand(-20, 20), vy: rand(-20, 20),
          life: 0.18, maxLife: 0.18, size: s.big ? 7 : 4.5, grow: -8,
          color: s.big ? 'rgba(255,150,60,' : 'rgba(255,230,170,', alpha: 0.9, type: 'tracer',
          rotation: 0, rotSpeed: 0, gravity: 0, drag: 0, glow: true,
        });
      }
      // world bounds -> explode
      if (s.x < 16 || s.x > WORLD_W - 16 || s.y < 16 || s.y > WORLD_H - 16) {
        s.life = 0;
        this.explode(s.x, s.y, s.owner, s.big ? 1.5 : 1);
        continue;
      }
      // wall collision
      let hitWall: WallState | null = null;
      for (const wl of this.walls) {
        if (wl.destroyed) continue;
        if (s.x > wl.x - 3 && s.x < wl.x + wl.w + 3 && s.y > wl.y - 3 && s.y < wl.y + wl.h + 3) { hitWall = wl; break; }
      }
      if (hitWall) {
        if (s.bounces < 1 && !s.big) {
          // bounce: determine side
          s.bounces++;
          const wl = hitWall;
          const left = Math.abs(s.x - wl.x), right = Math.abs(s.x - (wl.x + wl.w));
          const top = Math.abs(s.y - wl.y), bot = Math.abs(s.y - (wl.y + wl.h));
          const m = Math.min(left, right, top, bot);
          if (m === left || m === right) s.vx *= -1; else s.vy *= -1;
          s.x += (s.vx * 0.01); s.y += (s.vy * 0.01);
          s.angle = Math.atan2(s.vy, s.vx);
          s.vx *= 0.75; s.vy *= 0.75;
          gameAudio.ricochet();
          this.sparks(s.x, s.y, 10);
          this.damageWall(wl, 1, s.owner);
        } else {
          s.life = 0;
          this.damageWall(hitWall, s.big ? 3 : 2, s.owner);
          this.explode(s.x, s.y, s.owner, s.big ? 1.5 : 1);
        }
        continue;
      }
      // tank collision
      for (const t of this.tanks) {
        if (!t.alive) continue;
        if (t.id === s.owner && s.life > 1.9) continue; // spawn grace vs self
        const d = dist(s.x, s.y, t.x, t.y);
        if (d < 27) {
          s.life = 0;
          this.explode(s.x, s.y, s.owner, s.big ? 1.5 : 1, t);
          break;
        }
      }
    }
    this.shells = this.shells.filter(s => s.life > 0);
  }

  damageWall(wl: WallState, dmg: number, _owner: number) {
    void _owner;
    wl.hp -= dmg;
    wl.shake = 0.3;
    // debris chips
    for (let i = 0; i < 6; i++) {
      this.addParticle({
        x: clamp(rand(wl.x, wl.x + wl.w), 0, WORLD_W), y: clamp(rand(wl.y, wl.y + wl.h), 0, WORLD_H),
        vx: rand(-160, 160), vy: rand(-220, -20),
        life: rand(0.4, 0.9), maxLife: 0.9, size: rand(2, 5), grow: 0,
        color: wl.type === 'crate' ? 'rgba(150,110,70,' : wl.type === 'brick' ? 'rgba(150,70,55,' : 'rgba(140,140,145,',
        alpha: 1, type: 'debris', rotation: rand(0, 6), rotSpeed: rand(-10, 10), gravity: 600, drag: 0.5, glow: false,
      });
    }
    if (wl.hp <= 0 && !wl.destroyed) {
      wl.destroyed = true;
      gameAudio.wallBreak();
      this.addText(wl.x + wl.w / 2, wl.y, '+Zniszczono', '#e5e5e5', 15);
      // rubble on ground
      const g = this.gctx;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath();
      g.ellipse(wl.x + wl.w / 2, wl.y + wl.h / 2, wl.w / 2 + 8, wl.h / 2 + 8, 0, 0, 7);
      g.fill();
      for (let i = 0; i < 14; i++) {
        g.fillStyle = wl.type === 'crate' ? '#7a5a38' : wl.type === 'brick' ? '#8a4a3c' : '#55555c';
        g.save();
        g.translate(rand(wl.x - 6, wl.x + wl.w + 6), rand(wl.y - 6, wl.y + wl.h + 6));
        g.rotate(rand(0, 6));
        g.fillRect(-rand(2, 7), -rand(2, 7), rand(4, 14), rand(4, 12));
        g.restore();
      }
      this.trauma = Math.min(1, this.trauma + 0.15);
    }
  }

  explode(x: number, y: number, owner: number, power = 1, directHit?: TankState) {
    this.stats.explosions++;
    const big = power > 1.2;
    gameAudio.explosion(big);
    this.trauma = Math.min(1, this.trauma + (big ? 0.5 : 0.3));
    this.slowMo = Math.max(this.slowMo, 0.25);
    this.addLight(x, y, (big ? 420 : 300) * power, '255,170,80', 1, 0.4, true);
    this.addLight(x, y, 160 * power, '255,240,200', 1, 0.15, false);

    // flash
    this.addParticle({ x, y, vx: 0, vy: 0, life: 0.12, maxLife: 0.12, size: 60 * power, grow: 200, color: 'rgba(255,240,200,', alpha: 1, type: 'flash', rotation: 0, rotSpeed: 0, gravity: 0, drag: 0, glow: true });
    // shockwave ring
    this.addParticle({ x, y, vx: 0, vy: 0, life: 0.45, maxLife: 0.45, size: 20, grow: 700 * power, color: 'rgba(255,220,180,', alpha: 0.9, type: 'ring', rotation: 0, rotSpeed: 0, gravity: 0, drag: 0, glow: true });
    // fire
    const nFire = big ? 26 : 16;
    for (let i = 0; i < nFire; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(40, 340) * power;
      this.addParticle({
        x: x + rand(-8, 8), y: y + rand(-8, 8),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: rand(0.3, 0.9), maxLife: 0.9, size: rand(8, 20) * power, grow: -12,
        color: Math.random() < 0.5 ? 'rgba(255,140,40,' : 'rgba(255,210,90,', color2: 'rgba(200,50,20,',
        alpha: 1, type: 'fire', rotation: rand(0, 6), rotSpeed: rand(-6, 6), gravity: -60, drag: 2.2, glow: true,
      });
    }
    // smoke column
    for (let i = 0; i < (big ? 16 : 10); i++) {
      this.addParticle({
        x: x + rand(-16, 16), y: y + rand(-16, 16),
        vx: rand(-60, 60), vy: rand(-140, -30),
        life: rand(1.2, 2.6), maxLife: 2.6, size: rand(10, 22), grow: 22,
        color: 'rgba(45,45,48,', alpha: 0.75, type: 'smoke', rotation: rand(0, 6), rotSpeed: rand(-2, 2), gravity: -40, drag: 1.2, glow: false,
      });
    }
    // sparks
    this.sparks(x, y, big ? 30 : 18);
    // debris
    for (let i = 0; i < (big ? 14 : 8); i++) {
      const a = rand(0, Math.PI * 2), sp = rand(150, 500);
      this.addParticle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 200,
        life: rand(0.6, 1.4), maxLife: 1.4, size: rand(2, 6), grow: 0,
        color: 'rgba(40,38,35,', alpha: 1, type: 'debris', rotation: rand(0, 6), rotSpeed: rand(-14, 14), gravity: 700, drag: 0.4, glow: false,
      });
    }
    // crater decal
    const g = this.gctx;
    const cr = rand(26, 38) * power;
    const cg = g.createRadialGradient(x, y, 2, x, y, cr);
    cg.addColorStop(0, 'rgba(10,8,6,0.85)');
    cg.addColorStop(0.6, 'rgba(20,16,12,0.6)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg;
    g.beginPath(); g.arc(x, y, cr, 0, 7); g.fill();
    // scorch rim
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 5;
    g.beginPath(); g.arc(x, y, cr * 0.85, 0, 7); g.stroke();

    // damage tanks (splash)
    const radius = (big ? 150 : 110) * power;
    for (const t of this.tanks) {
      if (!t.alive) continue;
      const d = dist(x, y, t.x, t.y);
      if (d < radius) {
        const isDirect = directHit?.id === t.id;
        const dmg = isDirect ? (big ? 60 : 40) : lerp(big ? 45 : 30, 5, d / radius);
        // knockback
        const nx = (t.x - x) / (d || 1), ny = (t.y - y) / (d || 1);
        t.vx += nx * (big ? 420 : 280) * (1 - d / radius + 0.3);
        t.vy += ny * (big ? 420 : 280) * (1 - d / radius + 0.3);
        this.damageTank(t, dmg, owner, isDirect);
      }
    }
    // damage walls
    for (const wl of this.walls) {
      if (wl.destroyed) continue;
      const cx = clamp(x, wl.x, wl.x + wl.w), cy = clamp(y, wl.y, wl.y + wl.h);
      if (dist(x, y, cx, cy) < radius * 0.9) this.damageWall(wl, big ? 2 : 1, owner);
    }
  }

  sparks(x: number, y: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(150, 650);
      this.addParticle({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(0.2, 0.6), maxLife: 0.6, size: rand(1.5, 3), grow: 0,
        color: 'rgba(255,210,120,', alpha: 1, type: 'spark', rotation: 0, rotSpeed: 0, gravity: 300, drag: 1.2, glow: true,
      });
    }
  }

  damageTank(t: TankState, dmg: number, attackerId: number, direct: boolean) {
    if (!t.alive || this.gameOver) return;
    if (t.spawnShield > 0 || t.shield > 0) {
      if (t.shield > 0) { gameAudio.shieldHit(); this.opts.onPadFx?.(t.id, 'shield'); }
      this.addParticle({ x: t.x, y: t.y, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, size: 30, grow: 200, color: 'rgba(100,200,255,', alpha: 0.8, type: 'ring', rotation: 0, rotSpeed: 0, gravity: 0, drag: 0, glow: true });
      return;
    }
    // friendly self damage reduced
    if (attackerId === t.id) dmg *= 0.5;
    t.hp -= dmg;
    gameAudio.hitMetal();
    this.opts.onPadFx?.(t.id, 'hit');
    this.sparks(t.x + rand(-10, 10), t.y + rand(-10, 10), direct ? 14 : 6);
    if (t.hp <= 0) {
      t.hp = 0;
      this.killTank(t, attackerId);
    } else if (direct) {
      this.addText(t.x, t.y - 44, `-${Math.round(dmg)}`, '#fca5a5', 18);
    }
  }

  killTank(t: TankState, killerId: number) {
    t.alive = false;
    t.deaths++;
    if (this.opts.mode === 'survival') t.lives = Math.max(0, t.lives - 1);
    // big wreck explosion
    this.stats.explosions++;
    gameAudio.explosion(true);
    this.trauma = Math.min(1, this.trauma + 0.6);
    this.slowMo = Math.max(this.slowMo, 0.7);
    this.addLight(t.x, t.y, 480, '255,150,60', 1, 0.6, true);
    for (let i = 0; i < 30; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(60, 420);
      this.addParticle({
        x: t.x + rand(-12, 12), y: t.y + rand(-12, 12),
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
        life: rand(0.4, 1.2), maxLife: 1.2, size: rand(8, 22), grow: -10,
        color: 'rgba(255,150,50,', color2: 'rgba(180,40,15,', alpha: 1, type: 'fire',
        rotation: rand(0, 6), rotSpeed: rand(-6, 6), gravity: -50, drag: 2, glow: true,
      });
    }
    for (let i = 0; i < 18; i++) {
      this.addParticle({
        x: t.x + rand(-14, 14), y: t.y + rand(-14, 14),
        vx: rand(-80, 80), vy: rand(-180, -40),
        life: rand(1.5, 3.2), maxLife: 3.2, size: rand(12, 26), grow: 18,
        color: 'rgba(30,30,32,', alpha: 0.8, type: 'smoke', rotation: rand(0, 6), rotSpeed: rand(-2, 2), gravity: -35, drag: 1.1, glow: false,
      });
    }
    this.sparks(t.x, t.y, 40);
    this.addParticle({ x: t.x, y: t.y, vx: 0, vy: 0, life: 0.5, maxLife: 0.5, size: 24, grow: 900, color: 'rgba(255,220,180,', alpha: 1, type: 'ring', rotation: 0, rotSpeed: 0, gravity: 0, drag: 0, glow: true });
    // wreck decal on ground
    const g = this.gctx;
    const cg = g.createRadialGradient(t.x, t.y, 4, t.x, t.y, 60);
    cg.addColorStop(0, 'rgba(5,5,5,0.9)'); cg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = cg;
    g.beginPath(); g.arc(t.x, t.y, 60, 0, 7); g.fill();
    g.save();
    g.translate(t.x, t.y); g.rotate(t.hullAngle);
    g.fillStyle = 'rgba(20,18,16,0.85)';
    g.fillRect(-26, -16, 52, 32);
    g.fillStyle = 'rgba(60,50,40,0.6)';
    g.fillRect(-20, -12, 40, 24);
    g.restore();

    const killer = this.tanks.find(k => k.id === killerId);
    const suicide = killerId === t.id;
    this.opts.onPadFx?.(t.id, 'dead');
    if (killer && !suicide) {
      killer.kills++;
      this.opts.onPadFx?.(killer.id, 'kill');
      this.addText(t.x, t.y - 70, `${killer.cfg.name} +1`, killer.cfg.color, 22);
    } else if (suicide) {
      this.addText(t.x, t.y - 70, 'SAMOZNISZCZENIE!', '#f87171', 20);
    }
    const ev: KillEvent = {
      killer: killerId, victim: t.id,
      killerName: suicide ? '—' : (killer?.cfg.name ?? '?'),
      victimName: t.cfg.name, time: this.elapsed, id: this.killId++,
    };
    this.killFeed.push(ev);
    if (this.killFeed.length > 12) this.killFeed.shift();
    this.opts.onKill(ev);

    // deathmatch win check
    if (this.opts.mode === 'deathmatch' && killer && !suicide && killer.kills >= this.opts.killLimit) {
      this.endGame(killer.id);
      return;
    }
    // respawn timer
    if (this.opts.mode === 'deathmatch') t.respawnTimer = 3;
    else if (t.lives > 0) t.respawnTimer = 3;

    gameAudio.updateEngine(t.id, 0, false);
  }

  respawn(t: TankState) {
    // pick spawn farthest from enemies
    let bestSpawn = this.map.spawns[0], bd = -1;
    for (const s of this.map.spawns) {
      let md = 1e9;
      for (const o of this.tanks) {
        if (o.id === t.id || !o.alive) continue;
        md = Math.min(md, dist(s.x, s.y, o.x, o.y));
      }
      if (md > bd) { bd = md; bestSpawn = s; }
    }
    t.x = bestSpawn.x + rand(-20, 20); t.y = bestSpawn.y + rand(-20, 20);
    t.vx = 0; t.vy = 0;
    t.hullAngle = bestSpawn.angle; t.turretAngle = bestSpawn.angle;
    t.aimHoldUntil = 0; t.aiming = false;
    t.hp = t.maxHp; t.alive = true; t.spawnShield = 2.5;
    t.rapidUntil = 0; t.bigUntil = 0; t.speedUntil = 0; t.shield = 0;
    this.addLight(t.x, t.y, 200, '150,220,255', 0.8, 0.5, false);
    this.addText(t.x, t.y - 50, 'POWRÓT DO WALKI', t.cfg.color, 18);
    this.opts.onPadFx?.(t.id, 'respawn');
  }

  endGame(winnerByKill: number | null) {
    if (this.gameOver) return;
    // if time out -> highest kills
    let winner = winnerByKill;
    if (winner === null) {
      let bk = -1;
      for (const t of this.tanks) {
        if (t.kills > bk) { bk = t.kills; winner = t.id; }
        else if (t.kills === bk) winner = null; // draw stays null? keep first... actually draw
      }
      // survival timeout: most lives then kills
      if (this.opts.mode === 'survival') {
        let bl = -1; bk = -1; winner = null;
        for (const t of this.tanks) {
          const score = t.lives * 100 + t.kills;
          if (score > bl * 100 + bk) { bl = t.lives; bk = t.kills; winner = t.id; }
        }
      }
    }
    this.gameOver = true;
    this.finished = true;
    const tanks: HudTank[] = this.tanks.map(t => ({
      id: t.id, name: t.cfg.name + (t.cfg.isBot ? ' (BOT)' : ''), color: t.cfg.color,
      hp: Math.max(0, Math.round(t.hp)), maxHp: t.maxHp, alive: t.alive,
      kills: t.kills, deaths: t.deaths, lives: t.lives, shield: 0, isBot: t.cfg.isBot, respawn: 0,
      rapid: false, big: false, speed: false,
    }));
    // celebratory fireworks at winner
    if (winner !== null) {
      const w = this.tanks.find(t => t.id === winner);
      if (w) for (let i = 0; i < 5; i++) {
        setTimeout(() => {
          this.addLight(w.x + rand(-100, 100), w.y + rand(-100, 100), 300, '255,220,150', 1, 0.4, true);
          this.sparks(w.x + rand(-120, 120), w.y + rand(-120, 120), 24);
          gameAudio.explosion(false);
        }, i * 300);
      }
    }
    setTimeout(() => this.opts.onGameOver(winner, tanks), 1600);
  }

  spawnPowerup() {
    const kinds: PowerUpState['kind'][] = ['repair', 'shield', 'rapid', 'big', 'speed'];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    for (let tries = 0; tries < 20; tries++) {
      const x = rand(100, WORLD_W - 100), y = rand(100, WORLD_H - 100);
      if (this.pointInWall(x, y)) continue;
      let nearTank = false;
      for (const t of this.tanks) if (t.alive && dist(x, y, t.x, t.y) < 60) nearTank = true;
      if (nearTank) continue;
      this.powerups.push({ x, y, kind, life: 25, bob: rand(0, 6), taken: false });
      this.addLight(x, y, 120, '150,255,170', 0.7, 0.8, false);
      return;
    }
  }

  applyPowerup(t: TankState, p: PowerUpState) {
    gameAudio.pickup();
    this.addLight(p.x, p.y, 200, '150,255,170', 1, 0.5, false);
    const labels: Record<string, string> = {
      repair: '+50 PANCERZ', shield: 'TARCZA 10s', rapid: 'SZYBKOSTRZELNOŚĆ', big: 'CIĘŻKI POCISK', speed: 'TURBO 12s',
    };
    this.addText(t.x, t.y - 56, labels[p.kind], '#86efac', 19);
    this.opts.onPadFx?.(t.id, 'pickup');
    for (let i = 0; i < 16; i++) {
      const a = rand(0, Math.PI * 2);
      this.addParticle({
        x: p.x, y: p.y, vx: Math.cos(a) * rand(60, 200), vy: Math.sin(a) * rand(60, 200) - 60,
        life: 0.6, maxLife: 0.6, size: rand(2, 5), grow: 0,
        color: 'rgba(150,255,170,', alpha: 1, type: 'spark', rotation: 0, rotSpeed: 0, gravity: 100, drag: 1, glow: true,
      });
    }
    if (p.kind === 'repair') t.hp = Math.min(t.maxHp, t.hp + 50);
    if (p.kind === 'shield') t.shield = 10;
    if (p.kind === 'rapid') t.rapidUntil = this.elapsed + 12;
    if (p.kind === 'big') t.bigUntil = this.elapsed + 12;
    if (p.kind === 'speed') t.speedUntil = this.elapsed + 12;
  }

  updatePowerups(dt: number) {
    for (const p of this.powerups) { p.life -= dt; p.bob += dt * 3; }
    this.powerups = this.powerups.filter(p => !p.taken && p.life > 0);
  }

  updateParticles(dt: number) {
    for (const p of this.particles) {
      p.life -= dt;
      p.vx -= p.vx * Math.min(1, p.drag * dt);
      p.vy -= p.vy * Math.min(1, p.drag * dt);
      p.vy += p.gravity * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      p.rotation += p.rotSpeed * dt;
      if (p.size < 0) p.size = 0;
    }
    this.particles = this.particles.filter(p => p.life > 0 && p.size >= 0.2);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);
  }

  updateLights(dt: number) {
    for (const l of this.lights) l.life -= dt;
    this.lights = this.lights.filter(l => l.life > 0);
  }

  updateWeather(dt: number) {
    if (this.map.weather === 'rain') {
      for (const r of this.rain) {
        r.y += r.s * dt;
        r.x += r.s * 0.18 * dt;
        if (r.y > WORLD_H) { r.y = -20; r.x = rand(0, WORLD_W); }
      }
    } else if (this.map.weather === 'dust') {
      for (const d of this.dust) {
        d.x += d.v * dt;
        if (d.x - d.s > WORLD_W) { d.x = -d.s; d.y = rand(0, WORLD_H); }
      }
    }
  }

  addParticle(p: Particle) { this.particles.push(p); }
  addLight(x: number, y: number, radius: number, color: string, intensity: number, life: number, flicker: boolean) {
    this.lights.push({ x, y, radius, color, intensity, life, maxLife: life, flicker });
    if (this.lights.length > 60) this.lights.shift();
  }
  addText(x: number, y: number, text: string, color: string, size: number) {
    this.texts.push({ x, y, text, life: 1.6, maxLife: 1.6, color, size });
  }

  drawTrackMarks(t: TankState) {
    const g = this.gctx;
    const px = Math.cos(t.hullAngle + Math.PI / 2), py = Math.sin(t.hullAngle + Math.PI / 2);
    g.fillStyle = this.map.id === 'nightcity' ? 'rgba(0,0,0,0.22)' : 'rgba(30,22,14,0.20)';
    for (const s of [-13, 13]) {
      g.save();
      g.translate(t.x + px * s, t.y + py * s);
      g.rotate(t.hullAngle);
      g.fillRect(-7, -3.5, 14, 7);
      g.restore();
    }
  }

  // ================= RENDER =================
  render(rdt: number) {
    void rdt;
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    // shake
    const sh = this.trauma * this.trauma * 22 * this.dpr;
    const sx = rand(-sh, sh), sy = rand(-sh, sh);
    ctx.setTransform(this.viewScale, 0, 0, this.viewScale, this.viewX + sx * this.viewScale / this.dpr, this.viewY + sy * this.viewScale / this.dpr);

    // ground
    ctx.drawImage(this.ground, 0, 0);

    // powerups
    for (const p of this.powerups) this.drawPowerup(p);

    // walls
    for (const wl of this.walls) if (!wl.destroyed) this.drawWall(wl);

    // shells (under tanks? no, over)
    for (const t of this.tanks) if (t.alive) this.drawTankShadow(t);
    for (const t of this.tanks) if (t.alive && t.aiming) this.drawAimLine(t);
    for (const t of this.tanks) if (t.alive) this.drawTank(t);

    for (const s of this.shells) this.drawShell(s);

    // particles (sorted: smoke under, fire over)
    for (const p of this.particles) if (!p.glow) this.drawParticle(p);
    for (const p of this.particles) if (p.glow) this.drawParticle(p);

    // lighting
    this.renderLighting();

    // weather overlay
    this.renderWeather();

    // dust storm overlay
    if (this.map.weather === 'dust') {
      ctx.save();
      ctx.globalAlpha = 0.5;
      for (const d of this.dust) {
        const g = ctx.createRadialGradient(d.x, d.y, 4, d.x, d.y, d.s / 2);
        g.addColorStop(0, `rgba(210,180,130,${d.a})`);
        g.addColorStop(1, 'rgba(210,180,130,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(d.x, d.y, d.s / 2, 0, 7); ctx.fill();
      }
      ctx.restore();
    }

    // texts
    for (const t of this.texts) {
      const a = clamp(t.life / t.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `700 ${t.size}px "Chakra Petch", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
      ctx.strokeText(t.text, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y);
      ctx.restore();
    }

    // countdown big overlay
    if (this.countdown > 0 && !this.gameOver) {
      const n = Math.ceil(this.countdown - 0.6);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = '400 150px "Black Ops One", sans-serif';
      ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      const label = n > 3 ? 'GOTOWI?' : n <= 0 ? 'START' : String(n);
      ctx.strokeText(label, WORLD_W / 2, WORLD_H / 2 + 40);
      const grad = ctx.createLinearGradient(0, WORLD_H / 2 - 100, 0, WORLD_H / 2 + 60);
      grad.addColorStop(0, '#fde68a'); grad.addColorStop(1, '#f59e0b');
      ctx.fillStyle = grad;
      ctx.fillText(label, WORLD_W / 2, WORLD_H / 2 + 40);
      ctx.restore();
    }
  }

  renderLighting() {
    const ctx = this.ctx;
    if (this.map.night) {
      // darkness layer
      this.lctx.setTransform(1, 0, 0, 1, 0, 0);
      this.lctx.clearRect(0, 0, WORLD_W, WORLD_H);
      this.lctx.fillStyle = 'rgba(4,6,18,0.78)';
      this.lctx.fillRect(0, 0, WORLD_W, WORLD_H);
      this.lctx.globalCompositeOperation = 'destination-out';
      // ambient lights around arena (street lamps)
      const lamps = [[200, 200], [1400, 200], [200, 800], [1400, 800], [800, 500], [420, 500], [1180, 500]];
      for (const [lx, ly] of lamps) {
        const g = this.lctx.createRadialGradient(lx, ly, 10, lx, ly, 190);
        g.addColorStop(0, 'rgba(255,255,255,0.55)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        this.lctx.fillStyle = g;
        this.lctx.beginPath(); this.lctx.arc(lx, ly, 190, 0, 7); this.lctx.fill();
      }
      // tank headlights (cones)
      for (const t of this.tanks) {
        if (!t.alive) continue;
        this.lctx.save();
        this.lctx.translate(t.x, t.y);
        this.lctx.rotate(t.hullAngle);
        const hg = this.lctx.createRadialGradient(0, 0, 20, 160, 0, 260);
        hg.addColorStop(0, 'rgba(255,255,255,0.75)');
        hg.addColorStop(1, 'rgba(255,255,255,0)');
        this.lctx.fillStyle = hg;
        this.lctx.beginPath();
        this.lctx.moveTo(0, 0);
        this.lctx.arc(0, 0, 260, -0.42, 0.42);
        this.lctx.closePath();
        this.lctx.fill();
        // small radius around tank
        const tg = this.lctx.createRadialGradient(0, 0, 5, 0, 0, 120);
        tg.addColorStop(0, 'rgba(255,255,255,0.5)');
        tg.addColorStop(1, 'rgba(255,255,255,0)');
        this.lctx.fillStyle = tg;
        this.lctx.beginPath(); this.lctx.arc(0, 0, 120, 0, 7); this.lctx.fill();
        this.lctx.restore();
      }
      // dynamic lights (explosions etc.)
      for (const l of this.lights) {
        const k = l.life / l.maxLife;
        let r = l.radius * (0.6 + 0.4 * k);
        if (l.flicker) r *= 0.9 + Math.random() * 0.2;
        const g = this.lctx.createRadialGradient(l.x, l.y, 8, l.x, l.y, r);
        g.addColorStop(0, `rgba(255,255,255,${0.95 * l.intensity})`);
        g.addColorStop(1, 'rgba(255,255,255,0)');
        this.lctx.fillStyle = g;
        this.lctx.beginPath(); this.lctx.arc(l.x, l.y, r, 0, 7); this.lctx.fill();
      }
      // powerups glow
      for (const p of this.powerups) {
        const g = this.lctx.createRadialGradient(p.x, p.y, 5, p.x, p.y, 110);
        g.addColorStop(0, 'rgba(255,255,255,0.5)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        this.lctx.fillStyle = g;
        this.lctx.beginPath(); this.lctx.arc(p.x, p.y, 110, 0, 7); this.lctx.fill();
      }
      this.lctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(this.lightCanvas, 0, 0);
      // additive warm glow on top
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of this.lights) {
        const k = l.life / l.maxLife;
        let r = l.radius * (0.6 + 0.4 * k);
        if (l.flicker) r *= 0.9 + Math.random() * 0.2;
        const g = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, r);
        g.addColorStop(0, `rgba(${l.color},${0.35 * k * l.intensity})`);
        g.addColorStop(1, `rgba(${l.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, 7); ctx.fill();
      }
      ctx.restore();
    } else {
      // day: subtle additive glows
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const l of this.lights) {
        const k = l.life / l.maxLife;
        const r = l.radius * (0.6 + 0.4 * k);
        const g = ctx.createRadialGradient(l.x, l.y, 4, l.x, l.y, r);
        g.addColorStop(0, `rgba(${l.color},${0.28 * k * l.intensity})`);
        g.addColorStop(1, `rgba(${l.color},0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(l.x, l.y, r, 0, 7); ctx.fill();
      }
      ctx.restore();
    }
  }

  renderWeather() {
    const ctx = this.ctx;
    if (this.map.weather === 'rain') {
      ctx.save();
      ctx.strokeStyle = this.map.night ? 'rgba(150,190,255,0.35)' : 'rgba(180,210,235,0.4)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (const r of this.rain) {
        ctx.moveTo(r.x, r.y);
        ctx.lineTo(r.x - 6, r.y - 22);
      }
      ctx.stroke();
      ctx.restore();
      // occasional splash
      if (Math.random() < 0.3) {
        const x = rand(0, WORLD_W), y = rand(0, WORLD_H);
        this.addParticle({
          x, y, vx: 0, vy: 0, life: 0.25, maxLife: 0.25, size: 2, grow: 40,
          color: 'rgba(180,210,235,', alpha: 0.4, type: 'ring', rotation: 0, rotSpeed: 0, gravity: 0, drag: 0, glow: false,
        });
      }
    }
  }

  drawParticle(p: Particle) {
    const ctx = this.ctx;
    const k = clamp(p.life / p.maxLife, 0, 1);
    ctx.save();
    ctx.globalAlpha = clamp(p.alpha * (p.type === 'ring' ? k : p.type === 'flash' ? k : Math.min(1, k * 2)), 0, 1);
    if (p.type === 'ring') {
      ctx.strokeStyle = `${p.color}${(p.alpha * k).toFixed(3)})`;
      ctx.lineWidth = 4 * k + 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(1, p.size), 0, 7); ctx.stroke();
    } else if (p.type === 'spark' || p.type === 'tracer' || p.type === 'casing') {
      if (p.type === 'spark' || p.type === 'tracer') {
        ctx.strokeStyle = `${p.color}1)`;
        ctx.lineWidth = p.type === 'tracer' ? 3.5 : 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
        if (p.glow) {
          ctx.fillStyle = `${p.color}0.9)`;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 0.6, 0, 7); ctx.fill();
        }
      } else {
        ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
        ctx.fillStyle = '#d4af37';
        ctx.fillRect(-4, -1.5, 8, 3);
        ctx.fillStyle = '#8a7020';
        ctx.fillRect(2, -1.5, 2, 3);
      }
    } else if (p.type === 'debris') {
      ctx.translate(p.x, p.y); ctx.rotate(p.rotation);
      ctx.fillStyle = `${p.color}1)`;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
    } else if (p.type === 'fire' || p.type === 'flash') {
      const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, Math.max(2, p.size));
      g.addColorStop(0, 'rgba(255,245,210,0.95)');
      g.addColorStop(0.35, `${p.color}0.85)`);
      g.addColorStop(1, `${p.color2 ?? p.color}0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, p.size), 0, 7); ctx.fill();
    } else {
      // smoke / dust: soft blob
      const g = ctx.createRadialGradient(p.x, p.y, 1, p.x, p.y, Math.max(2, p.size));
      g.addColorStop(0, `${p.color}${(p.alpha * k).toFixed(3)})`);
      g.addColorStop(1, `${p.color}0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(2, p.size), 0, 7); ctx.fill();
    }
    ctx.restore();
  }

  drawWall(wl: WallState) {
    const ctx = this.ctx;
    const dmg = 1 - wl.hp / wl.maxHp;
    ctx.save();
    if (wl.shake > 0) {
      wl.shake -= 0.016;
      ctx.translate(rand(-2, 2), rand(-2, 2));
    }
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(wl.x + 5, wl.y + 7, wl.w, wl.h);
    if (wl.type === 'concrete') {
      const g = ctx.createLinearGradient(wl.x, wl.y, wl.x, wl.y + wl.h);
      g.addColorStop(0, '#8f8f96'); g.addColorStop(0.5, '#73737a'); g.addColorStop(1, '#55555c');
      ctx.fillStyle = g;
      ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(wl.x, wl.y, wl.w, 4);
      // panel lines
      ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 2;
      if (wl.w > wl.h) {
        const n = Math.floor(wl.w / 50);
        for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(wl.x + i * wl.w / n, wl.y); ctx.lineTo(wl.x + i * wl.w / n, wl.y + wl.h); ctx.stroke(); }
      } else {
        const n = Math.floor(wl.h / 50);
        for (let i = 1; i < n; i++) { ctx.beginPath(); ctx.moveTo(wl.x, wl.y + i * wl.h / n); ctx.lineTo(wl.x + wl.w, wl.y + i * wl.h / n); ctx.stroke(); }
      }
    } else if (wl.type === 'crate') {
      const g = ctx.createLinearGradient(wl.x, wl.y, wl.x + wl.w, wl.y + wl.h);
      g.addColorStop(0, '#a97e4c'); g.addColorStop(1, '#7a5a34');
      ctx.fillStyle = g;
      ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
      ctx.strokeStyle = '#5a4126'; ctx.lineWidth = 3;
      ctx.strokeRect(wl.x + 1.5, wl.y + 1.5, wl.w - 3, wl.h - 3);
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(wl.x, wl.y); ctx.lineTo(wl.x + wl.w, wl.y + wl.h);
      ctx.moveTo(wl.x + wl.w, wl.y); ctx.lineTo(wl.x, wl.y + wl.h);
      ctx.stroke();
      // planks
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.lineWidth = 1.5;
      for (let i = 1; i < 4; i++) { ctx.beginPath(); ctx.moveTo(wl.x, wl.y + wl.h * i / 4); ctx.lineTo(wl.x + wl.w, wl.y + wl.h * i / 4); ctx.stroke(); }
    } else if (wl.type === 'metal') {
      const g = ctx.createLinearGradient(wl.x, wl.y, wl.x, wl.y + wl.h);
      if (this.map.night) { g.addColorStop(0, '#3b5a78'); g.addColorStop(1, '#22374d'); }
      else { g.addColorStop(0, '#6b7d8c'); g.addColorStop(1, '#46525d'); }
      ctx.fillStyle = g;
      ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
      // ribs
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      const horiz = wl.w > wl.h;
      const n = Math.floor((horiz ? wl.w : wl.h) / 18);
      for (let i = 0; i < n; i++) {
        if (horiz) ctx.fillRect(wl.x + i * 18 + 6, wl.y + 3, 5, wl.h - 6);
        else ctx.fillRect(wl.x + 3, wl.y + i * 18 + 6, wl.w - 6, 5);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(wl.x, wl.y, wl.w, 3);
      // rust spots
      ctx.fillStyle = 'rgba(120,60,30,0.4)';
      ctx.beginPath(); ctx.arc(wl.x + wl.w * 0.2, wl.y + wl.h * 0.7, 5, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(wl.x + wl.w * 0.75, wl.y + wl.h * 0.3, 7, 0, 7); ctx.fill();
    } else if (wl.type === 'sandbag') {
      ctx.fillStyle = '#9a8a66';
      ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
      // bag rows
      const rows = Math.max(2, Math.floor(wl.h / 16));
      for (let r = 0; r < rows; r++) {
        const y = wl.y + r * (wl.h / rows);
        const off = r % 2 ? 14 : 0;
        for (let x = wl.x - 28 + off; x < wl.x + wl.w; x += 28) {
          const bx = clamp(x, wl.x, wl.x + wl.w - 26);
          ctx.fillStyle = r % 2 ? '#a3906c' : '#93835f';
          ctx.beginPath(); ctx.ellipse(bx + 13, y + wl.h / rows / 2, 14, wl.h / rows / 2 - 1, 0, 0, 7); ctx.fill();
          ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.lineWidth = 1; ctx.stroke();
        }
      }
    } else {
      // brick
      ctx.fillStyle = '#8a4a3c';
      ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
      ctx.fillStyle = '#a05a48';
      const bh = 12;
      for (let y = wl.y; y < wl.y + wl.h; y += bh) {
        const off = (Math.floor((y - wl.y) / bh) % 2) * 15;
        for (let x = wl.x - 30 + off; x < wl.x + wl.w; x += 30) {
          ctx.fillRect(x + 1, y + 1, 28, bh - 2);
        }
      }
    }
    // damage overlay: cracks
    if (dmg > 0.05) {
      ctx.strokeStyle = `rgba(0,0,0,${0.25 + dmg * 0.5})`;
      ctx.lineWidth = 1 + dmg * 2;
      ctx.beginPath();
      ctx.moveTo(wl.x + wl.w * 0.3, wl.y);
      ctx.lineTo(wl.x + wl.w * 0.45, wl.y + wl.h * 0.5);
      ctx.lineTo(wl.x + wl.w * 0.35, wl.y + wl.h);
      ctx.moveTo(wl.x + wl.w * 0.7, wl.y);
      ctx.lineTo(wl.x + wl.w * 0.6, wl.y + wl.h);
      ctx.stroke();
      ctx.fillStyle = `rgba(0,0,0,${dmg * 0.3})`;
      ctx.fillRect(wl.x, wl.y, wl.w, wl.h);
    }
    // hp pip for tough walls
    if (wl.maxHp > 1 && wl.hp < wl.maxHp) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(wl.x, wl.y - 8, wl.w, 5);
      ctx.fillStyle = '#fbbf24';
      ctx.fillRect(wl.x, wl.y - 8, wl.w * (wl.hp / wl.maxHp), 5);
    }
    ctx.restore();
  }

  drawTankShadow(t: TankState) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(t.x + 6, t.y + 9);
    ctx.rotate(t.hullAngle);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    const w = 56, h = 40;
    if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, 8); else ctx.rect(-w / 2, -h / 2, w, h);
    ctx.fill();
    ctx.restore();
  }

  /** Przerywana linia celowania dla gracza, który celuje joystickiem na telefonie. */
  drawAimLine(t: TankState) {
    const ctx = this.ctx;
    const a = t.turretAngle;
    const x0 = t.x + Math.cos(a) * 52, y0 = t.y + Math.sin(a) * 52;
    const len = 300;
    ctx.save();
    const g = ctx.createLinearGradient(x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
    g.addColorStop(0, t.cfg.color + 'aa');
    g.addColorStop(1, t.cfg.color + '00');
    ctx.strokeStyle = g;
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 9]);
    ctx.lineDashOffset = -this.elapsed * 40;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(a) * len, y0 + Math.sin(a) * len);
    ctx.stroke();
    ctx.restore();
  }

  drawTank(t: TankState) {
    const ctx = this.ctx;
    const C = t.cfg.color;
    ctx.save();
    ctx.translate(t.x, t.y);

    // shield bubble
    if (t.shield > 0 || t.spawnShield > 0) {
      const pulse = 0.5 + Math.sin(this.elapsed * 8) * 0.15;
      ctx.strokeStyle = t.shield > 0 ? `rgba(100,200,255,${0.7 * pulse + 0.3})` : `rgba(255,255,255,${0.5 * pulse + 0.2})`;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([10, 6]);
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.stroke();
      ctx.setLineDash([]);
      const g = ctx.createRadialGradient(0, 0, 10, 0, 0, 40);
      g.addColorStop(0, 'rgba(100,200,255,0)');
      g.addColorStop(1, `rgba(100,200,255,${0.18 * pulse})`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(0, 0, 40, 0, 7); ctx.fill();
    }

    // ---- hull ----
    ctx.save();
    ctx.rotate(t.hullAngle);
    // tracks
    for (const s of [-1, 1]) {
      const ty = s * 17;
      // track base
      const tg = ctx.createLinearGradient(0, ty - 8, 0, ty + 8);
      tg.addColorStop(0, '#26262a'); tg.addColorStop(0.5, '#3a3a40'); tg.addColorStop(1, '#1c1c20');
      ctx.fillStyle = tg;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-28, ty - 8, 56, 16, 7); else ctx.rect(-28, ty - 8, 56, 16);
      ctx.fill();
      // treads animated
      ctx.save();
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-28, ty - 8, 56, 16, 7); else ctx.rect(-28, ty - 8, 56, 16);
      ctx.clip();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 2.5;
      const off = (t.trackPhase * 22) % 9;
      for (let x = -30 - 9 + off; x < 30; x += 9) {
        ctx.beginPath(); ctx.moveTo(x, ty - 8); ctx.lineTo(x, ty + 8); ctx.stroke();
      }
      // wheels
      ctx.fillStyle = '#17171a';
      for (let x = -20; x <= 20; x += 10) {
        ctx.beginPath(); ctx.arc(x, ty, 4.6, 0, 7); ctx.fill();
        ctx.fillStyle = '#4b4b52';
        ctx.beginPath(); ctx.arc(x, ty, 2, 0, 7); ctx.fill();
        ctx.fillStyle = '#17171a';
      }
      ctx.restore();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-28, ty - 8, 56, 16, 7); else ctx.rect(-28, ty - 8, 56, 16);
      ctx.stroke();
    }
    // hull body
    const hullGrad = ctx.createLinearGradient(0, -14, 0, 14);
    hullGrad.addColorStop(0, '#4a4a48');
    hullGrad.addColorStop(0.4, '#3b3b39');
    hullGrad.addColorStop(1, '#262624');
    ctx.fillStyle = hullGrad;
    ctx.beginPath();
    // armored hull shape with sloped front
    ctx.moveTo(-26, -13);
    ctx.lineTo(14, -13);
    ctx.lineTo(28, -8);
    ctx.lineTo(28, 8);
    ctx.lineTo(14, 13);
    ctx.lineTo(-26, 13);
    ctx.quadraticCurveTo(-30, 13, -30, 9);
    ctx.lineTo(-30, -9);
    ctx.quadraticCurveTo(-30, -13, -26, -13);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 1.5; ctx.stroke();
    // top highlight
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.fillRect(-24, -12, 34, 4);
    // camo blobs
    ctx.fillStyle = 'rgba(60,70,50,0.55)';
    ctx.beginPath(); ctx.ellipse(-10, -4, 12, 6, 0.4, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(80,75,60,0.5)';
    ctx.beginPath(); ctx.ellipse(8, 5, 10, 5, -0.3, 0, 7); ctx.fill();
    // front glacis plate + headlights
    ctx.fillStyle = '#33332f';
    ctx.fillRect(22, -9, 5, 18);
    const lightOn = this.map.night;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(24, s * 10 - 2.5, 4, 5);
      ctx.fillStyle = lightOn ? '#fef9c3' : '#57534e';
      ctx.fillRect(24.5, s * 10 - 1.5, 2.5, 3);
      if (lightOn) {
        const hg = ctx.createRadialGradient(28, s * 10, 1, 28, s * 10, 26);
        hg.addColorStop(0, 'rgba(254,249,195,0.7)');
        hg.addColorStop(1, 'rgba(254,249,195,0)');
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(28, s * 10, 26, 0, 7); ctx.fill();
      }
    }
    // rear exhaust
    ctx.fillStyle = '#1c1c1a';
    ctx.fillRect(-30, -8, 4, 6);
    ctx.fillRect(-30, 2, 4, 6);
    // side skirts with player color stripe
    ctx.fillStyle = C;
    ctx.globalAlpha = 0.9;
    ctx.fillRect(-24, -14.5, 36, 2.5);
    ctx.fillRect(-24, 12, 36, 2.5);
    ctx.globalAlpha = 1;
    // tools / boxes on hull
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(-18, -10, 8, 3);
    ctx.fillRect(-18, 7, 8, 3);
    // hatches
    ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 1;
    ctx.strokeRect(-6, -9, 10, 18);
    ctx.restore();

    // ---- turret ----
    ctx.save();
    ctx.rotate(t.turretAngle);
    const rec = t.recoil;
    // barrel shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(8 - rec * 0.6 + 2, -3.5 + 3, 42, 7);
    // barrel
    const barrelW = t.bigUntil > this.elapsed ? 9 : 7;
    const bg = ctx.createLinearGradient(0, -barrelW / 2, 0, barrelW / 2);
    bg.addColorStop(0, '#55554f'); bg.addColorStop(0.5, '#33332f'); bg.addColorStop(1, '#1d1d1b');
    ctx.fillStyle = bg;
    ctx.fillRect(8 - rec * 0.6, -barrelW / 2, 42, barrelW);
    // thermal sleeve rings
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(20 - rec * 0.6, -barrelW / 2 - 1, 3, barrelW + 2);
    ctx.fillRect(32 - rec * 0.6, -barrelW / 2 - 1, 3, barrelW + 2);
    // muzzle brake
    ctx.fillStyle = '#262624';
    ctx.fillRect(46 - rec * 0.6, -barrelW / 2 - 2.5, 9, barrelW + 5);
    ctx.fillStyle = '#0c0c0b';
    ctx.fillRect(53 - rec * 0.6, -barrelW / 2 + 0.5, 2.5, barrelW - 1);
    // muzzle flash sprite
    if (t.muzzle > 0) {
      const m = t.muzzle;
      const fg = ctx.createRadialGradient(58 - rec * 0.6, 0, 2, 58 - rec * 0.6, 0, 34 * m + 10);
      fg.addColorStop(0, `rgba(255,250,220,${0.95 * m})`);
      fg.addColorStop(0.4, `rgba(255,180,80,${0.8 * m})`);
      fg.addColorStop(1, 'rgba(255,120,30,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      // star flash
      ctx.save();
      ctx.translate(60 - rec * 0.6, 0);
      for (let i = 0; i < 6; i++) {
        ctx.rotate(Math.PI / 3);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(34 * m + 8, -6);
        ctx.lineTo(34 * m + 8, 6);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
      ctx.beginPath(); ctx.arc(58 - rec * 0.6, 0, 20 * m + 6, 0, 7); ctx.fill();
    }
    // turret body
    const turGrad = ctx.createLinearGradient(0, -16, 0, 16);
    turGrad.addColorStop(0, '#54544e');
    turGrad.addColorStop(0.5, '#3f3f3b');
    turGrad.addColorStop(1, '#2a2a28');
    ctx.fillStyle = turGrad;
    ctx.beginPath();
    ctx.moveTo(-18, -14);
    ctx.lineTo(6, -16);
    ctx.lineTo(16, -10);
    ctx.lineTo(16, 10);
    ctx.lineTo(6, 16);
    ctx.lineTo(-18, 14);
    ctx.quadraticCurveTo(-24, 14, -24, 8);
    ctx.lineTo(-24, -8);
    ctx.quadraticCurveTo(-24, -14, -18, -14);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1.5; ctx.stroke();
    // turret top detail
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.ellipse(-2, -6, 12, 5, 0, 0, 7); ctx.fill();
    // hatch
    ctx.fillStyle = '#2c2c2a';
    ctx.beginPath(); ctx.ellipse(-10, 2, 6.5, 6.5, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#45453f';
    ctx.beginPath(); ctx.ellipse(-10, 2, 3.5, 3.5, 0, 0, 7); ctx.fill();
    // MG
    ctx.strokeStyle = '#1a1a18'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(-4, -10); ctx.lineTo(10, -13); ctx.stroke();
    // player number + color chevron
    ctx.fillStyle = C;
    ctx.beginPath();
    ctx.moveTo(-22, -4); ctx.lineTo(-14, 0); ctx.lineTo(-22, 4); ctx.closePath();
    ctx.fill();
    // antenna (wobble with speed)
    const wob = Math.sin(this.elapsed * 9 + t.id * 2) * (2 + Math.hypot(t.vx, t.vy) * 0.02);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(-20, -8); ctx.quadraticCurveTo(-26, -22, -24 + wob, -34); ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath(); ctx.arc(-24 + wob, -34, 1.8, 0, 7); ctx.fill();
    // barrel heat glow
    if (t.barrelHeat > 0.8) {
      ctx.fillStyle = `rgba(255,100,30,${(t.barrelHeat - 0.8) * 0.5})`;
      ctx.fillRect(44 - rec * 0.6, -barrelW / 2 - 2.5, 11, barrelW + 5);
    }
    ctx.restore();

    // name + hp bar (unrotated)
    ctx.restore();
    ctx.save();
    ctx.translate(t.x, t.y);
    // hp bar
    const bw = 56;
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-bw / 2, -44, bw, 8, 4); else ctx.rect(-bw / 2, -44, bw, 8);
    ctx.fill();
    const hpk = clamp(t.hp / t.maxHp, 0, 1);
    const hpg = ctx.createLinearGradient(-bw / 2, 0, bw / 2, 0);
    if (hpk > 0.5) { hpg.addColorStop(0, '#22c55e'); hpg.addColorStop(1, '#4ade80'); }
    else if (hpk > 0.25) { hpg.addColorStop(0, '#d97706'); hpg.addColorStop(1, '#fbbf24'); }
    else { hpg.addColorStop(0, '#b91c1c'); hpg.addColorStop(1, '#ef4444'); }
    ctx.fillStyle = hpg;
    if (hpk > 0) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-bw / 2 + 1.5, -42.5, (bw - 3) * hpk, 5, 2.5); else ctx.rect(-bw / 2 + 1.5, -42.5, (bw - 3) * hpk, 5);
      ctx.fill();
    }
    // name
    ctx.font = '700 13px "Chakra Petch", sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    const label = `${t.cfg.name}${t.cfg.isBot ? ' • BOT' : ''}`;
    ctx.strokeText(label, 0, -50);
    ctx.fillStyle = C;
    ctx.fillText(label, 0, -50);
    // active effects pips
    let px = -24;
    const pip = (color: string, txt: string) => {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.beginPath(); ctx.arc(px, 30, 9, 0, 7); ctx.fill();
      ctx.fillStyle = color;
      ctx.font = '800 10px "JetBrains Mono", monospace';
      ctx.fillText(txt, px, 33.5);
      px += 20;
    };
    if (t.rapidUntil > this.elapsed) pip('#fbbf24', 'R');
    if (t.bigUntil > this.elapsed) pip('#f87171', 'B');
    if (t.speedUntil > this.elapsed) pip('#38bdf8', 'S');
    if (t.shield > 0) pip('#67e8f9', '◈');
    ctx.restore();
  }

  drawShell(s: ShellState) {
    const ctx = this.ctx;
    // tracer trail
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < s.trail.length; i++) {
      const tr = s.trail[i];
      const k = (i / s.trail.length) * clamp(tr.a, 0, 1);
      ctx.fillStyle = s.big ? `rgba(255,140,50,${k * 0.5})` : `rgba(255,225,160,${k * 0.45})`;
      ctx.beginPath(); ctx.arc(tr.x, tr.y, (s.big ? 7 : 4.5) * (0.4 + 0.6 * (i / s.trail.length)), 0, 7); ctx.fill();
    }
    ctx.restore();
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle);
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(2, 3, s.big ? 9 : 7, s.big ? 4 : 3, 0, 0, 7); ctx.fill();
    // body
    const g = ctx.createLinearGradient(0, -3, 0, 3);
    g.addColorStop(0, '#e7e5e4'); g.addColorStop(0.5, '#a8a29e'); g.addColorStop(1, '#57534e');
    ctx.fillStyle = g;
    const L = s.big ? 12 : 9, R = s.big ? 3.6 : 2.8;
    ctx.beginPath();
    ctx.moveTo(-L / 2, -R);
    ctx.lineTo(L / 2 - 3, -R);
    ctx.lineTo(L / 2, 0);
    ctx.lineTo(L / 2 - 3, R);
    ctx.lineTo(-L / 2, R);
    ctx.closePath();
    ctx.fill();
    // glowing tip
    ctx.fillStyle = s.big ? '#fb923c' : '#fef3c7';
    ctx.beginPath(); ctx.arc(L / 2 - 1, 0, R * 0.8, 0, 7); ctx.fill();
    ctx.restore();
  }

  drawPowerup(p: PowerUpState) {
    const ctx = this.ctx;
    const blink = p.life < 5 ? (Math.sin(p.bob * 6) > 0 ? 1 : 0.25) : 1;
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(p.bob) * 4);
    ctx.globalAlpha = blink;
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath(); ctx.ellipse(0, 18, 18, 6, 0, 0, 7); ctx.fill();
    // glow ring
    const g = ctx.createRadialGradient(0, 0, 4, 0, 0, 30);
    g.addColorStop(0, 'rgba(134,239,172,0.5)');
    g.addColorStop(1, 'rgba(134,239,172,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 30, 0, 7); ctx.fill();
    // crate
    ctx.fillStyle = '#1f2937';
    ctx.strokeStyle = '#86efac'; ctx.lineWidth = 2.5;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(-15, -15, 30, 30, 7); else ctx.rect(-15, -15, 30, 30);
    ctx.fill(); ctx.stroke();
    // icon
    ctx.fillStyle = '#86efac';
    ctx.font = '800 17px "JetBrains Mono", monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const icons: Record<string, string> = { repair: '+', shield: '◈', rapid: '≋', big: '●', speed: '»' };
    ctx.fillText(icons[p.kind], 0, 1);
    ctx.textBaseline = 'alphabetic';
    // rotating dashed ring
    ctx.strokeStyle = 'rgba(134,239,172,0.7)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 5]);
    ctx.lineDashOffset = -p.bob * 12;
    ctx.beginPath(); ctx.arc(0, 0, 22, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
