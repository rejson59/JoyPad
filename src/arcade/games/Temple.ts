import { CanvasRound, HEIGHT, WIDTH, clamp, distance, glow, rand, roundRect, type Racer, type RoundConfig, type RoundHud, type RoundPlayer } from '../runtime';
import { gameAudio } from '../../game/audio';

type Cell = { x: number; y: number };
interface Explorer extends Racer { x: number; y: number; hearts: number; score: number; stamina: number; invulnerable: number }
interface Guardian { x: number; y: number; speed: number; stunned: number; tx: number; ty: number; chooseAt: number }
interface Chest extends Cell { opened: boolean }
interface Trap extends Cell { phase: number }
const C = 25, R = 15, S = 40, OX = 100, OY = 60;
const SPAWN: Cell = { x: 1, y: 1 };
const EXIT: Cell = { x: C - 2, y: R - 2 };
const center = (n: number) => n * S + S / 2;

function maze(): number[][] {
  const grid = Array.from({ length: R }, () => Array(C).fill(1) as number[]);
  const stack: Cell[] = [{ ...SPAWN }];
  grid[1][1] = 0;
  while (stack.length) {
    const at = stack[stack.length - 1];
    const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].sort(() => Math.random() - .5);
    const next = dirs.map(([dx, dy]) => ({ x: at.x + dx, y: at.y + dy, mx: at.x + dx / 2, my: at.y + dy / 2 })).find(p => p.x > 0 && p.y > 0 && p.x < C - 1 && p.y < R - 1 && grid[p.y][p.x] === 1);
    if (!next) stack.pop();
    else { grid[next.my][next.mx] = 0; grid[next.y][next.x] = 0; stack.push({ x: next.x, y: next.y }); }
  }
  // Dodatkowe połączenia: gracze nie muszą iść jednym korytarzem.
  for (let i = 0; i < 35; i++) {
    const x = Math.floor(rand(2, C - 2)), y = Math.floor(rand(2, R - 2));
    if (grid[y][x] && ((grid[y][x - 1] === 0 && grid[y][x + 1] === 0) || (grid[y - 1][x] === 0 && grid[y + 1][x] === 0))) grid[y][x] = 0;
  }
  // Bezpieczny pokój startowy i dziedziniec przy portalu.
  for (const [cx, cy] of [[1, 1], [C - 3, R - 3]]) {
    for (let y = cy; y <= cy + 1; y++) for (let x = cx; x <= cx + 1; x++) grid[y][x] = 0;
  }
  return grid;
}

export class TempleRound extends CanvasRound {
  private grid = maze();
  private explorers: Explorer[];
  private relics: Cell[] = [];
  private chests: Chest[] = [];
  private traps: Trap[] = [];
  private guardians: Guardian[] = [];
  private collected = 0;
  private target: number;

  constructor(canvas: HTMLCanvasElement, config: RoundConfig) {
    super(canvas, config, [260, 225, 195][config.secondary] ?? 225);
    this.target = [8, 12, 16][config.primary] ?? 12;
    this.explorers = config.players.map((p, i) => ({ ...p, x: center(1 + i % 2), y: center(1 + Math.floor(i / 2)), hearts: 4, score: 0, stamina: 100, invulnerable: 2 }));
    // Wybieramy osiągalne miejsca z labiryntu, bez startu i portalu.
    const floor: Cell[] = [];
    for (let y = 1; y < R - 1; y++) for (let x = 1; x < C - 1; x++) if (!this.grid[y][x] && x + y > 7 && Math.abs(x - EXIT.x) + Math.abs(y - EXIT.y) > 2) floor.push({ x, y });
    floor.sort(() => Math.random() - .5);
    this.relics = floor.splice(0, this.target + 5);
    this.chests = floor.splice(0, 5).map(p => ({ ...p, opened: false }));
    this.traps = floor.splice(0, 11).map(p => ({ ...p, phase: rand(0, 3.6) }));
    const number = [3, 5, 7][config.secondary] ?? 5;
    this.guardians = floor.splice(0, number).map(p => ({ x: center(p.x), y: center(p.y), speed: 75 + config.secondary * 13, stunned: 0, tx: center(p.x), ty: center(p.y), chooseAt: 0 }));
  }

  private wall(x: number, y: number) { return !this.grid[y] || this.grid[y][x] !== 0; }
  private canMove(x: number, y: number, radius: number) {
    const minX = Math.floor((x - radius) / S), maxX = Math.floor((x + radius) / S);
    const minY = Math.floor((y - radius) / S), maxY = Math.floor((y + radius) / S);
    for (let gy = minY; gy <= maxY; gy++) for (let gx = minX; gx <= maxX; gx++) if (this.wall(gx, gy)) {
      const nx = clamp(x, gx * S, (gx + 1) * S), ny = clamp(y, gy * S, (gy + 1) * S);
      if (distance(x, y, nx, ny) < radius) return false;
    }
    return true;
  }
  private move(person: { x: number; y: number }, dx: number, dy: number, radius: number) {
    if (this.canMove(person.x + dx, person.y, radius)) person.x += dx;
    if (this.canMove(person.x, person.y + dy, radius)) person.y += dy;
  }

  private hit(p: Explorer) {
    if (p.invulnerable > 0 || p.hearts <= 0) return;
    p.hearts--;
    p.invulnerable = 1.6;
    this.config.onFx(p.slot, p.hearts ? 'hit' : 'dead');
    gameAudio.hitMetal();
  }

  /** Pierwszy krok najkrótszej ścieżki w labiryncie (BFS) dla strażnika. */
  private pathStep(from: Cell, to: Cell): Cell {
    if (from.x === to.x && from.y === to.y) return from;
    const queue: Cell[] = [to];
    const seen = new Set<string>([`${to.x}:${to.y}`]);
    const distances = new Map<string, number>([[`${to.x}:${to.y}`, 0]]);
    for (let index = 0; index < queue.length; index++) {
      const at = queue[index], d = distances.get(`${at.x}:${at.y}`)!;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = at.x + dx, ny = at.y + dy, key = `${nx}:${ny}`;
        if (this.wall(nx, ny) || seen.has(key)) continue;
        seen.add(key); distances.set(key, d + 1); queue.push({ x: nx, y: ny });
      }
    }
    const options = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: from.x + dx, y: from.y + dy }))
      .filter(p => !this.wall(p.x, p.y));
    options.sort((a, b) => (distances.get(`${a.x}:${a.y}`) ?? Infinity) - (distances.get(`${b.x}:${b.y}`) ?? Infinity));
    return options[0] ?? from;
  }

  protected update(dt: number): void {
    for (const p of this.explorers) {
      if (p.hearts <= 0) continue;
      const inp = this.input(p.slot);
      const sprint = inp.action && p.stamina > 2;
      p.stamina = clamp(p.stamina + dt * (sprint ? -30 : 14), 0, 100);
      p.invulnerable = Math.max(0, p.invulnerable - dt);
      const mag = Math.max(1, Math.hypot(inp.x, inp.y));
      const speed = sprint ? 220 : 145;
      this.move(p, inp.x / mag * speed * dt, inp.y / mag * speed * dt, 12);
      for (const relic of [...this.relics]) if (distance(p.x, p.y, center(relic.x), center(relic.y)) < 20) {
        this.relics.splice(this.relics.indexOf(relic), 1); this.collected++; p.score++;
        this.config.onFx(p.slot, 'pickup'); gameAudio.pickup();
      }
      for (const chest of this.chests) if (!chest.opened && inp.action && distance(p.x, p.y, center(chest.x), center(chest.y)) < 39) {
        chest.opened = true; this.collected += 2; p.score += 2; p.hearts = Math.min(4, p.hearts + 1);
        this.config.onFx(p.slot, 'pickup'); gameAudio.pickup();
      }
      for (const trap of this.traps) if ((this.clock + trap.phase) % 3.6 < 1.0 && distance(p.x, p.y, center(trap.x), center(trap.y)) < 18) this.hit(p);
      if (this.collected >= this.target && inp.action && distance(p.x, p.y, center(EXIT.x), center(EXIT.y)) < 37) {
        this.finish({ title: 'Skarbiec zdobyty!', subtitle: `Zebraliście ${this.collected} reliktów i razem otworzyliście portal ucieczki.`, winnerSlot: null, allWon: true, players: this.ranking() });
      }
    }
    for (const g of this.guardians) {
      if (g.stunned > 0) { g.stunned -= dt; continue; }
      const target = this.explorers.filter(p => p.hearts > 0).sort((a, b) => distance(a.x, a.y, g.x, g.y) - distance(b.x, b.y, g.x, g.y))[0];
      if (!target) continue;
      if (this.clock > g.chooseAt) {
        g.chooseAt = this.clock + .45;
        const step = this.pathStep({ x: Math.floor(g.x / S), y: Math.floor(g.y / S) }, { x: Math.floor(target.x / S), y: Math.floor(target.y / S) });
        g.tx = center(step.x); g.ty = center(step.y);
      }
      const dx = g.tx - g.x, dy = g.ty - g.y, mag = Math.hypot(dx, dy);
      if (mag > 2) this.move(g, dx / mag * Math.min(g.speed * dt, mag), dy / mag * Math.min(g.speed * dt, mag), 11);
      for (const p of this.explorers) if (p.hearts > 0 && distance(p.x, p.y, g.x, g.y) < 25) {
        const sprint = this.input(p.slot).action && p.stamina > 18;
        if (sprint) { g.stunned = 2.5; p.stamina -= 18; this.config.onFx(p.slot, 'shield'); }
        else this.hit(p);
      }
    }
    if (this.explorers.every(p => p.hearts <= 0)) this.finish({ title: 'Wyprawa przerwana', subtitle: 'Strażnicy zatrzymali drużynę. Spróbujcie wspólnie znaleźć inną drogę.', winnerSlot: null, players: this.ranking() });
  }

  private ranking(): RoundPlayer[] {
    return [...this.explorers].sort((a, b) => b.score - a.score).map(p => ({ slot: p.slot, name: p.name, color: p.color, score: p.score, detail: p.hearts > 0 ? `${p.hearts} serca` : 'Eliminacja', value: Math.round(p.stamina), maxValue: 100, isBot: false }));
  }
  protected hud(): RoundHud {
    return { timeLeft: this.timeLeft, countdown: this.countdown, paused: this.paused, objective: `${Math.min(this.collected, this.target)}/${this.target} reliktów`, status: this.collected >= this.target ? 'PORTAL OTWARTY · PRZY WYJŚCIU NACIŚNIJ AKCJA' : 'ZBIERAJ RELIKTY · OTWIERAJ SKRZYNIE', players: this.ranking() };
  }
  protected timeout(): void { this.finish({ title: 'Świątynia się zamknęła', subtitle: `Zebraliście ${this.collected}/${this.target} reliktów. Czas uciekł.`, winnerSlot: null, players: this.ranking() }); }

  protected render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#101a18'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    glow(ctx, 600, 350, 550, 'rgba(189,143,55,.12)');
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
      const px = OX + x * S, py = OY + y * S;
      if (this.grid[y][x]) {
        roundRect(ctx, px + 1, py + 1, S - 2, S - 2, 3, (x + y) % 3 ? '#31443a' : '#37473b', '#52664b');
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.fillRect(px + 6, py + S - 8, S - 12, 2);
      } else {
        ctx.fillStyle = (x + y) % 2 ? '#27372d' : '#29392f'; ctx.fillRect(px, py, S, S);
        ctx.strokeStyle = 'rgba(156,184,127,.08)'; ctx.strokeRect(px + 1, py + 1, S - 2, S - 2);
        if ((x * 17 + y * 23) % 9 === 0) { ctx.fillStyle = '#44684a'; ctx.beginPath(); ctx.arc(px + 8, py + 29, 2.5, 0, Math.PI * 2); ctx.fill(); }
      }
    }
    // torches in the wall corners
    for (const [gx, gy] of [[1, 1], [23, 1], [1, 13], [23, 13], [11, 7]]) {
      const x = OX + center(gx), y = OY + center(gy);
      glow(ctx, x, y, 75 + Math.sin(this.clock * 6 + gx) * 6, 'rgba(251,176,53,.26)');
      ctx.fillStyle = '#eab65c'; ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
    }
    for (const trap of this.traps) {
      const x = OX + trap.x * S, y = OY + trap.y * S, cycle = (this.clock + trap.phase) % 3.6;
      const active = cycle < 1;
      roundRect(ctx, x + 6, y + 6, 28, 28, 5, active ? '#8c392c' : cycle > 3.05 ? '#705d39' : '#3c4d39', active ? '#f97316' : '#6d7557');
      ctx.fillStyle = active ? '#fbbf24' : '#929c75'; ctx.textAlign = 'center'; ctx.font = 'bold 19px serif'; ctx.fillText('✣', x + 20, y + 27);
      if (active) glow(ctx, x + 20, y + 20, 32, 'rgba(249,115,22,.3)');
    }
    for (const relic of this.relics) {
      const x = OX + center(relic.x), y = OY + center(relic.y) + Math.sin(this.clock * 3 + relic.x) * 3;
      glow(ctx, x, y, 24, 'rgba(110,231,183,.34)');
      ctx.fillStyle = '#a7f3d0'; ctx.beginPath(); ctx.moveTo(x, y - 11); ctx.lineTo(x + 8, y); ctx.lineTo(x, y + 11); ctx.lineTo(x - 8, y); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#ecfdf5'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    for (const chest of this.chests) {
      const x = OX + chest.x * S, y = OY + chest.y * S;
      roundRect(ctx, x + 7, y + 11, 26, 21, 3, chest.opened ? '#42493c' : '#76532d', chest.opened ? '#5c6658' : '#eab65c');
      ctx.fillStyle = chest.opened ? '#28352d' : '#fbbf24'; ctx.fillRect(x + 18, y + 14, 4, 12);
    }
    const ex = OX + center(EXIT.x), ey = OY + center(EXIT.y), opened = this.collected >= this.target;
    glow(ctx, ex, ey, 52, opened ? 'rgba(52,211,153,.5)' : 'rgba(251,191,36,.18)');
    ctx.strokeStyle = opened ? '#6ee7b7' : '#b99859'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.ellipse(ex, ey, 15, 20, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = opened ? '#34d399' : '#6b6450'; ctx.beginPath(); ctx.ellipse(ex, ey, 12, 17, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#fff5d9'; ctx.textAlign = 'center'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(opened ? 'WYJŚCIE' : 'ZAMKNIĘTE', ex, ey - 26);
    for (const g of this.guardians) {
      const x = OX + g.x, y = OY + g.y;
      glow(ctx, x, y, 26, 'rgba(244,114,74,.3)');
      ctx.fillStyle = g.stunned > 0 ? '#738b95' : '#bf5f41'; ctx.beginPath(); ctx.arc(x, y, 13, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#221c18'; ctx.fillRect(x - 6, y - 3, 4, 4); ctx.fillRect(x + 3, y - 3, 4, 4);
    }
    for (const p of this.explorers) {
      if (p.hearts <= 0) continue;
      const x = OX + p.x, y = OY + p.y;
      ctx.globalAlpha = p.invulnerable > 0 && Math.sin(this.clock * 17) > 0 ? .55 : 1;
      glow(ctx, x, y, 40, `${p.color}3b`);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(x, y + 10, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(x, y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#19332c'; ctx.beginPath(); ctx.arc(x, y - 3, 5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      roundRect(ctx, x - 27, y - 34, 54, 15, 4, 'rgba(6,20,15,.8)');
      ctx.fillStyle = p.color; ctx.textAlign = 'center'; ctx.font = 'bold 10px sans-serif'; ctx.fillText(p.name.toUpperCase().slice(0, 9), x, y - 23);
    }
    ctx.fillStyle = '#b7a777'; ctx.textAlign = 'left'; ctx.font = 'bold 12px monospace'; ctx.fillText('SKARBIEC ŚWIĄTYNI  /  PODZIEMIA', 24, HEIGHT - 19);
  }
}
