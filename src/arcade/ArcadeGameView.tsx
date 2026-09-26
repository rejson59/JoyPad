import { readChoice, remember } from '../console/history';
import { GameSetup } from '../console/GameSetup';
import { GameResults } from '../console/GameResults';
import { ConnectionsScreen } from '../components/ConnectionsScreen';
import { PauseSheet } from '../console/PauseSheet';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Gamepad2, Home, LoaderCircle, Pause, Smartphone, Timer, Volume2, VolumeX, Zap } from 'lucide-react';
import { gameAudio } from '../game/audio';
import { menuMusic } from '../game/menuMusic';
import { PLAYER_DEFS } from '../game/types';
import { padHost } from '../net/padHost';
import type { RemoteCommand, RemoteEvent } from '../net/protocol';
import { PadHostPanel } from '../pad/PadHostPanel';
import { ScreenCurtain, SegmentedControl, useCurtain } from '../components/motion';
import { gameInfo, type GameId } from './catalog';
import { useMenuMusic } from '../lib/useMenuMusic';
import { COLORS, type DisplayMode, type GameRound, type Racer, type RenderQuality, type RoundConfig, type RoundHud, type RoundResult } from './runtime';

type ArcadeId = Exclude<GameId, 'tanks'>;
type Stage = 'menu' | 'game' | 'over';

const RULES: Record<ArcadeId, { primaryLabel: string; primary: string[]; secondaryLabel: string; secondary: string[]; hint: string; action: string; win: string }> = {
  race: { primaryLabel: 'OKRĄŻENIA', primary: ['2 okrążenia', '3 okrążenia', '4 okrążenia'], secondaryLabel: 'RYWALE SI', secondary: ['Bez botów', '1 bot', '2 boty', '3 boty'], hint: 'Kieruj joystickiem w kierunku drogi. Zbieraj skrzynie z bonusami: gdy pojawi się karta, AKCJA używa przedmiotu; bez karty daje krótki turbo-zryw.', action: 'AKCJA / TURBO', win: 'Pierwszy na mecie wygrywa.' },
  orbit: { primaryLabel: 'STATEK', primary: ['Interceptor', 'Valkyrie', 'Titan'], secondaryLabel: 'SIŁA WROGA', secondary: ['Rekrut', 'Pilot', 'Weteran'], hint: 'Joystick prowadzi statek, OGIEŃ strzela z dział. Pełne wychylenie gałki albo przytrzymanie AKCJI = dopalacz. Rakieta odpala się sama przy pełnym namierzeniu celu.', action: 'OGIEŃ', win: 'Rozbijcie całą wrogą eskadrę.' },
  snake: { primaryLabel: 'CEL PUNKTOWY', primary: ['8 punktów', '12 punktów', '16 punktów'], secondaryLabel: 'RYWALE SI', secondary: ['Bez botów', '1 bot', '2 boty', '3 boty'], hint: 'Wąż sam porusza się do przodu. Wychyl gałkę, aby skręcić. Złote impulsy są warte więcej i dają krótką ochronę.', action: 'SPRINT', win: 'Pierwszy do celu wygrywa.' },
  temple: { primaryLabel: 'CEL WYPRAWY', primary: ['8 reliktów', '12 reliktów', '16 reliktów'], secondaryLabel: 'STRAŻNICY', secondary: ['Odkrywca', 'Śmiałek', 'Legenda'], hint: 'Zbieraj zielone relikty. Trzymaj AKCJA obok skrzyni, by ją otworzyć, lub podczas biegu, by sprintować. Po zebraniu celu dotrzyjcie do portalu.', action: 'AKCJA', win: 'Zbierzcie relikty i dotrzyjcie do wyjścia.' },
  voxel: { primaryLabel: 'CEL ZBIERANIA', primary: ['8 surowców', '12 surowców', '16 surowców'], secondaryLabel: 'NOCNE CRAWLERY', secondary: ['Spokojna noc', '2 strażników', '3 strażników', '4 strażników'], hint: 'Klockowy biom jest proceduralny. Zbieraj kryształy i drewno, wracaj do bazy, aby podnosić jej poziom. W nocy pojawiają się crawlery.', action: 'AKCJA', win: 'Zbierzcie zasoby i wróćcie do bazy.' },
  league: { primaryLabel: 'LIMIT GOLI', primary: ['3 gole', '5 goli', '7 goli'], secondaryLabel: 'RYWALE SI', secondary: ['Bez botów', '1 bot', '2 boty', '3 boty'], hint: 'Pchaj piłkę do bramki. Joystick steruje autem, AKCJA to boost. Odbicia i turbo mają większą siłę niż zwykła jazda.', action: 'TURBO', win: 'Pierwsza drużyna do limitu wygrywa.' },
};

const formatTime = (n: number) => `${Math.floor(n / 60)}:${String(Math.floor(n % 60)).padStart(2, '0')}`;

function readLocalRecord(id: ArcadeId): number {
  try { return Number(localStorage.getItem(`joypad-record-${id}`) || 0) || 0; } catch { return 0; }
}

function readPreference<T extends string>(key: string, fallback: T, values: readonly T[]): T {
  try { const value = localStorage.getItem(key) as T | null; return value && values.includes(value) ? value : fallback; } catch { return fallback; }
}

function hasWebGL2(canvas: HTMLCanvasElement) {
  try { return Boolean(canvas.getContext('webgl2')); } catch { return false; }
}

async function createRound(id: ArcadeId, canvas: HTMLCanvasElement, config: RoundConfig): Promise<GameRound> {
  // Każdy silnik ładuje się dopiero po wybraniu gry — menu nie pobiera całej biblioteki naraz.
  switch (id) {
    case 'race': {
      // Neonowy Pęd korzysta z rozpakowanego miasta i kartów Three.js na obsługiwanych GPU.
      // The existing Canvas race remains the explicit low-capability fallback.
      if (hasWebGL2(canvas)) {
        try { return new (await import('./neon/NeonCircuitRound')).NeonCircuitRound(canvas, config); }
        catch (error) { console.warn('Neonowy Pęd WebGL niedostępny — używam fallbacku Canvas', error); }
      }
      return new (await import('./games/Race')).RaceRound(canvas, config);
    }
    case 'orbit': {
      // Orbitalna Fala = STAR CLASH 3D z orbitalna-fala.zip. Bez WebGL2 zostaje klasyczny Orbit 2D.
      if (hasWebGL2(canvas)) {
        try { return new (await import('./starclash/StarClashRound')).StarClashRound(canvas, config); }
        catch (error) { console.warn('STAR CLASH WebGL niedostępny — używam fallbacku Canvas', error); }
      }
      return new (await import('./games/Orbit')).OrbitRound(canvas, config);
    }
    case 'snake': {
      if (hasWebGL2(canvas)) return new (await import('./webgl/Arcade3D')).Arcade3DRound(canvas, config, 'snake');
      return new (await import('./games/Snake')).SnakeRound(canvas, config);
    }
    case 'temple': {
      if (hasWebGL2(canvas)) return new (await import('./webgl/Arcade3D')).Arcade3DRound(canvas, config, 'temple');
      return new (await import('./games/Temple')).TempleRound(canvas, config);
    }
    case 'voxel': {
      if (hasWebGL2(canvas)) return new (await import('./webgl/Voxel3D')).Voxel3DRound(canvas, config);
      return new (await import('./games/Voxel')).VoxelRound(canvas, config);
    }
    case 'league': {
      if (hasWebGL2(canvas)) return new (await import('./webgl/League3D')).League3DRound(canvas, config);
      return new (await import('./games/League')).LeagueRound(canvas, config);
    }
  }
}

function OptionStepper({ title, value, change, accent, help }: { title: string; value: string; change: (step: number) => void; accent: string; help: string }) {
  return <div className="arcade-option rounded-2xl p-4"><div className="joy-kicker text-slate-400">{title}</div><div className="mt-3 flex items-center justify-between gap-2"><button onClick={() => change(-1)} aria-label={`Poprzednie: ${title}`} className="joy-arrow"><ChevronLeft size={18} /></button><span key={value} className="flip-in block min-h-[26px] text-center text-sm font-bold sm:text-base" style={{ color: accent }}>{value}</span><button onClick={() => change(1)} aria-label={`Następne: ${title}`} className="joy-arrow"><ChevronRight size={18} /></button></div><div className="mt-3 text-center text-[11px] text-slate-500">{help}</div></div>;
}

function Segmented<T extends string>({ title, values, value, onChange, accent, labels }: { title: string; values: readonly T[]; value: T; onChange: (value: T) => void; accent: string; labels: Record<T, string> }) {
  return <div className="arcade-option rounded-2xl p-4"><div className="joy-kicker text-slate-400">{title}</div>
    <div className="mt-3"><SegmentedControl options={values.map(v => ({ value: v, label: labels[v] }))} value={value} onChange={onChange} accent={accent} label={title} /></div>
    <div className="mt-3 text-center text-[11px] text-slate-500">{value === 'split' ? '2–4 widoki na jednym ekranie' : value === 'shared' ? 'Wspólna arena dla całej kanapy' : value === 'performance' ? 'Niższa rozdzielczość, priorytet płynności' : value === 'quality' ? 'Więcej detali, większe obciążenie GPU' : 'Równowaga płynności i jakości'}</div></div>;
}

export function ArcadeGameView({ id, onExit, remote }: { id: ArcadeId; onExit: () => void; remote: RemoteEvent | null }) {
  const info = gameInfo(id), rules = RULES[id];
  const [stage, setStage] = useState<Stage>('menu');
  const [primary, setPrimary] = useState(() => readChoice(`${id}.primary`, rules.primary.map((_, i) => i), id === 'race' || id === 'snake' || id === 'league' ? 1 : 0));
  const [secondary, setSecondary] = useState(() => readChoice(`${id}.secondary`, rules.secondary.map((_, i) => i), id === 'race' || id === 'league' ? 2 : 1));
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => readPreference('joypad-display-mode', 'shared', ['shared', 'split'] as const));
  const [quality, setQuality] = useState<RenderQuality>(() => readPreference('joypad-render-quality', 'balanced', ['performance', 'balanced', 'quality'] as const));
  const [hud, setHud] = useState<RoundHud | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [record, setRecord] = useState(() => readLocalRecord(id));
  const [participants, setParticipants] = useState<Racer[]>([]);
  const [roundKey, setRoundKey] = useState(0);
  const [showPads, setShowPads] = useState(false);
  const [muted, setMuted] = useState(gameAudio.muted);
  const [menuMusicOn, toggleMenuMusic] = useMenuMusic();
  const curtain = useCurtain();
  // „START” miga, gdy odliczanie przekracza zero.
  const [startFlash, setStartFlash] = useState(false);
  const prevCountdown = useRef<number | undefined>(undefined);
  useEffect(() => {
    const c = hud?.countdown;
    const prev = prevCountdown.current;
    prevCountdown.current = c;
    if (prev !== undefined && prev > 0 && (c === undefined || c <= 0)) {
      setStartFlash(true);
      const t = window.setTimeout(() => setStartFlash(false), 950);
      return () => window.clearTimeout(t);
    }
  }, [hud?.countdown]);
  // Muzyka menu: gra w lobby/ustawieniach rundy, cichnie na czas gry.
  useEffect(() => { menuMusic.setContext(stage === 'game' ? 'game' : 'menu'); }, [stage]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const round = useRef<GameRound | null>(null);
  const stageRef = useRef(stage);
  /**
   * Migawka ustawień rundy robiona dokładnie w chwili jej uruchomienia —
   * dzięki refowi efekt zależy wyłącznie od etapu/klucza rundy, więc zmiana
   * opcji w trakcie gry nie restartuje silnika, a start bierze bieżące opcje.
   * Refy aktualizują się w efekcie (nie w trakcie renderu), a kolejność
   * deklaracji PRZED efektem silnika gwarantuje świeżą migawkę na starcie.
   */
  const roundSetupRef = useRef({ participants, primary, secondary, displayMode, quality });
  useEffect(() => {
    stageRef.current = stage;
    roundSetupRef.current = { participants, primary, secondary, displayMode, quality };
  });

  const stepPrimary = useCallback((step: number) => setPrimary(i => (i + step + rules.primary.length) % rules.primary.length), [rules.primary.length]);
  const stepSecondary = useCallback((step: number) => setSecondary(i => (i + step + rules.secondary.length) % rules.secondary.length), [rules.secondary.length]);
  const changeDisplay = (next: DisplayMode) => { setDisplayMode(next); try { localStorage.setItem('joypad-display-mode', next); } catch { /* optional */ } };
  const changeQuality = (next: RenderQuality) => { setQuality(next); try { localStorage.setItem('joypad-render-quality', next); } catch { /* optional */ } };

  useEffect(() => { remember(`${id}.primary`, primary); remember(`${id}.secondary`, secondary); }, [id, primary, secondary]);

  const start = useCallback(() => {
    remember('game', id);
    // Start rundy idzie pod kurtyną w kolorze gry — menu znika, arena wstaje.
    curtain.begin(info.accent, () => {
      const pads = padHost.slots().filter((p): p is NonNullable<typeof p> => p !== null);
      const humans: Racer[] = pads.length ? pads.map(p => ({ slot: p.slot, name: p.nick, color: COLORS[p.slot], isBot: false })) : [{ slot: 0, name: 'GRACZ 1', color: COLORS[0], isBot: false }];
      const bots: Racer[] = [];
      if (id === 'race' || id === 'snake' || id === 'league') {
        for (let slot = 0; slot < 4 && bots.length < secondary; slot++) {
          if (humans.some(h => h.slot === slot)) continue;
          bots.push({ slot, name: `BOT ${bots.length + 1}`, color: COLORS[slot], isBot: true });
        }
      }
      setParticipants([...humans, ...bots]);
      setResult(null); setHud(null);
      setRoundKey(i => i + 1);
      setStage('game');
      gameAudio.init(); gameAudio.uiClick();
    });
  }, [curtain, id, info.accent, secondary]);

  useEffect(() => {
    padHost.onPauseRequest = () => round.current?.togglePause();
    return () => { padHost.onPauseRequest = null; };
  }, []);

  useEffect(() => {
    if (!result) return;
    const score = Math.max(0, ...result.players.map(player => player.score));
    setRecord(previous => {
      const next = Math.max(previous, score);
      try { localStorage.setItem(`joypad-record-${id}`, String(next)); } catch { /* optional */ }
      return next;
    });
  }, [id, result]);

  useEffect(() => {
    padHost.setMenuOptions(stage === 'menu' ? {
      revision: `${displayMode}/${quality}`,
      primaryLabel: rules.primaryLabel, primaryValue: rules.primary[primary],
      secondaryLabel: rules.secondaryLabel, secondaryValue: rules.secondary[secondary],
    } : undefined);
    if (stage === 'over' && result) {
      padHost.setScreen('over', { winnerSlot: result.winnerSlot, winnerName: result.title, allWon: result.allWon });
      for (const p of result.players) if (!p.isBot) padHost.sendFx(p.slot, result.allWon || result.winnerSlot === p.slot ? 'win' : 'lose');
    } else padHost.setScreen(stage);
  }, [stage, result, primary, secondary, rules, displayMode, quality]);

  useEffect(() => {
    if (stage !== 'game' || !roundKey || !canvas.current) return;
    let cancelled = false;
    const { participants, primary, secondary, displayMode, quality } = roundSetupRef.current;
    const config = {
      players: participants, padInputs: padHost.inputs, primary, secondary, displayMode, quality,
      onHud: (next: RoundHud) => {
        if (cancelled) return;
        setHud(next);
        for (const p of next.players) if (!p.isBot) padHost.sendArcadeHud(p.slot, {
          countdown: next.countdown,
          paused: next.paused,
          score: p.score,
          timeLeft: next.timeLeft,
          title: next.objective,
          detail: next.powerUp ? `${next.powerUp.label}${next.powerUp.count > 1 ? ` ×${next.powerUp.count}` : ''} · ${p.detail}` : p.detail,
          value: p.value,
          maxValue: p.maxValue,
        });
      },
      onFx: (slot: number, fx: Parameters<typeof padHost.sendFx>[1]) => padHost.sendFx(slot, fx),
      onFinish: (next: RoundResult) => { if (!cancelled) { setResult(next); setStage('over'); } },
    };
    void createRound(id, canvas.current, config).then(engine => {
      if (cancelled) return;
      round.current = engine;
      engine.start();
    }).catch(error => { console.error('Nie udało się włączyć gry', error); if (!cancelled) setStage('menu'); });
    return () => { cancelled = true; round.current?.destroy(); round.current = null; };
  }, [roundKey, stage, id]);

  const handleCommand = useCallback((command: RemoteCommand) => {
    const current = stageRef.current;
    if (showPads && current === 'menu') { window.dispatchEvent(new CustomEvent('joypad-dialog-command', { detail: command })); return; }
    if (command === 'home' || (command === 'back' && current === 'menu')) { onExit(); return; }
    if (current === 'menu') {
      if (command === 'left') stepPrimary(-1);
      if (command === 'right') stepPrimary(1);
      if (command === 'up') stepSecondary(1);
      if (command === 'down') stepSecondary(-1);
      if (command === 'select') start();
    } else if (current === 'game') {
      if (command === 'pause' || command === 'back' || command === 'select') round.current?.togglePause();
    } else if (current === 'over') {
      if (command === 'select' || command === 'restart') start();
      if (command === 'back') setStage('menu');
    }
  }, [onExit, start, stepPrimary, stepSecondary, showPads]);

  const lastRemote = useRef(0);
  useEffect(() => {
    if (remote && remote.id !== lastRemote.current) { lastRemote.current = remote.id; handleCommand(remote.command); }
  }, [remote, handleCommand]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (stageRef.current === 'game' || e.target instanceof HTMLInputElement) return;
      if (e.code === 'Enter' && e.target instanceof Element && e.target.closest('button,summary,a')) return;
      const controls: Record<string, RemoteCommand> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'select', Escape: 'back' };
      if (controls[e.code]) { e.preventDefault(); handleCommand(controls[e.code]); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [handleCommand]);

  const mute = () => { gameAudio.init(); gameAudio.setMuted(!muted); setMuted(!muted); };
  const cssVars = { '--game-accent': info.accent, '--game-soft': info.accentSoft } as React.CSSProperties;

  if (stage === 'menu') return <>
    <GameSetup info={info} music={menuMusicOn} onMusic={() => toggleMenuMusic(!menuMusicOn)} onExit={onExit} onStart={start} onPads={() => setShowPads(true)} hint={rules.hint} win={rules.win}>
      <OptionStepper title={rules.primaryLabel} value={rules.primary[primary]} accent={info.accent} change={stepPrimary} help="Pilot: ← / →" /><OptionStepper title={rules.secondaryLabel} value={rules.secondary[secondary]} accent={info.accent} change={stepSecondary} help="Pilot: ↑ / ↓" /><Segmented title="WIDOK ARENY" values={['shared', 'split'] as const} value={displayMode} onChange={changeDisplay} accent={info.accent} labels={{ shared: 'WSPÓLNY', split: 'SPLIT-SCREEN' }} /><Segmented title="PROFIL SPRZĘTU" values={['performance', 'balanced', 'quality'] as const} value={quality} onChange={changeQuality} accent={info.accent} labels={{ performance: 'PŁYNNOŚĆ', balanced: 'BALANS', quality: 'DETAL' }} />
    </GameSetup>
    {showPads && <ConnectionsScreen onClose={() => setShowPads(false)} />}
    <ScreenCurtain state={curtain.state} />
  </>;

  if (stage === 'over' && result) return <>
    <GameResults info={info} title={result.title} subtitle={result.subtitle} players={result.players} winnerSlot={result.winnerSlot} allWon={result.allWon} record={record} onRestart={start} onSettings={() => curtain.begin(info.accent, () => setStage('menu'))} onExit={onExit} />
    <ScreenCurtain state={curtain.state} />
  </>;

  return (
    <>
    <div className={`arcade-page arcade-${id} flex h-screen min-h-[360px] flex-col overflow-hidden text-white`} style={cssVars}>
      <div className="z-20 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#0b0e12]/95 px-3 py-2 sm:px-5"><div className="flex min-w-0 items-center gap-2 sm:gap-4"><div className="arcade-title truncate text-sm font-bold sm:text-lg" style={{ color: info.accent }}>{info.title}</div><span className="hidden rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-300 sm:block">{hud?.status || 'ŁADOWANIE ARENY…'}</span></div>
        <div className="flex items-center gap-1.5 font-mono2 text-sm font-bold sm:gap-2 sm:text-lg"><Timer size={16} style={{ color: info.accent }} /> {formatTime(hud?.timeLeft ?? 0)}</div>
        <div className="flex items-center gap-1"><span className="hidden rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-500 sm:block">{displayMode === 'split' ? 'SPLIT' : 'SHARED'} · {quality.toUpperCase()}</span><button onClick={mute} title={muted ? 'Włącz dźwięk' : 'Wycisz'} className="arcade-icon">{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><button onClick={() => setShowPads(true)} title="Pady i kod pokoju" className="arcade-icon"><Smartphone size={17} /></button><button onClick={() => round.current?.togglePause()} title="Pauza (P)" className="arcade-icon"><Pause size={17} /></button><button onClick={() => setStage('menu')} title="Zakończ rundę" className="arcade-icon text-amber-300"><Home size={17} /></button><button onClick={onExit} title="Wróć do JoyPad" className="arcade-icon text-orange-300"><Gamepad2 size={17} /></button></div>
      </div>
      <div className="relative min-h-0 flex-1 bg-[#06090c]"><canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={`Arena gry ${info.title}`} />
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-[11px] font-bold backdrop-blur sm:left-5 sm:top-4 sm:text-sm" style={{ color: info.accent }}>{hud?.objective || rules.win}</div>
        {hud?.powerUp && <div className={`pointer-events-none absolute right-3 top-3 z-10 w-[min(205px,52vw)] rounded-xl border bg-black/75 px-3 py-2.5 shadow-2xl backdrop-blur sm:right-5 sm:top-4 ${hud.powerUp.rolling ? 'animate-pulse' : ''}`} style={{ borderColor: `${hud.powerUp.color}66`, boxShadow: `0 10px 30px ${hud.powerUp.color}20` }}>
          <div className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[.16em] text-white/55"><Zap size={13} style={{ color: hud.powerUp.color }} /> BONUS NA TRASIE</div>
          <div className="mt-1 flex items-center justify-between gap-2"><b className="truncate text-sm font-black" style={{ color: hud.powerUp.color }}>{hud.powerUp.label}</b>{hud.powerUp.count > 1 && <span className="shrink-0 rounded-full px-1.5 py-0.5 font-mono2 text-[11px] font-bold text-black" style={{ background: hud.powerUp.color }}>×{hud.powerUp.count}</span>}</div>
          <div className="mt-1 text-[10px] leading-tight text-white/60">{hud.powerUp.hint}</div>
        </div>}
        {hud?.countdown !== undefined && hud.countdown > 0 && <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/30"><span className="joy-kicker text-white/70">PRZYGOTUJ SIĘ</span><span key={Math.ceil(hud.countdown)} className="count-pop arcade-title text-8xl font-black drop-shadow-lg sm:text-9xl" style={{ color: info.accent, textShadow: `0 0 70px ${info.accent}99` }}>{Math.ceil(hud.countdown)}</span></div>}
        {startFlash && <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center"><span className="start-flash arcade-title text-7xl font-black sm:text-9xl" style={{ color: info.accent, textShadow: `0 0 90px ${info.accent}` }}>START</span></div>}
        {hud?.paused && <PauseSheet game={info.title} onResume={() => round.current?.togglePause()} onExit={onExit} />}
        {!hud && <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-300"><LoaderCircle size={20} className="animate-spin" /> Ładowanie areny…</div>}
        {showPads && <div className="absolute inset-0 z-40 flex items-center justify-center overflow-auto bg-black/80 p-4 backdrop-blur" onClick={() => setShowPads(false)}><div className="w-full max-w-2xl" onClick={e => e.stopPropagation()}><PadHostPanel players={PLAYER_DEFS} onClose={() => setShowPads(false)} context="arcade" /></div></div>}
      </div>
      <div className="z-10 flex min-h-[76px] shrink-0 gap-2 overflow-x-auto border-t border-white/10 bg-[#0b0e12] p-2 sm:justify-center sm:p-3">{hud?.players.map(p => <div key={p.slot} className="min-w-[142px] flex-1 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 sm:max-w-[250px]"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold" style={{ color: p.color }}>{p.name}{p.isBot && <span className="ml-1 text-[9px] text-slate-500">BOT</span>}</span><b className="font-mono2 text-base" style={{ color: p.color }}>{p.score}</b></div><div className="mt-1 truncate text-[11px] text-slate-400">{p.detail}</div>{p.value !== undefined && <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, p.value / (p.maxValue || 100) * 100))}%`, background: p.color }} /></div>}</div>)}</div>
    </div>
    <ScreenCurtain state={curtain.state} />
    </>
  );
}
