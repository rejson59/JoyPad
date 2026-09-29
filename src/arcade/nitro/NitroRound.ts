import type { PadInput } from '../../net/protocol';
import type { GameRound, Racer, RoundConfig, RoundHud, RoundPlayer } from '../runtime';
import { Game } from './Game';
import type { HumanCtrl, NitroEventData, NitroMatchSpec, RosterHuman } from './types';

/**
 * Adapter NITRO LEAGUE (silnik car-soccer 3D) do runtime'u JoyPad.
 *
 * - Każdy ludzki gracz z pokoju dostaje własne auto; boty uzupełniają składy.
 * - Telefon: gałka = jazda, AKCJA = boost, druga gałka (twin-stick) = skok
 *   (pchnięcie w górę) + drift (w dół); pady minimalne dostają auto-skok.
 * - Klawiatura: P1 WASD+Spacja/Shift, P2 strzałki+Enter/Prawy Shift,
 *   P3 TFGH+R/Y, P4 IJKL+U/O. C = kamera piłka/auto.
 * - Wynik drużynowy: zwycięzca to drużyna; reprezentant to pierwszy człowiek
 *   zwycięskiej drużyny, a `allWon` dostają wszyscy ludzie tej drużyny.
 */

const ROUND_MINUTES = 3;
const GOAL_LIMITS = [3, 5, 7];
const KEY_SETS = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], jump: ['Space'], boost: ['ShiftLeft', 'ShiftRight'], hand: ['KeyX'], cam: ['KeyC'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['Enter', 'Numpad0'], boost: ['ShiftRight'], hand: ['Numpad1'], cam: ['Numpad2'] },
  { up: ['KeyT'], down: ['KeyG'], left: ['KeyF'], right: ['KeyH'], jump: ['KeyR'], boost: ['KeyY'], hand: ['KeyB'], cam: ['KeyV'] },
  { up: ['KeyI'], down: ['KeyK'], left: ['KeyJ'], right: ['KeyL'], jump: ['KeyU'], boost: ['KeyO'], hand: ['KeyM'], cam: ['KeyN'] },
] as const;

interface CtrlState { jump: boolean; boost: boolean; cam: boolean }

export class NitroRound implements GameRound {
  private readonly game: Game;
  private readonly canvas: HTMLCanvasElement;
  private readonly originalDisplay: string;
  private readonly humans: Racer[];
  private readonly slotOfHuman: number[] = [];
  private readonly keys = new Set<string>();
  private readonly prev: CtrlState[] = [];
  private started = false;
  private finished = false;
  private hudT = 0;
  private clock = 0;

  constructor(canvas: HTMLCanvasElement, private readonly config: RoundConfig) {
    const container = canvas.parentElement;
    if (!container) throw new Error('NITRO LEAGUE wymaga zamontowanego kontenera gry');
    this.canvas = canvas;
    this.originalDisplay = canvas.style.display;
    // Silnik tworzy własny canvas WebGL2 — chowamy gościnny kanvas runtime'u.
    canvas.style.display = 'none';

    this.humans = config.players.filter(player => !player.isBot);
    if (!this.humans.length) this.humans = [config.players[0] || { slot: 0, name: 'GRACZ 1', color: '#fbbf24', isBot: false }];

    const quality = config.quality === 'performance' ? 0 : config.quality === 'quality' ? 2 : 1;
    this.game = new Game(container, { onSettings: () => undefined }, { quality, volume: 0.8, music: false, fov: 76, shake: true });
    this.game.readCtrl = (human, dt) => this.readCtrl(human, dt);
    this.game.onEvent = event => this.onEngineEvent(event);
    this.game.onPadFx = (human, fx) => this.config.onFx(this.slotOfHuman[human] ?? 0, fx);
    this.game.afterRender = canvas => {
      this.config.onFrame?.(canvas);
      this.clock += 1 / 60;
      this.pushHud();
    };
    this.game.setViewMode(config.displayMode === 'split' ? 'split' : 'shared');

    window.addEventListener('keydown', this.keyDown);
    window.addEventListener('keyup', this.keyUp);
    window.addEventListener('blur', this.blur);
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  start() {
    if (this.started) return;
    this.started = true;
    const botsWanted = Math.max(0, Math.min(3, this.config.secondary ?? 1));
    const humans = this.humans;
    const botCount = humans.length + botsWanted < 2 ? 1 : botsWanted;
    const roster: RosterHuman[] = humans.map((player, i) => ({
      name: player.name,
      team: i % 2,
      accent: player.color,
      autoJump: true,
    }));
    const spec: NitroMatchSpec = {
      humans: roster,
      botCount,
      difficulty: Math.max(0, Math.min(2, botWantedDifficulty(botsWanted))),
      minutes: ROUND_MINUTES,
      goalLimit: GOAL_LIMITS[this.config.primary] ?? 5,
    };
    humans.forEach((player, i) => { this.slotOfHuman[i] = player.slot; });
    for (let i = 0; i < humans.length; i++) this.prev.push({ jump: false, boost: false, cam: false });
    this.game.unlockAudio();
    this.game.startMatch(spec);
    this.pushHud();
  }

  togglePause() {
    this.game.setPaused(!this.game.isPaused());
    this.pushHud();
  }

  destroy() {
    window.removeEventListener('keydown', this.keyDown);
    window.removeEventListener('keyup', this.keyUp);
    window.removeEventListener('blur', this.blur);
    this.game.dispose();
    this.canvas.style.display = this.originalDisplay;
  }

  private keyDown = (e: KeyboardEvent) => {
    if (e.repeat) return;
    this.keys.add(e.code);
    if (this.game.isPaused() && (e.code === 'Enter' || e.code === 'Space')) this.game.setPaused(false);
    if (e.code === 'KeyP' || e.code === 'Escape') this.togglePause();
  };
  private keyUp = (e: KeyboardEvent) => { this.keys.delete(e.code); };
  private blur = () => { this.keys.clear(); };

  /** Wejście i-tego człowieka: klawiatura (slot) + pad (slot). */
  private readCtrl(h: number, _dt: number): HumanCtrl {
    const slot = this.slotOfHuman[h] ?? h;
    const codes = KEY_SETS[slot % KEY_SETS.length];
    const any = (list: readonly string[]) => list.some(code => this.keys.has(code));
    const pad: PadInput | undefined = this.config.padInputs[slot];
    const px = pad?.steer === 'tank' ? pad.turn : pad?.dirX ?? pad?.turn ?? 0;
    const pyRaw = pad?.steer === 'tank' ? pad.fwd : pad?.dirY ?? -(pad?.fwd ?? 0);
    // Gałka: góra = przód. Strefa martwa 12% dla kulturalnej jazdy.
    const dead = (v: number) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
    const throttle = clamp(-dead(pyRaw), -1, 1);
    const steer = clamp(dead(px), -1, 1);
    const aimX = dead(pad?.aimX ?? 0);
    const aimY = dead(pad?.aimY ?? 0);
    const fire = !!pad?.fire;

    const jump = any(codes.jump) || aimY < -0.55;
    const boost = fire || any(codes.boost);
    const handbrake = aimY > 0.6 || any(codes.hand);
    const prev = this.prev[h] ?? (this.prev[h] = { jump: false, boost: false, cam: false });
    const camKey = any(codes.cam);
    const jumpEdge = jump && !prev.jump;
    const camPressed = camKey && !prev.cam;
    prev.jump = jump;
    prev.boost = boost;
    prev.cam = camKey;
    if (camPressed) this.game.toggleBallCam(h);

    return {
      throttle,
      steer,
      pitch: throttle,
      roll: clamp(aimX, -1, 1),
      jump,
      jumpPressed: jumpEdge,
      boost,
      handbrake,
    };
  }

  /* ---------- Moments ---------- */
  private onEngineEvent(e: NitroEventData) {
    const at = Math.round(this.clock * 10) / 10;
    if (e.kind === 'goal') {
      const humans = this.game.humansNow();
      const scorerIdx = humans.findIndex(hh => hh.roster?.name === e.name);
      const slot = (scorerIdx >= 0 ? this.slotOfHuman[scorerIdx] : this.humans[0]?.slot) ?? 0;
      this.config.onMoment?.({
        kind: 'score',
        slot,
        title: `GOL — ${e.name}`,
        detail: e.speed ? `Uderzenie ${e.speed} km/h` : '',
        at,
        weight: 60 + Math.min(30, (e.speed ?? 0) / 4),
      });
    } else if (e.kind === 'save') {
      this.config.onMoment?.({ kind: 'objective', slot: this.slotOfHuman[0] ?? 0, title: 'OBRONA', detail: e.name, at, weight: 34 });
    } else if (e.kind === 'demo') {
      this.config.onMoment?.({ kind: 'kill', slot: this.slotOfHuman[0] ?? 0, title: 'DEMOLKA', detail: `${e.name} → ${e.victim ?? ''}`, at, weight: 40 });
    } else if (e.kind === 'overtime') {
      this.config.onMoment?.({ kind: 'objective', slot: this.slotOfHuman[0] ?? 0, title: 'DOGRYWKA', detail: 'Złoty gol decyduje', at, weight: 28 });
    } else if (e.kind === 'end') {
      this.finish();
    }
  }

  /* ---------- HUD / wyniki ---------- */
  private pushHud() {
    if (this.finished) return;
    const now = performance.now();
    if (now - this.hudT < 120) return;
    this.hudT = now;
    const en = this.config.language === 'en';
    const scores = this.game.scoresNow();
    const humans = this.game.humansNow();
    const stats = this.game.statsNow();
    const players: RoundPlayer[] = this.config.players.map(player => {
      const humanIdx = this.slotOfHuman.indexOf(player.slot);
      if (player.isBot || humanIdx < 0) {
        const stat = stats.find(s => s.name === player.name);
        return {
          ...player,
          score: stat ? Math.round(stat.score) : 0,
          detail: stat ? `${stat.goals} ${en ? 'goals' : 'goli'}` : '',
          value: stat?.goals ?? 0,
        };
      }
      const h = humans[humanIdx];
      const stat = stats.find(s => s.name === player.name);
      return {
        ...player,
        score: stat ? Math.round(stat.score) : 0,
        detail: h?.demolished
          ? (en ? `back in ${h.respawn.toFixed(0)}s` : `powrót za ${h.respawn.toFixed(0)}s`)
          : `${en ? 'BOOST' : 'BOOST'} ${Math.round(h?.boost ?? 0)}%`,
        value: Math.round(h?.boost ?? 0),
        maxValue: 100,
      };
    });
    const hud: RoundHud = {
      timeLeft: this.game.timeNow(),
      countdown: this.game.countdownNow(),
      paused: this.game.isPaused(),
      objective: en ? 'Score in the ORANGE goal' : 'Trafiaj do bramki POMARAŃCZOWYCH',
      status: this.game.feedNow() || (this.game.overtimeNow() ? (en ? 'OVERTIME — golden goal' : 'DOGRYWKA — złoty gol') : `${scores[0]} : ${scores[1]}`),
      players,
      powerUp: null,
    };
    this.config.onHud(hud);
  }

  private finish() {
    if (this.finished) return;
    this.finished = true;
    const en = this.config.language === 'en';
    const scores = this.game.scoresNow();
    const winner = this.game.winnerNow();
    const stats = this.game.statsNow();
    const teamName = (team: number) => (team === 0 ? (en ? 'Blue' : 'Niebiescy') : (en ? 'Orange' : 'Pomarańczowi'));
    const humans = this.game.humansNow();
    const winningHumans = winner === 2 ? [] : humans.filter(hh => hh.team === winner);
    const repSlot = winningHumans.length ? this.slotOfHuman[humans.indexOf(winningHumans[0])] ?? null : null;
    const players: RoundPlayer[] = this.config.players.map(player => {
      const humanIdx = this.slotOfHuman.indexOf(player.slot);
      const stat = stats.find(s => s.name === player.name);
      const team = humanIdx >= 0 ? humans[humanIdx]?.team : stat?.team ?? 0;
      const won = winner !== 2 && team === winner;
      const isHuman = humanIdx >= 0;
      return {
        ...player,
        score: stat ? Math.round(stat.score) : 0,
        detail: stat ? `${stat.goals} ${en ? 'goals' : 'goli'} · ${stat.assists} ${en ? 'assists' : 'asyst'} · ${stat.saves} ${en ? 'saves' : 'obron'}` : '',
        value: stat?.goals ?? 0,
        ...(isHuman ? { allWon: winner === 2 ? false : won } : {}),
      } as RoundPlayer;
    });
    const title = winner === 2
      ? (en ? 'Stadium draw' : 'Remis na stadionie')
      : (en ? `${teamName(winner)} win` : `Wygrywa drużyna ${teamName(winner)}`);
    this.config.onFinish({
      title,
      subtitle: `${scores[0]} : ${scores[1]}${this.game.overtimeNow() ? (en ? ' · overtime' : ' · po dogrywce') : ''}`,
      winnerSlot: repSlot,
      allWon: winner !== 2 && this.humans.some(player => {
        const idx = this.slotOfHuman.indexOf(player.slot);
        return humans[idx]?.team === winner;
      }),
      players,
    });
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function botWantedDifficulty(bots: number) {
  return bots === 0 ? 0 : bots === 1 ? 1 : 2;
}
