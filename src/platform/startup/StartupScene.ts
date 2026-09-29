import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * JOYPAD STARTUP — animacja powitalna w stylu klasy premium (v1.8).
 *
 * CAŁY SCENARIUSZ JEST DANYMI: `STARTUP_STEPS` poniżej. Nowa aktualizacja może
 * dopisać krok (tytuł, opis PL/EN, czas, ujęcie kamery, poświata) bez ruszania
 * silnika animacji. `STARTUP_VERSION` podbijaj, gdy zmienisz scenariusz — wtedy
 * poradnik pokaże się jeszcze raz ludziom, którzy już go widzieli.
 *
 * Zasady: brak zewnętrznych assetów (wszystko z prymitywów i tekstur canvas),
 * szacunek dla ograniczonego ruchu (statyczny kadr + napisy), DPR <= 1.5,
 * render zatrzymuje się po ukryciu karty i przy dispose.
 */

export const STARTUP_VERSION = 1;

export interface StartupStep {
  id: string;
  title: { pl: string; en: string };
  text: { pl: string; en: string };
  /** Czas trwania kroku w sekundach. */
  duration: number;
  /** Ujęcie: start i koniec drogi kamery (pozycja) + punkt patrzenia. */
  camera: { from: [number, number, number]; to: [number, number, number]; look: [number, number, number] };
  /** Kolor poświaty kroku (hex) — atmosfera akapitu scenariusza. */
  glow: string;
  /** Opcjonalna rekwizyta sceny. */
  prop?: 'qr' | 'games' | 'moments';
}

export const STARTUP_STEPS: StartupStep[] = [
  {
    id: 'welcome',
    title: { pl: 'Witaj w JoyPad', en: 'Welcome to JoyPad' },
    text: { pl: 'Jeden ekran staje się konsolą. Telefony — bezprzewodowymi padami.', en: 'One screen becomes a console. Phones become wireless controllers.' },
    duration: 6.5,
    camera: { from: [0, 1.4, 7.2], to: [1.6, 0.9, 4.6], look: [0, 0.1, 0] },
    glow: '#ff9a52',
    prop: undefined,
  },
  {
    id: 'qr',
    title: { pl: 'Zeskanuj i graj', en: 'Scan and play' },
    text: { pl: 'Każdy gracz skanuje kod aparatem. Bez kont, bez instalacji.', en: 'Everyone scans the code with a camera. No accounts, no installs.' },
    duration: 6.5,
    camera: { from: [2.6, 0.6, 5.4], to: [0.4, 0.8, 4.2], look: [0, 0.2, 0] },
    glow: '#8dcff3',
    prop: 'qr',
  },
  {
    id: 'games',
    title: { pl: 'Wybierzcie grę', en: 'Pick your game' },
    text: { pl: 'Czołgi, wyścigi 3D, kosmos i arena węży — do czterech graczy.', en: 'Tanks, 3D racing, space and the snake arena — up to four players.' },
    duration: 6.5,
    camera: { from: [-2.8, 0.4, 5.2], to: [-0.6, 0.9, 4.0], look: [0, 0.1, 0] },
    glow: '#baa6fa',
    prop: 'games',
  },
  {
    id: 'moments',
    title: { pl: 'Momenty zostają', en: 'Moments stay' },
    text: { pl: 'Najlepsze akcje rundy wracają jako powtórki. Do zobaczenia przy kanapie!', en: 'The best plays come back as replays. See you on the couch!' },
    duration: 7,
    camera: { from: [0, 0.6, 4.4], to: [0, 1.6, 6.8], look: [0, 0, 0] },
    glow: '#edbd78',
    prop: 'moments',
  },
];

const WARM = 0xff9a52;
const _v = new THREE.Vector3();

function dotTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,.6)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Dekoracyjna plansza „QR" — świadomie nieskanowalny wzór (to animacja, nie pokój). */
function qrPropTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#f4f0e6';
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#101319';
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let y = 0; y < 21; y++)
    for (let x = 0; x < 21; x++) {
      const corner = (x < 6 && y < 6) || (x > 14 && y < 6) || (x < 6 && y > 14);
      if (corner ? (x % 5 === 0 || y % 5 === 0 || (x > 1 && x < 4 && y > 1 && y < 4)) : rnd() > 0.52)
        g.fillRect(8 + x * 11.4, 8 + y * 11.4, 9, 9);
    }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function cardTexture(title: string, color: string): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 144;
  const g = c.getContext('2d')!;
  g.fillStyle = '#14161c';
  g.fillRect(0, 0, 256, 144);
  g.fillStyle = color;
  g.globalAlpha = 0.85;
  g.fillRect(0, 0, 256, 6);
  g.globalAlpha = 1;
  g.fillStyle = '#f5efe4';
  g.font = '700 22px "Chakra Petch", monospace';
  g.textAlign = 'center';
  g.fillText(title.toUpperCase().slice(0, 14), 128, 84);
  g.fillStyle = '#8b8b98';
  g.font = '500 13px "Chakra Petch", monospace';
  g.fillText('JOYPAD', 128, 116);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Emblem kontrolera: matowe korpusy + pomarańczowe akcenty, lekko unoszący się. */
function buildEmblem(): THREE.Group {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1b1d24, metalness: 0.55, roughness: 0.42 });
  const warmMat = new THREE.MeshStandardMaterial({ color: WARM, metalness: 0.3, roughness: 0.35, emissive: 0x2a1204, emissiveIntensity: 0.6 });
  const body = new THREE.Mesh(new RoundedBoxGeometry(2.6, 1.15, 0.5, 5, 0.34), bodyMat);
  group.add(body);
  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 8, 18), bodyMat);
    grip.position.set(side * 1.32, -0.42, 0);
    grip.rotation.z = side * -0.52;
    group.add(grip);
  }
  const stickBase = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.1, 24), bodyMat);
  stickBase.position.set(-0.62, 0.6, 0.05);
  const stick = new THREE.Mesh(new THREE.SphereGeometry(0.2, 24, 18), warmMat);
  stick.position.set(-0.62, 0.78, 0.05);
  group.add(stickBase, stick);
  for (let i = 0; i < 4; i++) {
    const angle = (i / 4) * Math.PI * 2;
    const dot = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.07, 18), i === 0 ? warmMat : bodyMat);
    dot.position.set(0.78 + Math.cos(angle) * 0.26, 0.6 + Math.sin(angle) * 0.26, 0.05);
    dot.rotation.x = Math.PI / 2;
    group.add(dot);
  }
  const dpad = new THREE.Mesh(new RoundedBoxGeometry(0.52, 0.15, 0.08, 2, 0.05), bodyMat);
  dpad.position.set(0.55, 0.62, 0.08);
  const dpadV = dpad.clone();
  dpadV.rotation.z = Math.PI / 2;
  group.add(dpad, dpadV);
  const glowRing = new THREE.Mesh(
    new THREE.TorusGeometry(1.9, 0.015, 12, 90),
    new THREE.MeshBasicMaterial({ color: WARM, transparent: true, opacity: 0.5 }),
  );
  glowRing.rotation.x = Math.PI / 2;
  glowRing.position.y = -0.8;
  group.add(glowRing);
  group.position.y = 0.15;
  return group;
}

export interface StartupSceneCallbacks {
  onStep?: (index: number) => void;
  onDone?: () => void;
}

export class StartupScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private emblem: THREE.Group;
  private props: Record<string, THREE.Group> = {};
  private stars: THREE.Points;
  private glowLight: THREE.PointLight;
  private raf = 0;
  private last = 0;
  private time = 0;
  private stepIndex = 0;
  private stepTime = 0;
  private doneFlag = false;
  private hidden = false;
  readonly ambient: boolean;
  /** Język sceny (dla przyszłych napisów 3D). */
  readonly language: 'pl' | 'en';

  constructor(
    private container: HTMLElement,
    opts: { ambient?: boolean; language?: 'pl' | 'en' } = {},
    private cb: StartupSceneCallbacks = {},
  ) {
    this.ambient = !!opts.ambient;
    this.language = opts.language ?? 'pl';
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    container.appendChild(this.renderer.domElement);
    this.camera = new THREE.PerspectiveCamera(46, 16 / 9, 0.1, 120);
    this.scene.fog = new THREE.FogExp2(0x07080c, 0.055);
    this.scene.environment = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.5;
    this.scene.add(new THREE.AmbientLight(0x2a2c38, 1.4));
    const key = new THREE.DirectionalLight(0xfff1de, 2.2);
    key.position.set(3, 5, 4);
    this.scene.add(key);
    this.glowLight = new THREE.PointLight(new THREE.Color(STARTUP_STEPS[0].glow), 14, 18, 1.8);
    this.glowLight.position.set(0, 1.6, 2.4);
    this.scene.add(this.glowLight);

    this.emblem = buildEmblem();
    this.scene.add(this.emblem);
    this.buildProps();

    const starGeo = new THREE.BufferGeometry();
    const count = 420;
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 26;
      positions[i * 3 + 1] = (Math.random() - 0.5) * 14;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 18 - 4;
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ size: 0.055, map: dotTexture(), transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xcfd6e4 }));
    this.scene.add(this.stars);

    window.addEventListener('resize', this.resize);
    document.addEventListener('visibilitychange', this.visibility);
    this.resize();
    this.last = performance.now();
    if (!this.ambient) {
      this.cb.onStep?.(0);
      this.applyStep(0, true);
    } else {
      this.camera.position.set(0, 1.2, 5.6);
      this.camera.lookAt(0, 0.1, 0);
    }
    this.raf = requestAnimationFrame(this.loop);
  }

  private buildProps() {
    // QR — szklana plansza z narożnikami skanera.
    const qr = new THREE.Group();
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshStandardMaterial({ map: qrPropTexture(), metalness: 0.1, roughness: 0.5, transparent: true, opacity: 0.94 }),
    );
    qr.add(plane);
    const frameMat = new THREE.MeshBasicMaterial({ color: 0x8dcff3, transparent: true, opacity: 0.9 });
    for (const [sx, sy] of [[-1, 1], [1, 1], [-1, -1], [1, -1]] as const) {
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.02), frameMat);
      a.position.set(sx * 0.82, sy * 0.82 - sy * 0.09, 0.02);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.02), frameMat);
      b.position.set(sx * 0.82 - sx * 0.09, sy * 0.82, 0.02);
      qr.add(a, b);
    }
    qr.position.set(2.5, 0.9, -1.4);
    qr.rotation.y = -0.5;
    qr.visible = false;
    this.scene.add(qr);
    this.props.qr = qr;

    // Gry — cztery karty wokół emblematu.
    const games = new THREE.Group();
    const cards = [
      { t: 'Stalowy Front', c: '#ff9a52' },
      { t: 'Neonowy Pęd', c: '#5eead4' },
      { t: 'Orbitalna Fala', c: '#8dcff3' },
      { t: 'Nitro League', c: '#edbd78' },
    ];
    cards.forEach((card, i) => {
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(1.35, 0.76),
        new THREE.MeshStandardMaterial({ map: cardTexture(card.t, card.c), metalness: 0.2, roughness: 0.55, transparent: true, opacity: 0.96 }),
      );
      const angle = (i / cards.length) * Math.PI * 2 + 0.6;
      mesh.position.set(Math.cos(angle) * 3.1, 0.15 + Math.sin(i * 2.1) * 0.25, Math.sin(angle) * 3.1 - 0.4);
      mesh.lookAt(0, 0.2, 0);
      games.add(mesh);
    });
    games.visible = false;
    this.scene.add(games);
    this.props.games = games;

    // Moments — trzy świecące ramki-pigułki.
    const moments = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const frame = new THREE.Mesh(
        new RoundedBoxGeometry(1.5, 0.86, 0.06, 3, 0.1),
        new THREE.MeshStandardMaterial({ color: 0x191b22, metalness: 0.4, roughness: 0.4, emissive: 0x241505, emissiveIntensity: 0.7 }),
      );
      frame.position.set(-2.9 + i * 0.55, 1.15 - i * 0.42, -1.2 - i * 0.3);
      frame.rotation.y = 0.45 - i * 0.12;
      moments.add(frame);
    }
    moments.visible = false;
    this.scene.add(moments);
    this.props.moments = moments;
  }

  private applyStep(index: number, snap = false) {
    const step = STARTUP_STEPS[Math.min(index, STARTUP_STEPS.length - 1)];
    for (const [key, prop] of Object.entries(this.props)) prop.visible = step.prop === key;
    this.glowLight.color.set(step.glow);
    if (snap) {
      this.camera.position.set(...step.camera.from);
      _v.set(...step.camera.look);
      this.camera.lookAt(_v);
    }
  }

  private visibility = () => {
    this.hidden = document.hidden;
    if (!this.hidden) this.last = performance.now();
  };

  resize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  };

  skip() {
    if (this.ambient) return;
    if (!this.doneFlag) {
      this.doneFlag = true;
      this.cb.onDone?.();
    }
  }

  private loop = (now: number) => {
    if (this.hidden) {
      this.raf = requestAnimationFrame(this.loop);
      return;
    }
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;

    // emblem unosi się i lekko obraca — żywe tło także w trybie ambient
    this.emblem.position.y = 0.15 + Math.sin(this.time * 0.9) * 0.07;
    this.emblem.rotation.y = Math.sin(this.time * 0.35) * 0.22;
    this.emblem.rotation.z = Math.sin(this.time * 0.27) * 0.045;
    this.stars.rotation.y += dt * 0.012;
    for (const prop of Object.values(this.props)) {
      if (prop.visible) {
        prop.position.y += Math.sin(this.time * 1.1) * 0.0012;
        prop.rotation.z = Math.sin(this.time * 0.6) * 0.02;
      }
    }

    if (this.ambient) {
      const a = this.time * 0.14;
      this.camera.position.set(Math.sin(a) * 1.1, 1.15 + Math.sin(a * 0.7) * 0.18, 5.6 + Math.cos(a * 0.5) * 0.35);
      _v.set(0, 0.12, 0);
      this.camera.lookAt(_v);
      this.renderer.render(this.scene, this.camera);
      return;
    }

    const step = STARTUP_STEPS[Math.min(this.stepIndex, STARTUP_STEPS.length - 1)];
    this.stepTime += dt;
    const k = Math.min(1, this.stepTime / step.duration);
    const ease = 1 - Math.pow(1 - k, 3);
    _v.set(...step.camera.from).lerp(_v.set(...step.camera.to), ease);
    this.camera.position.lerp(_v, this.stepTime === 0 ? 1 : Math.min(1, dt * 3.2));
    _v.set(...step.camera.look);
    this.camera.lookAt(_v);
    if (this.stepTime >= step.duration) {
      if (this.stepIndex >= STARTUP_STEPS.length - 1) {
        if (!this.doneFlag) {
          this.doneFlag = true;
          this.cb.onDone?.();
        }
      } else {
        this.stepIndex++;
        this.stepTime = 0;
        this.applyStep(this.stepIndex);
        this.cb.onStep?.(this.stepIndex);
      }
    }
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.resize);
    document.removeEventListener('visibilitychange', this.visibility);
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
