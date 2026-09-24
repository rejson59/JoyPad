import { Check, Expand, Gauge, LockKeyhole, SunMedium } from 'lucide-react';
import { HapticsStatus } from './HapticsStatus';

export type WakeLockStatus = 'off' | 'waiting' | 'ready' | 'unsupported' | 'blocked';
export type FullscreenStatus = 'off' | 'active' | 'unsupported' | 'blocked';
export type TiltStatus = 'off' | 'requesting' | 'ready' | 'unsupported' | 'denied';

const wakeCopy: Record<WakeLockStatus, string> = {
  off: 'wyłączony', waiting: 'sprawdzam…', ready: 'aktywny', unsupported: 'brak wsparcia', blocked: 'odrzucony przez system',
};
const tiltCopy: Record<TiltStatus, string> = {
  off: 'wyłączony', requesting: 'czekam na zgodę…', ready: 'aktywny', unsupported: 'brak czujnika/API', denied: 'zgoda odrzucona',
};

export interface PadDeviceFeatures {
  wakeLockEnabled: boolean;
  onWakeLockChange: (enabled: boolean) => void;
  wakeLockStatus: WakeLockStatus;
  fullscreenStatus: FullscreenStatus;
  onFullscreen: () => void;
  tiltEnabled: boolean;
  onTiltChange: () => void;
  tiltStatus: TiltStatus;
}

export function DeviceFeatures({
  wakeLockEnabled,
  onWakeLockChange,
  wakeLockStatus,
  fullscreenStatus,
  onFullscreen,
  tiltEnabled,
  onTiltChange,
  tiltStatus,
}: PadDeviceFeatures) {
  return (
    <div className="mt-4 space-y-2 border-t border-white/10 pt-3">
      <div className="mb-1 text-[10px] font-black tracking-[.18em] text-zinc-500">FUNKCJE TELEFONU</div>
      <button type="button" onClick={() => onWakeLockChange(!wakeLockEnabled)} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left">
        <SunMedium size={16} className={wakeLockStatus === 'ready' ? 'text-emerald-300' : 'text-amber-200'} />
        <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-zinc-100">Nie wygaszaj ekranu</span><span className="block text-[10px] text-zinc-500">Wake Lock: {wakeCopy[wakeLockStatus]}</span></span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full ${wakeLockEnabled ? 'bg-amber-400' : 'bg-zinc-700'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${wakeLockEnabled ? 'left-[18px]' : 'left-0.5'}`} /></span>
      </button>
      <button type="button" onClick={onFullscreen} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left">
        <Expand size={16} className={fullscreenStatus === 'active' ? 'text-emerald-300' : 'text-slate-300'} />
        <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-zinc-100">Pełny ekran i poziomo</span><span className="block text-[10px] text-zinc-500">{fullscreenStatus === 'active' ? 'aktywny' : fullscreenStatus === 'unsupported' ? 'brak wsparcia' : fullscreenStatus === 'blocked' ? 'dotknij przycisku ponownie' : 'włączane dopiero po tapnięciu'}</span></span>
        {fullscreenStatus === 'active' && <Check size={15} className="text-emerald-300" />}
      </button>
      <button type="button" onClick={onTiltChange} className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-left">
        <Gauge size={16} className={tiltEnabled ? 'text-cyan-300' : 'text-slate-300'} />
        <span className="min-w-0 flex-1"><span className="block text-xs font-bold text-zinc-100">Sterowanie przechyłem</span><span className="block text-[10px] text-zinc-500">Tryb opcjonalny: {tiltCopy[tiltStatus]}</span></span>
        <span className={`relative h-5 w-9 shrink-0 rounded-full ${tiltEnabled ? 'bg-cyan-400' : 'bg-zinc-700'}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${tiltEnabled ? 'left-[18px]' : 'left-0.5'}`} /></span>
      </button>
      <HapticsStatus compact />
      <div className="flex items-start gap-2 px-1 pt-1 text-[10px] leading-snug text-zinc-500"><LockKeyhole size={12} className="mt-0.5 shrink-0" /> Kamera, mikrofon, lokalizacja i powiadomienia nie są potrzebne do pada.</div>
    </div>
  );
}
