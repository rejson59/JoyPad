/**
 * Serwer podglądu JoyPad — zero zależności (tylko wbudowane moduły Node).
 *
 * Dlaczego nie `vite dev`: proces deweloperski czyta moduły z `node_modules`, a to
 * katalog, który w środowisku agenta jest czyszczony między turami — strona ładuje
 * wtedy HTML, ale nie potrafi pobrać swoich modułów i karta robi się czarna.
 * Ten serwer podaje gotowy build (`npx vite build --outDir ../joypad-preview`) i nie
 * potrzebuje niczego poza samym Node, więc nie ma czego „zgubić”. Pliki czyta przy
 * każdym żądaniu, więc przebudowa działa bez restartu.
 *
 * Uruchomienie:  node scripts/preview-server.mjs [port] [katalog]
 * Domyślnie:     port 5173, katalog ../joypad-preview
 *
 * Przy starcie robi szybką samokontrolę: czy `index.html` i wszystkie odwołane
 * `/assets/*.js|css` naprawdę leżą na dysku. Brak pliku = build jest niekompletny
 * (np. przerwany) i lepiej wiedzieć o tym od razu, niż zgadywać, czemu ekran jest czarny.
 */
import { createServer } from 'node:http';
import { createReadStream, existsSync, promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2] ?? process.env.PREVIEW_PORT ?? 5173);
const ROOT = path.resolve(process.argv[3] ?? process.env.PREVIEW_DIR ?? path.join(here, '..', '..', 'joypad-preview'));
const HOST = '0.0.0.0';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
};

const typeOf = (file) => TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream';

/**
 * Nagłówki pamięci podręcznej.
 *
 * Do rundy 16 serwer wysyłał `no-store` do wszystkiego — bezpieczne dla HTML, ale
 * zgubne dla filmu: klipy MP4 są wielomegabajtowe, a scena pokazująca nagrania
 * pobierała je od nowa przy KAŻDYM wejściu (użytkownik widział „nie wszystko się
 * ładuje"). Chunki mają hash w nazwie, a `assets/`, `previews/`, `images/` i `brand/`
 * zmieniają się tylko przy buildzie, więc mogą być cache'owane agresywnie — dokładnie
 * tak, jak robi to GitHub Pages w produkcji. HTML, manifest i strona kontrolna
 * zostają `no-store`, bo tam zawsze ma być najświeższa wersja.
 */
function cacheHeadersFor(file) {
  const relative = path.relative(ROOT, file).split(path.sep)[0];
  if (['assets', 'previews', 'images', 'brand'].includes(relative)) {
    // `assets/` ma hash w nazwie → `immutable`; reszta krócej, żeby podmiana pliku była widoczna.
    return relative === 'assets'
      ? 'public, max-age=31536000, immutable'
      : 'public, max-age=86400';
  }
  return 'no-store';
}

/** Ścieżka z adresu → plik w ROOT, ale nigdy poza ROOT (żadnych `../`). */
function resolveSafe(urlPath) {
  const clean = decodeURIComponent((urlPath ?? '/').split('?')[0].split('#')[0]);
  const resolved = path.resolve(ROOT, '.' + path.posix.normalize(clean));
  return resolved === ROOT || resolved.startsWith(ROOT + path.sep) ? resolved : null;
}

async function statOf(file) {
  try { return await fs.stat(file) } catch { return null }
}

/** Zakresy bajtów: wideo w filmie przewija się bez pobierania całego pliku. */
function sendRange(req, res, file, size, type) {
  const range = req.headers.range;
  if (!range) return false;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return false;
  const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2] || 0));
  const end = match[2] && match[1] ? Math.min(Number(match[2]), size - 1) : size - 1;
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || start >= size) {
    res.writeHead(416, { 'Content-Range': `bytes */${size}` });
    res.end();
    return true;
  }
  res.writeHead(206, {
    'Content-Type': type,
    'Content-Length': end - start + 1,
    'Content-Range': `bytes ${start}-${end}/${size}`,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheHeadersFor(file),
  });
  if (req.method === 'HEAD') return res.end(), true;
  createReadStream(file, { start, end }).pipe(res);
  return true;
}

/**
 * Strona kontrolna `/podglad.html`. Generowana **w locie**, nie z pliku na dysku:
 * `npx vite build --emptyOutDir` czyści cały katalog wyjściowy, więc plik trzymany
 * w `joypad-preview/` ginąłby przy każdej przebudowie. Pokazuje czas builda, hash
 * chunka i sam sprawdza w przeglądarce, czy kluczowe zasoby odpowiadają 200.
 */
async function serveControlPage(res) {
  const indexPath = path.join(ROOT, 'index.html');
  let build = 'brak builda', hash = '—';
  try {
    const html = await fs.readFile(indexPath, 'utf8');
    const match = /\/assets\/index-([^"]+?)\.js/.exec(html);
    if (match) hash = match[1];
    const info = await fs.stat(indexPath);
    build = info.mtime.toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
  } catch { /* brak index.html — strona i tak się przyda */ }
  const page = `<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Podgląd JoyPad — kontrola</title><style>
:root { color-scheme: dark }
body { margin:0; min-height:100vh; display:grid; place-items:center; background:#0a0a0b; color:#e8ecf1;
       font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif }
main { max-width:680px; padding:40px 28px } h1 { font-size:26px; margin:0 0 6px }
.ok { color:#4ade80 } .bad { color:#f87171 }
ul { padding-left:20px } li { margin:4px 0 }
.box { background:#121418; border:1px solid #23262c; border-radius:14px; padding:18px 20px; margin-top:18px }
a { color:#f6ad55 } code { background:#1b1f26; padding:2px 6px; border-radius:6px; font-size:13px }
.tag { display:inline-block; padding:2px 8px; border-radius:999px; background:#1b1f26; font-size:12px; color:#9ca3af }
</style></head><body><main>
<h1>Serwer podglądu <span class="ok">działa ✓</span></h1>
<p>Ta strona <strong>nie używa ani jednego pakietu</strong> — jej otwarcie dowodzi, że podgląd dostarcza pliki poprawnie.</p>
<div class="box"><p><strong>Build:</strong> ${build} <span class="tag">runda 15</span></p>
<p><strong>Chunk aplikacji:</strong> <code>index-${hash}.js</code></p>
<p id="probe">Sprawdzam zasoby…</p></div>
<div class="box"><p><strong>Co nowego w tej wersji:</strong></p><ul>
<li>Plamek ma <strong>stały kolor</strong> wszędzie (naprawione rozjaśnianie na przyciskach na dole).</li>
<li>Lepsze wygładzenie krawędzi, cień kontaktowy i połysk — bardziej „mokra farba”.</li>
<li><strong>Poradnik obejrzysz ponownie</strong>: stopka biblioteki → „Poradnik”, okno „Jak zacząć?”, Ustawienia §06.</li>
</ul></div>
<div class="box"><p><strong>Ekrany:</strong></p><ul>
<li>Ekran TV: <a href="/">/</a> (biblioteka, pytanie o poradnik, film)</li>
<li>Ekran pada: <a href="/#pad">/#pad</a></li></ul>
<p><strong>Wygląd dla urządzenia</strong> (przydatne, gdy nie masz pod ręką telewizora &mdash;
JoyPad sam rozpoznaje sprzęt, a tu możesz go podejrzeć):</p>
<ul>
<li><a href="/?profil=tv">/?profil=tv</a> &mdash; telewizor: większa typografia i kafelki</li>
<li><a href="/?profil=desktop">/?profil=desktop</a> &mdash; komputer (domyślnie na PC)</li>
<li><a href="/?profil=tablet">/?profil=tablet</a> &mdash; tablet: duże menu, wszystko pod palec</li>
<li><a href="/?profil=handheld">/?profil=handheld</a> &mdash; telefon</li>
<li><a href="/?profil=auto">/?profil=auto</a> &mdash; wróć do automatycznego rozpoznania</li>
</ul></div>
<p>Jeśli <a href="/">ekran TV</a> będzie czarny, a ta strona działa — winna jest aplikacja: napisz, co pokazuje konsola (F12 → Console).</p></div>
</main><script>
const probes = ['/', '/index.html', '/manifest.webmanifest'];
Promise.all(probes.map(p => fetch(p, { cache: 'no-store' })
  .then(r => '<div>' + (r.ok ? '\u2713 ' : '\u2717 ') + p + ' → HTTP ' + r.status + '</div>')
  .catch(e => '<div class="bad">\u2717 ' + p + ' → BŁĄD: ' + e.message + '</div>')))
  .then(lines => { document.getElementById('probe').innerHTML = lines.join(''); });
</script></body></html>`;
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(page);
  return 200;
}

async function serve(req, res, urlPath) {
  if ((urlPath ?? '').split('?')[0] === '/podglad.html') return serveControlPage(res);
  let file = resolveSafe(urlPath);
  if (!file) { res.writeHead(400).end('Zła ścieżka'); return 400 }

  let info = await statOf(file);
  if (info?.isDirectory()) { file = path.join(file, 'index.html'); info = await statOf(file) }

  // Bez rozszerzenia = trasa aplikacji (SPA) → index.html.
  if (!info && !path.extname(file)) {
    file = path.join(ROOT, 'index.html');
    info = await statOf(file);
  }
  if (!info || !info.isFile()) {
    const fallback = await statOf(path.join(ROOT, 'index.html'));
    if (!fallback) { res.writeHead(500).end('Brak builda — uruchom: npx vite build --outDir ../joypad-preview'); return 500 }
    file = path.join(ROOT, 'index.html');
    info = fallback;
  }

  const type = typeOf(file);
  if (sendRange(req, res, file, info.size, type)) return 206;

  res.writeHead(200, {
    'Content-Type': type,
    'Content-Length': info.size,
    'Accept-Ranges': 'bytes',
    'Cache-Control': cacheHeadersFor(file),
  });
  if (req.method === 'HEAD') return res.end(), 200;
  createReadStream(file).pipe(res);
  return 200;
}

/** Samokontrola: czy build kompletny? Liczy zasoby odwołane z `index.html`. */
async function audit() {
  const indexPath = path.join(ROOT, 'index.html');
  if (!existsSync(indexPath)) return { ok: false, missing: ['index.html'], total: 0 };
  const html = await fs.readFile(indexPath, 'utf8');
  const refs = [...new Set([...html.matchAll(/(?:src|href)="\.?\/?([^":]+\.(?:js|css|webmanifest|png|svg|jpg))"/g)].map(m => m[1]))];
  const missing = refs.filter(ref => !existsSync(path.join(ROOT, ref)));
  if (!missing.length) {
    // Chunki leniwe (film, pad, gry) nie są w `index.html` — sprawdzamy, czy w ogóle są.
    const assets = path.join(ROOT, 'assets');
    const has = existsSync(assets) ? (await fs.readdir(assets)).length : 0;
    if (has === 0) missing.push('assets/ (brak chunków)');
  }
  return { ok: missing.length === 0, missing, total: refs.length };
}

createServer((req, res) => {
  const started = Date.now();
  serve(req, res, req.url ?? '/')
    .then((status) => {
      const where = (req.url ?? '/').slice(0, 90);
      console.log(`${new Date().toISOString().slice(11, 19)}  ${String(status ?? 200).padEnd(3)} ${req.method} ${where}  ${Date.now() - started} ms`);
    })
    .catch((error) => {
      console.error('BŁĄD PODAWANIA:', error?.message ?? error);
      if (!res.headersSent) res.writeHead(500);
      res.end('Błąd serwera podglądu');
    });
}).listen(PORT, HOST, async () => {
  const report = await audit();
  console.log(`Podgląd JoyPad (build statyczny) na http://${HOST}:${PORT}`);
  console.log(`Katalog: ${ROOT}`);
  console.log(report.ok
    ? `Samokontrola: build kompletny (${report.total} zasobów z index.html)`
    : `Samokontrola: BRAKI — ${report.missing.join(', ')}`);
});
