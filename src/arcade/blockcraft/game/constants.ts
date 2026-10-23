/**
 * Shared world metrics. They live in their own module so that generators
 * (village.ts) can use them without importing world.ts – world.ts imports the
 * generators, and a cycle would break module initialisation order.
 */
export const CS = 16; // chunk size
export const CH = 128; // chunk height
export const SEA = 62;
/** Surface height of a flat world. */
export const FLAT_H = 64;
