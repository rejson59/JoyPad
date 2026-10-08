# JoyPad OS — warstwa „liquid glass"

Aktualizacja stylu interfejsu systemu: **bez wysuwanych paneli z boku**. Zamiast nich
pigułki, karty i pływające okienka na ciemnym szkle. Pliki: `src/console/liquid.css`
(jedyna warstwa nadpisująca powierzchnie) oraz `src/console/palette.css` (tokeny kolorów, bez zmian).

## Co się zmieniło

- **Pływające okienka zamiast szuflad.** `Sheet` (`<dialog>`) nie jest już panelem przyklejonym do prawej krawędzi: to wyśrodkowana, zaokrąglona karta z własnym cieniem, uchwytem u góry i rozmytym tłem. Na telefonie oraz w niskim oknie krajobrazowym ten sam komponent wstaje od dołu jako sheet i respektuje `env(safe-area-inset-bottom)`. Dialog nadal jest natywny — fokus, `Escape`, przywracanie fokusu i komendy pilota (`back`/`home`/`select`, strzałki) działają jak wcześniej.
- **Pigułki dla kontrolek kompaktowych, karty dla wierszy.** Akcje i chipy (`Uruchom grę`, `Dodaj gracza`, `Pokój`, ikony paska, statusy, `TURBO`, przyciski odtwarzacza Moments) mają `border-radius: 999px`. Pełnowymiarowe wiersze (ustawienia, pokoje, propozycje, wyniki) pozostały kartami — tekst nie „ucieka" od ściany do ściany.
- **Szkło obsydianowe, nie mleczne.** Każda powierzchnia to ciemna baza + tint + highlight u góry. `brightness()` w filtrze przyciemnia to, co jest pod szkłem, więc biały tekst trzyma kontrast nawet nad jasną areną w tle.
- **Ruch jest sprężysty, nie efektowny.** Wspólne krzywe `--liquid-spring` / `--liquid-glide` / `--liquid-in`; wejście okienka to `scale + translate + opacity`, podświetlenie elementów to `transform` (menisk pod wybranym tytułem, przesuwający się odblask na hover, sprężysty powrót przełączników). Animacja nieskończona w warstwie systemu: zero.
- **Okienka wyrastają z przycisku, w który trafiłeś** — i wracają do niego przy zamknięciu (genie à la macOS). Matematykę liczy `src/console/windowFlip.ts` na realnych kadrach, nasłuch źródła kliknięcia instaluje `main.tsx`, a podpięcie powierzchni to `useWindowMorph(ref)` w `Sheet`. Bez punktu startowego (okno otwarte automatycznie) gra zwykłe wniknięcie; na telefonie morfing jest świadomie zastąpiony wjazdem od dołu.
- **Blok „WSPÓLNY EKRAN" ma duży kod QR na środku**, kod pokoju pod nim, przycisk „Odnów kod" i zostaje na ekranie również wtedy, gdy ekipa już dołączyła. Czy kod w ogóle ma być widoczny, decyduje administrator pokoju (`room.pairing`, przełącznik w Centrum pokoju na TV i na telefonie).
- **HUD gier arcade** (wspólny pasek i pasek graczy nad areną) to teraz pływające szklane belki nad canvasem. Silniki gier, fizyka, transport i HUD-y pisane na canvasie nie zostały ruszone.

## Jak do tego dokładać nowe elementy

1. Użyj primitive'ów: `lg-card`, `lg-pill`, `lg-window`, `lg-field`, a gdy chcesz odblask — `lg-sheen`; `lg-enter` na wejściu.
   Mają zerową specyficzność (`:where()`), więc nadpisuje je każda reguła właściwa komponentu.
2. **Nie pisz `backdrop-filter: blur(...)` ani `background-color: #rrggbbaa` wprost.** Bierz `var(--lg-glass)`,
   `var(--lg-glass-soft)`, `var(--lg-glass-hud)` oraz `var(--lg-base)`, `var(--lg-base-strong)`, `var(--lg-fill)`,
   `var(--lg-scrim)`, `var(--lg-field)`. Tylko podmiana tokena w bloku `@supports`/`prefers-reduced-transparency`
   daje poprawny fallback — `npm run selftest:console` pilnuje tego automatycznie.
3. Nowy ruch? Tylko `transform`/`opacity`, krótkie czasy z `--lg-t1..3`, i dopisanie selektora do bloków
   `prefers-reduced-motion` oraz `html[data-motion="reduced"]`. `npm run selftest:console` pilnuje, że morfing
   też tam jest.
4. Nad żywym canvasem (HUD, tło okienka pauzy) używaj `--lg-glass-hud` — najtańsze rozmycie w systemie.
5. Nowa **powierzchnia okienkowa** (nie dialog)? Podpięcie morfingu to dwie linijki:
   `const { collapse } = useWindowMorph(ref)` oraz dodanie klasy elementu do listy `MORPHABLE`
   w `src/console/windowOrigin.ts` i pary selektorów `.twoja-klasa.lg-morph-in/.lg-morph-out` w `liquid.css`.
   Zamknięcie przez `collapse(() => naprawdęZamknij())` jest opcjonalne — bez niego okno po prostu znika.
   Hook sam pilnuje reduced-motion i tego, by `will-change` nie wisiało na otwartym oknie.
6. Kod QR, link do pokoju, cokolwiek, co „leży na ekranie długo": nie zakładaj, że wygenerowany raz jest
   aktualny. Stan zaproszenia żyje w `src/net/joinToken.ts` (TTL + łaska) i w `padHost.refreshJoinToken()`.

## Sterowanie: Plamek i podpowiedzi

Warstwa szkła obejmuje też dwie powierzchnie samego sterowania (opis logiki: `docs/ui-control.md`,
specyfikacja maskotki: `docs/plamek.md`):

- `.plamek` (`.plamek-glow`; `<svg class="plamek-liquid">` → `<defs>` + grupa `.plamek-goo`
  z `.plamek-src`, `.plamek-strand`, `.plamek-collar`, `.plamek-blob`, `.plamek-echo`,
  `.plamek-splat`; obok grupy `.plamek-face` i `.plamek-mini`) — maskotka fokusa: farba, która
  oblewa przycisk, z główką i buźką **wyrastającymi z tej samej ścieżki**. Cała materia to trzy
  atrybuty `d` (kołnierz, resztka na starym kaflu, bulwa w locie) plus szyja mostu, kropla
  (podścieżka kołnierza), pięć ech i trzy bryzgi — zero osobnych `div`-ów, bo dwa elementy mogą
  co najwyżej na siebie nachodzić i to jest przepis na „lasso plus kulka", nie na kleks.
  Geometrię liczy `src/console/plamek.ts` (`rimPoint`/`bandEdges`/`ribbonPath`, szczegóły
  w `docs/plamek.md`), `draw()` przepisuje ją na atrybuty `d`/`cx`/`cy`/`r`/`fill-opacity`
  (tylko gdy się zmieniły) i na zmienne `--halo-*` poświaty oraz `--ball-*` twarzy, więc media
  query dla TV dokłada wyłącznie grubość kreski i rozmiar oczu. Twarz jest **rodzeństwem** grupy
  farby (nie dzieckiem) i jedzie na `translate3d` z tłumionym `scale(1, --ball-sy)` — dlatego się
  nie kręci i nie zmienia w kreskę przy uderzeniu. `pointer-events: none`, farba nie wchodzi do
  środka kafla, a jej grubość jest anizotropowa (góra .35×, boki 1×, dół 1.55×), więc opada pod
  przycisk i nie zasłania napisu. W okienku montowana jest kopia (`position: absolute` względem
  karty), bo `::backdrop` modala maluje ponad wszystkim poza nim. Kolor poświaty bierze się ze
  `--os-nav-accent` (akcent podświetlonej gry) z powrotem do `--os-accent-bright`.
- `html[data-plamek]` — ścisza natywny `:focus-visible` do 1px w 34% akcentu (maskotka robi
  główną robotę, ale outline zostaje dla elementów poza listą nawigacji).
- `.ui-hints` / `.ui-hint kbd` — pasek podpowiedzi na dole; w bibliotece w `.os-footer`, w okienkach
  jako stopka `.os-sheet-content`. Pigułki `X`/`Y` (`kbd.is-xy`) i sygnał „telewizor musi potwierdzić"
  (`is-armed`) czytają ten sam kontekst, co skrót, więc opis nigdy nie rozmija się z działaniem.

Jedyny ruch w CSS warstwy to `plamek-sheen` (połysk mokrej farby po rozlaniu, `.plamek.is-settle`),
`plamek-splat`, `plamek-fuse` (puls domknięcia liczony `box-shadow`, bo transformu grupa nie ma),
`plamek-wake` i `plamek-mini-nod` — wszystkie skończone, odpalane klasą przez JS. Reakcje
(`is-nod`, `is-dodge`, `is-poke`, `is-confirm`, `is-blocked`) są pisane wyłącznie na właściwościach,
których `draw()` nie dotyka: `fill` grupy farby, `filter: brightness` samej bulwy, `box-shadow`
poświaty i `scale`/`filter` miniatora — inaczej wyzerowałyby transform pozycji.

**Maska goo.** Grupa `.plamek-goo` istnieje wyłącznie po to, by na niej wisiał
`filter: url(#plamek-goo-…)` z `feGaussianBlur`, `feColorMatrix` (próg alfa `0 0 0 18 -6`) i keyline
liczonym `feMorphology` po progu: szew
ścieżki, kropla na taśmie i bryzgi przestają być osobnymi plamkami (zjawisko metaball), więc materia
pozostaje jedna. To **nie** `backdrop-filter` — nic nie rozmazuje zawartości spod spodu, filtr liczy
wyłącznie własny kanał alfa grupy. Prawa, bez których to się rozsypuje: `id` unikalne na instancję
(`useId()`, bo w okienku siedzi kopia Plamka), `color-interpolation-filters="sRGB"` (inaczej kolory
bledną), region `<filter filterUnits="userSpaceOnUse">` wpisywany co ramkę na złączu boxów (grupa
rozciągnięta na viewport płaciłaby rozmyciem ekranu w każdej ramce), `overflow: visible` na `<svg>`
(kropla i ogon wychodzą poza box przycisku), a sam filtr zakłada i zdejmuje JS (`gooStrength`), bo
CSS nie wie, która ramka jest mokra. Próg alfa zjada delikatne cienie i cienkie kreski, dlatego
`is-fuse` startuje od `#ff9a52e6`, a `gooStrength` w bezruchu zwraca `.3` — całkowite wyłączenie
rozmycia zostawiłoby po obrysie krawędzie wieloboku. Kontrast nie bierze się z `stroke`-a dziecka
(próg alfa i tak zjadał kreskę o alfa .28), tylko z dołożonego **po progu** `feMorphology` +
`feFlood` + `feComposite` + `feMerge`: ciemny keyline otacza więc zlaną bryłę, nie każdy `<path>`
osobno. Same prymitywy SVG 1.1 — `feDropShadow` bywa nieznany przeglądarkom telewizyjnym, a filtr,
którego silnik nie zna, oznacza warstwę bez farby. Wypełnienie zostaje czystym akcentem gry
(`--plamek-paint: var(--os-nav-accent, #ff9a52)`): rozjaśnianie mieszanką z kremem było przymiarką
do „mało wyraźny" i użytkownik je cofnął — kontrast trzyma keyline i poświata, nie jaśniejszy kolor.

Przy `prefers-reduced-motion` (i `html[data-motion="reduced"]`) wyciszane są przejścia i animacje,
`.plamek-echo`/`.plamek-splat` i chrapanko dostają `display: none`, a maska goo jest wyłączana
w modelu (`gooStrength(..., reduced) === 0`) — **nigdy** `transform: none !important` dla
`.plamek-face` czy `.plamek-mini`: na transformie siedzi pozycja, więc jeden taki zapis zamieniłby
maskotkę w kafelek przy oknie.

Warstwa szkła nie zapętla żadnej animacji dekoracyjnej (pilnuje tego selftest) — dlatego orbita
ładowarki (`.plamek-orbit*`) siedzi w `console.css`, a nie tutaj.

Obie powierzchnie przechodzą przez tokeny `--lg-*`/`--os-*` i siedzą na listach
`prefers-reduced-motion` oraz `[data-motion="reduced"]` — ograniczony ruch zdejmuje smugę, bryzgi
i ceremonię skoku (zostaje poślizg liczony w `motionReduced()` z `preferences.ts`); `transform`
maskotki jest nienaruszalny, bo na nim jedzie pozycja i kształt.

## Czytelność i wydajność

- Kontrast jest liczony, nie deklarowany: selftest kompozytuje `--lg-base`/`--lg-base-strong`/`--lg-fill`/`--lg-field`
  nad jasną klatką gry (140, przyciemnioną przez `--lg-bright`) i wymaga **7:1** dla tekstu podstawowego oraz
  **4,5:1** dla drugorzędnego — także dla wartości fallbackowych.
- `@media(min-width:1900px)` skraca rozmycie (18 px) i podnosi przyciemnienie: pełnoekranowe szkło na TV to
  najdroższa operacja w warstwie. `@media(max-width:820px)` daje krótsze rozmycie i mocniejszą ciemną bazę.
- `@media(pointer:coarse)` podnosi pola dotyku do 46 px, `@media(max-width:420px)` zmniejsza radii.
- `prefers-reduced-transparency` i brak `backdrop-filter` → powierzchnie stają się nieprzezroczyste
  (`--lg-base: #131318` / `#14141a`), bez utraty hierarchii. `prefers-contrast: more` dostraja szkło i krawędzie.
- `contain: layout paint` na okienku, jeden filtr na warstwę, brak animacji `filter`/`backdrop-filter`.
- Maska goo nie wisi na tekście ani na twarzy: `.plamek-face` jest rodzeństwem grupy `.plamek-goo`.
  Siłę liczy `gooStrength` (`.3` w bezruchu, pełnia przy bulwie, `drain` gasi ją w ostatnich 32%
  rozlewu), a `stdDeviation` (mnożnik `2.2`) jest kwantowany co `.02` i przepinany z histerezą —
  bez progu alfa znika każdy półprzezroczysty szczegół i „najciekawsza" faza mruga.

## Czego ta aktualizacja NIE robi

- Nie zmienia silników gier, ich HUD-ów rysowanych na canvasie, fizyki, transportu WebRTC/MQTT ani protokołu (wciąż wersja 1).
- Nie rusza tożsamości wizualnej Stalowego Frontu (jego HUD i ekrany pozostają przy własnym materiale).
- Nie dodaje „płynących" dyfuzji ani szumów w shaderach — to CSS, więc musi działać na telewizorze i na telefonie.
- Nie animuje zamknięcia powierzchni, które nie są `Sheet` (overlaye w `App.tsx`, ekrany Stalowego Frontu) —
  tam, gdzie React usuwa element natychmiast, zostaje wniknięcie bez powrotu.
- Nie rusza licznika 280 ms przyciemnienia między ekranami (README, `docs/console-testing.md`) — zmiana
  rytmu przejść to osobna decyzja, nie skutek uboczny stylu.
- Nie jest testem na realnym sprzęcie: nie było tu Chromium (blokada sieci w środowisku), więc nie zmierzono
  kosztu `backdrop-filter` na GPU telewizora ani w Safari/Firefox. To pozostaje na liście sprawdzeń
  `[docs/console-testing.md](console-testing.md)`.

## Sprawdzenia

```sh
npm run selftest:console   # LIQUID GLASS SELFTEST: selektory, tokeny, fallbacki, kontrast
npm run lint && npm run typecheck && npm run build
VITE_BASE=/JoyPad/ npm run build
```

Ręcznie (Chromium + telefon): otwórz bibliotekę → okienko Ustawienia/Pokój/Galeria (fokus, `Escape`, pilot),
pauzę w grze (tło okienka nad canvasem), HUD z 4 graczami, obrót i `prefers-reduced-motion`,
a na telefonie ekran dołączania (pola `lg-field`) i pilota w poziomie.

Do tego po tej zmianie:
- kliknij „Dodaj gracza", „Pokój", „Co nowego?" i ikonę dźwięku — okienko ma **wyrastać z tego przycisku**
  i **wracać do niego** przy zamknięciu (klik w tło, `Escape`, `X`, przycisk Wstecz na pilocie);
- otwórz i zamknij okienko strzałkami + Enterem na pilocie (punkt startowy = fokus, nie kursor);
- przejdź `Pokój → ustawienia`, otwórz okienko i poczekaj, aż dołączy pad — okno **nie może mrugnąć**
  ani restartować animacji przy odświeżeniu stanu;
- na telewizorze: przy 4 podłączonych padach QR nadal jest na ekranie; wyłącz przełącznik
  „Kod QR na dużym ekranie" → blok zmienia się w jedną linię z przyciskiem „Pokaż kod QR";
- „Odnów kod" → kod pod QR-em bez zmian, PNG się wymienia, a połączone pady nic nie tracą;
- wyciągnij kabel / uśpij komputer na chwilę → po powrocie sygnalizacji QR sam się zmienia
  (w panelu połączeń pojawia się informacja o odświeżeniu);
- telefon w trakcie dołączania (zeskanowany, ale łączący się) nie może zostać odrzucony przez wymianę
  klucza — na to jest 90 s łaski.

