# JoyPad — notatka przygotowawcza agenta (handoff do następnej aktualizacji)

> Plik roboczy agenta Arena.ai. Stan gałęzi: `arena/01a0f36b-joypad` @ `b21d26b` („Add files via upload"),
> weryfikacja z **2026-09-30**. Cel dokumentu: następna sesja nie musi poznawać projektu od zera.

## 1. Co już zostało zrobione w tym środowisku

| Krok | Polecenie | Wynik |
|---|---|---|
| Zależności | `npm ci` | ✅ 236 pakietów, Node v22.22.3, npm 10.9.8 |
| Typy | `npm run typecheck` | ✅ czysto |
| Lint | `npm run lint` | ✅ czysto |
| Build | `npm run build` | ✅ ~6 s, chunk `three` 611 kB (próg ostrzeżeń 650 kB) |
| Build Pages | `VITE_BASE=/JoyPad/ npm run build` | ✅ assety pod `/JoyPad/assets/...` |
| Selftesty | `selftest:arcade`, `:console`, `:relay`, `:platform`, `:replay`, `:v16` | ✅ wszystkie OK |
| Dev server | `npm run dev -- --host 0.0.0.0 --port 5173` | ✅ działa; `#pad`, `/manifest.webmanifest`, `/previews/*.mp4` → 200 |
| Testy wideo | `npx playwright install chromium` | ❌ **zablokowane w sandboxie**: `ECONNRESET` z `cdn.playwright.dev`, brak systemowego Chromium. `npm run test:replay` lokalnie NIE przejdzie — uruchamia się w CI (`ci.yml` instancjuje Chromium). To samo ograniczenie opisane w `docs/v1.6.md`. |

**2026-09-30 (później):** wdrożona warstwa stylu „liquid glass" — `src/console/liquid.css` (pigułki, karty,
pływające okienka zamiast wysuwanych paneli), dokumentacja `docs/liquid-glass.md`, nowe kontrole w
`selftest:console` (martwe selektory, tokeny powierzchni, kompletne fallbacki, kontrast tekstu na szkle ≥7:1).
Każda kolejna zmiana UI powinna brać szkło z tokenów `--lg-*` i prymitywów `lg-*`, nie pisać `backdrop-filter`
ani tła z alfą wprost — selftest to wyłapie.

Wniosek: **baza jest zielona**. Jakiekolwiek czerwone światło po zmianach = nasz błąd, nie środowiska (poza testami Playwright).

## 2. Czym jest JoyPad (mapa, nie powtórka README)

Vite 7 + React 19 + TS strict, zero backendu, publikacja na GitHub Pages. Jeden wspólny ekran
(TV/komputer) jest **autorytatywnym hostem symulacji**; telefony są tylko padami przez
**PeerJS/WebRTC z awaryjnym relay MQTT** (`src/net/`). Routing po hashu `#pad` — Pages nie potrzebuje serwera.

Warstwy, które trzeba rozróżniać przy każdej zmianie:

- `src/arcade/runtime.ts` — kontrakt rundy + `CanvasRound` (wspólna pętla, DPR, pauza, klawiatura 4 slotów).
- `src/arcade/catalog.ts` — biblioteka i **jedyne źródło prawdy o dostępności** (`wip: true` = kafelek podglądu, brak startu).
- `src/arcade/ArcadeGameView.tsx` — cykl `menu → game → over`, `RULES`, `createRound()` (leniwe importy silników + fallback WebGL2→Canvas2D), wysyłka HUD-u na pady, nagrywanie Moments, komendy pilota.
- `src/platform/achievements.ts` — karta pilota i osiągnięcia (storage `joypad.achievements.v1`,
  zdarzenie `joypad-achievement`, toast przez `notify`); okno `src/console/AchievementsSheet.tsx`,
  trofea na kafelkach i przycisk w stopce `ConsoleLibrary`.
- `src/arcade/<engine>/` — silniki: `games/{Tanks→src/App.tsx, Race, Orbit, Snake, League}.ts`, `neon/*`, `webgl/runtime3d.ts`, `starclash/*`.
- `src/console/` — powłoka konsoli (biblioteka, preferencje `joypad.console`, paleta `palette.css`, panele, wyniki).
- `src/platform/` — warstwa JoyPad OS: `momentRecorder.ts` (telemetria), `replayRecorder.ts` (MediaRecorder), `useRecordedMoments`, pokoje/role, Player Pass, i18n PL/EN, powiadomienia, `WhatsNew`.
- `src/pad/` — telefon: `JoypadController.tsx` (układ pion/poziom, twin-stick/minimalny), haptyka, funkcje urządzenia.
- `scripts/*-selftest.ts` — testy bez DOM, odpalane przez esbuild+node; **CI je traktuje jako bramkę**.

Reguły, które obowiązują zawsze: brak nowego serwera/backendu, brak CDN i zewnętrznych API, assety lokalne przez
`import.meta.env.BASE_URL`, respektowanie `prefers-reduced-motion`, degraded-path zamiast padania
(brak localStorage/WakeLock/haptyki/WebGL nie może blokować gry), HUD ~5–10 Hz, `onFinish` dokładnie raz.

## 3. Kontrakt silnika — skrót kontrolny

`GameRound { start() destroy() togglePause() }`, konstruktor `(HTMLCanvasElement, RoundConfig)`.
`destroy()` musi być bezpieczne przed `start()`, a `start()` idempotentne. `RoundConfig`:
`players`, `padInputs` (**czytać co klatkę, nie zapamiętywać referencji**), `primary`/`secondary`
(**indeksy opcji, nie ich wartości**), `displayMode`, `quality`, `language`, `onHud`, `onFinish`,
`onFx`, opcjonalne `onMoment`, `onFrame`.

`PadInput`: `fwd, turn, fire, steer?, dirX, dirY, aimX, aimY` — `dirY` dodatni = dół ekranu.
`onFx` przyjmuje wyłącznie: `fire hit kill dead pickup shield respawn win lose`.
`MomentEvent.kind`: `kill streak lead lap score pickup objective`, `weight` 20–120.
`onFrame(canvas, overlay?)` **synchronicznie po renderze**, dla WebGL w tym samym microleksie co
`composer.render()` (przez wyczyszczeniem bufora), dla split-screen dopiero po wszystkich viewportach.
`RoundResult`: `winnerSlot` dla jednego gracza albo `allWon: true` dla całej ekipy — nigdy mylić.

## 4. Stan obu paczek ZIP w korzeniu repo

Uwaga faktyczna: **oba ZIP-y są śledzone przez Gita** (trafiły do `b21d26b`), mimo `*.zip` w `.gitignore`
i zdania w `docs/game-building-prompts.md`, że „ZIP-y są ignorowane przez Git". Do rozstrzygnięcia przy
wydaniu: `git rm --cached *.zip` (sam plik zostaje na dysku) albo aktualizacja dokumentacji.

### `orbitalna-fala.zip` (2026-09-25) — **już zintegrowany, bezczynnościowy**

Jego silnik żyje w repo jako `src/arcade/starclash/` (`Game.ts`, `StarClashRound.ts`, `audio.ts`) i jest
podpięty w `createRound()` dla `orbit` (WebGL2 → STAR CLASH, fallback → `games/Orbit.ts` 2D).
Zostaw go jako **szablon integracji**: mostek chowa canvas hosta (`canvas.style.display='none'`), montuje
własny w `canvas.parentElement`, wystawia `onFrame`, `readCtrl(i)` (klawiatura + pad), `onShipFx`, `onHud`,
`onEnd`, a w `destroy()` odpina listenery i przywraca styl. Nie trzeba nic z nim robić.

### `nitro-league.zip` (2026-09-29) — **prawdopodobny cel następnej aktualizacji**

Samodzielne demo „NITRO LEAGUE — Samochodowa piłka nożna 3D" (Vite+React+Tailwind+Three.js, 7032 linie źródeł).
Zawartość: `src/game/{Game.ts 1700, textures 715, stadium 656, carModel 447, Car 473, ai 280, particles 283,
audio 499, physics 168, Ball 194, input 138, pads 147, strip 191, arena 50, constants 70, types 87}`,
`src/ui/{Menu 405, Hud 291}`, `src/App.tsx 228`. API silnika: `new Game(container, {onHud,onSettings}, settings)`,
`startMatch({mode 1-3, difficulty 0-2, minutes, team})`, `setPaused`, `restartMatch`, `quitToMenu`,
`startDemo`, `applyQuality`, `enterGarage/exitGarage/setGarage`, `attachMinimap`, `unlockAudio`, `dispose()`.
Fizyka: `STEP = 1/120` (podkroki ✓), arena `A=40.96 × B=51.2`, piłka `r=0.93`, `TEAM_HEX=['#1f6dff','#ff7a18']`,
34 boost pady, `CarInput = {throttle, steer, pitch, roll, jump, jumpPressed, boost, handbrake}`, `Phase =
menu|garage|countdown|playing|goal|replay|ended`, statystyki: goals/assists/saves/shots/demolitions.
Renderuje przez `EffectComposer + UnrealBloomPass + OutputPass` (czyli `onFrame` trzeba wpiąć po `composer.render()`).
Zależności paczki mieszczą się w `package.json` JoyPad (three ^0.186, react 19, clsx, tailwind-merge);
`vite-plugin-singlefile` jest tylko do budowania standalone demo — **nie dodawać** do JoyPad.

**Paczka NIE spełnia kontraktu pakowania** z `docs/game-building-prompts.md` §1: brak katalogu
`joypad-league/`, brak `joypad-game.json`, `INTEGRATION.md`, `LICENSES.md`, `README.md`, `tests/`, `assets/`,
`demo/`, i **brak jakiegokolwiek adaptera do `RoundConfig`**. importy są względne i bez `@/`, brak sieci,
brak `eval`, brak dostępu do plików, jedyny `localStorage` w `App.tsx` (prefensje demo, do usunięcia).
Czyli: integracja = pisanie adaptera od zera + decyzje produktowe, nie przepakowanie.

## 5. Decyzje do podjęcia PRZED pisaniem kodu (nie zgadywać)

1. **Skok, flipy, demolowanie.** Demo ma `jump/pitch/roll/handbrake` i `demolitions`; prompt JoyPad wprost
   zabrania mechanik nieobserwowalnych na padzie. Do wyboru: (a) telefoniczny input = tylko `throttle/steer/boost`,
   reszta tylko klawiatura hosta, (b) wyciąć powietrzne trymy z silnika, (c) `fire` = boost, podwójne
   przytrzymanie = flip. Rekomendacja: (a) + UI HUD bez zachęcania do skoków.
2. **`primary`/`secondary`.** `RULES.league` w repo = limit goli [3,5,7] i botów [0..3]; demo ma
   `minutes` + `mode` + `difficulty`. Trzeba mapować (limit goli → reguła końca meczu w silniku) albo
   przerobić `RULES`. Nie zostawiać sprzeczności między tekstem ustawień a faktycznymi zasadami.
3. **Drużyny i wynik.** `2v2` istnieje w formacie meczu platformy; przy 4 ludziach podział 2/2, przy 1 człowieku
   + boty. Wynik: `allWon` dla zwycięskiej ekipy + `winnerSlot=null` (albo reprezentant) — zgodnie z
   `docs/game-building-prompts.md`, bez własnych zmian kontraktu platformy.
4. **Fallback.** `games/League.ts` (Canvas) i `webgl/League3D.ts` (3D-lite) zostają jako ścieżka bez WebGL2?
   Tak — nowy silnik tylko jako `league` primary, stare case'y jako fallback.
5. **Moments.** Z `HudState`/`FeedItem` da się uczciwie wyjąć: gol (`objective`/`score`, weight ~110),
   asysta (`score` ~70), obrona (`objective` ~90 — tylko realny strzał w światło bramki), zwycięski gol
   w dogrywce (~120), wyrównanie w końcówce (~100). **Bez** „epickiej obrony" od zwykłego odbicia.
6. **Podgląd w bibliotece — rozstrzygnięte w rundzie 21.** `GamePreview.PREVIEW_GAMES` obejmuje wszystkie
   grywalne tytuły (`tanks,race,orbit,snake,league,pizza`); `PREVIEW_REVISION` = 3. Nagrania `league`, `pizza`
   i `snake` dopisano do `scripts/previews/capture.mjs`, a ponieważ sandbox agenta nie ma Chromium, powstał
   workflow `.github/workflows/previews.yml`: nagrywa jeden silnik na job, sprawdza klipy `selftest:console`
   i commituje je do gałęzi, z której wystartował. Bramka PREVIEW czyta listę z `GamePreview.tsx`, porównuje
   ją z `catalog.ts` (grywalny tytuł bez nagrania odpada, `wip` nie żąda nic), wymaga par mp4/webm, pilnuje
   wymiarów Full HD masterów i budżetu (plik <12 MB, folder <60 MB).
7. **Zakres odblokowania.** Tylko `league` (`wip: false`); `blockcraft` pozostaje teaserem.
   *(Runda 25: `blockcraft` odblokowany — silnik 2.29 z repo `rejson59/mconline`, patrz
   `docs/imported-games.md` §BlockCraft; teaserów brak, biblioteka ma siedem światów.)*

## 6. Gotowy plan integracji (kolejność działań)

1. Staging **poza** drzewem prac: `.cache/game-import/league/` (ignorowany), ekstrakcja z kontrolą ścieżek
   (brak `../`, liter dysku, symlinków, entries-katalogów poza staging). Nigdy nie nadpisuj `src/` podczas rozpakowywania.
2. Przenieś silnik do `src/arcade/league-next/` (bez `App.tsx`, `ui/Menu.tsx`, `ui/Hud.tsx`, `input.ts`,
   `pads.ts`-jako-sprzętu, `localStorage`), assety (jeśli będą) do `public/games/league/`.
3. Napisz `LeagueNextRound.ts` wg wzorca `StarClashRound.ts`: montaż w `canvas.parentElement`, `onFrame`
   po `composer.render()`, `readPad(slot)` z `config.padInputs[slot]` + klawiatura `KEY_SETS`, `onHud` ~10 Hz,
   `onFinish` raz, `destroy()` = `dispose()` renderer+audio+kompozytor+listenerzy+przywrócenie `canvas.style.display`.
4. Podepnij **wyłącznie** `case 'league'` w `createRound()`; `RULES.league` (PL+EN) do realnych zasad;
   sprawdź `momentRecorder` (już obejmuje `league` w `lead`), `JoypadController` (`arcadePad.turbo` już istnieje),
   `.arcade-league` w `src/index.css` (już jest).
5. Dodaj testy regresji w `scripts/` (najlepiej nowy `league-selftest.ts` + wpis w `package.json` i `ci.yml`):
   detekcja gola raz i po pełnym przekroczeniu linii, samobój, dogrywka z limitem czasu i uczciwym remisem,
   swept-testy przy boost (bez przenikania przez piłkę/bandę), kolizja dwóch aut naraz, pauza zamrażająca
   czas+AI+fizykę, 3 restarty bez narastania listenerów, `onFinish` jednokrotnie, sprzątanie GPU/audio.
6. Weryfikacja: `npm run typecheck && npm run lint && npm run build && npm run selftest:{arcade,console,relay,platform,replay,v16}`
   + `VITE_BASE=/JoyPad/ npm run build` + ścieżka w przeglądarce: biblioteka → setup → runda → pauza →
   wyniki/Moments → rewanż → biblioteka (1/2/4 graczy, boty, wolne sloty 0 i 3). Playwright tylko w CI.
7. Dopiero po zielonym teście: `wip: false` w `catalog.ts`, zaktualizuj README (`v1.7` → nowy nagłówek wersji),
   `WHATS_NEW_VERSION` + wpis w `src/platform/WhatsNew.tsx`, `docs/platform-update.md`. Nie commitować ZIP-a
   ani stagingu; commit/push tylko na `arena/01a0f36b-joypad` i tylko na prośbę.

## 7. Pułapki, o które łatwo

- `padInputs` to współdzielona tablica podmieniana przy zerowaniu — brak cache'a referencji.
- `preserveDrawingBuffer` **nie** włączać; `onFrame` musi być w tym samym tasku co render, inaczej czarny klip.
- Split-screen: nagranie dopiero po narysowaniu wszystkich viewportów.
- Pauza hosta i `document.hidden` nie mogą dokładać czasu do nagrania ani do zegara rundy.
- Nowe typy wiadomości sieciowych nie są potrzebne: telemetria idzie przez `onMoment`/`onFx`. Protokół został na wersji 1.
- Paleta Obsidian/Ember: pomarańcz = akcja/zaznaczenie; kolory drużyn graczy są semantyczne — nie nadpisywać
  ich brandingu teamami z demo (`#1f6dff`/`#ff7a18` → mapować na `COLORS`/`PLAYER_DEFS`).
- Fonty self-hostowane (Fontsource) — nie dodawać Google Fonts.
- `noUnusedLocals`/`noUnusedParameters` + `strict` w TS: importy z demo, które zostały usunięte, wywalą build.

## 8. Uruchomienie środowiska od zera (jeśli sandbox jest nowy)

```sh
cd /home/user/JoyPad && npm ci
npm run dev -- --host 0.0.0.0 --port 5173     # TV: /  |  pad: /#pad
# testy: patrz §6 punkt 6 (Playwright wymaga Chromium z CI)
```

## R. Dziennik rund (chronologicznie; decyzje, nie kod)

> Ten blok był wcześniej zapisany jako sekcje A–G. Uległ skasowaniu przez niezgrabny zapis
> w trakcie rundy 7 i został **odtworzony w wersji skondensowanej** na podstawie zachowanych
> dokumentów (`docs/plamek.md`, `docs/ui-control.md`, `docs/liquid-glass.md`,
> `docs/console-testing.md`, `docs/platform-update.md`, README). Formułacji „co użytkownik
> odrzucił i dlaczego" nie da się odzyskać słowo w słowo — jeśli wracasz do projektu, czytaj
> go razem z §H i §I, bo one opisują *ostateczne* decyzje.

### Runda 1 (pomysł #1) — „płynne szkło" jako **przydawa**, nie skórkę

Użytkownik: „to ma być warstwa, z której reszta korzysta". Stąd `docs/liquid-glass.md`, tokeny
`--lg-*` i prymitywy w `liquid.css` pisane przez `:where()` (zero specyficzności, aplikacja
nadpisuje jednym selektorem). **Świadomie nietknięte:** HUD `Stalowego Frontu` w `src/App.tsx`
(canvas + `font-mono`, skóra zabija czytelność). Czego warstwa **nie** robi: nie animuje
`width`/`height`/`top`/`left`/`backdrop-filter`, nie zmienia `border-width`, nie daje `0.5`
sekund „dla klimatu".

### Runda 2 (poprawki po pomyśle #1)

- „panel za długi" → blok QR skompresowany do kolumny `auto 1fr`, a przy 4 padach przełącznik
  wchodzi **do tej samej linii** (`lg-qr__chips` + media query na `max-height`) — nie zgadywać
  `min-height` okienka;
- okienko **wyrasta z elementu, który je otworzył** (`windowOrigin.ts`, `transform-origin` +
  `data-*`), fallback na `::backdrop` przy braku wsparcia.

### Runda 3 (pomysł #3) — „STEROWANIE KONTROLEREM"

Pad nawiguje menu telewizora: `spatialNav.ts` (martwa strefa analoga 0.35, próg 0.55,
`delayFirst 420`/`delayNext 190`), `useUiControls` w `uiControl.ts` jako **jedyne** miejsce
interpretacji `A/B/X/Y/Start/Home/L1/R1/lewy triggers` (kolejność: fullscreen → `lean` →
`stepFocus` → `blocked` → `select` → `x`/`y` → `back` → `onCommand`), `focusSurface.ts`
(pojedynczy rejestr obszarów), pełny ekran TV z uzbrajaniem (`tvFullscreen.ts`, bo przeglądarka
puszcza fullscreen tylko z gestu), kategorie opcji. Zakaz: żadne `onKey` w `padHost.ts`/
`gameRuntime.ts`/`engine/input.ts` — pilnuje tego selftest; „jedna nawigacja w projekcie"
(`NAVIGABLE_SELECTOR`) to to samo, co `useFocusLoop` nazywa `NAVIGABLE`.

### Runda 4 (pomysł #4) — Plamek jako maskotka fokusa

Odrzucone po drodze (nie wracać do tych rozwiązań bez nowego powodu):
1. halo pod przyciskiem → **siada na elemencie** (poświata, potem taśma);
2. „lasso zarzucone z góry" → **oblewanie**: farba pojawia się na krawędzi i rozlewa w dół
   (początek nie może być pełnym kształtem z `scale(.3)`);
3. „skok za szybki, żeby go zauważyć" → `flyBaseMs 240 + .55/px`, sufit `560 ms`;
4. „plama wyskakuje nad przycisk i wraca pod" → **jedno miejsce główki: nad przyciskiem**,
   `perchFor`/`landFor`/`gazeBiasFor` (patrzy na etykietę), `roomAbove` liczy światło DO DOŁU
   `<header>` dialogu;
5. „za bardzo sprężynuje" → `springFor` **usunięte na always**: ruch to pościg ze stałą czasową
   (`PLAMEK_SMOOTH`, `edgeTau`), pozycja nigdy nie przekracza celu; „lekko odbija od spodu" to
   fizyka **kształtu** (`squashFrom` `sy = 1/sx`, `WOBBLE`), nie pozycji;
6. buźka: łzy były czytelne jako zamknięte oczy → smutek dostaje **otwarte oczy**;
7. orbita ładowarki w `liquid.css` odpada (selftest zabrania pętli w tej warstwie) → siedzi
   w `console.css`; `data-plamek-orbit` jest atrybutem `<i>`, bo `<svg>` nie ma atrybutu `hidden`.
Dodane z listy „2 i 3 z twoich pomysłów": miernik czekania (`linkProgress`, `PlamekOrbit`
z `role="progressbar"`, bez obiecywania końca) i mina czytająca intencję (`moodFor`/
`dominantGaze` z wektora komendy).

### Runda 5 — okienko a maskotka

Powrót z `<dialog>`: `Plamek.reveal(host)` przywraca maskotkę na ostatni cel; `.plamek.is-reveal`
redukuje 400 ms „doczytywania" (JS i tak przerywa fazę, to tylko wizaż); `focusout` **nie może**
gaszić maskotki (`hideTimer` jest kasowany przy kolejnym `focusin`), bo przy przejściu fokus
technicznie znika na jedną ramkę. Znikanie: `PLAMEK.hideDelayMs 160` + `hopGraceMs 900` na powrót.

### Runda 6 — odrzucona: farba jako **patch**

Dorobione do rundy 4/5: `gooPad`, maska `conic-gradient` na obwódce (zarastanie od góry),
`flowFronts` + czoła strug jako osobne `div`-y, `wrapLagPx` (dół ramki masihł 6 px, żeby nie
przeleciał pod farbą), `rimRadii` (rant faluje), `neckFor` + `.plamek-neck` (szyjka spajająca
kulkę z pierścieniem), `dryIn` (farba schnie pod koniec rozlewu), `gooStrength` jako siła
`backdrop`-u. Recenzja: „kulka nie wnika w pierścień, tylko na nim staje", „to nie rozlew,
a osobne lasso", „jaka kropla?" — czyli dokładniej: **każdy z tych elementów był osobnym
bytem i każdy osobny byt jest widoczny jako osobny byt.** Wnioski w §I.

## H. Runda 6: „bardziej ciekły i rozpływający się" — mokra farba (2026‑10‑01)

> **Uwaga (ta sekcja jest w części nieaktualna):** część jej rozwiązań — maska `conic-gradient`
> na obwódce, `flowFronts`, `wrapLagPx`, `rimRadii`, `neckFor`, `dryIn` — została **zastąpiona**
> w rundzie 7 (§I poniżej), bo recenzenckie „to nadal kulka i lasso" okazało się skutkiem
> struktury, nie liczby. Czytaj ją jako historię decyzji, nie jako stan kodu.
## I. Runda 7: „chcę poczuć, że jest prawdziwym płynnym kleksem, a nie kulką" (2026‑10‑01)

**Diagnoza po odrzuceniu rundy 6.** Użytkownik zobaczył trzy rzeczy: kulka „siada" na pierścieniu
i nie łączy się z nim, otoczka wygląda jak zarzucone lasso, a kropli w ogóle nie widać. To nie
były trzy osobne błędy — to były trzy konsekwencje jednego założenia: **farba była rozłożona na
paręnaście `div`-ów**, z których każdy mógł tylko nachodzić na sąsiada. `border: 3 px` na ramce
nigdy nie będzie wyglądał jak materia, a `mask-image` nie zlewa dwóch elementów w jeden kształt
(łaczy je wyłącznie po alfa w obrębie jednego filtra). Rozwiązanie było więc architektoniczne,
nie regulacyjne: cała farba musiała stać się **jednym wypełnionym, odkształcalnym ciałem**.

**Decyzje.**

| Ruch | Efekt |
| --- | --- |
| Farba = `3 × <path d>` w jednej grupie `.plamek-goo` (kołnierz, resztka na starym kaflu, bulwa) + szyja mostu, 5 ech, 3 bryzgi | nie ma czego zlewać; `feGaussianBlur` + `feColorMatrix` (próg `22 -10`) zamykają szew ścieżki, kroplę i bryzgi w jedno ciało |
| Obrys celu liczony **długością łuku** (`rimPerimeter`/`rimPoint`), `u = 0` nad środkiem górnej krawędzi | dwa fronty farby idą ze stałą prędkością w pikselach; na kaflu 200×200 i na pasku 300×54 te same ¾ czasu to to samo miejsce obwodu. Przy kątach (`τ = u·2π`) struga pędziła przez długie krawędzie — i to było to „lasso" |
| `bandEdges` zwraca **pary krawędzi** (zewn. + wewn.), anizotropia `.35 / 1 / 1.55`, `lobe` (dzwonek Gaussa przy `u = 0`, amplituda `lobeSize` z rozmiaru buźki), `dent` (zapadnięty materiał przy starcie), `wob`/`spin` (fala rantu, wspólna dla obu krawędzi = grubość faluje, ale masa nie znika) | grubość farby to **odległość między krawędziami wypełnienia**, a nie grubość obwódki; główka jest wypukłością tego samego `d` (stąd „wtopiona w obwódkę", a nie „stoi na"), a jej wierzchołek jest liczbokształtny, bo bulwa nie jest osobnym krążkiem |
| `dripTail(box, wrap, thickness)` + `teardropPath` jako **podścieżka kołnierza** | kropla jest widoczna: wisi na dolnym łuku między frontami, pęcznieje do 1.9× grubości farby, ale nigdy ponad ½ wysokości przycisku (dłuższe to nitka), od `.95` wciągana (krótsza = szersza — objętość), a w zwarciu nie ma jej wcale. Dawniej 4 px z rozmiaru główki — stąd „jaka kropla" |
| `blobPath`/`neckPath` dla lotu i mostu (półosie `r·sx`, `r·sy`, `tail` w pikselach, `pinch` zwężający szyję do zera) | pęknięcie mostu jest geometryczne, nie `opacity: 0`; przy `gather` ta sama para krzywych odtwarza przebieg w tył (resztka cienieje, a jej `fill-opacity` = `.55 + .45·appear`) |
| `gooStrength(tension, phase, reduced, drain)` → `stdDeviation = wet · 2.6`, próg histerezy `.02`, **podłoga `.3`** w bezruchu | mżawka rozmycia bez przepinania filtra co ramkę; `.3` jest potrzebne, bo bez rozmycia widać 73 proste segmenty zamiast obrysu |
| region maski na `<filter filterUnits="userSpaceOnUse">` wpisywany co ramkę (`setAttr`), box = żywy box ∪ bulwa ∪ box startu ∪ echa ± `gooPad` (48 px) | płaci się za obszar farby, nie za ekran; grupa nie ma już `width/height: 0` ani `translate3d` kompensującego — `<svg inset: 0>` + `overflow: visible` |

**Pułapki, które kosztowały najwięcej** (każda ma teraz asertę w `UI CONTROL`):

- CSS nadpisuje prezentacyjny atrybut `fill`, więc **kolor farby musi iść atrybutem**, a `fill`
  w regule tylko w reakcjach — inaczej `is-blocked` przestaje cokolwiek znaczyć;
- `.plamek-goo > *` nie może dostawać `background`/`border` — jedyna dopuszczalna kreska to
  `stroke` 1 px (poniżej tego progu alfa z `feColorMatrix` ją zjada);
- `steps` jako opcja `bandEdges` okazało się martwe (gęstość jest liczona z obwodu) i zostało
  usunięte razem z `rimRadii`, `neckFor`, `flowFronts`, `wrapLagPx`, `PLAMEK.wrapLag` —
  **nie przywracać**; `PLAMEK_INFLATE` za to został (ta sama nazwa, inna rola: baza grubości
  taśmy, nie offset `border`-a);
- test kontraktowy sprawdza, że w `d` kołnierza jest **dokładnie jedno `M`** — to strażnik
  przed powrotem do „osobnej kulki";
- `--ball-*` i `--halo-*` zostają: poświata i puls domknięcia są poza maską (próg alfa zjadłby
  `box-shadow` wewnątrz grupy), a twarz jedzie na tłumionym squashu (`--ball-sy =
  1 + (sy − 1) · .45`), więc buźka się nie kręci i nie zmienia w kreskę;
- `.plamek > i, .plamek-face > * { position: absolute }` — po przejściu na SVG łatwo zgubić
  pozycjonowanie dzieci twarzy (oka zostają wflow i maskotka wygląda jak wywrócona).

**Wynik bramek po rundzie 7:** `npm run lint` ✓, `tsc --noEmit` ✓, `selftest:console`
(26 pakietów, w tym LIQUID GLASS na 165 selektorach i UI CONTROL z nowymi asertami kształtów) ✓,
`npm run build` ✓ (CSS 227.30 kB / 42.55 kB gzip — o ~3 kB mniej niż w rundzie 6, bo wycięte
zostały reguły maski i obwódek). Ocena wizualna: **nadal po stronie użytkownika** (nie ma tu
przeglądarki), a sam test geometryczny nie zastąpi wrażenia z kanapy.



## J. Runda 8: „lepiej, ale mało wyraźny i na małych przyciskach za gruby" (2026‑10‑01)

Jeden przegląd, dwie przyczyny i obie były tą samą liczbą traktowaną jako stałą.

| Zarzut | Co faktycznie było nie tak | Co się zmieniło |
| --- | --- | --- |
| „mało wyraźny" | (a) farba = dokładnie akcent kafla, więc na podświetlonym elemencie znikała; (b) próg alfa `22 -10` wycinał wszystko poniżej .45 → smuga (`alpha .30/.22`) i większość mostu istniały w modelu, nie na ekranie; (c) górna anizotropia `.35` dawała na chipie 26 px krawędź grubości pół piksela | `--plamek-paint: color-mix(... 74%, #fff0dd)`; próg `18 -6` (pełna alfa od .5, rampa .33–.5); echa z podłogą `.42` alfy, gaśnięcie **promieniem**, nie kanałem alfa; `aniso.top = .55`, `bottom = 1.4`; `stdDeviation` 2.6 → 2.2 (ostre krawędzie) |
| „na małych przyciskach za gruby" | grubość taśmy była stała (`PLAMEK_INFLATE + 2.5` = 7.5 px) niezależnie od elementu | `paintWeightFor(box, k = .115, 2.8, 9.5)` — skalar, od którego zależy `spread`, kropla i region maski; klamra górna tylko dlatego, że 168‑px kafel nie potrzebuje 19 px farby |
| kontrast bez drugiego elementu | `stroke: #7e2c0247` na dzieciach grupy był liczony co ramkę i zjadany przez maskę (alfa .28 < próg) | keyline w łańcuchu filtra: `feMorphology dilate 1.2` **po** progu alfa + `feFlood`/`feComposite`/`feMerge`; na TV `flood-opacity: .82` z CSS (`flood-*` to właściwość CSS, nie atrybut — bez drugiego filtra i bez ruszania JSX). `stroke-width` w CSS warstwy = błąd, pilnuje tego assert |

Czego **nie** robić w pogoni za wyraźnością: nie przenosić twarzy do środka grupy (próg alfa zjadł
by źrenice), nie dorzucać `filter: drop-shadow()` na `<svg class="plamek-liquid">` (region = cały
viewport → rozmycie ekranu w każdej ramce; keyline liczy się w regionie farby), nie wracać do
`feDropShadow` (SVG 1.2 — bywa nieznany, a nieznany filtr = warstwa bez farby), nie podnosić
`spread` ponad ~1/6 krótszego boku (napis znika).

Bramki po rundzie: `lint` ✓ `typecheck` ✓ 26 pakietów selftestów ✓ `build` ✓ (CSS 227.29 kB /
42.53 kB gzip). Ocena wizualna nadal po stronie użytkownika.

## K. Runda 9: „poprzedni kolor był lepszy" + „na okrągłych przyciskach jest jajowaty" (2026‑10‑01)

**Kolor.** Rozjaśnienie farby (`color-mix` z kremem, żeby kleks nie znikał na podświetlonym
kaflu) był moją diagnozą „mało wyraźny" i użytkownik ją **cofnął**: poprzedni odcień był lepszy.
Wracamy do `--plamek-paint: var(--os-nav-accent, #ff9a52)` — czyli farba to czysty akcent gry,
a wyraźność trzymają dwie rzeczy z rundy 8, które koloru nie ruszają: próg alfa `18 -6` (bez niego
most i smuga w ogóle nie były rysowane) i ciemny keyline liczony `feMorphology` po progu.
Wnioskiem do zapamiętania: przy „mało wyraźny" najpierw sprawdzam *czy element w ogóle jest
rysy* (maska, progi, martwe właściwości w CSS), a dopiero potem czy jest za jasny — zmiana
palety bez pytania to był zły ruch.

**Jajko na okrągłych przyciskach.** Ikony w topbarze (`.os-icon`, 30 × 30, `radius: 15`) nie mają
płaskiej góry, więc `lobe` dokładał materiał dokładnie tam, gdzie rant sam się zaokrągla —
pierścień + garb = jajo — a buźka siedziała pod spodem, bo dla elementów przy górnej krawędzi
ekranu `perchFor` i tak zrzuca główkę pod przycisk (słusznie, to użytkownik potwierdził:
„ta buźka może być na dole, bo pasuje"). Dwie poprawki w modelu, obie z asertami:

| Funkcja | Rola |
| --- | --- |
| `crownFor(box)` → `0…1` | czy w ogóle jest płaski odcinek rantu, na którym garb ma sens (`width / height`, klamra `.55 → 1`). Na kole = 0, więc `lobe` jest zerowane, a główkę trzyma **krążek** (`blobPath` z alfa `restDisc = 1 - crown`) zlany z pierścienia przez ten sam `<filter>` — nadal jedna bryła, tylko bez zgrubienia u góry |
| `lobeAtFor(side)` → `0` lub `.5` | garb jedzie **za główką**: `bandEdges` liczy `bell` od `u = lobeAt`, więc gdy `perchFor` przesiada główkę pod przycisk, materiał rośnie pod dolnym łukiem, a nie nad górnym |

Skutki uboczne, które trzeba znać: przy `lobeAt = .5` **kropli nie ma** (`tail = reduced || lobeAt > 0 ? null : …`) —
łza wisząca z dolnego łuku kolidowałaby z główką, która właśnie tam siedzi, a grawitacja nie ma
już co ciągnąć; na kole `restDisc` podbija promień krążka o 6%, żeby przy `crown ≈ 0` nie wyszła
łysinka między pierścieniem a buźką. Zamknięta taśma startuje i kończy się na `u = -.5 / +.5`,
czyli przy `lobeAt = .5` szew wypada na szczycie garbu — pierwszy i ostatni punkt są identyczne,
więc `ribbonPath` zszywa go bez czapy i czubek pozostaje gładki.

Bramki: `lint` ✓ `typecheck` ✓ 26 pakietów selftestów ✓ `build` ✓. Ocena wizualna — nadal
u użytkownika; to już dziewiąty przegląd tej maskotki i wszystkie poprzednie rozstrzygnięcia
są w §H–§K, nie w kodzie.

## L. Runda 10: „sterowanie w menu każdej gry, z Plamkiem na nich" (2026‑10‑01)

Prośba użytkownika (wolna forma): menu każdej gry — ustawienia, wyniki, okienka nad rozgrywką —
mają być wybieralne pilotem i klawiaturą, z Plamkiem na elementach; runda pozostaje przy padzie.

**Co było nie tak.** Menu gier miały własne, okrojone mapowania i żadne z nich nie wiedziało o
maskotce: `ArcadeGameView` przesuwał `stepPrimary`/`stepSecondary` (czyli dwie pierwsze opcje,
reszta ekranu dla pada nieistniejąca) plus `navigateResults` na wynikach, `App.tsx` miał do tego
własny `keydown`, a `GameSetup` tylko stopkę z podpowiedzią. Trzy prywatne nawigacje obok jednej
systemowej = ekran, na którym pilot robi *coś*, ale nie to samo co w bibliotece, i Plamek, który
znika w wejściu do menu.

**Decyzje, w kolejności ważności:**

1. Bramka jest jedna i wisi nad wszystkim:
   `uiOwnsInput = booted && !state.room.dimmed && (!selected || state.screen !== 'game')`
   w `JoypadApp`; napędza i `useUiControls({ enabled })`, i `{uiOwnsInput && <Plamek />}`.
   Stan ekranu zgłasza sama gra (`padHost.setScreen(stage)`, `menu | setup | game | over`).
   Reguła na przyszłość: *ekran, na którym można coś wybrać, jest interfejsem, nawet gdy siedzi w
   oknie gry* — jedyny stan, w którym pilot musi uciekać do gry, to trwająca runda.
2. Nowa kind pozycji regulowalnej: `data-ui-stepper` w `focusSurface.adjustable` →
   `stepStepper(el, delta)` wysyła `CustomEvent('ui-step', { delta })`, a widżep słucha i przesuwa
   wartość. `uiControl.stepFocus`: `←/→` na stepperze = krok wartości, `↑/↓` = wyjście z rzędu,
   `select` = krok o jeden (tak robi natywna `<select>`). Alternatywa („najedź na strzałkę, potem
   na wartość, potem Enter") była karą za brak fokusa na samej wartości.
3. Menu gier są powierzchniami nawigacji: `data-ui-scope` (`game-menu`, `game-results`,
   `tank-setup`) + `data-ui-focus` + `focusUiScope(root)` przy montowaniu, z warunkiem „odpuść,
   jeśli fokus już siedzi w tym korzeniu albo w otwartym `dialog`u". Bez wejścia pierwszy krok
   nie miałby czego przenieść — fokus na `body` to brak punktu startu.
4. fokus prowadzi podpis: karty trybów w czołgach `onFocus={() => setMenuChoice(index)}`. Tam,
   gdzie interfejs pokazuje „wybrane", stan ma iść za fokusem, inaczej napis na dużym przycisku
   rozjeżdża się ze wskazaniem.
5. Klawiaturę telewizora obsługuje wyłącznie silnik (`capture: true` + `stopPropagation` —
   wygrywa z nasłuchem w oknie gry, który liczy w fazie bąbelkowania). Własne `keydown` z
   `ArcadeGameView` i `App.tsx` wycięte. Z `handleCommand` zostały rzeczy, których silnik nie
   robi: `home`, `back` (pauza w rundzie / wyjście z okna / powrót z wyników), `pause`, oraz
   **zatwierdzenie w pustkę**: `select` odpala to, co sugeruje duży napis, ale tylko gdy fokus
   stoi na `body` albo na tekście — bo `onSelect` zwraca `false` wyłącznie dla pozycji
   nie jest dublowanie ruchu, tylko awaryjne wejście i trzeba je zachować. Przy okazji wróciły dwa zachowania, które łatwo zgubić przy takiej chirurgii:
   `restart` na ekranie wyników (start nowej partii) i `back` z wyników — w czołgach do
   konfiguracji, nie do menu. Steppery zmieniły właściciela ruchów, przyciski „wyjdź" nie.
6. `resultsNavigation.ts` poszedł z kodem razem z paczką RESULTS NAVIGATION w
   `selftest:platform` (5 → 4 paczki). Ruch po wynikach bierze nawigacja przestrzenna: grupy,
   krawędź wiodąca, momenty i propozycje ekipy — plus maskotka, której płaska lista nie miała
   o czym poinformować.
7. i18n: `setup.mainOption`/`setup.secondOption` → `setup.navMove`/`setup.navConfirm`. Stopka
   nie może obiecywać „strzałki zmieniają główną opcję", kiedy strzałki robią całą nawigację;
   `setup.keyboardHelp` opisuje teraz prawdziwy kontrakt (regulowane pozycje przyjmują `←/→`).

**Nie ruszaliśmy:** HUD Stalowego Frontu (poza bramką i `onFocus` kart), `PauseSheet` (miał swój
zakres `sheet` od początku — pauza nad grą chodziła padem już wcześniej), `showPads`/`showHelp`
nad rozgrywką (to nie jest `dialog`, więc pilot zostaje przy grze — tak jak było), samo sterowanie
w grach.

**Lekcje do przeniesienia:**
- Jeśli nawigacje są dwie (silnik interfejsu i skrót w oknie gry), wygrywa ta z `capture`, a
  użytkownik widzi efekt uboczny: fokus skasowany w połowie ruchu. Nowa powierzchnia = atrybuty i
  `focusUiScope`, nigdy kolejny `addEventListener`.
- Bramka „kto rządzi" musi obejmować też to, co widać. Montowanie maskotki pod inną flagą niż
  silnik daje stan, w którym farba wskazuje cel, którego pilot nie rusza (albo ruch bez farby).
- Wartość regulowana pod pada jest sterowaniem, nie tekstem — dlatego osobna kind (`stepper`) i
  zdarzenie (`ui-step`), a nie kolejna pętla warunków w `handleCommand` gry.

## M. Runda 11: „Wróć do biblioteki" z pauzy odpauzowywało grę (2026‑10‑01)

Zgłoszenie: admin pauzuje grę, klika „Wróć do biblioteki", gra wznawia rundę zamiast wyjść.
Żądanie: wyjście ma działać zawsze, niezależnie od stanu pauzy + przegląd podobnych dziur.

**Co naprawdę było nie tak (trzy nakładające się przyczyny, nie jedna):**

1. `PauseSheet` oddaje `onClose` okienka jako `onResume`. Każde więc zamknięcie — X, klik w tło,
   `Esc`, `back` z pada, `home` z telefonu przełożony na `joypad-dialog-command` — **jest
   wznowieniem gry**. Przy potwierdzeniu wyjścia panel podmienia przyciski w DOM-ie, aktywny
   element znika i fokus spada na `body`; następne `A`/`Enter` w `uiControl` nie miało na czym
   kliknąć, więc komenda `select` poszła do gry, a tam: `current === 'game'` → `togglePause()`.
   Czyli: „wychodzę" → odpauzowane. To jest główny winowajca i to on sprawia, że objaw wygląda
   na losowy.
2. `useCurtain.begin()` zaczynał od `if (busy.current) return;` — żądanie zmiany ekranu
   przytrafione w trakcie innej przejściówki znikało bez śladu (wyjście w rewanżu, wejście w grę
   z klawiatury). Ścieżka `startViewTransition` miała ten sam defekt w drugą stronę: `swap()`
   był wołany wyłącznie z wewnątrz callbacku przeglądarki, więc odrzucone przejście (karta w tle,
   WebKit bez API) zostawiało stary ekran na zawsze.
3. Silniki gier słuchały `keydown` na `window` bezwarunkowo: `Esc`/`P` przełączało pauzę **nawet
   gdy nad areną stał modal** (okienko pauzy broni się `stopPropagation` w drie Reacta, ale
   fokus poza tym drzewem — i klawiatura telefonu w polu tekstowym — już nie), a `preventDefault`
   na strzałkach i spacji kradł klawisze okienku, zanim zapadła jakakolwiek decyzja.

**Decyzje:**

- Intencja wyjścia trafiła do liścia `src/lib/exitWish.ts` (`wishToLeave` / `isLeaving` /
  `clearLeaveWish`), a nie do `useRef`: `react-hooks/immutability` (kompilator Reacta w lintie)
  nie pozwala pisać refa użytego w efekcie z handlera kliknięcia, a `useState` dołożyłby
  re-render w kadr kurtyny. Lektura na przyszłość: **gdy lint mówi „This value cannot be
  modified" przy fladze sterującej zdarzeniami, to jest podpowiedź architektury** — taka flaga
  należy do modułu, nie do drzewa renderu.
- Bramka stoi po obu stronach: `PauseSheet.onClose` (veto po `wishToLeave`, a z panelu
  potwierdzenia „wstecz" cofa jeden krok zamiast wracać do gry) i `handleCommand`/`handleRemote`
  gier (`back`, `pause`, `select`, `restart`, `padHost.onPauseRequest`, `onResume` w HUD) — żadne
  z nich nie rusza pauzy ani nie startuje rundy, gdy wyjście jest w drodze.
- `clearLeaveWish()` woła montaż widoku gry i start rundy. Bez tego wyjście z poprzedniego
  podejścia blokowało START w następnym (realny scenariusz: wyjść → wejść → grać).
- `useCurtain.begin()`: `swap()` jest gwarantowany. Busy → podmiana natychmiast, bez animacji;
  `startViewTransition` → `run()` idempotentne (`swapped`) + `finally(run)`; brak API albo
  odrzucone przejście → kurtyna CSS i tak robi swoją robotę.
- Nowy `src/lib/inputOwnership.ts` z `uiOwnsKeyboard(e)`: modal otwarty LUB wpis w
  `input/textarea/select/contenteditable`. Pięć silników (`arcade/runtime.ts`,
  `arcade/webgl/runtime3d.ts`, `starclash`, `neon`, `game/engine.ts`) sprawdza to **przed**
  `preventDefault`. Wybór liścia zamiast kopiowania warunku: to jest kontrakt, a kontrakt copy‑paste
  rozjeżdża się w ciągu dwóch tur.
- Plamek: `select` przy fokusie, który wypadł z modala → `focusUiScope(modal)` + `blocked` (trafienie
  w ścianę, nie cisza), a zmiana wartości (suwak, lista, stepper) → `poke` zamiast `select`:
  kłanianie się co 130 ms przy trzymaniu strzałki wygląda jak confetti.
- Bonus z tej samej rodziny: po powrocie z gry biblioteka wskazuje fokus na kafelkę, z której
  wyszedłeś, więc maskotka ma na czym stać i pierwsza strzałka nie startuje od środka ekranu.

**Czego NIE naprawiałem, bo nie jest zepsute:** `visibilitychange` w `runtime.ts` i
`NeonRushScene` (`!paused` przed pauzą — dawne podejrzenie „toggle w tle" okazało się błędem lektury),
`previous?.focus()` w `Sheet` (oddaje fokus temu, kto otworzył okienko ✓), HUD czołgów
(poza zakresem — styl jest zamrożony).

**Bramka:** lint czysty, `tsc` 0 błędów, `selftest:console` 12 (UI CONTROL z nową sekcją
wyjścia), `selftest:arcade` 7 (nowa paczka KEYBOARD OWNERSHIP), platform 4, build OK.
Zdjęć nie robiłem — ocena wizualna dalej należy do użytkownika.

## N. Runda 12: anty‑spam propozycji gier (2026‑10‑01)

**Pomysł użytkownika:** „dodaj zabezpieczenie przed spamem propozycji gier od graczy (limit
czasowy/ilościowy na gracza, blokada duplikatów, cooldown, ewentualnie wyciszenie gracza przez
admina)". Cztery mechanizmy są w wersji pełnej, wyciszenie także — okazało się jedynym sposobem,
żeby wieczór nie kończył się kopaniem kogoś z pokoju.

**Stan przed turą:** `case 'suggest'` w `src/net/padHost.ts` był całym ciągiem produkcyjnym.
Sprawdzał trzy rzeczy (pokój pozwala, ekran to biblioteka albo wyniki, tytuł istnieje i to nie ta
gra, która stoi), a potem ustawiał `p.suggestedGame` i rozgłaszał sesję. Bez limitu, bez duplikatu,
bez żadnej kłódki — telefon mógł przestawiać lobby co 16 ms, a każda zmiana to broadcast do
wszystkich padów i nowa pigułka na telewizorze.

**Liczby (jedno źródło: `src/net/antiSpam.ts`, czysty moduł bez DOM i bez sieci):**

| Mechanizm | Wartość | Co znaczy |
| --- | --- | --- |
| `cooldownMs` | 8 000 | jedna *przyjęta* propozycja na osiem sekund |
| `duplicateMs` | 180 000 | ta sama gra wraca do puli po trzech minutach |
| `windowMs` / `maxPerWindow` | 60 000 / 5 | sufit ilościowy w oknie przesuwnym |
| `strikeWindowMs` / `strikeLimit` | 30 000 / 4 | cztery odbicia pod rząd = upór, nie pomyłka |
| `autoMuteMs` | 90 000 | po uporze telewizor wycisza gracza sam |
| `replyGapMs` | 1 500 | z tym samym tempem telefon może co najwyżej raz usłyszeć „nie” |

**Decyzje, których nie widać w kodzie, a trzeba je znać, żeby ich nie „poprawić”:**

* Autorytetem jest telewizor. Telefon nie liczy niczego lokalnie (własne timery na mobile nie są
  wiarygodne), tylko dostaje `{t:'suggestAck'}` z werdyktem i liczbą sekund. Starą wersję protokołu
  to nie psuje: `{t:'suggest'}` wygląda identycznie, a `suggestAck` i `roster[].muted` są opcjonalne,
  więc `PROTOCOL_VERSION` nadal 1.
* **Wycofanie głosu nigdy nie jest blokowane** (`game: null` przechodzi zawsze). Zablokowane
  wycofanie oznacza głos, który wisi na ekranie, a jego właściciel nie może go zdjąć — to byłoby
  gorsze niż spam.
* Odrzucona propozycja **nie zjada limitu** i **nie rozgłasza sesji**. To druga połowa zabezpieczenia:
  bez niej obrona przed spamem sama stawałaby się spamem (broadcast na każde odbicie).
* Kłódka dotyczy *nowych* propozycji. Oddanego głosu auto‑wyciszenie nie kasuje (grał czysto, zanim zaczął się upierać); kłódka od admina kasuje, bo ona znaczy „nie chcę już tu twojego głosu”.
* Wyciszenie przeżywa reconnect (60 s, te same okno i ten sam `pid` co dla odzyskania slotu), a
  `kick` — nie. Po kopnięciu wraca czysta karta; wyciszenie to narzędzie na wieczór, nie ban.
* `clearIntent()` (start rundy, zmiana gry) czyści głosy, ale **nie czyści liczników**; wyłączenie i
  włączenie głosowania w panelu pokoju czyści jedno i drugie. Bez tej asymetrii każda runda dawałaby
  nowy limit w prezencie.

**Ślad w kodzie:** licznik siedzi w `PadInfo.suggest` (na pada, nie globalnie — w pokoju cztery osoby
mogą głosować równolegle i nie powinny sobie przeszkadzać), `PadInfo.muted` to stan widoczny w
`session().roster[].muted`, więc pad dowiaduje się o kłódce przy okazji zwykłego odświeżenia sesji.
`RoomAction` zyskał `{kind:'muted', slot, value}` (obok `kick`/`transfer`, z tym samym
sprawdzeniem slotu), a `isPadMessage` — bramkę pola `game` (`null` albo string; numerek odpada).

**UI:** w `GameSuggestions` (`src/platform/PlayerLounge.tsx`) nie przybyło żadnej linii — komunikat
o odmowie **zajmuje** to samo `<p>`, w którym była podpowiedź, więc blok jest dokładnie tej samej
wysokości. Licznik sekund tyka w efekcie, nie w renderze (`react-hooks/purity` nie pozwala na
`Date.now()` w ciele komponentu), a telefon mrugnie wibracją `[18, 26, 18]`, gdy odmowa przychodzi.
W `RoomControls` wiersz załogi dostał trzeci przycisk (mikrofon), ten sam rząd ikon i ten sam styl
co korona/„odłącz” — bez potwierdzenia, bo kłódka jest odwracalna jednym kliknięciem.

**Automaty:** nowy pakiet `ANTI-SPAM` w `selftest:platform` (platforma: 4 → 5 pakietów) — czyste
liczby plus prawdziwy `PadHost` z podszytym zegarem (cooldown, duplikat, sufit, eskalacja, kłódka
admina, reconnect, bramka protokołu, reset urazy przy przełączaniu głosowania). Paczka SAFETY w
`selftest:arcade` miała dawny wpis „zmiana zdania w tym samym sekundowniku wygrywa” — świadomie
zastąpiony przez „utrzymany zostaje pierwszy głos”. Uwaga na pułapkę: zegar w teście podszywamy od
`realNow()`, bo administrator wybierany jest ze starszeństwa połączenia i skok do 1970 roku oddałby
władzę najnowszemu pada.

**Do oka (nie do automatu):** na telefonie — pięć kliknięć w jednym tempie: pierwsze wchodzi, a
czwarte odbicie powinno już założyć kłódkę (czerwony mikrofon w załodze, jedna pigułka na TV), przy
czym sam telefon dalej gra; na telewizorze — czy odmucenie wraca do normalności w tym samym oknie i
czy start rundy nie zeruje limitu.

## O. Runda 13: wygładzenie Plamka (2026‑10‑01)

**Zgłoszenie:** „ulepszysz może Plamka? Wydaje mi się trochę spikselowany i niewyraźny”.
Zakres: jakość krawędzi, bez zmiany koloru, geometrii i zachowania maskotki.

**Kod:** `PLAMEK_WET`, `wetBlur`, `edgeAaFor`, `rimSwellFor`, `alphaMatrix` i `maskMatrix`
w `src/console/plamek.ts`; łańcuch filtra w `Plamek.tsx`, wskazówka `geometricPrecision`
w `liquid.css`. Zachowany próg `18α − 6` i rozmycie `2.2 × wet`. Po progu dochodzi
wygładzanie σ `.4 / (DPR × skala okienka)`; twarz pozostaje poza filtrem. Skala pochodzi
z istniejącego pomiaru. Obwódka używa rozmycia zależnego od grubości farby (σ 1.4…2.4)
i maski `6α − 1` zamiast prostokątnego jądra `feMorphology`. `setAttr` pomija niezmienione
wartości; ograniczony ruch nadal wyłącza cały filtr.

**Odrzucona przymiarka w tej rundzie:** łagodniejsza rampa `9α − 3` i mocniejsze rozmycie
przed nią. Samo zachowanie progu odcięcia 1/3 nie zachowuje wyglądu: zmienia się środek
przejścia i krycie smugi o alfa `.42` (1 → .78). Wygładzanie po dotychczasowym progu
pozwala uniknąć tej zmiany. Nie ma gwarancji identycznego zasięgu skrajnych pikseli.

**Automaty:** `selftest:console` sprawdza kolejność filtra, macierze, krycie smugi,
przeliczenie DPR 1…4 i skali .2…2, odporność na nieprawidłowe DPR, rosnącą/ograniczoną
obwódkę oraz zapas regionu. Stary asert SVG 1.1 sprawdza teraz prawdziwe elementy,
a nie słowo `feMorphology` w komentarzu.

**Do oceny wzrokowej:** małe ikony, kafle biblioteki, lot i otwieranie okienek; kolor
ma pozostać ten sam, oczy ostre, a most i smuga widoczne. Próba uruchomienia testu
przeglądarkowego została zablokowana pobraniem Chromium (`ECONNRESET` z CDN).
Wygląd na urządzeniu użytkownika i koszt na TV pozostają niezweryfikowane. Ograniczony
region filtra pozostaje, ale dodatkowe wygładzanie nie jest darmowe.

**Bramka po zmianach:** lint i typy bez błędów; console 12, platform 5, arcade 7,
replay/v16/relay po 1 — 27 pakietów OK. Produkcyjny build 8.41 s; podgląd na 5173
odpowiada HTTP 200 dla strony i trzech zmienionych modułów. Bez commita i pusha.

## P. Runda 14: film „Poznaj JoyPad" + pytanie na starcie (2026‑10‑01)

Użytkownik: „ANIMACJA 3D W STYLU PREMIUM STARTUP (reklama + tutorial)" — ma pokazać prawdziwą
prezentację JoyPada (QR, telefon‑kontroler, wspólny ekran, gry, split screen, Momenty), działać
jako reklama i poradnik, pytać przy pierwszym wejściu („Tak" → film z możliwością pominięcia
i powtórki z ustawień; „Nie" → ostrzeżenie z możliwością zmiany zdania), być **edytowalnym,
danymi sterowanym systemem scen** z instrukcją dopisywania scen, mieć wersję lekką/statyczną dla
słabych urządzeń, a w kadrze — kontroler wpadający w ekran telefonu i Plamka.

**Decyzje, które trzeba znać, wracając:**

- **Dane, nie kod.** `src/cinema/script.ts` = sceny, napisy PL/EN, `cues` (czasy wejść), `camera`,
  `sound`, `poster`. `timeline.ts` to czysty silnik (`resolveFrame(timeline, ms)`), więc film da się
  przewijać, testować bez przeglądarki i renderować offline. Przepis na scenę: `src/cinema/README.md`,
  pełny opis: `docs/cinema.md`.
- **Jedna gramatyka typografii**: `label` + `title` + `sub` + maks. 3 hasła; wyśrodkowane tylko
  pierwsza i ostatnia scena, reszta w dolnej lewej. Rytm ma być stały, nie „każda scena inaczej".
- **Stan końcowy w regule, stan początkowy w `@keyframes { from }`.** Dlatego wersja statyczna
  (`data-tier="static"`, m.in. ograniczony ruch) wyłącza animacje i nadal pokazuje pełną kompozycję.
- **Wersje awaryjne**: `high` → `lite` (bez wideo, bez lotu kontrolera) → `static` (storyboard).
  `qualityTier()` wybiera na starcie, a film schodzi niżej sam, gdy średnia klatki > 34 ms.
- **Prawdziwe dane w kadrze**: QR to kod prawdziwego pokoju (albo zaproszenie `…/#pad`), a gdy
  telefon naprawdę dołączy podczas sceny parowania, widać jego nazwę i kolor motywu.
- **Kontroler w ekranie telefonu**: kontroler leci i *znika* w szkle; Plamek rozbryzguje się
  w punkcie uderzenia i wraca na przycisk A — ta sama ścieżka, próg alfy i keyline co w interfejsie.
- **Dźwięk** jest syntezowany (`score.ts`), zero plików audio; cisza w ustawieniach = cisza w filmie.
- **Plamek w filmie nie zmienia koloru na jaśniejszy** — obowiązuje zasada z rundy 9.

**Czego nie sprawdzono:** film nie był obejrzany (brak Chromium w sandboxie, `ECONNRESET`
z CDN Playwrighta). Sprawdzone maszynowo: `selftest:cinema` (kontrakt skryptu) i
`selftest:cinema-render` (860 renderów: brak NaN w geometrii, podpisy scen, język, tryby awaryjne).

**Bramka po zmianach:** lint i typy bez błędów; cinema 9 + cinema‑render 1 + console 12 +
platform 5 + arcade 7 + replay/v16/relay po 1 — **37 pakietów OK**. Produkcyjny build 8.03 s
(z filmem w osobnym chunku: 46 kB / 15 kB gzip). Podgląd na 5173 odpowiada HTTP 200 dla strony
i trzynastu nowych/zmienionych modułów. Bez commita i pusha.

## Ścieżka powrotu do pracy

1. `git status` + `git diff` — sprawdź, na czym stanąłeś;
2. `npm ci` (sandbox startuje bez `node_modules`) i `npm run dev -- --host 0.0.0.0 --port 5173`
   — preview użytkownika działa tylko pod 5173;
3. **bramka przed odpowiedzią:** `npm run verify` (lint + typecheck + `selftest:all` + build),
   a po buildzie z `VITE_BASE` jeszcze `JOYPAD_PREVIEW_DIR=dist npm run selftest:preview`;
4. nie commituj i nie pushuj, jeśli użytkownik o to nie poprosił; ZIP-y i staging nie lądują
   w commitach; pracujesz wyłącznie na gałęzi sesji (obecnie `arena/95e6edaf-joypad`).
5. `docs/console-testing.md` — testy konsolowe i lista review-checków do samodzielnego klikania;
   `docs/game-building-prompts.md` §2 i `docs/imported-games.md` — procedura wciągania paczki ZIP
   (na jej podstawie zintegrowano `nitro-league.zip`, patrz §4 i §5 tego dokumentu).

Nie jest to dokument, który trzeba czytać w całości: §4 i §5 wystarczą, żeby wiedzieć, co
już zostało rozstrzygnięte, i nie podejmować tych decyzji raz jeszcze.

## Ostatnia bramka przed wysłaniem zmiany do użytkownika

- [ ] `npm run lint && npm run typecheck && npm run build` na zero;
- [ ] `npm run --silent selftest:all` — jedenaście skryptów, 54 sekcje na OK (w tym ANTY-SPAM z tury 12, raster maski z tury 13, film z tury 14, `RAIL SELFTEST` z rundy 20 i `GAME HUD SELFTEST` z rundy 21);
- [ ] patrz sekcja „Samodzielny przegląd" w `docs/console-testing.md` — kliknij okienka i `Esc`
      z fokusem na ikonie pomocy, przejdź listę gier strzałkami; na telefonie dołącz pada
      i sprawdź pozycje `0/0` przy odświeżaniu kodu;
- [ ] nic nie jest commitowane/pushnięte bez pytania (patrz reguły w `docs/game-building-prompts.md`).

## Stan po wydaniu v1.8 (2026-10-21, gałąź `arena/fbae352d-joypad`)

Ta gałąź = pełna zawartość `arena/01a0f36b-joypad` (rundy 15–19, WEBZA, Turbo League) plus porządki:

| Co | Gdzie | Dlaczego |
|---|---|---|
| Wersja **1.8.0** w jednym miejscu | `src/platform/whatsNewState.ts` (`WHATS_NEW_VERSION`, `APP_VERSION_SHORT`) | numer był wpisany ręcznie w stopce biblioteki, w „Co nowego?", w napisie końcowym filmu i w `package.json` — rozjeżdżał się przy każdym wydaniu |
| „Co nowego?" opisuje v1.8 | `src/platform/WhatsNew.tsx` | lista wymieniała tylko zakres v1.7, choć w bibliotece są już Turbo League i WEBZA |
| `<html lang>` idzie za językiem gracza | `applyDocumentLanguage` w `src/platform/i18n.ts`, wołane z `main.tsx`, `setLanguage` i `useLanguage` | `index.html` jest zawsze `lang="pl"`; przy EN czytnik ekranu i tłumaczenie przeglądarki czytały angielski tekst polską wymową |
| Bramka spójności PL/EN | sekcja **LANGUAGE** w `scripts/platform-selftest.ts` (+ `MESSAGES` z `i18n.ts`) | brakujący klucz w EN odpada po cichu na polski napis (`messages[lang][key] ?? messages.pl[key]`) — 674 kluczy, parametry `{name}`, puste wartości |
| Pełny ekran TV próbuje także z pada | `toggleTvFullscreen` w `src/console/tvFullscreen.ts` | kod od razu uzbrajał ekran, choć komentarz obiecywał próbę; część przeglądarek wpuszcza bez gestu, a odmowa i tak kończy się `armed` + powiadomieniem |
| Podgląd/CI znają `VITE_BASE` | `scripts/preview-server.mjs`, `preview-smoke.mjs` (`JOYPAD_PREVIEW_DIR`, `JOYPAD_BOOT_DIR`), `preview-check.mjs` | smoke produkcyjnego bundla nie dał się uruchomić na buildzie z Pages (`/JoyPad/assets/…`), a serwer podglądu meldował „BRAKI" dla poprawnego artefaktu |
| Bramki w CI i deployu | `.github/workflows/ci.yml`, `deploy.yml` | `cinema`, `cinema-render`, `league`, `pizza`, `ui` nie były wołane nigdzie; deploy nie robił typechecku i publikował bez sprawdzenia artefaktu |
| `npm run selftest:all` / `npm run verify` | `package.json` | jeden polecenie zamiast jedenastu; `verify` = dokładnie to, co woła CI |
| Test Playwright bierze numer wersji ze źródła | `tests/moments.spec.ts` | literal `'1.7.0'` sprawiłby, że po bumpie ogłoszenie startowe otwiera się w środku scenariusza Moments |
| README i dokumenty zgodne z katalogiem | `README.md`, `docs/platform-update.md`, `docs/console-testing.md`, `docs/game-building-prompts.md` | README nadal twierdził, że dostępne są **cztery** gry i że Turbo League to zapowiedź; zdanie „ZIP-y są ignorowane przez Git" było nieprawdziwe (dwa ZIP-y są śledzone) |

ZIP-y w korzeniu (`nitro-league.zip`, `orbitalna-fala.zip`) zostają śledzone jako materiał
źródłowy zintegrowanych silników; nowo otrzymanych paczek nie commitujemy (`.gitignore` ma `*.zip`).
Testy wideo Playwright nadal działają tylko w CI — sandbox agenta nie pobiera Chromium.

## Stan po przeglądzie błędów i wyglądu (2026-10-21, runda 20, gałąź `arena/95e6edaf-joypad`)

Prośba brzmiała: *„spójrz na projekt, napraw błędy i ulepsz wygląd”*. Zmiany są celowo
małe, mieszczą się w istniejącym języku projektu (Obsidian/Ember, warstwa szkła, Plamek)
i każda ma swoją bramkę — bez nowej grafiki, tylko usunięte rozjazdy między warstwami.

| Co | Gdzie | Dlaczego |
|---|---|---|
| Półka z grami bez rzędów-sierot | `src/console/libraryRail.ts`, `ConsoleLibrary.tsx`, `viewport.css` (`--tile-columns`, `data-rows`) | CSS miał stałe cztery kolumny, a grywalnych światów jest sześć: drugi rząd dostawał dwa kafelki i wyglądał na urwany, a biblioteka przestawała być jednym ekranem |
| Jeden rząd = wyższe okładki | `viewport.css` (`.os-game-rail[data-rows="1"] .os-game-tile`) | na telewizorze i szerokim monitorze półka zajmowała pół ekranu, a pod nią zostawała pustka |
| Bezpieczne marginesy iOS przestały być atrapą | `index.html` (`viewport-fit=cover` + metadane PWA), `pad/Joystick.tsx`, `pad/JoypadController.tsx`, `pad/PadApp.tsx`, `viewport.css` (`.os-hint-phone`) | bez `viewport-fit=cover` każde `env(safe-area-inset-*)` wynosi zero, więc kilkanaście użyć marginesów nic nie robiło; w poziomie wycięcie jest **z boku**, a pady odsuwały się tylko od góry i dołu |
| Znak startowy, zanim React przejmie `#root` | `index.html` (`.boot-mark` + inline `color-scheme`), `scripts/preview-smoke.mjs` | pobranie i uruchomienie JS-a na telewizorze to kilka sekund pustej czerni; harness podglądu czeka teraz na drzewo Reacta, a nie na placeholder (inaczej pierwszy krok testu przechodził zawsze) |
| Jedno tło systemu | `src/index.css`, `src/main.tsx`, `src/App.tsx` | `#0a0a0b` obok paletowego `--os-bg: #09090b` dawało widoczny szew między warstwami |
| Suwaki z palety, także w Firefoksie | `src/index.css` (`scrollbar-width` / `scrollbar-color`) | Firefox nie zna `::-webkit-scrollbar`, więc listy dostawały suwak systemowy |
| Kolor poza paletą i martwa reguła | `src/console/console.css` | `#b2c397` na diodzie połączeń (nadpisany i tak przez blok Obsidian/Ember) oraz `@media(min-width:1700px)` dla wysokości kafelka, która nigdy nie działała — `viewport.css` jest ładowany później i ma ostatnie słowo |
| Bramki: `RAIL SELFTEST` i kontrakt HTML-a | `scripts/console-selftest.ts` | tabela 2–24 gier × cztery sufity kolumn (podział bez reszty wygrywa, rzędów jest minimum, ostatni rząd nie zostaje sam) + sprawdzenie, że `index.html` i pad trzymają bezpieczne marginesy |

Numer wydania zostaje **1.8.0**: to poprawki w obrębie wydania, a panel „Co nowego?”
opisuje zakres v1.8 (bump bez nowej listy pokazałby tę samą treść z innym numerem).

## Stan po unifikacji gier i nagraniach botów (2026-10-21, runda 21, gałąź `arena/95e6edaf-joypad`)

Prośba brzmiała: *„nagraj rozgrywkę botów dla każdej gry, której jeszcze jej brak, i zrób mocną
aktualizację, która poprawi każdą grę z osobna i zepnie wszystkie z powłoką konsoli"*. Odpowiedź jest
w dwóch warstwach: **wspólna oprawa rundy** (jedno źródło znaczników, kolorów i krojów dla HUD-ów
DOM-owych i płóciennych) oraz **tożsamość gry** (akcent z katalogu barwi tło areny, klawisze i poświatę
okładki). Symulacje gier nie były ruszane — sandbox agenta nie ma przeglądarki, więc zmiana fizyki
byłaby zmianą w ciemno; wszystko, co tu jest, da się sprawdzić bramkami.

| Co | Gdzie | Dlaczego |
|---|---|---|
| Wspólna obudowa rundy | `src/console/RoundChrome.tsx` + `src/console/gamehud.css` | Stalowy Front miał własny HUD z `index.css` (cztery kopiowane klocki: pasek, karty, nakładki, klawisze), a gry arcade drugi — ta sama runda wyglądała inaczej zależnie od tytułu |
| Ekrany rundy złożone z komponentów | `src/App.tsx`, `src/arcade/ArcadeGameView.tsx` | oba ekrany czytają teraz te same klocki; brama w `selftest:arcade` pilnuje, żeby klasy `arcade-*` nie wróciły do znaczników gier |
| Zestaw HUD dla płótna | `src/arcade/hudKit.ts` (`HUD`, `hudFont`, `drawWorldLabel`, `drawArenaWatermark`) | silniki rysowały napisy po swojemu (`bold 12px monospace`, `sans-serif`, `#80a0bd`, `#6e8aaa`, `#f5d5a1`) — arena nie pasowała do reszty konsoli, choć HUD DOM-owy już tak |
| Płótno mówi kolorem systemu | `engine.ts`, `games/{Snake,Race,Orbit,League}.ts`, `starclash/Game.ts`, `arcade/runtime.ts`, `pizza/fx.ts`, `JoyLab.tsx`, `JoyLabPad.tsx` | `HUD.*` to lustra tokenów `--os-*`; `GAME HUD SELFTEST` porównuje je z `palette.css` i nie pozwala `ctx.font` omijać `hudFont()` (wyjątkiem są malarze tekstur świata: `neon/textures`, `league-next/{textures,stadium,markers}`, `pizza/assets`) |
| Tożsamość gry = akcent | `src/arcade/catalog.ts` (`accent`, `accentSoft`), `liquid.css` (`.arcade-page` jako ambient akcentu, klawisze START/WRÓĆ), `GameResults.tsx`, `PauseSheet.tsx` | siedem tytułów grało tym samym pomarańczem; teraz Pęd jest neonowo różowy, Fala fioletowa, Liga cyanowa, Dostawa kwasowo zielona, Wir piaskowy — każdy ≥7:1 na `--os-panel`, więc bramka kontrastu nadal trzyma |
| Martwe tła gier usunięte | `src/index.css` (`.arcade-race/-orbit/-snake/-league`, `.arcade-page{background:#0a0e0f}`) | nadpisywały paletę i nie pasowały do ambientu z akcentu; jedna reguła zamiast pięciu |
| Nagrania botów: `snake`, `league`, `pizza` | `scripts/previews/capture.mjs` (trzy nowe gałęzie), `GamePreview.tsx` (`PREVIEW_GAMES`, `PREVIEW_REVISION` 3) | trzy grywalne tytuły pokazywały w bibliotece tylko okładkę, choć mechanizm nagrywania istniał od rundy 14 |
| Nagrywanie w CI | `.github/workflows/previews.yml` (`plan` → `record` (macierz) → `publish`) | sandbox agenta nie pobiera Chromium, a render programowy WebGL trwa minuty na klatek — workflow startuje Vite, nagrywa jeden silnik na job, sprawdza klipy `selftest:console` i commituje je do gałęzi (`workflow_dispatch` albo zmiana potoku przechwytywania) |
| Bramka nagrań czyta katalog | sekcja **PREVIEW** w `scripts/console-selftest.ts` | lista tytułów bierze się z `PREVIEW_GAMES` i jest porównywana z `catalog.ts`: grywalny tytuł bez nagrania odpada, `wip` nie ma prawa go żądać; formaty muszą istnieć parami, plik <12 MB, folder <60 MB |
| Wersja **1.9.0** | `src/platform/whatsNewState.ts`, `package.json`, `src/platform/WhatsNew.tsx` | to nie poprawka w obrębie wydania: nowa oprawa rundy, akcenty gier i komplet nagrań zasługują na własny numer i własną listę w „Co nowego?” |

**Dowiezione w CI:** klipy `snake`, `league`, `pizza` nagrał workflow `previews.yml`
(commit `541f80a`, `publish` bramkuje je przez `selftest:console` przed zapisaniem).
Brama PREVIEW pilnuje kompletu tytułów przy każdej zmianie: pary mp4+webm, natywne
1920×1080, plik <12 MB, folder <60 MB (obecnie 33 MB). `PREVIEW_REVISION` = `4`.
Runda 25 dodała siódmy tytuł (`blockcraft`) i — dokładnie przewidzianym tu mechanizmem —
wpis wrócił na listę oczekujących: `awaitingRecording` trzyma `blockcraft`, dopóki
`previews.yml` nie nagra i nie opublikuje jego klipu (gałąź scenariusza już jest
w `capture.mjs`); wtedy lista wraca do pustej i brama znów żąda kompletu siedmiu.
