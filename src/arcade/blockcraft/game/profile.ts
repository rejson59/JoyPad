/**
 * BlockCraft 2.19 – „niewidzialna sesja” gracza na serwerze publicznym.
 *
 * GitHub Pages nie ma logowania, więc tożsamość gracza trzyma **losowy
 * identyfikator w przeglądarce** (`localStorage`). Jest on wysyłany do serwera
 * razem z postępem, a nie z nickiem: zmiana nicku ani skórki nie zmienia
 * konta, więc po powrocie gracz wraca tam, gdzie skończył, z tym samym
 * ekwipunkiem.
 *
 * Identyfikator jest losowy i nie da się z niego odczytać nic o graczu.
 * Nie jest to hasło – służy tylko do rozpoznania „to ten sam gracz”, który
 * wrócił na serwer (serwer publiczny i tak nie ma prywatnych danych).
 */

import type { Stack } from './inventory';

export const PROFILE_KEY = 'blockcraft-profile-v1';
/** Serwer publiczny: jedna tabela na świat i identyfikator gracza. */
export const PROFILE_TABLE = 'blockcraft_players';

export interface PlayerProfile {
  /** Losowy identyfikator sesji – ten sam po zmianie nicku i skórki. */
  pid: string;
  name: string;
  skin: string;
  updated: number;
  x: number;
  y: number;
  z: number;
  dim: 'o' | 'n';
  yaw: number;
  pitch: number;
  health: number;
  hunger: number;
  xp: number;
  /** Ekwipunek: 36 slotów (9 × hotbar + 27 plecaka). */
  inv: (Stack | null)[];
  armor: (Stack | null)[];
}

const PID_ALPHABET = '0123456789abcdef';
export const PID_LENGTH = 20;

function randomChars(n: number): string {
  let out = 'p';
  for (let i = 1; i < n; i++) out += PID_ALPHABET[Math.floor(Math.random() * PID_ALPHABET.length)];
  return out;
}

/** Czy tekst wygląda na identyfikator gracza (nic więcej nie da się z niego wyczytać). */
export function isPlayerId(value: unknown): value is string {
  return typeof value === 'string' && /^p[0-9a-f]{19}$/.test(value);
}

/**
 * Identyfikator tej przeglądarki. Powstaje raz i zostaje w `localStorage`,
 * więc przeżywa odświeżenie strony i zmianę nicku/skórki.
 */
export function loadPlayerId(storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()): string {
  if (!storage) return randomChars(PID_LENGTH);
  try {
    const saved = storage.getItem(PROFILE_KEY);
    if (isPlayerId(saved)) return saved;
    const fresh = randomChars(PID_LENGTH);
    storage.setItem(PROFILE_KEY, fresh);
    return fresh;
  } catch {
    return randomChars(PID_LENGTH);
  }
}

function safeStorage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Numer z zakresu – do rozproszenia spawnu po świecie. */
export function pidNumber(pid: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (const ch of pid) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return h >>> 0;
}

/**
 * Kąt i odległość startu dla nowego gracza. Każdy zaczyna w innym miejscu
 * (od 320 do 2600 bloków od środka mapy), więc ludzie nie rodzą się jeden na
 * drugim, a świat jest od razu „zamieszkany” na całej szerokości.
 */
export function spreadSpawn(pid: string): { angle: number; radius: number } {
  const a = pidNumber(pid, 1) / 4294967296;
  const b = pidNumber(pid, 2) / 4294967296;
  return { angle: a * Math.PI * 2, radius: 320 + b * 2280 };
}

/** Porządkuje ekwipunek z bazy: tylko znane stosy, maks. 36 slotów. */
export function cleanStacks(list: unknown, limit: number): (Stack | null)[] {
  const out: (Stack | null)[] = new Array(limit).fill(null);
  if (!Array.isArray(list)) return out;
  for (let i = 0; i < Math.min(limit, list.length); i++) {
    const s = list[i] as Partial<Stack> | null;
    if (!s || typeof s !== 'object') continue;
    const id = Number(s.id);
    const count = Number(s.count);
    if (!Number.isFinite(id) || !Number.isFinite(count) || id <= 0 || count <= 0) continue;
    out[i] = {
      id: Math.trunc(id),
      count: Math.min(999, Math.trunc(count)),
      ...(Number.isFinite(Number(s.dur)) ? { dur: Number(s.dur) } : {}),
      ...(s.ench && typeof s.ench === 'object' ? { ench: { ...s.ench } } : {}),
      ...(typeof s.name === 'string' ? { name: s.name.slice(0, 40) } : {}),
    } as Stack;
  }
  return out;
}

/**
 * Profil z wiersza bazy albo `null`, gdy dane są niepełne. Współrzędne
 * sprawdzamy, żeby ktoś z zepsutym zapisem nie wylądował pod ziemią.
 */
export function sanitizeProfile(raw: unknown): PlayerProfile | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const pid = r.pid ?? r.id;
  if (!isPlayerId(pid)) return null;
  const num = (v: unknown, fallback: number) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const x = num(r.x, NaN);
  const y = num(r.y, NaN);
  const z = num(r.z, NaN);
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) return null;
  let inv: unknown = r.inv;
  if (typeof inv === 'string') {
    try {
      inv = JSON.parse(inv);
    } catch {
      inv = [];
    }
  }
  let armor: unknown = r.armor;
  if (typeof armor === 'string') {
    try {
      armor = JSON.parse(armor);
    } catch {
      armor = [];
    }
  }
  return {
    pid,
    name: typeof r.name === 'string' ? r.name.slice(0, 20) : 'Gracz',
    skin: typeof r.skin === 'string' ? r.skin.slice(0, 24) : '',
    updated: num(r.updated, Date.now()),
    x,
    y,
    z,
    dim: r.dim === 'n' ? 'n' : 'o',
    yaw: num(r.yaw, 0),
    pitch: num(r.pitch, 0),
    health: Math.max(1, Math.min(20, num(r.health, 20))),
    hunger: Math.max(0, Math.min(20, num(r.hunger, 20))),
    xp: Math.max(0, Math.trunc(num(r.xp, 0))),
    inv: cleanStacks(inv, 36),
    armor: cleanStacks(armor, 4),
  };
}

/** Wiersz do zapisu w Supabase (płaskie kolumny, JSON w tekście). */
export function profileRow(p: PlayerProfile, world: string) {
  return {
    world,
    pid: p.pid,
    name: p.name,
    skin: p.skin,
    x: Math.round(p.x),
    y: Math.round(p.y),
    z: Math.round(p.z),
    dim: p.dim,
    yaw: p.yaw,
    pitch: p.pitch,
    health: p.health,
    hunger: p.hunger,
    xp: p.xp,
    inv: JSON.stringify(p.inv),
    armor: JSON.stringify(p.armor),
    updated_at: new Date(p.updated || Date.now()).toISOString(),
  };
}
