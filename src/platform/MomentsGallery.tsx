import { useEffect, useMemo, useState } from 'react';
import { Archive, Download, Play, Trash2 } from 'lucide-react';
import { deleteGalleryMoment, galleryFileExtension, listGalleryMoments, type GalleryMoment } from './momentGallery';
import { ReplayPlayer } from './ReplayPlayer';
import { momentTime } from './momentRecorder';

export function MomentsGallery() {
  const [items, setItems] = useState<GalleryMoment[]>([]);
  const [selected, setSelected] = useState<GalleryMoment | null>(null);
  const [error, setError] = useState('');
  const refresh = () => { void listGalleryMoments().then(setItems).catch(() => setError('Galeria nie jest dostępna w tej przeglądarce.')); };
  useEffect(() => { refresh(); }, []);
  const selectedClip = useMemo(() => selected && ({ url: URL.createObjectURL(selected.blob), mime: selected.mime, duration: selected.duration, eventOffset: 0 }), [selected]);
  useEffect(() => () => { if (selectedClip) URL.revokeObjectURL(selectedClip.url); }, [selectedClip]);
  return <div className="moments-gallery">
    <div className="moments-gallery-intro"><Archive size={22} /><div><b>Twoja lokalna kolekcja</b><p>Moments zapisane na tym urządzeniu. Nic nie jest wysyłane do internetu.</p></div></div>
    {error && <p className="replay-error" role="status">{error}</p>}
    {!items.length && !error && <div className="moment-empty">Galeria jest pusta. Po rundzie wybierz „Zapisz do Galerii Moments” przy najlepszej akcji.</div>}
    <div className="moments-gallery-grid">{items.map(item => <article key={item.id} style={{ '--moment-color': item.color } as React.CSSProperties}>
      <div className="moments-gallery-card"><span className="moment-top"><i><Play size={18} /></i><time>{momentTime(item.at)}</time></span><h3>{item.title}</h3><p>{item.player} · {item.game}</p><small>{new Date(item.createdAt).toLocaleDateString()} · {Math.round(item.duration)} s</small></div>
      <div className="moments-gallery-actions"><button type="button" onClick={() => setSelected(item)}><Play size={15} /> Odtwórz</button><a href={URL.createObjectURL(item.blob)} download={`joypad-${item.game}-${item.id}.${galleryFileExtension(item.mime)}`}><Download size={15} /> Pobierz</a><button type="button" aria-label={`Usuń ${item.title}`} onClick={() => { void deleteGalleryMoment(item.id).then(refresh); }}><Trash2 size={15} /></button></div>
    </article>)}</div>
    {selected && selectedClip && <div className="moments-gallery-player"><div className="moments-gallery-player-head"><b>{selected.title}</b><button type="button" onClick={() => setSelected(null)}>Zamknij</button></div><ReplayPlayer clip={selectedClip} filename={`joypad-${selected.game}-gallery`} /></div>}
  </div>;
}
