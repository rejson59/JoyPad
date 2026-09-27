import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameId } from '../arcade/catalog';
import { getPreferences } from '../console/preferences';
import { MomentRecorder, type Moment } from './momentRecorder';
import { ReplayRecorder } from './replayRecorder';

interface RecordingSession { video: ReplayRecorder; events: MomentRecorder; finished: boolean }
/** The shell owns URLs across game → results. Restart/exit releases them; late async
 * recorder callbacks from an older round can never replace the current results. */
export function useRecordedMoments(game: GameId) {
  const current = useRef<RecordingSession | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [replayNotice, setNotice] = useState('');
  const begin = useCallback((): RecordingSession => {
    current.current?.video.dispose();
    const video = new ReplayRecorder(getPreferences().replays);
    const events = new MomentRecorder(game, (moment, highlights) => video.mark(moment, highlights));
    const session = { video, events, finished: false };
    current.current = session;
    setMoments([]); setNotice(video.notice);
    return session;
  }, [game]);
  const finish = useCallback((session: RecordingSession) => {
    if (session.finished || current.current !== session) return;
    session.finished = true;
    const selected = session.events.highlights();
    setMoments(selected); setNotice('Przygotowujemy Twoje powtórki…');
    void session.video.finish(selected).then(result => {
      if (current.current !== session) return;
      setMoments(result);
      setNotice(session.video.notice || (result.some(m => !m.replay) ? 'Nie wszystkie akcje mają nagranie — brak klatki lub klip poza zachowanym buforem.' : ''));
    }).catch(() => {
      if (current.current !== session) return;
      session.video.dispose();
      setNotice('Nie udało się zapisać powtórek. Wyniki i opisy akcji pozostają dostępne.');
    });
  }, []);
  useEffect(() => () => { current.current?.video.dispose(); current.current = null; }, []);
  return { moments, replayNotice, begin, finish };
}
