import { GAMES } from '../arcade/catalog';
import { padHost } from '../net/padHost';
import type { CSSProperties } from 'react';
import { ArrowRight, ArrowUpRight, Crown, Home, RotateCcw, Settings2, Trophy } from 'lucide-react';
import type { GameInfo } from '../arcade/catalog';
import { usePadHost } from '../pad/PadHostPanel';
import { CountUp } from '../components/motion';
export interface ResultPlayer { slot: number; name: string; color: string; score: number; detail: string; isBot?: boolean }
export function GameResults({ info, title, subtitle, players, winnerSlot, allWon = false, record, scoreLabel = 'WYNIK', onRestart, onSettings, onExit, onMenu }: {
  info: GameInfo; title: string; subtitle: string; players: ResultPlayer[]; winnerSlot: number | null; allWon?: boolean; record?: number; scoreLabel?: string;
  onRestart: () => void; onSettings: () => void; onExit: () => void; onMenu?: () => void;
}) {
  const host = usePadHost();
  const rematch = host.pads.filter(p => p.rematch);
  const winner = players.find(player => player.slot === winnerSlot);
  return <div className="cine-results" style={{ '--result-color': winner?.color || 'var(--os-accent)' } as CSSProperties}>
    <div className="cine-results-art" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}${info.cover}`} alt="" /></div>
    <header className="cine-result-header"><span className="os-wordmark">JoyPad<span>.</span></span><span>{info.title} <i /> KONIEC RUNDY</span><button className="cine-back" onClick={onExit}><Home size={16} /> Biblioteka</button></header>
    <main className="cine-results-main"><section className="cine-result-moment">
      <span className="os-eyebrow">{allWon ? 'WSPÓLNA WYGRANA' : winner ? 'TEN MOMENT NALEŻY DO CIEBIE' : 'KAŻDA RUNDA TO NOWA HISTORIA'}</span>
      <div className="cine-result-emblem" aria-hidden="true"><span /><span /><Trophy size={54} strokeWidth={1} /><small>{allWon ? 'TEAM' : winner ? 'WINNER' : 'ROUND'}</small></div>
      <span className="cine-result-label">{allWon ? 'DRUŻYNA WYGRYWA' : winner ? 'ZWYCIĘSTWO' : 'PODSUMOWANIE'}</span>
      <h1>{title}</h1><p>{subtitle}</p>
      {(winner || allWon) && <div className="cine-winner-spotlight"><Crown size={18} aria-hidden="true" /><span>{allWon ? 'Cała drużyna' : winner?.name}<small>{allWon ? 'Wspólny cel osiągnięty' : `${scoreLabel}: ${winner?.score}`}</small></span></div>}
      {record !== undefined && <div className="cine-record"><Trophy size={16} /><span>LOKALNY REKORD</span><CountUp value={record} duration={950} /></div>}
    </section><section className="cine-result-board" aria-label="Wyniki rundy"><div className="cine-board-heading"><div><span className="os-eyebrow">PO OSTATNIM RUCHU</span><h2>Wyniki rundy.</h2></div><span>{String(players.length).padStart(2, '0')}<small>GRACZY</small></span></div>
      <div className="cine-score-labels"><span>GRACZ / KLASYFIKACJA</span><span>{scoreLabel}</span></div>
      <ol className="cine-ranking">{players.map((player, index) => <li key={player.slot} className={allWon || player.slot === winnerSlot ? 'is-winner' : ''} style={{ '--player-color': player.color, '--row-delay': `${index * 65}ms` } as CSSProperties}>
        <span className="cine-rank">{String(index + 1).padStart(2, '0')}</span><span className="cine-player-mark">{player.slot === winnerSlot || allWon ? <Crown size={19} /> : player.name.slice(0, 1).toUpperCase()}</span><div className="cine-score-name"><b>{player.name}{player.isBot && <small>BOT</small>}</b><p>{player.detail}</p></div><strong><CountUp value={player.score} duration={750 + index * 65} /></strong>
      </li>)}</ol>
      <details className="cine-personal-stats"><summary>Wasze liczby · każdy wynik ma znaczenie</summary><div>{players.map(p => <article key={p.slot}><b>{p.name}</b><strong>{scoreLabel}: {p.score}</strong><p>{p.detail}</p></article>)}</div></details>
      {host.pads.some(p => p.suggestedGame) && <section className="cine-proposals" aria-label="Propozycje graczy"><h3>Ekipa proponuje</h3>{GAMES.filter(g => !g.wip && g.id !== info.id).map(g => { const votes = host.pads.filter(p => p.suggestedGame === g.id); return votes.length > 0 && <button key={g.id} onClick={() => padHost.onGameChoice?.(GAMES.indexOf(g))}><span>Wybierz: {g.title}<small>{votes.map(p => p.nick).join(', ')}</small></span><ArrowRight size={18} /></button>; })}<p>Zatwierdzenie otwiera przygotowanie, nie uruchamia rundy.</p></section>}
      <div className="cine-result-actions">{host.pads.length > 0 && <p className="cine-rematch-status" role="status">{rematch.length}/{host.pads.length} chce rewanżu{rematch.length > 0 ? ` · ${rematch.map(p => p.nick).join(', ')}` : ' · Zgłoście się na telefonach'}</p>}<button className="cine-start" onClick={onRestart}><span>Rewanż<small>Te same ustawienia. Nowa szansa.</small></span><RotateCcw size={22} /></button><button className="cine-change-game" onClick={onExit}><span>Zmień grę<small>Wróć do biblioteki</small></span><ArrowRight size={22} /></button><button className="cine-result-secondary" onClick={onSettings}><Settings2 size={17} /><span>Zmień ustawienia</span><ArrowUpRight size={17} /></button>{onMenu && <button className="cine-result-secondary" onClick={onMenu}><Home size={17} /><span>Menu bitwy</span><ArrowRight size={17} /></button>}</div>
    </section></main><footer className="cine-result-footer"><span>WSPÓLNY EKRAN. WSPÓLNE WSPOMNIENIA.</span><button onClick={onExit}>Wybierz kolejny świat <ArrowRight size={15} /></button></footer>
  </div>;
}
