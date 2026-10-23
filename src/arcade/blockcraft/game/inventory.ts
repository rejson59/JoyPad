import { B } from './blocks';
import { I, stackLimit } from './items';

export interface Stack {
  id: number;
  count: number;
  /** Remaining uses. Absent means the tool is undamaged. */
  dur?: number;
  /** Enchantment id → level (update 1.5). Absent = plain item. */
  ench?: Record<string, number>;
  /** Custom name given at the anvil (2.3). Absent = the default one. */
  name?: string;
}

/** True when two stacks can merge (same id, metadata-compatible, identical custom names). */
export function mergeable(a: Stack, b: Stack): boolean {
  return (
    a.id === b.id &&
    a.dur === undefined && b.dur === undefined &&
    !a.ench && !b.ench &&
    a.name === b.name
  );
}

export const MAX_STACK = 64;

function copyStack(stack: Stack): Stack {
  return { ...stack, ...(stack.ench ? { ench: { ...stack.ench } } : {}) };
}

function makeStack(id: number, count: number, dur?: number, ench?: Record<string, number>, name?: string): Stack {
  return {
    id,
    count,
    ...(dur !== undefined ? { dur } : {}),
    ...(ench ? { ench: { ...ench } } : {}),
    ...(name !== undefined ? { name } : {}),
  };
}

/** Capacity check shared by normal pickup and transactional inventory actions. */
function canFitInSlots(slots: (Stack | null)[], incoming: Stack): boolean {
  if (!Number.isSafeInteger(incoming.count) || incoming.count < 0) return false;
  if (incoming.count === 0) return true;
  const limit = stackLimit(incoming.id);
  let capacity = 0;
  for (const slot of slots) {
    if (!slot) capacity += limit;
    else if (mergeable(slot, incoming)) capacity += Math.max(0, limit - slot.count);
    if (capacity >= incoming.count) return true;
  }
  return false;
}

/** Removes by item id from a scratch/live slot array, from the end like Inventory.remove. */
function removeFromSlots(slots: (Stack | null)[], id: number, count: number): number {
  let remaining = count;
  for (let i = slots.length - 1; i >= 0 && remaining > 0; i--) {
    const slot = slots[i];
    if (!slot || slot.id !== id) continue;
    const taken = Math.min(slot.count, remaining);
    slot.count -= taken;
    remaining -= taken;
    if (slot.count <= 0) slots[i] = null;
  }
  return remaining;
}

export interface Recipe {
  out: Stack;
  inputs: Stack[];
  table: boolean;
  /**
   * Optional crafting-grid pattern (rows of characters, ' ' or '.' = empty).
   * When present the recipe can also be made by placing the items in that
   * shape – exactly like in Minecraft. `key` maps characters to item ids.
   */
  pattern?: string[];
  key?: Record<string, number>;
}

/** Trims a pattern to its bounding box so it can be matched anywhere in the grid. */
function trimPattern(rows: string[]): { rows: string[]; w: number; h: number } {
  let minX = 99, minY = 99, maxX = -1, maxY = -1;
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const c = row[x];
      if (c === ' ' || c === '.') continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  });
  if (maxX < 0) return { rows: [], w: 0, h: 0 };
  const out: string[] = [];
  for (let y = minY; y <= maxY; y++) {
    let row = rows[y] ?? '';
    row = row.slice(minX, maxX + 1);
    out.push(row.padEnd(maxX - minX + 1, ' '));
  }
  return { rows: out, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/** 2.12: wszystkie rodzaje pni – każdy daje deski, jak w Minecrafcie. */
export const LOG_IDS = [B.LOG, B.BIRCH_LOG, B.ACACIA_LOG];

export const RECIPES: Recipe[] = [
  // Pnie → deski. Wcześniej brakowało pnia akacji, więc w sawannie nie dało
  // się zrobić nawet stołu rzemieślniczego; lista jest generowana z `LOG_IDS`,
  // żeby nowy pień nie zgubił przepisu.
  ...LOG_IDS.map((id) => ({
    out: { id: B.PLANKS, count: 4 },
    inputs: [{ id, count: 1 }],
    table: false,
  })),
  { out: { id: B.CRAFTING, count: 1 }, inputs: [{ id: B.PLANKS, count: 4 }], table: false, pattern: ['PP', 'PP'], key: { P: B.PLANKS } },
  { out: { id: B.FURNACE, count: 1 }, inputs: [{ id: B.COBBLE, count: 8 }], table: true, pattern: ['CCC', 'C C', 'CCC'], key: { C: B.COBBLE } },
  { out: { id: B.GLASS, count: 1 }, inputs: [{ id: B.SAND, count: 1 }, { id: I.COAL, count: 1 }], table: true },
  { out: { id: B.STONE, count: 4 }, inputs: [{ id: B.COBBLE, count: 4 }, { id: I.COAL, count: 1 }], table: true },
  { out: { id: B.STONE_BRICKS, count: 4 }, inputs: [{ id: B.STONE, count: 4 }], table: true },
  { out: { id: B.BRICK, count: 2 }, inputs: [{ id: B.CLAY, count: 4 }, { id: I.COAL, count: 1 }], table: true },
  { out: { id: B.SANDSTONE, count: 1 }, inputs: [{ id: B.SAND, count: 4 }], table: false },
  { out: { id: B.BOOKSHELF, count: 1 }, inputs: [{ id: B.PLANKS, count: 6 }, { id: B.WOOL_WHITE, count: 1 }], table: true },
  // 1.5 „Zaklęcia": papier → książka → biblioteczka (modyfikuje ten sam blok)
  { out: { id: B.BOOKSHELF, count: 1 }, inputs: [{ id: B.PLANKS, count: 6 }, { id: I.BOOK, count: 3 }], table: true, pattern: ['PPP', 'BBB', 'PPP'], key: { P: B.PLANKS, B: I.BOOK } },
  // Papier i książka są bezpostaciowe – mieści się je także w siatce 2×2.
  { out: { id: I.PAPER, count: 3 }, inputs: [{ id: B.SUGARCANE, count: 3 }], table: false },
  { out: { id: I.BOOK, count: 1 }, inputs: [{ id: I.PAPER, count: 3 }, { id: I.LEATHER, count: 1 }], table: false },
  { out: { id: B.ENCHANT, count: 1 }, inputs: [{ id: B.OBSIDIAN, count: 4 }, { id: I.DIAMOND, count: 2 }, { id: I.BOOK, count: 1 }], table: true, pattern: [' D ', 'DBD', 'OOO'], key: { D: I.DIAMOND, B: I.BOOK, O: B.OBSIDIAN } },
  { out: { id: B.LAPIS_BLOCK, count: 1 }, inputs: [{ id: I.LAPIS, count: 9 }], table: true, pattern: ['LLL', 'LLL', 'LLL'], key: { L: I.LAPIS } },
  { out: { id: I.LAPIS, count: 9 }, inputs: [{ id: B.LAPIS_BLOCK, count: 1 }], table: false },
  { out: { id: B.TNT, count: 1 }, inputs: [{ id: B.SAND, count: 4 }, { id: I.COAL, count: 5 }], table: true },
  { out: { id: B.TNT, count: 1 }, inputs: [{ id: B.SAND, count: 4 }, { id: I.GUNPOWDER, count: 5 }], table: true },
  // 1.9: jasnogłaz składa się z pyłu jasnogłazu (jak w Minecraftcie)
  { out: { id: B.GLOWSTONE, count: 1 }, inputs: [{ id: I.GLOWSTONE_DUST, count: 4 }], table: false, pattern: ['DD', 'DD'], key: { D: I.GLOWSTONE_DUST } },
  { out: { id: B.MOSSY, count: 1 }, inputs: [{ id: B.COBBLE, count: 1 }, { id: B.LEAVES, count: 1 }], table: false },
  { out: { id: B.WOOL_WHITE, count: 1 }, inputs: [{ id: B.TALLGRASS, count: 4 }], table: false },
  { out: { id: B.WOOL_RED, count: 1 }, inputs: [{ id: B.WOOL_WHITE, count: 1 }, { id: B.FLOWER_RED, count: 1 }], table: false },
  { out: { id: B.WOOL_YELLOW, count: 1 }, inputs: [{ id: B.WOOL_WHITE, count: 1 }, { id: B.FLOWER_YELLOW, count: 1 }], table: false },
  { out: { id: B.WOOL_GREEN, count: 1 }, inputs: [{ id: B.WOOL_WHITE, count: 1 }, { id: B.CACTUS, count: 1 }], table: false },
  { out: { id: B.WOOL_BLACK, count: 1 }, inputs: [{ id: B.WOOL_WHITE, count: 1 }, { id: I.COAL, count: 1 }], table: false },
  { out: { id: B.WOOL_BLUE, count: 1 }, inputs: [{ id: B.WOOL_WHITE, count: 1 }, { id: I.DIAMOND, count: 1 }], table: false },
  { out: { id: B.OBSIDIAN, count: 1 }, inputs: [{ id: B.STONE, count: 4 }, { id: I.DIAMOND, count: 1 }], table: true },
  { out: { id: I.COAL, count: 1 }, inputs: [{ id: B.COAL_ORE, count: 1 }], table: false },
  { out: { id: I.DIAMOND, count: 1 }, inputs: [{ id: B.DIAMOND_ORE, count: 1 }], table: false },
  { out: { id: I.LAPIS, count: 4 }, inputs: [{ id: B.LAPIS_ORE, count: 1 }], table: false },
  { out: { id: I.STICK, count: 4 }, inputs: [{ id: B.PLANKS, count: 2 }], table: false, pattern: ['P', 'P'], key: { P: B.PLANKS } },
  { out: { id: B.TORCH, count: 4 }, inputs: [{ id: I.COAL, count: 1 }, { id: I.STICK, count: 1 }], table: false, pattern: ['C', 'S'], key: { C: I.COAL, S: I.STICK } },
  { out: { id: I.BREAD, count: 1 }, inputs: [{ id: I.WHEAT, count: 3 }], table: false },
  { out: { id: I.BUCKET, count: 1 }, inputs: [{ id: I.IRON, count: 3 }], table: true },
  { out: { id: B.BED, count: 1 }, inputs: [{ id: B.WOOL_WHITE, count: 3 }, { id: B.PLANKS, count: 3 }], table: true, pattern: ['WWW', 'PPP'], key: { W: B.WOOL_WHITE, P: B.PLANKS } },
  { out: { id: B.CHEST, count: 1 }, inputs: [{ id: B.PLANKS, count: 8 }], table: true, pattern: ['PPP', 'P P', 'PPP'], key: { P: B.PLANKS } },
  { out: { id: B.DOOR_N, count: 3 }, inputs: [{ id: B.PLANKS, count: 6 }], table: true, pattern: ['PP', 'PP', 'PP'], key: { P: B.PLANKS } },
  { out: { id: B.LADDER_N, count: 3 }, inputs: [{ id: I.STICK, count: 7 }], table: false, pattern: ['S S', 'SSS', 'S S'], key: { S: I.STICK } },
  { out: { id: B.FENCE, count: 3 }, inputs: [{ id: B.PLANKS, count: 4 }, { id: I.STICK, count: 2 }], table: false, pattern: ['PSP', 'PSP'], key: { P: B.PLANKS, S: I.STICK } },
  { out: { id: B.TRAP, count: 2 }, inputs: [{ id: B.PLANKS, count: 6 }], table: true, pattern: ['PPP', 'PPP'], key: { P: B.PLANKS } },
  { out: { id: B.CAMPFIRE, count: 1 }, inputs: [{ id: I.STICK, count: 3 }, { id: I.COAL, count: 1 }], table: false },
  { out: { id: I.SHEARS, count: 1 }, inputs: [{ id: I.IRON, count: 2 }], table: true },
  { out: { id: I.FLINT_STEEL, count: 1 }, inputs: [{ id: I.FLINT, count: 1 }, { id: I.IRON, count: 1 }], table: false },
  { out: { id: I.COMPASS, count: 1 }, inputs: [{ id: I.IRON, count: 4 }, { id: I.COAL, count: 1 }], table: true },
  { out: { id: I.CLOCK, count: 1 }, inputs: [{ id: I.GOLD, count: 4 }, { id: I.COAL, count: 1 }], table: true },
  { out: { id: B.IRON_BLOCK, count: 1 }, inputs: [{ id: I.IRON, count: 9 }], table: true, pattern: ['III', 'III', 'III'], key: { I: I.IRON } },
  { out: { id: B.GOLD_BLOCK, count: 1 }, inputs: [{ id: I.GOLD, count: 9 }], table: true, pattern: ['GGG', 'GGG', 'GGG'], key: { G: I.GOLD } },
  { out: { id: B.DIAMOND_BLOCK, count: 1 }, inputs: [{ id: I.DIAMOND, count: 9 }], table: true, pattern: ['DDD', 'DDD', 'DDD'], key: { D: I.DIAMOND } },
  { out: { id: I.IRON, count: 9 }, inputs: [{ id: B.IRON_BLOCK, count: 1 }], table: false },
  { out: { id: I.GOLD, count: 9 }, inputs: [{ id: B.GOLD_BLOCK, count: 1 }], table: false },
  { out: { id: I.DIAMOND, count: 9 }, inputs: [{ id: B.DIAMOND_BLOCK, count: 1 }], table: false },
  { out: { id: I.BOW, count: 1 }, inputs: [{ id: I.STICK, count: 3 }, { id: I.STRING, count: 3 }], table: true, pattern: [' #S', '# S', ' #S'], key: { '#': I.STICK, S: I.STRING } },
  { out: { id: I.ARROW, count: 4 }, inputs: [{ id: I.FLINT, count: 1 }, { id: I.STICK, count: 1 }, { id: I.FEATHER, count: 1 }], table: false },
  { out: { id: I.SHIELD, count: 1 }, inputs: [{ id: B.PLANKS, count: 6 }, { id: I.IRON, count: 1 }], table: true, pattern: ['PIP', 'PPP', 'PPP'], key: { P: B.PLANKS, I: I.IRON } },
  // 1.7 „Nether & Redstone”
  { out: { id: B.REDSTONE_BLOCK, count: 1 }, inputs: [{ id: I.REDSTONE, count: 9 }], table: true, pattern: ['RRR', 'RRR', 'RRR'], key: { R: I.REDSTONE } },
  { out: { id: I.REDSTONE, count: 9 }, inputs: [{ id: B.REDSTONE_BLOCK, count: 1 }], table: false },
  { out: { id: B.REDSTONE_TORCH, count: 1 }, inputs: [{ id: I.REDSTONE, count: 1 }, { id: I.STICK, count: 1 }], table: false, pattern: ['R', 'S'], key: { R: I.REDSTONE, S: I.STICK } },
  { out: { id: B.REDSTONE_LAMP, count: 1 }, inputs: [{ id: I.REDSTONE, count: 4 }, { id: B.GLOWSTONE, count: 1 }], table: true, pattern: [' R ', 'RGR', ' R '], key: { R: I.REDSTONE, G: B.GLOWSTONE } },
  { out: { id: B.LEVER, count: 1 }, inputs: [{ id: B.COBBLE, count: 1 }, { id: I.STICK, count: 1 }], table: false },
  { out: { id: B.BUTTON, count: 1 }, inputs: [{ id: B.STONE, count: 1 }], table: false },
  { out: { id: B.PISTON, count: 1 }, inputs: [{ id: B.PLANKS, count: 3 }, { id: B.COBBLE, count: 4 }, { id: I.IRON, count: 1 }, { id: I.REDSTONE, count: 1 }], table: true, pattern: ['PPP', 'CIC', 'CRC'], key: { P: B.PLANKS, C: B.COBBLE, I: I.IRON, R: I.REDSTONE } },
  { out: { id: B.STICKY_PISTON, count: 1 }, inputs: [{ id: B.PISTON, count: 1 }, { id: I.SLIME_BALL, count: 1 }], table: false },
  { out: { id: B.SLIME_BLOCK, count: 1 }, inputs: [{ id: I.SLIME_BALL, count: 9 }], table: true, pattern: ['SSS', 'SSS', 'SSS'], key: { S: I.SLIME_BALL } },
  { out: { id: I.SLIME_BALL, count: 9 }, inputs: [{ id: B.SLIME_BLOCK, count: 1 }], table: false },
  { out: { id: B.OBSERVER, count: 1 }, inputs: [{ id: B.COBBLE, count: 6 }, { id: I.REDSTONE, count: 2 }, { id: B.QUARTZ_BLOCK, count: 1 }], table: true, pattern: ['CCC', 'RRQ', 'CCC'], key: { C: B.COBBLE, R: I.REDSTONE, Q: B.QUARTZ_BLOCK } },
  { out: { id: B.DISPENSER, count: 1 }, inputs: [{ id: B.COBBLE, count: 7 }, { id: I.BOW, count: 1 }, { id: I.REDSTONE, count: 1 }], table: true, pattern: ['CCC', 'CBC', 'CRC'], key: { C: B.COBBLE, B: I.BOW, R: I.REDSTONE } },
  { out: { id: B.NOTE_BLOCK, count: 1 }, inputs: [{ id: B.PLANKS, count: 8 }, { id: I.REDSTONE, count: 1 }], table: true, pattern: ['PPP', 'PRP', 'PPP'], key: { P: B.PLANKS, R: I.REDSTONE } },
  { out: { id: B.QUARTZ_BLOCK, count: 1 }, inputs: [{ id: I.QUARTZ, count: 4 }], table: true, pattern: ['QQ', 'QQ'], key: { Q: I.QUARTZ } },
  { out: { id: B.QUARTZ_PILLAR, count: 2 }, inputs: [{ id: B.QUARTZ_BLOCK, count: 2 }], table: true, pattern: ['Q', 'Q'], key: { Q: B.QUARTZ_BLOCK } },
  { out: { id: B.NETHER_BRICKS, count: 1 }, inputs: [{ id: I.NETHER_BRICK_ITEM, count: 4 }], table: true, pattern: ['NN', 'NN'], key: { N: I.NETHER_BRICK_ITEM } },
  { out: { id: B.END_BRICKS, count: 4 }, inputs: [{ id: B.END_STONE, count: 4 }], table: true, pattern: ['EE', 'EE'], key: { E: B.END_STONE } },
  { out: { id: B.PURPUR_BLOCK, count: 4 }, inputs: [{ id: B.PURPUR_PILLAR, count: 4 }], table: false },
  { out: { id: B.CONCRETE_WHITE, count: 8 }, inputs: [{ id: B.SAND, count: 4 }, { id: B.GRAVEL, count: 4 }, { id: I.BONE, count: 1 }], table: true },
  { out: { id: B.CONCRETE_RED, count: 8 }, inputs: [{ id: B.SAND, count: 4 }, { id: B.GRAVEL, count: 4 }, { id: B.FLOWER_RED, count: 1 }], table: true },
  { out: { id: B.RAIL, count: 16 }, inputs: [{ id: I.IRON, count: 6 }, { id: I.STICK, count: 1 }], table: true, pattern: ['I I', 'ISI', 'I I'], key: { I: I.IRON, S: I.STICK } },
  { out: { id: B.POWERED_RAIL, count: 6 }, inputs: [{ id: I.GOLD, count: 6 }, { id: I.STICK, count: 1 }, { id: I.REDSTONE, count: 1 }], table: true, pattern: ['G G', 'GSG', 'GRG'], key: { G: I.GOLD, S: I.STICK, R: I.REDSTONE } },
  { out: { id: B.DETECTOR_RAIL, count: 6 }, inputs: [{ id: I.IRON, count: 6 }, { id: B.STONE, count: 1 }, { id: I.REDSTONE, count: 1 }], table: true, pattern: ['I I', 'ISI', 'IRI'], key: { I: I.IRON, S: B.STONE, R: I.REDSTONE } },
  { out: { id: B.ANVIL, count: 1 }, inputs: [{ id: B.IRON_BLOCK, count: 3 }, { id: I.IRON, count: 4 }], table: true, pattern: ['III', ' I ', 'III'], key: { I: B.IRON_BLOCK } },
  { out: { id: B.TARGET, count: 1 }, inputs: [{ id: I.REDSTONE, count: 4 }, { id: B.HAY, count: 1 }], table: true, pattern: [' R ', 'RHR', ' R '], key: { R: I.REDSTONE, H: B.HAY } },
  { out: { id: B.HONEYCOMB_BLOCK, count: 1 }, inputs: [{ id: I.HONEYCOMB, count: 4 }], table: true, pattern: ['HH', 'HH'], key: { H: I.HONEYCOMB } },
  // 1.9: netherowe surowce mają swoje receptury i źródła
  { out: { id: B.MAGMA, count: 1 }, inputs: [{ id: I.MAGMA_CREAM, count: 4 }], table: false, pattern: ['MM', 'MM'], key: { M: I.MAGMA_CREAM } },
  { out: { id: B.BREWING, count: 1 }, inputs: [{ id: I.BLAZE_ROD, count: 1 }, { id: B.COBBLE, count: 3 }], table: false, pattern: [' R ', 'CCC'], key: { R: I.BLAZE_ROD, C: B.COBBLE } },
  { out: { id: B.CRYING_OBSIDIAN, count: 1 }, inputs: [{ id: B.OBSIDIAN, count: 1 }, { id: I.GHAST_TEAR, count: 1 }], table: false },
  { out: { id: B.WOOL_RED, count: 1 }, inputs: [{ id: B.WOOL_WHITE, count: 1 }, { id: I.NETHER_WART, count: 1 }], table: false },
  { out: { id: B.OAK_STAIRS_N, count: 4 }, inputs: [{ id: B.PLANKS, count: 6 }], table: true, pattern: ['P  ', 'PP ', 'PPP'], key: { P: B.PLANKS } },
  { out: { id: B.COBBLE_STAIRS_N, count: 4 }, inputs: [{ id: B.COBBLE, count: 6 }], table: true, pattern: ['C  ', 'CC ', 'CCC'], key: { C: B.COBBLE } },
  { out: { id: B.OAK_SLAB, count: 6 }, inputs: [{ id: B.PLANKS, count: 3 }], table: true, pattern: ['PPP'], key: { P: B.PLANKS } },
  { out: { id: B.STONE_SLAB, count: 6 }, inputs: [{ id: B.STONE, count: 3 }], table: true, pattern: ['SSS'], key: { S: B.STONE } },
  { out: { id: B.QUARTZ_SLAB, count: 6 }, inputs: [{ id: B.QUARTZ_BLOCK, count: 3 }], table: true, pattern: ['QQQ'], key: { Q: B.QUARTZ_BLOCK } },
  // 2.3 „Wyprawa i ratunek”: wędka, lorneta i totem
  // Wędka jest bezpostaciowa (3 patyki + 2 struny) – inaczej jej wzór kolidowałby
  // ze wzorem łuku i w siatce dawałoby się zawsze zrobić łuk.
  { out: { id: I.FISHING_ROD, count: 1 }, inputs: [{ id: I.STICK, count: 3 }, { id: I.STRING, count: 2 }], table: true },
  // Lorneta: krzyż ze szkła złoconego oczkiem pośrodku (4 szkła + 1 sztabka złota).
  { out: { id: I.SPYGLASS, count: 1 }, inputs: [{ id: B.GLASS, count: 4 }, { id: I.GOLD, count: 1 }], table: true, pattern: [' G ', 'GYG', ' G '], key: { G: B.GLASS, Y: I.GOLD } },
  { out: { id: I.TOTEM, count: 1 }, inputs: [{ id: I.EMERALD, count: 4 }, { id: I.GOLD, count: 1 }], table: true, pattern: [' E ', 'EGE', ' E '], key: { E: I.EMERALD, G: I.GOLD } },
  // 2.4 „Godzina alchemika”: cukier, fiolki i miodek
  { out: { id: I.SUGAR, count: 1 }, inputs: [{ id: B.SUGARCANE, count: 1 }], table: false },
  { out: { id: I.BOTTLE, count: 3 }, inputs: [{ id: B.GLASS, count: 3 }], table: false, pattern: ['G G', ' G '], key: { G: B.GLASS } },
  { out: { id: I.HONEY_BOTTLE, count: 1 }, inputs: [{ id: I.BOTTLE, count: 1 }, { id: I.HONEYCOMB, count: 1 }], table: false },

  // ==========================================================================
  // 2.16 „Pikselowe tekstury”: brakujące przepisy z nowszych wersji Minecrafta
  // ==========================================================================
  // Schody z każdego materiału budowlanego – wcześniej istniały tylko drewniane
  // i brukowe, więc kamienne cegły, cegła, piaskowiec, nether i kwarc nie miały
  // schodów. Jak w Minecrafcie: 6 bloków daje 4 stopnie.
  { out: { id: B.BRICK_STAIRS_N, count: 4 }, inputs: [{ id: B.BRICK, count: 6 }], table: true, pattern: ['B  ', 'BB ', 'BBB'], key: { B: B.BRICK } },
  { out: { id: B.STONE_BRICK_STAIRS_N, count: 4 }, inputs: [{ id: B.STONE_BRICKS, count: 6 }], table: true, pattern: ['S  ', 'SS ', 'SSS'], key: { S: B.STONE_BRICKS } },
  { out: { id: B.SANDSTONE_STAIRS_N, count: 4 }, inputs: [{ id: B.SANDSTONE, count: 6 }], table: true, pattern: ['A  ', 'AA ', 'AAA'], key: { A: B.SANDSTONE } },
  { out: { id: B.NETHER_BRICK_STAIRS_N, count: 4 }, inputs: [{ id: B.NETHER_BRICKS, count: 6 }], table: true, pattern: ['N  ', 'NN ', 'NNN'], key: { N: B.NETHER_BRICKS } },
  { out: { id: B.QUARTZ_STAIRS_N, count: 4 }, inputs: [{ id: B.QUARTZ_BLOCK, count: 6 }], table: true, pattern: ['Q  ', 'QQ ', 'QQQ'], key: { Q: B.QUARTZ_BLOCK } },
  // Płyty: 3 bloki → 6 płyt (tak samo liczy Minecraft).
  { out: { id: B.COBBLE_SLAB, count: 6 }, inputs: [{ id: B.COBBLE, count: 3 }], table: true, pattern: ['CCC'], key: { C: B.COBBLE } },
  { out: { id: B.BRICK_SLAB, count: 6 }, inputs: [{ id: B.BRICK, count: 3 }], table: true, pattern: ['BBB'], key: { B: B.BRICK } },
  { out: { id: B.SANDSTONE_SLAB, count: 6 }, inputs: [{ id: B.SANDSTONE, count: 3 }], table: true, pattern: ['AAA'], key: { A: B.SANDSTONE } },
  { out: { id: B.NETHER_BRICK_SLAB, count: 6 }, inputs: [{ id: B.NETHER_BRICKS, count: 3 }], table: true, pattern: ['NNN'], key: { N: B.NETHER_BRICKS } },
  // Wełna z nici – klasyczny przepis z Minecrafta, ratunek, gdy nie ma owiec.
  { out: { id: B.WOOL_WHITE, count: 1 }, inputs: [{ id: I.STRING, count: 4 }], table: false },
  // Snop siana i z powrotem (9 pszenicy ↔ 9 pszenicy w snopie).
  { out: { id: B.HAY, count: 1 }, inputs: [{ id: I.WHEAT, count: 9 }], table: false, pattern: ['WWW', 'WWW', 'WWW'], key: { W: I.WHEAT } },
  { out: { id: I.WHEAT, count: 9 }, inputs: [{ id: B.HAY, count: 1 }], table: false },
  // Latarnia: pochodnia + sztabka żelaza (odpowiednik 8 grudek żelaza).
  { out: { id: B.LANTERN, count: 1 }, inputs: [{ id: B.TORCH, count: 1 }, { id: I.IRON, count: 1 }], table: false },
  // Dzwon: 4 sztabki złota na stole rzemieślniczym.
  { out: { id: B.BELL, count: 1 }, inputs: [{ id: I.GOLD, count: 4 }], table: true, pattern: ['GG', 'GG'], key: { G: I.GOLD } },
  // Blok szmaragdu i rozbiórka (9 ↔ 1), jak pozostałe bloki minerałów.
  { out: { id: B.EMERALD_BLOCK, count: 1 }, inputs: [{ id: I.EMERALD, count: 9 }], table: true, pattern: ['EEE', 'EEE', 'EEE'], key: { E: I.EMERALD } },
  { out: { id: I.EMERALD, count: 9 }, inputs: [{ id: B.EMERALD_BLOCK, count: 1 }], table: false },
  // Blok miodu z 4 butelek miodu (2×2), zgodnie z nowszymi wersjami.
  { out: { id: B.HONEY_BLOCK, count: 1 }, inputs: [{ id: I.HONEY_BOTTLE, count: 4 }], table: true, pattern: ['HH', 'HH'], key: { H: I.HONEY_BOTTLE } },
  // Terakota: wypalona glina (u nas glina + węgiel, jak przy cegle).
  { out: { id: B.TERRACOTTA, count: 4 }, inputs: [{ id: B.CLAY, count: 4 }, { id: I.COAL, count: 1 }], table: true },
  // Beton w pozostałych czterech kolorach – ten sam przepis co biały i czerwony.
  { out: { id: B.CONCRETE_BLUE, count: 8 }, inputs: [{ id: B.SAND, count: 4 }, { id: B.GRAVEL, count: 4 }, { id: I.LAPIS, count: 1 }], table: true },
  { out: { id: B.CONCRETE_GREEN, count: 8 }, inputs: [{ id: B.SAND, count: 4 }, { id: B.GRAVEL, count: 4 }, { id: B.CACTUS, count: 1 }], table: true },
  { out: { id: B.CONCRETE_YELLOW, count: 8 }, inputs: [{ id: B.SAND, count: 4 }, { id: B.GRAVEL, count: 4 }, { id: B.FLOWER_YELLOW, count: 1 }], table: true },
  { out: { id: B.CONCRETE_BLACK, count: 8 }, inputs: [{ id: B.SAND, count: 4 }, { id: B.GRAVEL, count: 4 }, { id: I.COAL, count: 1 }], table: true },
  // Błoto: ziemia + butelka wody (w Minecrafcie używa się butelki na bloku).
  { out: { id: B.MUD, count: 1 }, inputs: [{ id: B.DIRT, count: 1 }, { id: I.BOTTLE, count: 1 }], table: false },
];

/**
 * Armor sets, Minecraft-style patterns at the crafting table:
 * helmet 5, chestplate 8, leggings 7, boots 4 pieces of the material.
 */
const HELMET_PATTERN = ['LLL', 'L L'];
const CHEST_PATTERN = ['L L', 'LLL', 'LLL'];
const LEGS_PATTERN = ['LLL', 'L L', 'L L'];
const BOOTS_PATTERN = ['L L', 'L L'];

function addArmor(mat: number, ids: [number, number, number, number]) {
  const key = { L: mat };
  const counts = [5, 8, 7, 4];
  const patterns = [HELMET_PATTERN, CHEST_PATTERN, LEGS_PATTERN, BOOTS_PATTERN];
  RECIPES.push(
    { out: { id: ids[0], count: 1 }, inputs: [{ id: mat, count: counts[0] }], table: true, pattern: patterns[0], key },
    { out: { id: ids[1], count: 1 }, inputs: [{ id: mat, count: counts[1] }], table: true, pattern: patterns[1], key },
    { out: { id: ids[2], count: 1 }, inputs: [{ id: mat, count: counts[2] }], table: true, pattern: patterns[2], key },
    { out: { id: ids[3], count: 1 }, inputs: [{ id: mat, count: counts[3] }], table: true, pattern: patterns[3], key }
  );
}
addArmor(I.LEATHER, [I.LEATHER_HELMET, I.LEATHER_CHEST, I.LEATHER_LEGS, I.LEATHER_BOOTS]);
addArmor(I.IRON, [I.IRON_HELMET, I.IRON_CHEST, I.IRON_LEGS, I.IRON_BOOTS]);
addArmor(I.GOLD, [I.GOLD_HELMET, I.GOLD_CHEST, I.GOLD_LEGS, I.GOLD_BOOTS]);
addArmor(I.DIAMOND, [I.DIAMOND_HELMET, I.DIAMOND_CHEST, I.DIAMOND_LEGS, I.DIAMOND_BOOTS]);

function addTools(mat: number, pick: number, axe: number, shovel: number, sword: number, hoe: number) {
  // 'M' is the material (planks / cobble / ingot / gem), 'S' a stick
  const key = { M: mat, S: I.STICK };
  RECIPES.push(
    { out: { id: pick, count: 1 }, inputs: [{ id: mat, count: 3 }, { id: I.STICK, count: 2 }], table: true, pattern: ['MMM', ' S ', ' S '], key },
    { out: { id: axe, count: 1 }, inputs: [{ id: mat, count: 3 }, { id: I.STICK, count: 2 }], table: true, pattern: ['MM', 'MS', ' S'], key },
    { out: { id: shovel, count: 1 }, inputs: [{ id: mat, count: 1 }, { id: I.STICK, count: 2 }], table: true, pattern: ['M', 'S', 'S'], key },
    { out: { id: sword, count: 1 }, inputs: [{ id: mat, count: 2 }, { id: I.STICK, count: 1 }], table: true, pattern: ['M', 'M', 'S'], key },
    { out: { id: hoe, count: 1 }, inputs: [{ id: mat, count: 2 }, { id: I.STICK, count: 2 }], table: true, pattern: ['MM', ' S', ' S'], key }
  );
}
addTools(B.PLANKS, I.WOOD_PICK, I.WOOD_AXE, I.WOOD_SHOVEL, I.WOOD_SWORD, I.WOOD_HOE);
addTools(B.COBBLE, I.STONE_PICK, I.STONE_AXE, I.STONE_SHOVEL, I.STONE_SWORD, I.STONE_HOE);
addTools(I.IRON, I.IRON_PICK, I.IRON_AXE, I.IRON_SHOVEL, I.IRON_SWORD, I.IRON_HOE);
addTools(I.DIAMOND, I.DIAMOND_PICK, I.DIAMOND_AXE, I.DIAMOND_SHOVEL, I.DIAMOND_SWORD, I.DIAMOND_HOE);

export class Inventory {
  slots: (Stack | null)[] = new Array(36).fill(null);
  cursor: Stack | null = null;
  /** 3x3 crafting grid; only the top-left 2x2 is used without a table. */
  grid: (Stack | null)[] = new Array(9).fill(null);

  /** True only if the complete stack can be added; it never reserves or mutates slots. */
  canAdd(id: number, count = 1, dur?: number, ench?: Record<string, number>, name?: string): boolean {
    return canFitInSlots(this.slots, makeStack(id, count, dur, ench, name));
  }

  /**
   * Trade preflight: checks capacity after the payment is removed, without
   * changing the real inventory. This keeps an exchange all-or-nothing while
   * still allowing the payment itself to free a slot.
   */
  canAddAfterRemoving(
    id: number,
    count: number,
    removals: { id: number; count: number }[]
  ): boolean {
    const projected = this.slots.map((slot) => slot ? copyStack(slot) : null);
    for (const removal of removals) {
      if (!Number.isSafeInteger(removal.count) || removal.count < 0) return false;
      if (removeFromSlots(projected, removal.id, removal.count) > 0) return false;
    }
    return canFitInSlots(projected, makeStack(id, count));
  }

  add(id: number, count = 1, dur?: number, ench?: Record<string, number>, name?: string): boolean {
    const incoming = makeStack(id, count, dur, ench, name);
    // Preflight before changing anything. Callers may drop the stack or keep it
    // in the world when false is returned, so partial insertion would duplicate
    // items on pickup and on trade.
    if (!canFitInSlots(this.slots, incoming)) return false;
    const limit = stackLimit(id);
    let remaining = count;

    // Named stacks may merge with the same name, but never with a different
    // name. Durability/enchantment-bearing items remain individually slotted.
    if (dur === undefined && !ench) {
      for (const slot of this.slots) {
        if (!slot || !mergeable(slot, incoming)) continue;
        const moved = Math.min(Math.max(0, limit - slot.count), remaining);
        slot.count += moved;
        remaining -= moved;
        if (remaining <= 0) return true;
      }
    }

    for (let i = 0; i < this.slots.length && remaining > 0; i++) {
      if (this.slots[i]) continue;
      const moved = Math.min(limit, remaining);
      this.slots[i] = makeStack(id, moved, dur, ench, name);
      remaining -= moved;
    }
    return remaining === 0;
  }

  countOf(id: number): number {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.count;
    return n;
  }

  remove(id: number, count: number) {
    removeFromSlots(this.slots, id, count);
  }

  /** Number of usable grid cells (2x2 without a table, 3x3 with one). */
  private gridSize(table: boolean): number {
    return table ? 9 : 4;
  }

  /**
   * The recipe the crafting grid currently matches, or null. Shaped recipes are
   * matched by their pattern (anywhere in the grid), shapeless ones by the
   * multiset of items placed.
   */
  gridMatch(table: boolean): Recipe | null {
    const size = this.gridSize(table);
    const cols = size === 9 ? 3 : 2;
    const at = (x: number, y: number) => this.grid[y * 3 + x] ?? null;
    let minX = cols, minY = 3, maxX = -1, maxY = -1;
    const have = new Map<number, number>();
    for (let y = 0; y < 3; y++) for (let x = 0; x < cols; x++) {
      const cell = at(x, y);
      if (!cell) continue;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      have.set(cell.id, (have.get(cell.id) ?? 0) + 1);
    }
    if (maxX < 0) return null;
    const w = maxX - minX + 1, h = maxY - minY + 1;

    for (const r of RECIPES) {
      if (r.table && !table) continue;
      if (r.pattern) {
        const p = trimPattern(r.pattern);
        if (p.w !== w || p.h !== h || p.w > cols) continue;
        let ok = true;
        for (let y = 0; y < h && ok; y++) {
          for (let x = 0; x < w && ok; x++) {
            const ch = p.rows[y][x] ?? ' ';
            const want = ch === ' ' || ch === '.' ? 0 : (r.key?.[ch] ?? -1);
            const cell = at(minX + x, minY + y);
            if (want === 0) { if (cell) ok = false; }
            else if (!cell || cell.id !== want) ok = false;
          }
        }
        if (ok) return r;
      } else {
        // shapeless: the placed items must be exactly the recipe inputs
        if (have.size !== new Set(r.inputs.map((i) => i.id)).size) continue;
        let ok = true;
        for (const inp of r.inputs) if (have.get(inp.id) !== inp.count) { ok = false; break; }
        if (ok) return r;
      }
    }
    return null;
  }

  /** Moves items between the cursor and a crafting-grid slot. */
  clickGrid(i: number, right: boolean) {
    const cell = this.grid[i];
    if (this.cursor) {
      if (!cell) {
        // right click drops a single item – the natural way to fill a pattern
        if (right && this.cursor.count > 1) {
          this.grid[i] = makeStack(this.cursor.id, 1, this.cursor.dur, this.cursor.ench, this.cursor.name);
          this.cursor.count -= 1;
        } else {
          this.grid[i] = this.cursor;
          this.cursor = null;
        }
        return;
      }
      if (mergeable(cell, this.cursor)) {
        const limit = stackLimit(cell.id);
        const n = right ? Math.min(1, this.cursor.count) : this.cursor.count;
        const move = Math.min(n, limit - cell.count, this.cursor.count);
        if (move > 0) { cell.count += move; this.cursor.count -= move; }
        if (this.cursor.count <= 0) this.cursor = null;
        return;
      }
      // swap
      this.grid[i] = this.cursor;
      this.cursor = cell;
      return;
    }
    if (!cell) return;
    if (right && cell.count > 1) {
      const half = Math.ceil(cell.count / 2);
      this.cursor = { id: cell.id, count: half, dur: cell.dur, ench: cell.ench ? { ...cell.ench } : undefined, name: cell.name };
      cell.count -= half;
      if (cell.count <= 0) this.grid[i] = null;
    } else {
      this.cursor = cell;
      this.grid[i] = null;
    }
  }

  /** Takes the current grid result, consuming one of every ingredient. */
  craftGrid(table: boolean): Stack | null {
    const r = this.gridMatch(table);
    if (!r) return null;
    const out: Stack = { ...r.out };
    for (let i = 0; i < 9; i++) {
      const cell = this.grid[i];
      if (!cell) continue;
      cell.count -= 1;
      if (cell.count <= 0) this.grid[i] = null;
    }
    return out;
  }

  /** Puts every grid item back into the inventory (closing the screen). */
  returnGrid(): (Stack | null)[] {
    const leftovers: (Stack | null)[] = [];
    for (let i = 0; i < 9; i++) {
      const cell = this.grid[i];
      if (!cell) continue;
      if (!this.add(cell.id, cell.count, cell.dur, cell.ench, cell.name)) leftovers.push(cell);
      this.grid[i] = null;
    }
    return leftovers;
  }

  canCraft(r: Recipe): boolean {
    return r.inputs.every((inp) => this.countOf(inp.id) >= inp.count);
  }

  /** Checks both ingredients and output capacity, including slots freed by ingredients. */
  canCraftToInventory(r: Recipe): boolean {
    if (!this.canCraft(r)) return false;
    const projected = this.slots.map((slot) => slot ? copyStack(slot) : null);
    for (const input of r.inputs) {
      if (removeFromSlots(projected, input.id, input.count) > 0) return false;
    }
    return canFitInSlots(projected, r.out);
  }

  craft(r: Recipe): boolean {
    if (!this.canCraftToInventory(r)) return false;
    const previous = this.slots.map((slot) => slot ? copyStack(slot) : null);
    for (const inp of r.inputs) this.remove(inp.id, inp.count);
    if (!this.add(r.out.id, r.out.count, r.out.dur, r.out.ench, r.out.name)) {
      // Defensive rollback: output insertion is normally guaranteed by the
      // preflight above, but never consume a recipe if that assumption changes.
      this.slots = previous;
      return false;
    }
    return true;
  }

  clickSlot(i: number, right = false) {
    const s = this.slots[i];
    const c = this.cursor;
    if (!c) {
      if (!s) return;
      if (right && s.count > 1) {
        const half = Math.ceil(s.count / 2);
        // 2.3: połówka musi zabrać ze sobą wytrzymałość, zaklęcia i nazwę.
        this.cursor = { id: s.id, count: half, dur: s.dur, ench: s.ench ? { ...s.ench } : undefined, name: s.name };
        s.count -= half;
      } else {
        this.cursor = s;
        this.slots[i] = null;
      }
      return;
    }
    if (!s) {
      if (right) {
        // carry durability/enchantments/name with the single taken unit
        this.slots[i] = { id: c.id, count: 1, ...(c.dur !== undefined ? { dur: c.dur } : {}), ...(c.ench ? { ench: { ...c.ench } } : {}), ...(c.name ? { name: c.name } : {}) };
        c.count--;
        if (c.count <= 0) this.cursor = null;
      } else {
        this.slots[i] = c;
        this.cursor = null;
      }
      return;
    }
    if (mergeable(s, c)) {
      const amount = right ? 1 : c.count;
      const n = Math.min(stackLimit(s.id) - s.count, amount);
      s.count += n;
      c.count -= n;
      if (c.count <= 0) this.cursor = null;
      return;
    }
    this.slots[i] = c;
    this.cursor = s;
  }

  /** Returns false without changing the cursor if the stack does not fit. */
  returnCursor(): boolean {
    if (!this.cursor) return true;
    if (!this.add(this.cursor.id, this.cursor.count, this.cursor.dur, this.cursor.ench, this.cursor.name)) return false;
    this.cursor = null;
    return true;
  }
}
