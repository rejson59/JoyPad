import { Crown, Flag, Flame, Languages, Magnet, Medal, RotateCcw, ShieldCheck, Trophy, Users, type LucideIcon } from 'lucide-react';
import type { GameId } from '../arcade/catalog';

/**
 * Karta pilota i osiągnięcia (runda 24).
 *
 * Konsola pamiętała dotąd tylko rekordy punktowe per gra (`joypad-record-*`), więc
 * sesja zostawiała po sobie wyłącznie liczby. Teraz każde urządzenie trzyma kartę
 * pilota (rundy, zwycięstwa, rozegrane światy, rekord impulsów) i dwanaście
 * osiągnięć wyprowadzonych WYŁĄCZNIE z sygnałów, które runda i tak już wysyła
 * (`RoundResult` + zdarzenia `onFx`: pickup, dead, shield, respawn) — nic nie jest
 * doszukiwane po pikselach ani wymyślone z samych punktów.
 *
 * Rdzeń jest czysty: storage wstrzykiwany (testy piszą do mapy, przeglądarka do
 * `localStorage`), bez Reacta i bez efektów ubocznych przy imporcie, więc bramki
 * mogą go ćwiczyć w Node. Widoki tylko czytają stan i ogłaszają odblokowania.
 */

export const ACHIEVEMENTS_KEY = 'joypad.achievements.v1';
/** Zdarzenie okna: biblioteka i okno osiągnięć odświeżają się po odblokowaniu. */
export const ACHIEVEMENT_EVENT = 'joypad-achievement';

export type AchievementId =
  | 'first-win' | 'hat-trick' | 'triple-crown' | 'marathon' | 'full-couch' | 'explorer'
  | 'polyglot' | 'untouchable' | 'collector' | 'shield-saver' | 'comeback' | 'photo-finish';

export interface AchievementText { name: string; desc: string }
export interface AchievementDef {
  id: AchievementId;
  /** Świat, na którego kafelku wisieć będzie trofeum; `system` = cała konsola. */
  game: GameId | 'system';
  icon: LucideIcon;
  pl: AchievementText;
  en: AchievementText;
}

export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { id: 'first-win', game: 'system', icon: Trophy, pl: { name: 'Pierwsze zwycięstwo', desc: 'Wygraj dowolną rundę — chociaż jedną, chociaż o włos.' }, en: { name: 'First victory', desc: 'Win any round — even one, even by a hair.' } },
  { id: 'hat-trick', game: 'system', icon: Medal, pl: { name: 'Hat-trick', desc: 'Wygraj trzy rundy w dowolnych światach.' }, en: { name: 'Hat-trick', desc: 'Win three rounds in any worlds.' } },
  { id: 'triple-crown', game: 'system', icon: Crown, pl: { name: 'Potrójna korona', desc: 'Zwycięż w trzech różnych grach biblioteki.' }, en: { name: 'Triple crown', desc: 'Take a win in three different library games.' } },
  { id: 'marathon', game: 'system', icon: Flame, pl: { name: 'Maratończyk', desc: 'Rozegraj dziesięć rund — konsola liczy każde starcie.' }, en: { name: 'Marathon runner', desc: 'Play ten rounds — the console counts every bout.' } },
  { id: 'full-couch', game: 'system', icon: Users, pl: { name: 'Pełna kanapa', desc: 'Zakończ rundę z czterema żywymi graczami.' }, en: { name: 'Full couch', desc: 'Finish a round with four live players.' } },
  { id: 'explorer', game: 'system', icon: Trophy, pl: { name: 'Odkrywca', desc: 'Uruchom każdy grywalny świat biblioteki przynajmniej raz.' }, en: { name: 'Explorer', desc: 'Launch every playable library world at least once.' } },
  { id: 'polyglot', game: 'system', icon: Languages, pl: { name: 'Poliglota', desc: 'Przełącz język konsoli — PL i EN żyją obok siebie.' }, en: { name: 'Polyglot', desc: 'Switch the console language — PL and EN live side by side.' } },
  { id: 'untouchable', game: 'snake', icon: ShieldCheck, pl: { name: 'Nieuchwytny', desc: 'Wygraj Wężowy Wir bez ani jednej własnej eliminacji.' }, en: { name: 'Untouchable', desc: 'Win Snake Vortex without a single own elimination.' } },
  { id: 'collector', game: 'snake', icon: Magnet, pl: { name: 'Kolekcjoner', desc: 'Zbierz 25 impulsów w jednej rundzie Wężowego Wiru.' }, en: { name: 'Collector', desc: 'Grab 25 energy bits in a single Snake Vortex round.' } },
  { id: 'shield-saver', game: 'snake', icon: ShieldCheck, pl: { name: 'Odbicie tarczą', desc: 'Skasuj trafienie tarczą — dokładnie tym ratuje się życie.' }, en: { name: 'Shield saver', desc: 'Cancel a hit with the shield — that is exactly what it saves.' } },
  { id: 'comeback', game: 'snake', icon: RotateCcw, pl: { name: 'Powrót z niczego', desc: 'Wygraj rundę po własnej eliminacji i respawnie.' }, en: { name: 'Comeback', desc: 'Win a round after your own elimination and respawn.' } },
  { id: 'photo-finish', game: 'system', icon: Flag, pl: { name: 'Fotofinisz', desc: 'Wygraj rundę przewagą dokładnie jednego punktu.' }, en: { name: 'Photo finish', desc: 'Win a round by exactly one point of margin.' } },
] as const;

export const ACHIEVEMENT_BY_ID: Record<AchievementId, AchievementDef> = Object.fromEntries(
  ACHIEVEMENTS.map(def => [def.id, def]),
) as Record<AchievementId, AchievementDef>;

export interface PilotCard {
  rounds: number;
  wins: number;
  winsByGame: Partial<Record<GameId, number>>;
  playedGames: GameId[];
  bestPickups: number;
  firstSeen: number;
  lastSeen: number;
}

export interface AchievementsState { unlocked: Partial<Record<AchievementId, number>>; card: PilotCard }

/** Sygnały rundy, których konsola i tak już używa: wynik + zdarzenia `onFx`. */
export interface RoundSignal {
  game: GameId;
  winnerSlot: number | null;
  humans: number;
  /** Liczniki zdarzeń `onFx` na slot: pickup / dead / shield / respawn / … */
  fx: Record<number, Record<string, number>>;
  scores: { slot: number; isBot: boolean; score: number }[];
}

export type AchievementStorage = Pick<Storage, 'getItem' | 'setItem'>;

function browserStorage(): AchievementStorage | undefined {
  try { return typeof localStorage === 'undefined' ? undefined : localStorage; } catch { return undefined; }
}

function emptyCard(now: number): PilotCard {
  return { rounds: 0, wins: 0, winsByGame: {}, playedGames: [], bestPickups: 0, firstSeen: now, lastSeen: now };
}

export function readState(storage: AchievementStorage | undefined = browserStorage()): AchievementsState {
  const now = Date.now();
  if (!storage) return { unlocked: {}, card: emptyCard(now) };
  try {
    const raw = storage.getItem(ACHIEVEMENTS_KEY);
    if (!raw) return { unlocked: {}, card: emptyCard(now) };
    const parsed = JSON.parse(raw) as Partial<AchievementsState>;
    const card = { ...emptyCard(now), ...(parsed.card || {}) };
    if (!Array.isArray(card.playedGames)) card.playedGames = [];
    return { unlocked: parsed.unlocked && typeof parsed.unlocked === 'object' ? parsed.unlocked : {}, card };
  } catch { return { unlocked: {}, card: emptyCard(now) }; }
}

function save(state: AchievementsState, storage: AchievementStorage | undefined) {
  if (!storage) return;
  try { storage.setItem(ACHIEVEMENTS_KEY, JSON.stringify(state)); } catch { /* prywatny tryb: karta zostaje w pamięci */ }
}

const count = (fx: RoundSignal['fx'], slots: number[], kind: string) =>
  slots.reduce((sum, slot) => sum + (fx[slot]?.[kind] ?? 0), 0);

/**
 * Zapisuje rundę w karcie pilota i zwraca identyfikatory osiągnięć odblokowanych
 * TYM starciem (bez powtórek — raz zdobyte trofeum zostaje zdobyte).
 */
export function recordRound(signal: RoundSignal, storage: AchievementStorage | undefined = browserStorage()): AchievementId[] {
  const state = readState(storage);
  const now = Date.now();
  const card = state.card;
  const humanSlots = signal.scores.filter(player => !player.isBot).map(player => player.slot);
  const winner = signal.winnerSlot !== null ? signal.scores.find(player => player.slot === signal.winnerSlot) : undefined;
  const humanWon = Boolean(winner && !winner.isBot);

  card.rounds += 1;
  card.lastSeen = now;
  if (!card.playedGames.includes(signal.game)) card.playedGames = [...card.playedGames, signal.game];
  if (humanWon && winner) {
    card.wins += 1;
    card.winsByGame = { ...card.winsByGame, [signal.game]: (card.winsByGame[signal.game] ?? 0) + 1 };
  }
  const roundPickups = count(signal.fx, humanSlots, 'pickup');
  card.bestPickups = Math.max(card.bestPickups, roundPickups);

  const ranked = [...signal.scores].sort((a, b) => b.score - a.score);
  const margin = ranked.length > 1 ? ranked[0].score - ranked[1].score : ranked[0]?.score ?? 0;
  const distinctWins = Object.values(card.winsByGame).filter(value => (value ?? 0) > 0).length;
  const deaths = count(signal.fx, humanSlots, 'dead');
  const shields = count(signal.fx, humanSlots, 'shield');
  const respawns = count(signal.fx, humanSlots, 'respawn');

  const earned: Partial<Record<AchievementId, boolean>> = {
    'first-win': card.wins >= 1,
    'hat-trick': card.wins >= 3,
    'triple-crown': distinctWins >= 3,
    marathon: card.rounds >= 10,
    'full-couch': signal.humans >= 4,
    explorer: card.playedGames.length >= 6,
    untouchable: humanWon && signal.game === 'snake' && deaths === 0,
    collector: roundPickups >= 25,
    'shield-saver': shields >= 1,
    comeback: humanWon && respawns >= 1,
    'photo-finish': humanWon && margin === 1,
  };

  const fresh: AchievementId[] = [];
  for (const def of ACHIEVEMENTS) {
    if (earned[def.id] && state.unlocked[def.id] === undefined) {
      state.unlocked[def.id] = now;
      fresh.push(def.id);
    }
  }
  save(state, storage);
  return fresh;
}

/** Osiągnięcie systemowe: przełączenie języka konsoli. */
export function noteLanguageSwitched(storage: AchievementStorage | undefined = browserStorage()): AchievementId[] {
  const state = readState(storage);
  if (state.unlocked.polyglot !== undefined) return [];
  state.unlocked.polyglot = Date.now();
  save(state, storage);
  return ['polyglot'];
}

/** Postęp pasków dla osiągnięć stopniowalnych; `null` = odblokowuje się skokowo. */
export function progressFor(id: AchievementId, state: AchievementsState): { value: number; goal: number } | null {
  const card = state.card;
  switch (id) {
    case 'hat-trick': return { value: Math.min(card.wins, 3), goal: 3 };
    case 'triple-crown': return { value: Math.min(Object.values(card.winsByGame).filter(value => (value ?? 0) > 0).length, 3), goal: 3 };
    case 'marathon': return { value: Math.min(card.rounds, 10), goal: 10 };
    case 'explorer': return { value: Math.min(card.playedGames.length, 6), goal: 6 };
    case 'collector': return { value: Math.min(card.bestPickups, 25), goal: 25 };
    default: return null;
  }
}

/**
 * Ogłasza odblokowania: toast systemu (`notify`) i zdarzenie okna, po którym
 * biblioteka oraz okno trofeów odświeżają się same. Dynamiczny import `notify`
 * trzyma rdzeń bez Reacta — bramki ćwiczą go w Node.
 */
export async function announceUnlocked(ids: AchievementId[], language: 'pl' | 'en'): Promise<void> {
  if (!ids.length) return;
  const { notify } = await import('./notifications');
  for (const id of ids) {
    const def = ACHIEVEMENT_BY_ID[id];
    const text = language === 'en' ? def.en : def.pl;
    notify(language === 'en' ? `Achievement: ${text.name}` : `Osiągnięcie: ${text.name}`, text.desc, 'success');
  }
  // Konstruktor zdarzenia bierzemy z docelowego okna: w dymnym teście jsdom
  // globalne `CustomEvent` jest z innej realmu i `dispatchEvent` odrzuciłby je.
  const win = typeof window === 'undefined' ? undefined : window;
  if (win) win.dispatchEvent(new win.CustomEvent(ACHIEVEMENT_EVENT, { detail: ids }));
}

/** Trofea per świat: ile osiągnięć danej gry już świeci na jej kafelku. */
export function countUnlockedByGame(state: AchievementsState = readState()): Partial<Record<GameId, number>> {
  const out: Partial<Record<GameId, number>> = {};
  for (const def of ACHIEVEMENTS) {
    if (def.game === 'system' || state.unlocked[def.id] === undefined) continue;
    out[def.game] = (out[def.game] ?? 0) + 1;
  }
  return out;
}
