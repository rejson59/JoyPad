/**
 * BlockCraft 2.28 – teren w oddali w stylu Distant Horizons.
 *
 * Normalny świat buduje pełne chunki tylko w promieniu renderowania.
 * Tutaj powstaje tanie pasmo terenu **za horyzontem**: siatka próbkuje
 * wysokość i biom z generatora (czysty szum, bez generowania chunków),
 * a każdy kafel to jedna płaska siatka z kolorami wierzchołków.
 *
 * Dzięki temu z góry widać góry i morza setki bloków dalej, a koszt to
 * kilkanaście tysięcy trójkątów zamiast tysięcy pełnych chunków.
 */
import type { World, Biome } from './world';
import { SEA } from './world';

/** Bok kafla LOD w blokach. */
export const LOD_TILE = 128;

/** Domyślna gęstość siatki (co ile bloków próbkujemy). */
export const LOD_STEP = 8;

export interface LodTile {
  /** Lewy dolny róg kafla w blokach. */
  ox: number;
  oz: number;
  size: number;
  step: number;
  /** Wierzchołki (x, y, z) w przestrzeni świata. */
  positions: Float32Array;
  /** Kolory RGB 0–1 (oświetlenie wypalone w wierzchołkach). */
  colors: Float32Array;
  /** Indeksy trójkątów. */
  indices: Uint32Array;
}

/** Kolor bazowy biomu – bez tekstur, ale rozpoznawalny z dużej odległości. */
export function lodBiomeColor(biome: Biome): [number, number, number] {
  switch (biome) {
    case 'Las': return [0.28, 0.5, 0.22];
    case 'Brzozowy las': return [0.45, 0.6, 0.33];
    case 'Pustynia': return [0.85, 0.76, 0.5];
    case 'Tundra': return [0.78, 0.85, 0.9];
    case 'Góry': return [0.55, 0.55, 0.57];
    case 'Plaża': return [0.88, 0.82, 0.6];
    case 'Ocean': return [0.16, 0.34, 0.6];
    case 'Bagno': return [0.32, 0.4, 0.24];
    case 'Sawanna': return [0.66, 0.63, 0.31];
    case 'Dżungla': return [0.2, 0.55, 0.22];
    case 'Nether': return [0.5, 0.16, 0.16];
    default: return [0.38, 0.6, 0.3];
  }
}

/**
 * Wysokość powierzchni dla siatki LOD. Woda jest „podłogą”: ocean ma
 * płaską taflę na poziomie morza, dokładnie jak w pełnych chunkach.
 */
export function lodHeight(world: World, x: number, z: number): number {
  const s = world.surface(x, z);
  return s.h < SEA ? SEA + 1 : s.h + 1;
}

/**
 * Buduje kafel LOD. `step` steruje gęstością: 2 = dokładnie, 8 = bardzo
 * tanio. Zwraca surowe tablice (bez Three.js), więc testy mogą sprawdzić
 * każdy wierzchołek bez GPU.
 */
export function buildLodTile(
  world: World,
  ox: number,
  oz: number,
  size = LOD_TILE,
  step = LOD_STEP,
  drop = 0
): LodTile {
  const n = Math.max(1, Math.floor(size / step));
  const cols = n + 1;
  const positions = new Float32Array(cols * cols * 3);
  const colors = new Float32Array(cols * cols * 3);
  const indices = new Uint32Array(n * n * 6);

  // Najpierw próbkujemy wysokości i biomy, żeby policzyć nachylenie.
  const heights = new Float32Array(cols * cols);
  const biomes: Biome[] = new Array(cols * cols);
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = ox + i * step;
      const z = oz + j * step;
      const s = world.surface(x, z);
      const y = s.h < SEA ? SEA + 1 : s.h + 1;
      heights[j * cols + i] = y;
      biomes[j * cols + i] = s.h < SEA ? 'Ocean' : s.biome;
    }
  }

  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const k = j * cols + i;
      const y = heights[k];
      positions[k * 3] = ox + i * step;
      positions[k * 3 + 1] = y - drop;
      positions[k * 3 + 2] = oz + j * step;

      const [r, g, b] = lodBiomeColor(biomes[k]);
      // Nachylenie: różnica wysokości z sąsiadami daje naturalne cieniowanie
      // zboczy (bez liczenia normalnych na GPU).
      const left = heights[j * cols + Math.max(0, i - 1)];
      const right = heights[j * cols + Math.min(n, i + 1)];
      const down = heights[Math.max(0, j - 1) * cols + i];
      const up = heights[Math.min(n, j + 1) * cols + i];
      const slope = Math.min(1, (Math.abs(right - left) + Math.abs(up - down)) / (step * 2.4));
      const shade = 0.72 + (1 - slope) * 0.28;
      // Szczyty gór łapią „śnieg”, niziny zostają ciemniejsze.
      const snow = y > SEA + 40 ? Math.min(0.55, (y - SEA - 40) / 40) : 0;
      colors[k * 3] = Math.min(1, r * shade * (1 - snow) + 0.95 * snow);
      colors[k * 3 + 1] = Math.min(1, g * shade * (1 - snow) + 0.97 * snow);
      colors[k * 3 + 2] = Math.min(1, b * shade * (1 - snow) + 1 * snow);
    }
  }

  let t = 0;
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * cols + i;
      const b = a + 1;
      const c = a + cols;
      const d = c + 1;
      // Dwa trójkąty, zgodnie z ruchem wskazówek zegara patrząc z góry.
      indices[t++] = a; indices[t++] = c; indices[t++] = b;
      indices[t++] = b; indices[t++] = c; indices[t++] = d;
    }
  }
  return { ox, oz, size, step, positions, colors, indices };
}

/**
 * Kafle pierścienia wokół gracza: od `inner` do `outer` bloków.
 *
 * Kafle nachodzące na strefę pełnych chunków są pomijane – tam teren
 * rysuje prawdziwa siatka, a LOD i tak by się z nią zderzał (z-fighting).
 */
export function lodRing(
  px: number,
  pz: number,
  inner: number,
  outer: number,
  tile = LOD_TILE
): { ox: number; oz: number; dist: number }[] {
  const r = Math.ceil(outer / tile);
  const cx = Math.floor(px / tile);
  const cz = Math.floor(pz / tile);
  const out: { ox: number; oz: number; dist: number }[] = [];
  for (let dz = -r; dz <= r; dz++) {
    for (let dx = -r; dx <= r; dx++) {
      const ox = (cx + dx) * tile;
      const oz = (cz + dz) * tile;
      // Najbliższy punkt kafla względem gracza (a nie jego środek).
      const nx = Math.max(ox, Math.min(px, ox + tile));
      const nz = Math.max(oz, Math.min(pz, oz + tile));
      const d = Math.hypot(nx - px, nz - pz);
      if (d > outer || d < inner * 0.65) continue;
      out.push({ ox, oz, dist: d });
    }
  }
  out.sort((a, b) => a.dist - b.dist);
  return out;
}
