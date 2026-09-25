import { useEffect, useRef } from 'react';
import { useReducedMotion } from '../lib/useReducedMotion';

/**
 * Addytywny kursor-światło: mała kropka idzie za palcem 1:1, a pierścień
 * „dosiada się” z lerpem i powiększa nad elementami interaktywnymi.
 * Tylko desktop (pointer: fine), wyłączony przy reduced-motion.
 * Nie ukrywa natywnego wskaźnika — to akcent, nie zamiana kursora.
 */
export function CursorGlow({ color = '#f97316' }: { color?: string }) {
  const reduced = useReducedMotion();
  const ringAnchor = useRef<HTMLDivElement>(null);
  const dotAnchor = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced) return;
    const fine = (() => { try { return window.matchMedia('(pointer: fine)').matches; } catch { return false; } })();
    if (!fine) return;

    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let rx = x;
    let ry = y;
    let visible = false;
    let raf = 0;

    const setHover = (on: boolean) => ringAnchor.current?.classList.toggle('is-hover', on);

    const onMove = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
      if (!visible) {
        visible = true;
        ringAnchor.current?.classList.add('is-on');
        dotAnchor.current?.classList.add('is-on');
      }
      const target = e.target as Element | null;
      setHover(Boolean(target?.closest?.('a,button,select,textarea,[role="button"],[role="tab"]')));
    };
    const onLeave = () => {
      visible = false;
      ringAnchor.current?.classList.remove('is-on');
      dotAnchor.current?.classList.remove('is-on');
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      rx += (x - rx) * 0.16;
      ry += (y - ry) * 0.16;
      if (ringAnchor.current) ringAnchor.current.style.transform = `translate3d(${rx - 17}px, ${ry - 17}px, 0)`;
      if (dotAnchor.current) dotAnchor.current.style.transform = `translate3d(${x - 2.5}px, ${y - 2.5}px, 0)`;
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, [reduced]);

  if (reduced) return null;
  return (
    <div aria-hidden="true">
      <div ref={ringAnchor} className="cursor-glow-anchor">
        <div className="cursor-glow-ring" style={{ borderColor: `${color}bf` }} />
      </div>
      <div ref={dotAnchor} className="cursor-glow-anchor">
        <div className="cursor-glow-dot" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
      </div>
    </div>
  );
}
