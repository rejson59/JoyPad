import { ITEMS } from './items';
import type { Stack } from './inventory';

/**
 * Player armor. The item definitions live in items.ts (kind "armor"); this
 * module only derives per-slot stats and the damage formula so the engine
 * stays out of the data tables.
 */

export type ArmorSlot = 0 | 1 | 2 | 3; // head, chest, legs, feet

export const ARMOR_SLOT_COUNT = 4;

export const ARMOR_SLOT_NAMES = ['Kaptur', 'Napierśnik', 'Nogawice', 'Buty'] as const;

export interface ArmorInfo {
  id: number;
  slot: ArmorSlot;
  /** Armor points – 4% damage reduction each, capped. */
  points: number;
  /** Maximum durability. */
  max: number;
}

export const ARMOR: (ArmorInfo | undefined)[] = [];
for (const it of ITEMS) {
  if (it?.kind === 'armor') {
    ARMOR[it.id] = { id: it.id, slot: it.armor!.slot, points: it.armor!.points, max: it.durability ?? 1 };
  }
}

export function armorInfo(id: number): ArmorInfo | undefined {
  return ARMOR[id];
}

export function isArmor(id: number): boolean {
  return !!ARMOR[id];
}

export function armorSlotOf(id: number): ArmorSlot | null {
  return ARMOR[id]?.slot ?? null;
}

/** Sum of armor points of the four equipped pieces. */
export function armorPoints(equipped: (Stack | null)[]): number {
  let sum = 0;
  for (const s of equipped) {
    if (!s) continue;
    sum += ARMOR[s.id]?.points ?? 0;
  }
  return sum;
}

/** 4% per armor point, capped at 80% – matches the feel of the classic game. */
export function damageReduction(points: number): number {
  return Math.min(0.8, Math.max(0, points) * 0.04);
}
