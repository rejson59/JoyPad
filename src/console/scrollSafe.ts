/**
 * Bezpieczne przewijanie elementów.
 *
 * `Element.scrollTo` i `Element.scrollIntoView` istnieją we wszystkich nowszych
 * przeglądarkach, ale nie w każdym środowisku, w którym JoyPad bywa osadzany
 * (podgląd w ramce, przeglądarki telewizorów, silniki testowe). Wyjątek z takiego
 * wywołania w efekcie Reacta gasi CAŁE drzewo interfejsu — użytkownik widzi wtedy
 * pusty, czarny ekran. Dlatego każde przewijanie przechodzi tędy: najpierw
 * bogatsze API, a gdy go nie ma — zwykłe przypisanie `scrollLeft`/`scrollTop`,
 * które działa nawet w najprostszych silnikach.
 */

interface ScrollTarget { el: HTMLElement; left?: number; top?: number; behavior?: ScrollBehavior }

/** Przewija element do podanej pozycji (oś pozioma i/lub pionowa). */
export function scrollToSafe({ el, left, top, behavior = 'instant' }: ScrollTarget) {
  if (typeof el.scrollTo === 'function') {
    el.scrollTo({ left, top, behavior });
    return;
  }
  if (left !== undefined) el.scrollLeft = left;
  if (top !== undefined) el.scrollTop = top;
}

/** Dociąga element do widoku, jeśli nie jest w całości widoczny. */
export function scrollIntoViewSafe(el: HTMLElement, behavior: ScrollBehavior = 'instant') {
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior });
  }
}
