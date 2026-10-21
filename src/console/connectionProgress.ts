import type { HostStatus, RelayState, SignalState } from '../net/padHost';

/**
 * Ile pokazać na mierniku Plamka, kiedy czekamy na łączność pokoju.
 *
 * Świadomie NIE jest to ułamek bajtów — to etap podawania ręki (sygnalizacja →
 * przekaźnik → gotowość), bo tylko tyle wiemy na pewno. Dzięki temu miernik
 * nigdy nie kłamie: pełne koło oznacza „pokój działa\", a nie „jeszcze chwila\".
 * Próby dołożą po 4%, ale sufit przed `ready` to 94% — bez udawanego końca.
 */
export interface LinkState {
  status: HostStatus;
  signal: SignalState;
  relay: RelayState;
  attempts: number;
}

/** `null` = nie pokazuj miernika (nie wiemy nic sensownego — wiruj jak zwykle). */
export function linkProgress({ status, signal, relay, attempts }: LinkState): number | null {
  if (status === 'error') return null;
  if (status === 'ready' && signal === 'online') return 1;
  let value = status === 'idle' ? .06 : .18;
  if (signal === 'lost') value = Math.max(value, .22);
  if (signal === 'connecting') value = Math.max(value, .3);
  if (signal === 'online') value = Math.max(value, .55);
  if (relay === 'connecting') value = Math.max(value, .68);
  if (relay === 'online') value = Math.max(value, .8);
  value += Math.min(.12, Math.max(0, attempts) * .04);
  return Math.min(.94, value);
}
