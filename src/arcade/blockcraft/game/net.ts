/**
 * BlockCraft 2.10 „Gra razem” – multiplayer bez serwera.
 *
 * GitHub Pages to hosting statyczny, więc klasyczny serwer gry nie wchodzi w
 * grę. Zamiast niego mamy dwa transporty:
 *
 *  • `local` – `BroadcastChannel`: kilka kart/okien tej samej przeglądarki
 *    (albo dwóch przeglądarek na jednym komputerze przez tę samą stronę)
 *    widzi się w pokoju bez żadnej konfiguracji. Działa zawsze, także
 *    offline, i jest świetne do testów oraz do grania we dwoje przy jednym
 *    komputerze (dwa okna na dwóch monitorach).
 *
 *  • `p2p` – WebRTC z **ręcznym sygnalizowaniem**: gospodarz generuje kod
 *    zaproszenia, drugi gracz wkleja go i odsyła kod odpowiedzi. Nie ma
 *    żadnego serwera sygnalizacyjnego ani bazy danych – tylko publiczne
 *    serwery STUN do ustalenia adresów. Działa przez internet, o ile NAT nie
 *    jest symetryczny (bez TURN-a).
 *
 * Topologia jest gwiazdą: **gospodarz** jest punktem centralnym. Goście
 * wysyłają do niego zmiany bloków, pozycje i czat, a on przekazuje je dalej.
 * Dzięki temu kolejność zmian jest jedna, a goście nie muszą znać swoich
 * adresów.
 *
 * Świat jest deterministyczny (to samo ziarno = ten sam teren), więc przy
 * dołączaniu wysyłamy wyłącznie ziarno, tryb, czas, pogodę i **listę zmian
 * graczy** – nie całe chunki. To ta sama informacja, którą zapisuje plik
 * świata (`World.serializeMods`).
 */

import type { PlayerProfile } from './profile';

export type NetRole = 'host' | 'guest';
export type NetTransport = 'local' | 'p2p' | 'online';
export type NetStatus = 'connecting' | 'connected' | 'closed' | 'error';
export type NetWeather = 'clear' | 'rain';

export interface NetPlayer {
  id: string;
  name: string;
  /** 0–359: kolor ubrania awatara (stały dla gracza w sesji). */
  hue: number;
  /** Ping w ms; -1 = jeszcze nie zmierzony. */
  ping: number;
  /** Czy to ja (wygodne dla HUD). */
  self?: boolean;
  /** 2.12: identyfikator skórki (patrz `skins.ts`). */
  skin?: string;
}

/** Zmiana jednego bloku. Wersja `o` = nadświat, `n` = Nether. */
export interface NetEdit {
  x: number;
  y: number;
  z: number;
  id: number;
  /** Wymiar – gość i gospodarz muszą zmieniać ten sam świat. */
  d?: 'o' | 'n';
}

export interface WorldHandshake {
  seed: number;
  mode: 'survival' | 'creative';
  worldType: 'normal' | 'flat';
  name: string;
  time: number;
  day: number;
  weather: NetWeather;
  /** Zmiany bloków, które gracz zdążył zrobić przed dołączeniem gościa. */
  edits?: NetEdit[];
  /** Wymiar, w którym jest gospodarz (gość zaczyna tam samo). */
  dimension?: 'o' | 'n';
  /** Czy gospodarz ma już uruchomiony świat (gość czeka wtedy tylko na start). */
  started?: boolean;
  /** Pozycja gospodarza – gość pojawia się obok, a nie na środku spawnu. */
  spawn?: { x: number; y: number; z: number; d: 'o' | 'n' };
  /** 2.19: zapisany postęp gracza (serwer publiczny, „niewidzialna sesja”). */
  profile?: PlayerProfile;
}

/** 2.19: prośba o teleportację między graczami. */
export interface NetTeleport {
  kind: 'ask' | 'ok' | 'no';
  name: string;
  x?: number;
  y?: number;
  z?: number;
  d?: 'o' | 'n';
}

type Envelope = { from: string; to?: string; /** Gospodarz przekazuje dalej. */ relay?: boolean };

export type NetMessage =
  | ({ t: 'hello'; name: string; hue: number; skin?: string } & Envelope)
  | ({ t: 'welcome'; world: WorldHandshake; players: NetPlayer[] } & Envelope)
  | ({ t: 'peers'; players: NetPlayer[] } & Envelope)
  | ({ t: 'edits'; list: NetEdit[] } & Envelope)
  | ({
      t: 'pos';
      d: 'o' | 'n';
      x: number;
      y: number;
      z: number;
      yaw: number;
      pitch: number;
      /** Id bloku w ręce (do rąk awatara); brak = puste ręce. */
      held?: number;
      name: string;
      hue: number;
      /** 2.12: skórka gracza – widzą ją pozostali. */
      skin?: string;
    } & Envelope)
  | ({ t: 'chat'; name: string; text: string } & Envelope)
  | ({ t: 'state'; time: number; day: number; weather: NetWeather } & Envelope)
  | ({ t: 'start' } & Envelope)
  | ({ t: 'bye' } & Envelope)
  | ({ t: 'ping'; ts: number } & Envelope)
  | ({ t: 'tpa'; kind: 'ask' | 'ok' | 'no'; name: string; x?: number; y?: number; z?: number; d?: 'o' | 'n' } & Envelope)
  | ({ t: 'pong'; ts: number } & Envelope);

/** Transport tylko dostarcza tekst; cała logika siedzi w `NetSession`. */
export interface NetLink {
  send(data: string): void;
  close(): void;
  readonly connected: boolean;
  /** Krótki opis do UI, np. „2 kanały” albo „WebRTC”. */
  readonly label?: string;
}

const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz';

export function randomId(rand: () => number = Math.random): string {
  let out = 'p';
  for (let i = 0; i < 8; i++) out += ID_ALPHABET[Math.floor(rand() * ID_ALPHABET.length) % ID_ALPHABET.length];
  return out;
}

/** Kody pokojów: litery, cyfry i myślniki; reszta znika, długość 3–24. */
export function normalizeRoom(raw: string): string {
  const PL: Record<string, string> = { ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' };
  return String(raw ?? '')
    .toLowerCase()
    // Kody wpisuje się ręcznie (także na telefonie) – polskie znaki sprowadzamy
    // do łacińskich, a spacje i znaki specjalne do myślnika.
    .replace(/[ąćęłńóśźż]/g, (ch) => PL[ch] ?? ch)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24)
    .replace(/-+$/g, '');
}

/** Domyślny, „ładny” kod pokoju (czytelny na głos). */
export function makeRoomCode(rand: () => number = Math.random): string {
  const words = ['las', 'dom', 'wyspa', 'jaskinia', 'dol', 'gora', 'rzeka', 'pole', 'baza', 'port'];
  const w = words[Math.floor(rand() * words.length) % words.length];
  const n = 100 + Math.floor(rand() * 900);
  return `${w}-${n}`;
}

/** Dodaje gracza do listy tak, by „ja” zawsze był na początku. */
export function sortPlayers(players: NetPlayer[], selfId: string): NetPlayer[] {
  return players
    .map((p) => ({ ...p, self: p.id === selfId }))
    .sort((a, b) => {
    if (a.id === selfId) return -1;
    if (b.id === selfId) return 1;
    return a.name.localeCompare(b.name, 'pl');
  });
}

/** Kolejny wolny kolor awatara – nie powtarza się, dopóki jest miejsce. */
export function nextHue(players: NetPlayer[]): number {
  const used = new Set(players.map((p) => p.hue));
  for (let i = 0; i < 24; i++) {
    const hue = Math.round((i * 360) / 12) % 360;
    if (!used.has(hue)) return hue;
  }
  return Math.floor(Math.random() * 360);
}

/** Bezpieczne parsowanie ramki; śmieci z sieci nie mogą wywrócić gry. */
export function decodeMessage(raw: string): NetMessage | null {
  // Migawka świata z 20 000 zmian bloków to ~1 MB JSON-a – limit musi to
  // obejmować, ale nadal odcinać śmieci.
  if (typeof raw !== 'string' || raw.length > 2_000_000) return null;
  try {
    const data = JSON.parse(raw) as NetMessage;
    if (!data || typeof data !== 'object' || typeof (data as { t?: unknown }).t !== 'string') return null;
    if (typeof (data as { from?: unknown }).from !== 'string') return null;
    return data;
  } catch {
    return null;
  }
}

/** Ile pozycji na sekundę wysyła gracz (wystarcza do płynnych awatarów). */
export const POS_HZ = 10;
/** Co ile sekund gospodarz rozsyła czas i pogodę. */
export const STATE_EVERY = 4;
/** Po tylu sekundach ciszy uznajemy gracza za rozłączonego. */
export const PEER_TIMEOUT = 12;
/** Limit zapamiętanych zmian w migawce dla nowych graczy. */
export const MAX_SNAPSHOT_EDITS = 20_000;

/** Pozycja gracza wysyłana do innych (10 razy na sekundę). */
export interface NetPos {
  d: 'o' | 'n';
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  held?: number;
  name: string;
  hue: number;
  /** 2.12: skórka gracza. */
  skin?: string;
}

/**
 * Wspólny interfejs sesji dla silnika. `NetSession` obsługuje pokoje lokalne
 * i P2P, a `PublicServer` (online.ts) – publiczny serwer Supabase. Silnik gra
 * tak samo w obu przypadkach, więc nie musi znać transportu.
 */
export interface NetLike {
  readonly id: string;
  readonly role: NetRole;
  readonly transport: NetTransport;
  /** Czy to publiczny serwer (inna obsługa czasu, pogody i zapisu). */
  readonly public: boolean;
  name: string;
  /** 2.12: skórka wysyłana pozostałym graczom (pusta = domyślna). */
  skin?: string;
  /** 2.12: odświeża wpis gracza (np. po zmianie skórki w trakcie gry). */
  updatePresence?: () => void;
  world: WorldHandshake | null;
  players: NetPlayer[];
  status: NetStatus;
  ping: number;

  onMessage?: (m: NetMessage) => void;
  onPeers?: (players: NetPlayer[]) => void;
  onStatus?: (status: NetStatus, error?: string | null) => void;
  onReady?: (world: WorldHandshake) => void;
  onChat?: (name: string, text: string) => void;
  onStart?: () => void;

  /** Tylko transporty tekstowe (lokalny/P2P); serwer publiczny go nie ma. */
  ingest?(raw: string): void;
  setWorld(patch: Partial<WorldHandshake>): void;
  sendEdits(list: NetEdit[]): void;
  sendPos(p: NetPos): void;
  pushState(state: { time: number; day: number; weather: NetWeather }): void;
  /** Nagła zmiana pogody (gospodarz pokoju); serwer publiczny jej nie potrzebuje. */
  sendState?(state: { time: number; day: number; weather: NetWeather }): void;
  say(text: string): void;
  tick(): void;
  close(reason?: string): void;
  /** 2.19: zapis postępu gracza (tylko serwer publiczny). */
  saveProfile?(profile: PlayerProfile): void;
  /** 2.19: prośba o teleportację do innego gracza (id odbiorcy). */
  sendTeleport?(to: string, t: NetTeleport): void;
}

// ------------------------------------------------ zegar serwera publicznego

/** Długość doby w silniku (sekundy) – `time` rośnie o dt/600. */
export const DAY_SECONDS = 600;
/** Stała epoka: dzięki niej wszyscy widzą tę samą porę dnia i ten sam dzień. */
const CLOCK_EPOCH = Date.UTC(2026, 0, 1);
/** Co ile zmienia się pogoda na serwerze publicznym (ms). */
const WEATHER_BUCKET_MS = 10 * 60 * 1000;

function hash32(n: number): number {
  let h = n | 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

/** Pora dnia 0–1 – identyczna u każdego gracza, bez serwerowego zegara. */
export function publicTime(now: number = Date.now()): number {
  const elapsed = Math.max(0, now - CLOCK_EPOCH) / 1000;
  return (elapsed / DAY_SECONDS) % 1;
}

/** Numer dnia od startu serwera (zaczyna się od 1). */
export function publicDay(now: number = Date.now()): number {
  const elapsed = Math.max(0, now - CLOCK_EPOCH) / 1000;
  return 1 + Math.floor(elapsed / DAY_SECONDS);
}

/**
 * Pogoda z tego samego koszyka czasu u wszystkich. Deszcz wypada średnio raz
 * na pięć okienek – bez serwera nie ma kto „rzucić kostką”, a losowanie u
 * każdego klienta dałoby różne niebo.
 */
export function publicWeather(now: number = Date.now()): NetWeather {
  const bucket = Math.floor(Math.max(0, now - CLOCK_EPOCH) / WEATHER_BUCKET_MS);
  return hash32(bucket * 31 + 7) % 5 === 0 ? 'rain' : 'clear';
}

/**
 * Sesja sieciowa: protokół, obsada graczy, przekazywanie wiadomości.
 * Nie zna się na Three.js ani na React – dzięki temu da się ją przetestować
 * w Node bez przeglądarki (testy podstawiają własny `NetLink`).
 */
export class NetSession implements NetLike {
  readonly id: string;
  readonly role: NetRole;
  readonly transport: NetTransport;
  /** Pokój lokalny/P2P nigdy nie jest publicznym serwerem. */
  readonly public = false;
  name: string;
  /** 2.12: skórka gracza (ustawia silnik przy starcie sesji). */
  skin = '';
  world: WorldHandshake | null = null;
  players: NetPlayer[] = [];
  status: NetStatus = 'connecting';
  error: string | null = null;
  ping = -1;

  onMessage?: (m: NetMessage) => void;
  onPeers?: (players: NetPlayer[]) => void;
  onStatus?: (status: NetStatus, error?: string | null) => void;
  /** Wywoływane, gdy rola/świat są już znane (gość po `welcome`). */
  onReady?: (world: WorldHandshake) => void;
  onChat?: (name: string, text: string) => void;
  /** Gospodarz uruchomił świat (gość może wejść). */
  onStart?: () => void;

  private link: NetLink | null = null;
  /** Gospodarz: id → ostatnio widziany czas (ms) i kanał. */
  private peers = new Map<string, { name: string; hue: number; seen: number; ping: number; skin: string }>();
  private welcomed = new Map<string, number>();
  /** Gość: id gospodarza (z `welcome`) – po jego `bye` kończymy grę. */
  private hostId: string | null = null;
  private edits = new Map<string, NetEdit>();
  private heard = 0;
  private lastHello = 0;
  private lastPing = 0;
  private lastState = 0;
  private startedAt = 0;
  private closed = false;
  private unsub: (() => void) | null = null;

  constructor(opts: { role: NetRole; name: string; transport: NetTransport; id?: string }) {
    this.role = opts.role;
    this.name = (opts.name || 'Gracz').slice(0, 20);
    this.transport = opts.transport;
    this.id = opts.id ?? randomId();
  }

  // ------------------------------------------------------------- cykl życia

  /** Podpina transport. `link` może być gotowy od razu albo połączyć się później. */
  attach(link: NetLink) {
    if (this.closed) {
      link.close();
      return;
    }
    this.link = link;
    this.startedAt = Date.now();
    if (this.role === 'host') {
      this.peers.set(this.id, { name: this.name, hue: 0, seen: Date.now(), ping: 0, skin: this.skin });
      this.refreshRoster();
      this.setStatus('connected');
    } else {
      this.sendHello(true);
      this.setStatus('connecting');
    }
  }

  /** Wygodny start: tworzy transport i od razu podpina. */
  async connect(factory: () => Promise<NetLink> | NetLink) {
    try {
      const link = await factory();
      this.attach(link);
      return this;
    } catch (e) {
      this.fail(e instanceof Error ? e.message : 'Nie udało się połączyć');
      return this;
    }
  }

  private fail(message: string) {
    this.error = message;
    this.setStatus('error', message);
    this.link?.close();
  }

  private setStatus(s: NetStatus, error: string | null = this.error) {
    if (this.status === s && this.error === error) return;
    this.status = s;
    this.error = error;
    this.onStatus?.(s, error);
  }

  close(reason?: string) {
    if (this.closed) return;
    if (this.link?.connected) {
      try {
        this.link.send(JSON.stringify({ t: 'bye', from: this.id, to: '*' }));
      } catch {
        /* kanał mógł już paść */
      }
    }
    this.closed = true;
    this.unsub?.();
    this.link?.close();
    this.setStatus('closed', reason ?? null);
  }

  // ----------------------------------------------------------------- wysyłka

  private raw(m: NetMessage) {
    const link = this.link;
    if (!link || !link.connected) return;
    try {
      link.send(JSON.stringify(m));
    } catch {
      /* kanał mógł się zamknąć między sprawdzeniem a wysyłką */
    }
  }

  /**
   * Wysyła wiadomość i (domyślnie) od razu ją stosuje u siebie – dzięki temu
   * nadawca widzi własną zmianę bez czekania na echo z sieci.
   */
  send(m: NetMessage, local = true) {
    if (this.closed) return;
    if (!m.to) m.to = this.role === 'host' ? '*' : 'host';
    this.raw(m);
    if (local) this.receive(m);
  }

  sendHello(force = false) {
    const now = Date.now();
    if (!force && now - this.lastHello < 700) return;
    this.lastHello = now;
    this.raw({ t: 'hello', from: this.id, name: this.name, hue: this.myHue(), skin: this.skin, to: 'host' });
  }

  /** 2.12: zmiana skórki w trakcie sesji – rozgłaszamy nowy wygląd. */
  updatePresence() {
    if (this.closed) return;
    if (this.role === 'host') this.refreshRoster();
    else this.sendHello(true);
  }

  private myHue(): number {
    if (this.role === 'host') return 0;
    // Uwaga: nie wolno tu wołać `roster()` – roster uzupełnia brakujący wpis
    // właśnie przez `myHue()` (wcześniej kończyło się to przepełnieniem stosu).
    const me = this.players.find((p) => p.id === this.id);
    if (me) return me.hue;
    let h = 0;
    for (const ch of this.id) h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0;
    return Math.abs(h) % 360;
  }

  // --------------------------------------------------------------- odbiór

  /** Wejście z transportu. */
  ingest(raw: string) {
    const m = decodeMessage(raw);
    if (!m) return;
    this.handle(m, false);
  }

  /** Wejście „lokalne” (własna wiadomość po `send`). */
  private receive(m: NetMessage) {
    this.handle(m, true);
  }

  private handle(m: NetMessage, local: boolean) {
    // Wiadomości zaadresowane do kogoś innego nas nie dotyczą. Własnej
    // wiadomości nie filtrujemy – `send()` stosuje ją u siebie od razu.
    // 2.19: gospodarz musi zobaczyć cudzą prośbę o teleportację, żeby ją
    // przekazać adresatowi (sam jej u siebie nie pokaże).
    if (
      !local &&
      m.to &&
      m.to !== '*' &&
      m.to !== this.id &&
      !(m.to === 'host' && this.role === 'host') &&
      !(m.t === 'tpa' && this.role === 'host')
    )
      return;
    if (m.from === this.id && !local && m.t !== 'hello') return;

    switch (m.t) {
      case 'hello': {
        if (this.role !== 'host') return;
        if (m.from === this.id) return;
        this.heard++;
        const known = this.peers.get(m.from);
        const hue = known?.hue ?? m.hue ?? nextHue(this.roster());
        const now = Date.now();
        this.peers.set(m.from, {
          name: (m.name || 'Gracz').slice(0, 20),
          hue,
          skin: typeof m.skin === 'string' ? m.skin.slice(0, 24) : known?.skin ?? '',
          seen: now,
          ping: known?.ping ?? -1,
        });
        // Gość ponawia `hello`, dopóki nie dostanie odpowiedzi – migawkę
        // wysyłamy najwyżej raz na 1,5 s na gracza, żeby nie spamować.
        const last = this.welcomed.get(m.from) ?? 0;
        if (!known || now - last > 1500) {
          this.welcomed.set(m.from, now);
          this.raw({ t: 'welcome', from: this.id, to: m.from, world: this.snapshot(), players: this.roster() });
        }
        this.refreshRoster();
        return;
      }
      case 'welcome': {
        if (this.role === 'host') return;
        if (m.from === this.id) return;
        const world = sanitizeWorld(m.world);
        if (!world) return;
        this.hostId = m.from;
        this.world = world;
        this.players = sortPlayers((m.players ?? []).map((p) => ({ ...p, self: p.id === this.id })), this.id);
        // Host nie zna jeszcze naszego koloru – uzupełniamy własny wpis.
        if (!this.players.some((p) => p.id === this.id)) {
          this.players.push({ id: this.id, name: this.name, hue: this.myHue(), ping: -1, self: true });
        }
        this.setStatus('connected');
        this.onPeers?.(this.players);
        this.onReady?.(world);
        if (world.started) this.onStart?.();
        return;
      }
      case 'peers': {
        if (this.role === 'host') return;
        this.players = sortPlayers((m.players ?? []).map((p) => ({ ...p, self: p.id === this.id })), this.id);
        const self = this.players.find((p) => p.id === this.id);
        if (self) this.name = self.name;
        this.onPeers?.(this.players);
        return;
      }
      case 'edits': {
        if (!local && this.role === 'host') this.remember(m.list);
        if (this.role === 'host' && !local) this.relay(m, m.from);
        this.onMessage?.(m);
        return;
      }
      case 'pos': {
        if (!local && this.role === 'host') {
          const p = this.peers.get(m.from);
          if (p) {
            p.seen = Date.now();
            if (m.name) p.name = m.name;
          }
          this.relay(m, m.from);
        }
        this.onMessage?.(m);
        return;
      }
      case 'chat': {
        if (!local) {
          if (this.role === 'host') this.relay(m, m.from);
          this.onChat?.((m.name || 'Gracz').slice(0, 20), String(m.text ?? '').slice(0, 240));
        }
        this.onMessage?.(m);
        return;
      }
      case 'tpa': {
        // 2.19: prośby o teleportację przekazuje gospodarz. Adresat siedzi
        // w `to`, więc relay nie może go nadpisać gwiazdką – inaczej każdy
        // gość dostawałby cudze prośby.
        if (!local && this.role === 'host') this.raw({ ...m, from: m.from });
        if (local) return;
        if (m.to && m.to !== '*' && m.to !== this.id) return;
        this.onMessage?.(m);
        return;
      }
      case 'state': {
        if (this.role !== 'guest' || local) return;
        this.onMessage?.(m);
        return;
      }
      case 'ping': {
        // Odpowiadamy tylko na ping do nas (lub broadcast od gospodarza).
        if (m.from === this.id) return;
        this.raw({ t: 'pong', from: this.id, to: m.from, ts: m.ts });
        if (this.role === 'host') {
          const p = this.peers.get(m.from);
          if (p) p.seen = Date.now();
        }
        return;
      }
      case 'pong': {
        if (m.to !== this.id) return;
        const rtt = Math.max(0, Date.now() - m.ts);
        this.ping = rtt;
        if (this.role === 'host') {
          const p = this.peers.get(m.from);
          if (p) { p.ping = rtt; p.seen = Date.now(); }
          this.refreshRoster();
        } else {
          this.players = this.players.map((p) => (p.id === this.id ? { ...p, ping: rtt } : p));
          this.onPeers?.(this.players);
        }
        return;
      }
      case 'start': {
        if (this.role !== 'guest' || local) return;
        if (this.world) this.world.started = true;
        this.onStart?.();
        return;
      }
      case 'bye': {
        if (m.from === this.id) return;
        if (this.role === 'host') {
          if (this.peers.delete(m.from)) {
            this.refreshRoster();
            // Reszta gości też musi się dowiedzieć, że ktoś wyszedł.
            this.relay(m, m.from);
            this.onMessage?.(m);
          }
        } else {
          // Inny gość może też wyjść – wtedy tylko gasimy jego awatar.
          if (this.hostId === m.from) this.setStatus('error', 'Gospodarz zakończył grę.');
          this.onMessage?.(m);
        }
        return;
      }
      default:
        return;
    }
  }

  /** Gospodarz: przekazuje wiadomość gościa pozostałym gościom. */
  private relay(m: NetMessage, except: string) {
    if (this.role !== 'host') return;
    this.raw({ ...m, to: '*', from: except });
  }

  private remember(list: NetEdit[]) {
    for (const e of list) {
      if (!Number.isFinite(e.x) || !Number.isFinite(e.y) || !Number.isFinite(e.z)) continue;
      const key = `${e.d ?? 'o'}:${e.x},${e.y},${e.z}`;
      this.edits.set(key, { x: e.x, y: e.y, z: e.z, id: e.id, d: e.d ?? 'o' });
      if (this.edits.size > MAX_SNAPSHOT_EDITS) {
        const first = this.edits.keys().next();
        if (!first.done) this.edits.delete(first.value);
      }
    }
  }

  /** Migawka dla nowego gościa – bez terenu, tylko to, co się zmieniło. */
  snapshot(): WorldHandshake {
    return {
      ...(this.world ?? {
        seed: 0,
        mode: 'survival' as const,
        worldType: 'normal' as const,
        name: 'Świat',
        time: 0.25,
        day: 1,
        weather: 'clear' as const,
      }),
      edits: [...this.edits.values()],
    };
  }

  /** Aktualizuje dane świata, które gospodarz wysyła nowym graczom. */
  setWorld(patch: Partial<WorldHandshake>) {
    // Bez `snapshot()`: kopiowanie listy edytów przy każdej zmianie pory dnia
    // byłoby O(n). Pole `edits` i tak jest przeliczane dopiero przy wysyłce.
    this.world = {
      ...(this.world ?? {
        seed: 0,
        mode: 'survival' as const,
        worldType: 'normal' as const,
        name: 'Świat',
        time: 0.25,
        day: 1,
        weather: 'clear' as const,
      }),
      ...patch,
    };
  }

  // ------------------------------------------------------------------- obsada

  roster(): NetPlayer[] {
    const list: NetPlayer[] = [...this.peers.entries()].map(([id, p]) => ({
      id,
      name: id === this.id ? this.name : p.name,
      hue: p.hue,
      ping: p.ping,
      self: id === this.id,
      // 2.12: własny wpis w `peers` powstaje przy `attach`, więc skórka
      // zmieniona później musi być brana z bieżącego pola, nie z kopii.
      skin: id === this.id ? this.skin : p.skin,
    }));
    if (!list.some((p) => p.id === this.id)) {
      list.push({ id: this.id, name: this.name, hue: this.myHue(), ping: this.ping, self: true, skin: this.skin });
    }
    return sortPlayers(list, this.id);
  }

  private refreshRoster() {
    if (this.role !== 'host') return;
    const players = this.roster();
    this.players = players;
    this.raw({ t: 'peers', from: this.id, players });
    this.onPeers?.(players);
  }

  /** Ile osób jest w sesji (łącznie z nami). */
  get size(): number {
    return this.role === 'host' ? this.peers.size : Math.max(1, this.players.length);
  }

  // ------------------------------------------------------------------ zegar

  /** Wywoływane z pętli gry (albo z testów) – raz na klatkę. */
  tick(now = Date.now()) {
    if (this.closed || this.status === 'closed') return;
    if (this.role === 'guest' && this.status !== 'connected') {
      this.sendHello();
      // BroadcastChannel nie ma zdarzenia „połączenia” – brak odpowiedzi
      // gospodarza w ciągu 6 s to najprawdopodobniej zły kod pokoju.
      if (this.startedAt && now - this.startedAt > 6000) {
        this.fail('Nie znaleziono gospodarza pokoju. Sprawdź kod i spróbuj ponownie.');
      }
    }
    if (this.status !== 'connected') return;

    if (this.role === 'host') {
      let changed = false;
      for (const [id, p] of this.peers) {
        if (id === this.id) continue;
        if (now - p.seen > PEER_TIMEOUT * 1000) {
          this.peers.delete(id);
          changed = true;
          this.onMessage?.({ t: 'bye', from: id });
        }
      }
      if (changed) this.refreshRoster();
    }

    if (now - this.lastPing >= 1000) {
      this.lastPing = now;
      this.send({ t: 'ping', from: this.id, ts: now, to: this.role === 'host' ? '*' : 'host' }, false);
    }
  }

  /** Gospodarz: rozsyła porę dnia i pogodę. */
  pushState(state: { time: number; day: number; weather: NetWeather }, now = Date.now()) {
    if (this.role !== 'host') return;
    if (now - this.lastState < STATE_EVERY * 1000) return;
    this.lastState = now;
    this.setWorld(state);
    this.raw({ t: 'state', from: this.id, to: '*', ...state });
  }

  /** Gospodarz: natychmiastowa zmiana pogody (bez czekania na `pushState`). */
  sendState(state: { time: number; day: number; weather: NetWeather }) {
    if (this.role !== 'host') return;
    this.lastState = Date.now();
    this.setWorld(state);
    this.raw({ t: 'state', from: this.id, to: '*', ...state });
  }

  /** Wysyła (zwykle zbiorczo) zmiany bloków. */
  sendEdits(list: NetEdit[]) {
    if (!list.length || this.closed) return;
    // Świat już zna te zmiany (to my je zrobiliśmy) – nie odtwarzamy ich
    // lokalnie, bo wywołałoby to pętlę `setBlock` → `onEdit` → wysyłka.
    // Gospodarz pamięta je jednak w migawce dla kolejnych graczy.
    if (this.role === 'host') this.remember(list);
    this.send({ t: 'edits', from: this.id, list }, false);
  }

  /** Wysyła pozycję i obrót gracza. */
  sendPos(p: {
    d: 'o' | 'n';
    x: number;
    y: number;
    z: number;
    yaw: number;
    pitch: number;
    held?: number;
    name: string;
    hue: number;
  }) {
    this.send({ t: 'pos', from: this.id, to: this.role === 'host' ? '*' : 'host', ...p }, false);
  }

  /** Gospodarz: sygnał „wchodzę do świata” – goście dostają ten sam start. */
  startWorld() {
    if (this.role !== 'host') return;
    this.setWorld({ started: true });
    this.raw({ t: 'start', from: this.id, to: '*' });
  }

  /** Wysyła wiadomość czatu do wszystkich. */
  /** 2.19: prośba o teleportację – leci tylko do wybranego gracza. */
  sendTeleport(to: string, t: NetTeleport) {
    if (!to) return;
    this.send({ t: 'tpa', from: this.id, to, ...t, name: this.name }, false);
  }

  say(text: string) {
    const clean = String(text ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 240);
    if (!clean) return;
    // Lokalnie wiadomość pokazuje silnik – tutaj tylko rozsyłamy.
    this.send({ t: 'chat', from: this.id, to: '*', name: this.name, text: clean }, false);
  }
}

/** Sprawdza dane od gospodarza, zanim trafią do generatora świata. */
export function sanitizeWorld(raw: unknown): WorldHandshake | null {
  if (!raw || typeof raw !== 'object') return null;
  const w = raw as Partial<WorldHandshake>;
  if (!Number.isFinite(w.seed)) return null;
  const mode = w.mode === 'creative' ? 'creative' : 'survival';
  const worldType = w.worldType === 'flat' ? 'flat' : 'normal';
  const edits = Array.isArray(w.edits)
    ? w.edits
        .filter((e): e is NetEdit => !!e && Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z) && Number.isFinite(e.id))
        .slice(0, MAX_SNAPSHOT_EDITS)
    : [];
  const spawn =
    w.spawn && Number.isFinite(w.spawn.x) && Number.isFinite(w.spawn.y) && Number.isFinite(w.spawn.z)
      ? {
          x: Math.max(-3.2e7, Math.min(3.2e7, Math.trunc(w.spawn.x))),
          y: Math.max(0, Math.min(255, Math.trunc(w.spawn.y))),
          z: Math.max(-3.2e7, Math.min(3.2e7, Math.trunc(w.spawn.z))),
          d: w.spawn.d === 'n' ? ('n' as const) : ('o' as const),
        }
      : undefined;
  return {
    seed: Math.abs(Math.trunc(w.seed as number)) || 1,
    mode,
    worldType,
    name: typeof w.name === 'string' ? w.name.slice(0, 40) : 'Świat',
    time: Number.isFinite(w.time) ? Math.max(0, Math.min(1, w.time as number)) : 0.25,
    day: Number.isFinite(w.day) ? Math.max(1, Math.trunc(w.day as number)) : 1,
    weather: w.weather === 'rain' ? 'rain' : 'clear',
    dimension: w.dimension === 'n' ? 'n' : 'o',
    // Bez tego gość dołączający po starcie świata czekałby w poczekalni.
    started: w.started === true,
    spawn,
    edits,
  };
}

// ============================================================== transporty

/**
 * Ten sam komputer / ta sama przeglądarka, wiele kart.
 * `BroadcastChannel` nie wymaga żadnego serwera i działa też offline.
 */
export function createLocalLink(room: string, onMessage: (raw: string) => void, onClose: () => void = () => {}): NetLink {
  const code = normalizeRoom(room) || 'blockcraft';
  if (typeof BroadcastChannel === 'undefined') {
    throw new Error('Ta przeglądarka nie obsługuje trybu lokalnego (BroadcastChannel). Użyj trybu przez internet.');
  }
  const channel = new BroadcastChannel(`blockcraft-${code}`);
  let closed = false;
  channel.onmessage = (e) => {
    if (typeof e.data === 'string') onMessage(e.data);
  };
  return {
    get connected() {
      return !closed;
    },
    get label() {
      return `lokalny · ${code}`;
    },
    send(data: string) {
      if (!closed) channel.postMessage(data);
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        channel.close();
      } catch {
        /* ignore */
      }
      onClose();
    },
  };
}

export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** Skraca SDP do wklejenia w komunikator; cały kod to base64url JSON-a. */
export function encodeSignal(payload: unknown): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decodeSignal<T>(code: string): T | null {
  try {
    const clean = code.trim().replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const pad = clean.length % 4 ? '='.repeat(4 - (clean.length % 4)) : '';
    const bin = atob(clean + pad);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as T;
  } catch {
    return null;
  }
}

/**
 * Czeka, aż w SDP zbiorą się kandydaci ICE (bez serwera sygnalizacyjnego
 * nie mamy jak dokładać ich później).
 */
function waitForIce(pc: RTCPeerConnection, timeoutMs = 2500): Promise<void> {
  return new Promise((resolve) => {
    if (pc.iceGatheringState === 'complete') {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      pc.removeEventListener('icegatheringstatechange', check);
      clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') finish();
    };
    pc.addEventListener('icegatheringstatechange', check);
    const timer = setTimeout(finish, timeoutMs);
  });
}

function dataLink(channel: RTCDataChannel, label: string, onMessage: (raw: string) => void): NetLink {
  let closed = false;
  channel.onmessage = (e) => {
    if (typeof e.data === 'string') onMessage(e.data);
  };
  return {
    get connected() {
      return !closed && channel.readyState === 'open';
    },
    get label() {
      return label;
    },
    send(data: string) {
      if (!closed && channel.readyState === 'open') channel.send(data);
    },
    close() {
      if (closed) return;
      closed = true;
      try {
        channel.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Gospodarz P2P: `createOffer()` daje kod zaproszenia, `acceptAnswer()` kończy
 * połączenie kodem od gościa. Kanał zwykle wstaje chwilę PÓŹNIEJ – dlatego
 * dostajemy go przez `onLink`, a nie jako wynik funkcji.
 */
export function createRtcHost(onMessage: (raw: string) => void, onLink: (link: NetLink) => void) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  const channel = pc.createDataChannel('blockcraft', { ordered: true });
  const link = dataLink(channel, 'WebRTC · gospodarz', onMessage);
  channel.onopen = () => onLink(link);
  return {
    async createOffer(): Promise<string> {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await waitForIce(pc);
      return encodeSignal({ v: 1, sdp: pc.localDescription?.sdp, type: 'offer' });
    },
    async acceptAnswer(code: string): Promise<void> {
      const data = decodeSignal<{ sdp?: string; type?: string }>(code);
      if (!data?.sdp || data.type !== 'answer') {
        throw new Error(
          'To nie jest kod odpowiedzi. Wklej kod, który dostałeś od gościa (gospodarz wysyła kod zaproszenia).'
        );
      }
      // „Called in wrong state: stable” z przeglądarki oznacza, że odpowiedź
      // już przyjęto (albo kliknięto „Połącz” drugi raz). Zamiast surowego
      // błędu DOM pokazujemy konkretną podpowiedź.
      if (pc.signalingState !== 'have-local-offer') {
        throw new Error(
          'To zaproszenie zostało już użyte albo wygasło. Utwórz nowy kod zaproszenia (krok 1) i poproś gościa o nową odpowiedź.'
        );
      }
      try {
        await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (/wrong state|stable/i.test(msg)) {
          throw new Error('To zaproszenie zostało już użyte. Utwórz nowy kod i poproś gościa o nową odpowiedź.');
        }
        throw new Error('Nie udało się przyjąć odpowiedzi: ' + msg);
      }
    },
    get link() {
      return link;
    },
    close() {
      link.close();
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    },
  };
}

/**
 * Gość P2P: z kodu zaproszenia tworzy kod odpowiedzi. Kod trzeba odesłać
 * gospodarzowi – dopiero wtedy kanał się otwiera i woła `onLink`.
 */
export function createRtcGuest(onMessage: (raw: string) => void, onLink: (link: NetLink) => void) {
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
  pc.ondatachannel = (e) => onLink(dataLink(e.channel, 'WebRTC · gość', onMessage));
  return {
    async acceptOffer(code: string): Promise<string> {
      const data = decodeSignal<{ sdp?: string }>(code);
      if (!data?.sdp) {
        throw new Error('Nieprawidłowy kod zaproszenia. Skopiuj go w całości (jest długi) – bez spacji na końcu.');
      }
      if (pc.signalingState !== 'stable') {
        throw new Error('To zaproszenie zostało już przyjęte. Utwórz kod odpowiedzi i odeślij go gospodarzowi.');
      }
      try {
        await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        throw new Error('Nie udało się odczytać zaproszenia: ' + msg);
      }
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIce(pc);
      return encodeSignal({ v: 1, sdp: pc.localDescription?.sdp, type: 'answer' });
    },
    close() {
      try {
        pc.close();
      } catch {
        /* ignore */
      }
    },
  };
}
