/**
 * Polityka ważności klucza dołączania (tego, który niesie kod QR).
 *
 * Klucz wymyśliliśmy po to, by nie każdy, kto podsłucha kod pokoju, mógł wejść do
 * gry. Sam w sobie jest jednak zaproszeniem, które leży na ekranie godzinami — więc
 * musi się starzeć. Haczyk: telefon, który zdążył zeskanować, ale wciąż klika
 * „dołącz", nie może zostać odproszony, dlatego stary klucz jest przyjmowany
 * jeszcze przez krótką chwilę po wymianie.
 */
export const JOIN_TOKEN_TTL_MS = 10 * 60_000;
export const JOIN_TOKEN_GRACE_MS = 90_000;

export function joinTokenExpired(issuedAt: number, now: number, ttlMs = JOIN_TOKEN_TTL_MS) {
  return issuedAt > 0 && now - issuedAt >= ttlMs;
}

export function joinTokenAccepted(
  token: unknown,
  current: string,
  previous: string,
  issuedAt: number,
  now: number,
  graceMs = JOIN_TOKEN_GRACE_MS,
) {
  if (!current || typeof token !== 'string' || !token) return false;
  if (token === current) return true;
  return !!previous && token === previous && now - issuedAt < graceMs;
}
