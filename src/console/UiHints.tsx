import { useEffect, useRef } from 'react';
import { useUiContext, useUiEngineActive } from './uiContext';
import { useT } from '../platform/i18n';
import { useTvFullscreen } from './tvFullscreen';

/**
 * Podpowiedzi przycisków na dole ekranu — dokładnie te, które obowiązują teraz.
 * Pasek czyta kontekst powierzchni (`uiContext`), więc w okienku centrum pokoju
 * pokazuje inne X/Y niż w bibliotece, a gracz nigdy nie musi zgadywać.
 */
export function UiHints({ variant = 'footer' }: { variant?: 'footer' | 'sheet' }) {
  const { x, y } = useUiContext();
  const { t } = useT();
  const armed = useTvFullscreen() === 'armed';
  const mascot = useRef<HTMLSpanElement>(null);
  // Mini-Plamek kiwa na to samo, na co kiwa ten duży — ale bez re-rendera listy.
  useEffect(() => {
    const node = mascot.current;
    if (!node) return;
    let timer = 0;
    const react = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind !== 'select' && kind !== 'poke') return;
      node.classList.add('is-nod');
      window.clearTimeout(timer);
      timer = window.setTimeout(() => node.classList.remove('is-nod'), 320);
    };
    window.addEventListener('joypad-plamek', react);
    return () => { window.removeEventListener('joypad-plamek', react); window.clearTimeout(timer); };
  }, []);
  // Na telefonie pilot jest inny (dotykowy), więc pasek ze strzałkami byłby kłamstwem.
  if (!useUiEngineActive()) return null;
  return (
    <div className={variant === 'sheet' ? 'ui-hints ui-hints--sheet' : 'ui-hints'} aria-hidden="true">
      <span ref={mascot} className="plamek-mini" title={t('plamek.name')} aria-hidden="true"><i /><i /></span>
      <span className="ui-hint"><kbd>◀</kbd><kbd>▶</kbd><kbd>▲</kbd><kbd>▼</kbd>{t('uiHints.move')}</span>
      <span className="ui-hint"><kbd>A</kbd>{t('uiHints.select')}</span>
      <span className="ui-hint"><kbd>B</kbd>{t('uiHints.back')}</span>
      {x && <span className="ui-hint"><kbd className="is-xy">X</kbd>{x.label}</span>}
      {y && <span className="ui-hint"><kbd className="is-xy">Y</kbd>{y.label}</span>}
      {armed && <span className="ui-hint is-armed"><kbd>{t('uiHints.fullscreen')}</kbd>{t('fullscreen.armTitle')}</span>}
    </div>
  );
}
