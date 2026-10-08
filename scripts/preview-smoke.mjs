/**
 * Smoke **prawdziwego bundla produkcyjnego** (`npm run selftest:preview`).
 *
 * Różnica wobec `selftest:ui`: tam aplikacja idzie przez pipeline Vite w trybie SSR
 * (świeże moduły źródłowe), a tutaj uruchamiamy dokładnie ten plik, który dostaje
 * przeglądarka (`/home/user/joypad-preview/assets/index-*.js`) — po minifikacji,
 * z podziałem na chunki ładowane dynamicznym `import()`. To jedyny automat, który
 * widzi błędy powstałe *w buildzie* (zły podział chunków, `import.meta`, CSS).
 *
 * Jak to działa: jsdom daje DOM, a bundle importujemy jako zwykły moduł ESM Node
 * (`import(entry)`). Dlatego shimy muszą być na `globalThis` **przed** importem.
 *
 * Warunki wstępne: build w `/home/user/joypad-preview` (skrypt sam kopiuje go do
 * `/home/user/boot-test`, gdzie dokłada `package.json` z `"type":"module"` — bez tego
 * Node odmówi importu plików `.js` jako ESM).
 *
 * Uwaga na jsdom: nie kopiujemy jego `performance` do globals (rekurencja `RangeError`);
 * `pretendToBeVisual:true` daje rAF; `dialog`/`ResizeObserver`/`IntersectionObserver`
 * nie istnieją i trzeba je podszyć, inaczej boot zatrzymuje się na pierwszym oknie.
 */
import { cp, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PREVIEW = '/home/user/joypad-preview';
const SANDBOX = '/home/user/boot-test';
const problems = [];
const notes = [];

const log = (label, ok, detail = '') => {
  console.log(`  ${ok ? 'OK   ' : 'BŁĄD '} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) problems.push(`${label}${detail ? ` — ${detail}` : ''}`);
};

// 1. Katalog tymczasowy: kopia builda + znacznik modułu ESM.
await mkdir(SANDBOX, { recursive: true });
await cp(PREVIEW, SANDBOX, { recursive: true, force: true });
await writeFile(path.join(SANDBOX, 'package.json'), '{"type":"module"}\n');

const html = await readFile(path.join(SANDBOX, 'index.html'), 'utf8');
const entry = /src="\.?\/?(assets\/index-[^"]+\.js)"/.exec(html)?.[1];
if (!entry) { console.error('Nie znalazłem wejściowego chunka w index.html — najpierw zbuduj podgląd.'); process.exit(1) }

// 2. jsdom + shimy przeglądarki.
const { JSDOM } = await import('jsdom');
const dom = new JSDOM(html.replace(/<script[^>]*type="module"[^>]*><\/script>/g, ''), {
  url: 'https://joypad.local/',
  pretendToBeVisual: true,
});
const { window } = dom;
Object.defineProperty(globalThis, 'window', { value: window, configurable: true });
Object.defineProperty(globalThis, 'document', { value: window.document, configurable: true });
for (const key of ['navigator', 'location', 'HTMLElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'localStorage', 'sessionStorage', 'history', 'CSS', 'URL', 'Blob', 'FileReader', 'Image', 'Audio', 'SVGElement']) {
  if (window[key] !== undefined && globalThis[key] === undefined) {
    Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
  }
}
window.matchMedia = window.matchMedia ?? ((query) => ({
  matches: false, media: query, onchange: null,
  addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
}));
window.scrollTo = window.scrollTo ?? (() => {});
window.Element.prototype.scrollTo = window.Element.prototype.scrollTo ?? function scrollTo() {};
window.Element.prototype.scrollIntoView = window.Element.prototype.scrollIntoView ?? function scrollIntoView() {};
window.HTMLDialogElement.prototype.showModal = window.HTMLDialogElement.prototype.showModal ?? function showModal() { this.open = true };
window.HTMLDialogElement.prototype.show = window.HTMLDialogElement.prototype.show ?? function show() { this.open = true };
window.HTMLDialogElement.prototype.close = window.HTMLDialogElement.prototype.close ?? function close() { this.open = false; this.dispatchEvent(new window.Event('close')) };
class ObserverStub { constructor(cb) { this.cb = cb } observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } }
window.ResizeObserver = window.ResizeObserver ?? ObserverStub;
window.IntersectionObserver = window.IntersectionObserver ?? ObserverStub;
window.MutationObserver = window.MutationObserver ?? class MutationObserver {
  constructor(cb) { this.cb = cb } observe() {} disconnect() {} takeRecords() { return [] }
};
window.PerformanceObserver = window.PerformanceObserver ?? class PerformanceObserver {
  constructor() {} observe() {} disconnect() {} takeRecords() { return [] }
};
// Sieć: harness jest offline, a aplikacja ma prawo sprawdzać aktualizacje i kanał
// zdalny. Nieudane żądanie to tu oczekiwany stan — ląduje w `notes`, nie w błędach.
window.fetch = window.fetch ?? (() => Promise.resolve({ ok: false, status: 503, headers: { get: () => null }, text: async () => '', json: async () => ({}), arrayBuffer: async () => new ArrayBuffer(0) }));
// Skalary, które przeglądarka udostępnia jako GOŁE zmienne globalne (`innerWidth`,
// `devicePixelRatio`). W Node ich nie ma, więc bundle wywala się na `ReferenceError`
// już w pierwszym renderze — i to nie jest błąd aplikacji, tylko dziura w harnessie.
for (const key of ['innerWidth', 'innerHeight', 'outerWidth', 'outerHeight', 'devicePixelRatio', 'scrollX', 'scrollY', 'pageXOffset', 'pageYOffset', 'screenX', 'screenY', 'isSecureContext']) {
  const value = window[key];
  if (value !== undefined) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
// Wszystko, co bundle woła bez `window.` (np. `new MutationObserver(...)`), musi
// dodatkowo trafić na `globalThis` — inaczej jest `ReferenceError` jeszcze przed pierwszym renderem.
for (const key of ['MutationObserver', 'ResizeObserver', 'IntersectionObserver', 'PerformanceObserver', 'AudioContext', 'WebSocket', 'fetch']) {
  if (window[key] !== undefined) Object.defineProperty(globalThis, key, { value: window[key], configurable: true, writable: true });
}
window.AudioContext = window.AudioContext ?? class AudioContext {
  constructor() { this.state = 'suspended'; this.currentTime = 0; this.destination = { connect() {}, disconnect() {} } }
  resume() { this.state = 'running'; return Promise.resolve() }
  close() { return Promise.resolve() }
  createGain() { return { gain: { value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} } }
  createOscillator() { return { type: 'sine', frequency: { value: 440, setValueAtTime() {} }, detune: { value: 0 }, connect() {}, disconnect() {}, start() {}, stop() {}, addEventListener() {} } }
  createBufferSource() { return { buffer: null, connect() {}, disconnect() {}, start() {}, stop() {}, addEventListener() {} } }
  createBuffer(channels, length, rate) { return { numberOfChannels: channels, length, sampleRate: rate, duration: length / rate, getChannelData: () => new Float32Array(length) } }
  createBiquadFilter() { return { type: 'lowpass', frequency: { value: 350, setValueAtTime() {} }, Q: { value: 1 }, connect() {}, disconnect() {} } }
  createDynamicsCompressor() { return { threshold: { value: -24 }, knee: { value: 30 }, ratio: { value: 12 }, attack: { value: .003 }, release: { value: .25 }, connect() {}, disconnect() {} } }
  createStereoPanner() { return { pan: { value: 0, setValueAtTime() {} }, connect() {}, disconnect() {} } }
  createConvolver() { return { buffer: null, normalize: true, connect() {}, disconnect() {} } }
  createAnalyser() { return { fftSize: 2048, connect() {}, disconnect() {} } }
  createMediaElementSource() { return { connect() {}, disconnect() {} } }
  decodeAudioData() { return Promise.reject(new Error('brak dekodera w shimie')) }
};
window.WebSocket = window.WebSocket ?? class WebSocket {
  constructor() { this.readyState = 0; setTimeout(() => { this.readyState = 1; this.onopen?.(new window.Event('open')) }, 0) }
  send() {} close() { this.readyState = 3; this.onclose?.(new window.Event('close')) } addEventListener() {} removeEventListener() {}
};
window.HTMLMediaElement.prototype.play = window.HTMLMediaElement.prototype.play ?? (() => Promise.resolve());
window.HTMLMediaElement.prototype.pause = window.HTMLMediaElement.prototype.pause ?? (() => {});
window.HTMLMediaElement.prototype.load = window.HTMLMediaElement.prototype.load ?? (() => {});
window.Element.prototype.requestFullscreen = window.Element.prototype.requestFullscreen ?? (() => Promise.resolve());
window.Element.prototype.webkitRequestFullscreen = window.Element.prototype.webkitRequestFullscreen ?? (() => Promise.resolve());
window.HTMLCanvasElement.prototype.getContext = window.HTMLCanvasElement.prototype.getContext ?? (() => null);
window.document.exitFullscreen = window.document.exitFullscreen ?? (() => Promise.resolve());
window.addEventListener('error', (event) => problems.push(`window.onerror: ${event.error?.message ?? event.message}`));
process.on('unhandledRejection', (reason) => {
  const message = reason?.message ?? String(reason);
  if (/fetch failed|network|Failed to fetch/i.test(message)) notes.push(`sieć: ${message.slice(0, 60)}`);
  else problems.push(`unhandledRejection: ${message}`);
});
const consoleError = console.error;
console.error = (...args) => {
  const text = args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : '')).join(' ');
  // Szum środowiska: React przy leniwych chunkach oraz jsdom, który nie ma canvasu
  // (rysowanie sprawdza dopiero przeglądarka, nie ten harness).
  if (/not wrapped in act|suspended resource finished loading|Not implemented: HTMLCanvasElement/i.test(text)) notes.push(text.slice(0, 90));
  else { problems.push(`console.error: ${text.slice(0, 160)}`); consoleError(...args) }
};

// 3. Start aplikacji + pytanie o poradnik.
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const text = () => window.document.body.textContent ?? '';
// Otwartych okien bywa kilka naraz (biblioteka startowa + pytanie o poradnik),
// więc pytamy o KONKRETNE okno, a nie o pierwsze z brzegu.
const openDialogs = () => [...window.document.querySelectorAll('dialog[open]')];
const dialogWith = (pattern) => openDialogs().find((d) => pattern.test(d.textContent ?? '')) ?? null;
async function until(check, timeout = 12000, step = 120) {
  const deadline = Date.now() + timeout;
  for (;;) {
    if (check()) return true;
    if (Date.now() > deadline) return false;
    await sleep(step);
  }
}

let step = 'import bundla';
try {
  await import(pathToFileURL(path.join(SANDBOX, entry)).href);
  step = 'pierwszy render';
  const rendered = await until(() => window.document.querySelector('#root')?.childElementCount, 8000);
  log('bundle montuje drzewo interfejsu', Boolean(rendered));

  step = 'splash';
  await wait(4200);

  step = 'pytanie o poradnik';
  const asked = await until(() => Boolean(dialogWith(/PORADNIK|tutorial/i)), 12000);
  const diagnostics = `otwartych okien ${openDialogs().length}, w treści „PORADNIK”: ${/PORADNIK/i.test(text())}`;
  log('pytanie o poradnik na starcie', asked, asked ? '' : diagnostics);

  step = 'start filmu';
  const sheet = dialogWith(/PORADNIK|tutorial/i) ?? openDialogs()[0] ?? null;
  const button = [...(sheet?.querySelectorAll('button') ?? [])].find(b => /^Tak/i.test(b.textContent ?? '') && /poradnik|tutorial/i.test(b.textContent ?? ''));
  if (!button) log('przycisk „Tak, pokaż poradnik”', false, 'nie znalazłem');
  else {
    button.click();
    const playing = await until(() => window.document.querySelectorAll('.cine-stage, .cine-root, [data-film]').length > 0 || /film/i.test(window.document.body.className), 9000);
    log('film startuje z pytania', playing);
    window.document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    const stopped = await until(() => /Biblioteka|Ustawienia systemu|Wszystkie gry/i.test(text()), 9000);
    log('Esc wraca do biblioteki', stopped, stopped ? '' : `treść: ${text().slice(0, 90)}`);
  }

  const tree = window.document.querySelector('#root')?.childElementCount ?? 0;
  log('interfejs nadal żyje po filmie', tree > 0, `elementów w #root: ${tree}`);
} catch (error) {
  log(`krok „${step}” bez wyjątku`, false, error?.stack?.split('\n').slice(0, 3).join(' | ') ?? String(error));
}

// jsdom trzyma własne timery i `requestAnimationFrame`, więc proces nie kończy się
// sam — zamykamy okno i wychodzimy jawnie, inaczej `npm run` wisiałby w nieskończoność.
dom.window.close();
const files = await readdir(path.join(SANDBOX, 'assets'));
console.log(`\nSprawdzone: chunk ${entry}, ${files.length} plików w assets/, uwag harnessu: ${notes.length}`);
if (problems.length) {
  console.log('\nNIEZDANE:\n' + problems.map(p => `  • ${p}`).join('\n'));
  console.log(`\nPREVIEW SMOKE: ${problems.length} problem(ów)`);
  process.exit(1);
}
console.log('\nPREVIEW SMOKE: OK (prawdziwy bundle produkcyjny przechodzi scenariusz pierwszego uruchomienia)');
process.exit(0);
