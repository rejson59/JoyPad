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
  renderTag: '2D+' | '3D' | '3D LITE';
  /** Gra w przebudowie — pokazywana w bibliotece jako „W BUDOWIE”, nie da się jej uruchomić. */
  wip?: boolean;
}

export const GAMES: GameInfo[] = [
  {
    id: 'tanks', number: '01', title: 'Stalowy Front', eyebrow: 'PANCERNA ARENA', genre: 'Taktyczna bitwa',
    description: 'Pancerna bitwa na zniszczalnych mapach. Rykoszety, niezależne celowanie wieżą, boty i power-upy. Tu liczy się każdy strzał.',
    teaser: 'Czołgi • Rykoszety • 3 mapy', cover: 'images/menu-tanks.webp', accent: '#f59e0b', accentSoft: '#a84b0a',
    controls: 'Lewy joystick: jazda · prawy: wieża · OGIEŃ: strzał', players: '2–4 graczy lub boty',
    features: ['Zniszczalne osłony', 'Rykoszety', 'Boty'], renderTag: '2D+',
  },
  {
    id: 'race', number: '02', title: 'Neonowy Pęd', eyebrow: 'NOCNY WYŚCIG', genre: 'Wyścigi',
    description: 'Futurystyczny wyścig z rozpakowanego świata Neon Rush: mokry tor, proceduralne megamiasto, rampy, drifty, turbo i przedmioty na trasie.',
    teaser: 'Miasto 3D • Drift • Turbo', cover: 'images/neon-rush.webp', accent: '#f97316', accentSoft: '#9a3412',
    controls: 'Joystick: kierunek jazdy · AKCJA: bonus / turbo', players: '1–4 graczy + boty',
    features: ['Miasto Three.js', 'Split-screen', 'Turbo + itemy'], renderTag: '3D',
  },
  {
    id: 'orbit', number: '03', title: 'Orbitalna Fala', eyebrow: 'KOSMICZNA BITWA', genre: 'Bitwa 3D',
    description: 'STAR CLASH 3D — kosmiczna bitwa z prawdziwego zdarzenia. Wybierz klasę statku, prowadź eskadrę przeciw flocie wroga, strzelaj z dział, namierzaj rakiety i dopalaj się przez pole asteroid.',
    teaser: 'Bitwa 3D • Rakiety • Eskadra', cover: 'images/orbital-wave.webp', accent: '#fb923c', accentSoft: '#c2410c',
    controls: 'Joystick: lot · OGIEŃ: działa · pełne wychylenie: dopalacz', players: '1–4 graczy (eskadra)',
    features: ['Bitwa 3D', 'Rakiety z namierzaniem', 'Sojusznicze boty'], renderTag: '3D',
  },
  {
    id: 'snake', number: '04', title: 'Wężowy Wir', eyebrow: 'W BUDOWIE', genre: 'Arcade / versus', wip: true,
    description: 'Zbieraj impulsy, rośnij i odcinaj rywalom drogę. Sprint daje przewagę, ale jeden zły skręt kończy się zderzeniem.',
    teaser: 'Węże • Sprint • Arena', cover: 'images/serpent-arena.webp', accent: '#eab308', accentSoft: '#a16207',
    controls: 'Joystick: skręt · SPRINT: przytrzymaj', players: '1–4 graczy + boty',
    features: ['Arena versus', 'Sprint', 'Power-upy'], renderTag: '3D LITE',
  },
  {
    id: 'temple', number: '05', title: 'Skarbiec Świątyni', eyebrow: 'W BUDOWIE', genre: 'Przygodowa / co-op', wip: true,
    description: 'Przeszukuj labirynt, otwieraj skrzynie i zbieraj relikty. Unikaj strażników oraz pułapek, by odblokować portal ucieczki.',
    teaser: 'Labirynt • Pułapki • Skarby', cover: 'images/temple-vault.webp', accent: '#fbbf24', accentSoft: '#854d0e',
    controls: 'Joystick: ruch · AKCJA: sprint / otwórz', players: '1–4 graczy (współpraca)',
    features: ['BFS strażników', 'Pułapki', 'Wspólna ucieczka'], renderTag: '3D LITE',
  },
  {
    id: 'voxel', number: '06', title: 'Voxel Frontier', eyebrow: 'W BUDOWIE', genre: 'Budowanie / survival', wip: true,
    description: 'Zbieraj surowce, wzmacniaj bazę i przetrwaj noc w proceduralnym biomie z klocków. Mały świat, duża swoboda i czytelna kooperacja.',
    teaser: 'Klocki • Surowce • Baza', cover: 'images/voxel-frontier.webp', accent: '#f97316', accentSoft: '#9a3412',
    controls: 'Joystick: ruch · AKCJA: zbierz / postaw blok', players: '1–4 graczy (co-op)',
    features: ['Voxel 3D lite', 'Budowanie', 'Dzień / noc'], renderTag: '3D LITE',
  },
  {
    id: 'league', number: '07', title: 'Turbo League', eyebrow: 'W BUDOWIE', genre: 'Car soccer', wip: true,
    description: 'Wskocz za kierownicę i wbij piłkę do bramki. Boost, odbicia od band i szybkie mecze inspirowane car-soccerem — bez ciężkiego silnika 3D.',
    teaser: 'Samochody • Boost • Bramki', cover: 'images/turbo-league.webp', accent: '#fb923c', accentSoft: '#c2410c',
    controls: 'Joystick: kierunek · TURBO: przytrzymaj', players: '1–4 graczy + boty',
    features: ['Perspektywa 3D', 'Boost', 'Mecze 2v2'], renderTag: '3D LITE',
  },
];

export function gameInfo(id: GameId): GameInfo {
  const game = GAMES.find(candidate => candidate.id === id);
  if (!game) throw new Error(`Nieznana gra: ${String(id)}`);
  return game;
}

export function isGameId(value: unknown): value is GameId {
  return GAME_IDS.some(id => id === value);
}
