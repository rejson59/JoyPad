import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { padClient } from '../net/padClient';
import { haptic } from '../pad/haptics';
/** Identity remains constant while the game atmosphere changes. Status comes from host state. */
export function PadShell({ children }: { children: ReactNode }) {
  const [fx, setFx] = useState('');
  const [reminder, setReminder] = useState(false);
  useEffect(() => {
    let timer = 0;
    const remind = () => { setReminder(true); haptic([18, 60, 18], 1); clearTimeout(timer); timer = window.setTimeout(() => setReminder(false), 3500); };
    const reset = () => { window.dispatchEvent(new Event('joypad-release-input')); padClient.releaseInput(); };
    const hidden = () => { if (document.hidden) reset(); };
    const touchEnd = (e: TouchEvent) => { if (!e.touches.length) reset(); };
    window.addEventListener('touchend', touchEnd, { passive: true });
    window.addEventListener('touchcancel', touchEnd, { passive: true });
    window.visualViewport?.addEventListener('resize', reset);
    window.addEventListener('joypad-ready-reminder', remind);
    window.addEventListener('pagehide', reset);
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', hidden);
    return () => { clearTimeout(timer); window.removeEventListener('touchend', touchEnd); window.removeEventListener('touchcancel', touchEnd); window.visualViewport?.removeEventListener('resize', reset); window.removeEventListener('joypad-ready-reminder', remind); window.removeEventListener('pagehide', reset); window.removeEventListener('blur', reset); document.removeEventListener('visibilitychange', hidden); padClient.releaseInput(); };
  }, []);
  useEffect(() => {
    let timer = 0;
    const receive = (e: Event) => { setFx((e as CustomEvent<string>).detail); clearTimeout(timer); timer = window.setTimeout(() => setFx(''), 240); };
    window.addEventListener('joypad-pad-fx', receive);
    return () => { clearTimeout(timer); window.removeEventListener('joypad-pad-fx', receive); };
  }, []);
  const [state, setState] = useState(padClient.state);
  useEffect(() => padClient.subscribe(setState), []);
  const countdown = state.game === 'tanks' ? state.hud?.countdown : state.arcadeHud?.countdown;
  const paused = state.game === 'tanks' ? state.hud?.paused : state.arcadeHud?.paused;
  const beat = Math.ceil(countdown ?? 0);
  useEffect(() => { if (beat > 0) haptic(12, 1); }, [beat]);
  return <div className="pad-shell" style={{ '--player-color': state.color || 'var(--os-accent)' } as CSSProperties}>
    {children}
    {reminder && state.status === 'connected' && (state.screen === 'menu' || state.screen === 'setup') && <div className="pad-reminder" role="status">Ekipa czeka. Potwierdź gotowość, gdy będziesz gotowy.</div>}
    <div className="pad-lightbar" data-fx={fx} data-state={state.status === 'connected' ? state.screen : state.status} />
    {state.status === 'connected' && state.screen === 'game' && (paused || (countdown ?? 0) > 0) && <div className="pad-stage-status" role="status">{paused ? 'PAUZA · ODPOCZNIJ' : `GOTOWOŚĆ · ${Math.ceil(countdown!)}`}</div>}
  </div>;
}
