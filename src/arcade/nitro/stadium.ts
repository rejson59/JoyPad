import * as THREE from 'three';
import {
  A, B, H, RC, RF, GOAL_W, GOAL_H, GOAL_D, STAND_OFFSET, TEAM_HEX,
} from './constants';
import { roundedOutline, makeProfile, arcPoints, buildStrip, samplePointOnStrip } from './strip';
import {
  rng, makeFloorTexture, makeNoiseTexture, makeWallTextures, makeGlassTexture, makeGridTexture, makeLedTexture,
  makeCrowdTexture, makeGlowTexture, makeBeamTexture, makeNetTexture, makeWindowsTexture,
} from './textures';

const D = STAND_OFFSET;

function roundedRectShape(a: number, b: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-a + r, -b);
  s.lineTo(a - r, -b);
  s.absarc(a - r, -b + r, r, -Math.PI / 2, 0, false);
  s.lineTo(a, b - r);
  s.absarc(a - r, b - r, r, 0, Math.PI / 2, false);
  s.lineTo(-a + r, b);
  s.absarc(-a + r, b - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(-a, -b + r);
  s.absarc(-a + r, -b + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

function scaleUV(g: THREE.BufferGeometry, ru: number, rv: number) {
  const uv = g.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * ru, uv.getY(i) * rv);
}

export interface ScreenState {
  blue: number;
  orange: number;
  time: string;
  mode: 'score' | 'goal' | 'replay' | 'menu' | 'end';
  team: number;
  label: string;
}

export class Stadium {
  group = new THREE.Group();
  crowdU = { uTime: { value: 0 }, uBounce: { value: 0.2 } };
  private flashU = { uTime: { value: 0 }, uAmount: { value: 0.3 }, uScale: { value: 800 } };
  private ledTex: THREE.CanvasTexture;
  private screenCanvas: HTMLCanvasElement;
  private screenTex: THREE.CanvasTexture;
  private screenKey = '';
  private screenTimer = 0;
  private screenState: ScreenState = { blue: 0, orange: 0, time: '5:00', mode: 'menu', team: 0, label: '' };
  private goalGlow: THREE.MeshBasicMaterial[] = [];
  private bounce = 0.2;
  private beams: THREE.Mesh[] = [];

  constructor(public quality: number) {
    const G = this.group;
    const R = rng(1234);
    const glowTex = makeGlowTexture(128);
    const beamTex = makeBeamTexture(true);

    /* ---------- murawa ---------- */
    const floorTex = makeFloorTexture();
    const noise = makeNoiseTexture(256);
    noise.repeat.set(70, 88);
    const floorGeo = new THREE.ShapeGeometry(roundedRectShape(A, B, RC), 28);
    floorGeo.rotateX(-Math.PI / 2);
    {
      const p = floorGeo.getAttribute('position') as THREE.BufferAttribute;
      const uv = floorGeo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) + A) / (2 * A), 1 - (p.getZ(i) + B) / (2 * B));
    }
    const floor = new THREE.Mesh(
      floorGeo,
      new THREE.MeshStandardMaterial({
        map: floorTex, bumpMap: noise, bumpScale: 1.6, roughness: 0.78, metalness: 0.0, envMapIntensity: 0.55,
      }),
    );
    floor.receiveShadow = true;
    G.add(floor);

    // strefa poza areną (ciemna murawa)
    const apronGeo = new THREE.ShapeGeometry(roundedRectShape(A + D + 1, B + D + 1, RC + D + 1), 24);
    apronGeo.rotateX(-Math.PI / 2);
    {
      const p = apronGeo.getAttribute('position') as THREE.BufferAttribute;
      const uv = apronGeo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 6, p.getZ(i) / 6);
    }
    const apron = new THREE.Mesh(apronGeo, new THREE.MeshStandardMaterial({ color: 0x0c1c14, bumpMap: noise, bumpScale: 0.8, roughness: 1 }));
    apron.position.y = -0.03;
    apron.receiveShadow = true;
    G.add(apron);

    /* ---------- ściany ---------- */
    const wt = makeWallTextures();
    const outline = roundedOutline(A, B, RC, { step: 2.4, arc: 22, breaks: [-GOAL_W, GOAL_W] });
    const skipGoal = (x: number, y: number, z: number) =>
      Math.abs(x) < GOAL_W - 0.001 && Math.abs(z) > B - RF - 0.3 && y < GOAL_H + 0.01;
    const teamTint = (z: number): [number, number, number] => {
      const t = z / B;
      const wb = THREE.MathUtils.smoothstep(t, 0.1, 0.85);
      const wo = THREE.MathUtils.smoothstep(-t, 0.1, 0.85);
      const wn = 1 - wb - wo;
      return [
        0.35 * wn + 0.15 * wb + 1.5 * wo,
        0.85 * wn + 0.5 * wb + 0.62 * wo,
        1.1 * wn + 1.8 * wb + 0.18 * wo,
      ];
    };
    const panelPts: [number, number][] = [
      ...arcPoints(RF, RF, RF, -Math.PI / 2, -Math.PI, 10),
      [0, 4.7],
      [0, GOAL_H],
    ];
    const panelGeo = buildStrip(outline, makeProfile(panelPts), {
      uScale: 8, vScale: 8, skip: skipGoal, color: (_x, _y, z) => teamTint(z),
    });
    const panelMat = new THREE.MeshStandardMaterial({
      map: wt.map, emissiveMap: wt.emissive, emissive: 0xffffff, emissiveIntensity: 2.1,
      metalness: 0.55, roughness: 0.42, vertexColors: true, side: THREE.DoubleSide, envMapIntensity: 1.1,
    });
    panelMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace(
        '#include <emissivemap_fragment>',
        '#include <emissivemap_fragment>\n#ifdef USE_COLOR\n totalEmissiveRadiance *= vColor.rgb;\n#endif',
      );
    };
    const panel = new THREE.Mesh(panelGeo, panelMat);
    panel.receiveShadow = true;
    G.add(panel);

    const glassPts: [number, number][] = [
      [0, GOAL_H], [0, 10], [0, 13.5], [0, H - RF],
      ...arcPoints(RF, H - RF, RF, Math.PI, Math.PI / 2, 10).slice(1),
    ];
    const glassTex = makeGlassTexture();
    const glassGeo = buildStrip(outline, makeProfile(glassPts), { uScale: 8, vScale: 6 });
    const glass = new THREE.Mesh(
      glassGeo,
      new THREE.MeshStandardMaterial({
        map: glassTex, color: 0xb8d4ff, transparent: true, opacity: 0.55, roughness: 0.04, metalness: 0.9,
        side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 1.8,
      }),
    );
    glass.renderOrder = 5;
    G.add(glass);

    // sufit – pole siłowe
    const gridTex = makeGridTexture();
    const ceilGeo = new THREE.ShapeGeometry(roundedRectShape(A - RF, B - RF, RC - RF), 24);
    ceilGeo.rotateX(Math.PI / 2);
    {
      const p = ceilGeo.getAttribute('position') as THREE.BufferAttribute;
      const uv = ceilGeo.getAttribute('uv') as THREE.BufferAttribute;
      for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 8, p.getZ(i) / 8);
    }
    const ceil = new THREE.Mesh(
      ceilGeo,
      new THREE.MeshBasicMaterial({
        map: gridTex, color: new THREE.Color(0.35, 0.8, 1.2), transparent: true, opacity: 0.28,
        blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
      }),
    );
    ceil.position.y = H;
    ceil.renderOrder = 4;
    G.add(ceil);

    /* ---------- bramki ---------- */
    const netTex = makeNetTexture();
    for (const sign of [1, -1]) {
      const team = sign > 0 ? 0 : 1;
      const col = new THREE.Color(TEAM_HEX[team]);
      const frameMat = new THREE.MeshStandardMaterial({
        color: 0xdfe6f5, metalness: 0.85, roughness: 0.22, emissive: col, emissiveIntensity: 1.6,
      });
      const post = new THREE.CylinderGeometry(0.22, 0.22, GOAL_H, 16);
      for (const sx of [-1, 1]) {
        const m = new THREE.Mesh(post, frameMat);
        m.position.set(sx * GOAL_W, GOAL_H / 2, sign * B);
        m.castShadow = true;
        G.add(m);
        const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, GOAL_D, 10), frameMat);
        rail.rotation.x = Math.PI / 2;
        rail.position.set(sx * GOAL_W, GOAL_H, sign * (B + GOAL_D / 2));
        G.add(rail);
        const bp = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, GOAL_H, 10), frameMat);
        bp.position.set(sx * GOAL_W, GOAL_H / 2, sign * (B + GOAL_D));
        G.add(bp);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, GOAL_W * 2, 16), frameMat);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, GOAL_H, sign * B);
      bar.castShadow = true;
      G.add(bar);
      const bar2 = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, GOAL_W * 2, 10), frameMat);
      bar2.rotation.z = Math.PI / 2;
      bar2.position.set(0, GOAL_H, sign * (B + GOAL_D));
      G.add(bar2);

      // siatka i ściany wnęki
      const netMat = new THREE.MeshBasicMaterial({
        map: netTex, color: new THREE.Color(0.75, 0.85, 1.0), transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
      });
      const shellMat = new THREE.MeshStandardMaterial({
        color: 0x0a101c, roughness: 0.55, metalness: 0.6, side: THREE.DoubleSide, emissive: col, emissiveIntensity: 0.12,
      });
      const mkPlane = (w: number, h: number, x: number, y: number, z: number, rx: number, ry: number) => {
        const g1 = new THREE.PlaneGeometry(w, h);
        const g2 = g1.clone();
        scaleUV(g1, w / 0.7, h / 0.7);
        const n = new THREE.Mesh(g1, netMat);
        const s = new THREE.Mesh(g2, shellMat);
        for (const m of [n, s]) {
          m.position.set(x, y, z);
          m.rotation.set(rx, ry, 0);
          G.add(m);
        }
        s.position.add(new THREE.Vector3(Math.abs(ry) > 0 ? Math.sign(x) * 0.06 : 0, rx !== 0 ? 0.06 : 0, Math.abs(ry) > 0 || rx !== 0 ? 0 : sign * 0.06));
      };
      mkPlane(GOAL_W * 2, GOAL_H, 0, GOAL_H / 2, sign * (B + GOAL_D), 0, 0);
      for (const sx of [-1, 1]) mkPlane(GOAL_D, GOAL_H, sx * GOAL_W, GOAL_H / 2, sign * (B + GOAL_D / 2), 0, Math.PI / 2);
      mkPlane(GOAL_W * 2, GOAL_D, 0, GOAL_H, sign * (B + GOAL_D / 2), Math.PI / 2, 0);

      // podłoga bramki
      const gf = new THREE.Mesh(
        new THREE.PlaneGeometry(GOAL_W * 2, GOAL_D),
        new THREE.MeshStandardMaterial({ color: 0x0d1626, roughness: 0.35, metalness: 0.6, emissive: col, emissiveIntensity: 0.18 }),
      );
      gf.rotation.x = -Math.PI / 2;
      gf.position.set(0, 0.01, sign * (B + GOAL_D / 2));
      gf.receiveShadow = true;
      G.add(gf);

      // poświata wnętrza
      const gm = new THREE.MeshBasicMaterial({
        map: glowTex, color: new THREE.Color(col.r * 2.4, col.g * 2.4, col.b * 2.4), transparent: true, opacity: 0.85,
        blending: THREE.AdditiveBlending, depthWrite: false,
      });
      this.goalGlow.push(gm);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W * 2.6, GOAL_H * 1.7), gm);
      back.position.set(0, GOAL_H / 2, sign * (B + GOAL_D - 0.2));
      if (sign < 0) back.rotation.y = Math.PI;
      G.add(back);
      const floorGlow = new THREE.Mesh(new THREE.PlaneGeometry(GOAL_W * 2.4, GOAL_D * 1.2), gm);
      floorGlow.rotation.x = -Math.PI / 2;
      floorGlow.position.set(0, 0.03, sign * (B + GOAL_D / 2));
      G.add(floorGlow);
    }

    /* ---------- bandy LED ---------- */
    this.ledTex = makeLedTexture();
    const standOutline = roundedOutline(A + D, B + D, RC + D, { step: 2.6, arc: 26 });
    const ledGeo = buildStrip(standOutline, makeProfile([[0, 0], [0, 1.7]]), { uScale: 27.2, vScale: 1.7 });
    const led = new THREE.Mesh(
      ledGeo,
      new THREE.MeshStandardMaterial({
        map: this.ledTex, emissiveMap: this.ledTex, emissive: 0xffffff, emissiveIntensity: 1.7,
        roughness: 0.5, metalness: 0.2, side: THREE.DoubleSide,
      }),
    );
    G.add(led);

    /* ---------- trybuny ---------- */
    const crowdTex = makeCrowdTexture();
    const crowdMat = new THREE.MeshBasicMaterial({ map: crowdTex, vertexColors: true, side: THREE.DoubleSide });
    crowdMat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.crowdU.uTime;
      sh.uniforms.uBounce = this.crowdU.uBounce;
      sh.fragmentShader =
        'uniform float uTime; uniform float uBounce;\n' +
        sh.fragmentShader.replace(
          '#include <map_fragment>',
          `#ifdef USE_MAP
            vec2 cuv = vMapUv;
            float col = floor(cuv.x * 16.0);
            float ph = fract(sin(col * 12.9898) * 43758.5453) * 6.2831;
            float jmp = max(0.0, sin(uTime * (5.0 + uBounce * 4.0) + ph));
            cuv.y += jmp * jmp * (0.010 + 0.05 * uBounce);
            vec4 sampledDiffuseColor = texture2D(map, cuv);
            diffuseColor *= sampledDiffuseColor;
          #endif`,
        );
    };
    const crowdColor = (x: number, y: number, z: number): [number, number, number] => {
      const t = z / (B + D + 45);
      const wb = THREE.MathUtils.smoothstep(t, 0.15, 0.6);
      const wo = THREE.MathUtils.smoothstep(-t, 0.15, 0.6);
      const wn = 1 - wb - wo;
      const br = (1.05 - 0.5 * Math.min(1, y / 34)) * 0.85 * (0.9 + 0.1 * Math.sin(x * 0.7 + z * 0.3));
      return [(1.0 * wn + 0.62 * wb + 1.7 * wo) * br, (1.0 * wn + 0.85 * wb + 0.95 * wo) * br, (1.0 * wn + 1.7 * wb + 0.55 * wo) * br];
    };
    const lowerGeo = buildStrip(standOutline, makeProfile([[-0.3, 1.7], [-17, 12]]), { uScale: 14.4, vScale: 10.4, color: crowdColor });
    const upperGeo = buildStrip(standOutline, makeProfile([[-20.7, 14.2], [-45, 34]]), { uScale: 14.4, vScale: 10.4, color: crowdColor });
    G.add(new THREE.Mesh(lowerGeo, crowdMat), new THREE.Mesh(upperGeo, crowdMat));

    const concMat = new THREE.MeshStandardMaterial({ color: 0x141a26, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide });
    G.add(
      new THREE.Mesh(
        buildStrip(standOutline, makeProfile([[-17, 12], [-20.7, 12.6], [-20.7, 14.2]]), { uScale: 8, vScale: 8 }),
        concMat,
      ),
    );
    // ściana zewnętrzna i obwódka
    const backMat = new THREE.MeshStandardMaterial({
      map: wt.map, emissiveMap: wt.emissive, emissive: new THREE.Color(0.1, 0.35, 0.7), emissiveIntensity: 0.9,
      color: 0x556070, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide,
    });
    G.add(new THREE.Mesh(buildStrip(standOutline, makeProfile([[-45, 34], [-45, 47]]), { uScale: 16, vScale: 16 }), backMat));
    G.add(
      new THREE.Mesh(
        buildStrip(standOutline, makeProfile([[-45, 47], [-45, 48.4]]), { uScale: 8, vScale: 8 }),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.1, 2.4), side: THREE.DoubleSide }),
      ),
    );
    // pas świetlny nad trybuną
    G.add(
      new THREE.Mesh(
        buildStrip(standOutline, makeProfile([[-20.7, 14.2], [-20.7, 14.5]]), { uScale: 8, vScale: 8 }),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 0.5, 2.2), side: THREE.DoubleSide }),
      ),
    );

    /* ---------- flesze aparatów ---------- */
    const nFlash = quality >= 2 ? 700 : quality >= 1 ? 380 : 120;
    const fp = new Float32Array(nFlash * 3);
    const fph = new Float32Array(nFlash);
    const frt = new Float32Array(nFlash);
    const tmp = new THREE.Vector3();
    for (let i = 0; i < nFlash; i++) {
      samplePointOnStrip(R() < 0.45 ? lowerGeo : upperGeo, R, tmp, 0.9);
      fp[i * 3] = tmp.x;
      fp[i * 3 + 1] = tmp.y;
      fp[i * 3 + 2] = tmp.z;
      fph[i] = R() * 10;
      frt[i] = 0.25 + R() * 0.9;
    }
    const fg = new THREE.BufferGeometry();
    fg.setAttribute('position', new THREE.BufferAttribute(fp, 3));
    fg.setAttribute('aPhase', new THREE.BufferAttribute(fph, 1));
    fg.setAttribute('aRate', new THREE.BufferAttribute(frt, 1));
    const flashMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, uniforms: this.flashU,
      vertexShader: `attribute float aPhase; attribute float aRate; uniform float uTime; uniform float uAmount; uniform float uScale;
        varying float vI;
        float hash(float n){ return fract(sin(n*91.3458)*47453.5453); }
        void main(){
          float ph = uTime * aRate + aPhase;
          float cyc = floor(ph); float t = fract(ph);
          float on = step(hash(cyc + aPhase * 7.0), uAmount);
          float f = smoothstep(0.0, 0.03, t) * (1.0 - smoothstep(0.03, 0.16, t)) * on;
          vI = f;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = min(f * 1.9 * uScale / max(0.1, -mv.z), 120.0);
        }`,
      fragmentShader: `varying float vI;
        void main(){
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          float a = pow(max(1.0 - d, 0.0), 2.0);
          float crs = max(0.0, 1.0 - abs(p.x) * 14.0) * max(0.0, 1.0 - abs(p.y) * 2.4) + max(0.0, 1.0 - abs(p.y) * 14.0) * max(0.0, 1.0 - abs(p.x) * 2.4);
          float v = (a + crs * 0.8) * vI;
          if (v < 0.01) discard;
          gl_FragColor = vec4(vec3(5.0, 5.0, 5.4) * v, v);
        }`,
    });
    const flashes = new THREE.Points(fg, flashMat);
    flashes.frustumCulled = false;
    flashes.renderOrder = 11;
    G.add(flashes);

    /* ---------- reflektory ---------- */
    const banks: THREE.Vector3[] = [];
    const cx = A - RC + (RC + D + 45) * 0.72;
    const cz = B - RC + (RC + D + 45) * 0.72;
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) banks.push(new THREE.Vector3(sx * cx, 49, sz * cz));
    for (const sx of [-1, 1]) for (const z of [-32, 0, 32]) banks.push(new THREE.Vector3(sx * (A + D + 43), 48, z));
    for (const sz of [-1, 1]) for (const x of [-24, 0, 24]) banks.push(new THREE.Vector3(x, 48, sz * (B + D + 43)));
    const lampGeo = new THREE.BoxGeometry(1.8, 1.8, 0.5);
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.4, 7.4) });
    const lamps = new THREE.InstancedMesh(lampGeo, lampMat, banks.length * 12);
    const frames = new THREE.InstancedMesh(new THREE.BoxGeometry(9, 7, 0.7), new THREE.MeshStandardMaterial({ color: 0x0c0f16, roughness: 0.6, metalness: 0.7 }), banks.length);
    const dummy = new THREE.Object3D();
    const local = new THREE.Matrix4();
    let li = 0;
    banks.forEach((p, bi) => {
      dummy.position.copy(p);
      dummy.lookAt(0, 0, 0);
      dummy.updateMatrix();
      frames.setMatrixAt(bi, dummy.matrix);
      for (let i = 0; i < 4; i++)
        for (let j = 0; j < 3; j++) {
          local.makeTranslation((i - 1.5) * 2.1, (j - 1) * 2.1, 0.5);
          lamps.setMatrixAt(li++, dummy.matrix.clone().multiply(local));
        }
      const sp = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTex, color: new THREE.Color(2.4, 2.2, 1.9), transparent: true, opacity: 0.9,
          blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
        }),
      );
      sp.scale.setScalar(30);
      sp.position.copy(p).lerp(new THREE.Vector3(0, 0, 0), 0.02);
      G.add(sp);
      if (quality >= 1) {
        const bg = new THREE.ConeGeometry(15, 100, 24, 1, true);
        bg.translate(0, -50, 0);
        bg.rotateX(-Math.PI / 2);
        const bm = new THREE.Mesh(
          bg,
          new THREE.MeshBasicMaterial({
            map: beamTex, color: new THREE.Color(0.55, 0.62, 0.8), transparent: true, opacity: 0.075,
            blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false,
          }),
        );
        bm.position.copy(p);
        bm.lookAt(0, 0, 0);
        G.add(bm);
        this.beams.push(bm);
      }
    });
    lamps.instanceMatrix.needsUpdate = true;
    frames.instanceMatrix.needsUpdate = true;
    G.add(lamps, frames);

    /* ---------- ekrany ---------- */
    this.screenCanvas = document.createElement('canvas');
    this.screenCanvas.width = 1024;
    this.screenCanvas.height = 384;
    this.screenTex = new THREE.CanvasTexture(this.screenCanvas);
    this.screenTex.colorSpace = THREE.SRGBColorSpace;
    this.screenTex.anisotropy = 8;
    const scrMat = new THREE.MeshBasicMaterial({ map: this.screenTex, color: new THREE.Color(1.5, 1.5, 1.5) });
    const frameM = new THREE.MeshStandardMaterial({ color: 0x0b0e15, roughness: 0.5, metalness: 0.8 });
    const placeScreen = (x: number, z: number, ry: number) => {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(28, 10.5), scrMat);
      const f = new THREE.Mesh(new THREE.BoxGeometry(29.4, 11.8, 0.9), frameM);
      const grp = new THREE.Group();
      s.position.z = 0.5;
      grp.add(f, s);
      grp.position.set(x, 23, z);
      grp.rotation.y = ry;
      G.add(grp);
      for (const dx of [-11, 11]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.7, 12, 0.7), frameM);
        leg.position.set(dx, -8.5, 0);
        grp.add(leg);
      }
    };
    placeScreen(0, B + D + 24, Math.PI);
    placeScreen(0, -(B + D + 24), 0);
    placeScreen(A + D + 24, 0, -Math.PI / 2);
    placeScreen(-(A + D + 24), 0, Math.PI / 2);
    this.drawScreen();

    /* ---------- niebo ---------- */
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1000, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
        fragmentShader: `varying vec3 vP; void main(){
          float h = clamp(vP.y, 0.0, 1.0);
          vec3 top = vec3(0.004, 0.010, 0.038);
          vec3 hor = vec3(0.045, 0.10, 0.19);
          vec3 col = mix(hor, top, pow(h, 0.45));
          col += vec3(0.22, 0.10, 0.30) * exp(-abs(vP.y) * 5.0) * 0.22;
          gl_FragColor = vec4(col, 1.0); }`,
      }),
    );
    sky.renderOrder = -10;
    sky.frustumCulled = false;
    G.add(sky);
    const nStars = 1600;
    const sp2 = new Float32Array(nStars * 3);
    for (let i = 0; i < nStars; i++) {
      const th = R() * Math.PI * 2;
      const ph = Math.acos(0.05 + R() * 0.95);
      sp2[i * 3] = 900 * Math.sin(ph) * Math.cos(th);
      sp2[i * 3 + 1] = 900 * Math.cos(ph);
      sp2[i * 3 + 2] = 900 * Math.sin(ph) * Math.sin(th);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(sp2, 3));
    G.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.8, sizeAttenuation: false, color: 0xcfe0ff, transparent: true, opacity: 0.85, fog: false, depthWrite: false })));

    /* ---------- panorama miasta ---------- */
    const winTex = makeWindowsTexture();
    winTex.repeat.set(2, 5);
    const nB = 170;
    const bld = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
      new THREE.MeshStandardMaterial({ color: 0x060a14, emissive: 0xffffff, emissiveMap: winTex, emissiveIntensity: 1.5, roughness: 0.8, metalness: 0.4 }),
      nB,
    );
    for (let i = 0; i < nB; i++) {
      const a = (i / nB) * Math.PI * 2 + R() * 0.03;
      const r = 250 + R() * 150;
      dummy.position.set(Math.cos(a) * r, -2, Math.sin(a) * r);
      dummy.rotation.set(0, R() * 3, 0);
      dummy.scale.set(14 + R() * 24, 30 + R() * R() * 170, 14 + R() * 24);
      dummy.updateMatrix();
      bld.setMatrixAt(i, dummy.matrix);
    }
    bld.instanceMatrix.needsUpdate = true;
    G.add(bld);
  }

  setScreen(s: Partial<ScreenState>) {
    Object.assign(this.screenState, s);
    const key = JSON.stringify(this.screenState);
    if (key !== this.screenKey) {
      this.screenKey = key;
      this.drawScreen();
    }
  }

  private drawScreen() {
    const c = this.screenCanvas;
    const g = c.getContext('2d')!;
    const s = this.screenState;
    const W = c.width;
    const Hh = c.height;
    const bg = g.createLinearGradient(0, 0, 0, Hh);
    bg.addColorStop(0, '#0a1020');
    bg.addColorStop(1, '#03050b');
    g.fillStyle = bg;
    g.fillRect(0, 0, W, Hh);
    // panele drużyn
    const bl = g.createLinearGradient(0, 0, 430, 0);
    bl.addColorStop(0, '#0a3fbf');
    bl.addColorStop(1, '#0b1a4a');
    g.fillStyle = bl;
    g.fillRect(20, 90, 400, 270);
    const or = g.createLinearGradient(W, 0, W - 430, 0);
    or.addColorStop(0, '#d65a00');
    or.addColorStop(1, '#4a1d05');
    g.fillStyle = or;
    g.fillRect(W - 420, 90, 400, 270);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = '#9ec0ff';
    g.font = '900 34px Arial Black, Impact, sans-serif';
    g.fillText('NIEBIESCY', 220, 125);
    g.fillStyle = '#ffc99a';
    g.fillText('POMARAŃCZOWI', W - 220, 125);
    g.fillStyle = '#fff';
    g.font = 'italic 900 190px Arial Black, Impact, sans-serif';
    g.shadowColor = '#6fa0ff';
    g.shadowBlur = 30;
    g.fillText(String(s.blue), 220, 250);
    g.shadowColor = '#ffa050';
    g.fillText(String(s.orange), W - 220, 250);
    g.shadowBlur = 0;
    // środek
    g.fillStyle = '#e6f3ff';
    g.font = 'italic 900 40px Arial Black, Impact, sans-serif';
    g.fillText('NITRO LEAGUE', W / 2, 42);
    g.fillStyle = '#0a0f1e';
    g.fillRect(W / 2 - 150, 120, 300, 130);
    g.strokeStyle = '#4fd2ff';
    g.lineWidth = 3;
    g.strokeRect(W / 2 - 150, 120, 300, 130);
    g.fillStyle = '#ffffff';
    g.font = '900 96px Arial Black, Impact, sans-serif';
    g.shadowColor = '#4fd2ff';
    g.shadowBlur = 18;
    g.fillText(s.time, W / 2, 186);
    g.shadowBlur = 0;
    if (s.label) {
      g.fillStyle = '#ffd400';
      g.font = '900 34px Arial Black, Impact, sans-serif';
      g.fillText(s.label, W / 2, 300);
    }
    if (s.mode === 'goal') {
      const col = s.team === 0 ? '#3d86ff' : '#ff8a2a';
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(0, 0, W, Hh);
      g.fillStyle = col;
      g.shadowColor = col;
      g.shadowBlur = 50;
      g.font = 'italic 900 230px Arial Black, Impact, sans-serif';
      g.fillText('GOL!', W / 2, Hh / 2);
      g.shadowBlur = 0;
    } else if (s.mode === 'replay') {
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(0, 0, W, Hh);
      g.fillStyle = '#ff3b3b';
      g.font = 'italic 900 120px Arial Black, Impact, sans-serif';
      g.fillText('POWTÓRKA', W / 2, Hh / 2);
    } else if (s.mode === 'end') {
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(0, 0, W, Hh);
      g.fillStyle = '#ffd400';
      g.font = 'italic 900 120px Arial Black, Impact, sans-serif';
      g.fillText('KONIEC MECZU', W / 2, Hh / 2);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 0; y < Hh; y += 4) g.fillRect(0, y, W, 1.5);
    this.screenTex.needsUpdate = true;
  }

  update(dt: number, time: number, excitement: number, scale: number) {
    this.bounce += (excitement - this.bounce) * Math.min(1, dt * 1.5);
    this.crowdU.uTime.value = time;
    this.crowdU.uBounce.value = this.bounce;
    this.flashU.uTime.value = time;
    this.flashU.uAmount.value = 0.22 + this.bounce * 0.6;
    this.flashU.uScale.value = scale;
    this.ledTex.offset.x = (time * 0.018) % 1;
    const p = 0.85 + 0.15 * Math.sin(time * 2.2);
    for (const m of this.goalGlow) m.opacity = (0.55 + this.bounce * 0.4) * p;
    this.screenTimer -= dt;
  }

  dispose() {
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
  }
}

// mapa środowiska do odbić (PBR)
export function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const pm = new THREE.PMREMGenerator(renderer);
  const sc = new THREE.Scene();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(80, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec3 vP; void main(){
        float h = vP.y * 0.5 + 0.5;
        vec3 col = mix(vec3(0.012,0.02,0.04), vec3(0.06,0.10,0.18), pow(h, 1.4));
        gl_FragColor = vec4(col, 1.0); }`,
    }),
  );
  sc.add(dome);
  const box = (w: number, h: number, x: number, y: number, z: number, c: THREE.Color) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: c, side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 0, 0);
    sc.add(m);
  };
  const white = new THREE.Color(14, 13, 12);
  box(40, 40, 0, 60, 0, new THREE.Color(5, 5.2, 6));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(16, 12, sx * 45, 34, sz * 45, white);
  box(90, 8, 0, 10, 70, new THREE.Color(0.7, 1.8, 7));
  box(90, 8, 0, 10, -70, new THREE.Color(7, 2.6, 0.5));
  box(60, 6, 70, 6, 0, new THREE.Color(1, 5, 6));
  box(60, 6, -70, 6, 0, new THREE.Color(1, 5, 6));
  const tex = pm.fromScene(sc, 0.02).texture;
  pm.dispose();
  return tex;
}
