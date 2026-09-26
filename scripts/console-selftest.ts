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

const historyStorage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => historyStorage.get(key) ?? null,
  setItem: (key: string, value: string) => historyStorage.set(key, value),
} });
assert.equal(hasHistory(), false);
remember('game', 'race'); assert.equal(lastGame(), 'race'); assert.equal(hasHistory(), true);
remember('game', 'snake'); assert.equal(lastGame(), 'orbit'); assert.equal(hasHistory(), false);
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
const { statSync } = await import('node:fs');
let previewBytes = 0;
for (const id of ['tanks', 'race', 'orbit']) {
  for (const extension of ['mp4', 'webm']) {
    const path = `public/previews/${id}.${extension}`;
    const bytes = statSync(path).size;
    assert.ok(bytes > 10000 && bytes < 2_000_000, `${path}: bounded, nonempty clip`);
    previewBytes += bytes;
    const header = readFileSync(path).subarray(0, 16);
    if (extension === 'mp4') assert.equal(header.toString('ascii', 4, 8), 'ftyp');
    else assert.equal(header.subarray(0, 4).toString('hex'), '1a45dfa3');
  }
}
assert.ok(previewBytes < 8_000_000, 'compressed library preview asset budget');
console.log('PREVIEW SELFTEST: OK (preferences, three recordings, MP4/WebM headers and asset budget)');
