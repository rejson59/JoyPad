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
   `transform: scale(min(oknoW / treśćW, oknoH / treśćH))`, wyśrodkowany w poziomie.
   Skala nigdy nie przekracza 1 (nic nie powiększamy), a trzy stany widać w `data-fit`:

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
do drugiego rzędu. Teraz rząd jest czterokolumnowy (tablet: 3 w poziomie, 2 w pionie,
telefon: przewijany poziomo, jak dotąd).

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
| Kafelki | wyższe, grubszy pierścień fokusa | elastyczne | 3 kolumny (2 w pionie) |
| Przyciski | ikony 54 px, „Dodaj gracza” 15 px | standard | minimum 46–56 px pod palec |
| Układ | pełna szerokość, stopka z większymi klawiszami | treść w kontenerze `max-width: 1720px` (żeby nie rozjeżdżała się po ultrapanoramie) | jedna kolumna w pionie |
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
cztery kolumny, obecność bloków profili, brak `!important`, podpowiedzi w markupie).
Nie sprawdzi, jak to wygląda na prawdziwym telewizorze — żaden harness w tym repozytorium
nie rysuje pikseli. Wygląd na sprzęcie pozostaje do oceny wzrokiem.
