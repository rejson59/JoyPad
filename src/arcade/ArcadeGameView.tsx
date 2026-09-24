import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Gamepad2, Home, Keyboard, LoaderCircle, Pause, Play, RotateCcw, Settings2, Smartphone, Sparkles, Timer, Trophy, Users, Volume2, VolumeX } from 'lucide-react';
import { gameAudio } from '../game/audio';
import { PLAYER_DEFS } from '../game/types';
import { padHost } from '../net/padHost';
import type { RemoteCommand, RemoteEvent } from '../net/protocol';
import { usePadHost, PadHostPanel } from '../pad/PadHostPanel';
import { gameInfo, type GameId } from './catalog';
import { COLORS, type DisplayMode, type GameRound, type Racer, type RenderQuality, type RoundConfig, type RoundHud, type RoundResult } from './runtime';

type ArcadeId = Exclude<GameId, 'tanks'>;
type Stage = 'menu' | 'game' | 'over';

const RULES: Record<ArcadeId, { primaryLabel: string; primary: string[]; secondaryLabel: string; secondary: string[]; hint: string; action: string; win: string }> = {
  race: { primaryLabel: 'OKRĄŻENIA', primary: ['2 okrążenia', '3 okrążenia', '4 okrążenia'], secondaryLabel: 'RYWALE SI', secondary: ['Bez botów', '1 bot', '2 boty', '3 boty'], hint: 'Kieruj joystickiem w kierunku drogi. Poza asfaltem samochód zwalnia. Ładunki na trasie uzupełniają turbo.', action: 'TURBO', win: 'Pierwszy na mecie wygrywa.' },
  orbit: { primaryLabel: 'LICZBA FAL', primary: ['3 fale', '5 fal', '7 fal'], secondaryLabel: 'ZAGROŻENIE', secondary: ['Rekrut', 'Pilot', 'Weteran'], hint: 'Lewa gałka porusza statkiem, prawa celuje. Bez prawej gałki statek sam namierza wroga. Zbieraj naprawy i osłony.', action: 'OGIEŃ', win: 'Odeprzyjcie wszystkie fale razem.' },
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
      // Neon Circuit uses the uploaded Three.js city/kart game on capable GPUs.
      // The existing Canvas race remains the explicit low-capability fallback.
      if (hasWebGL2(canvas)) {
        try { return new (await import('./neon/NeonCircuitRound')).NeonCircuitRound(canvas, config); }
        catch (error) { console.warn('Neon Circuit WebGL niedostępny — używam fallbacku Canvas', error); }
      }
      return new (await import('./games/Race')).RaceRound(canvas, config);
    }
    case 'orbit': {
      if (hasWebGL2(canvas)) return new (await import('./webgl/Arcade3D')).Arcade3DRound(canvas, config, 'orbit');
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
  return <div className="arcade-option rounded-2xl p-4"><div className="joy-kicker text-slate-400">{title}</div><div className="mt-3 flex items-center justify-between gap-2"><button onClick={() => change(-1)} aria-label={`Poprzednie: ${title}`} className="joy-arrow"><ChevronLeft size={18} /></button><span className="text-center text-sm font-bold sm:text-base" style={{ color: accent }}>{value}</span><button onClick={() => change(1)} aria-label={`Następne: ${title}`} className="joy-arrow"><ChevronRight size={18} /></button></div><div className="mt-3 text-center text-[11px] text-slate-500">{help}</div></div>;
}

function Segmented<T extends string>({ title, values, value, onChange, accent, labels }: { title: string; values: readonly T[]; value: T; onChange: (value: T) => void; accent: string; labels: Record<T, string> }) {
  return <div className="arcade-option rounded-2xl p-4"><div className="joy-kicker text-slate-400">{title}</div><div className="mt-3 grid grid-cols-2 gap-1.5">{values.map(option => <button key={option} onClick={() => onChange(option)} className={`rounded-lg border px-2 py-2 text-[11px] font-bold transition ${value === option ? 'border-white/30 bg-white/15 text-white' : 'border-white/10 bg-black/15 text-slate-500 hover:text-slate-300'}`} style={value === option ? { color: accent, borderColor: `${accent}88` } : undefined}>{labels[option]}</button>)}</div><div className="mt-3 text-center text-[11px] text-slate-500">{value === 'split' ? '2–4 widoki na jednym ekranie' : 'Wspólna arena dla całej kanapy'}</div></div>;
}

export function ArcadeGameView({ id, onExit, remote }: { id: ArcadeId; onExit: () => void; remote: RemoteEvent | null }) {
  const info = gameInfo(id), rules = RULES[id];
  const [stage, setStage] = useState<Stage>('menu');
  const [primary, setPrimary] = useState(id === 'race' || id === 'snake' || id === 'league' ? 1 : 0);
  const [secondary, setSecondary] = useState(id === 'race' || id === 'league' ? 2 : 1);
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => readPreference('joypad-display-mode', 'shared', ['shared', 'split'] as const));
  const [quality, setQuality] = useState<RenderQuality>(() => readPreference('joypad-render-quality', 'balanced', ['performance', 'balanced', 'quality'] as const));
  const [hud, setHud] = useState<RoundHud | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [record, setRecord] = useState(() => readLocalRecord(id));
  const [participants, setParticipants] = useState<Racer[]>([]);
  const [roundKey, setRoundKey] = useState(0);
  const [showPads, setShowPads] = useState(false);
  const [muted, setMuted] = useState(gameAudio.muted);
  const host = usePadHost();
  const canvas = useRef<HTMLCanvasElement>(null);
  const round = useRef<GameRound | null>(null);
  const stageRef = useRef(stage); stageRef.current = stage;

  const stepPrimary = useCallback((step: number) => setPrimary(i => (i + step + rules.primary.length) % rules.primary.length), [rules.primary.length]);
  const stepSecondary = useCallback((step: number) => setSecondary(i => (i + step + rules.secondary.length) % rules.secondary.length), [rules.secondary.length]);
  const changeDisplay = (next: DisplayMode) => { setDisplayMode(next); try { localStorage.setItem('joypad-display-mode', next); } catch { /* optional */ } };
  const changeQuality = (next: RenderQuality) => { setQuality(next); try { localStorage.setItem('joypad-render-quality', next); } catch { /* optional */ } };

  const start = useCallback(() => {
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
  }, [id, secondary]);

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
      primaryLabel: rules.primaryLabel, primaryValue: rules.primary[primary],
      secondaryLabel: rules.secondaryLabel, secondaryValue: rules.secondary[secondary],
    } : undefined);
    if (stage === 'over' && result) {
      padHost.setScreen('over', { winnerSlot: result.winnerSlot, winnerName: result.title, allWon: result.allWon });
      for (const p of result.players) if (!p.isBot) padHost.sendFx(p.slot, result.allWon || result.winnerSlot === p.slot ? 'win' : 'lose');
    } else padHost.setScreen(stage);
  }, [stage, result, primary, secondary, rules]);

  useEffect(() => {
    if (stage !== 'game' || !roundKey || !canvas.current) return;
    let cancelled = false;
    const config = {
      players: participants, padInputs: padHost.inputs, primary, secondary, displayMode, quality,
      onHud: (next: RoundHud) => {
        if (cancelled) return;
        setHud(next);
        for (const p of next.players) if (!p.isBot) padHost.sendArcadeHud(p.slot, { score: p.score, timeLeft: next.timeLeft, title: next.objective, detail: p.detail, value: p.value, maxValue: p.maxValue });
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
    // Ustawienia są migawką robioną dokładnie w chwili uruchomienia rundy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey, stage]);

  const handleCommand = useCallback((command: RemoteCommand) => {
    const current = stageRef.current;
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
  }, [onExit, start, stepPrimary, stepSecondary]);

  const lastRemote = useRef(0);
  useEffect(() => {
    if (remote && remote.id !== lastRemote.current) { lastRemote.current = remote.id; handleCommand(remote.command); }
  }, [remote, handleCommand]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (stageRef.current === 'game' || e.target instanceof HTMLInputElement) return;
      const controls: Record<string, RemoteCommand> = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'select', Escape: 'back' };
      if (controls[e.code]) { e.preventDefault(); handleCommand(controls[e.code]); }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [handleCommand]);

  const mute = () => { gameAudio.init(); gameAudio.setMuted(!muted); setMuted(!muted); };
  const background = `${import.meta.env.BASE_URL}${info.cover}`;
  const cssVars = { '--game-accent': info.accent, '--game-soft': info.accentSoft } as React.CSSProperties;

  if (stage === 'menu') return (
    <div className={`arcade-page arcade-${id} relative min-h-screen overflow-hidden text-white`} style={cssVars}>
      <div className="arcade-texture pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-[1280px] px-4 pb-16 sm:px-7">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 py-5">
          <button onClick={onExit} className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2 text-xs font-bold text-white transition hover:border-white/50"><ArrowLeft size={15} /> JOYPAD / GRY</button>
          <div className="joy-kicker flex items-center gap-2 text-white/60"><span className="h-2 w-2 rounded-full" style={{ background: info.accent }} /> {info.eyebrow} <span className="text-white/30">/</span> {info.number}</div>
          <button onClick={() => setShowPads(true)} className="flex items-center gap-2 rounded-full border border-white/20 bg-black/30 px-4 py-2 text-xs font-semibold hover:bg-white/10"><Smartphone size={15} /> Pady {host.pads.length}/4 <span className="font-mono2" style={{ color: info.accent }}>{host.code}</span></button>
        </header>

        <section className="arcade-hero relative mt-7 flex min-h-[390px] items-end overflow-hidden rounded-[30px] border border-white/15 p-6 sm:min-h-[440px] sm:p-10">
          <img src={background} alt="" className="absolute inset-0 h-full w-full object-cover" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(5,8,12,.96)_0%,rgba(5,8,12,.78)_45%,rgba(5,8,12,.12)_100%),linear-gradient(0deg,rgba(5,8,12,.92),transparent_70%)]" />
          <div className="relative z-10 max-w-[650px]"><div className="joy-kicker" style={{ color: info.accent }}>◆ {info.eyebrow} / {info.genre.toUpperCase()}</div>
            <h1 className="arcade-title mt-4 text-[44px] font-extrabold leading-[.96] tracking-[-.055em] sm:text-[76px]">{info.title}</h1>
            <p className="mt-5 max-w-[510px] text-sm leading-relaxed text-white/80 sm:text-base">{info.description}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3"><button onClick={start} className="arcade-start flex items-center gap-3 rounded-xl px-6 py-3.5 text-sm font-black text-[#101117] transition hover:-translate-y-0.5 hover:brightness-110" style={{ background: info.accent, boxShadow: `0 16px 45px ${info.accent}50` }}><Play size={18} fill="currentColor" /> ROZPOCZNIJ GRĘ <ArrowRight size={17} /></button><span className="rounded-full border border-white/20 bg-black/40 px-3 py-2 text-xs text-white/80">{info.players}</span><span className="rounded-full border border-white/15 bg-black/35 px-3 py-2 text-xs font-bold" style={{ color: info.accent }}>{info.renderTag}</span></div>
          </div>
          <span className="pointer-events-none absolute right-7 top-3 text-[140px] font-black leading-none text-white/[.08]">{info.number}</span>
        </section>

        <div className="mt-6 grid gap-4 lg:grid-cols-[minmax(0,1.45fr)_minmax(280px,1fr)]">
          <div className="arcade-panel rounded-[26px] p-5 sm:p-6"><div className="mb-4 flex items-center gap-2 font-bold"><Settings2 size={18} style={{ color: info.accent }} /> Ustawienia rozgrywki</div>
            <div className="grid gap-3 sm:grid-cols-2"><OptionStepper title={rules.primaryLabel} value={rules.primary[primary]} accent={info.accent} change={stepPrimary} help="Pilot: ← / →" /><OptionStepper title={rules.secondaryLabel} value={rules.secondary[secondary]} accent={info.accent} change={stepSecondary} help="Pilot: ↑ / ↓" /><Segmented title="WIDOK ARENY" values={['shared', 'split'] as const} value={displayMode} onChange={changeDisplay} accent={info.accent} labels={{ shared: 'WSPÓLNY', split: 'SPLIT-SCREEN' }} /><Segmented title="PROFIL SPRZĘTU" values={['performance', 'balanced', 'quality'] as const} value={quality} onChange={changeQuality} accent={info.accent} labels={{ performance: 'PŁYNNOŚĆ', balanced: 'BALANS', quality: 'DETAL' }} /></div>
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-xs leading-relaxed text-slate-300"><b style={{ color: info.accent }}>JAK GRAĆ</b> · {rules.hint}<br /><span className="text-slate-400">{rules.win} Telefon: {info.controls}</span></div>
            <div className="mt-3 flex items-center gap-2 text-[10px] text-slate-500"><span className="status-dot" /> Render 60 FPS · tekstury proceduralne · {quality === 'performance' ? 'DPR 1× / priorytet płynności' : quality === 'quality' ? 'DPR do 2× / maksymalna ostrość' : 'DPR adaptacyjny / bezpieczny balans'}</div>
          </div>
          <div className="arcade-panel rounded-[26px] p-5 sm:p-6"><div className="mb-4 flex items-center justify-between"><div className="flex items-center gap-2 font-bold"><Users size={18} style={{ color: info.accent }} /> Gracze</div><span className="text-xs text-slate-400">{host.pads.length} podłączonych</span></div>
            <div className="grid grid-cols-2 gap-2">{PLAYER_DEFS.map((p, i) => { const pad = host.pads.find(x => x.slot === i); return <div key={p.id} className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: COLORS[i] }} /><span className="min-w-0 truncate text-xs font-semibold text-white/85">{pad?.nick || (i === 0 && !host.pads.length ? 'Klawiatura' : 'Wolne')}</span></div>; })}</div>
            <div className="mt-5 grid grid-cols-3 gap-2 text-center text-[10px] text-slate-500"><div className="rounded-xl border border-white/10 bg-black/20 p-2"><b className="block text-sm text-white">{info.features[0]}</b>MECHANIKA</div><div className="rounded-xl border border-white/10 bg-black/20 p-2"><b className="block text-sm text-white">{info.features[1]}</b>TRYB</div><div className="rounded-xl border border-white/10 bg-black/20 p-2"><b className="block text-sm text-white">{info.features[2]}</b>DNA GRY</div></div>
            <button onClick={() => setShowPads(true)} className="mt-4 flex items-center gap-2 text-xs font-semibold hover:underline" style={{ color: info.accent }}><Smartphone size={15} /> Zaproś telefon · kod {host.code} <ArrowRight size={14} /></button>
            <div className="mt-2 text-[11px] leading-relaxed text-slate-500">Można zagrać samemu z klawiaturą. Telefony dołączone podczas rundy zagrają od następnej.</div>
          </div>
        </div>
        <div className="mt-5 flex items-center justify-center gap-2 text-center text-xs text-slate-500"><Keyboard size={14} /> Klawiatura: WSAD / strzałki + Q / Enter · P / ESC = pauza</div>
      </div>
      {showPads && <div className="fixed inset-0 z-50 flex items-center justify-center overflow-auto bg-black/80 p-4 backdrop-blur" onClick={() => setShowPads(false)}><div className="w-full max-w-2xl" onClick={e => e.stopPropagation()}><PadHostPanel players={PLAYER_DEFS} onClose={() => setShowPads(false)} context="arcade" /></div></div>}
    </div>
  );

  if (stage === 'over' && result) return (
    <div className={`arcade-page arcade-${id} relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-4 py-10 text-white`} style={cssVars}>
      <img src={background} alt="" className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-25" /><div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0a101d]/70 via-[#0a101d]/95 to-[#0a101d]" />
      <div className="relative z-10 w-full max-w-[700px] text-center"><div className="joy-kicker" style={{ color: info.accent }}>{info.eyebrow} / KONIEC RUNDY</div>
        {result.allWon ? <Sparkles className="mx-auto mt-5 h-14 w-14" style={{ color: info.accent }} /> : <Trophy className="mx-auto mt-5 h-14 w-14" style={{ color: info.accent }} />}
        <h1 className="arcade-title mt-4 text-4xl font-extrabold leading-tight sm:text-6xl">{result.title}</h1><p className="mt-3 text-sm text-slate-300">{result.subtitle}</p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/30 px-3 py-1.5 text-[11px] text-slate-300"><span className="text-slate-500">LOKALNY REKORD</span><b style={{ color: info.accent }}>{record}</b></div>
        <div className="mt-8 overflow-hidden rounded-2xl border border-white/15 bg-black/35 text-left"><div className="joy-kicker flex justify-between border-b border-white/10 px-5 py-3 text-slate-400"><span>DRUŻYNA / KLASYFIKACJA</span><span>WYNIK</span></div>
          {result.players.map((p, i) => <div key={p.slot} className="flex items-center justify-between gap-2 border-b border-white/[.08] px-5 py-3 last:border-none"><div className="flex items-center gap-3"><span className="font-mono2 text-xs text-slate-500">{String(i + 1).padStart(2, '0')}</span><span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color }} /><span className="text-sm font-bold">{p.name}</span>{p.isBot && <span className="text-[10px] text-slate-500">BOT</span>}</div><div className="text-right"><b className="font-mono2 text-lg" style={{ color: p.color }}>{p.score}</b><span className="ml-3 text-[11px] text-slate-400">{p.detail}</span></div></div>)}
        </div>
        <div className="mt-8 flex flex-wrap justify-center gap-3"><button onClick={start} className="flex items-center gap-2 rounded-xl px-6 py-3 text-sm font-black text-[#101117] hover:brightness-110" style={{ background: info.accent }}><RotateCcw size={17} /> REWANŻ</button><button onClick={() => setStage('menu')} className="arcade-secondary"><Settings2 size={17} /> ZMIEŃ USTAWIENIA</button><button onClick={onExit} className="arcade-secondary"><Home size={17} /> WSZYSTKIE GRY</button></div>
      </div>
    </div>
  );

  return (
    <div className={`arcade-page arcade-${id} flex h-screen min-h-[360px] flex-col overflow-hidden text-white`} style={cssVars}>
      <div className="z-20 flex shrink-0 items-center justify-between gap-2 border-b border-white/10 bg-[#0b0e12]/95 px-3 py-2 sm:px-5"><div className="flex min-w-0 items-center gap-2 sm:gap-4"><div className="arcade-title truncate text-sm font-bold sm:text-lg" style={{ color: info.accent }}>{info.title}</div><span className="hidden rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-300 sm:block">{hud?.status || 'ŁADOWANIE ARENY…'}</span></div>
        <div className="flex items-center gap-1.5 font-mono2 text-sm font-bold sm:gap-2 sm:text-lg"><Timer size={16} style={{ color: info.accent }} /> {formatTime(hud?.timeLeft ?? 0)}</div>
        <div className="flex items-center gap-1"><span className="hidden rounded-full border border-white/10 px-2 py-1 text-[10px] font-bold text-slate-500 sm:block">{displayMode === 'split' ? 'SPLIT' : 'SHARED'} · {quality.toUpperCase()}</span><button onClick={mute} title={muted ? 'Włącz dźwięk' : 'Wycisz'} className="arcade-icon">{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</button><button onClick={() => setShowPads(true)} title="Pady i kod pokoju" className="arcade-icon"><Smartphone size={17} /></button><button onClick={() => round.current?.togglePause()} title="Pauza (P)" className="arcade-icon"><Pause size={17} /></button><button onClick={() => setStage('menu')} title="Zakończ rundę" className="arcade-icon text-amber-300"><Home size={17} /></button><button onClick={onExit} title="Wróć do JoyPad" className="arcade-icon text-orange-300"><Gamepad2 size={17} /></button></div>
      </div>
      <div className="relative min-h-0 flex-1 bg-[#06090c]"><canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={`Arena gry ${info.title}`} />
        <div className="pointer-events-none absolute left-3 top-3 z-10 rounded-xl border border-white/10 bg-black/60 px-3 py-2 text-[11px] font-bold backdrop-blur sm:left-5 sm:top-4 sm:text-sm" style={{ color: info.accent }}>{hud?.objective || rules.win}</div>
        {hud?.countdown !== undefined && hud.countdown > 0 && <div className="pointer-events-none absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/30"><span className="joy-kicker text-white/70">PRZYGOTUJ SIĘ</span><span className="arcade-title text-8xl font-black drop-shadow-lg" style={{ color: info.accent }}>{Math.ceil(hud.countdown)}</span></div>}
        {hud?.paused && <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-black/70 backdrop-blur-sm"><Pause className="h-12 w-12" style={{ color: info.accent }} /><h2 className="arcade-title mt-3 text-4xl font-bold">PAUZA</h2><p className="mt-2 text-xs text-slate-400">P / ESC lub pilot administratora, aby kontynuować</p><button onClick={() => round.current?.togglePause()} className="mt-5 flex items-center gap-2 rounded-xl px-6 py-2.5 font-bold text-[#101117]" style={{ background: info.accent }}><Play size={17} /> KONTYNUUJ</button></div>}
        {!hud && <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-slate-300"><LoaderCircle size={20} className="animate-spin" /> Ładowanie areny…</div>}
        {showPads && <div className="absolute inset-0 z-40 flex items-center justify-center overflow-auto bg-black/80 p-4 backdrop-blur" onClick={() => setShowPads(false)}><div className="w-full max-w-2xl" onClick={e => e.stopPropagation()}><PadHostPanel players={PLAYER_DEFS} onClose={() => setShowPads(false)} context="arcade" /></div></div>}
      </div>
      <div className="z-10 flex min-h-[76px] shrink-0 gap-2 overflow-x-auto border-t border-white/10 bg-[#0b0e12] p-2 sm:justify-center sm:p-3">{hud?.players.map(p => <div key={p.slot} className="min-w-[142px] flex-1 rounded-xl border border-white/10 bg-white/[.035] px-3 py-2 sm:max-w-[250px]"><div className="flex items-center justify-between gap-2"><span className="truncate text-xs font-bold" style={{ color: p.color }}>{p.name}{p.isBot && <span className="ml-1 text-[9px] text-slate-500">BOT</span>}</span><b className="font-mono2 text-base" style={{ color: p.color }}>{p.score}</b></div><div className="mt-1 truncate text-[11px] text-slate-400">{p.detail}</div>{p.value !== undefined && <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, p.value / (p.maxValue || 100) * 100))}%`, background: p.color }} /></div>}</div>)}</div>
    </div>
  );
}
