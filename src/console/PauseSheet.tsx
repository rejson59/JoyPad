import { useState } from 'react';
import { Play, ArrowUpRight, ArrowLeft, Radio, Pause } from 'lucide-react';
import { GAMES } from '../arcade/catalog';
import { Sheet } from './Sheet';
import { useT } from '../platform/i18n';

/**
 * Pauza rundy. v1.8: zamknięcie panelu (X, Esc, WSTECZ pilota, klik w tło)
 * NIE wznawia gry — prowadzi do potwierdzenia zakończenia rundy. Gra wraca
 * wyłącznie jawnym przyciskiem „Wracamy do gry". (Naprawa: wcześniej WSTECZ
 * na padzie administratora odpauzowywał rundę zamiast wracać do biblioteki.)
 */
export function PauseSheet({ game, onResume, onExit }: { game: string; onResume: () => void; onExit: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const { language, t } = useT();
  const en = language === 'en';
  const info = GAMES.find(item => item.title === game || item.english.title === game);
  return <Sheet variant="cinema" artwork={info ? `${import.meta.env.BASE_URL}${info.cover}` : undefined} eyebrow="JOYPAD / SESSION INTERMISSION" title={en ? 'Take a breath.' : 'Chwila oddechu.'} onClose={() => setConfirm(value => !value)}>
    <div className="cine-pause-content">
      <div className="cine-pause-symbol" aria-hidden="true"><Pause size={26} /><span /></div>
      <div className="cine-pause-label"><span /> {en ? 'GAME PAUSED' : 'ROZGRYWKA WSTRZYMANA'}</div>
      <h3>{game}</h3><p>{en ? <>The world can wait a moment.<br />Come back when you are ready.</> : <>Świat może chwilę poczekać.<br />Wracaj, kiedy będziesz gotowy.</>}</p>
      {!confirm ? <div className="cine-pause-actions">
        <button className="cine-resume" onClick={onResume} autoFocus><span className="cine-action-icon"><Play size={18} fill="currentColor" /></span><span>{en ? 'Resume game' : 'Wracamy do gry'}<small>{en ? 'Continue where you left off' : 'Kontynuuj od tego samego miejsca'}</small></span><ArrowUpRight size={23} /></button>
        <button className="cine-exit-link" onClick={() => setConfirm(true)}><ArrowLeft size={16} /> {t('results.backLibrary')}</button>
      </div> : <div className="os-exit-confirm cine-confirm" role="alert"><span className="os-eyebrow">{en ? 'END GAME SESSION' : 'ZAKOŃCZENIE SESJI GRY'}</span><h3>{en ? 'Leave this round?' : 'Zostawiamy tę rundę?'}</h3><p>{en ? 'This round will end without a result. Your controllers will stay connected.' : 'Wynik rozgrywki nie zostanie dokończony. Twoje kontrolery pozostaną w pokoju.'}</p><button className="os-play" onClick={onExit} autoFocus>{en ? 'End round' : 'Zakończ rundę'} <ArrowUpRight size={17} /></button><button className="cine-exit-link" onClick={() => setConfirm(false)}>{en ? 'No, stay in the game' : 'Nie, zostajemy'}</button></div>}
      <div className="cine-pause-footer"><Radio size={15} /><span>{en ? 'Back opens the exit prompt · resume with the play button' : 'WSTECZ otwiera wyjście · wznowienie przyciskiem gry'}<small>{en ? 'The round stays paused until you return' : 'Runda czeka wstrzymana do powrotu'}</small></span><span className="cine-session-led" /></div>
    </div>
  </Sheet>;
}
