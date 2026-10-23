/**
 * 2.16: tekstury mobów i graczy w stylu Minecrafta.
 *
 * Wcześniej każda część ciała była jednym, płaskim kolorem (`MeshLambertMaterial`
 * z `color`), więc owca wyglądała jak biały karton, a zombie jak zielony kloc.
 * Tutaj generujemy **prawdziwe, wielobarwne tekstury pikselowe** (16 × 16),
 * malowane proceduralnie: cętki krowy, runo owcy, łuski pająka, szwy ubrania,
 * szczotkowane żelazo golema itd.
 *
 * Wybór `DataTexture` zamiast canvasu jest celowy:
 *  - nie zależy od DOM (działa w testach i w jsdom),
 *  - jest deterministyczny (ten sam mob zawsze wygląda tak samo),
 *  - nie tworzy dziesiątek elementów `<canvas>` przy każdym odrodzeniu moba.
 *
 * Kolory są liczone w sRGB, bo tak samo interpretuje je THREE przy `color`.
 */

import * as THREE from 'three';
import { MOB_PALETTES } from './art/vanillaArt.generated';

export type MobTexKind =
  | 'grain'
  | 'cow-hide'
  | 'pig-hide'
  | 'wool'
  | 'sheep-face'
  | 'feather'
  | 'beak'
  | 'creeper'
  | 'zombie-skin'
  | 'cloth'
  | 'denim'
  | 'chitin'
  | 'bone'
  | 'wolf-fur'
  | 'villager-skin'
  | 'robe'
  | 'iron'
  | 'enderman'
  | 'slime'
  | 'ghast'
  | 'vine'
  | 'wood'
  | 'skin'
  | 'hair'
  | 'leather';

/** Rozmiar tekstury w pikselach (jak w Minecrafcie: mało, ale czytelnie). */
const SIZE = 16;

// ---------------------------------------------------------------------------
// Kolory
// ---------------------------------------------------------------------------

function rgbOf(hex: number): [number, number, number] {
  return [(hex >> 16) & 0xff, (hex >> 8) & 0xff, hex & 0xff];
}

function hexOf(r: number, g: number, b: number): number {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  return (c(r) << 16) | (c(g) << 8) | c(b);
}

/** Mieszanie dwóch kolorów; `t` = 0 → `a`, `t` = 1 → `b`. */
export function mixHex(a: number, b: number, t: number): number {
  const [ar, ag, ab] = rgbOf(a);
  const [br, bg, bb] = rgbOf(b);
  return hexOf(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

export function lighten(hex: number, f: number): number {
  return mixHex(hex, 0xffffff, f);
}

export function darken(hex: number, f: number): number {
  return mixHex(hex, 0x000000, f);
}

// ---------------------------------------------------------------------------
// Losowość deterministyczna
// ---------------------------------------------------------------------------

function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// Malarz pikseli
// ---------------------------------------------------------------------------

class Painter {
  readonly px = new Uint8Array(SIZE * SIZE * 4);
  readonly rnd: () => number;
  readonly base: number;

  constructor(base: number, seed: number) {
    this.base = base;
    this.rnd = mulberry32(seed);
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) this.set(x, y, base);
    }
  }

  set(x: number, y: number, color: number) {
    const xi = ((x % SIZE) + SIZE) % SIZE;
    const yi = ((y % SIZE) + SIZE) % SIZE;
    const i = (yi * SIZE + xi) * 4;
    const [r, g, b] = rgbOf(color);
    this.px[i] = r;
    this.px[i + 1] = g;
    this.px[i + 2] = b;
    this.px[i + 3] = 255;
  }

  get(x: number, y: number): number {
    const xi = ((x % SIZE) + SIZE) % SIZE;
    const yi = ((y % SIZE) + SIZE) % SIZE;
    const i = (yi * SIZE + xi) * 4;
    return (this.px[i] << 16) | (this.px[i + 1] << 8) | this.px[i + 2];
  }

  /** Rozjaśnia/ciemnieje pojedynczy piksel. */
  shadeAt(x: number, y: number, f: number) {
    this.set(x, y, f >= 0 ? lighten(this.get(x, y), f) : darken(this.get(x, y), -f));
  }

  /** Równomierny szum – podstawa każdej tekstury. */
  noise(amount: number) {
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        this.shadeAt(x, y, (this.rnd() - 0.5) * amount);
      }
    }
  }

  /** Pojedyncze piksele w losowych miejscach (piegi, cętki, iskry). */
  dots(color: number, count: number, area = SIZE * SIZE) {
    for (let i = 0; i < count; i++) {
      const x = Math.floor(this.rnd() * SIZE);
      const y = Math.floor(this.rnd() * area / SIZE);
      this.set(x, y, mixHex(color, this.get(x, y), 0.25));
    }
  }

  /** Okrągła plama z rozmytym brzegiem (cętki krowy, łaty mchu). */
  blob(cx: number, cy: number, r: number, color: number) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d > r) continue;
        const edge = d / r;
        const t = edge > 0.7 ? 0.45 : 0.9;
        this.set(x, y, mixHex(color, this.get(x, y), 1 - t));
      }
    }
  }

  /** Kreska pozioma/pionowa o zadanej długości. */
  line(x: number, y: number, len: number, color: number, vertical = false) {
    for (let i = 0; i < len; i++) {
      if (vertical) this.set(x, y + i, mixHex(color, this.get(x, y + i), 0.3));
      else this.set(x + i, y, mixHex(color, this.get(x + i, y), 0.3));
    }
  }
}

// ---------------------------------------------------------------------------
// Wzory
// ---------------------------------------------------------------------------

function paintKind(kind: MobTexKind, p: Painter) {
  const base = p.base;
  switch (kind) {
    case 'cow-hide': {
      // Brązowe futro z dużymi, kremowymi łatami – jak krowa z Minecrafta.
      p.noise(0.22);
      const cream = mixHex(0xf0e8d8, base, 0.04);
      p.blob(4.5, 4.5, 3.6, cream);
      p.blob(12.2, 11.5, 3.2, cream);
      p.blob(10.5, 2.5, 1.9, cream);
      p.blob(3.2, 13.2, 2.4, darken(base, 0.22));
      // krótkie włoski
      for (let i = 0; i < 12; i++) {
        const x = Math.floor(p.rnd() * SIZE);
        const y = Math.floor(p.rnd() * SIZE);
        p.line(x, y, 2, darken(base, 0.12), true);
      }
      break;
    }
    case 'pig-hide': {
      // Różowa skóra z delikatnymi cętkami i ciemniejszym podbrzuszem.
      p.noise(0.12);
      p.dots(darken(base, 0.16), 18);
      p.dots(lighten(base, 0.14), 10);
      for (let x = 0; x < SIZE; x++) {
        p.set(x, SIZE - 1, lighten(p.get(x, SIZE - 1), 0.06));
        p.set(x, 0, darken(p.get(x, 0), 0.05));
      }
      break;
    }
    case 'wool': {
      // Runo: gęste, faliste kłębki jasne i ciemne.
      p.noise(0.16);
      for (let i = 0; i < 26; i++) {
        const x = Math.floor(p.rnd() * SIZE);
        const y = Math.floor(p.rnd() * SIZE);
        const len = 2 + Math.floor(p.rnd() * 3);
        p.line(x, y, len, p.rnd() > 0.5 ? lighten(base, 0.2) : darken(base, 0.18));
        p.shadeAt(x + 1, y + 1, p.rnd() > 0.5 ? 0.16 : -0.16);
      }
      p.dots(lighten(base, 0.3), 12);
      break;
    }
    case 'sheep-face': {
      p.noise(0.12);
      p.dots(darken(base, 0.13), 12);
      for (let x = 0; x < SIZE; x++) p.set(x, SIZE - 1, darken(p.get(x, SIZE - 1), 0.12));
      break;
    }
    case 'feather': {
      // Pióra: miękkie białe smugi z ciemniejszymi promieniami.
      p.noise(0.08);
      for (let x = 0; x < SIZE; x += 3) {
        p.line(x, 0, SIZE, lighten(base, 0.16), true);
        p.line(x + 1, 0, SIZE, darken(base, 0.09), true);
      }
      p.dots(darken(base, 0.16), 8);
      break;
    }
    case 'beak': {
      p.noise(0.1);
      p.dots(darken(base, 0.2), 6);
      p.dots(lighten(base, 0.18), 6);
      break;
    }
    case 'creeper': {
      // Creeper: ciemnozielone plamy i jasny mech na ciemniejszej bazie.
      p.noise(0.24);
      for (let i = 0; i < 8; i++) {
        const x = Math.floor(p.rnd() * SIZE);
        const y = Math.floor(p.rnd() * SIZE);
        p.blob(x, y, 1.6 + p.rnd() * 1.6, darken(base, 0.2));
      }
      p.dots(lighten(base, 0.22), 22);
      p.dots(darken(base, 0.28), 26);
      break;
    }
    case 'zombie-skin': {
      // Zielona, gnijąca skóra: ciemniejsze łaty i czarne rysy.
      p.noise(0.2);
      p.blob(3.5, 11, 2.6, darken(base, 0.2));
      p.blob(12, 4, 2.2, darken(base, 0.16));
      p.dots(lighten(base, 0.18), 14);
      p.dots(0x2b3a1e, 9);
      break;
    }
    case 'cloth':
    case 'robe': {
      // Tkanina: splot (co druga linia) + fałdy i ściegi.
      p.noise(0.08);
      for (let y = 0; y < SIZE; y += 2) for (let x = 0; x < SIZE; x++) p.shadeAt(x, y, -0.06);
      for (let x = 0; x < SIZE; x += 4) p.line(x, 0, SIZE, darken(base, 0.08), true);
      if (kind === 'robe') {
        for (let x = 1; x < SIZE; x += 5) p.line(x, 0, SIZE, lighten(base, 0.1), true);
        for (let x = 0; x < SIZE; x++) p.set(x, 1, darken(p.get(x, 1), 0.16));
      } else {
        p.dots(lighten(base, 0.14), 10);
        p.dots(darken(base, 0.12), 10);
      }
      break;
    }
    case 'denim': {
      // Jeans: ukośny splot + mocniejsze szwy na brzegach.
      p.noise(0.09);
      for (let x = 0; x < SIZE; x++) {
        p.shadeAt(x, (x * 3) % SIZE, -0.12);
        p.shadeAt(x, (x * 3 + 8) % SIZE, -0.08);
      }
      for (let x = 0; x < SIZE; x++) {
        p.set(x, 0, lighten(p.get(x, 0), 0.12));
        p.set(x, SIZE - 1, darken(p.get(x, SIZE - 1), 0.14));
      }
      break;
    }
    case 'chitin': {
      // Pająk: ciemny pancerz z włoskami i połyskiem.
      p.noise(0.3);
      for (let i = 0; i < 22; i++) {
        const x = Math.floor(p.rnd() * SIZE);
        const y = Math.floor(p.rnd() * SIZE);
        p.line(x, y, 2 + Math.floor(p.rnd() * 3), lighten(base, 0.22), true);
      }
      p.dots(0x120c08, 10);
      p.dots(lighten(base, 0.3), 6);
      break;
    }
    case 'bone': {
      // Kość: kremowa, z szarymi pęknięciami i ciemniejszymi stawami.
      p.noise(0.1);
      for (let i = 0; i < 4; i++) {
        let x = Math.floor(p.rnd() * SIZE);
        let y = Math.floor(p.rnd() * 10);
        for (let s = 0; s < 4; s++) {
          p.set(x, y, darken(base, 0.22));
          x += p.rnd() > 0.5 ? 1 : 0;
          y += 1;
        }
      }
      for (let x = 0; x < SIZE; x++) {
        p.set(x, 0, darken(p.get(x, 0), 0.1));
        p.set(x, SIZE - 1, darken(p.get(x, SIZE - 1), 0.16));
      }
      break;
    }
    case 'wolf-fur': {
      // Wilk: pręgi futra, ciemne końcówki i jaśniejszy spód.
      p.noise(0.16);
      for (let i = 0; i < 20; i++) {
        const x = Math.floor(p.rnd() * SIZE);
        const y = Math.floor(p.rnd() * SIZE);
        p.line(x, y, 3, p.rnd() > 0.55 ? lighten(base, 0.18) : darken(base, 0.18), true);
      }
      for (let x = 0; x < SIZE; x++) p.set(x, SIZE - 1, lighten(p.get(x, SIZE - 1), 0.24));
      p.dots(darken(base, 0.25), 12);
      break;
    }
    case 'villager-skin': {
      p.noise(0.1);
      p.blob(4, 12, 2.2, darken(base, 0.14));
      p.blob(12.5, 3, 1.8, lighten(base, 0.12));
      p.dots(darken(base, 0.18), 10);
      break;
    }
    case 'iron': {
      // Żelazny golem: szczotkowane poziome smugi i nity w narożnikach.
      p.noise(0.14);
      for (let y = 0; y < SIZE; y += 2) {
        for (let x = 0; x < SIZE; x++) p.shadeAt(x, y, p.rnd() > 0.5 ? 0.1 : -0.08);
      }
      for (const [x, y] of [[2, 2], [13, 2], [2, 13], [13, 13]] as const) {
        p.set(x, y, darken(base, 0.3));
        p.set(x + 1, y, lighten(base, 0.3));
      }
      for (let x = 0; x < SIZE; x++) {
        p.set(x, 0, darken(p.get(x, 0), 0.18));
        p.set(x, SIZE - 1, darken(p.get(x, SIZE - 1), 0.22));
      }
      break;
    }
    case 'enderman': {
      // Czarna skóra z fioletowymi przebłyskami i pionowymi smugami.
      p.noise(0.35);
      for (let i = 0; i < 9; i++) {
        const x = Math.floor(p.rnd() * SIZE);
        const y = Math.floor(p.rnd() * SIZE);
        p.line(x, y, 2 + Math.floor(p.rnd() * 4), 0x4a2a6a, true);
        p.set(x + 1, y, 0x2a1438);
      }
      p.dots(0x3a2050, 6);
      break;
    }
    case 'slime': {
      // Śluz: jasne bąbelki i ciemniejsza obwódka.
      p.noise(0.14);
      for (let i = 0; i < 7; i++) {
        const cx = 2 + p.rnd() * 12;
        const cy = 2 + p.rnd() * 12;
        const r = 1.2 + p.rnd() * 1.8;
        p.blob(cx, cy, r, lighten(base, 0.25));
        p.set(Math.round(cx), Math.round(cy), lighten(base, 0.45));
      }
      for (let x = 0; x < SIZE; x++) {
        p.set(x, 0, darken(p.get(x, 0), 0.2));
        p.set(x, SIZE - 1, darken(p.get(x, SIZE - 1), 0.2));
        p.set(0, x, darken(p.get(0, x), 0.16));
        p.set(SIZE - 1, x, darken(p.get(SIZE - 1, x), 0.16));
      }
      break;
    }
    case 'ghast': {
      // Ghast: biała skóra z pionowymi zmarszczkami i łzawymi plamami.
      p.noise(0.08);
      for (let x = 1; x < SIZE; x += 4) {
        for (let y = 0; y < SIZE; y++) {
          p.shadeAt(x + (y % 2), y, -0.1);
        }
      }
      p.blob(4, 12, 2, darken(base, 0.12));
      p.blob(12, 5, 1.6, darken(base, 0.14));
      break;
    }
    case 'vine': {
      p.noise(0.2);
      for (let i = 0; i < 8; i++) {
        const x = Math.floor(p.rnd() * SIZE);
        const y = Math.floor(p.rnd() * SIZE);
        p.blob(x, y, 1.6 + p.rnd(), p.rnd() > 0.5 ? lighten(base, 0.2) : darken(base, 0.2));
      }
      p.dots(0x2f5a24, 10);
      break;
    }
    case 'wood': {
      p.noise(0.1);
      for (let y = 0; y < SIZE; y++) {
        const f = Math.sin(y * 1.7) * 0.08;
        for (let x = 0; x < SIZE; x++) p.shadeAt(x, y, f + (p.rnd() - 0.5) * 0.06);
      }
      p.dots(darken(base, 0.3), 6);
      break;
    }
    case 'skin': {
      // Skóra gracza: delikatne cieniowanie i rumieńce.
      p.noise(0.06);
      p.blob(4, 10, 2.4, darken(base, 0.08));
      p.blob(12, 10, 2.4, darken(base, 0.08));
      p.dots(lighten(base, 0.12), 8);
      break;
    }
    case 'hair': {
      p.noise(0.14);
      for (let i = 0; i < 18; i++) {
        const x = Math.floor(p.rnd() * SIZE);
        const y = Math.floor(p.rnd() * SIZE);
        p.line(x, y, 2 + Math.floor(p.rnd() * 3), p.rnd() > 0.5 ? lighten(base, 0.22) : darken(base, 0.2), true);
      }
      break;
    }
    case 'leather': {
      p.noise(0.12);
      p.dots(darken(base, 0.2), 9);
      for (let x = 0; x < SIZE; x++) p.set(x, SIZE - 1, darken(p.get(x, SIZE - 1), 0.3));
      break;
    }
    case 'grain':
    default: {
      p.noise(0.22);
      p.blob(5, 6, 3, lighten(base, 0.12));
      p.blob(11, 12, 2.4, darken(base, 0.14));
      p.dots(lighten(base, 0.18), 10);
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Palety z paczki tekstur
// ---------------------------------------------------------------------------

/**
 * 2.17: każdy mob dostaje paletę wyliczoną z prawdziwej tekstury encji z
 * paczki (`MOB_PALETTES`). Kolor części ciała przesuwamy na najbliższy kolor
 * z tej palety, ale tylko gdy jest naprawdę blisko – dzięki temu moby mają
 * dokładnie te odcienie co w Minecrafcie, a żaden drobny element (np. różowy
 * ryjek świni) nie zmienia się w losowy kolor.
 */
let activePalette: readonly number[] | null = null;

export function setMobPalette(type: string) {
  activePalette = MOB_PALETTES[type] ?? null;
}

export function activeMobPalette(): readonly number[] {
  return activePalette ?? [];
}

/** Najbliższy kolor palety (dist ≤ maxDistance) albo kolor wejściowy. */
export function snapToPalette(color: number, maxDistance = 64): number {
  if (!activePalette || activePalette.length === 0) return color;
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  let best = color;
  let bestD = maxDistance * maxDistance;
  for (const c of activePalette) {
    const dr = ((c >> 16) & 0xff) - r;
    const dg = ((c >> 8) & 0xff) - g;
    const db = (c & 0xff) - b;
    const d = dr * dr + dg * dg + db * db;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const textureCache = new Map<string, THREE.Texture>();
const lambertCache = new Map<string, THREE.MeshLambertMaterial>();

/**
 * Tekstura części ciała. Ten sam `kind` + kolor zawsze zwraca tę samą
 * instancję, więc setki mobów dzielą kilka tekstur.
 */
export function partTexture(kind: MobTexKind, base: number): THREE.Texture {
  const key = `${kind}:${base}`;
  const hit = textureCache.get(key);
  if (hit) return hit;
  const p = new Painter(base, hashString(key));
  paintKind(kind, p);
  const tex = new THREE.DataTexture(p.px, SIZE, SIZE, THREE.RGBAFormat);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  textureCache.set(key, tex);
  return tex;
}

/** Materiał moba: tekstura + światło scen (Lambert), kolor bazowy biały. */
export function mobMaterial(kind: MobTexKind, base: number): THREE.MeshLambertMaterial {
  const key = `${kind}:${base}`;
  const hit = lambertCache.get(key);
  if (hit) return hit;
  const mat = new THREE.MeshLambertMaterial({ map: partTexture(kind, base), color: 0xffffff });
  lambertCache.set(key, mat);
  return mat;
}

/**
 * Materiał awatara gracza. Awatary są nielitowane (`MeshBasicMaterial`),
 * więc tekstura daje im „pikselowy” wygląd bez wpływu świateł.
 */
export function avatarMaterial(kind: MobTexKind, base: number): THREE.MeshBasicMaterial {
  return new THREE.MeshBasicMaterial({ map: partTexture(kind, base), color: 0xffffff });
}

// ---------------------------------------------------------------------------
// Dobór tekstury po kolorze części
// ---------------------------------------------------------------------------

const KIND_BY_COLOR: Readonly<Record<number, MobTexKind>> = {
  0x6b4423: 'cow-hide',
  0x8a5a32: 'cow-hide',
  0xf2f2f2: 'cow-hide',
  0xd9a0a0: 'pig-hide',
  0xf0a0a0: 'pig-hide',
  0xe07f86: 'pig-hide',
  0xeeeeee: 'wool',
  0xd8c8b0: 'sheep-face',
  0xf4f4f4: 'feather',
  0xe8e8e8: 'feather',
  0xf0b429: 'beak',
  0x1d6b1d: 'creeper',
  0x165816: 'creeper',
  0x3aaa32: 'creeper',
  0x46c23c: 'creeper',
  0x3b3f8f: 'denim',
  0x3d3d46: 'denim',
  0x2aa3a3: 'cloth',
  0xf0e6d2: 'cloth',
  0x5d8a44: 'zombie-skin',
  0x2e1f16: 'chitin',
  0x3d2a1e: 'chitin',
  0x241a12: 'chitin',
  0xe6e2d4: 'bone',
  0xc9c4b2: 'bone',
  0xeee8dc: 'bone',
  0x7a5230: 'wood',
  0x7a8089: 'wolf-fur',
  0x5d626b: 'wolf-fur',
  0xd8dade: 'wolf-fur',
  0xa8785a: 'villager-skin',
  0x8a5f45: 'villager-skin',
  0xc9c9cd: 'iron',
  0x9d9da3: 'iron',
  0x4a7a3a: 'vine',
  0x111111: 'enderman',
  0x5ad65a: 'slime',
  0xf0f0f0: 'ghast',
  0x3a2a1a: 'hair',
};

/** Najlepsza tekstura dla danego koloru części (fallback: `grain`). */
export function kindForColor(color: number): MobTexKind {
  return KIND_BY_COLOR[color] ?? 'grain';
}

/** Tekstury używane przez awatary graczy. */
export const AVATAR_KINDS = {
  head: 'skin',
  hair: 'hair',
  shirt: 'cloth',
  sleeve: 'cloth',
  pants: 'denim',
  shoes: 'leather',
} as const satisfies Record<string, MobTexKind>;

/** Ile unikalnych tekstur powstało (diagnostyka i testy). */
export function textureCount(): number {
  return textureCache.size;
}

/** Czyszczenie cache – tylko testy (materiały i tekstury trzeba zwolnić ręcznie). */
export function clearTextureCache() {
  for (const t of textureCache.values()) t.dispose();
  for (const m of lambertCache.values()) m.dispose();
  textureCache.clear();
  lambertCache.clear();
}

/** Surowe piksele tekstury (testy: sprawdzamy, czy nie jest jednokolorowa). */
export function texturePixels(kind: MobTexKind, base: number): Uint8Array {
  const img = partTexture(kind, base).image as { data: Uint8Array };
  return img.data.slice();
}
