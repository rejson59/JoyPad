export const GAME_IDS = ['tanks', 'race', 'orbit', 'snake', 'temple', 'voxel', 'league'] as const;
export type GameId = typeof GAME_IDS[number];

export interface GameInfo {
  id: GameId;
  number: string;
  title: string;
  eyebrow: string;
  genre: string;
  description: string;
  teaser: string;
  cover: string;
  accent: string;
  accentSoft: string;
  controls: string;
  players: string;
  /** Short labels shown in the premium library card. */
  features: string[];
  /** Helps the UI describe the lightweight renderer honestly. */
  renderTag: '2D+' | '3D LITE';
}

export const GAMES: GameInfo[] = [
  {
    id: 'tanks', number: '01', title: 'Stalowy Front', eyebrow: 'PANCERNA ARENA', genre: 'Taktyczna bitwa',
    description: 'Pancerna bitwa na zniszczalnych mapach. Rykoszety, niezależne celowanie wieżą, boty i power-upy. Tu liczy się każdy strzał.',
    teaser: 'Czołgi • Rykoszety • 3 mapy', cover: 'images/menu-tanks.jpg', accent: '#f59e0b', accentSoft: '#a84b0a',
    controls: 'Lewy joystick: jazda · prawy: wieża · OGIEŃ: strzał', players: '2–4 graczy lub boty',
    features: ['Zniszczalne osłony', 'Rykoszety', 'Boty'], renderTag: '2D+',
  },
  {
    id: 'race', number: '02', title: 'Neon Circuit', eyebrow: 'NOCNY WYŚCIG', genre: 'Wyścigi',
    description: 'Pędź po mokrym torze, wyprzedzaj rywali na zakrętach i zbieraj ładunki turbo. Liczy się linia przejazdu, nie tylko prędkość.',
    teaser: 'Drift • Turbo • Rywale SI', cover: 'images/neon-circuit.jpg', accent: '#f97316', accentSoft: '#9a3412',
    controls: 'Joystick: kierunek jazdy · TURBO: przytrzymaj', players: '1–4 graczy + boty',
    features: ['Drift fizyka', 'Mokry tor', 'Turbo'], renderTag: '3D LITE',
  },
  {
    id: 'orbit', number: '03', title: 'Orbitalna Fala', eyebrow: 'KOSMICZNA OBRONA', genre: 'Kooperacja',
    description: 'Wspólnie odeprzyj kolejne fale dronów w polu asteroid. Unikaj salw, rozbijaj skały i ratuj sojuszników, zanim skończą się osłony.',
    teaser: 'Fale • Asteroidy • Współpraca', cover: 'images/orbital-wave.jpg', accent: '#fb923c', accentSoft: '#c2410c',
    controls: 'Lewy joystick: lot · prawy: celowanie · OGIEŃ: strzał', players: '1–4 graczy (współpraca)',
    features: ['Fale wrogów', 'Asteroidy', 'Co-op'], renderTag: '3D LITE',
  },
  {
    id: 'snake', number: '04', title: 'Wężowy Wir', eyebrow: 'ARENA PRZETRWANIA', genre: 'Arcade / versus',
    description: 'Zbieraj impulsy, rośnij i odcinaj rywalom drogę. Sprint daje przewagę, ale jeden zły skręt kończy się zderzeniem.',
    teaser: 'Węże • Sprint • Arena', cover: 'images/serpent-arena.jpg', accent: '#eab308', accentSoft: '#a16207',
    controls: 'Joystick: skręt · SPRINT: przytrzymaj', players: '1–4 graczy + boty',
    features: ['Arena versus', 'Sprint', 'Power-upy'], renderTag: '3D LITE',
  },
  {
    id: 'temple', number: '05', title: 'Skarbiec Świątyni', eyebrow: 'WYPRAWA W RUINY', genre: 'Przygodowa / co-op',
    description: 'Przeszukuj labirynt, otwieraj skrzynie i zbieraj relikty. Unikaj strażników oraz pułapek, by odblokować portal ucieczki.',
    teaser: 'Labirynt • Pułapki • Skarby', cover: 'images/temple-vault.jpg', accent: '#fbbf24', accentSoft: '#854d0e',
    controls: 'Joystick: ruch · AKCJA: sprint / otwórz', players: '1–4 graczy (współpraca)',
    features: ['BFS strażników', 'Pułapki', 'Wspólna ucieczka'], renderTag: '3D LITE',
  },
  {
    id: 'voxel', number: '06', title: 'Voxel Frontier', eyebrow: 'BIOM / CO-OP', genre: 'Budowanie / survival',
    description: 'Zbieraj surowce, wzmacniaj bazę i przetrwaj noc w proceduralnym biomie z klocków. Mały świat, duża swoboda i czytelna kooperacja.',
    teaser: 'Klocki • Surowce • Baza', cover: 'images/voxel-frontier.jpg', accent: '#f97316', accentSoft: '#9a3412',
    controls: 'Joystick: ruch · AKCJA: zbierz / postaw blok', players: '1–4 graczy (co-op)',
    features: ['Voxel 3D lite', 'Budowanie', 'Dzień / noc'], renderTag: '3D LITE',
  },
  {
    id: 'league', number: '07', title: 'Turbo League', eyebrow: 'ARENA / 3D LITE', genre: 'Car soccer',
    description: 'Wskocz za kierownicę i wbij piłkę do bramki. Boost, odbicia od band i szybkie mecze inspirowane car-soccerem — bez ciężkiego silnika 3D.',
    teaser: 'Samochody • Boost • Bramki', cover: 'images/turbo-league.jpg', accent: '#fb923c', accentSoft: '#c2410c',
    controls: 'Joystick: kierunek · TURBO: przytrzymaj', players: '1–4 graczy + boty',
    features: ['Perspektywa 3D', 'Boost', 'Mecze 2v2'], renderTag: '3D LITE',
  },
];

export function gameInfo(id: GameId): GameInfo {
  return GAMES.find(game => game.id === id)!;
}

export function isGameId(value: unknown): value is GameId {
  return GAME_IDS.some(id => id === value);
}
