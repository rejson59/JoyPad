import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import type { PadSteer } from '../net/protocol';
import { unlockHaptics } from './haptics';

/** Martwa strefa (część promienia) — drżący palec nie rusza czołgu. */
const DEAD_ZONE = 0.12;
/** Wykładnik krzywej czułości: delikatny start, pełna moc przy końcu wychylenia. */
const CURVE = 1.2;

/** Clamp, który nie wysypuje się, gdy min > max (bardzo wąska strefa). */
function clampRange(min: number, v: number, max: number) {
  if (max <= min) return (min + max) / 2;
  return v < min ? min : v > max ? max : v;
}

export interface JoystickProps {
  size?: number;
  color: string;
  /** x: -1..1 (lewo/prawo), y: -1..1 (góra = +1). */
  onChange: (x: number, y: number) => void;
  disabled?: boolean;
  /** `direct` = jedziesz tam, gdzie pchasz; `tank` = góra/dół = przód/tył czołgu. */
  mode?: PadSteer;
  /**
   * Szerokość strefy dotyku (w % szerokości ekranu). Dotknięcie w dowolnym miejscu
   * tej strefy ustawia gałkę pod palcem — nie trzeba trafiać w kółko.
   */
  zoneWidthPct?: number;
  /** Krótki impuls haptyczny, gdy gałka wchodzi/wychodzi z martwej strefy. */
  onTick?: () => void;
  /** Podpis pod gałką (zależy od trybu sterowania). */
  caption?: string;
  /** Treść nad gałką w pozycji domowej (np. przełącznik trybu sterowania). */
  children?: ReactNode;
  /** Treść obok gałki, od strony środka ekranu (np. przycisk ognia przy celowaniu). */
  sideSlot?: ReactNode;
  /** Po której stronie ekranu leży strefa joysticka. */
  side?: 'left' | 'right';
  /**
   * Próg wychylenia (0..1), od którego zewnętrzny pierścień świeci na czerwono —
   * wizualna podpowiedź auto-ognia przy joysticku celowania.
   */
  hotRing?: number;
  /** Wywoływane, gdy gałka wchodzi / wychodzi z pierścienia `hotRing`. */
  onHotChange?: (hot: boolean) => void;
  /** Etykieta w środku gałki, gdy nie jest wciśnięta. */
  label?: string;
  zIndex?: number;
  /** Dodatkowy odstęp joysticka od dolnej krawędzi (podpis/bezpieczny obszar). */
  bottomPadding?: number;
}

/**
 * Wirtualny joystick analogowy z **pływającą strefą dotyku** (pointer events, jeden palec).
 *
 * - Dotknij gdziekolwiek w strefie po lewej stronie — gałka pojawia się pod palcem,
 *   więc kciuk nigdy „nie ucieknie” z joysticka.
 * - Po puszczeniu gałka wraca na swoje miejsce i wysyła zero.
 * - Kierunek z gałki jest zawsze w przestrzeni ekranu (y w dół = dół ekranu);
 *   interpretację (jazda w kierunku vs. przód/tył czołgu) robi gra zgodnie z `mode`.
 */
export function Joystick({
  size = 200,
  color,
  onChange,
  disabled,
  mode = 'direct',
  zoneWidthPct = 54,
  onTick,
  caption,
  children,
  sideSlot,
  side = 'left',
  hotRing,
  onHotChange,
  label,
  zIndex = 20,
  bottomPadding = 46,
}: JoystickProps) {
  const zoneRef = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  /** Środek gałki (współrzędne strefy) — domowy albo ten „złapany” palcem. */
  const originRef = useRef({ x: 0, y: 0 });
  /** Martwa strefa przekroczona? (do haptyki — bez re-renderów). */
  const engaged = useRef(false);
  const onChangeRef = useRef(onChange);
  const onTickRef = useRef(onTick);
  const onHotRef = useRef(onHotChange);
  const hotRef = useRef(false);
  useEffect(() => { onHotRef.current = onHotChange; }, [onHotChange]);

  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [floating, setFloating] = useState<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(false);
  const [zone, setZone] = useState({ left: 0, top: 0, w: 0, h: 0 });

  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
  useEffect(() => { onTickRef.current = onTick; }, [onTick]);

  const radius = size / 2;
  const knobR = size * 0.22;
  const maxTravel = radius - knobR * 0.9;

  /* ---- pomiar strefy (obrócenie telefonu, zmiana rozmiaru okna) ---- */
  useEffect(() => {
    const el = zoneRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setZone(z => (z.left === r.left && z.top === r.top && z.w === r.width && z.h === r.height)
        ? z
        : { left: r.left, top: r.top, w: r.width, h: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('orientationchange', measure);
    window.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      window.removeEventListener('orientationchange', measure);
      window.removeEventListener('scroll', measure);
    };
  }, []);

  const zoneW = zone.w || Math.round(window.innerWidth * zoneWidthPct / 100);
  const zoneH = zone.h || window.innerHeight;

  /* ---- pozycja domowa i bieżący środek ---- */
  const bottomPad = bottomPadding;
  const homeX = clampRange(radius + 16, zoneW * (sideSlot ? 0.34 : 0.42), zoneW - radius - 14);
  const home = {
    // strefa po prawej = lustrzane odbicie (gałka bliżej prawej krawędzi)
    x: side === 'right' ? zoneW - homeX : homeX,
    y: clampRange(radius + 56, zoneH - radius - bottomPad, zoneH - radius - 12),
  };
  const cx = floating ? floating.x : home.x;
  const cy = floating ? floating.y : home.y;

  /* ---- przeliczenie wychylenia na -1..1 ---- */
  const emit = useCallback((dxRaw: number, dyRaw: number) => {
    let dx = dxRaw, dy = dyRaw;
    const d = Math.hypot(dx, dy);
    if (d > maxTravel) { dx = dx / d * maxTravel; dy = dy / d * maxTravel; }
    setKnob(k => (k.x === dx && k.y === dy) ? k : { x: dx, y: dy });

    // y odwracamy: góra ekranu = +1 (tak było zawsze — tryb „CZOŁG” się nie zmienia)
    let nx = dx / maxTravel, ny = -dy / maxTravel;
    const mag = Math.hypot(nx, ny);
    if (mag >= DEAD_ZONE) {
      const m2 = Math.min(1, (mag - DEAD_ZONE) / (1 - DEAD_ZONE));
      const curved = Math.pow(m2, CURVE);
      nx = nx / mag * curved;
      ny = ny / mag * curved;
    } else {
      nx = 0; ny = 0;
    }
    if (hotRing !== undefined) {
      const isHot = d / maxTravel >= hotRing;
      if (isHot !== hotRef.current) { hotRef.current = isHot; onHotRef.current?.(isHot); }
    }
    const on = nx !== 0 || ny !== 0;
    if (on !== engaged.current) {
      engaged.current = on;
      onTickRef.current?.();
    }
    onChangeRef.current(nx, ny);
  }, [maxTravel, hotRing]);

  const localPoint = useCallback((clientX: number, clientY: number) => {
    const r = zoneRef.current?.getBoundingClientRect();
    return { x: clientX - (r?.left ?? 0), y: clientY - (r?.top ?? 0) };
  }, []);

  const release = useCallback(() => {
    pointerId.current = null;
    engaged.current = false;
    if (hotRef.current) { hotRef.current = false; onHotRef.current?.(false); }
    setFloating(null);
    setKnob({ x: 0, y: 0 });
    setActive(false);
    onChangeRef.current(0, 0);
  }, []);

  const onPointerDown = (e: RPointerEvent<HTMLDivElement>) => {
    if (disabled || pointerId.current !== null) return;
    unlockHaptics();
    const el = zoneRef.current;
    if (!el) return;
    pointerId.current = e.pointerId;
    engaged.current = false;
    try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = localPoint(e.clientX, e.clientY);
    const origin = {
      x: clampRange(radius + 6, p.x, zoneW - radius - 6),
      y: clampRange(radius + 6, p.y, zoneH - radius - bottomPad + 10),
    };
    originRef.current = origin;
    setFloating(origin);
    setActive(true);
    setKnob({ x: 0, y: 0 });
    onChangeRef.current(0, 0);
    e.preventDefault();
  };

  const onPointerMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerId.current) return;
    const p = localPoint(e.clientX, e.clientY);
    emit(p.x - originRef.current.x, p.y - originRef.current.y);
    e.preventDefault();
  };

  const onPointerUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== pointerId.current) return;
    release();
  };

  // Gałka musi wrócić do zera, nawet gdy ekran pada znika spod palca.
  useEffect(() => () => { onChangeRef.current(0, 0); }, []);
  useEffect(() => { if (disabled) release(); }, [disabled, release]);

  /* ---- wygląd ---- */
  const knobMag = Math.min(1, Math.hypot(knob.x, knob.y) / maxTravel);
  const hot = hotRing !== undefined && knobMag >= hotRing;
  const knobAng = Math.atan2(knob.y, knob.x) * 180 / Math.PI; // 0 = prawo, 90 = dół
  /** Która strzałka jest „zapalona” (kierunek bliski wychyleniu). */
  const lit = (arrowDeg: number) => knobMag > 0.25 && Math.abs(((knobAng - arrowDeg + 540) % 360) - 180) < 45;

  return (
    <div
      ref={zoneRef}
      className={`fixed bottom-0 top-0 select-none ${side === 'right' ? 'right-0' : 'left-0'}`}
      style={{ width: `${zoneWidthPct}%`, touchAction: 'none', zIndex, opacity: disabled ? 0.4 : 1 }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onLostPointerCapture={onPointerUp}
      onContextMenu={e => e.preventDefault()}
    >
      {/* treść nad gałką (przełącznik trybu) — klikalna, nie przechwytuje jazdy */}
      {children && (
        <div
          className="pointer-events-auto absolute z-10 flex -translate-x-1/2 justify-center"
          style={{ left: home.x, bottom: zoneH - home.y + radius + 12 }}
          onPointerDown={e => e.stopPropagation()}
        >
          {children}
        </div>
      )}

      {/* treść obok gałki (od strony środka ekranu) — w pozycji domowej */}
      {sideSlot && (
        <div
          className="pointer-events-auto absolute z-10 -translate-y-1/2"
          style={side === 'right'
            ? { right: zoneW - home.x + radius + 14, top: home.y - radius * 0.35 }
            : { left: home.x + radius + 14, top: home.y - radius * 0.35 }}
          onPointerDown={e => e.stopPropagation()}
        >
          {sideSlot}
        </div>
      )}

      {/* gałka */}
      <div
        className="absolute"
        style={{
          left: cx, top: cy, width: size, height: size,
          transform: 'translate(-50%,-50%)',
          transition: floating ? 'none' : 'left 140ms ease-out, top 140ms ease-out',
        }}
      >
        <div
          className="relative h-full w-full rounded-full"
          style={{
            background: 'radial-gradient(circle at 50% 45%, #2a2a30 0%, #151518 70%, #0c0c0e 100%)',
            boxShadow: hot
              ? `inset 0 4px 14px rgba(0,0,0,0.8), 0 0 0 3px #ef4444, 0 0 34px #ef4444aa`
              : `inset 0 4px 14px rgba(0,0,0,0.8), 0 0 0 3px #26262b, 0 0 ${active ? 34 : 14}px ${color}${active ? '77' : '33'}`,
            transition: 'box-shadow 120ms',
          }}
        >
          {/* obwód, po którym jeździ gałka */}
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/10"
            style={{ width: maxTravel * 2, height: maxTravel * 2 }}
          />
          <div className="absolute inset-[18%] rounded-full border border-white/5" />
          {/* strefa auto-ognia: pierścień przy krawędzi */}
          {hotRing !== undefined && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                width: (hotRing * maxTravel + knobR) * 2,
                height: (hotRing * maxTravel + knobR) * 2,
                border: `2px solid ${hot ? '#ef4444' : '#ef444444'}`,
              }}
            />
          )}
          {label && knobMag < 0.05 && (
            <span className="pointer-events-none absolute left-1/2 top-[26%] -translate-x-1/2 text-[8px] font-black tracking-[0.15em]" style={{ color: `${color}88` }}>{label}</span>
          )}

          {/* cztery strzałki: góra / prawo / dół / lewo */}
          {[-90, 0, 90, 180].map(a => {
            const on = lit(a);
            return (
              <div
                key={a}
                className="absolute left-1/2 top-1/2 h-0 w-0"
                style={{ transform: `translate(-50%,-50%) rotate(${a + 90}deg) translateY(${-radius * 0.78}px)` }}
              >
                <div
                  style={{
                    width: 0, height: 0,
                    borderLeft: '8px solid transparent', borderRight: '8px solid transparent',
                    borderBottom: `12px solid ${on ? color : `${color}44`}`,
                    transform: 'translate(-50%,-50%)',
                    filter: on ? `drop-shadow(0 0 6px ${color})` : 'none',
                    transition: 'border-bottom-color 90ms, filter 90ms',
                  }}
                />
              </div>
            );
          })}

          {/* tryb CZOŁG: przypomnienie, że góra/dół to przód/tył czołgu, a nie ekranu */}
          {mode === 'tank' && (
            <>
              <span className="pointer-events-none absolute left-1/2 top-[19%] -translate-x-1/2 text-[8px] font-black tracking-[0.15em]" style={{ color: `${color}99` }}>PRZÓD</span>
              <span className="pointer-events-none absolute bottom-[19%] left-1/2 -translate-x-1/2 text-[8px] font-black tracking-[0.15em]" style={{ color: `${color}99` }}>TYŁ</span>
              <span className="pointer-events-none absolute left-[17%] top-1/2 -translate-y-1/2 text-[10px] font-black" style={{ color: `${color}99` }}>⟲</span>
              <span className="pointer-events-none absolute right-[17%] top-1/2 -translate-y-1/2 text-[10px] font-black" style={{ color: `${color}99` }}>⟳</span>
            </>
          )}

          {/* wskazówka kierunku */}
          {knobMag > 0.02 && (
            <div
              className="absolute left-1/2 top-1/2 origin-left"
              style={{
                width: Math.hypot(knob.x, knob.y), height: 2,
                transform: `translateY(-50%) rotate(${knobAng}deg)`,
                background: `linear-gradient(90deg, ${color}00, ${color}bb)`,
              }}
            />
          )}

          {/* gałka (knob) */}
          <div
            className="absolute left-1/2 top-1/2 rounded-full"
            style={{
              width: knobR * 2, height: knobR * 2,
              transform: `translate(calc(-50% + ${knob.x}px), calc(-50% + ${knob.y}px))`,
              background: `radial-gradient(circle at 35% 30%, ${color} 0%, ${color}cc 40%, #1a1a1e 100%)`,
              boxShadow: `0 6px 18px rgba(0,0,0,0.7), inset 0 -4px 10px rgba(0,0,0,0.5), 0 0 22px ${color}66`,
              transition: active ? 'none' : 'transform 120ms ease-out',
            }}
          >
            <div className="absolute inset-[30%] rounded-full" style={{ background: 'repeating-radial-gradient(circle, rgba(0,0,0,0.25) 0 1px, transparent 1px 4px)' }} />
            {/* strzałka na gałce pokazuje, w którą stronę pchasz */}
            <div
              className="absolute inset-0"
              style={{ transform: `rotate(${knobAng + 90}deg)`, opacity: knobMag > 0.05 ? 0.9 : 0.35, transition: 'opacity 120ms' }}
            >
              <div
                className="absolute left-1/2 top-[18%] -translate-x-1/2"
                style={{ width: 0, height: 0, borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '9px solid rgba(0,0,0,0.55)' }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* podpis pod gałką */}
      {caption && (
        <div
          className="pointer-events-none absolute w-full -translate-x-1/2 text-center text-[10px] font-bold leading-tight tracking-widest text-zinc-500"
          style={{ left: cx, top: cy + radius + 8, transition: floating ? 'none' : 'left 140ms ease-out, top 140ms ease-out' }}
        >
          {caption}
        </div>
      )}
    </div>
  );
}
