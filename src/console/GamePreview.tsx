import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { Pause, Play } from 'lucide-react';
import type { GameInfo } from '../arcade/catalog';
import { useReducedMotion } from '../lib/useReducedMotion';
import { useConsolePreferences } from './preferences';

export const PREVIEW_GAMES = ['tanks', 'race', 'orbit'] as const;
/** Bump when public/previews/* is re-recorded: the files keep stable names, so a query
 *  string is what stops browsers and CDNs from serving a previous recording. */
const PREVIEW_REVISION = '2';
/** Recorded offline: never import an engine, connect a pad or advance a real match here. */
export function GamePreview({ game, suspended, controlsTarget }: { game: GameInfo; suspended: boolean; controlsTarget: HTMLElement | null }) {
  const prefs = useConsolePreferences();
  const reduced = useReducedMotion();
  const root = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [visible, setVisible] = useState(false);
  const [foreground, setForeground] = useState(!document.hidden);
  const [automatic, setAutomatic] = useState(false);
  const [requested, setRequested] = useState(false);
  const [paused, setPaused] = useState(false);
  const [settled, setSettled] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  // The frame is fitted to the recording's own shape, so a 21:9 TV and a 4:3 laptop both show all of it.
  const [ratio, setRatio] = useState('16 / 9');
  useEffect(() => {
    // Big screens (TV browsers report a coarse pointer) autoplay too; phones and metered links do not.
    const media = matchMedia('(min-width: 1000px) and (pointer: fine), (min-width: 1400px)');
    const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; addEventListener?: (name: string, fn: () => void) => void; removeEventListener?: (name: string, fn: () => void) => void } }).connection;
    const update = () => setAutomatic(media.matches && !connection?.saveData && !['slow-2g', '2g', '3g'].includes(connection?.effectiveType || ''));
    const visibility = () => setForeground(!document.hidden);
    update(); media.addEventListener('change', update); connection?.addEventListener?.('change', update);
    document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(entries => setVisible(entries[0].isIntersecting && entries[0].intersectionRatio >= .25), { threshold: .25 });
    if (root.current) observer.observe(root.current);
    return () => { observer.disconnect(); media.removeEventListener('change', update); connection?.removeEventListener?.('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const eligible = !suspended && visible && foreground && !paused && !failed && (requested || (prefs.previews && automatic && !reduced));
  useEffect(() => {
    setSettled(false); setPlaying(false);
    if (!eligible) return;
    const timer = window.setTimeout(() => setSettled(true), requested ? 0 : 900);
    return () => clearTimeout(timer);
  }, [eligible, requested]);
  const mounted = eligible && settled;
  useEffect(() => {
    if (!mounted || !video.current) return;
    const element = video.current;
    let current = true;
    element.muted = true;
    void element.play().catch(() => { if (current) { setPaused(true); setPlaying(false); } });
    return () => { current = false; element.pause(); element.removeAttribute('src'); element.querySelectorAll('source').forEach(source => source.removeAttribute('src')); element.load(); };
  }, [mounted]);
  if (!PREVIEW_GAMES.some(id => id === game.id)) return null;
  return <>
    <div ref={root} className={`os-wallpaper os-game-preview ${playing && mounted ? 'is-playing' : ''}`} style={{ '--preview-ratio': ratio } as CSSProperties}>
      <img className="is-selected" src={`${import.meta.env.BASE_URL}${game.cover}`} alt="" style={{ viewTransitionName: playing && mounted ? 'none' : 'game-cover' }} />
      {mounted && <video ref={video} style={{ viewTransitionName: playing ? 'game-cover' : 'none' }} muted playsInline loop preload="none" aria-label={`Nagrana rozgrywka botów w Full HD — ${game.title}`} onLoadedMetadata={event => { const { videoWidth, videoHeight } = event.currentTarget; if (videoWidth && videoHeight) setRatio(`${videoWidth} / ${videoHeight}`); }} onPlaying={() => setPlaying(true)} onWaiting={() => setPlaying(false)} onError={() => { setFailed(true); setPlaying(false); }}>
        <source src={`${import.meta.env.BASE_URL}previews/${game.id}.mp4?v=${PREVIEW_REVISION}`} type="video/mp4" />
        <source src={`${import.meta.env.BASE_URL}previews/${game.id}.webm?v=${PREVIEW_REVISION}`} type="video/webm" />
      </video>}
    </div>
    {controlsTarget && createPortal(<button type="button" className="os-icon os-background-toggle" disabled={failed} title={failed ? 'Podgląd niedostępny · okładka pozostaje' : mounted ? 'Zatrzymaj nagranie rozgrywki' : 'Odtwórz nagranie rozgrywki'} aria-label={mounted ? 'Zatrzymaj podgląd rozgrywki' : 'Odtwórz podgląd rozgrywki'} onClick={() => { if (mounted) { setPaused(true); setRequested(false); } else { setPaused(false); setRequested(true); } }}>{mounted ? <Pause size={18} /> : <Play size={18} />}</button>, controlsTarget)}
  </>;
}
