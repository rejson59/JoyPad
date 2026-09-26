# JoyPad OS — sprawdzenia

## Automatyczne, bez sieci

```sh
npm ci
npm run lint
npm run typecheck
npm run selftest:console
npm run selftest:arcade
npm run selftest:relay
npm run build
```

`selftest:console` sprawdza walidację preferencji, zakresy rozmiaru/wysokości, omijanie niedostępnych gier, zawijanie biblioteki, wspólną paletę oraz priorytety i fallback haptyki. `selftest:arcade` zawiera regresję stanu `lab` bez wybranej gry i przesyłanie odliczania/pauzy.

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
- Library: with no pads, show pairing only once the room is available; local play must remain available while connecting. With connected pads, prioritise roster and next step, leaving “Dodaj kolejny pad” available. At four pads use “Zarządzaj padami”; after disconnect return to the appropriate state. “Połączono” is transport state, not a player ready vote.
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

- Only the selected playable game has a preview element. No engine runs in the menu: files are captured offline by `scripts/previews/capture.mjs`; provenance and regeneration instructions live in `public/previews/README.md`.
- Desktop autoplay waits 900 ms after eligibility to avoid downloads while browsing quickly. It requires an intersecting preview, a visible tab, fine pointer/900px viewport, no overlay, no reduced-motion preference, and no detected Save-Data/2G/3G connection. Mobile/reduced-motion users may explicitly request playback.
- A persistent settings switch disables automatic playback. Each clip has a keyboard-accessible play/pause button; pausing returns to the original cover. Unselected/offscreen/hidden/covered previews are removed and their media resources released. Source changes never run two clips together.
- Check all three actual video decoders, MP4/WebM fallback, no audio, missing-file fallback, rejected autoplay, rapid selection, below-fold scroll, settings/connection/lab overlays and page visibility. Broken video must never block “Uruchom grę”.
- Browser regression verified decoded video dimensions and playback, one video/no canvases, pause/manual restart, settings, hidden tab, manual phone playback, reduced-motion/no automatic video requests, 390px overflow, and aborted-source fallback followed by launching the game.
- Safari/physical TV decoder performance and data-saver API availability still depend on the device. Absence of the network-information API is not interpreted as proof of a fast connection; mobile remains manual through viewport/pointer gating.

### Background gameplay and clear Neon tire effects

Recordings now occupy the full menu wallpaper, not a separate inset. Selection-tile artwork is unchanged. The selected cover is retained as the paused/loading/error background. Playback controls live in the top navigation, while the video remains behind the interactive UI. Lighter gradients preserve the scene at the centre/right and protect left-aligned copy; verify bright tank terrain and dark space/race scenes separately. Keep all previous autoplay, one-video, reduced-motion and data-saving checks.

Neon drift smoke and wet-road spray now use time-based emission probability, smaller particles, shorter lifetimes and per-emitter opacity. This changes the real production scene as well as the regenerated race recording. Other emitters keep opacity 1 by default; sparks, boosts and collision effects are not globally dimmed. Capture frames show a clear road instead of the previous tyre fog. Particle selftest covers opacity/defaults/expiry; physical GPU performance still needs device testing.
