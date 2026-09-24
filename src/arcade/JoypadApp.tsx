import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Activity, ArrowLeft, ArrowRight, Check, Copy, Gamepad2, Gauge, LoaderCircle, Monitor, Moon, PanelsTopLeft, Power, Radio, RefreshCw, Smartphone, Sparkles, Wifi, Zap } from 'lucide-react';
const TankApp = lazy(() => import('../App'));
import { PLAYER_DEFS } from '../game/types';
import { padHost } from '../net/padHost';
import { padUrlFor, type RemoteCommand, type RemoteEvent } from '../net/protocol';
import { usePadHost } from '../pad/PadHostPanel';
import { GAMES, gameInfo, type GameId } from './catalog';
import { ArcadeGameView } from './ArcadeGameView';

function RoomCard() {
  const state = usePadHost();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const usable = state.status === 'ready' || state.relay === 'online';
  const url = state.code ? padUrlFor(state.code) : '';

  useEffect(() => {
    let live = true;
    if (!url) return;
    QRCode.toDataURL(url, { width: 300, margin: 1, color: { dark: '#17120d', light: '#ffffff' } })
      .then(result => { if (live) setQr(result); }).catch(() => { if (live) setQr(''); });
    return () => { live = false; };
  }, [url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard may be unavailable */ }
  };

  return (
    <section className="joy-room rounded-[26px] p-5 sm:p-6" aria-label="Pokój na telefony">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="joy-kicker flex items-center gap-2 text-orange-300"><Radio size={14} /> SESJA GŁÓWNA</div>
          <h2 className="mt-2 text-xl font-bold text-white">Telefony jako pady</h2>
        </div>
        <span className={`joy-status ${usable ? 'joy-status-live' : ''}`}><span />{usable ? 'NA ŻYWO' : 'ŁĄCZENIE'}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">Zeskanuj kod na telefonie. Pierwszy podłączony gracz prowadzi wybór gry i ustawienia.</p>

      <div className="mt-5 flex flex-col items-center rounded-2xl border border-white/10 bg-[#0b0d0e] p-4">
        <div className="flex h-[174px] w-[174px] items-center justify-center rounded-2xl bg-white p-2 shadow-[0_0_36px_rgba(249,115,22,.12)]">
          {qr ? <img src={qr} alt="Kod QR do podłączenia telefonu" className="h-full w-full" /> : <LoaderCircle className="h-8 w-8 animate-spin text-orange-500" />}
        </div>
        <div className="joy-kicker mt-4 text-slate-500">KOD POKOJU</div>
        <div className="mt-1 font-mono2 text-[28px] font-extrabold tracking-[.24em] text-white">{state.code || '·····'}</div>
        <button onClick={copy} disabled={!url} className="mt-2 flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-orange-400/40 hover:bg-orange-500/10 disabled:opacity-50">
          {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />} {copied ? 'Link skopiowany' : 'Kopiuj link do pada'}
        </button>
        {!usable && <p className="mt-2 text-center text-[11px] text-amber-300">Zaczekaj na status „Na żywo” przed połączeniem pada.</p>}
      </div>

      <div className="mt-5 flex items-center justify-between"><div className="joy-kicker text-slate-400">GRACZE W POKOJU</div><span className="text-xs text-slate-500">{state.pads.length}/4</span></div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {PLAYER_DEFS.map((player, index) => {
          const pad = state.pads.find(p => p.slot === index);
          const admin = pad && state.pads.reduce((first, p) => p.connectedAt < first.connectedAt ? p : first, state.pads[0]).connId === pad.connId;
          return (
            <div key={index} className={`min-w-0 rounded-xl border p-2.5 ${pad ? 'border-white/15 bg-white/[.07]' : 'border-white/[.06] bg-white/[.025]'}`}>
              <div className="flex items-center gap-2">
                <span className="h-7 w-7 shrink-0 rounded-lg text-center text-sm font-bold leading-7" style={{ color: player.color, background: `${player.color}22` }}>{index + 1}</span>
                <div className="min-w-0"><div className="truncate text-xs font-semibold text-white">{pad?.nick || 'Wolne miejsce'}</div><div className="text-[10px] text-slate-500">{admin ? '★ Administrator' : pad ? pad.via === 'relay' ? 'Połączono • relay' : 'Połączono • P2P' : `Gracz ${index + 1}`}</div></div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 border-t border-white/10 pt-3 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><Wifi size={13} className={usable ? 'text-emerald-400' : 'text-amber-400'} />{state.relay === 'online' ? 'P2P + zapasowy przekaźnik' : state.signal === 'online' ? 'P2P aktywne' : 'Trwa łączenie…'}</span>
        <button onClick={() => state.status === 'idle' ? padHost.start() : padHost.restart()} title="Odśwież pokój (zmieni połączenie wszystkim)" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/10 hover:text-white"><RefreshCw size={15} /></button>
      </div>
      {state.error && <p className="mt-2 text-xs text-amber-300">{state.error}</p>}
      {state.note && <p className="mt-2 text-xs text-sky-300">{state.note}</p>}
    </section>
  );
}

interface GameErrorBoundaryProps { children: ReactNode; onExit: () => void }
interface GameErrorBoundaryState { error: Error | null }

/** Awaria pojedynczej gry nie może wywrócić całej biblioteki ani sesji padów. */
class GameErrorBoundary extends Component<GameErrorBoundaryProps, GameErrorBoundaryState> {
  state: GameErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): GameErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Błąd gry arcade:', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0c0d] px-6 text-center text-white">
        <div className="joy-kicker text-red-300">GRA ZATRZYMANA</div>
        <h1 className="joy-heading mt-3 text-3xl font-bold">Coś poszło nie tak</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">Sesja telefonów nadal działa. Wróć do biblioteki i uruchom tę grę ponownie albo wybierz inny tytuł.</p>
        <button type="button" onClick={this.props.onExit} className="mt-6 rounded-xl bg-orange-500 px-6 py-3 text-sm font-black text-[#17120d] hover:bg-orange-400">WRÓĆ DO BIBLIOTEKI</button>
      </div>
    );
  }
}

export default function JoypadApp() {
  const [selected, setSelected] = useState<GameId | null>(null);
  // Startujemy od najbardziej demonstracyjnego świata 3D, żeby nowy renderer był widoczny od razu.
  const [focus, setFocus] = useState(() => Math.max(0, GAMES.findIndex(game => game.id === 'league')));
  const [remote, setRemote] = useState<RemoteEvent | null>(null);
  const serial = useRef(0);
  const selectedRef = useRef<GameId | null>(null);
  const focusRef = useRef(0);
  selectedRef.current = selected;
  focusRef.current = focus;
  const state = usePadHost();

  const open = useCallback((id: GameId) => {
    setRemote(null);
    selectedRef.current = id;
    padHost.setGame(id);
    padHost.setScreen('menu');
    setSelected(id);
  }, []);
  const exit = useCallback(() => {
    setRemote(null);
    selectedRef.current = null;
    padHost.setGame(null);
    padHost.setMenuOptions(undefined);
    padHost.setScreen('lobby');
    setSelected(null);
  }, []);

  useEffect(() => {
    padHost.setSlotMeta(PLAYER_DEFS.map(p => ({ name: p.name, color: p.color, darkColor: p.darkColor })));
    padHost.setGame(null);
    padHost.setScreen('lobby');
    if (padHost.status === 'idle') padHost.start();
  }, []);

  useEffect(() => { padHost.setSelection(focus); }, [focus]);

  useEffect(() => {
    const handle = (command: RemoteCommand) => {
      if (selectedRef.current) { setRemote({ id: ++serial.current, command }); return; }
      if (command === 'left' || command === 'up') setFocus(i => (i + GAMES.length - 1) % GAMES.length);
      if (command === 'right' || command === 'down') setFocus(i => (i + 1) % GAMES.length);
      if (command === 'select') open(GAMES[focusRef.current].id);
    };
    padHost.onAdminCommand = handle;
    padHost.onGameChoice = (index) => {
      if (selectedRef.current || !GAMES[index]) return;
      setFocus(index); open(GAMES[index].id);
    };
    const key = (e: KeyboardEvent) => {
      if (selectedRef.current || e.target instanceof HTMLInputElement) return;
      const map: Record<string, RemoteCommand> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'select' };
      if (map[e.code]) { e.preventDefault(); handle(map[e.code]); }
    };
    window.addEventListener('keydown', key);
    return () => { padHost.onAdminCommand = null; padHost.onGameChoice = null; window.removeEventListener('keydown', key); };
  }, [open]);

  if (selected) return (
    <GameErrorBoundary key={selected} onExit={exit}>
      {selected === 'tanks'
        ? <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0a0c0d] text-orange-300">Ładowanie Stalowego Frontu…</div>}><TankApp onExit={exit} remote={remote} /></Suspense>
        : <ArcadeGameView key={selected} id={selected} onExit={exit} remote={remote} />}
    </GameErrorBoundary>
  );

  const featured = GAMES[focus];
  return (
    <div className="joy-shell relative min-h-screen overflow-hidden text-white">
      <div className="joy-ambient pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-[1480px] px-4 pb-16 sm:px-7 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 py-5">
          <div className="flex items-center gap-3">
            <div className="joy-logo flex h-11 w-11 items-center justify-center rounded-2xl"><Gamepad2 size={24} strokeWidth={2.5} /></div>
            <div><div className="joy-brand text-[27px] font-extrabold leading-none tracking-[-.06em]">Joy<span className="text-orange-400">Pad</span><span className="text-orange-400">.</span></div><div className="joy-kicker mt-1 text-[9px] text-slate-500">LOCAL PLAY SYSTEM / ROOM-READY</div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="joy-system-status hidden items-center gap-2 md:flex"><Activity size={14} /> SYSTEM READY · {GAMES.length} WORLDS</span>
            <a href="#pad" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[.05] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-orange-400/50 hover:bg-orange-500/10"><Smartphone size={15} /> Otwórz pada</a>
            <span className="joy-room-code rounded-full px-4 py-2 font-mono2 text-xs font-bold tracking-widest">{state.code || '·····'}</span>
          </div>
        </header>

        <section className="joy-intro mb-7 mt-10 flex flex-wrap items-end justify-between gap-6">
          <div><div className="joy-kicker flex items-center gap-2 text-orange-300"><Sparkles size={13} /> SALON GIER / TRYB KANAPOWY</div>
            <h1 className="joy-heading mt-3 max-w-[850px] text-4xl font-bold leading-[1.02] tracking-[-.055em] sm:text-5xl lg:text-[68px]">Graj po swojemu.<br /><span className="joy-gradient-text">Wspólny ekran.</span></h1>
            <p className="mt-4 max-w-[650px] text-sm leading-relaxed text-slate-400 sm:text-base">Siedem dopracowanych światów, szybki start i telefony, które zamieniają się w pady. Ciemny interfejs, pomarańczowy sygnał akcji i animacje, które nie walczą z grą o uwagę.</p>
          </div>
          <div className="joy-status-stack grid grid-cols-3 gap-2"><div><b>{String(GAMES.length).padStart(2, '0')}</b><span>ŚWIATÓW</span></div><div><b>60</b><span>FPS CAP</span></div><div><b>04</b><span>PADY</span></div></div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0">
            <div className="joy-feature relative flex min-h-[410px] flex-col justify-end overflow-hidden rounded-[28px] border border-white/10 p-6 sm:min-h-[460px] sm:p-9" style={{ '--game-accent': featured.accent } as React.CSSProperties}>
              <img key={featured.cover} src={`${import.meta.env.BASE_URL}${featured.cover}`} alt="" className="joy-feature-image absolute inset-0 h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 joy-feature-shade" />
              <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: `radial-gradient(ellipse at 76% 90%, ${featured.accent}24, transparent 48%)` }} />
              <div className="relative z-10 max-w-[640px]">
                <div className="joy-kicker flex items-center gap-2" style={{ color: featured.accent }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: featured.accent }} /> WYBRANA GRA / {featured.eyebrow}</div>
                <h2 className="joy-heading mt-3 text-[42px] font-extrabold leading-[.97] tracking-[-.055em] sm:text-[68px]">{featured.title}</h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-200 sm:text-base">{featured.description}</p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button onClick={() => open(featured.id)} className="joy-play flex items-center gap-3 rounded-xl px-6 py-3.5 text-sm font-extrabold text-[#16110c] transition hover:-translate-y-0.5 hover:brightness-110" style={{ background: featured.accent, boxShadow: `0 12px 35px ${featured.accent}33` }}>Otwórz grę <ArrowRight size={18} /></button>
                  <span className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-xs font-medium text-slate-200 backdrop-blur">{featured.genre} · {featured.players}</span>
                </div>
              </div>
              <span className="joy-feature-number pointer-events-none absolute right-5 top-3 text-[100px] font-black leading-none text-white/[.06] sm:right-8 sm:text-[160px]">{featured.number}</span>
            </div>

            <div className="mt-7 flex items-end justify-between gap-2"><div><div className="joy-kicker text-orange-300">BIBLIOTEKA / {String(GAMES.length).padStart(2, '0')} POZYCJI</div><h3 className="joy-heading mt-1 text-2xl font-bold">Wybierz swój świat</h3></div><div className="flex gap-2"><button onClick={() => setFocus(i => (i + GAMES.length - 1) % GAMES.length)} aria-label="Poprzednia gra" className="joy-arrow"><ArrowLeft size={17} /></button><button onClick={() => setFocus(i => (i + 1) % GAMES.length)} aria-label="Następna gra" className="joy-arrow"><ArrowRight size={17} /></button></div></div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {GAMES.map((game, i) => (
                <button key={game.id} onClick={() => { setFocus(i); open(game.id); }} aria-label={`Otwórz ${game.title}`} aria-current={i === focus ? 'true' : undefined} className={`joy-game-card group min-w-0 overflow-hidden rounded-2xl border text-left transition duration-200 hover:-translate-y-1 ${i === focus ? 'joy-game-card-active' : 'border-white/10 bg-white/[.035] hover:border-white/25'}`}>
                  <div className="relative h-28 overflow-hidden sm:h-32"><img src={`${import.meta.env.BASE_URL}${game.cover}`} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-110" /><div className="absolute inset-0 bg-gradient-to-t from-[#111313] to-transparent" /><span className="joy-kicker absolute left-3 top-3 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-[9px] text-white">{game.number} / {game.renderTag}</span></div>
                  <div className="px-3 pb-4 pt-2"><div className="joy-heading truncate text-sm font-bold text-white sm:text-[15px]">{game.title}</div><div className="mt-1 truncate text-[11px] text-slate-400">{game.teaser}</div><div className="mt-3 h-[2px] w-8 rounded-full" style={{ background: game.accent }} /></div>
                </button>
              ))}
            </div>
            <div className="joy-performance-note mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500"><span className="flex items-center gap-1.5"><Gauge size={14} className="text-orange-300" /> Profil sprzętu w każdej grze</span><span className="flex items-center gap-1.5"><PanelsTopLeft size={14} className="text-orange-300" /> Tryb shared / split-screen</span><span className="flex items-center gap-1.5"><Monitor size={14} className="text-orange-300" /> TV, laptop albo monitor</span><span className="ml-auto">Menu: <kbd>←</kbd> <kbd>→</kbd> <kbd>Enter</kbd></span></div>
          </main>
          <aside className="min-w-0"><RoomCard /><div className="joy-howto mt-4 rounded-2xl p-4 text-xs leading-relaxed text-slate-400"><div className="mb-2 flex items-center gap-2 font-bold text-slate-200"><Zap size={15} className="text-orange-300" /> Jak zacząć?</div><b className="text-slate-200">01</b> Otwórz stronę na komputerze lub TV. <b className="text-slate-200">02</b> Zeskanuj QR telefonami. <b className="text-slate-200">03</b> Administrator wybiera grę — reszta dołącza automatycznie.</div></aside>
        </div>
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-500"><span className="joy-brand text-base font-bold text-slate-400">Joy<span className="text-orange-400">Pad.</span></span><span>Jedna strona · jeden ekran · wspólna zabawa</span><span className="flex items-center gap-1.5"><Moon size={12} /> DARK CONSOLE THEME <Power size={12} /></span></footer>
      </div>
    </div>
  );
}

export { gameInfo };
