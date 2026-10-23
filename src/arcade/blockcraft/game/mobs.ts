import * as THREE from 'three';
import type { World } from './world';
import { stepBody, type Body } from './physics';
import { IS_SOLID, IS_OPAQUE, RENDER, B, isDoor } from './blocks';
import { PROFESSIONS, createVillagerState, professionFor, type VillagerState } from './trading';
import { kindForColor, mobMaterial, setMobPalette, snapToPalette, type MobTexKind } from './mobTextures';
import { MOB_MODELS, buildMobModel, type BuiltMob } from './mobModels';
import { MOB_SKINS } from './art/vanillaArt.generated';

/** 2.18: 16 kolorów wełny, dokładnie jak paleta barwników w grze. */
export const SHEEP_WOOL_COLORS = [
  0xf9fffe, 0xf9801d, 0xc74eb5, 0x3ab3da, 0xfed83d, 0x80c71f, 0xf38baa, 0x474f52,
  0x9d9d97, 0x169c9c, 0x8932b8, 0x3c44aa, 0x835432, 0x5e7c16, 0xb02e26, 0x1d1d21,
] as const;

/**
 * 2.21.1: każdy z 16 kolorów runa ma własny blok wełny – owca strzyżona
 * i zabita oddaje wełnę dokładnie w swoim kolorze, jak w Minecrafcie.
 * Kolejność jest zgodna z `SHEEP_WOOL_COLORS` (barwniki z gry).
 */
export const SHEEP_WOOL_BLOCKS = [
  B.WOOL_WHITE, B.WOOL_ORANGE, B.WOOL_MAGENTA, B.WOOL_LIGHT_BLUE,
  B.WOOL_YELLOW, B.WOOL_LIME, B.WOOL_PINK, B.WOOL_GRAY,
  B.WOOL_LIGHT_GRAY, B.WOOL_CYAN, B.WOOL_PURPLE, B.WOOL_BLUE,
  B.WOOL_BROWN, B.WOOL_GREEN, B.WOOL_RED, B.WOOL_BLACK,
] as const;

/** Blok wełny odpowiadający kolorowi runa owcy (0xRRGGBB). */
export function woolBlockFor(color: number): number {
  const i = (SHEEP_WOOL_COLORS as readonly number[]).indexOf(color);
  return SHEEP_WOOL_BLOCKS[i < 0 ? 0 : i];
}

export type MobType = 'pig' | 'zombie' | 'sheep' | 'cow' | 'chicken' | 'creeper' | 'spider' | 'skeleton' | 'wolf' | 'villager' | 'golem' | 'enderman' | 'slime' | 'ghast';

export function isHostileMob(type: MobType): boolean {
  return type === 'zombie' || type === 'creeper' || type === 'spider' || type === 'skeleton' || type === 'enderman' || type === 'slime' || type === 'ghast';
}

/** Mieszkańcy i golemy nie znikają tak szybko, gdy gracz odejdzie od osady. */
export function isVillageMob(type: MobType): boolean {
  return type === 'villager' || type === 'golem';
}

/**
 * 2.16: części ciała dostają pikselowe tekstury (sierść, runo, pancerz,
 * ubranie). Drobne dodatki – oczy, dziób, nity – zostają płaskie, bo
 * 2-pikselowa tekstura na 2-centymetrowym klocku tylko szumi.
 */
function box(w: number, h: number, d: number, color: number, mats: Map<string, THREE.Material>, kind?: MobTexKind) {
  const textured = Math.max(w, h, d) >= 0.14 && Math.min(w, h, d) >= 0.095;
  // 2.17: wzór dobieramy z oryginalnego koloru części (żeby np. slime dalej
  // miał bąbelki), a sam odcień przesuwamy na paletę tekstury moba z paczki.
  const base = snapToPalette(color);
  const texKind = kind ?? kindForColor(color);
  const key = textured ? `t:${texKind}:${base}` : `c:${base}`;
  let m = mats.get(key);
  if (!m) {
    m = textured ? mobMaterial(texKind, base) : new THREE.MeshLambertMaterial({ color: base });
    mats.set(key, m);
  }
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.userData.mobColor = color; // kolor logiczny części (do rozpoznania w grze)
  mesh.userData.mobTint = base; // odcień z palety paczki (użyty w materiale)
  mesh.userData.mobKind = texKind;
  return mesh;
}

const sharedMats = new Map<string, THREE.Material>();

/**
 * 2.23: warianty biomowe zwierząt gospodarskich z 1.21.5+ (nadal w 26.2).
 * Krowa, świnia i kura mają po trzy tekstury: umiarkowaną, ciepłą i zimną.
 */
export type MobVariant = 'temperate' | 'warm' | 'cold';

const WARM_BIOMES = new Set(['Pustynia', 'Sawanna', 'Dżungla']);
const COLD_BIOMES = new Set(['Tundra', 'Góry']);

/** Wariant, który w Minecrafcie wynika z biomu w chwili narodzin moba. */
export function mobVariantForBiome(type: MobType, biome: string): MobVariant {
  if (type !== 'cow' && type !== 'pig' && type !== 'chicken') return 'temperate';
  if (COLD_BIOMES.has(biome)) return 'cold';
  if (WARM_BIOMES.has(biome)) return 'warm';
  return 'temperate';
}

export class Mob {
  type: MobType;
  /** 2.23: wariant biomowy (tekstura + model, np. `cow_cold`). */
  readonly variant: MobVariant;
  group = new THREE.Group();
  body: Body;
  yaw = Math.random() * Math.PI * 2;
  health: number;
  maxHealth: number;
  hurtTime = 0;
  dead = false;
  deathTime = 0;
  aiTimer = 0;
  walking = false;
  walkPhase = 0;
  attackCooldown = 0;
  soundTimer = 3 + Math.random() * 10;
  /** Creeper fuse. -1 = idle, otherwise seconds left. */
  fuse = -1;
  exploded = false;
  looted = false;
  sheared = false;
  /** 2.21.1: licznik do wypasu – owca od czasu do czasu opuszcza głowę. */
  grazeTimer = 6 + Math.random() * 10;
  /** 0 = głowa do góry, 1 = pasie się (opuszczona). */
  grazing = 0;
  /** Wysokość zawiasu głowy w chwili zbudowania modelu (do animacji wypasu). */
  private headBaseY = 0;
  /** Tamed wolves follow the player and fight hostiles for them. */
  tamed = false;
  /** Grabież (Looting): extra drops rolled when this mob's loot is collected. */
  bonusLoot = 0;
  /** True while a spider crawls up a wall (drives the leg animation). */
  climbing = false;
  /** 1.6: zawód mieszkańca (indeks w PROFESSIONS) i jego stan handlu. */
  profession = 0;
  trade: VillagerState | null = null;
  /** 1.6: dom mieszkańca / posterunek golema – wracają w jego okolice. */
  home = new THREE.Vector3();
  /** 1.6: golem pamięta, że gracz skrzywdził mieszkańca (sekundy gniewu). */
  provoked = 0;
  /** 1.6: mieszkaniec ucieka przez kilka sekund po otrzymaniu ciosu. */
  panic = 0;
  private woolMesh: THREE.Mesh | null = null;
  /** 2.18: części wełny owcy (chowamy je po strzyżeniu). */
  private woolParts: THREE.Object3D[] = [];
  /** 2.18: czerwona obroża oswojonego wilka. */
  private collar: THREE.Object3D | null = null;
  /** 2.18: czy model ma osobną głowę (można nią obracać w stronę gracza). */
  private headCanTurn = false;
  /**
   * 2.25: obrót każdej części w chwili zbudowania modelu. Animacja dokłada
   * się do tej pozy zamiast ją nadpisywać – wcześniej zombie „odwracał ręce
   * do tyłu”, bo wpis `-PI/2` z animacji kasował waniliową pozę `+PI/2`
   * zapisaną w modelu (ręce wyciągnięte do przodu).
   */
  private baseRot = new Map<THREE.Object3D, THREE.Euler>();
  /** 2.25: wygładzony obrót głowy względem tułowia (bez bazy z modelu). */
  private headYaw = 0;
  /**
   * 2.26: czas odrzutu po trafieniu. Przez ten czas mob nie steruje ruchem –
   * leci tam, gdzie go odepchnięto. Wcześniej `moveAndAnimate` natychmiast
   * wracało do pościgu (16% prędkości na klatkę), więc cios ledwo go ruszał.
   */
  kbTime = 0;
  /** 2.26: opór na odrzut – waniliowy golem w ogóle go nie odczuwa. */
  readonly kbResistance: number;
  /** 2.26: golem pamięta moba, który go uderzył, i oddaje mu. */
  retaliate: Mob | null = null;
  /**
   * 2.27: stabilność chodu mieszkańców.
   *
   * `jumpCooldown` blokuje dokładanie kolejnego skoku w każdej klatce (mob
   * pod ścianą podskakiwał kilka razy na sekundę), a `turnCooldown` pozwala
   * zawrócić tylko raz na chwilę – wcześniej `yaw += π/2` oraz losowy obrót
   * przy wodzie wykonywały się co klatkę i model dosłownie się trząsł.
   */
  jumpCooldown = 0;
  turnCooldown = 0;
  /** 2.27: kierunek ucieczki mieszkańca (stały, wygładzany sinusem). */
  private fleeYaw = 0;
  private wiggle = 0;
  /** 2.18: kolor runa owcy – z pozycji, więc każda owca ma swój (jak w grze). */
  readonly woolColor: number;
  legs: THREE.Object3D[] = [];
  arms: THREE.Object3D[] = [];
  head!: THREE.Object3D;
  meshes: THREE.Mesh[] = [];

  constructor(type: MobType, x: number, y: number, z: number, profession = 0, variant: MobVariant = 'temperate') {
    this.type = type;
    this.variant = variant;
    // Waniliowe `knockbackResistance`: golem 1.0 (nie da się go odepchnąć),
    // slime 0.0 – resztę mobów odrzuca pełna siła.
    this.kbResistance = type === 'golem' ? 1 : 0;
    this.home.set(x, y, z);
    // 2.21.1: dokładny rozkład z `SheepEntity`: 83,6% białych, 5% czarnych,
    // 5% szarych, 5% jasnoszarych, 3% brązowych i 2% różowych.
    const wc = Math.abs(Math.round(x * 7 + z * 13)) % 100;
    this.woolColor = wc < 5 ? 0x1d1d21
      : wc < 10 ? 0x474f52
        : wc < 15 ? 0x9d9d97
          : wc < 18 ? 0x835432
            : wc < 20 ? 0xf38baa
              : 0xf9fffe;
    // 2.21.1: pudełka kolizji dokładnie z waniliowych `EntityDimensions`
    // (`PigEntity`, `CowEntity`, `SheepEntity`, `ChickenEntity`, `WolfEntity`,
    // `VillagerEntity`, `ZombieEntity`, `SkeletonEntity`, `CreeperEntity`,
    // `SpiderEntity`, `EndermanEntity`, `IronGolemEntity`, `GhastEntity`).
    // Wcześniej szkielet miał 0,9 × 0,9 bloku (nie dało się w niego trafić
    // w głowę), krowa była szersza niż w grze, a golem o pół bloku za niski.
    const dims: Record<string, [number, number]> = {
      pig: [0.9, 0.9], cow: [0.9, 1.4], sheep: [0.9, 1.3], chicken: [0.4, 0.7],
      wolf: [0.6, 0.85], villager: [0.6, 1.95], zombie: [0.6, 1.95],
      skeleton: [0.6, 1.99], creeper: [0.6, 1.7], spider: [1.4, 0.9],
      enderman: [0.6, 2.9], golem: [1.4, 2.7], slime: [0.9, 0.9], ghast: [4.0, 4.0],
    };
    const [w, h] = dims[type] ?? [0.9, 0.9];
    this.body = { pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), w, h, onGround: false, hitWall: false };
    this.maxHealth = this.health =
      type === 'zombie' ? 20
        : type === 'creeper' ? 20
          : type === 'cow' ? 10
            : type === 'chicken' ? 4
              : type === 'sheep' ? 8
                : type === 'skeleton' ? 20
                  : type === 'spider' ? 16
                    : type === 'golem' ? 100
                      : type === 'villager' ? 20
                        : type === 'wolf' ? 8
                          : type === 'enderman' ? 40
                            : type === 'slime' ? 12
                              : type === 'ghast' ? 10 : 10;
    this.profession = type === 'villager' ? professionFor(profession) : 0;
    if (type === 'villager') this.trade = createVillagerState(this.profession, 0);
    this.build();
  }

  /** Marks a wild wolf as tamed (friendly coat, full health). */
  tame(): boolean {
    if (this.type !== 'wolf' || this.tamed || this.dead) return false;
    this.tamed = true;
    this.health = this.maxHealth;
    // 2.18: wilk ma prawdziwą teksturę, więc oswojenie zaznacza czerwona
    // obroża – tak jak w Minecrafcie (wcześniej przemalowywaliśmy sierść).
    if (this.hasVanillaModel()) {
      this.addCollar();
      return true;
    }
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const base = mesh.userData.mobColor as number | undefined;
      // 2.16: materiał ma teksturę i białą bazę, więc kolor czytamy z
      // `userData`, a nie z `material.color`.
      if (base !== 0x7a8089 && base !== 0x5d626b) return;
      const next = base === 0x7a8089 ? 0xa05a48 : 0x7a4238; // coat turns rust-red
      const old = mesh.material as THREE.MeshLambertMaterial;
      const mat = mobMaterial('wolf-fur', next).clone();
      mat.emissive.copy(old.emissive);
      mesh.material = mat;
      mesh.userData.mobColor = next;
      mesh.userData.mobTint = next;
    });
    return true;
  }

  /** Czy mob dostał model 1:1 z paczki (a nie stary, kolorowy). */
  hasVanillaModel(): boolean {
    return this.meshes.some((m) => m.userData.mobKind === this.type && m.material instanceof THREE.MeshLambertMaterial && !!m.material.map);
  }

  /** Czerwona obroża oswojonego wilka (cieńsze pudełko wokół szyi). */
  private addCollar() {
    if (this.collar) return;
    const geom = new THREE.BoxGeometry(0.42, 0.09, 0.42);
    const mat = new THREE.MeshLambertMaterial({ color: 0xc02020 });
    const collar = new THREE.Mesh(geom, mat);
    // Model wilka ma pivot głowy w (-1, 13.5, -7), więc obroża leży tuż pod
    // nią – na dolnej krawędzi pudełka głowy.
    collar.position.set(0.06, -0.19, 0.06);
    this.head.add(collar);
    this.collar = collar;
    this.meshes.push(collar);
  }

  private addLeg(x: number, y: number, z: number, w: number, h: number, d: number, color: number, arr: THREE.Object3D[], kind?: MobTexKind) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    const m = box(w, h, d, color, sharedMats, kind);
    m.position.y = -h / 2;
    pivot.add(m);
    this.meshes.push(m);
    this.group.add(pivot);
    arr.push(pivot);
    return pivot;
  }

  private build() {
    // 2.17: paleta kolorów z prawdziwej tekstury tego moba w paczce.
    setMobPalette(this.type);
    // 2.18: najpierw próbujemy prawdziwego modelu z paczki. Gdyby tekstury
    // brakowało, zostaje stary, kolorowy model – gra nigdy nie zostaje bez moba.
    // 2.23: wariant biomowy ma własny model (krowa zimowa/ciepła) albo tylko
    // teksturę (świnia i kura ciepła) – wtedy zostaje model podstawowy.
    const variantKey = `${this.type}_${this.variant}`;
    const model = MOB_MODELS[variantKey] ?? MOB_MODELS[this.type];
    if (model) {
      const skin = this.type === 'villager'
        ? `villager${this.profession % 5}`
        : MOB_SKINS[variantKey] ? variantKey : model.skin;
      const built = buildMobModel(model, skin);
      if (built) {
        this.mountBuiltModel(built);
        return;
      }
    }
    this.buildLegacy();
  }

  /**
   * 2.18: podłącza model 1:1 (prawdziwe pudełka i UV z Minecrafta) i zachowuje
   * te same „uchwyty” animacji, których używa reszta klasy: `legs`, `arms`,
   * `head` oraz lista siatek do podświetlenia po trafieniu.
   */
  private mountBuiltModel(built: BuiltMob) {
    const g = this.group;
    g.add(built.root);
    this.meshes = built.meshes;
    const P = built.parts;
    const legs = this.type === 'spider'
      ? ['rightHindLeg', 'rightMiddleHindLeg', 'rightMiddleFrontLeg', 'rightFrontLeg',
         'leftHindLeg', 'leftMiddleHindLeg', 'leftMiddleFrontLeg', 'leftFrontLeg']
      : ['rightHindLeg', 'leftHindLeg', 'rightFrontLeg', 'leftFrontLeg'];
    let picked = legs.map((n) => P[n]).filter(Boolean);
    if (picked.length === 0) picked = ['rightLeg', 'leftLeg'].map((n) => P[n]).filter(Boolean);
    this.legs = picked;
    const arms = this.type === 'chicken' ? ['rightWing', 'leftWing'] : ['rightArm', 'leftArm'];
    this.arms = arms.map((n) => P[n]).filter(Boolean);
    if (P.head) {
      this.head = P.head;
      this.headBaseY = P.head.position.y;
      this.headCanTurn = this.type !== 'ghast';
    }
    for (const mesh of built.meshes) {
      mesh.userData.mobTint = 0xffffff;
      mesh.userData.mobKind = this.type;
    }
    // 2.25: zapamiętujemy pozę modelu (zombie: ręce do przodu, mieszkaniec:
    // złożone ręce, pająk: rozstaw nóg), żeby animacja ją szanowała.
    this.baseRot.clear();
    for (const grp of Object.values(P)) this.baseRot.set(grp, grp.rotation.clone());
    // Owca: wełna to osobny, „spuchnięty” model – po strzyżeniu po prostu go chowamy.
    if (this.type === 'sheep') {
      const wool = buildMobModel(MOB_MODELS.sheep_wool, 'sheep_wool');
      if (wool) {
        built.root.add(wool.root);
        this.woolParts = [wool.root];
        this.meshes.push(...wool.meshes);
        for (const mesh of wool.meshes) {
          mesh.userData.mobKind = 'sheep_wool';
          mesh.userData.mobTint = this.woolColor;
          const mat = mesh.material as THREE.MeshLambertMaterial;
          if (mat.map) mat.color.setHex(this.woolColor);
        }
        if (this.sheared && wool.root) wool.root.visible = false;
      }
    }
  }

  private buildLegacy() {
    const g = this.group;
    if (this.type === 'pig' || this.type === 'sheep' || this.type === 'cow') {
      const isSheep = this.type === 'sheep';
      const isCow = this.type === 'cow';
      const bodyColor = isCow ? 0x6b4423 : isSheep ? 0xeeeeee : 0xf0a0a0;
      const skin = isCow ? 0x8a5a32 : isSheep ? 0xd8c8b0 : 0xf0a0a0;
      const legH = isCow ? 0.62 : isSheep ? 0.5 : 0.35;
      const body = box(isCow ? 0.9 : isSheep ? 0.75 : 0.62, isCow ? 0.75 : isSheep ? 0.62 : 0.55, isCow ? 1.35 : 1.0, bodyColor, sharedMats);
      body.position.set(0, legH + (isCow ? 0.36 : 0.28), 0);
      g.add(body);
      this.meshes.push(body);
      if (isSheep) this.woolMesh = body;
      if (isCow) {
        const spot = box(0.28, 0.22, 0.32, 0xf2f2f2, sharedMats);
        spot.position.set(0.22, legH + 0.55, -0.15);
        g.add(spot);
        this.meshes.push(spot);
      }
      const head = new THREE.Group();
      head.position.set(0, legH + (isCow ? 0.7 : 0.45), isCow ? 0.72 : 0.55);
      const hm = box(isCow ? 0.55 : 0.5, isCow ? 0.55 : 0.5, isCow ? 0.5 : 0.45, skin, sharedMats);
      head.add(hm);
      this.meshes.push(hm);
      if (!isSheep) {
        const snout = box(isCow ? 0.32 : 0.28, isCow ? 0.2 : 0.18, 0.1, isCow ? 0xd9a0a0 : 0xe07f86, sharedMats);
        snout.position.set(0, isCow ? -0.12 : -0.08, 0.28);
        head.add(snout);
        this.meshes.push(snout);
      }
      if (isCow) {
        const hornL = box(0.08, 0.16, 0.08, 0xeee8dc, sharedMats);
        hornL.position.set(-0.18, 0.32, 0.05);
        const hornR = hornL.clone();
        hornR.position.x = 0.18;
        head.add(hornL, hornR);
        this.meshes.push(hornL, hornR);
      }
      const eyeL = box(0.08, 0.08, 0.02, 0x111111, sharedMats);
      eyeL.position.set(-0.14, 0.08, 0.23);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.14;
      head.add(eyeL, eyeR);
      g.add(head);
      this.head = head;
      const lc = isCow ? 0x6b4423 : isSheep ? 0xd8c8b0 : 0xf0a0a0;
      const lw = isCow ? 0.26 : 0.22;
      const fz = isCow ? 0.46 : 0.32;
      const bz = isCow ? -0.46 : -0.32;
      const lx = isCow ? 0.24 : 0.18;
      this.addLeg(-lx, legH, fz, lw, legH, lw, lc, this.legs);
      this.addLeg(lx, legH, fz, lw, legH, lw, lc, this.legs);
      this.addLeg(-lx, legH, bz, lw, legH, lw, lc, this.legs);
      this.addLeg(lx, legH, bz, lw, legH, lw, lc, this.legs);
    } else if (this.type === 'chicken') {
      const body = box(0.36, 0.32, 0.48, 0xf4f4f4, sharedMats);
      body.position.set(0, 0.42, 0);
      g.add(body);
      this.meshes.push(body);
      const head = new THREE.Group();
      head.position.set(0, 0.62, 0.28);
      const hm = box(0.22, 0.22, 0.22, 0xf4f4f4, sharedMats);
      head.add(hm);
      this.meshes.push(hm);
      const beak = box(0.1, 0.08, 0.1, 0xf0b429, sharedMats);
      beak.position.set(0, -0.02, 0.14);
      const comb = box(0.06, 0.1, 0.08, 0xd02020, sharedMats);
      comb.position.set(0, 0.14, 0);
      const eyeL = box(0.05, 0.05, 0.02, 0x111111, sharedMats);
      eyeL.position.set(-0.07, 0.02, 0.11);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.07;
      head.add(beak, comb, eyeL, eyeR);
      this.meshes.push(beak, comb, eyeL, eyeR);
      g.add(head);
      this.head = head;
      this.addLeg(-0.08, 0.28, 0.02, 0.06, 0.28, 0.06, 0xf0b429, this.legs);
      this.addLeg(0.08, 0.28, 0.02, 0.06, 0.28, 0.06, 0xf0b429, this.legs);
      const wingL = this.addLeg(-0.2, 0.48, 0, 0.06, 0.22, 0.28, 0xe8e8e8, this.arms);
      const wingR = this.addLeg(0.2, 0.48, 0, 0.06, 0.22, 0.28, 0xe8e8e8, this.arms);
      wingL.rotation.z = 0.35;
      wingR.rotation.z = -0.35;
    } else if (this.type === 'creeper') {
      this.addLeg(-0.16, 0.4, 0.12, 0.18, 0.4, 0.18, 0x1d6b1d, this.legs);
      this.addLeg(0.16, 0.4, 0.12, 0.18, 0.4, 0.18, 0x1d6b1d, this.legs);
      this.addLeg(-0.16, 0.4, -0.12, 0.18, 0.4, 0.18, 0x165816, this.legs);
      this.addLeg(0.16, 0.4, -0.12, 0.18, 0.4, 0.18, 0x165816, this.legs);
      const torso = box(0.5, 0.85, 0.32, 0x3aaa32, sharedMats);
      torso.position.y = 0.85;
      g.add(torso);
      this.meshes.push(torso);
      const head = new THREE.Group();
      head.position.y = 1.5;
      const hm = box(0.5, 0.5, 0.5, 0x46c23c, sharedMats);
      head.add(hm);
      this.meshes.push(hm);
      const eyeL = box(0.1, 0.08, 0.02, 0x111111, sharedMats);
      eyeL.position.set(-0.1, 0.06, 0.26);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.1;
      const mouth = box(0.16, 0.08, 0.02, 0x111111, sharedMats);
      mouth.position.set(0, -0.1, 0.26);
      head.add(eyeL, eyeR, mouth);
      this.meshes.push(eyeL, eyeR, mouth);
      g.add(head);
      this.head = head;
    } else if (this.type === 'zombie') {
      this.addLeg(-0.13, 0.75, 0, 0.25, 0.75, 0.25, 0x3b3f8f, this.legs);
      this.addLeg(0.13, 0.75, 0, 0.25, 0.75, 0.25, 0x3b3f8f, this.legs);
      const torso = box(0.52, 0.72, 0.28, 0x2aa3a3, sharedMats);
      torso.position.y = 1.11;
      g.add(torso);
      this.meshes.push(torso);
      const head = new THREE.Group();
      head.position.y = 1.47 + 0.25;
      const hm = box(0.5, 0.5, 0.5, 0x5d8a44, sharedMats);
      head.add(hm);
      this.meshes.push(hm);
      const eyeL = box(0.1, 0.06, 0.02, 0x111111, sharedMats);
      eyeL.position.set(-0.12, 0.02, 0.26);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.12;
      head.add(eyeL, eyeR);
      g.add(head);
      this.head = head;
      const a1 = this.addLeg(-0.38, 1.42, 0, 0.24, 0.72, 0.24, 0x5d8a44, this.arms);
      const a2 = this.addLeg(0.38, 1.42, 0, 0.24, 0.72, 0.24, 0x5d8a44, this.arms);
      a1.rotation.x = -Math.PI / 2;
      a2.rotation.x = -Math.PI / 2;
    } else if (this.type === 'spider') {
      const shell = 0x2e1f16;
      const dark = 0x3d2a1e;
      const body = box(0.72, 0.42, 0.92, shell, sharedMats);
      body.position.set(0, 0.52, -0.05);
      g.add(body);
      this.meshes.push(body);
      const rear = box(0.5, 0.36, 0.34, dark, sharedMats);
      rear.position.set(0, 0.5, -0.58);
      g.add(rear);
      this.meshes.push(rear);
      const head = new THREE.Group();
      head.position.set(0, 0.52, 0.5);
      const hm = box(0.44, 0.34, 0.34, dark, sharedMats);
      head.add(hm);
      this.meshes.push(hm);
      for (const sx of [-0.12, 0.12]) {
        for (const sy of [0.1, -0.06]) {
          const eye = box(0.07, 0.06, 0.03, 0xd02020, sharedMats);
          eye.position.set(sx, sy, 0.18);
          head.add(eye);
          this.meshes.push(eye);
        }
      }
      g.add(head);
      this.head = head;
      // eight legs, two per corner, splayed outwards
      const legSpots: [number, number, number][] = [
        [-0.34, 0.22, 0.16], [-0.34, 0.22, -0.16], [-0.34, 0.22, -0.44], [-0.34, 0.22, -0.68],
        [0.34, 0.22, 0.16], [0.34, 0.22, -0.16], [0.34, 0.22, -0.44], [0.34, 0.22, -0.68],
      ];
      for (const [lx, ly, lz] of legSpots) {
        const pivot = new THREE.Group();
        pivot.position.set(lx, ly, lz);
        const m = box(0.07, 0.46, 0.07, 0x241a12, sharedMats);
        m.position.set(lx > 0 ? 0.04 : -0.04, -0.23, 0);
        m.rotation.z = lx > 0 ? 0.5 : -0.5;
        pivot.add(m);
        this.meshes.push(m);
        g.add(pivot);
        this.legs.push(pivot);
      }
    } else if (this.type === 'skeleton') {
      const bone = 0xe6e2d4;
      const boneDark = 0xc9c4b2;
      this.addLeg(-0.12, 0.72, 0, 0.2, 0.72, 0.2, boneDark, this.legs);
      this.addLeg(0.12, 0.72, 0, 0.2, 0.72, 0.2, boneDark, this.legs);
      const torso = box(0.44, 0.7, 0.24, bone, sharedMats);
      torso.position.y = 1.07;
      g.add(torso);
      this.meshes.push(torso);
      // ribs
      for (const ry of [0.86, 0.98, 1.1, 1.22]) {
        const rib = box(0.46, 0.04, 0.26, boneDark, sharedMats);
        rib.position.y = ry;
        g.add(rib);
        this.meshes.push(rib);
      }
      const head = new THREE.Group();
      head.position.y = 1.58;
      const hm = box(0.42, 0.42, 0.42, bone, sharedMats);
      head.add(hm);
      this.meshes.push(hm);
      const jaw = box(0.34, 0.08, 0.36, boneDark, sharedMats);
      jaw.position.y = -0.18;
      head.add(jaw);
      this.meshes.push(jaw);
      for (const sx of [-0.1, 0.1]) {
        const eye = box(0.09, 0.07, 0.03, 0x101010, sharedMats);
        eye.position.set(sx, 0.04, 0.22);
        head.add(eye);
        this.meshes.push(eye);
      }
      g.add(head);
      this.head = head;
      const a1 = this.addLeg(-0.3, 1.36, 0.1, 0.16, 0.68, 0.16, bone, this.arms);
      const a2 = this.addLeg(0.3, 1.36, 0.1, 0.16, 0.68, 0.16, bone, this.arms);
      a1.rotation.x = -1.15;
      a2.rotation.x = -1.15;
      // bow held in front
      const bow1 = box(0.05, 0.62, 0.05, 0x7a5230, sharedMats);
      bow1.position.set(0.34, 1.0, 0.3);
      bow1.rotation.z = 0.35;
      const bow2 = box(0.05, 0.62, 0.05, 0x7a5230, sharedMats);
      bow2.position.set(0.5, 1.0, 0.3);
      bow2.rotation.z = -0.35;
      const string = box(0.03, 0.6, 0.03, 0xdedad2, sharedMats);
      string.position.set(0.42, 1.0, 0.3);
      g.add(bow1, bow2, string);
      this.meshes.push(bow1, bow2, string);
    } else if (this.type === 'wolf') {
      const fur = 0x7a8089;
      const furDk = 0x5d626b;
      const light = 0xd8dade;
      const legH = 0.42;
      const body = box(0.55, 0.48, 1.05, fur, sharedMats);
      body.position.set(0, legH + 0.24, 0);
      g.add(body);
      this.meshes.push(body);
      const chest = box(0.5, 0.34, 0.4, light, sharedMats);
      chest.position.set(0, legH + 0.2, 0.42);
      g.add(chest);
      this.meshes.push(chest);
      const tail = box(0.14, 0.14, 0.42, furDk, sharedMats);
      tail.position.set(0, legH + 0.34, -0.62);
      tail.rotation.x = 0.5;
      g.add(tail);
      this.meshes.push(tail);
      const head = new THREE.Group();
      head.position.set(0, legH + 0.52, 0.66);
      const hm = box(0.4, 0.38, 0.4, fur, sharedMats);
      head.add(hm);
      this.meshes.push(hm);
      const muzzle = box(0.2, 0.18, 0.22, light, sharedMats);
      muzzle.position.set(0, -0.06, 0.28);
      head.add(muzzle);
      this.meshes.push(muzzle);
      const nose = box(0.1, 0.1, 0.06, 0x1a1a1a, sharedMats);
      nose.position.set(0, -0.04, 0.4);
      head.add(nose);
      this.meshes.push(nose);
      const earL = box(0.12, 0.16, 0.08, furDk, sharedMats);
      earL.position.set(-0.12, 0.24, -0.05);
      const earR = earL.clone();
      earR.position.x = 0.12;
      head.add(earL, earR);
      this.meshes.push(earL, earR);
      const eyeL = box(0.07, 0.07, 0.02, 0x111111, sharedMats);
      eyeL.position.set(-0.11, 0.06, 0.21);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.11;
      head.add(eyeL, eyeR);
      this.meshes.push(eyeL, eyeR);
      g.add(head);
      this.head = head;
      this.addLeg(-0.16, legH, 0.32, 0.16, legH, 0.16, furDk, this.legs);
      this.addLeg(0.16, legH, 0.32, 0.16, legH, 0.16, furDk, this.legs);
      this.addLeg(-0.16, legH, -0.32, 0.16, legH, 0.16, fur, this.legs);
      this.addLeg(0.16, legH, -0.32, 0.16, legH, 0.16, fur, this.legs);
    } else if (this.type === 'villager') {
      // Mieszkaniec: długa szata w kolorze zawodu, duży nos, złożone ręce.
      const robe = parseInt(PROFESSIONS[this.profession]?.color.slice(1) ?? '4f8a3a', 16);
      const skin = 0xa8785a;
      const skinDk = 0x8a5f45;
      const legH = 0.45;
      const body = box(0.62, 0.92, 0.36, robe, sharedMats, 'robe');
      body.position.set(0, legH + 0.46, 0);
      g.add(body);
      this.meshes.push(body);
      const apron = box(0.3, 0.62, 0.04, 0xf0e6d2, sharedMats);
      apron.position.set(0, legH + 0.42, 0.19);
      g.add(apron);
      this.meshes.push(apron);
      const head = new THREE.Group();
      head.position.set(0, legH + 1.2, 0);
      const hm = box(0.5, 0.52, 0.5, skin, sharedMats);
      head.add(hm);
      this.meshes.push(hm);
      const nose = box(0.13, 0.2, 0.16, skinDk, sharedMats);
      nose.position.set(0, -0.06, 0.3);
      head.add(nose);
      this.meshes.push(nose);
      const brow = box(0.52, 0.12, 0.52, 0x3a2a1a, sharedMats);
      brow.position.set(0, 0.24, 0);
      head.add(brow);
      this.meshes.push(brow);
      const eyeL = box(0.1, 0.08, 0.02, 0xffffff, sharedMats);
      eyeL.position.set(-0.13, 0.04, 0.26);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.13;
      head.add(eyeL, eyeR);
      this.meshes.push(eyeL, eyeR);
      g.add(head);
      this.head = head;
      // ręce złożone z przodu, jak na bazarze
      const armL = box(0.14, 0.16, 0.44, robe, sharedMats, 'robe');
      armL.position.set(-0.34, legH + 0.86, 0.18);
      const armR = armL.clone();
      armR.position.x = 0.34;
      const handL = box(0.14, 0.14, 0.14, skin, sharedMats);
      handL.position.set(-0.2, legH + 0.86, 0.34);
      const handR = handL.clone();
      handR.position.x = 0.2;
      g.add(armL, armR, handL, handR);
      this.meshes.push(armL, armR, handL, handR);
      this.arms.push(armL, armR);
      this.addLeg(-0.16, legH + 0.05, 0, 0.2, legH + 0.1, 0.22, 0x3d3d46, this.legs);
      this.addLeg(0.16, legH + 0.05, 0, 0.2, legH + 0.1, 0.22, 0x3d3d46, this.legs);
    } else if (this.type === 'golem') {
      // Żelazny golem: masywny tors, długie ręce, mosiężne oczy i pnącza.
      const iron = 0xc9c9cd;
      const ironDk = 0x9d9da3;
      const legH = 0.9;
      const torso = box(0.95, 0.9, 0.62, iron, sharedMats);
      torso.position.set(0, legH + 0.45, 0);
      g.add(torso);
      this.meshes.push(torso);
      const vine = box(0.98, 0.24, 0.66, 0x4a7a3a, sharedMats);
      vine.position.set(0, legH + 0.62, 0);
      g.add(vine);
      this.meshes.push(vine);
      const head = new THREE.Group();
      head.position.set(0, legH + 1.12, 0);
      const hm = box(0.6, 0.55, 0.6, iron, sharedMats);
      head.add(hm);
      this.meshes.push(hm);
      const jaw = box(0.32, 0.16, 0.18, ironDk, sharedMats);
      jaw.position.set(0, -0.18, 0.3);
      head.add(jaw);
      this.meshes.push(jaw);
      const eyeL = box(0.12, 0.08, 0.03, 0x7a3a20, sharedMats);
      eyeL.position.set(-0.15, 0.04, 0.3);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.15;
      head.add(eyeL, eyeR);
      this.meshes.push(eyeL, eyeR);
      g.add(head);
      this.head = head;
      this.addLeg(-0.26, legH, 0, 0.3, legH, 0.34, ironDk, this.legs);
      this.addLeg(0.26, legH, 0, 0.3, legH, 0.34, ironDk, this.legs);
      // opuszczone, długie ramiona
      const armL = new THREE.Group();
      armL.position.set(-0.62, legH + 0.82, 0);
      const am = box(0.28, 1.1, 0.3, iron, sharedMats);
      am.position.y = -0.55;
      armL.add(am);
      this.meshes.push(am);
      const armR = armL.clone();
      armR.position.x = 0.62;
      g.add(armL, armR);
      this.arms.push(armL, armR);
    } else if (this.type === 'enderman') {
      const black = 0x111111;
      const eye = 0xaa00ff;
      this.addLeg(-0.14, 1.4, 0, 0.18, 1.4, 0.18, black, this.legs);
      this.addLeg(0.14, 1.4, 0, 0.18, 1.4, 0.18, black, this.legs);
      const torso = box(0.5, 0.9, 0.28, black, sharedMats);
      torso.position.y = 1.85;
      g.add(torso);
      this.meshes.push(torso);
      const head = new THREE.Group();
      head.position.y = 2.5;
      const hm = box(0.5, 0.5, 0.5, black, sharedMats);
      head.add(hm);
      this.meshes.push(hm);
      const eL = box(0.1, 0.08, 0.02, eye, sharedMats);
      eL.position.set(-0.12, 0.04, 0.26);
      const eR = eL.clone();
      eR.position.x = 0.12;
      head.add(eL, eR);
      this.meshes.push(eL, eR);
      g.add(head);
      this.head = head;
      const a1 = this.addLeg(-0.38, 2.2, 0, 0.14, 1.1, 0.14, black, this.arms);
      const a2 = this.addLeg(0.38, 2.2, 0, 0.14, 1.1, 0.14, black, this.arms);
      a1.rotation.x = -0.2;
      a2.rotation.x = -0.2;
    } else if (this.type === 'slime') {
      const green = 0x5ad65a;
      const body = box(0.9, 0.9, 0.9, green, sharedMats);
      body.position.y = 0.5;
      // transparent look via opacity handled in material clone later
      g.add(body);
      this.meshes.push(body);
      this.head = body as any;
      // eyes
      const eyeL = box(0.12, 0.12, 0.02, 0x111111, sharedMats);
      eyeL.position.set(-0.18, 0.6, 0.46);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.18;
      g.add(eyeL, eyeR);
      this.meshes.push(eyeL, eyeR);
    } else if (this.type === 'ghast') {
      const white = 0xf0f0f0;
      const body = box(2.0, 2.0, 2.0, white, sharedMats);
      body.position.y = 3;
      g.add(body);
      this.meshes.push(body);
      this.head = body as any;
      // tentacles
      for (let i = 0; i < 6; i++) {
        const tx = (i - 2.5) * 0.35;
        const tent = box(0.2, 0.9, 0.2, white, sharedMats);
        tent.position.set(tx, 1.8, 0);
        g.add(tent);
        this.meshes.push(tent);
        this.legs.push(tent as any);
      }
      const eyeL = box(0.2, 0.2, 0.05, 0x111111, sharedMats);
      eyeL.position.set(-0.4, 3.2, 1.02);
      const eyeR = eyeL.clone();
      eyeR.position.x = 0.4;
      g.add(eyeL, eyeR);
      this.meshes.push(eyeL, eyeR);
    }
    g.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) {
        // clone material per mob so we can tint on hurt
        const mesh = o as THREE.Mesh;
        const mat = (mesh.material as THREE.MeshLambertMaterial).clone();
        // 2.16: slime jest półprzezroczysty jak w Minecrafcie (oczy zostają ostre).
        if (this.type === 'slime' && mesh.userData.mobKind === 'slime') {
          mat.transparent = true;
          mat.opacity = 0.82;
          mat.depthWrite = false;
        }
        mesh.material = mat;
      }
    });
  }

  setTint(red: boolean) {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) (mesh.material as THREE.MeshLambertMaterial).emissive.setHex(red ? 0x770000 : 0x000000);
    });
  }

  setFlash(on: boolean) {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) (mesh.material as THREE.MeshLambertMaterial).emissive.setHex(on ? 0xaaaaaa : 0x000000);
    });
  }

  damage(amount: number, fromX: number, fromZ: number, attacker: Mob | 'player' | null = null) {
    if (this.dead || this.hurtTime > 0) return false;
    this.health -= amount;
    this.hurtTime = 0.5;
    const dx = this.body.pos.x - fromX, dz = this.body.pos.z - fromZ;
    const l = Math.hypot(dx, dz) || 1;
    // 2.26: pełny odrzut tylko dla mobów, które go odczuwają (golem ma 1.0).
    const kb = 1 - this.kbResistance;
    this.body.vel.x = (dx / l) * 7 * kb;
    this.body.vel.z = (dz / l) * 7 * kb;
    this.body.vel.y = Math.max(this.body.vel.y, 6 * kb);
    if (kb > 0) this.kbTime = 0.45;
    this.setTint(true);
    if (this.health <= 0) {
      this.dead = true;
      this.deathTime = 0;
      this.fuse = -1;
    }
    if (this.type === 'golem') {
      // 2.26: golem nie ucieka – odwraca się do napastnika. Gracz budzi go
      // na 20 s (jak w wanilii), a mob trafia do listy „oddaj mu”.
      if (attacker === 'player') this.provoked = 20;
      else if (attacker && attacker !== this) this.retaliate = attacker;
      this.walking = true;
      return true;
    }
    if (this.type !== 'zombie' && !this.tamed) {
      // panic
      this.aiTimer = 3;
      this.walking = true;
      this.yaw = Math.atan2(dx, dz);
      if (this.type === 'villager') {
        this.panic = 4;
        // 2.27: mieszkaniec ucieka w jednym kierunku (z dala od napastnika),
        // a nie losowo co klatkę – to właśnie trzęsło modelem.
        this.fleeYaw = this.yaw;
        this.wiggle = 0;
      }
    }
    return true;
  }

  /**
   * Tamed wolf AI: follow the player, stand by when close, and attack the
   * nearest hostile mob on the player's behalf.
   */
  /** Najbliższy wrogi mob w zasięgu (wspólne dla mieszkańców i golemów). */
  private nearestHostile(allies: Mob[], maxDist: number, from: THREE.Vector3 = this.body.pos): Mob | null {
    let best: Mob | null = null;
    let bestD = maxDist;
    for (const o of allies) {
      if (o === this || o.dead || !isHostileMob(o.type)) continue;
      const d = o.body.pos.distanceTo(from);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  /**
   * Mieszkaniec: krąży wokół domu, a gdy w pobliżu pojawi się potwór – ucieka
   * i woła (dźwięk odtwarza silnik przez soundTimer).
   */
  private updateVillager(dt: number, world: World, player: THREE.Vector3, allies: Mob[]): void {
    const b = this.body;
    // Świeżo uderzony mieszkaniec po prostu zwiewa. 2.27: kierunek jest
    // stały (zapisany w `damage()`), a tylko lekko faluje – wcześniej losowy
    // obrót dokładał się w każdej klatce i mieszkaniec trząsł się w miejscu.
    if (this.panic > 0) {
      this.panic -= dt;
      this.wiggle += dt * 3.2;
      this.yaw = this.fleeYaw + Math.sin(this.wiggle) * 0.35;
      this.walking = true;
      this.moveAndAnimate(dt, world, player, 3.2);
      return;
    }
    const threat = this.nearestHostile(allies, 9);
    if (threat) {
      const dx = b.pos.x - threat.body.pos.x;
      const dz = b.pos.z - threat.body.pos.z;
      this.yaw = Math.atan2(dx, dz);
      this.walking = true;
      this.soundTimer = Math.min(this.soundTimer, 0.2);
      this.moveAndAnimate(dt, world, player, 3.2);
      return;
    }
    this.aiTimer -= dt;
    const dx = this.home.x - b.pos.x;
    const dz = this.home.z - b.pos.z;
    const dist = Math.hypot(dx, dz);
    if (this.aiTimer <= 0) {
      this.aiTimer = 1.6 + Math.random() * 4;
      if (dist > 14 || Math.random() < 0.3) this.yaw = Math.atan2(dx, dz) + (Math.random() - 0.5) * 0.9;
      else this.yaw = Math.random() * Math.PI * 2;
      this.walking = Math.random() < 0.7;
    }
    this.moveAndAnimate(dt, world, player, this.walking ? 1.35 : 0);
    if (this.hurtTime <= 0 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + dt * 0.35);
  }

  /**
   * Żelazny golem: patroluje okolicę i atakuje potwory. Gdy gracz skrzywdzi
   * mieszkańca, golem bierze go na cel (provoked > 0).
   */
  private updateGolem(dt: number, world: World, player: THREE.Vector3, allies: Mob[], onAttack: (dmg: number, mob: Mob) => void): void {
    const b = this.body;
    if (this.provoked > 0) this.provoked = Math.max(0, this.provoked - dt);

    const playerDist = Math.hypot(player.x - b.pos.x, player.z - b.pos.z);
    if (this.provoked > 0 && playerDist < 20) {
      this.yaw = Math.atan2(player.x - b.pos.x, player.z - b.pos.z);
      this.walking = playerDist > 1.9;
      if (playerDist < 2.4 && this.attackCooldown <= 0) {
        this.attackCooldown = 1.5;
        onAttack(6, this);
      }
      this.moveAndAnimate(dt, world, player, this.walking ? 3.3 : 0);
      return;
    }

    // 2.26: golem najpierw oddaje temu, kto go uderzył, a potem szuka
    // najgroźniejszego potwora – także takiego, który atakuje mieszkańca
    // dalej od golema (wcześniej „nie reagował”, bo liczył tylko odległość
    // od siebie i gubił wrogów zajętych wioską).
    let target: Mob | null = this.retaliate && !this.retaliate.dead ? this.retaliate : null;
    if (target && target.body.pos.distanceTo(b.pos) > 40) target = null;
    if (!target) {
      let bestScore = Infinity;
      for (const o of allies) {
        if (o === this || o.dead || !isHostileMob(o.type)) continue;
        const d = o.body.pos.distanceTo(b.pos);
        if (d > 32) continue;
        let defends = false;
        for (const v of allies) {
          if (v.type !== 'villager' || v.dead) continue;
          if (v.body.pos.distanceTo(o.body.pos) < 9) { defends = true; break; }
        }
        const score = d - (defends ? 18 : 0);
        if (score < bestScore) { bestScore = score; target = o; }
      }
    }
    if (target) {
      const dx = target.body.pos.x - b.pos.x;
      const dz = target.body.pos.z - b.pos.z;
      const d = Math.hypot(dx, dz);
      this.yaw = Math.atan2(dx, dz);
      const stop = target.body.w / 2 + 0.9;
      this.walking = d > stop;
      if (d <= stop + 0.7 && this.attackCooldown <= 0) {
        this.attackCooldown = 1.35;
        if (target.damage(7, b.pos.x, b.pos.z, this)) {
          // ciężki cios odrzuca cel (o ile nie ma pełnego oporu)
          if (target.kbResistance < 1) {
            target.body.vel.x *= 1.7;
            target.body.vel.z *= 1.7;
            target.body.vel.y = Math.max(target.body.vel.y, 6);
            target.kbTime = Math.max(target.kbTime, 0.5);
          }
          // raz trafiony – koniec zemsty, wracamy do patrolu
          this.retaliate = null;
        }
      }
      this.moveAndAnimate(dt, world, player, this.walking ? 3.3 : 0);
      return;
    }

    this.aiTimer -= dt;
    const hx = this.home.x - b.pos.x;
    const hz = this.home.z - b.pos.z;
    if (this.aiTimer <= 0) {
      this.aiTimer = 2 + Math.random() * 5;
      if (Math.hypot(hx, hz) > 18 || Math.random() < 0.4) this.yaw = Math.atan2(hx, hz) + (Math.random() - 0.5) * 1.2;
      else this.yaw = Math.random() * Math.PI * 2;
      this.walking = Math.random() < 0.55;
    }
    this.moveAndAnimate(dt, world, player, this.walking ? 1.6 : 0);
    if (this.hurtTime <= 0 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + dt * 0.2);
  }

  private updateTamed(dt: number, world: World, player: THREE.Vector3, allies: Mob[], onBite: (mob: Mob, wolf: Mob) => void): void {
    const b = this.body;
    // pick a target: hostile, within 16 of the wolf, within 24 of the player
    let target: Mob | null = null;
    let best = 16;
    for (const o of allies) {
      if (o === this || o.dead || !isHostileMob(o.type)) continue;
      if (o.body.pos.distanceTo(player) > 24) continue;
      const d = o.body.pos.distanceTo(b.pos);
      if (d < best) { best = d; target = o; }
    }
    if (target) {
      const dx = target.body.pos.x - b.pos.x, dz = target.body.pos.z - b.pos.z;
      this.yaw = Math.atan2(dx, dz);
      const stop = target.body.w / 2 + 0.7;
      if (best <= stop) {
        this.walking = false;
        if (this.attackCooldown <= 0) {
          this.attackCooldown = 1.1;
          onBite(target, this);
        }
      } else {
        this.walking = true;
      }
    } else {
      // Loyal pet: stay at the player's feet; only a short, occasional stroll
      // when right next to them.
      const dx = player.x - b.pos.x, dz = player.z - b.pos.z;
      const dist = Math.hypot(dx, dz);
      if (dist > 1.6) {
        this.yaw = Math.atan2(dx, dz);
        this.walking = true;
      } else {
        this.walking = false; // sit at the player's feet
        this.aiTimer -= dt;
        if (this.aiTimer <= 0) {
          this.aiTimer = 2 + Math.random() * 4;
          this.walking = Math.random() < 0.3;
          this.yaw = Math.random() * Math.PI * 2;
        }
      }
      if (this.hurtTime <= 0) this.health = Math.min(this.maxHealth, this.health + dt * 0.5);
    }
    this.moveAndAnimate(dt, world, player, this.walking ? 4.6 : 0);
  }

  /** Blok wełny w kolorze tego runa (owca zawsze ma swój kolor). */
  get woolBlock(): number {
    return woolBlockFor(this.woolColor);
  }

  /** Removes a sheep's wool once. Returns false if it was already sheared or isn't a sheep. */
  shear(): boolean {
    if (this.type !== 'sheep' || this.dead || this.sheared) return false;
    this.sheared = true;
    // 2.18: wełna to osobny model – wystarczy go schować.
    for (const part of this.woolParts) part.visible = false;
    if (this.woolMesh) {
      const skin = snapToPalette(0xd8c8b0);
      this.woolMesh.material = mobMaterial('sheep-face', skin).clone();
    }
    return true;
  }

  /**
   * 2.21.1: owca po zjedzeniu trawy odrasta – w wanilii dzieje się to po
   * wypasie (klocek trawy zamienia się w ziemię, runo wraca).
   */
  regrowWool(): boolean {
    if (this.type !== 'sheep' || !this.sheared) return false;
    this.sheared = false;
    for (const part of this.woolParts) part.visible = true;
    return true;
  }

  /**
   * 2.27: lekkie rozsuwanie mobów, jak waniliowe `pushEntities`.
   *
   * Mieszkańcy kręcą się wokół tej samej studni i potrafili wejść sobie
   * w model – dwa nachodzące na siebie modele wyglądają jak drżenie.
   * Zamiast przesuwać pozycję (co mogło wepchnąć moba w ścianę) dokładamy
   * delikatny impuls prędkości, który `stepBody` normalnie rozwiązuje
   * z kolizjami. Odrzut (`kbTime`) ma pierwszeństwo – wtedy nie ruszamy.
   */
  pushAway(allies: Mob[], dt: number): void {
    if (this.dead || this.kbTime > 0) return;
    const b = this.body;
    let px = 0, pz = 0;
    for (const o of allies) {
      if (o === this || o.dead) continue;
      // Tylko moby na podobnej wysokości – pająk pod nogami nie popycha.
      if (o.body.pos.y + o.body.h < b.pos.y + 0.2 || o.body.pos.y > b.pos.y + b.h - 0.2) continue;
      const dx = b.pos.x - o.body.pos.x;
      const dz = b.pos.z - o.body.pos.z;
      const min = (b.w + o.body.w) * 0.45;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      const d = Math.sqrt(d2) || 0.001;
      // Im głębiej wchodzą w siebie, tym mocniejszy impuls – ale ograniczony.
      const k = Math.min(1, (min - d) / Math.max(0.2, min));
      px += (dx / d) * k;
      pz += (dz / d) * k;
    }
    const len = Math.hypot(px, pz);
    if (len < 1e-4) return;
    const cap = Math.min(1, len);
    // Przyspieszenie do ~5 bloku/s² – wystarczy, żeby się rozeszli, ale nie
    // szarpie modelem (wcześniej próba pozycyjna wpychała moby w ściany).
    b.vel.x += (px / len) * cap * 5 * dt;
    b.vel.z += (pz / len) * cap * 5 * dt;
    // Rozsuwanie nie może rozkręcić moba na boki – prędkość zostaje mała.
    const sp = Math.hypot(b.vel.x, b.vel.z);
    if (sp > 2.2) {
      b.vel.x = (b.vel.x / sp) * 2.2;
      b.vel.z = (b.vel.z / sp) * 2.2;
    }
  }

  update(
    dt: number,
    world: World,
    player: THREE.Vector3,
    onAttack: (dmg: number, mob: Mob) => void,
    onShoot: (mob: Mob) => void,
    peaceful: boolean,
    allies: Mob[] = [],
    onBite: (mob: Mob, wolf: Mob) => void = () => {}
  ) {
    const b = this.body;
    this.pushAway(allies, dt);
    if (this.hurtTime > 0) {
      this.hurtTime -= dt;
      if (this.hurtTime <= 0 && !this.dead) this.setTint(false);
    }
    if (this.dead) {
      this.deathTime += dt;
      this.group.rotation.z = Math.min(Math.PI / 2, this.deathTime * 6);
      return;
    }
    this.attackCooldown -= dt;
    this.soundTimer -= dt;

    if (this.tamed) {
      this.updateTamed(dt, world, player, allies, onBite);
      return;
    }
    if (this.type === 'villager') {
      this.updateVillager(dt, world, player, allies);
      return;
    }
    if (this.type === 'golem') {
      this.updateGolem(dt, world, player, allies, onAttack);
      return;
    }

    let speed = this.type === 'zombie' ? 2.15 : this.type === 'creeper' ? 2.05 : this.type === 'spider' ? 2.7 : this.type === 'skeleton' ? 2.0 : this.type === 'chicken' ? 1.35 : this.type === 'wolf' ? 1.6 : this.type === 'enderman' ? 3.2 : this.type === 'slime' ? 2.0 : this.type === 'ghast' ? 1.5 : 1.2;
    const dx = player.x - b.pos.x, dz = player.z - b.pos.z;
    const dist = Math.hypot(dx, dz);
    const hostile = this.type === 'zombie' || this.type === 'creeper' || this.type === 'spider' || this.type === 'skeleton' || this.type === 'enderman' || this.type === 'slime' || this.type === 'ghast';

    if (this.fuse > 0) {
      this.fuse -= dt;
      this.walking = false;
      this.setFlash(Math.floor(this.fuse * 8) % 2 === 0);
      this.group.scale.setScalar(1 + Math.sin(this.fuse * 18) * 0.05);
      if (this.fuse <= 0 && !this.dead) {
        this.exploded = true;
        this.dead = true;
        this.deathTime = 0;
        this.group.scale.setScalar(1);
      }
    } else if (hostile && dist < (this.type === 'creeper' ? 14 : this.type === 'skeleton' ? 18 : this.type === 'ghast' ? 32 : 24) && Math.abs(player.y - b.pos.y) < (this.type === 'ghast' ? 24 : 8) && !peaceful) {
      this.yaw = Math.atan2(dx, dz);
      if (this.type === 'skeleton' || this.type === 'ghast') {
        // ranged: keep its distance and shoot when it has a clear line
        const tooClose = dist < (this.type === 'ghast' ? 10 : 5.5);
        this.walking = dist > (this.type === 'ghast' ? 18 : 12) || tooClose;
        if (tooClose) this.yaw = Math.atan2(-dx, -dz);
        if (dist < (this.type === 'ghast' ? 28 : 16) && this.attackCooldown <= 0 && this.hasLineOfSight(world, player.x, player.y + 0.9, player.z)) {
          this.attackCooldown = this.type === 'ghast' ? 3 + Math.random() * 1.5 : 2 + Math.random() * 1.2;
          onShoot(this);
        }
      } else {
        this.walking = this.type === 'creeper' ? dist > 2.1 : dist > 0.9;
        if (this.type === 'spider' && dist < 1.5 && Math.abs(player.y - b.pos.y) < 1.4 && this.attackCooldown <= 0) {
          this.attackCooldown = 1;
          onAttack(3, this);
        }
        if ((this.type === 'zombie' || this.type === 'enderman' || this.type === 'slime') && dist < 1.6 && Math.abs(player.y - b.pos.y) < 2.2 && this.attackCooldown <= 0) {
          this.attackCooldown = this.type === 'enderman' ? 0.8 : 1;
          onAttack(this.type === 'enderman' ? 6 : this.type === 'slime' ? 2 : 3, this);
          if (this.type === 'enderman' && Math.random() < 0.3) {
            // teleport
            this.body.pos.x += (Math.random() - 0.5) * 8;
            this.body.pos.z += (Math.random() - 0.5) * 8;
          }
          if (this.type === 'slime') {
            this.body.vel.y = 6;
          }
        }
        if (this.type === 'creeper' && dist < 2.15 && Math.abs(player.y - b.pos.y) < 2) {
          this.fuse = 1.35;
          this.walking = false;
        }
      }
    } else {
      if (this.type === 'creeper') this.group.scale.setScalar(1);
      this.aiTimer -= dt;
      if (this.aiTimer <= 0) {
        this.aiTimer = 2 + Math.random() * 5;
        this.walking = Math.random() < 0.6;
        this.yaw = Math.random() * Math.PI * 2;
      }
      if (this.hurtTime > 0 || (this.aiTimer > 0 && this.health < this.maxHealth && !hostile)) speed *= 1.8;
      // slime hopping
      if (this.type === 'slime' && this.body.onGround && this.walking) {
        this.body.vel.y = 5 + Math.random() * 2;
      }
      // ghast floating
      if (this.type === 'ghast') {
        this.body.vel.y += (Math.sin(performance.now() * 0.001 + this.home.x) * 0.5 - this.body.vel.y) * dt * 2;
      }
    }
    // 2.21.1: owca co kilkanaście sekund opuszcza głowę i skubie trawę.
    // Ostrzyżona owca po wypasie odrasta – klocek trawy zamienia się w ziemię,
    // dokładnie jak w `SheepEntity.eatGrass`.
    if (this.type === 'sheep' && !this.dead) {
      if (this.grazing <= 0) {
        this.grazeTimer -= dt;
        if (this.grazeTimer <= 0 && b.onGround) {
          this.grazeTimer = 10 + Math.random() * 14;
          this.grazing = 1;
          this.walking = false;
          if (this.sheared) {
            const gx = Math.floor(b.pos.x), gz = Math.floor(b.pos.z), gy = Math.floor(b.pos.y) - 1;
            if (world.peekBlock(gx, gy, gz) === B.GRASS) {
              world.setBlock(gx, gy, gz, B.DIRT);
              this.regrowWool();
            }
          }
        }
      } else {
        this.grazing = Math.max(0, this.grazing - dt / 2.2);
        this.walking = false;
      }
    }

    this.moveAndAnimate(dt, world, player, this.walking && this.hurtTime < 0.3 ? speed : 0);
  }

  /** 2.25: obrót części = poza z modelu + to, co dokłada animacja. */
  private pose(o: THREE.Object3D, x: number, y: number, z: number): void {
    const b = this.baseRot.get(o);
    if (b) o.rotation.set(b.x + x, b.y + y, b.z + z);
    else o.rotation.set(x, y, z);
  }

  /**
   * 2.25: animacja kończyn. Publiczna, bo testy sprawdzają nią, czy każdy mob
   * zachowuje pozę z modelu (zombie nie chowa rąk za plecami, pająk nie
   * prostuje nóg, mieszkaniec nie opuszcza złożonych dłoni).
   */
  animateLimbs(swing: number): void {
    if (this.legs.length === 4) {
      this.pose(this.legs[0], swing, 0, 0);
      this.pose(this.legs[3], swing, 0, 0);
      this.pose(this.legs[1], -swing, 0, 0);
      this.pose(this.legs[2], -swing, 0, 0);
    } else if (this.legs.length === 8) {
      for (let i = 0; i < 8; i++) {
        this.pose(this.legs[i], Math.sin(this.walkPhase + (i % 2 ? Math.PI : 0) + Math.floor(i / 4) * 0.6) * swing, 0, 0);
      }
    } else if (this.legs.length === 2) {
      this.pose(this.legs[0], swing, 0, 0);
      this.pose(this.legs[1], -swing, 0, 0);
      if (this.type === 'chicken' && this.arms.length) {
        const flap = Math.sin(this.walkPhase * 2) * 0.45;
        this.pose(this.arms[0], 0, 0, 0.4 + flap);
        this.pose(this.arms[1], 0, 0, -0.4 - flap);
      } else if (this.arms.length) {
        // 2.20: tylko zombie trzyma ręce wyciągnięte do przodu.
        // 2.25: pozycja „do przodu” siedzi w modelu (baza), a animacja dokłada
        // tylko lekkie kołysanie – wcześniej nadpisywała bazę i ręce zombie
        // wychodziły do tyłu.
        if (this.type === 'zombie') {
          this.pose(this.arms[0], Math.sin(this.walkPhase * 0.5) * 0.08, 0, 0);
          this.pose(this.arms[1], -Math.sin(this.walkPhase * 0.5) * 0.08, 0, 0);
        } else {
          const armSwing = swing * 0.55;
          this.pose(this.arms[0], -armSwing, 0, 0);
          this.pose(this.arms[1], armSwing, 0, 0);
        }
      }
    }
  }

  /**
   * Shared movement + physics (gravity, water, collisions, wall hops) and
   * walking animation. `speed` > 0 steers the body toward `this.yaw` at that
   * rate; 0 applies ground friction instead.
   */
  private moveAndAnimate(dt: number, world: World, player: THREE.Vector3, speed = 0): void {
    const b = this.body;
    // 2.26: odrzut. Przez ~0,45 s mob leci i NIE steruje ruchem – inaczej
    // pościg natychmiast zjadał prędkość ciosu i „odepchnięcie” było
    // ledwo widoczne (zombie wracał na gracza w kilku klatkach).
    if (this.kbTime > 0) {
      this.kbTime = Math.max(0, this.kbTime - dt);
      const drag = Math.max(0, 1 - dt * (b.onGround ? 4.5 : 3.5));
      b.vel.x *= drag;
      b.vel.z *= drag;
    } else if (speed > 0) {
      const tx = Math.sin(this.yaw) * speed, tz = Math.cos(this.yaw) * speed;
      b.vel.x += (tx - b.vel.x) * Math.min(1, dt * 10);
      b.vel.z += (tz - b.vel.z) * Math.min(1, dt * 10);
    } else if (b.onGround) {
      b.vel.x *= Math.max(0, 1 - dt * 10);
      b.vel.z *= Math.max(0, 1 - dt * 10);
    }
    const inWater = RENDER[world.peekBlock(Math.floor(b.pos.x), Math.floor(b.pos.y + 0.4), Math.floor(b.pos.z))] === 2;
    if (inWater) {
      b.vel.y = Math.min(b.vel.y + 20 * dt, 2.5);
    } else {
      b.vel.y -= 28 * dt;
      if (b.vel.y < -40) b.vel.y = -40;
    }
    const wasWall = b.hitWall;
    stepBody(world, b, dt);
    if (this.type === 'spider' && !inWater && (b.hitWall || wasWall) && this.walking) {
      // Spiders climb: a low ledge is a hop, a real wall is crawled up while the
      // player is above it (the body stays flush against the face, so rising is
      // free) – `climbing` keeps the crawl going between frames.
      // 2.22: sonda sięga od krawędzi pudełka, a nie od środka – pająk ma
      // 1,4 bloku szerokości i przy ścianie stał tuż przed nią, więc
      // 0,7-blokowa sonda trafiała w powietrze i nie zaczynał się wspinać.
      const reach = b.w / 2 + 0.35;
      const fx = Math.floor(b.pos.x + Math.sin(this.yaw) * reach), fz = Math.floor(b.pos.z + Math.cos(this.yaw) * reach);
      const hy = Math.floor(b.pos.y);
      const at = (dy: number) => IS_SOLID[world.peekBlock(fx, hy + dy, fz)];
      const wallFace = at(0); // the wall keeps going as long as its face is solid
      if (wallFace && player.y > b.pos.y + 1.2 && (b.onGround || this.climbing)) {
        b.vel.y = 3.6;
        this.climbing = true;
      } else if (b.onGround && at(1) && !at(2)) {
        b.vel.y = 6.5; // a single ledge is just a hop
        this.climbing = false;
      } else if (!wallFace) {
        this.climbing = false;
      }
    }
    // 2.27: stabilny chód przy przeszkodzie.
    //
    // Sonda sięga teraz od KRAWĘDZI ciała, a nie od środka. Przy szerokim
    // mieszkańcu (0,6 bloku) stary promień 0,8 bloku od środka przeskakiwał
    // płot, o który się opierał, więc kod „widział” powietrze i wykonywał
    // skok w miejscu. Skok i obrót mają też własny czas odnowienia: wcześniej
    // `vel.y = 8.2` oraz obrót o π/2 dokładały się w KAŻDEJ klatce, przez co
    // mieszkaniec podskakiwał i trząsł się przy ścianie.
    this.jumpCooldown = Math.max(0, this.jumpCooldown - dt);
    this.turnCooldown = Math.max(0, this.turnCooldown - dt);
    const reach = b.w / 2 + 0.3;
    const fx = Math.floor(b.pos.x + Math.sin(this.yaw) * reach);
    const fz = Math.floor(b.pos.z + Math.cos(this.yaw) * reach);
    const hy = Math.floor(b.pos.y);
    const front = world.peekBlock(fx, hy, fz);
    // Wanilia: mieszkaniec i żelazny golem nie skaczą – omijają przeszkodę.
    const canHop = this.type !== 'villager' && this.type !== 'golem';
    // A climbing spider keeps its heading: it must not turn away mid-wall.
    if ((b.hitWall || wasWall) && b.onGround && this.walking && !(this.type === 'spider' && this.climbing)) {
      if (!canHop) {
        // Mieszkaniec i golem nie skaczą – po prostu zawracają, i to łagodnie
        // (ok. 90–110°), żeby obrót nie wyglądał jak szarpnięcie.
        if (this.turnCooldown <= 0) {
          this.yaw += (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + Math.random() * 0.35);
          this.turnCooldown = 0.7;
        }
      } else if (front === B.FENCE || isDoor(front)) {
        if (this.turnCooldown <= 0) {
          this.yaw += Math.PI * (0.45 + Math.random() * 0.3);
          this.turnCooldown = 0.7;
        }
      } else if (IS_SOLID[front] && !IS_SOLID[world.peekBlock(fx, hy + 1, fz)] && !IS_SOLID[world.peekBlock(fx, hy + 2, fz)] && this.jumpCooldown <= 0) {
        // Tylko niski stopień (jeden blok) – i najwyżej raz na pół sekundy.
        b.vel.y = 8.2;
        this.jumpCooldown = 0.55;
      } else if (this.type !== 'zombie' && this.turnCooldown <= 0) {
        this.yaw += Math.PI / 2;
        this.turnCooldown = 0.7;
      }
    }
    // avoid walking into water / cliffs (passive mobs) – najwyżej raz na 0,8 s,
    // inaczej losowy obrót co klatkę wyglądał jak drżenie modelu.
    if (this.type !== 'zombie' && this.type !== 'creeper' && this.type !== 'skeleton' && this.walking && b.onGround && this.turnCooldown <= 0) {
      const cfx = Math.floor(b.pos.x + Math.sin(this.yaw) * (b.w / 2 + 0.4));
      const cfz = Math.floor(b.pos.z + Math.cos(this.yaw) * (b.w / 2 + 0.4));
      const cfy = Math.floor(b.pos.y);
      const below = world.peekBlock(cfx, cfy - 1, cfz);
      const below2 = world.peekBlock(cfx, cfy - 2, cfz);
      if (below === B.WATER || below === B.LAVA || (!IS_SOLID[below] && !IS_SOLID[below2])) {
        this.yaw += (Math.random() < 0.5 ? -1 : 1) * (Math.PI / 2 + Math.random() * 0.5);
        this.turnCooldown = 0.8;
      }
    }

    // animation (spiders scuttle faster, and fastest while climbing)
    const hs = Math.hypot(b.vel.x, b.vel.z);
    const gait = this.type === 'spider' ? (this.climbing ? 6.5 : 4.4) : 3.2;
    this.walkPhase += hs * dt * gait;
    const swing = Math.sin(this.walkPhase) * Math.min(1, hs / 1.5) * 0.7;
    this.animateLimbs(swing);
    this.group.position.copy(b.pos);
    // smooth rotation
    let diff = this.yaw - this.group.rotation.y;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    this.group.rotation.y += diff * Math.min(1, dt * 8);

    // 2.18: głowa odwraca się w stronę gracza, gdy ten jest blisko – tak jak
    // w grze. Kąt jest ograniczony, żeby mob nie skręcał karku na plecy.
    let dip = 0;
    if (this.headCanTurn && !this.dead && this.head) {
      const toPlayer = Math.atan2(player.x - b.pos.x, player.z - b.pos.z);
      let rel = toPlayer - this.group.rotation.y;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const dist = Math.hypot(player.x - b.pos.x, player.z - b.pos.z);
      // Przód modelu to lokalne −Z, a korzeń jest obrócony o π, więc kąt
      // głowy dodaje się do kąta ciała: głowa patrzy tam, gdzie `g + h`.
      // Wcześniej stało tu `-rel`, przez co golem (i każdy mob) odwracał
      // głowę dokładnie w drugą stronę.
      const want = dist < 12 ? Math.max(-0.9, Math.min(0.9, rel)) : 0;
      this.headYaw += (want - this.headYaw) * Math.min(1, dt * 6);
    } else {
      this.headYaw += (0 - this.headYaw) * Math.min(1, dt * 6);
    }

    // 2.21.1: wypas – głowa zjeżdża w dół i przechyla się do trawy
    // (waniliowe `getNeckAngle`/`getHeadAngle`), a potem wraca do góry.
    if (this.type === 'sheep' && this.head) {
      dip = this.grazing > 0 ? Math.sin(Math.PI * (1 - this.grazing)) : 0;
      this.head.position.y = this.headBaseY - dip * (9 / 16);
    }
    // 2.25: obrót głowy to baza z modelu + (wygładzony obrót w stronę gracza,
    // przechył przy wypasie) – żadna z tych wartości nie kasuje drugiej.
    if (this.head) this.pose(this.head, dip * 0.62, this.headYaw, 0);
  }

  /** Cheap visibility test used by the skeleton before it shoots. */
  hasLineOfSight(world: World, tx: number, ty: number, tz: number): boolean {
    const sx = this.body.pos.x, sy = this.body.pos.y + this.body.h * 0.85, sz = this.body.pos.z;
    const dx = tx - sx, dy = ty - sy, dz = tz - sz;
    const d = Math.hypot(dx, dy, dz);
    const steps = Math.max(1, Math.ceil(d * 2));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (IS_OPAQUE[world.peekBlock(Math.floor(sx + dx * t), Math.floor(sy + dy * t), Math.floor(sz + dz * t))]) return false;
    }
    return true;
  }

  // Ray-AABB intersection distance
  rayHit(o: THREE.Vector3, d: THREE.Vector3, maxDist: number): number | null {
    const b = this.body;
    const hw = b.w / 2 + 0.1;
    const min = [b.pos.x - hw, b.pos.y, b.pos.z - hw];
    const max = [b.pos.x + hw, b.pos.y + b.h, b.pos.z + hw];
    const oo = [o.x, o.y, o.z], dd = [d.x, d.y, d.z];
    let tmin = 0, tmax = maxDist;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(dd[i]) < 1e-8) {
        if (oo[i] < min[i] || oo[i] > max[i]) return null;
      } else {
        let t1 = (min[i] - oo[i]) / dd[i], t2 = (max[i] - oo[i]) / dd[i];
        if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
        tmin = Math.max(tmin, t1);
        tmax = Math.min(tmax, t2);
        if (tmin > tmax) return null;
      }
    }
    return tmin;
  }

  dispose() {
    this.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        (mesh.material as THREE.Material).dispose();
      }
    });
  }
}
