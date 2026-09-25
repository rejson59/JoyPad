import type { CSSProperties } from 'react';
import { Smartphone } from 'lucide-react';

export interface JoinSplashData {
  nick: string;
  slot: number;
  color: string;
  key: number;
}

/**
 * Telewizor wita nowy telefon w pokoju: wielka karta z numerem slotu,
 * kolorem gracza i nickiem. Pojawia się i znika sama (animacja join-in,
 * rodzic odmontowuje po ~2.4 s).
 */
export function JoinSplash({ data }: { data: JoinSplashData | null }) {
  if (!data) return null;
  return (
    <div className="join-splash" aria-live="polite">
      <div key={data.key} className="join-splash-card" style={{ '--pc': data.color } as CSSProperties}>
        <div className="joy-kicker flex items-center justify-center gap-2 text-white/60">
          <Smartphone size={13} /> NOWY GRACZ W POKOJU
        </div>
        <div className="join-splash-num mt-3">{String(data.slot + 1).padStart(2, '0')}</div>
        <div className="joy-heading mt-2 text-2xl font-extrabold text-white sm:text-3xl">{data.nick}</div>
        <div className="joy-kicker mt-3 text-white/40">PRZYGOTUJ KCIUKI</div>
      </div>
    </div>
  );
}
