export interface Vec { x: number; y: number }

export type MapId = 'desert' | 'nightcity' | 'forest';
export type GameMode = 'deathmatch' | 'survival';

export interface PlayerConfig {
  id: number;
  name: string;
  color: string;
  darkColor: string;
  glowColor: string;
  isBot: boolean;
  enabled: boolean;
  controls: {
    forward: string[];
    back: string[];
    left: string[];
    right: string[];
    fire: string[];
  };
  controlLabels: {
    forward: string;
    back: string;
    left: string;
    right: string;
    fire: string;
  };
}

export interface TankState {
  id: number;
  cfg: PlayerConfig;
  x: number; y: number;
  vx: number; vy: number;
  hullAngle: number;
  turretAngle: number;
  barrelHeat: number;
  recoil: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnTimer: number;
  kills: number;
  deaths: number;
  lives: number;
  shield: number;
  rapidUntil: number;
  bigUntil: number;
  speedUntil: number;
  trackPhase: number;
  throttle: number;
  lastShot: number;
  spawnShield: number;
  aiState?: BotBrain;
  muzzle: number;
  enginePitch: number;
  /** Do kiedy (czas gry) wieża trzyma kierunek z joysticka celowania po jego puszczeniu. */
  aimHoldUntil?: number;
  /** Gracz właśnie celuje joystickiem (rysujemy linię celowania). */
  aiming?: boolean;
}

export interface BotBrain {
  targetAngle: number;
  nextThink: number;
  strafeDir: number;
  wantFire: boolean;
  stuckTimer: number;
  lastX: number; lastY: number;
  waypoint: Vec;
}

export interface ShellState {
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  owner: number;
  life: number;
  bounces: number;
  big: boolean;
  trail: { x: number; y: number; a: number }[];
}

export interface WallState {
  x: number; y: number; w: number; h: number;
  hp: number; maxHp: number;
  type: 'concrete' | 'crate' | 'metal' | 'sandbag' | 'brick';
  destroyed: boolean;
  shake: number;
}

export interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  life: number; maxLife: number;
  size: number; grow: number;
  color: string;
  color2?: string;
  alpha: number;
  type: 'smoke' | 'fire' | 'spark' | 'dust' | 'debris' | 'flash' | 'ring' | 'rain' | 'snow' | 'leaf' | 'tracer' | 'casing' | 'blood' | 'steam';
  rotation: number;
  rotSpeed: number;
  gravity: number;
  drag: number;
  glow: boolean;
}

export interface FloatText {
  x: number; y: number;
  text: string;
  life: number; maxLife: number;
  color: string;
  size: number;
}

export interface PowerUpState {
  x: number; y: number;
  kind: 'repair' | 'shield' | 'rapid' | 'big' | 'speed';
  life: number;
  bob: number;
  taken: boolean;
}

export interface Light {
  x: number; y: number;
  radius: number;
  color: string;
  intensity: number;
  life: number; maxLife: number;
  flicker: boolean;
}

export interface KillEvent {
  killer: number;
  victim: number;
  killerName: string;
  victimName: string;
  time: number;
  id: number;
}

export interface GameStats {
  startTime: number;
  shotsFired: number;
  explosions: number;
}

export const PLAYER_DEFS: PlayerConfig[] = [
  {
    id: 0, name: 'GRACZ 1', color: '#4ade80', darkColor: '#14532d', glowColor: 'rgba(74,222,128,0.5)',
    isBot: false, enabled: true,
    controls: { forward: ['KeyW'], back: ['KeyS'], left: ['KeyA'], right: ['KeyD'], fire: ['KeyQ', 'Space'] },
    controlLabels: { forward: 'W', back: 'S', left: 'A', right: 'D', fire: 'Q / SPACJA' },
  },
  {
    id: 1, name: 'GRACZ 2', color: '#38bdf8', darkColor: '#0c4a6e', glowColor: 'rgba(56,189,248,0.5)',
    isBot: false, enabled: true,
    controls: { forward: ['ArrowUp'], back: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], fire: ['Enter', 'ShiftRight', 'Slash', 'Numpad0'] },
    controlLabels: { forward: '▲', back: '▼', left: '◀', right: '▶', fire: 'ENTER / /' },
  },
  {
    id: 2, name: 'GRACZ 3', color: '#fb923c', darkColor: '#7c2d12', glowColor: 'rgba(251,146,60,0.5)',
    isBot: false, enabled: false,
    controls: { forward: ['KeyT'], back: ['KeyG'], left: ['KeyF'], right: ['KeyH'], fire: ['KeyR'] },
    controlLabels: { forward: 'T', back: 'G', left: 'F', right: 'H', fire: 'R' },
  },
  {
    id: 3, name: 'GRACZ 4', color: '#c084fc', darkColor: '#581c87', glowColor: 'rgba(192,132,252,0.5)',
    isBot: false, enabled: false,
    controls: { forward: ['KeyI'], back: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], fire: ['KeyU'] },
    controlLabels: { forward: 'I', back: 'K', left: 'J', right: 'L', fire: 'U' },
  },
];
