/**
 * BlockCraft 2.18 – tekstury z paczki jako `THREE.DataTexture`.
 *
 * `miniPng` dekoduje PNG w czystym JS (bez DOM), więc tę samą ścieżką idą
 * testy w Node i gra w przeglądarce. `DataTexture` nie odwraca osi Y
 * (`flipY = false`), dlatego UV w modelach liczymy „od góry” obrazka.
 */

import * as THREE from 'three';
import { GUI_SPRITES } from './vanillaArt.generated';
import { decodePng } from './miniPng';

const cache = new Map<string, THREE.Texture | null>();

/** Tekstura `guiSprite` z paczki (albo `null`, gdy jej brak). */
export function spriteTexture(name: string): THREE.Texture | null {
  if (cache.has(name)) return cache.get(name) ?? null;
  const png = GUI_SPRITES[name];
  if (!png) {
    cache.set(name, null);
    return null;
  }
  try {
    const img = decodePng(png);
    const tex = new THREE.DataTexture(new Uint8Array(img.data), img.width, img.height, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.flipY = false;
    tex.needsUpdate = true;
    cache.set(name, tex);
    return tex;
  } catch (e) {
    console.warn('Nie udało się odczytać grafiki z paczki:', name, e);
    cache.set(name, null);
    return null;
  }
}
