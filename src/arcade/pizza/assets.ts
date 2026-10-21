import {
  CanvasTexture,
  Color,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RepeatWrapping,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  TextureLoader,
  PMREMGenerator,
  WebGLRenderer,
} from "three";

export interface Assets {
  facade: Texture;
  facadeGlow: Texture;
  asphalt: Texture;
  roof: Texture;
  pizza: Texture;
  billboard: Texture;
  emblem: Texture;
  concrete: Texture;
  signs: Record<string, Texture>;
  splash: Texture;
  env: Texture;
}

/** Ścieżki pod `import.meta.env.BASE_URL` (GitHub Pages: /JoyPad/); testy w node nie mają `env`. */
const asset = (name: string) => `${import.meta.env?.BASE_URL ?? "/"}games/pizza/${name}`;

function fallback(color: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 8;
  const g = c.getContext("2d")!;
  g.fillStyle = color;
  g.fillRect(0, 0, 8, 8);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

function loadTex(url: string, wrap = false): Promise<Texture> {
  return new Promise((resolve) => {
    new TextureLoader().load(
      url,
      (t) => {
        t.colorSpace = SRGBColorSpace;
        t.anisotropy = 8;
        if (wrap) {
          t.wrapS = t.wrapT = RepeatWrapping;
        }
        resolve(t);
      },
      undefined,
      () => resolve(fallback("#666")),
    );
  });
}

function glowFrom(image: CanvasImageSource) {
  const w = (image as HTMLImageElement).width || 512;
  const h = (image as HTMLImageElement).height || 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.drawImage(image, 0, 0, w, h);
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i];
    const gc = d[i + 1];
    const b = d[i + 2];
    const lum = 0.3 * r + 0.5 * gc + 0.2 * b;
    const m = lum > 118 ? Math.min(2.2, (lum - 90) / 70) : 0;
    d[i] = Math.min(255, r * m);
    d[i + 1] = Math.min(255, gc * m);
    d[i + 2] = Math.min(255, b * m);
    d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

export function makeSign(text: string, fg: string, bg = "#12080c") {
  const c = document.createElement("canvas");
  c.width = 512;
  c.height = 160;
  const g = c.getContext("2d")!;
  g.fillStyle = bg;
  g.fillRect(0, 0, 512, 160);
  g.strokeStyle = fg;
  g.lineWidth = 8;
  g.strokeRect(8, 8, 496, 144);
  g.fillStyle = fg;
  g.font = "800 68px Impact, Arial Black, sans-serif";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.shadowColor = fg;
  g.shadowBlur = 18;
  g.fillText(text, 256, 84);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function makeConcrete() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#2a2c33";
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(255,255,255,${Math.random() * 0.04})`;
    g.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }
  g.strokeStyle = "rgba(0,0,0,0.25)";
  g.strokeRect(8, 8, 240, 240);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = t.wrapT = RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function makeSplash() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grd = g.createRadialGradient(64, 64, 4, 64, 64, 60);
  grd.addColorStop(0, "rgba(255,190,80,0.95)");
  grd.addColorStop(0.45, "rgba(230,70,30,0.55)");
  grd.addColorStop(1, "rgba(120,20,10,0)");
  g.fillStyle = grd;
  g.beginPath();
  g.arc(64, 64, 60, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.fillStyle = "rgba(255,220,140,0.8)";
    g.beginPath();
    g.ellipse(64 + Math.cos(a) * 34, 64 + Math.sin(a) * 34, 8, 4, a, 0, Math.PI * 2);
    g.fill();
  }
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  return t;
}

export function makeNightEnv(renderer: WebGLRenderer) {
  const pmrem = new PMREMGenerator(renderer);
  const scene = new Scene();
  scene.background = new Color("#0c1222");
  scene.add(new Mesh(new SphereGeometry(12, 20, 14), new MeshBasicMaterial({ color: "#12182a", side: 1 })));
  const colors = ["#ff6a2c", "#3ec6ff", "#ff4f8a", "#ffe08a", "#7cff6a", "#7080ff", "#ffb15a"];
  colors.forEach((col, i) => {
    const m = new Mesh(new PlaneGeometry(4, 4), new MeshBasicMaterial({ color: col }));
    const a = (i / colors.length) * Math.PI * 2;
    m.position.set(Math.cos(a) * 6, 1.4 + (i % 3) * 0.6, Math.sin(a) * 6);
    m.lookAt(0, 1.2, 0);
    scene.add(m);
  });
  const tex = pmrem.fromScene(scene, 0.04).texture;
  pmrem.dispose();
  return tex;
}

export async function loadAssets(): Promise<Omit<Assets, "env">> {
  const [facade, asphalt, roof, pizza, billboard, emblem] = await Promise.all([
    loadTex(asset("facade.webp"), true),
    loadTex(asset("asphalt.webp"), true),
    loadTex(asset("roof.webp"), true),
    loadTex(asset("pizza-box.webp")),
    loadTex(asset("billboard-pizza.webp")),
    loadTex(asset("emblem.webp")),
  ]);
  facade.wrapS = facade.wrapT = RepeatWrapping;
  asphalt.wrapS = asphalt.wrapT = RepeatWrapping;
  roof.wrapS = roof.wrapT = RepeatWrapping;
  const facadeGlow = facade.image ? glowFrom(facade.image as CanvasImageSource) : fallback("#000");
  facadeGlow.wrapS = facadeGlow.wrapT = RepeatWrapping;
  const signs: Record<string, Texture> = {
    WEBZA: makeSign("WEBZA", "#9af6ff", "#071018"),
    PEPERONI: makeSign("PEPERONI", "#ff6a55", "#1a0808"),
    FORNO: makeSign("FORNO", "#ffb15a", "#1a0e06"),
    NOC: makeSign("NOC", "#e0b0ff", "#120818"),
    BASILICO: makeSign("BASILICO", "#b6ff7a", "#071408"),
    OLIVE: makeSign("OLIVE", "#d6ff7a", "#121408"),
    DIAVOLA: makeSign("DIAVOLA", "#ff5f98", "#180810"),
    MARINA: makeSign("MARINA", "#7ee7ff", "#061418"),
    OTWARTE: makeSign("OTWARTE", "#ff8a3d", "#1a0c06"),
    "PIZZA 24H": makeSign("PIZZA 24H", "#ffd36a", "#1a1006"),
    GORĄCE: makeSign("GORACE", "#d6ff6a", "#101806"),
    HOT: makeSign("HOT", "#ffd36a", "#1a0c04"),
  };
  return {
    facade,
    facadeGlow,
    asphalt,
    roof,
    pizza,
    billboard,
    emblem,
    concrete: makeConcrete(),
    signs,
    splash: makeSplash(),
  };
}

export function cloneRepeat(base: Texture, rx: number, ry: number) {
  const t = base.clone();
  t.wrapS = t.wrapT = RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}
