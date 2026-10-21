import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { ChevronRight, Gauge, Pause, Play, RotateCcw, Volume2, VolumeX, X } from 'lucide-react';
import { padUrlFor } from '../net/protocol';
import { usePadHost } from '../pad/PadHostPanel';
import { PLAYER_DEFS } from '../game/types';
import { THEMES } from '../platform/profile';
import { useConsolePreferences } from '../console/preferences';
import { interfaceGamepad } from '../console/uiControl';
import { pick } from './script';
import { FilmLanguageProvider, SCENE_VIEWS, type LiveData } from './scenes';
import { FilmScore } from './score';
import { filmScript } from './script';
import {
  buildTimeline, chaptersOf, downgradeTier, formatClock, qualityTier, readTierEnv, resolveFrame, scoreEvents,
  storyboard, validateScript, type FilmFrame, type QualityTier,
} from './timeline';
import { useT } from '../platform/i18n';
import { FILM_WARM_AFTER_MS, PANE_HOLD_MS, PANE_PREFETCH_AFTER_MS, PANE_READY_EVENT, sceneNeedsClips } from './ready';

/**
 * Odtwarzacz filmu: jedno miejsce, w którym czas spotyka się z obrazem.
 *
 * Trzy tryby, wybierane same — bez pytania użytkownika:
 *   • `high`  — pełna reżyseria (ruch, wideo z nagrań, wszystkie efekty),
 *   • `lite`  — bez wideo i ciężkich efektów (słabsze urządzenie, oszczędzanie danych),
 *   • `static`— storyboard: klatki reprezentatywne każdej sceny, bez animacji
 *              (ograniczony ruch w systemie albo bardzo słaby sprzęt).
 *
 * Filtr działa też w drugą stronę: jeśli przez pierwsze sekundy klatki nie
 * wyrabiają, tryb sam się obniża w trakcie — nikt nie patrzy na pokaz slajdów
 * tylko dlatego, że przeglądarka zgłosiła za dużo rdzeni.
 */

export interface FilmProps {
  /** `welcome` — pierwsze uruchomienie, `manual` — powtórka z ustawień. */
  mode: 'welcome' | 'manual';
  onDone: (reason: 'ended' | 'skipped') => void;
}

const STAGE = { width: 1920, height: 1080 };
const TIER_ORDER: QualityTier[] = ['high', 'lite', 'static'];

export function Film({ mode, onDone }: FilmProps) {
  const { language } = useT();
  const prefs = useConsolePreferences();
  const host = usePadHost();
  const script = filmScript;
  const timeline = useMemo(() => buildTimeline(script.scenes), [script.scenes]);
  const shots = useMemo(() => storyboard(timeline), [timeline]);
  const events = useMemo(() => scoreEvents(script.scenes), [script.scenes]);
  const chapters = useMemo(() => chaptersOf(timeline), [timeline]);

  const reduced = prefs.motion === 'reduced' || (() => { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } })();
  const [tier, setTier] = useState<QualityTier>(() => qualityTier({ ...readTierEnv(), reduced }));
  const [manualTier, setManualTier] = useState<QualityTier | null>(null);
  const activeTier = manualTier ?? tier;
  const [frame, setFrame] = useState<FilmFrame>(() => resolveFrame(timeline, 0));
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(!prefs.sound);
  const [scale, setScale] = useState(1);
  const [dpr, setDpr] = useState(1);
  const [chrome, setChrome] = useState(true);
  const [shotIndex, setShotIndex] = useState(0);
  const [qr, setQr] = useState('');

  const msRef = useRef(0);
  const pausedRef = useRef(false);
  // Bramka gotowości scen z nagraniami (patrz `ready.ts`): gdy wchodzimy w scenę
  // z klipami, zegar na chwilę staje, żeby widz nie zobaczył pustych paneli.
  const holdRef = useRef(0);
  const clipsReady = useRef(new Set<string>());
  const clipsWaited = useRef(new Set<string>());
  const frameTimes = useRef<number[]>([]);
  const scoreRef = useRef<FilmScore | null>(null);
  const restoredFocus = useRef<HTMLElement | null>(null);
  const idleTimer = useRef<number | undefined>(undefined);

  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => { if (import.meta.env.DEV) for (const problem of validateScript(script.scenes)) console.warn('[film]', problem); }, [script.scenes]);
  // Podgrzewanie klipu: gdy scena już leci, w tle pobiera się nagranie NASTĘPNEJ sceny
  // z klipami. Serwer podglądu (i GitHub Pages) trzyma `previews/` w pamięci podręcznej,
  // więc panel dostaje plik natychmiast i bramka gotowości prawie nigdy nie musi czekać.
  // Start dopiero po `PANE_PREFETCH_AFTER_MS`, żeby nie konkurować z tym, co widać teraz.
  // Pobieranie nagrań: jedno miejsce, jedno konto pobranych klipów. Kolejno, nie
  // równolegle — film ma się odtwarzać płynnie, a nie walczyć o pasmo z własną rozgrzewką.
  const prefetched = useRef(new Set<string>());
  const prefetch = useCallback(async (stems: readonly string[]) => {
    for (const stem of stems) {
      if (prefetched.current.has(stem)) continue;
      prefetched.current.add(stem);
      try {
        await fetch(`${import.meta.env.BASE_URL}previews/${stem}.mp4`, { cache: 'force-cache' });
      } catch { /* brak sieci to nie powód, żeby przerywać film — panele mają plakaty */ }
    }
  }, []);

  // Klip sceny, która idzie następna: pobierany chwilę po wejściu w bieżącą scenę.
  useEffect(() => {
    if (activeTier === 'static') return;
    const index = timeline.scenes.findIndex(scene => scene.id === frame.scene.id);
    const next = timeline.scenes.slice(index + 1).find(scene => sceneNeedsClips(scene));
    if (!next?.videos?.length) return;
    const timer = window.setTimeout(() => { void prefetch(next.videos ?? []); }, PANE_PREFETCH_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [activeTier, frame.scene.id, prefetch, timeline]);

  // Reszta nagrań filmu: w trybie pełnym startują jeszcze w pierwszych scenach (te są
  // lekkie — iskra, okładki, kod QR), więc w chwili wejścia w scenę z rozgrywką klipy
  // są już w pamięci podręcznej. Bez tego pobieranie zaczynało się dopiero wtedy, gdy
  // widz patrzył na scenę potrzebującą nagrania — dokładnie to czuć było jako „za długo
  // się wczytuje”. Tryby `lite`/`static` tego nie robią: tam nagrania są przez projekt lżejsze.
  useEffect(() => {
    if (activeTier !== 'high') return;
    const all = [...new Set(timeline.scenes.flatMap(scene => scene.videos ?? []))];
    if (!all.length) return;
    const timer = window.setTimeout(() => { void prefetch(all); }, FILM_WARM_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, [activeTier, prefetch, timeline]);

  useEffect(() => {
    const onReady = (event: Event) => {
      const sceneId = (event as CustomEvent<string>).detail;
      if (!sceneId) return;
      clipsReady.current.add(sceneId);
      if (resolveFrame(timeline, msRef.current).scene.id === sceneId) holdRef.current = 0;
    };
    window.addEventListener(PANE_READY_EVENT, onReady);
    return () => window.removeEventListener(PANE_READY_EVENT, onReady);
  }, [timeline]);

  // --- Skala sceny: 1920×1080 wpisane w okno, z listkami po bokach. ---
  useEffect(() => {
    const measure = () => {
      const fit = Math.min(window.innerWidth / STAGE.width, window.innerHeight / STAGE.height);
      setScale(Math.max(.2, fit));
      setDpr(window.devicePixelRatio || 1);
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('orientationchange', measure); };
  }, []);

  // --- Kod QR: prawdziwy pokój, a gdy go nie ma — prawdziwe zaproszenie. ---
  const code = host.code;
  const joinUrl = useMemo(() => {
    try {
      if (code) return padUrlFor(code, host.joinToken);
      return `${location.origin}${location.pathname}#pad`;
    } catch { return '#pad'; }
  }, [code, host.joinToken]);
  useEffect(() => {
    let active = true;
    void import('qrcode')
      .then(({ default: QR }) => QR.toDataURL(joinUrl, { width: 420, margin: 2, color: { dark: '#120d0a', light: '#ffffff' } }))
      .then(src => { if (active) setQr(src); })
      .catch(() => { /* bez QR zostaje ramka i opis */ });
    return () => { active = false; };
  }, [joinUrl]);
  const live: LiveData = useMemo(() => ({
    qr,
    code: code || '—',
    ready: host.status === 'ready' || host.relay === 'online',
    players: host.pads
      .filter(pad => pad.profile)
      .slice(0, 4)
      .map(pad => ({
        name: pad.nick || 'GRACZ',
        // Kolor pada to jego motyw z profilu; gdy go nie ma — kolor slotu.
        color: THEMES[pad.profile?.theme ?? 'amber'] ?? PLAYER_DEFS[pad.slot % PLAYER_DEFS.length]?.color ?? '#f6ad55',
      })),
  }), [qr, code, host.status, host.relay, host.pads]);

  // --- Dźwięk: aranżacja z osi czasu, wygenerowana w przeglądarce. ---
  useEffect(() => {
    const score = new FilmScore();
    scoreRef.current = score;
    return () => { score.dispose(); scoreRef.current = null; };
  }, []);
  useEffect(() => {
    const score = scoreRef.current;
    if (!score) return;
    if (muted) { score.stop(); return; }
    if (!score.arm(true)) return;
    score.play(events, msRef.current);
  }, [events, muted, activeTier]);
  useEffect(() => {
    const score = scoreRef.current;
    if (!score) return;
    if (paused) score.pause(); else score.resume();
  }, [paused]);

  // --- Sterowanie: klawiatura, pad USB/pilot, przyciski ekranu. ---
  const finish = useCallback((reason: 'ended' | 'skipped') => {
    scoreRef.current?.stop();
    onDone(reason);
  }, [onDone]);

  const seek = useCallback((ms: number) => {
    const next = Math.max(0, Math.min(timeline.total - 1, ms));
    msRef.current = next;
    setFrame(resolveFrame(timeline, next));
    const score = scoreRef.current;
    if (score && !muted) score.play(events, next);
  }, [events, muted, timeline]);

  const jump = useCallback((direction: 1 | -1) => {
    const current = chapters.findIndex(chapter => frame.index === chapter.index);
    const next = chapters[Math.max(0, Math.min(chapters.length - 1, current + direction))];
    if (!next) return;
    if (next.index === frame.index) { if (direction === 1) seek(next.at + next.ms + 1); return; }
    setShotIndex(Math.max(0, shots.findIndex(shot => shot.index === next.index)));
    seek(next.at + 20);
  }, [chapters, frame.index, seek, shots]);

  const bumpChrome = useCallback(() => {
    setChrome(true);
    window.clearTimeout(idleTimer.current);
    idleTimer.current = window.setTimeout(() => setChrome(false), 3200);
  }, []);

  const command = useCallback((action: 'pause' | 'skip' | 'next' | 'prev' | 'replay' | 'quality' | 'mute' | 'advance') => {
    bumpChrome();
    switch (action) {
      case 'pause': setPaused(value => !value); break;
      case 'skip': finish('skipped'); break;
      case 'next': jump(1); break;
      case 'prev': clipsWaited.current.clear(); holdRef.current = 0; jump(-1); break;
      case 'replay': scoreRef.current?.stop(); msRef.current = 0; setShotIndex(0); setFrame(resolveFrame(timeline, 0)); clipsWaited.current.clear(); holdRef.current = 0; setPaused(false); break;
      case 'quality': setManualTier(current => TIER_ORDER[(TIER_ORDER.indexOf(current ?? tier) + 1) % TIER_ORDER.length]); break;
      case 'mute': setMuted(value => !value); break;
      case 'advance': setShotIndex(index => index + 1); break;
    }
  }, [bumpChrome, finish, jump, tier, timeline]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const key = event.key;
      const handled = [' ', 'Enter', 'Escape', 'ArrowRight', 'ArrowLeft', 'r', 'R', 'q', 'Q', 'm', 'M'].includes(key);
      if (!handled) return;
      event.preventDefault();
      if (key === ' ' || key === 'Enter') command(activeTier === 'static' ? 'advance' : 'pause');
      else if (key === 'Escape') command('skip');
      else if (key === 'ArrowRight') command(activeTier === 'static' ? 'advance' : 'next');
      else if (key === 'ArrowLeft') command('prev');
      else if (key === 'r' || key === 'R') command('replay');
      else if (key === 'q' || key === 'Q') command('quality');
      else command('mute');
    };
    const onRemote = (event: Event) => {
      const detail = (event as CustomEvent<string>).detail;
      if (detail === 'back' || detail === 'home') command('skip');
      else if (detail === 'select') command(activeTier === 'static' ? 'advance' : 'pause');
      else if (detail === 'right') command('next');
      else if (detail === 'left') command('prev');
      else if (detail === 'y' || detail === 'x') command('quality');
    };
    const onPointer = () => bumpChrome();
    window.addEventListener('keydown', onKey);
    window.addEventListener('joypad-dialog-command', onRemote);
    window.addEventListener('pointermove', onPointer, { passive: true });
    bumpChrome();
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('joypad-dialog-command', onRemote);
      window.removeEventListener('pointermove', onPointer);
      window.clearTimeout(idleTimer.current);
    };
  }, [activeTier, bumpChrome, command]);

  // Pad USB: film jest modalny, więc czyta przyciski sam zamiast oddawać je
  // silnikowi interfejsu (inaczej A uruchomiłoby grę pod filmem).
  useEffect(() => {
    const MAP: Record<number, string> = { 0: 'select', 1: 'back', 2: 'x', 3: 'y', 8: 'back', 9: 'home', 12: 'up', 13: 'down', 14: 'left', 15: 'right' };
    const pressed = new Set<number>();
    const timer = window.setInterval(() => {
      const pad = interfaceGamepad();
      if (!pad) { pressed.clear(); return; }
      pad.buttons.forEach((button, index) => {
        const name = MAP[index];
        const down = button.pressed || button.value > .5;
        if (!name) return;
        if (down && !pressed.has(index)) {
          pressed.add(index);
          if (name === 'back' || name === 'home') command('skip');
          else if (name === 'select') command(activeTier === 'static' ? 'advance' : 'pause');
          else if (name === 'right') command('next');
          else if (name === 'left') command('prev');
          else if (name === 'y') command('quality');
          else if (name === 'x') command('mute');
        } else if (!down) pressed.delete(index);
      });
    }, 90);
    return () => window.clearInterval(timer);
  }, [activeTier, command]);

  // --- Oś czasu: rAF dla wersji animowanych, jeden krok na klatkę storyboardu. ---
  useEffect(() => {
    if (activeTier === 'static') return;
    let raf = 0;
    let stop = false;
    let last = 0;
    const step = (now: number) => {
      if (stop) return;
      const dt = last === 0 ? 16 : Math.min(120, now - last);
      last = now;
      if (!pausedRef.current) {
        // Bramka: nowa scena z nagraniami zatrzymuje zegar raz na scenę, najwyżej `PANE_HOLD_MS`.
        // Bez tego scena „przelatywała", zanim klipy zdążyły oddać pierwszą klatkę.
        const at = resolveFrame(timeline, msRef.current).scene;
        if (sceneNeedsClips(at) && !clipsReady.current.has(at.id) && !clipsWaited.current.has(at.id) && holdRef.current <= 0) {
          clipsWaited.current.add(at.id);
          holdRef.current = PANE_HOLD_MS;
        }
        if (holdRef.current > 0) holdRef.current = Math.max(0, holdRef.current - dt);
        else msRef.current = Math.min(timeline.total, msRef.current + dt);
        setFrame(resolveFrame(timeline, msRef.current));
        // Adaptacja: jeśli klatki nie wyrabiają, zejdź o poziom niżej (raz na ~1,5 s).
        if (!manualTier) {
          frameTimes.current.push(dt);
          if (frameTimes.current.length >= 45) {
            const average = frameTimes.current.reduce((sum, value) => sum + value, 0) / frameTimes.current.length;
            frameTimes.current = [];
            if (average > 34) setTier(current => downgradeTier(current));
          }
        }
        if (msRef.current >= timeline.total - 1) { finish('ended'); return; }
      }
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { stop = true; cancelAnimationFrame(raf); };
  }, [activeTier, finish, manualTier, timeline]);

  useEffect(() => {
    if (activeTier !== 'static') return;
    if (shotIndex >= shots.length) { finish('ended'); return; }
    const shot = shots[shotIndex];
    seek(shot.at);
    const timer = window.setTimeout(() => setShotIndex(index => index + 1), shot.ms);
    return () => window.clearTimeout(timer);
  }, [activeTier, finish, seek, shotIndex, shots]);

  // Hook eksportu (tylko w trybie deweloperskim): `scripts/cinema/render.mjs`
  // ustawia klatkę po klatce DOKŁADNIE ten sam film, który widzi widz.
  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const api = {
      total: timeline.total,
      scenes: timeline.scenes.map(scene => ({ id: scene.id, startMs: scene.startMs, ms: scene.ms })),
      seek: (ms: number) => { msRef.current = Math.max(0, Math.min(timeline.total, ms)); setFrame(resolveFrame(timeline, msRef.current)); },
      pause: () => setPaused(true),
      resume: () => setPaused(false),
    };
    (window as unknown as { __joypadFilm?: typeof api }).__joypadFilm = api;
    return () => { delete (window as unknown as { __joypadFilm?: typeof api }).__joypadFilm; };
  }, [timeline]);

  useEffect(() => {
    const hidden = () => { if (document.hidden) setPaused(true); };
    document.addEventListener('visibilitychange', hidden);
    restoredFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.documentElement;
    root.dataset.film = '1';
    return () => {
      root.removeAttribute('data-film');
      document.removeEventListener('visibilitychange', hidden);
      restoredFocus.current?.focus?.({ preventScroll: true });
    };
  }, []);

  const SceneView = SCENE_VIEWS[frame.scene.view];
  const deviceScale = scale * dpr;
  const camera = frame.camera;
  const hint = interfaceGamepad() ? pick(script.ui.padHints, language) : pick(script.ui.keyHints, language);
  const tierLabel: Record<QualityTier, string> = {
    high: pick(script.ui.qualityHigh, language),
    lite: pick(script.ui.qualityLite, language),
    static: pick(script.ui.qualityStatic, language),
  };

  return (
    <FilmLanguageProvider value={language}>
      <div
        className={`film-root ${chrome ? 'is-chrome' : ''}`}
        data-tier={activeTier}
        role="dialog"
        aria-modal="true"
        aria-label={`${pick(script.title, language)} — ${pick(script.subtitle, language)}`}
        onPointerDown={bumpChrome}
      >
        <div className="film-stage" style={{ width: STAGE.width, height: STAGE.height, transform: `translate(-50%, -50%) scale(${scale.toFixed(4)})` }}>
          <div
            className="film-camera"
            style={{
              transform: `translate3d(${camera.x.toFixed(1)}px, ${camera.y.toFixed(1)}px, 0) rotate(${camera.rot.toFixed(3)}deg) scale(${camera.scale.toFixed(4)})`,
            }}
          >
            <SceneView frame={frame} scene={frame.scene} language={language} tier={activeTier} live={live} deviceScale={deviceScale} />
          </div>
          <span className="film-veil" style={{ opacity: frame.veil.toFixed(3) }} aria-hidden="true" />
          <span className="film-grain" aria-hidden="true" />
          <span className="film-vignette" aria-hidden="true" />
        </div>

        <header className="film-chrome is-top">
          <span className="film-chrome-brand">
            <b>{pick(script.ui.eyebrow, language)}</b>
            <i>{pick(frame.scene.chapter, language)}</i>
          </span>
          <span className="film-chrome-meta">
            <button type="button" className="film-chrome-chip" onClick={() => command('quality')} title={pick(script.ui.quality, language)}>
              <Gauge size={15} />
              {manualTier ? tierLabel[manualTier] : `${pick(script.ui.qualityAuto, language)} · ${tierLabel[tier]}`}
            </button>
            <button type="button" className="film-chrome-chip" onClick={() => command('mute')} aria-pressed={muted} title="M">
              {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <span className="film-chrome-clock">{formatClock(frame.ms)} / {formatClock(timeline.total)}</span>
            <span className="film-chrome-count">{String(frame.index + 1).padStart(2, '0')}/{String(chapters.length).padStart(2, '0')}</span>
          </span>
        </header>

        <footer className="film-chrome is-bottom">
          <div className="film-chrome-controls">
            <button type="button" className="film-button is-primary" onClick={() => command(activeTier === 'static' ? 'advance' : 'pause')}>
              {paused || activeTier === 'static' ? <Play size={17} /> : <Pause size={17} />}
              <span>{activeTier === 'static' ? pick(script.ui.next, language) : paused ? pick(script.ui.resume, language) : pick(script.ui.pause, language)}</span>
            </button>
            <button type="button" className="film-button" onClick={() => command('replay')}><RotateCcw size={16} /><span>{pick(script.ui.replay, language)}</span></button>
            <button type="button" className="film-button" onClick={() => command('skip')}><X size={16} /><span>{pick(script.ui.skip, language)}</span></button>
          </div>
          <div className="film-chrome-progress" role="list">
            {chapters.map(chapter => {
              const local = frame.index === chapter.index ? (frame.t / chapter.ms) : frame.ms > chapter.at ? 1 : 0;
              return (
                <button
                  type="button"
                  role="listitem"
                  className={`film-chapter ${frame.index === chapter.index ? 'is-current' : ''} ${frame.ms >= chapter.at ? 'is-played' : ''}`}
                  key={chapter.index}
                  style={{ '--chapter-width': String(chapter.ms), '--chapter-fill': `${(Math.max(0, Math.min(1, local)) * 100).toFixed(1)}%` } as CSSProperties}
                  onClick={() => { msRef.current = chapter.at + 10; setFrame(resolveFrame(timeline, chapter.at + 10)); setShotIndex(Math.max(0, shots.findIndex(shot => shot.index === chapter.index))); scoreRef.current?.play(events, chapter.at + 10); bumpChrome(); }}
                  title={pick(chapter.title, language)}
                >
                  <i />
                </button>
              );
            })}
          </div>
          <span className="film-chrome-hint">
            <ChevronRight size={14} aria-hidden="true" />
            {activeTier === 'static' ? pick(script.ui.storyboard, language) : hint}
          </span>
        </footer>

        {paused && activeTier !== 'static' && (
          <button type="button" className="film-pause-scrim" onClick={() => command('pause')} aria-label={pick(script.ui.resume, language)}>
            <Play size={54} />
            <span>{pick(script.ui.resume, language)}</span>
          </button>
        )}
        {mode === 'welcome' && <span className="film-welcome-tag" aria-hidden="true">JOYPAD</span>}
      </div>
    </FilmLanguageProvider>
  );
}
