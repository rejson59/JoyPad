export type HapticStatus = 'ready' | 'needs-tap' | 'unsupported' | 'blocked';

let enabled = false;
let status: HapticStatus = 'needs-tap';
let lastPulseAt = 0;

function vibrateApi(): ((pattern: number | number[]) => boolean) | null {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return null;
  return navigator.vibrate.bind(navigator);
}

/**
 * Vibration API nie otwiera klasycznego promptu permission. Wymaga natomiast
 * sticky user activation, dlatego pierwsze wywołanie robimy synchronicznie
 * w realnym tapnięciu (przycisk, joystick albo przycisk akcji).
 */
export function unlockHaptics(): HapticStatus {
  const vibrate = vibrateApi();
  if (!vibrate) { status = 'unsupported'; return status; }
  try {
    const accepted = vibrate(16);
    if (accepted !== false) {
      enabled = true;
      lastPulseAt = Date.now();
      status = 'ready';
      return status;
    }
  } catch { /* user activation or platform policy blocked it */ }
  enabled = false;
  status = 'blocked';
  return status;
}

export function haptic(pattern: number | number[]): boolean {
  if (!enabled) return false;
  const vibrate = vibrateApi();
  if (!vibrate) return false;
  // Nie zalewaj telefonu impulsami z joysticka ani pakietami FX z relayu.
  const now = Date.now();
  if (now - lastPulseAt < 34) return false;
  lastPulseAt = now;
  try {
    const accepted = vibrate(pattern) !== false;
    if (!accepted) { enabled = false; status = 'blocked'; }
    return accepted;
  } catch {
    enabled = false;
    status = 'blocked';
    return false;
  }
}

export function getHapticStatus(): HapticStatus {
  if (!vibrateApi()) return 'unsupported';
  return enabled ? 'ready' : status;
}
