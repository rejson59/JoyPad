import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { announcePaneReady } from './ready';
import { clamp01 } from './timeline';

/**
 * Rekwizyty filmu: telefon, telewizor, klawiatura, kontroler i ekran pada.
 *
 * Wszystko jest zwykłym DOM-em i SVG (żadnego WebGL ani zależności), bo te
 * przedmioty są bohaterami kadru — mają być ostre, kolorowane z palety systemu
 * i animowane transformacjami, czyli na GPU. Wymiary podawane są w jednostkach
 * sceny 1920×1080, więc film wygląda identycznie na 1080p i 4K.
 */

export function PhoneMock({
  x, y, width, height, rot = 0, scale = 1, className = '', glow, children,
}: {
  x: number; y: number; width: number; height: number; rot?: number; scale?: number;
  className?: string; glow?: string; children?: ReactNode;
}) {
  return (
    <div
      className={`film-phone ${className}`}
      style={{
        width, height,
        transform: `translate3d(${(x - width / 2).toFixed(1)}px, ${(y - height / 2).toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
        '--phone-glow': glow ?? 'rgba(246,173,85,.35)',
      } as CSSProperties}
    >
      <span className="film-phone-shadow" aria-hidden="true" />
      <div className="film-phone-body">
        <span className="film-phone-island" aria-hidden="true" />
        <span className="film-phone-lens" aria-hidden="true" />
        <div className="film-phone-screen">{children}</div>
        <span className="film-phone-glass" aria-hidden="true" />
      </div>
      <span className="film-phone-button film-phone-power" aria-hidden="true" />
      <span className="film-phone-button film-phone-volume" aria-hidden="true" />
    </div>
  );
}

export function TvMock({
  x, y, width, height, rot = 0, scale = 1, className = '', glow, children,
}: {
  x: number; y: number; width: number; height: number; rot?: number; scale?: number;
  className?: string; glow?: string; children?: ReactNode;
}) {
  return (
    <div
      className={`film-tv ${className}`}
      style={{
        width, height,
        transform: `translate3d(${(x - width / 2).toFixed(1)}px, ${(y - height / 2).toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
        '--tv-glow': glow ?? 'rgba(246,173,85,.28)',
      } as CSSProperties}
    >
      <div className="film-tv-body">
        <div className="film-tv-screen">{children}</div>
        <span className="film-tv-glare" aria-hidden="true" />
      </div>
      <span className="film-tv-stand" aria-hidden="true" />
      <span className="film-tv-halo" aria-hidden="true" />
    </div>
  );
}

/** Stylizowany kontroler do gier — bohater sceny „kontroler wpada w telefon". */
export function ControllerMock({ size = 1, className = '', lit = false }: { size?: number; className?: string; lit?: boolean }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const body = `pad-body-${uid}`, top = `pad-top-${uid}`, stick = `pad-stick-${uid}`, sheen = `pad-sheen-${uid}`;
  return (
    <svg className={`film-pad ${className}`} viewBox="0 0 260 168" style={{ width: 260 * size, height: 168 * size }} aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3c4356" />
          <stop offset=".45" stopColor="#252b39" />
          <stop offset="1" stopColor="#141821" />
        </linearGradient>
        <linearGradient id={top} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".30" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <radialGradient id={stick} cx=".38" cy=".32" r=".8">
          <stop offset="0" stopColor="#7d879c" />
          <stop offset="1" stopColor="#1b202b" />
        </radialGradient>
        <radialGradient id={sheen} cx=".3" cy=".2" r=".9">
          <stop offset="0" stopColor="#ffffff" stopOpacity=".22" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* Korpus: mostek + dwa chwyty, jedna bryła. */}
      <g fill={`url(#${body})`} stroke="#0d1016" strokeWidth="2">
        <rect x="26" y="22" width="208" height="82" rx="40" />
        <circle cx="70" cy="102" r="46" />
        <circle cx="190" cy="102" r="46" />
      </g>
      <rect x="34" y="26" width="192" height="34" rx="17" fill={`url(#${top})`} opacity=".7" />
      {/* Bumpy: L1/R1. */}
      <rect x="42" y="8" width="58" height="20" rx="9" fill="#2b3140" stroke="#0d1016" strokeWidth="1.5" />
      <rect x="160" y="8" width="58" height="20" rx="9" fill="#2b3140" stroke="#0d1016" strokeWidth="1.5" />
      {/* Krzyżak. */}
      <g fill="#161b24" stroke="#0c0f15" strokeWidth="1.4">
        <rect x="46" y="70" width="44" height="15" rx="5" />
        <rect x="60" y="56" width="15" height="44" rx="5" />
      </g>
      {/* Lewy drążek. */}
      <circle cx="122" cy="112" r="24" fill="#131822" stroke="#0c0f15" strokeWidth="1.4" />
      <circle cx="122" cy="110" r="16" fill={`url(#${stick})`} />
      {/* Prawy drążek. */}
      <circle cx="176" cy="112" r="24" fill="#131822" stroke="#0c0f15" strokeWidth="1.4" />
      <circle cx="176" cy="110" r="16" fill={`url(#${stick})`} />
      {/* Przyciski: A świeci akcentem, reszta czeka. */}
      <g stroke="#0c0f15" strokeWidth="1.4">
        <circle cx="196" cy="72" r="12" fill={lit ? '#f6ad55' : '#3a4152'} className="film-pad-key" />
        <circle cx="222" cy="48" r="12" fill="#3a4152" />
        <circle cx="170" cy="48" r="12" fill="#3a4152" />
        <circle cx="196" cy="24" r="12" fill="#3a4152" />
      </g>
      {/* Światło: jedno małe, żeby bryła nie wyglądała na płaską ikonę. */}
      <ellipse cx="122" cy="60" rx="76" ry="34" fill={`url(#${sheen})`} />
      {lit && <circle cx="196" cy="72" r="19" fill="none" stroke="#f6ad55" strokeWidth="2" opacity=".55" />}
    </svg>
  );
}

/**
 * Ekran pada (to, co widzi gracz na telefonie): joystick, przyciski, pasek
 * połączenia. Ten sam układ, co w prawdziwym padzie — film nie pokazuje
 * makiety, tylko znajomy interfejs.
 */

/* ------------------------------------------------------------ klawiatura --- */

/**
 * Klawiatura — rekwizyt sceny „Albo klawiatura".
 *
 * Ta sama zasada co przy telefonie i telewizorze: prawdziwy układ klawiszy, nie
 * makieta, bo klawiatura jest bohaterem kadru. Poradnik zapala na niej dokładnie
 * te klawisze, które naprawdę coś robią (patrz `PLAYER_DEFS` w `src/game/types.ts`):
 * WASD prowadzi pierwszego gracza, strzałki drugiego, a spacja i Enter to ogień.
 * Układ liczymy raz i eksportujemy — scena stawia na nim podpisy i Plamka, więc
 * rekwizyt i kadr mają jedno źródło prawdy (nie rozjadą się przy zmianie rozmiaru).
 */
const KB_KEY = 62;
const KB_GAP = 8;
const KB_PAD = 24;
const KB_PITCH = KB_KEY + KB_GAP;

/** Klawisze w kolejności, w jakiej poradnik je tłumaczy (fala świateł idzie tą listą). */
export const KB_TEACH_ORDER = ['W', 'A', 'S', 'D', '←', '↑', '↓', '→', 'SPACJA'] as const;

interface KbKey { label: string; x: number; y: number; w: number; h: number; }

export const KB_LAYOUT = (() => {
  const keys: KbKey[] = [];
  const rows = [
    ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
    ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
    ['Z', 'X', 'C', 'V', 'B', 'N', 'M'],
  ];
  rows.forEach((row, rowIndex) => {
    const offset = KB_PAD + rowIndex * (KB_PITCH / 2);
    row.forEach((label, index) => keys.push({
      label, x: offset + index * KB_PITCH, y: KB_PAD + rowIndex * KB_PITCH, w: KB_KEY, h: KB_KEY - 6,
    }));
  });
  const spaceY = KB_PAD + 3 * KB_PITCH;
  keys.push({ label: 'SPACJA', x: KB_PAD + 2 * KB_PITCH, y: spaceY, w: 300, h: KB_KEY - 6 });
  const arrowX = KB_PAD + 10 * KB_PITCH + 42;
  keys.push({ label: '↑', x: arrowX + KB_PITCH, y: KB_PAD + KB_PITCH, w: KB_KEY, h: KB_KEY - 6 });
  keys.push({ label: '←', x: arrowX, y: KB_PAD + 2 * KB_PITCH, w: KB_KEY, h: KB_KEY - 6 });
  keys.push({ label: '↓', x: arrowX + KB_PITCH, y: KB_PAD + 2 * KB_PITCH, w: KB_KEY, h: KB_KEY - 6 });
  keys.push({ label: '→', x: arrowX + 2 * KB_PITCH, y: KB_PAD + 2 * KB_PITCH, w: KB_KEY, h: KB_KEY - 6 });

  const middle = (labels: readonly string[]) => {
    const picked = keys.filter(key => labels.includes(key.label));
    return {
      x: picked.reduce((sum, key) => sum + key.x + key.w / 2, 0) / picked.length,
      y: picked.reduce((sum, key) => sum + key.y + key.h / 2, 0) / picked.length,
    };
  };

  const right = arrowX + 2 * KB_PITCH + KB_KEY;
  const bottom = KB_PAD + 4 * KB_PITCH - KB_GAP;
  return {
    width: right + KB_PAD,
    height: bottom + KB_PAD,
    keys,
    zones: {
      wasd: middle(['W', 'A', 'S', 'D']),
      arrows: middle(['↑', '↓', '←', '→']),
      space: middle(['SPACJA']),
    },
  };
})();

/** Mieszanie dwóch kolorów zapisanych heksadecymalnie — zapalone klawisze idą w akcent. */
function mixHex(from: string, to: string, t: number): string {
  const parts = (hex: string) => [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16));
  const [r1, g1, b1] = parts(from);
  const [r2, g2, b2] = parts(to);
  const blend = (a: number, b: number) => Math.round(a + (b - a) * t);
  return `rgb(${blend(r1, r2)}, ${blend(g1, g2)}, ${blend(b1, b2)})`;
}

export function KeyboardMock({
  x, y, rot = 0, scale = 1, className = '', lit = {}, style, children,
}: {
  x: number; y: number; rot?: number; scale?: number; className?: string;
  /** Poziom zapalenia klawisza (0..1) liczony ze scenariusza — zero `Math.random()`. */
  lit?: Record<string, number>;
  style?: CSSProperties;
  children?: ReactNode;
}) {
  const { width, height, keys } = KB_LAYOUT;
  return (
    <div
      className={`film-kb ${className}`}
      style={{
        width, height,
        transform: `translate3d(${(x - width / 2).toFixed(1)}px, ${(y - height / 2).toFixed(1)}px, 0) rotate(${rot.toFixed(2)}deg) scale(${scale.toFixed(3)})`,
      } as CSSProperties}
    >
      {/* Wnętrze ma własny transform: scena animuje wejście tutaj, więc animacja nie
          nadpisuje pozycji rekwizytu (kontrakt widoczności z rundy 19). */}
      <div className="film-kb-enter" style={style}>
        <div className="film-kb-body">
          <span className="film-kb-deck" aria-hidden="true" />
          {keys.map(key => {
            const level = clamp01(lit[key.label] ?? 0);
            return (
              <span
                className={`film-kb-key ${level > .02 ? 'is-lit' : ''}`}
                key={key.label}
                style={{
                  left: key.x, top: key.y, width: key.w, height: key.h,
                  background: `linear-gradient(180deg, ${mixHex('#20242e', '#ffc98a', level)}, ${mixHex('#101319', '#c97a2c', level)})`,
                  borderColor: level > .02 ? `rgba(255, 201, 138, ${(.25 + level * .6).toFixed(2)})` : undefined,
                  boxShadow: level > .02
                    ? `0 0 ${(10 + level * 30).toFixed(0)}px rgba(246, 173, 85, ${(.45 * level).toFixed(2)}), inset 0 1px rgba(255, 255, 255, .12)`
                    : 'inset 0 1px rgba(255, 255, 255, .07), 0 6px 14px -8px #000',
                  color: level > .5 ? '#2a1706' : 'rgba(203, 213, 225, .62)',
                } as CSSProperties}
              >
                {key.label}
              </span>
            );
          })}
          {children}
        </div>
      </div>
    </div>
  );
}

export function PadUi({
  header, ready, accent = '#f6ad55', stick = { x: 0, y: 0 }, pressA = 0, vibrate = 0, small = false,
}: {
  header: string; ready?: string; accent?: string;
  stick?: { x: number; y: number }; pressA?: number; vibrate?: number; small?: boolean;
}) {
  const knob = small ? 34 : 46;
  const base = small ? 76 : 104;
  return (
    <div className={`film-padui ${small ? 'is-small' : ''}`} style={{ '--pad-accent': accent } as CSSProperties}>
      <div className="film-padui-bar">
        <span className="film-padui-dot" />{header}
        {ready && <em className="film-padui-ready">{ready}</em>}
      </div>
      <div className="film-padui-stage">
        <div className="film-padui-stick" style={{ left: 18, bottom: 18, width: base, height: base }}>
          <span className="film-padui-base" />
          <span className="film-padui-knob" style={{ transform: `translate3d(${(stick.x * (base - knob) / 2).toFixed(1)}px, ${(stick.y * (base - knob) / 2).toFixed(1)}px, 0)`, width: knob, height: knob }} />
        </div>
        <div className="film-padui-buttons" style={{ right: 18, bottom: 18 }}>
          <span className="film-padui-b is-y">Y</span>
          <span className="film-padui-b is-x">X</span>
          <span className={`film-padui-b is-a ${pressA > .2 ? 'is-pressed' : ''}`} style={{ '--press': String(1 - pressA * .16) } as CSSProperties}>A</span>
          <span className="film-padui-b is-b">B</span>
          {vibrate > 0 && <span className="film-padui-wave" style={{ opacity: vibrate, transform: `scale(${(1 + vibrate * .5).toFixed(2)})` }} />}
        </div>
      </div>
    </div>
  );
}

export interface VideoPaneProps {
  stem: string;
  /** Scena, w której panel gra — po tym identyfikatorze film wie, że może ruszyć z zegarem. */
  sceneId?: string;
  poster: string;
  /** Czy ten panel ma teraz odtwarzać klip (sterowane z cue w scenie). */
  play: boolean;
  /**
   * Czy montować `<video>` od wejścia w scenę (domyślnie tak).
   * Bramka gotowości czeka na pierwszą klatkę, więc pobieranie musi zacząć się
   * wcześniej niż odtwarzanie — inaczej czekanie czeka na samo siebie.
   * `false` dla scen, które w danym trybie mają zostać przy plakatach (np. kafle
   * podzielonego ekranu w trybie lekkim — tam 14 MB nagrań nie ma po co lecieć).
   */
  preload?: boolean;
  startAt?: number;
  rate?: number;
  paused?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/**
 * Kafel z nagraniem rozgrywki. Wideo montuje się WYŁĄCZNIE wtedy, gdy scena
 * naprawdę je pokazuje (`live`) — telewizor nie ma dekodować czterech klipów
 * w tle, skoro na ekranie jest jeden. `poster` zostaje pod spodem, więc słabsze
 * urządzenie widzi tę samą kompozycję bez ani jednej klatki wideo.
 */
export function VideoPane({
  stem, sceneId = '', poster, play, preload = true, startAt = 0, rate = 1, paused = false, className = '', style, children,
}: VideoPaneProps) {
  const ref = useRef<HTMLVideoElement>(null);
  // Pierwsza klatka klipu: panele zgłaszają gotowość, a film czeka z zegarem (patrz `ready.ts`).
  // `is-loaded` robi miękkie wejście obrazu — bez tego widać było „przeskok" z plakatu na wideo.
  //
  // UWAGA (runda 19, zgłoszenie „za długo się wczytuje”): element `<video>` montuje się
  // **od razu** (`preload`), a nie dopiero w chwili, gdy cue pozwoli odtwarzać. Wcześniej
  // bramka gotowości czekała na pierwszą klatkę, której nikt jeszcze nie pobierał — pobieranie
  // startowało dopiero PO czekaniu. Teraz klip leci przez sieć od wejścia w scenę, bramka
  // puszcza zegar, gdy dane są, a odtwarzanie zaczyna się punktualnie z cue.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); }, [stem]);
  const markLoaded = useCallback(() => {
    setLoaded(true);
    announcePaneReady(sceneId);
  }, [sceneId]);
  // Klip, którego nie da się pobrać (404 po zmianie wersji, brak kodeka), nie może trzymać
  // zegara ani pokazywać czarnego prostokąta: bramka dostaje zwolnienie, a w kadrze zostaje plakat.
  const markFailed = useCallback(() => { announcePaneReady(sceneId); }, [sceneId]);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    node.playbackRate = rate;
    if (!play) { if (!node.paused) node.pause(); return; }
    if (Math.abs(node.currentTime - startAt) > .35) { try { node.currentTime = startAt; } catch { /* metadane jeszcze nie przyszły */ } }
    if (paused) node.pause();
    else void node.play().catch(() => { /* autoplay zablokowany — zostaje plakat */ });
  }, [play, startAt, paused, rate]);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate]);
  return (
    <div className={`film-pane ${className}`} style={style}>
      <img className="film-pane-poster" src={`${import.meta.env.BASE_URL}${poster}`} alt="" />
      {preload && (
        <video ref={ref} className={`film-pane-video ${loaded && play ? 'is-loaded' : ''}`} muted loop playsInline preload="auto"
          onLoadedData={markLoaded} onCanPlay={markLoaded} onError={markFailed} aria-hidden="true">
          <source src={`${import.meta.env.BASE_URL}previews/${stem}.mp4?v=2`} type="video/mp4" />
          <source src={`${import.meta.env.BASE_URL}previews/${stem}.webm?v=2`} type="video/webm" />
        </video>
      )}
      {children}
    </div>
  );
}
