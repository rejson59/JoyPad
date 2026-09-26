import { ReadyStatus } from './ReadyStatus';
import type { CSSProperties, ReactNode } from 'react';
import { ArrowLeft, ArrowRight, ArrowUpRight, Gamepad2, Keyboard, Plus, Radio, Volume2, VolumeX } from 'lucide-react';
import type { GameInfo } from '../arcade/catalog';
import { PLAYER_DEFS } from '../game/types';
import { sessionSummary } from './sessionSummary';
import { usePadHost } from '../pad/PadHostPanel';

export function GameSetup({ info, music, onMusic, onExit, onStart, onPads, hint, win, children, startLabel = 'Rozpocznij grę', navigationHint }: {
  info: GameInfo; music: boolean; onMusic: () => void; onExit: () => void; onStart: () => void; onPads: () => void; hint: string; win: string; children: ReactNode; startLabel?: string; navigationHint?: string;
}) {
  const host = usePadHost();
  const session = sessionSummary(host.pads.length, host.status === 'ready' || host.relay === 'online');
  return <div className={`cine-game cine-game-${info.id}`} style={{ '--game-accent': info.accent } as CSSProperties}>
    <div className="cine-game-art" aria-hidden="true"><img src={`${import.meta.env.BASE_URL}${info.cover}`} alt="" style={{ viewTransitionName: 'game-cover' }} /><span /></div>
    <header className="cine-game-topbar"><button className="cine-back" onClick={onExit}><ArrowLeft size={16} /> JOYPAD / GRY</button><span className="cine-topbar-chapter">{info.number}<i />{info.eyebrow}</span><div><button className="os-icon" onClick={onMusic} aria-label={music ? 'Wyłącz muzykę menu' : 'Włącz muzykę menu'}>{music ? <Volume2 size={18} /> : <VolumeX size={18} />}</button><button className="cine-back" onClick={onPads}><Gamepad2 size={18} />{host.pads.length}/4 <span className="cine-room-code">{host.code}</span></button></div></header>
    <main className="cine-game-main">
      <section className="cine-game-intro"><div className="cine-chapter"><span>{info.number}</span><div><i />PRZYGOTOWANIE DO GRY<small>{info.genre} / {info.players}</small></div></div>
        <h1 style={{ viewTransitionName: 'game-title' }}>{info.title}</h1><p>{info.description}</p>
        <div className="cine-game-features">{info.features.map(feature => <span key={feature}>{feature}</span>)}</div>
      </section>
      <section className="cine-launch-deck" aria-label="Przygotowanie rozgrywki">
        <div className="cine-deck-heading"><div><span className="os-eyebrow">WASZA NASTĘPNA RUNDA</span><h2>Ustawienia, skład, start.</h2></div><span className="cine-deck-serial">JP—{info.number} / PLAY</span></div>
        <div className="cine-deck-body"><div className="cine-configuration">{children}</div><aside className="cine-launch-side"><div className="cine-crew-title"><Radio size={15} /><span>Wasz skład</span><small role="status">{session.status}</small></div>
          <div className="cine-crew">{PLAYER_DEFS.map((player, slot) => { const pad = host.pads.find(p => p.slot === slot); const keyboard = !host.pads.length && slot === 0; return <div className={`cine-crew-member ${pad || keyboard ? 'is-present' : ''}`} key={slot} style={{ '--player-color': player.color } as CSSProperties}><span>{keyboard ? <Keyboard size={19} /> : <Gamepad2 size={19} />}</span><div><b>{pad?.nick || (keyboard ? 'Klawiatura' : 'Wolne miejsce')}</b><small>{pad ? (pad.ready ? 'GOTOWY ✓' : 'POŁĄCZONY') : keyboard ? 'GRACZ 01' : `SLOT 0${slot + 1}`}</small></div>{pad || keyboard ? <i /> : <span className="cine-crew-empty">—</span>}</div>; })}</div>
          <div className="cine-next-step"><span>NASTĘPNY KROK</span><p>{session.next}</p><ReadyStatus /></div>
          <button className="cine-invite" onClick={onPads}><Plus size={15} /> {session.invite} <ArrowUpRight size={15} /></button>
          <button className="cine-start" onClick={onStart}><span>{startLabel}<small>{session.count ? `${session.count} padów · przejdź do rundy` : 'Graj lokalnie · bez telefonu'}</small></span><span className="cine-start-arrow"><ArrowRight size={24} /></span></button>
        </aside></div>
        <details className="cine-rules"><summary><span>01 / INSTRUKCJA</span> Jak grać <Plus size={16} /></summary><div><p>{hint}</p><p><b>Cel:</b> {win}</p><p><b>Telefon:</b> {info.controls}</p></div></details>
      </section>
      <footer className="cine-game-footer"><span>{navigationHint || <><kbd>← →</kbd> Główna opcja <kbd>↑ ↓</kbd> Druga opcja <kbd>Enter</kbd> Start</>}</span><span>WSAD / strzałki + Q / Enter · P / Esc = pauza</span></footer>
    </main>
  </div>;
}
