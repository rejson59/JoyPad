/**
 * Most Turbo League ↔ JoyPad: wszystko, co tłumaczy platformę na silnik i z powrotem.
 *
 * Moduł jest CZYSTY (bez three.js, bez DOM), żeby `selftest:league` sprawdził go w node.
 * Silnik (`LeagueGame.ts`, z paczki nitro-league.zip) zna tylko `CarInput` i `LeagueSnapshot`.
 *
 * KONTRAKT STEROWANIA (pad = gałka + jeden przycisk):
 *   • gałka    → KIERUNEK jazdy w osiach ekranu (góra ekranu = dalej od kamery): auto samo
 *                skręca w tę stronę i przyspiesza, puszczona gałka hamuje (`driveToward`),
 *   • przycisk → BOOST (przytrzymaj); tego samego klawisza używa klawiatura,
 *   • brak skoku i trików powietrznych — pad ich nie obsłuży; w powietrzu auto samo się
 *     wyrównuje (`autoLevel`), a zablokowane na dachu odwraca się po chwili.
 */

import type { PadInput } from '../../net/protocol';
import type { Language } from '../../platform/i18n';
import type { Racer, RoundHud, RoundPlayer, RoundResult } from '../runtime';

export type Vec3 = readonly [number, number, number];

/* ------------------------------------------------------------------ drużyny */

export interface RosterEntry {
  /** Indeks auta w silniku (kolejność w składzie). */
  index: number;
  /** Slot telefonu/klawiatury (u botów: zajęty slot, tylko do podpisu). */
  slot: number;
  name: string;
  color: string;
  human: boolean;
  /** 0 = niebiescy (bronią +Z, atakują w prawo ekranu), 1 = pomarańczowi. */
  team: 0 | 1;
}

export const MAX_CARS = 4;

/**
 * Podział na drużyny dla 1–4 aut (ludzie + boty z `RoundConfig.players`):
 * ludzie siadają naprzemiennie (niebiescy, pomarańczowi, niebiescy…), więc dwóch ludzi
 * gra przeciw sobie; boty uzupełniają mniejszą drużynę, a przy remisie liczebności idą do niebieskich.
 * Wynik: 1 auto = trening, 2 = 1v1, 3 = 2v1, 4 = 2v2 — zawsze sensowny, nigdy puste auto.
 */
export function assignTeams(players: readonly Racer[]): RosterEntry[] {
  const humans = players.filter(player => !player.isBot);
  const bots = players.filter(player => player.isBot);
  const ordered = [...humans, ...bots].slice(0, MAX_CARS);
  const sizes = [0, 0];
  return ordered.map((player, index) => {
    let team: 0 | 1;
    if (!player.isBot) team = (humans.indexOf(player) % 2) as 0 | 1;
    else team = sizes[0] <= sizes[1] ? 0 : 1;
    sizes[team]++;
    return { index, slot: player.slot, name: player.name, color: player.color, human: !player.isBot, team };
  });
}

/** Ile aut ma największa drużyna — tyle miejsc wznowienia silnik musi przygotować. */
export function teamSize(roster: readonly RosterEntry[]): number {
  return Math.max(1, ...[0, 1].map(team => roster.filter(entry => entry.team === team).length));
}

/* ----------------------------------------------------------------- sterowanie */

export interface StickSample {
  /** Gałka w osiach ekranu: x w prawo, y „w górę” (dalej od kamery), długość ≤ 1. */
  x: number;
  y: number;
  boost: boolean;
}

export interface KeySet { up: readonly string[]; down: readonly string[]; left: readonly string[]; right: readonly string[]; boost: readonly string[] }

/** Klawisze w konwencji JoyPada: slot 1 = WASD, slot 2 = strzałki, potem TFGH i IJKL. */
export const KEY_SETS: readonly KeySet[] = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], boost: ['Space', 'KeyQ'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], boost: ['Enter', 'ShiftRight', 'Slash', 'Numpad0'] },
  { up: ['KeyT'], down: ['KeyG'], left: ['KeyF'], right: ['KeyH'], boost: ['KeyR'] },
  { up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], boost: ['KeyU'] },
];

const GAME_KEYS = new Set(KEY_SETS.flatMap(set => [...set.up, ...set.down, ...set.left, ...set.right, ...set.boost]));

/** Klawisze, którym przeglądarka nie może przewijać strony ani aktywować przycisku. */
export function isGameKey(code: string): boolean {
  return GAME_KEYS.has(code) && (code.startsWith('Arrow') || code === 'Space' || code === 'Enter' || code.startsWith('Numpad') || code === 'Slash');
}

/** Wektor gałki w osiach ekranu (y dodatnie = w górę ekranu). */
export function padStick(pad: PadInput | undefined): { x: number; y: number } {
  if (!pad) return { x: 0, y: 0 };
  if (pad.steer === 'tank') return { x: pad.turn, y: pad.fwd };
  const dx = pad.dirX ?? pad.turn ?? 0;
  const dy = pad.dirY ?? -(pad.fwd ?? 0); // dirY rośnie w dół ekranu
  return { x: dx, y: -dy };
}

const STICK_DEADZONE = 0.12;

/** Skleja klawiaturę i pad jednego slotu. Klawiatura ma pierwszeństwo, gdy któryś klawisz kierunku jest wciśnięty. */
export function sampleStick(slot: number, keys: ReadonlySet<string>, pad: PadInput | undefined): StickSample {
  const set = KEY_SETS[slot];
  const has = (codes: readonly string[]) => codes.some(code => keys.has(code));
  let { x, y } = padStick(pad);
  let boost = Boolean(pad?.fire);
  if (set) {
    const kx = Number(has(set.right)) - Number(has(set.left));
    const ky = Number(has(set.up)) - Number(has(set.down));
    if (kx || ky) {
      const scale = Math.max(1, Math.hypot(kx, ky));
      x = kx / scale;
      y = ky / scale;
    }
    boost = boost || has(set.boost);
  }
  const length = Math.hypot(x, y);
  if (!Number.isFinite(length) || length < STICK_DEADZONE) { x = 0; y = 0; }
  else if (length > 1) { x /= length; y /= length; }
  return { x, y, boost };
}

/**
 * Kamera stoi po stronie +X i patrzy w −X: prawo ekranu = −Z, „w górę ekranu” = −X.
 * Niebiescy bronią bramki w +Z, więc atakują w prawo; pomarańczowi w lewo.
 */
export function stickToWorld(x: number, y: number): { x: number; z: number } {
  return { x: -y, z: -x };
}

export interface DriveCommand { throttle: number; steer: number; handbrake: boolean }

const dot3 = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross3 = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const flatten = (v: Vec3, n: Vec3): Vec3 => { const d = dot3(v, n); return [v[0] - n[0] * d, v[1] - n[1] * d, v[2] - n[2] * d]; };
const length3 = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

/** Kąt (rad) od kierunku jazdy do żądanego kierunku, wokół normalnej powierzchni; dodatni = cel po lewej. */
export function headingError(forward: Vec3, normal: Vec3, wish: Vec3): number {
  const f = flatten(forward, normal);
  const w = flatten(wish, normal);
  const fl = length3(f), wl = length3(w);
  if (fl < 1e-4 || wl < 1e-4) return 0;
  const fn: Vec3 = [f[0] / fl, f[1] / fl, f[2] / fl];
  const wn: Vec3 = [w[0] / wl, w[1] / wl, w[2] / wl];
  return Math.atan2(dot3(normal, cross3(fn, wn)), dot3(fn, wn));
}

export const STEER_GAIN = 2.2;

/**
 * Gałka → gaz, skręt i hamulec ręczny. Konwencja skrętu z `Car.groundStep`: `steer = +1` skręca w prawo.
 * Neutralna gałka hamuje (nie turla się po boisku), cel za plecami zawraca łukiem z poślizgiem.
 */
export function driveToward(forward: Vec3, normal: Vec3, forwardSpeed: number, stick: { x: number; y: number }): DriveCommand {
  const magnitude = Math.min(1, Math.hypot(stick.x, stick.y));
  if (!(magnitude >= STICK_DEADZONE)) {
    const slow = Math.abs(forwardSpeed) < 0.6;
    return { throttle: slow ? 0 : -Math.sign(forwardSpeed) * Math.min(1, Math.abs(forwardSpeed) / 5), steer: 0, handbrake: false };
  }
  const world = stickToWorld(stick.x, stick.y);
  const error = headingError(forward, normal, [world.x, 0, world.z]);
  const steer = Math.max(-1, Math.min(1, -error * STEER_GAIN));
  const behind = Math.abs(error) > 2.0;
  return {
    throttle: Math.min(1, magnitude / 0.55),
    steer,
    // zawracanie z rozpędu: hamulec ręczny skraca łuk, ale tylko gdy jest o co się ślizgać
    handbrake: behind && forwardSpeed > 7,
  };
}

/**
 * Wyrównanie auta w powietrzu bez drążków pitch/roll. `up` to oś „góra” auta zapisana w układzie
 * lokalnym (x = prawo, y = góra, z = tył), czyli świat-góra obrócony odwrotnością orientacji auta.
 * Znaki wynikają z `Car.airStep`: prędkość kątowa wokół lokalnego x to `-pitch·5`, wokół z to `-roll·5`.
 */
export function autoLevel(worldUpInCar: Vec3): { pitch: number; roll: number } {
  const [x, y, z] = worldUpInCar;
  const clamp = (value: number) => Math.max(-1, Math.min(1, value)) + 0; // `+ 0` zamienia −0 na 0
  if (y < -0.5 && Math.abs(x) < 0.25) return { pitch: 0, roll: x >= 0 ? 1 : -1 }; // na plecach: wybierz stronę, nie stój w równowadze chwiejnej
  return { pitch: clamp(-z * 1.6), roll: clamp(x * 1.6) };
}

/* ------------------------------------------------------- migawka, HUD, wynik */

export interface LeagueCarStat {
  index: number;
  slot: number;
  name: string;
  color: string;
  team: 0 | 1;
  human: boolean;
  goals: number;
  assists: number;
  saves: number;
  shots: number;
  demos: number;
  score: number;
  boost: number;
  demolished: boolean;
}

export type LeaguePhase = 'countdown' | 'playing' | 'goal' | 'replay' | 'ended';

export interface LeagueSnapshot {
  phase: LeaguePhase;
  paused: boolean;
  scores: [number, number];
  /** Sekundy do końca (w dogrywce: do końca dogrywki). */
  time: number;
  overtime: boolean;
  /** 3…1 w odliczaniu przed wznowieniem, inaczej 0. */
  countdown: number;
  goalBanner: { team: number; name: string; speed: number } | null;
  /** −1 trwa, 0/1 wygrała drużyna, 2 remis. */
  winner: number;
  goalLimit: number;
  /** Krótki komunikat silnika („OBRONA!”, „ZDEMOLOWANO!”) albo null. */
  toast: string | null;
  cars: LeagueCarStat[];
}

export const TEAM_NAMES: Record<Language, readonly [string, string]> = {
  pl: ['NIEBIESCY', 'POMARAŃCZOWI'],
  en: ['BLUE', 'ORANGE'],
};

export function snapshotToHud(snap: LeagueSnapshot, language: Language): RoundHud {
  const en = language === 'en';
  const [blue, orange] = TEAM_NAMES[language];
  const players: RoundPlayer[] = snap.cars.filter(car => car.human).map(car => ({
    slot: car.slot, name: car.name, color: car.color, score: car.goals,
    detail: car.demolished
      ? (en ? 'DEMOLISHED' : 'ZDEMOLOWANY')
      : `${car.team === 0 ? blue : orange} · ${en ? 'assists' : 'asysty'} ${car.assists} · ${en ? 'saves' : 'obrony'} ${car.saves}`,
    value: car.demolished ? 0 : car.boost, maxValue: 100, isBot: false,
  }));
  const score = `${blue} ${snap.scores[0]} : ${snap.scores[1]} ${orange}`;
  const limit = en ? `first to ${snap.goalLimit}` : `do ${snap.goalLimit} goli`;
  const banner = snap.toast && snap.phase === 'playing'
    ? snap.toast
    : snap.goalBanner
    ? (en ? `GOAL! ${snap.goalBanner.name} · ${snap.goalBanner.speed} km/h` : `GOL! ${snap.goalBanner.name} · ${snap.goalBanner.speed} km/h`)
    : snap.phase === 'replay' ? (en ? 'REPLAY' : 'POWTÓRKA')
    : snap.overtime ? (en ? 'OVERTIME — GOLDEN GOAL' : 'DOGRYWKA — ZŁOTY GOL')
    : snap.phase === 'ended' ? (en ? 'FULL TIME' : 'KONIEC MECZU')
    : (en ? 'Boost pads refill your boost' : 'Żółte pola uzupełniają boost');
  return {
    timeLeft: Math.max(0, snap.time),
    countdown: snap.phase === 'countdown' ? snap.countdown : 0,
    paused: snap.paused,
    objective: `${score} · ${limit}`,
    status: banner,
    players,
    powerUp: null,
  };
}

/**
 * Wynik meczu. Kontrakt platformy zna `winnerSlot` (jeden gracz) i `allWon` (cała ekipa), więc:
 *  • wszyscy ludzie w zwycięskiej drużynie → `allWon: true`,
 *  • ludzie po obu stronach → `winnerSlot` = najlepszy człowiek zwycięskiej drużyny, a wynik drużynowy
 *    trafia do `detail` każdego gracza (przegrani nigdy nie dostają `allWon`),
 *  • zwyciężyły boty albo remis → brak zwycięzcy.
 */
export function resultFromSnapshot(snap: LeagueSnapshot, language: Language): RoundResult {
  const en = language === 'en';
  const names = TEAM_NAMES[language];
  const humans = snap.cars.filter(car => car.human);
  const final = `${snap.scores[0]} : ${snap.scores[1]}`;
  const players: RoundPlayer[] = humans.map(car => ({
    slot: car.slot, name: car.name, color: car.color, score: car.goals,
    detail: en
      ? `${names[car.team]} · ${final} · goals ${car.goals} · assists ${car.assists} · saves ${car.saves}`
      : `${names[car.team]} · ${final} · gole ${car.goals} · asysty ${car.assists} · obrony ${car.saves}`,
    isBot: false,
  }));
  if (snap.winner === 2 || snap.winner < 0) {
    return {
      title: en ? 'DRAW' : 'REMIS',
      subtitle: en ? `${final} — nobody scored the golden goal` : `${final} — nikt nie strzelił złotego gola`,
      winnerSlot: null, allWon: false, players,
    };
  }
  const winner = snap.winner as 0 | 1;
  const mine = humans.filter(car => car.team === winner);
  const best = [...mine].sort((a, b) => b.score - a.score || b.goals - a.goals)[0];
  return {
    title: en ? `${names[winner]} TEAM WINS` : `${names[winner]} WYGRYWAJĄ`,
    subtitle: en ? `${final} · first to ${snap.goalLimit} or the most goals at full time` : `${final} · do ${snap.goalLimit} goli albo więcej goli po czasie`,
    winnerSlot: mine.length === humans.length ? null : best?.slot ?? null,
    allWon: humans.length > 0 && mine.length === humans.length,
    players,
  };
}

/** Parametry meczu z ustawień rundy. */
export const GOAL_LIMITS = [3, 5, 7] as const;
export const goalLimitFor = (primary: number): number => GOAL_LIMITS[primary] ?? GOAL_LIMITS[1];
export const MATCH_SECONDS = 180;
export const OVERTIME_MAX_SECONDS = 120;
