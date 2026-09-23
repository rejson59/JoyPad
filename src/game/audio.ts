// Procedural WebAudio engine — realistic synthesized tank sounds, no assets needed.

export class GameAudio {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  engines: Map<number, { osc: OscillatorNode; osc2: OscillatorNode; gain: GainNode; filter: BiquadFilterNode; noise: AudioBufferSourceNode; noiseGain: GainNode }> = new Map();
  muted = false;
  rainGain: GainNode | null = null;
  rainSrc: AudioBufferSourceNode | null = null;

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    // gentle compressor for punch
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.knee.value = 20;
    comp.ratio.value = 8;
    this.master.connect(comp);
    comp.connect(this.ctx.destination);
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(m ? 0 : 0.55, this.ctx.currentTime, 0.05);
    }
  }

  private noiseBuffer(len = 1): AudioBuffer {
    const ctx = this.ctx!;
    const buf = ctx.createBuffer(1, ctx.sampleRate * len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---- one shots ----
  shoot(big = false) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    // crack: short noise burst highpassed
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer(0.3);
    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.setValueAtTime(big ? 3200 : 4500, t);
    nf.frequency.exponentialRampToValueAtTime(300, t + 0.18);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(big ? 0.9 : 0.65, t);
    ng.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.4 : 0.25));
    n.connect(nf); nf.connect(ng); ng.connect(this.master);
    n.start(t); n.stop(t + 0.45);
    // thump: sine drop
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(big ? 160 : 200, t);
    o.frequency.exponentialRampToValueAtTime(35, t + 0.22);
    const og = ctx.createGain();
    og.gain.setValueAtTime(big ? 1.0 : 0.8, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 0.35);
  }

  explosion(big = false) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const dur = big ? 1.4 : 0.9;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer(dur);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(big ? 2500 : 1800, t);
    f.frequency.exponentialRampToValueAtTime(60, t + dur * 0.8);
    const g = ctx.createGain();
    g.gain.setValueAtTime(big ? 1.0 : 0.75, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    n.connect(f); f.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + dur);
    // sub boom
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.6);
    const og = ctx.createGain();
    og.gain.setValueAtTime(big ? 1.0 : 0.7, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + (big ? 1.0 : 0.7));
    o.connect(og); og.connect(this.master);
    o.start(t); o.stop(t + 1.1);
  }

  hitMetal() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    [523, 784, 1244, 2093].forEach((fq, i) => {
      const o = ctx.createOscillator();
      o.type = 'square';
      o.frequency.value = fq * (0.9 + Math.random() * 0.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.12 / (i + 1), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25 + Math.random() * 0.15);
      o.connect(g); g.connect(this.master!);
      o.start(t); o.stop(t + 0.5);
    });
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer(0.15);
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2000;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    n.connect(f); f.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + 0.15);
  }

  ricochet() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(2800 + Math.random() * 1200, t);
    o.frequency.exponentialRampToValueAtTime(500, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.45);
  }

  pickup() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    [440, 554, 659, 880].forEach((fq, i) => {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = fq;
      const g = ctx.createGain();
      const st = t + i * 0.07;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.25, st + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, st + 0.2);
      o.connect(g); g.connect(this.master!);
      o.start(st); o.stop(st + 0.25);
    });
  }

  uiClick() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square'; o.frequency.value = 880;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.07);
  }

  countdownBeep(final = false) {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine'; o.frequency.value = final ? 880 : 440;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (final ? 0.5 : 0.18));
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.55);
  }

  wallBreak() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const n = ctx.createBufferSource();
    n.buffer = this.noiseBuffer(0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = 400; f.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    n.connect(f); f.connect(g); g.connect(this.master);
    n.start(t); n.stop(t + 0.4);
  }

  shieldHit() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(300, t);
    o.frequency.exponentialRampToValueAtTime(1200, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.15, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + 0.25);
  }

  // ---- engine loops ----
  startEngine(id: number) {
    if (!this.ctx || !this.master || this.engines.has(id)) return;
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 38 + id * 4;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 19 + id * 2;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 220;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.value = 0.0;
    // track noise
    const noise = ctx.createBufferSource();
    noise.buffer = this.noiseBuffer(2);
    noise.loop = true;
    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass'; nf.frequency.value = 300; nf.Q.value = 0.5;
    osc.connect(filter); osc2.connect(filter);
    filter.connect(gain); gain.connect(this.master);
    noise.connect(nf); nf.connect(noiseGain); noiseGain.connect(this.master);
    osc.start(); osc2.start(); noise.start();
    this.engines.set(id, { osc, osc2, gain, filter, noise, noiseGain });
  }

  updateEngine(id: number, throttle: number, alive: boolean) {
    const e = this.engines.get(id);
    if (!e || !this.ctx) return;
    const t = this.ctx.currentTime;
    const target = alive ? 0.02 + Math.abs(throttle) * 0.05 : 0;
    e.gain.gain.setTargetAtTime(target, t, 0.1);
    e.noiseGain.gain.setTargetAtTime(alive ? Math.abs(throttle) * 0.035 : 0, t, 0.15);
    const f = 38 + id * 4 + Math.abs(throttle) * 34;
    e.osc.frequency.setTargetAtTime(f, t, 0.12);
    e.osc2.frequency.setTargetAtTime(f / 2, t, 0.12);
    e.filter.frequency.setTargetAtTime(200 + Math.abs(throttle) * 500, t, 0.15);
  }

  stopAllEngines() {
    for (const [, e] of this.engines) {
      try { e.osc.stop(); e.osc2.stop(); e.noise.stop(); } catch { /*noop*/ }
      e.gain.disconnect();
    }
    this.engines.clear();
  }

  startRain() {
    if (!this.ctx || !this.master || this.rainSrc) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer(3);
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'highpass'; f.frequency.value = 2500;
    const g = ctx.createGain();
    g.gain.value = 0.035;
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start();
    this.rainSrc = src; this.rainGain = g;
  }
  stopRain() {
    if (this.rainSrc) {
      try { this.rainSrc.stop(); } catch { /*noop*/ }
      this.rainSrc = null; this.rainGain = null;
    }
  }
}

export const gameAudio = new GameAudio();
