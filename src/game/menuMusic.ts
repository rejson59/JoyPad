/**
 * Menu music — energiczny, w pełni PROCEDURALNY loop electro/synthwave (~124 BPM),
 * syntezowany na żywo w Web Audio (kick, werbel, hi-hat, bas, arpeggio).
 *
 * Dlaczego nie „No Hands”?: to licencjonowany utwór komercyjny (Warner/Atlantic),
 * którego nie wolno odtwarzać bez licencji. Zamiast tego JoyPad generuje własny,
 * darmowy kawałek — brak praw autorskich, zero zależności i plików audio.
 *
 * Zasady (mute rules):
 *  - gra tylko w menu / lobby (nie w rundzie) — `setContext('menu' | 'game')`;
 *  - startuje dopiero po pierwszym geście użytkownika (wymóg przeglądarek);
 *  - wyciszenie pamięta się w localStorage `joypad-menu-music`.
 */

export const LS_MENU_MUSIC = 'joypad-menu-music';

const BPM = 124;
const STEP = 60 / BPM / 4; // długość 1/16 taktu w s
const BAR_STEPS = 16;

/** Proste pady harmoniczne: a-moll → F → C → G (energetyczna progresja). */
const CHORDS: { root: number; tones: number[] }[] = [
  { root: 45, tones: [0, 3, 7, 12] }, // Am
  { root: 41, tones: [0, 4, 7, 12] }, // F
  { root: 48, tones: [0, 4, 7, 12] }, // C
  { root: 43, tones: [0, 4, 7, 12] }, // G
];

const mtof = (midi: number) => 440 * 2 ** ((midi - 69) / 12);

type Listener = (enabled: boolean) => void;

class MenuMusic {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private arpDelay: DelayNode | null = null;
  private noise: AudioBuffer | null = null;
  private timer: number | null = null;
  private nextTime = 0;
  private step = 0;
  private bar = 0;
  private listeners = new Set<Listener>();
  private context: 'menu' | 'game' = 'game';
  enabled = true;

  constructor() {
    try { this.enabled = localStorage.getItem(LS_MENU_MUSIC) !== 'off'; } catch { this.enabled = true; }
    const gesture = () => { if (this.enabled && this.context === 'menu') this.start(); };
    window.addEventListener('pointerdown', gesture, { once: true });
    window.addEventListener('keydown', gesture, { once: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.pausePlayback();
      else if (this.enabled && this.context === 'menu') this.start();
    });
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    try { localStorage.setItem(LS_MENU_MUSIC, enabled ? 'on' : 'off'); } catch { /* optional */ }
    if (enabled && this.context === 'menu') this.start();
    else this.pausePlayback();
    for (const fn of this.listeners) fn(enabled);
  }

  /** Wywoływane przez widoki: 'menu' gra muzykę, 'game' ją chowa w rundzie. */
  setContext(context: 'menu' | 'game') {
    this.context = context;
    if (context === 'menu' && this.enabled) this.start();
    else this.pausePlayback();
  }

  private ensure(): boolean {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return true;
    }
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return false;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 18;
    comp.ratio.value = 6;
    master.connect(comp);
    comp.connect(ctx.destination);
    // wspólny tor delay dla arpeggio
    const delay = ctx.createDelay(0.5);
    delay.delayTime.value = STEP * 3;
    const fb = ctx.createGain();
    fb.gain.value = 0.25;
    const wet = ctx.createGain();
    wet.gain.value = 0.18;
    delay.connect(fb);
    fb.connect(delay);
    delay.connect(wet);
    wet.connect(master);
    const noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.ctx = ctx;
    this.master = master;
    this.arpDelay = delay;
    this.noise = noise;
    return true;
  }

  start() {
    if (!this.enabled || !this.ensure() || !this.ctx || !this.master) return;
    if (this.timer !== null) return;
    const now = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(Math.max(0.0001, this.master.gain.value), now);
    this.master.gain.linearRampToValueAtTime(0.5, now + 1.2);
    this.nextTime = now + 0.08;
    this.timer = window.setInterval(() => this.tick(), 30);
  }

  pausePlayback() {
    if (this.timer !== null) { window.clearInterval(this.timer); this.timer = null; }
    if (this.ctx && this.master) {
      const t = this.ctx.currentTime;
      this.master.gain.cancelScheduledValues(t);
      this.master.gain.setTargetAtTime(0, t, 0.08);
    }
  }

  private tick() {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.nextTime < ctx.currentTime + 0.16) {
      this.scheduleStep(this.step, this.nextTime);
      this.step += 1;
      if (this.step >= BAR_STEPS) { this.step = 0; this.bar = (this.bar + 1) % CHORDS.length; }
      this.nextTime += STEP;
    }
  }

  private scheduleStep(step: number, t: number) {
    const chord = CHORDS[this.bar];
    // Kick: 4 na podłodze + ghost w co drugim takcie.
    if (step % 4 === 0) this.kick(t, step === 0 ? 1 : 0.85);
    if (step === 14 && this.bar % 2 === 1) this.kick(t, 0.55);
    // Hi-hat: szesnastki na przemian, otwarty na off-beatach.
    if (step % 2 === 1) this.hat(t, step % 8 === 7);
    // Werbel/clap: 2 i 4.
    if (step === 4 || step === 12) this.snare(t);
    // Bas: staccato w synkopie.
    if (step === 0 || step === 3 || step === 6 || step === 8 || step === 11 || step === 14) {
      this.bass(t, mtof(chord.root - 12), STEP * 1.4);
    }
    // Arpeggio: ciągłe szesnastki w górę.
    const tone = chord.tones[step % 4] + (step % 8 >= 4 ? 12 : 0);
    this.arp(t, mtof(chord.root + 24 + tone));
  }

  private kick(t: number, amp: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(44, t + 0.11);
    gain.gain.setValueAtTime(0.7 * amp, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    osc.connect(gain);
    gain.connect(this.master!);
    osc.start(t);
    osc.stop(t + 0.18);
  }

  private hat(t: number, open: boolean) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 6500;
    const gain = ctx.createGain();
    const dur = open ? 0.09 : 0.03;
    gain.gain.setValueAtTime(open ? 0.075 : 0.05, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(hp);
    hp.connect(gain);
    gain.connect(this.master!);
    src.start(t, Math.random() * 0.2);
    src.stop(t + dur + 0.02);
  }

  private snare(t: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1900;
    bp.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.16, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.13);
    src.connect(bp);
    bp.connect(gain);
    gain.connect(this.master!);
    src.start(t, Math.random() * 0.2);
    src.stop(t + 0.15);
  }

  private bass(t: number, freq: number, dur: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = freq;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(220, t + dur);
    lp.Q.value = 6;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.14, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(lp);
    lp.connect(gain);
    gain.connect(this.master!);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private arp(t: number, freq: number) {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.035, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    osc.connect(gain);
    gain.connect(this.master!);
    if (this.arpDelay) gain.connect(this.arpDelay);
    osc.start(t);
    osc.stop(t + 0.12);
  }
}

export const menuMusic = new MenuMusic();
