import { useEffect, useRef, useState } from 'react';
import { Gamepad2, Monitor, Smartphone } from 'lucide-react';
import { JoyPadLogo } from './JoyPadLogo';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useLanguage } from '../platform/i18n';

type BootSplashVariant = 'console' | 'controller';

function isCompactScreen(variant: BootSplashVariant): boolean {
  if (variant === 'controller') return true;
  try { return window.matchMedia('(max-width: 640px)').matches; }
  catch { return window.innerWidth <= 640; }
}

/** A short console boot sequence; full on TV, compact on a controller-sized screen. */
export function BootSplash({ onDone, variant = 'console' }: { onDone: () => void; variant?: BootSplashVariant }) {
  const reduced = useReducedMotion();
  const language = useLanguage();
  const compact = isCompactScreen(variant);
  const done = useRef(onDone);
  const skip = useRef<() => void>(() => {});
  useEffect(() => { done.current = onDone; }, [onDone]);
  const [leaving, setLeaving] = useState(false);
  const [complete, setComplete] = useState(reduced);
  const en = language === 'en';

  useEffect(() => {
    if (reduced) {
      setComplete(true);
      done.current();
      return;
    }

    let finished = false;
    let fadeTimer: number | undefined;
    const finish = () => {
      if (finished) return;
      finished = true;
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('joypad-dialog-command', onRemoteCommand);
      setLeaving(true);
      fadeTimer = window.setTimeout(() => {
        setComplete(true);
        done.current();
      }, 300);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ' && event.key !== 'Escape') return;
      event.preventDefault();
      finish();
    };
    const onPointerDown = () => finish();
    const onRemoteCommand = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (command === 'select' || command === 'back' || command === 'home') finish();
    };

    skip.current = finish;
    const visibleTimer = window.setTimeout(finish, compact ? 520 : 1900);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('joypad-dialog-command', onRemoteCommand);
    return () => {
      if (visibleTimer !== undefined) window.clearTimeout(visibleTimer);
      if (fadeTimer !== undefined) window.clearTimeout(fadeTimer);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('joypad-dialog-command', onRemoteCommand);
      skip.current = () => {};
    };
  }, [compact, reduced]);

  if (complete) return null;

  const skipNow = () => skip.current();
  return (
    <div
      className={`boot-splash fixed inset-0 z-[110] flex flex-col items-center justify-center overflow-hidden bg-[#070a10] text-white transition-opacity duration-300 ${compact ? 'boot-splash-compact' : ''} ${reduced ? 'boot-splash-reduced' : ''} ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="status"
      aria-label={en ? 'JoyPad is starting. Tap or press Enter to skip.' : 'Uruchamianie JoyPad. Dotknij ekranu lub naciśnij Enter, aby pominąć.'}
      onPointerDown={skipNow}
    >
      <div className="boot-grid pointer-events-none absolute inset-0 opacity-[.05]" aria-hidden="true" />
      <div className="boot-halo pointer-events-none absolute inset-0" aria-hidden="true"><span /><span /></div>

      <div className="boot-core relative z-10 flex flex-col items-center">
        <JoyPadLogo size={compact ? 98 : 120} className="logo-pop boot-logo" />
        <div className="boot-word-wrap relative overflow-hidden px-5 py-2">
          <h1 className="boot-brand joy-brand text-[54px] font-extrabold leading-none tracking-[-.06em] sm:text-[72px]">
            Joy<span className="text-orange-400">Pad</span><span className="text-orange-400">.</span>
          </h1>
          {!reduced && <div className="boot-scan pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-transparent via-orange-300/25 to-transparent" aria-hidden="true" />}
        </div>
        <div className="boot-kicker joy-kicker mt-3 text-[11px] tracking-[.5em] text-orange-200/80">
          {en ? 'YOUR EVENING. YOUR GAME.' : 'TWÓJ WIECZÓR. TWOJA GRA.'}
        </div>
      </div>

      {!compact && <div className="boot-steps relative z-10" aria-hidden="true">
        <div className="boot-step" style={{ '--boot-delay': '160ms', '--boot-accent': '#f6ad55' } as React.CSSProperties}>
          <span className="boot-step-icon"><Monitor size={17} /></span>
          <span><b>{en ? 'CHOOSE A WORLD' : 'WYBIERZ ŚWIAT'}</b><small>{en ? 'Steel Front · Neon Rush' : 'Stalowy Front · Neonowy Pęd'}</small></span>
          <i>01</i>
        </div>
        <div className="boot-step" style={{ '--boot-delay': '270ms', '--boot-accent': '#8dcff3' } as React.CSSProperties}>
          <span className="boot-step-icon"><Smartphone size={17} /></span>
          <span><b>{en ? 'CONNECT A PHONE' : 'POŁĄCZ TELEFON'}</b><small>{en ? 'Scan the QR code' : 'Zeskanuj kod QR'}</small></span>
          <i>02</i>
        </div>
        <div className="boot-step" style={{ '--boot-delay': '380ms', '--boot-accent': '#bda8fa' } as React.CSSProperties}>
          <span className="boot-step-icon"><Gamepad2 size={17} /></span>
          <span><b>{en ? 'PLAY TOGETHER' : 'GRAJCIE RAZEM'}</b><small>{en ? 'Up to four controllers' : 'Do czterech kontrolerów'}</small></span>
          <i>03</i>
        </div>
      </div>}

      <button type="button" className="boot-skip relative z-10" onClick={skipNow}>
        <span>{en ? 'Tap or press Enter to skip' : 'Dotknij lub naciśnij Enter, aby pominąć'}</span>
        {!compact && <kbd>ENTER</kbd>}
      </button>
    </div>
  );
}
