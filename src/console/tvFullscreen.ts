import { useSyncExternalStore } from 'react';
import { notify } from '../platform/notifications';
import { loadLanguage, t as translate } from '../platform/i18n';

/**
 * Pełny ekran telewizora na żądanie administratora (z jego pada).
 *
 * Przeglądarka wpuszcza do pełnego ekranu tylko z „aktywacji" samego użytkownika,
 * a pakiet z WebRTC nią nie jest — więc na żądanie z telefonu najpierw próbujemy,
 * a przy odmowie wchodzimy w stan `armed` i dokańczamy przy najbliższym naciśnięciu
 * klawisza lub kliknięciu na telewizorze. Bez tego pad nigdy by nie przejął ekranu.
 */
export type FullscreenMode = 'off' | 'pending' | 'on' | 'armed';
export type FullscreenEvent = 'toggle' | 'granted' | 'denied' | 'left' | 'gesture';

/** Czysta maszyna stanów — reszta pliku tylko przekłada zdarzenia DOM na te przejścia. */
export function nextFullscreenMode(mode: FullscreenMode, event: FullscreenEvent): FullscreenMode {
  switch (event) {
    case 'granted': return 'on';
    case 'denied': return mode === 'pending' || mode === 'off' ? 'armed' : mode;
    case 'left': return 'off';
    case 'gesture': return mode === 'armed' ? 'pending' : mode;
    case 'toggle': return mode === 'on' ? 'off' : 'pending';
  }
}

type WithWebkit = HTMLElement & { webkitRequestFullscreen?: () => Promise<void> | void };
type DocWithWebkit = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => Promise<void> | void };

let mode: FullscreenMode = 'off';
const listeners = new Set<() => void>();

const active = () => Boolean((document as DocWithWebkit).fullscreenElement || (document as DocWithWebkit).webkitFullscreenElement);

function setMode(next: FullscreenMode) {
  if (mode === next) return;
  mode = next;
  listeners.forEach(fn => fn());
}

async function enter() {
  const el = document.documentElement as WithWebkit;
  try {
    await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
  } catch { /* poniżej i tak pytamy o prawdziwy stan */ }
  setMode(active() ? 'on' : nextFullscreenMode(mode, 'denied'));
}

/** Żądanie z pada albo z przycisku na telewizorze. */
export function toggleTvFullscreen() {
  if (active()) {
    const doc = document as DocWithWebkit;
    setMode('off');
    void Promise.resolve(doc.exitFullscreen?.() ?? doc.webkitExitFullscreen?.()).catch(() => {});
    return;
  }
  const fromPad = !(navigator as { userActivation?: { isActive?: boolean } }).userActivation?.isActive;
  // Próbujemy zawsze: część przeglądarek (i telewizorów z wcześniejszym dotykiem na ekranie)
  // wpuszcza do pełnego ekranu także po żądaniu z sieci. Dopiero faktyczna odmowa
  // przeglądarki uzbraja ekran i mówi graczowi, czego brakuje.
  setMode(nextFullscreenMode(mode, 'toggle'));
  void enter().then(() => {
    if (mode === 'on' || !fromPad) return;
    notify(translate(loadLanguage(), 'fullscreen.armTitle'), translate(loadLanguage(), 'fullscreen.armDetail'), 'system');
  });
}

/** Wołane z handlerów klawiatury/pada na telewizorze: domyka `armed`. */
export function satisfyTvFullscreen() {
  if (mode !== 'armed') return false;
  setMode(nextFullscreenMode(mode, 'gesture'));
  void enter().then(() => { if (mode === 'on') notify(translate(loadLanguage(), 'fullscreen.armDone'), undefined, 'system'); });
  return true;
}

export const getTvFullscreenMode = () => mode;

if (typeof document !== 'undefined') {
  document.addEventListener('fullscreenchange', () => { setMode(active() ? 'on' : mode === 'armed' ? 'armed' : 'off'); });
  document.addEventListener('fullscreenerror', () => { setMode(nextFullscreenMode(mode, 'denied')); });
}

export function useTvFullscreen() {
  return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getTvFullscreenMode, getTvFullscreenMode);
}
