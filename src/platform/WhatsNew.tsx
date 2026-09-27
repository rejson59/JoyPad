import { useEffect, useState } from 'react';
import { ArrowRight, Check, Sparkles, Trophy, Video, Zap } from 'lucide-react';
import { Sheet } from '../console/Sheet';
import { useLanguage } from './i18n';

const UPDATES = [
  { version: '1.6.0', date: 'TERAZ', title: 'Moments. Prawdziwa historia rundy.', detail: 'Najciekawsze akcje wybierają się same. Zapisz tylko te, do których chcesz wracać — lokalnie, jednym kliknięciem.', icon: Video, color: '#edbd78' },
  { version: '1.6.0', date: 'TERAZ', title: 'Wężowy Wir w becie.', detail: 'Szybki multiplayer, cztery strzałki na telefonie i sprint, który potrafi odwrócić wynik. Beta oznacza nowe pomysły, nie mniej testów.', icon: Zap, color: '#5eead4' },
  { version: '1.6.0', date: 'TERAZ', title: 'Twój pad pamięta.', detail: 'Lokalny profil, seria zwycięstw i osiągnięcia zostają na konkretnym telefonie. Połącz go ponownie, a wrócą na ekran.', icon: Trophy, color: '#baa6fa' },
  { version: '1.7.0', date: 'W PLANACH', title: 'Więcej formatów dla ekipy.', detail: 'Pierwsze elementy turnieju i 2v2 są już w ustawieniach. Kolejne rundy dopracujemy bez zabierania płynności zwykłej gry.', icon: Sparkles, color: '#8dcff3' },
];

const EN_UPDATES = [
  ['Moments. Your round, remembered.', 'The most interesting actions choose themselves. Save only the clips you want to keep — locally, with one click.'],
  ['Snake Vortex is in beta.', 'Fast multiplayer, four arrows on your phone and a sprint that can turn the score around. Beta means new ideas, not fewer tests.'],
  ['Your controller remembers.', 'A local profile, win streak and achievements stay on this specific phone. Reconnect it and they return to the screen.'],
  ['More formats for the crew.', 'The first tournament and 2v2 elements are already in settings. We will refine them without taking smoothness from classic play.'],
] as const;

export function WhatsNew({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const [visible, setVisible] = useState(open);
  const language = useLanguage();
  const localized = language === 'en' ? EN_UPDATES : null;
  const close = () => { setVisible(false); onClose?.(); };
  useEffect(() => { setVisible(open); }, [open]);
  if (!visible) return null;
  return <Sheet title={language === 'en' ? "What's new?" : 'Co nowego?'} wide eyebrow="JOYPAD / UPDATE NOTES" onClose={close}>
    <div className="whats-new-hero"><div><span className="os-eyebrow">VERSION 1.6.0</span><h3>{language === 'en' ? <>A lot changed.<br /><em>We keep moving.</em></> : <>Dużo się wydarzyło.<br /><em>Nie zwalniamy.</em></>}</h3><p>{language === 'en' ? 'The most important JoyPad changes — short, clear and ready for the next round.' : 'Najważniejsze zmiany w JoyPad — krótko, konkretnie i z miejscem na następną rundę.'}</p></div><div className="whats-new-orbit" aria-hidden="true"><span /><span /><i>1.6</i></div></div>
    <div className="whats-new-list">{UPDATES.map(({ version, date, title, detail, icon: Icon, color }, index) => <article key={`${version}-${title}`} style={{ '--update-color': color, '--update-delay': `${index * 70}ms` } as React.CSSProperties}><div className="whats-new-icon"><Icon size={20} /></div><div><div className="whats-new-meta"><span>{version}</span><small>{date}</small></div><h4>{localized?.[index]?.[0] || title}</h4><p>{localized?.[index]?.[1] || detail}</p>{version === '1.6.0' && <span className="whats-new-done"><Check size={12} /> W GRZE</span>}</div><ArrowRight size={17} className="whats-new-arrow" /></article>)}</div>
    <div className="whats-new-foot"><span>{language === 'en' ? 'Updates stay lightweight. The game comes first.' : 'Aktualizacje pozostają lekkie. Gra ma pierwszeństwo.'}</span><button type="button" onClick={close}>{language === 'en' ? 'Back to library' : 'Do biblioteki'} <ArrowRight size={15} /></button></div>
  </Sheet>;
}
