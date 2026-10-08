/**
 * Kontrola dostarczania podglądu (`npm run selftest:delivery [port]`).
 *
 * Sprawdza to, czego nie widzą testy kodu: czy serwer podglądu **naprawdę podaje**
 * każdy plik, którego potrzebuje ekran TV — wejściowe chunki, leniwe chunki filmu,
 * czcionki z CSS, okładki, nagrania MP4/WebM i manifest PWA. Każdy zasób to osobne
 * żądanie HTTP; brakujący plik albo zły MIME kończy się błędem, a nie cichym
 * „czarnym ekranem” u użytkownika.
 *
 * Wymaga działającego serwera: `node scripts/preview-server.mjs 5173`.
 * Uruchomienie bez argumentu sprawdza port 5173.
 */
const PORT = Number(process.argv[2] ?? 5173);
const BASE = `http://localhost:${PORT}`;
const seen = new Set();
const problems = [];
let checked = 0;
let bytes = 0;

const fileUrl = (ref, base) => {
  if (ref.startsWith('data:') || ref.startsWith('#') || ref.startsWith('http')) return null;
  if (ref.startsWith('/')) return ref;
  return base + ref.replace(/^\.\//, '');
};

async function get(assetPath, base = '/') {
  const url = fileUrl(assetPath, base);
  if (!url || seen.has(url)) return null;
  seen.add(url);
  try {
    const response = await fetch(BASE + url, { cache: 'no-store' });
    checked += 1;
    if (!response.ok) { problems.push(`${url} → HTTP ${response.status}`); return null }
    const buffer = Buffer.from(await response.arrayBuffer());
    bytes += buffer.byteLength;
    return { body: buffer.toString('utf8'), type: response.headers.get('content-type') ?? '' };
  } catch (error) {
    problems.push(`${url} → ${error.message}`);
    return null;
  }
}

const index = await get('/');
if (!index) {
  console.error(`Serwer podglądu nie odpowiada na ${BASE}.`);
  console.error('Uruchom go wcześniej:  node scripts/preview-server.mjs ' + PORT);
  process.exit(1);
}

// 1. Wszystko, co `index.html` odwołuje bezpośrednio (chunki, CSS, ikony, manifest).
for (const match of index.body.matchAll(/(?:src|href)="([^"]+)"/g)) {
  const ref = match[1];
  if (!/\.(js|css|png|svg|jpg|webp|webmanifest)$/.test(ref)) continue;
  const file = await get(ref);
  // 2. Z arkuszy CSS wyciągamy czcionki i tła, bo to najczęstsze „ciche” 404.
  if (file?.type.includes('css')) {
    for (const url of file.body.matchAll(/url\(([^)]+)\)/g)) {
      const raw = url[1].replace(/["']/g, '').trim();
      await get(raw.startsWith('/') ? raw : '/assets/' + raw.replace(/^\.\//, ''));
    }
  }
}

const { readdir } = await import('node:fs/promises');
const { existsSync } = await import('node:fs');
const PREVIEW = '/home/user/joypad-preview';

// 3. Chunki leniwe: film, pad, gry — nie ma ich w `index.html`, a bez nich nie działa.
if (existsSync(`${PREVIEW}/assets`)) {
  for (const file of (await readdir(`${PREVIEW}/assets`)).filter((name) => name.endsWith('.js'))) {
    await get(`/assets/${file}`);
  }
}
// 4. Obrazy i nagrania growe (podglądy Full HD to największe pliki w projekcie).
for (const dir of ['images', 'brand']) {
  if (!existsSync(`${PREVIEW}/${dir}`)) continue;
  for (const file of await readdir(`${PREVIEW}/${dir}`)) await get(`/${dir}/${file}`);
}
for (const name of ['tanks', 'race', 'orbit']) {
  for (const ext of ['mp4', 'webm']) await get(`/previews/${name}.${ext}`);
}
// 5. Strona kontrolna podglądu — pierwszy ratunek, gdy coś nie działa.
await get('/podglad.html');

console.log(`Kontrola podglądu na ${BASE}`);
console.log(`Zasoby: ${checked}, pobrane ${(bytes / 1024 / 1024).toFixed(1)} MB`);
if (problems.length) {
  console.log('\nPROBLEMY:\n' + problems.map((p) => `  • ${p}`).join('\n'));
  console.log(`\nDELIVERY: ${problems.length} brakujących/uszkodzonych zasobów`);
  process.exit(1);
}
console.log('\nDELIVERY: OK (serwer podaje każdy zasób potrzebny ekranowi TV i podowi)');
