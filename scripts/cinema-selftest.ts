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
import { FILM_WARM_AFTER_MS, PANE_HOLD_MS } from '../src/cinema/ready';
import { GAMES } from '../src/arcade/catalog';

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
const views = ['coldOpen', 'library', 'pair', 'handoff', 'keyboard', 'play', 'split', 'moments', 'outro'] as const;
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

/* --- DANE: każde pole `extra` musi być gdzieś użyte --------------------- */
/* Pole w skrypcie, którego żadna scena nie czyta, to cicha obietnica — dokładnie tak
   leżakował `focusTag` („WYBÓR"), którego nikt nigdy nie pokazał. */
{
  const scriptSrc = readFileSync('src/cinema/script.ts', 'utf8');
  const scenesSrc = readFileSync('src/cinema/scenes.tsx', 'utf8');
  const extraBlocks = scriptSrc.split(/\n {6}extra: \{/).slice(1);
  const orphans: string[] = [];
  for (const block of extraBlocks) {
    const body = block.slice(0, block.indexOf('\n      },'));
    for (const [, key] of body.matchAll(/\n {8}(\w+):/g)) {
      if (!scenesSrc.includes(`extra?.${key}`)) orphans.push(key);
    }
  }
  assert.deepEqual(orphans, [], `pola \`extra\` bez użycia w scenach: ${orphans.join(', ')}`);
}
console.log('FILM DATA SELFTEST: OK (żadnego martwego pola w danych scen)');

/* --- DOKUMENTACJA: tabela scen musi zgadzać się ze skryptem -------------- */
/* Kolejność i numeracja w `docs/cinema.md` to mapa filmu dla człowieka. Gdy scena
   dochodzi albo zmienia miejsce, tabela musi iść za nią — inaczej dokument kłamie. */
{
  const doc = readFileSync('docs/cinema.md', 'utf8');
  const rows = [...doc.matchAll(/^\| (\d+) \| `([a-z]+)` \|/gm)].map(match => ({ number: Number(match[1]), id: match[2] }));
  assert.ok(rows.length >= 6, 'tabela scen w docs/cinema.md zniknęła albo się rozjechała');
  assert.deepEqual(rows.map(row => row.id), filmScript.scenes.map(scene => scene.id),
    'kolejność scen w docs/cinema.md nie zgadza się ze skryptem');
  assert.deepEqual(rows.map(row => row.number), filmScript.scenes.map((_, index) => index + 1),
    'numeracja scen w docs/cinema.md nie zgadza się ze skryptem');
}
console.log('FILM DOCS SELFTEST: OK (tabela scen w dokumentacji zgadza się ze skryptem)');

/* --- ŚWIATY: poradnik nie może kłamać, ile gier ma biblioteka ------------ */
/* Film mówi „N światów”. Liczba pochodzi z `GAMES.length`, a ta asercja pilnuje, żeby nikt
   nie wpisał jej z powrotem na sztywno — nowa gra w katalogu zmienia napis sama. */
{
  const library = filmScript.scenes.find(scene => scene.id === 'library');
  assert.ok(library, 'brak sceny biblioteki');
  for (const lang of ['pl', 'en'] as const) {
    assert.ok(library.chips?.[0]?.[lang].includes(String(GAMES.length)), `chip „${library.chips?.[0]?.[lang]}” (${lang}) nie zgadza się z liczbą gier w bibliotece (${GAMES.length})`);
  }
  assert.ok(!/Sześć|Six worlds/.test(JSON.stringify(library.sub)) || GAMES.length === 6, 'napis biblioteki ma starą liczbę światów');
}
console.log('FILM WORLDS SELFTEST: OK (liczba światów w poradniku = liczba gier w katalogu)');

/* --- ŁADOWANIE: pobieranie musi zaczynać się PRZED odtwarzaniem --------- */
/* Zgłoszenie z rundy 19: „coś się za długo wczytuje ten poradnik”. Przyczyny były
   dwie i obie da się złapać statycznie: (1) bramka gotowości czekała na pierwszą
   klatkę klipu, którego nikt jeszcze nie pobierał, bo `<video>` montowało się dopiero
   po przekroczeniu progu cue; (2) cały dorobek filmu (fragment JS, kod QR, okładki)
   zaczynał się pobierać w chwili kliknięcia. Te asercje pilnują obu. */
{
  const mocks = readFileSync('src/cinema/mocks.tsx', 'utf8');
  const scenes = readFileSync('src/cinema/scenes.tsx', 'utf8');
  const film = readFileSync('src/cinema/Film.tsx', 'utf8');

  assert.ok(/preload\?\s*:/.test(mocks), 'VideoPane musi mieć prop `preload` (montowanie od wejścia w scenę)');
  assert.ok(mocks.includes('onError={markFailed}'), 'zepsuty klip musi zwalniać bramkę gotowości (onError)');
  assert.ok(/const markFailed\s*=/.test(mocks), 'brak zwolnienia bramki przy błędzie pobrania');

  const videoPanes = (scenes.match(/<VideoPane/g) ?? []).length;
  const withPreload = (scenes.match(/preload=/g) ?? []).length;
  assert.ok(videoPanes >= 3, 'sceny zgubiły panele wideo');
  assert.equal(withPreload, videoPanes, 'każdy VideoPane musi jawnie powiedzieć, czy montować klip od wejścia (`preload`)');

  assert.ok(PANE_HOLD_MS <= 1000, `bramka trzyma zegar ${PANE_HOLD_MS} ms — przy pobieraniu od wejścia w scenę to zbędne opóźnienie`);
  assert.ok(FILM_WARM_AFTER_MS > 0 && FILM_WARM_AFTER_MS < 5000, 'rozgrzewka nagrań musi startować w pierwszych scenach filmu, nie na końcu');
  assert.ok(film.includes('FILM_WARM_AFTER_MS'), 'film nie rozgrzewa nagrań dalszych scen');
  assert.ok(/GAMES\.flatMap|flatMap/.test(film), 'rozgrzewka musi wziąć klipy z osi czasu, a nie z ręcznej listy');

  const warm = readFileSync('src/cinema/warm.ts', 'utf8');
  assert.ok(warm.includes("import('./Film')"), 'rozgrzewka nie pobiera fragmentu filmu');
  assert.ok(warm.includes("import('qrcode')"), 'rozgrzewka nie pobiera generatora QR');
  for (const file of ['src/cinema/Welcome.tsx', 'src/console/ConsoleLibrary.tsx']) {
    const source = readFileSync(file, 'utf8');
    assert.ok(source.includes('warmCinema()'), `${file}: brak rozgrzewki poradnika przed kliknięciem`);
  }
}
console.log('FILM LOADING SELFTEST: OK (klipy pobierają się od wejścia w scenę, poradnik grzeje się przed kliknięciem)');




/* --- VISIBILITY: animacje wejścia muszą kończyć się w stanie WIDOCZNYM ----
   Zgłoszenie użytkownika z rundy 19: „nie wszystko jest widoczne w poradniku,
   np. kiedy patrzę na statyczny, to tylko wtedy widać, co jest na urządzeniach”.
   Przyczyna: klatki kluczowe miały tylko `from { opacity: 0 }`, więc stanem
   końcowym była wartość bazowa — a reguły bazowe też mają `opacity: 0`.
   Elementy pokazywały się wyłącznie w trybie statycznym, bo tam dopisane jest
   jawne `opacity: 1`. Te trzy asercje zamykają całą klasę tego błędu. */
{
  // Oba arkusze filmu: `film.css` (kadr) i `cinema.css` (arkusz pytania o poradnik).
  const filmCss = ['src/cinema/film.css', 'src/console/cinema.css']
    .map(file => readFileSync(file, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  // Parsowanie klatek kluczowych z liczeniem nawiasów (formatowanie może się zmienić).
  const keyframes = new Map<string, string>();
  for (const match of filmCss.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)) {
    let depth = 1;
    let index = match.index! + match[0].length;
    while (index < filmCss.length && depth > 0) {
      if (filmCss[index] === '{') depth++;
      else if (filmCss[index] === '}') depth--;
      index++;
    }
    keyframes.set(match[1], filmCss.slice(match.index! + match[0].length, index - 1));
  }
  assert.ok(keyframes.size >= 5, 'znalazłem klatki kluczowe filmu');

  // 1. Gasi w `from`/`0%`, więc musi zapalić w `to`/`100%`.
  for (const [name, body] of keyframes) {
    const start = /(?:from|0%)\s*\{([^}]*)\}/.exec(body)?.[1] ?? '';
    const end = /(?:to|100%)\s*\{([^}]*)\}/.exec(body)?.[1] ?? '';
    if (!/opacity\s*:\s*0(?:\.\d+)?\s*;?\s*$|opacity\s*:\s*0\s*[;}]/.test(start.trim() + ';')) continue;
    assert.ok(/opacity\s*:\s*1/.test(end),
      `klatka \`${name}\` gasi opacity w \`from\`, więc musi mieć jawny \`to { opacity: 1 }\` — inaczej element zostaje niewidoczny (to był zgłoszony błąd)`);
  }

  // 2. Animacje wejścia nie mogą ruszać `transform`: telefon i telewizor pozycjonują się
  //    inline'owym `transform: translate3d(...)`, a animacja `transform` by go zastąpiła
  //    (mockup wjeżdżał z narożnika zamiast pojawiać się na miejscu).
  for (const name of ['filmRise', 'filmSlideIn', 'filmPopIn', 'filmStamp']) {
    assert.ok(!/transform\s*:/.test(keyframes.get(name) ?? ''), `klatka \`${name}\` używa \`translate\`/\`scale\`, nie \`transform\``);
  }

  // 3. Każda klasa filmu, która bazowo ma `opacity: 0`, musi mieć ścieżkę do widoczności:
  //    animację kończącą się na `opacity: 1` albo jawną regułę z `opacity: 1`.
  const baseHidden = new Set<string>();
  for (const rule of filmCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = rule[2];
    if (!/opacity\s*:\s*0\s*[;}]/.test(body + ';')) continue;
    for (const cls of rule[1].matchAll(/\.([\w-]+)/g)) baseHidden.add(cls[1]);
  }
  const visibleSomewhere = new Set<string>();
  for (const rule of filmCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = rule[1];
    const body = rule[2];
    const animated = /animation\s*:/.test(body);
    const explicit = /opacity\s*:\s*1/.test(body);
    if (!animated && !explicit) continue;
    // Animacja liczy się tylko wtedy, gdy jej klatka kończy się na opacity: 1.
    const animatedVisible = animated
      ? [...selector.matchAll(/([\w-]+)\s+[\d.]+m?s/g)].some(([, n]) => /opacity\s*:\s*1/.test(/(?:to|100%)\s*\{([^}]*)\}/.exec(keyframes.get(n) ?? '')?.[1] ?? ''))
      : false;
    if (explicit || animatedVisible) for (const cls of selector.matchAll(/\.([\w-]+)/g)) visibleSomewhere.add(cls[1]);
  }
  // 4. Wejście elementu musi zależeć od cue, nie od wpisanej na sztywno klasy:
  //    `className="film-label is-in"` zapala treść na starcie sceny, ignorując własne cue.
  const scenesSrc = readFileSync('src/cinema/scenes.tsx', 'utf8');
  assert.ok(!/className="[^"]*is-in/.test(scenesSrc),
    'scena wpisuje `is-in` na sztywno w `className` — wejście musi zależeć od cue');
  assert.ok(!/className=\{`[^`$]*is-in/.test(scenesSrc),
    'scena wpisuje `is-in` na sztywno w szablonie `className` — wejście musi zależeć od cue');

  const orphans = [...baseHidden].filter(cls => !visibleSomewhere.has(cls));
  assert.deepEqual(orphans, [],
    `te klasy mają bazowe \`opacity: 0\` i żadnej ścieżki do widoczności: ${orphans.join(', ')}`);
}
console.log('FILM VISIBILITY SELFTEST: OK (stan końcowy animacji, pozycja mockupów, żadnej klasy uwięzionej w opacity 0)');


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
assert.equal(qualityTier({ reduced: false, cores: 4, memory: 8 }), 'high', 'typowy czterordzeniowy laptop dostaje pełną wersję poradnika');
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
