import { WifiOff } from 'lucide-react';
import { useT } from '../platform/i18n';
import { PlamekOrbit } from '../console/PlamekOrbit';

/**
 * QR w ramce skanera: narożne wsporniki + dryfująca linia skanowania.
 * `size` to rozdzielczość rastra; `fit` oddaje rozmiar ekranu arkuszowi stylów,
 * dzięki czemu kod na telewizorze 4K jest duży, a na telefonie mieści się w karcie.
 */
export function QrFrame({
  src, size = 176, loadingLabel, fit = false, progress = null,
}: {
  src: string;
  size?: number;
  loadingLabel?: string;
  fit?: boolean;
  /** 0..1 — etap podawania ręki; `null` oznacza „nie wiemy ile" (zwykłe kręcenie). */
  progress?: number | null;
}) {
  const { t } = useT();
  const fluid = fit ? { width: '100%', height: 'auto' } as const : { width: size, height: size };
  return (
    <div className={`qr-frame ${fit ? 'is-fit' : ''}`} style={fit ? undefined : { width: size + 20, height: size + 20 }}>
      <span className="qr-corner qr-corner-tl" />
      <span className="qr-corner qr-corner-tr" />
      <span className="qr-corner qr-corner-bl" />
      <span className="qr-corner qr-corner-br" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="qr-scanline pointer-events-none absolute inset-x-2 top-0 h-10 bg-gradient-to-b from-transparent via-orange-300/25 to-transparent" />
      </div>
      {src ? (
        <img src={src} alt={t('qr.alt')} width={size} height={size} className="relative z-10 block" style={fluid} />
      ) : (
        <div className="relative z-10 flex items-center justify-center" style={fit ? { aspectRatio: '1' } : { width: size, height: size }}>
          <PlamekOrbit size={fit ? 56 : 40} progress={progress} />
          <span className="sr-only">{loadingLabel ?? t('qr.loading')}</span>
        </div>
      )}
    </div>
  );
}

/** Faded frame for a QR that cannot be generated because there is no server. */
export function QrFrameError({ size = 176 }: { size?: number }) {
  return (
    <div className="qr-frame opacity-70" style={{ width: size + 20, height: size + 20 }}>
      <span className="qr-corner qr-corner-tl" />
      <span className="qr-corner qr-corner-tr" />
      <span className="qr-corner qr-corner-bl" />
      <span className="qr-corner qr-corner-br" />
      <div className="relative z-10 flex items-center justify-center" style={{ width: size, height: size }}>
        <WifiOff className="h-9 w-9 text-red-400/80" />
      </div>
    </div>
  );
}
