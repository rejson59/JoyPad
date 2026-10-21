/**
 * Ekran dopasowany do okna (rundy 17–18) — „pomniejszaj, aż wszystko pasuje,
 * ale nie zostawiaj pustych pasów po bokach”.
 *
 * Historia tego pliku to historia dwóch zgłoszeń:
 *
 * 1. Runda 16 dała bibliotece sztywną wysokość `100dvh` z elastycznym wierszem —
 *    treść nie mieściła się, wiersz kurczył się poniżej swojej treści i elementy
 *    **nachodziły na siebie**.
 * 2. Runda 17 naprawiła to naturalnym układem i pomniejszaniem całości, ale skalowanie
 *    „w miejscu” zostawiało **czarne pasy po bokach** (pomniejszona treść nie zajmowała
 *    całej szerokości okna).
 *
 * Rozwiązanie: przy pomniejszaniu układ dostaje **szersze płótno** — dokładnie
 * `okno / skala` — więc po przeskalowaniu zajmuje pełną szerokość okna. `transform-origin`
 * jest w lewym górnym rogu, dzięki czemu skalowana treść zaczyna się w (0,0) i kończy
 * dokładnie na krawędzi okna: zero pasów, zero przycięcia.
 *
 * Trzy stany w `data-fit` na ramce:
 * - `full`   — treść mieści się bez zmian (skala 1, także przy drobnym nadmiarze < `FIT_SLACK_PX`);
 * - `scaled` — treść na szerszym płótnie, pomniejszona do okna, wyrównana do lewej góry;
 * - `scroll` — brakuje tak dużo, że pomniejszanie zabiłoby czytelność (< `minScale`);
 *              wtedy wraca przewijanie. To bezpiecznik, nie plan.
 *
 * Pomiar jest **jednoprzebiegowy** (jedno powtórzenie po poszerzeniu płótna, bez pętli):
 * `scrollWidth`/`scrollHeight` opisują układ, a `transform` układem nie rusza, więc
 * pomiar nie zależy od zastosowanej skali i nie „drga”.
 *
 * Ważne dla potomków: `transform` tworzy blok zawierający dla `position: fixed`, więc
 * wszystko, co ma być przyklejone do okna (arkusze, toasty, podpowiedź telefonu), musi
 * stać **poza** tym komponentem.
 */
import { useCallback, useEffect, useRef, type ReactNode } from 'react';

/** Poniżej tej skali lepiej pozwolić przewinąć niż pomniejszać tekst do nieczytelności. */
export const FIT_MIN_SCALE = .72;
/** Nadmiar mniejszy niż tyle pikseli traktujemy jako zmieszczenie (cienie, zaokrąglenia). */
export const FIT_SLACK_PX = 8;
/**
 * Górny limit płótna przy pomniejszaniu. Bez niego bardzo niski, a szeroki ekran
 * rozciągnąłby układ do absurdalnych szerokości (np. 6000 px) i popsuł proporcje.
 */
export const FIT_MAX_CANVAS_PX = 3200;

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
    const clear = (state: 'full' | 'scroll') => {
      if (content.style.width) content.style.width = '';
      if (content.style.transform) content.style.transform = '';
      box.dataset.fit = state;
    };

    // 1. Naturalny pomiar: `scroll*` czyta układ, nie to, co widać.
    content.style.width = '';
    const naturalWidth = Math.max(1, content.scrollWidth);
    const naturalHeight = Math.max(1, content.scrollHeight);
    if (naturalWidth <= availableWidth + FIT_SLACK_PX && naturalHeight <= availableHeight + FIT_SLACK_PX) {
      clear('full');
      return;
    }

    // 2. Skala „na oko”, a potem płótno o szerokości `okno / skala`: po pomniejszeniu
    //    treść zajmie pełną szerokość, więc nie zostaną żadne paski po bokach.
    const rough = Math.min(availableWidth / naturalWidth, availableHeight / naturalHeight);
    let fit = rough;
    if (rough >= minScale && rough < 1) {
      const canvas = Math.min(availableWidth / rough, FIT_MAX_CANVAS_PX);
      content.style.width = `${Math.round(canvas)}px`;
      const wideWidth = Math.max(1, content.scrollWidth);
      const wideHeight = Math.max(1, content.scrollHeight);
      fit = Math.min(availableWidth / wideWidth, availableHeight / wideHeight);
    }

    if (fit >= .995) { clear('full'); return }
    if (fit < minScale) { clear('scroll'); return }
    content.style.width = `${Math.round(Math.min(availableWidth / fit, FIT_MAX_CANVAS_PX))}px`;
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
