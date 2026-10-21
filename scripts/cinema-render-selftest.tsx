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
  keyboard: [{ token: 'film-kb-key', min: 30 }, { token: 'film-kb-tag', min: 3 }, { token: 'film-plamek' }],
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

/* --- Ładowanie: klip montuje się od wejścia w scenę, nie po cue ------------- */
/* „Za długo się wczytuje" brało się m.in. z tego, że `<video>` pojawiało się w DOM
   dopiero po przekroczeniu progu cue — czyli pobieranie startowało po czekaniu, które
   na nie czekało. Te sprawdzenia pilnują, że element jest montowany od razu. */

{
  const play = timeline.scenes.find(item => item.id === 'play');
  const split = timeline.scenes.find(item => item.id === 'split');
  assert.ok(play && split, 'brak scen z nagraniami');
  const entry = render(play, play.startMs, 'pl', 'high');
  if (!entry.includes('<video')) problems.push('play/high: brak <video> na wejściu w scenę — pobieranie klipu czeka na cue');
  const splitEntry = render(split, split.startMs, 'pl', 'high');
  if (!splitEntry.includes('<video')) problems.push('split/high: brak <video> na wejściu w scenę');
  const splitLite = render(split, split.startMs + Math.round(split.poster * split.ms), 'pl', 'lite');
  if (splitLite.includes('<video')) problems.push('split/lite: tryb lekki nie może pobierać nagrań kafli (14 MB na plakaty)');
  const staticFrame = render(play, play.startMs + 600, 'pl', 'static');
  if (staticFrame.includes('<video')) problems.push('play/static: tryb statyczny nie może pobierać nagrań');
}

/* --- Legenda sterowania: biblioteka musi uczyć, czym się po niej chodzi ------ */

{
  const scene = timeline.scenes.find(item => item.id === 'library');
  assert.ok(scene, 'brak sceny „library"');
  for (const tier of ['high', 'lite', 'static'] as const) {
    const html = render(scene, scene.startMs + Math.round(scene.poster * scene.ms), 'pl', tier);
    for (const token of ['film-controls', 'film-keycap', 'przewijaj', 'wybierz', 'wr\u00f3\u0107']) {
      if (!html.includes(token)) problems.push(`library/${tier}: brak „${token}" — legenda sterowania nie trafiła do kadru`);
    }
  }
  const english = render(scene, scene.startMs + Math.round(scene.poster * scene.ms), 'en');
  for (const token of ['scroll', 'open', 'shortcuts']) {
    if (!english.includes(token)) problems.push(`library/en: brak „${token}" — legenda nie tłumaczy się na angielski`);
  }
}

/* --- Klawiatura: pełny rekwizyt, podpisy graczy i spacja w KAŻDYM trybie ------- */

{
  const scene = timeline.scenes.find(item => item.id === 'keyboard');
  assert.ok(scene, 'brak sceny „keyboard"');
  const frameAt = (ms: number, tier: 'high' | 'lite' | 'static', language: 'pl' | 'en' = 'pl') => render(scene, scene.startMs + ms, language, tier);
  for (const tier of ['high', 'lite', 'static'] as const) {
    const html = frameAt(3600, tier);
    for (const token of ['film-kb', 'film-kb-key', 'film-kb-body']) {
      if (!html.includes(token)) problems.push(`keyboard/${tier}: brak „${token}" — rekwizyt wypadł z kadru`);
    }
    // Klawisze muszą być naprawdę na klawiaturze, nie tylko w nazwie klasy.
    const keys = (html.match(/film-kb-key/g) ?? []).length;
    if (keys < 30) problems.push(`keyboard/${tier}: klawiatura ma tylko ${keys} klawiszy`);
    for (const label of ['W', 'A', 'S', 'D', '\u2191', '\u2190', '\u2193', '\u2192', 'SPACJA', 'GRACZ 1', 'GRACZ 2', 'OGIE\u0143']) {
      if (!html.includes(label)) problems.push(`keyboard/${tier}: brak klawisza lub podpisu „${label}"`);
    }
  }
  const english = frameAt(3600, 'high', 'en');
  for (const token of ['PLAYER 1', 'PLAYER 2', 'FIRE', 'ARROWS', 'NO PHONE?', 'Or', 'keyboard.']) {
    if (!english.includes(token)) problems.push(`keyboard/en: brak „${token}"`);
  }
  const polish = frameAt(3600, 'high');
  for (const token of ['GRACZ 1', 'GRACZ 2', 'OGIE\u0143', 'STRZA\u0141KI', 'BEZ TELEFONU', 'Albo', 'klawiatura.']) {
    if (!polish.includes(token)) problems.push(`keyboard/pl: brak „${token}"`);
  }
  // Klatka plakatu = klatka trybu statycznego. Wszystko, co w niej ma być widać,
  // musi tam być naprawdę widoczne (opacity > 0), a nie tylko obecne w drzewie —
  // dokładnie na tym polegał zgłoszony błąd z rundy 19.
  const staticFrame = frameAt(Math.round(scene.poster * scene.ms), 'static');
  for (const cls of ['film-kb-note', 'film-kb-tag']) {
    const at = staticFrame.indexOf(cls);
    if (at < 0) { problems.push(`keyboard/static: brak „${cls}"`); continue; }
    const value = Number(/opacity:\s*([\d.]+)/.exec(staticFrame.slice(at, at + 220))?.[1] ?? '1');
    if (!(value > .5)) problems.push(`keyboard/static: „${cls}" ma opacity ${value} — treść jest w danych, ale widz jej nie zobaczy`);
  }

  // Fala świateł: na starcie klawisze są zgaszone, przy błysku zapalone — inaczej
  // scena nie tłumaczy niczego, tylko pokazuje klawiaturę.
  const early = frameAt(200, 'high');
  const late = frameAt(3900, 'high');
  const level = (html: string) => Number(/(?:film-kb-key[^>]*?)rgb\(255, 201, 138\)/i.test(html) ? 1 : 0);
  if (level(early) >= level(late)) problems.push('keyboard: klawisze nie zapalają się w trakcie sceny');
}

/* --- Urządzenia: telewizor, telefon i kafle są w kadrze w KAŻDYM trybie ---
   Zgłoszenie z rundy 19: „nie wszystko jest widoczne w poradniku — dopiero na trybie
   statycznym widać, co jest na urządzeniach”. Przyczyną był CSS (klatki kluczowe bez
   stanu końcowego — patrz *VISIBILITY* w `selftest:cinema`), ale ten test pilnuje
   drugiej połowy kontraktu: żaden tryb nie może w ogóle pominąć mockupu urządzenia. */

const deviceTokens: Record<string, string[]> = {
  pair: ['film-tv', 'film-phone', 'qr-frame', 'film-pair-steps'],
  handoff: ['film-phone', 'film-padui'],
  play: ['film-tv', 'film-phone', 'film-pane'],
  split: ['film-grid-pane', 'film-menu'],
};
for (const [id, tokens] of Object.entries(deviceTokens)) {
  const scene = timeline.scenes.find(item => item.id === id);
  assert.ok(scene, `brak sceny „${id}"`);
  for (const tier of ['high', 'lite', 'static'] as const) {
    const html = render(scene, scene.startMs + Math.round(scene.poster * scene.ms), 'pl', tier);
    for (const token of tokens) {
      if (!html.includes(token)) problems.push(`${id}/${tier}: brak „${token}" — urządzenie albo jego treść wypadły z kadru`);
    }
  }
}

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
