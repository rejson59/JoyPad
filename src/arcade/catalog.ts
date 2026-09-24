export const GAME_IDS = ['tanks', 'race', 'orbit', 'snake', 'temple'] as const;
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
}

export const GAMES: GameInfo[] = [
  {
    id: 'tanks', number: '01', title: 'Stalowy Front', eyebrow: 'PANCERNA ARENA', genre: 'Taktyczna bitwa',
    description: 'Pancerna bitwa na zniszczalnych mapach. Rykoszety, niezależne celowanie wieżą, boty i power-upy. Tu liczy się każdy strzał.',
    teaser: 'Czołgi • Rykoszety • 3 mapy', cover: 'images/menu-tanks.jpg', accent: '#fbbf24', accentSoft: '#b45309',
    controls: 'Lewy joystick: jazda · prawy: wieża · OGIEŃ: strzał', players: '2–4 graczy lub boty',
  },
  {
    id: 'race', number: '02', title: 'Neon Circuit', eyebrow: 'NOCNY WYŚCIG', genre: 'Wyścigi',
    description: 'Pędź po mokrym torze, wyprzedzaj rywali na zakrętach i zbieraj ładunki turbo. Liczy się linia przejazdu, nie tylko prędkość.',
    teaser: 'Drift • Turbo • Rywale SI', cover: 'images/neon-circuit.jpg', accent: '#58e1f5', accentSoft: '#713de1',
    controls: 'Joystick: kierunek jazdy · TURBO: przytrzymaj', players: '1–4 graczy + boty',
  },
  {
    id: 'orbit', number: '03', title: 'Orbitalna Fala', eyebrow: 'KOSMICZNA OBRONA', genre: 'Kooperacja',
    description: 'Wspólnie odeprzyj kolejne fale dronów w polu asteroid. Unikaj salw, rozbijaj skały i ratuj sojuszników, zanim skończą się osłony.',
    teaser: 'Fale • Asteroidy • Współpraca', cover: 'images/orbital-wave.jpg', accent: '#7dd3fc', accentSoft: '#2563eb',
    controls: 'Lewy joystick: lot · prawy: celowanie · OGIEŃ: strzał', players: '1–4 graczy (współpraca)',
  },
  {
    id: 'snake', number: '04', title: 'Wężowy Wir', eyebrow: 'NEONOWA ARENA', genre: 'Arcade / versus',
    description: 'Zbieraj impulsy, rośnij i odcinaj rywalom drogę. Sprint daje przewagę, ale jeden zły skręt kończy się zderzeniem.',
    teaser: 'Węże • Sprint • Arena', cover: 'images/serpent-arena.jpg', accent: '#a3e635', accentSoft: '#16a34a',
    controls: 'Joystick: skręt · SPRINT: przytrzymaj', players: '1–4 graczy + boty',
  },
  {
    id: 'temple', number: '05', title: 'Skarbiec Świątyni', eyebrow: 'WYPRAWA W RUINY', genre: 'Przygodowa / co-op',
    description: 'Przeszukuj labirynt, otwieraj skrzynie i zbieraj relikty. Unikaj strażników oraz pułapek, by odblokować portal ucieczki.',
    teaser: 'Labirynt • Pułapki • Skarby', cover: 'images/temple-vault.jpg', accent: '#f5c76b', accentSoft: '#8a642d',
    controls: 'Joystick: ruch · AKCJA: sprint / otwórz skrzynię', players: '1–4 graczy (współpraca)',
  },
];

export function gameInfo(id: GameId): GameInfo {
  return GAMES.find(game => game.id === id)!;
}

export function isGameId(value: unknown): value is GameId {
  return GAME_IDS.some(id => id === value);
}
