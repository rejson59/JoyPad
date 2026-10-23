/**
 * Anvil (2.3) – the block existed since 1.7 but did nothing. These pure rules
 * decide what the anvil offers and what it charges, so the screen, the engine
 * and the tests all agree on one implementation.
 */
import type { Stack } from './inventory';
import { ITEMS, durabilityMax } from './items';
import { MAX_ENCHS } from './enchant';

export const ANVIL_SLOTS = 3;
export const MAX_ITEM_NAME = 28;

/** Experience levels charged for the two operations. */
export const MERGE_COST = 1;
export const RENAME_COST = 1;

export const ANVIL_NAME_MAX = MAX_ITEM_NAME;

/** Strips control characters, collapses spaces and clamps the length. */
export function cleanItemName(raw: string): string {
  return (raw ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_ITEM_NAME);
}

/** Only tools and armor carry durability, so only they can be repaired. */
export function isRepairable(stack: Stack | null | undefined): boolean {
  return !!stack && durabilityMax(stack.id) > 0;
}

/** Two stacks of the same, repairable item. */
export function canMerge(a: Stack | null, b: Stack | null): a is Stack {
  if (!a || !b) return false;
  if (a.id !== b.id) return false;
  if (!isRepairable(a)) return false;
  return a.count === 1 && b.count === 1;
}

/** Merges enchantment maps, keeping the better level of each (max 3 slots). */
export function mergeEnchants(a?: Record<string, number>, b?: Record<string, number>): Record<string, number> | undefined {
  const out: Record<string, number> = { ...(a ?? {}) };
  for (const [id, lvl] of Object.entries(b ?? {})) {
    if (out[id] === undefined) out[id] = lvl;
    else out[id] = Math.max(out[id], lvl);
  }
  const keys = Object.keys(out);
  if (!keys.length) return undefined;
  if (keys.length <= MAX_ENCHS) return out;
  // Keep the strongest MAX_ENCHS enchantments.
  keys.sort((x, y) => out[y] - out[x]);
  const kept: Record<string, number> = {};
  for (const k of keys.slice(0, MAX_ENCHS)) kept[k] = out[k];
  return kept;
}

export type AnvilAction = 'none' | 'merge' | 'rename';

export interface AnvilResult {
  /** The stack the anvil would hand over, or null. */
  out: Stack | null;
  action: AnvilAction;
  /** Experience levels the operation costs. */
  cost: number;
  /** Short Polish label shown on the screen. */
  label: string;
}

/**
 * Combines two identical tools: durability is added up (never above the
 * maximum) and enchantments keep their best level.
 */
export function mergeStacks(a: Stack, b: Stack): Stack | null {
  if (!canMerge(a, b)) return null;
  const max = durabilityMax(a.id);
  const dur = Math.min(max, (a.dur ?? max) + (b.dur ?? max));
  if (dur >= max) return null; // two pristine items have nothing to combine
  const ench = mergeEnchants(a.ench, b.ench);
  return { id: a.id, count: 1, dur, ...(ench ? { ench } : {}), ...(a.name ? { name: a.name } : {}) };
}

/** Full state of one anvil block. */
export interface AnvilState {
  x: number;
  y: number;
  z: number;
  /** 1 when the block stands in the Nether – keys never clash across dimensions. */
  dim?: number;
  a: Stack | null;
  b: Stack | null;
  /** Name typed in the rename field. */
  name: string;
  burn: number;
  burnMax: number;
}

export function anvilKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function emptyAnvil(x: number, y: number, z: number): AnvilState {
  return { x, y, z, a: null, b: null, name: '', burn: 0, burnMax: 0 };
}

/**
 * What the anvil offers for the current contents: merging two identical
 * damaged items, or renaming the first one. `name` is the text from the screen.
 */
export function anvilResult(a: Stack | null, b: Stack | null, name: string): AnvilResult {
  if (a && b) {
    const merged = mergeStacks(a, b);
    if (merged) return { out: merged, action: 'merge', cost: MERGE_COST, label: 'Scal dwa przedmioty' };
    return { out: null, action: 'none', cost: 0, label: 'Te przedmioty nie da się połączyć' };
  }
  if (a) {
    const clean = cleanItemName(name);
    if (clean && clean !== a.name) {
      return { out: { ...a, name: clean }, action: 'rename', cost: RENAME_COST, label: 'Zmień nazwę' };
    }
  }
  return { out: null, action: 'none', cost: 0, label: '' };
}

/** Names worth showing on the result slot. */
export function itemLabel(stack: Stack | null | undefined): string {
  if (!stack) return '';
  return stack.name || ITEMS[stack.id]?.name || '';
}
