# JoyPad menu recordings

These are silent recordings of the repository's own game engines, not generated artwork or live background games. Existing illustrated selection tiles remain unchanged. The recording fills the menu background; the illustration is its loading/paused/error fallback.

| File stem | Engine | Recorded setup |
| --- | --- | --- |
| `tanks` | `src/game/engine.ts` | Desert, four built-in bots, deathmatch |
| `race` | `src/arcade/neon/NeonRushScene.ts` | Neon city, four karts; built-in AI also drives the camera kart. Re-recorded after reducing production tire smoke and rain spray |
| `orbit` | `src/arcade/starclash/Game.ts` | Two AI teams, camera follows an AI ship; fleets start closer to show combat in a short excerpt |

Each excerpt is 8 seconds, 640×360 at 24 fps. MP4 (H.264/yuv420p/faststart) and WebM (VP9) provide codec alternatives. Neither has an audio track. The browser chooses one format, not both. Loop boundaries are cuts, not seamless simulations.

## Regenerate

Start the Vite dev server. Install Playwright and its Chromium in your development environment and provide FFmpeg with libx264/libvpx-vp9. These capture-only tools are not application dependencies.

```sh
BASE_URL=http://localhost:5173 FFMPEG_PATH=/path/to/ffmpeg node scripts/previews/capture.mjs
# Optional: CAPTURE_GAME=tanks|race|orbit, CHROMIUM_PATH=/path/to/chromium
# Sandbox-only optional browser: CAPTURE_SPARTICUZ=1, with @sparticuz/chromium installed
```

The recorder creates an isolated page, imports engines directly, advances simulation in fixed steps and writes temporary JPEG frames beneath `.cache/preview-frames/`. It does not open a real player session or store scores/preferences. Only compressed final clips belong in `public/previews/`; never commit the frames. Recording setup uses existing AI and changes no production engine code.
