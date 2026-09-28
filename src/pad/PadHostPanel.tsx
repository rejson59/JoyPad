import { useEffect, useState } from 'react';
import { Antenna, Copy, Check, Loader2, RefreshCw, Smartphone, Wifi, X, Power } from 'lucide-react';
import { padHost, type PadHostState } from '../net/padHost';
import { padUrlFor } from '../net/protocol';
import { ConnectionCheck } from './ConnectionCheck';
import type { PlayerConfig } from '../game/types';
import { QrFrame, QrFrameError } from '../components/QrFrame';
import { useT } from '../platform/i18n';

export function usePadHost() {
  const [s, setS] = useState<PadHostState>(padHost.snapshot());
  useEffect(() => padHost.subscribe(setS), []);
  return s;
}

interface Props {
  players: PlayerConfig[];
  compact?: boolean;
  onClose?: () => void;
  context?: 'tanks' | 'arcade';
}

export function PadHostPanel({ players, compact, onClose, context = 'tanks' }: Props) {
  const { language } = useT();
  const en = language === 'en';
  const s = usePadHost();
  const [qr, setQr] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const url = s.code ? padUrlFor(s.code, s.joinToken) : '';
  // Kod jest użyteczny, gdy zarejestruje się w serwerze sygnalizacji,
  // albo gdy działa awaryjny przekaźnik (telefony połączą się przez niego).
  const codeUsable = s.status === 'ready' || s.relay === 'online';

  useEffect(() => {
    if (!s.code || !codeUsable) { setQr(''); return; }
    // qrcode ładuje się leniwie — potrzebne tylko do rysowania QR w panelu.
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { margin: 1, width: 320, color: { dark: '#0a0a0b', light: '#ffffff' }, errorCorrectionLevel: 'M' }))
      .then(setQr)
      .catch(() => setQr(''));
  }, [s.code, codeUsable, url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  if (s.status === 'idle') {
    return (
      <div className={`metal-panel rivet rounded-2xl ${compact ? 'p-4' : 'p-5'}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-300"><Smartphone className="h-4 w-4 text-orange-300" /> {en ? 'PHONE CONTROLLER' : 'TELEFON JAKO PAD'}</div>
          {onClose && <button onClick={onClose} aria-label={en ? 'Close' : 'Zamknij'} className="rounded-lg p-1 text-zinc-500 hover:bg-white/10"><X className="h-4 w-4" /></button>}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          {context === 'tanks' ? (en ? 'Each player can control a tank from their phone — analog stick, fire button and haptics.' : 'Każdy gracz może sterować czołgiem ze swojego telefonu — joystick analogowy + przycisk ognia z wibracjami.') : (en ? 'Phones become controllers for every game. The first connected phone gets room admin controls.' : 'Telefony zamieniają się w pady do wszystkich gier. Pierwszy połączony telefon otrzymuje pilota administratora.')}{' '}
          {en ? <>Both devices need internet, but can be on <b className="text-zinc-300">different networks</b> (Wi‑Fi ↔ LTE). If a direct WebRTC link fails, the game automatically switches to a relay.</> : <>Telefon i komputer potrzebują internetu — mogą być nawet w <b className="text-zinc-300">różnych sieciach</b> (Wi‑Fi ↔ LTE). Gdy łączenie WebRTC nie przechodzi, gra automatycznie używa awaryjnego przekaźnika.</>}
        </p>
        <button
          onClick={() => padHost.start()}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-b from-orange-200 to-orange-400 px-4 py-2.5 text-sm font-black tracking-widest text-black hover:brightness-110"
        >
          <Power className="h-4 w-4" /> {en ? 'OPEN PHONE ROOM' : 'OTWÓRZ POKÓJ DLA TELEFONÓW'}
        </button>
      </div>
    );
  }

  return (
    <div className={`metal-panel rivet rounded-2xl ${compact ? 'p-4' : 'p-5'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-bold tracking-widest text-zinc-300"><Smartphone className="h-4 w-4 text-orange-300" /> {en ? 'PHONE CONTROLLER' : 'TELEFON JAKO PAD'}</div>
        <div className="flex items-center gap-1">
          <button onClick={() => padHost.restart()} title={en ? 'New room code' : 'Nowy kod'} className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10"><RefreshCw className="h-4 w-4" /></button>
          <button onClick={() => padHost.stop()} title={en ? 'Close room' : 'Zamknij pokój'} className="rounded-lg p-1.5 text-red-300 hover:bg-red-500/20"><Power className="h-4 w-4" /></button>
          {onClose && <button onClick={onClose} aria-label={en ? 'Close' : 'Zamknij'} className="rounded-lg p-1.5 text-zinc-500 hover:bg-white/10"><X className="h-4 w-4" /></button>}
        </div>
      </div>

      {/* Stan serwera sygnalizacji — to on odpowiada za „przekroczony czas łączenia” */}
      {s.status !== 'error' && (
        <div className={`mt-2 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${s.signal === 'online' ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
          {s.signal === 'online'
            ? <><Wifi className="h-3.5 w-3.5" /> {en ? 'Signaling server connected — phones can join' : 'Serwer sygnalizacji połączony — telefony mogą dołączać'}</>
            : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {s.signal === 'lost' ? (en ? 'Signaling connection lost — retrying automatically' : 'Utracono łączność z serwerem — ponawiam automatycznie') : (en ? 'Connecting to signaling server…' : 'Łączę z serwerem sygnalizacji…')}{s.attempts > 0 && ` (${en ? 'attempt' : 'próba'} ${s.attempts + 1})`}</>}
        </div>
      )}
      {/* Awaryjny przekaźnik — łączenie między sieciami (Wi‑Fi ↔ LTE) */}
      {s.status !== 'error' && (
        <div className={`mt-1 flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[11px] font-bold ${s.relay === 'online' ? 'border-green-500/40 bg-green-500/10 text-green-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-200'}`}>
          {s.relay === 'online'
            ? <><Antenna className="h-3.5 w-3.5" /> {en ? 'Relay active — different networks (Wi‑Fi ↔ LTE) are supported' : 'Awaryjny przekaźnik aktywny — różne sieci (Wi‑Fi ↔ LTE) też zadziałają'}</>
            : <><Loader2 className="h-3.5 w-3.5 animate-spin" /> {en ? 'Connecting to relay…' : 'Łączenie awaryjnego przekaźnika…'}</>}
        </div>
      )}
      {s.note && (
        <div className="mt-2 rounded-lg border border-orange-500/40 bg-orange-500/10 px-2.5 py-1.5 text-[11px] text-orange-200">{s.note}</div>
      )}

      <div className={`mt-3 grid gap-4 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-[auto_1fr]'}`}>
        {/* QR + code */}
        <div className="flex flex-col items-center gap-2">
          {s.status === 'error'
            ? <QrFrameError size={168} />
            : <QrFrame src={codeUsable ? qr : ''} size={168} loadingLabel={en ? 'Waiting for signaling server…' : 'Czekam na serwer sygnalizacji…'} />}
          <div className="text-[10px] font-bold tracking-widest text-zinc-500">{en ? 'ROOM CODE' : 'KOD POKOJU'}</div>
          <div className="font-mono2 rounded-lg border border-orange-300/40 bg-black/60 px-4 py-1.5 text-3xl font-extrabold tracking-[0.35em] text-orange-200">{s.code}</div>
        </div>

        <div className="min-w-0">
          {s.status === 'error' ? (
            <div className="rounded-xl border border-red-500/40 bg-red-500/10 p-3 text-xs text-red-200">
              <div className="whitespace-pre-line leading-snug">{s.error}</div>
              {s.lastError && s.lastError !== s.error && (
                <div className="mt-1 text-[10px] text-red-300/70">{en ? 'Details:' : 'Szczegóły:'} {s.lastError}</div>
              )}
              <button onClick={() => padHost.restart()} className="mt-2 flex items-center gap-1 rounded-lg bg-red-500/20 px-2 py-1 font-bold"><RefreshCw className="h-3 w-3" /> {en ? 'Try again' : 'Spróbuj ponownie'}</button>
              <div className="mt-2"><ConnectionCheck compact /></div>
            </div>
          ) : (
            <>
              <div className="text-xs leading-relaxed text-zinc-400">
                {en ? <>On your phone, scan the QR code <b className="text-zinc-200">or</b> open this page and enter the code. Each phone takes the first free player slot.{context === 'arcade' && ' The first phone controls the menu and rounds.'} WebRTC connects devices directly; if the network blocks it, a relay takes over — <b className="text-zinc-300">different networks (Wi‑Fi ↔ LTE) work too</b>.</> : <>Na telefonie zeskanuj QR <b className="text-zinc-200">albo</b> wejdź na tę stronę i wpisz kod. Każdy telefon zajmuje pierwszy wolny slot gracza.{context === 'arcade' && ' Pierwszy telefon steruje menu i rundami.'} Gra łączy urządzenia przez WebRTC; jeśli sieć to blokuje, przełączy się na przekaźnik — <b className="text-zinc-300">różne sieci (Wi‑Fi ↔ LTE) też działają</b>.</>}
              </div>
              <div className="mt-2 flex items-center gap-1.5">
                <input readOnly value={url} className="font-mono2 min-w-0 flex-1 truncate rounded-lg border border-white/10 bg-black/50 px-2 py-1.5 text-[11px] text-zinc-300" onFocus={e => e.currentTarget.select()} />
                <button onClick={copy} aria-label={en ? 'Copy room link' : 'Skopiuj link do pokoju'} className="rounded-lg border border-white/15 bg-white/5 p-1.5 text-zinc-300 hover:bg-white/10">{copied ? <Check className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}</button>
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
                      <span className="flex items-center gap-1 text-zinc-300" title={pad.via === 'relay' ? (en ? 'Connected through relay (Internet)' : 'Łączy przez awaryjny przekaźnik (Internet)') : (en ? 'Connected directly (WebRTC)' : 'Łączy bezpośrednio (WebRTC)')}>
                        {pad.via === 'relay' ? <Antenna className="h-3 w-3 text-orange-400" /> : <Wifi className="h-3 w-3 text-green-400" />} {pad.nick}
                        {context === 'tanks' && <span className="rounded bg-white/10 px-1 text-[9px] font-bold text-zinc-400" title={pad.steer === 'direct' ? (en ? 'Stick: the tank moves where you push' : 'Joystick: czołg jedzie tam, gdzie pchasz gałkę') : (en ? 'Stick: up/down drives, left/right turns' : 'Joystick: góra/dół = przód/tył czołgu, lewo/prawo = obrót')}>
                          {pad.steer === 'direct' ? (en ? 'direction' : 'kierunek') : (en ? 'tank' : 'czołg')}
                        </span>}
                      </span>
                    ) : (
                      <span className="text-zinc-600">{p.enabled ? (p.isBot ? 'bot' : (en ? 'keyboard — waiting for phone' : 'klawiatura — czeka na telefon')) : (en ? 'disabled' : 'wyłączony')}</span>
                    )}
                  </div>
                  {pad && <button onClick={() => padHost.kick(pad.connId)} className="rounded p-1 text-zinc-500 hover:bg-red-500/20 hover:text-red-300" title={en ? 'Disconnect' : 'Rozłącz'}><X className="h-3.5 w-3.5" /></button>}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
