import { Moments } from '../platform/Moments';
import type { Moment } from '../platform/momentRecorder';
import { JoyPadLogo } from '../components/JoyPadLogo';
import { GAMES, localizeGame } from '../arcade/catalog';
import { padHost } from '../net/padHost';
import type { CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, Crown, Home, RotateCcw, Settings2, Trophy } from 'lucide-react';
import type { GameInfo } from '../arcade/catalog';
import { usePadHost } from '../pad/PadHostPanel';
import { CountUp } from '../components/motion';
import { useT } from '../platform/i18n';

export interface ResultPlayer { slot: number; name: string; color: string; score: number; detail: string; isBot?: boolean }
export function GameResults({ replayNotice = '', moments = [], info, title, subtitle, players, winnerSlot, allWon = false, record, scoreLabel, onRestart, onSettings, onExit, onMenu }: {
  moments?: Moment[]; replayNotice?: string;
  info: GameInfo; title: string; subtitle: string; players: ResultPlayer[]; winnerSlot: number | null; allWon?: boolean; record?: number; scoreLabel?: string;
  onRestart: () => void; onSettings: () => void; onExit: () => void; onMenu?: () => void;
}) {
  const host = usePadHost();
  const { language, t } = useT();
  const en = language === 'en';
  const rematch = host.pads.filter(p => p.rematch);
  const winner = players.find(player => player.slot === winnerSlot);
  const label = scoreLabel || (en ? 'SCORE' : 'WYNIK');
  // v1.8: najlepszy Moment gra jako tło ekranu wyników — okładka schodzi na drugi plan.
  const bgReplay = moments.find(m => m.replay)?.replay ?? null;
  return <div className={`cine-results ${bgReplay ? 'has-replay-bg' : ''}`} style={{ '--result-color': winner?.color || 'var(--os-accent)' } as CSSProperties}>
    {bgReplay && <div className="cine-results-replay" aria-hidden="true"><video src={bgReplay.url} autoPlay muted loop playsInline /></div>}
    <div className="cine-results-art" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}${info.cover}`} alt="" /></div>
    <header className="cine-result-header"><span className="os-wordmark"><JoyPadLogo size={38} />JoyPad<span>.</span></span><span>{info.title} <i /> {t('results.roundEnd')}</span><button className="cine-back" onClick={onExit}><Home size={16} /> {t('results.library')}</button></header>
    <main className="cine-results-main"><section className="cine-result-moment">
      <span className="os-eyebrow">{allWon ? t('results.sharedWin') : winner ? t('results.yourMoment') : t('results.newStory')}</span>
      <div className="cine-result-emblem" aria-hidden="true"><span /><span /><Trophy size={54} strokeWidth={1} /><small>{allWon ? 'TEAM' : winner ? 'WINNER' : (en ? 'ROUND' : 'RUNDA')}</small></div>
      <span className="cine-result-label">{allWon ? t('results.teamWins') : winner ? t('results.victory') : t('results.summary')}</span>
      <h1>{title}</h1><p>{subtitle}</p>
      {(winner || allWon) && <div className="cine-winner-spotlight"><Crown size={18} aria-hidden="true" /><span>{allWon ? t('results.team') : winner?.name}<small>{allWon ? t('results.goalReached') : `${label}: ${winner?.score}`}</small></span></div>}
      {record !== undefined && <div className="cine-record"><Trophy size={16} /><span>{t('results.localRecord')}</span><CountUp value={record} duration={950} /></div>}
      <Moments notice={replayNotice} moments={moments} info={info} />
    </section><section className="cine-result-board" aria-label={en ? 'Round results' : 'Wyniki rundy'}><div className="cine-board-heading"><div><span className="os-eyebrow">{t('results.lastMove')}</span><h2>{t('results.roundScores')}</h2></div><span>{String(players.length).padStart(2, '0')}<small>{t('results.players')}</small></span></div>
      <div className="cine-score-labels"><span>{t('results.rank')}</span><span>{label}</span></div>
      <ol className="cine-ranking">{players.map((player, index) => <li key={player.slot} className={allWon || player.slot === winnerSlot ? 'is-winner' : ''} style={{ '--player-color': player.color, '--row-delay': `${index * 65}ms` } as CSSProperties}>
        <span className="cine-rank">{String(index + 1).padStart(2, '0')}</span><span className="cine-player-mark">{player.slot === winnerSlot || allWon ? <Crown size={19} /> : player.name.slice(0, 1).toUpperCase()}</span><div className="cine-score-name"><b>{player.name}{player.isBot && <small>BOT</small>}</b><p>{player.detail}</p></div><strong><CountUp value={player.score} duration={750 + index * 65} /></strong>
      </li>)}</ol>
      <details className="cine-personal-stats"><summary>{t('results.stats')}</summary><div>{players.map(p => <article key={p.slot}><b>{p.name}</b><strong>{label}: {p.score}</strong><p>{p.detail}</p></article>)}</div></details>
      {host.pads.some(p => p.suggestedGame) && <section className="cine-proposals" aria-label={en ? 'Player suggestions' : 'Propozycje graczy'}><h3>{t('results.proposals')}</h3>{GAMES.filter(g => !g.wip && g.id !== info.id).map(g => { const votes = host.pads.filter(p => p.suggestedGame === g.id); const localized = localizeGame(g, language); return votes.length > 0 && <button key={g.id} onClick={() => padHost.onGameChoice?.(GAMES.indexOf(g))}><span>{t('results.choose', { title: localized.title })}<small>{votes.map(p => p.nick).join(', ')}</small></span><ArrowRight size={18} /></button>; })}<p>{t('results.approval')}</p></section>}
      <div className="cine-result-actions">{host.pads.length > 0 && <p className="cine-rematch-status" role="status">{t('results.wantsRematch', { ready: rematch.length, total: host.pads.length })}{rematch.length > 0 ? ` · ${rematch.map(p => p.nick).join(', ')}` : ` · ${t('results.rematchPrompt')}`}</p>}<button className="cine-start" onClick={onRestart}><span>{t('results.rematch')}<small>{t('results.sameSettings')}</small></span><RotateCcw size={22} /></button><button className="cine-change-game" onClick={onExit}><span>{t('results.changeGame')}<small>{t('results.backLibrary')}</small></span><ArrowRight size={22} /></button><button className="cine-result-secondary" onClick={onSettings}><Settings2 size={17} /><span>{t('results.changeSettings')}</span><ArrowUpRight size={17} /></button>{onMenu && <button className="cine-result-secondary" onClick={onMenu}><Home size={17} /><span>{t('results.battleMenu')}</span><ArrowRight size={17} /></button>}</div>
    </section></main><footer className="cine-result-footer"><span>{en ? 'ONE SCREEN. ONE CREW. SHARED MEMORIES.' : 'WSPÓLNY EKRAN. WSPÓLNE WSPOMNIENIA.'}</span><button onClick={onExit}>{t('results.nextWorld')} <ArrowRight size={15} /></button></footer>
  </div>;
}
