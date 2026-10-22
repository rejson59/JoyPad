import { useRecordedMoments } from '../platform/useRecordedMoments';
import type { MomentEvent } from '../platform/momentRecorder';
import { readChoice, remember } from '../console/history';
import { GameSetup } from '../console/GameSetup';
import { PlamekOrbit } from '../console/PlamekOrbit';
import { GameResults } from '../console/GameResults';
import { ConnectionsScreen } from '../components/ConnectionsScreen';
import { PauseSheet } from '../console/PauseSheet';
import { clearLeaveWish, isLeaving, wishToLeave } from '../lib/exitWish';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ChevronLeft, ChevronRight, Gamepad2, Home, Pause, Smartphone, Timer, Volume2, VolumeX, Zap } from 'lucide-react';
import { gameAudio } from '../game/audio';
import { menuMusic } from '../game/menuMusic';
import { PLAYER_DEFS } from '../game/types';
import { padHost } from '../net/padHost';
import type { RemoteCommand, RemoteEvent } from '../net/protocol';
import { PadHostPanel } from '../pad/PadHostPanel';
import { ScreenCurtain, SegmentedControl, useCurtain } from '../components/motion';
import { localizeGame, gameInfo, type GameId } from './catalog';
import { nextTournamentRound, type MatchMode } from './matchModes';
import { useMenuMusic } from '../lib/useMenuMusic';
import { useT, type Language } from '../platform/i18n';
import { COLORS, type DisplayMode, type GameRound, type Racer, type RenderQuality, type RoundConfig, type RoundHud, type RoundResult } from './runtime';
// Jeden HUD dla wszystkich gier: oprawa rundy żyje w `console/RoundChrome`,
// więc arcade i Stalowy Front wyglądają jak ta sama konsola (runda 21).
import { RoundArena, RoundChip, RoundCountdown, RoundDeck, RoundFrame, RoundIconButton, RoundLoading, RoundObjective, RoundOverlay, RoundPlayerCard, RoundPowerUp, RoundStartFlash, RoundTimer, RoundTitle, RoundTopBar } from '../console/RoundChrome';

type ArcadeId = Exclude<GameId, 'tanks' | 'blockcraft'>;
type Stage = 'menu' | 'game' | 'over';
type GameRules = { primaryLabel: string; primary: string[]; secondaryLabel: string; secondary: string[]; hint: string; action: string; win: string };
const RULES: Record<ArcadeId, Record<Language, GameRules>> = {
  race: {
    pl: { primaryLabel: 'OKRĄŻENIA', primary: ['2 okrążenia', '3 okrążenia', '4 okrążenia'], secondaryLabel: 'RYWALE SI', secondary: ['Bez botów', '1 bot', '2 boty', '3 boty'], hint: 'Kieruj joystickiem w kierunku drogi. Zbieraj skrzynie z bonusami: gdy pojawi się karta, AKCJA używa przedmiotu; bez karty daje krótki turbo-zryw.', action: 'AKCJA / TURBO', win: 'Pierwszy na mecie wygrywa.' },
    en: { primaryLabel: 'LAPS', primary: ['2 laps', '3 laps', '4 laps'], secondaryLabel: 'AI RIVALS', secondary: ['No bots', '1 bot', '2 bots', '3 bots'], hint: 'Steer in the direction of the road. Pick up item crates: ACTION uses a held item; when you have none, it gives a short turbo burst.', action: 'ACTION / TURBO', win: 'First across the finish line wins.' },
  },
  orbit: {
    pl: { primaryLabel: 'STATEK', primary: ['Interceptor', 'Valkyrie', 'Titan'], secondaryLabel: 'SIŁA WROGA', secondary: ['Rekrut', 'Pilot', 'Weteran'], hint: 'Joystick prowadzi statek, OGIEŃ strzela z dział. Pełne wychylenie gałki albo przytrzymanie AKCJI = dopalacz. Rakieta odpala się sama przy pełnym namierzeniu celu.', action: 'OGIEŃ', win: 'Rozbijcie całą wrogą eskadrę.' },
    en: { primaryLabel: 'SHIP', primary: ['Interceptor', 'Valkyrie', 'Titan'], secondaryLabel: 'ENEMY FORCE', secondary: ['Recruit', 'Pilot', 'Veteran'], hint: 'Use the stick to fly and FIRE to shoot. Push the stick fully or hold ACTION to boost. Homing missiles launch automatically when a target is locked.', action: 'FIRE', win: 'Defeat the enemy squadron.' },
  },
  snake: {
    pl: { primaryLabel: 'CEL PUNKTOWY', primary: ['8 punktów', '12 punktów', '16 punktów'], secondaryLabel: 'RYWALE SI', secondary: ['Bez botów', '1 bot', '2 boty', '3 boty'], hint: 'Użyj kierunków na telefonie lub klawiaturze. Zbieraj impulsy, omijaj stalowe przeszkody i rywali. Przytrzymaj SPRINT, by przyspieszyć — zużywa energię.', action: 'SPRINT', win: 'Pierwszy do celu punktowego wygrywa.' },
    en: { primaryLabel: 'SCORE TO WIN', primary: ['8 points', '12 points', '16 points'], secondaryLabel: 'AI RIVALS', secondary: ['No bots', '1 bot', '2 bots', '3 bots'], hint: 'Tap a direction on your phone or use the keyboard. Collect energy, avoid steel obstacles and rivals. Hold SPRINT to speed up — it uses energy.', action: 'SPRINT', win: 'First to the score target wins.' },
  },
  league: {
    pl: { primaryLabel: 'LIMIT GOLI', primary: ['3 gole', '5 goli', '7 goli'], secondaryLabel: 'BOTY', secondary: ['Bez botów', '1 bot', '2 boty', '3 boty'], hint: 'Joystick wskazuje kierunek jazdy — auto samo skręca i przyspiesza, puszczona gałka hamuje. Przytrzymaj AKCJĘ, by użyć boosta; żółte pola uzupełniają paliwo. Niebiescy atakują w prawo, pomarańczowi w lewo.', action: 'BOOST', win: 'Pierwsza drużyna do limitu goli wygrywa; remis po 3 minutach rozstrzyga złoty gol.' },
    en: { primaryLabel: 'GOAL LIMIT', primary: ['3 goals', '5 goals', '7 goals'], secondaryLabel: 'BOTS', secondary: ['No bots', '1 bot', '2 bots', '3 bots'], hint: 'The stick points where you want to drive — the car turns and accelerates by itself, and letting go brakes. Hold ACTION to boost; yellow pads refill it. Blue attacks to the right, orange to the left.', action: 'BOOST', win: 'First team to the goal limit wins; a tie after 3 minutes is settled by a golden goal.' },
  },
  pizza: {
    pl: { primaryLabel: 'DŁUGOŚĆ ZMIANY', primary: ['Krótka · 1:00', 'Zmiana · 2:00', 'Maraton · 3:00'], secondaryLabel: 'TRYB', secondary: ['Współpraca', 'Rywalizacja'], hint: 'Joystick: bieg. Przytrzymaj AKCJĘ — kurier wystrzeli sieć; puść w dole łuku, by nabrać rozpędu. Pizzę rzuca sam, gdy masz klienta przed sobą. Pusty plecak uzupełnisz przy furgonetce.', action: 'SIEĆ', win: 'Dowieźcie jak najwięcej pizz przed końcem zmiany.' },
    en: { primaryLabel: 'SHIFT LENGTH', primary: ['Short · 1:00', 'Shift · 2:00', 'Marathon · 3:00'], secondaryLabel: 'MODE', secondary: ['Co-op', 'Versus'], hint: 'Stick: run. Hold ACTION — your courier shoots a web; let go at the bottom of the arc to gain speed. The pizza throws itself when a customer is ahead of you. Refill an empty bag at the van.', action: 'WEB', win: 'Deliver as many pizzas as you can before the shift ends.' },
  },
};

/**
 * Ustawienia rundy per gra: domyślne indeksy opcji (jak w `RULES`) i to, czy puste sloty
 * zajmują boty. Jedna tabela zamiast rozsianych `id === 'race' || …` — nowa gra to jeden wiersz.
 */
const SETUP: Record<ArcadeId, { primary: number; secondary: number; bots: boolean }> = {
  race: { primary: 1, secondary: 2, bots: true },
  orbit: { primary: 0, secondary: 1, bots: false },
  snake: { primary: 1, secondary: 1, bots: true },
  league: { primary: 1, secondary: 2, bots: true },
  pizza: { primary: 1, secondary: 0, bots: false },
};

function readLocalRecord(id: ArcadeId): number {
  try { return Number(localStorage.getItem(`joypad-record-${id}`) || 0) || 0; } catch { return 0; }
}

function readPreference<T extends string>(key: string, fallback: T, values: readonly T[]): T {
  try { const value = localStorage.getItem(key) as T | null; return value && values.includes(value) ? value : fallback; } catch { return fallback; }
}

/** Dlaczego gra renderuje się tym, czym się renderuje — widoczne w UI i w konsoli. */
export type RenderReport = { game: ArcadeId; webgl2: boolean; engine: 'webgl2' | 'canvas'; reason: string };
let lastRenderReport: RenderReport | null = null;
export function readRenderReport(): RenderReport | null { return lastRenderReport; }
function noteRender(report: RenderReport) {
  lastRenderReport = report;
  // Diagnoza bez zgadywania: jedno pole w konsoli mówi, czemu Pęd jedzie z góry.
  (window as unknown as { joypadRenderReport?: RenderReport }).joypadRenderReport = report;
}
function errorText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Failed to fetch/i.test(message) ? 'brak fragmentu 3D (odśwież)' : message.slice(0, 80);
}

function probeWebGL2(): boolean {
  // Sonda na JEDNORAZOWYM płótnie, z natychmiastowym oddaniem kontekstu. Pytanie płótna
  // gospodarza przypinało do niego kontekst webgl2 i fallback 2D dostawał potem
  // `getContext('2d') === null` (płótno ma jeden kontekst), a porzucone konteksty scen 3D
  // zjadały limit przeglądarki (~16) — po kilku rundach sonda odpowiadała „nie" i gra
  // cicho zrzucała się do widoku z góry, czyli „starej wersji 3D" ze zgłoszenia.
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
}

async function createRound(id: ArcadeId, canvas: HTMLCanvasElement, config: RoundConfig): Promise<GameRound> {
  // Każdy silnik ładuje się dopiero po wybraniu gry — menu nie pobiera całej biblioteki naraz.
  switch (id) {
    case 'race': {
      // Neonowy Pęd korzysta z rozpakowanego miasta i kartów Three.js na obsługiwanych GPU.
      // The existing Canvas race remains the explicit low-capability fallback.
      const webgl2 = probeWebGL2();
      if (webgl2) {
        try {
          const round = new (await import('./neon/NeonCircuitRound')).NeonCircuitRound(canvas, config);
          noteRender({ game: id, webgl2, engine: 'webgl2', reason: '' });
          return round;
        } catch (error) {
          console.warn('Neonowy Pęd: silnik 3D nie wystartował — fallback Canvas', error);
          noteRender({ game: id, webgl2, engine: 'canvas', reason: errorText(error) });
        }
      } else noteRender({ game: id, webgl2: false, engine: 'canvas', reason: config.language === 'en' ? 'no WebGL2' : 'brak WebGL2' });
      return new (await import('./games/Race')).RaceRound(canvas, config);
    }
    case 'orbit': {
      // Orbitalna Fala = STAR CLASH 3D z orbitalna-fala.zip. Bez WebGL2 zostaje klasyczny Orbit 2D.
      const webgl2 = probeWebGL2();
      if (webgl2) {
        try {
          const round = new (await import('./starclash/StarClashRound')).StarClashRound(canvas, config);
          noteRender({ game: id, webgl2, engine: 'webgl2', reason: '' });
          return round;
        } catch (error) {
          console.warn('STAR CLASH: silnik 3D nie wystartował — fallback Canvas', error);
          noteRender({ game: id, webgl2, engine: 'canvas', reason: errorText(error) });
        }
      } else noteRender({ game: id, webgl2: false, engine: 'canvas', reason: config.language === 'en' ? 'no WebGL2' : 'brak WebGL2' });
      return new (await import('./games/Orbit')).OrbitRound(canvas, config);
    }
    case 'snake':
      // Wężowy Wir pozostaje celowo lekki: zawsze renderuje się w Canvas 2D — bez powodu
      // w raporcie, bo to wybór projektu, nie degradacja (chip pokazuje tylko degradacje).
      noteRender({ game: id, webgl2: false, engine: 'canvas', reason: '' });
      return new (await import('./games/Snake')).SnakeRound(canvas, config);
    case 'league': {
      // Turbo League = silnik z nitro-league.zip (src/arcade/league-next) renderujący na płótnie platformy.
      // Prosty prototyp Canvas 2D zostaje wyłącznie tam, gdzie WebGL2 w ogóle nie istnieje — po nieudanym
      // starcie WebGL płótno ma już kontekst 3D i nie da się na nim założyć 2D, więc wtedy zgłaszamy błąd.
      if (probeWebGL2()) {
        noteRender({ game: id, webgl2: true, engine: 'webgl2', reason: '' });
        return new (await import('./league-next/LeagueRound')).LeagueNextRound(canvas, config);
      }
      noteRender({ game: id, webgl2: false, engine: 'canvas', reason: config.language === 'en' ? 'no WebGL2' : 'brak WebGL2' });
      return new (await import('./games/League')).LeagueRound(canvas, config);
    }
    case 'pizza': {
      // WEBZA to czyste Three.js — bez WebGL2 nie ma wersji zastępczej, więc zgłaszamy to wprost
      // (widok wraca do menu zamiast zawisnąć na pustym płótnie).
      if (!probeWebGL2()) throw new Error('WEBZA wymaga WebGL2');
      noteRender({ game: id, webgl2: true, engine: 'webgl2', reason: '' });
      return new (await import('./pizza/PizzaRound')).PizzaRound(canvas, config);
    }
  }
}

function OptionStepper({ title, value, change, accent, help, language }: { title: string; value: string; change: (step: number) => void; accent: string; help: string; language: Language }) {
  /**
   * Wartość jest SAMODZIELNĄ pozycją nawigacji z `data-ui-stepper` (patrz
   * `focusSurface.adjustable`): ←/→ przesuwa opcję pod Plamkiem, a ↑/↓ wychodzi na inną.
   * Wcześniej strzałki obsługiwał rodzic (`stepPrimary`/`stepSecondary`), więc dało się
   * zmieniać tylko dwie pierwsze opcje — reszta ekranu (widok, profil, format) była dla
   * pada nieosiągalna. Strzałki po bokach zostają dla myszy i dotyku.
   */
  const valueRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const node = valueRef.current;
    if (!node) return;
    const onStep = (event: Event) => change((event as CustomEvent<{ delta: number }>).detail.delta > 0 ? 1 : -1);
    node.addEventListener('ui-step', onStep);
    return () => node.removeEventListener('ui-step', onStep);
  }, [change]);
  const prev = `${language === 'en' ? 'Previous' : 'Poprzednie'}: ${title}`, next = `${language === 'en' ? 'Next' : 'Następne'}: ${title}`;
  return <div className="arcade-option rounded-2xl p-4"><div className="joy-kicker text-slate-400">{title}</div><div className="mt-3 flex items-center justify-between gap-2"><button onClick={() => change(-1)} aria-label={prev} className="joy-arrow"><ChevronLeft size={18} /></button><button ref={valueRef} type="button" data-ui-stepper="value" key={value} onClick={() => change(1)} aria-label={next} className="flip-in block min-h-[26px] cursor-pointer appearance-none border-0 bg-transparent p-0 text-center text-sm font-bold sm:text-base" style={{ color: accent }}>{value}</button><button onClick={() => change(1)} aria-label={next} className="joy-arrow"><ChevronRight size={18} /></button></div><div className="mt-3 text-center text-[11px] text-slate-500">{help}</div></div>;
}
function Segmented<T extends string>({ title, values, value, onChange, accent, labels, language }: { title: string; values: readonly T[]; value: T; onChange: (value: T) => void; accent: string; labels: Record<T, string>; language: Language }) {
  const descriptions: Record<string, string> = language === 'en' ? {
    split: '2–4 views on one screen', shared: 'One shared arena for the whole crew',
    performance: 'Lower resolution, smoother play', quality: 'More detail, higher GPU load', balanced: 'A balance of smoothness and quality',
  } : {
    split: '2–4 widoki na jednym ekranie', shared: 'Wspólna arena dla całej ekipy',
    performance: 'Niższa rozdzielczość, priorytet płynności', quality: 'Więcej detali, większe obciążenie GPU', balanced: 'Równowaga płynności i jakości',
  };
  return <div className="arcade-option rounded-2xl p-4"><div className="joy-kicker text-slate-400">{title}</div>
    <div className="mt-3"><SegmentedControl options={values.map(v => ({ value: v, label: labels[v] }))} value={value} onChange={onChange} accent={accent} label={title} /></div>
    <div className="mt-3 text-center text-[11px] text-slate-500">{descriptions[value] || ''}</div></div>;
}

export function ArcadeGameView({ id, onExit, remote }: { id: ArcadeId; onExit: () => void; remote: RemoteEvent | null }) {
  const { language, t } = useT();
  const info = localizeGame(gameInfo(id), language), rules = RULES[id][language];
  const [stage, setStage] = useState<Stage>('menu');
  const [primary, setPrimary] = useState(() => readChoice(`${id}.primary`, rules.primary.map((_, i) => i), SETUP[id].primary));
  const [secondary, setSecondary] = useState(() => readChoice(`${id}.secondary`, rules.secondary.map((_, i) => i), SETUP[id].secondary));
  const [displayMode, setDisplayMode] = useState<DisplayMode>(() => readPreference('joypad-display-mode', 'shared', ['shared', 'split'] as const));
  const [quality, setQuality] = useState<RenderQuality>(() => readPreference('joypad-render-quality', 'balanced', ['performance', 'balanced', 'quality'] as const));
  const [matchMode, setMatchMode] = useState<MatchMode>(() => readPreference('joypad-match-mode', 'classic', ['classic', 'tournament', '2v2'] as const));
  const [tournamentRound, setTournamentRound] = useState(() => { try { return Number(localStorage.getItem(`joypad-tournament-${id}`) || 0) % 3; } catch { return 0; } });
  const notifiedResult = useRef<RoundResult | null>(null);
  const { moments, replayNotice, begin: beginRecording, finish: finishRecording } = useRecordedMoments(id);
  const [hud, setHud] = useState<RoundHud | null>(null);
  const [result, setResult] = useState<RoundResult | null>(null);
  const [record, setRecord] = useState(() => readLocalRecord(id));
  const [participants, setParticipants] = useState<Racer[]>([]);
  const [roundKey, setRoundKey] = useState(0);
  const [showPads, setShowPads] = useState(false);
  const [renderReport, setRenderReport] = useState<RenderReport | null>(null);
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
  const roundSetupRef = useRef({ participants, primary, secondary, displayMode, quality, language });
  useEffect(() => {
    stageRef.current = stage;
    roundSetupRef.current = { participants, primary, secondary, displayMode, quality, language };
  });

  const stepPrimary = useCallback((step: number) => setPrimary(i => (i + step + rules.primary.length) % rules.primary.length), [rules.primary.length]);
  const stepSecondary = useCallback((step: number) => setSecondary(i => (i + step + rules.secondary.length) % rules.secondary.length), [rules.secondary.length]);
  const changeDisplay = (next: DisplayMode) => { setDisplayMode(next); try { localStorage.setItem('joypad-display-mode', next); } catch { /* optional */ } };
  const changeQuality = (next: RenderQuality) => { setQuality(next); try { localStorage.setItem('joypad-render-quality', next); } catch { /* optional */ } };
  const changeMatchMode = (next: MatchMode) => { setMatchMode(next); try { localStorage.setItem('joypad-match-mode', next); } catch { /* optional */ } };

  useEffect(() => { remember(`${id}.primary`, primary); remember(`${id}.secondary`, secondary); }, [id, primary, secondary]);

  const start = useCallback(() => {
    clearLeaveWish();
    remember('game', id);
    // Start rundy idzie pod kurtyną w kolorze gry — menu znika, arena wstaje.
    curtain.begin(info.accent, () => {
      const pads = padHost.slots().filter((p): p is NonNullable<typeof p> => p !== null);
      const humans: Racer[] = pads.length ? pads.map(p => ({ slot: p.slot, name: p.nick, color: COLORS[p.slot], isBot: false })) : [{ slot: 0, name: language === 'en' ? 'PLAYER 1' : 'GRACZ 1', color: COLORS[0], isBot: false }];
      const bots: Racer[] = [];
      if (SETUP[id].bots) {
        for (let slot = 0; slot < 4 && bots.length < secondary; slot++) {
          if (humans.some(h => h.slot === slot)) continue;
          bots.push({ slot, name: `BOT ${bots.length + 1}`, color: COLORS[slot], isBot: true });
        }
      }
      setParticipants([...humans, ...bots]);
      notifiedResult.current = null;
      setResult(null); setHud(null);
      setRoundKey(i => i + 1);
      setStage('game');
      gameAudio.init(); gameAudio.uiClick();
    });
  }, [curtain, id, info.accent, secondary, language]);

  useEffect(() => {
    // Nowa sesja tej gry = czysta karta: intencja wyjścia z poprzedniego podejścia nie ma
    // prawa blokować START-u po powrocie do menu.
    clearLeaveWish();
    padHost.onPauseRequest = () => { if (!isLeaving()) round.current?.togglePause(); };
    return () => { padHost.onPauseRequest = null; };
  }, []);

  useEffect(() => {
    if (!result) return;
    const score = Math.max(0, ...result.players.map(player => player.score));
    if (matchMode === 'tournament') {
      setTournamentRound(previous => { const next = nextTournamentRound(previous); try { localStorage.setItem(`joypad-tournament-${id}`, String(next)); } catch { /* optional */ } return next; });
    }
    setRecord(previous => {
      const next = Math.max(previous, score);
      try { localStorage.setItem(`joypad-record-${id}`, String(next)); } catch { /* optional */ }
      return next;
    });
  }, [id, result, matchMode]);

  useEffect(() => {
    padHost.setMenuOptions(stage === 'menu' ? {
      revision: `${displayMode}/${quality}`,
      primaryLabel: rules.primaryLabel, primaryValue: rules.primary[primary],
      secondaryLabel: rules.secondaryLabel, secondaryValue: rules.secondary[secondary],
      mode: matchMode, tournamentRound: matchMode === 'tournament' ? tournamentRound + 1 : undefined,
    } : undefined);
    if (stage === 'over' && result) {
      padHost.setScreen('over', { winnerSlot: result.winnerSlot, winnerName: result.title, allWon: result.allWon });
      if (notifiedResult.current !== result) {
        notifiedResult.current = result;
        for (const p of result.players) if (!p.isBot) {
          const won = result.allWon || result.winnerSlot === p.slot;
          padHost.sendFx(p.slot, won ? 'win' : 'lose');
          padHost.sendRoundResult(p.slot, id, won);
        }
      }
    } else padHost.setScreen(stage);
  }, [stage, result, primary, secondary, rules, displayMode, quality, matchMode, tournamentRound, id]);

  useEffect(() => {
    if (stage !== 'game' || !roundKey || !canvas.current) return;
    let cancelled = false;
    const { participants, primary, secondary, displayMode, quality, language } = roundSetupRef.current;
    const recording = beginRecording(language);
    const recorder = recording.events;
    recorder.observe({ timeLeft: 0, countdown: 3, paused: false, players: participants.map(p => ({ ...p, score: 0 })) });
    const config = {
      onFrame: recording.video.frame,
      onMoment: (event: MomentEvent) => recorder.record(event),
      players: participants, padInputs: padHost.inputs, primary, secondary, displayMode, quality, language,
      onHud: (next: RoundHud) => {
        if (cancelled) return;
        recording.video.setPaused(next.paused || next.countdown > 0);
        recorder.observe(next);
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
      onFx: (slot: number, fx: Parameters<typeof padHost.sendFx>[1]) => { recorder.fx(slot, fx); padHost.sendFx(slot, fx); },
      onFinish: (next: RoundResult) => { if (!cancelled) { finishRecording(recording); setResult(next); setStage('over'); } },
    };
    void createRound(id, canvas.current, config).then(engine => {
      setRenderReport(readRenderReport());
      if (cancelled) { engine.destroy(); return; }
      round.current = engine;
      engine.start();
    }).catch(error => { console.error('Nie udało się włączyć gry', error); if (!cancelled) setStage('menu'); });
    return () => { cancelled = true; if (!recording.finished) recording.video.dispose(); round.current?.destroy(); round.current = null; };
  }, [roundKey, stage, id, beginRecording, finishRecording]);

  // Kurtyna to kosmetyka, a komenda potrafi dotrzeć w jej trakcie (przytrzymany przycisk
  // pada, powtórka z telefonu): od „wychodzę" nie ruszamy już pauzy ani startu.
  const leave = useCallback(() => { wishToLeave(); onExit(); }, [onExit]);

  const handleCommand = useCallback((command: RemoteCommand) => {
    // Ruch po menu i po wynikach należy do silnika interfejsu (`useUiControls` +
    // `focusSurface`): on decyduje, gdzie jest następna pozycja, i on mówi o tym Plamkowi.
    // Stąd tu zostaje tylko to, czego interfejs nie załatwia: wyjście, pauza i zatwierdzenie,
    // gdy fokus uciekł z elementów (czyli „start na pałę", bez patrzenia w kafelki).
    const current = stageRef.current;
    // Nakładka padów (PadHostPanel) nie jest <dialog>iem, więc silnik interfejsu jej nie
    // domknie: `back`/`pause` muszą trafić w nią. Bez tego panelu nie dało się zamknąć
    // pilotem, a Escape w trakcie rundy zamiast go sprzątnąć — pauzował grę.
    if (showPads && (command === 'back' || command === 'pause')) { setShowPads(false); return; }
    if (showPads && current === 'menu') { window.dispatchEvent(new CustomEvent('joypad-dialog-command', { detail: command })); return; }
    if (command === 'home') { leave(); return; }
    // BACK ma trzy twarze: pauza w rundzie, wyjście z okna, powrót z wyników do menu.
    if (command === 'back') {
      if (current === 'game') { if (!isLeaving()) round.current?.togglePause(); }
      else if (current === 'menu') leave();
      else if (current === 'over') setStage('menu'); // z wyników do menu — przed oznaczeniem wyjścia
      return;
    }
    if (current === 'game' && (command === 'pause' || command === 'select') && !isLeaving()) round.current?.togglePause();
    // START bez fokusa na elemencie (fokus na `body` lub na tekście) = to, co sugeruje
    // duży napis: w menu rusza partia, w wynikach bierze rewanż.
    // Po „wychodzę" (kurtyna już leci) nie odpalamy nic: dawne zachowanie potrafiło
    // wystartować nową partię dokładnie w tej samej chwili, w której gracz prosił o bibliotekę.
    if (isLeaving()) return;
    if (command === 'select' && (current === 'menu' || current === 'over')) start();
    if (command === 'restart' && current === 'over') start(); // `Y`/skrócony restart — jak dawniej
  }, [leave, showPads, start]);
  const lastRemote = useRef(0);
  useEffect(() => {
    if (remote && remote.id !== lastRemote.current) { lastRemote.current = remote.id; handleCommand(remote.command); }
  }, [remote, handleCommand]);
  // Klawiatura telewizora chodzi tą samą drogą co pad: `uiControl` słucha w fazie
  // przechwytującej i sama wygasza zdarzenie, więc własny nasłuch tylko by dublował
  // ruch (i kasował fokus postawiony przez nawigację).
  const mute = () => { gameAudio.init(); gameAudio.setMuted(!muted); setMuted(!muted); };
  const modeLabels = language === 'en' ? { classic: 'QUICK MATCH', tournament: 'TOURNAMENT', '2v2': '2V2 / TEAMS' } : { classic: 'ZWYKŁA RUNDA', tournament: 'TURNIEJ', '2v2': '2V2 / DRUŻYNY' };
  const displayLabels = language === 'en' ? { shared: 'SHARED', split: 'SPLIT-SCREEN' } : { shared: 'WSPÓLNY', split: 'PODZIELONY EKRAN' };
  const qualityLabels = language === 'en' ? { performance: 'PERFORMANCE', balanced: 'BALANCED', quality: 'QUALITY' } : { performance: 'PŁYNNOŚĆ', balanced: 'BALANS', quality: 'DETAL' };
  const modeTag = matchMode === 'tournament' ? t('game.matchTournament', { n: tournamentRound + 1 }) : matchMode === '2v2' ? '2V2' : displayMode === 'split' ? (language === 'en' ? 'SPLIT' : 'PODZIELONY') : (language === 'en' ? 'SHARED' : 'WSPÓLNY');

  if (stage === 'menu') return <>
    <GameSetup info={info} music={menuMusicOn} onMusic={() => toggleMenuMusic(!menuMusicOn)} onExit={leave} onStart={start} onPads={() => setShowPads(true)} hint={rules.hint} win={rules.win}>
      <OptionStepper title={rules.primaryLabel} value={rules.primary[primary]} accent={info.accent} change={stepPrimary} help={language === 'en' ? 'Remote: ← / →' : 'Pilot: ← / →'} language={language} /><OptionStepper title={rules.secondaryLabel} value={rules.secondary[secondary]} accent={info.accent} change={stepSecondary} help={language === 'en' ? 'Remote: ↑ / ↓' : 'Pilot: ↑ / ↓'} language={language} /><Segmented title={language === 'en' ? 'ARENA VIEW' : 'WIDOK ARENY'} values={['shared', 'split'] as const} value={displayMode} onChange={changeDisplay} accent={info.accent} labels={displayLabels} language={language} /><Segmented title={language === 'en' ? 'HARDWARE PROFILE' : 'PROFIL SPRZĘTU'} values={['performance', 'balanced', 'quality'] as const} value={quality} onChange={changeQuality} accent={info.accent} labels={qualityLabels} language={language} /><Segmented title={language === 'en' ? 'MATCH FORMAT' : 'FORMAT MECZU'} values={['classic', 'tournament', '2v2'] as const} value={matchMode} onChange={changeMatchMode} accent={info.accent} labels={modeLabels} language={language} />
    </GameSetup>
    {showPads && <ConnectionsScreen onClose={() => setShowPads(false)} />}
    <ScreenCurtain state={curtain.state} />
  </>;

  if (stage === 'over' && result) return <>
    <GameResults replayNotice={replayNotice} moments={moments} info={info} title={result.title} subtitle={result.subtitle} players={result.players} winnerSlot={result.winnerSlot} allWon={result.allWon} record={record} onRestart={start} onSettings={() => curtain.begin(info.accent, () => setStage('menu'))} onExit={leave} />
    <ScreenCurtain state={curtain.state} />
  </>;

  return (
    <>
    <RoundFrame accent={info.accent} soft={info.accentSoft}>
      <RoundTopBar
        center={<RoundTimer seconds={hud?.timeLeft ?? 0} icon={<Timer size={16} />} />}
        actions={<>
          {renderReport?.engine === 'canvas' && renderReport.reason && <RoundChip tone="danger" optional icon={<AlertTriangle size={12} />}>{language === 'en' ? `2D MODE · ${renderReport.reason}` : `TRYB 2D · ${renderReport.reason}`}</RoundChip>}
          <RoundChip tone="quiet" optional>{modeTag} · {qualityLabels[quality]}</RoundChip>
          <RoundIconButton label={muted ? t('game.soundOn') : t('game.mute')} onClick={mute}>{muted ? <VolumeX size={17} /> : <Volume2 size={17} />}</RoundIconButton>
          <RoundIconButton label={t('game.pads')} onClick={() => setShowPads(true)}><Smartphone size={17} /></RoundIconButton>
          <RoundIconButton label={t('game.pause')} onClick={() => round.current?.togglePause()}><Pause size={17} /></RoundIconButton>
          <RoundIconButton label={t('game.endRound')} onClick={() => setStage('menu')} tone="accent"><Home size={17} /></RoundIconButton>
          <RoundIconButton label={t('game.back')} onClick={leave} tone="danger"><Gamepad2 size={17} /></RoundIconButton>
        </>}>
        <RoundTitle>{info.title}</RoundTitle>
        <RoundChip optional>{hud?.status || t('game.statusLoading')}</RoundChip>
      </RoundTopBar>
      <RoundArena>
        <canvas ref={canvas} className="absolute inset-0 h-full w-full" aria-label={language === 'en' ? `${info.title} game arena` : `Arena gry ${info.title}`} />
        <RoundObjective>{hud?.objective || rules.win}</RoundObjective>
        {hud?.powerUp && <RoundPowerUp kicker={<><Zap size={13} style={{ color: hud.powerUp.color }} /> {t('game.actionBonus')}</>} label={hud.powerUp.label} count={hud.powerUp.count} color={hud.powerUp.color} hint={hud.powerUp.hint} rolling={hud.powerUp.rolling} />}
        {hud?.countdown !== undefined && hud.countdown > 0 && <RoundCountdown value={hud.countdown} kicker={t('game.ready')} />}
        {startFlash && <RoundStartFlash />}
        {hud?.paused && <PauseSheet game={info.title} onResume={() => { if (!isLeaving()) round.current?.togglePause(); }} onExit={leave} />}
        {!hud && <RoundLoading><PlamekOrbit size={44} /> {t('game.loading')}</RoundLoading>}
        {showPads && <RoundOverlay onClose={() => setShowPads(false)}><PadHostPanel players={PLAYER_DEFS} onClose={() => setShowPads(false)} context="arcade" /></RoundOverlay>}
      </RoundArena>
      <RoundDeck>{hud?.players.map(p => <RoundPlayerCard key={p.slot} name={p.name} color={p.color} score={p.score} detail={p.detail} value={p.value} maxValue={p.maxValue} isBot={p.isBot} />)}</RoundDeck>
    </RoundFrame>
    <ScreenCurtain state={curtain.state} />
    </>
  );
}
