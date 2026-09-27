export const AVATARS = { smile: 'Uśmiech', spark: 'Iskra', ghost: 'Duszek', cat: 'Kot', rocket: 'Rakieta', alien: 'Robot' } as const;
export const THEMES = { amber: '#edbd78', mint: '#85dec2', violet: '#baa6fa', ice: '#8dcff3' } as const;
export interface PlayerProfile { avatar: keyof typeof AVATARS; theme: keyof typeof THEMES }
export function normalizeProfile(value: unknown): PlayerProfile {
  const p = (value && typeof value === 'object' ? value : {}) as Partial<PlayerProfile>;
  return { avatar: p.avatar && Object.prototype.hasOwnProperty.call(AVATARS, p.avatar) ? p.avatar : 'smile', theme: p.theme && Object.prototype.hasOwnProperty.call(THEMES, p.theme) ? p.theme : 'amber' };
}
export function loadProfile(): PlayerProfile {
  try { return normalizeProfile(JSON.parse(localStorage.getItem('joypad.profile') || '{}')); } catch { return normalizeProfile(null); }
}
export function saveProfile(profile: PlayerProfile) {
  try { localStorage.setItem('joypad.profile', JSON.stringify(normalizeProfile(profile))); } catch { /* Optional storage. */ }
}
