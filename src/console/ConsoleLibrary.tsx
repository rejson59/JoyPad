import { JoyPadLogo } from '../components/JoyPadLogo';
import { RoomControls } from '../platform/RoomControls';
import { MomentsGallery } from '../platform/MomentsGallery';
import { WhatsNew } from '../platform/WhatsNew';
import { markWhatsNewSeen, shouldShowWhatsNew } from '../platform/whatsNewState';
import { padHost } from '../net/padHost';
import { GamePreview } from './GamePreview';
import { hasHistory, lastGame } from './history';
import { useViewport } from './useViewport';
import { useEffect, useState, type CSSProperties } from 'react';
import { Clapperboard, ArrowRight, Plus, Settings2, Volume2, VolumeX } from 'lucide-react';
import { GAMES, localizeGame, type GameId } from '../arcade/catalog';
import { usePadHost } from '../pad/PadHostPanel';
import { Sheet } from './Sheet';
import { ConsoleSettings } from './Settings';
import { systemSound } from './sound';
import { useMenuMusic } from '../lib/useMenuMusic';
import { SessionPanel } from './SessionPanel';
import { playableIndices } from './navigation';
import { useT } from '../platform/i18n';

export function ConsoleLibrary({ focus, onFocus, onOpen, onConnections, onLab, onOverlayChange, suspended = false }: {
  suspended?: boolean;
  focus: number; onFocus: (index: number) => void; onOpen: (id: GameId) => void;
  onConnections: () => void; onLab: () => void; onOverlayChange: (open: boolean) => void;
}) {
  const state = usePadHost();
  const viewport = useViewport();
  const { language, t } = useT();
  const sourceGame = GAMES[focus];
  const game = localizeGame(sourceGame, language);
  const [panel, setPanel] = useState<'settings' | 'soon' | 'help' | 'room' | 'gallery' | 'news' | null>(() => shouldShowWhatsNew() ? 'news' : null);
  const [music, toggleMusic] = useMenuMusic();
  const [previewControls, setPreviewControls] = useState<HTMLSpanElement | null>(null);
  const ready = state.status === 'ready' || state.relay === 'online';
  useEffect(() => { onOverlayChange(panel !== null); return () => onOverlayChange(false); }, [panel, onOverlayChange]);
  useEffect(() => {
    const tile = document.querySelector<HTMLElement>(`[data-game-index="${focus}"]`);
    const rail = tile?.parentElement;
    if (tile && rail) rail.scrollTo({ left: tile.offsetLeft - (rail.clientWidth - tile.offsetWidth) / 2, behavior: 'instant' });
  }, [focus, viewport.width]);
  const panelTitle = panel === 'room' ? (language === 'en' ? 'Room controls' : 'Centrum pokoju.')
    : panel === 'settings' ? (language === 'en' ? 'Make it yours.' : 'Po swojemu.')
      : panel === 'soon' ? t('library.soonTitle')
        : panel === 'gallery' ? `${t('common.gallery')}.` : t('library.helpTitle');
  const closeWhatsNew = () => { markWhatsNewSeen(); setPanel(null); };

  return <div className="os-library" style={{ '--game-accent': game.accent } as CSSProperties}>
    <GamePreview key={game.id} game={game} suspended={suspended || panel !== null} controlsTarget={previewControls} />
    <header className="os-topbar">
      <a className="os-wordmark" href="#" aria-label={t('library.aria')}><JoyPadLogo />JoyPad<span>.</span><small>PLAY SYSTEM</small></a>
      <nav aria-label={t('library.system')}>
        <span ref={setPreviewControls} className="os-preview-controls" />
        <span className="os-network"><i className={ready ? 'is-ready' : ''} />{state.room.locked ? t('library.roomLocked') : ready ? t('library.roomReady') : t('library.roomConnecting')}</span>
        <button className="os-icon" aria-label={music ? t('library.musicOff') : t('library.musicOn')} aria-pressed={music} onClick={() => toggleMusic(!music)}>{music ? <Volume2 size={19} /> : <VolumeX size={19} />}</button>
        <button className="os-icon" onClick={() => setPanel('gallery')} aria-label={t('common.gallery')}><Clapperboard size={19} /></button>
        <button className="os-icon" onClick={() => setPanel('settings')} aria-label={t('library.settings')}><Settings2 size={20} /></button>
        <button className="os-room-button" onClick={() => setPanel('room')}>{t('library.room')}<span>{state.pads.length}/4</span></button>
        <button className="os-add" onClick={onConnections}><Plus size={18} /><span>{t('library.addPlayer')}</span></button>
      </nav>
    </header>
    <main className="os-stage">
      <section className="os-feature" aria-labelledby="game-title">
        <div className="os-eyebrow"><span className="os-dash" /> {t('library.heading')} <span className="os-muted">/ {String(playableIndices.indexOf(focus) + 1).padStart(2, '0')}</span></div>
        <div key={game.id} className="os-game-copy">
          <div className="os-genre">{game.genre} <span>•</span> {game.players}</div>
          <h1 id="game-title" style={{ viewTransitionName: 'game-title' }}>{game.title}</h1>
          <p>{game.description}</p>
          <button className="os-play" onClick={() => onOpen(game.id)}><span className="os-play-symbol">▶</span>{t('library.launch')}<ArrowRight size={20} /></button>
          {hasHistory() && game.id === lastGame() && <button className="os-again" onClick={() => onOpen(game.id)}>{t('library.playAgain')} <span>{t('library.lastSettings')}</span></button>}
          <div className="os-feature-tags">{game.features.map(f => <span key={f}>{f}</span>)}</div>
        </div>
      </section>
      <SessionPanel onConnections={onConnections} onLab={onLab} onOpen={onOpen} />
    </main>
    <section className="os-collection" aria-label={t('library.availableGames')}>
      <div className="os-collection-heading"><h2>{t('library.chooseWorld')}</h2><button onClick={() => setPanel('soon')}>{t('library.upcoming')} <span>{GAMES.filter(g => g.wip).length}</span><ArrowRight size={14} /></button></div>
      <div className="os-game-rail">{playableIndices.map(i => {
        const g = localizeGame(GAMES[i], language);
        return <button key={g.id} data-game-index={i} className={`os-game-tile ${i === focus ? 'is-selected' : ''}`} aria-pressed={i === focus} onFocus={() => onFocus(i)} onClick={() => { if (i === focus) onOpen(g.id); else onFocus(i); }}>
          <img src={`${import.meta.env.BASE_URL}${g.cover}`} alt="" width="640" height="360" loading="lazy" decoding="async" />
          <div><span>{g.genre}</span><h3>{g.title}</h3></div><span className="os-tile-arrow"><ArrowRight size={19} /></span>
        </button>;
      })}</div>
    </section>
    <footer className="os-footer"><div><span><kbd>←</kbd><kbd>→</kbd> {t('library.choose')}</span><span><kbd>Enter</kbd> {t('library.start')}</span><span className="os-muted">{t('library.remoteHint')}</span></div><div className="flex items-center gap-4"><button onClick={() => setPanel('news')}>{t('library.whatsNew')}</button><button onClick={() => setPanel('help')}>{t('library.howToStart')}</button><span className="os-footer-brand">{t('library.version')}</span></div></footer>
    {panel && panel !== 'news' && <Sheet title={panelTitle} wide={panel === 'gallery'} onClose={() => { systemSound('back'); setPanel(null); }}>
      {panel === 'room' ? <RoomControls session={padHost.session()} onAction={action => padHost.manageRoom(action)} /> : panel === 'settings' ? <><ConsoleSettings /><button className="os-secondary" onClick={() => toggleMusic(!music)}>{music ? t('library.musicDisable') : t('library.musicEnable')} {t('library.libraryMusic')}</button></> : panel === 'soon' ? <><p className="os-note">{t('library.soonNote')}</p><div className="os-upcoming">{GAMES.filter(g => g.wip).map(g => { const localized = localizeGame(g, language); return <div key={g.id}><img src={`${import.meta.env.BASE_URL}${g.cover}`} alt="" loading="lazy" decoding="async" /><div><h3>{localized.title}</h3><span>{localized.genre} · {t('library.inDevelopment')}</span><p>{localized.description}</p></div></div>; })}</div></> : panel === 'gallery' ? <MomentsGallery /> : <ol className="os-help"><li><b>{t('library.helpScreenTitle')}</b><p>{t('library.helpScreen')}</p></li><li><b>{t('library.helpPhoneTitle')}</b><p>{t('library.helpPhone')}</p></li><li><b>{t('library.helpGameTitle')}</b><p>{t('library.helpGame')}</p></li></ol>}
    </Sheet>}
    <WhatsNew open={panel === 'news'} onClose={closeWhatsNew} />
  </div>;
}
