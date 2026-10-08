# Film „Poznaj JoyPad" — reżyseria, dane i wersje awaryjne (runda 14)

Runda 14 to pierwsza rzecz w tym repozytorium, która nie jest interfejsem: ok. 46‑sekundowy
film pokazywany przy pierwszym wejściu (`Witaj w JoyPad! Chcesz zobaczyć krótki poradnik?`)
oraz z ustawień. Ma dwie role naraz — reklamy i tutoriala.

## Ładowanie klipów: bramka gotowości (runda 16)

Zgłoszenie: *„czasami wydaje mi się, że nie wszystko się poprawnie ładuje i wyświetla”*.
Diagnoza miała dwa składniki i oba są naprawione:

1. **Zegar filmu idzie czasem ściennym.** Scena, która pokazuje nagrania gier (jeden albo
   trzy panele Full HD), startowała natychmiast, więc pierwsze klatki wypadały na plakacie,
   a scena „przelatywała”, zanim klip zdążył się wczytać. Teraz `src/cinema/ready.ts`
   trzyma bramkę: wejście w scenę z `videos` zatrzymuje zegar (maks. `PANE_HOLD_MS = 1600`)
   do pierwszego `loadeddata` z panelu, a jeśli sieć zawiedzie — puszcza dalej. Powtórka
   (`R`) i cofanie (`←`) czyszczą bramkę, więc każde wejście w scenę ma szansę doczekać klipu.
   Panele zgłaszają gotowość zdarzeniem `joypad-film-pane-ready`, więc nie ma nowego stanu
   współdzielonego — tylko DOM-owe zdarzenie, które działa też w harnessach jsdom.
2. **Serwer podglądu wysyłał `no-store` do wszystkiego**, więc każda scena pobierała swoje
   MP4 od nowa (klipy mają po kilka megabajtów). Teraz `scripts/preview-server.mjs` dzieli
   nagłówki: `assets/` → `immutable`, `previews/`, `images/`, `brand/` → doba, a HTML
   i `podglad.html` → `no-store`. Film dodatkowo **podgrzewa następny klip**
   (`PANE_PREFETCH_AFTER_MS = 500` po wejściu w scenę), więc bramka rzadko ma na co czekać.

Panele dostały też miękkie wejście obrazu (`.film-pane-video.is-loaded`, 220 ms) — przejście
plakat → wideo nie „mruga” już czarnym prostokątem. Wszystkie trzy mechanizmy są tanie:
bramka to jedna liczba w pętli rAF, prefetch to `fetch(..., { cache: 'force-cache' })`
w tle, a przejście to jedna klasa w CSS.

**Powtórka (runda 15)** — użytkownik poprosił o miejsce, w którym film obejrzy się ponownie.
Są trzy wejścia i prowadzą do tej samej akcji (`openCinema('manual')`): stopka biblioteki
(„Poradnik”), okno „Jak zacząć?” („Obejrzyj poradnik”) oraz Ustawienia §06 „Poradnik JoyPad”
(przycisk odtwarzania i licznik obejrzeń).

## Co dokładnie pokazuje

| # | Scena | Co widać | Rola |
| --- | --- | --- | --- |
| 1 | `coldopen` | iskra spada, rozbija się i wstaje jako Plamek; pod nim „Twój wieczór. Twoja gra." | wejście, znak firmowy |
| 2 | `library` | półka okładek przewija się pod kamerą, pierścień fokusa wędruje po kafelkach, Plamek siedzi nad wybranym | „wybierz świat" |
| 3 | `pair` | telewizor z **prawdziwym** kodem QR pokoju, telefon wjeżdża i skanuje, wiązka, dzwonek połączenia | parowanie telefonu |
| 4 | `handoff` | kontroler **wpada w ekran telefonu**: tuman, pęknięcie światła, Plamek rozbryzguje się i wraca na przycisk A; joystick robi pełny obrót | telefon = kontroler |
| 5 | `play` | prawdziwe nagranie rozgrywki z tego repo, odliczanie 3‑2‑1, cztery kontrolery dołączają po kolei | wspólny ekran |
| 6 | `split` | cztery kafle (trzy nagrania + prawdziwe menu gry), pierścień pada chodzi po ustawieniach | podzielony ekran i sterowanie menu |
| 7 | `moments` | klatka zatrzymuje się, przewijanie zwalnia, karta „zapisano w galerii" wjeżdża z prawej | Momenty |
| 8 | `outro` | znak JoyPada, hasło, Plamek krążący wokół sygnetu i siadający na słowie | zaproszenie |

## Dane sterują wszystkim

Film jest **danych, nie kodu**: `src/cinema/script.ts` trzyma sceny, napisy w dwóch językach,
czasy (`cues`), ruchy kamery (`camera`) i dźwięki (`sound`). Silnik (`timeline.ts`) jest czysty —
`resolveFrame(timeline, ms)` zwraca całą klatkę (scena, postęp, cue, kamera, zasłona), więc ten sam
film da się odtworzyć w aplikacji, przewijać bez dryfu, wyrenderować offline i przetestować bez
przeglądarki. Zero `Date.now()`, zero `Math.random()`: drobiny losowane są przez `seededUnit`.

Dokładny przepis na nową scenę (krok po kroku) i tabela krzywych: `src/cinema/README.md`.

## Trzy wersje filmu

| Tryb | Kiedy się włącza | Co zostaje |
| --- | --- | --- |
| `high` | domyślnie | pełna reżyseria, nagrania rozgrywki, efekty, dźwięk proceduralny |
| `lite` | ≤ 4 rdzenie, ≤ 4 GB, `saveData`, 3G, mały ekran | bez wideo, bez lotu kontrolera, bez ziarna i flary |
| `static` | `prefers-reduced-motion`, ustawienie „ograniczony ruch", bardzo słaby sprzęt | storyboard: jedna klatka na scenę, zero animacji |

Tryb wybiera `qualityTier()`, a podczas projekcji film sam schodzi o poziom niżej, gdy średnia
klatki przekracza 34 ms (raz na ~45 klatek, bez migotania). Jakość można też przełączyć ręcznie
(chip „Jakość", `Q`, na padzie `Y`) — ręczny wybór wyłącza automat.

`static` **nie jest** osobną implementacją: te same sceny renderują się w klatce `poster`
z `animation: none`, bo stany końcowe animacji siedzą w zwykłych regułach, a stany początkowe
w `@keyframes { from }`. Dzięki temu wersja bez ruchu pokazuje pełną kompozycję, a nie pustkę.

## Prawdziwe dane, nie makieta

- QR w scenie parowania to **prawdziwy kod pokoju** (`padUrlFor(code, joinToken)`), a gdy pokój
  jeszcze się nie zarejestrował — prawdziwe zaproszenie `…/#pad`. Zeskanowanie go w trakcie filmu
  naprawdę otwiera pada.
- Kiedy pada telefon naprawdę dołączy w trakcie filmu, scena parowania pokazuje jego nazwę i kolor
  motywu (żadnych wymyślonych graczy).
- Nagrania w scenach 5–7 to istniejące `public/previews/*` (silniki tego repo), a nie wygenerowane
  materiały. Montowane są tylko na czas swojej sceny: telewizor nie dekoduje czterech klipów w tle.

## Dźwięk bez plików

`score.ts` syntezuje całą ścieżkę w przeglądarce (`hum`, `whoosh`, `riser`, `impact`, `tick`,
`chime`, `success`, `ui`, `sweep`). Plan dźwięku liczy `scoreEvents()` z osi czasu, więc pauza
i powrót grają dokładnie ten sam miks. Cisza w ustawieniach systemu = cisza w filmie; `M`
przycisza doraźnie. To nie jest muzyka — to ilustracja i potwierdzenia.

## Sterowanie filmem

| Wejście | Akcja |
| --- | --- |
| Spacja / A | pauza (w wersji statycznej: następna klatka) |
| Esc / B | pomiń i wróć do biblioteki |
| ← / → | poprzednia / następna scena |
| R | od nowa |
| Q / Y | jakość |
| M / X | dźwięk ciszej/włącz |
| klik w segment paska | skok do rozdziału |

Pasek odtwarzacza ma rozdziały, zegar i licznik scen; wyszarza się po 3 s bezruchu, żeby nie
zasłaniać kadru, a wraca przy pierwszym ruchu. Film jest modalny: silnik interfejsu milknie,
więc A nie uruchomi gry pod filmem.

## Bramka automatyczna

- `selftest:cinema` — skrypt autora: identyfikatory, przyleganie scen, cue w scenie, kamera
  z klatką startową, języki, poster, dźwięk, rejestr `view`, brak cue „donikąd", pamięć odpowiedzi.
- `selftest:cinema-render` — render wszystkich scen (8 × ~97 klatek × PL/EN, ~776 renderów) przez
  `react-dom/server`: brak NaN/Infinity w geometrii i ścieżkach SVG, obecność charakterystycznych
  elementów (QR, pad, kafle, karta momentu), przełączanie języka i składanie się `lite`/`static`.
- `scripts/cinema/render.mjs` — eksport klatek/MP4 przez Chromium + ffmpeg (narzędzie dla człowieka;
  w sandboxie bez przeglądarki wypisze, czego brakuje, i nic nie zapisze).

## Czego nie sprawdzono

Film **nie był obejrzany** w tym środowisku: pobranie Chromium z `cdn.playwright.dev` kończy się
`ECONNRESET`, a `npm run test:replay` z tego samego powodu nie działa. Sprawdzone maszynowo jest
to, co powyżej plus `npm run build`; smak kadru, tempo i czytelność z 10 stóp ocenia człowiek.
Nagrania HD (klatki PNG albo MP4) robi się lokalnie: `node scripts/cinema/render.mjs`.
