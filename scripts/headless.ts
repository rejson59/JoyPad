/**
 * Atrapy przeglądarki do testowania silników 3D w node — bez GPU, sieci i prawdziwego DOM.
 *
 * Po co: gry importowane z paczek ZIP (WEBZA, Turbo League, Kasyno) są złożone, a sandbox
 * nie ma przeglądarki. Ten harness pozwala przepuścić CAŁY silnik przez prawdziwe klatki
 * symulacji (fizyka, zamówienia, bramki, wynik, sprzątanie) i sprawdzić niezmienniki:
 * brak NaN, `onFinish` dokładnie raz, brak wycieku nasłuchów, poprawny stan po `destroy()`.
 *
 * Czego NIE sprawdza: wyglądu klatek i wydajności GPU — to wymaga prawdziwej przeglądarki.
 */

type Fn = (...args: unknown[]) => unknown;

/** Obiekt „na wszystko”: każde pole to kolejny taki obiekt, każde wywołanie też; liczbowo = 0. */
export function universal(): any {
  const target = function () { /* atrapa */ };
  return new Proxy(target, {
    get: (_, key) => (key === Symbol.toPrimitive ? () => 0 : key === 'then' ? undefined : universal()),
    apply: () => universal(),
    set: () => true,
  });
}

/** Deterministyczny PRNG — testy nie mogą zależeć od losu. */
export function seededRandom(seed = 1234567): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FakeContext2D { [key: string]: unknown }

/** Kontekst 2D, który nic nie rysuje, ale odpowiada tak, jak oczekuje kod (pomiary, gradienty, piksele). */
export function fakeContext2D(width = 8, height = 8): FakeContext2D {
  const gradient = { addColorStop: () => undefined };
  const base: Record<string, unknown> = {
    measureText: (text: string) => ({ width: String(text).length * 8 }),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
    createPattern: () => ({}),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Uint8ClampedArray(Math.max(1, w * h * 4)), width: w, height: h }),
    createImageData: (w: number | { width: number; height: number }, h?: number) => {
      const width = typeof w === 'number' ? w : w.width;
      const height = typeof w === 'number' ? (h ?? 1) : w.height;
      return { data: new Uint8ClampedArray(Math.max(1, width * height * 4)), width, height };
    },
    putImageData: () => undefined,
    canvas: { width, height },
  };
  return new Proxy(base, {
    get: (target, key) => (key in target ? target[key as string] : (() => undefined)),
    set: (target, key, value) => { target[key as string] = value; return true; },
  });
}

export interface FakeElement {
  tagName: string;
  style: Record<string, string>;
  children: FakeElement[];
  parentElement: FakeElement | null;
  width: number;
  height: number;
  clientWidth: number;
  clientHeight: number;
  isContentEditable: boolean;
  [key: string]: unknown;
}

export function fakeElement(tag = 'div', size = { width: 1280, height: 720 }): FakeElement {
  const context = fakeContext2D(size.width, size.height);
  const element: FakeElement = {
    tagName: tag.toUpperCase(),
    style: {},
    children: [],
    parentElement: null,
    width: size.width,
    height: size.height,
    clientWidth: size.width,
    clientHeight: size.height,
    isContentEditable: false,
    getContext: () => context,
    setAttribute: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: size.width, height: size.height, right: size.width, bottom: size.height }),
    appendChild(child: FakeElement) { child.parentElement = element; element.children.push(child); return child; },
    remove() {
      const parent = element.parentElement;
      if (parent) parent.children = parent.children.filter(candidate => candidate !== element);
      element.parentElement = null;
    },
  };
  return element;
}

export interface Harness {
  /** Uruchamia `count` klatek rAF co `stepMs` (domyślnie 60 fps) na zegarze atrapy. */
  frames(count: number, stepMs?: number): void;
  /** Symuluje `seconds` sekund; `each` wołane po każdej klatce (np. do sterowania padami). */
  seconds(seconds: number, each?: (time: number) => void, stepMs?: number): void;
  now(): number;
  /** Liczba aktywnych nasłuchów na window/document — do wykrywania wycieków po `destroy()`. */
  listenerCount(): number;
  dispatch(type: string, init?: Record<string, unknown>): void;
  /** To samo dla zdarzeń na `document` (np. `visibilitychange`). */
  dispatchDocument(type: string, init?: Record<string, unknown>): void;
  restore(): void;
}

/** Instaluje globalne atrapy i zwraca sterownik zegara. Wołaj `restore()` na końcu testu. */
export function installBrowserFakes(options: { seed?: number } = {}): Harness {
  const g = globalThis as Record<string, any>;
  const saved = new Map<string, PropertyDescriptor | undefined>();
  const define = (key: string, value: unknown) => {
    if (!saved.has(key)) saved.set(key, Object.getOwnPropertyDescriptor(g, key));
    Object.defineProperty(g, key, { value, configurable: true, writable: true });
  };

  let clock = 1000;
  let nextId = 1;
  const queue = new Map<number, (time: number) => void>();
  const listeners = new Map<string, Set<(event: any) => void>>();
  const track = (registry: Map<string, Set<(event: any) => void>>) => ({
    add: (type: string, fn: (event: any) => void) => { (registry.get(type) ?? registry.set(type, new Set()).get(type)!).add(fn); },
    remove: (type: string, fn: (event: any) => void) => { registry.get(type)?.delete(fn); },
  });
  const windowTracker = track(listeners);
  const documentListeners = new Map<string, Set<(event: any) => void>>();
  const documentTracker = track(documentListeners);
  const body = fakeElement('body');

  define('window', g);
  define('HTMLElement', class HTMLElement {});
  define('devicePixelRatio', 1);
  define('innerWidth', 1280);
  define('innerHeight', 720);
  define('addEventListener', (type: string, fn: (event: any) => void) => windowTracker.add(type, fn));
  define('removeEventListener', (type: string, fn: (event: any) => void) => windowTracker.remove(type, fn));
  define('dispatchEvent', (event: { type: string }) => { listeners.get(event.type)?.forEach(fn => fn(event)); return true; });
  define('requestAnimationFrame', (callback: (time: number) => void) => { const id = nextId++; queue.set(id, callback); return id; });
  define('cancelAnimationFrame', (id: number) => { queue.delete(id); });
  define('performance', { now: () => clock });
  define('document', {
    hidden: false,
    body,
    createElement: (tag: string) => fakeElement(tag, { width: 300, height: 150 }),
    createElementNS: (_ns: string, tag: string) => fakeElement(tag, { width: 300, height: 150 }),
    querySelector: () => null,
    addEventListener: (type: string, fn: (event: any) => void) => documentTracker.add(type, fn),
    removeEventListener: (type: string, fn: (event: any) => void) => documentTracker.remove(type, fn),
  });
  define('localStorage', (() => {
    const store = new Map<string, string>();
    return { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => { store.set(k, v); }, removeItem: (k: string) => { store.delete(k); } };
  })());
  // AudioContext: znane metody jawnie, każde inne `create*` oraz `listener` zwracają obiekt „na wszystko”,
  // żeby dźwięk przestrzenny (panner, konwolwer, analizator…) nie wymagał dopisywania atrap jedna po drugiej.
  define('AudioContext', class {
    state = 'running'; currentTime = 0; sampleRate = 44100; destination = universal(); listener = universal();
    constructor() {
      return new Proxy(this, {
        get: (target, key) => {
          if (key in target) return (target as Record<string | symbol, unknown>)[key];
          return typeof key === 'string' && key.startsWith('create') ? () => universal() : undefined;
        },
      });
    }
    createGain() { return { gain: universal(), connect: () => undefined, disconnect: () => undefined }; }
    createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length), length }; }
    resume() { return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  });
  const originalRandom = Math.random;
  Math.random = seededRandom(options.seed);

  const pump = (count: number, stepMs: number, each?: (time: number) => void) => {
    for (let i = 0; i < count; i++) {
      clock += stepMs;
      const batch = [...queue.entries()];
      queue.clear();
      for (const [, callback] of batch) callback(clock);
      each?.(clock);
    }
  };

  return {
    frames: (count, stepMs = 1000 / 60) => pump(count, stepMs),
    seconds: (seconds, each, stepMs = 1000 / 60) => pump(Math.round((seconds * 1000) / stepMs), stepMs, each),
    now: () => clock,
    listenerCount: () => [...listeners.values(), ...documentListeners.values()].reduce((sum, set) => sum + set.size, 0),
    dispatch: (type, init = {}) => {
      const event = { type, target: g, code: '', repeat: false, preventDefault: () => undefined, ...init };
      listeners.get(type)?.forEach(fn => fn(event));
    },
    dispatchDocument: (type, init = {}) => {
      const event = { type, target: g.document, ...init };
      documentListeners.get(type)?.forEach(fn => fn(event));
    },
    restore: () => {
      Math.random = originalRandom;
      for (const [key, descriptor] of saved) {
        if (descriptor) Object.defineProperty(g, key, descriptor);
        else delete g[key];
      }
      queue.clear();
    },
  };
}

/** Renderer, który niczego nie rysuje, ale spełnia API używane przez EffectComposer i pass'y. */
export function fakeRenderer(canvas: unknown) {
  const counters = { render: 0, dispose: 0 };
  const base: Record<string, unknown> = {
    domElement: canvas,
    shadowMap: { enabled: false, type: 0 },
    outputColorSpace: '',
    toneMapping: 0,
    toneMappingExposure: 1,
    autoClear: true,
    capabilities: { isWebGL2: true, maxTextures: 16, getMaxAnisotropy: () => 8 },
    info: { render: {}, memory: {} },
    xr: { enabled: false },
    getPixelRatio: () => 1,
    getSize: (target: { set: (x: number, y: number) => unknown }) => { target.set(1280, 720); return target; },
    getDrawingBufferSize: (target: { set: (x: number, y: number) => unknown }) => { target.set(1280, 720); return target; },
    getRenderTarget: () => null,
    getClearColor: (target: unknown) => target,
    getClearAlpha: () => 1,
    getContext: () => universal(),
    render: () => { counters.render++; },
    dispose: () => { counters.dispose++; },
    counters,
  };
  return new Proxy(base, {
    get: (target, key) => (key in target ? target[key as string] : (((): undefined => undefined) as Fn)),
    set: (target, key, value) => { target[key as string] = value; return true; },
  });
}
