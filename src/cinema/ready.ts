/**
 * Bramka gotowości scen filmu (runda 16).
 *
 * Problem zgłoszony przez użytkownika: „czasami nie wszystko się poprawnie ładuje
 * i wyświetla". Przyczyna była podwójna:
 *
 * 1. Zegar filmu idzie czasem ściennym, więc scena pokazująca nagranie gry (3 panele
 *    Full HD) startowała, zanim klipy zdążyły oddać pierwszą klatkę — widz dostawał
 *    plakat albo czarny prostokąt i scena „przelatywała".
 * 2. Serwer podglądu wysyłał `no-store`, więc każda scena pobierała swoje MP4 od nowa.
 *
 * Ta bramka rozwiązuje (1): gdy wchodzimy w scenę z nagraniami, zegar zatrzymuje się
 * na chwilę (maks. `PANE_HOLD_MS`), aż pierwszy klip zgłosi `loadeddata`. Jeśli sieć
 * zawiedzie, po tym czasie scena rusza mimo wszystko — film nigdy nie może utknąć.
 *
 * Kontrakt jest celowo malutki i bezstanowy: panele wysyłają zdarzenie, film je czyta.
 * Dzięki temu działa to samo w przeglądarce i w harnessach jsdom (tam zdarzenie
 * przychodzi z atrapy albo nie przychodzi wcale — deadline i tak puści zegar dalej).
 */

/** Zdarzenie wysyłane przez panel, gdy ma już pierwszą klatkę klipu. */
export const PANE_READY_EVENT = 'joypad-film-pane-ready';

/**
 * Ile milisekund zegar filmu czeka na pierwszą klatkę nagrań w nowej scenie.
 * 1,6 s to kompromis: w typowej sieci wystarcza na `loadeddata` z pamięci podręcznej,
 * a gdy klipu nie ma — widz traci mniej niż dwie sekundy, nie całą scenę.
 */
export const PANE_HOLD_MS = 1600;

/**
 * Po ilu milisekundach od wejścia w scenę wolno pobierać klip NASTĘPNEJ sceny.
 * Pół sekundy wystarcza, żeby klip bieżącej sceny ruszył pierwszy i nie dzielił pasma.
 */
export const PANE_PREFETCH_AFTER_MS = 500;

/** Znacznik zdarzenia: nazwa sceny, w której panel się wczytał. */
export function announcePaneReady(sceneId: string): void {
  if (typeof window === 'undefined' || !sceneId) return;
  try {
    window.dispatchEvent(new CustomEvent(PANE_READY_EVENT, { detail: sceneId }));
  } catch { /* starsza przeglądarka bez CustomEvent — bramka zda się na deadline */ }
}

/**
 * Czy scena pokazuje nagrania gier. Sprawdzamy `videos` w skrypcie, a nie w DOM,
 * bo decyzję o czekaniu trzeba podjąć zanim panele się zamontują.
 */
export function sceneNeedsClips(scene: { videos?: string[] } | undefined): boolean {
  return Boolean(scene?.videos && scene.videos.length > 0);
}
