import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

/**
 * Ekran ładowania JoyPad: logo z poświatą, przesuwający się skanlinia i „WITAJ”.
 * Znika sam po ~1,6 s (0,35 s przy „ogranicz animacje”) i wywołuje onDone.
 */
export function BootSplash({ onDone }: { onDone: () => void }) {
  const reduced = useReducedMotion();
  const done = useRef(onDone);
  useEffect(() => { done.current = onDone; }, [onDone]);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    let seen = false;
    try { seen = sessionStorage.getItem('joypad.boot') === '1'; } catch { /* storage optional */ }
    const total = seen || reduced ? 0 : 650;
    const fade = seen || reduced ? 0 : 180;
    const t1 = window.setTimeout(() => setLeaving(true), total);
    const t2 = window.setTimeout(() => { try { sessionStorage.setItem('joypad.boot', '1'); } catch { /* optional */ } done.current(); }, total + fade);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
  }, [reduced]);

  return (
    <div
      className={`fixed inset-0 z-[110] flex flex-col items-center justify-center overflow-hidden bg-[#070a10] transition-opacity duration-300 ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      aria-hidden="true"
    >
      <div className="pointer-events-none absolute inset-0 opacity-[.05]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '44px 44px' }} />
      <div className="relative overflow-hidden px-6 py-3">
        <div className="joy-brand text-[54px] font-extrabold leading-none tracking-[-.06em] text-white sm:text-[72px]" style={{ animation: reduced ? undefined : 'boot-glow 1s cubic-bezier(.2,.7,.2,1) both', textShadow: '0 0 42px rgba(145,213,255,.2)' }}>
          Joy<span className="text-orange-400">Pad</span><span className="text-orange-400">.</span>
        </div>
        {!reduced && <div className="pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-orange-300/25 to-transparent" style={{ animation: 'boot-scan 1.1s .15s ease-in-out both' }} />}
      </div>
      <div className="joy-kicker mt-3 text-[11px] tracking-[.5em] text-orange-200/80" style={{ animation: reduced ? undefined : 'boot-hello .7s .55s ease-out both' }}>TWÓJ WIECZÓR. TWOJA GRA.</div>
    </div>
  );
}
