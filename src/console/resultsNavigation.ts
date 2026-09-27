import type { RemoteCommand } from '../net/protocol';
/** Focus-based results navigation: the phone can actually open Moments, not just rematch. */
export function navigateResults(command: RemoteCommand): boolean {
  const items = Array.from(document.querySelectorAll<HTMLElement>('.cine-results .moment-cards button,.cine-results .cine-result-actions button,.cine-results .cine-proposals button'));
  if (!items.length) return false;
  const current = items.indexOf(document.activeElement as HTMLElement);
  if (command === 'select' && current >= 0) { items[current].click(); return true; }
  if (['left', 'right', 'up', 'down'].includes(command)) {
    const direction = command === 'left' || command === 'up' ? -1 : 1;
    const next = current < 0 ? direction > 0 ? 0 : items.length - 1 : (current + direction + items.length) % items.length;
    items[next].focus();
    return true;
  }
  return false;
}
