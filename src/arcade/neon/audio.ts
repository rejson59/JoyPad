export type Sfx = 'pickup' | 'item' | 'boost' | 'hit' | 'explosion' | 'beep' | 'go' | 'wall' | 'lap' | 'shoot' | 'finish' | 'land' | 'bump' | 'shield';

export class AudioFX {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private engOsc: OscillatorNode[] = [];
  private engFilter!: BiquadFilterNode;
  private engGain!: GainNode;
  private screechGain!: GainNode;
  private screechFilter!: BiquadFilterNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private rainGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private musicTimer: number | null = null;
  private nextNote = 0;
  private step = 0;
  musicOn = true;

  init(rain: boolean) {
    if (this.ctx) return;
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    let ctx: AudioContext;
    try { ctx = new Ctx(); } catch { return; }
    this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.7;
    this.master.connect(comp).connect(ctx.destination);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.gain.value = 0.32;
    this.musicBus.connect(this.master);

    // szum
    this.noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;

    // silnik
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 800;
    this.engFilter.Q.value = 4;
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter.connect(this.engGain).connect(this.sfxBus);
    const types: OscillatorType[] = ['sawtooth', 'square', 'sine'];
    const vols = [0.25, 0.12, 0.4];
    types.forEach((t, i) => {
      const o = ctx.createOscillator();
      o.type = t;
      const g = ctx.createGain();
      g.gain.value = vols[i];
      o.connect(g).connect(this.engFilter);
      o.start();
      this.engOsc.push(o);
    });

    // pisk opon
    const sn = ctx.createBufferSource();
    sn.buffer = this.noiseBuf;
    sn.loop = true;
    this.screechFilter = ctx.createBiquadFilter();
    this.screechFilter.type = 'bandpass';
    this.screechFilter.frequency.value = 1800;
    this.screechFilter.Q.value = 6;
    this.screechGain = ctx.createGain();
    this.screechGain.gain.value = 0;
    sn.connect(this.screechFilter).connect(this.screechGain).connect(this.sfxBus);
    sn.start();

    // wiatr
    const wn = ctx.createBufferSource();
    wn.buffer = this.noiseBuf;
    wn.loop = true;
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 400;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wn.connect(this.windFilter).connect(this.windGain).connect(this.sfxBus);
    wn.start();

    // deszcz
    const rn = ctx.createBufferSource();
    rn.buffer = this.noiseBuf;
    rn.loop = true;
    const rf = ctx.createBiquadFilter();
    rf.type = 'highpass';
    rf.frequency.value = 3000;
    this.rainGain = ctx.createGain();
    this.rainGain.gain.value = rain ? 0.06 : 0;
    rn.connect(rf).connect(this.rainGain).connect(this.sfxBus);
    rn.start();
  }

  resume() {
    this.ctx?.resume();
  }

  suspend() {
    this.ctx?.suspend();
  }

  setEngine(speedRatio: number, throttle: number, boost: boolean, drift: boolean, driftLevel: number, air: boolean) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const r = Math.max(0, Math.min(1.4, Math.abs(speedRatio)));
    // symulacja skrzyni biegów
    const gears = 5;
    const gr = Math.min(r, 0.999) * gears;
    const gear = Math.floor(gr);
    const frac = gr - gear;
    const rpm = 0.35 + frac * 0.65;
    let f = 48 + rpm * 95 + gear * 14 + (boost ? 40 : 0) + (air ? 30 : 0);
    if (r > 0.999) f = 48 + 95 + gears * 14 + (r - 1) * 120 + (boost ? 40 : 0);
    this.engOsc[0].frequency.setTargetAtTime(f, t, 0.05);
    this.engOsc[1].frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engOsc[2].frequency.setTargetAtTime(f * 0.25, t, 0.05);
    this.engFilter.frequency.setTargetAtTime(400 + throttle * 1400 + r * 900 + (boost ? 1200 : 0), t, 0.08);
    this.engGain.gain.setTargetAtTime(0.1 + throttle * 0.1 + r * 0.06, t, 0.1);
    this.screechGain.gain.setTargetAtTime(drift && !air ? 0.09 + driftLevel * 0.02 : 0, t, 0.05);
    this.screechFilter.frequency.setTargetAtTime(1500 + driftLevel * 500, t, 0.1);
    this.windGain.gain.setTargetAtTime(r * r * 0.12, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(300 + r * 1200, t, 0.2);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, when = 0, slideTo?: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, vol: number, type: BiquadFilterType, freq: number, when = 0, freqEnd?: number, bus?: GainNode) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(bus || this.sfxBus);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  play(s: Sfx, vol = 1) {
    if (!this.ctx) return;
    switch (s) {
      case 'pickup':
        [0, 0.05, 0.1, 0.15, 0.2].forEach((w, i) => this.tone(600 + i * 180, 0.08, 'square', 0.06 * vol, w));
        break;
      case 'item':
        this.tone(880, 0.15, 'triangle', 0.15 * vol);
        this.tone(1320, 0.25, 'triangle', 0.12 * vol, 0.08);
        break;
      case 'boost':
        this.noise(0.8, 0.35 * vol, 'bandpass', 400, 0, 3000);
        this.tone(200, 0.6, 'sawtooth', 0.08 * vol, 0, 600);
        break;
      case 'shoot':
        this.noise(0.5, 0.3 * vol, 'bandpass', 2000, 0, 300);
        this.tone(900, 0.3, 'sawtooth', 0.06 * vol, 0, 200);
        break;
      case 'hit':
        this.tone(300, 0.6, 'sawtooth', 0.15 * vol, 0, 60);
        this.noise(0.4, 0.3 * vol, 'lowpass', 1200);
        break;
      case 'explosion':
        this.noise(1.4, 0.8 * vol, 'lowpass', 1500, 0, 60);
        this.tone(90, 0.8, 'sine', 0.5 * vol, 0, 30);
        break;
      case 'wall':
        this.noise(0.25, 0.35 * vol, 'bandpass', 3000, 0, 800);
        this.tone(120, 0.15, 'square', 0.1 * vol, 0, 60);
        break;
      case 'bump':
        this.noise(0.2, 0.3 * vol, 'lowpass', 600);
        this.tone(80, 0.2, 'sine', 0.3 * vol, 0, 40);
        break;
      case 'land':
        this.noise(0.3, 0.4 * vol, 'lowpass', 500, 0, 100);
        this.tone(70, 0.25, 'sine', 0.4 * vol, 0, 35);
        break;
      case 'beep':
        this.tone(660, 0.35, 'square', 0.12 * vol);
        break;
      case 'go':
        this.tone(1320, 0.8, 'square', 0.14 * vol);
        this.tone(1760, 0.8, 'triangle', 0.08 * vol);
        break;
      case 'lap':
        [0, 0.1, 0.2].forEach((w, i) => this.tone([784, 988, 1175][i], 0.2, 'triangle', 0.15 * vol, w));
        break;
      case 'shield':
        this.tone(400, 0.6, 'sine', 0.15 * vol, 0, 1200);
        this.tone(600, 0.6, 'triangle', 0.08 * vol, 0.05, 1800);
        break;
      case 'finish':
        [523, 659, 784, 1047, 784, 1047].forEach((f, i) => this.tone(f, 0.3, 'square', 0.1 * vol, i * 0.14));
        break;
    }
  }

  // --- muzyka synthwave ---
  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.nextNote = this.ctx.currentTime + 0.1;
    this.step = 0;
    this.musicTimer = window.setInterval(() => this.schedule(), 25);
  }

  stopMusic() {
    if (this.musicTimer !== null) clearInterval(this.musicTimer);
    this.musicTimer = null;
  }

  toggleMusic() {
    this.musicOn = !this.musicOn;
    if (this.musicBus) this.musicBus.gain.value = this.musicOn ? 0.32 : 0;
  }

  private schedule() {
    if (!this.ctx) return;
    const bpm = 122;
    const s16 = 60 / bpm / 4;
    // Am - F - C - G
    const roots = [45, 41, 48, 43];
    const chords = [
      [57, 60, 64, 69],
      [53, 57, 60, 65],
      [55, 60, 64, 67],
      [55, 59, 62, 67],
    ];
    const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
    while (this.nextNote < this.ctx.currentTime + 0.12) {
      const st = this.step % 16;
      const bar = Math.floor(this.step / 16) % 4;
      const t = this.nextNote - this.ctx.currentTime;
      // bas — ósemki z oktawą
      if (st % 2 === 0) this.mtone(mtof(roots[bar] + (st % 4 === 2 ? 12 : 0)), s16 * 1.8, 'sawtooth', 0.16, t, 600);
      // arpeggio
      const ch = chords[bar];
      this.mtone(mtof(ch[st % 4] + 12), s16 * 0.9, 'square', 0.035, t, 2600);
      // stopa
      if (st % 4 === 0) this.kick(t);
      // werbel
      if (st === 4 || st === 12) this.noise(0.18, 0.18, 'highpass', 1500, t, undefined, this.musicBus);
      // hi-hat
      if (st % 2 === 1) this.noise(0.04, 0.06, 'highpass', 8000, t, undefined, this.musicBus);
      // pad na początku taktu
      if (st === 0) ch.forEach((n) => this.mtone(mtof(n), s16 * 15, 'triangle', 0.025, t, 1400));
      this.nextNote += s16;
      this.step++;
    }
  }

  private mtone(freq: number, dur: number, type: OscillatorType, vol: number, when: number, cutoff: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff * 2, t);
    f.frequency.exponentialRampToValueAtTime(cutoff * 0.4, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(f).connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private kick(when: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(40, t + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.musicBus);
    o.start(t);
    o.stop(t + 0.35);
  }

  dispose() {
    this.stopMusic();
    this.ctx?.close();
    this.ctx = null;
  }
}
