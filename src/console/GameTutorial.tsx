import { useEffect, useState } from 'react';
import { ArrowRight, Gamepad2, GraduationCap, X } from 'lucide-react';
import type { GameId } from '../arcade/catalog';
import { useLanguage } from '../platform/i18n';

/**
 * PORADNIKI GIER (v1.8) — uruchamiane na żądanie z ekranu przygotowania rundy.
 *
 * Scenariusze są DANYMI: dopisz grę albo krok w `GAME_TUTORIALS`, nie ruszając
 * odtwarzacza. `art` wybiera jedną z małych animowanych scenek (czysty CSS).
 * Nowa gra bez wpisu dostaje ogólny poradnik "jak się gra w JoyPad".
 */

export interface TutorialStep {
  title: { pl: string; en: string };
  text: { pl: string; en: string };
  art: 'drive' | 'shoot' | 'split' | 'energy' | 'ball' | 'phone';
}

export const GAME_TUTORIALS: Partial<Record<GameId, { steps: TutorialStep[] }>> = {
  tanks: { steps: [
    { title: { pl: 'Telefon = lufa', en: 'Phone = turret' }, text: { pl: 'Joystick jeździ, przycisk ognia strzela. Celuj i jedź jednocześnie — jak w prawdziwym padzie.', en: 'The joystick drives, the fire button shoots. Aim and drive at once — like a real pad.' }, art: 'drive' },
    { title: { pl: 'Kryjówki nie wieczne', en: 'Cover never lasts' }, text: { pl: 'Ściany i skrzynie rozpadają się od pocisków. To, co dziś osłania, jutro jest wozem drogowym.', en: 'Walls and crates crumble under fire. What covers you today is rubble tomorrow.' }, art: 'shoot' },
    { title: { pl: 'Boty grają w Twojej drużynie', en: 'Bots fill empty seats' }, text: { pl: 'Wolne sloty zajmują boty. Każdy gracz ma własną kamerę, gdy włączysz podzielony ekran.', en: 'Bots take free slots. Each player gets their own camera when you enable split-screen.' }, art: 'split' },
  ] },
  race: { steps: [
    { title: { pl: 'Gaz w dół, tor przed sobą', en: 'Throttle down, eyes up' }, text: { pl: 'Joystick skręca, automat przyspiesza. Neonowe krawędzie są tu tylko po to, by ścigać się blisko nich.', en: 'The joystick steers, throttle is automatic. The neon edges exist to be grazed.' }, art: 'drive' },
    { title: { pl: 'Turbo z frykasem', en: 'Turbo with a twist' }, text: { pl: 'Śmiałkowe skróty i pasek turbo odnawiają się w rytm okrążeń. Ryzyko = pozycja.', en: 'Risky shortcuts and a turbo bar that refills each lap. Risk buys positions.' }, art: 'energy' },
    { title: { pl: 'Runda to 3 okrążenia', en: 'A round is 3 laps' }, text: { pl: 'Pozycje liczą się na mecie. Split-screen daje każdemu własną kamerę.', en: 'Positions count at the finish line. Split-screen gives everyone their own camera.' }, art: 'split' },
  ] },
  orbit: { steps: [
    { title: { pl: 'Statek na uwięzi', en: 'Ship on a leash' }, text: { pl: 'Joystick steruje statkiem w pełnych 360°. Satelity i asteroidy to krótkie drogi i pułapki naraz.', en: 'The joystick steers your ship through a full 360°. Satellites and asteroids are shortcuts and traps at once.' }, art: 'drive' },
    { title: { pl: 'Ogień na widzenia', en: 'Fire on sight' }, text: { pl: 'Przycisk ognia strzela w kierunku lotu. Fale wrogów przyspieszają — przetrwaj seria po serii.', en: 'The fire button shoots along your heading. Enemy waves accelerate — survive volley after volley.' }, art: 'shoot' },
    { title: { pl: 'Wspólny ekran, wspólny los', en: 'One screen, one fate' }, text: { pl: 'Orbitalna Fala to tryb kooperacji: wszyscy widzą tę samą arenę i bronią jej razem.', en: 'Orbital Wave is co-op: everyone sees the same arena and defends it together.' }, art: 'split' },
  ] },
  snake: { steps: [
    { title: { pl: 'Energia to wszystko', en: 'Energy is everything' }, text: { pl: 'Wąż powoli traci energię. Zbieraj punkty, by rosnąć i żyć dłużej.', en: 'Your snake slowly loses energy. Grab orbs to grow and stay alive.' }, art: 'energy' },
    { title: { pl: 'Sprint kosztuje', en: 'Sprinting costs' }, text: { pl: 'Przycisk sprintu daje pęd, ale zżera energię szybciej. Używaj go, by ściąć rywala.', en: 'Sprint gives burst speed but drains energy faster. Use it to cut off a rival.' }, art: 'drive' },
    { title: { pl: 'Zasada: ostatni wąż stoi', en: 'Last snake standing' }, text: { pl: 'Zderzenie z rywalem eliminuje. Wygrywa ostatni żywy wąż — albo ten z największym ogonem na czas.', en: 'Hitting a rival eliminates you. The last snake alive wins — or the longest one at the buzzer.' }, art: 'split' },
  ] },
  league: { steps: [
    { title: { pl: 'Piłka większa od ciebie', en: 'The ball is bigger than you' }, text: { pl: 'Auto-napęd pcha auto, a auto pcha piłkę. Wjedź w nią i poprowadź pod bramkę rywala.', en: 'Boost pushes the car, the car pushes the ball. Hit it and carry it to the rival goal.' }, art: 'ball' },
    { title: { pl: 'Boost to waluta', en: 'Boost is currency' }, text: { pl: 'Przycisk ognia = turbo. Zbieraj błyskawice na boisku, by mieć zapas na decydującą akcję.', en: 'The fire button is boost. Collect lightning orbs to bank some for the decisive play.' }, art: 'energy' },
    { title: { pl: 'Więcej goli wygrywa', en: 'Most goals wins' }, text: { pl: 'Dwie drużyny, siatka czasowa. Remis? Złoty gol w dogrywce. Split-screen dla każdego gracza.', en: 'Two teams, one clock. Tied? Golden goal in overtime. Split-screen for every player.' }, art: 'ball' },
  ] },
};

const GENERIC: TutorialStep[] = [
  { title: { pl: 'Jeden ekran, cztery pady', en: 'One screen, four pads' }, text: { pl: 'Każdy telefon to pad: skanujesz kod i grasz. Administrator wybiera grę i ustawienia.', en: 'Every phone is a pad: scan the code and play. The admin picks the game and settings.' }, art: 'phone' },
  { title: { pl: 'Joystick i przyciski', en: 'Joystick and buttons' }, text: { pl: 'Joystick prowadzi, przycisk ognia działa. Telefony w pionie to także pilot menu.', en: 'The joystick steers, the fire button acts. Held upright, a phone is also the menu remote.' }, art: 'phone' },
  { title: { pl: 'Momenty zostają', en: 'Moments stay' }, text: { pl: 'Po rundzie zobaczysz najlepsze akcje jako powtórki. Miłej gry!', en: 'After the round the best plays come back as replays. Have fun!' }, art: 'energy' },
];

/** Mała animowana scenka CSS — szanuje ograniczenie ruchu globalnie. */
function StepArt({ art }: { art: TutorialStep['art'] }) {
  if (art === 'split') return <div className="gt-art gt-split" aria-hidden="true"><i /><i /><i /><i /></div>;
  if (art === 'shoot') return <div className="gt-art gt-shoot" aria-hidden="true"><span className="gt-ship">▲</span><span className="gt-shot" /><span className="gt-target" /></div>;
  if (art === 'energy') return <div className="gt-art gt-energy" aria-hidden="true"><span className="gt-orb" /><span className="gt-orb d2" /><span className="gt-snake" /></div>;
  if (art === 'ball') return <div className="gt-art gt-ball" aria-hidden="true"><span className="gt-car" /><span className="gt-ball" /><span className="gt-goal" /></div>;
  if (art === 'phone') return <div className="gt-art gt-phone" aria-hidden="true"><span className="gt-device"><Gamepad2 size={18} /></span><span className="gt-wave w1" /><span className="gt-wave w2" /><span className="gt-screen-dot" /></div>;
  return <div className="gt-art gt-drive" aria-hidden="true"><span className="gt-path" /><span className="gt-mover" /></div>;
}

/** Nakładka z poradnikiem — karta liquid glass, kroki przewijane strzałkami pilota. */
export function GameTutorial({ id, onClose }: { id: GameId; onClose: () => void }) {
  const languageState = useLanguage();
  const en = languageState === 'en';
  const steps = GAME_TUTORIALS[id]?.steps ?? GENERIC;
  const [step, setStep] = useState(0);
  const current = steps[Math.min(step, steps.length - 1)];

  useEffect(() => {
    const back = () => { if (step > 0) setStep(step - 1); else onClose(); };
    const forward = () => { if (step < steps.length - 1) setStep(step + 1); else onClose(); };
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape' || e.code === 'ArrowLeft') { e.preventDefault(); back(); }
      if (e.code === 'ArrowRight' || e.code === 'Enter') { e.preventDefault(); forward(); }
    };
    const onRemote = (e: Event) => {
      const command = (e as CustomEvent<string>).detail;
      if (command === 'back' || command === 'home') { onClose(); return; }
      if (command === 'left') back();
      if (command === 'right' || command === 'select') forward();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('joypad-dialog-command', onRemote);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('joypad-dialog-command', onRemote); };
  }, [step, steps.length, onClose]);

  return <div className="gt-overlay" role="dialog" aria-modal="true" aria-label={en ? 'Game tutorial' : 'Poradnik gry'}>
    <div className="gt-card" key={step}>
      <header><span className="os-eyebrow">{en ? `TUTORIAL · ${step + 1}/${steps.length}` : `PORADNIK · ${step + 1}/${steps.length}`}</span><button className="os-icon" onClick={onClose} aria-label={en ? 'Close' : 'Zamknij'}><X size={18} /></button></header>
      <StepArt art={current.art} />
      <h3>{current.title[en ? 'en' : 'pl']}</h3>
      <p>{current.text[en ? 'en' : 'pl']}</p>
      <footer>
        <div className="gt-dots" aria-hidden="true">{steps.map((s, i) => <i key={s.title.en} className={i === step ? 'is-on' : ''} />)}</div>
        <button className="gt-next" onClick={() => (step < steps.length - 1 ? setStep(step + 1) : onClose())}>
          {step < steps.length - 1 ? (en ? 'Next' : 'Dalej') : (en ? 'To the game' : 'Do gry')} <ArrowRight size={15} />
        </button>
      </footer>
    </div>
    <button className="gt-hint" onClick={onClose}><GraduationCap size={14} /> {en ? 'Replay this tutorial anytime from setup' : 'Poradnik wrócisz w każdej chwili z ekranu startu'}</button>
  </div>;
}
