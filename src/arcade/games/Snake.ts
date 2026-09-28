import { CanvasRound, HEIGHT, WIDTH, clamp, glow, rand, roundRect, type Racer, type RoundConfig, type RoundHud, type RoundPlayer } from '../runtime';
import { gameAudio } from '../../game/audio';

type Cell = { x: number; y: number };
interface Serpent extends Racer { body: Cell[]; prevBody: Cell[]; dir: Cell; next: Cell; score: number; hearts: number; energy: number; timer: number; stepDuration: number; respawn: number; shield: number }
interface Food extends Cell { gold: boolean; phase: number }
const COLS = 38, ROWS = 21, TILE = 28, LEFT = 68, TOP = 66;
const SPAWNS: { head: Cell; dir: Cell }[] = [
  { head: { x: 5, y: 5 }, dir: { x: 1, y: 0 } },
  { head: { x: 32, y: 15 }, dir: { x: -1, y: 0 } },
  { head: { x: 5, y: 15 }, dir: { x: 1, y: 0 } },
  { head: { x: 32, y: 5 }, dir: { x: -1, y: 0 } },
];

export class SnakeRound extends CanvasRound {
  private serpents: Serpent[];
  private walls = new Set<string>();
  private food: Food[] = [];
  private target: number;

  constructor(canvas: HTMLCanvasElement, config: RoundConfig) {
    super(canvas, config, 170);
    this.target = [8, 12, 16][config.primary] ?? 12;
    for (let x = 10; x <= 13; x++) { this.walls.add(this.key(x, 9)); this.walls.add(this.key(x + 14, 11)); }
    for (let y = 3; y <= 6; y++) { this.walls.add(this.key(18, y)); this.walls.add(this.key(19, 20 - y)); }
    for (let y = 13; y <= 15; y++) { this.walls.add(this.key(9, y)); this.walls.add(this.key(28, 20 - y)); }
    this.serpents = config.players.map(p => ({ ...p, body: [], prevBody: [], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 }, score: 0, hearts: 3, energy: 100, timer: 0, stepDuration: .145, respawn: 0, shield: 0 }));
    for (const s of this.serpents) this.reset(s);
    for (let i = 0; i < 6; i++) this.food.push(this.makeFood(i === 0));
  }

  private key(x: number, y: number) { return `${x}:${y}`; }
  private occupied(x: number, y: number) { return this.serpents.some(s => s.body.some(b => b.x === x && b.y === y)); }
  private reset(s: Serpent) {
    const initial = SPAWNS[s.slot];
    const start = this.occupied(initial.head.x, initial.head.y)
      ? this.freeCell() : initial.head;
    s.dir = { ...initial.dir }; s.next = { ...s.dir };
    s.body = Array.from({ length: 4 }, (_, i) => ({ x: clamp(start.x - s.dir.x * i, 0, COLS - 1), y: clamp(start.y - s.dir.y * i, 0, ROWS - 1) }));
    s.prevBody = s.body.map(cell => ({ ...cell }));
    s.timer = 0;
    s.stepDuration = .145;
    s.energy = Math.max(35, s.energy);
    s.shield = 2; // krótka ochrona po odrodzeniu
  }
  private freeCell(): Cell {
    for (let i = 0; i < 250; i++) {
      const x = Math.floor(rand(2, COLS - 2)), y = Math.floor(rand(2, ROWS - 2));
      if (!this.walls.has(this.key(x, y)) && !this.occupied(x, y) && !this.food.some(f => f.x === x && f.y === y)) return { x, y };
    }
    return { x: 3, y: 3 };
  }
  private makeFood(gold = Math.random() < .15): Food { return { ...this.freeCell(), gold, phase: rand(0, 6) }; }
  private blocked(x: number, y: number) {
    return x < 0 || y < 0 || x >= COLS || y >= ROWS || this.walls.has(this.key(x, y)) || this.occupied(x, y);
  }

  private chooseDirection(s: Serpent) {
    if (s.isBot) {
      const head = s.body[0];
      const target = [...this.food].sort((a, b) => Math.abs(a.x - head.x) + Math.abs(a.y - head.y) - (Math.abs(b.x - head.x) + Math.abs(b.y - head.y)))[0];
      const choices: Cell[] = [{ x: 1, y: 0 }, { x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }];
      const legal = choices.filter(dir => !(dir.x === -s.dir.x && dir.y === -s.dir.y) && !this.blocked(head.x + dir.x, head.y + dir.y));
      legal.sort((a, b) => (Math.abs(head.x + a.x - target.x) + Math.abs(head.y + a.y - target.y)) - (Math.abs(head.x + b.x - target.x) + Math.abs(head.y + b.y - target.y)));
      if (legal[0]) s.next = legal[0];
      return;
    }
    const inp = this.input(s.slot);
    if (Math.max(Math.abs(inp.x), Math.abs(inp.y)) < .35) return;
    const wanted = Math.abs(inp.x) > Math.abs(inp.y) ? { x: Math.sign(inp.x), y: 0 } : { x: 0, y: Math.sign(inp.y) };
    if (wanted.x !== -s.dir.x || wanted.y !== -s.dir.y) s.next = wanted;
  }

  private crash(s: Serpent) {
    if (s.shield > 0) {
      s.shield = 0;
      s.next = { x: -s.dir.y || 1, y: s.dir.x }; // odbicie / skręt przy tarczy
      this.config.onFx(s.slot, 'shield');
      return;
    }
    s.hearts--;
    s.body = [];
    s.prevBody = [];
    s.respawn = s.hearts > 0 ? 1.7 : 0;
    if (!s.isBot) this.config.onFx(s.slot, 'dead');
    gameAudio.hitMetal();
  }

  protected update(dt: number): void {
    for (const s of this.serpents) {
      if (s.hearts <= 0) continue;
      if (s.respawn > 0) { s.respawn -= dt; if (s.respawn <= 0) { this.reset(s); if (!s.isBot) this.config.onFx(s.slot, 'respawn'); } continue; }
      s.shield = Math.max(0, s.shield - dt);
      this.chooseDirection(s);
      const inp = s.isBot ? null : this.input(s.slot);
      const boost = !!inp?.action && s.energy > 5;
      s.energy = clamp(s.energy + dt * (boost ? -42 : 13), 0, 100);
      s.timer += dt;
      const interval = boost ? .077 : s.isBot ? .17 : .145;
      s.stepDuration = interval;
      if (s.timer < interval) continue;
      s.timer = Math.max(0, s.timer - interval);
      if (s.next.x !== -s.dir.x || s.next.y !== -s.dir.y) s.dir = { ...s.next };
      const head = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y };
      const hit = this.food.find(f => f.x === head.x && f.y === head.y);
      // Własny ogon może zwolnić pole w tej samej klatce.
      const ownTail = s.body[s.body.length - 1];
      const hitsTail = !hit && ownTail.x === head.x && ownTail.y === head.y;
      if (this.blocked(head.x, head.y) && !hitsTail) { this.crash(s); continue; }
      s.prevBody = s.body.map(cell => ({ ...cell }));
      s.body.unshift(head);
      if (hit) {
        s.score += hit.gold ? 3 : 1;
        if (hit.gold) { s.energy = Math.min(100, s.energy + 40); s.shield = Math.max(s.shield, 5); }
        else s.energy = Math.min(100, s.energy + 12);
        if (hit.gold) s.body.push({ ...s.body[s.body.length - 1] });
        this.food.splice(this.food.indexOf(hit), 1);
        this.food.push(this.makeFood());
        if (!s.isBot) this.config.onFx(s.slot, 'pickup');
        gameAudio.pickup();
        if (s.score >= this.target) {
          this.finish({ title: this.isEnglish ? `${s.name} wins!` : `${s.name} wygrywa!`, subtitle: this.isEnglish ? `First to ${this.target} points on the steel arena.` : `Pierwszy zdobył ${this.target} punktów na stalowej arenie.`, winnerSlot: s.isBot ? null : s.slot, players: this.ranking() });
        }
      } else s.body.pop();
    }
    if (this.serpents.every(s => s.hearts <= 0)) this.timeout();
  }

  private ranking(): RoundPlayer[] {
    return [...this.serpents].sort((a, b) => b.score - a.score || b.hearts - a.hearts).map(s => ({ slot: s.slot, name: s.name, color: s.color, score: s.score, detail: s.hearts ? (this.isEnglish ? `${s.hearts} lives · ${s.body.length} cells` : `${s.hearts} życia · ${s.body.length} pól`) : (this.isEnglish ? 'Eliminated' : 'Eliminacja'), value: Math.round(s.energy), maxValue: 100, isBot: s.isBot }));
  }
  protected hud(): RoundHud {
    return { timeLeft: this.timeLeft, countdown: this.countdown, paused: this.paused, objective: this.isEnglish ? `First to ${this.target} points` : `Pierwszy do ${this.target} punktów`, status: this.isEnglish ? 'COLLECT ENERGY · AVOID CRASHES' : 'ZBIERAJ IMPULSY · UNIKAJ KOLIZJI', players: this.ranking() };
  }
  protected timeout(): void {
    const rank = this.ranking();
    this.finish({ title: this.isEnglish ? `${rank[0].name} wins!` : `${rank[0].name} wygrywa!`, subtitle: this.isEnglish ? `Most energy collected: ${rank[0].score}. Play again and beat the record!` : `Najwięcej impulsów: ${rank[0].score}. Spróbuj ponownie i pobij rekord!`, winnerSlot: rank[0].isBot ? null : rank[0].slot, players: rank });
  }

  protected render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#090b0e'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    glow(ctx, WIDTH * .5, HEIGHT * .35, 520, 'rgba(226,146,64,.09)');
    glow(ctx, WIDTH * .5, HEIGHT * .95, 440, 'rgba(52,111,91,.06)');
    roundRect(ctx, LEFT - 16, TOP - 16, COLS * TILE + 32, ROWS * TILE + 32, 18, '#1b1d1f', '#877355');
    ctx.fillStyle = '#111416'; ctx.fillRect(LEFT, TOP, COLS * TILE, ROWS * TILE);
    ctx.strokeStyle = 'rgba(197,166,117,.075)'; ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(LEFT + x * TILE, TOP); ctx.lineTo(LEFT + x * TILE, TOP + ROWS * TILE); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(LEFT, TOP + y * TILE); ctx.lineTo(LEFT + COLS * TILE, TOP + y * TILE); ctx.stroke(); }
    // Heavy steel cover, riveted corners and warm tactical edge lights echo Steel Front.
    for (const wall of this.walls) {
      const [x, y] = wall.split(':').map(Number), wx = LEFT + x * TILE, wy = TOP + y * TILE;
      roundRect(ctx, wx + 2, wy + 2, TILE - 4, TILE - 4, 3, '#34383a', '#8a7960');
      ctx.fillStyle = 'rgba(227,211,181,.18)'; ctx.fillRect(wx + 5, wy + 5, TILE - 10, 2);
      ctx.fillStyle = '#c29a5c'; ctx.fillRect(wx + 5, wy + TILE - 7, 4, 2);
    }
    for (const food of this.food) {
      const x = LEFT + (food.x + .5) * TILE, y = TOP + (food.y + .5) * TILE;
      const pulse = Math.sin(this.clock * 5 + food.phase);
      const glowColor = food.gold ? 'rgba(255,196,83,.45)' : 'rgba(240,137,54,.34)';
      glow(ctx, x, y, food.gold ? 30 : 21, glowColor);
      ctx.save(); ctx.translate(x, y); ctx.rotate(this.clock * .7 + food.phase);
      const size = food.gold ? 10 + pulse * 2 : 7;
      roundRect(ctx, -size, -size, size * 2, size * 2, 3, food.gold ? '#ffd36a' : '#ec8840', '#fff0cf');
      ctx.fillStyle = '#fff8e6'; ctx.fillRect(-2, -2, 4, 4);
      ctx.restore();
    }
    for (const s of this.serpents) {
      for (let i = s.body.length - 1; i >= 0; i--) {
        const part = s.body[i];
        const previous = s.prevBody[i] ?? part;
        const progress = clamp(s.timer / Math.max(.001, s.stepDuration), 0, 1);
        const cellX = previous.x + (part.x - previous.x) * progress;
        const cellY = previous.y + (part.y - previous.y) * progress;
        const x = LEFT + cellX * TILE, y = TOP + cellY * TILE;
        ctx.globalAlpha = i === 0 ? 1 : Math.max(.55, 1 - i / Math.max(10, s.body.length * 1.5));
        ctx.shadowColor = s.color;
        ctx.shadowBlur = this.config.quality === 'performance' ? 0 : i === 0 ? 11 : 3;
        roundRect(ctx, x + 2, y + 2, TILE - 4, TILE - 4, i === 0 ? 9 : 6, s.color, 'rgba(10,12,14,.62)');
        ctx.shadowBlur = 0;
        if (i === 0) {
          ctx.fillStyle = '#071219';
          const ex = s.dir.x * 5, ey = s.dir.y * 5;
          for (const side of [-1, 1]) { ctx.beginPath(); ctx.arc(x + TILE / 2 + ex + (s.dir.y || 1) * side * 5, y + TILE / 2 + ey + (s.dir.x || 1) * side * 5, 2.5, 0, Math.PI * 2); ctx.fill(); }
          if (s.shield > 0) { ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.strokeRect(x - 2, y - 2, TILE + 4, TILE + 4); }
          roundRect(ctx, x - 14, y - 23, 56, 16, 4, 'rgba(2,12,19,.8)');
          ctx.fillStyle = s.color; ctx.textAlign = 'center'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(s.name.toUpperCase().slice(0, 9), x + 14, y - 11);
        }
      }
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = '#b8a27d'; ctx.textAlign = 'left'; ctx.font = 'bold 12px monospace'; ctx.fillText(this.isEnglish ? 'SNAKE VORTEX  /  STEEL ARENA' : 'WĘŻOWY WIR  /  STALOWA ARENA', 25, HEIGHT - 18);
  }
}
