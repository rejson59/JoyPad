/**
 * Nawigacja przestrzenna po interfejsie — to, co w Windows robi Tab, tylko że
 * joystickiem i D-padem. Czyste liczby, zero DOM — da się to przetestować
 * w node i przeliczyć na dowolnym sprzęcie.
 *
 * Zasada: jedziemy do elementu, który jest NAJBLIŻEJ po drodze w zadanym kierunku,
 * a odchylenie prostopadłe kosztuje więcej niż odległość w osi ruchu. Dzięki temu
 * z kafla gry idziemy do kafla obok, a nie do losowego przycisku w drugim rogu ekranu.
 */
export type NavDirection = 'left' | 'right' | 'up' | 'down';

export interface NavRect {
  /** Identyfikator elementu w liście celów (kolekcja buduje go z indexu). */
  index: number;
  left: number;
  top: number;
  width: number;
  height: number;
  /** Identyfikator kontenera: sąsiedzi z tej samej sekcji wygrywają z tymi „obok". */
  group: number;
}

export interface RepeatConfig {
  /** Pierwsze powtórzenie przy trzymaniu — krótsze kliknięcie to dokładnie jeden krok. */
  firstMs: number;
  /** Rytm kolejnych kroków. */
  stepMs: number;
  /** Po tym czasie przytrzymania nawigacja przyspiesza (długie listy, galerie). */
  rushMs: number;
  /** Strefa martwa analoga, liczone na długości wektora (0..1). */
  deadZone: number;
}

export const NAV_REPEAT: RepeatConfig = { firstMs: 420, stepMs: 130, rushMs: 2600, deadZone: .35 };
/** Tyle pikseli zachodzenia krawędzi wciąż znaczy „to jest przede mną". */
const EDGE_SLACK = 3;

export function overlap1d(start: number, size: number, otherStart: number, otherSize: number) {
  return Math.min(start + size, otherStart + otherSize) - Math.max(start, otherStart);
}

/** Kierunek z analoga. dead zone jest kołowy, więc przekątna nie jest „szybsza" od osi. */
export function stickDirection(x: number, y: number, deadZone = NAV_REPEAT.deadZone): NavDirection | null {
  const valueX = Number.isFinite(x) ? x : 0;
  const valueY = Number.isFinite(y) ? y : 0;
  if (Math.hypot(valueX, valueY) <= deadZone) return null;
  return Math.abs(valueX) >= Math.abs(valueY) ? (valueX > 0 ? 'right' : 'left') : (valueY > 0 ? 'down' : 'up');
}

/**
 * Czy ruszyć kolejny raz. `heldFor` — jak długo trzymamy ten sam kierunek,
 * `sinceLast` — ile minęło od ostatniego kroku.
 */
export function shouldStep(heldFor: number, sinceLast: number, config: RepeatConfig = NAV_REPEAT) {
  if (heldFor <= 0) return true;
  if (heldFor < config.firstMs) return false;
  const step = heldFor > config.rushMs ? config.stepMs * .62 : config.stepMs;
  return sinceLast >= step;
}

/**
 * Najlepszy następny cel ruchu albo null, gdy w tym kierunku nic nie ma
 * (wtedy wywołujący decyduje: zawijać, przewijać, czy nic nie robić).
 */
export function pickNext(from: NavRect, targets: readonly NavRect[], dir: NavDirection, crossWeight = 2.4): number | null {
  const horizontal = dir === 'left' || dir === 'right';
  const forward = dir === 'right' || dir === 'down' ? 1 : -1;
  const fromMain = (horizontal ? from.left + from.width / 2 : from.top + from.height / 2);
  const fromCross = (horizontal ? from.top + from.height / 2 : from.left + from.width / 2);
  const fromSpan = horizontal ? from.height : from.width;
  let best: { index: number; score: number } | null = null;

  for (const target of targets) {
    if (target.index === from.index) continue;
    const main = horizontal ? target.left + target.width / 2 : target.top + target.height / 2;
    const cross = horizontal ? target.top + target.height / 2 : target.left + target.width / 2;
    // Krawędź wiodąca: dla „w prawo" liczymy lewą krawędź celu względem prawej krawędzi źródła.
    const near = horizontal
      ? (forward > 0 ? target.left - (from.left + from.width) : from.left - (target.left + target.width))
      : (forward > 0 ? target.top - (from.top + from.height) : from.top - (target.top + target.height));
    const overlap = horizontal
      ? overlap1d(target.top, target.height, from.top, from.height)
      : overlap1d(target.left, target.width, from.left, from.width);
    let distance: number;
    if (near >= -EDGE_SLACK) distance = Math.max(0, near);
    // Element zachodzący na nasz wierszu (np. kafelek w przewijanym railu) — bierzemy środek.
    else if (overlap > fromSpan * .35 && forward * (main - fromMain) > 0) distance = Math.abs(main - fromMain);
    else continue;
    const offset = Math.abs(cross - fromCross);
    let score = distance + offset * crossWeight;
    // Ten sam wiersz/kolumna: ruch „wzdłuż" jest naturalny, więc tańszy.
    if (overlap >= fromSpan * .45) score *= .58;
    if (target.group >= 0 && target.group === from.group) score *= .88;
    if (!best || score < best.score - .5) best = { index: target.index, score };
  }
  return best ? best.index : null;
}

/** Czy cel w ogóle jest w kadrze — poza ekranem tylko wtedy, gdy trzeba go przewinąć. */
export function inViewport(rect: NavRect, viewport: { width: number; height: number }, margin = 12) {
  return rect.left >= -margin && rect.top >= -margin
    && rect.left + rect.width <= viewport.width + margin && rect.top + rect.height <= viewport.height + margin;
}
