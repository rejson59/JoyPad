/**
 * Test połączenia — „dlaczego mi się nie łączy?” w wersji dla gracza.
 *
 * Sprawdzamy kolejno wszystkie ogniwa:
 *  1. czy przeglądarka ma WebRTC i czy strona działa po HTTPS,
 *  2. czy odpowiada serwer sygnalizacji (zwykłe HTTP + gniazdo WebSocket),
 *  3. czy działa STUN (połączenie w tej samej sieci / publiczny adres),
 *  4. czy działa TURN (przekaźnik, gdy telefon jest np. na LTE),
 *  5. czy działa awaryjny przekaźnik (broker MQTT — łączność „zawsze i wszędzie”).
 */
import { STUN_SERVERS, hasConfiguredTurn, hasTurnOverride, turnServers, signalingFromLocation, type SignalingConfig } from './signaling';
import { RELAY_BROKERS, RelayChannel, relayTopicFor } from './relay';
import { loadLanguage, t as translate, type Language } from '../platform/i18n';

export type DiagStatus = 'running' | 'ok' | 'warn' | 'fail';

export interface DiagStep {
  id: string;
  label: string;
  status: DiagStatus;
  detail: string;
  hint?: string;
}

export type DiagReporter = (step: DiagStep) => void;

interface IceProbe { kinds: Map<string, number>; candidates: string[]; error?: string; }

function randomTag(): string {
  const arr = new Uint32Array(2);
  crypto.getRandomValues(arr);
  return `${arr[0].toString(36)}${arr[1].toString(36)}`;
}

function probeWebSocket(url: string, timeoutMs: number, language: Language): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    let socket: WebSocket;
    try { socket = new WebSocket(url); } catch { reject(new Error(translate(language, 'diagnostics.probe.socket'))); return; }

    const finish = (fn: () => void) => {
      clearTimeout(timer);
      socket.onopen = null; socket.onerror = null; socket.onclose = null;
      try { socket.close(); } catch { /* ignore */ }
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error(translate(language, 'diagnostics.probe.timeout')))), timeoutMs);
    socket.onopen = () => finish(() => resolve(performance.now() - started));
    socket.onerror = () => finish(() => reject(new Error(translate(language, 'diagnostics.probe.rejected'))));
  });
}

function parseCandidateType(candidate: RTCIceCandidate): string {
  // Nowoczesne przeglądarki eksponują .type bezpośrednio (host/srflx/prflx/relay)
  const t = (candidate as unknown as { type?: string }).type;
  if (t) return t;
  const raw = candidate.candidate ?? '';
  const m = /typ (\w+)/.exec(raw);
  if (m) return m[1];
  // Fallback: spróbuj wywnioskować po porcie / protokole, ale traktuj jako host
  return 'host';
}

function collectTypesFromSdp(sdp: string): Map<string, number> {
  const out = new Map<string, number>();
  const re = /a=candidate:[^\n]* typ (\w+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sdp))) {
    const t = m[1];
    if (!out.has(t)) out.set(t, 0);
  }
  return out;
}

async function probeIce(
  iceServers: RTCIceServer[],
  waitMs: number,
  iceTransportPolicy: RTCIceTransportPolicy = 'all',
): Promise<IceProbe> {
  const kinds = new Map<string, number>();
  const candidates: string[] = [];
  let pc: RTCPeerConnection | null = null;
  let probeError: string | undefined;
  try {
    pc = new RTCPeerConnection({ iceServers, iceTransportPolicy });
    const started = performance.now();
    pc.onicecandidate = (ev) => {
      const c = ev.candidate;
      if (!c) return;
      const raw = c.candidate ?? '';
      if (raw) candidates.push(raw);
      // nawet jeśli candidate.candidate jest puste (niektóre relay), użyj .type
      const type = parseCandidateType(c);
      if (!kinds.has(type)) kinds.set(type, Math.round(performance.now() - started));
    };
    // Złap też kandydatów, które przeglądarka mogła dodać bezpośrednio do SDP
    // (niektóre implementacje nie odpalają onicecandidate dla host przed setLocalDescription)
    const dc = pc.createDataChannel('diagnostyka');
    // Upewnij się, że kanał nie blokuje zamknięcia
    dc.onopen = () => { /* ignore */ };
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Poczekaj na zakończenie zbierania — ale zbieraj też kandydatów z SDP jako fallback
    await new Promise<void>((resolve) => {
      if (pc!.iceGatheringState === 'complete') { resolve(); return; }
      let resolved = false;
      const done = () => {
        if (resolved) return;
        resolved = true;
        resolve();
      };
      const timer = setTimeout(done, waitMs);
      const handler = () => {
        if (pc!.iceGatheringState === 'complete') {
          clearTimeout(timer);
          pc!.removeEventListener('icegatheringstatechange', handler);
          done();
        }
      };
      pc!.addEventListener('icegatheringstatechange', handler);
    });

    // Fallback: jeśli onicecandidate nie złapało nic, spróbuj sparsować SDP
    if (kinds.size === 0 && pc.localDescription?.sdp) {
      const fromSdp = collectTypesFromSdp(pc.localDescription.sdp);
      for (const [k, v] of fromSdp) kinds.set(k, v);
      // Dodaj surowe linie kandydatów z SDP dla diagnostyki
      const sdpCandidates = pc.localDescription.sdp.match(/a=candidate:.+/g) ?? [];
      for (const line of sdpCandidates) if (!candidates.includes(line)) candidates.push(line);
    }

    // Dodatkowy fallback: poczekaj jeszcze 400ms na spóźnione trickle
    if (kinds.size === 0) {
      await new Promise(r => setTimeout(r, 400));
      if (pc.localDescription?.sdp) {
        const fromSdp = collectTypesFromSdp(pc.localDescription.sdp);
        for (const [k] of fromSdp) if (!kinds.has(k)) kinds.set(k, Math.round(performance.now() - started));
      }
    }
  } catch (e) {
    probeError = e instanceof Error ? e.message : String(e);
  } finally {
    try { pc?.close(); } catch { /* ignore */ }
  }
  return { kinds, candidates, error: probeError };
}

/**
 * Test awaryjnego przekaźnika: łączymy się z brokerem (kolejno), subskrybujemy
 * temat i weryfikujemy end-to-end — publikujemy wiadomość i czekamy, aż broker
 * odda ją do własnej subskrypcji.
 */
async function probeRelay(): Promise<{ label: string; took: number } | null> {
  for (const url of RELAY_BROKERS) {
    let channel: RelayChannel | null = null;
    try {
      const started = performance.now();
      channel = await RelayChannel.connect(url, relayTopicFor('DIAG'), 8_000);
      const echoed = await new Promise<boolean>((resolve) => {
        const timer = setTimeout(() => resolve(false), 3_500);
        channel!.onBatch((items) => {
          if (items.some((i) => i.cid === 'sf-diag')) {
            clearTimeout(timer);
            resolve(true);
          }
        });
        channel!.publish([{ cid: 'sf-diag', m: 1 }]);
      });
      if (echoed) {
        return { label: url.replace(/^wss:\/\//, ''), took: performance.now() - started };
      }
    } catch {
      /* spróbuj następnego brokera */
    } finally {
      channel?.close();
    }
  }
  return null;
}

const ms = (v: number) => `${Math.round(v)} ms`;

export async function runDiagnostics(
  signaling: SignalingConfig = signalingFromLocation(),
  report: DiagReporter = () => {},
  language: Language = loadLanguage(),
): Promise<DiagStep[]> {
  const tr = (key: string, values: Record<string, string | number> = {}) => translate(language, key, values);
  const results: DiagStep[] = [];
  const push = (s: DiagStep) => { results.push(s); report(s); return s; };

  /* 1. Przeglądarka / kontekst ------------------------------------------------ */
  report({ id: 'webrtc', label: tr('diagnostics.browser'), status: 'running', detail: tr('diagnostics.browser.running') });
  if (typeof RTCPeerConnection === 'undefined') {
    push({
      id: 'webrtc', label: tr('diagnostics.browser'), status: 'fail',
      detail: tr('diagnostics.browser.unsupported'),
      hint: tr('diagnostics.browser.hint'),
    });
    return results;
  }
  const secureContext = typeof window !== 'undefined' && window.isSecureContext;
  push({
    id: 'webrtc', label: tr('diagnostics.browser'),
    status: secureContext ? 'ok' : 'warn',
    detail: secureContext ? tr('diagnostics.browser.secure') : tr('diagnostics.browser.insecure'),
  });

  const host = signaling.host ?? '0.peerjs.com';
  const port = signaling.port ?? 443;
  const path = signaling.path ?? '/';
  const key = signaling.key ?? 'peerjs';
  const secure = signaling.secure ?? true;

  /* 2a. Serwer sygnalizacji — HTTP -------------------------------------------- */
  report({ id: 'api', label: tr('diagnostics.signalHttp'), status: 'running', detail: tr('diagnostics.signalHttp.running') });
  let apiOk = false;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const started = performance.now();
    const res = await fetch(`${secure ? 'https' : 'http'}://${host}:${port}${path}${key}/id?ts=${Date.now()}`, { signal: controller.signal });
    clearTimeout(timer);
    apiOk = res.ok;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const took = performance.now() - started;
    push({
      id: 'api', label: tr('diagnostics.signalHttp'),
      status: took < 3000 ? 'ok' : 'warn',
      detail: tr('diagnostics.signalHttp.response', { time: ms(took), host, port }),
      hint: took < 3000 ? undefined : tr('diagnostics.signalHttp.slow'),
    });
  } catch (err) {
    push({
      id: 'api', label: tr('diagnostics.signalHttp'), status: 'fail',
      detail: tr('diagnostics.signalHttp.fail', { host, port, error: err instanceof Error ? err.message : String(err) }),
      hint: tr('diagnostics.signalHttp.hint'),
    });
  }

  /* 2b. Serwer sygnalizacji — WebSocket --------------------------------------- */
  report({ id: 'ws', label: tr('diagnostics.signalWs'), status: 'running', detail: tr('diagnostics.signalWs.running') });
  if (!apiOk) {
    push({ id: 'ws', label: tr('diagnostics.signalWs'), status: 'fail', detail: tr('diagnostics.signalWs.skipped') });
  } else {
    try {
      const url = `${secure ? 'wss' : 'ws'}://${host}:${port}${path}peerjs?key=${key}&id=sf-diag-${randomTag()}&token=diag&version=diag`;
      const took = await probeWebSocket(url, 12_000, language);
      push({
        id: 'ws', label: tr('diagnostics.signalWs'),
        status: took < 4000 ? 'ok' : 'warn',
        detail: tr('diagnostics.signalWs.open', { time: ms(took) }),
        hint: took < 4000 ? undefined : tr('diagnostics.signalWs.slow'),
      });
    } catch (err) {
      push({
        id: 'ws', label: tr('diagnostics.signalWs'), status: 'fail',
        detail: tr('diagnostics.signalWs.fail', { error: err instanceof Error ? err.message : String(err) }),
        hint: tr('diagnostics.signalWs.hint'),
      });
    }
  }

  /* 3. STUN (ta sama sieć / adres publiczny) ---------------------------------- */
  report({ id: 'stun', label: tr('diagnostics.stun'), status: 'running', detail: tr('diagnostics.stun.running') });
  // Główna próba — pełna lista STUN
  const stun = await probeIce(STUN_SERVERS, 10_000);
  const srflx = stun.kinds.get('srflx');
  let hostCandidates = stun.kinds.get('host');
  // Jeśli nic nie zebrano, spróbuj bez STUN — czy w ogóle działa zbieranie lokalnych kandydatów?
  let localProbe: IceProbe | null = null;
  if (stun.kinds.size === 0) {
    localProbe = await probeIce([], 4000);
    // Jeśli bez STUN też pusto — WebRTC jest całkowicie zablokowane w tej przeglądarce/sieci
    // Jeśli bez STUN mamy host — oznacza to, że sieć blokuje UDP do serwerów STUN, ale lokalne kandydaty działają
    if (localProbe.kinds.size > 0 && localProbe.kinds.has('host')) {
      hostCandidates = localProbe.kinds.get('host');
    }
  }

  if (srflx !== undefined) {
    push({ id: 'stun', label: tr('diagnostics.stun'), status: 'ok', detail: tr('diagnostics.stun.public', { time: ms(srflx) }) });
  } else if (hostCandidates !== undefined) {
    // Mamy host, ale nie srflx — typowo firewall blokuje UDP 19302/3478
    push({
      id: 'stun', label: tr('diagnostics.stun'), status: 'warn',
      detail: tr('diagnostics.stun.missing'),
      hint: tr('diagnostics.stun.missingHint'),
    });
  } else {
    // Ani host ani srflx — nawet lokalne kandydaty nie działają (mDNS wyłączone, VPN blokuje, brak uprawnień)
    // Sprawdź, czy kandydaci zawierają .local (mDNS ukryte)
    const hasMdns = [...stun.candidates, ...(localProbe?.candidates ?? [])].some(c => c.includes('.local'));
    if (hasMdns) {
      push({
        id: 'stun', label: tr('diagnostics.stun'), status: 'warn',
        detail: tr('diagnostics.stun.mdns'),
        hint: tr('diagnostics.stun.mdnsHint'),
      });
    } else {
      const errPart = stun.error ? ` (${stun.error})` : '';
      const localErr = localProbe?.error ? tr('diagnostics.stun.localError', { error: localProbe.error }) : '';
      push({
        id: 'stun', label: tr('diagnostics.stun'), status: 'fail',
        detail: tr('diagnostics.stun.fail', { details: `${errPart}${localErr}` }),
        hint: tr('diagnostics.stun.failHint'),
      });
    }
  }

  /* 4. TURN (przekaźnik dla różnych sieci) ------------------------------------ */
  report({ id: 'turn', label: tr('diagnostics.turn'), status: 'running', detail: tr('diagnostics.turn.running') });
  // Wymuszamy relay. Bez tego każda próba TURN zbiera też host/srflx ze zwykłej
  // sieci i raportuje mylące „wykryto host, srflx”, choć przekaźnik nie zadziałał.
  const turn = await probeIce(turnServers(), 12_000, 'relay');
  const turnRelay = turn.kinds.get('relay');
  const dedicatedTurn = hasConfiguredTurn() || hasTurnOverride();
  if (turnRelay !== undefined) {
    push({
      id: 'turn', label: tr('diagnostics.turn'), status: 'ok',
      detail: tr(dedicatedTurn ? 'diagnostics.turn.readyDedicated' : 'diagnostics.turn.readyShared', { time: ms(turnRelay) }),
    });
  } else {
    const error = turn.error ? ` (${turn.error})` : '';
    push({
      id: 'turn', label: tr('diagnostics.turn'), status: 'warn',
      detail: tr(dedicatedTurn ? 'diagnostics.turn.failDedicated' : 'diagnostics.turn.failShared', { error }),
      hint: tr(dedicatedTurn ? 'diagnostics.turn.hintDedicated' : 'diagnostics.turn.hintShared'),
    });
  }

  /* 5. Awaryjny przekaźnik — łączenie „zawsze i wszędzie” ---------------------- */
  report({ id: 'relay', label: tr('diagnostics.relay'), status: 'running', detail: tr('diagnostics.relay.running') });
  const relay = await probeRelay();
  if (relay) {
    push({
      id: 'relay', label: tr('diagnostics.relay'), status: 'ok',
      detail: tr('diagnostics.relay.ready', { time: ms(relay.took), host: relay.label }),
      hint: tr('diagnostics.relay.readyHint'),
    });
  } else {
    push({
      id: 'relay', label: tr('diagnostics.relay'), status: 'fail',
      detail: tr('diagnostics.relay.fail'),
      hint: tr('diagnostics.relay.failHint'),
    });
  }

  return results;
}
