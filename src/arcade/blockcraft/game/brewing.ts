/**
 * Brewing (2.4 „Godzina alchemika”) – the stand existed since 1.9 as a
 * decorative cross, these pure rules make it brew. Like anvil.ts and
 * fishing.ts the module is free of THREE and of the world, so the engine,
 * the screen and the headless tests all share one implementation.
 */
import type { Stack } from './inventory';
import { I, ITEMS, type PotionEffectId } from './items';

export type { PotionEffectId };

export interface PotionDef {
  id: number;
  /** Polish name. */
  name: string;
  /** Effect applied when drunk (instant `heal` or timed buff). */
  effect: PotionEffectId;
  /** Seconds the buff lasts (0 for instant/none). */
  duration: number;
  /** Swatch colour of the liquid in the icon painter and tooltips. */
  color: string;
  /** One-line description shown in the brewing screen. */
  desc: string;
}

export const POTIONS: Record<number, PotionDef> = {
  [I.POTION_AWKWARD]: { id: I.POTION_AWKWARD, name: 'Zaczarowany napój', effect: 'none', duration: 0, color: '#c8b8a8', desc: 'Bazowa, mętna esencja. W połączeniu z dodatkami daje prawdziwe napoje.' },
  [I.POTION_HEAL]: { id: I.POTION_HEAL, name: 'Napój leczący', effect: 'heal', duration: 0, color: '#d44a5a', desc: 'Przywraca od razu 7 punktów zdrowia.' },
  [I.POTION_FIRE]: { id: I.POTION_FIRE, name: 'Napój ognioodporności', effect: 'fire', duration: 45, color: '#e07820', desc: 'Lawa, ogniska i bloki magmy nie ranią przez 45 s.' },
  [I.POTION_SPEED]: { id: I.POTION_SPEED, name: 'Napój szybkości', effect: 'speed', duration: 20, color: '#b8e04a', desc: 'O 30% szybszy bieg przez 20 s.' },
  [I.POTION_NIGHT]: { id: I.POTION_NIGHT, name: 'Napój nocnego widzenia', effect: 'night', duration: 30, color: '#4ad0a8', desc: 'Jaskinie i nocy nie straszne przez 30 s.' },
  [I.POTION_STRENGTH]: { id: I.POTION_STRENGTH, name: 'Napój siły', effect: 'strength', duration: 15, color: '#e0a030', desc: '+4 obrażeń w zwarciu przez 15 s.' },
  [I.POTION_REGEN]: { id: I.POTION_REGEN, name: 'Napój regeneracji', effect: 'regen', duration: 10, color: '#e06090', desc: 'Odnowienie: +1 serce co 2 s przez 10 s.' },
};

/** Instant heal value of the healing potion. */
export const HEAL_AMOUNT = 7;
/** Extra melee damage while the strength potion is active. */
export const STRENGTH_DAMAGE = 4;
/** Move-speed multiplier while the speed potion is active. */
export const SPEED_FACTOR = 1.3;

/** A batch takes this many seconds on the stand. */
export const BREW_TIME = 8;
/** One blaze rod keeps the fire going this many batches. */
export const BREW_FUELS = 3;

/** Item ids the stand accepts in its ingredient cup. */
export const BREWING_INGREDIENTS = new Set<number>([
  I.NETHER_WART, I.GHAST_TEAR, I.MAGMA_CREAM, I.SUGAR, I.GLOWSTONE_DUST, I.BLAZE_ROD,
]);

/**
 * What an ingredient does to a bottle, given the bottle's current potion id.
 * Water (WATER_BOTTLE) + wart is the base recipe; awkward (POTION_AWKWARD)
 * is the mid-point for the advanced mixes.
 */
export function brewResult(bottleId: number, ingredientId: number): number | null {
  const isWater = bottleId === I.WATER_BOTTLE;
  const isAwkward = bottleId === I.POTION_AWKWARD;
  if (!isWater && !isAwkward) return null;
  switch (ingredientId) {
    case I.NETHER_WART:
      return isWater ? I.POTION_AWKWARD : null;
    case I.GHAST_TEAR:
      return isWater ? I.POTION_HEAL : null;
    case I.MAGMA_CREAM:
      return isWater ? I.POTION_FIRE : null;
    case I.SUGAR:
      return isWater ? I.POTION_SPEED : null;
    case I.GLOWSTONE_DUST:
      // two paths: water + dust = night sight, awkward + dust = regeneration
      return isWater ? I.POTION_NIGHT : I.POTION_REGEN;
    case I.BLAZE_ROD:
      return isWater ? I.POTION_STRENGTH : null;
    default:
      return null;
  }
}

/**
 * One brewing pass over all three bottles. Returns the new bottle stacks and
 * whether anything changed (a batch was completed).
 */
export function applyBrew(bottles: (Stack | null)[], ingredientId: number): { bottles: (Stack | null)[]; brewed: boolean } {
  const out: (Stack | null)[] = bottles.map((b) => (b ? { ...b } : null));
  let brewed = false;
  for (let i = 0; i < 3; i++) {
    const b = out[i];
    if (!b) continue;
    const next = brewResult(b.id, ingredientId);
    if (next !== null && next !== b.id) {
      out[i] = { ...b, id: next };
      brewed = true;
    }
  }
  return { bottles: out, brewed };
}

/** Full state of one stand block. */
export interface BrewingState {
  x: number;
  y: number;
  z: number;
  /** 1 when the block stands in the Nether – keys never clash across dimensions. */
  dim?: number;
  /** Three bottle slots. */
  bottles: (Stack | null)[];
  /** The ingredient that is (or will be) thrown into the cauldron. */
  ingredient: Stack | null;
  /** Blaze rod fuel. */
  fuel: Stack | null;
  /** How many batches the current fuel piece still covers. */
  fuelLeft: number;
  /** Seconds of the current batch (0 = idle, BREW_TIME = done). */
  progress: number;
}

export function brewingKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function emptyBrewing(x: number, y: number, z: number): BrewingState {
  return { x, y, z, bottles: [null, null, null], ingredient: null, fuel: null, fuelLeft: 0, progress: 0 };
}

/** True when the stand can start (or is starting) a batch. */
export function canStartBrew(s: BrewingState): boolean {
  const hasBottle = s.bottles.some((b) => b && brewResult(b.id, s.ingredient?.id ?? -1) !== null);
  const hasFuel = s.fuelLeft > 0 || s.fuel?.id === I.BLAZE_ROD;
  return hasBottle && s.ingredient !== null && hasFuel;
}

/**
 * Advances one stand. When the batch is ready the bottles transform, the
 * ingredient survives (it is not consumed – like in the classic game) and
 * one unit of fuel is spent.
 */
export function tickBrewing(s: BrewingState, dt: number): { done: boolean } {
  if (s.progress <= 0) {
    // a batch needs a bottle it can transform, an ingredient and live fuel
    if (!canStartBrew(s) || !s.ingredient) return { done: false };
    s.progress = 0.0001;
  } else if (!s.ingredient) {
    // the ingredient was pulled out mid-brew – the batch quietly cancels
    s.progress = 0;
    return { done: false };
  }
  s.progress += dt;
  if (s.progress < BREW_TIME) return { done: false };
  s.progress = 0;
  const res = applyBrew(s.bottles, s.ingredient!.id);
  s.bottles = res.bottles;
  if (res.brewed) {
    if (s.fuelLeft > 0) {
      s.fuelLeft--;
    } else if (s.fuel?.id === I.BLAZE_ROD) {
      // one blaze rod feeds three batches: spend the rod, bank the rest
      s.fuelLeft = BREW_FUELS - 1;
      s.fuel.count--;
      if (s.fuel.count <= 0) s.fuel = null;
    }
    return { done: true };
  }
  // no bottle could change – do not burn the fuel
  return { done: false };
}

/** Polish label for a potion id (falls back to the item name). */
export function potionName(id: number): string {
  return POTIONS[id]?.name ?? ITEMS[id]?.name ?? '';
}

/** Effect id carried by a potion, null for non-potions. */
export function potionEffect(id: number): PotionEffectId | null {
  return POTIONS[id]?.effect ?? null;
}
