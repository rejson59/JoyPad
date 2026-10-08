# Film „Poznaj JoyPad" — jak to działa i jak dodać scenę

Krótki film (ok. 46 s) pokazywany przy pierwszym wejściu oraz z ustawień.
Jest równocześnie reklamą i poradnikiem: pokazuje parowanie telefonu,
kontroler w telefonie, wspólny i podzielony ekran oraz Momenty.

```
src/cinema/
├── script.ts        ← JEDYNE miejsce, które edytujesz przy nowych scenach
├── timeline.ts      ← silnik osi czasu (czysty, bez DOM-u)
├── scenes.tsx       ← kompozycje scen (co widać na ekranie)
├── mocks.tsx        ← rekwizyty: telefon, telewizor, kontroler, ekran pada
├── CinemaPlamek.tsx ← Plamek w wersji filmowej (ta sama fizyka i maska goo)
├── score.ts         ← dźwięk generowany w przeglądarce (zero plików audio)
├── Film.tsx         ← odtwarzacz: rAF, pauza, rozdziały, tryby jakości
├── Welcome.tsx      ← pytanie „Witaj w JoyPad! Chcesz zobaczyć krótki poradnik?"
├── store.ts         ← pamięć odpowiedzi + otwieranie filmu z ustawień
└── film.css         ← cały wygląd filmu (jednostki sceny 1920×1080)
```

## Jak dodać nową scenę

1. **Wybierz `view`.** Gotowe: `coldOpen`, `library`, `pair`, `handoff`, `play`,
   `split`, `moments`, `outro`. Jeśli nowa scena ma wyglądać inaczej, dopisz
   komponent w `scenes.tsx` i wpisz go do rejestru `SCENE_VIEWS`.
2. **Wstaw obiekt sceny** do `filmScript.scenes` w kolejności odtwarzania.
   Czas liczony jest kumulatywnie — nie podajesz go globalnie, tylko `ms`.
3. **Napisz `cues`** — każde wejście elementu to `{ id, at, dur }` w ms od
   początku sceny. Ten sam `id` może wystąpić kilka razy (retrigger, np. focus
   przechodzący po kafelkach). `hold` to pauza po wejściu, `fade` — wyjście.
   Krzywe: `linear, inOut, inQuad, outCubic, outQuint, outExpo, outBack, step`.
   `outBack` rozciąga wyłącznie **kształt** — pozycje zawsze przechodzą przez
   `clamp01`, bo nic w tym filmie nie ma prawa się cofać ani odbijać.
4. **Ustaw kamerę** (`camera`): klatki kluczowe `at` 0..1 (procent sceny),
   `x`/`y` w pikselach sceny, `scale`, `rot` w stopniach. Pierwsza klatka
   musi mieć `at: 0`.
5. **Dodaj dźwięk** (`sound`): `whoosh, tick, impact, riser, chime, ui, success,
   sweep` (oraz `hum` jako tło). Wszystko jest syntezowane na miejscu.
6. **Ustaw `poster`** (0..1) — klatka reprezentatywna; z niej korzysta wersja
   statyczna dla słabych urządzeń i storyboard.
7. **Napisz teksty** w obu językach (`{ pl, en }`) — etykietę, tytuł, zdanie
   i maksymalnie trzy hasła. Polskie napisy w tym repozytorium używają
   cudzysłowu „…" bez twardych spacji.
8. **Uruchom `npm run selftest:cinema`** — sprawdzi czasy, przyleganie scen,
   cue wychodzące poza scenę, brakujące języki, rejestr `view` i to, czy sceny
   nie czytają cue, którego nie ma w skrypcie.

## Zasady, których warto nie łamać

- **Jedna gramatyka typografii**: `label` + `title` + `sub` + maks. 3 `chips`.
  Sceny `coldOpen` i `outro` są wyśrodkowane, pozostałe mają podpisy w dolnej
  lewej — dzięki temu rytm filmu jest stały.
- **Czas idzie z osi, wygląd z klas CSS.** To, co płynne (przesuw półki, lot
  kontrolera, sweep joysticka), liczymy w JS z postępu `cue`; resztę animuje
  CSS po przełączeniu klasy `is-in` w chwili startu cue.
- **Stan końcowy w regule, stan początkowy w `@keyframes { from }`.** Dzięki
  temu tryb statyczny (`data-tier="static"`, m.in. `prefers-reduced-motion`)
  wyłącza animacje i nadal pokazuje pełną kompozycję, a nie pustkę.
- **Determinizm**: żadnego `Date.now()` ani `Math.random()` w kompozycjach.
  Drobiny losujemy przez `seededUnit(index, salt)`, więc klatka 1200 wygląda
  identycznie w podglądzie i w eksporcie.
- **Plamek jest jeden.** W filmie używa tej samej ścieżki (`blobPath`), progu
  alfy i keyline'u co interfejs (`CinemaPlamek.tsx`), więc nie może „odetchnąć"
  innym stylem niż maskotka w bibliotece.

## Wersje awaryjne

| Tryb | Kiedy | Co się zmienia |
| --- | --- | --- |
| `high` | domyślnie | pełna reżyseria, nagrania rozgrywki, efekty |
| `lite` | mało rdzeni/pamięci, `saveData`, słabe łącze, mały ekran | bez wideo i ciężkich efektów, bez lotu kontrolera |
| `static` | `prefers-reduced-motion`, ustawienie „ograniczony ruch", bardzo słaby sprzęt | storyboard: jedna klatka na scenę, bez animacji |

Tryb wybiera `qualityTier()` (`timeline.ts`) na podstawie `readTierEnv()`,
a w trakcie projekcji film sam schodzi o poziom niżej, jeśli klatki nie
wyrabiają (średnia > 34 ms). Ręcznie można go przełączyć chipem „Jakość"
w pasku odtwarzacza (`Q` na klawiaturze, `Y` na padzie).

## Eksport poza przeglądarkę

`scripts/cinema/render.mjs` umie policzyć plan klatek i (na maszynie
z Chromium + ffmpeg) zapisać klatki lub film MP4. Nie jest to część builda —
to narzędzie dla człowieka, tak samo jak `scripts/previews/capture.mjs`.
