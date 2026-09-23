import { useCallback, useEffect, useRef, useState } from 'react';

interface Props {
  size?: number;
  color: string;
  onChange: (x: number, y: number) => void;
  disabled?: boolean;
}

/**
 * Wirtualny joystick analogowy (pointer events, jeden palec).
 * x: -1..1 (lewo/prawo), y: -1..1 (góra = +1 = przód).
 */
export function Joystick({ size = 200, color, onChange, disabled }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const pointerId = useRef<number | null>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const radius = size / 2;
  const knobR = size * 0.22;
  const maxTravel = radius - knobR * 0.9;

  const update = useCallback((clientX: number, clientY: number) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let dx = clientX - cx, dy = clientY - cy;
    const d = Math.hypot(dx, dy);
    if (d > maxTravel) { dx = dx / d * maxTravel; dy = dy / d * maxTravel; }
    setKnob({ x: dx, y: dy });
    let nx = dx / maxTravel, ny = -dy / maxTravel;
    // martwa strefa i lekka krzywa czułości
    const mag = Math.hypot(nx, ny);
    if (mag < 0.12) { nx = 0; ny = 0; }
    else {
      const m2 = Math.min(1, (mag - 0.12) / 0.88);
      const curved = Math.pow(m2, 1.25);
      nx = nx / mag * curved; ny = ny / mag * curved;
    }
    onChange(nx, ny);
  }, [maxTravel, onChange]);

  const release = useCallback(() => {
    pointerId.current = null;
    setKnob({ x: 0, y: 0 });
    onChange(0, 0);
  }, [onChange]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const down = (e: PointerEvent) => {
      if (disabled) return;
      if (pointerId.current !== null) return;
      pointerId.current = e.pointerId;
      el.setPointerCapture(e.pointerId);
      update(e.clientX, e.clientY);
      e.preventDefault();
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== pointerId.current) return;
      update(e.clientX, e.clientY);
      e.preventDefault();
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== pointerId.current) return;
      release();
    };
    el.addEventListener('pointerdown', down, { passive: false });
    el.addEventListener('pointermove', move, { passive: false });
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('lostpointercapture', up);
    return () => {
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      el.removeEventListener('lostpointercapture', up);
    };
  }, [update, release, disabled]);

  const active = pointerId.current !== null || knob.x !== 0 || knob.y !== 0;

  return (
    <div
      ref={ref}
      className="relative select-none rounded-full"
      style={{
        width: size, height: size, touchAction: 'none',
        background: 'radial-gradient(circle at 50% 45%, #2a2a30 0%, #151518 70%, #0c0c0e 100%)',
        boxShadow: `inset 0 4px 14px rgba(0,0,0,0.8), 0 0 0 3px #26262b, 0 0 ${active ? 34 : 14}px ${color}${active ? '77' : '33'}`,
        opacity: disabled ? 0.4 : 1,
        transition: 'box-shadow 120ms',
      }}
    >
      {/* krzyż kierunków */}
      {[0, 90, 180, 270].map(a => (
        <div key={a} className="absolute left-1/2 top-1/2 h-0 w-0" style={{ transform: `translate(-50%,-50%) rotate(${a}deg) translateY(${-radius * 0.72}px)` }}>
          <div style={{ width: 0, height: 0, borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderBottom: `10px solid ${color}55`, transform: 'translate(-50%,-50%)' }} />
        </div>
      ))}
      <div className="absolute inset-[18%] rounded-full border border-white/5" />
      {/* gałka */}
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
      </div>
    </div>
  );
}
