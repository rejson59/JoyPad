import type { ScoreEvent } from './timeline';
import type { SoundKind } from './script';

/**
 * Dźwięk filmu — syntezowany w przeglądarce, zero plików audio.
 *
 * Dlaczego tak: film musi działać na telewizorze bez sieci i bez pobierania
 * megabajtów, a jednocześnie nie może być niemy (premium czuć w miksie).
 * Każdy dźwięk to kilka oscylatorów albo jeden bufor szumu — powstaje w chwili
 * odtworzenia, więc nic nie waży i nie da się „nie załadować".
 *
 * Ścieżka jest planowana z góry (`scoreEvents` z osi czasu), więc pauza
 * i powrót do sceny odtwarzają dokładnie ten sam miks. Cały moduł milczy,
 * gdy w ustawieniach systemu wyłączono dźwięk — i nigdy nie rzuca wyjątkiem,
 * jeśli przeglądarka nie pozwala na AudioContext.
 */

const MASTER = .42;

function semitone(note: number): number {
  return 261.63 * Math.pow(2, note / 12);
}

interface Voice { stop: () => void }

export class FilmScore {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices: Voice[] = [];
  private enabled = true;

  get ready(): boolean { return this.ctx !== null; }

  /** Tworzy kontekst. Wołane wyłącznie z gestu użytkownika (klik / przycisk pada). */
  arm(enabled: boolean): boolean {
    this.enabled = enabled;
    if (!enabled) return false;
    if (this.ctx) return true;
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return false;
      const ctx = new Ctor();
      const master = ctx.createGain();
      master.gain.value = MASTER;
      const shelf = ctx.createBiquadFilter();
      shelf.type = 'highshelf';
      shelf.frequency.value = 5200;
      shelf.gain.value = -3;
      const compressor = ctx.createDynamicsCompressor();
      compressor.threshold.value = -16;
      compressor.ratio.value = 3;
      master.connect(shelf).connect(compressor).connect(ctx.destination);
      this.ctx = ctx;
      this.master = master;
      const length = Math.floor(ctx.sampleRate * 1.2);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
      return true;
    } catch { return false; }
  }

  /** Odtwarza wszystkie zdarzenia od pozycji `fromMs` (względem początku filmu). */
  play(events: ScoreEvent[], fromMs = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    this.stop();
    if (ctx.state === 'suspended') void ctx.resume();
    const now = ctx.currentTime + .05;
    for (const event of events) {
      const delay = (event.atMs - fromMs) / 1000;
      if (delay < -0.25) continue;
      this.schedule(event.kind, now + Math.max(0, delay), event.gain, event.note);
    }
  }

  pause() { if (this.ctx?.state === 'running') void this.ctx.suspend(); }
  resume() { if (this.ctx?.state === 'suspended') void this.ctx.resume(); }

  stop() {
    for (const voice of this.voices) { try { voice.stop(); } catch { /* już zatrzymany */ } }
    this.voices = [];
  }

  dispose() {
    this.stop();
    try { void this.ctx?.close(); } catch { /* nic nie szkodzi */ }
    this.ctx = null; this.master = null; this.noise = null;
  }

  /** Jeden dźwięk — odtwarzany teraz (używane przez UI filmu: kliknięcia, wybory). */
  blip(kind: SoundKind, gain = .5, note = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    if (ctx.state === 'suspended') void ctx.resume();
    this.schedule(kind, ctx.currentTime + .01, gain, note);
  }

  private keep(node: { stop: (when?: number) => void }, gain: GainNode, release: number, at: number) {
    const voice: Voice = {
      stop: () => {
        try { gain.gain.cancelScheduledValues(0); gain.gain.setValueAtTime(0, 0); } catch { /* ignoruj */ }
        try { node.stop(0); } catch { /* ignoruj */ }
      },
    };
    this.voices.push(voice);
    window.setTimeout(() => {
      this.voices = this.voices.filter(item => item !== voice);
      try { node.stop(); } catch { /* sam się skończył */ }
    }, Math.max(200, (at * 1000) + (release * 1000) + 400));
  }

  private noiseSource(at: number, duration: number, type: BiquadFilterType, from: number, to: number, gain: number, q = 1) {
    const ctx = this.ctx; const master = this.master;
    if (!ctx || !master || !this.noise) return;
    const source = ctx.createBufferSource();
    source.buffer = this.noise;
    source.loop = true;
    source.playbackRate.value = .9 + Math.random() * .2;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.Q.value = q;
    filter.frequency.setValueAtTime(Math.max(60, from), at);
    filter.frequency.exponentialRampToValueAtTime(Math.max(60, to), at + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(gain, at + Math.min(.12, duration * .25));
    amp.gain.exponentialRampToValueAtTime(.0001, at + duration);
    source.connect(filter).connect(amp).connect(master);
    source.start(at);
    this.keep(source, amp, duration, duration);
  }

  private tone(at: number, duration: number, frequency: number, gain: number, type: OscillatorType = 'sine', bend = 0, attack = .01) {
    const ctx = this.ctx; const master = this.master;
    if (!ctx || !master) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, at);
    if (bend) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency * bend), at + duration);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(gain, at + attack);
    amp.gain.exponentialRampToValueAtTime(.0001, at + duration);
    osc.connect(amp).connect(master);
    osc.start(at);
    this.keep(osc, amp, duration, duration);
  }

  private schedule(kind: SoundKind, at: number, gain: number, note: number) {
    const f = semitone(note);
    switch (kind) {
      case 'hum': {
        const ctx = this.ctx; const master = this.master;
        if (!ctx || !master) return;
        const amp = ctx.createGain();
        amp.gain.setValueAtTime(0, at);
        amp.gain.linearRampToValueAtTime(gain * .5, at + 1.6);
        amp.gain.setValueAtTime(gain * .5, at + 30);
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = .07;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 120;
        lfo.connect(lfoGain).connect(filter.frequency);
        amp.connect(filter).connect(master);
        for (const [mult, level] of [[.5, .55], [1, .3], [1.5, .12]] as const) {
          const osc = ctx.createOscillator();
          osc.type = 'triangle';
          osc.frequency.value = 55 * mult * (1 + (Math.random() - .5) * .01);
          const voice = ctx.createGain();
          voice.gain.value = level;
          osc.connect(voice).connect(amp);
          osc.start(at);
          this.keep(osc, amp, 40, 40);
        }
        lfo.start(at);
        this.keep(lfo, amp, 40, 40);
        return;
      }
      case 'whoosh': this.noiseSource(at, .75, 'bandpass', 260, 2400, gain * .5, 1.4); break;
      case 'sweep': this.noiseSource(at, 1.1, 'bandpass', 1800, 220, gain * .4, 2.2); break;
      case 'riser': this.noiseSource(at, 1.5, 'bandpass', 200, 5200, gain * .38, 3); this.tone(at, 1.5, f * .5, gain * .12, 'triangle', 2.4, .5); break;
      case 'impact': {
        this.tone(at, .9, 92, gain * .55, 'sine', .35, .006);
        this.noiseSource(at, .5, 'lowpass', 1400, 180, gain * .45, .8);
        break;
      }
      case 'tick': this.tone(at, .16, f * 2, gain * .3, 'triangle', .98, .004); this.noiseSource(at, .1, 'highpass', 2400, 2400, gain * .18, 1); break;
      case 'ui': this.tone(at, .12, f * 3, gain * .22, 'square', .9, .003); break;
      case 'chime': {
        for (const [i, mult] of [1, 1.5, 2, 3].entries()) this.tone(at + i * .09, 1.2 - i * .18, f * mult, gain * (.24 - i * .04), 'sine', 1, .01);
        break;
      }
      case 'success': this.tone(at, .3, f, gain * .3, 'triangle', 1.5, .006); this.tone(at + .14, .5, f * 1.5, gain * .26, 'sine', 1, .01); break;
    }
  }
}
