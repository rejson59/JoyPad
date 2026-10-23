/**
 * Handel z mieszkańcami (update 1.6).
 *
 * Każdy wieśniak ma zawód, pulę ofert i limit wymian – dokładnie jak
 * w klasyku. Po wyczerpaniu zapasów trzeba poczekać, aż towar „się uzupełni”,
 * a każde udane targowanie daje wieśniakowi punkty i odblokowuje kolejne
 * oferty (poziom 2, 3 i mistrzowski 4).
 */
import { B } from './blocks';
import { I } from './items';

export interface TradeStack {
  id: number;
  count: number;
}

export interface TradeOffer {
  key: string;
  /** Minimalny poziom mieszkańca, na którym oferta się pojawia. */
  level: 1 | 2 | 3 | 4;
  /** Ile gracz oddaje (jedna lub dwie kupki). */
  give: TradeStack[];
  /** Co dostaje w zamian. */
  get: TradeStack;
  /** Ile razy można wymienić przed uzupełnieniem zapasów. */
  uses: number;
  /** Doświadczenie mieszkańca za jedną wymianę. */
  xp: number;
}

export interface Profession {
  id: string;
  name: string;
  /** Kolor ubrania mieszkańca. */
  color: string;
  offers: TradeOffer[];
}

export const VILLAGER_LEVEL_XP = [0, 6, 18, 40];
export const VILLAGER_LEVEL_NAMES = ['Uczeń', 'Czeladnik', 'Mistrz', 'Arcymistrz'];
/** Ile sekund trzeba poczekać na uzupełnienie zapasów. */
export const RESTOCK_SECONDS = 150;

const offer = (
  key: string,
  level: 1 | 2 | 3 | 4,
  give: TradeStack[],
  get: TradeStack,
  uses: number,
  xp: number
): TradeOffer => ({ key, level, give, get, uses, xp });

export const PROFESSIONS: Profession[] = [
  {
    id: 'rolnik',
    name: 'Rolnik',
    color: '#4f8a3a',
    offers: [
      offer('wheat', 1, [{ id: I.WHEAT, count: 20 }], { id: I.EMERALD, count: 1 }, 16, 2),
      offer('bread', 1, [{ id: I.EMERALD, count: 1 }], { id: I.BREAD, count: 4 }, 12, 1),
      offer('seeds', 1, [{ id: I.EMERALD, count: 1 }], { id: I.SEEDS, count: 8 }, 12, 1),
      offer('apple', 2, [{ id: I.EMERALD, count: 2 }], { id: I.APPLE, count: 6 }, 12, 2),
      offer('hay', 3, [{ id: I.EMERALD, count: 4 }], { id: B.HAY, count: 3 }, 8, 3),
    ],
  },
  {
    id: 'kowal',
    name: 'Kowal',
    color: '#6f6f78',
    offers: [
      offer('coal', 1, [{ id: I.COAL, count: 15 }], { id: I.EMERALD, count: 1 }, 16, 2),
      offer('iron', 1, [{ id: I.EMERALD, count: 1 }], { id: I.IRON, count: 3 }, 12, 1),
      offer('pick', 2, [{ id: I.EMERALD, count: 3 }], { id: I.IRON_PICK, count: 1 }, 8, 2),
      offer('helmet', 3, [{ id: I.EMERALD, count: 5 }], { id: I.IRON_HELMET, count: 1 }, 4, 3),
      offer('diamond', 4, [{ id: I.EMERALD, count: 6 }], { id: I.DIAMOND, count: 1 }, 3, 5),
    ],
  },
  {
    id: 'bibliotekarz',
    name: 'Bibliotekarz',
    color: '#c9a0ff',
    offers: [
      offer('paper', 1, [{ id: I.PAPER, count: 12 }], { id: I.EMERALD, count: 1 }, 16, 2),
      offer('book', 1, [{ id: I.EMERALD, count: 1 }], { id: I.BOOK, count: 1 }, 12, 1),
      offer('lapis', 2, [{ id: I.EMERALD, count: 3 }], { id: I.LAPIS, count: 6 }, 8, 2),
      offer('glowstone', 3, [{ id: I.EMERALD, count: 5 }], { id: B.GLOWSTONE, count: 2 }, 6, 3),
      offer('shelf', 4, [{ id: I.EMERALD, count: 4 }], { id: B.BOOKSHELF, count: 2 }, 4, 4),
    ],
  },
  {
    id: 'pasterz',
    name: 'Pasterz',
    color: '#e8e8ea',
    offers: [
      offer('wool', 1, [{ id: B.WOOL_WHITE, count: 8 }], { id: I.EMERALD, count: 1 }, 16, 2),
      offer('wool_out', 1, [{ id: I.EMERALD, count: 1 }], { id: B.WOOL_WHITE, count: 4 }, 12, 1),
      offer('arrows', 2, [{ id: I.EMERALD, count: 2 }], { id: I.ARROW, count: 12 }, 10, 2),
      offer('shears', 2, [{ id: I.EMERALD, count: 3 }], { id: I.SHEARS, count: 1 }, 4, 2),
      offer('leash', 3, [{ id: I.EMERALD, count: 3 }], { id: I.LEATHER, count: 4 }, 8, 2),
    ],
  },
  {
    id: 'budowniczy',
    name: 'Budowniczy',
    color: '#b5834a',
    offers: [
      offer('cobble', 1, [{ id: B.COBBLE, count: 24 }], { id: I.EMERALD, count: 1 }, 16, 2),
      offer('planks', 1, [{ id: I.EMERALD, count: 1 }], { id: B.PLANKS, count: 10 }, 12, 1),
      offer('glass', 2, [{ id: I.EMERALD, count: 2 }], { id: B.GLASS, count: 6 }, 8, 2),
      offer('chest', 2, [{ id: I.EMERALD, count: 2 }], { id: B.CHEST, count: 1 }, 8, 2),
      offer('bricks', 3, [{ id: I.EMERALD, count: 4 }], { id: B.STONE_BRICKS, count: 8 }, 6, 3),
      offer('bell', 4, [{ id: I.EMERALD, count: 6 }], { id: B.BELL, count: 1 }, 2, 5),
    ],
  },
];

export interface VillagerState {
  profession: number;
  xp: number;
  /** Ile razy daną ofertę już wykorzystano. */
  used: Record<string, number>;
  /** Czas (w sekundach), po którym zapasy wrócą. */
  restockAt: number;
}

/** Minimalny interfejs ekwipunku – pozwala testować handel bez silnika. */
export interface TradeCarrier {
  countOf(id: number, count?: number): number;
  remove(id: number, count: number): void;
  canAddAfterRemoving(id: number, count: number, removals: TradeStack[]): boolean;
  add(id: number, count: number, dur?: number, ench?: Record<string, number>, name?: string): boolean;
}

export function professionFor(roll: number): number {
  const n = PROFESSIONS.length;
  return Math.max(0, Math.min(n - 1, Math.floor(roll * n)));
}

export function createVillagerState(profession: number, now: number): VillagerState {
  return { profession: ((profession % PROFESSIONS.length) + PROFESSIONS.length) % PROFESSIONS.length, xp: 0, used: {}, restockAt: now + RESTOCK_SECONDS };
}

export function villagerLevel(state: VillagerState): number {
  let level = 1;
  for (let i = 0; i < VILLAGER_LEVEL_XP.length; i++) if (state.xp >= VILLAGER_LEVEL_XP[i]) level = i + 1;
  return level;
}

export function professionOf(state: VillagerState): Profession {
  return PROFESSIONS[state.profession] ?? PROFESSIONS[0];
}

/** Oferty dostępne na aktualnym poziomie mieszkańca. */
export function offersFor(state: VillagerState): TradeOffer[] {
  const level = villagerLevel(state);
  return professionOf(state).offers.filter((o) => o.level <= level);
}

export function usesLeft(state: VillagerState, o: TradeOffer): number {
  return Math.max(0, o.uses - (state.used[o.key] ?? 0));
}

export type TradeBlock = 'ok' | 'uses' | 'items' | 'space';

/** Czy wymiana jest możliwa? `items` = brak towaru, `space` = brak miejsca na zapłatę. */
export function canTrade(state: VillagerState, inv: TradeCarrier, o: TradeOffer): TradeBlock {
  if (usesLeft(state, o) <= 0) return 'uses';
  for (const g of o.give) if (inv.countOf(g.id) < g.count) return 'items';
  if (!inv.canAddAfterRemoving(o.get.id, o.get.count, o.give)) return 'space';
  return 'ok';
}

/**
 * Wykonuje wymianę: zabiera towar, dodaje zapłatę, dolicza punkty mieszkańca.
 * Zwraca false, gdy warunki nie są spełnione (nic wtedy nie zmienia).
 */
export function applyTrade(state: VillagerState, inv: TradeCarrier, o: TradeOffer): boolean {
  if (canTrade(state, inv, o) !== 'ok') return false;
  for (const g of o.give) inv.remove(g.id, g.count);
  inv.add(o.get.id, o.get.count);
  state.used[o.key] = (state.used[o.key] ?? 0) + 1;
  state.xp += o.xp;
  return true;
}

/** Uzupełnia zapasy, jeśli minął czas oczekiwania. Zwraca true, gdy coś się zmieniło. */
export function restockIfDue(state: VillagerState, now: number): boolean {
  if (now < state.restockAt) return false;
  const missing = Object.values(state.used).some((n) => n > 0);
  state.used = {};
  state.restockAt = now + RESTOCK_SECONDS;
  return missing;
}

export function restockIn(state: VillagerState, now: number): number {
  return Math.max(0, state.restockAt - now);
}

/** „Rolnik (Czeladnik)” – nazwa z poziomem, używana w UI i podpowiedziach. */
export function villagerTitle(state: VillagerState): string {
  const p = professionOf(state);
  const level = villagerLevel(state);
  return level <= 1 ? p.name : `${p.name} (${VILLAGER_LEVEL_NAMES[level - 1]})`;
}

/** Postęp mieszkańca do następnego poziomu (0–1). */
export function villagerProgress(state: VillagerState): number {
  const level = villagerLevel(state);
  if (level >= VILLAGER_LEVEL_XP.length) return 1;
  const lo = VILLAGER_LEVEL_XP[level - 1];
  const hi = VILLAGER_LEVEL_XP[level];
  return Math.max(0, Math.min(1, (state.xp - lo) / (hi - lo)));
}
