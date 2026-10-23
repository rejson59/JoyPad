import type { GameRound, RoundConfig, RoundHud, RoundResult } from '../runtime';
import { Game, type HUDState, type UIState } from './game/engine';

/**
 * Adapter silnika BlockCraft (repo `rejson59/mconline`, MIT) do runtime'u JoyPad.
 *
 * Silnik jest samodzielny: sam zakłada płótno WebGL w kontenerze, sam prowadzi
 * pętlę klatek i sam słucha klawiatury, a JoyPad dokłada to, co umie lepiej —
 * cykl życia rundy, czas zmiany, HUD z tokenów, pady z telefonów i wynik końcowy.
 * Ruch z pada piszemy wprost w publiczne pola wejścia silnika (`keys`, `mouseRight`),
 * dokładnie tak, jak robią to jego własne `TouchControls`, więc nic się nie dubluje.
 *
 * Klatka dla Momenty płynie z `onHud` — silnik woła go po renderze, w tym samym
 * zadaniu JS, więc przekazane płótno sceny nie jest jeszcze wyczyszczone.
 */
const SESSION_MINUTES = [3, 5, 8];
const GOAL_BLOCKS = 600;

export class BlockCraftRound implements GameRound {
  private readonly game: Game;
  private readonly canvas: HTMLCanvasElement;
  private readonly originalDisplay: string;
  private readonly sessionSeconds: number;
  private timeLeft: number;
  private paused = false;
  private ui: UIState = 'playing';
  private hudState: HUDState | null = null;
  private ended = false;
  private humanSlot: number;

  constructor(canvas: HTMLCanvasElement, private readonly config: RoundConfig) {
    const container = canvas.parentElement;
    if (!container) throw new Error('BlockCraft wymaga zamontowanego kontenera gry');
    this.canvas = canvas;
    this.originalDisplay = canvas.style.display;
    // Silnik owns its WebGL canvas; host canvas stays as a mount anchor.
    canvas.style.display = 'none';

    this.humanSlot = config.players.find(player => !player.isBot)?.slot ?? 0;
    this.sessionSeconds = (SESSION_MINUTES[config.primary] ?? 5) * 60;
    this.timeLeft = this.sessionSeconds;
    const mode = config.secondary === 1 ? 'survival' : 'creative';
    const renderDistance = config.quality === 'performance' ? 4 : config.quality === 'quality' ? 8 : 6;
    this.game = new Game(container, {
      seed: 20260 + config.primary * 7,
      mode,
      renderDistance,
      worldName: 'JoyPad',
    }, {
      onHud: hud => {
        this.hudState = hud;
        // Po renderze, w tym samym zadaniu: Momenty dostają prawdziwe płótno sceny.
        this.config.onFrame?.(this.sceneCanvas());
      },
      onUI: next => { this.ui = next; },
    });
  }

  start() {
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.frameLoop);
    this.config.onHud(this.hud());
  }

  togglePause() {
    this.paused = !this.paused;
    this.game.setUI(this.paused ? 'paused' : 'playing');
    this.config.onHud(this.hud());
  }

  destroy() {
    this.ended = true;
    cancelAnimationFrame(this.raf);
    this.game.dispose();
    this.canvas.style.display = this.originalDisplay;
  }

  private sceneCanvas(): HTMLCanvasElement {
    const dom = (this.game as unknown as { renderer: { domElement: HTMLCanvasElement } }).renderer.domElement;
    return dom;
  }

  /** Pad telefonu → publiczne pola wejścia silnika (te same, co TouchControls). */
  private applyPad() {
    const pad = this.config.padInputs[this.humanSlot];
    const keys = this.game.keys;
    const dirX = pad?.dirX ?? 0;
    const dirY = pad?.dirY ?? 0;
    const set = (code: string, on: boolean) => { if (on) keys.add(code); else keys.delete(code); };
    set('KeyW', dirY < -.35);
    set('KeyS', dirY > .35);
    set('KeyA', dirX < -.35);
    set('KeyD', dirX > .35);
    this.game.mouseRight = Boolean(pad?.fire); // AKCJA = stawiaj blok, jak prawa mysz
  }

  private changedBlocks(): number {
    const world = this.game.world;
    let sum = 0;
    world.mods.forEach(chunk => { sum += chunk.size; });
    return sum;
  }

  hud(): RoundHud {
    const hud = this.hudState;
    const changed = this.changedBlocks();
    const biome = hud ? hud.biome : 'plains';
    return {
      timeLeft: this.timeLeft,
      countdown: 0,
      paused: this.paused || this.ui !== 'playing',
      objective: this.isEnglish()
        ? 'Build and explore — the shift ends the round, the world stays on this device.'
        : 'Buduj i zwiedzaj — zmianę kończy czas, świat zostaje na urządzeniu.',
      status: this.isEnglish() ? `OPEN WORLD · ${hud ? Math.round(hud.fps) : 0} FPS` : `OTWARTY ŚWIAT · ${hud ? Math.round(hud.fps) : 0} FPS`,
      players: this.config.players.map(player => ({
        slot: player.slot,
        name: player.name,
        color: player.color,
        score: player.isBot ? 0 : changed,
        detail: this.isEnglish() ? `${biome} · ${changed} blocks` : `${biome} · ${changed} bl.`,
        value: player.isBot ? 0 : Math.min(GOAL_BLOCKS, changed),
        maxValue: GOAL_BLOCKS,
        isBot: player.isBot,
      })),
    };
  }

  private isEnglish() { return this.config.language === 'en'; }

  /** Zmiana czasu zmiany: świat zostaje, runda się domyka statystykami. */
  private tick(dt: number) {
    this.applyPad();
    if (this.paused || this.ui !== 'playing' || this.ended) return;
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    this.config.onHud(this.hud());
    if (this.timeLeft === 0) this.finish();
  }

  private finish() {
    if (this.ended) return;
    this.ended = true;
    const changed = this.changedBlocks();
    const result: RoundResult = {
      title: this.isEnglish() ? 'Shift complete' : 'Zmiana zakończona',
      subtitle: this.isEnglish()
        ? `The world keeps ${changed} placed or broken blocks. It stays on this device for the next round.`
        : `Świat zatrzymuje ${changed} postawionych i rozbitych bloków. Zostaje na urządzeniu na kolejne rundy.`,
      winnerSlot: null,
      players: this.hud().players,
    };
    this.config.onFinish(result);
  }

  /**
   * Silnik prowadzi własną pętlę renderu, więc JoyPad dokłada tylko lekki zegar
   * zmiany i most wejścia z pada — bez drugiej pętli rysowania.
   */
  private raf = 0;
  private last = 0;
  private frameLoop = (now: number) => {
    this.raf = requestAnimationFrame(this.frameLoop);
    const dt = Math.min(.1, (now - this.last) / 1000);
    this.last = now;
    this.tick(dt);
  };
}
