# Moments Video — realne powtórki rozgrywki

## Działanie

1. TV rozpoczyna nową sesję nagrywania razem z rundą. Włączenie/wyłączenie w ustawieniach systemowych stosuje się od następnej rundy.
2. Silniki przekazują `onFrame(canvas, overlay?)` **w tym samym zadaniu JS co render**. Dzięki temu Three.js nie dostarcza pustego, już wyczyszczonego WebGL canvas. Orbitalna Fala przekazuje również własny canvas HUD. Neon przekazuje właściwy canvas sceny (nie ukryty placeholder), po renderze całego split-screen.
3. Obraz trafia do stałego canvas 1280×720, letterbox zachowuje proporcje. Kopiowanie jest ograniczone do 24 FPS. Zmiana rozmiaru okna nie zmienia rozdzielczości strumienia.
4. Canvas `captureStream` zasila maksymalnie dwa zachodzące na siebie MediaRecordery. Około 12-sekundowe okna ruszają co 6 sekund. Każde ma **własny encoder, nagłówek i końcowy chunk** — timeslices 1-sekundowe nie są traktowane jak osobne filmy.
5. `MomentRecorder` wybiera do trzech najważniejszych akcji z prawdziwych FX/HUD. Przekazuje znacznik bezpośrednio do `ReplayRecorder`, więc dopasowanie do nagrania nie zakłada, że czas gry jest równy czasowi rzeczywistemu (ważne dla slow motion czołgów). `at` w UI to czas silnika; `eventOffset` to pozycja w pliku wideo.
6. Bufor przechowuje okna aktualnie wybranych akcji i krótki ogon. Po rundzie zatrzymuje recordery, czeka na ostatnie `dataavailable` i `stop`, a następnie tworzy URL do samodzielnych plików. WebM dostaje poprawione metadane czasu, bez ponownego kodowania; MP4 zachowuje własny kontener.
7. Odtwarzacz ma kontrolki, play/pause dostępne pilotem, powtórzenie od początku, 0,5× i pobieranie `.webm`/`.mp4`. Żadnego wymuszonego autoplay ani wielkiego filmu w tle.

## Co jest i czego nie ma

- Prawdziwe **nagranie obrazu gry**, nie animacja okładki i nie rekonstrukcja stanu świata.
- **Bez dźwięku**. Nie nagrywamy mikrofonu, kamery, pulpitu, powiadomień systemowych ani interfejsu DOM wokół canvas. Natywny canvas HUD Orbitalnej Fali jest w klipie.
- Nagrania zostają na urządzeniu TV; nie są przesyłane do telefonów ani na serwer. Pobranie jest świadomą operacją użytkownika. Plik może zawierać nicki widoczne w obrazie.
- Brak kont, chmury i trwałego albumu. Nowa runda lub wyjście z modułu gry zwalnia stare Blob URL.
- Działa tylko przy wsparciu Canvas `captureStream`, MediaRecorder i jednego z kodeków: VP8 WebM, VP9 WebM, MP4. Wykrycie API to nie gwarancja wydajności urządzenia. Safari/Firefox wymagają testu na realnym sprzęcie; test automatyczny w tym PR dotyczy Chromium.
- Okna są orientacyjne: początek/koniec rundy skraca pre/post-roll; długa klatka przesuwa moment rotacji. UI podaje czas akcji w klipie. Kilka akcji z jednego okna może współdzielić film.
- Nagranie nie musi zawierać wszystkich wydarzeń. Przy braku klatek, utracie starszego okna po zmianie rankingu, błędzie kodeka lub limicie zasobów karta jest jawnie opisana jako **bez wideo**. Nie pokazujemy okładki pod etykietą „powtórka”.

## Pamięć, pauza i sprzątanie

- Stała powierzchnia: 720p; docelowo 1,6 Mb/s na encoder, do 24 FPS.
- Twardy limit **zachowanych zakodowanych chunków**: 32 MiB. To nie jest obietnica limitu całej pamięci JS, kontekstu graficznego, natywnych kolejek MediaRecorder ani tymczasowej kopii podczas naprawy metadanych.
- Po przekroczeniu budżetu nagrywanie zatrzymuje się z informacją. Wcześniejsze kompletne klipy pozostają dostępne; niekompletne okna nie są oferowane jako filmy.
- Pauza, countdown i ukryta karta zatrzymują zegar nagrania oraz encodery. Interfejs gry ma nadal własne reguły pauzy.
- `useRecordedMoments` jest właścicielem rekordera na poziomie modułu gry: stan przeżywa przejście runda → wyniki, ale nie przeżywa nowej rundy lub unmount gry.
- Abort podczas `finish` nie może utworzyć nowych URL ani nadpisać wyników kolejnej rundy. `dispose()` jest idempotentne. Zwalnia tracki, recordery, timery oczekiwania, listenery, chunki i URL.
- Oczekiwanie na końcowy event `stop` ma limit 4 sekund. Błąd nagrywania nigdy nie zatrzymuje pętli gry.

## Testy

### Offline

```sh
npm ci
npm run selftest:replay
npm run selftest:platform
npm run selftest:arcade
npm run selftest:console
npm run selftest:relay
npm run lint
npm run typecheck
VITE_BASE=/JoyPad/ npm run build
```

Selftest rekordera sprawdza niezależne nagłówki, flush ostatnich danych, pre-roll, pauzę bez doliczania 50 sekund, najwyżej dwa encodery, utrzymanie wczesnego highlightu, rotację/eviction, limity, anulowanie finalizacji, zwalnianie URL, brak API i ustawienie wyłączenia. Encoder w tym selfteście jest atrapą do sprawdzania cyklu życia, nie dowodem dekodowalności wideo.

### Prawdziwe kodowanie i odtwarzanie w Chromium

```sh
npx playwright install --with-deps chromium
npm run test:replay
```

Playwright uruchamia testowy serwer Vite (albo używa już działającego lokalnego serwera). `TEST_BASE_URL` wskazuje alternatywny już uruchomiony serwer. Opcjonalne `CHROMIUM_PATH` i `CHROMIUM_ARGS` pozwalają uruchomić Chromium dostarczone przez środowisko zamiast standardowego pliku Playwright. Artefakty trafiają do ignorowanego `.cache/playwright/`.

Siedem scenariuszy:

1. Dwa prawdziwe klipy: niezależne dekodowanie, skończona długość, 1280×720, niepuste piksele, odtwarzanie, seek, 0,5×, download, zmiana klipu i odwołanie URL.
2. Rzeczywisty renderer Stalowego Frontu → kodowanie → dekodowanie i kontrola pikseli.
3. Rzeczywisty renderer Neonowego Pędu, widok wspólny.
4. Ten sam renderer w split-screen — nie ukryty placeholder.
5. Orbitalna Fala: właściwy canvas WebGL + overlay.
6. Wyłączenie nagrywania na TV i trwałość preferencji po reload.
7. Pełny interfejs TV: krótka deterministyczna runda czołgów, faktyczne zebranie bonusu wykryte przez silnik, wyniki, film, rewanż, nowy film i wyjście. Test modyfikuje tylko odpowiedź testowego modułu, aby skrócić limit i ustawić bonus przy czołgu; kod produkcyjny nie ma testowej ścieżki ani sztucznych highlightów. Weryfikujemy odwołanie URL po rewanżu i wyjściu.

Testy samych rendererów używają jawnego znacznika testowego do wyboru okna — nie zależą od losowych trafień AI. Kontrola pikseli próbkowana jest w środku klipu, nie w pierwszej klatce przejścia.

## Przed wydaniem na wszystkie urządzenia

- Safari macOS/iOS, Firefox oraz słabsze telewizory: wsparcie kodeka, pamięć i wpływ dwóch encoderów na FPS.
- Długa runda i powrót z ukrytej karty, zarówno Canvas2D jak WebGL.
- Prawdziwe telefony w Wi-Fi/LTE: play/pause pilotem i zwykła obsługa pokoju. Automatyczne testy w Chromium nie oznaczają testu rzeczywistej sieci komórkowej.
- Na słabszym sprzęcie wyłączyć nagrywanie w ustawieniach. Podglądy biblioteki mają oddzielną preferencję.
