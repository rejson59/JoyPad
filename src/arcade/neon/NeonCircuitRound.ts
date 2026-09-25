import type { PadInput } from '../../net/protocol';
import type { GameRound, Racer, RoundConfig, RoundHud, RoundPowerUp, RoundResult } from '../runtime';
import { KART_COLORS, NEON_RACE_DURATION, NeonRushScene, type HudState } from './NeonRushScene';

/**
 * Adapter silnika Neonowy Pęd (Three.js) do runtime'u JoyPad.
 *
 * Silnik wywodzi się z niezależnego projektu wyścigowego. Ten mostek zachowuje
 * jego miasto, tor, fizykę kartów, itemy i post-processing, a JoyPad zarządza
 * cyklem życia, wejściami z telefonów, HUD-em, haptyką i kamerami split-screen.
 */
export class NeonCircuitRound implements GameRound {
  private readonly scene: NeonRushScene;
  private readonly canvas: HTMLCanvasElement;
  private readonly originalDisplay: string;
  private ended = false;
  private readonly humanPlayers: Racer[];

  constructor(canvas: HTMLCanvasElement, private readonly config: RoundConfig) {
    const container = canvas.parentElement;
    if (!container) throw new Error('Neonowy Pęd wymaga zamontowanego kontenera gry');
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
    const x = input?.dirX ?? 0;
    const y = input?.dirY ?? 0;
    return {
      // Older pad clients only sent fwd/turn; do not let a defaulted zero
      // dirX/dirY hide their actual joystick values.
      x: Math.abs(x) > 0.001 ? x : input?.turn ?? 0,
      y: Math.abs(y) > 0.001 ? y : -(input?.fwd ?? 0),
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

const NEON_POWER_UPS: Record<NonNullable<HudState['item']>, Omit<RoundPowerUp, 'count'>> = {
  boost: { label: 'DOPALACZ', color: '#ff9d2e', hint: 'AKCJA · natychmiastowy zryw' },
  triple: { label: 'POTRÓJNY DOPALACZ', color: '#ffcf4a', hint: 'AKCJA · zostały trzy użycia' },
  rocket: { label: 'RAKIETA', color: '#ff5b5b', hint: 'AKCJA · namierz rywala przed Tobą' },
  mine: { label: 'MINA', color: '#f47cff', hint: 'AKCJA · zostaw pułapkę za sobą' },
  shield: { label: 'TARCZA', color: '#59d9ff', hint: 'AKCJA · pochłania następne trafienie' },
};

function neonPowerUp(hud: HudState): RoundPowerUp | null {
  if (hud.rolling) return {
    label: 'LOSOWANIE…',
    count: 0,
    color: '#f97316',
    hint: 'Bonus jest właśnie przygotowywany',
    rolling: true,
  };
  if (!hud.item) return null;
  return { ...NEON_POWER_UPS[hud.item], count: hud.item === 'triple' ? hud.itemCount : 1 };
}

export function neonHudToRoundHud(hud: HudState, config: RoundConfig): RoundHud {
  const human = config.players.filter(player => !player.isBot);
  const players = hud.standings.map(standing => {
    const owner = human[standing.slot];
    return {
      slot: owner?.slot ?? (standing.isPlayer ? standing.slot : 100 + standing.slot),
      name: standing.name,
      color: standing.color,
      score: Math.min(standing.lap, 99),
      detail: standing.finished ? `META · ${standing.place}. miejsce` : `${Math.max(1, standing.lap)}/${[2, 3, 4][config.primary] ?? 3} okr.`,
      value: Math.round(standing.progress * 100),
      maxValue: 100,
      isBot: !standing.isPlayer,
    };
  });
  return {
    timeLeft: Math.max(0, NEON_RACE_DURATION - hud.raceTime),
    countdown: hud.phase === 'countdown' ? Number(hud.countdown) || 1 : 0,
    paused: hud.paused,
    objective: `${[2, 3, 4][config.primary] ?? 3} okrążenia · ${hud.message || 'nocna trasa'}`,
    status: `NEONOWY PĘD / ${hud.phase.toUpperCase()}`,
    players,
    powerUp: neonPowerUp(hud),
  };
}
