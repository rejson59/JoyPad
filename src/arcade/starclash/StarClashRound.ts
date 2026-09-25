import type { PadInput } from '../../net/protocol';
import { gameAudio } from '../../game/audio';
import type { GameRound, Racer, RoundConfig, RoundHud, RoundPlayer } from '../runtime';
import { Game } from './Game';

/**
 * Adapter STAR CLASH 3D (silnik z orbitalna-fala.zip) do runtime'u JoyPad.
 *
 * Silnik pochodzi z niezależnego projektu kosmicznego. Ten mostek zachowuje
 * jego bitwy, SI wrogów, rakietę z namierzaniem i efekty, a JoyPad zarządza
 * cyklem życia, wejściami z telefonów, HUD-em i haptyką. Tryb kanapowy:
 * każdy ludzki gracz dostaje statek, sterowanie idzie z padów i klawiatur.
 */

const SHIPS = ['interceptor', 'fighter', 'heavy'] as const;
const ROUND_SECONDS = 300;

/** Klawiatury dla graczy przy jednym komputerze (jak w grach 2D). */
const KEY_SETS = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: ['Space', 'KeyQ'], boost: ['ShiftLeft', 'ShiftRight'] },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: ['Enter', 'Numpad0'], boost: [] },
  { up: 'KeyT', down: 'KeyG', left: 'KeyF', right: 'KeyH', fire: ['KeyR'], boost: [] },
  { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', fire: ['KeyU'], boost: [] },
] as const;

interface Ctrl { x: number; y: number; fire: boolean; boost: boolean }

export class StarClashRound implements GameRound {
  private readonly game: Game;
  private readonly canvas: HTMLCanvasElement;
  private readonly originalDisplay: string;
  private readonly humans: Racer[];
  private readonly keys = new Set<string>();
  private ended = false;

  constructor(canvas: HTMLCanvasElement, private readonly config: RoundConfig) {
    const container = canvas.parentElement;
    if (!container) throw new Error('STAR CLASH wymaga zamontowanego kontenera gry');
    this.canvas = canvas;
    this.originalDisplay = canvas.style.display;
    // Silnik tworzy własny canvas WebGL2 — chowamy gościnny kanvas runtime'u.
    canvas.style.display = 'none';

    this.humans = config.players.filter(player => !player.isBot);
    if (!this.humans.length) this.humans = [config.players[0] || { slot: 0, name: 'GRACZ 1', color: '#fbbf24', isBot: false }];

    this.game = new Game(container, { lowFx: config.quality === 'performance' });
    this.game.padMode = true;
    this.game.readCtrl = (i: number) => this.readCtrl(i);
    this.game.onShipFx = (slot: number, fx: 'hit' | 'kill' | 'dead') => this.config.onFx(slot, fx);
    this.game.onHud = () => this.pushHud();
    this.game.onEnd = (res: {
      win: boolean; kills: number; damage: number; accuracy: number; time: number;
      ships?: { name: string; slot: number; kills: number; alive: boolean }[];
    }) => this.finish(res);

    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);

    // Po przejściu z menu rodzic maluje nowy kadr — wtedy dopiero poprawny rozmiar.
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  start() {
    const cls = SHIPS[this.config.primary] ?? 'fighter';
    const difficulty = Math.max(0, Math.min(2, this.config.secondary));
    const enemies = Math.min(12, this.humans.length * 2 + difficulty + 3);
    const allyBots = Math.max(1, 5 - this.humans.length - difficulty);
    this.game.startBattleSquad(
      this.humans.map(h => ({ cls, up: null, name: h.name })),
      { enemies, allyBots, difficulty },
    );
    this.pushHud();
  }

  togglePause() {
    this.game.paused = !this.game.paused;
    this.pushHud();
  }

  destroy() {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    this.game.destroy();
    this.canvas.style.display = this.originalDisplay;
  }

  private keyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
    if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) this.togglePause();
    this.keys.add(e.code);
  };
  private keyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private blur = () => { this.keys.clear(); };

  /** Klawiatura + pad (jak CanvasRound.input): wygrywa aktywna klawiatura, inaczej gałka. */
  private readCtrl(i: number): Ctrl {
    const set = KEY_SETS[i];
    const human = this.humans[i];
    const pad: PadInput | undefined = human ? this.config.padInputs[human.slot] : undefined;
    if (!set) {
      const px = pad?.steer === 'tank' ? pad.turn : pad?.dirX ?? pad?.turn ?? 0;
      const py = pad?.steer === 'tank' ? -pad.fwd : pad?.dirY ?? -(pad?.fwd ?? 0);
      return { x: px, y: py, fire: !!pad?.fire, boost: false };
    }
    const kx = Number(this.keys.has(set.right)) - Number(this.keys.has(set.left));
    const ky = Number(this.keys.has(set.down)) - Number(this.keys.has(set.up));
    const px = pad?.steer === 'tank' ? pad.turn : pad?.dirX ?? pad?.turn ?? 0;
    const py = pad?.steer === 'tank' ? -pad.fwd : pad?.dirY ?? -(pad?.fwd ?? 0);
    const mag = Math.max(1, Math.hypot(kx, ky));
    return {
      x: kx || ky ? kx / mag : px,
      y: kx || ky ? ky / mag : py,
      fire: !!pad?.fire || set.fire.some(code => this.keys.has(code)),
      boost: set.boost.some(code => this.keys.has(code)),
    };
  }

  private syncMute() {
    if (this.game.sfx?.master) this.game.sfx.master.gain.value = gameAudio.muted ? 0 : 0.5;
  }

  private pushHud() {
    if (this.ended) return;
    this.syncMute();
    const ships = this.game.humanShips as { name: string; humanSlot: number; hp: number; maxHp: number; sh: number; maxSh: number; missiles: number; kills: number; dead: boolean }[];
    const players: RoundPlayer[] = this.humans.map((h, i) => {
      const s = ships[i];
      const hp = s ? Math.max(0, Math.round(s.hp)) : 0;
      const kills = s?.kills ?? 0;
      return {
        slot: h.slot, name: h.name, color: h.color, score: kills,
        detail: s ? (s.dead ? 'STATEK STRACONY' : `${hp} HP · ${kills}✕`) : '—',
        value: s ? Math.max(0, s.hp) + Math.max(0, s.sh) : 0,
        maxValue: s ? s.maxHp + s.maxSh : 1,
        isBot: false,
      };
    });
    const lead = ships[0];
    const timeLeft = Math.max(0, ROUND_SECONDS - (this.game.time || 0));
    const enemiesLeft = (this.game.ships as { team: number; dead: boolean }[]).filter(x => x.team === 1 && !x.dead).length;
    const hud: RoundHud = {
      timeLeft,
      countdown: 0,
      paused: !!this.game.paused,
      objective: 'ZNISZCZ ESKADRĘ WROGA',
      status: `Pozostało wrogów: ${enemiesLeft}`,
      players,
      powerUp: lead ? { label: 'RAKIETY', count: lead.missiles, color: '#fbbf24', hint: 'ODPALANE AUTOMATYCZNIE', rolling: false } : null,
    };
    this.config.onHud(hud);
  }

  private finish(res: { win: boolean; ships?: { name: string; slot: number; kills: number; alive: boolean }[] }) {
    if (this.ended) return;
    this.ended = true;
    const ranked = [...(res.ships ?? [])].sort((a, b) => b.kills - a.kills);
    const best = ranked[0];
    const players: RoundPlayer[] = this.humans.map((h, i) => {
      const s = res.ships?.[i];
      return {
        slot: h.slot, name: h.name, color: h.color, score: s?.kills ?? 0,
        detail: s ? (s.alive ? `Przetrwał · ${s.kills}✕` : `Zestrzelony · ${s.kills}✕`) : '—',
        isBot: false,
      };
    });
    this.config.onFinish({
      title: res.win ? 'ZWYCIĘSTWO' : 'ESKADRA POKONANA',
      subtitle: res.win ? 'Wroga eskadra rozbita — sektor bezpieczny' : 'Statek flagowy stracony. Odpocznij i spróbujcie ponownie',
      winnerSlot: res.win ? null : best ? this.humans[best.slot]?.slot ?? null : null,
      allWon: res.win,
      players,
    });
  }
}
