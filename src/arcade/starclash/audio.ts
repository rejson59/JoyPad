// @ts-nocheck
export class Sfx {
  ctx: AudioContext | null = null;
  master: GainNode;
  noiseBuf: AudioBuffer;
  engOsc: OscillatorNode; engGain: GainNode; engFilter: BiquadFilterNode;
  init() {
    if (this.ctx) { this.ctx.resume(); return; }
    const C = window.AudioContext || (window as any).webkitAudioContext;
    if (!C) return;
    this.ctx = new C();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    const comp = this.ctx.createDynamicsCompressor();
    this.master.connect(comp); comp.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // engine hum
    const n = this.ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    this.engFilter = this.ctx.createBiquadFilter(); this.engFilter.type = 'lowpass'; this.engFilter.frequency.value = 200;
    this.engOsc = this.ctx.createOscillator(); this.engOsc.type = 'sawtooth'; this.engOsc.frequency.value = 40;
    const og = this.ctx.createGain(); og.gain.value = 0.15;
    this.engGain = this.ctx.createGain(); this.engGain.gain.value = 0;
    n.connect(this.engFilter); this.engOsc.connect(og); og.connect(this.engFilter);
    this.engFilter.connect(this.engGain); this.engGain.connect(this.master);
    n.start(); this.engOsc.start();
  }
  engine(t: number, on: boolean) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.engGain.gain.setTargetAtTime(on ? 0.25 + t * 0.25 : 0, now, 0.1);
    this.engFilter.frequency.setTargetAtTime(150 + t * 700, now, 0.1);
    this.engOsc.frequency.setTargetAtTime(35 + t * 45, now, 0.1);
  }
  laser(vol = 1, pitch = 1) {
    if (!this.ctx || vol < 0.02) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(1400 * pitch, t); o.frequency.exponentialRampToValueAtTime(180 * pitch, t + 0.15);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.12 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 3000;
    o.connect(f); f.connect(g); g.connect(this.master); o.start(t); o.stop(t + 0.2);
  }
  noise(dur: number, vol: number, freq: number, endFreq = 40) {
    if (!this.ctx || vol < 0.01) return;
    const t = this.ctx.currentTime;
    const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter(); f.type = 'lowpass';
    f.frequency.setValueAtTime(freq, t); f.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random()); s.stop(t + dur);
  }
  explosion(vol = 1) {
    this.noise(2.2, 0.9 * vol, 1200, 30);
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(25, t + 1);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(0.7 * vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + 1.2);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + 1.3);
  }
  hit(vol = 1) { this.noise(0.15, 0.4 * vol, 4000, 500); }
  missile(vol = 1) { this.noise(0.9, 0.35 * vol, 2500, 300); }
  beep(freq = 880, dur = 0.06, vol = 0.1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = 'square'; o.frequency.value = freq;
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
}
