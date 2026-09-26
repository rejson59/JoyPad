import { GAMES } from '../arcade/catalog';
export const playableIndices = GAMES.flatMap((game, i) => game.wip ? [] : [i]);
export function nextPlayable(index: number, direction: number) {
  const position = playableIndices.indexOf(index);
  return playableIndices[(position + direction + playableIndices.length) % playableIndices.length];
}
