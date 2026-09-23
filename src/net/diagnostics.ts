/**
 * Test połączenia — „dlaczego mi się nie łączy?” w wersji dla gracza.
 *
 * Sprawdzamy kolejno wszystkie ogniwa:
 *  1. czy przeglądarka ma WebRTC i czy strona działa po HTTPS,
 *  2. czy odpowiada serwer sygnalizacji (zwykłe HTTP + gniazdo WebSocket),
 *  3. czy działa STUN (połączenie w tej samej sieci / publiczny adres),
 *  4. czy działa TURN (przekaźnik, gdy telefon jest np. na LTE).
 */
import { STUN_SERVERS, turnServers, signalingFromLocation, type SignalingConfig } from './signaling';

export type DiagStatus = 'running' | 'ok' | 'warn' | 'fail';

export interface DiagStep {
  id: string;
  label: string;
  status: DiagStatus;
  detail: string;
  hint?: string;
}

export type DiagReporter = (step: DiagStep) => void;

interface IceProbe { kinds: Map<string, number>; }

function randomTag(): string {
  const arr = new Uint32Array(2);
  crypto.getRandomValues(arr);
  return `${arr[0].toString(36)}${arr[1].toString(36)}`;
}

function probeWebSocket(url: string, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    let socket: WebSocket;
    try { socket = new WebSocket(url); } catch { reject(new Error('nie można otworzyć gniazda')); return; }

    const finish = (fn: () => void) => {
      clearTimeout(timer);
      socket.onopen = null; socket.onerror = null; socket.onclose = null;
      try { socket.close(); } catch { /* ignore */ }
      fn();
    };
    const timer = setTimeout(() => finish(() => reject(new Error('brak odpowiedzi'))), timeoutMs);
    socket.onopen = () => finish(() => resolve(performance.now() - started));
    socket.onerror = () => finish(() => reject(new Error('serwer odrzucił gniazdo WebSocket')));
  });
}

async function probeIce(iceServers: RTCIceServer[], waitMs: number): Promise<IceProbe> {
  const kinds = new Map<string, number>();
  let pc: RTCPeerConnection | null = null;
  try {
    pc = new RTCPeerConnection({ iceServers });
    const started = performance.now();
    pc.onicecandidate = (ev) => {
      const candidate = ev.candidate;
      if (!candidate?.candidate) return;
      const type = /typ (\w+)/.exec(candidate.candidate)?.[1] ?? 'host';
      if (!kinds.has(type)) kinds.set(type, Math.round(performance.now() - started));
    };
    pc.createDataChannel('diagnostyka');
    await pc.setLocalDescription(await pc.createOffer());
    await new Promise<void>((resolve) => {
      if (pc!.iceGatheringState === 'complete') { resolve(); return; }
      const timer = setTimeout(resolve, waitMs);
      pc!.addEventListener('icegatheringstatechange', () => {
        if (pc!.iceGatheringState === 'complete') { clearTimeout(timer); resolve(); }
      });
    });
  } catch {
    /* zwracamy to, co udało się zebrać */
  } finally {
    try { pc?.close(); } catch { /* ignore */ }
  }
  return { kinds };
}

const ms = (v: number) => `${Math.round(v)} ms`;

export async function runDiagnostics(
  signaling: SignalingConfig = signalingFromLocation(),
  report: DiagReporter = () => {},
): Promise<DiagStep[]> {
  const results: DiagStep[] = [];
  const push = (s: DiagStep) => { results.push(s); report(s); return s; };

  /* 1. Przeglądarka / kontekst ------------------------------------------------ */
  report({ id: 'webrtc', label: 'Przeglądarka', status: 'running', detail: 'sprawdzam…' });
  if (typeof RTCPeerConnection === 'undefined') {
    push({
      id: 'webrtc', label: 'Przeglądarka', status: 'fail',
      detail: 'Ta przeglądarka nie obsługuje WebRTC.',
      hint: 'Otwórz grę w Chrome, Safari, Edge albo Firefoksie (aktualna wersja).',
    });
    return results;
  }
  const secureContext = typeof window !== 'undefined' && window.isSecureContext;
  push({
    id: 'webrtc', label: 'Przeglądarka',
    status: secureContext ? 'ok' : 'warn',
    detail: secureContext
      ? 'WebRTC działa, strona otwarta bezpiecznie (HTTPS).'
      : 'WebRTC działa, ale strona nie jest otwarta po HTTPS — niektóre funkcje przeglądarki mogą być zablokowane.',
  });

  const host = signaling.host ?? '0.peerjs.com';
  const port = signaling.port ?? 443;
  const path = signaling.path ?? '/';
  const key = signaling.key ?? 'peerjs';
  const secure = signaling.secure ?? true;

  /* 2a. Serwer sygnalizacji — HTTP -------------------------------------------- */
  report({ id: 'api', label: 'Serwer sygnalizacji (HTTP)', status: 'running', detail: 'pytam o identyfikator…' });
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
      id: 'api', label: 'Serwer sygnalizacji (HTTP)',
      status: took < 3000 ? 'ok' : 'warn',
      detail: `Odpowiedź w ${ms(took)} — ${host}:${port}.`,
      hint: took < 3000 ? undefined : 'Serwer odpowiada wolno — łączenie może potrwać dłużej, gra ponawia próby automatycznie.',
    });
  } catch (err) {
    push({
      id: 'api', label: 'Serwer sygnalizacji (HTTP)', status: 'fail',
      detail: `Brak odpowiedzi z ${host}:${port} (${err instanceof Error ? err.message : 'błąd'}).`,
      hint: 'Serwer sygnalizacji jest niedostępny — bez niego komputer i telefon nie mogą się odnaleźć. Spróbuj za chwilę, sprawdź filtr sieci/VPN albo wskaż własny serwer parametrem ?srv=host:port.',
    });
  }

  /* 2b. Serwer sygnalizacji — WebSocket --------------------------------------- */
  report({ id: 'ws', label: 'Serwer sygnalizacji (WebSocket)', status: 'running', detail: 'otwieram gniazdo…' });
  if (!apiOk) {
    push({ id: 'ws', label: 'Serwer sygnalizacji (WebSocket)', status: 'fail', detail: 'Pominięte — serwer nie odpowiada po HTTP.' });
  } else {
    try {
      const url = `${secure ? 'wss' : 'ws'}://${host}:${port}${path}peerjs?key=${key}&id=sf-diag-${randomTag()}&token=diag&version=diag`;
      const took = await probeWebSocket(url, 12_000);
      push({
        id: 'ws', label: 'Serwer sygnalizacji (WebSocket)',
        status: took < 4000 ? 'ok' : 'warn',
        detail: `Gniazdo otwarte w ${ms(took)}.`,
        hint: took < 4000 ? undefined : 'To ten etap zwykle odpowiada za komunikat o przekroczonym czasie. Gra czeka teraz na serwer do 25 s i ponawia próbę.',
      });
    } catch (err) {
      push({
        id: 'ws', label: 'Serwer sygnalizacji (WebSocket)', status: 'fail',
        detail: `Nie udało się otworzyć gniazda (${err instanceof Error ? err.message : 'błąd'}).`,
        hint: 'Sieć blokuje połączenia WebSocket do serwera sygnalizacji (typowo: firmowe Wi‑Fi, VPN, filtr rodzicielski). Spróbuj innej sieci — np. hotspotu z telefonu.',
      });
    }
  }

  /* 3. STUN (ta sama sieć / adres publiczny) ---------------------------------- */
  report({ id: 'stun', label: 'STUN (adres publiczny)', status: 'running', detail: 'zbieram kandydatów…' });
  const stun = await probeIce(STUN_SERVERS, 8000);
  const srflx = stun.kinds.get('srflx');
  const hostCandidates = stun.kinds.get('host');
  if (srflx !== undefined) {
    push({ id: 'stun', label: 'STUN (adres publiczny)', status: 'ok', detail: `Publiczny adres wykryty w ${ms(srflx)}.` });
  } else if (hostCandidates !== undefined) {
    push({
      id: 'stun', label: 'STUN (adres publiczny)', status: 'warn',
      detail: 'Brak odpowiedzi serwerów STUN — wykryto tylko adresy lokalne.',
      hint: 'Połączenie zadziała, gdy komputer i telefon są w tej samej sieci Wi‑Fi. Dla różnych sieci potrzebny jest działający STUN/TURN.',
    });
  } else {
    push({
      id: 'stun', label: 'STUN (adres publiczny)', status: 'fail',
      detail: 'Nie udało się zebrać żadnych kandydatów sieciowych.',
      hint: 'Sprawdź, czy komputer ma w ogóle dostęp do internetu.',
    });
  }

  /* 4. TURN (przekaźnik dla różnych sieci) ------------------------------------ */
  report({ id: 'turn', label: 'TURN (przekaźnik)', status: 'running', detail: 'pytam przekaźnik o miejsce…' });
  const turn = await probeIce(turnServers(), 9000);
  const relay = turn.kinds.get('relay');
  if (relay !== undefined) {
    push({ id: 'turn', label: 'TURN (przekaźnik)', status: 'ok', detail: `Przekaźnik gotowy w ${ms(relay)}.` });
  } else {
    push({
      id: 'turn', label: 'TURN (przekaźnik)', status: 'warn',
      detail: 'Darmowy przekaźnik nie odpowiedział.',
      hint: 'Gdy telefon jest w innej sieci niż komputer (np. LTE), połączenie może się nie udać. Najpewniejsze rozwiązanie: ta sama sieć Wi‑Fi.',
    });
  }

  return results;
}
