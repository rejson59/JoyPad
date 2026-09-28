import { useRef, useState } from 'react';
import { Download, Pause, Play, RotateCcw } from 'lucide-react';
import type { ReplayClip } from './replayRecorder';
import { momentTime } from './momentRecorder';
import { useT } from './i18n';

export function ReplayPlayer({ clip, filename }: { clip: ReplayClip; filename: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState('');
  const { language, t } = useT();
  const play = () => {
    const node = video.current;
    if (!node) return;
    if (node.paused) void node.play().catch(() => setError(t('replay.playError')));
    else node.pause();
  };
  return <div className="moment-replay">
    <video ref={video} src={clip.url} controls playsInline muted preload="metadata" aria-label={t('replay.aria')}
      onPlay={() => { setPlaying(true); setError(''); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => setError(t('replay.formatError'))} />
    <div className="replay-labels"><span>{t('replay.captured')}</span><span>{t('replay.action')} {momentTime(clip.eventOffset)} / {momentTime(clip.duration)}</span></div>
    <div className="replay-actions">
      <button onClick={play}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? t('replay.pause') : t('replay.play')}</button>
      <button onClick={() => { if (video.current) { video.current.currentTime = 0; void video.current.play().catch(() => setError(t('replay.startError'))); } }}><RotateCcw size={16} />{t('replay.fromStart')}</button>
      <button aria-pressed={slow} onClick={() => { if (video.current) video.current.playbackRate = slow ? 1 : .5; setSlow(!slow); }}>{slow ? (language === 'en' ? '0.5×' : '0,5×') : '1×'} · {t('replay.speed')}</button>
      <a href={clip.url} download={`${filename}.${clip.mime.includes('mp4') ? 'mp4' : 'webm'}`}><Download size={16} />{t('replay.download')}</a>
    </div>
    {error && <p role="status" className="replay-error">{error}</p>}
  </div>;
}
