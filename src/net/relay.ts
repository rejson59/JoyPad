/**
 * Awaryjny przekaźnik — ścieżka wiadomości, która działa „zawsze i wszędzie”.
 *
 * Gdy łączenie bezpośrednie (WebRTC P2P, nawet z TURN) nie przechodzi — np.
 * telefon na LTE za CGNAT albo symetrycznym NAT — gra i tak działa, bo leci
 * przez publiczny broker MQTT nad WebSocokietem (wss://). Komputer, dopóki
 * pokój jest aktywny, stale subskrybuje temat pokoju; telefon, gdy połączenie
 * bezpośrednie nie przechodzi, łączy się tam i wysyła te same wiadomości
 * JSON (hello / input / ping …).
 *
 * Ruch jest niewielki (stan joysticka to ~50 bajtów, kilka razy na sekundę),
 * więc publiczny broker w zupełności wystarcza. Minimalny klient MQTT 3.1.1
 * (QoS 0) jest zaimplementowany bezpośrednio na WebSocokiecie przeglądarki —
 * bez zależności zewnętrznych.
 */
import type { PadLink } from './links';

/*
 * Publiczni brokerzy MQTT-over-WSS, próbowani po kolei. Obie strony łączenia
 * próbują tej samej listy, więc spotkają się na pierwszym dostępnym dla nich.
 */
export const RELAY_BROKERS: string[] = [
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://broker.emqx.io:8084/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];

/** Temat pokoju na przekaźniku. 5-znakowy kod to jedyny „klucz” (jak QR). */
export function relayTopicFor(code: string): string {
  return `stalowy-front/${code.toUpperCase()}`;
}

/** Losowy identyfikator sesji / telefonu (16 znaków base36). */
export function newRelaySessionId(): string {
  const arr = new Uint32Array(4);
  crypto.getRandomValues(arr);
  let s = '';
  for (const x of arr) s += x.toString(36);
  return s.slice(0, 16);
}

/** Wiadomość przekaźnika: `cid` = adresat (telefon), `m` = payload protokołu. */
export interface RelayItem {
  cid: string;
  m: unknown;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ------------------------------ MQTT 3.1.1 ------------------------------
 * Gra potrzebuje tylko: CONNECT, SUBSCRIBE, PUBLISH (QoS 0) i PINGREQ.
 * Reszta protokołu (QoS 1/2, retained, LWT) jest celowo niezaimplementowana. */

function encodeRemainingLength(n: number): number[] {
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

function mqttFrame(type: number, flags: number, body: number[]): Uint8Array {
  const raw = [((type << 4) | flags) & 0xff, ...encodeRemainingLength(body.length), ...body];
  const u = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) u[i] = raw[i];
  return u;
}

function writeMqttString(out: number[], s: string): void {
  const b = enc.encode(s);
  out.push((b.length >> 8) & 0xff, b.length & 0xff);
  for (let i = 0; i < b.length; i++) out.push(b[i]);
}

/** Najmniejszy możliwy klient MQTT 3.1.1 nad WebSocokietem (clean session, QoS 0). */
class MqttClient {
  private ws: WebSocket;
  private clientId: string;
  private buf = new Uint8Array(0);
  private failed = false;
  private pingTimer = 0;
  private subPackets = new Map<number, (granted: boolean) => void>();
  private onPacket: (type: number, flags: number, payload: Uint8Array) => void;
  private onTransportClose: () => void;

  constructor(
    ws: WebSocket,
    clientId: string,
    onPacket: (type: number, flags: number, payload: Uint8Array) => void,
    onTransportClose: () => void,
  ) {
    this.ws = ws;
    this.clientId = clientId;
    this.onPacket = onPacket;
    this.onTransportClose = onTransportClose;
    ws.onopen = () => this.sendConnect();
    ws.onmessage = (ev: MessageEvent) => {
      if (ev.data instanceof ArrayBuffer) this.onData(new Uint8Array(ev.data));
    };
    ws.onclose = () => this.fail();
    ws.onerror = () => { /* za onclose */ };
  }

  private sendConnect(): void {
    const body: number[] = [];
    writeMqttString(body, 'MQTT');
    body.push(0x04);        // poziom protokołu 4 (MQTT 3.1.1)
    body.push(0x02);        // clean session
    body.push(0x00, 30);    // keep-alive 30 s
    writeMqttString(body, this.clientId);
    this.sendRaw(mqttFrame(1, 0x00, body));
  }

  subscribe(topic: string, onResult: (granted: boolean) => void): void {
    const pid = (Math.floor(Math.random() * 0xffff) + 1) & 0xffff;
    this.subPackets.set(pid, onResult);
    const body: number[] = [(pid >> 8) & 0xff, pid & 0xff];
    writeMqttString(body, topic);
    body.push(0x00);        // żądane QoS: 0
    this.sendRaw(mqttFrame(8, 0x02, body));
  }

  publish(topic: string, payload: Uint8Array): void {
    const body: number[] = [];
    writeMqttString(body, topic);
    for (let i = 0; i < payload.length; i++) body.push(payload[i]);
    this.sendRaw(mqttFrame(3, 0x00, body));
  }

  ping(): void {
    this.sendRaw(mqttFrame(12, 0x00, []));
  }

  disconnect(): void {
    this.sendRaw(mqttFrame(14, 0x00, []));
  }

  startKeepAlive(): void {
    this.pingTimer = window.setInterval(() => this.ping(), 15_000);
  }

  private sendRaw(bytes: Uint8Array): void {
    if (this.failed || this.ws.readyState !== WebSocket.OPEN) return;
    try { this.ws.send(bytes); } catch { /* ignore */ }
  }

  onData(chunk: Uint8Array): void {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    for (;;) {
      if (this.buf.length < 2) return; // czekamy na nagłówek
      const first = this.buf[0];
      const type = first >> 4;
      let mult = 1;
      let remaining = 0;
      let idx = 1;
      for (;;) {
        if (this.buf.length < idx + 1) return; // nie mamy jeszcze pełnej długości
        const d = this.buf[idx];
        remaining += (d & 0x7f) * mult;
        idx += 1; // każdy bajt długości jest zużywany
        if ((d & 0x80) === 0) break;
        mult *= 128;
        if (mult > 128 * 128 * 128) { this.fail(); return; }
      }
      const total = idx + remaining;
      if (this.buf.length < total) return; // czekamy na resztę pakietu
      const payload = this.buf.subarray(idx, total);
      this.buf = this.buf.subarray(total);
      // SUBACK obsługujemy wewnętrznie (parowanie po identyfikatorze pakietu)
      if (type === 9 && payload.length >= 3) {
        const pid = (payload[0] << 8) | payload[1];
        const cb = this.subPackets.get(pid);
        this.subPackets.delete(pid);
        if (cb) { cb(payload[2] !== 0x80); return; }
      }
      this.onPacket(type, first & 0x0f, payload);
    }
  }

  fail(): void {
    if (this.failed) return;
    this.failed = true;
    this.abort();
    this.onTransportClose();
  }

  /** Zamyka gniazdo bez wywoływania callbacków (czyste sprzątanie). */
  abort(): void {
    const ws = this.ws;
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = 0; }
    try { ws.close(); } catch { /* ignore */ }
  }
}

/* ------------------------------ kanał ----------------------------------
 * Jeden otwarty kanał = jedno gniazdo WSS + subskrypcja jednego tematu.
 * Host: jeden kanał na aktywnego brokera, wiele telefonów (po `cid`).
 * Telefon: kanał na bieżącego brokera, subskrybuje tylko wiadomości dla swego `cid`.
 */
export class RelayChannel {
  private client: MqttClient;
  private topic: string;
  private connacked = false;
  private subAcked = false;
  private settled = false;
  private closed = false;
  private flushTimer = 0;
  private outbox: RelayItem[] = [];
  private batchCb: ((items: RelayItem[]) => void) | null = null;
  private closeListeners = new Set<() => void>();
  private settleOk: (() => void) | null = null;
  private settleErr: ((err: Error) => void) | null = null;

  /** Kanał połączony i gotowy do wysyłki/odbioru. */
  get open(): boolean {
    return this.settled && !this.closed && this.connacked;
  }

  /** Broker potwierdził subskrypcję (SUBACK) — do diagnostyki. */
  get subscribed(): boolean {
    return this.subAcked;
  }

  static connect(url: string, topic: string, timeoutMs = 8_000): Promise<RelayChannel> {
    return new Promise((resolve, reject) => {
      let ws: WebSocket;
      try {
        ws = new WebSocket(url);
      } catch (err) {
        reject(err instanceof Error ? err : new Error('nie można otworzyć gniazda WebSocket'));
        return;
      }
      ws.binaryType = 'arraybuffer';
      const channel = new RelayChannel(ws, topic);
      const deadline = window.setTimeout(() => {
        if (!channel.settled) channel.fail(new Error('broker nie odpowiedział w czasie'));
      }, timeoutMs);
      channel.settleOk = () => { window.clearTimeout(deadline); resolve(channel); };
      channel.settleErr = (err) => { window.clearTimeout(deadline); reject(err); };
    });
  }

  private constructor(ws: WebSocket, topic: string) {
    this.topic = topic;
    const clientId = 'sf-' + newRelaySessionId();
    this.client = new MqttClient(
      ws,
      clientId,
      (type, flags, payload) => this.handlePacket(type, flags, payload),
      () => this.transportClosed(),
    );
  }

  /** Handler przychodzących partii wiadomości (ustawia właściciel kanału). */
  onBatch(cb: ((items: RelayItem[]) => void) | null): void {
    this.batchCb = cb;
  }

  /** Zwraca funkcję odwołującą słuchacza zamknięcia kanału. */
  addCloseListener(cb: () => void): () => void {
    this.closeListeners.add(cb);
    return () => { this.closeListeners.delete(cb); };
  }

  /**
   * Wyrzuca wiadomości do brokera. Partiami ~100 ms: mniej i większych
   * komunikatów — publiczni brokerzy to wolą (limity per wiadomość).
   */
  publish(items: RelayItem[]): void {
    if (!this.open || items.length === 0) return;
    for (const it of items) this.outbox.push(it);
    if (!this.flushTimer) {
      this.flushTimer = window.setTimeout(() => {
        this.flushTimer = 0;
        const batch = this.outbox;
        this.outbox = [];
        if (batch.length === 0) return;
        try {
          this.client.publish(this.topic, enc.encode(JSON.stringify(batch)));
        } catch { /* ignore */ }
      }, 100);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    if (this.flushTimer) { window.clearTimeout(this.flushTimer); this.flushTimer = 0; }
    this.outbox = [];
    try { this.client.disconnect(); } catch { /* ignore */ }
    this.client.abort();
    this.fireClose();
  }

  private handlePacket(type: number, flags: number, payload: Uint8Array): void {
    switch (type) {
      case 2: { // CONNACK
        if (payload.length < 2) return;
        const rc = payload[1];
        if (rc === 0) {
          this.connacked = true;
          this.settled = true;
          this.client.startKeepAlive();
          this.client.subscribe(this.topic, (granted) => { this.subAcked = granted; });
          this.settleOk?.();
        } else {
          this.fail(new Error(`broker odrzucił połączenie (kod ${rc})`));
        }
        return;
      }
      case 3: { // PUBLISH
        if (payload.length < 2) return;
        const tlen = (payload[0] << 8) | payload[1];
        if (payload.length < 2 + tlen) return;
        const topic = dec.decode(payload.subarray(2, 2 + tlen));
        if (topic !== this.topic) return;
        let rest = payload.subarray(2 + tlen);
        const qos = (flags >> 1) & 0x03;
        if (qos > 0) {
          if (rest.length < 2) return;
          rest = rest.subarray(2); // identyfikator pakietu (u nas QoS 0 — go nie ma)
        }
        const json = dec.decode(rest);
        let items: object[];
        try {
          const parsedJson: unknown = JSON.parse(json);
          items = Array.isArray(parsedJson) ? (parsedJson as object[]) : [parsedJson as object];
        } catch {
          return;
        }
        const parsed: RelayItem[] = [];
        for (const it of items) {
          if (it && typeof it === 'object' && typeof (it as RelayItem).cid === 'string') {
            parsed.push(it as RelayItem);
          }
        }
        if (parsed.length > 0 && this.batchCb) this.batchCb(parsed);
        return;
      }
      case 13: // PINGRESP
        return;
      default:
        return;
    }
  }

  private transportClosed(): void {
    if (!this.settled) {
      this.settled = true;
      this.settleErr?.(new Error('broker zamknął połączenie'));
    }
    this.close();
  }

  private fail(err: Error): void {
    if (this.settled) return;
    this.settled = true;
    this.close();
    this.settleErr?.(err);
  }

  private fireClose(): void {
    for (const cb of [...this.closeListeners]) {
      try { cb(); } catch { /* ignore */ }
    }
  }
}

/* ------------------------------ linki ---------------------------------- */

/**
 * Strona hosta: jeden pad w pokoju, zidentyfikowany po `cid` telefonu.
 * Kanał (broker) może obsługiwać wiele takich linków naraz.
 */
export class HostRelayLink implements PadLink {
  readonly kind = 'relay' as const;
  readonly id: string;
  private channel: RelayChannel | null;
  private msgCb: ((msg: unknown) => void) | null = null;
  private closedCb: (() => void) | null = null;
  private closedFired = false;
  private unsub: (() => void) | null = null;

  constructor(channel: RelayChannel, cid: string) {
    this.channel = channel;
    this.id = cid;
    this.unsub = channel.addCloseListener(() => this.fireClosed());
  }

  private fireClosed(): void {
    if (this.closedFired) return;
    this.closedFired = true;
    this.unsub?.();
    this.unsub = null;
    this.closedCb?.();
  }

  get open(): boolean {
    return this.channel?.open ?? false;
  }

  send(msg: unknown): void {
    if (this.channel?.open) this.channel.publish([{ cid: this.id, m: msg }]);
  }

  onMessage(cb: ((msg: unknown) => void) | null): void {
    this.msgCb = cb;
  }

  onClosed(cb: (() => void) | null): void {
    this.closedCb = cb;
  }

  /** Dostarcza wiadomość od brokera do logiki hosta (o ile link żyje). */
  deliver(msg: unknown): void {
    if (!this.closedFired) this.msgCb?.(msg);
  }

  /** Kopnięcie przez hosta: pad zamykamy, kanał dalej obsługuje inne telefony. */
  close(): void {
    this.fireClosed();
  }
}

/**
 * Strona telefonu: akceptuje wyłącznie wiadomości adresowane do własnego `cid`.
 * `close()` zamyka cały kanał (telefon ma jeden kanał naraz).
 */
export class ClientRelayLink implements PadLink {
  readonly kind = 'relay' as const;
  readonly id: string;
  private readonly channel: RelayChannel;
  private msgCb: ((msg: unknown) => void) | null = null;
  private closedCb: (() => void) | null = null;
  private closedFired = false;
  private unsub: (() => void) | null = null;
  private readonly handleBatch: (items: RelayItem[]) => void;

  constructor(channel: RelayChannel, cid: string) {
    this.channel = channel;
    this.id = cid;
    this.handleBatch = (items) => {
      if (this.closedFired) return;
      for (const it of items) {
        if (it.cid === cid) this.msgCb?.(it.m);
      }
    };
    channel.onBatch(this.handleBatch);
    this.unsub = channel.addCloseListener(() => this.fireClosed());
  }

  private fireClosed(): void {
    if (this.closedFired) return;
    this.closedFired = true;
    this.unsub?.();
    this.unsub = null;
    this.closedCb?.();
  }

  get open(): boolean {
    return this.channel.open;
  }

  send(msg: unknown): void {
    this.channel.publish([{ cid: this.id, m: msg }]);
  }

  onMessage(cb: ((msg: unknown) => void) | null): void {
    this.msgCb = cb;
  }

  onClosed(cb: (() => void) | null): void {
    this.closedCb = cb;
  }

  close(): void {
    this.fireClosed();
    this.channel.onBatch(null);
    this.channel.close();
  }
}
