import { useCallback, useEffect, useRef, useState } from 'react';
import type { GameId } from '../arcade/catalog';
import type { Language } from './i18n';
import { t as translateMessage } from './i18n';
import { getPreferences } from '../console/preferences';
import { MomentRecorder, type Moment } from './momentRecorder';
import { ReplayRecorder } from './replayRecorder';

interface RecordingSession { video: ReplayRecorder; events: MomentRecorder; language: Language; finished: boolean }
/** The shell owns URLs across game → results. Restart/exit releases them; late async
 * recorder callbacks from an older round can never replace the current results. */
export function useRecordedMoments(game: GameId) {
  const current = useRef<RecordingSession | null>(null);
  const [moments, setMoments] = useState<Moment[]>([]);
  const [replayNotice, setNotice] = useState('');
  const begin = useCallback((language: Language = 'pl'): RecordingSession => {
    current.current?.video.dispose();
    const video = new ReplayRecorder(getPreferences().replays, {}, language);
    const events = new MomentRecorder(game, (moment, highlights) => video.mark(moment, highlights), language);
    const session = { video, events, language, finished: false };
    current.current = session;
    setMoments([]); setNotice(video.notice);
    return session;
  }, [game]);
  const finish = useCallback((session: RecordingSession) => {
    if (session.finished || current.current !== session) return;
    session.finished = true;
    const selected = session.events.highlights();
    setMoments(selected); setNotice(translateMessage(session.language, 'moments.notice.preparing'));
    void session.video.finish(selected).then(result => {
      if (current.current !== session) return;
      setMoments(result);
      setNotice(session.video.notice || (result.some(m => !m.replay) ? translateMessage(session.language, 'moments.notice.partial') : ''));
    }).catch(() => {
      if (current.current !== session) return;
      session.video.dispose();
      setNotice(translateMessage(session.language, 'moments.notice.failed'));
    });
  }, []);
  useEffect(() => () => { current.current?.video.dispose(); current.current = null; }, []);
  return { moments, replayNotice, begin, finish };
}
