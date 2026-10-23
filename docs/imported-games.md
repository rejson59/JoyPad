# Gry wciągnięte z paczek ZIP i repozytoriów

Paczki ZIP (`nitro-league.zip`, `orbitalna-fala.zip`) i publiczne repo użytkownika
(`rejson59/mconline` → BlockCraft) wchodzą do konsoli tą samą drogą: silnik kopiujemy
niemal bez zmian, a JoyPad dostaje wyłącznie most rundy i bramki.

Ten dokument opisuje, co zrobiono z archiwami leżącymi w `main` (runda 19), jak wyglądała procedura
(zgodna z §2 `docs/game-building-prompts.md`) i **jak każdą z gier cofnąć**. ZIP-y i katalog roboczy
`.cache/game-import/` nie trafiają do commitów (`*.zip` i `.cache` są w `.gitignore`).

## Co było w paczkach

| ZIP | Co to jest | Decyzja |
|---|---|---|
| `orbitalna-fala.zip` | silnik STAR CLASH 3D | **już w bibliotece** jako *Orbitalna Fala* (`src/arcade/starclash/`; `audio.ts` identyczny bajt w bajt, `Game.ts` z adaptacją JoyPada) — bez duplikatu |
| `multiplayer-superhero-pizza-delivery.zip` | WEBZA — „Nocna Dostawa”, kurierzy pizzy na dachach | **nowa gra** `pizza` (niżej) |
| `nitro-league.zip` | samochodowa piłka nożna 3D (~6000 linii, własna fizyka) | **wypełnia slot Turbo League** (`league`, dotąd zapowiedź) — niżej |
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
- Nagrania podglądu: każda **grywalna** gra ma swój urywek botów (`PREVIEW_GAMES` w `GamePreview.tsx`),
  nagrany z prawdziwego silnika przez `scripts/previews/capture.mjs` — lokalnie albo w CI (workflow
  `Previews` nagrywa jeden silnik na job i commituje klipy do gałęzi, z której wystartował). Zapowiedzi
  `wip` (BlockCraft) zostają przy okładce; `selftest:console` porównuje listę nagrań z katalogiem.

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

## Turbo League (`league`) — silnik z `nitro-league.zip`

**Dlaczego slot Turbo League, a nie nowy kafel:** biblioteka miała już zapowiedź „Turbo League” (`wip`), a paczka to
dokładnie ten gatunek (car soccer 3D). Drugi kafel o tym samym gatunku byłby mylący, więc silnik wypełnia istniejący slot;
**nazwa w grze to Turbo League** (napisy „NITRO LEAGUE” na tablicy wyników i ekranach LED stadionu zamieniono). Prosty
prototyp Canvas 2D (`games/League.ts`) zostaje jako wersja tylko dla przeglądarek bez WebGL2; surowy prototyp WebGL
(`webgl/League3D.ts`) usunięto jako martwy kod.

**Źródło:** `src/arcade/league-next/` — silnik z paczki (`Car`, `Ball`, `physics`, `arena`, `stadium`, `ai`, `audio`,
`carModel`, `textures`, `particles`…) plus nowe: `LeagueGame.ts` (przerobiony `Game.ts`), `bridge.ts` (czysta logika),
`markers.ts` (etykiety nad autami), `LeagueRound.ts` (adapter `GameRound`). Bez nowych zależności i bez assetów — stadion i auta są proceduralne.

**Co usunięto z paczki:** menu, garaż, ustawienia, tryb demo, kamerę pościgową jednego gracza, `InputManager`, `localStorage`
i fonty Google. **Co zostało:** fizyka aut i piłki (krok 1/120 s), stadion, boost-pady, AI botów, demolki, powtórki goli, dźwięk.

**Skład drużyn** (`assignTeams`; ludzie + boty z `RoundConfig.players`, razem maks. 4 auta): ludzie siadają naprzemiennie
(niebiescy, pomarańczowi…), więc dwóch ludzi gra przeciw sobie; boty uzupełniają mniejszą drużynę, a przy remisie idą do niebieskich.

| auta | skład |
|---|---|
| 1 człowiek | trening bez rywala (gole do pustej bramki liczą się normalnie) |
| 2 | 1v1 |
| 3 | 2v1 (człowiek + bot kontra bot; dwóch ludzi + bot: bot do niebieskich) |
| 4 | 2v2 |

**Zasady meczu:** `primary` = limit goli (3 / 5 / 7); mecz trwa 3:00; po czasie wygrywa więcej goli (gdy piłka dotknie ziemi),
remis rozstrzyga **złoty gol w dogrywce z sufitem 2:00** — bez gola mecz kończy się remisem. Czas meczu nie płynie podczas oprawy
gola (zwolnione tempo, powtórka ostatnich 4,5 s, wznowienie 3-2-1); powtórkę można pominąć przyciskiem. Samobój zalicza wynik rywalom.

**Sterowanie (kontrakt „gałka + jeden przycisk”):** gałka wskazuje **kierunek jazdy w osiach ekranu** (góra = dalej od
kamery) — auto samo skręca (`driveToward`: sterowanie proporcjonalne do kąta, zawracanie z poślizgiem) i przyspiesza, puszczona gałka
hamuje; przycisk = **boost** (przytrzymaj). Brak skoku i trików powietrznych — pad ich nie obsłuży (zgodnie z promptem §1);
w powietrzu auto samo się wyrównuje (`autoLevel`), a zablokowane na dachu odwraca się po 2,2 s.

**Kamera wspólna:** po stronie +X, pod stałym kątem 56°, więc prawo ekranu to −Z — **niebiescy atakują w prawo, pomarańczowi w lewo**.
Ostrość i dystans dobierane są tak, by piłka i auta ludzi zawsze mieściły się w kadrze (oddala się szybko, przybliża powoli, 30–92 m);
boty daleko od akcji nie wymuszają oddalenia. Kąt jest stromy, bo nieprzezroczysty panel ściany sięga tylko 6,4 m (wyżej jest szkło),
więc zasłania wąski pas przy samej bandzie. Auta są w kolorze **drużyny**, a gracz — w kolorze **slotu** (smuga i etykieta z nickiem
nad dachem, o stałym rozmiarze na ekranie).

**Poprawki fizyki z paczki** (znalezione przez `selftest:league`; oba zabezpieczone regresją):
1. `Car.groundStep`: tarcie boczne dodawało całą utraconą prędkość boczną do prędkości do przodu, więc **każdy skręt pompował prędkość
   wykładniczo** (~0,9·ω na sekundę) do limitu 23 m/s bez boosta — przy sterowaniu gałką, gdzie skręca się cały czas, boost byłby zbędny.
   Teraz przejście energii jest energetyczne (z 10% strat); limit jazdy to 14,1 m/s, a boost dochodzi do 23.
2. `Trail.update`: indeks poprzedniego punktu nie był przycięty do długości smugi, więc dla smugi krótszej od pojemności metoda rzucała wyjątek
   w każdej klatce rozpędzania (w oryginale pętla gry łapała go i gubiła resztę klatki: kamerę, HUD i render).

**Wyniki i kontrakt platformy:** `RoundResult` ma jedno `winnerSlot` i `allWon` dla całej ekipy, więc: wszyscy ludzie w zwycięskiej drużynie →
`allWon: true`; ludzie po obu stronach → `winnerSlot` = najlepszy człowiek zwycięzców, a wynik drużynowy trafia do `detail` każdego gracza
(przegrani nigdy nie dostają `allWon`); wygrały boty albo remis → brak zwycięzcy. **Znane ograniczenie:** gdy ludzie grają po obu stronach,
pozostali zwycięzcy dostają haptykę „lose” (host wysyła `win` tylko `winnerSlot`). Minimalna przyszła zmiana kontraktu:
`RoundResult.winnerSlots?: number[]` — nie wprowadzona, bo to zmiana platformy.

**Ograniczenia:** brak split-screen (wspólna kamera), wydajność GPU nie była mierzona
(stadion generuje proceduralne tekstury przy starcie rundy — na słabym sprzęcie użyj profilu „płynność”).

**Cofnięcie:** usuń `src/arcade/league-next/`, `scripts/league-selftest.ts` (+ `selftest:league` w `package.json` i wpis w override ESLint),
w `ArcadeGameView.tsx` przywróć `case 'league'` (prototyp `games/League`), `RULES.league` i `SETUP.league`; w `catalog.ts` przywróć `wip: true`
i dawne teksty; przywróć `webgl/League3D.ts` z historii gita, jeśli ma wrócić.

## BlockCraft (`blockcraft`) — silnik z repo `rejson59/mconline`

- **Źródło i licencja.** `https://github.com/rejson59/mconline` (MIT, ta sama osoba co
  JoyPad), wersja silnika 2.29 — voxelowy sandbox na Three.js z biomami, wioskami,
  redstoneem i Netherem. Sklonowany płytko do `.cache/mconline` (poza commitem).
- **Co skopiowano.** `src/game/**` → `src/arcade/blockcraft/game/` niemal 1:1 oraz
  `src/utils/version.ts` → `src/arcade/blockcraft/utils/version.ts`. **Jedyny wyjątek:**
  `online.ts` — w oryginale klient Supabase multiplayera; w JoyPadzie to dwuliniowy stub
  (`PUBLIC_POS_HZ = 0`), bo runda jest zawsze lokalna i konsola nie wysyła nic do sieci.
  Reactowe ekrany (`src/components/*`), Tailwind i Supabase do konsoli nie wchodzą.
- **Most rundy** — `src/arcade/blockcraft/BlockCraftRound.ts`: silnik tworzy własny canvas
  i prowadzi własną pętlę renderu, więc runda chowa canvas konsoli (zwraca go w
  `destroy`), a wejście z pada zapisuje w publiczne pola silnika (`keys`, `mouseRight`) —
  dokładnie ten sam kanał, którym sterują dotykowe `TouchControls` oryginału. AKCJA stawia
  blok (prawy przycisk myszy), pad nie skacze. Zegar zmiany (3/5/8 min) chodzi we
  własnym rAF-ie adaptera; wynik zmiany to suma bloków zmienionych przez gracza
  (`world.mods`), zwycięzcy nie ma — sandbox kończy się czasem, nie punktacją.
  `onHud` silnika (wołany po renderze) karmi HUD z tokenów i klatkę Momentów.
- **Zasada bez wyjątku.** W skopiowanym silniku poprawiono dokładnie jedną linię: napisy
  świata rysowane na czarnym tle dostały `hudFont(700, 28, 'mono')` zamiast literału
  `'bold 28px monospace'` — bramka hudKit czyta wszystkie pliki gry i nie zna wyjątku
  dla vendora. Reszta stylu vendora (jak w STAR CLASH) jest poza lintem przez override
  `src/arcade/blockcraft/game/**` w `eslint.config.js`.
- **Nagranie.** Gałąź `blockcraft` w `capture.mjs`: płaski świat kreatywny, silnik
  sterowany bezpośrednio (`g.loop(...)` — capture wyłącza rAF), scenariusz spaceru z
  serią stawianych bloków; klip dowiezie `previews.yml` (do tego czasu `awaitingRecording`
  w bramce PREVIEW trzyma `blockcraft`).
- **Bramki.** `probeWebGL2()` — bez WebGL2 runda zgłasza błąd zamiast wisieć na pustym
  płótnie (jak WEBZA/STAR CLASH); `worldName: 'JoyPad'`; zapis silnika zostaje w
  localStorage urządzenia (`blockcraft-save-v1`) i nie miesza się ze stanem konsoli.
