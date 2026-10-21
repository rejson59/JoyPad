import { useId } from 'react';
import { PLAMEK_TRAIL, PLAMEK_WET, alphaMatrix, blobPath, clamp01, edgeAaFor, maskMatrix, rimSwellFor, wetBlur } from '../console/plamek';

/**
 * Plamek w filmie — ta sama postać i ten sam materiał co w interfejsie
 * (ścieżka z `blobPath`, próg alfy `18α − 6`, wygładzenie po progu, ciemny
 * keyline pod farbą), ale rysowany jako czysta funkcja propsów.
 *
 * Scena podaje fizykę (gdzie jest, jak bardzo jest rozciągnięty, jak wygląda),
 * a komponent tylko rysuje. Zero stanu, zero `Date.now()`, zero losowości:
 * ta sama klatka zawsze wygląda tak samo — dzięki temu film da się renderować
 * offline i przewijać bez rozjazdu.
 */

export type FilmMood = 'calm' | 'happy' | 'zoom' | 'curious' | 'sleepy' | 'proud';

export interface FilmPlamekProps {
  /** Pozycja środka ciała w jednostkach sceny (1920×1080). */
  x: number;
  y: number;
  /** Promień bazowy. */
  r: number;
  /** Rozciągnięcie ciała (squash & stretch, pole zachowane). */
  sx?: number;
  sy?: number;
  /** Ogon w kierunku ruchu, w jednostkach sceny. */
  tail?: number;
  /** Kierunek ruchu w stopniach (0 = w prawo). */
  angle?: number;
  /** Drganie KSZTAŁTU (nie pozycji) i jego faza. */
  wob?: number;
  spin?: number;
  mood?: FilmMood;
  /** 0 = oczy otwarte, 1 = zamknięte. */
  blink?: number;
  gaze?: { x: number; y: number };
  /** Smugi: poprzednie pozycje ciała (od najświeższej). */
  trail?: { x: number; y: number; a?: number }[];
  /** Rozbryzgi (te same drobiny farby, scalają się z ciałem przez maskę goo). */
  splats?: { x: number; y: number; r: number }[];
  /** Kolor farby — akcent sceny, nigdy „rozjaśniony dla czytelności". */
  paint?: string;
  /** Krycie całej postaci (wejścia i wyjścia). */
  opacity?: number;
  /** Skala urządzenia (dpr × skala sceny) — do wygładzenia krawędzi. */
  deviceScale?: number;
  /** Grubość farby 0..1 — od niej rośnie keyline, tak jak w interfejsie. */
  weight?: number;
}

const MOUTH: Record<FilmMood, string> = {
  calm: 'M-16 9 Q0 19 16 9',
  happy: 'M-19 6 Q0 26 19 6',
  proud: 'M-17 7 Q0 24 17 7',
  zoom: 'M-11 8 Q0 22 11 8 Q0 18 -11 8',
  curious: 'M-13 13 Q2 5 15 13',
  sleepy: 'M-15 12 Q0 8 15 12',
};

export function CinemaPlamek({
  x, y, r, sx = 1, sy = 1, tail = 0, angle = 0, wob = 0, spin = 0,
  mood = 'calm', blink = 0, gaze = { x: 0, y: 0 }, trail = [], splats = [],
  paint = '#f6ad55', opacity = 1, deviceScale = 1, weight = .5,
}: FilmPlamekProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const goo = `film-goo-${uid}`;
  const rim = `film-rim-${uid}`;
  const soft = `film-soft-${uid}`;
  const sheen = `film-sheen-${uid}`;
  const blur = wetBlur(.34);
  const rimSigma = rimSwellFor(weight);
  const aa = edgeAaFor(Math.max(1, deviceScale), 1);
  const body = blobPath(x, y, r, angle, sx, sy, tail, wob, spin);
  const lid = 1 - clamp01(blink);
  const eye = Math.max(3.2, r * .19);
  const spread = r * .38;
  const mouth = MOUTH[mood] ?? MOUTH.calm;
  const faceScale = 1 + (Math.min(sx, sy) - 1) * .35;

  return (
    <svg className="film-plamek" viewBox="0 0 1920 1080" aria-hidden="true" focusable="false" style={{ opacity }}>
      <defs>
        <filter id={goo} x="-30%" y="-30%" width="160%" height="160%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={blur.toFixed(2)} result="blur" />
          <feColorMatrix in="blur" type="matrix" values={alphaMatrix(PLAMEK_WET.ramp, PLAMEK_WET.offset)} result="threshold" />
          <feGaussianBlur in="threshold" stdDeviation={aa.toFixed(2)} result="wet" />
          <feGaussianBlur in="wet" stdDeviation={rimSigma.toFixed(2)} result="swell" />
          <feColorMatrix in="swell" type="matrix" values={maskMatrix(PLAMEK_WET.rimRamp, PLAMEK_WET.rimOffset)} result="fat" />
          <feFlood floodColor="#23100a" floodOpacity=".6" result="key" />
          <feComposite in="key" in2="fat" operator="in" result="edge" />
          <feMerge>
            <feMergeNode in="edge" />
            <feMergeNode in="wet" />
          </feMerge>
        </filter>
        <filter id={rim} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={(rimSigma * 1.6).toFixed(2)} result="swell" />
          <feColorMatrix in="swell" type="matrix" values={maskMatrix(PLAMEK_WET.rimRamp, PLAMEK_WET.rimOffset)} result="fat" />
          <feFlood floodColor="#23100a" floodOpacity=".55" result="key" />
          <feComposite in="key" in2="fat" operator="in" />
        </filter>
        <filter id={soft} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="6" />
        </filter>
        <linearGradient id={sheen} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".34" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
      </defs>

      {trail.slice(0, PLAMEK_TRAIL.length).map((echo, index) => {
        const spec = PLAMEK_TRAIL[index];
        const alpha = echo.a ?? spec.alpha;
        return (
          <path
            key={index}
            d={blobPath(echo.x, echo.y, r * spec.scale, angle, sx, sy, tail * spec.scale, wob, spin)}
            fill={paint}
            opacity={alpha}
            filter={`url(#${soft})`}
          />
        );
      })}

      <g filter={`url(#${goo})`}>
        <path d={body} fill={paint} />
        {splats.map((splat, index) => <circle key={index} cx={splat.x} cy={splat.y} r={splat.r} fill={paint} />)}
      </g>

      <g transform={`translate(${x} ${y}) rotate(${angle.toFixed(2)})`}>
        <ellipse cx={-r * .3} cy={-r * .42} rx={r * .42} ry={r * .3} fill={`url(#${sheen})`} opacity={.5 * opacity} />
        <g transform={`scale(${faceScale.toFixed(3)}) translate(${gaze.x * r * .1} ${gaze.y * r * .1})`}>
          {[-(spread), spread].map((dx, index) => (
            <g key={index} transform={`translate(${dx} ${-r * .1})`}>
              <ellipse cx={0} cy={0} rx={eye * .92} ry={eye * lid} fill="#2b130a" />
              <ellipse cx={gaze.x * eye * .34} cy={gaze.y * eye * .34 + eye * .1 * (1 - lid)} rx={eye * .42} ry={eye * .44 * lid} fill="#ffe2b8" opacity={lid > .35 ? .92 : 0} />
            </g>
          ))}
          <path d={mouth} transform={`scale(${(r / 78).toFixed(3)})`} fill="none" stroke="#2b130a" strokeWidth={Math.max(2.4, 3.4 * (r / 78))} strokeLinecap="round" />
        </g>
      </g>
    </svg>
  );
}
