import { QuickPadTest } from '../console/QuickPadTest';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Gamepad2, Sparkles, Zap } from 'lucide-react';
import { padClient } from '../net/padClient';
import { getHapticStatus, haptic, unlockHaptics } from './haptics';

/**
 * LAB KONTROLERA na telefonie — „Astro's Playroom” dla JoyPad.
 *
 * Trzy mini-testy tu po sparowaniu, zanim przejdziesz do menu:
 *  1) GRZECHOTKA — potrząśnij telefonem, kulki w pudełku grzechoczą (Vibration API),
 *  2) STREFY HAPTYCZNE — 8 kolorowych przycisków, każdy z unikalnym impulsem wibracji,
 *  3) ŻYROSKOP/GRAWITACJA — przechyl telefon, kulki toczą się za przechyłem.
 *
 * Sensory lecą też do komputera (istniejącym kanałem wejść pada — bez zmian protokołu),
 * więc na dużym ekranie równolegle działa pokój zabaw.
 */

const ZONES = [
  { name: 'KLIK', color: '#fbbf24', pattern: [12] },
  { name: 'DUBLET', color: '#fb923c', pattern: [18, 30, 18] },
  { name: 'BUZZ', color: '#f472b6', pattern: [70] },
  { name: 'SERCE', color: '#ef4444', pattern: [40, 60, 80] },
  { name: 'TRZEPOT', color: '#a78bfa', pattern: [8, 14, 8, 14, 8, 14, 8] },
  { name: 'SERIA', color: '#38bdf8', pattern: [8, 12, 8, 12, 8, 12] },
  { name: 'FALA', color: '#2dd4bf', pattern: [140, 50, 140] },
  { name: 'BĘBEN', color: '#a3e635', pattern: [6, 22, 45] },
];

interface Ball { x: number; y: number; vx: number; vy: number; r: number; color: string }

const clamp1 = (v: number) => Math.max(-1, Math.min(1, v));

function SensorLabPad({ nick, color, onDone }: { nick: string; color: string; onDone: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [pressed, setPressed] = useState<number[]>([]);
  const maskRef = useRef(0);
  const tilt = useRef({ gamma: 0, beta: 0 });
  const rot = useRef({ alpha: 0, beta: 0, gamma: 0 });
  const grav = useRef({ x: 0, y: 1 });
  const shakeRef = useRef(0);
  const rattleAt = useRef(0);
  const fakeShake = useRef(0);
  const [sensorsReady, setSensorsReady] = useState(false);
  const [needsPermission, setNeedsPermission] = useState(
    () => typeof (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent?.requestPermission === 'function',
  );

  const buzz = useCallback((pattern: number | number[]) => {
    if (getHapticStatus() !== 'ready') unlockHaptics();
    haptic(pattern);
  }, []);

  /* ---- sensory ---- */
  useEffect(() => {
    const onOrient = (e: DeviceOrientationEvent) => {
      tilt.current = { gamma: e.gamma ?? 0, beta: e.beta ?? 0 };
      rot.current = { alpha: (e.alpha ?? 0) / 180, beta: (e.gamma ?? 0) / 180, gamma: (e.beta ?? 0) / 180 };
    };
    const onMotion = (e: DeviceMotionEvent) => {
      const g = e.accelerationIncludingGravity;
      if (g) grav.current = { x: -(g.x ?? 0) / 9.8, y: (g.y ?? 0) / 9.8 };
      const a = e.acceleration;
      if (a) {
        const mag = Math.hypot(a.x ?? 0, a.y ?? 0, a.z ?? 0);
        shakeRef.current = Math.max(shakeRef.current, Math.min(1, mag / 22));
      }
    };
    window.addEventListener('deviceorientation', onOrient);
    window.addEventListener('devicemotion', onMotion);
    return () => {
      window.removeEventListener('deviceorientation', onOrient);
      window.removeEventListener('devicemotion', onMotion);
    };
  }, []);

  const enableSensors = async () => {
    try {
      const O = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
      const M = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
      const request = O.requestPermission ?? M?.requestPermission;
      if (request && await request() !== 'granted') return;
      setSensorsReady(true);
      setNeedsPermission(false);
      buzz(20);
    } catch { /* sensory nieobsługiwane — zostaje symulacja */ }
  };

  /* ---- wysyłka stanu do komputera (kanałem wejść pada) ---- */
  useEffect(() => {
    const id = window.setInterval(() => {
      const gx = clamp1(grav.current.x), gy = clamp1(grav.current.y);
      padClient.setInput({
        dirX: +gx.toFixed(2),
        dirY: +gy.toFixed(2),
        aimX: +clamp1(rot.current.beta).toFixed(2),
        aimY: +clamp1(rot.current.gamma).toFixed(2),
        fwd: +Math.max(shakeRef.current, fakeShake.current).toFixed(2),
        turn: maskRef.current,
        fire: maskRef.current > 0,
      });
      shakeRef.current *= 0.82;
      fakeShake.current *= 0.86;
    }, 60);
    return () => {
      window.clearInterval(id);
      padClient.setInput({ fwd: 0, turn: 0, dirX: 0, dirY: 0, aimX: 0, aimY: 0, fire: false });
    };
  }, []);

  /* ---- grzechotka: pudełko z kulkami + mierniki ---- */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let balls: Ball[] = [];
    const palette = [color, ...ZONES.map(z => z.color)];

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!balls.length) {
        balls = Array.from({ length: 12 }, (_, i) => ({
          x: 30 + (i % 4) * 40, y: 30 + Math.floor(i / 4) * 34,
          vx: 0, vy: 0, r: 9 + (i % 3) * 3.5,
          color: palette[i % palette.length],
        }));
      }
    };
    layout();
    window.addEventListener('resize', layout);

    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const boxH = Math.floor(H * 0.62);
      const gx = grav.current.x * 900, gy = grav.current.y * 900;
      const shake = Math.max(shakeRef.current, fakeShake.current);

      // grzechotanie: wstrząs = losowe impulsy + wibro-grzechotka
      if (shake > 0.45) {
        for (const b of balls) { b.vx += (Math.random() - 0.5) * 260 * shake; b.vy += (Math.random() - 0.5) * 260 * shake; }
        if (now - rattleAt.current > 450) { rattleAt.current = now; buzz([22, 18, 22, 18, 36]); }
      }

      for (const b of balls) {
        b.vx += gx * dt; b.vy += gy * dt;
        b.vx *= 0.995; b.vy *= 0.995;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.7; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.7; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.7; }
        if (b.y > boxH - b.r) { b.y = boxH - b.r; b.vy = -Math.abs(b.vy) * 0.7; }
      }
      // proste zderzenia
      for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const min = a.r + b.r;
        if (d < min) {
          const nx = dx / d, ny = dy / d, push = (min - d) / 2;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          const k = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (k > 0) { a.vx -= k * nx; a.vy -= k * ny; b.vx += k * nx; b.vy += k * ny; }
        }
      }

      // rysowanie
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (shake > 0.3) ctx.translate((Math.random() - 0.5) * 6 * shake, (Math.random() - 0.5) * 6 * shake);
      ctx.fillStyle = 'rgba(8,12,20,0.65)';
      ctx.beginPath();
      (ctx.roundRect as CanvasRenderingContext2D['roundRect'])(6, 6, W - 12, boxH - 12, 18);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.14)';
      ctx.stroke();
      for (const b of balls) {
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color; ctx.shadowBlur = 10;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.restore();

      // mierniki
      const meters: [string, number, string][] = [
        ['GRAW-X', clamp1(grav.current.x), '#38bdf8'],
        ['GRAW-Y', clamp1(grav.current.y), '#2dd4bf'],
        ['WSTRZĄS', Math.max(shakeRef.current, fakeShake.current), '#f97316'],
        ['ŻYRO', clamp1(rot.current.beta), '#a78bfa'],
      ];
      const mw = W - 24, my0 = boxH + 10;
      ctx.font = '700 9px ui-monospace, monospace';
      meters.forEach(([label, v, col], i) => {
        const y = my0 + i * 18;
        ctx.fillStyle = 'rgba(255,255,255,0.55)';
        ctx.fillText(label, 12, y + 8);
        ctx.fillStyle = 'rgba(255,255,255,0.08)';
        ctx.fillRect(64, y, mw - 74, 10);
        ctx.fillStyle = col;
        const wpx = Math.abs(v) * (mw - 74) / 2;
        ctx.fillRect(v >= 0 ? 64 + (mw - 74) / 2 : 64 + (mw - 74) / 2 - wpx, y, wpx, 10);
        ctx.fillStyle = 'rgba(255,255,255,0.25)';
        ctx.fillRect(64 + (mw - 74) / 2, y, 1, 10);
      });
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', layout); };
  }, [color, buzz]);

  /* ---- strefy haptyczne ---- */
  const zoneDown = (i: number) => {
    if (!(maskRef.current & (1 << i))) buzz(ZONES[i].pattern);
    maskRef.current |= 1 << i;
    setPressed(prev => prev.includes(i) ? prev : [...prev, i]);
  };
  const zoneUp = (i: number) => {
    maskRef.current &= ~(1 << i);
    setPressed(prev => prev.filter(p => p !== i));
  };

  return (
    <div className="fixed inset-0 select-none overflow-y-auto bg-[#07090f] text-white" style={{ touchAction: 'none' }}>
      <div className="pointer-events-none absolute inset-0 opacity-[.06]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '38px 38px' }} />
      <div className="relative mx-auto flex min-h-full max-w-[520px] flex-col px-4 pb-6" style={{ paddingTop: 'max(14px, env(safe-area-inset-top))' }}>
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="joy-logo flex h-9 w-9 items-center justify-center rounded-xl"><Gamepad2 size={19} /></span>
            <div>
              <div className="joy-brand text-lg font-extrabold leading-none">LAB KONTROLERA</div>
              <div className="joy-kicker mt-1 text-[8px] text-slate-500">{nick} · POKÓJ ZABAW</div>
            </div>
          </div>
          <button onClick={onDone} className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black text-[#16110c] active:scale-95">WRÓĆ / POMIŃ →</button>
        </header>

        <p className="joy-enter mt-4 text-xs leading-relaxed text-slate-400">
          Poznaj reakcje kontrolera. Dotyk działa zawsze; czujniki i wibracje zależą od urządzenia. Możesz pominąć test w każdej chwili.
        </p>

        {(needsPermission || !sensorsReady) && (
          <button onClick={enableSensors} className="joy-enter joy-enter-1 mt-3 flex items-center justify-center gap-2 rounded-xl border border-cyan-400/40 bg-cyan-500/10 px-4 py-3 text-xs font-black text-cyan-200">
            <Zap size={15} /> WŁĄCZ SENSORY (akcelerometr + żyroskop)
          </button>
        )}

        <div className="joy-enter joy-enter-2 mt-4 overflow-hidden rounded-2xl border border-white/10 bg-white/[.03]">
          <canvas ref={canvasRef} className="block h-[46vh] max-h-[380px] w-full" />
        </div>
        <div className="joy-enter joy-enter-2 mt-2 flex flex-wrap items-center gap-2 text-[10px] font-bold tracking-wider text-slate-400">
          <span className="rounded-full border border-white/15 px-2.5 py-1">① POTRZĄŚNIJ = GRZECHOTKA</span>
          <span className="rounded-full border border-white/15 px-2.5 py-1">② PRZECHYL = GRAWITACJA</span>
          <span className="rounded-full border border-white/15 px-2.5 py-1">③ DOTKNIJ STREF</span>
          <button onClick={() => { fakeShake.current = 1; buzz([30, 20, 30]); }} className="ml-auto rounded-full border border-orange-400/40 bg-orange-500/10 px-2.5 py-1 text-orange-200"><Sparkles size={11} className="inline" /> SYMULUJ WSTRZĄS</button>
        </div>

        <div className="joy-enter joy-enter-3 mt-4 grid grid-cols-4 gap-2">
          {ZONES.map((z, i) => {
            const on = pressed.includes(i);
            return (
              <button
                key={z.name}
                onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); zoneDown(i); }}
                onPointerUp={() => zoneUp(i)}
                onPointerCancel={() => zoneUp(i)}
                onLostPointerCapture={() => zoneUp(i)}
                onContextMenu={e => e.preventDefault()}
                className="flex aspect-square items-center justify-center rounded-2xl border-2 text-[10px] font-black tracking-wider transition-transform active:scale-95"
                style={{
                  borderColor: z.color,
                  background: on ? z.color : `${z.color}22`,
                  color: on ? '#0a0c0d' : z.color,
                  boxShadow: on ? `0 0 22px ${z.color}88` : 'none',
                  touchAction: 'none',
                }}
              >
                {z.name}
              </button>
            );
          })}
        </div>
        <p className="mt-3 text-center text-[10px] tracking-wider text-slate-500">KAŻDA STREFA MA INNĄ WIBRACJĘ · SPRÓBUJ WSZYSTKICH 8</p>
      </div>
    </div>
  );
}

export function JoyLabPad(props: { nick: string; color: string; onDone: () => void }) {
  const [explore, setExplore] = useState(false);
  return explore ? <SensorLabPad {...props} /> : <QuickPadTest color={props.color} onDone={props.onDone} onExplore={() => setExplore(true)} />;
}
