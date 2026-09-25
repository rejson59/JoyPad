import { CanvasTexture, LinearMipmapLinearFilter, RepeatWrapping, SRGBColorSpace, Texture } from 'three';

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return { c, ctx };
}

function rnd(seed: { v: number }) {
  seed.v = (seed.v * 16807) % 2147483647;
  return (seed.v - 1) / 2147483646;
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new CanvasTexture(c);
  if (srgb) t.colorSpace = SRGBColorSpace;
  if (repeat) {
    t.wrapS = RepeatWrapping;
    t.wrapT = RepeatWrapping;
  }
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  return t;
}

export interface FacadeTex {
  map: Texture;
  emissive: Texture;
  rough: Texture;
}

/** Fasada wieżowca — jeden kafelek = 16m x 32m */
export function facadeTexture(variant: number): FacadeTex {
  const W = 256;
  const H = 512;
  const seed = { v: 1234 + variant * 977 };
  const base = canvas(W, H);
  const em = canvas(W, H);
  const ro = canvas(W, H);
  const palettes = [
    { wall: '#141824', frame: '#232a3a', lit: ['#ffd9a0', '#ffe8c4', '#9fd8ff'] },
    { wall: '#0f1420', frame: '#1b2233', lit: ['#7fe8ff', '#b8f4ff', '#ffffff'] },
    { wall: '#1a1420', frame: '#2c2233', lit: ['#ff9ee8', '#ffc4f2', '#ffd9a0'] },
    { wall: '#10161a', frame: '#1d2a30', lit: ['#a0ffd0', '#dfffee', '#9fd8ff'] },
    { wall: '#18181c', frame: '#2a2a30', lit: ['#fff2c0', '#ffd480', '#ffffff'] },
    { wall: '#0c0f1c', frame: '#161c33', lit: ['#8f9bff', '#c8ceff', '#ff9ee8'] },
  ];
  const p = palettes[variant % palettes.length];
  base.ctx.fillStyle = p.wall;
  base.ctx.fillRect(0, 0, W, H);
  em.ctx.fillStyle = '#000';
  em.ctx.fillRect(0, 0, W, H);
  ro.ctx.fillStyle = '#b0b0b0';
  ro.ctx.fillRect(0, 0, W, H);

  const style = variant % 3;
  const cols = style === 0 ? 8 : style === 1 ? 4 : 16;
  const rows = style === 0 ? 10 : style === 1 ? 12 : 16;
  const cw = W / cols;
  const rh = H / rows;
  for (let r = 0; r < rows; r++) {
    // pasy stropów
    base.ctx.fillStyle = p.frame;
    base.ctx.fillRect(0, r * rh, W, rh * 0.18);
    for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.12;
      const y = r * rh + rh * 0.25;
      const w = cw * 0.76;
      const h = rh * 0.65;
      // szkło
      const g = base.ctx.createLinearGradient(x, y, x + w, y + h);
      g.addColorStop(0, '#1c2a3e');
      g.addColorStop(1, '#0a1018');
      base.ctx.fillStyle = g;
      base.ctx.fillRect(x, y, w, h);
      ro.ctx.fillStyle = '#202020';
      ro.ctx.fillRect(x, y, w, h);
      const lit = rnd(seed) < (style === 2 ? 0.28 : 0.42);
      if (lit) {
        const col = p.lit[Math.floor(rnd(seed) * p.lit.length)];
        const intensity = 0.35 + rnd(seed) * 0.65;
        em.ctx.globalAlpha = intensity;
        const eg = em.ctx.createLinearGradient(x, y, x, y + h);
        eg.addColorStop(0, col);
        eg.addColorStop(1, '#222');
        em.ctx.fillStyle = eg;
        em.ctx.fillRect(x, y, w, h);
        // żaluzje / sylwetki
        if (rnd(seed) < 0.4) {
          em.ctx.globalAlpha = 1;
          em.ctx.fillStyle = 'rgba(0,0,0,0.5)';
          for (let k = 0; k < 4; k++) em.ctx.fillRect(x, y + (h / 4) * k, w, 1.5);
        }
        em.ctx.globalAlpha = 1;
        base.ctx.fillStyle = col;
        base.ctx.globalAlpha = 0.25;
        base.ctx.fillRect(x, y, w, h);
        base.ctx.globalAlpha = 1;
      }
    }
  }
  // pionowe żebra
  base.ctx.fillStyle = p.frame;
  for (let c = 0; c <= cols; c++) base.ctx.fillRect(c * cw - 1, 0, 2, H);
  // brud / szum
  const img = base.ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (rnd(seed) - 0.5) * 10;
    img.data[i] += n;
    img.data[i + 1] += n;
    img.data[i + 2] += n;
  }
  base.ctx.putImageData(img, 0, 0);
  return { map: tex(base.c), emissive: tex(em.c), rough: tex(ro.c, false) };
}

export function roadTextures() {
  const W = 512;
  const H = 512;
  const b = canvas(W, H);
  const r = canvas(W, H);
  const seed = { v: 42 };
  b.ctx.fillStyle = '#16161b';
  b.ctx.fillRect(0, 0, W, H);
  // ziarno asfaltu
  const img = b.ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = rnd(seed) * 28 - 10;
    img.data[i] = 22 + n;
    img.data[i + 1] = 22 + n;
    img.data[i + 2] = 28 + n;
  }
  b.ctx.putImageData(img, 0, 0);
  // koleiny
  b.ctx.fillStyle = 'rgba(0,0,0,0.25)';
  [0.22, 0.32, 0.68, 0.78].forEach((u) => b.ctx.fillRect(u * W - 10, 0, 20, H));
  // krawędzie
  b.ctx.fillStyle = '#e8e8f0';
  b.ctx.fillRect(10, 0, 8, H);
  b.ctx.fillRect(W - 18, 0, 8, H);
  // linie przerywane
  b.ctx.fillStyle = '#d8d8e0';
  for (const u of [0.25, 0.5, 0.75]) {
    b.ctx.fillRect(u * W - 3, 0, 6, H * 0.5);
  }
  // mapa szorstkości — kałuże
  r.ctx.fillStyle = '#9a9a9a';
  r.ctx.fillRect(0, 0, W, H);
  for (let i = 0; i < 26; i++) {
    const x = rnd(seed) * W;
    const y = rnd(seed) * H;
    const rad = 20 + rnd(seed) * 70;
    const g = r.ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(10,10,10,0.95)');
    g.addColorStop(0.6, 'rgba(30,30,30,0.6)');
    g.addColorStop(1, 'rgba(150,150,150,0)');
    r.ctx.fillStyle = g;
    r.ctx.beginPath();
    r.ctx.ellipse(x, y, rad, rad * 0.6, rnd(seed) * 3, 0, Math.PI * 2);
    r.ctx.fill();
  }
  const map = tex(b.c);
  const rough = tex(r.c, false);
  return { map, rough };
}

export function groundTexture() {
  const S = 512;
  const b = canvas(S, S);
  const seed = { v: 7 };
  b.ctx.fillStyle = '#0d0d12';
  b.ctx.fillRect(0, 0, S, S);
  const img = b.ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = rnd(seed) * 14;
    img.data[i] = 12 + n;
    img.data[i + 1] = 12 + n;
    img.data[i + 2] = 17 + n;
  }
  b.ctx.putImageData(img, 0, 0);
  // chodniki / siatka ulic
  b.ctx.strokeStyle = '#26262e';
  b.ctx.lineWidth = 10;
  b.ctx.strokeRect(0, 0, S, S);
  b.ctx.strokeStyle = 'rgba(200,200,220,0.25)';
  b.ctx.lineWidth = 2;
  b.ctx.setLineDash([20, 20]);
  b.ctx.beginPath();
  b.ctx.moveTo(S / 2, 0);
  b.ctx.lineTo(S / 2, S);
  b.ctx.moveTo(0, S / 2);
  b.ctx.lineTo(S, S / 2);
  b.ctx.stroke();
  return tex(b.c);
}

export function barrierTexture() {
  const W = 256;
  const H = 64;
  const b = canvas(W, H);
  b.ctx.fillStyle = '#000';
  b.ctx.fillRect(0, 0, W, H);
  // biegnące segmenty
  for (let i = 0; i < 8; i++) {
    b.ctx.fillStyle = i % 2 === 0 ? '#00e5ff' : '#ff2bd6';
    b.ctx.fillRect(i * 32 + 2, 4, 28, 10);
  }
  b.ctx.fillStyle = '#00e5ff';
  b.ctx.fillRect(0, H - 8, W, 3);
  return tex(b.c);
}

export function chevronTexture(color = '#00f0ff') {
  const W = 128;
  const H = 256;
  const b = canvas(W, H);
  b.ctx.fillStyle = 'rgba(0,0,0,0)';
  b.ctx.clearRect(0, 0, W, H);
  b.ctx.strokeStyle = color;
  b.ctx.lineWidth = 16;
  b.ctx.lineJoin = 'miter';
  for (let i = 0; i < 3; i++) {
    const y = 60 + i * 70;
    b.ctx.beginPath();
    b.ctx.moveTo(14, y + 30);
    b.ctx.lineTo(W / 2, y - 20);
    b.ctx.lineTo(W - 14, y + 30);
    b.ctx.stroke();
  }
  b.ctx.strokeStyle = color;
  b.ctx.lineWidth = 6;
  b.ctx.strokeRect(3, 3, W - 6, H - 6);
  return tex(b.c, true, false);
}

export function checkerTexture() {
  const S = 256;
  const b = canvas(S, S / 4);
  for (let x = 0; x < 16; x++)
    for (let y = 0; y < 4; y++) {
      b.ctx.fillStyle = (x + y) % 2 === 0 ? '#f4f4f4' : '#101010';
      b.ctx.fillRect(x * 16, y * 16, 16, 16);
    }
  return tex(b.c);
}

const BILLBOARDS = [
  { t: 'NEON RUSH', s: 'GRAND PRIX 2099', c1: '#00f0ff', c2: '#ff2bd6' },
  { t: 'ZAP COLA', s: 'ENERGIA KWANTOWA', c1: '#ff3b3b', c2: '#ffd400' },
  { t: 'HYPERDRIVE', s: 'NAPĘD FUZYJNY', c1: '#7cff4f', c2: '#00f0ff' },
  { t: 'ネオン都市', s: 'NEO KRAKÓW', c1: '#ff2bd6', c2: '#ffffff' },
  { t: 'SYNTH//CORP', s: 'PRZYSZŁOŚĆ JEST TERAZ', c1: '#b04dff', c2: '#00f0ff' },
  { t: 'KART-X', s: 'MISTRZOSTWA ŚWIATA', c1: '#ffae00', c2: '#ff2bd6' },
  { t: 'ORBITAL', s: 'LOTY NA KSIĘŻYC 99₡', c1: '#4fd1ff', c2: '#ffffff' },
  { t: 'CYBER SUSHI', s: '24/7 DRONY DOSTAWY', c1: '#ff4f8b', c2: '#7cff4f' },
];

export function billboardTexture(i: number) {
  const W = 1024;
  const H = 512;
  const b = canvas(W, H);
  const d = BILLBOARDS[i % BILLBOARDS.length];
  const g = b.ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, 'rgba(10,0,30,0.85)');
  g.addColorStop(1, 'rgba(0,20,40,0.85)');
  b.ctx.fillStyle = g;
  b.ctx.fillRect(0, 0, W, H);
  b.ctx.strokeStyle = d.c1;
  b.ctx.lineWidth = 14;
  b.ctx.strokeRect(12, 12, W - 24, H - 24);
  b.ctx.shadowColor = d.c1;
  b.ctx.shadowBlur = 40;
  b.ctx.fillStyle = d.c1;
  b.ctx.font = 'bold 150px "Segoe UI", sans-serif';
  b.ctx.textAlign = 'center';
  b.ctx.textBaseline = 'middle';
  b.ctx.fillText(d.t, W / 2, H * 0.42);
  b.ctx.shadowColor = d.c2;
  b.ctx.fillStyle = d.c2;
  b.ctx.font = 'bold 56px "Segoe UI", sans-serif';
  b.ctx.fillText(d.s, W / 2, H * 0.76);
  // linie skanowania
  b.ctx.shadowBlur = 0;
  b.ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < H; y += 6) b.ctx.fillRect(0, y, W, 2);
  return tex(b.c, true, false);
}

export function itemBoxTexture() {
  const S = 256;
  const b = canvas(S, S);
  const g = b.ctx.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, 'rgba(0,240,255,0.55)');
  g.addColorStop(0.5, 'rgba(180,80,255,0.35)');
  g.addColorStop(1, 'rgba(255,40,210,0.55)');
  b.ctx.fillStyle = g;
  b.ctx.fillRect(0, 0, S, S);
  b.ctx.strokeStyle = '#ffffff';
  b.ctx.lineWidth = 10;
  b.ctx.strokeRect(5, 5, S - 10, S - 10);
  b.ctx.fillStyle = '#ffffff';
  b.ctx.font = 'bold 180px "Segoe UI", sans-serif';
  b.ctx.textAlign = 'center';
  b.ctx.textBaseline = 'middle';
  b.ctx.shadowColor = '#fff';
  b.ctx.shadowBlur = 20;
  b.ctx.fillText('?', S / 2, S / 2 + 10);
  return tex(b.c, true, false);
}

export function screenTexture() {
  const W = 512;
  const H = 128;
  const b = canvas(W, H);
  b.ctx.fillStyle = '#05050a';
  b.ctx.fillRect(0, 0, W, H);
  b.ctx.fillStyle = '#00f0ff';
  b.ctx.shadowColor = '#00f0ff';
  b.ctx.shadowBlur = 20;
  b.ctx.font = 'bold 70px "Segoe UI", sans-serif';
  b.ctx.textAlign = 'center';
  b.ctx.textBaseline = 'middle';
  b.ctx.fillText('START ▸ META', W / 2, H / 2);
  return tex(b.c, true, false);
}

export function glowSprite() {
  const S = 128;
  const b = canvas(S, S);
  const g = b.ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.2, 'rgba(255,255,255,0.6)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  b.ctx.fillStyle = g;
  b.ctx.fillRect(0, 0, S, S);
  return tex(b.c, true, false);
}
