import Peer, { type DataConnection } from 'peerjs';
import {
  ICE_SERVERS, PROTOCOL_VERSION, roomIdFromCode,
  type HostMessage, type HostScreen, type PadFx, type PadInput,
} from './protocol';

export type PadStatus = 'idle' | 'connecting' | 'connected' | 'rejected' | 'lost' | 'error';

export interface PadHud {
  hp: number; maxHp: number; alive: boolean; kills: number; deaths: number; lives: number;
  respawn: number; countdown: number; paused: boolean; timeLeft: number;
  shield: boolean; rapid: boolean; big: boolean; speed: boolean; mode: 'deathmatch' | 'survival';
}

export interface PadClientState {
  status: PadStatus;
  code: string;
  error: string | null;
  slot: number;
  name: string;
  color: string;
  darkColor: string;
  screen: HostScreen;
  hud: PadHud | null;
  latency: number;
  result: { winnerName?: string; winnerColor?: string; youWon?: boolean } | null;
}

type Listener = (s: PadClientState) => void;

/**
 * Klient (telefon): łączy się z hostem po kodzie pokoju i wysyła stan joysticka.
 */
export class PadClient {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private listeners = new Set<Listener>();
  private sendTimer = 0;
  private pingTimer = 0;
  private lastSent: PadInput = { fwd: 0, turn: 0, fire: false };
  private pending: PadInput = { fwd: 0, turn: 0, fire: false };
  private lastSendAt = 0;
  private connectTimeout = 0;

  state: PadClientState = {
    status: 'idle', code: '', error: null, slot: -1, name: '', color: '#fbbf24', darkColor: '#78350f',
    screen: 'menu', hud: null, latency: 0, result: null,
  };

  onFx: ((fx: PadFx) => void) | null = null;

  subscribe(fn: Listener) {
    this.listeners.add(fn);
    fn(this.state);
    return () => { this.listeners.delete(fn); };
  }

  private set(patch: Partial<PadClientState>) {
    this.state = { ...this.state, ...patch };
    this.listeners.forEach(l => l(this.state));
  }

  connect(code: string, nick: string) {
    this.disconnect(true);
    this.set({ status: 'connecting', code, error: null, result: null });
    const peer = new Peer({ debug: 0, config: { iceServers: ICE_SERVERS } });
    this.peer = peer;
    peer.on('open', () => {
      const conn = peer.connect(roomIdFromCode(code), { reliable: true, serialization: 'json', metadata: { nick } });
      this.conn = conn;
      conn.on('open', () => {
        clearTimeout(this.connectTimeout);
        conn.send({ t: 'hello', nick, ua: navigator.userAgent.slice(0, 80), v: PROTOCOL_VERSION });
        this.pingTimer = window.setInterval(() => { if (conn.open) conn.send({ t: 'ping', at: performance.now() }); }, 2000);
        this.sendTimer = window.setInterval(() => this.flush(), 1000 / 30);
      });
      conn.on('data', (raw) => this.onMessage(raw as HostMessage));
      conn.on('close', () => { if (this.state.status === 'connected' || this.state.status === 'connecting') this.set({ status: 'lost' }); this.cleanupTimers(); });
      conn.on('error', () => { this.set({ status: 'error', error: 'Błąd połączenia z komputerem.' }); this.cleanupTimers(); });
    });
    peer.on('error', (err) => {
      const type = (err as { type?: string }).type;
      clearTimeout(this.connectTimeout);
      if (type === 'peer-unavailable') {
        this.set({ status: 'error', error: 'Nie znaleziono pokoju o tym kodzie. Sprawdź kod na ekranie komputera.' });
      } else if (type === 'network' || type === 'server-error') {
        this.set({ status: 'error', error: 'Brak połączenia z serwerem. Sprawdź internet w telefonie.' });
      } else if (type === 'browser-incompatible') {
        this.set({ status: 'error', error: 'Ta przeglądarka nie obsługuje WebRTC. Użyj Chrome lub Safari.' });
      } else {
        this.set({ status: 'error', error: `Błąd: ${type ?? err.message}` });
      }
      this.cleanupTimers();
    });
    this.connectTimeout = window.setTimeout(() => {
      if (this.state.status === 'connecting') {
        this.set({ status: 'error', error: 'Przekroczono czas łączenia. Upewnij się, że komputer i telefon mają internet (może być inna sieć), i spróbuj ponownie.' });
        this.disconnect(true);
      }
    }, 15000);
  }

  disconnect(silent = false) {
    clearTimeout(this.connectTimeout);
    this.cleanupTimers();
    try { this.conn?.close(); } catch { /* ignore */ }
    this.conn = null;
    this.peer?.destroy();
    this.peer = null;
    if (!silent) this.set({ status: 'idle', hud: null, slot: -1 });
  }

  private cleanupTimers() {
    clearInterval(this.sendTimer);
    clearInterval(this.pingTimer);
    this.sendTimer = 0; this.pingTimer = 0;
  }

  /** Ustaw aktualne wejście — wysyłka jest zbuforowana do ~30 Hz. */
  setInput(inp: Partial<PadInput>) {
    this.pending = { ...this.pending, ...inp };
  }

  requestPause() {
    if (this.conn?.open) this.conn.send({ t: 'pause' });
  }

  private flush() {
    if (!this.conn?.open) return;
    const p = this.pending, l = this.lastSent;
    const now = performance.now();
    const changed = Math.abs(p.fwd - l.fwd) > 0.01 || Math.abs(p.turn - l.turn) > 0.01 || p.fire !== l.fire;
    if (!changed && now - this.lastSendAt < 250) return; // heartbeat co 250 ms
    this.lastSent = { ...p };
    this.lastSendAt = now;
    this.conn.send({ t: 'input', fwd: +p.fwd.toFixed(2), turn: +p.turn.toFixed(2), fire: p.fire });
  }

  private onMessage(msg: HostMessage) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        this.set({ status: 'connected', slot: msg.slot, name: msg.name, color: msg.color, darkColor: msg.darkColor, screen: msg.screen, error: null });
        break;
      case 'rejected':
        this.set({ status: 'rejected', error: msg.reason });
        break;
      case 'slot':
        this.set({ slot: msg.slot, name: msg.name, color: msg.color, darkColor: msg.darkColor });
        break;
      case 'screen':
        this.set({
          screen: msg.screen,
          hud: msg.screen === 'game' ? this.state.hud : null,
          result: msg.screen === 'over' ? { winnerName: msg.winnerName, winnerColor: msg.winnerColor, youWon: msg.youWon } : null,
        });
        break;
      case 'hud': {
        const { t: _t, ...hud } = msg; void _t;
        this.set({ hud, screen: 'game' });
        break;
      }
      case 'fx':
        this.onFx?.(msg.fx);
        break;
      case 'pong':
        this.set({ latency: Math.round(performance.now() - msg.at) });
        break;
    }
  }
}

export const padClient = new PadClient();
