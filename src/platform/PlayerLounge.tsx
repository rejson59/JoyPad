import { PlayerAvatar } from './PlayerAvatar';
import { useEffect, useState, type CSSProperties } from 'react';
import { Check, Sparkles } from 'lucide-react';
import { ACHIEVEMENTS, AVATARS, THEMES, loadProfile, type PlayerProfile } from './profile';
import { padClient, type PadClientState } from '../net/padClient';
import { haptic } from '../pad/haptics';
import type { SuggestRejection } from '../net/antiSpam';
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

/** Sygnatury odmowy w języku gracza. Jedno zdanie, bez moralizowania: telefon nie
 *  jest od karania, jest od informowania. `{n}` dostaje liczbę sekund od telewizora. */
const SUGGEST_NOTES: Record<SuggestRejection, { pl: string; en: string }> = {
  cooldown: { pl: 'Za wcześnie na kolejną propozycję — odczekaj {n} s.', en: 'Too soon for another suggestion — wait {n} s.' },
  duplicate: { pl: 'Tę grę już zaproponowałeś. Wróć do niej za {n} s.', en: 'You already proposed that game. Try again in {n} s.' },
  limit: { pl: 'Za dużo propozycji na minutę. Spróbuj za {n} s.', en: 'Too many suggestions this minute. Try again in {n} s.' },
  muted: { pl: 'Twoje propozycje są wyciszone.', en: 'Your suggestions are muted.' },
};

/**
 * Głos ekipy. Ostatnie słowo ma telewizor (`net/antiSpam`), ale pad nie zgaduje:
 * dostaje `suggestAck` i pokazuje dokładnie tę linię, która przed chwilą go zatrzymała —
 * w tym samym miejscu, w którym i tak stoi podpowiedź, więc blok nie rasta.
 */
export function GameSuggestions({ st }: { st: PadClientState }) {
  const me = st.roster.find(p => p.slot === st.slot);
  const selected = me?.suggestedGame;
  const muted = !!me?.muted;
  const { language } = useT();
  const en = language === 'en';
  const note = st.suggestNote;
  // Odmowa schodzi sama, ale sekundy liczy efekt, nie render: inaczej ten sam ekran
  // mógłby pokazać inną liczbę przy każdym odświeżeniu (React wymaga czystego renderu).
  const [left, setLeft] = useState(0);
  useEffect(() => { if (note) haptic([18, 26, 18]); }, [note]);
  useEffect(() => {
    if (!note) { setLeft(0); return; }
    let timer = 0;
    const tick = () => {
      const rest = Math.max(0, Math.ceil((note.retryInMs - (Date.now() - note.at)) / 1000));
      setLeft(rest);
      if (rest <= 0) window.clearInterval(timer);
    };
    tick();
    timer = window.setInterval(tick, 1_000);
    return () => window.clearInterval(timer);
  }, [note]);
  const blocked = st.room?.suggestions === false;
  const status = muted
    ? (en
      ? `Your proposals are muted${left > 0 ? ` (for ${left} s)` : ''}. The admin can lift it in the room panel.`
      : `Masz wyciszone propozycje${left > 0 ? ` (jeszcze ${left} s)` : ''}. Administrator zdjąć kłódkę może w panelu pokoju.`)
    : note && left > 0
      ? SUGGEST_NOTES[note.verdict][en ? 'en' : 'pl'].replace('{n}', String(left))
      : blocked
        ? (en ? 'The admin paused suggestions.' : 'Administrator wstrzymał propozycje.')
        : (en ? 'Suggest a game. The admin makes the final choice.' : 'Zaproponuj tytuł. Ostateczny wybór należy do admina.');
  return <section className="lounge-suggestions" aria-label={en ? 'Game suggestions' : 'Propozycje gier'} aria-describedby="lounge-vote-status"><div className="lounge-heading"><span className="os-eyebrow">{en ? 'CREW VOTE' : 'GŁOS EKIPY'}</span><h2>{en ? 'What should we play?' : 'Co gramy?'}</h2><p id="lounge-vote-status" className={muted || (note && left > 0) ? 'lounge-note' : undefined}>{status}</p></div><div>{GAMES.filter(g => !g.wip && g.id !== st.game).map(g => {
    const votes = st.roster.filter(p => p.suggestedGame === g.id);
    const game = localizeGame(g, language);
    const voteLabel = en ? `${votes.length} ${votes.length === 1 ? 'vote' : 'votes'}` : `${votes.length} głos${votes.length === 1 ? '' : 'y'}`;
    return <button key={g.id} disabled={blocked || muted} aria-pressed={selected === g.id} onClick={() => padClient.suggestGame(selected === g.id ? null : g.id)}><img src={`${import.meta.env.BASE_URL}${game.cover}`} alt="" loading="lazy" decoding="async" /><span><b>{game.title}</b><small>{votes.length ? `${voteLabel} · ${votes.map(p => p.nick).join(', ')}` : game.genre}</small></span>{selected === g.id ? <Check size={18} /> : <i>+</i>}</button>;
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
