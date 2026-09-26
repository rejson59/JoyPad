import { readinessText } from '../console/sessionSummary';
import { playableIndices } from '../console/navigation';
import { Sheet } from '../console/Sheet';
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, Crown, Gamepad2, Home, LogOut, Maximize2, Menu, Pause, Pencil, Play, RotateCcw, Settings, Trophy } from 'lucide-react';
import { GAMES, gameInfo } from '../arcade/catalog';
import { padClient, type PadClientState } from '../net/padClient';
import { normalizeNick, type RemoteCommand } from '../net/protocol';
import { Joystick } from './Joystick';
import { getHapticStatus, haptic, unlockHaptics } from './haptics';
import { useConsolePreferences } from '../console/preferences';
import { useViewport } from '../console/useViewport';
import { DeviceFeatures, type FullscreenStatus, type TiltStatus, type WakeLockStatus } from './DeviceFeatures';

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

function vibrate(n = 14) { haptic(n); }
function send(command: RemoteCommand) { if (getHapticStatus() !== 'ready') unlockHaptics(); haptic(14); padClient.sendCommand(command); }

/** Edycja nicku działa po welcome — nie zrywa połączenia ani nie zmienia slotu. */
export function NickEditor({ st, compact = false }: { st: PadClientState; compact?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(st.nick || st.name || `Gracz ${st.slot + 1}`);
  useEffect(() => {
    if (!editing) setDraft(st.nick || st.name || `Gracz ${st.slot + 1}`);
  }, [editing, st.name, st.nick, st.slot]);

  const save = () => {
    const next = normalizeNick(draft, st.nick || st.name || `Gracz ${st.slot + 1}`);
    padClient.setNick(next);
    setDraft(next);
    setEditing(false);
    vibrate(12);
  };

  return (
    <div className={`rounded-2xl border border-orange-400/20 bg-orange-500/[.07] ${compact ? 'p-3' : 'mt-4 p-3.5'}`}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-black tracking-[.18em] text-orange-200">TWÓJ NICK</div>
          <div className="mt-1 text-[10px] text-slate-400">Widoczny w lobby i w każdej grze</div>
        </div>
        {!editing && <button type="button" onClick={() => setEditing(true)} className="flex shrink-0 items-center gap-1.5 rounded-lg border border-orange-300/25 bg-orange-400/10 px-2.5 py-1.5 text-[11px] font-bold text-orange-100 hover:bg-orange-400/20"><Pencil size={13} /> EDYTUJ</button>}
      </div>
      {editing ? (
        <div className="mt-2 flex gap-2">
          <input
            autoFocus
            value={draft}
            maxLength={14}
            onChange={e => setDraft(e.target.value.slice(0, 14))}
            onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false); }}
            className="min-w-0 flex-1 rounded-lg border border-orange-300/40 bg-black/40 px-3 py-2 text-sm font-bold text-white outline-none focus:border-orange-300"
            aria-label="Nick gracza"
          />
          <button type="button" onClick={save} className="flex shrink-0 items-center gap-1 rounded-lg bg-orange-300 px-3 py-2 text-[11px] font-black text-[#071521]"><Check size={14} /> ZAPISZ</button>
        </div>
      ) : <div className="mt-2 truncate text-lg font-black text-white">{st.nick || st.name || `Gracz ${st.slot + 1}`}</div>}
    </div>
  );
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
  const accent = game?.accent || selected.accent;
  const intentKind = st.screen === 'over' ? 'rematch' : 'ready';
  const intent = !!st.roster.find(player => player.slot === st.slot)?.[intentKind];
  const suggestedGame = st.roster.find(player => player.slot === st.slot)?.suggestedGame;
  const [reminderCooldown, setReminderCooldown] = useState(false);
  useEffect(() => { if (!reminderCooldown) return; const t = window.setTimeout(() => setReminderCooldown(false), 8000); return () => clearTimeout(t); }, [reminderCooldown]);
  const intentCount = st.roster.filter(player => player[intentKind]).length;
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
            <div><div className="joy-brand text-xl font-extrabold leading-none">Joy<span className="text-orange-400">Pad.</span></div><div className="joy-kicker mt-1 text-[8px] text-slate-500">PILOT</div></div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setDeviceSettings(true)} title="Funkcje telefonu" className="pad-icon"><Settings size={17} /></button>
            <button type="button" onClick={fullscreen} title="Pełny ekran" className="pad-icon"><Maximize2 size={17} /></button>
            <button type="button" onClick={() => padClient.disconnect()} title="Odłącz telefon" className="pad-icon text-red-300"><LogOut size={17} /></button>
          </div>
        </header>

        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="joy-kicker" style={{ color: accent }}>● {label}</span>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${admin ? 'border-orange-300/30 bg-orange-400/10 text-orange-200' : 'border-white/15 bg-white/5 text-slate-300'}`}>
            {admin ? <span className="flex items-center gap-1"><Crown size={12} /> ADMINISTRATOR</span> : `GRACZ ${st.slot + 1}`}
          </span>
        </div>

        {st.screen === 'lobby' ? (
          <>
            {/* Lobby jako poczekalnia: okładka wybranej gry crossfaduje przy każdej zmianie wyboru. */}
            <div className="rise-in relative mt-8 overflow-hidden rounded-[26px] border border-white/15 bg-white/[.045] shadow-[0_20px_50px_rgba(0,0,0,.2)]">
              <img key={selected.id} src={`${import.meta.env.BASE_URL}${selected.cover}`} alt="" width={1280} height={720} className="cover-in absolute inset-0 h-full w-full object-cover opacity-25" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#070a10] via-[#070a10]/72 to-transparent" />
              <div className="relative p-6 text-center">
                <div className="joy-kicker" style={{ color: accent }}>WYBRANA GRA {String(playableIndices.indexOf(st.selection) + 1).padStart(2, '0')} / {playableIndices.length.toString().padStart(2, '0')}</div>
                <h1 className="joy-heading mt-3 text-3xl font-extrabold leading-tight">{selected.title}</h1>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{selected.genre} · {selected.players}</p>
                <div className="mt-5 h-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${((playableIndices.indexOf(st.selection) + 1) / playableIndices.length) * 100}%`, background: accent, transition: 'width 420ms var(--ease-out-quart)' }} /></div>
              </div>
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
                <div className="mt-4"><Trophy className="mx-auto mb-2 h-8 w-8 text-orange-200" /><div className="text-lg font-bold" style={{ color: st.result?.youWon ? accent : '#f1f5f9' }}>{st.result?.youWon ? 'Wygrana!' : st.result?.winnerName || 'Koniec rundy'}</div><p className="mt-1 text-xs text-slate-400">{admin ? 'Wybierz rewanż albo wróć do biblioteki.' : 'Administrator decyduje o kolejnej rundzie.'}</p></div>
              ) : <p className="mt-3 text-sm leading-relaxed text-slate-300">{admin ? 'Steruj ustawieniami i rozpocznij rundę przyciskiem OK.' : 'Administrator ustawia grę. Poczekaj na start.'}</p>}
            </div>
            {st.options && st.screen !== 'over' && <div className="mt-4 grid grid-cols-2 gap-2">{[[st.options.primaryLabel, st.options.primaryValue, '← / →'], [st.options.secondaryLabel, st.options.secondaryValue, '↑ / ↓']].map(([title, value, help]) => <div key={title} className="rounded-xl border border-white/10 bg-white/[.04] p-3"><div className="joy-kicker text-[9px] text-slate-400">{title}</div><div className="mt-2 text-xs font-bold" style={{ color: accent }}>{value}</div><div className="mt-2 text-[10px] text-slate-500">{help}</div></div>)}</div>}
            {st.game && (st.screen === 'menu' || st.screen === 'setup' || st.screen === 'over') && <div className="pad-intent">
              <button type="button" aria-pressed={intent} onClick={() => { unlockHaptics(); haptic(18, 1); padClient.sendIntent(intentKind, !intent); }}>
                <Check size={20} />{st.screen === 'over' ? intent ? 'Chcę rewanż ✓' : 'Chcę rewanż' : intent ? 'Jestem gotowy ✓' : 'Jestem gotowy'}
              </button>
              {st.screen !== 'over' && <p>{readinessText(st.roster)}</p>}
              {admin && st.screen !== 'over' && st.roster.some(p => !p.ready) && <button disabled={reminderCooldown} onClick={() => { padClient.remindReady(); setReminderCooldown(true); }}>{reminderCooldown ? 'Przypomnienie wysłane' : 'Przypomnij ekipie'}</button>}
              <p role="status">{intentCount}/{st.roster.length} {st.screen === 'over' ? 'chętnych na rewanż' : 'gotowych'} · Startuje gospodarz</p>
            </div>}
            {st.screen === 'over' && <section className="pad-proposals" aria-label="Propozycja następnej gry"><h2>Co gramy dalej?</h2><p>To propozycja. Gospodarz zatwierdza na TV.</p>{GAMES.filter(g => !g.wip && g.id !== st.game).map(g => <button key={g.id} aria-pressed={suggestedGame === g.id} onClick={() => padClient.suggestGame(suggestedGame === g.id ? null : g.id)}><img src={`${import.meta.env.BASE_URL}${g.cover}`} alt="" /><span>{g.title}</span>{suggestedGame === g.id && <Check size={18} />}</button>)}</section>}
            {admin && <>
              {st.screen !== 'over' && <RemoteNavigation admin accent={accent} />}
              <button type="button" onClick={() => send('select')} className="pad-primary mt-4 w-full" style={{ background: accent }}>
                {st.screen === 'over' ? <><RotateCcw size={17} /> {actionText}</> : <><Play size={17} fill="currentColor" /> {actionText}</>}
              </button>
              {st.screen === 'over' && <button type="button" onClick={() => send('home')} className="pad-secondary mt-2 w-full"><Home size={14} /> WSZYSTKIE GRY</button>}
            </>}
          </>
        )}
      </div>
      {deviceSettings && <Sheet title="Twój kontroler." onClose={() => setDeviceSettings(false)}><NickEditor st={st} compact /><DeviceFeatures wakeLockEnabled={wakeLockEnabled} onWakeLockChange={onWakeLockChange} wakeLockStatus={wakeLockStatus} fullscreenStatus={fullscreenStatus} onFullscreen={fullscreen} tiltEnabled={tiltEnabled} onTiltChange={onTiltChange} tiltStatus={tiltStatus} /></Sheet>}
    </div>
  );
}



function ArcadeController({ st, ...features }: { st: PadClientState } & ControllerFeatures) {
  const prefs = useConsolePreferences();
  const viewport = useViewport();
  const [pressed, setPressed] = useState(false);
  const { fullscreen, fullscreenStatus, wakeLockEnabled, onWakeLockChange, wakeLockStatus, tiltEnabled, onTiltChange, tiltStatus } = features;
  const info = st.game ? gameInfo(st.game) : GAMES[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmExit, setConfirmExit] = useState(false);
  const [deviceSettings, setDeviceSettings] = useState(false);
  const button = useRef(false);
  const admin = st.slot === st.adminSlot;
  const size = Math.min(210, Math.max(145, Math.floor(Math.min(viewport.width * .38, viewport.height * .48))));
  const actionSize = Math.min(180 * prefs.controlSize, Math.max(110, Math.floor(viewport.height * .33 * prefs.controlSize)), Math.floor(viewport.width * .44) - 8);

  const setButton = (pressed: boolean) => {
    button.current = pressed;
    setPressed(pressed);
    if (pressed) { if (getHapticStatus() !== 'ready') unlockHaptics(); vibrate(10); }
    padClient.setInput({ fire: pressed });
  };
  useEffect(() => () => { padClient.setInput({ fwd: 0, turn: 0, dirX: 0, dirY: 0, aimX: 0, aimY: 0, fire: false }); }, []);
  const drive = useCallback((x: number, y: number) => padClient.setInput({ turn: x, fwd: y, dirX: x, dirY: -y }), []);
  const actionPointer = useRef<number | null>(null);
  useEffect(() => {
    const reset = () => { actionPointer.current = null; button.current = false; setPressed(false); padClient.setInput({ fire: false, fwd: 0, turn: 0, dirX: 0, dirY: 0 }); };
    const end = (e: PointerEvent) => { if (e.pointerId === actionPointer.current) { actionPointer.current = null; button.current = false; setPressed(false); padClient.setInput({ fire: false }); } };
    window.addEventListener('pointerup', end, true); window.addEventListener('pointercancel', end, true);
    if (menuOpen || deviceSettings || st.arcadeHud?.paused) reset();
    const safetyEvents = ['blur', 'pagehide', 'orientationchange', 'resize', 'joypad-release-input'] as const;
    safetyEvents.forEach(event => window.addEventListener(event, reset));
    const hidden = () => { if (document.hidden) reset(); };
    document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('pointerup', end, true); window.removeEventListener('pointercancel', end, true); safetyEvents.forEach(event => window.removeEventListener(event, reset)); document.removeEventListener('visibilitychange', hidden); };
  }, [menuOpen, deviceSettings, st.arcadeHud?.paused]);
  const handlers = {
    onPointerDown: (e: RPointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.stopPropagation(); if (actionPointer.current !== null) return; actionPointer.current = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Window release fallback. */ } setButton(true); },
    onPointerUp: (e: RPointerEvent<HTMLButtonElement>) => { if (e.pointerId === actionPointer.current) { actionPointer.current = null; setButton(false); } }, onPointerCancel: () => { actionPointer.current = null; setButton(false); }, onLostPointerCapture: () => { actionPointer.current = null; setButton(false); },
    onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
  };
  return <div className="pad-hardware fixed inset-0 select-none overflow-hidden text-white" style={{ background: `radial-gradient(ellipse at 50% 110%, ${info.accentSoft}55, #080d19 67%)`, touchAction: 'none' }}>
    <div className="pointer-events-none absolute inset-0 opacity-[.025]" style={{ backgroundImage: 'linear-gradient(#fff 1px,transparent 1px),linear-gradient(90deg,#fff 1px,transparent 1px)', backgroundSize: '35px 35px' }} />
    {/* Tylko przyciski — wyniki, czasy i lista graczy są na ekranie głównym. */}
    <header className="absolute inset-x-0 top-0 z-30 flex items-center justify-end gap-1 border-b border-white/10 bg-[#080d19]/80 px-3 py-2 backdrop-blur" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
      <div className="pad-player-identity mr-auto"><i style={{ background: st.color }} /><span>{st.nick || st.name}<small>PAD {String(st.slot + 1).padStart(2, '0')}</small></span></div>
      <button className="pad-icon" onClick={() => setDeviceSettings(true)} title="Ustawienia"><Settings size={16} /></button>
      <button className="pad-icon" onClick={fullscreen} title="Pełny ekran"><Maximize2 size={16} /></button>
      {admin && <button className="pad-icon" onClick={() => send('pause')} title="Pauza"><Pause size={16} /></button>}
      <button className="pad-icon" onClick={() => setMenuOpen(v => !v)} title="Menu"><Menu size={17} /></button>
    </header>
    <div className="pad-engraving" aria-hidden="true"><span>JoyPad.</span><small>{info.title}</small></div>
    {!st.arcadeHud && (
      <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 px-8 text-center text-sm font-bold text-amber-200">Runda trwa. Dołączysz od następnej rozgrywki.</div>
    )}
    <Joystick side={prefs.hand === 'left' ? 'right' : 'left'} size={size} color={st.color} onChange={drive} disabled={tiltEnabled || !st.arcadeHud || menuOpen || deviceSettings || Boolean(st.arcadeHud?.paused)} zoneWidthPct={56} bottomPadding={78} label="RUCH" caption={st.game === 'snake' ? 'SKRĘCAJ · UNIKAJ ŚCIAN' : st.game === 'race' || st.game === 'league' ? 'KIERUNEK JAZDY' : st.game === 'orbit' ? 'LOT · PEŁNIE = DOPALACZ' : 'PORUSZANIE POSTACIĄ'} />
    <div className={`absolute bottom-0 ${prefs.hand === 'left' ? 'left-3' : 'right-3'} z-20 flex w-[42%] flex-col items-center justify-end gap-2`} style={{ paddingBottom: `max(${18 + prefs.controlHeight}px, env(safe-area-inset-bottom))` }}>
      <button {...handlers} disabled={!st.arcadeHud || menuOpen || deviceSettings || Boolean(st.arcadeHud?.paused)} className={`pad-action ${pressed ? 'is-pressed' : ''} flex items-center justify-center rounded-full border-4 border-white/30 text-xs font-black tracking-widest text-[#081020] active:scale-95 sm:text-base`} style={{ width: actionSize, height: actionSize, background: `radial-gradient(circle at 35% 25%,#fff,${info.accent} 55%,${info.accentSoft})`, boxShadow: `0 9px 0 ${info.accentSoft}, 0 14px 28px #0009, 0 0 28px ${info.accent}66`, touchAction: 'none' }}>{st.game === 'orbit' ? 'OGIEŃ' : st.game === 'race' ? 'AKCJA' : st.game === 'league' ? 'TURBO' : st.game === 'snake' ? 'SPRINT' : 'AKCJA'}</button>
      <span className="text-[9px] font-bold tracking-wider text-slate-400">{st.game === 'temple' ? 'PRZY SKRZYNI = OTWÓRZ' : st.game === 'race' ? 'BONUS / TURBO' : 'PRZYTRZYMAJ'}</span>
    </div>
    {menuOpen && <Sheet title={info.title} onClose={() => { setMenuOpen(false); setConfirmExit(false); }}><p className="mt-2 text-xs text-slate-400">{admin ? 'Jako administrator możesz zatrzymać grę lub wrócić do biblioteki.' : 'Administrator zarządza rundą. Możesz rozłączyć ten telefon.'}</p><NickEditor st={st} compact />{admin && <><button onClick={() => { send('pause'); setMenuOpen(false); }} className="pad-secondary mt-5 w-full"><Pause size={16} /> PAUZA / WZNÓW</button><button onClick={() => setConfirmExit(true)} className="pad-secondary mt-2 w-full"><Home size={16} /> WSZYSTKIE GRY</button></>}<button onClick={() => padClient.disconnect()} className="pad-secondary mt-2 w-full text-red-300"><LogOut size={16} /> ODŁĄCZ TELEFON</button>{confirmExit && <div className="os-exit-confirm" role="alert"><h3>Zakończyć rundę?</h3><p>Wszyscy wrócą do biblioteki. Połączenia telefonów pozostaną aktywne.</p><button className="os-secondary" onClick={() => { send('home'); setMenuOpen(false); setConfirmExit(false); }}>Tak, wróć do biblioteki</button><button className="os-secondary" onClick={() => setConfirmExit(false)}>Zostań w grze</button></div>}</Sheet>}
    {deviceSettings && <Sheet title="Twój kontroler." onClose={() => setDeviceSettings(false)}><NickEditor st={st} compact /><DeviceFeatures wakeLockEnabled={wakeLockEnabled} onWakeLockChange={onWakeLockChange} wakeLockStatus={wakeLockStatus} fullscreenStatus={fullscreenStatus} onFullscreen={fullscreen} tiltEnabled={tiltEnabled} onTiltChange={onTiltChange} tiltStatus={tiltStatus} /></Sheet>}
  </div>;
}

export function JoypadController({ st, ...features }: { st: PadClientState } & ControllerFeatures) {
  return st.screen === 'game' && st.game !== 'tanks' && st.game !== null ? <ArcadeController st={st} {...features} /> : <RemoteController st={st} {...features} />;
}
