/**
 * Bramka leniwych fragmentów (runda 16).
 *
 * `React.lazy` przy pierwszym wejściu pobiera osobny plik JS (film, pad, gra).
 * Dwie rzeczy potrafiły tu zepsuć wrażenie „nie wszystko się ładuje”:
 *
 * 1. **Wygląd ładowania.** `fallback={null}` znaczył czarną pustkę — na telewizorze
 *    wyglądało to jak zawieszona aplikacja. Teraz w tym miejscu jest znak JoyPada
 *    i cichy komunikat, więc czekanie jest widoczne i zrozumiałe.
 * 2. **Nieudany transfer.** Gdy pobranie fragmentu się nie powiedzie (chwilowa sieć,
 *    przerwane pobieranie), `lazy` pamięta odrzuconą obietnicę i ekran zostaje pusty
 *    już na zawsze. Bramka łapie błąd i próbuje jeszcze raz ze świeżym `lazy`
 *    (czyli nowym żądaniem); po wyczerpaniu prób pokazuje „Spróbuj ponownie”.
 *
 * Kod jest wspólny dla filmu, ekranu pada i gier — każde nowe leniwe ekrany w JoyPadzie
 * wystarczy owinąć tą samą bramką.
 */
import { Component, Suspense, lazy, useCallback, useState, type ComponentType, type ReactNode } from 'react';
import { RotateCcw } from 'lucide-react';
import { PlamekOrbit } from '../console/PlamekOrbit';
import { useT } from '../platform/i18n';

export type ChunkLoader<P> = () => Promise<{ default: ComponentType<P> }>;

interface BoundaryProps {
  children: ReactNode;
  label: string;
  retryLabel: string;
  /** Czy wolno jeszcze spróbować automatycznie (inaczej pokazujemy przycisk). */
  autoRetry: boolean;
  onFailure: () => void;
  onManualRetry: () => void;
}

interface BoundaryState { failed: boolean }

/** Łapie błąd pobierania fragmentu; decyzję „ponów czy pokaż przycisk” oddaje bramce. */
class ChunkBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };
  static getDerivedStateFromError(): Partial<BoundaryState> { return { failed: true } }
  componentDidCatch(error: unknown) {
    if (import.meta.env.DEV) console.warn('[chunk]', error);
    // Automatyczna próba: nowy `lazy` = nowe żądanie. Bez tego odrzucona obietnica
    // zostawała w pamięci i ekran był pusty do końca życia aplikacji.
    if (this.props.autoRetry) this.props.onFailure();
  }
  componentDidUpdate(previous: BoundaryProps) {
    // Nowa próba = nowy element potomny (świeży `lazy`) → czyścimy stan błędu.
    if (previous.children !== this.props.children && this.state.failed) this.setState({ failed: false });
  }
  render() {
    const { failed } = this.state;
    const { children, autoRetry, label, retryLabel, onManualRetry } = this.props;
    if (!failed) return <Pending child={children} />;
    if (autoRetry) return <View label={label} note />;
    return <View label={label} retryLabel={retryLabel} onRetry={onManualRetry} />;
  }
}

/** Suspense z widocznym znakiem ładowania zamiast czarnej pustki. */
function Pending({ child }: { child: ReactNode }) {
  const { t } = useT();
  return <Suspense fallback={<View label={t('common.loadingChunk')} />}>{child}</Suspense>;
}

function View({ label, retryLabel, onRetry, note = false }: { label: string; retryLabel?: string; onRetry?: () => void; note?: boolean }) {
  return (
    <div className="chunk-gate" role="status">
      <PlamekOrbit size={46} />
      <p>{label}{note ? ' …' : ''}</p>
      {onRetry && retryLabel ? (
        <button type="button" className="lg-pill is-primary" onClick={onRetry}>
          <RotateCcw size={16} /> {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

/**
 * `loader` ładuje fragment, `children` dostaje gotowy komponent (bez `Suspense`).
 * Po `maxAttempts` automatycznych próbach bramka oddaje decyzję człowiekowi.
 */
export function ChunkGate<P>({ loader, children, maxAttempts = 2 }: { loader: ChunkLoader<P>; children: (Component: ComponentType<P>) => ReactNode; maxAttempts?: number }) {
  const { t } = useT();
  const [attempt, setAttempt] = useState(0);
  const [Component, setComponent] = useState<ComponentType<P>>(() => lazy(loader));
  const autoRetry = attempt < maxAttempts;
  const reload = useCallback(() => { setAttempt(current => current + 1); setComponent(() => lazy(loader)); }, [loader]);
  return (
    <ChunkBoundary
      label={t('common.loadingChunk')}
      retryLabel={t('common.retry')}
      autoRetry={autoRetry}
      onFailure={reload}
      onManualRetry={reload}
    >
      {children(Component)}
    </ChunkBoundary>
  );
}
