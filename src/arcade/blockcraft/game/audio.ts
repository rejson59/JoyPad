// Procedural sound effects generated with the Web Audio API.
// Every entry point is fail-safe: if the browser has no (or a blocked)
// AudioContext the game keeps running silently instead of throwing.
type Kind = 'stone' | 'wood' | 'grass' | 'sand' | 'glass' | 'cloth' | 'slime';

let ctx: AudioContext | null = null;
let noiseBuf: AudioBuffer | null = null;
let master: GainNode | null = null;
let broken = false; // audio unavailable -> stay silent
export let volume = 0.5;

/**
 * 2.29: „pokój” dla wszystkich dźwięków.
 *
 * Wanilia nagrywa efekty w małej przestrzeni (jaskinia, drewniany dom), więc
 * każdy trzask ma ogon. Do 2.28 graliśmy zupełnie na sucho i wszystko
 * brzmiało jak kliknięcie w głośniku. Impuls pogłosu generujemy proceduralnie
 * (szum z wykładniczym zanikiem, lekko przyciemniony), więc nadal nie
 * Dotykamy żadnych plików z gry.
 */
function buildRoom(c: AudioContext, dest: GainNode) {
  const len = Math.floor(c.sampleRate * 0.55);
  if (len <= 0) return;
  const ir = c.createBuffer(2, len, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // wczesne odbicia + gęsty ogon; filtr dolnoprzepustowy „miękczy” pogłos
      const env = Math.pow(1 - t, 2.6);
      lp += (Math.random() * 2 - 1 - lp) * 0.35;
      const early = i < c.sampleRate * 0.05 && i % Math.max(1, Math.floor(c.sampleRate * 0.011)) < 24 ? 0.6 : 0;
      d[i] = (lp * 0.7 + early) * env * 0.55;
    }
  }
  const conv = c.createConvolver();
  conv.buffer = ir;
  const g = c.createGain();
  g.gain.value = 0.2;
  // cały miks (master) idzie też przez pogłos – jeden wysył na wszystko
  dest.connect(conv);
  conv.connect(g).connect(c.destination);
}

/** Wspólne wyjście efektów – jedno miejsce, więc nic nie gra „w próżnię”. */
function out(node: AudioNode) {
  if (master) node.connect(master);
}

function ensure(): AudioContext | null {
  if (broken) return null;
  if (!ctx) {
    try {
      const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
      const AC = w.AudioContext || w.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API unavailable');
      const c = new AC();
      const m = c.createGain();
      m.gain.value = volume;
      m.connect(c.destination);
      const buf = c.createBuffer(1, Math.max(1, c.sampleRate), c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      master = m;
      noiseBuf = buf;
      ctx = c;
      buildRoom(c, m);
    } catch (e) {
      broken = true;
      console.warn('Audio disabled:', e);
      return null;
    }
  }
  try {
    if (ctx.state === 'suspended') void ctx.resume();
  } catch {
    /* ignore */
  }
  return ctx;
}

export function setVolume(v: number) {
  volume = Math.max(0, Math.min(1, v));
  if (master) {
    try {
      master.gain.value = volume;
    } catch {
      /* ignore */
    }
  }
}

/**
 * 2.29: barwy materiałów w stylu wanilii.
 *
 * Waniliowy odgłos bloku to krótki szum z rezonansem (filtr pasmowy) plus
 * „korpus” – niskie uderzenie, które słychać pod palcami. Do 2.28 graliśmy
 * samym szumem, więc drewno i kamień brzmiały jak suchy trzask. Teraz każdy
 * materiał ma własną częstotliwość rezonansu, dobroć filtru i wysokość
 * korpusu – drewno jest ciepłe, kamień twardszy, wełna głucha.
 */
const MAT: Record<Kind, { freq: number; q: number; body: number; decay: number; grain: number }> = {
  stone: { freq: 1050, q: 1.1, body: 210, decay: 0.16, grain: 0.5 },
  wood: { freq: 640, q: 2.4, body: 165, decay: 0.18, grain: 0.45 },
  grass: { freq: 2600, q: 0.7, body: 320, decay: 0.12, grain: 0.25 },
  sand: { freq: 3300, q: 0.5, body: 420, decay: 0.11, grain: 0.2 },
  glass: { freq: 4200, q: 5, body: 900, decay: 0.13, grain: 0.6 },
  cloth: { freq: 1250, q: 0.7, body: 150, decay: 0.1, grain: 0.15 },
  slime: { freq: 700, q: 1.3, body: 95, decay: 0.2, grain: 0.15 },
};

/** Niskie „korpus” uderzenia – to on sprawia, że blok ma masę. */
function bodyThump(freq: number, dur: number, gain: number, type: OscillatorType = 'sine') {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * 0.55), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.006);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g);
  out(g);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noiseBurst(freq: number, q: number, dur: number, gain: number) {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.8 + Math.random() * 0.4;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq * (0.85 + Math.random() * 0.3);
  f.Q.value = q;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g);
  out(g);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
}

export function playBreak(kind: Kind) {
  const m = MAT[kind];
  // kilka ziaren w krótkim odstępie – tak brzmi pękający blok, a nie jeden klik
  noiseBurst(m.freq, m.q, m.decay * 1.7, 0.75);
  noiseBurst(m.freq * 1.35, m.q * 0.8, m.decay * 1.2, 0.4);
  bodyThump(m.body, m.decay, 0.16 * m.grain);
  if (kind === 'glass') {
    for (let i = 0; i < 4; i++) {
      setTimeout(() => noiseBurst(4800 + Math.random() * 2400, 9, 0.16, 0.32), i * 38);
    }
    bodyThump(1500, 0.12, 0.05, 'triangle');
  }
}
export function playPlace(kind: Kind) {
  const m = MAT[kind];
  noiseBurst(m.freq * 0.75, m.q * 1.15, m.decay * 0.85, 0.5);
  bodyThump(m.body, m.decay * 0.8, 0.12 * m.grain + 0.03);
}
export function playDig(kind: Kind) {
  const m = MAT[kind];
  noiseBurst(m.freq * (0.9 + Math.random() * 0.25), m.q, 0.06, 0.28);
  if (Math.random() < 0.5) bodyThump(m.body * 0.9, 0.07, 0.03);
}
export function playStep(kind: Kind) {
  const m = MAT[kind];
  noiseBurst(m.freq * (0.85 + Math.random() * 0.3), m.q, 0.075, 0.16);
  bodyThump(m.body * 0.8, 0.06, 0.018);
}

/**
 * Drzwi: przy otwieraniu skrzypienie zawiasu, przy zamykaniu głuche
 * klaśnięcie. Wanilia ma osobne `wooden_door.open` i `.close` – tutaj oba
 * powstają z tego samego materiału, tylko z innym przebiegiem.
 */
export function playDoor(open: boolean) {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  if (open) {
    const o = c.createOscillator();
    const f = c.createBiquadFilter();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(190, t);
    o.frequency.linearRampToValueAtTime(240, t + 0.1);
    o.frequency.linearRampToValueAtTime(150, t + 0.3);
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 7;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.05, t + 0.05);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.34);
    o.connect(f).connect(g);
    out(g);
    o.start(t);
    o.stop(t + 0.36);
    noiseBurst(520, 2.2, 0.1, 0.18);
    setTimeout(() => bodyThump(140, 0.12, 0.06), 250);
  } else {
    noiseBurst(480, 2.6, 0.12, 0.3);
    bodyThump(150, 0.16, 0.1);
  }
}

/** Łóżko: miękkie skrzypienie materaca po przespanej nocy. */
export function playBed() {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  for (const [delay, freq] of [[0, 320], [0.16, 270]] as [number, number][]) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t + delay);
    o.frequency.linearRampToValueAtTime(freq * 0.72, t + delay + 0.3);
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.linearRampToValueAtTime(0.045, t + delay + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.35);
    o.connect(g);
    out(g);
    o.start(t + delay);
    o.stop(t + delay + 0.38);
  }
  noiseBurst(1100, 0.8, 0.22, 0.12);
}
export function playSplash() {
  // plusk: szeroki szum + kilka bąbelków o rosnącej wysokości
  noiseBurst(1600, 0.45, 0.32, 0.5);
  noiseBurst(700, 0.9, 0.22, 0.3);
  const c = ensure();
  if (!c || !master) return;
  for (let i = 0; i < 4; i++) {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + 0.03 + i * 0.05 + Math.random() * 0.02;
    o.type = 'sine';
    o.frequency.setValueAtTime(420 + Math.random() * 380, t);
    o.frequency.exponentialRampToValueAtTime(900 + Math.random() * 700, t + 0.05);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    o.connect(g);
    out(g);
    o.start(t);
    o.stop(t + 0.11);
  }
}
export function playHurt() {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  // dwa tony: krótkie „uh” i niżej opadający jęk – waniliowy odgłos bólu jest
  // bardziej głosem niż kliknięciem, dlatego dokładamy drugą warstwę.
  for (const [dt, f0, f1, gain, dur] of [[0, 330, 170, 0.16, 0.16], [0.05, 240, 110, 0.1, 0.22]] as [number, number, number, number, number][]) {
    const o = c.createOscillator();
    const g = c.createGain();
    const f = c.createBiquadFilter();
    o.type = 'sawtooth';
    f.type = 'lowpass';
    f.frequency.value = 900;
    o.frequency.setValueAtTime(f0, t + dt);
    o.frequency.exponentialRampToValueAtTime(f1, t + dt + dur);
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.linearRampToValueAtTime(gain, t + dt + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + dt + dur);
    o.connect(f).connect(g);
    out(g);
    o.start(t + dt);
    o.stop(t + dt + dur + 0.02);
  }
  noiseBurst(1400, 1.1, 0.08, 0.12);
}
export function playMob(type: 'pig' | 'zombie' | 'sheep' | 'cow' | 'chicken' | 'creeper' | 'spider' | 'skeleton' | 'wolf' | 'villager' | 'golem' | 'enderman' | 'slime' | 'ghast') {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  if (type === 'pig') {
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t);
    o.frequency.linearRampToValueAtTime(180, t + 0.25);
  } else if (type === 'sheep') {
    o.type = 'triangle';
    o.frequency.setValueAtTime(420, t);
    for (let i = 0; i < 6; i++) o.frequency.setValueAtTime(i % 2 ? 400 : 440, t + i * 0.05);
  } else if (type === 'cow') {
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(140, t);
    o.frequency.linearRampToValueAtTime(90, t + 0.45);
  } else if (type === 'chicken') {
    o.type = 'square';
    o.frequency.setValueAtTime(880, t);
    o.frequency.setValueAtTime(640, t + 0.08);
    o.frequency.setValueAtTime(980, t + 0.14);
  } else if (type === 'creeper') {
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.linearRampToValueAtTime(40, t + 0.35);
  } else if (type === 'spider') {
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(700, t);
    for (let i = 0; i < 8; i++) o.frequency.setValueAtTime(600 + Math.random() * 300, t + i * 0.04);
  } else if (type === 'skeleton') {
    o.type = 'square';
    o.frequency.setValueAtTime(900, t);
    for (let i = 0; i < 6; i++) o.frequency.setValueAtTime(i % 2 ? 700 : 1100, t + i * 0.03);
  } else if (type === 'wolf') {
    // wolf: a low growl that rises into a short yip
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.linearRampToValueAtTime(170, t + 0.28);
    o.frequency.exponentialRampToValueAtTime(520, t + 0.42);
  } else if (type === 'villager') {
    // mieszkaniec: miękkie „hmmm” z opadającą intonacją
    o.type = 'triangle';
    o.frequency.setValueAtTime(320, t);
    o.frequency.linearRampToValueAtTime(268, t + 0.3);
    o.frequency.setValueAtTime(300, t + 0.38);
  } else if (type === 'golem') {
    // żelazny golem: ciężki, metaliczny pomruk
    o.type = 'square';
    o.frequency.setValueAtTime(96, t);
    o.frequency.linearRampToValueAtTime(62, t + 0.5);
  } else {
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(110, t);
    o.frequency.linearRampToValueAtTime(80, t + 0.6);
  }
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.08, t + 0.05);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 900;
  o.connect(f).connect(g);
  out(g);
  o.start(t);
  o.stop(t + 0.65);
}
/** Dzwon wioski: dwa szybkie, metaliczne uderzenia. */
export function playBell() {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  for (const [delay, freq] of [[0, 1180], [0.18, 880]] as [number, number][]) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t + delay);
    o.frequency.exponentialRampToValueAtTime(freq * 0.82, t + delay + 0.6);
    g.gain.setValueAtTime(0.0001, t + delay);
    g.gain.linearRampToValueAtTime(0.12, t + delay + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.9);
    o.connect(g);
    out(g);
    o.start(t + delay);
    o.stop(t + delay + 1);
  }
}

export function playExplosion() {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const t = c.currentTime;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.3;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 600;
  f.frequency.exponentialRampToValueAtTime(120, t + 1.2);
  const g = c.createGain();
  g.gain.setValueAtTime(1.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.6);
  src.connect(f).connect(g);
  out(g);
  src.start(t);
  src.stop(t + 1.7);
  // niski „bum” pod szumem – bez niego wybuch brzmi jak zdmuchnięcie
  bodyThump(70, 0.9, 0.5, 'sine');
  // gruz spadający chwilę po wybuchu
  noiseBurst(2600, 0.7, 0.5, 0.16);
  setTimeout(() => noiseBurst(1800, 0.9, 0.35, 0.1), 220);
}
export function playFuse() {
  noiseBurst(6000, 0.8, 0.6, 0.25);
}
export function playPop() {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.frequency.setValueAtTime(600 + Math.random() * 400, t);
  o.frequency.exponentialRampToValueAtTime(1400, t + 0.06);
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(g);
  out(g);
  o.start(t);
  o.stop(t + 0.1);
}
export function playEat() {
  // chrupnięcie: trzy krótkie szumy o nierównej sile, jak w wanilii
  noiseBurst(900, 2.2, 0.09, 0.32);
  setTimeout(() => noiseBurst(780, 2.6, 0.07, 0.2), 70);
  setTimeout(() => noiseBurst(1000, 2.0, 0.06, 0.14), 135);
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = 'triangle';
  o.frequency.setValueAtTime(420, t);
  o.frequency.exponentialRampToValueAtTime(180, t + 0.12);
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(g);
  out(g);
  o.start(t);
  o.stop(t + 0.16);
}

/** 2.4: potion glug – two liquid blips rising in pitch. */
export function playDrink() {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  [0, 0.11].forEach((off, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(260 + i * 120, t + off);
    o.frequency.exponentialRampToValueAtTime(140 + i * 60, t + off + 0.09);
    g.gain.setValueAtTime(0.09, t + off);
    g.gain.exponentialRampToValueAtTime(0.001, t + off + 0.1);
    o.connect(g).connect(master!);
    o.start(t + off);
    o.stop(t + off + 0.12);
  });
}

/** Bow release and arrow impact. */
export function playBow() {
  const c = ensure();
  if (!c || !master) return;
  // cięciwa: krótki świst szumu razem z tonem
  noiseBurst(2400, 1.6, 0.09, 0.16);
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = 'triangle';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(620, t + 0.09);
  g.gain.setValueAtTime(0.1, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(g);
  out(g);
  o.start(t);
  o.stop(t + 0.16);
}

export function playArrowHit() {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 1.6;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 2200;
  f.Q.value = 1.4;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  src.connect(f).connect(g);
  out(g);
  src.start(t, Math.random() * 0.4);
  src.stop(t + 0.16);
}

/** Level-up chime: two quick rising notes with a soft tail. */
export function playLevelUp() {
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime;
  for (const [i, f] of [523.25, 783.99].entries()) {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = t0 + i * 0.11;
    o.type = 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    o.connect(g);
    out(g);
    o.start(t);
    o.stop(t + 0.55);
  }
}

/** Enchanting table: a shimmering, rising chime. */
export function playEnchant() {
  const c = ensure();
  if (!c || !master) return;
  const t0 = c.currentTime;
  const notes = [659.25, 830.61, 987.77, 1318.51];
  notes.forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = t0 + i * 0.07;
    o.type = 'sine';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.7);
    o.connect(g).connect(master!);
    o.start(t);
    o.stop(t + 0.75);
  });
}

/** Shield parry: a dull metallic clank. */
export function playShield() {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 2.4;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 1400;
  f.Q.value = 6;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.5, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  src.connect(f).connect(g);
  out(g);
  src.start(t, Math.random() * 0.3);
  src.stop(t + 0.18);
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'square';
  o.frequency.setValueAtTime(220, t);
  og.gain.setValueAtTime(0.05, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  o.connect(og);
  out(og);
  o.start(t);
  o.stop(t + 0.1);
}

/** A short wind gust – filtered noise that slowly opens up. */
export function playWind() {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = 320;
  f.Q.value = 0.8;
  const g = c.createGain();
  const t = c.currentTime;
  const len = 2.5 + Math.random() * 2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.05, t + len * 0.45);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  f.frequency.linearRampToValueAtTime(520 + Math.random() * 300, t + len);
  src.connect(f).connect(g);
  out(g);
  src.start(t);
  src.stop(t + len + 0.05);
}

/** A few bird chirps – daytime ambience on the surface. */
export function playBird() {
  const c = ensure();
  if (!c || !master) return;
  const notes = 2 + Math.floor(Math.random() * 3);
  const base = 1900 + Math.random() * 1400;
  for (let i = 0; i < notes; i++) {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + i * (0.09 + Math.random() * 0.13);
    o.type = 'sine';
    o.frequency.setValueAtTime(base * (1 + Math.random() * 0.25), t);
    o.frequency.exponentialRampToValueAtTime(base * (0.7 + Math.random() * 0.3), t + 0.06);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.045, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    o.connect(g);
    out(g);
    o.start(t);
    o.stop(t + 0.13);
  }
}

/** Low cave drone plus a water drop – tells the player they are underground. */
export function playCave() {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = 'sine';
  o.frequency.setValueAtTime(55 + Math.random() * 45, t);
  o.frequency.linearRampToValueAtTime(48 + Math.random() * 30, t + 3);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.06, t + 0.9);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
  o.connect(g);
  out(g);
  o.start(t);
  o.stop(t + 3.3);
  if (Math.random() < 0.6) {
    const d = c.createOscillator();
    const dg = c.createGain();
    const dt = t + 0.6 + Math.random() * 1.6;
    d.type = 'sine';
    d.frequency.setValueAtTime(900 + Math.random() * 700, dt);
    d.frequency.exponentialRampToValueAtTime(400, dt + 0.09);
    dg.gain.setValueAtTime(0.0001, dt);
    dg.gain.exponentialRampToValueAtTime(0.05, dt + 0.008);
    dg.gain.exponentialRampToValueAtTime(0.0001, dt + 0.14);
    d.connect(dg);
    out(dg);
    d.start(dt);
    d.stop(dt + 0.16);
  }
}

/**
 * Ambient music: a slow, quiet pentatonic phrase. Minecraft-like games use it to
 * fill the silence while exploring; kept sparse and soft so it never fights the
 * sound effects.
 */
export function playMusic() {
  const c = ensure();
  if (!c || !master) return;
  // A minor pentatonic, two octaves – any order sounds calm.
  const scale = [220, 261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
  const notes = 3 + Math.floor(Math.random() * 3);
  const base = Math.floor(Math.random() * (scale.length - 4));
  for (let i = 0; i < notes; i++) {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + i * (0.55 + Math.random() * 0.4);
    const f = scale[base + Math.floor(Math.random() * 4)] * (Math.random() < 0.3 ? 2 : 1);
    o.type = Math.random() < 0.5 ? 'sine' : 'triangle';
    o.frequency.setValueAtTime(f, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.05, t + 1.1);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 4.2);
    o.connect(g);
    out(g);
    o.start(t);
    o.stop(t + 4.4);
  }
}

export function playThunder() {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  src.playbackRate.value = 0.22;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 240;
  const g = c.createGain();
  const t = c.currentTime;
  g.gain.setValueAtTime(0.7, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 1.4);
  src.connect(f).connect(g);
  out(g);
  src.start(t);
  src.stop(t + 1.5);
}

let rainSrc: AudioBufferSourceNode | null = null;

export function setRain(on: boolean) {
  const c = ensure();
  if (!c || !master || !noiseBuf) return;
  if (on) {
    if (rainSrc) return;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    src.playbackRate.value = 0.55;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.4;
    const g = c.createGain();
    g.gain.value = 0.16;
    src.connect(f).connect(g);
    out(g);
    src.start();
    rainSrc = src;
  } else if (rainSrc) {
    try {
      rainSrc.stop();
    } catch {
      /* already stopped */
    }
    rainSrc.disconnect();
    rainSrc = null;
  }
}

export function playNote(pitch: number, _belowId: number) {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  // different instruments based on block below (future: use _belowId)
  const freq = 220 * Math.pow(2, (pitch % 24) / 12);
  o.type = 'square';
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.8);
  o.connect(g);
  out(g);
  o.start(t);
  o.stop(t + 0.9);
}

export function playPortal() {
  const c = ensure();
  if (!c || !master) return;
  const t = c.currentTime;
  for (let i = 0; i < 3; i++) {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200 + i * 100, t + i * 0.1);
    o.frequency.exponentialRampToValueAtTime(80, t + i * 0.1 + 1.2);
    g.gain.setValueAtTime(0.08, t + i * 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.1 + 1.5);
    o.connect(g);
    out(g);
    o.start(t + i * 0.1);
    o.stop(t + i * 0.1 + 1.6);
  }
}

export function playSlime() {
  const c = ensure();
  if (!c || !master) return;
  const o = c.createOscillator();
  const g = c.createGain();
  const t = c.currentTime;
  o.type = 'sine';
  o.frequency.setValueAtTime(180, t);
  o.frequency.exponentialRampToValueAtTime(90, t + 0.3);
  g.gain.setValueAtTime(0.15, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
  o.connect(g);
  out(g);
  o.start(t);
  o.stop(t + 0.4);
}

export function unlockAudio() {
  ensure();
}
