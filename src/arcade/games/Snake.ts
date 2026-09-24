import { CanvasRound, HEIGHT, WIDTH, clamp, glow, rand, roundRect, type Racer, type RoundConfig, type RoundHud, type RoundPlayer } from '../runtime';
import { gameAudio } from '../../game/audio';

type Cell = { x: number; y: number };
interface Serpent extends Racer { body: Cell[]; dir: Cell; next: Cell; score: number; hearts: number; energy: number; timer: number; respawn: number; shield: number }
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
    this.serpents = config.players.map(p => ({ ...p, body: [], dir: { x: 1, y: 0 }, next: { x: 1, y: 0 }, score: 0, hearts: 3, energy: 100, timer: 0, respawn: 0, shield: 0 }));
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
    s.timer = 0;
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
      if (s.timer < interval) continue;
      s.timer = Math.max(0, s.timer - interval);
      if (s.next.x !== -s.dir.x || s.next.y !== -s.dir.y) s.dir = { ...s.next };
      const head = { x: s.body[0].x + s.dir.x, y: s.body[0].y + s.dir.y };
      const hit = this.food.find(f => f.x === head.x && f.y === head.y);
      // Własny ogon może zwolnić pole w tej samej klatce.
      const ownTail = s.body[s.body.length - 1];
      const hitsTail = !hit && ownTail.x === head.x && ownTail.y === head.y;
      if (this.blocked(head.x, head.y) && !hitsTail) { this.crash(s); continue; }
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
          this.finish({ title: `${s.name} wygrywa!`, subtitle: `Pierwszy zdobył ${this.target} punktów na neonowej arenie.`, winnerSlot: s.isBot ? null : s.slot, players: this.ranking() });
        }
      } else s.body.pop();
    }
    if (this.serpents.every(s => s.hearts <= 0)) this.timeout();
  }

  private ranking(): RoundPlayer[] {
    return [...this.serpents].sort((a, b) => b.score - a.score || b.hearts - a.hearts).map(s => ({ slot: s.slot, name: s.name, color: s.color, score: s.score, detail: s.hearts ? `${s.hearts} życia · ${s.body.length} pól` : 'Eliminacja', value: Math.round(s.energy), maxValue: 100, isBot: s.isBot }));
  }
  protected hud(): RoundHud {
    return { timeLeft: this.timeLeft, countdown: this.countdown, paused: this.paused, objective: `Pierwszy do ${this.target} punktów`, status: 'ZBIERAJ IMPULSY · UNIKAJ KOLIZJI', players: this.ranking() };
  }
  protected timeout(): void {
    const rank = this.ranking();
    this.finish({ title: `${rank[0].name} wygrywa!`, subtitle: `Najwięcej impulsów: ${rank[0].score}. Spróbuj ponownie i pobij rekord!`, winnerSlot: rank[0].isBot ? null : rank[0].slot, players: rank });
  }

  protected render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#080f19'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    glow(ctx, WIDTH / 2, HEIGHT / 2, 520, 'rgba(48,112,60,.08)');
    roundRect(ctx, LEFT - 13, TOP - 13, COLS * TILE + 26, ROWS * TILE + 26, 20, '#13232b', '#427457');
    ctx.fillStyle = '#0a1820'; ctx.fillRect(LEFT, TOP, COLS * TILE, ROWS * TILE);
    ctx.strokeStyle = 'rgba(90,221,152,.10)'; ctx.lineWidth = 1;
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(LEFT + x * TILE, TOP); ctx.lineTo(LEFT + x * TILE, TOP + ROWS * TILE); ctx.stroke(); }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(LEFT, TOP + y * TILE); ctx.lineTo(LEFT + COLS * TILE, TOP + y * TILE); ctx.stroke(); }
    for (const wall of this.walls) {
      const [x, y] = wall.split(':').map(Number);
      roundRect(ctx, LEFT + x * TILE + 2, TOP + y * TILE + 2, TILE - 4, TILE - 4, 4, '#28404a', '#61aa86');
      ctx.fillStyle = 'rgba(190,248,217,.18)'; ctx.fillRect(LEFT + x * TILE + 6, TOP + y * TILE + 6, TILE - 12, 2);
    }
    for (const food of this.food) {
      const x = LEFT + (food.x + .5) * TILE, y = TOP + (food.y + .5) * TILE;
      glow(ctx, x, y, food.gold ? 28 : 19, food.gold ? 'rgba(251,191,36,.45)' : 'rgba(52,211,153,.35)');
      ctx.fillStyle = food.gold ? '#fbbf24' : '#5eead4'; ctx.beginPath(); ctx.arc(x, y, food.gold ? 10 + Math.sin(this.clock * 5 + food.phase) * 2 : 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#eafff4'; ctx.beginPath(); ctx.arc(x - 2, y - 3, 2, 0, Math.PI * 2); ctx.fill();
    }
    for (const s of this.serpents) {
      for (let i = s.body.length - 1; i >= 0; i--) {
        const part = s.body[i], x = LEFT + part.x * TILE, y = TOP + part.y * TILE;
        ctx.globalAlpha = i === 0 ? 1 : Math.max(.5, 1 - i / Math.max(10, s.body.length * 1.5));
        ctx.shadowColor = s.color; ctx.shadowBlur = i === 0 ? 18 : 7;
        roundRect(ctx, x + 2, y + 2, TILE - 4, TILE - 4, i === 0 ? 9 : 6, s.color);
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
    ctx.fillStyle = '#83ae9a'; ctx.textAlign = 'left'; ctx.font = 'bold 12px monospace'; ctx.fillText('WĘŻOWY WIR  /  ARENA 01', 25, HEIGHT - 18);
  }
}
