import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Crown, Gamepad2, Home, LogOut, Maximize2, Menu, Pause, Play, RotateCcw, Settings, Signal, Smartphone, Trophy, X } from 'lucide-react';
import { GAMES, gameInfo } from '../arcade/catalog';
import { padClient, type PadClientState } from '../net/padClient';
import type { RemoteCommand } from '../net/protocol';
import { Joystick } from './Joystick';
import { getHapticStatus, haptic, unlockHaptics } from './haptics';
import { DeviceFeatures, type FullscreenStatus, type TiltStatus, type WakeLockStatus } from './DeviceFeatures';

function vibrate(n = 14) { haptic(n); }
function send(command: RemoteCommand) { if (getHapticStatus() !== 'ready') unlockHaptics(); haptic(14); padClient.sendCommand(command); }

type ControllerFeatures = {
  fullscreen: () => void;
  fullscreenStatus: FullscreenStatus;
  wakeLockEnabled: boolean;
  onWakeLockChange: (enabled: boolean) => void;
  wakeLockStatus: WakeLockStatus;
  tiltEnabled: boolean;
  onTiltChange: () => void;
  tiltStatus: TiltStatus;
};

function Roster({ st }: { st: PadClientState }) {
  return <div className="grid grid-cols-2 gap-2">{Array.from({ length: 4 }, (_, slot) => {
    const player = st.roster.find(p => p.slot === slot);
    const colors = ['#4ade80', '#38bdf8', '#fb923c', '#c084fc'];
    return <div key={slot} className={`flex min-w-0 items-center gap-2 rounded-xl border p-2.5 ${player ? 'border-white/15 bg-white/[.07]' : 'border-white/[.06] bg-white/[.02]'}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold" style={{ color: colors[slot], background: `${colors[slot]}22` }}>{slot + 1}</span><div className="min-w-0"><div className="truncate text-xs font-bold text-white">{player?.nick ?? 'Wolne'}</div><div className="text-[10px] text-slate-400">{player ? st.adminSlot === slot ? '★ Admin' : 'Połączono' : 'Czeka na pada'}</div></div></div>;
  })}</div>;
}

function RemoteButton({
  command,
  label,
  children,
  admin,
  primary = false,
}: {
  command: RemoteCommand;
  label: string;
  children: React.ReactNode;
  admin: boolean;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={!admin}
      onClick={() => send(command)}
      aria-label={label}
      className={`pad-remote-button ${primary ? 'pad-remote-primary' : ''}`}
    >
      {children}
    </button>
  );
}

function RemoteNavigation({ admin, accent }: { admin: boolean; accent: string }) {
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 text-center text-[10px] font-black tracking-[.2em] text-slate-500">PILOT ADMINISTRATORA</div>
      <div className="mx-auto grid w-[210px] grid-cols-3 gap-2">
        <span />
        <RemoteButton command="up" label="W górę" admin={admin}><ArrowUp size={22} /></RemoteButton>
        <span />
        <RemoteButton command="left" label="W lewo" admin={admin}><ArrowLeft size={22} /></RemoteButton>
        <RemoteButton command="select" label="Wybierz" admin={admin} primary>
          <span className="text-[10px] font-black tracking-wider">OK</span>
        </RemoteButton>
        <RemoteButton command="right" label="W prawo" admin={admin}><ArrowRight size={22} /></RemoteButton>
        <span />
        <RemoteButton command="down" label="W dół" admin={admin}><ArrowDown size={22} /></RemoteButton>
        <span />
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <button type="button" onClick={() => send('back')} disabled={!admin} className="pad-secondary min-w-[112px] disabled:cursor-not-allowed disabled:opacity-40">
          <ArrowLeft size={14} /> WSTECZ
        </button>
        <button type="button" onClick={() => send('home')} disabled={!admin} className="pad-secondary min-w-[112px] disabled:cursor-not-allowed disabled:opacity-40">
          <Home size={14} /> GRY
        </button>
      </div>
      {!admin && <p className="mt-3 text-center text-[10px] text-slate-500">Tylko administrator steruje menu.</p>}
      <div className="mt-3 text-center text-[10px] text-slate-500" style={{ color: admin ? `${accent}cc` : undefined }}>
        Strzałki: wybór · OK: zatwierdź
      </div>
    </div>
  );
}

function RemoteController({ st, ...features }: { st: PadClientState } & ControllerFeatures) {
  const { fullscreen, fullscreenStatus, wakeLockEnabled, onWakeLockChange, wakeLockStatus, tiltEnabled, onTiltChange, tiltStatus } = features;
  const admin = st.slot === st.adminSlot;
  const [deviceSettings, setDeviceSettings] = useState(false);
  const selected = GAMES[st.selection] ?? GAMES[0];
  const game = st.game ? gameInfo(st.game) : null;
  const accent = game?.accent || '#f97316';
  const label = st.screen === 'lobby' ? 'BIBLIOTEKA GIER' : st.screen === 'over' ? 'KONIEC RUNDY' : st.screen === 'setup' ? 'USTAWIENIA' : 'MENU GRY';
  const actionText = st.screen === 'over'
    ? 'REWANŻ'
    : st.screen === 'setup' && st.game === 'tanks'
      ? 'DO BOJU'
      : st.game === 'tanks' && st.screen === 'menu'
        ? 'WYBIERZ TRYB'
        : 'ROZPOCZNIJ';

  return (
    <div className="pad-joy min-h-[100dvh] overflow-y-auto text-white" style={{ '--game-accent': accent } as React.CSSProperties}>
      <div className="pointer-events-none fixed inset-0 opacity-20" style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent}, transparent 60%)` }} />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[430px] flex-col px-4 pb-8" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="joy-logo flex h-9 w-9 items-center justify-center rounded-xl"><Gamepad2 size={20} /></span>
            <div><div className="joy-brand text-xl font-extrabold leading-none">Joy<span className="text-orange-400">Pad.</span></div><div className="joy-kicker mt-1 text-[8px] text-slate-500">PILOT / {st.code}</div></div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setDeviceSettings(true)} title="Funkcje telefonu" className="pad-icon"><Settings size={17} /></button>
            <button type="button" onClick={fullscreen} title="Pełny ekran" className="pad-icon"><Maximize2 size={17} /></button>
            <button type="button" onClick={() => padClient.disconnect()} title="Odłącz telefon" className="pad-icon text-red-300"><LogOut size={17} /></button>
          </div>
        </header>

        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="joy-kicker" style={{ color: accent }}>● {label}</span>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${admin ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-white/15 bg-white/5 text-slate-300'}`}>
            {admin ? <span className="flex items-center gap-1"><Crown size={12} /> ADMINISTRATOR</span> : `GRACZ ${st.slot + 1}`}
          </span>
        </div>

        {st.screen === 'lobby' ? (
          <>
            <div className="mt-8 rounded-[26px] border border-white/15 bg-white/[.045] p-6 text-center shadow-[0_20px_50px_rgba(0,0,0,.2)]">
              <div className="joy-kicker" style={{ color: accent }}>WYBRANA GRA {String(st.selection + 1).padStart(2, '0')} / {GAMES.length.toString().padStart(2, '0')}</div>
              <h1 className="joy-heading mt-3 text-3xl font-extrabold leading-tight">{selected.title}</h1>
              <p className="mt-2 text-xs leading-relaxed text-slate-400">{selected.genre} · {selected.players}</p>
              <div className="mt-5 h-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${((st.selection + 1) / GAMES.length) * 100}%`, background: accent }} /></div>
            </div>
            <p className="mt-5 text-center text-sm leading-relaxed text-slate-300">{admin ? 'Pilotem wybierz grę strzałkami, a następnie naciśnij OK.' : 'Poczekaj, aż administrator wybierze grę.'}</p>
            {admin && <RemoteNavigation admin accent={accent} />}
          </>
        ) : (
          <>
            <div className="mt-8 rounded-[26px] border border-white/15 bg-white/[.045] p-6 text-center">
              <div className="joy-kicker" style={{ color: accent }}>{game?.eyebrow || 'JOYPAD'}{st.screen === 'over' ? ' / WYNIK' : ''}</div>
              <h1 className="joy-heading mt-3 text-3xl font-extrabold leading-tight">{game?.title || 'JoyPad'}</h1>
              {st.screen === 'over' ? (
                <div className="mt-4"><Trophy className="mx-auto mb-2 h-8 w-8 text-amber-300" /><div className="text-lg font-bold" style={{ color: st.result?.youWon ? accent : '#f1f5f9' }}>{st.result?.youWon ? 'Wygrana!' : st.result?.winnerName || 'Koniec rundy'}</div><p className="mt-1 text-xs text-slate-400">{admin ? 'Wybierz rewanż albo wróć do biblioteki.' : 'Administrator decyduje o kolejnej rundzie.'}</p></div>
              ) : <p className="mt-3 text-sm leading-relaxed text-slate-300">{admin ? 'Steruj ustawieniami i rozpocznij rundę przyciskiem OK.' : 'Administrator ustawia grę. Poczekaj na start.'}</p>}
            </div>
            {st.options && st.screen !== 'over' && <div className="mt-4 grid grid-cols-2 gap-2">{[[st.options.primaryLabel, st.options.primaryValue, '← / →'], [st.options.secondaryLabel, st.options.secondaryValue, '↑ / ↓']].map(([title, value, help]) => <div key={title} className="rounded-xl border border-white/10 bg-white/[.04] p-3"><div className="joy-kicker text-[9px] text-slate-400">{title}</div><div className="mt-2 text-xs font-bold" style={{ color: accent }}>{value}</div><div className="mt-2 text-[10px] text-slate-500">{help}</div></div>)}</div>}
            {admin && <>
              {st.screen !== 'over' && <RemoteNavigation admin accent={accent} />}
              <button type="button" onClick={() => send('select')} className="pad-primary mt-4 w-full" style={{ background: accent }}>
                {st.screen === 'over' ? <><RotateCcw size={17} /> {actionText}</> : <><Play size={17} fill="currentColor" /> {actionText}</>}
              </button>
              {st.screen === 'over' && <button type="button" onClick={() => send('home')} className="pad-secondary mt-2 w-full"><Home size={14} /> WSZYSTKIE GRY</button>}
            </>}
          </>
        )}

        <div className="mt-auto pt-7">
          <div className="mb-3 flex items-center justify-between"><span className="joy-kicker text-slate-400">POŁĄCZENI / {st.roster.length} Z 4</span><span className="flex items-center gap-1 text-[10px] text-slate-500"><Signal size={12} /> {st.latency} ms</span></div>
          <Roster st={st} />
          <div className="mt-4 flex items-center justify-center gap-1 text-[10px] text-slate-500"><Smartphone size={12} /> {st.viaRelay ? 'Połączenie przez przekaźnik' : 'Połączenie bezpośrednie P2P'}</div>
        </div>
      </div>
      {deviceSettings && <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-5 backdrop-blur-sm" onClick={() => setDeviceSettings(false)}><div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#141a2b] p-4" onClick={e => e.stopPropagation()}><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-black text-orange-200"><Settings size={16} /> FUNKCJE TELEFONU</div><button type="button" onClick={() => setDeviceSettings(false)} className="pad-icon"><X size={17} /></button></div><DeviceFeatures wakeLockEnabled={wakeLockEnabled} onWakeLockChange={onWakeLockChange} wakeLockStatus={wakeLockStatus} fullscreenStatus={fullscreenStatus} onFullscreen={fullscreen} tiltEnabled={tiltEnabled} onTiltChange={onTiltChange} tiltStatus={tiltStatus} /></div></div>}
    </div>
  );
}

type ArcadeLayout = 'minimal' | 'twin';
const LS_ARCADE_LAYOUT = 'joypad-arcade-layout';
function readArcadeLayout(): ArcadeLayout {
  try { return localStorage.getItem(LS_ARCADE_LAYOUT) === 'minimal' ? 'minimal' : 'twin'; } catch { return 'twin'; }
}

function ArcadeController({ st, ...features }: { st: PadClientState } & ControllerFeatures) {
  const { fullscreen, fullscreenStatus, wakeLockEnabled, onWakeLockChange, wakeLockStatus, tiltEnabled, onTiltChange, tiltStatus } = features;
  const info = st.game ? gameInfo(st.game) : GAMES[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const [deviceSettings, setDeviceSettings] = useState(false);
  const [layout, setLayout] = useState<ArcadeLayout>(readArcadeLayout);
  const auto = useRef(false), button = useRef(false);
  const isOrbit = st.game === 'orbit';
  const twoStick = isOrbit && layout === 'twin';
  const admin = st.slot === st.adminSlot;
  const chooseLayout = (next: ArcadeLayout) => {
    setLayout(next);
    try { localStorage.setItem(LS_ARCADE_LAYOUT, next); } catch { /* optional */ }
    vibrate(12);
  };
  const size = Math.min(200, Math.max(135, Math.floor(Math.min(window.innerWidth * (twoStick ? .32 : .36), window.innerHeight * .46))));
  const actionSize = Math.min(170, Math.max(100, Math.floor(window.innerHeight * (twoStick ? .22 : .31))), Math.floor(window.innerWidth * .42) - 8);

  const syncFire = useCallback(() => padClient.setInput({ fire: auto.current || button.current }), []);
  const setButton = (pressed: boolean) => { button.current = pressed; if (pressed) { if (getHapticStatus() !== 'ready') unlockHaptics(); vibrate(10); } syncFire(); };
  useEffect(() => () => { padClient.setInput({ fwd: 0, turn: 0, dirX: 0, dirY: 0, aimX: 0, aimY: 0, fire: false }); }, []);
  const drive = useCallback((x: number, y: number) => padClient.setInput({ turn: x, fwd: y, dirX: x, dirY: -y }), []);
  const aim = useCallback((x: number, y: number) => padClient.setInput({ aimX: x, aimY: -y }), []);
  const hot = useCallback((on: boolean) => { auto.current = on; syncFire(); }, [syncFire]);
  const handlers = {
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setButton(true); },
    onPointerUp: () => setButton(false), onPointerCancel: () => setButton(false), onLostPointerCapture: () => setButton(false),
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  return <div className="fixed inset-0 select-none overflow-hidden text-white" style={{ background: `radial-gradient(ellipse at 50% 110%, ${info.accentSoft}55, #080d19 67%)`, touchAction: 'none' }}>
    <div className="pointer-events-none absolute inset-0 opacity-[.07]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '35px 35px' }} />
    <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-between gap-2 border-b border-white/10 bg-[#080d19]/80 px-3 py-2 backdrop-blur" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
      <div className="min-w-0"><div className="truncate text-sm font-black" style={{ color: info.accent }}>{info.title}</div><div className="text-[10px] text-slate-400">GRACZ {st.slot + 1} · {st.name}{admin ? ' · ★ ADMIN' : ''}</div></div>
      <div className="flex shrink-0 items-center gap-1"><span className="mr-1 hidden text-[10px] text-slate-400 sm:block">{st.latency} ms</span><button className="pad-icon" onClick={() => setDeviceSettings(true)} title="Funkcje telefonu"><Settings size={16} /></button><button className="pad-icon" onClick={fullscreen} title="Pełny ekran"><Maximize2 size={16} /></button>{admin && <button className="pad-icon" onClick={() => send('pause')} title="Pauza"><Pause size={16} /></button>}<button className="pad-icon" onClick={() => setMenuOpen(v => !v)} title="Menu"><Menu size={17} /></button></div>
    </header>
    {st.arcadeHud ? <div className="pointer-events-none absolute left-1/2 top-[60px] z-10 w-[min(92%,400px)] -translate-x-1/2 rounded-xl border border-white/15 bg-black/60 px-4 py-2 backdrop-blur-sm" style={{ marginTop: 'env(safe-area-inset-top)' }}><div className="flex items-center justify-between gap-2 text-[11px] font-bold"><span className="truncate" style={{ color: info.accent }}>{st.arcadeHud.title}</span><span className="shrink-0 font-mono2">{Math.floor(st.arcadeHud.timeLeft / 60)}:{String(Math.floor(st.arcadeHud.timeLeft % 60)).padStart(2, '0')}</span></div><div className="mt-1 flex items-center justify-between text-xs text-slate-200"><span>{st.arcadeHud.detail}</span><b className="font-mono2" style={{ color: info.accent }}>{st.arcadeHud.score} PKT</b></div>{st.arcadeHud.value !== undefined && <div className="mt-1.5 h-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, st.arcadeHud.value / (st.arcadeHud.maxValue || 100) * 100))}%`, background: info.accent }} /></div>}</div>
      : <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 px-8 text-center text-sm font-bold text-amber-200">Runda trwa. Dołączysz od następnej rozgrywki.</div>}
    {twoStick ? <>
      <Joystick side="left" size={size} color={st.color} onChange={drive} disabled={tiltEnabled} zoneWidthPct={50} bottomPadding={78} label="LOT" caption="RUCH" />
      <Joystick side="right" size={size} color="#7dd3fc" onChange={aim} disabled={tiltEnabled} zoneWidthPct={50} bottomPadding={78} label="CEL" caption="CEL" hotRing={.8} onHotChange={hot} sideSlot={<button {...handlers} className="flex items-center justify-center rounded-full border-4 border-sky-300/40 text-xs font-black tracking-widest text-white active:scale-95" style={{ width: actionSize * .65, height: actionSize * .65, background: 'radial-gradient(circle at 35% 28%,#7dd3fc,#1454b2 65%,#0b2767)', boxShadow: '0 7px 0 #061745, 0 0 28px #7dd3fc66', touchAction: 'none' }}>OGIEŃ</button>} />
    </> : <><Joystick side="left" size={size} color={st.color} onChange={drive} disabled={tiltEnabled} zoneWidthPct={56} bottomPadding={78} label="RUCH" caption={layout === 'minimal' ? 'RUCH' : st.game === 'snake' ? 'SKRĘCAJ · UNIKAJ ŚCIAN' : st.game === 'race' || st.game === 'league' ? 'KIERUNEK JAZDY' : 'PORUSZANIE POSTACIĄ'} /><div className="absolute bottom-0 right-3 z-20 flex w-[42%] flex-col items-center justify-end gap-2" style={{ paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}><button {...handlers} className="flex items-center justify-center rounded-full border-4 border-white/30 text-xs font-black tracking-widest text-[#081020] active:scale-95 sm:text-base" style={{ width: actionSize, height: actionSize, background: `radial-gradient(circle at 35% 25%,#fff,${info.accent} 55%,${info.accentSoft})`, boxShadow: `0 9px 0 ${info.accentSoft}, 0 14px 28px #0009, 0 0 28px ${info.accent}66`, touchAction: 'none' }}>{st.game === 'orbit' ? 'OGIEŃ' : st.game === 'race' ? 'AKCJA' : st.game === 'league' ? 'TURBO' : st.game === 'snake' ? 'SPRINT' : 'AKCJA'}</button>{layout !== 'minimal' && <span className="text-[9px] font-bold tracking-wider text-slate-400">{st.game === 'temple' ? 'PRZY SKRZYNI = OTWÓRZ' : st.game === 'race' ? 'BONUS / TURBO' : 'PRZYTRZYMAJ'}</span>}</div></>}
    {menuOpen && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-5 backdrop-blur" onClick={() => setMenuOpen(false)}><div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#141a2b] p-5" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between"><div className="text-base font-bold">Menu pada</div><button onClick={() => setMenuOpen(false)} className="pad-icon"><X size={17} /></button></div><p className="mt-2 text-xs text-slate-400">{admin ? 'Jako administrator możesz zatrzymać grę lub wrócić do biblioteki.' : 'Administrator zarządza rundą. Możesz rozłączyć ten telefon.'}</p><div className="mt-4"><div className="mb-1 text-[10px] font-black tracking-[.18em] text-slate-500">UKŁAD PADA</div><div className="grid grid-cols-2 gap-1.5">{([['minimal', 'MINIMALNY', '1 gałka + akcja'], ['twin', 'TWIN-STICK', isOrbit ? 'ruch + celowanie' : 'pełny układ']] as const).map(([mode, label, desc]) => <button key={mode} type="button" onClick={() => chooseLayout(mode)} className={`rounded-xl border px-2 py-2 text-left ${layout === mode ? 'border-orange-400/70 bg-orange-400/15' : 'border-white/10 bg-black/20'}`}><div className="text-[11px] font-black" style={{ color: layout === mode ? info.accent : '#e5e7eb' }}>{label}</div><div className="text-[10px] text-slate-500">{desc}</div></button>)}</div></div>{admin && <><button onClick={() => { send('pause'); setMenuOpen(false); }} className="pad-secondary mt-5 w-full"><Pause size={16} /> PAUZA / WZNÓW</button><button onClick={() => { if (window.confirm('Zakończyć rundę i wrócić do JoyPad?')) send('home'); }} className="pad-secondary mt-2 w-full"><Home size={16} /> WSZYSTKIE GRY</button></>}<button onClick={() => padClient.disconnect()} className="pad-secondary mt-2 w-full text-red-300"><LogOut size={16} /> ODŁĄCZ TELEFON</button></div></div>}
    {deviceSettings && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-5 backdrop-blur" onClick={() => setDeviceSettings(false)}><div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#141a2b] p-4" onClick={e => e.stopPropagation()}><div className="mb-2 flex items-center justify-between"><div className="flex items-center gap-2 text-sm font-black text-orange-200"><Settings size={16} /> FUNKCJE TELEFONU</div><button type="button" onClick={() => setDeviceSettings(false)} className="pad-icon"><X size={17} /></button></div><DeviceFeatures wakeLockEnabled={wakeLockEnabled} onWakeLockChange={onWakeLockChange} wakeLockStatus={wakeLockStatus} fullscreenStatus={fullscreenStatus} onFullscreen={fullscreen} tiltEnabled={tiltEnabled} onTiltChange={onTiltChange} tiltStatus={tiltStatus} /></div></div>}
  </div>;
}

export function JoypadController({ st, ...features }: { st: PadClientState } & ControllerFeatures) {
  return st.screen === 'game' && st.game !== 'tanks' && st.game !== null ? <ArcadeController st={st} {...features} /> : <RemoteController st={st} {...features} />;
}
