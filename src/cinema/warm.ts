/**
 * Rozgrzewka poradnika (runda 19).
 *
 * Zgłoszenie: „coś się za długo wczytuje ten poradnik”. Powód był prozaiczny —
 * wszystko, czego film potrzebuje, zaczynało się pobierać **w chwili kliknięcia**:
 * fragment JS z filmem, moduł kodu QR, okładki biblioteki, a potem nagrania.
 * Użytkownik patrzył na ekran ładowania w momentach, w których mógł już oglądać.
 *
 * Ta funkcja pobiera to samo, tylko wcześniej — wtedy, gdy człowiek i tak na coś
 * czeka: czyta pytanie „Chcesz zobaczyć krótki poradnik?” albo rozgląda się po
 * bibliotece. Nic nie renderuje i nic nie psuje: każde pobranie może się nie udać
 * (tryb prywatny, brak sieci), a film i tak załaduje swoje w swoim czasie.
 *
 * Wywołania (celowo nie na starcie aplikacji, żeby nie konkurować z pierwszym ekranem):
 *   • `Welcome.tsx` — gdy pojawia się pytanie o poradnik,
 *   • `ConsoleLibrary.tsx` — po ~1,5 s od pokazania biblioteki, żeby przycisk
 *     „Poradnik” w stopce i w Ustawieniach otwierał film natychmiast.
 */

import { GAMES } from '../arcade/catalog';

let warmed = false;

/** Czy rozgrzewka już poszła — używane przez testy i przez samą funkcję. */
export function isCinemaWarm(): boolean {
  return warmed;
}

export function warmCinema(): void {
  if (warmed) return;
  warmed = true;

  // 1. Fragment filmu (te same 17 kB gzip, które potem `lazy` i tak pobierze).
  void import('./Film').catch(() => { /* brak sieci — bramka fragmentu pokaże swoje */ });

  // 2. Generator kodu QR: scena parowania importuje go dynamicznie na starcie filmu.
  void import('qrcode').catch(() => { /* bez QR zostaje ramka i opis */ });

  // 3. Okładki biblioteki — scena 2 pokazuje sześć kafli, a bez rozgrzewki
  //    pojawiały się jedno po drugim w trakcie kadru. Razem ~0,65 MB, więc tanio.
  if (typeof Image === 'undefined') return;
  for (const game of GAMES) {
    const image = new Image();
    image.decoding = 'async';
    image.src = `${import.meta.env.BASE_URL}${game.cover}`;
  }
}
