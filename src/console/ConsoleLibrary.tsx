import { GamePreview } from './GamePreview';
import { hasHistory, lastGame } from './history';
import { useViewport } from './useViewport';
import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowRight, Gamepad2, Plus, Settings2, Smartphone, Volume2, VolumeX, Wifi, Zap } from 'lucide-react';
import { GAMES, type GameId } from '../arcade/catalog';
import { usePadHost } from '../pad/PadHostPanel';
import { PLAYER_DEFS } from '../game/types';
import { padUrlFor } from '../net/protocol';
import { QrFrame } from '../components/QrFrame';
import { Sheet } from './Sheet';
import { ConsoleSettings } from './Settings';
import { systemSound } from './sound';
import { useMenuMusic } from '../lib/useMenuMusic';

import { sessionSummary } from './sessionSummary';
import { playableIndices } from './navigation';
export function ConsoleLibrary({ focus, onFocus, onOpen, onConnections, onLab, onOverlayChange, suspended = false }: {
  suspended?: boolean;
  focus: number; onFocus: (index: number) => void; onOpen: (id: GameId) => void;
  onConnections: () => void; onLab: () => void; onOverlayChange: (open: boolean) => void;
}) {
  const state = usePadHost();
  const viewport = useViewport();
  const game = GAMES[focus];
  const [panel, setPanel] = useState<'settings' | 'soon' | 'help' | null>(null);
  const [music, toggleMusic] = useMenuMusic();
  const [qr, setQr] = useState('');
  const [previewControls, setPreviewControls] = useState<HTMLSpanElement | null>(null);
  const url = state.code ? padUrlFor(state.code) : '';
  const ready = state.status === 'ready' || state.relay === 'online';
  const session = sessionSummary(state.pads.length, ready);
  useEffect(() => { onOverlayChange(panel !== null); return () => onOverlayChange(false); }, [panel, onOverlayChange]);
  useEffect(() => {
    let active = true;
    setQr('');
    if (url && ready) void import('qrcode').then(({ default: QR }) => QR.toDataURL(url, { width: 256, margin: 2 })).then(src => { if (active) setQr(src); }).catch(() => {});
    return () => { active = false; };
  }, [url, ready]);
  useEffect(() => {
    const tile = document.querySelector<HTMLElement>(`[data-game-index="${focus}"]`);
    const rail = tile?.parentElement;
    if (tile && rail) rail.scrollTo({ left: tile.offsetLeft - (rail.clientWidth - tile.offsetWidth) / 2, behavior: 'instant' });
  }, [focus, viewport.width]);
  return <div className="os-library" style={{ '--game-accent': game.accent } as CSSProperties}>
    <GamePreview key={game.id} game={game} suspended={suspended || panel !== null} controlsTarget={previewControls} />
    <header className="os-topbar">
      <a className="os-wordmark" href="#" aria-label="JoyPad — biblioteka">JoyPad<span>.</span><small>PLAY SYSTEM</small></a>
      <nav aria-label="System konsoli">
        <span ref={setPreviewControls} className="os-preview-controls" />
        <span className="os-network"><i className={ready ? 'is-ready' : ''} />{ready ? 'Pokój gotowy' : 'Łączenie pokoju'}</span>
        <button className="os-icon" aria-label={music ? 'Wyłącz muzykę menu' : 'Włącz muzykę menu'} aria-pressed={music} onClick={() => toggleMusic(!music)}>{music ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
        <button className="os-icon" onClick={() => setPanel('settings')} aria-label="Ustawienia systemu"><Settings2 size={20} /></button>
        <button className="os-add" onClick={onConnections}><Plus size={18} /><span>Dodaj gracza</span></button>
      </nav>
    </header>
    <main className="os-stage">
      <section className="os-feature" aria-labelledby="game-title">
        <div className="os-eyebrow"><span className="os-dash" /> TWOJA BIBLIOTEKA <span className="os-muted">/ {String(playableIndices.indexOf(focus) + 1).padStart(2, '0')}</span></div>
        <div key={game.id} className="os-game-copy">
          <div className="os-genre">{game.genre} <span>•</span> {game.players}</div>
          <h1 id="game-title" style={{ viewTransitionName: 'game-title' }}>{game.title}</h1>
          <p>{game.description}</p>
          <button className="os-play" onClick={() => onOpen(game.id)}><span className="os-play-symbol">▶</span>Uruchom grę<ArrowRight size={20} /></button>
          {hasHistory() && game.id === lastGame() && <button className="os-again" onClick={() => onOpen(game.id)}>Zagraj ponownie <span>Ostatnie ustawienia · nowa runda</span></button>}
          <div className="os-feature-tags">{game.features.map(f => <span key={f}>{f}</span>)}</div>
        </div>
      </section>
      <aside className={`os-session ${session.count ? 'has-crew' : ''}`} aria-label="Twoja sesja">
        <div className="os-session-heading"><span className="os-eyebrow">WSPÓLNY EKRAN</span><Wifi size={15} /></div>
        <h2>{session.title}</h2>
        <p className="os-session-status" role="status">{session.status}</p><p>{session.count ? `Teraz: wybierz grę i uruchom przygotowanie.` : session.pairing}</p>
        {!session.count && ready && <div className="os-pairing"><QrFrame src={qr} size={136} /><div><span>KOD POKOJU</span><strong>{state.code || '·····'}</strong><a href="#pad" target="_blank" rel="noopener noreferrer"><Smartphone size={14} /> Otwórz pada</a></div></div>}
        <div className="os-roster">{PLAYER_DEFS.map((p, slot) => {
          const pad = state.pads.find(p => p.slot === slot);
          return <div key={slot} className={`os-player ${pad ? 'is-connected' : ''}`} style={{ '--player-color': p.color } as CSSProperties}><span><Gamepad2 size={18} /></span><div><b>{pad?.nick || `Miejsce ${slot + 1}`}</b><small>{pad ? 'Połączono' : 'Czeka na gracza'}</small></div>{pad && <i />}</div>;
        })}</div>
        <button className="os-session-invite" onClick={onConnections}><Plus size={15} />{session.invite}<ArrowRight size={15} /></button>
        <button className="os-lab-link" onClick={onLab}><Zap size={16} /><span>Sprawdź pad · ruch i akcja</span><ArrowRight size={16} /></button>
        {state.error && <details className="os-connection-detail"><summary>Problem z połączeniem · szczegóły</summary><p className="os-error">{state.error}</p></details>}
      </aside>
    </main>
    <section className="os-collection" aria-label="Dostępne gry">
      <div className="os-collection-heading"><h2>W co dziś gramy?</h2><button onClick={() => setPanel('soon')}>Wkrótce <span>{GAMES.filter(g => g.wip).length}</span><ArrowRight size={14} /></button></div>
      <div className="os-game-rail">{playableIndices.map(i => {
        const g = GAMES[i];
        return <button key={g.id} data-game-index={i} className={`os-game-tile ${i === focus ? 'is-selected' : ''}`} aria-pressed={i === focus} onFocus={() => onFocus(i)} onClick={() => { if (i === focus) onOpen(g.id); else onFocus(i); }}>
          <img src={`${import.meta.env.BASE_URL}${g.cover}`} alt="" width="640" height="360" />
          <div><span>{g.genre}</span><h3>{g.title}</h3></div><span className="os-tile-arrow"><ArrowRight size={19} /></span>
        </button>;
      })}</div>
    </section>
    <footer className="os-footer"><div><span><kbd>←</kbd><kbd>→</kbd> Wybierz</span><span><kbd>Enter</kbd> Uruchom</span><span className="os-muted">Pilot · klawiatura · gamepad</span></div><button onClick={() => setPanel('help')}>Jak zacząć?</button><span className="os-footer-brand">JOYPAD OS <i /> 01</span></footer>
    {panel && <Sheet title={panel === 'settings' ? 'Po swojemu.' : panel === 'soon' ? 'Kolejne światy.' : 'Usiądź. Połącz. Graj.'} onClose={() => { systemSound('back'); setPanel(null); }}>
      {panel === 'settings' ? <><ConsoleSettings /><button className="os-secondary" onClick={() => toggleMusic(!music)}>{music ? 'Wyłącz' : 'Włącz'} muzykę w bibliotece</button></> : panel === 'soon' ? <><p className="os-note">Te gry są w przebudowie. Pojawią się w bibliotece, kiedy będą gotowe — bez odliczania i obietnic dat.</p><div className="os-upcoming">{GAMES.filter(g => g.wip).map(g => <div key={g.id}><img src={`${import.meta.env.BASE_URL}${g.cover}`} alt="" /><div><h3>{g.title}</h3><span>{g.genre} · W przygotowaniu</span></div></div>)}</div></> : <ol className="os-help"><li><b>Duży ekran</b><p>Otwórz JoyPad na komputerze lub telewizorze. Bez telefonu możesz grać na klawiaturze.</p></li><li><b>Twój telefon, Twój pad</b><p>Zeskanuj QR. Pierwszy połączony telefon steruje menu. Kolejni gracze dołączają bez konta.</p></li><li><b>Wybierz swój świat</b><p>Strzałki zmieniają grę, OK ją otwiera. W grze telefon automatycznie zmienia się w kontroler. Fizyczny gamepad obsługuje bibliotekę: krzyżak lub gałka, A i B.</p></li></ol>}
    </Sheet>}
  </div>;
}
