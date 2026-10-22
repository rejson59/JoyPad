/**
 * Szybki test logiki JoyPad bez serwera, przeglądarki i internetu.
 * npm run selftest:arcade
 */
import assert from 'node:assert/strict';
import type { PadLink } from '../src/net/links';
import type { PadInput, PadMessage } from '../src/net/protocol';
import { keySetFor } from '../src/arcade/runtime';
import { RaceRound } from '../src/arcade/games/Race';
import { OrbitRound } from '../src/arcade/games/Orbit';
import { SnakeRound } from '../src/arcade/games/Snake';
import { LeagueRound } from '../src/arcade/games/League';
import { Kart } from '../src/arcade/neon/kart';
import { Track, BARRIER } from '../src/arcade/neon/track';
import { Vector3 } from 'three';
import { mat4LookAt, mat4Multiply, mat4Perspective } from '../src/arcade/webgl/runtime3d';
import type { CanvasRound, RoundConfig, RoundResult } from '../src/arcade/runtime';

(globalThis as unknown as { window: Window }).window = globalThis as unknown as Window;
(globalThis as unknown as { location: Location }).location = { search: '', hash: '', origin: 'https://example.com', pathname: '/JoyPad/' } as Location;
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => { store.set(key, value); },
  removeItem: (key: string) => { store.delete(key); },
} as Storage;

function mockLink(id: string): PadLink & { sent: unknown[] } {
  const link = {
    id, kind: 'webrtc' as const, open: true, sent: [] as unknown[],
    send(message: unknown) { link.sent.push(message); },
    onMessage() {}, onClosed() {}, close() {},
  };
  return link;
}

const { PadHost } = await import('../src/net/padHost');
const { PadClient } = await import('../src/net/padClient');
const { PLAYER_DEFS } = await import('../src/game/types');
const host = new PadHost();
host.setSlotMeta(PLAYER_DEFS.map(p => ({ name: p.name, color: p.color, darkColor: p.darkColor })));
host.setScreen('lobby');
const commands: string[] = [];
host.onAdminCommand = command => { commands.push(command); };
const picks: number[] = [];
host.onGameChoice = index => { picks.push(index); };
const links = ['first', 'second', 'third'].map(mockLink);
for (const [i, link] of links.entries()) {
  // Prywatne metody są zwykłymi metodami JS; mock transportu sprawdza realny handshake.
  (host as unknown as { conns: Map<string, PadLink> }).conns.set(link.id, link);
  (host as unknown as { onMessage: (l: PadLink, m: PadMessage) => void }).onMessage(link, { t: 'hello', nick: `Telefon ${i + 1}`, ua: 'test', v: 1, pid: `device-${i}` });
  assert.equal(host.padForSlot(i)?.nick, `Telefon ${i + 1}`);
}
assert.equal(host.session().adminSlot, 0);
assert.deepEqual(host.session().roster.map(p => p.slot), [0, 1, 2]);
const receive = (index: number, msg: PadMessage) => (host as unknown as { onMessage: (l: PadLink, m: PadMessage) => void }).onMessage(links[index], msg);
// Intent is per-connection, available to all players, and never starts a round.
host.setGame('race'); host.setScreen('menu');
receive(1, { t: 'intent', kind: 'ready', value: true });
assert.equal(host.session().roster[1].ready, true);
assert.equal(host.session().roster[0].ready, false);
receive(1, { t: 'intent', kind: 'ready', value: false });
assert.equal(host.session().roster[1].ready, false);
receive(1, { t: 'intent', kind: 'ready', value: true });
receive(1, { t: 'intent', kind: 'rematch', value: true });
assert.equal(host.session().roster[1].rematch, false);
receive(1, { t: 'intent', kind: 'ready', value: 'yes' } as unknown as PadMessage);
receive(1, { t: 'intent', kind: '__proto__', value: true } as unknown as PadMessage);
assert.equal(host.session().roster[1].ready, true);
host.setMenuOptions({ primaryLabel: 'laps', primaryValue: '3', secondaryLabel: 'bots', secondaryValue: '2' });
assert.equal(host.session().roster[1].ready, false, 'settings invalidate readiness');
receive(1, { t: 'intent', kind: 'ready', value: true });
host.setMenuOptions({ primaryLabel: 'laps', primaryValue: '3', secondaryLabel: 'bots', secondaryValue: '2' });
assert.equal(host.session().roster[1].ready, true, 'same settings do not reset a vote');
host.setScreen('game');
receive(1, { t: 'intent', kind: 'ready', value: true });
assert.equal(host.session().roster[1].ready, false);
host.setScreen('over');
receive(2, { t: 'intent', kind: 'rematch', value: true });
assert.equal(host.session().roster[2].rematch, true);
assert.deepEqual(commands, [], 'a rematch vote is not a host command');
host.setGame(null); host.setScreen('lobby');
assert.ok(host.session().roster.every(p => !p.ready && !p.rematch));
console.log('SESSION INTENT SELFTEST: OK (authority, validation, toggles, settings reset, game boundaries)');
receive(1, { t: 'command', command: 'home' });
receive(2, { t: 'choose', index: 4 });
assert.deepEqual(commands, []); assert.deepEqual(picks, []);
receive(0, { t: 'command', command: 'select' });
receive(0, { t: 'choose', index: 2 });
assert.deepEqual(commands, ['select']); assert.deepEqual(picks, [2]);
receive(0, { t: 'choose', index: 999 });
assert.deepEqual(picks, [2]);
receive(0, { t: 'nick', nick: '  Ada   Nowak  ' });
assert.equal(host.padForSlot(0)?.nick, 'Ada Nowak');
assert.equal(host.session().roster.find(p => p.slot === 0)?.nick, 'Ada Nowak');
assert.ok(links[0].sent.some(m => (m as { t: string }).t === 'nick'));
// Duplikat hello nie zabiera nowego slotu, a ponawia welcome po utraconym pakiecie.
receive(0, { t: 'hello', nick: 'dup', ua: 'test', v: 1, pid: 'device-0' });
assert.equal(host.snapshot().pads.length, 3);
assert.equal(links[0].sent.filter((m) => (m as { t: string }).t === 'welcome').length, 2);
(host as unknown as { dropConn: (id: string) => void }).dropConn(links[0].id);
assert.equal(host.session().adminSlot, 1);
receive(2, { t: 'command', command: 'home' }); assert.deepEqual(commands, ['select']);
receive(1, { t: 'command', command: 'home' }); assert.deepEqual(commands, ['select', 'home']);
const replacement = mockLink('fourth');
(host as unknown as { conns: Map<string, PadLink> }).conns.set(replacement.id, replacement);
(host as unknown as { onMessage: (l: PadLink, m: PadMessage) => void }).onMessage(replacement, { t: 'hello', nick: 'Nowy', ua: 'test', v: 1, pid: 'device-4' });
assert.equal(host.slotOf(replacement.id), 0); // wolny slot odzyskany
assert.equal(host.session().adminSlot, 1); // ale najstarszy AKTYWNY telefon nadal rządzi
host.setGame('race'); host.setScreen('game');
assert.equal(host.session().game, 'race');
assert.equal((replacement.sent.at(-1) as { t: string }).t, 'session');
host.setGame(null);
assert.equal(host.session().game, null);
assert.equal(host.session().screen, 'lobby');
host.stop();

const client = new PadClient();
(client as unknown as { onMessage: (l: PadLink, m: unknown) => void }).onMessage(mockLink('server'), { t: 'nick', nick: 'Ada Nowak' });
assert.equal(client.state.nick, 'Ada Nowak');
(client as unknown as { onMessage: (l: PadLink, m: unknown) => void }).onMessage(mockLink('server'), { t: 'session', session: { game: 'snake', screen: 'menu', selection: 3, adminSlot: 1, roster: [{ slot: 1, nick: 'Nowy' }] } });
assert.equal(client.state.game, 'snake'); assert.equal(client.state.adminSlot, 1);
(client as unknown as { onMessage: (l: PadLink, m: unknown) => void }).onMessage(mockLink('server'), { t: 'arcadeHud', hud: { score: 4, timeLeft: 89, title: 'Test', detail: '3 życia' } });
assert.equal(client.state.arcadeHud?.score, 4);
// Powrót z gry musi zawsze otworzyć bibliotekę, nawet jeśli pakiety z dwóch
// zmian ekranu dotrą niemal równocześnie.
(client as unknown as { onMessage: (l: PadLink, m: unknown) => void }).onMessage(mockLink('server'), {
  t: 'session', session: { game: null, screen: 'menu', selection: 2, adminSlot: 1, roster: [] },
});
assert.equal(client.state.game, null);
assert.equal(client.state.screen, 'lobby');
(client as unknown as { onMessage: (l: PadLink, m: unknown) => void }).onMessage(mockLink('server'), { t: 'screen', screen: 'menu' });
assert.equal(client.state.screen, 'lobby');

// Optional lab is a shared host state, even without a selected game.
(client as unknown as { onMessage: (l: PadLink, m: unknown) => void }).onMessage(mockLink('server'), {
  t: 'session', session: { game: null, screen: 'lab', selection: 2, adminSlot: 1, roster: [] },
});
assert.equal(client.state.screen, 'lab');
(client as unknown as { onMessage: (l: PadLink, m: unknown) => void }).onMessage(mockLink('server'), { t: 'screen', screen: 'lobby' });
assert.equal(client.state.screen, 'lobby');
(client as unknown as { onMessage: (l: PadLink, m: unknown) => void }).onMessage(mockLink('server'), {
  t: 'arcadeHud', hud: { score: 0, timeLeft: 30, title: 'Race', detail: '', countdown: 3, paused: true },
});
assert.equal(client.state.arcadeHud?.countdown, 3);
assert.equal(client.state.arcadeHud?.paused, true);

// Wszystkie cztery silniki: prawdziwa inicjalizacja, wejście analogowe,
// kilkaset kroków symulacji i pełne rysowanie na mocku Canvas 2D.
const gradient = { addColorStop() {} };
const context = new Proxy({} as CanvasRenderingContext2D, {
  get(target, prop) {
    if (prop in target) return Reflect.get(target, prop);
    if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => gradient;
    return () => {};
  },
  set(target, prop, value) { Reflect.set(target, prop, value); return true; },
});
const canvas = { getContext: () => context } as unknown as HTMLCanvasElement;
const inputs: PadInput[] = Array.from({ length: 4 }, () => ({ fwd: 0, turn: 0, fire: true, steer: 'direct', dirX: 0.7, dirY: 0.1, aimX: 1, aimY: 0 }));
const players = [
  { slot: 0, name: 'Ada', color: '#4ade80', isBot: false },
  { slot: 1, name: 'BOT 1', color: '#38bdf8', isBot: true },
];
const rounds = [RaceRound, OrbitRound, SnakeRound, LeagueRound] as const;
const projection = mat4Perspective(Math.PI / 3, 16 / 9, .1, 100);
const camera = mat4LookAt([0, 8, 12], [0, 0, 0], [0, 1, 0]);
const viewProjection = mat4Multiply(projection, camera);
assert.equal(viewProjection.length, 16);
assert.ok(Array.from(viewProjection).every(Number.isFinite), 'macierz WebGL2 musi być stabilna numerycznie');
let simulations = 0;
for (const Round of rounds) {
  let result: RoundResult | null = null;
  const config: RoundConfig = { players: Round === OrbitRound ? players.slice(0, 1) : players, padInputs: inputs, primary: 0, secondary: 1, language: 'pl', onHud() {}, onFx() {}, onFinish: value => { result = value; } };
  const round = new Round(canvas, config) as CanvasRound;
  const engine = round as unknown as { clock: number; update: (dt: number) => void; hud: () => { players: { score: number }[] }; render: (ctx: CanvasRenderingContext2D) => void; finished: boolean; timeout: () => void };
  for (let i = 0; i < 400 && !engine.finished; i++) {
    engine.clock += .016;
    engine.update(.016);
    if (i % 80 === 0) {
      engine.render(context);
      assert.ok(engine.hud().players.length >= 1);
      for (const p of engine.hud().players) assert.ok(Number.isFinite(p.score));
    }
  }
  engine.timeout();
  assert.ok(result, `${Round.name}: wynik powinien powstać`);
  simulations++;
}
console.log(`ARCADE SELFTEST: OK (role admina, protokół, ${simulations} silniki + macierze WebGL2)`);

// Holding steering into the outside rail must preserve forward speed, not glue the kart to the edge.
const textureContext = new Proxy({} as CanvasRenderingContext2D, {
  get(target, prop) {
    if (prop in target) return Reflect.get(target, prop);
    if (prop === 'createRadialGradient' || prop === 'createLinearGradient') return () => ({ addColorStop() {} });
    return () => {};
  },
});
(globalThis as unknown as { document: Document }).document = { createElement: () => ({ width: 128, height: 128, getContext: () => textureContext }) } as unknown as Document;
const edgeTrack = new Track();
const edgeKart = new Kart({ name: 'Test', color: 0xff8844, accent: 0xffffff, isPlayer: true, skill: 1 });
edgeKart.place_at(edgeTrack, edgeTrack.length * 0.17, BARRIER - 2.1);
edgeTrack.project(edgeKart.pos.x, edgeKart.pos.y, edgeKart.pos.z, edgeKart.idx, edgeKart.proj);
edgeKart.vel.copy(edgeKart.forward(new Vector3())).multiplyScalar(28);
edgeKart.controls = { throttle: 1, brake: 0, steer: 1, drift: false };
for (let frame = 0; frame < 1200; frame++) edgeKart.update(1 / 120, edgeTrack, true);
assert.ok(edgeKart.vf > 14, `edge scrape should retain forward motion; got ${edgeKart.vf.toFixed(2)}`);
assert.ok(Math.abs(edgeKart.proj.lateral) < BARRIER, 'edge assistance must keep the kart inside the track barriers');
console.log('NEON EDGE SELFTEST: OK (steering into rail retains speed and recovers inside the track)');

// Disconnects cannot leave a phantom vote; an unknown connection cannot vote.
const intentHost = new PadHost();
const intentLink = mockLink('intent-phone');
const internal = intentHost as unknown as { conns: Map<string, PadLink>; onMessage: (l: PadLink, m: PadMessage) => void; dropConn: (id: string) => void };
internal.conns.set(intentLink.id, intentLink);
internal.onMessage(intentLink, { t: 'hello', nick: 'Ada', ua: 'test', v: 1 });
intentHost.setGame('race'); intentHost.setScreen('over');
internal.onMessage(intentLink, { t: 'intent', kind: 'rematch', value: true });
assert.equal(intentHost.session().roster[0].rematch, true);
internal.dropConn(intentLink.id);
internal.onMessage(intentLink, { t: 'intent', kind: 'rematch', value: true });
assert.equal(intentHost.session().roster.length, 0);
console.log('INTENT DISCONNECT SELFTEST: OK');

// Missing touch release and missing network heartbeat are independent failures.
const safetyHost = new PadHost();
const safety = safetyHost as unknown as { conns: Map<string, PadLink>; onMessage: (l: PadLink, m: PadMessage) => void; dropConn: (id: string) => void; sweepInputs: (now: number) => void };
function pairSafety(id: string, pid: string) {
  const link = mockLink(id); safety.conns.set(id, link);
  safety.onMessage(link, { t: 'hello', nick: id, ua: 'test', v: 1, pid });
  return link;
}
const safetyAdmin = pairSafety('safety-admin', 'safety-admin');
const safetyGuest = pairSafety('safety-guest', 'safety-guest');
safetyHost.setGame('race'); safetyHost.setScreen('menu');
safety.onMessage(safetyGuest, { t: 'remind' });
assert.equal(safetyGuest.sent.filter(m => (m as { t: string }).t === 'readyReminder').length, 0);
safety.onMessage(safetyAdmin, { t: 'intent', kind: 'ready', value: true });
safety.onMessage(safetyAdmin, { t: 'remind' }); safety.onMessage(safetyAdmin, { t: 'remind' });
assert.equal(safetyGuest.sent.filter(m => (m as { t: string }).t === 'readyReminder').length, 1);
assert.equal(safetyAdmin.sent.filter(m => (m as { t: string }).t === 'readyReminder').length, 0);
safety.onMessage(safetyGuest, { t: 'suggest', game: 'tanks' });
assert.equal(safetyHost.session().roster[1].suggestedGame, undefined);
safetyHost.setScreen('over');
safety.onMessage(safetyGuest, { t: 'suggest', game: 'snake' });
safety.onMessage(safetyGuest, { t: 'suggest', game: 'race' });
assert.equal(safetyHost.session().roster[1].suggestedGame, 'snake');
safety.onMessage(safetyGuest, { t: 'suggest', game: 'tanks' });
// Przestawianie ekranu co kliknięcie to już nie głosowanie, tylko hałas — telewizor
// trzyma pierwszy przyjęty głos, a resztę odbija na cooldownie (`net/antiSpam`).
assert.equal(safetyHost.session().roster[1].suggestedGame, 'snake', 'antyspam nie pozwala przestawiać ekranu co kliknięcie');
// Wycofać się można zawsze: kłódka dotyczy nowych propozycji, nie odwrotu.
safety.onMessage(safetyGuest, { t: 'suggest', game: null });
assert.equal(safetyHost.session().roster[1].suggestedGame, undefined);
safetyHost.setScreen('game');
safety.onMessage(safetyGuest, { t: 'input', fwd: 1, turn: 1, fire: true, dirX: 1, aimY: 1 });
assert.equal(safetyHost.inputs[1].fire, true);
const inputTime = Date.now();
safety.onMessage(safetyGuest, { t: 'ping', at: performance.now() });
safety.sweepInputs(inputTime + 1000);
assert.equal(safetyHost.inputs[1].fire, false);
assert.equal(safetyHost.inputs[1].fwd, 0);
assert.equal(safetyHost.session().roster.length, 2, 'short input outage does not drop/pause the session');
safety.dropConn(safetyGuest.id); safety.dropConn(safetyAdmin.id);
const returned = pairSafety('safety-returned', 'safety-guest');
assert.equal(safetyHost.session().roster[0].slot, 1, 'same device recovers its old slot even when slot 0 is free');
safety.dropConn(returned.id);
pairSafety('new-zero', 'new-zero'); pairSafety('new-one', 'new-one');
pairSafety('return-occupied', 'safety-guest');
assert.equal(safetyHost.snapshot().pads.find(p => p.connId === 'return-occupied')?.slot, 2, 'returning phone never displaces a new player');
console.log('PAD SAFETY SELFTEST: OK (stale input, recovery slot, occupied slot, reminders, proposal validation, anti-spam cooldown)');

// Tire wisps can be translucent without changing sparks/explosions globally.
const { Particles } = await import('../src/arcade/neon/particles');
const particleTest = new Particles(3, false, 1);
particleTest.emit(0, 0, 0, 0, 0, 0, 1, 1, 1, .4, 1, { opacity: .16 });
particleTest.emit(0, 0, 0, 0, 0, 0, 1, 1, 1, .4, 1);
particleTest.update(.1);
const opacityValues = particleTest.points.geometry.getAttribute('aAlpha');
assert.ok(Math.abs(opacityValues.getX(0) - .16) < .001);
assert.equal(opacityValues.getX(1), 1, 'existing emitters retain their original opacity');
particleTest.update(2);
assert.equal(opacityValues.getX(0), 0);
particleTest.points.geometry.dispose();
const particleMaterial = particleTest.points.material;
if (!Array.isArray(particleMaterial)) particleMaterial.dispose();
console.log('NEON PARTICLES SELFTEST: OK (per-emitter opacity, unchanged defaults, fade-out)');

// --- Klawiatura pod modalem: silnik nie może walczyć z interfejsem ---
{
  const fs = await import('node:fs');
  const owner = fs.readFileSync('src/lib/inputOwnership.ts', 'utf8');
  assert.ok(/document\.querySelector\('dialog\[open\]'\)/.test(owner)
    && /isContentEditable/.test(owner),
    'własność klawiatury rozpoznaje modal i pole wpisowe — dwa stany, w których silnik nie ma nic do gadania');
  const engines: Array<[string, string]> = [
    ['arcade/runtime.ts', 'src/arcade/runtime.ts'],
    ['arcade/webgl/runtime3d.ts', 'src/arcade/webgl/runtime3d.ts'],
    ['starclash/StarClashRound.ts', 'src/arcade/starclash/StarClashRound.ts'],
    ['neon/NeonRushScene.ts', 'src/arcade/neon/NeonRushScene.ts'],
    ['game/engine.ts', 'src/game/engine.ts'],
  ];
  for (const [name, path] of engines) {
    const source = fs.readFileSync(path, 'utf8');
    const guard = source.indexOf('uiOwnsKeyboard(');
    assert.ok(guard > 0, `${name}: brak rezygnacji z klawisza, gdy interfejs ma fokus`);
    assert.ok(/import \{ uiOwnsKeyboard \} from '[^']*lib\/inputOwnership'/.test(source),
      `${name}: własność klawiatury liczymy w jednym liściu, nie kopią warunków po silnikach`);
    const keyDown = source.slice(guard, guard + 700);
    const prevent = keyDown.indexOf('preventDefault()');
    assert.ok(prevent === -1 || prevent > source.slice(guard, guard + 700).indexOf('uiOwnsKeyboard('),
      `${name}: guard musi stać PRZED preventDefault — inaczej strzałki są ukradzione okienku jeszcze przed decyzją`);
  }
  console.log('KEYBOARD OWNERSHIP SELFTEST: OK (pięć silników rezygnuje z klawisza pod modalem i przy wpisaniu)');
}


// --- HUD gry: jedna paleta, jedna typografia, jedna obudowa rundy ---
{
  const fs = await import('node:fs');
  const read = (path: string) => fs.readFileSync(path, 'utf8');
  const kit = read('src/arcade/hudKit.ts');
  const palette = read('src/console/palette.css');

  // 1. Płótno nie czyta CSS-ów, więc `HUD` jest lustrem tokenów `--os-*`.
  const mirrors: Array<[string, string]> = [
    ['bg', '--os-bg'], ['surface', '--os-surface'], ['panel', '--os-panel'], ['raised', '--os-raised'],
    ['edge', '--os-edge'], ['text', '--os-text'], ['secondary', '--os-secondary'], ['muted', '--os-muted'],
    ['accent', '--os-accent'], ['accentBright', '--os-accent-bright'],
    ['success', '--os-success'], ['warning', '--os-warning'], ['danger', '--os-danger'],
  ];
  for (const [key, token] of mirrors) {
    const declared = palette.match(new RegExp(`${token}:\\s*(#[0-9a-f]{6})`))?.[1];
    const mirrored = kit.match(new RegExp(`\\b${key}:\\s*'(#[0-9a-f]{6})'`))?.[1];
    assert.ok(declared, `palette.css: brak tokena ${token}`);
    assert.equal(mirrored, declared, `hudKit: ${key} rozjechał się z ${token} — arena i interfejs muszą mówić tym samym kolorem`);
  }

  // 2. Rodziny czcionek pochodzą z systemu konsoli (Outfit / Space Grotesk / JetBrains Mono).
  for (const family of ['Outfit', 'Space Grotesk', 'JetBrains Mono']) {
    assert.ok(kit.includes(family), `hudKit: brak rodziny ${family}`);
  }
  assert.ok(/export function hudFont\(/.test(kit) && /export function drawWorldLabel\(/.test(kit)
    && /export function drawArenaWatermark\(/.test(kit), 'hudKit: brakuje któregoś z trzech narzędzi');
  assert.ok(/ctx\.font = previousFont/.test(kit), 'hudKit: napis musi oddać płótnu jego poprzedni stan');

  // 3. Żaden kod interfejsu nie wymyśla własnej czcionki — tylko `hudFont()`.
  //    Wyjątkiem są malarze tekstur świata (ekrany stadionu, billboardy, stroje),
  //    gdzie krój jest elementem scenografii, nie HUD-em.
  const scenery = new Set([
    'src/arcade/hudKit.ts',
    'src/arcade/neon/textures.ts',
    'src/arcade/league-next/textures.ts',
    'src/arcade/league-next/stadium.ts',
    'src/arcade/league-next/markers.ts',
    'src/arcade/pizza/assets.ts',
  ]);
  const offenders: string[] = [];
  for (const file of fs.readdirSync('src', { recursive: true }) as string[]) {
    if (!/\.(ts|tsx)$/.test(file)) continue;
    const path = `src/${file}`;
    if (scenery.has(path)) continue;
    const source = read(path);
    source.split('\n').forEach((line, index) => {
      if (/\.font\s*=/.test(line) && !/\.font\s*=\s*hudFont\(/.test(line) && !line.trim().startsWith('//')) {
        offenders.push(`${path}:${index + 1}`);
      }
    });
  }
  assert.deepEqual(offenders, [], 'czcionkę płótna ustawia wyłącznie hudFont() — inaczej arena wraca do `sans-serif`');

  // 4. Znak wodny areny ma jedną formę we wszystkich grach płóciennych.
  for (const game of ['Race', 'Orbit', 'Snake', 'League']) {
    const source = read(`src/arcade/games/${game}.ts`);
    assert.ok(/drawArenaWatermark\(/.test(source), `${game}: arena bez wspólnego znaku wodnego`);
    assert.ok(/import \{[^}]*drawArenaWatermark[^}]*\} from '\.\.\/hudKit'/.test(source),
      `${game}: znak wodny musi iść przez hudKit, nie przez własny fillText`);
  }

  // 5. Obudowa rundy jest jedna: znaczniki `arcade-*` żyją wyłącznie w RoundChrome.
  const hudCss = read('src/console/gamehud.css');
  const chrome = read('src/console/RoundChrome.tsx');
  for (const klass of ['arcade-hudbar', 'arcade-arena', 'arcade-huddeck', 'arcade-side', 'arcade-keys']) {
    assert.ok(hudCss.includes(`.${klass}`), `gamehud.css: brak .${klass}`);
    assert.ok(chrome.includes(klass), `RoundChrome: brak ${klass} — obudowa nie jest wspólna`);
  }
  // Klasy obudowy rundy (paski, karty, nakładki, klawisze) — ekrany gier składają je
  // z komponentów, więc znaczniki nie mogą wrócić do App.tsx / ArcadeGameView.tsx.
  // Klasy ekranu ustawień (`arcade-option`, `arcade-buffs` w treści karty) tu nie należą.
  const chromeClasses = [
    'arcade-hudbar', 'arcade-hudgroup', 'arcade-title', 'arcade-chip', 'arcade-timer', 'arcade-actions',
    'arcade-icon', 'arcade-badge', 'arcade-arena', 'arcade-objective', 'arcade-powerup', 'arcade-count',
    'arcade-startflash', 'arcade-loading', 'arcade-huddeck', 'arcade-hudcard', 'arcade-card-', 'arcade-meter',
    'arcade-pips', 'arcade-side', 'arcade-info', 'arcade-overlay', 'arcade-help', 'arcade-feed',
    'arcade-keys', 'arcade-phone', 'arcade-mini', 'keycap',
  ];
  for (const screen of ['src/App.tsx', 'src/arcade/ArcadeGameView.tsx']) {
    const source = read(screen);
    assert.ok(/from '[./]*console\/RoundChrome'/.test(source),
      `${screen}: ekran rundy nie korzysta ze wspólnego chrome`);
    const handBuilt = chromeClasses.filter(klass => source.includes(`"${klass}`) || source.includes(`'${klass}`) || source.includes(`\`${klass}`) || source.includes(` ${klass}`));
    assert.deepEqual(handBuilt, [], `${screen}: obudowę rundy budują komponenty RoundChrome, nie gołe klasy`);
  }
  // Kolejność arkuszy: szkło z `liquid.css` musi mieć ostatnie słowo nad obudową rundy.
  const entry = read('src/main.tsx');
  const sheets = [...entry.matchAll(/^import\s+["']([^"']+\.css)["'];?\s*$/gm)].map(match => match[1]);
  const at = (name: string) => sheets.findIndex(sheet => sheet.endsWith(name));
  for (const name of ['platform.css', 'gamehud.css', 'liquid.css']) {
    assert.ok(at(name) >= 0, `main.tsx: brak arkusza ${name}`);
  }
  assert.ok(at('platform.css') < at('gamehud.css') && at('gamehud.css') < at('liquid.css'),
    `main.tsx: gamehud.css musi leżeć po platform.css, a przed liquid.css (jest: ${sheets.join(' → ')})`);

  // 6. Każdy tytuł ma własny akcent, ale wszystkie w tej samej jakości kontrastu.
  const { GAMES } = await import('../src/arcade/catalog');
  const luminance = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map(i => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
      .map(c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: string, b: string) => {
    const hi = Math.max(luminance(a), luminance(b));
    const lo = Math.min(luminance(a), luminance(b));
    return (hi + 0.05) / (lo + 0.05);
  };
  const panel = palette.match(/--os-panel:\s*(#[0-9a-f]{6})/)?.[1] ?? '#19191d';
  const accents = new Set<string>();
  for (const game of GAMES) {
    assert.match(game.accent, /^#[0-9a-f]{6}$/, `${game.id}: akcent musi być sześciocyfrowym hexem`);
    assert.match(game.accentSoft, /^#[0-9a-f]{6}$/, `${game.id}: miękki akcent musi być sześciocyfrowym hexem`);
    assert.ok(!accents.has(game.accent), `${game.id}: akcent ${game.accent} należy już do innej gry — tytuły zlewają się w jeden`);
    accents.add(game.accent);
    assert.ok(contrast(game.accent, panel) >= 7,
      `${game.id}: akcent ${game.accent} ma ${contrast(game.accent, panel).toFixed(2)}:1 na panelu — potrzeba ≥7:1`);
    assert.ok(luminance(game.accentSoft) < luminance(game.accent),
      `${game.id}: miękki akcent ma być cieniem akcentu, nie jego kopią`);
    assert.ok(luminance(game.accent) > 0.05, `${game.id}: akcent nie może być czernią ani tłem`);
  }
  console.log(`GAME HUD SELFTEST: OK (13 luster palety, hudFont w ${fs.readdirSync('src', { recursive: true }).filter(f => /\.(ts|tsx)$/.test(String(f))).length - scenery.size} plikach bez wyjątków, wspólny znak wodny 4 aren, jeden chrome rundy, ${accents.size} odrębnych akcentów ≥7:1)`);
}
/* --- Sterowanie klawiaturą: obietnica z katalogu („Strzałki lub joystick”) --- */
{
  const solo = keySetFor(0, true)!;
  const paired = keySetFor(0, false)!;
  const second = keySetFor(1, false)!;
  assert.ok(solo.right.includes('ArrowRight') && solo.up.includes('ArrowUp'),
    'w rundzie solo strzałki sterują graczem 1 — katalog obiecuje „Strzałki lub joystick”');
  assert.ok(solo.action.includes('Enter') && solo.action.includes('Space'), 'solo: sprint działa i z Enter, i ze Spacji');
  assert.ok(!paired.right.includes('ArrowRight'), 'przy człowieku w slocie 1 strzałki zostają JEGO — inaczej obu graczy skręca razem');
  assert.ok(second.right.includes('ArrowRight') && !second.right.includes('KeyD'), 'drugi gracz bez zmian: strzałki, nie WASD');
  assert.equal(keySetFor(4, true), undefined, 'piąty slot nie istnieje — cztery klawiatury to sufit jednego komputera');
  const runtimeSource = (await import('node:fs')).readFileSync('src/arcade/runtime.ts', 'utf8');
  assert.ok(runtimeSource.includes('keySetFor(slot, !this.secondHuman)') && runtimeSource.includes('debugInput(slot: number)'),
    'runda czyta zestawy przez `keySetFor` i udostępnia `debugInput` testom CI');
}

