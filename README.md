# StalowyFront — Przeglądarkowa gra w czołgi 🛡️

Lokalny multiplayer 2–4 graczy na jednym ekranie: klawiatura **lub telefony jako bezprzewodowe joysticki**.

## 🎮 Granie

- **Komputer / TV**: otwórz stronę gry, wybierz tryb i mapę.
- **Telefon jako pad**: na komputerze kliknij **📱 TELEFON JAKO PAD** → pojawi się kod QR i 5‑znakowy kod.
  Na telefonie zeskanuj QR (lub wejdź na tę samą stronę z `#pad` i wpisz kod). Telefon dostaje pierwszy wolny slot gracza.
  - Lewa połowa ekranu: analogowy joystick — dotknij **gdziekolwiek** po lewej, a gałka pojawi się pod kciukiem.
    Prawa strona: wielki przycisk **OGIEŃ** (przytrzymaj = seria).
  - Dwa tryby sterowania (przełącznik nad joystickiem, wybór zapamiętuje się na telefonie):
    - **KIERUNEK** (domyślny) — czołg jedzie tam, gdzie pchasz gałkę: w dół = w dół ekranu, w lewo = w lewo.
      Kadłub sam obraca się w stronę jazdy, więc nie trzeba pamiętać, gdzie jest przód czołgu.
    - **CZOŁG** — klasyczne sterowanie: góra = przód, dół = wsteczny, lewo/prawo = obrót kadłuba.
  - Wibracje przy strzale, trafieniu, zniszczeniu i bonusach; HUD z HP, fragami i czasem.
  - Połączenie działa peer‑to‑peer (WebRTC / PeerJS). Komputer i telefon potrzebują internetu, ale mogą być
    w **różnych sieciach** (Wi‑Fi ↔ LTE): łączenie idzie „na wyścig” — równolegle z próbami P2P telefon łączy się
    z awaryjnym przekaźnikiem (publiczny broker MQTT, zero konfiguracji), a wygrywa ten transport, który pierwszy
    dostarczy połączenie. Najniższe opóźnienia daje WebRTC; przekaźnik jest gwarancją, że gra po prostu się połączy.
    Na telefonie (i w panelu hosta) widać, przez którą ścieżkę idzie pad.
  - Łączenie jest cierpliwe i samo się naprawia: każdy etap (serwer sygnalizacji → pokój → WebRTC) ma własny limit czasu,
    nieudane próby są ponawiane z rosnącym opóźnieniem, a zerwane połączenie telefon odbudowuje automatycznie
    (zawieszony pad po 10 s bez sygnalizacji zwalnia slot). Kod pokoju nie zmienia się przy ponowieniach,
    więc raz zeskanowany QR pozostaje ważny.
  - Gdy coś nie działa, w panelu na komputerze i na ekranie telefonu jest przycisk **🩺 Sprawdź połączenie** —
    testuje przeglądarkę, serwer sygnalizacji, STUN, TURN **oraz awaryjny przekaźnik**, i mówi wprost, co blokuje łączność.
  - Własny PeerServer (gdyby publiczny broker był niedostępny): dodaj `?srv=host:port/ścieżka` do adresu gry, np.
    `…/StalowyFront/?srv=peer.mojadomena.pl:443/peerjs`. Ustawienie zapamiętuje się na telefonie (`#pad=KOD&srv=…` też działa).
- Klawiatura wciąż działa równolegle: gracz 1 = `WSAD` + `Q/Spacja`, gracz 2 = strzałki + `Enter`, gracz 3 = `TFGH` + `R`, gracz 4 = `IJKL` + `U`. `P`/`ESC` = pauza.

## 🚀 GitHub Pages

Workflow GitHub Actions leży w **`.github/workflows/deploy.yml`** — przy każdym pushu na `main` buduje grę
i publikuje ją na GitHub Pages (w repo: **Settings → Pages → Build and deployment → Source: „GitHub Actions”**,
już ustawione).

Gra jest dostępna pod `https://<użytkownik>.github.io/StalowyFront/` (base URL jest ustawiany automatycznie z nazwy repozytorium).

### Łączenie „zawsze i wszędzie” (Wi‑Fi ↔ LTE)

Gra łączy urządzenia w trzech warstwach, od najlepszej do awaryjnej:

1. **WebRTC P2P** — bezpośrednio między urządzeniami; przechodzi, gdy sieć nie blokuje UDP/TURN.
2. **TURN** — przekaźnik WebRTC (gdy NAT jest trudny, np. telefon na LTE).
3. **Awaryjny przekaźnik (bez konfiguracji)** — gdy WebRTC/TURN nie przechodzi, gra leci przez publicznego
   brokera MQTT‑over‑WebSocket (hivemq → emqx → mosquitto, próbowani po kolei). Host stale podsłuchuje temat
   pokoju, telefon łączy się tam równolegle z próbami P2P. Działa z dowolnej sieci, bo to zwykłe połączenie
   wychodzące (wss://). Ruch jest minimalny (stan joysticka ~50 B, kilka razy/s), więc publiczny broker wystarczy.

W testach **🩺 Sprawdź połączenie** widoczne są osobno kroki **TURN (przekaźnik)** i **Awaryjny przekaźnik
(Wi‑Fi ↔ LTE)** — ten drugi jest gwarancją zerowej konfiguracji.

Jeśli chcesz najszybsze łączenie między sieciami, dodaj własny TURN — na trzy sposoby:

- **Adres strony (bez przebudowy)**: `?turn=turn:turn.example.com:3478,turns:turn.example.com:5349`
  + opcjonalnie `?turnUser=…` i `?turnPass=…`. Jak `?srv=`, ustawienie zapamiętuje się na urządzeniu,
  a kod QR przenosi je automatycznie na telefony.
- **Sekrety repozytorium (build)**: w **Settings → Secrets and variables → Actions** dodaj
  `VITE_TURN_URLS` (adresy przecinkiem, np. `turn:turn.example.com:3478,turns:turn.example.com:5349`),
  `VITE_TURN_USERNAME`, `VITE_TURN_CREDENTIAL` — workflow przekaże je do buildu automatycznie.
- **Lokalnie**: te same wartości w pliku `.env.local` w katalogu projektu (ignorowany przez Git).

Dane dostępowe TURN są z natury widoczne dla klienta WebRTC, więc używaj konta krótkotrwałego
albo objętego limitem transferu (np. darmowy [Metered Open Relay](https://www.metered.ca/tools/openrelay/)
z kluczem API, albo coturn na własnym VPS). Wbudowany wspólny Open Relay to tylko rezerwa —
jest usługą współdzieloną i bywa, że nie zwróci kandydata `relay`; wtedy grę i tak podłapie warstwa awaryjna.

## 🛠️ Rozwój lokalny

```bash
npm install
npm run dev       # http://localhost:5173  (tryb pada: http://localhost:5173/#pad)
npm run build     # typecheck + build do dist/
npm run preview
```

Stack: Vite 7, React 19, TypeScript, Tailwind 4, PeerJS, qrcode. Grafika i fizyka na Canvas 2D (`src/game/engine.ts`).
