import { useEffect, useState } from 'react';
import { useConsolePreferences } from '../console/preferences';

/** Słucha preferencji systemu „ogranicz animacje” (WCAG). */
export function useReducedMotion(): boolean {
  const prefs = useConsolePreferences();
  const [reduced, setReduced] = useState(() => {
    try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
  });
  useEffect(() => {
    let mq: MediaQueryList;
    try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); } catch { return; }
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced || prefs.motion === 'reduced';
}
