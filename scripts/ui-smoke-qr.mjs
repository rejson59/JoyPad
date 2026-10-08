/**
 * Atrapa generatora QR na czas testu dymnego interfejsu (`npm run selftest:ui`).
 *
 * Prawdziwa paczka `qrcode` generuje obraz; testowi wystarczy poprawny adres data URL,
 * żeby ekran parowania przeszedł do stanu „kod gotowy”. Ten sam powód, co przy
 * `ui-smoke-peer.mjs`: interfejs tak, sieć i rasteryzacja nie.
 */
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

export function toDataURL() { return PNG; }
export function toString() { return ''; }
export default { toDataURL, toString };
