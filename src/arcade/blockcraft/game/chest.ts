import { B } from './blocks';
import { I } from './items';
import type { Stack } from './inventory';

export interface ChestState {
  x: number;
  y: number;
  z: number;
  slots: (Stack | null)[];
  /** 1.8: 1 = skrzynia stoi w Netherze (osobny klucz, obcy wymiar jej nie przejmie). */
  dim?: number;
}

export const CHEST_SLOTS = 27;

export function chestKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function emptyChest(x: number, y: number, z: number): ChestState {
  return { x, y, z, slots: new Array(CHEST_SLOTS).fill(null) };
}

function hash(seed: number, x: number, y: number, z: number): () => number {
  let h = (seed * 374761393 + x * 668265263 + y * 144665 + z * 1274126177) | 0;
  return () => {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h = h ^ (h >>> 16);
    return (h >>> 0) / 4294967296;
  };
}

/** Deterministic cave-chest contents. Same seed and position always roll the same loot. */
export function chestLoot(seed: number, x: number, y: number, z: number): Stack[] {
  const r = hash(seed, x, y, z);
  const out: Stack[] = [{ id: B.TORCH, count: 2 + Math.floor(r() * 5) }];
  if (r() < 0.75) out.push({ id: I.BREAD, count: 1 + Math.floor(r() * 3) });
  if (r() < 0.55) out.push({ id: I.COAL, count: 2 + Math.floor(r() * 5) });
  if (r() < 0.4) out.push({ id: B.PLANKS, count: 4 + Math.floor(r() * 8) });
  if (r() < 0.28) out.push({ id: I.IRON, count: 1 + Math.floor(r() * 2) });
  if (r() < 0.22) out.push({ id: I.SEEDS, count: 1 + Math.floor(r() * 2) });
  if (r() < 0.05) out.push({ id: I.DIAMOND, count: 1 });
  if (r() < 0.18) out.push({ id: I.PAPER, count: 2 + Math.floor(r() * 4) });
  if (r() < 0.10) out.push({ id: I.BOOK, count: 1 });
  if (r() < 0.06) out.push({ id: I.LAPIS, count: 2 + Math.floor(r() * 4) });
  if (r() < 0.08) out.push({ id: I.NETHER_WART, count: 1 + Math.floor(r() * 3) });
  return out;
}

export function lootChest(seed: number, x: number, y: number, z: number): ChestState {
  const chest = emptyChest(x, y, z);
  chestLoot(seed, x, y, z).forEach((s, i) => {
    chest.slots[i] = { ...s };
  });
  return chest;
}
