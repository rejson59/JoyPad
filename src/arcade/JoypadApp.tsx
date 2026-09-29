import { SessionNotifications } from '../platform/notifications';
import { JoyPadLogo } from '../components/JoyPadLogo';
import { lastGame } from '../console/history';
import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { ConsoleLibrary } from '../console/ConsoleLibrary';
import { nextPlayable } from '../console/navigation';
import { systemSound } from '../console/sound';
const TankApp = lazy(() => import('../App'));
import { PLAYER_DEFS } from '../game/types';
import { menuMusic } from '../game/menuMusic';
import { padHost } from '../net/padHost';
import type { RemoteCommand, RemoteEvent } from '../net/protocol';
import { usePadHost } from '../pad/PadHostPanel';
import { BootSplash } from '../components/BootSplash';
import { ConnectionsScreen } from '../components/ConnectionsScreen';
import { JoyLab } from '../components/JoyLab';
import { ScreenCurtain, useCurtain } from '../components/motion';
import { GAMES, gameInfo, type GameId } from './catalog';
import { ArcadeGameView } from './ArcadeGameView';
import { useT, type Language } from '../platform/i18n';

interface GameErrorBoundaryProps { children: ReactNode; onExit: () => void; language: Language }
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
        <div className="joy-kicker text-red-300">{this.props.language === 'en' ? 'GAME PAUSED' : 'GRA ZATRZYMANA'}</div>
        <h1 className="joy-heading mt-3 text-3xl font-bold">{this.props.language === 'en' ? 'Something went wrong' : 'Coś poszło nie tak'}</h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-zinc-400">{this.props.language === 'en' ? 'Your phone session is still active. Return to the library and try this game again, or choose another one.' : 'Sesja telefonów nadal działa. Wróć do biblioteki i uruchom tę grę ponownie albo wybierz inny tytuł.'}</p>
        <button type="button" onClick={this.props.onExit} className="mt-6 rounded-xl bg-orange-500 px-6 py-3 text-sm font-black text-[#17120d] hover:bg-orange-400">{this.props.language === 'en' ? 'BACK TO LIBRARY' : 'WRÓĆ DO BIBLIOTEKI'}</button>
      </div>
    );
  }
}

export default function JoypadApp() {
  const { language } = useT();
  const [selected, setSelected] = useState<GameId | null>(null);
  const [booted, setBooted] = useState(false);
  const [showConnections, setShowConnections] = useState(false);
  const [showLab, setShowLab] = useState(false);
  const overlay = useRef(false);
  const onOverlayChange = useCallback((open: boolean) => { overlay.current = open; }, []);
  // Startujemy od najbardziej efektownego świata 3D (STAR CLASH).
  const [focus, setFocus] = useState(() => Math.max(0, GAMES.findIndex(game => game.id === lastGame() && !game.wip)));
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
  const previousScreen = useRef(state.screen);
  useEffect(() => {
    if (previousScreen.current !== state.screen) {
      if (state.screen === 'game') systemSound('start');
      if (state.screen === 'over') systemSound('finish');
    }
    previousScreen.current = state.screen;
  }, [state.screen]);
  const curtain = useCurtain(true);
  const beginTransition = curtain.begin;

  // Podmiana ekranów pod kurtyną w kolorze docelowej gry — bez twardych cutów.
  const open = useCallback((id: GameId) => {
    if (gameInfo(id).wip) return; // gry „w budowie” nie startują
    systemSound('confirm');
    beginTransition(gameInfo(id).accent, () => {
      setRemote(null);
      selectedRef.current = id;
      padHost.setGame(id);
      padHost.setScreen('menu');
      setSelected(id);
    });
  }, [beginTransition]);
  const exit = useCallback(() => {
    systemSound('back');
    beginTransition('#f97316', () => {
      setRemote(null);
      selectedRef.current = null;
      padHost.setGame(null);
      padHost.setMenuOptions(undefined);
      padHost.setScreen('lobby');
      setSelected(null);
    });
  }, [beginTransition]);

  useEffect(() => {
    padHost.setSlotMeta(PLAYER_DEFS.map(p => ({ name: p.name, color: p.color, darkColor: p.darkColor })));
    padHost.setGame(null);
    padHost.setScreen('lobby');
    if (padHost.status === 'idle') padHost.start();
  }, []);

  useEffect(() => { padHost.setSelection(focus); }, [focus]);

  // Muzyka menu gra tylko poza rundą — na czas gry cichnie (mute rules).
  useEffect(() => { menuMusic.setContext(selected ? 'game' : 'menu'); }, [selected]);

  const openLab = () => { setShowLab(true); padHost.setScreen('lab'); };
  const closeLab = useCallback(() => { setShowLab(false); padHost.setScreen('lobby'); }, []);
  const choose = useCallback((i: number) => {
    if (i !== focusRef.current) systemSound('move');
    focusRef.current = i; setFocus(i);
  }, []);

  useEffect(() => {
    const handle = (command: RemoteCommand) => {
      if (padHost.session().room?.dimmed) {
        if (['select', 'back', 'home'].includes(command)) padHost.manageRoom({ kind: 'dimmed', value: false });
        return;
      }
      if (showLab) { if (command === 'back' || command === 'home' || command === 'select') closeLab(); return; }
      if (showConnections || overlay.current || document.querySelector('dialog[open], .boot-splash')) { window.dispatchEvent(new CustomEvent('joypad-dialog-command', { detail: command })); return; }
      if (selectedRef.current) { setRemote({ id: ++serial.current, command }); return; }
      const active = document.activeElement as HTMLElement | null;
      if (command === 'up') { document.querySelector<HTMLElement>('.os-topbar nav button')?.focus(); return; }
      if (command === 'down') { document.querySelector<HTMLElement>(`[data-game-index="${focusRef.current}"]`)?.focus(); return; }
      if (command === 'left' || command === 'right') {
        if (active?.closest('.os-topbar')) {
          const buttons = Array.from(document.querySelectorAll<HTMLElement>('.os-topbar nav button'));
          const at = buttons.indexOf(active);
          buttons[(at + (command === 'left' ? -1 : 1) + buttons.length) % buttons.length]?.focus();
        } else {
          const next = nextPlayable(focusRef.current, command === 'left' ? -1 : 1);
          choose(next);
          if (active?.closest('.os-game-rail')) document.querySelector<HTMLElement>(`[data-game-index="${next}"]`)?.focus({ preventScroll: true });
        }
      }
      if (command === 'select') {
        if (active?.closest('.os-topbar,.os-footer,.os-collection-heading,.os-session') && active.matches('button,a')) active.click();
        else open(GAMES[focusRef.current].id);
      }
    };
    padHost.onAdminCommand = handle;
    padHost.onGameChoice = (index) => {
      if ((selectedRef.current && padHost.session().screen !== 'over') || showLab || showConnections || overlay.current || !GAMES[index] || GAMES[index].wip || GAMES[index].id === selectedRef.current) return;
      choose(index); open(GAMES[index].id);
    };
    const key = (e: KeyboardEvent) => {
      if (selectedRef.current || document.querySelector('.boot-splash') || (e.target instanceof Element && e.target.closest('input,select,textarea,dialog'))) return;
      if ((e.code === 'Enter' || e.code === 'Space') && e.target instanceof Element && e.target.closest('button,a')) return;
      const map: Record<string, RemoteCommand> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'select', Escape: 'back' };
      if (map[e.code]) { e.preventDefault(); handle(map[e.code]); }
    };
    window.addEventListener('keydown', key);
    let raf = 0; let held = ''; let repeatAt = 0;
    const poll = (now: number) => {
      if (!document.hidden && !selectedRef.current) {
        const pad = navigator.getGamepads?.().find(p => p?.mapping === 'standard');
        let command: RemoteCommand | '' = '';
        if (pad) {
          if (pad.buttons[14]?.pressed || pad.axes[0] < -.6) command = 'left';
          else if (pad.buttons[15]?.pressed || pad.axes[0] > .6) command = 'right';
          else if (pad.buttons[12]?.pressed || pad.axes[1] < -.6) command = 'up';
          else if (pad.buttons[13]?.pressed || pad.axes[1] > .6) command = 'down';
          else if (pad.buttons[0]?.pressed) command = 'select';
          else if (pad.buttons[1]?.pressed) command = 'back';
        }
        if (command && (command !== held || ((command === 'left' || command === 'right') && now > repeatAt))) { handle(command); repeatAt = now + (command === held ? 180 : 400); }
        held = command;
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => { cancelAnimationFrame(raf); padHost.onAdminCommand = null; padHost.onGameChoice = null; window.removeEventListener('keydown', key); };
  }, [open, choose, showConnections, showLab, closeLab]);

  let content: ReactNode;
  if (!booted) {
    content = <BootSplash variant="console" onDone={() => setBooted(true)} />;
  } else if (selected) {
    content = (
      <GameErrorBoundary key={selected} onExit={exit} language={language}>
        {selected === 'tanks'
          ? <Suspense fallback={<div className="flex min-h-screen items-center justify-center bg-[#0a0c0d] text-orange-300">{language === 'en' ? 'Loading Steel Front…' : 'Ładowanie Stalowego Frontu…'}</div>}><TankApp onExit={exit} remote={remote} /></Suspense>
          : selected === 'blockcraft'
            ? <div className="flex min-h-screen flex-col items-center justify-center bg-[#090d12] px-6 text-center text-white"><div className="joy-kicker text-emerald-300">{language === 'en' ? 'COMING SOON' : 'ZAPOWIEDŹ'}</div><h1 className="joy-heading mt-3 text-4xl font-bold">BlockCraft</h1><p className="mt-3 max-w-lg text-sm text-slate-300">{language === 'en' ? 'A block-building sandbox is in the works. This preview is not playable yet.' : 'Sandbox z budowaniem z bloków jest w przygotowaniu. Ta zapowiedź nie jest jeszcze grywalna.'}</p><button type="button" onClick={exit} className="mt-6 rounded-xl bg-orange-400 px-5 py-3 font-bold text-black">{language === 'en' ? 'Back to library' : 'Wróć do biblioteki'}</button></div>
            : <ArcadeGameView key={selected} id={selected} onExit={exit} remote={remote} />}
      </GameErrorBoundary>
    );
  } else {
    content = <>
      <ConsoleLibrary suspended={showConnections || showLab} focus={focus} onFocus={choose} onOpen={open} onConnections={() => setShowConnections(true)} onLab={openLab} onOverlayChange={onOverlayChange} />
      {showConnections && <ConnectionsScreen onClose={() => setShowConnections(false)} />}
      {showLab && <JoyLab onClose={closeLab} />}
    </>;
  }

  return (
    <>
      {content}
      <ScreenCurtain state={curtain.state} />
      <SessionNotifications session={padHost.session()} />
      {state.room.dimmed && <div className="joy-screen-rest"><JoyPadLogo size={150} /><span className="os-eyebrow">JOYPAD / {language === 'en' ? 'BREAK TIME' : 'CHWILA PRZERWY'}</span><h1>{language === 'en' ? 'The evening is still yours.' : 'Dobry wieczór trwa.'}</h1><p>{language === 'en' ? 'The crew is still connected. Come back whenever you like.' : 'Ekipa nadal jest połączona. Wróćcie, kiedy chcecie.'}</p><button onClick={() => padHost.manageRoom({ kind: 'dimmed', value: false })}>{language === 'en' ? 'Back to screen' : 'Wróć do ekranu'}</button><small>{language === 'en' ? 'The admin can also wake the screen from a phone.' : 'Administrator może też odsłonić ekran z telefonu.'}</small></div>}
      {state.screen === 'game' && state.pads.some(p => p.inputStale) && <div className="os-link-state" role="status">{language === 'en' ? 'No signal' : 'Brak sygnału'}: {state.pads.filter(p => p.inputStale).map(p => p.nick).join(', ')} · {language === 'en' ? 'Controls stopped. Waiting for the connection to return.' : 'Sterowanie zatrzymane. Czekamy na powrót.'}</div>}
    </>
  );
}

export { gameInfo };
