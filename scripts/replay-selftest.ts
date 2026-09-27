/** Deterministic encoder lifecycle tests. Real media decoding is in tests/moments.spec.ts. */
import assert from 'node:assert/strict';
import { ReplayRecorder } from '../src/platform/replayRecorder';
import { MomentRecorder, type Moment } from '../src/platform/momentRecorder';
import { sanitizePreferences } from '../src/console/preferences';
let now = 0;
Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => now } });
const listeners = new Set<() => void>();
let tracksStopped = 0;
class FakeCanvas {
  width = 1280; height = 720;
  getContext() { return { fillStyle: '', fillRect() {}, drawImage() {} }; }
  captureStream() { return { getTracks: () => [{ stop() { tracksStopped++; } }] }; }
}
const doc = { hidden: false, createElement: () => new FakeCanvas(), addEventListener: (_t: string, f: () => void) => listeners.add(f), removeEventListener: (_t: string, f: () => void) => listeners.delete(f) };
Object.defineProperty(globalThis, 'document', { configurable: true, value: doc });
Object.defineProperty(globalThis, 'HTMLCanvasElement', { configurable: true, value: FakeCanvas });
let encoderId = 0; let active = 0; let maxActive = 0;
class Encoder {
  static isTypeSupported(mime: string) { return mime === 'video/webm;codecs=vp8'; }
  id = ++encoderId; state = 'inactive'; mimeType = 'video/webm';
  ondataavailable: ((e: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  start() { this.state = 'recording'; active++; maxActive = Math.max(maxActive, active); this.ondataavailable?.({ data: new Blob([`HEADER-${this.id}|`]) }); }
  stop() { this.state = 'inactive'; active--; queueMicrotask(() => { this.ondataavailable?.({ data: new Blob([`END-${this.id}`]) }); this.onstop?.(); }); }
  pause() { this.state = 'paused'; }
  resume() { this.state = 'recording'; }
}
Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: Encoder });
const source = new FakeCanvas() as unknown as HTMLCanvasElement;
const event = (id: number): Moment => ({ id, kind: 'kill', slot: 0, title: 'Test', detail: 'test fixture', at: now / 1000, weight: 60, name: 'Ada', color: '#edbd78' });
const state = (r: ReplayRecorder) => r as unknown as { segments: { recorder: Encoder; bytes: number }[]; bytes: number; marks: Map<number, unknown> };
const draw = async (r: ReplayRecorder, t: number) => { now = t; r.frame(source); await Promise.resolve(); };

const recorder = new ReplayRecorder(); recorder.setPaused(false);
await draw(recorder, 0); await draw(recorder, 1000); await draw(recorder, 4000);
const first = event(1); recorder.mark(first, [first]);
await draw(recorder, 6000); await draw(recorder, 8000);
recorder.setPaused(true); now = 58_000; recorder.frame(source);
assert.equal(state(recorder).segments.length, 2, 'pause never starts empty replacement windows');
recorder.setPaused(false);
await draw(recorder, 59_000); await draw(recorder, 62_000); await draw(recorder, 68_000);
const second = event(2); recorder.mark(second, [first, second]);
for (let t = 69_000; t <= 100_000; t += 1000) await draw(recorder, t);
assert.ok(state(recorder).segments.length <= 7, 'rolling windows evicted, selected windows pinned');
assert.ok(maxActive <= 2, `bounded encoders: ${maxActive}`);
const output = await recorder.finish([first, second]);
assert.ok(output.every(m => m.replay), 'early highlights survive a long round');
assert.equal(output[0].replay!.duration, 12, '50s pause is not part of the recording');
assert.equal(output[0].replay!.eventOffset, 4);
for (const m of output) {
  const content = await (await fetch(m.replay!.url)).text();
  assert.match(content, /^HEADER-\d+\|END-\d+$/, 'each exported blob contains its own original header and final payload');
}
assert.equal(state(recorder).bytes, 0); assert.equal(state(recorder).segments.length, 0);
assert.equal(active, 0); assert.equal(listeners.size, 0);
const urls = output.map(m => m.replay!.url); recorder.dispose(); recorder.dispose();
for (const url of urls) await assert.rejects(fetch(url), 'exit revokes object URLs');
assert.ok(tracksStopped > 0);

now = 0; const aborted = new ReplayRecorder(); aborted.setPaused(false);
await draw(aborted, 0); await draw(aborted, 500); const mark = event(3); aborted.mark(mark, [mark]);
const pending = aborted.finish([mark]); aborted.dispose();
assert.deepEqual(await pending, [], 'late finalization cannot resurrect a disposed round');
assert.equal(active, 0);

now = 0; const budget = new ReplayRecorder(true, { maxBytes: 1 }); budget.setPaused(false);
await draw(budget, 0);
assert.match(budget.notice, /limit pamięci/); assert.equal(state(budget).bytes, 0);
assert.equal((await budget.finish([event(4)]))[0].replay, undefined);
budget.dispose();
assert.equal(listeners.size, 0);

const disabled = new ReplayRecorder(false); assert.match(disabled.notice, /wyłączone/); disabled.dispose();
Object.defineProperty(globalThis, 'MediaRecorder', { configurable: true, value: undefined });
const unsupported = new ReplayRecorder(); assert.match(unsupported.notice, /nie obsługuje/);
assert.equal((await unsupported.finish([event(5)]))[0].replay, undefined); unsupported.dispose();
assert.equal(sanitizePreferences({}).replays, true); assert.equal(sanitizePreferences({ replays: false }).replays, false);
let forwarded = 0;
const events = new MomentRecorder('tanks', (m, highlights) => { forwarded++; assert.ok(highlights.some(h => h.id === m.id)); });
events.observe({ timeLeft: 100, countdown: 0, paused: false, players: [{ slot: 0, name: 'Ada', color: '#fff', score: 0 }] });
events.fx(0, 'kill'); assert.equal(forwarded, 1);
console.log('REPLAY SELFTEST: OK (independent headers, pre-roll, pause clock, bounded encoders/buffers, pinned early highlights, flush, abort, URLs, memory limit, unsupported, opt-out)');
