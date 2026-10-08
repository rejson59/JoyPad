import { useSyncExternalStore } from 'react';

/* --- Czy na tym urządzeniu działa silnik sterowania interfejsem? ------------
   Telefon (PadApp) renderuje te same komponenty co telewizor, ale silnika nie
   montuje — a nie powinien przez to wciągać `padHost` do swojej paczki.
   Stąd licznik mieszka w najlżejszym module, jaki oba końce i tak znają. */
let engineMounts = 0;
const engineListeners = new Set<() => void>();
export const isUiEngineActive = () => engineMounts > 0;
export function noteUiEngineMount() {
  const before = engineMounts > 0;
  engineMounts++;
  if (!before) engineListeners.forEach(fn => fn());
  return () => {
    const was = engineMounts > 0;
    engineMounts = Math.max(0, engineMounts - 1);
    if (was && engineMounts === 0) engineListeners.forEach(fn => fn());
  };
}
/** Podpis pod „czy ten ekran w ogóle obsługuje pada" — pasek hintów nie może czekać na przypadkowy re-render. */
export function useUiEngineActive() {
  /* Trzeci argument (migawka dla renderu bez DOM-u) jest wymagany, gdy komponent trafia
     do renderu serwerowego albo do selftestu renderującego do statycznego HTML-a. */
  return useSyncExternalStore(fn => { engineListeners.add(fn); return () => { engineListeners.delete(fn); }; }, isUiEngineActive, isUiEngineActive);
}

/**
 * Kontekst skrótów pada. Każda powierzchnia (biblioteka, okienko, centrum pokoju)
 * mówi, co na niej znaczą przyciski X i Y — a pasek podpowiedzi na dole ekranu
 * pokazuje dokładnie to, więc gracz nie musi zgadywać.
 */
export interface UiShortcut { label: string; run: () => void; disabled?: boolean }
export interface UiContextState { x: UiShortcut | null; y: UiShortcut | null; source: string }

interface Entry { source: string; x: UiShortcut | null; y: UiShortcut | null }

const stack: Entry[] = [];
const listeners = new Set<() => void>();
let snapshot: UiContextState = { x: null, y: null, source: '' };

function publish() {
  const top = stack[stack.length - 1];
  snapshot = top ? { x: top.x, y: top.y, source: top.source } : { x: null, y: null, source: '' };
  listeners.forEach(fn => fn());
}

/** Zwraca funkcję czyszczącą — użyć w `useEffect`, żeby kontekst zniknął razem z powierzchnią. */
export function pushUiContext(entry: Entry) {
  const at = stack.findIndex(item => item.source === entry.source);
  // Ta sama powierzchnia co wcześniej = podmiana w miejscu (kolejność to kolejność
  // okienek). Nowa = na wierzch. Inaczej re-render biblioteki pod otwartym oknem
  // ukradłby skróty temu oknu.
  if (at >= 0) stack[at] = entry;
  else stack.push(entry);
  publish();
  return () => {
    // Po źródle, nie po obiekcie: wpis jest podmieniany przy każdym re-renderze.
    const index = stack.findIndex(item => item.source === entry.source);
    if (index >= 0) stack.splice(index, 1);
    publish();
  };
}

/** Skrót odpala ten kontekst, który jest na wierzchu; `false` = brak obsługi (pad nic nie wcisnął). */
export function runUiShortcut(key: 'x' | 'y') {
  const shortcut = snapshot[key];
  if (!shortcut || shortcut.disabled) return false;
  shortcut.run();
  return true;
}

export function getUiContext() { return snapshot; }

export function useUiContext() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getUiContext, getUiContext);
}
