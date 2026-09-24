import type { PadFx, PadInput } from '../net/protocol';
import { gameAudio } from '../game/audio';

export const WIDTH = 1200;
export const HEIGHT = 720;
export const COLORS = ['#4ade80', '#38bdf8', '#fb923c', '#c084fc'];

export interface Racer {
  slot: number;
  name: string;
  color: string;
  isBot: boolean;
}

export interface RoundPlayer {
  slot: number;
  name: string;
  color: string;
  score: number;
  detail: string;
  value?: number;
  maxValue?: number;
  isBot: boolean;
}

export interface RoundHud {
  timeLeft: number;
  countdown: number;
  paused: boolean;
  objective: string;
  status: string;
  players: RoundPlayer[];
}

export interface RoundResult {
  title: string;
  subtitle: string;
  winnerSlot: number | null;
  allWon?: boolean;
  players: RoundPlayer[];
}

export interface RoundConfig {
  players: Racer[];
  padInputs: PadInput[];
  primary: number;
  secondary: number;
  onHud: (hud: RoundHud) => void;
  onFinish: (result: RoundResult) => void;
  onFx: (slot: number, fx: PadFx) => void;
}

export interface InputState { x: number; y: number; aimX: number; aimY: number; action: boolean }
export const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n));
export const distance = (ax: number, ay: number, bx: number, by: number) => Math.hypot(ax - bx, ay - by);
export const rand = (min: number, max: number) => min + Math.random() * (max - min);
export const pick = <T,>(items: T[]) => items[Math.floor(Math.random() * items.length)];

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: string, stroke?: string) {
  ctx.beginPath(); ctx.roundRect(x, y, w, h, r);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

export function glow(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, color: string) {
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, color); grad.addColorStop(1, 'transparent');
  ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
}

/** Jeden render loop, skalowanie canvasu i obsługa klawiatury dla czterech niezależnych slotów. */
export abstract class CanvasRound {
  protected ctx: CanvasRenderingContext2D;
  protected config: RoundConfig;
  protected keys = new Set<string>();
  protected clock = 0;
  protected timeLeft: number;
  protected countdown = 3;
  paused = false;
  protected finished = false;
  private active = false;
  private raf = 0;
  private lastFrame = 0;
  private hudDelay = 0;
  private lastCount = 4;
  private canvas: HTMLCanvasElement;

  constructor(canvas: HTMLCanvasElement, config: RoundConfig, duration: number) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.config = config;
    this.timeLeft = duration;
  }

  start() {
    if (this.active) return;
    this.active = true;
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.visibilityChange);
    this.lastFrame = performance.now();
    this.raf = requestAnimationFrame(this.frame);
    this.config.onHud(this.hud());
  }

  destroy() {
    this.active = false;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.visibilityChange);
    this.keys.clear();
  }

  togglePause() {
    if (this.finished || this.countdown > 0) return;
    this.paused = !this.paused;
    this.config.onHud(this.hud());
    gameAudio.uiClick();
  }

  protected finish(result: RoundResult) {
    if (this.finished) return;
    this.finished = true;
    this.config.onFinish(result);
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
  };

  private keyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) this.togglePause();
    this.keys.add(e.code);
  };
  private keyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private blur = () => { this.keys.clear(); };
  private visibilityChange = () => {
    // Nie pozwalaj, aby przełączenie karty albo zablokowanie telefonu
    // rozstrzygnęło rundę pod nieobecność gracza. Wznowienie pozostaje ręczne.
    if (document.hidden && !this.paused && !this.finished && this.countdown <= 0) {
      this.paused = true;
      this.config.onHud(this.hud());
    }
  };

  private frame = (now: number) => {
    if (!this.active || this.finished) return;
    const dt = Math.min(0.04, Math.max(0, (now - this.lastFrame) / 1000));
    this.lastFrame = now;
    if (!this.paused) {
      if (this.countdown > 0) {
        this.countdown = Math.max(0, this.countdown - dt);
        const whole = Math.ceil(this.countdown);
        if (whole !== this.lastCount) { this.lastCount = whole; gameAudio.countdownBeep(whole === 0); }
      } else {
        this.clock += dt;
        this.timeLeft = Math.max(0, this.timeLeft - dt);
        this.update(dt);
        if (this.timeLeft <= 0 && !this.finished) this.timeout();
      }
    }
    const scale = Math.min(this.canvas.width / WIDTH, this.canvas.height / HEIGHT);
    const ox = (this.canvas.width - WIDTH * scale) / 2;
    const oy = (this.canvas.height - HEIGHT * scale) / 2;
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.setTransform(scale, 0, 0, scale, ox, oy);
    this.render(this.ctx);
    this.hudDelay -= dt;
    if (this.hudDelay <= 0 && !this.finished) {
      this.hudDelay = 0.15;
      this.config.onHud(this.hud());
    }
    if (!this.finished) this.raf = requestAnimationFrame(this.frame);
  };

  /** Komputer może sterować slotami równolegle z telefonami. W grach arcade joystick jest kierunkowy. */
  protected input(slot: number): InputState {
    const codes = [
      { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', action: ['KeyQ', 'Space'] },
      { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', action: ['Enter', 'Numpad0'] },
      { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH', action: ['KeyR'] },
      { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', action: ['KeyU'] },
    ][slot];
    if (!codes) return { x: 0, y: 0, aimX: 0, aimY: 0, action: false };
    const x = Number(this.keys.has(codes.right)) - Number(this.keys.has(codes.left));
    const y = Number(this.keys.has(codes.down)) - Number(this.keys.has(codes.up));
    const pad = this.config.padInputs[slot];
    const px = pad?.steer === 'tank' ? pad.turn : pad?.dirX ?? pad?.turn ?? 0;
    const py = pad?.steer === 'tank' ? -pad.fwd : pad?.dirY ?? -(pad?.fwd ?? 0);
    const mag = Math.max(1, Math.hypot(x, y));
    return {
      x: x || y ? x / mag : px,
      y: x || y ? y / mag : py,
      aimX: pad?.aimX ?? 0, aimY: pad?.aimY ?? 0,
      action: !!pad?.fire || codes.action.some(code => this.keys.has(code)),
    };
  }

  protected abstract update(dt: number): void;
  protected abstract render(ctx: CanvasRenderingContext2D): void;
  protected abstract hud(): RoundHud;
  protected abstract timeout(): void;
}
