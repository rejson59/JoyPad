/**
 * Ekran dopasowany do okna (runda 17) — „pomniejszaj, aż wszystko pasuje”.
 *
 * Zgłoszenie z przeglądu: *„teraz elementy najeżdżają na siebie! Napraw to żeby się
 * dostosowywały do ekranu i np. pomniejszały tak żeby wszystko pasowało”*. Poprzednia
 * próba (runda 16) dała bibliotece **sztywną wysokość** `100dvh` z elastycznym wierszem
 * `minmax(0, 1fr)`: gdy treść nie mieściła się w oknie, wiersz kurczył się poniżej swojej
 * treści, a nadmiar malował się NA kafelkach i stopce. Sztywna wysokość + elastyczny
 * wiersz = nakładanie się elementów, zawsze.
 *
 * Tutaj jest odwrotnie: **układ jest naturalny** (nic nie jest ściskane ani przycinane),
 * a gdy treść jest wyższa od okna, całość zmniejsza się transformacją, aż wejdzie.
 * Trzy stany widoczne w `data-fit` na ramce:
 *
 * - `full`   — treść mieści się bez zmian (skala 1);
 * - `scaled` — treść pomniejszona o policzony współczynnik, wyśrodkowana w poziomie;
 * - `scroll` — miejsca brakuje tak bardzo, że pomniejszanie zabiłoby czytelność
 *              (poniżej `minScale`); wtedy wraca przewijanie. To bezpiecznik, nie plan.
 *
 * Skalowanie jest **jednoprzebiegowe**, więc nie ma pętli sprzężenia: `scrollWidth`
 * i `scrollHeight` opisują układ, a `transform: scale()` nie zmienia układu, więc pomiar
 * nie zależy od zastosowanej skali i nie oscyluje (efekt „drgającej” skali byłby gorszy
 * niż sam problem).
 *
 * Ważne dla potomków: `transform` tworzy blok zawierający dla `position: fixed`, więc
 * wszystko, co ma być przyklejone do okna (arkusze, toasty, podpowiedź telefonu), musi
 * stać **poza** tym komponentem. W bibliotece tak właśnie jest: skalowana jest treść,
 * a okna systemowe renderują się obok.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';

/** Poniżej tej skali lepiej pozwolić przewinąć niż pomniejszać tekst do nieczytelności. */
export const FIT_MIN_SCALE = .72;

export interface FitScreenProps {
  children: ReactNode;
  /** Dodatkowa klasa na ramce (ekrany mają różne tła i promienie). */
  className?: string;
  /** Dolna granica pomniejszania — ekrany z drobnym tekstem mogą chcieć wyższą. */
  minScale?: number;
  /** Etykieta dla testów i czytników: co jest skalowane. */
  label?: string;
}

export function FitScreen({ children, className = '', minScale = FIT_MIN_SCALE, label }: FitScreenProps) {
  const frame = useRef<HTMLDivElement>(null);
  const scaler = useRef<HTMLDivElement>(null);
  const pending = useRef(0);

  const measure = useCallback(() => {
    const box = frame.current;
    const content = scaler.current;
    if (!box || !content) return;
    const availableWidth = Math.max(1, box.clientWidth);
    const availableHeight = Math.max(1, box.clientHeight);
    // `scroll*` czyta układ, a nie to, co widać — dlatego mierzymy naturalny rozmiar treści,
    // niezależnie od już zastosowanej skali.
    const neededWidth = Math.max(1, content.scrollWidth);
    const neededHeight = Math.max(1, content.scrollHeight);
    const fit = Math.min(availableWidth / neededWidth, availableHeight / neededHeight);

    if (fit >= .995) {
      if (content.style.transform) content.style.transform = '';
      box.dataset.fit = 'full';
      return;
    }
    if (fit < minScale) {
      // Treść jest zbyt duża, żeby pomniejszanie miało sens — zostaje przewijanie
      // (nic nie nachodzi na siebie, bo układ pozostaje naturalny).
      if (content.style.transform) content.style.transform = '';
      box.dataset.fit = 'scroll';
      return;
    }
    content.style.transform = `scale(${Number(fit.toFixed(4))})`;
    box.dataset.fit = 'scaled';
  }, [minScale]);

  useEffect(() => {
    const schedule = () => {
      if (pending.current) return;
      const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (callback: FrameRequestCallback) => window.setTimeout(() => callback(0), 16);
      pending.current = raf(() => { pending.current = 0; measure() }) as unknown as number;
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (observer) {
      if (frame.current) observer.observe(frame.current);
      if (scaler.current) observer.observe(scaler.current);
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
    // Czcionki nagłówków dochodzą po pierwszym malowaniu — po ich wczytaniu układ się zmienia.
    try { void document.fonts?.ready?.then(schedule) } catch { /* brak Font Loading API */ }
    const timer = window.setTimeout(schedule, 400);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
      window.clearTimeout(timer);
      if (pending.current) cancelAnimationFrame(pending.current);
    };
  }, [measure]);

  return (
    <div ref={frame} className={`fit-frame ${className}`.trim()} data-fit="full" data-fit-label={label}>
      <div ref={scaler} className="fit-scale">{children}</div>
    </div>
  );
}
