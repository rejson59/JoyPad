import { gameAudio } from '../../game/audio';
import { clamp, distance, rand, type Racer, type RoundConfig, type RoundHud, type RoundPlayer } from '../runtime';
import { WebGLRound3D, type Vec3 } from './runtime3d';

type ResourceKind = 'crystal' | 'wood' | 'ore';
interface Resource3D { x: number; z: number; kind: ResourceKind; active: boolean; phase: number }
interface Builder3D extends Racer { x: number; z: number; hp: number; score: number; carrying: number; cooldown: number; invulnerable: number }
interface Crawler3D { x: number; z: number; speed: number; phase: number }

const COLUMNS = 14;
const ROWS = 11;
const CELL = .92;
const GOAL_LEVEL = [8, 12, 16];

function resourceColor(kind: ResourceKind) { return kind === 'crystal' ? '#fbbf24' : kind === 'wood' ? '#d97706' : '#94a3b8'; }

export class Voxel3DRound extends WebGLRound3D {
  private terrain: number[][];
  private builders: Builder3D[];
  private resources: Resource3D[] = [];
  private crawlers: Crawler3D[] = [];
  private collected = 0;
  private baseLevel = 1;
  private target: number;
  private difficulty: number;

  constructor(canvas: HTMLCanvasElement, config: RoundConfig) {
    const target = GOAL_LEVEL[config.primary] ?? 8;
    super(canvas, config, 145 + target * 3);
    this.target = target; this.difficulty = config.secondary;
    this.terrain = Array.from({ length: ROWS }, (_, z) => Array.from({ length: COLUMNS }, (_, x) => {
      const edge = x === 0 || z === 0 || x === COLUMNS - 1 || z === ROWS - 1;
      return edge ? 2 + Math.floor(rand(0, 2)) : 1 + Math.floor(rand(0, 3));
    }));
    for (let z = 4; z < 8; z++) for (let x = 6; x < 9; x++) this.terrain[z][x] = 1;
    const kinds: ResourceKind[] = ['crystal', 'wood', 'ore'];
    for (let i = 0; i < target + 6; i++) {
      let x = 1 + Math.floor(rand(0, COLUMNS - 2)), z = 1 + Math.floor(rand(0, ROWS - 2));
      if (x >= 5 && x <= 9 && z >= 4 && z <= 7) { x = 2; z = 2; }
      this.resources.push({ x, z, kind: kinds[i % kinds.length], active: true, phase: rand(0, Math.PI * 2) });
    }
    this.builders = config.players.map((player, index) => ({
      ...player, x: -1.3 + (index % 2) * 2.5, z: -.8 + Math.floor(index / 2) * 1.5,
      hp: 100, score: 0, carrying: 0, cooldown: 0, invulnerable: 1.8,
    }));
    for (let i = 0; i < 1 + this.difficulty; i++) this.crawlers.push({ x: rand(-4.5, 4.5), z: rand(-3.5, 3.5), speed: .5 + this.difficulty * .1, phase: rand(0, 6.28) });
  }

  private worldX(cell: number) { return (cell - (COLUMNS - 1) / 2) * CELL; }
  private worldZ(cell: number) { return (cell - (ROWS - 1) / 2) * CELL; }
  private nearestResource(builder: Builder3D) { return this.resources.filter(resource => resource.active).sort((a, b) => distance(builder.x, builder.z, this.worldX(a.x), this.worldZ(a.z)) - distance(builder.x, builder.z, this.worldX(b.x), this.worldZ(b.z)))[0]; }
  private botVector(builder: Builder3D) {
    const resource = this.nearestResource(builder);
    if (!resource) return { x: 0, z: 0 };
    const dx = this.worldX(resource.x) - builder.x, dz = this.worldZ(resource.z) - builder.z, length = Math.max(.01, Math.hypot(dx, dz));
    return { x: dx / length, z: dz / length };
  }
  private hit(builder: Builder3D) {
    if (builder.invulnerable > 0) return;
    builder.hp = Math.max(0, builder.hp - 28); builder.invulnerable = 1.2; this.config.onFx(builder.slot, builder.hp ? 'hit' : 'dead'); gameAudio.hitMetal();
    if (builder.hp <= 0) { builder.hp = 100; builder.x = 0; builder.z = 0; builder.carrying = 0; builder.invulnerable = 2.5; this.config.onFx(builder.slot, 'respawn'); }
  }

  protected update(dt: number): void {
    const night = (this.clock % 48) > 32;
    for (const builder of this.builders) {
      builder.cooldown = Math.max(0, builder.cooldown - dt); builder.invulnerable = Math.max(0, builder.invulnerable - dt);
      const manual = this.input(builder.slot), bot = builder.isBot ? this.botVector(builder) : null;
      const ix = builder.isBot ? bot!.x : manual.x, iz = builder.isBot ? bot!.z : manual.y;
      const length = Math.max(1, Math.hypot(ix, iz));
      builder.x = clamp(builder.x + ix / length * dt * 2.3, -5.2, 5.2); builder.z = clamp(builder.z + iz / length * dt * 2.3, -4, 4);
      const action = builder.isBot ? builder.cooldown <= .01 : manual.action;
      if (action && builder.cooldown <= .01) {
        const resource = this.resources.find(item => item.active && distance(builder.x, builder.z, this.worldX(item.x), this.worldZ(item.z)) < .72);
        if (resource) { resource.active = false; builder.carrying++; builder.score += resource.kind === 'crystal' ? 2 : 1; this.collected++; builder.cooldown = .4; this.config.onFx(builder.slot, 'pickup'); gameAudio.pickup(); }
        else if (Math.abs(builder.x) < 1.8 && Math.abs(builder.z) < 1.8 && builder.carrying > 0) { builder.carrying = 0; this.baseLevel = Math.min(4, this.baseLevel + .08); builder.cooldown = .55; this.config.onFx(builder.slot, 'shield'); }
      }
      if (night) for (const crawler of this.crawlers) if (distance(builder.x, builder.z, crawler.x, crawler.z) < .65) this.hit(builder);
    }
    for (const crawler of this.crawlers) {
      const target = this.builders[0];
      if (!target) continue;
      const dx = target.x - crawler.x, dz = target.z - crawler.z, length = Math.max(.01, Math.hypot(dx, dz));
      crawler.x = clamp(crawler.x + dx / length * crawler.speed * dt, -5, 5); crawler.z = clamp(crawler.z + dz / length * crawler.speed * dt, -4, 4); crawler.phase += dt * 4;
    }
    if (this.collected >= this.target && this.builders.some(builder => Math.abs(builder.x) < 1.8 && Math.abs(builder.z) < 1.8 && (this.input(builder.slot).action || builder.isBot))) this.finish({ title: 'Baza ocalona', subtitle: `Drużyna zabezpieczyła ${this.collected} fragmentów i rozbudowała schronienie.`, winnerSlot: null, allWon: true, players: this.ranking() });
  }

  private ranking(): RoundPlayer[] { return [...this.builders].sort((a, b) => b.score - a.score).map(builder => ({ slot: builder.slot, name: builder.name, color: builder.color, score: builder.score, detail: `${builder.carrying} niesione · ${builder.hp} HP`, value: builder.hp, maxValue: 100, isBot: builder.isBot })); }
  protected hud(): RoundHud { return { timeLeft: this.timeLeft, countdown: this.countdown, paused: this.paused, objective: `${Math.min(this.collected, this.target)}/${this.target} surowców`, status: (this.clock % 48) > 32 ? 'NOC · BROŃ BAZY' : 'DZIEŃ · ZBIERAJ I BUDUJ', players: this.ranking() }; }
  protected timeout(): void { this.finish({ title: 'Wyprawa zakończona', subtitle: `Zabezpieczyliście ${this.collected}/${this.target} fragmentów.`, winnerSlot: null, players: this.ranking() }); }
  protected camera(viewIndex: number): { eye: Vec3; target: Vec3 } { return viewIndex % 2 === 0 ? { eye: [10.5, 11.5, 13], target: [0, 0, 0] } : { eye: [-10.5, 11.5, -13], target: [0, 0, 0] }; }

  protected renderScene(_viewIndex: number, _aspect: number): void {
    const night = (this.clock % 48) > 32;
    for (let z = 0; z < ROWS; z++) for (let x = 0; x < COLUMNS; x++) {
      const height = this.terrain[z][x];
      const color = night ? (x + z) % 2 ? '#554337' : '#654d3b' : (x + z) % 2 ? '#8c6947' : '#a3764a';
      this.draw('cube', [this.worldX(x), height * .42, this.worldZ(z)], [.43, height * .42, .43], color);
      if ((x + z) % 5 === 0) this.draw('cube', [this.worldX(x), height * .86 + .03, this.worldZ(z)], [.24, .035, .12], night ? '#526759' : '#78945f');
    }
    this.draw('cube', [0, this.baseLevel * .4 + .05, 0], [1.65, this.baseLevel * .4, 1.65], '#71472e');
    this.draw('cube', [0, this.baseLevel * .82 + .25, 0], [1.05, .2, 1.05], '#e87543', 0, .16);
    for (const resource of this.resources) if (resource.active) {
      const y = this.terrain[resource.z][resource.x] * .84 + .42 + Math.sin(this.clock * 3 + resource.phase) * .05;
      this.draw('cube', [this.worldX(resource.x), y, this.worldZ(resource.z)], [.22, .42, .22], resourceColor(resource.kind), this.clock + resource.phase, .24);
    }
    for (const crawler of this.crawlers) { this.draw('cube', [crawler.x, .92, crawler.z], [.4, .72, .4], night ? '#9f3d34' : '#44504c', crawler.phase, night ? .1 : 0); this.draw('sphere', [crawler.x, 1.8, crawler.z], [.36, .36, .36], '#d89b68', 0); }
    for (const builder of this.builders) {
      if (builder.invulnerable > 0 && Math.sin(this.clock * 16) < 0) continue;
      this.draw('cube', [builder.x, 1, builder.z], [.42, .75, .42], builder.color, 0, .04);
      this.draw('sphere', [builder.x, 2, builder.z], [.34, .34, .34], '#f0bd88');
      if (builder.carrying) this.draw('cube', [builder.x + .42, 1.35, builder.z], [.13, .18, .13], '#fbbf24', this.clock, .16);
    }
  }
}
