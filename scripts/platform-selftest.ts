/** Offline tests of authority, room state, profile validation and real-event highlights. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { PadLink } from '../src/net/links';
import type { HostMessage, PadMessage } from '../src/net/protocol';
import { MomentRecorder, momentTime } from '../src/platform/momentRecorder';
import { loadProfile, normalizeProfile, saveProfile, recordGamePlayed, recordWin } from '../src/platform/profile';
import { isHostMessage, isPadMessage, padCodeFromHash, padTokenFromHash, padUrlFor } from '../src/net/protocol';

Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true });
Object.defineProperty(globalThis, 'location', { value: { search: '', hash: '', origin: 'https://example.com', pathname: '/JoyPad/' }, configurable: true });
const storage = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (k: string) => storage.get(k), setItem: (k: string, v: string) => storage.set(k, v) }, configurable: true });
const { PadHost } = await import('../src/net/padHost');
const host = new PadHost();
const wire = host as unknown as { conns: Map<string, PadLink>; onMessage: (link: PadLink, msg: PadMessage) => void; dropConn: (id: string) => void };
function pair(id: string, pid = id) {
  const sent: HostMessage[] = [];
  const link: PadLink = { id, kind: 'webrtc', open: true, send: msg => sent.push(msg as HostMessage), onMessage() {}, onClosed() {}, close() {} };
  wire.conns.set(id, link);
  wire.onMessage(link, { t: 'hello', nick: id, ua: 'test', v: 1, pid });
  return { link, sent, send: (msg: PadMessage) => wire.onMessage(link, msg) };
}
const a = pair('Ada'); const b = pair('Bartek');
assert.equal(host.session().adminSlot, 0);
b.send({ t: 'room', action: { kind: 'locked', value: true } });
assert.equal(host.session().room?.locked, false, 'guest cannot lock');
b.send({ t: 'room', action: { kind: 'kick', slot: 0 } });
b.send({ t: 'room', action: { kind: 'transfer', slot: 1 } });
assert.equal(host.session().roster.length, 2);
assert.equal(host.session().adminSlot, 0, 'guest cannot promote themselves');
b.send({ t: 'suggest', game: 'orbit' });
assert.equal(host.session().roster[1].suggestedGame, 'orbit', 'lobby allows votes');
const immutable = host.snapshot();
b.send({ t: 'suggest', game: 'race' });
assert.equal(immutable.pads[1].suggestedGame, 'orbit', 'snapshots cannot mutate under notification diff');
a.send({ t: 'room', action: { kind: 'suggestions', value: false } });
assert.equal(host.session().roster[1].suggestedGame, undefined);
b.send({ t: 'suggest', game: 'tanks' });
assert.equal(host.session().roster[1].suggestedGame, undefined, 'disabled suggestions enforced on host');
a.send({ t: 'room', action: { kind: 'suggestions', value: true } });
b.send({ t: 'suggest', game: 'snake' });
assert.equal(host.session().roster[1].suggestedGame, 'snake', 'beta games can be voted in after release');
a.send({ t: 'room', action: { kind: 'locked', value: true } });
const rejected = pair('Intruz');
assert.equal(host.session().roster.length, 2);
assert.equal(rejected.sent.at(-1)?.t, 'rejected');
wire.dropConn(b.link.id);
const returned = pair('Bartek2', 'Bartek');
assert.equal(host.session().roster[1].slot, 1, 'known phone reconnects to a locked room');
a.send({ t: 'room', action: { kind: 'transfer', slot: 1 } });
assert.equal(host.session().adminSlot, 1);
a.send({ t: 'room', action: { kind: 'locked', value: false } });
assert.equal(host.session().room?.locked, true, 'old admin loses authority immediately');
returned.send({ t: 'room', action: { kind: 'dimmed', value: true } });
assert.equal(host.session().room?.dimmed, true);
host.setGame('tanks'); host.setScreen('game');
assert.equal(host.session().room?.dimmed, false, 'starting round restores screen');
returned.send({ t: 'room', action: { kind: 'dimmed', value: true } });
assert.equal(host.session().room?.dimmed, false, 'cannot hide active gameplay');
returned.send({ t: 'profile', profile: { avatar: 'alien', theme: 'mint' } });
assert.equal(host.session().roster[1].profile?.avatar, 'alien'); assert.equal(host.session().roster[1].profile?.theme, 'mint'); assert.ok(host.session().roster[1].profile?.id);
returned.send({ t: 'room', action: { kind: 'kick', slot: 0 } });
assert.equal(host.inputs[0].fire, false);
assert.equal(host.session().roster.length, 1);
const kickedReturn = pair('Ada2', 'Ada');
assert.equal(kickedReturn.sent.at(-1)?.t, 'rejected', 'kick revokes locked-room reconnection grace');
wire.dropConn(returned.link.id);
assert.equal(host.session().adminSlot, null);
host.manageRoom({ kind: 'locked', value: false });
const c = pair('Celina');
assert.equal(host.session().adminSlot, 0, 'new crew gets a live admin');
c.send({ t: 'room', action: { kind: '__proto__', value: true } } as unknown as PadMessage);
c.send({ t: 'room', action: { kind: 'locked', value: 'yes' } } as unknown as PadMessage);
assert.equal(host.session().room?.locked, false);
assert.equal(Object.getPrototypeOf(host.session().room!), Object.prototype);
// Widoczność kodu QR na telewizorze jest ustawieniem administratora, nie stanem połączenia.
assert.equal(host.session().room?.pairing, true, 'domyślnie kod QR zostaje na ekranie');
c.send({ t: 'room', action: { kind: 'pairing', value: false } });
assert.equal(host.session().room?.pairing, false, 'admin chowa kod');
c.send({ t: 'room', action: { kind: 'pairing', value: true } });
const guestPair = pair('Wczasowicz');
guestPair.send({ t: 'room', action: { kind: 'pairing', value: false } });
assert.equal(host.session().room?.pairing, true, 'gość nie może schować kodu QR');
wire.dropConn(guestPair.link.id);
console.log('ROOM SELFTEST: OK (authority, transfer, lock, reconnection, kick, suggestions, dimming, pairing, malformed messages)');

/* ── ANTY-SPAM ─────────────────────────────────────────────────────────────
   Dwie warstwy: czyste liczby (`net/antiSpam`) i prawdziwy host, który ich
   pilnuje. Telefon nie może ufać własnym timerom, więc licznik mieszka po stronie
   telewizora — tu sprawdzamy dokładnie tę stronę, a liczby osobno. */
const { EMPTY_SUGGEST, judgeSuggest, ANTI_SPAM, isSilenced } = await import('../src/net/antiSpam');
const T0 = 1_000_000;

// Pierwsza propozycja zawsze wchodzi, licznik startuje.
const first = judgeSuggest({ game: 'neon', now: T0, muted: false, counters: EMPTY_SUGGEST });
assert.equal(first.accept, true, 'pierwsza propozycja nie ma powodu do odmowy');
assert.equal(first.counters.count, 1);
assert.equal(first.reply, true, 'przyjęcie też dostaje odpowiedź — telefon kasuje swój komunikat');

// Ta sama gra wraca do puli dopiero po oknie duplikatu, inna — po cooldownie.
const dup = judgeSuggest({ game: 'neon', now: T0 + ANTI_SPAM.cooldownMs + 1, muted: false, counters: first.counters });
assert.equal(dup.accept, false); assert.equal(dup.verdict, 'duplicate');
assert.ok(dup.retryInMs >= 171_000 && dup.retryInMs <= 172_000, 'duplikat liczy pełne okno');
const cold = judgeSuggest({ game: 'snake', now: T0 + 1_000, muted: false, counters: first.counters });
assert.equal(cold.accept, false); assert.equal(cold.verdict, 'cooldown'); assert.equal(cold.retryInMs, 7_000);
assert.equal(cold.counters.count, 1, 'odrzucona propozycja nie zjada limitu');

// Wycofanie głosu jest wolne od kar: nawet wyciszony gracz zdjąć swój głos może.
assert.equal(judgeSuggest({ game: undefined, now: T0 + 500, muted: true, counters: first.counters }).accept, true);
assert.equal(judgeSuggest({ game: null as unknown as undefined, now: T0 + 500, muted: true, counters: first.counters }).accept, true,
  'null z sieci znaczy dokładnie to samo co brak gry');

// Sufit ilościowy w oknie przesuwnym: pięć tytułów na minutę, szósty wypada za oknem.
let windowed = EMPTY_SUGGEST;
for (let i = 0; i < ANTI_SPAM.maxPerWindow; i++) {
  const step = judgeSuggest({ game: `gra${i}`, now: T0 + i * (ANTI_SPAM.cooldownMs + 1), muted: false, counters: windowed });
  assert.equal(step.accept, true, `gra ${i} mieści się w oknie`);
  windowed = step.counters;
}
const over = judgeSuggest({ game: 'gra9', now: T0 + ANTI_SPAM.maxPerWindow * (ANTI_SPAM.cooldownMs + 1), muted: false, counters: windowed });
assert.equal(over.accept, false); assert.equal(over.verdict, 'limit');
assert.equal(judgeSuggest({ game: 'gra9', now: T0 + ANTI_SPAM.windowMs + 1, muted: false, counters: windowed }).accept, true,
  'okno się zawija i licznik startuje od zera');

// Eskalacja: uparte bicie w ten sam mur wycisza gracza; sama odmowa nie dzwoni co chwilę.
let struck = first.counters;
const verdicts: string[] = [];
for (let i = 0; i < ANTI_SPAM.strikeLimit; i++) {
  const step = judgeSuggest({ game: `upór${i}`, now: T0 + i * 100, muted: false, counters: struck });
  assert.equal(step.accept, false);
  verdicts.push(step.verdict);
  struck = step.counters;
}
assert.ok(verdicts.every(v => v === 'cooldown'), 'bez czekania wszystkie trzy biją w cooldown');
assert.equal(struck.mutedUntil, T0 + (ANTI_SPAM.strikeLimit - 1) * 100 + ANTI_SPAM.autoMuteMs, 'eskalacja zakłada kłódkę');
assert.equal(struck.strikes, 0, 'wyciszony zaczyna od czystego licznika uderzeń');
const silenced = judgeSuggest({ game: 'spokoj', now: T0 + 1_000, muted: false, counters: struck });
assert.equal(silenced.verdict, 'muted');
assert.equal(silenced.reply, false, 'telefon nie potrzebuje tej samej odmowy w każdej wiadomości');
assert.equal(isSilenced(struck, false, T0 + 1_000), true);
assert.equal(isSilenced(struck, false, struck.mutedUntil + 1), false, 'auto-kłódka schodzi sama');
assert.equal(isSilenced(EMPTY_SUGGEST, true, struck.mutedUntil + 10), true, 'wyciszenie od admina nie ma daty ważności');

// Host: liczniki są na padzie, nie w powietrzu — i przeżywają reconnect.
const host2 = new PadHost();
const wire2 = host2 as unknown as { conns: Map<string, PadLink>; onMessage: (link: PadLink, msg: PadMessage) => void; dropConn: (id: string) => void };
type SuggestAck = Extract<HostMessage, { t: 'suggestAck' }>;
function pairAt(id: string, pid = id) {
  const sent: HostMessage[] = [];
  const link: PadLink = { id, kind: 'webrtc', open: true, send: msg => sent.push(msg as HostMessage), onMessage() {}, onClosed() {}, close() {} };
  wire2.conns.set(id, link);
  wire2.onMessage(link, { t: 'hello', nick: id, ua: 'test', v: 1, pid });
  return {
    link,
    sent,
    send: (msg: PadMessage) => wire2.onMessage(link, msg),
    broadcasts: () => sent.filter(m => m.t === 'session').length,
    refusals: () => sent.filter(m => m.t === 'suggestAck' && (m as SuggestAck).verdict !== 'accepted') as SuggestAck[],
  };
}
const adminPad = pairAt('Admin');
const spammer = pairAt('Marcin');
const quiet = pairAt('Ewa');
const realNow = Date.now;
// Zegar podszywamy od „teraźniejszości": host wybierze administratora ze starszeństwa
// połączenia, a sztuczny rok 1970 przywróciłby prymat ostatniego, nie pierwszego pada.
let fakeNow = realNow();
Date.now = () => fakeNow;
try {
  adminPad.send({ t: 'suggest', game: 'race' });
  assert.equal(host2.session().roster[0].suggestedGame, 'race', 'admin też może proponować');

  spammer.send({ t: 'suggest', game: 'snake' });
  assert.equal(host2.session().roster[1].suggestedGame, 'snake');
  quiet.send({ t: 'suggest', game: 'tanks' });
  assert.equal(host2.session().roster[2].suggestedGame, 'tanks', 'limit jest na gracza, nie na pokój');

  // Seria Marcina w jednym takcie: ekran drga raz na przyjęty głos, nigdy na odmowę.
  const before = spammer.broadcasts();
  spammer.send({ t: 'suggest', game: 'race' });
  spammer.send({ t: 'suggest', game: 'tanks' });
  spammer.send({ t: 'suggest', game: 'orbit' });
  assert.equal(host2.session().roster[1].suggestedGame, 'snake', 'odrzucone propozycje nie ruszają ekranu');
  assert.equal(spammer.broadcasts(), before, 'sama odmowa nie rozgłasza stanu pokoju');
  assert.equal(spammer.refusals().length, 1, 'telefon słyszy o odmowie raz, nie trzy razy');
  spammer.send({ t: 'suggest', game: 'snake' });
  assert.equal(host2.session().roster[1].muted, true, 'seria odmów wycisza gracza bez pytania nikogo');
  assert.equal(spammer.broadcasts(), before + 1, 'pokój dowiaduje się tylko o samej kłódce');
  assert.equal(host2.session().roster[1].suggestedGame, 'snake', 'wyciszenie zabiera prawo do nowych głosów, nie oddane');
  assert.equal(host2.session().roster[0].muted, false, 'sąsiedzi nic nie czują');

  // Wyciszony może za to zdjąć swój głos z ekranu.
  spammer.send({ t: 'suggest', game: null });
  assert.equal(host2.session().roster[1].suggestedGame, undefined, 'wycofanie działa zawsze');
  spammer.send({ t: 'suggest', game: 'race' });
  assert.equal(host2.session().roster[1].suggestedGame, undefined, 'wyciszony nie przebija się przez kłódkę');

  // Kłódka od admina: jeden klik ją zakłada i jeden zdejmuje, zdjęcie zeruje liczniki.
  adminPad.send({ t: 'room', action: { kind: 'muted', slot: 1, value: true } });
  assert.equal(host2.session().roster[1].muted, true);
  quiet.send({ t: 'room', action: { kind: 'muted', slot: 0, value: true } });
  assert.equal(host2.session().roster[0].muted, false, 'gość nie wyciszy administratora');
  adminPad.send({ t: 'room', action: { kind: 'muted', slot: 99, value: true } });
  adminPad.send({ t: 'room', action: { kind: 'muted', slot: 1, value: false } });
  assert.equal(host2.session().roster[1].muted, false, 'odmucenie wraca do gry');
  fakeNow += ANTI_SPAM.autoMuteMs + 1; // skok względem siebie, nie względem epoki
  spammer.send({ t: 'suggest', game: 'race' });
  assert.equal(host2.session().roster[1].suggestedGame, 'race', 'po zdjęciu kłódki nie ma zaległego cooldownu');

  // Reconnect to nie nowa tożsamość: wyciszenie wraca razem z telefonem.
  adminPad.send({ t: 'room', action: { kind: 'muted', slot: 1, value: true } });
  wire2.dropConn(spammer.link.id);
  const back = pairAt('Marcin2', 'Marcin');
  assert.equal(host2.session().roster.find(p => p.nick === 'Marcin2')?.muted, true, 'powrót nie kasuje kłódki');
  back.send({ t: 'suggest', game: 'tanks' });
  assert.equal(host2.session().roster.find(p => p.nick === 'Marcin2')?.suggestedGame, undefined);

  // Śmieć w polu `game` nie dochodzi nawet do licznika.
  assert.equal(isPadMessage({ t: 'suggest', game: 42 }), false, 'numerek zamiast tytułu odpada na bramce');
  assert.equal(isPadMessage({ t: 'suggest', game: 'race' }), true);
  assert.equal(isPadMessage({ t: 'suggest', game: null }), true);
  adminPad.send({ t: 'suggest', game: '99' as never });
  assert.equal(host2.session().roster[0].suggestedGame, 'race', 'nieznany tytuł nie zmienia głosu');
  // Runda 25: blockcraft przestał być zapowiedzią, więc jak każdy grywalny tytuł
  // daje się zasugerować — sprawdzamy to zamiast dawnego „wip nie przechodzi”.
  adminPad.send({ t: 'suggest', game: 'blockcraft' });
  assert.equal(host2.session().roster[0].suggestedGame, 'blockcraft', 'grywalny tytuł zmienia głos');
  assert.equal(isHostMessage({ t: 'suggestAck', verdict: 'cooldown', retryInMs: 8_000 }), true);
  assert.equal(isHostMessage({ t: 'suggestAck', verdict: 'cooldown' }), false, 'odmowa bez czasu nie przechodzi');

  // Wyłączenie głosowania kasuje również urazę w licznikach.
  const late = pairAt('Oskar');
  late.send({ t: 'suggest', game: 'race' });
  assert.equal(host2.session().roster[3].suggestedGame, 'race');
  late.send({ t: 'suggest', game: 'tanks' });
  adminPad.send({ t: 'room', action: { kind: 'suggestions', value: false } });
  assert.equal(host2.session().roster[3].suggestedGame, undefined, 'wyłączenie głosowania czyści ekrany');
  adminPad.send({ t: 'room', action: { kind: 'suggestions', value: true } });
  late.send({ t: 'suggest', game: 'tanks' });
  assert.equal(host2.session().roster[3].suggestedGame, 'tanks', 'włączenie głosowania nie trzyma urazy');
} finally {
  Date.now = realNow;
}
const loungeSource = readFileSync('src/platform/PlayerLounge.tsx', 'utf8');
const hostSource = readFileSync('src/net/padHost.ts', 'utf8');
assert.ok(hostSource.includes("judgeSuggest({ game: typeof msg.game === 'string'"), 'anty-spam liczy telewizor, nie telefon');
assert.ok(loungeSource.includes('disabled={blocked || muted}'), 'wyciszony telefon nie klika w kółko');
console.log('ANTI-SPAM SELFTEST: OK (cooldown, duplikat, sufit w oknie, eskalacja i kłódka admina, reconnect, bramka protokołu)');

const safeProfile = normalizeProfile({ avatar: '__proto__', theme: 'red' });
assert.equal(safeProfile.avatar, 'smile'); assert.equal(safeProfile.theme, 'amber'); assert.ok(safeProfile.id);
saveProfile({ avatar: 'rocket', theme: 'violet', progress: { gamesPlayed: 0, wins: 0, streak: 0, bestStreak: 0, unlocked: [] } });
const saved = loadProfile(); assert.equal(saved.avatar, 'rocket'); assert.equal(saved.theme, 'violet'); assert.ok(saved.id);
const played = recordGamePlayed(saved); const won = recordWin(played, 'snake'); assert.equal(won.progress.gamesPlayed, 1); assert.equal(won.progress.wins, 1); assert.ok(won.progress.unlocked.includes('firstWin')); assert.ok(won.progress.unlocked.includes('snakeBeta'));
storage.set('joypad.profile', 'malformed'); assert.equal(loadProfile().avatar, 'smile');
Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('private mode'); } });
assert.doesNotThrow(() => saveProfile({ avatar: 'smile', theme: 'amber' }));
assert.equal(loadProfile().theme, 'amber');

// QR exposes only room capability data; no TURN credentials leak into the link.
Object.defineProperty(globalThis, 'location', { value: { search: '?srv=https%3A%2F%2Fsignal.example&turnSecret=secret', hash: '#pad=AB234&key=abcdef123456' , origin: 'https://example.com', pathname: '/JoyPad/' }, configurable: true });
const qr = padUrlFor('ab234', 'abcdef123456'); assert.ok(qr.includes('srv=')); assert.ok(qr.includes('key=abcdef123456')); assert.ok(!qr.includes('turnSecret'));
// Kod QR leży na ekranie godzinami, więc jego klucz musi się starzeć bez odrzucania telefonów w drodze.
const { joinTokenAccepted, joinTokenExpired, JOIN_TOKEN_GRACE_MS, JOIN_TOKEN_TTL_MS } = await import('../src/net/joinToken');
assert.equal(joinTokenExpired(0, JOIN_TOKEN_TTL_MS + 1), false, 'brak daty wydania = brak wygaśnięcia');
assert.equal(joinTokenExpired(1000, 1000 + JOIN_TOKEN_TTL_MS), true);
assert.equal(joinTokenAccepted('nowy', 'nowy', 'stary', 5000, 5000), true);
assert.equal(joinTokenAccepted('stary', 'nowy', 'stary', 5000, 5000 + JOIN_TOKEN_GRACE_MS - 1), true, 'dołączający telefon nie może zostać odproszony w połowie drogi');
assert.equal(joinTokenAccepted('stary', 'nowy', 'stary', 5000, 5000 + JOIN_TOKEN_GRACE_MS), false, 'łaska nie jest wieczna');
assert.equal(joinTokenAccepted('stary', 'nowy', '', 5000, 5000), false);
assert.equal(joinTokenAccepted(undefined, 'nowy', 'stary', 5000, 5000), false);
assert.equal(joinTokenAccepted('', '', 'stary', 5000, 5000), false, 'pokój bez klucza nie przyjmuje nikogo');
assert.equal(padCodeFromHash(), 'AB234'); assert.equal(padTokenFromHash(), 'abcdef123456');
assert.equal(isPadMessage({ t: 'input', fwd: 0, turn: 0, fire: false }), true); assert.equal(isPadMessage({ t: 'input', fwd: 'oops' }), false);
console.log('PROTOCOL SELFTEST: OK (QR capability filtering and message guard)');
console.log('PROFILE SELFTEST: OK (allowlist, persistence, corrupt and blocked storage)');

const players = [{ slot: 0, name: 'Ada', color: '#edbd78', score: 0 }, { slot: 1, name: 'Bartek', color: '#bbaaff', score: 0 }];
const rec = new MomentRecorder('tanks');
const tick = (left: number, scoreA = 0, scoreB = 0, paused = false, countdown = 0) => rec.observe({ timeLeft: left, paused, countdown, players: players.map((p, i) => ({ ...p, score: i ? scoreB : scoreA })) });
tick(300, 0, 0, false, 3); tick(300); tick(294, 1); rec.fx(0, 'kill'); tick(290, 2); rec.fx(0, 'kill');
assert.equal(rec.highlights()[0].kind, 'streak'); assert.equal(rec.highlights()[0].at, 10);
tick(290, 2, 0, true); tick(290, 2); tick(278, 2, 3);
assert.ok(rec.highlights().some(m => m.kind === 'lead' && m.slot === 1));
const before = rec.highlights(); rec.fx(1, 'fire'); rec.fx(1, 'hit');
assert.deepEqual(rec.highlights(), before, 'fire and ordinary damage are not fake highlights');
rec.fx(9, 'kill'); assert.deepEqual(rec.highlights(), before, 'unknown slots ignored');
for (let i = 0; i < 200; i++) rec.record({ kind: 'objective', slot: 0, title: 'Test', detail: 'Real engine event', at: i * 20 });
assert.equal((rec as unknown as { events: unknown[] }).events.length, 64);
assert.equal(rec.highlights().length, 3);
assert.equal(new MomentRecorder('tanks').highlights().length, 0, 'new round has no stale highlights');
assert.equal(momentTime(125.9), '02:05');
const race = new MomentRecorder('race');
race.observe({ timeLeft: 200, countdown: 3, paused: false, players });
race.observe({ timeLeft: 170, countdown: 0, paused: false, players: players.map(p => ({ ...p, score: 1 })) });
assert.equal(race.highlights()[0].kind, 'lap');
assert.ok(!race.highlights().some(m => m.kind === 'lead'), 'lap counts cannot invent race overtakes');
console.log('MOMENTS SELFTEST: OK (real FX, streaks, lead changes, timing, bounds, lap semantics, reset)');

/* Język interfejsu: kompletność słownika PL/EN, parametry i `<html lang>`. */
const { MESSAGES, applyDocumentLanguage, documentLanguageTag, t: translateMessage } = await import('../src/platform/i18n');
const { WHATS_NEW_VERSION } = await import('../src/platform/whatsNewState');
const plKeys = Object.keys(MESSAGES.pl);
assert.deepEqual(Object.keys(MESSAGES.en).filter(key => !(key in MESSAGES.pl)), [], 'klucz EN bez wersji PL');
assert.deepEqual(plKeys.filter(key => !(key in MESSAGES.en)), [], 'klucz PL bez wersji EN — anglojęzyczny gracz zobaczyłby polski napis');
const params = (text: string) => [...text.matchAll(/\{([a-zA-Z]+)\}/g)].map(match => match[1]).sort();
for (const key of plKeys) {
  assert.ok(MESSAGES.pl[key].trim().length > 0, `pusty napis pl:${key}`);
  const en = MESSAGES.en[key];
  if (en === undefined) continue;
  assert.ok(en.trim().length > 0, `pusty napis en:${key}`);
  assert.deepEqual(params(en), params(MESSAGES.pl[key]), `inne parametry w en:${key} — podstawienie zostawiłoby surowy znacznik`);
}
assert.equal(documentLanguageTag('pl'), 'pl');
assert.equal(documentLanguageTag('en'), 'en');
const attrs: Record<string, string> = {};
const target = { setAttribute: (name: string, value: string) => { attrs[name] = value; } };
applyDocumentLanguage('en', target);
assert.equal(attrs.lang, 'en', 'dokument dostaje znacznik wybranego języka');
applyDocumentLanguage('pl', target);
assert.equal(attrs.lang, 'pl');
applyDocumentLanguage('en'); // bez DOM-u: cicho, bez wyjątku
assert.ok(translateMessage('en', 'library.version').includes(WHATS_NEW_VERSION), 'numer wersji w stopce bierze się z jednego źródła');
assert.equal(translateMessage('pl', 'results.teamWins'), 'DRUŻYNA WYGRYWA');
console.log(`LANGUAGE SELFTEST: OK (${plKeys.length} kluczy PL/EN, parametry, znacznik lang dokumentu, wersja z jednego źródła)`);


// Ruch po ekranie wyników robi nawigacja przestrzenna (`focusSurface` + `useUiControls`),
// więc płaska lista `navigateResults` została wycofana. Jej zamiennik testuje
// `selftest:console` (sekcja UI CONTROL: powierzchnie menu gier, stepperzy i bramka
// „pad gra / pilot steruje menu").