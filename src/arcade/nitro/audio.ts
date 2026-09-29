import * as THREE from 'three';

interface Engine {
  o1: OscillatorNode;
  o2: OscillatorNode;
  g: GainNode;
  f: BiquadFilterNode;
  pan: PannerNode;
  boostSrc: AudioBufferSourceNode;
  boostG: GainNode;
  boostF: BiquadFilterNode;
}

const BPM = 118;
const ROOTS = [55.0, 43.65, 65.41, 49.0];
const CHORDS = [
  [220, 261.63, 329.63, 440],
  [174.61, 220, 261.63, 349.23],
  [261.63, 329.63, 392, 523.25],
  [196, 246.94, 293.66, 392],
];

export class AudioEngine {
  ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfx!: GainNode;
  private musicGain!: GainNode;
  private crowdGain!: GainNode;
  private noiseBuf!: AudioBuffer;
  private engines = new Map<number, Engine>();
  volume = 0.8;
  musicOn = true;
  private musicLevel = 0.5;
  private musicRunning = false;
  private musicTimer = 0;
  private nextNoteTime = 0;
  private step = 0;
  private crowdLevel = 0.1;

  private ensure(): AudioContext | null {
    if (this.ctx) return this.ctx;
    try {
      const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      const ctx: AudioContext = new AC();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = this.volume;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -14;
      comp.ratio.value = 5;
      this.master.connect(comp);
      comp.connect(ctx.destination);
      this.sfx = ctx.createGain();
      this.sfx.gain.value = 1;
      this.sfx.connect(this.master);
      this.musicGain = ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? this.musicLevel * 0.5 : 0;
      this.musicGain.connect(this.master);
      // szum
      const len = ctx.sampleRate * 2;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      let b0 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.97 * b0 + 0.03 * w;
        d[i] = w * 0.6 + b0 * 3.2;
      }
      // tłum
      this.crowdGain = ctx.createGain();
      this.crowdGain.gain.value = 0;
      const cf = ctx.createBiquadFilter();
      cf.type = 'bandpass';
      cf.frequency.value = 700;
      cf.Q.value = 0.5;
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      src.connect(cf);
      cf.connect(this.crowdGain);
      this.crowdGain.connect(this.master);
      src.start();
    } catch {
      this.ctx = null;
    }
    return this.ctx;
  }

  resume() {
    const c = this.ensure();
    if (c && c.state === 'suspended') c.resume();
    if (c && this.musicOn) this.startMusic();
  }

  setVolume(v: number) {
    this.volume = v;
    if (this.ctx) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setMusic(on: boolean) {
    this.musicOn = on;
    if (this.ctx) {
      this.musicGain.gain.setTargetAtTime(on ? this.musicLevel * 0.5 : 0, this.ctx.currentTime, 0.2);
      if (on) this.startMusic();
    }
  }

  setMusicLevel(l: number) {
    this.musicLevel = l;
    if (this.ctx && this.musicOn) this.musicGain.gain.setTargetAtTime(l * 0.5, this.ctx.currentTime, 0.4);
  }

  private cheerUntil = 0;

  setCrowd(level: number) {
    this.crowdLevel = level;
    if (this.ctx && this.ctx.currentTime > this.cheerUntil) this.crowdGain.gain.setTargetAtTime(level * 0.16, this.ctx.currentTime, 0.25);
  }

  updateListener(p: THREE.Vector3, f: THREE.Vector3, u: THREE.Vector3) {
    const c = this.ctx;
    if (!c) return;
    const l = c.listener;
    if (l.positionX) {
      l.positionX.value = p.x;
      l.positionY.value = p.y;
      l.positionZ.value = p.z;
      l.forwardX.value = f.x;
      l.forwardY.value = f.y;
      l.forwardZ.value = f.z;
      l.upX.value = u.x;
      l.upY.value = u.y;
      l.upZ.value = u.z;
    }
  }

  private mkPanner(pos?: THREE.Vector3): PannerNode {
    const c = this.ctx!;
    const p = c.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = 7;
    p.rolloffFactor = 1.1;
    p.maxDistance = 400;
    if (pos) this.setPannerPos(p, pos);
    return p;
  }

  private setPannerPos(p: PannerNode, pos: THREE.Vector3) {
    if (p.positionX) {
      p.positionX.value = pos.x;
      p.positionY.value = pos.y;
      p.positionZ.value = pos.z;
    }
  }

  /* ---------- silniki ---------- */
  engineUpdate(id: number, pos: THREE.Vector3, speedFrac: number, throttle: number, boosting: boolean, isPlayer: boolean, active: boolean) {
    const c = this.ctx;
    if (!c) return;
    let e = this.engines.get(id);
    if (!e) {
      const o1 = c.createOscillator();
      o1.type = 'sawtooth';
      const o2 = c.createOscillator();
      o2.type = 'square';
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.Q.value = 3;
      const g = c.createGain();
      g.gain.value = 0;
      const pan = this.mkPanner(pos);
      o1.connect(f);
      o2.connect(f);
      f.connect(g);
      g.connect(pan);
      pan.connect(this.sfx);
      o1.start();
      o2.start();
      const boostSrc = c.createBufferSource();
      boostSrc.buffer = this.noiseBuf;
      boostSrc.loop = true;
      const boostF = c.createBiquadFilter();
      boostF.type = 'bandpass';
      boostF.frequency.value = 900;
      boostF.Q.value = 0.7;
      const boostG = c.createGain();
      boostG.gain.value = 0;
      boostSrc.connect(boostF);
      boostF.connect(boostG);
      boostG.connect(pan);
      boostSrc.start();
      e = { o1, o2, g, f, pan, boostSrc, boostG, boostF };
      this.engines.set(id, e);
    }
    const t = c.currentTime;
    this.setPannerPos(e.pan, pos);
    const f0 = 58 + speedFrac * 150 + Math.max(0, throttle) * 22;
    e.o1.frequency.setTargetAtTime(f0, t, 0.06);
    e.o2.frequency.setTargetAtTime(f0 * 1.503, t, 0.06);
    e.f.frequency.setTargetAtTime(260 + speedFrac * 1500 + (boosting ? 500 : 0), t, 0.08);
    const base = active ? 0.028 + 0.05 * (0.25 + speedFrac) + 0.02 * Math.abs(throttle) : 0;
    e.g.gain.setTargetAtTime(base * (isPlayer ? 1.5 : 1), t, 0.06);
    e.boostG.gain.setTargetAtTime(boosting && active ? 0.28 : 0, t, 0.05);
    e.boostF.frequency.setTargetAtTime(700 + speedFrac * 900, t, 0.1);
  }

  clearEngines() {
    for (const e of this.engines.values()) {
      try {
        e.o1.stop();
        e.o2.stop();
        e.boostSrc.stop();
        e.pan.disconnect();
      } catch {
        /* */
      }
    }
    this.engines.clear();
  }

  silenceEngines() {
    if (!this.ctx) return;
    for (const e of this.engines.values()) {
      e.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
      e.boostG.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    }
  }

  /* ---------- pojedyncze dźwięki ---------- */
  private out(pos?: THREE.Vector3): AudioNode {
    if (!pos) return this.sfx;
    const p = this.mkPanner(pos);
    p.connect(this.sfx);
    return p;
  }

  private tone(freq: number, freqEnd: number, dur: number, type: OscillatorType, gain: number, dest: AudioNode, when = 0, attack = 0.005) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private noise(dur: number, type: BiquadFilterType, f0: number, f1: number, gain: number, dest: AudioNode, when = 0, q = 1) {
    const c = this.ctx!;
    const t = c.currentTime + when;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random());
    s.stop(t + dur + 0.05);
  }

  hit(power: number, pos: THREE.Vector3) {
    if (!this.ctx) return;
    const o = this.out(pos);
    const k = Math.min(1, power / 30);
    this.tone(170 + k * 60, 45, 0.22 + k * 0.15, 'sine', 0.55 + k * 0.5, o);
    this.noise(0.12 + k * 0.1, 'bandpass', 2400, 400, 0.4 + k * 0.5, o, 0, 0.8);
    if (k > 0.45) this.tone(90, 30, 0.5, 'sine', 0.6 * k, o);
  }

  bounce(strength: number, pos: THREE.Vector3) {
    if (!this.ctx) return;
    const k = Math.min(1, strength / 25);
    const o = this.out(pos);
    this.tone(110 + k * 40, 55, 0.16, 'sine', 0.18 + k * 0.4, o);
    this.noise(0.07, 'lowpass', 900, 200, 0.16 + k * 0.25, o);
  }

  bump(strength: number, pos: THREE.Vector3) {
    if (!this.ctx) return;
    const k = Math.min(1, strength / 14);
    const o = this.out(pos);
    this.noise(0.18, 'bandpass', 900, 150, 0.25 + k * 0.4, o, 0, 0.6);
    this.tone(80, 40, 0.2, 'sine', 0.25 + k * 0.3, o);
  }

  jump(pos: THREE.Vector3) {
    if (!this.ctx) return;
    const o = this.out(pos);
    this.tone(180, 380, 0.12, 'triangle', 0.14, o);
    this.noise(0.1, 'bandpass', 1200, 2800, 0.1, o);
  }

  dodge(pos: THREE.Vector3) {
    if (!this.ctx) return;
    const o = this.out(pos);
    this.noise(0.28, 'bandpass', 500, 4500, 0.35, o, 0, 1.4);
    this.tone(260, 640, 0.22, 'sawtooth', 0.08, o);
  }

  pickup(big: boolean, pos: THREE.Vector3) {
    if (!this.ctx) return;
    const o = this.out(pos);
    if (big) {
      this.tone(330, 990, 0.35, 'triangle', 0.32, o);
      this.tone(495, 1480, 0.4, 'sine', 0.25, o, 0.06);
      this.noise(0.4, 'highpass', 1500, 6000, 0.12, o);
    } else {
      this.tone(780, 1560, 0.14, 'sine', 0.2, o);
      this.tone(1170, 2340, 0.12, 'triangle', 0.08, o, 0.04);
    }
  }

  demolish(pos: THREE.Vector3) {
    if (!this.ctx) return;
    const o = this.out(pos);
    this.tone(120, 30, 0.9, 'sawtooth', 0.55, o);
    this.noise(0.8, 'lowpass', 3000, 120, 0.9, o, 0, 0.7);
    this.noise(0.3, 'highpass', 2000, 6000, 0.3, o, 0.02);
  }

  count(final: boolean) {
    if (!this.ctx) return;
    if (final) {
      this.tone(880, 880, 0.55, 'square', 0.16, this.sfx);
      this.tone(1320, 1320, 0.55, 'triangle', 0.14, this.sfx);
    } else {
      this.tone(440, 440, 0.2, 'square', 0.14, this.sfx);
    }
  }

  whistle() {
    if (!this.ctx) return;
    this.tone(2600, 2500, 0.25, 'sine', 0.2, this.sfx);
    this.tone(2600, 2400, 0.45, 'sine', 0.18, this.sfx, 0.3);
  }

  goal() {
    if (!this.ctx) return;
    const o = this.sfx;
    // róg
    for (const f of [110, 164.8, 220]) this.tone(f, f * 0.98, 1.9, 'sawtooth', 0.11, o, 0, 0.04);
    this.tone(55, 55, 1.6, 'sine', 0.4, o);
    // synth "sweep"
    this.tone(220, 1760, 0.9, 'sawtooth', 0.06, o, 0.15);
    this.noise(1.2, 'bandpass', 300, 5000, 0.35, o, 0.05, 0.5);
    // fanfara
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((n, i) => this.tone(n, n, 0.45, 'square', 0.07, o, 0.5 + i * 0.16));
    // okrzyk tłumu
    const c = this.ctx;
    const t = c.currentTime;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
    this.crowdGain.gain.linearRampToValueAtTime(0.55, t + 0.4);
    this.crowdGain.gain.linearRampToValueAtTime(this.crowdLevel * 0.16, t + 5.5);
    this.cheerUntil = t + 5.5;
  }

  cheerSmall() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    this.crowdGain.gain.cancelScheduledValues(t);
    this.crowdGain.gain.setValueAtTime(this.crowdGain.gain.value, t);
    this.crowdGain.gain.linearRampToValueAtTime(0.32, t + 0.25);
    this.crowdGain.gain.linearRampToValueAtTime(this.crowdLevel * 0.16, t + 2.5);
    this.cheerUntil = Math.max(this.cheerUntil, t + 2.5);
  }

  endJingle(win: boolean) {
    if (!this.ctx) return;
    const notes = win ? [392, 523.25, 659.25, 783.99, 1046.5] : [392, 349.23, 311.13, 261.63];
    notes.forEach((n, i) => this.tone(n, n, 0.5, win ? 'square' : 'triangle', 0.09, this.sfx, i * 0.2));
    if (win) this.goal();
  }

  /* ---------- muzyka ---------- */
  private startMusic() {
    const c = this.ctx;
    if (!c || this.musicRunning) return;
    this.musicRunning = true;
    this.nextNoteTime = c.currentTime + 0.15;
    this.step = 0;
    const tick = () => {
      if (!this.ctx) return;
      const spb = 60 / BPM / 4;
      while (this.nextNoteTime < this.ctx.currentTime + 0.3) {
        this.schedule(this.step, this.nextNoteTime);
        this.nextNoteTime += spb;
        this.step++;
      }
      this.musicTimer = window.setTimeout(tick, 70);
    };
    tick();
  }

  private mNote(freq: number, dur: number, type: OscillatorType, gain: number, when: number, cutoff: number) {
    const c = this.ctx!;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(cutoff, when);
    f.frequency.exponentialRampToValueAtTime(Math.max(120, cutoff * 0.25), when + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    o.start(when);
    o.stop(when + dur + 0.05);
  }

  private mNoise(dur: number, type: BiquadFilterType, freq: number, gain: number, when: number) {
    const c = this.ctx!;
    const s = c.createBufferSource();
    s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    s.connect(f);
    f.connect(g);
    g.connect(this.musicGain);
    s.start(when, Math.random());
    s.stop(when + dur + 0.02);
  }

  private schedule(step: number, t: number) {
    const bar = Math.floor(step / 16) % 4;
    const pos = step % 16;
    const c = this.ctx!;
    // kick
    if (pos % 4 === 0) {
      const o = c.createOscillator();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.16);
      const g = c.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      o.connect(g);
      g.connect(this.musicGain);
      o.start(t);
      o.stop(t + 0.25);
    }
    if (pos === 4 || pos === 12) {
      this.mNoise(0.14, 'bandpass', 1900, 0.45, t);
      this.mNote(190, 0.1, 'triangle', 0.25, t, 3000);
    }
    if (pos % 2 === 1) this.mNoise(0.04, 'highpass', 7500, 0.18, t);
    if (pos === 14) this.mNoise(0.18, 'highpass', 6500, 0.12, t);
    // bas
    if (pos === 0 || pos === 3 || pos === 6 || pos === 8 || pos === 11 || pos === 14) {
      const r = ROOTS[bar] * (pos === 6 || pos === 14 ? 2 : 1);
      this.mNote(r, 0.22, 'sawtooth', 0.34, t, 700);
    }
    // arpeggio
    const ch = CHORDS[bar];
    const arp = [0, 1, 2, 3, 2, 1, 2, 3, 0, 1, 2, 3, 2, 1, 3, 2];
    this.mNote(ch[arp[pos]] * 2, 0.13, 'square', 0.085, t, 3200);
    // pad
    if (pos === 0) {
      for (const n of ch.slice(0, 3)) {
        this.mNote(n, 60 / BPM * 4 * 0.98, 'sawtooth', 0.05, t, 900);
        this.mNote(n * 1.006, 60 / BPM * 4 * 0.98, 'sawtooth', 0.04, t, 900);
      }
    }
  }

  dispose() {
    window.clearTimeout(this.musicTimer);
    this.musicRunning = false;
    this.clearEngines();
    if (this.ctx) {
      this.ctx.close().catch(() => undefined);
      this.ctx = null;
    }
  }
}
