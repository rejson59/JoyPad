# JoyPad — prompt dla nadchodzącej gry

**Stan kontraktu: JoyPad OS 02, wrzesień 2026.** Turbo League i BlockCraft pozostają zapowiedziami (`wip: true`). Dokument zawiera prompt wyłącznie dla Turbo League oraz bezpieczną procedurę integracji ZIP; BlockCraft na tym etapie jest tylko teaserem, nie grywalną grą.

## Jak używać

1. Skopiuj **cały blok** wybranej gry do osobnej sesji Arena.ai. Każdy jest samowystarczalny: zawiera wymagania gry, kontrakt hosta, testy i pakowanie.
2. Najlepiej dołącz `src/arcade/runtime.ts`, `src/net/protocol.ts`, `src/platform/momentRecorder.ts` i tę dokumentację, nawet jeśli nie udostępniasz całego repo.
3. Pobierz ZIP ze źródłami. Skopiuj go do repo JoyPad (ZIP-y są ignorowane przez Git) lub załącz w nowej sesji.
4. Użyj promptu integracyjnego na końcu pliku. Integracja to przegląd i zmiana kodu, **nie instalacja paczki przez stronę**. Agent ma zweryfikować API na aktualnej gałęzi; kontrakt może się zmienić w kolejnych aktualizacjach.
5. Nie nadpisuj całego repo wyeksportowaną aplikacją demo. Importuj moduł, assety i adapter.

## Spis

- [Turbo League](#1-turbo-league--league)
- [Import otrzymanej paczki](#2-prompt-do-integracji-otrzymanego-zip)

## 1. Turbo League — `league`

Skopiuj cały blok:

```text
ZADANIE: Turbo League / JoyPad gameId="league"
Docelowy eksport adaptera: LeagueNextRound. Nazwa paczki: joypad-league.zip.

KIERUNEK GRY
Zbuduj dynamiczny car-soccer na małej arenie: czytelna piłka, kontrolowane samochody, realna fizyka kontaktu, bramki, obrony i napięcie do ostatniej sekundy. Autorska oprawa sportowej zabawki premium: jasne bandy, matowy stadion, ciepłe światło reflektorów, kontrastowa murawa. Nie kopiuj brandingu, pojazdów, HUD-u ani assetów Rocket League. Gra musi mieć własną osobowość, ale sterowanie pozostaje przystępne dla osoby trzymającej telefon pierwszy raz.

REGUŁY I DRUŻYNY
primary oznacza limit [3,5,7] goli. secondary oznacza [0,1,2,3] rywali AI, limit łącznie cztery auta. Zdefiniuj rozsądny podział 1v1, 2v1 lub 2v2 przy różnej liczbie ludzi i botów. Nie wstawiaj dodatkowych botów, jeśli config.players już ich zawiera. Demo pokazuje skład drużyn. Mecz trwa 180 sekund; przy remisie dogrywka do pierwszego gola z ograniczeniem maksymalnego czasu i uczciwym remisem, gdy nic nie pada. Wynik drużynowy nie jest sumą przypadkowych dotknięć piłki. Dla zwycięskiej drużyny opisz adapter: obecny RoundResult ma winnerSlot tylko dla jednego gracza i allWon dla całej ekipy; nie oznaczaj porażonych allWon:true. Zwróć reprezentanta zwycięskiej drużyny i wpisz rezultat drużynowy w detail wszystkich, albo zaproponuj dokładną, minimalną przyszłą zmianę kontraktu bez samowolnego zmieniania platformy.

STEROWANIE I FIZYKA
Gałka wskazuje żądany kierunek jazdy w osiach ekranu; auto obraca się płynnie i przyspiesza, wejście neutralne hamuje. Akcja to boost z ograniczonym zasobem oraz czytelnymi polami regeneracji. Uczucie ciężaru bez frustracji: mały promień skrętu, przewidywalny drift i odzyskiwanie kontroli. Nie dodawaj skoku, lotu i kilkunastu tricków, których nie da się obsłużyć aktualnym padem. Piłka ma prędkość, tarcie, sprężyste odbicia i maksimum energii; samochody rozdzielają się po zderzeniu bez trwałego sklejenia. Zastosuj swept tests/substepping, aby boost nie przenosił przez piłkę ani bandę.

BRAMKI I KAMERA
Gol liczy się po pełnym przekroczeniu linii bramkowej, tylko raz. Detekcja uwzględnia promień piłki, poprawny kierunek i obszar bramki. Samobój zalicza wynik rywalom. Po golu krótka celebracja z blokadą sterowania, reset piłki i graczy oraz odliczanie; czas meczu nie ucieka podczas prezentacji gola. Kamera wspólna pokazuje piłkę, oba cele i wszystkie auta; płynny zoom z granicami, bez gwałtownego bujania. Opcjonalny split tylko jeśli rzeczywiście działa; shared ma być domyślnie pełnoprawny.

AI, MOMENTS I ODBIÓR
Boty rozdzielają role: atak, wsparcie, obrona; nie wszyscy jadą do aktualnej pozycji piłki. Przewidują lot na krótki czas, nie mają nieskończonego boostu ani idealnego refleksu. Zaimplementuj przeciwdziałanie utknięciu przy bandzie. Telemetria: gol, obrona rzeczywistego strzału w światło bramki, asysta (ostatni kontakt partnera w oknie czasowym), wyrównanie w końcówce, zwycięski gol w dogrywce. Nie zaliczaj zwykłego odbicia jako „epickiej obrony”, jeśli piłka nie zmierzała do bramki. Wyświetl drużynowe wyniki i osobiste gole/asysty/obrony w detail. Testy fizyki, kontaktów przy dużej prędkości, dwóch aut uderzających naraz, gola w ostatniej klatce, samobója, dogrywki, podwójnej detekcji bramki, pauzy podczas celebracji i trzech restartów są obowiązkowe.

Pracujesz nad JEDNĄ kompletną grą do JoyPad — platformy kanapowego multiplayera. Nie buduj nowej biblioteki, logowania, pokoju sieciowego ani osobnej platformy. Gra ma sprawiać wrażenie dopracowanego tytułu konsolowego: czytelny cel, uczciwe reguły, przyjemne sterowanie, wyraziste środowisko i zamknięta pętla rozgrywki. Nie chcę makiety, filmu, przycisku „coming soon” ani pozornych statystyk. Zaimplementuj działający produkt, przetestuj go i oddaj źródła.

KONTEKST INTEGRACJI
JoyPad jest aplikacją Vite 7 + React 19 + TypeScript, korzysta z Three.js 0.186. Wspólny ekran (komputer/TV) jest autorytatywnym gospodarzem symulacji. Telefony są tylko padami: odbierają mały HUD i wysyłają stan sterowania przez istniejący WebRTC/MQTT. Nie dodawaj własnego serwera ani synchronizacji gry. Maksymalnie czterech uczestników, numery slotów nie muszą być kolejne. Reszta platformy zapewnia gotowość, konfigurację, pauzę, wyniki, rewanż, role, Player Pass i powiadomienia. Nie modyfikuj tych systemów, aby wygodniej napisać grę.

Jeżeli masz repo JoyPad, najpierw przeczytaj src/arcade/runtime.ts, src/arcade/ArcadeGameView.tsx, src/net/protocol.ts, src/platform/momentRecorder.ts i istniejący adapter gry. Sprawdź rzeczywiste wersje API przed pisaniem. Gdy pracujesz w pustym projekcie, zbuduj niezależne demo plus cienki adapter do kontraktu poniżej. W README jasno oddziel standalone od adaptera. Nie zakładaj, że w przyszłym repo istnieje import z Twojego demo/App.tsx.

KONTRAKT SILNIKA — ZACHOWAJ GO
Eksportuj klasę implementującą GameRound: start(): void, destroy(): void, togglePause(): void. Konstruktor przyjmuje HTMLCanvasElement oraz RoundConfig. start() nie tworzy wielu pętli po powtórnym wywołaniu, destroy() jest bezpieczne również przed startem. RoundConfig zawiera:
- players: {slot:number; name:string; color:string; isBot:boolean}[];
- padInputs: PadInput[] — współdzielona tablica, odczytywana po slotach w każdej klatce;
- primary:number i secondary:number — indeksy opcji opisanych niżej, nie wartości liczbowe opcji;
- displayMode?: 'shared'|'split'; quality?: 'performance'|'balanced'|'quality';
- onHud(hud): void; onFinish(result): void; onFx(slot, fx): void;
- onMoment?(event): void — opcjonalna telemetria nowych Moments.
- onFrame?(canvas:HTMLCanvasElement, overlay?:HTMLCanvasElement):void — wywołaj synchronicznie po każdym pełnym renderze. JoyPad kopiuje obraz do lokalnych powtórek wideo. Dla WebGL wywołaj w tym samym zadaniu zaraz po renderer/composer.render(), przed wyczyszczeniem drawing buffer; dla split-screen dopiero po wszystkich viewportach. Jeśli masz osobny canvas HUD, przekaż go jako overlay. Nie nagrywaj samodzielnie i nie zmieniaj preserveDrawingBuffer; host zapewnia kodek, limit pamięci, pauzę, pobieranie i sprzątanie URL.

PadInput ma fwd, turn, fire oraz opcjonalne steer ('direct'|'tank'), dirX, dirY, aimX, aimY. dirX dodatni oznacza prawo ekranu, dirY dodatni dół. fire to akcja, nie zawsze strzał. ZERO_INPUT to stan neutralny. Nie interpretuj braku danych jako stałego gazu. Nie zapamiętuj referencji padInputs[slot], ponieważ host podmienia obiekt przy zerowaniu. Czytaj ją ponownie co krok. Użyj istniejącego mapowania klawiatury z runtime, jeśli pracujesz w repo. W demo pokaż mapowanie i obsłuż co najmniej jednego gracza klawiaturą; nie wymagaj telefonów do uruchomienia testów.

RoundHud: {timeLeft:number; countdown:number; paused:boolean; objective:string; status:string; players:RoundPlayer[]; powerUp?:RoundPowerUp|null}. RoundPlayer: {slot,name,color,score,detail,isBot,value?,maxValue?}. RoundPowerUp: {label,count,color,hint,rolling?}. RoundResult: {title,subtitle,winnerSlot:number|null,allWon?:boolean,players:RoundPlayer[]}. onFinish wywołaj dokładnie raz. Kooperacja z udanym finałem używa allWon:true, porażka false. HUD wysyłaj około 5–10 razy na sekundę, nie 60. Przekazuj stabilne sloty i rzeczywiste dane.

onFx przyjmuje tylko: fire, hit, kill, dead, pickup, shield, respawn, win, lose. Nowe semantyczne zdarzenia nie są nowymi typami pakietów sieciowych. Wyślij je jako onMoment?.({kind,slot,title,detail,at?,weight?}). kind: 'kill'|'streak'|'lead'|'lap'|'score'|'pickup'|'objective'. at to sekundy aktywnej rundy, bez pauzy i odliczania. Zdarzenie musi wynikać z konkretnego stanu symulacji; nigdy losowo wybieraj „bohatera”. weight w zakresie 20–120: zwykły bonus niski, spektakularny przełom wysoki. Nie duplikuj eliminacji, jeżeli już wysyłasz onFx('kill').

NIEZAWODNOŚĆ I WYDAJNOŚĆ
Użyj delta-time z ograniczeniem dużego skoku, najlepiej stałego kroku symulacji z akumulatorem i ograniczoną liczbą podkroków. Nie przenoś całego świata do React state. Pauza zamraża fizykę, AI, czas, efekty i dźwięk ciągły; wznowienie nie nadrabia czasu. blur/visibilitychange nie może zostawić wciśniętego sterowania. Restart daje czysty świat, nie kolejny zestaw listenerów. destroy usuwa requestAnimationFrame, timery, zdarzenia, obiekty audio, render targets, geometrie, materiały, tekstury i ewentualny renderer. Nie usuwaj canvas należącego do hosta, nie nadpisuj całego document.body.

Celuj w 60 FPS na zwykłym laptopie i utrzymuj grywalność przy 30 FPS. Ogranicz DPR (np. 1.5–2 zależnie od jakości), pule cząstek, liczbę dynamicznych świateł, draw calls i cienie. Profil performance redukuje efekty, a nie mechanikę. Przy braku WebGL pokaż kontrolowany błąd lub prawdziwy fallback — nie pusty ekran. Nie próbuj tworzyć kontekstu 2D na canvas, który ma już WebGL. Adaptuj istniejącą politykę fallbacków hosta, nie udawaj ich obsługi. Assety wyłącznie lokalne, z udokumentowaną licencją, ścieżki zgodne z import.meta.env.BASE_URL, działające pod /JoyPad/ na GitHub Pages. Bez CDN, kluczy API, płatnego backendu, globalnego CSS gry i ciężkiego zewnętrznego silnika.

JAKOŚĆ PREZENTACJI
Jedna spójna, autorska oprawa, dobre oświetlenie i kontrast, wyraźne sylwetki oraz maksymalnie trzy poziomy ważności informacji. Obraz czytelny z kanapy. Ruch i reakcje nie mogą zasłaniać celu. Uwzględnij reduced-motion: bez mocnego trzęsienia, pulsowania i agresywnego bloom. Nie opieraj informacji wyłącznie na kolorze. Dźwięk ma respektować mute JoyPad i ograniczenia autoplay. Nie kopiuj cudzych modeli, nazw marek, map ani ścieżek audio. Korzystaj z proceduralnej grafiki lub legalnych lokalnych assetów. Nie obiecuj obsługi funkcji, której nie zbudowałeś.

PAKIET DO PÓŹNIEJSZEGO WKLEJENIA DO JOYPAD
Po skończeniu przygotuj ZIP z kodem źródłowym, nie wyłącznie dist. W przyszłej sesji użytkownik pobierze ten ZIP i wklei go do repo JoyPad. Inny agent ma móc bez zgadywania bezpiecznie rozpakować paczkę, przenieść tylko moduł gry i uruchomić ją w miejscu tytułu „w budowie”. To zadanie integracyjne, NIE istniejąca funkcja uploadu ZIP w przeglądarce. Nie twórz autoinstalatora i nie uruchamiaj skryptów po rozpakowaniu.

W ZIP umieść jeden katalog główny joypad-league/. W nim:
1. game/ — komplet źródeł gry i adapter implementujący powyższy kontrakt; importy względne wewnątrz paczki;
2. assets/ — tylko potrzebne lokalne zasoby, z listą licencji;
3. demo/ — niezależne uruchomienie bez sieci, jasno oddzielone od kodu hosta;
4. tests/ — powtarzalne testy istotnych reguł i regresji, plus raport co rzeczywiście uruchomiłeś;
5. joypad-game.json — formatVersion:1, gameId, title, entry (ścieżka do adaptera), exportName, render:'webgl' lub 'canvas2d', supportedPlayers:[1,4], dependencies (wersje), assetsBase i lista plików do integracji;
6. INTEGRATION.md — dokładne mapowanie konfiguracji, sterowania, HUD-u, wyników i Moments; ścieżka docelowa src/arcade/league-next/; proponowana zmiana wyłącznie odpowiedniego case createRound; pliki assetów pod public/games/league/; ograniczenia i pełna procedura cofnięcia;
7. README.md — start demo, testy, build, opis zasad i checklisty; LICENSES.md.
Nie pakuj node_modules, .git, sekretów, cache, buildów, ZIP-ów w ZIP-ie, nagrań wielogigabajtowych ani obcego repo platformy. Jeżeli projekt zawiera package.json, podaj uczciwie zależności i nie używaj postinstall/preinstall. Zachowaj nazwy i wielkość liter plików działające na Linuksie.

ODBIÓR
Nie kończ po napisaniu kodu. Uruchom typecheck, build i testy. Sprawdź rozpoczęcie, 1/2/4 graczy, wolne sloty (np. 0 i 3), neutralny input, odłączenie pada, pauzę i wznowienie, 3 kolejne restarty, kompletne zakończenie, brak podwójnego onFinish, sprzątanie i resize. Sprawdź 1280×720, 1920×1080 i mały ekran demo, tryb jakości oraz BASE_URL=/JoyPad/. Opisz zmierzone wyniki, nie wymyślaj FPS ani testów sprzętowych. Jeżeli nie możesz wygenerować ZIP, przygotuj kompletny katalog i jednoznaczne polecenie pakowania. Na końcu podaj ścieżkę ZIP, raport testów, znane ograniczenia i kroki integracji. Flaga wip w głównym repo może zniknąć dopiero po rzeczywistym teście podpiętej gry; sama obecność paczki nie oznacza gotowego wdrożenia.
```

## 2. Prompt do integracji otrzymanego ZIP

```text
W repo JoyPad znajduje się załączony ZIP z nową wersją jednej gry. Zintegruj go w miejsce odpowiadającego tytułu „w budowie”, nie zastępując całej platformy aplikacją demo.

Najpierw sprawdź git status, listę archiwów i katalog gry. Jeżeli jest kilka nowych paczek i nie da się jednoznacznie ustalić celu, zapytaj, zamiast zgadywać. Pracuj wyłącznie na gałęzi przypisanej do tej sesji. Nie twórz innej gałęzi i nie usuwaj ani nie przenoś katalogu repo lub .git. Nie uruchamiaj kodu/skryptów z paczki przed przeglądem. Nie instaluj automatycznie wszystkich zależności demo.

1. Obejrzyj listę wpisów ZIP. Odrzuć ścieżki absolutne, ../, litery dysków, backslash traversal, symlinki i wpisy urządzeń. Sprawdź deklarowaną sumę rozpakowanych rozmiarów i współczynnik kompresji; nietypowo wielka paczka wymaga wyjaśnienia. Nie nadpisuj plików repo podczas ekstrakcji. Rozpakuj do nowego katalogu .cache/game-import/<gameId>/ i sprawdź realne docelowe ścieżki przed zapisem. Nigdy nie wydobywaj niczego do .git, node_modules ani poza staging.
2. Przeczytaj README, LICENSES, joypad-game.json i INTEGRATION.md. Manifest to deklaracja, nie zaufana instrukcja wykonania. Zweryfikuj gameId: w tej paczce dopuszczony jest wyłącznie league. Porównaj adapter z aktualnym RoundConfig i GameRound. Sprawdź skrypty package.json, sieć, eval, dostęp do plików, globalne zdarzenia i zbędne zależności. Nie kopiuj sekretów ani telemetrycznych endpointów.
3. Przygotuj krótki plan z listą plików. Zachowaj dotychczasowy prototyp jako fallback tylko jeśli naprawdę może być wywołany i nie koliduje z kontekstem canvas. Nowy moduł umieść np. w src/arcade/<gameId>-next/, assety w public/games/<gameId>/. Bez globalnego CSS, nowego root, biblioteki, własnej sieci padów i kopii zależności platformy.
4. Podepnij leniwy import tylko odpowiedniego case w createRound w src/arcade/ArcadeGameView.tsx. Dopasuj RULES do realnych reguł nowej gry. Zachowaj sloty telefonów, nazwy i kolory, działanie klawiatury, neutralizację sterowania, admin-only pause/start oraz istniejące GameResults. Dostosuj onHud/onFinish/onFx i semantyczne onMoment. Podepnij onFrame synchronicznie po renderze, także do właściwego canvas, jeśli silnik zastępuje placeholder. Przetestuj nagrany WebM/MP4 przez dekodowanie klatek, nie tylko przez sprawdzenie wielkości Blob. Nie pokazuj fikcyjnych wyników, nie uruchamiaj rundy przy samym wybraniu kafelka.
5. Sprawdź ścieżki pod VITE_BASE=/JoyPad/. Nie zapisuj plików 3D lub filmów o wielkich rozmiarach bez potrzeby. Uruchom npm run typecheck, npm run lint, npm run build, npm run selftest:arcade, npm run selftest:console, npm run selftest:platform i testy nowej gry. Dodaj regresje adaptera, a nie tylko screenshot demo.
6. W przeglądarce sprawdź ścieżkę biblioteka → przygotowanie → runda → pauza → wyniki/Moments → rewanż → biblioteka, także z 1/2/4 graczami i botami. Zweryfikuj obie orientacje telefonów, zachowanie po rozłączeniu, trzy restarty i sprzątanie listenerów/GPU. Jeżeli nie masz prawdziwych telefonów lub sieci WebRTC, opisz ograniczenie testów zamiast twierdzić, że zostały wykonane.
7. Dopiero po udanym teście zmień wip dla tego jednego id na false w src/arcade/catalog.ts, zaktualizuj opis, sterowanie i renderTag zgodnie z rzeczywistością. Przygotuj właściwą okładkę i opis; film podglądu ma pokazywać realny silnik, nie atrapę. Sprawdź, czy GamePreview wymaga dopisania nowego tytułu. Nie odblokowuj pozostałych gier. Jeśli paczka jest niekompletna, napraw ją w staging lub zostaw wip i podaj konkretne braki.
8. Podsumuj pliki, wyniki testów, znane ograniczenia oraz procedurę cofnięcia integracji. ZIP i staging nie powinny znaleźć się w commicie. Nie commituj ani nie wypychaj zmian, jeśli użytkownik tego nie prosił.

Cel: gotowa gra wewnątrz istniejącej konsoli JoyPad, nie osobna witryna otwierana w iframe.
```
