/**
 * BlockCraft 2.18 – grafika interfejsu wprost z paczki tekstur.
 *
 * Paczka trzyma ikony HUD jako osobne PNG (`gui/sprites/hud/...`): serca,
 * drumsticki, pancerz, pęcherzyki powietrza, pasek doświadczenia, celownik,
 * hotbar, a także słońce, księżyc i chmury. Kompilator pakuje je do
 * `GUI_SPRITES` (base64), a ten moduł udostępnia je jako gotowe adresy `data:`
 * — bez sieci, bez canvasu, więc działa też w testach.
 */

import { GUI_SPRITES } from './vanillaArt.generated';

const cache = new Map<string, string | null>();

/**
 * Adres `data:image/png;base64,...` dla grafiki z paczki (albo `null`).
 * Kompilator zapisuje w `GUI_SPRITES` już gotowy adres, ale moduł toleruje
 * też sam base64 – prefiks doklejamy tylko wtedy, gdy go brakuje.
 */
export function guiSprite(name: string): string | null {
  if (cache.has(name)) return cache.get(name) ?? null;
  const png = GUI_SPRITES[name];
  const url = png ? (png.startsWith('data:') ? png : `data:image/png;base64,${png}`) : null;
  cache.set(name, url);
  return url;
}

/** Czy paczka zawiera daną grafikę interfejsu. */
export function hasGuiSprite(name: string): boolean {
  return GUI_SPRITES[name] != null;
}

/** Ile grafik interfejsu pochodzi z paczki (diagnostyka i testy). */
export function guiSpriteCount(): number {
  return Object.keys(GUI_SPRITES).length;
}

/**
 * Serce: `fill` 0 – puste, 1 – pół, 2 – pełne. Puste serce to kontur
 * z paczki, dzięki czemu wygląda jak w grze (a nie jak szary kwadrat).
 */
export function heartSprite(fill: 0 | 1 | 2): string | null {
  return guiSprite(fill === 2 ? 'heart_full' : fill === 1 ? 'heart_half' : 'heart_container');
}

/** Głód (drumstick): 0 – pusty, 1 – pół, 2 – pełny. */
export function foodSprite(fill: 0 | 1 | 2): string | null {
  return guiSprite(fill === 2 ? 'food_full' : fill === 1 ? 'food_half' : 'food_empty');
}

/** Pancerz: 0 – pusty, 1 – pół, 2 – pełny. */
export function armorSprite(fill: 0 | 1 | 2): string | null {
  return guiSprite(fill === 2 ? 'armor_full' : fill === 1 ? 'armor_half' : 'armor_empty');
}

/** Pęcherzyk powietrza: `empty` = już zużyty. */
export function airSprite(empty: boolean): string | null {
  return guiSprite(empty ? 'air_empty' : 'air');
}

/** Nazwy grafik, które trafiły do builda – do podpowiedzi w testach. */
export const GUI_SPRITE_NAMES: readonly string[] = Object.keys(GUI_SPRITES);
