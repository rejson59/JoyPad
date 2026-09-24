import { CanvasRound, HEIGHT, WIDTH, clamp, distance, glow, rand, roundRect, type Racer, type RoundConfig, type RoundHud, type RoundPlayer } from '../runtime';
import { gameAudio } from '../../game/audio';

interface Car extends Racer { x: number; y: number; vx: number; vy: number; angle: number; boost: number; score: number; team: 0 | 1; kickCooldown: number; spin: number }
interface Ball { x: number; y: number; vx: number; vy: number; spin: number }

const GOAL_TOP = 264;
const GOAL_BOTTOM = 456;
const GOAL_LIMITS = [3, 5, 7];

function carPoint(car: Car, forward: number, side: number) {
  const c = Math.cos(car.angle), s = Math.sin(car.angle);
  return { x: car.x + c * forward - s * side, y: car.y + s * forward + c * side };
}

function polygon(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], fill: string, stroke?: string) {
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); for (const point of points.slice(1)) ctx.lineTo(point.x, point.y); ctx.closePath();
  ctx.fillStyle = fill; ctx.fill(); if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

export class LeagueRound extends CanvasRound {
  private cars: Car[];
  private ball: Ball = { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0, spin: 0 };
  private goals: [number, number] = [0, 0];
  private targetGoals: number;
  private sparks: { x: number; y: number; vx: number; vy: number; life: number; color: string }[] = [];
  private crowd = Array.from({ length: 110 }, () => ({ x: rand(20, WIDTH - 20), y: rand(58, 142), color: ['#e8794f', '#fbbf24', '#64748b', '#fb923c'][Math.floor(rand(0, 4))] }));

  constructor(canvas: HTMLCanvasElement, config: RoundConfig) {
    const target = GOAL_LIMITS[config.primary] ?? 3;
    super(canvas, config, 120 + target * 20);
    this.targetGoals = target;
    this.cars = config.players.map((p, i) => ({
      ...p, x: i % 2 === 0 ? 270 + (i % 4) * 28 : 930 - (i % 4) * 28,
      y: 290 + Math.floor(i / 2) * 90, vx: 0, vy: 0, angle: i % 2 === 0 ? 0 : Math.PI,
      boost: 100, score: 0, team: (i % 2) as 0 | 1, kickCooldown: 0, spin: rand(0, 6.28),
    }));
  }

  private botVector(car: Car) {
    const targetX = this.ball.x + (car.team === 0 ? 20 : -20);
    const targetY = this.ball.y;
    const dx = targetX - car.x, dy = targetY - car.y, mag = Math.max(1, Math.hypot(dx, dy));
    return { x: dx / mag, y: dy / mag, action: distance(car.x, car.y, this.ball.x, this.ball.y) < 120 };
  }

  private sparksAt(x: number, y: number, color: string, count = 12) {
    for (let i = 0; i < count; i++) this.sparks.push({ x, y, vx: rand(-180, 180), vy: rand(-180, 180), life: rand(.2, .65), color });
    if (this.sparks.length > 160) this.sparks.splice(0, this.sparks.length - 160);
  }

  private resetKick(team: 0 | 1) {
    this.ball.x = WIDTH / 2; this.ball.y = HEIGHT / 2; this.ball.vx = team === 0 ? 150 : -150; this.ball.vy = rand(-60, 60);
    for (const car of this.cars) { car.x = car.team === 0 ? 250 : 950; car.y = 250 + car.slot * 67; car.vx = 0; car.vy = 0; }
  }

  protected update(dt: number): void {
    for (const car of this.cars) {
      car.kickCooldown = Math.max(0, car.kickCooldown - dt);
      car.spin += dt * (Math.hypot(car.vx, car.vy) * .02 + .4);
      const manual = this.input(car.slot);
      const bot = car.isBot ? this.botVector(car) : null;
      const ix = car.isBot ? bot!.x : manual.x, iy = car.isBot ? bot!.y : manual.y;
      const action = car.isBot ? bot!.action : manual.action;
      const mag = Math.max(1, Math.hypot(ix, iy));
      const boost = action && car.boost > 1;
      const accel = boost ? 900 : 510;
      car.vx += ix / mag * accel * dt; car.vy += iy / mag * accel * dt;
      const speed = Math.hypot(car.vx, car.vy), maxSpeed = boost ? 450 : 285;
      if (speed > maxSpeed) { car.vx *= maxSpeed / speed; car.vy *= maxSpeed / speed; }
      car.vx *= Math.max(0, 1 - dt * (boost ? 1.4 : 2.7)); car.vy *= Math.max(0, 1 - dt * (boost ? 1.4 : 2.7));
      if (boost) { car.boost = Math.max(0, car.boost - dt * 34); this.sparksAt(car.x - Math.cos(car.angle) * 16, car.y - Math.sin(car.angle) * 16, '#fb923c', 1); }
      else car.boost = Math.min(100, car.boost + dt * 13);
      if (Math.hypot(ix, iy) > .18) car.angle = Math.atan2(iy, ix);
      car.x = clamp(car.x + car.vx * dt, 90, WIDTH - 90); car.y = clamp(car.y + car.vy * dt, 170, HEIGHT - 78);

      const d = distance(car.x, car.y, this.ball.x, this.ball.y);
      if (d < 36 && car.kickCooldown <= 0) {
        const nx = (this.ball.x - car.x) / Math.max(1, d), ny = (this.ball.y - car.y) / Math.max(1, d);
        const kick = boost ? 680 : 410;
        this.ball.vx = nx * kick + car.vx * .45; this.ball.vy = ny * kick + car.vy * .45;
        this.ball.spin += boost ? 1.3 : .6; car.kickCooldown = .18; car.score += boost ? 2 : 1;
        this.config.onFx(car.slot, boost ? 'kill' : 'fire'); this.sparksAt(this.ball.x, this.ball.y, car.color, 10); gameAudio.hitMetal();
      }
    }

    this.ball.x += this.ball.vx * dt; this.ball.y += this.ball.vy * dt; this.ball.spin += dt * 7;
    this.ball.vx *= Math.max(0, 1 - dt * 1.1); this.ball.vy *= Math.max(0, 1 - dt * 1.1);
    if (this.ball.y < 184 || this.ball.y > HEIGHT - 92) { this.ball.y = clamp(this.ball.y, 184, HEIGHT - 92); this.ball.vy *= -.78; }
    if (this.ball.x < 74 || this.ball.x > WIDTH - 74) {
      const inGoal = this.ball.y > GOAL_TOP && this.ball.y < GOAL_BOTTOM;
      if (inGoal && (this.ball.x < 35 || this.ball.x > WIDTH - 35)) {
        const scoringTeam: 0 | 1 = this.ball.x < WIDTH / 2 ? 1 : 0;
        this.goals[scoringTeam]++;
        for (const car of this.cars.filter(c => c.team === scoringTeam)) { car.score += 5; this.config.onFx(car.slot, 'win'); }
        this.sparksAt(this.ball.x < WIDTH / 2 ? 80 : WIDTH - 80, this.ball.y, '#fbbf24', 28); gameAudio.explosion();
        if (this.goals[scoringTeam] >= this.targetGoals) {
          const winner = this.cars.find(c => c.team === scoringTeam && !c.isBot) ?? this.cars.find(c => c.team === scoringTeam);
          this.finish({ title: `Drużyna ${scoringTeam === 0 ? 'pomarańczowa' : 'niebieska'} wygrywa`, subtitle: `Wynik ${this.goals[0]} : ${this.goals[1]} · bramka przed czasem.`, winnerSlot: winner?.slot ?? null, players: this.ranking() });
        } else this.resetKick(scoringTeam === 0 ? 1 : 0);
      } else { this.ball.x = clamp(this.ball.x, 74, WIDTH - 74); this.ball.vx *= -.8; }
    }
    for (const spark of this.sparks) { spark.x += spark.vx * dt; spark.y += spark.vy * dt; spark.vx *= .94; spark.vy *= .94; spark.life -= dt; }
    this.sparks = this.sparks.filter(s => s.life > 0);
  }

  private ranking(): RoundPlayer[] {
    return [...this.cars].sort((a, b) => b.score - a.score).map(car => ({
      slot: car.slot, name: car.name, color: car.color, score: car.score,
      detail: `Drużyna ${car.team === 0 ? 'pomarańczowa' : 'niebieska'} · boost ${Math.round(car.boost)}%`, value: car.boost, maxValue: 100, isBot: car.isBot,
    }));
  }

  protected hud(): RoundHud {
    return {
      timeLeft: this.timeLeft, countdown: this.countdown, paused: this.paused,
      objective: `${this.goals[0]}  —  ${this.goals[1]}  /  ${this.targetGoals} goli`,
      status: `POMARAŃCZOWI ${this.goals[0]}  ·  NIEBIESCY ${this.goals[1]}`,
      players: this.ranking(),
    };
  }

  protected timeout(): void {
    const winnerTeam: 0 | 1 = this.goals[0] === this.goals[1] ? 0 : this.goals[0] > this.goals[1] ? 0 : 1;
    const winner = this.cars.find(c => c.team === winnerTeam && !c.isBot) ?? this.cars.find(c => c.team === winnerTeam);
    this.finish({ title: this.goals[0] === this.goals[1] ? 'Remis na stadionie' : `Wygrywa drużyna ${winnerTeam === 0 ? 'pomarańczowa' : 'niebieska'}`, subtitle: `Koniec czasu · ${this.goals[0]} : ${this.goals[1]}.`, winnerSlot: winner?.slot ?? null, players: this.ranking() });
  }

  protected render(ctx: CanvasRenderingContext2D): void {
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#080b12'); sky.addColorStop(.46, '#1b202a'); sky.addColorStop(1, '#0a0d11');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Stadium bowl, floodlights and crowd: cheap geometry, rich material contrast.
    ctx.fillStyle = '#121721'; ctx.fillRect(0, 48, WIDTH, 110);
    for (const person of this.crowd) { ctx.fillStyle = person.color; ctx.globalAlpha = .45; ctx.fillRect(person.x, person.y, 3, 4); }
    ctx.globalAlpha = 1;
    for (const x of [130, 1070]) {
      glow(ctx, x, 125, 120, 'rgba(251,146,60,.12)'); ctx.fillStyle = '#d8dde4'; ctx.fillRect(x - 4, 78, 8, 70); ctx.fillStyle = '#fff1bd'; ctx.fillRect(x - 23, 70, 46, 12);
    }
    // Perspective turf with two layers: the lane trapezoid reads like a tiny 3D stadium.
    polygon(ctx, [{ x: 84, y: 170 }, { x: WIDTH - 84, y: 170 }, { x: WIDTH - 18, y: HEIGHT - 60 }, { x: 18, y: HEIGHT - 60 }], '#1b3b35', '#4c7160');
    for (let i = 0; i < 8; i++) {
      const top = 170 + i * 58, bottom = top + 58;
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.06)';
      ctx.beginPath(); ctx.moveTo(84 + i * 1.5, top); ctx.lineTo(WIDTH - 84 - i * 1.5, top); ctx.lineTo(WIDTH - 84 - i * 4, bottom); ctx.lineTo(84 + i * 4, bottom); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = 'rgba(235,247,223,.68)'; ctx.lineWidth = 3; ctx.strokeRect(84, 170, WIDTH - 168, HEIGHT - 230);
    ctx.beginPath(); ctx.moveTo(WIDTH / 2, 170); ctx.lineTo(WIDTH / 2, HEIGHT - 60); ctx.stroke(); ctx.beginPath(); ctx.arc(WIDTH / 2, 415, 92, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(251,146,60,.13)'; ctx.fillRect(84, GOAL_TOP, 105, GOAL_BOTTOM - GOAL_TOP); ctx.fillStyle = 'rgba(56,189,248,.11)'; ctx.fillRect(WIDTH - 189, GOAL_TOP, 105, GOAL_BOTTOM - GOAL_TOP);
    ctx.strokeStyle = '#fb923c'; ctx.strokeRect(35, GOAL_TOP, 78, GOAL_BOTTOM - GOAL_TOP); ctx.strokeStyle = '#38bdf8'; ctx.strokeRect(WIDTH - 113, GOAL_TOP, 78, GOAL_BOTTOM - GOAL_TOP);

    // Boost pads are the only pickups; they are painted as flat low-poly discs.
    for (const [x, y] of [[250, 220], [950, 220], [250, 590], [950, 590]]) {
      ctx.fillStyle = 'rgba(251,191,36,.18)'; ctx.beginPath(); ctx.ellipse(x, y, 24, 9, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#fbbf24'; ctx.beginPath(); ctx.ellipse(x, y, 15, 5, 0, 0, Math.PI * 2); ctx.stroke();
    }

    const ballShadowY = this.ball.y + 12;
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(this.ball.x, ballShadowY, 19, 7, 0, 0, Math.PI * 2); ctx.fill();
    glow(ctx, this.ball.x, this.ball.y, 34, 'rgba(251,146,60,.38)');
    const ball = ctx.createRadialGradient(this.ball.x - 5, this.ball.y - 7, 2, this.ball.x, this.ball.y, 17); ball.addColorStop(0, '#fff3c4'); ball.addColorStop(.45, '#fb923c'); ball.addColorStop(1, '#9a3412');
    ctx.fillStyle = ball; ctx.beginPath(); ctx.arc(this.ball.x, this.ball.y, 17, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffe7bc'; ctx.lineWidth = 2; ctx.stroke();

    for (const car of this.cars) {
      ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.beginPath(); ctx.ellipse(car.x, car.y + 16, 28, 9, 0, 0, Math.PI * 2); ctx.fill();
      const body = car.team === 0 ? '#e8794f' : '#3b9bd6';
      const nose = carPoint(car, 24, 0), fr = carPoint(car, 10, 14), br = carPoint(car, -17, 13), bl = carPoint(car, -17, -13), fl = carPoint(car, 10, -14);
      polygon(ctx, [nose, fr, br, bl, fl], body, '#e7f2eb');
      polygon(ctx, [carPoint(car, 10, 8), carPoint(car, -8, 7), carPoint(car, -8, -7), carPoint(car, 10, -8)], car.team === 0 ? '#542a2a' : '#15364d', '#d8ecf0');
      for (const side of [-12, 12]) { const w = carPoint(car, -9, side); ctx.fillStyle = '#111820'; ctx.beginPath(); ctx.ellipse(w.x, w.y, 6, 3, car.angle, 0, Math.PI * 2); ctx.fill(); }
      if (car.boost > 1) { const flame = carPoint(car, -25, 0); ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.moveTo(flame.x, flame.y); ctx.lineTo(flame.x - Math.cos(car.angle) * 15 + Math.sin(car.angle) * 6, flame.y - Math.sin(car.angle) * 15 - Math.cos(car.angle) * 6); ctx.lineTo(flame.x - Math.cos(car.angle) * 15 - Math.sin(car.angle) * 6, flame.y - Math.sin(car.angle) * 15 + Math.cos(car.angle) * 6); ctx.closePath(); ctx.fill(); }
      roundRect(ctx, car.x - 29, car.y - 34, 58, 14, 4, 'rgba(5,10,14,.76)'); ctx.fillStyle = '#fff6dd'; ctx.textAlign = 'center'; ctx.font = '700 9px sans-serif'; ctx.fillText(car.name.toUpperCase().slice(0, 9), car.x, car.y - 24);
    }
    for (const spark of this.sparks) { ctx.globalAlpha = Math.max(0, spark.life / .65); ctx.fillStyle = spark.color; ctx.fillRect(spark.x, spark.y, 4, 4); }
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#f5d5a1'; ctx.textAlign = 'left'; ctx.font = '700 12px monospace'; ctx.fillText(`TURBO LEAGUE  /  ${this.goals[0]} : ${this.goals[1]}`, 24, HEIGHT - 20);
  }
}
