/**
 * BlockCraft 2.8.2 „Zdrowe drzewa” – generator drzew napisany od zera.
 *
 * Wcześniejsze drzewa były budowane „w locie” w trzech miejscach (generowanie
 * terenu, superflat i sadzonki), a każde z nich losowo pomijało narożniki
 * korony. Po zmianie liści na pełne bloki te szczeliny przestały być
 * „naturalne”, a stały się dziurami, przez które widać było ciemne wnętrze
 * pnia – stąd wrażenie czarnych drzew i przezroczystych liści.
 *
 * Teraz kształt drzewa jest **czystą, deterministyczną funkcją** pozycji
 * i ziarna: `treeBlocks()` zwraca dokładną listę bloków (pień + korona),
 * a świat tylko je zapisuje. Dzięki temu:
 *  - korona nie ma losowych dziur (narożniki są przycinane zawsze albo nigdy),
 *  - dwie sąsiednie części tego samego drzewa, leżące w różnych chunkach,
 *    zgadzają się co do bloku (ten sam `hash` dla tej samej pozycji),
 *  - sadzonka rośnie w dokładnie taki sam kształt, jaki wygenerowałby świat,
 *  - kształt da się przetestować bez WebGL.
 */
import { B } from './blocks';

export type TreeKind = 'oak' | 'birch' | 'jungle' | 'acacia';

export interface TreeBlock {
  dx: number;
  dy: number;
  dz: number;
  id: number;
}

/** Deterministyczny szum 0–1 dla pozycji świata i ziarna. */
function noise(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 1442695041) ^ Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Wysokość pnia (liczba bloków), bez korony. */
export function trunkHeight(kind: TreeKind, x: number, z: number, seed: number): number {
  const r = noise(x, 6, z, seed);
  switch (kind) {
    case 'birch': return 5 + Math.floor(r * 3); // 5–7
    case 'jungle': return 7 + Math.floor(r * 4); // 7–10
    case 'acacia': return 5 + Math.floor(r * 2); // 5–6
    default: return 4 + Math.floor(r * 3); // 4–6
  }
}

export interface TreeShape {
  blocks: TreeBlock[];
  /** Wysokość od pierwszego bloku pnia (0) do czubka korony. */
  top: number;
}

function logOf(kind: TreeKind): number {
  if (kind === 'acacia') return B.ACACIA_LOG;
  if (kind === 'birch') return B.BIRCH_LOG;
  return B.LOG;
}

function leafOf(kind: TreeKind): number {
  if (kind === 'acacia') return B.ACACIA_LEAVES;
  if (kind === 'jungle') return B.JUNGLE_LEAVES;
  if (kind === 'birch') return B.BIRCH_LEAVES;
  return B.LEAVES;
}

/**
 * Kształt drzewa zakorzenionego w (x, y, z), gdzie `y` to pierwszy blok pnia
 * (blok pod nim to ziemia). Zwraca offsety względem (x, y, z).
 *
 * Zasady kształtu (bez losowych dziur):
 *  - korona to dwie pełne warstwy 5×5 z przyciętymi narożnikami (zaokrąglony
 *    obrys), potem pełne 3×3 i „krzyż” na czubku,
 *  - brzoza i akacja mają węższe korony, dżungla szersze,
 *  - akacja rozkłada płaski, parasolowaty daszek na dwóch krótkich konarach.
 */
export function treeShape(kind: TreeKind, x: number, z: number, seed: number): TreeShape {
  const h = trunkHeight(kind, x, z, seed);
  const topY = h - 1;
  const log = logOf(kind);
  const leaf = leafOf(kind);
  const out: TreeBlock[] = [];
  const seen = new Set<string>();
  const put = (dx: number, dy: number, dz: number, id: number) => {
    const key = `${dx},${dy},${dz}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ dx, dy, dz, id });
  };
  /** Pełny kwadrat o promieniu r; `corners` mówi, czy zostawić narożniki. */
  const layer = (dy: number, r: number, corners: boolean) => {
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (!corners && Math.abs(dx) === r && Math.abs(dz) === r) continue;
        put(dx, dy, dz, leaf);
      }
  };
  /** Ostatnia warstwa korony: „krzyż”, czyli środek + cztery sąsiady. */
  const cross = (dy: number) => {
    put(0, dy, 0, leaf);
    put(1, dy, 0, leaf);
    put(-1, dy, 0, leaf);
    put(0, dy, 1, leaf);
    put(0, dy, -1, leaf);
  };

  // Pień – zawsze pełna kolumna od ziemi do nasady korony.
  for (let dy = 0; dy < h; dy++) put(0, dy, 0, log);

  let top = topY;
  if (kind === 'acacia') {
    // Akacja: dwa konary w przeciwne strony i płaski daszek liści.
    const dirs: [number, number][] = noise(x, 8, z, seed) < 0.5
      ? [[1, 0], [-1, 0]]
      : [[0, 1], [0, -1]];
    for (const [sx, sz] of dirs) {
      for (let n = 1; n <= 2; n++) put(sx * n, topY - 1 + n, sz * n, log);
    }
    const branchTop = topY + 1;
    // daszek 5×5 bez narożników + mniejszy 3×3 nad nim
    layer(branchTop, 2, false);
    layer(branchTop + 1, 1, true);
    cross(branchTop + 2);
    // krótsze „skrzydła” po bokach daszka, żeby nie był idealnie kwadratowy
    for (const [sx, sz] of dirs) {
      put(sx * 3, branchTop, sz * 3, leaf);
      put(sx * 2, branchTop, sz * 2, leaf);
    }
    top = branchTop + 2;
  } else if (kind === 'jungle') {
    // Dżungla: szeroka, wielowarstwowa korona.
    layer(topY - 2, 2, false);
    layer(topY - 1, 2, false);
    layer(topY, 1, true);
    cross(topY + 1);
    top = topY + 1;
  } else if (kind === 'birch') {
    // Brzoza: smukła, wysoka korona.
    layer(topY - 2, 1, true);
    layer(topY - 1, 2, false);
    layer(topY, 1, true);
    cross(topY + 1);
    top = topY + 1;
  } else {
    // Dąb: klasyczne dwie szerokie warstwy, 3×3 i krzyż na czubku.
    layer(topY - 2, 2, false);
    layer(topY - 1, 2, false);
    layer(topY, 1, true);
    cross(topY + 1);
    top = topY + 1;
  }

  return { blocks: out, top };
}

/** Najwyższy blok drzewa w świecie (do księgowania `maxY`). */
export function treeTop(kind: TreeKind, x: number, y: number, z: number, seed: number): number {
  return y + treeShape(kind, x, z, seed).top;
}

/** Wybór gatunku dla biomu – wspólny dla generatora i podpowiedzi w UI. */
export function treeKindForBiome(biome: string, birchRoll: number): TreeKind {
  if (biome === 'Dżungla') return 'jungle';
  if (biome === 'Sawanna') return 'acacia';
  if (biome === 'Brzozowy las') return birchRoll < 0.8 ? 'birch' : 'oak';
  return birchRoll < 0.15 ? 'birch' : 'oak';
}
