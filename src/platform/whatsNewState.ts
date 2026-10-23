/**
 * Jedno źródło prawdy o numerze wydania.
 *
 * Numer pojawiał się w czterech miejscach naraz (stopka biblioteki, „Co nowego?",
 * napis końcowy filmu, `package.json`) i rozjeżdżał się przy każdej aktualizacji —
 * teraz wszystkie czytają tę stałą, więc bump wersji to jedna linia.
 */
export const WHATS_NEW_VERSION = '2.1.0';
/** Krótka forma do grafik i napisów (`1.9`). */
export const APP_VERSION_SHORT = WHATS_NEW_VERSION.split('.').slice(0, 2).join('.');
const STORAGE_KEY = 'joypad.whats-new-version';

type SeenVersionStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): SeenVersionStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; }
  catch { return undefined; }
}

export function shouldShowWhatsNew(storage: SeenVersionStorage | undefined = browserStorage()): boolean {
  if (!storage) return true;
  try { return storage.getItem(STORAGE_KEY) !== WHATS_NEW_VERSION; }
  catch { return true; }
}

export function markWhatsNewSeen(storage: SeenVersionStorage | undefined = browserStorage()): void {
  try { storage?.setItem(STORAGE_KEY, WHATS_NEW_VERSION); }
  catch { /* The announcement can still be dismissed when storage is unavailable. */ }
}
