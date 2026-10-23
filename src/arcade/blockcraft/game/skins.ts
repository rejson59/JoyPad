/**
 * 2.12: skórki graczy.
 *
 * Każda skórka to mała paleta kolorów dla awatara z bloków (głowa, włosy,
 * koszulka, rękawy, spodnie, buty i oczy). Zestaw jest celowo „minecraftowy”:
 * kilka klasycznych postaci plus kolory, które dobrze widać w terenie.
 *
 * Wybór zapisujemy w `localStorage`, a nie w ustawieniach graficznych, żeby
 * skórka była wspólna dla wszystkich światów i nie mieszała się z presetami
 * wydajności. W sesji sieciowej identyfikator skórki leci w wiadomości `pos`
 * (i w `hello`), więc pozostali widzą ten sam wygląd.
 */

export interface Skin {
  id: string;
  name: string;
  /** Krótki opis do podpisu pod kafelkiem. */
  desc: string;
  /** Głowa / twarz. */
  skin: number;
  /** Włosy albo hełm (cienka warstwa na głowie). */
  hair: number;
  /** Koszulka (tułów). */
  shirt: number;
  /** Rękawy (ręce) – zwykle odcień koszulki. */
  sleeve: number;
  /** Spodnie (nogi). */
  pants: number;
  /** Buty (dolna część nóg). */
  shoes: number;
  /** Kolor oczu; brak = oczy w kolorze włosów. */
  eye?: number;
  /** 2.19: smukły model (Alex, Efe) – ręce 3 piksele szerokości. */
  slim?: boolean;
}

export const SKINS: Skin[] = [
  {
    id: 'steve',
    name: 'Steve',
    desc: 'klasyk: turkusowa koszulka, niebieskie spodnie',
    skin: 0xc68642,
    hair: 0x3b2a1a,
    shirt: 0x00a8a8,
    sleeve: 0x009c9c,
    pants: 0x3b4bb8,
    shoes: 0x2b2b2b,
    eye: 0x2b2b2b,
  },
  {
    id: 'alex',
    name: 'Alex',
    desc: 'zielona koszulka, rude włosy, smukłe ramiona',
    slim: true,
    skin: 0xe0ac69,
    hair: 0xb5541c,
    shirt: 0x6f9b45,
    sleeve: 0x5c8438,
    pants: 0x6b4a2b,
    shoes: 0x3b2a1a,
    eye: 0x3a6f2a,
  },
  {
    id: 'ari',
    name: 'Ari',
    desc: 'pomarańczowa bluza i brązowe włosy',
    skin: 0xd9a066,
    hair: 0x5a3a1e,
    shirt: 0xe08a3c,
    sleeve: 0xc9782f,
    pants: 0x2f6d6d,
    shoes: 0x1f1f22,
    eye: 0x2b1a10,
  },
  {
    id: 'efe',
    name: 'Efe',
    desc: 'fioletowa peleryna, smukłe ramiona',
    slim: true,
    skin: 0xb07a4a,
    hair: 0x2b1d14,
    shirt: 0x7d4fa8,
    sleeve: 0x6b3f93,
    pants: 0x3a2a4a,
    shoes: 0x1c1620,
    eye: 0x2b1a10,
  },
  {
    id: 'kai',
    name: 'Kai',
    desc: 'czarna kurtka i złote spodnie',
    skin: 0xb98252,
    hair: 0x241a12,
    shirt: 0x22222a,
    sleeve: 0x1a1a20,
    pants: 0xc9a227,
    shoes: 0x3a2e10,
    eye: 0x1a1a1a,
  },
  {
    id: 'makena',
    name: 'Makena',
    desc: 'żółta bluza, ciemna skóra, różowa spódnica',
    skin: 0x6b4226,
    hair: 0x1d130c,
    shirt: 0xd8b13a,
    sleeve: 0xb8962c,
    pants: 0xc4657e,
    shoes: 0x5a3a2a,
    eye: 0x1a120c,
  },
  {
    id: 'noor',
    name: 'Noor',
    desc: 'czerwona kurtka i zielone spodnie',
    skin: 0x8a5a34,
    hair: 0x1a120c,
    shirt: 0xa8332c,
    sleeve: 0x8c2a24,
    pants: 0x3f6b3a,
    shoes: 0x2a1f16,
    eye: 0x1a120c,
  },
  {
    id: 'sunny',
    name: 'Sunny',
    desc: 'niebieskie ogrodniczki i jasna cera',
    skin: 0xe8b98a,
    hair: 0x5a3a22,
    shirt: 0x3a6fb0,
    sleeve: 0x2f5c96,
    pants: 0x2f5c96,
    shoes: 0x28324a,
    eye: 0x2b1a10,
  },
  {
    id: 'zuri',
    name: 'Zuri',
    desc: 'czerwona koszulka i beżowy fartuch',
    skin: 0x8a5a34,
    hair: 0x1d130c,
    shirt: 0xc23a3a,
    sleeve: 0xa62f2f,
    pants: 0xd9c39a,
    shoes: 0x8a6a45,
    eye: 0x1a120c,
  },
];

export const DEFAULT_SKIN_ID = 'steve';
export const SKIN_KEY = 'blockcraft-skin';

/** Skórka po identyfikatorze; nieznany/brak = domyślna (nigdy nie rzuca). */
export function skinById(id?: string | null): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}

export function loadSkinId(): string {
  try {
    const saved = localStorage.getItem(SKIN_KEY);
    return skinById(saved).id;
  } catch {
    return DEFAULT_SKIN_ID;
  }
}

export function saveSkinId(id: string): string {
  const clean = skinById(id).id;
  try {
    localStorage.setItem(SKIN_KEY, clean);
  } catch {
    /* prywatny tryb przeglądarki – skórka zostanie tylko do końca sesji */
  }
  return clean;
}

/** Kolejna skórka na liście (podgląd / losowanie). */
export function nextSkinId(current: string, step = 1): string {
  const i = Math.max(0, SKINS.findIndex((s) => s.id === current));
  return SKINS[(i + step + SKINS.length) % SKINS.length].id;
}

/**
 * Kolory zapasowe dla graczy ze starszych wersji, które nie wysyłają skórki
 * (starsza wersja gry). Odcień liczymy z `hue`, żeby awatar nadal był
 * rozpoznawalny w tłumie.
 */
export function fallbackSkin(hue: number): Skin {
  const h = ((hue % 360) + 360) % 360;
  const hsl = (l: number) => {
    // HSL → RGB bez zależności od Three.js (skórki są też używane w testach).
    const s = 0.55;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) [r, g, b] = [c, x, 0];
    else if (h < 120) [r, g, b] = [x, c, 0];
    else if (h < 180) [r, g, b] = [0, c, x];
    else if (h < 240) [r, g, b] = [0, x, c];
    else if (h < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const to = (v: number) => Math.round((v + m) * 255);
    return (to(r) << 16) | (to(g) << 8) | to(b);
  };
  return {
    id: `hue-${h}`,
    name: 'Gracz',
    desc: '',
    skin: 0xd9a066,
    hair: 0x3b2a1a,
    shirt: hsl(0.42),
    sleeve: hsl(0.36),
    pants: hsl(0.28),
    shoes: hsl(0.2),
    eye: 0x2b2b2b,
  };
}
