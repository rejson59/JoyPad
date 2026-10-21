/**
 * Anty-spam propozycji gier.
 *
 * Jedno zdanie o tym, dlaczego to jest osobny, czysty moduł: decyzję o tym, czy
 * gracz może teraz zaproponować tytuł, podejmuje telewizor (autorytet), ale liczby
 * muszą dać się przeliczyć w node — bez peerjs, bez DOM, bez timera. Stąd: wejściem
 * jest znacznik czasu plus licznik, wyjściem — werdykt i następny licznik. `padHost`
 * tylko to zapisuje i ewentualnie odpowiada telefonowi.
 *
 * Cztery warstwy obrony, od najłagodniejszej:
 *  1. `cooldownMs` — jedna propozycja na osiem sekund (międzyczas to i tak nie ludzkie tempo);
 *  2. `duplicateMs` — ta sama gra wraca do puli dopiero po dłuższej chwili (klikanie w kółko
 *     w „Neonowy Pęd\" nie jest głosowaniem, tylko hałasem);
 *  3. `maxPerWindow` — sufit ilościowy w oknie przesuwnym (5 na minutę: wystarcza, by
 *     spokojnie oddać i wycofać głos, a nie pozwala zasypać lobby);
 *  4. eskalacja — po `strikeLimit` odrzuceniach z rzędu gracz jest wyciszany automatycznie
 *     na `autoMuteMs` (admin może zdjąć lub założyć kłódkę sam, `{ kind: 'muted' }`).
 *
 * Wycofanie głosu (game = null) jest NIGDY blokowane: gracz ma prawo zmienić zdanie, a
 * zablokowane wycofanie oznacza głos, który wisi na ekranie, a jego właściciel nie może go zdjąć.
 */

export interface SuggestCounters {
  /** Kiedy przyjęto ostatnią propozycję (punkt odniesienia cooldownu i duplikatu). */
  lastAt: number;
  /** Ostatnia przyjęta gra — do blokady duplikatów. */
  lastGame?: string;
  /** Start okna przesuwnego, w którym liczymy `count`. */
  windowAt: number;
  /** Liczba przyjętych propozycji w oknie. */
  count: number;
  /** Liczba odrzuceń z rzędu (eskalacja do wyciszenia). */
  strikes: number;
  /** Start okna odrzuceń. */
  strikeAt: number;
  /** Do kiedy wyciszony automatycznie (0 = brak). Wyciszenie od admina żyje obok tego. */
  mutedUntil: number;
  /** Kiedy ostatnio odpowiedzieliśmy odmową — żeby sama odmowa nie stała się spamem. */
  lastReplyAt: number;
}

export const EMPTY_SUGGEST: SuggestCounters = { lastAt: 0, windowAt: 0, count: 0, strikes: 0, strikeAt: 0, mutedUntil: 0, lastReplyAt: 0 };

export const ANTI_SPAM = {
  cooldownMs: 8_000,
  windowMs: 60_000,
  maxPerWindow: 5,
  duplicateMs: 3 * 60_000,
  strikeWindowMs: 30_000,
  strikeLimit: 4,
  autoMuteMs: 90_000,
  /** Między dwiema odmowami dla tego samego pada — telefon nie potrzebuje brzęczyka 50×/s. */
  replyGapMs: 1_500,
} as const;

export type SuggestRejection = 'cooldown' | 'limit' | 'duplicate' | 'muted';
export type SuggestVerdict = 'accepted' | SuggestRejection;

export interface SuggestRequest {
  /** `undefined` (lub `null` z sieci) = wycofanie głosu. */
  game?: string;
  now: number;
  /** Wyciszony przez admina — licznik nie ma wtedy znaczenia. */
  muted: boolean;
  counters: SuggestCounters;
}

export type SuggestDecision =
  | { accept: true; verdict: 'accepted'; retryInMs: 0; reply: boolean; autoMuted: false; counters: SuggestCounters }
  | { accept: false; verdict: SuggestRejection; retryInMs: number; reply: boolean; autoMuted: boolean; counters: SuggestCounters };

export function judgeSuggest({ game, now, muted, counters }: SuggestRequest): SuggestDecision {
  // Wycofanie głosu: zawsze wolne, nic nie liczymy.
  if (!game) return { accept: true, verdict: 'accepted', retryInMs: 0, reply: false, autoMuted: false, counters };

  const autoMuteLeft = counters.mutedUntil > now ? counters.mutedUntil - now : 0;
  const reject = (verdict: SuggestRejection, retryInMs: number, base: SuggestCounters): SuggestDecision => {
    // Odrzucenia liczymy w osobnym oknie: cztery bicia głową w limit w pół minuty
    // to nie pomyłka, to upór — i on właśnie zasługuje na wyciszenie.
    const windowAlive = base.strikeAt > 0 && now - base.strikeAt <= ANTI_SPAM.strikeWindowMs;
    const strikes = (windowAlive ? base.strikes : 0) + 1;
    const autoMuted = !muted && !autoMuteLeft && strikes >= ANTI_SPAM.strikeLimit;
    const reply = base.lastReplyAt === 0 || now - base.lastReplyAt >= ANTI_SPAM.replyGapMs;
    return {
      accept: false,
      verdict,
      retryInMs: Math.max(0, Math.ceil(retryInMs / 1000) * 1000),
      // Sama odmowa nie może stać się spamem: telefon dostaje ją raz na `replyGapMs`.
      reply,
      autoMuted,
      counters: {
        ...base,
        strikeAt: windowAlive ? base.strikeAt : now,
        strikes: autoMuted ? 0 : strikes,
        mutedUntil: autoMuted ? now + ANTI_SPAM.autoMuteMs : base.mutedUntil,
        lastReplyAt: reply ? now : base.lastReplyAt,
      },
    };
  };

  if (muted || autoMuteLeft) return reject('muted', muted ? 0 : autoMuteLeft, counters);

  // Okno przesuwne: po `windowMs` licznik ilościowy startuje od zera.
  const freshWindow = now - counters.windowAt > ANTI_SPAM.windowMs;
  const base: SuggestCounters = {
    ...counters,
    windowAt: freshWindow ? now : counters.windowAt,
    count: freshWindow ? 0 : counters.count,
  };

  const sinceLast = now - base.lastAt;
  if (base.lastGame === game && sinceLast < ANTI_SPAM.duplicateMs) return reject('duplicate', ANTI_SPAM.duplicateMs - sinceLast, base);
  if (base.lastAt && sinceLast < ANTI_SPAM.cooldownMs) return reject('cooldown', ANTI_SPAM.cooldownMs - sinceLast, base);
  if (base.count >= ANTI_SPAM.maxPerWindow) return reject('limit', ANTI_SPAM.windowMs - (now - base.windowAt), base);

  return {
    accept: true,
    verdict: 'accepted',
    retryInMs: 0,
    reply: true,
    autoMuted: false,
    counters: { ...base, lastAt: now, lastGame: game, count: base.count + 1, strikes: 0 },
  };
}

/** Czy ten gracz jest w tej chwili wyciszony (decyzja admina albo eskalacja). */
export function isSilenced(counters: SuggestCounters, muted: boolean, now: number): boolean {
  return muted || counters.mutedUntil > now;
}
