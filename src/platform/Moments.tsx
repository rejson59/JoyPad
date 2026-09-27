import { useState, type CSSProperties } from 'react';
import { Archive, ArrowUpRight, Check, Play, Sparkles, Flag, Crosshair } from 'lucide-react';
import type { GameInfo } from '../arcade/catalog';
import { momentTime, type Moment } from './momentRecorder';
import { ReplayPlayer } from './ReplayPlayer';
import { saveMomentToGallery } from './momentGallery';
import { Sheet } from '../console/Sheet';

export function Moments({ moments, info, notice = '' }: { moments: Moment[]; info: GameInfo; notice?: string }) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [saved, setSaved] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState<number | null>(null);
  const [saveError, setSaveError] = useState('');
  const selected = moments.find(m => m.id === selectedId);
  const save = async (moment: Moment) => {
    if (!moment.replay || saved.has(moment.id)) return;
    setSaving(moment.id); setSaveError('');
    try { await saveMomentToGallery(moment, info.id); setSaved(old => new Set(old).add(moment.id)); }
    catch { setSaveError('Nie udało się zapisać klipu. Pamięć przeglądarki może być niedostępna.'); }
    finally { setSaving(null); }
  };
  return <section className="joy-moments" aria-label="Moments — best plays from the round">
    <header><div><span className="os-eyebrow"><Sparkles size={12} /> MOMENTS / HIGHLIGHTS</span><h2>Moments<span>.</span></h2></div><span>{String(moments.filter(m => m.replay).length).padStart(2, '0')}<small>VIDEO HIGHLIGHTS</small></span></header>
    <p>Automatic highlights from the round. Watch them now or save selected clips to your local Moments Gallery.</p>
    {notice && <p className="replay-notice" role="status">{notice}</p>}
    {saveError && <p className="replay-notice" role="status">{saveError}</p>}
    {moments.length ? <div className="moment-cards">{moments.map((m, i) => <div key={m.id} className="moment-card-wrap" style={{ '--moment-color': m.color, '--moment-delay': `${i * 90}ms` } as CSSProperties}>
      <button className="moment-card-open" onClick={() => setSelectedId(m.id)}><span className="moment-top"><i>{m.replay ? <Play size={22} /> : m.kind === 'lap' ? <Flag size={22} /> : <Crosshair size={22} />}</i><time>{momentTime(m.at)}</time></span><span className="moment-title">{m.title}</span><span className="moment-player">{m.name}<ArrowUpRight size={15} /></span><small className="moment-video-badge">{m.replay ? `${Math.round(m.replay.duration)} s · OBEJRZYJ / WATCH` : 'EVENT DETAILS · NO VIDEO'}</small></button>
      {m.replay && <button type="button" className="moment-save" disabled={saving === m.id || saved.has(m.id)} onClick={() => { void save(m); }}>{saved.has(m.id) ? <><Check size={14} /> SAVED TO GALLERY</> : saving === m.id ? 'SAVING…' : <><Archive size={14} /> SAVE TO MOMENTS GALLERY</>}</button>}
    </div>)}</div> : <div className="moment-empty">No standout plays were captured this round. The next round is a new story.</div>}
    {selected && <Sheet variant="cinema" wide eyebrow="JOYPAD / MOMENTS" title={selected.title} onClose={() => setSelectedId(null)}>
      <div className="moment-video-heading"><span>{selected.name}</span><time>{momentTime(selected.at)} · round time</time></div>
      {selected.replay ? <ReplayPlayer key={`${selected.id}-${selected.replay.url}`} clip={selected.replay} filename={`joypad-${info.id}-moment-${selected.id}`} /> : <div className="moment-empty">{notice || 'No video was available for this confirmed game event.'}</div>}
      {selected.replay && <button type="button" className="gallery-save-large" disabled={saving === selected.id || saved.has(selected.id)} onClick={() => { void save(selected); }}>{saved.has(selected.id) ? <><Check size={16} /> Saved to Moments Gallery</> : <><Archive size={16} /> Save to Moments Gallery</>}</button>}
      <div className="moment-video-detail"><p>{selected.detail}</p><div className="moment-selector">{moments.map((m, i) => <button key={m.id} aria-label={`Moment ${i + 1}: ${m.title}`} aria-pressed={m.id === selected.id} onClick={() => setSelectedId(m.id)}>{String(i + 1).padStart(2, '0')}</button>)}</div><small>{info.title} · The clip includes a short window before and after the action.</small></div>
    </Sheet>}
  </section>;
}
