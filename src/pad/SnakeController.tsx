import { useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Gamepad2, LogOut, Maximize2, Pause, Settings, Zap } from 'lucide-react';
import type { PadClientState } from '../net/padClient';
import { padClient } from '../net/padClient';
import { Sheet } from '../console/Sheet';
import { NickEditor } from './NickEditor';
import { DeviceFeatures, type FullscreenStatus, type TiltStatus, type WakeLockStatus } from './DeviceFeatures';
import { haptic, unlockHaptics } from './haptics';

interface SnakeControllerProps {
  st: PadClientState;
  fullscreen: () => void;
  fullscreenStatus: FullscreenStatus;
  wakeLockEnabled: boolean;
  onWakeLockChange: (enabled: boolean) => void;
  wakeLockStatus: WakeLockStatus;
  tiltEnabled: boolean;
  onTiltChange: () => void;
  tiltStatus: TiltStatus;
}

const DIRECTIONS = [
  { key: 'up', x: 0, y: -1, label: 'Góra', icon: ArrowUp },
  { key: 'left', x: -1, y: 0, label: 'Lewo', icon: ArrowLeft },
  { key: 'right', x: 1, y: 0, label: 'Prawo', icon: ArrowRight },
  { key: 'down', x: 0, y: 1, label: 'Dół', icon: ArrowDown },
] as const;

/** D-pad zamiast gałki: wężem steruje się tapnięciem kierunku. */
export function SnakeController({ st, fullscreen, fullscreenStatus, wakeLockEnabled, onWakeLockChange, wakeLockStatus, tiltEnabled, onTiltChange, tiltStatus }: SnakeControllerProps) {
  const [settings, setSettings] = useState(false);
  const firePointer = useRef<number | null>(null);
  const directionTimer = useRef<number | null>(null);
  const admin = st.slot === st.adminSlot;
  const color = st.color || '#edbd78';
  const hud = st.arcadeHud;

  const release = () => {
    firePointer.current = null;
    padClient.setInput({ dirX: 0, dirY: 0, fire: false });
  };
  useEffect(() => {
    const reset = () => { if (directionTimer.current !== null) { window.clearTimeout(directionTimer.current); directionTimer.current = null; } release(); padClient.releaseInput(); };
    window.addEventListener('blur', reset);
    window.addEventListener('pagehide', reset);
    window.addEventListener('orientationchange', reset);
    window.addEventListener('joypad-release-input', reset);
    return () => {
      reset();
      window.removeEventListener('blur', reset);
      window.removeEventListener('pagehide', reset);
      window.removeEventListener('orientationchange', reset);
      window.removeEventListener('joypad-release-input', reset);
    };
  }, [st.screen, st.game]);

  const direction = (x: number, y: number) => {
    unlockHaptics();
    haptic(7);
    padClient.setInput({ dirX: x, dirY: y, fwd: 0, turn: 0 });
    if (directionTimer.current !== null) window.clearTimeout(directionTimer.current);
    directionTimer.current = window.setTimeout(() => { directionTimer.current = null; padClient.setInput({ dirX: 0, dirY: 0 }); }, 90);
  };
  const sprintDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (firePointer.current !== null) return;
    firePointer.current = event.pointerId;
    try { event.currentTarget.setPointerCapture(event.pointerId); } catch { /* fallback below */ }
    unlockHaptics();
    haptic(12);
    padClient.setInput({ fire: true });
  };
  const sprintUp = (event?: React.PointerEvent<HTMLButtonElement>) => {
    if (event && firePointer.current !== event.pointerId) return;
    release();
  };

  if (st.status !== 'connected') return null;
  return <div className="snake-pad fixed inset-0 select-none overflow-hidden text-white" style={{ '--snake-pad-color': color } as React.CSSProperties}>
    <div className="snake-pad-glow" aria-hidden="true" />
    <header className="snake-pad-header" style={{ paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
      <div className="flex min-w-0 items-center gap-2"><span className="snake-pad-player" style={{ background: color, boxShadow: `0 0 12px ${color}` }} /><strong className="truncate">{st.nick || st.name}</strong><span className="snake-pad-beta">BETA</span></div>
      <div className="flex items-center gap-1.5">
        {admin && <button type="button" onClick={() => padClient.requestPause()} aria-label="Pauza" className="snake-pad-icon"><Pause size={17} /></button>}
        {admin && <button type="button" onClick={() => { if (window.confirm('Wrócić do biblioteki?')) padClient.sendCommand('home'); }} aria-label="Wróć do biblioteki" className="snake-pad-icon"><Gamepad2 size={17} /></button>}
        <button type="button" onClick={() => setSettings(true)} aria-label="Ustawienia pada" className="snake-pad-icon"><Settings size={17} /></button>
        <button type="button" onClick={fullscreen} aria-label="Pełny ekran" className="snake-pad-icon"><Maximize2 size={17} /></button>
        <button type="button" onClick={() => padClient.disconnect()} aria-label="Odłącz telefon" className="snake-pad-icon danger"><LogOut size={17} /></button>
      </div>
    </header>

    <main className="snake-pad-main">
      <div className="snake-pad-status">
        <span className="os-eyebrow">WĘŻOWY WIR · NOWA GRA</span>
        <h1>{st.screen === 'game' ? 'Steruj kierunkiem.' : 'Za chwilę start.'}</h1>
        <p>{hud?.detail || 'Tapnij strzałkę, aby zmienić kierunek. Nie zawracaj w siebie.'}</p>
        <div className="snake-pad-hud"><span>{hud ? `${hud.score} pkt` : '—'}</span><span>{hud ? `${Math.ceil(hud.timeLeft)} s` : '—'}</span></div>
      </div>
      <div className="snake-pad-controls">
        <div className="snake-dpad" aria-label="Sterowanie kierunkiem węża">
          <span className="snake-dpad-center">{hud?.paused ? 'PAUZA' : <Zap size={18} />}</span>
          {DIRECTIONS.map(({ key, x, y, label, icon: Icon }) => <button key={key} type="button" aria-label={label} onPointerDown={event => { event.preventDefault(); direction(x, y); }}><Icon size={30} /></button>)}
        </div>
        <button type="button" className="snake-sprint" aria-label="Sprint" onPointerDown={sprintDown} onPointerUp={sprintUp} onPointerCancel={() => sprintUp()} onLostPointerCapture={() => sprintUp()}>
          <span><Zap size={27} /></span><b>SPRINT</b><small>{hud?.paused ? 'PAUZA' : 'PRZYTRZYMAJ'}</small>
        </button>
      </div>
    </main>

    {settings && <Sheet title="Twój kontroler." onClose={() => setSettings(false)}>
      <NickEditor st={st} compact />
      <p className="mt-3 text-xs leading-relaxed text-slate-400">Wężowy Wir używa czterech przycisków kierunkowych. Tapnięcie wystarcza — nie musisz prowadzić gałki.</p>
      <DeviceFeatures wakeLockEnabled={wakeLockEnabled} onWakeLockChange={onWakeLockChange} wakeLockStatus={wakeLockStatus} fullscreenStatus={fullscreenStatus} onFullscreen={fullscreen} tiltEnabled={tiltEnabled} onTiltChange={onTiltChange} tiltStatus={tiltStatus} />
    </Sheet>}
  </div>;
}
