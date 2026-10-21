# Film „Poznaj JoyPad" — reżyseria, dane i wersje awaryjne (runda 14)

Runda 14 to pierwsza rzecz w tym repozytorium, która nie jest interfejsem: ok. 51‑sekundowy
film pokazywany przy pierwszym wejściu (`Witaj w JoyPad! Chcesz zobaczyć krótki poradnik?`)
oraz z ustawień. Ma dwie role naraz — reklamy i tutoriala.

## Ładowanie klipów: bramka gotowości (runda 16)

Zgłoszenie: *„czasami wydaje mi się, że nie wszystko się poprawnie ładuje i wyświetla”*.
Diagnoza miała dwa składniki i oba są naprawione:

1. **Zegar filmu idzie czasem ściennym.** Scena, która pokazuje nagrania gier (jeden albo
   trzy panele Full HD), startowała natychmiast, więc pierwsze klatki wypadały na plakacie,
   a scena „przelatywała”, zanim klip zdążył się wczytać. Teraz `src/cinema/ready.ts`
   trzyma bramkę: wejście w scenę z `videos` zatrzymuje zegar (maks. `PANE_HOLD_MS = 900`)
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

### Runda 19: „coś się za długo wczytuje ten poradnik”

Zgłoszenie okazało się mieć trzy przyczyny — wszystkie naprawione:

1. **Bramka czekała na coś, czego nikt nie pobierał.** Panel montował `<video>` dopiero,
   gdy cue pozwoliło odtwarzać (`video.p > .1`, w kaflach `cue.p > .35`), a bramka czekała
   na pierwszą klatkę tegoż wideo. Pobieranie startowało więc **po** czekaniu, które na nie
   czekało. Teraz panel ma dwa niezależne wejścia: `preload` (czy element ma istnieć i ściągać
   plik — prawda od wejścia w scenę) i `play` (czy ma grać — sterowane cue). Kafle podzielonego
   ekranu zostają przy plakatach w trybie lekkim (`preload={tier === 'high'}`), bo tam 14 MB
   nagrań nie ma po co lecieć.
2. **Nagrania dalszych scen czekały na swoją kolejkę.** Poza podgrzewaniem „następnego klipu”
   film w trybie pełnym pobiera od 2,5 s (`FILM_WARM_AFTER_MS`) **wszystkie** swoje klipy,
   kolejno, korzystając z tego, że pierwsze sceny są lekkie (iskra, okładki, kod QR).
   W chwili wejścia w rozgrywkę pliki są już w pamięci podręcznej, a nie w drodze.
3. **Wszystko zaczynało się pobierać w chwili kliknięcia.** Fragment filmu (17 kB gzip),
   generator QR i okładki biblioteki (0,65 MB) lecą teraz wcześniej — `src/cinema/warm.ts`
   woła `warmCinema()` z okna pytania o poradnik (człowiek czyta, pliki lecą) i z biblioteki
   po 1,5 s, więc przycisk „Poradnik” otwiera film bez ekranu ładowania.

Dodatkowo panel zgłasza gotowość **także przy błędzie** pobrania (`onError`): klip, którego
nie ma po zmianie wersji, nie trzyma zegara ani nie pokazuje czarnego prostokąta — zostaje
plakat, a film idzie dalej. Wszystkiego pilnuje `selftest:cinema` (sekcja *LOADING*) oraz
`selftest:cinema-render` (`<video>` musi być w DOM na wejściu w scenę, a w trybie lekkim
kafle nie mogą ściągać nagrań).

**Powtórka (runda 15)** — użytkownik poprosił o miejsce, w którym film obejrzy się ponownie.
Są trzy wejścia i prowadzą do tej samej akcji (`openCinema('manual')`): stopka biblioteki
(„Poradnik”), okno „Jak zacząć?” („Obejrzyj poradnik”) oraz Ustawienia §06 „Poradnik JoyPad”
(przycisk odtwarzania i licznik obejrzeń).

## Co dokładnie pokazuje

| # | Scena | Co widać | Rola |
| --- | --- | --- | --- |
| 1 | `coldopen` | iskra spada, rozbija się i wstaje jako Plamek; pod nim „Twój wieczór. Twoja gra." | wejście, znak firmowy |
| 2 | `library` | półka okładek przewija się pod kamerą, pierścień fokusa wędruje po kafelkach, Plamek siedzi nad wybranym, a w prawym dolnym rogu wchodzi **legenda sterowania** (drążek → A → B → X/Y) | „wybierz świat" i „czym się tu chodzi" |
| 3 | `pair` | telewizor z **prawdziwym** kodem QR pokoju, telefon wjeżdża i skanuje, wiązka, dzwonek połączenia | parowanie telefonu |
| 4 | `handoff` | kontroler **wpada w ekran telefonu**: tuman, pęknięcie światła, Plamek rozbryzguje się i wraca na przycisk A; joystick robi pełny obrót | telefon = kontroler |
| 5 | `keyboard` | klawiatura z prawdziwym układem klawiszy: światła idą kolejnością nauki (WASD gracza 1 → strzałki gracza 2 → spacja), Plamek siedzi na ramce i przy błysku przeskakuje na spację | „bez telefonu też się gra" |
| 6 | `play` | prawdziwe nagranie rozgrywki z tego repo, odliczanie 3‑2‑1, cztery kontrolery dołączają po kolei | wspólny ekran |
| 7 | `split` | cztery kafle (trzy nagrania + prawdziwe menu gry), pierścień pada chodzi po ustawieniach | podzielony ekran i sterowanie menu |
| 8 | `moments` | klatka zatrzymuje się, przewijanie zwalnia, karta „zapisano w galerii" wjeżdża z prawej | Momenty |
| 9 | `outro` | znak JoyPada, hasło, Plamek krążący wokół sygnetu i siadający na słowie | zaproszenie |

### Legenda sterowania (runda 19)

Przez pierwsze wersje poradnik uczył gier, ale nie samego JoyPada: pierścień fokusa wędrował po
kafelkach biblioteki, a widz nie dowiadywał się, co go prowadzi. Scena `library` pokazuje więc
cztery pary „klawisz → co robi" — drążek i strzałki przewijają, **A** zatwierdza, **B** wraca,
**X/Y** robią to, co podpisane na dolnym pasku ekranu.

Podpisy są zgodne z prawdziwymi przypisaniami z `src/console/uiControl.ts` (drążek i strzałki →
`Move`, A/Enter → `select`, B/Esc → `back`, X/Y → skrót kontekstowy), a nie z tym, co „ładnie
brzmi". Legenda stoi w prawym dolnym rogu, poza blokiem tekstu, żeby nie zmienić jego wysokości;
ma własne `cue` (`controls`, 1900 ms) i własną ciemną podkładkę, bo ma być czytelna z 10 stóp.

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
| `lite` | ≤ 2 rdzenie, ≤ 4 GB, `saveData`, 3G, mały ekran | bez wideo, bez lotu kontrolera, bez ziarna i flary |
| `static` | `prefers-reduced-motion`, ustawienie „ograniczony ruch", bardzo słaby sprzęt | storyboard: jedna klatka na scenę, zero animacji |

Tryb wybiera `qualityTier()`, a podczas projekcji film sam schodzi o poziom niżej, gdy średnia
klatki przekracza 34 ms (raz na ~45 klatek, bez migotania). Jakość można też przełączyć ręcznie
(chip „Jakość", `Q`, na padzie `Y`) — ręczny wybór wyłącza automat.

`static` **nie jest** osobną implementacją: te same sceny renderują się w klatce `poster`
z `animation: none`, bo stany końcowe animacji siedzą w zwykłych regułach, a stany początkowe
w `@keyframes { from }`. Dzięki temu wersja bez ruchu pokazuje pełną kompozycję, a nie pustkę.

### Kontrakt widoczności (runda 19) — przeczytaj przed dopisaniem sceny

Zgłoszenie: „nie wszystko jest widoczne w poradniku — dopiero na trybie statycznym widać, co jest
na urządzeniach". Przyczyna była jedna i siedziała w `film.css`: klatki kluczowe miały tylko
`from { opacity: 0 }`, więc **stanem końcowym animacji była wartość bazowa** — a reguły bazowe
elementów też mówią `opacity: 0`. Elementy pokazywały się wyłącznie w trybie statycznym, bo tylko
on miał ręcznie dopisane `opacity: 1`. Telefon, telewizor, kafle i menu były w normalnym trybie
niewidzialne przez cały film.

Trzy zasady, które teraz pilnuje maszyna (`selftest:cinema`, sekcja *VISIBILITY*):

1. **Każda klatka kluczowa, która gasi `opacity` w `from`, musi zapalić je w `to`.**
   Nie polegaj na wartości bazowej — przy animacji z `fill-mode: both` to ona decyduje o stanie
   końcowym, a ta sama wartość bazowa obowiązuje, zanim animacja wystartuje.
2. **Animacje wejścia (`filmRise`, `filmSlideIn`, `filmPopIn`, `filmStamp`) nie ruszają
   `transform`.** Telefon i telewizor pozycjonują się inline'owym `transform: translate3d(…)`,
   a animacja `transform` by go zastąpiła — mockup wjeżdżał z narożnika zamiast pojawiać się
   na miejscu. Używa się niezależnych właściwości `translate`/`scale`, które składają się
   z `transform`.
3. **Żadna klasa z bazowym `opacity: 0` nie może zostać bez ścieżki do widoczności**
   (animacji kończącej się na `opacity: 1` albo jawnej reguły z `opacity: 1`).

Kontrakt działa tak samo w `high`, `lite` i `static`: tryby różnią się **ruchem i nagraniami**,
nigdy tym, czy treść jest widoczna. Klasę `is-in` wpisuje się **z cue**, nigdy na sztywno —
inaczej element zapala się na starcie sceny, ignorując własny czas (pilnuje tego osobna asercja).

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
  z klatką startową, języki, poster, dźwięk, rejestr `view`, brak cue „donikąd", pamięć odpowiedzi,
  **kontrakt widoczności** (stan końcowy animacji, pozycja mockupów, brak klasy uwięzionej
  w `opacity: 0`, brak `is-in` wpisanego na sztywno) i **brak martwych pól `extra`** (pole, którego
  żadna scena nie czyta, to obietnica bez pokrycia — tak leżakowało `focusTag`).
- `selftest:cinema-render` — render wszystkich scen (9 × ~94 klatki × PL/EN, 860 renderów) przez
  `react-dom/server`: brak NaN/Infinity w geometrii i ścieżkach SVG, obecność charakterystycznych
  elementów (QR, pad, kafle, karta momentu), przełączanie języka i składanie się `lite`/`static`,
  a od rundy 19 także **obecność urządzeń i legendy sterowania w każdym z trzech trybów** — żadna
  wersja nie może po cichu pominąć treści.
- `scripts/cinema/render.mjs` — eksport klatek/MP4 przez Chromium + ffmpeg (narzędzie dla człowieka;
  w sandboxie bez przeglądarki wypisze, czego brakuje, i nic nie zapisze).

## Czego nie sprawdzono

Film **nie był obejrzany** w tym środowisku: pobranie Chromium z `cdn.playwright.dev` kończy się
`ECONNRESET`, a `npm run test:replay` z tego samego powodu nie działa. Sprawdzone maszynowo jest
to, co powyżej plus `npm run build`; smak kadru, tempo i czytelność z 10 stóp ocenia człowiek.
Nagrania HD (klatki PNG albo MP4) robi się lokalnie: `node scripts/cinema/render.mjs`.
