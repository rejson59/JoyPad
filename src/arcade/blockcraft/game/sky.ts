/**
 * BlockCraft 2.8.2 „Drzewa i światło” – wygląd nieba w zależności od pogody.
 *
 * Wcześniej chmury były jedną białą warstwą: podczas deszczu jedynie lekko
 * ciemniały, a nocą robiły się szare. Do tego zmiana pogody następowała
 * natychmiast („przeskok”). Ten moduł opisuje wygląd chmur jako czystą
 * funkcję pogody, pory dnia i płynnego przejścia (`stormBlend`), więc można go
 * testować bez WebGL.
 */

export type Weather = 'clear' | 'rain';

export interface CloudLook {
  /** Kolor warstwy podstawowej (0–1). */
  color: [number, number, number];
  /** Krycie warstwy podstawowej. */
  opacity: number;
  /** Kolor gęstej warstwy burzowej. */
  stormColor: [number, number, number];
  /** Krycie warstwy burzowej (0 = deszcz dopiero nadchodzi). */
  stormOpacity: number;
  /** Wysokość warstwy podstawowej (jednostki świata). */
  altitude: number;
  /** Wysokość warstwy burzowej – niżej, więc zasłania horyzont. */
  stormAltitude: number;
  /** Mnożnik prędkości przewijania tekstury (deszcz gna chmury). */
  drift: number;
}

type RGB = [number, number, number];

const DAY_CLEAR: RGB = [1, 1, 1];
const NIGHT_CLEAR: RGB = [0.24, 0.28, 0.4];
const DAY_RAIN: RGB = [0.62, 0.66, 0.75];
const NIGHT_RAIN: RGB = [0.15, 0.17, 0.24];
const STORM_DAY: RGB = [0.34, 0.37, 0.44];
const STORM_NIGHT: RGB = [0.08, 0.09, 0.13];

const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

/**
 * @param weather    aktualna pogoda
 * @param daylight   0 (noc) – 1 (południe)
 * @param stormBlend 0 – 1, płynne nasilanie się deszczu (chmury „gęstnieją”)
 */
export function cloudLook(weather: Weather, daylight: number, stormBlend: number): CloudLook {
  const day = clamp01(daylight);
  const storm = clamp01(weather === 'rain' ? stormBlend : stormBlend * 0.35);
  const clear = mix(NIGHT_CLEAR, DAY_CLEAR, day);
  const rain = mix(NIGHT_RAIN, DAY_RAIN, day);
  const stormCol = mix(STORM_NIGHT, STORM_DAY, day);
  // Podstawowa warstwa: przy deszczu ciemnieje i zwiększa krycie.
  const base = mix(clear, rain, storm);
  const stormPlane = mix(rain, stormCol, storm);
  return {
    color: [base[0], base[1], base[2]],
    opacity: 0.8 + storm * 0.15,
    stormColor: [stormPlane[0], stormPlane[1], stormPlane[2]],
    // Warstwa burzowa pojawia się dopiero, gdy deszcz naprawdę się rozkręci.
    stormOpacity: storm * 0.85,
    // 2.8.2: warstwy wyżej i bliżej siebie – chmury są większe i spokojniejsze.
    altitude: 150,
    stormAltitude: 126 + 4 * day,
    // Wiatr: deszcz przyspiesza chmury tylko o kilkanaście procent. Wcześniej
    // mnożnik 2,4× w połączeniu z dużą prędkością bazową dawał „przewijaną
    // tapetę” zamiast pogody.
    drift: 1 + storm * 0.28,
  };
}

/** Kolor mgły podczas deszczu – nieco chłodniejszy niż samo niebo. */
export function rainFogMix(daylight: number, stormBlend: number): number {
  const day = clamp01(daylight);
  return (0.35 + 0.25 * (1 - day)) * clamp01(stormBlend);
}
