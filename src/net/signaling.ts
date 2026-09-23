/**
 * Konfiguracja łączenia: serwer sygnalizacji (PeerJS) + serwery ICE (STUN/TURN).
 *
 * Dlaczego osobny plik: łączność to najczęstsze źródło problemów w tej grze,
 * więc cała „polityka” sieciowa jest w jednym miejscu (host i telefon używają
 * dokładnie tych samych ustawień).
 */
import type { PeerOptions } from 'peerjs';
import { hmacSha1, toBase64 } from './crypto';

/* ------------------------------------------------------------------ */
/* Serwer sygnalizacji (broker, który pomaga dwóm urządzeniom się spotkać) */
/* ------------------------------------------------------------------ */

export interface SignalingConfig {
  id: string;
  /** Etykieta pokazywana w UI. */
  label: string;
  /** Puste = oficjalna chmura PeerJS (0.peerjs.com). */
  host?: string;
  port?: number;
  path?: string;
  key?: string;
  secure?: boolean;
}

export const CLOUD_SIGNALING: SignalingConfig = { id: 'cloud', label: 'PeerJS Cloud' };

/** Publiczny serwer PeerJS ma chwile słabości — warto mieć pod ręką własny (`?srv=host:port/ścieżka`). */
export const LS_SIGNALING = 'sf_signaling';

export function parseSignaling(raw: string): SignalingConfig | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  // `?srv=cloud` = wróć do chmury PeerJS (przydatne, gdy zapisany serwer przestał działać).
  if (/^(cloud|default|peerjs)$/i.test(trimmed)) return CLOUD_SIGNALING;
  const secure = !/^(ws|http):\/\//i.test(trimmed);

  let s = trimmed.replace(/^[a-z]+:\/\//i, '');
  let key = 'peerjs';
  const hash = s.indexOf('#');
  if (hash >= 0) {
    key = s.slice(hash + 1).trim() || 'peerjs';
    s = s.slice(0, hash);
  }

  let path = '/';
  const slash = s.indexOf('/');
  if (slash >= 0) {
    path = s.slice(slash).replace(/\/+$/, '') || '/';
    if (!path.endsWith('/')) path += '/';
    s = s.slice(0, slash);
  }

  let port = secure ? 443 : 80;
  const colon = s.lastIndexOf(':');
  if (colon > 0) {
    const parsed = Number(s.slice(colon + 1));
    if (Number.isFinite(parsed) && parsed > 0 && parsed < 65536) {
      port = parsed;
      s = s.slice(0, colon);
    }
  }

  const host = s.trim();
  if (!host) return null;
  return { id: `custom:${host}:${port}`, label: `${host}:${port}`, host, port, path, key, secure };
}

/**
 * Serwer wskazany przez `?srv=` (albo zapisany wcześniej w pamięci telefonu).
 * Ułatwia to pracę, gdy chmura PeerJS jest niedostępna — można wtedy wskazać
 * własny PeerServer.
 */
export function signalingFromLocation(): SignalingConfig {
  try {
    const search = new URLSearchParams(location.search.replace(/^\?/, ''));
    const hash = location.hash.replace(/^#/, '');
    const tail = hash.includes('&') ? hash.slice(hash.indexOf('&') + 1) : '';
    const hashParams = new URLSearchParams(tail);

    const raw = (search.get('srv') ?? hashParams.get('srv') ?? '').trim();
    if (raw) {
      const cfg = parseSignaling(raw);
      if (cfg) {
        try { localStorage.setItem(LS_SIGNALING, raw); } catch { /* ignore */ }
        return cfg;
      }
    }
    if (search.has('srv') || hashParams.has('srv')) {
      // jawnie wyczyszczone (`?srv=`) => wracamy do chmury
      try { localStorage.removeItem(LS_SIGNALING); } catch { /* ignore */ }
      return CLOUD_SIGNALING;
    }
    const saved = (localStorage.getItem(LS_SIGNALING) ?? '').trim();
    const cfg = parseSignaling(saved);
    if (cfg) return cfg;
  } catch { /* ignore */ }
  return CLOUD_SIGNALING;
}

/* ------------------------------------------------------------------ */
/* ICE: STUN (znajdź publiczny adres) + TURN (przekaźnik awaryjny)     */
/* ------------------------------------------------------------------ */

/** STUN wystarcza, gdy komputer i telefon są w tej samej sieci (Wi‑Fi/hotspot). */
export const STUN_SERVERS: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302', 'stun:stun3.l.google.com:19302', 'stun:stun4.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.nextcloud.com:443' },
];

/**
 * Produkcyjny TURN można podać podczas budowania aplikacji:
 *
 *   VITE_TURN_URLS="turn:turn.example.com:3478,turns:turn.example.com:5349"
 *   VITE_TURN_USERNAME="..."
 *   VITE_TURN_CREDENTIAL="..."
 *
 * Dane TURN z definicji trafiają do przeglądarki (WebRTC musi je znać), dlatego
 * najlepiej używać krótkotrwałego konta lub konta z limitem transferu.
 */
const CONFIGURED_TURN_URLS = (import.meta.env.VITE_TURN_URLS ?? '')
  .split(/[\s,]+/)
  .map((url: string) => url.trim())
  .filter((url: string) => /^(turn|turns):/i.test(url));
const CONFIGURED_TURN_USERNAME = (import.meta.env.VITE_TURN_USERNAME ?? '').trim();
const CONFIGURED_TURN_CREDENTIAL = (import.meta.env.VITE_TURN_CREDENTIAL ?? '').trim();

export function hasConfiguredTurn(): boolean {
  return CONFIGURED_TURN_URLS.length > 0;
}

/**
 * Awaryjny, współdzielony przekaźnik Open Relay Project (Metered).
 * Współdzielona usługa nie gwarantuje dostępności. Generujemy krótkotrwałe
 * dane logowania w schemacie `use-auth-secret` (username = czas wygaśnięcia,
 * credential = base64(HMAC-SHA1(sekret, username))).
 */
const OPEN_RELAY_HOST = 'staticauth.openrelay.metered.ca';
const OPEN_RELAY_SECRET = 'openrelayprojectsecret';
// Dodatkowy host Open Relay (alias używany przez część klientów / nowsza infrastruktura Metered)
const OPEN_RELAY_FALLBACK_HOST = 'relay.metered.ca';

/* ------------------------------------------------------------------ */
/* Własny TURN bez przebudowywania: `?turn=` (jak `?srv=`)            */
/* ------------------------------------------------------------------ */

const LS_TURN = 'sf_turn';

export interface TurnOverride {
  urls: string[];
  username?: string;
  credential?: string;
}

function isValidTurnUrl(url: string): boolean {
  return /^(turn|turns):/i.test(url);
}

/**
 * Własny TURN podany adresem strony:
 * `?turn=turn:turn.example.com:3478,turns:turn.example.com:5349&turnUser=…&turnPass=…`
 *
 * Ustawienie (jak `?srv=`) zapamiętuje się na urządzeniu, a kod QR przenosi je
 * automatycznie na telefony (QR zawiera pełny adres z parametrami).
 */
export function turnOverrideFromLocation(): TurnOverride | null {
  try {
    const search = new URLSearchParams(location.search.replace(/^\?/, ''));
    const hash = location.hash.replace(/^#/, '');
    const tail = hash.includes('&') ? hash.slice(hash.indexOf('&') + 1) : '';
    const hashParams = new URLSearchParams(tail);
    const get = (k: string) => (search.get(k) ?? hashParams.get(k));

    const raw = (get('turn') ?? '').trim();
    if (raw) {
      const urls = raw.split(/[\s,]+/).map((u) => u.trim()).filter(isValidTurnUrl);
      const user = (get('turnUser') ?? '').trim();
      const pass = (get('turnPass') ?? '').trim();
      if (urls.length > 0) {
        const ov: TurnOverride = { urls };
        if (user) ov.username = user;
        if (pass) ov.credential = pass;
        try { localStorage.setItem(LS_TURN, JSON.stringify(ov)); } catch { /* ignore */ }
        return ov;
      }
    }
    if (search.has('turn') || hashParams.has('turn')) {
      // jawnie wyczyszczone (`?turn=`) => wracamy do domyślnej listy
      try { localStorage.removeItem(LS_TURN); } catch { /* ignore */ }
      return null;
    }
    const saved = (localStorage.getItem(LS_TURN) ?? '').trim();
    if (saved) {
      const ov = JSON.parse(saved) as { urls?: unknown; username?: unknown; credential?: unknown };
      const urls = Array.isArray(ov.urls)
        ? ov.urls.filter((u): u is string => typeof u === 'string' && isValidTurnUrl(u))
        : typeof ov.urls === 'string'
          ? ov.urls.split(/[\s,]+/).map((u) => u.trim()).filter(isValidTurnUrl)
          : [];
      if (urls.length > 0) {
        return {
          urls,
          username: typeof ov.username === 'string' ? ov.username : undefined,
          credential: typeof ov.credential === 'string' ? ov.credential : undefined,
        };
      }
    }
  } catch { /* ignore */ }
  return null;
}

export function hasTurnOverride(): boolean {
  return turnOverrideFromLocation() !== null;
}

export function turnServers(ttlSeconds = 12 * 3600, nowMs = Date.now()): RTCIceServer[] {
  // 1) Własny TURN podany adresem (`?turn=`) — ma pierwszeństwo.
  const override = turnOverrideFromLocation();
  if (override) {
    const server: RTCIceServer = { urls: override.urls };
    if (override.username) server.username = override.username;
    if (override.credential) server.credential = override.credential;
    return [server];
  }

  // 2) TURN wbudowany w build (sekrety VITE_TURN_*).
  if (hasConfiguredTurn()) {
    const configured: RTCIceServer = { urls: CONFIGURED_TURN_URLS };
    // Część prywatnych serwerów działa w zaufanej sieci bez uwierzytelniania.
    // Nie dopisuj pustych pól — Safari potrafi wtedy odrzucić cały wpis.
    if (CONFIGURED_TURN_USERNAME) configured.username = CONFIGURED_TURN_USERNAME;
    if (CONFIGURED_TURN_CREDENTIAL) configured.credential = CONFIGURED_TURN_CREDENTIAL;
    return [configured];
  }

  const username = String(Math.floor(nowMs / 1000) + ttlSeconds);
  const credential = toBase64(hmacSha1(OPEN_RELAY_SECRET, username));

  return [
    {
      urls: [
        `turn:${OPEN_RELAY_HOST}:443`,
        `turn:${OPEN_RELAY_HOST}:443?transport=tcp`,
        `turns:${OPEN_RELAY_HOST}:443`,
        `turns:${OPEN_RELAY_HOST}:443?transport=tcp`,
      ],
      username,
      credential,
    },
    {
      urls: [`turn:${OPEN_RELAY_HOST}:80`, `turn:${OPEN_RELAY_HOST}:80?transport=tcp`, `turns:${OPEN_RELAY_HOST}:80`],
      username,
      credential,
    },
    // Alias Metered (czasem odpowiada, gdy staticauth nie odpowiada)
    {
      urls: [`turn:${OPEN_RELAY_FALLBACK_HOST}:80`, `turn:${OPEN_RELAY_FALLBACK_HOST}:443`, `turn:${OPEN_RELAY_FALLBACK_HOST}:443?transport=tcp`, `turns:${OPEN_RELAY_FALLBACK_HOST}:443`],
      username,
      credential,
    },
    // Publiczne, statyczne konto Open Relay (u części osób wciąż działa).
    {
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
    },
    // Ostatni rzut: darmowy TURN bez rejestracji (dostępność niegwarantowana).
    {
      urls: ['turn:freestun.net:3478', 'turn:freestun.net:3478?transport=tcp'],
      username: 'free',
      credential: 'free',
    },
  ];
}

export function buildIceServers(nowMs = Date.now()): RTCIceServer[] {
  return [...STUN_SERVERS, ...turnServers(undefined, nowMs)];
}

/**
 * Gotowe opcje dla `new Peer(...)`.
 * `iceCandidatePoolSize` zbiera kandydatów zanim zacznie się negocjacja —
 * skraca to pierwsze połączenie o dobre kilkaset ms.
 */
export function buildPeerOptions(signaling: SignalingConfig = CLOUD_SIGNALING, nowMs = Date.now()): PeerOptions {
  const options: PeerOptions = {
    debug: 0,
    config: { iceServers: buildIceServers(nowMs), iceCandidatePoolSize: 4 },
  };
  if (signaling.host) {
    options.host = signaling.host;
    options.port = signaling.port ?? 443;
    options.path = signaling.path ?? '/';
    options.key = signaling.key ?? 'peerjs';
    options.secure = signaling.secure ?? true;
  }
  return options;
}
