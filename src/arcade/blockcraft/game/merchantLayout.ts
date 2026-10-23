/**
 * BlockCraft 2.27 – układ okna handlu 1:1 z Minecraftem.
 *
 * Współrzędne pochodzą wprost z waniliowego `MerchantScreen` (GUI ma
 * 276 × 166 „pikseli GUI”) i zgadzają się co do piksela z teksturą
 * `gui/container/villager.png` z paczki 26.2:
 *  • lista ofert 88 × 140 przy (5, 18), wiersz ma 20 px,
 *  • pasek przewijania 6 px przy x = 94,
 *  • sloty na towar (136, 37) i (162, 37), wyjście (220, 37),
 *  • siatka ekwipunku od (108, 84), pasek skrótów na (108, 142).
 *
 * Trzymamy to w osobnym module, żeby i komponent, i testy headless liczyły
 * rozmieszczenie z jednego źródła prawdy (zamiast zgadywać marginesy CSS).
 */

export const MERCHANT = {
  width: 276,
  height: 166,
  /** Tytuł okna – waniliowe „Handel” w lewym górnym rogu. */
  title: { x: 8, y: 6 },
  /** Lista ofert (przewijana). */
  list: { x: 5, y: 18, w: 88, h: 140, row: 20 },
  /** Pasek przewijania po prawej stronie listy (`scroller` z paczki, 6 × 27). */
  scrollbar: { x: 94, y: 18, w: 6, h: 140, thumb: 27 },
  /** Dwa sloty „co oddajesz”. */
  input1: { x: 136, y: 37 },
  input2: { x: 162, y: 37 },
  /** Duży slot wyniku (ramka 26 × 26, przedmiot 16 × 16 wyśrodkowany). */
  output: { x: 220, y: 37, frameX: 215, frameY: 32, frameSize: 26 },
  /** Strzałka „towar → zapłata” – wtopiona w panel (186,38)–(207,52). */
  arrow: { x: 186, y: 38, w: 22, h: 15 },
  /** Znaczek „brak towaru” z paczki (`out_of_stock.png`, 28 × 21) na wyniku. */
  outOfStock: { x: 214, y: 34, w: 28, h: 21 },
  /** Pasek doświadczenia mieszkańca pod strzałką (`experience_bar_*`, 102 × 5). */
  xp: { x: 136, y: 57, w: 102, h: 5 },
  /** Ekwipunek gracza: siatka 9 × 3 i pasek skrótów. */
  inventory: { x: 108, y: 84, step: 18, cols: 9, rows: 3 },
  hotbar: { x: 108, y: 142, step: 18, cols: 9 },
  /** Margines wokół przedmiotu w slocie (16 px w 18-pikselowej kratce). */
  slotInset: 1,
  /** Maksymalna skala panelu na ekranie (2× jak waniliowe GUI scale). */
  maxScale: 2,
} as const;

/** Ile wierszy ofert mieści się na liście bez przewijania (7). */
export function merchantVisibleRows(): number {
  return Math.floor(MERCHANT.list.h / MERCHANT.list.row);
}

/** Największe przesunięcie listy w wierszach (0, gdy wszystko się mieści). */
export function merchantMaxScroll(rowCount: number): number {
  return Math.max(0, rowCount - merchantVisibleRows());
}

/**
 * Wysokość „kciuka” paska przewijania w pikselach GUI. Waniliowy
 * `scroller.png` ma 6 × 27 i taki rozmiar zostaje – zmienia się tylko jego
 * położenie w torze (dokładnie jak w `MerchantScreen`).
 */
export function merchantThumbHeight(rowCount: number): number {
  return rowCount <= merchantVisibleRows() ? MERCHANT.scrollbar.h : MERCHANT.scrollbar.thumb;
}

/** Pozycja „kciuka” (0..1) dla podanego przesunięcia. */
export function merchantThumbOffset(rowCount: number, scroll: number): number {
  const max = merchantMaxScroll(rowCount);
  if (max <= 0) return 0;
  return Math.max(0, Math.min(1, scroll / max));
}

/** Górna krawędź wiersza `i` w liście (piksele GUI). */
export function merchantRowTop(i: number): number {
  return MERCHANT.list.y + i * MERCHANT.list.row;
}

/** Czy w ogóle jest co przewijać? */
export function merchantScrollable(rowCount: number): boolean {
  return rowCount > merchantVisibleRows();
}

/** Czy dana oferta mieści się jeszcze na widocznej liście? */
export function merchantRowVisible(index: number, scroll: number, rowCount: number): boolean {
  return index >= scroll && index < scroll + merchantVisibleRows() && index < rowCount;
}

/** Współrzędne środka slotu ekwipunku (0–35) w pikselach GUI. */
export function merchantInvSlot(i: number): { x: number; y: number } {
  if (i < 27) {
    return {
      x: MERCHANT.inventory.x + (i % MERCHANT.inventory.cols) * MERCHANT.inventory.step,
      y: MERCHANT.inventory.y + Math.floor(i / MERCHANT.inventory.cols) * MERCHANT.inventory.step,
    };
  }
  return {
    x: MERCHANT.hotbar.x + (i - 27) * MERCHANT.hotbar.step,
    y: MERCHANT.hotbar.y,
  };
}

/** Skala panelu dla danego okna – panel nigdy nie wychodzi za ekran. */
export function merchantScale(viewportW: number, viewportH: number): number {
  const byW = (viewportW - 24) / MERCHANT.width;
  const byH = (viewportH - 96) / MERCHANT.height;
  return Math.max(0.75, Math.min(MERCHANT.maxScale, byW, byH));
}
