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

interface IceProbe { kinds: Map<string, number>; candidates: string[]; error?: string; }

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

async function probeIce(iceServers: RTCIceServer[], waitMs: number): Promise<IceProbe> {
  const kinds = new Map<string, number>();
  const candidates: string[] = [];
  let pc: RTCPeerConnection | null = null;
  let probeError: string | undefined;
  try {
    pc = new RTCPeerConnection({ iceServers });
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
  // Główna próba — pełna lista STUN
  let stun = await probeIce(STUN_SERVERS, 10_000);
  let srflx = stun.kinds.get('srflx');
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
    push({ id: 'stun', label: 'STUN (adres publiczny)', status: 'ok', detail: `Publiczny adres wykryty w ${ms(srflx)}.` });
  } else if (hostCandidates !== undefined) {
    // Mamy host, ale nie srflx — typowo firewall blokuje UDP 19302/3478
    push({
      id: 'stun', label: 'STUN (adres publiczny)', status: 'warn',
      detail: 'Brak odpowiedzi serwerów STUN — wykryto tylko adresy lokalne.',
      hint: 'Połączenie zadziała, gdy komputer i telefon są w tej samej sieci Wi‑Fi. Dla różnych sieci potrzebny jest działający STUN/TURN. Jeśli jesteś w firmowej/VPN — spróbuj hotspotu z telefonu.',
    });
  } else {
    // Ani host ani srflx — nawet lokalne kandydaty nie działają (mDNS wyłączone, VPN blokuje, brak uprawnień)
    // Sprawdź, czy kandydaci zawierają .local (mDNS ukryte)
    const hasMdns = [...stun.candidates, ...(localProbe?.candidates ?? [])].some(c => c.includes('.local'));
    if (hasMdns) {
      push({
        id: 'stun', label: 'STUN (adres publiczny)', status: 'warn',
        detail: 'Wykryto lokalne kandydaty mDNS (.local) — przeglądarka ukrywa adresy dla prywatności.',
        hint: 'To normalne w Chrome/Firefox. Połączenie w tej samej sieci Wi‑Fi powinno działać mimo tego komunikatu.',
      });
    } else {
      const errPart = stun.error ? ` (${stun.error})` : '';
      const localErr = localProbe?.error ? ` / lokalnie: ${localProbe.error}` : '';
      push({
        id: 'stun', label: 'STUN (adres publiczny)', status: 'fail',
        detail: `Nie udało się zebrać żadnych kandydatów sieciowych${errPart}${localErr}.`,
        hint: 'Wygląda na to, że przeglądarka całkowicie zablokowała WebRTC — sprawdź VPN, zaporę, tryb prywatny/incognito, lub spróbuj w Chrome/Edge/Firefox bez rozszerzeń blokujących. Sprawdź też, czy masz dostęp do internetu.',
      });
    }
  }

  /* 4. TURN (przekaźnik dla różnych sieci) ------------------------------------ */
  report({ id: 'turn', label: 'TURN (przekaźnik)', status: 'running', detail: 'pytam przekaźnik o miejsce…' });
  const turn = await probeIce(turnServers(), 12_000);
  const relay = turn.kinds.get('relay');
  // Czasem TURN zwraca prflx zamiast relay gdy jest za symetrycznym NAT — traktuj jako częściowy sukces
  const prflx = turn.kinds.get('prflx');
  if (relay !== undefined) {
    push({ id: 'turn', label: 'TURN (przekaźnik)', status: 'ok', detail: `Przekaźnik gotowy w ${ms(relay)}.` });
  } else if (prflx !== undefined) {
    push({
      id: 'turn', label: 'TURN (przekaźnik)', status: 'warn',
      detail: `Wykryto kandydata prflx w ${ms(prflx)}, ale brak relay — NAT może być restrykcyjny.`,
      hint: 'Połączenie może działać w tej samej sieci Wi‑Fi, ale między różnymi sieciami (LTE) może wymagać pełnego TURN. Spróbuj przełączyć oba urządzenia na tę samą sieć.',
    });
  } else {
    // Jeśli mamy przynajmniej srflx/host, TURN nie jest krytyczny dla tej samej sieci
    const hasAny = turn.kinds.size > 0;
    if (hasAny) {
      push({
        id: 'turn', label: 'TURN (przekaźnik)', status: 'warn',
        detail: `Darmowy przekaźnik nie odpowiedział — wykryto jednak ${[...turn.kinds.keys()].join(', ')}.`,
        hint: 'Gdy telefon jest w innej sieci niż komputer (np. LTE), połączenie może się nie udać. Najpewniejsze rozwiązanie: ta sama sieć Wi‑Fi.',
      });
    } else {
      push({
        id: 'turn', label: 'TURN (przekaźnik)', status: 'warn',
        detail: 'Darmowy przekaźnik nie odpowiedział.',
        hint: 'Gdy telefon jest w innej sieci niż komputer (np. LTE), połączenie może się nie udać. Najpewniejsze rozwiązanie: ta sama sieć Wi‑Fi. Darmowe przekaźniki bywają przeciążone — spróbuj ponownie za chwilę.',
      });
    }
  }

  return results;
}
