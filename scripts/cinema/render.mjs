/**
 * Eksport filmu „Poznaj JoyPad" do klatek albo do pliku MP4.
 *
 * To narzędzie dla człowieka, nie część builda (tak jak
 * `scripts/previews/capture.mjs`). Wymaga uruchomionego `npm run dev` oraz
 * przeglądarki Chromium z Playwrighta; do wideo — ffmpeg z libx264.
 * W środowiskach bez przeglądarki (sandbox, CI) skrypt powie wprost, czego
 * brakuje, i nic nie zapisze.
 *
 *   BASE_URL=http://localhost:5173 node scripts/cinema/render.mjs --plan
 *   BASE_URL=http://localhost:5173 node scripts/cinema/render.mjs --fps 12 --out .cache/film-frames
 *   BASE_URL=http://localhost:5173 node scripts/cinema/render.mjs --out .cache/film-frames \
 *     --video .cache/cinema/joypad.mp4 FFMPEG_PATH=/usr/bin/ffmpeg
 *
 * Każda klatka jest ustawiana przez `window.__joypadFilm.seek(ms)` — ten hook
 * istnieje wyłącznie w trybie deweloperskim, więc eksport zawsze pokazuje to,
 * co widzi użytkownik, a nie osobną implementację.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const token = process.argv[i];
  if (!token.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next && !next.startsWith('--')) { args.set(token.slice(2), next); i++; } else args.set(token.slice(2), 'true');
}
const base = process.env.BASE_URL || 'http://localhost:5173';
const outDir = args.get('out') || '.cache/film-frames';
const fps = Math.max(1, Number(args.get('fps') || 12));
const plan = args.has('plan');
const video = args.get('video');
const width = Number(args.get('width') || 1920);
const height = Number(args.get('height') || 1080);

function requirePlaywright() {
  try { return require('playwright'); } catch { /* niżej czytelny komunikat */ }
  return null;
}
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const playwright = requirePlaywright() ?? (() => {
  console.error('Brak Playwrighta. Zainstaluj go i pobierz Chromium: npx playwright install chromium');
  console.error('W tym sandboxie pobranie przeglądarki nie jest możliwe (CDN odrzuca połączenie) — uruchom eksport lokalnie.');
  process.exit(2);
})();

async function main() {
  let browser;
  try {
    browser = await playwright.chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined,
      args: ['--force-device-scale-factor=1', '--hide-scrollbars', '--autoplay-policy=no-user-gesture-required'],
    });
  } catch (error) {
    console.error('Nie udało się uruchomić Chromium:', error instanceof Error ? error.message : error);
    console.error('Sprawdź `npx playwright install chromium` albo wskaż CHROMIUM_PATH.');
    process.exit(3);
  }
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  await page.goto(base, { waitUntil: 'domcontentloaded' });
  // Film otwieramy tym samym wejściem, co ustawienia — bez osobnej ścieżki w aplikacji.
  await page.evaluate(async () => {
    const store = await import('/src/cinema/store.ts');
    store.openCinema('manual');
  });
  await page.waitForFunction(() => Boolean(window.__joypadFilm), null, { timeout: 20000 });
  await page.evaluate(() => { document.documentElement.dataset.filmExport = '1'; });

  const timeline = await page.evaluate(async () => {
    const { filmScript } = await import('/src/cinema/script.ts');
    const { buildTimeline, storyboard } = await import('/src/cinema/timeline.ts');
    const built = buildTimeline(filmScript.scenes);
    return {
      total: built.total,
      scenes: built.scenes.map(scene => ({ id: scene.id, startMs: scene.startMs, endMs: scene.endMs, ms: scene.ms, poster: scene.poster })),
      shots: storyboard(built).map(shot => ({ id: shot.scene.id, at: shot.at, ms: shot.ms })),
    };
  });

  if (plan) {
    console.log(`Film: ${(timeline.total / 1000).toFixed(1)} s, ${timeline.scenes.length} scen, ${Math.round(timeline.total / 1000 * fps)} klatek przy ${fps} fps`);
    for (const scene of timeline.scenes) {
      console.log(`  ${scene.id.padEnd(9)} ${String(scene.startMs).padStart(6)}–${String(scene.endMs).padStart(6)} ms  poster @${Math.round(scene.startMs + scene.poster * scene.ms)} ms`);
    }
    await browser.close();
    return;
  }

  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const step = 1000 / fps;
  let index = 0;
  for (let ms = 0; ms <= timeline.total; ms += step) {
    await page.evaluate(async value => {
      window.__joypadFilm.seek(value);
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    }, Math.round(ms));
    const file = join(outDir, `frame-${String(index).padStart(5, '0')}.png`);
    await page.screenshot({ path: file, type: 'png' });
    index++;
    if (index % 60 === 0) console.log(`  ${index} klatek…`);
  }
  console.log(`Gotowe: ${index} klatek w ${outDir}`);
  writeFileSync(join(outDir, 'README.txt'), `Klatki filmu JoyPad, ${fps} fps, ${width}x${height}.\nSceny: ${timeline.scenes.map(scene => scene.id).join(', ')}\nKazda klatka ustawiona przez window.__joypadFilm.seek() — to obraz z aplikacji, nie osobny renderer.\n`);

  if (video) {
    const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
    mkdirSync(join(video, '..'), { recursive: true });
    const result = spawnSync(ffmpeg, [
      '-y', '-framerate', String(fps), '-i', join(outDir, 'frame-%05d.png'),
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'medium', video,
    ], { stdio: 'inherit' });
    if (result.status !== 0) {
      console.error('ffmpeg nie skończył pracy — klatki zostały, wideo nie.');
      process.exitCode = 1;
    } else console.log(`Wideo: ${video}`);
  }
  await browser.close();
}

await main();
