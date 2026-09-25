import type { MapId, WallState } from './types';

export const WORLD_W = 1600;
export const WORLD_H = 1000;

export interface MapDef {
  id: MapId;
  name: string;
  desc: string;
  night: boolean;
  weather: 'none' | 'rain' | 'dust';
  groundBase: string;
  groundAlt: string;
  buildWalls: () => WallState[];
  spawns: { x: number; y: number; angle: number }[];
}

function w(x: number, y: number, wdt: number, h: number, type: WallState['type'], hp?: number): WallState {
  const baseHp = hp ?? (type === 'concrete' ? 3 : type === 'brick' ? 2 : type === 'metal' ? 4 : type === 'sandbag' ? 2 : 1);
  return { x, y, w: wdt, h, hp: baseHp, maxHp: baseHp, type, destroyed: false, shake: 0 };
}

export const MAPS: Record<MapId, MapDef> = {
  desert: {
    id: 'desert',
    name: 'PUSTYNNA BURZA',
    desc: 'Palące słońce, lotny piasek i ruiny starej bazy. Śliskie wydmy, szybkie pociski.',
    night: false,
    weather: 'dust',
    groundBase: '#b99a62',
    groundAlt: '#a98852',
    spawns: [
      { x: 140, y: 140, angle: Math.PI / 4 },
      { x: 1460, y: 860, angle: -Math.PI * 0.75 },
      { x: 1460, y: 140, angle: Math.PI * 0.75 },
      { x: 140, y: 860, angle: -Math.PI / 4 },
    ],
    buildWalls: () => [
      // central fortress
      w(700, 420, 200, 40, 'concrete'),
      w(700, 540, 200, 40, 'concrete'),
      w(700, 460, 40, 80, 'sandbag'),
      w(860, 460, 40, 80, 'sandbag'),
      // scattered crates
      w(350, 300, 60, 60, 'crate'),
      w(420, 300, 60, 60, 'crate'),
      w(350, 640, 60, 60, 'crate'),
      w(1190, 300, 60, 60, 'crate'),
      w(1120, 640, 60, 60, 'crate'),
      w(1190, 640, 60, 60, 'crate'),
      // brick ruins
      w(520, 150, 160, 30, 'brick'),
      w(920, 820, 160, 30, 'brick'),
      w(150, 440, 30, 120, 'brick'),
      w(1420, 440, 30, 120, 'brick'),
      // metal containers
      w(600, 80, 140, 44, 'metal'),
      w(860, 876, 140, 44, 'metal'),
      // mid cover
      w(300, 470, 120, 34, 'sandbag'),
      w(1180, 470, 120, 34, 'sandbag'),
      w(760, 150, 80, 80, 'crate'),
      w(760, 770, 80, 80, 'crate'),
    ],
  },
  nightcity: {
    id: 'nightcity',
    name: 'MIASTO NOCĄ',
    desc: 'Neonowe ulice, mokry asfalt i reflektory czołgów. Walka w ciemności — światła decydują.',
    night: true,
    weather: 'rain',
    groundBase: '#23242a',
    groundAlt: '#1d1e24',
    spawns: [
      { x: 140, y: 500, angle: 0 },
      { x: 1460, y: 500, angle: Math.PI },
      { x: 800, y: 130, angle: Math.PI / 2 },
      { x: 800, y: 870, angle: -Math.PI / 2 },
    ],
    buildWalls: () => [
      // city blocks
      w(420, 180, 200, 120, 'concrete'),
      w(980, 180, 200, 120, 'concrete'),
      w(420, 700, 200, 120, 'concrete'),
      w(980, 700, 200, 120, 'concrete'),
      w(700, 400, 200, 200, 'concrete'),
      // neon barriers (metal)
      w(280, 460, 100, 30, 'metal'),
      w(1220, 460, 100, 30, 'metal'),
      w(280, 510, 100, 30, 'metal'),
      w(1220, 510, 100, 30, 'metal'),
      // crates alleys
      w(660, 200, 55, 55, 'crate'),
      w(885, 200, 55, 55, 'crate'),
      w(660, 745, 55, 55, 'crate'),
      w(885, 745, 55, 55, 'crate'),
      w(150, 200, 55, 55, 'crate'),
      w(1395, 745, 55, 55, 'crate'),
      w(150, 745, 55, 55, 'crate'),
      w(1395, 200, 55, 55, 'crate'),
      // sandbags roadblocks
      w(730, 330, 140, 28, 'sandbag'),
      w(730, 642, 140, 28, 'sandbag'),
    ],
  },
  forest: {
    id: 'forest',
    name: 'BŁOTNY LAS',
    desc: 'Gęsty las po ulewie. Błoto spowalnia, drzewa (skrzynie) dają osłonę. Deszcz tłumi dźwięk.',
    night: false,
    weather: 'rain',
    groundBase: '#4a5d3a',
    groundAlt: '#42543a',
    spawns: [
      { x: 140, y: 140, angle: Math.PI / 4 },
      { x: 1460, y: 860, angle: -Math.PI * 0.75 },
      { x: 1460, y: 140, angle: Math.PI * 0.75 },
      { x: 140, y: 860, angle: -Math.PI / 4 },
    ],
    buildWalls: () => [
      w(500, 350, 120, 120, 'crate'),
      w(980, 350, 120, 120, 'crate'),
      w(500, 530, 120, 120, 'crate'),
      w(980, 530, 120, 120, 'crate'),
      w(730, 440, 140, 120, 'concrete'),
      w(250, 200, 44, 200, 'brick'),
      w(1306, 600, 44, 200, 'brick'),
      w(250, 600, 200, 40, 'sandbag'),
      w(1150, 200, 200, 40, 'sandbag'),
      w(700, 80, 200, 36, 'metal'),
      w(700, 884, 200, 36, 'metal'),
      w(80, 460, 60, 80, 'crate'),
      w(1460, 460, 60, 80, 'crate'),
    ],
  },
};
