/**
 * Szybki test logiki JoyPad bez serwera, przeglądarki i internetu.
 * npm run selftest:arcade
 */
import assert from 'node:assert/strict';
import type { PadLink } from '../src/net/links';
import type { PadInput, PadMessage } from '../src/net/protocol';
import { RaceRound } from '../src/arcade/games/Race';
import { OrbitRound } from '../src/arcade/games/Orbit';
import { SnakeRound } from '../src/arcade/games/Snake';
import { TempleRound } from '../src/arcade/games/Temple';
import { VoxelRound } from '../src/arcade/games/Voxel';
import { LeagueRound } from '../src/arcade/games/League';
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
let commands: string[] = [];
host.onAdminCommand = command => { commands.push(command); };
let picks: number[] = [];
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
receive(1, { t: 'command', command: 'home' });
receive(2, { t: 'choose', index: 4 });
assert.deepEqual(commands, []); assert.deepEqual(picks, []);
receive(0, { t: 'command', command: 'select' });
receive(0, { t: 'choose', index: 2 });
assert.deepEqual(commands, ['select']); assert.deepEqual(picks, [2]);
receive(0, { t: 'choose', index: 999 });
assert.deepEqual(picks, [2]);
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
const rounds = [RaceRound, OrbitRound, SnakeRound, TempleRound, VoxelRound, LeagueRound] as const;
const projection = mat4Perspective(Math.PI / 3, 16 / 9, .1, 100);
const camera = mat4LookAt([0, 8, 12], [0, 0, 0], [0, 1, 0]);
const viewProjection = mat4Multiply(projection, camera);
assert.equal(viewProjection.length, 16);
assert.ok(Array.from(viewProjection).every(Number.isFinite), 'macierz WebGL2 musi być stabilna numerycznie');
let simulations = 0;
for (const Round of rounds) {
  let result: RoundResult | null = null;
  const config: RoundConfig = { players: Round === OrbitRound || Round === TempleRound ? players.slice(0, 1) : players, padInputs: inputs, primary: 0, secondary: 1, onHud() {}, onFx() {}, onFinish: value => { result = value; } };
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
