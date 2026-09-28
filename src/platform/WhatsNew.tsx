import { useEffect, useState } from 'react';
import { ArrowRight, Check, Gamepad2, Sparkles, Video, Zap } from 'lucide-react';
import { Sheet } from '../console/Sheet';
import { useLanguage } from './i18n';
import { WHATS_NEW_VERSION } from './whatsNewState';

const UPDATES = [
  {
    title: { pl: 'Moments Gallery — klipy pod ręką.', en: 'Moments Gallery — your clips, in reach.' },
    detail: { pl: 'Filtruj rundy według gry, sortuj chronologicznie, odtwarzaj, pobieraj i udostępniaj zapisane akcje. Klipy pozostają lokalne.', en: 'Filter rounds by game, sort by date, replay, download and share saved highlights. Clips stay on your device.' },
    icon: Video, color: '#edbd78',
  },
  {
    title: { pl: 'Cały JoyPad po polsku i angielsku.', en: 'JoyPad in Polish and English.' },
    detail: { pl: 'Przełącz język interfejsu — menu, ustawienia, komunikaty na padach i rundy zachowują wybrany język.', en: 'Switch the interface language — menus, settings, controller messages and game rounds follow your choice.' },
    icon: Gamepad2, color: '#baa6fa',
  },
  {
    title: { pl: 'Neonowy Pęd prowadzi pewniej.', en: 'Neon Rush feels easier to drive.' },
    detail: { pl: 'Czytelniejsze wskazówki sterowania, łagodna pomoc przy krawędziach toru i mniej utraconej prędkości po otarciu o bandę.', en: 'Clearer control prompts, gentle track-edge assistance and less lost speed after a scrape against the barrier.' },
    icon: Zap, color: '#5eead4',
  },
  {
    title: { pl: 'Wężowy Wir w stalowej arenie 2D.', en: 'Snake Vortex enters a steel 2D arena.' },
    detail: { pl: 'Taktyczna oprawa inspirowana Stalowym Frontem, płynniejsze animacje i responsywne sterowanie dotykowe.', en: 'A tactical look inspired by Steel Front, smoother animation and responsive touch controls.' },
    icon: Sparkles, color: '#e4a766',
  },
  {
    title: { pl: 'Spójniejsza konsola, lżejsze sterowanie.', en: 'A more cohesive console, lighter controls.' },
    detail: { pl: 'Płynniejsze przejścia, odświeżona biblioteka i ograniczone aktualizacje joysticka pomagają utrzymać responsywność na telefonach.', en: 'Smoother transitions, a refreshed library and frame-limited joystick updates help phones stay responsive.' },
    icon: Gamepad2, color: '#8dcff3',
  },
  {
    title: { pl: 'BlockCraft — zapowiedź.', en: 'BlockCraft — an announcement.' },
    detail: { pl: 'Przygotowujemy sandbox z budowaniem z bloków. To tylko zapowiedź — gra nie jest jeszcze dostępna.', en: 'A block-building sandbox is planned. This is only an announcement — the game is not playable yet.' },
    icon: Sparkles, color: '#7cd67f',
  },
] as const;

export function WhatsNew({ open = false, onClose }: { open?: boolean; onClose?: () => void }) {
  const [visible, setVisible] = useState(open);
  const language = useLanguage();
  const en = language === 'en';
  const close = () => { setVisible(false); onClose?.(); };
  useEffect(() => { setVisible(open); }, [open]);
  if (!visible) return null;
  return <Sheet title={en ? "What's new?" : 'Co nowego?'} wide eyebrow={en ? 'JOYPAD / UPDATE NOTES' : 'JOYPAD / CO NOWEGO'} onClose={close}>
    <div className="whats-new-hero"><div><span className="os-eyebrow">{en ? 'VERSION' : 'WERSJA'} {WHATS_NEW_VERSION}</span><h3>{en ? <>A fresh round.<br /><em>More room to play.</em></> : <>Nowa runda.<br /><em>Więcej miejsca na grę.</em></>}</h3><p>{en ? 'The latest JoyPad changes — short, clear and ready for the next round.' : 'Najnowsze zmiany w JoyPad — krótko, konkretnie i z miejscem na następną rundę.'}</p></div><div className="whats-new-orbit" aria-hidden="true"><span /><span /><i>1.7</i></div></div>
    <div className="whats-new-list">{UPDATES.map(({ title, detail, icon: Icon, color }, index) => <article key={title.en} style={{ '--update-color': color, '--update-delay': `${index * 70}ms` } as React.CSSProperties}><div className="whats-new-icon"><Icon size={20} /></div><div><div className="whats-new-meta"><span>{WHATS_NEW_VERSION}</span><small>{en ? 'NOW' : 'TERAZ'}</small></div><h4>{en ? title.en : title.pl}</h4><p>{en ? detail.en : detail.pl}</p><span className="whats-new-done"><Check size={12} /> {en ? 'LIVE' : 'W GRZE'}</span></div><ArrowRight size={17} className="whats-new-arrow" /></article>)}</div>
    <div className="whats-new-foot"><span>{en ? 'Updates stay lightweight. The game comes first.' : 'Aktualizacje pozostają lekkie. Gra ma pierwszeństwo.'}</span><button type="button" onClick={close}>{en ? 'Back to library' : 'Do biblioteki'} <ArrowRight size={15} /></button></div>
  </Sheet>;
}
