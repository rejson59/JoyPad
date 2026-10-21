# JoyPad OS — sprawdzenia

## Automatyczne, bez sieci

```sh
npm ci
npm run lint
npm run typecheck
npm run selftest:console
npm run selftest:arcade
npm run selftest:relay
npm run selftest:ui      # test dymny interfejsu (jsdom + prawdziwy render kliencki)
npm run build
```

Wszystkie automaty bez przeglądarki jednym poleceniem: `npm run selftest:all`
(arcade, console, relay, platform, replay, v16, cinema, cinema-render, league, pizza, ui).
`npm run verify` dokłada do tego lint, typecheck i build — to dokładnie ten zestaw,
który uruchamia `ci.yml` i `deploy.yml`.

`selftest:console` sprawdza walidację preferencji, zakresy rozmiaru/wysokości, omijanie niedostępnych gier, zawijanie biblioteki, wspólną paletę oraz priorytety i fallback haptyki. Sekcja **LIQUID GLASS** liczy selektory powierzchni (165) i pilnuje tokenów, braku `background-color: #hex8`, `backdrop-filter: blur(` w ciele reguły, nieskończonych animacji i `transform: none !important` na klasach Plamka z transformem JS. Sekcja **UI CONTROL** dokłada liczby sterowania (martwa strefa analoga, próg pierwszego powtórzenia, rytm przyspieszenia, wybór celu w rzędzie i w siatce), stos skrótów X/Y (kto jest na wierzchu, podmiana w miejscu, brak akcji po zamknięciu), maszynę stanów pełnego ekranu, nowe komendy w protokole (`x`/`y`/`fullscreen` przy `PROTOCOL_VERSION 1`) oraz kontrakt źródłowy: jedna nawigacja w projekcie, maskotka animowana transformem i znosząca się przy ograniczonym ruchu (bez `Math.random` w klatce), pilot telefoniczny z gałką i skrótami. Sekcja dokłada też **model ruchu Plamka** (kolejność faz, przekierowanie w locie, próg poślizgu, grubienie farby przy skracaniu obwodu, długość lotu od dystansu z górnym limitem) i to, że ruch jest **pościgiem ze stałą czasową, nie sprężyną**: 63% dystansu na `tau`, brak przekroczenia celu, promień zaokrąglający się z napięcia, ostry tył kulki w locie, prymat ruchu nad skłonem w eyeline'ach. Runda 3 doka kontrakty rytmu zdarzeń i fizyki cieczy: `focusout` nie może gasić maskotki (test sprawdza brak nasłuchu i istnienie `scheduleHide` z `PLAMEK.hideDelayMs`), rytuał startuje z gałęzi `lean` (`takeOff`), most `strandFor` nie istnieje bez ruchu, cienieje monotonicznie i pęka przed lądowaniem (z kurczącą się kroplą źródłową), `flightCurve` jest monotoniczna i zerwanie jest szybsze niż hamowanie, `gripOffset` ściąga się do zera, `squashFrom` zachowuje pole, a `wobbleValue` zmienia znak po pół okresie i gaśnie do zera (więc pętla może zasnąć); w widoku drganie nie może trafiać w oś pozycji. Runda 4 dokłada kontrakt położenia głowy: `perchFor` siada nad elementem niezależnie od kierunku
komendy (tylko gdy brakuje 2× promień + zapas — pod), `perchSide` jest funkcją kierunku,
`gazeBiasFor` każe oczom patrzeć na etykietę, a `landFor` oddaje dokładnie ten sam punkt, w którym
główka stoi, i trzyma centrum łuku nad rzędem. Runda 7 przepisuje **geometrię kleksa**, więc testy
liczą kształty, nie klasy: `rimPerimeter`/`rimPoint` (obrys liczony **długością łuku**: `u = 0` nad
środkiem górnej krawędzi, `u = 0.5` pod przyciskiem, fronty lustrzane, przy `wrap = 1` pętla zamyka
się w ±12% obwodu, a przesunięcie `u` przesuwa łamaną o dokładnie `Δu · P` pikseli), `bandEdges`
(brak samoprzecięć, anizotropia grubości 0.27 : 1 : 1.44 góra : bok : dół, zero na `wrap` = pusto,
`dent` cieni taśmę, `lobe` wypycha główkę nad przycisk na wysokość zbliżoną do rozmiaru buźki, fala
`wob` zachowuje medianę grubości, gęstość próbek rośnie z obwodem), `ribbonPath` (czapy tylko gdy
taśma jest otwarta), `blobPath`/`neckPath` (ogon w pikselach, `pinch = 1` zwęża szyję w okolicy środka
do zera, półosie liczone z promienia — `scale()` nie istnieje), `dripTail` + `teardropPath` (kropla
wisi pod trzecim frontem na dolnej krawędzi, nigdy dłuższa niż połowa wysokości przycisku, wciągana
krótsza = szersza, zerowa po domknięciu), `gooStrength` (0 → bulwa → `.3` w bezruchu, `0` przy
`reduced`) i `haloAppearance` (`appear > 0` już w pierwszej ramce, pełnia przed uderzeniem, zero po
otwarciu drugiego kaflu). Runda 8 dokłada **wyraźność**: `paintWeightFor` jest monotoniczny od
krótszego boku, mieści się w klamrach 2.8…9.5 px i nigdy nie zabiera więcej niż ~1/6 elementu
(stąd „za gruby na małych przyciskach" nie wróci), próg alfa to `18 -6` (a nie `22 -10`, przy
którym most i smuga istniały tylko w modelu), keyline robią `feMorphology`+`feFlood`+`feMerge`
bez `feDropShadow` (SVG 1.1 — starsze przeglądarki TV), echa mają podłogę `.42` alfy i gasną
promieniem, a górna anizotropia nie jest niższa niż `.5`. Runda 9 dokłada geometrię główki:
`crownFor` zeruje garb, gdy element nie ma płaskiej góry (ikona 30 × 30 — dawniej jajko), `lobeAt`
przenosi go na dolny łuk, kiedy `perchFor` każe główce przysiąść pod przyciskiem (aserta liczy
wysokość materiału nad górną krawędzią i pod dolną, dla obu wariantów), a `fill` farby to z powrotem
czysty akcent — z zapisem w teście, że rozjaśnianie mieszkanką jest cofnięte. Osobne aserty pilnują, że w CSS nie ma już `stroke-width` (martwa kreska, za to płatna co
ramkę) i że `draw()` nie nadpisuje `fill-opacity: 1` regułą z pliku. Do tego asercje na źródło widoku: cała farba to `<g class="plamek-goo">`
w jednym `<svg class="plamek-liquid">`, `d` kołnierza i bulwy pisane `setAttr(el, 'd', …)` (zero
zapisów bez zmiany), region maski pisany `setAttr(region, 'width'|'height')` na
`filterUnits="userSpaceOnUse"`, `id` z `useId()`, `color-interpolation-filters="sRGB"`, twarz jest
rodzeństwem grupy i nie ma `filter:`, `.plamek-glow` zaczyna `cssText` od `--halo-x` (na tej
właściwości jedzie pozycja!), `fill` farby jest malowany atrybutem, więc CSS nadpisuje go tylko
w reakcjach, i nie ma już ani jednego `div`a z `border` pełniącego rolę obwódki, ani `background`
z `conic-gradient`, ani `mask-image` na warstwie Plamka.
Dokłada miernik czekania: `linkProgress` nie zapełnia koła przed `ready`, a przy błędzie zwraca `null`. `selftest:arcade` zawiera regresję stanu `lab` bez wybranej gry i przesyłanie odliczania/pauzy.

## Sterowanie padem — czego nie da się sprawdzić bez telewizora

Automaty liczą algorytm i kontrakt. Zostają do oceny na żywym urządzeniu: czy lot jest
**widoczny** na każdym kroku (plama musi dać się zauważyć w locie, nie pojawiać się na celu),
czy most z farby łączy bulwę ze startem od pierwszej ramki do pęknięcia, czy taśma faktycznie
obejmuje krawędzie celu (oblewa, a nie obrysowuje z odstępem), czy główka jest **częścią** taśmy,
a nie obiektem postawionym na jej krawędzi (to był główny zarzut recenzji — „kulka nie wnika
w pierścień, tylko na nim staje"), czy strugi widać po dwu bokach (a nie jako „ramka zapala się
cała"), czy kropla zdąży się pojawić i zostać wciągniętą przed zwarciem, czy Plamek nie gubi
elementów przy szybkim ciągnięciu gałki (poślizg ma wyglądać jak lepkość, nie jak błąd), czy
bulwa nie zasłania napisu na małych przyciskach, czy główka na górnym rzędzie nie wychodzi poza
pasek tytułu okienka (wtedy powinna sama przesiąść się pod przycisk) i czy trzyma się taśmy
podczas przewijania raila, czy domknięcie obwodu pod przyciskiem nie mruga na 4K, czy region
maski ani `overflow` `<svg>` nie ucina kropli, ogona i bryzgów (na wąskich kaflach to jedyne
miejsca, gdzie farba wychodzi poza box), czy bryzgi przy uderzeniu nie migoczą na 4K, czy farba
nie „odkleja się" od kafelka w trakcie morphingu okienka, czy `reveal` dowozi kafelki z
przewijanego raila, czy podpowiedzi X/Y są czytelne z kanapy (10 stóp) i czy pełny ekran wstaje
po „uzbrojeniu”. Od tury 13 dochodzi jeszcze jedno: **czy krawędź farby jest gładka** —
przy DPR 1, 2 i 3, w bezruchu na małej ikonie i dużym kaflu oraz na bulwie w locie.
Sprawdź też morfing okienka: oczy mają pozostać ostre, smuga i most widoczne, a kolor
niezmieniony. Wygładzanie jest po progu alfa; sam próg i siła scalania pozostają jak przed
poprawką. To lista do oceny na urządzeniach, nie wynik wykonanych testów wzrokowych.
Krótka procedura: podłącz pada USB → biblioteka (`X` = dodaj gracza, `Y` = dźwięk) →
`Centrum pokoju` (X = blokada, Y = odnów QR) → `Ustawienia` (X = ograniczony ruch, Y = dźwięk) →
wejście w grę → **zostaw pada na ekranie menu gry i tam przejdz strzałkami wszystkie opcje**
(plamek powinien przeskakiwać z wartości na wartość, a `←/→` na ustawieniu ma zmieniać ustawienie,
nie uciekać do strzałek po jego bokach) → START → w rundzie strzałki mają sterować grą, a nie
fokusem → pauza (okienko nad rozgrywką nadal chodzi padem) → END/wyniki (`↑↓←→` po momentach,
propozycjach ekipy i akcjach, Enter na REWANSZU) → powrót do biblioteki → `Start`/`Home`. Potem:
odłącz pada w połowie ruchu (kursor ma stanąć, nie jechać) i podłącz go ponownie.

## Sprawdzone w Chromium w sandboxie

- Biblioteka: 3 dostępne gry, strzałki, wejście i powrót do tej samej gry.
- Ustawienia i „Wkrótce”: otwarcie, Escape, brak zmiany gry za panelem.
- Układ desktop 1440×1000, mobile 390×844; brak poziomego przepełnienia biblioteki.
- Telefon: portret i poziom 844×390, lokalne naciśnięcie/zwolnienie akcji.
- Start Neonowego Pędu w trybie Canvas fallback, wspólna pauza, potwierdzenie zakończenia, powrót do biblioteki; wejście i wyjście Stalowego Frontu. Pełnej wydajności WebGL nie można ocenić na programowym GPU sandboxa.
- Zapisywanie rozmiaru, zamiana stron, zmiana orientacji, ograniczony ruch.
- Testowane za pomocą wstrzykniętego stanu hosta: wspólny lab, odliczanie i pauza, blokada akcji podczas pauzy. Nie jest to test rzeczywistej sieci ani silnika wibracji.

## Do weryfikacji na fizycznych urządzeniach

1. TV/komputer + Android Chrome: QR, dźwięki po aktywacji, haptic TEST, subtelne/wyraźne/wyłączone, wejścia wielodotykowe podczas serii strzałów.
2. iPhone Safari: poprawny komunikat braku wibracji, gra bez czujników, odmowa uprawnień, safe-area i pełny ekran zgodnie z możliwościami systemu.
3. Wi-Fi ↔ LTE: dołączenie, utrata sieci, powrót, przekazanie roli administratora. Publiczne brokery i PeerJS nie były dostępne z sieci sandboxa; nie potwierdzono tu połączenia end-to-end.
4. Słabszy telefon: płynność, temperatura i bateria podczas dłuższej gry. Nie deklarujemy pomierzonych 60 FPS na wszystkich urządzeniach.
5. Fizyczny gamepad: biblioteka, powtarzanie po przytrzymaniu, A/B, ustawienia. Obsługa zależy od standardowego mapowania Gamepad API; gry nadal używają telefonu/klawiatury.
6. View Transitions: wejście i powrót; w przeglądarce bez API sprawdzić przyciemnienie fallback. Z ograniczonym ruchem brak obu animacji.

Duże binaria przeglądarki i zrzuty z lokalnych testów nie należą do repozytorium.

## Dopracowanie kinowe — ekrany pomocnicze

- Przeglądarka Chromium: nowe przygotowanie arcade, zmiana statku i profilu obrazu, zapis preferencji, wejście w trening Stalowego Frontu i konfigurację bitwy.
- Systemowe selektory: przełącznik dźwięku, ograniczony ruch, zamknięcie Escape, brak zmiany ekranu za panelem.
- Osobne fixture komponentów (wyłącznie lokalne testy, bez publicznej trasy): pauza z okładką, potwierdzenie i anulowanie wyjścia, wspólny ekran wyników z trzema uczestnikami. Wyniki widoczne w aplikacji nadal pochodzą z silnika gry.
- Widoki sprawdzone na 1440 px i 390 px; brak poziomego przepełnienia w przygotowaniu i wynikach. Animacje wejścia respektują ograniczony ruch.
- Nowe komponenty `GameSetup`, `GameResults`, `ChoiceGroup` i kinowy wariant `Sheet` są współdzielone; reguły rozgrywki i sieć pozostają bez zmian.

### Obsidian / Ember refinement

- Neutral surfaces and white copy; orange is reserved for actions/selection. Player colors, connectivity warnings and damage feedback remain semantic. Palette contrast is checked by `selftest:console`.
- Settings retain native inputs, switch state and `aria-pressed` choices; removing nested borders must not remove keyboard focus indicators.
- Library: pairing must never block local play. While the room is connecting the block shows the room code and a waiting state, not an empty frame; when the room is available the QR appears — **and stays visible after pads connect**, because people keep arriving mid-evening. The admin can hide it (room switch „Kod QR na dużym ekranie”); then the block collapses to one line with „Pokaż kod QR”. With connected pads the roster and next step stay above the QR, “Dodaj kolejny pad” remains available, at four pads use “Zarządzaj padami”; after disconnect return to the appropriate state. “Połączono” is transport state, not a player ready vote.
- Library → setup: shared cover/title transition in supporting browsers; no additional title entrance transform. Verify keyboard and mouse entry, reduced-motion preference and browser fallback.
- Results: preserve engine-provided classification and team-win semantics. Test winner, team win and no winner; “Rewanż” calls restart, “Zmień grę” exits to library, and settings remain independently accessible. Check long nicknames and 390px layout.

### Shared evening: readiness, rematch and history

- Phone → host `intent` messages carry `ready` / `rematch` and a boolean. Only an already-paired connection can change its own vote. Readiness is allowed in menu/setup, rematch only on results. Neither sends an administrator command or starts gameplay.
- Votes are included in the existing session roster, reset on game/screen changes and changed configuration, and disappear on disconnect. Repeating identical settings does not reset them. Old peers may omit the optional flags; those mean false.
- Phone buttons show host-confirmed state, allow cancellation, and work for non-admin players. TV setup shows ready count and per-pad labels; results show rematch count/names. Host start remains available without unanimous readiness and local keyboard play remains independent of networking.
- `joypad.evening.*` stores last started playable game, arcade options, and tank map/mode/limits/slot roles. No round state, room code or remote player nicknames are restored. Values are allowlisted; malformed/blocked storage falls back to defaults. “Zagraj ponownie” opens preparation, not an in-progress match.
- Joining uses a non-blocking corner notice and short roster highlight. Phone retains its preference-aware join haptic and visual fallback. Test several arrivals, leaving/rejoining, reduced motion and muted audio.
- System cues have priority and no queue. Move cannot overlap join/start/finish; browser audio activation is still required. Distinct game audio/menu music settings remain unchanged.
- Browser verification used real host/client message handlers bridged by a mock transport for phone readiness/rematch. This is not a Wi-Fi/LTE or physical-device latency test. Physical TV distance, phone vibration, browser autoplay and public relay availability still require device checks.

### Device profiles, touch safety and next-game suggestions

- First phone visit offers Android, iPhone/iPad and Auto. Selection is persisted in `joypad.console` and editable under controller settings. It does not spoof the browser or grant sensor/vibration/fullscreen support. iOS (or Auto detecting iOS/iPadOS) uses an anchored joystick; Android uses the existing floating origin.
- Gesture reset paths: pointer-up, pointer-cancel, lost capture, final touch-end, blur, page-hide, hidden document, orientation/viewport resize, disabled state and unmount. Global pointer release is a fallback when capture fails. One finger releasing must not cancel the other joystick/action. Active movement is not interpolated; only the visual return animates.
- Host input heartbeat watchdog: neutral after >800 ms without input (sweep every 200 ms), even if pings arrive. Full stale-client timeout remains 10 s. No forced pause for the other players. TV shows stale-input names and a disconnect notice; fresh input clears the warning.
- Reconnecting device IDs can recover a former slot for 60 s if it is free, without displacing another player. This is not a slot lock or a guarantee across host reloads. Physical radio outages, Safari interruptions and multi-touch must still be tested on real devices.
- Lab starts with an optional joystick/action test using the real input channel; TV shows each connected pad's movement and action. Sensors/haptics exploration remains available separately. No motion-sensor permission is needed for the quick test.
- Host/admin can remind only unready pads in menu/setup, at most once per 8 s. Phone acknowledgement is visual with optional preference-aware haptics. No repeated automatic reminders.
- Paired players can propose a different playable game only on results, cancel their proposal, or change it. TV lists the voters; choosing the proposal opens preparation. No automatic majority start. Upcoming/current/unknown IDs and unpaired senders are rejected.
- Personal result details reuse real `score` and `detail` from the engine. No inferred awards or unmeasured drift statistics.
- Added finite device-card, join, readiness, proposal and results transitions. Reduced-motion preference disables them. Gameplay input remains immediate.

Browser checks in Chromium covered iOS-profile selection, pointer-up/cancel/lost-capture, empty touch-end, blur/page-hide/visibility/resize/orientation, simultaneous stick + action, quick lab, reminder delivery, proposals and 320 px results. Host/client were bridged with a mock transport; this does **not** certify Safari/iOS hardware, end-to-end internet reconnection or consistent 60 FPS.

Suggested physical iPhone check: choose iPhone/iPad → connect → quick lab → hold stick and action together → release each independently → rotate → switch to another app and back → disable Wi-Fi briefly → reconnect. After each interruption, controls should remain neutral until a new touch. Repeat in Safari and from the home-screen shortcut. Also verify Android with floating origin and reduced motion enabled.

### Recorded menu previews

- Only the selected playable game has a preview element. No engine runs in the menu: files are captured offline by `scripts/previews/capture.mjs` — locally or by the `Previews` workflow (`.github/workflows/previews.yml`), which records one engine per job and commits the clips back to the branch. Every playable title in `catalog.ts` has a recording (`PREVIEW_GAMES` in `GamePreview.tsx` is checked against the catalogue by `selftest:console`); `wip` announcements fall back to their cover art. Provenance and regeneration instructions live in `public/previews/README.md`.
- Desktop autoplay waits 900 ms after eligibility to avoid downloads while browsing quickly. It requires an intersecting preview, a visible tab, no overlay, no reduced-motion preference, and no detected Save-Data/2G/3G connection. Eligible viewports are `≥1000px with a fine pointer` and `≥1400px regardless of pointer`, because TV browsers report a coarse pointer; phones and tablets stay manual.
- A persistent settings switch disables automatic playback. Each clip has a keyboard-accessible play/pause button; pausing returns to the original cover. Unselected/offscreen/hidden/covered previews are removed and their media resources released. Source changes never run two clips together.
- Check all three actual video decoders, MP4/WebM fallback, no audio, missing-file fallback, rejected autoplay, rapid selection, below-fold scroll, settings/connection/lab overlays and page visibility. Broken video must never block “Uruchom grę”.
- Browser regression verified decoded video dimensions and playback, one video/no canvases, pause/manual restart, settings, hidden tab, manual phone playback, reduced-motion/no automatic video requests, 390px overflow, and aborted-source fallback followed by launching the game.
- Safari/physical TV decoder performance and data-saver API availability still depend on the device. Absence of the network-information API is not interpreted as proof of a fast connection; mobile remains manual through viewport/pointer gating.

### Background gameplay and clear Neon tire effects

Recordings are Full HD masters (1920×1080, 24 fps, H.264 CRF 21 / VP9 CRF 33, silent) captured from the engine canvas at native size by `scripts/previews/capture.mjs`; the console selftest reads the MP4 track dimensions so the masters cannot silently shrink again. Source URLs carry a `?v=` revision (`PREVIEW_REVISION` in `GamePreview.tsx`): bump it whenever the clips are re-recorded, otherwise browsers and CDNs keep serving the previous file under the same name. Presentation: the wallpaper band grows with the viewport (`clamp(560px,100dvh,1180px)`) and the video is fitted to its own 16:9 shape inside it, so the whole frame stays visible on a small laptop, a 16:10 monitor and an ultrawide TV instead of being cropped by `object-fit:cover`. The selected cover stays behind the frame, blurred, as ambient art for the bars; the frame gets a rounded edge and a soft accent glow. The right-hand “WSPÓLNY EKRAN” panel is translucent smoked glass (`backdrop-filter: blur(22px) saturate(135%)`) with an opaque fallback for `@supports`-less and `prefers-reduced-transparency` browsers, so the preview is not covered by an opaque card. Scrims are lighter than before: a left gradient protects the copy, the bottom fades into the page background.

Check: the video is contained inside the wallpaper band at 1366×768, 1920×1080, 2560×1440 and 3440×1440 (no clipping, aspect ratio preserved), text over bright tank terrain stays legible, the glass panel keeps its contrast over both bright and near-black scenes, and the fallback path (no `backdrop-filter`, no container query units) still shows the whole recording. Keep all previous autoplay, one-video, reduced-motion and data-saving checks.

Neon drift smoke and wet-road spray now use time-based emission probability, smaller particles, shorter lifetimes and per-emitter opacity. This changes the real production scene as well as the regenerated race recording. Other emitters keep opacity 1 by default; sparks, boosts and collision effects are not globally dimmed. Capture frames show a clear road instead of the previous tyre fog. Particle selftest covers opacity/defaults/expiry; physical GPU performance still needs device testing.

### Liquid glass: morfing okienek i widoczność zaproszenia

Warstwa stylu jest opisana w [docs/liquid-glass.md](liquid-glass.md); poniższe punkty są do odhaczenia na
sprzęcie, bo w tym środowisku **nie było przeglądarki** (brak Chromium, brak dostępu do repozytoriów apt) —
ani morfingu, ani kosztu `backdrop-filter` nie zmierzono.

- Otwarcie i zamknięcie: klik, `Escape`, klik w tło, `X`, pilot (strzałki + Enter) i `select` z telefonu.
  Okienko ma wyrastać ze środka tego samego elementu, do którego wraca. Brak punktu startowego (okno otwarte
  przez kod, np. komunikat o dołączeniu) = zwykłe wniknięcie, nigdy skok z pustego miejsca.
- Okienka na telefonie: wjazd od dołu i wyjazd w dół (`lg-sheet-up` / `lg-sheet-down`), safe-area,
  brak poziomego przepełnienia przy kodzie QR 158–238 px w bloku „WSPÓLNY EKRAN”.
- Odświeżenie stanu pod otwartym oknem (pad dołącza, znika, zmienia nick, głosuje): okienko **nie może**
  zagrać animacji od nowa ani stracić fokusu. To regresja po przejściu z `useEffect([onClose])` na
  `useLayoutEffect` z callbackiem przez ref.
- Czytelność: tekst na szkle nad jasną areną i nad ciemną — selftest liczy kontrast (7:1 / 4,5:1) przy
  najgorszym realistycznym tle, ale próbkę wzrokowo sprawdź na telewizorze z odległości 3 m.
- Wydajność: przy otwartym oknie i w czasie morfingu nie powinno widać „schodów” na TV 4K. W trakcie ruchu
  rozmycie spada do 10 px, a `will-change` znika po animacji; jeżeli telewizor i tak gubi klatki, wyłącz
  `prefers-reduced-motion` w systemie i sprawdź różnicę — przy ograniczonym ruchu warstwa nie animuje nic.
- Zaproszenie: „Odnów kod” wymienia PNG, nie kod pokoju; połączone pady grają dalej. Awaria i powrót
  sieci oraz wygaśnięcie pokoju na serwerze sygnalizacji wymuszają nowy klucz same (TTL 10 minut,
  90 s łaski dla telefonu w trakcie dołączania). Telefon, który zdążył zeskanować **stary** QR po tym
  oknie, dostaje czytelny komunikat „zeskanuj aktualny kod”, a nie milczące odrzucenie.
- Uprawnienia: gość nie może ani schować QR-u, ani odświeżyć klucza (to nie jest akcja protokołu).
  `npm run selftest:platform` pilnuje obu przypadków, a od tury 12 pilnuje też wyciszenia (pakiet ANTI‑SPAM).

### Pad i Plamek w menu każdej gry (tura 10)

Do odhaczenia wzrokowo — automatów nie da się tu użyć, bo to kwestia tego, gdzie farba siada:

- Wejście: pierwsze naciśnięcie strzałki na ekranie OPTIONS musi **coś** ruszyć (startujemy z
  `.cine-start`; fokus na `body` bez `focusUiScope` oznaczałby martwy ekran).
- Steppery (`WIDOK`, `PROFIL`, `FORMAT`): `←/→` przestawiają wartość pod Plamkiem, `↑/↓` wychodzą
  z rzędu. Plamek przy zmianie wartości **nie skacze** — farba zostaje na elemencie (to cel, nie
  zmiana celu), a `flip-in` liczby jest jedyną animacją.
- Wartość zmieni się także po `Enter`/`A` na stepperze (tak robi natywna `<select>`), a klik
  strzałek po bokach działa jak dawniej (mysz i dotyk nic nie tracą).
- Wyniki: siatka momentów i karty propozycji ekipy są nawigowalne (grupy liczą się po krawędzi
  wiodącej), a maskotka wchodzi na REWANŻ, nie na `Wyjdź do biblioteki`.
- Runda: w `game` strzałki znowu należą do gry — na `ArcadeGameView` to `menu`, `setup`, `over`
  są interfejsem; na czołgach analogicznie (`uiOwnsInput` w `JoypadApp`).
- Czołgi: `↑/↓` po trzech kartach trybu przełącza podświetlenie **i** opis na dużym przycisku
  (`onFocus` → `menuChoice`). Bez tego napis „SZYBKI POJEDYNEK" stałby przy innej karcie.
- Plamek znika w momencie, w którym runda bierze pilota: brak maskotki = brak ruchu interfejsu,
  nigdy odwrotnie.
- Dźwięk: każdy krok to `uiNav` (520 Hz, 34 ms), zatwierdzenie/zmiana wartości `uiClick` —
  po zmianach w `ArcadeGameView` i `App.tsx` nic nie brzęczy dwa razy na jedno naciśnięcie.

### Wyjście z pauzy nie może odpauzować gry (tura 11)

Konkretne ścieżki do przejścia na telewizorze i na telefonie — wszystkie kiedyś wypadały w
odpauzowanie zamiast w wyjście:

- Pauza (`P`, `Esc`, `start`, przycisk pauzy w HUD, `pause` z telefonu) → „Wróć do biblioteki" →
  „Zakończ rundę": **wychodzi**, nie wznawia. Powtórz, trzymając `A`/`select` na padzie (rytm
  powtórzeń nie ma prawa dobrać się do pauzy).
- W okienku pauzy naciśnij `Esc`/`back` **mając fokus na tle lub poza przyciskami** (np. po
  przełączeniu na panel potwierdzenia): fokus ma wrócić na pierwszą pozycję okienka, a gra —
  zostać zapauzowana.
- Z panelu potwierdzenia: `back`/`Esc`/klik w tło/X = „jedno wstecz" (wraca do przycisków
  pauzy), a NIE „wracamy do gry".
- Wyjście kliknięte w trakcie innej przejściówki (rewanż, wejście w grę, `start`):
  podmiana ekranu dzieje się natychmiast, bez czekania na kurtynę i bez cichej utraty żądania.
- Telefon-admin: pauza przyciskiem w nagłówku, potem „Wróć do biblioteki" (twardy
  `window.confirm`) → TV wychodzi do biblioteki.
- Panel padów (`Smartphone`/`Telefon jako kontroler`) otwarty w trakcie rundy albo w menu gry:
  `back`/`Esc`/`pause` **zamyka panel** i nie pauzuje gry; klik w tło dalej go sprząta. W menu
  czołgów ten sam przycisk otwiera `ConnectionsScreen` (modal) — tam `back` obsługują zasady
  okienka, a nie gra.
- Wpis w polu tekstowym (nick w panelu padów) przy działającej rundzie: klawisz `p` i spacja
  nie pauzują, strzałki nie przewijają areny wbrew okienku.
- Po powrocie do biblioteki: Plamek stoi na tej samej grze, z której wyszedłeś, i pierwsza
  strzałka rusza go natychmiast. START tej gry działa (flaga wyjścia jest kasowana przy wejściu).

### Anty‑spam propozycji (tura 12)

Telewizor liczy, telefon tylko pokazuje — więc sprawdzamy oba końce:

- stukaj pięć różnych tytułów jak najszybciej: pierwszy wchodzi na ekran natychmiast, następne
  są odbijane z powodem w linii pod nagłówkiem („za wcześnie…”, „za dużo propozycji…”) i z
  krótkim brzęknięciem; pigułka na TV nie powinna mnożyć się na każde kliknięcie;
- ta sama gra dwa razy z rzędu to duplikat, nawet po upływie cooldownu — komunikat mówi o
  trzech minutach, nie o ośmiu sekundach;
- wycofanie głosu (to samo kliknięcie jeszcze raz) działa również wtedy, gdy gracz jest
  wyciszony — to jedyna rzecz, której kłódka mu nie zabrania;
- po czterech odbiciach pod rząd gracz dostaje auto‑wyciszenie: w załodze („Pokój” na TV)
  mikrofon jest czerwony, a w powiadomieniach pojawia się jedna pigułka z imieniem;
- administrator może założyć i zdjąć kłódkę ręcznie, jednym kliknięciem, bez pytania o
  potwierdzenie (operacja jest odwracalna i nie rozłącza telefonu);
- odmucenie zeruje liczniki: ten sam gracz może zaraz zaproponować tytuł, który miał przed
  kłódką, bez czekania na cooldown;
- gościowi mikrofon nie działa (ani na administratorze, ani na nikim innym), a odświeżenie
  strony na telewizorze/start rundy nie zerują limitu — licznik przeżywa zmianę gry.

Automaty: `selftest:platform` → **ANTY‑SPAM** liczy te same progi na czystym module i na prawdziwym
`PadHostzie` (z podszytym zegarem), a `selftest:arcade` → SAFETY pilnuje, że odbita zmiana zdania nie
rusza ekranu i że wycofanie głosu przechodzi zawsze.

Automaty: `selftest:console` → UI CONTROL pilnuje, że `data-ui-stepper` jest regulowalny, że
`GameSetup`/`GameResults`/`tank-setup` mają zakres i punkt wejścia, że gry nie mają własnego nasłuchu
klawiatury i że `navigateResults` nie wrócił. Paczka RESULTS NAVIGATION z `selftest:platform`
została wycofana razem z modułem.

## Film pierwszego wejścia (runda 14)

Pytanie „Witaj w JoyPad! Chcesz zobaczyć krótki poradnik?" pojawia się raz, na bibliotece, zaraz po
ekranie startowym. Do klikania ręcznie:

1. **„Tak"** → startuje film (~46 s). `Esc`/`B` pomija, `Spacja`/`A` pauzuje, `←`/`→` zmienia scenę,
   `R` powtarza od nowa, `Q`/`Y` przełącza jakość, `M`/`X` wycisza. Klik w segment paska to skok do rozdziału.
2. **„Nie"** → ostrzeżenie o tym, co bez poradnika będzie trudniejsze, z przyciskiem „Pokaż mi jednak
   poradnik". Po zamknięciu pytanie nie wraca; wraca tylko z ustawień.
3. **Ustawienia → Poradnik JoyPad**: „Odtwórz poradnik" oraz przełącznik „Pytaj przy starcie" (z licznikiem obejrzeń).
4. **Ograniczony ruch** (Ustawienia → Ruch i przejścia → Ograniczony) → film pokazuje storyboard:
   jedna klatka na scenę, bez animacji, ale z pełną kompozycją i napisami.
5. **Telefon w trakcie sceny parowania** → w kadrze pojawia się prawdziwa nazwa gracza i jego kolor,
   a kod QR to kod prawdziwego pokoju (albo zaproszenie `…/#pad`, gdy pokój się jeszcze nie zarejestrował).
6. **Telewizor z dziesięciu stóp**: czy hasła i zdania czyta się bez wstawania; pasek odtwarzacza znika
   po 3 s bezruchu i wraca przy pierwszym ruchu.

Bez przeglądarki w sandboxie (`ECONNRESET` przy pobieraniu Chromium) film nie był obejrzany.
Maszyna sprawdziła za to `selftest:cinema` (kontrakt skryptu) i `selftest:cinema-render`
(860 renderów w PL i EN: brak NaN w geometrii, obecność elementów charakterystycznych scen,
język i tryby `lite`/`static`). Nagrania do ręcznego montażu robi
`node scripts/cinema/render.mjs` (wymaga Chromium i ffmpeg).

## Test dymny interfejsu (`npm run selftest:ui`)

Runda 15 dokłada `scripts/ui-smoke.mjs`: uruchamia **prawdziwy render kliencki**
(`react-dom/client`) w jsdom, a moduły ładuje przez pipeline Vite (`ssrLoadModule`) —
ten sam zestaw transformacji, co w przeglądarce. Test przechodzi ścieżkę pierwszego
uruchomienia i wymaga zera błędów: splash → pytanie o poradnik → film (Esc zamyka) →
„Co nowego?” (biblioteka otwiera je sama na pierwszym uruchomieniu) → wszystkie okna
systemowe (Ustawienia, Pokój, Galeria, Co nowego, Zapowiedzi, Jak zacząć) → poradnik
z okna pomocy i ze **stopki** → powrót biblioteki.

Czego nie sprawdza: układu, animacji i WebGL — jsdom nie rysuje. Łapie natomiast to,
czego nie widzą selftesty modelu: wyjątki w efektach, martwe przyciski i puste drzewo
interfejsu (React 19 po nieprzechwyconym błędzie wymontowuje całe drzewo — dla
użytkownika to „czarny ekran” bez śladu).

## Podgląd dla użytkownika: build, nie dev server

Podgląd, który ogląda użytkownik, to **gotowy build** podawany przez
`node scripts/preview-server.mjs 5173` (zero zależności, katalog `../joypad-preview`).
Serwer czyta pliki przy każdym żądaniu, więc po `npx vite build --outDir ../joypad-preview
--emptyOutDir` nic nie trzeba restartować. `npm run dev` zostaje do pracy w edytorze.

Serwer zna też prefiks `VITE_BASE`: przy buildzie dla GitHub Pages
(`VITE_BASE=/JoyPad/ npm run build`, katalog `dist`) podaje zasoby zarówno pod
`/assets/…`, jak i `/JoyPad/assets/…`, więc `PREVIEW_DIR=dist node scripts/preview-server.mjs 5176`
otwiera dokładnie ten artefakt, który trafia na Pages — z tymi samymi adresami co w produkcji.

Dwie rzeczy w tym serwerze są celowe:

- **`/podglad.html` jest generowana w locie**, nie z pliku na dysku — `--emptyOutDir`
  kasuje cały katalog wyjściowy, więc trzymana tam strona kontrolna ginęłaby przy każdej
  przebudowie. Pokazuje czas builda, nazwę chunka i sama sprawdza w przeglądarce, czy
  kluczowe zasoby odpowiadają 200.
- **samokontrola przy starcie** — serwer sprawdza, czy `index.html` i odwołane z niego
  zasoby naprawdę istnieją, i wypisuje `build kompletny` albo listę braków. Przerwany
  build widać od razu, zamiast zgadywać, czemu ekran jest czarny.

Dwa automaty pilnują tej warstwy (wymagają gotowego builda i — dla drugiego — działającego serwera):

| Skrypt | Co sprawdza |
| --- | --- |
| `npm run selftest:preview` | kopiuje build do katalogu roboczego, importuje **prawdziwy** chunk wejściowy w jsdom i przechodzi pierwsze uruchomienie: drzewo interfejsu wstaje, pojawia się pytanie o poradnik, „Tak” startuje film, Esc wraca do biblioteki. Katalog wskazuje `JOYPAD_PREVIEW_DIR` (domyślnie `/home/user/joypad-preview`), a roboczy — `JOYPAD_BOOT_DIR`; prefiks base jest wycinany z adresu chunka, więc `JOYPAD_PREVIEW_DIR=dist` sprawdza build z Pages |
| `npm run selftest:delivery` | pobiera przez HTTP każdy zasób, którego potrzebuje ekran TV i pad: chunki (także leniwe), czcionki z CSS, okładki, nagrania MP4/WebM, manifest. Adresy bierze wprost z `index.html`, więc przy `VITE_BASE=/JoyPad/` sprawdza dokładnie te URL-e, które wpisze przeglądarka na GitHub Pages |

`selftest:preview` to jedyny automat widzący błędy **builda** (zły podział chunków,
`import.meta`, CSS), bo `selftest:ui` idzie przez świeże moduły źródłowe Vite. Uwaga przy
jego rozbudowie: bundle czyta gołe zmienne globalne (`innerWidth`, `MutationObserver`),
których Node nie ma, a jsdom trzyma własne timery — bez `dom.window.close()` proces nie kończy się sam.

## Profile ekranu w automatach (runda 16)

`selftest:console` ma od rundy 16 sekcję **VIEWPORT**: tabelę przypadków dla
`pickProfile` (Smart TV po UA, TV bez kursora, monitor z myszką, iPad, tablet z rysikiem,
telefon, mały ekran dotykowy) oraz kontrakt arkusza `viewport.css` — biblioteka o
wysokości `100dvh`, cztery gry w jednym rzędzie, bloki dla profili `tv`/`desktop`/`tablet`,
brak `!important` i podpowiedzi urządzeń obecne w markupie. Pilnuje też kolejności
w `main.tsx`: profil musi być ustawiony **przed** `createRoot`, inaczej TV mrugnie
układem desktopowym.

Sekcja pilnuje też kontraktu, który powstał po zgłoszeniu *„elementy najeżdżają na
siebie”*: biblioteka **nie może** mieć sztywnej wysokości `100dvh` (musi mieć
`min-height: 100dvh` i naturalny wzrost), musi istnieć ramka `.fit-frame`/`.fit-scale`
z trzema stanami `data-fit`, a skala liczyć się z obu wymiarów. Testy sprawdzają również,
że arkusze systemowe i „Co nowego?” są w źródle **poza** skalowaną treścią.

Dymny test interfejsu (`selftest:ui`) uruchamia samą aplikację, więc sam wywołuje
`installViewportProfile()` — dokładnie to, co robi wejście produkcyjne — i sprawdza, że
na `<html data-profile>` stoi jedna z czterech znanych wartości.

Dwie atrapy są świadome i opisane w nagłówkach plików: `ui-smoke-peer.mjs` (przez
pipeline SSR `peerjs` podstawia podwójne `default`, więc `new Peer(...)` rzuca jeszcze
przed pierwszym renderem — a w aplikacji i w buildzie to działa) i `ui-smoke-qr.mjs`
(rasteryzacja QR nie jest przedmiotem testu). Ostrzeżenia Reacta o `act` przy leniwych
chunkach liczą się jako szum środowiska, nie jako błędy aplikacji.
