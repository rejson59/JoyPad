import { PlayerAvatar } from './PlayerAvatar';
import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { ACHIEVEMENTS, AVATARS, THEMES, loadProfile, type PlayerProfile } from './profile';
import { padClient, type PadClientState } from '../net/padClient';
import { GAMES, localizeGame } from '../arcade/catalog';
import { NickEditor } from '../pad/NickEditor';
import { useT } from './i18n';

const achievementEnglish: Record<keyof typeof ACHIEVEMENTS, { title: string; detail: string }> = {
  firstWin: { title: 'First win', detail: 'Win your first round.' },
  fiveRounds: { title: 'Regular player', detail: 'Play five rounds.' },
  winStreak: { title: 'Win streak ×3', detail: 'Win three rounds in a row.' },
  snakeBeta: { title: 'Snake tamer', detail: 'Win a Snake Vortex round.' },
};
const avatarEnglish: Record<keyof typeof AVATARS, string> = { smile: 'Smile', spark: 'Spark', ghost: 'Ghost', cat: 'Cat', rocket: 'Rocket', alien: 'Robot' };

export function GameSuggestions({ st }: { st: PadClientState }) {
  const selected = st.roster.find(p => p.slot === st.slot)?.suggestedGame;
  const { language } = useT();
  const en = language === 'en';
  // v1.8: antyspam hosta — telefon pokazuje odliczanie zamiast milczącego braku reakcji.
  const [now, setNow] = useState(() => Date.now());
  const limited = st.rateLimitedUntil > now;
  useEffect(() => {
    setNow(Date.now());
    if (st.rateLimitedUntil <= Date.now()) return;
    const iv = window.setInterval(() => setNow(Date.now()), 400);
    return () => window.clearInterval(iv);
  }, [st.rateLimitedUntil]);
  const wait = Math.max(1, Math.ceil((st.rateLimitedUntil - now) / 1000));
  const hint = st.room?.suggestions === false
    ? (en ? 'The admin paused suggestions.' : 'Administrator wstrzymał propozycje.')
    : limited
      ? (en ? `Easy there — next suggestion in ${wait} s.` : `Zwolnij trochę — kolejna propozycja za ${wait} s.`)
      : (en ? 'Suggest a game. The admin makes the final choice.' : 'Zaproponuj tytuł. Ostateczny wybór należy do admina.');
  return <section className="lounge-suggestions" aria-label={en ? 'Game suggestions' : 'Propozycje gier'}><div className="lounge-heading"><span className="os-eyebrow">{en ? 'CREW VOTE' : 'GŁOS EKIPY'}</span><h2>{en ? 'What should we play?' : 'Co gramy?'}</h2><p>{hint}</p></div><div>{GAMES.filter(g => !g.wip && g.id !== st.game).map(g => {
    const votes = st.roster.filter(p => p.suggestedGame === g.id);
    const game = localizeGame(g, language);
    const voteLabel = en ? `${votes.length} ${votes.length === 1 ? 'vote' : 'votes'}` : `${votes.length} głos${votes.length === 1 ? '' : 'y'}`;
    return <button key={g.id} disabled={st.room?.suggestions === false || limited} aria-pressed={selected === g.id} onClick={() => padClient.suggestGame(selected === g.id ? null : g.id)}><img src={`${import.meta.env.BASE_URL}${game.cover}`} alt="" loading="lazy" decoding="async" /><span><b>{game.title}</b><small>{votes.length ? `${voteLabel} · ${votes.map(p => p.nick).join(', ')}` : game.genre}</small></span>{selected === g.id ? <Check size={18} /> : <i>+</i>}</button>;
  })}</div></section>;
}
export function PlayerLounge({ st, onProfile }: { st: PadClientState; onProfile: (p: PlayerProfile) => void }) {
  const [profile, setProfile] = useState(loadProfile);
  const { language } = useT();
  const en = language === 'en';
  useEffect(() => { const receive = (event: Event) => { const next = (event as CustomEvent<PlayerProfile>).detail; if (next) setProfile(next); }; window.addEventListener('joypad-profile-updated', receive); return () => window.removeEventListener('joypad-profile-updated', receive); }, []);
  const update = (next: PlayerProfile) => { setProfile(next); padClient.setProfile(next); onProfile(next); };
  const wins = profile.progress.wins;
  const rounds = profile.progress.gamesPlayed;
  const unlocks = profile.progress.unlocked;
  return <div className="player-lounge" style={{ '--lounge-accent': THEMES[profile.theme] } as CSSProperties}>
    <div className="lounge-pass"><span className="profile-avatar"><PlayerAvatar avatar={profile.avatar} size={36} /></span><div><span className="os-eyebrow">{en ? 'YOUR PLAYER PASS' : 'TWÓJ PLAYER PASS'}</span><h3>{st.nick || st.name}</h3><p>{en ? `Controller ${String(st.slot + 1).padStart(2, '0')} · Ready for a good evening` : `Pad ${String(st.slot + 1).padStart(2, '0')} · Gotowy na dobry wieczór`}</p></div><Sparkles size={19} /></div>
    <fieldset><legend>{en ? 'Choose your avatar' : 'Wybierz swoją buźkę'}</legend><div className="avatar-choices">{Object.entries(AVATARS).map(([id, face]) => <button key={id} aria-label={`${en ? 'Avatar' : 'Awatar'}: ${en ? avatarEnglish[id as keyof typeof AVATARS] : face}`} aria-pressed={profile.avatar === id} onClick={() => update({ ...profile, avatar: id as PlayerProfile['avatar'] })}><PlayerAvatar avatar={id as PlayerProfile['avatar']} /></button>)}</div></fieldset>
    <fieldset><legend>{en ? 'Your lounge color' : 'Kolor Twojej poczekalni'}</legend><div className="theme-choices">{Object.entries(THEMES).map(([id, color]) => <button key={id} style={{ '--swatch': color } as CSSProperties} aria-label={`${en ? 'Theme' : 'Motyw'}: ${id}`} aria-pressed={profile.theme === id} onClick={() => update({ ...profile, theme: id as PlayerProfile['theme'] })}>{profile.theme === id && <Check size={17} />}</button>)}</div><p>{en ? 'Your in-game slot color stays the same so the crew can recognize you.' : 'Kolor slotu w grze pozostaje bez zmian, aby ekipa Cię rozpoznawała.'}</p></fieldset>
    <div className="profile-progress"><div><span className="os-eyebrow">{en ? 'LOCAL ACHIEVEMENTS' : 'LOKALNE OSIĄGNIĘCIA'}</span><strong>{en ? `${wins} wins · ${rounds} rounds` : `${wins} wygranych · ${rounds} rund`}</strong><small>{en ? `Streak: ×${profile.progress.streak} · best: ×${profile.progress.bestStreak}` : `Seria: ×${profile.progress.streak} · najlepsza: ×${profile.progress.bestStreak}`}</small></div><div className="achievement-row">{Object.entries(ACHIEVEMENTS).map(([id, achievement]) => { const copy = en ? achievementEnglish[id as keyof typeof ACHIEVEMENTS] : achievement; return <span key={id} className={unlocks.includes(id as keyof typeof ACHIEVEMENTS) ? 'is-unlocked' : ''} title={copy.detail}>{unlocks.includes(id as keyof typeof ACHIEVEMENTS) ? '★' : '☆'} {copy.title}</span>; })}</div></div>
    <NickEditor st={st} compact />
    <p className="os-note">{en ? 'Your profile and achievements stay on this phone. They return automatically when you reconnect; the TV only receives a safe preview.' : 'Profil i osiągnięcia zapisują się na tym telefonie. Przy kolejnym połączeniu tego samego pada wracają automatycznie; na TV trafia wyłącznie bezpieczny podgląd.'}</p>
  </div>;
}
