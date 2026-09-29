// Skala: 1 jednostka = 100 uu (jak w Rocket League)
export const A = 40.96; // połowa szerokości areny (x)
export const B = 51.2; // połowa długości areny (z)
export const H = 20.44; // wysokość
export const RC = 11; // promień zaokrąglenia pionowych narożników
export const RF = 3.0; // promień łuku podłoga/ściana/sufit
export const GOAL_W = 8.93;
export const GOAL_H = 6.42;
export const GOAL_D = 8.8;
export const STAND_OFFSET = 13;

export const GRAV = 6.5;
export const BALL_R = 0.93;
export const STEP = 1 / 120;

export const CAR_HALF = { x: 0.46, y: 0.19, z: 0.66 };
export const RIDE = 0.19;
export const MAX_SPEED = 23;
export const SUPERSONIC = 22;

export const TEAM_HEX = ['#1f6dff', '#ff7a18'];
export const TEAM_NAMES = ['NIEBIESCY', 'POMARAŃCZOWI'];
export const TEAM_LIGHT = ['#7fb2ff', '#ffb36b'];

// [x, z, duża]
export const BOOST_PADS: [number, number, boolean][] = [
  [-30.72, -40.96, true],
  [30.72, -40.96, true],
  [-35.84, 0, true],
  [35.84, 0, true],
  [-30.72, 40.96, true],
  [30.72, 40.96, true],
  [0, -42.4, false],
  [-17.92, -41.84, false],
  [17.92, -41.84, false],
  [-9.4, -33.08, false],
  [9.4, -33.08, false],
  [0, -28.16, false],
  [-35.84, -24.84, false],
  [35.84, -24.84, false],
  [-17.88, -23, false],
  [17.88, -23, false],
  [-20.48, -10.36, false],
  [0, -10.24, false],
  [20.48, -10.36, false],
  [-10.24, 0, false],
  [10.24, 0, false],
  [-20.48, 10.36, false],
  [0, 10.24, false],
  [20.48, 10.36, false],
  [-17.88, 23, false],
  [17.88, 23, false],
  [-35.84, 24.84, false],
  [35.84, 24.84, false],
  [0, 28.16, false],
  [-9.4, 33.08, false],
  [9.4, 33.08, false],
  [-17.92, 41.84, false],
  [17.92, 41.84, false],
  [0, 42.4, false],
];

export const BOT_NAMES = [
  'Viper', 'Nova', 'Blaze', 'Zenek', 'Turbo_Ola', 'Kuba_RL', 'Drift King', 'Apex',
  'Falcon', 'Mamba', 'Orion', 'Wiktor', 'Ghost', 'Rakieta', 'Hektor', 'Sonic',
];

export const ACCENTS = [
  '#00e5ff', '#ff2bd6', '#b6ff00', '#ffd400', '#ffffff', '#ff3b3b', '#8f5bff', '#00ff9c', '#ff8a00', '#ff5fa2',
];
