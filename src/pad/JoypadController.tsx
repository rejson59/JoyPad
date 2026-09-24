import { useCallback, useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Check, ChevronLeft, CircleHelp, Crown, Gamepad2, Home, LogOut, Maximize2, Menu, Pause, Play, RotateCcw, Signal, Smartphone, Trophy, X } from 'lucide-react';
import { GAMES, gameInfo } from '../arcade/catalog';
import { padClient, type PadClientState } from '../net/padClient';
import type { RemoteCommand } from '../net/protocol';
import { Joystick } from './Joystick';

function vibrate(n = 14) { try { navigator.vibrate?.(n); } catch { /* optional */ } }
function send(command: RemoteCommand) { vibrate(); padClient.sendCommand(command); }

function Roster({ st }: { st: PadClientState }) {
  return <div className="grid grid-cols-2 gap-2">{Array.from({ length: 4 }, (_, slot) => {
    const player = st.roster.find(p => p.slot === slot);
    const colors = ['#4ade80', '#38bdf8', '#fb923c', '#c084fc'];
    return <div key={slot} className={`flex min-w-0 items-center gap-2 rounded-xl border p-2.5 ${player ? 'border-white/15 bg-white/[.07]' : 'border-white/[.06] bg-white/[.02]'}`}><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold" style={{ color: colors[slot], background: `${colors[slot]}22` }}>{slot + 1}</span><div className="min-w-0"><div className="truncate text-xs font-bold text-white">{player?.nick ?? 'Wolne'}</div><div className="text-[10px] text-slate-400">{player ? st.adminSlot === slot ? '★ Admin' : 'Połączono' : 'Czeka na pada'}</div></div></div>;
  })}</div>;
}

function RemoteController({ st, fullscreen }: { st: PadClientState; fullscreen: () => void }) {
  const admin = st.slot === st.adminSlot;
  const selected = GAMES[st.selection] ?? GAMES[0];
  const game = st.game ? gameInfo(st.game) : null;
  const accent = game?.accent || '#a78bfa';
  const label = st.screen === 'lobby' ? 'WYBÓR GIER' : st.screen === 'over' ? 'KONIEC RUNDY' : st.screen === 'setup' ? 'USTAWIENIA' : 'MENU GRY';
  const onSelect = () => send('select');
  return <div className="pad-joy min-h-[100dvh] overflow-y-auto text-white" style={{ '--game-accent': accent } as React.CSSProperties}>
    <div className="pointer-events-none fixed inset-0 opacity-20" style={{ background: `radial-gradient(ellipse at 50% 0%, ${accent}, transparent 60%)` }} />
    <div className="relative mx-auto flex min-h-[100dvh] max-w-[530px] flex-col px-4 pb-8" style={{ paddingTop: 'max(16px, env(safe-area-inset-top))' }}>
      <header className="flex items-center justify-between gap-2"><div className="flex items-center gap-2"><span className="joy-logo flex h-9 w-9 items-center justify-center rounded-xl"><Gamepad2 size={20} /></span><div><div className="joy-brand text-xl font-extrabold leading-none">Joy<span className="text-violet-400">Pad.</span></div><div className="joy-kicker mt-1 text-[8px] text-slate-500">PILOT / {st.code}</div></div></div><div className="flex items-center gap-1"><button onClick={fullscreen} title="Pełny ekran" className="pad-icon"><Maximize2 size={17} /></button><button onClick={() => padClient.disconnect()} title="Odłącz telefon" className="pad-icon text-red-300"><LogOut size={17} /></button></div></header>
      <div className="mt-6 flex items-center justify-between gap-2"><span className="joy-kicker" style={{ color: accent }}>● {label}</span><span className={`rounded-full border px-3 py-1 text-[10px] font-bold ${admin ? 'border-amber-400/40 bg-amber-400/10 text-amber-200' : 'border-white/15 bg-white/5 text-slate-300'}`}>{admin ? <span className="flex items-center gap-1"><Crown size={12} /> ADMINISTRATOR</span> : `GRACZ ${st.slot + 1}`}</span></div>

      {st.screen === 'lobby' ? <>
        <h1 className="joy-heading mt-3 text-[34px] font-extrabold leading-tight">Wybierzmy <span className="joy-gradient-text">grę.</span></h1>
        <p className="mt-2 text-sm text-slate-400">{admin ? 'Ty prowadzisz! Wybierz tytuł na pilocie albo przełączaj strzałkami.' : 'Poczekaj, aż administrator wybierze grę. Połączenie jest aktywne — zagrasz w następnej rundzie.'}</p>
        <div className="mt-5 grid gap-2">{GAMES.map((entry, i) => <button key={entry.id} disabled={!admin} onClick={() => { vibrate(); padClient.chooseGame(i); }} className={`flex items-center gap-3 overflow-hidden rounded-2xl border p-2 text-left transition disabled:cursor-default ${i === st.selection ? 'border-violet-400/70 bg-violet-500/15' : 'border-white/10 bg-white/[.035]'}`}><img src={`${import.meta.env.BASE_URL}${entry.cover}`} alt="" className="h-[52px] w-[68px] shrink-0 rounded-lg object-cover" /><span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{entry.title}</span><span className="block truncate text-[11px] text-slate-400">{entry.genre} · {entry.teaser}</span></span>{i === st.selection && <Check size={17} className="mr-2 shrink-0 text-violet-300" />}</button>)}</div>
        {admin && <div className="mt-4 flex items-center gap-2"><button onClick={() => send('left')} aria-label="Poprzednia gra" className="pad-nav"><ChevronLeft size={23} /></button><button onClick={onSelect} className="pad-primary flex-1" style={{ background: accent }}>OTWÓRZ {selected.title.toUpperCase()}</button><button onClick={() => send('right')} aria-label="Następna gra" className="pad-nav"><ArrowRight size={20} /></button></div>}
      </> : <>
        <div className="relative mt-4 overflow-hidden rounded-[22px] border border-white/15 bg-white/[.035]"><img src={`${import.meta.env.BASE_URL}${game?.cover ?? GAMES[0].cover}`} alt="" className="h-36 w-full object-cover opacity-75" /><div className="absolute inset-0 bg-gradient-to-t from-[#101126] to-transparent" /><div className="absolute bottom-3 left-4"><div className="joy-kicker" style={{ color: accent }}>{game?.eyebrow}</div><h1 className="joy-heading mt-1 text-2xl font-extrabold">{game?.title || 'JoyPad'}</h1></div></div>
        {st.screen === 'over' ? <div className="mt-4 rounded-2xl border border-white/15 bg-white/[.05] p-5 text-center"><Trophy className="mx-auto mb-2 h-8 w-8 text-amber-300" /><div className="text-lg font-bold" style={{ color: st.result?.youWon ? accent : '#f1f5f9' }}>{st.result?.youWon ? 'Wygrana!' : st.result?.winnerName || 'Koniec rundy'}</div><p className="mt-1 text-xs text-slate-400">{admin ? 'Możesz uruchomić rewanż albo wybrać inną grę.' : 'Administrator decyduje o kolejnej rundzie.'}</p></div> : <p className="mt-4 text-sm leading-relaxed text-slate-300">{admin ? 'Ustaw rundę i rozpocznij grę. Pozostali gracze dołączają automatycznie.' : 'Gra jest przygotowywana. Poczekaj na start od administratora.'}</p>}
        {st.options && st.screen !== 'over' && <div className="mt-4 grid grid-cols-2 gap-2">{[[st.options.primaryLabel, st.options.primaryValue, '← / →'], [st.options.secondaryLabel, st.options.secondaryValue, '↑ / ↓']].map(([title, value, help]) => <div key={title} className="rounded-xl border border-white/10 bg-white/[.04] p-3"><div className="joy-kicker text-[9px] text-slate-400">{title}</div><div className="mt-2 text-xs font-bold" style={{ color: accent }}>{value}</div><div className="mt-2 text-[10px] text-slate-500">{help}</div></div>)}</div>}
        {admin && <>
          {st.screen !== 'over' && <div className="mt-4 flex items-center justify-center gap-2"><div className="grid w-[204px] grid-cols-3 gap-1.5"><div /><button onClick={() => send('up')} aria-label="Opcja w górę" className="pad-nav"><ArrowUp size={20} /></button><div /><button onClick={() => send('left')} aria-label="Opcja w lewo" className="pad-nav"><ArrowLeft size={20} /></button><div className="flex items-center justify-center text-[10px] text-slate-500"><CircleHelp size={15} /></div><button onClick={() => send('right')} aria-label="Opcja w prawo" className="pad-nav"><ArrowRight size={20} /></button><div /><button onClick={() => send('down')} aria-label="Opcja w dół" className="pad-nav"><ArrowDown size={20} /></button><div /></div></div>}
          <button onClick={onSelect} className="pad-primary mt-4 w-full" style={{ background: accent }}>{st.screen === 'over' ? <><RotateCcw size={17} /> REWANŻ</> : <><Play size={17} fill="currentColor" /> {st.game === 'tanks' && st.screen === 'menu' ? 'WYBIERZ TRYB' : 'ROZPOCZNIJ GRĘ'}</>}</button>
          <div className="mt-2 grid grid-cols-2 gap-2"><button onClick={() => send('back')} className="pad-secondary"><ArrowLeft size={14} /> WSTECZ</button><button onClick={() => send('home')} className="pad-secondary"><Home size={14} /> WSZYSTKIE GRY</button></div>
        </>}
      </>}
      <div className="mt-auto pt-7"><div className="mb-3 flex items-center justify-between"><span className="joy-kicker text-slate-400">POŁĄCZENI / {st.roster.length} Z 4</span><span className="flex items-center gap-1 text-[10px] text-slate-500"><Signal size={12} /> {st.latency} ms</span></div><Roster st={st} /><div className="mt-4 flex items-center justify-center gap-1 text-[10px] text-slate-500"><Smartphone size={12} /> {st.viaRelay ? 'Połączenie przez przekaźnik' : 'Połączenie bezpośrednie P2P'}</div></div>
    </div>
  </div>;
}

function ArcadeController({ st, fullscreen }: { st: PadClientState; fullscreen: () => void }) {
  const info = st.game ? gameInfo(st.game) : GAMES[0];
  const [menuOpen, setMenuOpen] = useState(false);
  const auto = useRef(false), button = useRef(false);
  const isOrbit = st.game === 'orbit';
  const admin = st.slot === st.adminSlot;
  const size = Math.min(200, Math.max(135, Math.floor(Math.min(window.innerWidth * (isOrbit ? .32 : .36), window.innerHeight * .46))));
  const actionSize = Math.min(170, Math.max(100, Math.floor(window.innerHeight * (isOrbit ? .22 : .31))), Math.floor(window.innerWidth * .42) - 8);

  const syncFire = useCallback(() => padClient.setInput({ fire: auto.current || button.current }), []);
  const setButton = (pressed: boolean) => { button.current = pressed; if (pressed) vibrate(10); syncFire(); };
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
      <div className="flex shrink-0 items-center gap-1"><span className="mr-1 hidden text-[10px] text-slate-400 sm:block">{st.latency} ms</span><button className="pad-icon" onClick={fullscreen} title="Pełny ekran"><Maximize2 size={16} /></button>{admin && <button className="pad-icon" onClick={() => send('pause')} title="Pauza"><Pause size={16} /></button>}<button className="pad-icon" onClick={() => setMenuOpen(v => !v)} title="Menu"><Menu size={17} /></button></div>
    </header>
    {st.arcadeHud ? <div className="pointer-events-none absolute left-1/2 top-[60px] z-10 w-[min(92%,400px)] -translate-x-1/2 rounded-xl border border-white/15 bg-black/60 px-4 py-2 backdrop-blur-sm" style={{ marginTop: 'env(safe-area-inset-top)' }}><div className="flex items-center justify-between gap-2 text-[11px] font-bold"><span className="truncate" style={{ color: info.accent }}>{st.arcadeHud.title}</span><span className="shrink-0 font-mono2">{Math.floor(st.arcadeHud.timeLeft / 60)}:{String(Math.floor(st.arcadeHud.timeLeft % 60)).padStart(2, '0')}</span></div><div className="mt-1 flex items-center justify-between text-xs text-slate-200"><span>{st.arcadeHud.detail}</span><b className="font-mono2" style={{ color: info.accent }}>{st.arcadeHud.score} PKT</b></div>{st.arcadeHud.value !== undefined && <div className="mt-1.5 h-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, st.arcadeHud.value / (st.arcadeHud.maxValue || 100) * 100))}%`, background: info.accent }} /></div>}</div>
      : <div className="pointer-events-none absolute inset-x-0 top-1/3 z-10 px-8 text-center text-sm font-bold text-amber-200">Runda trwa. Dołączysz od następnej rozgrywki.</div>}
    {isOrbit ? <>
      <Joystick side="left" size={size} color={st.color} onChange={drive} zoneWidthPct={50} bottomPadding={78} label="LOT" caption="STEROWANIE STATKIEM" />
      <Joystick side="right" size={size} color="#7dd3fc" onChange={aim} zoneWidthPct={50} bottomPadding={78} label="CEL" caption="CELOWANIE · DO KOŃCA = OGIEŃ" hotRing={.8} onHotChange={hot} sideSlot={<button {...handlers} className="flex items-center justify-center rounded-full border-4 border-sky-300/40 text-xs font-black tracking-widest text-white active:scale-95" style={{ width: actionSize * .65, height: actionSize * .65, background: 'radial-gradient(circle at 35% 28%,#7dd3fc,#1454b2 65%,#0b2767)', boxShadow: '0 7px 0 #061745, 0 0 28px #7dd3fc66', touchAction: 'none' }}>OGIEŃ</button>} />
    </> : <><Joystick side="left" size={size} color={st.color} onChange={drive} zoneWidthPct={56} bottomPadding={78} label="RUCH" caption={st.game === 'snake' ? 'SKRĘCAJ · UNIKAJ ŚCIAN' : st.game === 'race' ? 'KIERUNEK JAZDY' : 'PORUSZANIE POSTACIĄ'} /><div className="absolute bottom-0 right-3 z-20 flex w-[42%] flex-col items-center justify-end gap-2" style={{ paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}><button {...handlers} className="flex items-center justify-center rounded-full border-4 border-white/30 text-xs font-black tracking-widest text-[#081020] active:scale-95 sm:text-base" style={{ width: actionSize, height: actionSize, background: `radial-gradient(circle at 35% 25%,#fff,${info.accent} 55%,${info.accentSoft})`, boxShadow: `0 9px 0 ${info.accentSoft}, 0 14px 28px #0009, 0 0 28px ${info.accent}66`, touchAction: 'none' }}>{st.game === 'race' ? 'TURBO' : st.game === 'snake' ? 'SPRINT' : 'AKCJA'}</button><span className="text-[9px] font-bold tracking-wider text-slate-400">{st.game === 'temple' ? 'PRZY SKRZYNI = OTWÓRZ' : 'PRZYTRZYMAJ'}</span></div></>}
    {menuOpen && <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/75 p-5 backdrop-blur" onClick={() => setMenuOpen(false)}><div className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#141a2b] p-5" onClick={e => e.stopPropagation()}><div className="flex items-center justify-between"><div className="text-base font-bold">Menu pada</div><button onClick={() => setMenuOpen(false)} className="pad-icon"><X size={17} /></button></div><p className="mt-2 text-xs text-slate-400">{admin ? 'Jako administrator możesz zatrzymać grę lub wrócić do biblioteki.' : 'Administrator zarządza rundą. Możesz rozłączyć ten telefon.'}</p>{admin && <><button onClick={() => { send('pause'); setMenuOpen(false); }} className="pad-secondary mt-5 w-full"><Pause size={16} /> PAUZA / WZNÓW</button><button onClick={() => { if (window.confirm('Zakończyć rundę i wrócić do JoyPad?')) send('home'); }} className="pad-secondary mt-2 w-full"><Home size={16} /> WSZYSTKIE GRY</button></>}<button onClick={() => padClient.disconnect()} className="pad-secondary mt-2 w-full text-red-300"><LogOut size={16} /> ODŁĄCZ TELEFON</button></div></div>}
  </div>;
}

export function JoypadController({ st, fullscreen }: { st: PadClientState; fullscreen: () => void }) {
  return st.screen === 'game' && st.game !== 'tanks' && st.game !== null ? <ArcadeController st={st} fullscreen={fullscreen} /> : <RemoteController st={st} fullscreen={fullscreen} />;
}
