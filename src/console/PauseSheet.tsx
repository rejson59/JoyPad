import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { isLeaving, wishToLeave } from '../lib/exitWish';
import { Play, ArrowUpRight, ArrowLeft, Radio, Pause } from 'lucide-react';
import { GAMES } from '../arcade/catalog';
import { Sheet } from './Sheet';
import { useT } from '../platform/i18n';
export function PauseSheet({ game, onResume, onExit }: { game: string; onResume: () => void; onExit: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const panel = useRef<HTMLDivElement>(null);
  /**
   * Wyjście jest nieodwracalne w tej klatce. Raz zadeklarowane (`wishToLeave` w module
   * `lib/exitWish`), zamknięcie okienka — X, klik w tło, Esc, `back` pada, powtórzenie
   * trzymanego przycisku — nie ma już prawa tknąć pauzy. Inaczej „Wróć do biblioteki"
   * odpauzowywało grę pod kurtyną, bo `onClose` tego okienka to `onResume`.
   */
  const leave = useCallback(() => { wishToLeave(); onExit(); }, [onExit]);
  // Panel potwierdzenia podmienia przyciski w DOM-ie: aktywny element znika, fokus spada
  // na `body`, a kolejne „A" szukałoby celu poza panelem. Wskakujemy na „Zakończ rundę".
  useEffect(() => {
    if (!confirm) return;
    panel.current?.querySelector<HTMLElement>('.os-play')?.focus({ preventScroll: true });
  }, [confirm]);
  const { language, t } = useT();
  const en = language === 'en';
  const info = GAMES.find(item => item.title === game || item.english.title === game);
  return <Sheet variant="cinema" artwork={info ? `${import.meta.env.BASE_URL}${info.cover}` : undefined} eyebrow="JOYPAD / SESSION INTERMISSION" title={en ? 'Take a breath.' : 'Chwila oddechu.'} onClose={() => {
      if (isLeaving()) return;
      // Z panelu potwierdzenia „wstecz" znaczy „jedno cofnięcie", a nie „wracamy do gry".
      if (confirm) { setConfirm(false); return; }
      onResume();
    }}>
    <div className="cine-pause-content" style={{ '--game-accent': info?.accent ?? 'var(--os-accent)', '--game-soft': info?.accentSoft ?? 'var(--os-accent-deep)' } as CSSProperties}>
      <div className="cine-pause-symbol" aria-hidden="true"><Pause size={26} /><span /></div>
      <div className="cine-pause-label"><span /> {en ? 'GAME PAUSED' : 'ROZGRYWKA WSTRZYMANA'}</div>
      <h3>{game}</h3><p>{en ? <>The world can wait a moment.<br />Come back when you are ready.</> : <>Świat może chwilę poczekać.<br />Wracaj, kiedy będziesz gotowy.</>}</p>
      {!confirm ? <div className="cine-pause-actions">
        <button className="cine-resume" onClick={onResume}><span className="cine-action-icon"><Play size={18} fill="currentColor" /></span><span>{en ? 'Resume game' : 'Wracamy do gry'}<small>{en ? 'Continue where you left off' : 'Kontynuuj od tego samego miejsca'}</small></span><ArrowUpRight size={23} /></button>
        <button className="cine-exit-link" onClick={() => setConfirm(true)}><ArrowLeft size={16} /> {t('results.backLibrary')}</button>
      </div> : <div className="os-exit-confirm cine-confirm" role="alert" ref={panel}><span className="os-eyebrow">{en ? 'END GAME SESSION' : 'ZAKOŃCZENIE SESJI GRY'}</span><h3>{en ? 'Leave this round?' : 'Zostawiamy tę rundę?'}</h3><p>{en ? 'This round will end without a result. Your controllers will stay connected.' : 'Wynik rozgrywki nie zostanie dokończony. Twoje kontrolery pozostaną w pokoju.'}</p><button className="os-play" onClick={leave}>{en ? 'End round' : 'Zakończ rundę'} <ArrowUpRight size={17} /></button><button className="cine-exit-link" onClick={() => setConfirm(false)}>{en ? 'No, stay in the game' : 'Nie, zostajemy'}</button></div>}
      <div className="cine-pause-footer"><Radio size={15} /><span>{en ? 'Session saved' : 'Sesja zachowana'}<small>{en ? 'Esc or remote — resume when ready' : 'Esc lub pilot — wróć do gry'}</small></span><span className="cine-session-led" /></div>
    </div>
  </Sheet>;
}
