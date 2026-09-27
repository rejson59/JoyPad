export type MatchMode = 'classic' | 'tournament' | '2v2';
export const MATCH_MODE_LABEL: Record<MatchMode, string> = { classic: 'ZWYKŁA RUNDA', tournament: 'TURNIEJ', '2v2': '2V2 / DRUŻYNY' };
export function nextTournamentRound(round: number): number { return (Math.max(0, Math.floor(round)) + 1) % 3; }
