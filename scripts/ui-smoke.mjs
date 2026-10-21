/**
 * Test dymny interfejsu — chodzi po ekranach i zbiera błędy, których nie widzą
 * testy jednostkowe.
 *
 * Po co: selftesty sprawdzają model, liczby i kontrakty w plikach, ale nie to, czy
 * kliknięcie „Ustawienia" / „Jak zacząć" / „Poradnik" naprawdę otwiera okno i czy przy
 * tym nie leci wyjątek. React 19 po nieprzechwyconym błędzie w efekcie wymontowuje
 * CAŁE drzewo — dla użytkownika to „czarny ekran" bez śladu. Ten test przechodzi
 * pełną ścieżkę pierwszego uruchomienia (splash → pytanie o poradnik → film →
 * biblioteka → wszystkie okna → film z Ustawień) i wymaga ZERA błędów.
 *
 * Jak: prawdziwy render kliencki (`react-dom/client`) w jsdom, a moduły idą przez
 * pipeline Vite (`ssrLoadModule`) — ten sam zbiór transformacji, co w przeglądarce.
 * Nie zastępuje przeglądarki (brak układu i WebGL), ale łapie wyjątki, martwe
 * przyciski i puste drzewo interfejsu.
 *
 * Uruchomienie:  npm run selftest:ui
 */
import { JSDOM } from 'jsdom';
import { fileURLToPath } from 'node:url';

const STEPS = [];
const PROBLEMS = [];
let step = '';
const fail = (what) => PROBLEMS.push(`${step} — ${what}`);

/* --- 1. Środowisko przeglądarki (jsdom) ---------------------------------- */

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
  pretendToBeVisual: true,
});
const win = dom.window;
for (const key of Object.getOwnPropertyNames(win)) {
  if (key in globalThis) continue;
  try { globalThis[key] = win[key] } catch { /* getter-only — trudno */ }
}
globalThis.window = win;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

/* Czego jsdom nie ma, a czego aplikacja używa. Każda atrapa jest świadoma:
   brak przeglądarki to brak wyników, nie powód do fałszywego alarmu. */
const notes = [];
const dialogProto = win.HTMLDialogElement?.prototype;
if (dialogProto && !dialogProto.showModal) {
  dialogProto.showModal = function () { this.setAttribute('open', ''); this.open = true; };
  dialogProto.show = dialogProto.showModal;
  dialogProto.close = function (value) { this.removeAttribute('open'); this.open = false; if (value !== undefined) this.returnValue = value; };
  notes.push('dialog');
}
for (const name of ['ResizeObserver', 'IntersectionObserver']) {
  if (!win[name]) {
    win[name] = class { constructor(cb) { this.cb = cb } observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } };
    globalThis[name] = win[name];
    notes.push(name);
  }
}
// Przewijanie: jsdom nie ma tych metod, a interfejs je woła (bez nich „pada" fokus).
if (!win.Element.prototype.scrollTo) win.Element.prototype.scrollTo = function () {};
if (!win.Element.prototype.scrollIntoView) win.Element.prototype.scrollIntoView = function () {};
if (!win.navigator.vibrate) win.navigator.vibrate = () => true;
if (!win.navigator.getGamepads) win.navigator.getGamepads = () => [];
if (!win.navigator.clipboard) win.navigator.clipboard = { writeText: async () => {} };
if (!win.document.fullscreenElement) {
  Object.defineProperty(win.document, 'fullscreenElement', { get: () => null, configurable: true });
}
win.Element.prototype.requestFullscreen = function () { return Promise.resolve(); };
win.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
win.HTMLMediaElement.prototype.pause = function () {};
win.HTMLMediaElement.prototype.load = function () {};
win.HTMLCanvasElement.prototype.getContext = function () { return null; };
// Sieć: relay/pad łączy się przez WebSocket. W teście nie ma dokąd — cicha atrapa,
// żeby brak sieci nie udawał błędu aplikacji.
win.WebSocket = class { constructor() { this.readyState = 3 } send() {} close() {} addEventListener() {} removeEventListener() {} };
globalThis.WebSocket = win.WebSocket;

class AudioNodeStub {
  connect() { return this } disconnect() {} start() {} stop() {}
  get destination() { return new AudioNodeStub() } get currentTime() { return 0 } get sampleRate() { return 44100 }
  get frequency() { return { setValueAtTime() {}, value: 0 } }
  get gain() { return { setValueAtTime() {}, linearRampToValueAtTime() {}, value: 0 } }
  get Q() { return { value: 0 } } get pan() { return { value: 0 } } get buffer() { return null }
  createOscillator() { return new AudioNodeStub() } createGain() { return new AudioNodeStub() }
  createBiquadFilter() { return new AudioNodeStub() } createStereoPanner() { return new AudioNodeStub() }
  createConvolver() { return new AudioNodeStub() } createDynamicsCompressor() { return new AudioNodeStub() }
  createBuffer() { return { getChannelData: () => new Float32Array(1), length: 1, sampleRate: 44100 } }
  createBufferSource() { return new AudioNodeStub() } close() { return Promise.resolve() } resume() { return Promise.resolve() }
}
for (const key of ['AudioContext', 'webkitAudioContext']) { win[key] = AudioNodeStub; globalThis[key] = AudioNodeStub }

/* --- 2. Zbieranie błędów -------------------------------------------------- */

const uncaught = [];
/** Szum samego środowiska testowego (React `act`) — raportowany, ale nie liczy się jako błąd. */
const consoleNotes = [];
process.on('unhandledRejection', reason => uncaught.push(`unhandledRejection: ${reason?.message ?? reason}`));
win.addEventListener('error', event => uncaught.push(`window.error: ${event.message}`));
win.addEventListener('unhandledrejection', event => uncaught.push(`window.unhandledrejection: ${event.reason?.message ?? event.reason}`));
const realError = console.error;
const testHarnessNoise = /not wrapped in act|suspended resource finished loading/i;
console.error = (...args) => {
  const first = String(args[0] ?? '');
  if (testHarnessNoise.test(first)) { consoleNotes.push(first.slice(0, 120)); realError(...args); return }
  uncaught.push(`console.error: ${first.slice(0, 240)}`);
  realError(...args);
};

/* --- 3. Aplikacja przez pipeline Vite ------------------------------------ */

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { createServer } = await import('vite');
const here = fileURLToPath(new URL('.', import.meta.url));
const server = await createServer({
  configFile: 'vite.config.ts',
  // Sieć i rasteryzacja QR to nie jest przedmiot tego testu — patrz `ui-smoke-peer.mjs`.
  resolve: { alias: { peerjs: here + 'ui-smoke-peer.mjs', qrcode: here + 'ui-smoke-qr.mjs' } },
  server: { middlewareMode: true },
  appType: 'custom',
  logLevel: 'silent',
});

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const settle = async ms => { await React.act(async () => { await sleep(ms) }); };

/** Czeka na WARUNEK, nie na zegar: ekrany i chunki ładowane leniwie (`lazy`)
 *  dochodzą po starcie, a sztywne opóźnienie czyniło test zależnym od szybkości maszyny. */
async function waitFor(predicate, { timeout = 8000, tick = 100, label = 'warunek' } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await settle(tick);
  }
  fail(`nie doczekałem się: ${label}`);
  return false;
}
const bodyText = () => (win.document.body.textContent ?? '').replace(/\s+/g, ' ');
const buttons = () => [...win.document.querySelectorAll('button, a')];
const openDialog = () => win.document.querySelector('dialog[open]');
const filmish = () => win.document.querySelectorAll('[class*="film-"]').length;

function findButton(matcher) {
  return buttons().find(button => matcher(button));
}
async function click(matcher) {
  const button = findButton(matcher);
  if (!button) return null;
  await React.act(async () => {
    button.dispatchEvent(new win.MouseEvent('click', { bubbles: true }));
  });
  return button;
}
const labelled = (button, label) => button.getAttribute('aria-label') === label;
const says = text => button => (button.textContent ?? '').includes(text);

async function run(name, fn) {
  step = name;
  const before = uncaught.length;
  try {
    await fn();
  } catch (error) {
    fail(`wyjątek testu: ${error?.message ?? error}`);
  }
  const fresh = uncaught.length - before;
  STEPS.push(`${fresh === 0 ? 'OK  ' : 'BŁĄD'}  ${name}`);
}

/* --- 4. Ścieżka pierwszego uruchomienia ---------------------------------- */

const { default: JoypadApp } = await server.ssrLoadModule('/src/arcade/JoypadApp.tsx');
// `main.tsx` ustawia profil ekranu przed pierwszym renderem; harness musi zrobić to samo,
// bo uruchamia samą aplikację, bez wejścia produkcyjnego.
const { installViewportProfile } = await server.ssrLoadModule('/src/console/viewport.ts');
installViewportProfile();
const container = win.document.getElementById('root');
const root = createRoot(container, { onUncaughtError: error => uncaught.push(`React (nieprzechwycony): ${error?.message ?? error}`) });

await run('start: splash i biblioteka', async () => {
  await React.act(async () => { root.render(React.createElement(JoypadApp)) });
  await settle(3400);
  if (!bodyText().includes('JOYPAD')) fail('brak nagłówka aplikacji po starcie');
  if (container.childElementCount === 0) fail('puste drzewo interfejsu po starcie');
  // Profil ekranu zapisuje się PRZED pierwszym renderem — bez niego TV mrugnąłby desktopem.
  const profile = win.document.documentElement.dataset.profile;
  if (!profile) fail('brak profilu ekranu na <html data-profile>');
  else if (!['tv', 'desktop', 'tablet', 'handheld'].includes(profile)) fail(`nieznany profil ekranu: „${profile}”`);
  // Biblioteka jest dopasowywana do okna przez `FitScreen` — bez tej ramki treść wraca
  // do sztywnej wysokości i elementy nachodzą na siebie (zgłoszenie użytkownika).
  const frame = win.document.querySelector('.fit-frame');
  if (!frame) fail('biblioteka nie jest objęta ramką dopasowania do okna (.fit-frame)');
  else if (!frame.querySelector('.fit-scale .os-library')) fail('treść biblioteki nie siedzi w skalowanym obszarze');
});

await run('pierwsze uruchomienie: pytanie o poradnik', async () => {
  const asked = await waitFor(() => /Chcesz zobaczyć krótki poradnik/.test(bodyText()), {
    timeout: 10000, label: 'ekran powitalny (leniwy chunk)',
  });
  if (!asked) return;
  const yes = await click(button => /^Tak/.test((button.textContent ?? '').trim()) && says('poradnik')(button));
  if (!yes) { fail('brak przycisku „Tak, pokaż poradnik”'); return }
  if (!await waitFor(() => filmish() > 10, { label: 'otwarcie filmu po „Tak”' })) return;
  await React.act(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) });
  if (!await waitFor(() => filmish() === 0, { label: 'zamknięcie filmu po „Esc”' })) return;
  // Po filmie biblioteka SAMA otwiera „Co nowego?” na pierwszym uruchomieniu (nowa wersja
  // = nowe wieści). To zachowanie zamierzone — zamykamy okno, żeby dalej klikać po bibliotece.
  if (openDialog()) {
    const closed = await click(button => labelled(button, 'Zamknij') || says('Do biblioteki')(button));
    if (!closed) { fail('nie znalazłem sposobu na zamknięcie okna „Co nowego?”'); return }
    if (!await waitFor(() => !openDialog(), { timeout: 4000, label: 'zamknięcie „Co nowego?”' })) return;
  }
});

await run('biblioteka: okna systemowe', async () => {
  const panels = [
    ['Ustawienia systemu', button => labelled(button, 'Ustawienia systemu')],
    ['Pokój', button => (button.textContent ?? '').trim().startsWith('Pokój')],
    ['Galeria Moments', button => labelled(button, 'Galeria Moments')],
    ['Co nowego?', button => says('Co nowego?')(button)],
    ['Zapowiedzi', button => /^Zapowiedzi/.test((button.textContent ?? '').trim())],
    ['Jak zacząć?', button => says('Jak zacząć?')(button)],
  ];
  for (const [name, matcher] of panels) {
    const opened = await click(matcher);
    if (!opened) { fail(`nie znalazłem przycisku „${name}”`); continue }
    if (!await waitFor(() => openDialog(), { timeout: 3000, label: `otwarcie okna „${name}”` })) continue;
    // Arkusz systemowy MUSI być poza skalowaną treścią: `position: fixed` wewnątrz
    // transformowanego rodzica nie przykleja się do okna (byłby pomniejszony razem z treścią).
    const dialog = openDialog();
    if (dialog?.closest('.fit-scale')) { fail(`okno „${name}” siedzi w skalowanej treści — nie przyklei się do okna`); continue }
    const closed = await click(button => labelled(button, 'Zamknij'));
    if (!closed) { fail(`okno „${name}” nie ma przycisku zamknięcia`); continue }
    if (!await waitFor(() => !openDialog(), { timeout: 3000, label: `zamknięcie okna „${name}”` })) continue;
  }
});

await run('poradnik z okna „Jak zacząć?”', async () => {
  if (!await click(says('Jak zacząć?'))) { fail('brak okna pomocy'); return }
  await settle(500);
  const play = await click(says('Obejrzyj poradnik'));
  if (!play) { fail('w pomocy nie ma wejścia do poradnika'); return }
  if (!await waitFor(() => filmish() > 10, { label: 'film z okna pomocy' })) return;
  await React.act(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) });
  if (!await waitFor(() => filmish() === 0, { label: 'zamknięcie filmu z pomocy' })) return;
});

await run('poradnik z Ustawień §06', async () => {
  // Trzecie wejście (obok pomocy i stopki) — użytkownik prosił wprost o powtórkę poradnika.
  if (!await click(button => labelled(button, 'Ustawienia systemu'))) { fail('brak przycisku „Ustawienia systemu”'); return }
  if (!await waitFor(() => openDialog(), { timeout: 3000, label: 'otwarcie ustawień' })) return;
  const play = await click(says('Odtwórz poradnik'));
  if (!play) { fail('w ustawieniach §06 nie ma odtwarzania poradnika'); return }
  if (!await waitFor(() => filmish() > 10, { label: 'film z ustawień' })) return;
  await React.act(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) });
  if (!await waitFor(() => filmish() === 0, { label: 'zamknięcie filmu z ustawień' })) return;
});

await run('poradnik ze stopki biblioteki', async () => {
  const play = await click(button => (button.textContent ?? '').trim() === 'Poradnik');
  if (!play) { fail('w stopce nie ma przycisku „Poradnik”'); return }
  if (!await waitFor(() => filmish() > 10, { label: 'film ze stopki' })) return;
  if (!await waitFor(() => win.document.querySelectorAll('[class*="film-chapter"]').length > 0, { timeout: 2000, label: 'pasek rozdziałów' })) return;
  await React.act(async () => { win.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })) });
  await waitFor(() => filmish() === 0, { label: 'zamknięcie filmu ze stopki' });
});

await run('biblioteka działa po powrocie z filmu', async () => {
  await waitFor(() => says('Stalowy Front')(win.document.body), { timeout: 3000, label: 'powrót biblioteki po filmie' });
  const tile = buttons().find(button => button.hasAttribute('data-game-index'));
  if (!tile) fail('brak kafli gier w bibliotece');
});

/* --- 5. Wynik ------------------------------------------------------------- */

await server.close();
console.log('\n=== TEST DYMNY INTERFEJSU ===');
for (const line of STEPS) console.log('  ' + line);
if (notes.length) console.log(`\n(atrapy jsdom: ${notes.join(', ')})`);
if (consoleNotes.length) console.log(`(szum środowiska testowego: ${consoleNotes.length} ostrzeżeń Reacta o „act” — nie liczą się jako błędy)`);
if (uncaught.length) {
  console.log('\nZEBRANE BŁĘDY:');
  for (const problem of uncaught.slice(0, 12)) console.log('  • ' + problem);
}
if (PROBLEMS.length) {
  console.log('\nNIEZDANE KROKI:');
  for (const problem of PROBLEMS) console.log('  • ' + problem);
}
const failed = PROBLEMS.length + uncaught.length;
console.log(failed === 0 ? '\nUI SMOKE: OK (wszystkie ekrany bez błędów)' : `\nUI SMOKE: ${failed} problem(ów)`);
process.exit(failed === 0 ? 0 : 1);
