/**
 * Czyste FLIP dla okienek systemu (bez DOM, żeby dało się to przetestować w node).
 *
 * Start animacji to prostokąt elementu, w który gracz trafił (klik, Enter, `select`
 * z pilota), meta to realny kadr okienka. Skalujemy wyłącznie w dół: okienko ma
 * „wyrosnąć" z przycisku, a nie z pustki.
 */
export interface WindowRect { left: number; top: number; width: number; height: number; }
export interface WindowOrigin { x: number; y: number; w: number; h: number; }
export interface WindowFlip { dx: number; dy: number; sx: number; sy: number; radius: number; skip: boolean; }

const MIN_SCALE = 0.04;
/** Poniżej tej różnicy morfing wygląda jak szarpnięcie — lepiej zwykłe wniknięcie. */
const NEARLY_IDENTICAL = 0.94;

export function windowFlip(from: WindowOrigin | null, rect: WindowRect): WindowFlip {
  const empty = { dx: 0, dy: 0, sx: 1, sy: 1, radius: 0, skip: true };
  if (!from || !(rect.width > 0) || !(rect.height > 0) || !(from.w > 0) || !(from.h > 0)) return empty;
  const sx = Math.min(1, Math.max(MIN_SCALE, from.w / rect.width));
  const sy = Math.min(1, Math.max(MIN_SCALE, from.h / rect.height));
  if (sx > NEARLY_IDENTICAL && sy > NEARLY_IDENTICAL) return empty;
  return {
    dx: Math.round(from.x - (rect.left + rect.width / 2)),
    dy: Math.round(from.y - (rect.top + rect.height / 2)),
    sx: Number(sx.toFixed(3)),
    sy: Number(sy.toFixed(3)),
    // Startujemy od kapsułki: promień z krótszego boku elementu źródłowego.
    radius: Math.round(Math.min(400, Math.max(8, Math.min(from.w, from.h) / 2))),
    skip: false,
  };
}
