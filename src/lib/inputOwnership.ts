import type { KeyboardEvent } from 'react';

/**
 * Czy klawiatura jest teraz własnością interfejsu, a nie rozgrywki.
 *
 * Silniki gier słuchają `keydown` na `window` i same przełączają pauzę (`Esc`, `P`)
 * oraz blokują strzałki i spację `preventDefault`. To poprawne wyłącznie wtedy, gdy
 * nic modalnego nie stoi nad areną — a pauza, regulacje i wyniki są `dialog`ami.
 * Bez tego sprawdzenia jeden klawisz robił dwie rzeczy naraz: okienko się zamykało
 * (czyli wznawiało grę) i silnik *równocześnie* przełączał pauzę, a strzałki nie
 * mogły przewinąć długiego okienka ani przestawić `<select>` w ustawieniach.
 */
export function uiOwnsKeyboard(event?: KeyboardEvent | globalThis.KeyboardEvent): boolean {
  if (typeof document === 'undefined') return false;
  if (document.querySelector('dialog[open]')) return true;
  const target = event?.target;
  if (target instanceof HTMLElement) {
    const tag = target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
  }
  return false;
}
