/**
 * Ile kolumn ma półka z grami.
 *
 * Biblioteka ma być jednym ekranem (na telewizorze bez przewijania), więc liczba
 * kolumn to kompromis między szerokością okna a równym podziałem kafelków. Sama
 * siatka CSS o stałej liczbie kolumn zostawia sieroty: przy sześciu grach i czterech
 * kolumnach drugi rząd ma dwa kafelki i wygląda jak urwany, a wolne miejsce i tak
 * wypycha bibliotekę poza ekran. Zasada jest taka:
 *   - wszystko mieści się w jednym rzędzie → bierzemy cały rząd (najwyższe kafelki),
 *   - inaczej największy podział bez reszty (mniej rzędów = mniej pionu),
 *   - a gdy podziału bez reszty nie ma → ten, który zostawia najkrótszy, a przy
 *     równej liczbie rzędów najpełniejszy ostatni rząd.
 *
 * Funkcje są czyste: liczby wchodzą, liczby wychodzą, więc selftest może przejrzeć
 * całą tabelę przypadków bez uruchamiania Reacta ani mierzenia DOM.
 */

/** Próg szerokości okna i maksymalna liczba kolumn na takim ekranie. */
export interface RailBreakpoint { readonly minWidth: number; readonly maxColumns: number }

/**
 * Maksymalna szerokość półki na danym ekranie. Progi odpowiadają profilom z
 * `viewport.ts` (tv / desktop / tablet / handheld), ale patrzą na szerokość okna,
 * bo to ona decyduje o tym, ile okładek mieści się w jednym rzędzie.
 */
export const RAIL_BREAKPOINTS: readonly RailBreakpoint[] = [
  { minWidth: 1700, maxColumns: 6 },
  { minWidth: 1100, maxColumns: 4 },
  { minWidth: 760, maxColumns: 3 },
  { minWidth: 0, maxColumns: 2 },
];

/** Twardy sufit: więcej kolumn i okładki przestają być czytelne z kanapy. */
export const RAIL_MAX_COLUMNS = 6;

/** Najwięcej kolumn, jakie ten ekran przyjmie (dla podanej szerokości okna). */
export function maxRailColumns(width: number, breakpoints: readonly RailBreakpoint[] = RAIL_BREAKPOINTS): number {
  const last = breakpoints[breakpoints.length - 1]?.maxColumns ?? 3;
  if (!Number.isFinite(width)) return last;
  const ordered = [...breakpoints].sort((a, b) => b.minWidth - a.minWidth);
  for (const step of ordered) if (width >= step.minWidth) return step.maxColumns;
  return last;
}

/** Ile kolumn dać półce z `count` kafelkami przy suficie `maxColumns`. */
export function railColumns(count: number, maxColumns: number): number {
  const total = Math.floor(Number(count) || 0);
  const cap = Math.min(RAIL_MAX_COLUMNS, Math.max(1, Math.floor(Number(maxColumns) || 1)));
  if (total <= 1) return 1;
  if (total <= cap) return total;
  // Podział bez reszty: największy, czyli najmniej rzędów.
  for (let columns = cap; columns >= 2; columns--) if (total % columns === 0) return columns;
  // Brak równego podziału — wybieramy najkrótszy rząd, a przy remisie najpełniejszy.
  let best = cap;
  let bestRows = Number.POSITIVE_INFINITY;
  let bestFill = -1;
  for (let columns = cap; columns >= 2; columns--) {
    const rows = Math.ceil(total / columns);
    const fill = (total % columns || columns) / columns;
    if (rows < bestRows - 1e-9 || (Math.abs(rows - bestRows) <= 1e-9 && fill > bestFill + 1e-9)) {
      best = columns; bestRows = rows; bestFill = fill;
    }
  }
  return best;
}

/** Ile rzędów zajmie półka — CSS używa tego do wysokości okładki. */
export function railRows(count: number, columns: number): number {
  const total = Math.floor(Number(count) || 0);
  const width = Math.floor(Number(columns) || 0);
  return width > 0 ? Math.ceil(total / width) : 0;
}
