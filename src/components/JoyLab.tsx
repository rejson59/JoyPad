import { QuickPadTestTV } from '../console/QuickPadTest';
import { useEffect, useRef, useState } from 'react';
import { Check, Gamepad2, X } from 'lucide-react';
import { padHost } from '../net/padHost';
import { usePadHost } from '../pad/PadHostPanel';

/**
 * LAB KONTROLERA na dużym ekranie — pokój zabaw w duchu Astro's Playroom.
 *
 * Kulki, kostki i żetony mają grawitację sterowaną przechyłem telefonu,
 * potrząśnięcie grzechocze elementami, a dotknięcie stref na telefonie
 * strzela kolorowymi impulsami. Trzy mini-testy zapalają się po kolei,
 * a ich zaliczenie wieńczy hasło „TWÓJ KONTROLER ŻYJE!”.
 *
 * Dane bierzemy z istniejącego kanału wejść pada (padHost.inputs) —
 * protokół połączeń pozostaje nietknięty.
 */

const ZONE_COLORS = ['#fbbf24', '#fb923c', '#f472b6', '#ef4444', '#a78bfa', '#38bdf8', '#2dd4bf', '#a3e635'];
const ZONE_NAMES = ['KLIK', 'DUBLET', 'BUZZ', 'SERCE', 'TRZEPOT', 'SERIA', 'FALA', 'BĘBEN'];
const ZONE_ANCHORS: [number, number][] = [[0.18, 0.3], [0.5, 0.18], [0.82, 0.3], [0.2, 0.7], [0.8, 0.7], [0.35, 0.45], [0.65, 0.45], [0.5, 0.82]];

interface Body { x: number; y: number; vx: number; vy: number; r: number; rot: number; vr: number; color: string; square: boolean }
interface Pulse { x: number; y: number; t: number; color: string; label: string }

function SensorLab({ onClose }: { onClose: () => void }) {
  const state = usePadHost();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inputRef = useRef({ gx: 0, gy: 0, shake: 0, mask: 0, spin: 0 });
  const prevMask = useRef(0);
  const shakeAt = useRef(0);
  const [done, setDone] = useState({ shake: false, tilt: false, zones: false });
  const pad = state.pads[0];
  const padName = pad?.nick || 'Twój telefon';
  const padColor = '#f97316';
  const allDone = done.shake && done.tilt && done.zones;

  /* czytamy wejścia pada (bez zmian protokołu) */
  useEffect(() => {
    let raf = 0;
    let prevMaskLocal = 0;
    const read = () => {
      raf = requestAnimationFrame(read);
      const slots = state.pads.map(p => p.slot);
      let gx = 0, gy = 0, shake = 0, mask = 0, spin = 0, n = 0;
      for (const s of slots) {
        const inp = padHost.inputs[s];
        if (!inp) continue;
        gx += inp.dirX ?? 0; gy += inp.dirY ?? 0;
        shake = Math.max(shake, inp.fwd);
        mask |= Math.round(inp.turn ?? 0);
        spin += inp.aimX ?? 0;
        n++;
      }
      if (n > 1) { gx /= n; gy /= n; }
      inputRef.current = { gx, gy, shake, mask, spin };
      // wykrywanie mini-testów
      if (shake > 0.5) setDone(d => d.shake ? d : { ...d, shake: true });
      if (Math.hypot(gx, gy) > 0.45) setDone(d => d.tilt ? d : { ...d, tilt: true });
      if (mask !== prevMaskLocal) {
        prevMaskLocal = mask;
        if (mask > 0) setDone(d => d.zones ? d : { ...d, zones: true });
      }
    };
    raf = requestAnimationFrame(read);
    return () => cancelAnimationFrame(raf);
  }, [state.pads]);

  /* fizyczny pokój zabaw */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let bodies: Body[] = [];
    const pulses: Pulse[] = [];
    let shakeFlash = 0;

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!bodies.length) {
        const W = rect.width, H = rect.height;
        bodies = [
          ...Array.from({ length: 10 }, (_, i) => ({
            x: W * (0.15 + 0.07 * i), y: H * 0.2 + (i % 3) * 30, vx: 0, vy: 0,
            r: 14 + (i % 4) * 5, rot: 0, vr: 0, color: ZONE_COLORS[i % ZONE_COLORS.length], square: false,
          })),
          ...Array.from({ length: 3 }, (_, i) => ({
            x: W * (0.3 + 0.2 * i), y: H * 0.35, vx: 0, vy: 0,
            r: 20, rot: i, vr: 0, color: i === 1 ? '#f97316' : '#e5e7eb', square: true,
          })),
        ];
      }
    };
    layout();
    window.addEventListener('resize', layout);

    let last = performance.now();
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      const W = canvas.clientWidth, H = canvas.clientHeight;
      const inp = inputRef.current;
      const gx = inp.gx * 1500, gy = inp.gy * 1500;

      if (inp.shake > 0.45) {
        if (now - shakeAt.current > 260) {
          shakeAt.current = now; shakeFlash = 1;
          for (const b of bodies) { b.vx += (Math.random() - 0.5) * 620 * inp.shake; b.vy += (Math.random() - 0.5) * 620 * inp.shake; b.vr += (Math.random() - 0.5) * 8; }
        }
      }
      // strefy: impulsy z telefonu
      const mask = inp.mask;
      for (let i = 0; i < 8; i++) {
        const bit = 1 << i;
        if ((mask & bit) && !(prevMask.current & bit)) {
          const [ax, ay] = ZONE_ANCHORS[i];
          pulses.push({ x: W * ax, y: H * ay, t: 1, color: ZONE_COLORS[i], label: ZONE_NAMES[i] });
          for (const b of bodies) {
            const dx = b.x - W * ax, dy = b.y - H * ay, d = Math.hypot(dx, dy) || 1;
            if (d < 320) { const k = (1 - d / 320) * 700; b.vx += (dx / d) * k; b.vy += (dy / d) * k; }
          }
        }
      }
      prevMask.current = mask;

      for (const b of bodies) {
        b.vx += gx * dt; b.vy += gy * dt;
        b.vx *= 0.997; b.vy *= 0.997;
        b.vr += inp.spin * dt * 2;
        b.vr *= 0.98;
        b.rot += b.vr * dt;
        b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.x < b.r) { b.x = b.r; b.vx = Math.abs(b.vx) * 0.72; b.vr += 1; }
        if (b.x > W - b.r) { b.x = W - b.r; b.vx = -Math.abs(b.vx) * 0.72; b.vr -= 1; }
        if (b.y < b.r) { b.y = b.r; b.vy = Math.abs(b.vy) * 0.72; }
        if (b.y > H - b.r) { b.y = H - b.r; b.vy = -Math.abs(b.vy) * 0.72; b.vr += b.vx * 0.002; }
      }
      for (let i = 0; i < bodies.length; i++) for (let j = i + 1; j < bodies.length; j++) {
        const a = bodies[i], b = bodies[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const min = a.r + b.r;
        if (d < min) {
          const nx = dx / d, ny = dy / d, push = (min - d) / 2;
          a.x -= nx * push; a.y -= ny * push; b.x += nx * push; b.y += ny * push;
          const k = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
          if (k > 0) {
            a.vx -= k * nx; a.vy -= k * ny; b.vx += k * nx; b.vy += k * ny;
            a.vr += k * 0.004; b.vr -= k * 0.004;
          }
        }
      }

      // rysunek
      ctx.clearRect(0, 0, W, H);
      ctx.save();
      if (shakeFlash > 0.05) ctx.translate((Math.random() - 0.5) * 14 * shakeFlash, (Math.random() - 0.5) * 14 * shakeFlash);
      shakeFlash *= 0.9;

      // tło areny
      ctx.fillStyle = 'rgba(6,9,16,0.55)';
      ctx.beginPath(); ctx.roundRect(14, 14, W - 28, H - 28, 26); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.08)'; ctx.stroke();

      for (const b of bodies) {
        ctx.save();
        ctx.translate(b.x, b.y); ctx.rotate(b.rot);
        ctx.fillStyle = b.color;
        ctx.shadowColor = b.color; ctx.shadowBlur = 18;
        if (b.square) {
          ctx.beginPath(); ctx.roundRect(-b.r, -b.r, b.r * 2, b.r * 2, 7); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(10,12,13,0.85)';
          ctx.beginPath(); ctx.arc(-b.r * 0.4, -b.r * 0.4, 2.6, 0, 7); ctx.arc(b.r * 0.4, b.r * 0.4, 2.6, 0, 7); ctx.fill();
        } else {
          ctx.beginPath(); ctx.arc(0, 0, b.r, 0, 7); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.beginPath(); ctx.arc(-b.r * 0.3, -b.r * 0.3, b.r * 0.28, 0, 7); ctx.fill();
        }
        ctx.restore();
      }

      // impulsy stref
      for (let i = pulses.length - 1; i >= 0; i--) {
        const p = pulses[i];
        p.t -= dt * 1.6;
        if (p.t <= 0) { pulses.splice(i, 1); continue; }
        ctx.strokeStyle = p.color;
        ctx.fillStyle = p.color;
        ctx.globalAlpha = p.t;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(p.x, p.y, (1 - p.t) * 130 + 10, 0, 7); ctx.stroke();
        ctx.font = '800 13px ui-sans-serif, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(p.label, p.x, p.y - (1 - p.t) * 40 - 12);
        ctx.globalAlpha = 1; ctx.lineWidth = 1;
      }
      ctx.restore();
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', layout); };
  }, []);

  const stations: { key: keyof typeof done; num: string; title: string; hint: string }[] = [
    { key: 'shake', num: '01', title: 'GRZECHOTKA', hint: 'Potrząśnij telefonem — elementy grzechoczą, a telefon wibruje' },
    { key: 'tilt', num: '02', title: 'ŻYROSKOP', hint: 'Przechyl telefon — grawitacja kulki ciągnie za przechyłem' },
    { key: 'zones', num: '03', title: 'STREFY HAPTYCZNE', hint: 'Dotknij kolorowych stref — każda ma inny impuls' },
  ];

  return (
    <div className="fixed inset-0 z-[100] select-none overflow-hidden bg-[#07090f] text-white" role="dialog" aria-label="Lab kontrolera">
      <div className="pointer-events-none absolute inset-0 opacity-[.05]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '48px 48px' }} />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />
      <div className="pointer-events-none absolute inset-0 flex flex-col p-5 sm:p-8">
        <header className="flex items-start justify-between gap-3">
          <div>
            <div className="joy-kicker flex items-center gap-2 text-orange-300"><Gamepad2 size={14} /> LAB KONTROLERA / POKÓJ ZABAW</div>
            <h1 className="joy-heading mt-2 text-3xl font-extrabold tracking-[-.04em] sm:text-5xl">Twój telefon <span className="joy-gradient-text">żyje</span></h1>
            <p className="mt-2 max-w-md text-xs leading-relaxed text-slate-400 sm:text-sm">Weź <b className="text-white">{padName}</b> w dłoń i wykonaj 3 zadania. Wszystko na tym ekranie reaguje na ruch telefonu.</p>
          </div>
          <button onClick={onClose} className="pointer-events-auto flex items-center gap-2 rounded-xl border border-white/20 bg-black/40 px-4 py-2.5 text-xs font-bold backdrop-blur hover:bg-white/10"><X size={15} /> DO BIBLIOTEKI</button>
        </header>

        <div className="mt-auto grid gap-2 sm:max-w-md">
          {stations.map(s => (
            <div key={s.key} className={`flex items-center gap-3 rounded-2xl border px-4 py-3 backdrop-blur transition ${done[s.key] ? 'border-emerald-400/50 bg-emerald-500/10' : 'border-white/15 bg-black/40'}`}>
              <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-black ${done[s.key] ? 'bg-emerald-400 text-[#0a0c0d]' : 'bg-white/10 text-slate-300'}`}>{done[s.key] ? <Check size={17} /> : s.num}</span>
              <div className="min-w-0">
                <div className="text-sm font-black tracking-wide">{s.title}</div>
                <div className="truncate text-[11px] text-slate-400">{s.hint}</div>
              </div>
            </div>
          ))}
        </div>

        {allDone && (
          <div className="pointer-events-none mt-4 self-start rounded-2xl border border-orange-400/50 bg-orange-500/15 px-6 py-4 backdrop-blur" style={{ animation: 'boot-glow .8s ease-out both', boxShadow: `0 0 42px ${padColor}55` }}>
            <div className="joy-heading text-2xl font-extrabold text-orange-300 sm:text-3xl">TWÓJ KONTROLER ŻYJE!</div>
            <div className="mt-1 text-xs text-slate-300">Wszystkie 3 testy zaliczone — {padName} to prawdziwy pad. Możesz iść do gry!</div>
          </div>
        )}
      </div>
    </div>
  );
}

export function JoyLab({ onClose }: { onClose: () => void }) {
  const [explore, setExplore] = useState(false);
  return explore ? <SensorLab onClose={onClose} /> : <QuickPadTestTV onClose={onClose} onExplore={() => setExplore(true)} />;
}
