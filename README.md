<div align="center">

<img src="public/brand/joypad-mark.svg" alt="JoyPad" width="120" />

# JoyPad 🎮

**Matowa konsola do wspólnej gry na jednym ekranie.**
Telefon jest bezprzewodowym kontrolerem, komputer lub TV wyświetla grę.
Bez kont, bez instalacji, bez uprawnień — wszystko w przeglądarce.

`v1.8` · JoyPad OS 02 · PL / EN

</div>

<img src="public/images/og-cover.jpg" alt="Stalowy Front — bitwa czołgów" width="100%" />

---

## Spis treści

1. [Jak to działa](#jak-to-działa)
2. [Gry](#gry)
3. [Szybki start dla graczy](#szybki-start-dla-graczy)
4. [Telefon jako pad](#telefon-jako-pad)
5. [Dla developerów](#dla-developerów)
6. [Połączenie i prywatność](#połączenie-i-prywatność)
7. [Publikacja na GitHub Pages](#publikacja-na-github-pages)
8. [Dokumentacja](#dokumentacja)

---

## Jak to działa

| Krok | Co się dzieje |
| --- | --- |
| **1. Otwórz JoyPad na dużym ekranie** | Komputer lub TV z przeglądarką. Pokój z pięcioznakowym kodem otwiera się automatycznie, obok widoczny jest QR. |
| **2. Telefony skanują QR** | Każdy gracz otwiera link aparatem (albo stronę z `#pad`) i wpisuje kod pokoju + opcjonalny nick. Żadnych kont ani aplikacji ze sklepu. |
| **3. Graj** | Pierwszy podłączony telefon zostaje administratorem: wybiera grę, ustawienia, startuje rundę i pauzuje. Pozostałe telefony to pady. Rola admina przechodzi dalej, gdy odejdzie. |

**Bez telefonów też zagra.** Gry można wybrać myszką/klawiaturą, a sterowanie odbywa się z klawiatury. Poniżej w [Szybkim starcie](#szybki-start-dla-graczy).

### Najważniejsze cechy

- **4 grywalne gry** (opis poniżej) — od bitew czołgów po wyścigi 3D; 1–4 graczy + boty, wspólna arena lub split-screen.
- **Telefon to pad** — gałka, przyciski akcji, wibracje; dwa układy ([minimalny / twin-stick](#telefon-jako-pad)) przełączane w trakcie gry.
- **Moments** — po rundzie do trzech prawdziwych nagrań najlepszych akcji, z galerią, pobieraniem i udostępnianiem. Nagrywane lokalnie z obrazu silnika, bez kamery i mikrofonu.
- **Wspólny wieczór** — „Jestem gotowy", „Chcę rewanżu", propozycje następnej gry od telefonów (zatwierdza gospodarz), pamięć ostatniej gry i ustawień.
- **System konsoli** — czytelna biblioteka, panele (ustawienia, pomoc, pauza, połączenia), powiadomienia, dźwięki nawigacji, JoyLab („poznaj swój pad"), nagrania rozgrywki botów jako tło biblioteki.
- **Pełne PL/EN** — interfejs, komunikaty pada i HUD-y wszystkich gier.
- **Respektuje urządzenie** — profile jakości ograniczające DPR, ograniczenie ruchu (także systemowe), profile Android/iPhone, lokalne preferencje sterowania i haptyki.

---

## Gry

| # | Gra | Co się dzieje | Telefon |
| --- | --- | --- | --- |
| 01 | **Stalowy Front** | Bitwy czołgów: 3 mapy, rykoszety, niszczalne osłony, bonusy i boty | Jazda + wieża + ogień (twin-stick) |
| 02 | **Neonowy Pęd** | Wyścig 3D nocnego miasta: mokry tor, drifty, rampy, turbo, itemy, split-screen | Kierunek jazdy + akcja (bonus/turbo) |
| 03 | **Orbitalna Fala** | Kooperacyjna obrona przed falami dronów i asteroid; życia, osłony, naprawy, szybki ogień | Lot + celowanie + strzał |
| 04 | **Wężowy Wir** | Taktyczna stalowa arena 2D: impulsy, energia, sprint i eliminacja — wygrywa ostatni żywy wąż | Cztery kierunki + sprint |
| 05 | **Nitro League** | Car-soccer 3D: 1–4 graczy + boty, split-screen, reflektory, wspomagania trudności, złoty gol | Kierunek jazdy + skok + turbo |
| 06 | *BlockCraft* | 🚧 Zapowiedź sandboxa z budowaniem z bloków | — |

Każda gra ma własny ekran wejścia, zasady, ustawienia rundy (np. limit punktów, liczba botów), HUD i ekran wyników. Silniki ładują się leniwie dopiero po wybraniu gry.

---

## Szybki start dla graczy

1. Otwórz JoyPad na komputerze lub TV.
2. Zeskanuj QR telefonem (albo wejdź na tę samą stronę z `#pad`, wpisz kod pokoju).
3. Wybierz grę i ustawienia, naciśnij START.

### Sterowanie klawiaturą (gdy nie ma telefonów)

| Gracz | Ruch | Akcja |
| --- | --- | --- |
| 1 | `WSAD` | `Q` / `Spacja` |
| 2 | Strzałki | `Enter` |
| 3 | `TFGH` | `R` |
| 4 | `IJKL` | `U` |

`P` / `Esc` — pauza. W menu: strzałki + `Enter`, `Tab` obsługuje wszystkie przyciski. Fizyczny gamepad obsługuje bibliotekę (krzyżak/gałka, A/B), ale nie zastępuje sterowania w silnikach gier.

**Warto wiedzieć:** nick zmienisz w sekcji **TWÓJ NICK** bez rozłączania · telefony podłączone w trakcie rundy dołączą od kolejnej · „Zagraj ponownie" przygotowuje nową rundę, nie wznawia meczu · kod pokoju i połączenie przeżywają zmianę gry.

---

## Telefon jako pad

- **Dwa układy** (przełączane w trakcie rundy, zapamiętywane lokalnie):
  - **Minimalny** — jedna duża pływająca gałka + jeden przycisk; gra jedną ręką. W Orbitalnej Fali celowanie samo wybiera najbliższy cel.
  - **Twin-stick** — jazda + niezależne celowanie; w Stalowym Froncie dodatkowo auto-ogień i zamiana stron joyesticków.
- **Ergonomia:** rozmiar sterowania, wysokość stref kciuków, strona przycisku akcji, tryb ruchu i haptyka (wyłączona / subtelna / wyraźna) — wszystko zapamiętywane na telefonie.
- **Profil urządzenia:** Android, iPhone / iPad lub Automatycznie. Profil iOS utrzymuje gałkę w stałym miejscu i nie udaje funkcji, których nie ma.
- **Bez zbędnych uprawnień:** pad nie prosi o kamerę, mikrofon, geolokalizację ani powiadomienia. Wibracje, Wake Lock, pełny ekran i sterowanie przechyłem włączasz świadomie przyciskiem; brak wsparcia (np. wibracje w iOS Safari) jest uczciwie pokazany i nie blokuje gry.
- **Bezpieczeństwo dotyku:** przerwanie dotyku, obrót, tło i utrata sygnału zerują sterowanie; host odcina przestarzałe wejście po ok. sekundzie; telefon wracający do sesji odzyskuje slot przez 60 s.

---

## Dla developerów

### Wymagania i start

```bash
npm ci
npm run dev                 # http://localhost:5173/  |  pad: /#pad
```

### Skrypty

| Komenda | Co robi |
| --- | --- |
| `npm run dev` | Serwer deweloperski Vite |
| `npm run build` | Typecheck + produkcyjny build (`tsc --noEmit && vite build`) |
| `npm run lint` | ESLint (flat config) + reguły react-hooks |
| `npm run selftest:platform` | Uprawnienia admina, protokół pokoju, Moments, nawigacja wyników |
| `npm run selftest:replay` | Nagrywanie Moments: okna, bufory, limity, nagłówki |
| `npm run selftest:arcade` | Role, aktywny silnik, macierze WebGL2, bezpieczeństwo pada |
| `npm run selftest:console` | Preferencje, dźwięk, profile urządzeń, podglądy biblioteki |
| `npm run selftest:relay` | Warstwa MQTT / awaryjnego przekaźnika |
| `npm run selftest:v16` | Kontrakt v1.6/v1.7: galeria, notki wydania |
| `npm run test:replay` | Testy Playwright |

Każdy push/PR przechodzi workflow `ci.yml` (lint, typecheck, selftesty, build).

### Stack

Vite · React 19 · TypeScript · Canvas 2D · Three.js · raw WebGL2 · PeerJS · QRCode.
Fonty self-hostowane przez Fontsource (Black Ops One, Chakra Petch, JetBrains Mono, Outfit, Space Grotesk) — żadnych żądań do Google Fonts. Okładki w WebP; `public/manifest.webmanifest` pozwala dodać JoyPad do ekranu głównego (PWA).

### Mapa kodu

| Ścieżka | Co tam jest |
| --- | --- |
| `src/arcade/catalog.ts` | Biblioteka gier (tytuły, opisy PL/EN, flagi `wip`) |
| `src/arcade/runtime.ts` | Wspólny kontrakt rund + warstwa klawiatury/pada |
| `src/arcade/games/` | Silniki Canvas 2D: Stalowy Front (`App.tsx` + `src/game/`), fallbacki Race/Orbit, League 2D, Wężowy Wir |
| `src/arcade/neon/` | Pełny silnik 3D Neonowego Pędu (Three.js) |
| `src/arcade/starclash/` | Orbitalna Fala 3D (adapter STAR CLASH, źródła: `archive/`) |
| `src/arcade/webgl/` | Mały renderer WebGL2, macierze, low-poly geometria, `League3D` |
| `src/console/` | Warstwa JoyPad OS: biblioteka, panele, preferencje, dźwięki, style |
| `src/platform/` | Pokój, Player Pass, powiadomienia, Moments, i18n |
| `src/net/` | Transport WebRTC/MQTT, protokół sesji i komendy admina |
| `src/pad/` | Aplikacja telefonu: kontroler, joystick, haptyka, test połączenia |
| `archive/` | Zintegrowane paczki źródłowe gier (tylko referencja, patrz `archive/README.md`) |
| `scripts/` | Selftesty (`selftest:*`) i przechwytywanie podglądów |

### Zasady architektury

- Nowe silniki implementują kontrakt `RoundConfig`/`GameRound` z `src/arcade/runtime.ts` (`onHud`, `onFinish`, `onFx`, opcjonalne `onMoment`/`onFrame`) — dzięki temu Moments, HUD i wyniki działają automatycznie.
- `src/console/` nie zmienia silników fizyki ani transportu; preferencje mają klucz `joypad.console`, a zapis w pamięci jest opcjonalny (prywatny tryb nie psuje gry).
- Wersja protokołu pozostaje 1: nowe typy wiadomości są opcjonalne i ignorowane przez stare klienty. Po aktualizacji odśwież **TV i telefony**.

---

## Połączenie i prywatność

- **Ścieżka:** PeerJS / WebRTC (preferowana) → własny TURN (opcjonalny) → awaryjny przekaźnik MQTT-over-WebSocket przez publiczne brokery. Działa też między Wi‑Fi a LTE, o ile urządzenia mają internet i przynajmniej jedna z usług odpowiada.
- **GitHub Pages nie ma własnego serwera sygnalizacji** — publiczne usługi mogą czasem zawodzić. W panelu hosta i telefonu jest test „Sprawdź połączenie".
- **Własny serwer PeerJS:** dodaj `?srv=host:port/peerjs` do adresu hosta (przechodzi przez QR i zapamiętuje się na telefonie).
- **Własny TURN:** parametry `?turn=turn:host:3478,turns:host:5349` (+ `turnUser`, `turnPass`) albo zmienne builda `VITE_TURN_URLS`, `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL`. Dane TURN są widoczne dla klientów WebRTC — używaj danych krótkotrwałych lub z limitem.
- **Bezpieczeństwo pokoju:** pięcioznakowy kod + krótkotrwały klucz w QR (tylko handshake). To zabezpieczenie zaproszenia, nie system logowania — nie udostępniaj kodu nieznajomym.
- **Zero chmury:** stan pokoju, wyniki, Moments i preferencje zostają na urządzeniach. Brak serwera aplikacji.

Szczegóły uprawnień i sieci: [docs/platform-update.md](docs/platform-update.md).

---

## Publikacja na GitHub Pages

Workflow `.github/workflows/deploy.yml` buduje stronę po pushu na **main** i publikuje `dist` na Pages (Settings → Pages → **GitHub Actions**). `VITE_BASE` wylicza się z nazwy repozytorium, a link QR używa aktualnego adresu strony — po zmianie nazwy repo uruchom **Actions → Deploy to GitHub Pages → Run workflow** i zeskanuj nowy QR. Dla repo `<user>.github.io` ustaw `VITE_BASE=/` w workflow.

---

## Dokumentacja

| Dokument | Zakres |
| --- | --- |
| [docs/platform-update.md](docs/platform-update.md) | Funkcje platformy (pokój, Player Pass, Moments), uprawnienia, ograniczenia, checklisty wydania |
| [docs/game-building-prompts.md](docs/game-building-prompts.md) | Prompt dla nowych gier (Turbo League) i bezpieczna integracja ZIP |
| [docs/moments-video.md](docs/moments-video.md) | Architektura i testy nagrywania Moments |
| [docs/console-testing.md](docs/console-testing.md) | Sprawdzenia konsoli: automatyczne, sandbox, fizyczne urządzenia |
| [docs/v1.6.md](docs/v1.6.md) | Archiwalny zakres v1.6 |
| [public/previews/README.md](public/previews/README.md) | Informacje o nagraniach podglądów w bibliotece |
