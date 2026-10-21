# JoyPad 🎮

## JoyPad OS 02 — duża aktualizacja platformy

JoyPad v1.8 dokłada dwie grywalne gry (**Turbo League** i **WEBZA — Nocna Dostawa**), sterowanie **całym** interfejsem z pada, klawiatury i pilota z telefonu, profile ekranu **TV / komputer / tablet / telefon**, maskotkę fokusa **Plamek**, pływające okienka „liquid glass" i filmowy poradnik „Poznaj JoyPad". Z v1.7 zostają **Moments Gallery**, pełne interfejsy **PL/EN** i lżejsze sterowanie na telefonach; **BlockCraft** nadal jest wyłącznie zapowiedzią.

- [Opis funkcji, ograniczenia i testy platformy](docs/platform-update.md)
- [Sterowanie interfejsem z pada, klawiatury i pilota](docs/ui-control.md)
- [Plamek — maskotka fokusa: model ruchu i choreografia farby](docs/plamek.md)
- [Liquid glass — język powierzchni systemu (pigułki, karty, pływające okienka)](docs/liquid-glass.md)
- [Profile ekranu — TV, komputer, tablet i telefon bez przewijania](docs/viewports.md)
- [Film „Poznaj JoyPad" — sceny, jakość i fallbacki](docs/cinema.md)
- [Gry wciągnięte z paczek ZIP (Turbo League, WEBZA)](docs/imported-games.md)
- [Prompt dla następnej gry i bezpieczna integracja ZIP](docs/game-building-prompts.md)
- [Moments Video — architektura, ograniczenia i testy nagrywania](docs/moments-video.md)
- [JoyPad v1.6 — archiwalny zakres i ograniczenia beta](docs/v1.6.md)
- [Notatka agenta — mapa projektu dla następnej sesji](docs/agent-handoff.md)
- Testy: `npm run selftest:all` (model, silniki, konsola, film, nowe gry, dym interfejsu) albo `npm run verify` (lint + typecheck + selftesty + build).


**JoyPad OS** — matowa konsola do wspólnej gry na jednym ekranie. Telefon jest bezprzewodowym kontrolerem, komputer lub TV wyświetla grę. **Sześć gier jest dostępnych: Stalowy Front, Neonowy Pęd, Orbitalna Fala, Wężowy Wir (beta), Turbo League i WEBZA — Nocna Dostawa.** BlockCraft pozostaje zapowiedzią — to teaser, niegrywalna gra.

## System konsoli

Paleta **Obsidian / Ember**: neutralne obsydianowe tła, jasna biel i pomarańczowy akcent głównych akcji. Wspólne kolory są zdefiniowane w `src/console/palette.css`; barwy graczy oraz sygnały ostrzeżeń pozostają niezależne od motywu.

- **Biblioteka:** panoramiczne tło wybranej gry, czytelne karty czterech grywalnych tytułów, status pokoju i cztery miejsca graczy. **QR zostaje na ekranie** także wtedy, gdy ekipa już dołączyła — kolejne osoby wchodzą w trakcie zabawy; jego widoczność jest przełącznikiem administratora w Centrum pokoju, a sam klucz zaproszenia odświeża się automatycznie.
- **Języki:** polski i angielski obejmują bibliotekę, ustawienia, pokoje, kontrolery, powiadomienia, Moments i HUD-y wszystkich rund.
- **Nawigacja:** pad, klawiatura i pilot z telefonu sterują **całym** interfejsem — każdym klikalnym elementem: biblioteką, okienkami, centrum pokoju, ustawieniami, labem i galerią. Ruch liczy silnik przestrzenny: gałka z sensowną martwą strefą i powtarzaniem przy trzymaniu, krzyżak działa równolegle, rzędy zawijają się, a to co poza kadrem — dovija się do widoku. `A` zatwierdza, `B` cofa, `X`/`Y` to skróty kontekstowe podpisane na dole ekranu. To samo prawo obowiązuje w menu każdej gry: ustawienia, wyniki i okienka nad rozgrywką są powierzchniami nawigacji, a pada oddaje się grze dopiero na czas rundy. Fokus obsuwa **Plamek** — maskotka, która ścieka z otoczki w kulkę, przelatuje na następny element ciągnąc za sobą most z farby, rozlewa się wokół niego — spływając DWIEMA strugami po bokach i domykając obwód pod przyciskiem,
a mokra farba po drodze **zlewa się w jedną plamę** (maska `feGaussianBlur` + próg alfa na grupie
`.plamek-goo`; twarz i tekst są poza nią, bo maska zjada cienkie krawędzie): dół naważa się ciężej
niż góra (`pourEdges`), taśma faluje jak galaretka, a spod krawędzi wiesza się i wciąga kropla
(`dripTail` + `teardropPath`) — bulwa jest jedynie **wypukłością tej samej ścieżki** (`lobe`), więc
nie ma czegoś takiego jak „kulka obok pierścienia"; grubość farby liczy się z rozmiaru elementu
(`paintWeightFor`), więc na chipie jest kreską, a na kaflu cielskiem; garb główki siedzi tam, gdzie
ona realnie przysiadła (nad przyciskiem albo pod nim), a na okrągłych ikonkach zastępuje go krążek
zlany z pierścieniem — dlatego maskotka nie wygląda jak jajko; sama główka patrzy na napis. Telefon w trybie pilota dostaje do dyspozycji gałkę nawigacji obok krzyżaka, przyciski X/Y i (dla administratora) pełny ekran telewizora. W rundzie nic nie zmienia się: pad gra, a pilot steruje menu gry. Szczegóły: `docs/ui-control.md`.
- **Plamek (Splash):** pomarańczowa plama farby z buźką zamiast pierścienia fokusa — jedna ścieżka SVG, z której wyrasta główka. Przy skoku farba jest wciągana z kołnierza w bulwę, ta leci łukiem ze smugą, **wyciągając za sobą most z farby, który cienieje i pęka tuż przed celem**, uderza w przycisk (bryzgi), wylewa się ZA jego krawędzie i ściąga do nich monotonicznie — oblewanie, nie ramka. Farba jest jedna: rozmycie i próg alfa (`feColorMatrix`) scalają kołnierz, kroplę i bryzgi w jedno ciało, a przy ograniczonym ruchu mokra maska jest wyłączona w całości.
Startem rytmu jest komenda pada/klawiatury (`lean`), a nie `focusin`, więc lot jest widoczny także przy powtórzeniach i przy powrocie z okienka. Ruch liczy stała czasowa, nie sprężyna — bez podskoku na końcu i taki sam na 50, 60 i 120 Hz; farba drga wyłącznie kształtem (`sy = 1/sx`, pole zachowane), im dalej od celu tym bardziej domyka się w pigułkę, a kulka leci jako kropla z tylnym ogonem. Miny czytają się same: curious w locie, boom przy uderzeniu, happy przy rozlaniu, sleepy po 24 s bezczynności. Szybkie ciągnięcie gałki rezygnuje z ceremonii na rzecz lepkiego poślizgu, a przy ograniczonym ruchu zostaje sam poślizg bez smugi. Plamek pojawia się też tam, gdzie coś się ładuje (QR, start gry, ekran rozruchu) jako kulka obrysowująca koło ze smugą — a tam, gdzie faktycznie coś wiemy (etapy podawania ręki w pokoju), koło staje się miernikiem postępu. Model ruchu: `src/console/plamek.ts`, opis: `docs/plamek.md`.
- **Ruch:** krótkie przejścia View Transitions API ze wspólną okładką i tytułem tam, gdzie przeglądarka je obsługuje; 280 ms fallback przyciemnienia na pozostałych urządzeniach. W warstwie systemu wejścia i reakcje idą na wspólnej sprężynie (`--liquid-spring`), menisk pod wybranym tytułem i odblask na hover przesuwają się `transformem`, a okienko **wyrasta z przycisku, w który trafiło kliknięcie** (i wraca do niego przy zamknięciu); zero animacji zapętlonych w warstwie systemu (jedyna pętla to wskaźnik czekania Plamka). Bez dodatkowego opóźniania wejść. Opcjonalne ograniczenie ruchu respektuje także preferencje systemu.
- **Okienka:** ustawienia, pomoc, połączenia, ustawienia pada, pauza i centrum pokoju to **pływające karty na szkle**, a nie wysuwane szuflady z boku. Otwierają się i zamykają ruchem wprost z elementu, który je wywołał (liczonym z realnych kadrów, bez sztywnych założeń o układzie). Na telefonie ten sam komponent wstaje od dołu i respektuje safe-area. Natywny dialog utrzymuje fokus, obsługuje Escape i przywraca fokus po zamknięciu. Powrót z panelu pauzy wymaga potwierdzenia zakończenia rundy.
- **Kontroler:** matowa gałka, ruchomy cień, sprężysty powrót wizualny z natychmiastowym wyzerowaniem sygnału; przyciski z optycznym skokiem i skracającym się cieniem. Stały pasek koloru gracza, krótkie sygnały zdarzeń, krawędziowe efekty zamiast zasłaniania całego ekranu.
- **Pełny ekran telewizora:** administrator włącza go i wyłącza ze swojego pada lub pilota. Żądanie bez gestu na telewizorze nie przepada — ekran uzbraja się i wchodzi w pełny ekran przy najbliższym naciśnięciu klawisza na TV (tego wymaga polityka przeglądarek).
- **Tożsamość gracza:** ta sama paleta na telefonie, w bibliotece i w HUD-ach arcade. Kolor gry pozostaje osobną warstwą atmosfery.
- **Ergonomia:** lokalnie zapamiętywane rozmiar sterowania, wysokość stref kciuków, strona przycisku akcji w arcade, tryb ruchu oraz haptyka: wyłączona / subtelna / wyraźna. Stalowy Front zachowuje własne układy i zamianę stron.
- **Dźwięk:** miękkie sygnały nawigacji, zatwierdzenia, powrotu i dołączenia na dużym ekranie. Telefon ich nie dubluje. Muzyka menu jest opcjonalna, domyślnie wyłączona dla nowych użytkowników; poprzednia preferencja jest zachowana.
- **JoyLab:** opcjonalny „Poznaj swój pad”. Host wysyła stan `lab`, więc TV i telefony wchodzą do testu razem. Administrator wraca do biblioteki dla wszystkich, pozostali mogą lokalnie pominąć test. Czujniki ani haptyka nie są warunkiem gry.
- **Synchronizacja:** odliczanie i pauza na padzie korzystają z HUD-u hosta, a nie niezależnego zegara. Utrata fokusu, otwarcie ustawień i pauza zerują wejścia kontrolera.

To nadal aplikacja przeglądarkowa: Vibration API nie steruje amplitudą ani adaptacyjnymi triggerami i jest niedostępne w iOS Safari. Profile haptyczne zmieniają długość i rytm, nie fizyczną siłę silnika. Brak wibracji nie blokuje sterowania.


| Gra | Co się dzieje | Telefon |
| --- | --- | --- |
| **Stalowy Front** | Bitwy czołgów: 3 mapy, rykoszety, niszczalne osłony, bonusy i boty | Joystick jazdy, joystick wieży, ogień |
| **Neonowy Pęd** | Właściwy wyścig Three.js z miasta ZIP-a: mokry proceduralny tor, drifty, rampy, turbo, itemy i split-screen | Kierunek jazdy + akcja bonusu |
| **Orbitalna Fala** | Kooperacyjna obrona przed kolejnymi falami dronów i asteroid; życia, osłony, naprawy i szybki ogień | Lot, celowanie i strzał |
| **Wężowy Wir — beta** | Taktyczna arena 2D w stalowo-bursztynowej oprawie: impulsy, przeszkody, boty i sprint | Cztery kierunki + sprint |
| **Turbo League** | Piłka samochodowa 3D na stadionie: pełna fizyka, boost z żółtych pól, odbicia od band, powtórki goli; mecz do 3/5/7 goli, złoty gol w dogrywce; skład 1v1–2v2 z botami | Joystick: kierunek jazdy · AKCJA: boost |
| **WEBZA — Nocna Dostawa** | Kurierzy pizzy huśtają się na sieci między dachami i trafiają w światło zamówień; współpraca z oceną zespołu albo rywalizacja o MVP | Joystick: bieg · AKCJA: sieć · pizza leci sama w klienta |
| **BlockCraft — zapowiedź** | Planowany sandbox z budowaniem z bloków. To zapowiedź, niegrywalna gra nie jest jeszcze dostępna. | Szczegóły wkrótce |

Dostępne gry mają własny ekran wejściowy, zasady, ustawienia rundy, HUD i ekran wyników. Gry arcade obsługują 1–4 graczy (plus opcjonalne boty tam, gdzie pasują). W ustawieniach można przełączyć **wspólną arenę / split-screen**, a profil sprzętu ogranicza DPR canvasa do płynnego trybu, balansu albo ostrego trybu jakości. Stalowy Front zachowuje swoje zasady 2–4 uczestników; możesz dobrać boty, gdy grasz sam.

### Grafika i wydajność

`Neonowy Pęd`, `Turbo League` i `WEBZA` korzystają z Three.js (WEBZA wymaga WebGL2 i nie ma wersji zastępczej; Turbo League ma prosty prototyp Canvas 2D tylko tam, gdzie WebGL2 w ogóle nie istnieje), a `Orbitalna Fala` próbuje lekkiego WebGL2 z fallbackiem Canvas2D. Silniki ładują się leniwie po wybraniu gry; `Wężowy Wir` i `Stalowy Front` używają lekkiego Canvas 2D. Profile jakości ograniczają DPR i koszt efektów, animacja joysticka jest aktualizowana najwyżej raz na klatkę, a renderowanie zatrzymuje się po ukryciu karty. Wężowy Wir dodatkowo interpoluje ruch segmentów, zachowując niskie obciążenie.

## Jak zagrać

1. Otwórz JoyPad na komputerze lub TV. Pokój z pięcioznakowym kodem otwiera się automatycznie. Na ekranie widać **QR** (duży, odświeżany sam) i listę miejsc; kod pokoju jest pod nim, jeśli ktoś woli wpisać adres ręcznie.
2. Każdy gracz skanuje QR albo otwiera tę samą stronę z `#pad`, wpisuje kod i opcjonalny nick. Nie trzeba zakładać konta ani instalować aplikacji.
3. **Pierwszy aktywnie połączony telefon zostaje administratorem**. Wybiera grę na pilocie, zmienia opcje, uruchamia rundę, pauzuje i wraca do biblioteki. Pozostałe telefony są padami do gry, ale nie zmieniają menu. Gdy administrator odejdzie, uprawnienie przechodzi na najdłużej podłączony z pozostałych telefonów — niekoniecznie na slot 1.
4. Wystarczy jeden ekran i jeden telefon. Bez telefonu możesz wybrać grę myszką/klawiaturą i grać na klawiaturze. Na telefonie menu jest teraz prostym pilotem: strzałki, `OK`, `WSTECZ` i `GRY`; nie ma tam joysticka ani ciężkich ekranów gry. W lobby i w każdym okienku pad chodzi tak samo: gałka (z powtarzaniem przy trzymaniu) albo krzyżak, `A` zatwierdza, `B` cofa, `X`/`Y` pełnią skróty podpisane na dole telewizora; administracyjny pilot potrafi też rozłożyć pełny ekran TV. W sekcji **TWÓJ NICK** można po połączeniu zmienić nazwę bez rozłączania; zapisuje się lokalnie na telefonie, roster odświeża się wszystkim, a nick trafia do HUD-u każdej gry. W rozgrywce telefon przełącza się automatycznie na joystick i przyciski akcji: gracz 1 `WSAD` + `Q`/Spacja, gracz 2 strzałki + Enter, gracz 3 `TFGH` + `R`, gracz 4 `IJKL` + `U`. `P`/`Esc` pauzuje.

Telefony podłączone **w trakcie rundy** dostają miejsce w pokoju, ale dołączą do rozgrywki od kolejnej rundy, jeśli ich postać nie była na starcie. Kod pokoju i połączenie pozostają aktywne podczas zmiany gier. Na telefonie można rozłączyć się ręcznie. Administrator może wrócić do JoyPad podczas rundy (w menu pada jest potwierdzenie), a host ma przycisk powrotu.

### Stalowy Front: sterowanie, które już działało

- Lewy joystick: **KIERUNEK** (czołg jedzie tam, gdzie pchasz palec) lub **CZOŁG** (góra = przód, boki = obrót). Ustawienie jest zapamiętywane.
- Prawy joystick: kierunek wieży niezależny od jazdy. Wychylenie do czerwonego pierścienia może automatycznie strzelać; jest też przycisk **OGIEŃ**. W ustawieniach pada można wyłączyć prawy joystick, auto-ogień i zamienić strony.
- Wibracje sygnalizują strzał, trafienie, bonusy i wynik. Oryginalny silnik Canvas, mapy i efekty audio nie zostały zastąpione.

### Telefon bez zbędnych uprawnień

Pad nie prosi o kamerę, mikrofon, geolokalizację ani powiadomienia — QR jest odczytywany na drugim urządzeniu, a połączenie nie wymaga tych danych.

- **Wibracje** nie mają standardowego okna „Zezwól”. API wymaga prawdziwego tapnięcia, więc ekran pada pokazuje `TEST` i odblokowuje je synchronicznie przy przycisku, akcji lub joysticku. `navigator.vibrate()` nie jest dostępne np. w iOS Safari; wtedy zostaje wizualny flash i status „Brak wibracji”, bez udawania sukcesu.
- **Wake Lock** jest domyślnie wyłączony. Włącza się go w `FUNKCJE TELEFONU`, tylko gdy użytkownik chce, a interfejs pokazuje `aktywny`, `brak wsparcia` albo `odrzucony przez system`. Po powrocie do widocznej karty blokada jest ponawiana.
- **Pełny ekran i blokada obrotu** uruchamiają się wyłącznie po naciśnięciu przycisku. Brak wsparcia lub odrzucenie nie blokuje gry i jest widoczne w statusie.
- **Sterowanie przechyłem** jest osobnym, wyłączonym domyślnie trybem. Na iOS przycisk wywołuje jawne `DeviceOrientationEvent.requestPermission()`; odmowa nie wpływa na zwykłe sterowanie dotykowe.

### Dwa proste układy pada

W menu telefonu można w trakcie rundy, bez rozłączania, przełączyć i zapamiętać na tym telefonie:

- **Minimalny** — jedna duża, pływająca gałka i jeden przycisk akcji. Krótkie etykiety oraz brak drugiego joysticka ułatwiają grę jedną ręką; w Orbitalnej Fali celowanie automatycznie wybiera najbliższy cel.
- **Twin-stick** — obecny układ dla jazdy i niezależnego celowania. W Orbitalnej Fali zachowuje osobną gałkę celu, a w Stalowym Froncie nadal dostępne są jazda, wieża, auto-ogień i zamiana stron.

Przełączenie układu wpływa tylko na telefon, nie na sesję ani split-screen pozostałych graczy. Haptyka jest dodatkiem: każdy kierunek i akcja ma pełny fallback dotykowy, więc brak Vibration API nie odbiera sterowania.

## Łączność i ograniczenia

Zachowano dotychczasową ścieżkę połączenia: **PeerJS / WebRTC**, opcjonalny **TURN** oraz awaryjny przekaźnik przez publiczne brokery MQTT-over-WebSocket. Host i telefon ścigają WebRTC z przekaźnikiem; działa to także między Wi‑Fi a LTE, o ile urządzenia mają internet i przynajmniej jedna z tych zewnętrznych usług jest dostępna. **GitHub Pages nie udostępnia własnego serwera sygnalizacji ani gwarantowanego przekaźnika** — publiczne usługi mogą czasem zawodzić. W panelu hosta i telefonu dostępny jest test „Sprawdź połączenie”.

Gdy chcesz używać własnego PeerServer, dodaj do adresu hosta `?srv=host:port/peerjs` (opcja zostanie przekazana przez QR i zapamiętana na telefonie). QR zawiera dodatkowo krótkotrwały klucz pokoju używany tylko podczas handshake; klucz jest wymieniany automatycznie (po limicie czasu i po każdej awarii sygnalizacji) oraz ręcznie przyciskiem „Odnów kod”, więc kod na ekranie nie gaśnie, a połączone pady nic nie tracą; parametry TURN i credentiale nie są kopiowane do linku. WebRTC jest nadal ścieżką preferowaną, a relay pozostaje awaryjny — zabezpieczenia nie są wykonywane przy każdym pakiecie wejścia. Własny TURN można skonfigurować lokalnie na obu urządzeniach parametrami `?turn=turn:twoj-host:3478,turns:twoj-host:5349` wraz z opcjonalnym `turnUser` i `turnPass`, albo przez zmienne buildu `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`. Dane TURN są widoczne dla klientów WebRTC — używaj danych krótkotrwałych lub konta z limitem. Pokój jest zabezpieczony **kodem zaproszenia**, nie systemem logowania; nie udostępniaj kodu nieznajomym.

## Publikacja na GitHub Pages i zmiana nazwy repozytorium

Workflow `.github/workflows/deploy.yml` buduje stronę po pushu na **main** i publikuje katalog `dist` na Pages. W repozytorium: **Settings → Pages → Build and deployment → GitHub Actions**. `VITE_BASE` jest wyliczane automatycznie z **aktualnej nazwy repozytorium**, a link QR opiera się na aktualnym adresie strony. Nazwa projektu wewnątrz strony i pakietu to już **JoyPad**.

Po scaleniu zmian do `main` możesz zmienić nazwę repozytorium na **JoyPad** w GitHub **Settings → General → Repository name**. Następnie uruchom ręcznie **Actions → Deploy to GitHub Pages → Run workflow** (albo zrób nowy push na main), żeby ponownie zbudować stronę pod `https://<nazwa-użytkownika>.github.io/JoyPad/`. Wystarczy nowy QR po uruchomieniu pokoju — stare linki wskazujące poprzednią nazwę repo mogą być nieaktualne. Nie trzeba ręcznie podmieniać ścieżek w kodzie. Dla repozytorium o nazwie `<użytkownik>.github.io` zamiast projektu `/JoyPad/` ustaw `VITE_BASE=/` w workflow.

## Rozwój

```bash
npm ci
npm run dev                 # lokalnie http://localhost:5173/  |  pad: /#pad
npm run build               # TypeScript + produkcyjny build
npm run lint                # ESLint (flat config) + reguły react-hooks
npm run selftest:arcade     # role admina, protokół, aktywne silniki + macierze WebGL2
npm run selftest:console    # preferencje, dostępna biblioteka, kolory, priorytety haptyki
npm run selftest:relay      # warstwa MQTT / awaryjnego przekaźnika
npm run selftest:v16        # turniej/2v2, galeria i kontrakt profilu v1.6
npm run selftest:cinema     # film „Poznaj JoyPad": sceny, czasy, kamera, jakość, napisy
npm run selftest:league     # Turbo League: mostek pada, sterowanie, napisy, pełny mecz
npm run selftest:pizza      # WEBZA: mostek pada, napisy, zmiana, dostawy, Moments
npm run selftest:ui         # test dymny interfejsu: splash, pytanie o poradnik, film, wszystkie okna
npm run selftest:all        # wszystko powyżej jednym poleceniem
npm run verify              # lint + typecheck + selftest:all + build
npm run selftest:preview    # smoke PRAWDZIWEGO bundla (jsdom; JOYPAD_PREVIEW_DIR=dist sprawdzi build z Pages)
npm run selftest:delivery   # czy serwer podglądu podaje każdy zasób (wymaga działającego serwera)
```

Każdy push/PR przechodzi workflow `ci.yml` (lint, typecheck, wszystkie selftesty, testy wideo Playwright, build z `VITE_BASE` oraz smoke i kontrola dostarczania **gotowego artefaktu Pages**), a `deploy.yml` powtarza ten sam zestaw przed publikacją na GitHub Pages — na stronę trafia tylko build, który sam się uruchamia i podaje wszystkie zasoby. Fonty (Black Ops One, Chakra Petch, JetBrains Mono) są self-hostowane przez Fontsource — bez żądań do Google Fonts. Okładki gier to WebP, a `public/manifest.webmanifest` z ikonami pozwala „dodać JoyPad do ekranu głównego" na telefonie.

Stack: Vite, React, TypeScript, Canvas 2D, Three.js, raw WebGL2, PeerJS, QRCode. `src/arcade/catalog.ts` to biblioteka; `src/arcade/neon/` zawiera silnik Neonowy Pęd i adapter JoyPad, a `src/arcade/games/` lekkie silniki Canvas z jedną warstwą obsługi klawiatury/pada (`src/arcade/runtime.ts`), `src/arcade/league-next/` i `src/arcade/pizza/` to silniki Three.js wciągnięte z paczek ZIP, a `src/arcade/starclash/` — silnik Orbitalnej Fali. `src/arcade/webgl/runtime3d.ts` dostarcza mały renderer WebGL2, macierze kamery, low-poly geometrię i profile DPR, a `League3D.ts` jest używany przed fallbackiem Canvas2D. Wersja Canvas (`League.ts`) pozostaje bezpiecznym fallbackiem. `src/App.tsx` i `src/game/` zawierają Stalowy Front. `src/net/` zachowuje istniejący transport, poszerzony o stan sesji i komendy admina. Używany jest hash `#pad`, więc GitHub Pages nie potrzebuje routingu serwerowego.

### Warstwa JoyPad OS

`src/console/` zawiera bibliotekę, wspólne panele, preferencje, dźwięki systemowe, identyfikację kontrolera i style powierzchni. Nie zmienia silników fizyki ani transportu WebRTC/MQTT. Preferencje urządzenia mają klucz `joypad.console`; zapis w pamięci jest opcjonalny i jego blokada nie przerywa pracy.

Lista sprawdzeń i ograniczeń testu sprzętowego: [docs/console-testing.md](docs/console-testing.md).

### Wspólny wieczór

Telefony mogą zgłaszać **„Jestem gotowy”** przed rundą i **„Chcę rewanż”** po niej. Host pokazuje potwierdzone zgłoszenia, ale to gospodarz uruchamia grę; klawiatura nadal działa bez telefonu. Zmiana ustawień zeruje gotowość. Rozłączeni gracze nie pozostawiają głosów.

Ostatnia uruchomiona gra i ustawienia są zapamiętywane lokalnie (`joypad.evening.*`). **„Zagraj ponownie”** wraca do przygotowania nowej rundy — nie wznawia niezapisanego meczu. Brak dostępu do pamięci przeglądarki nie blokuje gry.

### Profil telefonu i bezpieczeństwo dotyku

Przy pierwszym otwarciu pada wybierz **Android**, **iPhone / iPad** lub **Automatycznie**. Profil można zmienić w ustawieniach telefonu. Profil iOS utrzymuje gałkę w stałym miejscu; nie udaje obsługi wibracji ani pełnego ekranu. Szybki test w labie pozwala sprawdzić gałkę i akcję na TV bez sensorów.

Przerwanie dotyku, obrót, przejście do tła i utrata sygnału zerują sterowanie. Host dodatkowo odcina stare wejście po około sekundzie bez aktualizacji, bez pauzowania wszystkim. Telefon wracający do tej samej sesji próbuje odzyskać poprzednie wolne miejsce przez 60 sekund.

Na wynikach telefony mogą proponować następną grę, ale wybór zatwierdza gospodarz. Przypomnienia o gotowości są ręczne i mają ograniczenie częstotliwości. Wszystkie nowe animacje respektują ograniczenie ruchu.

### Podglądy rozgrywki w bibliotece

Ilustracje pozostają na kafelkach wyboru gier. Tłem biblioteki jest teraz krótkie **nagranie rozgrywki botów** wybranego tytułu: Stalowy Front, Neonowy Pęd lub Orbitalna Fala. To ośmiosekundowe, bezgłośne klipy z rzeczywistych silników, a nie uruchomiona gra w tle.

Nagrania to prawdziwe Full HD (1920×1080, 24 fps) z silników gier — plansza jest dopasowana do własnego kształtu 16:9, więc cały obraz widać i na małym laptopie, i na telewizorze panoramicznym, a okładka wybranej gry pozostaje rozmytym tłem. Panel „WSPÓLNY EKRAN” jest półprzezroczystym szkłem, więc nie zasłania rozgrywki.

Na dużym ekranie podgląd startuje po chwili zatrzymania wyboru (także w przeglądarkach telewizorów). Telefon, ograniczony ruch i wykryte oszczędzanie danych wymagają ręcznego odtwarzania. Przycisk odtwarzania/pauzy na górnym pasku oraz ustawienie „Automatyczne podglądy gier” dają kontrolę nad ruchem. Brak obsługi pliku zostawia okładkę i nie blokuje gry. Informacje o nagraniach: [public/previews/README.md](public/previews/README.md).
