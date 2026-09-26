import { useEffect, useRef, useState } from 'react';
import { Check, ArrowRight, Gamepad2 } from 'lucide-react';
import { Joystick } from '../pad/Joystick';
import { padClient } from '../net/padClient';
import { padHost } from '../net/padHost';
import { usePadHost } from '../pad/PadHostPanel';
export function QuickPadTest({ color, onDone, onExplore }: { color: string; onDone: () => void; onExplore: () => void }) {
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
  return <div className="pad-quick-test"><header><Gamepad2 /><h1>Sprawdź pad</h1><p>Porusz gałką i naciśnij akcję. Odpowiedź zobaczysz na TV.</p><button onClick={onDone}>Gotowe / pomiń <ArrowRight size={18} /></button><button onClick={onExplore}>Sensory i haptyka</button></header>
    <Joystick color={color} size={170} zoneWidthPct={52} caption="PORUSZ GAŁKĄ" onChange={(x, y) => padClient.setInput({ dirX: x, dirY: -y, fwd: y, turn: x })} />
    <button className="pad-test-action" aria-label="Test akcji" aria-pressed={action} onPointerDown={e => { if (actionId.current !== null) return; actionId.current = e.pointerId; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* Window listener handles capture failures. */ } setAction(true); padClient.setInput({ fire: true }); }} onLostPointerCapture={() => { actionId.current = null; setAction(false); padClient.setInput({ fire: false }); }} onContextMenu={e => e.preventDefault()}>AKCJA</button>
  </div>;
}
export function QuickPadTestTV({ onClose, onExplore }: { onClose: () => void; onExplore: () => void }) {
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
  return <div className="os-quick-test" role="dialog" aria-label="Lab kontrolera"><header><div><span className="os-eyebrow">LAB KONTROLERA</span><h1>Jeden ruch. I wszystko jasne.</h1><p>Porusz gałką na telefonie, potem naciśnij akcję. Test nie wymaga sensorów ani wibracji.</p></div><button onClick={onClose}>Do biblioteki <ArrowRight size={18} /></button></header>
    {!host.pads.length && <p role="status">Połącz telefon, aby rozpocząć test. Możesz też wrócić i grać na klawiaturze.</p>}
    <div className="os-test-grid">{host.pads.map(p => { const sample = samples[p.connId]; return <section key={p.connId}><h2>{p.nick}</h2><div className="os-test-stick"><i style={{ transform: `translate(${(sample?.x || 0) * 55}px, ${(sample?.y || 0) * 55}px)` }} /></div><div className="os-test-fire" data-active={sample?.fire}>AKCJA {sample?.fire ? '●' : '○'}</div><p>{sample?.moved ? <Check size={18} /> : '○'} Ruch {sample?.moved ? 'sprawdzony' : '— porusz gałką'}</p><p>{sample?.pressed ? <Check size={18} /> : '○'} Akcja {sample?.pressed ? 'sprawdzona' : '— naciśnij przycisk'}</p></section>; })}</div>
    <footer><button onClick={onExplore}>Poznaj sensory i haptykę</button><span>Test jest opcjonalny. Wróć do biblioteki, kiedy chcesz.</span></footer>
  </div>;
}
