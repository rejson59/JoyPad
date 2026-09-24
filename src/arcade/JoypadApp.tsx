import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { ArrowLeft, ArrowRight, Check, Copy, Gamepad2, LoaderCircle, Power, Radio, RefreshCw, Smartphone, Sparkles, Volume2, Wifi, Zap } from 'lucide-react';
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
    QRCode.toDataURL(url, { width: 300, margin: 1, color: { dark: '#101126', light: '#ffffff' } })
      .then(result => { if (live) setQr(result); }).catch(() => { if (live) setQr(''); });
    return () => { live = false; };
  }, [url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard may be unavailable */ }
  };

  return (
    <section className="joy-room rounded-[28px] p-5 sm:p-6" aria-label="Pokój na telefony">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="joy-kicker flex items-center gap-2 text-violet-300"><Radio size={14} /> TWOJA SESJA</div>
          <h2 className="mt-2 text-xl font-bold text-white">Telefony jako pady</h2>
        </div>
        <span className={`joy-status ${usable ? 'joy-status-live' : ''}`}><span />{usable ? 'NA ŻYWO' : 'ŁĄCZENIE'}</span>
      </div>
      <p className="mt-2 text-sm leading-relaxed text-slate-400">Zeskanuj kod na telefonie. Pierwsza osoba zostanie administratorem i wybierze grę.</p>

      <div className="mt-5 flex flex-col items-center rounded-2xl border border-white/10 bg-white/[0.035] p-4">
        <div className="flex h-[174px] w-[174px] items-center justify-center rounded-2xl bg-white p-2 shadow-[0_0_40px_rgba(139,92,246,.16)]">
          {qr ? <img src={qr} alt="Kod QR do podłączenia telefonu" className="h-full w-full" /> :
            <LoaderCircle className="h-8 w-8 animate-spin text-violet-600" />}
        </div>
        <div className="joy-kicker mt-4 text-slate-500">KOD POKOJU</div>
        <div className="mt-1 font-mono2 text-[28px] font-extrabold tracking-[.24em] text-white">{state.code || '·····'}</div>
        <button onClick={copy} disabled={!url} className="mt-2 flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:bg-white/10 disabled:opacity-50">
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
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0b] px-6 text-center text-white">
        <div className="joy-kicker text-red-300">GRA ZATRZYMANA</div>
        <h1 className="joy-heading mt-3 text-3xl font-bold">Coś poszło nie tak</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">Sesja telefonów nadal działa. Wróć do biblioteki i uruchom tę grę ponownie albo wybierz inny tytuł.</p>
        <button type="button" onClick={this.props.onExit} className="mt-6 rounded-xl bg-violet-500 px-6 py-3 text-sm font-black text-white hover:bg-violet-400">WRÓĆ DO BIBLIOTEKI</button>
      </div>
    );
  }
}

export default function JoypadApp() {
  const [selected, setSelected] = useState<GameId | null>(null);
  const [focus, setFocus] = useState(0);
  const [remote, setRemote] = useState<RemoteEvent | null>(null);
  const serial = useRef(0);
  const selectedRef = useRef<GameId | null>(null);
  const focusRef = useRef(0);
  selectedRef.current = selected;
  focusRef.current = focus;
  const state = usePadHost();

  const open = useCallback((id: GameId) => {
    // Polecenia z pilota są zdarzeniami jednorazowymi. Po powrocie do biblioteki
    // nie mogą zostać wykonane ponownie przy montowaniu kolejnego ekranu gry
    // (np. stare „WSTECZ” natychmiast zamykałoby właśnie otwarte menu).
    setRemote(null);
    selectedRef.current = id;
    padHost.setGame(id);
    padHost.setScreen('menu');
    setSelected(id);
  }, []);
  const exit = useCallback(() => {
    // Nie przenoś ostatniej komendy do następnej gry. Dzieci mają własny licznik
    // zdarzeń, więc po remoncie mogłyby potraktować ją jako nową komendę.
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
    // Połączenie pozostaje aktywne podczas przechodzenia pomiędzy grami.
  }, []);

  useEffect(() => { padHost.setSelection(focus); }, [focus]);

  useEffect(() => {
    const handle = (command: RemoteCommand) => {
      if (selectedRef.current) {
        setRemote({ id: ++serial.current, command });
        return;
      }
      if (command === 'left' || command === 'up') setFocus(i => (i + GAMES.length - 1) % GAMES.length);
      if (command === 'right' || command === 'down') setFocus(i => (i + 1) % GAMES.length);
      if (command === 'select') open(GAMES[focusRef.current].id);
    };
    padHost.onAdminCommand = handle;
    padHost.onGameChoice = (index) => {
      // Spóźniony pakiet z ekranu biblioteki nie może przełączyć gry już
      // działającej. To również chroni powrót do biblioteki przed wyścigiem
      // pomiędzy zmianą ekranu a ostatnim kliknięciem na telefonie.
      if (selectedRef.current || !GAMES[index]) return;
      setFocus(index);
      open(GAMES[index].id);
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
        ? <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0a0a0b] text-amber-300">Ładowanie Stalowego Frontu…</div>}><TankApp onExit={exit} remote={remote} /></Suspense>
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
            <div><div className="joy-brand text-[27px] font-extrabold leading-none tracking-[-.06em]">Joy<span className="text-violet-400">Pad</span><span className="text-violet-400">.</span></div><div className="joy-kicker mt-1 text-[9px] text-slate-500">GRAJCIE RAZEM, NA JEDNYM EKRANIE</div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-2 text-xs font-medium text-slate-400 md:flex"><Volume2 size={15} /> 5 gier · 1 wspólny ekran</span>
            <a href="#pad" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 rounded-full border border-white/15 bg-white/[.05] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-violet-400/50 hover:bg-violet-500/10"><Smartphone size={15} /> Otwórz pada</a>
            <span className="rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-2 font-mono2 text-xs font-bold tracking-widest text-violet-200">{state.code || '·····'}</span>
          </div>
        </header>

        <div className="mb-7 mt-10 flex flex-wrap items-end justify-between gap-4">
          <div><div className="joy-kicker flex items-center gap-2 text-violet-300"><Sparkles size={13} /> SALON GIER / GOTOWI DO GRY?</div>
            <h1 className="joy-heading mt-3 max-w-[800px] text-4xl font-bold leading-[1.07] tracking-[-.045em] sm:text-5xl lg:text-[62px]">Pięć światów. <span className="joy-gradient-text">Jedna kanapa.</span></h1>
            <p className="mt-4 max-w-[680px] text-sm leading-relaxed text-slate-400 sm:text-base">Wybierz grę na dużym ekranie. Telefony zamieniają się w pady — bez instalacji, nawet w różnych sieciach. Pierwszy podłączony telefon prowadzi rozgrywkę.</p>
          </div>
          <div className="joy-kicker rounded-full border border-white/10 bg-white/[.04] px-4 py-2 text-slate-400"><span className="mr-2 text-emerald-400">●</span>5 GIER GOTOWYCH DO URUCHOMIENIA</div>
        </div>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0">
            <div className="joy-feature relative flex min-h-[410px] flex-col justify-end overflow-hidden rounded-[30px] border border-white/10 p-6 sm:min-h-[460px] sm:p-9" style={{ '--game-accent': featured.accent } as React.CSSProperties}>
              <img key={featured.cover} src={`${import.meta.env.BASE_URL}${featured.cover}`} alt="" className="joy-feature-image absolute inset-0 h-full w-full object-cover" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(9,10,28,.96)_0%,rgba(9,10,28,.80)_43%,rgba(9,10,28,.18)_100%),linear-gradient(0deg,rgba(9,10,28,.93),transparent_70%)]" />
              <div className="pointer-events-none absolute inset-0 opacity-30" style={{ background: `radial-gradient(ellipse at 65% 100%, ${featured.accent}40, transparent 58%)` }} />
              <div className="relative z-10 max-w-[590px]">
                <div className="joy-kicker flex items-center gap-2" style={{ color: featured.accent }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: featured.accent }} /> WYBRANA GRA / {featured.eyebrow}</div>
                <h2 className="joy-heading mt-3 text-[42px] font-extrabold leading-[.97] tracking-[-.055em] sm:text-[68px]">{featured.title}</h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-200 sm:text-base">{featured.description}</p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  <button onClick={() => open(featured.id)} className="joy-play flex items-center gap-3 rounded-xl px-6 py-3.5 text-sm font-extrabold text-[#0b0c1b] transition hover:-translate-y-0.5 hover:brightness-110" style={{ background: featured.accent, boxShadow: `0 12px 35px ${featured.accent}44` }}>Otwórz grę <ArrowRight size={18} /></button>
                  <span className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-xs font-medium text-slate-200 backdrop-blur">{featured.genre} · {featured.players}</span>
                </div>
              </div>
              <span className="joy-feature-number pointer-events-none absolute right-5 top-3 text-[100px] font-black leading-none text-white/[.06] sm:right-8 sm:text-[160px]">{featured.number}</span>
            </div>

            <div className="mt-7 flex items-end justify-between gap-2"><div><div className="joy-kicker text-violet-300">BIBLIOTEKA</div><h3 className="joy-heading mt-1 text-2xl font-bold">Wybierz swój świat</h3></div><div className="flex gap-2"><button onClick={() => setFocus(i => (i + GAMES.length - 1) % GAMES.length)} aria-label="Poprzednia gra" className="joy-arrow"><ArrowLeft size={17} /></button><button onClick={() => setFocus(i => (i + 1) % GAMES.length)} aria-label="Następna gra" className="joy-arrow"><ArrowRight size={17} /></button></div></div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
              {GAMES.map((game, i) => (
                <button key={game.id} onClick={() => { setFocus(i); open(game.id); }} aria-label={`Otwórz ${game.title}`} aria-current={i === focus ? 'true' : undefined} className={`joy-game-card group min-w-0 overflow-hidden rounded-2xl border text-left transition duration-200 hover:-translate-y-1 ${i === focus ? 'border-violet-400/80 bg-violet-400/10' : 'border-white/10 bg-white/[.035] hover:border-white/25'}`}>
                  <div className="relative h-28 overflow-hidden sm:h-32"><img src={`${import.meta.env.BASE_URL}${game.cover}`} alt="" loading="lazy" className="h-full w-full object-cover transition duration-300 group-hover:scale-110" /><div className="absolute inset-0 bg-gradient-to-t from-[#101126] to-transparent" /><span className="joy-kicker absolute left-3 top-3 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-[9px] text-white">{game.number} / {game.genre}</span></div>
                  <div className="px-3 pb-4 pt-2"><div className="joy-heading truncate text-sm font-bold text-white sm:text-[15px]">{game.title}</div><div className="mt-1 truncate text-[11px] text-slate-400">{game.teaser}</div><div className="mt-3 h-[2px] w-8 rounded-full" style={{ background: game.accent }} /></div>
                </button>
              ))}
            </div>
            <p className="mt-4 text-xs text-slate-500">Sterowanie menu: <kbd>←</kbd> <kbd>→</kbd> i <kbd>Enter</kbd> na klawiaturze lub pilot administratora na telefonie. Kliknij kartę albo „Otwórz grę”, aby wejść do ustawień.</p>
          </main>
          <aside className="min-w-0"><RoomCard /><div className="mt-4 rounded-2xl border border-white/[.07] bg-white/[.025] p-4 text-xs leading-relaxed text-slate-400"><div className="mb-2 flex items-center gap-2 font-bold text-slate-200"><Zap size={15} className="text-violet-300" /> Jak zacząć?</div><b className="text-slate-200">01</b> Otwórz stronę na komputerze lub TV. <b className="text-slate-200">02</b> Zeskanuj QR telefonami. <b className="text-slate-200">03</b> Administrator wybiera grę — reszta dołącza automatycznie. Bez telefonów też zagrasz klawiaturą.</div></aside>
        </div>
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-500"><span className="joy-brand text-base font-bold text-slate-400">Joy<span className="text-violet-400">Pad.</span></span><span>Jedna strona · jeden ekran · wspólna zabawa</span><span className="flex items-center gap-1.5"><Power size={12} /> Gra działa w przeglądarce</span></footer>
      </div>
    </div>
  );
}

export { gameInfo };
