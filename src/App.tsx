import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Trophy, Play, Users, Bot, Volume2, VolumeX, Pause, RotateCcw, Home,
  Crosshair, Shield, Zap, Wind, Skull, Timer, Gamepad2, ChevronRight,
  Flame, Target, Heart, Sparkles, Keyboard, Info, Crown, Swords,
} from 'lucide-react';
import { TankGame, type HudState, type HudTank } from './game/engine';
import { PLAYER_DEFS, type GameMode, type MapId, type PlayerConfig } from './game/types';
import { MAPS } from './game/maps';
import { gameAudio } from './game/audio';
import { menuMusic } from './game/menuMusic';
import { padHost } from './net/padHost';
import type { RemoteCommand, RemoteEvent } from './net/protocol';
import { PadHostPanel, usePadHost } from './pad/PadHostPanel';
import { Smartphone } from 'lucide-react';

type Screen = 'menu' | 'setup' | 'game' | 'over';

const MAP_ICONS: Record<MapId, string> = { desert: '🏜️', nightcity: '🌃', forest: '🌲' };
/** Czas rundy w sekundach (stała — niezmienny limit w konfiguracji gry). */
const TIME_LIMIT_S = 300;

function KeyCap({ children, color = '#27272a' }: { children: React.ReactNode; color?: string }) {
  return (
    <span
      className="keycap inline-flex min-w-[26px] items-center justify-center rounded-md border border-white/15 px-1.5 py-1 text-[11px] font-bold text-white"
      style={{ background: `linear-gradient(180deg, ${color}, #131316)` }}
    >
      {children}
    </span>
  );
}

function PlayerCard({ t, mode, killLimit, phone }: { t: HudTank; mode: GameMode; killLimit: number; phone?: string | null }) {
  const hpPct = (t.hp / t.maxHp) * 100;
  return (
    <div
      className={`relative overflow-hidden rounded-xl border bg-black/60 backdrop-blur-sm transition-all ${t.alive ? 'border-white/15' : 'border-red-500/50 opacity-70'}`}
      style={{ boxShadow: t.alive ? `0 0 18px ${t.color}33` : undefined }}
    >
      <div className="h-1 w-full" style={{ background: t.color }} />
      <div className="p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            {t.isBot ? <Bot className="h-3.5 w-3.5 text-zinc-400" /> : phone ? <Smartphone className="h-3.5 w-3.5 text-green-400" /> : <Gamepad2 className="h-3.5 w-3.5 text-zinc-400" />}
            <span className="text-xs font-bold tracking-wide" style={{ color: t.color }}>{t.name}</span>
          </div>
          <div className="flex items-center gap-2 text-[11px] font-bold text-zinc-300">
            <span className="flex items-center gap-0.5"><Skull className="h-3 w-3" />{t.kills}</span>
            {mode === 'survival' ? (
              <span className="flex items-center gap-0.5"><Heart className="h-3 w-3 text-red-400" />{t.lives}</span>
            ) : (
              <span className="text-zinc-500">/ {killLimit}</span>
            )}
          </div>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{
              width: `${hpPct}%`,
              background: hpPct > 50 ? 'linear-gradient(90deg,#16a34a,#4ade80)' : hpPct > 25 ? 'linear-gradient(90deg,#d97706,#fbbf24)' : 'linear-gradient(90deg,#b91c1c,#ef4444)',
            }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between">
          <span className="font-mono2 text-[10px] text-zinc-400">{t.alive ? `${t.hp} HP` : t.respawn > 0 ? `RESPAWN ${t.respawn.toFixed(1)}s` : 'ELIMINACJA'}</span>
          <div className="flex gap-1">
            {t.rapid && <span title="Szybkostrzelność"><Zap className="h-3 w-3 text-amber-400" /></span>}
            {t.big && <span title="Ciężki pocisk"><Crosshair className="h-3 w-3 text-red-400" /></span>}
            {t.speed && <span title="Turbo"><Wind className="h-3 w-3 text-sky-400" /></span>}
            {t.shield > 0 && <span title="Tarcza"><Shield className="h-3 w-3 text-cyan-300" /></span>}
          </div>
        </div>
        {mode === 'deathmatch' && (
          <div className="mt-1 flex gap-0.5">
            {Array.from({ length: killLimit }).map((_, i) => (
              <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i < t.kills ? t.color : '#27272a' }} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TankApp({ onExit, remote }: { onExit: () => void; remote: RemoteEvent | null }) {
  const [screen, setScreen] = useState<Screen>('menu');
  const [menuChoice, setMenuChoice] = useState(0);
  const [players, setPlayers] = useState<PlayerConfig[]>(() => PLAYER_DEFS.map((p, i) => padHost.padForSlot(i) ? { ...p, enabled: true, isBot: false } : p));
  const [mapId, setMapId] = useState<MapId>('desert');
  const [mode, setMode] = useState<GameMode>('deathmatch');
  const [killLimit, setKillLimit] = useState(5);
  const [lives, setLives] = useState(3);
  const [hud, setHud] = useState<HudState | null>(null);
  const [muted, setMuted] = useState(false);
  const [results, setResults] = useState<{ winner: number | null; tanks: HudTank[] } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [showPad, setShowPad] = useState(false);
  const padState = usePadHost();
  const padBySlot = (slot: number) => padState.pads.find(p => p.slot === slot) ?? null;

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
  const roundSetupRef = useRef({ players, mapId, mode, killLimit, lives });
  useEffect(() => {
    screenRef.current = screen;
    roundSetupRef.current = { players, mapId, mode, killLimit, lives };
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
    padHost.onPauseRequest = () => gameRef.current?.togglePause();
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
      primaryLabel: 'MAPA', primaryValue: MAPS[mapId].name,
      secondaryLabel: 'TRYB', secondaryValue: mode === 'deathmatch' ? 'Deathmatch' : 'Przetrwanie',
    } : screen === 'menu' ? {
      primaryLabel: 'WYBÓR', primaryValue: ['Pojedynek 1v1', 'Bitwa 4 graczy', 'Trening z botami'][menuChoice],
      secondaryLabel: 'STEROWANIE', secondaryValue: '← / → wybierz · OK otwórz',
    } : undefined);
  }, [screen, mapId, mode, menuChoice]);

  const startGame = useCallback((quick?: { count: number; bots: number }) => {
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
  }, [players]);

  const handleRemote = useCallback((command: RemoteCommand) => {
    const stage = screenRef.current;
    if (command === 'home' || (command === 'back' && stage === 'menu')) { onExit(); return; }
    if (command === 'pause' || (command === 'back' && stage === 'game')) { gameRef.current?.togglePause(); return; }
    if (stage === 'menu') {
      if (command === 'left' || command === 'up') setMenuChoice(i => (i + 2) % 3);
      if (command === 'right' || command === 'down') setMenuChoice(i => (i + 1) % 3);
      if (command === 'select') {
        if (menuChoice === 0) { gameAudio.init(); startGame({ count: 2, bots: 0 }); }
        else {
          setPlayers(PLAYER_DEFS.map((p, i) => ({ ...p, enabled: menuChoice === 1 ? true : i < 3, isBot: menuChoice === 2 && i > 0 && i < 3 })));
          setScreen('setup');
        }
      }
    } else if (stage === 'setup') {
      const maps = Object.keys(MAPS) as MapId[];
      if (command === 'left' || command === 'right') setMapId(id => maps[(maps.indexOf(id) + (command === 'right' ? 1 : maps.length - 1)) % maps.length]);
      if (command === 'up' || command === 'down') setMode(m => m === 'deathmatch' ? 'survival' : 'deathmatch');
      if (command === 'select') { gameAudio.init(); startGame(); }
      if (command === 'back') setScreen('menu');
    } else if (stage === 'over') {
      if (command === 'select' || command === 'restart') startGame();
      if (command === 'back') setScreen('setup');
    }
  }, [menuChoice, onExit, startGame]);

  const lastRemote = useRef(0);
  useEffect(() => {
    if (remote && remote.id !== lastRemote.current) {
      lastRemote.current = remote.id;
      handleRemote(remote.command);
    }
  }, [remote, handleRemote]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (screenRef.current === 'game' || e.target instanceof HTMLInputElement) return;
      const keys: Record<string, RemoteCommand> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'select', Escape: 'back' };
      if (keys[e.code]) { e.preventDefault(); handleRemote(keys[e.code]); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleRemote]);

  // engine lifecycle
  useEffect(() => {
    if (screen !== 'game') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { players, mapId, mode, killLimit, lives } = roundSetupRef.current;
    const t = setTimeout(() => {
      gameAudio.init();
      const game = new TankGame(canvas, {
        players,
        mapId,
        mode,
        killLimit,
        lives,
        timeLimit: TIME_LIMIT_S,
        onHud: (h) => { if (screenRef.current === 'game') setHud(h); },
        onKill: () => {},
        padInputs: padHost.inputs,
        onPadFx: (slot, fx) => padHost.sendFx(slot, fx),
        onPadHud: (slot, t, h) => padHost.sendHud(slot, {
          t: 'hud', hp: t.hp, maxHp: t.maxHp, alive: t.alive, kills: t.kills, deaths: t.deaths, lives: t.lives,
          respawn: t.respawn, countdown: h.countdown, paused: h.paused, timeLeft: h.timeLeft,
          shield: t.shield > 0, rapid: t.rapid, big: t.big, speed: t.speed, mode: h.mode,
        }),
        onGameOver: (winner, tanks) => {
          setResults({ winner, tanks });
          setScreen('over');
        },
      });
      gameRef.current = game;
      game.start();
    }, 60);
    return () => {
      clearTimeout(t);
      gameRef.current?.destroy();
      gameRef.current = null;
    };
  }, [screen]);

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    gameAudio.init();
    gameAudio.setMuted(m);
  };

  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  const enabledCount = players.filter(p => p.enabled).length;
  const canStart = enabledCount >= 2;

  /* ============ MENU ============ */
  if (screen === 'menu') {
    return (
      <div className="relative flex min-h-screen flex-col overflow-hidden bg-[#0a0a0b] text-white">
        {/* animated bg */}
        <div className="pointer-events-none absolute inset-0">
          <img src={`${import.meta.env.BASE_URL}images/menu-tanks.webp`} alt="" width={1280} height={720} className="absolute inset-0 h-full w-full object-cover opacity-25" />
          <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a0b]/70 via-[#0a0a0b]/55 to-[#0a0a0b]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(251,146,60,0.12),transparent_50%),radial-gradient(ellipse_at_70%_80%,rgba(56,189,248,0.10),transparent_50%)]" />
          <div className="hazard-stripes absolute left-0 right-0 top-0 h-2 opacity-80" />
          <div className="hazard-stripes absolute bottom-0 left-0 right-0 h-2 opacity-80" />
          {/* animated grid */}
          <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
          {/* floating embers */}
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-orange-500/60"
              style={{
                width: 3 + (i % 3), height: 3 + (i % 3),
                left: `${(i * 41) % 100}%`, bottom: '-10px',
                animation: `floatUp ${5 + (i % 5)}s linear ${i * 0.4}s infinite`,
                filter: 'blur(0.5px)',
              }}
            />
          ))}
          <style>{`@keyframes floatUp { to { transform: translateY(-110vh); opacity: 0; } }`}</style>
        </div>

        <button onClick={onExit} className="absolute left-4 top-5 z-30 flex items-center gap-2 rounded-lg border border-white/20 bg-black/60 px-3 py-2 text-xs font-bold text-zinc-200 transition hover:border-amber-400/50 hover:text-amber-300 sm:left-8"><Home size={15} /> WRÓĆ DO JOYPAD</button>
        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col items-center justify-center px-4 py-16 sm:py-10">
          <div className="mb-4 flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-bold tracking-[0.25em] text-amber-400">
            <Swords className="h-3.5 w-3.5" /> LOKALNY MULTIPLAYER • KLAWIATURA LUB TELEFONY • 2–4 GRACZY
          </div>
          <h1 className="font-display text-center text-6xl leading-none tracking-wide sm:text-8xl">
            <span className="bg-gradient-to-b from-amber-200 via-amber-400 to-orange-700 bg-clip-text text-transparent drop-shadow-[0_4px_20px_rgba(251,146,60,0.35)]">STALOWY</span>
            <br />
            <span className="bg-gradient-to-b from-zinc-100 via-zinc-400 to-zinc-600 bg-clip-text text-transparent">FRONT</span>
          </h1>
          <p className="mt-4 max-w-2xl text-center text-sm leading-relaxed text-zinc-400 sm:text-base">
            Ultra-realistyczna bitwa pancerna na jednym ekranie. Niszczalne otoczenie, rykoszetujące pociski,
            dynamiczne oświetlenie, dym, ogień i fizyka gąsienic. Graj na klawiaturze albo podłącz telefony jako
            bezprzewodowe joysticki i walczcie!
          </p>

          {/* quick play */}
          <div className="mt-8 grid w-full max-w-3xl grid-cols-1 gap-3 sm:grid-cols-3">
            <button
              onClick={() => { setMenuChoice(0); gameAudio.init(); gameAudio.uiClick(); startGame({ count: 2, bots: 0 }); }}
              className={`group metal-panel rivet rounded-2xl p-5 text-left transition-all hover:scale-[1.02] hover:border-amber-500/50 ${menuChoice === 0 ? 'ring-2 ring-amber-400/70' : ''}`}
            >
              <Users className="h-7 w-7 text-amber-400" />
              <div className="mt-2 text-lg font-bold">Pojedynek 1v1</div>
              <div className="text-xs text-zinc-400">2 graczy • klasyk na WSAD vs strzałki</div>
              <div className="mt-3 flex items-center gap-1 text-xs font-bold text-amber-400">GRAJ TERAZ <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
            </button>
            <button
              onClick={() => { setMenuChoice(1); gameAudio.init(); gameAudio.uiClick(); setPlayers(PLAYER_DEFS.map((p, i) => ({ ...p, enabled: i < 4, isBot: false }))); setScreen('setup'); }}
              className={`group metal-panel rivet rounded-2xl border-amber-500/40 p-5 text-left transition-all hover:scale-[1.02] ${menuChoice === 1 ? 'ring-2 ring-amber-400/70' : ''}`}
              style={{ animation: 'pulse-glow 2.5s ease-in-out infinite' }}
            >
              <Flame className="h-7 w-7 text-orange-500" />
              <div className="mt-2 text-lg font-bold">Bitwa 4 graczy</div>
              <div className="text-xs text-zinc-400">Pełny chaos — cała klawiatura w ogniu</div>
              <div className="mt-3 flex items-center gap-1 text-xs font-bold text-amber-400">DALEJ <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
            </button>
            <button
              onClick={() => { setMenuChoice(2); gameAudio.init(); gameAudio.uiClick(); setPlayers(PLAYER_DEFS.map((p, i) => ({ ...p, enabled: i < 3, isBot: i > 0 }))); setScreen('setup'); }}
              className={`group metal-panel rivet rounded-2xl p-5 text-left transition-all hover:scale-[1.02] hover:border-sky-500/50 ${menuChoice === 2 ? 'ring-2 ring-sky-400/70' : ''}`}
            >
              <Bot className="h-7 w-7 text-sky-400" />
              <div className="mt-2 text-lg font-bold">Trening z botami</div>
              <div className="text-xs text-zinc-400">Ty + 2 boty SI • nauka sterowania</div>
              <div className="mt-3 flex items-center gap-1 text-xs font-bold text-sky-400">TRENING <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-1" /></div>
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => { gameAudio.init(); gameAudio.uiClick(); setScreen('setup'); }}
              className="rounded-xl border border-white/15 bg-white/5 px-8 py-3 text-sm font-bold tracking-widest text-zinc-200 transition-all hover:bg-white/10"
            >
              ⚙️ PEŁNA KONFIGURACJA BITWY
            </button>
            <button
              onClick={() => { gameAudio.init(); gameAudio.uiClick(); setShowPad(v => !v); if (padState.status === 'idle') padHost.start(); }}
              className={`flex items-center gap-2 rounded-xl border px-6 py-3 text-sm font-bold tracking-widest transition-all ${padState.status === 'ready' ? 'border-green-500/50 bg-green-500/10 text-green-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20'}`}
            >
              <Smartphone className="h-4 w-4" /> TELEFON JAKO PAD {padState.pads.length > 0 && <span className="rounded-full bg-green-500 px-2 py-0.5 text-[10px] text-black">{padState.pads.length}</span>}
            </button>
          </div>
          {(showPad || padState.pads.length > 0) && (
            <div className="mt-4 w-full max-w-3xl">
              <PadHostPanel players={players} onClose={() => setShowPad(false)} />
            </div>
          )}

          {/* features */}
          <div className="mt-10 grid w-full max-w-4xl grid-cols-2 gap-2 text-center sm:grid-cols-4">
            {[
              { icon: <Target className="h-5 w-5" />, t: 'Rykoszety', d: 'Pociski odbijają się od ścian' },
              { icon: <Flame className="h-5 w-5" />, t: 'Efekty AAA', d: 'Ogień, dym, kurz, deszcz' },
              { icon: <Sparkles className="h-5 w-5" />, t: 'Nocne walki', d: 'Reflektory i neony miasta' },
              { icon: <Shield className="h-5 w-5" />, t: 'Power-upy', d: 'Tarcze, turbo, ciężkie działa' },
            ].map((f, i) => (
              <div key={i} className="rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500/15 text-amber-400">{f.icon}</div>
                <div className="mt-1.5 text-sm font-bold">{f.t}</div>
                <div className="text-[11px] text-zinc-500">{f.d}</div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex items-center gap-2 text-[11px] text-zinc-500">
            <Keyboard className="h-3.5 w-3.5" /> Wskazówka: na klawiaturach membranowych maksymalnie 3–4 graczy naraz — laptopy radzą sobie najlepiej z 2–3.
          </div>
          {typeof window !== 'undefined' && 'ontouchstart' in window && (
            <div className="mt-3 max-w-xl rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-center text-xs font-bold text-amber-300">
              📱 To urządzenie ma ekran dotykowy. Najlepiej otwórz grę na komputerze/TV, a tutaj użyj trybu{' '}
              <a href="#pad" className="underline">telefon jako pad</a>.
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ============ SETUP ============ */
  if (screen === 'setup') {
    return (
      <div className="relative min-h-screen bg-[#0a0a0b] text-white">
        <div className="hazard-stripes h-2 w-full opacity-80" />
        <div className="mx-auto w-full max-w-6xl px-4 py-6">
          <div className="flex items-center justify-between">
            <button onClick={() => setScreen('menu')} className="flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-bold text-zinc-300 hover:bg-white/10">
              <Home className="h-4 w-4" /> MENU
            </button>
            <h2 className="font-display text-2xl tracking-wide text-amber-400 sm:text-3xl">KONFIGURACJA BITWY</h2>
            <button onClick={onExit} className="flex items-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-zinc-300 hover:text-amber-300"><Home className="h-4 w-4" /> <span className="hidden sm:inline">JOYPAD</span></button>
          </div>

          {/* phones as pads */}
          <div className="mt-6">
            <PadHostPanel players={players} />
          </div>

          {/* players */}
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-400"><Users className="h-4 w-4" /> GRACZE (min. 2)</div>
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
                      className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold transition-all ${p.isBot ? 'border-sky-500/50 bg-sky-500/15 text-sky-300' : 'border-white/10 bg-white/5 text-zinc-400 hover:bg-white/10'}`}
                    >
                      {p.isBot ? <><Bot className="h-3.5 w-3.5" /> BOT (SI)</> : <><Gamepad2 className="h-3.5 w-3.5" /> CZŁOWIEK</>}
                    </button>
                  )}
                  {p.id === 0 && <div className="mt-2 rounded-lg bg-white/5 px-2 py-1.5 text-center text-xs font-bold text-zinc-400">CZŁOWIEK (zawsze)</div>}
                  {padBySlot(p.id) && (
                    <div className="mt-2 flex items-center justify-center gap-1.5 rounded-lg border border-green-500/40 bg-green-500/10 px-2 py-1.5 text-xs font-bold text-green-300">
                      <Smartphone className="h-3.5 w-3.5" /> {padBySlot(p.id)!.nick}
                    </div>
                  )}
                  {/* controls */}
                  <div className={`mt-3 space-y-1.5 text-[11px] ${!p.enabled || p.isBot ? 'pointer-events-none opacity-30' : ''}`}>
                    <div className="grid grid-cols-[52px_1fr] items-center gap-1">
                      <span className="text-zinc-500">Jazda</span>
                      <div className="flex gap-1"><KeyCap>{p.controlLabels.forward}</KeyCap><KeyCap>{p.controlLabels.back}</KeyCap><KeyCap>{p.controlLabels.left}</KeyCap><KeyCap>{p.controlLabels.right}</KeyCap></div>
                    </div>
                    <div className="grid grid-cols-[52px_1fr] items-center gap-1">
                      <span className="text-zinc-500">Ogień</span>
                      <div><KeyCap color="#7c2d12">{p.controlLabels.fire}</KeyCap></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* maps */}
          <div className="mt-6">
            <div className="mb-3 flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-400"><Target className="h-4 w-4" /> ARENA</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {(Object.keys(MAPS) as MapId[]).map((id) => {
                const m = MAPS[id];
                const active = mapId === id;
                return (
                  <button
                    key={id}
                    onClick={() => { gameAudio.init(); gameAudio.uiClick(); setMapId(id); }}
                    className={`overflow-hidden rounded-2xl border-2 text-left transition-all hover:scale-[1.01] ${active ? 'border-amber-400 shadow-[0_0_30px_rgba(251,191,36,0.25)]' : 'border-white/10'}`}
                  >
                    <div
                      className="flex h-24 items-end justify-between p-3"
                      style={{
                        background: id === 'desert'
                          ? 'linear-gradient(160deg, #d9b878 0%, #a98852 60%, #6b5433 100%)'
                          : id === 'nightcity'
                            ? 'linear-gradient(160deg, #1a1030 0%, #241a3f 45%, #0d1526 100%)'
                            : 'linear-gradient(160deg, #5a7247 0%, #3d4e32 60%, #232b1d 100%)',
                      }}
                    >
                      <span className="text-4xl drop-shadow-lg">{MAP_ICONS[id]}</span>
                      <div className="flex gap-1">
                        {m.night && <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-indigo-300">🌙 NOC</span>}
                        {m.weather === 'rain' && <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-sky-300">🌧 DESZCZ</span>}
                        {m.weather === 'dust' && <span className="rounded bg-black/60 px-2 py-0.5 text-[10px] font-bold text-amber-300">💨 PYŁ</span>}
                      </div>
                    </div>
                    <div className="bg-zinc-900 p-3">
                      <div className="font-bold">{m.name}</div>
                      <div className="mt-0.5 text-xs leading-snug text-zinc-400">{m.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* mode + rules */}
          <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-2">
            <div className="metal-panel rounded-2xl p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-400"><Trophy className="h-4 w-4" /> TRYB GRY</div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => { gameAudio.uiClick(); setMode('deathmatch'); }}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${mode === 'deathmatch' ? 'border-amber-400 bg-amber-500/10' : 'border-white/10 bg-white/[0.03]'}`}
                >
                  <Crosshair className="h-5 w-5 text-amber-400" />
                  <div className="mt-1 font-bold">Deathmatch</div>
                  <div className="text-[11px] text-zinc-400">Kto pierwszy zdobędzie limit fragów. Odrodzenia bez limitu.</div>
                </button>
                <button
                  onClick={() => { gameAudio.uiClick(); setMode('survival'); }}
                  className={`rounded-xl border-2 p-3 text-left transition-all ${mode === 'survival' ? 'border-red-400 bg-red-500/10' : 'border-white/10 bg-white/[0.03]'}`}
                >
                  <Skull className="h-5 w-5 text-red-400" />
                  <div className="mt-1 font-bold">Przetrwanie</div>
                  <div className="text-[11px] text-zinc-400">Ograniczona liczba żyć. Ostatni czołg na placu wygrywa.</div>
                </button>
              </div>
            </div>
            <div className="metal-panel rounded-2xl p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-400"><Timer className="h-4 w-4" /> ZASADY</div>
              {mode === 'deathmatch' ? (
                <div>
                  <div className="mb-2 text-sm text-zinc-300">Limit fragów: <b className="text-amber-400">{killLimit}</b></div>
                  <div className="flex gap-2">
                    {[3, 5, 8, 10, 15].map(v => (
                      <button key={v} onClick={() => setKillLimit(v)} className={`flex-1 rounded-lg border py-2 text-sm font-bold transition-all ${killLimit === v ? 'border-amber-400 bg-amber-500/20 text-amber-300' : 'border-white/10 bg-white/5 text-zinc-400'}`}>{v}</button>
                    ))}
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-2 text-sm text-zinc-300">Liczba żyć: <b className="text-red-400">{lives}</b></div>
                  <div className="flex gap-2">
                    {[1, 2, 3, 5, 7].map(v => (
                      <button key={v} onClick={() => setLives(v)} className={`flex-1 rounded-lg border py-2 text-sm font-bold transition-all ${lives === v ? 'border-red-400 bg-red-500/20 text-red-300' : 'border-white/10 bg-white/5 text-zinc-400'}`}>{v}</button>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-white/5 p-2.5 text-[11px] text-zinc-400">
                <Info className="h-4 w-4 shrink-0 text-sky-400" />
                Limit czasu: 5 minut. Przy remisie wygrywa gracz z największą liczbą fragów. Pociski rykoszetują raz — uważaj na własne odbicia!
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col items-center gap-2">
            <button
              onClick={() => { if (canStart) { gameAudio.init(); gameAudio.uiClick(); startGame(); } }}
              disabled={!canStart}
              className={`flex items-center gap-3 rounded-2xl px-12 py-4 text-xl font-black tracking-widest transition-all ${canStart ? 'bg-gradient-to-b from-amber-400 to-orange-600 text-black shadow-[0_0_40px_rgba(251,146,60,0.4)] hover:scale-105' : 'cursor-not-allowed bg-zinc-800 text-zinc-500'}`}
            >
              <Play className="h-6 w-6 fill-current" /> DO BOJU!
            </button>
            {!canStart && <div className="text-sm font-bold text-red-400">Włącz minimum 2 graczy!</div>}
            <div className="text-xs text-zinc-500">Włączono: {enabledCount} graczy • Pauza: P / ESC</div>
          </div>
        </div>
      </div>
    );
  }

  /* ============ GAME OVER ============ */
  if (screen === 'over' && results) {
    const winner = results.tanks.find(t => t.id === results.winner);
    const sorted = [...results.tanks].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    return (
      <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-[#0a0a0b] px-4 py-10 text-white">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(251,191,36,0.12),transparent_60%)]" />
        <div className="hazard-stripes absolute left-0 right-0 top-0 h-2" />
        <div className="hazard-stripes absolute bottom-0 left-0 right-0 h-2" />
        {winner ? (
          <>
            <Crown className="h-14 w-14 text-amber-400 drop-shadow-[0_0_20px_rgba(251,191,36,0.6)]" />
            <div className="mt-2 text-sm font-bold tracking-[0.3em] text-zinc-400">ZWYCIĘZCA</div>
            <h2 className="font-display mt-1 text-5xl sm:text-7xl" style={{ color: winner.color, textShadow: `0 0 40px ${winner.color}` }}>{winner.name}</h2>
            <div className="mt-2 flex items-center gap-2 text-zinc-400">
              <Trophy className="h-4 w-4 text-amber-400" />
              {winner.kills} fragów • {winner.deaths} zgonów {mode === 'survival' && `• ${winner.lives} żyć`}
            </div>
          </>
        ) : (
          <>
            <Swords className="h-14 w-14 text-zinc-400" />
            <h2 className="font-display mt-2 text-5xl text-zinc-200">REMIS!</h2>
            <div className="mt-2 text-zinc-400">Żaden czołg nie zdominował pola bitwy.</div>
          </>
        )}

        <div className="mt-8 w-full max-w-2xl overflow-hidden rounded-2xl border border-white/10">
          <div className="grid grid-cols-[1fr_70px_70px_70px] gap-2 bg-zinc-900 px-4 py-2.5 text-[11px] font-bold tracking-widest text-zinc-500">
            <span>GRACZ</span><span className="text-center">FRAGI</span><span className="text-center">ZGONY</span><span className="text-center">K/D</span>
          </div>
          {sorted.map((t, i) => (
            <div key={t.id} className={`grid grid-cols-[1fr_70px_70px_70px] items-center gap-2 px-4 py-3 ${i % 2 ? 'bg-white/[0.02]' : 'bg-white/[0.05]'} ${t.id === results.winner ? 'border-l-4' : 'border-l-4 border-transparent'}`} style={t.id === results.winner ? { borderColor: t.color } : {}}>
              <div className="flex items-center gap-2">
                <span className="font-mono2 text-xs text-zinc-500">#{i + 1}</span>
                <span className="h-3 w-3 rounded-full" style={{ background: t.color, boxShadow: `0 0 8px ${t.color}` }} />
                <span className="font-bold" style={{ color: t.color }}>{t.name}</span>
              </div>
              <span className="text-center font-mono2 font-bold text-green-400">{t.kills}</span>
              <span className="text-center font-mono2 text-red-400">{t.deaths}</span>
              <span className="text-center font-mono2 text-zinc-300">{(t.kills / Math.max(1, t.deaths)).toFixed(2)}</span>
            </div>
          ))}
        </div>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <button onClick={() => startGame()} className="flex items-center gap-2 rounded-xl bg-gradient-to-b from-amber-400 to-orange-600 px-8 py-3 font-black tracking-widest text-black transition-all hover:scale-105">
            <RotateCcw className="h-5 w-5" /> REWANŻ
          </button>
          <button onClick={() => setScreen('setup')} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-3 font-bold text-zinc-200 hover:bg-white/10">
            ⚙️ ZMIEŃ ZASADY
          </button>
          <button onClick={() => setScreen('menu')} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-8 py-3 font-bold text-zinc-200 hover:bg-white/10">
            <Home className="h-5 w-5" /> MENU BITWY
          </button>
          <button onClick={onExit} className="flex items-center gap-2 rounded-xl border border-orange-400/40 bg-orange-500/10 px-8 py-3 font-bold text-orange-200 hover:bg-orange-500/20">
            <Gamepad2 className="h-5 w-5" /> JOYPAD
          </button>
        </div>
      </div>
    );
  }

  /* ============ GAME ============ */
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-black text-white">
      {/* top bar */}
      <div className="z-20 flex items-center justify-between gap-2 border-b border-amber-500/20 bg-gradient-to-b from-zinc-900 to-zinc-950 px-3 py-2">
        <div className="flex items-center gap-3">
          <span className="font-display hidden text-sm tracking-wider text-amber-400 sm:block">STALOWY FRONT</span>
          <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] font-bold text-zinc-300">{MAPS[mapId].name}</span>
          <span className="hidden rounded bg-white/10 px-2 py-0.5 text-[11px] font-bold text-zinc-300 sm:block">{mode === 'deathmatch' ? `🎯 ${killLimit} FRAGÓW` : `❤️ ${lives} ŻYĆ`}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 font-mono2 text-lg font-extrabold ${(hud?.timeLeft ?? 99) < 30 ? 'border-red-500/60 bg-red-500/15 text-red-300' : 'border-white/15 bg-black/50 text-amber-300'}`}>
            <Timer className="h-4 w-4" />{fmtTime(hud?.timeLeft ?? TIME_LIMIT_S)}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button onClick={() => setShowPad(v => !v)} title="Telefon jako pad" className={`relative rounded-lg border p-2 transition-colors ${showPad ? 'border-amber-400 bg-amber-500/20 text-amber-300' : 'border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10'}`}>
            <Smartphone className="h-4 w-4" />
            {padState.pads.length > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-green-500 px-1 text-[9px] font-bold text-black">{padState.pads.length}</span>}
          </button>
          <button onClick={() => setShowHelp(h => !h)} title="Sterowanie" className={`rounded-lg border p-2 transition-colors ${showHelp ? 'border-amber-400 bg-amber-500/20 text-amber-300' : 'border-white/15 bg-white/5 text-zinc-300 hover:bg-white/10'}`}>
            <Keyboard className="h-4 w-4" />
          </button>
          <button onClick={toggleMute} title={muted ? 'Włącz dźwięk' : 'Wycisz'} className="rounded-lg border border-white/15 bg-white/5 p-2 text-zinc-300 hover:bg-white/10">
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </button>
          <button onClick={() => gameRef.current?.togglePause()} title="Pauza (P)" className="rounded-lg border border-white/15 bg-white/5 p-2 text-zinc-300 hover:bg-white/10">
            {hud?.paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
          </button>
          <button onClick={() => { gameAudio.uiClick(); setScreen('setup'); }} title="Zakończ bitwę i wróć do ustawień" className="rounded-lg border border-red-500/40 bg-red-500/10 p-2 text-red-300 hover:bg-red-500/20">
            <Home className="h-4 w-4" />
          </button>
          <button onClick={onExit} title="Wróć do JoyPad" className="rounded-lg border border-orange-400/40 bg-orange-500/10 p-2 text-orange-200 hover:bg-orange-500/20"><Gamepad2 className="h-4 w-4" /></button>
        </div>
      </div>

      {/* main */}
      <div className="relative flex min-h-0 flex-1">
        {/* left HUD */}
        <div className="z-10 hidden w-52 shrink-0 flex-col gap-2 overflow-y-auto border-r border-white/10 bg-zinc-950/90 p-2 md:flex">
          {hud?.tanks.slice(0, Math.ceil((hud?.tanks.length ?? 0) / 2)).map(t => <PlayerCard key={t.id} t={t} mode={mode} killLimit={killLimit} phone={padBySlot(t.id)?.nick} />)}
          <div className="mt-auto rounded-xl border border-white/10 bg-black/50 p-2.5 text-[10px] leading-relaxed text-zinc-500">
            <div className="mb-1 font-bold tracking-widest text-zinc-400">💡 TAKTYKA</div>
            • Strzelaj w ściany, by rykoszetem trafić wroga za rogiem.<br />
            • Zbieraj <span className="text-green-400">power-upy</span> — tarcza ratuje życie.<br />
            • Cofanie + skręt = szybki unik.
          </div>
        </div>

        {/* canvas */}
        <div className="scanlines crt-vignette relative min-w-0 flex-1 bg-black">
          <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" style={{ width: '100%', height: '100%' }} />

          {/* kill feed */}
          <div className="pointer-events-none absolute right-3 top-3 z-10 flex w-64 flex-col gap-1">
            {(hud?.killFeed ?? []).map(k => (
              <div key={k.id} className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/70 px-2.5 py-1.5 text-[11px] font-bold backdrop-blur-sm">
                <Skull className="h-3 w-3 shrink-0 text-red-400" />
                <span className="truncate text-zinc-200">{k.killerName === '—' ? '💥' : k.killerName}</span>
                <Crosshair className="h-3 w-3 shrink-0 text-amber-400" />
                <span className="truncate text-zinc-400">{k.victimName}</span>
              </div>
            ))}
          </div>

          {/* mobile HUD (small screens: compact bars) */}
          <div className="absolute left-2 top-2 z-10 flex gap-1.5 md:hidden">
            {(hud?.tanks ?? []).map(t => (
              <div key={t.id} className="w-16 overflow-hidden rounded-lg border border-white/15 bg-black/70 p-1">
                <div className="truncate text-[9px] font-bold" style={{ color: t.color }}>{t.name}</div>
                <div className="mt-0.5 h-1.5 rounded-full bg-zinc-800">
                  <div className="h-full rounded-full" style={{ width: `${(t.hp / t.maxHp) * 100}%`, background: t.color }} />
                </div>
                <div className="font-mono2 text-[9px] text-zinc-400">☠{t.kills}</div>
              </div>
            ))}
          </div>

          {/* pause overlay */}
          {hud?.paused && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm">
              <Pause className="h-12 w-12 text-amber-400" />
              <div className="font-display mt-2 text-4xl text-white">PAUZA</div>
              <div className="mt-1 text-sm text-zinc-400">Naciśnij P lub ESC, aby kontynuować</div>
              <button onClick={() => gameRef.current?.togglePause()} className="mt-4 flex items-center gap-2 rounded-xl bg-amber-500 px-6 py-2.5 font-bold text-black hover:bg-amber-400">
                <Play className="h-4 w-4" /> KONTYNUUJ
              </button>
            </div>
          )}

          {/* pad overlay */}
          {showPad && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setShowPad(false)}>
              <div className="w-full max-w-2xl" onClick={e => e.stopPropagation()}>
                <PadHostPanel players={players} onClose={() => setShowPad(false)} />
              </div>
            </div>
          )}

          {/* help overlay */}
          {showHelp && (
            <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm" onClick={() => setShowHelp(false)}>
              <div className="metal-panel grid max-w-3xl grid-cols-1 gap-3 rounded-2xl p-5 sm:grid-cols-2" onClick={e => e.stopPropagation()}>
                {players.filter(p => p.enabled && !p.isBot).map(p => (
                  <div key={p.id} className="rounded-xl border border-white/10 bg-black/40 p-3">
                    <div className="mb-2 flex items-center gap-2 text-sm font-bold" style={{ color: p.color }}>
                      {p.name}
                      {padBySlot(p.id) && <span className="flex items-center gap-1 rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] text-green-300"><Smartphone className="h-3 w-3" />{padBySlot(p.id)!.nick}</span>}
                    </div>
                    <div className="space-y-1.5 text-xs text-zinc-300">
                      <div className="flex items-center justify-between"><span>Przód / Tył</span><span className="flex gap-1"><KeyCap>{p.controlLabels.forward}</KeyCap><KeyCap>{p.controlLabels.back}</KeyCap></span></div>
                      <div className="flex items-center justify-between"><span>Obrót w lewo / prawo</span><span className="flex gap-1"><KeyCap>{p.controlLabels.left}</KeyCap><KeyCap>{p.controlLabels.right}</KeyCap></span></div>
                      <div className="flex items-center justify-between"><span className="font-bold text-red-300">OGIEŃ</span><KeyCap color="#7c2d12">{p.controlLabels.fire}</KeyCap></div>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200 sm:col-span-2">
                  <b>Pauza:</b> <KeyCap>P</KeyCap> lub <KeyCap>ESC</KeyCap> — Wieżyczka podąża za kadłubem. Pociski rykoszetują raz od ścian. Zbieraj zielone skrzynki z bonusami!
                </div>
              </div>
            </div>
          )}
        </div>

        {/* right HUD */}
        <div className="z-10 hidden w-52 shrink-0 flex-col gap-2 overflow-y-auto border-l border-white/10 bg-zinc-950/90 p-2 md:flex">
          {hud?.tanks.slice(Math.ceil((hud?.tanks.length ?? 0) / 2)).map(t => <PlayerCard key={t.id} t={t} mode={mode} killLimit={killLimit} phone={padBySlot(t.id)?.nick} />)}
          <div className="mt-auto space-y-1.5">
            <div className="rounded-xl border border-white/10 bg-black/50 p-2.5 text-[10px] leading-relaxed text-zinc-500">
              <div className="mb-1 font-bold tracking-widest text-zinc-400">📦 BONUSY</div>
              <div className="flex items-center gap-1.5"><span className="font-mono2 font-bold text-green-400">+</span> Naprawa +50 HP</div>
              <div className="flex items-center gap-1.5"><span className="font-mono2 font-bold text-green-400">◈</span> Tarcza 10 s</div>
              <div className="flex items-center gap-1.5"><span className="font-mono2 font-bold text-green-400">≋</span> Szybkostrzelność</div>
              <div className="flex items-center gap-1.5"><span className="font-mono2 font-bold text-green-400">●</span> Ciężki pocisk</div>
              <div className="flex items-center gap-1.5"><span className="font-mono2 font-bold text-green-400">»</span> Turbo 12 s</div>
            </div>
          </div>
        </div>
      </div>

      {/* bottom controls bar */}
      <div className="z-20 hidden items-center justify-center gap-4 border-t border-white/10 bg-zinc-950 px-3 py-1.5 lg:flex">
        {players.filter(p => p.enabled && !p.isBot).map(p => (
          <div key={p.id} className="flex items-center gap-1.5 text-[11px]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} />
            <span className="font-bold" style={{ color: p.color }}>{p.name}</span>
            {padBySlot(p.id) ? (
              <span className="flex items-center gap-1 rounded bg-green-500/15 px-1.5 py-0.5 text-[10px] font-bold text-green-300"><Smartphone className="h-3 w-3" />{padBySlot(p.id)!.nick}</span>
            ) : (
              <>
                <KeyCap>{p.controlLabels.forward}</KeyCap><KeyCap>{p.controlLabels.back}</KeyCap><KeyCap>{p.controlLabels.left}</KeyCap><KeyCap>{p.controlLabels.right}</KeyCap>
                <KeyCap color="#7c2d12">{p.controlLabels.fire}</KeyCap>
              </>
            )}
          </div>
        ))}
        <span className="text-[11px] text-zinc-600">P = pauza</span>
      </div>
    </div>
  );
}
