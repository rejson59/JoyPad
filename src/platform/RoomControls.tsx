import { PlayerAvatar } from './PlayerAvatar';
import { useState } from 'react';
import { Crown, LockKeyhole, Monitor, Users, UserMinus } from 'lucide-react';
import { DEFAULT_ROOM, type RoomAction, type SessionState } from '../net/protocol';
import { normalizeProfile } from './profile';
import { useT } from './i18n';

export function RoomControls({ session, onAction }: { session: SessionState; onAction: (action: RoomAction) => void }) {
  const [confirmation, setConfirmation] = useState<{ kind: 'kick' | 'transfer'; slot: number } | null>(null);
  const { t } = useT();
  const room = session.room ?? DEFAULT_ROOM;
  const target = session.roster.find(p => p.slot === confirmation?.slot);
  return <section className="room-controls">
    <p className="os-note">{t('room.intro')}</p>
    <div className="room-switches">
      <button role="switch" aria-checked={room.locked} onClick={() => onAction({ kind: 'locked', value: !room.locked })}><LockKeyhole /><span>{t('room.lock')}<small>{room.locked ? t('room.locked') : t('room.open')}</small></span><i /></button>
      <button role="switch" aria-checked={room.suggestions} onClick={() => onAction({ kind: 'suggestions', value: !room.suggestions })}><Users /><span>{t('room.voice')}<small>{t('room.voteInfo')}</small></span><i /></button>
      <button role="switch" aria-checked={room.dimmed} disabled={session.screen === 'game'} onClick={() => onAction({ kind: 'dimmed', value: !room.dimmed })}><Monitor /><span>{t('room.dim')}<small>{session.screen === 'game' ? t('room.dimGame') : t('room.dimInfo')}</small></span><i /></button>
    </div>
    <h3 className="room-section-title">{t('room.crew', { count: session.roster.length })}</h3>
    <div className="room-crew">{session.roster.map(p => <article key={p.slot}><span className="profile-avatar"><PlayerAvatar avatar={normalizeProfile(p.profile).avatar} /></span><div><b>{p.nick}</b><small>{p.slot === session.adminSlot ? t('room.admin') : t('room.pad', { n: p.slot + 1 })}</small></div>{p.slot === session.adminSlot ? <Crown size={17} /> : <button aria-label={t('room.transferAria', { name: p.nick })} onClick={() => setConfirmation({ kind: 'transfer', slot: p.slot })}><Crown size={17} /></button>}<button aria-label={t('room.disconnectAria', { name: p.nick })} onClick={() => setConfirmation({ kind: 'kick', slot: p.slot })}><UserMinus size={17} /></button></article>)}</div>
    {!session.roster.length && <p className="os-note">{t('room.noPlayers')}</p>}
    {confirmation && target && <div className="room-confirm" role="alert"><h3>{confirmation.kind === 'kick' ? t('room.kickTitle', { name: target.nick }) : t('room.transferTitle', { name: target.nick })}</h3><p>{confirmation.kind === 'kick' ? t('room.kickInfo') : t('room.transferInfo')}</p><div><button onClick={() => { onAction(confirmation); setConfirmation(null); }}>{t('room.confirm')}</button><button onClick={() => setConfirmation(null)}>{t('room.cancel')}</button></div></div>}
  </section>;
}
