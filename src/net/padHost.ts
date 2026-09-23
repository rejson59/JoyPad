import Peer, { type DataConnection } from 'peerjs';
import {
  PROTOCOL_VERSION, ZERO_INPUT, randomCode, roomIdFromCode,
  type HostMessage, type HostScreen, type PadFx, type PadInput, type PadMessage,
} from './protocol';
import { buildPeerOptions, signalingFromLocation, type SignalingConfig } from './signaling';

export interface PadInfo {
  connId: string;
  slot: number;
  nick: string;
  connectedAt: number;
  lastSeen: number;
  latency: number;
}

export interface SlotMeta { name: string; color: string; darkColor: string }

export type HostStatus = 'idle' | 'connecting' | 'ready' | 'error';

/** Łączność z serwerem sygnalizacji (brokerem). */
export type SignalState = 'offline' | 'connecting' | 'online' | 'lost';

export interface PadHostState {
  status: HostStatus;
  code: string;
  error: string | null;
  pads: PadInfo[];
  signal: SignalState;
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

/**
 * Host (komputer): tworzy pokój w sieci PeerJS i przyjmuje telefony-pady.
 * Każdy telefon dostaje wolny slot gracza (0..3). Wejście z telefonu
 * przechowywane jest w `inputs` i czytane przez silnik gry co klatkę.
 *
 * Rejestracja w serwerze sygnalizacji jest ponawiana automatycznie i po cichu —
 * kod pokoju (QR) zostaje ten sam, więc gracze nie muszą nic robić.
 */
export class PadHost {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private pads = new Map<string, PadInfo>();
  private listeners = new Set<Listener>();
  private slotMeta: SlotMeta[] = [];
  private screen: HostScreen = 'menu';
  private hudTimers = new Map<string, number>();

  private registerTimer = 0;
  private retryTimer = 0;
  private probeTimer = 0;
  private probing = false;
  private lastPadChangeAt = 0;
  private attempts = 0;
  private conflictRetries = 0;
  private running = false;
  private signaling: SignalingConfig = signalingFromLocation();

  status: HostStatus = 'idle';
  code = '';
  error: string | null = null;
  signal: SignalState = 'offline';
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
    if (now - last < 120) return; // ~8 Hz wystarczy na telefon
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
      this.error = 'Serwer sygnalizacji (broker) nie odpowiada — telefony nie zobaczą pokoju, dopóki połączenie nie wróci. Ponawiam automatycznie co kilka sekund.';
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
    this.registerTimer = 0;
    this.retryTimer = 0;
    this.probeTimer = 0;
    this.probing = false;
    for (const c of this.conns.values()) { try { c.close(); } catch { /* ignore */ } }
    this.conns.clear();
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
    conn.on('open', () => {
      this.conns.set(conn.peer, conn);
    });
    conn.on('data', (raw) => this.onMessage(conn, raw as PadMessage));
    conn.on('close', () => this.dropConn(conn.peer));
    conn.on('error', () => this.dropConn(conn.peer));
  }

  private freeSlot(): number {
    const taken = new Set([...this.pads.values()].map(p => p.slot));
    for (let i = 0; i < MAX_SLOTS; i++) if (!taken.has(i)) return i;
    return -1;
  }

  private onMessage(conn: DataConnection, msg: PadMessage) {
    if (!msg || typeof msg !== 'object') return;
    const id = conn.peer;
    switch (msg.t) {
      case 'hello': {
        if (msg.v !== PROTOCOL_VERSION) {
          this.send(id, { t: 'rejected', reason: 'Niezgodna wersja gry — odśwież stronę na telefonie.' });
          setTimeout(() => conn.close(), 200);
          return;
        }
        if (this.pads.has(id)) return;
        const slot = this.freeSlot();
        if (slot < 0) {
          this.send(id, { t: 'rejected', reason: 'Wszystkie 4 miejsca są zajęte.' });
          setTimeout(() => conn.close(), 200);
          return;
        }
        const nick = (msg.nick || '').trim().slice(0, 14) || `Telefon ${slot + 1}`;
        const info: PadInfo = { connId: id, slot, nick, connectedAt: Date.now(), lastSeen: Date.now(), latency: 0 };
        this.pads.set(id, info);
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
        this.inputs[p.slot] = { fwd: clamp(msg.fwd), turn: clamp(msg.turn), fire: !!msg.fire };
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
    this.hudTimers.delete(connId);
    if (p) {
      this.pads.delete(connId);
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
