/**
 * Silnik osi czasu filmu: czysta matematyka, zero Reacta, zero DOM.
 *
 * Dzięki temu, że `resolveFrame` jest funkcją czystą (te same wejścia → ta sama
 * klatka), ten sam film da się:
 *   • odtworzyć w aplikacji (rAF w `Film.tsx`),
 *   • przewijać i pauzować bez dryfu,
 *   • wyrenderować klatka po klatce offline (`scripts/cinema/render.mjs`),
 *   • przetestować bez przeglądarki (`scripts/cinema-selftest.ts`).
 *
 * Czas liczony jest wyłącznie z `ms` podanych w skrypcie — nie ma żadnych
 * `Date.now()` ani losowości. Jedyny „losowy" element filmu (iskry, drobiny)
 * bierze liczby z `seededUnit(index, salt)`, więc klatka 1200 zawsze wygląda
 * tak samo, także w eksporcie do pliku.
 */

import type { CamKey, EaseName, Scene, SoundCue, Text, ViewId } from './script';

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;
/** Postęp między dwoma czasami (bez zaokrąglania krzywą). */
export const progressBetween = (now: number, from: number, to: number) => clamp01((now - from) / (to - from || 1));

const E = 1e-6;

/**
 * Krzywe filmu — wszystkie bez drgań, a jedyne przestrzelenie (`outBack`) jest
 * przeznaczone dla KSZTAŁTU (skala, obwódka, rozciągnięcie farby). Pozycje
 * zawsze przechodzą przez `clamp01`, więc nic nie cofa się ani nie odbija.
 *
 * `edge` przypina dokładne końce: `p = 0` to naprawdę stan wyjściowy, a nie
 * 2e-16 — inaczej pierwsza klatka sceny potrafi pokazać element o piksel dalej.
 */
const edge = (fn: (t: number) => number) => (t: number) => {
  const x = clamp01(t);
  return x === 0 ? 0 : x === 1 ? 1 : fn(x);
};

export const EASES: Record<EaseName, (t: number) => number> = {
  linear: edge(t => t),
  inOut: edge(t => -(Math.cos(Math.PI * t) - 1) / 2),
  inQuad: edge(t => t * t),
  outCubic: edge(t => 1 - Math.pow(1 - t, 3)),
  outQuint: edge(t => 1 - Math.pow(1 - t, 5)),
  outExpo: edge(t => 1 - Math.pow(2, -10 * t)),
  outBack: t => {
    // Rozciągnięcie farby przy wejściu (1.18), ale ZERO przestrzelenia pozycji:
    // element rośnie do 1 i zatrzymuje się, nie odbija jak sprężyna. Pozycje
    // czytające ten cue muszą przejść przez `clamp01`.
    const x = clamp01(t);
    if (x === 0 || x === 1) return x;
    const c = 1.18, u = x - 1;
    return 1 + (c + 1) * u * u * u + c * u * u;
  },
  step: t => (t > 0 ? 1 : 0),
};

export const ease = (name: EaseName | undefined, t: number) => (EASES[name ?? 'outCubic'] ?? EASES.outCubic)(t);

/** Deterministyczny „losowy" ułamek 0..1 — te same liczby w każdej klatce i w eksporcie. */
export function seededUnit(index: number, salt = 0): number {
  let h = Math.imul(index * 374761393 + salt * 668265263, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 3266489917);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export interface TimedScene extends Scene {
  index: number;
  startMs: number;
  endMs: number;
}

export interface Timeline {
  scenes: TimedScene[];
  total: number;
}

export function buildTimeline(scenes: Scene[]): Timeline {
  let at = 0;
  const timed = scenes.map((scene, index) => {
    const item: TimedScene = { ...scene, index, startMs: at, endMs: at + Math.max(16, scene.ms) };
    at += Math.max(16, scene.ms);
    return item;
  });
  return { scenes: timed, total: at };
}

export interface CueState {
  /** Postęp wejścia 0..1 po krzywej `ease`. */
  p: number;
  /** Widoczność 0..1 (1 = na ekranie, spada dopiero na `fade`). */
  v: number;
  /** Czy wejście już się zaczęło (klasa CSS przeskakuje w tym momencie). */
  on: boolean;
  /** Czy dana klatka kluczowa `at` to powtórzenie (np. trzeci przeskok fokusa). */
  repeat: number;
}

const EMPTY_CUE: CueState = { p: 0, v: 0, on: false, repeat: 0 };

/**
 * Rozwiązanie wszystkich `cue` sceny w chwili `t`. Gdy ten sam `id` występuje
 * kilka razy (np. `focus` w scenie biblioteki), wygrywa **najpóźniejsze**
 * wejście, które już się zaczęło — to daje naturalne retriggerowanie animacji.
 */
export function cueStates(scene: TimedScene, t: number): Record<string, CueState> {
  const out: Record<string, CueState> = {};
  const repeats: Record<string, number> = {};
  for (const cue of scene.cues) {
    const seen = (repeats[cue.id] = (repeats[cue.id] ?? 0) + 1);
    const state = out[cue.id];
    const fresh = cue.at <= t;
    if (!fresh && state) continue;
    const dur = Math.max(1, cue.dur ?? 700);
    const enter = clamp01((t - cue.at) / dur);
    const hold = cue.hold ?? 0;
    const fade = cue.fade ?? 0;
    let v = enter;
    if (fade > 0 && t > cue.at + dur + hold) v = 1 - clamp01((t - (cue.at + dur + hold)) / fade);
    const next: CueState = { p: ease(cue.ease, enter), v: fade > 0 ? clamp01(v) : (fresh ? 1 : 0), on: fresh, repeat: seen - 1 };
    out[cue.id] = next;
  }
  for (const cue of scene.cues) if (!out[cue.id]) out[cue.id] = { ...EMPTY_CUE };
  return out;
}

export interface Camera { x: number; y: number; scale: number; rot: number }

/** Kamera sceny: interpolacja klatek kluczowych (w jednostkach sceny 1920×1080 px). */
export function cameraAt(scene: TimedScene, t: number): Camera {
  const p = clamp01(t / Math.max(1, scene.ms));
  const keys: CamKey[] = scene.camera.length ? scene.camera : [{ at: 0 }];
  let from = keys[0];
  let to = keys[0];
  for (let i = 0; i < keys.length; i++) {
    if (keys[i].at <= p) from = keys[i];
    if (keys[i].at >= p) { to = keys[i]; break; }
  }
  const span = to.at - from.at;
  const k = span <= E ? 1 : ease(to.ease, (p - from.at) / span);
  return {
    x: lerp(from.x ?? 0, to.x ?? 0, k),
    y: lerp(from.y ?? 0, to.y ?? 0, k),
    scale: lerp(from.scale ?? 1, to.scale ?? 1, k),
    rot: lerp(from.rot ?? 0, to.rot ?? 0, k),
  };
}

/** Długość przenikania na granicy scen (dip do czerni po obu stronach). */
export const DIP_MS = 300;

export interface FilmFrame {
  ms: number;
  index: number;
  scene: TimedScene;
  /** ms wewnątrz sceny. */
  t: number;
  /** Postęp sceny 0..1. */
  p: number;
  /** Postęp całego filmu 0..1. */
  progress: number;
  cues: Record<string, CueState>;
  camera: Camera;
  /** Zaciemnienie 0..1 na granicach scen — jedna zasłona dla całego filmu. */
  veil: number;
  /** Czy to ostatnia klatka filmu. */
  finished: boolean;
  clock: string;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export function resolveFrame(timeline: Timeline, ms: number): FilmFrame {
  const clamped = Math.max(0, Math.min(timeline.total, ms));
  let scene = timeline.scenes[timeline.scenes.length - 1];
  for (const item of timeline.scenes) { if (clamped >= item.startMs) scene = item; else break; }
  const t = clamped - scene.startMs;
  const p = clamp01(t / Math.max(1, scene.ms));
  const inVeil = 1 - clamp01(t / DIP_MS);
  const outVeil = scene.index === timeline.scenes.length - 1 ? 0 : clamp01((t - (scene.ms - DIP_MS)) / DIP_MS);
  return {
    ms: clamped,
    index: scene.index,
    scene,
    t,
    p,
    progress: clamp01(clamped / timeline.total),
    cues: cueStates(scene, t),
    camera: cameraAt(scene, t),
    veil: Math.max(inVeil, outVeil),
    finished: clamped >= timeline.total,
    clock: formatClock(clamped),
  };
}

/** Skrót: `state = read('title')` w scenie. */
export function readCue(frame: FilmFrame, id: string): CueState {
  return frame.cues[id] ?? EMPTY_CUE;
}

/** Ile klatek na sekundę potrzebuje film, żeby wyglądać płynnie na tym sprzęcie. */
export const FILM_FPS = 60;

// ---------------------------------------------------------------------------
// Jakość i tryby awaryjne
// ---------------------------------------------------------------------------

export type QualityTier = 'high' | 'lite' | 'static';

export interface TierEnv {
  /** Preferencja „ogranicz animacje" (system albo ustawienie konsoli). */
  reduced: boolean;
  /** Rdzenie logiczne procesora, jeśli przeglądarka je zdradza. */
  cores?: number;
  /** GB pamięci urządzenia (`navigator.deviceMemory`). */
  memory?: number;
  /** Oszczędzanie danych / wolne łącze — film nie powinien wtedy ciągnąć wideo. */
  saveData?: boolean;
  slowLink?: boolean;
  /** Telefon albo mały ekran: pełna reżyseria tylko marnuje klatki. */
  smallScreen?: boolean;
}

/**
 * Wybór wersji filmu. Kolejność jest celowa: dostępność przed wydajnością,
 * wydajność przed efektami — słabszy sprzęt ma dostać krótszy, spokojniejszy
 * film, a nie pokaz slajdów zamiast treści.
 */
export function qualityTier(env: TierEnv): QualityTier {
  if (env.reduced) return 'static';
  if (env.saveData || env.slowLink) return 'lite';
  if (env.smallScreen) return 'lite';
  // 4 rdzenie to dziś typowy laptop z przeglądarką na wierzchu, a film jest zwykłym
  // DOM-em i CSS-em — nie ma po co odbierać mu przez to ruchu i nagrań w kaflach
  // (oglądający zgłaszał, że w normalnym trybie widzi mniej niż w statycznym).
  // Progiem „słabego sprzętu" zostają 2 rdzenie; jeśli klatki naprawdę nie wyrabiają,
  // tryb schodzi sam, mierzony na żywo (`downgradeTier`).
  if (typeof env.cores === 'number' && env.cores <= 2) return 'lite';
  if (typeof env.memory === 'number' && env.memory <= 4) return 'lite';
  return 'high';
}

/** Kolejny, lżejszy tryb — używane, gdy klatki realnie nie wyrabiają. */
export function downgradeTier(tier: QualityTier): QualityTier {
  return tier === 'high' ? 'lite' : 'static';
}

/** Rozpoznanie środowiska — jedyne miejsce, które dotyka przeglądarki. */
export function readTierEnv(): TierEnv {
  if (typeof navigator === 'undefined') return { reduced: false };
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean; effectiveType?: string } };
  const link = nav.connection;
  const width = typeof window === 'undefined' ? 1280 : Math.min(window.innerWidth, window.innerHeight);
  return {
    reduced: false,
    cores: nav.hardwareConcurrency,
    memory: nav.deviceMemory,
    saveData: link?.saveData === true,
    slowLink: typeof link?.effectiveType === 'string' && ['slow-2g', '2g', '3g'].includes(link.effectiveType),
    smallScreen: width < 620,
  };
}

// ---------------------------------------------------------------------------
// Storyboard (wersja statyczna) i dźwięk
// ---------------------------------------------------------------------------

export interface Shot { index: number; at: number; ms: number; scene: TimedScene }

/** Klatki do wersji statycznej: reprezentatywny moment każdej sceny i czas postoju. */
export function storyboard(timeline: Timeline, sceneFilter?: (scene: TimedScene) => boolean): Shot[] {
  const shots: Shot[] = [];
  for (const scene of timeline.scenes) {
    if (scene.still === 'skip') continue;
    if (sceneFilter && !sceneFilter(scene)) continue;
    const hold = Math.max(3200, Math.min(5200, Math.round(scene.ms * .58)));
    shots.push({ index: scene.index, at: scene.startMs + Math.round(scene.poster * scene.ms), ms: hold, scene });
  }
  return shots;
}

export interface ScoreEvent { atMs: number; kind: SoundCue['kind']; gain: number; note: number }

/** Cała ścieżka dźwiękowa filmu jako lista zdarzeń (bez Web Audio). */
export function scoreEvents(scenes: Scene[]): ScoreEvent[] {
  const events: ScoreEvent[] = [{ atMs: 0, kind: 'hum', gain: .16, note: 0 }];
  let at = 0;
  for (const scene of scenes) {
    for (const cue of scene.sound ?? []) {
      if (cue.at < 0) continue;
      events.push({ atMs: at + cue.at, kind: cue.kind, gain: cue.gain ?? .5, note: cue.note ?? 0 });
    }
    at += Math.max(16, scene.ms);
  }
  return events.sort((a, b) => a.atMs - b.atMs);
}

// ---------------------------------------------------------------------------
// Kontrola jakości skryptu (uruchamiana też przez selftest)
// ---------------------------------------------------------------------------

/**
 * Sprawdza skrypt pod kątem błędów, które łatwo popełnić przy dopisywaniu sceny.
 * Zwraca listę problemów (pusta = wszystko gra). Film działa także z problemami,
 * ale w trybie deweloperskim wypisuje je w konsoli — cisza jest gorsza.
 */
export function validateScript(scenes: Scene[]): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  let total = 0;
  const text = (what: string, value: Text | undefined, sceneId: string) => {
    if (!value) return;
    if (!value.pl.trim() || !value.en.trim()) problems.push(`${sceneId}: ${what} nie ma obu języków`);
    if (/[а-яА-Я一-龥ぁ-ゟ]/.test(value.pl + value.en)) problems.push(`${sceneId}: ${what} ma znak spoza alfabetu łacińskiego`);
  };
  for (const scene of scenes) {
    if (ids.has(scene.id)) problems.push(`powtórzone id sceny: ${scene.id}`);
    ids.add(scene.id);
    total += scene.ms;
    if (scene.ms < 1200) problems.push(`${scene.id}: scena krótsza niż 1,2 s`);
    if (scene.poster < 0 || scene.poster > 1) problems.push(`${scene.id}: poster poza zakresem 0..1`);
    if ((scene.chips?.length ?? 0) > 3) problems.push(`${scene.id}: więcej niż trzy hasła`);
    text('chapter', scene.chapter, scene.id);
    text('label', scene.label, scene.id);
    text('title', scene.title, scene.id);
    text('sub', scene.sub, scene.id);
    scene.chips?.forEach((chip, i) => text(`chips[${i}]`, chip, scene.id));
    if (scene.extra) for (const [key, value] of Object.entries(scene.extra)) text(`extra.${key}`, value, scene.id);

    const lastAt: Record<string, number> = {};
    for (const cue of scene.cues) {
      const dur = cue.dur ?? 700;
      if (cue.id in lastAt && cue.at <= lastAt[cue.id]) problems.push(`${scene.id}: cue „${cue.id}" powtarza się bez rosnącego czasu`);
      lastAt[cue.id] = cue.at;
      if (cue.at < -1200) problems.push(`${scene.id}: cue „${cue.id}" wchodzi zbyt wcześnie (${cue.at} ms)`);
      if (cue.at + dur > scene.ms + 400) problems.push(`${scene.id}: cue „${cue.id}" wychodzi poza scenę`);
    }
    let previous = -1;
    for (const key of scene.camera) {
      if (key.at < previous) problems.push(`${scene.id}: klatki kamery muszą rosnąć`);
      if (key.at < 0 || key.at > 1) problems.push(`${scene.id}: klatka kamery poza 0..1`);
      previous = key.at;
    }
    if (scene.camera.length && scene.camera[0].at !== 0) problems.push(`${scene.id}: kamera bez klatki startowej (at: 0)`);
    for (const sound of scene.sound ?? []) {
      if (sound.at < 0 || sound.at > scene.ms) problems.push(`${scene.id}: dźwięk ${sound.kind} poza sceną`);
      if ((sound.gain ?? .5) <= 0 || (sound.gain ?? .5) > 1) problems.push(`${scene.id}: głośność dźwięku poza 0..1`);
    }
  }
  if (total < 15000) problems.push(`film krótszy niż 15 s (${Math.round(total / 1000)} s)`);
  if (total > 120000) problems.push(`film dłuższy niż 2 minuty (${Math.round(total / 1000)} s)`);
  return problems;
}

/** Do listy rozdziałów w pasku odtwarzacza. */
export const chaptersOf = (timeline: Timeline) => timeline.scenes.map(scene => ({
  index: scene.index, at: scene.startMs, ms: scene.ms, title: scene.chapter, view: scene.view as ViewId,
}));
