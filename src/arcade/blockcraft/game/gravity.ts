/**
 * BlockCraft 2.25 – fizyka spadających bloków.
 *
 * W Minecrafcie piasek, żwir i inne „sypkie” bloki nie wiszą w powietrzu:
 * gdy zniknie podparcie, zamieniają się w `FallingBlockEntity`, lecą z
 * przyspieszeniem i osiadają na pierwszym twardym bloku. Tutaj trzymamy
 * **czyste reguły** tej fizyki (bez Three.js i bez gry), żeby dało się je
 * przetestować w headless harnessie:
 *
 *  - które bloki spadają (`isFallingBlock`),
 *  - które kratki spadający blok może zająć (powietrze, woda, lawa),
 *  - co niszczy po drodze (trawa, pochodnia, szyna, lilia),
 *  - na jakiej wysokości wyląduje (`fallPath`).
 *
 * Silnik (`Game.fallGravity`) dokłada do tego animację, dźwięk i obrażenia.
 */
import type { World } from './world';
import { B, IS_SOLID, RENDER } from './blocks';

/** Bloki, które spadają tak jak piasek w wanilii. */
const FALLING: ReadonlySet<number> = new Set<number>([B.SAND, B.GRAVEL]);

/** Czy blok jest sypki (spada po utracie podparcia)? */
export function isFallingBlock(id: number): boolean {
  return FALLING.has(id);
}

/** Kratka, którą spadający blok może zająć: powietrze, woda albo lawa. */
export function isPassableForFall(id: number): boolean {
  return id === B.AIR || RENDER[id] === 2;
}

/**
 * Drobiazgi, które spadający blok niszczy po drodze: rośliny (render `cross`),
 * szyny, pochodnie i lilie. Wszystkie mają własne, cienkie bryły i w wanilii
 * nie utrzymają spadającego piasku.
 */
const CRUSHABLE_RENDER: ReadonlySet<number> = new Set<number>([1, 6, 10, 11]);

export function isCrushable(id: number): boolean {
  return id !== B.AIR && CRUSHABLE_RENDER.has(RENDER[id]) && IS_SOLID[id] === 0;
}

export interface FallPath {
  /** Kratka, w której blok wyląduje (ta sama co `y`, gdy ma podparcie). */
  to: number;
  /** Drobiazgi do zniszczenia po drodze. */
  crush: [number, number, number][];
}

/**
 * Ścieżka spadania bloku z `(x, y, z)`: schodzimy w dół, dopóki kratka pod
 * nami jest do zajęcia (powietrze/woda/lawa) albo to drobiazg do zniszczenia.
 * Zatrzymujemy się na pierwszym bloku, który naprawdę podtrzymuje.
 */
export function fallPath(world: World, x: number, y: number, z: number): FallPath {
  let to = y;
  const crush: [number, number, number][] = [];
  while (to > 0) {
    const below = world.getBlock(x, to - 1, z);
    if (isPassableForFall(below)) {
      to--;
      continue;
    }
    if (isCrushable(below)) {
      crush.push([x, to - 1, z]);
      to--;
      continue;
    }
    break;
  }
  return { to, crush };
}

/** Czy blok na `(x, y, z)` ma podparcie i nie musi spadać? */
export function isSupported(world: World, x: number, y: number, z: number): boolean {
  return fallPath(world, x, y, z).to === y;
}

/**
 * Ile bloków liczy kolumna sypkiego materiału zaczynająca się w `(x, y, z)`
 * (piasek na piasku spada całą kolumną, nie po jednym bloku).
 */
export function fallColumnHeight(world: World, x: number, y: number, z: number): number {
  let n = 0;
  while (n < 384 && isFallingBlock(world.getBlock(x, y + n, z))) n++;
  return n;
}
