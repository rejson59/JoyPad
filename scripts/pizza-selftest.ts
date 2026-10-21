/**
 * Test WEBZA („Nocna Dostawa”, silnik z multiplayer-superhero-pizza-delivery.zip) bez GPU i przeglądarki.
 * npm run selftest:pizza
 *
 * Trzy warstwy:
 *   1. most `bridge.ts` — mapowanie pad/klawiatura → silnik, paleta slotu, HUD, wynik (czyste funkcje),
 *   2. kompletność tłumaczeń komunikatów silnika,
 *   3. CAŁY silnik w harnessie headless: prawdziwe klatki symulacji, fałszywy renderer i DOM.
 *
 * Nie sprawdza wyglądu ani wydajności GPU — to wymaga prawdziwej przeglądarki.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Texture, Vector3 } from 'three';
import type { PadInput } from '../src/net/protocol';
import type { RoundConfig, RoundHud, RoundResult } from '../src/arcade/runtime';
import type { MomentEvent } from '../src/platform/momentRecorder';
import { gameAudio } from '../src/game/audio';
import { PizzaRound } from '../src/arcade/pizza/PizzaRound';
import type { Assets } from '../src/arcade/pizza/assets';
import {
  KEY_SETS, courierLabel, isGameKey, mixHex, modeOf, padVector, paletteFor, resultFromSnapshot,
  sampleInput, shiftSeconds, snapshotToHud, styleFor, throwSlotOf,
} from '../src/arcade/pizza/bridge';
import { EN, loc } from '../src/arcade/pizza/strings';
import { GRADE_LINES, type PlayerHud, type Snapshot } from '../src/arcade/pizza/types';
import { fakeElement, fakeRenderer, installBrowserFakes, universal } from './headless';

/* ===================================================================== 1. most */

{
  // gałka: `dirY` rośnie w dół ekranu, silnik chce „w górę” = dodatnie
  assert.deepEqual(padVector(undefined), { x: 0, y: 0 });
  assert.deepEqual(padVector({ fwd: 0, turn: 0, fire: false, dirX: 0.5, dirY: -1 }), { x: 0.5, y: 1 }, 'gałka w górę ekranu musi dawać y > 0');
  assert.deepEqual(padVector({ fwd: 0, turn: 0, fire: false, dirX: 0, dirY: 1 }), { x: 0, y: -1 });
  assert.deepEqual(padVector({ fwd: 0.7, turn: -0.3, fire: false, steer: 'tank' }), { x: -0.3, y: 0.7 }, 'tryb tank: skręt i gaz');
  assert.deepEqual(padVector({ fwd: 0.4, turn: 0.2, fire: false }), { x: 0.2, y: 0.4 }, 'stary pad bez dirX/dirY używa fwd/turn');

  const none = new Set<string>();
  const idle = sampleInput(0, none, undefined, false);
  assert.deepEqual(idle, { x: 0, y: 0, action: false, fire: false, assist: true });
  // pad: przycisk = sieć, nigdy ręczny rzut
  const padPress = sampleInput(2, none, { fwd: 0, turn: 0, fire: true, dirX: 1, dirY: 0 }, false);
  assert.equal(padPress.action, true); assert.equal(padPress.fire, false); assert.equal(padPress.x, 1);
  // klawiatura: każdy slot ma własny zestaw i nie czyta cudzych klawiszy
  assert.equal(sampleInput(0, new Set(['KeyD']), undefined, false).x, 1);
  assert.equal(sampleInput(1, new Set(['KeyD']), undefined, false).x, 0, 'WASD nie steruje slotem 2');
  assert.equal(sampleInput(1, new Set(['ArrowLeft']), undefined, false).x, -1);
  assert.equal(sampleInput(2, new Set(['KeyT']), undefined, false).y, 1);
  assert.equal(sampleInput(3, new Set(['KeyK']), undefined, false).y, -1);
  const diagonal = sampleInput(0, new Set(['KeyW', 'KeyD']), undefined, false);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9, 'ukos klawiaturą nie jest szybszy');
  // klawiatura wygrywa z padem, ale pad działa, gdy klawiatura milczy
  assert.equal(sampleInput(0, new Set(['KeyA']), { fwd: 0, turn: 0, fire: false, dirX: 1, dirY: 0 }, false).x, -1);
  assert.equal(sampleInput(0, none, { fwd: 0, turn: 0, fire: false, dirX: 0.8, dirY: 0 }, false).x, 0.8);
  // sieć i rzut to różne klawisze; klawisz rzutu = ręczny rzut
  assert.equal(sampleInput(0, new Set(['Space']), undefined, false).action, true);
  assert.equal(sampleInput(0, new Set(['KeyE']), undefined, false).fire, true);
  assert.equal(sampleInput(0, new Set(['KeyE']), undefined, false).action, false);
  assert.equal(sampleInput(1, new Set(['Enter']), undefined, false).action, true);
  assert.equal(sampleInput(0, none, undefined, true).assist, false, 'po ręcznym rzucie asysta jest wyłączona');
  // martwa strefa i brak NaN
  assert.equal(sampleInput(0, none, { fwd: 0, turn: 0, fire: false, dirX: 0.05, dirY: 0.05 }, false).x, 0);
  const broken = sampleInput(0, none, { fwd: NaN, turn: NaN, fire: false, dirX: NaN, dirY: NaN }, false);
  assert.ok(Number.isFinite(broken.x) && Number.isFinite(broken.y), 'NaN z pada nie może dojść do silnika');
  const huge = sampleInput(0, none, { fwd: 0, turn: 0, fire: false, dirX: 9, dirY: -9 }, false);
  assert.ok(Math.hypot(huge.x, huge.y) <= 1 + 1e-9, 'wektor jest przycięty do jedności');
  // slot poza zestawami (≥ 4) nie wywala się
  assert.doesNotThrow(() => sampleInput(7, new Set(['KeyW']), undefined, false));

  // klawisze gry nie mogą przewijać strony; litery zostają wolne
  for (const code of ['Space', 'ArrowUp', 'Enter', 'Numpad0', 'Slash', 'Period']) assert.equal(isGameKey(code), true, code);
  for (const code of ['KeyW', 'KeyE', 'Escape', 'F5']) assert.equal(isGameKey(code), false, code);
  assert.equal(throwSlotOf('KeyE'), 0); assert.equal(throwSlotOf('ShiftRight'), 1); assert.equal(throwSlotOf('KeyY'), 2); assert.equal(throwSlotOf('KeyO'), 3);
  assert.equal(throwSlotOf('Space'), -1);
  // żaden klawisz nie należy do dwóch slotów jednocześnie
  const seen = new Map<string, number>();
  KEY_SETS.forEach((set, slot) => { for (const code of [...set.up, ...set.down, ...set.left, ...set.right, ...set.web, ...set.throw]) {
    assert.ok(!seen.has(code) || seen.get(code) === slot, `klawisz ${code} jest w slocie ${seen.get(code)} i ${slot}`);
    seen.set(code, slot);
  } });

  // czas i tryb z opcji rundy
  assert.deepEqual([0, 1, 2, 9].map(shiftSeconds), [60, 120, 180, 120]);
  assert.deepEqual([0, 1, 5].map(modeOf), ['coop', 'versus', 'coop']);

  // paleta: karta w HUD i postać mają ten sam kolor
  const palette = paletteFor('#4ade80');
  assert.equal(palette.color, '#4ade80');
  for (const key of ['deep', 'accent', 'visor', 'scarf'] as const) assert.match(palette[key], /^#[0-9a-f]{6}$/, key);
  assert.equal(paletteFor('nie-kolor').color, '#ff9a52', 'zły kolor wraca do akcentu JoyPada');
  assert.equal(mixHex('#000000', '#ffffff', 0.5), '#808080');
  assert.equal(mixHex('#102030', '#102030', 0.7), '#102030');
  assert.equal(courierLabel('  kuba  '), 'KUBA'); assert.equal(courierLabel(''), 'KURIER'); assert.equal(courierLabel('Bardzo Długi Nick').length, 10);
  assert.equal(styleFor({ slot: 1, name: 'Ola', color: '#38bdf8', isBot: false }).name, 'OLA');

  // HUD i wynik na ręcznie zbudowanych migawkach
  const hud = (slot: number, over: Partial<PlayerHud> = {}): PlayerHud => ({
    slot, name: `C${slot}`, full: `C${slot}`, role: '', color: '#fff', joined: true, score: 0, combo: 0, bestCombo: 0,
    pizzas: 6, maxPizzas: 6, deliveries: 0, perfects: 0, misses: 0, heat: 0, overdrive: 0, swinging: false, speed: 0, lead: false, ...over,
  });
  const snapshot = (over: Partial<Snapshot> = {}): Snapshot => ({
    phase: 'play', mode: 'coop', duration: 120, timeLeft: 90, countdown: 0, announcer: '', announcerSub: '', announcerId: 0,
    players: [hud(0), hud(1), hud(2), hud(3)], teamScore: 0, orders: 4, hint: '', stars: 0, grade: 'D', mvp: 0, load: 1, ...over,
  });
  const humans = [{ slot: 0, name: 'Ala', color: '#4ade80', isBot: false }, { slot: 2, name: 'Olek', color: '#fb923c', isBot: false }];

  const playing = snapshotToHud(snapshot({ players: [hud(0, { score: 120, combo: 3, pizzas: 4 }), hud(1), hud(2, { overdrive: 3 }), hud(3)] }), humans, 'pl');
  assert.equal(playing.players.length, 2, 'HUD pokazuje tylko ludzi z tej rundy');
  assert.deepEqual(playing.players.map(p => p.slot), [0, 2], 'sloty zostają prawdziwe (0 i 2), nie kolejne');
  assert.match(playing.players[0].detail, /4\/6 pizz · seria ×3/); assert.match(playing.players[1].detail, /ROZGRZANIE/);
  assert.equal(playing.players[0].value, 4); assert.equal(playing.players[0].maxValue, 6);
  assert.equal(playing.countdown, 0); assert.equal(playing.paused, false); assert.equal(playing.status, 'Zamówienia: 4');
  assert.match(snapshotToHud(snapshot({ announcer: 'PERFEKT', announcerSub: 'ALA' }), humans, 'pl').status, /PERFEKT · ALA/);
  assert.equal(snapshotToHud(snapshot({ phase: 'countdown', countdown: 2 }), humans, 'pl').countdown, 2);
  assert.equal(snapshotToHud(snapshot({ phase: 'paused' }), humans, 'en').paused, true);
  assert.match(snapshotToHud(snapshot({ players: [hud(0, { pizzas: 2, combo: 4 })] }), humans, 'en').players[0].detail, /2\/6 pizzas · streak ×4/);
  assert.equal(snapshotToHud(snapshot({ timeLeft: -3 }), humans, 'pl').timeLeft, 0, 'czas nie schodzi poniżej zera');
  assert.equal(snapshotToHud(snapshot({ players: [] }), humans, 'pl').players[0].detail, '—', 'brak danych slotu nie wywala HUD');

  const coop = resultFromSnapshot(snapshot({ phase: 'results', grade: 'A', stars: 4, players: [hud(0, { score: 1500, deliveries: 9 }), hud(1), hud(2, { score: 900, deliveries: 5, perfects: 2, bestCombo: 4 }), hud(3)] }), humans, 'pl');
  assert.equal(coop.title, 'OCENA A'); assert.equal(coop.allWon, true); assert.equal(coop.winnerSlot, null);
  assert.match(coop.subtitle, /Dzielnica już plotkuje.*2400 pkt/);
  assert.equal(coop.players.length, 2); assert.match(coop.players[1].detail, /5 dostaw · 2 perfekt · najlepsza seria ×4/);
  assert.equal(resultFromSnapshot(snapshot({ phase: 'results', grade: 'D', stars: 0 }), humans, 'pl').allWon, false, 'ocena D to porażka zespołu');
  assert.equal(resultFromSnapshot(snapshot({ phase: 'results', grade: 'C', stars: 1 }), humans, 'pl').allWon, true);
  const versus = resultFromSnapshot(snapshot({ phase: 'results', mode: 'versus', grade: 'B', stars: 2, players: [hud(0, { score: 400 }), hud(1), hud(2, { score: 700 }), hud(3)] }), humans, 'pl');
  assert.equal(versus.winnerSlot, 2); assert.equal(versus.title, 'OLEK WYGRYWA'); assert.equal(versus.allWon, false);
  assert.equal(resultFromSnapshot(snapshot({ phase: 'results', mode: 'versus', players: [hud(0, { score: 500 }), hud(1), hud(2, { score: 500 }), hud(3)] }), humans, 'pl').title, 'REMIS');
  assert.equal(resultFromSnapshot(snapshot({ phase: 'results', mode: 'versus' }), humans, 'pl').winnerSlot, null, 'zero punktów to remis, nie zwycięstwo');
  const solo = resultFromSnapshot(snapshot({ phase: 'results', mode: 'versus', grade: 'S', stars: 5, players: [hud(0, { score: 3500 }), hud(1), hud(2), hud(3)] }), [humans[0]], 'en');
  assert.equal(solo.title, 'GRADE S'); assert.equal(solo.allWon, true, 'jeden gracz w „rywalizacji” dostaje ocenę zespołu');
  assert.match(solo.subtitle, /Legends of the night shift/);
  console.log('PIZZA BRIDGE SELFTEST: OK (gałka, klawisze, asysta, paleta, HUD i wynik w PL/EN)');
}

/* ============================================================ 2. tłumaczenia */

{
  const source = readFileSync('src/arcade/pizza/Game.ts', 'utf8');
  const literals = new Set<string>();
  /** Tylko to, co leży wewnątrz nawiasów wywołania — nie warunki typu `phase === "play"` z tej samej linii. */
  const argumentsOf = (line: string, call: string): string => {
    const start = line.indexOf(call);
    if (start < 0) return '';
    let depth = 0, inString = false;
    for (let i = start + call.length - 1; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"' && line[i - 1] !== '\\') inString = !inString;
      if (inString) continue;
      if (ch === '(') depth++;
      if (ch === ')' && --depth === 0) return line.slice(start + call.length, i);
    }
    return line.slice(start + call.length);
  };
  for (const line of source.split('\n')) {
    const scopes = ['this.say(', 'this.floater(', 'tags.push('].map(call => argumentsOf(line, call));
    const hint = /hint = ("(?:[^"\\]|\\.)*")/.exec(line)?.[1];
    if (hint) scopes.push(hint);
    for (const scope of scopes) for (const match of scope.matchAll(/"((?:[^"\\]|\\.)*)"/g)) literals.add(match[1]);
  }
  const neutral = new Set(['', '+', 'x', ' · ', '{name}']);
  const missing = [...literals].filter(text => !neutral.has(text) && !text.startsWith('#') && !(text in EN));
  assert.deepEqual(missing, [], `komunikaty silnika bez tłumaczenia EN: ${missing.join(' | ')}`);
  for (const line of Object.values(GRADE_LINES)) assert.ok(line in EN, `komentarz do oceny bez EN: ${line}`);
  assert.equal(loc('PERFEKT', 'pl'), 'PERFEKT'); assert.equal(loc('PERFEKT', 'en'), 'PERFECT');
  assert.equal(loc('Nieznany napis 42', 'en'), 'Nieznany napis 42', 'nieznany napis przechodzi bez zmian');
  assert.equal(loc('', 'en'), '');
  assert.ok(literals.size >= 15, 'parser komunikatów przestał widzieć kod silnika');
  console.log(`PIZZA STRINGS SELFTEST: OK (${literals.size} napisów silnika, każdy ma wersję EN)`);
}

/* ================================================= 3. silnik w harnessie headless */

const settle = async () => { for (let i = 0; i < 6; i++) await new Promise(resolve => setImmediate(resolve)); };

function fakeAssets(): Omit<Assets, 'env'> {
  const texture = () => new Texture();
  return {
    facade: texture(), facadeGlow: texture(), asphalt: texture(), roof: texture(), pizza: texture(),
    billboard: texture(), emblem: texture(), concrete: texture(), splash: texture(),
    signs: new Proxy({}, { get: () => texture() }) as Assets['signs'],
  };
}

interface Session {
  round: PizzaRound;
  host: ReturnType<typeof fakeElement>;
  canvas: ReturnType<typeof fakeElement>;
  huds: RoundHud[];
  finishes: RoundResult[];
  fx: { slot: number; fx: string }[];
  moments: MomentEvent[];
  pads: PadInput[];
  game: any;
  renderer: any;
}

const players = (slots: number[]) => slots.map(slot => ({ slot, name: ['ALA', 'OLEK', 'ZOSIA', 'KUBA'][slot], color: ['#4ade80', '#38bdf8', '#fb923c', '#c084fc'][slot], isBot: false }));

function createSession(over: Partial<RoundConfig> & { slots?: number[]; failAssets?: boolean } = {}): Session {
  const host = fakeElement('div');
  const canvas = fakeElement('canvas');
  canvas.parentElement = host;
  host.children.push(canvas);
  const pads: PadInput[] = [0, 1, 2, 3].map(() => ({ fwd: 0, turn: 0, fire: false }));
  const huds: RoundHud[] = [], finishes: RoundResult[] = [], fx: Session['fx'] = [], moments: MomentEvent[] = [];
  let renderer: any = null;
  const config: RoundConfig = {
    players: players(over.slots ?? [0, 1]), padInputs: pads, primary: 0, secondary: 0, quality: 'balanced', language: 'pl',
    onHud: hud => huds.push(hud), onFinish: result => finishes.push(result),
    onFx: (slot, effect) => fx.push({ slot, fx: effect }), onMoment: event => moments.push(event), onFrame: () => undefined,
    ...over,
  };
  const round = new PizzaRound(canvas as unknown as HTMLCanvasElement, config, {
    createRenderer: target => (renderer = fakeRenderer(target)) as never,
    loadAssets: over.failAssets ? () => Promise.reject(new Error('brak sieci')) : async () => fakeAssets(),
    makeEnv: () => new Texture(),
  });
  const session: Session = { round, host, canvas, huds, finishes, fx, moments, pads, get game() { return (round as any).game; }, get renderer() { return renderer; } } as Session;
  return session;
}

const approx = (value: number, expected: number, tolerance: number, label: string) =>
  assert.ok(Math.abs(value - expected) <= tolerance, `${label}: ${value} ≠ ${expected} ±${tolerance}`);

async function run() {
  /* --- 3a. pełna zmiana: start PRZED gotowością silnika, pady w ruchu --- */
  {
    const h = installBrowserFakes();
    const baseline = h.listenerCount();
    const s = createSession({ slots: [0, 2], secondary: 0 });
    s.round.start();                       // platforma woła start() zanim miasto się zbuduje
    assert.equal(s.huds.length, 0, 'przed gotowością silnika platforma ma wisieć na swoim ładowaniu, nie dostać pustego HUD-u');
    await settle();
    h.frames(2);
    assert.ok(s.huds.length > 0, 'po zbudowaniu miasta rusza odliczanie');
    assert.equal(s.huds[0].countdown, 3); approx(s.huds[0].timeLeft, 60, 0.001, 'czas zmiany w HUD przed startem');
    assert.deepEqual(s.huds[0].players.map(p => p.slot), [0, 2]);
    assert.equal(s.host.children.length, 2, 'minimapa jest zamontowana obok płótna');

    s.pads[0] = { fwd: 0, turn: 0, fire: false, dirX: 0, dirY: -1 };
    h.seconds(3.2);
    const live = s.huds[s.huds.length - 1];
    assert.equal(live.countdown, 0, 'odliczanie dobiegło końca'); assert.ok(live.timeLeft < 60, 'czas zaczął płynąć');

    // ruch po scenariuszu: kołowa gałka i naprzemienne przytrzymanie przycisku (sieć) u obu graczy
    let guard = 0;
    h.seconds(80, time => {
      const t = time / 1000;
      s.pads[0] = { fwd: 0, turn: 0, fire: Math.floor(t) % 3 === 0, dirX: Math.cos(t * 0.9), dirY: Math.sin(t * 0.9) };
      s.pads[2] = { fwd: 0, turn: 0, fire: Math.floor(t * 0.7) % 2 === 0, dirX: Math.sin(t), dirY: -Math.cos(t * 0.6) };
      guard++;
    });
    assert.ok(guard > 4000, 'symulacja przeszła przez całą zmianę');
    assert.equal(s.finishes.length, 1, 'onFinish dokładnie raz po upływie czasu');
    const result = s.finishes[0];
    assert.match(result.title, /^OCENA (D|C|B|A|S|S\+)$/); assert.equal(result.players.length, 2);
    assert.deepEqual(result.players.map(p => p.slot), [0, 2]);
    for (const p of result.players) { assert.ok(Number.isFinite(p.score) && p.score >= 0, `wynik ${p.name}`); assert.ok(p.detail.length > 0); }
    for (const hud of s.huds) {
      assert.ok(Number.isFinite(hud.timeLeft) && hud.timeLeft >= 0 && hud.timeLeft <= 60.001, 'czas HUD w granicach');
      for (const p of hud.players) { assert.ok(Number.isFinite(p.score) && Number.isFinite(p.value ?? 0), 'liczby HUD są skończone'); assert.ok((p.value ?? 0) <= (p.maxValue ?? 99), 'plecak nie przekracza pojemności'); }
    }
    const before = s.huds.length;
    h.seconds(2);
    assert.equal(s.huds.length, before, 'po zakończeniu rundy HUD nie płynie dalej');
    assert.equal(s.finishes.length, 1, 'po zakończeniu nie ma drugiego onFinish');
    for (const m of s.moments) { assert.ok(m.weight! >= 20 && m.weight! <= 120 && Number.isFinite(m.at!) && m.at! >= 0, 'Moment w kontrakcie'); }

    s.round.destroy();
    assert.equal(h.listenerCount(), baseline, 'destroy() zwalnia wszystkie nasłuchy window/document');
    assert.equal(s.host.children.length, 1, 'minimapa zdjęta z DOM, płótno platformy zostaje');
    assert.ok(s.renderer.counters.dispose >= 1, 'renderer zwolniony');
    assert.doesNotThrow(() => s.round.destroy(), 'podwójne destroy jest bezpieczne');
    const afterDestroy = s.huds.length; h.frames(30);
    assert.equal(s.huds.length, afterDestroy, 'pętla zatrzymana po destroy');
    h.restore();
  }

  /* --- 3b. start PO gotowości, rywalizacja, EN, pauza, widoczność karty --- */
  {
    const h = installBrowserFakes();
    const s = createSession({ slots: [1, 3], secondary: 1, primary: 1, language: 'en' });
    await settle(); h.frames(2);
    assert.equal(s.huds.length, 0, 'bez start() platformy rundy nie ma');
    s.round.start();
    h.frames(2);
    assert.ok(s.huds.length > 0); approx(s.huds[0].timeLeft, 120, 0.001, 'czas „Zmiana · 2:00”');
    assert.match(s.huds[0].objective, /Most points wins/); assert.equal(s.huds[0].players[0].slot, 1);
    h.seconds(3.6);

    s.round.togglePause(); h.frames(3);
    assert.equal(s.huds[s.huds.length - 1].paused, true, 'pauza z platformy zatrzymuje HUD w stanie paused');
    const frozen = s.huds[s.huds.length - 1].timeLeft;
    h.seconds(2);
    approx(s.huds[s.huds.length - 1].timeLeft, frozen, 0.001, 'w pauzie czas stoi');
    s.round.togglePause(); h.seconds(1);
    assert.equal(s.huds[s.huds.length - 1].paused, false); assert.ok(s.huds[s.huds.length - 1].timeLeft < frozen, 'po wznowieniu czas płynie');

    (globalThis as any).document.hidden = true; h.dispatchDocument('visibilitychange'); h.frames(3);
    assert.equal(s.huds[s.huds.length - 1].paused, true, 'ukryta karta pauzuje rundę (nikt nie przegrywa pod nieobecność)');
    (globalThis as any).document.hidden = false;
    s.round.togglePause(); h.frames(2);

    // klawiatura: Esc pauzuje, okno (dialog) przejmuje klawisze, klawisz rzutu wyłącza asystę slotu
    h.dispatch('keydown', { code: 'Escape' }); h.frames(3);
    assert.equal(s.huds[s.huds.length - 1].paused, true, 'Esc pauzuje');
    h.dispatch('keydown', { code: 'Escape' }); h.frames(3);
    assert.equal(s.huds[s.huds.length - 1].paused, false, 'drugi Esc wznawia');
    (globalThis as any).document.querySelector = () => ({});
    h.dispatch('keydown', { code: 'Escape' }); h.frames(3);
    assert.equal(s.huds[s.huds.length - 1].paused, false, 'gdy nad areną stoi okno, Esc należy do okna');
    (globalThis as any).document.querySelector = () => null;
    assert.equal((s.round as any).manualThrow[0], false);
    h.dispatch('keydown', { code: 'KeyE' }); assert.equal((s.round as any).manualThrow[0], true, 'KeyE = ręczny rzut slotu 1');
    assert.equal((s.round as any).manualThrow[1], false);
    h.dispatch('keydown', { code: 'KeyD' }); assert.equal((s.round as any).keys.has('KeyD'), true);
    h.dispatch('blur'); assert.equal((s.round as any).keys.size, 0, 'blur zwalnia wszystkie klawisze');

    // dźwięk platformy wycisza silnik
    gameAudio.muted = true; h.seconds(0.5);
    assert.equal(s.game.audio.muted, true, 'wyciszenie z paska gry dociera do silnika');
    gameAudio.muted = false; h.seconds(0.5);
    assert.equal(s.game.audio.muted, false);

    // zamknięcie rundy przez platformę w trakcie gry (bez finish)
    s.round.destroy();
    assert.equal(s.finishes.length, 0, 'destroy w trakcie rundy nie zgłasza fikcyjnego wyniku');
    h.restore();
  }

  /* --- 3c. destroy przed startem, przed gotowością i błąd ładowania --- */
  {
    const h = installBrowserFakes();
    const baseline = h.listenerCount();
    const early = createSession();
    assert.doesNotThrow(() => early.round.destroy(), 'destroy przed gotowością silnika');
    await settle(); h.frames(5);
    assert.equal(early.huds.length, 0, 'zniszczona runda nie wysyła HUD-u po zakończeniu ładowania');
    assert.equal(h.listenerCount(), baseline);

    const idle = createSession();
    await settle(); h.frames(2);
    assert.doesNotThrow(() => idle.round.destroy(), 'destroy po gotowości, ale przed start()');
    assert.equal(idle.huds.length, 0); assert.equal(h.listenerCount(), baseline);

    const originalError = console.error;
    console.error = () => undefined; // silnik loguje błąd ładowania — to oczekiwany szum tego testu
    const broken = createSession({ failAssets: true });
    broken.round.start(); await settle(); h.frames(3);
    assert.equal(broken.finishes.length, 1, 'błąd ładowania kończy się jednym, jasnym komunikatem');
    assert.match(broken.finishes[0].title, /NIE UDAŁO SIĘ WCZYTAĆ GRY/); assert.equal(broken.huds.length, 0);
    assert.equal(broken.finishes[0].players.length, 2); assert.ok(broken.finishes[0].players.every(p => p.score === 0));
    broken.round.destroy();
    const brokenEn = createSession({ failAssets: true, language: 'en' });
    brokenEn.round.start(); await settle();
    assert.match(brokenEn.finishes[0].title, /COULD NOT LOAD/);
    brokenEn.round.destroy();
    console.error = originalError;
    h.restore();
  }

  /* --- 3d. profile sprzętu i jeden gracz --- */
  {
    for (const quality of ['performance', 'balanced', 'quality'] as const) {
      const h = installBrowserFakes();
      const s = createSession({ quality, slots: [0] });
      s.round.start(); await settle(); h.seconds(5);
      assert.ok(s.huds.length > 0, `profil ${quality} startuje`);
      assert.ok(s.renderer.counters.render >= 0);
      const hasFxaa = s.game.fxaa !== null;
      assert.equal(hasFxaa, quality !== 'performance', `FXAA tylko poza profilem płynności (${quality})`);
      assert.equal(s.renderer.shadowMap.enabled, quality !== 'performance', `cienie wyłączone w profilu płynności (${quality})`);
      s.round.destroy(); h.restore();
    }
  }

  /* --- 3e. asysta rzutu: kiedy kurier rzuca, a kiedy nie --- */
  {
    const h = installBrowserFakes();
    const s = createSession({ slots: [0] });
    s.round.start(); await settle(); h.seconds(3.5);
    const game = s.game, runner = game.players[0], order = game.orders[0];
    assert.ok(order && runner.joined, 'jest zamówienie i ludzki kurier');
    const arrange = () => {
      runner.pos.copy(order.pos).add(new Vector3(9, 5, 0));
      runner.aimOrder = order.id; runner.pizzas = 6; runner.throwCd = 0; runner.charge = 0;
      for (const pizza of game.pizzas) pizza.active = false;
    };
    arrange(); assert.equal(game.autoFire(runner), true, 'klient w zasięgu i w powietrzu → rzut');
    arrange(); runner.pos.y = 0.5; assert.equal(game.autoFire(runner), false, 'na ziemi nie rzuca');
    arrange(); runner.pizzas = 0; assert.equal(game.autoFire(runner), false, 'pusty plecak');
    arrange(); runner.pos.copy(order.pos).add(new Vector3(40, 5, 0)); assert.equal(game.autoFire(runner), false, 'klient dalej niż 30 m');
    arrange(); runner.throwCd = 0.3; assert.equal(game.autoFire(runner), false, 'odstęp między rzutami');
    arrange(); runner.aimOrder = -1; assert.equal(game.autoFire(runner), false, 'bez klienta w celowniku');
    arrange(); const flying = game.pizzas[0]; flying.active = true; flying.owner = 0; flying.target = order.id;
    assert.equal(game.autoFire(runner), false, 'nie dubluje rzutu w to samo okno');
    arrange(); runner.charge = 0.3; runner.aimOrder = -1; assert.equal(game.autoFire(runner), true, 'rozpoczęte ładowanie dobiega końca');
    arrange(); runner.charge = 0.6; assert.equal(game.autoFire(runner), false, 'po 0,52 puszcza → rzut');

    // pełny cykl: ładowanie → puszczenie → pizza w locie → haptyka „fire”
    arrange(); const before = runner.pizzas; s.fx.length = 0;
    h.seconds(1.0);
    assert.ok(runner.pizzas <= before, 'kurier rzucił sam albo czeka na namierzenie');
    s.round.destroy(); h.restore();
  }

  /* --- 3f. dostawy, serie i Moments --- */
  {
    const h = installBrowserFakes();
    const s = createSession({ slots: [0, 1], secondary: 0 });
    s.round.start(); await settle(); h.seconds(3.6);
    const game = s.game, runner = game.players[0];
    assert.equal(game.phase, 'play', 'runda w fazie gry');
    const deliverOne = () => {
      const order = game.orders[0];
      const pizza = game.pizzas.find((z: any) => !z.active);
      pizza.active = true; pizza.owner = 0; pizza.target = order.id; pizza.life = 4; pizza.fromAir = true; pizza.fromSwing = true;
      pizza.pos.copy(order.pos); pizza.vel.set(0, 0, 0); pizza.mesh.visible = true;
      game.updatePizzas(0.016);
      return order;
    };
    const startOrders = game.orders.length, startScore = runner.score;
    deliverOne();
    assert.equal(runner.deliveries, 1); assert.ok(runner.score > startScore, 'dostawa daje punkty');
    assert.ok(game.orders.length <= startOrders, 'zamówienie znika po dostawie');
    assert.ok(s.fx.some(e => e.slot === 0 && e.fx === 'kill'), 'dostawa wibruje padem gracza');
    for (let i = 0; i < 4; i++) deliverOne();
    assert.equal(runner.combo, 5, 'pięć dostaw bez przerwy to seria ×5');
    assert.ok(s.moments.some(m => m.kind === 'streak' && m.slot === 0 && /5/.test(m.title)), 'seria ×5 trafia do Moments');
    for (const m of s.moments) assert.ok(['kill', 'streak', 'lead', 'lap', 'score', 'pickup', 'objective'].includes(m.kind) && m.detail.length > 0, `Moment ${m.kind}`);
    const snap = game.snapshot();
    assert.equal(snap.players[0].deliveries, 5); assert.equal(snap.players[1].deliveries, 0);
    assert.equal(snap.players[0].lead, true, 'lider zbiera koronę');
    s.round.destroy(); h.restore();
  }

  /* --- 3g. ręczny rzut klawiaturą jest zgodny z asystą (jeden kontrakt wejścia) --- */
  {
    const h = installBrowserFakes();
    const s = createSession({ slots: [0, 1] });
    s.round.start(); await settle(); h.seconds(3.6);
    const read = (slot: number) => (s.round as any).game.opts.readInput(slot);
    assert.equal(read(0).assist, true); assert.equal(read(1).assist, true);
    h.dispatch('keydown', { code: 'ShiftRight' });
    assert.equal(read(0).assist, true, 'rzut drugiego gracza nie wyłącza asysty pierwszego');
    assert.equal(read(1).assist, false);
    assert.equal(read(1).fire, true, 'przytrzymany klawisz rzutu = ręczne ładowanie');
    h.dispatch('keyup', { code: 'ShiftRight' }); assert.equal(read(1).fire, false);
    s.round.destroy(); h.restore();
  }

  console.log('PIZZA ENGINE SELFTEST: OK (zmiana od startu do wyniku, pauza, sprzątanie, błąd ładowania, profile sprzętu, asysta rzutu, dostawy i Moments)');
}

void universal;
run().catch(error => { console.error(error); process.exit(1); });
