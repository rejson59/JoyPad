import Peer, { type DataConnection } from 'peerjs';
import {
  PROTOCOL_VERSION, roomIdFromCode, type HostMessage, type HostScreen, type PadFx, type PadInput,
} from './protocol';
import { buildPeerOptions, signalingFromLocation, type SignalingConfig } from './signaling';

export type PadStatus = 'idle' | 'connecting' | 'connected' | 'rejected' | 'lost' | 'error';

/** Na czym utknęło łączenie — pokazywane na ekranie telefonu. */
export type PadPhase = 'idle' | 'signal' | 'link' | 'handshake';

export interface PadHud {
  hp: number; maxHp: number; alive: boolean; kills: number; deaths: number; lives: number;
  respawn: number; countdown: number; paused: boolean; timeLeft: number;
  shield: boolean; rapid: boolean; big: boolean; speed: boolean; mode: 'deathmatch' | 'survival';
}

export interface PadClientState {
  status: PadStatus;
  code: string;
  error: string | null;
  /** Co się dzieje w tej chwili (tekst dla gracza). */
  progress: string;
  phase: PadPhase;
  attempt: number;
  maxAttempts: number;
  /** Czas trwania bieżącej próby łączenia w sekundach. */
  elapsed: number;
  /** Ostatni problem techniczny (diagnostyka). */
  lastFailure: string | null;
  /** Nazwa używanego serwera sygnalizacji. */
  signaling: string;
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

/* --- Cierpliwość to podstawa: publiczny serwer sygnalizacji bywa wolny --- */
const SIGNAL_TIMEOUT = 25_000;  // czekanie aż serwer zarejestruje telefon (rośnie z każdą próbą do 35 s)
const SIGNAL_TIMEOUT_MAX = 35_000;
const LINK_TIMEOUT = 20_000;    // negocjacja połączenia P2P z komputerem
const WELCOME_TIMEOUT = 7_000;  // komputer milczy po zgłoszeniu się
const MAX_ATTEMPTS = 3;
const ROOM_RETRIES = 2;         // dodatkowe szybkie próby, gdy pokój „jeszcze się nie pojawił”
const RECONNECT_ATTEMPTS = 3;

const delayFor = (attempt: number) => Math.min(1200 + attempt * 1800, 6000);

/**
 * Klient (telefon): łączy się z hostem po kodzie pokoju i wysyła stan joysticka.
 *
 * Łączenie jest wieloetapowe (serwer sygnalizacji → pokój → WebRTC), więc każdy
 * etap ma własny limit czasu i własne ponowienia — zamiast pojedynczej, krótkiej
 * próby, która przy wolniejszym serwerze zawsze kończyła się komunikatem o przekroczonym czasie.
 */
export class PadClient {
  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private listeners = new Set<Listener>();
  private sendTimer = 0;
  private pingTimer = 0;
  private attemptTimer = 0;
  private retryTimer = 0;
  private tickTimer = 0;
  private lastSent: PadInput = { fwd: 0, turn: 0, fire: false };
  private pending: PadInput = { fwd: 0, turn: 0, fire: false };
  private lastSendAt = 0;

  private signaling: SignalingConfig = signalingFromLocation();
  private code = '';
  private nick = '';
  /** Trwa sesja łączenia (także automatyczne ponowienia). */
  private active = false;
  private attempt = 0;
  private maxAttempts = MAX_ATTEMPTS;
  private roomRetries = 0;
  private attemptStartedAt = 0;

  state: PadClientState = {
    status: 'idle', code: '', error: null, progress: '', phase: 'idle',
    attempt: 0, maxAttempts: MAX_ATTEMPTS, elapsed: 0, lastFailure: null,
    signaling: this.signaling.label,
    slot: -1, name: '', color: '#fbbf24', darkColor: '#78350f',
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

  /* ----------------------------- łączenie ----------------------------- */

  connect(code: string, nick: string) {
    this.teardown();
    this.code = code;
    this.nick = nick;
    this.signaling = signalingFromLocation();
    this.active = true;
    this.attempt = 0;
    this.maxAttempts = MAX_ATTEMPTS;
    this.roomRetries = 0;
    this.set({
      status: 'connecting', code, error: null, result: null, hud: null, slot: -1,
      phase: 'signal', attempt: 1, maxAttempts: this.maxAttempts, elapsed: 0,
      lastFailure: null, signaling: this.signaling.label,
      progress: 'Łączę z serwerem sygnalizacji…',
    });
    this.attemptStartedAt = performance.now();
    this.startTicker();
    this.beginAttempt();
  }

  private beginAttempt() {
    if (!this.active || !this.code) return;
    this.cleanupAttempt();
    this.attempt++;
    this.attemptStartedAt = performance.now();
    const via = this.signaling.host ? ` (${this.signaling.label})` : '';
    this.set({
      phase: 'signal',
      attempt: this.attempt,
      elapsed: 0,
      progress: this.attempt === 1
        ? `Łączę z serwerem sygnalizacji${via}…`
        : `Próba ${this.attempt}/${this.maxAttempts} — łączę z serwerem sygnalizacji${via}…`,
    });

    let peer: Peer;
    try {
      peer = new Peer(buildPeerOptions(this.signaling));
    } catch (err) {
      this.failAttempt(`Nie udało się uruchomić WebRTC: ${describeError(err)}`, true);
      return;
    }
    this.peer = peer;

    peer.on('open', () => {
      if (this.peer !== peer || !this.active) return;
      this.set({ phase: 'link', progress: 'Szukam komputera o tym kodzie…' });
      const conn = peer.connect(roomIdFromCode(this.code), {
        reliable: true, serialization: 'json', metadata: { nick: this.nick },
      });
      this.conn = conn;
      conn.on('open', () => { if (this.conn === conn) this.onConnected(conn); });
      conn.on('data', (raw) => { if (this.conn === conn) this.onMessage(raw as HostMessage); });
      conn.on('close', () => { if (this.conn === conn) this.onConnectionClosed(conn); });
      conn.on('error', (err) => {
        if (this.conn !== conn) return;
        const type = (err as { type?: string }).type;
        this.failAttempt(`Błąd połączenia z komputerem (${type ?? 'nieznany'}).`, false);
      });
      this.armTimeout(LINK_TIMEOUT, () => this.failAttempt(
        'Komputer nie odpowiedział w czasie negocjacji P2P.', false,
      ));
    });

    peer.on('disconnected', () => {
      // Serwer sygnalizacji zerwał socket, ale połączenie P2P z komputerem może dalej żyć.
      if (this.peer === peer && !peer.destroyed && this.state.status !== 'connected') {
        try { peer.reconnect(); } catch { /* ignore */ }
      }
    });

    peer.on('error', (err) => { if (this.peer === peer) this.onPeerError(err); });

    this.armTimeout(Math.min(SIGNAL_TIMEOUT + (this.attempt - 1) * 5000, SIGNAL_TIMEOUT_MAX), () => this.failAttempt(
      'Serwer sygnalizacji nie odpowiedział (rejestracja telefonu).', false,
    ));
  }

  private onConnected(conn: DataConnection) {
    if (!this.active) { try { conn.close(); } catch { /* ignore */ } return; }
    this.clearAttemptTimers();
    this.attemptStartedAt = performance.now();
    this.set({ phase: 'handshake', progress: 'Witam się z komputerem…' });
    conn.send({ t: 'hello', nick: this.nick, ua: navigator.userAgent.slice(0, 80), v: PROTOCOL_VERSION });
    this.pingTimer = window.setInterval(() => { if (conn.open) conn.send({ t: 'ping', at: performance.now() }); }, 2000);
    this.sendTimer = window.setInterval(() => this.flush(), 1000 / 30);
    // Komputer zawsze odpowiada `welcome` albo `rejected` — jeśli milczy, coś jest nie tak.
    this.armTimeout(WELCOME_TIMEOUT, () => this.failAttempt('Komputer nie przydzielił miejsca dla tego telefonu.', false));
  }

  private onConnectionClosed(conn: DataConnection) {
    if (this.conn !== conn) return;
    this.conn = null;
    this.stopStreams();
    if (this.state.status === 'connected') {
      // Zerwane po starcie gry — próbujemy wrócić automatycznie.
      this.set({
        status: 'lost', hud: null,
        error: 'Utracono połączenie z komputerem — próbuję połączyć ponownie…',
        progress: 'Łączę ponownie…', phase: 'signal', attempt: 0, maxAttempts: RECONNECT_ATTEMPTS,
      });
      this.attempt = 0;
      this.maxAttempts = RECONNECT_ATTEMPTS;
      this.active = true;
      this.attemptStartedAt = performance.now();
      this.startTicker();
      this.retryTimer = window.setTimeout(() => { if (this.active) this.beginAttempt(); }, 1200);
      return;
    }
    if (this.active) this.failAttempt('Komputer zamknął połączenie.', false);
  }

  /** Nieudana próba: albo ponawiamy (z rosnącym opóźnieniem), albo pokazujemy błąd. */
  private failAttempt(reason: string, permanent: boolean) {
    if (!this.active) return;
    this.cleanupAttempt();

    if (permanent) { this.abortWithError(reason); return; }

    if (this.attempt < this.maxAttempts) {
      const wait = delayFor(this.attempt);
      this.set({
        phase: 'signal',
        lastFailure: reason,
        progress: `${reason} Ponawiam za ${Math.round(wait / 1000)} s (próba ${this.attempt + 1}/${this.maxAttempts})…`,
      });
      this.retryTimer = window.setTimeout(() => { if (this.active) this.beginAttempt(); }, wait);
      return;
    }
    this.abortWithError(reason);
  }

  private abortWithError(reason: string) {
    const seconds = Math.round((performance.now() - this.attemptStartedAt) / 1000);
    const attempts = this.attempt;
    this.active = false;
    this.teardown();
    this.set({
      status: 'error',
      phase: 'idle',
      lastFailure: reason,
      progress: '',
      error: `Nie udało się połączyć z komputerem (${attempts} ${attempts === 1 ? 'próba' : 'próby'}${seconds > 0 ? `, ${seconds} s` : ''}).\n${reason}\n\nSprawdź kod na ekranie komputera i upewnij się, że oba urządzenia mają internet — najpewniej działa ta sama sieć Wi‑Fi. Szczegóły możesz sprawdzić przyciskiem „Sprawdź połączenie”.`,
    });
  }

  private onPeerError(err: unknown) {
    const type = (err as { type?: string; message?: string }).type;
    switch (type) {
      case 'peer-unavailable':
        if (this.roomRetries < ROOM_RETRIES) {
          this.roomRetries++;
          this.failAttempt('Komputer nie jest jeszcze widoczny na serwerze.', false);
        } else {
          this.active = false;
          this.teardown();
          this.set({
            status: 'error', phase: 'idle', progress: '', lastFailure: 'peer-unavailable',
            error: 'Nie znalazłem pokoju o tym kodzie.\nNajczęściej kod jest nieaktualny — pokój zmienia się po odświeżeniu strony komputera. Zeskanuj QR jeszcze raz albo przepisz kod z ekranu komputera.',
          });
        }
        return;
      case 'browser-incompatible':
        this.active = false;
        this.teardown();
        this.set({ status: 'error', phase: 'idle', progress: '', lastFailure: 'browser-incompatible', error: 'Ta przeglądarka nie obsługuje WebRTC. Użyj Chrome, Safari albo Firefoksa.' });
        return;
      case 'invalid-id':
      case 'invalid-key':
        this.active = false;
        this.teardown();
        this.set({ status: 'error', phase: 'idle', progress: '', lastFailure: `serwer: ${type}`, error: `Serwer sygnalizacji odrzucił połączenie (${type}). Sprawdź adres serwera w „Sprawdź połączenie”.` });
        return;
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
      case 'ssl-unavailable':
      case 'disconnected': {
        if (this.state.status === 'connected') {
          // Grubsza sprawa: połączenie P2P z komputerem żyje, więc brak brokera nic nie psuje.
          // Próbujemy tylko cichaczem przywrócić sygnalizację.
          const peer = this.peer;
          if (peer && !peer.destroyed && peer.disconnected) {
            try { peer.reconnect(); } catch { /* ignore */ }
          }
          this.set({ lastFailure: 'Chwilowy brak łączności z serwerem sygnalizacji (gra działa dalej).' });
          return;
        }
        const label = type === 'ssl-unavailable'
          ? 'Serwer sygnalizacji nie obsługuje szyfrowanego połączenia.'
          : 'Brak łączności z serwerem sygnalizacji.';
        this.failAttempt(label, false);
        return;
      }
      default:
        this.failAttempt(`Błąd połączenia: ${type ?? describeError(err)}.`, false);
    }
  }

  disconnect(silent = false) {
    this.active = false;
    this.teardown();
    if (!silent) this.set({ status: 'idle', hud: null, slot: -1, error: null, progress: '', phase: 'idle', attempt: 0, elapsed: 0, lastFailure: null });
  }

  /* --------------------------- sprzątanie ---------------------------- */

  /** Zamyka wszystko, co dotyczy bieżącej sesji (ale zostawia stan dla UI). */
  private teardown() {
    this.clearAttemptTimers();
    this.stopStreams();
    clearInterval(this.tickTimer);
    this.tickTimer = 0;
    this.destroyConn();
    this.destroyPeer();
  }

  /** Kończy tylko bieżącą próbę łączenia. */
  private cleanupAttempt() {
    this.clearAttemptTimers();
    this.stopStreams();
    this.destroyConn();
    this.destroyPeer();
  }

  private clearAttemptTimers() {
    clearTimeout(this.attemptTimer);
    clearTimeout(this.retryTimer);
    this.attemptTimer = 0;
    this.retryTimer = 0;
  }

  private stopStreams() {
    clearInterval(this.sendTimer);
    clearInterval(this.pingTimer);
    this.sendTimer = 0;
    this.pingTimer = 0;
  }

  private destroyConn() {
    const conn = this.conn;
    this.conn = null;
    if (!conn) return;
    // Uwaga: nie czyścimy listenerów — PeerJS ma tam swoje (np. wysyłkę zbuforowaną).
    // Zamiast tego każdy handler sprawdza, czy to nadal bieżące połączenie.
    try { conn.close(); } catch { /* ignore */ }
  }

  private destroyPeer() {
    const peer = this.peer;
    this.peer = null;
    if (!peer) return;
    try { peer.destroy(); } catch { /* ignore */ }
  }

  private armTimeout(ms: number, onTimeout: () => void) {
    clearTimeout(this.attemptTimer);
    this.attemptTimer = window.setTimeout(onTimeout, ms);
  }

  private startTicker() {
    clearInterval(this.tickTimer);
    this.tickTimer = window.setInterval(() => {
      if (!this.active || this.state.status === 'connected') return;
      this.set({ elapsed: Math.round((performance.now() - this.attemptStartedAt) / 1000) });
    }, 1000);
  }

  /* ---------------------------- wejście ------------------------------ */

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
        this.active = false;
        this.clearAttemptTimers();
        this.set({
          status: 'connected', slot: msg.slot, name: msg.name, color: msg.color, darkColor: msg.darkColor,
          screen: msg.screen, error: null, progress: '', phase: 'idle', elapsed: 0, lastFailure: null,
        });
        break;
      case 'rejected':
        this.active = false;
        this.teardown();
        this.set({ status: 'rejected', error: msg.reason, progress: '', phase: 'idle', lastFailure: 'rejected' });
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

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'nieznany błąd';
}

export const padClient = new PadClient();
