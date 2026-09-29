import { ReadyStatus } from './ReadyStatus';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Gamepad2, Keyboard, Plus, Radio, Volume2, VolumeX } from 'lucide-react';
import type { GameInfo } from '../arcade/catalog';
import { PLAYER_DEFS } from '../game/types';
import { sessionSummary } from './sessionSummary';
import { usePadHost } from '../pad/PadHostPanel';
import { useT } from '../platform/i18n';

export function GameSetup({ info, music, onMusic, onExit, onStart, onPads, hint, win, children, startLabel, navigationHint }: {
  info: GameInfo; music: boolean; onMusic: () => void; onExit: () => void; onStart: () => void; onPads: () => void; hint: string; win: string; children: ReactNode; startLabel?: string; navigationHint?: string;
}) {
  const host = usePadHost();
  const { language, t } = useT();
  const session = sessionSummary(host.pads.length, host.status === 'ready' || host.relay === 'online', language);
  const playerCount = host.pads.length;
  return <div className={`cine-game cine-game-${info.id}`} style={{ '--game-accent': info.accent } as CSSProperties}>
    <div className="cine-game-art" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}${info.cover}`} alt="" style={{ viewTransitionName: 'game-cover' }} /><span /></div>
    <header className="cine-game-topbar"><button className="cine-back" onClick={onExit}><ArrowLeft size={16} /> {t('setup.back')}</button><span className="cine-topbar-chapter">{info.number}<i />{info.eyebrow}</span><div><button className="os-icon" onClick={onMusic} aria-label={music ? t('library.musicOff') : t('library.musicOn')}>{music ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button className="cine-back" onClick={onPads}><Gamepad2 size={18} />{host.pads.length}/4 <span className="cine-room-code">{host.code}</span></button></div></header>
    <main className="cine-game-main">
      <section className="cine-game-intro"><div className="cine-chapter"><span>{info.number}</span><div><i />{t('setup.prepare')}<small>{info.genre} / {info.players}</small></div></div>
        <h1 style={{ viewTransitionName: 'game-title' }}>{info.title}</h1><p>{info.description}</p>
        <div className="cine-game-features">{info.features.map(feature => <span key={feature}>{feature}</span>)}</div>
      </section>
      <section className="cine-launch-deck" aria-label={t('setup.prepare')}>
        <div className="cine-deck-heading"><div><span className="os-eyebrow">{t('setup.nextRound')}</span><h2>{t('setup.settingsCrewStart')}</h2></div><span className="cine-deck-serial">JP—{info.number} / PLAY</span></div>
        <div className="cine-deck-body"><div className="cine-configuration">{children}</div><aside className="cine-launch-side"><div className="cine-crew-title"><Radio size={15} /><span>{t('setup.crew')}</span><small role="status">{session.status}</small></div>
          <div className="cine-crew">{PLAYER_DEFS.map((player, slot) => { const pad = host.pads.find(p => p.slot === slot); const keyboard = !host.pads.length && slot === 0; return <div className={`cine-crew-member ${pad || keyboard ? 'is-present' : ''}`} key={slot} style={{ '--player-color': player.color } as CSSProperties}><span>{keyboard ? <Keyboard size={19} /> : <Gamepad2 size={19} />}</span><div><b>{pad?.nick || (keyboard ? t('setup.keyboard') : t('setup.freeSlot'))}</b><small>{pad ? (pad.ready ? t('setup.ready') : t('setup.connected')) : keyboard ? t('setup.player', { n: '01' }) : t('setup.slot', { n: `0${slot + 1}` })}</small></div>{pad || keyboard ? <i /> : <span className="cine-crew-empty">—</span>}</div>; })}</div>
          <div className="cine-next-step"><span>{t('setup.nextStep')}</span><p>{session.next}</p><ReadyStatus /></div>
          <button className="cine-invite" onClick={onPads}><Plus size={15} /> {session.invite} <ArrowUpRight size={15} /></button>
          <button className="cine-start" onClick={onStart}><span>{startLabel || t('setup.start')}<small>{playerCount ? t('setup.padCount', { n: playerCount }) : t('setup.local')}</small></span><span className="cine-start-arrow"><ArrowRight size={24} /></span></button>
        </aside></div>
        <details className="cine-rules"><summary><span>01 / {t('setup.rules')}</span> {t('setup.howToPlay')} <Plus size={16} /></summary><div><p>{hint}</p><p><b>{t('setup.goal')}</b> {win}</p><p><b>{t('setup.phone')}</b> {info.controls}</p></div></details>
      </section>
      <footer className="cine-game-footer"><span>{navigationHint || <><kbd>← →</kbd> {t('setup.mainOption')} <kbd>↑ ↓</kbd> {t('setup.secondOption')} <kbd>Enter</kbd> {t('setup.start')}</>}</span><span>{t('setup.keyboardHelp')}</span></footer>
    </main>
  </div>;
}
