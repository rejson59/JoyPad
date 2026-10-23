import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  Points,
  ShaderMaterial,
  Sprite,
  SpriteMaterial,
  SRGBColorSpace,
  Vector3,
} from "three";
import { hudFont } from "../hudKit";

const _a = new Vector3();
const _b = new Vector3();
const _side = new Vector3();
const _tan = new Vector3();

export function softCircle() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, "rgba(255,255,255,1)");
  grd.addColorStop(0.35, "rgba(255,255,255,0.65)");
  grd.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export interface Particles {
  points: Points;
  spawn: (x: number, y: number, z: number, vx: number, vy: number, vz: number, color: number, life: number, size: number) => void;
  burst: (x: number, y: number, z: number, color: number, count: number, speed: number, life?: number) => void;
  update: (dt: number) => void;
}

export function createParticles(max = 700): Particles {
  const pos = new Float32Array(max * 3);
  const col = new Float32Array(max * 3);
  const size = new Float32Array(max);
  const alpha = new Float32Array(max);
  const geo = new BufferGeometry();
  geo.setAttribute("position", new BufferAttribute(pos, 3));
  geo.setAttribute("aColor", new BufferAttribute(col, 3));
  geo.setAttribute("aSize", new BufferAttribute(size, 1));
  geo.setAttribute("aAlpha", new BufferAttribute(alpha, 1));
  const mat = new ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uMap: { value: softCircle() } },
    vertexShader: `
      attribute vec3 aColor;
      attribute float aSize;
      attribute float aAlpha;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vColor = aColor;
        vAlpha = aAlpha;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = aSize * (280.0 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform sampler2D uMap;
      varying vec3 vColor;
      varying float vAlpha;
      void main() {
        vec4 t = texture2D(uMap, gl_PointCoord);
        if (t.a < 0.04 || vAlpha < 0.01) discard;
        gl_FragColor = vec4(vColor, t.a * vAlpha);
      }
    `,
  });
  const points = new Points(geo, mat);
  points.frustumCulled = false;
  points.renderOrder = 6;
  const state = Array.from({ length: max }, () => ({
    vx: 0, vy: 0, vz: 0, life: 0, max: 1,
  }));
  let cursor = 0;
  const color = new Color();

  const spawn: Particles["spawn"] = (x, y, z, vx, vy, vz, hex, life, sz) => {
    const i = cursor;
    cursor = (cursor + 1) % max;
    state[i].vx = vx;
    state[i].vy = vy;
    state[i].vz = vz;
    state[i].life = life;
    state[i].max = life;
    pos[i * 3] = x;
    pos[i * 3 + 1] = y;
    pos[i * 3 + 2] = z;
    color.setHex(hex);
    col[i * 3] = color.r;
    col[i * 3 + 1] = color.g;
    col[i * 3 + 2] = color.b;
    size[i] = sz;
    alpha[i] = 1;
  };

  return {
    points,
    spawn,
    burst(x, y, z, hex, count, speed, life = 0.55) {
      for (let i = 0; i < count; i++) {
        const a = Math.random() * Math.PI * 2;
        const u = Math.random();
        const sp = speed * (0.35 + Math.random());
        spawn(
          x, y, z,
          Math.cos(a) * sp * u,
          (Math.random() * 0.8 + 0.2) * speed,
          Math.sin(a) * sp * (1 - u * 0.3),
          hex,
          life * (0.6 + Math.random() * 0.6),
          8 + Math.random() * 16,
        );
      }
    },
    update(dt) {
      for (let i = 0; i < max; i++) {
        const s = state[i];
        if (s.life <= 0) {
          alpha[i] = 0;
          size[i] = 0;
          continue;
        }
        s.life -= dt;
        s.vy -= 4.5 * dt;
        pos[i * 3] += s.vx * dt;
        pos[i * 3 + 1] += s.vy * dt;
        pos[i * 3 + 2] += s.vz * dt;
        alpha[i] = Math.max(0, s.life / s.max);
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.aAlpha.needsUpdate = true;
      geo.attributes.aSize.needsUpdate = true;
      geo.attributes.aColor.needsUpdate = true;
    },
  };
}

export interface Ribbon {
  mesh: Mesh;
  positions: Float32Array;
  colors: Float32Array;
  SEG: number;
}

export function createRibbon(): Ribbon {
  const SEG = 18;
  const geo = new BufferGeometry();
  const positions = new Float32Array(SEG * 3 * 3);
  const colors = new Float32Array(SEG * 3 * 3);
  const idx: number[] = [];
  for (let i = 0; i < SEG - 1; i++) {
    const a = i * 3;
    const b = (i + 1) * 3;
    idx.push(a, a + 1, b, a + 1, b + 1, b, a + 1, a + 2, b + 1, a + 2, b + 2, b + 1);
  }
  geo.setIndex(idx);
  geo.setAttribute("position", new BufferAttribute(positions, 3));
  geo.setAttribute("color", new BufferAttribute(colors, 3));
  const mesh = new Mesh(
    geo,
    new MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
    }),
  );
  mesh.frustumCulled = false;
  mesh.renderOrder = 8;
  mesh.visible = false;
  return { mesh, positions, colors, SEG };
}

export function updateRibbon(
  rib: Ribbon,
  hand: Vector3,
  anchor: Vector3,
  extend: number,
  time: number,
  width: number,
  tint: Color,
  alpha = 1,
) {
  const end = _a.copy(hand).lerp(anchor, Math.max(0.02, extend));
  const mid = _b.copy(hand).lerp(end, 0.45);
  const dist = hand.distanceTo(end);
  mid.y -= Math.min(3.2, dist * 0.1);
  const { SEG, positions, colors } = rib;
  for (let i = 0; i < SEG; i++) {
    const t = i / (SEG - 1);
    const u = 1 - t;
    const x = u * u * hand.x + 2 * u * t * mid.x + t * t * end.x;
    const y = u * u * hand.y + 2 * u * t * mid.y + t * t * end.y;
    const z = u * u * hand.z + 2 * u * t * mid.z + t * t * end.z;
    const t2 = Math.min(1, t + 0.04);
    const u2 = 1 - t2;
    const x2 = u2 * u2 * hand.x + 2 * u2 * t2 * mid.x + t2 * t2 * end.x;
    const y2 = u2 * u2 * hand.y + 2 * u2 * t2 * mid.y + t2 * t2 * end.y;
    const z2 = u2 * u2 * hand.z + 2 * u2 * t2 * mid.z + t2 * t2 * end.z;
    _tan.set(x2 - x, y2 - y, z2 - z);
    if (_tan.lengthSq() < 1e-6) _tan.set(0, 1, 0);
    _tan.normalize();
    _side.set(-_tan.z, 0, _tan.x);
    if (_side.lengthSq() < 1e-5) _side.set(1, 0, 0);
    _side.normalize();
    const w = width * (1.05 - t * 0.7) * (0.82 + 0.18 * Math.sin(time * 28 - t * 14));
    const o = i * 9;
    positions[o] = x + _side.x * w;
    positions[o + 1] = y + _side.y * w;
    positions[o + 2] = z + _side.z * w;
    positions[o + 3] = x;
    positions[o + 4] = y;
    positions[o + 5] = z;
    positions[o + 6] = x - _side.x * w;
    positions[o + 7] = y - _side.y * w;
    positions[o + 8] = z - _side.z * w;
    const edge = 0.35 * alpha;
    const core = alpha;
    for (const k of [0, 2]) {
      colors[o + k * 3] = tint.r * edge;
      colors[o + k * 3 + 1] = tint.g * edge;
      colors[o + k * 3 + 2] = tint.b * edge;
    }
    colors[o + 3] = 0.75 * core + tint.r * 0.4;
    colors[o + 4] = 0.9 * core + tint.g * 0.25;
    colors[o + 5] = core;
  }
  rib.mesh.visible = alpha > 0.02 && extend > 0.01;
  (rib.mesh.material as MeshBasicMaterial).opacity = 1;
  rib.mesh.geometry.attributes.position.needsUpdate = true;
  rib.mesh.geometry.attributes.color.needsUpdate = true;
}

export function updateChain(rib: Ribbon, pts: Vector3[], width: number, tint: Color) {
  const n = pts.length;
  if (n < 2) {
    rib.mesh.visible = false;
    return;
  }
  const { SEG, positions, colors } = rib;
  for (let i = 0; i < SEG; i++) {
    const f = (i / (SEG - 1)) * (n - 1);
    const i0 = Math.min(n - 2, Math.floor(f));
    const u = f - i0;
    const p = pts[i0];
    const q = pts[i0 + 1];
    const x = p.x + (q.x - p.x) * u;
    const y = p.y + (q.y - p.y) * u;
    const z = p.z + (q.z - p.z) * u;
    const i1 = Math.min(n - 2, i0 + (u > 0.6 ? 1 : 0));
    const q2 = pts[Math.min(n - 1, i1 + 1)];
    const p2 = pts[i1];
    _tan.set(q2.x - p2.x, q2.y - p2.y, q2.z - p2.z);
    if (_tan.lengthSq() < 1e-6) _tan.set(0, 1, 0);
    _tan.normalize();
    _side.set(-_tan.z, 0, _tan.x);
    if (_side.lengthSq() < 1e-5) _side.set(1, 0, 0);
    _side.normalize();
    const w = width * (1 - (i / SEG) * 0.55);
    const o = i * 9;
    positions[o] = x + _side.x * w;
    positions[o + 1] = y;
    positions[o + 2] = z + _side.z * w;
    positions[o + 3] = x;
    positions[o + 4] = y;
    positions[o + 5] = z;
    positions[o + 6] = x - _side.x * w;
    positions[o + 7] = y;
    positions[o + 8] = z - _side.z * w;
    const edge = 0.45;
    for (const k of [0, 2]) {
      colors[o + k * 3] = tint.r * edge;
      colors[o + k * 3 + 1] = tint.g * edge;
      colors[o + k * 3 + 2] = tint.b * edge;
    }
    colors[o + 3] = Math.min(1, tint.r + 0.35);
    colors[o + 4] = Math.min(1, tint.g + 0.35);
    colors[o + 5] = Math.min(1, tint.b + 0.35);
  }
  rib.mesh.visible = true;
  rib.mesh.geometry.attributes.position.needsUpdate = true;
  rib.mesh.geometry.attributes.color.needsUpdate = true;
}

export function makeLabel(text: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 64;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 256, 64);
  g.fillStyle = "rgba(6,4,10,0.72)";
  roundRect(g, 28, 10, 200, 44, 16);
  g.fill();
  g.fillStyle = color;
  g.font = hudFont(800, 28);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(text, 128, 34);
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const spr = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(2.3, 0.58, 1);
  spr.position.y = 2.15;
  spr.renderOrder = 20;
  return spr;
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export function makeFloaterSprite(text: string, sub: string, color: string) {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.clearRect(0, 0, 512, 256);
  g.textAlign = "center";
  g.lineJoin = "round";
  g.font = hudFont(800, 86);
  g.lineWidth = 12;
  g.strokeStyle = "rgba(0,0,0,0.7)";
  g.strokeText(text, 256, 112);
  g.fillStyle = color;
  g.fillText(text, 256, 112);
  if (sub) {
    g.font = hudFont(700, 36);
    g.strokeStyle = "rgba(0,0,0,0.65)";
    g.lineWidth = 8;
    g.strokeText(sub, 256, 176);
    g.fillStyle = "#fff8ee";
    g.fillText(sub, 256, 176);
  }
  const tex = new CanvasTexture(c);
  tex.colorSpace = SRGBColorSpace;
  const spr = new Sprite(new SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
  spr.scale.set(3.4, 1.7, 1);
  spr.renderOrder = 30;
  return spr;
}
