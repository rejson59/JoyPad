export const WHATS_NEW_VERSION = '1.7.0';
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
