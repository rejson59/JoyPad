export interface CarInput {
  throttle: number;
  steer: number;
  pitch: number; // +1 = nos w dół (W)
  roll: number; // +1 = przechył w prawo
  jump: boolean;
  jumpPressed: boolean;
  boost: boolean;
  handbrake: boolean;
}

export const newInput = (): CarInput => ({
  throttle: 0,
  steer: 0,
  pitch: 0,
  roll: 0,
  jump: false,
  jumpPressed: false,
  boost: false,
  handbrake: false,
});

export interface MatchSettings {
  mode: number; // 1,2,3
  difficulty: number; // 0,1,2
  minutes: number;
  team: number; // 0 niebiescy, 1 pomarańczowi
}

export interface GarageSettings {
  body: number; // 0..2
  accent: string;
  wheel: number; // 0..2
}

export interface GameSettings {
  quality: number; // 0..2
  volume: number; // 0..1
  music: boolean;
  fov: number;
  shake: boolean;
  showFps: boolean;
}

export type Phase = 'menu' | 'garage' | 'countdown' | 'playing' | 'goal' | 'replay' | 'ended';

export interface PlayerStat {
  name: string;
  team: number;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  score: number;
  isPlayer: boolean;
}

export interface FeedItem {
  id: number;
  text: string;
  team: number;
  kind: 'goal' | 'save' | 'demo' | 'info' | 'boost';
}

export interface HudState {
  phase: Phase;
  paused: boolean;
  scores: [number, number];
  time: number;
  overtime: boolean;
  countdown: number; // 3..0 ; -1 brak
  boost: number;
  speed: number;
  supersonic: boolean;
  ballCam: boolean;
  goalBanner: { team: number; name: string; speed: number } | null;
  replayProgress: number;
  winner: number; // -1 brak, 0/1 , 2 remis
  stats: PlayerStat[];
  feed: FeedItem[];
  fps: number;
  playerTeam: number;
  demolished: number; // sekundy do respawnu
  showScoreboard: boolean;
  toast: string | null;
}
