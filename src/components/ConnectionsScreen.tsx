import { Sheet } from '../console/Sheet';
import { useEffect, useState } from 'react';
import { Antenna, Check, Copy, RefreshCw, Wifi, WifiOff } from 'lucide-react';
import { padHost } from '../net/padHost';
import { padUrlFor } from '../net/protocol';
import { usePadHost } from '../pad/PadHostPanel';
import { ConnectionCheck } from '../pad/ConnectionCheck';
import { PLAYER_DEFS } from '../game/types';
import { QrFrame } from './QrFrame';

/**
 * Osobny ekran połączeń dla komputera: kto jest w pokoju, przez jaki kanał (P2P/relay),
 * opóźnienie, kod QR do zeskanowania telefonem i diagnostyka łączności.
 */
export function ConnectionsScreen({ onClose }: { onClose: () => void }) {
  const state = usePadHost();
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const usable = state.status === 'ready' || state.relay === 'online';
  const url = state.code ? padUrlFor(state.code) : '';

  useEffect(() => {
    let live = true;
    if (!url) return;
    void import('qrcode')
      .then(({ default: QRCode }) => QRCode.toDataURL(url, { width: 420, margin: 1, color: { dark: '#070a10', light: '#ffffff' } }))
      .then(result => { if (live) setQr(result); })
      .catch(() => { if (live) setQr(''); });
    return () => { live = false; };
  }, [url]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); window.setTimeout(() => setCopied(false), 1800); } catch { /* clipboard may be unavailable */ }
  };

  return (
    <Sheet wide title="Twoja ekipa." onClose={onClose}>
      <div>
        <p className="os-note">Zeskanuj kod aparatem telefonu. Nie potrzebujesz konta ani instalacji aplikacji.</p>
        <div className="mt-6 grid gap-5 md:grid-cols-[240px_minmax(0,1fr)]">
          <div className="flex flex-col items-center rounded-2xl border border-white/10 bg-[#0b0d0e] p-4">
            <QrFrame src={qr} size={172} />
            <div className="joy-kicker mt-4 text-slate-500">KOD POKOJU</div>
            <div className="mt-1 font-mono2 text-[30px] font-extrabold tracking-[.24em] text-white">{state.code || '·····'}</div>
            <button onClick={copy} disabled={!url} className="mt-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/[.06] px-3 py-1.5 text-xs font-semibold text-slate-300 transition hover:border-orange-400/40 hover:bg-orange-500/10 disabled:opacity-50">
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />} {copied ? 'Link skopiowany' : 'Kopiuj link do pada'}
            </button>
          </div>

          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className={`joy-status ${usable ? 'joy-status-live' : ''}`}><span />{usable ? 'NA ŻYWO' : 'ŁĄCZENIE'}</span>
              <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold ${state.signal === 'online' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : 'border-white/15 bg-white/5 text-slate-400'}`}>
                {state.signal === 'online' ? <Wifi size={13} /> : <WifiOff size={13} />} Serwer sygnalizacji: {state.signal === 'online' ? 'online' : state.signal === 'connecting' ? 'łączenie…' : 'offline'}
              </span>
              <span className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-semibold ${state.relay === 'online' ? 'border-orange-400/30 bg-orange-500/10 text-orange-300' : 'border-white/15 bg-white/5 text-slate-400'}`}>
                <Antenna size={13} /> Przekaźnik zapasowy: {state.relay === 'online' ? 'online' : state.relay === 'connecting' ? 'łączenie…' : 'wyłączony'}
              </span>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="joy-kicker text-slate-400">PADY W POKOJU · {state.pads.length}/4</div>
              <button onClick={() => state.status === 'idle' ? padHost.start() : padHost.restart()} title="Odśwież pokój (zmieni połączenie wszystkim)" className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-slate-400 hover:bg-white/10 hover:text-white"><RefreshCw size={14} /> Odśwież pokój</button>
            </div>
            <div className="mt-2 divide-y divide-white/[.06] rounded-2xl border border-white/10 bg-white/[.03]">
              {PLAYER_DEFS.map((player, index) => {
                const pad = state.pads.find(p => p.slot === index);
                const admin = pad && state.pads.reduce((first, p) => p.connectedAt < first.connectedAt ? p : first, state.pads[0]).connId === pad.connId;
                return (
                  <div key={index} className="flex items-center gap-3 px-3 py-2.5">
                    <span className="h-8 w-8 shrink-0 rounded-lg text-center text-sm font-bold leading-8" style={{ color: player.color, background: `${player.color}22` }}>{index + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-white">{pad?.nick || 'Wolne miejsce'}</div>
                      <div className="text-[11px] text-slate-500">{pad ? <>{admin ? '★ Administrator · ' : ''}{pad.via === 'relay' ? <>przekaźnik <Antenna size={11} className="inline text-orange-400" /></> : <>P2P <Wifi size={11} className="inline text-emerald-400" /></>} · {pad.latency} ms</> : `Gracz ${index + 1}`}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4"><ConnectionCheck defaultOpen={false} /></div>
            {state.error && <p className="mt-2 text-xs text-amber-300">{state.error}</p>}
            {state.note && <p className="mt-2 text-xs text-orange-300">{state.note}</p>}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
