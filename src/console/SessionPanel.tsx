import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, Eye, EyeOff, Gamepad2, Plus, RefreshCw, Smartphone, Wifi, Zap } from 'lucide-react';
import { GAMES, localizeGame, type GameId } from '../arcade/catalog';
import { padUrlFor } from '../net/protocol';
import { padHost } from '../net/padHost';
import { QrFrame } from '../components/QrFrame';
import { PLAYER_DEFS } from '../game/types';
import { normalizeProfile } from '../platform/profile';
import { PlayerAvatar } from '../platform/PlayerAvatar';
import { usePadHost } from '../pad/PadHostPanel';
import { sessionSummary } from './sessionSummary';
import { setPreferences, useConsolePreferences } from './preferences';
import { useT } from '../platform/i18n';

/**
 * Okienko WSPÓLNY EKRAN (v1.8).
 *
 * - Kod QR jest widoczny, dopóki pokój działa — także po dołączeniu administratora
 *   i kolejnych graczy (ktoś wciąż może dołączyć). Host może go schować jednym
 *   przyciskiem (preferencja `showQr`), również w Centrum pokoju.
 * - „Odśwież kod" tworzy nowy pokój, gdy podgląd/łączność staje — bezpieczne tylko
 *   bez podłączonych padów, więc pokazujemy go wyłącznie wtedy.
 * - Styl liquid glass: mocna przezroczystość + blur, QR pozostaje pełnokontrastowy.
 */
export function SessionPanel({ onConnections, onLab, onOpen }: { onConnections: () => void; onLab: () => void; onOpen: (id: GameId) => void }) {
  const state = usePadHost();
  const prefs = useConsolePreferences();
  const { language, t } = useT();
  const [qr, setQr] = useState('');
  const url = state.code ? padUrlFor(state.code, state.joinToken) : '';
  const ready = state.status === 'ready' || state.relay === 'online';
  const session = sessionSummary(state.pads.length, ready, language);
  const qrVisible = prefs.showQr;

  useEffect(() => {
    let active = true;
    setQr('');
    if (url && ready) void import('qrcode').then(({ default: QR }) => QR.toDataURL(url, { width: 256, margin: 2, color: { dark: '#0a0c10', light: '#ffffff' } })).then(src => { if (active) setQr(src); }).catch(() => {});
    return () => { active = false; };
  }, [url, ready]);

  const nobodyConnected = state.pads.length === 0;

  return <aside className="os-session" aria-label={t('library.session')}>
    <div className="os-session-heading"><span className="os-eyebrow">{t('library.sharedScreen')}</span><Wifi size={15} /></div>
    <h2>{session.title}</h2>
    <p className="os-session-status" role="status">{session.status}</p><p>{session.count ? t('library.chooseAndPrepare') : session.pairing}</p>
    {ready && qrVisible && <div className="os-pairing">
      <QrFrame src={qr} size={136} />
      <div>
        <span className="os-pairing-label">{t('library.roomCode')}</span>
        <strong>{state.code || '·····'}</strong>
        <a href="#pad" target="_blank" rel="noopener noreferrer"><Smartphone size={14} /> {t('library.openPad')}</a>
        <div className="os-pairing-actions">
          <button className="os-mini" onClick={() => setPreferences({ showQr: false })} aria-label={language === 'en' ? 'Hide QR code' : 'Schowaj kod QR'}><EyeOff size={14} /><span>{language === 'en' ? 'Hide' : 'Schowaj'}</span></button>
          {nobodyConnected && <button className="os-mini" onClick={() => padHost.restart()} aria-label={language === 'en' ? 'New room code' : 'Nowy kod pokoju'}><RefreshCw size={14} /><span>{language === 'en' ? 'New code' : 'Nowy kod'}</span></button>}
        </div>
      </div>
    </div>}
    {ready && !qrVisible && <button className="os-qr-reveal" onClick={() => setPreferences({ showQr: true })}><Eye size={15} />{language === 'en' ? 'Show QR code' : 'Pokaż kod QR'}</button>}
    {!ready && <div className="os-pairing os-pairing-wait">
      <span>{language === 'en' ? 'Connecting the room…' : 'Łączę pokój…'}</span>
      {nobodyConnected && <button className="os-mini" onClick={() => padHost.restart()}><RefreshCw size={14} /><span>{language === 'en' ? 'Refresh' : 'Odśwież'}</span></button>}
    </div>}
    <div className="os-roster">{PLAYER_DEFS.map((p, slot) => {
      const pad = state.pads.find(p => p.slot === slot);
      return <div key={slot} className={`os-player ${pad ? 'is-connected' : ''}`} style={{ '--player-color': p.color } as CSSProperties}><span>{pad ? <PlayerAvatar avatar={normalizeProfile(pad.profile).avatar} size={20} /> : <Gamepad2 size={18} />}</span><div><b>{pad?.nick || (language === 'en' ? `Slot ${slot + 1}` : `Miejsce ${slot + 1}`)}</b><small>{pad ? state.adminSlot === slot ? t('library.admin') : t('library.connected') : t('library.waitingPlayer')}</small></div>{pad && <i />}</div>;
    })}</div>
    {state.pads.some(p => p.suggestedGame) && <div className="lobby-votes"><span className="os-eyebrow">{t('library.crewVotes')}</span>{GAMES.filter(g => state.pads.some(p => p.suggestedGame === g.id)).map(g => { const localized = localizeGame(g, language); return <button key={g.id} onClick={() => onOpen(g.id)}><span>{localized.title}<small>{state.pads.filter(p => p.suggestedGame === g.id).map(p => p.nick).join(', ')}</small></span><ArrowRight size={16} /></button>; })}</div>}
    <button className="os-session-invite" onClick={onConnections}><Plus size={15} />{session.invite}<ArrowRight size={15} /></button>
    <button className="os-lab-link" onClick={onLab}><Zap size={16} /><span>{t('library.padCheck')}</span><ArrowRight size={16} /></button>
    {state.error && <details className="os-connection-detail"><summary>{t('library.connectionIssue')}</summary><p className="os-error">{state.error}</p>{nobodyConnected && <button className="os-mini" onClick={() => padHost.restart()}><RefreshCw size={14} /><span>{language === 'en' ? 'New room code' : 'Nowy kod pokoju'}</span></button>}</details>}
  </aside>;
}
