/**
 * Profile ekranu JoyPada (runda 16).
 *
 * Użytkownik zgłosił dwie rzeczy naraz: „na TV nie będę scrollował strony” oraz
 * prośbę o osobny wygląd dla telewizora, komputera i tabletu (z myślą, że tablet
 * może grać jak duży ekran). Ten moduł odpowiada na pytanie **jaki to ekran**,
 * a warstwy CSS robią z tego wygląd (`html[data-profile="tv|desktop|tablet|handheld"]`).
 *
 * Reguły są czyste (żadnego DOM-u w środku), więc `selftest:console` sprawdza je
 * tabelą przypadków — telewizory naprawdę mają dziwaczne sygnały: kursor „brak”,
 * `hover: none`, brak dotyku, a czasem pełny `pointer: fine` od pilota.
 */
export type ViewportProfile = 'tv' | 'desktop' | 'tablet' | 'handheld';

export interface ViewportSignals {
  /** Szerokość okna w pikselach CSS. */
  width: number;
  /** Wysokość okna w pikselach CSS. */
  height: number;
  /** `matchMedia('(pointer: coarse)')` — dotyk jako główny wskaźnik. */
  coarsePointer: boolean;
  /** `matchMedia('(hover: none)')` — urządzenie nie ma kursora unoszącego się nad treścią. */
  noHover: boolean;
  /** `navigator.maxTouchPoints` — 0 na typowym TV/PC z myszą. */
  touchPoints: number;
  userAgent?: string;
  /** `navigator.deviceMemory` (GB) — bywa dostępne; 0/undefined = nie wiemy. */
  deviceMemory?: number;
}

/** Marki i systemy telewizorów, które da się rozpoznać po UA. */
const TV_UA = /smart-?tv|smarttv|tizen|web0s|webos|netcast|hbbtv|bravia|viera|aquos|googletv|androidtv|android tv|aft[bmts]|firetv|fire tv|crkey|chromecast|appletv|apple tv|roku|philipstv|hisense|opera tv|vizio|dtv|inettv|pov_?tv/i;

/**
 * Kolejność ma znaczenie: najpierw telewizor (bo TV potrafi raportować dotyk panelu),
 * potem tablet, a komputer jest tym, co zostaje.
 */
export function pickProfile(signals: ViewportSignals): ViewportProfile {
  const { width, height, coarsePointer, noHover, touchPoints, userAgent = '' } = signals;
  const landscape = width >= height;
  const shortSide = Math.min(width, height);

  // 1. Telewizor: albo rozpoznana marka/system, albo ekran-duży bez kursora i bez dotyku
  //    (typowy Smart TV z pilotem). Duży monitor z myszą tu NIE wpada — ma `noHover: false`.
  if (TV_UA.test(userAgent)) return 'tv';
  if (noHover && !coarsePointer && touchPoints === 0 && landscape && shortSide >= 600) return 'tv';

  // 2. Tablet: dotyk i naprawdę duży ekran (iPad, Galaxy Tab, Surface w trybie tabletu).
  if (coarsePointer && shortSide >= 600) return 'tablet';

  // 3. Reszta: komputer, chyba że to mały ekran dotykowy (telefon).
  if (coarsePointer && shortSide < 600) return 'handheld';
  if (width < 720 && touchPoints > 0) return 'handheld';
  return 'desktop';
}

/** Sygnały z prawdziwego okna. Wszystko w `try`, bo starsze TV potrafią rzucać na `matchMedia`. */
export function readViewportSignals(): ViewportSignals {
  const safeMatch = (query: string) => { try { return window.matchMedia(query).matches } catch { return false } };
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  return {
    width: window.innerWidth || 1024,
    height: window.innerHeight || 768,
    coarsePointer: safeMatch('(pointer: coarse)'),
    noHover: safeMatch('(hover: none)'),
    touchPoints: nav?.maxTouchPoints ?? 0,
    userAgent: nav?.userAgent ?? '',
    deviceMemory: (nav as { deviceMemory?: number } | undefined)?.deviceMemory,
  };
}

/**
 * Czy ekran ma udawać „duży”: wtedy biblioteka gra jak na telewizorze, a tablet
 * dostaje wyłącznie większe cele dotyku i podpowiedź o obrocie w pionie.
 */
export function isBigScreen(profile: ViewportProfile): boolean {
  return profile === 'tv' || profile === 'desktop' || profile === 'tablet';
}

/**
 * Wymuszenie profilu z adresu: `/?profil=tv`, `/?profil=tablet`, `/?profil=auto`.
 *
 * Po co: nie każdy ma pod ręką telewizor, a układ dla TV trzeba jakoś obejrzeć.
 * Wybór pamiętamy w `sessionStorage`, żeby przetrwał przejście do gry i z powrotem;
 * `auto` (albo brak parametru) czyści wymuszenie i wraca do prawdziwego wykrywania.
 */
export const PROFILE_PARAM = 'profil';

export function readProfileOverride(search: string): ViewportProfile | null | undefined {
  let value: string | null;
  try {
    const params = new URLSearchParams(search);
    value = params.get(PROFILE_PARAM) ?? params.get('profile');
  } catch { return undefined }
  if (value === null) return undefined;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'auto' || normalized === '') return null;
  return normalized === 'tv' || normalized === 'desktop' || normalized === 'tablet' || normalized === 'handheld'
    ? normalized
    : undefined;
}

/** Profil zapisany na `<html data-profile>` — czytają go wszystkie reguły CSS. */
export function applyProfile(profile: ViewportProfile, root: HTMLElement = document.documentElement): ViewportProfile {
  if (root.dataset.profile !== profile) root.dataset.profile = profile;
  return profile;
}

/**
 * Wpisuje profil do DOM i pilnuje zmian (obrót tabletu, przełączenie okna).
 * Zwraca funkcję sprzątającą — wywołanie jej jest ważne w testach dymnych,
 * bo nasłuch na `resize` trzymałby cały dokument przy życiu.
 */
export function installViewportProfile(target: Window = window): () => void {
  const doc = target.document;
  const storage = (() => { try { return target.sessionStorage } catch { return null } })();
  const fromUrl = readProfileOverride(target.location?.search ?? '');
  if (fromUrl !== undefined) {
    try {
      if (fromUrl === null) storage?.removeItem('joypad.profile');
      else storage?.setItem('joypad.profile', fromUrl);
    } catch { /* prywatny tryb */ }
  }
  let forced = fromUrl;
  if (forced === undefined) { try { forced = (storage?.getItem('joypad.profile') as ViewportProfile | null) ?? undefined } catch { forced = undefined } }
  const update = () => {
    const profile = forced ?? pickProfile(readViewportSignals());
    applyProfile(profile, doc.documentElement);
    if (forced) doc.documentElement.dataset.profileForced = '1';
    else delete doc.documentElement.dataset.profileForced;
  };
  update();
  target.addEventListener('resize', update);
  target.addEventListener('orientationchange', update);
  return () => {
    target.removeEventListener('resize', update);
    target.removeEventListener('orientationchange', update);
  };
}
