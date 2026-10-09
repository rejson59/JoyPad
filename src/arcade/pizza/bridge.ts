/**
 * Most WEBZA ↔ JoyPad: wszystko, co tłumaczy platformę na silnik i z powrotem.
 *
 * Moduł jest CZYSTY (bez three.js, bez DOM), żeby `selftest:pizza` mógł go sprawdzić
 * w node bez GPU. Silnik (`Game.ts`) zna tylko `InputSample`; to tutaj wiadomo, że
 * telefon ma jedną gałkę i jeden przycisk, a klawiatura — osobne klawisze sieci i rzutu.
 *
 * KONTRAKT STEROWANIA (pad = gałka + jeden przycisk):
 *   • gałka        → bieg (ten sam wektor co WASD),
 *   • przycisk     → SIEĆ: tap = skok / przyciągnięcie w powietrzu, przytrzymanie = huśtawka,
 *   • rzut pizzy   → półautomatyczny: kurier sam rzuca w klienta, którego ma przed sobą
 *                    (`Game.autoFire`). Klawiatura dostaje ręczny rzut (klawisz „throw”);
 *                    pierwsze jego użycie wyłącza asystę dla tego slotu.
 */

import type { PadInput } from '../../net/protocol';
import type { Language } from '../../platform/i18n';
import type { Racer, RoundHud, RoundPlayer, RoundResult } from '../runtime';
import { loc } from './strings';
import { GRADE_LINES, type Mode, type Snapshot } from './types';

export interface InputSample {
  /** −1 (lewo) … 1 (prawo). */
  x: number;
  /** −1 (do kamery) … 1 (od kamery, „w górę ekranu”). */
  y: number;
  /** Sieć / skok / zip. */
  action: boolean;
  /** Ręczny rzut pizzy (tylko klawiatura). */
  fire: boolean;
  /** Czy kurier ma rzucać sam. */
  assist: boolean;
}

export interface KeySet {
  up: readonly string[];
  down: readonly string[];
  left: readonly string[];
  right: readonly string[];
  web: readonly string[];
  throw: readonly string[];
}

/** Zestawy klawiszy w konwencji JoyPada: slot 1 = WASD, slot 2 = strzałki, potem TFGH i IJKL. */
export const KEY_SETS: readonly KeySet[] = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], web: ['Space', 'KeyQ'], throw: ['KeyE'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], web: ['Enter', 'Numpad0'], throw: ['ShiftRight', 'Slash', 'Period'] },
  { up: ['KeyT'], down: ['KeyG'], left: ['KeyF'], right: ['KeyH'], web: ['KeyR'], throw: ['KeyY'] },
  { up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], web: ['KeyU'], throw: ['KeyO'] },
];

const GAME_KEYS = new Set(KEY_SETS.flatMap(set => [...set.up, ...set.down, ...set.left, ...set.right, ...set.web, ...set.throw]));

/** Klawisze, którym przeglądarka nie może wolno przewinąć strony ani aktywować przycisku. */
export function isGameKey(code: string): boolean {
  return GAME_KEYS.has(code) && (code.startsWith('Arrow') || code === 'Space' || code === 'Enter' || code.startsWith('Numpad') || code === 'Slash' || code === 'Period');
}

/** Który slot ma ten klawisz jako ręczny rzut — do wyłączania asysty. */
export function throwSlotOf(code: string): number {
  return KEY_SETS.findIndex(set => set.throw.includes(code));
}

export const SHIFT_SECONDS = [60, 120, 180] as const;
export const shiftSeconds = (primary: number): number => SHIFT_SECONDS[primary] ?? SHIFT_SECONDS[1];
export const modeOf = (secondary: number): Mode => (secondary === 1 ? 'versus' : 'coop');

/** Wektor gałki w przestrzeni ekranu, w konwencji silnika (y dodatnie = „w górę”). */
export function padVector(pad: PadInput | undefined): { x: number; y: number } {
  if (!pad) return { x: 0, y: 0 };
  if (pad.steer === 'tank') return { x: pad.turn, y: pad.fwd };
  const dx = pad.dirX ?? pad.turn ?? 0;
  // `dirY` rośnie w dół ekranu; starsze pady mają tylko `fwd` (rośnie do przodu).
  const dy = pad.dirY ?? -(pad.fwd ?? 0);
  return { x: dx, y: -dy };
}

const STICK_DEADZONE = 0.1;

/** Skleja klawiaturę i pad jednego slotu w to, co rozumie silnik. Klawiatura ma pierwszeństwo. */
export function sampleInput(slot: number, keys: ReadonlySet<string>, pad: PadInput | undefined, manualThrow: boolean): InputSample {
  const set = KEY_SETS[slot];
  const has = (codes: readonly string[]) => codes.some(code => keys.has(code));
  const stick = padVector(pad);
  let { x, y } = stick;
  let action = Boolean(pad?.fire);
  let fire = false;
  if (set) {
    const kx = Number(has(set.right)) - Number(has(set.left));
    const ky = Number(has(set.up)) - Number(has(set.down));
    if (kx || ky) {
      const scale = Math.max(1, Math.hypot(kx, ky));
      x = kx / scale;
      y = ky / scale;
    }
    action = action || has(set.web);
    fire = has(set.throw);
  }
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length < STICK_DEADZONE) { x = 0; y = 0; }
  else if (length > 1) { x /= length; y /= length; }
  return { x, y, action, fire, assist: !manualThrow };
}

/* ---------- kolory i podpisy ---------- */

const HEX = /^#[0-9a-f]{6}$/i;
const channel = (hex: string, index: number) => parseInt(hex.slice(1 + index * 2, 3 + index * 2), 16);

export function mixHex(a: string, b: string, t: number): string {
  const out = [0, 1, 2].map(index => Math.round(channel(a, index) + (channel(b, index) - channel(a, index)) * t));
  return `#${out.map(value => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`;
}

/** Odcienie kuriera pochodne od koloru slotu — karta w HUD i postać w świecie to jeden kolor. */
export function paletteFor(color: string) {
  const base = HEX.test(color) ? color : '#ff9a52';
  return {
    color: base,
    deep: mixHex(base, '#000000', 0.62),
    accent: mixHex(base, '#ffffff', 0.72),
    visor: mixHex(base, '#ffffff', 0.38),
    scarf: mixHex(base, '#ffffff', 0.82),
  };
}

export function courierLabel(name: string): string {
  return name.trim().toUpperCase().slice(0, 10) || 'KURIER';
}

/** Styl kuriera dla gracza: kolor slotu + nick nad głową i w komunikatach. */
export function styleFor(player: Racer) {
  const label = courierLabel(player.name);
  return { ...paletteFor(player.color), name: label, full: label };
}

/* ---------- HUD i wynik ---------- */

export function snapshotToHud(snap: Snapshot, humans: readonly Racer[], language: Language): RoundHud {
  const en = language === 'en';
  const players: RoundPlayer[] = humans.map(human => {
    const hud = snap.players[human.slot];
    if (!hud) return { slot: human.slot, name: human.name, color: human.color, score: 0, detail: '—', isBot: false };
    const bag = en ? `${hud.pizzas}/${hud.maxPizzas} pizzas` : `${hud.pizzas}/${hud.maxPizzas} pizz`;
    const streak = hud.combo >= 2 ? (en ? ` · streak ×${hud.combo}` : ` · seria ×${hud.combo}`) : '';
    const heat = hud.overdrive > 0 ? (en ? ' · HEAT' : ' · ROZGRZANIE') : '';
    return {
      slot: human.slot, name: human.name, color: human.color, score: hud.score,
      detail: `${bag}${streak}${heat}`,
      value: hud.pizzas, maxValue: hud.maxPizzas, isBot: false,
    };
  });
  const objective = snap.mode === 'coop'
    ? (en ? 'Deliver as many pizzas as you can — shared score' : 'Dowieźcie jak najwięcej pizz — wynik wspólny')
    : (en ? 'Most points wins the shift' : 'Kto dowiezie najwięcej — wygrywa zmianę');
  const status = snap.announcer
    ? `${snap.announcer}${snap.announcerSub ? ` · ${snap.announcerSub}` : ''}`
    : snap.hint || (en ? `Open orders: ${snap.orders}` : `Zamówienia: ${snap.orders}`);
  return {
    timeLeft: Math.max(0, snap.timeLeft),
    countdown: snap.phase === 'countdown' ? snap.countdown : 0,
    paused: snap.phase === 'paused',
    objective,
    status,
    players,
    powerUp: null,
  };
}

export function resultFromSnapshot(snap: Snapshot, humans: readonly Racer[], language: Language): RoundResult {
  const en = language === 'en';
  const players: RoundPlayer[] = humans.flatMap(human => {
    const hud = snap.players[human.slot];
    if (!hud) return [];
    return [{
      slot: human.slot, name: human.name, color: human.color, score: hud.score,
      detail: en
        ? `${hud.deliveries} deliveries · ${hud.perfects} perfect · best streak ×${hud.bestCombo}`
        : `${hud.deliveries} dostaw · ${hud.perfects} perfekt · najlepsza seria ×${hud.bestCombo}`,
      isBot: false,
    }];
  });
  const total = players.reduce((sum, player) => sum + player.score, 0);
  const unit = en ? 'pts' : 'pkt';
  const comment = loc(GRADE_LINES[snap.grade] ?? '', language);
  // Współpraca (albo jeden kurier) = ocena zespołu; rywalizacja = kto zebrał więcej.
  if (snap.mode === 'coop' || players.length <= 1) {
    return {
      title: `${en ? 'GRADE' : 'OCENA'} ${snap.grade}`,
      subtitle: `${comment} · ${total} ${unit}`,
      winnerSlot: null,
      allWon: snap.stars >= 1,
      players,
    };
  }
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const [top, second] = ranked;
  if (!top || top.score <= 0 || (second && second.score === top.score)) {
    return {
      title: en ? 'DRAW' : 'REMIS',
      subtitle: en ? `Tied at ${top?.score ?? 0} ${unit}` : `Równy wynik: ${top?.score ?? 0} ${unit}`,
      winnerSlot: null, allWon: false, players,
    };
  }
  return {
    title: `${top.name.toUpperCase()} ${en ? 'WINS' : 'WYGRYWA'}`,
    subtitle: `${top.score} ${unit} · ${en ? 'grade' : 'ocena'} ${snap.grade}`,
    winnerSlot: top.slot, allWon: false, players,
  };
}
