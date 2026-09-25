import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { Activity, ArrowLeft, ArrowRight, Gamepad2, Gauge, Hammer, Monitor, Moon, PanelsTopLeft, Power, Radio, Smartphone, Sparkles, Volume2, VolumeX, Wifi, Zap } from 'lucide-react';
const TankApp = lazy(() => import('../App'));
import { PLAYER_DEFS } from '../game/types';
import { gameAudio } from '../game/audio';
import { menuMusic } from '../game/menuMusic';
import { padHost } from '../net/padHost';
import type { RemoteCommand, RemoteEvent } from '../net/protocol';
import { usePadHost } from '../pad/PadHostPanel';
import { BootSplash } from '../components/BootSplash';
import { ConnectionsScreen } from '../components/ConnectionsScreen';
import { CursorGlow } from '../components/CursorGlow';
import { JoinSplash, type JoinSplashData } from '../components/JoinSplash';
import { JoyLab } from '../components/JoyLab';
import { ScreenCurtain, useCurtain } from '../components/motion';
import { useMenuMusic } from '../lib/useMenuMusic';
import { GAMES, gameInfo, type GameId } from './catalog';
import { ArcadeGameView } from './ArcadeGameView';

function RoomCard({ onOpenConnections, onOpenLab }: { onOpenConnections: () => void; onOpenLab: () => void }) {
  const state = usePadHost();
  const usable = state.status === 'ready' || state.relay === 'online';
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
      <div className="mt-5 rounded-2xl border border-white/10 bg-[#0b0d0e] px-4 py-4 text-center">
        <div className="joy-kicker text-slate-500">KOD POKOJU</div>
        <div className="mt-1 font-mono2 text-[34px] font-extrabold tracking-[.24em] text-white">{state.code || '·····'}</div>
        <div className="mt-2 text-xs text-slate-500"><Wifi size={12} className={`inline ${usable ? 'text-emerald-400' : 'text-amber-400'}`} /> {state.pads.length}/4 padów · {state.relay === 'online' ? 'P2P + przekaźnik' : state.signal === 'online' ? 'P2P aktywne' : 'łączenie…'}</div>
      </div>
      <button onClick={() => { gameAudio.init(); gameAudio.uiClick(); onOpenConnections(); }} className="press mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-3 text-sm font-extrabold text-[#16110c] transition hover:-translate-y-0.5 hover:bg-orange-400">
        <Radio size={16} /> EKRAN POŁĄCZEŃ
      </button>
      <button onClick={() => { gameAudio.init(); gameAudio.uiClick(); onOpenLab(); }} className="press mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-white/15 bg-white/[.06] px-4 py-3 text-sm font-extrabold text-slate-200 transition hover:border-orange-400/50 hover:bg-orange-500/10">
        <Zap size={16} /> LAB KONTROLERA
      </button>
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
  const [booted, setBooted] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [showLab, setShowLab] = useState(false);
  const labShown = useRef(false);
  const [menuMusicOn, toggleMenuMusic] = useMenuMusic();
  // Startujemy od najbardziej efektownego świata 3D (STAR CLASH).
  const [focus, setFocus] = useState(() => Math.max(0, GAMES.findIndex(game => game.id === 'orbit' && !game.wip)));
  const [remote, setRemote] = useState<RemoteEvent | null>(null);
  const serial = useRef(0);
  const selectedRef = useRef<GameId | null>(null);
  const focusRef = useRef(0);
  // Refy aktualizują się w efekcie (nie w trakcie renderu) — zgodnie z regułami
  // Reacta; open()/close() dodatkowo ustawiają selectedRef natychmiast.
  useEffect(() => {
    selectedRef.current = selected;
    focusRef.current = focus;
  }, [selected, focus]);
  const state = usePadHost();
  const curtain = useCurtain();

  // Kliknięcie menu z lekkiem „tik” — spójny język dźwiękowy całej biblioteki.
  const uiClick = useCallback(() => { gameAudio.init(); gameAudio.uiClick(); }, []);

  // Splash „NOWY GRACZ” — witamy każdy telefon, który dołączy po starcie strony.
  const [splash, setSplash] = useState<JoinSplashData | null>(null);
  const knownPads = useRef<Set<string> | null>(null);
  if (knownPads.current === null) knownPads.current = new Set(state.pads.map(p => p.connId));
  useEffect(() => {
    const known = knownPads.current!;
    const fresh = state.pads.filter(p => !known.has(p.connId));
    if (!fresh.length) return;
    for (const p of fresh) known.add(p.connId);
    const pad = fresh[fresh.length - 1];
    setSplash({ nick: pad.nick, slot: pad.slot, color: PLAYER_DEFS[pad.slot]?.color ?? '#f97316', key: Date.now() });
    const t = window.setTimeout(() => setSplash(null), 2400);
    return () => window.clearTimeout(t);
  }, [state.pads]);

  // Crossfade okładki hero: poprzednia pozostaje pod nową, aż nie zniknie.
  const [prevCover, setPrevCover] = useState<string | null>(null);
  const lastCoverRef = useRef(GAMES[focus].cover);
  const coverTimer = useRef(0);
  useEffect(() => {
    const next = GAMES[focus].cover;
    if (lastCoverRef.current === next) return;
    setPrevCover(lastCoverRef.current);
    lastCoverRef.current = next;
    window.clearTimeout(coverTimer.current);
    coverTimer.current = window.setTimeout(() => setPrevCover(null), 460);
  }, [focus]);

  // Delikatny parallax okładki hero (tylko desktop, bez reduced-motion).
  const heroRef = useRef<HTMLDivElement>(null);
  const heroRaf = useRef(0);
  const onHeroPointer = useCallback((e: React.PointerEvent) => {
    const el = heroRef.current;
    if (!el) return;
    const fine = (() => { try { return window.matchMedia('(pointer: fine)').matches; } catch { return false; } })();
    if (!fine) return;
    const reduced = (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
    if (reduced) return;
    const rect = el.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    cancelAnimationFrame(heroRaf.current);
    heroRaf.current = requestAnimationFrame(() => {
      el.style.setProperty('--par-x', px.toFixed(3));
      el.style.setProperty('--par-y', py.toFixed(3));
    });
  }, []);
  useEffect(() => () => cancelAnimationFrame(heroRaf.current), []);

  // Podmiana ekranów pod kurtyną w kolorze docelowej gry — bez twardych cutów.
  const open = useCallback((id: GameId) => {
    if (gameInfo(id).wip) return; // gry „w budowie” nie startują
    curtain.begin(gameInfo(id).accent, () => {
      setRemote(null);
      selectedRef.current = id;
      padHost.setGame(id);
      padHost.setScreen('menu');
      setSelected(id);
    });
  }, [curtain]);
  const exit = useCallback(() => {
    curtain.begin('#f97316', () => {
      setRemote(null);
      selectedRef.current = null;
      padHost.setGame(null);
      padHost.setMenuOptions(undefined);
      padHost.setScreen('lobby');
      setSelected(null);
    });
  }, [curtain]);

  useEffect(() => {
    padHost.setSlotMeta(PLAYER_DEFS.map(p => ({ name: p.name, color: p.color, darkColor: p.darkColor })));
    padHost.setGame(null);
    padHost.setScreen('lobby');
    if (padHost.status === 'idle') padHost.start();
  }, []);

  useEffect(() => { padHost.setSelection(focus); }, [focus]);

  // Muzyka menu gra tylko poza rundą — na czas gry cichnie (mute rules).
  useEffect(() => { menuMusic.setContext(selected ? 'game' : 'menu'); }, [selected]);

  // Pierwszy sparowany telefon = pokój zabaw kontrolera (Lab), zanim przejdziesz do menu.
  useEffect(() => {
    if (!labShown.current && state.pads.length > 0 && !selected) {
      labShown.current = true;
      setShowLab(true);
    }
  }, [state.pads.length, selected]);

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

  let content: ReactNode;
  if (!booted) {
    content = <BootSplash onDone={() => setBooted(true)} />;
  } else if (selected) {
    content = (
      <GameErrorBoundary key={selected} onExit={exit}>
        {selected === 'tanks'
          ? <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0a0c0d] text-orange-300">Ładowanie Stalowego Frontu…</div>}><TankApp onExit={exit} remote={remote} /></Suspense>
          : <ArcadeGameView key={selected} id={selected} onExit={exit} remote={remote} />}
      </GameErrorBoundary>
    );
  } else {
    const featured = GAMES[focus];
    content = (
    <div className="joy-shell relative min-h-screen overflow-hidden text-white">
      <div className="joy-ambient pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-[1480px] px-4 pb-16 sm:px-7 lg:px-10">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 py-5">
          <div className="flex items-center gap-3">
            <div className="joy-logo logo-pop flex h-11 w-11 items-center justify-center rounded-2xl"><Gamepad2 size={24} strokeWidth={2.5} /></div>
            <div><div className="joy-brand text-[27px] font-extrabold leading-none tracking-[-.06em]">Joy<span className="text-orange-400">Pad</span><span className="text-orange-400">.</span></div><div className="joy-kicker mt-1 text-[9px] text-slate-500">LOCAL PLAY SYSTEM / ROOM-READY</div></div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <span className="joy-system-status hidden items-center gap-2 md:flex"><Activity size={14} /> SYSTEM READY · {GAMES.filter(g => !g.wip).length} WORLDS</span>
            <button onClick={() => { uiClick(); toggleMenuMusic(!menuMusicOn); }} title={menuMusicOn ? 'Wyłącz muzykę menu' : 'Włącz muzykę menu'} aria-label="Muzyka menu" className="press flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/[.05] text-slate-200 transition hover:border-orange-400/50 hover:bg-orange-500/10">
              {menuMusicOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            <button onClick={() => { uiClick(); setShowConnections(true); }} className="press flex items-center gap-2 rounded-full border border-white/15 bg-white/[.05] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-orange-400/50 hover:bg-orange-500/10"><Radio size={15} /> Połączenia</button>
            <a href="#pad" target="_blank" rel="noopener noreferrer" onClick={uiClick} className="press flex items-center gap-2 rounded-full border border-white/15 bg-white/[.05] px-4 py-2 text-xs font-semibold text-slate-200 transition hover:border-orange-400/50 hover:bg-orange-500/10"><Smartphone size={15} /> Otwórz pada</a>
            <span className="joy-room-code rounded-full px-4 py-2 font-mono2 text-xs font-bold tracking-widest">{state.code || '·····'}</span>
          </div>
        </header>

        <section className="joy-intro mb-7 mt-10 flex flex-wrap items-end justify-between gap-6">
          <div><div className="joy-kicker flex items-center gap-2 text-orange-300"><Sparkles size={13} /> SALON GIER / TRYB KANAPOWY</div>
            <h1 className="joy-heading mt-3 max-w-[850px] text-4xl font-bold leading-[1.02] tracking-[-.055em] sm:text-5xl lg:text-[68px]">Graj po swojemu.<br /><span className="joy-gradient-text">Wspólny ekran.</span></h1>
            <p className="mt-4 max-w-[650px] text-sm leading-relaxed text-slate-400 sm:text-base">Trzy gotowe światy (kolejne w przebudowie), szybki start i telefony, które zamieniają się w pady. Ciemny interfejs, pomarańczowy sygnał akcji i animacje, które nie walczą z grą o uwagę.</p>
          </div>
          <div className="joy-status-stack grid grid-cols-3 gap-2"><div><b>{String(GAMES.filter(g => !g.wip).length).padStart(2, '0')}</b><span>GOTOWYCH</span></div><div><b>{String(GAMES.filter(g => g.wip).length).padStart(2, '0')}</b><span>W BUDOWIE</span></div><div><b>04</b><span>PADY</span></div></div>
        </section>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_330px]">
          <main className="min-w-0">
            <div className="joy-feature relative flex min-h-[410px] flex-col justify-end overflow-hidden rounded-[28px] border border-white/10 p-6 sm:min-h-[460px] sm:p-9" style={{ '--game-accent': featured.accent } as React.CSSProperties} onPointerMove={onHeroPointer}>
              {/* warstwa okładek: crossfade przy zmianie gry + parallax + powolny Ken Burns */}
              <div ref={heroRef} className="absolute inset-0" style={{ transform: 'translate3d(calc(var(--par-x, 0) * -14px), calc(var(--par-y, 0) * -10px), 0)', transition: 'transform 450ms var(--ease-out-quart)' }}>
                {prevCover && <img src={`${import.meta.env.BASE_URL}${prevCover}`} alt="" width={1280} height={720} className="absolute inset-0 h-full w-full object-cover" />}
                <div className="ken-burns absolute inset-0">
                  <img key={featured.cover} src={`${import.meta.env.BASE_URL}${featured.cover}`} alt="" width={1280} height={720} fetchPriority="high" className="joy-feature-image cover-in absolute inset-0 h-full w-full object-cover" />
                </div>
              </div>
              <div className="pointer-events-none absolute inset-0 joy-feature-shade" />
              <div className="pointer-events-none absolute inset-0 opacity-70" style={{ background: `radial-gradient(ellipse at 76% 90%, ${featured.accent}24, transparent 48%)` }} />
              <div key={featured.id} className="fade-in relative z-10 max-w-[640px]">
                <div className="joy-kicker flex items-center gap-2" style={{ color: featured.accent }}><span className="h-1.5 w-1.5 rounded-full" style={{ background: featured.accent }} /> WYBRANA GRA / {featured.eyebrow}</div>
                <h2 className="joy-heading mt-3 text-[42px] font-extrabold leading-[.97] tracking-[-.055em] sm:text-[68px]">{featured.title}</h2>
                <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-200 sm:text-base">{featured.description}</p>
                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {featured.wip ? (
                    <>
                      <span className="flex items-center gap-2 rounded-xl border-2 border-amber-400/60 bg-amber-400/10 px-6 py-3.5 text-sm font-extrabold tracking-widest text-amber-200"><Hammer size={16} /> W BUDOWIE</span>
                      <span className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-xs font-medium text-slate-200 backdrop-blur">Ten świat jest przebudowywany — wróci, gdy będzie gotowy.</span>
                    </>
                  ) : (
                    <>
                      <button onClick={() => { uiClick(); open(featured.id); }} className="joy-play press flex items-center gap-3 rounded-xl px-6 py-3.5 text-sm font-extrabold text-[#16110c] transition hover:-translate-y-0.5 hover:brightness-110" style={{ background: featured.accent, boxShadow: `0 12px 35px ${featured.accent}33` }}>Otwórz grę <ArrowRight size={18} /></button>
                      <span className="rounded-lg border border-white/20 bg-black/30 px-3 py-2 text-xs font-medium text-slate-200 backdrop-blur">{featured.genre} · {featured.players}</span>
                    </>
                  )}
                </div>
              </div>
              <span key={featured.number} className="joy-feature-number number-roll pointer-events-none absolute right-5 top-3 text-[100px] font-black leading-none text-white/[.06] sm:right-8 sm:text-[160px]">{featured.number}</span>
            </div>

            <div className="mt-7 flex items-end justify-between gap-2"><div><div className="joy-kicker text-orange-300">BIBLIOTEKA / {String(GAMES.length).padStart(2, '0')} POZYCJI</div><h3 className="joy-heading mt-1 text-2xl font-bold">Wybierz swój świat</h3></div><div className="flex gap-2"><button onClick={() => { uiClick(); setFocus(i => (i + GAMES.length - 1) % GAMES.length); }} aria-label="Poprzednia gra" className="joy-arrow"><ArrowLeft size={17} /></button><button onClick={() => { uiClick(); setFocus(i => (i + 1) % GAMES.length); }} aria-label="Następna gra" className="joy-arrow"><ArrowRight size={17} /></button></div></div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
              {GAMES.map((game, i) => (
                <button key={game.id} onClick={() => { uiClick(); setFocus(i); open(game.id); }} aria-label={game.wip ? `${game.title} — w budowie` : `Otwórz ${game.title}`} aria-current={i === focus ? 'true' : undefined} className={`joy-game-card group min-w-0 overflow-hidden rounded-2xl border text-left transition duration-200 ${game.wip ? 'blueprint-card cursor-not-allowed opacity-80' : 'hover:-translate-y-1'} ${i === focus ? 'joy-game-card-active' : game.wip ? '' : 'border-white/10 bg-white/[.035] hover:border-white/25'}`}>
                  <div className="relative h-28 overflow-hidden sm:h-32"><img src={`${import.meta.env.BASE_URL}${game.cover}`} alt="" width={1280} height={720} loading="lazy" className={`h-full w-full object-cover transition duration-300 ${game.wip ? 'grayscale' : 'group-hover:scale-110'}`} /><div className="absolute inset-0 bg-gradient-to-t from-[#111313] to-transparent" />{game.wip && <div className="absolute inset-0 bg-[#0b0d0e]/45" />}<span className="joy-kicker absolute left-3 top-3 rounded-md border border-white/20 bg-black/40 px-2 py-1 text-[9px] text-white">{game.number} / {game.renderTag}</span>{game.wip && <span className="joy-kicker absolute right-2 top-2 flex items-center gap-1 rounded-md border border-amber-400/60 bg-amber-400/15 px-2 py-1 text-[9px] text-amber-200"><Hammer size={10} /> W BUDOWIE</span>}</div>
                  <div className="px-3 pb-4 pt-2"><div className="joy-heading truncate text-sm font-bold text-white sm:text-[15px]">{game.title}</div><div className="mt-1 truncate text-[11px] text-slate-400">{game.wip ? 'Przebudowa — wróci wkrótce' : game.teaser}</div>
                    {game.wip ? (
                      <div className="mt-3">
                        <div className="h-[3px] w-full overflow-hidden rounded-full bg-white/10"><div className="rebuild-shimmer h-full w-1/3 rounded-full bg-gradient-to-r from-transparent via-amber-400/80 to-transparent" /></div>
                        <div className="mt-1.5 text-[9px] font-bold tracking-widest text-slate-500">PRACE TRWAJĄ</div>
                      </div>
                    ) : (
                      <div className="mt-3 h-[2px] w-8 rounded-full" style={{ background: game.accent }} />
                    )}
                  </div>
                </button>
              ))}
            </div>
            <div className="joy-performance-note mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500"><span className="flex items-center gap-1.5"><Gauge size={14} className="text-orange-300" /> Profil sprzętu w każdej grze</span><span className="flex items-center gap-1.5"><PanelsTopLeft size={14} className="text-orange-300" /> Tryb shared / split-screen</span><span className="flex items-center gap-1.5"><Monitor size={14} className="text-orange-300" /> TV, laptop albo monitor</span><span className="ml-auto">Menu: <kbd>←</kbd> <kbd>→</kbd> <kbd>Enter</kbd></span></div>
          </main>
          <aside className="min-w-0"><RoomCard onOpenConnections={() => setShowConnections(true)} onOpenLab={() => setShowLab(true)} /><div className="joy-howto mt-4 rounded-2xl p-4 text-xs leading-relaxed text-slate-400"><div className="mb-2 flex items-center gap-2 font-bold text-slate-200"><Zap size={15} className="text-orange-300" /> Jak zacząć?</div><b className="text-slate-200">01</b> Otwórz stronę na komputerze lub TV. <b className="text-slate-200">02</b> Zeskanuj QR telefonami. <b className="text-slate-200">03</b> Administrator wybiera grę — reszta dołącza automatycznie.</div></aside>
        </div>
        {showConnections && <ConnectionsScreen onClose={() => setShowConnections(false)} />}
        {showLab && <JoyLab onClose={() => setShowLab(false)} />}
        <footer className="mt-12 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-5 text-xs text-slate-500"><span className="joy-brand text-base font-bold text-slate-400">Joy<span className="text-orange-400">Pad.</span></span><span>Jedna strona · jeden ekran · wspólna zabawa</span><span className="flex items-center gap-1.5"><Moon size={12} /> DARK CONSOLE THEME <Power size={12} /></span></footer>
      </div>
    </div>
    );
  }

  return (
    <>
      {content}
      <ScreenCurtain state={curtain.state} />
      <JoinSplash data={splash} />
      {!selected && <CursorGlow color={GAMES[focus].accent} />}
    </>
  );
}

export { gameInfo };
