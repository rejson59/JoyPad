/**
 * Fishing (2.3) – drop tables and timing, kept free of THREE and of the world
 * so the whole system can be asserted in the headless engine suite.
 *
 * The engine owns the bobber entity; this module only decides *what* the hook
 * brings back and *when* the fish bites.
 */
import type { Stack } from './inventory';
import { I } from './items';

export interface LootEntry {
  id: number;
  /** Relative weight inside its own table. */
  weight: number;
  /** Inclusive count range rolled for the stack size. */
  count?: [number, number];
}

/** Real catch – 70% of hauls. Both fish are cookable in a furnace. */
export const FISH_TABLE: LootEntry[] = [
  { id: I.RAW_FISH, weight: 62 },
  { id: I.RAW_SALMON, weight: 26 },
];

/** Shore debris – 30% of hauls, so an empty hook is never a dead end. */
export const JUNK_TABLE: LootEntry[] = [
  { id: I.STRING, weight: 30 },
  { id: I.LEATHER, weight: 18 },
  { id: I.BONE, weight: 16 },
  { id: I.STICK, weight: 16 },
  { id: I.FLINT, weight: 12 },
  { id: I.SEEDS, weight: 8 },
];

/** Chance that a waiting hook comes back with a fish rather than with junk. */
export const FISH_CHANCE = 0.7;

/** Seconds between the cast and the bite while the bobber sits in water. */
export const BITE_MIN = 4;
export const BITE_MAX = 11;
/** How long the player has to hit RMB after the bite before the fish escapes. */
export const BITE_WINDOW = 1.7;
/** A hook left alone in the water for this long washes the bait away. */
export const PATIENCE = 45;

function pick(table: LootEntry[], roll: number): LootEntry {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let acc = roll * total;
  for (const entry of table) {
    acc -= entry.weight;
    if (acc <= 0) return entry;
  }
  return table[table.length - 1];
}

function stackFor(entry: LootEntry, roll: number): Stack {
  const [lo, hi] = entry.count ?? [1, 1];
  const span = hi - lo + 1;
  return { id: entry.id, count: lo + Math.floor(roll * span) };
}

/**
 * Rolls the result of a successful hook. `roll` values must be in [0, 1) and
 * are consumed in a fixed order: fish-or-junk, then which entry, then the size.
 */
export function rollCatch(rand: () => number = Math.random): Stack {
  const fish = rand() < FISH_CHANCE;
  const entry = pick(fish ? FISH_TABLE : JUNK_TABLE, rand());
  return stackFor(entry, rand());
}

/** True when this haul was an actual fish (used for achievements and XP). */
export function isFishStack(stack: Stack): boolean {
  return stack.id === I.RAW_FISH || stack.id === I.RAW_SALMON;
}

/** Seconds of waiting before the fish bites. */
export function biteDelay(rand: () => number = Math.random): number {
  return BITE_MIN + rand() * (BITE_MAX - BITE_MIN);
}

/** Cooked counterpart of a raw fish, or null for anything else. */
export function cookedOf(id: number): number | null {
  if (id === I.RAW_FISH) return I.COOKED_FISH;
  if (id === I.RAW_SALMON) return I.COOKED_SALMON;
  return null;
}
