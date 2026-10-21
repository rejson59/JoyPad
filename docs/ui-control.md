# JoyPad OS — sterowanie interfejsem (pad, pilot, klawiatura)

Dokument opisuje warstwę, w której **każdy klikalny element ekranu jest osiągalny kontrolerem**:
biblioteka, okienka, centrum pokoju, ustawienia, lab kontrolera, galeria Moments.
Menu, konfiguracja i wyniki każdej gry są tej warstwy tak samo jak biblioteka — zmieniło się to
   w tej turze (pad w menu gier) i opisują je §3 oraz §10. Same rundy (czołg, arcade) mają sterowanie nietknięte:
   w grze pilot służy grze, nie interfejsowi.

## 1. Architektura: jeden punkt wejścia

```
klawiatura / gamepad USB (rAF) / pilot z telefonu (padHost.onAdminCommand)
                                 │
                                 ▼
                    src/console/uiControl.ts        ← dispatch(command)
                    │            │             │
        ruch: stepFocus    skrót: runUiShortcut   reszta: onCommand (aplikacja)
                                 │
                                 ▼
              src/console/focusSurface.ts  (DOM: co jest nawigowalne, gdzie jest fokus)
                                 │
                                 ▼
                src/console/spatialNav.ts  (czyste liczby: wybór celu, rytm)
```

| Plik | Rola | Dlaczego osobno |
| --- | --- | --- |
| `spatialNav.ts` | algorytm przestrzenny, martwa strefa analoga, powtórzenia | zero DOM — testowalne w node i przeliczalne na dowolnym sprzęcie |
| `focusSurface.ts` | lista nawigowalnych elementów, obszary (`navScope`), `focusUiScope`, przewijanie, suwaki/listy | jedna lista selektorów = „każdy element jest osiągalny" jest faktem sprawdzalnym w jednym miejscu |
| `uiControl.ts` | nasłuchy (klawiatura, Gamepad API, `padHost`), `dispatch`, krok fokusa | właściciel `padHost.onAdminCommand`; aplikacja nie dokłada własnych skrótów |
| `uiContext.ts` | stos skrótów X/Y (po jednej powierzchni na wierzchu) + flaga „silnik działa" | podpowiedzi na ekranie i to, co robi przycisk, pochodzą z tego samego wpisu; telefon renderuje te same komponenty, ale nie wciąga przez to `padHost` do swojej paczki |
| `tvFullscreen.ts` | pełny ekran telewizora z maszyną stanów `off/pending/on/armed` | przeglądarka wpuszcza fullscreen tylko z gestu użytkownika |
| `plamek.ts` | choreografia maskotki: fazy, krzywe, masy farby, miny | czysty model — badany w node, bez DOM |
| `Plamek.tsx` | Plamek: taśma farby wokół celu, główka z tej samej ścieżki, smuga | jedna warstwa na ekran; w dialogu jego kopia |
| `PlamekOrbit.tsx` | ładowanie: kulka biegnąca po kole | bez zależności od nawigacji, współdzielony z telefonem |
| `UiHints.tsx` | pasek podpowiedzi na dole | renderowany **wewnątrz** powierzchni, którą opisuje |

## 2. Komendy

Wspólne dla klawiatury, pada USB i pilota z telefonu (`RemoteCommand` w `src/net/protocol.ts`):
`left` `right` `up` `down` `select` `back` `pause` `restart` `home` oraz nowe
`x` `y` `fullscreen`. Lista `REMOTE_COMMANDS` jest bramką hosta i to ona decyduje, co w ogóle
do niego dociera — **każdy nowy skrót musi do niej trafić**, inaczej pad zostanie grzecznie
zignorowany. `PROTOCOL_VERSION` pozostaje `1`: starszy telefon wyśle tylko znaną mu listę,
a starszy host zwyczajnie odrzuci nieznane komendy (`isPadMessage` przyjmuje każdy string,
bramką jest lista).

Mapowania:

* Klawiatura: strzałki, `Enter`/`Space` → `select`, `Escape`/`Backspace` → `back`, `Home` → `home`,
  `Tab`/`Shift+Tab` → `right`/`left` (`preventDefault`, żeby przeglądarka nie przeskakiwała fokusa obok silnika).
* Gamepad API (mapowanie standardowe): `0`→A `1`→B `2`→X `3`→Y `8`→Select(back) `9`→Start(home),
  krzyżak `12..15`, **oraz** lewy analog. `interfaceGamepad()` przedkłada `mapping === 'standard'`,
  ale akceptuje też kontrolery z pustym mapowaniem (≥16 przycisków) — tanie pady i stare sterowniki
  nie mogą wyglądać jak „pad się zgubił".
* Pilot z telefonu: te same komendy przez `{ t: 'command' }`. Wyłącznie administrator
  (`padHost` sprawdza `admin()?.connId === id`), więc gracz nie poruszy cudzego kursora.

## 3. Ruch po ekranie

`stepFocus(dir)`:

1. wybiera obszar: `dialog[open][data-ui-scope]` → ostatni `[data-ui-scope]` → `dialog[open]`
   → `.os-library` (kolejność nie jest przypadkowa: okienko w warstwie górnej wygrywa z nakładką);
2. zbiera cele (`NAVIGABLE_SELECTOR`: linki, przyciski, `summary`, pola, `select`,
   `role=switch|tab|button`, `tabindex`), odrzuca niewidoczne, `inert`, `opacity < .08`,
   `pointer-events: none` i mniejsze niż 8 px;
3. nadaje każdej pozycji identyfikator sekcji (`nav, header, footer, section, .os-game-rail`, …) —
   sąsiedztwo w tej samej grupie jest tańsze niż sąsiedztwo na ekranie;
4. liczy `pickNext`: odległość po **krawędzi wiodącej** + odchylenie prostopadłe × `2.4`,
   bonus `.58` za ten sam pas i `.88` za tę samą grupę;
5. suwak, lista i **stepper opcji** (`data-ui-stepper`): strzałki w poziomie najpierw
   **zmieniają wartość** (`stepRange`, `stepSelect`, `stepStepper` → zdarzenie `ui-step` na
   elemencie), `select` też przestawia o jeden (tak robi natywny `<select>`), a `↑/↓` przenoszą
   fokus na inną pozycję; pola tekstowe dostają wyłącznie `Escape`;
6. brak celu w kierunku → zawinięcie w obrębie grupy, a przy końcu grupy → przewinięcie ekranu.

Fokus jest prawdziwym fokusem DOM. Dzięki temu: Kafelki same aktualizują podświetloną grę
(`onFocus`), `:focus-visible` nadal rysuje kontur, czytniki ekranu nadążają, a klikanie myszą
też przesuwa Plamka — interfejs sprawia wrażenie żywego bez żadnej magii.

### Które ekrany są powierzchnią nawigacji

Zakresem steruje atrybut `data-ui-scope`, a punktem wejścia `data-ui-focus`. Nazwa sugeruje
okienka i tak faktycznie zaczynało (`Sheet`), ale znaczy tylko tyle: „nie wychodź z focusem poza ten
kontener". Z tego samego prawa korzystają pełnoekranowe widoki gier — nie są `dialog`iem, ale są tak
samym ekranem wyboru, jak biblioteka:

| `data-ui-scope` | Gdzie | Wejście (`data-ui-focus`) |
| --- | --- | --- |
| `sheet` | okienka systemowe, w tym pauza nad rundą | przycisk z `data-ui-primary`, inaczej pierwszy fokusowalny |
| `game-menu` | `GameSetup` — opcje, kadencja, START, zasady | `.cine-start` |
| `game-results` | `GameResults` — momenty, propozycje ekipy, rewanż | `.cine-start` (REWANŻ) |
| `tank-setup` | konfiguracja Stalowego Frontu w `src/App.tsx` | `[data-ui-entry]`, czyli DO BOJU |

Każdy z nich woła `focusUiScope(root)` przy montowaniu. Bez tego pierwszy ruch pilota nie miałby
czego przenieść: świeży ekran ma fokus na `body`, a `stepFocus` liczy krok od bieżącego elementu.
Nie wchodzimy w to, gdy fokus już siedzi w środku (ktoś kliknął myszą) albo w otwartym dialogu
(modal rządy przejmuje sam).

### Rytm i martwa strefa (`NAV_REPEAT`)

| Parametr | Wartość | Znaczenie |
| --- | --- | --- |
| `deadZone` | `.35` | kołowa (po długości wektora), więc przekątna nie jest „szybsza" od osi |
| `firstMs` | `420` | krótkie pchnięcie = dokładnie jeden krok; powtarzanie startuje po 420 ms trzymania |
| `stepMs` | `130` | rytm kolejnych kroków |
| `rushMs` | `2600` | po 2,6 s krok przyspiesza do `stepMs * .62` (galerie, długie listy) |

Powtórzenia liczy **strona, która czyta analog** (telefon dla pilota, TV pada USB) i wysyła
`up/down/left/right` jako osobne komendy. Telewizor pozostaje bezstanowy, a sieć nie psuje rytmu.

## 4. Skróty X i Y

Powierzchnia zgłasza, co znaczą X/Y — `pushUiContext({ source, x, y })` (czyszczenie w `useEffect`).
Ten sam wpis karmi `UiHints`, więc podpis na dole ekranu i działanie przyciska nigdy się nie rozjadą.
Re-render biblioteki pod otwartym okienkiem podmienia wpis **w miejscu** (kolejność to kolejność okienek).

| Powierzchnia | X | Y |
| --- | --- | --- |
| Biblioteka | Dodaj gracza (ekran połączeń) | Dźwięk menu on/off |
| Centrum pokoju | Blokada pokoju | Odnów kod QR |
| Ustawienia | Ograniczony ruch | Dźwięk systemu |
| Pozostałe okienka | — | — |

`runUiShortcut` zwraca `false`, gdy skrót nie istnieje — wtedy komenda leci dalej, do aplikacji.

## 5. Plamek — maskotka celu

Zamiast pierścienia fokus obsuwa **plama farby z buźką**: kołnierz wokół przycisku, z którego
wyrasta główka — to jedna ścieżka SVG, nie dwa elementy, więc nie ma jak jej „stać obok".
Przy skoku farba jest wciągana z kołnierza w bulwę, leci łukiem ze smugą **połączona mostem
z farby ze startu**, uderza w cel i wylewa z siebie nowy kołnierz, który po chwili dokleja
się do przycisku. Geometrię, czasy, krzywe lotu, drganie kształtu i miny liczy `plamek.ts`
(model bez DOM), `Plamek.tsx` tylko przepisuje je na atrybuty `d` trzech ścieżek farby (`.plamek-collar`,
`.plamek-src`, `.plamek-blob`), szyi mostu (`.plamek-strand`), ech i bryzgów oraz na zmienne CSS
poświaty (`.plamek-glow --halo-*`) i twarzy (`--ball-*`) — w warstwie nie ma już żadnego `div`-a
z obwódką.

Uwagi, które wynikają z tego dokumentu, a nie z kaprysu graficznego:

- fokus nadal jest prawdziwym fokusem DOM — Plamek tylko go **rysuje**, więc kafelki
  świecą się przez `onFocus`, czytnik ekranu nadąża, a kliknięcie myszą przesuwa maskotkę;
- `getBoundingClientRect()` celu + `PLAMEK_INFLATE = 5 px` (farba dotyka krawędzi przycisku,
  nie wisi obok), pościg na czterech **krawędziach**
  ze stałą czasową (`smoothTo`; bez sprężyny — sprężyna podskakuje i przyspiesza na 120 Hz),
  żadnego `scale()` na kontenerze (rozciągnęłoby obwódkę);
- `gooTension` + `haloRadiusFor`: im dalej od celu, tym bardziej kształt domyka się do pigułki,
  więc skok jest okrągły, a nie prostokątny;
- obwódka **zarasta z dwóch stron**: `wrapFor` (jedna liczba 0…1 na klatkę) to **ułamek obwodu
  liczonego długością łuku**, nie kątem, więc dwa fronty taśmy (`.plamek-collar`) schodzą się pod
  przyciskiem z tą samą prędkością w pikselach na kaflu i na wąskim pasku; `is-fuse` na poświacie
  daje jeden puls w momencie domknięcia, a `gather` odtwarza to w tył (`dent` + cofający się
  `wrap`), więc farba wraca po bokach do główki zamiast zniknąć;
- pętla `requestAnimationFrame` żyje dopóki coś się nie ustabilizuje albo przez `followFrames`
  (30) klatek po zdarzeniu (tyle co morfing okienka) — w bezruchu zero kosztu;
- farba nie wchodzi do środka kafla i ma `pointer-events: none`; główka siedzi **nad przyciskiem** (awaryjnie
  pod, gdy nie ma światła — w okienku granicą jest dół jego nagłówka), wtopiona w obwódkę
  i sklejona z nią szyjką farby, więc ani nie zasłania napisu, ani nie wisi w powietrzu;
  `landFor` = `perchFor`, toteż lot kończy się dokładnie w miejscu postoju;
- `motionReduced()` zamienia ceremonię w poślizg i zdejmuje smugę/bryzgi (patrz `docs/plamek.md`);
- **startem rytmu rządzi komenda, nie DOM**: `dispatch` woła `notePlamek('lean', kierunek)`
  przed `stepFocus`, a widok odpala w tym momencie `takeOff()`. `focusin` tylko dokłada cel.
  Widok **nie nasłuchuje `focusout`** — przeglądarka wysyła go przed `focusin`, więc chowanie
  maskotki przy utracie fokusa kasowało cały lot (plama „pojawiała się" na nowym elemencie).
  Znikanie idzie przez `scheduleHide()` z odroczeniem `PLAMEK.hideDelayMs` i ponownym
  przemiarem `document.activeElement`, a `PLAMEK.hopGraceMs` pozwala, żeby powrót
  z zamkniętego okienka też był skokiem od starego kształtu;
- most `.plamek-strand` + kropla `.plamek-anchor` (model: `strandFor`) ciągną się od przycisku
  do kulki, cienieją `~(1 - p/0.78)^1.7` i pękają przed lądowaniem — to one robią scalenie
  startu z lotem; `flightCurve` (wykładnik 2.2) przyspiesza zerwanie i miękko sadza cel;
- drga wyłącznie **kształt**: `wobbleValue` (τ 210 ms, okres 132 ms) wchodzi w `--ball-sx/sy`
  z `sy = 1/sx`, więc pole plamy jest zachowane, a pozycja ani razu nie przekracza celu.

W dialogu Plamek ma **własną kopię** (`<Plamek scope={dialog} />`), bo `::backdrop` modala
maluje ponad każdym elementem `fixed` poza nim; tam liczy współrzędne względem karty i jest
`position: absolute` (containment dialogu i tak tworzy blok zawierający).

Pełna specyfikacja ruchu, min i ładowarki: `docs/plamek.md`.

## 6. Podpowiedzi

`UiHints` — pasek pigułek (`◀▶▲▼`, `A`, `B`, `X`, `Y`, a przy uzbrojonym pełnym ekranie także
sygnał „telewizor musi potwierdzić"). W bibliotece mieszka w `.os-footer`, w okienkach jako stopka
`.os-sheet-content` — z tego samego powodu co Plamek: poza modalem byłby niewidoczny.
Nie renderuje się w ogóle, jeśli silnik interfejsu nie działa na tym urządzeniu (`useUiEngineActive`),
żeby telefon nie pokazywał strzałek, których nie ma.

## 7. Pełny ekran telewizora z pada

Przeglądarki uruchamiają pełny ekran tylko w obrębie aktywacji użytkownika; pakiet z WebRTC nią nie jest.
Stąd maszyna stanów: `off → pending → on`, a przy odmowie `armed`.

* `toggleTvFullscreen()` wychodzi z pełnego ekranu, gdy jest włączony.
* Żądanie bez gestu na TV (`navigator.userActivation.isActive === false`) nie jest wysyłane w pustkę:
  przechodzimy do `armed` i mówimy o tym komunikatem.
* `satisfyTvFullscreen()` jest wołane z **naprawdę** ludzkich zdarzeń na telewizorze
  (keydown, klatka pada USB) i domyka żądanie. Przypadkowy klawisz nie wyrzuca z pełnego ekranu
  (`on` jest stanem końcowym).
* `back` wychodzi z pełnego ekranu, zanim zacznie zamykać czokolwiek innego.

## 8. Telefon jako pilot

`src/pad/JoypadController.tsx`:

* `NavStick` — gałka nawigacji (portret: obok bloku OK/X/Y; poziom: w środku krzyżaka).
  Martwa strefa i powtórzenia liczone na telefonie, na TV lecą dyskretne komendy.
  Powtórzenia **bez haptyki** (inaczej kciuk dostawałby wibrację 8×/s).
* Krzyżak dotykowy został obok gałki — kto woli celować, ten klika.
* X/Y w portrecie w bloku pod OK, w poziomie w górnych narożnikach krzyżaka (zero nowego wzrostu
  wysokości na niskich ekranach).
* Administrator ma „Pełny ekran TV".

## 9. Utrata połączenia i wielu graczy

* Pad USB: przy `!pad || !pad.connected` silnik zeruje zapamiętany kierunek i zbiór wciśniętych
  przycisków, więc odłączenie w połowie ruchu nie zostaje „wciśnięte na stałe". `window blur` robi to samo.
* Zdarzenia `gamepadconnected`/`gamepaddisconnected` dają toast na telewizorze — brak padów w połowie
  wieczoru nie wygląda jak zawieszony interfejs.
* Pilot z telefonu: rozłączenie czyści `adminId` w `padHost`, a slot wracającego pada jest
  rezerwowany 60 s (`returningSlots`). `onAdminCommand` jest warunkowany tożsamością admina,
  więc po przekazaniu administracji stary telefon nie ruszy kursora.
* Wielu graczy: menu obsługuje wyłącznie administrator; reszta steruje swoimi postaciami
  w grach i zgłasza intencje, tu nic nie może „przejąć kursora".

## 10. Granica odpowiedzialności

Silnik przejmuje komendy tylko wtedy, gdy interfejs ma czym sterować. Bramka jest jedna,
w `JoypadApp`:

```ts
const uiOwnsInput = booted && !state.room.dimmed && (!selected || state.screen !== 'game');
```

* `state.screen` zgłasza sama gra (`padHost.setScreen(stage)`: `menu` | `setup` | `game` | `over`).
  Runda — `game` — jest jedynym stanem, w którym pilot nie dotyka interfejsu. W menu, w konfiguracji
  i w wynikach steruje nią silnik, więc Plamek biega po ustawieniach każdej gry tak samo jak po
  bibliotece (o to chodzi w tym rozdziale; wcześniej menu gier miały własne, okrojone mapowania).
### Trzy zasady, które trzymają pauzę i wyjście w ryzach

1. **`select` nie prześwituje przez modal.** Gdy fokus wypadnie z otwartego okienka
   (panel potwierdzenia podmienia przyciski w DOM-ie i aktywny element ląduje na `body`),
   `dispatch` NIE oddaje komendy aplikacji: przywraca fokus w oknie (`focusUiScope(modal)`)
   i mówi o tym Plamkowi (`blocked`). Oddany `select` był dokładnie tą drogą, którą „Wróć do
   biblioteki" zamieniało się w „wracamy do gry".
2. **Wyjście jest silniejsze niż pauza.** Intencja „wychodzę" żyje w `src/lib/exitWish.ts`
   (`wishToLeave` / `isLeaving` / `clearLeaveWish`). Od `wishToLeave()` żadne przełączenie pauzy
   i żaden start rundy nie przechodzą: ani `back`, ani `pause` z telefonu, ani powtórzone
   `select` z przytrzymanego przycisku, ani zamknięcie okienka pauzy (X, tło, Esc). Flaga jest
   w module, nie w `useRef`, bo `react-hooks/immutability` zabrania pisać refa w handlerze, a
   `useState` dołożyłby re-render w kadr kurtyny. `clearLeaveWish()` woła montaż widoku gry i
   start rundy — inaczej wyjście z poprzedniego podejścia zabiłoby START następnego.
3. **Nakładki, które nie są `dialog`iem, domyka surface.** `PadHostPanel` otwarty nad areną to
   zwykły `div` — `data-ui-scope`/`dialog[open]` go nie dotyczą, więc `handleCommand`/`handleRemote`
   gier przejmuje dla niego `back` i `pause` **przed** jakąkolwiek pauzą. Bez tego panel dało się
   zamknąć tylko kliknięciem w tło, a Escape w trakcie rundy pauzował grę.
4. **Podmiana ekranu jest faktem, kurtyna kosmetyką.** `useCurtain.begin()` nie wolno wyjść
   bez `swap()`: gdy inna przejściówka jeszcze leci, podmieniamy od razu; gdy
   `startViewTransition` odrzuci klatkę (karta w tle, stare WebKit), `run()` i tak dojeżdża
   przez `finally`. Wcześniejsze `if (busy.current) return;` gubiło wyjście kliknięte w
   trakcie transferu — bez żadnego komunikatu.

* Ta sama flaga decyduje o **dwóch** rzeczach: o `useUiControls({ enabled })` i o montowaniu Plamka
  (`{uiOwnsInput && <Plamek />}`). Nie ma stanu, w którym pierścień wskazuje cel, którego pilot nie
  ruszy, ani ruchu bez maskotki. Okienka mają swoją kopię w swoim obszarze i zostają przy swoim.
* `dispatch` i nasłuch klawiatury wpuszczają komendy dodatkowo, gdy otwarty jest `dialog` —
  przeglądarka trzyma fokus w modalu i `enabled` jest wtedy nieistotne (pauza nad rundą).
* Poza bramką każda komenda leci do `onCommand` gry: strzałki sterują czołgiem, `start` pauzuje,
  `back` wznawia. W menu i wynikach własne `handleCommand` gry nie zajmuje się już ruchem —
  zostaje `home`, `back`, `pause` i zatwierdzenie rzucone „w pustkę" (fokus na `body` albo na
  tekście, czyli START robi to, co sugeruje duży napis).
* Ekran startowy dostaje `joypad-dialog-command` w całości (A/B/Start pomijają boot).
* W grach nie zmieniamy układów sterowania; HUD Stalowego Frontu w `src/App.tsx` pozostaje osobny.

Zniknął przy tym `resultsNavigation` (płaska lista „następny przycisk na ekranie wyników", ±1 bez
geometrii): miał własny nasłuch klawiatury i własny skrót `select`, więc kolidował z nawigacją —
dwa miejsca użycia: `GameResults` i `ArcadeGameView`. Jedna nawigacja w projekcie jest tańsza i lepsza.

## 11. Jak dodać powierzchnię

1. Oznacz ją `data-ui-scope` (jeśli to nie `dialog`), ewentualnie `data-ui-focus="selektor"`
   dla punktu wejścia — bez tego startujemy od elementu najbliżej środka ekranu. Dotyczy to także
   ekranów gier: menu i wyniki, w których nie ma `Sheet`, dostają ten sam parę atrybutów i
   `focusUiScope` na starcie (§3).
2. Jeśli X/Y mają coś znaczyć, wypchnij kontekst: `pushUiContext({ source, x, y })` z czyszczeniem.
3. Nic nie podpinaj do klawiatury ani pada — `uiControl` już to robi. Własne `keydown`
   tylko dla gestów, których nie ma w liście komend (na przykład kombinacje z modyfikatorami).
4. Zabezpiecz w `scripts/console-selftest.ts` (sekcja UI CONTROL) — liczby i kontrakt źródłowy,
   nie zrzuty ekranu.
5. Jeśli nowy ekran rysuje canvas albo ma własne nasłuchy klawiatury, zaczynaj handler od
   `if (uiOwnsKeyboard(e)) return;` (`src/lib/inputOwnership.ts`) — PRZED `preventDefault`.
   Pięć silników tak robi, od tury 11; bez tego `Esc` zamyka okienko i *jednocześnie*
   przełącza pauzę, a strzałki nie da się użyć do przewinięcia modalu ani do `<select>`.

## 12. Testy

* `selftest:arcade` → **KEYBOARD OWNERSHIP**: każdy silnik rezygnuje z klawisza, gdy nad areną
  stoi modal albo gracz coś wpisuje, i robi to przed `preventDefault` (inaczej kradnie strzałki
  okienku, zanim zapadnie decyzja).

* `selftest:console` → **UI CONTROL**: martwa strefa i rytm powtórzeń (`NAV_REPEAT`), wybór celu
  (pas, grupa, krawędź wiodąca), `notePlamek` (rytm zdarzeń i fizyka cieczy), miernik czekania,
  skróty X/Y, pełny ekran, kontrakt pilota oraz — od tury 10 — **powierzchnie menu gier**:
  że `data-ui-stepper` istnieje i jest regulowalny, że `GameSetup`/`GameResults`/`tank-setup` mają
  zakres i wejście, że klawiatura gier nie ma już własnego nasłuchu, i że maskotka wisi na tej samej
  bramce co `useUiControls`; pilnuje też trzech zasad z §10 (modal zatrzymuje `select`,
  wyjście blokuje pauzę, kurtyna nie gubi podmiany) pilnuje też, że `PauseSheet` nie trzyma flagi
  wyjścia w refie.
* `selftest:platform` — ROOM/ANTI-SPAM/PROTOCOL/PROFILE/MOMENTS. ANTY-SPAM pilnuje, że
  propozycje nie są darmowe: cooldown, duplikat, sufit w oknie i kłódkę (autora oraz admina)
  liczy telewizor, a wycofanie głosu pozostaje zawsze wolne. Pakiet RESULTS NAVIGATION został wycofany
  razem z modułem; jego rolę przejął UI CONTROL.
* Liczby modelu Plamka (poza DOM) — patrz `docs/plamek.md`.
