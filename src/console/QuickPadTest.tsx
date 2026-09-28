import { useEffect, useRef, useState } from 'react';
import { Check, ArrowRight, Gamepad2 } from 'lucide-react';
import { Joystick } from '../pad/Joystick';
import { padClient } from '../net/padClient';
import { padHost } from '../net/padHost';
import { usePadHost } from '../pad/PadHostPanel';
import { useT } from '../platform/i18n';
export function QuickPadTest({ color, onDone, onExplore }: { color: string; onDone: () => void; onExplore: () => void }) {
  const { t } = useT();
  const [action, setAction] = useState(false);
  const actionId = useRef<number | null>(null);
  useEffect(() => {
    const clear = () => { actionId.current = null; setAction(false); padClient.releaseInput(); };
    const end = (e: PointerEvent) => { if (e.pointerId === actionId.current) { actionId.current = null; setAction(false); padClient.setInput({ fire: false }); } };
    const safety = ['joypad-release-input', 'resize', 'orientationchange'] as const;
    safety.forEach(event => window.addEventListener(event, clear));
    window.addEventListener('pointerup', end); window.addEventListener('pointercancel', end);
    return () => { safety.forEach(event => window.removeEventListener(event, clear)); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end); padClient.releaseInput(); };
  }, []);
  return <div className="pad-quick-test"><header><Gamepad2 /><h1>{t('pad.quick.title')}</h1><p>{t('pad.quick.instruction')}</p><button onClick={onDone}>{t('pad.quick.skip')} <ArrowRight size={18} /></button><button onClick={onExplore}>{t('pad.quick.explore')}</button></header>
    <Joystick color={color} size={170} zoneWidthPct={52} caption={t('pad.quick.moveCaption')} onChange={(x, y) => padClient.setInput({ dirX: x, dirY: -y, fwd: y, turn: x })} />
    <button className="pad-test-action" aria-label={t('pad.quick.actionAria')} aria-pressed={action} onPointerDown={e => { if (actionId.current !== null) return; actionId.current = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Window listener handles capture failures. */ } setAction(true); padClient.setInput({ fire: true }); }} onLostPointerCapture={() => { actionId.current = null; setAction(false); padClient.setInput({ fire: false }); }} onContextMenu={e => e.preventDefault()}>{t('pad.quick.testedAction')}</button>
  </div>;
}
export function QuickPadTestTV({ onClose, onExplore }: { onClose: () => void; onExplore: () => void }) {
  const { t } = useT();
  const host = usePadHost();
  const [samples, setSamples] = useState<Record<string, { x: number; y: number; fire: boolean; moved: boolean; pressed: boolean }>>({});
  useEffect(() => {
    const t = window.setInterval(() => setSamples(previous => Object.fromEntries(host.pads.map(p => {
      const input = padHost.inputs[p.slot]; const x = input?.dirX || 0, y = input?.dirY || 0, fire = !!input?.fire;
      const old = previous[p.connId];
      return [p.connId, { x, y, fire, moved: !!old?.moved || Math.hypot(x, y) > .25, pressed: !!old?.pressed || fire }];
    }))), 50);
    return () => clearInterval(t);
  }, [host.pads]);
  return <div className="os-quick-test" role="dialog" aria-label={t('pad.quick.dialog')}><header><div><span className="os-eyebrow">{t('pad.quick.title')}</span><h1>{t('pad.quick.headline')}</h1><p>{t('pad.quick.tvInstruction')}</p></div><button onClick={onClose}>{t('pad.quick.backLibrary')} <ArrowRight size={18} /></button></header>
    {!host.pads.length && <p role="status">{t('pad.quick.noPhones')}</p>}
    <div className="os-test-grid">{host.pads.map(p => { const sample = samples[p.connId]; return <section key={p.connId}><h2>{p.nick}</h2><div className="os-test-stick"><i style={{ transform: `translate(${(sample?.x || 0) * 55}px, ${(sample?.y || 0) * 55}px)` }} /></div><div className="os-test-fire" data-active={sample?.fire}>{t('pad.quick.testedAction')} {sample?.fire ? '●' : '○'}</div><p>{sample?.moved ? <Check size={18} /> : '○'} {t('pad.quick.move')} {sample?.moved ? t('pad.quick.moveVerified') : t('pad.quick.movePrompt')}</p><p>{sample?.pressed ? <Check size={18} /> : '○'} {t('pad.quick.action')} {sample?.pressed ? t('pad.quick.actionVerified') : t('pad.quick.actionPrompt')}</p></section>; })}</div>
    <footer><button onClick={onExplore}>{t('pad.quick.exploreSensors')}</button><span>{t('pad.quick.optional')}</span></footer>
  </div>;
}
