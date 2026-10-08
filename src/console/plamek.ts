import type { NavDirection } from './spatialNav';

/**
 * Plamek (ang. Splash) — maskotka sterowania.
 *
 * Model ruchu jest tu, w czystych liczbach, bo to on decyduje, czy plamka „leci"
 * czy „telepie się": fazy, czasy, krzywe i masy. Widok (`Plamek.tsx`) tylko scala
 * liczby z DOM i pisze style. Dzięki temu choreografię można przetestować w node.
 *
 * Skok między przyciskami to rytuał w czterech aktach:
 *   zbieranie (otoczka ścieka w kulkę) → lot (łuk + smuga) → uderzenie (plask + bryzgi)
 *   → rozlanie (kulka wylewa z siebie otoczkę dookoła celu).
 * Kiedy gracz idzie szybko (powtórzenia co ~130 ms), rytuał jest za długi — wtedy
 * Plamek przechodzi w tryb „poślizg": wydłuża się w kierunku ruchu i jedzie bez
 * składania. To wybór, nie kompromis: przy poślizgu wygląda jak kropla na szybie.
 */
export type PlamekPhase = 'hidden' | 'hug' | 'gather' | 'fly' | 'impact' | 'pour' | 'slide';
export type PlamekChoreography = 'ritual' | 'slide';
export type PlamekMood = 'calm' | 'happy' | 'zoom' | 'boom' | 'curious' | 'sleepy';
export type PlamekEvent = 'show' | 'retarget' | 'phaseDone' | 'hide' | 'select' | 'back' | 'poke';

export interface PlamekTiming {
  /** Ile otoczka ścieka się w kulkę. Krócej niż krok powtórzenia, inaczej zgrzyt. */
  gatherMs: number;
  flyBaseMs: number;
  /** Sekundy na piksel lotu — daleki cel to dłuższy lot, ale nie nieskończony. */
  flyPerPx: number;
  flyMaxMs: number;
  impactMs: number;
  /** Kulka wylewa otoczkę dookoła celu. Tu jest największy luz czasowy. */
  pourMs: number;
  /** Ile klatek po zdarzeniu jeszcze mierzymy cel (morfing karty, przewijanie raila). */
  followFrames: number;
  /** „Nie ma dalej" — błysk otoczki, gdy krok w ścianę. */
  blockMs: number;
  /** Poślizg: czas jednej „jazdy" otoczki bez składania. */
  slideMs: number;
  gripMs: number;
  pourSpread: number;
  hopGraceMs: number;
  hideDelayMs: number;
  /** O ile dół ramki czeka na zejście się strug. */

  /** Czas pulsu po domknięciu obwódkę. */
  fuseMs: number;
  /** Zapas wokół łącznego obrysu farby, jaki dostaje region maski goo. */
  gooPad: number;
  /** Przerwa między komendami, poniżej której rytuał nie ma sensu. */
  ritualGapMs: number;
  /** Tyle szybkich kroków z rzędu kończy rytuał na rzecz poślizgu. */
  slideAfterSteps: number;
  /** Okno liczenia „szybkich kroków". */
  burstWindowMs: number;
  blinkEveryMs: [number, number];
  blinkMs: number;
  /** Skłon głowy przed ruchem: ile trwa, zanim odpuści. */
  leanMs: number;
  /** Próg, po którym Plamek zasypia w bezruchu (i kłania się po pierwszym ruchu). */
  napAfterMs: number;
}

export const PLAMEK: PlamekTiming = {
  gatherMs: 170,
  flyBaseMs: 240,
  flyPerPx: .55,
  flyMaxMs: 560,
  impactMs: 150,
  pourMs: 330,
  /** Ile po wylaniu otoczka DOKLEJA się do przycisku (monotonicznie, bez odbicia). */
  gripMs: 200,
  /** O ile dalej niż cel wylewa się farba, żeby ją było co ściągać. */
  pourSpread: 9,
  /** Tyle trzyma się „ostatni kształt", żeby powrót z okienka też był skokiem. */
  hopGraceMs: 900,
  /** Opóźnienie znikania: focusout -> focusin to ten sam obrót fokusa, nie zniknięcie. */
  hideDelayMs: 160,
  /** Jak długo po domknięciu pulsuje obwódka (jedno tchnięcie, nie pętla). */
  fuseMs: 340,
  gooPad: 48,
  followFrames: 30,
  blockMs: 220,
  leanMs: 240,
  slideMs: 240,
  ritualGapMs: 150,
  slideAfterSteps: 3,
  burstWindowMs: 640,
  blinkEveryMs: [2600, 6200],
  blinkMs: 150,
  napAfterMs: 24_000,
};

/**
 * Wygładzanie RUCHU, nie sprężyna. Świadomie bez sztywności i tłumienia: model
 * dokleja się do celu stałą czasową (jak kropla na szybie), więc nie ma
 * „odbicia od ściany" ani drgań — a przy 120 Hz nie przyspiesza dwa razy, bo
 * liczy się `dt`, nie liczba klatek (poprzednia wersja na wysokim odświeżaniu
 * sprawiała wrażenie sztywnej właśnie dlatego).
 *
 * Stałe w milisekundach: ile trwa dojechanie w 63% dystansu.
 */
export const PLAMEK_SMOOTH = {
  /** Krawędzie otoczki w spoczynku. */
  edge: 118,
  /** Krawędź wiodąca i tylnia w poślizgu — stąd bierze się lepkie wydłużenie. */
  edgeLead: 76,
  edgeTrail: 196,
  radius: 140,
  head: 88,
  size: 132,
  gaze: 96,
  /** Poniżej tego dystansu uznajemy, że Plamek dojechał — i pętla gaśnie. */
  restPx: .35,
};

/** Egspomencjalny pościg: `1 - e^(-dt/tau)` nigdy nie przeskakuje celu. */
export function smoothTo(from: number, to: number, tauMs: number, dtMs: number) {
  const tau = Math.max(1, tauMs);
  return from + (to - from) * (1 - Math.exp(-Math.max(0, dtMs) / tau));
}

/**
 * Jak bardzo otoczka jest „w rozciągnięciu" (0 = przylega, 1 = leci daleko).
 * To z tej liczby rodzi się okrągłość: im większe napięcie, tym bardziej kształt
 * zbliża się do pigułki/kropli, a nie do prostokąta z zaokrąglonymi rogami.
 */
export function gooTension(live: Edges, target: Edges): number {
  const w = Math.abs(live.x1 - live.x0), h = Math.abs(live.y1 - live.y0);
  const tw = Math.abs(target.x1 - target.x0), th = Math.abs(target.y1 - target.y0);
  const dw = Math.abs(tw - w) / Math.max(64, tw, w);
  const dh = Math.abs(th - h) / Math.max(64, th, h);
  const ox = Math.abs((live.x0 + live.x1 - target.x0 - target.x1) / 2) / 96;
  const oy = Math.abs((live.y0 + live.y1 - target.y0 - target.y1) / 2) / 96;
  return clamp01(Math.max(dw, dh, ox, oy) * 1.15);
}

/** Promień otoczki: w spoczynku przylega do przycisku, w ruchu zaokrągla się do pigułki. */
export function haloRadiusFor(short: number, restRadius: number, tension: number) {
  const pill = short / 2;
  return lerp(Math.min(restRadius, pill), pill, clamp01(tension * 1.2));
}

/**
 * Kształt kulki: w bezruchu koło, w ruchu CROKLA — jeden róg zostaje ostry
 * i patrzy do tyłu (smuga wychodzi z niego). Rotacja jest na osobnej warstwie
 * niż twarz, więc buźka nigdy nie jedzie na bakier.
 */
export function ballShapeFor(vx: number, vy: number, speedPx: number) {
  if (speedPx < .8) return { deg: 0, sharp: 50 };
  const angle = Math.atan2(vy, vx) * (180 / Math.PI);
  const amount = Math.min(1, speedPx / 16);
  // Ostry róg patrzy wstecz: lokalnie jest w rogu dolno-lewym (135°).
  return { deg: angle + 45, sharp: 50 - 42 * amount };
}

/** Skłon przed ruchem (pomysł „buźka czyta intencję"): kierunek komendy, jeszcze przed skokiem. */
export function leanFor(direction: NavDirection | null, amount: number) {
  const unit = direction === 'left' ? [-1, 0] : direction === 'right' ? [1, 0]
    : direction === 'up' ? [0, -1] : direction === 'down' ? [0, 1] : [0, 0];
  return { x: unit[0] * amount, y: unit[1] * amount };
}

/** Gdzie patrzy Plamek: ruch wygrywa z skłonem, ale skłon nie znika gwałtownie. */
export function dominantGaze(motion: Point, lean: Point, max = 3.2): Point {
  const moving = Math.hypot(motion.x, motion.y) > .4;
  const base = moving ? motion : lean;
  const len = Math.hypot(base.x, base.y);
  if (len < .01) return { x: 0, y: 0 };
  const k = Math.min(max, len) / len;
  return { x: base.x * k, y: base.y * k };
}
/** Ile farby zachodzi ZA krawędź przycisku. 5 px, nie 7: pierścień ma dotykać
 *  elementu (oblewać go), a nie wisieć obok niego jak ramka selekcji. */
export const PLAMEK_INFLATE = 5;

/**
 * Grubość farby dobrana do elementu, nie stała. Stałe 7.5 px było za grube na
 * chipie 26 px (taśma grubości dwóch `border`-ów zjadała treść) i za cienkie na
 * kaflu biblioteki, który z kanapy ma wyglądać na oblany. Liczymy więc od
 * krótszego boku z klamrami: dół trzyma czytelność na telewizorze, góra nie pozwala
 * zabrudzić małego przycisku. `k = .115` znaczy „nie więcej niż ~1/9 elementu",
 * a przy `aniso.bottom` (1.55) dół kałuży ma max ~17% wysokości — wciąż mniej niż
 * połowa, więc napis nadal jest widoczny w całości.
 */
export const paintWeightFor = (box: Box, k = .115, min = 2.8, max = 9.5): number => {
  const short = Math.min(box.width, box.height);
  return Math.max(min, Math.min(max, short * k));
};

/**
 * Czy na górnej krawędzi jest płaski odcinek, na którym garb ma sens. `1` na pasku i kaflu,
 * `0` na ikonce-kole (30 × 30): na kole garb dokłada materiał tam, gdzie rant już się zaokrągla,
 * i zamiast kropli wychodzi jajko. Dla `0` widok rezygnuje z garbu, a główkę rysuje krążkiem
 * zlanym z pierścienia przez maskę goo — to nadal jedno ciało, tylko bez zgrubienia u góry.
 */
export const crownFor = (box: Box): number =>
  clamp01((box.width / Math.max(1, box.height) - 1) / 1.2);

/** Gdzie na obwodzie ma siedzieć główka: nad przyciskiem czy pod nim (ta sama decyzja,
 *  którą podjął `perchFor`, tylko wyrażona jako parametr łuku). */
export const lobeAtFor = (side: 'top' | 'bottom'): number => (side === 'bottom' ? .5 : 0);
/** Smuga: im większy lag, tym bledszy, mniejszy i bardziej rozmazany ślad (pozory motion blur). */
export const PLAMEK_TRAIL = [
  { tau: 34, scale: .92, alpha: .30, blur: .2 },
  { tau: 62, scale: .82, alpha: .22, blur: .5 },
  { tau: 92, scale: .70, alpha: .15, blur: .9 },
  { tau: 124, scale: .58, alpha: .09, blur: 1.3 },
  { tau: 158, scale: .46, alpha: .05, blur: 1.8 },
] as const;

export const clamp01 = (value: number) => (value < 0 ? 0 : value > 1 ? 1 : value);
export const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

export const easeInCubic = (t: number) => { const x = clamp01(t); return x * x * x; };
export const easeOutQuint = (t: number) => { const x = 1 - clamp01(t); return 1 - x * x * x * x * x; };
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * clamp01(t)) - 1) / 2;
/** Przekroczenie i powrót — bez tego „rozlanie" wyglądałoby jak zwykłe skalowanie. */
export function easeOutBack(t: number, overshoot = 1.9) {
  const x = clamp01(t) - 1;
  return 1 + (overshoot + 1) * x * x * x + overshoot * x * x;
}

export interface Box { left: number; top: number; width: number; height: number; radius: number }

export const boxCenter = (box: Box) => ({ x: box.left + box.width / 2, y: box.top + box.height / 2 });

/**
 * Język ruchu: czy pełny rytuał, czy poślizg. `gapMs` to odstęp od poprzedniego
 * kroku, `steps` — ile kroków wpadło w ostatnim oknie. Rytuał tylko wtedy, gdy
 * gracz faktycznie celuje; przy ciągnięciu gałki liczy się potok.
 */
export function chooseChoreography(gapMs: number, steps: number, reduced = false): PlamekChoreography {
  if (reduced) return 'slide';
  if (steps >= PLAMEK.slideAfterSteps) return 'slide';
  return gapMs >= PLAMEK.ritualGapMs ? 'ritual' : 'slide';
}

/** Czasy trwania faz. Lot skaluje się dystansem, więc krótki skok nie jest szarpany. */
export function phaseDuration(phase: PlamekPhase, distancePx = 0): number {
  switch (phase) {
    case 'gather': return PLAMEK.gatherMs;
    case 'fly': return Math.min(PLAMEK.flyMaxMs, PLAMEK.flyBaseMs + distancePx * PLAMEK.flyPerPx);
    case 'impact': return PLAMEK.impactMs;
    case 'pour': return PLAMEK.pourMs;
    case 'hug':
    case 'slide': return PLAMEK.slideMs;
    case 'hidden': return 0;
  }
}

/**
 * Sekwencja po zdarzeniu. Uwaga na `retarget` w trakcie `fly`: nie zaczynamy od
 * nowa — cel zostaje podmieniony w locie, bo inaczej szybkie powtórzenia wyglądałyby
 * jak zacinająca się kula.
 */
export function advancePhase(phase: PlamekPhase, event: PlamekEvent): PlamekPhase {
  switch (event) {
    case 'show': return phase === 'hidden' ? 'hug' : phase;
    case 'hide': return 'hidden';
    case 'retarget':
      if (phase === 'hidden') return 'hug';
      // W locie tylko przekierowujemy — faza zostaje.
      if (phase === 'fly' || phase === 'impact') return phase;
      return phase === 'gather' || phase === 'slide' ? phase : 'gather';
    case 'phaseDone':
      return phase === 'gather' ? 'fly'
        : phase === 'fly' ? 'impact'
          : phase === 'impact' ? 'pour'
            : phase === 'pour' ? 'hug'
              : phase === 'slide' ? 'hug' : phase;
    case 'select':
    case 'back':
    case 'poke':
      return phase === 'hidden' ? phase : 'hug';
  }
}

/** Czy faza ma swój czas (i sama się kończy), czy trwa, dopóki sprężyna nie odpocznie. */
export function isTimed(phase: PlamekPhase) {
  return phase === 'gather' || phase === 'fly' || phase === 'impact' || phase === 'pour' || phase === 'slide';
}

/**
 * Nabranie oddechu przed zebraniem: najpierw 6% przestrzeni na zewnątrz, potem
 * skurcz. Bez tego otoczka znikałaby „na płasko", jak wygaszany border.
 */
export function gatherCurve(t: number) {
  const x = clamp01(t);
  const breath = x < .18 ? Math.sin((x / .18) * Math.PI) * .06 : 0;
  return breath + easeInCubic((x - .06) / .94);
}

/**
 * Rozlanie: minimalne przekroczenie celu (~3%) i miękkie dotknięcie krawędzi.
 * Wcześniej było 7% — i to wyglądało jak odbicie sprężyny, nie jak farba.
 */
export function pourCurve(t: number) {
  const x = clamp01(t);
  return Math.min(1.03, easeOutBack(x, x < .5 ? 1.25 : .8)) * easeOutQuint(x * .94);
}

/**
 * Jak bardzo otoczka jest „zrobiona z kulki": grubość i nieprzezroczystość.
 * Ta sama farba na krótszym obwodzie musi grubieć — to nie dekoracja, to zachowanie masy.
 */
export function haloAppearance(mode: 'gather' | 'pour' | 'hug', progress: number) {
  const t = clamp01(progress);
  if (mode === 'gather') return { alpha: 1 - t * t, thickness: 2 + 4.4 * t };
  if (mode === 'pour') return { alpha: .55 + .45 * t, thickness: 2 + 5.4 * (1 - t) };
  return { alpha: 1, thickness: 2 };
}

/**
 * Cel lotu = dokładnie to miejsce, w którym główka siada. Dawniej kulka leciała w
 * środkowiec krawędzi bocznej („ruch w prawo => lewa krawędź"), a potem zjeżdżała do
 * góry — widać było POPRAWKĘ po lądowaniu, nie lądowanie. Jedno źródło prawdy dla
 * startu, lotu i postoju nie pozwala im się rozjechać.
 */
export function landFor(direction: NavDirection | null, box: Box, headR = 0, roomAbove = box.top): Point {
  const { x, y } = perchFor(direction, box, headR, roomAbove);
  return { x, y };
}

export interface Edges { x0: number; y0: number; x1: number; y1: number }
export const edgesToBox = (e: Edges): Box => ({
  left: Math.min(e.x0, e.x1), top: Math.min(e.y0, e.y1),
  width: Math.max(0, Math.abs(e.x1 - e.x0)), height: Math.max(0, Math.abs(e.y1 - e.y0)), radius: 0,
});
export const boxToEdges = (box: Box): Edges => ({ x0: box.left, y0: box.top, x1: box.left + box.width, y1: box.top + box.height });
/** Box powiększony na zewnątrz o `px` — to jest „oblej przycisk i ściągnij". */
export const inflateEdges = (e: Edges, px: number): Edges => ({ x0: e.x0 - px, y0: e.y0 - px, x1: e.x1 + px, y1: e.y1 + px });

export interface Point { x: number; y: number }
export const pointDistance = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

/** Kierunek ruchu między dwoma boxami — oś dominująca, ta sama logika co na analogu. */
export function dirBetween(from: Box, to: Box): NavDirection | null {
  const a = boxCenter(from), b = boxCenter(to);
  const dx = b.x - a.x, dy = b.y - a.y;
  if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return null;
  return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}

/** Łuk lotu: kulka podskakuje prostopadle do kierunku, a nie leci linijką. */
export function arcControl(a: Point, b: Point, hopPx = 1): Point {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Wektor prostopadły, zawsze „do góry" ekranu — skok wygląda jak podskoczenie.
  let nx = -dy / len, ny = dx / len;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const bulge = Math.min(66, 14 + len * .21) * (hopPx || 1);
  return { x: (a.x + b.x) / 2 + nx * bulge, y: (a.y + b.y) / 2 + ny * bulge };
}

export function quadPoint(a: Point, c: Point, b: Point, t: number): Point {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/**
 * Rozciągnięcie od prędkości — z ZACHOWANIEM OBJĘTOŚCI (`short = 1/long`), bo farba
 * jest nieściśliwa. Dawniej skracaliśmy o 55% długości, więc kropla „puchła" i to
 * wyglądało jak sprężyna, nie jak ciecz.
 */
export function squashFrom(speedPx: number, cap = .3) {
  const long = 1 + Math.min(cap, Math.abs(speedPx) / 40);
  return { long, short: 1 / long };
}

/**
 * Drganie kształtu (nie pozycji!) — wygaszony oscylator, którym Plamek „drży" po
 * uderzeniu i po skręcie. Pozycja nigdy nie przekracza celu, więc nie ma sprężystego
 * podskoku; jest za to bezwładność farby, o którą chodzi.
 */
export interface Wobble { amp: number; at: number }
export const WOBBLE = { tauMs: 210, periodMs: 132 };
export function wobbleValue(w: Wobble, now: number) {
  const age = Math.max(0, now - w.at);
  // Ujemna amplituda jest celowa: to kiwnięcie (spłaszczenie), a nie wygaszony błęd.
  if (Math.abs(w.amp) < 1e-4 || age > WOBBLE.tauMs * 3) return 0;
  return w.amp * Math.exp(-age / WOBBLE.tauMs) * Math.cos((age / WOBBLE.periodMs) * Math.PI * 2);
}
export function wobbleKick(w: Wobble, amount: number, now: number): Wobble {
  // Nowe uderzenie nie zeruje starego — suma z przewagą tego świeższego.
  const carry = wobbleValue(w, now) * .35;
  return { amp: Math.max(-.3, Math.min(.3, amount + carry)), at: now };
}

/** Jak bardzo otoczka jest jeszcze „na wierzchu" celu w trakcie doklejania. */
export function gripOffset(ageMs: number, ms = PLAMEK.gripMs) {
  const t = clamp01(ageMs / ms);
  return PLAMEK.pourSpread * (1 - t) * (1 - t);
}

/** Spoczynek głowy nad przyciskiem = oczy patrzą w dół, na napis. Bez tego kulka
 *  „patrzy w sufit" i traci cały sens bycia maskotką celu. */
export const gazeBiasFor = (side: PerchSide) => (side === 'top' ? { x: 0, y: 1.1 } : { x: 0, y: -1.1 });

/**
 * Oblewanie przycisku. Farba wlewa się TAM, gdzie siedzi główka (na górnej krawędzi),
 * rozdziela na DWIE strugi, które schodzą po bokach, i domyka się pod spodem — więc
 * obrys nie „zapala się" cały naraz, tylko zarasta. `wrapFor` to jedna liczba 0…1:
 * ile OBWODU (łamana długość łuku, nie kąt!) jest już zalane. Widok podaje ją do
 * `bandEdges`, a ten rysuje taśmę farby — maski CSS już tu nie ma i nic nie musi
 * degradować: kształt jest po prostu wyciągnięty do połowy, więc fronty mają
 * zamknięte, okrągłe czoła.
 */
export function wrapCurve(t: number) {
  const x = clamp01(t);
  // Do trzech czwartych lewania strugi schodzą po bokach (przyspieszają), potem ostatnia
  // ćwiartka czasu idzie już tylko na to, żeby zeszły się pod środkiem.
  if (x < .75) return Math.pow(x / .75, 1.5) * .8;
  return .8 + .2 * ((x - .75) / .25);
}

export function wrapFor(phase: PlamekPhase, progress: number) {
  if (phase === 'pour') return wrapCurve(progress);
  // Ucieczka jest tym samym ruchem w tył: farba cofa się po bokach do główki.
  if (phase === 'gather') return 1 - Math.pow(clamp01(progress), 1.2);
  if (phase === 'hug') return 1;
  return 0;
}

/**
 * Rozlanie NIE jest symetryczne: farba wlewa się na górę, więc tam tylko muska krawędź,
 * po bokach rozlewa się szeroko, a POD przyciskiem zbiera się kałuża. Symetryczne
 * „+9 px na wszystkie cztery strony" było głównym powodem, dla którego to wyglądało
 * jak ramka, a nie jak zalany przedmiot.
 */
export function pourEdges(target: Edges, spread: number, progress: number): Edges {
  const k = 1 - clamp01(progress);
  return {
    x0: target.x0 - spread * k, y0: target.y0 - spread * .35 * k,
    x1: target.x1 + spread * k, y1: target.y1 + spread * 1.55 * k,
  };
}

/**
 * Kropla pod domykającym się obwodem: wisi, a potem daje się wciągnąć z powrotem
 * (napięcie powierzchniowe). Pełny sinus — start i koniec to zero, więc nie zostaje
 * ani jeden piksel farby poniżej przycisku.
 */
/**
 * Kropla zwisająca z dolnej krawędzi taśmy. Rozmiar bierze z GRUBOŚCI FARBY, nie z główki:
 * przy 5-px obwódce „kropla" miała 4 px i nie było jej widać (stąd „jaka kropla?").
 * Wisieje od .42 domknięcia (kiedy strugi już zeszły po bokach), pełnię osiąga w trzech
 * czwartych, a potem daje się wciągnąć z powrotem — przed zwarciem nie ma jej już wcale.
 */
export function dripTail(box: Box, wrap: number, thickness: number, wob = 0) {
  const w = clamp01(wrap);
  if (w < .42 || w >= 1) return null;
  const arc = Math.sin(Math.pow(clamp01((w - .42) / .58), .82) * Math.PI);
  const hang = arc * (1 + Math.abs(wob) * .7);
  const height = Math.min(box.height * .55, thickness * 1.9 * hang);
  if (height < 3) return null;
  const center = boxCenter(box);
  return {
    x: center.x, y: box.top + box.height + thickness * .55,
    width: Math.max(5, thickness * (1.32 - .42 * Math.min(1, hang))), height,
    alpha: Math.min(1, .6 + hang * .4), swell: hang,
  };
}

/* --- ciecz: JEDEN ciągły kształt, nie obwódka plus kulka -------------------

   Recenzja rundy 6: „kulka nie wnika w pierścień, tylko na nim staje" i „to nie rozlew,
   a osobne lasso zarzucone na przycisk". Dopóki farba jest *obwódką* (CSS-owy `border`)
   plus *osobnym kołem*, żaden filtr tego nie zbawi — dwa elementy HTML mogą co najwyżej
   na siebie nachodzić. Dlatego obrys celu jest teraz taśmą farby o realnej grubości,
   a główka jest jej **wybrzuszeniem**: jednym podścięciem tej samej ścieżki. Kształt liczymy
   z krzywej Lamé (superelipsa), a przesuwamy ją wzdłuż normalnej, więc taśma ma wszędzie
   tyle samo farby (nie jest „powiększonym boxem") i sama z siebie jest okrągła. */

export interface RimPoint extends Point { nx: number; ny: number }

/** Obwód zaokrąglonego prostokąta w pikselach (`r` już sklejony z boków). */
export function rimPerimeter(width: number, height: number, r: number) {
  const rad = Math.max(0, Math.min(r, Math.min(width, height) / 2));
  return 2 * Math.max(0, width - rad * 2) + 2 * Math.max(0, height - rad * 2) + 2 * Math.PI * rad;
}

/**
 * Punkt obrysu celu po DŁUGOŚCI ŁUKU wraz z normalną. `u = 0` to środek górnej krawędzi
 * (tam, gdzie siedzi główka), dalej zgodnie z ruchem wskazówek zegara; `u` zawija się do [0,1).
 * Fronty liczymy łukiem, nie kątem: przy kącie struga pędziłaby po długiej krawędzi i pełzła
 * przy krótkiej — to czytało się jako „lasso zarzucone na przycisk", a nie jako ciecz.
 */
export function rimPoint(box: Box, u: number): RimPoint {
  const W = Math.max(2, box.width), H = Math.max(2, box.height);
  const rad = Math.max(0, Math.min(box.radius, Math.min(W, H) / 2));
  const cx = box.left + W / 2, cy = box.top + H / 2;
  const right = box.left + W, bottom = box.top + H;
  const sw = Math.max(0, W - rad * 2), sh = Math.max(0, H - rad * 2);
  const arc = (Math.PI / 2) * rad;
  const at = (x: number, y: number, r: number, from: number, sweep: number): RimPoint => {
    const th = from + sweep, c = Math.cos(th), si = Math.sin(th);
    return { x: x + c * r, y: y + si * r, nx: c, ny: si };
  };
  // Zaczynamy od środka górnej krawędzi i idziemy zgodnie z ruchem wskazówek: dzięki temu
  // `u = 0` to dokładnie to miejsce, gdzie siada główka, a fronty przy `wrap` są lustrzane.
  const segs: { len: number; at: (t: number) => RimPoint }[] = [
    { len: sw / 2, at: (t) => ({ x: cx + t, y: box.top, nx: 0, ny: -1 }) },
    { len: arc, at: (t) => at(right - rad, box.top + rad, rad, -Math.PI / 2, (Math.PI / 2) * (t / (arc || 1))) },
    { len: sh, at: (t) => ({ x: right, y: box.top + rad + t, nx: 1, ny: 0 }) },
    { len: arc, at: (t) => at(right - rad, bottom - rad, rad, 0, (Math.PI / 2) * (t / (arc || 1))) },
    { len: sw, at: (t) => ({ x: right - rad - t, y: bottom, nx: 0, ny: 1 }) },
    { len: arc, at: (t) => at(box.left + rad, bottom - rad, rad, Math.PI / 2, (Math.PI / 2) * (t / (arc || 1))) },
    { len: sh, at: (t) => ({ x: box.left, y: bottom - rad - t, nx: -1, ny: 0 }) },
    { len: arc, at: (t) => at(box.left + rad, box.top + rad, rad, Math.PI, (Math.PI / 2) * (t / (arc || 1))) },
    { len: sw / 2, at: (t) => ({ x: cx - sw / 2 + t, y: box.top, nx: 0, ny: -1 }) },
  ];
  const P = segs.reduce((sum, seg) => sum + seg.len, 0) || 1;
  let walked = (((u % 1) + 1) % 1) * P, i = 0;
  while (i < segs.length - 1 && walked > segs[i].len) { walked -= segs[i].len; i++; }
  const seg = segs[i];
  if (seg.len <= 0) return { x: cx, y: cy - H / 2, nx: 0, ny: -1 };
  return seg.at(Math.min(walked, seg.len));
}

export interface BandOptions {
  /** Ujemny = taśma wchodzi tyle pikseli DO ŚRODKA obrysu celu (czepia się go). */
  inset: number;
  /** Bazowa grubość naważenia (na zewnątrz obrysu), w pikselach. */
  spread: number;
  /** Anizotropia: farba opada, więc dół zbiera więcej niż góra. */
  aniso: { top: number; side: number; bottom: number };
  /** 0..1 — ile obwodu jest zalane (dwa fronty schodzą się pod spodem). */
  wrap: number;
  /** Jak wielkie wybrzuszenie robi główka (0 = oderwana, 1 = siedzi na taśmie). */
  lobe: number;
  /** Szerokość wybrzuszenia w pikselach łuku. */
  lobeWidth: number;
  /** Jak głęboko farba została wciągnięta tam, skąd główka startowała. */
  dent: number;
  /** Wysokość bulwy w pikselach: tyle główka wystaje ponad taśmę (0 = brak główki). */
  lobeSize: number;
  /** Fala rantu (dygot kształtu) i jej faza. Gęstość próbek dobiera sam `bandEdges`. */
  wob: number;
  spin: number;
  /** Gdzie na obwodzie siedzi główka: 0 = górna krawędź (standard), `.5` = dolna, gdy
   *  maskotka musi przesiąść się pod przycisk. Garb musi iść ZA główką, inaczje farba
   *  puchnie tam, gdzie żadnej główki nie ma — i wychodzi jajko z buźką na dole. */
  lobeAt?: number;
}

/**
 * Krawędzie taśmy farby: zewnętrzna = obrys + grubość (anizotropia × fala rantu + bulwa),
 * wewnętrzna = obrys - uchwyt. Jedna ścieżka, więc NIE MA czego scalać — główka jest częścią
 * obrysu, a nie osobnym elementem nachodzącym na pierścień.
 */
export function bandEdges(box: Box, o: BandOptions): { outer: Point[]; inner: Point[] } {
  const P = rimPerimeter(box.width, box.height, box.radius);
  const outer: Point[] = [], inner: Point[] = [];
  const wrap = clamp01(o.wrap);
  // Krok równy w pikselach łuku: fala i bulwa mają ten sam rozmiar na kafelku i na małym
  // przycisku (przy stałej liczbie próbek na obwodzie mikroprzycisk dostawał 6 punktów).
  // Krok w pikselach łuku, parzysta liczba próbek => szczyt bulwy ZAWSZE trafia w próbkę
  // (Catmull-Rom nie zjada wtedy garbu). Limit trzyma koszt `d` na ramkę w ryzach.
  const steps = Math.max(24, Math.min(72, 2 * Math.round(((P * wrap) / 8 + 2) / 2)));
  // Odległość w pikselach łuku od główki (zawinięcie: najkrótsza droga po obwodzie).
  const at = o.lobeAt ?? 0;
  const arcDist = (uu: number) => {
    const d = Math.abs(uu - at);
    return (d > .5 ? 1 - d : d) * P;
  };
  const bell = (uu: number) => {
    if (o.lobe <= 0 && o.dent <= 0) return 0;
    const sig = Math.max(6, o.lobeWidth);
    return Math.exp(-((arcDist(uu) ** 2) / (2 * sig * sig)));
  };
  for (let i = 0; i <= steps; i++) {
    const uu = wrap >= .999 ? -.5 + (i / steps) : -wrap / 2 + wrap * (i / steps);
    const p = rimPoint(box, uu);
    const up = clamp01(-p.ny), down = clamp01(p.ny);
    const an = o.aniso;
    const k = an.side + (an.top - an.side) * up + (an.bottom - an.side) * down;
    const wave = 1 + o.wob * (.5 * Math.sin(uu * Math.PI * 16 + o.spin * Math.PI * 2)
      + .26 * Math.sin(uu * Math.PI * 26 - o.spin * Math.PI * 3.4));
    const b = bell(uu);
    // Bulwa: główka JEST wybrzuszeniem tej samej ścieżki (nie osobnym kołem obok pierścienia).
    // Dent: w miejscu, z którego farba została wciągnięta, taśma cienieje, a nie puchnie.
    const out = Math.max(1.5, o.spread * k * wave + b * (o.lobeSize * o.lobe + o.spread * .6) - b * o.dent * (o.spread * 1.7 + o.lobeSize * .8));
    const grip = Math.max(1, -o.inset + b * o.spread * .55 * o.lobe);
    // Tryb 2 drgania: obydwie krawędzie jadą razem, więc ciało CAŁE się odkształca
    // (galareta), a nie tylko grubość powłoki faluje.
    const jig = o.wob * 4.5 * Math.sin(uu * Math.PI * 4 + o.spin * Math.PI * 2);
    outer.push({ x: p.x + p.nx * (out + jig), y: p.y + p.ny * (out + jig) });
    inner.push({ x: p.x - p.nx * (grip - jig), y: p.y - p.ny * (grip - jig) });
  }
  return { outer, inner };
}


/** Taśma jako jedna zamknięta ścieżka: zewnętrzna → zaokrąglony front → wewnętrzna (odwrotnie)
 *  → drugi front. Fronty są zaokrąglone, bo na czole strugi farba jest najgrubsza. */
export function ribbonPath(outer: Point[], inner: Point[]): string {
  if (outer.length < 2 || inner.length < 2) return '';
  const cap = (from: Point, to: Point, dir: Point) => {
    const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2;
    const r = Math.max(1, Math.hypot(to.x - from.x, to.y - from.y) / 2);
    const ax = Math.atan2(from.y - my, from.x - mx);
    const sign = Math.cos(Math.atan2(dir.y, dir.x) - ax) > 0 ? 1 : -1;
    const pts: Point[] = [];
    for (let i = 1; i < 4; i++) {
      const a = ax + sign * (i / 4) * Math.PI;
      pts.push({ x: mx + Math.cos(a) * r, y: my + Math.sin(a) * r });
    }
    return pts;
  };
  const near = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y) < .6;
  const tailDir = { x: outer[outer.length - 1].x - outer[outer.length - 2].x, y: outer[outer.length - 1].y - outer[outer.length - 2].y };
  const headDir = { x: inner[0].x - inner[1].x, y: inner[0].y - inner[1].y };
  // Przy pełnym domknięciu oba końce są tym samym punktem — bez szwu i bez czapki.
  const closed = near(outer[outer.length - 1], inner[inner.length - 1]) && near(inner[0], outer[0])
    ? outer.concat(inner.slice().reverse())
    : outer.concat(cap(outer[outer.length - 1], inner[inner.length - 1], tailDir),
      inner.slice().reverse(), cap(inner[0], outer[0], headDir));
  return smoothLoop(closed);
}

/** Wygładzona pętla: Catmull-Rom → beziera. Bez tego przy wyłączonym filtrze widać było
 *  pięćdziesiąt prostych segmentów zamiast obrysu. */
export function smoothLoop(pts: Point[]): string {
  const n = pts.length;
  if (n < 3) return n ? `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}z` : '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    d += `C${(p1.x + (p2.x - p0.x) / 6).toFixed(1)} ${(p1.y + (p2.y - p0.y) / 6).toFixed(1)}`
      + ` ${(p2.x - (p3.x - p1.x) / 6).toFixed(1)} ${(p2.y - (p3.y - p1.y) / 6).toFixed(1)}`
      + ` ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d + 'z';
}

/**
 * Raster farby: zachowujemy sprawdzony próg scalania (także dla delikatnej smugi),
 * a wygładzamy dopiero jego wynik. Dzięki temu łagodniejsza krawędź nie wymaga
 * osłabienia całej smugi ani rozmywania twarzy. Obwódka powstaje z rozmycia po
 * scaleniu farby, zamiast z prostokątnego jądra `feMorphology`.
 */
export const PLAMEK_WET = {
  /** Siła scalania taka jak przed poprawką. */
  blurGain: 2.2,
  ramp: 18, offset: -6,
  /** Wygładzenie PO progu, w pikselach urządzenia, nie rozmycie całej maskotki.
   *  Pół piksela urządzenia: przy .4 krawędź była ostra, ale na telewizorze (gęstość 2,
   *  duża skala) zostawały schodki; powyżej ~.8 farba zaczyna „płynąć” i traci kontur. */
  edgeAaPx: .5,
  /** Keyline: σ obrastania, liczone z grubości farby (zasada z tury 8: względnie, nie stałe). */
  rimBase: 1.5, rimK: .11, rimMin: 1.4, rimMax: 2.4,
  rimRamp: 6, rimOffset: -1,
} as const;

/** Ile rozmycia dostaje farba przy danym `wet` (0..1). */
export const wetBlur = (wet: number) => clamp01(wet) * PLAMEK_WET.blurGain;

/** Gęstość ekranu i skala okienka przeliczają piksel urządzenia na jednostkę SVG. */
export const edgeAaFor = (pixelRatio = 1, scale = 1) => PLAMEK_WET.edgeAaPx /
  (Math.max(1, Math.min(4, Number.isFinite(pixelRatio) ? pixelRatio : 1))
    * Math.max(.2, Math.min(4, Number.isFinite(scale) ? scale : 1)));

/** Siła rozmycia obwódki, rosnąca z grubością farby i ograniczona na dużych kaflach. */
export const rimSwellFor = (weight: number) => Math.min(PLAMEK_WET.rimMax,
  Math.max(PLAMEK_WET.rimMin, PLAMEK_WET.rimBase + Math.max(0, weight) * PLAMEK_WET.rimK));

/**
 * Połysk mokrej farby: rozmycie ROŚNIE z rozmiarem bulwy (ta sama zasada, co przy
 * grubości farby — względnie, nie stałe). Stałe 1.4 px na kaflu telewizora wyglądało
 * jak naklejka, a na małym chipie jak brud; stąd proporcja z klamrami.
 */
export const sheenBlurFor = (blobRadius: number) =>
  Math.max(1, Math.min(3.2, Math.max(0, blobRadius) * .085));

/**
 * Cień kontaktowy pod farbą: to on „kładzie" kleks na szkle. Przesunięcie i rozmycie
 * idą za grubością farby, a krycie zostaje niskie — cień ma sugerować odległość od
 * powierzchni, nie rysować drugiej obwódki. Wartości w pikselach CSS.
 */
export const contactShadowFor = (weight: number) => {
  const w = Math.max(0, weight);
  return {
    dy: Math.max(4, Math.min(10, 3 + w * .5)),
    blur: Math.max(14, Math.min(30, 12 + w * 1.5)),
  };
};

/** Macierz `feColorMatrix`: RGB bez zmian, alfa przez rampę (to scala kształty). */
export const alphaMatrix = (ramp: number, offset: number) =>
  `1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${ramp} ${offset}`;

/** Ta sama robota dla masek jednowymiarowych (keyline potrzebuje tylko kanału alfa). */
export const maskMatrix = (ramp: number, offset: number) =>
  `0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 ${ramp} ${offset}`;

/**
 * Mokrość: minimum .3 w spoczynku, wzrost podczas lotu i rozlewania.
 * `dryIn` wygasza nadmiar do tej podłogi. Ograniczony ruch wyłącza filtr całkowicie.
 */
export function gooStrength(tension: number, phase: PlamekPhase, reduced = false, dryIn = 0) {
  if (reduced || phase === 'hidden') return 0;
  const flow = phase === 'gather' || phase === 'fly' || phase === 'impact' || phase === 'pour' ? .62 : 0;
  const heat = Math.min(1, Math.max(0, tension) * .9 + flow) * (1 - clamp01(dryIn));
  return Math.max(.3, heat);
}

/**
 * Bulwa: kulka w locie i resztka na starym przycisku. Półosie to `r*sx` / `r*sy` — dokładnie
 * te same odwrotności, które liczy `squashFrom`, więc kształt zachowuje pole i nigdy nie
 * „puchnie" przy kiwnięciu. `tail` (w pikselach) wyciąga TYŁ: farba urwana z przycisku
 * ma ogon, a nie jest kołem.
 */
export function blobPath(cx: number, cy: number, r: number, angleDeg: number, sx = 1, sy = 1, tail = 0, wob = 0, spin = 0): string {
  const rad = Math.max(1.5, r), ang = (angleDeg * Math.PI) / 180;
  const steps = 24, pts: Point[] = [];
  const cos = Math.cos(ang), sin = Math.sin(ang);
  const kx = Math.max(.25, sx), ky = Math.max(.25, sy);
  for (let i = 0; i < steps; i++) {
    const th = (i / steps) * Math.PI * 2;
    const along = Math.cos(th), across = Math.sin(th);
    const behind = Math.max(0, -along);
    const pull = 1 + (Math.max(0, tail) / rad) * .9 * Math.pow(behind, 1.7);
    const wobk = 1 + wob * .14 * Math.sin(3 * th + spin * Math.PI * 2);
    const x = along * rad * kx * pull * wobk, y = across * rad * ky * wobk;
    pts.push({ x: cx + x * cos - y * sin, y: cy + x * sin + y * cos });
  }
  return smoothLoop(pts);
}

/** Kropla jako podścieżka tego samego materiału — dzięki masce goo łączy się z taśmą
 *  szyjką, więc wygląda na ciecz wisiącą na cieczy, a nie na „kropkę pod spodem". */
export function teardropPath(x: number, y: number, w: number, h: number, swell = 1): string {
  const ww = Math.max(2, w), hh = Math.max(2, h), bell = ww * (.52 + clamp01(swell) * .16);
  const p = (a: number, b: number) => `${a.toFixed(1)} ${b.toFixed(1)}`;
  return `M${p(x, y - hh * .12)}C${p(x + bell, y + hh * .3)} ${p(x + ww / 2, y + hh * .74)} ${p(x, y + hh)}`
    + `C${p(x - ww / 2, y + hh * .74)} ${p(x - bell, y + hh * .3)} ${p(x, y - hh * .12)}z`;
}

/** Szyja między dwoma ciałami: zwęża się do półowy cieńszego, więc napięcie ma gdzie pęknąć. */
export function neckPath(x0: number, y0: number, w0: number, x1: number, y1: number, w1: number, pinch = 0): string {
  const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
  const tx = dx / len, ty = dy / len, nx = -ty, ny = tx;
  const a = Math.max(.5, w0 / 2), b = Math.max(.5, w1 / 2);
  const waist = Math.max(.4, Math.min(a, b) * (.52 - .5 * clamp01(pinch)));
  const pts: Point[] = [];
  const cap = (cx: number, cy: number, r: number, dir: number) => {
    for (let i = 0; i <= 3; i++) {
      const ang = (i / 3) * Math.PI - Math.PI / 2;
      // Półkole wokół końca: od normalnej przez styczną (w kierunku, w którym farba ucieka).
      pts.push({ x: cx + (nx * Math.cos(ang) + tx * Math.sin(ang) * dir) * r, y: cy + (ny * Math.cos(ang) + ty * Math.sin(ang) * dir) * r });
    }
  };
  pts.push({ x: x0 + nx * a, y: y0 + ny * a });
  pts.push({ x: (x0 + x1) / 2 + nx * waist, y: (y0 + y1) / 2 + ny * waist });
  pts.push({ x: x1 + nx * b, y: y1 + ny * b });
  cap(x1, y1, b, 1);
  pts.push({ x: (x0 + x1) / 2 - nx * waist, y: (y0 + y1) / 2 - ny * waist });
  pts.push({ x: x0 - nx * a, y: y0 - ny * a });
  cap(x0, y0, a, -1);
  return smoothLoop(pts);
}

/** Kierunek, w którym Plamek patrzy: prędkość ruchu, wygładzona do kilku pikseli. */
export function lookOffset(vx: number, vy: number, max = 2.6) {
  const len = Math.hypot(vx, vy);
  if (len < .5) return { x: 0, y: 0 };
  const k = Math.min(max, len / 9) / len;
  return { x: vx * k, y: vy * k };
}

/** Którą stronę przycisku zajmuje główka. */
export type PerchSide = 'top' | 'bottom';

/** O ile główka WCHODZI w obwódkę. Zero znaczy „wisi milimetr nad nią" i wygląda jak
 *  naklejka; dwa piksele znaczy, że farba jednego kształtu dotyka farby drugiego. */
export const PERCH_SINK = 2;

/** Nad przyciskiem musi zmieścić się cała kulka, zapas oddechu i kreska obwódki.
 *  Nie mieści się (pierwszy rząd przy krawędzi ekranu, nagłówek okienka) — siada pod. */
export function perchSide(box: Box, headR: number, roomAbove = box.top): PerchSide {
  return roomAbove >= headR * 2 + PLAMEK_INFLATE + 2 ? 'top' : 'bottom';
}

/** Przechył w stronę, w którą Plamek się nastawił — wciąż NAD przyciskiem, tylko
 *  pochylony. Szeroki kafel dostaje więcej miejsca, wąski przycisk nic. */
export const perchLean = (direction: NavDirection | null, box: Box) =>
  direction === 'left' ? -Math.min(9, box.width * .14)
    : direction === 'right' ? Math.min(9, box.width * .14) : 0;

/**
 * Gdzie siada główka: ZAWSZE nad przyciskiem (centrum o własny promień ponad górną
 * krawędzią, lekko wtopione w obwódkę) — nigdy na dole ani z boku, bo to jedyna
 * strona, na której twarz nie koliduje z tym, co pod spodem, i jedyna, z której
 * kulka patrzy NA napis. Awaryjnie dół, gdy nie ma miejsca.
 */
export function perchFor(direction: NavDirection | null, box: Box, headR = 0, roomAbove = box.top) {
  const side = perchSide(box, headR, roomAbove);
  const center = boxCenter(box);
  const y = side === 'top' ? box.top - headR + PERCH_SINK : box.top + box.height + headR - PERCH_SINK;
  return { x: center.x + perchLean(direction, box), y, side };
}

/**
 * Stałe czasowe na krawędziach, nie na wymiarach: krawędź wiodąca ma KRÓTSZY czas
 * dojechania niż tylnia, więc otoczka wydłuża się w kierunku ruchu i sama wraca do
 * shape'u celu. To jest ten „kleks na szybie" — bez skalowania (skala rozciągnęłaby
 * grubość obwódki) i bez sprężyny (sprężyna podskakuje na końcu).
 */
export function edgeTau(direction: NavDirection | null, slide: boolean) {
  const mid = PLAMEK_SMOOTH.edge;
  const lead = slide ? PLAMEK_SMOOTH.edgeLead : mid;
  const trail = slide ? PLAMEK_SMOOTH.edgeTrail : mid;
  return {
    x0: direction === 'right' ? trail : direction === 'left' ? lead : mid,
    x1: direction === 'right' ? lead : direction === 'left' ? trail : mid,
    y0: direction === 'down' ? trail : direction === 'up' ? lead : mid,
    y1: direction === 'down' ? lead : direction === 'up' ? trail : mid,
  };
}

/**
 * Rozmiar kuli w locie i główki na ramce — zachowanie masy: ramka + mała główka.
 * W locie kulka jest pełniejsza (1.3×), żeby łuk i smuga miały co nieść.
 */
export function ballSizeFor(box: Box, phase: PlamekPhase) {
  const short = Math.min(box.width, box.height);
  const base = Math.max(18, Math.min(36, short * .52));
  return phase === 'fly' ? base * 1.3 : phase === 'gather' ? base * 1.12 : base * .72;
}

/** Mina zależy od fazy i tempa — to ona robi z plamki postać, nie dekorację. */
export function moodFor(phase: PlamekPhase, speedPx: number, asleep: boolean): PlamekMood {
  if (asleep) return 'sleepy';
  if (phase === 'impact') return 'boom';
  if (phase === 'fly' || phase === 'slide') return speedPx > 3 ? 'zoom' : 'curious';
  if (phase === 'gather') return 'curious';
  if (phase === 'pour') return 'happy';
  return 'calm';
}

/** Mignięcie tylko w bezruchu: w locuku powieka zabiera klatkę animacji. */
export function shouldBlink(now: number, lastBlinkAt: number, phase: PlamekPhase, seed: number) {
  if (phase !== 'hug') return false;
  const [min, max] = PLAMEK.blinkEveryMs;
  const period = min + ((seed * 7919) % (max - min));
  return now - lastBlinkAt > period;
}

/** Kulka zasypia po długim bezruchu i kłania się przy pierwszym ruchu. */
export function isAsleep(now: number, lastInputAt: number) {
  return now - lastInputAt > PLAMEK.napAfterMs;
}

/** Ile kroków mieści się w oknie „to jest szybkie ciągnięcie". */
export function burstCount(atTimes: number[], now: number) {
  let count = 0;
  for (let i = atTimes.length - 1; i >= 0; i--) {
    if (now - atTimes[i] > PLAMEK.burstWindowMs) break;
    count++;
  }
  return count;
}

/* --- Ładowanie: kulka na torze ------------------------------------------------
   Orbita jest w CSS (zerowy koszt JS), więc tu zostaje jedna liczba: ile ech
   robi smugę. „Liźnięcie ogona" (skala raz na okrążenie) też jest w CSS. */
export const ORBIT_ECHOS = [8, 16, 24, 33, 43] as const;

/**
 * Most między tym, skąd kulka zerwała się z przycisku, a nią samą — i jego ZERO.
 * Bez tego skok to „zniknij, pojawia się gdzie indziej"; z tym farba najpierw się
 * wyciąga, potem cienieje, a na końcu pęka (pinch-off) z ostatnią kroplą przy źródle.
 *
 * Grubość maleje jak szyja kropli `(1-p)^1.7`, alpha znika gwałtownie w okolicze
 * pęknięcia, a `anchor` to resztka farby, która jeszcze siedzi na starym elemencie.
 */
export function strandFor(from: Point, to: Point, p: number, ballSize: number) {
  const t = clamp01(p);
  const dx = to.x - from.x, dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 2) return null;
  const snap = .78;
  if (t >= snap) return null;
  const thin = Math.pow(1 - t / snap, 1.7);
  return {
    x: from.x,
    y: from.y,
    len,
    deg: Math.atan2(dy, dx) * (180 / Math.PI),
    thickness: Math.max(1.5, ballSize * .62 * thin),
    alpha: .85 * thin,
    anchor: Math.max(2, ballSize * .8 * thin * thin),
  };
}

/**
 * Czas lotu: zerwanie jest SZYBKIE (napięcie powierzchniowe pęka), dojście miękkie.
 * Symetryczne `easeInOutSine` robiło „odjeżdża i hamuje" — z tym jednym wykładnikiem
 * kulka wystrzeliwuje z przycisku i wlewa się w następny.
 */
export function flightCurve(t: number) {
  const x = clamp01(t);
  return 1 - Math.pow(1 - x, 2.2);
}

/** Bryzgi po uderzeniu: kąt, dystans i rozmiar liczone z kierunku lotu. */
export function splatsFor(direction: NavDirection | null, count = 3) {
  const base = direction === 'left' ? 180 : direction === 'right' ? 0 : direction === 'up' ? 270 : 90;
  return Array.from({ length: count }, (_, i) => {
    const spread = (i - (count - 1) / 2) * 34;
    const angle = (base + spread) * (Math.PI / 180);
    const reach = 16 + ((i * 37) % 11);
    return { x: Math.cos(angle) * reach, y: Math.sin(angle) * reach, size: 4 + ((i * 5) % 4) };
  });
}
