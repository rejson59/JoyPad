/**
 * BlockCraft 2.28 – „mods wbudowane”: wydajność renderowania i symulacji.
 *
 * Wszystkie reguły, które da się policzyć bez GPU, siedzą w tym module
 * (czyste funkcje + mały automat), żeby testy headless sprawdzały je
 * dokładnie tak, jak działają w grze. Silnik (engine.ts) tylko je woła.
 *
 * Odpowiedniki modów do Minecrafta:
 *  • `chunkBuildScore` / `sortChunkOffsets` – Sodium: budowa chunków
 *    w kolejności „najpierw to, co widać” (bliżej i na wprost kamery),
 *    zamiast po samym promieniu.
 *  • `entityTickInterval` / `shouldTickEntity` – Entity Culling: moby
 *    daleko od gracza aktualizują AI i fizykę rzadziej, więc setki modeli
 *    nie zjadają klatki.
 *  • `lodRing` – Distant Horizons: tanie pasmo terenu w oddali.
 *  • `FrameGovernor` – automatyczna regulacja jakości (jak presety
 *    w Sodium/ImmediatelyFast): mierzy czas klatki i dobiera budżet.
 */

/** Minimalny czas klatki w ms dla danego FPS (0 = bez limitu). */
export function frameBudgetMs(fps: number): number {
  return fps > 0 ? 1000 / fps : 0;
}

/**
 * Wygładzony czas klatki (EMA). `alpha` 0,1 = reaguje w ~10 klatek, więc
 * pojedynczy „zacięty” frame nie zmienia od razu ustawień.
 */
export function smoothFrameMs(prev: number, sample: number, alpha = 0.1): number {
  if (!Number.isFinite(sample) || sample <= 0) return prev;
  if (prev <= 0) return sample;
  return prev + (sample - prev) * alpha;
}

/**
 * Ocena chunka przy budowie siatki (Sodium-like).
 *
 * Im mniejsza wartość, tym szybciej chunk trafia do kolejki. Liczy się
 * odległość od gracza oraz to, czy chunk jest przed kamerą: te z tyłu
 * dostają karę (i tak zaraz znikną z widoku), a te na wprost – premię.
 * `fx`/`fz` to znormalizowany kierunek patrzenia (bez składowej Y).
 */
export function chunkBuildScore(dx: number, dz: number, fx: number, fz: number): number {
  const dist = Math.hypot(dx, dz);
  if (dist < 1e-3) return 0;
  // Rzut na kierunek patrzenia: 1 = dokładnie przed graczem, −1 = za plecami.
  const facing = (dx / dist) * fx + (dz / dist) * fz;
  const penalty = (1 - facing) * 0.9; // do 1,8 „bloku” kary za tył
  return dist + penalty;
}

/**
 * Kolejność budowy chunków: najpierw blisko i na wprost kamery.
 * Zwraca nową tablicę (nie modyfikuje wejścia – silnik trzyma `offsets`
 * jako źródło prawdy).
 */
export function sortChunkOffsets(
  offsets: readonly (readonly [number, number])[],
  fx: number,
  fz: number
): [number, number][] {
  return offsets
    .map(([dx, dz]) => [dx, dz, chunkBuildScore(dx, dz, fx, fz)] as [number, number, number])
    .sort((a, b) => a[2] - b[2])
    .map(([dx, dz]) => [dx, dz] as [number, number]);
}

/**
 * Co ile klatek aktualizować moba (Entity Culling).
 *
 * Blisko gracza (do 32 bloków) – każda klatka, bo tam widać każdy ruch.
 * Dalej (32–64) – co drugą, jeszcze dalej (64–96) – co trzecią, a poza
 * 96 blokami – co szóstą. Gdy mob jest w ogóle poza zasięgiem wzroku,
 * wystarczy mu rzadszy tick – i tak nikt tego nie zobaczy.
 */
export function entityTickInterval(distance: number): number {
  if (distance <= 32) return 1;
  if (distance <= 64) return 2;
  if (distance <= 96) return 3;
  return 6;
}

/** Czy w tej klatce wypada tick moba? `frame` rośnie o 1 co klatkę. */
export function shouldTickEntity(frame: number, distance: number): boolean {
  const interval = entityTickInterval(distance);
  return interval <= 1 || frame % interval === 0;
}

/** Poziom szczegółowości terenu w oddali: im dalej, tym grubsza siatka. */
export function lodStepFor(distance: number): number {
  if (distance <= 160) return 4;
  if (distance <= 320) return 8;
  return 16;
}

/** Zasięg pasma LOD w blokach (Distant Horizons renderuje „za horyzontem”). */
export function lodRange(renderDistance: number, chunkSize: number): number {
  return Math.max(chunkSize * (renderDistance + 2), chunkSize * renderDistance * 4);
}

/**
 * Automat jakości – odpowiednik presetów z modów wydajnościowych.
 *
 * Dostaje czas klatki i zwraca mnożniki, których silnik używa do:
 *  • budżetu budowy chunków (`chunkScale`),
 *  • częstotliwości ticków mobów (`entityScale`),
 *  • zasięgu pasma LOD (`lodScale`).
 *
 * Reguła jest celowo ospała: schodzimy w dół dopiero po ~1,5 s słabych
 * klatek, a wracamy po ~3 s dobrych, żeby obraz nie „pływał”.
 */
export interface PerfProfile {
  /** 0,55 = oszczędnie, 1 = pełna jakość. */
  chunkScale: number;
  /** 1 = normalnie, 2 = moby tickują rzadziej. */
  entityScale: number;
  /** 0,6 = krótsze pasmo LOD, 1 = pełne. */
  lodScale: number;
  /** Etykieta do HUD/dziennika. */
  label: 'oszczędny' | 'zrównoważony' | 'pełny';
}

export const PERF_PROFILES: Record<'eco' | 'balanced' | 'full', PerfProfile> = {
  eco: { chunkScale: 0.55, entityScale: 2, lodScale: 0.6, label: 'oszczędny' },
  balanced: { chunkScale: 0.8, entityScale: 1.5, lodScale: 0.85, label: 'zrównoważony' },
  full: { chunkScale: 1, entityScale: 1, lodScale: 1, label: 'pełny' },
};

export class FrameGovernor {
  /** Wygładzony czas klatki w ms. */
  frameMs = 0;
  /** Bieżący profil. */
  profile: PerfProfile = PERF_PROFILES.full;
  private badFor = 0;
  private goodFor = 0;

  constructor(private readonly targetMs = 1000 / 60) {}

  update(sampleMs: number, dt: number): PerfProfile {
    this.frameMs = smoothFrameMs(this.frameMs, sampleMs, 0.08);
    // Klatka „zła” to wyraźnie więcej niż 60 FPS (albo 30 na telefonie,
    // gdzie i tak nie ma sensu walczyć o więcej).
    const bad = this.frameMs > Math.max(this.targetMs * 1.5, 20);
    const good = this.frameMs < Math.max(this.targetMs * 1.08, 15);
    this.badFor = bad ? this.badFor + dt : 0;
    this.goodFor = good ? this.goodFor + dt : 0;

    if (this.badFor > 1.5) {
      this.badFor = 0;
      this.profile = this.profile === PERF_PROFILES.full
        ? PERF_PROFILES.balanced
        : PERF_PROFILES.eco;
      this.goodFor = 0;
    } else if (this.goodFor > 3) {
      this.goodFor = 0;
      this.profile = this.profile === PERF_PROFILES.eco
        ? PERF_PROFILES.balanced
        : PERF_PROFILES.full;
      this.badFor = 0;
    }
    return this.profile;
  }

  reset() {
    this.frameMs = 0;
    this.badFor = 0;
    this.goodFor = 0;
    this.profile = PERF_PROFILES.full;
  }
}
