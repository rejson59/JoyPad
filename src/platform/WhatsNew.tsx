import { useEffect, useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Sheet } from '../console/Sheet';
import { useLanguage } from './i18n';
import { UPDATES } from './whatsNewNotes';
import { APP_VERSION_SHORT, WHATS_NEW_VERSION } from './whatsNewState';


export function WhatsNew({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const [visible, setVisible] = useState(open);
  const language = useLanguage();
  const en = language === 'en';
  const close = () => { setVisible(false); onClose?.(); };
  useEffect(() => { setVisible(open); }, [open]);
  if (!visible) return null;
  return <Sheet title={en ? "What's new?" : 'Co nowego?'} wide eyebrow={en ? 'JOYPAD / UPDATE NOTES' : 'JOYPAD / CO NOWEGO'} onClose={close}>
    <div className="whats-new-hero"><div><span className="os-eyebrow">{en ? 'VERSION' : 'WERSJA'} {WHATS_NEW_VERSION}</span><h3>{en ? <>One console.<br /><em>Six worlds, one shell.</em></> : <>Jedna konsola.<br /><em>Sześć światów, jedna oprawa.</em></>}</h3><p>{en ? 'The latest JoyPad changes — short, clear and ready for the next round.' : 'Najnowsze zmiany w JoyPad — krótko, konkretnie i z miejscem na następną rundę.'}</p></div><div className="whats-new-orbit" aria-hidden="true"><span /><span /><i>{APP_VERSION_SHORT}</i></div></div>
    <div className="whats-new-list">{UPDATES.map(({ title, detail, icon: Icon, color }, index) => <article key={title.en} style={{ '--update-color': color, '--update-delay': `${index * 70}ms` } as React.CSSProperties}><div className="whats-new-icon"><Icon size={20} /></div><div><div className="whats-new-meta"><span>{WHATS_NEW_VERSION}</span><small>{en ? 'NOW' : 'TERAZ'}</small></div><h4>{en ? title.en : title.pl}</h4><p>{en ? detail.en : detail.pl}</p><span className="whats-new-done"><Check size={12} /> {en ? 'LIVE' : 'W GRZE'}</span></div><ArrowRight size={17} className="whats-new-arrow" /></article>)}</div>
    <div className="whats-new-foot"><span>{en ? 'Updates stay lightweight. The game comes first.' : 'Aktualizacje pozostają lekkie. Gra ma pierwszeństwo.'}</span><button type="button" onClick={close}>{en ? 'Back to library' : 'Do biblioteki'} <ArrowRight size={15} /></button></div>
  </Sheet>;
}
