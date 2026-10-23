/**
 * 2.17: grafika z paczki „Pixel Perfection CE” wkomponowana w atlas gry.
 *
 * Gra rysuje świat z jednego atlasu 256×256 (16 × 16 kafelków po 16 px).
 * Ten moduł podmienia wybrane kafelki na prawdziwe tekstury z paczki
 * (`vanillaArt.generated.ts`), a resztę – której paczka 1.16 nie ma –
 * zostawia proceduralnym teksturom z `textures.ts`.
 *
 * Wszystko dzieje się synchronicznie: PNG w base64 dekodujemy własnym
 * dekoderem, więc działa też w testach w Node (bez canvasu i bez DOM).
 */

import {
  BLOCK_ATLAS_PNG,
  ITEM_ATLAS_PNG,
  ITEM_TILE,
  OFFICIAL_TILES,
} from './art/vanillaArt.generated';
import { decodePng, type DecodedImage } from './art/miniPng';

const TILE = 16;
const ATLAS_TILES = 16;
const ATLAS_SIZE = TILE * ATLAS_TILES;

let blockImage: DecodedImage | null = null;
let itemImage: DecodedImage | null = null;
let failed = false;

function decode(data: string): DecodedImage | null {
  try {
    return decodePng(data);
  } catch (e) {
    console.warn('Nie udało się odczytać grafiki paczki – zostają tekstury proceduralne.', e);
    return null;
  }
}

/** Obraz atlasu bloków z paczki (leniwie, raz na sesję). */
export function officialBlockAtlas(): DecodedImage | null {
  if (failed) return null;
  if (!blockImage) blockImage = decode(BLOCK_ATLAS_PNG);
  if (!blockImage) failed = true;
  return blockImage;
}

/** Obraz atlasu ikon przedmiotów (leniwie, raz na sesję). */
export function officialItemAtlas(): DecodedImage | null {
  if (failed) return null;
  if (!itemImage) itemImage = decode(ITEM_ATLAS_PNG);
  if (!itemImage) failed = true;
  return itemImage;
}

/** Czy dany kafelek atlasu pochodzi z paczki (a nie z generatora gry). */
export function isOfficialTile(tile: number): boolean {
  return OFFICIAL_TILES.includes(tile);
}

/**
 * Nadpisuje kafelki oficjalną grafiką. `img` to bufor całego atlasu gry,
 * dokładnie ten, który potem trafia do `putImageData`.
 */
export function applyOfficialTiles(img: ImageData): number {
  const src = officialBlockAtlas();
  if (!src || src.width !== ATLAS_SIZE || src.height !== ATLAS_SIZE) return 0;
  let copied = 0;
  for (const tile of OFFICIAL_TILES) {
    const ox = (tile % ATLAS_TILES) * TILE;
    const oy = Math.floor(tile / ATLAS_TILES) * TILE;
    for (let y = 0; y < TILE; y++) {
      const s = ((oy + y) * ATLAS_SIZE + ox) * 4;
      const d = ((oy + y) * ATLAS_SIZE + ox) * 4;
      for (let x = 0; x < TILE * 4; x++) img.data[d + x] = src.data[s + x];
    }
    copied++;
  }
  return copied;
}

/** Ile kafelków atlasu pochodzi z paczki. */
export function officialTileCount(): number {
  return OFFICIAL_TILES.length;
}

/**
 * Ikona przedmiotu (16×16 RGBA) z paczki albo `null`, gdy przedmiot nie ma
 * odpowiednika w paczce 1.16 (tarcza, lorneta…).
 */
export function officialItemPixels(id: number): Uint8Array | null {
  const src = officialItemAtlas();
  const tile = ITEM_TILE[id];
  if (!src || tile === undefined) return null;
  const ox = (tile % ATLAS_TILES) * TILE;
  const oy = Math.floor(tile / ATLAS_TILES) * TILE;
  const out = new Uint8Array(TILE * TILE * 4);
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const s = ((oy + y) * ATLAS_SIZE + ox + x) * 4;
      const d = (y * TILE + x) * 4;
      out[d] = src.data[s];
      out[d + 1] = src.data[s + 1];
      out[d + 2] = src.data[s + 2];
      out[d + 3] = src.data[s + 3];
    }
  }
  return out;
}

/** Czy przedmiot ma ikonę z paczki. */
export function hasOfficialItemIcon(id: number): boolean {
  return ITEM_TILE[id] !== undefined;
}

/** Ile przedmiotów ma oficjalną ikonę. */
export function officialItemCount(): number {
  return Object.keys(ITEM_TILE).length;
}
