# Gry wciągnięte z paczek ZIP

Ten dokument opisuje, co zrobiono z archiwami leżącymi w `main` (runda 19), jak wyglądała procedura
(zgodna z §2 `docs/game-building-prompts.md`) i **jak każdą z gier cofnąć**. ZIP-y i katalog roboczy
`.cache/game-import/` nie trafiają do commitów (`*.zip` i `.cache` są w `.gitignore`).

## Co było w paczkach

| ZIP | Co to jest | Decyzja |
|---|---|---|
| `orbitalna-fala.zip` | silnik STAR CLASH 3D | **już w bibliotece** jako *Orbitalna Fala* (`src/arcade/starclash/`; `audio.ts` identyczny bajt w bajt, `Game.ts` z adaptacją JoyPada) — bez duplikatu |
| `multiplayer-superhero-pizza-delivery.zip` | WEBZA — „Nocna Dostawa”, kurierzy pizzy na dachach | **nowa gra** `pizza` (niżej) |
| `nitro-league.zip` | samochodowa piłka nożna 3D | patrz sekcja *Turbo League* |
| `threejs-multiplayer-casino-game.zip` | „Bezdomni w Kasynie” (React Three Fiber) | patrz sekcja *Kasyno* |

## Przegląd przed uruchomieniem (wszystkie paczki)

Zgodnie z procedurą nic z paczek nie było uruchamiane przed przeglądem:

- **Wpisy ZIP:** brak ścieżek absolutnych, `..`, backslashy, symlinków, urządzeń i szyfrowania; CRC poprawne;
  współczynnik kompresji 1,0× (archiwa „stored”), łączny rozmiar po rozpakowaniu 0,17–17,7 MB — nic nietypowego.
- **Ekstrakcja:** wyłącznie do `.cache/game-import/<gra>/`, ze sprawdzeniem realnej ścieżki docelowej, bez nadpisań.
- **Kod:** żaden `package.json` nie ma `preinstall/install/postinstall`; w kodzie gier brak `eval`, `new Function`,
  `fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` i dynamicznych importów. Jedyne odwołania zewnętrzne to
  **fonty Google** (`nitro-league/src/index.css`, `pizza-heroes/index.html`) — **nie zostały przeniesione**
  (zasada „assety wyłącznie lokalne, bez CDN”). `localStorage` w grach (`webza-best-*`, `nitro-league-v1-*`)
  też nie został przeniesiony: rekordy należą do platformy (`joypad-record-<gra>`).
- **Zależności:** WEBZA i Nitro używają tylko `three` (jest w JoyPadzie). Nie instalowano zależności demo.

## Wspólne zasady adapterów

- Wejście, lobby, HUD, pauza i wyniki należą do platformy; silnik gry dostaje tylko to, czego potrzebuje.
- **Pad arcade = jedna gałka + jeden przycisk akcji** (druga gałka istnieje wyłącznie w czołgach). Każda gra
  ma więc jawny kontrakt sterowania zapisany w swoim `bridge.ts`/adapterze.
- Gry są ładowane leniwie (`await import(...)` w `createRound`), nie wpływają na start aplikacji.
- Każda gra ma `selftest:<gra>` uruchamiający **cały silnik w harnessie headless** (`scripts/headless.ts`:
  fałszywy renderer i DOM, deterministyczny zegar i PRNG). Sprawdza niezmienniki — brak NaN, `onFinish`
  dokładnie raz, brak wycieków nasłuchów po `destroy()` — ale **nie** wygląd klatek ani wydajność GPU;
  to wymaga prawdziwej przeglądarki.
- Brak nagrań podglądu: `GamePreview` zna tylko `tanks/race/orbit`, a dla reszty pokazuje okładkę. Nagranie ma
  pokazywać prawdziwy silnik, a nie atrapę, więc zostanie dodane po nagraniu w przeglądarce.

## WEBZA — „Nocna Dostawa” (`pizza`)

**Źródło:** `multiplayer-superhero-pizza-delivery.zip` → `src/arcade/pizza/` (`Game.ts`, `city.ts`, `courier.ts`,
`fx.ts`, `audio.ts`, `assets.ts`, `types.ts`) + nowe: `bridge.ts` (czysta logika pad/klawiatura/HUD/wynik),
`strings.ts` (tłumaczenia EN), `PizzaRound.ts` (adapter `GameRound`). Tekstury: `public/games/pizza/*.webp`
(**11 MB PNG → 0,84 MB WebP**), okładka `public/images/webza.webp`.

**Co zostawiono z paczki:** miasto, fizykę sieci/huśtawki/zipu, zamówienia (okno, drzwi, dach, RUSH, gorące),
oprawę, audio proceduralne i ocenę zmiany (D…S+). **Co usunięto:** menu, lobby i portrety (UI paczki), mysz i dotyk,
Gamepad API (pady są w platformie), zapis rekordów w `localStorage`.

**Sterowanie (kontrakt):**

| Wejście | Co robi |
|---|---|
| gałka / WASD / strzałki / TFGH / IJKL | bieg |
| przycisk pada / `Spacja` `Q` (gracz 1) · `Enter` (gracz 2) · `R` · `U` | **sieć**: tap = skok lub przyciągnięcie w powietrzu, przytrzymanie = huśtawka |
| rzut pizzy | **półautomatyczny** — kurier sam rzuca w klienta, którego ma przed sobą (`Game.autoFire`: w powietrzu, ≤ 30 m, bez dubli w to samo okno); klawiatura ma też ręczny rzut (`E` · `Shift` prawy / `/` / `.` · `Y` · `O`), którego pierwsze użycie wyłącza asystę slotu |

Zasada „jedna gałka + jeden przycisk” wymusiła to uproszczenie: oryginał miał osobne klawisze sieci i rzutu.
Asysta używa tych samych warunków co bot autora, więc jej zachowanie jest przetestowane przez oryginalną grę.

**Ustawienia rundy:** `primary` = długość zmiany (1:00 / 2:00 / 3:00), `secondary` = tryb (współpraca z oceną
zespołu → `allWon` od oceny C; rywalizacja → `winnerSlot` = najwięcej punktów, remis i zero punktów to remis).
Jeden gracz w „rywalizacji” dostaje ocenę zespołu. Wspólna kamera (brak split-screen), minimapa w rogu, kolory
kurierów pochodzą z koloru slotu, a podpis nad głową to nick gracza.

**Wydajność:** profil „płynność” = goły render bez bloomu/FXAA/cieni, DPR 1; „balans” = bloom + FXAA, cień 1024,
DPR ≤ 1,25; „detal” = cień 2048, DPR ≤ 1,5. Dane nie są mierzone na prawdziwym GPU.

**Wymaga WebGL2** i nie ma wersji zastępczej: bez niego `createRound` zgłasza błąd, a widok wraca do menu.
Błąd ładowania (np. brak pamięci GPU) kończy się jednym, jasnym ekranem wyniku z komunikatem zamiast wiecznego ładowania.

**Cofnięcie:** usuń `src/arcade/pizza/`, `public/games/pizza/`, `public/images/webza.webp`, `scripts/pizza-selftest.ts`
(+ skrypt `selftest:pizza` w `package.json`), wpis `pizza` w `catalog.ts` (`GAME_IDS` i `GAMES`), `RULES.pizza`,
`SETUP.pizza` i `case 'pizza'` w `ArcadeGameView.tsx` oraz wiersze w README i `platform-update.md`.
