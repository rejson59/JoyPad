import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Copy, Check, Loader2, RefreshCw, Smartphone, Wifi, WifiOff, X, Power } from 'lucide-react';
import { padHost, type PadHostState } from '../net/padHost';
import { padUrlFor } from '../net/protocol';
import { ConnectionCheck } from './ConnectionCheck';
import type { PlayerConfig } from '../game/types';

export function usePadHost() {
  const [s, setS] = useState<PadHostState>(padHost.snapshot());
  useEffect(() => padHost.subscribe(setS), []);
  return s;
}

interface Props {
  players: PlayerConfig[];
  compact?: boolean;
  onClose?: () => void;
}

export function PadHostPanel({ players, compact, onClose }: Props) {
  const s = usePadHost();
  const [qr, setQr] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const url = s.code ? padUrlFor(s.code) : '';

  useEffect(() => {
    if (!s.code || s.status !== 'ready') { setQr(''); return; }
    QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#0a0a0b', light: '#fbbf24' }, errorCorrectionLevel: 'M' })
      .then(setQr).catch(() => setQr(''));
  }, [s.code, s.status, url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  if (s.status === 'idle') {
    return (
      <div className={`metal-panel rivet rounded-2xl ${compact ? 'p-4' : 'p-5'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-300"><Smartphone className="h-4 w-4 text-amber-400" /> TELEFON JAKO PAD</div>
          {onClose && <button onClick={onClose} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10"><X className="h-4 w-4" /></button>}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          Każdy gracz może sterować czołgiem ze swojego telefonu — joystick analogowy + przycisk ognia z wibracjami.
          Telefon i komputer potrzebują internetu (mogą być w różnych sieciach). Połączenie działa bezpośrednio (WebRTC).
        </p>
        <button
          onClick={() => padHost.start()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-amber-400 to-orange-600 px-4 py-2.5 text-sm font-black tracking-widest text-black hover:brightness-110"
        >
          <Power className="h-4 w-4" /> OTWÓRZ POKÓJ DLA TELEFONÓW
        </button>
      </div>
    );
  }

  return (
    <div className={`metal-panel rivet rounded-2xl ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-300"><Smartphone className="h-4 w-4 text-amber-400" /> TELEFON JAKO PAD</div>
        <div className="flex items-center gap-1">
          <button onClick={() => padHost.restart()} title="Nowy kod" className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => padHost.stop()} title="Zamknij pokój" className="rounded-lg p-1.5 text-red-300 hover:bg-red-500/20"><Power className="h-4 w-4" /></button>
          {onClose && <button onClick={onClose} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10"><X className="h-4 w-4" /></button>}
        </div>
      </div>

      {/* Stan serwera sygnalizacji — to on odpowiada za „przekroczony czas łączenia” */}
      {s.status !== 'error' && (
        <div className={`mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${s.signal === 'online' ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
          {s.signal === 'online'
            ? <><Wifi className="h-3.5 w-3.5" /> Serwer sygnalizacji połączony — telefony mogą dołączać</>
            : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {s.signal === 'lost' ? 'Utracono łączność z serwerem — ponawiam automatycznie' : 'Łączę z serwerem sygnalizacji…'}{s.attempts > 0 && ` (próba ${s.attempts + 1})`}</>}
        </div>
      )}
      {s.note && (
        <div className="mt-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-2.5 py-1.5 text-[11px] text-sky-200">{s.note}</div>
      )}

      <div className={`mt-3 grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-[auto_1fr]'}`}>
        {/* QR + code */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex h-44 w-44 items-center justify-center overflow-hidden rounded-xl border-4 border-amber-400/70 bg-amber-400">
            {s.status === 'ready' && qr ? (
              <img src={qr} alt="QR" className="h-full w-full" />
            ) : s.status === 'error' ? (
              <WifiOff className="h-10 w-10 text-black/70" />
            ) : (
              <Loader2 className="h-10 w-10 animate-spin text-black/70" />
            )}
          </div>
          <div className="text-[10px] font-bold tracking-widest text-zinc-500">KOD POKOJU</div>
          <div className="font-mono2 rounded-lg border border-amber-400/40 bg-black/60 px-4 py-1.5 text-3xl font-extrabold tracking-[0.35em] text-amber-300">{s.code}</div>
        </div>

        <div className="min-w-0">
          {s.status === 'error' ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <div className="whitespace-pre-line leading-snug">{s.error}</div>
              {s.lastError && s.lastError !== s.error && (
                <div className="mt-1 text-[10px] text-red-300/70">Szczegóły: {s.lastError}</div>
              )}
              <button onClick={() => padHost.restart()} className="mt-2 flex items-center gap-1 rounded-lg bg-red-500/20 px-2 py-1 font-bold"><RefreshCw className="h-3 w-3" /> Spróbuj ponownie</button>
              <div className="mt-2"><ConnectionCheck compact /></div>
            </div>
          ) : (
            <>
              <div className="text-xs leading-relaxed text-zinc-400">
                Na telefonie zeskanuj QR <b className="text-zinc-200">albo</b> wejdź na tę stronę i wpisz kod. Każdy telefon zajmuje pierwszy wolny slot gracza.
                Łączenie idzie przez internet (broker), a gra bezpośrednio między urządzeniami — <b className="text-zinc-300">najpewniej działa ta sama sieć Wi‑Fi</b>.
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <input readOnly value={url} className="font-mono2 min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-[11px] text-zinc-300" onFocus={e => e.currentTarget.select()} />
                <button onClick={copy} className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-zinc-300 hover:bg-white/10">{copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}</button>
              </div>
              <div className="mt-3">
                <ConnectionCheck compact />
              </div>
            </>
          )}

          <div className="mt-3 space-y-1.5">
            {players.map((p, i) => {
              const pad = s.pads.find(x => x.slot === i);
              return (
                <div key={p.id} className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 text-xs ${pad ? 'border-white/15 bg-white/5' : 'border-dashed border-white/10 bg-transparent'}`}>
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.color, boxShadow: pad ? `0 0 8px ${p.color}` : undefined }} />
                    <span className="font-bold" style={{ color: pad ? p.color : '#71717a' }}>{p.name}</span>
                    {pad ? (
                      <span className="flex items-center gap-1 text-zinc-300"><Wifi className="h-3 w-3 text-green-400" /> {pad.nick}</span>
                    ) : (
                      <span className="text-zinc-600">{p.enabled ? (p.isBot ? 'bot' : 'klawiatura — czeka na telefon') : 'wyłączony'}</span>
                    )}
                  </div>
                  {pad && <button onClick={() => padHost.kick(pad.connId)} className="rounded p-1 text-zinc-500 hover:bg-red-500/20 hover:text-red-300" title="Rozłącz"><X className="h-3.5 w-3.5" /></button>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
