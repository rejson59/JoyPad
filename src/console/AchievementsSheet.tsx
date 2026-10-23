import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import {
  ACHIEVEMENTS, ACHIEVEMENT_EVENT, progressFor, readState,
  type AchievementsState,
} from '../platform/achievements';
import { useT } from '../platform/i18n';

/**
 * Okno „Karta pilota i osiągnięcia": nagłówek z liczbami sesji i siatka trofeów.
 * Stan czytany z `platform/achievements`; po każdym odblokowaniu (zdarzenie
 * `joypad-achievement`) okno i kafelki biblioteki odświeżają się same.
 */
export function AchievementsSheet() {
  const { language, t } = useT();
  const [state, setState] = useState<AchievementsState>(() => readState());
  useEffect(() => {
    const refresh = () => setState(readState());
    window.addEventListener(ACHIEVEMENT_EVENT, refresh);
    return () => window.removeEventListener(ACHIEVEMENT_EVENT, refresh);
  }, []);

  const card = state.card;
  const unlockedCount = ACHIEVEMENTS.filter(def => state.unlocked[def.id] !== undefined).length;
  const winRate = card.rounds ? Math.round((card.wins / card.rounds) * 100) : 0;
  const stats: [string, string][] = [
    [t('achievements.rounds'), String(card.rounds)],
    [t('achievements.wins'), `${card.wins} · ${winRate}%`],
    [t('achievements.games'), `${card.playedGames.length}/6`],
    [t('achievements.best'), String(card.bestPickups)],
  ];

  return (
    <div className="trophy-sheet">
      <div className="trophy-pilot lg-sheen">
        <div>
          <span className="os-eyebrow">{t('achievements.pilot')}</span>
          <p>{t('achievements.hint')}</p>
        </div>
        <div className="trophy-pilot-stats">
          {stats.map(([label, value]) => <div key={label}><b>{value}</b><span>{label}</span></div>)}
        </div>
      </div>
      <p className="trophy-counter">{unlockedCount}/{ACHIEVEMENTS.length} · {t('achievements.unlocked')}</p>
      <div className="trophy-grid">
        {ACHIEVEMENTS.map(def => {
          const at = state.unlocked[def.id];
          const text = language === 'en' ? def.en : def.pl;
          const progress = progressFor(def.id, state);
          const Icon = def.icon;
          return (
            <div key={def.id} className={`trophy-card${at !== undefined ? ' is-unlocked' : ''}`}>
              <span className="trophy-icon">{at !== undefined ? <Icon size={18} /> : <Lock size={16} />}</span>
              <div>
                <b>{text.name}</b>
                <p>{text.desc}</p>
                {at !== undefined
                  ? <small>{t('achievements.unlocked')} · {new Date(at).toLocaleDateString(language === 'en' ? 'en-GB' : 'pl-PL')}</small>
                  : progress
                    ? <span className="trophy-meter" role="progressbar" aria-valuenow={progress.value} aria-valuemin={0} aria-valuemax={progress.goal}><i style={{ width: `${Math.round((progress.value / progress.goal) * 100)}%` }} /><em>{progress.value}/{progress.goal}</em></span>
                    : <small>{t('achievements.locked')}</small>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
