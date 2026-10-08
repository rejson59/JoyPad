import { useCallback, useLayoutEffect, useRef, type RefObject } from 'react';
import { motionReduced } from './preferences';
import { windowFlip, type WindowOrigin } from './windowFlip';

/**
 * Płynne okienka w stylu „wyskakuję z tego, w co kliknąłeś".
 *
 * Zapamiętamy prostokąt elementu, który otworzył powierzchnię (klik, Enter z
 * klawiatury, `element.click()` wysłany przez pilota albo telefon), a potem
 * liczymy transformację FLIP do realnego kadru okienka. Świadomie bez View
 * Transitions API: rozwiązanie działa tak samo w Chromium, Firefoxie i Safari
 * oraz daje pełną kontrolę nad reduced-motion. Sama matematyka jest w windowFlip.ts.
 */
export type { WindowOrigin };

const TRIGGER = 'button,[role="switch"],[role="button"],a[href],[role="tab"],summary';
/* Na razie jedyna okienkowa powierzchnia systemu. Nowa = klasa tutaj + para
   selektorów `.lg-morph-in` / `.lg-morph-out` w liquid.css. */
const MORPHABLE = '.os-sheet';
/** Ile czasu kadr „przekaże" się kolejnemu otwarciu tego samego okna (StrictMode montuje je dwa razy). */
const ORIGIN_TTL_MS = 250;
let origin: WindowOrigin | null = null;
let originAt = 0;
let lastOrigin: WindowOrigin | null = null;
let installed = false;

function remember(target: EventTarget | null) {
  if (!(target instanceof Element)) return;
  const element = target.closest(TRIGGER) as HTMLElement | null;
  if (!element) return;
  const rect = element.getBoundingClientRect();
  // Zero-sizer (np. ukryty przycisk) nie jest sensownym punktem startowym.
  if (rect.width < 4 || rect.height < 4) return;
  lastOrigin = origin = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, w: rect.width, h: rect.height };
  originAt = Date.now();
}

/** Wywołać raz przy starcie aplikacji (telewizor i telefon). */
export function installWindowOriginTracker() {
  if (installed || typeof document === 'undefined') return;
  installed = true;
  // Faza przechwytująca: czytamy kadr ZANIM React zdąży przebudować drzewo.
  document.addEventListener('pointerdown', event => remember(event.target), true);
  // Pilot i telefon wołają element.click() — to też jest „kliknięty przycisk".
  document.addEventListener('click', event => remember(event.target), true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') remember(document.activeElement);
  }, true);
}

/**
 * Kadr elementu, z którego powinien wyrosnąć następny komponent. Kadr jest
 * odbierany, ale przez pół sekundy zostaje też jako „ostatni znany" — podwójny
 * montaż w StrictMode nie może sprawić, że deweloper zobaczy inną animację niż gracz.
 */
export function takeWindowOrigin(): WindowOrigin | null {
  const value = origin;
  origin = null;
  if (value) return value;
  return Date.now() - originAt < ORIGIN_TTL_MS ? lastOrigin : null;
}

/**
 * Ustawia zmienne --win-* i klasę animacji. Zwraca false, gdy nie ma czego
 * animować (brak kadru albo okienko i tak ma rozmiar przycisku) — wtedy gra
 * zwykłe wniknięcie z warstwy podstawowej.
 */
function startMorph(node: HTMLElement, className: string, from: WindowOrigin | null) {
  const flip = windowFlip(from, node.getBoundingClientRect());
  if (flip.skip) return false;
  const style = node.style;
  style.setProperty('--win-dx', `${flip.dx}px`);
  style.setProperty('--win-dy', `${flip.dy}px`);
  style.setProperty('--win-sx', String(flip.sx));
  style.setProperty('--win-sy', String(flip.sy));
  style.setProperty('--win-r0', `${flip.radius}px`);
  node.classList.remove('lg-morph-in', 'lg-morph-out', 'lg-morphed');
  node.classList.add(className);
  return true;
}

/**
 * Podpinasz ref do otwieranej powierzchni; hook sam zmierzy kadr po layoutcie i
 * odpali morfing z ostatnio klikniętego elementu. `collapse()` odwraca ten sam
 * ruch przy zamknięciu i woła `done()` po ostatniej klatce.
 */
export function useWindowMorph(ref: RefObject<HTMLElement | null>, opened = true) {
  const anchor = useRef<WindowOrigin | null>(null);
  const timers = useRef<number[]>([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };

  useLayoutEffect(() => {
    if (!opened) return;
    const node = ref.current;
    const morphable = !!node?.matches(MORPHABLE);
    // Kadr pobieramy zawsze, nawet gdy ruch jest wyłączony — inaczej zostałby
    // dla następnego okienka i wyrosłoby z nie swojego przycisku.
    if (morphable) anchor.current = takeWindowOrigin();
    if (!node || !morphable || motionReduced()) return;
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      if (!startMorph(node, 'lg-morph-in', anchor.current)) return;
      // Warstwa kompozytowa nie może wisieć na otwartym oknie przez cały seans.
      timers.current.push(window.setTimeout(() => node.classList.add('lg-morphed'), 480));
    };
    // Mikrozadanie = po wszystkich layout-effectach tego commitu, ale przed pierwszą
    // klatką. Dzięki temu <dialog> jest już otwarte i zmierzone, a pierwszy obraz
    // i tak widzimy w pozycji źródła — bez przeskoku.
    queueMicrotask(() => {
      if (cancelled) return;
      if (node.getBoundingClientRect().width) measure();
      else requestAnimationFrame(() => measure());
    });
    return () => { cancelled = true; clearTimers(); node.classList.remove('lg-morph-in', 'lg-morphed'); };
  }, [ref, opened]);

  const collapse = useCallback((done: () => void) => {
    const node = ref.current;
    // Genie wraca tam, skąd przyszedł: do przycisku, który otworzył okienko,
    // a nie do ostatniego przełącznika klikniętego w jego środku.
    const target = anchor.current;
    anchor.current = null;
    if (!node || motionReduced() || !node.matches(MORPHABLE) || !startMorph(node, 'lg-morph-out', target)) { done(); return; }
    let finished = false;
    const finish = (event?: AnimationEvent) => {
      if (finished || (event && event.target !== node)) return;
      finished = true;
      clearTimers();
      node.removeEventListener('animationend', finish);
      node.classList.remove('lg-morph-out');
      done();
    };
    node.addEventListener('animationend', finish);
    // Gdy animacja nie wystartuje (karta w tle) albo nie ma komu jej skończyć.
    timers.current.push(window.setTimeout(finish, 340));
  }, [ref]);

  return { collapse };
}
