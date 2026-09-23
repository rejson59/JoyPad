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
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

/**
 * Darmowy przekaźnik Open Relay Project (Metered).
 * Ich stary, „na sztywno” wpisany użytkownik działa już coraz rzadziej, dlatego
 * generujemy jednorazowe dane logowania w schemacie `use-auth-secret`
 * (username = czas wygaśnięcia, credential = base64(HMAC‑SHA1(sekret, username))).
 */
const OPEN_RELAY_HOST = 'staticauth.openrelay.metered.ca';
const OPEN_RELAY_SECRET = 'openrelayprojectsecret';

export function turnServers(ttlSeconds = 12 * 3600, nowMs = Date.now()): RTCIceServer[] {
  const username = String(Math.floor(nowMs / 1000) + ttlSeconds);
  const credential = toBase64(hmacSha1(OPEN_RELAY_SECRET, username));

  return [
    {
      urls: [`turn:${OPEN_RELAY_HOST}:443`, `turn:${OPEN_RELAY_HOST}:443?transport=tcp`, `turns:${OPEN_RELAY_HOST}:443`],
      username,
      credential,
    },
    {
      urls: [`turn:${OPEN_RELAY_HOST}:80?transport=tcp`],
      username,
      credential,
    },
    // Ostatnia deska ratunku: publiczne, statyczne konto Open Relay (u części osób wciąż działa).
    {
      urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turns:openrelay.metered.ca:443'],
      username: 'openrelayproject',
      credential: 'openrelayproject',
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
