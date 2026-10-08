import { useState } from 'react';
import { MonitorPlay, QrCode, Smartphone, Sparkles } from 'lucide-react';
import { Sheet } from '../console/Sheet';
import { PlamekOrbit } from '../console/PlamekOrbit';
import { useT } from '../platform/i18n';
import { filmScript, pick } from './script';

/**
 * Ekran powitalny: pytanie o poradnik przy pierwszym wejściu.
 *
 * Dwie odpowiedzi i ani jednej ślepej uliczki:
 *   • „Tak" → film startuje od razu (ten sam klik jest gestem, więc dźwięk
 *     odtwarzacza ma prawo się odezwać).
 *   • „Nie" → szczere ostrzeżenie o tym, co bez poradnika będzie trudniejsze,
 *     z przyciskiem powrotu do decyzji i informacją, gdzie wrócić później.
 *
 * Pytanie wraca tylko wtedy, gdy ktoś o to poprosi w ustawieniach — jedno
 * „nie" jest decyzją, nie pomyłką.
 */
export function Welcome({ onWatch, onDecline }: { onWatch: () => void; onDecline: () => void }) {
  const { language } = useT();
  const [step, setStep] = useState<'ask' | 'warn'>('ask');
  const copy = filmScript.welcome;
  const t = (text: Parameters<typeof pick>[0]) => pick(text, language);
  const peeks = [
    { icon: <QrCode size={17} />, text: copy.peek1 },
    { icon: <Smartphone size={17} />, text: copy.peek2 },
    { icon: <MonitorPlay size={17} />, text: copy.peek3 },
  ];

  return (
    <Sheet
      title={t(copy.title)}
      eyebrow="JOYPAD / PORADNIK"
      variant="cinema"
      onClose={() => { if (step === 'ask') setStep('warn'); else onDecline(); }}
    >
      <div className="cine-ask">
        <div className="cine-ask-hero">
          <PlamekOrbit size={44} />
          <div>
            <span className="os-eyebrow">{t(filmScript.subtitle)}</span>
            <h3>{step === 'ask' ? t(copy.ask) : t(copy.warnTitle)}</h3>
          </div>
        </div>

        {step === 'ask' ? (
          <>
            <ul className="cine-ask-peeks">
              {peeks.map((peek, index) => (
                <li key={index}><span aria-hidden="true">{peek.icon}</span>{t(peek.text)}</li>
              ))}
            </ul>
            <p className="os-note cine-ask-note"><Sparkles size={13} />{t(copy.yesHint)}</p>
            <div className="cine-ask-actions">
              <button type="button" className="lg-pill is-primary" onClick={onWatch}>{t(copy.yes)}</button>
              <button type="button" className="lg-pill" onClick={() => setStep('warn')}>{t(copy.no)}</button>
            </div>
          </>
        ) : (
          <>
            <ul className="cine-ask-warns">
              <li>{t(copy.warn1)}</li>
              <li>{t(copy.warn2)}</li>
              <li>{t(copy.warn3)}</li>
            </ul>
            <div className="cine-ask-actions">
              <button type="button" className="lg-pill is-primary" onClick={onWatch}>{t(copy.watch)}</button>
              <button type="button" className="lg-pill" onClick={onDecline}>{t(copy.warnSkip)}</button>
            </div>
          </>
        )}
      </div>
    </Sheet>
  );
}
