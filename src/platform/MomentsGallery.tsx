import { useEffect, useMemo, useState } from 'react';
import { Clapperboard, Download, Play, Trash2, Share2, Filter, ArrowDownWideNarrow } from 'lucide-react';
import { deleteGalleryMoment, galleryFileExtension, listGalleryMoments, selectGalleryMoments, GALLERY_MAX_BYTES, GALLERY_MAX_ITEMS, type GalleryMoment } from './momentGallery';
import { ReplayPlayer } from './ReplayPlayer';
import { momentTime } from './momentRecorder';
import { GAMES, localizeGame } from '../arcade/catalog';
import { t as translateMessage, useT } from './i18n';

function formatBytes(value: number) {
  if (value < 1024 * 1024) return `${Math.ceil(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function gameTitle(id: GalleryMoment['game'], language: 'pl' | 'en') {
  const game = GAMES.find(entry => entry.id === id);
  return game ? localizeGame(game, language).title : (language === 'en' ? 'Archived game' : 'Archiwalna gra');
}

export function MomentsGallery() {
  const { language, t } = useT();
  const [items, setItems] = useState<GalleryMoment[]>([]);
  const [selected, setSelected] = useState<GalleryMoment | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  useEffect(() => {
    let active = true;
    void listGalleryMoments().then(value => { if (active) setItems(value); }).catch(() => { if (active) setError(translateMessage(language, 'gallery.unavailable')); });
    return () => { active = false; };
  }, [language]);
  const selectedClip = useMemo(() => selected && ({ url: URL.createObjectURL(selected.blob), mime: selected.mime, duration: selected.duration, eventOffset: 0 }), [selected]);
  useEffect(() => () => { if (selectedClip) URL.revokeObjectURL(selectedClip.url); }, [selectedClip]);
  const downloadUrls = useMemo(() => new Map(items.map(item => [item.id, URL.createObjectURL(item.blob)])), [items]);
  useEffect(() => () => { for (const url of downloadUrls.values()) URL.revokeObjectURL(url); }, [downloadUrls]);

  const totalBytes = items.reduce((sum, item) => sum + item.blob.size, 0);
  const gameOptions = [...new Set(items.map(item => item.game))].filter(id => GAMES.some(game => game.id === id));
  const visibleItems = useMemo(() => selectGalleryMoments(items, filter, sort), [items, filter, sort]);
  const share = async (item: GalleryMoment) => {
    try {
      if (typeof navigator.share !== 'function' || typeof File === 'undefined') throw new Error('unsupported');
      const file = new File([item.blob], `joypad-${item.game}-${item.id}.${galleryFileExtension(item.mime)}`, { type: item.mime });
      if (navigator.canShare && !navigator.canShare({ files: [file] })) throw new Error('unsupported');
      await navigator.share({ files: [file], title: item.title, text: `${gameTitle(item.game, language)} · JoyPad Moments` });
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(t('gallery.shareUnavailable'));
    }
  };
  const remove = async (item: GalleryMoment) => {
    if (!window.confirm(t('gallery.deleteConfirm'))) return;
    try {
      await deleteGalleryMoment(item.id);
      if (selected?.id === item.id) setSelected(null);
      setItems(current => current.filter(entry => entry.id !== item.id));
    } catch { setError(t('gallery.deleteError')); }
  };
  const percent = Math.min(100, totalBytes / GALLERY_MAX_BYTES * 100);

  return <div className="moments-gallery">
    <div className="moments-gallery-intro"><Clapperboard size={22} /><div><b>{t('gallery.local')}</b><p>{t('gallery.localInfo')}</p><div className="moments-gallery-storage" aria-label={`${t('gallery.storage')}: ${formatBytes(totalBytes)} / ${formatBytes(GALLERY_MAX_BYTES)}`}><div><span>{t('gallery.storage')}</span><b>{formatBytes(totalBytes)} / {formatBytes(GALLERY_MAX_BYTES)}</b></div><span className="moments-gallery-storage-track"><i style={{ width: `${percent}%` }} /></span><small>{items.length}/{GALLERY_MAX_ITEMS} {t('gallery.items')}</small></div></div></div>
    {error && <p className="replay-error" role="status">{error}<button type="button" onClick={() => setError('')} aria-label={t('common.close')}>×</button></p>}
    {!items.length && !error && <div className="moment-empty">{t('gallery.empty')}</div>}
    {!!items.length && <div className="moments-gallery-toolbar">
      <label><Filter size={15} /><span>{t('gallery.filter')}</span><select value={filter} onChange={event => setFilter(event.target.value)}><option value="all">{t('gallery.allGames')}</option>{gameOptions.map(id => <option key={id} value={id}>{gameTitle(id, language)}</option>)}</select></label>
      <label><ArrowDownWideNarrow size={15} /><span>{t('gallery.sort')}</span><select value={sort} onChange={event => setSort(event.target.value as 'newest' | 'oldest')}><option value="newest">{t('gallery.newest')}</option><option value="oldest">{t('gallery.oldest')}</option></select></label>
    </div>}
    {!visibleItems.length && items.length > 0 && <div className="moment-empty">{t('gallery.noMatches')}</div>}
    <div className="moments-gallery-grid">{visibleItems.map(item => <article key={item.id} style={{ '--moment-color': item.color } as React.CSSProperties}>
      <div className="moments-gallery-card"><span className="moment-top"><i><Play size={18} /></i><time>{momentTime(item.at)}</time></span><h3>{item.title}</h3><p>{item.player} · {gameTitle(item.game, language)}</p><small>{new Date(item.createdAt).toLocaleDateString(language === 'en' ? 'en-US' : 'pl-PL')} · {Math.round(item.duration)} s</small></div>
      <div className="moments-gallery-actions"><button type="button" onClick={() => setSelected(item)}><Play size={15} /> {t('gallery.play')}</button><a href={downloadUrls.get(item.id)} download={`joypad-${item.game}-${item.id}.${galleryFileExtension(item.mime)}`}><Download size={15} /> {t('gallery.download')}</a>{typeof navigator.share === 'function' && <button type="button" onClick={() => { void share(item); }} aria-label={`${t('gallery.share')}: ${item.title}`}><Share2 size={15} /></button>}<button type="button" aria-label={`${t('gallery.delete')} ${item.title}`} onClick={() => { void remove(item); }}><Trash2 size={15} /></button></div>
    </article>)}</div>
    {selected && selectedClip && <div className="moments-gallery-player"><div className="moments-gallery-player-head"><b>{selected.title}</b><button type="button" onClick={() => setSelected(null)}>{t('gallery.close')}</button></div><ReplayPlayer clip={selectedClip} filename={`joypad-${selected.game}-gallery`} /></div>}
  </div>;
}
