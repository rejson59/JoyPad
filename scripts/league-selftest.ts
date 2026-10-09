/**
 * Test Turbo League (silnik z nitro-league.zip) bez GPU i przeglądarki.
 * npm run selftest:league
 *
 * Cztery warstwy:
 *   1. most `bridge.ts` — składy drużyn, gałka → wejście, HUD i wynik (czyste funkcje),
 *   2. STEROWANIE NA PRAWDZIWEJ FIZYCE `Car`: znaki skrętu, zbieżność kursu, hamowanie, boost, auto-poziomowanie,
 *   3. tłumaczenia i spójność brandingu,
 *   4. CAŁY mecz w harnessie headless: bramki, limit goli, dogrywka z sufitem, pauza, kamera, sprzątanie.
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
import { Car } from '../src/arcade/league-next/Car';
import { B, BALL_R, STEP } from '../src/arcade/league-next/constants';
import { LeagueNextRound } from '../src/arcade/league-next/LeagueRound';
import {
  KEY_SETS, MATCH_SECONDS, OVERTIME_MAX_SECONDS, assignTeams, autoLevel, driveToward, goalLimitFor, headingError,
  isGameKey, padStick, resultFromSnapshot, sampleStick, snapshotToHud, stickToWorld, teamSize,
  type LeagueCarStat, type LeagueSnapshot, type Vec3,
} from '../src/arcade/league-next/bridge';
import { Trail } from '../src/arcade/league-next/particles';
import { fakeElement, fakeRenderer, installBrowserFakes } from './headless';

const UP: Vec3 = [0, 1, 0];
const racers = (spec: string) => spec.split('').map((kind, slot) => ({ slot, name: kind === 'H' ? `GRACZ ${slot + 1}` : `BOT ${slot + 1}`, color: ['#4ade80', '#38bdf8', '#fb923c', '#c084fc'][slot], isBot: kind === 'B' }));

/* ===================================================================== 1. most */

{
  // składy: ludzie siadają naprzemiennie, boty uzupełniają mniejszą drużynę, remis liczebności → niebiescy
  const layout = (spec: string) => assignTeams(racers(spec)).map(entry => entry.team).join('');
  assert.equal(layout('H'), '0', '1 auto = trening');
  assert.equal(layout('HB'), '01', 'człowiek + bot = 1v1');
  assert.equal(layout('HBB'), '010', 'człowiek z botem przeciw botowi (2v1)');
  assert.equal(layout('HBBB'), '0101', 'człowiek z botem przeciw dwóm botom (2v2)');
  assert.equal(layout('HH'), '01', 'dwóch ludzi gra przeciw sobie');
  assert.equal(layout('HHB'), '010', 'bot dołącza do mniejszej drużyny, remis → niebiescy');
  assert.equal(layout('HHBB'), '0101', 'dwóch ludzi + dwa boty = 2v2, po człowieku i bocie w drużynie');
  assert.equal(layout('HHH'), '010');
  assert.equal(layout('HHHB'), '0101', 'trzech ludzi + bot = 2v2');
  assert.equal(layout('HHHH'), '0101');
  assert.equal(layout('BBBB'), '0101', 'same boty też dają równy skład');
  for (const spec of ['H', 'HB', 'HBB', 'HBBB', 'HH', 'HHB', 'HHBB', 'HHH', 'HHHB', 'HHHH', 'BHBH', 'BBHH']) {
    const roster = assignTeams(racers(spec));
    const sizes = [0, 1].map(team => roster.filter(entry => entry.team === team).length);
    assert.ok(Math.abs(sizes[0] - sizes[1]) <= 1, `${spec}: drużyny ${sizes}`);
    if (roster.length >= 2) assert.ok(sizes[0] > 0 && sizes[1] > 0, `${spec}: pusta drużyna`);
    assert.deepEqual(roster.map(entry => entry.index), roster.map((_, i) => i), `${spec}: indeksy aut kolejne`);
    assert.equal(teamSize(roster), Math.max(...sizes));
  }
  const mixed = assignTeams(racers('BHBH'));
  assert.deepEqual(mixed.map(entry => entry.human), [true, true, false, false], 'ludzie przed botami, niezależnie od kolejności na wejściu');
  assert.deepEqual(mixed.map(entry => entry.slot), [1, 3, 0, 2], 'sloty zostają prawdziwe');
  assert.equal(assignTeams([...racers('HHHH'), ...racers('BBBB')]).length, 4, 'maksymalnie cztery auta');

  // gałka i klawiatura
  assert.deepEqual(padStick(undefined), { x: 0, y: 0 });
  assert.deepEqual(padStick({ fwd: 0, turn: 0, fire: false, dirX: 0.5, dirY: -1 }), { x: 0.5, y: 1 }, 'gałka w górę ekranu → y > 0');
  assert.deepEqual(padStick({ fwd: 0.6, turn: -0.2, fire: false, steer: 'tank' }), { x: -0.2, y: 0.6 });
  assert.deepEqual(padStick({ fwd: 0.4, turn: 0.2, fire: false }), { x: 0.2, y: 0.4 }, 'stary pad bez dirX/dirY');
  const none = new Set<string>();
  assert.deepEqual(sampleStick(0, none, undefined), { x: 0, y: 0, boost: false });
  assert.equal(sampleStick(0, none, { fwd: 0, turn: 0, fire: true }).boost, true, 'przycisk pada = boost');
  assert.equal(sampleStick(0, new Set(['Space']), undefined).boost, true);
  assert.equal(sampleStick(1, new Set(['Space']), undefined).boost, false, 'Spacja nie jest boostem gracza 2');
  assert.equal(sampleStick(1, new Set(['Enter']), undefined).boost, true);
  assert.equal(sampleStick(0, new Set(['KeyD']), undefined).x, 1);
  assert.equal(sampleStick(1, new Set(['KeyD']), undefined).x, 0, 'WASD nie steruje slotem 2');
  assert.equal(sampleStick(1, new Set(['ArrowUp']), undefined).y, 1);
  assert.equal(sampleStick(3, new Set(['KeyK']), undefined).y, -1);
  const diagonal = sampleStick(0, new Set(['KeyW', 'KeyD']), undefined);
  assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.y) - 1) < 1e-9);
  assert.equal(sampleStick(0, new Set(['KeyA']), { fwd: 0, turn: 0, fire: false, dirX: 1, dirY: 0 }).x, -1, 'klawiatura wygrywa z padem');
  assert.equal(sampleStick(0, none, { fwd: 0, turn: 0, fire: false, dirX: 0.05, dirY: 0.05 }).x, 0, 'martwa strefa');
  const broken = sampleStick(0, none, { fwd: NaN, turn: NaN, fire: false, dirX: NaN, dirY: NaN });
  assert.ok(Number.isFinite(broken.x) && Number.isFinite(broken.y), 'NaN z pada nie dochodzi do silnika');
  assert.ok(Math.hypot(...Object.values(sampleStick(0, none, { fwd: 0, turn: 0, fire: false, dirX: 9, dirY: -9 })).slice(0, 2) as [number, number]) <= 1 + 1e-9);
  assert.doesNotThrow(() => sampleStick(9, new Set(['KeyW']), undefined));
  for (const code of ['Space', 'ArrowUp', 'Enter', 'Numpad0', 'Slash']) assert.equal(isGameKey(code), true, code);
  for (const code of ['KeyW', 'Escape', 'F5']) assert.equal(isGameKey(code), false, code);
  const seen = new Map<string, number>();
  KEY_SETS.forEach((set, slot) => { for (const code of [...set.up, ...set.down, ...set.left, ...set.right, ...set.boost]) {
    assert.ok(!seen.has(code) || seen.get(code) === slot, `klawisz ${code} należy do dwóch slotów`);
    seen.set(code, slot);
  } });

  // osie ekranu → świat: prawo = −Z (niebiescy atakują w prawo), góra = −X
  const right = stickToWorld(1, 0), up = stickToWorld(0, 1);
  assert.deepEqual([right.x + 0, right.z], [0, -1]); assert.deepEqual([up.x, up.z + 0], [-1, 0]);

  // kierunek jazdy: konwencja z Car.groundStep (przód = −Z, steer +1 = w prawo)
  assert.ok(headingError([0, 0, -1], UP, [-1, 0, 0]) > 1.5, 'cel po lewej → błąd dodatni');
  assert.ok(headingError([0, 0, -1], UP, [1, 0, 0]) < -1.5, 'cel po prawej → błąd ujemny');
  assert.ok(Math.abs(headingError([0, 0, -1], UP, [0, 0, -1])) < 1e-9);
  assert.ok(Math.abs(Math.abs(headingError([0, 0, -1], UP, [0, 0, 1])) - Math.PI) < 1e-6, 'cel za plecami = π');
  assert.equal(headingError([0, 0, -1], UP, [0, 0, 0]), 0, 'zerowy cel nie daje NaN');
  const goLeft = driveToward([0, 0, -1], UP, 5, { x: -1, y: 0 });   // gałka w lewo = świat +Z, auto jedzie w −Z
  assert.ok(Math.abs(goLeft.steer) > 0.9, 'zawracanie to pełny skręt');
  const toRight = driveToward([-1, 0, 0], UP, 5, { x: 0, y: -1 });  // auto jedzie −X (w górę ekranu); gałka w dół = +X (za plecami)
  assert.ok(Math.abs(toRight.steer) > 0.9);
  const ahead = driveToward([-1, 0, 0], UP, 8, { x: 0, y: 1 });     // gałka w górę ekranu, auto już jedzie −X
  assert.ok(Math.abs(ahead.steer) < 0.05 && ahead.throttle === 1, 'cel na wprost: prosto i na gazie');
  const rightTurn = driveToward([-1, 0, 0], UP, 8, { x: 1, y: 1 });
  assert.ok(rightTurn.steer > 0, 'gałka w prawo od kursu → skręt w prawo (+)');
  const leftTurn = driveToward([-1, 0, 0], UP, 8, { x: -1, y: 1 });
  assert.ok(leftTurn.steer < 0, 'gałka w lewo od kursu → skręt w lewo (−)');
  assert.deepEqual(driveToward([0, 0, -1], UP, 0.2, { x: 0, y: 0 }), { throttle: 0, steer: 0, handbrake: false }, 'stoi i gałka puszczona: nic nie robi');
  const brake = driveToward([0, 0, -1], UP, 12, { x: 0, y: 0 });
  assert.ok(brake.throttle < -0.9, 'puszczona gałka hamuje w jedzie do przodu'); assert.equal(brake.steer, 0);
  assert.ok(driveToward([0, 0, -1], UP, -8, { x: 0, y: 0 }).throttle > 0.9, 'a w cofaniu — hamuje dodając gaz');
  assert.equal(driveToward([-1, 0, 0], UP, 12, { x: 0, y: -1 }).handbrake, true, 'zawracanie z rozpędu: hamulec ręczny');
  assert.equal(driveToward([-1, 0, 0], UP, 3, { x: 0, y: -1 }).handbrake, false, 'z wolnego ruchu nie ślizgamy się');
  assert.ok(driveToward([0, 0, -1], UP, 5, { x: NaN, y: NaN }).throttle <= 0, 'NaN w gałce = brak wejścia');
  // na ścianie: normalna ściany zamiast „góry”, wektor żądany rzutowany na płaszczyznę
  const wall: Vec3 = [-1, 0, 0];
  assert.doesNotThrow(() => driveToward([0, 1, 0], wall, 10, { x: 0, y: 1 }));
  assert.ok(Number.isFinite(driveToward([0, 1, 0], wall, 10, { x: 1, y: 0 }).steer));

  // auto-poziomowanie: proste przypadki i brak chwiejnej równowagi na plecach
  assert.deepEqual(autoLevel([0, 1, 0]), { pitch: 0, roll: 0 }, 'prosto = bez korekty');
  const inverted = autoLevel([0, -1, 0]);
  assert.ok(inverted.roll !== 0, 'na plecach zawsze wybiera stronę obrotu');
  assert.ok(Math.abs(autoLevel([0.7, 0.7, 0]).roll) > 0.5 && Math.abs(autoLevel([0, 0.7, 0.7]).pitch) > 0.5);
  assert.ok(Math.abs(autoLevel([5, 5, 5]).pitch) <= 1 && Math.abs(autoLevel([5, 5, 5]).roll) <= 1, 'wejścia w skali −1…1');

  // parametry meczu i wartości domyślne
  assert.deepEqual([0, 1, 2, 9].map(goalLimitFor), [3, 5, 7, 5]);
  assert.equal(MATCH_SECONDS, 180); assert.ok(OVERTIME_MAX_SECONDS > 0 && OVERTIME_MAX_SECONDS <= 180, 'dogrywka ma sufit');

  // HUD i wynik na ręcznie zbudowanych migawkach
  const car = (over: Partial<LeagueCarStat>): LeagueCarStat => ({ index: 0, slot: 0, name: 'ALA', color: '#4ade80', team: 0, human: true, goals: 0, assists: 0, saves: 0, shots: 0, demos: 0, score: 0, boost: 40, demolished: false, ...over });
  const snap = (over: Partial<LeagueSnapshot> = {}): LeagueSnapshot => ({
    phase: 'playing', paused: false, scores: [2, 1], time: 95, overtime: false, countdown: 0, goalBanner: null, winner: -1, goalLimit: 5, toast: null,
    cars: [car({}), car({ index: 1, slot: 1, name: 'OLEK', team: 1, boost: 100, goals: 1 }), car({ index: 2, slot: 2, name: 'BOT 3', human: false, team: 1 })], ...over,
  });
  const hud = snapshotToHud(snap(), 'pl');
  assert.equal(hud.players.length, 2, 'HUD pokazuje tylko ludzi'); assert.deepEqual(hud.players.map(p => p.slot), [0, 1]);
  assert.match(hud.objective, /NIEBIESCY 2 : 1 POMARAŃCZOWI · do 5 goli/);
  assert.equal(hud.players[1].value, 100); assert.equal(hud.players[1].maxValue, 100); assert.equal(hud.players[1].score, 1);
  assert.equal(hud.timeLeft, 95); assert.equal(hud.countdown, 0); assert.equal(hud.paused, false);
  assert.match(snapshotToHud(snap(), 'en').objective, /BLUE 2 : 1 ORANGE · first to 5/);
  assert.equal(snapshotToHud(snap({ phase: 'countdown', countdown: 2 }), 'pl').countdown, 2);
  assert.equal(snapshotToHud(snap({ phase: 'goal', countdown: 2 }), 'pl').countdown, 0, 'odliczanie tylko w fazie odliczania');
  assert.equal(snapshotToHud(snap({ paused: true }), 'pl').paused, true);
  assert.match(snapshotToHud(snap({ goalBanner: { team: 0, name: 'ALA', speed: 88 }, phase: 'goal' }), 'pl').status, /GOL! ALA · 88 km\/h/);
  assert.match(snapshotToHud(snap({ goalBanner: { team: 0, name: 'ALA', speed: 88 }, phase: 'goal' }), 'en').status, /GOAL! ALA/);
  assert.match(snapshotToHud(snap({ phase: 'replay' }), 'pl').status, /POWTÓRKA/);
  assert.match(snapshotToHud(snap({ overtime: true }), 'pl').status, /DOGRYWKA/);
  assert.equal(snapshotToHud(snap({ toast: 'OBRONA!' }), 'pl').status, 'OBRONA!');
  assert.match(snapshotToHud(snap({ cars: [car({ demolished: true })] }), 'pl').players[0].detail, /ZDEMOLOWANY/);
  assert.equal(snapshotToHud(snap({ time: -4 }), 'pl').timeLeft, 0, 'czas nie schodzi poniżej zera');

  // wynik: wszyscy ludzie w zwycięskiej drużynie → allWon; ludzie po obu stronach → MVP zwycięzców; boty wygrały → nikt
  const together = resultFromSnapshot(snap({ phase: 'ended', winner: 0, scores: [5, 3], cars: [car({ goals: 3, score: 340 }), car({ index: 1, slot: 1, name: 'OLEK', team: 0, goals: 1, score: 150 }), car({ index: 2, slot: 2, human: false, team: 1 })] }), 'pl');
  assert.equal(together.allWon, true); assert.equal(together.winnerSlot, null); assert.equal(together.title, 'NIEBIESCY WYGRYWAJĄ');
  assert.match(together.players[0].detail, /5 : 3 · gole 3/);
  const split = resultFromSnapshot(snap({ phase: 'ended', winner: 1, scores: [2, 4], cars: [car({ goals: 2, score: 240 }), car({ index: 1, slot: 1, name: 'OLEK', team: 1, goals: 3, score: 330 })] }), 'pl');
  assert.equal(split.allWon, false, 'przegrany nigdy nie dostaje allWon'); assert.equal(split.winnerSlot, 1); assert.equal(split.title, 'POMARAŃCZOWI WYGRYWAJĄ');
  assert.match(split.players[0].detail, /NIEBIESCY · 2 : 4/, 'wynik drużynowy w detail każdego gracza');
  const lost = resultFromSnapshot(snap({ phase: 'ended', winner: 1, scores: [1, 3], cars: [car({}), car({ index: 1, slot: 1, human: false, team: 1 })] }), 'pl');
  assert.equal(lost.allWon, false); assert.equal(lost.winnerSlot, null, 'zwyciężyły boty — brak zwycięzcy wśród ludzi');
  const draw = resultFromSnapshot(snap({ phase: 'ended', winner: 2, scores: [2, 2] }), 'en');
  assert.equal(draw.title, 'DRAW'); assert.equal(draw.winnerSlot, null); assert.equal(draw.allWon, false);
  assert.equal(resultFromSnapshot(snap({ phase: 'ended', winner: 2 }), 'pl').title, 'REMIS');
  const bestOf = resultFromSnapshot(snap({ phase: 'ended', winner: 0, cars: [car({ goals: 1, score: 100 }), car({ index: 1, slot: 1, team: 0, goals: 2, score: 250 }), car({ index: 2, slot: 2, name: 'ZOSIA', team: 1 })] }), 'pl');
  assert.equal(bestOf.winnerSlot, 1, 'MVP zwycięskiej drużyny, gdy ludzie są po obu stronach');
  assert.equal(resultFromSnapshot(snap({ phase: 'ended', winner: 0, scores: [3, 0], cars: [car({ goals: 3 })] }), 'en').title, 'BLUE TEAM WINS');
  console.log('LEAGUE BRIDGE SELFTEST: OK (składy 1–4 aut, gałka, klawisze, sterowanie, HUD i wynik w PL/EN)');
}

/* ================================== 2. sterowanie na prawdziwej fizyce Car */

{
  const events = {};
  const f = new Vector3(), n = new Vector3(0, 1, 0);
  const fwd = (car: Car): Vec3 => { car.forward(f); return [f.x, f.y, f.z]; };
  const heading = (car: Car) => { car.forward(f); return Math.atan2(-f.x, -f.z); };
  const errorTo = (car: Car, stick: { x: number; y: number }): number => { const w = stickToWorld(stick.x, stick.y); return headingError(fwd(car), [n.x, n.y, n.z], [w.x, 0, w.z]); };
  const drive = (car: Car, stick: { x: number; y: number }, boost: boolean, seconds: number, onStep?: (t: number) => void) => {
    for (let t = 0; t < seconds; t += STEP) {
      const cmd = driveToward(fwd(car), car.grounded ? [car.groundN.x, car.groundN.y, car.groundN.z] : UP, car.fwdSpeed, stick);
      car.input.throttle = cmd.throttle; car.input.steer = cmd.steer; car.input.handbrake = cmd.handbrake; car.input.boost = boost;
      car.step(STEP, events);
      onStep?.(t);
    }
  };
  /** Start po stronie +X, żeby auto jadące „w górę ekranu” (−X) miało ~75 m rozbiegu i nie wspinało się na ścianę w trakcie pomiaru. */
  const fresh = (yaw: number, speed = 0) => {
    const car = new Car(0, 0, 'T', true);
    car.placeAt(34, 0, yaw);
    car.forward(f);
    car.vel.copy(f).multiplyScalar(speed);
    for (let i = 0; i < 30; i++) car.step(STEP, events); // osiada na kołach
    return car;
  };

  // REGRESJA fizyki z paczki: skręt nie może pompować prędkości (tarcie boczne zamieniało całą utraconą
  // prędkość boczną na przód, więc koło z pełnym skrętem rozpędzało auto do 23 m/s bez boosta)
  {
    const car = new Car(0, 0, 'T', true);
    car.placeAt(0, 0, 0);
    for (let i = 0; i < 30; i++) car.step(STEP, events);
    let top = 0;
    for (let t = 0; t < 8; t += STEP) {
      car.input.throttle = 1; car.input.steer = 1; car.input.boost = false; car.input.handbrake = false;
      car.step(STEP, events);
      top = Math.max(top, car.vel.length());
    }
    assert.ok(top <= 14.6, `koło z pełnym skrętem i gazem rozpędziło auto do ${top.toFixed(1)} m/s (limit jazdy to 14,1)`);
  }
  // gałka na ekranie „w górę” (−X): z każdego kursu auto ma się zawrócić, ustalić i nie kołysać
  const stick = { x: 0, y: 1 };
  for (const [label, yaw] of [['w lewo 90°', 0], ['na wprost', Math.PI / 2], ['w prawo 90°', Math.PI], ['zawrócić 180°', (3 * Math.PI) / 2], ['ukos 135°', (5 * Math.PI) / 4], ['ukos 45°', (7 * Math.PI) / 4]] as const) {
    for (const speed of [0, 11]) {
      const car = fresh(yaw, speed);
      let settledAt = -1, worstAfter = 0;
      drive(car, stick, false, 5, t => {
        const error = Math.abs(errorTo(car, stick));
        if (settledAt < 0 && error < 0.12) settledAt = t;
        if (settledAt >= 0 && t > 3.2) worstAfter = Math.max(worstAfter, error);
      });
      assert.ok(settledAt >= 0 && settledAt < 3.2, `${label} z ${speed} m/s: kurs nie ustalił się w 3,2 s (zbieżność ${settledAt})`);
      assert.ok(worstAfter < 0.22, `${label} z ${speed} m/s: auto kołysze się po ustaleniu kursu (${worstAfter.toFixed(2)} rad)`);
      assert.ok(car.fwdSpeed > 6, `${label} z ${speed} m/s: auto nie przyspiesza po zawróceniu (${car.fwdSpeed.toFixed(1)} m/s)`);
    }
  }
  // znak skrętu: gałka w prawo od kursu faktycznie obraca auto w prawo (zgodnie z ruchem wskazówek zegara z góry)
  {
    const car = fresh(Math.PI / 2, 8);                       // jedzie −X (góra ekranu)
    const before = heading(car);
    drive(car, { x: 1, y: 1 }, false, 0.6);                  // gałka w prawo-górę ⇒ −X −Z
    const turned = heading(car) - before;
    assert.ok(Math.abs(Math.atan2(Math.sin(turned), Math.cos(turned))) > 0.05, 'auto skręca');
    car.forward(f);
    assert.ok(f.z < -0.1, `po gałce w prawo auto powinno jechać ku −Z (prawo ekranu), a jedzie f=(${f.x.toFixed(2)}, ${f.z.toFixed(2)})`);
  }
  // przyspiesza po wychyleniu gałki i hamuje po puszczeniu
  {
    const car = fresh(Math.PI / 2, 0);
    drive(car, { x: 0, y: 1 }, false, 3);
    assert.ok(car.fwdSpeed > 9 && car.fwdSpeed <= 14.5, `bez boosta prędkość mieści się w limicie jazdy (${car.fwdSpeed.toFixed(1)})`);
    drive(car, { x: 0, y: 0 }, false, 3.5);
    assert.ok(Math.abs(car.fwdSpeed) < 1.2, `puszczona gałka zatrzymuje auto (${car.fwdSpeed.toFixed(1)} m/s)`);
  }
  // boost przekracza limit jazdy i zużywa zasób
  {
    const car = fresh(Math.PI / 2, 0);
    const boost0 = car.boost;
    drive(car, { x: 0, y: 1 }, true, 2.5);
    assert.ok(car.fwdSpeed > 17, `boost rozpędza ponad zwykły limit (${car.fwdSpeed.toFixed(1)} m/s)`);
    assert.ok(car.boost < boost0 - 20, 'boost zużywa zasób');
    const empty = fresh(Math.PI / 2, 0); empty.boost = 0;
    drive(empty, { x: 0, y: 1 }, true, 3);
    assert.ok(empty.fwdSpeed <= 14.5, 'pusty boost nie przyspiesza ponad limit');
  }
  // auto-poziomowanie w powietrzu: z dowolnej orientacji ląduje na kołach
  {
    let upright = 0;
    const total = 12;
    for (let seed = 0; seed < total; seed++) {
      const car = new Car(0, 0, 'T', true);
      car.placeAt(0, 0, 0);
      for (let i = 0; i < 20; i++) car.step(STEP, events);
      car.pos.set((seed % 4) * 3 - 4, 7, -((seed % 3) * 5));
      car.vel.set(0, 0, 0);
      const angle = (seed + 1) * 0.9;
      car.quat.set(Math.sin(angle) * 0.6, Math.cos(angle * 1.3) * 0.5, Math.sin(angle * 2.1) * 0.6, Math.cos(angle) * 0.7).normalize();
      car.angVel.set(0, 0, 0);
      car.grounded = false; car.noGroundTimer = 0;
      const q = car.quat.clone(), a = new Vector3();
      for (let t = 0; t < 5; t += STEP) {
        q.copy(car.quat).invert(); a.set(0, 1, 0).applyQuaternion(q);
        const level = car.grounded ? { pitch: 0, roll: 0 } : autoLevel([a.x, a.y, a.z]);
        car.input.throttle = 0; car.input.steer = 0; car.input.pitch = level.pitch; car.input.roll = level.roll;
        car.step(STEP, events);
      }
      car.up(f);
      if (car.grounded && f.y > 0.8) upright++;
    }
    assert.ok(upright >= total - 1, `auto-poziomowanie: tylko ${upright}/${total} aut wylądowało na kołach`);
  }
  console.log('LEAGUE CONTROL SELFTEST: OK (zbieżność kursu z 12 stanów, znak skrętu, hamowanie, boost, auto-poziomowanie na prawdziwej fizyce)');
}

/* REGRESJA smugi z paczki: `Trail.update` nie może rzucać dla smugi krótszej niż jej pojemność. */
{
  const camera = new Vector3(0, 40, 40);
  for (const capacity of [16, 30]) {
    for (let points = 0; points <= capacity + 3; points++) {
      const trail = new Trail(capacity, 0.3);
      for (let i = 0; i < points; i++) trail.push(new Vector3(i, 0.5, -i));
      assert.doesNotThrow(() => trail.update(camera, 0.9), `Trail(${capacity}) z ${points} punktami rzuca wyjątek`);
    }
  }
}

/* ================================================== 3. tłumaczenia i branding */

{
  const sources = ['LeagueGame', 'stadium', 'textures', 'bridge', 'LeagueRound'].map(name => [name, readFileSync(`src/arcade/league-next/${name}.ts`, 'utf8')] as const);
  for (const [name, text] of sources) assert.ok(!/NITRO/i.test(text.replace(/nitro-league\.zip/gi, '')), `${name}: został branding paczki („NITRO”) — gra nazywa się Turbo League`);
  const game = sources[0][1];
  // każdy napis wystawiony graczowi przez this.t('pl','en') ma obie wersje i jest niepusty
  const pairs = [...game.matchAll(/this\.t\('((?:[^'\\]|\\.)*)', '((?:[^'\\]|\\.)*)'\)/g)];
  assert.ok(pairs.length >= 8, 'parser komunikatów przestał widzieć kod silnika');
  for (const [, pl, en] of pairs) { assert.ok(pl.length > 0 && en.length > 0 && pl !== en || /^[A-Z0-9 ]+$/.test(pl), `napis bez pary PL/EN: ${pl}`); }
  console.log(`LEAGUE STRINGS SELFTEST: OK (${pairs.length} komunikatów z parą PL/EN, brak brandingu paczki)`);
}

/* ====================================================== 4. mecz w harnessie */

/** Prawdziwy `console.error` — test wycisza go na czas meczu, ale awaria testu musi być widoczna. */
const nativeError = console.error;
/** Wszystko, co silnik zalogował przez `console.error` w trakcie meczu (pętla gry łapie wyjątki i tylko je loguje). */
const logged: unknown[][] = [];
interface Session {
  round: LeagueNextRound;
  host: ReturnType<typeof fakeElement>;
  huds: RoundHud[];
  finishes: RoundResult[];
  fx: { slot: number; fx: string }[];
  moments: MomentEvent[];
  pads: PadInput[];
  game: any;
  renderer: any;
  errors: unknown[];
}

function createSession(spec: string, over: Partial<RoundConfig> = {}): Session {
  const host = fakeElement('div');
  const canvas = fakeElement('canvas');
  canvas.parentElement = host;
  host.children.push(canvas);
  const pads: PadInput[] = [0, 1, 2, 3].map(() => ({ fwd: 0, turn: 0, fire: false }));
  const huds: RoundHud[] = [], finishes: RoundResult[] = [], fx: Session['fx'] = [], moments: MomentEvent[] = [], errors: unknown[] = [];
  let renderer: any = null;
  const config: RoundConfig = {
    players: racers(spec), padInputs: pads, primary: 0, secondary: 0, quality: 'balanced', language: 'pl',
    onHud: hud => huds.push(hud), onFinish: result => finishes.push(result), onFx: (slot, effect) => fx.push({ slot, fx: effect }),
    onMoment: event => moments.push(event), onFrame: () => undefined, ...over,
  };
  const round = new LeagueNextRound(canvas as unknown as HTMLCanvasElement, config, {
    createRenderer: target => (renderer = fakeRenderer(target)) as never,
    makeEnvironment: () => new Texture(),
  });
  return { round, host, huds, finishes, fx, moments, pads, errors, get game() { return (round as any).game; }, get renderer() { return renderer; } } as Session;
}

const approx = (value: number, expected: number, tolerance: number, label: string) => assert.ok(Math.abs(value - expected) <= tolerance, `${label}: ${value} ≠ ${expected} ±${tolerance}`);

/** Doprowadza mecz do fazy gry (po odliczaniu) i zwraca czas, jaki to zajęło. */
const intoPlay = (h: ReturnType<typeof installBrowserFakes>, s: Session) => { h.seconds(4); assert.equal(s.game.phase, 'playing', 'po odliczaniu trwa gra'); };

/** Strzela gola drużyny `team` (0 = niebiescy bramka −Z): piłka tuż za linią, jedna klatka fizyki. */
const scoreGoal = (h: ReturnType<typeof installBrowserFakes>, s: Session, team: number, touchCar = -1) => {
  const ball = s.game.ball;
  ball.pos.set(0, 1.2, (team === 0 ? -1 : 1) * (B + BALL_R + 0.2));
  ball.vel.set(0, 0, team === 0 ? -20 : 20);
  ball.lastTouchCar = touchCar;
  h.frames(2);
};

/** Przechodzi przez oprawę gola (zwolnione tempo, powtórka, wznowienie) do następnego odliczania albo końca meczu. */
const throughGoal = (h: ReturnType<typeof installBrowserFakes>, s: Session) => { for (let i = 0; i < 30 && s.game.phase !== 'countdown' && s.game.phase !== 'ended'; i++) h.seconds(1); };

async function run() {
  const originalError = console.error;
  console.error = (...args: unknown[]) => { logged.push(args); };
  const noLoopErrors = (label: string) => assert.equal(logged.filter(args => String(args[0]).includes('Błąd pętli gry')).length, 0, `${label}: pętla gry zgłosiła wyjątek: ${String(logged[0]?.[1])}`);

  /* --- 4a. całość meczu: 1 człowiek + 3 boty, trzy gole niebieskich do limitu --- */
  {
    const h = installBrowserFakes();
    const baseline = h.listenerCount();
    const s = createSession('HBBB', { primary: 0 });
    h.frames(3);
    assert.equal(s.huds.length, 0, 'przed start() platforma nie dostaje HUD-u ani meczu');
    s.round.start();
    h.frames(2);
    assert.ok(s.huds.length > 0); assert.equal(s.huds[0].countdown, 3); approx(s.huds[0].timeLeft, 180, 0.001, 'czas meczu');
    assert.deepEqual(s.huds[0].players.map(p => p.slot), [0], 'HUD pokazuje człowieka');
    assert.equal(s.host.children.length, 2, 'minimapa zamontowana obok płótna');
    assert.match(s.huds[0].objective, /do 3 goli/);
    const roster = (s.round as any).roster;
    assert.deepEqual(roster.map((e: any) => e.team), [0, 1, 0, 1], 'skład 2v2: człowiek z botem przeciw dwóm botom');
    assert.equal(s.game.cars.length, 4); assert.equal(s.game.cars.filter((c: Car) => c.isPlayer).length, 1);
    assert.equal(s.game.cars[0].isPlayer, true, 'człowiek ma auto 0'); assert.ok(s.game.markers[0], 'etykieta nad autem człowieka'); assert.equal(s.game.markers[1], undefined, 'boty bez etykiet');
    const kickoffZ = s.game.cars.map((c: Car) => Math.sign(c.pos.z));
    assert.deepEqual(kickoffZ, [1, -1, 1, -1], 'niebiescy startują po stronie +Z, pomarańczowi po −Z');
    intoPlay(h, s);
    assert.ok(s.huds.some(hud => hud.countdown === 2) && s.huds.some(hud => hud.countdown === 1), 'odliczanie 3…2…1 widoczne w HUD');
    approx(s.huds[s.huds.length - 1].timeLeft, 180, 1.2, 'zegar rusza dopiero po odliczaniu');

    scoreGoal(h, s, 0, 0);
    assert.equal(s.game.phase, 'goal'); assert.deepEqual(s.game.scores, [1, 0]);
    h.seconds(0.5);
    assert.match(s.huds[s.huds.length - 1].status, /GOL! GRACZ 1/, 'baner gola z nazwiskiem strzelca');
    const clockAtGoal = s.game.timeLeft; h.seconds(2);
    approx(s.game.timeLeft, clockAtGoal, 0.001, 'czas meczu nie ucieka podczas oprawy gola');
    throughGoal(h, s);
    assert.ok(s.huds.some(hud => /POWTÓRKA/.test(hud.status)), 'po golu jest powtórka');
    assert.equal(s.game.phase, 'countdown', 'po powtórce kolejne wznowienie z odliczaniem');
    assert.equal(s.game.ball.pos.length() < 1, true, 'piłka wraca na środek');
    intoPlay(h, s);
    scoreGoal(h, s, 0, 0); throughGoal(h, s); intoPlay(h, s);
    scoreGoal(h, s, 0, 0);
    throughGoal(h, s);
    assert.equal(s.game.phase, 'ended', 'trzeci gol osiąga limit i kończy mecz'); assert.deepEqual(s.game.scores, [3, 0]);
    assert.equal(s.finishes.length, 0, 'wynik pojawia się po oprawie końcowej, nie natychmiast');
    h.seconds(4);
    assert.equal(s.finishes.length, 1, 'onFinish dokładnie raz');
    const result = s.finishes[0];
    assert.equal(result.title, 'NIEBIESCY WYGRYWAJĄ'); assert.equal(result.allWon, true, 'jedyny człowiek jest w zwycięskiej drużynie');
    assert.deepEqual(result.players.map(p => p.slot), [0]); assert.equal(result.players[0].score, 3, 'gole strzelca w wyniku');
    assert.match(result.players[0].detail, /3 : 0 · gole 3/);
    const before = s.huds.length; h.seconds(2);
    assert.equal(s.huds.length, before, 'po wyniku HUD nie płynie dalej'); assert.equal(s.finishes.length, 1);
    for (const hud of s.huds) { assert.ok(Number.isFinite(hud.timeLeft) && hud.timeLeft >= 0 && hud.timeLeft <= 180.001, 'czas HUD w granicach'); for (const p of hud.players) assert.ok(Number.isFinite(p.score) && (p.value ?? 0) >= 0 && (p.value ?? 0) <= 100, 'liczby HUD'); }
    for (const m of s.moments) assert.ok(m.weight! >= 20 && m.weight! <= 120 && m.at! >= 0 && m.slot === 0 && m.detail.length > 0, 'Moment w kontrakcie');
    assert.ok(s.moments.filter(m => m.kind === 'score' && m.title === 'Gol').length >= 2, 'gole człowieka trafiają do Moments');
    noLoopErrors('mecz do limitu');
    s.round.destroy();
    assert.equal(h.listenerCount(), baseline, 'destroy() zwalnia wszystkie nasłuchy'); assert.equal(s.host.children.length, 1, 'minimapa zdjęta z DOM');
    assert.ok(s.renderer.counters.dispose >= 1, 'renderer zwolniony'); assert.doesNotThrow(() => s.round.destroy(), 'podwójne destroy');
    const afterDestroy = s.huds.length; h.frames(20); assert.equal(s.huds.length, afterDestroy, 'pętla stoi po destroy');
    h.restore();
  }

  /* --- 4b. czas, dogrywka z sufitem, złoty gol, uczciwy remis --- */
  {
    const h = installBrowserFakes();
    const s = createSession('HH', { primary: 2 });   // do 7 goli — limit nie przeszkadza
    s.round.start(); intoPlay(h, s);
    scoreGoal(h, s, 1, 1); throughGoal(h, s); intoPlay(h, s);          // 0:1
    scoreGoal(h, s, 0, 0); throughGoal(h, s); intoPlay(h, s);          // 1:1
    s.game.timeLeft = 0.15; h.seconds(0.6);
    assert.equal(s.game.overtime, true, 'remis po czasie → dogrywka'); assert.equal(s.game.phase, 'playing', 'dogrywka nie kończy meczu');
    assert.match(s.huds[s.huds.length - 1].status, /DOGRYWKA/);
    approx(s.huds[s.huds.length - 1].timeLeft, OVERTIME_MAX_SECONDS, 1, 'zegar dogrywki odlicza od sufitu');
    scoreGoal(h, s, 1, 1); throughGoal(h, s);
    assert.equal(s.game.phase, 'ended', 'złoty gol kończy mecz'); h.seconds(4);
    assert.equal(s.finishes.length, 1); assert.equal(s.finishes[0].title, 'POMARAŃCZOWI WYGRYWAJĄ');
    assert.equal(s.finishes[0].winnerSlot, 1, 'ludzie po obu stronach: zwycięzcą jest człowiek z wygrywającej drużyny'); assert.equal(s.finishes[0].allWon, false);
    assert.ok(s.moments.some(m => m.title === 'Złoty gol w dogrywce' && m.weight === 120 && m.slot === 1), 'złoty gol w Moments');
    assert.ok(s.moments.some(m => m.title === 'Wyrównanie w końcówce' || m.title === 'Gol'), 'wcześniejsze gole też');
    s.round.destroy(); h.restore();

    const h2 = installBrowserFakes();
    const t = createSession('HH', { primary: 2 });
    t.round.start(); intoPlay(h2, t);
    t.game.timeLeft = 0.1; h2.seconds(0.5);
    assert.equal(t.game.overtime, true);
    t.game.overtimeT = OVERTIME_MAX_SECONDS - 0.05; h2.seconds(0.5);
    assert.equal(t.game.phase, 'ended', 'sufit dogrywki kończy mecz'); h2.seconds(4);
    assert.equal(t.finishes.length, 1); assert.equal(t.finishes[0].title, 'REMIS'); assert.equal(t.finishes[0].winnerSlot, null); assert.equal(t.finishes[0].allWon, false);
    t.round.destroy(); h2.restore();

    const h3 = installBrowserFakes();
    const u = createSession('HB', { primary: 2, language: 'en' });
    u.round.start(); intoPlay(h3, u);
    scoreGoal(h3, u, 0, 0); throughGoal(h3, u); intoPlay(h3, u);
    u.game.ball.pos.set(0, 1, 0); u.game.ball.vel.set(0, 0, 0);
    u.game.timeLeft = 0.1; h3.seconds(0.6);
    assert.equal(u.game.phase, 'ended', 'prowadzenie po czasie i piłka na ziemi → koniec bez dogrywki'); h3.seconds(4);
    assert.equal(u.finishes[0].title, 'BLUE TEAM WINS'); assert.equal(u.finishes[0].allWon, true);
    u.round.destroy(); h3.restore();
    noLoopErrors('dogrywka i remis');
  }

  /* --- 4c. samobój, asysta, obrona, haptyka --- */
  {
    const h = installBrowserFakes();
    const s = createSession('HHB', { primary: 2 });
    s.round.start(); intoPlay(h, s);
    const g = s.game;
    // asysta: dotyk partnera z drużyny strzelca w oknie 6 s, potem gol
    g.touches.push({ car: 2, time: g.time });   // bot (niebiescy) — asysta bota nie trafia do Moments
    g.touches.push({ car: 0, time: g.time });
    scoreGoal(h, s, 0, 0);
    assert.equal(g.stats[0].goals, 1);
    throughGoal(h, s); intoPlay(h, s);
    // samobój: ostatni dotyk przeciwnika w bramce niebieskich (gol pomarańczowych) — nie liczy się strzelcowi
    scoreGoal(h, s, 0, 1);
    assert.equal(g.stats[1].goals, 0, 'samobój nie wpisuje gola graczowi'); assert.deepEqual(g.scores, [2, 0], 'samobój zalicza wynik rywalom');
    h.seconds(0.5);
    assert.match(s.huds[s.huds.length - 1].status, /samobój/);
    assert.equal(s.moments.filter(m => m.slot === 1).length, 0, 'samobój nie trafia do Moments jako osiągnięcie');
    throughGoal(h, s); intoPlay(h, s);
    // obrona: strzał w światło bramki zatrzymany dotykiem rywala
    g.lastShot = { team: 1, time: g.time };
    g.onCarBall(g.cars[0], { power: 9, point: new Vector3() });
    assert.equal(g.stats[0].saves, 1); assert.ok(s.moments.some(m => m.title === 'Obrona' && m.slot === 0 && m.weight === 55), 'obrona w Moments');
    // haptyka: zderzenie z dużą siłą, odrodzenie
    s.fx.length = 0;
    g.onCarBall(g.cars[0], { power: 20, point: new Vector3() });
    assert.ok(s.fx.some(e => e.slot === 0 && e.fx === 'hit'), 'mocne uderzenie piłki wibruje padem');
    g.demolish(g.cars[1], g.cars[0]);
    assert.ok(s.fx.some(e => e.slot === 0 && e.fx === 'kill') && s.fx.some(e => e.slot === 1 && e.fx === 'dead'), 'demolka: kill dla atakującego, dead dla ofiary');
    assert.equal(g.stats[0].demos, 1);
    h.seconds(4); assert.ok(s.fx.some(e => e.slot === 1 && e.fx === 'respawn'), 'odrodzenie po 3 s');
    assert.ok(!s.fx.some(e => e.slot === 2), 'boty nie dostają haptyki');
    noLoopErrors('zdarzenia meczu'); s.round.destroy(); h.restore();
  }

  /* --- 4d. gałka porusza autem; auto-odwrócenie; pauza, widoczność, klawiatura --- */
  {
    const h = installBrowserFakes();
    const s = createSession('HH', { primary: 2 });
    s.round.start(); intoPlay(h, s);
    const car0 = s.game.cars[0] as Car, car1 = s.game.cars[1] as Car;
    const p0 = car0.pos.clone();
    s.pads[0] = { fwd: 0, turn: 0, fire: true, dirX: 1, dirY: 0 };      // gałka w prawo = −Z, z boostem
    h.seconds(1.5);
    assert.ok(car0.pos.z < p0.z - 3, `gałka w prawo przesuwa auto ku −Z (z: ${p0.z.toFixed(1)} → ${car0.pos.z.toFixed(1)})`);
    assert.ok(car0.boosting, 'przycisk pada = boost');
    assert.ok(Math.abs(car1.pos.z) > 20 && Math.abs(car1.vel.length()) < 3, 'auto bez wejścia stoi w miejscu');
    // auto-odwrócenie: na dachu bez ruchu → po 2,2 s wraca na koła
    s.pads[0] = { fwd: 0, turn: 0, fire: false };
    car0.pos.set(5, 1.5, 0); car0.vel.set(0, 0, 0); car0.quat.set(1, 0, 0, 0); car0.angVel.set(0, 0, 0); car0.grounded = false;
    car0.up(new Vector3());
    h.seconds(6);
    const up = new Vector3(); car0.up(up);
    assert.ok(up.y > 0.7, `auto zablokowane na dachu wraca na koła (up.y = ${up.y.toFixed(2)})`);

    s.round.togglePause(); h.frames(3);
    assert.equal(s.huds[s.huds.length - 1].paused, true, 'pauza z platformy');
    const frozen = s.huds[s.huds.length - 1].timeLeft; const pos = car0.pos.clone();
    s.pads[0] = { fwd: 0, turn: 0, fire: false, dirX: -1, dirY: 0 };
    h.seconds(2);
    approx(s.huds[s.huds.length - 1].timeLeft, frozen, 0.001, 'w pauzie czas stoi'); assert.ok(car0.pos.distanceTo(pos) < 0.001, 'w pauzie auta stoją');
    s.round.togglePause(); h.seconds(1);
    assert.equal(s.huds[s.huds.length - 1].paused, false); assert.ok(s.huds[s.huds.length - 1].timeLeft < frozen);
    (globalThis as any).document.hidden = true; h.dispatchDocument('visibilitychange'); h.frames(3);
    assert.equal(s.huds[s.huds.length - 1].paused, true, 'ukryta karta pauzuje mecz'); (globalThis as any).document.hidden = false;
    s.round.togglePause(); h.frames(2);
    h.dispatch('keydown', { code: 'Escape' }); h.frames(3); assert.equal(s.huds[s.huds.length - 1].paused, true, 'Esc pauzuje');
    h.dispatch('keydown', { code: 'Escape' }); h.frames(3); assert.equal(s.huds[s.huds.length - 1].paused, false);
    (globalThis as any).document.querySelector = () => ({});
    h.dispatch('keydown', { code: 'Escape' }); h.frames(3); assert.equal(s.huds[s.huds.length - 1].paused, false, 'gdy nad areną stoi okno, Esc należy do okna');
    (globalThis as any).document.querySelector = () => null;
    h.dispatch('keydown', { code: 'KeyD' }); assert.equal((s.round as any).keys.has('KeyD'), true); h.dispatch('blur'); assert.equal((s.round as any).keys.size, 0, 'blur zwalnia klawisze');
    gameAudio.muted = true; h.seconds(0.5); assert.equal(s.game.muted, true, 'wyciszenie z paska gry dociera do silnika'); gameAudio.muted = false; h.seconds(0.5); assert.equal(s.game.muted, false);
    noLoopErrors('sterowanie'); s.round.destroy(); h.restore();
  }

  /* --- 4e. kamera wspólna: wszyscy ludzie i piłka mieszczą się w kadrze --- */
  {
    const h = installBrowserFakes();
    const s = createSession('HHHH', { primary: 2 });
    s.round.start(); intoPlay(h, s);
    const g = s.game, cars = g.cars as Car[];
    const scenes: [number, number][][] = [
      [[-30, 40], [30, -40], [-30, -40], [30, 40]],       // cztery narożniki
      [[0, 0], [3, 2], [-3, -2], [2, -4]],                // kłębek na środku
      [[35, 0], [35, 10], [-35, 0], [0, 48]],             // przy bandach
    ];
    for (const [index, scene] of scenes.entries()) {
      cars.forEach((car, i) => { car.frozen = true; car.pos.set(scene[i][0], 0.4, scene[i][1]); car.vel.set(0, 0, 0); car.prevPos.copy(car.pos); });
      g.ball.pos.set(scene[0][0] * 0.5, 1, scene[0][1] * 0.5); g.ball.group.position.copy(g.ball.pos);
      h.seconds(5);
      const camera = g.camera; camera.updateMatrixWorld(); camera.updateProjectionMatrix();
      const check = (p: Vector3, label: string) => { const ndc = p.clone().project(camera); assert.ok(Math.abs(ndc.x) <= 1.02 && Math.abs(ndc.y) <= 1.02 && ndc.z < 1, `scena ${index}: ${label} poza kadrem (ndc ${ndc.x.toFixed(2)}, ${ndc.y.toFixed(2)})`); };
      cars.forEach((car, i) => check(car.pos, `auto ${i}`));
      check(g.ball.group.position, 'piłka');
      const dist = camera.position.distanceTo(g.focus);
      assert.ok(dist >= 29.9 && dist <= 92.1 && Number.isFinite(dist), `dystans kamery ${dist.toFixed(1)} w granicach`);
      assert.ok(camera.position.y > 15, 'kamera patrzy z góry (ponad bandą)');
      const tag = g.markers[0]; assert.ok(tag.sprite.visible && tag.sprite.scale.y > 0 && Number.isFinite(tag.sprite.scale.x), 'etykieta widoczna i skończona');
    }
    // etykieta ma stały rozmiar na ekranie niezależnie od zoomu: skala rośnie z odległością od kamery
    const tag = g.markers[0], farScale = tag.sprite.scale.y;
    cars.forEach((car, i) => { car.pos.set(i * 2, 0.4, 0); car.prevPos.copy(car.pos); }); g.ball.pos.set(0, 1, 0); g.ball.group.position.copy(g.ball.pos); h.seconds(6);
    assert.ok(tag.sprite.scale.y < farScale, 'przy ścisłym kadrze etykieta jest mniejsza w świecie (ta sama wielkość na ekranie)');
    noLoopErrors('kamera'); s.round.destroy(); h.restore();
  }

  /* --- 4f. zniszczenie przed startem, po starcie, błąd pętli, jeden gracz „trening” --- */
  {
    const h = installBrowserFakes();
    const baseline = h.listenerCount();
    const early = createSession('HB');
    assert.doesNotThrow(() => early.round.destroy(), 'destroy przed start()'); h.frames(5);
    assert.equal(early.huds.length, 0, 'zniszczona runda nie wysyła HUD-u'); assert.equal(h.listenerCount(), baseline);

    const idle = createSession('HB'); h.frames(30);
    assert.equal(idle.game.phase === 'countdown' && idle.huds.length === 0, true, 'bez start() mecz nie rusza'); assert.equal(idle.game.cars.length, 0, 'bez start() nie ma aut');
    idle.round.destroy();

    const training = createSession('H', { primary: 0 });
    training.round.start(); intoPlay(h, training);
    assert.equal(training.game.cars.length, 1, 'trening: jedno auto'); assert.equal(training.huds[0].players.length, 1);
    scoreGoal(h, training, 0, 0); throughGoal(h, training); intoPlay(h, training);
    scoreGoal(h, training, 0, 0); throughGoal(h, training); intoPlay(h, training);
    scoreGoal(h, training, 0, 0); throughGoal(h, training); h.seconds(4);
    assert.equal(training.finishes.length, 1); assert.equal(training.finishes[0].allWon, true, 'w treningu trzy gole do pustej bramki to wygrana');
    training.round.destroy();

    const broken = createSession('HB'); broken.round.start(); h.frames(5);
    logged.length = 0;
    broken.game.stadium.update = () => { throw new Error('boom'); };
    h.frames(5);
    assert.equal(broken.finishes.length, 1, 'błąd silnika kończy rundę jednym komunikatem'); assert.match(broken.finishes[0].title, /MECZ SIĘ WYWRÓCIŁ/);
    assert.ok(broken.finishes[0].players.every(p => p.score === 0)); broken.round.destroy(); h.frames(3);
    assert.equal(h.listenerCount(), baseline, 'żaden test nie zostawił nasłuchów');
    h.restore();
  }

  console.error = originalError;
  console.log('LEAGUE ENGINE SELFTEST: OK (mecz od startu do wyniku, gole, limit, dogrywka z sufitem, samobój/asysta/obrona, pauza, kamera, sprzątanie, błąd silnika)');
}

run().catch(error => {
  console.error = nativeError;
  console.error(error);
  if (logged.length) console.error('Zalogowane przez silnik w trakcie testu:', ...logged.slice(0, 2).map(args => args.map(arg => (arg instanceof Error ? arg.stack : String(arg))).join(' ')));
  process.exit(1);
});
