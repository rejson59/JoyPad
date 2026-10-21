/**
 * Blok „WSPÓLNY EKRAN": co telewizor pokazuje osobom, które chcą dołączyć telefonem.
 *
 * Widoczność kodu jest ustawieniem administratora pokoju (`room.pairing`), a nie
 * stanem połączenia — QR zostaje na ekranie również wtedy, gdy ekipa już dołączyła,
 * bo na kanapie zwykle ktoś dochodzi w trakcie zabawy.
 */
export type PairingMode = 'qr' | 'connecting' | 'hidden';

export function pairingMode(ready: boolean, pairingEnabled: boolean): PairingMode {
  if (!pairingEnabled) return 'hidden';
  return ready ? 'qr' : 'connecting';
}
