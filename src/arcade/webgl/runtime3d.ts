import type { PadInput } from '../../net/protocol';
import { type GameRound, type InputState, type RoundConfig, type RoundHud, type RoundResult } from '../runtime';
import { gameAudio } from '../../game/audio';

export type Vec3 = [number, number, number];
export type Mat4 = Float32Array;

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) for (let row = 0; row < 4; row++) {
    out[column * 4 + row] = a[row] * b[column * 4] + a[4 + row] * b[column * 4 + 1] + a[8 + row] * b[column * 4 + 2] + a[12 + row] * b[column * 4 + 3];
  }
  return out;
}

export function mat4Translate(x: number, y: number, z: number): Mat4 {
  const out = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1]);
  return out;
}

export function mat4Scale(x: number, y: number, z: number): Mat4 {
  return new Float32Array([x, 0, 0, 0, 0, y, 0, 0, 0, 0, z, 0, 0, 0, 0, 1]);
}

export function mat4RotateY(angle: number): Mat4 {
  const c = Math.cos(angle), s = Math.sin(angle);
  return new Float32Array([c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]);
}

export function mat4Perspective(fov: number, aspect: number, near: number, far: number): Mat4 {
  const f = 1 / Math.tan(fov / 2), range = 1 / (near - far);
  return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * range, -1, 0, 0, far * near * range * 2, 0]);
}

export function mat4LookAt(eye: Vec3, target: Vec3, up: Vec3): Mat4 {
  const zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
  const zLength = Math.hypot(zx, zy, zz) || 1;
  const z: Vec3 = [zx / zLength, zy / zLength, zz / zLength];
  const xx = up[1] * z[2] - up[2] * z[1], xy = up[2] * z[0] - up[0] * z[2], xz = up[0] * z[1] - up[1] * z[0];
  const xLength = Math.hypot(xx, xy, xz) || 1;
  const x: Vec3 = [xx / xLength, xy / xLength, xz / xLength];
  const y: Vec3 = [z[1] * x[2] - z[2] * x[1], z[2] * x[0] - z[0] * x[2], z[0] * x[1] - z[1] * x[0]];
  return new Float32Array([
    x[0], y[0], z[0], 0, x[1], y[1], z[1], 0, x[2], y[2], z[2], 0,
    -(x[0] * eye[0] + x[1] * eye[1] + x[2] * eye[2]), -(y[0] * eye[0] + y[1] * eye[1] + y[2] * eye[2]), -(z[0] * eye[0] + z[1] * eye[1] + z[2] * eye[2]), 1,
  ]);
}

interface Mesh { vao: WebGLVertexArrayObject; count: number }

const vertexSource = `#version 300 es
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
uniform mat4 uProjection;
uniform mat4 uView;
uniform mat4 uModel;
out vec3 vNormal;
out vec3 vWorld;
void main() {
  vec4 world = uModel * vec4(aPosition, 1.0);
  vWorld = world.xyz;
  vNormal = mat3(uModel) * aNormal;
  gl_Position = uProjection * uView * world;
}`;

const fragmentSource = `#version 300 es
precision mediump float;
in vec3 vNormal;
in vec3 vWorld;
uniform vec3 uColor;
uniform vec3 uLightDir;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uEmissive;
out vec4 outColor;
void main() {
  vec3 n = normalize(vNormal);
  float diffuse = max(dot(n, normalize(uLightDir)), 0.0);
  float rim = pow(1.0 - max(dot(n, vec3(0.0, 0.0, 1.0)), 0.0), 2.0) * 0.1;
  vec3 lit = uColor * (0.25 + diffuse * 0.75 + rim) + uColor * uEmissive;
  float fog = smoothstep(uFogNear, uFogFar, length(vWorld));
  outColor = vec4(mix(lit, uFogColor, fog), 1.0);
}`;

function compileShader(gl: WebGL2RenderingContext, type: number, source: string) {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('WebGL: nie można utworzyć shadera');
  gl.shaderSource(shader, source); gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'nieznany błąd kompilacji';
    gl.deleteShader(shader); throw new Error(`WebGL shader: ${message}`);
  }
  return shader;
}

function createProgram(gl: WebGL2RenderingContext) {
  const vertex = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  if (!program) throw new Error('WebGL: nie można utworzyć programu');
  gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
  gl.deleteShader(vertex); gl.deleteShader(fragment);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || 'nieznany błąd linkowania';
    gl.deleteProgram(program); throw new Error(`WebGL program: ${message}`);
  }
  return program;
}

function addFace(out: number[], normal: Vec3, a: Vec3, b: Vec3, c: Vec3, d: Vec3) {
  // The order is counter-clockwise when viewed from outside; this keeps back-face culling cheap.
  for (const point of [a, c, b, a, d, c]) out.push(...point, ...normal);
}

function cubeVertices(): number[] {
  const out: number[] = [];
  addFace(out, [0, 1, 0], [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1]);
  addFace(out, [0, -1, 0], [-1, -1, 1], [1, -1, 1], [1, -1, -1], [-1, -1, -1]);
  addFace(out, [0, 0, 1], [-1, -1, 1], [-1, 1, 1], [1, 1, 1], [1, -1, 1]);
  addFace(out, [0, 0, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1], [-1, -1, -1]);
  addFace(out, [1, 0, 0], [1, -1, 1], [1, 1, 1], [1, 1, -1], [1, -1, -1]);
  addFace(out, [-1, 0, 0], [-1, -1, -1], [-1, 1, -1], [-1, 1, 1], [-1, -1, 1]);
  return out;
}

function sphereVertices(rows = 8, columns = 12): number[] {
  const out: number[] = [];
  for (let row = 0; row < rows; row++) {
    const v0 = row / rows, v1 = (row + 1) / rows;
    const phi0 = v0 * Math.PI, phi1 = v1 * Math.PI;
    for (let column = 0; column < columns; column++) {
      const u0 = column / columns, u1 = (column + 1) / columns;
      const theta0 = u0 * Math.PI * 2, theta1 = u1 * Math.PI * 2;
      const points: Vec3[] = [
        [Math.sin(phi0) * Math.cos(theta0), Math.cos(phi0), Math.sin(phi0) * Math.sin(theta0)],
        [Math.sin(phi1) * Math.cos(theta0), Math.cos(phi1), Math.sin(phi1) * Math.sin(theta0)],
        [Math.sin(phi1) * Math.cos(theta1), Math.cos(phi1), Math.sin(phi1) * Math.sin(theta1)],
        [Math.sin(phi0) * Math.cos(theta1), Math.cos(phi0), Math.sin(phi0) * Math.sin(theta1)],
      ];
      for (const point of [points[0], points[2], points[1], points[0], points[3], points[2]]) out.push(...point, ...point);
    }
  }
  return out;
}

function cylinderVertices(rows = 12): number[] {
  const out: number[] = [];
  for (let i = 0; i < rows; i++) {
    const a0 = i / rows * Math.PI * 2, a1 = (i + 1) / rows * Math.PI * 2;
    const p0: Vec3 = [Math.cos(a0), -1, Math.sin(a0)], p1: Vec3 = [Math.cos(a1), -1, Math.sin(a1)];
    const p2: Vec3 = [Math.cos(a1), 1, Math.sin(a1)], p3: Vec3 = [Math.cos(a0), 1, Math.sin(a0)];
    const n0: Vec3 = [Math.cos(a0), 0, Math.sin(a0)], n1: Vec3 = [Math.cos(a1), 0, Math.sin(a1)];
    for (const [point, normal] of [[p0, n0], [p2, n1], [p1, n1], [p0, n0], [p3, n0], [p2, n1]] as [Vec3, Vec3][]) out.push(...point, ...normal);
  }
  return out;
}

function hexToRgb(hex: string): Vec3 {
  const raw = hex.replace('#', '');
  const value = Number.parseInt(raw.length === 3 ? raw.split('').map(c => c + c).join('') : raw, 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/** Small raw WebGL2 runtime. It is intentionally independent from React and the Canvas2D engines. */
export abstract class WebGLRound3D implements GameRound {
  protected readonly canvas: HTMLCanvasElement;
  protected readonly gl: WebGL2RenderingContext;
  protected readonly program: WebGLProgram;
  protected readonly config: RoundConfig;
  protected readonly inputKeys = new Set<string>();
  protected clock = 0;
  protected timeLeft: number;
  protected countdown = 3;
  protected paused = false;
  protected finished = false;
  protected readonly meshes: { cube: Mesh; sphere: Mesh; cylinder: Mesh };
  private active = false;
  private raf = 0;
  private lastFrame = 0;
  private hudDelay = 0;
  private lastCount = 4;
  private readonly uniforms: { projection: WebGLUniformLocation; view: WebGLUniformLocation; model: WebGLUniformLocation; color: WebGLUniformLocation; light: WebGLUniformLocation; fogColor: WebGLUniformLocation; fogNear: WebGLUniformLocation; fogFar: WebGLUniformLocation; emissive: WebGLUniformLocation };
  private readonly colorCache = new Map<string, Vec3>();
  private clearColor: Vec3 = [.025, .035, .04];

  constructor(canvas: HTMLCanvasElement, config: RoundConfig, duration: number) {
    this.canvas = canvas;
    this.config = config;
    this.timeLeft = duration;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('WebGL2 jest niedostępny na tym urządzeniu');
    this.gl = gl;
    this.program = createProgram(gl);
    this.uniforms = {
      projection: gl.getUniformLocation(this.program, 'uProjection')!, view: gl.getUniformLocation(this.program, 'uView')!, model: gl.getUniformLocation(this.program, 'uModel')!,
      color: gl.getUniformLocation(this.program, 'uColor')!, light: gl.getUniformLocation(this.program, 'uLightDir')!, fogColor: gl.getUniformLocation(this.program, 'uFogColor')!, fogNear: gl.getUniformLocation(this.program, 'uFogNear')!, fogFar: gl.getUniformLocation(this.program, 'uFogFar')!, emissive: gl.getUniformLocation(this.program, 'uEmissive')!,
    };
    this.meshes = { cube: this.createMesh(cubeVertices()), sphere: this.createMesh(sphereVertices()), cylinder: this.createMesh(cylinderVertices()) };
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.useProgram(this.program);
    gl.uniform3f(this.uniforms.light, -0.45, 0.85, 0.35);
    this.setAtmosphere('#11181b', 18, 46);
  }

  start() {
    if (this.active) return;
    this.active = true; this.resize();
    window.addEventListener('resize', this.resize); window.addEventListener('keydown', this.keyDown); window.addEventListener('keyup', this.keyUp); window.addEventListener('blur', this.blur); document.addEventListener('visibilitychange', this.visibilityChange);
    this.lastFrame = performance.now(); this.config.onHud(this.hud()); this.raf = requestAnimationFrame(this.frame);
  }

  destroy() {
    this.active = false; cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize); window.removeEventListener('keydown', this.keyDown); window.removeEventListener('keyup', this.keyUp); window.removeEventListener('blur', this.blur); document.removeEventListener('visibilitychange', this.visibilityChange);
    this.inputKeys.clear();
    this.gl.deleteVertexArray(this.meshes.cube.vao); this.gl.deleteVertexArray(this.meshes.sphere.vao); this.gl.deleteVertexArray(this.meshes.cylinder.vao); this.gl.deleteProgram(this.program);
  }

  togglePause() {
    if (this.finished || this.countdown > 0) return;
    this.paused = !this.paused; this.config.onHud(this.hud()); gameAudio.uiClick();
  }

  protected finish(result: RoundResult) { if (!this.finished) { this.finished = true; this.config.onFinish(result); } }
  protected abstract update(dt: number): void;
  protected abstract renderScene(viewIndex: number, aspect: number): void;
  protected abstract hud(): RoundHud;
  protected abstract timeout(): void;
  protected abstract camera(viewIndex: number): { eye: Vec3; target: Vec3 };

  protected input(slot: number): InputState {
    const codes = [
      { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', action: ['KeyQ', 'Space'] },
      { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', action: ['Enter', 'Numpad0'] },
      { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH', action: ['KeyR'] },
      { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', action: ['KeyU'] },
    ][slot];
    if (!codes) return { x: 0, y: 0, aimX: 0, aimY: 0, action: false };
    const x = Number(this.inputKeys.has(codes.right)) - Number(this.inputKeys.has(codes.left));
    const y = Number(this.inputKeys.has(codes.down)) - Number(this.inputKeys.has(codes.up));
    const pad: PadInput | undefined = this.config.padInputs[slot];
    const px = pad?.steer === 'tank' ? pad.turn : pad?.dirX ?? pad?.turn ?? 0;
    const py = pad?.steer === 'tank' ? -pad.fwd : pad?.dirY ?? -(pad?.fwd ?? 0);
    const mag = Math.max(1, Math.hypot(x, y));
    return { x: x || y ? x / mag : px, y: x || y ? y / mag : py, aimX: pad?.aimX ?? 0, aimY: pad?.aimY ?? 0, action: !!pad?.fire || codes.action.some(code => this.inputKeys.has(code)) };
  }

  protected setAtmosphere(fogColor: string, near = 18, far = 46) {
    const rgb = hexToRgb(fogColor);
    this.gl.uniform3fv(this.uniforms.fogColor, rgb); this.gl.uniform1f(this.uniforms.fogNear, near); this.gl.uniform1f(this.uniforms.fogFar, far);
  }

  protected setClearColor(color: string) { this.clearColor = hexToRgb(color); }

  protected draw(kind: keyof WebGLRound3D['meshes'], position: Vec3, size: Vec3, color: string, rotation = 0, emissive = 0) {
    const gl = this.gl, mesh = this.meshes[kind];
    const model = mat4Multiply(mat4Translate(position[0], position[1], position[2]), mat4Multiply(mat4RotateY(rotation), mat4Scale(size[0], size[1], size[2])));
    let rgb = this.colorCache.get(color);
    if (!rgb) { rgb = hexToRgb(color); this.colorCache.set(color, rgb); }
    gl.bindVertexArray(mesh.vao); gl.uniformMatrix4fv(this.uniforms.model, false, model); gl.uniform3fv(this.uniforms.color, rgb); gl.uniform1f(this.uniforms.emissive, emissive); gl.drawArrays(gl.TRIANGLES, 0, mesh.count); gl.bindVertexArray(null);
  }

  protected setView(viewIndex: number, aspect: number) {
    const camera = this.camera(viewIndex);
    this.gl.uniformMatrix4fv(this.uniforms.projection, false, mat4Perspective(Math.PI / 3.2, aspect, .1, 100));
    this.gl.uniformMatrix4fv(this.uniforms.view, false, mat4LookAt(camera.eye, camera.target, [0, 1, 0]));
  }

  private createMesh(data: number[]): Mesh {
    const gl = this.gl, vao = gl.createVertexArray(), buffer = gl.createBuffer();
    if (!vao || !buffer) throw new Error('WebGL: nie można utworzyć geometrii');
    gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buffer); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(data), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
    gl.bindVertexArray(null); gl.deleteBuffer(buffer);
    return { vao, count: data.length / 6 };
  }

  private resize = () => {
    const rect = this.canvas.getBoundingClientRect();
    const memory = Number((navigator as Navigator & { deviceMemory?: number }).deviceMemory || 8);
    const requested = this.config.quality === 'quality' ? 1.5 : this.config.quality === 'performance' ? .8 : 1.15;
    const dpr = Math.min(memory <= 4 ? 1 : requested, window.devicePixelRatio || 1);
    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr)); this.canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  };

  private frame = (now: number) => {
    if (!this.active || this.finished) return;
    const dt = Math.min(.04, Math.max(0, (now - this.lastFrame) / 1000)); this.lastFrame = now;
    if (!this.paused) {
      if (this.countdown > 0) { this.countdown = Math.max(0, this.countdown - dt); const whole = Math.ceil(this.countdown); if (whole !== this.lastCount) { this.lastCount = whole; gameAudio.countdownBeep(whole === 0); } }
      else { this.clock += dt; this.timeLeft = Math.max(0, this.timeLeft - dt); this.update(dt); if (this.timeLeft <= 0 && !this.finished) this.timeout(); }
    }
    const gl = this.gl; gl.useProgram(this.program); gl.clearColor(this.clearColor[0], this.clearColor[1], this.clearColor[2], 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    const count = this.config.displayMode === 'split' && this.config.players.length > 1 ? Math.min(4, Math.max(2, this.config.players.length)) : 1;
    const columns = count <= 2 ? count : 2, rows = Math.ceil(count / columns), panelWidth = this.canvas.width / columns, panelHeight = this.canvas.height / rows;
    for (let index = 0; index < count; index++) {
      gl.viewport((index % columns) * panelWidth, (rows - 1 - Math.floor(index / columns)) * panelHeight, panelWidth, panelHeight);
      this.setView(index, panelWidth / panelHeight); this.renderScene(index, panelWidth / panelHeight);
    }
    this.hudDelay -= dt; if (this.hudDelay <= 0 && !this.finished) { this.hudDelay = .15; this.config.onHud(this.hud()); }
    if (!this.finished) this.raf = requestAnimationFrame(this.frame);
  };

  private keyDown = (event: KeyboardEvent) => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault(); if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) this.togglePause(); this.inputKeys.add(event.code); };
  private keyUp = (event: KeyboardEvent) => { this.inputKeys.delete(event.code); };
  private blur = () => { this.inputKeys.clear(); };
  private visibilityChange = () => { if (document.hidden && !this.paused && !this.finished && this.countdown <= 0) { this.paused = true; this.config.onHud(this.hud()); } };
}
