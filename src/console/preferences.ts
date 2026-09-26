import { useSyncExternalStore } from 'react';

export interface ConsolePreferences {
  deviceProfile: 'auto' | 'android' | 'ios';
  deviceChosen: boolean;
  previews: boolean;
  sound: boolean;
  haptics: 'off' | 'subtle' | 'full';
  motion: 'system' | 'reduced';
  hand: 'right' | 'left';
  controlSize: number;
  controlHeight: number;
}
const defaults: ConsolePreferences = { deviceProfile: 'auto', deviceChosen: false, previews: true, sound: true, haptics: 'subtle', motion: 'system', hand: 'right', controlSize: 1, controlHeight: 0 };
export function sanitizePreferences(raw: Partial<ConsolePreferences>): ConsolePreferences {
  return {
    deviceProfile: raw.deviceProfile === 'ios' || raw.deviceProfile === 'android' ? raw.deviceProfile : 'auto',
    deviceChosen: raw.deviceChosen === true,
    previews: typeof raw.previews === 'boolean' ? raw.previews : true,
    sound: typeof raw.sound === 'boolean' ? raw.sound : defaults.sound,
    haptics: raw.haptics === 'off' || raw.haptics === 'full' ? raw.haptics : 'subtle',
    motion: raw.motion === 'reduced' ? 'reduced' : 'system',
    hand: raw.hand === 'left' ? 'left' : 'right',
    controlSize: typeof raw.controlSize === 'number' && Number.isFinite(raw.controlSize) ? Math.max(.8, Math.min(1.2, raw.controlSize)) : 1,
    controlHeight: typeof raw.controlHeight === 'number' && Number.isFinite(raw.controlHeight) ? Math.max(0, Math.min(64, raw.controlHeight)) : 0,
  };
}
function load() {
  try { return sanitizePreferences(JSON.parse(localStorage.getItem('joypad.console') || '{}') ?? {}); } catch { return defaults; }
}
let preferences = load();
const listeners = new Set<() => void>();
export const getPreferences = () => preferences;
export function setPreferences(patch: Partial<ConsolePreferences>) {
  preferences = sanitizePreferences({ ...preferences, ...patch });
  try { localStorage.setItem('joypad.console', JSON.stringify(preferences)); } catch { /* private browsing */ }
  if (typeof document !== 'undefined') document.documentElement.dataset.motion = preferences.motion;
  if (patch.haptics === 'off') { try { if (typeof navigator !== 'undefined') navigator.vibrate?.(0); } catch { /* platform policy */ } }
  listeners.forEach(fn => fn());
}
export function useConsolePreferences() {
  return useSyncExternalStore((fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; }, getPreferences);
}
if (typeof document !== 'undefined') document.documentElement.dataset.motion = preferences.motion;
