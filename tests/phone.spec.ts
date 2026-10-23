import { test, expect, type Page } from '@playwright/test';
// Numery i treści bierzemy ze źródła, jak w `moments.spec.ts`: test ma pomijać okna
// startowe i czytać stan rundy, nie zgadywać po pikselach.
import { WHATS_NEW_VERSION } from '../src/platform/whatsNewState';
import { FILM_VERSION } from '../src/cinema/script';

/**
 * Telefon klasy iPhone: konsola musi być zaprojektowana na pionowy ekran, a nie
 * pomniejszonym komputerem. Ramka `fit-frame` tnie nadmiar, więc każdy przycisk
 * poza oknem jest przyciskiem NIEWIDZIALNYM — stąd twarde asercje geometrii.
 */
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

async function skipStartupSheets(page: Page) {
  await page.addInitScript(version => localStorage.setItem('joypad.cinema', JSON.stringify({
    answered: true, declined: false, askOnStart: false, version, plays: 0,
  })), FILM_VERSION);
  await page.addInitScript(version => localStorage.setItem('joypad.whats-new-version', version), WHATS_NEW_VERSION);
}

test('konsola na telefonie: profil handheld, nic nie wypada poza okno, cele pod kciuk', async ({ page }) => {
  await skipStartupSheets(page);
  await page.goto('/');
  await expect(page.locator('.os-library')).toBeVisible({ timeout: 15_000 });
  expect(await page.evaluate(() => document.documentElement.dataset.profile)).toBe('handheld');

  // Ucięcie w ramce = niewidzialny przycisk: żadne narzędzie paska ani stopki nie może
  // wystawać poza okno, a dokument nie może mieć poziomego scrolla.
  const clipped = await page.evaluate(() => {
    const width = window.innerWidth;
    const bad: string[] = [];
    if (document.documentElement.scrollWidth > width + 1) bad.push('dokument');
    for (const el of document.querySelectorAll<HTMLElement>('header.os-topbar button, footer.os-footer button, .os-game-tile')) {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && (rect.left < -1 || rect.right > width + 1)) bad.push(el.getAttribute('aria-label') || el.className);
    }
    return bad;
  });
  expect(clipped).toEqual([]);

  // Półka w dwóch kolumnach, skróty klawiszowe schowane (telefon ich nie ma),
  // a podpowiedź kontrolera widoczna — to telefonowy odpowiednik „gdzie jest pad".
  const columns = await page.evaluate(() => getComputedStyle(document.querySelector('.os-game-rail')!).gridTemplateColumns.split(' ').length);
  expect(columns).toBe(2);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('.ui-hints')!).display)).toBe('none');
  await expect(page.locator('.os-hint-phone')).toBeVisible();

  // Cele dotyku: pasek i stopka mają co najmniej 44 px wysokości.
  const small = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('header.os-topbar button, footer.os-footer button')]
    .filter(button => { const rect = button.getBoundingClientRect(); return rect.height > 0 && rect.height < 44; })
    .map(button => button.getAttribute('aria-label') || button.textContent || button.className));
  expect(small).toEqual([]);
});

test('Wężowy Wir: strzałki sterują jednoosobową rundą (obietnica „Strzałki lub joystick”)', async ({ page }) => {
  await skipStartupSheets(page);
  await page.goto('/');
  const tile = page.locator('.os-game-tile', { hasText: 'Wężowy Wir' });
  await tile.click();
  await tile.click(); // pierwsze kliknięcie wybiera kafelek, drugie wchodzi w menu
  await page.locator('.cine-start').click();
  // DEV: widok wystawia rundę jako `window.joypadRound`, więc sterowanie sprawdzamy
  // stanem wejścia, a nie kolorem pikseli na płótnie.
  await page.waitForFunction(() => (window as unknown as { joypadRound?: unknown }).joypadRound !== undefined, undefined, { timeout: 20_000 });
  const axis = (index: 0 | 1) => page.evaluate(([slot, key]) => {
    const round = (window as unknown as { joypadRound: { debugInput: (s: number) => { x: number; y: number } } }).joypadRound;
    const state = round.debugInput(slot);
    return key === 0 ? state.x : state.y;
  }, [0, index] as const);

  await page.keyboard.down('ArrowRight');
  await expect.poll(() => axis(0)).toBe(1);
  await page.keyboard.up('ArrowRight');
  await page.keyboard.down('ArrowUp');
  await expect.poll(() => axis(1)).toBe(-1);
  await page.keyboard.up('ArrowUp');
  // WASD nadal działa (alias dokłada strzałki, nie zabiera zestawu bazowego).
  await page.keyboard.down('KeyD');
  await expect.poll(() => axis(0)).toBe(1);
  await page.keyboard.up('KeyD');
});
