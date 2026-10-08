/**
 * Test renderu filmu „Poznaj JoyPad" — bez przeglądarki, bez DOM-u.
 *
 * Filmu nie da się obejrzeć w maszynie bez Chromium, ale da się sprawdzić to,
 * co psuje się najczęściej przy dopisywaniu scen:
 *   • czy każda klatka każdej sceny w obu językach w ogóle się renderuje,
 *   • czy w geometrii (transform, ścieżki SVG, pozycje) nie ma NaN/Infinity,
 *   • czy scena pokazuje swoje charakterystyczne elementy (QR, pad, kafle…),
 *   • czy język przełącza napisy i nazwy gier,
 *   • czy wersja lekka i statyczna składają się bez wideo i bez ruchu.
 *
 * Kompozycję i smak ocenia człowiek — ten test pilnuje tylko tego, żeby nie
 * wysłać użytkownikowi pustego albo rozjechanego kadru.
 */
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { filmScript } from '../src/cinema/script';
import { buildTimeline, resolveFrame, type QualityTier, type TimedScene } from '../src/cinema/timeline';
import { FilmLanguageProvider, SCENE_VIEWS, type LiveData } from '../src/cinema/scenes';
import type { Lang } from '../src/cinema/script';

const timeline = buildTimeline(filmScript.scenes);
/** Dane „na żywo": film ma pokazać prawdę, a nie makietę — tu podstawiamy ją wprost. */
const live: LiveData = {
  qr: 'data:image/png;base64,iVBORw0KGgo=',
  code: 'JP-4K2',
  players: [{ name: 'GRACZ 1', color: '#4ade80' }, { name: 'ANIA', color: '#8dcff3' }],
  ready: true,
};

const STEP_MS = 120;
const GEOMETRY = /(?:style|transform|d|cx|cy|r|rx|ry|x|y|width|height)="([^"]*)"/g;
const problems: string[] = [];

function render(scene: TimedScene, ms: number, language: Lang, tier: QualityTier = 'high'): string {
  const View = SCENE_VIEWS[scene.view];
  return renderToStaticMarkup(
    <FilmLanguageProvider value={language}>
      <View frame={resolveFrame(timeline, ms)} scene={scene} language={language} tier={tier} live={live} deviceScale={1.5} />
    </FilmLanguageProvider>,
  );
}

/* --- Każda klatka każdej sceny w obu językach -------------------------- */

for (const scene of timeline.scenes) {
  let frames = 0;
  let withPlamek = 0;
  for (let local = 0; local < scene.ms; local += STEP_MS) {
    const frame = resolveFrame(timeline, scene.startMs + local);
    for (const value of [frame.camera.x, frame.camera.y, frame.camera.scale, frame.camera.rot, frame.veil]) {
      assert.ok(Number.isFinite(value), `${scene.id}@${local}: kamera albo zasłona ma NaN`);
    }
    for (const language of ['pl', 'en'] as const) {
      const html = render(scene, scene.startMs + local, language);
      frames++;
      if (html.length < 200) problems.push(`${scene.id}@${local}/${language}: puste drzewo`);
      for (const match of html.matchAll(GEOMETRY)) {
        if (/NaN|Infinity/.test(match[1])) problems.push(`${scene.id}@${local}/${language}: ${match[0].slice(0, 48)}`);
      }
      if (html.includes('film-plamek')) withPlamek++;
    }
  }
  console.log(`  • ${scene.id.padEnd(9)} klatek: ${String(frames).padStart(4)}   z Plamkiem: ${String(withPlamek).padStart(4)}`);
  if (['coldopen', 'handoff', 'library', 'outro'].includes(scene.id) && withPlamek === 0) {
    problems.push(`${scene.id}: Plamek nigdy nie pojawia się w kadrze`);
  }
  if (['pair', 'play', 'split', 'moments'].includes(scene.id) && withPlamek > 0) {
    problems.push(`${scene.id}: Plamek nie należy do tej sceny`);
  }
}

/* --- Podpis klatki postera: czy scena ma wszystkie swoje elementy ------- */

const poster = (id: string) => {
  const scene = timeline.scenes.find(item => item.id === id);
  assert.ok(scene, `brak sceny „${id}"`);
  return render(scene, scene.startMs + Math.round(scene.poster * scene.ms), 'pl');
};
const signatures: Record<string, { token: string; min?: number }[]> = {
  coldopen: [{ token: 'film-hero' }, { token: 'film-word' }, { token: 'film-plamek' }],
  library: [{ token: 'film-card ', min: 6 }, { token: 'film-shelf' }, { token: 'film-card-ring' }],
  pair: [{ token: 'qr-frame' }, { token: 'film-pair-steps' }, { token: 'film-phone' }, { token: 'film-pair-joined' }],
  handoff: [{ token: 'film-padui' }, { token: 'film-padui-stick' }, { token: 'film-plamek' }],
  play: [{ token: 'film-player-chip', min: 4 }, { token: 'film-countdown' }, { token: 'film-pane' }],
  split: [{ token: 'film-grid-pane', min: 4 }, { token: 'film-menu' }, { token: 'film-glass-card' }, { token: 'film-pane' }],
  moments: [{ token: 'film-scrub' }, { token: 'film-bracket' }, { token: 'film-moment-stamp' }],
  outro: [{ token: 'film-outro-word' }, { token: 'film-plamek' }, { token: 'film-chips' }],
};
for (const [id, checks] of Object.entries(signatures)) {
  const html = poster(id);
  for (const check of checks) {
    const count = html.split(check.token).length - 1;
    if (count < (check.min ?? 1)) problems.push(`${id}: brak „${check.token}" (jest ${count}, ma być ≥ ${check.min ?? 1})`);
  }
}

/* --- Kontroler lotu: jest tylko w swoim oknie, a w trybie lekkim go nie ma --- */

const handoff = timeline.scenes.find(scene => scene.id === 'handoff');
assert.ok(handoff);
const flight = render(handoff, handoff.startMs + 1500, 'pl');
assert.ok(flight.includes('film-pad-flight') && flight.includes('film-pad '), 'w czasie lotu kontroler musi być w kadrze');
const flightLite = render(handoff, handoff.startMs + 1500, 'pl', 'lite');
assert.ok(!flightLite.includes('film-pad-flight'), 'tryb lekki nie rysuje lotu kontrolera');
assert.ok(flightLite.includes('film-padui'), 'tryb lekki zachowuje pad i Plamka');

/* --- Język: te same sceny, inne napisy i nazwy gier -------------------- */

const library = timeline.scenes.find(scene => scene.id === 'library') ?? timeline.scenes[0];
const polish = render(library, library.startMs + 3000, 'pl');
const english = render(library, library.startMs + 3000, 'en');
assert.ok(polish.includes('Wybierz') && polish.includes('świat'), 'brak polskiego tytułu sceny');
assert.ok(english.includes('Choose') && english.includes('world'), 'brak angielskiego tytułu sceny');
assert.ok(polish.includes('Stalowy Front') && !polish.includes('Steel Front'), 'polskie nazwy gier nie działają');
assert.ok(english.includes('Steel Front') && !english.includes('Stalowy'), 'angielskie nazwy gier nie działają');
assert.ok(polish.includes('BEZ INSTALACJI') && english.includes('NOTHING TO INSTALL'), 'hasła nie zmieniają języka');

/* --- Wersje awaryjne: lekka i statyczna muszą się złożyć ---------------- */

for (const scene of timeline.scenes) {
  for (const tier of ['lite', 'static'] as const) {
    const html = render(scene, scene.startMs + Math.round(scene.poster * scene.ms), 'pl', tier);
    if (html.length < 200) problems.push(`${scene.id}/${tier}: puste drzewo`);
    if (/NaN|Infinity/.test(html)) problems.push(`${scene.id}/${tier}: NaN w trybie awaryjnym`);
  }
}

if (problems.length) {
  console.error('PROBLEMY:');
  for (const item of problems.slice(0, 30)) console.error('  -', item);
  process.exit(1);
}
const renders = timeline.scenes.reduce((sum, scene) => sum + Math.ceil(scene.ms / STEP_MS) * 2, 0);
console.log(`FILM RENDER SELFTEST: OK (${timeline.scenes.length} scen, ${renders} renderów w PL i EN, brak NaN, podpisy scen, język i tryby awaryjne)`);
