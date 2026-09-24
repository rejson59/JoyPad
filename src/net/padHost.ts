import Peer, { type DataConnection } from 'peerjs';
import {
  PROTOCOL_VERSION, ZERO_INPUT, randomCode, roomIdFromCode,
  type HostMessage, type HostScreen, type PadFx, type PadInput, type PadMessage, type PadSteer,
} from './protocol';
import { buildPeerOptions, signalingFromLocation, type SignalingConfig } from './signaling';
import { WebrtcLink, type PadLink } from './links';
import { HostRelayLink, RELAY_BROKERS, RelayChannel, relayTopicFor, type RelayItem } from './relay';

export interface PadInfo {
  connId: string;
  slot: number;
  nick: string;
  connectedAt: number;
  lastSeen: number;
  latency: number;
  /** Przez jaki transport leci ten pad. */
  via: 'webrtc' | 'relay';
  /** Stały identyfikator telefonu (localStorage na telefonie). */
  pid?: string;
  /** Tryb sterowania wybrany na tym telefonie (brak = stary pad: góra/dół = przód/tył). */
  steer?: PadSteer;
}

export interface SlotMeta { name: string; color: string; darkColor: string }

export type HostStatus = 'idle' | 'connecting' | 'ready' | 'error';

/** Łączność z serwerem sygnalizacji (brokerem). */
export type SignalState = 'offline' | 'connecting' | 'online' | 'lost';

/** Łączność z awaryjnym przekaźnikiem (broker MQTT — łączność między sieciami). */
export type RelayState = 'off' | 'connecting' | 'online';

export interface PadHostState {
  status: HostStatus;
  code: string;
  error: string | null;
  pads: PadInfo[];
  signal: SignalState;
  relay: RelayState;
  /** Liczba nieudanych prób rejestracji w serwerze. */
  attempts: number;
  /** Ostatni problem techniczny (pokazywany w panelu). */
  lastError: string | null;
  /** Dodatkowa informacja dla graczy, np. że kod został odświeżony. */
  note: string | null;
  signaling: string;
}

type Listener = (s: PadHostState) => void;

const MAX_SLOTS = 4;
/* Publiczny serwer bywa wolny — pierwsza rejestracja potrafi zająć kilkanaście sekund. */
const REGISTER_TIMEOUT = 20_000;
const MAX_ATTEMPTS_BEFORE_NOTICE = 3;
/** Jak często sprawdzamy, czy pokój nadal widnieje na serwerze (czy telefony go znajdą). */
const PROBE_INTERVAL = 30_000;
/** Ile razy próbujemy tego samego kodu, zanim go zmienimy (QR). */
const MAX_CONFLICT_RETRIES = 4;
/** Pad, który nic nie sygnalizuje dłużej niż to (telefon pinguje co 2 s), traktujemy jako rozłączony. */
const STALE_PAD_MS = 10_000;
/** Drugi „hello” z tego samego telefonu (inna ścieżka) ignorujemy, dopóki pierwsza jest świeża. */
const PAD_SWITCH_GRACE_MS = 4_000;

/** Walidacja trybu sterowania z telefonu (nic innego nie przechodzi — `undefined` = stary pad). */
function normSteer(v: unknown): PadSteer | undefined {
  return v === 'direct' || v === 'tank' ? v : undefined;
}

/**
 * Host (komputer): tworzy pokój w sieci PeerJS i przyjmuje telefony-pady.
 * Każdy telefon dostaje wolny slot gracza (0..3). Wejście z telefonu
 * przechowywane jest w `inputs` i czytane przez silnik gry co klatkę.
 *
 * Rejestracja w serwerze sygnalizacji jest ponawiana automatycznie i po cichu —
 * kod pokoju (QR) zostaje ten sam, więc gracze nie muszą nic robić.
 *
 * Dodatkowo host stale podsłuchuje awaryjny przekaźnik (broker MQTT): gdy
 * łączenie bezpośrednie (WebRTC) nie przechodzi — np. telefon na LTE za
 * trudnym NAT — telefon i tak się łączy przez przekaźnik.
 */
export class PadHost {
  private peer: Peer | null = null;
  private conns = new Map<string, PadLink>();
  private pads = new Map<string, PadInfo>();
  /** pid telefonu -> connId jego aktywnego pada (anti-duplicate slot). */
  private padsByPid = new Map<string, string>();
  private listeners = new Set<Listener>();
  private slotMeta: SlotMeta[] = [];
  private screen: HostScreen = 'menu';
  private hudTimers = new Map<string, number>();

  private registerTimer = 0;
  private retryTimer = 0;
  private probeTimer = 0;
  private sweepTimer = 0;
  private probing = false;
  private lastPadChangeAt = 0;
  private attempts = 0;
  private conflictRetries = 0;
  private running = false;
  private signaling: SignalingConfig = signalingFromLocation();

  /* Awaryjny przekaźnik (niezależny od serwera sygnalizacji). */
  private relayChannel: RelayChannel | null = null;
  /** Linki padów idących przez przekaźnik (cid -> link). */
  private relayLinks = new Map<string, HostRelayLink>();
  private relayTimer = 0;
  private relayCursor = 0;
  private relayToken = 0;

  status: HostStatus = 'idle';
  code = '';
  error: string | null = null;
  signal: SignalState = 'offline';
  relay: RelayState = 'off';
  lastError: string | null = null;
  note: string | null = null;

  /** Aktualne wejście dla każdego slotu gracza. */
  readonly inputs: PadInput[] = Array.from({ length: MAX_SLOTS }, () => ({ ...ZERO_INPUT }));

  /** Wywoływane, gdy zmieni się przypisanie slotów (dołączył / odszedł telefon). */
  onSlotsChanged: ((slots: (PadInfo | null)[]) => void) | null = null;
  onPauseRequest: (() => void) | null = null;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.snapshot());
    return () => { this.listeners.delete(fn); };
  }

  snapshot(): PadHostState {
    return {
      status: this.status,
      code: this.code,
      error: this.error,
      pads: [...this.pads.values()].sort((a, b) => a.slot - b.slot),
      signal: this.signal,
      relay: this.relay,
      attempts: this.attempts,
      lastError: this.lastError,
      note: this.note,
      signaling: this.signaling.label,
    };
  }

  private emit() { const s = this.snapshot(); this.listeners.forEach(l => l(s)); }

  setSlotMeta(meta: SlotMeta[]) {
    this.slotMeta = meta;
    for (const p of this.pads.values()) {
      const m = meta[p.slot];
      if (m) this.send(p.connId, { t: 'slot', slot: p.slot, ...m });
    }
  }

  setScreen(screen: HostScreen, extra?: { winnerSlot?: number | null; winnerName?: string; winnerColor?: string }) {
    this.screen = screen;
    for (const p of this.pads.values()) {
      this.send(p.connId, {
        t: 'screen', screen,
        winnerName: extra?.winnerName, winnerColor: extra?.winnerColor,
        youWon: extra?.winnerSlot === undefined ? undefined : extra.winnerSlot === p.slot,
      });
    }
  }

  slotOf(connId: string) { return this.pads.get(connId)?.slot ?? -1; }
  padForSlot(slot: number): PadInfo | null { for (const p of this.pads.values()) if (p.slot === slot) return p; return null; }
  slots(): (PadInfo | null)[] { return Array.from({ length: MAX_SLOTS }, (_, i) => this.padForSlot(i)); }

  sendHud(slot: number, hud: Extract<HostMessage, { t: 'hud' }>) {
    const p = this.padForSlot(slot);
    if (!p) return;
    const now = performance.now();
    const last = this.hudTimers.get(p.connId) ?? 0;
    // Przekaźnik ma ograniczony przepustowością ruch — HUD leci tam rzadziej.
    const minGap = this.conns.get(p.connId)?.kind === 'relay' ? 300 : 120;
    if (now - last < minGap) return; // ~8 Hz (120 ms) / ~3 Hz (300 ms) wystarczy na telefon
    this.hudTimers.set(p.connId, now);
    this.send(p.connId, hud);
  }

  sendFx(slot: number, fx: PadFx) {
    const p = this.padForSlot(slot);
    if (p) this.send(p.connId, { t: 'fx', fx });
  }

  start(preferredCode?: string) {
    if (this.running) return;
    this.running = true;
    this.signaling = signalingFromLocation();
    this.status = 'connecting';
    this.error = null;
    this.lastError = null;
    this.note = null;
    this.signal = 'connecting';
    this.attempts = 0;
    this.conflictRetries = 0;
    this.code = preferredCode || randomCode();
    this.lastPadChangeAt = Date.now();
    this.startProbe();
    this.startSweep();
    this.startRelay();
    this.emit();
    this.openPeer();
  }

  private openPeer() {
    const peer = new Peer(roomIdFromCode(this.code), buildPeerOptions(this.signaling));
    this.peer = peer;
    this.armRegisterTimeout(peer);

    peer.on('open', () => {
      if (this.peer !== peer) return;
      clearTimeout(this.registerTimer);
      this.registerTimer = 0;
      this.signal = 'online';
      this.status = 'ready';
      this.error = null;
      this.lastError = null;
      this.attempts = 0;
      this.conflictRetries = 0;
      this.emit();
    });

    peer.on('connection', (conn) => this.handleConn(conn));

    peer.on('disconnected', () => {
      if (this.peer !== peer || peer.destroyed) return;
      // Sygnalizacja padła (np. uśpienie komputera). Połączenia WebRTC z telefonami żyją dalej.
      this.signal = 'lost';
      this.emit();
      this.scheduleRetry('Utracono łączność z serwerem sygnalizacji.');
    });

    peer.on('error', (err) => {
      if (this.peer !== peer) return;
      this.handlePeerError(err);
    });
  }

  private armRegisterTimeout(peer: Peer) {
    clearTimeout(this.registerTimer);
    // Publiczny serwer potrafi „myśleć” kilkanaście sekund — im więcej prób, tym dłużej czekamy.
    const wait = Math.min(REGISTER_TIMEOUT + this.attempts * 5000, 35_000);
    this.registerTimer = window.setTimeout(() => {
      if (this.peer !== peer || peer.destroyed) return;
      this.scheduleRetry('Serwer sygnalizacji nie odpowiedział w czasie rejestracji pokoju.');
    }, wait);
  }

  private handlePeerError(err: unknown) {
    const type = (err as { type?: string }).type;
    if (type === 'peer-unavailable') return; // dotyczy tylko klientów, którzy nas szukali

    if (type === 'browser-incompatible') {
      this.running = false;
      this.status = 'error';
      this.signal = 'offline';
      this.error = 'Ta przeglądarka nie obsługuje WebRTC — tryb „telefon jako pad” nie zadziała.';
      this.emit();
      this.destroyPeer();
      return;
    }

    if (type === 'unavailable-id') {
      // Ten kod jest już zarejestrowany — najczęściej przez nasze własne, „martwe” połączenie.
      if (this.conflictRetries < MAX_CONFLICT_RETRIES) {
        this.conflictRetries++;
        this.scheduleRetry(`Kod ${this.code} jest chwilowo zajęty — próbuję ponownie.`, 2500);
        return;
      }
      // Po kilku próbach zmieniamy kod (QR odświeży się automatycznie).
      this.conflictRetries = 0;
      this.code = randomCode();
      this.note = 'Kod pokoju został odświeżony — na telefonach zeskanuj nowy QR.';
      // Temat przekaźnika zależy od kodu — przełączamy go razem z pokojem.
      this.startRelay();
      this.scheduleRetry('Kod pokoju był zajęty na serwerze.', 1200);
      return;
    }

    const permanent = type === 'invalid-id' || type === 'invalid-key';
    this.scheduleRetry(
      type === 'network' || type === 'server-error' || type === 'socket-error' || type === 'socket-closed' || type === 'ssl-unavailable'
        ? 'Brak łączności z serwerem sygnalizacji.'
        : `Błąd serwera sygnalizacji${type ? ` (${type})` : ''}.`,
      undefined,
      permanent,
    );
  }

  private scheduleRetry(reason: string, minDelay?: number, permanent = false) {
    if (!this.running) return;
    const peer = this.peer;
    this.attempts++;
    this.lastError = reason;
    this.signal = this.attempts === 1 ? 'connecting' : 'lost';
    if (this.attempts >= MAX_ATTEMPTS_BEFORE_NOTICE) {
      this.error = this.relay === 'online'
        ? 'Serwer sygnalizacji nie odpowiada — bezpośrednie łączenie z telefonami nie zadziała, ALE awaryjny przekaźnik jest aktywny: telefony będą łączyć się przez niego (Wi‑Fi ↔ LTE).'
        : 'Serwer sygnalizacji (broker) nie odpowiada — telefony nie zobaczą pokoju, dopóki połączenie nie wróci. Łącze też awaryjny przekaźnik… Ponawiam automatycznie co kilka sekund.';
    }
    this.emit();

    if (permanent) {
      this.running = false;
      this.status = 'error';
      this.signal = 'offline';
      this.error = reason;
      this.destroyPeer();
      this.emit();
      return;
    }

    const wait = minDelay ?? Math.min(1800 * Math.pow(2, Math.min(this.attempts, 3) - 1), 10_000);
    clearTimeout(this.retryTimer);
    this.retryTimer = window.setTimeout(() => {
      if (!this.running) return;
      const padsConnected = this.conns.size > 0;
      // Telefony grają? Nie zrywamy ich połączeń — wystarczy podnieść sygnalizację.
      if (peer && this.peer === peer && !peer.destroyed && padsConnected && peer.disconnected) {
        try {
          peer.reconnect();
          this.armRegisterTimeout(peer);
          return;
        } catch { /* nie da się wrócić na tym obiekcie — budujemy pokój od nowa */ }
      }
      this.destroyPeer();
      this.openPeer();
    }, wait);
  }

  private startProbe() {
    clearInterval(this.probeTimer);
    this.probeTimer = window.setInterval(() => this.checkRegistration(), PROBE_INTERVAL);
  }

  /**
 * Sprawdza, czy pokój nadal jest widoczny na serwerze sygnalizacji.
 * Zdarza się, że socket „umiera” po cichu (serwer pada, zmienia się sieć) i wtedy
 * komputer dalej pokazuje kod, którego żaden telefon nie znajdzie.
 */
  private checkRegistration() {
    if (!this.running || this.probing || this.status !== 'ready') return;
    if (Date.now() - this.lastPadChangeAt < 8000) return; // chwila po dołączeniu/odejściu telefonu
    this.probing = true;

    const roomId = roomIdFromCode(this.code);
    let probe: Peer | null = null;
    let timer = 0;

    const finish = (verdict: 'alive' | 'dead' | 'unknown') => {
      if (!probe) return;
      const peer = probe;
      probe = null;
      this.probing = false;
      clearTimeout(timer);
      try { peer.destroy(); } catch { /* ignore */ }
      if (verdict === 'dead' && this.running && this.status === 'ready') {
        this.lastError = 'Pokój zniknął z serwera sygnalizacji — odświeżam rejestrację.';
        this.signal = 'lost';
        this.emit();
        this.scheduleRetry('Pokój zniknął z serwera sygnalizacji.', 800);
      }
    };

    try {
      probe = new Peer(`sf-check-${randomTag()}`, buildPeerOptions(this.signaling));
    } catch {
      this.probing = false;
      return;
    }
    timer = window.setTimeout(() => finish('unknown'), 12_000);

    probe.on('open', () => {
      if (!probe) return;
      const conn = probe.connect(roomId, { reliable: true });
      conn.on('open', () => finish('alive'));
      conn.on('error', () => { /* czekamy na jednoznaczne peer-unavailable */ });
    });
    probe.on('error', (err) => {
      const type = (err as { type?: string }).type;
      if (type === 'peer-unavailable') finish('dead');
      else if (type === 'unavailable-id') finish('unknown');
    });
  }

  /* --------------------- awaryjny przekaźnik --------------------------- */

  /**
   * Przekaźnik jest aktywny cały czas, gdy pokój działa — niezależnie od tego,
   * czy serwer sygnalizacji odpowiada. Dzięki temu telefon łączy się przez niego
   * natychmiast, gdy tylko połączenie bezpośrednie nie przechodzi.
   */
  private startRelay() {
    this.stopRelay();
    if (!this.running) return;
    this.relay = 'connecting';
    this.relayCursor = 0;
    this.emit();
    this.tryRelayBroker();
  }

  private stopRelay() {
    this.relayToken++;
    clearTimeout(this.relayTimer);
    this.relayTimer = 0;
    const ch = this.relayChannel;
    this.relayChannel = null;
    this.relayLinks.clear();
    this.relay = 'off';
    ch?.close();
  }

  private tryRelayBroker() {
    if (!this.running) return;
    const token = ++this.relayToken;
    const url = RELAY_BROKERS[this.relayCursor % RELAY_BROKERS.length];
    const topic = relayTopicFor(this.code);
    RelayChannel.connect(url, topic, 12_000).then((channel) => {
      if (token !== this.relayToken || !this.running) { channel.close(); return; }
      this.bindRelayChannel(channel);
    }).catch(() => {
      if (token !== this.relayToken || !this.running) return;
      // Ten broker nie odpowiada — po chwili spróbujemy następnego.
      this.relayCursor = (this.relayCursor + 1) % RELAY_BROKERS.length;
      this.relayTimer = window.setTimeout(() => this.tryRelayBroker(), 5_000);
    });
  }

  private bindRelayChannel(channel: RelayChannel) {
    this.relayChannel = channel;
    this.relay = 'online';
    channel.onBatch((items) => this.onRelayBatch(items));
    channel.addCloseListener(() => this.onRelayChannelClosed());
    this.emit();
  }

  private onRelayBatch(items: RelayItem[]) {
    for (const it of items) {
      if (!it || typeof it.cid !== 'string' || !it.cid || it.cid.length > 64) continue;
      let link = this.relayLinks.get(it.cid);
      if (!link) {
        const channel = this.relayChannel;
        if (!channel) continue;
        const fresh = new HostRelayLink(channel, it.cid);
        fresh.onMessage((raw) => this.onMessage(fresh, raw as PadMessage));
        fresh.onClosed(() => this.dropConn(fresh.id));
        this.relayLinks.set(it.cid, fresh);
        this.conns.set(it.cid, fresh);
        link = fresh;
      }
      link.deliver(it.m);
    }
  }

  private onRelayChannelClosed() {
    const wasOnline = this.relayChannel !== null;
    this.relayChannel = null;
    // Wszystkie pady przez przekaźnik tracą łączność — zwalniają sloty.
    for (const cid of [...this.relayLinks.keys()]) this.dropConn(cid);
    this.relayLinks.clear();
    if (!this.running) {
      this.relay = 'off';
      return;
    }
    this.relay = 'connecting';
    if (wasOnline) this.lastError = 'Awaryjny przekaźnik rozłączony — łączę ponownie…';
    this.emit();
    this.relayCursor = (this.relayCursor + 1) % RELAY_BROKERS.length;
    this.relayTimer = window.setTimeout(() => this.tryRelayBroker(), 4_000);
  }

  /* ------------------- sprzątanie „starych” padów ---------------------- */

  /**
   * Telefon nieaktywny dłużej niż STALE_PAD_MS (nie ma input/ping) traktujemy
   * jako rozłączony — zwalnia slot, nawet jeśli gniazdo nie zgłosiło się o tym.
   */
  private startSweep() {
    clearInterval(this.sweepTimer);
    this.sweepTimer = window.setInterval(() => {
      if (!this.running) return;
      const now = Date.now();
      for (const p of [...this.pads.values()]) {
        if (now - p.lastSeen > STALE_PAD_MS) this.dropConn(p.connId);
      }
    }, 5_000);
  }

  /** Kasuje stan i próbuje jeszcze raz (np. po kliknięciu „Spróbuj ponownie”). */
  restart() {
    const code = this.code || undefined;
    this.stop();
    this.start(code);
  }

  stop() {
    this.running = false;
    clearTimeout(this.registerTimer);
    clearTimeout(this.retryTimer);
    clearInterval(this.probeTimer);
    clearInterval(this.sweepTimer);
    this.registerTimer = 0;
    this.retryTimer = 0;
    this.probeTimer = 0;
    this.sweepTimer = 0;
    this.probing = false;
    this.stopRelay();
    for (const c of this.conns.values()) { try { c.close(); } catch { /* ignore */ } }
    this.conns.clear();
    this.padsByPid.clear();
    this.pads.clear();
    this.inputs.forEach((_, i) => { this.inputs[i] = { ...ZERO_INPUT }; });
    this.destroyPeer();
    this.status = 'idle';
    this.signal = 'offline';
    this.attempts = 0;
    this.conflictRetries = 0;
    this.error = null;
    this.lastError = null;
    this.note = null;
    this.emit();
    this.onSlotsChanged?.(this.slots());
  }

  private destroyPeer() {
    const peer = this.peer;
    this.peer = null;
    if (!peer) return;
    try { peer.destroy(); } catch { /* ignore */ }
  }

  kick(connId: string) {
    const c = this.conns.get(connId);
    if (c) { this.send(connId, { t: 'rejected', reason: 'Odłączono przez hosta.' }); setTimeout(() => c.close(), 150); }
    this.dropConn(connId);
  }

  private handleConn(conn: DataConnection) {
    const link = new WebrtcLink(conn);
    link.onMessage((raw) => this.onMessage(link, raw as PadMessage));
    link.onClosed(() => this.dropConn(link.id));
    conn.on('open', () => {
      if (!this.conns.has(link.id)) this.conns.set(link.id, link);
    });
  }

  private freeSlot(): number {
    const taken = new Set([...this.pads.values()].map(p => p.slot));
    for (let i = 0; i < MAX_SLOTS; i++) if (!taken.has(i)) return i;
    return -1;
  }

  private onMessage(link: PadLink, msg: PadMessage) {
    if (!msg || typeof msg !== 'object') return;
    const id = link.id;
    switch (msg.t) {
      case 'hello': {
        if (msg.v !== PROTOCOL_VERSION) {
          this.send(id, { t: 'rejected', reason: 'Niezgodna wersja gry — odśwież stronę na telefonie.' });
          setTimeout(() => link.close(), 200);
          return;
        }
        if (this.pads.has(id)) return; // ten sam link się powtarza
        // Stały identyfikator telefonu: gdy ten sam telefon łączy się przez drugą
        // ścieżkę (P2P + przekaźnik na raz), pierwsza aktywna wygrywa —
        // nie zajmujemy dwóch slotów. Po rozłączeniu (lastSeen stale) nowa ścieżka przejmie slot.
        const pid = typeof msg.pid === 'string' && msg.pid ? msg.pid.slice(0, 64) : undefined;
        if (pid) {
          const prevId = this.padsByPid.get(pid);
          if (prevId && prevId !== id) {
            const prev = this.pads.get(prevId);
            if (prev) {
              if (Date.now() - prev.lastSeen < PAD_SWITCH_GRACE_MS) return; // pierwszy pad jest wciąż aktywny
              this.dropConn(prevId); // telefon wraca na nowej ścieżki — starą zamykamy
            } else {
              this.padsByPid.delete(pid);
            }
          }
        }
        const slot = this.freeSlot();
        if (slot < 0) {
          this.send(id, { t: 'rejected', reason: 'Wszystkie 4 miejsca są zajęte.' });
          setTimeout(() => link.close(), 200);
          return;
        }
        const nick = (msg.nick || '').trim().slice(0, 14) || `Telefon ${slot + 1}`;
        const info: PadInfo = { connId: id, slot, nick, connectedAt: Date.now(), lastSeen: Date.now(), latency: 0, via: link.kind, pid, steer: normSteer(msg.steer) };
        this.pads.set(id, info);
        if (pid) this.padsByPid.set(pid, id);
        this.inputs[slot] = { ...ZERO_INPUT };
        const meta = this.slotMeta[slot] ?? { name: `GRACZ ${slot + 1}`, color: '#fbbf24', darkColor: '#78350f' };
        this.send(id, { t: 'welcome', slot, ...meta, screen: this.screen });
        this.lastPadChangeAt = Date.now();
        this.emit();
        this.onSlotsChanged?.(this.slots());
        break;
      }
      case 'input': {
        const p = this.pads.get(id);
        if (!p) return;
        p.lastSeen = Date.now();
        const clamp = (v: unknown) => Math.max(-1, Math.min(1, Number(v) || 0));
        const steer = normSteer(msg.steer);
        if (steer) p.steer = steer;
        this.inputs[p.slot] = {
          fwd: clamp(msg.fwd),
          turn: clamp(msg.turn),
          fire: !!msg.fire,
          // Brak `steer` = starszy telefon: silnik użyje wtedy fwd/turn (klasyczne sterowanie).
          steer,
          dirX: clamp(msg.dirX),
          dirY: clamp(msg.dirY),
          aimX: clamp(msg.aimX),
          aimY: clamp(msg.aimY),
        };
        break;
      }
      case 'pause': {
        if (this.pads.has(id)) this.onPauseRequest?.();
        break;
      }
      case 'ping': {
        const p = this.pads.get(id);
        if (p) p.lastSeen = Date.now();
        this.send(id, { t: 'pong', at: msg.at });
        break;
      }
    }
  }

  private dropConn(connId: string) {
    const p = this.pads.get(connId);
    this.conns.delete(connId);
    this.relayLinks.delete(connId);
    this.hudTimers.delete(connId);
    if (p) {
      this.pads.delete(connId);
      if (p.pid) {
        const holder = this.padsByPid.get(p.pid);
        if (holder === connId) this.padsByPid.delete(p.pid);
      }
      this.inputs[p.slot] = { ...ZERO_INPUT };
      this.lastPadChangeAt = Date.now();
      this.emit();
      this.onSlotsChanged?.(this.slots());
    }
  }

  private send(connId: string, msg: HostMessage) {
    const c = this.conns.get(connId);
    if (c && c.open) { try { c.send(msg); } catch { /* ignore */ } }
  }
}

function randomTag(): string {
  const arr = new Uint32Array(1);
  crypto.getRandomValues(arr);
  return arr[0].toString(36);
}

export const padHost = new PadHost();
