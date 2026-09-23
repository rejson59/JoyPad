import type { DataConnection } from 'peerjs';

/**
 * Pojedyncze połączenie z padem — niezależnie od tego, czy leci przez
 * WebRTC (bezpośrednio / TURN) czy przez awaryjny przekaźnik (broker MQTT).
 * Logika gry (host i telefon) nie zna transportu, tylko ten interfejs.
 */
export interface PadLink {
  readonly kind: 'webrtc' | 'relay';
  /** Stabilny identyfikator pada (id PeerJS albo `cid` telefonu na przekaźniku). */
  readonly id: string;
  readonly open: boolean;
  send(msg: unknown): void;
  /** Ustawia (lub odwołuje) handler przychodzących wiadomości. */
  onMessage(cb: ((msg: unknown) => void) | null): void;
  /** Wywoływane dokładnie raz, gdy link ginie. */
  onClosed(cb: (() => void) | null): void;
  close(): void;
}

/** Wrapper wokół DataConnection PeerJS — most między starym kodem a `PadLink`. */
export class WebrtcLink implements PadLink {
  readonly kind = 'webrtc' as const;
  readonly id: string;
  private readonly conn: DataConnection;
  private msgCb: ((msg: unknown) => void) | null = null;
  private closedCb: (() => void) | null = null;
  private closedFired = false;

  constructor(conn: DataConnection) {
    this.conn = conn;
    this.id = conn.peer;
    conn.on('data', (raw) => { this.msgCb?.(raw); });
    conn.on('close', () => this.fireClosed());
    conn.on('error', () => this.fireClosed());
  }

  private fireClosed(): void {
    if (this.closedFired) return;
    this.closedFired = true;
    this.closedCb?.();
  }

  get open(): boolean {
    return this.conn.open;
  }

  send(msg: unknown): void {
    if (!this.conn.open) return;
    try { this.conn.send(msg); } catch { /* ignore */ }
  }

  onMessage(cb: ((msg: unknown) => void) | null): void {
    this.msgCb = cb;
  }

  onClosed(cb: (() => void) | null): void {
    this.closedCb = cb;
  }

  close(): void {
    this.fireClosed();
    try { this.conn.close(); } catch { /* ignore */ }
  }
}
