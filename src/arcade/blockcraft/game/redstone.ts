import { B, isRedstoneSource } from './blocks';

export type WorldLike = {
  getBlock(x: number, y: number, z: number): number;
  setBlock(x: number, y: number, z: number, id: number): void;
  peekBlock(x: number, y: number, z: number): number;
};

const DIRS: [number, number, number][] = [
  [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1],
];

function isPowered(world: WorldLike, x: number, y: number, z: number): boolean {
  for (const [dx, dy, dz] of DIRS) {
    const nid = world.getBlock(x + dx, y + dy, z + dz);
    if (isRedstoneSource(nid)) return true;
    // redstone block powers adjacent
    if (nid === B.REDSTONE_BLOCK) return true;
    // powered rail etc not yet
  }
  return false;
}

export function tickRedstone(world: WorldLike, changed: Set<string>) {
  // For each changed block, check neighbors for lamp/piston/torch updates
  const toCheck = new Set<string>();
  for (const key of changed) {
    const [x, y, z] = key.split(',').map(Number);
    for (const [dx, dy, dz] of DIRS) {
      toCheck.add(`${x + dx},${y + dy},${z + dz}`);
    }
    toCheck.add(key);
  }
  for (const key of toCheck) {
    const [x, y, z] = key.split(',').map(Number);
    const id = world.getBlock(x, y, z);
    if (id === B.REDSTONE_LAMP) {
      if (isPowered(world, x, y, z)) {
        world.setBlock(x, y, z, B.REDSTONE_LAMP_ON);
      }
    } else if (id === B.REDSTONE_LAMP_ON) {
      if (!isPowered(world, x, y, z)) {
        world.setBlock(x, y, z, B.REDSTONE_LAMP);
      }
    } else if (id === B.REDSTONE_TORCH) {
      // torch turns off if block it is attached to is powered (simplified: if block below is powered)
      const below = world.getBlock(x, y - 1, z);
      if (isPowered(world, x, y - 1, z) || isRedstoneSource(below) || below === B.REDSTONE_BLOCK) {
        world.setBlock(x, y, z, B.REDSTONE_TORCH_OFF);
      }
    } else if (id === B.REDSTONE_TORCH_OFF) {
      const below = world.getBlock(x, y - 1, z);
      if (!isPowered(world, x, y - 1, z) && !isRedstoneSource(below) && below !== B.REDSTONE_BLOCK) {
        world.setBlock(x, y, z, B.REDSTONE_TORCH);
      }
    } else if (id === B.PISTON || id === B.STICKY_PISTON) {
      if (isPowered(world, x, y, z)) {
        // extend if air in front (assume north for now, but we can use facing later)
        // For simplicity, push block in +Z direction
        // We will handle directional pistons via block metadata in future; for now extend forward
        // Check if already extended
        const front = world.getBlock(x, y, z + 1);
        const head = world.getBlock(x, y, z + 1);
        if (head !== B.PISTON_HEAD && front === B.AIR) {
          // we need to know piston facing – we store facing via separate logic? For now assume facing +Z
          // Actually we will handle piston facing in engine placement
        }
      }
    }
  }
}

export function toggleLever(world: WorldLike, x: number, y: number, z: number): boolean {
  const id = world.getBlock(x, y, z);
  if (id === B.LEVER) {
    world.setBlock(x, y, z, B.LEVER_ON);
    return true;
  } else if (id === B.LEVER_ON) {
    world.setBlock(x, y, z, B.LEVER);
    return true;
  }
  return false;
}

export function pressButton(world: WorldLike, x: number, y: number, z: number): boolean {
  const id = world.getBlock(x, y, z);
  if (id === B.BUTTON) {
    world.setBlock(x, y, z, B.BUTTON_ON);
    return true;
  }
  return false;
}

/**
 * Lights an obsidian frame the player clicked with flint & steel.
 *
 * Searches every plausible 4×5 frame that covers the clicked block, in both
 * planes. The old code walked down from the click and often missed frames
 * when the player lit the top or a side column – now any frame block works.
 */
export function tryCreatePortal(world: WorldLike, x: number, y: number, z: number): boolean {
  for (const axis of ['x', 'z'] as const) {
    // The clicked block lies on the frame, so the bottom-left corner can be at
    // most 3 blocks sideways and 4 blocks below it.
    for (let lo = -3; lo <= 0; lo++) {
      for (let ly = y - 4; ly <= y; ly++) {
        const lx = axis === 'x' ? x + lo : x;
        const lz = axis === 'z' ? z + lo : z;
        if (ly < 0) continue;
        // outer ring must be obsidian...
        let ok = true;
        for (let f = 0; f < 4 && ok; f++) {
          if (world.getBlock(lx + (axis === 'x' ? f : 0), ly, lz + (axis === 'z' ? f : 0)) !== B.OBSIDIAN) ok = false;
          if (world.getBlock(lx + (axis === 'x' ? f : 0), ly + 4, lz + (axis === 'z' ? f : 0)) !== B.OBSIDIAN) ok = false;
        }
        for (let fy = 1; fy < 4 && ok; fy++) {
          if (world.getBlock(lx, ly + fy, lz) !== B.OBSIDIAN) ok = false;
          if (world.getBlock(lx + (axis === 'x' ? 3 : 0), ly + fy, lz + (axis === 'z' ? 3 : 0)) !== B.OBSIDIAN) ok = false;
        }
        if (!ok) continue;
        // ...and the 2×3 interior must be free (air or an already-lit portal).
        for (let i = 1; i <= 2 && ok; i++) {
          for (let j = 1; j <= 3 && ok; j++) {
            const ix = lx + (axis === 'x' ? i : 0);
            const iz = lz + (axis === 'z' ? i : 0);
            const bid = world.getBlock(ix, ly + j, iz);
            if (bid !== B.AIR && bid !== B.NETHER_PORTAL) ok = false;
          }
        }
        if (!ok) continue;
        // fill the interior with portal blocks
        for (let i = 1; i <= 2; i++) {
          for (let j = 1; j <= 3; j++) {
            world.setBlock(lx + (axis === 'x' ? i : 0), ly + j, lz + (axis === 'z' ? i : 0), B.NETHER_PORTAL);
          }
        }
        return true;
      }
    }
  }
  return false;
}
