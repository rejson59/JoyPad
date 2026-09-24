import { useState } from 'react';
import { Check, Smartphone, VolumeX, Zap } from 'lucide-react';
import { getHapticStatus, haptic, unlockHaptics, type HapticStatus } from './haptics';

const COPY: Record<HapticStatus, { title: string; detail: string }> = {
  ready: { title: 'Wibracje gotowe', detail: 'API przyjęło test; tryb cichy, DND lub ustawienia systemu mogą nadal wyciszyć impuls.' },
  'needs-tap': { title: 'Dotknij, aby odblokować', detail: 'Przeglądarka nie pokazuje okna zgody. Pierwsze tapnięcie odblokowuje API.' },
  unsupported: { title: 'Brak wibracji', detail: 'Ta przeglądarka lub urządzenie nie obsługuje Vibration API (np. iOS Safari).' },
  blocked: { title: 'Wibracje zablokowane', detail: 'System, tryb cichy albo brak aktywacji blokuje impuls. Spróbuj TEST ponownie po tapnięciu.' },
};

export function HapticsStatus({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<HapticStatus>(() => getHapticStatus());
  const test = () => {
    const next = unlockHaptics();
    setStatus(next);
    if (next === 'ready') window.setTimeout(() => haptic([35, 28, 35]), 55);
  };
  const copy = COPY[status];
  const good = status === 'ready';
  const unsupported = status === 'unsupported';
  return (
    <div className={`rounded-xl border ${good ? 'border-emerald-400/30 bg-emerald-400/[.07]' : unsupported ? 'border-slate-400/20 bg-slate-400/[.06]' : 'border-amber-400/30 bg-amber-400/[.07]'} ${compact ? 'p-2.5' : 'p-3'}`}>
      <div className="flex items-start gap-2.5">
        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${good ? 'bg-emerald-400/15 text-emerald-300' : unsupported ? 'bg-slate-400/10 text-slate-400' : 'bg-amber-400/15 text-amber-200'}`}>
          {good ? <Check size={15} /> : unsupported ? <VolumeX size={15} /> : <Smartphone size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-black text-zinc-100">{copy.title}</div>
          {!compact && <div className="mt-1 text-[10px] leading-snug text-zinc-400">{copy.detail}</div>}
        </div>
        {!unsupported && <button type="button" onClick={test} className="flex shrink-0 items-center gap-1 rounded-lg border border-white/15 bg-black/25 px-2 py-1.5 text-[9px] font-black tracking-wide text-zinc-200 active:scale-95"><Zap size={12} /> TEST</button>}
      </div>
    </div>
  );
}
