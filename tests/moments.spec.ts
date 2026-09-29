import { test, expect, type Page } from '@playwright/test';

async function harness(page: Page) {
  await page.route('**/__moments_test', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><html lang="pl"><body></body></html>' }));
  await page.goto('/__moments_test');
  await page.evaluate(async () => {
    const runtimeURL = '/@react-refresh'; const { default: runtime } = await import(/* @vite-ignore */ runtimeURL);
    runtime.injectIntoGlobalHook(window);
    Object.assign(window, { $RefreshReg$: () => {}, $RefreshSig$: () => (type: unknown) => type, __vite_plugin_react_preamble_installed__: true });
  });
}

async function skipStartupReleaseNotes(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('joypad.whats-new-version', '1.8.0');
    // v1.8: ekran powitalny (pytanie o poradnik) ma własny znacznik "widziane".
    localStorage.setItem('joypad.startup-version', '1');
  });
}

test('localized release notes appear at startup once and can be dismissed', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('joypad.startup-version', '1'));
  await page.goto('/');
  const whatsNew = page.getByRole('dialog', { name: 'Co nowego?' });
  await expect(whatsNew).toBeVisible({ timeout: 15_000 });
  await expect(whatsNew).toContainText('Nitro League');
  await whatsNew.getByRole('button', { name: 'Do biblioteki' }).click();
  await expect(whatsNew).toHaveCount(0);
  await page.reload();
  await expect(page.locator('.os-library')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('dialog', { name: 'Co nowego?' })).toHaveCount(0);
});

test('real independent clips decode, seek, play, slow down, download and release URLs', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await harness(page);
  const clips = await page.evaluate(async () => { const path = '/tests/moments-harness.ts'; return (await import(/* @vite-ignore */ path)).syntheticRecording(); });
  expect(clips).toHaveLength(2); expect(clips.every(m => !!m.replay)).toBeTruthy();
  const decoded = await page.evaluate(async () => { const path = '/tests/moments-harness.ts'; return (await import(/* @vite-ignore */ path)).decodeResults(); });
  for (const clip of decoded) { expect(clip.width).toBe(1280); expect(clip.height).toBe(720); expect(clip.duration).toBeGreaterThan(.2); expect(clip.duration).toBeLessThan(5); expect(clip.lit).toBeGreaterThan(400); }
  await page.locator('.moment-cards button').first().click();
  const video = page.locator('dialog video'); await expect(video).toBeVisible();
  await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(.1);
  await page.getByRole('button', { name: 'Tempo', exact: false }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.playbackRate)).toBe(.5);
  await video.evaluate((el: HTMLVideoElement) => { el.pause(); el.currentTime = .7; });
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeCloseTo(.7, 1);
  const download = page.waitForEvent('download'); await page.getByRole('link', { name: 'Pobierz klip' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.webm$/);
  await page.getByRole('button', { name: /^(?:Moment|Akcja) 2:/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Test nagrania 2');
  await page.keyboard.press('Escape'); await expect(video).toHaveCount(0);
  await page.evaluate(async () => { const path = '/tests/moments-harness.ts'; (await import(/* @vite-ignore */ path)).dispose(); });
  const revoked = await page.evaluate(async (url: string) => { try { await fetch(url); return false; } catch { return true; } }, clips[0].replay.url);
  expect(revoked).toBeTruthy(); expect(errors).toEqual([]);
});

for (const [id, split] of [['tanks', false], ['race', false], ['race', true], ['orbit', false]] as const) {
  test(`actual ${id} ${split ? 'split' : 'shared'} render is captured and decodes to nonblack frames`, async ({ page }) => {
    const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
    await harness(page);
    const result = await page.evaluate(async ({ id, split }) => { const path = '/tests/moments-harness.ts'; return (await import(/* @vite-ignore */ path)).engineRecording(id, split); }, { id, split });
    console.log(id, result);
    expect(result.frameCount).toBeGreaterThanOrEqual(6);
    expect(result.lit).toBeGreaterThan(20); expect(result.width).toBe(1280); expect(result.height).toBe(720);
    expect(result.duration).toBeGreaterThan(.1); expect(Number.isFinite(result.duration)).toBeTruthy();
    if (id !== 'tanks') expect(result.canvasReplaced).toBeTruthy();
    if (id === 'orbit') expect(result.overlaySeen).toBeTruthy();
    expect(errors).toEqual([]);
  });
}

test('recording preference persists and can be switched off on TV', async ({ page }) => {
  await skipStartupReleaseNotes(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Ustawienia systemu' }).click();
  const control = page.getByRole('switch', { name: 'Momenty · powtórki wideo', exact: true });
  await expect(control).toHaveAttribute('aria-checked', 'true'); await control.click();
  await page.reload(); await page.getByRole('button', { name: 'Ustawienia systemu' }).click();
  await expect(control).toHaveAttribute('aria-checked', 'false');
});

test('actual TV flow: captured pickup → results → video → rematch → new clip → exit', async ({ page }) => {
  test.setTimeout(180_000);
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  // Deterministic short round, injected ONLY into the test response. The real engine
  // detects a real pickup at the tank position; the production recorder/UI is untouched.
  await page.route('**/src/game/engine.ts*', async route => {
    const response = await route.fetch();
    const code = await response.text();
    const patched = code.replace('start() {', `start() {
      this.timeLeft = 4; this.countdown = 0;
      const originalUpdate = this.update.bind(this); let seeded = false;
      this.update = (sdt, rdt) => {
        if (!seeded && this.elapsed > 1) {
          seeded = true;
          this.powerups.push({ x:this.tanks[0].x, y:this.tanks[0].y, kind:'shield', life:25, bob:0, taken:false });
        }
        originalUpdate(sdt, rdt);
      };
    `);
    expect(patched).not.toBe(code);
    await route.fulfill({ response, body: patched });
  });
  await page.addInitScript(() => {
    localStorage.setItem('joypad.evening.game', JSON.stringify('tanks'));
    localStorage.setItem('joypad.whats-new-version', '1.8.0');
    localStorage.setItem('joypad.startup-version', '1');
  });
  await page.goto('/');
  await page.locator('[data-game-index="0"]').click();
  await page.getByRole('button', { name: 'Rozpocznij pojedynek', exact: false }).click();
  await expect(page.locator('.moment-video-badge').first()).toContainText('OBEJRZYJ', { timeout: 40_000 });
  await page.locator('.moment-cards button').first().click();
  const video = page.locator('dialog video'); await expect(video).toBeVisible();
  const oldUrl = await video.getAttribute('src'); expect(oldUrl).toMatch(/^blob:/);
  await page.getByRole('button', { name: 'Odtwórz', exact: true }).click();
  await expect.poll(() => video.evaluate((el: HTMLVideoElement) => el.currentTime)).toBeGreaterThan(.1);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Rewanż/ }).click();
  await expect(page.locator('.cine-results')).toHaveCount(0);
  await expect(page.locator('.moment-video-badge').first()).toContainText('OBEJRZYJ', { timeout: 40_000 });
  const revoked = await page.evaluate(async url => { try { await fetch(url!); return false; } catch { return true; } }, oldUrl);
  expect(revoked).toBeTruthy();
  await page.locator('.moment-cards button').first().click();
  const nextUrl = await video.getAttribute('src'); expect(nextUrl).not.toBe(oldUrl);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: /^Zmień grę/ }).click();
  await expect(page.locator('.os-library')).toBeVisible();
  expect(await page.evaluate(async url => { try { await fetch(url!); return false; } catch { return true; } }, nextUrl)).toBeTruthy();
  expect(errors).toEqual([]);
});
