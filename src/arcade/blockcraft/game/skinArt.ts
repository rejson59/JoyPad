/**
 * 2.17: skórki graczy wprost z paczki tekstur.
 *
 * Paczka zawiera klasyczne skórki 64×64 (`player/wide/steve.png` oraz
 * `player/slim/alex.png`). Tutaj rozkładamy je na nasze proste pudła
 * (głowa, tors, ręce, nogi) według **waniliowego układu UV** Minecrafta,
 * dzięki czemu twarz, koszulka i buty trafiają dokładnie tam, gdzie trzeba –
 * tak samo jak w oryginalnej grze.
 *
 * Układ UV pudełka (standard Minecrafta) dla części o rozmiarze w×h×d
 * umieszczonej w punkcie (u, v) tekstury:
 *
 *   top:    (u+d,       v)        w×d
 *   bottom: (u+d+w,     v)        w×d
 *   right:  (u,         v+d)      d×h   (prawa strona postaci)
 *   front:  (u+d,       v+d)      w×h
 *   left:   (u+d+w,     v+d)      d×h
 *   back:   (u+d+w+d,   v+d)      w×h
 */

import * as THREE from 'three';
import { PLAYER_SKIN_PNG, PLAYER_SKIN_SLIM, PLAYER_FACE_PNG, PLAYER_PORTRAIT_PNG } from './art/vanillaArt.generated';
import { decodePng } from './art/miniPng';

export interface SkinRect {
  u: number;
  v: number;
  w: number;
  h: number;
  d: number;
}

/** Klasyczny (szeroki) układ 64×64 – Steve. */
export const WIDE_LAYOUT = {
  head: { u: 0, v: 0, w: 8, h: 8, d: 8 },
  body: { u: 16, v: 16, w: 8, h: 12, d: 4 },
  rightArm: { u: 40, v: 16, w: 4, h: 12, d: 4 },
  rightLeg: { u: 0, v: 16, w: 4, h: 12, d: 4 },
  leftLeg: { u: 16, v: 48, w: 4, h: 12, d: 4 },
  leftArm: { u: 32, v: 48, w: 4, h: 12, d: 4 },
} satisfies Record<string, SkinRect>;

/** Smukły układ (Alex): ręce mają 3 piksele szerokości. */
export const SLIM_LAYOUT = {
  ...WIDE_LAYOUT,
  rightArm: { u: 40, v: 16, w: 3, h: 12, d: 4 },
  leftArm: { u: 32, v: 48, w: 3, h: 12, d: 4 },
} satisfies Record<string, SkinRect>;

const textures = new Map<string, THREE.Texture | null>();
let failed = false;

/** Tekstura skórki z paczki albo `null`, gdy canvas/PNG zawiodą. */
export function playerSkinTexture(id: string): THREE.Texture | null {
  if (failed) return null;
  if (textures.has(id)) return textures.get(id) ?? null;
  const data = PLAYER_SKIN_PNG[id];
  if (!data) {
    textures.set(id, null);
    return null;
  }
  try {
    const img = decodePng(data);
    const tex = new THREE.DataTexture(new Uint8Array(img.data), img.width, img.height, THREE.RGBAFormat);
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.needsUpdate = true;
    textures.set(id, tex);
    return tex;
  } catch (e) {
    console.warn('Nie udało się odczytać skórki gracza z paczki.', e);
    failed = true;
    textures.set(id, null);
    return null;
  }
}

/** Czy skórka gracza pochodzi z paczki (ma prawdziwą teksturę). */
export function hasPackSkin(id: string): boolean {
  return PLAYER_SKIN_PNG[id] != null;
}

/** 2.19: czy skórka używa smukłego modelu (Alex, Efe). */
export function isSlimSkin(id: string): boolean {
  return PLAYER_SKIN_SLIM[id] === true;
}

/** Twarz 8×8 (głowa + czapka) jako gotowy adres `data:` – lista graczy. */
export function skinFace(id: string): string | null {
  return PLAYER_FACE_PNG[id] ?? null;
}

/** Portret 16×32 (cała postać z ubraniem) – wybór skórki w menu. */
export function skinPortrait(id: string): string | null {
  return PLAYER_PORTRAIT_PNG[id] ?? null;
}

/** Ile skórek ma twarz i portret (diagnostyka i testy). */
export function portraitCount(): number {
  return Object.keys(PLAYER_PORTRAIT_PNG).length;
}

export interface SkinUvRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Prostokąty UV (w pikselach tekstury) dla sześciu ścian pudełka.
 * Kolejność odpowiada `BoxGeometry`: +X, −X, +Y, −Y, +Z, −Z.
 */
export function faceRects(r: SkinRect): SkinUvRect[] {
  const { u, v, w, h, d } = r;
  const rect = (x: number, y: number, rw: number, rh: number): SkinUvRect => ({
    x0: x, y0: y, x1: x + rw, y1: y + rh,
  });
  return [
    rect(u, v + d, d, h), // +X – prawa strona postaci
    rect(u + d + w, v + d, d, h), // −X – lewa strona
    rect(u + d, v, w, d), // +Y – góra
    rect(u + d + w, v, w, d), // −Y – dół
    rect(u + d + w + d, v + d, w, h), // +Z – plecy (postać patrzy w −Z)
    rect(u + d, v + d, w, h), // −Z – przód (twarz, koszulka)
  ];
}

/**
 * Nadpisuje UV pudełka regionami ze skórki. `BoxGeometry` ma 4 wierzchołki
 * na ścianę, w kolejności lewy-górny, prawy-górny, lewy-dolny, prawy-dolny.
 */
export function applySkinUv(geometry: THREE.BoxGeometry, rect: SkinRect, texW: number, texH: number) {
  const uv = geometry.attributes.uv as THREE.BufferAttribute;
  const faces = faceRects(rect);
  for (let f = 0; f < 6; f++) {
    const { x0, y0, x1, y1 } = faces[f];
    const u0 = x0 / texW;
    const u1 = x1 / texW;
    // `DataTexture` ma `flipY = false`, więc wiersz 0 danych trafia do v = 0.
    // Innymi słowy v = 0 to góra obrazka (a nie dół, jak przy zwykłej
    // teksturze z `Image`). Wierzchołki BoxGeometry są w kolejności
    // lewy-górny, prawy-górny, lewy-dolny, prawy-dolny, więc góra ściany
    // dostaje y0, a dół y1.
    const v0 = y0 / texH;
    const v1 = y1 / texH;
    const base = f * 4;
    uv.setXY(base + 0, u0, v0);
    uv.setXY(base + 1, u1, v0);
    uv.setXY(base + 2, u0, v1);
    uv.setXY(base + 3, u1, v1);
  }
  uv.needsUpdate = true;
}

/**
 * 2.19: druga warstwa głowy (czapka/włosy). W waniliowym układzie 64×64
 * nakładka głowy leży pod (32, 0), więc jej przód to (40, 8)–(48, 16).
 * Pudełko jest o milimetr większe, a przezroczyste piksele znikają przez
 * `alphaTest` – dokładnie tak, jak robi to gra.
 */
export function skinnedHat(size: [number, number, number], tex: THREE.Texture): THREE.Mesh {
  const geometry = new THREE.BoxGeometry(size[0] + 0.012, size[1] + 0.012, size[2] + 0.012);
  const img = tex.image as { width: number; height: number };
  applySkinUv(geometry, { u: 32, v: 0, w: 8, h: 8, d: 8 }, img.width, img.height);
  const material = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.5, depthWrite: false });
  return new THREE.Mesh(geometry, material);
}

/**
 * Buduje pudełko ze skórki. `slim` wybiera układ Alexa (węższe ręce).
 * Zwraca `null`, gdy skórka nie jest dostępna – wtedy gra zostaje przy
 * kolorowej postaci z `makeAvatar`.
 */
export function skinnedBox(
  size: [number, number, number],
  part: keyof typeof WIDE_LAYOUT,
  tex: THREE.Texture,
  slim = false
): THREE.Mesh {
  const [w, h, d] = size;
  const geometry = new THREE.BoxGeometry(w, h, d);
  const img = tex.image as { width: number; height: number };
  const layout = slim ? SLIM_LAYOUT : WIDE_LAYOUT;
  applySkinUv(geometry, layout[part], img.width, img.height);
  const material = new THREE.MeshBasicMaterial({ map: tex });
  return new THREE.Mesh(geometry, material);
}

/** Ile skórek pochodzi z paczki (diagnostyka i testy). */
export function packSkinCount(): number {
  return Object.keys(PLAYER_SKIN_PNG).length;
}
