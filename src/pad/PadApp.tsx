import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Gamepad2, Settings, X, Heart, Loader2, LogOut, Maximize2, Pause, Shield, Signal, Skull, Smartphone, Wifi, WifiOff, Zap, Wind, RotateCcw } from 'lucide-react';
import { padClient, type PadClientState } from '../net/padClient';
import { CODE_LENGTH, normalizeCode, normalizeNick, padCodeFromHash, type PadFx, type PadSteer } from '../net/protocol';
import { Joystick } from './Joystick';
import { ConnectionCheck } from './ConnectionCheck';
import { JoypadController, NickEditor } from './JoypadController';
import { DeviceFeatures, type FullscreenStatus, type TiltStatus, type WakeLockStatus } from './DeviceFeatures';
import { HapticsStatus } from './HapticsStatus';
import { haptic, unlockHaptics } from './haptics';

const LS_NICK = 'sf_pad_nick';
const LS_CODE = 'sf_pad_code';
const LS_LAYOUT = 'sf_pad_layout';
const LS_KEEP_AWAKE = 'joypad-keep-screen-awake';

/** Układ ekranu pada (zapamiętywany na telefonie). */
type PadLayoutMode = 'minimal' | 'twin';
interface PadLayout {
  /** Preset: jedna gałka + akcja albo dwa niezależne joysticki. */
  mode: PadLayoutMode;
  /** Drugi joystick do celowania wieżą (pozostaje dla kompatybilności zapisanych ustawień). */
  aimStick: boolean;
  /** Strzelaj automatycznie, gdy gałka celowania jest wychylona do czerwonego pierścienia. */
  autoFire: boolean;
  /** Zamień strony: jazda po prawej, celowanie/ogień po lewej. */
  swap: boolean;
}
const DEFAULT_LAYOUT: PadLayout = { mode: 'twin', aimStick: true, autoFire: true, swap: false };
/** Wychylenie gałki celowania (część zasięgu), od którego działa auto-ogień. */
const AUTO_FIRE_RING = 0.82;

function readLayout(): PadLayout {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_LAYOUT) || '{}') as Partial<PadLayout>;
    const mode: PadLayoutMode = raw.mode === 'minimal' || raw.mode === 'twin'
      ? raw.mode
      : raw.aimStick === false ? 'minimal' : DEFAULT_LAYOUT.mode;
    return {
      mode,
      aimStick: mode === 'twin' && (typeof raw.aimStick !== 'boolean' || raw.aimStick),
      autoFire: mode === 'twin' && (typeof raw.autoFire === 'boolean' ? raw.autoFire : DEFAULT_LAYOUT.autoFire),
      swap: typeof raw.swap === 'boolean' ? raw.swap : DEFAULT_LAYOUT.swap,
    };
  } catch {
    return DEFAULT_LAYOUT;
  }
}

function vibrate(p: number | number[]) { haptic(p); }

const FX_VIBE: Record<PadFx, number | number[]> = {
  fire: 18,
  hit: [40, 30, 40],
  kill: [30, 40, 30, 40, 80],
  dead: [200, 80, 200],
  pickup: [20, 30, 20],
  shield: 25,
  respawn: [40, 40, 40],
  win: [100, 60, 100, 60, 300],
  lose: [300],
};

export default function PadApp() {
  const [st, setSt] = useState<PadClientState>(padClient.state);
  const [code, setCode] = useState(() => padCodeFromHash() || localStorage.getItem(LS_CODE) || '');
  const [nick, setNick] = useState(() => localStorage.getItem(LS_NICK) || '');
  const [flash, setFlash] = useState<string | null>(null);
  const [landscapeHint, setLandscapeHint] = useState(false);
  const [wakeLockEnabled, setWakeLockEnabled] = useState(() => localStorage.getItem(LS_KEEP_AWAKE) === 'on');
  const [wakeLockStatus, setWakeLockStatus] = useState<WakeLockStatus>('off');
  const [fullscreenStatus, setFullscreenStatus] = useState<FullscreenStatus>('off');
  const [tiltEnabled, setTiltEnabled] = useState(false);
  const [tiltStatus, setTiltStatus] = useState<TiltStatus>('off');
  const wakeLock = useRef<{ release: () => Promise<void>; addEventListener?: (type: 'release', listener: () => void) => void; removeEventListener?: (type: 'release', listener: () => void) => void } | null>(null);
  const flashTimer = useRef<number | null>(null);
  const showFlash = useCallback((color: string, duration: number) => {
    setFlash(color);
    if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => { setFlash(null); flashTimer.current = null; }, duration);
  }, []);

  useEffect(() => padClient.subscribe(setSt), []);

  // Nick zmieniony w menu pozostaje też w polu następnego połączenia,
  // nie tylko w localStorage i stanie klienta sieciowego.
  useEffect(() => {
    if (st.nick) setNick(st.nick);
  }, [st.nick]);

  useEffect(() => {
    padClient.onFx = (fx) => {
      vibrate(FX_VIBE[fx]);
      if (fx === 'hit') showFlash('rgba(239,68,68,0.45)', 140);
      if (fx === 'dead') showFlash('rgba(0,0,0,0.8)', 500);
      if (fx === 'kill') showFlash('rgba(251,191,36,0.4)', 250);
      if (fx === 'pickup') showFlash('rgba(74,222,128,0.35)', 200);
      if (fx === 'shield') showFlash('rgba(34,211,238,0.28)', 120);
      if (fx === 'respawn') showFlash('rgba(96,165,250,0.22)', 180);
      if (fx === 'win') showFlash('rgba(251,191,36,0.38)', 320);
      if (fx === 'lose') showFlash('rgba(239,68,68,0.3)', 320);
    };
    return () => {
      padClient.onFx = null;
      if (flashTimer.current !== null) window.clearTimeout(flashTimer.current);
    };
  }, [showFlash]);

  // Auto-connect from QR link (nick opcjonalny — host nada "Telefon N")
  useEffect(() => {
    const c = padCodeFromHash();
    if (c && c.length === CODE_LENGTH && padClient.state.status === 'idle') {
      localStorage.setItem(LS_CODE, c);
      padClient.connect(c, localStorage.getItem(LS_NICK) || '');
    }
  }, []);

  // Slot bez czołgu w trwającej bitwie: brak HUD-u przez >2 s
  const [noTank, setNoTank] = useState(false);
  useEffect(() => {
    if (st.screen !== 'game' || st.game !== 'tanks' || st.status !== 'connected') { setNoTank(false); return; }
    if (st.hud) { setNoTank(false); return; }
    const t = setTimeout(() => setNoTank(true), 2500);
    return () => clearTimeout(t);
  }, [st.screen, st.game, st.status, st.hud]);

  // Orientation hint
  useEffect(() => {
    const check = () => setLandscapeHint(window.innerHeight > window.innerWidth && window.innerWidth < 700);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Fullscreen jest wywoływany wyłącznie z przycisku. Status pokazujemy zamiast
  // po cichu ignorować odrzucenie przez przeglądarkę albo Permissions Policy.
  useEffect(() => {
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    const update = () => setFullscreenStatus(doc.fullscreenElement || doc.webkitFullscreenElement ? 'active' : 'off');
    document.addEventListener('fullscreenchange', update);
    document.addEventListener('webkitfullscreenchange', update);
    update();
    return () => {
      document.removeEventListener('fullscreenchange', update);
      document.removeEventListener('webkitfullscreenchange', update);
    };
  }, []);

  // Wake Lock jest opcjonalny — nie prosimy o niego automatycznie po połączeniu.
  // Po ukryciu karty przeglądarka zwalnia blokadę, więc ponawiamy ją po powrocie.
  useEffect(() => {
    let cancelled = false;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void>; addEventListener?: (type: 'release', listener: () => void) => void; removeEventListener?: (type: 'release', listener: () => void) => void }> } };
    const release = () => {
      const current = wakeLock.current;
      wakeLock.current = null;
      if (current) current.release().catch(() => {});
    };
    const req = async () => {
      if (cancelled || st.status !== 'connected' || !wakeLockEnabled || wakeLock.current) return;
      if (!nav.wakeLock?.request) { setWakeLockStatus('unsupported'); return; }
      setWakeLockStatus('waiting');
      try {
        const wl = await nav.wakeLock.request('screen');
        if (cancelled || !wakeLockEnabled || document.visibilityState !== 'visible') { wl.release().catch(() => {}); return; }
        const onRelease = () => {
          if (wakeLock.current === wl) wakeLock.current = null;
          if (!cancelled) setWakeLockStatus('blocked');
        };
        wl.addEventListener?.('release', onRelease);
        wakeLock.current = wl;
        setWakeLockStatus('ready');
      } catch {
        setWakeLockStatus('blocked');
      }
    };
    if (st.status !== 'connected' || !wakeLockEnabled) {
      release();
      setWakeLockStatus(st.status === 'connected' ? 'off' : 'off');
    } else req();
    const vis = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', vis);
      release();
    };
  }, [st.status, wakeLockEnabled]);

  const changeWakeLock = (enabled: boolean) => {
    setWakeLockEnabled(enabled);
    try { localStorage.setItem(LS_KEEP_AWAKE, enabled ? 'on' : 'off'); } catch { /* optional */ }
  };

  // Żyroskop/przechył to osobny, domyślnie wyłączony tryb. Na iOS prośbę o zgodę
  // wywołujemy bezpośrednio z tego przycisku, a nie z efektu po połączeniu.
  const changeTilt = async () => {
    if (tiltEnabled) {
      setTiltEnabled(false);
      setTiltStatus('off');
      padClient.setInput({ fwd: 0, turn: 0, dirX: 0, dirY: 0 });
      return;
    }
    if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) {
      setTiltStatus('unsupported');
      return;
    }
    setTiltStatus('requesting');
    try {
      const Orientation = window.DeviceOrientationEvent as typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
      const Motion = window.DeviceMotionEvent as typeof DeviceMotionEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };
      const request = Orientation.requestPermission ?? Motion?.requestPermission;
      if (request && await request() !== 'granted') { setTiltStatus('denied'); return; }
      setTiltEnabled(true);
      setTiltStatus('ready');
    } catch {
      setTiltStatus('denied');
    }
  };

  useEffect(() => {
    if (!tiltEnabled) return;
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const onOrientation = (event: DeviceOrientationEvent) => {
      const turn = clamp((event.gamma ?? 0) / 28);
      const fwd = clamp((event.beta ?? 0) / 28);
      padClient.setInput({ turn, fwd, dirX: turn, dirY: -fwd });
    };
    window.addEventListener('deviceorientation', onOrientation);
    return () => window.removeEventListener('deviceorientation', onOrientation);
  }, [tiltEnabled]);

  useEffect(() => {
    if (st.status !== 'connected' && tiltEnabled) {
      setTiltEnabled(false);
      setTiltStatus('off');
    }
  }, [st.status, tiltEnabled]);

  // Block pull-to-refresh / scroll
  useEffect(() => {
    const prev = document.body.style.overscrollBehavior;
    document.body.style.overscrollBehavior = 'none';
    document.documentElement.style.overscrollBehavior = 'none';
    const prevent = (e: TouchEvent) => { if (e.touches.length > 1) e.preventDefault(); };
    document.addEventListener('touchmove', prevent, { passive: false });
    return () => {
      document.body.style.overscrollBehavior = prev;
      document.removeEventListener('touchmove', prevent);
    };
  }, []);

  const connect = () => {
    const c = normalizeCode(code);
    const n = normalizeNick(nick);
    if (c.length !== CODE_LENGTH) return;
    localStorage.setItem(LS_CODE, c);
    localStorage.setItem(LS_NICK, n);
    unlockHaptics();
    padClient.connect(c, n);
  };

  const goFullscreen = async () => {
    unlockHaptics();
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
      const doc = document as Document & { webkitFullscreenElement?: Element | null };
      if (!el.requestFullscreen && !el.webkitRequestFullscreen) { setFullscreenStatus('unsupported'); return; }
      if (!doc.fullscreenElement && !doc.webkitFullscreenElement) await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      setFullscreenStatus('active');
      const so = screen.orientation as (ScreenOrientation & { lock?: (o: string) => Promise<void> }) | undefined;
      try { await so?.lock?.('landscape'); } catch { /* orientacja może nie być obsługiwana */ }
    } catch { setFullscreenStatus('blocked'); }
  };

  /* Tryb sterowania: KIERUNEK (jedziesz tam, gdzie pchasz) albo CZOŁG (przód/tył + obrót). */
  const [steer, setSteerState] = useState<PadSteer>(() => padClient.steer);
  const changeSteer = (m: PadSteer) => {
    if (m === steer) return;
    padClient.setSteer(m);
    setSteerState(m);
    vibrate([15, 40, 15]);
  };

  const onStick = useCallback((x: number, y: number) => {
    // y z joysticka: góra = +1. Dla trybu KIERUNEK wysyłamy wektor ekranowy (y w dół),
    // dla trybu CZOŁG — gaz/obrót. Wysyłamy oba, gra wybiera wg trybu.
    padClient.setInput({ turn: x, fwd: y, dirX: x, dirY: -y });
  }, []);
  const onStickTick = useCallback(() => vibrate(6), []);

  /* Układ: joystick celowania, auto-ogień, zamiana stron. */
  const [layout, setLayoutState] = useState<PadLayout>(readLayout);
  const [showSettings, setShowSettings] = useState(false);
  const updateLayout = (patch: Partial<PadLayout>) => {
    setLayoutState(prev => {
      const next = { ...prev, ...patch };
      try { localStorage.setItem(LS_LAYOUT, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    vibrate(12);
  };
  const chooseLayout = (mode: PadLayoutMode) => updateLayout({ mode, aimStick: mode === 'twin', autoFire: mode === 'twin' ? layout.autoFire : false });

  /* Ogień = przycisk ALBO (auto-ogień i gałka celowania w czerwonym pierścieniu). */
  const fireBtn = useRef(false);
  const aimHot = useRef(false);
  const fireSent = useRef(false);
  const autoFireRef = useRef(layout.autoFire);
  const syncFire = useCallback(() => {
    const v = fireBtn.current || (autoFireRef.current && aimHot.current);
    if (fireSent.current === v) return;
    fireSent.current = v;
    padClient.setInput({ fire: v });
  }, []);
  useEffect(() => { autoFireRef.current = layout.autoFire; syncFire(); }, [layout.autoFire, syncFire]);
  const setFire = (v: boolean) => {
    if (fireBtn.current === v) return;
    fireBtn.current = v;
    if (v) { unlockHaptics(); vibrate(10); }
    syncFire();
  };
  const onAimHot = useCallback((hot: boolean) => {
    aimHot.current = hot;
    if (hot && autoFireRef.current) vibrate(12);
    syncFire();
  }, [syncFire]);

  const onAim = useCallback((x: number, y: number) => {
    // wektor ekranowy: y w dół (joystick daje górę = +1)
    padClient.setInput({ aimX: x, aimY: -y });
  }, []);

  // Wyłączenie joysticka celowania = wieża znowu słucha kadłuba.
  useEffect(() => {
    if (!layout.aimStick) { padClient.setInput({ aimX: 0, aimY: 0 }); aimHot.current = false; syncFire(); }
  }, [layout.aimStick, syncFire]);

  // Żadna gra nie dziedziczy wciśniętego przycisku ani kierunku z poprzedniego ekranu.
  useEffect(() => {
    fireBtn.current = false; aimHot.current = false; fireSent.current = false;
    padClient.setInput({ fwd: 0, turn: 0, dirX: 0, dirY: 0, aimX: 0, aimY: 0, fire: false });
  }, [st.screen, st.game]);

  /* ---------- Connection screen ---------- */
  if (st.status !== 'connected') {
    // „lost” też jest zajęte — klient sam próbuje wrócić do gry.
    const busy = st.status === 'connecting' || st.status === 'lost';
    return (
      <div className="pad-joy flex min-h-[100dvh] flex-col items-center justify-center px-5 py-8 text-white" style={{ background: 'radial-gradient(ellipse at 50% 4%,rgba(249,115,22,.16),transparent 52%),#0b0e0f' }}>
        <div className="fixed left-0 right-0 top-0 h-1 bg-gradient-to-r from-orange-600 via-amber-300 to-orange-700" />
        <div className="mb-3 flex items-center gap-2 rounded-full border border-orange-400/30 bg-orange-500/10 px-4 py-1.5 text-[11px] font-bold tracking-[0.2em] text-orange-300">
          <Smartphone className="h-3.5 w-3.5" /> TELEFON JAKO PAD
        </div>
        <h1 className="joy-brand text-center text-5xl font-extrabold tracking-[-.06em]">Joy<span className="text-orange-400">Pad.</span></h1>
        <p className="mt-2 max-w-sm text-center text-sm text-slate-400">Jeden ekran, siedem gier i telefon w roli kontrolera.</p>

        <div className="joy-room mt-6 w-full max-w-sm rounded-2xl p-5">
          <label className="block text-[11px] font-bold tracking-widest text-zinc-400">KOD Z EKRANU KOMPUTERA</label>
          <input
            value={code}
            onChange={e => setCode(normalizeCode(e.target.value))}
            onKeyDown={e => { if (e.key === 'Enter') connect(); }}
            placeholder="ABC12"
            inputMode="text"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            maxLength={CODE_LENGTH}
            className="font-mono2 mt-1.5 w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-center text-3xl font-extrabold tracking-[0.4em] text-orange-300 outline-none focus:border-orange-400"
          />
          <label className="mt-4 block text-[11px] font-bold tracking-widest text-zinc-400">TWÓJ NICK</label>
          <input
            value={nick}
            onChange={e => setNick(e.target.value.slice(0, 14))}
            onKeyDown={e => { if (e.key === 'Enter') connect(); }}
            placeholder="np. Alex"
            maxLength={14}
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-base font-bold text-white outline-none focus:border-orange-400"
          />
          <button
            onClick={connect}
            disabled={busy || normalizeCode(code).length !== CODE_LENGTH}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-400 to-amber-200 py-3.5 text-lg font-black tracking-widest text-[#0b0e0f] shadow-[0_0_30px_rgba(249,115,22,0.24)] disabled:opacity-40 disabled:shadow-none"
          >
            {busy ? <><Loader2 className="h-5 w-5 animate-spin" /> ŁĄCZENIE…</> : <><Wifi className="h-5 w-5" /> POŁĄCZ</>}
          </button>

          {busy && (
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-100">
              <div className="font-bold leading-snug">{st.progress || 'Łączę…'}</div>
              <div className="mt-1 text-[11px] text-amber-200/70">
                {st.elapsed > 0 && <>Czas: {st.elapsed} s • </>}
                Serwer: {st.signaling}
              </div>
              <button
                onClick={() => padClient.disconnect()}
                className="mt-2 rounded-lg border border-white/20 bg-black/30 px-2.5 py-1 text-[11px] font-bold text-zinc-200 hover:bg-black/50"
              >
                PRZERWIJ
              </button>
            </div>
          )}

          {!busy && (st.status === 'error' || st.status === 'rejected') && (
            <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="min-w-0">
                <div className="whitespace-pre-line leading-snug">{st.error}</div>
                {st.lastFailure && st.lastFailure !== st.error && (
                  <div className="mt-1 text-[10px] text-red-300/70">Szczegóły: {st.lastFailure}</div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="mt-5 max-w-sm space-y-1.5 text-center text-[11px] leading-relaxed text-zinc-500">
          <p>1. Otwórz <b className="text-zinc-300">JoyPad na komputerze lub TV</b>.</p>
          <p>2. Zeskanuj kod QR z ekranu albo wpisz tutaj 5‑znakowy kod.</p>
          <p>3. Pierwszy telefon zostanie administratorem i wybierze grę. Pozostałe dostaną własne pady.</p>
          <p className="pt-1 text-zinc-400">
            Łączenie idzie przez internet, a potem bezpośrednio między urządzeniami.
            Gdy połączenie bezpośrednie nie przechodzi (np. telefon na LTE), gra automatycznie
            używa awaryjnego przekaźnika — <b className="text-zinc-300">różne sieci (Wi‑Fi ↔ LTE) też działają</b>.
          </p>
          <a href="#" onClick={() => { location.hash = ''; }} className="mt-2 inline-block text-zinc-400 underline">← Otwórz JoyPad na tym urządzeniu</a>
        </div>

        <div className="mt-4 w-full max-w-sm">
          <HapticsStatus />
          <div className="mt-2"><ConnectionCheck /></div>
        </div>
      </div>
    );
  }

  // Pilot biblioteki, menu poszczególnych gier i cztery dedykowane pady arcade.
  // Oryginalny pad twin-stick Stalowego Frontu poniżej pozostaje nietknięty.
  if (st.screen !== 'game' || st.game !== 'tanks') return <><JoypadController st={st} fullscreen={goFullscreen} fullscreenStatus={fullscreenStatus} wakeLockEnabled={wakeLockEnabled} onWakeLockChange={changeWakeLock} wakeLockStatus={wakeLockStatus} tiltEnabled={tiltEnabled} onTiltChange={changeTilt} tiltStatus={tiltStatus} />{flash && <div className="pointer-events-none fixed inset-0 z-[60]" style={{ background: flash }} />}</>;

  /* ---------- Controller screen ---------- */
  const hud = st.hud;
  const hpPct = hud ? (hud.hp / hud.maxHp) * 100 : 100;
  const color = st.color;

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden text-white"
      style={{ background: `radial-gradient(ellipse at 50% 120%, ${st.darkColor}66 0%, #0a0a0b 60%)`, touchAction: 'none' }}
    >
      {/* flash overlay */}
      {flash && <div className="pointer-events-none absolute inset-0 z-40" style={{ background: flash }} />}

      {/* top bar */}
      <div className="absolute left-0 right-0 top-0 z-30 flex items-center justify-between gap-2 px-3 py-2" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
          <span className="max-w-[38vw] truncate text-sm font-black tracking-wide" style={{ color }}>{st.nick || st.name}</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">SLOT {st.slot + 1}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${st.latency < 80 ? 'text-green-400' : st.latency < 160 ? 'text-amber-300' : 'text-red-400'}`}>
            <Signal className="h-3 w-3" />{st.latency} ms
          </span>
          {st.viaRelay && (
            <span className="rounded bg-orange-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-200" title="Łączenie przez awaryjny przekaźnik (bezpośrednie WebRTC nie przeszło)">
              przekaźnik
            </span>
          )}
          <button onClick={() => setShowSettings(v => !v)} className={`rounded-lg border p-1.5 ${showSettings ? 'border-amber-400/60 bg-amber-400/20 text-amber-200' : 'border-white/15 bg-white/5 text-zinc-300'}`} title="Ustawienia sterowania"><Settings className="h-4 w-4" /></button>
          <button onClick={goFullscreen} className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-zinc-300"><Maximize2 className="h-4 w-4" /></button>
          {st.slot === st.adminSlot && <>
            <button onClick={() => { padClient.requestPause(); vibrate(15); }} title="Pauza" className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-zinc-300"><Pause className="h-4 w-4" /></button>
            <button onClick={() => { if (window.confirm('Zakończyć bitwę i wrócić do JoyPad?')) padClient.sendCommand('home'); }} title="Wróć do JoyPad" className="rounded-lg border border-orange-400/30 bg-orange-500/10 p-1.5 text-orange-200"><Gamepad2 className="h-4 w-4" /></button>
          </>}
          <button onClick={() => { padClient.disconnect(); }} title="Odłącz telefon" className="rounded-lg border border-red-500/40 bg-red-500/10 p-1.5 text-red-300"><LogOut className="h-4 w-4" /></button>
        </div>
      </div>

      {/* HUD strip */}
      <div className="pointer-events-none absolute left-0 right-0 top-11 z-10 flex justify-center px-4">
        {hud ? (
          <div className="flex w-full max-w-md flex-col gap-1 rounded-xl border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-sm">
            <div className="flex items-center justify-between text-[11px] font-bold">
              <span className="font-mono2 text-zinc-300">{hud.alive ? `${hud.hp} HP` : hud.respawn > 0 ? `RESPAWN ${hud.respawn.toFixed(1)}s` : 'ELIMINACJA'}</span>
              <span className="flex items-center gap-2 text-zinc-300">
                <span className="flex items-center gap-0.5"><Skull className="h-3 w-3" />{hud.kills}</span>
                {hud.mode === 'survival' && <span className="flex items-center gap-0.5"><Heart className="h-3 w-3 text-red-400" />{hud.lives}</span>}
                <span className="font-mono2 text-amber-300">{Math.floor(hud.timeLeft / 60)}:{String(Math.floor(hud.timeLeft % 60)).padStart(2, '0')}</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
              <div className="h-full rounded-full transition-all" style={{ width: `${hpPct}%`, background: hpPct > 50 ? '#4ade80' : hpPct > 25 ? '#fbbf24' : '#ef4444' }} />
            </div>
            {(hud.rapid || hud.big || hud.speed || hud.shield) && (
              <div className="flex gap-2 text-[10px] font-bold">
                {hud.rapid && <span className="flex items-center gap-0.5 text-amber-400"><Zap className="h-3 w-3" />SZYBKI</span>}
                {hud.big && <span className="flex items-center gap-0.5 text-red-400"><Crosshair className="h-3 w-3" />CIĘŻKI</span>}
                {hud.speed && <span className="flex items-center gap-0.5 text-amber-300"><Wind className="h-3 w-3" />TURBO</span>}
                {hud.shield && <span className="flex items-center gap-0.5 text-cyan-300"><Shield className="h-3 w-3" />TARCZA</span>}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* centre message */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center px-6 text-center">
        {hud && hud.countdown > 0 && (
          <div className="font-display text-7xl text-amber-300 drop-shadow-[0_0_30px_rgba(251,191,36,0.6)]">{Math.ceil(hud.countdown)}</div>
        )}
        {hud?.paused && (
          <div className="rounded-xl bg-black/70 px-5 py-2 font-display text-3xl text-amber-300">PAUZA</div>
        )}
        {hud && !hud.alive && hud.countdown <= 0 && !hud.paused && (
          <div className="rounded-xl bg-black/70 px-5 py-2 font-display text-2xl text-red-300">{hud.respawn > 0 ? `ODRODZENIE ZA ${hud.respawn.toFixed(0)}s` : 'ZNISZCZONY'}</div>
        )}
        {noTank && (
          <div className="rounded-xl border border-amber-500/40 bg-black/70 px-5 py-3 text-xs text-amber-200">
            Bitwa już trwa, a Twój slot <b style={{ color }}>{st.nick || st.name}</b> nie bierze w niej udziału.<br />Dołączysz automatycznie w następnej rundzie.
          </div>
        )}
      </div>

      {(() => {
        const driveSide = layout.swap ? 'right' : 'left';
        const aimSide = layout.swap ? 'left' : 'right';
        const twin = layout.mode === 'twin' && layout.aimStick;
        const stickSize = twin
          ? Math.min(190, Math.max(130, Math.floor(Math.min(window.innerWidth * 0.3, window.innerHeight * 0.44))))
          : Math.min(210, Math.max(140, Math.floor(Math.min(window.innerWidth * 0.34, window.innerHeight * 0.46))));
        const bigFire = Math.min(170, Math.max(120, Math.floor(window.innerHeight * 0.38)));
        const smallFire = Math.min(96, Math.max(72, Math.floor(window.innerHeight * 0.22)));
        const fireHandlers = {
          onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => { e.preventDefault(); e.stopPropagation(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setFire(true); },
          onPointerUp: () => setFire(false),
          onPointerCancel: () => setFire(false),
          onLostPointerCapture: () => setFire(false),
          onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
        };
        const fireStyle = (d: number, font: string): React.CSSProperties => ({
          width: d, height: d, fontSize: font,
          background: 'radial-gradient(circle at 40% 30%, #f87171 0%, #dc2626 45%, #7f1d1d 100%)',
          boxShadow: `0 ${d > 100 ? 10 : 6}px 0 #450a0a, 0 14px 30px rgba(0,0,0,0.6), inset 0 -8px 16px rgba(0,0,0,0.35), 0 0 30px rgba(239,68,68,0.35)`,
          touchAction: 'none',
        });
        return (
          <>
            {/* JAZDA — pół ekranu to strefa dotyku (gałka pojawia się pod kciukiem) */}
            <Joystick
              side={driveSide}
              size={stickSize}
              color={color}
              onChange={onStick}
              disabled={tiltEnabled}
              onTick={onStickTick}
              mode={steer}
              zoneWidthPct={twin ? 50 : 55}
              caption={layout.mode === 'minimal' ? 'RUCH' : steer === 'direct' ? 'JAZDA • TAM, GDZIE PCHASZ' : 'JAZDA • GÓRA = PRZÓD'}
            >
              {!tiltEnabled && layout.mode === 'twin' && (
                <div className="flex overflow-hidden rounded-full border border-white/15 bg-black/60 text-[10px] font-black tracking-wider backdrop-blur-sm">
                  {([['direct', 'KIERUNEK'], ['tank', 'CZOŁG']] as const).map(([m, label]) => (
                    <button
                      key={m}
                      onClick={() => changeSteer(m)}
                      className="px-3 py-1.5 transition-colors"
                      style={steer === m ? { background: color, color: '#0a0a0b' } : { color: '#a1a1a1' }}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </Joystick>

            {twin ? (
              /* CELOWANIE — obraca wieżę; wychylenie do czerwonego pierścienia = auto-ogień */
              <Joystick
                side={aimSide}
                size={stickSize}
                color="#f87171"
                onChange={onAim}
                disabled={tiltEnabled}
                zoneWidthPct={50}
                hotRing={layout.autoFire ? AUTO_FIRE_RING : undefined}
                onHotChange={onAimHot}
                label="WIEŻA"
                caption={layout.autoFire ? 'CELOWANIE • DO KOŃCA = OGIEŃ' : 'CELOWANIE WIEŻĄ'}
                sideSlot={
                  <div className="flex flex-col items-center gap-1">
                    <button {...fireHandlers} className="flex items-center justify-center rounded-full border-4 border-red-900 font-display tracking-widest text-white active:scale-95" style={fireStyle(smallFire, '15px')}>
                      OGIEŃ
                    </button>
                  </div>
                }
              />
            ) : (
              <div
                className={`absolute bottom-0 z-20 flex flex-col items-center gap-2 px-6 ${aimSide === 'right' ? 'right-0' : 'left-0'}`}
                style={{ paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}
              >
                <button {...fireHandlers} className="flex items-center justify-center rounded-full border-4 border-red-900 font-display tracking-widest text-white active:scale-95" style={fireStyle(bigFire, '24px')}>
                  OGIEŃ
                </button>
                {layout.mode !== 'minimal' && <span className="text-[10px] font-bold tracking-widest text-zinc-500">PRZYTRZYMAJ = SERIA</span>}
              </div>
            )}
          </>
        );
      })()}

      {/* ustawienia sterowania */}
      {showSettings && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setShowSettings(false)}>
          <div className="metal-panel w-full max-w-sm rounded-2xl p-4" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-black tracking-widest text-amber-300"><Settings className="h-4 w-4" /> STEROWANIE</div>
              <button onClick={() => setShowSettings(false)} className="rounded-lg p-1 text-zinc-400 hover:bg-white/10"><X className="h-4 w-4" /></button>
            </div>
            <NickEditor st={st} compact />
            <div className="mb-3 mt-3">
              <div className="mb-1 text-[10px] font-bold tracking-widest text-zinc-500">UKŁAD PADA</div>
              <div className="grid grid-cols-2 gap-1.5">
                {([['minimal', 'MINIMALNY', '1 gałka + 1 akcja'], ['twin', 'TWIN-STICK', 'jazda + niezależne celowanie']] as const).map(([mode, label, desc]) => (
                  <button key={mode} type="button" onClick={() => chooseLayout(mode)} className={`rounded-xl border px-2 py-2 text-left ${layout.mode === mode ? 'border-amber-400/70 bg-amber-400/15' : 'border-white/10 bg-black/30'}`}>
                    <div className="text-xs font-black" style={{ color: layout.mode === mode ? color : '#e4e4e7' }}>{label}</div>
                    <div className="text-[10px] leading-tight text-zinc-400">{desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-3">
              <div className="mb-1 text-[10px] font-bold tracking-widest text-zinc-500">JAZDA</div>
              <div className="grid grid-cols-2 gap-1.5">
                {([['direct', 'KIERUNEK', 'Jedziesz tam, gdzie pchasz'], ['tank', 'CZOŁG', 'Góra = przód, boki = obrót']] as const).map(([m, label, desc]) => (
                  <button key={m} onClick={() => changeSteer(m)}
                    className={`rounded-xl border px-2 py-2 text-left ${steer === m ? 'border-amber-400/70 bg-amber-400/15' : 'border-white/10 bg-black/30'}`}>
                    <div className="text-xs font-black" style={{ color: steer === m ? color : '#e4e4e7' }}>{label}</div>
                    <div className="text-[10px] leading-tight text-zinc-400">{desc}</div>
                  </button>
                ))}
              </div>
            </div>
            {([
              ['autoFire', 'Auto-ogień przy celowaniu', 'W Twin-stick wychyl gałkę celowania do końca (czerwony pierścień), a czołg strzela sam.'],
              ['swap', 'Zamień strony', 'Jazda po prawej, celowanie i ogień po lewej (dla leworęcznych).'],
            ] as const).map(([key, label, desc]) => {
              const on = layout[key];
              const disabled = key === 'autoFire' && !layout.aimStick;
              return (
                <button key={key} disabled={disabled} onClick={() => updateLayout({ [key]: !on } as Partial<PadLayout>)}
                  className="mb-1.5 flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-left disabled:opacity-40">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-black text-zinc-100">{label}</div>
                    <div className="text-[10px] leading-snug text-zinc-400">{desc}</div>
                  </div>
                  <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${on ? 'bg-amber-400' : 'bg-zinc-700'}`}>
                    <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
                  </span>
                </button>
              );
            })}
            <DeviceFeatures
              wakeLockEnabled={wakeLockEnabled}
              onWakeLockChange={changeWakeLock}
              wakeLockStatus={wakeLockStatus}
              fullscreenStatus={fullscreenStatus}
              onFullscreen={goFullscreen}
              tiltEnabled={tiltEnabled}
              onTiltChange={changeTilt}
              tiltStatus={tiltStatus}
            />
          </div>
        </div>
      )}

      {landscapeHint && (
        <button onClick={goFullscreen} className="absolute left-1/2 top-[30%] z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[11px] font-bold text-amber-200">
          <RotateCcw className="h-4 w-4" /> Obróć telefon poziomo i dotknij, by przejść na pełny ekran
        </button>
      )}
    </div>
  );
}
