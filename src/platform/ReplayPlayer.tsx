import { useRef, useState } from 'react';
import { Download, Pause, Play, RotateCcw } from 'lucide-react';
import type { ReplayClip } from './replayRecorder';
import { momentTime } from './momentRecorder';

export function ReplayPlayer({ clip, filename }: { clip: ReplayClip; filename: string }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  const [error, setError] = useState('');
  const play = () => {
    const node = video.current;
    if (!node) return;
    if (node.paused) void node.play().catch(() => setError('Naciśnij odtwarzanie na TV lub pobierz klip, jeśli przeglądarka blokuje odtwarzacz.'));
    else node.pause();
  };
  return <div className="moment-replay">
    <video ref={video} src={clip.url} controls playsInline muted preload="metadata" aria-label="Powtórka wideo z Twojej rozgrywki"
      onPlay={() => { setPlaying(true); setError(''); }} onPause={() => setPlaying(false)} onEnded={() => setPlaying(false)}
      onError={() => setError('Nie można odtworzyć tego formatu w tej przeglądarce. Możesz pobrać klip.')} />
    <div className="replay-labels"><span>RZECZYWISTE NAGRANIE · BEZ DŹWIĘKU</span><span>Akcja: {momentTime(clip.eventOffset)} / {momentTime(clip.duration)}</span></div>
    <div className="replay-actions">
      <button onClick={play}>{playing ? <Pause size={16} /> : <Play size={16} />}{playing ? 'Pauza' : 'Odtwórz'}</button>
      <button onClick={() => { if (video.current) { video.current.currentTime = 0; void video.current.play().catch(() => setError('Użyj przycisku odtwarzania na TV.')); } }}><RotateCcw size={16} />Od początku</button>
      <button aria-pressed={slow} onClick={() => { if (video.current) video.current.playbackRate = slow ? 1 : .5; setSlow(!slow); }}>{slow ? '0,5×' : '1×'} · Tempo</button>
      <a href={clip.url} download={`${filename}.${clip.mime.includes('mp4') ? 'mp4' : 'webm'}`}><Download size={16} />Pobierz klip</a>
    </div>
    {error && <p role="status" className="replay-error">{error}</p>}
  </div>;
}
