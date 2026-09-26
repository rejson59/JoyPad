import { getPreferences } from '../console/preferences';
export type HapticStatus = 'ready' | 'needs-tap' | 'unsupported' | 'blocked';

let enabled = false;
let status: HapticStatus = 'needs-tap';
let lastPulseAt = 0;
let priorityUntil = 0;
let lastPriority = 0;

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
  if (!vibrate) { enabled = false; status = 'unsupported'; return status; }
  if (enabled) return 'ready';
  try {
    const accepted = vibrate(getPreferences().haptics === 'off' ? 0 : 8);
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

export function haptic(pattern: number | number[], priority = 0): boolean {
  const preference = getPreferences().haptics;
  if (preference === 'off') { vibrateApi()?.(0); return false; }
  if (!enabled) return false;
  const vibrate = vibrateApi();
  if (!vibrate) return false;
  // Nie zalewaj telefonu impulsami z joysticka ani pakietami FX z relayu.
  const now = Date.now();
  if (now < priorityUntil && priority < lastPriority) return false;
  if (now - lastPulseAt < 45 && priority <= lastPriority) return false;
  lastPulseAt = now;
  try {
    const raw = Array.isArray(pattern) ? pattern : [pattern];
    const adjusted = raw.map((n, i) => i % 2 === 0 && preference === 'subtle' ? Math.max(5, Math.round(n * .5)) : n);
    lastPriority = priority;
    priorityUntil = now + Math.min(600, adjusted.reduce((sum, n) => sum + n, 0));
    const accepted = vibrate(adjusted) !== false;
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
