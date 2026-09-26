import { flushSync } from 'react-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';
import { getPreferences } from '../console/preferences';

/* ============================================================================
 * Wspólny system przejść i mikrointerakcji całego interfejsu JoyPad.
 * Biblioteka może użyć wspólnej okładki View Transitions. Sceny canvas
 * i pozostałe przeglądarki korzystają z krótkiego przyciemnienia.
 * ========================================================================== */

export type CurtainPhase = 'idle' | 'cover' | 'reveal';
export interface CurtainState {
  phase: CurtainPhase;
  color: string;
}

const CURTAIN_COVER_MS = 100;
const CURTAIN_TOTAL_MS = CURTAIN_COVER_MS + 180;

/**
 * `begin(kolor, wymiana)` chroni przed równoległymi przejściami.
 * Fallback: 100 ms zasłonięcia + 180 ms odsłonięcia; bez sztucznego ładowania.
 * Przy `prefers-reduced-motion` wymiana dzieje się natychmiast.
 */
export function useCurtain(sharedElements = false) {
  const [state, setState] = useState<CurtainState>({ phase: 'idle', color: '#f97316' });
  const busy = useRef(false);
  const timers = useRef<number[]>([]);
  useEffect(() => () => { timers.current.forEach(clearTimeout); busy.current = false; }, []);

  const begin = useCallback((color: string, swap: () => void) => {
    if (busy.current) return;
    let reduced = false;
    try { reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* brakuje API */ }
    if (reduced || getPreferences().motion === 'reduced') { swap(); return; }
    timers.current.forEach(clearTimeout);
    timers.current = [];
    busy.current = true;
    if (sharedElements && !document.querySelector('canvas,dialog[open]') && typeof document.startViewTransition === 'function') {
      const transition = document.startViewTransition(() => { flushSync(swap); });
      const timeout = window.setTimeout(() => transition.skipTransition(), 700);
      timers.current.push(timeout);
      void transition.finished.catch(() => {}).finally(() => { clearTimeout(timeout); busy.current = false; });
      return;
    }
    setState({ phase: 'cover', color });
    timers.current.push(window.setTimeout(() => {
      swap();
      setState({ phase: 'reveal', color });
    }, CURTAIN_COVER_MS));
    timers.current.push(window.setTimeout(() => {
      setState({ phase: 'idle', color });
      busy.current = false;
    }, CURTAIN_TOTAL_MS));
  }, [sharedElements]);

  return useMemo(() => ({ state, begin }), [state, begin]);
}

export function ScreenCurtain({ state }: { state: CurtainState }) {
  if (state.phase === 'idle') return null;
  return (
    <div className={`screen-curtain ${state.phase === 'cover' ? 'screen-curtain-cover' : 'screen-curtain-reveal'}`} aria-hidden="true">
      <div
        className="screen-curtain-face"
        style={{
          background: `linear-gradient(180deg, color-mix(in srgb, ${state.color} 88%, #0a0a0b) 0%, color-mix(in srgb, ${state.color} 55%, #0a0a0b) 100%)`,
          boxShadow: `0 -3px 0 rgba(255,255,255,.55), 0 -22px 60px rgba(0,0,0,.4)`,
        }}
      >
        <span className="joy-brand text-2xl font-extrabold tracking-[-.04em] text-[#14100b]/80 sm:text-3xl">
          Joy<span className="text-[#14100b]">Pad</span>
        </span>
      </div>
    </div>
  );
}

/* ============================================================================
 * CountUp — liczba „dolicza się” przy ujawnianiu wyników.
 * ========================================================================== */

export function CountUp({ value, duration = 850, className }: { value: number; duration?: number; className?: string }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) { setDisplay(value); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(Math.round(value * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, reduced]);

  return <span className={className}>{display}</span>;
}

/* ============================================================================
 * SegmentedControl — segmenty ze ślizgającym się wskaźnikiem
 * (zastępuje „płaskie” siatki buttonów w menu gier).
 * ========================================================================== */

export interface SegmentedOption<T extends string> { value: T; label: string }

export function SegmentedControl<T extends string>({
  options, value, onChange, accent = '#f97316', label,
}: {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  accent?: string;
  label?: string;
}) {
  const index = Math.max(0, options.findIndex(o => o.value === value));
  const n = options.length;
  return (
    <div className="relative grid auto-cols-fr grid-flow-col items-center rounded-xl border border-white/10 bg-black/30 p-1" role="tablist" aria-label={label}>
      <span
        aria-hidden="true"
        className="absolute inset-y-1 rounded-lg border"
        style={{
          left: 4,
          width: `calc((100% - 8px) / ${n})`,
          transform: `translateX(${index * 100}%)`,
          transition: 'transform 300ms var(--ease-out-quart), background 200ms, border-color 200ms, box-shadow 200ms',
          background: `color-mix(in srgb, ${accent} 18%, rgba(0,0,0,.4))`,
          borderColor: `color-mix(in srgb, ${accent} 55%, transparent)`,
          boxShadow: `0 0 18px color-mix(in srgb, ${accent} 25%, transparent)`,
        }}
      />
      {options.map(o => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={`press relative z-10 rounded-lg px-2 py-1.5 text-[11px] font-bold tracking-wide transition-colors ${active ? '' : 'text-slate-500 hover:text-slate-300'}`}
            style={active ? { color: accent } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
