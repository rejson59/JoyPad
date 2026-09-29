import { NickEditor } from './NickEditor';
export { NickEditor } from './NickEditor';
import { JoyPadLogo } from '../components/JoyPadLogo';
import { RoomControls } from '../platform/RoomControls';
import { GameSuggestions, PlayerLounge } from '../platform/PlayerLounge';
import { loadProfile, THEMES } from '../platform/profile';
import { readinessText } from '../console/sessionSummary';
import { playableIndices } from '../console/navigation';
import { Sheet } from '../console/Sheet';
import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ArrowLeft, Check, Crown, Expand, Home, LogOut, Maximize2, Menu, Pause, Play, QrCode, RotateCcw, Settings, Trophy } from 'lucide-react';
import { GAMES, gameInfo, localizeGame } from '../arcade/catalog';
import { useT } from '../platform/i18n';
import { padClient, type PadClientState } from '../net/padClient';
import { type RemoteCommand } from '../net/protocol';
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

/**
 * v1.8: kompaktowy joystick nawigacji zamiast strzałek (D-pad). Pochylenie
 * przekraczające próg wysyła komendę pilota i powtarza ją, dopóki trzymasz.
 */
function NavStick({ admin, accent }: { admin: boolean; accent: string }) {
  const { t } = useT();
  const ref = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const repeat = useRef(0);
  const held = useRef<RemoteCommand | null>(null);

  const stopRepeat = () => { window.clearInterval(repeat.current); repeat.current = 0; held.current = null; };
  useEffect(() => stopRepeat, []);
  const fire = (command: RemoteCommand) => { if (admin) send(command); };
  const update = (e: RPointerEvent) => {
    if (!admin || !ref.current) return;
    e.preventDefault();
    const rect = ref.current.getBoundingClientRect();
    let dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    let dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    setKnob({ x: dx, y: dy });
    const threshold = 0.38;
    let command: RemoteCommand | null = null;
    if (Math.abs(dx) > Math.abs(dy)) { if (dx < -threshold) command = 'left'; else if (dx > threshold) command = 'right'; }
    else if (dy < -threshold) command = 'up';
    else if (dy > threshold) command = 'down';
    if (command !== held.current) {
      stopRepeat();
      if (command) {
        held.current = command;
        fire(command);
        repeat.current = window.setInterval(() => fire(command as RemoteCommand), 340);
      }
    }
  };
  const release = () => { setKnob({ x: 0, y: 0 }); setActive(false); stopRepeat(); };
  return <div className={`nav-stick ${active ? 'is-active' : ''}`} ref={ref} role="application"
    aria-label={t('remote.adminNav')}
    style={{ '--stick-accent': accent } as React.CSSProperties}
    onPointerDown={e => { if (!admin) return; (e.target as HTMLElement).setPointerCapture?.(e.pointerId); setActive(true); update(e); }}
    onPointerMove={e => { if (active) update(e); }}
    onPointerUp={release} onPointerCancel={release} onLostPointerCapture={release}>
    <i className="nav-stick-ring" aria-hidden="true" />
    <span className="nav-stick-knob" style={{ transform: `translate(${knob.x * 26}px, ${knob.y * 26}px)` }} aria-hidden="true" />
  </div>;
}

function RemoteNavigation({ admin, accent }: { admin: boolean; accent: string }) {
  const { t } = useT();
  return (
    <div className="mt-5 rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="mb-3 text-center text-[10px] font-black tracking-[.2em] text-slate-500">{t('remote.adminNav')}</div>
      <div className="mx-auto flex w-[210px] items-center justify-center gap-3">
        <NavStick admin={admin} accent={accent} />
        <div className="grid grid-cols-1 gap-2">
          <RemoteButton command="y" label={t('remote.y')} admin={admin}><QrCode size={17} /></RemoteButton>
          <RemoteButton command="x" label={t('remote.x')} admin={admin}><Expand size={17} /></RemoteButton>
        </div>
        <RemoteButton command="select" label={t('remote.select')} admin={admin} primary>
          <span className="text-[10px] font-black tracking-wider">OK</span>
        </RemoteButton>
      </div>
      <div className="mt-3 flex justify-center gap-2">
        <button type="button" onClick={() => send('back')} disabled={!admin} className="pad-secondary min-w-[112px] disabled:cursor-not-allowed disabled:opacity-40">
          <ArrowLeft size={14} /> {t('remote.back')}
        </button>
        <button type="button" onClick={() => send('home')} disabled={!admin} className="pad-secondary min-w-[112px] disabled:cursor-not-allowed disabled:opacity-40">
          <Home size={14} /> {t('remote.games')}
        </button>
      </div>
      {!admin && <p className="mt-3 text-center text-[10px] text-slate-500">{t('remote.onlyAdmin')}</p>}
      <div className="mt-3 text-center text-[10px] text-slate-500" style={{ color: admin ? `${accent}cc` : undefined }}>
        {t('remote.arrowsHelp')}
      </div>
    </div>
  );
}

function LandscapeRemote({ st, onSettings, onRoom, onLounge, fullscreen }: { st: PadClientState; onSettings: () => void; onRoom: () => void; onLounge: () => void; fullscreen: () => void }) {
  const { language, t } = useT();
  const admin = st.slot === st.adminSlot;
  const game = localizeGame(st.game ? gameInfo(st.game) : GAMES[st.selection] ?? GAMES[0], language);
  return <div className="landscape-remote">
    <header><JoyPadLogo size={38} /><span>JOYPAD <small>{t('remote.controllerMode')}</small></span><div><button onClick={onLounge}>{t('remote.profile')}</button>{admin && <button onClick={onRoom}>{t('remote.room')}</button>}<button aria-label={t('remote.phoneSettings')} onClick={onSettings}><Settings size={17} /></button><button aria-label={t('arcadePad.fullscreen')} onClick={fullscreen}><Maximize2 size={17} /></button></div></header>
    {admin ? <main className="landscape-controls"><div className="landscape-dpad"><span className="pad-shoulder">{t('remote.navShoulder')}</span><NavStick admin={admin} accent={st.color} /></div>
      <div className="landscape-display"><span className="os-eyebrow">{st.screen === 'lobby' ? t('remote.lobby') : st.screen === 'over' ? t('remote.results') : t('remote.prep')}</span><h1>{game.title}</h1>{st.options ? <p>{st.options.primaryValue} · {st.options.secondaryValue}</p> : <p>{st.screen === 'over' ? t('remote.roundHint') : t('remote.selectHint')}</p>}<div><button onClick={() => send('home')}><Home size={16} /> {t('remote.games')}</button><button onClick={onRoom}><Crown size={16} /> {t('remote.adminRole')}</button></div><small>{t('remote.rotateHint')}</small></div>
      <div className="landscape-ab"><span className="pad-shoulder">{t('remote.actionShoulder')}</span><div className="landscape-xy"><button className="physical-y" aria-label={t('remote.y')} onClick={() => send('y')} disabled={!admin}><QrCode size={16} /><small>{t('remote.y')}</small></button><button className="physical-x" aria-label={t('remote.x')} onClick={() => send('x')} disabled={!admin}><Expand size={16} /><small>{t('remote.x')}</small></button></div><button className="physical-b" aria-label={t('remote.back')} onClick={() => send('back')}>B<small>{t('remote.back')}</small></button><button className="physical-a" aria-label={t('remote.select')} onClick={() => send('select')}>A<small>{t('remote.select')}</small></button></div>
    </main> : <main className="landscape-wait"><div><JoyPadLogo size={110} /><h1>{t('remote.playerPass')}</h1><p>{st.nick}, {t('remote.crewStarting')}</p><button onClick={onLounge}>{t('remote.customizePass')}</button>{st.game && ['menu', 'setup', 'over'].includes(st.screen) && <button onClick={() => { const kind = st.screen === 'over' ? 'rematch' : 'ready'; padClient.sendIntent(kind, !st.roster.find(p => p.slot === st.slot)?.[kind]); }}>{st.screen === 'over' ? t('remote.rematchIntent') : st.roster.find(p => p.slot === st.slot)?.ready ? t('remote.readyIntentDone') : t('remote.readyIntent')}</button>}</div>{['lobby', 'over'].includes(st.screen) && <GameSuggestions st={st} />}</main>}
    <footer><span>● {st.nick} / {t('remote.playerRole', { n: st.slot + 1 })}</span><span>{admin ? t('remote.footerAdmin') : t('remote.footerGuest')} · {st.code}</span></footer>
  </div>;
}

function RemoteController({ st, ...features }: { st: PadClientState } & ControllerFeatures) {
  const { language, t } = useT();
  const { fullscreen, fullscreenStatus, wakeLockEnabled, onWakeLockChange, wakeLockStatus, tiltEnabled, onTiltChange, tiltStatus } = features;
  const admin = st.slot === st.adminSlot;
  const [deviceSettings, setDeviceSettings] = useState(false);
  const [roomOpen, setRoomOpen] = useState(false);
  const [loungeOpen, setLoungeOpen] = useState(false);
  const [profile, setProfile] = useState(loadProfile);
  useEffect(() => { if (!admin) setRoomOpen(false); }, [admin]);
  const viewport = useViewport();
  const landscape = viewport.width > viewport.height;
  const selected = localizeGame(GAMES[st.selection] ?? GAMES[0], language);
  const game = st.game ? localizeGame(gameInfo(st.game), language) : null;
  const accent = THEMES[profile.theme];
  const intentKind = st.screen === 'over' ? 'rematch' : 'ready';
  const intent = !!st.roster.find(player => player.slot === st.slot)?.[intentKind];
  const [reminderCooldown, setReminderCooldown] = useState(false);
  useEffect(() => { if (!reminderCooldown) return; const t = window.setTimeout(() => setReminderCooldown(false), 8000); return () => clearTimeout(t); }, [reminderCooldown]);
  const intentCount = st.roster.filter(player => player[intentKind]).length;
  const label = st.screen === 'lobby' ? t('library.availableGames') : st.screen === 'over' ? t('results.roundEnd') : st.screen === 'setup' ? t('setup.prepare') : t('remote.gameMenu');
  const actionText = st.screen === 'over'
    ? t('remote.action.rematch')
    : st.screen === 'setup' && st.game === 'tanks'
      ? t('remote.action.battle')
      : st.game === 'tanks' && st.screen === 'menu'
        ? t('remote.action.mode')
        : t('remote.action.start');

  const panels = <>
    {roomOpen && admin && <Sheet title={t('library.room')} onClose={() => setRoomOpen(false)}><RoomControls session={st} onAction={action => padClient.manageRoom(action)} /></Sheet>}
    {loungeOpen && <Sheet title={t('remote.profile')} onClose={() => setLoungeOpen(false)}><PlayerLounge st={st} onProfile={setProfile} /></Sheet>}
    {deviceSettings && <Sheet title={t('controller.title')} onClose={() => setDeviceSettings(false)}><NickEditor st={st} compact /><DeviceFeatures wakeLockEnabled={wakeLockEnabled} onWakeLockChange={onWakeLockChange} wakeLockStatus={wakeLockStatus} fullscreenStatus={fullscreenStatus} onFullscreen={fullscreen} tiltEnabled={tiltEnabled} onTiltChange={onTiltChange} tiltStatus={tiltStatus} /></Sheet>}
  </>;
  if (landscape) return <div className="pad-landscape-mode" style={{ '--game-accent': accent } as React.CSSProperties}><LandscapeRemote st={st} onSettings={() => setDeviceSettings(true)} onRoom={() => setRoomOpen(true)} onLounge={() => setLoungeOpen(true)} fullscreen={fullscreen} />{panels}</div>;

  return (
    <div className="pad-joy pad-portrait-mode min-h-[100dvh] overflow-y-auto text-white" style={{ '--game-accent': accent } as React.CSSProperties}>
      <div className="pointer-events-none fixed inset-0 opacity-20" style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent}, transparent 60%)` }} />
      <div className="relative mx-auto flex min-h-[100dvh] max-w-[430px] flex-col px-4 pb-8" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <JoyPadLogo size={45} />
            <div><div className="joy-brand text-xl font-extrabold leading-none">Joy<span className="text-orange-400">Pad.</span></div><div className="joy-kicker mt-1 text-[8px] text-slate-500">{admin ? t('remote.vertical') : t('remote.loungeMode')}</div></div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setDeviceSettings(true)} title={t('remote.phoneSettings')} className="pad-icon"><Settings size={17} /></button>
            <button type="button" onClick={fullscreen} title={t('arcadePad.fullscreen')} className="pad-icon"><Maximize2 size={17} /></button>
            <button type="button" onClick={() => padClient.disconnect()} title={t('controller.disconnect')} className="pad-icon text-red-300"><LogOut size={17} /></button>
          </div>
        </header>

        <div className="pad-system-shortcuts"><button onClick={() => setLoungeOpen(true)}>✦ {t('remote.profile')}</button>{admin && <button onClick={() => setRoomOpen(true)}><Crown size={14} /> {t('library.room')}</button>}</div>
        <div className="mt-6 flex items-center justify-between gap-2">
          <span className="joy-kicker" style={{ color: accent }}>● {label}</span>
          <span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${admin ? 'border-orange-300/30 bg-orange-400/10 text-orange-200' : 'border-white/15 bg-white/5 text-slate-300'}`}>
            {admin ? <span className="flex items-center gap-1"><Crown size={12} /> {t('remote.adminRole')}</span> : t('remote.playerRole', { n: st.slot + 1 })}
          </span>
        </div>

        {st.screen === 'lobby' ? (
          <>
            {/* Lobby jako poczekalnia: okładka wybranej gry crossfaduje przy każdej zmianie wyboru. */}
            <div className="rise-in relative mt-8 overflow-hidden rounded-[26px] border border-white/15 bg-white/[.045] shadow-[0_20px_50px_rgba(0,0,0,.2)]">
              <img key={selected.id} src={`${import.meta.env.BASE_URL}${selected.cover}`} alt="" width={1280} height={720} className="cover-in absolute inset-0 h-full w-full object-cover opacity-25" />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#070a10] via-[#070a10]/72 to-transparent" />
              <div className="relative p-6 text-center">
                <div className="joy-kicker" style={{ color: accent }}>{t('remote.selectedGame')} {String(playableIndices.indexOf(st.selection) + 1).padStart(2, '0')} / {playableIndices.length.toString().padStart(2, '0')}</div>
                <h1 className="joy-heading mt-3 text-3xl font-extrabold leading-tight">{selected.title}</h1>
                <p className="mt-2 text-xs leading-relaxed text-slate-400">{selected.genre} · {selected.players}</p>
                <div className="mt-5 h-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${((playableIndices.indexOf(st.selection) + 1) / playableIndices.length) * 100}%`, background: accent, transition: 'width 420ms var(--ease-out-quart)' }} /></div>
              </div>
            </div>
            <p className="mt-5 text-center text-sm leading-relaxed text-slate-300">{admin ? t('remote.navigateAsAdmin') : t('remote.waitForAdmin')}</p>
            {admin && <RemoteNavigation admin accent={accent} />}
            <GameSuggestions st={st} />
          </>
        ) : (
          <>
            <div className="mt-8 rounded-[26px] border border-white/15 bg-white/[.045] p-6 text-center">
              <div className="joy-kicker" style={{ color: accent }}>{game?.eyebrow || 'JOYPAD'}{st.screen === 'over' ? ` / ${t('results.summary')}` : ''}</div>
              <h1 className="joy-heading mt-3 text-3xl font-extrabold leading-tight">{game?.title || 'JoyPad'}</h1>
              {st.screen === 'over' ? (
                <div className="mt-4"><Trophy className="mx-auto mb-2 h-8 w-8 text-orange-200" /><div className="text-lg font-bold" style={{ color: st.result?.youWon ? accent : '#f1f5f9' }}>{st.result?.youWon ? t('remote.win') : st.result?.winnerName || t('remote.roundOver')}</div><p className="mt-1 text-xs text-slate-400">{admin ? t('remote.adminOver') : t('remote.guestOver')}</p></div>
              ) : <p className="mt-3 text-sm leading-relaxed text-slate-300">{admin ? t('remote.adminSettings') : t('remote.guestSettings')}</p>}
            </div>
            {st.options && st.screen !== 'over' && <div className="mt-4 grid grid-cols-2 gap-2">{[[st.options.primaryLabel, st.options.primaryValue, '← / →'], [st.options.secondaryLabel, st.options.secondaryValue, '↑ / ↓']].map(([title, value, help]) => <div key={title} className="rounded-xl border border-white/10 bg-white/[.04] p-3"><div className="joy-kicker text-[9px] text-slate-400">{title}</div><div className="mt-2 text-xs font-bold" style={{ color: accent }}>{value}</div><div className="mt-2 text-[10px] text-slate-500">{help}</div></div>)}</div>}
            {st.game && (st.screen === 'menu' || st.screen === 'setup' || st.screen === 'over') && <div className="pad-intent">
              <button type="button" aria-pressed={intent} onClick={() => { unlockHaptics(); haptic(18, 1); padClient.sendIntent(intentKind, !intent); }}>
                <Check size={20} />{st.screen === 'over' ? intent ? t('remote.rematchIntentDone') : t('remote.rematchIntent') : intent ? t('remote.readyIntentDone') : t('remote.readyIntent')}
              </button>
              {st.screen !== 'over' && <p>{readinessText(st.roster, language)}</p>}
              {admin && st.screen !== 'over' && st.roster.some(p => !p.ready) && <button disabled={reminderCooldown} onClick={() => { padClient.remindReady(); setReminderCooldown(true); }}>{reminderCooldown ? t('remote.reminded') : t('remote.remind')}</button>}
              <p role="status">{intentCount}/{st.roster.length} {st.screen === 'over' ? t('remote.rematchCount') : t('remote.readyCount')} · {t('remote.hostStarts')}</p>
            </div>}
            {st.screen === 'over' && <GameSuggestions st={st} />}
            {admin && <>
              <RemoteNavigation admin accent={accent} />
              <button type="button" onClick={() => send(st.screen === 'over' ? 'restart' : 'select')} className="pad-primary mt-4 w-full" style={{ background: accent }}>
                {st.screen === 'over' ? <><RotateCcw size={17} /> {actionText}</> : <><Play size={17} fill="currentColor" /> {actionText}</>}
              </button>
              {st.screen === 'over' && <button type="button" onClick={() => send('home')} className="pad-secondary mt-2 w-full"><Home size={14} /> {t('remote.games')}</button>}
            </>}
          </>
        )}
      </div>
      {panels}
    </div>
  );
}



function ArcadeController({ st, ...features }: { st: PadClientState } & ControllerFeatures) {
  const { language, t } = useT();
  const prefs = useConsolePreferences();
  const viewport = useViewport();
  const [pressed, setPressed] = useState(false);
  const { fullscreen, fullscreenStatus, wakeLockEnabled, onWakeLockChange, wakeLockStatus, tiltEnabled, onTiltChange, tiltStatus } = features;
  const info = localizeGame(st.game ? gameInfo(st.game) : GAMES[0], language);
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
      <button className="pad-icon" onClick={() => setDeviceSettings(true)} title={t('arcadePad.settings')}><Settings size={16} /></button>
      <button className="pad-icon" onClick={fullscreen} title={t('arcadePad.fullscreen')}><Maximize2 size={16} /></button>
      {admin && <button className="pad-icon" onClick={() => send('pause')} title={t('pad.pauseTitle')}><Pause size={16} /></button>}
      <button className="pad-icon" onClick={() => setMenuOpen(v => !v)} title={t('arcadePad.menu')}><Menu size={17} /></button>
    </header>
    <div className="pad-engraving" aria-hidden="true"><span>JoyPad.</span><small>{info.title}</small></div>
    {!st.arcadeHud && (
      <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 px-8 text-center text-sm font-bold text-amber-200">{t('arcadePad.nextRound')}</div>
    )}
    <Joystick side={prefs.hand === 'left' ? 'right' : 'left'} size={size} color={st.color} onChange={drive} disabled={tiltEnabled || !st.arcadeHud || menuOpen || deviceSettings || Boolean(st.arcadeHud?.paused)} zoneWidthPct={56} bottomPadding={78} label={t('arcadePad.move')} caption={st.game === 'snake' ? t('arcadePad.snakeCaption') : st.game === 'race' || st.game === 'league' ? t('arcadePad.raceCaption') : st.game === 'orbit' ? t('arcadePad.orbitCaption') : t('arcadePad.characterCaption')} />
    <div className={`absolute bottom-0 ${prefs.hand === 'left' ? 'left-3' : 'right-3'} z-20 flex w-[42%] flex-col items-center justify-end gap-2`} style={{ paddingBottom: `max(${18 + prefs.controlHeight}px, env(safe-area-inset-bottom))` }}>
      <button {...handlers} disabled={!st.arcadeHud || menuOpen || deviceSettings || Boolean(st.arcadeHud?.paused)} className={`pad-action ${pressed ? 'is-pressed' : ''} flex items-center justify-center rounded-full border-4 border-white/30 text-xs font-black tracking-widest text-[#081020] active:scale-95 sm:text-base`} style={{ width: actionSize, height: actionSize, background: `radial-gradient(circle at 35% 25%,#fff,${info.accent} 55%,${info.accentSoft})`, boxShadow: `0 9px 0 ${info.accentSoft}, 0 14px 28px #0009, 0 0 28px ${info.accent}66`, touchAction: 'none' }}>{st.game === 'orbit' ? t('arcadePad.fire') : st.game === 'race' ? t('arcadePad.action') : st.game === 'league' ? t('arcadePad.turbo') : st.game === 'snake' ? t('arcadePad.sprint') : t('arcadePad.action')}</button>
      <span className="text-[9px] font-bold tracking-wider text-slate-400">{st.game === 'race' ? t('arcadePad.raceHint') : t('arcadePad.hold')}</span>
    </div>
    {menuOpen && <Sheet title={info.title} onClose={() => { setMenuOpen(false); setConfirmExit(false); }}><p className="mt-2 text-xs text-slate-400">{admin ? t('arcadePad.adminMenu') : t('arcadePad.guestMenu')}</p><NickEditor st={st} compact />{admin && <><button onClick={() => { send('pause'); setMenuOpen(false); }} className="pad-secondary mt-5 w-full"><Pause size={16} /> {t('arcadePad.pause')}</button><button onClick={() => setConfirmExit(true)} className="pad-secondary mt-2 w-full"><Home size={16} /> {t('remote.games')}</button></>}<button onClick={() => padClient.disconnect()} className="pad-secondary mt-2 w-full text-red-300"><LogOut size={16} /> {t('controller.disconnect')}</button>{confirmExit && <div className="os-exit-confirm" role="alert"><h3>{t('arcadePad.endRound')}</h3><p>{t('arcadePad.exitInfo')}</p><button className="os-secondary" onClick={() => { send('home'); setMenuOpen(false); setConfirmExit(false); }}>{t('arcadePad.yesLibrary')}</button><button className="os-secondary" onClick={() => setConfirmExit(false)}>{t('arcadePad.stay')}</button></div>}</Sheet>}
    {deviceSettings && <Sheet title={t('controller.title')} onClose={() => setDeviceSettings(false)}><NickEditor st={st} compact /><DeviceFeatures wakeLockEnabled={wakeLockEnabled} onWakeLockChange={onWakeLockChange} wakeLockStatus={wakeLockStatus} fullscreenStatus={fullscreenStatus} onFullscreen={fullscreen} tiltEnabled={tiltEnabled} onTiltChange={onTiltChange} tiltStatus={tiltStatus} /></Sheet>}
  </div>;
}

export function JoypadController({ st, ...features }: { st: PadClientState } & ControllerFeatures) {
  return st.screen === 'game' && st.game !== 'tanks' && st.game !== null ? <ArcadeController st={st} {...features} /> : <RemoteController st={st} {...features} />;
}
