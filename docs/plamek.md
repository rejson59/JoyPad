# Plamek (ang. Splash) — maskotka celu

Plamek to plama pomarańczowej farby z buźką, która pokazuje, gdzie jesteś. Zastąpił
sprężysty pierścień fokusa (`FocusRing.tsx`, skasowany), bo pierścień był dwiema sztywnymi
obwódkami: informacja o celu mogła być czymś, co żyje między elementami, a nie ramką, która
przeskakuje.

Trzy zasady trzymają to w ryzach:

1. **Jeden materiał i jedna ścieżka.** Kołnierz wokół przycisku i główka z buźką to **jedno
   `d`** (`.plamek-collar`), nie dwa elementy, które mogą co najwyżej na siebie nachodzić.
   Przy skoku farba jest wciągana z kołnierza w bulwę (taśma cienieje w miejscu startu), bulwa
   leci łukiem ze smugą **połączona szyją z resztką na starym przycisku** (`.plamek-strand`),
   uderza w cel (bryzgi) i wylewa z siebie nowy kołnierz, który obejmuje przycisk. Nigdy nie ma
   „starego pierścienia plus nowej kulki" — ani „kulki, która pojawiła się znikąd", ani kulki,
   która **stoi na** pierścieniu.
2. **Fazy są przerywalne.** Szybkie ciągnięcie gałki przechodzi w poślizg bez ceremonii,
   a przekierowanie w locie podmienia cel, nie początek animacji.
3. **Startem rządzi komenda, nie fokus.** Rytuał zaczyna `lean` z silnika ( wysyłany przed
   `stepFocus`), a `focusin` tylko koryguje cel. `focusout` nic nie gasi — patrz
   „Rytm zdarzeń" poniżej.
4. **Drga kształt, nigdy pozycja.** Bezwładność farby to `wobbleValue` (wygaszony oscylator)
   na osiach `--ball-sx/--ball-sy`; środek kulki ani razu nie przekracza celu, więc nie ma
   sprężystego podskoku.
5. **Bezruch kosztuje zero.** Pętla `requestAnimationFrame` kręci tylko dopóki coś się dzieje
   (`hidden` ją wygasza); mruganie i drzemka siedzą na timerach, a nie w klatkach.

Logika: `src/console/plamek.ts` (model, zero DOM) i `src/console/Plamek.tsx` (widok).
Ładowarka: `src/console/PlamekOrbit.tsx`. Warstwa wizualna: `src/console/liquid.css`
(`.plamek*`) i `src/console/console.css` (`.plamek-orbit*`).

## 1. Model i widok

`plamek.ts` nie dotyka DOM-u — liczy choreografię, krzywe, grubości i miny. Dzięki temu
jest badany w `selftest:console` bez przeglądarki, a `Plamek.tsx` pozostaje listą zapisów
stylu. Widok pisze **jedną** właściwość na raz i tylko na dwóch elementach (halo + body),
reszta (echa, bryzgi) dostaje swój `cssText` przy okazji.

Stan to maszyna faz:

```
hidden → hug ⇄ gather → fly → impact → pour → hug
                 ⇘ (poślizg) ─────────────────↗
```

| Faza | Czas | Co robi |
| --- | --- | --- |
| `gather` | `170 ms` | taśma **zostaje na starym przycisku**, a farba z niej jest wciągana do bulwy: `wrap` cofa się znad dolnej krawędzi, `dent` zapada materiał, `spread` rośnie `7.5 → ~blobR` |
| `fly` | `240 + 0.55·px`, sufit `560 ms` | kulka leci po łuku kwadratowym (podskok do 66 px) na krzywej `flightCurve`, most z farby ciągnie się za nią, smuga z pięciu ech |
| `impact` | `150 ms` | spłaszczenie na górnej krawędzi przycisku (tam, gdzie główka siada) + bryzgi farby + nabite drganie kształtu |
| `pour` | `330 ms` | farba wlewa się u góry i **spływa DWIEMA strugami po bokach**, domykając obwód pod przyciskiem: `wrapFor` 0 → 1 jest **ułamkiem obwodu** (łuk, nie kąt), a kształt celu poszerza `pourEdges` (anizotropowo: dół 1.55×, góra .35× z `pourSpread = 9`) |
| `hug` | dojenie stałą czasową + `gripMs 200` | otoczka dociera do przycisku bez podskoku; najpierw ściąga nadmiar (`gripOffset`), potem trzyma |
| `slide` | `240 ms` | poślizg: bez składania, kształt rozciąga się w kierunku ruchu |
| `hidden` | — | brak fokusa w bieżącym obszarze; `hideDelayMs 160` zwłoki, `hopGraceMs 900` na powrót |

`PLAMEK` w module trzyma wszystkie czasy (`gatherMs 170`, `flyBaseMs 240` + `flyPerPx .55` z
sufitem `flyMaxMs 560`, `impactMs 150`, `pourMs 330`, `gripMs 200`, `fuseMs 340`, `gooPad 48`,
`hideDelayMs 160`, `hopGraceMs 900`, `ritualGapMs 150`) — zmiana rytmu to jedna tabela, nie
polowanie po plikach.

### Rytm zdarzeń: skok zaczyna komenda, nie fokus

Poprzednia wersja wyglądała jak „plama po prostu pojawia się na nowym przycisku", bo widok
chował maskotkę w `focusout`. Przeglądarka wysyła `focusout` **przed** `focusin`, więc przy
każdym kroku kolejność była: zgaś → zapal się od nowa, czyli faza `hidden` → `sitOn`
(pojawienie się na celu) i żadnego lotu. Kontrakt jest teraz inny:

* `lean` z silnika (przed `stepFocus`) woła `takeOff()` — zbieranie zaczyna się, kiedy
  stary element **nadal jest aktualny**, więc `from` to prawdziwa geometria startu;
* `focusin` woła `hop()` i tylko dokłada cel (`aim`) — rytm pary decyduje o `ritual`/`slide`;
* `focusout` nie istnieje jako zdarzenie w widoku. Zniknięcie liczy `scheduleHide()`: odczek
  `hideDelayMs` (160 ms), przemiary `document.activeElement` i dopiero gdy nadal nie ma na
  czym stać — `hidden`. Wygrany wyścig (`focusin` w tym oknie) anuluje ukrywanie;
* powrót w oknie `hopGraceMs` (900 ms, np. po zamknięciu `<dialog>`) nie jest „pojawieniem
  się": widok wstawia stary kształt i leci **od niego**, więc zamknięcie okienka też jest
  skokiem.

Wszystkie cztery punkty są pilnowane w `selftest:console` (sekcja `UI CONTROL`) — powrót do
synchronicznego `focusout` odpala test, zanim ktoś zdąży powiedzieć „działa".

### Most z farby: dlaczego skok wygląda na scalenie

`strandFor(od, do, p, rozmiarKulki)` zwraca kapsułkę od punktu startu do aktualnego miejsca
na łuku: grubość `(1 - p/0.78)^1.7`, `alpha` tego samego rzędu, a przy `p >= 0.78` — `null`
(pęknięcie). Ostatnia kropla na starym przycisku nie jest osobnym elementem — jest **pierwszym końcem
szyi** (`neckPath` zaczyna się od koła o średnicy `anchor`, kurczącego się kwadratem), więc zero
szerokości nigdy nie jest krawędzią ani zniknięciem. Efekt: start i lot są jednym
kawałkiem farby, a nie dwiema animacjami obok siebie. Przy mikroruchu (< 2 px) mostu nie ma
wcale — inaczej mrugałby przy każdym drgnięciu fokusa.

`flightCurve(t) = 1 - (1-t)^2.2` robi resztę: zerwanie jest szybkie (napięcie powierzchniowe
pęka), dojście miękkie (wpuszcza się w przycisk). Symetryczne `easeInOutSine` dawało
„odjeżdża i hamuje", czyli dokładnie to, czego nie widać.

### Drganie kształtu: fizyka bez podskoku

`WOBBLE = { tauMs: 210, periodMs: 132 }`, `wobbleKick(w, amount, now)` (suma z przewagą
świeżego uderzenia, limit `±0.3`) i `wobbleValue(w, now) = amp·e^(-age/τ)·cos(2π·age/T)`.
Widok dokłada go do osi kulki i tylko do nich:

```ts
head.sx = drag + shake;
head.sy = 1 / Math.max(.4, head.sx);   // pole zachowane
```

`0.3` amplitudy to szczyt; po `3τ` model zwraca dokładnie `0`, więc pętla gaśnie. Ujemna
amplituda jest celowa (`select` i kiwnięcie `confirmLean` płasko dociskają plamę) —
`squashFrom` też trzyma pole (`short = 1/long`), dlatego farba zmienia proporcje, nigdy
objętość.

### Płynność: stała czasowa, nie sprężyna

Ruch wygładza `smoothTo(from, to, tauMs, dtMs)` — czysty pościg wykładniczy z czasami
`PLAMEK_SMOOTH` (`edge 118 ms`, `edgeLead 76`, `edgeTrail 196`, `radius 140`, `head 88`,
`size 132`, `gaze 96`). Świadomie **bez** sztywności i tłumienia:

- sprężyna podskakuje na końcu (właśnie to wyglądało na „sprężyste"), a `1 - e^(-dt/tau)`
  jest monotoniczne — ani jednego przekroczenia celu;
- sprężyna liczona „na klatkę" na ekranie 120 Hz jest dwa razy ostrzejsza niż na 60 Hz.
  Tu `dt` wchodzi do wzoru, więc rytm jest identyczny na 50, 60 i 120 Hz;
- po powrocie karty z tła nie ma długiego dojazdu: `dt` ma limit 64 ms na klatkę.

### Zachowanie masy, nie dekoracja

`haloAppearance(mode, progress)` steruje grubością i nieprzezroczystością otoczki w tym samym
krzywym kierunku, w jakim zmienia się jej obwód: krótszy obwód = grubsza farba. Dlatego
zebranie otoczki w kulkę wygląda jak fizyka, a nie jak `opacity: 0`. W locie i w momencie
uderzenia otoczka ma `alpha: 0` — cała farba jest w kuli.

### Taśma farby: jeden kształt, nie obwódka z kulką

Przez pięć rund plama była złożona z osobnych elementów HTML: `.plamek-halo` (border dookoła
celu), `.plamek-body` (kulka), `.plamek-front`, `.plamek-neck`, `.plamek-drip`. Recenzja
użytkownika nazwała to wprost: „kulka nie wnika w pierścień, tylko na nim staje" i „to nie
rozlew, a osobne lasso zarzucone na przycisk". To nie było niedostrojenie liczb — to była
konsekwencja struktury: **dwa elementy HTML mogą na siebie co najwyżej nachodzić**, a `border`
o grubości 3 px zawsze będzie czytał się jako linia, nie jako materia.

Dziś farba to **jedna zamknięta ścieżka `<svg>`** (`.plamek-collar` w grupie `.plamek-goo`),
którą składa `plamek.ts`:

1. `rimPoint(box, u)` + `rimPerimeter` — obrys celu liczony **długością łuku**, nie kątem.
   `u = 0` wypada na środku górnej krawędzi (tam, gdzie siada główka), `u = 0.5` na dole.
   Dzięki temu fronty farby idą ze stałą prędkością w pikselach: na kaflu 200 × 200 i na pasku
   300 × 54 te same 3/4 czasu lewania to to samo miejsce obwodu. Przy masce kątowej struga
   pędziła przez długie krawędzie i pełzła przy krótkich — i to był główny powód, dla którego
   całość wyglądała jak zarzucane lasso.
2. `bandEdges(box, opts)` — dwie krawędzie taśmy: zewnętrzna = obrys + grubość, wewnętrzna =
   obrys − uchwyt. Grubość jest **anizotropowa** (`aniso: { top: .55, side: 1, bottom: 1.4 }`),
   więc farba opada: pod przyciskiem kałuża jest grubsza niż nad nim, a `wrap` decyduje, jak
   dużo obwodu jest już zalane (dwa fronty, lustrzane, z okrągłymi czółkami).
   Sama grubość **nie jest stałą**: `paintWeightFor(box)` liczy ją z krótszego boku elementu
   (`short · .115`, klamry 2.8…9.5 px). Wcześniejsze 7.5 px wyglądało jak ramka na chipie 26 px
   i jak nitka na kaflu 168 px — „za gruby na małych przyciskach" i „mało wyraźny" to ten sam
   błąd z dwóch stron. Górna anizotropia to `.55`, nie `.35`: przy `.35` na małym kaflu krawędź
   nad napisem miała pół piksela i nie było jej wcale.
3. **Główka jest `lobe` tej samej ścieżki**: `opts.lobe` × `lobeSize` (liczone z rozmiaru
   buźki) dodaje dzwonek Gaussa wzdłuż łuku wokół `u = lobeAt`. Nie ma więc drugiego elementu,
   który mógłby „stać obok" — bulwa jest częścią kołnierza, a rozmycie tylko ją podkreśla.
   Dwa warunki, oba z przeglądu: `lobeAt` bierze się z `perchFor(...).side`, więc garb siedzi
   **tam, gdzie naprawdę przysiadła buźka** (na górnym rzędzie topbara główka musi zejść pod
   przycisk i dawniej puchła po przeciwnej stronie), a `crownFor(box)` zeruje garb, gdy element
   nie ma płaskiej góry — na ikonie 30 × 30 dokładał materiał tam, gdzie rant sam się zaokrągla,
   i wychodziło jajko. Na kole główkę trzyma zamiast tego krążek (`blobPath` z `restDisc`),
   zlany z pierścienia przez ten sam `<filter>`: nadal jedna bryła, tylko bez zgrubienia u góry.
   Przy starcie `dent` wciąga materiał z powrotem: taśma w tym miejscu cienieje (farba
   fizycznie odchodzi od przycisku), a nie znika.
4. `ribbonPath` → `smoothLoop` — Catmull-Rom na bezierce, z zaokrąglonymi czapami na
   końcach (czoła strug są grube, bo tak jest na froncie cieczy). Przy pełnym domknięciu
   punkty styku się pokrywają i szew jest zszywany bez czapy.
5. `dripTail(box, wrap, thickness)` + `teardropPath` — kropla jest **podścieżką tego samego
   `d`**, więc maska goo łączy ją z taśmą szyjką: wisi, pęcznieje do 1.9× grubości farby
   (ale nigdy więcej niż połowa wysokości przycisku — dłuższe to nitka), od `.95` daje się
   wciągać (krótsza = szersza, bo objętość nie znika), a w zwarciu nie ma jej wcale.
   Dawniej liczona była z rozmiaru główki i miała 4 px — stąd „jaka kropla?".
6. `blobPath` / `neckPath` — bulwa w locie (półosie `r·sx`, `r·sy` z `squashFrom`, plus ogon
   `tail` w pikselach w kierunku przeciwnym do ruchu) i szyja mostu: zwęża się do
   `pinch`, więc **pęknięcie jest geometryczne**, a nie `opacity: 0`.

Warstwa ma więc trzy miejsca, które coś rysują: `.plamek-glow` (poświata i puls domknięcia,
poza maską), `<svg class="plamek-liquid">` z grupą `.plamek-goo` (cała farba: `.plamek-src`,
`.plamek-strand`, `.plamek-collar`, `.plamek-blob`, pięć `.plamek-echo`, trzy `.plamek-splat`)
oraz `.plamek-face` (oczy, uśmiech, chrapanko — DOM, nad farbą). Widok pisze do atrybutów
`d`/`cx`/`cy`/`r`/`fill-opacity` **tylko gdy wartość się zmieniła** (`setAttr`), a region
maski ustawia na `<filter filterUnits="userSpaceOnUse">` — patrz §6.


### Okrągłość: napięcie kształtu, nie skala

Dwie rzeczy robią to, że Plamek wygląda jak kropla, a nie jak ramka:

1. `gooTension(live, target)` liczy, jak daleko żywy kształt jest od celu (różnica wymiarów
   i przesunięcie środka). `haloRadiusFor(short, rest, tension)` prowadzi po niej promień:
   w spoczynku przylega do przycisku (`min(rest, short/2)`), w rozciągnięciu domyka kształt
   do **pigułki** (`short/2`) — dlatego otoczka najpierw się zaokrągla, a dopiero potem dociera.
2. Wymiarów nie rusza `scale()` (rozciągnąłby grubość obwódki — główny grzech starego
   pierścienia), tylko **cztery krawędzie** z różnymi czasami dojechania (`edgeTau`).
   Do tego `--goo` dokłada poświaty otoczki proporcjonalnie do napięcia, więc ruch jest mokry.

### Kulka, łuk i ogon

`perchFor(dir, box, headR, roomAbove)` sadza główkę **zawsze nad przyciskiem**: centrum o
własny promień ponad górną krawędzią, wtopione o `PERCH_SINK = 2 px` w obwódkę, z przechyłem
`perchLean` w stronę ruchu (do 9 px, czyli wciąż nad przyciskiem). To jedyna strona, na której
twarz nie koliduje z treścią i z której kulka **patrzy na napis** — `gazeBiasFor(side)` dokłada
pochylenie wzroku w dół. Nie mieści się (pierwszy rząd przy krawędzi ekranu, nagłówek okienka —
`roomAbove` w dialogu liczy się DO DOŁU jego `<header>`) → siada pod przyciskiem; nigdy na boku
ani na tytule.

`landFor` deleguje do `perchFor`, więc **cel lotu i miejsce postoju to ten sam punkt** — dawniej
kulka leciała w środek krawędzi bocznej i potem zjeżdżała do góry, więc widać było poprawkę po
lądowaniu. `arcControl` podnosi punkt kontrolny prostopadle do kierunku (do 66 px, zawsze w górę
ekranu),
`quadPoint` liczy pozycję, a `squashFrom(speed)` rozciąga kulkę wzdłuż wektora prędkości.

Szyjki między główką a obwodem **nie ma i nie może być** — była objawem złej struktury: skoro
kulka i pierścień to dwa elementy, ktoś musiał domalowywać pas farby między nimi, a widz i tak
widział dwa przedmioty. Dziś spoiwo jest w geometrii: `bandEdges({ lobe, lobeSize })` dodaje do
taśmy dzwonek Gaussa wokół `u = 0` o amplitudzie `lobeSize` (liczonej z rozmiaru buźki, nie z
grubości farby), więc główka **wystaje z kołnierza** i jest z nim jednym obrysem; `dent` robi to
samo w drugą stronę przy starcie. Test kontraktowy pilnuje, że w `d` kołnierza jest **dokładnie
jedno `M`** — gdyby ktoś wrócił do osobnego elementu na główkę, assert mówi wprost: „nie ma
drugiego elementu, który mógłby stać obok".

`ballShapeFor(vx, vy, speed)` dokłada to, co w farbie najważniejsze: w ruchu bulwa nie jest
kołem, tylko **kroplą** — `sharp` (50% = koło, do 8% = ostry czwarty róg) widok przelicza na
`tail` w **pikselach** dla `blobPath`, obrót liczy z prędkości (`atan2 + 45°`, najkrótszą drogą),
a `sx`/`sy` z `squashFrom` wchodzą wprost jako półosie. W bezruchu `sharp` wraca do 50%, więc
bulwa jest kołem zlanym z kołnierzem. Twarz nie dziedziczy obrotu ani całości spłaszczenia
(`--ball-sy = 1 + (sy − 1) · .45` na korzeniu warstwy) — dlatego buźka nigdy nie jedzie na bakier
i nie zmienia się w kreskę przy uderzeniu. Smuga to pięć ech pościgowych (`PLAMEK_TRAIL`: `tau 34…158 ms`, coraz mniejsze,
bledsze i rozmazane `blur .2…1.8 px`) — tanie pozory motion blur bez filtra na samej kulce.

## 2. Poślizg zamiast fajerwerków

`chooseChoreography(gapMs, steps, reduced)`:

- `steps >= PLAMEK.slideAfterSteps` (3 kroki w oknie `burstWindowMs = 640 ms`) → `slide`,
- odstęp między krokami `>= ritualGapMs` (150 ms) → `ritual` (pełny skok),
- `reduced` → zawsze `slide`.

Bez tego przy trzymaniu gałki maskotka wykonywałaby salto co 130 ms. Poza tym
rytuał zostawiono na krok „domyślny" — czyli dokładnie ten, który gracz wykonuje celowo.

Retarget w trakcie `fly`/`impact` woła `launch()` ponownie: faza zostaje, zmienia się tylko
tor (`advancePhase(phase, 'retarget') === phase`).

## 3. Buźka i stan

Mina wynika z fazy i tempa (`moodFor`), nie z osobnego stanu aplikacji:

| `data-mood` | kiedy |
| --- | --- |
| `calm` | `hug` w bezruchu |
| `curious` | `gather`, wolny lot |
| `zoom` | szybki lot / poślizg (oczy się zwężają, buzia robi „o") |
| `boom` | uderzenie |
| `happy` | rozlewanie się otoczki |
| `sleepy` | drzemka |

Mruganie: tylko w `hug`, z okresem liczonym przez `shouldBlink(now, lastBlinkAt, phase, seed)`
(2.6–6.2 s, deterministyczny seed — zero `Math.random` w klatce). Drzemka: `isAsleep(now,
lastInputAt)` po `napAfterMs = 24 s` bez jakiejkolwiek inputu; pierwszy ruch zdejmuje `is-asleep`
i dokłada `is-wake` (błysk otoczki). Śpiący Plamek to też sygnał dla gracza: „nikt tu nie klikał
od dawna" — bez dodatkowego HUD-a.

## 3b. Skłon przed ruchem (buźka czyta intencję)

Silnik wysyła `notePlamek('lean', kierunek)` **zanim** fokus się zmieni — `dispatch` trzyma ten
kierunek w ręku przy każdej komendzie ruchu, więc przewidwanie nic nie kosztuje (żadnego
drugiego `collectNavItems`). `leanFor` zamienia go na przechył wzroku (`--look-x/--look-y`
przez `dominantGaze`: w ruchu wygrywa realna prędkość, w bezruchu — skłon), a stała czasowa
`gaze 96 ms` robi z tego kiwnięcie, nie teleport.

Kiedy otoczka dojedzie i ucichnie, `confirmLean` sprawdza, czy element, na który Plamek się
nastawiał, faktycznie wygrał (ten sam kierunek) — wtedy dostaje `is-confirm`: oczy się
przymrużają, uśmiech poszerza. Trafienie w ścianę nic nie potwierdza, ale skłon robi swoje:
Plamek patrzy w tamtą stronę i wraca.

## 3c. Miernik czekania (Plamek jako postęp)

`<PlamekOrbit progress={0..1} />` przełącza orbitę z „kręcę się" na „wiem, ile zostało":
tarcza wypełnia się `conic-gradient` wyciętym w pierścień maską, kulka jedzie po krawędzi łuku
i kontr-rotuje (twarz prosto), a `role="progressbar"` z `aria-valuenow` podaje procent.
Miernik to dane, nie dekoracja — przy ograniczonym ruchu znika tylko przejście, kąt zostaje.

Liczba nie jest zmyślona: `linkProgress({status, signal, relay, attempts})` z
`src/console/connectionProgress.ts` mapuje **etapy podawania ręki** (sygnalizacja → przekaźnik
→ gotowość) na 0.06…0.94, próby dokładają po 4%, a sufit przed `ready` to 94% — miernik nigdy
nie obiecuje końca, którego nie ma. `status === 'error'` daje `null`, czyli wraca zwykłe
kręcenie, bo przy błędzie procent byłby kłamstwem. Siedzi w kodzie QR na telewizorze i w panelu
hosta na telefonie.

## 4. Reakcje na resztę systemu

`notePlamek(kind)` w `uiControl.ts` rozsyła `CustomEvent('joypad-plamek', { detail: { kind } })`:
`select` (ukłon + bryzgi — tylko prawdziwe zatwierdzenie), `back` (unik — biały kontur),
`poke` (kuksaniec po skrócie X/Y **i po każdej zmianie wartości**: suwak, `<select>`,
`data-ui-stepper`, także gdy wartość przestawia `Enter`), `blocked` (trafienie w ścianę:
nic nie umknęło, po prostu nie ma dalej — od tury 11 także wtedy, gdy `select` wpadł w otwarty
modal i nie wolno go oddać grze). Rozróżnienie `select`/`poke` nie jest kaprysem: przy trzymaniu
strzałki na stepperze kłanianie się co 130 ms wygląda jak confetti, a kiwnięcie czyta się jako
licznik. Udzielone `select` zostaje zarezerwowane dla zatwierdzenia. Widok słucha zdarzenia
i nie re-renderuje niczyjego stanu — telewizor nadal nie przerysowuje biblioteki przy kroku.

Mini-kopia buźki mieszka w pasku podpowiedzi (`.plamek-mini`, w `UiHints`) i kiwa na to samo,
co duży Plamek: pasek przestaje być suchym `◀▶▲▼ A B X Y`, a maskotka jest wszędzie tam, gdzie
mówi o sterowaniu.

Jedna rzecz dotyczy samego wejścia: maskotka **siada na grze, z której właśnie wyszedłeś**.
`JoypadApp` po `setSelected(null)` sprawdza, czy fokus nie został na `body` (bo element areny
zniknął razem z grą), i wskazuje kafelkę `data-game-index` aktualnego wyboru — bez tego biblioteka
wstaje bez Plamka, a pierwsze naciśnięcie strzałki startuje od środka ekranu zamiast od gry.

Gdzie maskotka **jest**, rozstrzyga jedna flaga w `JoypadApp` — `uiOwnsInput` — i to samo flaga
włącza silnik nawigacji: `{uiOwnsInput && <Plamek />}`. Stąd Plamek chodzi po menu, konfiguracji i
wynikach każdej gry tak samo jak po systemie, a znika dokładnie wtedy, gdy pada brać zaczyna runda
(`state.screen === 'game'`; `state.screen` zgłasza gra przez `padHost.setScreen`). Nie ma stanu, w
którym farba wskazuje cel, którego pilot nie ruszy. Okienka są wyjątkiem pozornej podwójności:
montują własną kopię w swoim obszarze, bo pierścień poza `dialog`iem byłby pod nakładką.

## 5. Plamek w ładowaniu

`<PlamekOrbit size label />` — kulka ze smugą biegnąca po kole (`plamek-run` w CSS, pięć ech
przesuniętych ujemnym `animation-delay`; kula kontr-rotuje, więc twarz zawsze patrzy prosto,
a `scale` liźnie własny ogon raz na okrążenie). Zaleta dla wydajności: zerowa pętla JS,
działa nawet wtedy, gdy główny wątek mieli pierwszą klatkę gry.

Wpięty w: `QrFrame` (razem z generowaniem kodu), `ArcadeGameView` (ładowanie rundy),
`Suspense` przy leniwym `TankApp`, `BootSplash` (w pigułce „pomiń"). Współdzielony z telefonem
`QrFrame`/`BootSplash` celowo **nie** wciąga nawigacji: `PlamekOrbit.tsx` importuje z modelu
jedną tablicę ech, a `plamek.ts` jest czysty, więc reszta odpada przy tree-shakingu
(`PadApp-*.js` ani drgnął: 74.78 kB).

## 6. Prawa warstwy szkła

Pozycja i kształt idą przez zmienne (`--halo-x/y/w/h/r/a/thick`, `--ball-x/y/size/sx/sy`),
wpisywane jednym `setProperty` na ramkę. Media query dla telewizora (≥1900 px) dokłada
grubość obwódki i powiększa oczy, nie nadpisując inline'ów — dlatego `border-width` nie jest
pisany wprost przez JS.

Ograniczony ruch (`motionReduced()`): ceremonia zastąpiona poślizgiem, smuga (`.plamek-echo`),
bryzgi, most i resztka na starym przycisku wyłączone (`display: none` w CSS **oraz** pusty `d`
w JS — podwójne zabezpieczenie), kropla liczona z `reduced` w ogóle nie powstaje, squash i
drganie wyzerowane, maska goo wyłączona w modelu (`gooStrength(..., true) === 0`), więc farba
jest matowa, mruganie i drzemka wyłączone, przejścia wygaszone. Natywny `transform` **nie jest**
nadpisywany — siedzi na nim pozycja twarzy.

Maska goo ma pięć praw, których nie wolno nadpisać:

* **twarz (`.plamek-face`) jest rodzeństwem grupy `.plamek-goo`, nie jej dzieckiem** — próg alfa
  zjadłby cienkie krawędzie źrenic i dalibyśmy sobie pretekst, żeby rozmywać oczy;
* **`id` maski jest unikalne na kopię** (konsola i kopia w okienku) — bierze się z `useId()`,
  bo `url(#id)` jest wspólne dla dokumentu i druga Plamek podszywałaby się pod maskę pierwszej;
* **region maski podaje `<filter filterUnits="userSpaceOnUse">`**, nie box elementu: `draw()`
  wpisuje `x/y/width/height` na złączu (żywy box ∪ bulwa ± `size` ∪ box startu ∪ echa)
  ± `PLAMEK.gooPad` (48 px, musi mieścić też bryzgi: `reach 26` + skalę). Grupie rozciągniętej
  na cały viewport naliczyłoby się pasmo rozmycia wielkości telewizora i płaciłaby nim każdą
  ramkę; sam `<svg>` przykrywa warstwę bez przycinania (`overflow: visible`), bo kropla i ogon
  wychodzą poza box,
* **kolor farby to `fill: var(--plamek-paint)` na grupie `.plamek-goo`**, a `--plamek-paint`
  to czysty `var(--os-nav-accent, #ff9a52)` — ten sam token, co poświata. Prezentacyjny atrybut
  przegrałby z każdą regułą CSS i nie dałby się podmienić tokenem; reakcje podbijają fill
  wyższą specyficznością (`.plamek.is-blocked .plamek-goo { fill: … }`). Przymiarka z
  rozjaśnieniem (`color-mix` z kremem) **cofnięta na przegląd**: poprzedni odcień był lepszy,
  a wyraźność ma trzymać keyline w `<filter>`, nie jasność wypełnienia.
* **wygładzanie jest po progu alfa** — próg `18α − 6` zostaje, żeby nie osłabiać smugi
  i mostu. Samo zmniejszenie rampy do `9α − 3` zmieniłoby krycie fragmentu o alfa `.42`
  z 1 na `.78`. Dodatkowe wygładzanie dotyczy farby, nie twarzy.

### Kolor: jedno źródło (runda 15)

Zgłoszenie z przeglądu: „Plamek czasami zmienia kolor na jaśniejszy, zazwyczaj jak jest
na przyciskach na dole strony”. Winne były trzy reguły reakcji, każda przemalowująca farbę:

| Reguła | Co robiła | Czym jest teraz |
| --- | --- | --- |
| `.plamek.is-nod .plamek-blob` | `filter: brightness(1.12)` przy każdym „A” | usunięta — kiwnięcie niesie poświata i drganie kształtu |
| `.plamek.is-dodge .plamek-goo` | kremowe `fill: #ffe7d4` przy „wstecz” | usunięta — unik widać po ruchu |
| `@keyframes plamek-wake` | `brightness(1.5)` po przebudzeniu | błysk **poświaty** (rura świetlna), nie wypełnienia |
| `.plamek.is-blocked .plamek-goo` | `fill: #ff7a3d` (inny odcień) | `feFlood { flood-opacity: .95 }` — mocniejsze obrzeże |

Zgłoszenie wróciło w rundzie 16, ale „osiadło” gdzie indziej: *„dalej ten błąd z zmianą
koloru został, ale teraz osiadł jak Plamek obtacza wężowy wir”*. Wężowy Wir (i BlockCraft)
mają inny `accent` w katalogu, a akcent trafiał do farby przez `--os-nav-accent` **ustawiany
z podświetlonego kafelka** — maskotka jechała więc za nawigacją, a `transition: fill`
powodowało, że kolor „osiadał” dopiero po chwili. Trzy zmiany zamykają temat:

- `--plamek-paint` jest zdefiniowany **raz, w `:root`**, jako `var(--os-accent, #ff9a52)` —
  stały akcent JoyPada. `--os-nav-accent` nadal koloruje pierścień fokusa biblioteki,
  ale farba nie ma z nim nic wspólnego;
- z `.plamek-goo` zniknęło `transition: fill` — kolor nie może zmieniać się „w locie”;
- orbita małego Plamka (ekran ładowania, pasek podpowiedzi) nie zaczyna się już od
  kremowego `#ffe0bd`, tylko od jasnej odmiany akcentu.

Obowiązuje kontrakt: **hue = akcent gry, płaski i niezmienny**. Farba ma jedno źródło
(`--plamek-paint` ← `--os-nav-accent`), a `.plamek-blob` dostaje `fill: inherit`, więc nie ma
własnego koloru. Pilnuje tego `selftest:console`: skan `liquid.css` odrzuca `brightness(` w regułach
Plamka, każdy `fill` inny niż akcent albo `inherit`, drugą deklarację `--plamek-paint`,
`transition: fill` oraz — poza komentarzami — samo słowo `--os-nav-accent`.

Realizm dokładają trzy warstwy, wszystkie **względne wobec rozmiaru**, nie stałe:

- **cień kontaktowy** — trzeci cień poświaty, czarny i przesunięty w dół; przesunięcie
  `clamp(4, 3 + .5 × weight, 10)` px i rozmycie `clamp(14, 12 + 1.5 × weight, 30)` px liczy
  `contactShadowFor(weight)`. Każda reguła nadpisująca `box-shadow` poświaty musi dokleić
  `var(--plamek-contact)`, inaczej farba „odkleja się” od szkła;
- **połysk** — świetlik z góry-lewej (`−.16 r`, `−.34 r`), rozmycie `sheenBlurFor(r) =
  clamp(1, .085 r, 3.2)` px pisane co klatkę, krycie zejść z .42 do .3 i animacja `.22–.5`;
- **wygładzanie krawędzi** — `edgeAaPx` podniesione z .4 do **.5 piksela urządzenia**
  (schodki na telewizorze), nadal po progu alfa i nadal niezależne od skali okienka.

Zasięg `.5` px to kompromis: powyżej ~.8 farba zaczyna „płynąć” i traci kontur.

### Raster: wygładzanie krawędzi (runda 13)

Stromy próg alfa może uwydatniać schodki. Prostokątne jądro `feMorphology` może dodatkowo
nadawać obwódce kanciasty charakter. To hipotezy z przeglądu kodu, nie diagnoza potwierdzona
na urządzeniu użytkownika. Nowy łańcuch zachowuje dotychczasowe scalanie:

```
feGaussianBlur σ = wetBlur(wet)         # 2.2 × mokrość, bez zmiany
feColorMatrix  α' = 18α − 6             # dotychczasowe krycie farby i smugi
feGaussianBlur σ = edgeAaFor(dpr, k)    # .4 / (dpr × skala okienka), po progu
feGaussianBlur σ = rimSwellFor(weight)  # osobna gałąź obwódki wokół scalonej farby
feColorMatrix  α' = 6α − 1              # maska ciemnej obwódki
feFlood + feComposite(in) + feMerge     # obwódka pod wygładzoną farbą
```

`edgeAaFor` ogranicza DPR do 1…4 i skalę do .2…4. W typowym zakresie daje zasięg `.4`
piksela urządzenia niezależnie od gęstości ekranu. Widok korzysta ze skali już odczytanej
przez istniejący pomiar okienka, bez dodatkowego odczytu układu w `draw()`. `setAttr`
pomija niezmienione wartości. Przeglądarka decyduje o ostatecznej rasteryzacji.

Obwódka ma σ = `clamp(1.5 + .11 × weight, 1.4, 2.4)` i nie rozjaśnia koloru farby.
`shape-rendering: geometricPrecision` jest wskazówką dla rasteryzatora, nie gwarancją
wygładzenia filtrów. Twarz, geometria ścieżek i ruch pozostają bez zmian.

Filtr nadal działa na ograniczonym regionie z zapasem 48 px; nowy łańcuch ma dodatkowy
koszt, którego nie zmierzono na TV. Ograniczony ruch nadal wyłącza cały filtr.
Automaty sprawdzają macierze, zachowanie krycia smugi, skalowanie wygładzania i zapas
regionu. Ocena wyglądu w spoczynku, locie oraz podczas otwierania okienka zostaje do przeglądu.

Uwaga przy pisaniu `cssText` poświaty: `--halo-x/--halo-y` muszą być **pierwsze** w zapisie.
Kilka rund temu dopisanie nowej zmiennej na początku tego stringu skasowało pozycję i maskotka
uciekła w lewy górny róg warstwy; pilnuje tego test kontraktowy w `UI CONTROL` (szuka dokładnie
`glow.style.cssText = \`--halo-x:`).

Natywny outline nie znika: `html[data-plamek]` (ustawiany przez jedyny niESCOPE'owany egzemplarz)
schodzi do `1px` w 34% akcentu, bo maskotka mierzy wyłącznie elementy z `NAVIGABLE_SELECTOR`
i bez żadnego sygnału zostałyby np. pozycje poza listą. `aria-hidden="true"` na obu kopiach:
czytnik i tak dostaje prawdziwy fokus DOM.

## 7. Jak to rozszerzać

* Nowa powierzchnia nie wymaga niczego poza byciem powierzchnią: Plamek podąża za fokusem DOM,
  ale fokus musi mieć dokąd wejść — ekran pełnoekranowy (nie `dialog`) oznacza się `data-ui-scope`
  i `data-ui-focus`, a przy montowaniu woła `focusUiScope(root)` (`docs/ui-control.md` §3). Tak
  trafił pod pilota `GameSetup`, `GameResults` i konfigurację czołgów.
* Chcesz, żeby reagował na coś nowego: dodaj `kind` w `notePlamek`, klasę w CSS (tylko
  Properties, których nie piszemy co klatkę: `box-shadow`, `border-color`, `filter`) i — jeśli
  to miny — przypadek w `moodFor`.
* Zmiana charakteru ruchu = `PLAMEK` (czasy faz, `gripMs`, `pourSpread`, `hideDelayMs`,
  `hopGraceMs`), `PLAMEK_SMOOTH` (stałe czasowe pościgu, czyli cała „miękkość"),
  `PLAMEK_TRAIL` (smuga), `PLAMEK.gooPad` (zapas regionu maski — musi ≥ rozmycie + bryzgi),
  `PLAMEK_WET` (`wetBlur` = `2.2` × mokrość, próg `18 -6`, `edgeAaFor`, `rimSwellFor`)
  i **podłoga `.3`** w `gooStrength` (miękkość krawędzi w bezruchu: bez niej widać wielobok,
  nie obrys) z kwantyzacją `.02` (filtr nie jest przepinany co ramkę),
  `paintWeightFor(box, k = .115, 2.8, 9.5)` (grubość kołnierza — skalar, od którego idzie
  `spread`, kropla i region maski), `aniso` w widoku (`.55 / 1 / 1.4`
  — tu decyduje się, jak bardzo farba opada), `crownFor`/`lobeAtFor` (kiedy garb w ogóle jest i po
  której stronie obwodu siedzi), próg alfa z `PLAMEK_WET` (α źródła poniżej 1/3 jest wycinana:
  przy dawnym `22 -10` most i smuga znikały w masce — rampę zostawiamy, wygładzamy jej wynik), keyline z **rozmycia i niższego progu** (`rimSwellFor(weight)` + `feFlood`,
  na TV `flood-opacity: .82` z CSS) — dawniej `feMorphology dilate`, co jest osobną historią
  powyżej, podłoga `.42` alfy ech, `lobeSize`/`dent` (jak wysoko wystaje główka i jak
  głęboko wciąga materiał przy starcie), gęstość próbek w `bandEdges` (`P / 8`, klamra 24…72:
  mniej = tańsze `d`, więcej = gładszy dzwonek główki), `PERCH_SINK` (jak głęboko główka wchodzi
  w obwódkę),
  `WOBBLE` (okres i zanik drgania kształtu), `pourSpread`/`snap` w `strandFor` (kiedy pęka most),
  `fuseMs` i próg `.8` w `wrapCurve` (kiedy strugi się schodzą).
  Chcesz bardziej sprężyście? nie tędy droga — patrz „Płynność: stała czasowa" i „Drganie
  kształtu": pozycja nie może przekraczać celu.
* Nie dokładać nieskończonych animacji do `liquid.css` — pilnuje tego `selftest:console`
  (`LIQUID GLASS`); dlatego orbita ładowarki mieszka w `console.css`.
* Chcesz „bardziej ciekłe": podnieś grubość taśmy (`PLAMEK_INFLATE + 2.5`), anizotropię `aniso`
  albo amplitudę fali (`wob * 4.5` w `bandEdges`) i **zostań przy jednej ścieżce**. Nie dokładaj
  elementów: każdy kolejny byt poza grupą farby to przyszłe „staje obok". Jeśli coś pod filtrem
  znika lub mruga, sprawdź jego krycie przed progiem alfa i grubość geometrii. Nie zmniejszaj
  rampy bez sprawdzenia smugi. Przy schodkach sprawdź `edgeAaFor`, gęstość ekranu i skalowanie
  warstwy. Twarz zostaje poza grupą farby — wygładzenie obrysu nie może rozmywać oczu.


## 8. Pomysły odłożone (nie zrobione)

* **Plamek w grach**: kulka jako wskaźnik wyniku w `Neon Circuit` / znacznik rekordów —
  wymaga zgody na ruszanie layoutu gry, a ten jest poza stylem systemowym.
* **Tryb „mokrej farby" na `select`**: otoczka na chwilę zalewa przycisk i odlewa się
  (fala po kliknięciu). Ładne, ale kłóci się z „nigdy nie zasłaniaj napisu".

* **Pełne przewidanie celu**: dziś Plamek nastawia się na *kierunek* komendy; mógłby patrzeć na
  realny `Box` elementu, który `pickNext` wybrałby za krok — wymaga to drugiego skanu DOM
  na wciśnięcie, więc zostało odłożone.
* **Dźwięk**: `systemSound('move')` mógłby mieć plusk przy `impact` (osobny profil głośności,
  inaczej maskotka zagłuszy gry).
* **Warianty imienia w interfejsie**: „Plamek" tylko po polsku, „Splash" po angielsku
  (obecnie jeden klucz `plamek.name` z dopiskiem w obu językach).

## 9. Farba nie wysycha w spoczynku (runda 22)

**Zgłoszenie:** „Plamek nie wydaje się już realistyczny, tylko jak zwykła otoczka z buźką".

**Diagnoza — trzy zastygnięcia naraz, wszystkie po rozlaniu:**

| Co gasło | Dlaczego | Skutek na ekranie |
|---|---|---|
| Kropla | `dripTail` zwracał `null` dla `wrap === 1`, a w spoczynku `wrapFor('hug') === 1` | pod przyciskiem nie wisiał ani piksel farby |
| Pętla klatki | `busy === false`, `tension ≈ 0`, `head.sharp ≈ 50` → brak kolejnego `requestAnimationFrame` | farba zamierała w jednej pozie: `wob`, `spin` i połysk stały w miejscu |
| Mokrość | `gooStrength(0, 'hug') = .3` (podłoga), czyli σ rozmycia 0.66 | próg alfa 18/−6 zostawiał geometryczną krawędź taśmy — czytała się jak `border` |

Mokrości podnieść nie wolno: `gooStrength(0,'hug') ≤ .4` i `gooStrength(1,'pour',false,1) ≥ .3`
są przypięte bramkami, a przy większym rozmyciu próg alfa zjadał cienką górną krawędź taśmy
(`ANISO.top = .55`) na małych przyciskach — stąd brało się zgłoszenie „mało wyraźny" z rundy 8.
**Realizm wraca więc ruchem farby, nie rozmyciem.**

**Co żyje w spoczynku** (`PLAMEK_IDLE` w modelu, `breathing` w widoku):

* **Oddech kałuży** — `idlePool(now)` (~9 s) robi dwie rzeczy naraz: dół taśmy dorasta
  (`ANISO.bottom` 1.4 → max 1.62, czyli `poolAmp .22`), a CAŁA taśma grubieje o `poolSwell`
  (7 %, wchodzi w `spread`). Na kaflu 320×168: farba 9.50 → 10.17 px, kałuża 13.30 → 17.36 px.
  Pęcznienie pilnuje bramka: spuchnięta taśma nadal mieści się w ~1/6 krótszego boku
  (chip 96×26: 2.99 → 3.20 px przy limicie 4.68), więc napis zostaje wolny.
* **Wisząca kropla** — `dripTail(host, wrap, thickness, shake, drip)` dostał piąty argument z
  `idleDrip(now)` (~6.5 s): kropla zwisi, wydłuża się i wraca do kałuży. Jest mniejsza w obu
  osiach od kropli z rozlewu (`dripScale = .82`), więc z kałuży wyrasta, a nie z nią konkuruje;
  na kaflu 320×168 rośnie od 9.5 px do ~25 px wysokości i nigdy nie znika do zera
  (`dripFloor .46`), bo znikająca kropla czyta się jak miganie.
* **Odblask na rancie** — `.plamek-gleam` jedzie po obwodzie (`rimPoint(host, .885 + .035 * pool)`,
  górny lewy rąbek) i obraca się do stycznej: mokra jest krawędź farby, nie środek przycisku.
  Krycie `.17 → .37`, czyli prawie tyle, co połysk bulwy (`.3`) — to drugi, cichszy punkt światła.
  Siedzi poza maską goo, tak jak połysk: próg alfa zjadłby tak delikatne krycie.
* **Połysk bulwy** — przesuwa się o ~1.5 px i zmienia rozmiar o kilka procent z tym samym oddechem,
  więc światło pływa po farbie, zamiast zastygnąć w jednym punkcie (zastygłe = naklejka).

**Cena i granice:**

* Oddech rysuje się ~12 fps (`PLAMEK_IDLE.frameMs = 80`), a po zaśnięciu kulki ~5 fps
  (`napFrameMs = 190`): pętla w bezruchu **zwalnia, nie gaśnie**. W ukrytej karcie rAF i tak staje,
  więc tło jest darmowe; integracja stanu leci każdym tickiem, throttling dotyczy tylko rysowania.
* Ograniczony ruch: `breathing === false` — nie ma oddechu, kropli ani odblasku, zostaje suchy,
  statyczny kształt (maska goo jest wtedy wyłączona, tak jak dotąd).
* Wszystko jest funkcją `now`, bez `Math.random` (zakaz w widoku pilnowany bramką): oddech jest
  deterministyczny, więc nie drga między klatkami i nie rozjeżdża się z mignięciem buźki.
* Bramki: sekcja „fizyka cieczy Plamka" w `scripts/console-selftest.ts` — ciągłość i zakres
  `idleWave`/`idlePool`/`idleDrip`, sen płytszy i wolniejszy, kropla spoczynkowa krótsza i węższa
  od tej z rozlewu, klamra pęcznienia na trzech rozmiarach przycisku,
  `dripTail(box, 1, t) === null` bez oddechu (stara ścieżka bez zmian) — oraz
  kontrakty źródła: kadencja z modelu, `breathing` tylko w `hug` i tylko przy pełnym ruchu,
  odblask liczony z `rimPoint`, brak własnej animacji CSS na `.plamek-gleam`.
