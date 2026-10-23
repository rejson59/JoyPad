import * as THREE from 'three';
import { SimplexNoise } from './noise';
import { B, T, EMIT, IS_LEAFY, IS_OPAQUE, IS_SOLID, LAYER, OCCLUDES, CULLS, RENDER, isDoor, isDoorOpen, doorFacing, doorHinge, doorPlate, isFence, ladderFacing, tileFor, isSlabTop, stairsFacing, isBed, isBedHead, bedFacing } from './blocks';
import { tileUV, tileUVInset, tileUVRect } from './textures';
import { treeShape, treeKindForBiome, type TreeKind } from './trees';
import { CH, CS, FLAT_H, SEA } from './constants';
import {
  applyVillages,
  nearestVillage,
  villageAt,
  villagesOverlapping,
  type Village,
  type VillageContext,
} from './village';

// Metryki świata mieszkają w constants.ts (generator wsi też ich potrzebuje),
// ale stare importy z world.ts nadal działają.
export { CH, CS, FLAT_H, SEA };

export type Biome = 'Równiny' | 'Las' | 'Pustynia' | 'Tundra' | 'Góry' | 'Plaża' | 'Ocean' | 'Brzozowy las' | 'Bagno' | 'Sawanna' | 'Dżungla' | 'Nether';

export interface SurfaceInfo {
  h: number;
  biome: Biome;
  temp: number;
  forest: number;
}

const idx = (x: number, y: number, z: number) => (y * CS + z) * CS + x;

function hash(x: number, y: number, z: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + s * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

export class Chunk {
  cx: number;
  cz: number;
  data = new Uint16Array(CS * CS * CH);
  heightMap = new Uint16Array(CS * CS);
  meshes: THREE.Mesh[] = [];
  built = false;
  maxY = 0;
  /** Nether chunks measure height as the walkable FLOOR, never the roof. */
  nether = false;
  /**
   * 2.8 „Płynny świat”: indeks bloków emitujących światło (pochodnie, lawa,
   * jasnogłaz…). Meshing wcześniej skanował 9 × 32 768 bloków sąsiadów przy
   * KAŻDYM chunku; teraz czyta tylko faktyczne źródła światła.
   */
  emitters: number[] = [];
  /** Zmienia się przy każdej modyfikacji terenu (cache minimapy). */
  revision = 0;
  constructor(cx: number, cz: number) {
    this.cx = cx;
    this.cz = cz;
  }
  /** Przebudowuje indeks świateł po wygenerowaniu albo zmianie bloku. */
  refreshEmitters() {
    const out: number[] = [];
    const d = this.data;
    for (let i = 0; i < d.length; i++) if (EMIT[d[i]]) out.push(i);
    this.emitters = out;
  }
  recomputeHeight(x: number, z: number) {
    if (this.nether) {
      // Highest walkable floor: a solid block with two air blocks over it.
      // The roof and every hanging stalactite are skipped, so spawns, the
      // minimap and mob AI always see the actual ground under the player.
      for (let y = CH - 3; y >= 0; y--) {
        const i = idx(x, y, z);
        if (IS_OPAQUE[this.data[i]] && this.data[i + CS * CS] === 0 && this.data[i + 2 * CS * CS] === 0) {
          this.heightMap[z * CS + x] = y;
          return;
        }
      }
      this.heightMap[z * CS + x] = 0;
      return;
    }
    // 2.8.1: korona drzewa nie jest gruntem – wysokość kolumny ma wskazywać
    // ziemię (spawn, deszcz, minimapa), a nie czubek liści.
    for (let y = CH - 1; y >= 0; y--) {
      const id = this.data[idx(x, y, z)];
      if (IS_OPAQUE[id] && !IS_LEAFY[id]) {
        this.heightMap[z * CS + x] = y;
        return;
      }
    }
    this.heightMap[z * CS + x] = 0;
  }
}

// Face definitions: -x, +x, -y, +y, -z, +z
const FACES = [
  { dir: [-1, 0, 0], shade: 0.62, c: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { dir: [1, 0, 0], shade: 0.62, c: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { dir: [0, -1, 0], shade: 0.5, c: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { dir: [0, 1, 0], shade: 1.0, c: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { dir: [0, 0, -1], shade: 0.8, c: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
  { dir: [0, 0, 1], shade: 0.8, c: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
];

// Shared BFS scratch for buildMesh (single-threaded, never nested).
let lightScratch: Uint8Array | null = null;
// 2.8.1: bufor światła nieba – jedna kolumna na x/z z jednym blokiem zapasu.
const SKY_PAD = 1;
const SKY_W = CS + SKY_PAD * 2;
const LEAF_SHADE = 0.9; // ile światła przechodzi przez jeden blok liści
const MIN_SKY = 0.16; // pod gęstą koroną zostaje resztka światła
const MIN_CAVE_SKY = 0.04; // pod pełnym blokiem zostaje tylko mrok jaskini
let skyScratch: Float32Array | null = null;
const qx: number[] = [];
const qy: number[] = [];
const qz: number[] = [];

/**
 * 2.8: typowane bufory zamiast tablic `number[]`. Każdy `push` na zwykłej
 * tablicy alokował pamięć i produkował śmieci; przy tysiącach ścian na chunk
 * miało to bezpośredni wpływ na płynność. Bufory rosną geometrycznie, a do
 * geometrii trafia dokładny wycinek.
 */
class MeshBuffer {
  pos: Float32Array;
  uv: Float32Array;
  col: Float32Array;
  block: Float32Array;
  wave: Float32Array;
  /** 2.8.2: numer ściany (0–5) – shader liczy z niego kierunek słońca. */
  face: Float32Array;
  ind: Uint32Array;
  count = 0;
  icount = 0;

  constructor(capacity = 2048) {
    this.pos = new Float32Array(capacity * 3);
    this.uv = new Float32Array(capacity * 2);
    this.col = new Float32Array(capacity * 3);
    this.block = new Float32Array(capacity);
    this.wave = new Float32Array(capacity);
    this.face = new Float32Array(capacity);
    this.ind = new Uint32Array(capacity * 1.5);
  }

  private growVertices(need: number) {
    let cap = this.pos.length / 3;
    if (cap >= need) return;
    while (cap < need) cap *= 2;
    const copy = <T extends Float32Array>(src: T, itemSize: number): T => {
      const next = new Float32Array(cap * itemSize) as T;
      next.set(src);
      return next;
    };
    this.pos = copy(this.pos, 3);
    this.uv = copy(this.uv, 2);
    this.col = copy(this.col, 3);
    this.block = copy(this.block, 1);
    this.wave = copy(this.wave, 1);
    this.face = copy(this.face, 1);
  }

  private growIndices(need: number) {
    let cap = this.ind.length;
    if (cap >= need) return;
    while (cap < need) cap *= 2;
    const next = new Uint32Array(cap);
    next.set(this.ind);
    this.ind = next;
  }

  vertex(px: number, py: number, pz: number, u: number, v: number, r: number, g: number, b: number, blk: number, wave = 0, face = 3) {
    this.growVertices(this.count + 1);
    const i = this.count++;
    const i3 = i * 3;
    const i2 = i * 2;
    this.pos[i3] = px; this.pos[i3 + 1] = py; this.pos[i3 + 2] = pz;
    this.uv[i2] = u; this.uv[i2 + 1] = v;
    this.col[i3] = r; this.col[i3 + 1] = g; this.col[i3 + 2] = b;
    this.block[i] = blk;
    this.wave[i] = wave;
    this.face[i] = face;
  }

  /** Zapisuje indeksy czworokąta (kolejność zależna od kierunku AO). */
  quad(base: number, flipped = false) {
    const need = this.icount + 6;
    this.growIndices(need);
    const ind = this.ind;
    let o = this.icount;
    if (flipped) {
      ind[o++] = base; ind[o++] = base + 1; ind[o++] = base + 3;
      ind[o++] = base; ind[o++] = base + 3; ind[o++] = base + 2;
    } else {
      ind[o++] = base; ind[o++] = base + 1; ind[o++] = base + 2;
      ind[o++] = base + 2; ind[o++] = base + 1; ind[o++] = base + 3;
    }
    this.icount = o;
  }

  geometry(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    if (this.count === 0) return g;
    const vertices = this.count;
    g.setAttribute('position', new THREE.BufferAttribute(this.pos.slice(0, vertices * 3), 3));
    g.setAttribute('uv', new THREE.BufferAttribute(this.uv.slice(0, vertices * 2), 2));
    g.setAttribute('color', new THREE.BufferAttribute(this.col.slice(0, vertices * 3), 3));
    g.setAttribute('aBlock', new THREE.BufferAttribute(this.block.slice(0, vertices), 1));
    g.setAttribute('aWave', new THREE.BufferAttribute(this.wave.slice(0, vertices), 1));
    g.setAttribute('aFace', new THREE.BufferAttribute(this.face.slice(0, vertices), 1));
    const indices = this.ind.subarray(0, this.icount);
    g.setIndex(vertices > 65535
      ? new THREE.BufferAttribute(indices.slice(), 1)
      : new THREE.BufferAttribute(Uint16Array.from(indices), 1));
    g.computeBoundingSphere();
    return g;
  }
}

/** Axis-aligned box in local 0–1 space, translated to world. Used for doors, ladders and hatches. */
function addBox(
  buf: MeshBuffer,
  ox: number,
  oy: number,
  oz: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tile: number | number[],
  sky: number,
  blk: number,
  /** Kafelek górnej ściany (np. kołdra łóżka) – domyślnie ten sam co bok. */
  topTile?: number,
  /** Kafelek dolnej ściany – domyślnie ten sam co bok. */
  bottomTile?: number,
  /** Odetnij tyle pikseli tekstury z każdej krawędzi (kaktus). */
  inset = 0,
  /** Wycinki UV per ściana (0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z), w pikselach. */
  crops?: (readonly [number, number, number, number] | null)[],
) {
  const map = (v: number, a: number, b: number) => a + v * (b - a);
  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    const base = buf.count;
    const skyB = F.shade * sky;
    const br = skyB * skyB;
    const bb = F.shade * blk;
    const bl = bb * bb;
    // 2.20: kafelki per ściana – łóżko ma kołdrę tylko na górze, kaktus
    // chowa 1 px przezroczystego marginesu (waniliowa bryła 14/16).
    const faceTile = Array.isArray(tile)
      ? tile[f]
      : f === 3 ? topTile ?? tile : f === 2 ? bottomTile ?? tile : tile;
    const crop = crops?.[f] ?? null;
    for (let k = 0; k < 4; k++) {
      const cr = F.c[k];
      const uv = crop ? tileUVRect(faceTile, crop, cr[3], cr[4]) : tileUVInset(faceTile, cr[3], cr[4], inset);
      buf.vertex(ox + map(cr[0], x0, x1), oy + map(cr[1], y0, y1), oz + map(cr[2], z0, z1), uv[0], uv[1], br, br, br, bl, 0, f);
    }
    buf.quad(base);
  }
}

/**
 * Bryła z UV dopasowanym do rozmiaru (płot, pochodnia) – zamiast rozciągać
 * cały kafelek na 2–4 px ścianki, bierzemy jego wyśrodkowany wycinek.
 *
 * 2.21: dzięki temu płot ma proporcje desek, a pochodnia – 2×10 px patyczka
 * dokładnie tam, gdzie w waniliowej teksturze.
 */
function addBoxPx(
  buf: MeshBuffer,
  ox: number,
  oy: number,
  oz: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tile: number,
  sky: number,
  blk: number,
  crop?: [number, number, number, number],
) {
  const dx = (x1 - x0) * 16, dy = (y1 - y0) * 16, dz = (z1 - z0) * 16;
  const map = (v: number, a: number, b: number) => a + v * (b - a);
  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    const base = buf.count;
    const skyB = F.shade * sky;
    const br = skyB * skyB;
    const bb = F.shade * blk;
    const bl = bb * bb;
    const fw = f < 2 ? dz : dx;
    const fh = f < 2 ? dy : f < 4 ? dz : dy;
    const rect = crop ?? [(16 - fw) / 2, (16 - fh) / 2, (16 + fw) / 2, (16 + fh) / 2];
    for (let k = 0; k < 4; k++) {
      const cr = F.c[k];
      const uv = tileUVRect(tile, rect, cr[3], cr[4]);
      buf.vertex(ox + map(cr[0], x0, x1), oy + map(cr[1], y0, y1), oz + map(cr[2], z0, z1), uv[0], uv[1], br, br, br, bl, 0, f);
    }
    buf.quad(base);
  }
}

/** Bryła inna niż pełny sześcian: kształt + kafelki poszczególnych ścian. */
export interface SpecialBox {
  b: [number, number, number, number, number, number];
  side?: number;
  top?: number;
  bottom?: number;
  inset?: number;
  /** Wycinek UV per ściana (0 -x, 1 +x, 2 -y, 3 +y, 4 -z, 5 +z), w pikselach 16×16. */
  crops?: (readonly [number, number, number, number] | null)[];
  /** Kafelek per ściana – gdy blok ma różne tekstury na każdej ścianie. */
  tiles?: number[];
}

/** Konwersja waniliowego UV (v od góry) na nasz układ (v od dołu kafelka). */
const uvPx = (u0: number, v0: number, u1: number, v1: number): [number, number, number, number] =>
  [Math.min(u0, u1), 16 - Math.max(v0, v1), Math.max(u0, u1), 16 - Math.min(v0, v1)];

/**
 * Kształty „cienkich” i „niskich” bloków.
 *
 * 2.20: drzwi były pełnymi sześcianami – każda połowa rysowała całą płaszczyznę
 * drzwi na wszystkich ścianach, więc w ścianie domu było widać siatkę 2×2
 * mini-drzwi (a górna połowa miała czarne szyby na warstwie bez alfy).
 * Teraz drzwi to płyta 3/16 przy krawędzi, a łóżko – bryła 9/16 wysokości.
 */
/* --------------------------------------------------------------- 2.29
 * Łóżko 1:1 jak w 26.2.
 *
 * Od 26.2 łóżko nie jest już renderowane przez encję, tylko przez dwa modele
 * bloków (`template_bed_head.json` i `template_bed_foot.json`): materac 6 px
 * grubości zawieszony 3 px nad podłogą plus dwie 3×3×3-pikselowe nogi, które
 * stoją po przeciwnej stronie niż sąsiad (czyli razem cztery nogi na łóżko).
 * Ściany boczne mają własne wycinki tekstur (`red_bed_head_east` itd.), dlatego
 * każdy kierunek dostaje obróconą kopię modelu wraz z podmienionymi ścianami.
 */
const BED_SIDE_CROP: readonly [number, number, number, number] = uvPx(0, 7, 16, 13);
const BED_LEG_CROP: readonly [number, number, number, number] = uvPx(7, 13, 10, 16);
/** Dokąd trafia ściana po obrocie modelu: dest[stara] = nowa. */
const BED_ROT: Record<number, number[]> = {
  1: [4, 5, 2, 3, 1, 0],
  2: [1, 0, 2, 3, 5, 4],
  3: [5, 4, 2, 3, 1, 0],
};

function rotateBox(b: SpecialBox['b'], r: number): SpecialBox['b'] {
  const [x0, y0, z0, x1, y1, z1] = b;
  if (r === 1) return [1 - z1, y0, x0, 1 - z0, y1, x1];
  if (r === 2) return [1 - x1, y0, 1 - z1, 1 - x0, y1, 1 - z0];
  if (r === 3) return [z0, y0, 1 - x1, z1, y1, 1 - x0];
  return b;
}

function rotateSpecial(box: SpecialBox, r: number): SpecialBox {
  if (!r) return box;
  const d = BED_ROT[r];
  const out: SpecialBox = { ...box, b: rotateBox(box.b, r) };
  if (box.tiles) {
    const src = box.tiles;
    const tiles = src.slice();
    for (let i = 0; i < 6; i++) tiles[d[i]] = src[i];
    out.tiles = tiles;
  }
  if (box.crops) {
    const src = box.crops;
    const crops = src.slice();
    for (let i = 0; i < 6; i++) crops[d[i]] = src[i];
    out.crops = crops;
  }
  return out;
}

function bedBoxes(id: number): SpecialBox[] {
  const head = isBedHead(id);
  const facing = bedFacing(id);
  // Tekstury w układzie modelu (przód = północ). `head` ma poduszkę z przodu,
  // `foot` – deskę przy stopach; reszta ścian to drewno albo kołdra.
  const up = head ? T.bed_top : T.bed_foot_up;
  const down = T.bed_side;
  const north = head ? T.bed_head_north : T.bed_foot_south;
  const south = T.bed_foot_south;
  const east = head ? T.bed_head_east : T.bed_foot_east;
  const west = head ? T.bed_head_west : T.bed_foot_west;
  const leg = head ? T.bed_head_east : T.bed_foot_east;
  const boxes: SpecialBox[] = [
    {
      b: [0, 3 / 16, 0, 1, 9 / 16, 1],
      tiles: [west, east, down, up, north, south],
      crops: [BED_SIDE_CROP, BED_SIDE_CROP, null, null, BED_SIDE_CROP, BED_SIDE_CROP],
    },
  ];
  // Nogi stoją po przeciwnej stronie niż druga połowa łóżka – tak jak w
  // waniliowych szablonach (głowa: z=0, stopa: z=13).
  const legZ = head ? 0 : 13 / 16;
  for (const legX of [0, 13 / 16]) {
    boxes.push({
      b: [legX, 0, legZ, legX + 3 / 16, 3 / 16, legZ + 3 / 16],
      tiles: [leg, leg, leg, leg, leg, leg],
      crops: [BED_LEG_CROP, BED_LEG_CROP, null, null, BED_LEG_CROP, BED_LEG_CROP],
    });
  }
  return boxes.map((b) => rotateSpecial(b, facing));
}

/* --------------------------------------------------------------- 2.29
 * Drzwi 1:1 z modelami `door_bottom_left(_open)` / `door_top_right` itd.
 *
 * Wanilia rysuje drzwi jako jedną bryłę 3×16×16 px i nadaje każdej ścianie
 * własny wycinek tekstury: duże płaszczyzny biorą cały kafelek (jedna z nich
 * lustrzanie), a 3-pikselowe krawędzie – tylko skrajne 3 kolumny deski. Dzięki
 * temu brzeg drzwi to listwa, a nie ściśnięty obrazek całych drzwi.
 */
const DOOR_FACE = [4, 1, 5, 0]; // kompas (N,E,S,W) → indeks ściany w `SpecialBox`
const DOOR_FULL: readonly [number, number, number, number] = [0, 0, 16, 16];
const DOOR_FULL_MIRROR: readonly [number, number, number, number] = [16, 0, 0, 16];
const DOOR_EDGE: readonly [number, number, number, number] = [0, 0, 3, 16];
const DOOR_EDGE_MIRROR: readonly [number, number, number, number] = [3, 0, 0, 16];

/** Kompasowa strona, w którą patrzy front skrzydła (0 N, 1 E, 2 S, 3 W). */
function doorFrontDir(id: number): number {
  const f = doorFacing(id);
  if (f < 0 || !isDoorOpen(id)) return f;
  return doorHinge(id) === 0 ? (f + 1) % 4 : (f + 3) % 4;
}

function doorBoxes(id: number): SpecialBox[] {
  const [x0, z0, x1, z1] = doorPlate(id);
  const front = doorFrontDir(id);
  const crops: (readonly [number, number, number, number] | null)[] = [null, null, null, null, null, null];
  crops[DOOR_FACE[front]] = DOOR_FULL_MIRROR;
  crops[DOOR_FACE[(front + 2) % 4]] = DOOR_FULL;
  crops[DOOR_FACE[(front + 1) % 4]] = DOOR_EDGE;
  crops[DOOR_FACE[(front + 3) % 4]] = DOOR_EDGE_MIRROR;
  // Góra i dół to 3-pikselowe paski deski (tak jak `up`/`down` w wanilii).
  crops[2] = [0, 0, 16, 3];
  crops[3] = [0, 13, 16, 16];
  return [{
    b: [x0, 0, z0, x1, 1, z1],
    tiles: [tileFor(id, 0), tileFor(id, 0), tileFor(id, 0), tileFor(id, 0), tileFor(id, 0), tileFor(id, 0)],
    crops,
  }];
}

function specialBoxes(id: number): SpecialBox[] | null {
  const t = 0.1875;
  const face = ladderFacing(id);
  // 2.21: drabina to płaska deska 0,3 px od ściany (wanilia: z = 15,2/16),
  // a nie blok o grubości 3 px jak właz.
  const lt = 0.3125 / 16;
  if (face === 0) return [{ b: [0, 0, 0, 1, 1, lt] }];
  if (face === 1) return [{ b: [1 - lt, 0, 0, 1, 1, 1] }];
  if (face === 2) return [{ b: [0, 0, 1 - lt, 1, 1, 1] }];
  if (face === 3) return [{ b: [0, 0, 0, lt, 1, 1] }];
  if (id === B.TRAP_N) return [{ b: [0, 0, 0, 1, 1, t] }];
  if (id === B.TRAP_E) return [{ b: [1 - t, 0, 0, 1, 1, 1] }];
  if (id === B.TRAP_S) return [{ b: [0, 0, 1 - t, 1, 1, 1] }];
  if (id === B.TRAP_W) return [{ b: [0, 0, 0, t, 1, 1] }];
  if (id === B.TRAP) return [{ b: [0, 1 - t, 0, 1, 1, 1] }];
  if (isBed(id)) return bedBoxes(id);
  if (id === B.PATH) {
    // 2.21: waniliowa ścieżka ma 15/16 wysokości, a boki zaczynają się 1 px
    // od góry (górny rząd kafelka jest przezroczysty – bez tego była szpara).
    const side = uvPx(0, 1, 16, 16);
    return [{
      b: [0, 0, 0, 1, 0.9375, 1],
      tiles: [tileFor(id, 4), tileFor(id, 5), tileFor(id, 2), tileFor(id, 3), tileFor(id, 4), tileFor(id, 5)],
      crops: [side, side, null, null, side, side],
    }];
  }
  if (id === B.FARMLAND || id === B.FARMLAND_WET) {
    const side = uvPx(0, 1, 16, 16);
    return [{
      b: [0, 0, 0, 1, 0.9375, 1],
      tiles: [tileFor(id, 4), tileFor(id, 5), tileFor(id, 2), tileFor(id, 3), tileFor(id, 4), tileFor(id, 5)],
      crops: [side, side, null, null, side, side],
    }];
  }
  if (id === B.ANVIL) {
    // 2.21: dokładne waniliowe elementy kowadła (template_anvil.json) –
    // podstawa, zwężenie, korpus i blat, z UV każdej ściany z osobna.
    const t = tileFor(id, 0);
    const body = (u0: number, v0: number, u1: number, v1: number) => uvPx(u0, v0, u1, v1);
    return [
      {
        b: [2 / 16, 0, 2 / 16, 14 / 16, 4 / 16, 14 / 16],
        tiles: [t, t, t, t, t, t],
        crops: [body(0, 2, 4, 14), body(4, 2, 0, 14), body(2, 2, 14, 14), body(2, 2, 14, 14), body(2, 12, 14, 16), body(2, 12, 14, 16)],
      },
      {
        b: [4 / 16, 4 / 16, 3 / 16, 12 / 16, 5 / 16, 13 / 16],
        tiles: [t, t, t, t, t, t],
        crops: [body(4, 3, 5, 13), body(5, 3, 4, 13), null, body(4, 3, 12, 13), body(4, 11, 12, 12), body(4, 11, 12, 12)],
      },
      {
        b: [6 / 16, 5 / 16, 4 / 16, 10 / 16, 10 / 16, 12 / 16],
        tiles: [t, t, t, t, t, t],
        crops: [body(5, 4, 10, 12), body(10, 4, 5, 12), null, null, body(6, 6, 10, 11), body(6, 6, 10, 11)],
      },
      {
        b: [3 / 16, 10 / 16, 0, 13 / 16, 1, 1],
        tiles: [t, t, t, t, t, t],
        crops: [body(10, 0, 16, 16), body(16, 0, 10, 16), body(3, 0, 13, 16), body(3, 0, 13, 16), body(3, 0, 13, 6), body(3, 0, 13, 6)],
      },
    ];
  }
  if (id === B.CAMPFIRE) {
    // 2.21: waniliowe ognisko – cztery bale w dwóch warstwach, zamiast
    // jednego niskiego sześcianu z płomieniem na górze.
    const log = tileFor(id, 4);
    const lit = tileFor(id, 3);
    const logSide = (u0: number, v0: number, u1: number, v1: number) => uvPx(u0, v0, u1, v1);
    return [
      { b: [1 / 16, 0, 0, 5 / 16, 4 / 16, 1], tiles: [log, lit, log, lit, log, log], crops: [null, logSide(0, 1, 16, 5), null, logSide(0, 0, 16, 4), logSide(0, 4, 4, 8), logSide(0, 4, 4, 8)] },
      { b: [11 / 16, 0, 0, 15 / 16, 4 / 16, 1], tiles: [lit, log, log, lit, log, log], crops: [logSide(0, 0, 16, 4), logSide(16, 1, 0, 5), null, logSide(0, 0, 16, 4), logSide(0, 4, 4, 8), logSide(0, 4, 4, 8)] },
      { b: [0, 3 / 16, 11 / 16, 1, 7 / 16, 15 / 16], tiles: [log, log, lit, log, lit, lit], crops: [logSide(0, 4, 4, 8), logSide(0, 4, 4, 8), logSide(0, 4, 16, 8), logSide(0, 0, 16, 4), logSide(0, 0, 16, 4), logSide(16, 0, 0, 4)] },
      { b: [0, 3 / 16, 1 / 16, 1, 7 / 16, 5 / 16], tiles: [log, log, lit, log, lit, lit], crops: [logSide(0, 4, 4, 8), logSide(0, 4, 4, 8), logSide(0, 4, 16, 8), logSide(0, 0, 16, 4), logSide(0, 0, 16, 4), logSide(16, 0, 0, 4)] },
      { b: [5 / 16, 0, 0, 11 / 16, 1 / 16, 1], tiles: [log, log, log, lit, log, log], crops: [null, null, null, logSide(0, 8, 16, 14), logSide(0, 15, 6, 16), logSide(10, 15, 16, 16)] },
    ];
  }
  if (id === B.CACTUS) {
    const e = 1 / 16;
    return [{
      b: [e, 0, e, 1 - e, 1, 1 - e],
      side: tileFor(id, 0),
      top: tileFor(id, 3),
      bottom: tileFor(id, 2),
      inset: 1,
    }];
  }
  if (id === B.LANTERN) {
    // 2.21: waniliowy model latarni (template_lantern.json) – korpus 6×7 px
    // i czapka 4×2 px z dokładnymi wycinkami tekstury z paczki, plus uchwyt
    // z dwóch cienkich prętów. Wcześniej był to billboard z ikony przedmiotu.
    const t = tileFor(id, 0);
    const l = (u0: number, v0: number, u1: number, v1: number) => uvPx(u0, v0, u1, v1);
    return [
      {
        b: [5 / 16, 0, 5 / 16, 11 / 16, 7 / 16, 11 / 16],
        tiles: [t, t, t, t, t, t],
        crops: [l(0, 2, 6, 9), l(0, 2, 6, 9), l(0, 9, 6, 15), l(0, 9, 6, 15), l(0, 2, 6, 9), l(0, 2, 6, 9)],
      },
      {
        b: [6 / 16, 7 / 16, 6 / 16, 10 / 16, 9 / 16, 10 / 16],
        tiles: [t, t, t, t, t, t],
        crops: [l(1, 0, 5, 2), l(1, 0, 5, 2), null, l(1, 10, 5, 14), l(1, 0, 5, 2), l(1, 0, 5, 2)],
      },
      {
        b: [6.5 / 16, 9 / 16, 7.9 / 16, 9.5 / 16, 11 / 16, 8.1 / 16],
        tiles: [t, t, t, t, t, t],
        crops: [null, null, null, null, l(11, 1, 14, 3), l(11, 1, 14, 3)],
      },
      {
        b: [7.9 / 16, 9 / 16, 6.5 / 16, 8.1 / 16, 11 / 16, 9.5 / 16],
        tiles: [t, t, t, t, t, t],
        crops: [l(11, 10, 14, 12), l(11, 10, 14, 12), null, null, null, null],
      },
    ];
  }
  if (id === B.BELL) {
    // 2.21: waniliowy dzwon (bell_floor.json) – drewniana belka na dwóch
    // kamiennych słupkach. Sam dzwon jest w wanilii rendererem encji, więc
    // dokładamy go z tekstury `entity/bell/bell_body` jako trzy zwężające się
    // bryły (kark, korpus i dolna krawędź).
    const bar = T.planks;
    const post = T.stone;
    const gold = T.bell_body;
    const b = (u0: number, v0: number, u1: number, v1: number) => uvPx(u0, v0, u1, v1);
    const bell = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, crop: readonly [number, number, number, number]): SpecialBox => ({
      b: [x0 / 16, y0 / 16, z0 / 16, x1 / 16, y1 / 16, z1 / 16],
      tiles: [gold, gold, gold, gold, gold, gold],
      crops: [crop, crop, crop, crop, crop, crop],
    });
    return [
      {
        b: [2 / 16, 13 / 16, 7 / 16, 14 / 16, 15 / 16, 9 / 16],
        tiles: [bar, bar, bar, bar, bar, bar],
        crops: [b(2, 2, 14, 4), b(2, 3, 14, 5), b(2, 3, 14, 5), b(2, 3, 14, 5), b(2, 2, 14, 4), b(2, 3, 14, 5)],
      },
      {
        b: [14 / 16, 0, 6 / 16, 1, 1, 10 / 16],
        tiles: [post, post, post, post, post, post],
        crops: [b(0, 1, 2, 16), b(0, 1, 4, 16), b(0, 0, 2, 4), b(0, 0, 2, 4), b(0, 1, 2, 16), b(0, 1, 2, 16)],
      },
      {
        b: [0, 0, 6 / 16, 2 / 16, 1, 10 / 16],
        tiles: [post, post, post, post, post, post],
        crops: [b(0, 1, 2, 16), b(0, 1, 4, 16), b(0, 0, 2, 4), b(0, 0, 2, 4), b(0, 1, 2, 16), b(0, 1, 2, 16)],
      },
      bell(4, 4, 4, 12, 8, 12, [4, 5.5, 12, 9.5]),
      bell(5.5, 8, 5.5, 10.5, 12, 10.5, [0, 9.5, 12, 13]),
      bell(6.5, 12, 6.5, 9.5, 14, 9.5, [3, 13, 9, 16]),
    ];
  }
  if (id === B.BREWING) {
    // 2.21: waniliowy statyw alchemiczny (brewing_stand.json) – słupek 2×14 px
    // i trzy ramiona podstawy z tekstury `brewing_stand(_base)`.
    const stand = T.brewing_top;
    const base = T.brewing_side;
    const b = (u0: number, v0: number, u1: number, v1: number) => uvPx(u0, v0, u1, v1);
    return [
      {
        b: [7 / 16, 0, 7 / 16, 9 / 16, 14 / 16, 9 / 16],
        tiles: [stand, stand, stand, stand, stand, stand],
        crops: [b(7, 2, 9, 16), b(7, 2, 9, 16), b(7, 7, 9, 9), b(7, 7, 9, 9), b(7, 2, 9, 16), b(7, 2, 9, 16)],
      },
      {
        b: [9 / 16, 0, 5 / 16, 15 / 16, 2 / 16, 11 / 16],
        tiles: [base, base, base, base, base, base],
        crops: [b(5, 14, 11, 16), b(5, 14, 11, 16), b(9, 5, 15, 11), b(9, 5, 15, 11), b(9, 14, 15, 16), b(9, 14, 15, 16)],
      },
      {
        b: [1 / 16, 0, 1 / 16, 7 / 16, 2 / 16, 7 / 16],
        tiles: [base, base, base, base, base, base],
        crops: [b(1, 14, 7, 16), b(1, 14, 7, 16), b(1, 1, 7, 7), b(1, 1, 7, 7), b(1, 14, 7, 16), b(1, 14, 7, 16)],
      },
      {
        b: [1 / 16, 0, 9 / 16, 7 / 16, 2 / 16, 15 / 16],
        tiles: [base, base, base, base, base, base],
        crops: [b(9, 14, 15, 16), b(9, 14, 15, 16), b(1, 9, 7, 15), b(1, 9, 7, 15), b(1, 14, 7, 16), b(1, 14, 7, 16)],
      },
    ];
  }
  // 2.29: płyta drzwi liczona jednym źródłem prawdy (`doorPlate`), więc model
  // i kolizja zawsze się zgadzają – także dla otwartych drzwi i obu zawiasów.
  if (isDoor(id)) return doorBoxes(id);
  return null;
}

export class World {
  seed: number;
  /** Flat worlds are a single grass layer at FLAT_H – handy for building. */
  flat: boolean;
  /**
   * Nether worlds are a completely separate dimension: own terrain, own chunk
   * map, own player modifications. Nothing is ever stamped onto the overworld,
   * so the two maps can never bleed into each other.
   */
  readonly isNether: boolean;
  chunks = new Map<string, Chunk>();
  mods = new Map<string, Map<number, number>>();
  dirty = new Set<string>();
  /**
   * 2.10: wywoływane po każdej zmianie bloku w czasie gry (nie przy
   * generowaniu terenu ani przy odtwarzaniu zapisu). Multiplayer wysyła
   * z tego listę zmian pozostałym graczom.
   */
  onEdit: ((x: number, y: number, z: number, id: number) => void) | null = null;
  private n1: SimplexNoise;
  private n2: SimplexNoise;
  private n3: SimplexNoise;
  private nCave: SimplexNoise;
  private nCave2: SimplexNoise;
  private nTemp: SimplexNoise;
  private nRiver: SimplexNoise;
  /** 2.19: przesunięcie próbek szumu – (0,0) nie jest już płaskim środkiem mapy. */
  private ox = 0;
  private oz = 0;
  private vctx: VillageContext | null = null;

  constructor(seed: number, flat = false, nether = false) {
    this.seed = seed;
    this.flat = flat && !nether;
    this.isNether = nether;
    this.n1 = new SimplexNoise(seed);
    this.n2 = new SimplexNoise(seed + 1);
    this.n3 = new SimplexNoise(seed + 2);
    this.nCave = new SimplexNoise(seed + 3);
    this.nCave2 = new SimplexNoise(seed + 4);
    this.nTemp = new SimplexNoise(seed + 5);
    this.nRiver = new SimplexNoise(seed + 7);
    this.ox = ((seed >>> 0) % 4096) * 3.17 + 111;
    this.oz = (((seed >>> 12) >>> 0) % 4096) * 2.71 + 37;
  }

  static key(cx: number, cz: number) {
    return cx + ',' + cz;
  }

  // ---------- Terrain ----------
  /**
   * 2.8: współrzędne próbek wysokości w obrębie jednego chunku są liczone
   * wielokrotnie (trzcina, drzewa, wioski). Cache na czas generowania oszczędza
   * dziesiątki tysięcy wywołań szumu, nie zmieniając ani jednego bloku.
   */
  private genSurface: Map<number, SurfaceInfo> | null = null;

  surface(x: number, z: number): SurfaceInfo {
    const cache = this.genSurface;
    if (cache) {
      // Klucz numeryczny obejmuje cały typowy zasięg świata (±32 768 kratek).
      const key = (x + 32768) * 65536 + (z + 32768);
      const hit = cache.get(key);
      if (hit) return hit;
      const info = this.computeSurface(x, z);
      cache.set(key, info);
      return info;
    }
    return this.computeSurface(x, z);
  }

  private computeSurface(x: number, z: number): SurfaceInfo {
    if (this.isNether) return { h: this.netherFloorH(x, z), biome: 'Nether', temp: 0, forest: 0 };
    if (this.flat) return { h: FLAT_H, biome: 'Równiny', temp: 0, forest: 0 };

    // 2.19: kontynenty, pagórki i pasma górskie na TRZECH różnych skalach.
    // Wcześniej kontynenty i pagórki miały zbliżony rozmiar, przez co morza
    // i krainy tworzyły „kamuflaż” z drobnych łatek. Teraz ocean jest
    // oceanem, a las lasem – granice biomów mają setki bloków.
    const px = x + this.ox;
    const pz = z + this.oz;
    const cont = this.n1.fbm2D(px / 2600, pz / 2600, 5);
    const hills = this.n2.fbm2D(px / 380, pz / 380, 4);
    const ridge = 1 - Math.abs(this.n3.noise2D(px / 700, pz / 700));
    const mf = this.n3.fbm2D(px / 1900 + 50, pz / 1900 - 50, 3);
    const mountain = Math.max(0, Math.min(1, (mf - 0.18) * 2.6));
    // Im dalej w głąb lądu, tym więcej pagórków – jak w grze.
    const inland = Math.min(1, Math.max(0, (cont + 0.18) * 2.4));
    let h = 66 + cont * 46 + hills * 8 * (0.35 + inland * 0.9) + mountain * ridge * ridge * 46;

    // Rzeki: wąskie, kręte doliny tnące ląd, ale nie wysokie góry. Woda
    // wypełnia je do poziomu morza, więc krainy rozdzielają się naturalnie.
    const riverN = Math.abs(this.nRiver.noise2D(px / 1500 + 613, pz / 1500 - 419));
    if (riverN < 0.06 && h < SEA + 34 && h > SEA - 6) {
      const t = Math.min(1, Math.max(0, riverN / 0.06));
      // 0 na środku rzeki, 1 na brzegu – wygładzone na całym przedziale.
      const ease = t * t * (3 - 2 * t);
      h = (SEA - 3) + (h - (SEA - 3)) * ease;
    }

    h = Math.floor(Math.max(6, Math.min(CH - 12, h)));

    // 2.19: klimat czytany na dużej skali – biom ma setki bloków szerokości.
    const temp = this.nTemp.fbm2D(px / 2200, pz / 2200, 4);
    const forest = this.nTemp.fbm2D(px / 1500 + 300, pz / 1500 - 300, 4);
    let biome: Biome;
    if (h < SEA - 4) biome = 'Ocean';
    else if (h <= SEA + 2) biome = temp < -0.42 ? 'Tundra' : 'Plaża';
    else if (h > 102) biome = temp < -0.1 ? 'Tundra' : 'Góry';
    else if (temp > 0.34 && forest < 0.02) biome = 'Pustynia';
    else if (temp < -0.4) biome = 'Tundra';
    else if (temp > 0.16 && forest > 0.34) biome = 'Dżungla';
    else if (temp > 0.1 && forest < -0.16) biome = 'Sawanna';
    else if (temp > -0.12 && forest > 0.36 && h < SEA + 9) biome = 'Bagno';
    else if (forest > 0.28) biome = forest > 0.46 ? 'Brzozowy las' : 'Las';
    else biome = 'Równiny';
    // Bagno to nizina: teren nie może wystrzelić nad poziom morza.
    if (biome === 'Bagno') h = Math.min(h, SEA + 2);
    return { h, biome, temp, forest };
  }

  /**
   * 2.8: jednowpisowy cache ostatnio użytego chunku. `peekBlock` jest wołany
   * tysiące razy na sekundę (fizyka, AI mobów, cząstki) i za każdym razem
   * składał nowy klucz tekstowy „cx,cz”. Teraz najczęstszy przypadek – ten sam
   * chunk co przed chwilą – to jedno porównanie liczb.
   */
  private lastCx = 0x7fffffff;
  private lastCz = 0x7fffffff;
  private lastChunk: Chunk | null = null;

  private chunkFast(cx: number, cz: number): Chunk | null {
    if (cx === this.lastCx && cz === this.lastCz) return this.lastChunk;
    const c = this.chunks.get(World.key(cx, cz)) ?? null;
    if (c) {
      this.lastCx = cx;
      this.lastCz = cz;
      this.lastChunk = c;
    }
    return c;
  }

  /** Usuwa chunk z pamięci (także z cache) – używane przy zwalnianiu zasięgu. */
  releaseChunk(cx: number, cz: number): Chunk | null {
    const c = this.chunks.get(World.key(cx, cz)) ?? null;
    if (!c) return null;
    this.chunks.delete(World.key(cx, cz));
    if (this.lastChunk === c) {
      this.lastChunk = null;
      this.lastCx = 0x7fffffff;
      this.lastCz = 0x7fffffff;
    }
    return c;
  }

  getChunk(cx: number, cz: number): Chunk {
    const k = World.key(cx, cz);
    let c = this.chunks.get(k);
    if (!c) {
      c = new Chunk(cx, cz);
      c.nether = this.isNether;
      this.generate(c);
      this.chunks.set(k, c);
      this.lastCx = cx;
      this.lastCz = cz;
      this.lastChunk = c;
      // 2.8: nowy chunk zmienia widoczne krawędzie sąsiadów. Bez oznaczenia
      // ich jako brudne po powrocie w odwiedzony rejon zostawały dziury w
      // ścianach (siatka sąsiada była liczona, gdy ten chunk nie istniał).
      for (let dx = -1; dx <= 1; dx++)
        for (let dz = -1; dz <= 1; dz++) {
          if (dx === 0 && dz === 0) continue;
          const key = World.key(cx + dx, cz + dz);
          const neighbor = this.chunks.get(key);
          if (neighbor && neighbor.built) this.dirty.add(key);
        }
    }
    return c;
  }

  hasChunk(cx: number, cz: number) {
    return this.chunks.has(World.key(cx, cz));
  }

  private generate(c: Chunk) {
    // 2.8: cache powierzchni żyje tylko podczas generowania jednego chunku.
    const previous = this.genSurface;
    this.genSurface = new Map();
    try {
      this.generateInner(c);
    } finally {
      this.genSurface = previous;
    }
    c.refreshEmitters();
    c.revision++;
  }

  private generateInner(c: Chunk) {
    if (this.isNether) { this.generateNether(c); return; }
    if (this.flat) { this.generateFlat(c); return; }
    const d = c.data;
    const ox = c.cx * CS, oz = c.cz * CS;
    const s = this.seed;
    let maxY = SEA;
    const surf: { h: number; biome: Biome }[] = [];
    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        const wx = ox + x, wz = oz + z;
        const info = this.surface(wx, wz);
        surf.push(info);
        const h = info.h;
        if (h + 8 > maxY) maxY = h + 8;
        const biome = info.biome;
        const sandy = biome === 'Pustynia' || biome === 'Plaża' || biome === 'Ocean';
        for (let y = 0; y <= Math.max(h, SEA); y++) {
          let id: number = B.AIR;
          if (y === 0 || (y < 4 && hash(wx, y, wz, s) < 0.5 - y * 0.12)) id = B.BEDROCK;
          else if (y < h - 3) {
            id = B.STONE;
            if (biome === 'Pustynia' && y > h - 8) id = B.SANDSTONE;
          } else if (y < h) {
            id = sandy ? (biome === 'Ocean' && y < SEA - 6 ? B.GRAVEL : B.SAND) : biome === 'Bagno' && y >= h - 3 ? B.MUD : B.DIRT;
            if (biome === 'Góry' && h > 100) id = B.STONE;
          } else if (y === h) {
            if (biome === 'Ocean') id = hash(wx, 7, wz, s) < 0.2 ? B.CLAY : h < SEA - 8 ? B.GRAVEL : B.SAND;
            else if (sandy) id = B.SAND;
            else if (biome === 'Tundra') id = B.SNOW;
            else if (biome === 'Bagno') id = B.MUD;
            else if (biome === 'Góry') id = h > 108 ? B.SNOW : h > 98 ? B.STONE : B.GRASS;
            else id = h < SEA ? B.DIRT : B.GRASS;
          } else if (y <= SEA) {
            id = biome === 'Tundra' && y === SEA ? B.ICE : B.WATER;
          }

          // Caves
          if (id !== B.AIR && id !== B.WATER && id !== B.BEDROCK && id !== B.ICE && y > 4) {
            const underWater = h < SEA + 2 && y > h - 4;
            // 2.19: jaskinie kończą się 3 bloki pod powierzchnią – dzięki
            // temu nie wyrywają w ziemi wielkich dziur ani kraterów.
            if (!underWater && y < h - 2) {
              const a = this.nCave.noise3D((wx + this.ox) / 45, y / 28, (wz + this.oz) / 45);
              const b2 = this.nCave2.noise3D((wx + this.ox) / 45, y / 28, (wz + this.oz) / 45);
              const cheese = y < 50 ? this.nCave.noise3D((wx + this.ox) / 90 + 100, y / 40, (wz + this.oz) / 90) : 0;
              if (a * a + b2 * b2 < 0.011 || cheese > 0.62) {
                id = y <= 10 ? B.LAVA : B.AIR;
              }
            }
          }

          // Ores
          if (id === B.STONE) {
            const r = hash(wx, y, wz, s + 77);
            const cl = hash(wx >> 1, y >> 1, wz >> 1, s + 11);
            const cl2 = hash(wx >> 1, y >> 1, wz >> 1, s + 23);
            const cl3 = hash(wx >> 1, y >> 1, wz >> 1, s + 41);
            const cl4 = hash(wx >> 1, y >> 1, wz >> 1, s + 59);
            if (y < 16 && cl < 0.012 && r < 0.6) id = B.DIAMOND_ORE;
            else if (y > 6 && y < 40 && cl3 > (biome === 'Góry' ? 0.986 : 0.9965) && r < 0.6) id = B.EMERALD_ORE;
            else if (y < 16 && cl4 > 0.04 && cl4 < 0.07 && r < 0.55) id = B.REDSTONE_ORE;
            else if (y < 32 && cl > 0.985 && r < 0.6) id = B.GOLD_ORE;
            else if (y < 64 && cl > 0.02 && cl < 0.045 && r < 0.6) id = B.IRON_ORE;
            else if (y < 44 && y > 8 && cl2 < 0.016 && r < 0.55) id = B.LAPIS_ORE;
            else if (y < 110 && cl > 0.5 && cl < 0.56 && r < 0.65) id = B.COAL_ORE;
            else if (hash(wx >> 2, y >> 2, wz >> 2, s + 5) < 0.02) id = B.GRAVEL;
          }
          d[idx(x, y, z)] = id;
        }

      }

    // Wioski: wyrównują teren i stawiają budynki, zanim pojawią się dekoracje.
    const village = applyVillages(d, c.cx, c.cz, this.villageContext());
    const vmask = village.mask;
    if (village.top > maxY) maxY = village.top;

    // Surface decoration (pomija kolumny zajęte przez wioskę)
    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        if (vmask[z * CS + x]) continue;
        const wx = ox + x, wz = oz + z;
        const info = surf[z * CS + x];
        const h = info.h;
        const biome = info.biome;
        const top = d[idx(x, h, z)];
        if (biome === 'Bagno' && h < SEA && SEA + 1 < CH && d[idx(x, SEA, z)] === B.WATER && hash(wx, 2, wz, s + 154) < 0.12) {
          d[idx(x, SEA + 1, z)] = B.LILY_PAD;
        }
        if (top === B.GRASS && h + 1 < CH) {
          const r = hash(wx, 3, wz, s + 9);
          const grassChance = biome === 'Równiny' ? 0.22 : biome === 'Dżungla' ? 0.32 : biome === 'Bagno' ? 0.28 : biome === 'Sawanna' ? 0.04 : 0.1;
          if (r < grassChance) d[idx(x, h + 1, z)] = B.TALLGRASS;
          else if (r < grassChance + (biome === 'Dżungla' ? 0.035 : 0.012)) d[idx(x, h + 1, z)] = B.FLOWER_RED;
          else if (r < grassChance + 0.024) d[idx(x, h + 1, z)] = B.FLOWER_YELLOW;
          else if (r > 0.9995) d[idx(x, h + 1, z)] = B.PUMPKIN;
        }
        if (top === B.SAND && biome === 'Pustynia') {
          const r = hash(wx, 4, wz, s + 19);
          if (r < 0.005 && x > 0 && x < 15 && z > 0 && z < 15) {
            const hh = 1 + Math.floor(hash(wx, 5, wz, s) * 3);
            for (let i = 1; i <= hh; i++) d[idx(x, h + i, z)] = B.CACTUS;
          }
        }
        // Sugar cane: grass/sand right next to water, up to 3 blocks tall.
        if ((top === B.GRASS || top === B.SAND || top === B.DIRT) && h + 3 < CH) {
          let nearWater = false;
          // the stalk itself must stand on dry ground: a shore one block above sea level
          if (h >= SEA && h <= SEA + 2) {
            for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
              if (this.surface(wx + dx, wz + dz).h < SEA) { nearWater = true; break; }
            }
          }
          if (nearWater && hash(wx, 6, wz, s + 31) < 0.28) {
            const hh = 1 + Math.floor(hash(wx, 7, wz, s + 32) * 3);
            for (let i = 1; i <= hh; i++) d[idx(x, h + i, z)] = B.SUGARCANE;
          }
        }
      }

    // Trees (can cross chunk boundaries)
    for (let tz = oz - 3; tz < oz + CS + 3; tz++)
      for (let tx = ox - 3; tx < ox + CS + 3; tx++) {
        const r = hash(tx, 1, tz, s + 3);
        if (r > 0.04) continue;
        const inside = tx >= ox && tx < ox + CS && tz >= oz && tz < oz + CS;
        if (inside && vmask[(tz - oz) * CS + (tx - ox)]) continue;
        const info = inside ? surf[(tz - oz) * CS + (tx - ox)] : this.surface(tx, tz);
        let chance = 0;
        if (info.biome === 'Las') chance = 0.035;
        else if (info.biome === 'Brzozowy las') chance = 0.03;
        else if (info.biome === 'Dżungla') chance = 0.045;
        else if (info.biome === 'Bagno') chance = 0.025;
        else if (info.biome === 'Sawanna') chance = 0.008;
        else if (info.biome === 'Równiny') chance = 0.003;
        else if (info.biome === 'Tundra') chance = 0.006;
        else if (info.biome === 'Góry' && info.h < 98) chance = 0.008;
        if (r > chance) continue;
        if (info.h <= SEA) continue;
        const kind = treeKindForBiome(info.biome, hash(tx, 2, tz, s));
        const top = this.growTree(c, tx, tz, info.h + 1, kind === 'birch', vmask, kind);
        if (top > maxY) maxY = top;
      }

    // Buried chests in caves. Does not change terrain height, only fills an existing air pocket.
    for (let n = 0; n < 3; n++) {
      if (hash(ox + n, 80, oz, s) > 0.42) continue;
      const lx = 1 + Math.floor(hash(ox, 81 + n, oz, s) * 14);
      const lz = 1 + Math.floor(hash(ox, 91 + n, oz, s) * 14);
      if (vmask[lz * CS + lx]) continue;
      const colH = surf[lz * CS + lx].h;
      for (let y = 8; y < colH - 3 && y < 52; y++) {
        if (d[idx(lx, y, lz)] !== B.AIR || d[idx(lx, y + 1, lz)] !== B.AIR) continue;
        const under = d[idx(lx, y - 1, lz)];
        if (under !== B.STONE && under !== B.COBBLE && under !== B.DIRT) continue;
        let walls = 0;
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as [number, number][]) {
          const nb = d[idx(lx + dx, y, lz + dz)];
          if (nb === B.STONE || nb === B.DIRT || nb === B.GRAVEL || nb === B.COBBLE) walls++;
        }
        if (walls < 2) continue;
        d[idx(lx, y, lz)] = B.LOOT_CHEST;
        if (y + 2 > maxY) maxY = y + 2;
        break;
      }
    }

    c.maxY = Math.min(CH - 1, maxY);
    this.applyMods(c);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) c.recomputeHeight(x, z);
    // Wyrównany grunt wioski wygrywa z „najwyższym blokiem”: dach domu ani
    // tafla wody w studni nie mogą udawać poziomu terenu, bo po nim stawiamy
    // mieszkańców i moby.
    for (let i = 0; i < vmask.length; i++) if (vmask[i]) c.heightMap[i] = village.ground[i];
  }

  /**
   * 2.8.2: stawia drzewo z `trees.ts`, przycinając je do tego chunku.
   * Kształt jest deterministyczny (zależy od pozycji i ziarna), więc korona
   * leżąca na granicy dwóch chunków wygląda w obu miejscach identycznie.
   * Zwraca najwyższy zajęty blok – do księgowania `maxY`.
   */
  private growTree(c: Chunk, tx: number, tz: number, base: number, birch: boolean, skip?: Uint8Array, kind?: TreeKind): number {
    const d = c.data;
    const ox = c.cx * CS, oz = c.cz * CS;
    const shape = treeShape(kind ?? (birch ? 'birch' : 'oak'), tx, tz, this.seed);
    let maxY = base;
    for (const b of shape.blocks) {
      const lx = tx + b.dx - ox, lz = tz + b.dz - oz;
      if (lx < 0 || lx >= CS || lz < 0 || lz >= CS) continue;
      if (skip && skip[lz * CS + lx]) continue;
      const y = base + b.dy;
      if (y < 0 || y >= CH) continue;
      const i = idx(lx, y, lz);
      const cur = d[i];
      const isLog = b.id === B.LOG || b.id === B.BIRCH_LOG || b.id === B.ACACIA_LOG;
      // Pień zawsze zajmuje swoje miejsce, liście tylko wolne przestrzenie
      // (nie zamalowują sąsiedniego drzewa, wody ani domów).
      if (!isLog && !(cur === B.AIR || RENDER[cur] === 1 || IS_LEAFY[cur])) continue;
      d[i] = b.id;
      if (y > maxY) maxY = y;
    }
    // Ziemia pod pniem – jak w klasyce, pień nigdy nie stoi na trawie.
    const gx = tx - ox, gz = tz - oz;
    if (gx >= 0 && gx < CS && gz >= 0 && gz < CS && base - 1 >= 0) {
      const gi = idx(gx, base - 1, gz);
      if (d[gi] === B.GRASS || d[gi] === B.SNOW) d[gi] = B.DIRT;
    }
    return maxY;
  }

  /** Superflat: one grass layer at FLAT_H, ores below, no caves and a few trees. */
  private generateFlat(c: Chunk) {
    const d = c.data;
    const ox = c.cx * CS, oz = c.cz * CS;
    const s = this.seed;
    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        const wx = ox + x, wz = oz + z;
        for (let y = 0; y <= FLAT_H; y++) {
          let id: number = B.AIR;
          if (y === 0) id = B.BEDROCK;
          else if (y < FLAT_H - 3) {
            id = B.STONE;
            const r = hash(wx, y, wz, s + 77);
            const cl = hash(wx >> 1, y >> 1, wz >> 1, s + 11);
            const cl2 = hash(wx >> 1, y >> 1, wz >> 1, s + 23);
            const cl3 = hash(wx >> 1, y >> 1, wz >> 1, s + 41);
              const cl4 = hash(wx >> 1, y >> 1, wz >> 1, s + 59);
            if (y < 16 && cl < 0.012 && r < 0.6) id = B.DIAMOND_ORE;
            else if (y > 6 && y < 40 && cl3 > 0.9965 && r < 0.6) id = B.EMERALD_ORE;
            else if (y < 16 && cl4 > 0.04 && cl4 < 0.07 && r < 0.55) id = B.REDSTONE_ORE;
            else if (y < 32 && cl > 0.985 && r < 0.6) id = B.GOLD_ORE;
            else if (cl > 0.02 && cl < 0.045 && r < 0.6) id = B.IRON_ORE;
            else if (y < 44 && y > 8 && cl2 < 0.016 && r < 0.55) id = B.LAPIS_ORE;
            else if (cl > 0.5 && cl < 0.56 && r < 0.65) id = B.COAL_ORE;
          } else if (y < FLAT_H) id = B.DIRT;
          else id = B.GRASS;
          d[idx(x, y, z)] = id;
        }
      }

    // Wioski także na płaskim świecie – tam zawsze jest równina.
    const village = applyVillages(d, c.cx, c.cz, this.villageContext());
    const vmask = village.mask;
    let maxY = Math.max(FLAT_H + 8, village.top);

    for (let z = 0; z < CS; z++)
      for (let x = 0; x < CS; x++) {
        if (vmask[z * CS + x]) continue;
        const wx = ox + x, wz = oz + z;
        const r = hash(wx, 3, wz, s + 9);
        if (r < 0.18) d[idx(x, FLAT_H + 1, z)] = B.TALLGRASS;
        if (r > 0.9975 && x > 0 && x < 15 && z > 0 && z < 15) {
          const hh = 1 + Math.floor(hash(wx, 7, wz, s + 32) * 3);
          for (let i = 1; i <= hh; i++) d[idx(x, FLAT_H + i, z)] = B.SUGARCANE;
        }
        else if (r < 0.022) d[idx(x, FLAT_H + 1, z)] = B.FLOWER_RED;
        else if (r < 0.034) d[idx(x, FLAT_H + 1, z)] = B.FLOWER_YELLOW;
        else if (r > 0.9995) d[idx(x, FLAT_H + 1, z)] = B.PUMPKIN;
      }

    // sparse trees so wood is still obtainable
    for (let tz = oz - 2; tz < oz + CS + 2; tz++)
      for (let tx = ox - 2; tx < ox + CS + 2; tx++) {
        if (hash(tx, 1, tz, s + 3) > 0.006) continue;
        const inside = tx >= ox && tx < ox + CS && tz >= oz && tz < oz + CS;
        if (inside && vmask[(tz - oz) * CS + (tx - ox)]) continue;
        const top = this.growTree(c, tx, tz, FLAT_H + 1, hash(tx, 2, tz, s) < 0.3, vmask);
        if (top > maxY) maxY = top;
      }

    c.maxY = Math.min(CH - 1, maxY);
    this.applyMods(c);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) c.recomputeHeight(x, z);
    // Wyrównany grunt wioski wygrywa z „najwyższym blokiem”: dach domu ani
    // tafla wody w studni nie mogą udawać poziomu terenu, bo po nim stawiamy
    // mieszkańców i moby.
    for (let i = 0; i < vmask.length; i++) if (vmask[i]) c.heightMap[i] = village.ground[i];
  }

  /** Replays the player's block changes onto a freshly generated chunk. */
  private applyMods(c: Chunk) {
    const m = this.mods.get(World.key(c.cx, c.cz));
    if (!m) return;
    const d = c.data;
    for (const [i, id] of m) {
      d[i] = id;
      const y = Math.floor(i / (CS * CS));
      if (y + 2 > c.maxY) c.maxY = Math.min(CH - 1, y + 2);
    }
  }

  // ---------- Wioski (1.6) ----------

  /** Deterministyczny kontekst generatora wsi (ten sam dla całego świata). */
  villageContext(): VillageContext {
    if (!this.vctx) {
      this.vctx = { seed: this.seed, flat: this.flat, sea: SEA, surface: (x, z) => this.surface(x, z) };
    }
    return this.vctx;
  }

  /** Wioska, na której terenie stoi punkt (albo null). */
  villageAt(x: number, z: number): Village | null {
    if (this.isNether) return null; // osady nie istnieją w Netherze
    return villageAt(x, z, this.villageContext());
  }

  /** Wszystkie wioski, których obszar obejmuje prostokąt. */
  villagesIn(x0: number, z0: number, x1: number, z1: number): Village[] {
    if (this.isNether) return [];
    return villagesOverlapping(x0, z0, x1, z1, this.villageContext());
  }

  /** Najbliższa wioska – używane przez komendę /village i spawn mieszkańców. */
  nearestVillage(x: number, z: number, cells = 3) {
    if (this.isNether) return null;
    return nearestVillage(x, z, this.villageContext(), cells);
  }

  // ---------- Nether (osobny wymiar, wersja 1.7+) ----------

  /** Wysokość podłogi Netheru – falujące pagórki ok. 16–72. */
  private netherFloorH(gx: number, gz: number): number {
    const n = this.n1.fbm2D(gx / 90, gz / 90, 3);
    const m = this.n2.fbm2D(gx / 300, gz / 300, 2);
    return Math.max(18, Math.min(74, Math.floor(46 + n * 13 + m * 15)));
  }

  /** Dolna krawędź skalnego stropu – zostawia ~30 bloków otwartej przestrzeni. */
  private netherCeilH(gx: number, gz: number): number {
    const n = this.n3.fbm2D(gx / 70, gz / 70, 3);
    return Math.floor(102 + n * 9);
  }

  /**
   * Pełny generator Netheru – wywoływany przy tworzeniu chunka, deterministycznie
   * (tylko hash + szumy, zero Math.random). Osobna mapa = zero nakładania się
   * światów; teren nigdy nie „nadpisuje" nadświatu.
   */
  private generateNether(c: Chunk) {
    const d = c.data;
    const ox = c.cx * CS, oz = c.cz * CS;
    const s = this.seed;
    let maxY = 0;

    for (let z = 0; z < CS; z++) {
      for (let x = 0; x < CS; x++) {
        const gx = ox + x, gz = oz + z;
        const fh = this.netherFloorH(gx, gz);
        const ch = this.netherCeilH(gx, gz);
        if (ch + 10 > maxY) maxY = ch + 10;
        for (let y = 0; y < CH; y++) {
          let id: number = B.AIR;
          if (y === 0) id = B.BEDROCK;
          else if (y <= 4) id = B.LAVA;                    // morze lawy na dnie
          else if (y <= fh) {
            id = B.NETHERRACK;
            // jaskinie – tylko dobrze pod powierzchnią, żeby podłoga była płaska
            if (y > 10 && y < fh - 5) {
              const a = this.nCave.noise3D(gx / 42, y / 24, gz / 42);
              const b = this.nCave2.noise3D(gx / 40, y / 22, gz / 40);
              if (a * a + b * b < 0.010) id = y <= 13 ? B.LAVA : B.AIR;
            }
            // rudy: kwarc i głęboka magma
            if (id === B.NETHERRACK && y < fh - 6 && y < 64) {
              const r = hash(gx, y, gz, s + 99);
              if (r < 0.014) id = B.QUARTZ_ORE;
              else if (y < 20 && r > 0.02 && r < 0.028) id = B.MAGMA;
            }
          } else if (y < ch) {
            id = B.AIR;                                    // olbrzymia jaskinia
          } else {
            id = B.NETHERRACK;
            // kieszenie w pierwszych blokach stropu
            if (y < ch + 8 && this.nCave.noise3D(gx / 34, y / 16, gz / 34) > 0.45) id = B.AIR;
            else if (y >= 122) id = y >= 126 || hash(gx, y, gz, s + 17) < 0.35 ? B.BEDROCK : B.NETHERRACK;
          }
          d[idx(x, y, z)] = id;
        }

        // plamy na powierzchni: piasek dusz, gleba, czernit, magma
        if (d[idx(x, fh, z)] === B.NETHERRACK) {
          const r = hash(gx, 0, gz, s + 31);
          if (r < 0.05) d[idx(x, fh, z)] = B.SOUL_SAND;
          else if (r < 0.075) d[idx(x, fh, z)] = B.SOUL_SOIL;
          else if (r < 0.095) d[idx(x, fh, z)] = B.BLACKSTONE;
          else if (r < 0.105) d[idx(x, fh, z)] = B.MAGMA;
        }

        // jasnogłazy zwisające pod stropem
        let prevAir = false;
        for (let y = fh + 1; y < CH; y++) {
          const i = idx(x, y, z);
          const id = d[i];
          if (id === B.AIR) { prevAir = true; continue; }
          if (prevAir && id === B.NETHERRACK && y > fh + 8 && hash(gx, y, gz, s + 55) < 0.07) {
            d[i] = B.GLOWSTONE;
            const depth = 1 + Math.floor(hash(gx, y - 1, gz, s + 56) * 3);
            for (let k = 1; k <= depth && y - k > fh + 6; k++) {
              if (d[idx(x, y - k, z)] !== B.AIR) break;
              d[idx(x, y - k, z)] = B.GLOWSTONE;
            }
          }
          prevAir = false;
        }
      }
    }

    // bazaltowe filary od podłogi do stropu
    if (hash(ox, oz, 3, s + 101) < 0.10) {
      const px = 2 + Math.floor(hash(ox, 4, oz, s + 102) * (CS - 4));
      const pz = 2 + Math.floor(hash(ox, 5, oz, s + 103) * (CS - 4));
      const fh = this.netherFloorH(ox + px, oz + pz);
      const ch = this.netherCeilH(ox + px, oz + pz);
      for (let y = fh + 1; y < ch; y++) d[idx(px, y, pz)] = B.BASALT;
    }

    c.maxY = Math.min(CH - 1, maxY);
    this.applyMods(c);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) c.recomputeHeight(x, z);
  }

  // ---------- Access ----------
  getBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return B.AIR;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.getChunk(cx, cz);
    return c.data[idx(x - cx * CS, y, z - cz * CS)];
  }

  // Non-generating version (returns AIR if chunk missing)
  peekBlock(x: number, y: number, z: number): number {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return B.AIR;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.chunkFast(cx, cz);
    if (!c) return B.STONE;
    return c.data[idx(x - cx * CS, y, z - cz * CS)];
  }

  heightAt(x: number, z: number): number {
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.chunkFast(cx, cz) ?? this.getChunk(cx, cz);
    return c.heightMap[(z - cz * CS) * CS + (x - cx * CS)];
  }

  setBlock(x: number, y: number, z: number, id: number) {
    if (y < 0 || y >= CH) return;
    const cx = Math.floor(x / CS), cz = Math.floor(z / CS);
    const c = this.getChunk(cx, cz);
    const lx = x - cx * CS, lz = z - cz * CS;
    const i = idx(lx, y, lz);
    const previous = c.data[i];
    if (previous === id) return;
    c.data[i] = id;
    if (y + 2 > c.maxY) c.maxY = Math.min(CH - 1, y + 2);
    c.recomputeHeight(lx, lz);
    // 2.8: utrzymuje indeks świateł w zgodzie z terenem (bez pełnego skanu
    // przy stawianiu zwykłego bloku).
    if (EMIT[previous] || EMIT[id]) c.refreshEmitters();
    c.revision++;
    this.onEdit?.(x, y, z, id);
    const k = World.key(cx, cz);
    let m = this.mods.get(k);
    if (!m) { m = new Map(); this.mods.set(k, m); }
    m.set(i, id);
    this.dirty.add(k);
    // neighbors (for face culling / AO / light)
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) {
        if (dx === 0 && dz === 0) continue;
        const nx = Math.floor((x + dx) / CS), nz = Math.floor((z + dz) / CS);
        if (nx !== cx || nz !== cz) {
          const nk = World.key(nx, nz);
          if (this.chunks.has(nk)) this.dirty.add(nk);
        }
      }
    // light changes below: mark chunk dirty is enough (same column)
  }

  // Serialize modifications
  serializeMods(): Record<string, number[]> {
    const out: Record<string, number[]> = {};
    for (const [k, m] of this.mods) {
      const arr: number[] = [];
      for (const [i, id] of m) arr.push(i, id);
      out[k] = arr;
    }
    return out;
  }
  /**
   * 2.11: zmiany bloków pobrane z serwera publicznego. Wpisujemy je do `mods`
   * (tak samo jak zapis świata), więc każdy generowany później chunk od razu
   * ma właściwe bloki – bez tysiąca `setBlock` i przebudów siatki przy wejściu.
   * Chunki już wczytane aktualizujemy od razu.
   */
  seedMods(list: { x: number; y: number; z: number; id: number }[]) {
    for (const e of list) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.z) || !Number.isFinite(e.id)) continue;
      if (e.y < 0 || e.y >= CH) continue;
      const cx = Math.floor(e.x / CS), cz = Math.floor(e.z / CS);
      const lx = e.x - cx * CS, lz = e.z - cz * CS;
      const i = idx(lx, e.y, lz);
      const k = World.key(cx, cz);
      let m = this.mods.get(k);
      if (!m) {
        m = new Map();
        this.mods.set(k, m);
      }
      m.set(i, e.id);
      const c = this.chunks.get(k);
      if (!c) continue;
      if (c.data[i] === e.id) continue;
      c.data[i] = e.id;
      c.recomputeHeight(lx, lz);
      c.revision++;
      this.dirty.add(k);
    }
  }

  loadMods(data: Record<string, number[]>) {
    for (const k in data) {
      const m = new Map<number, number>();
      const arr = data[k];
      for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      this.mods.set(k, m);
    }
  }

  // ---------- Meshing ----------
  buildMesh(c: Chunk): THREE.BufferGeometry[] {
    const bufs = [new MeshBuffer(), new MeshBuffer(), new MeshBuffer()];
    const ox = c.cx * CS, oz = c.cz * CS;
    // Ensure neighbors exist
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) this.getChunk(c.cx + dx, c.cz + dz);
    const neigh: Chunk[] = [];
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) neigh.push(this.getChunk(c.cx + dx, c.cz + dz));

    const get = (x: number, y: number, z: number): number => {
      if (y < 0) return B.BEDROCK;
      if (y >= CH) return B.AIR;
      if (x >= 0 && x < CS && z >= 0 && z < CS) return c.data[idx(x, y, z)];
      const ncx = x < 0 ? 0 : x >= CS ? 2 : 1;
      const ncz = z < 0 ? 0 : z >= CS ? 2 : 1;
      const n = neigh[ncz * 3 + ncx];
      return n.data[idx(x - (ncx - 1) * CS, y, z - (ncz - 1) * CS)];
    };
    // Block light (torches, lava, lit furnaces) spread a few blocks across chunk borders.
    // The BFS scratch is module-level: buildMesh never runs re-entrantly, so a
    // rebuild only fills the buffer instead of allocating 128 KB every time.
    const PAD = 8;
    const LW = CS + PAD * 2;
    const need = LW * LW * CH;
    if (!lightScratch || lightScratch.length < need) lightScratch = new Uint8Array(need);
    else lightScratch.fill(0);
    const Lmap = lightScratch;
    const lat = (x: number, y: number, z: number) => (y * LW + (z + PAD)) * LW + (x + PAD);
    qx.length = 0;
    qy.length = 0;
    qz.length = 0;
    const seed = (x: number, y: number, z: number, lv: number) => {
      if (y < 0 || y >= CH || x < -PAD || x >= CS + PAD || z < -PAD || z >= CS + PAD) return;
      const i = lat(x, y, z);
      if (Lmap[i] >= lv) return;
      Lmap[i] = lv;
      qx.push(x); qy.push(y); qz.push(z);
    };
    // 2.8: tylko faktyczne źródła światła (indeks emitters), a nie 295 tys.
    // bloków sąsiadów skanowanych przy każdym przebudowaniu siatki.
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const chunk = neigh[(dz + 1) * 3 + (dx + 1)];
        const ox = dx * CS;
        const oz = dz * CS;
        const sources = chunk.emitters;
        for (let s = 0; s < sources.length; s++) {
          const li = sources[s];
          const y = Math.floor(li / (CS * CS));
          const rem = li - y * CS * CS;
          const z = Math.floor(rem / CS);
          const x = rem - z * CS;
          const wx = ox + x, wz = oz + z;
          if (wx < -PAD || wx >= CS + PAD || wz < -PAD || wz >= CS + PAD) continue;
          const e = EMIT[chunk.data[li]];
          if (e) seed(wx, y, wz, e);
        }
      }
    }
    const DIRS: [number, number, number][] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    for (let qi = 0; qi < qx.length; qi++) {
      const x = qx[qi], y = qy[qi], z = qz[qi];
      const lv = Lmap[lat(x, y, z)] - 1;
      if (lv <= 0) continue;
      for (let d = 0; d < 6; d++) {
        const nx = x + DIRS[d][0], ny = y + DIRS[d][1], nz = z + DIRS[d][2];
        if (ny < 0 || ny >= CH || nx < -PAD || nx >= CS + PAD || nz < -PAD || nz >= CS + PAD) continue;
        if (IS_OPAQUE[get(nx, ny, nz)]) continue;
        const i = lat(nx, ny, nz);
        if (Lmap[i] >= lv) continue;
        Lmap[i] = lv;
        qx.push(nx); qy.push(ny); qz.push(nz);
      }
    }
    const blockLight = (x: number, y: number, z: number): number => {
      if (y < 0 || y >= CH || x < -PAD || x >= CS + PAD || z < -PAD || z >= CS + PAD) return 0;
      return Lmap[lat(x, y, z)] / 15;
    };
    // 2.8.1: światło nieba liczone kolumnowo, z góry na dół. Liście tłumią je
    // stopniowo, więc pod koroną jest miękkie, zielone półcienie zamiast
    // czarnego pnia; pełny blok odcina światło całkowicie (jaskinie).
    const skyNeed = SKY_W * SKY_W * CH;
    if (!skyScratch || skyScratch.length < skyNeed) skyScratch = new Float32Array(skyNeed);
    else skyScratch.fill(0, 0, skyNeed);
    const skyMap = skyScratch;
    const skyIndex = (x: number, y: number, z: number) => (y * SKY_W + (z + SKY_PAD)) * SKY_W + (x + SKY_PAD);
    if (c.nether) {
      // 2.8.1: w Netherze nie ma nieba – otwarta jaskinia między podłogą
      // a stropem liczy się jako „na zewnątrz”, inaczej strop gasi cały wymiar.
      const floorLocal = (x: number, z: number): number => {
        const ncx = x < 0 ? 0 : x >= CS ? 2 : 1;
        const ncz = z < 0 ? 0 : z >= CS ? 2 : 1;
        const n = neigh[ncz * 3 + ncx];
        return n.heightMap[(z - (ncz - 1) * CS) * CS + (x - (ncx - 1) * CS)];
      };
      for (let z = -SKY_PAD; z < CS + SKY_PAD; z++) {
        for (let x = -SKY_PAD; x < CS + SKY_PAD; x++) {
          const fh = floorLocal(x, z);
          for (let y = 0; y < CH; y++) {
            skyMap[skyIndex(x, y, z)] = y >= fh ? 1 : Math.max(MIN_CAVE_SKY, Math.pow(0.72, fh - y));
          }
        }
      }
    } else {
      for (let z = -SKY_PAD; z < CS + SKY_PAD; z++) {
        for (let x = -SKY_PAD; x < CS + SKY_PAD; x++) {
          let sky = 1;
          for (let y = CH - 1; y >= 0; y--) {
            skyMap[skyIndex(x, y, z)] = sky;
            const id = get(x, y, z);
            if (IS_OPAQUE[id]) {
              if (IS_LEAFY[id]) {
                sky *= LEAF_SHADE;
                if (sky < MIN_SKY) sky = MIN_SKY;
              } else {
                // Poniżej pełnego bloku nie ma bezpośredniego nieba. Bufor
                // zostaje wyzerowany (szybkie `fill` na starcie), a `skyLight`
                // zamienia zero na nikłą poświatę jaskiń – bez zapisywania
                // setek komórek na kolumnę.
                break;
              }
            }
          }
        }
      }
    }
    const skyLight = (x: number, y: number, z: number): number => {
      if (y < 0) return 0;
      if (y >= CH) return 1;
      const v = skyMap[skyIndex(x, y, z)];
      return v > 0 ? v : MIN_CAVE_SKY;
    };

    const maxY = Math.min(CH - 1, c.maxY);
    for (let y = 0; y <= maxY; y++)
      for (let z = 0; z < CS; z++)
        for (let x = 0; x < CS; x++) {
          const id = c.data[idx(x, y, z)];
          if (id === 0) continue;
          const layer = LAYER[id];
          const rt = RENDER[id];
          const buf = bufs[layer];
          const special = specialBoxes(id);
          if (special) {
            const sky = skyLight(x, y, z);
            const blk = Math.max(blockLight(x, y, z), EMIT[id] / 15);
            for (const sb of special) {
              addBox(
                buf, ox + x, y, oz + z,
                sb.b[0], sb.b[1], sb.b[2], sb.b[3], sb.b[4], sb.b[5],
                sb.tiles ?? sb.side ?? tileFor(id, 0), sky, blk, sb.top, sb.bottom, sb.inset ?? 0, sb.crops
              );
            }
            continue;
          }
          if (rt === 1) {
            // cross plant
            const t = tileFor(id, 0);
            const sky = skyLight(x, y, z);
            const blk = Math.max(blockLight(x, y, z), EMIT[id] / 15);
            const skyB = sky * sky * 0.85;
            const blkB = blk * blk * 0.85;
            const wx = ox + x, wz = oz + z;
            // 2.21: waniliowy model „cross” sięga 0,05–0,95 kratki i pełnej
            // wysokości – wcześniej rośliny były o 30% mniejsze i pływały.
            const quads = [
              [[0.05, 0, 0.05], [0.95, 0, 0.95], [0.05, 1, 0.05], [0.95, 1, 0.95]],
              [[0.05, 0, 0.95], [0.95, 0, 0.05], [0.05, 1, 0.95], [0.95, 1, 0.05]],
            ];
            const uvs = [[0, 0], [1, 0], [0, 1], [1, 1]];
            for (const q of quads) {
              const n = buf.count;
              for (let k = 0; k < 4; k++) {
                const uv = tileUV(t, uvs[k][0], uvs[k][1]);
                buf.vertex(wx + q[k][0], y + q[k][1], wz + q[k][2], uv[0], uv[1], skyB, skyB, skyB, blkB, 0, 3);
              }
              buf.quad(n);
            }
            continue;
          }
          if (rt === 3) {
            // slab
            const top = isSlabTop(id);
            const y0 = top ? 0.5 : 0;
            const y1 = top ? 1 : 0.5;
            const sky = skyLight(x, y, z);
            const blk = Math.max(blockLight(x, y, z), EMIT[id] / 15);
            addBox(buf, ox + x, y, oz + z, 0, y0, 0, 1, y1, 1, tileFor(id, 0), sky, blk);
            continue;
          }
          if (rt === 4) {
            // stairs – bottom slab + top quarter
            const facing = stairsFacing(id);
            const sky = skyLight(x, y, z);
            const blk = Math.max(blockLight(x, y, z), EMIT[id] / 15);
            // bottom half
            addBox(buf, ox + x, y, oz + z, 0, 0, 0, 1, 0.5, 1, tileFor(id, 0), sky, blk);
            // top quarter depending on facing
            let x0 = 0, x1 = 1, z0 = 0, z1 = 1;
            if (facing === 0) z0 = 0; // north: top occupies north half (z 0-0.5)
            if (facing === 0) { z0 = 0; z1 = 0.5; }
            else if (facing === 2) { z0 = 0.5; z1 = 1; }
            else if (facing === 1) { x0 = 0.5; x1 = 1; }
            else if (facing === 3) { x0 = 0; x1 = 0.5; }
            addBox(buf, ox + x, y, oz + z, x0, 0.5, z0, x1, 1, z1, tileFor(id, 0), sky, blk);
            continue;
          }
          if (rt === 5) {
            // portal – thin, wobble
            const sky = skyLight(x, y, z);
            const blk = Math.max(blockLight(x, y, z), EMIT[id] / 15);
            // check orientation by neighbors: if obsidian on X sides, portal plane is Z, else X
            const obsX = IS_OPAQUE[get(x - 1, y, z)] || IS_OPAQUE[get(x + 1, y, z)];
            const obsZ = IS_OPAQUE[get(x, y, z - 1)] || IS_OPAQUE[get(x, y, z + 1)];
            if (obsX && !obsZ) {
              addBox(buf, ox + x, y, oz + z, 0.35, 0, 0, 0.65, 1, 1, tileFor(id, 0), sky, blk);
            } else {
              addBox(buf, ox + x, y, oz + z, 0, 0, 0.35, 1, 1, 0.65, tileFor(id, 0), sky, blk);
            }
            continue;
          }
          if (rt === 6) {
            // 2.21: waniliowa szyna to płaski model na wysokości 1/16 bloku –
            // wcześniej była bryłą 0,1 z rozciągniętym kafelkiem.
            const sky = skyLight(x, y, z);
            const blk = Math.max(blockLight(x, y, z), EMIT[id] / 15);
            const sh = sky * sky;
            const t = tileFor(id, 0);
            const base = buf.count;
            const yy = y + 1 / 16;
            const quadUV: [number, number][] = [[0, 1], [1, 1], [0, 0], [1, 0]];
            const xs = [ox + x, ox + x + 1, ox + x, ox + x + 1];
            const zs = [oz + z + 1, oz + z + 1, oz + z, oz + z];
            for (let k = 0; k < 4; k++) {
              const uv = tileUV(t, quadUV[k][0], quadUV[k][1]);
              buf.vertex(xs[k], yy, zs[k], uv[0], uv[1], sh, sh, sh, blk * blk, 0, 3);
            }
            buf.quad(base);
            continue;
          }
          if (rt === 9) {
            // Płot: słupek 4×16×4 + po dwa poziome szczeble w stronę każdego
            // płotu lub pełnego bloku (waniliowe 1,5 bloku wysokości).
            const sky = skyLight(x, y, z);
            const blk = Math.max(blockLight(x, y, z), EMIT[id] / 15);
            const t = tileFor(id, 0);
            const wx = ox + x, wz = oz + z;
            addBoxPx(buf, wx, y, wz, 6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16, t, sky, blk);
            const linked = (dx: number, dz: number) => {
              const n = get(x + dx, y, z + dz);
              return isFence(n) || IS_OPAQUE[n] === 1;
            };
            const rail = (dx: number, dz: number) => {
              if (dx < 0) {
                addBoxPx(buf, wx, y, wz, 0, 6 / 16, 7 / 16, 6 / 16, 9 / 16, 9 / 16, t, sky, blk);
                addBoxPx(buf, wx, y, wz, 0, 12 / 16, 7 / 16, 6 / 16, 15 / 16, 9 / 16, t, sky, blk);
              } else if (dx > 0) {
                addBoxPx(buf, wx, y, wz, 10 / 16, 6 / 16, 7 / 16, 1, 9 / 16, 9 / 16, t, sky, blk);
                addBoxPx(buf, wx, y, wz, 10 / 16, 12 / 16, 7 / 16, 1, 15 / 16, 9 / 16, t, sky, blk);
              } else if (dz < 0) {
                addBoxPx(buf, wx, y, wz, 7 / 16, 6 / 16, 0, 9 / 16, 9 / 16, 6 / 16, t, sky, blk);
                addBoxPx(buf, wx, y, wz, 7 / 16, 12 / 16, 0, 9 / 16, 15 / 16, 6 / 16, t, sky, blk);
              } else {
                addBoxPx(buf, wx, y, wz, 7 / 16, 6 / 16, 10 / 16, 9 / 16, 9 / 16, 1, t, sky, blk);
                addBoxPx(buf, wx, y, wz, 7 / 16, 12 / 16, 10 / 16, 9 / 16, 15 / 16, 1, t, sky, blk);
              }
            };
            if (linked(-1, 0)) rail(-1, 0);
            if (linked(1, 0)) rail(1, 0);
            if (linked(0, -1)) rail(0, -1);
            if (linked(0, 1)) rail(0, 1);
            continue;
          }
          if (rt === 10) {
            // Pochodnia: dokładnie 2×10 px patyczka z kafelka. Na ścianie
            // (brak podłoża) przesuwamy ją do ściany, w którą jest wbita.
            const sky = skyLight(x, y, z);
            const blk = Math.max(blockLight(x, y, z), EMIT[id] / 15);
            const t = tileFor(id, 0);
            const crop: [number, number, number, number] = [7, 0, 9, 10];
            const wx = ox + x, wz = oz + z;
            if (!IS_SOLID[get(x, y - 1, z)]) {
              const sides: [number, number][] = [[0, -1], [1, 0], [0, 1], [-1, 0]];
              let dx = 0, dz = 0;
              for (const [sx, sz] of sides) if (IS_SOLID[get(x + sx, y, z + sz)]) { dx = sx; dz = sz; break; }
              const bx = dx < 0 ? 1 / 16 : dx > 0 ? 13 / 16 : 7 / 16;
              const bz = dz < 0 ? 1 / 16 : dz > 0 ? 13 / 16 : 7 / 16;
              addBoxPx(buf, wx, y, wz, bx, 1 / 16, bz, bx + 2 / 16, 11 / 16, bz + 2 / 16, t, sky, blk, crop);
            } else {
              addBoxPx(buf, wx, y, wz, 7 / 16, 0, 7 / 16, 9 / 16, 10 / 16, 9 / 16, t, sky, blk, crop);
            }
            continue;
          }
          if (rt === 11) {
            // Lilia wodna: płaski liść tuż nad taflą wody (jak w wanilii).
            const sky = skyLight(x, y, z);
            const blk = Math.max(blockLight(x, y, z), EMIT[id] / 15);
            const sh = sky * sky * 0.95;
            const t = tileFor(id, 0);
            const base = buf.count;
            const yy = y + 0.02;
            const quadUV: [number, number][] = [[1, 1], [0, 1], [1, 0], [0, 0]];
            const xs = [ox + x, ox + x + 1, ox + x, ox + x + 1];
            const zs = [oz + z + 1, oz + z + 1, oz + z, oz + z];
            for (let k = 0; k < 4; k++) {
              const uv = tileUV(t, quadUV[k][0], quadUV[k][1]);
              buf.vertex(xs[k], yy, zs[k], uv[0], uv[1], sh, sh, sh, blk * blk, 0, 3);
            }
            buf.quad(base);
            continue;
          }
          if (rt === 12) {
            // 2.21: waniliowa skrzynia – korpus (0–10 px) i wieko (10–15 px)
            // z tekstury encji. Kafelki mają korpus w dolnych 11 i wieko
            // w górnych 5 wierszach, więc każda bryła bierze swój wycinek.
            const sky = skyLight(x, y, z);
            const blk = Math.max(blockLight(x, y, z), EMIT[id] / 15);
            const side = tileFor(id, 4);
            const top = tileFor(id, 3);
            const bottom = tileFor(id, 2);
            const front = tileFor(id, 5);
            const body: [number, number, number, number] = [0, 0, 16, 11];
            const lid: [number, number, number, number] = [0, 11, 16, 16];
            const wx = ox + x, wz = oz + z;
            addBox(buf, wx, y, wz, 1 / 16, 0, 1 / 16, 15 / 16, 10 / 16, 15 / 16,
              [side, side, bottom, side, side, front], sky, blk, undefined, undefined, 0,
              [body, body, null, null, body, body]);
            addBox(buf, wx, y, wz, 1 / 16, 10 / 16, 1 / 16, 15 / 16, 15 / 16, 15 / 16,
              [side, side, bottom, top, side, front], sky, blk, undefined, undefined, 0,
              [lid, lid, null, null, lid, lid]);
            continue;
          }
          const isLiquid = rt === 2;
          const liquidTopLow = isLiquid && get(x, y + 1, z) !== id;
          for (let f = 0; f < 6; f++) {
            const F = FACES[f];
            const nx = x + F.dir[0], ny = y + F.dir[1], nz = z + F.dir[2];
            const nb = get(nx, ny, nz);
            // 2.26: cullujemy tylko względem PEŁNYCH sześcianów. Dzięki temu
            // sąsiad 15/16-bloku (ścieżka, grządka, skrzynia) rysuje swoją
            // ścianę i znika 1-pikselowa szpara „x-ray” nad jego krawędzią.
            if (CULLS[nb]) continue;
            if (nb === id && id !== B.LEAVES && id !== B.BIRCH_LEAVES && id !== B.ACACIA_LEAVES && id !== B.JUNGLE_LEAVES) continue;
            if (isLiquid && (RENDER[nb] === 2)) continue;
            const t = tileFor(id, f);
            const sky = skyLight(nx, ny, nz);
            const blk = Math.max(blockLight(nx, ny, nz), EMIT[id] / 15);
            // 2.8: fala wody – tylko górna tafla porusza się w shaderze.
            const wave = isLiquid && F.dir[1] === 1 ? 1 : 0;
            const base = buf.count;
            const ao = [1, 1, 1, 1];
            for (let k = 0; k < 4; k++) {
              const cr = F.c[k];
              let px = cr[0], py = cr[1], pz = cr[2];
              let aoF = 1;
              if (!isLiquid) {
                // compute AO
                const d = F.dir;
                let s1x = 0, s1y = 0, s1z = 0, s2x = 0, s2y = 0, s2z = 0;
                if (d[0] !== 0) { s1y = py ? 1 : -1; s2z = pz ? 1 : -1; }
                else if (d[1] !== 0) { s1x = px ? 1 : -1; s2z = pz ? 1 : -1; }
                else { s1x = px ? 1 : -1; s2y = py ? 1 : -1; }
                // 2.8.2: miękkie AO. Liście liczą się jako PÓŁ okludera (0.55),
                // więc pień pod koroną ma delikatny cień zamiast czarnej plamy,
                // a gęsty las nadal wygląda na głęboki.
                const occ = (bid: number) => (OCCLUDES[bid] ? 1 : IS_LEAFY[bid] ? 0.55 : 0);
                const a = occ(get(nx + s1x, ny + s1y, nz + s1z));
                const b = occ(get(nx + s2x, ny + s2y, nz + s2z));
                const cc = occ(get(nx + s1x + s2x, ny + s1y + s2y, nz + s1z + s2z));
                const occl = a > 0 && b > 0 ? 1 : Math.min(1, a + b + cc);
                aoF = 1 - 0.42 * occl;
              }
              ao[k] = aoF;
              let vy = y + py;
              if (liquidTopLow && py === 1) vy -= 0.12;
              const uv = tileUV(t, cr[3], cr[4]);
              const shadeAo = F.shade * aoF;
              const skyB = shadeAo * sky;
              const br = skyB * skyB;
              const bb = shadeAo * blk;
              buf.vertex(ox + x + px, vy, oz + z + pz, uv[0], uv[1], br, br, br, bb * bb, wave, f);
            }
            buf.quad(base, ao[0] + ao[3] > ao[1] + ao[2]);
          }
        }

    return bufs.map((b) => b.geometry());
  }

  isSolid(x: number, y: number, z: number) {
    return IS_SOLID[this.peekBlock(x, y, z)] === 1;
  }

  // Voxel raycast (DDA)
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxDist: number) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / dx), tDeltaY = Math.abs(1 / dy), tDeltaZ = Math.abs(1 / dz);
    let tMaxX = dx !== 0 ? (dx > 0 ? x + 1 - ox : ox - x) * tDeltaX : Infinity;
    let tMaxY = dy !== 0 ? (dy > 0 ? y + 1 - oy : oy - y) * tDeltaY : Infinity;
    let tMaxZ = dz !== 0 ? (dz > 0 ? z + 1 - oz : oz - z) * tDeltaZ : Infinity;
    let nx = 0, ny = 0, nz = 0;
    let t = 0;
    while (t <= maxDist) {
      const id = this.peekBlock(x, y, z);
      if (id !== 0 && RENDER[id] !== 2) return { x, y, z, nx, ny, nz, id, dist: t };
      if (tMaxX < tMaxY && tMaxX < tMaxZ) { x += stepX; t = tMaxX; tMaxX += tDeltaX; nx = -stepX; ny = 0; nz = 0; }
      else if (tMaxY < tMaxZ) { y += stepY; t = tMaxY; tMaxY += tDeltaY; nx = 0; ny = -stepY; nz = 0; }
      else { z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; nx = 0; ny = 0; nz = -stepZ; }
    }
    return null;
  }
}

/** Grows an oak or birch where a sapling stands. Returns false if the space is blocked. */
export function plantTree(world: World, x: number, y: number, z: number, birch: boolean): boolean {
  const kind: TreeKind = birch ? 'birch' : 'oak';
  const ground = world.getBlock(x, y - 1, z);
  if (ground !== B.DIRT && ground !== B.GRASS && ground !== B.FARMLAND) return false;
  const shape = treeShape(kind, x, z, world.seed);
  if (y + shape.top >= CH) return false;
  const replaceable = (id: number) =>
    id === B.AIR || id === B.SAPLING || id === B.BIRCH_SAPLING || RENDER[id] === 1 || IS_LEAFY[id];
  // Najpierw sprawdzamy całe miejsce – nieudane sadzenie nie zostawia połowy
  // drzewa ani nie zamalowuje sąsiednich bloków.
  for (const b of shape.blocks) {
    const wx = x + b.dx, wy = y + b.dy, wz = z + b.dz;
    if (wy < 0 || wy >= CH) return false;
    if (!replaceable(world.getBlock(wx, wy, wz))) return false;
  }
  for (const b of shape.blocks) world.setBlock(x + b.dx, y + b.dy, z + b.dz, b.id);
  if (ground !== B.DIRT) world.setBlock(x, y - 1, z, B.DIRT);
  return true;
}
