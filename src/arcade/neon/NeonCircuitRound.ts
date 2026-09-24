import type { PadInput } from '../../net/protocol';
import type { GameRound, Racer, RoundConfig, RoundHud, RoundResult } from '../runtime';
import { KART_COLORS, NEON_RACE_DURATION, NeonRushScene, type HudState } from './NeonRushScene';

/**
 * Adapter for the uploaded futuristic-3d-racing-game archive.
 *
 * The archive is a standalone Three.js game. This bridge keeps its city, track,
 * kart physics, items and post-processing, while giving JoyPad ownership of the
 * lifecycle, remote inputs, HUD, haptics and split-screen cameras.
 */
export class NeonCircuitRound implements GameRound {
  private readonly scene: NeonRushScene;
  private readonly canvas: HTMLCanvasElement;
  private readonly originalDisplay: string;
  private ended = false;
  private readonly humanPlayers: Racer[];

  constructor(canvas: HTMLCanvasElement, private readonly config: RoundConfig) {
    const container = canvas.parentElement;
    if (!container) throw new Error('Neon Circuit needs a mounted game container');
    this.canvas = canvas;
    this.originalDisplay = canvas.style.display;
    // The uploaded scene owns its WebGL canvas. Keep the host canvas as a stable
    // mount anchor for ArcadeGameView and restore it on dispose.
    canvas.style.display = 'none';

    this.humanPlayers = config.players.filter(player => !player.isBot);
    if (!this.humanPlayers.length) this.humanPlayers = [config.players[0] || { slot: 0, name: 'GRACZ 1', color: '#00f0ff', isBot: false }];
    const quality = config.quality === 'performance' ? 0 : config.quality === 'quality' ? 2 : 1;
    const primaryLaps = [2, 3, 4][config.primary] ?? 3;
    const difficulty = Math.max(0, Math.min(2, config.secondary));

    this.scene = new NeonRushScene(container, {
      name: this.humanPlayers[0].name,
      colorIdx: 0,
      difficulty,
      quality,
      laps: primaryLaps,
      rain: true,
      playerCount: this.humanPlayers.length,
      aiCount: config.players.filter(player => player.isBot).length,
      playerNames: this.humanPlayers.map(player => player.name),
      playerColorIdx: this.humanPlayers.map((_, index) => index % KART_COLORS.length),
      playerSlots: this.humanPlayers.map(player => player.slot),
      displayMode: config.displayMode,
      readInput: slot => this.readPadInput(slot),
      onFx: (slot, fx) => {
        // The host sends the final win/lose pulse from RoundResult; forwarding
        // the scene's early win event as well would vibrate twice.
        if (fx !== 'win' && (fx === 'fire' || fx === 'hit' || fx === 'pickup' || fx === 'dead')) config.onFx(slot, fx);
      },
    }, hud => this.handleHud(hud));

    // A bounded resize after the parent has painted avoids a zero-aspect camera
    // when the menu-to-game transition happens in the same frame.
    window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')));
  }

  start() {
    this.scene.start();
  }

  togglePause() {
    this.scene.togglePause();
  }

  destroy() {
    this.scene.dispose();
    this.canvas.style.display = this.originalDisplay;
  }

  private readPadInput(playerIndex: number) {
    const player = this.humanPlayers[playerIndex];
    const input: PadInput | undefined = player ? this.config.padInputs[player.slot] : undefined;
    // JoyPad's joystick sends screen-space dirY (up is negative), which is
    // also the signed convention expected by Neon Rush's throttle bridge.
    return {
      x: input?.dirX ?? input?.turn ?? 0,
      y: input?.dirY ?? -(input?.fwd ?? 0),
      action: Boolean(input?.fire),
    };
  }

  private handleHud(hud: HudState) {
    this.config.onHud(neonHudToRoundHud(hud, this.config));
    if (hud.results && !this.ended) {
      this.ended = true;
      const roundHud = neonHudToRoundHud(hud, this.config);
      const winner = roundHud.players[0];
      const result: RoundResult = {
        title: winner ? `${winner.name} wygrywa!` : 'Koniec wyścigu',
        subtitle: 'Neonowa trasa rozstrzygnięta.',
        winnerSlot: winner && !winner.isBot ? winner.slot : null,
        players: roundHud.players,
      };
      this.config.onFinish(result);
    }
  }
}

export function neonHudToRoundHud(hud: HudState, config: RoundConfig): RoundHud {
  const human = config.players.filter(player => !player.isBot);
  const players = hud.standings.map(standing => {
    const owner = human[standing.slot];
    return {
      slot: owner?.slot ?? standing.slot,
      name: standing.name,
      color: standing.color,
      score: Math.min(standing.lap, 99),
      detail: standing.finished ? `META · ${standing.place}. miejsce` : `${Math.max(1, standing.lap)}/${[2, 3, 4][config.primary] ?? 3} okr.`,
      value: Math.min(100, Math.max(0, 100 - standing.place * 6)),
      maxValue: 100,
      isBot: !standing.isPlayer,
    };
  });
  return {
    timeLeft: Math.max(0, NEON_RACE_DURATION - hud.raceTime),
    countdown: hud.phase === 'countdown' ? Number(hud.countdown) || 1 : 0,
    paused: hud.paused,
    objective: `${[2, 3, 4][config.primary] ?? 3} okrążenia · ${hud.message || 'nocna trasa'}`,
    status: `NEON CIRCUIT / ${hud.phase.toUpperCase()}`,
    players,
  };
}
