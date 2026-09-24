/**
 * Wspólny protokół komunikacji komputer (host) <-> telefon (pad).
 * Wszystko leci przez WebRTC DataChannel (PeerJS), jako JSON.
 */

export const ROOM_PREFIX = 'stalowy-front-';
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;

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

export function roomIdFromCode(code: string): string {
  return ROOM_PREFIX + code.toUpperCase();
}

/** Adres, który otwiera telefon (hash routing => działa na GitHub Pages). */
export function padUrlFor(code: string): string {
  const base = `${location.origin}${location.pathname}${location.search}`;
  return `${base}#pad=${code}`;
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

export type HostScreen = 'menu' | 'setup' | 'game' | 'over';

/** Telefon -> komputer */
export type PadMessage =
  /** `pid` = stały identyfikator telefonu (localStorage) — zapobiega dwóm slotom na tym samym telefonie po zmianie transportu. */
  | { t: 'hello'; nick: string; ua: string; v: number; pid?: string; steer?: PadSteer }
  | { t: 'input'; fwd: number; turn: number; fire: boolean; steer?: PadSteer; dirX?: number; dirY?: number; aimX?: number; aimY?: number }
  | { t: 'pause' }
  | { t: 'ping'; at: number };

/** Komputer -> telefon */
export type HostMessage =
  | { t: 'welcome'; slot: number; name: string; color: string; darkColor: string; screen: HostScreen }
  | { t: 'rejected'; reason: string }
  | { t: 'slot'; slot: number; name: string; color: string; darkColor: string }
  | { t: 'screen'; screen: HostScreen; winnerName?: string; winnerColor?: string; youWon?: boolean }
  | { t: 'hud'; hp: number; maxHp: number; alive: boolean; kills: number; deaths: number; lives: number; respawn: number; countdown: number; paused: boolean; timeLeft: number; shield: boolean; rapid: boolean; big: boolean; speed: boolean; mode: 'deathmatch' | 'survival' }
  | { t: 'fx'; fx: PadFx }
  | { t: 'pong'; at: number };

export const PROTOCOL_VERSION = 1;

/**
 * Ustawienia sieciowe (serwer sygnalizacji + ICE) mieszkają w `./signaling` —
 * host i telefon muszą mieć dokładnie takie same, inaczej się nie znajdą.
 */
