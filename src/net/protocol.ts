/** Wspólny protokół — ten sam JSON przez WebRTC albo awaryjny przekaźnik MQTT. */
import type { PlayerProfile } from '../platform/profile';
import type { GameId } from '../arcade/catalog';

export const ROOM_PREFIX = 'stalowy-front-';
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

/** Jednorazowy klucz przekazywany tylko w QR/linku pada. Nie zmienia częstotliwości wejścia. */
export const JOIN_TOKEN_LENGTH = 24;

export function randomJoinToken(): string {
  const bytes = new Uint8Array(JOIN_TOKEN_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function randomCode(): string {
  let s = '';
  const arr = new Uint32Array(CODE_LENGTH);
  crypto.getRandomValues(arr);
  for (let i = 0; i < CODE_LENGTH; i++) s += CODE_ALPHABET[arr[i] % CODE_ALPHABET.length];
  return s;
}

export function normalizeCode(raw: string): string {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/O/g, '0').replace(/I/g, '1').slice(0, CODE_LENGTH);
}

/** Nick wyświetlany w lobby i w HUD-ach — bez pustych wartości i bez nadmiarowych spacji. */
export function normalizeNick(raw: string, fallback = ''): string {
  const nick = raw.trim().replace(/\s+/g, ' ').slice(0, 14);
  return nick || fallback;
}

export function roomIdFromCode(code: string): string {
  return ROOM_PREFIX + code.toUpperCase();
}

/**
 * Adres, który otwiera telefon (hash routing => działa na GitHub Pages).
 *
 * Do QR nie kopiujemy parametrów TURN ani haseł z adresu strony. Własny
 * serwer sygnalizacji (`srv`) jest bezpieczny do przekazania, ale credentiale
 * TURN muszą pozostać lokalne na urządzeniu hosta.
 */
export function padUrlFor(code: string, joinToken?: string): string {
  const search = new URLSearchParams();
  try {
    const srv = new URLSearchParams(location.search).get('srv');
    if (srv) search.set('srv', srv);
  } catch { /* URL może być niedostępny w teście offline. */ }
  const base = `${location.origin}${location.pathname}${search.toString() ? `?${search}` : ''}`;
  return `${base}#pad=${code}${joinToken ? `&key=${encodeURIComponent(joinToken)}` : ''}`;
}

/** Czy adres wskazuje tryb pada (`#pad` lub `#pad=KOD`). */
export function isPadRoute(): boolean {
  return /(^#|&)pad(=|$|&)/.test(location.hash);
}

export function padCodeFromHash(): string | null {
  const m = /(?:^#|&)pad=([A-Za-z0-9]*)/.exec(location.hash);
  if (!m) return null;
  return normalizeCode(m[1] ?? '');
}

export function padTokenFromHash(): string | null {
  const m = /(?:^#|&)key=([A-Za-z0-9]+)/.exec(location.hash);
  return m ? m[1].slice(0, JOIN_TOKEN_LENGTH * 2) : null;
}

/**
 * Tryb sterowania joystickiem na telefonie.
 *
 * - `direct` (domyślny) — **pchasz gałkę w dół ⇒ czołg jedzie w dół ekranu**.
 *   Kierunek z gałki = kierunek na mapie, kadłub sam się obraca w stronę jazdy.
 *   Zero zgadywania „gdzie teraz jest przód mojego czołgu”.
 * - `tank` — klasyk dla purystów: góra = gaz do przodu, dół = wsteczny,
 *   lewo/prawo = obrót kadłuba względem kierunku, w którym czołg jest zwrócony.
 */
export type PadSteer = 'direct' | 'tank';

/** Nowe telefony startują w trybie kierunkowym — najmniej mylący. */
export const DEFAULT_PAD_STEER: PadSteer = 'direct';

/** Stan joysticka wysyłany przez telefon. */
export interface PadInput {
  /** -1 (tył) .. 1 (przód) — używane w trybie `tank` (i przez starsze pady). */
  fwd: number;
  /** -1 (lewo) .. 1 (prawo) — używane w trybie `tank` (i przez starsze pady). */
  turn: number;
  fire: boolean;
  /**
   * Tryb wybrany na telefonie. Brak pola = stary pad (host stosuje wtedy `fwd`/`turn`),
   * dzięki czemu telefon z zapisaną w pamięci starszą wersją strony nadal działa.
   */
  steer?: PadSteer;
  /** Wektor kierunku w przestrzeni ekranu (x = prawo, y = DÓŁ), -1..1 — tryb `direct`. */
  dirX?: number;
  dirY?: number;
  /**
   * Joystick celowania: kierunek wieży w przestrzeni ekranu (x = prawo, y = DÓŁ), -1..1.
   * (0,0) = nie celujesz — wieża po chwili wraca do kierunku kadłuba.
   */
  aimX?: number;
  aimY?: number;
}

export const ZERO_INPUT: PadInput = { fwd: 0, turn: 0, fire: false };

export type PadFx = 'fire' | 'hit' | 'kill' | 'dead' | 'pickup' | 'shield' | 'respawn' | 'win' | 'lose';

export type HostScreen = 'lab' | 'lobby' | 'menu' | 'setup' | 'game' | 'over';
export type RemoteCommand = 'left' | 'right' | 'up' | 'down' | 'select' | 'back' | 'pause' | 'restart' | 'home' | 'x' | 'y';
export const REMOTE_COMMANDS: readonly RemoteCommand[] = ['left', 'right', 'up', 'down', 'select', 'back', 'pause', 'restart', 'home', 'x', 'y'];
export interface RemoteEvent { id: number; command: RemoteCommand }

export interface ArcadeHud {
  countdown?: number;
  paused?: boolean;
  score: number;
  timeLeft: number;
  title: string;
  detail: string;
  value?: number;
  maxValue?: number;
}

export interface SessionOptions {
  /** Host-only configuration fingerprint; changing settings clears ready votes. */
  revision?: string;
  primaryLabel: string;
  primaryValue: string;
  secondaryLabel: string;
  secondaryValue: string;
  mode?: 'classic' | 'tournament' | '2v2';
  tournamentRound?: number;
}

export interface RoomSettings { locked: boolean; suggestions: boolean; dimmed: boolean }
export const DEFAULT_ROOM: RoomSettings = { locked: false, suggestions: true, dimmed: false };
export type RoomAction = { kind: 'locked' | 'suggestions' | 'dimmed'; value: boolean } | { kind: 'kick' | 'transfer'; slot: number };

export interface SessionState {
  room?: RoomSettings;
  game: GameId | null;
  screen: HostScreen;
  selection: number;
  adminSlot: number | null;
  roster: { slot: number; nick: string; ready?: boolean; rematch?: boolean; suggestedGame?: GameId; profile?: PlayerProfile }[];
  options?: SessionOptions;
}

/** Telefon -> komputer */
export type PadMessage =
  /** `pid` = stały identyfikator telefonu (localStorage) — zapobiega dwóm slotom na tym samym telefonie po zmianie transportu. */
  | { t: 'hello'; nick: string; ua: string; v: number; pid?: string; steer?: PadSteer; token?: string }
  | { t: 'input'; fwd: number; turn: number; fire: boolean; steer?: PadSteer; dirX?: number; dirY?: number; aimX?: number; aimY?: number }
  | { t: 'profile'; profile: PlayerProfile }
  | { t: 'room'; action: RoomAction }
  | { t: 'suggest'; game: GameId | null }
  | { t: 'remind' }
  | { t: 'intent'; kind: 'ready' | 'rematch'; value: boolean }
  | { t: 'pause' }
  | { t: 'command'; command: RemoteCommand }
  | { t: 'choose'; index: number }
  | { t: 'nick'; nick: string }
  | { t: 'ping'; at: number };

/** Komputer -> telefon */
export type HostMessage =
  | { t: 'readyReminder' }
  | { t: 'welcome'; slot: number; name: string; nick?: string; color: string; darkColor: string; screen: HostScreen }
  | { t: 'nick'; nick: string }
  | { t: 'rejected'; reason: string }
  | { t: 'slot'; slot: number; name: string; color: string; darkColor: string }
  | { t: 'screen'; screen: HostScreen; winnerName?: string; winnerColor?: string; youWon?: boolean }
  | { t: 'session'; session: SessionState }
  | { t: 'arcadeHud'; hud: ArcadeHud }
  | { t: 'hud'; hp: number; maxHp: number; alive: boolean; kills: number; deaths: number; lives: number; respawn: number; countdown: number; paused: boolean; timeLeft: number; shield: boolean; rapid: boolean; big: boolean; speed: boolean; mode: 'deathmatch' | 'survival' }
  | { t: 'fx'; fx: PadFx }
  | { t: 'pong'; at: number }
  | { t: 'achievement'; id: import('../platform/profile').AchievementId }
  | { t: 'roundResult'; game: GameId; won: boolean }
  | { t: 'rateLimited'; scope: 'suggest'; retryAfter: number };

export const PROTOCOL_VERSION = 1;

/** Minimalny runtime guard — sieć nie może wpuścić przypadkowego JSON-u do silnika. */
export function isPadMessage(value: unknown): value is PadMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.t !== 'string') return false;
  if (msg.t === 'input') {
    return typeof msg.fwd === 'number' && Number.isFinite(msg.fwd)
      && typeof msg.turn === 'number' && Number.isFinite(msg.turn)
      && typeof msg.fire === 'boolean';
  }
  if (msg.t === 'hello') return typeof msg.nick === 'string' && msg.nick.length <= 64 && typeof msg.v === 'number';
  if (msg.t === 'nick') return typeof msg.nick === 'string' && msg.nick.length <= 64;
  if (msg.t === 'ping') return typeof msg.at === 'number' && Number.isFinite(msg.at);
  if (msg.t === 'command') return typeof msg.command === 'string';
  if (msg.t === 'choose') return typeof msg.index === 'number' && Number.isFinite(msg.index);
  return ['profile', 'room', 'suggest', 'remind', 'intent', 'pause'].includes(msg.t);
}

export function isHostMessage(value: unknown): value is HostMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (typeof msg.t !== 'string') return false;
  if (msg.t === 'rejected') return typeof msg.reason === 'string';
  if (msg.t === 'welcome') return Number.isInteger(msg.slot) && typeof msg.name === 'string' && typeof msg.color === 'string' && typeof msg.darkColor === 'string';
  if (msg.t === 'nick') return typeof msg.nick === 'string';
  if (msg.t === 'screen') return ['lab', 'lobby', 'menu', 'setup', 'game', 'over'].includes(msg.screen as string);
  if (msg.t === 'session') return Boolean(msg.session && typeof msg.session === 'object');
  if (msg.t === 'arcadeHud') return Boolean(msg.hud && typeof msg.hud === 'object' && typeof (msg.hud as Record<string, unknown>).score === 'number' && typeof (msg.hud as Record<string, unknown>).timeLeft === 'number');
  if (msg.t === 'hud') return typeof msg.hp === 'number' && typeof msg.maxHp === 'number' && typeof msg.alive === 'boolean';
  if (msg.t === 'fx') return ['fire', 'hit', 'kill', 'dead', 'pickup', 'shield', 'respawn', 'win', 'lose'].includes(msg.fx as string);
  if (msg.t === 'pong') return typeof msg.at === 'number' && Number.isFinite(msg.at);
  if (msg.t === 'achievement') return typeof msg.id === 'string' && Object.prototype.hasOwnProperty.call({ firstWin: 1, fiveRounds: 1, winStreak: 1, snakeBeta: 1 }, msg.id as string);
  if (msg.t === 'roundResult') return typeof msg.game === 'string' && typeof msg.won === 'boolean';
  return msg.t === 'readyReminder' || msg.t === 'slot';
}

/**
 * Ustawienia sieciowe (serwer sygnalizacji + ICE) mieszkają w `./signaling` —
 * host i telefon muszą mieć dokładnie takie same, inaczej się nie znajdą.
 */
