import { useEffect, useRef, useState } from 'react';
import { Play, SkipForward } from 'lucide-react';
import { STARTUP_STEPS, StartupScene } from './StartupScene';
import { markStartupSeen } from './startupState';
import { useReducedMotion } from '../../lib/useReducedMotion';
import { useLanguage } from '../i18n';

type Phase = 'ask' | 'warning' | 'play' | 'closing';

/**
 * Pierwsza wizyta na dużym ekranie: pytanie o krótki poradnik, a następnie
 * animacja startup (Three.js, scenariusz w STARTUP_STEPS). „Nie" dostaje
 * uczciwe ostrzeżenie, że bez poradnika może być trudniej. Ograniczenie ruchu
 * pokazuje statyczny kadr z napisami zamiast animacji kamery.
 */
export function StartupOverlay({ onFinished }: { onFinished: () => void }) {
  const reduced = useReducedMotion();
  const languageState = useLanguage();
  const language: 'pl' | 'en' = languageState === 'en' ? 'en' : 'pl';
  const en = language === 'en';
  const [phase, setPhase] = useState<Phase>('ask');
  const [step, setStep] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const scene = useRef<StartupScene | null>(null);

  const close = () => {
    setLeaving(true);
    window.setTimeout(() => { markStartupSeen(); onFinished(); }, 320);
  };

  useEffect(() => {
    if (phase !== 'play' || !host.current) return;
    scene.current = new StartupScene(host.current, { language }, {
      onStep: setStep,
      onDone: () => close(),
    });
    return () => { scene.current?.dispose(); scene.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'Enter' && phase !== 'play') {
        e.preventDefault();
        if (phase === 'ask') setPhase(reduced ? 'play' : 'play');
        else if (phase === 'warning') setPhase('play');
        else close();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, reduced]);

  const startTutorial = () => {
    if (reduced) {
      // Ograniczony ruch: bez animacji kamery — pokażemy kroki jako spokojne karty.
      setPhase('play');
      return;
    }
    setPhase('play');
  };

  return <div className={`startup-overlay ${leaving ? 'is-leaving' : ''}`} role="dialog" aria-modal="true" aria-label={en ? 'Welcome to JoyPad' : 'Witaj w JoyPad'}>
    {phase === 'play' && <div ref={host} className="startup-stage" aria-hidden="true" />}
    <div className="startup-vignette" aria-hidden="true" />

    {phase === 'ask' && <div className="startup-card" key="ask">
      <span className="os-eyebrow">{en ? 'WELCOME / FIRST RUN' : 'POWITANIE / PIERWSZE URUCHOMIENIE'}</span>
      <h2>{en ? <>Welcome to JoyPad!<br /><em>Want a quick tour?</em></> : <>Witaj w JoyPad!<br /><em>Chcesz zobaczyć krótki poradnik?</em></>}</h2>
      <p>{en ? 'About half a minute. It shows how phones become controllers and where the games live.' : 'Pół minuty. Pokaże, jak telefony stają się padami i gdzie szukać gier.'}</p>
      <div className="startup-card-actions">
        <button className="startup-cta" onClick={startTutorial}><Play size={18} fill="currentColor" />{en ? 'Yes, show me how' : 'Tak, pokaż jak'}</button>
        <button className="startup-quiet" onClick={() => setPhase('warning')}>{en ? 'No, I know my way' : 'Nie, znam się'}</button>
      </div>
    </div>}

    {phase === 'warning' && <div className="startup-card" key="warn" role="alert">
      <span className="os-eyebrow" style={{ color: '#f0b37e' }}>{en ? 'JUST SO YOU KNOW' : 'TERAZ UWAGA'}</span>
      <h2>{en ? <>It can be harder<br /><em>without the tour.</em></> : <>Bez poradnika<br /><em>może być ciężej.</em></>}</h2>
      <p>{en ? 'JoyPad is built around the TV-and-phone flow — pairing, the admin role and game setup. The tour takes half a minute and you can always replay it from the library.' : 'JoyPad kręci się wokół pary ekran–telefony: parowanie, rola administratora, ustawienia rundy. Poradnik trwa pół minuty i zawsze można go odpalić z biblioteki.'}</p>
      <div className="startup-card-actions">
        <button className="startup-cta" onClick={startTutorial}><Play size={18} fill="currentColor" />{en ? 'Okay, show me' : 'Dobrze, pokaż'}</button>
        <button className="startup-quiet" onClick={close}>{en ? 'Enter anyway' : 'Wchodzę mimo to'}</button>
      </div>
    </div>}

    {phase === 'play' && reduced && <div className="startup-card" key="reduced">
      <span className="os-eyebrow">{en ? 'QUICK TOUR / REDUCED MOTION' : 'PORADNIK / OGRANICZONY RUCH'}</span>
      <h2>{STARTUP_STEPS[step]?.title[en ? 'en' : 'pl']}</h2>
      <p>{STARTUP_STEPS[step]?.text[en ? 'en' : 'pl']}</p>
      <div className="startup-card-actions">
        {step < STARTUP_STEPS.length - 1
          ? <button className="startup-cta" onClick={() => setStep(step + 1)}>{en ? 'Next' : 'Dalej'}</button>
          : <button className="startup-cta" onClick={close}><Play size={18} fill="currentColor" />{en ? 'To the library' : 'Do biblioteki'}</button>}
      </div>
    </div>}

    {phase === 'play' && !reduced && <div className="startup-hud">
      <div className="startup-caption" key={step}>
        <span className="os-eyebrow">{en ? `QUICK TOUR · ${step + 1}/${STARTUP_STEPS.length}` : `PORADNIK · ${step + 1}/${STARTUP_STEPS.length}`}</span>
        <h2>{STARTUP_STEPS[step]?.title[en ? 'en' : 'pl']}</h2>
        <p>{STARTUP_STEPS[step]?.text[en ? 'en' : 'pl']}</p>
      </div>
      <div className="startup-progress" aria-hidden="true">{STARTUP_STEPS.map((s, i) => <i key={s.id} className={i <= step ? 'is-on' : ''} />)}</div>
      <button className="startup-skip" onClick={close}><SkipForward size={15} />{en ? 'Skip' : 'Pomiń'}</button>
    </div>}
  </div>;
}
