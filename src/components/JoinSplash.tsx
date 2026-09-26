import type { CSSProperties } from 'react';
import { Gamepad2 } from 'lucide-react';
export interface JoinSplashData { disconnected?: boolean; nick: string; slot: number; color: string; key: number }
/** Non-blocking join acknowledgement; never covers the centre of the game. */
export function JoinSplash({ data }: { data: JoinSplashData | null }) {
  return <div className="os-join-announcement" role="status" aria-live="polite" aria-atomic="true">
    {data && <div key={data.key} style={{ '--player-color': data.color } as CSSProperties}><Gamepad2 size={25} /><span><b>{data.nick}</b><small>{data.disconnected ? `Pad ${data.slot + 1} rozłączony · Czekamy na powrót` : `Pad ${data.slot + 1} połączony · Miło Cię widzieć`}</small></span></div>}
  </div>;
}
