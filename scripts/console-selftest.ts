import { readChoice, remember, lastGame, hasHistory } from '../src/console/history';
import { sessionSummary } from '../src/console/sessionSummary';
/** Hardware-independent regression tests for the console layer. */
import assert from 'node:assert/strict';
import { sanitizePreferences, setPreferences, getPreferences } from '../src/console/preferences';
import { nextPlayable, playableIndices } from '../src/console/navigation';
import { GAMES } from '../src/arcade/catalog';
import { COLORS } from '../src/arcade/runtime';
import { PLAYER_DEFS } from '../src/game/types';
import { getHapticStatus, haptic, unlockHaptics } from '../src/pad/haptics';

assert.equal(sanitizePreferences({ controlSize: Infinity }).controlSize, 1);
assert.equal(sanitizePreferences({ controlSize: 4, controlHeight: -5 }).controlSize, 1.2);
assert.equal(sanitizePreferences({ controlSize: .1, controlHeight: 200 }).controlHeight, 64);
assert.equal(sanitizePreferences({ controlSize: .1 }).controlSize, .8);
assert.equal(sanitizePreferences({}).motion, 'system');
setPreferences({ hand: 'left', haptics: 'off' });
assert.equal(getPreferences().hand, 'left');
assert.equal(getPreferences().haptics, 'off');
assert.ok(playableIndices.length > 0);
assert.ok(playableIndices.every(i => !GAMES[i].wip));
assert.equal(nextPlayable(playableIndices.at(-1)!, 1), playableIndices[0]);
assert.equal(nextPlayable(playableIndices[0], -1), playableIndices.at(-1));
assert.deepEqual(COLORS, PLAYER_DEFS.map(p => p.color), 'TV, phone and games share player colors');

const pulses: (number | number[])[] = [];
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { vibrate: (pattern: number | number[]) => { pulses.push(pattern); return true; } } });
const actualNow = Date.now;
let now = 1000;
Date.now = () => now;
try {
  assert.equal(unlockHaptics(), 'ready');
  assert.equal(pulses.at(-1), 0, 'unlock must not vibrate with preference off');
  assert.equal(haptic(20), false);
  setPreferences({ haptics: 'subtle' });
  now += 100;
  assert.equal(haptic([80, 30, 80], 2), true);
  assert.deepEqual(pulses.at(-1), [40, 30, 40]);
  now += 60;
  assert.equal(haptic(12, 0), false, 'navigation cannot interrupt a damage pulse');
  now += 100;
  assert.equal(haptic(12, 0), true);
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {} });
  assert.equal(getHapticStatus(), 'unsupported');
  assert.equal(haptic(12), false);
} finally { Date.now = actualNow; }
console.log('CONSOLE SELFTEST: OK (preferences, navigation, colors, haptic priority and fallback)');

// Theme regression: system copy and action labels must remain readable after recoloring.
const { readFileSync } = await import('node:fs');
const paletteCss = readFileSync('src/console/palette.css', 'utf8');
const palette = Object.fromEntries([...paletteCss.matchAll(/--os-([\w-]+):\s*(#[\da-f]{6});/g)].map(match => [match[1], match[2]]));
function luminance(hex: string) {
  const channels = [1, 3, 5].map(at => {
    const c = parseInt(hex.slice(at, at + 2), 16) / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function contrast(foreground: string, background: string) {
  const a = luminance(palette[foreground]), b = luminance(palette[background]);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
assert.ok(contrast('text', 'bg') >= 7);
assert.ok(contrast('secondary', 'panel') >= 4.5);
assert.ok(contrast('muted', 'panel') >= 4.5);
assert.ok(contrast('on-accent', 'accent') >= 7);
assert.ok(contrast('accent', 'panel') >= 4.5);
console.log('PALETTE SELFTEST: OK (text, secondary copy, muted copy, actions and focus accent contrast)');

// Lobby reports connection, never an invented ready vote or a network requirement for local play.
assert.equal(sessionSummary(0, false).status, 'Klawiatura dostępna');
assert.match(sessionSummary(0, false).pairing, /klawiaturze/);
assert.match(sessionSummary(0, true).pairing, /Zeskanuj/);
assert.equal(sessionSummary(2, true).status, '2/4 padów połączonych');
assert.equal(sessionSummary(2, false).invite, 'Dodaj kolejny pad');
assert.equal(sessionSummary(4, true).invite, 'Zarządzaj padami');
assert.equal(sessionSummary(0, true).invite, 'Zaproś telefon');
console.log('SESSION SELFTEST: OK (local, connecting, paired, full and disconnected lobby)');

// Zaproszenie na telewizorze: widoczność kodu to decyzja administratora, nie efekt uboczny połączeń.
const { pairingMode } = await import('../src/console/pairingOffer');
const { DEFAULT_ROOM } = await import('../src/net/protocol');
assert.equal(DEFAULT_ROOM.pairing, true, 'domyślnie QR zostaje na ekranie');
assert.equal(pairingMode(true, true), 'qr');
assert.equal(pairingMode(false, true), 'connecting', 'bez serwera pokazujemy oczekiwanie, nie pusty kadr');
assert.equal(pairingMode(true, false), 'hidden', 'ukryty kod to ukryty kod');
console.log('PAIRING SELFTEST: OK (qr, waiting and admin-hidden states)');

// Morfing okienka: liczymy go z realnych kadrów, ale matematyka jest czysta — testujemy ją osobno.
const { windowFlip } = await import('../src/console/windowFlip');
const sheet = { left: 500, top: 180, width: 530, height: 420 };
const fromPill = windowFlip({ x: 700, y: 40, w: 120, h: 44 }, sheet);
assert.equal(fromPill.skip, false);
assert.ok(fromPill.sx > 0 && fromPill.sx <= 1 && fromPill.sy > 0 && fromPill.sy <= 1, 'okienko tylko wyrasta z pigułki, nigdy nie jest od niej większe');
assert.equal(fromPill.dx, 700 - (500 + 265));
assert.equal(fromPill.dy, 40 - (180 + 210));
assert.ok(fromPill.radius >= 8 && fromPill.radius <= 400, 'startowy promień mieści się w kapsułce');
assert.equal(windowFlip(null, sheet).skip, true, 'bez kliknięcia nie ma morfingu — gra wniknięcie');
assert.equal(windowFlip({ x: 0, y: 0, w: 0, h: 0 }, sheet).skip, true, 'niewidoczny przycisk to nie punkt startowy');
assert.equal(windowFlip({ x: 765, y: 390, w: 530, h: 420 }, sheet).skip, true, 'okienko tej samej wielkości nie musi się skalować');
const clipped = windowFlip({ x: 2, y: 2, w: 2, h: 2 }, sheet);
assert.ok(clipped.sx >= 0.04 && clipped.sy >= 0.04, 'skrajnie mały punkt startowy nie wolno zniknąć');
console.log('FLIP SELFTEST: OK (skale, przesunięcia, promień i wypadki braku punktu startowego)');

// Sam tracker: musi złapać klikanie w fazie przechwytywania i policzyć kadr zanim React przebuduje drzewo.
{
  const captured: Array<{ type: string; capture: boolean }> = [];
  const handlers = new Map<string, (event: { target: unknown }) => void>();
  class FakeRect {
    constructor(private box: { left: number; top: number; width: number; height: number }) {}
    getBoundingClientRect() { return { ...this.box, right: this.box.left + this.box.width, bottom: this.box.top + this.box.height }; }
  }
  class FakeButton extends FakeRect { closest() { return this; } }
  class FakeImage extends FakeRect { closest() { return null; } }
  const FakeElement = FakeButton;
  Object.defineProperty(globalThis, 'Element', { configurable: true, value: FakeElement });
  Object.defineProperty(globalThis, 'document', { configurable: true, value: {
    addEventListener: (type: string, handler: (event: { target: unknown }) => void, capture: boolean) => {
      captured.push({ type, capture: !!capture }); handlers.set(type, handler);
    },
  } });
  const { installWindowOriginTracker, takeWindowOrigin } = await import('../src/console/windowOrigin');
  installWindowOriginTracker();
  installWindowOriginTracker();
  assert.deepEqual(captured.map(entry => entry.type), ['pointerdown', 'click', 'keydown'], 'tracker rejestruje się dokładnie raz');
  assert.ok(captured.every(entry => entry.capture), 'kadr musi być liczony w fazie przechwytywania');
  const click = handlers.get('click')!;
  const realNow = Date.now;
  let clock = 10_000;
  Date.now = () => clock;
  try {
    click({ target: new FakeButton({ left: 640, top: 18, width: 120, height: 44 }) });
    assert.deepEqual(takeWindowOrigin(), { x: 700, y: 40, w: 120, h: 44 }, 'środek przycisku jest punktem startowym okienka');
    assert.deepEqual(takeWindowOrigin(), { x: 700, y: 40, w: 120, h: 44 }, 'podwójny montaż w StrictMode musi animować dokładnie tak samo jak produkcja');
    clock += 900;
    assert.equal(takeWindowOrigin(), null, 'po chwili kadr gaśnie — następne okienko nie może wyrosnąć z cudzego przycisku');
  } finally { Date.now = realNow; }
  click({ target: new FakeImage({ left: 0, top: 0, width: 640, height: 360 }) });
  assert.equal(takeWindowOrigin(), null, 'klik w okładkę gry nie otwiera okienka i nie zostawia śladu');
  click({ target: new FakeButton({ left: 0, top: 0, width: 0, height: 0 }) });
  assert.equal(takeWindowOrigin(), null, 'zero-wymiarowy cel nie jest animowalny');
  handlers.get('keydown')!({ target: undefined });
  delete (globalThis as { document?: unknown }).document;
  delete (globalThis as { Element?: unknown }).Element;
}
console.log('WINDOW ORIGIN SELFTEST: OK (jeden nasłuch, faza przechwytująca, środek przycisku, odporność na fałszywe cele)');

const historyStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => historyStorage.get(key) ?? null,
  setItem: (key: string, value: string) => historyStorage.set(key, value),
} });
assert.equal(hasHistory(), false);
remember('game', 'race'); assert.equal(lastGame(), 'race'); assert.equal(hasHistory(), true);
remember('game', 'snake'); assert.equal(lastGame(), 'snake'); assert.equal(hasHistory(), true);
remember('race.primary', 2); assert.equal(readChoice('race.primary', [0, 1, 2], 1), 2);
remember('race.primary', 99); assert.equal(readChoice('race.primary', [0, 1, 2], 1), 1);
historyStorage.set('joypad.evening.race.primary', '{broken'); assert.equal(readChoice('race.primary', [0, 1, 2], 1), 1);
Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('blocked'); } });
assert.doesNotThrow(() => remember('game', 'race'));
assert.equal(lastGame(), 'orbit'); assert.equal(hasHistory(), false);
console.log('EVENING SELFTEST: OK (persistence, invalid values, unavailable games and blocked storage)');

// Quiet cues do not pile up; a significant cue replaces navigation and mute wins.
const { systemSound } = await import('../src/console/sound');
let tones = 0; let stops = 0;
Object.defineProperty(globalThis, 'window', { configurable: true, value: globalThis });
Object.defineProperty(globalThis, 'location', { configurable: true, value: { hash: '' } });
Object.defineProperty(globalThis, 'AudioContext', { configurable: true, value: class {
  state = 'running'; currentTime = 0; destination = {};
  resume() { return Promise.resolve(); }
  createOscillator() { tones++; return { type: '', frequency: { setValueAtTime() {} }, connect() {}, disconnect() {}, start() {}, stop() { stops++; }, onended: null }; }
  createGain() { return { gain: { setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {}, disconnect() {} }; }
} });
setPreferences({ sound: true });
systemSound('move'); systemSound('move'); assert.equal(tones, 1);
systemSound('join'); assert.equal(tones, 4); assert.ok(stops >= 5);
systemSound('move'); assert.equal(tones, 4);
setPreferences({ sound: false }); systemSound('finish'); assert.equal(tones, 4);
console.log('SOUND SELFTEST: OK (throttling, priority, overlap prevention and mute)');
assert.equal(sanitizePreferences({ deviceProfile: 'ios', deviceChosen: true }).deviceProfile, 'ios');
assert.equal(sanitizePreferences({ deviceProfile: 'invalid' } as unknown as Parameters<typeof sanitizePreferences>[0]).deviceProfile, 'auto');
assert.equal(sanitizePreferences({}).deviceChosen, false);
const { readinessText } = await import('../src/console/sessionSummary');
assert.match(readinessText([{ nick: 'Ada', ready: true }, { nick: 'Ola' }]), /Gotowi: Ada.*Czekamy na: Ola/);
assert.match(readinessText([{ nick: 'Ada', ready: true }]), /Cała ekipa gotowa/);
console.log('DEVICE PROFILE SELFTEST: OK (selection, defaults, readiness names)');

assert.equal(sanitizePreferences({}).previews, true);
assert.equal(sanitizePreferences({ previews: false }).previews, false);
const { existsSync, statSync } = await import('node:fs');
/** Full HD masters are the point of the previews: never let them shrink back to a small upscale. */
const previewWidth = 1920, previewHeight = 1080;
const mp4Size = (buffer: Buffer) => {
  const stsd = buffer.indexOf('stsd');
  const entry = stsd < 0 ? -1 : buffer.indexOf('avc1', stsd + 16);
  return entry < 0 ? null : [buffer.readUInt16BE(entry + 28), buffer.readUInt16BE(entry + 30)];
};
// Lista tytułów z podglądem należy do `GamePreview`, a brama porównuje ją z katalogiem:
// każdy grywalny tytuł ma mieć swój urywek botów, żaden `wip` nie ma prawa go żądać.
const previewSource = readFileSync('src/console/GamePreview.tsx', 'utf8');
const previewGames = [...(previewSource.match(/export const PREVIEW_GAMES = \[([^\]]*)\]/)?.[1] ?? '')
  .matchAll(/'([a-z-]+)'/g)].map(match => match[1]);
const { GAMES: previewCatalog } = await import('../src/arcade/catalog');
for (const game of previewCatalog.filter(entry => !entry.wip)) {
  assert.ok(previewGames.includes(game.id), `${game.id}: grywalny tytuł bez nagrania botów w PREVIEW_GAMES`);
}
assert.ok(previewGames.every(id => previewCatalog.some(game => game.id === id)),
  'PREVIEW_GAMES wskazuje tytuł spoza katalogu');
/**
 * Nagrania powstają w CI (`.github/workflows/previews.yml`) — tam jest Chromium i ffmpeg.
 * Workflow dowiezł komplet (runda 21: `snake`, `league`, `pizza` obok `tanks`, `race`,
 * `orbit`), więc lista oczekujących jest PUSTA i od tej pory brama pilnuje całości:
 * każdy grywalny tytuł z `PREVIEW_GAMES` musi mieć parę mp4+webm w natywnym Full HD.
 * Wpis trafia tu tylko wtedy, gdy nagranie celowo czeka na CI w tej samej rundzie.
 */
const awaitingRecording = new Set<string>([]);
let previewBytes = 0;
const pending: string[] = [];
for (const id of previewGames) {
  const present = (['mp4', 'webm'] as const).filter(extension => existsSync(`public/previews/${id}.${extension}`));
  // Para formatów jest całością: przeglądarka wybiera jedną, więc połowa pary to błąd nagrania.
  assert.ok(present.length === 0 || present.length === 2,
    `public/previews/${id}: mp4 i webm muszą istnieć razem (jest: ${present.join(', ') || 'nic'})`);
  if (present.length === 0) { pending.push(id); continue; }
  for (const extension of present) {
    const path = `public/previews/${id}.${extension}`;
    const bytes = statSync(path).size;
    assert.ok(bytes > 100_000 && bytes < 12_000_000, `${path}: bounded, nonempty Full HD clip`);
    previewBytes += bytes;
    const buffer = readFileSync(path);
    if (extension === 'mp4') {
      assert.equal(buffer.subarray(4, 8).toString('ascii'), 'ftyp');
      assert.deepEqual(mp4Size(buffer), [previewWidth, previewHeight], `${path}: native Full HD track`);
    } else {
      assert.equal(buffer.subarray(0, 4).toString('hex'), '1a45dfa3');
    }
  }
}
// Trzy pierwsze mastery są w repo od dawna: ich zniknięcie to regresja, nie „jeszcze nie nagrane”.
for (const id of ['tanks', 'race', 'orbit']) {
  assert.ok(!pending.includes(id), `public/previews/${id}: nagranie zniknęło z repo`);
}
const unexpected = pending.filter(id => !awaitingRecording.has(id));
assert.deepEqual(unexpected, [], `public/previews: brak nagrań i brak ich na liście oczekujących`);
assert.ok(previewBytes < 60_000_000, 'compressed library preview asset budget');
console.log(`PREVIEW SELFTEST: OK (preferences, ${previewGames.length - pending.length}/${previewGames.length} Full HD recordings${pending.length ? `, w CI nagrywają się: ${pending.join(', ')}` : ''}, MP4/WebM headers and asset budget)`);

/* --- Warstwa „liquid glass": martwe selektory, tokeny powierzchni i czytelność ---
   Testy trzymają trzy rzeczy, na których polega nowy styl: każdy selektor dociera do
   prawdziwego markupu, każde tło/idzie przez token (żeby fallbacki działały centralnie)
   oraz tekst na szkle nadal ma kontrast nad jasną klatką gry. */
const { readdirSync, statSync: glassStat } = await import('node:fs');
const liquidPath = 'src/console/liquid.css';
const liquidCss = readFileSync(liquidPath, 'utf8');
const consoleCss = readFileSync('src/console/console.css', 'utf8');
const projectFiles: string[] = [];
(function walk(dir: string) {
  for (const entry of readdirSync(dir)) {
    const full = `${dir}/${entry}`;
    if (glassStat(full).isDirectory()) { if (entry !== 'node_modules') walk(full); }
    else if (/\.(tsx|ts|css)$/.test(entry) && full !== liquidPath) projectFiles.push(full);
  }
})('src');
const markup = projectFiles.map(file => readFileSync(file, 'utf8')).join('\n');
const selectors = [...liquidCss.matchAll(/[^{};]*\{/g)].map(match => match[0]);
const usedClasses = new Set<string>();
for (const prelude of selectors) for (const name of prelude.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g)) usedClasses.add(name[1]);
assert.ok(usedClasses.size > 40, `glass layer styles a real surface set (${usedClasses.size} classes)`);
const dead = [...usedClasses].filter(name => !markup.includes(name));
assert.deepEqual(dead, [], `każda klasa w liquid.css musi oznaczać istniejący element: ${dead.join(', ')}`);
for (const className of ['lg-card', 'lg-pill', 'lg-window', 'lg-sheen', 'lg-enter']) {
  assert.ok(liquidCss.includes(`.${className}`) && markup.includes(className), `.${className} jest zdefiniowane i użyte`);
}

// Zostawiamy same bloki deklaracji: nagłówki @supports/@media i selektory :root nie są
// powierzchniowymi deklaracjami, więc nie mogą przechodzić tej kontroli.
const glassBody = liquidCss.replace(/[^{}]*\{/g, '{').replace(/\}/g, '');
assert.ok(!/backdrop-filter:\s*blur\(/.test(glassBody), 'każde rozmycie bierze się z tokenu --lg-glass, inaczej fallback @supports go nie obejmie');
assert.ok(!/background-color:\s*#[0-9a-fA-F]{8}/.test(glassBody), 'tła powierzchni idą przez --lg-base/--lg-fill/--lg-scrim, żeby tryb bez przezroczystości je podmienił');
assert.ok(!/animation:[^;]*infinite/.test(liquidCss), 'warstwa systemu nie zapętla ruchu dekoracyjnego');
const reducedBlock = liquidCss.slice(liquidCss.indexOf('@media(prefers-reduced-motion: reduce)'), liquidCss.indexOf('html[data-motion="reduced"] :is('));
assert.ok(/\.joy-toast/.test(reducedBlock) && /dialog\.os-sheet/.test(reducedBlock) && /\.os-game-tile\.is-selected::after/.test(reducedBlock), 'meniscus, toast i okienko muszą mieć wyłączony ruch');
assert.ok(/lg-morph-in/.test(reducedBlock) && /lg-morph-out/.test(reducedBlock), 'morfing okienka musi mieć wyłączony ruch razem z resztą warstwy');

function cssBlockFrom(marker: string) {
  const start = liquidCss.indexOf(marker);
  assert.ok(start > 0, `blok fallbacku ${marker} istnieje`);
  return liquidCss.slice(start, liquidCss.indexOf('\n}', start));
}
const tokens = ['--lg-base', '--lg-base-strong', '--lg-fill', '--lg-scrim', '--lg-glass', '--lg-glass-soft', '--lg-glass-hud', '--lg-field', '--lg-field-focus'];
const noBackdrop = cssBlockFrom('@supports not ((backdrop-filter');
const flatGlass = cssBlockFrom('@media(prefers-reduced-transparency: reduce)');
for (const token of tokens) {
  assert.ok(noBackdrop.includes(`${token}:`), `${token} musi mieć wartość bez backdrop-filter`);
  assert.ok(flatGlass.includes(`${token}:`), `${token} musi mieć wartość przy ograniczonej przezroczystości`);
}

// Pierwsza deklaracja tokenu = wartość bazowa (media query tylko wzmacnia szkło).
const lgTokens: Record<string, string> = {};
for (const match of liquidCss.matchAll(/(--lg-[\w-]+):\s*([^;]+);/g)) lgTokens[match[1]] ??= match[2].trim();
function glassRgba(color: string): [number, number, number, number] {
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16), full.length >= 8 ? parseInt(full.slice(6, 8), 16) / 255 : 1];
}
function glassOver(color: string, background: [number, number, number]): [number, number, number] {
  const [r, g, b, a] = glassRgba(color);
  return [r * a + background[0] * (1 - a), g * a + background[1] * (1 - a), b * a + background[2] * (1 - a)];
}
function glassLuma(color: string, overBackground: [number, number, number]) {
  const channels = glassOver(color, overBackground).map(channel => {
    const c = channel / 255;
    return c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4;
  });
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
function glassContrast(foreground: string, surface: string, backdrop: [number, number, number]) {
  const a = glassLuma(foreground, [0, 0, 0]);
  const b = glassLuma(surface, backdrop);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
// Najgorszy realistyczny spód: jasna klatka rozgrywki przyciemniona przez --lg-bright.
const litFrame: [number, number, number] = [140, 140, 140].map(channel => Math.round(channel * Number(lgTokens['--lg-bright']))) as [number, number, number];
for (const surface of ['--lg-base', '--lg-base-strong', '--lg-fill', '--lg-field']) {
  const value = lgTokens[surface];
  assert.ok(/^#[0-9a-f]{8}$/i.test(value), `${surface} musi być jawnym tłem z kanałem alfa: ${value}`);
  assert.ok(glassContrast(palette.text, value, litFrame) >= 7, `tekst na ${surface} musi trzymać 7:1 nad jasną areną`);
  assert.ok(glassContrast(palette.secondary, value, litFrame) >= 4.5, `kopie drugorzędne na ${surface} muszą trzymać 4,5:1`);
  const fallback = noBackdrop.match(new RegExp(`${surface}:\\s*(#[0-9a-f]{6,8})`))?.[1];
  assert.ok(fallback && glassContrast(palette.text, fallback, litFrame) >= 7, `${surface} w fallbacku bez backdrop-filter musi być czytelny`);
  const flat = flatGlass.match(new RegExp(`${surface}:\\s*(#[0-9a-f]{6,8})`))?.[1];
  assert.ok(flat && glassContrast(palette.text, flat, litFrame) >= 7, `${surface} przy ograniczonej przezroczystości musi być czytelny`);
}
console.log(`LIQUID GLASS SELFTEST: OK (${usedClasses.size} selektorów powierzchni, tokeny szkła, fallbacki i kontrast tekstu na szkle)`);

/* --- Sterowanie padem: ruch po interfejsie, X/Y i pełny ekran -------------
   Silnik interfejsu jest tu po to, żeby pad, klawiatura i pilot telefoniczny szli
   tą samą drogą. Testy pilnują liczb (martwa strefa, rytm powtórzeń, wybór celu),
   stosu skrótów kontekstowych i tego, że w projekcie jest JEDNA nawigacja. */
const nav = await import('../src/console/spatialNav');
assert.equal(nav.stickDirection(0, .3), null, 'lekko odchylona gałka to wciąż bezruch');
assert.equal(nav.stickDirection(0, -.9), 'up');
assert.equal(nav.stickDirection(.9, .2), 'right', 'oś dominująca decyduje, nie wartość bezwzględna suma');
assert.equal(nav.stickDirection(-.8, -.85), 'up', 'przekątna idzie osią, na której dalej zajechaliśmy');
assert.equal(nav.stickDirection(NaN, Infinity), null, 'brud z Gamepad API nie rusza kursora');
assert.equal(nav.stickDirection(0, .9, .95), null, 'próg można podnieść dla padów z luzem na środku');
assert.equal(nav.shouldStep(0, 0), true, 'samo naciśnięcie to zawsze jeden krok');
assert.equal(nav.shouldStep(120, 120), false, 'krótkie przytrzymanie nie powtarza');
assert.equal(nav.shouldStep(nav.NAV_REPEAT.firstMs, nav.NAV_REPEAT.stepMs), true);
assert.equal(nav.shouldStep(nav.NAV_REPEAT.rushMs + 500, nav.NAV_REPEAT.stepMs * .62), true, 'po rozbiegu krok jest gęstszy');
assert.equal(nav.shouldStep(nav.NAV_REPEAT.rushMs + 500, nav.NAV_REPEAT.stepMs * .62 - 1), false);
assert.ok(nav.NAV_REPEAT.deadZone > .2 && nav.NAV_REPEAT.deadZone < .5, 'martwa strefa ani za mała, ani drewniana');
assert.ok(nav.NAV_REPEAT.firstMs > 300 && nav.NAV_REPEAT.stepMs < 200, 'rytm musi być czytelny na telewizorze');

const row = [0, 1, 2, 3].map(index => ({ index, left: 100 + index * 120, top: 200, width: 100, height: 60, group: 1 }));
assert.equal(nav.pickNext(row[1], row, 'right'), 2, 'w rzędzie jedziemy do następnego kafelka');
assert.equal(nav.pickNext(row[3], row, 'right'), null, 'na końcu rzędu nie ma dokąd — decyduje wywołujący');
const grid = [...row, { index: 10, left: 40, top: 320, width: 90, height: 60, group: 2 }, { index: 11, left: 340, top: 300, width: 90, height: 90, group: 2 }];
assert.equal(nav.pickNext(row[1], grid, 'down'), 11, 'w dół ciągnie do elementu pod nami, nie do tego w lewym rogu');
const offset = nav.pickNext(row[1], grid, 'down', 1);
assert.ok(offset === 11 || offset === 10, 'nawet przy niskiej karze za odchylenie cel jest z tej samej linii wzroku');
assert.equal(nav.pickNext({ index: 20, left: 0, top: 0, width: 10, height: 10, group: -1 }, [{ index: 20, left: 0, top: 0, width: 10, height: 10, group: -1 }], 'right'), null, 'sam na siebie nie skaczemy');
assert.ok(nav.inViewport({ index: 0, left: 10, top: 10, width: 20, height: 20, group: 0 }, { width: 800, height: 600 }));
assert.ok(!nav.inViewport({ index: 0, left: -40, top: 10, width: 20, height: 20, group: 0 }, { width: 800, height: 600 }), 'kafelek poza kadrem wymaga przewinięcia');

const { pushUiContext, runUiShortcut, getUiContext } = await import('../src/console/uiContext');
const fired: string[] = [];
const shortcut = (name: string) => ({ label: name, run: () => fired.push(name) });
const libraryCleanup = pushUiContext({ source: 'library', x: shortcut('library:x'), y: null });
assert.equal(runUiShortcut('x'), true);
assert.deepEqual(fired, ['library:x']);
const sheetCleanup = pushUiContext({ source: 'sheet:room', x: shortcut('room:x'), y: shortcut('room:y') });
assert.equal(getUiContext().source, 'sheet:room', 'otwarte okienko jest ważniejsze niż biblioteka');
assert.equal(runUiShortcut('y'), true);
libraryCleanup();
assert.equal(getUiContext().source, 'sheet:room', 'zamknięcie biblioteki nie może zostawić okienka bez skrótów');
pushUiContext({ source: 'sheet:room', x: shortcut('room:x2'), y: null })();
assert.equal(getUiContext().source, '', 'ten sam kontekst podmienia się w miejscu — re-render nie wyciąga go na wierzch');
sheetCleanup();
assert.equal(runUiShortcut('x'), false, 'po zamknięciu okienka X nie wymyśla akcji');

const { nextFullscreenMode } = await import('../src/console/tvFullscreen');
assert.equal(nextFullscreenMode('off', 'toggle'), 'pending');
assert.equal(nextFullscreenMode('pending', 'granted'), 'on');
assert.equal(nextFullscreenMode('pending', 'denied'), 'armed', 'odmowa przeglądarki nie zamyka drogi — czekamy na gest na telewizorze');
assert.equal(nextFullscreenMode('armed', 'gesture'), 'pending');
assert.equal(nextFullscreenMode('on', 'gesture'), 'on', 'przypadkowy klawisz nie wyrzuca z pełnego ekranu');
assert.equal(nextFullscreenMode('on', 'left'), 'off');
assert.equal(nextFullscreenMode('armed', 'left'), 'off');

const { PROTOCOL_VERSION, REMOTE_COMMANDS, isPadMessage } = await import('../src/net/protocol');
for (const command of ['x', 'y', 'fullscreen'] as const) {
  assert.ok(REMOTE_COMMANDS.includes(command), `${command} musi być na liście hosta, inaczej pad zostałby zignorowany`);
  assert.ok(isPadMessage({ t: 'command', command }), `${command} to poprawna wiadomość pada`);
}
assert.equal(PROTOCOL_VERSION, 1, 'nowe komendy nie mogą unieważnić starszych klientów');
assert.ok(!REMOTE_COMMANDS.includes('aim' as never), 'sterowanie grą nie wchodzi do pilota menu');

const appSource = readFileSync('src/arcade/JoypadApp.tsx', 'utf8');
const sheetSource = readFileSync('src/console/Sheet.tsx', 'utf8');
const engineSource = readFileSync('src/console/uiControl.ts', 'utf8');
const colorInterpolation = (src: string) => /colorInterpolationFilters="sRGB"/.test(src);
const plamekSource = readFileSync('src/console/Plamek.tsx', 'utf8');
const plamekModel = await import('../src/console/plamek.ts');
const padSource = readFileSync('src/pad/JoypadController.tsx', 'utf8');
assert.ok(appSource.includes('useUiControls') && !appSource.includes('nextPlayable'), 'nawigacja biblioteki żyje tylko w silniku — bez drugiej wersji w aplikacji');
assert.ok(!appSource.includes("'joypad-gamepad'") && engineSource.includes('getGamepads'), 'pada USB czyta wyłącznie silnik');
assert.ok(engineSource.includes('dialog[open]'), 'okienko nad grą przejmuje pada, a nie gra pod spodem');
assert.ok(!engineSource.includes('useState'), 'silnik nie może re-renderować telewizora przy każdym kroku');
assert.ok(sheetSource.includes('data-ui-scope') && sheetSource.includes('<UiHints'), 'okienko jest powierzchnią nawigacji i pokazuje własne podpowiedzi');
assert.ok(!/<select|HTMLSelectElement.*selectedIndex/.test(sheetSource), 'Sheet nie cyklinuje już opcji — zrobiłby to dwa razy');
assert.ok(/setAttr\(collar, 'd'/.test(plamekSource) && /setAttr\(blobEl, 'd'/.test(plamekSource)
  && plamekSource.includes('cancelAnimationFrame') && plamekSource.includes('if (el && el.getAttribute(name) !== value)'),
  'Plamek animuje ŚCIEŻKĘ (`d` pisany tylko gdy się zmieniła) i nie pisze atrybutów bez zmiany');
// Runda 22: „zwykła otoczka z buźką” brała się z ZASTYGANIA — w bezruchu pętla gasła,
// kropla znikała (`wrap === 1` → `null`) i zostawał równy, nieruchomy pierścień. Teraz
// farba oddycha, ale tanio: kadencja ~12 fps (~5 fps po zaśnięciu), a nie pełna pętla.
assert.ok(plamekSource.includes('PLAMEK_IDLE.frameMs') && plamekSource.includes('PLAMEK_IDLE.napFrameMs'),
  'oddech farby ma własną kadencję (i wolniejszą po zaśnięciu) — liczby z modelu, nie z kopii w widoku');
assert.ok(/const breathing = !reduced && phase === 'hug'/.test(plamekSource)
  && /\|\| breathing\) raf = requestAnimationFrame\(frame\)/.test(plamekSource),
  'farba oddycha tylko w spoczynku i tylko przy pełnym ruchu, ale pętla wtedy nie gaśnie');
assert.ok(!/className="plamek-(halo|shell|body|front|neck|drip|anchor)"/.test(plamekSource),
  'farba nie wraca do zestawu `<div>`-ów: dopóki główka jest osobnym elementem, będzie STAĆ na pierścieniu, a nie wnikać w niego');
assert.ok(!/mask-image: conic-gradient/.test(liquidCss),
  'oblewanie jest geometrią ścieżki, nie maską kątową — nie ma czego dopisywać do fallbacków');
assert.ok(plamekSource.includes('ribbonPath(') && /lobeSize: head\.size \*/.test(plamekSource),
  'główka jest wybrzuszeniem taśmy (`lobeSize` z rozmiaru buźki), więc nie ma czego scalać z obwodem');
assert.ok(plamekSource.includes('.plamek-strand') && /neckPath\(/.test(plamekSource),
  'most z farby zwęża się szyją liczoną w modelu: pęka, a nie znika');
assert.ok(plamekSource.includes('blobPath(') && /head\.sx, head\.sy/.test(plamekSource),
  'bulwa bierze osie prosto z `squashFrom` (pole zachowane), więc nigdy nie puchnie przy kiwnięciu');
assert.ok(plamekSource.includes('motionReduced') && !/matchMedia\('\(prefers-reduced-motion/.test(plamekSource), 'Plamek pyta o ograniczony ruch jedną funkcją (preferences), nie własnym matchMedia');
assert.ok(!/\bMath\.random\(/.test(plamekSource), 'chronometraż maskotki jest deterministyczny (seed), nie losowy w klatce');
assert.ok(plamekSource.includes("'joypad-plamek'") && engineSource.includes('notePlamek'), 'pilot mówi maskotce, co zrobiła (select/back/skrót/ściana)');
assert.ok(plamekSource.includes('dataset.plamek'), 'natywny outline schodzi tylko tam, gdzie Plamek naprawdę go zastępuje');
assert.ok(plamekSource.includes('is-blocked') && liquidCss.includes('.plamek.is-blocked'), 'krok w ścianę ma swój sygnał (i nie zależy od transformu)');
assert.ok(!/<feMorphology/.test(plamekSource) && plamekSource.includes("className=\"plamek-rim-blur\""),
  'keyline obrasta rozmyciem, nie prostokątnym jądrem — stąd brały się schodki na okręgu');
assert.ok(/values=\{alphaMatrix\(PLAMEK_WET\.ramp, PLAMEK_WET\.offset\)\}/.test(plamekSource),
  'próg alfa ma jedno źródło liczb, inaczej test pilnuje dekoracji');
assert.equal(plamekModel.wetBlur(0), 0);
assert.equal(plamekModel.wetBlur(.3), .66, 'scalanie w spoczynku nie zmienia smugi');
assert.equal(plamekModel.wetBlur(1), 2.2, 'scalanie w locie pozostaje bez zmian');
assert.ok(/className="plamek-edge-aa" in="plamek-threshold"/.test(plamekSource)
  && /stdDeviation=\{edgeAaFor\(\)\} result="plamek-wet"/.test(plamekSource)
  && plamekSource.includes("setAttr(edgeBlur, 'stdDeviation', edgeAaFor(window.devicePixelRatio, measuredScale)"),
  'wygładzanie jest po progu i przelicza piksele urządzenia');
// Zasięg wygładzania czytamy ze stałej, nie z liczby przepisanej do testu: inaczej
// podniesienie jakości (runda 15: .4 -> .5 piksela urządzenia) wygląda jak regresja.
assert.equal(plamekModel.PLAMEK_WET.edgeAaPx, .5, 'zasięg wygładzania w pikselach urządzenia');
for (const dpr of [1, 1.25, 1.5, 2, 3, 4]) {
  assert.ok(Math.abs(plamekModel.edgeAaFor(dpr) * dpr - plamekModel.PLAMEK_WET.edgeAaPx) < 1e-9,
    'wygładzanie ma ten sam zasięg w pikselach urządzenia');
}
for (const scale of [.2, .5, 1, 2]) {
  assert.ok(Math.abs(plamekModel.edgeAaFor(2, scale) * 2 * scale - plamekModel.PLAMEK_WET.edgeAaPx) < 1e-9,
    'morfing okienka nie powiększa wygładzania razem z warstwą');
}
assert.ok(plamekModel.PLAMEK.gooPad > 3 * (plamekModel.PLAMEK_WET.blurGain
  + plamekModel.PLAMEK_WET.rimMax + plamekModel.edgeAaFor(1, .2)),
  'zapas regionu mieści zasięg wszystkich rozmyć');
for (const dpr of [0, -1, NaN, Infinity, 10]) {
  assert.ok(plamekModel.edgeAaFor(dpr) >= .1 && plamekModel.edgeAaFor(dpr) <= .6,
    'nawet śmieciowa gęstość ekranu nie rozmywa ani nie zaostrza krawędzi poza rozsądek');
}

/* --- Runda 15: realizm i JEDEN kolor farby -------------------------------- */
// Połysk jest proporcjonalny do bulwy (ta sama zasada, co grubość farby): na chipie
// subtelny, na kaflu telewizora większy — nigdy stała liczba pikseli.
assert.equal(plamekModel.sheenBlurFor(0), 1, 'połysk ma podłogę, żeby nie zniknął na małej bulwie');
assert.ok(plamekModel.sheenBlurFor(60) > plamekModel.sheenBlurFor(20),
  'połysk rośnie z rozmiarem bulwy');
for (const r of [-5, 0, 8, 40, 400]) {
  const blur = plamekModel.sheenBlurFor(r);
  assert.ok(blur >= 1 && blur <= plamekModel.PLAMEK_WET.rimMax + 1, `połysk w granicach (${r})`);
}
// Cień kontaktowy: przesunięcie i rozmycie rosną z farbą, ale są ograniczone —
// cień ma sugerować odległość od szkła, a nie rysować drugiej obwódki.
const lightContact = plamekModel.contactShadowFor(2.8);
const heavyContact = plamekModel.contactShadowFor(9.5);
assert.ok(heavyContact.dy > lightContact.dy && heavyContact.blur > lightContact.blur,
  'cięższa farba kładzie się cieniem niżej i szerzej');
for (const w of [-1, 0, 2.8, 9.5, 1e6]) {
  const contact = plamekModel.contactShadowFor(w);
  assert.ok(contact.dy >= 4 && contact.dy <= 10, `przesunięcie cienia w granicach (${w})`);
  assert.ok(contact.blur >= 14 && contact.blur <= 30, `rozmycie cienia w granicach (${w})`);
}
// Kontrakt koloru z przeglądu: użytkownik zauważył, że farba bywa JAŚNIEJSZA — najpierw
// na przyciskach stopki, potem „osiadała” jaśniej przy Wężowym Wirze. Przyczyną był
// `--os-nav-accent`, który zmienia się z PODŚWIETLONYM KAFELKIEM (Wężowy Wir ma jaśniejszy
// odcień, BlockCraft zielony) — farba jechała za nim, więc maskotka zmieniała kolor razem
// z nawigacją. Teraz farba ma własny, stały token oparty na akcencie JoyPada.
const cssNoComments = liquidCss.replace(/\/\*[\s\S]*?\*\//g, '');
assert.ok(/--plamek-paint:\s*var\(--os-accent[^)]*\)/.test(liquidCss),
  'farba ma własny, stały token oparty na akcencie JoyPada (`--os-accent`)');
assert.ok(!/--os-nav-accent/.test(cssNoComments),
  'farba NIE może jechać za akcentem podświetlonego kafelka — stąd brała się zmiana koloru');
const paintDecls = [...cssNoComments.matchAll(/--plamek-paint\s*:/g)].length;
assert.equal(paintDecls, 1,
  'token farby jest zadeklarowany dokładnie raz (w `:root`) — powtórna deklaracja w komponencie to zaproszenie do rozjazdu kolorów');
assert.ok(!/transition:\s*fill/.test(cssNoComments),
  'zmiana koloru nie może być animowana — tak wyglądało „osadzanie się” farby w innym odcieniu');
assert.ok(!/#ffe0bd/i.test(cssNoComments + consoleCss.replace(/\/\*[\s\S]*?\*\//g, '')),
  'bez kremowego rozbłysku z przeglądu — jasny początek gradientu czytał się jako „jaśniejszy Plamek”');
assert.ok(!/\.plamek[^{}]*\{[^}]*brightness\(/.test(liquidCss),
  'żadna reguła Plamka nie rozjaśnia farby filtrem (to był zgłoszony błąd)');
const gooFills = [...liquidCss.matchAll(/\.plamek-goo\s*\{[^}]*?fill:\s*([^;]+);/g)].map(m => m[1].trim());
assert.deepEqual(gooFills, ['var(--plamek-paint)'],
  'wypełnienie ma dokładnie jedno źródło — reakcje nie podmieniają koloru');
// Ta sama kontrola dla KAŻDEJ reguły dotykającej farby (grupa i bulwa): wolno tylko
// odziedziczyć kolor albo wskazać akcent. Inny odcień = powrót zgłoszonego błędu.
const paintFills = [...liquidCss.matchAll(/\.plamek-(?:goo|blob)[^{}]*\{[^}]*?\bfill:\s*([^;]+);/g)].map(m => m[1].trim());
assert.ok(paintFills.length > 0 && paintFills.every(value => value === 'var(--plamek-paint)' || value === 'inherit'),
  `farba nie może zmieniać koloru przy reakcjach, a zmienia: ${paintFills.join(' | ')}`);
// Mini-Plamek w pasku podpowiedzi (dół strony) też ma jeden kolor: akcent, nie gradient
// z jasnym rozbłyskiem — to była druga możliwa przyczyna zgłoszenia „jaśniejszy”.
assert.ok(/\.plamek-mini\s*\{[^}]*background:\s*var\(--plamek-paint/.test(liquidCss),
  'mini-Plamek bierze DOKŁADNIE ten sam token co farba, bez gradientu rozjaśniającego');
// Widok musi realnie korzystać z obu parametrów — inaczej są martwym kodem.
assert.ok(plamekSource.includes('contactShadowFor(weight)'),
  'cień kontaktowy jest wpięty w klatkę i liczony z grubości farby');
assert.ok(plamekSource.includes('sheenBlurFor(blobR)'),
  'połysk dostaje rozmycie względem bulwy');
assert.ok(liquidCss.includes('var(--plamek-contact)'),
  'każde nadpisanie poświaty dokleja cień kontaktowy (inaczej farba odkleja się od szkła)');
assert.deepEqual(plamekModel.alphaMatrix(18, -6).split(/\s+/).map(Number),
  [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 18, -6],
  'macierz nie zmienia kanałów koloru');
assert.deepEqual(plamekModel.maskMatrix(6, -1).split(/\s+/).map(Number),
  [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 6, -1]);
assert.ok(plamekModel.rimSwellFor(9.5) > plamekModel.rimSwellFor(2.8)
  && plamekModel.rimSwellFor(0) >= plamekModel.PLAMEK_WET.rimMin
  && plamekModel.rimSwellFor(1e6) <= plamekModel.PLAMEK_WET.rimMax,
  'grubość keyline jest względna, ale nigdy ani nić ani sznurek');
assert.ok(liquidCss.includes('shape-rendering: geometricPrecision'),
  'ścieżki pod maską nie mogą być wyrównywane do siatki pikseli');
assert.ok(plamekSource.includes('PLAMEK.followFrames'), 'okno dosłuchu fokusa jest liczone w modelu, nie na sztywno w widoku');
assert.ok(plamekSource.includes('smoothTo(') && !/PLAMEK_SPRING/.test(plamekSource), 'ruch liczy się stałą czasową, nie sprężyną — bez podskoku i niezależnie od odświeżania');
assert.ok(plamekSource.includes("'lean'") && engineSource.includes("notePlamek('lean'"), 'plamka nastawia się na kierunek komendy, zanim faktycznie skoczy');
// Runda 3: rytm zdarzeń. Przeglądarka wysyła `focusout` PRZED `focusin`, więc każda
// próba chowania maskotki przy utracie fokusa kasuje start lotu — to była główna
// przyczyna „plama po prostu pojawia się na nowym przycisku".
assert.ok(!/addEventListener\('focusout'/.test(plamekSource), 'fokus-out nie gasi maskotki — tylko odroczony powtórny pomiar');
assert.ok(plamekSource.includes('scheduleHide') && plamekSource.includes('PLAMEK.hideDelayMs'), 'zniknięcie jest odroczone i przeliczone (focusin zdąży wygrać wyścig)');
assert.ok(/detail\.kind === 'lean'[\s\S]{0,400}takeOff\(/.test(plamekSource), 'rytuał startuje od komendy `lean`, nie od `focusin` — lot widać zawsze');
assert.ok(plamekSource.includes('PLAMEK.hopGraceMs'), 'powrót z okienka leci ze starego kształtu, nie teleportuje się');
assert.ok(!/\bhead\.x [+-]= .*shake/.test(plamekSource), 'drganie dotyczy kształtu, nigdy pozycji (pozwolenie na ciecz, zakaz podskoku)');
assert.ok(/head\.sy = 1 \/ Math\.max\(\.4, head\.sx\)/.test(plamekSource), 'osie farby są swoimi odwrotnościami: pole jest zachowane');
assert.ok(!/head\.(x|y) [+-]= .*\bshake\b/.test(plamekSource), 'drganie nie może trafić w oś pozycji — nawet jedno `+=`');
// Domknięcie obwodu: puls żyje na poświacie (POZA mokrą farbą), bo próg alfy maski
// zjadał delikatne box-shadow — to dlatego „zamiast scalenia nic się nie stało".
assert.ok(plamekSource.includes("'is-fuse'") && liquidCss.includes('.plamek.is-fuse .plamek-glow')
  && !/plamek-fuse[^}]*infinite/.test(liquidCss), 'domknięcie obwodu to jeden puls na poświacie, nie pętla i nie pod maską');
assert.ok(plamekSource.includes('PLAMEK.fuseMs'), 'czas pulsu bierze się z modelu, nie z kopii w CSS');
assert.ok(plamekSource.includes('teardropPath(') && /dripTail\(host/.test(plamekSource),
  'kropla jest podścieżką TAŚMY (nie osobnym elementem) i liczy się z grubości farby — dlatego ją widać');
// Maska goo: jedna grupa, jeden filtr, region liczony od obrysu farby.
assert.ok(/className="plamek-goo"/.test(plamekSource) && liquidCss.includes('.plamek-goo')
  && plamekSource.includes('feGaussianBlur') && plamekSource.includes('feColorMatrix'),
  'farba ma wspólną grupę z maską goo — inaczej plamy tylko na siebie nachodzą');
assert.ok(plamekSource.includes('className="plamek-face"') && liquidCss.includes('.plamek-face')
  && !/filter:/.test(cssBlockFrom('.plamek-face {')), 'twarz jest poza mokrą farbą: maska nie zjada oka');
assert.ok(/useId\(\)/.test(plamekSource) && /url\(#\$\{filterId\}\)/.test(plamekSource),
  'id maski jest unikalne na kopię — kopia w okienku nie podszywa się pod pierwszą');
assert.ok(colorInterpolation(plamekSource), 'filtr liczy się w sRGB, inaczej farba szarzeje');
assert.ok(!/filter:\s*url\(/.test(cssBlockFrom('.plamek-goo {')), 'maskę włącza i wyłącza JS — CSS nie może jej zapalać na stałe');
assert.ok(/filterUnits="userSpaceOnUse"/.test(plamekSource) && /setAttr\(region, 'width'/.test(plamekSource)
  && /PLAMEK\.gooPad/.test(plamekSource),
  'region maski to ciasny prostokąt po obrysie farby (`userSpaceOnUse`), nie cały ekran');
assert.ok(!/position: fixed[\s\S]{0,40}inset: 0[\s\S]{0,240}width: 100%; height: 100%/.test(cssBlockFrom('.plamek-goo {')),
  'grupa farby nie może mieć własnego boxa na pół ekranu — regionu pilnuje <filter>');
assert.ok(/\.plamek-goo \{[^}]*fill: var\(--plamek-paint\)/.test(liquidCss)
  && /--plamek-paint: var\(--os-accent, #ff9a52\)/.test(liquidCss)
  && !/color-mix/.test(liquidCss.slice(liquidCss.indexOf('--plamek-paint'), liquidCss.indexOf('--plamek-paint') + 120)),
  'farba musi mieć `fill` w CSS — bez niego SVG maluje czernią; kolor to czysty akcent gry '
  + '(rozjaśnianie mieszkanką było przymiarką i użytkownik je cofnął — wyraźność trzyma keyline)');
assert.ok(!/fill-opacity: 1/.test(liquidCss),
  'CSS nie może wymuszać `fill-opacity: 1`: to tym atrybutem `draw()` chowa bulwę i wygasza most');
assert.ok(/<feGaussianBlur/.test(plamekSource) && /<feFlood/.test(plamekSource) && /<feMerge/.test(plamekSource)
  && !/<feDropShadow/.test(plamekSource),
  'keyline liczony prymitywami SVG 1.1 — feDropShadow bywa nieznane przeglądarkom telewizyjnym, a filtr, którego nie ma, znaczy warstwę bez farby');
// Nie osłabiamy półprzezroczystej smugi łagodniejszą rampą. Wygładzanie jest osobno.
assert.equal(plamekModel.PLAMEK_WET.ramp, 18);
assert.equal(plamekModel.PLAMEK_WET.offset, -6);
const paintAlpha = (a: number) => Math.max(0, Math.min(1,
  a * plamekModel.PLAMEK_WET.ramp + plamekModel.PLAMEK_WET.offset));
assert.equal(paintAlpha(.42), 1, 'podłoga alfy smugi nadal daje pełne krycie przed wygładzeniem');
assert.equal(paintAlpha(0), 0);
assert.equal(paintAlpha(1), 1);
assert.ok(!liquidCss.includes('stroke-width'),
  'w grupie farby nie ma już `stroke`-a: i tak zjadał go próg alfa, a płaciło się nim co ramkę');
assert.ok(/\.42 \+ \.58 \* clamp01\(raw/.test(plamekSource),
  'echo ma podłogę alfa nad progiem maski i gaśnie promieniem — nie kanałem alfa');
assert.ok(/top: \.5[05]/.test(plamekSource),
  'górna krawędź taśmy nie może być dwa razy cieńsza od bocznej — na małych przyciskach znikała');
assert.ok(/crownFor\(host\)/.test(plamekSource) && /lobeAt,/.test(plamekSource)
  && /lobeRaw \* crown/.test(plamekSource),
  'garb idzie za główką (lobeAt) i znika na okrągłym celu (crownFor) — inaczej ikona w topbarze '
  + 'dostaje jajko z buźką na dole');
assert.ok(/restDisc > \.02/.test(plamekSource),
  'na kole główkę trzyma krążek zlany z pierścieniem przez `<filter>`, nie wybrzuszenie taśmy');
assert.ok(/glow\.style\.cssText = `--halo-x:/.test(plamekSource),
  'poświata dostaje pozycję w tym samym zapisie co reszta zmiennych — ich utrata wygląda jak „maskotka uciekła w lewy górny róg"');
assert.ok(liquidCss.includes('.plamek.is-settle') && !/plamek-sheen[^}]*infinite/.test(liquidCss), 'połysk po rozlaniu to jeden przebieg, nie pętla');
assert.ok(/\.plamek-liquid \{[^}]*overflow: visible/.test(liquidCss), 'ścieżka wychodzi poza box svg — przycięty SVG uciąłby kroplę i rozmycie');
// `transform: none !important` w listach reduced-motion jest OK dla kafelków i okienek, ale
// dla warstw maskotki oznaczałoby kafelek przy oknie — na transformie siedzi jej buźka.
const plamekFlat = [...liquidCss.matchAll(/([^{}]*\.plamek[^{}]*)\{([^}]*)\}/g)]
  .filter(rule => /transform:\s*none/.test(rule[2]) && /!important/.test(rule[2]));
assert.equal(plamekFlat.length, 0, 'redukcja ruchu wycisza przejścia i animacje maskotki, ale nie jej transform (na nim siedzi pozycja buźki)');
const prefsSource = readFileSync('src/console/preferences.ts', 'utf8');
assert.ok(/export function motionReduced/.test(prefsSource), 'preferencja ruchu ma jedno źródło');
for (const [name, src] of [['Plamek', plamekSource], ['uiControl', engineSource], ['windowOrigin', readFileSync('src/console/windowOrigin.ts', 'utf8')]] as const) {
  assert.ok(src.includes("from './preferences'"), `${name} bierze tryb ruchu z preferencji konsoli`);
}
assert.ok(appSource.includes(".boot-splash'") && appSource.includes('joypad-dialog-command'), 'ekran startowy nadal pomija się pilotem z telefonu');
assert.ok(padSource.includes('NavStick') && padSource.includes("command=\"x\""), 'telefon ma gałkę nawigacji i skróty X/Y');
assert.ok(padSource.includes("send('fullscreen')"), 'admin rozkłada pełny ekran telewizora z telefonu');
// iPhone w poziomie ma wycięcie z boku: bez marginesów skrajne przyciski są pod nim.
const indexHtml = readFileSync('index.html', 'utf8');
assert.ok(indexHtml.includes('viewport-fit=cover'),
  'iOS oddaje `env(safe-area-inset-*)` tylko z `viewport-fit=cover` — bez tego każdy margines wynosi zero');
assert.ok(/safe-area-inset-left/.test(padSource) && /safe-area-inset-right/.test(padSource),
  'poziomy pad odsuwa pasek i kolumnę przycisków od wycięcia z obu stron');
// Znak startowy w HTML-u: widać system zanim React przejmie `#root`, ale nie wolno mu
// dotykać układu kontenera (biblioteka jest na całą wysokość) ani czytnika ekranu.
assert.ok(indexHtml.includes('class="boot-mark"') && /boot-mark[^>]*aria-hidden="true"/.test(indexHtml),
  'zastępczy znak startowy jest w HTML-u i ukryty przed czytnikiem ekranu');
assert.ok(/\.boot-mark\s*\{[^}]*position:\s*fixed/.test(indexHtml),
  'znak startowy jest `position: fixed` — `display: grid` na `#root` złamałby układ biblioteki');
// Notatki wersji: test przeglądarkowy czyta treść z `WhatsNew.tsx`, więc kolejny bump
// listy nie wywraca CI (literal 'Moments Gallery' przeżył dwie wersje i padł na 1.9.0).
const momentsSpec = readFileSync('tests/moments.spec.ts', 'utf8');
assert.ok(momentsSpec.includes("import { UPDATES } from '../src/platform/whatsNewNotes'")
  && momentsSpec.includes('UPDATES[0].title.pl') && !momentsSpec.includes("toContainText('Moments Gallery')"),
  'test notatek bierze treść z komponentu — nie przypina zdania z jednej wersji');
const whatsNewSource = readFileSync('src/platform/WhatsNew.tsx', 'utf8');
const whatsNewNotes = readFileSync('src/platform/whatsNewNotes.ts', 'utf8');
assert.ok(whatsNewNotes.includes('export const UPDATES = [') && whatsNewSource.includes("from './whatsNewNotes'")
  && !whatsNewSource.includes('export const UPDATES'),
  'treść notatek żyje w module danych, a widok ją importuje — jedno źródło prawdy dla testu i UI');
assert.ok(!/from '(\.\.\/)?console\/Sheet'|from 'react'/.test(whatsNewNotes),
  'moduł notatek nie ciągnie Reacta ani `Sheet` — test importuje go w Node bez drzewa komponentów');
// Runda 23: „stara wersja 3D" (widok z góry) brała się z dwóch przecieków kontekstów:
// sonda WebGL2 przypinała kontekst do płótna gospodarza (fallback 2D dostawał potem
// `getContext('2d') === null`), a sceny 3D nie oddawały swoich — limit przeglądarki (~16)
// po kilku rundach odpowiadał „nie" i gra zrzucała się cicho. Teraz wszystko jawne.
for (const [name, path] of [['Neonowy Pęd', 'src/arcade/neon/NeonRushScene.ts'], ['STAR CLASH', 'src/arcade/starclash/Game.ts'],
  ['Turbo League', 'src/arcade/league-next/LeagueGame.ts'], ['WEBZA', 'src/arcade/pizza/Game.ts']] as const) {
  const engine = readFileSync(path, 'utf8');
  assert.ok(engine.includes('renderer.dispose()') && engine.includes('forceContextLoss()'),
    `silnik 3D ${name} oddaje kontekst WebGL w dispose() — bez tego limit kontekstów zjada kolejne rundy`);
}
const arcadeViewSource = readFileSync('src/arcade/ArcadeGameView.tsx', 'utf8');
assert.ok(arcadeViewSource.includes("document.createElement('canvas')") && arcadeViewSource.includes('WEBGL_lose_context'),
  'sonda WebGL2 pyta jednorazowe płótno i od razu oddaje kontekst');
assert.ok(!arcadeViewSource.includes('canvas.getContext('),
  'płótno gospodarza nie jest sondowane — fallback 2D musi dostać czysty kontekst');
assert.ok(arcadeViewSource.includes('joypadRenderReport') && arcadeViewSource.includes('TRYB 2D')
  && arcadeViewSource.includes('readRenderReport()'),
  'zrzut do 2D nigdy nie jest cichy: chip z powodem w oprawie rundy i `window.joypadRenderReport`');
const smokeSource = readFileSync('scripts/preview-smoke.mjs', 'utf8');
assert.ok(/!window\.document\.querySelector\('\.boot-mark'\)/.test(smokeSource),
  'harness preview czeka na drzewo Reacta, a nie na zastępczy znak startowy');
const stickSource = readFileSync('src/pad/Joystick.tsx', 'utf8');
assert.ok(/safe-area-inset-\$\{side\}/.test(stickSource) && /calc\(\$\{zoneWidthPct\}% - env/.test(stickSource),
  'strefa gałki zaczyna się za wycięciem i jest o nie węższa — gałka liczy pozycję z pomiaru strefy');
for (const selector of ['.plamek', '.plamek-liquid', '.plamek-glow', '.plamek-collar', '.plamek-src', '.plamek-blob', '.plamek-sheen', '.plamek-gleam', '.plamek-echo', '.plamek-face', '.plamek-mini', '.ui-hints', '.ui-hint kbd']) {
  assert.ok(liquidCss.includes(selector) && markup.includes(selector.slice(1).split(' ')[0]), `${selector} istnieje w warstwie szkła i w markupie`);
}
for (const list of liquidCss.matchAll(/@media\(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/g)) {
  assert.ok(list[1].includes('.plamek-goo') && list[1].includes('.plamek-echo'), 'reduced motion wycisza Plamka i zdejmuje mu smugę (ale nie transform — na nim jedzie buźka)');
}
assert.ok(liquidCss.includes('.plamek.is-scoped'), 'w okienku Plamek ma własną kopię (backdrop modala maluje ponad wszystkim)');
assert.ok(!liquidCss.includes('.ui-focus-ring'), 'stary pierścień fokusa zniknął z warstwy szkła — maskotka go zastąpiła');

// Model ruchu jest czysty (bez DOM-u), więc da się go sprawdzić bez przeglądarki.
const { PLAMEK, PLAMEK_INFLATE, PLAMEK_SMOOTH, PLAMEK_TRAIL, ORBIT_ECHOS, advancePhase, chooseChoreography,
  gatherCurve, haloAppearance, pourCurve, phaseDuration, quadPoint, squashFrom, WOBBLE } = plamekModel;
const { ballShapeFor, boxToEdges, dominantGaze, edgeTau, gooTension, haloRadiusFor, leanFor, smoothTo } = plamekModel;
assert.equal(advancePhase('gather', 'phaseDone'), 'fly', 'zebrana farba musi wystartować, a nie zniknąć');
assert.equal(advancePhase('impact', 'phaseDone'), 'pour', 'uderzenie musi przejść w rozlewanie, nie w gotową ramkę');
assert.equal(advancePhase('pour', 'phaseDone'), 'hug', 'otoczka po wylaniu obejmuje przycisk');
assert.equal(advancePhase('fly', 'retarget'), 'fly', 'przekierowanie w locie nie zaczyna rytuału od nowa');
assert.equal(advancePhase('hidden', 'retarget'), 'hug', 'fokus bez maskotki wsiada od razu na element');
assert.equal(chooseChoreography(420, 1), 'ritual', 'domyślny, pojedynczy krok zasługuje na pełny skok');
assert.equal(chooseChoreography(60, 1), 'slide', 'krok w pół oddechu to poślizg, nie fajerwerki co klatkę');
assert.equal(chooseChoreography(420, 4), 'slide', 'seria z gałki anuluje ceremonię nawet przy dużych odstępach');
assert.equal(chooseChoreography(900, 1, true), 'slide', 'przy ograniczonym ruchu nie ma ceremonii');
assert.ok(phaseDuration('fly', 1200) > phaseDuration('fly', 80), 'dalszy skok leci dłużej — bez teleportu');
assert.ok(phaseDuration('fly', 40000) <= PLAMEK.flyMaxMs, 'lot ma sufit czasu, żeby nigdy nie ciągnął się w nieskończoność');
assert.ok(haloAppearance('gather', 1).thickness > haloAppearance('hug', 1).thickness, 'na krótszym obwodzie farba grubieje (zachowanie masy)');
assert.ok(gatherCurve(0) < .02 && Math.abs(gatherCurve(1) - 1) < .02, 'otoczka ścieka od zera do jednego bez skoku na starcie');
assert.ok(pourCurve(1) <= 1.001 && pourCurve(.5) > .3, 'rozlanie dolewa kształt z przestrzeleniem, ale nie w nieskończoność');
const arc = quadPoint({ x: 0, y: 0 }, { x: 50, y: -40 }, { x: 100, y: 0 }, .5);
assert.ok(arc.y < -15 && Math.abs(arc.x - 50) < 12, 'środek łuka jest nad linią prostą — kulka podskakuje');
assert.ok(Math.abs(quadPoint({ x: 3 }, { x: 9 }, { x: 20 }, 1).x - 20) < .01, 'koniec łuku trafia w cel co do piksela');
const springs = edgeTau('right', true);
assert.ok(springs.x1 < springs.x0 && springs.y0 === PLAMEK_SMOOTH.edge, 'w poślizgu krawędź wiodąca ma krótszy czas dojechania');
assert.ok(Math.abs(smoothTo(0, 100, 100, 100) - 63.2) < 1.5, 'stała czasowa to 63% dystansu na tau — i nigdy nie przeskakuje celu');
assert.ok(smoothTo(0, 100, 100, 10000) < 100.0001 && smoothTo(50, 50, 100, 16) === 50, 'pościg jest monotoniczny i stabilny');
assert.ok(haloRadiusFor(60, 12, 0) === 12 && haloRadiusFor(60, 12, 1) > 29, 'w rozciągnięciu otoczka zaokrągla się do pigułki, w spoczynku przylega');
assert.ok(gooTension(boxToEdges({ left: 0, top: 0, width: 60, height: 60, radius: 12 }), boxToEdges({ left: 400, top: 0, width: 60, height: 60, radius: 12 })) > .9, 'ten sam kształt 400 px dalej to pełne napięcie');
assert.ok(gooTension(boxToEdges({ left: 0, top: 0, width: 60, height: 60, radius: 12 }), boxToEdges({ left: 0, top: 0, width: 60, height: 60, radius: 12 })) === 0, 'bez ruchu nie ma napięcia');
assert.ok(ballShapeFor(20, 0, 20).sharp < 20 && ballShapeFor(0, 0, 0).sharp === 50, 'w ruchu kulka ma ostry tył, w bezruchu jest kołem');
assert.ok(Math.abs(ballShapeFor(20, 0, 20).deg - 45) < .01, 'ostry róg patrzy do tyłu, nie w kierunku lotu');
assert.ok(dominantGaze({ x: 0, y: 0 }, leanFor('right', 3.2), 3.2).x > 2, 'bez ruchu zgazuje się na skłon — buźka czyta intencję');
assert.ok(dominantGaze({ x: 9, y: 0 }, leanFor('left', 3.2), 3.2).x > 0, 'a w locie wygrywa realny ruch');
assert.ok(squashFrom(400).long > 1 && squashFrom(400).long < 1.4, 'rozciągnięcie od prędkości jest limitowane');
assert.ok(PLAMEK_INFLATE >= 2 && PLAMEK_INFLATE <= 6, 'farba obejmuje krawędź: odstęp od przycisku mały, ale nie zerowy (napis wciąż wolny)');
assert.ok(PLAMEK.pourSpread > PLAMEK_INFLATE, 'rozlanie zawsze wychodzi dalej niż stan docelowy — jest co ściągać, więc widać doklejanie');
assert.ok(PLAMEK_TRAIL.length >= 2 && ORBIT_ECHOS.length >= PLAMEK_TRAIL.length, 'i lot, i ładowanie mają smugę z co najmniej dwóch ech');
assert.ok(PLAMEK_TRAIL.every((echo, index) => echo.tau > 0
  && (index === 0 || (echo.tau > PLAMEK_TRAIL[index - 1].tau
    && echo.alpha <= PLAMEK_TRAIL[index - 1].alpha && echo.scale <= PLAMEK_TRAIL[index - 1].scale))),
  'im dłuższa stała czasowa echa, tym jest bledsze i mniejsze');
assert.ok(ORBIT_ECHOS.every((lag, index) => index === 0 || lag > ORBIT_ECHOS[index - 1]), 'ogon ładowarki cofa się w czasie coraz bardziej');

// Runda 3–7: fizyka cieczy w modelu (bez DOM-u — te same liczki widzi przeglądarka).
const { bandEdges, blobPath, crownFor, dripTail, flightCurve, gazeBiasFor, gooStrength, idleDrip, idlePool,
  idleWave, lobeAtFor, paintWeightFor, gripOffset, landFor, neckPath, perchFor, PERCH_SINK, PLAMEK_IDLE,
  pourEdges, ribbonPath, rimPerimeter, rimPoint, smoothLoop, strandFor, teardropPath, wobbleKick,
  wobbleValue, wrapCurve, wrapFor, burstCount: burst, splatsFor } = plamekModel;
// Główka ZAWSZE nad przyciskiem (awaryjnie pod, gdy nie ma światła) i sklejona z obwódką.
{
  const wide = { left: 200, top: 300, width: 180, height: 44, radius: 16 };
  const above = perchFor('right', wide, 16, 40);
  const below = perchFor('right', wide, 16, 8);
  assert.ok(above.y < wide.top && below.y > wide.top + wide.height, 'główka siada nad przyciskiem, a gdy nie ma miejsca — pod nim');
  assert.ok(Math.abs(above.x - (wide.left + wide.width / 2)) > 0 && Math.abs(above.x - (wide.left + wide.width / 2)) <= 9, 'skłon w stronę ruchu jest, ale mieści się nad przyciskiem');
  assert.ok(Math.abs(perchFor(null, wide, 16, 40).x - (wide.left + wide.width / 2)) < .01, 'bez kierunku siada dokładnie na środku krawędzi');
  assert.ok(wide.top - above.y > 0 && wide.top - above.y < 16 + PERCH_SINK + 1, 'wchodzi w obwódkę, ale nie na napis');
  assert.deepEqual(landFor('right', wide, 16, 40), { x: above.x, y: above.y }, 'cel lotu = miejsce postoju: żadnej poprawki po wylądowaniu');
  assert.deepEqual(landFor('down', wide, 16, 40), { x: wide.left + wide.width / 2, y: above.y }, 'a bez przechyłu leci środelek krawędzi, na której siada');
  assert.ok(gazeBiasFor('top').y > 0 && gazeBiasFor('bottom').y < 0, 'z góry patrzy w dół na napis, z dołu — w górę');
  // Uwaga: „szyjki” między główką a obwodem już nie ma i testować jej nie trzeba —
  // główka jest WYBRZUSZENIEM tej samej ścieżki (`lobeSize` poniżej).
}
// Obrys liczony ŁUKIEM OBWODU, nie kątem: stała prędkość strug w pikselach, na każdym
// kształcie przycisku. To pierwsza rzecz, przez którą całość czytała się jako „lasso".
{
  const slab = { left: 200, top: 300, width: 300, height: 54, radius: 16 };
  const P = rimPerimeter(300, 54, 16);
  assert.ok(Math.abs(P - (2 * 268 + 2 * 22 + 2 * Math.PI * 16)) < .01, 'obwód = dwie ściany + dwa łuki, bez podwójnego liczenia rogów');
  const top = rimPoint(slab, 0), bottom = rimPoint(slab, .5), left = rimPoint(slab, -.25), right = rimPoint(slab, .25);
  assert.ok(Math.abs(top.x - 350) < .01 && Math.abs(top.y - 300) < .01, 'u=0 to środek górnej krawędzi: tam, gdzie siada główka');
  assert.ok(Math.abs(bottom.y - 354) < .01, 'u=0.5 to środek dolnej krawędzi: tam domyka się obwód');
  assert.ok(top.ny < 0 && bottom.ny > 0 && left.nx < 0 && right.nx > 0, 'normalne patrzą na zewnątrz, więc taśma grubnieje równo po obu stronach');
  assert.ok(Math.abs(right.y - 327) < .01 && Math.abs(left.x - 200) < .01, 'ćwiartki obwodu wypadają na krótkich bokach, nie w narożnikach');
  const tall = rimPoint({ left: 300, top: 300, width: 40, height: 200, radius: 12 }, .25);
  assert.ok(tall.y > 400 - .01, 'u=0.25 na WYSOKIM celu to już dolna krawędź — dowód, że parametr jest długością łuku, a nie kątem');
  const wrapArc = (wrap: number) => {
    const { outer } = bandEdges(slab, { inset: -2, spread: 6, aniso: { top: .35, side: 1, bottom: 1.55 }, wrap, lobe: 0, lobeWidth: 18, lobeSize: 0, dent: 0, wob: 0, spin: 0 });
    let len = 0;
    for (let i = 1; i < outer.length; i++) len += Math.hypot(outer[i].x - outer[i - 1].x, outer[i].y - outer[i - 1].y);
    return { outer, len };
  };
  const w25 = wrapArc(.25), w75 = wrapArc(.75), w100 = wrapArc(1);
  assert.ok(w75.len / w25.len > 2.4 && w75.len / w25.len < 3.6, 'dwa fronty przebiegają dwa razy dłuższy łuk w dwa razy krótszym czasie — stała prędkość');
  // Zewnętrzna krawędź jest dłuższa od obwodu celu o łuki o promieniu (r + grubość),
  // więc porównujemy z 12% tolerancją, nie z zerem — to nadal dowód, że `wrap` jest łukiem.
  assert.ok(Math.abs(w100.len - P) / P < .12, 'przy wrap 1 taśma obszła cały obwód celu');
  assert.ok(w25.outer.every(p => Number.isFinite(p.x) && Number.isFinite(p.y)), 'żaden punkt taśmy nie jest NaN (pusty `d` = niewidoczna maskotka)');
  // Dwa fronty są lustrzane, a ich odległość od u=0 rośnie razem.
  const ends = w25.outer[0], endsB = w25.outer[w25.outer.length - 1];
  assert.ok(Math.abs((ends.x + endsB.x) / 2 - 350) < 1.5 && Math.abs(ends.y - endsB.y) < 1.5, 'fronty schodzą się symetrycznie względem osi przycisku');
}
// Taśma: anizotropia (ciężki dół), bulwa zamiast kulki i ząb po starcie.
{
  const slab = { left: 200, top: 300, width: 300, height: 54, radius: 16 };
  const opts = { inset: -2, spread: 6, aniso: { top: .35, side: 1, bottom: 1.55 }, wrap: 1, lobe: 0, lobeWidth: 18, lobeSize: 0, dent: 0, wob: 0, spin: 0 };
  const flat = bandEdges(slab, opts);
  const thickAt = (i: number) => Math.hypot(flat.outer[i].x - flat.inner[i].x, flat.outer[i].y - flat.inner[i].y);
  const mid = Math.floor(flat.outer.length / 2);
  assert.ok(Math.abs(flat.outer[mid].x - 350) < .6 && flat.outer[mid].y < slab.top, 'środek zamieci to u=0: górna krawędź pod główką');
  assert.ok(thickAt(0) > opts.spread * 1.4, 'początek pętli to dół celu: kałuża grubsza niż sama bazowa warstwa');
  assert.ok(thickAt(mid) < thickAt(0) * .6 && thickAt(mid) < opts.spread, 'góra tylko muska przycisk, dół zbiera kałużę');
  const head = bandEdges(slab, { ...opts, lobe: 1, lobeSize: 20 });
  const yTop = Math.min(...head.outer.map(p => p.y)), yTopFlat = Math.min(...flat.outer.map(p => p.y));
  assert.ok(yTopFlat - yTop > 12, 'bulwa główki wystaje ponad taśmę o kilka pikseli — główka JEST jej wybrzuszeniem');
  const d = ribbonPath(head.outer, head.inner);
  assert.equal((d.match(/M/g) || []).length, 1, 'cały kołnierz to JEDNA zamknięta ścieżka: nie ma drugiego elementu, który mógłby „stać obok”');
  assert.ok(!/NaN/.test(d) && d.endsWith('z'), 'ścieżka jest domknięta i wolna od NaN');
  const dent = bandEdges(slab, { ...opts, lobe: 1, lobeSize: 20, dent: 1 });
  assert.ok(Math.min(...dent.outer.map(p => p.y)) > yTop + 8, 'po starcie farba jest wciągnięta: bulwa zapada się, a nie znika w jednej klatce');
  const wet = bandEdges(slab, { ...opts, wob: .3, spin: .4 });
  const dev = wet.outer.map((p, k) => Math.hypot(p.x - flat.outer[k].x, p.y - flat.outer[k].y));
  assert.ok(Math.max(...dev) > 1 && Math.min(...dev) < .6, 'fala rantu dotyka całego obwodu: raz wypchnięta, raz wciągnięta taśma');
  assert.ok(bandEdges({ left: 0, top: 0, width: 46, height: 46, radius: 12 }, opts).outer.length >= 12, 'mikroprzycisk nadal ma dość próbek, żeby nie był trójkątem');
  assert.ok(smoothLoop([]) === '' && smoothLoop([{ x: 1, y: 2 }]) === 'M1.0 2.0z', 'degenerowana pętla nie produkuje śmieci w `d`');
}
// Oblewanie z dwóch stron: jedna liczba z modelu, geometria w taśmie.
{
  let wrapMono = true, prevWrap = 0;
  for (let i = 0; i <= 60; i++) { const w = wrapFor('pour', i / 60); if (w < prevWrap - 1e-9) wrapMono = false; prevWrap = w; }
  assert.ok(wrapMono && Math.abs(wrapFor('pour', 1) - 1) < 1e-6, 'oblewanie jest monotoniczne i domyka się dokładnie w 1');
  assert.ok(wrapCurve(.5) > wrapCurve(.25) * 2, 'strugi przyspieszają na bokach — farba leci, nie pełznie');
  assert.ok(wrapCurve(.75) > .79 && wrapCurve(.75) < .81, 'zejście po bokach kończy się w 3/4 lewania, reszta czasu to samo domknięcie');
  assert.ok(wrapFor('gather', .5) < .95 && wrapFor('gather', .5) > .05, 'ucieczka cofa farbę po bokach, a nie gasi obwodu w jednej klatce');
  assert.equal(wrapFor('fly', .5), 0, 'w locie nie ma jeszcze żadnego obwodu');
  assert.equal(wrapFor('hug', 1), 1, 'w spoczynku obwód jest domknięty');
  assert.ok(haloAppearance('pour', 0).alpha > .45, 'farba jest widoczna od pierwszej klatki — revelation wzięła na siebie taśma');
  // Rozpływ: anizotropowe rozlanie, kropla pod spodem i mokrość grupy.
  const wet = { left: 100, top: 200, width: 240, height: 60, radius: 16 };
  const pour0 = pourEdges(boxToEdges(wet), PLAMEK.pourSpread, 0), pour1 = pourEdges(boxToEdges(wet), PLAMEK.pourSpread, 1);
  assert.ok(pour1.x0 === wet.left && pour1.y1 === wet.top + wet.height, 'rozlanie dojeżdża dokładnie do celu — bez resztki pod spodem');
  assert.ok((wet.top - pour0.y0) < (pour0.y1 - wet.top - wet.height) && (pour0.x1 - pour0.x0) > wet.width, 'góra muska, dół zbiera kałużę, boki są najszersze');
  assert.ok(pour0.y1 - (wet.top + wet.height) > (wet.top - pour0.y0) * 2, 'kałuża wisi pod przyciskiem ponad dwa razy głębiej niż nad nim');
  const dLow = dripTail(wet, .72, 9), dLate = dripTail(wet, .95, 9), dNone = dripTail(wet, .3, 9);
  assert.ok(dLow && dLow.y > wet.top + wet.height, 'kropla startuje ZEWNĄTRZ dolnej krawędzi taśmy, więc nie ginie pod paskiem');
  assert.ok(dLow!.height > 9 && dLow!.width > 6, 'i ma rozmiar liczony z grubości farby, a nie z główki — dlatego ją widać');
  assert.equal(dNone, null, 'przed 42% domknięcia kropli nie ma');
  assert.ok(dLate && dLate.height < dLow!.height && dLate.width > dLow!.width, 'kropla daje się wciągnąć: krótsza, więc szersza (objętość)');
  assert.ok(dLow!.height <= wet.height * .56, 'łza nie jest dłuższa niż pół przycisku — inaczej to nitka, nie kropla');
  assert.equal(dripTail(wet, 1, 9), null, 'w zwarciu nie zostaje ani piksel farby pod przyciskiem');
  const drop = teardropPath(120, 260, 12, 22, .9);
  assert.ok(/^M/.test(drop) && !/NaN/.test(drop) && (drop.match(/M/g) || []).length === 1, 'podścieżka kropli jest jednym zamkniętym obrysem');
  assert.ok(gooStrength(0, 'hug', false) >= .25 && gooStrength(0, 'hug', false) <= .4, 'w bezruchu farba JEST lekko mokra: bez tego widać wielobok, nie obrys');
  assert.ok(gooStrength(0, 'hug', true) === 0 && gooStrength(1, 'pour', true) === 0, 'przy ograniczonym ruchu maski goo nie ma wcale');
  assert.equal(gooStrength(1, 'hidden'), 0, 'nie rysujemy nic — nie ma po co włączać filtra');
  assert.ok(gooStrength(1, 'pour') > .9 && gooStrength(.4, 'fly') > .9, 'w rytuale ciecz jest pełna niezależnie od napięcia');
  assert.ok(gooStrength(1, 'pour', false, 1) < .35 && gooStrength(1, 'pour', false, 1) >= .3, 'na końcu rozlewu zostaje tylko miękkość, nie rozmycie: farba stygnie w kształt przycisku');
  assert.ok(PLAMEK.gooPad >= 24, 'region maski ma zapas na rozmycie, bryzgi i smugę');
}

// Runda 22: farba nie wysycha w spoczynku. Mokrości podnieść nie wolno (goo .3 i próg
// alfa 18/-6 są przypięte powyżej — przy większym rozmyciu znikała cienka górna krawędź
// taśmy), więc ciecz wraca ruchem: oddech kałuży, wisząca kropla i odblask na rancie.
{
  // Fala jest ciągła i domknięta: skok na końcu okresu czytałby się jak tik, nie oddech.
  assert.ok(Math.abs(idleWave(0, 1000)) < 1e-9, 'oddech zaczyna się od zera');
  assert.equal(idleWave(500, 1000), 1, 'w połowie okresu jest szczyt');
  assert.ok(Math.abs(idleWave(1000, 1000) - idleWave(0, 1000)) < 1e-9, 'koniec okresu wraca do początku');
  assert.ok(Math.abs(idleWave(999, 1000) - idleWave(1001, 1000)) < .02, 'i nie ma w tym miejscu skoku');
  for (const now of [0, 321, 4200, 9000, 12_345, 60_000]) {
    const pool = idlePool(now), drip = idleDrip(now);
    assert.ok(pool >= 0 && pool <= 1, `kałuża w zakresie 0..1 (${now})`);
    assert.ok(drip >= PLAMEK_IDLE.dripFloor - 1e-9 && drip <= 1, `kropla nigdy nie znika do zera (${now})`);
    assert.equal(pool, idlePool(now), 'oddech jest deterministyczny: ta sama chwila, ta sama fala');
    assert.equal(drip, idleDrip(now), 'kropla też — w widoku obowiązuje zakaz `Math.random`');
  }
  // Sen: kulka śpi, farba ledwo drży — płycej i wolniej, ale nie zastyga.
  assert.ok(idlePool(PLAMEK_IDLE.poolMs / 2, true) <= PLAMEK_IDLE.napFactor + 1e-9,
    'we śnie oddech kałuży jest płytszy');
  assert.ok(idleDrip(1234, true) < PLAMEK_IDLE.dripFloor, 'we śnie kropla jest wciągnięta');
  assert.ok(PLAMEK_IDLE.napFrameMs > PLAMEK_IDLE.frameMs, 'śpiąca maskotka rysuje rzadziej');
  assert.ok(PLAMEK_IDLE.frameMs >= 50 && PLAMEK_IDLE.frameMs <= 140,
    'kadencja oddechu to ~7-20 fps: poniżej widać klatkowanie, powyżej to znowu pełna pętla');
  // Pęcznienie taśmy musi zostawać w klamrze „napis wolny”: oddech pogrubia farbę, ale
  // nie ma prawa wejść w treść przycisku — zwłaszcza na chipie, gdzie taśma jest najcieńsza.
  for (const box of [{ left: 0, top: 0, width: 96, height: 26, radius: 13 },
    { left: 0, top: 0, width: 300, height: 54, radius: 14 },
    { left: 0, top: 0, width: 320, height: 168, radius: 24 }]) {
    const swelled = paintWeightFor(box) * (1 + PLAMEK_IDLE.poolSwell) * (1 + PLAMEK_IDLE.poolAmp);
    assert.ok(swelled < box.height * .18,
      `spuchnięta farba wciąż mieści się w ~1/6 krótszego boku (${swelled.toFixed(2)} < ${(box.height * .18).toFixed(2)})`);
  }
  assert.ok(/spread = lerp\(blobR \* \.62, weight, settle\) \* \(1 \+ PLAMEK_IDLE\.poolSwell \* pool\)/.test(plamekSource),
    'pęcznienie wchodzi w `spread` z liczbami z modelu — widok nie ma własnych kopii');
  // Kropla w spoczynku: jest, ale krótsza i węższa od tej z rozlewu — wyrasta z kałuży,
  // nie konkuruje z nią.
  const wet = { left: 100, top: 200, width: 220, height: 64, radius: 18 };
  const pour = dripTail(wet, .72, 9)!;
  const rest = dripTail(wet, 1, 9, 0, 1)!;
  assert.ok(pour && rest, 'kropla istnieje i w rozlewie, i w spoczynku');
  assert.ok(rest.height < pour.height, `spoczynkowa kropla jest krótsza (${rest.height.toFixed(1)} < ${pour.height.toFixed(1)})`);
  assert.ok(rest.width <= pour.width, 'i nie szersza — inaczej to kałuża, nie kropla');
  assert.ok(rest.height <= wet.height * .34 + 1e-9, 'nie wisi niżej niż trzecia część przycisku');
  assert.ok(rest.alpha < pour.alpha && rest.alpha > .3, 'jest delikatniejsza, ale widoczna');
  assert.equal(dripTail(wet, 1, 9), null, 'bez oddechu (`rest` = 0) spoczynek zostaje suchy — stara ścieżka bez zmian');
  // Odblask jedzie po rancie farby, nie po środku przycisku.
  assert.ok(/rimPoint\(host, u\)/.test(plamekSource) && plamekSource.includes('className="plamek-gleam"')
    && liquidCss.includes('.plamek-gleam'), 'odblask na rancie jest w modelu, w znacznikach i w CSS');
  assert.ok(/u = \.885 \+ \.035 \* pool/.test(plamekSource), 'odblask siedzi na górnym lewym rąbku i przesuwa się z oddechem');
  assert.ok(!/\.plamek-gleam[^{}]*\{[^}]*animation:/.test(liquidCss),
    'odblask nie ma własnej animacji w CSS — żyje z klatki farby, więc nie rozjeżdża się z oddechem');
}
// Grubość farby idzie za rozmiarem elementu. Stała była jednocześnie za gruba na chipie
// (zamieniała się w ramkę) i za cienka na kaflu (znikała z kanapy) — dwa zarzuty, jedna przyczyna.
{
  const chip = { left: 0, top: 0, width: 96, height: 26, radius: 13 };
  const row = { left: 0, top: 0, width: 300, height: 54, radius: 14 };
  const tile = { left: 0, top: 0, width: 320, height: 168, radius: 24 };
  const wChip = paintWeightFor(chip), wRow = paintWeightFor(row), wTile = paintWeightFor(tile);
  assert.ok(wChip < wRow && wRow < wTile, 'farba grubieje razem z elementem');
  assert.ok(wChip < chip.height * .18 && wRow < row.height * .18 && wTile < tile.height * .18,
    'i nigdy nie zabiera więcej niż ~1/6 krótszego boku — napis musi zostać w całości widoczny');
  assert.ok(wTile <= 9.5 && paintWeightFor({ ...chip, width: 4, height: 4 }) >= 2.8,
    'klamry: 2.8 px to czytelność z kanapy, 9.5 px to maksimum na kaflu');
  assert.ok(Math.abs(wRow - 54 * .115) < .01, 'a między klamrami to czysta linearna skala od krótszego boku');
}
// Garb: tylko na płaskim rancie i tylko tam, gdzie realnie siedzi główka.
{
  const icon = { left: 100, top: 24, width: 30, height: 30, radius: 15 };
  const row = { left: 100, top: 24, width: 300, height: 54, radius: 14 };
  assert.ok(crownFor(icon) < .05, 'na ikonce-kole nie ma płaskiej góry: garb = 0');
  assert.ok(crownFor(row) > .95, 'na szerokim pasku jest: garb pełny');
  assert.ok(crownFor({ ...row, width: 60 }) < .3, 'kafel ledwie szerszy niż wyższy ledwie co łapie');
  assert.equal(lobeAtFor('top'), 0); assert.equal(lobeAtFor('bottom'), .5);
  const opts = (extra: object) => ({ inset: -2, spread: 6, aniso: { top: .55, side: 1, bottom: 1.4 },
    wrap: 1, lobe: 1, lobeWidth: 20, lobeSize: 18, dent: 0, wob: 0, spin: 0, ...extra });
  const up = bandEdges(row, opts({ lobeAt: 0 })), down = bandEdges(row, opts({ lobeAt: .5 }));
  const topI = Math.floor(up.outer.length / 2), botI = 0;
  const rise = (pts: { x: number; y: number }[], i: number, base: number) => Math.abs(pts[i].y - base);
  assert.ok(rise(up.outer, topI, row.top) > 8 && rise(down.outer, topI, row.top) < 6,
    'przy `lobeAt` 0 garb siedzi na górnej krawędzi, a środek przy `lobeAt` .5 jest płaski');
  assert.ok(rise(down.outer, botI, row.top + row.height) > 8,
    'a przy `lobeAt` .5 materiał rośnie POD przyciskiem — tam, gdzie główka naprawdę przysiadła');
}
// Bulwa, szyja i most: to, co było „osobnymi elementami", jest teraz fragmentami jednego `d`.
{
  const round = blobPath(300, 200, 12, 0, 1, 1, 0, 0, 0);
  const long = blobPath(300, 200, 12, 0, 1.35, 1 / 1.35, 9, 0, 0);
  const xs = (d: string) => (d.match(/-?[\d.]+ -?[\d.]+/g) || []).map(s => s.split(' ')).map(p => p.map(Number));
  const box = (pts: number[][]) => ({ x0: Math.min(...pts.map(p => p[0])), x1: Math.max(...pts.map(p => p[0])), y0: Math.min(...pts.map(p => p[1])), y1: Math.max(...pts.map(p => p[1])) });
  const rr = box(xs(round)), lr = box(xs(long));
  assert.ok(Math.abs((rr.x1 - rr.x0) - 24) < 1.5, 'bez rozciągnięcia bulwa jest kołem o średnicy 2r');
  assert.ok((lr.x1 - lr.x0) > (rr.x1 - rr.x0) + 6 && (lr.y1 - lr.y0) < (rr.y1 - rr.y0), 'rozciągnięta i wyciągnięta w tył: węższa w poprzek, dłuższa wzdłuż — pole ucieka w ogon, nie w objętość');
  assert.ok(!/NaN/.test(long), 'żadnej NaN w ścieżce bulwy');
  const fat = neckPath(100, 200, 22, 260, 210, 6, 0), thin = neckPath(100, 200, 22, 260, 210, 6, 1);
  // Mierzymy odchylenie od osi W ŚRODKU przęsła (końce są narzucone przez ciała, nie przez szyję).
  const swing = (d: string) => Math.max(...xs(d).filter(p => Math.abs(p[0] - 180) < 26)
    .map(p => Math.abs(p[1] - 200 - (p[0] - 100) * (10 / 160))));
  assert.ok(swing(fat) > 1 && swing(thin) < swing(fat) * .5, 'przy `pinch` 1 szyja zwęża się do niczego — napięcie ma gdzie pęknąć');
  assert.ok(!/NaN/.test(thin) && (thin.match(/M/g) || []).length === 1, 'most to jedna zamknięta szyja, nie dwie linie');
}
assert.ok(PLAMEK.hideDelayMs > 0 && PLAMEK.hopGraceMs > PLAMEK.hideDelayMs, 'oddech na focusin jest krótszy niż okno łaskawego powrotu');
assert.ok(flightCurve(0) < .02 && Math.abs(flightCurve(1) - 1) < 1e-6, 'lot zaczyna się w zerze i kończy w celu co do piksela');
assert.ok(flightCurve(.5) > .6, 'zerwanie jest szybsze niż hamowanie — bez „odjeżdża i hamuje"');
let flightMonotone = true;
for (let i = 1; i <= 40; i++) if (flightCurve(i / 40) <= flightCurve((i - 1) / 40)) flightMonotone = false;
assert.ok(flightMonotone, 'krzywa lotu jest monotoniczna — kulka nie zawraca w drodze');
{
  const from = { x: 100, y: 200 }, to = { x: 420, y: 210 };
  assert.equal(strandFor(from, from, .3, 24), null, 'most rysuje się dopiero gdy kulka faktycznie odeszła');
  const start = strandFor(from, to, 0, 24);
  assert.ok(start && start.thickness > 14 && start.alpha > .8, 'most startuje pełny: najpierw się wyciąga, potem cienieje');
  const early = strandFor(from, to, .05, 24), mid = strandFor(from, to, .4, 24);
  const late = strandFor(from, to, .7, 24), snapped = strandFor(from, to, .78, 24);
  assert.ok(early && mid && late && snapped === null, 'most cienieje i pęka przed lądowaniem');
  assert.ok(early!.thickness > mid!.thickness && mid!.thickness > late!.thickness, 'grubość mostu maleje monotonicznie');
  assert.ok(early!.alpha > late!.alpha && late!.alpha > 0, 'most blednie stopniowo, nie znika nagle');
  assert.ok(Math.abs(early!.len - 320) < 1 && early!.deg > -5 && early!.deg < 5, 'most jest przyklejony do źródła i celuje w kulkę');
  assert.ok(late!.anchor > 0 && mid!.anchor >= late!.anchor, 'kropla źródłowa kurczy się razem z mostem');
  assert.equal(strandFor(from, { x: 101.5, y: 200 }, .3, 24), null, 'na mikroruchu nie ma mostu (inaczej mrugałby przy każdym drgnięciu)');
}
assert.ok(gripOffset(0) > gripOffset(120) && gripOffset(120) > gripOffset(PLAMEK.gripMs), 'doklejanie ściąga się monotonicznie');
assert.ok(Math.abs(gripOffset(PLAMEK.gripMs * 4)) < 1e-6, 'po chwycie nie zostaje żadne domykanie — obrys leży na celu');
assert.ok(Math.abs(squashFrom(90).long * squashFrom(90).short - 1) < 1e-6, 'rozciągnięcie od prędkości zachowuje pole plamy');
{
  const t0 = 1000;
  const w = wobbleKick({ amp: 0, at: 0 }, .18, t0);
  assert.ok(w.amp > .1, 'uderzenie nakręca drganie');
  assert.ok(Math.abs(wobbleValue(w, t0)) > .1, 'w momencie uderzenia farba jest najbardziej odkształcona');
  assert.ok(wobbleValue(w, t0 + WOBBLE.periodMs / 2) * wobbleValue(w, t0) < 0, 'po pół okresie kształt zmienia znak — to drganie, nie skok');
  assert.ok(Math.abs(wobbleValue(w, t0 + WOBBLE.tauMs * 3)) < .02, 'po trzech stałych czasowych drganie jest poniżej 10% szczytu — farba sama siada');
  assert.equal(wobbleValue(w, t0 + WOBBLE.tauMs * 3 + 1), 0, 'po oknie drgania model zwraca zero, więc pętla może zasnąć');
  const nod = wobbleKick({ amp: 0, at: 0 }, -.08, t0);
  assert.ok(Math.abs(wobbleValue(nod, t0)) > .05, 'kiwnięcie (ujemna amplituda) jest widoczne tak samo jak uderzenie');
  const hard = wobbleKick({ amp: .28, at: 0 }, 9, t0);
  assert.ok(Math.abs(hard.amp) <= .3, 'amplituda jest ograniczona — farba nie może zamienić się w gwiazdkę');
}
assert.equal(burst([0, 60, 120, 180], 180), 4, 'cztery kroki w jednym oknie to seria — ceremonię zastępuje poślizg');
assert.ok(splatsFor('right', 3).every(drop => drop.x > 0), 'bryzgi lecą przed siebie, nie za kulkę');
// Miernik Plamka w ładowaniu: kula jedzie po etapach podawania ręki (patrz docs/plamek.md).
const { linkProgress } = await import('../src/console/connectionProgress.ts');
assert.equal(linkProgress({ status: 'error', signal: 'lost', relay: 'off', attempts: 3 }), null, 'błąd nie ma miernika — mówi go komunikat, nie procent');
assert.equal(linkProgress({ status: 'ready', signal: 'online', relay: 'online', attempts: 0 }), 1, 'gotowy pokój to pełne koło');
const stages = [
  { status: 'idle', signal: 'offline', relay: 'off', attempts: 0 },
  { status: 'connecting', signal: 'connecting', relay: 'off', attempts: 0 },
  { status: 'connecting', signal: 'online', relay: 'connecting', attempts: 0 },
  { status: 'connecting', signal: 'online', relay: 'online', attempts: 2 },
].map(linkProgress);
assert.ok(stages.every((value, index) => index === 0 || (value !== null && stages[index - 1] !== null && value > stages[index - 1])),
  'każdy etap podawania ręki przybliża krawędź miernika');
assert.ok(stages.every(value => value !== null && value < 1), 'przed `ready` miernik nigdy nie obiecuje końca');
assert.ok((linkProgress({ status: 'connecting', signal: 'online', relay: 'online', attempts: 99 }) ?? 1) < 1, 'próby nie napełniają miernika do pełna');
const qrSource = readFileSync('src/components/QrFrame.tsx', 'utf8');
assert.ok(qrSource.includes('progress') && readFileSync('src/console/ConsoleLibrary.tsx', 'utf8').includes('linkProgress(state)'),
  'karta sesji pokazuje etap łączenia, nie losowe kręcenie');
assert.ok(readFileSync('src/console/PlamekOrbit.tsx', 'utf8').includes('progressbar'), 'miernik ma rolę progressbar i procent dla czytnika');
assert.ok(consoleCss.includes('.plamek-orbit.is-metered'), 'tryb miernika ma swoje style');
// --- POWIERZCHNIE GIER: pilot i Plamek w menu każdej gry ---
{
  const fs = await import('node:fs');
  const focusSurface = fs.readFileSync('src/console/focusSurface.ts', 'utf8');
  const setupSource = fs.readFileSync('src/console/GameSetup.tsx', 'utf8');
  const resultsSource = fs.readFileSync('src/console/GameResults.tsx', 'utf8');
  const arcadeSource = fs.readFileSync('src/arcade/ArcadeGameView.tsx', 'utf8');
  const tanksSource = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(/'uiStepper' in el\.dataset\) return 'stepper'/.test(focusSurface) && /new CustomEvent\('ui-step'/.test(focusSurface),
    'ustawienia gry są regulowalne: pozycja z `data-ui-stepper` dostaje ←/→, zamiast kazać graczowi skakać do strzałek po bokach');
  assert.ok(/kind === 'stepper'/.test(engineSource) && /adjustable\(el\) === 'stepper'/.test(engineSource),
    'silnik interfejsu obsługuje steppera i ruchem, i Enterem — bez tego nowa pozycja była by martwym przyciskiem');
  for (const [name, source] of [['GameSetup', setupSource], ['GameResults', resultsSource]] as const) {
    assert.ok(/data-ui-scope="game-/.test(source), `${name} musi być powierzchnią nawigacji — bez data-ui-scope pad nie wie, po czym jeździ`);
    assert.ok(/data-ui-focus=/.test(source) && /focusUiScope\(/.test(source),
      `${name} wstawia fokus na starcie: pierwsze naciśnięcie strzałki musi mieć od czego wystartować`);
  }
  assert.ok(/data-ui-scope="tank-setup"/.test(tanksSource) && /focusUiScope\(setupRoot\.current\)/.test(tanksSource),
    'konfiguracja Stalowego Frontu jest tą samą powierzchnią co menu arcade — jeden mechanizm, nie dwa');
  assert.ok(/onFocus=\{\(\) => setMenuChoice\(index\)\}/.test(tanksSource),
    'tryb podświetla się tym, na czym stoi fokus — inaczej napis dużego przycisku rozjeżdża się ze wskazaniem');
  assert.ok(/state\.screen !== 'game'/.test(appSource) && /enabled: uiOwnsInput/.test(appSource)
    && /\{uiOwnsInput && <Plamek \/>\}/.test(appSource),
    'jedna bramka rozstrzyga, kto rządzi: poza rundą pilot steruje menu gry (i Plamek tam jest), w rundzie pad gra');
  for (const [name, source] of [['arcade', arcadeSource], ['czołgi', tanksSource]] as const) {
    assert.ok(!/navigateResults/.test(source), `${name}: żadnej prywatnej nawigacji wyników — w projekcie jest jedna`);
    assert.ok(!/addEventListener\('keydown'/.test(source),
      `${name}: klawiatura telewizora należy do silnika interfejsu; własny nasłuch dublowałby ruch`);
    assert.ok(/data-ui-scope|GameSetup|GameResults/.test(source),
      `${name}: menu gry musi wskakiwać w powierzchnie interfejsu (bez tego zostałoby z dawnych czasów)`);
  }
  assert.ok(!fs.existsSync('src/console/resultsNavigation.ts'),
    'płaska lista „nawigacji wyników” nie wraca: zastąpiła ją nawigacja przestrzenna z Plamkiem');
}

// --- WYJŚCIE Z GRY: pauza nie może wygrać z „Wróć do biblioteki ---
{
  const fs = await import('node:fs');
  const leaveModule = fs.readFileSync('src/lib/exitWish.ts', 'utf8');
  const pauseSource = fs.readFileSync('src/console/PauseSheet.tsx', 'utf8');
  const arcadeSource = fs.readFileSync('src/arcade/ArcadeGameView.tsx', 'utf8');
  const tanksSource = fs.readFileSync('src/App.tsx', 'utf8');
  const motionSource = fs.readFileSync('src/components/motion.tsx', 'utf8');

  assert.ok(/export function wishToLeave/.test(leaveModule) && /export function clearLeaveWish/.test(leaveModule)
    && /export function isLeaving/.test(leaveModule),
    'intencja wyjścia jest w module, nie w useRef-ie: piszą ją handlery kliknięcia, a `react-hooks/immutability` na to nie pozwala');

  // `select` z focusem, który wypadł z modala, nie prześwituje do gry.
  const modalGuard = engineSource.indexOf("const modal = document.querySelector<HTMLElement>('dialog[open]');");
  const selectFallback = engineSource.indexOf('if (!handlers.current.onSelect?.())');
  assert.ok(modalGuard > 0 && selectFallback > modalGuard,
    'otwarty modal zatrzymuje `select` w sobie — inaczej „A" bez fokusa w okienku odpauzowywało rundę pod kurtyną');
  assert.ok(/if \(modal\) \{ focusUiScope\(modal\); notePlamek\('blocked'\); return; \}/.test(engineSource),
    'zgubiony w okienku fokus wraca na jego pierwszą pozycję i maskotka o tym mówi (trafienie w ścianę, nie cisza)');

  // Zmiana wartości to nie zatwierdzenie — buźka kiwa (poke), nie kłania się (select).
  const adjustBlock = engineSource.slice(engineSource.indexOf('// Suwaki i listy najpierw'), engineSource.indexOf('const next = moveTo'));
  assert.ok(adjustBlock.includes("notePlamek('poke')") && adjustBlock.split("notePlamek('poke')").length - 1 === 3
    && !adjustBlock.includes("notePlamek('select')"),
    'regulacja suwaka, listy i steppera musi kiwać (poke), a nie kłaniać się jak przy zatwierdzeniu');

  // Okienko pauzy: veto po wyjściu + fokus w panelu potwierdzenia.
  assert.ok(/onClose=\{\(\) => \{[\s\S]{0,80}if \(isLeaving\(\)\) return;[\s\S]{0,160}onResume\(\);/.test(pauseSource),
    'po „wychodzę" zamknięcie okienka (X, tło, Esc, `back` pada) nie ma prawa wołać onResume');
  assert.ok(/if \(confirm\) \{ setConfirm\(false\); return; \}/.test(pauseSource),
    'z panelu potwierdzenia „wstecz" cofa jeden krok, a nie wraca do gry');
  assert.ok(/panel\.current\?\.querySelector<HTMLElement>\('\.os-play'\)\?\.focus/.test(pauseSource),
    'panel potwierdzenia podmienia przyciski w DOM-ie — fokus musi wskoczyć na „Zakończ rundę", bo bez tego kolejne „A" szukało celu poza panelem');
  assert.ok(/onClick=\{leave\}/.test(pauseSource), 'przycisk wyjścia oznacza intencję, nie woła onExit w ciemno');

  for (const [name, source, toggle] of [['arcade', arcadeSource, 'round.current?.togglePause()'], ['czołgi', tanksSource, 'gameRef.current?.togglePause()']] as const) {
    assert.ok(source.includes('clearLeaveWish();'), `${name}: wejście w grę kasuje intencję wyjścia, inaczej START następnego podejścia byłby martwy`);
    const guardAt = source.indexOf('isLeaving()');
    const toggleAt = source.indexOf(toggle);
    assert.ok(guardAt > 0 && toggleAt > 0 && guardAt < toggleAt,
      `${name}: pierwsze przełączenie pauzy musi leżeć za bramką „nie wychodzę”`);
    assert.ok(!/const leaving = useRef\(/.test(source) && !/useRef\(\{ leaving: false \}\)/.test(source),
      `${name}: flaga wyjścia nie może mieszkać w refie zapisywanym w handlerze`);
  }

  // Panel padów nad areną nie jest <dialog>iem — pilot musi go domykać sam, PRZED pauzą.
  for (const [name, source, flag, pauseLine] of [
    ['arcade', arcadeSource, 'showPads', "command === 'pause' || command === 'select'"],
    ['czołgi', tanksSource, 'showPad', "command === 'pause' || (command === 'back' && stage === 'game')"],
  ] as const) {
    const close = source.indexOf(`if (${flag} && (command === 'back' || command === 'pause')`);
    const pause = source.indexOf(pauseLine);
    assert.ok(close > 0 && pause > 0 && close < pause,
      `${name}: 'back' z nakładki padów nie może przejść do gry — najpierw zamknij panel`);
  }

  // Kurtyna: podmiana ekranu jest faktem, animacja kosmetyką.
  assert.ok(/if \(busy\.current\) \{ swap\(\); return; \}/.test(motionSource),
    'żądanie zmiany ekranu w trakcie innej przejściówki nie może zniknąć — to gubiło wyjście kliknięte w transferze');
  assert.ok(!/if \(busy\.current\) return;/.test(motionSource), 'żadna ścieżka begin() nie może wyjść bez swap()');
  assert.ok(/const run = \(\) => \{ if \(swapped\) return; swapped = true; swap\(\); \};/.test(motionSource)
    && /finally\(\(\) => \{ clearTimeout\(timeout\); busy\.current = false; run\(\); \}\)/.test(motionSource),
    'startViewTransition może odrzucić klatkę (karta w tle) — podmiana i tak musi się odbyć');
  assert.ok(/try \{\s*\n\s*const transition = document\.startViewTransition/.test(motionSource),
    'API przejścia nie jest pewne w każdej przeglądarce TV — musi być próbowane, a nie zakładane');
}

console.log('UI CONTROL SELFTEST: OK (martwa strefa, rytm powtórzeń, wybór celu, rytm zdarzeń i fizyka cieczy Plamka, miernik czekania, skróty X/Y, pełny ekran, kontrakt pilota, sterowanie menu gier i wyjście z pauzy)');
/* --- PROFILE EKRANU (runda 16): TV / komputer / tablet / telefon ------------
   Użytkownik prosił o osobny wygląd dla telewizora, komputera i tabletu oraz
   o układ bez przewijania. Rozpoznanie sprzętu musi być czystą funkcją, bo
   telewizory raportują dziwaczne kombinacje sygnałów — tutaj sprawdzamy je tabelą. */
{
  const { pickProfile, isBigScreen } = await import('../src/console/viewport');
  const base = { coarsePointer: false, noHover: false, touchPoints: 0 };
  const cases: Array<[string, Parameters<typeof pickProfile>[0], string]> = [
    ['Smart TV po UA (Tizen)', { ...base, width: 1920, height: 1080, userAgent: 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0)' }, 'tv'],
    ['TV bez kursora i dotyku', { ...base, width: 1920, height: 1080, noHover: true }, 'tv'],
    ['monitor z myszką', { ...base, width: 2560, height: 1440 }, 'desktop'],
    ['iPad w poziomie', { ...base, width: 1180, height: 820, coarsePointer: true, noHover: true, touchPoints: 5 }, 'tablet'],
    ['tablet z rysikiem (hover zdarza się)', { ...base, width: 1024, height: 768, coarsePointer: true, touchPoints: 10 }, 'tablet'],
    ['telefon', { ...base, width: 390, height: 844, coarsePointer: true, noHover: true, touchPoints: 5 }, 'handheld'],
    ['mały ekran dotykowy bez UA', { ...base, width: 600, height: 900, touchPoints: 5 }, 'handheld'],
  ];
  for (const [name, signals, expected] of cases) {
    assert.equal(pickProfile(signals), expected, `profil ekranu: ${name}`);
  }
  assert.ok(isBigScreen('tv') && isBigScreen('tablet') && isBigScreen('desktop') && !isBigScreen('handheld'),
    'telefon nie udaje dużego ekranu');

  // Wymuszenie profilu z adresu: bez tego nie da się obejrzeć układu TV na komputerze.
  const { readProfileOverride } = await import('../src/console/viewport');
  assert.equal(readProfileOverride('?profil=tv'), 'tv', 'adres może wymusić profil TV');
  assert.equal(readProfileOverride('?profil=Tablet'), 'tablet', 'wielkość liter nie ma znaczenia');
  assert.equal(readProfileOverride('?profil=auto'), null, '`auto` wraca do prawdziwego wykrywania');
  assert.equal(readProfileOverride('?profil=kuchenka'), undefined, 'nieznana wartość nie udaje profilu');
  assert.equal(readProfileOverride(''), undefined, 'brak parametru = zwykłe wykrywanie');
  assert.ok(readFileSync('src/main.tsx', 'utf8').includes('installViewportProfile'),
    'wejście produkcyjne instaluje profil (razem z wymuszeniem z adresu)');

  const viewportSource = readFileSync('src/console/viewport.ts', 'utf8');
  const viewportCss = readFileSync('src/console/viewport.css', 'utf8');
  const mainSource = readFileSync('src/main.tsx', 'utf8');
  assert.ok(!/document|window\./.test(viewportSource.slice(0, viewportSource.indexOf('export function readViewportSignals'))),
    'rozpoznanie profilu jest czyste — DOM wchodzi dopiero w `readViewportSignals`');
  assert.ok(mainSource.indexOf('installViewportProfile()') < mainSource.indexOf('createRoot('),
    'profil jest ustawiany PRZED pierwszym renderem, inaczej TV mrugnie układem desktopowym');

  // Kontrakt CSS: naturalny układ + pomniejszanie. Sztywna wysokość z elastycznym wierszem
  // ściskała wiersz poniżej jego treści i elementy nachodziły na siebie — tego nie wolno wrócić.
  const viewportCssNoComments = viewportCss.replace(/\/\*[\s\S]*?\*\//g, '');
  const libraryRule = /\.os-library\s*\{([^}]*)\}/.exec(viewportCssNoComments)?.[1] ?? '';
  assert.ok(!/height:\s*100dvh/.test(libraryRule) || /min-height/.test(libraryRule),
    'biblioteka nie może mieć SZTYWNEJ wysokości 100dvh — to ten błąd nachodził elementami na siebie');
  assert.ok(/min-height:\s*100dvh/.test(libraryRule),
    'biblioteka ma naturalną wysokość z `min-height: 100dvh` (rośnie z treścią, a krótka wypełnia ekran)');
  const fitSource = readFileSync('src/console/FitScreen.tsx', 'utf8');
  assert.ok(/data-fit/.test(viewportCssNoComments) && /\.fit-frame\s*\{/.test(viewportCssNoComments) && /\.fit-scale\s*\{/.test(viewportCssNoComments),
    'ramka dopasowania ma style i stany `data-fit`');
  assert.ok(/Math\.min\(availableWidth \/ naturalWidth, availableHeight \/ naturalHeight\)/.test(fitSource),
    'skala liczy się z obu wymiarów — treść musi zmieścić się i wszerz, i wzdłuż');
  assert.ok(/fit >= \.995/.test(fitSource) && /fit < minScale/.test(fitSource),
    'trzy stany: mieści się bez zmian, pomniejszone, awaryjne przewijanie');
  assert.ok(/FIT_SLACK_PX/.test(fitSource),
    'drobny nadmiar (cienie, zaokrąglenia) nie może uruchamiać skalowania');
  assert.ok(/availableWidth \/ rough/.test(fitSource) && /content\.style\.width = /.test(fitSource),
    'przy pomniejszaniu układ dostaje płótno `okno / skala`, żeby po przeskalowaniu zająć pełną szerokość (bez czarnych pasów po bokach)');
  assert.ok(/transform-origin:\s*top left/.test(viewportCssNoComments),
    'skala zaczyna się w lewym górnym rogu — inaczej pomniejszona treść ucieka w prawo i pasy wracają');
  // Nagłówek biblioteki nie może być przycięty do kolumny: na szerokim ekranie zostawiał czarne pasy.
  assert.ok(!/max-width:\s*(?:1[0-9]{3}|[2-9][0-9]{3})px/.test(viewportCssNoComments),
    'żaden kontener nie ma limitu szerokości w tysiącach pikseli — treść zajmuje całe okno, szerokość ogranicza tylko padding');
  assert.ok(!/\.os-stage\s*\{[^}]*min-height:\s*[3-9][0-9]{2}px/.test(readFileSync('src/console/console.css', 'utf8')),
    'scena nie ma stałego min-height w setkach pikseli — pchała treść poza ekran');
  // `transform` tworzy blok zawierający dla `position: fixed` — okna systemowe muszą stać obok.
  const librarySource = readFileSync('src/console/ConsoleLibrary.tsx', 'utf8');
  const fitClose = librarySource.indexOf('</FitScreen>');
  assert.ok(fitClose > 0 && librarySource.indexOf('<Sheet') > fitClose,
    'arkusze systemowe są POZA skalowaną treścią, inaczej `position: fixed` nie przykleja ich do okna');
  assert.ok(librarySource.indexOf('<WhatsNew') > fitClose,
    '„Co nowego?” też jest poza skalowaniem');
  for (const screen of ['src/console/GameSetup.tsx', 'src/console/GameResults.tsx']) {
    const source = readFileSync(screen, 'utf8');
    assert.ok(/<FitScreen/.test(source) && /minScale=\{\.\d+\}/.test(source),
      `${screen} korzysta z dopasowania do okna (menu gry i wyniki miały ten sam problem)`);
  }
  // Stała siatka czterech kolumn była poprawna przy czterech grach; gdy doszły dwie,
  // drugi rząd miał sieroty (4 + 2) i biblioteka przestała być jednym ekranem.
  assert.ok(/\.os-game-rail\s*\{[^}]*grid-template-columns:\s*repeat\(var\(--tile-columns/.test(viewportCss),
    'półka bierze liczbę kolumn ze zmiennej — stała siatka zostawia rząd-sierotę, gdy dochodzi gra');
  assert.ok(/\.os-game-rail\[data-rows="1"\] \.os-game-tile/.test(viewportCss),
    'pojedynczy rząd dostaje wyższą okładkę, inaczej telewizor ma pustą półkę pod spodem');
  assert.ok(/--tile-columns/.test(librarySource) && /data-rows=\{/.test(librarySource) && /railColumns\(/.test(librarySource),
    'biblioteka liczy kolumny z liczby gier i szerokości okna (`libraryRail.ts`)');
  for (const profile of ['tv', 'desktop', 'tablet']) {
    assert.ok(viewportCss.includes(`html[data-profile="${profile}"]`), `arkusz ma reguły dla profilu ${profile}`);
  }
  assert.ok(!/!important/.test(viewportCss.replace(/\/\*[\s\S]*?\*\//g, '')),
    'profile wygrywają specyficznością selektora, nie `!important`');
  assert.ok(/\.os-hint-rotate/.test(viewportCss) && /orientation:portrait/.test(viewportCss),
    'tablet w pionie dostaje podpowiedź o obrocie');
  assert.ok(librarySource.includes('os-hint-rotate') && librarySource.includes('os-hint-phone'),
    'podpowiedzi zależne od urządzenia są w markupie (widoczność rozstrzyga profil)');
}
console.log('VIEWPORT SELFTEST: OK (profile TV/komputer/tablet/telefon, układ jednego ekranu i podpowiedzi urządzeń)');


/* --- PÓŁKA Z GRAMI (runda 20): kolumny bez rzędów-sierot ---------------------
   Biblioteka ma sześć grywalnych pozycji, a siatka CSS miała cztery kolumny — drugi
   rząd wyglądał jak urwany. Liczenie kolumn musi być czystą funkcją, żeby dało się
   przejrzeć całą tabelę przypadków (od 2 do 24 gier, na czterech szerokościach). */
{
  const { RAIL_BREAKPOINTS, RAIL_MAX_COLUMNS, maxRailColumns, railColumns, railRows } = await import('../src/console/libraryRail');
  assert.equal(railColumns(6, 6), 6, 'telewizor: sześć gier stoi w jednym rzędzie');
  assert.equal(railColumns(6, 4), 3, 'komputer: sześć gier to dwa równe rzędy po 3, nie 4 + 2');
  assert.equal(railColumns(4, 4), 4, 'cztery gry mieszczą się w jednym rzędzie');
  assert.equal(railColumns(8, 4), 4, 'osiem gier dzieli się bez reszty');
  assert.equal(railColumns(5, 4), 3, 'pięć gier: 3 + 2 zamiast 4 + 1');
  assert.equal(railColumns(7, 6), 4, 'siedem gier: 4 + 3 — najmniej rzędów i najpełniejszy ostatni');
  assert.equal(railColumns(1, 6), 1, 'jedna gra to jeden kafelek');
  assert.equal(railColumns(0, 6), 1, 'pusta półka nie dzieli przez zero');
  assert.equal(railRows(6, 3), 2, 'liczba rzędów idzie z liczby kolumn (CSS czyta ją z `data-rows`)');
  assert.equal(railRows(6, 0), 0, 'zero kolumn nie wywraca rzędów');
  for (let count = 2; count <= 24; count++) {
    for (const max of [2, 3, 4, RAIL_MAX_COLUMNS]) {
      const columns = railColumns(count, max);
      assert.ok(Number.isInteger(columns) && columns >= 1 && columns <= Math.min(max, RAIL_MAX_COLUMNS),
        `${count} gier przy ${max} kolumnach: liczba kolumn w zakresie`);
      if (count <= max) {
        assert.equal(columns, count, `${count} gier mieści się w jednym rzędzie`);
        continue;
      }
      const rows = railRows(count, columns);
      const options: Array<{ columns: number; rows: number; fill: number }> = [];
      for (let c = max; c >= 2; c--) options.push({ columns: c, rows: Math.ceil(count / c), fill: (count % c || c) / c });
      const exact = options.find(option => count % option.columns === 0);
      if (exact) {
        assert.equal(columns, exact.columns, `${count} gier przy ${max} kolumnach dzieli się bez reszty na ${exact.columns}`);
        continue;
      }
      const minRows = Math.min(...options.map(option => option.rows));
      assert.equal(rows, minRows, `${count} gier przy ${max} kolumnach: najmniej rzędów`);
      const bestFill = Math.max(...options.filter(option => option.rows === minRows).map(option => option.fill));
      assert.ok(Math.abs(((count % columns) || columns) / columns - bestFill) < 1e-9,
        `${count} gier przy ${max} kolumnach: najpełniejszy ostatni rząd`);
    }
  }
  assert.equal(maxRailColumns(1920), 6, 'telewizor ma najszerszą półkę');
  assert.equal(maxRailColumns(2560), 6, 'duży monitor nie dostaje więcej niż sufit kolumn');
  assert.equal(maxRailColumns(1440), 4, 'komputer: cztery kolumny');
  assert.equal(maxRailColumns(1024), 3, 'tablet: trzy kolumny');
  assert.equal(maxRailColumns(390), 2, 'telefon: dwie kolumny (w pionie i tak rządzi przewijacz)');
  assert.equal(maxRailColumns(Number.NaN), RAIL_BREAKPOINTS[RAIL_BREAKPOINTS.length - 1].maxColumns,
    'brak pomiaru okna nie wywraca półki');
  assert.ok(RAIL_BREAKPOINTS.every((step, i) => i === 0 || step.minWidth < RAIL_BREAKPOINTS[i - 1].minWidth),
    'progi są malejące — pierwszy pasujący wygrywa');
}
console.log('RAIL SELFTEST: OK (kolumny półki bez rzędów-sierot: 2–24 gry na czterech szerokościach ekranu)');
