import { overlap1d, pickNext, type NavDirection, type NavRect } from './spatialNav';
import { scrollIntoViewSafe, scrollToSafe } from './scrollSafe';

/**
 * Most między algorytmem przestrzennym a prawdziwym DOM. Celowo jeden plik i jedna
 * lista selektorów — dzięki temu „każdy klikalny element jest osiągalny padem" jest
 * faktem sprawdzalnym w jednym miejscu, a nie obietnicą w dwudziestu komponentach.
 */
export const NAVIGABLE_SELECTOR = [
  'a[href]', 'button:not(:disabled)', 'summary',
  'input:not([type=hidden]):not([disabled]):not([readonly])',
  'select:not(:disabled)', 'textarea:not(:disabled)',
  '[role="switch"]:not(:disabled)', '[role="tab"]:not(:disabled)', '[role="button"]:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/*
 * Powierzchnia, po której jeździmy. Kolejność nie jest przypadkowa: okienko w
 * warstwie górnej wygrywa z nakładką (lab), a nakładka z biblioteką — inaczej
 * pad chodziłby po ekranie przykrytym czymś innym.
 */
export function navScope(root: ParentNode = document): HTMLElement | null {
  const last = (list: NodeListOf<HTMLElement>) => list[list.length - 1] ?? null;
  const open = root.querySelectorAll<HTMLElement>('dialog[open]');
  const modal = last(open);
  if (modal?.hasAttribute('data-ui-scope')) return modal;
  return last(root.querySelectorAll<HTMLElement>('[data-ui-scope]')) ?? modal ?? root.querySelector<HTMLElement>('.os-library') ?? (root instanceof HTMLElement ? root : null);
}

export interface NavItem { el: HTMLElement; rect: NavRect }

function usable(el: HTMLElement) {
  if (el.getAttribute('aria-hidden') === 'true') return false;
  if (el.closest('[inert]')) return false;
  const style = getComputedStyle(el);
  if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) < .08) return false;
  if (style.pointerEvents === 'none') return false;
  const box = el.getBoundingClientRect();
  return box.width >= 8 && box.height >= 8;
}

/** Identyfikator sekcji: sąsiedztwo w tej samej grupie wygrywa z sąsiedztwem na ekranie. */
function groupOf(el: Element, ids: Map<Element, number>) {
  const container = el.closest('nav, header, footer, section, article, .os-session, .os-sheet-content, .room-controls, .cine-settings, .os-game-rail, .pad-system-shortcuts');
  if (!container) return -1;
  let id = ids.get(container);
  if (id === undefined) { id = ids.size; ids.set(container, id); }
  return id;
}

export function collectNavItems(scope: HTMLElement): NavItem[] {
  const ids = new Map<Element, number>();
  const items: NavItem[] = [];
  for (const el of scope.querySelectorAll<HTMLElement>(NAVIGABLE_SELECTOR)) {
    if (!usable(el)) continue;
    const box = el.getBoundingClientRect();
    items.push({
      el,
      rect: { index: items.length, left: box.left, top: box.top, width: box.width, height: box.height, group: groupOf(el, ids) },
    });
  }
  return items;
}

export function focusedIndex(items: NavItem[], active: Element | null) {
  if (!active) return -1;
  const exact = items.findIndex(item => item.el === active);
  if (exact >= 0) return exact;
  // Fokus bywa na dziecku przycisku (ikona) albo na pojemniku z `tabindex` — w obu
  // przypadkach wiadomo, gdzie jesteśmy, więc nie zaczynamy nawigacji od zera.
  const inside = items.findIndex(item => item.el.contains(active));
  if (inside >= 0) return inside;
  return items.findIndex(item => active.contains(item.el));
}

/** Element, który powinien przejąć fokus, gdy w danej powierzchni jeszcze nic nie jest wybrane. */
export function entryTarget(scope: HTMLElement, items: NavItem[], prefer?: string | null) {
  if (prefer) {
    const wanted = scope.querySelector<HTMLElement>(prefer);
    if (wanted && items.some(item => item.el === wanted)) return items.find(item => item.el === wanted)!;
  }
  const rect = { index: -1, left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0, group: -1 };
  let best: NavItem | null = null;
  let bestScore = Infinity;
  for (const item of items) {
    const dx = item.rect.left + item.rect.width / 2 - rect.left;
    const dy = item.rect.top + item.rect.height / 2 - rect.top;
    const score = Math.hypot(dx, dy);
    if (score < bestScore) { bestScore = score; best = item; }
  }
  return best;
}

export function moveTo(items: NavItem[], from: NavItem, dir: NavDirection) {
  const next = pickNext(from.rect, items.map(item => item.rect), dir);
  if (next === null) return null;
  return items[next] ?? null;
}

/** Czy cel trzeba dowieźć do kadra (element w przewijanym railu albo pod linią wzroku). */
export function needsScroll(item: NavItem, dir: NavDirection) {
  const { left, top, width, height } = item.rect;
  const vw = innerWidth, vh = innerHeight;
  if (dir === 'right') return left + width > vw - 8;
  if (dir === 'down') return top + height > vh - 8;
  if (dir === 'left') return left < 8;
  return top < 8;
}

export function reveal(item: NavItem, behavior: ScrollBehavior) {
  const box = item.rect;
  const parent = item.el.closest('.os-game-rail, [data-ui-scroll], .os-sheet-content, .moments-gallery-grid, main');
  if (parent instanceof HTMLElement) {
    const pb = parent.getBoundingClientRect();
    if (box.left < pb.left || box.left + box.width > pb.left + pb.width) scrollToSafe({ el: parent, left: parent.scrollLeft + (box.left - pb.left) - (pb.width - box.width) / 2, behavior });
    if (box.top < pb.top || box.top + box.height > pb.top + pb.height) scrollToSafe({ el: parent, top: parent.scrollTop + (box.top - pb.top) - (pb.height - box.height) / 2, behavior });
  }
  if (needsScroll(item, 'down') || needsScroll(item, 'up') || needsScroll(item, 'left') || needsScroll(item, 'right')) {
    scrollIntoViewSafe(item.el, behavior);
  }
}

/** Suwaki i listy: strzałki mają zmieniać wartość, a nie uciekać z pola. */
export type UiAdjustable = 'range' | 'select' | 'text' | 'stepper' | null;

export function adjustable(el: Element | null): UiAdjustable {
  if (!(el instanceof HTMLElement)) return null;
  // Stepper opcji gry (`data-ui-stepper`): element, który nie jest `<input>`, ale chce
  // być regulowany strzałkami. Bez tego każda zmiana wartości kosztowałaby trzy ruchy
  // (do strzałki, Enter, z powrotem) zamiast jednego.
  if ('uiStepper' in el.dataset) return 'stepper';
  if (el instanceof HTMLInputElement && (el.type === 'range' || el.type === 'number')) return 'range';
  if (el instanceof HTMLSelectElement) return 'select';
  if (el instanceof HTMLInputElement && (el.type === 'text' || el.type === 'search')) return 'text';
  if (el instanceof HTMLTextAreaElement) return 'text';
  return null;
}

export function stepRange(el: HTMLInputElement, delta: number) {
  const step = Number(el.step) || 1;
  const min = Number.isFinite(Number(el.min)) ? Number(el.min) : -Infinity;
  const max = Number.isFinite(Number(el.max)) ? Number(el.max) : Infinity;
  const next = Math.min(max, Math.max(min, Number(el.value || 0) + step * delta));
  if (next === Number(el.value)) return false;
  el.value = String(next);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/**
 * Krok na stepperze: widok nie zna się na stanie Reacta, więc prosimy o niego zdarzeniem.
 * Komponent nasłuchuje `ui-step` i przesuwa własną listę wartości.
 */
export function stepStepper(el: HTMLElement, delta: number) {
  el.dispatchEvent(new CustomEvent('ui-step', { detail: { delta } }));
  return true;
}

export function stepSelect(el: HTMLSelectElement, delta: number) {
  if (!el.options.length) return false;
  const next = (el.selectedIndex + delta + el.options.length) % el.options.length;
  if (next === el.selectedIndex) return false;
  el.selectedIndex = next;
  el.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
}

/** Klawisze sterujące nie mogą trafić do elementu, który właśnie obsłużył ruch. */
export function isTypingTarget(el: Element | null) {
  return el instanceof HTMLElement && (adjustable(el) === 'text' || el.isContentEditable);
}

export const boxOverlap = overlap1d;

/** Fokus w pierwszej sensowne miejsce powierzchni — używane przy otwarciu okienka. */
export function focusUiScope(scope?: HTMLElement | null) {
  const root = scope ?? navScope();
  if (!root) return false;
  const items = collectNavItems(root);
  const entry = entryTarget(root, items, root.dataset.uiFocus);
  if (!entry) return false;
  entry.el.focus({ preventScroll: true });
  return true;
}
