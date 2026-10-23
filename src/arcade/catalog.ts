import type { Language } from '../platform/i18n';

export const GAME_IDS = ['tanks', 'race', 'orbit', 'snake', 'league', 'pizza', 'blockcraft'] as const;
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
    teaser: 'Miasto 3D • Drift • Turbo', cover: 'images/neon-rush.webp', accent: '#ff7ad9', accentSoft: '#7a2c62',
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
    teaser: 'Bitwa 3D • Rakiety • Eskadra', cover: 'images/orbital-wave.webp', accent: '#baa6fa', accentSoft: '#4a3d78',
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
    id: 'league', number: '05', title: 'Turbo League', eyebrow: 'MECZ NA STADIONIE', genre: 'Piłka samochodowa',
    description: 'Wskocz za kierownicę i wbij piłkę do bramki. Pełna fizyka 3D, boost z żółtych pól, odbicia od band i powtórki goli — mecze od 1v1 do 2v2, zawsze z podziałem na drużyny.',
    teaser: 'Samochody • Boost • Bramki', cover: 'images/turbo-league.webp', accent: '#4fd2ff', accentSoft: '#1d5a72',
    controls: 'Joystick: kierunek jazdy · AKCJA: boost (przytrzymaj)', players: '1–4 graczy + boty',
    features: ['Fizyka 3D', 'Powtórki goli', 'Mecze do 2v2'], renderTag: '3D',
    english: english({
      title: 'Turbo League', eyebrow: 'STADIUM MATCH', genre: 'Car soccer',
      description: 'Take the wheel and drive the ball into the goal. Full 3D physics, boost from the yellow pads, wall rebounds and goal replays — team matches from 1v1 up to 2v2.',
      teaser: 'Cars • Boost • Goals', controls: 'Stick: steer · ACTION: boost (hold)', players: '1–4 players + bots',
      features: ['3D physics', 'Goal replays', 'Up to 2v2'],
    }),
  },
  {
    id: 'pizza', number: '06', title: 'WEBZA', eyebrow: 'NOCNA DOSTAWA', genre: 'Dostawa pizzy 3D',
    description: 'Noc, dachy i pizza, która nie może ostygnąć. Huśtaj się na sieci między budynkami i trafiaj w światło zamówień — im wyżej i bardziej widowiskowo, tym więcej punktów.',
    teaser: 'Dachy • Sieć • Pizza', cover: 'images/webza.webp', accent: '#c9f25e', accentSoft: '#586b23',
    controls: 'Joystick: bieg · AKCJA: sieć (przytrzymaj) · pizza leci sama w klienta', players: '1–4 graczy (współpraca lub rywalizacja)',
    features: ['Huśtanie na sieci', 'Zamówienia z dachów', 'Współpraca i rywalizacja'], renderTag: '3D',
    english: english({
      title: 'WEBZA', eyebrow: 'NIGHT DELIVERY', genre: '3D pizza delivery',
      description: 'Night, rooftops and a pizza that must not go cold. Swing on your web between buildings and hit the light of every order — the higher and flashier, the more points.',
      teaser: 'Rooftops • Web • Pizza', controls: 'Stick: run · ACTION: web (hold) · the pizza flies at the customer by itself', players: '1–4 players (co-op or versus)',
      features: ['Web swinging', 'Rooftop orders', 'Co-op and versus'],
    }),
  },
  {
    id: 'blockcraft', number: '07', title: 'BlockCraft', eyebrow: 'OTWARTY ŚWIAT', genre: 'Sandbox / budowanie',
    description: 'Nieskończony voxelowy świat z biomami, wioskami, redstoneem i Netherem: kop, buduj, handluj i gotuj w samotnej zmianie czasowej. Silnik BlockCraft 2.29 z repo `mconline` — świat zostaje na urządzeniu.',
    teaser: 'Blokowy świat • Budowanie • Redstone', cover: 'images/blockcraft-cover.webp', accent: '#7cd67f', accentSoft: '#285d38',
    controls: 'WASD: ruch · mysz: rozglądanie i kopanie · AKCJA (pad): stawiaj blok · E: ekwipunek', players: '1 gracz · świat zostaje na urządzeniu',
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
