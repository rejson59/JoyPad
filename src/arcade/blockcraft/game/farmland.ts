/**
 * BlockCraft 2.26 – nawadnianie grządek, jak `FarmBlock` z Minecrafta.
 *
 * W wanilii grządka ma osiem poziomów wilgotności (`moisture=0..7`). Gdy
 * w promieniu czterech bloków (poziomo, także na skos) jest woda na tym
 * samym poziomie albo o jeden wyżej, blok zmienia się w `moisture=7`:
 * dostaje ciemniejszą teksturę `farmland_moist` i rośliny rosną na nim
 * szybciej. Gdy wodę zabierzemy, grządka wraca do suchej wersji.
 *
 * Trzymamy to w osobnym module (bez Three.js i bez silnika), żeby dało się
 * sprawdzić w headless harnessie.
 */
import type { World } from './world';
import { B } from './blocks';

/** Promień nawadniania w blokach (waniliowe 4). */
export const HYDRATION_RADIUS = 4;

/** Czy blok to grządka (sucha albo nawodniona)? */
export function isFarmland(id: number): boolean {
  return id === B.FARMLAND || id === B.FARMLAND_WET;
}

/** Maksymalna odległość pozioma liczona po skosie (waniliowe dx² + dz² ≤ 18). */
const MAX_DIAGONAL = HYDRATION_RADIUS * HYDRATION_RADIUS + 2;

/**
 * Czy grządka na `(x, y, z)` ma wodę w zasięgu? Sprawdzamy poziom grządki
 * i o jeden wyżej – dokładnie tak samo, jak `cropWatered` przy wzroście
 * roślin, więc tekstura i tempo wzrostu nigdy się nie rozjeżdżają.
 */
export function isHydrated(world: World, x: number, y: number, z: number): boolean {
  for (let dx = -HYDRATION_RADIUS; dx <= HYDRATION_RADIUS; dx++) {
    for (let dz = -HYDRATION_RADIUS; dz <= HYDRATION_RADIUS; dz++) {
      // Wanilia nie liczy rogów kwadratu: w linii prostej 4 blokdy, na skos
      // maksymalnie ~4,24 (dx² + dz² ≤ 18).
      if (dx * dx + dz * dz > MAX_DIAGONAL) continue;
      if (world.peekBlock(x + dx, y, z + dz) === B.WATER) return true;
      if (world.peekBlock(x + dx, y + 1, z + dz) === B.WATER) return true;
    }
  }
  return false;
}

/**
 * Ustawia grządce właściwy wariant (suchy / nawodniony) na podstawie wody
 * w pobliżu. Zwraca `true`, gdy blok faktycznie się zmienił.
 */
export function updateFarmland(world: World, x: number, y: number, z: number): boolean {
  const id = world.peekBlock(x, y, z);
  if (!isFarmland(id)) return false;
  const want = isHydrated(world, x, y, z) ? B.FARMLAND_WET : B.FARMLAND;
  if (id === want) return false;
  world.setBlock(x, y, z, want);
  return true;
}
