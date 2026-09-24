import { gameAudio } from '../../game/audio';
import { clamp, distance, rand, type Racer, type RoundConfig, type RoundHud, type RoundPlayer } from '../runtime';
import { WebGLRound3D, type Vec3 } from './runtime3d';

type ArcadeMode = 'race' | 'orbit' | 'snake' | 'temple';
interface Actor3D extends Racer {
  x: number; z: number; vx: number; vz: number; angle: number; score: number; boost: number; hp: number; cooldown: number; progress: number; lane: number; alive: boolean; trail: { x: number; z: number }[];
}
interface Enemy3D { x: number; z: number; vx: number; vz: number; hp: number; cooldown: number; phase: number }
interface Shot3D { x: number; z: number; vx: number; vz: number; owner: number; life: number }
interface Pickup3D { x: number; z: number; active: boolean; phase: number }

const GOALS = [3, 5, 7];
const WAVES = [3, 5, 7];
const POINTS = [8, 12, 16];
const MAZE = [
  '111111111111111',
  '100000100000001',
  '101110101011101',
  '101000000010101',
  '101011101110101',
  '100010000010001',
  '111010111010111',
  '100010001010001',
  '101110101011101',
  '101000100000101',
  '101011111110101',
  '100000000000001',
  '111111111111111',
];

function teamColor(team: number) { return team % 2 === 0 ? '#e87543' : '#3f9ed4'; }
/** A compact 3D version of the original arcade games. It intentionally keeps the rules small and the scene bounded. */
export class Arcade3DRound extends WebGLRound3D {
  private readonly mode: ArcadeMode;
  private readonly actors: Actor3D[];
  private readonly enemies: Enemy3D[] = [];
  private readonly shots: Shot3D[] = [];
  private readonly pickups: Pickup3D[] = [];
  private readonly stars: Vec3[] = Array.from({ length: 34 }, () => [rand(-10, 10), rand(2, 9), rand(-9, 2)]);
  private readonly target: number;
  private readonly difficulty: number;
  private wave = 1;
  private collected = 0;
  private exitOpen = false;

  constructor(canvas: HTMLCanvasElement, config: RoundConfig, mode: ArcadeMode) {
    const target = mode === 'race' ? GOALS[config.primary] ?? 3 : mode === 'orbit' ? WAVES[config.primary] ?? 3 : mode === 'snake' ? POINTS[config.primary] ?? 8 : POINTS[config.primary] ?? 8;
    super(canvas, config, mode === 'orbit' ? 150 + target * 24 : mode === 'race' ? 115 + target * 18 : 150);
    this.mode = mode; this.target = target; this.difficulty = config.secondary;
    this.actors = config.players.map((player, index) => ({
      ...player, x: mode === 'race' ? 0 : -2 + (index % 2) * 4, z: mode === 'race' ? 0 : -1 + Math.floor(index / 2) * 1.6,
      vx: 0, vz: 0, angle: index % 2 ? Math.PI : 0, score: 0, boost: 100, hp: 100, cooldown: 0,
      progress: index * -.03, lane: (index % 3 - 1) * .35, alive: true, trail: [],
    }));
    if (mode === 'orbit') this.spawnWave();
    if (mode === 'snake') {
      for (let i = 0; i < 9; i++) this.pickups.push({ x: rand(-7, 7), z: rand(-5, 5), active: true, phase: rand(0, 6.28) });
      for (const actor of this.actors) actor.trail = Array.from({ length: 5 }, (_, i) => ({ x: actor.x, z: actor.z + i * .28 }));
    }
    if (mode === 'temple') {
      for (let i = 0; i < target + 4; i++) this.pickups.push({ x: rand(-5.5, 5.5), z: rand(-4.5, 4.5), active: true, phase: rand(0, 6.28) });
      for (let i = 0; i < 1 + config.secondary; i++) this.enemies.push({ x: rand(-5, 5), z: rand(-4, 4), vx: 0, vz: 0, hp: 1, cooldown: 0, phase: rand(0, 6.28) });
    }
    this.setClearColor(mode === 'orbit' ? '#050a18' : mode === 'temple' ? '#17110d' : mode === 'snake' ? '#07130f' : '#0c1114');
    this.setAtmosphere(mode === 'orbit' ? '#0b1630' : mode === 'temple' ? '#21150d' : mode === 'snake' ? '#0a2117' : '#10191c', 14, mode === 'orbit' ? 55 : 38);
  }

  protected camera(viewIndex: number): { eye: Vec3; target: Vec3 } {
    if (this.mode === 'orbit') return viewIndex % 2 ? { eye: [-1, 13, 17], target: [0, 0, 0] } : { eye: [1, 13, 17], target: [0, 0, 0] };
    if (this.mode === 'temple') return viewIndex % 2 ? { eye: [-10, 13, 12], target: [0, 0, 0] } : { eye: [10, 13, 12], target: [0, 0, 0] };
    return viewIndex % 2 ? { eye: [-.5, 12, 16], target: [0, 0, 0] } : { eye: [.5, 12, 16], target: [0, 0, 0] };
  }

  protected update(dt: number): void {
    if (this.mode === 'race') this.updateRace(dt);
    if (this.mode === 'orbit') this.updateOrbit(dt);
    if (this.mode === 'snake') this.updateSnake(dt);
    if (this.mode === 'temple') this.updateTemple(dt);
  }

  private updateRace(dt: number) {
    for (const actor of this.actors) {
      const input = actor.isBot ? { x: 0, y: -1, action: false } : this.input(actor.slot);
      const throttle = actor.isBot ? 1 : clamp(-input.y, .1, 1);
      const boosted = input.action && actor.boost > 1;
      actor.boost = boosted ? Math.max(0, actor.boost - dt * 34) : Math.min(100, actor.boost + dt * 12);
      actor.lane = clamp(actor.lane + input.x * dt * 1.4, -.85, .85);
      actor.progress += dt * (boosted ? .105 : .055 + throttle * .035);
      if (actor.progress >= 1) { actor.progress -= 1; actor.score++; gameAudio.pickup(); this.config.onFx(actor.slot, 'pickup'); }
      if (actor.score >= this.target) { this.finish({ title: `${actor.name} na mecie`, subtitle: `Pierwszy ukończył ${this.target} okrążenia.`, winnerSlot: actor.slot, players: this.ranking() }); return; }
    }
  }

  private spawnWave() {
    this.enemies.splice(0, this.enemies.length);
    const count = 3 + this.wave * 2 + this.difficulty;
    for (let i = 0; i < count; i++) this.enemies.push({ x: rand(-7, 7), z: rand(-5, 5), vx: 0, vz: 0, hp: i % 4 === 0 ? 3 : 1, cooldown: rand(1, 3), phase: rand(0, 6.28) });
  }

  private updateOrbit(dt: number) {
    for (const actor of this.actors) {
      const input = this.input(actor.slot); const length = Math.max(1, Math.hypot(input.x, input.y));
      actor.vx = (actor.vx + input.x / length * 8 * dt) * (1 - dt * 2.3); actor.vz = (actor.vz + input.y / length * 8 * dt) * (1 - dt * 2.3);
      const speed = Math.hypot(actor.vx, actor.vz); if (speed > 5) { actor.vx *= 5 / speed; actor.vz *= 5 / speed; }
      actor.x = clamp(actor.x + actor.vx * dt, -8, 8); actor.z = clamp(actor.z + actor.vz * dt, -5.5, 5.5);
      actor.angle = Math.atan2(input.x || actor.vx, input.y || actor.vz);
      actor.cooldown -= dt;
      if (input.action && actor.cooldown <= 0) { actor.cooldown = .22; const target = this.enemies.sort((a, b) => distance(actor.x, actor.z, a.x, a.z) - distance(actor.x, actor.z, b.x, b.z))[0]; const dx = target ? target.x - actor.x : Math.sin(actor.angle), dz = target ? target.z - actor.z : Math.cos(actor.angle), lengthToTarget = Math.max(.1, Math.hypot(dx, dz)); this.shots.push({ x: actor.x, z: actor.z, vx: dx / lengthToTarget * 12, vz: dz / lengthToTarget * 12, owner: actor.slot, life: 1.4 }); this.config.onFx(actor.slot, 'fire'); }
    }
    for (const enemy of this.enemies) {
      const target = this.actors.sort((a, b) => distance(a.x, a.z, enemy.x, enemy.z) - distance(b.x, b.z, enemy.x, enemy.z))[0];
      if (!target) continue;
      const dx = target.x - enemy.x, dz = target.z - enemy.z, length = Math.max(.1, Math.hypot(dx, dz)); enemy.x += dx / length * dt * (1 + this.difficulty * .12); enemy.z += dz / length * dt * (1 + this.difficulty * .12); enemy.phase += dt * 4;
      if (distance(target.x, target.z, enemy.x, enemy.z) < .7) { target.hp -= dt * 28; if (target.hp <= 0) { target.hp = 100; target.x = 0; target.z = 0; this.config.onFx(target.slot, 'respawn'); } }
    }
    for (const shot of [...this.shots]) {
      shot.x += shot.vx * dt; shot.z += shot.vz * dt; shot.life -= dt;
      const enemy = this.enemies.find(item => distance(shot.x, shot.z, item.x, item.z) < .55);
      if (enemy) { enemy.hp--; shot.life = 0; if (enemy.hp <= 0) { this.enemies.splice(this.enemies.indexOf(enemy), 1); const owner = this.actors.find(actor => actor.slot === shot.owner); if (owner) owner.score++; this.config.onFx(shot.owner, 'kill'); } }
    }
    for (const shot of [...this.shots]) if (shot.life <= 0) this.shots.splice(this.shots.indexOf(shot), 1);
    if (!this.enemies.length) { if (this.wave >= this.target) { this.finish({ title: 'Orbita zabezpieczona', subtitle: `Drużyna odparła ${this.target} fal.`, winnerSlot: null, allWon: true, players: this.ranking() }); } else { this.wave++; this.spawnWave(); } }
  }

  private updateSnake(dt: number) {
    for (const actor of this.actors) {
      if (!actor.alive) continue;
      const input = actor.isBot ? this.botPickupDirection(actor) : this.input(actor.slot);
      if (Math.hypot(input.x, input.y) > .18) actor.angle = Math.atan2(input.x, input.y);
      const sprint = input.action && actor.boost > 1; actor.boost = sprint ? Math.max(0, actor.boost - dt * 35) : Math.min(100, actor.boost + dt * 14);
      const speed = sprint ? 4.3 : 2.75;
      actor.x += Math.sin(actor.angle) * speed * dt; actor.z += Math.cos(actor.angle) * speed * dt;
      actor.trail.unshift({ x: actor.x, z: actor.z }); while (actor.trail.length > 8 + actor.score * 3) actor.trail.pop();
      if (Math.abs(actor.x) > 8 || Math.abs(actor.z) > 5.8) { actor.alive = false; this.config.onFx(actor.slot, 'dead'); continue; }
      const pickup = this.pickups.find(item => item.active && distance(actor.x, actor.z, item.x, item.z) < .55);
      if (pickup) { pickup.active = false; actor.score++; this.config.onFx(actor.slot, 'pickup'); gameAudio.pickup(); if (actor.score >= this.target) { this.finish({ title: `${actor.name} zdobywa arenę`, subtitle: `Pierwszy zebrał ${this.target} impulsów.`, winnerSlot: actor.slot, players: this.ranking() }); return; } }
      for (const other of this.actors) if (other !== actor && other.trail.some(segment => distance(actor.x, actor.z, segment.x, segment.z) < .3)) actor.alive = false;
    }
    if (this.actors.every(actor => !actor.alive)) this.finish({ title: 'Arena wyczyszczona', subtitle: 'Wszystkie węże wypadły poza trasę.', winnerSlot: null, players: this.ranking() });
  }

  private botPickupDirection(actor: Actor3D) {
    const pickup = this.pickups.filter(item => item.active).sort((a, b) => distance(actor.x, actor.z, a.x, a.z) - distance(actor.x, actor.z, b.x, b.z))[0];
    if (!pickup) return { x: 0, y: 1, action: false };
    const dx = pickup.x - actor.x, dz = pickup.z - actor.z, length = Math.max(.1, Math.hypot(dx, dz)); return { x: dx / length, y: dz / length, action: false };
  }

  private canMove(x: number, z: number) { const gx = Math.floor((x + 7) / 1), gz = Math.floor((z + 6) / 1); return MAZE[gz]?.[gx] === '0'; }
  private updateTemple(dt: number) {
    this.exitOpen = this.collected >= this.target;
    for (const actor of this.actors) {
      const input = this.input(actor.slot), length = Math.max(1, Math.hypot(input.x, input.y)), speed = input.action ? 4 : 2.3;
      const nx = actor.x + input.x / length * speed * dt, nz = actor.z + input.y / length * speed * dt;
      if (this.canMove(nx, actor.z)) actor.x = nx; if (this.canMove(actor.x, nz)) actor.z = nz;
      const relic = this.pickups.find(item => item.active && distance(actor.x, actor.z, item.x, item.z) < .58);
      if (relic) { relic.active = false; actor.score++; this.collected++; this.config.onFx(actor.slot, 'pickup'); gameAudio.pickup(); }
      if (this.collected >= this.target && Math.abs(actor.x - 4.2) < .8 && Math.abs(actor.z - 5.2) < .8 && input.action) this.finish({ title: 'Portal otwarty', subtitle: `Drużyna wyniosła ${this.collected} reliktów z ruin.`, winnerSlot: null, allWon: true, players: this.ranking() });
    }
    for (const enemy of this.enemies) {
      const target = this.actors[0]; if (!target) continue; const dx = target.x - enemy.x, dz = target.z - enemy.z, length = Math.max(.1, Math.hypot(dx, dz)); enemy.x += dx / length * dt * 1.25; enemy.z += dz / length * dt * 1.25; enemy.phase += dt * 4;
      if (distance(target.x, target.z, enemy.x, enemy.z) < .65 && enemy.cooldown <= 0) { target.hp -= 25; enemy.cooldown = 1.2; this.config.onFx(target.slot, target.hp > 0 ? 'hit' : 'dead'); if (target.hp <= 0) { target.hp = 100; target.x = -5.2; target.z = -4.2; } }
      enemy.cooldown -= dt;
    }
  }

  private trackPoint(progress: number, lane: number): { x: number; z: number; angle: number } {
    const t = progress * Math.PI * 2 - Math.PI / 2, radiusX = 7.4 + lane, radiusZ = 4.45 + lane * .5;
    return { x: Math.cos(t) * radiusX, z: Math.sin(t) * radiusZ, angle: Math.atan2(-Math.sin(t), Math.cos(t)) };
  }

  protected renderScene(_viewIndex: number, _aspect: number): void {
    if (this.mode === 'race') this.renderRace();
    if (this.mode === 'orbit') this.renderOrbit();
    if (this.mode === 'snake') this.renderSnake();
    if (this.mode === 'temple') this.renderTemple();
  }

  private renderRace() {
    this.draw('cube', [0, -.42, 0], [10.2, .42, 6.5], '#141c20');
    for (let i = 0; i < 28; i++) { const point = this.trackPoint(i / 28, 0); this.draw('cube', [point.x, .02, point.z], [1.05, .025, .38], i % 2 ? '#273a3d' : '#31484a', point.angle); }
    for (const [x, z] of [[-9.2, -5.7], [9.2, -5.7], [-9.2, 5.7], [9.2, 5.7]]) this.draw('cube', [x, .8, z], [.12, .8, .12], '#fb923c', 0, .13);
    for (let i = 0; i < 5; i++) this.draw('cube', [-10 + i * 5, .04, 0], [.55, .025, 5.8], '#0d1417');
    for (const [index, actor] of this.actors.entries()) { const point = this.trackPoint(actor.progress, actor.lane); this.draw('cube', [point.x, .45, point.z], [.52, .24, .9], teamColor(index), point.angle); this.draw('cube', [point.x, .75, point.z], [.35, .12, .4], '#172328', point.angle); if (actor.boost > 1) this.draw('sphere', [point.x - Math.sin(point.angle) * .95, .45, point.z - Math.cos(point.angle) * .95], [.12, .12, .12], '#fbbf24', 0, .3); }
    this.draw('cube', [0, .04, -5.3], [1.6, .03, .06], '#f8e3ae', 0, .1);
  }

  private renderOrbit() {
    this.draw('cube', [0, -.8, 0], [10, .2, 7], '#080f1e'); this.draw('sphere', [5.5, 1.3, -3.8], [2.25, 2.25, 2.25], '#d87342', 0, .06); this.draw('sphere', [5.1, 2.2, -4.4], [2.35, 2.35, 2.35], '#275985', 0, .02);
    for (const star of this.stars) this.draw('sphere', star, [.045, .045, .045], '#dce7ff', 0, .45);
    for (let i = 0; i < 7; i++) this.draw('sphere', [Math.cos(i * 2.6) * (4 + i % 2), .3 + i % 3 * .4, Math.sin(i * 2.6) * (3 + i % 2)], [.35 + i % 2 * .2, .35 + i % 2 * .2, .35 + i % 2 * .2], '#58646b', i, .02);
    for (const enemy of this.enemies) { this.draw('sphere', [enemy.x, .7, enemy.z], [.45, .45, .45], '#c4493d', enemy.phase, .12); this.draw('cube', [enemy.x, 1.15, enemy.z], [.12, .12, .12], '#ffd19e', 0, .35); }
    for (const shot of this.shots) this.draw('sphere', [shot.x, .62, shot.z], [.09, .09, .09], '#fbbf24', 0, .6);
    for (const actor of this.actors) { this.draw('cube', [actor.x, .52, actor.z], [.46, .2, .72], actor.color, actor.angle); this.draw('cube', [actor.x, .76, actor.z], [.28, .12, .3], '#183244', actor.angle); }
  }

  private renderSnake() {
    this.draw('cube', [0, -.3, 0], [8.8, .3, 6.5], '#183a2c');
    for (let x = -8; x <= 8; x += 2) this.draw('cube', [x, .03, 0], [.025, .025, 6.1], '#2c5940');
    for (let z = -6; z <= 6; z += 2) this.draw('cube', [0, .035, z], [8.2, .025, .025], '#2c5940');
    for (const pickup of this.pickups) if (pickup.active) this.draw('sphere', [pickup.x, .48 + Math.sin(this.clock * 3 + pickup.phase) * .08, pickup.z], [.2, .2, .2], '#fbbf24', this.clock, .4);
    for (const [index, actor] of this.actors.entries()) { for (const [segment, point] of actor.trail.entries()) this.draw('cube', [point.x, .34 + Math.min(segment, 3) * .025, point.z], [Math.max(.16, .34 - segment * .008), .18, Math.max(.16, .34 - segment * .008)], teamColor(index), actor.angle, segment === 0 ? .08 : 0); }
    for (const x of [-8.7, 8.7]) this.draw('cube', [x, .55, 0], [.18, .55, 6.3], '#a8643e');
    for (const z of [-6.3, 6.3]) this.draw('cube', [0, .55, z], [8.8, .55, .18], '#a8643e');
  }

  private renderTemple() {
    this.draw('cube', [0, -.35, 0], [7.6, .35, 6.5], '#25362d');
    for (let z = 0; z < MAZE.length; z++) for (let x = 0; x < MAZE[z].length; x++) if (MAZE[z][x] === '1') this.draw('cube', [x - 7, .7, z - 6], [.48, .7, .48], (x + z) % 3 ? '#465246' : '#59604b');
    for (const relic of this.pickups) if (relic.active) this.draw('sphere', [relic.x, .72 + Math.sin(this.clock * 3 + relic.phase) * .08, relic.z], [.25, .25, .25], '#a7f3d0', this.clock, .38);
    this.draw('cube', [4.2, .45, 5.2], [.65, .45, .65], this.collected >= this.target ? '#34d399' : '#715d39', this.clock, this.collected >= this.target ? .35 : .02);
    for (const enemy of this.enemies) this.draw('cube', [enemy.x, .7, enemy.z], [.38, .7, .38], '#b95c42', enemy.phase, .06);
    for (const [index, actor] of this.actors.entries()) { this.draw('cube', [actor.x, .66, actor.z], [.38, .66, .38], teamColor(index), actor.angle); this.draw('sphere', [actor.x, 1.48, actor.z], [.28, .28, .28], '#edbf86'); }
  }

  private ranking(): RoundPlayer[] {
    return [...this.actors].sort((a, b) => b.score - a.score).map(actor => ({
      slot: actor.slot, name: actor.name, color: actor.color, score: actor.score,
      detail: this.mode === 'race' ? `${actor.score}/${this.target} okrążenia` : this.mode === 'orbit' ? `${actor.hp} HP · fala ${this.wave}` : this.mode === 'snake' ? `${actor.alive ? 'żyje' : 'odpadł'} · boost ${Math.round(actor.boost)}%` : `${actor.score} reliktów`,
      value: this.mode === 'race' ? actor.score : this.mode === 'temple' ? actor.score : actor.hp, maxValue: this.mode === 'race' ? this.target : this.mode === 'temple' ? this.target : 100, isBot: actor.isBot,
    }));
  }

  protected hud(): RoundHud {
    const objective = this.mode === 'race' ? `${Math.max(...this.actors.map(actor => actor.score), 0)}/${this.target} okrążeń` : this.mode === 'orbit' ? `FALA ${Math.min(this.wave, this.target)}/${this.target}` : this.mode === 'snake' ? `${Math.max(...this.actors.map(actor => actor.score), 0)}/${this.target} impulsów` : `${Math.min(this.collected, this.target)}/${this.target} reliktów`;
    const status = this.mode === 'race' ? 'TRZYMAJ LINIĘ · TURBO NA PROSTEJ' : this.mode === 'orbit' ? 'ZAZNACZ WROGÓW · WSPÓLNY OSTRZAŁ' : this.mode === 'snake' ? 'NIE DOTKNIJ ŚCIANY · ZBIERAJ IMPULSY' : this.exitOpen || this.collected >= this.target ? 'PORTAL OTWARTY · WRÓĆ DO WYJŚCIA' : 'ZBIERAJ RELIKTY · UWAŻAJ NA STRAŻNIKÓW';
    return { timeLeft: this.timeLeft, countdown: this.countdown, paused: this.paused, objective, status, players: this.ranking() };
  }

  protected timeout(): void { this.finish({ title: 'Koniec rundy', subtitle: 'Czas dobiegł końca. Zagrajcie jeszcze raz, korzystając z nowej kamery 3D.', winnerSlot: this.actors.sort((a, b) => b.score - a.score)[0]?.slot ?? null, players: this.ranking() }); }
}
