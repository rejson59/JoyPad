# JoyPad 🎮

**JoyPad OS** — matowa konsola do wspólnej gry na jednym ekranie. Telefon jest bezprzewodowym kontrolerem, komputer lub TV wyświetla grę. **Trzy gry są dostępne: Stalowy Front, Neonowy Pęd i Orbitalna Fala.** Cztery kolejne są w przebudowie i widoczne wyłącznie w sekcji „Wkrótce”. Nie można ich obecnie uruchomić z biblioteki.

## System konsoli

Paleta **Obsidian / Ember**: neutralne obsydianowe tła, jasna biel i pomarańczowy akcent głównych akcji. Wspólne kolory są zdefiniowane w `src/console/palette.css`; barwy graczy oraz sygnały ostrzeżeń pozostają niezależne od motywu.

- **Biblioteka:** panoramiczne tło wybranej gry, trzy duże okładki, status pokoju i cztery miejsca graczy. QR jest widoczny przed dołączeniem pierwszego pada; później dostępny przez „Dodaj gracza”.
- **Nawigacja:** lewo/prawo wybiera grę, góra przenosi do paska systemowego, dół do okładek. Enter/OK zatwierdza. Tab obsługuje wszystkie przyciski. Fizyczny gamepad ze standardowym mapowaniem obsługuje **bibliotekę** (krzyżak/gałka, A/B), nie zastępuje sterowania w silnikach gier.
- **Ruch:** krótkie przejścia View Transitions API ze wspólną okładką i tytułem tam, gdzie przeglądarka je obsługuje; 280 ms fallback przyciemnienia na pozostałych urządzeniach. Bez dodatkowego opóźniania wejść. Opcjonalne ograniczenie ruchu respektuje także preferencje systemu.
- **Panele:** wspólne wysuwane ustawienia, pomoc, połączenia, ustawienia pada i pauza. Natywny dialog utrzymuje fokus, obsługuje Escape i przywraca fokus po zamknięciu. Powrót z panelu pauzy wymaga potwierdzenia zakończenia rundy.
- **Kontroler:** matowa gałka, ruchomy cień, sprężysty powrót wizualny z natychmiastowym wyzerowaniem sygnału; przyciski z optycznym skokiem i skracającym się cieniem. Stały pasek koloru gracza, krótkie sygnały zdarzeń, krawędziowe efekty zamiast zasłaniania całego ekranu.
- **Tożsamość gracza:** ta sama paleta na telefonie, w bibliotece i w HUD-ach arcade. Kolor gry pozostaje osobną warstwą atmosfery.
- **Ergonomia:** lokalnie zapamiętywane rozmiar sterowania, wysokość stref kciuków, strona przycisku akcji w arcade, tryb ruchu oraz haptyka: wyłączona / subtelna / wyraźna. Stalowy Front zachowuje własne układy i zamianę stron.
- **Dźwięk:** miękkie sygnały nawigacji, zatwierdzenia, powrotu i dołączenia na dużym ekranie. Telefon ich nie dubluje. Muzyka menu jest opcjonalna, domyślnie wyłączona dla nowych użytkowników; poprzednia preferencja jest zachowana.
- **JoyLab:** opcjonalny „Poznaj swój pad”. Host wysyła stan `lab`, więc TV i telefony wchodzą do testu razem. Administrator wraca do biblioteki dla wszystkich, pozostali mogą lokalnie pominąć test. Czujniki ani haptyka nie są warunkiem gry.
- **Synchronizacja:** odliczanie i pauza na padzie korzystają z HUD-u hosta, a nie niezależnego zegara. Utrata fokusu, otwarcie ustawień i pauza zerują wejścia kontrolera.

To nadal aplikacja przeglądarkowa: Vibration API nie steruje amplitudą ani adaptacyjnymi triggerami i jest niedostępne w iOS Safari. Profile haptyczne zmieniają długość i rytm, nie fizyczną siłę silnika. Brak wibracji nie blokuje sterowania.


| Gra | Co się dzieje | Telefon |
| --- | --- | --- |
| **Stalowy Front** | Bitwy czołgów: 3 mapy, 2 tryby, rykoszety, niszczalne osłony, bonusy i boty | Joystick jazdy, joystick wieży, ogień |
| **Neonowy Pęd** | Właściwy wyścig Three.js z miasta ZIP-a: mokry proceduralny tor, drifty, rampy, turbo, itemy i split-screen | Kierunek jazdy + akcja bonusu |
| **Orbitalna Fala** | Kooperacyjna obrona przed kolejnymi falami dronów i asteroid; życia, osłony, naprawy i szybki ogień | Lot, celowanie i strzał |
| **Wężowy Wir — wkrótce** | Rywalizacja w neonowej arenie: rosnące węże, złote impulsy, kolizje, sprint i boty | Skręt + sprint |
| **Skarbiec Świątyni — wkrótce** | Wspólna wyprawa przez labirynt: relikty, skrzynie, pułapki, strażnicy i portal ucieczki | Ruch + sprint / otwieranie |
| **Voxel Frontier — wkrótce** | Lekki świat klocków: zbieranie surowców, rozbudowa bazy, dzień/noc i nocne crawlery | Ruch + akcja |
| **Turbo League — wkrótce** | Car soccer w perspektywie 3D-lite: auta, boost, odbicia i bramki | Kierunek + turbo |

Dostępne gry mają własny ekran wejściowy, zasady, ustawienia rundy, HUD i ekran wyników. Gry arcade obsługują 1–4 graczy (plus opcjonalne boty tam, gdzie pasują). W ustawieniach można przełączyć **wspólną arenę / split-screen**, a profil sprzętu ogranicza DPR canvasa do płynnego trybu, balansu albo ostrego trybu jakości. Stalowy Front zachowuje swoje zasady 2–4 uczestników; możesz dobrać boty, gdy grasz sam.

### Grafika i wydajność

Nowe światy korzystają z proceduralnych tekstur, świateł, cieni i geometrii perspektywicznej. `Neonowy Pęd` ma silnik Three.js w `src/arcade/neon/` (miasto, tor, karty, AI, itemy, cząsteczki i audio) — ładowany leniwie dopiero po wybraniu gry, podobnie jak pozostałe silniki. Pozostałe światy 3D próbują najpierw surowego WebGL2 z małymi low-poly siatkami; jeśli urządzenie nie ma WebGL2, automatycznie przechodzą na sprawdzony renderer Canvas2D. Canvas i WebGL mają stałą scenę, adaptacyjny limit DPR, zatrzymują się po ukryciu karty i ładują silniki dopiero po wybraniu gry. Dzięki temu oprawa wygląda bogaciej, ale nie tworzy niepotrzebnego obciążenia urządzenia.

## Jak zagrać

1. Otwórz JoyPad na komputerze lub TV. Pokój z pięcioznakowym kodem otwiera się automatycznie. Na ekranie widać **QR** i listę miejsc.
2. Każdy gracz skanuje QR albo otwiera tę samą stronę z `#pad`, wpisuje kod i opcjonalny nick. Nie trzeba zakładać konta ani instalować aplikacji.
3. **Pierwszy aktywnie połączony telefon zostaje administratorem**. Wybiera grę na pilocie, zmienia opcje, uruchamia rundę, pauzuje i wraca do biblioteki. Pozostałe telefony są padami do gry, ale nie zmieniają menu. Gdy administrator odejdzie, uprawnienie przechodzi na najdłużej podłączony z pozostałych telefonów — niekoniecznie na slot 1.
4. Wystarczy jeden ekran i jeden telefon. Bez telefonu możesz wybrać grę myszką/klawiaturą i grać na klawiaturze. Na telefonie menu jest teraz prostym pilotem: strzałki, `OK`, `WSTECZ` i `GRY`; nie ma tam joysticka ani ciężkich ekranów gry. W lobby działają strzałki + Enter; na ekranach gier również. W sekcji **TWÓJ NICK** można po połączeniu zmienić nazwę bez rozłączania; zapisuje się lokalnie na telefonie, roster odświeża się wszystkim, a nick trafia do HUD-u każdej gry. W rozgrywce telefon przełącza się automatycznie na joystick i przyciski akcji: gracz 1 `WSAD` + `Q`/Spacja, gracz 2 strzałki + Enter, gracz 3 `TFGH` + `R`, gracz 4 `IJKL` + `U`. `P`/`Esc` pauzuje.

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

Gdy chcesz używać własnego PeerServer, dodaj do adresu hosta `?srv=host:port/peerjs` (opcja zostanie przekazana przez QR i zapamiętana na telefonie). Własny TURN można skonfigurować parametrami `?turn=turn:twoj-host:3478,turns:twoj-host:5349` wraz z opcjonalnym `turnUser` i `turnPass`, albo przez zmienne buildu `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`. Dane TURN są widoczne dla klientów WebRTC — używaj danych krótkotrwałych lub konta z limitem. Pokój jest zabezpieczony **kodem zaproszenia**, nie systemem logowania; nie udostępniaj kodu nieznajomym.

## Publikacja na GitHub Pages i zmiana nazwy repozytorium

Workflow `.github/workflows/deploy.yml` buduje stronę po pushu na **main** i publikuje katalog `dist` na Pages. W repozytorium: **Settings → Pages → Build and deployment → GitHub Actions**. `VITE_BASE` jest wyliczane automatycznie z **aktualnej nazwy repozytorium**, a link QR opiera się na aktualnym adresie strony. Nazwa projektu wewnątrz strony i pakietu to już **JoyPad**.

Po scaleniu zmian do `main` możesz zmienić nazwę repozytorium na **JoyPad** w GitHub **Settings → General → Repository name**. Następnie uruchom ręcznie **Actions → Deploy to GitHub Pages → Run workflow** (albo zrób nowy push na main), żeby ponownie zbudować stronę pod `https://<nazwa-użytkownika>.github.io/JoyPad/`. Wystarczy nowy QR po uruchomieniu pokoju — stare linki wskazujące poprzednią nazwę repo mogą być nieaktualne. Nie trzeba ręcznie podmieniać ścieżek w kodzie. Dla repozytorium o nazwie `<użytkownik>.github.io` zamiast projektu `/JoyPad/` ustaw `VITE_BASE=/` w workflow.

## Rozwój

```bash
npm ci
npm run dev                 # lokalnie http://localhost:5173/  |  pad: /#pad
npm run build               # TypeScript + produkcyjny build
npm run lint                # ESLint (flat config) + reguły react-hooks
npm run selftest:arcade     # role admina, protokół, 6 silników + macierze WebGL2
npm run selftest:console    # preferencje, dostępna biblioteka, kolory, priorytety haptyki
npm run selftest:relay      # warstwa MQTT / awaryjnego przekaźnika
```

Każdy push/PR przechodzi workflow `ci.yml` (lint, typecheck, selftesty, build), a `deploy.yml` powtarza selftesty (także `selftest:console`) przed publikacją na GitHub Pages. Fonty (Black Ops One, Chakra Petch, JetBrains Mono) są self-hostowane przez Fontsource — bez żądań do Google Fonts. Okładki gier to WebP, a `public/manifest.webmanifest` z ikonami pozwala „dodać JoyPad do ekranu głównego" na telefonie.

Stack: Vite, React, TypeScript, Canvas 2D, Three.js, raw WebGL2, PeerJS, QRCode. `src/arcade/catalog.ts` to biblioteka; `src/arcade/neon/` zawiera silnik Neonowy Pęd i adapter JoyPad, a `src/arcade/games/` sześć niezależnych silników z jedną warstwą obsługi klawiatury/pada (`src/arcade/runtime.ts`). `src/arcade/webgl/runtime3d.ts` dostarcza mały renderer WebGL2, macierze kamery, low-poly geometrię i profile DPR, a `Arcade3D.ts`, `League3D.ts` oraz `Voxel3D.ts` są używane przed fallbackiem Canvas2D. Wersje Canvas (`Voxel.ts`, `League.ts`) nadal służą jako bezpieczny fallback. `src/App.tsx` i `src/game/` zawierają Stalowy Front. `src/net/` zachowuje istniejący transport, poszerzony o stan sesji i komendy admina. Używany jest hash `#pad`, więc GitHub Pages nie potrzebuje routingu serwerowego.

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

Na dużym ekranie podgląd startuje po chwili zatrzymania wyboru. Telefon, ograniczony ruch i wykryte oszczędzanie danych wymagają ręcznego odtwarzania. Przycisk odtwarzania/pauzy na górnym pasku oraz ustawienie „Automatyczne podglądy gier” dają kontrolę nad ruchem. Brak obsługi pliku zostawia okładkę i nie blokuje gry. Informacje o nagraniach: [public/previews/README.md](public/previews/README.md).
