import { useEffect, useRef } from 'react';
import { Coffee } from 'lucide-react';
import { JoyPadLogo } from './JoyPadLogo';
import { SessionPanel } from '../console/SessionPanel';
import { StartupScene } from '../platform/startup/StartupScene';
import { WHATS_NEW_ITEMS } from '../platform/WhatsNew';
import { useLanguage } from '../platform/i18n';

/**
 * Ekran blokady dużego ekranu (v1.8) — czysto kosmetyczny zamiennik „Przerwy na
 * dużym ekranie". Tło: animacja startup w trybie ambient; prawa kolumna: ten sam
 * panel WSPÓLNY EKRAN co w bibliotece; lewa: „Co nowego?". Pokój działa dalej —
 * telefon albo przycisk odsłaniają ekran.
 */
export function LockScreen({
  onConnections,
  onLab,
  onOpen,
  onWake,
}: {
  onConnections: () => void;
  onLab: () => void;
  onOpen: (id: string) => void;
  onWake: () => void;
}) {
  const language = useLanguage();
  const en = language === 'en';
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    let scene: StartupScene | null = null;
    try { scene = new StartupScene(host.current, { ambient: true, language }); }
    catch { /* brak WebGL — tło zostaje płaskie */ }
    return () => { scene?.dispose(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const latest = WHATS_NEW_ITEMS.slice(0, 3);

  return <div className="joy-lockscreen" role="dialog" aria-modal="true" aria-label={en ? 'Screen break' : 'Przerwa na dużym ekranie'}>
    <div className="joy-lockscreen-bg" ref={host} aria-hidden="true" />
    <div className="joy-lockscreen-vignette" aria-hidden="true" />
    <div className="joy-lockscreen-top">
      <JoyPadLogo size={64} />
      <div>
        <span className="os-eyebrow">{en ? 'SCREEN BREAK' : 'PRZERWA NA DUŻYM EKRANIE'}</span>
        <h1>{en ? 'The evening is still yours.' : 'Dobry wieczór trwa.'}</h1>
      </div>
    </div>
    <div className="joy-lockscreen-grid">
      <aside className="joy-lockscreen-news glass-card">
        <span className="os-eyebrow" style={{ color: '#f0b37e' }}>{en ? "WHAT'S NEW" : 'CO NOWEGO?'}</span>
        <ul>
          {latest.map(({ title, detail, color }) => <li key={title.en} style={{ '--news-accent': color } as React.CSSProperties}>
            <h4>{en ? title.en : title.pl}</h4>
            <p>{en ? detail.en : detail.pl}</p>
          </li>)}
        </ul>
      </aside>
      <SessionPanel onConnections={onConnections} onLab={onLab} onOpen={onOpen} />
    </div>
    <button className="joy-lockscreen-wake" onClick={onWake}><Coffee size={17} />{en ? 'Back to the screen' : 'Wróć do ekranu'}</button>
    <small className="joy-lockscreen-hint">{en ? 'The admin can also wake the screen from a phone.' : 'Administrator może też odsłonić ekran z telefonu.'}</small>
  </div>;
}
