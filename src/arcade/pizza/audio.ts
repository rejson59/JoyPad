export class AudioBus {
  ctx: AudioContext | null = null;
  master: GainNode | null = null;
  musicGain: GainNode | null = null;
  sfxGain: GainNode | null = null;
  muted = false;
  ready = false;
  nextNote = 0;
  step = 0;
  noise: AudioBuffer | null = null;

  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.85;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.055;
      this.musicGain.connect(this.master);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.7;
      this.sfxGain.connect(this.master);
      const len = Math.floor(this.ctx.sampleRate * 0.2);
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.ready = true;
  }

  toggle() {
    this.unlock();
    this.muted = !this.muted;
    this.master?.gain.setTargetAtTime(this.muted ? 0 : 0.85, this.ctx!.currentTime, 0.04);
    return !this.muted;
  }

  /** Wyciszenie z platformy (przycisk dźwięku w pasku gry) — działa też, zanim powstanie kontekst audio. */
  setMuted(on: boolean) {
    this.muted = on;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(on ? 0 : 0.85, this.ctx.currentTime, 0.04);
  }

  /** Zwalnia kontekst audio — runda kończy się co chwilę, a przeglądarki limitują ich liczbę. */
  dispose() {
    const ctx = this.ctx;
    this.ready = false;
    this.ctx = null;
    this.master = null;
    this.musicGain = null;
    this.sfxGain = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => undefined);
  }

  tick() {
    if (!this.ctx || !this.ready || this.muted || !this.musicGain) return;
    const eighth = 60 / 100 / 2;
    while (this.nextNote < this.ctx.currentTime + 0.16) {
      this.schedule(this.nextNote, this.step % 32);
      this.step++;
      this.nextNote += eighth;
    }
  }

  private schedule(time: number, step: number) {
    const chords = [
      [146.83, 220.0, 293.66],
      [174.61, 233.08, 349.23],
      [196.0, 246.94, 392.0],
      [130.81, 196.0, 329.63],
    ];
    const chord = chords[Math.floor(step / 8) % 4];
    if (step % 2 === 0) this.tone(chord[0] / 2, time, 0.16, "sine", 0.22, this.musicGain!);
    if (step % 4 === 0) {
      this.tone(chord[1], time, 0.42, "triangle", 0.045, this.musicGain!);
      this.tone(chord[2] / 2, time, 0.5, "sine", 0.03, this.musicGain!);
    }
    if (step % 2 === 1) this.hat(time, 0.018);
    if (step % 16 === 4) this.tone(chord[2], time, 0.18, "triangle", 0.03, this.musicGain!);
  }

  private tone(
    freq: number,
    time: number,
    dur: number,
    type: OscillatorType,
    vol: number,
    dest: AudioNode,
  ) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(Math.max(40, freq), time);
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), time + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(dest);
    o.start(time);
    o.stop(time + dur + 0.02);
  }

  private hat(time: number, vol: number) {
    if (!this.ctx || !this.noise || !this.musicGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7000;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.04);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.musicGain);
    src.start(time);
    src.stop(time + 0.05);
  }

  private burst(time: number, dur: number, freq: number, vol: number) {
    if (!this.ctx || !this.noise || !this.sfxGain) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(freq, time);
    filter.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, time);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.sfxGain);
    src.start(time);
    src.stop(time + dur + 0.02);
  }

  thwip() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.tone(720, t, 0.12, "sawtooth", 0.05, this.sfxGain!);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(640, t);
    o.frequency.exponentialRampToValueAtTime(120, t + 0.12);
    g.gain.setValueAtTime(0.08, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.13);
    o.connect(g);
    g.connect(this.sfxGain!);
    o.start(t);
    o.stop(t + 0.14);
    this.burst(t, 0.08, 1400, 0.05);
  }

  whoosh(power = 1) {
    if (!this.ctx || this.muted) return;
    this.burst(this.ctx.currentTime, 0.18, 500 + power * 200, 0.05 + power * 0.03);
  }

  throw() {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    this.burst(t, 0.12, 900, 0.06);
    this.tone(320, t, 0.08, "square", 0.03, this.sfxGain!);
  }

  deliver(perfect: boolean) {
    if (!this.ctx || this.muted || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    const notes = perfect ? [523.25, 659.25, 783.99, 1046.5] : [440, 554.37, 659.25];
    notes.forEach((n, i) => this.tone(n, t + i * 0.045, 0.22, "triangle", perfect ? 0.07 : 0.055, this.sfxGain!));
  }

  splat() {
    if (!this.ctx || this.muted) return;
    this.burst(this.ctx.currentTime, 0.14, 220, 0.07);
  }

  jump() {
    if (!this.ctx || this.muted) return;
    this.tone(420, this.ctx.currentTime, 0.07, "square", 0.025, this.sfxGain!);
  }

  empty() {
    if (!this.ctx || this.muted) return;
    this.tone(140, this.ctx.currentTime, 0.08, "square", 0.03, this.sfxGain!);
  }

  resupply() {
    if (!this.ctx || this.muted) return;
    this.tone(660, this.ctx.currentTime, 0.06, "sine", 0.04, this.sfxGain!);
  }

  beep(high = false) {
    if (!this.ctx || this.muted) return;
    this.tone(high ? 880 : 520, this.ctx.currentTime, 0.09, "square", 0.04, this.sfxGain!);
  }

  go() {
    if (!this.ctx || this.muted || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    [523, 659, 784].forEach((n, i) => this.tone(n, t + i * 0.06, 0.18, "square", 0.05, this.sfxGain!));
  }

  fanfare() {
    if (!this.ctx || this.muted || !this.sfxGain) return;
    const t = this.ctx.currentTime;
    [392, 523, 659, 784, 1046].forEach((n, i) => this.tone(n, t + i * 0.09, 0.34, "triangle", 0.06, this.sfxGain!));
  }

  tickTock() {
    if (!this.ctx || this.muted) return;
    this.tone(180, this.ctx.currentTime, 0.05, "square", 0.03, this.sfxGain!);
  }

  ui() {
    if (!this.ctx || this.muted) return;
    this.tone(740, this.ctx.currentTime, 0.05, "sine", 0.03, this.sfxGain!);
  }
}
