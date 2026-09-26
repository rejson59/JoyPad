import { useState } from 'react';
import { Play, ArrowUpRight, ArrowLeft, Radio, Pause } from 'lucide-react';
import { GAMES } from '../arcade/catalog';
import { Sheet } from './Sheet';
export function PauseSheet({ game, onResume, onExit }: { game: string; onResume: () => void; onExit: () => void }) {
  const [confirm, setConfirm] = useState(false);
  const info = GAMES.find(item => item.title === game);
  return <Sheet variant="cinema" artwork={info ? `${import.meta.env.BASE_URL}${info.cover}` : undefined} eyebrow="JOYPAD / SESSION INTERMISSION" title="Chwila oddechu." onClose={onResume}>
    <div className="cine-pause-content">
      <div className="cine-pause-symbol" aria-hidden="true"><Pause size={26} /><span /></div>
      <div className="cine-pause-label"><span /> ROZGRYWKA WSTRZYMANA</div>
      <h3>{game}</h3><p>Świat może chwilę poczekać.<br />Wracaj, kiedy będziesz gotowy.</p>
      {!confirm ? <div className="cine-pause-actions">
        <button className="cine-resume" onClick={onResume}><span className="cine-action-icon"><Play size={18} fill="currentColor" /></span><span>Wracamy do gry<small>Kontynuuj od tego samego miejsca</small></span><ArrowUpRight size={23} /></button>
        <button className="cine-exit-link" onClick={() => setConfirm(true)}><ArrowLeft size={16} /> Wróć do biblioteki</button>
      </div> : <div className="os-exit-confirm cine-confirm" role="alert"><span className="os-eyebrow">ZAKOŃCZENIE SESJI GRY</span><h3>Zostawiamy tę rundę?</h3><p>Wynik rozgrywki nie zostanie dokończony. Twoje kontrolery pozostaną w pokoju.</p><button className="os-play" onClick={onExit}>Zakończ rundę <ArrowUpRight size={17} /></button><button className="cine-exit-link" onClick={() => setConfirm(false)}>Nie, zostajemy</button></div>}
      <div className="cine-pause-footer"><Radio size={15} /><span>Sesja zachowana<small>Esc lub pilot — wróć do gry</small></span><span className="cine-session-led" /></div>
    </div>
  </Sheet>;
}
