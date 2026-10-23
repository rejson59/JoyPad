import type { Stack } from './inventory';
import { fuelSeconds, smeltResult, stackLimit } from './items';

export const COOK_TIME = 4;

export interface FurnaceState {
  x: number;
  y: number;
  z: number;
  input: Stack | null;
  fuel: Stack | null;
  output: Stack | null;
  burn: number;
  burnMax: number;
  cook: number;
  /** 1.8: 1 = piec stoi w Netherze (osobny klucz, obcy wymiar go nie skasuje). */
  dim?: number;
}

export function furnaceKey(x: number, y: number, z: number): string {
  return `${x},${y},${z}`;
}

export function emptyFurnace(x: number, y: number, z: number): FurnaceState {
  return { x, y, z, input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 };
}

/** Advances smelting. Returns true when the block should show as lit. */
export function tickFurnace(f: FurnaceState, dt: number): boolean {
  const result = f.input ? smeltResult(f.input.id) : null;
  const limit = result != null ? stackLimit(result) : 64;
  const canOut = result != null && (!f.output || (f.output.id === result && f.output.count < limit));

  if (f.burn <= 0 && canOut && f.fuel && fuelSeconds(f.fuel.id) > 0) {
    f.burnMax = fuelSeconds(f.fuel.id);
    f.burn = f.burnMax;
    f.fuel.count--;
    if (f.fuel.count <= 0) f.fuel = null;
  }

  if (f.burn > 0) f.burn = Math.max(0, f.burn - dt);

  if (f.burn > 0 && canOut && f.input && result != null) {
    f.cook += dt / COOK_TIME;
    if (f.cook >= 1) {
      f.cook = 0;
      f.input.count--;
      if (f.input.count <= 0) f.input = null;
      if (!f.output) f.output = { id: result, count: 1 };
      else f.output.count++;
    }
  } else {
    f.cook = Math.max(0, f.cook - dt * 0.4);
  }
  return f.burn > 0;
}
