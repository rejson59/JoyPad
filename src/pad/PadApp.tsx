import { useCallback, useEffect, useRef, useState } from 'react';
import { Crosshair, Gamepad2, Heart, Loader2, LogOut, Maximize2, Pause, Shield, Signal, Skull, Smartphone, Wifi, WifiOff, Zap, Wind, RotateCcw, Trophy } from 'lucide-react';
import { padClient, type PadClientState } from '../net/padClient';
import { CODE_LENGTH, normalizeCode, padCodeFromHash, type PadFx } from '../net/protocol';
import { Joystick } from './Joystick';
import { ConnectionCheck } from './ConnectionCheck';

const LS_NICK = 'sf_pad_nick';
const LS_CODE = 'sf_pad_code';

function vibrate(p: number | number[]) {
  try { navigator.vibrate?.(p); } catch { /* ignore */ }
}

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
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);

  useEffect(() => padClient.subscribe(setSt), []);

  useEffect(() => {
    padClient.onFx = (fx) => {
      vibrate(FX_VIBE[fx]);
      if (fx === 'hit') { setFlash('rgba(239,68,68,0.45)'); setTimeout(() => setFlash(null), 140); }
      if (fx === 'dead') { setFlash('rgba(0,0,0,0.8)'); setTimeout(() => setFlash(null), 500); }
      if (fx === 'kill') { setFlash('rgba(251,191,36,0.4)'); setTimeout(() => setFlash(null), 250); }
      if (fx === 'pickup') { setFlash('rgba(74,222,128,0.35)'); setTimeout(() => setFlash(null), 200); }
    };
    return () => { padClient.onFx = null; };
  }, []);

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
    if (st.screen !== 'game' || st.status !== 'connected') { setNoTank(false); return; }
    if (st.hud) { setNoTank(false); return; }
    const t = setTimeout(() => setNoTank(true), 2500);
    return () => clearTimeout(t);
  }, [st.screen, st.status, st.hud]);

  // Orientation hint
  useEffect(() => {
    const check = () => setLandscapeHint(window.innerHeight > window.innerWidth && window.innerWidth < 700);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Wake lock when connected
  useEffect(() => {
    if (st.status !== 'connected') return;
    let cancelled = false;
    const req = async () => {
      try {
        const nav = navigator as Navigator & { wakeLock?: { request: (t: 'screen') => Promise<{ release: () => Promise<void> }> } };
        const wl = await nav.wakeLock?.request('screen');
        if (wl && !cancelled) wakeLock.current = wl; else wl?.release();
      } catch { /* ignore */ }
    };
    req();
    const vis = () => { if (document.visibilityState === 'visible') req(); };
    document.addEventListener('visibilitychange', vis);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', vis);
      wakeLock.current?.release().catch(() => {});
      wakeLock.current = null;
    };
  }, [st.status]);

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
    const n = nick.trim().slice(0, 14);
    if (c.length !== CODE_LENGTH) return;
    localStorage.setItem(LS_CODE, c);
    localStorage.setItem(LS_NICK, n);
    vibrate(20);
    padClient.connect(c, n);
  };

  const goFullscreen = async () => {
    try {
      const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> };
      if (!document.fullscreenElement) await (el.requestFullscreen?.() ?? el.webkitRequestFullscreen?.());
      const so = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
      await so.lock?.('landscape').catch(() => {});
    } catch { /* ignore */ }
  };

  const onStick = useCallback((x: number, y: number) => {
    padClient.setInput({ turn: x, fwd: y });
  }, []);

  const fireDown = useRef(false);
  const setFire = (v: boolean) => {
    if (fireDown.current === v) return;
    fireDown.current = v;
    padClient.setInput({ fire: v });
    if (v) vibrate(10);
  };

  /* ---------- Connection screen ---------- */
  if (st.status !== 'connected') {
    // „lost” też jest zajęte — klient sam próbuje wrócić do gry.
    const busy = st.status === 'connecting' || st.status === 'lost';
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0a0b] px-5 py-8 text-white">
        <div className="hazard-stripes fixed left-0 right-0 top-0 h-2 opacity-80" />
        <div className="hazard-stripes fixed bottom-0 left-0 right-0 h-2 opacity-80" />
        <div className="mb-2 flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-[11px] font-bold tracking-[0.25em] text-amber-400">
          <Smartphone className="h-3.5 w-3.5" /> TELEFON JAKO JOYSTICK
        </div>
        <h1 className="font-display text-center text-4xl leading-none">
          <span className="bg-gradient-to-b from-amber-200 via-amber-400 to-orange-700 bg-clip-text text-transparent">STALOWY</span>{' '}
          <span className="bg-gradient-to-b from-zinc-100 via-zinc-400 to-zinc-600 bg-clip-text text-transparent">FRONT</span>
        </h1>

        <div className="metal-panel rivet mt-6 w-full max-w-sm rounded-2xl p-5">
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
            className="font-mono2 mt-1.5 w-full rounded-xl border border-white/15 bg-black/60 px-4 py-3 text-center text-3xl font-extrabold tracking-[0.4em] text-amber-300 outline-none focus:border-amber-400"
          />
          <label className="mt-4 block text-[11px] font-bold tracking-widest text-zinc-400">TWÓJ NICK</label>
          <input
            value={nick}
            onChange={e => setNick(e.target.value.slice(0, 14))}
            onKeyDown={e => { if (e.key === 'Enter') connect(); }}
            placeholder="np. Czołgista"
            maxLength={14}
            className="mt-1.5 w-full rounded-xl border border-white/15 bg-black/60 px-4 py-2.5 text-base font-bold text-white outline-none focus:border-amber-400"
          />
          <button
            onClick={connect}
            disabled={busy || normalizeCode(code).length !== CODE_LENGTH}
            className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-400 to-orange-600 py-3.5 text-lg font-black tracking-widest text-black shadow-[0_0_30px_rgba(251,146,60,0.35)] disabled:opacity-40 disabled:shadow-none"
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
          <p>1. Na komputerze otwórz grę i kliknij <b className="text-zinc-300">📱 Telefon jako pad</b>.</p>
          <p>2. Zeskanuj kod QR albo wpisz tutaj 5‑znakowy kod.</p>
          <p>3. Telefon dostanie wolny slot gracza. Steruj joystickiem, strzelaj wielkim przyciskiem.</p>
          <p className="pt-1 text-zinc-400">
            Łączenie idzie przez internet, a potem bezpośrednio między urządzeniami.
            Gdy połączenie bezpośrednie nie przechodzi (np. telefon na LTE), gra automatycznie
            używa awaryjnego przekaźnika — <b className="text-zinc-300">różne sieci (Wi‑Fi ↔ LTE) też działają</b>.
          </p>
          <a href="#" onClick={() => { location.hash = ''; }} className="mt-2 inline-block text-zinc-400 underline">← Wróć do gry (tryb komputera)</a>
        </div>

        <div className="mt-4 w-full max-w-sm">
          <ConnectionCheck />
        </div>
      </div>
    );
  }

  /* ---------- Controller screen ---------- */
  const hud = st.hud;
  const hpPct = hud ? (hud.hp / hud.maxHp) * 100 : 100;
  const color = st.color;
  const inLobby = st.screen === 'menu' || st.screen === 'setup';
  const over = st.screen === 'over';

  return (
    <div
      className="fixed inset-0 select-none overflow-hidden text-white"
      style={{ background: `radial-gradient(ellipse at 50% 120%, ${st.darkColor}66 0%, #0a0a0b 60%)`, touchAction: 'none' }}
    >
      {/* flash overlay */}
      {flash && <div className="pointer-events-none absolute inset-0 z-40" style={{ background: flash }} />}

      {/* top bar */}
      <div className="absolute left-0 right-0 top-0 z-20 flex items-center justify-between gap-2 px-3 py-2" style={{ paddingTop: 'max(8px, env(safe-area-inset-top))' }}>
        <div className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-full" style={{ background: color, boxShadow: `0 0 10px ${color}` }} />
          <span className="text-sm font-black tracking-wide" style={{ color }}>{st.name}</span>
          <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-zinc-300">SLOT {st.slot + 1}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-bold ${st.latency < 80 ? 'text-green-400' : st.latency < 160 ? 'text-amber-300' : 'text-red-400'}`}>
            <Signal className="h-3 w-3" />{st.latency} ms
          </span>
          {st.viaRelay && (
            <span className="rounded bg-sky-500/20 px-1.5 py-0.5 text-[10px] font-bold text-sky-300" title="Łączenie przez awaryjny przekaźnik (bezpośrednie WebRTC nie przeszło)">
              przekaźnik
            </span>
          )}
          <button onClick={goFullscreen} className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-zinc-300"><Maximize2 className="h-4 w-4" /></button>
          <button onClick={() => { padClient.requestPause(); vibrate(15); }} className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-zinc-300"><Pause className="h-4 w-4" /></button>
          <button onClick={() => { padClient.disconnect(); }} className="rounded-lg border border-red-500/40 bg-red-500/10 p-1.5 text-red-300"><LogOut className="h-4 w-4" /></button>
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
                {hud.speed && <span className="flex items-center gap-0.5 text-sky-400"><Wind className="h-3 w-3" />TURBO</span>}
                {hud.shield && <span className="flex items-center gap-0.5 text-cyan-300"><Shield className="h-3 w-3" />TARCZA</span>}
              </div>
            )}
          </div>
        ) : null}
      </div>

      {/* centre message */}
      <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 flex-col items-center px-6 text-center">
        {inLobby && (
          <>
            <Gamepad2 className="h-9 w-9 animate-pulse" style={{ color }} />
            <div className="font-display mt-1 text-2xl" style={{ color }}>POŁĄCZONO</div>
            <div className="mt-1 max-w-xs text-xs text-zinc-400">Czekaj, aż host uruchomi bitwę. Sterujesz czołgiem <b style={{ color }}>{st.name}</b>.</div>
          </>
        )}
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
            Bitwa już trwa, a Twój slot <b style={{ color }}>{st.name}</b> nie bierze w niej udziału.<br />Dołączysz automatycznie w następnej rundzie.
          </div>
        )}
        {over && (
          <div className="rounded-2xl border border-white/10 bg-black/70 px-6 py-4">
            <Trophy className="mx-auto h-8 w-8 text-amber-400" />
            <div className="font-display mt-1 text-2xl" style={{ color: st.result?.youWon ? color : '#e4e4e7' }}>
              {st.result?.youWon ? 'WYGRANA!' : st.result?.winnerName ? `WYGRYWA ${st.result.winnerName}` : 'REMIS'}
            </div>
            <div className="mt-1 text-xs text-zinc-400">Host może rozpocząć kolejną bitwę.</div>
          </div>
        )}
      </div>

      {/* controls */}
      <div className="absolute inset-x-0 bottom-0 z-20 flex items-end justify-between px-6" style={{ paddingBottom: 'max(18px, env(safe-area-inset-bottom))' }}>
        <div className="flex flex-col items-center gap-2">
          <Joystick size={Math.min(220, Math.max(150, Math.floor(Math.min(window.innerWidth * 0.38, window.innerHeight * 0.5))))} color={color} onChange={onStick} />
          <span className="text-[10px] font-bold tracking-widest text-zinc-500">JAZDA / OBRÓT</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <button
            onPointerDown={e => { e.preventDefault(); (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); setFire(true); }}
            onPointerUp={() => setFire(false)}
            onPointerCancel={() => setFire(false)}
            onLostPointerCapture={() => setFire(false)}
            onContextMenu={e => e.preventDefault()}
            className="flex items-center justify-center rounded-full border-4 border-red-900 font-display text-2xl tracking-widest text-white active:scale-95"
            style={{
              width: Math.min(170, Math.max(120, Math.floor(window.innerHeight * 0.38))),
              height: Math.min(170, Math.max(120, Math.floor(window.innerHeight * 0.38))),
              background: 'radial-gradient(circle at 40% 30%, #f87171 0%, #dc2626 45%, #7f1d1d 100%)',
              boxShadow: '0 10px 0 #450a0a, 0 14px 30px rgba(0,0,0,0.6), inset 0 -8px 16px rgba(0,0,0,0.35), 0 0 30px rgba(239,68,68,0.35)',
              touchAction: 'none',
            }}
          >
            OGIEŃ
          </button>
          <span className="text-[10px] font-bold tracking-widest text-zinc-500">PRZYTRZYMAJ = SERIA</span>
        </div>
      </div>

      {landscapeHint && (
        <button onClick={goFullscreen} className="absolute left-1/2 top-[30%] z-30 flex -translate-x-1/2 items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/15 px-3 py-2 text-[11px] font-bold text-amber-200">
          <RotateCcw className="h-4 w-4" /> Obróć telefon poziomo i dotknij, by przejść na pełny ekran
        </button>
      )}
    </div>
  );
}
