import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { announcePaneReady } from './ready';

/**
 * Rekwizyty filmu: telefon, telewizor, kontroler i ekran pada.
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
  live: boolean;
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
export function VideoPane({ stem, sceneId = '', poster, live, startAt = 0, rate = 1, paused = false, className = '', style, children }: VideoPaneProps) {
  const ref = useRef<HTMLVideoElement>(null);
  // Pierwsza klatka klipu: panele zgłaszają gotowość, a film czeka z zegarem (patrz `ready.ts`).
  // `is-loaded` robi miękkie wejście obrazu — bez tego widać było „przeskok" z plakatu na wideo.
  const [loaded, setLoaded] = useState(false);
  useEffect(() => { setLoaded(false); }, [stem, live]);
  const markLoaded = useCallback(() => {
    const node = ref.current;
    if (!node) return;
    setLoaded(true);
    announcePaneReady(sceneId);
  }, [sceneId]);
  useEffect(() => {
    const node = ref.current;
    if (!node || !live) return;
    node.playbackRate = rate;
    if (Math.abs(node.currentTime - startAt) > .35) { try { node.currentTime = startAt; } catch { /* metadane jeszcze nie przyszły */ } }
    if (paused) node.pause();
    else void node.play().catch(() => { /* autoplay zablokowany — zostaje plakat */ });
  }, [live, startAt, paused, rate]);
  useEffect(() => {
    if (ref.current) ref.current.playbackRate = rate;
  }, [rate]);
  return (
    <div className={`film-pane ${className}`} style={style}>
      <img className="film-pane-poster" src={`${import.meta.env.BASE_URL}${poster}`} alt="" />
      {live && (
        <video ref={ref} className={`film-pane-video ${loaded ? 'is-loaded' : ''}`} muted loop playsInline preload="auto"
          onLoadedData={markLoaded} onCanPlay={markLoaded} aria-hidden="true">
          <source src={`${import.meta.env.BASE_URL}previews/${stem}.mp4?v=2`} type="video/mp4" />
          <source src={`${import.meta.env.BASE_URL}previews/${stem}.webm?v=2`} type="video/webm" />
        </video>
      )}
      {children}
    </div>
  );
}
