/**
 * Lokalny selftest awaryjnego przekaźnika (bez internetu):
 * symuluje brokera MQTT w pamięci i sprawdza cały stos — klatki MQTT
 * (CONNECT/SUBSCRIBE/PUBLISH/PINGREQ), kanał, batchy i linki.
 *
 * Uruchomienie:
 *   npx esbuild scripts/relay-selftest.ts --bundle --format=esm --platform=node \
 *     --outfile=/tmp/relay-selftest.mjs && node /tmp/relay-selftest.mjs
 */
import assert from 'node:assert';

/* Stub okna (relay.ts używa window.setTimeout/setInterval) */
(globalThis as unknown as Record<string, unknown>).window = globalThis;

/* ------------------- minimalny serwer MQTT (fałszywy broker) ------------------- */

const enc = new TextEncoder();
const dec = new TextDecoder();

function encLen(n: number): number[] {
  const out: number[] = [];
  for (;;) {
    let d = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) d |= 0x80;
    out.push(d);
    if (n === 0) break;
  }
  return out;
}

function frame(type: number, flags: number, body: number[]): Uint8Array {
  const raw = [((type << 4) | flags) & 0xff, ...encLen(body.length), ...body];
  const u = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u[i] = raw[i];
  return u;
}

function str(s: string): number[] {
  const b = enc.encode(s);
  const out: number[] = [(b.length >> 8) & 0xff, b.length & 0xff];
  for (const x of b) out.push(x);
  return out;
}

interface FwPacket { type: number; flags: number; payload: Uint8Array }

function parsePackets(buf: Uint8Array): { packets: FwPacket[]; rest: Uint8Array } {
  const packets: FwPacket[] = [];
  let idx = 0;
  while (idx + 1 < buf.length) {
    const first = buf[idx];
    const type = first >> 4;
    let mult = 1;
    let remaining = 0;
    let i = idx + 1;
    for (;;) {
      if (i >= buf.length) return { packets, rest: buf.subarray(idx) };
      const d = buf[i];
      remaining += (d & 0x7f) * mult;
      i += 1;
      if ((d & 0x80) === 0) break;
      mult *= 128;
    }
    if (buf.length < i + remaining) return { packets, rest: buf.subarray(idx) };
    packets.push({ type, flags: first & 0x0f, payload: buf.subarray(i, i + remaining) });
    idx = i + remaining;
  }
  return { packets, rest: buf.subarray(idx) };
}

class FakeBroker {
  onClientPublish: ((topic: string, json: string) => void) | null = null;
  seenConnectIds: string[] = [];
  seenSubscribes: string[] = [];
  pingCount = 0;
  disconnects = 0;
  private buf = new Uint8Array(0);

  handle(bytes: Uint8Array, reply: (f: Uint8Array) => void) {
    const merged = new Uint8Array(this.buf.length + bytes.length);
    merged.set(this.buf, 0);
    merged.set(bytes, this.buf.length);
    this.buf = merged;
    const { packets, rest } = parsePackets(this.buf);
    this.buf = rest;
    for (const p of packets) {
      switch (p.type) {
        case 1: { // CONNECT — weryfikacja ramek
          assert.ok(p.payload.length > 11, 'CONNECT zbyt krótki');
          assert.strictEqual(dec.decode(p.payload.subarray(2, 6)), 'MQTT', 'nazwa protokołu');
          assert.strictEqual(p.payload[6], 0x04, 'poziom protokołu 4 (3.1.1)');
          assert.strictEqual(p.payload[7] & 0x02, 0x02, 'clean session');
          const keepAlive = (p.payload[8] << 8) | p.payload[9];
          assert.strictEqual(keepAlive, 30, 'keep-alive 30 s');
          const cidLen = (p.payload[10] << 8) | p.payload[11];
          const cid = dec.decode(p.payload.subarray(12, 12 + cidLen));
          assert.ok(cid.startsWith('sf-'), `clientId: ${cid}`);
          this.seenConnectIds.push(cid);
          reply(frame(2, 0, [0x00, 0x00])); // CONNACK: akceptowane
          break;
        }
        case 8: { // SUBSCRIBE
          assert.strictEqual(p.flags, 0x02, 'flagi SUBSCRIBE');
          const pid = (p.payload[0] << 8) | p.payload[1];
          const tlen = (p.payload[2] << 8) | p.payload[3];
          const topic = dec.decode(p.payload.subarray(4, 4 + tlen));
          assert.strictEqual(p.payload[4 + tlen], 0x00, 'żądane QoS 0');
          this.seenSubscribes.push(topic);
          reply(frame(9, 0, [(pid >> 8) & 0xff, pid & 0xff, 0x00])); // SUBACK: przyznane QoS 0
          break;
        }
        case 3: { // PUBLISH — echo do klienta (jak broker do subskrybentów)
          assert.strictEqual(p.flags, 0x00, 'PUBLISH QoS 0');
          const tlen = (p.payload[0] << 8) | p.payload[1];
          const topic = dec.decode(p.payload.subarray(2, 2 + tlen));
          const body = p.payload.subarray(2 + tlen);
          this.onClientPublish?.(topic, dec.decode(body));
          const out: number[] = [...str(topic)];
          for (const b of body) out.push(b);
          reply(frame(3, 0, out));
          break;
        }
        case 12: // PINGREQ
          this.pingCount++;
          reply(frame(13, 0, [])); // PINGRESP
          break;
        case 14:
          this.disconnects++;
          break;
        default:
          throw new Error(`nieoczekiwany typ pakietu od klienta: ${p.type}`);
      }
    }
  }
}

/* ------------------- fałszywy WebSocket (przeglądarkowy) ------------------- */

const BROKER_URL = 'wss://fake.broker:8884/mqtt';
let activeBroker: FakeBroker | null = null;

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  readyState = 0; // CONNECTING
  binaryType = '';
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: ArrayBuffer }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private broker: FakeBroker;
  private closed = false;

  constructor(url: string, _broker?: FakeBroker) {
    assert.strictEqual(url, BROKER_URL);
    this.broker = _broker ?? activeBroker!;
    FakeWebSocket.instances.push(this);
    setTimeout(() => {
      if (this.closed) return;
      this.readyState = 1; // OPEN
      this.onopen?.();
    }, 2);
  }

  /** Nadchodząca ramka z "brokera" do klienta. */
  pushFromServer(bytes: Uint8Array) {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    this.onmessage?.({ data: ab });
  }

  send(bytes: Uint8Array) {
    if (this.readyState !== 1) return;
    this.broker.handle(bytes, (f) => this.pushFromServer(f));
  }

  close() {
    this.closed = true;
    this.readyState = 3; // CLOSED
    if (this.onclose) this.onclose();
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------- test ------------------------------- */

async function main() {
  const broker = new FakeBroker();
  activeBroker = broker;
  const origWebSocket = (globalThis as unknown as Record<string, unknown>).WebSocket;
  (globalThis as unknown as Record<string, unknown>).WebSocket = class {
    constructor(url: string) { return new FakeWebSocket(url); }
  } as unknown as typeof WebSocket;
  (globalThis as unknown as Record<string, unknown>).WebSocket.OPEN = 1;

  const { RelayChannel, ClientRelayLink, HostRelayLink, relayTopicFor, newRelaySessionId } =
    await import('../src/net/relay');

  /* 1. Połączenie + subskrypcja (CONNACK, SUBACK) */
  const topic = relayTopicFor('abc12');
  assert.strictEqual(topic, 'stalowy-front/ABC12');
  const channel = await RelayChannel.connect(BROKER_URL, topic, 3000);
  assert.ok(channel.open, 'kanał otwarty');
  assert.deepStrictEqual(broker.seenSubscribes, [topic], 'subskrypcja tematu pokoju');
  assert.strictEqual(broker.seenConnectIds.length, 1);
  await sleep(30);
  assert.strictEqual(channel.subscribed, true, 'SUBACK odebrany');

  /* 2. Echo end-to-end: publikacja => broker => onBatch */
  const echoed = await new Promise<string[]>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('brak echo od brokera')), 3000);
    channel.onBatch((items) => {
      clearTimeout(t);
      resolve(items.map((i) => i.cid));
    });
    channel.publish([{ cid: 'cid-1', m: { t: 'ping', at: 1 } }]);
  });
  assert.deepStrictEqual(echoed, ['cid-1'], 'echo wrócił');
  assert.strictEqual(broker.pingCount, 0, 'jeszcze bez PINGREQ');

  /* 3. Link klienta filtruje po cid */
  const cidA = newRelaySessionId();
  const cidB = newRelaySessionId();
  const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1];
  const linkA = new ClientRelayLink(channel, cidA);
  const fromA: unknown[] = [];
  linkA.onMessage((m) => fromA.push(m));
  // Wstrzykujemy partię od "brokera" z dwoma adresatami — link A ma dostać tylko swój.
  const batch: number[] = [...str(topic), ...enc.encode(JSON.stringify([
    { cid: cidA, m: { t: 'pong', at: 5 } },
    { cid: cidB, m: { t: 'fx', fx: 'fire' } },
  ]))];
  ws.pushFromServer(frame(3, 0, batch));
  await sleep(20);
  assert.strictEqual(fromA.length, 1, 'link A dostał dokładnie jedną wiadomość');
  assert.deepStrictEqual(fromA[0], { t: 'pong', at: 5 });

  /* 4. Link hosta wysyła do brokera (batch ~100 ms) */
  const hostLink = new HostRelayLink(channel, cidA);
  assert.ok(hostLink.open, 'link hosta otwarty');
  let published: { topic: string; json: string } | null = null;
  broker.onClientPublish = (t, j) => { published = { topic: t, json: j }; };
  hostLink.send({ t: 'welcome', slot: 0, name: 'X', color: '#fff', darkColor: '#000', screen: 'menu' });
  await sleep(250);
  assert.ok(published, 'host opublikował');
  const pubItems = JSON.parse(published!.json) as Array<{ cid: string; m: { t: string } }>;
  assert.strictEqual(published!.topic, topic);
  assert.strictEqual(pubItems.length, 1);
  assert.strictEqual(pubItems[0].cid, cidA);
  assert.strictEqual(pubItems[0].m.t, 'welcome');

  /* 5. Dwie publikacje w krótkim czasie => jedna partia (batching) */
  published = null;
  hostLink.send({ t: 'hud', hp: 1 });
  hostLink.send({ t: 'hud', hp: 2 });
  await sleep(250);
  assert.ok(published, 'druga partia');
  assert.strictEqual((JSON.parse(published!.json) as unknown[]).length, 2, 'batch zawiera 2 elementy');

  /* 6. Zamknięcie kanału => linki dostają onClosed (raz), DISCONNECT do brokera */
  let aClosed = 0;
  let hClosed = 0;
  linkA.onClosed(() => { aClosed += 1; });
  hostLink.onClosed(() => { hClosed += 1; });
  channel.close();
  assert.strictEqual(aClosed, 1, 'link klienta zamknięty');
  assert.strictEqual(hClosed, 1, 'link hosta zamknięty');
  assert.ok(!channel.open, 'kanał zamknięty');
  assert.ok(broker.disconnects >= 1, 'DISCONNECT wysłany');
  assert.ok(hostLink.open === false, 'link hosta po zamknięciu nieaktywny');

  /* 7. Odrzucone połączenie (CONNACK rc=5) => reject z błędem */
  const broker2 = new FakeBroker();
  const origHandler = broker2.handle.bind(broker2);
  broker2.handle = (bytes, reply) => {
    origHandler(bytes, (f) => {
      // zamień CONNACK (0x20) na odrzucenie (0x20 02 00 05)
      if (f[0] === 0x20) reply(frame(2, 0, [0x00, 0x05]));
      else reply(f);
    });
  };
  activeBroker = broker2;
  let rejected = false;
  try {
    await RelayChannel.connect(BROKER_URL, topic, 3000);
  } catch (err) {
    rejected = true;
    assert.ok(String(err).includes('kod 5'), `błąd: ${String(err)}`);
  }
  assert.ok(rejected, 'rejestracja odrzucona => reject');


  (globalThis as unknown as Record<string, unknown>).WebSocket = origWebSocket;
  console.log('RELAY SELFTEST: OK (7/7)');
}

main().catch((err) => {
  console.error('RELAY SELFTEST: FAIL', err);
  process.exit(1);
});
