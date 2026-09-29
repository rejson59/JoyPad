import fixWebmDuration from 'fix-webm-duration';
import type { Moment } from './momentRecorder';
import type { Language } from './i18n';
import { t as translateMessage } from './i18n';

export interface ReplayClip {
  url: string;
  mime: string;
  duration: number;
  eventOffset: number;
}
export const REPLAY_LIMITS = { segmentMs: 12_000, strideMs: 6_000, preRollMs: 3_000, maxBytes: 32 * 1024 * 1024 };
type Limits = typeof REPLAY_LIMITS;
interface Segment {
  id: number;
  start: number;
  end?: number;
  recorder: MediaRecorder;
  chunks: Blob[];
  bytes: number;
  frames: number;
  failed: boolean;
  done: Promise<void>;
  resolve: () => void;
}

export function replayMime(): string | null {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined' || !HTMLCanvasElement.prototype.captureStream) return null;
  return ['video/webm;codecs=vp8', 'video/webm;codecs=vp9', 'video/mp4'].find(type => MediaRecorder.isTypeSupported(type)) ?? null;
}

/** Each overlapping window owns a NEW encoder/header. Never cut MediaRecorder timeslices
 * into pretend standalone clips. At most two encoders run; only the best windows and
 * a short rolling tail survive. Source pixels are copied synchronously AFTER rendering,
 * before the browser clears WebGL's drawing buffer. No screen/camera/microphone access. */
export class ReplayRecorder {
  notice = '';
  private surface: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private stream: MediaStream | null = null;
  private mime = '';
  private segments: Segment[] = [];
  private marks = new Map<number, { segment: number; at: number }>();
  private pinned = new Set<number>();
  private urls = new Set<string>();
  private bytes = 0;
  private serial = 0;
  private paused = true;
  private gamePaused = true;
  private elapsed = 0;
  private resumedAt = performance.now();
  private lastFrame = -Infinity;
  private disposed = false;
  private stopping = false;
  private ending = false;
  private stopWaits = new Map<Segment, ReturnType<typeof setTimeout>>();
  private readonly limits: Limits;
  private readonly language: Language;

  constructor(enabled = true, limits: Partial<Limits> = {}, language: Language = 'pl') {
    this.limits = { ...REPLAY_LIMITS, ...limits };
    this.language = language;
    if (!enabled) { this.notice = translateMessage(language, 'replay.recordingDisabled'); return; }
    try {
      const mime = replayMime();
      if (!mime) { this.notice = translateMessage(language, 'replay.unsupported'); return; }
      this.mime = mime;
      this.surface = document.createElement('canvas');
      this.surface.width = 1280; this.surface.height = 720;
      this.ctx = this.surface.getContext('2d', { alpha: false });
      if (!this.ctx) throw new Error('Canvas2D unavailable');
      document.addEventListener('visibilitychange', this.visibility);
    } catch { this.fail(translateMessage(this.language, 'replay.setupFailed')); }
  }

  private clock() { return this.elapsed + (this.paused ? 0 : performance.now() - this.resumedAt); }
  private visibility = () => this.applyPause(this.gamePaused || document.hidden);
  setPaused(paused: boolean) { this.gamePaused = paused; this.applyPause(paused || document.hidden); }
  private applyPause(paused: boolean) {
    if (this.paused === paused || this.stopping || this.disposed) return;
    this.elapsed = this.clock(); this.resumedAt = performance.now(); this.paused = paused;
    try {
      for (const s of this.segments) if (s.end === undefined) {
        if (paused && s.recorder.state === 'recording') s.recorder.pause();
        if (!paused && s.recorder.state === 'paused') s.recorder.resume();
      }
    } catch { this.fail(translateMessage(this.language, 'replay.pauseFailed')); }
  }

  /** Must be called in the same render task, not in a separate rAF or polling loop. */
  frame = (source: HTMLCanvasElement, overlay?: HTMLCanvasElement) => {
    if (!this.ctx || !this.surface || this.paused || this.stopping || this.disposed || this.notice) return;
    const now = this.clock();
    if ((!this.ending && now - this.lastFrame < 1000 / 24) || !source.width || !source.height) return;
    try {
      this.lastFrame = now;
      this.ctx.fillStyle = '#08080c'; this.ctx.fillRect(0, 0, 1280, 720);
      const scale = Math.min(1280 / source.width, 720 / source.height);
      const w = source.width * scale, h = source.height * scale, x = (1280 - w) / 2, y = (720 - h) / 2;
      this.ctx.drawImage(source, x, y, w, h);
      if (overlay?.width && overlay.height) this.ctx.drawImage(overlay, x, y, w, h);
      if (!this.stream) this.stream = this.surface.captureStream(24);
      // Rotate before advancing too far; no backfill of missed/hidden frames.
      for (const s of this.segments) if (s.end === undefined && now - s.start >= this.limits.segmentMs) this.stopSegment(s);
      const newest = this.segments[this.segments.length - 1];
      if (!newest || now - newest.start >= this.limits.strideMs) this.startSegment(now);
      for (const s of this.segments) if (s.end === undefined) s.frames++;
      this.prune();
    } catch { this.fail(translateMessage(this.language, 'replay.frameFailed')); }
  };

  private startSegment(start: number) {
    if (!this.stream || this.stopping) return;
    const recorder = new MediaRecorder(this.stream, { mimeType: this.mime, videoBitsPerSecond: 1_600_000 });
    let resolve!: () => void;
    const done = new Promise<void>(r => { resolve = r; });
    const s: Segment = { id: ++this.serial, start, recorder, chunks: [], bytes: 0, frames: 0, failed: false, done, resolve };
    this.segments.push(s);
    recorder.ondataavailable = event => {
      if (this.disposed || s.failed || !event.data.size) return;
      if (this.bytes + event.data.size > this.limits.maxBytes) {
        s.failed = true;
        this.fail(translateMessage(this.language, 'replay.memoryLimit'));
        return;
      }
      s.chunks.push(event.data); s.bytes += event.data.size; this.bytes += event.data.size;
    };
    recorder.onerror = () => { s.failed = true; this.fail(translateMessage(this.language, 'replay.codecFailed')); };
    recorder.onstop = () => { clearTimeout(this.stopWaits.get(s)); this.stopWaits.delete(s); resolve(); };
    recorder.start(1000); // Timeslices are retained together, INCLUDING the initial header.
  }

  private stopSegment(s: Segment) {
    if (s.end !== undefined) return;
    s.end = this.clock();
    // Some engines omit `stop` after encoder failure. Never hang the results screen.
    this.stopWaits.set(s, setTimeout(() => { s.failed = true; s.resolve(); this.stopWaits.delete(s); }, 4000));
    try {
      if (s.recorder.state !== 'inactive') s.recorder.stop();
      else { clearTimeout(this.stopWaits.get(s)); this.stopWaits.delete(s); s.resolve(); }
    } catch { s.failed = true; clearTimeout(this.stopWaits.get(s)); this.stopWaits.delete(s); s.resolve(); }
  }

  mark(moment: Moment, highlights: Moment[]) {
    if (this.disposed || this.stopping) return;
    const at = this.clock();
    const live = this.segments.filter(s => s.end === undefined && !s.failed);
    // Prefer a window with >=3s before the event and >=3s left afterwards.
    const chosen = [...live].reverse().find(s => at - s.start >= this.limits.preRollMs) ?? live[0];
    if (chosen) this.marks.set(moment.id, { segment: chosen.id, at });
    this.pinned = new Set(highlights.flatMap(m => { const mark = this.marks.get(m.id); return mark ? [mark.segment] : []; }));
    this.prune();
  }

  private prune() {
    const now = this.clock();
    this.segments = this.segments.filter(s => {
      if (s.end === undefined || this.stopWaits.has(s) || this.pinned.has(s.id) || now - s.end < this.limits.segmentMs) return true;
      this.bytes -= s.bytes; s.chunks = [];
      for (const [id, m] of this.marks) if (m.segment === s.id) this.marks.delete(id);
      return false;
    });
  }

  private fail(message: string) {
    if (this.disposed) return;
    this.notice = message;
    this.stopping = true;
    for (const s of this.segments) if (s.end === undefined) { s.failed = true; this.stopSegment(s); }
    this.stream?.getTracks().forEach(track => track.stop());
  }

  async finish(moments: Moment[]): Promise<Moment[]> {
    this.ending = true;
    // onFinish can happen in update(), before the final render. Allow that frame through.
    await Promise.resolve();
    if (this.disposed) return [];
    this.stopping = true;
    for (const s of this.segments) this.stopSegment(s);
    await Promise.all(this.segments.map(s => s.done));
    this.stream?.getTracks().forEach(track => track.stop());
    document.removeEventListener('visibilitychange', this.visibility);
    if (this.disposed) return [];
    const output: Moment[] = [];
    const clips = new Map<number, Omit<ReplayClip, 'eventOffset'>>();
    for (const moment of moments) {
      const mark = this.marks.get(moment.id);
      const s = mark && this.segments.find(candidate => candidate.id === mark.segment);
      if (!s || !mark || s.failed || !s.bytes || s.frames < 2 || (s.end! - s.start) < 150) { output.push(moment); continue; }
      let clip = clips.get(s.id);
      if (!clip) {
        let blob = new Blob(s.chunks, { type: s.recorder.mimeType || this.mime });
        const duration = (s.end! - s.start) / 1000;
        // MediaRecorder WebM lacks duration metadata. Fix the header, without transcoding.
        if (blob.type.includes('webm')) {
          try { blob = await fixWebmDuration(blob, duration * 1000, { logger: false }); } catch { /* Still a valid sequential recording. */ }
        }
        if (this.disposed) return [];
        const url = URL.createObjectURL(blob); this.urls.add(url);
        clip = { url, mime: blob.type, duration }; clips.set(s.id, clip);
      }
      output.push({ ...moment, replay: { ...clip, eventOffset: Math.max(0, Math.min(clip.duration, (mark.at - s.start) / 1000)) } });
    }
    // Results keep only up to three URL-backed clips, not the rolling buffers/encoders.
    this.segments = []; this.marks.clear(); this.bytes = 0;
    this.surface = null; this.ctx = null; this.stream = null;
    return output;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true; this.stopping = true;
    document.removeEventListener('visibilitychange', this.visibility);
    for (const s of this.segments) {
      s.recorder.ondataavailable = null; s.recorder.onerror = null; s.recorder.onstop = null;
      try { if (s.recorder.state !== 'inactive') s.recorder.stop(); } catch { /* Already failed. */ }
      s.resolve(); s.chunks = [];
    }
    this.stopWaits.forEach(clearTimeout); this.stopWaits.clear();
    this.stream?.getTracks().forEach(track => track.stop());
    this.urls.forEach(url => URL.revokeObjectURL(url)); this.urls.clear();
    this.segments = []; this.marks.clear(); this.bytes = 0;
    this.surface = null; this.ctx = null; this.stream = null;
  }
}
