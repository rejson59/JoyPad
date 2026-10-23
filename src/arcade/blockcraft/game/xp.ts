/**
 * Experience points with the Minecraft-style level curve.
 * `total` is the only persisted value – the level is always derived from it,
 * so saves stay small and can never desync from the curve.
 */

/** Points needed to advance from `level` to `level + 1`. */
export function xpToNext(level: number): number {
  if (level < 16) return level + 7;
  if (level <= 30) return 17 + 3 * (level - 15);
  return 58 + 7 * (level - 30);
}

/** Cumulative points required to reach `level` (level 0 costs nothing). */
export function totalXpForLevel(level: number): number {
  let total = 0;
  for (let l = 0; l < level; l++) total += xpToNext(l);
  return total;
}

export interface XpInfo {
  level: number;
  /** Points earned inside the current level. */
  inLevel: number;
  /** Points needed to reach the next level. */
  need: number;
}

/** Resolves a total point count into level / progress without mutating state. */
export function levelFromXp(total: number): XpInfo {
  let level = 0;
  let rest = Math.max(0, Math.floor(total));
  while (rest >= xpToNext(level)) {
    rest -= xpToNext(level);
    level++;
  }
  return { level, inLevel: rest, need: xpToNext(level) };
}

export class Xp {
  total: number;
  constructor(total = 0) {
    this.total = Math.max(0, Math.floor(total));
  }
  /** Adds points, returning how many levels up the player moved. */
  add(n: number): number {
    const before = this.info().level;
    this.total += Math.max(0, Math.floor(n));
    return this.info().level - before;
  }
  info(): XpInfo {
    return levelFromXp(this.total);
  }
  /** Spends whole levels (enchanting table). False when the player is too low. */
  spend(levels: number): boolean {
    const n = Math.max(0, Math.floor(levels));
    if (n === 0) return true;
    const info = this.info();
    if (info.level < n) return false;
    const next = info.level - n;
    // keep the in-bar progress, but never more than the new level can hold
    this.total = totalXpForLevel(next) + Math.min(info.inLevel, Math.max(0, xpToNext(next) - 1));
    return true;
  }
  /** What the spend would cost in levels – 0 when unaffordable. */
  canSpend(levels: number): boolean {
    return this.info().level >= Math.max(0, Math.floor(levels));
  }
}
