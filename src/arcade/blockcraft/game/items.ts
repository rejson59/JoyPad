import { B, BLOCKS, RENDER, isDoor, isLadder, isTrap } from './blocks';
import type { Stack } from './inventory';

/** Item ids sit above block ids so a stack can hold either. */
export const I = {
  STICK: 100,
  COAL: 101,
  IRON: 102,
  GOLD: 103,
  DIAMOND: 104,
  GUNPOWDER: 105,
  SEEDS: 106,
  WHEAT: 107,
  APPLE: 108,
  BREAD: 109,
  RAW_PORK: 110,
  COOKED_PORK: 111,
  RAW_BEEF: 112,
  COOKED_BEEF: 113,
  RAW_CHICKEN: 114,
  COOKED_CHICKEN: 115,
  BUCKET: 116,
  WATER_BUCKET: 117,
  LAVA_BUCKET: 118,
  WOOD_PICK: 120,
  STONE_PICK: 121,
  IRON_PICK: 122,
  DIAMOND_PICK: 123,
  WOOD_AXE: 124,
  STONE_AXE: 125,
  IRON_AXE: 126,
  DIAMOND_AXE: 127,
  WOOD_SHOVEL: 128,
  STONE_SHOVEL: 129,
  IRON_SHOVEL: 130,
  DIAMOND_SHOVEL: 131,
  WOOD_SWORD: 132,
  STONE_SWORD: 133,
  IRON_SWORD: 134,
  DIAMOND_SWORD: 135,
  WOOD_HOE: 136,
  STONE_HOE: 137,
  IRON_HOE: 138,
  DIAMOND_HOE: 139,
  FLINT: 140,
  SHEARS: 141,
  FLINT_STEEL: 142,
  COMPASS: 143,
  CLOCK: 144,
  STRING: 145,
  BONE: 146,
  FEATHER: 147,
  ARROW: 148,
  BOW: 149,
  LAPIS: 150,
  PAPER: 151,
  BOOK: 152,
  EMERALD: 153,
  LEATHER: 200,
  LEATHER_HELMET: 201,
  LEATHER_CHEST: 202,
  LEATHER_LEGS: 203,
  LEATHER_BOOTS: 204,
  IRON_HELMET: 205,
  IRON_CHEST: 206,
  IRON_LEGS: 207,
  IRON_BOOTS: 208,
  GOLD_HELMET: 209,
  GOLD_CHEST: 210,
  GOLD_LEGS: 211,
  GOLD_BOOTS: 212,
  DIAMOND_HELMET: 213,
  DIAMOND_CHEST: 214,
  DIAMOND_LEGS: 215,
  DIAMOND_BOOTS: 216,
  SHIELD: 217,
  REDSTONE: 230,
  QUARTZ: 231,
  SLIME_BALL: 232,
  NETHER_BRICK_ITEM: 233,
  ENDER_PEARL: 234,
  BLAZE_ROD: 235,
  GHAST_TEAR: 236,
  MAGMA_CREAM: 237,
  HONEYCOMB: 238,
  NETHER_WART: 239,
  GLOWSTONE_DUST: 240,
  // 2.3 „Wyprawa i ratunek” – wędkarstwo, obserwacja i ratunek
  FISHING_ROD: 242,
  RAW_FISH: 243,
  COOKED_FISH: 244,
  RAW_SALMON: 245,
  COOKED_SALMON: 246,
  SPYGLASS: 247,
  TOTEM: 248,
  // 2.4 „Godzina alchemika” – item ids 341–351; block ids 400+ are reserved for 3.0 biomes.
  SUGAR: 341,
  BOTTLE: 342,
  WATER_BOTTLE: 343,
  HONEY_BOTTLE: 344,
  POTION_AWKWARD: 345,
  POTION_HEAL: 346,
  POTION_FIRE: 347,
  POTION_SPEED: 348,
  POTION_NIGHT: 349,
  POTION_STRENGTH: 350,
  POTION_REGEN: 351,
} as const;

export type ToolKind = 'pick' | 'axe' | 'shovel' | 'sword' | 'hoe' | 'shears' | 'igniter' | 'bow' | 'shield' | 'rod' | 'spyglass';

/** 2.4: effect a potion applies when drunk ('none' = base awkward brew). */
export type PotionEffectId = 'none' | 'heal' | 'fire' | 'speed' | 'night' | 'strength' | 'regen';

export interface ItemDef {
  id: number;
  name: string;
  /** Short aliases accepted by /give (Polish, without diacritics, and English). */
  keys: string[];
  kind: 'material' | 'tool' | 'food' | 'bucket' | 'armor' | 'potion';
  tool?: ToolKind;
  tier?: 1 | 2 | 3 | 4;
  durability?: number;
  hunger?: number;
  heal?: number;
  /** Armor metadata: which slot it occupies and how many armor points it adds. */
  armor?: { slot: 0 | 1 | 2 | 3; points: number };
  /** 2.4: which buff the bottle carries (brewing.ts holds durations/values). */
  potion?: PotionEffectId;
  /** Flat color used by drop entities and the icon painter. */
  color: string;
  /** Stack size override (1 = never merges, e.g. totems). */
  stack?: number;
}

/** 2.21: trwałość 1:1 z wanilią – drewno 59, kamień 131, żelazo 250, diament 1561. */
const DUR = [0, 59, 131, 250, 1561];

function tool(
  id: number,
  name: string,
  keys: string[],
  kind: ToolKind,
  tier: 1 | 2 | 3 | 4,
  color: string
): ItemDef {
  return { id, name, keys, kind: 'tool', tool: kind, tier, durability: DUR[tier], color };
}

const WOOD = '#c49a62';
const STONE = '#9a9a9a';
const IRON = '#d8d8d8';
const GEM = '#3ee0d0';

export const ITEM_LIST: ItemDef[] = [
  { id: I.STICK, name: 'Patyk', keys: ['patyk', 'stick'], kind: 'material', color: '#b5834a' },
  { id: I.COAL, name: 'Węgiel', keys: ['wegiel', 'węgiel', 'coal'], kind: 'material', color: '#2a2a2a' },
  { id: I.IRON, name: 'Sztabka żelaza', keys: ['zelazo', 'żelazo', 'iron'], kind: 'material', color: IRON },
  { id: I.GOLD, name: 'Sztabka złota', keys: ['zloto', 'złoto', 'gold'], kind: 'material', color: '#f6d34a' },
  { id: I.DIAMOND, name: 'Diament', keys: ['diament', 'diamond'], kind: 'material', color: GEM },
  { id: I.GUNPOWDER, name: 'Proch', keys: ['proch', 'gunpowder'], kind: 'material', color: '#6d6d72' },
  { id: I.SEEDS, name: 'Nasiona pszenicy', keys: ['nasiona', 'seeds'], kind: 'material', color: '#6ea84a' },
  { id: I.WHEAT, name: 'Pszenica', keys: ['pszenica', 'wheat'], kind: 'material', color: '#e2c04a' },
  { id: I.APPLE, name: 'Jabłko', keys: ['jablko', 'jabłko', 'apple'], kind: 'food', hunger: 4, heal: 1, color: '#d4372a' },
  { id: I.BREAD, name: 'Chleb', keys: ['chleb', 'bread'], kind: 'food', hunger: 5, heal: 1, color: '#d7a15a' },
  { id: I.RAW_PORK, name: 'Surowa wieprzowina', keys: ['wieprzowina', 'pork'], kind: 'food', hunger: 3, color: '#e08a8a' },
  { id: I.COOKED_PORK, name: 'Pieczona wieprzowina', keys: ['pieczona_wieprzowina', 'cooked_pork'], kind: 'food', hunger: 8, heal: 2, color: '#c46a45' },
  { id: I.RAW_BEEF, name: 'Surowa wołowina', keys: ['wolowina', 'wołowina', 'beef'], kind: 'food', hunger: 3, color: '#c45a5a' },
  { id: I.COOKED_BEEF, name: 'Stek', keys: ['stek', 'steak'], kind: 'food', hunger: 8, heal: 2, color: '#8a4030' },
  { id: I.RAW_CHICKEN, name: 'Surowy kurczak', keys: ['kurczak', 'chicken'], kind: 'food', hunger: 2, color: '#f0c9b0' },
  { id: I.COOKED_CHICKEN, name: 'Pieczony kurczak', keys: ['pieczony_kurczak', 'cooked_chicken'], kind: 'food', hunger: 6, heal: 1, color: '#e0a060' },
  { id: I.BUCKET, name: 'Wiadro', keys: ['wiadro', 'bucket'], kind: 'bucket', color: '#8e8e92' },
  { id: I.WATER_BUCKET, name: 'Wiadro wody', keys: ['wiadro_wody', 'water_bucket'], kind: 'bucket', color: '#3a6ad4' },
  { id: I.LAVA_BUCKET, name: 'Wiadro lawy', keys: ['wiadro_lawy', 'lava_bucket'], kind: 'bucket', color: '#e07020' },
  tool(I.WOOD_PICK, 'Drewniany kilof', ['drewniany_kilof', 'wood_pick'], 'pick', 1, WOOD),
  tool(I.STONE_PICK, 'Kamienny kilof', ['kamienny_kilof', 'stone_pick'], 'pick', 2, STONE),
  tool(I.IRON_PICK, 'Żelazny kilof', ['zelazny_kilof', 'iron_pick'], 'pick', 3, IRON),
  tool(I.DIAMOND_PICK, 'Diamentowy kilof', ['diamentowy_kilof', 'diamond_pick'], 'pick', 4, GEM),
  tool(I.WOOD_AXE, 'Drewniana siekiera', ['drewniana_siekiera', 'wood_axe'], 'axe', 1, WOOD),
  tool(I.STONE_AXE, 'Kamienna siekiera', ['kamienna_siekiera', 'stone_axe'], 'axe', 2, STONE),
  tool(I.IRON_AXE, 'Żelazna siekiera', ['zelazna_siekiera', 'iron_axe'], 'axe', 3, IRON),
  tool(I.DIAMOND_AXE, 'Diamentowa siekiera', ['diamentowa_siekiera', 'diamond_axe'], 'axe', 4, GEM),
  tool(I.WOOD_SHOVEL, 'Drewniana łopata', ['drewniana_lopata', 'wood_shovel'], 'shovel', 1, WOOD),
  tool(I.STONE_SHOVEL, 'Kamienna łopata', ['kamienna_lopata', 'stone_shovel'], 'shovel', 2, STONE),
  tool(I.IRON_SHOVEL, 'Żelazna łopata', ['zelazna_lopata', 'iron_shovel'], 'shovel', 3, IRON),
  tool(I.DIAMOND_SHOVEL, 'Diamentowa łopata', ['diamentowa_lopata', 'diamond_shovel'], 'shovel', 4, GEM),
  tool(I.WOOD_SWORD, 'Drewniany miecz', ['drewniany_miecz', 'wood_sword'], 'sword', 1, WOOD),
  tool(I.STONE_SWORD, 'Kamienny miecz', ['kamienny_miecz', 'stone_sword'], 'sword', 2, STONE),
  tool(I.IRON_SWORD, 'Żelazny miecz', ['zelazny_miecz', 'iron_sword'], 'sword', 3, IRON),
  tool(I.DIAMOND_SWORD, 'Diamentowy miecz', ['diamentowy_miecz', 'diamond_sword'], 'sword', 4, GEM),
  tool(I.WOOD_HOE, 'Drewniana motyka', ['drewniana_motyka', 'wood_hoe'], 'hoe', 1, WOOD),
  tool(I.STONE_HOE, 'Kamienna motyka', ['kamienna_motyka', 'stone_hoe'], 'hoe', 2, STONE),
  tool(I.IRON_HOE, 'Żelazna motyka', ['zelazna_motyka', 'iron_hoe'], 'hoe', 3, IRON),
  tool(I.DIAMOND_HOE, 'Diamentowa motyka', ['diamentowa_motyka', 'diamond_hoe'], 'hoe', 4, GEM),
  { id: I.FLINT, name: 'Krzemień', keys: ['krzemien', 'krzemień', 'flint'], kind: 'material', color: '#6a6a72' },
  { id: I.SHEARS, name: 'Nożyce', keys: ['nozyce', 'nożyce', 'shears'], kind: 'tool', tool: 'shears', durability: 238, color: '#d8d8e0' },
  { id: I.FLINT_STEEL, name: 'Krzesiwo', keys: ['krzesiwo', 'flint_and_steel', 'zapalniczka'], kind: 'tool', tool: 'igniter', durability: 64, color: '#c8c8d0' },
  { id: I.COMPASS, name: 'Kompas', keys: ['kompas', 'compass'], kind: 'material', color: '#c44848' },
  { id: I.CLOCK, name: 'Zegar', keys: ['zegar', 'clock'], kind: 'material', color: '#e2c14a' },
  { id: I.STRING, name: 'Struna', keys: ['struna', 'string'], kind: 'material', color: '#e8e8ea' },
  { id: I.BONE, name: 'Kość', keys: ['kosc', 'kość', 'bone'], kind: 'material', color: '#efe9d8' },
  { id: I.FEATHER, name: 'Pióro', keys: ['pioro', 'piórko', 'feather'], kind: 'material', color: '#f2f2f0' },
  { id: I.ARROW, name: 'Strzała', keys: ['strzala', 'strzała', 'arrow'], kind: 'material', color: '#c8b08a' },
  { id: I.BOW, name: 'Łuk', keys: ['luk', 'łuk', 'bow'], kind: 'tool', tool: 'bow', durability: 384, color: '#8a5a2b' },
  { id: I.LAPIS, name: 'Lazuryt', keys: ['lazuryt', 'lapis', 'lapis_lazuli'], kind: 'material', color: '#3a5fd0' },
  { id: I.PAPER, name: 'Papier', keys: ['papier', 'paper'], kind: 'material', color: '#f2f2ee' },
  { id: I.BOOK, name: 'Książka', keys: ['ksiazka', 'książka', 'book'], kind: 'material', color: '#9a4a3a' },
  { id: I.EMERALD, name: 'Szmaragd', keys: ['szmaragd', 'emerald'], kind: 'material', color: '#2ed06a' },
  { id: I.LEATHER, name: 'Skóra', keys: ['skora', 'skóra', 'leather'], kind: 'material', color: '#8a5a3b' },
  { id: I.SHIELD, name: 'Tarcza', keys: ['tarcza', 'shield'], kind: 'tool', tool: 'shield', durability: 336, color: '#8a6a3a' },
  { id: I.REDSTONE, name: 'Czerwony proszek', keys: ['redstone', 'czerwony_proszek', 'redstone_dust'], kind: 'material', color: '#c42a2a' },
  { id: I.QUARTZ, name: 'Kwarc', keys: ['kwarc', 'quartz'], kind: 'material', color: '#e8e0d0' },
  { id: I.SLIME_BALL, name: 'Kula szlamu', keys: ['slime', 'kula_szlamu', 'slime_ball'], kind: 'material', color: '#7ac47a' },
  { id: I.NETHER_BRICK_ITEM, name: 'Netherowa cegła', keys: ['nether_brick', 'netherowa_cegla'], kind: 'material', color: '#4a1a1a' },
  { id: I.ENDER_PEARL, name: 'Perła Endu', keys: ['perla_endu', 'ender_pearl', 'perla'], kind: 'material', color: '#3a8a7a' },
  { id: I.BLAZE_ROD, name: 'Płomienna różdżka', keys: ['blaze_rod', 'plomienna_rozdzka'], kind: 'material', color: '#e8a020' },
  { id: I.GHAST_TEAR, name: 'Łza Ghasta', keys: ['ghast_tear', 'lza_ghasta'], kind: 'material', color: '#f0f0f0' },
  { id: I.MAGMA_CREAM, name: 'Magmowy krem', keys: ['magma_cream', 'magmowy_krem'], kind: 'material', color: '#c85a2a' },
  { id: I.HONEYCOMB, name: 'Plaster miodu', keys: ['plaster_miodu', 'honeycomb'], kind: 'material', color: '#e8b040' },
  { id: I.NETHER_WART, name: 'Brodawka Netheru', keys: ['nether_wart', 'brodawka'], kind: 'material', color: '#8a2020' },
  { id: I.GLOWSTONE_DUST, name: 'Jasnogłazowy pył', keys: ['glowstone_dust', 'jasnoglazowy_pyl'], kind: 'material', color: '#e8c85a' },
  // 2.3 „Wyprawa i ratunek”
  { id: I.FISHING_ROD, name: 'Wędka', keys: ['wedka', 'fishing_rod'], kind: 'tool', tool: 'rod', durability: 64, color: '#9a6a34' },
  { id: I.RAW_FISH, name: 'Surowa ryba', keys: ['surowa_ryba', 'ryba', 'raw_fish', 'cod'], kind: 'food', hunger: 2, color: '#c9ab84' },
  { id: I.COOKED_FISH, name: 'Pieczona ryba', keys: ['pieczona_ryba', 'cooked_fish'], kind: 'food', hunger: 5, heal: 1, color: '#d29a58' },
  { id: I.RAW_SALMON, name: 'Surowy łosoś', keys: ['surowy_losos', 'losos', 'raw_salmon', 'salmon'], kind: 'food', hunger: 2, color: '#e08a6a' },
  { id: I.COOKED_SALMON, name: 'Pieczony łosoś', keys: ['pieczony_losos', 'cooked_salmon'], kind: 'food', hunger: 6, heal: 2, color: '#e0703a' },
  { id: I.SPYGLASS, name: 'Lorneta', keys: ['lorneta', 'spyglass'], kind: 'tool', tool: 'spyglass', color: '#c8a43c' },
  { id: I.TOTEM, name: 'Totem Ratowania', keys: ['totem', 'totem_ratowania', 'totem_ratownictwa'], kind: 'material', stack: 1, color: '#e8c85a' },
  // 2.4 „Godzina alchemika” – cukier, fiolki i napoje
  { id: I.SUGAR, name: 'Cukier', keys: ['cukier', 'sugar'], kind: 'material', color: '#f6f4ee' },
  { id: I.BOTTLE, name: 'Szklana fiolka', keys: ['fiolka', 'szklana_fiolka', 'bottle', 'glass_bottle'], kind: 'material', color: '#bfe4f2' },
  { id: I.WATER_BOTTLE, name: 'Fiolka z wodą', keys: ['fiolka_z_woda', 'water_bottle', 'woda_fiolka'], kind: 'material', color: '#4a8ae0' },
  { id: I.HONEY_BOTTLE, name: 'Butelka miodu', keys: ['butelka_miodu', 'honey_bottle', 'miodek'], kind: 'food', hunger: 6, heal: 1, color: '#e8a020' },
  { id: I.POTION_AWKWARD, name: 'Zaczarowany napój', keys: ['zaczarowany_napoj', 'potion_awkward', 'awkward'], kind: 'potion', potion: 'none', color: '#c8b8a8' },
  { id: I.POTION_HEAL, name: 'Napój leczący', keys: ['napoj_leczacy', 'potion_heal', 'healing'], kind: 'potion', potion: 'heal', color: '#d44a5a' },
  { id: I.POTION_FIRE, name: 'Napój ognioodporności', keys: ['napoj_ognioodpornosci', 'potion_fire', 'fire_resistance'], kind: 'potion', potion: 'fire', color: '#e07820' },
  { id: I.POTION_SPEED, name: 'Napój szybkości', keys: ['napoj_szybkosci', 'potion_speed', 'swiftness'], kind: 'potion', potion: 'speed', color: '#b8e04a' },
  { id: I.POTION_NIGHT, name: 'Napój nocnego widzenia', keys: ['napoj_nocnego_widzenia', 'potion_night', 'night_vision'], kind: 'potion', potion: 'night', color: '#4ad0a8' },
  { id: I.POTION_STRENGTH, name: 'Napój siły', keys: ['napoj_sily', 'potion_strength', 'sila'], kind: 'potion', potion: 'strength', color: '#e0a030' },
  { id: I.POTION_REGEN, name: 'Napój regeneracji', keys: ['napoj_regeneracji', 'potion_regen', 'regeneration'], kind: 'potion', potion: 'regen', color: '#e06090' },
];

const ARMOR_TIERS: {
  prefix: string; keys: [string, string]; color: string;
  points: [number, number, number, number]; // head, chest, legs, feet
  durability: [number, number, number, number];
  names: [string, string, string, string];
}[] = [
  {
    prefix: 'skorzany', keys: ['skorzany', 'leather'], color: '#8a5a3b',
    points: [1, 3, 2, 1], durability: [55, 80, 75, 55],
    names: ['Skórzany kaptur', 'Skórzany napierśnik', 'Skórzane nogawice', 'Skórzane buty'],
  },
  {
    prefix: 'zelazny', keys: ['zelazny', 'iron'], color: '#d8d8d8',
    points: [2, 6, 5, 2], durability: [165, 240, 225, 195],
    names: ['Żelazny kaptur', 'Żelazny napierśnik', 'Żelazne nogawice', 'Żelazne buty'],
  },
  {
    prefix: 'zloty', keys: ['zloty', 'gold'], color: '#f6d34a',
    points: [2, 5, 3, 1], durability: [77, 112, 105, 91],
    names: ['Złoty kaptur', 'Złoty napierśnik', 'Złote nogawice', 'Złote buty'],
  },
  {
    prefix: 'diamontowy', keys: ['diamontowy', 'diamond'], color: '#3ee0d0',
    points: [3, 8, 6, 3], durability: [363, 528, 495, 429],
    names: ['Diamentowy kaptur', 'Diamentowy napierśnik', 'Diamentowe nogawice', 'Diamentowe buty'],
  },
];

const SLOT_KEYS = [
  ['kaptur', 'helmet'],
  ['napiersnik', 'chestplate', 'chest'],
  ['nogawice', 'leggings', 'legs'],
  ['buty', 'boots'],
];
const SLOT_ORDER: (0 | 1 | 2 | 3)[] = [0, 1, 2, 3];

const armorItems: ItemDef[] = [];
ARMOR_TIERS.forEach((tier, ti) => {
  const baseId = [I.LEATHER_HELMET, I.IRON_HELMET, I.GOLD_HELMET, I.DIAMOND_HELMET][ti];
  SLOT_ORDER.forEach((slot, si) => {
    const id = baseId + si;
    const en = SLOT_KEYS[si][1];
    armorItems.push({
      id,
      name: tier.names[si],
      keys: [`${tier.keys[0]}_${SLOT_KEYS[si][0]}`, `${tier.keys[1]}_${en}`],
      kind: 'armor',
      durability: tier.durability[si],
      armor: { slot, points: tier.points[si] },
      color: tier.color,
    });
  });
});
ITEM_LIST.push(...armorItems);

export const ITEMS: (ItemDef | undefined)[] = [];
for (const it of ITEM_LIST) ITEMS[it.id] = it;

const KEYS = new Map<string, number>();
for (const b of BLOCKS) {
  if (!b || b.id === 0) continue;
  KEYS.set(String(b.id), b.id);
  KEYS.set(fold(b.name), b.id);
}
// Items are registered last so their aliases win over same-named blocks
// (e.g. "pszenica" is the wheat item, not the wheat crop block).
for (const it of ITEM_LIST) {
  KEYS.set(String(it.id), it.id);
  for (const k of it.keys) KEYS.set(k, it.id);
}
// A block whose name was shadowed by an item alias stays reachable as "<nazwa>_blok".
for (const b of BLOCKS) {
  if (!b || b.id === 0) continue;
  const n = fold(b.name);
  if (KEYS.get(n) !== b.id && !KEYS.has(n + '_blok')) KEYS.set(n + '_blok', b.id);
}

function fold(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '_');
}

export function itemDef(id: number): ItemDef | undefined {
  return ITEMS[id];
}

export function isItem(id: number): boolean {
  return !!ITEMS[id];
}

export function displayName(id: number): string {
  return ITEMS[id]?.name || BLOCKS[id]?.name || 'Nieznane';
}

export function stackLimit(id: number): number {
  const it = ITEMS[id];
  if (!it) return 64;
  if (it.stack) return it.stack;
  if (it.kind === 'tool' || it.kind === 'armor') return 1;
  // 2.21: wanilia – puste wiadra stackują się do 16, pełne zajmują slot,
  // a każda mikstura to jeden przedmiot.
  if (it.kind === 'potion') return 1;
  if (it.kind === 'bucket') return id === I.BUCKET ? 16 : 1;
  return 64;
}

export function durabilityMax(id: number): number {
  return ITEMS[id]?.durability ?? 0;
}

export const CREATIVE_ITEMS: number[] = ITEM_LIST.map((it) => it.id);

const TIER_SPEED = [0, 2, 4, 6, 8];

const PICK_BLOCKS = new Set<number>([
  B.STONE, B.COBBLE, B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.BRICK, B.FURNACE,
  B.FURNACE_ON, B.OBSIDIAN, B.STONE_BRICKS, B.SANDSTONE, B.MOSSY, B.ICE, B.GLOWSTONE, B.BEDROCK,
  B.IRON_BLOCK, B.GOLD_BLOCK, B.DIAMOND_BLOCK, B.LAPIS_ORE, B.LAPIS_BLOCK, B.ENCHANT,
  B.EMERALD_ORE, B.EMERALD_BLOCK, B.LANTERN, B.BELL,
  B.REDSTONE_ORE, B.REDSTONE_BLOCK, B.REDSTONE_LAMP, B.REDSTONE_LAMP_ON,
  B.NETHERRACK, B.NETHER_BRICKS, B.QUARTZ_ORE, B.QUARTZ_BLOCK, B.QUARTZ_PILLAR,
  B.MAGMA, B.END_STONE, B.END_BRICKS, B.PURPUR_BLOCK, B.PURPUR_PILLAR,
  B.BASALT, B.BLACKSTONE, B.CRYING_OBSIDIAN, B.ANVIL, B.BREWING, B.TARGET,
  B.CONCRETE_WHITE, B.CONCRETE_RED, B.CONCRETE_BLUE, B.CONCRETE_GREEN, B.CONCRETE_YELLOW, B.CONCRETE_BLACK,
  B.TERRACOTTA, B.OBSERVER, B.DISPENSER, B.PISTON, B.STICKY_PISTON, B.NOTE_BLOCK,
  B.OAK_STAIRS_N, B.COBBLE_STAIRS_N, B.BRICK_STAIRS_N, B.STONE_BRICK_STAIRS_N, B.SANDSTONE_STAIRS_N, B.NETHER_BRICK_STAIRS_N, B.QUARTZ_STAIRS_N,
  B.OAK_SLAB, B.STONE_SLAB, B.COBBLE_SLAB, B.BRICK_SLAB, B.SANDSTONE_SLAB, B.NETHER_BRICK_SLAB, B.QUARTZ_SLAB,
]);
const AXE_BLOCKS = new Set<number>([
  B.LOG, B.BIRCH_LOG, B.PLANKS, B.CRAFTING, B.BOOKSHELF, B.PUMPKIN, B.BED, B.CHEST, B.LOOT_CHEST,
  B.HAY, B.CAMPFIRE, B.TRAP, B.FENCE, B.LADDER_N, B.ACACIA_LOG,
]);
const SHOVEL_BLOCKS = new Set<number>([
  B.DIRT, B.GRASS, B.SAND, B.GRAVEL, B.SNOW, B.CLAY, B.FARMLAND, B.PATH, B.SOUL_SAND, B.SOUL_SOIL, B.MUD,
]);
const ORES = new Set<number>([B.COAL_ORE, B.IRON_ORE, B.GOLD_ORE, B.DIAMOND_ORE, B.LAPIS_ORE, B.EMERALD_ORE, B.REDSTONE_ORE, B.QUARTZ_ORE]);

/** Experience orbs dropped when an ore block is mined. 0 = no experience. */
const ORE_XP: Record<number, number> = {
  [B.COAL_ORE]: 2,
  [B.IRON_ORE]: 5,
  [B.GOLD_ORE]: 6,
  [B.DIAMOND_ORE]: 7,
  [B.LAPIS_ORE]: 4,
  [B.REDSTONE_ORE]: 5,
  [B.QUARTZ_ORE]: 2,
  [B.EMERALD_ORE]: 6,
};

export function isOre(id: number): boolean {
  return ORES.has(id);
}

/**
 * Experience an ore block gives when broken. 2.3: redstone, quartz and
 * emerald ore used to drop nothing at all.
 */
export function oreXp(id: number): number {
  return ORE_XP[id] ?? 0;
}

export function pickTier(toolId: number): number {
  const tool = ITEMS[toolId];
  return tool?.tool === 'pick' ? tool.tier ?? 1 : 0;
}

/** 0 = any tool. 1 wood, 2 stone, 3 iron, 4 diamond. */
export function requiredPickTier(blockId: number): number {
  if (blockId === B.OBSIDIAN || blockId === B.CRYING_OBSIDIAN) return 4;
  // 2.21: wanilia – diament i szmaragd wymagają żelaza, złoto też,
  // czerwony kamień żelaza, a kwarc wystarczy drewniany kilof.
  if (blockId === B.DIAMOND_ORE || blockId === B.EMERALD_ORE) return 3;
  if (blockId === B.IRON_ORE) return 2;
  if (blockId === B.GOLD_ORE) return 3;
  if (blockId === B.LAPIS_ORE) return 2;
  if (blockId === B.REDSTONE_ORE) return 3;
  if (blockId === B.QUARTZ_ORE) return 1;
  if (blockId === B.EMERALD_BLOCK) return 2;
  if (blockId === B.GOLD_BLOCK || blockId === B.DIAMOND_BLOCK) return 3;
  if (blockId === B.IRON_BLOCK) return 2;
  if (blockId === B.ANVIL) return 2;
  if (blockId === B.NETHER_BRICKS || blockId === B.BLACKSTONE || blockId === B.BASALT) return 1;
  if (PICK_BLOCKS.has(blockId)) return 1;
  return 0;
}

/** 2.21: czy trzymane narzędzie w ogóle pozwala wydobyć blok (drop). */
export function canHarvest(blockId: number, toolId: number): boolean {
  const need = requiredPickTier(blockId);
  return need === 0 || pickTier(toolId) >= need;
}

export function pickHint(blockId: number, toolId: number): string | null {
  if (pickTier(toolId) >= requiredPickTier(blockId)) return null;
  const need = requiredPickTier(blockId);
  if (need >= 4) return 'Obsydian kruszy tylko diamentowy kilof.';
  if (need >= 3) return 'Ten blok wymaga żelaznego kilofa.';
  if (need >= 2) return 'Ta ruda wymaga co najmniej kamiennego kilofa.';
  if (need >= 1) return 'Do tego bloku potrzebny jest kilof.';
  return null;
}

/** Seconds of holding LMB to break this block with the given tool (0 = hand).
 *  `eff` is the Efficiency level of the held item (update 1.5). */
export function mineSeconds(blockId: number, toolId: number, eff = 0): number {
  const def = BLOCKS[blockId];
  if (!def || def.hardness < 0) return 1e9;
  if (def.hardness === 0) return 0.05;
  const tool = ITEMS[toolId];
  if (tool?.tool === 'shears' && (blockId === B.LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.ACACIA_LEAVES || blockId === B.JUNGLE_LEAVES || blockId === B.TALLGRASS)) return 0.12;
  // 2.21: waniliowa formuła – 1,5 × twardość z właściwym narzędziem,
  // 5 × twardość gołą ręką lub złym narzędziem. Brak wymaganego poziomu
  // kilofa nie blokuje kopania (jak w grze) – tylko spowalnia i nie daje dropu.
  const need = requiredPickTier(blockId);
  const tier = pickTier(toolId);
  const woodish = (id: number) =>
    AXE_BLOCKS.has(id) || isDoor(id) || isLadder(id) || isTrap(id) ||
    id === B.FENCE || id === B.CHEST || id === B.LOOT_CHEST || id === B.CAMPFIRE;
  let correct = false;
  let speed = 1;
  if (PICK_BLOCKS.has(blockId)) {
    correct = tier > 0 && tier >= Math.min(need, 1);
    if (tier > 0) speed = TIER_SPEED[tier];
  } else if (woodish(blockId)) {
    correct = tool?.tool === 'axe';
    if (correct) speed = TIER_SPEED[tool?.tier ?? 1];
  } else if (SHOVEL_BLOCKS.has(blockId)) {
    correct = tool?.tool === 'shovel';
    if (correct) speed = TIER_SPEED[tool?.tier ?? 1];
  } else if (tool?.tool === 'sword' && (RENDER[blockId] === 1 || blockId === B.LEAVES || blockId === B.BIRCH_LEAVES)) {
    // miecz tnie rośliny i liście szybciej – jak w grze
    correct = true;
    speed = 2.5;
  }
  if (need > 0 && tier < need) correct = false;
  if (eff > 0 && correct) speed *= 1 + eff * 0.35 + eff * eff * 0.12;
  let t = (def.hardness * (correct ? 1.5 : 5)) / speed;
  // Obsydian: 9,4 s diamentowym kilofem (twardość 50 w wanilii).
  if ((blockId === B.OBSIDIAN || blockId === B.CRYING_OBSIDIAN) && tier >= 4) t = 9.4;
  return t;
}

export function toolHelps(blockId: number, toolId: number): boolean {
  const tool = ITEMS[toolId];
  if (!tool?.tool) return false;
  if (tool.tool === 'pick') return PICK_BLOCKS.has(blockId);
  if (tool.tool === 'axe') return AXE_BLOCKS.has(blockId) || isDoor(blockId) || isLadder(blockId) || isTrap(blockId) || blockId === B.FENCE || blockId === B.CHEST || blockId === B.LOOT_CHEST || blockId === B.CAMPFIRE;
  if (tool.tool === 'shovel') return SHOVEL_BLOCKS.has(blockId);
  if (tool.tool === 'sword') return RENDER[blockId] === 1 || blockId === B.LEAVES || blockId === B.BIRCH_LEAVES;
  if (tool.tool === 'shears') return blockId === B.LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.TALLGRASS;
  return tool.tool === 'hoe' && (blockId === B.DIRT || blockId === B.GRASS);
}

/** `sharp` is the Sharpness level of the held weapon (update 1.5). */
export function attackDamage(toolId: number, sprinting: boolean, sharp = 0): number {
  const tool = ITEMS[toolId];
  const tier = tool?.tier ?? 1;
  // 2.21: obrażenia 1:1 z wanilią – pięść 1, miecze 4–7, topory 7–9,
  // kilofy 2–5, łopaty 2,5–5,5, motyki i pozostałe narzędzia 1.
  let d = 1;
  if (tool?.tool === 'sword') d = [0, 4, 5, 6, 7][tier];
  else if (tool?.tool === 'axe') d = [0, 7, 9, 9, 9][tier];
  else if (tool?.tool === 'pick') d = [0, 2, 3, 4, 5][tier];
  else if (tool?.tool === 'shovel') d = [0, 2.5, 3.5, 4.5, 5.5][tier];
  if (sharp > 0) d += sharp * 0.5 + 0.5;
  if (sprinting) d += 2;
  return d;
}

export function attackCooldown(toolId: number): number {
  return ITEMS[toolId]?.tool === 'sword' ? 0.42 : 0.5;
}

/** What a broken block yields. Empty array = nothing (wrong tool on ore, leaves that rolled nothing).
 *  `opts.fortune` (Szczęście) multiplies ore/crop yields, `opts.silk`
 *  (Jedwabny dotyk) makes the block drop in its original form. */
export interface DropOpts { fortune?: number; silk?: boolean }
export function blockDrops(blockId: number, toolId: number, opts: DropOpts = {}): Stack[] {
  const tier = pickTier(toolId);
  const shears = ITEMS[toolId]?.tool === 'shears';
  const fortune = Math.max(0, Math.floor(opts.fortune ?? 0));
  // 2.21: wanilia – bez wymaganego poziomu kilofa blok znika bez dropu
  // (kamień gołą ręką, złoto kamiennym kilofem, obsydian bez diamentu).
  if (!canHarvest(blockId, toolId)) return [];
  // Jedwabny dotyk: blok wypada taki, jaki stał (kamień, szkło, ruda, liście…)
  if (opts.silk) {
    if (blockId === B.AIR || BLOCKS[blockId]?.hardness < 0) return [];
    if (RENDER[blockId] === 1 && (blockId < B.CROP0 || blockId > B.CROP3)) {
      // cross plants (flowers, saplings, tall grass, torch) drop as themselves
      return [{ id: blockId, count: 1 }];
    }
    if (blockId === B.COAL_ORE || blockId === B.DIAMOND_ORE || blockId === B.IRON_ORE || blockId === B.GOLD_ORE ||
        blockId === B.LAPIS_ORE || blockId === B.EMERALD_ORE || blockId === B.STONE || blockId === B.GLASS || blockId === B.ICE ||
        blockId === B.LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.ACACIA_LEAVES || blockId === B.JUNGLE_LEAVES || blockId === B.GRASS || blockId === B.SNOW ||
        blockId === B.FARMLAND || (blockId >= B.CROP0 && blockId <= B.CROP3)) {
      return [{ id: blockId, count: 1 }];
    }
    if (BLOCKS[blockId]?.drop >= 0) return [{ id: blockId, count: 1 }];
    return [];
  }
  if (shears && (blockId === B.LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.ACACIA_LEAVES || blockId === B.JUNGLE_LEAVES || blockId === B.TALLGRASS)) return [{ id: blockId, count: 1 }];
  if (blockId === B.GRAVEL) return Math.random() < 0.1 ? [{ id: I.FLINT, count: 1 }] : [{ id: B.GRAVEL, count: 1 }];
  if (blockId === B.COAL_ORE) return tier >= 1 ? [{ id: I.COAL, count: 1 + (fortune ? Math.floor(Math.random() * (fortune + 1)) : 0) }] : [];
  if (blockId === B.DIAMOND_ORE) return tier >= 3 ? [{ id: I.DIAMOND, count: 1 + (fortune ? Math.floor(Math.random() * fortune) : 0) }] : [];
  if (blockId === B.EMERALD_ORE) return tier >= 3 ? [{ id: I.EMERALD, count: 1 + (fortune ? Math.floor(Math.random() * fortune) : 0) }] : [];
  if (blockId === B.LAPIS_ORE) return tier >= 2 ? [{ id: I.LAPIS, count: 4 + Math.floor(Math.random() * 4) + (fortune ? Math.floor(Math.random() * (fortune + 1)) * 2 : 0) }] : [];
  if (blockId === B.REDSTONE_ORE) return tier >= 2 ? [{ id: I.REDSTONE, count: 4 + Math.floor(Math.random() * 2) + (fortune ? Math.floor(Math.random() * (fortune + 1)) : 0) }] : [];
  if (blockId === B.QUARTZ_ORE) return tier >= 2 ? [{ id: I.QUARTZ, count: 1 + (fortune ? Math.floor(Math.random() * fortune) : 0) }] : [];
  if (blockId === B.GLOWSTONE) return [{ id: I.GLOWSTONE_DUST, count: 2 + Math.floor(Math.random() * 3) + (fortune ? Math.floor(Math.random() * (fortune + 1)) : 0) }];
  if (blockId === B.SLIME_BLOCK) return [{ id: I.SLIME_BALL, count: 1 }];
  if (blockId === B.HONEY_BLOCK) return [{ id: B.HONEY_BLOCK, count: 1 }];
  if (blockId === B.HONEYCOMB_BLOCK) return [{ id: I.HONEYCOMB, count: 4 }];
  if (blockId === B.IRON_ORE || blockId === B.GOLD_ORE) return tier >= 2 ? [{ id: blockId, count: 1 }] : [];
  // płyty: górna dropuje dolną
  if (blockId === B.OAK_SLAB_TOP || blockId === B.STONE_SLAB_TOP || blockId === B.COBBLE_SLAB_TOP || blockId === B.BRICK_SLAB_TOP || blockId === B.SANDSTONE_SLAB_TOP || blockId === B.NETHER_BRICK_SLAB_TOP || blockId === B.QUARTZ_SLAB_TOP) {
    const base = BLOCKS[blockId]?.drop;
    return base ? [{ id: base, count: 1 }] : [];
  }
  // schody dropują siebie
  if (blockId >= B.OAK_STAIRS_N && blockId <= B.QUARTZ_STAIRS_W) return [{ id: blockId, count: 1 }];
  // 2.21: szanse jak w wanilii – 5% sadzonki (dąb), 0,5% jabłka, 12,5% nasion
  // z trawy. Wcześniej sadzonki wypadały dwa razy częściej, a blok trawy
  // dawał nasiona, których w grze nie ma.
  if (blockId === B.LEAVES) {
    const out: Stack[] = [];
    if (Math.random() < 0.05) out.push({ id: B.SAPLING, count: 1 });
    if (Math.random() < 0.005) out.push({ id: I.APPLE, count: 1 });
    return out;
  }
  if (blockId === B.BIRCH_LEAVES) return Math.random() < 0.05 ? [{ id: B.BIRCH_SAPLING, count: 1 }] : [];
  if (blockId === B.ACACIA_LEAVES) return Math.random() < 0.05 ? [{ id: B.SAPLING, count: 1 }] : [];
  if (blockId === B.JUNGLE_LEAVES) return Math.random() < 0.025 ? [{ id: B.SAPLING, count: 1 }] : [];
  if (blockId === B.TALLGRASS) return Math.random() < 0.125 ? [{ id: I.SEEDS, count: 1 }] : [];
  if (blockId === B.GRASS) return [{ id: B.DIRT, count: 1 }];
  if (blockId === B.CROP0 || blockId === B.CROP1 || blockId === B.CROP2) return [{ id: I.SEEDS, count: 1 }];
  if (blockId === B.CROP3) {
    // wanilia: 1 pszenica i 0–3 nasiona (Szczęście dokłada po jednym z obu)
    const extra = fortune ? Math.floor(Math.random() * (fortune + 1)) : 0;
    return [
      { id: I.WHEAT, count: 1 + extra },
      { id: I.SEEDS, count: Math.floor(Math.random() * 4) + extra },
    ];
  }
  if (blockId === B.BOOKSHELF) return [{ id: I.BOOK, count: 3 }];
  if (blockId === B.SNOW) return [{ id: B.SNOW, count: 1 }];
  if (blockId === B.FURNACE_ON) return [{ id: B.FURNACE, count: 1 }];
  const def = BLOCKS[blockId];
  if (!def || def.drop < 0) return [];
  return [{ id: def.drop, count: 1 }];
}

export function smeltResult(id: number): number | null {
  switch (id) {
    case B.IRON_ORE:
      return I.IRON;
    case B.GOLD_ORE:
      return I.GOLD;
    case B.SAND:
      return B.GLASS;
    case B.COBBLE:
      return B.STONE;
    case B.CLAY:
      return B.BRICK;
    case B.COAL_ORE:
      return I.COAL;
    case B.NETHERRACK:
      return I.NETHER_BRICK_ITEM;
    case B.QUARTZ_ORE:
      return I.QUARTZ;
    case B.COBBLE_STAIRS_N:
      return B.STONE;
    case B.LOG:
    case B.BIRCH_LOG:
      return I.COAL;
    case I.RAW_PORK:
      return I.COOKED_PORK;
    case I.RAW_BEEF:
      return I.COOKED_BEEF;
    case I.RAW_CHICKEN:
      return I.COOKED_CHICKEN;
    case I.RAW_FISH:
      return I.COOKED_FISH;
    case I.RAW_SALMON:
      return I.COOKED_SALMON;
    case B.SOUL_SAND:
      return B.SOUL_SOIL;
    default:
      return null;
  }
}

/** Seconds of burn time one item of fuel provides. 0 = not fuel. */
export function fuelSeconds(id: number): number {
  if (id === I.COAL || id === B.COAL_ORE) return 32;
  if (id === I.BLAZE_ROD) return 60;
  if (id === B.PLANKS || id === B.LOG || id === B.BIRCH_LOG || id === B.CRAFTING || id === B.BOOKSHELF || id === B.CHEST || id === B.FENCE || id === B.TRAP || id === B.CAMPFIRE || isDoor(id)) return 6;
  if (id === I.STICK || id === B.SAPLING || id === B.BIRCH_SAPLING || isLadder(id)) return 2;
  if (id === B.HAY) return 6;
  if (id >= B.WOOL_WHITE && id <= B.WOOL_BLACK) return 3;
  if (id >= B.WOOL_ORANGE && id <= B.WOOL_BROWN) return 3;
  const it = ITEMS[id];
  if (it?.tool && it.tier === 1) return 4;
  return 0;
}

export function resolveId(arg: string): number | null {
  const q = fold(arg.trim());
  if (!q) return null;
  if (KEYS.has(q)) return KEYS.get(q)!;
  const n = parseInt(arg, 10);
  if (!Number.isNaN(n) && (BLOCKS[n] || ITEMS[n])) return n;
  return null;
}

export function isFood(id: number): boolean {
  return ITEMS[id]?.kind === 'food';
}

/** 2.4: a drinkable bottle (potion or the base awkward brew). */
export function isPotion(id: number): boolean {
  return ITEMS[id]?.kind === 'potion';
}

export function isHoe(id: number): boolean {
  return ITEMS[id]?.tool === 'hoe';
}
