import { CanvasRound, HEIGHT, WIDTH, clamp, distance, glow, rand, roundRect, type Racer, type RoundConfig, type RoundHud, type RoundPlayer } from '../runtime';
import { gameAudio } from '../../game/audio';

interface Ship extends Racer { x: number; y: number; vx: number; vy: number; angle: number; hp: number; lives: number; score: number; fireAt: number; invulnerable: number; respawn: number; shield: number; rapid: number }
interface Drone { x: number; y: number; vx: number; vy: number; hp: number; radius: number; kind: 'scout' | 'brute'; fireAt: number; phase: number }
interface Rock { x: number; y: number; vx: number; vy: number; size: number; hp: number; spin: number }
interface Shot { x: number; y: number; vx: number; vy: number; radius: number; life: number; owner: number; enemy: boolean }
interface Bonus { x: number; y: number; kind: 'repair' | 'shield' | 'rapid'; life: number }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string }

export class OrbitRound extends CanvasRound {
  private ships: Ship[];
  private drones: Drone[] = [];
  private rocks: Rock[] = [];
  private shots: Shot[] = [];
  private bonuses: Bonus[] = [];
  private sparks: Spark[] = [];
  private wave = 1;
  private targetWaves: number;
  private difficulty: number;
  private nextWave = -1;
  private stars = Array.from({ length: 160 }, () => ({ x: rand(0, WIDTH), y: rand(0, HEIGHT), size: rand(.5, 2.2), phase: rand(0, 6.28) }));

  constructor(canvas: HTMLCanvasElement, config: RoundConfig) {
    const waves = [3, 5, 7][config.primary] ?? 3;
    super(canvas, config, 170 + waves * 38);
    this.targetWaves = waves;
    this.difficulty = config.secondary;
    this.ships = config.players.map((p, i) => ({
      ...p, x: 420 + (i % 2) * 300, y: 300 + Math.floor(i / 2) * 120,
      vx: 0, vy: 0, angle: -Math.PI / 2, hp: 100, lives: 3, score: 0,
      fireAt: 0, invulnerable: 2, respawn: 0, shield: 0, rapid: 0,
    }));
    this.spawnWave();
  }

  private spawnRock(x = rand(30, WIDTH - 30), y = rand(30, HEIGHT - 30), size = 3) {
    this.rocks.push({ x, y, size, hp: size * 2, vx: rand(-35, 35), vy: rand(-35, 35), spin: rand(0, 6.28) });
  }

  private spawnWave() {
    for (let i = 0; i < 2 + this.wave; i++) this.spawnRock();
    const count = 2 + this.wave * 2 + this.difficulty + Math.max(0, this.ships.length - 1);
    for (let i = 0; i < count; i++) {
      const side = Math.floor(rand(0, 4));
      const x = side === 0 ? -35 : side === 1 ? WIDTH + 35 : rand(60, WIDTH - 60);
      const y = side === 2 ? -35 : side === 3 ? HEIGHT + 35 : rand(60, HEIGHT - 60);
      const kind = i % 4 === 3 ? 'brute' : 'scout';
      this.drones.push({ x, y, vx: 0, vy: 0, hp: (kind === 'brute' ? 4 : 2) + this.difficulty, radius: kind === 'brute' ? 25 : 16, kind, phase: rand(0, 6.28), fireAt: rand(1.5, 4) });
    }
  }

  private sparksAt(x: number, y: number, color: string, n = 10) {
    for (let i = 0; i < n; i++) this.sparks.push({ x, y, vx: rand(-155, 155), vy: rand(-155, 155), life: rand(.2, .8), max: .8, color });
    if (this.sparks.length > 180) this.sparks.splice(0, this.sparks.length - 180);
  }

  private hurt(ship: Ship, damage: number) {
    if (ship.invulnerable > 0 || ship.respawn > 0 || ship.lives <= 0) return;
    if (ship.shield > 0) { ship.shield = 0; ship.invulnerable = .45; this.config.onFx(ship.slot, 'shield'); this.sparksAt(ship.x, ship.y, '#67e8f9'); return; }
    ship.hp = Math.max(0, ship.hp - damage);
    ship.invulnerable = .9;
    this.config.onFx(ship.slot, 'hit');
    this.sparksAt(ship.x, ship.y, '#fb923c');
    if (ship.hp <= 0) {
      ship.lives--;
      ship.respawn = ship.lives > 0 ? 2.2 : 0;
      this.config.onFx(ship.slot, 'dead');
      gameAudio.explosion();
      this.sparksAt(ship.x, ship.y, ship.color, 25);
    }
  }

  private shoot(ship: Ship) {
    const interval = ship.rapid > 0 ? .095 : .22;
    if (this.clock < ship.fireAt) return;
    ship.fireAt = this.clock + interval;
    const a = ship.angle;
    this.shots.push({ x: ship.x + Math.cos(a) * 23, y: ship.y + Math.sin(a) * 23, vx: Math.cos(a) * 560 + ship.vx * .3, vy: Math.sin(a) * 560 + ship.vy * .3, radius: 5, life: 1.8, owner: ship.slot, enemy: false });
    this.config.onFx(ship.slot, 'fire');
    // Subtelny dźwięk tylko co kilka strzałów, żeby seria nie była głośna.
    if (Math.random() < .28) gameAudio.uiClick();
  }

  protected update(dt: number): void {
    for (const ship of this.ships) {
      if (ship.lives <= 0) continue;
      if (ship.respawn > 0) {
        ship.respawn -= dt;
        if (ship.respawn <= 0) { ship.hp = 100; ship.x = 600 + rand(-80, 80); ship.y = 360 + rand(-80, 80); ship.vx = 0; ship.vy = 0; ship.invulnerable = 2; this.config.onFx(ship.slot, 'respawn'); }
        continue;
      }
      ship.invulnerable = Math.max(0, ship.invulnerable - dt);
      ship.shield = Math.max(0, ship.shield - dt);
      ship.rapid = Math.max(0, ship.rapid - dt);
      const inp = this.input(ship.slot);
      ship.vx = (ship.vx + inp.x * 620 * dt) * (1 - dt * 2.5);
      ship.vy = (ship.vy + inp.y * 620 * dt) * (1 - dt * 2.5);
      const speed = Math.hypot(ship.vx, ship.vy);
      if (speed > 300) { ship.vx *= 300 / speed; ship.vy *= 300 / speed; }
      ship.x = clamp(ship.x + ship.vx * dt, 20, WIDTH - 20);
      ship.y = clamp(ship.y + ship.vy * dt, 20, HEIGHT - 20);
      if (Math.hypot(inp.aimX, inp.aimY) > .18) ship.angle = Math.atan2(inp.aimY, inp.aimX);
      else {
        const target = [...this.drones, ...this.rocks].reduce<Drone | Rock | null>((best, enemy) => !best || distance(enemy.x, enemy.y, ship.x, ship.y) < distance(best.x, best.y, ship.x, ship.y) ? enemy : best, null);
        if (target) ship.angle = Math.atan2(target.y - ship.y, target.x - ship.x);
        else if (Math.hypot(inp.x, inp.y) > .3) ship.angle = Math.atan2(inp.y, inp.x);
      }
      if (inp.action) this.shoot(ship);
      for (const bonus of [...this.bonuses]) if (distance(ship.x, ship.y, bonus.x, bonus.y) < 30) {
        if (bonus.kind === 'repair') ship.hp = Math.min(100, ship.hp + 40);
        if (bonus.kind === 'shield') ship.shield = 7;
        if (bonus.kind === 'rapid') ship.rapid = 7;
        this.bonuses.splice(this.bonuses.indexOf(bonus), 1);
        this.config.onFx(ship.slot, 'pickup'); gameAudio.pickup();
      }
    }

    for (const drone of this.drones) {
      const target = this.ships.filter(s => s.lives > 0 && s.respawn <= 0).sort((a, b) => distance(a.x, a.y, drone.x, drone.y) - distance(b.x, b.y, drone.x, drone.y))[0];
      if (!target) continue;
      const dx = target.x - drone.x, dy = target.y - drone.y, d = Math.max(1, Math.hypot(dx, dy));
      const move = d > 210 ? 1 : d < 150 ? -.5 : .25;
      drone.vx += (dx / d * 90 * move - drone.vx) * Math.min(1, dt * 1.7);
      drone.vy += (dy / d * 90 * move - drone.vy) * Math.min(1, dt * 1.7);
      drone.x += drone.vx * dt; drone.y += drone.vy * dt;
      drone.fireAt -= dt;
      if (drone.fireAt <= 0 && d < 520) {
        const rate = Math.max(1.2, 3.4 - this.wave * .17 - this.difficulty * .35);
        drone.fireAt = rate + rand(0, 1.1);
        this.shots.push({ x: drone.x, y: drone.y, vx: dx / d * 250, vy: dy / d * 250, life: 3, radius: 6, owner: -1, enemy: true });
      }
      for (const ship of this.ships) if (distance(ship.x, ship.y, drone.x, drone.y) < drone.radius + 16) this.hurt(ship, 22);
    }

    for (const rock of this.rocks) {
      rock.x += rock.vx * dt; rock.y += rock.vy * dt; rock.spin += dt * .45;
      if (rock.x < 14 || rock.x > WIDTH - 14) rock.vx *= -1;
      if (rock.y < 14 || rock.y > HEIGHT - 14) rock.vy *= -1;
      rock.x = clamp(rock.x, 14, WIDTH - 14); rock.y = clamp(rock.y, 14, HEIGHT - 14);
      for (const ship of this.ships) if (distance(ship.x, ship.y, rock.x, rock.y) < rock.size * 11 + 13) this.hurt(ship, rock.size * 13);
    }

    for (const shot of [...this.shots]) {
      shot.x += shot.vx * dt; shot.y += shot.vy * dt; shot.life -= dt;
      if (shot.life <= 0 || shot.x < -30 || shot.x > WIDTH + 30 || shot.y < -30 || shot.y > HEIGHT + 30) { this.shots.splice(this.shots.indexOf(shot), 1); continue; }
      if (shot.enemy) {
        for (const ship of this.ships) if (ship.respawn <= 0 && ship.lives > 0 && distance(shot.x, shot.y, ship.x, ship.y) < 19) { this.hurt(ship, 26 + this.difficulty * 4); shot.life = 0; break; }
      } else {
        for (const foe of [...this.drones]) if (distance(shot.x, shot.y, foe.x, foe.y) < foe.radius + shot.radius) {
          foe.hp--; shot.life = 0; this.sparksAt(foe.x, foe.y, '#fb923c', 3);
          if (foe.hp <= 0) {
            this.drones.splice(this.drones.indexOf(foe), 1);
            const owner = this.ships.find(p => p.slot === shot.owner);
            if (owner) { owner.score += foe.kind === 'brute' ? 3 : 1; this.config.onFx(owner.slot, 'kill'); }
            if (Math.random() < .22) this.bonuses.push({ x: foe.x, y: foe.y, kind: (['repair', 'rapid', 'shield'] as const)[Math.floor(rand(0, 3))], life: 12 });
            this.sparksAt(foe.x, foe.y, '#fda4af', 17);
            gameAudio.hitMetal();
          }
          break;
        }
        if (shot.life > 0) for (const rock of [...this.rocks]) if (distance(shot.x, shot.y, rock.x, rock.y) < rock.size * 11) {
          rock.hp--; shot.life = 0;
          if (rock.hp <= 0) {
            this.rocks.splice(this.rocks.indexOf(rock), 1);
            if (rock.size > 1) for (let i = 0; i < 2; i++) this.spawnRock(rock.x + rand(-12, 12), rock.y + rand(-12, 12), rock.size - 1);
            const owner = this.ships.find(p => p.slot === shot.owner);
            if (owner) owner.score++;
            this.sparksAt(rock.x, rock.y, '#94a3b8', 9);
          }
          break;
        }
      }
      if (shot.life <= 0 && this.shots.includes(shot)) this.shots.splice(this.shots.indexOf(shot), 1);
    }
    this.bonuses = this.bonuses.filter(b => (b.life -= dt) > 0);
    this.sparks = this.sparks.filter(s => { s.life -= dt; s.x += s.vx * dt; s.y += s.vy * dt; return s.life > 0; });

    if (this.ships.every(s => s.lives <= 0)) { this.finish({ title: 'Flota została pokonana', subtitle: `Dotarliście do fali ${this.wave} z ${this.targetWaves}. Spróbujcie jeszcze raz!`, winnerSlot: null, players: this.ranking() }); return; }
    if (!this.drones.length) {
      if (this.nextWave < 0) this.nextWave = this.clock + 2.5;
      if (this.clock >= this.nextWave) {
        if (this.wave >= this.targetWaves) this.finish({ title: 'Galaktyka ocalona!', subtitle: `Odpieraliście wszystkie ${this.targetWaves} fale. Świetna robota, załogo!`, winnerSlot: null, allWon: true, players: this.ranking() });
        else { this.wave++; this.nextWave = -1; this.spawnWave(); }
      }
    }
  }

  private ranking(): RoundPlayer[] {
    return [...this.ships].sort((a, b) => b.score - a.score).map(s => ({ slot: s.slot, name: s.name, color: s.color, score: s.score, detail: s.lives <= 0 ? 'Eliminacja' : `${s.lives} życia · ${s.hp} HP`, value: s.hp, maxValue: 100, isBot: false }));
  }
  protected hud(): RoundHud {
    return { timeLeft: this.timeLeft, countdown: this.countdown, paused: this.paused, objective: `Przetrwaj ${this.targetWaves} fal`, status: this.drones.length ? `FALA ${this.wave}/${this.targetWaves} · ${this.drones.length} CELÓW` : 'CZYSTO! NADCIĄGA KOLEJNA FALA', players: this.ranking() };
  }
  protected timeout(): void { this.finish({ title: 'Czas minął', subtitle: `Dotarliście do fali ${this.wave}. Wróćcie po więcej!`, winnerSlot: null, players: this.ranking() }); }

  protected render(ctx: CanvasRenderingContext2D): void {
    ctx.fillStyle = '#060a1a'; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    glow(ctx, 950, 390, 370, 'rgba(59,130,246,.13)');
    ctx.beginPath(); ctx.arc(1050, 580, 270, 0, Math.PI * 2);
    const planet = ctx.createRadialGradient(995, 490, 10, 1050, 580, 275);
    planet.addColorStop(0, '#204c7d'); planet.addColorStop(.65, '#09203d'); planet.addColorStop(1, '#040919');
    ctx.fillStyle = planet; ctx.fill(); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(76,158,248,.45)'; ctx.stroke();
    for (const star of this.stars) { ctx.globalAlpha = .3 + .35 * Math.sin(this.clock * 1.4 + star.phase) ** 2; ctx.fillStyle = '#d6ecff'; ctx.beginPath(); ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2); ctx.fill(); }
    ctx.globalAlpha = 1;
    for (const rock of this.rocks) {
      ctx.save(); ctx.translate(rock.x, rock.y); ctx.rotate(rock.spin);
      ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = rock.size * 11 * (i % 2 ? .84 : 1); if (!i) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r); else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); } ctx.closePath();
      ctx.fillStyle = '#37465a'; ctx.fill(); ctx.strokeStyle = '#899bb1'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
    }
    for (const bonus of this.bonuses) {
      glow(ctx, bonus.x, bonus.y, 33, 'rgba(52,211,153,.26)');
      ctx.save(); ctx.translate(bonus.x, bonus.y); ctx.rotate(this.clock); roundRect(ctx, -11, -11, 22, 22, 4, bonus.kind === 'repair' ? '#4ade80' : bonus.kind === 'shield' ? '#67e8f9' : '#fbbf24', '#f8fafc'); ctx.restore();
      ctx.fillStyle = '#071223'; ctx.font = 'bold 15px monospace'; ctx.textAlign = 'center'; ctx.fillText(bonus.kind === 'repair' ? '+' : bonus.kind === 'shield' ? '◇' : '↯', bonus.x, bonus.y + 5);
    }
    for (const drone of this.drones) {
      glow(ctx, drone.x, drone.y, drone.radius * 2, 'rgba(251,113,133,.24)');
      ctx.save(); ctx.translate(drone.x, drone.y); ctx.rotate(this.clock * (drone.kind === 'brute' ? -.7 : 1) + drone.phase);
      ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; if (!i) ctx.moveTo(Math.cos(a) * drone.radius, Math.sin(a) * drone.radius); else ctx.lineTo(Math.cos(a) * drone.radius, Math.sin(a) * drone.radius); } ctx.closePath();
      ctx.fillStyle = drone.kind === 'brute' ? '#9f1239' : '#642548'; ctx.fill(); ctx.strokeStyle = '#fb7185'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#fda4af'; ctx.beginPath(); ctx.arc(0, 0, drone.kind === 'brute' ? 7 : 4, 0, Math.PI * 2); ctx.fill(); ctx.restore();
    }
    for (const shot of this.shots) {
      ctx.shadowBlur = 12; ctx.shadowColor = shot.enemy ? '#fb7185' : '#7dd3fc'; ctx.fillStyle = shot.enemy ? '#fb7185' : '#a5f3fc';
      ctx.beginPath(); ctx.arc(shot.x, shot.y, shot.radius, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
    for (const ship of this.ships) {
      if (ship.lives <= 0 || ship.respawn > 0) continue;
      ctx.globalAlpha = ship.invulnerable > 0 && Math.sin(this.clock * 20) > 0 ? .48 : 1;
      glow(ctx, ship.x, ship.y, 48, `${ship.color}30`);
      ctx.save(); ctx.translate(ship.x, ship.y); ctx.rotate(ship.angle);
      ctx.fillStyle = `${ship.color}88`; ctx.beginPath(); ctx.moveTo(-18, -8); ctx.lineTo(-18 - 15 - rand(0, 4), 0); ctx.lineTo(-18, 8); ctx.fill();
      ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-15, -16); ctx.lineTo(-9, 0); ctx.lineTo(-15, 16); ctx.closePath();
      ctx.fillStyle = ship.color; ctx.shadowColor = ship.color; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#0a2032'; ctx.beginPath(); ctx.arc(2, 0, 5, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      if (ship.shield > 0) { ctx.strokeStyle = '#67e8f9'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(ship.x, ship.y, 26, 0, Math.PI * 2); ctx.stroke(); }
      ctx.globalAlpha = 1;
      ctx.fillStyle = ship.color; ctx.textAlign = 'center'; ctx.font = 'bold 11px sans-serif'; ctx.fillText(ship.name.toUpperCase(), ship.x, ship.y - 28);
    }
    for (const s of this.sparks) { ctx.globalAlpha = clamp(s.life / s.max, 0, 1); ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, 3, 3); } ctx.globalAlpha = 1;
    ctx.fillStyle = '#6e8aaa'; ctx.textAlign = 'left'; ctx.font = 'bold 12px monospace'; ctx.fillText('ORBITALNA FALA  /  SEKTOR 07', 25, HEIGHT - 22);
  }
}
