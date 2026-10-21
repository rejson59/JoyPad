import { SessionNotifications, notify } from '../platform/notifications';
// Film i ekran powitalny ładowane leniwie: biblioteka nie ma po co ciągnąć
// silnika scen, dopóki nikt nie poprosi o poradnik. Każdy z nich przechodzi przez
// `ChunkGate`, więc nieudane pobranie ma widoczny komunikat, automatyczną próbę
// i przycisk „Spróbuj ponownie” zamiast czarnej pustki (runda 16).
const loadFilm = () => import('../cinema/Film').then(module => ({ default: module.Film }));
const loadWelcome = () => import('../cinema/Welcome').then(module => ({ default: module.Welcome }));
import { answerWelcome, closeCinema, markWatched, openCinema, shouldAskOnStart, useCinemaRequest } from '../cinema/store';
import { JoyPadLogo } from '../components/JoyPadLogo';
import { lastGame } from '../console/history';
import { Component, useCallback, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react';
import { ConsoleLibrary } from '../console/ConsoleLibrary';
import { systemSound } from '../console/sound';
const loadTank = () => import('../App').then(module => ({ default: module.default }));
import { PLAYER_DEFS } from '../game/types';
import { menuMusic } from '../game/menuMusic';
import { padHost } from '../net/padHost';
import type { RemoteCommand, RemoteEvent } from '../net/protocol';
import { usePadHost } from '../pad/PadHostPanel';
import { BootSplash } from '../components/BootSplash';
import { Plamek } from '../console/Plamek';
import { ChunkGate } from '../components/ChunkGate';
import { useUiControls } from '../console/uiControl';
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
  const { language, t } = useT();
  const [selected, setSelected] = useState<GameId | null>(null);
  const [booted, setBooted] = useState(false);
  /** Pytanie „pierwsze wejście" — jedno na instalację, potem tylko z ustawień. */
  const [welcome, setWelcome] = useState(() => shouldAskOnStart());
  const cinema = useCinemaRequest();
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

  // Pilot z telefonu: to samo wejście co klawiatura i pad USB — silnik interfejsu
  // (uiControl) decyduje, czy komenda jest ruchem po ekranie, czy sprawą aplikacji.
  const handleCommand = useCallback((command: RemoteCommand) => {
    // Film jest modalny: dopóki leci, pilot i pad należą wyłącznie do niego.
    if (cinema.open) { window.dispatchEvent(new CustomEvent('joypad-dialog-command', { detail: command })); return; }
    if (padHost.session().room?.dimmed) {
      if (command === 'select' || command === 'back' || command === 'home') padHost.manageRoom({ kind: 'dimmed', value: false });
      return;
    }
    if (showLab) { if (command === 'back' || command === 'home') closeLab(); return; }
    // Ekran startowy ma własny pilot (A/B/Start pomijają boot) — oddajemy mu komendę w całości.
    if (document.querySelector('.boot-splash')) { window.dispatchEvent(new CustomEvent('joypad-dialog-command', { detail: command })); return; }
    if (selectedRef.current) { setRemote({ id: ++serial.current, command }); return; }
    if (showConnections || overlay.current || welcome) { window.dispatchEvent(new CustomEvent('joypad-dialog-command', { detail: command })); return; }
    if (command === 'back') {
      // W bibliotece „wstecz" nie ma od czego uciekać — wracamy na kolejkę gier.
      document.querySelector<HTMLElement>(`[data-game-index="${focusRef.current}"]`)?.focus({ preventScroll: true });
      systemSound('back');
    }
  }, [cinema.open, closeLab, showConnections, showLab, welcome]);

  // Kto rządzi komendami: dopóki gra nie kręci rundy, pilot i klawiatura obsługują
  // interfejs — także menu samej gry (ustawienia, wyniki). `state.screen` utrzymują
  // same gry (`padHost.setScreen(stage)`), więc bramka jest jedna dla wszystkich
  // tytułów: 'game' = pad gra, cokolwiek innego = pad steruje menu.
  // Podczas filmu silnik interfejsu milknie — inaczej A uruchomiłoby grę pod filmem.
  const uiOwnsInput = booted && !cinema.open && !state.room.dimmed && (!selected || state.screen !== 'game');
  // Powrót z gry zostawia bibliotekę bez fokusa (elementy okienka zniknęły razem z grą),
  // a bez fokusa nie ma Plamka i pierwsze naciśnięcie strzałki startuje od środka ekranu.
  // Wskakujemy więc na tę samą grę, z której wychodzimy — maskotka czeka na niej.
  useEffect(() => {
    if (selected || !booted || state.room.dimmed) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body && active !== document.documentElement) return;
    document.querySelector<HTMLElement>(`[data-game-index="${focusRef.current}"]`)?.focus({ preventScroll: true });
  }, [selected, booted, state.room.dimmed]);
  useUiControls({
    enabled: uiOwnsInput,
    onCommand: handleCommand,
    // Pad zatwierdza to, co wskazujemy; dopiero gdy fokus uciekł z elementów,
    // A uruchamia podświetloną grę (stare zachowanie konsoli).
    onSelect: () => {
      if (selectedRef.current || !booted || state.room.dimmed) return false;
      open(GAMES[focusRef.current].id);
      return true;
    },
  });

  useEffect(() => {
    padHost.onGameChoice = (index) => {
      if ((selectedRef.current && padHost.session().screen !== 'over') || showLab || showConnections || overlay.current || !GAMES[index] || GAMES[index].wip || GAMES[index].id === selectedRef.current) return;
      choose(index); open(GAMES[index].id);
    };
    return () => { padHost.onGameChoice = null; };
  }, [choose, open, showConnections, showLab]);

  const watchTutorial = () => { answerWelcome(true); openCinema('welcome'); };
  const declineTutorial = () => { answerWelcome(false); setWelcome(false); };
  const finishFilm = (reason: 'ended' | 'skipped') => {
    markWatched();
    closeCinema();
    if (reason === 'ended') notify(t('notifications.tutorialDone'), t('notifications.tutorialDoneDetail'), 'success');
    else notify(t('notifications.tutorialSkipped'), t('notifications.tutorialSkippedDetail'));
    setWelcome(false);
  };

  let content: ReactNode;
  if (cinema.open) {
    content = (
      <ChunkGate loader={loadFilm}>
        {Film => <Film mode={cinema.mode} onDone={finishFilm} />}
      </ChunkGate>
    );
  } else if (!booted) {
    content = <BootSplash variant="console" onDone={() => setBooted(true)} />;
  } else if (selected) {
    content = (
      <GameErrorBoundary key={selected} onExit={exit} language={language}>
        {selected === 'tanks'
          ? <ChunkGate loader={loadTank}>{TankApp => <TankApp onExit={exit} remote={remote} />}</ChunkGate>
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
      {/* Pytanie wchodzi PO ekranie startowym — inaczej zasłoniłoby boot, a jego
          przycisk „pomiń" byłby nieosiągalny. */}
      {welcome && booted && !cinema.open && (
        <ChunkGate loader={loadWelcome}>
          {Welcome => <Welcome onWatch={watchTutorial} onDecline={declineTutorial} />}
        </ChunkGate>
      )}
      {/* Pierścień fokusa żyje obok treści; w okienkach montuje się jego własna kopia.
          Pod roundzie 10 maskotka chodzi też po menu gier — znika dopiero, gdy runda
          starts (tam ekran jest areny, a nie interfejsu). */}
      {uiOwnsInput && <Plamek />}
      <ScreenCurtain state={curtain.state} />
      <SessionNotifications session={padHost.session()} />
      {state.room.dimmed && <div className="joy-screen-rest"><JoyPadLogo size={150} /><span className="os-eyebrow">JOYPAD / {language === 'en' ? 'BREAK TIME' : 'CHWILA PRZERWY'}</span><h1>{language === 'en' ? 'The evening is still yours.' : 'Dobry wieczór trwa.'}</h1><p>{language === 'en' ? 'The crew is still connected. Come back whenever you like.' : 'Ekipa nadal jest połączona. Wróćcie, kiedy chcecie.'}</p><button onClick={() => padHost.manageRoom({ kind: 'dimmed', value: false })}>{language === 'en' ? 'Back to screen' : 'Wróć do ekranu'}</button><small>{language === 'en' ? 'The admin can also wake the screen from a phone.' : 'Administrator może też odsłonić ekran z telefonu.'}</small></div>}
      {state.screen === 'game' && state.pads.some(p => p.inputStale) && <div className="os-link-state" role="status">{language === 'en' ? 'No signal' : 'Brak sygnału'}: {state.pads.filter(p => p.inputStale).map(p => p.nick).join(', ')} · {language === 'en' ? 'Controls stopped. Waiting for the connection to return.' : 'Sterowanie zatrzymane. Czekamy na powrót.'}</div>}
    </>
  );
}

export { gameInfo };
