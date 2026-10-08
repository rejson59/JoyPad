/**
 * Testy filmu „Poznaj JoyPad" — bez przeglądarki, bez DOM, bez sieci.
 *
 * Sprawdzają to, co da się zepsuć przy dopisywaniu scen: czy os czasu zgadza
 * się z długościami, czy `cue` nie wycieka poza scenę, czy każdy `view` ma
 * swoją implementację, czy tryb statyczny ma komplet klatek i czy teksty
 * istnieją w obu językach. Obraz ocenia człowiek — kontrakt pilnuje maszyna.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { filmScript, pick, FILM_VERSION } from '../src/cinema/script';
import {
  buildTimeline, cameraAt, chaptersOf, cueStates, downgradeTier, ease, formatClock, qualityTier, readTierEnv,
  resolveFrame, scoreEvents, storyboard, validateScript,
} from '../src/cinema/timeline';
import { sanitizeCinemaPrefs, shouldAskOnStart, defaultCinemaPrefs, setCinemaPrefs, getCinemaPrefs } from '../src/cinema/store';

const timeline = buildTimeline(filmScript.scenes);

/* --- SCRIPT: kontrakt autora ------------------------------------------- */

const problems = validateScript(filmScript.scenes);
assert.deepEqual(problems, [], `skrypt filmu ma błędy:\n${problems.join('\n')}`);
assert.equal(filmScript.version, FILM_VERSION);
assert.ok(filmScript.scenes.length >= 6, 'film ma mniej niż sześć scen');
assert.ok(new Set(filmScript.scenes.map(scene => scene.id)).size === filmScript.scenes.length, 'sceny muszą mieć unikalne id');
for (const scene of filmScript.scenes) {
  assert.ok(scene.chapter.pl && scene.chapter.en, `${scene.id}: rozdział bez obu języków`);
  assert.ok(scene.cues.length >= 1, `${scene.id}: scena bez ani jednego cue`);
  assert.ok(scene.camera.length >= 1, `${scene.id}: scena bez ruchu kamery (choćby klatki startowej)`);
}
console.log('FILM SCRIPT SELFTEST: OK (identyfikatory, czasy, języki, kamera i dźwięk wszystkich scen)');

/* --- VIEWS: każda scena ma swoją implementację -------------------------- */

// Sceny czytamy jako źródło (nie importujemy): komponentów nie da się uruchomić
// w Node bez DOM-u, a interesuje nas kontrakt — nie render.
const sceneSource = readFileSync(new URL('../src/cinema/scenes.tsx', import.meta.url), 'utf8');
const registryAt = sceneSource.indexOf('SCENE_VIEWS:');
assert.ok(registryAt > 0, 'brak rejestru SCENE_VIEWS w scenes.tsx');
const registry = sceneSource.slice(registryAt, registryAt + 900);
const views = ['coldOpen', 'library', 'pair', 'handoff', 'play', 'split', 'moments', 'outro'] as const;
for (const scene of filmScript.scenes) {
  assert.ok(views.includes(scene.view), `${scene.id}: nieznany view „${scene.view}"`);
  assert.ok(registry.includes(`${scene.view}:`), `${scene.id}: brak komponentu dla view „${scene.view}" w rejestrze`);
}
for (const view of views) assert.ok(registry.includes(`${view}:`), `rejestr nie zna widoku ${view}`);
const used = [...sceneSource.matchAll(/readCue\(frame, '([a-zA-Z0-9]+)'\)/g)].map(match => match[1]);
assert.ok(used.length > 20, 'sceny nie czytają cue — coś jest nie tak z szablonem');
const declared = new Set(filmScript.scenes.flatMap(scene => scene.cues.map(cue => cue.id)));
const missing = [...new Set(used)].filter(id => !declared.has(id));
assert.deepEqual(missing, [], `sceny czytają cue, których nie ma w skrypcie: ${missing.join(', ')}`);
console.log('FILM VIEWS SELFTEST: OK (rejestr scen i wszystkie odczytywane cue istnieją w skrypcie)');

/* --- TIMELINE: suma czasów i granice scen ------------------------------ */

assert.equal(timeline.scenes[0].startMs, 0);
assert.equal(timeline.total, filmScript.scenes.reduce((sum, scene) => sum + scene.ms, 0));
for (let index = 1; index < timeline.scenes.length; index++) {
  assert.equal(timeline.scenes[index].startMs, timeline.scenes[index - 1].endMs, 'sceny muszą do siebie przylegać');
}
const first = resolveFrame(timeline, 0);
assert.equal(first.index, 0);
assert.equal(first.t, 0);
assert.ok(first.veil > .9, 'pierwsza klatka zaczyna się od zasłony (dip z czerni)');
for (const scene of timeline.scenes) {
  assert.equal(resolveFrame(timeline, scene.startMs).index, scene.index);
  assert.equal(resolveFrame(timeline, Math.max(0, scene.endMs - 1)).index, scene.index);
}
assert.equal(resolveFrame(timeline, timeline.total + 5000).finished, true, 'za końcem filmu klatka jest domknięta');
let previous = -1;
for (let ms = 0; ms <= timeline.total; ms += 250) {
  const frame = resolveFrame(timeline, ms);
  assert.ok(frame.progress >= previous, 'postęp filmu nie może się cofać');
  assert.ok(frame.veil >= 0 && frame.veil <= 1, 'zasłona poza zakresem 0..1');
  previous = frame.progress;
}
assert.equal(formatClock(0), '0:00');
assert.equal(formatClock(62000), '1:02');
console.log('FILM TIMELINE SELFTEST: OK (przyleganie scen, granice, zasłona na stykach, monotoniczny postęp)');

/* --- CUES: opóźnienia, retriggery, wyjścia ----------------------------- */

const handoff = timeline.scenes.find(scene => scene.id === 'handoff');
assert.ok(handoff);
const beforeImpact = cueStates(handoff, 1000);
assert.equal(beforeImpact.impact.on, false);
assert.equal(beforeImpact.impact.p, 0);
const atImpact = cueStates(handoff, 2400);
assert.ok(atImpact.impact.p > 0 && atImpact.impact.p <= 1, 'cue po czasie musi mieć dodatni postęp');
assert.ok(atImpact.ripple.on, 'drugi cue tej samej chwili też musi wystartować');
const done = cueStates(handoff, handoff.ms - 1);
assert.equal(done.ripple.v, 0, 'cue z `fade` musi zgasnąć przed końcem sceny');
assert.equal(done.splat.v, 1, 'cue bez `fade` zostaje do końca sceny (bryła farby nie znika)');
const library = timeline.scenes.find(scene => scene.id === 'library');
assert.ok(library);
const hop0 = cueStates(library, 1300).focus;
const hop1 = cueStates(library, 2700).focus;
const hop2 = cueStates(library, 3800).focus;
assert.deepEqual([hop0.repeat, hop1.repeat, hop2.repeat], [0, 1, 2], 'ten sam cue musi raportować kolejne powtórzenia');
const preFocus = cueStates(library, 100).focus;
assert.equal(preFocus.on, false, 'przed czasem cue nie może być włączony');
assert.equal(preFocus.p, 0);
assert.equal(cueStates(library, 100).shelf.on, true, 'cue od zera jest włączony od pierwszej klatki');
assert.equal(pick(filmScript.scenes[0].chapter, 'en'), 'Start');
assert.equal(pick(filmScript.scenes[0].chapter, 'pl'), 'Start');
console.log('FILM CUES SELFTEST: OK (czas wejścia, powtórzenia tego samego id, wygaszanie po `fade`, pusty stan przed cue)');

/* --- CAMERA: interpolacja i krzywe ------------------------------------- */

const libraryAt = (ms: number) => cameraAt(library, ms);
const start = libraryAt(0);
const end = libraryAt(library.ms);
assert.notEqual(start.x, end.x, 'kamera w bibliotece musi się przesuwać');
assert.equal(libraryAt(library.ms / 2).scale <= Math.max(start.scale, end.scale) + .001, true, 'skala nie skacze ponad klatki kluczowe');
assert.equal(ease('linear', .5), .5);
assert.equal(ease('step', 0), 0);
assert.equal(ease('step', .4), 1);
assert.ok(ease('outBack', .55) > 1, 'outBack rozciąga KSZTAŁT ponad cel — dlatego pozycje trzeba zaciskać');
for (const curve of ['outCubic', 'outQuint', 'outExpo', 'outBack', 'inOut', 'inQuad'] as const) {
  assert.equal(ease(curve, 0), 0, `${curve}: początek krzywej musi być zerem`);
  assert.ok(Math.abs(ease(curve, 1) - 1) < 1e-9, `${curve}: koniec krzywej musi być jedynką`);
  let last = -1;
  for (let step = 0; step <= 1.0001; step += .05) {
    const value = ease(curve, step);
    assert.ok(value >= last - .35, `${curve}: krzywa nie może zjeżdżać w dół (bez odbić)`);
    last = value;
  }
}
console.log('FILM CAMERA SELFTEST: OK (klatki kluczowe, monotoniczne krzywe bez odbić, zamknięte końce)');

/* --- QUALITY: wybór wersji i degradacja -------------------------------- */

assert.equal(qualityTier({ reduced: true, cores: 16, memory: 16 }), 'static', 'ograniczony ruch = wersja statyczna');
assert.equal(qualityTier({ reduced: false, cores: 2 }), 'lite');
assert.equal(qualityTier({ reduced: false, cores: 16, memory: 2 }), 'lite');
assert.equal(qualityTier({ reduced: false, saveData: true, cores: 16, memory: 16 }), 'lite');
assert.equal(qualityTier({ reduced: false, slowLink: true, cores: 16, memory: 16 }), 'lite');
assert.equal(qualityTier({ reduced: false, smallScreen: true, cores: 16, memory: 16 }), 'lite');
assert.equal(qualityTier({ reduced: false, cores: 8, memory: 8 }), 'high');
assert.equal(downgradeTier('high'), 'lite');
assert.equal(downgradeTier('lite'), 'static');
assert.equal(downgradeTier('static'), 'static');
const env = readTierEnv();
assert.ok(['high', 'lite', 'static'].includes(qualityTier(env)), 'rozpoznanie środowiska musi dać znany tryb');
console.log('FILM QUALITY SELFTEST: OK (dostępność przed wydajnością, degradacja high → lite → static)');

/* --- STORYBOARD: wersja statyczna kompletna ---------------------------- */

const shots = storyboard(timeline);
assert.equal(shots.length, timeline.scenes.length, 'storyboard musi mieć klatkę na każdą scenę');
let shotCursor = -1;
for (const shot of shots) {
  assert.ok(shot.at > shotCursor, 'klatki storyboardu muszą iść w kolejności');
  shotCursor = shot.at;
  assert.ok(shot.at >= shot.scene.startMs && shot.at < shot.scene.endMs, `${shot.scene.id}: poster poza sceną`);
  assert.ok(shot.ms >= 3200 && shot.ms <= 5200, `${shot.scene.id}: nieprawidłowy czas postoju klatki`);
}
const chapters = chaptersOf(timeline);
assert.equal(chapters.length, timeline.scenes.length);
assert.ok(chapters.every(chapter => chapter.title.pl && chapter.title.en));
console.log('FILM STORYBOARD SELFTEST: OK (jedna klatka na scenę, kolejność i czas postoju wersji statycznej)');

/* --- SCORE: plan dźwięku ---------------------------------------------- */

const score = scoreEvents(filmScript.scenes);
assert.equal(score[0].kind, 'hum', 'film zaczyna się od tła');
let scoreCursor = -1;
for (const event of score) {
  assert.ok(event.atMs >= scoreCursor, 'zdarzenia dźwięku muszą być posortowane');
  assert.ok(event.atMs <= timeline.total, `dźwięk ${event.kind} po końcu filmu`);
  assert.ok(event.gain > 0 && event.gain <= 1, `dźwięk ${event.kind} poza skalą głośności`);
  scoreCursor = event.atMs;
}
assert.ok(score.length >= filmScript.scenes.length, 'każda scena powinna mieć choć jeden dźwięk');
console.log('FILM SCORE SELFTEST: OK (posortowany plan, głośności w skali, nic poza końcem filmu)');

/* --- PREFS: pamięć pytania i odpowiedzi ------------------------------- */

assert.deepEqual(sanitizeCinemaPrefs(null), defaultCinemaPrefs);
assert.equal(sanitizeCinemaPrefs({ plays: -3 }).plays, 0);
assert.equal(sanitizeCinemaPrefs({ plays: 1e9 }).plays, 9999);
assert.equal(sanitizeCinemaPrefs({ version: -1 }).version, 0);
assert.equal(sanitizeCinemaPrefs({}).askOnStart, true);
assert.equal(sanitizeCinemaPrefs({ askOnStart: false }).askOnStart, false);
assert.equal(sanitizeCinemaPrefs({ answered: 'yes' as unknown as boolean }).answered, false);
assert.equal(shouldAskOnStart({ ...defaultCinemaPrefs, answered: false }), true, 'pierwsze wejście zawsze pyta');
assert.equal(shouldAskOnStart({ ...defaultCinemaPrefs, answered: true, askOnStart: true }), true);
assert.equal(shouldAskOnStart({ ...defaultCinemaPrefs, answered: true, askOnStart: false }), false, 'jedno „nie" wystarczy');
setCinemaPrefs({ plays: 2, answered: true, askOnStart: false });
assert.equal(getCinemaPrefs().plays, 2);
assert.equal(shouldAskOnStart(), false);
setCinemaPrefs(defaultCinemaPrefs);
console.log('FILM PREFS SELFTEST: OK (pierwsze wejście, decyzja użytkownika, odporne na śmieci w pamięci)');
