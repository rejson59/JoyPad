import { useRecordedMoments } from './platform/useRecordedMoments';
import { ReadyStatus } from './console/ReadyStatus';
import { readChoice, remember } from './console/history';
import { clearLeaveWish, isLeaving, wishToLeave } from './lib/exitWish';
import { GameSetup } from './console/GameSetup';
import { focusUiScope } from './console/focusSurface';
import { ConnectionsScreen } from './components/ConnectionsScreen';
import { useMenuMusic } from './lib/useMenuMusic';
import { GameResults } from './console/GameResults';
import { gameInfo, localizeGame } from './arcade/catalog';
import { useT } from './platform/i18n';
import { PauseSheet } from './console/PauseSheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Trophy, Play, Users, Bot, Volume2, VolumeX, Pause, Home,
  Crosshair, Shield, Zap, Wind, Skull, Timer, Gamepad2,
  Flame, Target, Heart, Keyboard, Info,
  Settings2, Lightbulb, Package, Moon, CloudRain,
} from 'lucide-react';
import { ScreenCurtain, SegmentedControl, useCurtain } from './components/motion';
import { MapThumb } from './components/MapThumb';
import { TankGame, type HudState, type HudTank } from './game/engine';
import { PLAYER_DEFS, type GameMode, type MapId, type PlayerConfig } from './game/types';
import { MAPS, localizedMap } from './game/maps';
import { gameAudio } from './game/audio';
import { menuMusic } from './game/menuMusic';
import { padHost } from './net/padHost';
import type { RemoteCommand, RemoteEvent } from './net/protocol';
import { PadHostPanel, usePadHost } from './pad/PadHostPanel';
// Stalowy Front gra na tej samej oprawie co reszta biblioteki: jeden HUD dla wszystkich
// gier (`console/RoundChrome` + `gamehud.css`), tożsamość gry niesie akcent z katalogu.
import { RoundArena, RoundBuffs, RoundCardScore, RoundChip, RoundFeed, RoundFrame, RoundHelpRow, RoundIconButton, RoundInfoCard, RoundInfoRow, RoundKeyCap as KeyCap, RoundKeyGroup, RoundKeys, RoundMini, RoundOverlay, RoundOverlayGrid, RoundPhoneTag, RoundPlayerCard, RoundSide, RoundTimer, RoundTitle, RoundTopBar } from './console/RoundChrome';
import { Smartphone } from 'lucide-react';

type Screen = 'menu' | 'setup' | 'game' | 'over';

/** Czas rundy w sekundach (stała — niezmienny limit w konfiguracji gry). */
const TIME_LIMIT_S = 300;

function PlayerCard({ t, mode, killLimit, phone, language }: { t: HudTank; mode: GameMode; killLimit: number; phone?: string | null; language: 'pl' | 'en' }) {
  const en = language === 'en';
  const hpPct = (t.hp / t.maxHp) * 100;
  // Pasek HP mówi kolorem systemu: cały (sukces), oberwany (ostrzeżenie), krytyczny (zagrożenie).
  const meterColor = hpPct > 50 ? 'linear-gradient(90deg,#4c8f66,#9ccfae)' : hpPct > 25 ? 'linear-gradient(90deg,#b9822f,#edbd78)' : 'linear-gradient(90deg,#a04a40,#ed8175)';
  return <RoundPlayerCard
    strip
    dimmed={!t.alive}
    name={t.name}
    color={t.color}
    icon={t.isBot ? <Bot size={13} /> : phone ? <Smartphone size={13} /> : <Gamepad2 size={13} />}
    score={t.kills}
    scoreLabel={<RoundCardScore icon={<Skull size={12} />} value={t.kills} extra={mode === 'survival' ? <><Heart size={12} />{t.lives}</> : <small>/ {killLimit}</small>} />}
    value={t.hp}
    maxValue={t.maxHp}
    meterColor={meterColor}
    meta={phone ? <RoundPhoneTag icon={<Smartphone size={11} />}>{phone}</RoundPhoneTag> : undefined}
    pips={mode === 'deathmatch' ? { total: killLimit, filled: t.kills } : undefined}
    footer={<>
      <span>{t.alive ? `${t.hp} HP` : t.respawn > 0 ? `${en ? 'RESPAWN' : 'ODRODZENIE'} ${t.respawn.toFixed(1)}s` : (en ? 'ELIMINATED' : 'ELIMINACJA')}</span>
      <RoundBuffs>
        {t.rapid && <span title={en ? 'Rapid fire' : 'Szybkostrzelność'}><Zap size={12} /></span>}
        {t.big && <span title={en ? 'Heavy shell' : 'Ciężki pocisk'}><Crosshair size={12} /></span>}
        {t.speed && <span title={en ? 'Turbo' : 'Turbo'}><Wind size={12} /></span>}
        {t.shield > 0 && <span title={en ? 'Shield' : 'Tarcza'}><Shield size={12} /></span>}
      </RoundBuffs>
    </>}
  />;
}

export default function TankApp({ onExit, remote }: { onExit: () => void; remote: RemoteEvent | null }) {
  const { language } = useT();
  const en = language === 'en';
  const info = localizeGame(gameInfo('tanks'), language);
  const [menuMusicOn, toggleMenuMusic] = useMenuMusic();
  const [screen, setScreen] = useState<Screen>('menu');
  const [menuChoice, setMenuChoice] = useState(() => readChoice('tanks.choice', [0, 1, 2], 0));
  const [players, setPlayers] = useState<PlayerConfig[]>(() => PLAYER_DEFS.map((p, i) => {
    const role = readChoice(`tanks.player.${i}`, ['off', 'human', 'bot'] as const, !p.enabled ? 'off' : p.isBot ? 'bot' : 'human');
    const pad = padHost.padForSlot(i);
    return { ...p, name: pad?.nick || p.name, enabled: !!pad || role !== 'off', isBot: !pad && role === 'bot' };
  }));
  const [mapId, setMapId] = useState<MapId>(() => readChoice('tanks.map', Object.keys(MAPS) as MapId[], 'desert'));
  const [mode, setMode] = useState<GameMode>(() => readChoice('tanks.mode', ['deathmatch', 'survival'] as const, 'deathmatch'));
  const [killLimit, setKillLimit] = useState(() => readChoice('tanks.kills', [3, 5, 8, 10, 15], 5));
  const [lives, setLives] = useState(() => readChoice('tanks.lives', [1, 2, 3, 5, 7], 3));
  const { moments, replayNotice, begin: beginRecording, finish: finishRecording } = useRecordedMoments('tanks');
  const [hud, setHud] = useState<HudState | null>(null);
  const [muted, setMuted] = useState(false);
  const [results, setResults] = useState<{ winner: number | null; tanks: HudTank[] } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const padState = usePadHost();
  const padBySlot = (slot: number) => padState.pads.find(p => p.slot === slot) ?? null;

  // Przejścia między ekranami bitwy idą pod kurtyną — bez twardych cutów.
  const curtain = useCurtain();
  // Konfiguracja bitwy jest powierzchnią interfejsu: bez tego pierwsze naciśnięcie
  // strzałki na tym ekranie nie miałoby od czego wystartować.
  const setupRoot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (screen !== 'setup') return;
    const active = document.activeElement;
    if (active instanceof HTMLElement && (active.closest('dialog') || setupRoot.current?.contains(active))) return;
    focusUiScope(setupRoot.current);
  }, [screen]);
  const goScreen = useCallback((next: Screen) => {
    curtain.begin(next === 'game' ? '#f59e0b' : '#f97316', () => setScreen(next));
  }, [curtain]);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<TankGame | null>(null);
  const screenRef = useRef(screen);
  /**
   * Migawka ustawień rundy czytana dokładnie w chwili uruchomienia silnika.
   * Dzięki refowi efekt zależy wyłącznie od ekranu — zmiana opcji w trakcie
   * rundy nie restartuje gry, ale start zawsze bierze bieżące ustawienia.
   * Refy aktualizują się w efekcie (nie w trakcie renderu), a kolejność
   * deklaracji PRZED efektem silnika gwarantuje świeżą migawkę na starcie.
   */
  const roundSetupRef = useRef({ players, mapId, mode, killLimit, lives, language });
  useEffect(() => {
    screenRef.current = screen;
    roundSetupRef.current = { players, mapId, mode, killLimit, lives, language };
  });

  // --- telefony jako pady: synchronizacja slotów / ekranu ---
  useEffect(() => {
    padHost.onSlotsChanged = (slots) => {
      // telefon zajmuje slot => gracz włączony i sterowany przez człowieka
      const names: Record<number, string> = {};
      slots.forEach((pad, i) => { if (pad) names[i] = pad.nick; });
      gameRef.current?.setPlayerNames(names);
      setPlayers(pl => pl.map((p, i) => slots[i]
        ? { ...p, name: slots[i]!.nick, enabled: true, isBot: false }
        : { ...p, name: PLAYER_DEFS[i].name }));
    };
    // Wejście w grę kasuje intencję wyjścia z poprzedniego podejścia — inaczej „Wróć do
    // biblioteki" kliknięte raz blokowałoby START także w następnej sesji.
    clearLeaveWish();
    padHost.onPauseRequest = () => { if (!isLeaving()) gameRef.current?.togglePause(); };
    return () => { padHost.onSlotsChanged = null; padHost.onPauseRequest = null; };
  }, []);
  useEffect(() => {
    padHost.setSlotMeta(players.map(p => ({ name: p.name, color: p.color, darkColor: p.darkColor })));
  }, [players]);
  useEffect(() => {
    if (screen === 'over') {
      const w = results?.tanks.find(t => t.id === results.winner);
      padHost.setScreen('over', { winnerSlot: results?.winner ?? null, winnerName: w?.name, winnerColor: w?.color });
      for (const t of results?.tanks ?? []) padHost.sendFx(t.id, t.id === results?.winner ? 'win' : 'lose');
    } else {
      padHost.setScreen(screen);
    }
  }, [screen, results]);

  // Muzyka menu: gra w menu Stalowego Frontu, cichnie na czas bitwy.
  useEffect(() => { menuMusic.setContext(screen === 'game' ? 'game' : 'menu'); }, [screen]);

  useEffect(() => {
    padHost.setMenuOptions(screen === 'setup' ? {
      revision: JSON.stringify([killLimit, lives, players.map(p => [p.enabled, p.isBot])]),
      primaryLabel: en ? 'MAP' : 'MAPA', primaryValue: localizedMap(mapId, language).name,
      secondaryLabel: en ? 'MODE' : 'TRYB', secondaryValue: mode === 'deathmatch' ? 'Deathmatch' : en ? 'Survival' : 'Przetrwanie',
    } : screen === 'menu' ? {
      primaryLabel: en ? 'MODE' : 'WYBÓR', primaryValue: (en ? ['Duel 1v1', 'Four-player battle', 'Bot training'] : ['Pojedynek 1v1', 'Bitwa 4 graczy', 'Trening z botami'])[menuChoice],
      secondaryLabel: en ? 'CONTROLS' : 'STEROWANIE', secondaryValue: en ? '← / → choose · Enter open' : '← / → wybierz · OK otwórz',
    } : undefined);
  }, [screen, mapId, mode, menuChoice, killLimit, lives, players, language, en]);

  useEffect(() => {
    remember('tanks.choice', menuChoice); remember('tanks.map', mapId); remember('tanks.mode', mode); remember('tanks.kills', killLimit); remember('tanks.lives', lives);
    players.forEach((p, i) => remember(`tanks.player.${i}`, !p.enabled ? 'off' : p.isBot ? 'bot' : 'human'));
  }, [menuChoice, mapId, mode, killLimit, lives, players]);

  const startGame = useCallback((quick?: { count: number; bots: number }) => {
    clearLeaveWish();
    remember('game', 'tanks');
    // Bitwa startuje pod kurtyną — menu chowa się, arena wstaje.
    curtain.begin('#f59e0b', () => {
      let cfg = players;
      if (quick) {
        cfg = PLAYER_DEFS.map((p, i) => ({
          ...p,
          enabled: i < quick.count,
          isBot: i >= quick.count - quick.bots && i < quick.count ? true : (i === 0 ? false : p.isBot),
        }));
        // ensure human players first
        cfg = cfg.map((p, i) => ({ ...p, isBot: i === 0 ? false : i < quick.count ? (i >= quick.count - quick.bots) : false }));
      }
      // sloty zajęte przez telefony zawsze grają jako ludzie
      const slots = padHost.slots();
      cfg = cfg.map((p, i) => slots[i]
        ? { ...p, name: slots[i]!.nick, enabled: true, isBot: false }
        : { ...p, name: PLAYER_DEFS[i].name });
      if (cfg !== players) setPlayers(cfg);
      setResults(null);
      setHud(null);
      setScreen('game');
    });
  }, [curtain, players]);

  /**
   * Tryb z menu: 0 = od razu pojedynek, 1/2 = konfiguracja. Wyodrębnione, bo wchodzi
   * i z dużego przycisku, i z `select` rzuconego „w pustkę" (fokus na `body`).
   */
  const confirmMenu = useCallback(() => {
    if (menuChoice === 0) { gameAudio.init(); startGame({ count: 2, bots: 0 }); return; }
    setPlayers(PLAYER_DEFS.map((player, i) => ({ ...player, enabled: menuChoice === 1 ? true : i < 3, isBot: menuChoice === 2 && i > 0 && i < 3 })));
    goScreen('setup');
  }, [goScreen, menuChoice, startGame]);

  // Wyjście do biblioteki jest decydujące i natychmiastowe: od tej chwili żadna komenda
   // (powtórzone `back`/`select` z pada, `Pauza` z HUD-u, `pause` z telefonu) nie ma prawa
   // tknąć pauzy — „Wróć do biblioteki" z otwartego okna pauzy odpauzowywało grę.
  const leave = useCallback(() => { wishToLeave(); onExit(); }, [onExit]);

  const handleRemote = useCallback((command: RemoteCommand) => {
    // Ruch po menu, konfiguracji i wynikach robi silnik interfejsu (`useUiControls`
    // + `focusSurface`) — on też mówi o tym Plamkowi. Tu zostaje to, czego interfejs
    // nie załatwia: pauza, wyjścia i zatwierdzenie bez fokusa na elemencie.
    const stage = screenRef.current;
    // Nakładka padów nad areną (PadHostPanel) nie jest <dialog>iem, więc silnik jej nie
    // domknie: pilot musi sam trafić w `back`/`pause` — inaczej Escape w bitwie pauzował
    // grę zamiast sprzątnąć panel. W menu `showPad` to `ConnectionsScreen` (modal) i tam
    // rządą zasady okienka, więc sprawdzamy, czy nic nie jest otwarte.
    if (showPad && (command === 'back' || command === 'pause') && !document.querySelector('dialog[open]')) { setShowPad(false); return; }
    if (showPad && stage === 'menu') { window.dispatchEvent(new CustomEvent('joypad-dialog-command', { detail: command })); return; }
    if (command === 'home') { leave(); return; }
    if (isLeaving()) return;
    if (command === 'pause' || (command === 'back' && stage === 'game')) { gameRef.current?.togglePause(); return; }
    if (command === 'back') {
      if (stage === 'menu') leave();
      // Z wyników wracamy tam, gdzie się je ustawiło — do konfiguracji, nie na sam początek.
      else if (stage === 'over') goScreen('setup');
      else if (stage === 'setup') goScreen('menu');
      return;
    }
    if (isLeaving()) return; // kurtyna w drodze do biblioteki: nic już nie startujemy
    if (command === 'select' || command === 'restart') {
      if (stage === 'menu' && command === 'select') confirmMenu();
      else if (stage === 'setup' && command === 'select') { gameAudio.init(); startGame(); }
      else if (stage === 'over') startGame();
    }
  }, [confirmMenu, goScreen, leave, showPad, startGame]);
  const lastRemote = useRef(0);
  useEffect(() => {
    if (remote && remote.id !== lastRemote.current) {
      lastRemote.current = remote.id;
      handleRemote(remote.command);
    }
  }, [remote, handleRemote]);
  // Klawiatura telewizora idzie tą samą drogą co pad: `uiControl` słucha w fazie
  // przechwytującej i sam wygasza zdarzenie, więc własny nasłuch tylko dublowałby
  // ruch i kasował fokus postawiony przez nawigację.

  // engine lifecycle
  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { players, mapId, mode, killLimit, lives, language: roundLanguage } = roundSetupRef.current;
    const recording = beginRecording(roundLanguage);
    const t = setTimeout(() => {
      gameAudio.init();
      const recorder = recording.events;
      recorder.observe({ timeLeft: TIME_LIMIT_S, countdown: 3, paused: false, players: players.filter(p => p.enabled).map((p) => ({ slot: p.id, name: p.name, color: p.color, score: 0 })) });
      const game = new TankGame(canvas, {
        players,
        mapId,
        mode,
        killLimit,
        lives,
        timeLimit: TIME_LIMIT_S,
        language: roundLanguage,
        onFrame: recording.video.frame,
        onHud: (h) => { recording.video.setPaused(h.paused || h.countdown > 0); recorder.observe({ ...h, players: h.tanks.map(t => ({ slot: t.id, name: t.name, color: t.color, score: t.kills })) }); if (screenRef.current === 'game') setHud(h); },
        onKill: (event) => { if (event.killer !== event.victim) recorder.record({ kind: 'kill', slot: event.killer, title: roundLanguage === 'en' ? 'Target eliminated' : 'Cel wyeliminowany', detail: roundLanguage === 'en' ? `${event.killerName} eliminates ${event.victimName}.` : `${event.killerName} eliminuje ${event.victimName}.`, at: event.time, weight: 58 }); },
        padInputs: padHost.inputs,
        onPadFx: (slot, fx) => { recorder.fx(slot, fx); padHost.sendFx(slot, fx); },
        onPadHud: (slot, t, h) => padHost.sendHud(slot, {
          t: 'hud', hp: t.hp, maxHp: t.maxHp, alive: t.alive, kills: t.kills, deaths: t.deaths, lives: t.lives,
          respawn: t.respawn, countdown: h.countdown, paused: h.paused, timeLeft: h.timeLeft,
          shield: t.shield > 0, rapid: t.rapid, big: t.big, speed: t.speed, mode: h.mode,
        }),
        onGameOver: (winner, tanks) => {
          finishRecording(recording);
          setResults({ winner, tanks });
          setScreen('over');
        },
      });
      gameRef.current = game;
      game.start();
    }, 60);
    return () => {
      clearTimeout(t);
      if (!recording.finished) recording.video.dispose();
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [screen, beginRecording, finishRecording]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    gameAudio.init();
    gameAudio.setMuted(m);
  };


  const enabledCount = players.filter(p => p.enabled).length;
  const canStart = enabledCount >= 2;

  /* ============ MENU ============ */
  if (screen === 'menu') return <>
    <GameSetup info={info} music={menuMusicOn} onMusic={() => toggleMenuMusic(!menuMusicOn)} onExit={leave} onStart={confirmMenu} onPads={() => setShowPad(true)} startLabel={menuChoice === 0 ? (en ? 'Start duel' : 'Rozpocznij pojedynek') : (en ? 'Configure match' : 'Dopasuj rozgrywkę')} navigationHint={en ? '← → / ↑ ↓ Choose a mode · Enter confirm' : '← → / ↑ ↓ Wybierz tryb · Enter zatwierdź'}
      hint={en ? 'Left stick drives the tank; right stick aims the turret. Use cover and ricochets.' : 'Lewy joystick prowadzi czołg, prawy celuje wieżą. Wykorzystuj osłony i rykoszety.'} win={en ? 'Reach the kill limit or outlast the opposing tanks.' : 'Zdobądź ustaloną liczbę fragów lub przetrwaj przeciwników.'}>
      <div className="cine-tank-modes" role="group" aria-label={en ? 'Battle mode' : 'Tryb bitwy'}>
        {[
          { title: en ? 'Duel 1v1' : 'Pojedynek 1v1', detail: en ? 'Two players. One winner.' : 'Dwóch graczy. Jeden zwycięzca.', tag: en ? 'QUICK START' : 'SZYBKI START', icon: <Users size={23} /> },
          { title: en ? 'Four-player battle' : 'Bitwa 4 graczy', detail: en ? 'The whole crew on one battlefield.' : 'Cała ekipa na jednym polu bitwy.', tag: en ? 'SHARED ARENA' : 'WSPÓLNA ARENA', icon: <Flame size={23} /> },
          { title: en ? 'Bot training' : 'Trening z botami', detail: en ? 'Learn the map. Sharpen your aim.' : 'Poznaj teren. Dopracuj celność.', tag: en ? 'YOU + 2 BOTS' : 'TY + 2 BOTY', icon: <Bot size={23} /> },
        ].map((choice, index) => <button key={choice.title} aria-pressed={menuChoice === index} onFocus={() => setMenuChoice(index)} onClick={() => { setMenuChoice(index); gameAudio.uiClick(); }}><span>{choice.icon}<small>0{index + 1}</small></span><small>{choice.tag}</small><h3>{choice.title}</h3><p>{choice.detail}</p><i /></button>)}
        <button className="cine-full-config" onClick={() => goScreen('setup')}><Settings2 size={16} /> {en ? 'Full battle setup' : 'Pełna konfiguracja bitwy'}</button>
      </div>
    </GameSetup>
    {showPad && <ConnectionsScreen onClose={() => setShowPad(false)} />}
    <ScreenCurtain state={curtain.state} />
  </>;

  /* ============ SETUP ============ */
  if (screen === 'setup') {
    return (
      <>
      <div data-ui-scope="tank-setup" data-ui-focus="[data-ui-entry]" ref={setupRoot} className="cine-tank-setup relative min-h-screen bg-[var(--os-bg)] text-white">
        <div className="hazard-stripes h-2 w-full opacity-80" />
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <div className="flex items-center justify-between">
            <button onClick={() => goScreen('menu')} className="press flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-white/10">
              <Home className="h-4 w-4" /> {en ? 'MENU' : 'MENU'}
            </button>
            <h2 className="font-display text-2xl tracking-wide text-orange-400 sm:text-3xl">{en ? 'BATTLE SETUP' : 'KONFIGURACJA BITWY'}</h2>
            <button onClick={leave} className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-300 hover:text-orange-300"><Home className="h-4 w-4" /> <span className="hidden sm:inline">JOYPAD</span></button>
          </div>

          {/* phones as pads */}
          <div className="mt-6 rise-in" style={{ animationDelay: '60ms' }}>
            <PadHostPanel players={players} />
            <ReadyStatus />
          </div>

          {/* players */}
          <div className="rise-in mt-6" style={{ animationDelay: '110ms' }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-400"><Users className="h-4 w-4" /> {en ? 'PLAYERS (min. 2)' : 'GRACZE (min. 2)'}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {players.map((p) => (
                <div
                  key={p.id}
                  className={`metal-panel rivet rounded-2xl p-4 transition-all ${p.enabled ? '' : 'opacity-50 grayscale'}`}
                  style={p.enabled ? { borderTop: `3px solid ${p.color}` } : {}}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-bold" style={{ color: p.enabled ? p.color : '#71717a' }}>{p.name}</span>
                    <button
                      onClick={() => setPlayers(pl => pl.map(x => x.id === p.id ? { ...x, enabled: !x.enabled } : x))}
                      className={`relative h-6 w-11 rounded-full transition-colors ${p.enabled ? 'bg-green-600' : 'bg-zinc-700'}`}
                    >
                      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${p.enabled ? 'left-[22px]' : 'left-0.5'}`} />
                    </button>
                  </div>
                  {p.id !== 0 && p.enabled && (
                    <button
                      onClick={() => setPlayers(pl => pl.map(x => x.id === p.id ? { ...x, isBot: !x.isBot } : x))}
                      className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold transition-all ${p.isBot ? 'border-orange-500/50 bg-orange-500/15 text-orange-300' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                    >
                      {p.isBot ? <><Bot className="h-3.5 w-3.5" /> {en ? 'BOT (AI)' : 'BOT (SI)'}</> : <><Gamepad2 className="h-3.5 w-3.5" /> {en ? 'HUMAN' : 'CZŁOWIEK'}</>}
                    </button>
                  )}
                  {p.id === 0 && <div className="mt-2 rounded-lg bg-white/5 px-2 py-1.5 text-center text-xs font-bold text-zinc-400">{en ? 'HUMAN (always)' : 'CZŁOWIEK (zawsze)'}</div>}
                  {padBySlot(p.id) && (
                    <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-green-500/40 bg-green-500/10 px-2 py-1.5 text-xs font-bold text-green-300">
                      <Smartphone className="h-3.5 w-3.5" /> {padBySlot(p.id)!.nick}
                    </div>
                  )}
                  {/* controls */}
                  <div className={`mt-3 space-y-1.5 text-[11px] ${!p.enabled || p.isBot ? 'pointer-events-none opacity-30' : ''}`}>
                    <div className="grid grid-cols-[52px_1fr] items-center gap-1">
                      <span className="text-zinc-500">{en ? 'Drive' : 'Jazda'}</span>
                      <div className="flex gap-1"><KeyCap>{p.controlLabels.forward}</KeyCap><KeyCap>{p.controlLabels.back}</KeyCap><KeyCap>{p.controlLabels.left}</KeyCap><KeyCap>{p.controlLabels.right}</KeyCap></div>
                    </div>
                    <div className="grid grid-cols-[52px_1fr] items-center gap-1">
                      <span className="text-zinc-500">{en ? 'Fire' : 'Ogień'}</span>
                      <div><KeyCap fire>{p.controlLabels.fire}</KeyCap></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* maps */}
          <div className="rise-in mt-6" style={{ animationDelay: '190ms' }}>
            <div className="mb-3 flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-400"><Target className="h-4 w-4" /> {en ? 'ARENA' : 'ARENA'}</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(Object.keys(MAPS) as MapId[]).map((id) => {
                const m = MAPS[id];
                const mapCopy = localizedMap(id, language);
                const active = mapId === id;
                return (
                  <button
                    key={id}
                    onClick={() => { gameAudio.init(); gameAudio.uiClick(); setMapId(id); }}
                    className={`overflow-hidden rounded-2xl border-2 text-left transition-all hover:scale-[1.01] ${active ? 'border-orange-400 shadow-[0_0_30px_rgba(251,191,36,0.25)]' : 'border-white/10'}`}
                  >
                    <div className="relative h-24 overflow-hidden">
                      <MapThumb map={id} className="absolute inset-0 h-full w-full" />
                      <div className="absolute inset-x-3 bottom-2 flex gap-1">
                        {m.night && <span className="flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-indigo-300 backdrop-blur-sm"><Moon className="h-3 w-3" /> {en ? 'NIGHT' : 'NOC'}</span>}
                        {m.weather === 'rain' && <span className="flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-sky-300 backdrop-blur-sm"><CloudRain className="h-3 w-3" /> {en ? 'RAIN' : 'DESZCZ'}</span>}
                        {m.weather === 'dust' && <span className="flex items-center gap-1 rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-orange-300 backdrop-blur-sm"><Wind className="h-3 w-3" /> {en ? 'DUST' : 'PYŁ'}</span>}
                      </div>
                    </div>
                    <div className="bg-zinc-900 p-3">
                      <div className="font-bold">{mapCopy.name}</div>
                      <div className="mt-0.5 text-xs leading-snug text-zinc-400">{mapCopy.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* mode + rules */}
          <div className="rise-in mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2" style={{ animationDelay: '270ms' }}>
            <div className="metal-panel rounded-2xl p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-400"><Trophy className="h-4 w-4" /> {en ? 'GAME MODE' : 'TRYB GRY'}</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { gameAudio.uiClick(); setMode('deathmatch'); }}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${mode === 'deathmatch' ? 'border-orange-400 bg-orange-500/10' : 'border-white/10 bg-white/[0.03]'}`}
                >
                  <Crosshair className="h-5 w-5 text-orange-400" />
                  <div className="mt-1 font-bold">Deathmatch</div>
                  <div className="text-[11px] text-zinc-400">{en ? 'First to the kill limit wins. Unlimited respawns.' : 'Kto pierwszy zdobędzie limit fragów. Odrodzenia bez limitu.'}</div>
                </button>
                <button
                  onClick={() => { gameAudio.uiClick(); setMode('survival'); }}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${mode === 'survival' ? 'border-red-400 bg-red-500/10' : 'border-white/10 bg-white/[0.03]'}`}
                >
                  <Skull className="h-5 w-5 text-red-400" />
                  <div className="mt-1 font-bold">{en ? 'Survival' : 'Przetrwanie'}</div>
                  <div className="text-[11px] text-zinc-400">{en ? 'Limited lives. The last tank standing wins.' : 'Ograniczona liczba żyć. Ostatni czołg na placu wygrywa.'}</div>
                </button>
              </div>
            </div>
            <div className="metal-panel rounded-2xl p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-400"><Timer className="h-4 w-4" /> {en ? 'RULES' : 'ZASADY'}</div>
              {mode === 'deathmatch' ? (
                <div>
                  <div className="mb-2 text-sm text-zinc-300">{en ? 'Kill limit:' : 'Limit fragów:'} <b className="text-orange-400">{killLimit}</b></div>
                  <SegmentedControl
                    options={([3, 5, 8, 10, 15] as const).map(v => ({ value: String(v), label: String(v) }))}
                    value={String(killLimit)}
                    onChange={v => setKillLimit(Number(v))}
                    accent="#fbbf24"
                    label={en ? 'Kill limit' : 'Limit fragów'}
                  />
                </div>
              ) : (
                <div>
                  <div className="mb-2 text-sm text-zinc-300">{en ? 'Lives:' : 'Liczba żyć:'} <b className="text-red-400">{lives}</b></div>
                  <SegmentedControl
                    options={([1, 2, 3, 5, 7] as const).map(v => ({ value: String(v), label: String(v) }))}
                    value={String(lives)}
                    onChange={v => setLives(Number(v))}
                    accent="#f87171"
                    label={en ? 'Lives' : 'Liczba żyć'}
                  />
                </div>
              )}
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/5 p-2.5 text-[11px] text-zinc-400">
                <Info className="h-4 w-4 shrink-0 text-orange-400" />
                {en ? 'Time limit: 5 minutes. Ties go to the player with the most kills. Shells ricochet once — watch your own shots!' : 'Limit czasu: 5 minut. Przy remisie wygrywa gracz z największą liczbą fragów. Pociski rykoszetują raz — uważaj na własne odbicia!'}
              </div>
            </div>
          </div>

          <div className="rise-in mt-6 flex flex-col items-center gap-2" style={{ animationDelay: '350ms' }}>
            <button
              data-ui-entry
              onClick={() => { if (canStart) { gameAudio.init(); gameAudio.uiClick(); startGame(); } }}
              disabled={!canStart}
              className={`flex items-center gap-3 rounded-2xl px-12 py-4 text-xl font-black tracking-widest transition-all ${canStart ? 'bg-gradient-to-b from-orange-400 to-orange-600 text-black shadow-[0_0_40px_rgba(251,146,60,0.4)] hover:scale-105' : 'cursor-not-allowed bg-zinc-800 text-zinc-500'}`}
            >
              <Play className="h-6 w-6 fill-current" /> {en ? 'BATTLE!' : 'DO BOJU!'}
            </button>
            {!canStart && <div className="text-sm font-bold text-red-400">{en ? 'Enable at least 2 players!' : 'Włącz minimum 2 graczy!'}</div>}
            <div className="text-xs text-zinc-500">{en ? 'Active: ' : 'Włączono: '}{enabledCount} {en ? 'players' : 'graczy'} • {en ? 'Pause' : 'Pauza'}: P / ESC</div>
          </div>
        </div>
      </div>
      <ScreenCurtain state={curtain.state} />
      </>
    );
  }

  /* ============ GAME OVER ============ */
  if (screen === 'over' && results) {
    const winner = results.tanks.find(t => t.id === results.winner);
    const sorted = [...results.tanks].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return <>
      <GameResults replayNotice={replayNotice} moments={moments} info={info} title={winner ? winner.name : (en ? 'Draw.' : 'Remis.')} subtitle={winner ? `${winner.kills} ${en ? 'kills. The battlefield is yours.' : 'fragów. Pole bitwy należy do Ciebie.'}` : (en ? 'No tank took control of the battlefield.' : 'Żaden czołg nie zdominował pola bitwy.')} winnerSlot={results.winner ?? null} scoreLabel={en ? 'KILLS' : 'FRAGI'}
        players={sorted.map(t => ({ slot: t.id, name: t.name, color: t.color, score: t.kills, detail: `${t.deaths} ${en ? 'deaths' : 'zgonów'} · K/D ${(t.kills / Math.max(1, t.deaths)).toFixed(2)}${mode === 'survival' ? ` · ${t.lives} ${en ? 'lives' : 'żyć'}` : ''}` }))}
        onRestart={() => startGame()} onSettings={() => goScreen('setup')} onMenu={() => goScreen('menu')} onExit={leave} />
      <ScreenCurtain state={curtain.state} />
    </>;
  }

  /* ============ GAME ============ */
  // Ekran rundy składa się z tych samych klocków co pozostałe gry (`RoundChrome`),
  // więc czołgi nie są już „osobną aplikacją”: pasek, karty, nakładki i pasek klawiszy
  // mają powierzchnie, typografię i kolory JoyPada, a gra dokłada tylko swój akcent,
  // informacje o stanie czołgu (HP, fragi, bonusy) i rasę CRT na samej arenie.
  const tanks = hud?.tanks ?? [];
  const half = Math.ceil(tanks.length / 2);
  return (
    <>
    <RoundFrame accent={info.accent} soft={info.accentSoft}>
      <RoundTopBar
        center={<RoundTimer seconds={hud?.timeLeft ?? TIME_LIMIT_S} urgent={(hud?.timeLeft ?? 99) < 30} icon={<Timer size={15} />} />}
        actions={<>
          <RoundIconButton label={en ? 'Phone controllers' : 'Telefon jako kontroler'} onClick={() => setShowPad(v => !v)} active={showPad} badge={padState.pads.length || undefined}><Smartphone size={17} /></RoundIconButton>
          <RoundIconButton label={en ? 'Controls' : 'Sterowanie'} onClick={() => setShowHelp(h => !h)} active={showHelp}><Keyboard size={17} /></RoundIconButton>
          <RoundIconButton label={muted ? (en ? 'Turn sound on' : 'Włącz dźwięk') : (en ? 'Mute' : 'Wycisz')} onClick={toggleMute}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</RoundIconButton>
          <RoundIconButton label={en ? 'Pause (P)' : 'Pauza (P)'} onClick={() => gameRef.current?.togglePause()}>{hud?.paused ? <Play size={17} /> : <Pause size={17} />}</RoundIconButton>
          <RoundIconButton label={en ? 'End battle and return to setup' : 'Zakończ bitwę i wróć do ustawień'} onClick={() => { gameAudio.uiClick(); goScreen('setup'); }} tone="danger"><Home size={17} /></RoundIconButton>
          <RoundIconButton label={en ? 'Back to JoyPad' : 'Wróć do JoyPad'} onClick={leave} tone="accent"><Gamepad2 size={17} /></RoundIconButton>
        </>}>
        <RoundTitle>{info.title}</RoundTitle>
        <RoundChip optional>{localizedMap(mapId, language).name}</RoundChip>
        <RoundChip tone={mode === 'survival' ? 'danger' : 'accent'} optional icon={mode === 'survival' ? <Heart size={12} /> : <Crosshair size={12} />}>{mode === 'deathmatch' ? `${killLimit} ${en ? 'KILLS' : 'FRAGÓW'}` : `${lives} ${en ? 'LIVES' : 'ŻYĆ'}`}</RoundChip>
      </RoundTopBar>

      <div className="relative flex min-h-0 flex-1">
        <RoundSide side="left">
          {tanks.slice(0, half).map(t => <PlayerCard key={t.id} t={t} mode={mode} killLimit={killLimit} phone={padBySlot(t.id)?.nick} language={language} />)}
          <RoundInfoCard title={en ? 'TACTICS' : 'TAKTYKA'} icon={<Lightbulb size={12} />}>
            {en ? <>Ricochet shots off walls to hit enemies around corners. Collect <b>power-ups</b> — a shield can save you. Reverse + turn for a quick dodge.</> : <>Strzelaj w ściany, by rykoszetem trafić wroga za rogiem. Zbieraj <b>power-upy</b> — tarcza ratuje życie. Cofanie + skręt = szybki unik.</>}
          </RoundInfoCard>
        </RoundSide>

        <RoundArena crt>
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ width: '100%', height: '100%' }} aria-label={en ? 'Steel Front battlefield' : 'Pole bitwy Stalowego Frontu'} />
          <RoundFeed items={(hud?.killFeed ?? []).map(k => ({ id: k.id, icon: <Skull size={12} />, killer: k.killerName === '—' ? '💥' : k.killerName, separator: <Crosshair size={12} />, victim: k.victimName }))} />
          <RoundMini players={tanks.map(t => ({ id: t.id, name: t.name, color: t.color, score: <><Skull size={9} /> {t.kills}</>, value: t.hp, maxValue: t.maxHp }))} />

          {hud?.paused && <PauseSheet game={info.title} onResume={() => { if (!isLeaving()) gameRef.current?.togglePause(); }} onExit={leave} />}

          {showPad && <RoundOverlay onClose={() => setShowPad(false)}><PadHostPanel players={players} onClose={() => setShowPad(false)} /></RoundOverlay>}

          {showHelp && (
            <RoundOverlay wide onClose={() => setShowHelp(false)}>
              <RoundOverlayGrid>
                {players.filter(p => p.enabled && !p.isBot).map(p => (
                  <RoundInfoCard key={p.id} title={<>{p.name}{padBySlot(p.id) && <RoundPhoneTag icon={<Smartphone size={11} />}>{padBySlot(p.id)!.nick}</RoundPhoneTag>}</>} color={p.color}>
                    <RoundHelpRow label={en ? 'Forward / Reverse' : 'Przód / Tył'}><KeyCap>{p.controlLabels.forward}</KeyCap><KeyCap>{p.controlLabels.back}</KeyCap></RoundHelpRow>
                    <RoundHelpRow label={en ? 'Turn left / right' : 'Obrót w lewo / prawo'}><KeyCap>{p.controlLabels.left}</KeyCap><KeyCap>{p.controlLabels.right}</KeyCap></RoundHelpRow>
                    <RoundHelpRow label={en ? 'FIRE' : 'OGIEŃ'} labelColor="var(--os-danger)" keys={false}><KeyCap fire>{p.controlLabels.fire}</KeyCap></RoundHelpRow>
                  </RoundInfoCard>
                ))}
                <RoundInfoCard title={<><Pause size={12} /> {en ? 'PAUSE' : 'PAUZA'}</>} accent span bodyRow>
                  <span><KeyCap>P</KeyCap> {en ? 'or' : 'lub'} <KeyCap>ESC</KeyCap> — {en ? 'The turret follows your hull when not aiming. Shells ricochet once. Collect green power-up crates!' : 'Wieżyczka podąża za kadłubem. Pociski rykoszetują raz od ścian. Zbieraj zielone skrzynki z bonusami!'}</span>
                </RoundInfoCard>
              </RoundOverlayGrid>
            </RoundOverlay>
          )}
        </RoundArena>

        <RoundSide side="right">
          {tanks.slice(half).map(t => <PlayerCard key={t.id} t={t} mode={mode} killLimit={killLimit} phone={padBySlot(t.id)?.nick} language={language} />)}
          <RoundInfoCard title={en ? 'POWER-UPS' : 'BONUSY'} icon={<Package size={12} />}>
            <RoundInfoRow mark="+">{en ? 'Repair +50 HP' : 'Naprawa +50 HP'}</RoundInfoRow>
            <RoundInfoRow mark="◈">{en ? 'Shield 10 s' : 'Tarcza 10 s'}</RoundInfoRow>
            <RoundInfoRow mark="≋">{en ? 'Rapid fire' : 'Szybkostrzelność'}</RoundInfoRow>
            <RoundInfoRow mark="●">{en ? 'Heavy shell' : 'Ciężki pocisk'}</RoundInfoRow>
            <RoundInfoRow mark="»">{en ? 'Turbo 12 s' : 'Turbo 12 s'}</RoundInfoRow>
          </RoundInfoCard>
        </RoundSide>
      </div>

      <RoundKeys hint={`P = ${en ? 'pause' : 'pauza'}`}>
        {players.filter(p => p.enabled && !p.isBot).map(p => (
          <RoundKeyGroup key={p.id} color={p.color} name={p.name}>
            {padBySlot(p.id)
              ? <RoundPhoneTag icon={<Smartphone size={11} />}>{padBySlot(p.id)!.nick}</RoundPhoneTag>
              : <><KeyCap>{p.controlLabels.forward}</KeyCap><KeyCap>{p.controlLabels.back}</KeyCap><KeyCap>{p.controlLabels.left}</KeyCap><KeyCap>{p.controlLabels.right}</KeyCap><KeyCap fire>{p.controlLabels.fire}</KeyCap></>}
          </RoundKeyGroup>
        ))}
      </RoundKeys>
    </RoundFrame>
    <ScreenCurtain state={curtain.state} />
    </>
  );
}
