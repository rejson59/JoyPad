import { ORBIT_ECHOS } from './plamek';

/**
 * Plamek w ładowaniu: kulka ze smugą biegnąca po kole.
 *
 * Osobny plik, bez żadnych zależności od nawigacji — korzystają z niego także ekrany
 * shared z telefonem (`QrFrame`, `BootSplash`), a ich bundle nie ma po co ciągnąć
 * `focusSurface` ani `uiControl`. Sama animacja jest w CSS (console.css): zerowy koszt
 * JS, a `html[data-motion="reduced"]` i `prefers-reduced-motion` zatrzymują orbitę
 * bez utraty informacji — obok zawsze jest tekst stanu.
 *
 * `label` robi z kuli figurę z nazwą (screener czyta ją raz), bez niego to dekoracja.
 * `progress` (0..1) przełącza orbitę z „kręcę się" na „wiem, ile zostało" — kulka
 * jedzie po łuku wypełnionej tarczy, a `role=progressbar` podaje procent. Bez
 * `progress` wskaźnik jest nieokreślony, bo nie ma czego mierzyć.
 */
export function PlamekOrbit({ size = 46, label, progress = null }: { size?: number; label?: string; progress?: number | null }) {
  const metered = typeof progress === 'number' && Number.isFinite(progress);
  const value = metered ? Math.max(0, Math.min(1, progress)) : null;
  const style = { width: size, height: size, '--orbit-size': `${size}px`, '--progress': String(value ?? 0) } as React.CSSProperties;
  return (
    <span
      className={`plamek-orbit ${value === null ? '' : 'is-metered'}`}
      style={style}
      role={value === null ? (label ? 'img' : undefined) : 'progressbar'}
      aria-label={label}
      aria-valuenow={value === null ? undefined : Math.round(value * 100)}
      aria-valuemin={value === null ? undefined : 0}
      aria-valuemax={value === null ? undefined : 100}
      aria-hidden={value === null && !label ? 'true' : undefined}
    >
      <i className="plamek-orbit-track" />
      {ORBIT_ECHOS.map((lag, index) => (
        <i
          key={lag}
          className="plamek-orbit-echo"
          style={{ '--echo-lag': `${-lag * 9}ms`, '--echo-alpha': String(.34 - index * .06), '--echo-scale': String(1 - index * .13) } as React.CSSProperties}
        />
      ))}
      <span className="plamek-orbit-run">
        <i className="plamek-orbit-ball">
          <i className="plamek-eye is-left" />
          <i className="plamek-eye is-right" />
          <i className="plamek-mouth" />
        </i>
      </span>
    </span>
  );
}
