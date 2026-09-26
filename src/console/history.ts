import { GAMES } from '../arcade/catalog';
const PREFIX = 'joypad.evening.';
export function readChoice<T extends string | number>(key: string, values: readonly T[], fallback: T): T {
  try { const value: unknown = JSON.parse(localStorage.getItem(PREFIX + key) || 'null'); return values.find(option => option === value) ?? fallback; } catch { return fallback; }
}
export function remember(key: string, value: string | number) {
  try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); } catch { /* Storage is optional. */ }
}
export function lastGame() {
  return readChoice('game', GAMES.filter(game => !game.wip).map(game => game.id), 'orbit');
}
export function hasHistory() {
  try { return GAMES.some(game => !game.wip && JSON.stringify(game.id) === localStorage.getItem(PREFIX + 'game')); } catch { return false; }
}
