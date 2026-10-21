import { useEffect, useId, useRef } from 'react';
import { NAVIGABLE_SELECTOR } from './focusSurface';
import { motionReduced } from './preferences';
import {
  PLAMEK, PLAMEK_INFLATE, PLAMEK_SMOOTH, PLAMEK_TRAIL, PLAMEK_WET, WOBBLE, alphaMatrix,
  contactShadowFor, crownFor, edgeAaFor, lobeAtFor, maskMatrix, paintWeightFor, rimSwellFor,
  sheenBlurFor, wetBlur,
  advancePhase, arcControl, ballShapeFor, ballSizeFor, boxToEdges, burstCount,
  chooseChoreography, clamp01, dirBetween, dominantGaze, easeInOutSine, edgeTau, edgesToBox,
  bandEdges, blobPath, dripTail, flightCurve, gatherCurve, gooStrength, gooTension, gripOffset,
  haloAppearance, haloRadiusFor, inflateEdges, neckPath, pourEdges, ribbonPath, teardropPath,
  gazeBiasFor, isAsleep, isTimed, landFor, leanFor, lerp, moodFor, perchFor, phaseDuration,
  pointDistance, pourCurve, quadPoint, shouldBlink, smoothTo, splatsFor, strandFor, squashFrom,
  wobbleKick, wobbleValue, wrapFor,
  type Box, type Edges, type PerchSide, type PlamekPhase, type Point, type Wobble,
} from './plamek';
import type { NavDirection } from './spatialNav';

/**
 * Plamek (ang. Splash) — maskotka sterowania: pomarańczowa plama farby z buźką,
 * która pokazuje, gdzie jesteś.
 *
 * Cztery rzeczy, które robią z tego ciecz z fizyką, a nie animowany border:
 * 1. JEDEN materiał: otoczka ścieka w kulkę, kulka leci mostem z farby (napięcie
 *    powierzchniowe pęka z hukiem przy `impact`), uderza, rozlewa się ZA przycisk
 *    i dokleja się do niego monotonicznie (zero odbicia).
 * 2. Skok ZACZYNA się od komendy (`lean` z silnika, przed zmianą fokusa), a nie od
 *    `focusin`. To była główna wada poprzedniej wersji: przeglądarka wysyła
 *    `focusout` przed `focusin`, więc maskotka zdążyła zgasnąć i wchodziła na nowy
 *    element ścieżką „po prostu się pojawiła\".
 * 3. Płynność = pościg ze stałą czasową (`smoothTo`, liczone z `dt`, więc tak samo na
 *    50/60/120 Hz). Spring wraca TYLKO jako drganie KSZTAŁTU (`wobbleValue`) — farba
 *    drży, pozycja nigdy nie przeskakuje celu.
 * 4. `requestAnimationFrame` kręci tylko gdy coś się dzieje. W bezruchu Plamek mruga
 *    i zasypia na timerach, ale nie kosztuje ani jednej klatki.
 *
 * W okienku (`scope`) rysowana jest druga, własna kopia: `::backdrop` modala i tak
 * maluje ponad każdym elementem poza dialogiem. Tam współrzędne dzielimy przez skalę
 * karty — morfing okienka skaluje także dzieci, a `getBoundingClientRect()` to przestrzeń
 * ekranu, nie lokalna.
 */

interface Head extends Point { size: number; sx: number; sy: number; rot: number; sharp: number }
interface Flight { from: Point; a: Point; c: Point; b: Point; at: Point }
const KEYS = ['x0', 'y0', 'x1', 'y1'] as const;
const zeroEdges = (): Edges => ({ x0: 0, y0: 0, x1: 0, y1: 0 });
const liveBox = (edges: Edges, radius: number): Box => ({ ...edgesToBox(edges), radius });

export function Plamek({ scope = null }: { scope?: HTMLElement | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  // Dwie kopie maskotki (TV + karta okienka) w jednym dokumencie — id filtra musi być
  // unikalne, inaczej druga kopia przejmowałą definicję pierwszej (lub nic).
  const filterId = `plamek-goo${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    // Farba to JEDNA ścieżka w `<svg>`, nie zestaw `<div>`-ów: tylko tak główka może być
    // wybrzuszeniem obrysu, a nie osobnym elementem, który na nim staje.
    const goo = root.querySelector<SVGGElement>('.plamek-goo');
    const region = root.querySelector<SVGFilterElement>('.plamek-liquid filter');
    const blur = root.querySelector<SVGFEGaussianBlurElement>('.plamek-wet-blur');
    const edgeBlur = root.querySelector<SVGFEGaussianBlurElement>('.plamek-edge-aa');
    const rimBlur = root.querySelector<SVGFEGaussianBlurElement>('.plamek-rim-blur');
    const collar = root.querySelector<SVGPathElement>('.plamek-collar');
    const src = root.querySelector<SVGPathElement>('.plamek-src');
    const blobEl = root.querySelector<SVGPathElement>('.plamek-blob');
    const strand = root.querySelector<SVGPathElement>('.plamek-strand');
    const sheen = root.querySelector<SVGEllipseElement>('.plamek-sheen');
    const glow = root.querySelector<HTMLElement>('.plamek-glow');
    const trails = Array.from(root.querySelectorAll<SVGCircleElement>('.plamek-echo'));
    const splats = Array.from(root.querySelectorAll<SVGCircleElement>('.plamek-splat'));
    const setAttr = (el: Element | null, name: string, value: string) => {
      // Atrybut piszemy tylko, gdy wartość się zmieniła: przy 130 punktach ścieżki
      // powtarzanie identycznego `d` w klatce bezczynności to darmowa praca na TV.
      if (el && el.getAttribute(name) !== value) el.setAttribute(name, value);
    };
    if (!collar || !src || !blobEl || !strand || !sheen || !glow || !goo || !region || !blur) return;

    let phase: PlamekPhase = 'hidden';
    let phaseStart = 0;
    let phaseMs = 0;
    let settledAt = 0;
    let slideUntil = 0;
    let follow = 0;
    let raf = 0;
    let lastFrame = 0;
    let asleep = false;
    let lastBlinkAt = performance.now();
    let napTimer = 0;
    let blinkTimerOff = 0;
    let hideTimer = 0;
    let moodStamp = 0;
    let lastInputAt = performance.now();
    let fused = false;
    let gooOn = -1;
    let lastMoveAt = 0;
    const moves: number[] = [];

    let current: HTMLElement | null = null;
    let target: Box | null = null;
    let targetEdges: Edges = zeroEdges();
    let live: Edges = zeroEdges();
    let from: Edges = zeroEdges();
    let puddle: Edges = zeroEdges();
    let flight: Flight | null = null;
    let lastBoxAt = 0;
    let measuredScale = 1;
    let liveRadius = 14;
    let tension = 0;
    let head: Head = { x: 0, y: 0, size: 22, sx: 1, sy: 1, rot: 0, sharp: 50 };
    let headPrev: Point = { x: 0, y: 0 };
    let wob: Wobble = { amp: 0, at: 0 };
    let dir: NavDirection | null = null;
    let side: PerchSide = 'top';
    let lean: Point = { x: 0, y: 0 };
    let leanDir: NavDirection | null = null;
    let leanAt = 0;
    let gaze: Point = { x: 0, y: 0 };
    const echoes = PLAMEK_TRAIL.map(() => ({ x: 0, y: 0, size: 0 }));

    /* --- pomiar ------------------------------------------------------------ */

    /** Box elementu w przestrzeni, w której rysujemy (viewport albo karta okienka). */
    const measure = (el: HTMLElement | null = null): Box | null => {
      const node = el ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      if (!node || node === document.body || node === document.documentElement) return null;
      const inScope = scope ? scope.contains(node) : !document.querySelector('dialog[open]');
      if (!inScope) return null;
      if (!node.closest(NAVIGABLE_SELECTOR)) return null;
      const rect = node.getBoundingClientRect();
      if (rect.width < 4 || rect.height < 4) return null;
      // Karta okienka w trakcie morfingu jest przeskalowana — przeliczamy lokalnie.
      if (scope) {
        const base = scope.getBoundingClientRect();
        return boxFrom(rect.left - base.left, rect.top - base.top, rect.width, rect.height, scaleOf());
      }
      return boxFrom(rect.left, rect.top, rect.width, rect.height, 1);
    };

    const scaleOf = () => {
      if (!scope || scope.offsetWidth <= 0) return 1;
      const base = scope.getBoundingClientRect();
      measuredScale = Math.max(.2, base.width / scope.offsetWidth) || 1;
      return measuredScale;
    };

    /** Ile światła jest nad przyciskiem — w okienku liczone DO DOŁU jego nagłówka,
     *  żeby główka nigdy nie wylądowała na tytule. Mało miejsca = siada pod spodem. */
    const roomAbove = (box: Box) => {
      if (!scope) return box.top;
      const head = scope.querySelector<HTMLElement>('header');
      if (!head) return box.top;
      const base = scope.getBoundingClientRect();
      return box.top - (head.getBoundingClientRect().bottom - base.top) / scaleOf() - 4;
    };

    function boxFrom(x: number, y: number, w: number, h: number, k: number): Box {
      const left = (x - PLAMEK_INFLATE) / k, top = (y - PLAMEK_INFLATE) / k;
      const width = (w + PLAMEK_INFLATE * 2) / k, height = (h + PLAMEK_INFLATE * 2) / k;
      const short = Math.min(width, height);
      return {
        left, top, width, height,
        radius: Math.max(13, Math.min(34, (short - PLAMEK_INFLATE * 2 / k) * .5 + PLAMEK_INFLATE * .6)),
      };
    }

    const aim = (box: Box) => {
      target = box;
      targetEdges = boxToEdges(box);
    };

    const setPhase = (next: PlamekPhase, now: number, ms?: number) => {
      phase = next;
      phaseStart = now;
      phaseMs = ms ?? phaseDuration(next);
      root.dataset.phase = next;
      if (next === 'gather' || next === 'fly') fused = false;
      if (next === 'hug') {
        settledAt = now;
        // Połysk rozchodzący się po rozlanej farbie: jeden przebieg, nie pętla.
        root.classList.add('is-settle');
        window.setTimeout(() => root.classList.remove('is-settle'), 560);
      }
    };

    const sitOn = (box: Box, now: number) => {
      live = { ...boxToEdges(box) };
      tension = 0;
      liveRadius = haloRadiusFor(Math.min(box.width, box.height), box.radius, 0);
      const perch = perchFor(dir, box, ballSizeFor(box, 'hug') / 2, roomAbove(box));
      side = perch.side;
      head = { x: perch.x, y: perch.y, size: ballSizeFor(box, 'hug'), sx: 1, sy: 1, rot: 0, sharp: 50 };
      headPrev = { x: head.x, y: head.y };
      echoes.forEach(echo => { echo.x = head.x; echo.y = head.y; echo.size = head.size; });
      setPhase('hug', now);
    };

    /* --- choreografia ------------------------------------------------------ */

    /** Kulka startuje z aktualnej pozycji głowy i leci na bliską krawędź celu. */
    const launch = (now: number) => {
      if (!target) return;
      const size = ballSizeFor(target, 'fly');
      const a = { x: head.x, y: head.y };
      const b = landFor(dir, target, size / 2, roomAbove(target));
      flight = { from: { ...a }, a, b, c: arcControl(a, b, 1), at: a };
      head.size = size;
      head.sx = 1; head.sy = 1;
      from = { ...live };
      setPhase('fly', now, phaseDuration('fly', pointDistance(a, b)));
    };

    /** Zerwanie z przycisku: otoczka ścieka w kulkę, jeszcze zanim fokus drgnie. */
    const takeOff = (direction: NavDirection | null, now: number) => {
      if (phase !== 'hug' && phase !== 'slide') return;
      if (direction) dir = direction;
      from = { ...live };
      lean = leanFor(dir, 3.2);
      leanDir = dir;
      leanAt = now;
      if (motionReduced()) { slideUntil = now + PLAMEK.slideMs; setPhase('hug', now); }
      else setPhase('gather', now);
      kick(8);
    };

    const hop = (el: HTMLElement, now: number) => {
      const box = measure(el);
      if (!box) return;
      const previous = target;
      if (previous) dir = dirBetween(previous, box) ?? dir;
      aim(box);
      moves.push(now);
      while (moves.length > 8) moves.shift();
      const gap = now - lastMoveAt;
      lastMoveAt = now;
      lastInputAt = now;
      if (asleep) wake(now);

      if (phase === 'hidden' && !(target && now - lastBoxAt < PLAMEK.hopGraceMs)) {
        // Pierwszy raz na ekranie (albo po długiej przerwie): bez ceremonii, siadamy.
        sitOn(box, now);
      } else if (phase === 'hidden') {
        // Wracamy np. z zamkniętego okienka: stawiamy stary kształt i lecimy OD NIEGO,
        // inaczej powrót wyglądałby jak teleport w nowe miejsce.
        live = { ...targetEdges };
        sitOn(target!, now);
        from = { ...live };
        dir = dirBetween(target!, box) ?? dir;
        aim(box);
        setPhase('gather', now);
      } else if (!motionReduced() && chooseChoreography(gap, burstCount(moves, now)) === 'ritual') {
        if (phase === 'fly' || phase === 'impact') launch(now);
        else if (phase === 'pour' || phase === 'gather') {
          // Jeszcze mokre: doklejamy do nowego celu bez drugiego zbierania.
          dir = dirBetween(liveBox(live, liveRadius), box) ?? dir;
        } else {
          dir = dirBetween(liveBox(live, liveRadius), box) ?? dir;
          from = { ...live };
          setPhase('gather', now);
        }
      } else {
        slideUntil = now + PLAMEK.slideMs;
        if (phase !== 'fly' && phase !== 'impact') setPhase('hug', now);
      }
      kick(phase === 'gather' || phase === 'fly' ? 10 : PLAMEK.followFrames);
    };

    const wake = (now: number) => {
      asleep = false;
      root.classList.remove('is-asleep');
      root.classList.add('is-wake');
      window.setTimeout(() => root.classList.remove('is-wake'), 380);
      wob = wobbleKick(wob, .12, now);
    };

    /** `focusout` to nie zniknięcie: sprawdzamy ponownie po oddechu przeglądarki. */
    const scheduleHide = () => {
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => {
        const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        if (measure(active)) { onFocusIn(); return; }
        current = null;
        lastBoxAt = performance.now();
        setPhase('hidden', performance.now());
        root.classList.remove('is-on');
      }, PLAMEK.hideDelayMs);
    };

    const onFocusIn = () => {
      const el = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (!el || !measure(el)) { scheduleHide(); return; }
      window.clearTimeout(hideTimer);
      current = el;
      hop(el, performance.now());
    };

    /* --- farba: bryzgi, kałuża, most --------------------------------------- */

    const fireSplats = () => {
      if (motionReduced()) return;
      const drops = splatsFor(dir, splats.length);
      splats.forEach((el, index) => {
        const drop = drops[index];
        if (!drop) return;
        el.setAttribute('cx', (head.x + drop.x).toFixed(1));
        el.setAttribute('cy', (head.y + drop.y).toFixed(1));
        el.setAttribute('r', (drop.size / 2).toFixed(1));
        el.classList.remove('is-pop');
        void root.offsetWidth;
        el.classList.add('is-pop');
      });
      window.setTimeout(() => splats.forEach(el => el.classList.remove('is-pop')), 620);
    };

    /** Kałuża: szeroka i płaska tam, gdzie kulka uderzyła — i ZAWSZE za obrys celu. */
    const flatPuddle = () => {
      const box = target ?? { left: 0, top: 0, width: 40, height: 40, radius: 14 };
      const size = ballSizeFor(box, 'fly');
      const puddleBox = { left: head.x - size * 1.15, top: head.y - size * .34, width: size * 2.3, height: size * .7, radius: size };
      return inflateEdges(boxToEdges(puddleBox), PLAMEK.pourSpread * .4);
    };

    /* --- klatka ------------------------------------------------------------ */

    const frame = (now: number) => {
      raf = 0;
      const reduced = motionReduced();
      const dt = Math.min(64, Math.max(6, lastFrame ? now - lastFrame : 16));
      lastFrame = now;
      headPrev = { x: head.x, y: head.y };

      // Karta jeszcze rośnie, rail właśnie się przewija — przez kilka klatek
      // przeliczamy geometrię celu, żeby plamka nadążała, a nie zgadywała.
      if (follow > 0) {
        follow--;
        const box = measure(current);
        if (box) aim(box);
      }
      if (phase === 'hidden' || !target) { root.classList.remove('is-on'); return; }

      let busy: boolean;

      if (isTimed(phase)) {
        const t = clamp01((now - phaseStart) / (phaseMs || 1));
        if (phase === 'gather') {
          // Tu jest cała zmiana charakteru startu: otoczka NIE zwęża się do kółka i nie
          // odlatuje. Zostaje na starym przycisku, a farba z niej JEST wciągana w bulwę —
          // taśma na górze puchnie, w miejscu, skąd ucieka, cienieje (dent).
          head.size = lerp(ballSizeFor(target, 'hug'), ballSizeFor(target, 'gather'), easeInOutSine(t));
        } else if (phase === 'fly' && flight) {
          const at = quadPoint(flight.a, flight.c, flight.b, flightCurve(t));
          flight.at = at;
          head.x = at.x; head.y = at.y;
          // Im dalej od źródła, tym bardziej farba drży — bezwładność, nie podskok.
          wob = Math.abs(t - .12) < .02 ? wobbleKick(wob, .1, now) : wob;
        } else if (phase === 'impact') {
          wob = wobbleKick(wob, .19, phaseStart);
        } else if (phase === 'pour') {
          const p = pourCurve(t);
          // Nie symetria, a lewar: góra muska, boki rozlewają się szeroko, dół zbiera kałużę.
          // Dół nie jest „dopisany na koniec": fronty idą łukiem obwodu, więc dolna
          // krawędź pojawia się sama, w ostatniej kolejności (`wrapFor`).
          const grip = pourEdges(targetEdges, PLAMEK.pourSpread, p);
          if (!fused && wrapFor('pour', t) >= 1) {
            fused = true;
            root.classList.add('is-fuse');
            window.setTimeout(() => root.classList.remove('is-fuse'), PLAMEK.fuseMs);
            wob = wobbleKick(wob, .09, now);   // domknięcie wgniata kształt — raz, bez dzwonienia
          }
          KEYS.forEach(key => { live[key] = lerp(puddle[key], grip[key], p); });
          head.size = lerp(ballSizeFor(target, 'fly'), ballSizeFor(target, 'hug'), easeInOutSine(t));
        }
        if (t >= 1) {
          const next = advancePhase(phase, 'phaseDone');
          if (phase === 'gather') launch(now);
          else {
            if (phase === 'fly') { fireSplats(); wob = wobbleKick(wob, .22, now); }
            if (next === 'pour') puddle = flatPuddle();
            setPhase(next, now);
          }
        }
        busy = true;
      } else {
        // hug: pościg krawędzi. Przez gripMs cel jest „na wierzchu\" i ściąga się
        // monotonicznie — to jest doklejanie, nie odbicie od sprężyny.
        const grip = gripOffset(now - settledAt);
        const goal = grip > .2 ? inflateEdges(targetEdges, grip) : targetEdges;
        const tau = edgeTau(dir, now < slideUntil || now - lastMoveAt < PLAMEK.slideMs);
        let settled = grip <= .2;
        KEYS.forEach(key => {
          let value = smoothTo(live[key], goal[key], tau[key], dt);
          if (Math.abs(goal[key] - value) < PLAMEK_SMOOTH.restPx) value = goal[key]; else settled = false;
          live[key] = value;
        });
        const perch = perchFor(dir, liveBox(live, liveRadius), head.size / 2, roomAbove(liveBox(live, liveRadius)));
        side = perch.side;
        head.x = smoothTo(head.x, perch.x, PLAMEK_SMOOTH.head, dt);
        head.y = smoothTo(head.y, perch.y, PLAMEK_SMOOTH.head, dt);
        head.size = smoothTo(head.size, ballSizeFor(liveBox(live, liveRadius), 'hug'), PLAMEK_SMOOTH.size, dt);
        if (Math.abs(perch.x - head.x) > .4 || Math.abs(perch.y - head.y) > .4) settled = false;
        busy = !settled;
        if (settled) confirmLean(now, dir);
      }

      if (phase === 'pour' || phase === 'impact') {
        const perch = perchFor(dir, target, head.size / 2, roomAbove(target));
        side = perch.side;
        head.x = smoothTo(head.x, perch.x, PLAMEK_SMOOTH.head * 1.5, dt);
        head.y = smoothTo(head.y, perch.y, PLAMEK_SMOOTH.head * 1.5, dt);
      }

      // Okrągłość z napięcia: w rozciągnięciu otoczka jest pigułką, w spoczynku przylega.
      const box = edgesToBox(live);
      tension = smoothTo(tension, gooTension(live, targetEdges), 90, dt);
      liveRadius = haloRadiusFor(Math.min(box.width, box.height), target.radius, tension);

      // Kształt: pościg do pełnego koła + drganie cieczy (tylko KSZTAŁT drży).
      const dx = head.x - headPrev.x, dy = head.y - headPrev.y;
      const speed = Math.hypot(dx, dy);
      const shape = ballShapeFor(dx, dy, reduced ? 0 : speed);
      const spin = ((shape.deg - head.rot + 540) % 360) - 180;
      head.rot = (head.rot + spin * (1 - Math.exp(-dt / 70)) + 360) % 360;
      head.sharp = smoothTo(head.sharp, shape.sharp, 90, dt);
      const shake = reduced ? 0 : wobbleValue(wob, now);
      const drag = reduced ? 0 : squashFrom(speed * .55).long;
      head.sx = drag + shake;
      // Zachowanie pola: osie są swoimi odwrotnościami, więc farba nigdy nie „puchnie"
      // przy kiwnięciu ani przy uderzeniu — zmienia tylko proporcje.
      head.sy = 1 / Math.max(.4, head.sx);
      if (Math.abs(shake) > .002) busy = true;

      lean = { x: smoothTo(lean.x, 0, PLAMEK_SMOOTH.gaze, dt), y: smoothTo(lean.y, 0, PLAMEK_SMOOTH.gaze, dt) };
      const bias = gazeBiasFor(side);   // siedzi na górze => patrzy w dół, na napis
      const look = dominantGaze({ x: dx * .18 + bias.x, y: dy * .18 + bias.y }, lean, 3.2);
      gaze = { x: smoothTo(gaze.x, look.x, PLAMEK_SMOOTH.gaze, dt), y: smoothTo(gaze.y, look.y, PLAMEK_SMOOTH.gaze, dt) };

      echoes.forEach((echo, index) => {
        echo.x = smoothTo(echo.x, head.x, PLAMEK_TRAIL[index].tau, dt);
        echo.y = smoothTo(echo.y, head.y, PLAMEK_TRAIL[index].tau, dt);
        echo.size = smoothTo(echo.size, head.size * PLAMEK_TRAIL[index].scale, 120, dt);
        if (pointDistance(echo, head) > .8) busy = true;
      });

      draw(now, speed, reduced, flight);
      if (busy || tension > .01 || Math.abs(head.sharp - 50) > .3) raf = requestAnimationFrame(frame);
    };

    // Góra .5 (nie .35): przy mniejszym przycisku górna krawędź taśmy miała
    // pół piksela i znikała — „mało wyraźny" z przeglądu brało się głównie stąd.
    const ANISO = { top: .55, side: 1, bottom: 1.4 };

    const draw = (now: number, speed: number, reduced: boolean, flight: Flight | null) => {
      const box = edgesToBox(live);
      const shake = reduced ? 0 : wobbleValue(wob, now);   // to samo drganie, co przy osiach
      const progress = isTimed(phase) ? clamp01((now - phaseStart) / (phaseMs || 1)) : 1;
      const bare = phase === 'fly' || phase === 'impact';
      const mode = phase === 'pour' ? 'pour' : phase === 'gather' || bare ? 'gather' : 'hug';
      const appear = haloAppearance(mode, bare ? 1 : progress);
      const spin = ((now - wob.at) / WOBBLE.periodMs) % 1;
      const wrap = wrapFor(phase, progress);
      const blobR = head.size / 2;
      const p = gatherCurve(progress);
      root.classList.add('is-on');

      // ---- kołnierz na celu: ta sama farba, co główka -------------------------
      // Taśma o realnej grubości (nie `border`!) + bulwa, w której siedzi buźka:
      // jeden `d`, więc „wnikanie w pierścień" nie jest efektem — jest faktem.
      const onTarget = phase !== 'gather' && phase !== 'fly';
      const settle = phase === 'pour' ? pourCurve(progress) : phase === 'impact' ? 0 : 1;
      const host = liveBox(live, liveRadius);
      // Grubość farby idzie za rozmiarem elementu: na chipie taśma jest cienka, na
      // kaflu gruba — inaczje na małych przyciskach kleks zjada treść (zarzut z przeglądu).
      const weight = paintWeightFor(host);
      const spread = lerp(blobR * .62, weight, settle);
      const lobeRaw = phase === 'pour' ? clamp01((progress - .55) / .45)
        : phase === 'impact' ? .18 : onTarget ? 1 : 0;
      // Garb ma sens tylko tam, gdzie rant jest płaski: na ikonce-kole dokładał materiał
      // dokładnie tam, gdzie obwód sam się zaokrągla, i robiło się jajko. Na kole główkę
      // trzyma krążek zlany z pierścienia przez maskę (`restDisc` niżej), nie wybrzuszenie.
      const crown = crownFor(host);
      const lobe = lobeRaw * crown;
      // ...i siedzi tam, gdzie realnie przysiadła buźka: nad przyciskiem albo pod nim.
      const lobeAt = lobeAtFor(side);
      let d = '';
      if (onTarget) {
        const band = bandEdges(host, {
          inset: -2, spread, aniso: ANISO, wrap, lobe, dent: 0,
          lobeWidth: head.size * .8, lobeSize: head.size * .62,
          wob: shake, spin, lobeAt,
        });
        d = ribbonPath(band.outer, band.inner);
        // Kropla: podścieżka TEJ SAMEJ ścieżki, więc maska robi z niej łzę trzymającą
        // się taśmy szyjką. Rozmiar liczymy z grubości farby, nie z główki. Gdy główka
        // przysiadła POD przyciskiem, łza jest niepotrzebna — tam już leży cała farba.
        const tail = reduced || lobeAt > 0 ? null : dripTail(host, wrap, spread * ANISO.bottom, shake);
        if (tail) d += teardropPath(tail.x, tail.y, tail.width, tail.height, tail.swell);
      }
      setAttr(collar, 'd', d);
      setAttr(collar, 'fill-opacity', onTarget && phase !== 'impact' ? '1' : '0');

      // ---- resztka na starym przycisku: farba jest z niej wciągana ------------
      let sd = '';
      if (phase === 'gather' || phase === 'fly') {
        const drain = phase === 'gather' ? p : 1;
        const band = bandEdges(liveBox(from, liveRadius), {
          inset: -2, spread: lerp(weight, blobR * .95, drain), aniso: ANISO,
          wrap, lobe: (1 - clamp01((drain - .5) / .45)) * crown, dent: drain,
          lobeWidth: head.size * .8, lobeSize: head.size * .62,
          wob: shake, spin, lobeAt,
        });
        sd = ribbonPath(band.outer, band.inner);
      }
      setAttr(src, 'd', sd);
      setAttr(src, 'fill-opacity', sd ? (.72 + appear.alpha * .28).toFixed(3) : '0');

      // ---- bulwa: to, co leci (i to, co zostaje na starcie) ------------------
      const flying = phase === 'gather' || bare;
      // Na okrągłym celu zamiast garbu rysujemy krążek: `blobPath` w tym samym `<filter>`
      // zlewa go z pierścieniem, więc główka jest częścią bryły, a nie czepkiem na szczycie.
      const restDisc = onTarget && phase !== 'impact' ? 1 - crown : 0;
      const blobAlpha = flying ? (phase === 'gather' ? clamp01((p - .25) / .3) : 1) : restDisc;
      const tailPx = reduced ? 0 : Math.max(0, (head.sharp - 50) / 40) * blobR * .9;
      const blobOn = flying || restDisc > .02;
      setAttr(blobEl, 'd', !blobOn ? '' : flying
        ? blobPath(head.x, head.y, blobR, head.rot, head.sx, head.sy, tailPx, shake, spin)
        : blobPath(head.x, head.y, blobR * (1 + .06 * restDisc), 0, 1, 1, 0, shake, spin));
      setAttr(blobEl, 'fill-opacity', blobAlpha.toFixed(3));

      // ---- most: szyja zwęża się do zera i pęka ------------------------------
      const bridge = phase === 'fly' && flight && !reduced
        ? strandFor(flight.from, flight.at, progress, head.size)
        : null;
      if (bridge) {
        const rad = (bridge.deg * Math.PI) / 180;
        const ex = bridge.x + Math.cos(rad) * bridge.len, ey = bridge.y + Math.sin(rad) * bridge.len;
        const pinch = clamp01((progress - .42) / .36);
        setAttr(strand, 'd', neckPath(bridge.x, bridge.y, bridge.anchor, ex, ey, bridge.thickness, pinch)
          // Kropla źródłowa jest częścią mostu — inaczej „odkleja się" w jednej klatce.
          + blobPath(bridge.x, bridge.y, bridge.anchor / 2, bridge.deg, 1, 1, 0, shake * .5, spin));
        setAttr(strand, 'fill-opacity', bridge.alpha.toFixed(3));
      } else {
        setAttr(strand, 'd', ''); setAttr(strand, 'fill-opacity', '0');
      }

      // ---- poświata i puls domknięcia (poza mokrą farbą: próg alfa zjada cienie) ---
      // Cień kontaktowy: przesunięcie i rozmycie rosną z grubością farby — jedna
      // fizyczna zależność zamiast dwóch stałych (im więcej farby, tym cięższy cień).
      const contact = contactShadowFor(weight);
      glow.style.cssText = `--halo-x:${box.left.toFixed(1)}px;--halo-y:${box.top.toFixed(1)}px;`
        + `--halo-w:${box.width.toFixed(1)}px;--halo-h:${box.height.toFixed(1)}px;`
        + `--halo-r:${liveRadius.toFixed(1)}px;--halo-a:${(reduced ? 0 : appear.alpha * .55).toFixed(3)};`
        + `--halo-dy:${contact.dy.toFixed(1)}px;--halo-blur:${contact.blur.toFixed(1)}px`;
      // Twarz dzieli box kulki s korzeniem warstwy — MUSI zostać poza maską goo.
      root.style.setProperty('--ball-x', `${(head.x - blobR).toFixed(1)}px`);
      root.style.setProperty('--ball-y', `${(head.y - blobR).toFixed(1)}px`);
      root.style.setProperty('--ball-size', `${head.size.toFixed(1)}px`);
      // Twarz podąża za squashem, ale tylko w połowie: inaczej przy uderzeniu oko
      // zamieniałoby się w kreskę, a buźka ma pozostać czytelna.
      root.style.setProperty('--ball-sy', (1 + (head.sy - 1) * .45).toFixed(3));
      root.style.setProperty('--look-x', `${gaze.x.toFixed(2)}px`);
      root.style.setProperty('--look-y', `${gaze.y.toFixed(2)}px`);
      root.style.setProperty('--goo', tension.toFixed(3));
      // Połysk mokrej farby siada na bulwie (albo na jej wybrzuszeniu, gdy kulka odpoczęła).
      // Połysk czytamy jak odbicie światła z góry-lewej (ta sama strona, co szkło w UI):
      // mniejszy i ciemniejszy niż wcześniej, bo 42% bieli na małej bulwie myło kolor farby.
      setAttr(sheen, 'cx', (head.x - blobR * .16).toFixed(2));
      setAttr(sheen, 'cy', (head.y - blobR * .34).toFixed(2));
      setAttr(sheen, 'rx', (blobR * .44).toFixed(2));
      setAttr(sheen, 'ry', (blobR * .28).toFixed(2));
      sheen.style.filter = `blur(${sheenBlurFor(blobR).toFixed(2)}px)`;

      // ---- maska goo: rozmycie + próg alfa na grupie farby -------------------
      // Region `filter` liczy się od podanego prostokąta (userSpaceOnUse), NIE od ekranu:
      // bez tego telewizor płaciłby rozmyciem 1920×1080 w każdej klatce.
      const wet = gooStrength(tension, phase, reduced, phase === 'pour' ? (progress - .68) / .32 : 0);
      if (Math.abs(wet - gooOn) > .02) {
        gooOn = wet;
        blur?.setAttribute('stdDeviation', wetBlur(wet).toFixed(2));
        if (goo) { if (wet > 0) goo.setAttribute('filter', `url(#${filterId})`); else goo.removeAttribute('filter'); }
      }
      // Keyline liczymy przy każdej próbie rysowania, ale `setAttr` sam pilnuje, żeby
      // nie przepinać atrybutu bez zmiany. Grubość idzie za farbą, nie za ekranem.
      // SVG bez viewBox ma jednostki CSS; skalę okienka znamy z istniejącego pomiaru.
      // Nie dokładamy odczytu geometrii tylko na potrzeby wygładzania.
      setAttr(edgeBlur, 'stdDeviation', edgeAaFor(window.devicePixelRatio, measuredScale).toFixed(3));
      setAttr(rimBlur, 'stdDeviation', rimSwellFor(weight).toFixed(2));
      if (wet > 0 && region) {
        let x0 = Math.min(host.left - spread * 2, from.x0 - PLAMEK.pourSpread * 2, box.left);
        let y0 = Math.min(host.top - head.size * 1.8, box.top, from.y0);
        let x1 = Math.max(host.left + host.width + spread * 2, from.x1 + PLAMEK.pourSpread * 2, box.left + box.width);
        let y1 = Math.max(host.top + host.height + spread * 3.4, from.y1 + PLAMEK.pourSpread * 2, box.top + box.height);
        for (const echo of echoes) {
          x0 = Math.min(x0, echo.x - echo.size); x1 = Math.max(x1, echo.x + echo.size);
          y0 = Math.min(y0, echo.y - echo.size); y1 = Math.max(y1, echo.y + echo.size);
        }
        const pad = PLAMEK.gooPad;
        setAttr(region, 'x', (x0 - pad).toFixed(0));
        setAttr(region, 'y', (y0 - pad).toFixed(0));
        setAttr(region, 'width', (x1 - x0 + pad * 2).toFixed(0));
        setAttr(region, 'height', (y1 - y0 + pad * 2).toFixed(0));
      }

      // ---- smuga: echa biegnące za bulwą (też w grupie farby) ----------------
      const trailAlpha = Math.min(1, .25 + speed / 7);
      echoes.forEach((echo, index) => {
        const el = trails[index];
        if (!el) return;
        const raw = PLAMEK_TRAIL[index].alpha * trailAlpha;
        setAttr(el, 'cx', echo.x.toFixed(1));
        setAttr(el, 'cy', echo.y.toFixed(1));
        // Próg alfa maski goo zjada wszystko poniżej ~.33, a dawne alfy echa to .2-.3:
        // smuga była liczona, ale nigdy nie namalowana. Więc alpha ma podłogę nad progiem,
        // a znika przez kurczenie promienia — dla cieczy to zresztą naturalniejsza droga.
        setAttr(el, 'r', Math.max(0, (echo.size / 2) * (.3 + .7 * clamp01(raw / .3))).toFixed(1));
        setAttr(el, 'fill-opacity', (reduced ? 0 : .42 + .58 * clamp01(raw / .3)).toFixed(3));
      });

      const mood = moodFor(phase, speed, asleep);
      if (mood !== root.dataset.mood && (phase === 'hug' || now - moodStamp > 50)) {
        root.dataset.mood = mood; moodStamp = now;
      }
    };

    /** Plamek kiwa, gdy element, na który się nastawiał, faktycznie wygrał. */
    const confirmLean = (now: number, landed: NavDirection | null) => {
      if (!leanAt || landed !== leanDir) { leanAt = 0; return; }
      if (now - leanAt < PLAMEK.leanMs * 5) {
        root.classList.add('is-confirm');
        window.setTimeout(() => root.classList.remove('is-confirm'), 300);
        wob = wobbleKick(wob, -.08, now);
      }
      leanAt = 0;
    };

    const kick = (frames = PLAMEK.followFrames) => {
      follow = Math.max(follow, frames);
      if (!raf) { lastFrame = 0; raf = requestAnimationFrame(frame); }
    };

    /* --- reszta systemu ---------------------------------------------------- */

    const react = (event: Event) => {
      const detail = (event as CustomEvent<{ kind?: string; dir?: NavDirection }>).detail ?? {};
      const now = performance.now();
      lastInputAt = now;
      if (asleep) wake(now);
      const flash = (name: string, ms: number) => {
        root.classList.add(name);
        window.setTimeout(() => root.classList.remove(name), ms);
      };
      if (detail.kind === 'select') { flash('is-nod', 340); fireSplats(); wob = wobbleKick(wob, -.14, now); }
      else if (detail.kind === 'back') { flash('is-dodge', 320); wob = wobbleKick(wob, .12, now); }
      else if (detail.kind === 'poke') flash('is-poke', 300);
      else if (detail.kind === 'blocked') flash('is-blocked', PLAMEK.blockMs);
      else if (detail.kind === 'lean' && detail.dir) {
        // Komenda jest wcześniejsza niż fokus: zrywamy się już TERAZ, więc lot widać
        // zawsze — nawet przy powtórzeniach, gdzie `focusin` wpada dwie klatki później.
        leanAt = now;
        takeOff(detail.dir, now);
        return;
      }
      kick(14);
    };

    const blinkSeed = (Date.now() % 997) + 3;
    const checkBlink = () => {
      if (motionReduced()) return;
      const now = performance.now();
      if (!shouldBlink(now, lastBlinkAt, phase, blinkSeed)) return;
      lastBlinkAt = now;
      root.classList.add('is-blink');
      window.setTimeout(() => root.classList.remove('is-blink'), PLAMEK.blinkMs);
    };

    const checkNap = () => {
      const next = isAsleep(performance.now(), lastInputAt) && phase === 'hug';
      if (next !== asleep) {
        asleep = next;
        root.classList.toggle('is-asleep', asleep);
      }
    };

    // Czas pulsu domknięcia płynie z modelu, żeby CSS nie miał własnej kopii liczby.
    root.style.setProperty('--plamek-fuse', `${PLAMEK.fuseMs}ms`);
    // Zmniejszamy natywny outline tylko tam, gdzie Plamek naprawdę go zastępuje.
    if (!scope) document.documentElement.dataset.plamek = 'on';
    const first = measure();
    if (first) {
      current = document.activeElement as HTMLElement;
      aim(first);
      sitOn(first, performance.now());
      draw(performance.now(), 0, motionReduced(), null);
    }
    blinkTimerOff = window.setInterval(checkBlink, 700);
    napTimer = window.setInterval(checkNap, 3000);
    // focusout jest OBSERWOWANY, nie stosowany — patrz `scheduleHide`.
    const onViewportChange = () => kick(8);
    window.addEventListener('focusin', onFocusIn, true);
    window.addEventListener('scroll', onViewportChange, { capture: true, passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    document.addEventListener('visibilitychange', onViewportChange);
    window.addEventListener('joypad-plamek', react);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.clearInterval(blinkTimerOff);
      window.clearInterval(napTimer);
      window.clearTimeout(hideTimer);
      window.removeEventListener('focusin', onFocusIn, true);
      window.removeEventListener('scroll', onViewportChange, { capture: true });
      window.removeEventListener('resize', onViewportChange);
      document.removeEventListener('visibilitychange', onViewportChange);
      window.removeEventListener('joypad-plamek', react);
      if (!scope) delete document.documentElement.dataset.plamek;
    };
  }, [scope, filterId]);

  return (
    <span ref={ref} className={`plamek ${scope ? 'is-scoped' : ''}`} data-phase="hidden" data-mood="calm" aria-hidden="true">
      {/* Poświata i puls domknięcia. Świadomie POZA mokrą farbą: próg alfy maski goo zjada
          delikatne cienie, więc „scaleniem" rządzi ten element, a nie grupa farby. */}
      <i className="plamek-glow" />
      {/* Farba to JEDNA ścieżka w jednym `<g>`: taśma wokół celu + bulwa, w której siedzi
          buźka + kropla jako podścieżka. Dopóki wszystko leży w jednym `filter`, nakładające
          się plamy SCALAJĄ się w jedno ciało (szyjka, przewężenie, pęknięcie) zamiast
          nachodzić na siebie jak dwa `<div>`-y. Region maski (`userSpaceOnUse`) ustawia
          `draw()` — od obrysu farby, nie od ekranu. */}
      <svg className="plamek-liquid" aria-hidden="true" focusable="false">
        <defs>
          <filter id={filterId} x="0" y="0" width="100" height="100" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
            {/* Dotychczasowa siła scalania: smuga i most nie tracą krycia. */}
            <feGaussianBlur className="plamek-wet-blur" stdDeviation={wetBlur(.3).toFixed(2)} result="plamek-blur" />
            <feColorMatrix in="plamek-blur" type="matrix" result="plamek-threshold"
              values={alphaMatrix(PLAMEK_WET.ramp, PLAMEK_WET.offset)} />
            {/* Wygładzenie po progu: około jednego piksela przejścia na krawędzi.
                Twarz pozostaje poza filtrem, a wnętrze farby zachowuje kolor. */}
            <feGaussianBlur className="plamek-edge-aa" in="plamek-threshold"
              stdDeviation={edgeAaFor()} result="plamek-wet" />
            {/* Obwódka wokół scalonej bryły, nie poszczególnych ścieżek. Rozmycie
                zastępuje prostokątne jądro `feMorphology`; jego siła rośnie z farbą.
                Zostajemy przy prymitywach SVG 1.1 zamiast `feDropShadow`. */}
            <feGaussianBlur className="plamek-rim-blur" in="plamek-wet" stdDeviation="1.6" result="plamek-swell" />
            <feColorMatrix in="plamek-swell" type="matrix" result="plamek-fat"
              values={maskMatrix(PLAMEK_WET.rimRamp, PLAMEK_WET.rimOffset)} />
            <feFlood floodColor="#23100a" floodOpacity=".62" result="plamek-key" />
            <feComposite in="plamek-key" in2="plamek-fat" operator="in" result="plamek-rim" />
            <feMerge>
              <feMergeNode in="plamek-rim" />
              <feMergeNode in="plamek-wet" />
            </feMerge>
          </filter>
        </defs>
        <g className="plamek-goo">
          <path className="plamek-src" d="" />
          <path className="plamek-strand" d="" />
          {PLAMEK_TRAIL.map(echo => <circle key={echo.tau} className="plamek-echo" r="0" />)}
          <path className="plamek-collar" d="" />
          <path className="plamek-blob" d="" fillOpacity="0" />
          <circle className="plamek-splat" r="0" />
          <circle className="plamek-splat" r="0" />
          <circle className="plamek-splat" r="0" />
        </g>
        <ellipse className="plamek-sheen" rx="0" ry="0" />
      </svg>
      {/* Twarz NAD mokrą farbą, w tym samym boxie co bulwa (`--ball-*` na korzeniu):
          oko pod maską goo zamieniłoby się w plamę, a buźka ma być ostra zawsze. */}
      <i className="plamek-face">
        <i className="plamek-eye is-left" />
        <i className="plamek-eye is-right" />
        <i className="plamek-mouth" />
        <i className="plamek-snore" />
      </i>
    </span>
  );
}
