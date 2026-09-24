import { CanvasRound, HEIGHT, WIDTH, clamp, distance, glow, rand, roundRect, type InputState, type Racer, type RoundConfig, type RoundHud, type RoundPlayer } from '../runtime';
import { gameAudio } from '../../game/audio';

type Point = { x: number; y: number };
interface Car extends Racer { x: number; y: number; angle: number; speed: number; energy: number; lap: number; checkpoint: number; nearest: number; trail: Point[]; }
interface Battery { index: number; readyAt: number }

const ROAD_WIDTH = 114;
const CHECKPOINTS = 8;
const CONTROL = [
  { x: 270, y: 528 }, { x: 165, y: 392 }, { x: 203, y: 214 }, { x: 418, y: 172 },
  { x: 630, y: 235 }, { x: 828, y: 169 }, { x: 1010, y: 220 }, { x: 1055, y: 390 },
  { x: 952, y: 535 }, { x: 766, y: 552 }, { x: 604, y: 453 }, { x: 423, y: 545 },
];

/** Zamknięta, wygładzona nitka toru; fizyka, okrążenia i rysowanie używają tej samej geometrii. */
function makeTrack(): Point[] {
  const path: Point[] = [];
  for (let i = 0; i < CONTROL.length; i++) {
    const p0 = CONTROL[(i - 1 + CONTROL.length) % CONTROL.length];
    const p1 = CONTROL[i];
    const p2 = CONTROL[(i + 1) % CONTROL.length];
    const p3 = CONTROL[(i + 2) % CONTROL.length];
    for (let k = 0; k < 12; k++) {
      const t = k / 12, t2 = t * t, t3 = t2 * t;
      const cat = (a: number, b: number, c: number, d: number) => .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      path.push({ x: cat(p0.x, p1.x, p2.x, p3.x), y: cat(p0.y, p1.y, p2.y, p3.y) });
    }
  }
  return path;
}

export class RaceRound extends CanvasRound {
  private path = makeTrack();
  private cars: Car[];
  private batteries: Battery[];
  private laps: number;
  private streaks = Array.from({ length: 75 }, () => ({ x: rand(0, WIDTH), y: rand(0, HEIGHT), len: rand(14, 50) }));

  constructor(canvas: HTMLCanvasElement, config: RoundConfig) {
    super(canvas, config, 210);
    this.laps = [2, 3, 4][config.primary] ?? 3;
    const p = this.path[0], ahead = this.path[4];
    this.cars = config.players.map((r, i) => ({
      ...r, x: p.x + (i % 2 ? 25 : -25) + i * 10, y: p.y + (Math.floor(i / 2) * 30),
      angle: Math.atan2(ahead.y - p.y, ahead.x - p.x), speed: 0, energy: 65,
      lap: 0, checkpoint: 1, nearest: 0, trail: [],
    }));
    this.batteries = [18, 44, 69, 94, 124].map(index => ({ index, readyAt: 0 }));
  }

  private closest(x: number, y: number): { index: number; distance: number } {
    let best = Infinity, index = 0;
    this.path.forEach((point, i) => {
      const d = (point.x - x) ** 2 + (point.y - y) ** 2;
      if (d < best) { best = d; index = i; }
    });
    return { index, distance: Math.sqrt(best) };
  }

  private drive(car: Car, dt: number, input: InputState) {
    let x = input.x, y = input.y;
    if (car.isBot) {
      const nearest = this.closest(car.x, car.y).index;
      const target = this.path[(nearest + 7) % this.path.length];
      x = target.x - car.x; y = target.y - car.y;
    }
    const magnitude = Math.min(1, Math.hypot(x, y));
    if (magnitude > .16) {
      const wanted = Math.atan2(y, x);
      let diff = ((wanted - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      const turn = Math.min(1, dt * (car.isBot ? 5.8 : 5));
      car.angle += diff * turn;
    }
    const onRoad = this.closest(car.x, car.y).distance < ROAD_WIDTH * .49;
    const boosted = !car.isBot && input.action && car.energy > 2 && onRoad;
    const max = (car.isBot ? 302 : boosted ? 460 : 330) * (onRoad ? 1 : .42);
    const targetSpeed = magnitude > .16 || car.isBot ? max * (car.isBot ? 1 : magnitude) : 0;
    car.speed += (targetSpeed - car.speed) * Math.min(1, dt * (targetSpeed > car.speed ? 1.65 : 3.5));
    if (boosted) car.energy = Math.max(0, car.energy - dt * 39);
    else car.energy = Math.min(100, car.energy + dt * 8);
    car.x = clamp(car.x + Math.cos(car.angle) * car.speed * dt, 22, WIDTH - 22);
    car.y = clamp(car.y + Math.sin(car.angle) * car.speed * dt, 22, HEIGHT - 22);
    if (car.speed > 170) {
      car.trail.push({ x: car.x - Math.cos(car.angle) * 17, y: car.y - Math.sin(car.angle) * 17 });
      if (car.trail.length > 15) car.trail.shift();
    } else if (car.trail.length) car.trail.shift();

    const nearest = this.closest(car.x, car.y);
    car.nearest = nearest.index;
    const checkIndex = Math.floor(car.checkpoint * this.path.length / CHECKPOINTS) % this.path.length;
    if (distance(car.x, car.y, this.path[checkIndex].x, this.path[checkIndex].y) < 65) {
      car.checkpoint = (car.checkpoint + 1) % CHECKPOINTS;
      if (car.checkpoint === 1) {
        car.lap++;
        if (car.lap >= this.laps) {
          this.finish({ title: `${car.name} na mecie!`, subtitle: `Pierwszy kończy ${this.laps} okrążenia. Podium należy do ${car.name}!`, winnerSlot: car.isBot ? null : car.slot, players: this.ranking() });
        }
      }
    }
    for (const bat of this.batteries) {
      if (bat.readyAt > this.clock) continue;
      const pos = this.path[bat.index % this.path.length];
      if (distance(car.x, car.y, pos.x, pos.y) < 36) {
        car.energy = Math.min(100, car.energy + 38);
        bat.readyAt = this.clock + 9;
        if (!car.isBot) this.config.onFx(car.slot, 'pickup');
        gameAudio.pickup();
      }
    }
  }

  protected update(dt: number): void {
    for (const car of this.cars) this.drive(car, dt, this.input(car.slot));
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) {
      const a = this.cars[i], b = this.cars[j];
      const d = distance(a.x, a.y, b.x, b.y);
      if (d < 31 && d > .01) { const push = (31 - d) * .5; a.x += (a.x - b.x) / d * push; a.y += (a.y - b.y) / d * push; b.x -= (a.x - b.x) / d * push; b.y -= (a.y - b.y) / d * push; a.speed *= .96; b.speed *= .96; }
    }
  }

  private ranking(): RoundPlayer[] {
    return [...this.cars].sort((a, b) => (b.lap * CHECKPOINTS + b.checkpoint) - (a.lap * CHECKPOINTS + a.checkpoint) || b.nearest - a.nearest).map(c => ({
      slot: c.slot, name: c.name, color: c.color, score: Math.min(this.laps, c.lap), detail: `${Math.min(this.laps, c.lap + 1)}/${this.laps} okr.`, value: Math.round(c.energy), maxValue: 100, isBot: c.isBot,
    }));
  }

  protected hud(): RoundHud {
    return { timeLeft: this.timeLeft, countdown: this.countdown, paused: this.paused, objective: `${this.laps} okrążenia · pierwszy na mecie`, status: 'WYŚCIG / NOCNE MIASTO', players: this.ranking() };
  }

  protected timeout(): void {
    const rank = this.ranking();
    this.finish({ title: 'Koniec wyścigu', subtitle: `Najdalej dojechał ${rank[0].name}.`, winnerSlot: rank[0].isBot ? null : rank[0].slot, players: rank });
  }

  protected render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#090d21'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = '#162543'; ctx.lineWidth = 1;
    for (let x = 0; x < WIDTH; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, HEIGHT); ctx.stroke(); }
    for (let y = 0; y < HEIGHT; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(WIDTH, y); ctx.stroke(); }
    for (const streak of this.streaks) {
      ctx.strokeStyle = 'rgba(34,211,238,.09)'; ctx.beginPath(); ctx.moveTo(streak.x, streak.y); ctx.lineTo(streak.x + streak.len, streak.y - streak.len * .5); ctx.stroke();
    }
    const road = () => { ctx.beginPath(); this.path.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)); ctx.closePath(); };
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    road(); ctx.strokeStyle = '#6725a6'; ctx.lineWidth = ROAD_WIDTH + 30; ctx.shadowColor = '#aa3fe3'; ctx.shadowBlur = 30; ctx.stroke(); ctx.shadowBlur = 0;
    road(); ctx.strokeStyle = '#91e9f5'; ctx.lineWidth = ROAD_WIDTH + 13; ctx.stroke();
    road(); ctx.strokeStyle = '#171b31'; ctx.lineWidth = ROAD_WIDTH; ctx.stroke();
    road(); ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = 2; ctx.setLineDash([14, 27]); ctx.stroke(); ctx.setLineDash([]);
    // checkered start / finish line
    const p = this.path[0], n = this.path[3];
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(n.y - p.y, n.x - p.x) + Math.PI / 2);
    for (let row = 0; row < 2; row++) for (let col = -5; col < 5; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#f3f4f6' : '#151524';
      ctx.fillRect(col * 11, (row - 1) * 11, 11, 11);
    }
    ctx.restore();
    this.batteries.forEach(bat => {
      if (bat.readyAt > this.clock) return;
      const pos = this.path[bat.index % this.path.length];
      glow(ctx, pos.x, pos.y, 32, 'rgba(88,225,245,.32)');
      ctx.save(); ctx.translate(pos.x, pos.y); ctx.rotate(this.clock * 1.5);
      roundRect(ctx, -9, -9, 18, 18, 3, '#63e6f6', '#e1feff');
      ctx.fillStyle = '#071426'; ctx.font = 'bold 14px monospace'; ctx.textAlign = 'center'; ctx.fillText('↯', 0, 5);
      ctx.restore();
    });
    for (const car of this.cars) {
      car.trail.forEach((pt, i) => {
        ctx.fillStyle = `${car.color}${Math.floor((i / Math.max(1, car.trail.length)) * 110).toString(16).padStart(2, '0')}`;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, i / car.trail.length * 7 + 1, 0, Math.PI * 2); ctx.fill();
      });
      glow(ctx, car.x, car.y, 42, `${car.color}27`);
      ctx.save(); ctx.translate(car.x, car.y); ctx.rotate(car.angle);
      ctx.shadowColor = car.color; ctx.shadowBlur = 18;
      roundRect(ctx, -22, -12, 44, 24, 8, car.color, 'rgba(255,255,255,.6)');
      ctx.shadowBlur = 0;
      roundRect(ctx, -3, -10, 11, 20, 3, '#111b35');
      ctx.fillStyle = '#fbf6dc'; ctx.fillRect(15, -9, 4, 4); ctx.fillRect(15, 5, 4, 4);
      ctx.fillStyle = '#fb7185'; ctx.fillRect(-21, -9, 3, 4); ctx.fillRect(-21, 5, 3, 4);
      ctx.restore();
      roundRect(ctx, car.x - 30, car.y - 34, 60, 17, 5, 'rgba(5,8,21,.8)');
      ctx.fillStyle = car.color; ctx.textAlign = 'center'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(car.name.toUpperCase().slice(0, 10), car.x, car.y - 22);
    }
    // ambient city lamp lights
    for (const x of [66, 1130]) for (const y of [72, 642]) { glow(ctx, x, y, 67, 'rgba(143,78,250,.16)'); ctx.fillStyle = '#9b61db'; ctx.fillRect(x - 4, y - 4, 8, 8); }
    ctx.fillStyle = '#80a0bd'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'left';
    ctx.fillText('NEON CIRCUIT  /  NOCNE MIASTO', 25, HEIGHT - 21);
  }
}
