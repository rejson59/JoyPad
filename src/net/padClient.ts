import Peer, { type DataConnection } from 'peerjs';
import {
  DEFAULT_PAD_STEER, PROTOCOL_VERSION, roomIdFromCode,
  type ArcadeHud, type HostMessage, type HostScreen, type PadFx, type PadInput,
  type PadSteer, type RemoteCommand, type SessionOptions,
} from './protocol';
import { buildPeerOptions, signalingFromLocation, type SignalingConfig } from './signaling';
import { WebrtcLink, type PadLink } from './links';
import { ClientRelayLink, RELAY_BROKERS, RelayChannel, newRelaySessionId, relayTopicFor } from './relay';
import type { GameId } from '../arcade/catalog';

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
  game: GameId | null;
  adminSlot: number | null;
  selection: number;
  roster: { slot: number; nick: string }[];
  options?: SessionOptions;
  hud: PadHud | null;
  arcadeHud: ArcadeHud | null;
  latency: number;
  result: { winnerName?: string; winnerColor?: string; youWon?: boolean } | null;
  /** Aktywne połączenie leci przez awaryjny przekaźnik (nie przez WebRTC). */
  viaRelay: boolean;
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

/* --- Awaryjny przekaźnik --- */
const RELAY_BROKER_TIMEOUT = 8_000;   // limit na połączenie z jednym brokerem
const RELAY_WELCOME_TIMEOUT = 8_000;  // komputer milczy po hello na przekaźniku
/** Brak jakiegokolwiek sygnału od komputera (ping co 2 s) => utrata połączenia. */
const LIVENESS_TIMEOUT = 6_000;

const LS_PAD_PID = 'sf_pad_pid';
const LS_PAD_STEER = 'sf_pad_steer';

/** Zapamiętany na telefonie tryb sterowania (domyślnie: jedziesz tam, gdzie pchasz). */
function readSteerMode(): PadSteer {
  try {
    return localStorage.getItem(LS_PAD_STEER) === 'tank' ? 'tank' : DEFAULT_PAD_STEER;
  } catch {
    return DEFAULT_PAD_STEER;
  }
}

const delayFor = (attempt: number) => Math.min(1200 + attempt * 1800, 6000);

type RelayOutcome = 'won' | 'closed' | 'timeout' | 'rejected';

/**
 * Klient (telefon): łączy się z hostem po kodzie pokoju i wysyła stan joysticka.
 *
 * Łączenie jest wieloetapowe (serwer sygnalizacji → pokój → WebRTC), więc każdy
 * etap ma własny limit czasu i własne ponowienia. RÓWNOLEGLE z próbami P2P
 * telefon łączy się z awaryjnym przekaźnikiem (broker MQTT) — którykolwiek
 * transport dostarczy `welcome` wygrywa. Dzięki temu połączenie przechodzi
 * „zawsze i wszędzie”, nawet gdy sieć blokuje WebRTC (np. LTE za CGNAT).
 */
export class PadClient {
  private peer: Peer | null = null;
  /** Bieżące połączenie P2P (WebRTC). */
  private p2pLink: WebrtcLink | null = null;
  /** Zwycięski transport — aktywny kanał do gry. */
  private conn: PadLink | null = null;
  private listeners = new Set<Listener>();
  private sendTimer = 0;
  private pingTimer = 0;
  private livenessTimer = 0;
  private attemptTimer = 0;
  private helloTimer = 0;
  private retryTimer = 0;
  private tickTimer = 0;
  private lastSent: PadInput = { fwd: 0, turn: 0, fire: false, dirX: 0, dirY: 0, aimX: 0, aimY: 0 };
  private pending: PadInput = { fwd: 0, turn: 0, fire: false, dirX: 0, dirY: 0, aimX: 0, aimY: 0 };
  /** Tryb sterowania wybrany na telefonie (wysyłany razem z każdym stanem joysticka). */
  private steerMode: PadSteer = readSteerMode();
  /** Wymuś najbliższą wysyłkę niezależnie od tego, czy stan się zmienił. */
  private forceSend = true;
  private lastSendAt = 0;
  private lastMsgAt = 0;

  private signaling: SignalingConfig = signalingFromLocation();
  private code = '';
  private nick = '';
  /** Trwa sesja łączenia (także automatyczne ponowienia). */
  private active = false;
  private attempt = 0;
  private maxAttempts = MAX_ATTEMPTS;
  private roomRetries = 0;
  private attemptStartedAt = 0;

  /* --- Awaryjny przekaźnik (biegnie równolegle z próbą P2P) --- */
  private relayCid = '';
  private relayChannel: RelayChannel | null = null;
  private relayLink: ClientRelayLink | null = null;
  /** Wyścig przekaźnika trwa (spróbuj brokery kolejno). */
  private relayActive = false;
  /** Ścieżka P2P dobiegła końca (sukces lub wyczerpanie prób). */
  private p2pSettled = true;
  /** Pokazaliśmy już błąd końcowy. */
  private settleDone = false;
  private relayWaitResolve: ((outcome: RelayOutcome) => void) | null = null;
  private relayWaitTimer = 0;

  state: PadClientState = {
    status: 'idle', code: '', error: null, progress: '', phase: 'idle',
    attempt: 0, maxAttempts: MAX_ATTEMPTS, elapsed: 0, lastFailure: null,
    signaling: this.signaling.label,
    slot: -1, name: '', color: '#fbbf24', darkColor: '#78350f',
    screen: 'lobby', game: null, adminSlot: null, selection: 0, roster: [],
    hud: null, arcadeHud: null, latency: 0, result: null, viaRelay: false,
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

  /** Stały identyfikator telefonu — po zmianie transportu host nie da nam drugiego slotu. */
  private devicePid(): string {
    try {
      let pid = localStorage.getItem(LS_PAD_PID);
      if (!pid) {
        pid = newRelaySessionId();
        try { localStorage.setItem(LS_PAD_PID, pid); } catch { /* ignore */ }
      }
      return pid;
    } catch {
      return newRelaySessionId();
    }
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
    this.p2pSettled = false;
    this.settleDone = false;
    this.relayCid = newRelaySessionId();
    this.set({
      status: 'connecting', code, error: null, result: null, hud: null, arcadeHud: null,
      game: null, roster: [], adminSlot: null, options: undefined, slot: -1,
      phase: 'signal', attempt: 1, maxAttempts: this.maxAttempts, elapsed: 0,
      lastFailure: null, signaling: this.signaling.label, viaRelay: false,
      progress: 'Łączę z serwerem sygnalizacji…',
    });
    this.attemptStartedAt = performance.now();
    this.startTicker();
    // Wyścig: P2P (szybki, bezpośredni) kontra przekaźnik (wolniejszy, ale wszędzie).
    this.startRelayRace();
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
      this.p2pSettled = true;
      this.settleIfBothDone(`Nie udało się uruchomić WebRTC: ${describeError(err)}`);
      return;
    }
    this.peer = peer;

    peer.on('open', () => {
      if (this.peer !== peer || !this.active) return;
      this.set({ phase: 'link', progress: 'Szukam komputera o tym kodzie…' });
      const raw: DataConnection = peer.connect(roomIdFromCode(this.code), {
        reliable: true, serialization: 'json', metadata: { nick: this.nick },
      });
      const link = new WebrtcLink(raw);
      this.p2pLink = link;
      link.onMessage((m) => this.onInbound(link, m as HostMessage));
      link.onClosed(() => this.onLinkClosed(link));
      raw.on('open', () => {
        if (this.p2pLink === link && this.state.status !== 'connected') this.onP2pConnected(link);
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

  private onP2pConnected(link: WebrtcLink) {
    if (!this.active) { link.close(); return; }
    if (this.state.status === 'connected') return;
    this.clearAttemptTimers();
    this.attemptStartedAt = performance.now();
    this.set({ phase: 'handshake', progress: 'Witam się z komputerem…' });
    this.sendHello(link);
    // Na niektórych przeglądarkach kanał może zgłosić 'open' zanim host
    // zainstaluje listener wiadomości. Powtarzaj hello do otrzymania welcome.
    this.helloTimer = window.setInterval(() => {
      if (this.active && this.state.status === 'connecting' && this.p2pLink === link && link.open) this.sendHello(link);
    }, 850);
    this.armTimeout(WELCOME_TIMEOUT, () => this.failAttempt('Komputer nie przydzielił miejsca dla tego telefonu.', false));
  }

  private sendHello(link: PadLink) {
    link.send({ t: 'hello', nick: this.nick, ua: navigator.userAgent.slice(0, 80), v: PROTOCOL_VERSION, pid: this.devicePid(), steer: this.steerMode });
  }

  private startStreams() {
    this.stopStreams();
    this.pingTimer = window.setInterval(() => {
      const c = this.conn;
      if (c && c.open) c.send({ t: 'ping', at: performance.now() });
    }, 2000);
    this.sendTimer = window.setInterval(() => this.flush(), 1000 / 30);
  }

  /** Watchdog: komputer milczy (brak pongów) => traktujemy jako utratę połączenia. */
  private startLiveness() {
    clearInterval(this.livenessTimer);
    this.livenessTimer = window.setInterval(() => {
      if (this.state.status !== 'connected') return;
      if (performance.now() - this.lastMsgAt > LIVENESS_TIMEOUT) {
        const link = this.conn;
        if (link) this.onLinkClosed(link);
      }
    }, 2000);
  }

  /* ----------------------- awaryjny przekaźnik ------------------------- */

  /**
   * Równolegle z próbą P2P: łączymy się kolejno z brokerami i czekamy, aż
   * komputer (który stale podsłuchuje temat pokoju) przydzieli slot.
   * Wygrywa ten transport, który pierwszy dostarczy `welcome`.
   */
  private startRelayRace() {
    if (!this.code || this.relayActive) return;
    const topic = relayTopicFor(this.code);
    const cid = this.relayCid;
    this.relayActive = true;
    void (async () => {
      for (let i = 0; i < RELAY_BROKERS.length; i++) {
        if (!this.active || this.isSessionDone()) {
          this.relayActive = false;
          return;
        }
        let channel: RelayChannel;
        try {
          channel = await RelayChannel.connect(RELAY_BROKERS[i], topic, RELAY_BROKER_TIMEOUT);
        } catch {
          continue; // ten broker nie odpowiada — spróbuj następnego
        }
        if (!this.active || this.isSessionDone()) {
          channel.close();
          this.relayActive = false;
          return;
        }
        this.relayChannel = channel;
        const link = new ClientRelayLink(channel, cid);
        this.relayLink = link;
        link.onMessage((raw) => this.onInbound(link, raw as HostMessage));
        link.onClosed(() => this.onLinkClosed(link));
        if (this.state.status === 'connecting') {
          this.set({ phase: 'link', progress: 'Łączę przez awaryjny przekaźnik (Internet)…' });
        }
        this.sendHello(link);
        // MQTT QoS 0 nie gwarantuje dostarczenia pierwszej wiadomości,
        // zwłaszcza przed SUBACK. Ponawiamy krótki handshake, nie wejście gracza.
        const repeat = window.setInterval(() => {
          if (this.active && this.state.status === 'connecting' && this.relayLink === link) this.sendHello(link);
        }, 900);
        const outcome = await this.waitForRelayOutcome(RELAY_WELCOME_TIMEOUT);
        clearInterval(repeat);
        if (outcome === 'won' && this.relayLink === link) {
          // Wygraliśmy przez ten przekaźnik — połączenie żyje, kończymy wyścig.
          this.relayActive = false;
          return;
        }
        // Ta runda przegrana — zamykamy kanał i idziemy do następnego brokera.
        if (this.relayChannel === channel) this.relayChannel = null;
        if (this.relayLink === link) this.relayLink = null;
        channel.close();
        if (outcome === 'won' || outcome === 'rejected' || !this.active || this.state.status !== 'connecting') {
          this.relayActive = false;
          return;
        }
      }
      this.relayActive = false;
      // Żaden broker nie łączy — ostateczny werdykt wydajemy dopiero, gdy P2P też dojdzie do końca.
      this.settleIfBothDone();
    })();
  }

  /** Czy sesja już dobiła do końca (gra albo odrzucenie) — bez narrowingu TS. */
  private isSessionDone(): boolean {
    const s: PadStatus = this.state.status;
    return s === 'connected' || s === 'rejected';
  }

  private waitForRelayOutcome(ms: number): Promise<RelayOutcome> {
    return new Promise((resolve) => {
      this.relayWaitResolve = resolve;
      this.relayWaitTimer = window.setTimeout(() => this.resolveRelayWait('timeout'), ms);
    });
  }

  private resolveRelayWait(outcome: RelayOutcome): void {
    const r = this.relayWaitResolve;
    this.relayWaitResolve = null;
    clearTimeout(this.relayWaitTimer);
    this.relayWaitTimer = 0;
    if (r) r(outcome);
  }

  /** Koniec wyścigu: zamykamy przekaźnik i czekający timer. */
  private cancelRelay() {
    this.relayActive = false;
    this.resolveRelayWait('closed');
    const link = this.relayLink;
    this.relayLink = null;
    const channel = this.relayChannel;
    this.relayChannel = null;
    if (link) {
      if (this.conn === link) this.conn = null;
      try { link.close(); } catch { /* ignore */ }
    } else if (channel) {
      try { channel.close(); } catch { /* ignore */ }
    }
  }

  /** Zamyka przegrany transport (wygrany zostaje aktywny). */
  private cancelLosingTransport(winner: PadLink) {
    this.conn = winner;
    if (winner.kind === 'webrtc') {
      // Wygrało łączenie bezpośrednie — cicho kończymy rundę przekaźnika.
      this.resolveRelayWait('closed');
      const link = this.relayLink;
      this.relayLink = null;
      const channel = this.relayChannel;
      this.relayChannel = null;
      if (link) { try { link.close(); } catch { /* ignore */ } }
      else if (channel) { try { channel.close(); } catch { /* ignore */ } }
    } else {
      // Wygrał przekaźnik — serwer sygnalizacji już nam niepotrzebny.
      this.destroyP2p();
    }
  }

  /* ------------------------- obsługa wiadomości ------------------------ */

  /**
   * Wiadomość z któregoś transportu. Przed `welcome` akceptujemy z obu
   * (oba mogą być w trakcie) — po `welcome` tylko ze zwycięskiego.
   */
  private onInbound(link: PadLink, msg: HostMessage) {
    if (!msg || typeof msg !== 'object') return;
    if (this.state.status === 'connected' && this.conn !== link) return;
    this.lastMsgAt = performance.now();
    this.onMessage(link, msg);
  }

  private onMessage(link: PadLink, msg: HostMessage) {
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'welcome':
        if (this.state.status === 'connected') return;
        this.active = false;
        this.p2pSettled = true;
        this.resolveRelayWait('won');
        this.cancelLosingTransport(link);
        this.clearAttemptTimers();
        this.lastMsgAt = performance.now();
        // Komputer właśnie wyzerował nasze wejście — wyślij bieżący stan od razu
        // (inaczej przytrzymana gałka „zamarzłaby” na ~250 ms po ponownym połączeniu).
        this.forceSend = true;
        this.startStreams();
        this.startLiveness();
        this.set({
          status: 'connected', slot: msg.slot, name: msg.name, color: msg.color, darkColor: msg.darkColor,
          screen: msg.screen, error: null, progress: '', phase: 'idle', elapsed: 0, lastFailure: null,
          viaRelay: link.kind === 'relay',
        });
        break;
      case 'rejected':
        this.active = false;
        this.p2pSettled = true;
        this.resolveRelayWait('rejected');
        this.teardown();
        this.set({ status: 'rejected', error: msg.reason, progress: '', phase: 'idle', lastFailure: 'rejected' });
        break;
      case 'slot':
        this.set({ slot: msg.slot, name: msg.name, color: msg.color, darkColor: msg.darkColor });
        break;
      case 'screen': {
        const effectiveScreen = this.state.game === null ? 'lobby' : msg.screen;
        this.set({
          screen: effectiveScreen,
          hud: effectiveScreen === 'game' ? this.state.hud : null,
          arcadeHud: effectiveScreen === 'game' ? this.state.arcadeHud : null,
          result: effectiveScreen === 'over' ? { winnerName: msg.winnerName, winnerColor: msg.winnerColor, youWon: msg.youWon } : null,
        });
        break;
      }
      case 'session': {
        const { game, screen, adminSlot, selection, roster, options } = msg.session;
        // Sesja bez gry oznacza bibliotekę. Wymuszamy to także po stronie
        // telefonu, żeby pojedynczy opóźniony pakiet „menu gry” nie zablokował
        // ponownego wyboru po powrocie z rozgrywki.
        const effectiveScreen = game === null ? 'lobby' : screen;
        this.set({
          game, screen: effectiveScreen, adminSlot, selection, roster, options,
          hud: effectiveScreen === 'game' && game === 'tanks' ? this.state.hud : null,
          arcadeHud: effectiveScreen === 'game' && game !== 'tanks' ? this.state.arcadeHud : null,
        });
        break;
      }
      case 'arcadeHud':
        this.set({ arcadeHud: msg.hud });
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

  /** Link (P2P albo przekaźnik) zginął. */
  private onLinkClosed(link: PadLink) {
    if (link.kind === 'relay') {
      if (this.relayLink !== link) return;
      this.relayLink = null;
      this.resolveRelayWait('closed');
    } else {
      if (this.p2pLink !== link) return;
      this.p2pLink = null;
    }

    if (this.state.status === 'connected' && this.conn === link) {
      // Zerwane po starcie gry — próbujemy wrócić automatycznie.
      this.conn = null;
      this.stopStreams();
      this.set({
        status: 'lost', hud: null,
        error: 'Utracono połączenie z komputerem — próbuję połączyć ponownie…',
        progress: 'Łączę ponownie…', phase: 'signal', attempt: 0, maxAttempts: RECONNECT_ATTEMPTS,
      });
      this.attempt = 0;
      this.maxAttempts = RECONNECT_ATTEMPTS;
      this.active = true;
      this.p2pSettled = false;
      this.settleDone = false;
      this.attemptStartedAt = performance.now();
      this.startTicker();
      this.retryTimer = window.setTimeout(() => {
        if (this.active) { this.startRelayRace(); this.beginAttempt(); }
      }, 1200);
      return;
    }

    if (this.state.status === 'connecting' && this.active && link.kind === 'webrtc') {
      // Połączenie P2P przerwane podczas łączenia — liczymy nieudaną próbę
      // (wyścig przekaźnika trwa niezależnie).
      this.failAttempt('Komputer zamknął połączenie.', false);
    }
  }

  /** Nieudana próba: albo ponawiamy (z rosnącym opóźnieniem), albo zgłaszamy, że ścieżka P2P umarła. */
  private failAttempt(reason: string, permanent: boolean) {
    if (!this.active) return;
    this.cleanupAttempt();

    if (permanent) {
      this.p2pSettled = true;
      this.settleIfBothDone(reason);
      return;
    }

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
    this.p2pSettled = true;
    this.settleIfBothDone(reason);
  }

  /**
   * Ostateczny werdykt: pokazujemy błąd dopiero, gdy ZARÓWNO ścieżka P2P,
   * ZARÓWNO wyścig przekaźnika dobiegły końca bez sukcesu.
   */
  private settleIfBothDone(reason: string | null = null) {
    if (this.settleDone) return;
    if (this.state.status === 'connected' || this.state.status === 'rejected') return;
    if (this.relayActive || !this.p2pSettled) return;
    this.settleDone = true;
    this.active = false;
    this.teardown();
    const seconds = Math.round((performance.now() - this.attemptStartedAt) / 1000);
    const detail = reason === 'peer-unavailable'
      ? 'Nie znalazłem pokoju o tym kodzie — ani bezpośrednio, ani przez awaryjny przekaźnik. Najczęściej kod jest nieaktualny (zmienia się po odświeżeniu strony komputera). Zeskanuj QR jeszcze raz albo przepisz kod z ekranu komputera.'
      : reason ?? 'Nie udało się połączyć bezpośrednio (WebRTC) ani przez awaryjny przekaźnik (Internet).';
    this.set({
      status: 'error',
      phase: 'idle',
      lastFailure: reason,
      progress: '',
      error: `Nie udało się połączyć z komputerem (${this.attempt} ${this.attempt === 1 ? 'próba' : 'próby'}${seconds > 0 ? `, ${seconds} s` : ''}).\n${detail}\n\nSprawdź kod na ekranie komputera i upewnij się, że oba urządzenia mają internet. Szczegóły możesz sprawdzić przyciskiem „Sprawdź połączenie”.`,
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
          this.p2pSettled = true;
          this.settleIfBothDone('peer-unavailable');
        }
        return;
      case 'browser-incompatible':
        this.p2pSettled = true;
        this.settleIfBothDone('Ta przeglądarka nie obsługuje WebRTC — łączenie bezpośrednie niedostępne (awaryjny przekaźnik jest sprawdzany równolegle).');
        return;
      case 'invalid-id':
      case 'invalid-key':
        this.p2pSettled = true;
        this.settleIfBothDone(`Serwer sygnalizacji odrzucił połączenie (${type}).`);
        return;
      case 'network':
      case 'server-error':
      case 'socket-error':
      case 'socket-closed':
      case 'ssl-unavailable':
      case 'disconnected': {
        if (this.state.status === 'connected') {
          // Grubsza sprawa: połączenie z komputerem żyje, więc brak brokera nic nie psuje.
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
    this.pending = { fwd: 0, turn: 0, fire: false, dirX: 0, dirY: 0, aimX: 0, aimY: 0 };
    this.forceSend = true;
    if (!silent) this.set({ status: 'idle', game: null, adminSlot: null, roster: [], hud: null, arcadeHud: null, slot: -1, error: null, progress: '', phase: 'idle', attempt: 0, elapsed: 0, lastFailure: null, viaRelay: false });
  }

  /* --------------------------- sprzątanie ---------------------------- */

  /** Zamyka wszystko, co dotyczy bieżącej sesji (ale zostawia stan dla UI). */
  private teardown() {
    this.clearAttemptTimers();
    this.stopStreams();
    clearInterval(this.tickTimer);
    this.tickTimer = 0;
    this.cancelRelay();
    this.destroyP2p();
  }

  /** Kończy tylko bieżącą próbę łączenia P2P (przekaźnik działa dalej). */
  private cleanupAttempt() {
    this.clearAttemptTimers();
    this.stopStreams();
    this.destroyP2p();
  }

  private clearAttemptTimers() {
    clearTimeout(this.attemptTimer);
    clearInterval(this.helloTimer);
    clearTimeout(this.retryTimer);
    this.attemptTimer = 0;
    this.helloTimer = 0;
    this.retryTimer = 0;
  }

  private stopStreams() {
    clearInterval(this.sendTimer);
    clearInterval(this.pingTimer);
    clearInterval(this.livenessTimer);
    this.sendTimer = 0;
    this.pingTimer = 0;
    this.livenessTimer = 0;
  }

  private destroyP2p() {
    const link = this.p2pLink;
    this.p2pLink = null;
    if (this.conn === link) this.conn = null;
    const peer = this.peer;
    this.peer = null;
    if (link) { try { link.close(); } catch { /* ignore */ } }
    if (peer) { try { peer.destroy(); } catch { /* ignore */ } }
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

  /** Bieżący tryb sterowania joysticka (`direct` = jedziesz tam, gdzie pchasz). */
  get steer(): PadSteer {
    return this.steerMode;
  }

  /** Zmień tryb sterowania — zapamiętuje wybór i wysyła go komputerowi od razu. */
  setSteer(mode: PadSteer) {
    this.steerMode = mode;
    try { localStorage.setItem(LS_PAD_STEER, mode); } catch { /* ignore */ }
    this.forceSend = true;
    if (this.conn?.open) this.flush();
  }

  requestPause() {
    if (this.conn?.open) this.conn.send({ t: 'pause' });
  }

  sendCommand(command: RemoteCommand) {
    if (this.conn?.open) this.conn.send({ t: 'command', command });
  }

  chooseGame(index: number) {
    if (this.conn?.open) this.conn.send({ t: 'choose', index });
  }

  private flush() {
    if (!this.conn?.open) return;
    const p = this.pending, l = this.lastSent;
    const now = performance.now();
    const r2 = (v: number) => +v.toFixed(2);
    const changed = Math.abs(p.fwd - l.fwd) > 0.01
      || Math.abs(p.turn - l.turn) > 0.01
      || Math.abs((p.dirX ?? 0) - (l.dirX ?? 0)) > 0.01
      || Math.abs((p.dirY ?? 0) - (l.dirY ?? 0)) > 0.01
      || Math.abs((p.aimX ?? 0) - (l.aimX ?? 0)) > 0.01
      || Math.abs((p.aimY ?? 0) - (l.aimY ?? 0)) > 0.01
      || p.fire !== l.fire;
    if (!changed && !this.forceSend && now - this.lastSendAt < 250) return; // heartbeat co 250 ms
    this.forceSend = false;
    this.lastSent = { ...p };
    this.lastSendAt = now;
    this.conn.send({
      t: 'input',
      fwd: r2(p.fwd), turn: r2(p.turn), fire: p.fire,
      steer: this.steerMode, dirX: r2(p.dirX ?? 0), dirY: r2(p.dirY ?? 0),
      aimX: r2(p.aimX ?? 0), aimY: r2(p.aimY ?? 0),
    });
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  return 'nieznany błąd';
}

export const padClient = new PadClient();
