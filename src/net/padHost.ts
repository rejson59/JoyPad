import Peer, { type DataConnection } from 'peerjs';
import {
  ICE_SERVERS, PROTOCOL_VERSION, ZERO_INPUT, randomCode, roomIdFromCode,
  type HostMessage, type HostScreen, type PadFx, type PadInput, type PadMessage,
} from './protocol';

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

export interface PadHostState {
  status: HostStatus;
  code: string;
  error: string | null;
  pads: PadInfo[];
}

type Listener = (s: PadHostState) => void;

const MAX_SLOTS = 4;

/**
 * Host (komputer): tworzy pokój w sieci PeerJS i przyjmuje telefony-pady.
 * Każdy telefon dostaje wolny slot gracza (0..3). Wejście z telefonu
 * przechowywane jest w `inputs` i czytane przez silnik gry co klatkę.
 */
export class PadHost {
  private peer: Peer | null = null;
  private conns = new Map<string, DataConnection>();
  private pads = new Map<string, PadInfo>();
  private listeners = new Set<Listener>();
  private slotMeta: SlotMeta[] = [];
  private screen: HostScreen = 'menu';
  private hudTimers = new Map<string, number>();

  status: HostStatus = 'idle';
  code = '';
  error: string | null = null;

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
    return { status: this.status, code: this.code, error: this.error, pads: [...this.pads.values()].sort((a, b) => a.slot - b.slot) };
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
    if (this.peer) return;
    this.status = 'connecting';
    this.error = null;
    this.code = preferredCode || randomCode();
    this.emit();
    this.openPeer(0);
  }

  private openPeer(attempt: number) {
    const peer = new Peer(roomIdFromCode(this.code), { debug: 0, config: { iceServers: ICE_SERVERS } });
    this.peer = peer;
    peer.on('open', () => {
      this.status = 'ready';
      this.error = null;
      this.emit();
    });
    peer.on('connection', (conn) => this.handleConn(conn));
    peer.on('disconnected', () => {
      // Sygnalizacja padła (np. uśpienie) — spróbuj wrócić, istniejące połączenia WebRTC dalej żyją.
      if (this.peer === peer && !peer.destroyed) {
        setTimeout(() => { if (this.peer === peer && !peer.destroyed) peer.reconnect(); }, 1000);
      }
    });
    peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      if (type === 'unavailable-id' && attempt < 3) {
        peer.destroy();
        this.code = randomCode();
        this.emit();
        this.openPeer(attempt + 1);
        return;
      }
      if (type === 'peer-unavailable') return; // nie dotyczy hosta
      this.status = 'error';
      this.error = type === 'network' || type === 'server-error'
        ? 'Brak połączenia z serwerem sygnalizacji. Sprawdź internet i spróbuj ponownie.'
        : type === 'browser-incompatible'
          ? 'Ta przeglądarka nie obsługuje WebRTC.'
          : `Błąd sieci: ${type ?? err.message}`;
      this.emit();
    });
  }

  restart() {
    this.stop();
    this.start();
  }

  stop() {
    for (const c of this.conns.values()) { try { c.close(); } catch { /* ignore */ } }
    this.conns.clear();
    this.pads.clear();
    this.inputs.forEach((_, i) => { this.inputs[i] = { ...ZERO_INPUT }; });
    this.peer?.destroy();
    this.peer = null;
    this.status = 'idle';
    this.emit();
    this.onSlotsChanged?.(this.slots());
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
      this.emit();
      this.onSlotsChanged?.(this.slots());
    }
  }

  private send(connId: string, msg: HostMessage) {
    const c = this.conns.get(connId);
    if (c && c.open) { try { c.send(msg); } catch { /* ignore */ } }
  }
}

export const padHost = new PadHost();
