import { PlayerAvatar } from './PlayerAvatar';
import { useState } from 'react';
import { Crown, LockKeyhole, Monitor, Users, UserMinus } from 'lucide-react';
import { DEFAULT_ROOM, type RoomAction, type SessionState } from '../net/protocol';
import { normalizeProfile } from './profile';

export function RoomControls({ session, onAction }: { session: SessionState; onAction: (action: RoomAction) => void }) {
  const [confirmation, setConfirmation] = useState<{ kind: 'kick' | 'transfer'; slot: number } | null>(null);
  const room = session.room ?? DEFAULT_ROOM;
  const target = session.roster.find(p => p.slot === confirmation?.slot);
  return <section className="room-controls">
    <p className="os-note">Twoja ekipa. Twoje zasady. Zmiany są wspólne dla TV i wszystkich telefonów.</p>
    <div className="room-switches">
      <button role="switch" aria-checked={room.locked} onClick={() => onAction({ kind: 'locked', value: !room.locked })}><LockKeyhole /><span>Zamknij wejście<small>{room.locked ? 'Nowe telefony nie mogą dołączyć' : 'Zaproszenia są aktywne'}</small></span><i /></button>
      <button role="switch" aria-checked={room.suggestions} onClick={() => onAction({ kind: 'suggestions', value: !room.suggestions })}><Users /><span>Głos ekipy<small>Proponowanie gier w bibliotece i po rundzie</small></span><i /></button>
      <button role="switch" aria-checked={room.dimmed} disabled={session.screen === 'game'} onClick={() => onAction({ kind: 'dimmed', value: !room.dimmed })}><Monitor /><span>Przerwa na dużym ekranie<small>{session.screen === 'game' ? 'Dostępna poza trwającą rundą' : 'Zasłoń bibliotekę, zachowaj połączenia'}</small></span><i /></button>
    </div>
    <h3 className="room-section-title">EKIPA / {session.roster.length} Z 4</h3>
    <div className="room-crew">{session.roster.map(p => <article key={p.slot}><span className="profile-avatar"><PlayerAvatar avatar={normalizeProfile(p.profile).avatar} /></span><div><b>{p.nick}</b><small>{p.slot === session.adminSlot ? 'Administrator' : `Pad ${p.slot + 1}`}</small></div>{p.slot === session.adminSlot ? <Crown size={17} /> : <button aria-label={`Przekaż administrację: ${p.nick}`} onClick={() => setConfirmation({ kind: 'transfer', slot: p.slot })}><Crown size={17} /></button>}<button aria-label={`Odłącz: ${p.nick}`} onClick={() => setConfirmation({ kind: 'kick', slot: p.slot })}><UserMinus size={17} /></button></article>)}</div>
    {!session.roster.length && <p className="os-note">Na razie sam duży ekran. Zaproś pierwszy telefon.</p>}
    {confirmation && target && <div className="room-confirm" role="alert"><h3>{confirmation.kind === 'kick' ? `Odłączyć ${target.nick}?` : `Przekazać sterowanie: ${target.nick}?`}</h3><p>{confirmation.kind === 'kick' ? 'Ten telefon straci połączenie. To nie jest trwała blokada — zamknij wejście, aby nie dołączył ponownie.' : 'Ten gracz będzie sterował menu i pokojem. Duży ekran zawsze zachowuje kontrolę.'}</p><div><button onClick={() => { onAction(confirmation); setConfirmation(null); }}>Potwierdź</button><button onClick={() => setConfirmation(null)}>Anuluj</button></div></div>}
  </section>;
}
