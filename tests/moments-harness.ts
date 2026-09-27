/** Browser-only test harness. Not imported by the app or included in production bundles. */
import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ReplayRecorder } from '../src/platform/replayRecorder';
import { MomentRecorder, type Moment } from '../src/platform/momentRecorder';
import { Moments } from '../src/platform/Moments';
import { gameInfo } from '../src/arcade/catalog';
import '../src/index.css';
import '../src/console/palette.css';
import '../src/console/console.css';
import '../src/console/cinema.css';
import '../src/platform/platform.css';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const marker = (id: number): Moment => ({ id, slot: 0, title: `Test nagrania ${id}`, detail: 'Znacznik scenariusza testowego — nie fikcyjna akcja w aplikacji.', at: id, kind: 'objective', weight: 80, color: '#edbd78', name: 'Tester' });
let active: ReplayRecorder | null = null;
let results: Moment[] = [];

export async function syntheticRecording() {
  const recorder = active = new ReplayRecorder(true, { segmentMs: 2400, strideMs: 1200, preRollMs: 600 });
  const source = document.createElement('canvas'); source.width = 640; source.height = 360;
  document.body.append(source);
  const ctx = source.getContext('2d')!;
  let run = true; let raf = 0;
  const start = performance.now();
  const frame = () => {
    if (!run) return;
    const elapsed = performance.now() - start;
    ctx.fillStyle = elapsed < 1400 ? '#ff3030' : '#2050ff'; ctx.fillRect(0, 0, 640, 360);
    ctx.fillStyle = '#fff'; ctx.fillRect((elapsed / 3) % 500, 80, 90, 90);
    recorder.frame(source); raf = requestAnimationFrame(frame);
  };
  recorder.setPaused(false); frame();
  await sleep(900); const first = marker(1); recorder.mark(first, [first]);
  await sleep(1100); const second = marker(2); recorder.mark(second, [first, second]);
  // Include a viewport resize: output resolution remains fixed and seekable.
  source.width = 960; source.height = 540;
  await sleep(1200);
  const clips = results = await recorder.finish([first, second]);
  run = false; cancelAnimationFrame(raf); source.remove();
  const root = document.createElement('div'); document.body.append(root);
  createRoot(root).render(createElement(Moments, { moments: clips, info: gameInfo('tanks') }));
  return clips.map(m => ({ ...m, replay: m.replay }));
}

async function decode(url: string) {
  const video = document.createElement('video'); video.muted = true; video.src = url; video.preload = 'auto'; document.body.append(video);
  await new Promise<void>((resolve, reject) => { video.onloadeddata = () => resolve(); video.onerror = () => reject(new Error('Cannot decode recording')); });
  const duration = video.duration;
  await new Promise<void>((resolve, reject) => { const timeout = setTimeout(() => reject(new Error('seek timeout')), 8000); video.onseeked = () => { clearTimeout(timeout); resolve(); }; video.currentTime = Math.max(.01, duration * .6); });
  await video.play(); await sleep(100); video.pause();
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 36;
  const ctx = canvas.getContext('2d')!; ctx.drawImage(video, 0, 0, 64, 36);
  const pixels = ctx.getImageData(0, 0, 64, 36).data;
  let lit = 0;
  for (let i = 0; i < pixels.length; i += 4) if (Math.max(pixels[i], pixels[i + 1], pixels[i + 2]) > 25) lit++;
  const width = video.videoWidth, height = video.videoHeight;
  video.pause(); video.removeAttribute('src'); video.load(); video.remove();
  return { duration, width, height, lit };
}

export async function decodeResults() { return Promise.all(results.filter(m => m.replay).map(m => decode(m.replay!.url))); }
export function dispose() { active?.dispose(); }

/** Actual engine rendering hooks — both Three.js games replace the placeholder canvas.
 * A fixture marker chooses a window so tests don't depend on random combat/AI outcomes. */
export async function engineRecording(id: 'tanks' | 'race' | 'orbit', split = false) {
  const recorder = active = new ReplayRecorder();
  const container = document.createElement('div'); container.style.cssText = 'position:relative;width:960px;height:540px'; document.body.append(container);
  const canvas = document.createElement('canvas'); container.append(canvas);
  const players = [0, 1].map(slot => ({ slot, name: `Player ${slot}`, color: '#edbd78', isBot: false }));
  let frameCount = 0; let overlaySeen = false; let canvasReplaced = false;
  const onFrame = (surface: HTMLCanvasElement, overlay?: HTMLCanvasElement) => {
    frameCount++; overlaySeen ||= !!overlay; canvasReplaced ||= surface !== canvas;
    recorder.frame(surface, overlay);
  };
  const events = new MomentRecorder(id, (moment, highlights) => recorder.mark(moment, highlights));
  const config = { players, padInputs: [{ fwd: 1, turn: 0, fire: true, dirX: 0, dirY: -1 }, { fwd: 1, turn: 0, fire: true, dirX: 0, dirY: -1 }], primary: 0, secondary: 0, displayMode: split ? 'split' as const : 'shared' as const, quality: 'performance' as const,
    onFrame, onHud() {}, onFinish() {}, onFx(slot: number, fx: Parameters<MomentRecorder['fx']>[1]) { events.fx(slot, fx); } };
  let engine: { start(): void; destroy(): void };
  if (id === 'tanks') {
    const { TankGame } = await import('../src/game/engine'); const { PLAYER_DEFS } = await import('../src/game/types');
    const game = new TankGame(canvas, { players: PLAYER_DEFS.map(p => ({ ...p, enabled: true, isBot: true })), mapId: 'desert', mode: 'deathmatch', killLimit: 99, lives: 99, timeLimit: 300, onFrame, onHud() {}, onKill() {}, onGameOver() {}, onPadFx: config.onFx });
    game.countdown = 0; engine = game;
  } else if (id === 'race') {
    const { NeonCircuitRound } = await import('../src/arcade/neon/NeonCircuitRound'); engine = new NeonCircuitRound(canvas, config);
  } else {
    const { StarClashRound } = await import('../src/arcade/starclash/StarClashRound'); engine = new StarClashRound(canvas, config);
  }
  recorder.setPaused(false); engine.start();
  // Software WebGL can be slow in CI. Wait for REAL rendered frames, not just a timer.
  const deadline = performance.now() + 45_000;
  while (frameCount < 3 && performance.now() < deadline) await sleep(150);
  const m = marker(1); recorder.mark(m, [m]);
  const before = frameCount;
  while (frameCount < before + 3 && performance.now() < deadline) await sleep(150);
  await sleep(300);
  const surface = (recorder as unknown as { surface: HTMLCanvasElement }).surface;
  const sample = document.createElement('canvas'); sample.width=64; sample.height=36; const sampleContext=sample.getContext('2d')!; sampleContext.drawImage(surface,0,0,64,36); const rgb=sampleContext.getImageData(0,0,64,36).data; const sourceLit=Array.from(rgb).filter((v,i)=>i%4!==3 && v>25).length;
  const clips = await recorder.finish([m]);
  engine.destroy(); container.remove();
  if (!clips[0]?.replay) throw new Error(`Missing ${id} recording: ${recorder.notice}, frames=${frameCount}`);
  const decoded = await decode(clips[0].replay.url);
  recorder.dispose();
  return { ...decoded, frameCount, overlaySeen, canvasReplaced, sourceLit };
}
