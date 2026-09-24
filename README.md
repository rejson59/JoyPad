# JoyPad 🎮

Siedem gier multiplayer na **jednym ekranie**. Telefony stają się bezprzewodowymi padami; komputer lub TV wyświetla wspólną arenę. JoyPad ma teraz ciemny, pomarańczowy interfejs w stylu konsoli, pozostałe światy faktycznie 3D (Three.js lub surowy WebGL2, z fallbackiem Canvas2D) oraz opcjonalny split-screen. Strona jest statyczna i może działać na GitHub Pages. Stalowy Front pozostaje pełną grą z dotychczasowym menu, mapami, botami i sterowaniem.

| Gra | Co się dzieje | Telefon |
| --- | --- | --- |
| **Stalowy Front** | Bitwy czołgów: 3 mapy, 2 tryby, rykoszety, niszczalne osłony, bonusy i boty | Joystick jazdy, joystick wieży, ogień |
| **Neon Circuit** | Właściwy wyścig Three.js z miasta ZIP-a: mokry proceduralny tor, drifty, rampy, turbo, itemy i split-screen | Kierunek jazdy + turbo |
| **Orbitalna Fala** | Kooperacyjna obrona przed kolejnymi falami dronów i asteroid; życia, osłony, naprawy i szybki ogień | Lot, celowanie i strzał |
| **Wężowy Wir** | Rywalizacja w neonowej arenie: rosnące węże, złote impulsy, kolizje, sprint i boty | Skręt + sprint |
| **Skarbiec Świątyni** | Wspólna wyprawa przez labirynt: relikty, skrzynie, pułapki, strażnicy i portal ucieczki | Ruch + sprint / otwieranie |
| **Voxel Frontier** | Lekki świat klocków: zbieranie surowców, rozbudowa bazy, dzień/noc i nocne crawlery | Ruch + akcja |
| **Turbo League** | Car soccer w perspektywie 3D-lite: auta, boost, odbicia i bramki | Kierunek + turbo |

Każda gra ma własny ekran wejściowy, zasady, ustawienia rundy, HUD i ekran wyników. Gry arcade obsługują 1–4 graczy (plus opcjonalne boty tam, gdzie pasują). W ustawieniach można przełączyć **wspólną arenę / split-screen**, a profil sprzętu ogranicza DPR canvasa do płynnego trybu, balansu albo ostrego trybu jakości. Stalowy Front zachowuje swoje zasady 2–4 uczestników; możesz dobrać boty, gdy grasz sam.

### Grafika i wydajność

Nowe światy korzystają z proceduralnych tekstur, świateł, cieni i geometrii perspektywicznej. `Neon Circuit` ładuje właściwy silnik Three.js z rozpakowanego `futuristic-3d-racing-game.zip` (miasto, tor, karty, AI, itemy, cząsteczki i audio), a pozostałe światy 3D próbują najpierw surowego WebGL2 z małymi low-poly siatkami; jeśli urządzenie nie ma WebGL2, automatycznie przechodzą na sprawdzony renderer Canvas2D. Canvas i WebGL mają stałą scenę, adaptacyjny limit DPR, zatrzymują się po ukryciu karty i ładują silniki dopiero po wybraniu gry. Dzięki temu oprawa wygląda bogaciej, ale nie tworzy niepotrzebnego obciążenia urządzenia.

## Jak zagrać

1. Otwórz JoyPad na komputerze lub TV. Pokój z pięcioznakowym kodem otwiera się automatycznie. Na ekranie widać **QR** i listę miejsc.
2. Każdy gracz skanuje QR albo otwiera tę samą stronę z `#pad`, wpisuje kod i opcjonalny nick. Nie trzeba zakładać konta ani instalować aplikacji.
3. **Pierwszy aktywnie połączony telefon zostaje administratorem**. Wybiera grę na pilocie, zmienia opcje, uruchamia rundę, pauzuje i wraca do biblioteki. Pozostałe telefony są padami do gry, ale nie zmieniają menu. Gdy administrator odejdzie, uprawnienie przechodzi na najdłużej podłączony z pozostałych telefonów — niekoniecznie na slot 1.
4. Wystarczy jeden ekran i jeden telefon. Bez telefonu możesz wybrać grę myszką/klawiaturą i grać na klawiaturze. Na telefonie menu jest teraz prostym pilotem: strzałki, `OK`, `WSTECZ` i `GRY`; nie ma tam joysticka ani ciężkich ekranów gry. W lobby działają strzałki + Enter; na ekranach gier również. W rozgrywce telefon przełącza się automatycznie na joystick i przyciski akcji: gracz 1 `WSAD` + `Q`/Spacja, gracz 2 strzałki + Enter, gracz 3 `TFGH` + `R`, gracz 4 `IJKL` + `U`. `P`/`Esc` pauzuje.

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
npm run selftest:arcade     # role admina, protokół, 6 silników + macierze WebGL2
npm run selftest:relay      # warstwa MQTT / awaryjnego przekaźnika
```

Stack: Vite, React, TypeScript, Canvas 2D, Three.js, raw WebGL2, PeerJS, QRCode. `src/arcade/catalog.ts` to biblioteka; `src/arcade/neon/` zawiera silnik Neon Circuit i adapter JoyPad, a `src/arcade/games/` sześć niezależnych silników z jedną warstwą obsługi klawiatury/pada (`src/arcade/runtime.ts`). `src/arcade/webgl/runtime3d.ts` dostarcza mały renderer WebGL2, macierze kamery, low-poly geometrię i profile DPR, a `Arcade3D.ts`, `League3D.ts` oraz `Voxel3D.ts` są używane przed fallbackiem Canvas2D. Wersje Canvas (`Voxel.ts`, `League.ts`) nadal służą jako bezpieczny fallback. `src/App.tsx` i `src/game/` zawierają Stalowy Front. `src/net/` zachowuje istniejący transport, poszerzony o stan sesji i komendy admina. Używany jest hash `#pad`, więc GitHub Pages nie potrzebuje routingu serwerowego.
