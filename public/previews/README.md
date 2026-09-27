# JoyPad menu recordings

These are silent recordings of the repository's own game engines, not generated artwork or live background games. Existing illustrated selection tiles remain unchanged. The recording fills the menu background; the illustration is its loading/paused/error fallback.

| File stem | Engine | Recorded setup |
| --- | --- | --- |
| `tanks` | `src/game/engine.ts` | Desert, four built-in bots, deathmatch |
| `race` | `src/arcade/neon/NeonRushScene.ts` | Neon city, four karts; built-in AI also drives the camera kart |
| `orbit` | `src/arcade/starclash/Game.ts` | Two AI teams, camera follows an AI ship; fleets start closer to show combat in a short excerpt |

Each excerpt is 8 seconds, **1920×1080 at 24 fps** (CAPTURE_FPS=30 records 25% more frames if the extra smoothness is worth the capture time and file size). MP4 (H.264 High/yuv420p/faststart, CRF 19) and WebM (VP9, CRF 31) provide codec alternatives; the browser chooses one format, not both. Neither has an audio track. Loop boundaries are cuts, not seamless simulations.

## Why the files are this size

The engines render at native Full HD — the canvas is 1920×1080 and every frame is grabbed at that size, so nothing is rendered small and upscaled later. That is what makes the preview hold up on a TV instead of turning into mush; both the recorder (it refuses a canvas that is not native Full HD) and the console selftest (it reads the MP4 track dimensions out of the `stsd` box) enforce it, so a future re-record cannot silently shrink the masters. A clip is 0.6–8 MB depending on how much motion the scene contains; the three MP4 files together stay under 30 MB, which the selftest also checks.

On screen the recording is fitted to its own 16:9 shape, never cropped: a small laptop, a 16:10 monitor and a 21:9 TV all show the whole frame, with the game's cover artwork blurred behind it. Details of the presentation and autoplay rules: [docs/console-testing.md](../../docs/console-testing.md).

## Regenerate

Start the Vite dev server. Install Playwright and its Chromium in your development environment and provide FFmpeg with libx264/libvpx-vp9. These capture-only tools are not application dependencies.

```sh
BASE_URL=http://localhost:5173 FFMPEG_PATH=/path/to/ffmpeg node scripts/previews/capture.mjs
# Optional: CAPTURE_GAME=tanks|race|orbit, CAPTURE_SECONDS=4, CAPTURE_FPS=30, CAPTURE_TIMEOUT=300000
# Optional: CHROMIUM_PATH=/path/to/chromium
# Sandbox-only optional browser: CAPTURE_SPARTICUZ=1, with @sparticuz/chromium installed
```

The recorder creates an isolated page, imports engines directly, advances simulation in fixed steps and writes temporary JPEG frames beneath `.cache/preview-frames/`. Each frame is a compositor screenshot of the engine canvas: for WebGL scenes that is the only fast path, because encoding a GPU canvas in page context costs seconds per frame. Each format is encoded at the end of a clip, so a clip is either fully replaced or untouched. It does not open a real player session or store scores/preferences. Only compressed final clips belong in `public/previews/`; never commit the frames. The files keep stable names, so bump `PREVIEW_REVISION` in `src/console/GamePreview.tsx` after a re-record — otherwise browsers and CDNs keep serving the previous recording. Recording setup uses existing AI and changes no production engine code.

Software rendering (CI containers, sandboxes) takes roughly 0.5 s per frame for the 2D tank battle and several seconds per frame for the WebGL scenes, so a full run can take about an hour there; on a machine with a GPU it is much faster.
