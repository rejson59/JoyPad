# Profile ekranu — TV, komputer, tablet, telefon (runda 16)

Prośba z przeglądu: *„na TV nie będę scrollował strony”* oraz *„może zrobisz osobny
wygląd dla TV, osobny na PC i jakiś na tablety (może na tablecie też będzie się dało
grać jak na dużym ekranie)”*. Ta warstwa odpowiada na oba zdania naraz: rozpoznaje
urządzenie i pilnuje, żeby biblioteka była **jednym ekranem**.

## Jak JoyPad poznaje urządzenie

`src/console/viewport.ts` liczy wszystko w czystej funkcji `pickProfile(signals)` —
bez DOM-u, żeby `selftest:console` mógł sprawdzić tabelę przypadków (telewizory
raportują naprawdę dziwaczne kombinacje sygnałów):

| Sygnał | Skąd | Dlaczego |
| --- | --- | --- |
| `userAgent` | `navigator.userAgent` | jedyny pewny rozpoznawca marek TV (Tizen, WebOS, HbbTV, Android TV…) |
| `noHover` | `matchMedia('(hover: none)')` | TV z pilotem nigdy nie „unosi kursora” nad treścią |
| `coarsePointer` | `matchMedia('(pointer: coarse)')` | palec jako główny wskaźnik = tablet lub telefon |
| `touchPoints` | `navigator.maxTouchPoints` | odróżnia dotykowy ekran od pilota |
| `width`/`height` | `window.innerWidth/Height` | próg „dużego” ekranu (600 px krótszego boku) |

Kolejność rozstrzygnięć jest istotna: **najpierw telewizor** (bo TV potrafi raportować
dotyk panelu), potem tablet, a komputer jest tym, co zostaje. Wynik ląduje na
`<html data-profile="tv|desktop|tablet|handheld">` — **przed pierwszym renderem**
(`main.tsx`), inaczej TV mrugnąłby układem desktopowym.

## Bez przewijania: naturalny układ + pomniejszanie

Pierwsze podejście (runda 16) dało bibliotece **sztywną wysokość** `100dvh` i elastyczny
wiersz `minmax(0, 1fr)`. To klasyczna pułapka: gdy treść nie mieści się w oknie, elastyczny
wiersz kurczy się **poniżej** swojej treści, a nadmiar maluje się na tym, co jest niżej.
Użytkownik zobaczył dokładnie to: *„teraz elementy najeżdżają na siebie!”*.

Działające rozwiązanie (runda 17) opiera się na dwóch zasadach:

1. **Układ jest naturalny.** Biblioteka ma `min-height: 100dvh` i rośnie z treścią —
   nic nie jest ściskane ani przycinane, więc nakładanie jest niemożliwe z definicji.
2. **Gdy treść jest wyższa od okna, całość się pomniejsza** (`src/console/FitScreen.tsx`).
   Ramka `.fit-frame` ma dokładnie rozmiar okna, a `.fit-scale` dostaje
   `transform: scale(min(oknoW / płótnoW, oknoH / treśćH))`. Żeby pomniejszenie nie
   zostawiało **czarnych pasów po bokach**, układ dostaje najpierw szersze płótno
   (`okno / skala`, maks. `FIT_MAX_CANVAS_PX`), a `transform-origin` siedzi w lewym górnym
   rogu — po przeskalowaniu treść sięga dokładnie krawędzi okna. Drobny nadmiar
   (do `FIT_SLACK_PX = 8` px) w ogóle nie uruchamia skalowania. Skala nigdy nie przekracza
   1 (nic nie powiększamy), a trzy stany widać w `data-fit`:

   | `data-fit` | Kiedy | Co robi CSS |
   | --- | --- | --- |
   | `full` | treść mieści się bez zmian | skala 1, brak transformacji |
   | `scaled` | treść wyższa/szersza od okna | pomniejszenie, wyśrodkowanie, przycięcie resztek |
   | `scroll` | brakuje tak dużo, że pomniejszanie zabiłoby czytelność (`< .72`) | wraca przewijanie — bezpiecznik, nie plan |

Pomiar jest **jednoprzebiegowy**: `scrollWidth`/`scrollHeight` opisują układ, a
`transform` układem nie rusza, więc pomiar nie zależy od zastosowanej skali i nie ma
pętli sprzężenia (skala nie „drga”). Rozmiary `clamp(…, …dvh, …)` z rundy 16 zostają —
najpierw zmniejszają typografię, a dopiero potem wchodzi skalowanie.

Wszystkie rozmiary wewnątrz liczą się z `dvh` (`clamp(104px, 15dvh, 208px)` na kafelek,
`clamp(34px, min(5.4vw, 7.2dvh), 92px)` na tytuł). Drugim źródłem przewijania była
**siatka kafelków**: cztery dostępne gry stały w trzech kolumnach, więc czwarta łamała się
do drugiego rzędu.

### Półka z grami: kolumny bez rzędów-sierot (runda 20)

Stała liczba kolumn w CSS jest poprawna tylko dla jednej liczby gier. Gdy biblioteka
urośnie, rząd się urywa (sześć gier przy czterech kolumnach = 4 + 2), a wolne miejsce
i tak wypycha bibliotekę poza jeden ekran. Dlatego liczbę kolumn liczy **czysta funkcja**
`src/console/libraryRail.ts`, a CSS bierze ją ze zmiennej:

| Funkcja | Co robi |
| --- | --- |
| `maxRailColumns(width)` | sufit dla szerokości okna: 6 (≥1700 px), 4 (≥1100 px), 3 (≥760 px), 2 (telefon) |
| `railColumns(count, max)` | wszystko w jednym rzędzie, jeśli się mieści; inaczej największy podział bez reszty; a gdy takiego nie ma — najkrótszy układ z najpełniejszym ostatnim rzędem |
| `railRows(count, columns)` | liczba rzędów, zapisana na półce jako `data-rows` |

Biblioteka wpisuje wynik w `style={{ '--tile-columns': … }}` i `data-rows`, a reguła
siatki to `repeat(var(--tile-columns, 4), minmax(0, 1fr))`. Półka w **jednym rzędzie**
(telewizor, szeroki monitor) dostaje wyższą okładkę — `clamp(132px, 20dvh, 268px)` — bo
skoro nie ma drugiego rzędu, jest na to miejsce; dalej mieści się w jednym ekranie, a jeśli
nie, skaluje ją `FitScreen`. Tablety zostają przy swoich 3 kolumnach (2 w pionie), a telefon
przy przewijaniu poziomym — te reguły profilowe mają wyższą specyficzność.

Tabelę przypadków (2–24 gry × cztery sufity) przegląda sekcja `RAIL SELFTEST`
w `selftest:console`: sprawdza, że podział bez reszty zawsze wygrywa, że rzędów jest
minimum, a ostatni rząd nie jest jedynym kafelkiem, gdy da się go wypełnić.

### Co wolno, a czego nie wolno wkładać do skalowanej treści

`transform` tworzy **blok zawierający dla `position: fixed`**. Wszystko, co ma być
przyklejone do okna — arkusze systemowe (`.os-sheet`), „Co nowego?”, podpowiedź telefonu —
musi stać **poza** `FitScreen`. W bibliotece tak właśnie jest: skalowana jest treść,
a okna renderują się obok (w korzeniu `.os-library-root`). Dymny test interfejsu tego
pilnuje: żaden otwarty arkusz nie może mieć przodka `.fit-scale`.

To samo dopasowanie mają **menu gry** (`GameSetup`) i **ekran wyników** (`GameResults`) —
z nieco wyższą dolną granicą skali (`.78`), bo tam jest drobny tekst i przyciski.

## Co zmienia profil

| | Telewizor | Komputer | Tablet |
| --- | --- | --- | --- |
| Typografia | większe minimum (nagłówek, stopka, kbd, eyebrow) | jak dotąd | między TV a telefonem |
| Kafelki | jeden rząd i wyższe okładki (`data-rows="1"`), grubszy pierścień fokusa | kolumny liczone z liczby gier (`libraryRail.ts`) | 3 kolumny (2 w pionie) |
| Przyciski | ikony 54 px, „Dodaj gracza” 15 px | standard | minimum 46–56 px pod palec |
| Układ | pełna szerokość, stopka z większymi klawiszami | pełna szerokość okna (szerokość ogranicza tylko padding, proporcjonalny do okna) | jedna kolumna w pionie |
| Dodatki | pasek przewijania ukryty | — | podpowiedź „Obróć tablet poziomo” |

Telefon na ekranie głównym dostaje pływający przycisk **„Otwórz kontroler na telefonie”**
(`#pad`) — to najkrótsza droga z „patrzę na ekran” do „gram”.

Menu gry i ekran wyników dostały ten sam kontrakt (`viewport.css`, druga sekcja):
`height: 100dvh`, skalowanie `dvh`, większe cele dotyku na tablecie i większa typografia
na telewizorze.

## Jak dodać piąty profil

1. Dopisz wartość do typu `ViewportProfile` i regułę do `pickProfile` (najlepiej
   z przypadkiem w `selftest:console` — tabela jest tam wprost wypisana).
2. Dodaj blok `html[data-profile="nowy"] { … }` w `viewport.css`. Reguły profilowe mają
   wyższą specyficzność niż reszta arkuszy, więc **nie potrzebują `!important`** i nie
   wymagają przestawiania importów (arkusz jest ładowany po konsoli i po liquid glass).
3. Jeśli profil potrzebuje własnego elementu (jak podpowiedź o obrocie tabletu), wstaw go
   do markupu zawsze i rozstrzygnij widoczność w CSS — nie montuj różnych drzew w JS.

## Czego ten automat nie sprawdzi

`selftest:console` pilnuje **reguł rozpoznania i kontraktu arkusza** (wysokość `100dvh`,
kolumny półki ze zmiennej `--tile-columns`, obecność bloków profili, brak `!important`,
podpowiedzi w markupie).
Nie sprawdzi, jak to wygląda na prawdziwym telewizorze — żaden harness w tym repozytorium
nie rysuje pikseli. Wygląd na sprzęcie pozostaje do oceny wzrokiem.
