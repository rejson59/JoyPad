/**
 * Typy i dane WEBZA — „Nocna Dostawa” (z multiplayer-superhero-pizza-delivery.zip).
 *
 * W stosunku do paczki usunięto wszystko, co należało do jej własnego interfejsu:
 * przypisanie klawiszy do kurierów, ścieżki portretów i podpisy sterowania. W JoyPadzie
 * wejście, lobby i HUD należą do platformy (patrz `bridge.ts`), a kurier dostaje kolor
 * i podpis gracza z jego slotu.
 */

export type Phase = "loading" | "menu" | "countdown" | "play" | "paused" | "results";
export type Mode = "coop" | "versus";
export type OrderKind = "window" | "door" | "roof";

export interface CourierDef {
  slot: number;
  name: string;
  full: string;
  role: string;
  blurb: string;
  color: string;
  deep: string;
  accent: string;
  visor: string;
  skin: string;
  scarf: string;
}

/** Domyślne wyglądy kurierów; kolory i podpisy nadpisuje slot gracza (`GameOptions.styles`). */
export const ROSTER: CourierDef[] = [
  {
    slot: 0,
    name: "PEPE",
    full: "Peperoncino",
    role: "Ognisty nadgarstek",
    blurb: "Rzuca, zanim klient skończy myśleć o kolacji.",
    color: "#ff3d4a",
    deep: "#6e1420",
    accent: "#ffd0b0",
    visor: "#ffb15a",
    skin: "#c68642",
    scarf: "#ffe1c8",
  },
  {
    slot: 1,
    name: "AZZU",
    full: "Azzurro",
    role: "Trajektoria z pamięci",
    blurb: "Widzi łuk pizzy trzy dachy wcześniej.",
    color: "#3ec6ff",
    deep: "#0e3c55",
    accent: "#d8f6ff",
    visor: "#9af6ff",
    skin: "#8d5524",
    scarf: "#e7fbff",
  },
  {
    slot: 2,
    name: "BASIL",
    full: "Basilico",
    role: "Ciche lądowania",
    blurb: "Na dachu jest wcześniej niż zapach oregano.",
    color: "#7dff6a",
    deep: "#145018",
    accent: "#e7ffd8",
    visor: "#d6ff6a",
    skin: "#e0ac7a",
    scarf: "#f3ffe8",
  },
  {
    slot: 3,
    name: "FORMI",
    full: "Formaggio",
    role: "Złota seria",
    blurb: "Punkty lubią się do niej przyklejać.",
    color: "#ffc14a",
    deep: "#5a3d08",
    accent: "#fff1c4",
    visor: "#ffe08a",
    skin: "#6b3a22",
    scarf: "#fff6d8",
  },
];

export interface PlayerHud {
  slot: number;
  name: string;
  full: string;
  role: string;
  color: string;
  joined: boolean;
  score: number;
  combo: number;
  bestCombo: number;
  pizzas: number;
  maxPizzas: number;
  deliveries: number;
  perfects: number;
  misses: number;
  heat: number;
  overdrive: number;
  swinging: boolean;
  speed: number;
  lead: boolean;
}

export interface Snapshot {
  phase: Phase;
  mode: Mode;
  duration: number;
  timeLeft: number;
  countdown: number;
  announcer: string;
  announcerSub: string;
  announcerId: number;
  players: PlayerHud[];
  teamScore: number;
  orders: number;
  hint: string;
  stars: number;
  grade: string;
  mvp: number;
  load: number;
}

/** Komentarz po zmianie (klucz = ocena). Wersje EN siedzą w `strings.ts`. */
export const GRADE_LINES: Record<string, string> = {
  D: "Ciasto ostygło. Miasto udaje, że was nie widziało.",
  C: "Dowiezione. Ledwo, ale dowiezione.",
  B: "Solidna noc. Klienci przestaną dzwonić. Na chwilę.",
  A: "Dzielnica już plotkuje. W dobrym sensie.",
  S: "Legendy nocnej zmiany. Piec bije brawo.",
  "S+": "Fizyka się poddała. Klienci płaczą ze szczęścia.",
};

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}
export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
export function damp(a: number, b: number, lambda: number, dt: number) {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}
