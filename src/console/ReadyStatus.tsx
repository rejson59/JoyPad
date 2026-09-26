import { readinessText } from './sessionSummary';
import { useEffect, useState } from 'react';
import { padHost } from '../net/padHost';
import { usePadHost } from '../pad/PadHostPanel';
export function ReadyStatus() {
  const host = usePadHost();
  const [cooldown, setCooldown] = useState(false);
  useEffect(() => { if (!cooldown) return; const t = window.setTimeout(() => setCooldown(false), 8000); return () => clearTimeout(t); }, [cooldown]);
  if (!host.pads.length) return null;
  return <div className="cine-ready-status"><p role="status">{readinessText(host.pads)}</p><small>Gospodarz może wystartować bez wszystkich potwierdzeń.</small>{host.pads.some(p => !p.ready) && <button disabled={cooldown} onClick={() => { padHost.remindReady(); setCooldown(true); }}>{cooldown ? 'Przypomnienie wysłane' : 'Przypomnij o gotowości'}</button>}</div>;
}
