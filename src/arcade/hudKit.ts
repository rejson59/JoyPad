/**
 * Wspólna paleta i typografia dla HUD-ów rysowanych **na płótnie**.
 *
 * Każdy silnik rysuje kilka napisów w świecie gry (imiona nad jednostkami, znaki
 * wodne areny, liczniki bonusów). Robiły to po swojemu: `bold 12px monospace`,
 * `sans-serif`, niebieskawe szarości z własnej palety — arena nie pasowała do
 * reszty konsoli, choć DOM-owy HUD już tak. Płótno nie czyta CSS-ów, więc tokeny
 * `--os-*` mają tu swoje lustra; `selftest:arcade` porównuje je z `palette.css`
 * i nie pozwala im się rozjechać.
 *
 * Zasady dla silników:
 *  - napisy interfejsowe → `hudFont(700, 12)` (Outfit),
 *  - duże napisy w świecie → `hudFont(900, size, 'heading')` (Space Grotesk),
 *  - liczby i liczniki → `hudFont(800, size, 'mono')` (JetBrains Mono),
 *  - znak wodny areny i teksty pomocnicze → `HUD.muted` / `HUD.secondary`,
 *  - sygnały stanu: `HUD.success`, `HUD.warning`, `HUD.danger` (nie własne hexy).
 */

/** Lustra tokenów z `src/console/palette.css` (Obsidian / Ember). */
export const HUD = {
  bg: '#09090b',
  surface: '#111114',
  panel: '#19191d',
  raised: '#242429',
  edge: '#37373f',
  text: '#f5f5f7',
  secondary: '#c5c5cd',
  muted: '#a0a0ad',
  accent: '#ff9a52',
  accentBright: '#ffb77f',
  success: '#9ccfae',
  warning: '#edbd78',
  danger: '#ed8175',
  /** `--os-line` jako rgba — płótno woli jawną przezroczystość. */
  line: 'rgba(221, 221, 237, 0.11)',
  /** Zasłona pod napisem w świecie (czytelność na jasnej arenie). */
  scrim: 'rgba(9, 9, 11, 0.72)',
} as const;

export type HudFontKind = 'ui' | 'heading' | 'mono';

const FAMILIES: Record<HudFontKind, string> = {
  ui: '"Outfit", system-ui, sans-serif',
  heading: '"Space Grotesk", "Outfit", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, monospace',
};

/** Składnia `ctx.font`: waga, rozmiar i rodzina z systemu (a nie `sans-serif`). */
export function hudFont(weight: number, size: number, kind: HudFontKind = 'ui'): string {
  return `${weight} ${size}px ${FAMILIES[kind]}`;
}

/**
 * Napis w świecie gry z zasłoną pod spodem: najpierw ciemny „cień” tekstu, potem
 * właściwy kolor. Dzięki temu imię gracza jest czytelne i na piasku, i na neonie.
 */
export function drawWorldLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  options: { color?: string; size?: number; weight?: number; kind?: HudFontKind; align?: CanvasTextAlign; scrim?: boolean } = {},
): void {
  const { color = HUD.text, size = 11, weight = 700, kind = 'ui', align = 'center', scrim = true } = options;
  const previousFont = ctx.font;
  const previousAlign = ctx.textAlign;
  const previousFill = ctx.fillStyle;
  const previousStroke = ctx.strokeStyle;
  const previousWidth = ctx.lineWidth;
  const previousJoin = ctx.lineJoin;
  ctx.font = hudFont(weight, size, kind);
  ctx.textAlign = align;
  if (scrim) {
    ctx.lineWidth = Math.max(2, size / 3.2);
    ctx.lineJoin = 'round';
    ctx.strokeStyle = HUD.scrim;
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
  // Silnik rysuje dalej swoją scenę: nie zostawiamy po sobie żadnego stanu.
  ctx.font = previousFont;
  ctx.textAlign = previousAlign;
  ctx.fillStyle = previousFill;
  ctx.strokeStyle = previousStroke;
  ctx.lineWidth = previousWidth;
  ctx.lineJoin = previousJoin;
}

/** Znak wodny areny (lewy dolny róg): jedna forma we wszystkich grach. */
export function drawArenaWatermark(ctx: CanvasRenderingContext2D, text: string, y: number, x = 25): void {
  drawWorldLabel(ctx, text, x, y, { color: HUD.muted, size: 12, weight: 700, kind: 'mono', align: 'left', scrim: false });
}
