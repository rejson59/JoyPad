import { Component, type ErrorInfo, type ReactNode } from 'react';
import { loadLanguage } from '../platform/i18n';

/**
 * Ostatnia linia obrony interfejsu.
 *
 * Dlaczego to istnieje: React 19 po nieprzechwyconym błędzie (w renderze albo
 * w efekcie) wymontowuje CAŁE drzewo. Bez granicy błędów użytkownik zostaje
 * z pustą stroną na ciemnym tle — czyli z „czarnym ekranem", bez żadnej wskazówki,
 * co się stało. Ta granica zamienia taki stan w czytelny komunikat z treścią błędu,
 * przyciskiem odświeżenia i powrotem do biblioteki.
 *
 * Są tu dwie warstwy:
 *  1. `AppErrorBoundary` — błędy w interfejsie (render, efekty, zdarzenia Reacta).
 *  2. `installStartupGuard()` — błędy zanim React w ogóle wystartuje (np. wyjątek
 *     w module podczas importu). Wtedy nie ma czego łapać drzewem, więc po chwili
 *     sprawdzamy, czy `#root` na pewno ma treść, i w razie potrzeby pokazujemy
 *     diagnozę wprost w tym elemencie.
 */

const copy = {
  pl: {
    kicker: 'JOYPAD · PROBLEM',
    title: 'Interfejs się zatrzymał',
    body: 'Odświeżenie zwykle wystarcza — sesja telefonów działa dalej. Jeśli problem wraca, wyślij komu trzeba treść błędu poniżej.',
    reload: 'Odśwież',
    home: 'Wróć do biblioteki',
    details: 'Treść błędu',
    stuck: 'JoyPad nie wystartował',
    stuckBody: 'Coś przerwało start interfejsu. Treść błędu poniżej bardzo pomaga w naprawie.',
  },
  en: {
    kicker: 'JOYPAD · PROBLEM',
    title: 'The interface stopped',
    body: 'A refresh usually fixes this — your phone session keeps running. If it comes back, share the error text below.',
    reload: 'Refresh',
    home: 'Back to library',
    details: 'Error details',
    stuck: 'JoyPad did not start',
    stuckBody: 'Something interrupted the interface start. The error text below helps a lot.',
  },
} as const;

function text() {
  return copy[loadLanguage() === 'en' ? 'en' : 'pl'];
}

/** Wspólny wygląd panelu błędu — ciemny, spokojny, bez migającego alarmu. */
function Panel({ error, stuck = false, onHome }: { error: string; stuck?: boolean; onHome?: () => void }) {
  const t = text();
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#0a0c0d] px-6 py-10 text-center text-white">
      <div className="joy-kicker text-amber-300">{t.kicker}</div>
      <h1 className="joy-heading mt-3 text-3xl font-bold">{stuck ? t.stuck : t.title}</h1>
      <p className="mt-3 max-w-lg text-sm leading-relaxed text-zinc-400">{stuck ? t.stuckBody : t.body}</p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => window.location.reload()} className="rounded-xl bg-orange-500 px-6 py-3 text-sm font-black text-[#17120d] hover:bg-orange-400">
          {t.reload}
        </button>
        {onHome && (
          <button type="button" onClick={onHome} className="rounded-xl border border-white/20 px-6 py-3 text-sm font-bold text-zinc-200 hover:border-white/40">
            {t.home}
          </button>
        )}
      </div>
      <details className="mt-8 w-full max-w-2xl text-left" open={stuck}>
        <summary className="cursor-pointer text-xs font-bold tracking-widest text-zinc-500 uppercase">{t.details}</summary>
        <pre className="mt-3 max-h-64 overflow-auto rounded-xl border border-white/10 bg-black/50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-amber-200/90 select-text">
          {error || '(brak treści — sprawdź konsolę przeglądarki: F12)'}
        </pre>
      </details>
    </div>
  );
}

interface AppErrorBoundaryState { error: Error | null; stack: string }

export class AppErrorBoundary extends Component<{ children: ReactNode }, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Błąd interfejsu JoyPad:', error, info.componentStack);
    this.setState({ stack: info.componentStack ?? '' });
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;
    const detail = [error.message, stack.trim().split('\n').slice(0, 6).join('\n')].filter(Boolean).join('\n\n');
    return (
      <Panel
        error={detail}
        onHome={() => { window.location.hash = ''; window.location.reload(); }}
      />
    );
  }
}

/**
 * Start bez Reacta: jeśli import modułów padnie, drzewa nie ma i granica błędów
 * nie zadziała. Wtedy po starcie okna sprawdzamy, czy `#root` ma treść, i pokazujemy
 * diagnozę wprost. Działa też dla błędów zgłoszonych zanim React się zamontował.
 */
export function installStartupGuard() {
  try {
    const seen: string[] = [];
    const record = (what: string, value: unknown) => {
      const message = value instanceof Error ? `${value.name}: ${value.message}` : String(value ?? '');
      seen.push(`${what}: ${message}`);
    };
    window.addEventListener('error', event => record('window.error', event.error ?? event.message));
    window.addEventListener('unhandledrejection', event => record('unhandledrejection', event.reason));

    const check = () => {
      const root = document.getElementById('root');
      // Interfejs wystartował — nic nie robimy, błędy i tak zgłosi granica błędów.
      if (!root || root.childElementCount > 0) return;
      const t = text();
      try { root.dispatchEvent(new Event('joypad-crashed')) } catch { /* bez zdarzenia też damy radę */ }
      root.innerHTML = '';
      const holder = document.createElement('div');
      holder.innerHTML = `
        <div style="min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#0a0c0d;color:#fff;font:15px/1.6 system-ui,sans-serif;text-align:center;padding:40px 24px">
          <div style="letter-spacing:.42em;font-weight:800;font-size:12px;color:#f6ad55">${t.kicker}</div>
          <h1 style="margin:12px 0 0;font-size:28px">${t.stuck}</h1>
          <p style="max-width:520px;color:#9ca3af;margin:12px 0 0">${t.stuckBody}</p>
          <button type="button" onclick="location.reload()" style="margin-top:24px;padding:12px 24px;border:0;border-radius:12px;background:#f97316;color:#17120d;font-weight:900;font-size:14px;cursor:pointer">${t.reload}</button>
          <pre style="max-width:720px;width:100%;margin-top:28px;padding:16px;border:1px solid rgba(255,255,255,.12);border-radius:12px;background:rgba(0,0,0,.5);color:#fde68a;font:12px/1.6 ui-monospace,monospace;text-align:left;white-space:pre-wrap;max-height:260px;overflow:auto">${(seen.join('\n') || 'Brak zgłoszonych błędów — sprawdź konsolę przeglądarki: F12').replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch] ?? ch))}</pre>
        </div>`;
      root.appendChild(holder);
    };
    // Reagujemy na błąd od razu, ale też sprawdzamy po fakcie — moduły mogą paść cicho.
    window.addEventListener('error', () => window.setTimeout(check, 50));
    window.addEventListener('unhandledrejection', () => window.setTimeout(check, 50));
    window.setTimeout(check, 4000);
    window.setTimeout(check, 10000);
  } catch {
    /* jeśli nawet strażnik padnie, zostaje czysty start aplikacji */
  }
}
