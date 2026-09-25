import { LoaderCircle, WifiOff } from 'lucide-react';

/**
 * QR w ramce skanera: narożne wsporniki + dryfująca linia skanowania.
 * Zastępuje surowy biały kwadrat w centrum połączeń i panelu pada.
 */
export function QrFrame({
  src, size = 176, loadingLabel = 'Generuję kod…',
}: {
  src: string;
  size?: number;
  loadingLabel?: string;
}) {
  return (
    <div className="qr-frame" style={{ width: size + 20, height: size + 20 }}>
      <span className="qr-corner qr-corner-tl" />
      <span className="qr-corner qr-corner-tr" />
      <span className="qr-corner qr-corner-bl" />
      <span className="qr-corner qr-corner-br" />
      <div className="absolute inset-0 overflow-hidden">
        <div className="qr-scanline pointer-events-none absolute inset-x-2 top-0 h-10 bg-gradient-to-b from-transparent via-orange-300/25 to-transparent" />
      </div>
      {src ? (
        <img src={src} alt="Kod QR do podłączenia telefonu" width={size} height={size} className="relative z-10 block" style={{ width: size, height: size }} />
      ) : (
        <div className="relative z-10 flex items-center justify-center" style={{ width: size, height: size }}>
          <LoaderCircle className="h-8 w-8 animate-spin text-orange-500" />
          <span className="sr-only">{loadingLabel}</span>
        </div>
      )}
    </div>
  );
}

/** Wariant dla błędu (np. brak sygnalizacji) — te same wsporniki, wygaszone. */
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
