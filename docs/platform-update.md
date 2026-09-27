# JoyPad OS 02 — ekipa, kontrola i Moments

## Co zmieniło się dla graczy

- **Nowy uśmiech JoyPada.** Wybrany koncept PNG jest w `public/images/joypad-logo-concept.png`. Lekka adaptacja wektorowa `public/brand/joypad-mark.svg` obsługuje markę w bibliotece, boot, wyniki i telefon. Ikony PWA/iOS również używają tego znaku. SVG jest adaptacją konceptu do małych rozmiarów, nie automatycznie zwektoryzowanym plikiem źródłowym generatora.
- **Centrum pokoju.** Na TV przycisk „Pokój”, na telefonie administratora „Centrum pokoju” (pion) lub „Pokój”/„ADMIN” (poziom). Zamykanie wejścia, włączanie propozycji, ekran przerwy, przekazanie roli i odłączenie telefonu. Dwie ostatnie operacje wymagają potwierdzenia. Host na TV nigdy nie traci swoich uprawnień.
- **Ekran przerwy.** Działa poza aktywną rundą, zasłania ekran przy zachowaniu połączeń. Przywracany przyciskiem na TV, przełącznikiem admina lub OK/A/Wstecz/Home pilota. Start rundy zawsze go wyłącza. To zasłona prezentacyjna, nie zabezpieczenie prywatnych danych i nie systemowy wygaszacz TV. Nie wycisza muzyki; dźwięk ma istniejący osobny przełącznik.
- **Propozycje już w bibliotece.** Każdy połączony telefon wybiera jeden dostępny tytuł; drugie naciśnięcie cofa głos. Lista głosujących jest na telefonach i TV. Zatwierdza gospodarz — większość nie uruchamia gry automatycznie. Propozycje działają w bibliotece i po rundzie, nie w trakcie gry. Zmiana etapu/konfiguracji czyści intencje zgodnie z dotychczasowym protokołem.
- **Player Pass.** Sześć wektorowych awatarów, cztery motywy poczekalni, edycja nicku bez rozłączania. Profil zapisuje się lokalnie, o ile przeglądarka pozwala; awatar jest przesyłany do pokoju. Motyw nie zmienia kolorów drużyn/slotów w silnikach. „Mój Player Pass”/„Mój profil” otwiera personalizację.
- **Dwa układy, nie rozciągnięta kolumna.** Pionowy admin ma pilot z OK i nawigacją. Poziomy admin ma krzyżak po lewej, centralny wyświetlacz i fizycznie stylizowane A/B po prawej. W menu oba wysyłają komendy menu, nigdy input jazdy/strzału. Start gry nadal przełącza na dedykowany kontroler silnika. Uczestnicy bez roli admina widzą poczekalnię, nie aktywne przyciski sterowania TV.
- **Szklane powiadomienia.** Dołączenie/opuszczenie pokoju, gotowość, propozycje, nowy admin i zmiany zasad. Maksymalnie trzy pigułki, zamknięcie ręczne, automatyczne znikanie po 5 sekundach, `aria-live`, respektowanie ograniczonego ruchu. Pigułki nie przechwytują dotyku poza własnym obszarem. Dialog systemowy przeglądarki ma pierwszeństwo nad powiadomieniem.
- **Moments Video.** Do trzech krótkich powtórek wideo po rundzie, czas akcji, gracz i odtwarzacz. Pauza, przewijanie, tempo 0,5× i pobranie samodzielnego pliku WebM/MP4. W wynikach strzałki pilota wybierają Moments i akcje, OK/A otwiera, Wstecz zamyka kartę. Osobny przycisk rewanżu na pionowym pilocie nadal wysyła jednoznaczne `restart`.

## Co dokładnie znaczy Moments w tej wersji

To **prawdziwe lokalne nagrania obrazu silnika**, a nie okładki ani rekonstrukcja akcji. TV nagrywa do 1280×720 przy limicie 24 klatek/s, bez dźwięku. Nagrywanie nie korzysta z kamery, mikrofonu, `getDisplayMedia` ani wysyłania plików na serwer. Nie przechwytuje całego pulpitu ani systemowych nakładek/DOM HUD; przechwytuje scenę i canvas HUD Orbitalnej Fali.

Każde okno ma własny MediaRecorder i kompletny nagłówek — nie kroimy strumienia na niedekodowalne fragments. Okna około 12 s ruszają co 6 s, najwyżej dwa enkodery jednocześnie. Zdarzenie wybiera okno z około 3–9 sekundami przed i po akcji; początek/koniec rundy i wolne klatki mogą zmienić ten zakres. Pauza, countdown i ukryta karta nie wydłużają zegara nagrania. Trzymamy okna najlepszych akcji i krótki ogon bufora; limit zakodowanych chunków to 32 MiB (nie jest to limit całej pamięci przeglądarki/GPU). Przy przekroczeniu limitu lub błędzie kodeka gra działa dalej, a UI wyjaśnia brakujące klipy.

WebM ma naprawiane metadane długości (`fix-webm-duration`, bez transkodowania), więc można przewijać i pobrać **cały samodzielny klip**, nie pełną rundę. Jedna akcja może współdzielić okno nagrania z inną. Powtórki znikają po rozpoczęciu kolejnej rundy lub wyjściu z gry; przedtem można je pobrać. Ustawienia systemu TV → „Nagrywanie Moments” wyłącza nagrywanie od kolejnej rundy. Obsługa jest wykrywana przez `captureStream`, `MediaRecorder` i dostępny kodek (VP8/VP9 WebM lub MP4). Brak obsługi pokazuje wyraźnie „opis akcji · bez wideo”, nigdy fałszywe nagranie.

Szczegóły i testy: [moments-video.md](moments-video.md).

`MomentRecorder` jest tworzony na rundę. Obserwuje HUD, zdarzenia FX oraz opcjonalne `RoundConfig.onMoment`. Dostępne gry mają działającą integrację:

| Gra | Źródła wyróżnień |
|---|---|
| Stalowy Front | eliminacje, szybkie serie, zmiana lidera punktowego, przejęte bonusy; dokładne dane eliminacji z `onKill` |
| Orbitalna Fala | zestrzelenia, serie i bonusy zgłoszone przez silnik; **bez** fikcyjnego „lidera” w grze kooperacyjnej |
| Neonowy Pęd | wzrost liczby okrążeń i zebrane bonusy; **bez** wymyślonych wyprzedzeń na podstawie samych punktów |

Czas pochodzi z postępu czasu rundy; HUD jest próbkowany, więc znacznik FX może mieć dokładność interwału HUD-u. Seria oznacza kolejne eliminacje danego gracza z przerwami nie większymi niż 12 sekund (nie jest to obietnica „bez śmierci”). Zdarzenia są ważone, a bliskie akcje tego samego gracza deduplikowane. Bufor ma 64 wpisy, wynik maksymalnie 3. Bez zdarzeń pokazujemy uczciwy pusty stan. Ten mechanizm nie gwarantuje, że każda runda da trzy ciekawe akcje.

Nowe silniki muszą też wywoływać opcjonalny `RoundConfig.onFrame(canvas, overlay?)` synchronicznie po renderze, zanim przeglądarka wyczyści WebGL. Mogą zgłaszać konkretne akcje przez opcjonalne `onMoment`, np. ratunek w świątyni lub gol w dogrywce. Typy są w `src/platform/momentRecorder.ts`. Nie trzeba wysyłać całej telemetrii na telefony.

## Uprawnienia i sieć

- `PadHost` sprawdza połączenie nadawcy **przed** wykonaniem `room`/`command`, nie polega na ukryciu przycisku w React.
- Jawnie przekazany admin ma pierwszeństwo. Po jego rozłączeniu rola wraca do najstarszego aktywnego połączenia; po reconnect dawny admin nie odbiera automatycznie roli komuś innemu.
- Zamknięty pokój nie przyjmuje nowych telefonów. Dotychczasowy pad może wrócić w istniejącym 60-sekundowym oknie odzyskania slotu; odłączenie przez administratora usuwa tę ulgę.
- „Odłącz” **nie jest trwałym banem**. Przy otwartym wejściu ten sam telefon może ponownie dołączyć. Domowa sesja nie ma systemu kont ani zweryfikowanej tożsamości; lokalny pid nie jest uwierzytelnieniem kryptograficznym.
- Profile mają ścisłe listy dopuszczalnych wartości. WIP, obce id gry, fałszywe typy przełączników i nieistniejące sloty są odrzucane/normalizowane.
- Ustawienia pokoju nie zapisują się na serwerze. Odświeżenie całej strony tworzy stan domyślny. Transport i retry pozostały istniejące, nie dodano nowego backendu.
- Wersja protokołu pozostaje 1: pola sesji są opcjonalne, a nowe typy wiadomości ignorowane przez stare implementacje. Dla pełnego działania aktualizacji należy odświeżyć **TV i telefony**.

## Najważniejsze pliki

- `src/platform/`: pokój, Player Pass, powiadomienia, Moments i style.
- `src/net/protocol.ts`, `padHost.ts`, `padClient.ts`: autorytatywne operacje i synchronizacja.
- `src/pad/JoypadController.tsx`: osobne kompozycje pion/poziom.
- `src/console/resultsNavigation.ts`: nawigowanie wynikami bez myszki.
- `src/arcade/ArcadeGameView.tsx`, `src/App.tsx`: telemetryczne adaptery rund.
- `src/game/engine.ts`: anulowanie opóźnionych efektów i callbacku finału przy destroy, ochrona przed podwójnym startem.
- [`game-building-prompts.md`](game-building-prompts.md): cztery niezależne, długie prompty do nowych sesji oraz prompt bezpiecznego importu ZIP.

## Sprawdzenie automatyczne

```sh
npm ci
npm run typecheck
npm run lint
npm run build
npm run selftest:platform
npm run selftest:replay
npm run selftest:arcade
npm run selftest:console
npm run selftest:relay
VITE_BASE=/JoyPad/ npm run build
```

Nowy selftest sprawdza brak uprawnień gościa, transfer, odebranie praw staremu adminowi, zamknięcie, reconnect, usunięcie ulgi po kick, odrzucenie WIP, cofnięcie głosu, walidację profilu, zapis bez localStorage, ograniczenia i reset Moments oraz niemutowalne snapshoty do powiadomień.

W sesji implementacyjnej sprawdzono także interfejs w Chromium: bibliotekę 1440 px, przełączniki pokoju, personalizację, pion 390×844 i poziom 844×390 oraz kompaktowy 568×320 (brak poziomego przepełnienia). Rzeczywista symulacja czołgów z czterema botami wygenerowała trzy Moments i otwieralny ekran szczegółów, bez błędów JS. Test UI telefonu używał kontrolowanego stanu klienta, **nie rzeczywistego połączenia czterech telefonów przez internet**.

### Checklista przed publicznym wydaniem

1. TV + dwa prawdziwe telefony: dołączenie przez QR, awatary, nick, propozycje, cofnięcie i zatwierdzenie.
2. Przekazanie admina: stary nie steruje pokojem; po rozłączeniu nowego rola przechodzi na aktywny telefon.
3. Zablokowane wejście: nowy telefon odrzucony; znany po krótkiej utracie sieci wraca; kick nie pozwala wykorzystać ulgi.
4. Obróć admina w obu kierunkach, także podczas trzymania przycisku w grze. Sprawdź iOS/Android i małe ekrany z bezpiecznymi obszarami.
5. Wejdź do pokoju podczas gry: kontrolki zwolnione, runda pauzuje jeśli odliczanie już minęło; ekran przerwy niedostępny.
6. Zakończ każdą z trzech dostępnych gier. Otwórz Moments myszką i pilotem. Sprawdź rewanż, brak starych zdarzeń i nawigowanie wynikami.
7. Sprawdź ograniczony ruch, klawiaturę, prywatny tryb przeglądarki i niedostępny fullscreen/haptykę.
8. Potwierdź na prawdziwym Wi-Fi/LTE, że połączenia WebRTC i awaryjny MQTT nadal działają. Testy w pamięci nie zastępują weryfikacji STUN/TURN i polityk sieci operatora.

## Proponowany następny etap (niezaimplementowany)

1. **Wieczór turniejowy:** lista gier, wspólne punkty i finał całej sesji, bez konieczności kont.
2. **Moments Director:** alternatywne ujęcia kamery i dźwięk gry. Obecnie gotowe są prawdziwe klipy obrazu z aktualnej kamery; dowolna rekonstrukcja sceny wymaga osobnego systemu stanu.
3. **Album ekipy:** zapis wybranych kart wieczoru i opcjonalny eksport obrazu, z jasną polityką lokalnego przechowywania.
4. **Tryb widza:** telefon bez slotu gracza z wynikami, głosowaniem i zaproszeniem do następnej rundy.

Te pomysły wymagają dalszej implementacji; aktualizacja nie przedstawia ich jako gotowych funkcji.
