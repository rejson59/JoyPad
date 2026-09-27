import { PlayerAvatar } from './PlayerAvatar';
import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { ACHIEVEMENTS, AVATARS, THEMES, loadProfile, type PlayerProfile } from './profile';
import { padClient, type PadClientState } from '../net/padClient';
import { GAMES } from '../arcade/catalog';
import { NickEditor } from '../pad/NickEditor';

export function GameSuggestions({ st }: { st: PadClientState }) {
  const selected = st.roster.find(p => p.slot === st.slot)?.suggestedGame;
  return <section className="lounge-suggestions" aria-label="Propozycje gier"><div className="lounge-heading"><span className="os-eyebrow">GŁOS EKIPY</span><h2>Co gramy?</h2><p>{st.room?.suggestions === false ? 'Administrator wstrzymał propozycje.' : 'Zaproponuj tytuł. Ostateczny wybór należy do admina.'}</p></div><div>{GAMES.filter(g => !g.wip && g.id !== st.game).map(g => {
    const votes = st.roster.filter(p => p.suggestedGame === g.id);
    return <button key={g.id} disabled={st.room?.suggestions === false} aria-pressed={selected === g.id} onClick={() => padClient.suggestGame(selected === g.id ? null : g.id)}><img src={`${import.meta.env.BASE_URL}${g.cover}`} alt="" /><span><b>{g.title}</b><small>{votes.length ? `${votes.length} głos${votes.length === 1 ? '' : 'y'} · ${votes.map(p => p.nick).join(', ')}` : g.genre}</small></span>{selected === g.id ? <Check size={18} /> : <i>+</i>}</button>;
  })}</div></section>;
}
export function PlayerLounge({ st, onProfile }: { st: PadClientState; onProfile: (p: PlayerProfile) => void }) {
  const [profile, setProfile] = useState(loadProfile);
  useEffect(() => { const receive = (event: Event) => { const next = (event as CustomEvent<PlayerProfile>).detail; if (next) setProfile(next); }; window.addEventListener('joypad-profile-updated', receive); return () => window.removeEventListener('joypad-profile-updated', receive); }, []);
  const update = (next: PlayerProfile) => { setProfile(next); padClient.setProfile(next); onProfile(next); };
  return <div className="player-lounge" style={{ '--lounge-accent': THEMES[profile.theme] } as CSSProperties}>
    <div className="lounge-pass"><span className="profile-avatar"><PlayerAvatar avatar={profile.avatar} size={36} /></span><div><span className="os-eyebrow">TWÓJ PLAYER PASS</span><h3>{st.nick || st.name}</h3><p>Pad {String(st.slot + 1).padStart(2, '0')} · Gotowy na dobry wieczór</p></div><Sparkles size={19} /></div>
    <fieldset><legend>Wybierz swoją buźkę</legend><div className="avatar-choices">{Object.entries(AVATARS).map(([id, face]) => <button key={id} aria-label={`Awatar: ${face}`} aria-pressed={profile.avatar === id} onClick={() => update({ ...profile, avatar: id as PlayerProfile['avatar'] })}><PlayerAvatar avatar={id as PlayerProfile['avatar']} /></button>)}</div></fieldset>
    <fieldset><legend>Kolor Twojej poczekalni</legend><div className="theme-choices">{Object.entries(THEMES).map(([id, color]) => <button key={id} style={{ '--swatch': color } as CSSProperties} aria-label={`Motyw: ${id}`} aria-pressed={profile.theme === id} onClick={() => update({ ...profile, theme: id as PlayerProfile['theme'] })}>{profile.theme === id && <Check size={17} />}</button>)}</div><p>Kolor slotu w grze pozostaje bez zmian, aby ekipa Cię rozpoznawała.</p></fieldset>
    <div className="profile-progress"><div><span className="os-eyebrow">LOKALNE OSIĄGNIĘCIA</span><strong>{profile.progress.wins} wygranych · {profile.progress.gamesPlayed} rund</strong><small>Seria: ×{profile.progress.streak} · najlepsza: ×{profile.progress.bestStreak}</small></div><div className="achievement-row">{Object.entries(ACHIEVEMENTS).map(([id, achievement]) => <span key={id} className={profile.progress.unlocked.includes(id as keyof typeof ACHIEVEMENTS) ? 'is-unlocked' : ''} title={achievement.detail}>{profile.progress.unlocked.includes(id as keyof typeof ACHIEVEMENTS) ? '★' : '☆'} {achievement.title}</span>)}</div></div>
    <NickEditor st={st} compact />
    <p className="os-note">Profil i osiągnięcia zapisują się na tym telefonie. Przy kolejnym połączeniu tego samego pada wracają automatycznie; na TV trafia wyłącznie bezpieczny podgląd.</p>
  </div>;
}
