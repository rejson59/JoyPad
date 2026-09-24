import { gameAudio } from '../../game/audio';
import { clamp, distance, type Racer, type RoundConfig, type RoundHud, type RoundPlayer } from '../runtime';
import { WebGLRound3D, type Vec3 } from './runtime3d';

interface Car3D extends Racer { x: number; z: number; vx: number; vz: number; angle: number; boost: number; score: number; team: 0 | 1; kickCooldown: number }
interface Ball3D { x: number; z: number; vx: number; vz: number; spin: number }

const GOALS = [3, 5, 7];
const FIELD_X = 11.2;
const FIELD_Z = 7.2;
const GOAL_Z = 2.3;

function colorForTeam(team: 0 | 1) { return team === 0 ? '#e87543' : '#3f9ed4'; }

export class League3DRound extends WebGLRound3D {
  private cars: Car3D[];
  private ball: Ball3D = { x: 0, z: 0, vx: 0, vz: 0, spin: 0 };
  private goals: [number, number] = [0, 0];
  private targetGoals: number;

  constructor(canvas: HTMLCanvasElement, config: RoundConfig) {
    const target = GOALS[config.primary] ?? 3;
    super(canvas, config, 120 + target * 20);
    this.targetGoals = target;
    this.cars = config.players.map((player, index) => ({
      ...player,
      x: index % 2 === 0 ? -6.2 : 6.2,
      z: -2.6 + (index % 4) * 1.7,
      vx: 0, vz: 0, angle: index % 2 === 0 ? Math.PI / 2 : -Math.PI / 2,
      boost: 100, score: 0, team: (index % 2) as 0 | 1, kickCooldown: 0,
    }));
  }

  private botVector(car: Car3D) {
    const targetX = this.ball.x + (car.team === 0 ? 1.1 : -1.1);
    const targetZ = this.ball.z;
    const dx = targetX - car.x, dz = targetZ - car.z, length = Math.max(.01, Math.hypot(dx, dz));
    return { x: dx / length, z: dz / length, action: distance(car.x, car.z, this.ball.x, this.ball.z) < 2.3 };
  }

  private resetKick() {
    this.ball = { x: 0, z: 0, vx: 0, vz: 0, spin: 0 };
    for (const car of this.cars) { car.x = car.team === 0 ? -6.2 : 6.2; car.z = -2.4 + car.slot * 1.2; car.vx = 0; car.vz = 0; }
  }

  protected update(dt: number): void {
    for (const car of this.cars) {
      car.kickCooldown = Math.max(0, car.kickCooldown - dt);
      const manual = this.input(car.slot);
      const bot = car.isBot ? this.botVector(car) : null;
      const ix = car.isBot ? bot!.x : manual.x, iz = car.isBot ? bot!.z : manual.y;
      const action = car.isBot ? bot!.action : manual.action;
      const length = Math.max(1, Math.hypot(ix, iz));
      const boosted = action && car.boost > 1;
      const acceleration = boosted ? 11.5 : 6.6;
      car.vx += ix / length * acceleration * dt; car.vz += iz / length * acceleration * dt;
      const speed = Math.hypot(car.vx, car.vz), maxSpeed = boosted ? 9.4 : 6.2;
      if (speed > maxSpeed) { car.vx *= maxSpeed / speed; car.vz *= maxSpeed / speed; }
      const drag = boosted ? 1.3 : 2.8;
      car.vx *= Math.max(0, 1 - dt * drag); car.vz *= Math.max(0, 1 - dt * drag);
      if (boosted) car.boost = Math.max(0, car.boost - dt * 34); else car.boost = Math.min(100, car.boost + dt * 12);
      if (Math.hypot(ix, iz) > .18) car.angle = Math.atan2(ix, iz);
      car.x = clamp(car.x + car.vx * dt, -FIELD_X + .8, FIELD_X - .8); car.z = clamp(car.z + car.vz * dt, -FIELD_Z + .8, FIELD_Z - .8);
      const ballDistance = Math.hypot(car.x - this.ball.x, car.z - this.ball.z);
      if (ballDistance < 1.45 && car.kickCooldown <= 0) {
        const nx = (this.ball.x - car.x) / Math.max(.1, ballDistance), nz = (this.ball.z - car.z) / Math.max(.1, ballDistance);
        const force = boosted ? 15 : 9;
        this.ball.vx = nx * force + car.vx * .6; this.ball.vz = nz * force + car.vz * .6;
        this.ball.spin += boosted ? 1.4 : .6; car.kickCooldown = .18; car.score += boosted ? 2 : 1;
        this.config.onFx(car.slot, boosted ? 'kill' : 'fire'); gameAudio.hitMetal();
      }
    }

    this.ball.x += this.ball.vx * dt; this.ball.z += this.ball.vz * dt; this.ball.spin += dt * 7;
    this.ball.vx *= Math.max(0, 1 - dt * 1.15); this.ball.vz *= Math.max(0, 1 - dt * 1.15);
    if (this.ball.z < -FIELD_Z + .55 || this.ball.z > FIELD_Z - .55) { this.ball.z = clamp(this.ball.z, -FIELD_Z + .55, FIELD_Z - .55); this.ball.vz *= -.78; }
    if (this.ball.x < -FIELD_X - .5 || this.ball.x > FIELD_X + .5) {
      const inGoal = Math.abs(this.ball.z) < GOAL_Z;
      if (inGoal) {
        const team: 0 | 1 = this.ball.x < 0 ? 1 : 0;
        this.goals[team]++;
        for (const car of this.cars.filter(item => item.team === team)) { car.score += 5; this.config.onFx(car.slot, 'win'); }
        gameAudio.explosion();
        if (this.goals[team] >= this.targetGoals) {
          const winner = this.cars.find(car => car.team === team && !car.isBot) ?? this.cars.find(car => car.team === team);
          this.finish({ title: `Drużyna ${team === 0 ? 'pomarańczowa' : 'niebieska'} wygrywa`, subtitle: `Wynik ${this.goals[0]} : ${this.goals[1]} · mecz zakończony przed czasem.`, winnerSlot: winner?.slot ?? null, players: this.ranking() });
        } else this.resetKick();
      } else { this.ball.x = clamp(this.ball.x, -FIELD_X, FIELD_X); this.ball.vx *= -.82; }
    }
  }

  private ranking(): RoundPlayer[] {
    return [...this.cars].sort((a, b) => b.score - a.score).map(car => ({
      slot: car.slot, name: car.name, color: car.color, score: car.score,
      detail: `Drużyna ${car.team === 0 ? 'pomarańczowa' : 'niebieska'} · boost ${Math.round(car.boost)}%`, value: car.boost, maxValue: 100, isBot: car.isBot,
    }));
  }

  protected hud(): RoundHud {
    return { timeLeft: this.timeLeft, countdown: this.countdown, paused: this.paused, objective: `${this.goals[0]} — ${this.goals[1]} / ${this.targetGoals} goli`, status: `POMARAŃCZOWI ${this.goals[0]} · NIEBIESCY ${this.goals[1]}`, players: this.ranking() };
  }

  protected timeout(): void {
    const team: 0 | 1 = this.goals[0] === this.goals[1] ? 0 : this.goals[0] > this.goals[1] ? 0 : 1;
    const winner = this.cars.find(car => car.team === team && !car.isBot) ?? this.cars.find(car => car.team === team);
    this.finish({ title: this.goals[0] === this.goals[1] ? 'Remis na stadionie' : `Wygrywa drużyna ${team === 0 ? 'pomarańczowa' : 'niebieska'}`, subtitle: `Koniec czasu · ${this.goals[0]} : ${this.goals[1]}.`, winnerSlot: winner?.slot ?? null, players: this.ranking() });
  }

  protected camera(viewIndex: number): { eye: Vec3; target: Vec3 } {
    return viewIndex % 2 === 0 ? { eye: [0, 12.5, 16], target: [0, 0, 0] } : { eye: [0, 12.5, -16], target: [0, 0, 0] };
  }

  protected renderScene(_viewIndex: number, _aspect: number): void {
    // Stadium bowl and turf. All dimensions are intentionally small so the GPU has a fixed budget.
    this.draw('cube', [0, -.35, 0], [12.4, .35, 8.2], '#1c4037');
    for (let z = -6.5; z <= 6.5; z += 2.6) this.draw('cube', [0, .015, z], [11.7, .025, 1.1], z % 5.2 === 0 ? '#20473c' : '#1c3e35');
    this.draw('cube', [0, .08, 0], [.045, .03, 7.2], '#e9e3cb');
    this.draw('cube', [0, .08, 0], [2.1, .03, .045], '#e9e3cb');
    this.draw('cube', [0, .08, 0], [.045, .03, 2.1], '#e9e3cb');
    this.draw('cube', [-11.55, 1.2, 0], [.12, 1.2, GOAL_Z], '#e87543', 0, .15);
    this.draw('cube', [11.55, 1.2, 0], [.12, 1.2, GOAL_Z], '#3f9ed4', 0, .12);
    for (const x of [-10.8, 10.8]) for (const z of [-GOAL_Z, GOAL_Z]) this.draw('cube', [x, 1.1, z], [.12, 1.1, .12], x < 0 ? '#e87543' : '#3f9ed4', 0, .1);
    for (let i = -2; i <= 2; i++) { this.draw('cube', [-13.2, 1.5 + Math.abs(i) * .35, i * 2.9], [1.1, .25, .9], '#252d2f'); this.draw('cube', [13.2, 1.5 + Math.abs(i) * .35, i * 2.9], [1.1, .25, .9], '#252d2f'); }
    for (const [x, z] of [[-7, -5.2], [7, -5.2], [-7, 5.2], [7, 5.2]]) { this.draw('cylinder', [x, .11, z], [.48, .035, .48], '#fbbf24', 0, .18); }

    this.draw('sphere', [this.ball.x, .76, this.ball.z], [.72, .72, .72], '#f6a35c', this.ball.spin, .12);
    for (const car of this.cars) {
      const teamColor = colorForTeam(car.team);
      this.draw('cube', [car.x, .43, car.z], [.78, .32, 1.15], teamColor, car.angle);
      this.draw('cube', [car.x, .78, car.z], [.55, .15, .52], car.team === 0 ? '#672f29' : '#183c57', car.angle, .03);
      for (const side of [-.86, .86]) this.draw('cube', [car.x + Math.sin(car.angle) * side, .25, car.z + Math.cos(car.angle) * side], [.12, .22, .28], '#111719', car.angle);
      if (car.boost > 1) this.draw('sphere', [car.x - Math.sin(car.angle) * 1.18, .43, car.z - Math.cos(car.angle) * 1.18], [.16, .16, .16], '#fbbf24', 0, .35);
    }
  }
}
