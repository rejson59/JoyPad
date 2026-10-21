import { gameAudio } from '../../game/audio';
import { uiOwnsKeyboard } from '../../lib/inputOwnership';
import type { Language } from '../../platform/i18n';
import type { GameRound, RoundConfig } from '../runtime';
import {
  MATCH_SECONDS, assignTeams, goalLimitFor, isGameKey, resultFromSnapshot, sampleStick, snapshotToHud,
  type LeagueSnapshot, type RosterEntry,
} from './bridge';
import { LeagueGame, type LeagueEnv } from './LeagueGame';

/**
 * Adapter Turbo League (silnik z nitro-league.zip) do runtime'u JoyPad.
 *
 * Silnik jest samodzielną grą Three.js z własnym menu, garażem i kamerą pościgową jednego gracza.
 * W JoyPadzie menu, lobby, HUD i wyniki należą do platformy, a mecz jest wspólny: ten most zostawia
 * silnikowi fizykę, stadion, AI botów i powtórki, a bierze na siebie skład drużyn, wejścia z telefonów
 * i klawiatur, wspólną kamerę (`LeagueGame.broadcastCam`), HUD i wynik. Ustawienia rundy:
 *   • `primary`   → limit goli (3 / 5 / 7); mecz trwa 3 minuty, remis rozstrzyga złoty gol (maks. 2 min),
 *   • `secondary` → liczba botów dobranych przez platformę (skład: 1 = trening, 2 = 1v1, 3 = 2v1, 4 = 2v2).
 *
 * Procedura cofnięcia: usuń `src/arcade/league-next/`, `scripts/league-selftest.ts` (+ skrypt
 * `selftest:league`), `case 'league'` w `createRound` (wróć do `webgl/League3D` i `games/League`)
 * oraz przywróć `wip: true` i dawne teksty `league` w `catalog.ts`.
 */

const MINIMAP = { width: 216, height: 161 };

/** Mapa boiska w rogu areny — w orientacji kamery (długość boiska poziomo). */
function createMinimap(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const host = canvas.parentElement;
  if (!host || typeof document === 'undefined') return null;
  const map = document.createElement('canvas');
  map.width = MINIMAP.width;
  map.height = MINIMAP.height;
  map.setAttribute('aria-hidden', 'true');
  Object.assign(map.style, {
    position: 'absolute', left: '14px', bottom: '14px', width: 'clamp(124px, 17vw, 216px)',
    aspectRatio: `${MINIMAP.width} / ${MINIMAP.height}`, borderRadius: '12px', zIndex: '5',
    border: '1px solid rgba(255,255,255,.16)', opacity: '.92', pointerEvents: 'none',
  });
  host.appendChild(map);
  return map;
}

const reducedMotion = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export class LeagueNextRound implements GameRound {
  private readonly game: LeagueGame;
  private readonly roster: RosterEntry[];
  private readonly language: Language;
  private readonly keys = new Set<string>();
  private readonly minimap: HTMLCanvasElement | null;
  private started = false;
  private ended = false;
  private destroyed = false;

  constructor(canvas: HTMLCanvasElement, private readonly config: RoundConfig, env?: LeagueEnv) {
    this.language = config.language ?? 'pl';
    this.roster = assignTeams(config.players.length ? config.players : [{ slot: 0, name: 'GRACZ 1', color: '#4ade80', isBot: false }]);
    this.minimap = createMinimap(canvas);
    this.game = new LeagueGame(canvas, this.minimap, this.roster, {
      quality: config.quality === 'performance' ? 0 : config.quality === 'quality' ? 2 : 1,
      language: this.language,
      goalLimit: goalLimitFor(config.primary),
      matchSeconds: MATCH_SECONDS,
      readInput: slot => sampleStick(slot, this.keys, this.config.padInputs[slot]),
      onHud: snapshot => this.onHud(snapshot),
      onFinish: snapshot => this.finish(snapshot),
      onFrame: config.onFrame,
      onFx: config.onFx,
      onMoment: config.onMoment,
      onFatal: error => this.fail(error),
      reducedMotion: reducedMotion(),
      env,
    });
    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.visibility);
  }

  start() {
    if (this.started || this.destroyed) return;
    this.started = true;
    this.game.start();
  }

  togglePause() {
    if (!this.started || this.ended || this.destroyed) return;
    this.game.setPaused(!this.game.isPaused());
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    document.removeEventListener('visibilitychange', this.visibility);
    this.keys.clear();
    this.game.dispose();
    this.minimap?.remove();
  }

  private onHud(snapshot: LeagueSnapshot) {
    if (!this.game || !this.started || this.ended || this.destroyed) return;
    this.game.setMuted(gameAudio.muted);
    this.config.onHud(snapshotToHud(snapshot, this.language));
  }

  private finish(snapshot: LeagueSnapshot) {
    if (this.ended || this.destroyed) return;
    this.ended = true;
    this.config.onFinish(resultFromSnapshot(snapshot, this.language));
  }

  /** Pętla silnika się wywróciła (np. utrata kontekstu GPU): jasny komunikat zamiast zamrożonej areny. */
  private fail(error: unknown) {
    if (this.destroyed || this.ended) return;
    console.error('Turbo League: błąd silnika', error);
    this.ended = true;
    const en = this.language === 'en';
    this.config.onFinish({
      title: en ? 'THE MATCH CRASHED' : 'MECZ SIĘ WYWRÓCIŁ',
      subtitle: en ? 'Something went wrong in the 3D engine. Try again.' : 'Coś poszło nie tak w silniku 3D. Spróbujcie ponownie.',
      winnerSlot: null,
      players: this.roster.filter(entry => entry.human).map(entry => ({ slot: entry.slot, name: entry.name, color: entry.color, score: 0, detail: '—', isBot: false })),
    });
  }

  private keyDown = (event: KeyboardEvent) => {
    // Nad areną stoi okienko (pauza, regulacje) albo gracz coś wpisuje — klawiatura należy wtedy do interfejsu.
    if (uiOwnsKeyboard(event)) return;
    if (isGameKey(event.code)) event.preventDefault();
    if ((event.code === 'KeyP' || event.code === 'Escape') && !event.repeat) this.togglePause();
    this.keys.add(event.code);
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private blur = () => { this.keys.clear(); };
  /** Zablokowany telefon albo przełączona karta nie może rozstrzygnąć meczu pod nieobecność graczy. */
  private visibility = () => {
    if (document.hidden && this.started && !this.ended && !this.game.isPaused()) this.game.setPaused(true);
  };
}
