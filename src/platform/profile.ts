export const AVATARS = { smile: 'Uśmiech', spark: 'Iskra', ghost: 'Duszek', cat: 'Kot', rocket: 'Rakieta', alien: 'Robot' } as const;
export const THEMES = { amber: '#edbd78', mint: '#85dec2', violet: '#baa6fa', ice: '#8dcff3' } as const;

export const ACHIEVEMENTS = {
  firstWin: { title: 'Pierwsza wygrana', detail: 'Wygraj swoją pierwszą rundę.' },
  fiveRounds: { title: 'Stały bywalec', detail: 'Zagraj pięć rund.' },
  winStreak: { title: 'Seria ×3', detail: 'Wygraj trzy rundy z rzędu.' },
  snakeBeta: { title: 'Wąż oswojony', detail: 'Wygraj rundę Wężowego Wiru.' },
} as const;
export type AchievementId = keyof typeof ACHIEVEMENTS;

export interface PlayerProgress {
  gamesPlayed: number;
  wins: number;
  streak: number;
  bestStreak: number;
  unlocked: AchievementId[];
}
export interface PlayerProfile { id?: string; avatar: keyof typeof AVATARS; theme: keyof typeof THEMES; progress: PlayerProgress }

function profileId() { try { return crypto.randomUUID(); } catch { return `jp-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`; } }

function normalizeProgress(value: unknown): PlayerProgress {
  const p = (value && typeof value === 'object' ? value : {}) as Partial<PlayerProgress>;
  const unlocked = Array.isArray(p.unlocked)
    ? p.unlocked.filter((id): id is AchievementId => typeof id === 'string' && Object.prototype.hasOwnProperty.call(ACHIEVEMENTS, id))
    : [];
  return {
    gamesPlayed: typeof p.gamesPlayed === 'number' && Number.isFinite(p.gamesPlayed) ? Math.max(0, Math.floor(p.gamesPlayed)) : 0,
    wins: typeof p.wins === 'number' && Number.isFinite(p.wins) ? Math.max(0, Math.floor(p.wins)) : 0,
    streak: typeof p.streak === 'number' && Number.isFinite(p.streak) ? Math.max(0, Math.floor(p.streak)) : 0,
    bestStreak: typeof p.bestStreak === 'number' && Number.isFinite(p.bestStreak) ? Math.max(0, Math.floor(p.bestStreak)) : 0,
    unlocked: [...new Set(unlocked)],
  };
}

export function normalizeProfile(value: unknown): PlayerProfile {
  const p = (value && typeof value === 'object' ? value : {}) as Partial<PlayerProfile>;
  return {
    id: typeof p.id === 'string' && /^[a-z0-9-]{8,80}$/i.test(p.id) ? p.id : profileId(),
    avatar: typeof p.avatar === 'string' && Object.prototype.hasOwnProperty.call(AVATARS, p.avatar) ? p.avatar as keyof typeof AVATARS : 'smile',
    theme: p.theme && Object.prototype.hasOwnProperty.call(THEMES, p.theme) ? p.theme : 'amber',
    progress: normalizeProgress(p.progress),
  };
}
export function loadProfile(): PlayerProfile {
  try { return normalizeProfile(JSON.parse(localStorage.getItem('joypad.profile') || '{}')); } catch { return normalizeProfile(null); }
}
export function saveProfile(profile: PlayerProfile) {
  try { localStorage.setItem('joypad.profile', JSON.stringify(normalizeProfile(profile))); } catch { /* Optional storage. */ }
}

function unlock(profile: PlayerProfile, id: AchievementId): PlayerProfile {
  if (profile.progress.unlocked.includes(id)) return profile;
  return { ...profile, progress: { ...profile.progress, unlocked: [...profile.progress.unlocked, id] } };
}

/** Zapisuje rozegraną rundę lokalnie na telefonie. Nie wymaga konta ani serwera. */
export function recordGamePlayed(profile = loadProfile()): PlayerProfile {
  let next: PlayerProfile = { ...profile, progress: { ...profile.progress, gamesPlayed: profile.progress.gamesPlayed + 1 } };
  if (next.progress.gamesPlayed >= 5) next = unlock(next, 'fiveRounds');
  saveProfile(next);
  return next;
}

/** Aktualizuje serię zwycięstw i odblokowuje osiągnięcia lokalnego Player Pass. */
export function recordWin(profile = loadProfile(), game?: string): PlayerProfile {
  const progress = profile.progress;
  let next: PlayerProfile = {
    ...profile,
    progress: {
      ...progress,
      wins: progress.wins + 1,
      streak: progress.streak + 1,
      bestStreak: Math.max(progress.bestStreak, progress.streak + 1),
    },
  };
  next = unlock(next, 'firstWin');
  if (next.progress.streak >= 3) next = unlock(next, 'winStreak');
  if (game === 'snake') next = unlock(next, 'snakeBeta');
  saveProfile(next);
  return next;
}

export function recordLoss(profile = loadProfile()): PlayerProfile {
  const next = { ...profile, progress: { ...profile.progress, streak: 0 } };
  saveProfile(next);
  return next;
}

export function unlockAchievement(profile = loadProfile(), id: AchievementId): PlayerProfile {
  const next = unlock(profile, id);
  saveProfile(next);
  return next;
}
