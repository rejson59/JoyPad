import { T, BLOCKS, RENDER, tileFor } from './blocks';
import { mulberry32 } from './noise';
import { applyOfficialTiles, isOfficialTile } from './packArt';

export const TILE = 16;
export const ATLAS_TILES = 16; // tiles per row
export const ATLAS_SIZE = TILE * ATLAS_TILES;

type RGB = [number, number, number];

let img: ImageData;

function setPx(tile: number, x: number, y: number, r: number, g: number, b: number, a = 255) {
  if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
  const tx = (tile % ATLAS_TILES) * TILE + x;
  const ty = Math.floor(tile / ATLAS_TILES) * TILE + y;
  const i = (ty * ATLAS_SIZE + tx) * 4;
  img.data[i] = r;
  img.data[i + 1] = g;
  img.data[i + 2] = b;
  img.data[i + 3] = a;
}
function getPx(tile: number, x: number, y: number): [number, number, number, number] {
  const tx = (tile % ATLAS_TILES) * TILE + x;
  const ty = Math.floor(tile / ATLAS_TILES) * TILE + y;
  const i = (ty * ATLAS_SIZE + tx) * 4;
  return [img.data[i], img.data[i + 1], img.data[i + 2], img.data[i + 3]];
}

/* --------------------------------------------------------------- 2.9
 * Nowy warsztat malarski.
 *
 * Do 2.8 każdy kafelek powstawał z „białego szumu”: losowa jasność na każdym
 * pikselu. Taki obrazek wygląda jak najstarsze tekstury Minecrafta – płasko
 * i ziarnisto zarazem. Teraz bazą jest **wygładzony szum z zawijaniem**
 * (kafelek łączy się sam ze sobą), do tego drobne, świadome detale: kamyki,
 * sęki, włókna, rozbłyski. Paleta jest krótka, a światło pada z lewego górnego
 * rogu – dzięki temu blok czyta się jak bryła, a nie jak tapeta.
 */

const clamp255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

/** Deterministyczny hash 2D – tanie źródło szumu bez alokacji. */
function hash2(x: number, y: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(seed | 0, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Wygładzony szum wartościowy; `period` dzieli kafelek, więc nie ma szwów. */
function vnoise(x: number, y: number, period: number, seed: number): number {
  const xf = Math.floor(x), yf = Math.floor(y);
  const tx = x - xf, ty = y - yf;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const wrap = (n: number) => ((n % period) + period) % period;
  const x0 = wrap(xf), x1 = wrap(xf + 1), y0 = wrap(yf), y1 = wrap(yf + 1);
  const a = hash2(x0, y0, seed), b = hash2(x1, y0, seed);
  const c = hash2(x0, y1, seed), d = hash2(x1, y1, seed);
  const top = a + (b - a) * sx, bot = c + (d - c) * sx;
  return top + (bot - top) * sy;
}

/** Trzy oktawy szumu: miękkie łaty zamiast ziarna na każdym pikselu. */
function fbm(x: number, y: number, seed: number, octaves = 3, scale = 1): number {
  let v = 0, amp = 0.55, total = 0;
  for (let o = 0; o < octaves; o++) {
    const period = 4 << o;
    v += vnoise((x / TILE) * period * scale, (y / TILE) * period * scale, period, seed + o * 131) * amp;
    total += amp;
    amp *= 0.5;
  }
  return v / total;
}

/** Mieszanie dwóch kolorów; `t = 0` daje `a`, `t = 1` daje `b`. */
function mixRGB(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Rysuje kolor z jasnością `f` (1 = bez zmian), pilnując zakresu 0–255. */
function px(tile: number, x: number, y: number, c: RGB, f = 1, alpha = 255) {
  setPx(tile, x, y, clamp255(c[0] * f), clamp255(c[1] * f), clamp255(c[2] * f), alpha);
}

/** Ciemniejsza obwódka kafla – blok czyta się jako bryła, nie jako tapeta. */
function bevel(tile: number, strength = 0.1) {
  for (let i = 0; i < TILE; i++) {
    for (const [x, y, f] of [
      [i, 0, 1 + strength * 0.5],
      [i, TILE - 1, 1 - strength * 0.6],
      [0, i, 1 + strength * 0.35],
      [TILE - 1, i, 1 - strength * 0.45],
    ] as [number, number, number][]) {
      const p = getPx(tile, x, y);
      if (p[3] < 128) continue;
      setPx(tile, x, y, clamp255(p[0] * f), clamp255(p[1] * f), clamp255(p[2] * f), p[3]);
    }
  }
}

function shade(c: RGB, f: number): RGB {
  return [c[0] * f, c[1] * f, c[2] * f];
}

/**
 * Wypełnia kafelek kolorem bazowym z miękkimi łatami szumu i drobnym
 * „pyłem” zamiast losowego ziarna na każdym pikselu.
 */
function noiseFill(tile: number, base: RGB, variance: number, rand: () => number, alpha = 255) {
  const seed = 1 + Math.floor(rand() * 9999);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const n = fbm(x, y, seed, 3);
      const grit = hash2(x, y, seed + 77) - 0.5;
      const f = 1 + (n - 0.5) * variance * 1.4 + grit * variance * 0.16;
      px(tile, x, y, base, f, alpha);
    }
}

/** Miękkie plamy (np. kamień) – dwie skale szumu, bez ziarna. */
function mottle(tile: number, base: RGB, amount: number, seed: number) {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const big = fbm(x, y, seed, 2, 0.6);
      const small = fbm(x, y, seed + 31, 3);
      const f = 1 + (big - 0.5) * amount + (small - 0.5) * amount * 0.55;
      px(tile, x, y, base, f);
    }
}

/** Kamyk/grudka: jaśniejsza od góry, ciemniejsza od dołu. */
function pebble(tile: number, cx: number, cy: number, r: number, c: RGB, rand: () => number) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      if (x < 0 || y < 0 || x >= TILE || y >= TILE) continue;
      const dx = (x + 0.5 - cx) / (r * 1.15);
      const dy = (y + 0.5 - cy) / r;
      const d = dx * dx + dy * dy;
      if (d > 1) continue;
      const light = 1 + (1 - d) * 0.12 - (y > cy ? 0.1 : 0);
      px(tile, x, y, c, light * (0.97 + rand() * 0.06));
    }
}

function copyTile(from: number, to: number) {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const p = getPx(from, x, y);
      setPx(to, x, y, p[0], p[1], p[2], p[3]);
    }
}

function voronoi(tile: number, rand: () => number, n: number, colorFn: (cell: number, edge: boolean) => RGB) {
  const pts: [number, number][] = [];
  for (let i = 0; i < n; i++) pts.push([rand() * 16, rand() * 16]);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      let d1 = 1e9, d2 = 1e9, cell = 0, cx = 0, cy = 0;
      for (let i = 0; i < n; i++)
        for (let ox = -16; ox <= 16; ox += 16)
          for (let oy = -16; oy <= 16; oy += 16) {
            const sx = pts[i][0] + ox, sy = pts[i][1] + oy;
            const dx = x + 0.5 - sx, dy = y + 0.5 - sy;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d < d1) { d2 = d1; d1 = d; cell = i; cx = sx; cy = sy; }
            else if (d < d2) d2 = d;
          }
      const edge = d2 - d1;
      const col = colorFn(cell, edge < 1.0);
      // Oświetlenie kamienia: ku górze i lewej jaśniej, ku dołowi ciemniej.
      const nx = (x + 0.5 - cx) / 9, ny = (y + 0.5 - cy) / 9;
      const light = edge < 1.0 ? 0.84 : 1 + (-nx - ny) * 0.26;
      px(tile, x, y, col, Math.max(0.55, light));
    }
}

function ore(tile: number, color: RGB, rand: () => number) {
  copyTile(T.stone, tile);
  const clusters = 3 + Math.floor(rand() * 2);
  for (let c = 0; c < clusters; c++) {
    const cx = 2.5 + rand() * 10, cy = 2.5 + rand() * 10;
    const radius = 1.15 + rand() * 0.95;
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d > radius) continue;
        // Grudka rudy: jasny błysk u góry, ciemna krawędź – widać ją na kamieniu.
        const edge = d > radius - 0.95;
        const shine = dx + dy < -0.4 ? 1.16 : dx + dy > 0.9 ? 0.82 : 1;
        const f = (edge ? 0.74 : 1) * shine * (0.95 + hash2(x, y, c * 31 + 7) * 0.12);
        px(tile, x, y, color, f);
      }
  }
}

function logTop(tile: number, light: RGB, dark: RGB, bark: RGB, rand: () => number) {
  const seed = 1 + Math.floor(rand() * 9999);
  const cx = 7.5 + (rand() - 0.5) * 1.3, cy = 7.5 + (rand() - 0.5) * 1.3;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
      const wobble = (fbm(x, y, seed, 2) - 0.5) * 0.9;
      const d = Math.sqrt(dx * dx + dy * dy) + wobble;
      if (d > 7.2) {
        // kora na obwodzie – pionowe słojowanie
        px(tile, x, y, bark, 0.88 + hash2(x, y, seed + 5) * 0.2);
      } else if (d > 6.35) {
        px(tile, x, y, bark, 1.16); // jasny pierścień tuż pod korą
      } else {
        const ring = Math.sin(d * 2.05 + wobble * 1.4) * 0.5 + 0.5;
        const c = mixRGB(dark, light, ring * 0.9);
        px(tile, x, y, c, 1.05 - d * 0.014);
      }
    }
  // Rdzeń: kilka ciemnych promieni, żeby pierścienie nie były „ceglane”.
  for (let i = 0; i < 4; i++) {
    const a = rand() * Math.PI * 2;
    for (let d = 0.6; d < 3.2; d += 1) {
      const x = Math.round(cx + Math.cos(a) * d), y = Math.round(cy + Math.sin(a) * d);
      if (x >= 0 && y >= 0 && x < TILE && y < TILE) px(tile, x, y, dark, 0.9);
    }
  }
}

function wool(tile: number, base: RGB, rand: () => number) {
  const seed = 1 + Math.floor(rand() * 9999);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      // Drobny splot: dwie sinusoidy + miękkie łaty i pojedyncze włókna.
      // Splot „na ukos”: jasne i ciemne nitki przeplatają się co 2 piksele.
      const weave = Math.sin((x + y * 0.62) * 1.15) * 0.05 + Math.sin((x * 0.55 - y) * 1.6) * 0.032;
      const thread = (x + y) % 3 === 0 ? 0.035 : (x - y + 48) % 3 === 0 ? -0.03 : 0;
      const f = 1 + weave + thread + (fbm(x, y, seed, 2) - 0.5) * 0.09 + (hash2(x, y, seed + 3) - 0.5) * 0.05;
      px(tile, x, y, base, f);
    }
}

function leaves(tile: number, base: RGB, rand: () => number) {
  const seed = 1 + Math.floor(rand() * 9999);
  const dark: RGB = [base[0] * 0.62, base[1] * 0.66, base[2] * 0.58];
  const mid: RGB = base;
  const light: RGB = [base[0] * 1.28, base[1] * 1.2, base[2] * 1.06];

  // Tło: ciemne szczeliny między liśćmi (nie czarne – korona ma być zielona).
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const n = fbm(x, y, seed, 2, 1.2);
      px(tile, x, y, mixRGB(dark, mid, 0.18 + n * 0.3));
    }

  /**
   * Liście to nakładające się „stemple” 3×2 / 2×3 pikseli, rozrzucone
   * nieregularnie (deterministycznie z ziarna). Wcześniejsza regularna
   * kratka 4×4 wyglądała jak tapeta – teraz kiście zachodzą na siebie,
   * mają jasną górną krawędź i ciemny spód, więc korona ma głębię.
   */
  const stamp = (cx: number, cy: number, w: number, h: number, tone: number) => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        // Zaokrąglone narożniki – liść nie jest prostokątem.
        if ((dx === 0 || dx === w - 1) && (dy === 0 || dy === h - 1)) continue;
        const x = (cx + dx + TILE) % TILE;
        const y = (cy + dy + TILE) % TILE;
        const edgeTop = dy === 0;
        const edgeBottom = dy === h - 1;
        const c = edgeTop ? mixRGB(light, mid, 0.25) : edgeBottom ? mixRGB(dark, mid, 0.35) : mixRGB(dark, light, tone);
        const f = edgeTop ? 1.08 : edgeBottom ? 0.94 : 1 + (hash2(x, y, seed + 31) - 0.5) * 0.06;
        px(tile, x, y, c, f);
      }
  };

  for (let i = 0; i < 16; i++) {
    const cx = Math.floor(hash2(i, 1, seed) * TILE);
    const cy = Math.floor(hash2(i, 2, seed) * TILE);
    const wide = hash2(i, 3, seed) > 0.5;
    const w = wide ? 3 : 2, h = wide ? 2 : 3;
    stamp(cx, cy, w, h, 0.35 + hash2(i, 4, seed) * 0.55);
  }
  // Kilka pojedynczych listków w szczelinach – gęstość bez płaskości.
  for (let i = 0; i < 10; i++) {
    const x = Math.floor(hash2(i, 11, seed) * TILE);
    const y = Math.floor(hash2(i, 12, seed) * TILE);
    px(tile, x, y, mixRGB(mid, light, 0.4));
  }
  // Górna część kafla łapie więcej światła (korona nie jest płaska).
  for (let y = 0; y < TILE; y++) {
    const f = 1 + Math.max(0, 1 - y / 9) * 0.06;
    if (f === 1) continue;
    for (let x = 0; x < TILE; x++) {
      const p = getPx(tile, x, y);
      setPx(tile, x, y, p[0] * f, p[1] * f, p[2] * f, p[3]);
    }
  }
}

function plant(tile: number, rand: () => number, flower?: RGB) {
  for (let y = 0; y < TILE; y++) for (let x = 0; x < TILE; x++) setPx(tile, x, y, 0, 0, 0, 0);
  if (!flower) {
    for (let i = 0; i < 9; i++) {
      let x = 1 + Math.floor(rand() * 14);
      const h = 5 + Math.floor(rand() * 10);
      for (let j = 0; j < h; j++) {
        const c = shade([70, 150, 45], 0.7 + rand() * 0.5);
        setPx(tile, x, 15 - j, c[0], c[1], c[2]);
        if (rand() < 0.15) x += rand() < 0.5 ? -1 : 1;
      }
    }
  } else {
    for (let j = 0; j < 9; j++) setPx(tile, 7, 15 - j, 50, 130, 30);
    setPx(tile, 6, 11, 60, 150, 40); setPx(tile, 5, 10, 60, 150, 40);
    setPx(tile, 8, 12, 60, 150, 40); setPx(tile, 9, 11, 60, 150, 40);
    const pts = [[7, 3], [6, 4], [8, 4], [7, 5], [6, 5], [8, 5], [5, 4], [9, 4], [7, 4], [6, 3], [8, 3], [7, 6]];
    for (const [x, y] of pts) {
      const c = shade(flower, 0.85 + rand() * 0.3);
      setPx(tile, x, y, c[0], c[1], c[2]);
    }
    setPx(tile, 7, 4, 60, 40, 20);
  }
}

function bricksPattern(tile: number, brick: RGB, mortar: RGB, bw: number, bh: number, rand: () => number) {
  const seed = 1 + Math.floor(rand() * 9999);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const row = Math.floor(y / bh);
      const off = row % 2 === 0 ? 0 : bw / 2;
      const col = Math.floor((x + off) / bw);
      const inMortar = y % bh === bh - 1 || (x + off) % bw === bw - 1;
      if (inMortar) {
        px(tile, x, y, mortar, 0.86 + fbm(x, y, seed + 9, 2) * 0.22);
        continue;
      }
      // Każda cegła ma własny, stabilny odcień – ściana nie wygląda jak tapeta.
      const tone = 0.9 + hash2(col, row, seed) * 0.2;
      const top = y % bh === 0, left = (x + off) % bw === 0;
      const bottom = y % bh === bh - 2, right = (x + off) % bw === bw - 2;
      let f = tone;
      if (top || left) f *= 1.08;
      if (bottom || right) f *= 0.88;
      f *= 1 + (hash2(x, y, seed + 4) - 0.5) * 0.06;
      px(tile, x, y, brick, f);
    }
}

function storageBlock(tile: number, base: RGB, rand: () => number) {
  const seed = 1 + Math.floor(rand() * 9999);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const frame = x === 0 || y === 0 || x === TILE - 1 || y === TILE - 1;
      if (frame) {
        px(tile, x, y, base, 0.58 + hash2(x, y, seed) * 0.1);
        continue;
      }
      // 3×3 sztabek/szlifów z 1-pikselową fugą.
      const gx = Math.floor((x - 1) / 4.7), gy = Math.floor((y - 1) / 4.7);
      const ix = (x - 1) % 5, iy = (y - 1) % 5;
      if (ix === 4 || iy === 4) {
        px(tile, x, y, base, 0.7 + hash2(x, y, seed + 2) * 0.08);
        continue;
      }
      // Bevel wewnątrz oczka + błysk w lewym górnym rogu.
      let f = 0.98 + hash2(gx, gy, seed + 7) * 0.08;
      if (ix === 0 || iy === 0) f *= 1.16;
      if (ix === 3 || iy === 3) f *= 0.84;
      if ((ix === 1 && iy === 1) || (ix === 2 && iy === 1)) f *= 1.2;
      px(tile, x, y, base, f);
    }
}

/**
 * Skała: wspólna baza dla netherracku, end stone, kwarcu, purpuru, bazaltu…
 * `grain` dodaje drobne ziarno, `veins` – ciemniejsze żyłki (0 = brak).
 */
function rockTile(tile: number, base: RGB, rand: () => number, grain = 0.16, veins = 0.35, seedOffset = 0) {
  const seed = 1 + Math.floor(rand() * 9999) + seedOffset;
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const big = fbm(x, y, seed, 2, 0.65);
      const fine = fbm(x, y, seed + 17, 3);
      const vein = Math.abs(Math.sin((x * 0.6 + y * 1.3) + big * 5)) < veins * 0.5 ? 0.86 : 1;
      const f = 1 + (big - 0.5) * grain + (fine - 0.5) * grain * 0.5;
      px(tile, x, y, base, f * vein * (0.98 + hash2(x, y, seed + 3) * 0.05));
    }
}

/** Beton: gładka powierzchnia z drobnym kruszywem, bez wzoru tkaniny. */
function concrete(tile: number, base: RGB, rand: () => number) {
  const seed = 1 + Math.floor(rand() * 9999);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const f = 0.985 + (fbm(x, y, seed, 2) - 0.5) * 0.05 + (hash2(x, y, seed + 9) - 0.5) * 0.03;
      px(tile, x, y, base, f);
    }
}

/** Lawa: jasne komórki na ciemnym spodzie, jak stygnąca skała. */
function lavaTile(tile: number, rand: () => number) {
  const seed = 1 + Math.floor(rand() * 9999);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const n = fbm(x, y, seed, 3, 1.3);
      const hot = Math.max(0, Math.min(1, (n - 0.34) * 2.1));
      const c = mixRGB([120, 24, 8], [255, 182, 46], hot);
      const f = 0.94 + (hash2(x, y, seed + 5) - 0.5) * 0.1;
      px(tile, x, y, c, f);
      if (hot > 0.86) px(tile, x, y, [255, 232, 150]);
    }
}

/** Obsydian: prawie czarny z fioletowymi refleksami i szklistymi rysami. */
function obsidianTile(tile: number, rand: () => number) {
  const seed = 1 + Math.floor(rand() * 9999);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const n = fbm(x, y, seed, 3, 1.6);
      const c = mixRGB([18, 14, 30], [64, 38, 92], Math.max(0, (n - 0.45) * 1.9));
      const sheen = Math.sin((x * 1.1 + y * 0.55) + n * 4) > 0.94 ? 1.5 : 1;
      px(tile, x, y, c, sheen);
    }
}

/** Lód: błękitna tafla z rysami i rozbłyskami. */
function iceTile(tile: number, rand: () => number) {
  const seed = 1 + Math.floor(rand() * 9999);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const n = fbm(x, y, seed, 2, 0.9);
      const c = mixRGB([128, 176, 236], [206, 234, 255], n);
      px(tile, x, y, c, 1, 210);
    }
  for (let i = 0; i < 4; i++) {
    const x0 = Math.floor(rand() * 16), y0 = Math.floor(rand() * 16);
    const len = 3 + Math.floor(rand() * 5);
    for (let k = 0; k < len; k++) {
      const x = (x0 + k) % 16, y = (y0 + Math.floor(k * 0.4)) % 16;
      px(T.ice, x, y, [226, 244, 255], 1, 220);
    }
  }
  for (let i = 0; i < 4; i++) px(T.ice, Math.floor(rand() * 16), Math.floor(rand() * 16), [246, 252, 255], 1, 235);
}

/** Deski: cztery klepki, słoje i sęki – wspólne dla wszystkich rodzajów drewna. */
function planksTile(tile: number, base: RGB, rand: () => number) {
  const seed = 1 + Math.floor(rand() * 9999);
  // Cztery klepki, każda trochę inna i z własnym miejscem łączenia.
  const joints = [0, 1, 2, 3].map(() => 2 + Math.floor(rand() * 12));
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const board = Math.floor(y / 4);
      const row = y % 4;
      const joint = joints[board];
      const tone = 0.88 + hash2(board, 1, seed) * 0.2;
      const grain = Math.sin((x * 0.8 + board * 2.1) + fbm(x, y, seed + board * 7, 2) * 2.2) * 0.04;
      let f = tone + grain + (hash2(x, y, seed + 11) - 0.5) * 0.05;
      if (row === 0) f *= 1.08;            // górna krawędź klepki
      if (row === 3) f *= 0.7;             // cień szczeliny
      if (x === joint && row < 3) f *= 0.78; // pionowe łączenie
      if (x === (joint + 1) % 16 && row < 3) f *= 0.92;
      px(tile, x, y, base, f);
    }
  // Sęki – dwa, w różnych klepkach.
  for (let k = 0; k < 2; k++) {
    const kx = 2 + Math.floor(rand() * 12), ky = 4 * Math.floor(rand() * 4) + 1;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = (kx + dx + 16) % 16, y = ky + dy;
        if (y < 0 || y >= TILE) continue;
        if (dx === 0 && dy === 0) px(tile, x, y, base, 0.5);
        else if (Math.abs(dx) + Math.abs(dy) === 1) px(tile, x, y, base, 0.86);
        else px(tile, x, y, base, 1.1);
      }
  }
}

/** Kora: pionowe bruzdy i wypukłości – pień odróżnia się od desek. */
function barkSide(tile: number, base: RGB, rand: () => number, contrast = 1) {
  const seed = 1 + Math.floor(rand() * 9999);
  const colTone: number[] = [];
  for (let x = 0; x < TILE; x++) {
    // Ostre bruzdy co ~3 piksele: ciemna szczelina i jasny grzbiet kory.
    const phase = (x + hash2(x, 0, seed) * 1.6) % 3;
    const groove = phase < 1 ? 0.66 : phase < 2 ? 1.22 : 1.0;
    colTone[x] = groove * (0.97 + hash2(x, 1, seed) * 0.06);
  }
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const wobble = (fbm(x, y, seed, 2, 1.2) - 0.5) * 0.16;
      let f = colTone[x] + wobble;
      if (hash2(x, y, seed + 23) > 0.95) f *= 0.8;
      px(tile, x, y, base, 1 + (f - 1) * contrast);
    }
  // Sęki: ciemna dziurka z jasnym rantem.
  for (let i = 0; i < 2; i++) {
    const kx = 2 + Math.floor(rand() * 12), ky = 2 + Math.floor(rand() * 12);
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const x = kx + dx, y = ky + dy;
        if (x < 0 || y < 0 || x >= TILE || y >= TILE) continue;
        if (dx === 0 && dy === 0) px(tile, x, y, base, 0.5);
        else px(tile, x, y, base, 1.18);
      }
  }
}

// average colors per block (for particles)
export const AVG_COLOR: RGB[] = [];

export interface AtlasResult {
  canvas: HTMLCanvasElement;
  icons: Record<number, string>;
  cracks: HTMLCanvasElement[];
}

export function buildAtlas(): AtlasResult {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE;
  canvas.height = ATLAS_SIZE;
  const ctx = canvas.getContext('2d')!;
  img = ctx.createImageData(ATLAS_SIZE, ATLAS_SIZE);
  const R = (s: number) => mulberry32(s * 7919 + 13);

  // ------------------------------------------------------------ 2.9: ziemia
  {
    const r = R(2);
    mottle(T.dirt, [128, 92, 62], 0.26, 21);
    // grudki i kamyki: kilka jaśniejszych, kilka ciemniejszych
    for (let i = 0; i < 7; i++) pebble(T.dirt, 1 + r() * 14, 1 + r() * 14, 0.9 + r() * 1.3, [151, 114, 78], r);
    for (let i = 0; i < 5; i++) px(T.dirt, Math.floor(r() * 16), Math.floor(r() * 16), [96, 66, 43]);
    for (let i = 0; i < 3; i++) px(T.dirt, Math.floor(r() * 16), Math.floor(r() * 16), [170, 136, 104]);
    bevel(T.dirt, 0.09);
  }
  // Trawa – góra: miękkie łaty zieleni, drobne ciemne źdźbła i jaśniejsze końcówki.
  {
    const r = R(1);
    const base: RGB = [104, 168, 66];
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const n = fbm(x, y, 77, 3, 1.2);
        let f = 0.94 + n * 0.16;
        if (hash2(x, y, 5) > 0.9) f *= 0.9;
        px(T.grass_top, x, y, base, f);
      }
    for (let i = 0; i < 16; i++) {
      const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
      px(T.grass_top, x, y, [78, 138, 48]);
      if (r() < 0.5) px(T.grass_top, x, (y + 1) % 16, [126, 192, 82]);
    }
  }
  // Trawa – bok: nierówna krawędź (3–5 px), ciemniejsza linia styku z ziemią.
  {
    const r = R(3);
    copyTile(T.dirt, T.grass_side);
    const heights: number[] = [];
    for (let x = 0; x < 16; x++) heights[x] = 3 + Math.round(fbm(x * 2.2, 0, 19, 2) * 2.4);
    for (let x = 0; x < 16; x++) {
      const h = heights[x];
      for (let y = 0; y < h; y++) {
        const f = 0.94 + fbm(x, y, 31, 2) * 0.16 + (y === h - 1 ? -0.14 : 0);
        px(T.grass_side, x, y, [100, 162, 62], f);
      }
      // pojedyncze źdźbła wystające w dół
      if (r() < 0.35) px(T.grass_side, x, h, [86, 142, 52], 0.95);
      else px(T.grass_side, x, h, [112, 84, 56], 0.9);
      // cień pod warstwą trawy na ziemi
      if (h < 15) px(T.grass_side, x, h + 1, [104, 76, 50], 0.95);
    }
  }
  // Kamień: duże, miękkie łaty + kilka ciemnych pęknięć i jasnych odprysków.
  {
    const r = R(4);
    mottle(T.stone, [126, 126, 128], 0.2, 41);
    for (let i = 0; i < 5; i++) {
      let x = Math.floor(r() * 15) + 1, y = Math.floor(r() * 15) + 1;
      const len = 2 + Math.floor(r() * 3);
      const dx = r() < 0.5 ? 1 : 0, dy = dx === 1 ? 0 : 1;
      for (let k = 0; k < len; k++) { px(T.stone, x, y, [96, 96, 99], 1); x = (x + dx) % 16; y = (y + dy) % 16; }
    }
    for (let i = 0; i < 7; i++) px(T.stone, Math.floor(r() * 16), Math.floor(r() * 16), [150, 150, 152]);
    bevel(T.stone, 0.06);
  }
  // Bruk: zaokrąglone kamienie z fugą i światłem od góry.
  {
    const r = R(5);
    const tones = Array.from({ length: 12 }, () => 0.84 + r() * 0.24);
    voronoi(T.cobble, r, 10, (c, e) => {
      if (e) return [96, 96, 99];
      const s = 146 * tones[c];
      return [s, s, s + 3];
    });
    bevel(T.cobble, 0.1);
  }
  // Pień dębu: kora z bruzdami.
  { const r = R(6); barkSide(T.log_side, [108, 82, 50], r, 1.15); }
  logTop(T.log_top, [188, 152, 96], [156, 122, 74], [104, 80, 48], R(7));
  leaves(T.leaves, [62, 130, 34], R(8));
  // Deski dębowe.
  { planksTile(T.planks, [168, 134, 82], R(9)); }
  // Piasek: drobne ziarno + muszelki.
  {
    const r = R(10);
    mottle(T.sand, [219, 206, 160], 0.1, 63);
    for (let i = 0; i < 26; i++) {
      const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
      const light = r() < 0.55;
      px(T.sand, x, y, light ? [236, 226, 186] : [196, 182, 138]);
    }
    for (let i = 0; i < 3; i++) {
      const x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12);
      px(T.sand, x, y, [246, 238, 208]);
      px(T.sand, x + 1, y, [246, 238, 208]);
    }
  }
  // Woda: spokojne, szerokie fale (bez ziarna) i półprzezroczystość.
  {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const wave = Math.sin((x * 0.55 + y * 0.9) * 1.1) * 0.045 + Math.sin(x * 0.3 - y * 0.7) * 0.035;
        const depth = 0.92 + (1 - y / 22) * 0.1;
        px(T.water, x, y, [46, 106, 208], depth * (1 + wave), 188);
      }
    for (let i = 0; i < 6; i++) {
      const y = 2 + i * 2;
      const x = (i * 5 + 3) % 16;
      px(T.water, x, y, [150, 200, 245], 1, 170);
      px(T.water, (x + 1) % 16, y, [120, 180, 235], 1, 165);
    }
  }
  // Szkło: jasna ramka z odblaskiem, środek naprawdę przezroczysty.
  {
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const border = x === 0 || y === 0 || x === 15 || y === 15;
        if (border) {
          const f = 1 - (y * 0.006 + x * 0.006);
          px(T.glass, x, y, [198, 226, 234], f * (0.95 + hash2(x, y, 9) * 0.08));
        } else if ((x - y === 4 || x - y === 5) && x > 3 && x < 11) {
          px(T.glass, x, y, [235, 250, 255], 1, 150);
        } else if (x === 1 || y === 1) {
          px(T.glass, x, y, [220, 240, 246], 1, 90);
        } else setPx(T.glass, x, y, 0, 0, 0, 0);
      }
  }
  // Skała macierzysta: ciemne bloki z jaśniejszymi plamami.
  {
    const r = R(13);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const n = fbm(x, y, 88, 3, 1.4);
        const s = 42 + n * 76;
        px(T.bedrock, x, y, [s, s, s * 1.02]);
        if (r() < 0.06) px(T.bedrock, x, y, [s * 0.6, s * 0.6, s * 0.62]);
      }
  }
  // Żwir: obtoczone kamyki różnej wielkości.
  {
    const r = R(14);
    mottle(T.gravel, [104, 99, 92], 0.16, 71);
    const tones: RGB[] = [[168, 160, 148], [132, 124, 114], [150, 140, 126], [118, 112, 104], [180, 172, 160]];
    // Najpierw większe kamienie, potem mniejsze wlazą w szczeliny.
    for (let i = 0; i < 7; i++) pebble(T.gravel, r() * 16, r() * 16, 1.5 + r() * 1.1, tones[Math.floor(r() * tones.length)], r);
    for (let i = 0; i < 10; i++) pebble(T.gravel, r() * 16, r() * 16, 0.8 + r() * 0.7, tones[Math.floor(r() * tones.length)], r);
    bevel(T.gravel, 0.08);
  }
  ore(T.coal_ore, [38, 38, 42], R(15));
  ore(T.iron_ore, [206, 168, 142], R(16));
  ore(T.gold_ore, [250, 220, 74], R(17));
  ore(T.diamond_ore, [98, 226, 236], R(18));
  bricksPattern(T.brick, [156, 76, 60], [170, 166, 156], 8, 4, R(19));
  // Śnieg: prawie biały, z zimnym cieniem i skrzeniem.
  {
    const r = R(20);
    mottle(T.snow, [244, 250, 252], 0.05, 91);
    for (let i = 0; i < 10; i++) px(T.snow, Math.floor(r() * 16), Math.floor(r() * 16), [214, 230, 244]);
    for (let i = 0; i < 8; i++) px(T.snow, Math.floor(r() * 16), Math.floor(r() * 16), [255, 255, 255]);
  }
  // Śnieg – bok: ziemia z czapą śniegu i sinym cieniem pod nią.
  {
    const r = R(21);
    copyTile(T.dirt, T.snow_side);
    const heights: number[] = [];
    for (let x = 0; x < 16; x++) heights[x] = 3 + Math.round(fbm(x * 2.1, 3, 23, 2) * 2.2);
    for (let x = 0; x < 16; x++) {
      const h = heights[x];
      for (let y = 0; y < h; y++) px(T.snow_side, x, y, [246, 251, 253], 0.96 + fbm(x, y, 33, 2) * 0.05);
      px(T.snow_side, x, h, [206, 224, 240], 1);
      px(T.snow_side, x, h + 1, [120, 94, 68], 1);
      if (r() < 0.25) px(T.snow_side, x, h + 2, [104, 80, 58], 1);
    }
  }
  // Kaktus – bok: żebra i kolce.
  {
    const r = R(22);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        // Szerokie żebra: ciemna bruzda, jasna krawędź żebra, płaski środek.
        const rib = x % 5;
        let f = rib === 0 ? 0.6 : rib === 1 ? 1.16 : rib === 4 ? 0.86 : 1;
        f *= 0.97 + fbm(x, y, 37, 2) * 0.07;
        px(T.cactus_side, x, y, [64, 148, 66], f);
      }
    for (let y = 1; y < 16; y += 4)
      for (let x = 1; x < 16; x += 4) {
        px(T.cactus_side, x, y, [226, 232, 196]);
        if (r() < 0.4) px(T.cactus_side, x + 1, y, [200, 210, 170]);
      }
  }
  // Kaktus – góra: pierścienie żeber.
  {
    const r = R(23);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 7.5, y - 7.5);
        const ring = Math.sin(d * 2.4) * 0.5 + 0.5;
        const f = (d > 6.9 ? 0.66 : 0.92 + ring * 0.18) * (0.96 + r() * 0.05);
        px(T.cactus_top, x, y, [64, 152, 68], f);
      }
  }
  // Brzoza: jasna kora z poziomymi przetchlinkami.
  {
    const r = R(24);
    barkSide(T.birch_side, [226, 224, 213], r, 0.35);
    // Kora brzozy: kilka krótkich, poziomych przetchlinek (nie „gazeta”).
    for (let i = 0; i < 5; i++) {
      const y = 2 + Math.floor(r() * 12);
      const x = 1 + Math.floor(r() * 9);
      const len = 2 + Math.floor(r() * 2);
      for (let k = 0; k < len; k++) px(T.birch_side, x + k, y, [74, 70, 62], 0.92);
      for (let k = 0; k < len; k++) px(T.birch_side, x + k, y + 1, [176, 172, 160], 1);
    }
    for (let i = 0; i < 4; i++) px(T.birch_side, Math.floor(r() * 16), Math.floor(r() * 16), [196, 192, 180]);
  }
  logTop(T.birch_top, [224, 200, 150], [196, 170, 120], [218, 216, 204], R(25));
  leaves(T.birch_leaves, [116, 158, 70], R(26));
  // TNT
  { const r = R(27); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let c: RGB = shade([205, 55, 35], (x % 4 === 0 ? 0.8 : 1) * (0.9 + r() * 0.15));
      if (y >= 5 && y <= 10) c = [235, 235, 230];
      setPx(T.tnt_side, x, y, c[0], c[1], c[2]); }
    const letters = ['111', '010', '010', '010'];
    const N = ['101', '111', '111', '101'];
    const draw = (pat: string[], ox: number) => pat.forEach((row, yy) => row.split('').forEach((ch, xx) => { if (ch === '1') setPx(T.tnt_side, ox + xx, 6 + yy, 20, 20, 20); }));
    draw(letters, 2); draw(N, 7); draw(letters, 11); }
  { const r = R(28); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      const c: RGB = d < 2.5 ? [80, 80, 80] : shade([205, 55, 35], 0.9 + r() * 0.15); setPx(T.tnt_top, x, y, c[0], c[1], c[2]); }
    setPx(T.tnt_top, 7, 7, 40, 40, 40); setPx(T.tnt_top, 8, 8, 40, 40, 40); }
  { const r = R(29); noiseFill(T.tnt_bottom, [170, 45, 30], 0.2, r); }
  // Glowstone
  { const r = R(30); voronoi(T.glowstone, r, 10, (c, e) => e ? [140, 90, 40] : shade([250, 210, 110], 0.85 + ((c * 37) % 10) / 40 + r() * 0.1)); }
  // Bookshelf
  { const r = R(31); copyTile(T.planks, T.bookshelf);
    for (const row of [1, 9]) { let x = 1; while (x < 15) { const w = 1 + Math.floor(r() * 2); const col: RGB = [[140, 30, 30], [30, 60, 140], [40, 110, 40], [150, 120, 40], [90, 40, 110]][Math.floor(r() * 5)] as RGB;
        const h = 5 + Math.floor(r() * 2);
        for (let xx = x; xx < Math.min(15, x + w); xx++) for (let y = row + 6 - h; y < row + 6; y++) { const c = shade(col, 0.85 + r() * 0.2); setPx(T.bookshelf, xx, y + 1, c[0], c[1], c[2]); }
        x += w; } } }
  wool(T.wool_white, [233, 236, 236], R(32));
  wool(T.wool_red, [160, 39, 34], R(33));
  wool(T.wool_blue, [53, 57, 157], R(43));
  wool(T.wool_green, [84, 109, 27], R(44));
  wool(T.wool_yellow, [248, 197, 39], R(45));
  wool(T.wool_black, [25, 25, 30], R(46));
  // Crafting table
  { copyTile(T.planks, T.crafting_top);
    for (let i = 0; i < 16; i++) { setPx(T.crafting_top, i, 0, 90, 60, 35); setPx(T.crafting_top, i, 15, 90, 60, 35); setPx(T.crafting_top, 0, i, 90, 60, 35); setPx(T.crafting_top, 15, i, 90, 60, 35); }
    for (let i = 2; i < 14; i++) { setPx(T.crafting_top, i, 7, 110, 80, 45); setPx(T.crafting_top, 7, i, 110, 80, 45); } }
  { copyTile(T.planks, T.crafting_side);
    for (let x = 0; x < 16; x++) for (let y = 0; y < 3; y++) setPx(T.crafting_side, x, y, 100, 70, 40);
    for (let y = 5; y < 12; y++) setPx(T.crafting_side, 4, y, 120, 120, 125);
    for (let x = 3; x < 6; x++) setPx(T.crafting_side, x, 5, 150, 150, 155);
    for (let y = 6; y < 13; y++) setPx(T.crafting_side, 11, y, 90, 60, 30);
    for (let x = 9; x < 14; x++) setPx(T.crafting_side, x, 6, 140, 140, 145); }
  // Furnace
  { const r = R(36); noiseFill(T.furnace_side, [120, 120, 120], 0.15, r);
    for (let i = 0; i < 16; i++) { setPx(T.furnace_side, i, 0, 90, 90, 90); setPx(T.furnace_side, i, 15, 90, 90, 90); } }
  { copyTile(T.furnace_side, T.furnace_front);
    for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) setPx(T.furnace_front, x, y, 30, 25, 25);
    for (let x = 4; x < 12; x++) setPx(T.furnace_front, x, 13, 200, 90, 30);
    for (let x = 3; x < 13; x++) setPx(T.furnace_front, x, 4, 70, 70, 70); }
  // 2.9: obsydian ma własny generator (szklisty, z fioletowym refleksem).
  { obsidianTile(T.obsidian, R(37)); }
  bricksPattern(T.stone_bricks, [125, 125, 125], [80, 80, 80], 16, 8, R(38));
  { iceTile(T.ice, R(39)); }
  plant(T.tallgrass, R(40));
  plant(T.flower_red, R(41), [220, 30, 30]);
  plant(T.flower_yellow, R(42), [250, 225, 40]);
  // Lava
  { lavaTile(T.lava, R(47)); }
  // Sandstone
  { const r = R(48); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let f = 0.95 + r() * 0.08; if (y < 3) f *= 1.05; if (y === 3 || y === 11) f *= 0.85; const c = shade([216, 202, 150], f); setPx(T.sandstone_side, x, y, c[0], c[1], c[2]); } }
  { const r = R(49); noiseFill(T.sandstone_top, [222, 208, 158], 0.08, r); }
  // Pumpkin
  { const r = R(50); for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const c = shade([220, 130, 25], (x % 4 === 0 ? 0.75 : 1) * (0.9 + r() * 0.15)); setPx(T.pumpkin_side, x, y, c[0], c[1], c[2]); } }
  { const r = R(51); noiseFill(T.pumpkin_top, [200, 120, 25], 0.2, r);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) setPx(T.pumpkin_top, x, y, 90, 70, 30); }
  { copyTile(T.pumpkin_side, T.pumpkin_face);
    const face = [[3, 4], [4, 4], [3, 5], [4, 5], [11, 4], [12, 4], [11, 5], [12, 5], [7, 7], [8, 7]];
    for (const [x, y] of face) setPx(T.pumpkin_face, x, y, 40, 25, 5);
    for (let x = 3; x < 13; x++) setPx(T.pumpkin_face, x, 10, 40, 25, 5);
    for (let x = 4; x < 12; x++) setPx(T.pumpkin_face, x, 11, 40, 25, 5); }
  // Mossy cobble
  { const r = R(53); copyTile(T.cobble, T.mossy); for (let i = 0; i < 80; i++) { const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
      const p = getPx(T.mossy, x, y); if (p[0] > 70) setPx(T.mossy, x, y, 70 + r() * 30, 120 + r() * 30, 50); } }
  { const r = R(54); noiseFill(T.clay, [160, 166, 180], 0.08, r); }

  // Torch, saplings, crops, farmland, bed, lit furnace – transparent where noted.
  const clear = (tile: number) => { for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(tile, x, y, 0, 0, 0, 0); };
  clear(T.torch);
  for (let y = 7; y < 15; y++) { setPx(T.torch, 7, y, 92, 64, 36); setPx(T.torch, 8, y, 70, 48, 26); }
  for (const [x, y, c] of [[6, 3, [255, 230, 80]], [7, 2, [255, 250, 180]], [7, 3, [255, 180, 40]], [8, 3, [255, 210, 50]], [7, 4, [255, 140, 30]], [8, 4, [230, 90, 20]], [9, 4, [255, 200, 60]], [5, 4, [255, 190, 40]], [7, 5, [200, 70, 20]]] as [number, number, RGB][]) {
    setPx(T.torch, x, y, c[0], c[1], c[2]);
  }
  clear(T.sapling);
  for (let y = 8; y < 15; y++) setPx(T.sapling, 8, y, 90, 62, 34);
  for (const [x, y] of [[6, 4], [7, 4], [8, 4], [9, 4], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [7, 3], [8, 3], [8, 6], [6, 6], [9, 6]]) setPx(T.sapling, x, y, 46, 120, 36);
  clear(T.birch_sapling);
  for (let y = 8; y < 15; y++) setPx(T.birch_sapling, 8, y, 210, 208, 196);
  for (const [x, y] of [[6, 4], [7, 4], [8, 4], [9, 4], [6, 5], [7, 5], [8, 5], [9, 5], [7, 3], [8, 3], [8, 6]]) setPx(T.birch_sapling, x, y, 130, 170, 70);
  { const r = R(58); copyTile(T.dirt, T.farmland);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const wet = shade([78, 52, 28], 0.85 + r() * 0.2);
      if (y < 5 || (x + y) % 5 === 0) setPx(T.farmland, x, y, wet[0], wet[1], wet[2]);
    }
  }
  const wheat = (tile: number, h: number, gold: boolean) => {
    clear(tile);
    for (let i = 0; i < 5; i++) {
      const x = 2 + i * 3;
      for (let y = 0; y < h; y++) setPx(tile, x, 15 - y, gold ? 210 : 70, gold ? 180 : 140, gold ? 40 : 36);
      if (h > 6) { setPx(tile, x - 1, 15 - h, gold ? 230 : 80, gold ? 190 : 150, gold ? 50 : 40); setPx(tile, x + 1, 16 - h, gold ? 230 : 80, gold ? 190 : 150, gold ? 50 : 40); }
    }
  };
  wheat(T.wheat0, 4, false);
  wheat(T.wheat1, 8, false);
  wheat(T.wheat2, 12, false);
  wheat(T.wheat3, 14, true);
  { const r = R(63); wool(T.bed_top, [170, 40, 40], r);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 16; x++) setPx(T.bed_top, x, y, 236, 236, 236);
    for (let x = 0; x < 16; x++) setPx(T.bed_top, x, 5, 180, 180, 180);
  }
  { const r = R(64); copyTile(T.planks, T.bed_side);
    for (let y = 0; y < 8; y++) for (let x = 0; x < 16; x++) { const c = shade([170, 40, 40], 0.9 + r() * 0.15); setPx(T.bed_side, x, y, c[0], c[1], c[2]); }
    for (let x = 0; x < 5; x++) for (let y = 1; y < 6; y++) setPx(T.bed_side, x, y, 236, 236, 236);
  }
  { copyTile(T.furnace_front, T.furnace_lit);
    for (let y = 8; y < 14; y++) for (let x = 4; x < 12; x++) setPx(T.furnace_lit, x, y, y > 11 ? 255 : 255, y > 11 ? 180 : 90, 20);
    setPx(T.furnace_lit, 6, 10, 255, 240, 140); setPx(T.furnace_lit, 8, 9, 255, 220, 80);
  }

  // Home update: chest, door, ladder, fence, trapdoor, campfire.
  { const r = R(66); noiseFill(T.chest_side, [122, 78, 42], 0.12, r);
    for (let x = 0; x < 16; x++) { setPx(T.chest_side, x, 0, 78, 48, 26); setPx(T.chest_side, x, 15, 70, 42, 22); }
  }
  { copyTile(T.chest_side, T.chest_top);
    for (let x = 1; x < 15; x++) setPx(T.chest_top, x, 7, 86, 54, 28);
    for (let y = 2; y < 14; y++) { setPx(T.chest_top, 1, y, 86, 54, 28); setPx(T.chest_top, 14, y, 86, 54, 28); }
  }
  { copyTile(T.chest_side, T.chest_front);
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) setPx(T.chest_front, x, y, 196, 164, 48);
    setPx(T.chest_front, 7, 8, 90, 60, 20);
    setPx(T.chest_front, 8, 8, 90, 60, 20);
    for (let x = 0; x < 16; x++) { setPx(T.chest_front, x, 0, 70, 42, 22); setPx(T.chest_front, x, 15, 70, 42, 22); }
  }
  { const r = R(69); noiseFill(T.door, [138, 88, 48], 0.1, r);
    for (let y = 0; y < 16; y++) { setPx(T.door, 0, y, 78, 48, 26); setPx(T.door, 15, y, 78, 48, 26); setPx(T.door, 1, y, 96, 60, 32); }
    for (let x = 0; x < 16; x++) { setPx(T.door, x, 0, 78, 48, 26); setPx(T.door, x, 15, 78, 48, 26); }
    for (let y = 6; y < 11; y++) setPx(T.door, 12, y, 210, 176, 52);
    setPx(T.door, 11, 8, 210, 176, 52);
  }
  { copyTile(T.door, T.door_top);
    for (let y = 3; y < 10; y++) for (let x = 4; x < 12; x++) setPx(T.door_top, x, y, 150, 196, 214);
    for (let y = 3; y < 10; y++) { setPx(T.door_top, 4, y, 70, 90, 100); setPx(T.door_top, 11, y, 70, 90, 100); }
    for (let x = 4; x < 12; x++) { setPx(T.door_top, x, 3, 70, 90, 100); setPx(T.door_top, x, 9, 70, 90, 100); }
  }
  clear(T.ladder);
  for (let y = 0; y < 16; y++) { setPx(T.ladder, 3, y, 120, 78, 40); setPx(T.ladder, 12, y, 96, 60, 30); }
  for (let y = 1; y < 16; y += 3) for (let x = 3; x <= 12; x++) setPx(T.ladder, x, y, 140, 92, 48);
  clear(T.fence);
  for (let y = 0; y < 16; y++) { setPx(T.fence, 2, y, 150, 98, 52); setPx(T.fence, 3, y, 120, 76, 40); setPx(T.fence, 12, y, 150, 98, 52); setPx(T.fence, 13, y, 110, 70, 36); }
  for (let x = 2; x <= 13; x++) { setPx(T.fence, x, 4, 150, 98, 52); setPx(T.fence, x, 5, 110, 70, 36); setPx(T.fence, x, 10, 150, 98, 52); setPx(T.fence, x, 11, 110, 70, 36); }
  { const r = R(73); noiseFill(T.trapdoor, [146, 96, 50], 0.1, r);
    for (let x = 0; x < 16; x++) { setPx(T.trapdoor, x, 0, 86, 54, 28); setPx(T.trapdoor, x, 15, 86, 54, 28); }
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) setPx(T.trapdoor, x, y, 96, 62, 32);
    for (let y = 6; y < 10; y++) setPx(T.trapdoor, 8, y, 210, 176, 52);
  }
  { const r = R(75); noiseFill(T.campfire_side, [92, 58, 32], 0.14, r);
    for (let y = 10; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.campfire_side, x, y, 48, 32, 22);
  }
  { const r = R(74); noiseFill(T.campfire, [62, 40, 24], 0.16, r);
    for (let x = 2; x < 14; x++) { setPx(T.campfire, x, 4, 110, 68, 34); setPx(T.campfire, x, 11, 90, 54, 28); }
    for (let y = 5; y < 11; y++) for (let x = 5; x < 11; x++) setPx(T.campfire, x, y, y < 8 ? 255 : 220, y < 8 ? 150 : 70, 20);
    setPx(T.campfire, 7, 6, 255, 240, 140);
    setPx(T.campfire, 8, 7, 255, 220, 80);
  }

  // Storage blocks: iron, gold, diamond
  storageBlock(T.iron_block, [220, 220, 224], R(76));
  storageBlock(T.gold_block, [250, 214, 74], R(77));
  storageBlock(T.diamond_block, [93, 236, 245], R(78));

  // 1.5 „Zaklęcia": lapis, enchanting table, sugar cane
  ore(T.lapis_ore, [36, 66, 190], R(79));
  storageBlock(T.lapis_block, [42, 74, 196], R(80));
  {
    const r = R(83);
    noiseFill(T.enchant_bottom, [26, 20, 42], 0.3, r);
    copyTile(T.enchant_bottom, T.enchant_side);
    // glowing runes carved into the obsidian sides
    const runes: [number, number][][] = [
      [[2, 4], [2, 5], [2, 6], [3, 5], [4, 4], [4, 5], [4, 6]],
      [[6, 4], [7, 5], [8, 4], [8, 6], [9, 5]],
      [[11, 4], [11, 6], [12, 5], [13, 4], [13, 6], [13, 5]],
      [[3, 9], [4, 10], [5, 9], [6, 10], [7, 9]],
      [[9, 9], [10, 10], [11, 9], [12, 10], [12, 9]],
      [[5, 12], [6, 12], [7, 13], [8, 12], [9, 12], [10, 13]],
    ];
    for (const glyph of runes) {
      for (const [x, y] of glyph) {
        setPx(T.enchant_side, x, y, 150, 60, 220);
        if (r() < 0.5) setPx(T.enchant_side, x, y + 1, 96, 34, 150);
      }
    }
    for (let x = 0; x < 16; x++) { setPx(T.enchant_side, x, 0, 12, 8, 22); setPx(T.enchant_side, x, 15, 12, 8, 22); }
    // top: an open book on a dark cloth
    copyTile(T.enchant_bottom, T.enchant_top);
    for (let x = 1; x < 15; x++) for (let y = 1; y < 15; y++) {
      if (x === 1 || y === 1 || x === 14 || y === 14) setPx(T.enchant_top, x, y, 78, 44, 26);
    }
    for (let y = 4; y < 12; y++) for (let x = 3; x < 13; x++) {
      const page = x < 8 ? 236 : 228;
      setPx(T.enchant_top, x, y, page, page - 6, page - 30);
      if (y % 2 === 0 && x > 3 && x < 12 && x !== 7 && x !== 8) setPx(T.enchant_top, x, y, 150, 140, 120);
    }
    for (let y = 3; y < 13; y++) setPx(T.enchant_top, 7, y, 120, 40, 40);
    for (let y = 3; y < 13; y++) setPx(T.enchant_top, 8, y, 150, 54, 54);
    setPx(T.enchant_top, 7, 3, 200, 170, 60); setPx(T.enchant_top, 8, 3, 200, 170, 60);
  }
  {
    const r = R(84);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.sugarcane, x, y, 0, 0, 0, 0);
    // three stalks with joints and a couple of leaves
    for (const [sx, col] of [[3, [96, 168, 74]], [7, [122, 190, 92]], [11, [86, 152, 66]]] as [number, RGB][]) {
      for (let y = 0; y < 16; y++) {
        const joint = y % 5 === 0;
        const lit = shade(col, joint ? 0.7 : 0.9 + r() * 0.25);
        const dark = shade(col, joint ? 0.55 : 0.72);
        setPx(T.sugarcane, sx, y, lit[0], lit[1], lit[2]);
        setPx(T.sugarcane, sx + 1, y, dark[0], dark[1], dark[2]);
      }
    }
    for (const [x, y] of [[5, 3], [6, 2], [9, 6], [10, 5], [2, 8], [13, 9], [12, 10]]) {
      setPx(T.sugarcane, x, y, 130, 196, 96);
      setPx(T.sugarcane, x, y + 1, 104, 168, 74);
    }
  }

  // ------------------------------------------------------------------- 1.6
  // Ścieżka: ubita ziemia z kamykami, boki jak ziemia z ciemniejszą krawędzią.
  {
    const r = R(85);
    noiseFill(T.path_top, [150, 122, 82], 0.16, r);
    for (let i = 0; i < 9; i++) {
      const x = 2 + Math.floor(r() * 12), y = 2 + Math.floor(r() * 12);
      setPx(T.path_top, x, y, 176, 152, 108);
      setPx(T.path_top, x, y + 1, 118, 92, 60);
    }
    for (let i = 0; i < 6; i++) {
      const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
      const s = 120 + r() * 60;
      setPx(T.path_top, x, y, s, s * 0.96, s * 0.9);
    }
    copyTile(T.dirt, T.path_side);
    for (let x = 0; x < 16; x++) {
      const h = 3 + Math.floor(r() * 2);
      for (let y = 0; y < h; y++) setPx(T.path_side, x, y, 0, 0, 0, 0);
      setPx(T.path_side, x, h, 128, 100, 66);
    }
  }
  // Bela siana: górna strona to ścięte źdźbła, boki przeplecione sznurkiem.
  {
    const r = R(87);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const c = shade([196, 164, 62], 0.85 + r() * 0.3);
        setPx(T.hay_top, x, y, c[0], c[1], c[2]);
        if ((x % 4 === 0 && y % 4 === 0) || (x % 5 === 2 && y === 7)) setPx(T.hay_top, x, y, 148, 116, 40);
      }
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const c = shade([214, 182, 74], 0.86 + r() * 0.26);
        setPx(T.hay_side, x, y, c[0], c[1], c[2]);
        if (y % 3 === 2) setPx(T.hay_side, x, y, 168, 134, 46);
      }
    for (let y = 1; y < 15; y++) {
      setPx(T.hay_side, 3, y, 122, 88, 40);
      setPx(T.hay_side, 12, y, 122, 88, 40);
    }
    for (let y = 5; y < 8; y++) for (let x = 0; x < 16; x++) setPx(T.hay_side, x, y, 138, 104, 42);
  }
  // Latarnia: mosiężna rama z blaskiem w środku (emituje światło).
  {
    const r = R(89);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const frame = x < 2 || x > 13 || y < 2 || y > 14;
        if (frame) {
          const c = shade([96, 92, 86], 0.9 + r() * 0.2);
          setPx(T.lantern, x, y, c[0], c[1], c[2]);
        } else {
          const glow = 0.8 + r() * 0.4 - Math.abs(x - 7.5) * 0.03;
          setPx(T.lantern, x, y, 255 * glow, 226 * glow, 150 * glow);
        }
      }
    for (let x = 2; x < 14; x++) { setPx(T.lantern, x, 2, 120, 116, 110); setPx(T.lantern, x, 14, 66, 62, 58); }
    for (const [x, y] of [[4, 8], [7, 6], [10, 9], [8, 11]]) setPx(T.lantern, x, y, 255, 255, 214);
    setPx(T.lantern, 7, 0, 96, 92, 86); setPx(T.lantern, 8, 0, 96, 92, 86);
  }
  // Ruda szmaragdu i blok szmaragdu
  ore(T.emerald_ore, [42, 214, 106], R(90));
  storageBlock(T.emerald_block, [56, 216, 112], R(91));
  // Dzwon: brązowy dzwon z sercem i złotym pasem
  {
    const r = R(92);
    noiseFill(T.bell, [176, 148, 74], 0.12, r);
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const edge = Math.abs(x - 7.5) / 7.5;
        const inside = edge < 0.9 - y * 0.02;
        if (inside) {
          const c = shade([198, 166, 84], 0.86 + r() * 0.28);
          setPx(T.bell, x, y, c[0], c[1], c[2]);
        } else if (edge > 0.95) setPx(T.bell, x, y, 96, 78, 38);
      }
    for (let x = 3; x < 13; x++) { setPx(T.bell, x, 1, 236, 216, 140); setPx(T.bell, x, 14, 120, 96, 44); }
    for (let y = 4; y < 12; y++) setPx(T.bell, 8, y, 130, 106, 48);
    setPx(T.bell, 7, 12, 60, 48, 24); setPx(T.bell, 8, 12, 60, 48, 24);
  }

  // ------------------------------------------------------------------- 1.7 Nether & Redstone
  ore(T.redstone_ore, [200, 30, 30], R(93));
  storageBlock(T.redstone_block, [180, 20, 20], R(94));
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.redstone_torch, x, y, 0, 0, 0, 0);
    for (let y = 7; y < 15; y++) { setPx(T.redstone_torch, 7, y, 92, 64, 36); setPx(T.redstone_torch, 8, y, 70, 48, 26); }
    for (const [x, y, c] of [[6, 3, [255, 40, 40]], [7, 2, [255, 120, 120]], [7, 3, [255, 60, 60]], [8, 3, [255, 80, 80]], [7, 4, [200, 20, 20]]] as [number, number, RGB][]) setPx(T.redstone_torch, x, y, c[0], c[1], c[2]);
  }
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.redstone_torch_off, x, y, 0, 0, 0, 0);
    for (let y = 7; y < 15; y++) { setPx(T.redstone_torch_off, 7, y, 92, 64, 36); setPx(T.redstone_torch_off, 8, y, 70, 48, 26); }
    setPx(T.redstone_torch_off, 7, 3, 80, 20, 20); setPx(T.redstone_torch_off, 7, 2, 60, 15, 15);
  }
  {
    const r = R(97);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([120, 100, 80], 0.9 + r() * 0.2); setPx(T.redstone_lamp, x, y, c[0], c[1], c[2]); }
    for (let x = 2; x < 14; x++) { setPx(T.redstone_lamp, x, 2, 90, 70, 50); setPx(T.redstone_lamp, x, 13, 90, 70, 50); }
  }
  {
    const r = R(98);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const glow = 0.8 + r() * 0.4; setPx(T.redstone_lamp_on, x, y, 255 * glow, 180 * glow, 80 * glow); }
  }
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.lever, x, y, 0, 0, 0, 0);
    for (let x = 4; x < 12; x++) for (let y = 12; y < 16; y++) setPx(T.lever, x, y, 120, 120, 120);
    setPx(T.lever, 7, 8, 90, 90, 90); setPx(T.lever, 7, 7, 60, 60, 60); setPx(T.lever, 7, 6, 80, 80, 80);
  }
  {
    const r = R(100);
    noiseFill(T.piston_side, [160, 160, 150], 0.1, r);
    for (let x = 0; x < 16; x++) { setPx(T.piston_side, x, 0, 80, 80, 80); setPx(T.piston_side, x, 15, 80, 80, 80); }
  }
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.piston_top, x, y, 180, 180, 170);
    for (let x = 3; x < 13; x++) for (let y = 3; y < 13; y++) setPx(T.piston_top, x, y, 200, 200, 190);
    for (let x = 5; x < 11; x++) { setPx(T.piston_top, x, 5, 100, 100, 100); setPx(T.piston_top, x, 10, 100, 100, 100); }
  }
  {
    const r = R(102);
    noiseFill(T.piston_bottom, [100, 80, 60], 0.15, r);
  }
  {
    copyTile(T.piston_side, T.sticky_piston_side);
    for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) setPx(T.sticky_piston_side, x, y, 60, 180, 60);
  }
  {
    const r = R(104);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([80, 200, 80], 0.85 + r() * 0.3); setPx(T.slime, x, y, c[0], c[1], c[2], 200); }
  }
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.observer_top, x, y, 100, 100, 100);
    setPx(T.observer_top, 7, 7, 200, 30, 30); setPx(T.observer_top, 8, 7, 200, 30, 30); setPx(T.observer_top, 7, 8, 200, 30, 30); setPx(T.observer_top, 8, 8, 200, 30, 30);
  }
  {
    const r = R(106);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([90, 90, 90], 0.9 + r() * 0.2); setPx(T.observer_side, x, y, c[0], c[1], c[2]); }
    for (let x = 4; x < 12; x++) { setPx(T.observer_side, x, 4, 200, 30, 30); setPx(T.observer_side, x, 11, 80, 80, 80); }
  }
  {
    const r = R(107);
    noiseFill(T.observer_bottom, [60, 60, 60], 0.1, r);
  }
  {
    copyTile(T.cobble, T.dispenser_side);
    const r = R(108);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { if (x < 2 || x > 13 || y < 2 || y > 13) { const c = shade([120, 120, 120], 0.9 + r() * 0.2); setPx(T.dispenser_front, x, y, c[0], c[1], c[2]); } else { setPx(T.dispenser_front, x, y, 40, 40, 40); } }
    setPx(T.dispenser_front, 7, 7, 20, 20, 20); setPx(T.dispenser_front, 8, 7, 20, 20, 20);
  }
  {
    const r = R(110);
    noiseFill(T.note_block, [120, 80, 50], 0.2, r);
    for (let x = 4; x < 12; x++) setPx(T.note_block, x, 4, 200, 200, 220);
  }
  {
    const r = R(111);
    rockTile(T.netherrack, [116, 34, 34], r, 0.3, 1.1);
    for (let i = 0; i < 10; i++) pebble(T.netherrack, r() * 16, r() * 16, 1.1 + r(), [86, 20, 22], r);
  }
  {
    const r = R(112);
    rockTile(T.soul_sand, [82, 64, 54], r, 0.2, 0.6);
    // „dusze”: ciemne oczodoły w rozmytych twarzach
    for (let i = 0; i < 3; i++) {
      const cx = 3 + Math.floor(r() * 10), cy = 3 + Math.floor(r() * 10);
      for (const [dx, dy] of [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [1, 3]] as [number, number][]) {
        px(T.soul_sand, (cx + dx) % 16, (cy + dy) % 16, [54, 42, 34]);
      }
    }
  }
  {
    const r = R(113);
    bricksPattern(T.nether_bricks, [60, 20, 30], [40, 15, 20], 8, 4, r);
  }
  ore(T.quartz_ore, [230, 220, 210], R(114));
  storageBlock(T.quartz_block, [240, 230, 220], R(115));
  {
    const r = R(116);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([240, 230, 220], 0.9 + r() * 0.2); setPx(T.quartz_pillar, x, y, c[0], c[1], c[2]); }
    for (let x = 5; x < 11; x++) { setPx(T.quartz_pillar, x, 0, 200, 190, 180); setPx(T.quartz_pillar, x, 15, 200, 190, 180); }
  }
  {
    copyTile(T.quartz_block, T.quartz_chiseled);
    for (let x = 4; x < 12; x++) { setPx(T.quartz_chiseled, x, 4, 200, 190, 180); setPx(T.quartz_chiseled, x, 11, 200, 190, 180); }
  }
  {
    // Magma: ciemna skorupa z pajęczyną rozżarzonych szczelin.
    for (let y = 0; y < 16; y++)
      for (let x = 0; x < 16; x++) {
        const n = fbm(x, y, 401, 3, 1.5);
        const crack = Math.abs(Math.sin((x * 0.9 + y * 1.7) + n * 6)) < 0.16;
        const base: RGB = crack ? [255, 138, 34] : mixRGB([92, 30, 16], [52, 18, 12], n);
        px(T.magma, x, y, base, crack ? 1 : 0.94 + n * 0.12);
      }
  }
  {
    const r = R(119);
    rockTile(T.end_stone, [226, 228, 178], r, 0.1, 0.2);
  }
  {
    const r = R(120);
    bricksPattern(T.end_bricks, [230, 230, 180], [200, 200, 150], 8, 4, r);
  }
  {
    const r = R(121);
    rockTile(T.purpur_block, [168, 118, 168], r, 0.12, 0.25);
  }
  {
    const r = R(122);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([170, 120, 170], 0.9 + r() * 0.2); setPx(T.purpur_pillar, x, y, c[0], c[1], c[2]); }
    for (let x = 5; x < 11; x++) { setPx(T.purpur_pillar, x, 0, 140, 90, 140); setPx(T.purpur_pillar, x, 15, 140, 90, 140); }
  }
  {
    const r = R(123);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([80, 0, 180], 0.8 + r() * 0.4 + Math.sin(x * 0.8) * 0.2); setPx(T.nether_portal, x, y, c[0], c[1], c[2], 180); }
  }
  {
    const r = R(124);
    noiseFill(T.oak_stairs, [164, 132, 80], 0.1, r);
  }
  // Concrete – flat colors with slight noise
  concrete(T.concrete_white, [222, 222, 224], R(126));
  concrete(T.concrete_red, [176, 44, 44], R(127));
  concrete(T.concrete_blue, [44, 82, 178], R(128));
  concrete(T.concrete_green, [62, 138, 62], R(129));
  concrete(T.concrete_yellow, [222, 202, 48], R(130));
  concrete(T.concrete_black, [26, 26, 30], R(131));
  {
    const r = R(132);
    rockTile(T.terracotta, [178, 100, 72], r, 0.1, 0.18);
  }
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.rail, x, y, 0, 0, 0, 0);
    for (let x = 0; x < 16; x++) { setPx(T.rail, x, 7, 100, 100, 100); setPx(T.rail, x, 8, 80, 80, 80); }
    for (let y = 0; y < 16; y++) { setPx(T.rail, 7, y, 100, 100, 100); setPx(T.rail, 8, y, 80, 80, 80); }
  }
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.powered_rail, x, y, 0, 0, 0, 0);
    for (let x = 0; x < 16; x++) { setPx(T.powered_rail, x, 7, 200, 180, 50); setPx(T.powered_rail, x, 8, 180, 160, 40); }
    for (let y = 0; y < 16; y++) { setPx(T.powered_rail, 7, y, 200, 180, 50); setPx(T.powered_rail, 8, y, 180, 160, 40); }
  }
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.detector_rail, x, y, 0, 0, 0, 0);
    for (let x = 0; x < 16; x++) { setPx(T.detector_rail, x, 7, 180, 50, 50); setPx(T.detector_rail, x, 8, 160, 40, 40); }
  }
  {
    const r = R(136);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([120, 120, 120], 0.9 + r() * 0.2); setPx(T.anvil, x, y, c[0], c[1], c[2]); }
    for (let x = 2; x < 14; x++) { setPx(T.anvil, x, 0, 80, 80, 80); setPx(T.anvil, x, 15, 80, 80, 80); }
  }
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.brewing_top, x, y, 0, 0, 0, 0);
    for (let x = 5; x < 11; x++) for (let y = 5; y < 11; y++) setPx(T.brewing_top, x, y, 60, 60, 70);
    setPx(T.brewing_top, 7, 7, 200, 200, 220); setPx(T.brewing_top, 8, 7, 200, 200, 220);
  }
  {
    const r = R(138);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([80, 60, 50], 0.9 + r() * 0.2); setPx(T.brewing_side, x, y, c[0], c[1], c[2]); }
  }
  {
    const r = R(139);
    noiseFill(T.shroomlight, [220, 120, 80], 0.2, r);
    for (let i = 0; i < 10; i++) setPx(T.shroomlight, Math.floor(r() * 16), Math.floor(r() * 16), 255, 200, 150);
  }
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.basalt_top, x, y, 80, 80, 85);
  }
  {
    const r = R(141);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([70, 70, 75], 0.9 + r() * 0.2); setPx(T.basalt_side, x, y, c[0], c[1], c[2]); }
  }
  {
    const r = R(142);
    noiseFill(T.blackstone, [40, 40, 45], 0.15, r);
  }
  {
    const r = R(143);
    noiseFill(T.soul_soil, [70, 55, 45], 0.15, r);
  }
  {
    const r = R(144);
    noiseFill(T.crying_obsidian, [40, 10, 80], 0.3, r);
    for (let i = 0; i < 20; i++) setPx(T.crying_obsidian, Math.floor(r() * 16), Math.floor(r() * 16), 120, 30, 200);
  }
  {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) setPx(T.target_top, x, y, 240, 240, 240);
    for (let x = 4; x < 12; x++) for (let y = 4; y < 12; y++) setPx(T.target_top, x, y, 200, 40, 40);
    for (let x = 6; x < 10; x++) for (let y = 6; y < 10; y++) setPx(T.target_top, x, y, 240, 240, 240);
    for (let x = 7; x < 9; x++) for (let y = 7; y < 9; y++) setPx(T.target_top, x, y, 200, 40, 40);
  }
  {
    const r = R(146);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([240, 240, 240], 0.9 + r() * 0.1); setPx(T.target_side, x, y, c[0], c[1], c[2]); }
    setPx(T.target_side, 7, 7, 200, 40, 40); setPx(T.target_side, 8, 7, 200, 40, 40); setPx(T.target_side, 7, 8, 200, 40, 40); setPx(T.target_side, 8, 8, 200, 40, 40);
  }
  {
    const r = R(147);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([240, 180, 60], 0.9 + r() * 0.2); setPx(T.honey_block, x, y, c[0], c[1], c[2], 200); }
  }
  {
    const r = R(148);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const c = shade([240, 200, 80], 0.85 + r() * 0.3); setPx(T.honeycomb_block, x, y, c[0], c[1], c[2]); }
    for (let y = 0; y < 16; y += 4) for (let x = 0; x < 16; x++) setPx(T.honeycomb_block, x, y, 200, 160, 50);
  }

  // 2.8.2: NIE zrzucamy tu obrazu do canvasu! Kafelki błota, akacji, liści
  // tropikalnych i lilii wodnej powstają dopiero poniżej, a `densifyTiles`
  // i `polishTiles` poprawiają obraz w `img`. Wcześniejszy `putImageData`
  // zostawiał w atlasie puste (w pełni przezroczyste) liście akacji i dżungli
  // oraz gubił całe wygładzanie krawędzi – stąd „czarne drzewa z
  // przezroczystymi liśćmi”. Zrzut obrazu jest teraz na samym końcu malowania.

  // 3.0 biome atlas additions: textured wet mud, striped acacia bark,
  // layered tropical foliage and a readable water-lily silhouette.
  {
    const r = R(149);
    noiseFill(T.mud, [104, 75, 48], 0.24, r);
    for (let i = 0; i < 18; i++) {
      const x = Math.floor(r() * 16), y = Math.floor(r() * 16);
      setPx(T.mud, x, y, 75 + r() * 24, 57 + r() * 18, 38 + r() * 12);
    }
  }
  {
    const r = R(150);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const stripe = x % 5 === 0 || x % 5 === 1;
      const c = shade(stripe ? [94, 72, 48] : [164, 116, 69], 0.88 + r() * 0.22);
      setPx(T.acacia_side, x, y, c[0], c[1], c[2]);
    }
    logTop(T.acacia_top, [194, 151, 99], [160, 116, 67], [94, 72, 48], R(151));
  }
  leaves(T.jungle_leaves, [42, 112, 44], R(152));
  // 2.8.2: oliwkowa, jaśniejsza korona akacji – sawanna od razu inaczej wygląda.
  leaves(T.acacia_leaves, [126, 146, 66], R(154));
  {
    const r = R(153);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const dx = x - 7.5, dy = y - 7.5;
      const edge = dx * dx + dy * dy > 55;
      const vein = Math.abs(dx) < 1.2 || Math.abs(dy) < 1.2;
      const c = edge ? [35, 91, 42] : vein ? [178, 196, 75] : [69 + r() * 20, 148 + r() * 28, 59];
      setPx(T.lily_pad, x, y, c[0], c[1], c[2], edge ? 0 : 255);
    }
  }

  // --------------------------------------------------------------- 2.17 „Grafika jak w Minecrafcie”
  // Podmieniamy kafelki na prawdziwe tekstury z paczki Pixel Perfection CE.
  // Robimy to **przed** zagęszczeniem liści, bo oficjalne liście mają
  // dziury, a gra traktuje je jak pełny blok (inaczej byłyby czarne plamy).
  applyOfficialTiles(img);

  // --------------------------------------------------------------- 2.8.1 „Światło i chmury”
  // Liście są teraz pełnymi blokami (opaque), więc dziury w ich teksturze
  // muszą zniknąć – inaczej w miejscu „przezroczystych” pikseli pojawiłaby
  // się czerń. Każdy pusty piksel dostaje kolor sąsiada przyciemniony o 18%,
  // dzięki czemu korona wygląda gęsto, ale wciąż ma rysunek liści.
  densifyTiles([T.leaves, T.birch_leaves, T.jungle_leaves, T.acacia_leaves]);

  // --------------------------------------------------------------- 2.8 „Płynny świat”
  // Mikro-odetnienia: każdy nieprzezroczysty kafelek dostaje miękkie,
  // spójne krawędzie (przeciwległe piksele delikatnie się mieszają) oraz
  // subtelny skos — górna krawędź jaśniejsza, dolna ciemniejsza. Bloki
  // przestają zlewać się w jedną plamę, a atlas pozostaje w 100% pikselowy.
  polishTiles();

  // 2.8.2: dopiero teraz cały obraz trafia do atlasu – wszystkie kafelki są
  // narysowane, dziury w liściach wypełnione, a krawędzie wygładzone.
  ctx.putImageData(img, 0, 0);

  // average colors
  for (const d of BLOCKS) {
    if (!d) continue;
    const t = d.side;
    let rr = 0, gg = 0, bb = 0, n = 0;
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const p = getPx(t, x, y); if (p[3] > 0) { rr += p[0]; gg += p[1]; bb += p[2]; n++; } }
    AVG_COLOR[d.id] = n ? [rr / n, gg / n, bb / n] : [128, 128, 128];
  }

  // Icons
  const icons: Record<number, string> = {};
  for (const d of BLOCKS) {
    if (!d || d.id === 0) continue;
    icons[d.id] = makeIcon(canvas, d.id);
  }

  // Cracks
  const cracks: HTMLCanvasElement[] = [];
  const cr = mulberry32(999);
  const crackPts: [number, number][] = [];
  for (let i = 0; i < 160; i++) crackPts.push([Math.floor(cr() * 16), Math.floor(cr() * 16)]);
  for (let s = 0; s < 10; s++) {
    const c = document.createElement('canvas');
    c.width = 16; c.height = 16;
    const cx = c.getContext('2d')!;
    cx.fillStyle = 'rgba(0,0,0,0.75)';
    // random-walk cracks from center
    const wr = mulberry32(42);
    const lines = 2 + s;
    for (let l = 0; l < lines; l++) {
      let x = 8, y = 8;
      const len = 3 + s * 1.2;
      for (let k = 0; k < len; k++) {
        cx.fillRect(x, y, 1, 1);
        x += Math.floor(wr() * 3) - 1;
        y += Math.floor(wr() * 3) - 1;
        x = Math.max(0, Math.min(15, x)); y = Math.max(0, Math.min(15, y));
      }
    }
    for (let i = 0; i < s * 6; i++) cx.fillRect(crackPts[i][0], crackPts[i][1], 1, 1);
    cracks.push(c);
  }

  return { canvas, icons, cracks };
}

/**
 * 2.8.1: wypełnia dziury w kaflach liści. Piksele bez pokrycia dostają kolor
 * najbliższego nieprzezroczystego sąsiada (przyciemniony), więc pełny blok
 * liści nie ma czarnych plam, a sylwetka liścia pozostaje widoczna.
 */
/**
 * 2.8.2: wypełnia dziury w JEDNYM kaflu atlasu, pracując na surowym buforze
 * pikseli. Wydzielone z `densifyTiles`, żeby dało się to przetestować bez
 * prawdziwego canvasu (testy w Node nie mają 2D contextu).
 *
 * Piksele bez pokrycia dostają kolor średniej z nieprzezroczystych sąsiadów
 * (przyciemniony), więc pełny blok liści nie ma czarnych plam, a rysunek
 * liścia pozostaje widoczny.
 */
export function densifyTileData(data: Uint8ClampedArray, tile: number) {
  const baseX = (tile % ATLAS_TILES) * TILE;
  const baseY = Math.floor(tile / ATLAS_TILES) * TILE;
  const at = (x: number, y: number) => ((baseY + y) * ATLAS_SIZE + baseX + x) * 4;
  const src = new Uint8ClampedArray(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const i = at(x, y), o = (y * TILE + x) * 4;
      src[o] = data[i]; src[o + 1] = data[i + 1]; src[o + 2] = data[i + 2]; src[o + 3] = data[i + 3];
    }
  // Dwa przebiegi: pierwszy domyka większość dziur, drugi – resztę.
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const o = (y * TILE + x) * 4;
        if (src[o + 3] >= 128) continue;
        let r = 0, g = 0, b = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx, ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= TILE || ny >= TILE) continue;
            const j = (ny * TILE + nx) * 4;
            if (src[j + 3] < 128) continue;
            r += src[j]; g += src[j + 1]; b += src[j + 2]; n++;
          }
        const shade = 0.82;
        const rr = n ? r / n : 60, gg = n ? g / n : 96, bb = n ? b / n : 40;
        src[o] = rr * shade; src[o + 1] = gg * shade; src[o + 2] = bb * shade; src[o + 3] = 255;
      }
  }
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const i = at(x, y), o = (y * TILE + x) * 4;
      if (src[o + 3] < 128) continue;
      data[i] = src[o]; data[i + 1] = src[o + 1]; data[i + 2] = src[o + 2]; data[i + 3] = 255;
    }
}

function densifyTiles(tiles: number[]) {
  for (const tile of tiles) densifyTileData(img.data, tile);
}

/** Czy kafelek jest w pełni nieprzezroczysty (bez dziur i półprzezroczystości). */
function isOpaqueTile(tile: number): boolean {
  for (let y = 0; y < TILE; y++)
    for (let x = 0; x < TILE; x++) {
      const tx = (tile % ATLAS_TILES) * TILE + x;
      const ty = Math.floor(tile / ATLAS_TILES) * TILE + y;
      if (img.data[(ty * ATLAS_SIZE + tx) * 4 + 3] < 250) return false;
    }
  return true;
}

/**
 * 2.8: spójne krawędzie + skos. Kafelki przezroczyste (rośliny, szkło, woda)
 * są pomijane, żeby nie zamalować ich delikatnych kształtów.
 */
function polishTiles() {
  const buf = new Uint8ClampedArray(TILE * TILE * 4);
  for (const tile of Object.values(T)) {
    if (!isOpaqueTile(tile)) continue;
    // 2.17: kafelki z paczki są już dopracowane przez autora – nie ruszamy
    // ich krawędzi, bo „wygładzanie” zjadało drobny rysunek (cegły, deski).
    if (isOfficialTile(tile)) continue;
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        const tx = (tile % ATLAS_TILES) * TILE + x;
        const ty = Math.floor(tile / ATLAS_TILES) * TILE + y;
        const i = (ty * ATLAS_SIZE + tx) * 4;
        const o = (y * TILE + x) * 4;
        buf[o] = img.data[i]; buf[o + 1] = img.data[i + 1]; buf[o + 2] = img.data[i + 2]; buf[o + 3] = img.data[i + 3];
      }
    const at = (x: number, y: number) => (y * TILE + x) * 4;
    const mix = (a: number, b: number, t: number) => Math.round(a + (b - a) * t);
    // Przeciwległe krawędzie zbliżają się do siebie o 40% – szew między
    // dwoma blokami tego samego typu przestaje być widoczny.
    for (let k = 0; k < TILE; k++) {
      for (const [x, y, ox, oy] of [
        [k, 0, k, TILE - 1],
        [k, TILE - 1, k, 0],
        [0, k, TILE - 1, k],
        [TILE - 1, k, 0, k],
      ] as [number, number, number, number][]) {
        const i = at(x, y), j = at(ox, oy);
        // 2.9: mieszamy tylko 28% – wcześniejsze 40% zjadało drobny rysunek
        // (sęki, listki, żebra), przez co wszystkie bloki wyglądały podobnie.
        setPx(tile, x, y, mix(buf[i], buf[j], 0.28), mix(buf[i + 1], buf[j + 1], 0.28), mix(buf[i + 2], buf[j + 2], 0.28));
      }
    }
    // Skos: górna krawędź jaśniejsza, dolna ciemniejsza, prawa lekko ciemna.
    for (let y = 0; y < TILE; y++)
      for (let x = 0; x < TILE; x++) {
        let f = 1;
        if (y === 0) f *= 1.035;
        if (y === TILE - 1) f *= 0.93;
        if (x === 0) f *= 1.015;
        if (x === TILE - 1) f *= 0.965;
        if (f === 1) continue;
        const p = getPx(tile, x, y);
        setPx(tile, x, y, p[0] * f, p[1] * f, p[2] * f, p[3]);
      }
  }
}

function makeIcon(atlas: HTMLCanvasElement, id: number): string {
  const c = document.createElement('canvas');
  c.width = 48; c.height = 48;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const drawTile = (tile: number) => {
    const sx = (tile % ATLAS_TILES) * TILE, sy = Math.floor(tile / ATLAS_TILES) * TILE;
    ctx.drawImage(atlas, sx, sy, 16, 16, 0, 0, 16, 16);
  };
  if (RENDER[id] === 1) {
    ctx.setTransform(2.6, 0, 0, 2.6, 3, 3);
    drawTile(tileFor(id, 0));
  } else {
    // top
    ctx.setTransform(21 / 16, -11 / 16, 21 / 16, 11 / 16, 3, 13);
    drawTile(tileFor(id, 3));
    // left (front)
    ctx.setTransform(21 / 16, 11 / 16, 0, 24 / 16, 3, 13);
    drawTile(tileFor(id, 5));
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillRect(0, 0, 16, 16);
    ctx.globalCompositeOperation = 'source-over';
    // right
    ctx.setTransform(21 / 16, -11 / 16, 0, 24 / 16, 24, 24);
    drawTile(tileFor(id, 1));
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillRect(0, 0, 16, 16);
    ctx.globalCompositeOperation = 'source-over';
  }
  return c.toDataURL();
}

let cachedAtlas: AtlasResult | null = null;
export function getAtlas(): AtlasResult {
  if (!cachedAtlas) cachedAtlas = buildAtlas();
  return cachedAtlas;
}

export function tileUV(tile: number, u: number, v: number): [number, number] {
  return tileUVInset(tile, u, v, 0);
}

/**
 * Jak `tileUV`, ale z marginesem liczonym w pikselach tekstury (16 px kafelka).
 *
 * 2.20: kaktus ma w paczce 1 px przezroczystej ramki; wanilia rysuje go jako
 * bryłę 14/16, więc obcinamy ramkę, żeby na krawędziach nie było dziur.
 */
/**
 * Wycinek kafelka w pikselach 16×16. `v` liczone OD DOŁU kafelka
 * (tak jak UV siatki), więc np. patyczek pochodni to `[7, 0, 9, 10]`.
 *
 * 2.21: pochodnia w paczce ma 2×10 px patyczka w 16×16 kafelku – rysujemy
 * dokładnie ten wycinek na smukłej bryle, zamiast rozciągać cały kafelek.
 */
export function tileUVRect(tile: number, rect: readonly [number, number, number, number], u: number, v: number): [number, number] {
  const col = tile % ATLAS_TILES;
  const row = Math.floor(tile / ATLAS_TILES);
  const e = 0.0004;
  const a = (rect[0] + u * (rect[2] - rect[0])) / 16;
  const b = (rect[1] + v * (rect[3] - rect[1])) / 16;
  const U = (col + a) / ATLAS_TILES + (u === 0 ? e : -e);
  const V = 1 - (row + 1 - b) / ATLAS_TILES + (v === 0 ? e : -e);
  return [U, V];
}

export function tileUVInset(tile: number, u: number, v: number, inset = 0): [number, number] {
  const col = tile % ATLAS_TILES;
  const row = Math.floor(tile / ATLAS_TILES);
  const e = 0.0004;
  const span = 16 - inset * 2;
  const a = (inset + u * span) / 16;
  const b = (inset + v * span) / 16;
  const U = (col + a) / ATLAS_TILES + (u === 0 ? e : -e);
  const V = 1 - (row + 1 - b) / ATLAS_TILES + (v === 0 ? e : -e);
  return [U, V];
}
