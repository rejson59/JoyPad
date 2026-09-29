import * as THREE from 'three';
import { A, B, GOAL_W } from './constants';

export function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function mk(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  return { c, g };
}

function tex(c: HTMLCanvasElement, srgb = true, repeat = false, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

function rr(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* ---------------- Murawa ---------------- */
export function makeFloorTexture(): THREE.CanvasTexture {
  const W = 2048;
  const Hh = 2560;
  const { c, g } = mk(W, Hh);
  const px = W / (2 * A);
  const pz = Hh / (2 * B);
  const R = rng(11);
  const X = (x: number) => (x + A) * px;
  const Z = (z: number) => (z + B) * pz;
  const bands = 16;
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * Hh;
    const bh = Hh / bands;
    const dark = i % 2 === 0;
    const grd = g.createLinearGradient(0, y0, 0, y0 + bh);
    grd.addColorStop(0, dark ? '#1a5230' : '#236338');
    grd.addColorStop(1, dark ? '#1e5a33' : '#286c3d');
    g.fillStyle = grd;
    g.fillRect(0, y0, W, bh + 1);
  }
  // ziarno murawy
  for (let i = 0; i < 120000; i++) {
    const x = R() * W;
    const y = R() * Hh;
    g.fillStyle = R() > 0.5 ? 'rgba(200,255,200,0.035)' : 'rgba(0,10,0,0.07)';
    g.fillRect(x, y, 1 + R() * 2, 2 + R() * 7);
  }
  // plamy
  for (let i = 0; i < 60; i++) {
    const x = R() * W;
    const y = R() * Hh;
    const rad = 60 + R() * 160;
    const rg = g.createRadialGradient(x, y, 0, x, y, rad);
    rg.addColorStop(0, R() > 0.5 ? 'rgba(255,255,200,0.045)' : 'rgba(0,0,0,0.06)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = rg;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // barwy drużyn na końcach
  const bt = g.createLinearGradient(0, Hh, 0, Hh - 26 * pz);
  bt.addColorStop(0, 'rgba(40,110,255,0.30)');
  bt.addColorStop(1, 'rgba(40,110,255,0)');
  g.fillStyle = bt;
  g.fillRect(0, Hh - 26 * pz, W, 26 * pz);
  const ot = g.createLinearGradient(0, 0, 0, 26 * pz);
  ot.addColorStop(0, 'rgba(255,130,30,0.30)');
  ot.addColorStop(1, 'rgba(255,130,30,0)');
  g.fillStyle = ot;
  g.fillRect(0, 0, W, 26 * pz);

  // linie
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.lineWidth = 0.34 * px;
  g.strokeStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.moveTo(0, Z(0));
  g.lineTo(W, Z(0));
  g.stroke();
  g.beginPath();
  g.arc(X(0), Z(0), 8.4 * px, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath();
  g.arc(X(0), Z(0), 0.55 * px, 0, Math.PI * 2);
  g.fill();

  // półkola barwne w kole środkowym
  g.fillStyle = 'rgba(40,110,255,0.14)';
  g.beginPath();
  g.arc(X(0), Z(0), 8.2 * px, 0, Math.PI);
  g.fill();
  g.fillStyle = 'rgba(255,130,30,0.14)';
  g.beginPath();
  g.arc(X(0), Z(0), 8.2 * px, Math.PI, Math.PI * 2);
  g.fill();
  g.save();
  g.translate(X(0), Z(0));
  g.font = `italic 900 ${5.2 * px}px Arial Black, Impact, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(255,255,255,0.16)';
  g.fillText('N', 0, 0.3 * px);
  g.restore();

  // pola bramkowe
  for (const s of [1, -1]) {
    const col = s > 0 ? 'rgba(110,175,255,0.95)' : 'rgba(255,170,90,0.95)';
    g.strokeStyle = col;
    g.shadowColor = col;
    g.shadowBlur = 14;
    g.lineWidth = 0.3 * px;
    const gw = GOAL_W + 2.8;
    const zEdge = s * (B - 0.2);
    const zIn = s * (B - 9);
    g.beginPath();
    g.moveTo(X(-gw), Z(zEdge));
    g.lineTo(X(-gw), Z(zIn));
    g.lineTo(X(gw), Z(zIn));
    g.lineTo(X(gw), Z(zEdge));
    g.stroke();
    const gw2 = GOAL_W + 13;
    const zIn2 = s * (B - 22);
    g.globalAlpha = 0.55;
    g.beginPath();
    g.moveTo(X(-gw2), Z(zEdge));
    g.lineTo(X(-gw2), Z(zIn2));
    g.lineTo(X(gw2), Z(zIn2));
    g.lineTo(X(gw2), Z(zEdge));
    g.stroke();
    g.globalAlpha = 1;
    // łuk
    g.beginPath();
    g.arc(X(0), Z(s * (B - 15)), 8.6 * px, s > 0 ? Math.PI * 1.2 : Math.PI * 0.2, s > 0 ? Math.PI * 1.8 : Math.PI * 0.8);
    g.stroke();
    g.shadowBlur = 0;
    // linia bramkowa
    g.strokeStyle = 'rgba(255,255,255,0.9)';
    g.lineWidth = 0.4 * px;
    g.beginPath();
    g.moveTo(0, Z(s * (B - 0.25)));
    g.lineTo(W, Z(s * (B - 0.25)));
    g.stroke();
  }
  // ściemnienie krawędzi
  const e = 4 * px;
  const edges: [number, number, number, number, number, number][] = [
    [0, 0, e, 0, 0, W],
    [W, 0, W - e, 0, 0, W],
  ];
  for (const [x0, , x1] of edges) {
    const gr = g.createLinearGradient(x0, 0, x1, 0);
    gr.addColorStop(0, 'rgba(0,0,0,0.45)');
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(Math.min(x0, x1), 0, e, Hh);
  }
  return tex(c, true, false, 16);
}

export function makeNoiseTexture(size = 256): THREE.CanvasTexture {
  const { c, g } = mk(size, size);
  const R = rng(5);
  const id = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 100 + R() * 155;
    id.data[i * 4] = id.data[i * 4 + 1] = id.data[i * 4 + 2] = v;
    id.data[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  const s2 = mk(24, 24);
  const id2 = s2.g.createImageData(24, 24);
  for (let i = 0; i < 24 * 24; i++) {
    const v = 60 + R() * 195;
    id2.data[i * 4] = id2.data[i * 4 + 1] = id2.data[i * 4 + 2] = v;
    id2.data[i * 4 + 3] = 255;
  }
  s2.g.putImageData(id2, 0, 0);
  g.globalAlpha = 0.55;
  g.imageSmoothingEnabled = true;
  g.drawImage(s2.c, 0, 0, size, size);
  g.globalAlpha = 1;
  return tex(c, false, true);
}

/* ---------------- Ściany ---------------- */
export function makeWallTextures() {
  const S = 512;
  const a = mk(S, S);
  const e = mk(S, S);
  const R = rng(3);
  a.g.fillStyle = '#0d1424';
  a.g.fillRect(0, 0, S, S);
  e.g.fillStyle = '#000';
  e.g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const x = i * 256 + 8;
      const y = j * 256 + 8;
      const w = 240;
      const grd = a.g.createLinearGradient(x, y, x + w, y + w);
      grd.addColorStop(0, '#1f2c48');
      grd.addColorStop(1, '#121a2e');
      a.g.fillStyle = grd;
      rr(a.g, x, y, w, w, 10);
      a.g.fill();
      a.g.strokeStyle = 'rgba(160,190,255,0.28)';
      a.g.lineWidth = 2;
      rr(a.g, x + 1, y + 1, w - 2, w - 2, 10);
      a.g.stroke();
      a.g.strokeStyle = 'rgba(0,0,0,0.6)';
      a.g.lineWidth = 3;
      rr(a.g, x + 5, y + 5, w - 10, w - 10, 8);
      a.g.stroke();
      // nity
      a.g.fillStyle = 'rgba(200,215,255,0.35)';
      for (const [dx, dy] of [[16, 16], [w - 16, 16], [16, w - 16], [w - 16, w - 16]]) {
        a.g.beginPath();
        a.g.arc(x + dx, y + dy, 3.2, 0, Math.PI * 2);
        a.g.fill();
      }
      // chevrony (emisja)
      e.g.strokeStyle = '#ffffff';
      e.g.lineCap = 'round';
      e.g.lineJoin = 'round';
      for (let k = 0; k < 3; k++) {
        const off = k * 46;
        e.g.globalAlpha = 1 - k * 0.28;
        e.g.lineWidth = 9;
        e.g.beginPath();
        e.g.moveTo(x + 60 + off * 0.2, y + 54 + off * 0.0);
        e.g.lineTo(x + 130 + off * 0.2, y + 120);
        e.g.lineTo(x + 60 + off * 0.2, y + 186);
        e.g.stroke();
        e.g.translate(0, 0);
      }
      e.g.globalAlpha = 0.9;
      e.g.lineWidth = 3;
      rr(e.g, x + 12, y + 12, w - 24, w - 24, 8);
      e.g.stroke();
      e.g.globalAlpha = 1;
      // diody
      e.g.fillStyle = '#ffffff';
      for (let k = 0; k < 5; k++) {
        e.g.beginPath();
        e.g.arc(x + 170 + k * 12, y + 206, 3, 0, Math.PI * 2);
        e.g.fill();
      }
    }
  }
  // szum
  for (let i = 0; i < 6000; i++) {
    a.g.fillStyle = R() > 0.5 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.08)';
    a.g.fillRect(R() * S, R() * S, 1 + R() * 2, 1 + R() * 2);
  }
  return { map: tex(a.c, true, true, 16), emissive: tex(e.c, true, true, 16) };
}

export function makeGlassTexture(): THREE.CanvasTexture {
  const { c, g } = mk(256, 256);
  g.fillStyle = 'rgba(120,180,255,0.10)';
  g.fillRect(0, 0, 256, 256);
  const gr = g.createLinearGradient(0, 0, 256, 256);
  gr.addColorStop(0, 'rgba(255,255,255,0.10)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0)');
  gr.addColorStop(1, 'rgba(255,255,255,0.08)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(190,220,255,0.75)';
  g.lineWidth = 5;
  g.strokeRect(0, 0, 256, 256);
  return tex(c, true, true, 8);
}

export function makeGridTexture(): THREE.CanvasTexture {
  const { c, g } = mk(256, 256);
  g.fillStyle = 'rgba(0,0,0,0)';
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = 'rgba(120,220,255,0.75)';
  g.lineWidth = 2;
  for (let i = 0; i <= 256; i += 64) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, 256);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(256, i);
    g.stroke();
  }
  g.fillStyle = 'rgba(200,245,255,0.95)';
  for (let x = 0; x <= 256; x += 64) for (let y = 0; y <= 256; y += 64) g.fillRect(x - 3, y - 3, 6, 6);
  return tex(c, true, true, 4);
}

/* ---------------- Ekrany LED / reklamy ---------------- */
export function makeLedTexture(): THREE.CanvasTexture {
  const W = 2048;
  const Hh = 128;
  const { c, g } = mk(W, Hh);
  g.fillStyle = '#04050b';
  g.fillRect(0, 0, W, Hh);
  const items: [string, string, string][] = [
    ['NITRO LEAGUE', '#00e5ff', '#0077ff'],
    ['★ TURBO ENERGY ★', '#ffe14a', '#ff8a00'],
    ['MEGA BOOST', '#ff5be0', '#8f2bff'],
    ['ARENA 2026', '#9dff6b', '#00c96b'],
  ];
  const seg = W / items.length;
  items.forEach((it, i) => {
    const gr = g.createLinearGradient(0, 20, 0, 108);
    gr.addColorStop(0, it[1]);
    gr.addColorStop(1, it[2]);
    g.fillStyle = gr;
    g.shadowColor = it[1];
    g.shadowBlur = 12;
    g.font = 'italic 900 74px Arial Black, Impact, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(it[0], seg * i + seg / 2, Hh / 2 + 3);
    g.shadowBlur = 0;
    g.fillStyle = it[1];
    g.fillRect(seg * i + 8, 6, 4, Hh - 12);
  });
  g.fillStyle = 'rgba(0,0,0,0.58)';
  for (let x = 0; x < W; x += 4) g.fillRect(x, 0, 1.4, Hh);
  for (let y = 0; y < Hh; y += 4) g.fillRect(0, y, W, 1.4);
  const t = tex(c, true, true, 8);
  return t;
}

/* ---------------- Tłum ---------------- */
export function makeCrowdTexture(): THREE.CanvasTexture {
  const S = 512;
  const { c, g } = mk(S, S);
  const R = rng(77);
  g.fillStyle = '#0a0d16';
  g.fillRect(0, 0, S, S);
  const cols = 16;
  const rows = 8;
  const cw = S / cols;
  const ch = S / rows;
  const shirts = ['#c8d0e0', '#e8e8ea', '#2b3350', '#1a1f2e', '#d23535', '#3b78e0', '#ee8a2c', '#f2c828', '#3aa565', '#8a52d6', '#a3a9bb', '#f5f5f5', '#ff629c', '#5b6786', '#2a2f40'];
  const skins = ['#f3cba8', '#e2ae84', '#c98a66', '#8d5a3b', '#5a3825', '#f7d8bd'];
  const hairs = ['#151515', '#2b1a10', '#5a3a1a', '#c9a45a', '#8a8a8a', '#3a2a20'];
  for (let r = 0; r < rows; r++) {
    for (let cI = 0; cI < cols; cI++) {
      const x = cI * cw;
      const y = r * ch;
      g.fillStyle = 'rgba(24,30,46,1)';
      g.fillRect(x + 3, y + 44, cw - 6, 20);
      const shirt = shirts[Math.floor(R() * shirts.length)];
      const skin = skins[Math.floor(R() * skins.length)];
      const armsUp = R() < 0.35;
      if (armsUp) {
        g.fillStyle = skin;
        g.fillRect(x + 6, y + 8 + R() * 6, 4, 24);
        g.fillRect(x + cw - 10, y + 8 + R() * 6, 4, 24);
      }
      g.fillStyle = shirt;
      rr(g, x + 6, y + 28, cw - 12, 36, 7);
      g.fill();
      const sh = g.createLinearGradient(x, y + 28, x, y + 64);
      sh.addColorStop(0, 'rgba(255,255,255,0.14)');
      sh.addColorStop(1, 'rgba(0,0,0,0.35)');
      g.fillStyle = sh;
      rr(g, x + 6, y + 28, cw - 12, 36, 7);
      g.fill();
      if (R() < 0.18) {
        g.fillStyle = shirts[Math.floor(R() * shirts.length)];
        g.fillRect(x + 8, y + 30, cw - 16, 4);
      }
      g.fillStyle = skin;
      g.beginPath();
      g.arc(x + cw / 2, y + 20, 6.8, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = hairs[Math.floor(R() * hairs.length)];
      g.beginPath();
      g.arc(x + cw / 2, y + 18, 6.9, Math.PI, Math.PI * 2);
      g.fill();
    }
  }
  return tex(c, true, true, 8);
}

/* ---------------- Piłka (Voronoi na sferze) ---------------- */
export function makeBallTextures() {
  const W = 1024;
  const Hh = 512;
  const N = 62;
  const pts = new Float32Array(N * 3);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < N; i++) {
    const y = 1 - ((i + 0.5) / N) * 2;
    const r = Math.sqrt(1 - y * y);
    const th = golden * i;
    pts[i * 3] = Math.cos(th) * r;
    pts[i * 3 + 1] = y;
    pts[i * 3 + 2] = Math.sin(th) * r;
  }
  const cm = mk(W, Hh);
  const em = mk(W, Hh);
  const bm = mk(W, Hh);
  const cd = cm.g.createImageData(W, Hh);
  const ed = em.g.createImageData(W, Hh);
  const bd = bm.g.createImageData(W, Hh);
  const hash = (i: number) => {
    const s = Math.sin(i * 127.1 + 3.7) * 43758.5453;
    return s - Math.floor(s);
  };
  for (let y = 0; y < Hh; y++) {
    const lat = (0.5 - (y + 0.5) / Hh) * Math.PI;
    const cl = Math.cos(lat);
    const sl = Math.sin(lat);
    for (let x = 0; x < W; x++) {
      const lon = ((x + 0.5) / W) * Math.PI * 2;
      const dx = cl * Math.cos(lon);
      const dz = cl * Math.sin(lon);
      let b1 = -2;
      let b2 = -2;
      let i1 = 0;
      for (let k = 0; k < N; k++) {
        const d = dx * pts[k * 3] + sl * pts[k * 3 + 1] + dz * pts[k * 3 + 2];
        if (d > b1) {
          b2 = b1;
          b1 = d;
          i1 = k;
        } else if (d > b2) b2 = d;
      }
      const e = b1 - b2;
      const t = smooth(0.0, 0.05, e);
      const h = hash(i1);
      const base = 34 + 34 * h;
      const shade = 0.5 + 0.5 * t;
      const k4 = (y * W + x) * 4;
      cd.data[k4] = base * shade * 0.92;
      cd.data[k4 + 1] = base * shade * 1.0;
      cd.data[k4 + 2] = base * shade * 1.18 + 6;
      cd.data[k4 + 3] = 255;
      const line = 1 - smooth(0.003, 0.014, e);
      const glow = (1 - smooth(0.0, 0.07, e)) * 0.18;
      const panel = h > 0.82 ? 0.16 : 0.0;
      const ev = Math.min(1, line + glow + panel) * 255;
      ed.data[k4] = ed.data[k4 + 1] = ed.data[k4 + 2] = ev;
      ed.data[k4 + 3] = 255;
      const bv = 60 + 195 * t;
      bd.data[k4] = bd.data[k4 + 1] = bd.data[k4 + 2] = bv;
      bd.data[k4 + 3] = 255;
    }
  }
  cm.g.putImageData(cd, 0, 0);
  em.g.putImageData(ed, 0, 0);
  bm.g.putImageData(bd, 0, 0);
  return { map: tex(cm.c, true, false, 16), emissive: tex(em.c, true, false, 16), bump: tex(bm.c, false, false, 16) };
}

/* ---------------- Sprite'y i gradienty ---------------- */
export function makeGlowTexture(size = 128): THREE.CanvasTexture {
  const { c, g } = mk(size, size);
  const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.18, 'rgba(255,255,255,0.65)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.14)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, size, size);
  return tex(c, true, false, 4);
}

// gradient alfa wzdłuż stożka: podstawa (uv.y=0, dół canvasa) jasna -> czubek przezroczysty
export function makeFlameTexture(): THREE.CanvasTexture {
  const { c, g } = mk(16, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(0, 'rgba(255,255,255,0)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.25)');
  gr.addColorStop(0.8, 'rgba(255,255,255,0.95)');
  gr.addColorStop(1, 'rgba(255,255,255,1)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 128);
  return tex(c, true, false, 2);
}

export function makeBeamTexture(reverse = false): THREE.CanvasTexture {
  const { c, g } = mk(16, 128);
  const gr = g.createLinearGradient(0, 0, 0, 128);
  gr.addColorStop(reverse ? 1 : 0, 'rgba(255,255,255,0.0)');
  gr.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  gr.addColorStop(reverse ? 0 : 1, 'rgba(255,255,255,1)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 16, 128);
  return tex(c, true, false, 2);
}

export function makeNetTexture(): THREE.CanvasTexture {
  const { c, g } = mk(64, 64);
  g.clearRect(0, 0, 64, 64);
  g.strokeStyle = 'rgba(255,255,255,1)';
  g.lineWidth = 3.2;
  g.beginPath();
  g.moveTo(32, -2);
  g.lineTo(66, 32);
  g.lineTo(32, 66);
  g.lineTo(-2, 32);
  g.closePath();
  g.stroke();
  return tex(c, true, true, 8);
}

export function makeWindowsTexture(): THREE.CanvasTexture {
  const { c, g } = mk(128, 256);
  const R = rng(9);
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 256);
  for (let y = 4; y < 256; y += 8) {
    for (let x = 4; x < 128; x += 8) {
      if (R() < 0.42) {
        const w = R();
        g.fillStyle = w < 0.6 ? '#ffd9a0' : w < 0.85 ? '#a9d4ff' : '#ffffff';
        g.globalAlpha = 0.35 + R() * 0.65;
        g.fillRect(x, y, 4, 5);
      }
    }
  }
  g.globalAlpha = 1;
  return tex(c, true, true, 2);
}

export function makeBoltTexture(): THREE.CanvasTexture {
  const { c, g } = mk(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = '#fff';
  g.beginPath();
  g.moveTo(74, 10);
  g.lineTo(30, 72);
  g.lineTo(58, 72);
  g.lineTo(48, 118);
  g.lineTo(98, 50);
  g.lineTo(68, 50);
  g.closePath();
  g.fill();
  return tex(c, true, false, 4);
}

/* ---------------- Auto ---------------- */
export function makePaintTexture(base: string, accent: string): THREE.CanvasTexture {
  const S = 512;
  const { c, g } = mk(S, S);
  const R = rng(21);
  const gr = g.createLinearGradient(0, 0, S, 0);
  gr.addColorStop(0, base);
  gr.addColorStop(1, base);
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
  // podkład – lekki połysk pionowy
  const sheen = g.createLinearGradient(0, 0, S, 0);
  sheen.addColorStop(0, 'rgba(0,0,0,0.18)');
  sheen.addColorStop(0.25, 'rgba(255,255,255,0.10)');
  sheen.addColorStop(0.5, 'rgba(0,0,0,0.20)');
  sheen.addColorStop(0.75, 'rgba(0,0,0,0.32)');
  sheen.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = sheen;
  g.fillRect(0, 0, S, S);
  // pasy wyścigowe na dachu/masce (u≈0.25)
  const cx = S * 0.25;
  g.fillStyle = accent;
  g.fillRect(cx - 44, 0, 26, S);
  g.fillRect(cx + 18, 0, 26, S);
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.fillRect(cx - 12, 0, 8, S);
  g.fillRect(cx + 4, 0, 8, S);
  // boki: smuga + emblemat (u=0 i u=0.5), rysowane z zawinięciem
  const side = (xc: number) => {
    for (const off of [-S, 0, S]) {
      const x = xc + off;
      g.fillStyle = accent;
      g.beginPath();
      g.moveTo(x - 70, S * 0.95);
      g.lineTo(x + 30, S * 0.5);
      g.lineTo(x + 60, S * 0.5);
      g.lineTo(x - 40, S * 0.95);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(255,255,255,0.9)';
      g.beginPath();
      g.moveTo(x - 20, S * 0.95);
      g.lineTo(x + 66, S * 0.56);
      g.lineTo(x + 78, S * 0.56);
      g.lineTo(x - 8, S * 0.95);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.beginPath();
      g.arc(x + 20, S * 0.32, 30, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = accent;
      g.lineWidth = 4;
      g.stroke();
      g.fillStyle = '#fff';
      g.font = 'italic 900 36px Arial Black, Impact, sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('N', x + 20, S * 0.32 + 2);
    }
  };
  side(0);
  side(S * 0.5);
  side(S);
  // płatki lakieru
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = R() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    g.fillRect(R() * S, R() * S, 1.5, 1.5);
  }
  return tex(c, true, false, 16);
}

export function makeWheelTexture(accent: string, style: number): THREE.CanvasTexture {
  const S = 256;
  const { c, g } = mk(S, S);
  g.clearRect(0, 0, S, S);
  const cx = S / 2;
  const R = S / 2;
  const disc = g.createRadialGradient(cx, cx, 4, cx, cx, R);
  disc.addColorStop(0, '#dfe6f2');
  disc.addColorStop(0.6, '#8f99ab');
  disc.addColorStop(1, '#3b4250');
  g.fillStyle = '#0d0f14';
  g.beginPath();
  g.arc(cx, cx, R - 1, 0, Math.PI * 2);
  g.fill();
  const spokes = style === 0 ? 5 : style === 1 ? 10 : 6;
  g.save();
  g.translate(cx, cx);
  if (style === 2) {
    g.fillStyle = disc;
    g.beginPath();
    g.arc(0, 0, R * 0.92, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0d0f14';
    for (let i = 0; i < 8; i++) {
      g.save();
      g.rotate((i / 8) * Math.PI * 2);
      g.beginPath();
      g.arc(R * 0.6, 0, R * 0.11, 0, Math.PI * 2);
      g.fill();
      g.restore();
    }
  } else {
    for (let i = 0; i < spokes; i++) {
      g.save();
      g.rotate((i / spokes) * Math.PI * 2);
      g.fillStyle = disc;
      const w = style === 0 ? R * 0.2 : R * 0.075;
      rr(g, R * 0.1, -w / 2, R * 0.82, w, w / 2);
      g.fill();
      g.restore();
    }
    g.strokeStyle = disc;
    g.lineWidth = R * 0.08;
    g.beginPath();
    g.arc(0, 0, R * 0.9, 0, Math.PI * 2);
    g.stroke();
  }
  g.strokeStyle = accent;
  g.lineWidth = R * 0.05;
  g.beginPath();
  g.arc(0, 0, R * 0.96, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = disc;
  g.beginPath();
  g.arc(0, 0, R * 0.2, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = accent;
  g.beginPath();
  g.arc(0, 0, R * 0.09, 0, Math.PI * 2);
  g.fill();
  g.restore();
  return tex(c, true, false, 8);
}

export function makeTreadTexture(): THREE.CanvasTexture {
  const { c, g } = mk(64, 32);
  g.fillStyle = '#808080';
  g.fillRect(0, 0, 64, 32);
  g.fillStyle = '#ffffff';
  for (let x = 0; x < 64; x += 8) g.fillRect(x, 0, 4, 32);
  g.fillStyle = '#303030';
  g.fillRect(0, 14, 64, 4);
  return tex(c, false, true, 4);
}
