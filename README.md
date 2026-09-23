# StalowyFront — Przeglądarkowa gra w czołgi 🛡️

Lokalny multiplayer 2–4 graczy na jednym ekranie: klawiatura **lub telefony jako bezprzewodowe joysticki**.

## 🎮 Granie

- **Komputer / TV**: otwórz stronę gry, wybierz tryb i mapę.
- **Telefon jako pad**: na komputerze kliknij **📱 TELEFON JAKO PAD** → pojawi się kod QR i 5‑znakowy kod.
  Na telefonie zeskanuj QR (lub wejdź na tę samą stronę z `#pad` i wpisz kod). Telefon dostaje pierwszy wolny slot gracza.
  - Lewa strona: analogowy joystick (jazda + obrót), prawa: wielki przycisk **OGIEŃ** (przytrzymaj = seria).
  - Wibracje przy strzale, trafieniu, zniszczeniu i bonusach; HUD z HP, fragami i czasem.
  - Połączenie działa peer‑to‑peer (WebRTC / PeerJS). Komputer i telefon potrzebują internetu, ale mogą być w różnych sieciach. Najniższe opóźnienia — gdy są w tej samej sieci Wi‑Fi.
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

## 🛠️ Rozwój lokalny

```bash
npm install
npm run dev       # http://localhost:5173  (tryb pada: http://localhost:5173/#pad)
npm run build     # typecheck + build do dist/
npm run preview
```

Stack: Vite 7, React 19, TypeScript, Tailwind 4, PeerJS, qrcode. Grafika i fizyka na Canvas 2D (`src/game/engine.ts`).
