import { useEffect, useState } from 'react';
import { ArrowRight, Car, Check, Gamepad2, MonitorUp, Pizza, Sparkles, Tv, Video } from 'lucide-react';
import { Sheet } from '../console/Sheet';
import { useLanguage } from './i18n';
import { APP_VERSION_SHORT, WHATS_NEW_VERSION } from './whatsNewState';

const UPDATES = [
  {
    title: { pl: 'Turbo League gra naprawdę.', en: 'Turbo League is really playable.' },
    detail: { pl: 'Piłka samochodowa 3D na stadionie: pełna fizyka, boost z żółtych pól, odbicia od band i powtórki goli. Mecze od 1v1 do 2v2, do 3/5/7 goli, złoty gol w dogrywce.', en: '3D car soccer on a stadium: full physics, boost from the yellow pads, wall rebounds and goal replays. Matches from 1v1 up to 2v2, first to 3/5/7 goals, golden goal in extra time.' },
    icon: Car, color: '#ff9a52',
  },
  {
    title: { pl: 'WEBZA — Nocna Dostawa.', en: 'WEBZA — Night Delivery.' },
    detail: { pl: 'Kurierzy pizzy huśtają się na sieci między dachami i trafiają w światło zamówień. Grajcie razem po ocenę zespołu albo rywalizujcie o MVP zmiany.', en: 'Pizza couriers swing on a web between rooftops and hit the light of every order. Play together for a team rating or compete for shift MVP.' },
    icon: Pizza, color: '#edbd78',
  },
  {
    title: { pl: 'Pad steruje całą konsolą.', en: 'The pad drives the whole console.' },
    detail: { pl: 'Klawiatura, pad USB i pilot z telefonu przechodzą przez każdy klikalny element: bibliotekę, okienka, centrum pokoju i ustawienia. A zatwierdza, B cofa, X/Y to skróty podpisane na dole ekranu.', en: 'Keyboard, USB pad and the phone remote reach every clickable element: the library, sheets, room centre and settings. A confirms, B goes back, X/Y are the shortcuts signed at the bottom of the screen.' },
    icon: Gamepad2, color: '#baa6fa',
  },
  {
    title: { pl: 'Profile ekranu: TV, komputer, tablet, telefon.', en: 'Screen profiles: TV, computer, tablet, phone.' },
    detail: { pl: 'Duży ekran nie wymaga przewijania, tablet dostaje większe cele dotyku, a administrator rozkłada pełny ekran telewizora ze swojego pada.', en: 'The big screen needs no scrolling, tablets get larger touch targets and the admin can expand TV fullscreen straight from their pad.' },
    icon: Tv, color: '#5eead4',
  },
  {
    title: { pl: 'Plamek pokazuje, gdzie jesteś.', en: 'Plamek shows where you are.' },
    detail: { pl: 'Plama farby z buźką zastępuje ramkę fokusa: ścieka z otoczki, przelatuje na następny element i rozlewa się wokół niego. Przy ograniczonym ruchu zostaje sam poślizg.', en: 'A paint blob with a face replaces the focus ring: it drips off the outline, flies to the next element and spills around it. With reduced motion only the slide remains.' },
    icon: Sparkles, color: '#e4a766',
  },
  {
    title: { pl: 'Okienka na szkle, nie szuflady z boku.', en: 'Glass windows, not side drawers.' },
    detail: { pl: 'Ustawienia, pomoc, pauza i centrum pokoju to pływające karty, które wyrastają z przycisku, w który trafiło kliknięcie, i wracają do niego przy zamknięciu.', en: 'Settings, help, pause and the room centre are floating cards that grow out of the button you clicked and return to it when closed.' },
    icon: MonitorUp, color: '#8dcff3',
  },
  {
    title: { pl: 'Moments Gallery i pełne PL/EN.', en: 'Moments Gallery and full PL/EN.' },
    detail: { pl: 'Filtruj rundy według gry, odtwarzaj, pobieraj i udostępniaj zapisane akcje — klipy zostają lokalne. Język obejmuje bibliotekę, pokoje, pady i HUD-y wszystkich rund.', en: 'Filter rounds by game, replay, download and share saved highlights — clips stay local. The language covers the library, rooms, pads and the HUD of every round.' },
    icon: Video, color: '#edbd78',
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
    <div className="whats-new-hero"><div><span className="os-eyebrow">{en ? 'VERSION' : 'WERSJA'} {WHATS_NEW_VERSION}</span><h3>{en ? <>A fresh round.<br /><em>More room to play.</em></> : <>Nowa runda.<br /><em>Więcej miejsca na grę.</em></>}</h3><p>{en ? 'The latest JoyPad changes — short, clear and ready for the next round.' : 'Najnowsze zmiany w JoyPad — krótko, konkretnie i z miejscem na następną rundę.'}</p></div><div className="whats-new-orbit" aria-hidden="true"><span /><span /><i>{APP_VERSION_SHORT}</i></div></div>
    <div className="whats-new-list">{UPDATES.map(({ title, detail, icon: Icon, color }, index) => <article key={title.en} style={{ '--update-color': color, '--update-delay': `${index * 70}ms` } as React.CSSProperties}><div className="whats-new-icon"><Icon size={20} /></div><div><div className="whats-new-meta"><span>{WHATS_NEW_VERSION}</span><small>{en ? 'NOW' : 'TERAZ'}</small></div><h4>{en ? title.en : title.pl}</h4><p>{en ? detail.en : detail.pl}</p><span className="whats-new-done"><Check size={12} /> {en ? 'LIVE' : 'W GRZE'}</span></div><ArrowRight size={17} className="whats-new-arrow" /></article>)}</div>
    <div className="whats-new-foot"><span>{en ? 'Updates stay lightweight. The game comes first.' : 'Aktualizacje pozostają lekkie. Gra ma pierwszeństwo.'}</span><button type="button" onClick={close}>{en ? 'Back to library' : 'Do biblioteki'} <ArrowRight size={15} /></button></div>
  </Sheet>;
}
