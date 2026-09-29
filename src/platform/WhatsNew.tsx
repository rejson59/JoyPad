import { useEffect, useState } from 'react';
import { ArrowRight, Car, Check, Clapperboard, Columns2, Gamepad2, MonitorSmartphone, QrCode, Sparkles } from 'lucide-react';
import { Sheet } from '../console/Sheet';
import { useLanguage } from './i18n';
import { WHATS_NEW_VERSION } from './whatsNewState';

export const WHATS_NEW_ITEMS = [
  {
    title: { pl: 'Wspólny ekran, który naprawdę łączy.', en: 'A shared screen that truly connects.' },
    detail: { pl: 'Kod QR zostaje na ekranie także po dołączeniu gospodarza — możesz go schować jednym przełącznikiem w Centrum pokoju, a „Nowy kod" odświeża parowanie, gdy ktoś się spóźnia.', en: 'The QR code stays on screen after the host joins — hide it with one switch in Room Center, and a fresh code re-opens pairing for late arrivals.' },
    icon: QrCode, color: '#8dcff3',
  },
  {
    title: { pl: 'Ekran blokady i animacja startowa.', en: 'A lock screen and a startup animation.' },
    detail: { pl: 'Przerwa na dużym ekranie wygląda teraz jak premiera: animowane tło, Co nowego? i panel wspólnego ekranu. Przy pierwszym uruchomieniu zapytamy o krótki poradnik.', en: 'Screen break now looks like a premiere: an animated background, What\'s new? and the shared-screen panel. On first run we offer a short guided tour.' },
    icon: MonitorSmartphone, color: '#f68a2e',
  },
  {
    title: { pl: 'Nitro League: pełna drużynówka 3D.', en: 'Nitro League: full 3D team play.' },
    detail: { pl: 'Cztery auta, boty, reflektory, wspomagania trudności i płynny podzielony ekran. Piłka, boost i złoty gol — jak na premierę ligi przystało.', en: 'Four cars, bots, headlights, difficulty assists and smooth split-screen. Ball, boost and golden goal — a proper league debut.' },
    icon: Car, color: '#edbd78',
  },
  {
    title: { pl: 'Wężowy Wir: wolniej i taktyczniej.', en: 'Snake Vortex: slower and more tactical.' },
    detail: { pl: 'Nowe tempo sprzyja manewrom, a zwycięzca to ostatni żywy wąż areny — eliminacja zamiast wyścigu punktów.', en: 'A calmer pace rewards maneuvering, and the winner is the last snake alive — elimination instead of a score race.' },
    icon: Sparkles, color: '#5eead4',
  },
  {
    title: { pl: 'Administrator sięga każdego przycisku.', en: 'The admin reaches every button.' },
    detail: { pl: 'Nawigacja w stylu Tab z owijaniem, przyciski X (pełny ekran) i Y (kod QR) na padzie oraz przełącznik pełnego ekranu w Centrum pokoju.', en: 'Tab-style navigation with wrap-around, X (fullscreen) and Y (QR code) buttons on the pad, plus a fullscreen switch in Room Center.' },
    icon: Gamepad2, color: '#baa6fa',
  },
  {
    title: { pl: 'Podział ekranu po swojemu i poradniki.', en: 'Your own split layout, plus tutorials.' },
    detail: { pl: 'Kolumny albo kafle z podglądem przed grą i bez pustych kafelków. Każda gra ma animowany poradnik uruchamiany z ekranu startu.', en: 'Columns or tiles with a pre-game preview and no empty tiles. Every game ships an animated tutorial launched from setup.' },
    icon: Columns2, color: '#e4a766',
  },
  {
    title: { pl: 'Momenty grają na wynikach.', en: 'Moments play on the results screen.' },
    detail: { pl: 'Najlepsza akcja rundy wraca jako tło ekranu wyników, a po polsku nazywa się już po prostu „Momenty".', en: 'The best play of the round returns as the results backdrop, and in Polish it is now simply "Momenty".' },
    icon: Clapperboard, color: '#ff9a52',
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
    <div className="whats-new-list">{WHATS_NEW_ITEMS.map(({ title, detail, icon: Icon, color }, index) => <article key={title.en} style={{ '--update-color': color, '--update-delay': `${index * 70}ms` } as React.CSSProperties}><div className="whats-new-icon"><Icon size={20} /></div><div><div className="whats-new-meta"><span>{WHATS_NEW_VERSION}</span><small>{en ? 'NOW' : 'TERAZ'}</small></div><h4>{en ? title.en : title.pl}</h4><p>{en ? detail.en : detail.pl}</p><span className="whats-new-done"><Check size={12} /> {en ? 'LIVE' : 'W GRZE'}</span></div><ArrowRight size={17} className="whats-new-arrow" /></article>)}</div>
    <div className="whats-new-foot"><span>{en ? 'Updates stay lightweight. The game comes first.' : 'Aktualizacje pozostają lekkie. Gra ma pierwszeństwo.'}</span><button type="button" onClick={close}>{en ? 'Back to library' : 'Do biblioteki'} <ArrowRight size={15} /></button></div>
  </Sheet>;
}
