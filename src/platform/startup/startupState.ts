import { STARTUP_VERSION } from './StartupScene';

const KEY = 'joypad.startup-version';

/** Pierwsza wizyta (albo nowa wersja poradnika) → pokaż pytanie o tutorial. */
export function shouldShowStartup(): boolean {
  try { return localStorage.getItem(KEY) !== String(STARTUP_VERSION); }
  catch { return false; }
}

export function markStartupSeen(): void {
  try { localStorage.setItem(KEY, String(STARTUP_VERSION)); } catch { /* prywatny tryb */ }
}
