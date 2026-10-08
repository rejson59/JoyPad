import { useSyncExternalStore } from 'react';
import { FILM_VERSION } from './script';

/**
 * Pamięć poradnika: czy pytanie „pierwsze wejście" zostało już zadane, co
 * odpowiedziano i ile razy film obejrzano. Trzymane lokalnie (localStorage),
 * bo JoyPad nie ma kont ani serwera aplikacji.
 */
export interface CinemaPrefs {
  /** Pytanie o poradnik ma sens tylko raz — potem wraca wyłącznie z ustawień. */
  answered: boolean;
  /** Ostatnia odpowiedź: „nie" pokazuje jeszcze ostrzeżenie. */
  declined: boolean;
  /** Prośba o pytanie przy każdym starcie (przełącznik w ustawieniach). */
  askOnStart: boolean;
  /** Wersja skryptu, którą widziano — po dużej zmianie filmu pytamy ponownie. */
  version: number;
  /** Licznik obejrzeń: pierwsze przejście ma inne napisy końcowe niż powtórka. */
  plays: number;
}

const STORAGE_KEY = 'joypad.cinema';

export const defaultCinemaPrefs: CinemaPrefs = { answered: false, declined: false, askOnStart: true, version: 0, plays: 0 };

export function sanitizeCinemaPrefs(raw: Partial<CinemaPrefs> | null | undefined): CinemaPrefs {
  const input = raw ?? {};
  return {
    answered: input.answered === true,
    declined: input.declined === true,
    askOnStart: input.askOnStart !== false,
    version: typeof input.version === 'number' && Number.isFinite(input.version) ? Math.max(0, Math.min(999, Math.round(input.version))) : 0,
    plays: typeof input.plays === 'number' && Number.isFinite(input.plays) ? Math.max(0, Math.min(9999, Math.round(input.plays))) : 0,
  };
}

let prefs = defaultCinemaPrefs;
if (typeof localStorage !== 'undefined') {
  try { prefs = sanitizeCinemaPrefs(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { prefs = { ...defaultCinemaPrefs }; }
}

const prefsListeners = new Set<() => void>();
export const getCinemaPrefs = () => prefs;

export function setCinemaPrefs(patch: Partial<CinemaPrefs>) {
  prefs = sanitizeCinemaPrefs({ ...prefs, ...patch });
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* tryb prywatny */ }
  prefsListeners.forEach(listener => listener());
}

export function useCinemaPrefs() {
  return useSyncExternalStore((listener) => { prefsListeners.add(listener); return () => { prefsListeners.delete(listener); }; }, getCinemaPrefs, getCinemaPrefs);
}

/**
 * Czy pokazać pytanie na starcie. Pierwsze wejście zawsze; później tylko na
 * wyraźną prośbę (ustawienia → „Pytaj przy starcie") albo po nowej wersji filmu,
 * jeśli ktoś zostawił pytanie włączone.
 */
export function shouldAskOnStart(current: CinemaPrefs = prefs, version = FILM_VERSION): boolean {
  if (!current.answered) return true;
  if (current.askOnStart) return true;
  return current.version < version && current.version > 0 && current.askOnStart;
}

export function answerWelcome(accepted: boolean) {
  setCinemaPrefs({ answered: true, declined: !accepted, askOnStart: false, version: FILM_VERSION });
}

export function markWatched() {
  setCinemaPrefs({ version: FILM_VERSION, plays: prefs.plays + 1 });
}

// ---------------------------------------------------------------------------
// Otwarty poradnik: stan współdzielony między ustawieniami i aplikacją
// ---------------------------------------------------------------------------

export type CinemaMode = 'welcome' | 'manual';
export interface CinemaRequest { open: boolean; mode: CinemaMode; nonce: number }

let request: CinemaRequest = { open: false, mode: 'manual', nonce: 0 };
const requestListeners = new Set<() => void>();
const emit = () => requestListeners.forEach(listener => listener());

export const getCinemaRequest = () => request;
export const useCinemaRequest = () => useSyncExternalStore((listener) => { requestListeners.add(listener); return () => { requestListeners.delete(listener); }; }, getCinemaRequest, getCinemaRequest);

/** Otwiera film: `welcome` zaraz po pytaniu, `manual` z ustawień albo z podpowiedzi. */
export function openCinema(mode: CinemaMode = 'manual') {
  request = { open: true, mode, nonce: request.nonce + 1 };
  emit();
}

export function closeCinema() {
  if (!request.open) return;
  request = { ...request, open: false };
  emit();
}
