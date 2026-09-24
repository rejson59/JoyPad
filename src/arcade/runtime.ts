import type { PadFx, PadInput } from '../net/protocol';
import { gameAudio } from '../game/audio';

export const WIDTH = 1200;
export const HEIGHT = 720;
/** Warm player colors read well on a graphite/orange UI and on low-brightness TVs. */
export const COLORS = ['#fbbf24', '#fb923c', '#38bdf8', '#a3e635'];

export type DisplayMode = 'shared' | 'split';
export type RenderQuality = 'performance' | 'balanced' | 'quality';

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
  /** Shared arena is the default; split uses lightweight local viewports. */
  displayMode?: DisplayMode;
  /** The 2D+ renderer can stay crisp without pushing small devices too hard. */
  quality?: RenderQuality;
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

/**
 * One render loop for all small arcade worlds.
 *
 * The games deliberately use a fixed 1200x720 design surface and a capped DPR.
 * That gives a console-like composition while keeping phones and integrated GPUs
 * out of the "4K canvas for a tiny game" trap.
 */
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
    const deviceMemory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8);
    const requested = this.config.quality === 'quality' ? 2 : this.config.quality === 'performance' ? 1 : 1.5;
    // Balanced is intentionally capped on low-memory phones. CSS still scales the canvas up.
    const lowMemoryCap = deviceMemory <= 4 ? 1 : requested;
    const dpr = Math.min(lowMemoryCap, window.devicePixelRatio || 1);
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

  private drawShared() {
    const scale = Math.min(this.canvas.width / WIDTH, this.canvas.height / HEIGHT);
    const ox = (this.canvas.width - WIDTH * scale) / 2;
    const oy = (this.canvas.height - HEIGHT * scale) / 2;
    this.ctx.setTransform(scale, 0, 0, scale, ox, oy);
    this.render(this.ctx);
  }

  /**
   * A real split surface rather than a CSS stretch. Each viewport is clipped and
   * gets its own camera pass. Existing arenas share the world, while the new
   * 3D-lite games use the same pass for a calm, low-cost couch mode.
   */
  private drawSplit() {
    const count = Math.min(4, Math.max(2, this.config.players.length));
    const columns = count <= 2 ? count : 2;
    const rows = Math.ceil(count / columns);
    const panelWidth = this.canvas.width / columns;
    const panelHeight = this.canvas.height / rows;
    this.ctx.fillStyle = '#07090d';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    for (let panel = 0; panel < count; panel++) {
      const column = panel % columns;
      const row = Math.floor(panel / columns);
      const x = column * panelWidth;
      const y = row * panelHeight;
      const scale = Math.min(panelWidth / WIDTH, panelHeight / HEIGHT);
      const ox = x + (panelWidth - WIDTH * scale) / 2;
      const oy = y + (panelHeight - HEIGHT * scale) / 2;
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.rect(x, y, panelWidth, panelHeight);
      this.ctx.clip();
      this.ctx.setTransform(scale, 0, 0, scale, ox, oy);
      this.render(this.ctx);
      this.ctx.restore();
      this.ctx.save();
      this.ctx.setTransform(1, 0, 0, 1, 0, 0);
      this.ctx.strokeStyle = 'rgba(255,255,255,.28)';
      this.ctx.lineWidth = Math.max(1, this.canvas.width / 900);
      this.ctx.strokeRect(x + .5, y + .5, panelWidth - 1, panelHeight - 1);
      this.ctx.fillStyle = 'rgba(4,7,10,.76)';
      this.ctx.fillRect(x + 10, y + 10, 74, 23);
      this.ctx.fillStyle = this.config.players[panel]?.color || '#fbbf24';
      this.ctx.font = '700 12px monospace';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`P${panel + 1}  ${this.config.players[panel]?.name?.toUpperCase().slice(0, 7) || ''}`, x + 17, y + 26);
      this.ctx.restore();
    }
  }

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
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.config.displayMode === 'split' && this.config.players.length > 1) this.drawSplit();
    else this.drawShared();
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
