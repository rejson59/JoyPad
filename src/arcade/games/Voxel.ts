import { CanvasRound, HEIGHT, WIDTH, clamp, distance, glow, rand, roundRect, type Racer, type RoundConfig, type RoundHud, type RoundPlayer } from '../runtime';
import { gameAudio } from '../../game/audio';

const COLS = 18;
const ROWS = 12;
const TILE_W = 48;
const TILE_H = 24;
const HEIGHT_STEP = 20;
const ORIGIN_X = WIDTH / 2;
const ORIGIN_Y = 118;

type ResourceKind = 'crystal' | 'wood' | 'ore';
interface Resource { x: number; y: number; kind: ResourceKind; active: boolean; phase: number }
interface Builder extends Racer { x: number; y: number; hp: number; score: number; carrying: number; cooldown: number; invulnerable: number }
interface Crawler { x: number; y: number; speed: number; hp: number; phase: number; target: number }

function iso(gx: number, gy: number, z = 0) {
  return { x: ORIGIN_X + (gx - gy) * TILE_W / 2, y: ORIGIN_Y + (gx + gy) * TILE_H / 2 - z * HEIGHT_STEP };
}

function shade(hex: string, amount: number) {
  const value = Number.parseInt(hex.slice(1), 16);
  const r = clamp((value >> 16) + amount, 0, 255);
  const g = clamp(((value >> 8) & 255) + amount, 0, 255);
  const b = clamp((value & 255) + amount, 0, 255);
  return `rgb(${r},${g},${b})`;
}

function block(ctx: CanvasRenderingContext2D, gx: number, gy: number, height: number, top: string) {
  const p = iso(gx, gy, height);
  const halfW = TILE_W / 2;
  const halfH = TILE_H / 2;
  ctx.beginPath();
  ctx.moveTo(p.x, p.y - halfH); ctx.lineTo(p.x + halfW, p.y); ctx.lineTo(p.x, p.y + halfH); ctx.lineTo(p.x - halfW, p.y); ctx.closePath();
  ctx.fillStyle = top; ctx.fill();
  ctx.strokeStyle = 'rgba(255,236,190,.12)'; ctx.lineWidth = 1; ctx.stroke();
  ctx.beginPath(); ctx.moveTo(p.x - halfW, p.y); ctx.lineTo(p.x, p.y + halfH); ctx.lineTo(p.x, p.y + halfH + height * HEIGHT_STEP); ctx.lineTo(p.x - halfW, p.y + height * HEIGHT_STEP); ctx.closePath();
  ctx.fillStyle = shade(top, -24); ctx.fill();
  ctx.beginPath(); ctx.moveTo(p.x + halfW, p.y); ctx.lineTo(p.x, p.y + halfH); ctx.lineTo(p.x, p.y + halfH + height * HEIGHT_STEP); ctx.lineTo(p.x + halfW, p.y + height * HEIGHT_STEP); ctx.closePath();
  ctx.fillStyle = shade(top, -42); ctx.fill();
}

function playerScreen(p: Builder) {
  return iso(p.x, p.y, 1.35);
}

export class VoxelRound extends CanvasRound {
  private builders: Builder[];
  private terrain: number[][];
  private resources: Resource[] = [];
  private crawlers: Crawler[] = [];
  private target: number;
  private collected = 0;
  private baseLevel = 1;
  private difficulty: number;
  private stars = Array.from({ length: 48 }, () => ({ x: rand(20, WIDTH - 20), y: rand(20, 240), size: rand(.5, 2), phase: rand(0, 6.28) }));

  constructor(canvas: HTMLCanvasElement, config: RoundConfig) {
    const targets = [8, 12, 16];
    const target = targets[config.primary] ?? 8;
    super(canvas, config, 145 + target * 3);
    this.target = target;
    this.difficulty = config.secondary;
    this.terrain = Array.from({ length: ROWS }, (_, y) => Array.from({ length: COLS }, (_, x) => {
      const edge = x === 0 || y === 0 || x === COLS - 1 || y === ROWS - 1;
      return edge ? 3 : 1 + Math.floor(rand(0, 3));
    }));
    // Keep the spawn/base pad readable and flat.
    for (let y = 4; y < 8; y++) for (let x = 7; x < 11; x++) this.terrain[y][x] = 1;
    const kinds: ResourceKind[] = ['crystal', 'wood', 'ore'];
    for (let i = 0; i < target + 6; i++) {
      let x = 2 + Math.floor(rand(0, COLS - 4)), y = 2 + Math.floor(rand(0, ROWS - 4));
      if (x >= 7 && x <= 10 && y >= 4 && y <= 7) { x = 2; y = 2; }
      this.resources.push({ x, y, kind: kinds[i % kinds.length], active: true, phase: rand(0, 6.28) });
    }
    this.builders = config.players.map((p, i) => ({
      ...p, x: 7.6 + (i % 2) * 2.2, y: 5.2 + Math.floor(i / 2) * 1.4,
      hp: 100, score: 0, carrying: 0, cooldown: 0, invulnerable: 1.8,
    }));
    for (let i = 0; i < 2 + this.difficulty; i++) this.crawlers.push({ x: rand(2, COLS - 2), y: rand(2, ROWS - 2), speed: .28 + this.difficulty * .06, hp: 2, phase: rand(0, 6.28), target: 0 });
  }

  private botInput(builder: Builder) {
    const target = this.resources.filter(r => r.active).sort((a, b) => distance(builder.x, builder.y, a.x, a.y) - distance(builder.x, builder.y, b.x, b.y))[0];
    if (!target) return { x: 0, y: 0 };
    const dx = target.x - builder.x, dy = target.y - builder.y, mag = Math.max(.01, Math.hypot(dx, dy));
    return { x: dx / mag, y: dy / mag };
  }

  private hit(builder: Builder) {
    if (builder.invulnerable > 0 || builder.hp <= 0) return;
    builder.hp = Math.max(0, builder.hp - 24);
    builder.invulnerable = 1.1;
    this.config.onFx(builder.slot, builder.hp ? 'hit' : 'dead');
    gameAudio.hitMetal();
    if (builder.hp <= 0) {
      builder.hp = 100; builder.x = 8.8; builder.y = 6; builder.carrying = 0; builder.invulnerable = 2.5;
      this.config.onFx(builder.slot, 'respawn');
    }
  }

  protected update(dt: number): void {
    const night = (this.clock % 48) > 32;
    for (const builder of this.builders) {
      builder.cooldown = Math.max(0, builder.cooldown - dt);
      builder.invulnerable = Math.max(0, builder.invulnerable - dt);
      const input = builder.isBot ? this.botInput(builder) : this.input(builder.slot);
      const mag = Math.max(1, Math.hypot(input.x, input.y));
      builder.x = clamp(builder.x + input.x / mag * dt * (builder.isBot ? 2.1 : 2.7), 1.25, COLS - 1.25);
      builder.y = clamp(builder.y + input.y / mag * dt * (builder.isBot ? 2.1 : 2.7), 1.25, ROWS - 1.25);
      const botAction = builder.isBot && builder.cooldown <= .01;
      const action = this.input(builder.slot).action || botAction;
      if (action && builder.cooldown <= .01) {
        const resource = this.resources.find(r => r.active && distance(builder.x, builder.y, r.x + .5, r.y + .5) < .95);
        if (resource) {
          resource.active = false; builder.carrying++; builder.score += resource.kind === 'crystal' ? 2 : 1; this.collected++;
          builder.cooldown = .35; this.config.onFx(builder.slot, 'pickup'); gameAudio.pickup();
        } else if (builder.x > 7 && builder.x < 11 && builder.y > 4 && builder.y < 8 && builder.carrying > 0) {
          this.baseLevel = Math.min(4, this.baseLevel + builder.carrying * .08); builder.carrying = 0; builder.cooldown = .5;
          this.config.onFx(builder.slot, 'shield');
        }
      }
      if (night) for (const crawler of this.crawlers) if (distance(builder.x, builder.y, crawler.x, crawler.y) < .7) this.hit(builder);
    }

    for (const crawler of this.crawlers) {
      const target = this.builders.filter(p => p.hp > 0).sort((a, b) => distance(a.x, a.y, crawler.x, crawler.y) - distance(b.x, b.y, crawler.x, crawler.y))[0];
      if (!target) continue;
      const dx = target.x - crawler.x, dy = target.y - crawler.y, mag = Math.max(.01, Math.hypot(dx, dy));
      crawler.x = clamp(crawler.x + dx / mag * crawler.speed * dt, 1, COLS - 1);
      crawler.y = clamp(crawler.y + dy / mag * crawler.speed * dt, 1, ROWS - 1);
      crawler.phase += dt * 5;
    }
    if (this.collected >= this.target) {
      const atBase = this.builders.some(p => p.x > 7 && p.x < 11 && p.y > 4 && p.y < 8 && (this.input(p.slot).action || p.isBot));
      if (atBase) this.finish({ title: 'Baza ocalona', subtitle: `Drużyna zabezpieczyła ${this.collected} fragmentów i rozbudowała schronienie.`, winnerSlot: null, allWon: true, players: this.ranking() });
    }
    if (this.builders.every(p => p.hp <= 0)) this.finish({ title: 'Noc zwyciężyła', subtitle: 'Schronienie opustoszało. Zbierzcie surowce szybciej w kolejnej wyprawie.', winnerSlot: null, players: this.ranking() });
  }

  private ranking(): RoundPlayer[] {
    return [...this.builders].sort((a, b) => b.score - a.score).map(p => ({
      slot: p.slot, name: p.name, color: p.color, score: p.score,
      detail: `${p.carrying} niesione · ${p.hp} HP`, value: p.hp, maxValue: 100, isBot: p.isBot,
    }));
  }

  protected hud(): RoundHud {
    const night = (this.clock % 48) > 32;
    return {
      timeLeft: this.timeLeft, countdown: this.countdown, paused: this.paused,
      objective: `${Math.min(this.collected, this.target)}/${this.target} surowców`,
      status: night ? 'NOC · BROŃ BAZY' : 'DZIEŃ · ZBIERAJ I BUDUJ', players: this.ranking(),
    };
  }

  protected timeout(): void {
    this.finish({ title: 'Wyprawa zakończona', subtitle: `Zabezpieczyliście ${this.collected}/${this.target} fragmentów.`, winnerSlot: null, players: this.ranking() });
  }

  protected render(ctx: CanvasRenderingContext2D): void {
    const night = (this.clock % 48) > 32;
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, night ? '#111827' : '#2a1d1a'); sky.addColorStop(.55, night ? '#1b1b24' : '#74402b'); sky.addColorStop(1, '#0a0d0e');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    for (const star of this.stars) {
      ctx.globalAlpha = night ? .55 + Math.sin(this.clock * 2 + star.phase) * .3 : .08;
      ctx.fillStyle = '#ffe8bb'; ctx.fillRect(star.x, star.y, star.size, star.size);
    }
    ctx.globalAlpha = 1;
    // Distant low-poly ridge gives the flat canvas a restrained 3D horizon.
    ctx.fillStyle = night ? '#111419' : '#4c2c24';
    ctx.beginPath(); ctx.moveTo(0, 300); for (let x = 0; x <= WIDTH; x += 80) ctx.lineTo(x, 255 + Math.sin(x * .014) * 35); ctx.lineTo(WIDTH, 430); ctx.lineTo(0, 430); ctx.closePath(); ctx.fill();
    const sunX = night ? 930 : 260, sunY = night ? 100 : 130;
    glow(ctx, sunX, sunY, night ? 55 : 80, night ? 'rgba(184,214,255,.15)' : 'rgba(251,146,60,.28)');
    ctx.fillStyle = night ? '#c7d2fe' : '#ffd49b'; ctx.beginPath(); ctx.arc(sunX, sunY, night ? 16 : 24, 0, Math.PI * 2); ctx.fill();

    // Back-to-front iso sorting makes every block read as a physical stack.
    const cells: { x: number; y: number }[] = [];
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) cells.push({ x, y });
    cells.sort((a, b) => a.x + a.y - b.x - b.y);
    for (const cell of cells) {
      const h = this.terrain[cell.y][cell.x];
      const palette = night ? ['#3b332b', '#514336', '#62503e'] : ['#806445', '#9b7047', '#ad7d4a'];
      block(ctx, cell.x, cell.y, h, palette[(cell.x * 3 + cell.y) % palette.length]);
      if ((cell.x + cell.y) % 5 === 0) {
        const p = iso(cell.x, cell.y, h + .08);
        ctx.fillStyle = night ? '#576b60' : '#7f9c63'; ctx.fillRect(p.x - 3, p.y - 3, 6, 3);
      }
    }

    // Base pad and its build level.
    const base = iso(9, 6, this.baseLevel + .15);
    glow(ctx, base.x, base.y, 82, 'rgba(249,115,22,.18)');
    ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2; ctx.beginPath(); ctx.ellipse(base.x, base.y + 6, 76, 27, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = '#fbbf24'; ctx.font = '800 12px monospace'; ctx.textAlign = 'center'; ctx.fillText('BAZA', base.x, base.y - 30);

    for (const resource of this.resources) if (resource.active) {
      const p = iso(resource.x + .5, resource.y + .5, this.terrain[resource.y][resource.x] + .55 + Math.sin(this.clock * 3 + resource.phase) * .05);
      const color = resource.kind === 'crystal' ? '#fbbf24' : resource.kind === 'wood' ? '#d97706' : '#94a3b8';
      glow(ctx, p.x, p.y, 20, `${color}55`);
      ctx.fillStyle = color; ctx.beginPath(); ctx.moveTo(p.x, p.y - 12); ctx.lineTo(p.x + 8, p.y - 2); ctx.lineTo(p.x, p.y + 9); ctx.lineTo(p.x - 8, p.y - 2); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff0c2'; ctx.stroke();
    }

    if (night) for (const crawler of this.crawlers) {
      const ground = this.terrain[Math.floor(crawler.y)]?.[Math.floor(crawler.x)] ?? 1;
      const p = iso(crawler.x, crawler.y, ground + .7);
      glow(ctx, p.x, p.y, 24, 'rgba(239,68,68,.3)');
      ctx.fillStyle = '#9f3d34'; ctx.beginPath(); ctx.arc(p.x, p.y - 9 + Math.sin(crawler.phase) * 2, 10, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#ffd4a3'; ctx.fillRect(p.x - 5, p.y - 12, 3, 3); ctx.fillRect(p.x + 2, p.y - 12, 3, 3);
    }

    for (const builder of this.builders) {
      const p = playerScreen(builder);
      if (builder.invulnerable > 0 && Math.sin(this.clock * 16) < 0) continue;
      glow(ctx, p.x, p.y, 32, `${builder.color}44`);
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(p.x, p.y + 10, 15, 6, 0, 0, Math.PI * 2); ctx.fill();
      // Simple low-poly explorer with backpack and head highlight.
      ctx.fillStyle = builder.color; ctx.beginPath(); ctx.moveTo(p.x - 12, p.y + 9); ctx.lineTo(p.x - 8, p.y - 10); ctx.lineTo(p.x + 8, p.y - 10); ctx.lineTo(p.x + 13, p.y + 9); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f7c892'; ctx.beginPath(); ctx.arc(p.x, p.y - 15, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#1e2425'; ctx.fillRect(p.x - 4, p.y - 16, 2, 2); ctx.fillRect(p.x + 2, p.y - 16, 2, 2);
      ctx.fillStyle = 'rgba(7,10,12,.8)'; ctx.fillRect(p.x - 28, p.y - 36, 56, 14);
      ctx.fillStyle = builder.color; ctx.font = '700 9px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(builder.name.toUpperCase().slice(0, 9), p.x, p.y - 25);
      if (builder.carrying) { ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(p.x + 15, p.y - 3, 5, 0, Math.PI * 2); ctx.fill(); }
    }

    ctx.fillStyle = '#f5d5a1'; ctx.textAlign = 'left'; ctx.font = '700 12px monospace'; ctx.fillText(`VOXEL FRONTIER  /  ${night ? 'NOC' : 'DZIEŃ'}  /  BAZA LVL ${Math.floor(this.baseLevel)}`, 24, HEIGHT - 20);
    roundRect(ctx, WIDTH - 200, HEIGHT - 45, 160, 24, 7, 'rgba(7,10,12,.72)');
    ctx.fillStyle = '#fbbf24'; ctx.textAlign = 'center'; ctx.font = '700 11px monospace'; ctx.fillText('AKCJA: ZBIERZ / BUDUJ', WIDTH - 120, HEIGHT - 29);
  }
}
