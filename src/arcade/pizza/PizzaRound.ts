import { gameAudio } from '../../game/audio';
import { uiOwnsKeyboard } from '../../lib/inputOwnership';
import type { Language } from '../../platform/i18n';
import type { GameRound, Racer, RoundConfig } from '../runtime';
import { isGameKey, modeOf, resultFromSnapshot, sampleInput, shiftSeconds, snapshotToHud, styleFor, throwSlotOf } from './bridge';
import { Game, type GameEnv } from './Game';
import type { CourierDef, Snapshot } from './types';

/**
 * Adapter WEBZA — „Nocna Dostawa” (silnik z multiplayer-superhero-pizza-delivery.zip).
 *
 * Silnik jest samodzielną grą Three.js z własnym menu, lobby i HUD-em; w JoyPadzie te trzy
 * rzeczy należą do platformy. Ten most zostawia silnikowi miasto, fizykę sieci, zamówienia
 * i oprawę, a bierze na siebie: cykl życia (`start/destroy/togglePause`), wejścia z telefonów
 * i klawiatur, HUD i wynik rundy. Konfigurację dostaje z ustawień rundy:
 *   • `primary`   → długość zmiany (1:00 / 2:00 / 3:00),
 *   • `secondary` → tryb (0 = współpraca z oceną zespołu, 1 = rywalizacja o MVP).
 *
 * Procedura cofnięcia: usuń `src/arcade/pizza/`, `public/games/pizza/`, wpis `pizza` w
 * `catalog.ts`, `RULES.pizza`/`case 'pizza'` w `ArcadeGameView.tsx` i `scripts/pizza-selftest.ts`.
 */

const MINIMAP = { width: 216, height: 156 };

/** Mapa miasta nad areną — w mieście z dachów łatwo zgubić klienta, którego światło jest za budynkiem. */
function createMinimap(canvas: HTMLCanvasElement): HTMLCanvasElement | null {
  const host = canvas.parentElement;
  if (!host || typeof document === 'undefined') return null;
  const map = document.createElement('canvas');
  map.width = MINIMAP.width;
  map.height = MINIMAP.height;
  map.setAttribute('aria-hidden', 'true');
  Object.assign(map.style, {
    position: 'absolute', right: '14px', bottom: '14px', width: 'clamp(124px, 17vw, 216px)',
    aspectRatio: `${MINIMAP.width} / ${MINIMAP.height}`, borderRadius: '12px', zIndex: '5',
    border: '1px solid rgba(255,255,255,.16)', opacity: '.92', pointerEvents: 'none',
  });
  host.appendChild(map);
  return map;
}

export class PizzaRound implements GameRound {
  private readonly game: Game;
  private readonly humans: Racer[];
  private readonly language: Language;
  private readonly keys = new Set<string>();
  /** Slot, który użył klawisza rzutu, przejmuje rzut ręcznie (asysta wyłączona). */
  private readonly manualThrow: boolean[] = [false, false, false, false];
  private readonly minimap: HTMLCanvasElement | null;
  private ready = false;
  private started = false;
  private launched = false;
  private ended = false;
  private destroyed = false;
  private phase: Snapshot['phase'] = 'loading';

  constructor(canvas: HTMLCanvasElement, private readonly config: RoundConfig, env?: GameEnv) {
    const humans = config.players.filter(player => !player.isBot);
    this.humans = humans.length ? humans : [config.players[0] ?? { slot: 0, name: 'GRACZ 1', color: '#4ade80', isBot: false }];
    this.language = config.language ?? 'pl';
    this.minimap = createMinimap(canvas);
    const styles: Partial<CourierDef>[] = [];
    for (const human of this.humans) styles[human.slot] = styleFor(human);

    this.game = new Game(canvas, this.minimap, snapshot => this.onSnapshot(snapshot), {
      quality: config.quality,
      language: this.language,
      readInput: slot => sampleInput(slot, this.keys, this.config.padInputs[slot], this.manualThrow[slot] ?? false),
      styles,
      onFrame: config.onFrame,
      onFx: config.onFx,
      onMoment: config.onMoment,
      onFatal: error => this.fail(error),
      env,
    });

    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    document.addEventListener('visibilitychange', this.visibility);
  }

  start() {
    this.started = true;
    this.launch();
  }

  togglePause() {
    if (!this.launched || this.ended || this.destroyed) return;
    if (this.phase === 'paused') this.game.resume();
    else this.game.pause();
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

  /** Silnik ładuje miasto asynchronicznie — rundę zaczynamy, gdy ma i miasto, i `start()` od platformy. */
  private launch() {
    if (this.launched || !this.started || !this.ready || this.destroyed) return;
    this.launched = true;
    for (const human of this.humans) this.game.join(human.slot);
    this.game.setMode(modeOf(this.config.secondary));
    this.game.setDuration(shiftSeconds(this.config.primary));
    this.game.start();
  }

  private onSnapshot(snapshot: Snapshot) {
    // Silnik zgłasza pierwszą migawkę (ładowanie) jeszcze z własnego konstruktora — wtedy
    // `this.game` nie jest przypisane. Bez tego strażnika adapter wywalał się przy tworzeniu
    // i platforma wracała po cichu do menu.
    if (!this.game || this.destroyed || this.ended) return;
    this.phase = snapshot.phase;
    this.game.setMuted(gameAudio.muted);
    if (!this.launched) {
      if (snapshot.phase === 'menu') { this.ready = true; this.launch(); }
      return;
    }
    // Menu silnika to przejściowy stan między `setMode/setDuration` a `start()` — platforma go nie pokazuje.
    if (snapshot.phase === 'menu' || snapshot.phase === 'loading') return;
    if (snapshot.phase === 'results') { this.finish(snapshot); return; }
    this.config.onHud(snapshotToHud(snapshot, this.humans, this.language));
  }

  private finish(snapshot: Snapshot) {
    if (this.ended) return;
    this.ended = true;
    this.config.onFinish(resultFromSnapshot(snapshot, this.humans, this.language));
  }

  /** Start się nie udał (brak pamięci GPU, uszkodzony zasób): jasny komunikat zamiast wiecznego ładowania. */
  private fail(error: unknown) {
    if (this.destroyed || this.ended) return;
    console.error('WEBZA: nie udało się wystartować', error);
    this.ended = true;
    const en = this.language === 'en';
    this.config.onFinish({
      title: en ? 'COULD NOT LOAD THE GAME' : 'NIE UDAŁO SIĘ WCZYTAĆ GRY',
      subtitle: en ? 'Check your connection and try again.' : 'Sprawdź połączenie i spróbuj ponownie.',
      winnerSlot: null,
      players: this.humans.map(human => ({ slot: human.slot, name: human.name, color: human.color, score: 0, detail: '—', isBot: false })),
    });
  }

  private keyDown = (event: KeyboardEvent) => {
    // Nad areną stoi okienko (pauza, regulacje) albo gracz coś wpisuje — klawiatura należy wtedy do interfejsu.
    if (uiOwnsKeyboard(event)) return;
    if (isGameKey(event.code)) event.preventDefault();
    if (!event.repeat) {
      if (event.code === 'KeyP' || event.code === 'Escape') this.togglePause();
      const slot = throwSlotOf(event.code);
      if (slot >= 0) this.manualThrow[slot] = true;
    }
    this.keys.add(event.code);
  };
  private keyUp = (event: KeyboardEvent) => { this.keys.delete(event.code); };
  private blur = () => { this.keys.clear(); };
  /** Zablokowany telefon albo przełączona karta nie może rozstrzygnąć zmiany pod nieobecność graczy. */
  private visibility = () => {
    if (document.hidden && this.launched && !this.ended && this.phase !== 'paused') this.game.pause();
  };
}
