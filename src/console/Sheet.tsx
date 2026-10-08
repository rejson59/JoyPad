import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useT } from '../platform/i18n';
import { Plamek } from './Plamek';
import { UiHints } from './UiHints';
import { collectNavItems, focusUiScope } from './focusSurface';
import { useWindowMorph } from './windowOrigin';

export function Sheet({ title, onClose, children, wide = false, variant = 'system', eyebrow = 'JOYPAD / SYSTEM', artwork }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean; variant?: 'system' | 'cinema'; eyebrow?: string; artwork?: string }) {
  const { t } = useT();
  const ref = useRef<HTMLDialogElement>(null);
  // Plamek i podpowiedzi muszą mieszkać wewnątrz dialogu: `::backdrop` modala
  // maluje ponad każdym elementem `fixed` poza nim, więc taki sam pasek obok byłby niewidzialny.
  const [ringHost, setRingHost] = useState<HTMLDialogElement | null>(null);
  const { collapse } = useWindowMorph(ref);
  // Rodzice podają zwykle funkcję tworzoną w renderze — czytamy ją przez ref, żeby
  // odświeżenie stanu (np. pad, który właśnie dołączył) nie zamykało i nie otwierało okna.
  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  const requestClose = useCallback(() => collapse(() => close.current()), [collapse]);

  // useLayoutEffect, nie useEffect: modal musi zdążyć się otworzyć przed pierwszą
  // klatką, inaczej widać przeskok z animacji wlotu (morfing mierzy się w mikrozadaniu).
  useLayoutEffect(() => {
    const node = ref.current; const previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    // Pad nie ma „pierwszego punktu" — wchodzimy do środka sami, inaczej pierwsze
    // naciśnięcie strzałki nie miałoby od czego odstartować. Startujemy za nagłówkiem,
    // żeby A nie zamknęło okna, zanim ktoś cokolwiek zobaczy.
    if (previous && !previous.closest('dialog')) {
      const body = node?.querySelector('.os-sheet-content > *:not(header)');
      const first = body ? collectNavItems(body as HTMLElement)[0] : null;
      if (first) first.el.focus({ preventScroll: true });
      else focusUiScope(node);
    }
    setRingHost(node);
    return () => { node?.close(); previous?.focus(); setRingHost(null); };
  }, []);
  // Ruch po okienku i zatwierdzanie należą do silnika interfejsu (`uiControl`) —
  // okno odbiera od pada tylko to, czego silnik nie załatwia: zamknięcie.
  useEffect(() => {
    const remote = (e: Event) => {
      const command = (e as CustomEvent<string>).detail;
      if (command === 'back' || command === 'home') requestClose();
    };
    window.addEventListener('joypad-dialog-command', remote);
    return () => window.removeEventListener('joypad-dialog-command', remote);
  }, [requestClose]);
  return <dialog ref={ref} data-ui-scope="sheet" className={`os-sheet lg-window ${wide ? 'os-sheet-wide' : ''} ${variant === 'cinema' ? 'cine-sheet' : ''}`} aria-label={title} onKeyDown={e => e.stopPropagation()} onCancel={e => { e.preventDefault(); requestClose(); }} onClick={e => { if (e.target === e.currentTarget) requestClose(); }}>
    {artwork && <div className="cine-sheet-art" aria-hidden="true"><img src={artwork} alt="" /><span /></div>}
    {ringHost && <Plamek scope={ringHost} />}
    <div className="os-sheet-content"><header><div><span className="os-eyebrow">{eyebrow}</span><h2>{title}</h2></div><button className="os-icon lg-pill" onClick={requestClose} aria-label={t('common.close')}><X size={20} /></button></header>{children}<UiHints variant="sheet" /></div>
  </dialog>;
}
