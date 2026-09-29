import type { Language } from '../platform/i18n';

export const GAME_IDS = ['tanks', 'race', 'orbit', 'snake', 'league', 'blockcraft'] as const;
export type GameId = typeof GAME_IDS[number];

export interface GameText {
  title: string;
  eyebrow: string;
  genre: string;
  description: string;
  teaser: string;
  controls: string;
  players: string;
  features: string[];
}

export interface GameInfo extends GameText {
  id: GameId;
  number: string;
  cover: string;
  accent: string;
  accentSoft: string;
  /** Helps the UI describe the renderer honestly. */
  renderTag: '2D' | '2D+' | '3D' | '3D LITE';
  /** A preview only; the game cannot be launched yet. */
  wip?: boolean;
  english: GameText;
}

const english = (text: GameText): GameText => text;

export const GAMES: GameInfo[] = [
  {
    id: 'tanks', number: '01', title: 'Stalowy Front', eyebrow: 'PANCERNA ARENA', genre: 'Taktyczna bitwa',
    description: 'Pancerna bitwa na zniszczalnych mapach. Rykoszety, niezależne celowanie wieżą, boty i power-upy. Tu liczy się każdy strzał.',
    teaser: 'Czołgi • Rykoszety • 3 mapy', cover: 'images/menu-tanks.webp', accent: '#ff9a52', accentSoft: '#8a421c',
    controls: 'Lewy joystick: jazda · prawy: wieża · OGIEŃ: strzał', players: '2–4 graczy lub boty',
    features: ['Zniszczalne osłony', 'Rykoszety', 'Boty'], renderTag: '2D+',
    english: english({
      title: 'Steel Front', eyebrow: 'ARMORED ARENA', genre: 'Tactical battle',
      description: 'A tank battle across destructible maps. Ricochets, independent turret aiming, bots and power-ups. Every shot counts.',
      teaser: 'Tanks • Ricochets • 3 maps', controls: 'Left stick: move · right stick: turret · FIRE: shoot', players: '2–4 players or bots',
      features: ['Destructible cover', 'Ricochets', 'Bots'],
    }),
  },
  {
    id: 'race', number: '02', title: 'Neonowy Pęd', eyebrow: 'NOCNY WYŚCIG', genre: 'Wyścigi',
    description: 'Nocne miasto, mokry asfalt i zakręty pokonywane bokiem. Zostaw rywali za sobą — liczy się każdy drift.',
    teaser: 'Miasto 3D • Drift • Turbo', cover: 'images/neon-rush.webp', accent: '#ff9a52', accentSoft: '#8a421c',
    controls: 'Joystick: kierunek jazdy · AKCJA: bonus / turbo', players: '1–4 graczy + boty',
    features: ['Nocne wyścigi', 'Podzielony ekran', 'Drift i turbo'], renderTag: '3D',
    english: english({
      title: 'Neon Rush', eyebrow: 'NIGHT RACE', genre: 'Racing',
      description: 'A neon city, wet asphalt and corners taken sideways. Leave the pack behind — every drift counts.',
      teaser: '3D city • Drift • Turbo', controls: 'Stick: steer · ACTION: pickup / turbo', players: '1–4 players + bots',
      features: ['Night racing', 'Split screen', 'Drift and turbo'],
    }),
  },
  {
    id: 'orbit', number: '03', title: 'Orbitalna Fala', eyebrow: 'KOSMICZNA BITWA', genre: 'Bitwa 3D',
    description: 'Wasza eskadra. Bezkresny kosmos. Wybierz statek i przedrzyj się przez pole asteroid, by wspólnie stawić czoła wrogiej flocie.',
    teaser: 'Bitwa 3D • Rakiety • Eskadra', cover: 'images/orbital-wave.webp', accent: '#ff9a52', accentSoft: '#8a421c',
    controls: 'Joystick: lot · OGIEŃ: działa · pełne wychylenie: dopalacz', players: '1–4 graczy (eskadra)',
    features: ['Bitwa 3D', 'Rakiety z namierzaniem', 'Sojusznicze boty'], renderTag: '3D',
    english: english({
      title: 'Orbital Wave', eyebrow: 'SPACE BATTLE', genre: 'Space combat',
      description: 'Your squadron. Open space. Choose a ship and cut through the asteroid field together to face the enemy fleet.',
      teaser: 'Space combat • Missiles • Squad', controls: 'Stick: fly · FIRE: cannons · full tilt: boost', players: '1–4 players (squad)',
      features: ['Space battle', 'Homing missiles', 'Ally bots'],
    }),
  },
  {
    id: 'snake', number: '04', title: 'Wężowy Wir', eyebrow: 'ARENA TAKTYCZNA', genre: 'Arena 2D',
    description: 'Taktyczna arena 2D w klimacie Stalowego Frontu. Zbieraj impulsy, omijaj stalowe przeszkody i przechytrz rywali — sprint zostaw na kluczowy moment.',
    teaser: 'Arena 2D • Taktyka • Sprint', cover: 'images/serpent-arena.webp', accent: '#d8a262', accentSoft: '#69482a',
    controls: 'Strzałki lub joystick: kierunek · AKCJA: sprint', players: '1–4 graczy + boty',
    features: ['2D arena', 'Sterowanie jednym dotykiem', 'Sprint'], renderTag: '2D',
    english: english({
      title: 'Snake Vortex', eyebrow: 'TACTICAL ARENA', genre: '2D arena',
      description: 'A tactical 2D arena inspired by Steel Front. Collect energy, weave around steel obstacles and outsmart your rivals — save the sprint for the right moment.',
      teaser: '2D arena • Tactics • Sprint', controls: 'Arrows or stick: move · ACTION: sprint', players: '1–4 players + bots',
      features: ['2D arena', 'One-touch controls', 'Sprint'],
    }),
  },
  {
    id: 'league', number: '05', title: 'Nitro League', eyebrow: 'SAMOCHODOWA PIŁKA', genre: 'Car soccer',
    description: 'Wskocz za kierownicę i wbij piłkę do bramki. Boost, skoki, demolki i szybkie mecze 2v2 w pełnym 3D — emocje stadionu na jednej kanapie.',
    teaser: 'Auta 3D • Boost • Bramki', cover: 'images/turbo-league.webp', accent: '#ff9a52', accentSoft: '#8a421c',
    controls: 'Gałka: jazda · AKCJA: boost · pchnięcie drugiej gałki w górę: skok', players: '1–4 graczy + boty',
    features: ['Pełne 3D', 'Boost i skoki', 'Mecze 2v2'], renderTag: '3D',
    english: english({
      title: 'Nitro League', eyebrow: 'CAR SOCCER', genre: 'Car soccer',
      description: 'Buckle up and smash the ball into the goal. Boosts, jumps, demolitions and fast 2v2 matches in full 3D — stadium thrills on one couch.',
      teaser: '3D cars • Boost • Goals', controls: 'Stick: drive · ACTION: boost · flick right stick up: jump', players: '1–4 players + bots',
      features: ['Full 3D', 'Boost and jumps', '2v2 matches'],
    }),
  },
  {
    id: 'blockcraft', number: '06', title: 'BlockCraft', eyebrow: 'ZAPOWIEDŹ', genre: 'Sandbox / budowanie', wip: true,
    description: 'Przygotowujemy sandbox z budowaniem z bloków: swobodną eksplorację, zbieranie surowców i wspólne tworzenie własnego świata. To zapowiedź — gra nie jest jeszcze dostępna.',
    teaser: 'Blokowy świat • Budowanie • Co-op', cover: 'images/blockcraft-cover.webp', accent: '#7cd67f', accentSoft: '#285d38',
    controls: 'Sterowanie i zasady gry są jeszcze w przygotowaniu', players: 'Szczegóły wkrótce',
    features: ['Sandbox z bloków', 'Własne budowle', 'Zapowiedź'], renderTag: '3D LITE',
    english: english({
      title: 'BlockCraft', eyebrow: 'COMING SOON', genre: 'Sandbox / building',
      description: 'We are planning a block-building sandbox with open exploration, resource gathering and a world to create together. This is an announcement — the game is not playable yet.',
      teaser: 'Block world • Build • Co-op', controls: 'Controls and game details are still in development', players: 'More details soon',
      features: ['Block-building sandbox', 'Build your world', 'Coming soon'],
    }),
  },
];

export function localizeGame(game: GameInfo, language: Language): GameInfo {
  return language === 'en' ? { ...game, ...game.english } : game;
}

export function gameInfo(id: GameId): GameInfo {
  const game = GAMES.find(candidate => candidate.id === id);
  if (!game) throw new Error(`Unknown game: ${String(id)}`);
  return game;
}

export function isGameId(value: unknown): value is GameId {
  return GAME_IDS.some(id => id === value);
}
