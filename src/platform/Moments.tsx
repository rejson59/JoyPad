import { useState, type CSSProperties } from 'react';
import { ArrowUpRight, Sparkles, Play, Flag, Crosshair } from 'lucide-react';
import { Sheet } from '../console/Sheet';
import type { GameInfo } from '../arcade/catalog';
import { momentTime, type Moment } from './momentRecorder';
import { ReplayPlayer } from './ReplayPlayer';

export function Moments({ moments, info, notice = '' }: { moments: Moment[]; info: GameInfo; notice?: string }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // Resolve by id so a card opened during finalization receives the finished video.
  const selected = moments.find(m => m.id === selectedId);
  return <section className="joy-moments" aria-label="Moments — najlepsze akcje rundy">
    <header><div><span className="os-eyebrow"><Sparkles size={12} /> PRZEŻYJ TO JESZCZE RAZ</span><h2>Moments<span>.</span></h2></div><span>{String(moments.filter(m => m.replay).length).padStart(2, '0')}<small>POWTÓRKI WIDEO</small></span></header>
    <p>Krótkie nagrania Twojej rozgrywki. Tylko na tym urządzeniu — pobierz je przed kolejną rundą lub wyjściem z gry.</p>
    {notice && <p className="replay-notice" role="status">{notice}</p>}
    {moments.length ? <div className="moment-cards">{moments.map((m, i) => <button key={m.id} style={{ '--moment-color': m.color, '--moment-delay': `${i * 90}ms` } as CSSProperties} onClick={() => setSelectedId(m.id)}>
      <span className="moment-top"><i>{m.replay ? <Play size={22} /> : m.kind === 'lap' ? <Flag size={22} /> : <Crosshair size={22} />}</i><time>{momentTime(m.at)}</time></span>
      <span className="moment-title">{m.title}</span><span className="moment-player">{m.name}<ArrowUpRight size={15} /></span><small className="moment-video-badge">{m.replay ? `${Math.round(m.replay.duration)} s · OBEJRZYJ` : 'OPIS AKCJI · BEZ WIDEO'}</small>
    </button>)}</div> : <div className="moment-empty">Tym razem nie zarejestrowano wyróżnionych akcji. Kolejna runda to nowa historia.</div>}
    {selected && <Sheet variant="cinema" wide eyebrow="JOYPAD / MOMENTS" title={selected.title} onClose={() => setSelectedId(null)}>
      <div className="moment-video-heading"><span>{selected.name}</span><time>{momentTime(selected.at)} · czas rundy</time></div>
      {selected.replay ? <ReplayPlayer key={`${selected.id}-${selected.replay.url}`} clip={selected.replay} filename={`joypad-${info.id}-moment-${selected.id}`} /> : <div className="moment-empty">{notice || 'Brak nagrania tej akcji. Poniżej rzeczywiste zdarzenie zgłoszone przez silnik, nie powtórka.'}</div>}
      <div className="moment-video-detail"><p>{selected.detail}</p><div className="moment-selector">{moments.map((m, i) => <button key={m.id} aria-label={`Moment ${i + 1}: ${m.title}`} aria-pressed={m.id === selected.id} onClick={() => setSelectedId(m.id)}>{String(i + 1).padStart(2, '0')}</button>)}</div><small>{info.title} · Klip obejmuje również chwilę przed i po akcji; początek i koniec rundy mogą go skrócić.</small></div>
    </Sheet>}
  </section>;
}
