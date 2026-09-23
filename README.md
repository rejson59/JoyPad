# StalowyFront — Przeglądarkowa gra w czołgi 🛡️

Lokalny multiplayer 2–4 graczy na jednym ekranie: klawiatura **lub telefony jako bezprzewodowe joysticki**.

## 🎮 Granie

- **Komputer / TV**: otwórz stronę gry, wybierz tryb i mapę.
- **Telefon jako pad**: na komputerze kliknij **📱 TELEFON JAKO PAD** → pojawi się kod QR i 5‑znakowy kod.
  Na telefonie zeskanuj QR (lub wejdź na tę samą stronę z `#pad` i wpisz kod). Telefon dostaje pierwszy wolny slot gracza.
  - Lewa strona: analogowy joystick (jazda + obrót), prawa: wielki przycisk **OGIEŃ** (przytrzymaj = seria).
  - Wibracje przy strzale, trafieniu, zniszczeniu i bonusach; HUD z HP, fragami i czasem.
  - Połączenie działa peer‑to‑peer (WebRTC / PeerJS). Komputer i telefon potrzebują internetu, ale mogą być w różnych sieciach. Najniższe opóźnienia — gdy są w tej samej sieci Wi‑Fi.
  - Łączenie jest cierpliwe i samo się naprawia: każdy etap (serwer sygnalizacji → pokój → WebRTC) ma własny limit czasu,
    nieudane próby są ponawiane z rosnącym opóźnieniem, a zerwane połączenie telefon odbudowuje automatycznie.
    Kod pokoju nie zmienia się przy ponowieniach, więc raz zeskanowany QR pozostaje ważny.
  - Gdy coś nie działa, w panelu na komputerze i na ekranie telefonu jest przycisk **🩺 Sprawdź połączenie** —
    testuje przeglądarkę, serwer sygnalizacji, STUN i TURN, i mówi wprost, co blokuje łączność.
  - Własny PeerServer (gdyby publiczny broker był niedostępny): dodaj `?srv=host:port/ścieżka` do adresu gry, np.
    `…/StalowyFront/?srv=peer.mojadomena.pl:443/peerjs`. Ustawienie zapamiętuje się na telefonie (`#pad=KOD&srv=…` też działa).
- Klawiatura wciąż działa równolegle: gracz 1 = `WSAD` + `Q/Spacja`, gracz 2 = strzałki + `Enter`, gracz 3 = `TFGH` + `R`, gracz 4 = `IJKL` + `U`. `P`/`ESC` = pauza.

## 🚀 GitHub Pages

Gotowy workflow GitHub Actions leży w pliku **`deploy/github-pages.yml`**. Przy każdym pushu na `main` buduje grę i publikuje ją na GitHub Pages.

Konfiguracja jednorazowa (2 kroki):

1. Skopiuj plik do katalogu workflowów (bot nie ma uprawnień, żeby zrobić to sam):
   ```bash
   mkdir -p .github/workflows && cp deploy/github-pages.yml .github/workflows/deploy.yml
   git add .github && git commit -m "Dodaj workflow GitHub Pages" && git push
   ```
   (albo w GitHub: **Add file → Create new file** → nazwa `.github/workflows/deploy.yml` → wklej zawartość `deploy/github-pages.yml`).
2. W repozytorium: **Settings → Pages → Build and deployment → Source: „GitHub Actions”**.

Gra będzie dostępna pod `https://<użytkownik>.github.io/StalowyFront/` (base URL jest ustawiany automatycznie z nazwy repozytorium).

### TURN dla połączeń Wi‑Fi ↔ LTE

Wbudowany Open Relay jest usługą współdzieloną i może okresowo nie zwracać kandydata `relay`. Nie oznacza to błędu WebRTC — połączenie bezpośrednie nadal zwykle działa w tej samej sieci — ale nie daje gwarancji połączenia między różnymi sieciami.

Aby użyć własnego lub zarządzanego TURN, dodaj w **Settings → Secrets and variables → Actions** trzy sekrety repozytorium:

- `VITE_TURN_URLS` — adresy rozdzielone przecinkiem, np. `turn:turn.example.com:3478,turns:turn.example.com:5349`,
- `VITE_TURN_USERNAME`,
- `VITE_TURN_CREDENTIAL`.

Workflow przekaże je do buildu automatycznie. Dane dostępowe TURN są z natury widoczne dla klienta WebRTC, więc używaj konta krótkotrwałego albo objętego limitem transferu. Po wdrożeniu test **TURN (przekaźnik)** powinien wyświetlić kandydata `relay`.

Lokalnie te same wartości można umieścić w ignorowanym przez Git pliku `.env.local`.

## 🛠️ Rozwój lokalny

```bash
npm install
npm run dev       # http://localhost:5173  (tryb pada: http://localhost:5173/#pad)
npm run build     # typecheck + build do dist/
npm run preview
```

Stack: Vite 7, React 19, TypeScript, Tailwind 4, PeerJS, qrcode. Grafika i fizyka na Canvas 2D (`src/game/engine.ts`).
