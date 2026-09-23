import { useCallback, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, Loader2, Stethoscope, XCircle } from 'lucide-react';
import { runDiagnostics, type DiagStatus, type DiagStep } from '../net/diagnostics';
import { signalingFromLocation } from '../net/signaling';

const ICONS: Record<DiagStatus, React.ReactNode> = {
  running: <Loader2 className="h-4 w-4 animate-spin text-amber-300" />,
  ok: <CheckCircle2 className="h-4 w-4 text-green-400" />,
  warn: <AlertTriangle className="h-4 w-4 text-amber-300" />,
  fail: <XCircle className="h-4 w-4 text-red-400" />,
};

const COLORS: Record<DiagStatus, string> = {
  running: 'text-zinc-300',
  ok: 'text-zinc-200',
  warn: 'text-amber-100',
  fail: 'text-red-200',
};

/**
 * „Sprawdź połączenie” — przechodzi przez wszystkie ogniwa łączności
 * (przeglądarka → serwer sygnalizacji → STUN → TURN) i pokazuje, które z nich
 * faktycznie działa. Działa i na komputerze, i na telefonie.
 */
export function ConnectionCheck({ defaultOpen = false, compact = false }: { defaultOpen?: boolean; compact?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [steps, setSteps] = useState<DiagStep[]>([]);
  const [running, setRunning] = useState(false);

  const onStep = useCallback((incoming: DiagStep) => {
    setSteps(prev => {
      const idx = prev.findIndex(s => s.id === incoming.id);
      if (idx === -1) return [...prev, incoming];
      const next = [...prev];
      next[idx] = incoming;
      return next;
    });
  }, []);

  const start = async () => {
    setSteps([]);
    setRunning(true);
    try {
      await runDiagnostics(signalingFromLocation(), onStep);
    } finally {
      setRunning(false);
    }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && steps.length === 0 && !running) void start();
  };

  const worst = useMemo<DiagStatus | null>(() => {
    if (running || steps.length === 0) return null;
    if (steps.some(s => s.status === 'fail')) return 'fail';
    if (steps.some(s => s.status === 'warn')) return 'warn';
    return 'ok';
  }, [steps, running]);

  const relayOk = steps.some(s => s.id === 'relay' && s.status === 'ok');
  const summary = worst === null ? null
    : worst === 'fail' ? (relayOk
        ? 'Łączenie bezpośrednie jest zablokowane, ALE awaryjny przekaźnik łączy urządzenia — gra powinna działać.'
        : 'Coś blokuje połączenie — szczegóły niżej.')
      : worst === 'warn' ? (relayOk
        ? 'Różne sieci (Wi‑Fi ↔ LTE) połączą się przez awaryjny przekaźnik — bez konfiguracji.'
        : 'Połączenie zadziała, ale najlepiej w tej samej sieci Wi‑Fi.')
        : 'Wszystkie ogniwa łączności działają.';

  return (
    <div className="w-full">
      <button
        onClick={toggle}
        className={`flex w-full items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-left text-xs font-bold tracking-widest text-zinc-300 hover:bg-white/10 ${compact ? '' : 'mt-1'}`}
      >
        <span className="flex items-center gap-2"><Stethoscope className="h-4 w-4 text-sky-400" /> SPRAWDŹ POŁĄCZENIE</span>
        <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="mt-2 rounded-xl border border-white/10 bg-black/40 p-3">
          {steps.length === 0 && running && <div className="text-xs text-zinc-400">Sprawdzam…</div>}
          <div className="space-y-2">
            {steps.map(s => (
              <div key={s.id} className="flex gap-2">
                <span className="mt-0.5 shrink-0">{ICONS[s.status]}</span>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold tracking-wide text-zinc-400">{s.label}</div>
                  <div className={`text-xs leading-snug ${COLORS[s.status]}`}>{s.detail}</div>
                  {s.hint && <div className="mt-1 text-[11px] leading-snug text-zinc-500">💡 {s.hint}</div>}
                </div>
              </div>
            ))}
          </div>

          {summary && (
            <div className={`mt-3 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${worst === 'ok' ? 'border-green-500/40 bg-green-500/10 text-green-300' : worst === 'warn' ? 'border-amber-500/40 bg-amber-500/10 text-amber-200' : 'border-red-500/40 bg-red-500/10 text-red-200'}`}>
              {summary}
            </div>
          )}

          <button
            onClick={start}
            disabled={running}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-white/15 bg-white/5 py-1.5 text-[11px] font-bold tracking-widest text-zinc-300 hover:bg-white/10 disabled:opacity-50"
          >
            {running ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> SPRAWDZAM…</> : 'SPRAWDŹ JESZCZE RAZ'}
          </button>
        </div>
      )}
    </div>
  );
}
