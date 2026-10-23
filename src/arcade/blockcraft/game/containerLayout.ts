/**
 * BlockCraft 2.28 – układy pozostałych okien 1:1 z Minecraftem.
 *
 * Wszystkie cztery panele (kowadło, stół zaklęć, statyw alchemiczny, piec)
 * mają dokładnie 176 × 166 „pikseli GUI”, tak jak w wanilii, i dzielą ten sam
 * układ ekwipunku gracza: siatka 9 × 3 na (8, 84) i pasek skrótów na (8, 142).
 * Współrzędne pochodzą z waniliowych klas `AnvilScreen`, `EnchantmentScreen`,
 * `BrewingStandScreen` i `FurnaceScreen` – zgadzają się co do piksela
 * z teksturami `gui/container/*.png` z paczki 26.2.
 *
 * Trzymamy je w osobnym module, żeby i komponenty, i testy headless liczyły
 * rozmieszczenie z jednego źródła prawdy (zamiast zgadywać marginesy CSS).
 */

/** Wspólny rozmiar panelu i siatki ekwipunku dla wszystkich tych okien. */
export const CONTAINER = {
  width: 176,
  height: 166,
  /** Lewy górny róg siatki 9 × 3 (piksele GUI, bez ramki slotu). */
  inv: { x: 8, y: 84, step: 18, cols: 9, rows: 3 },
  /** Pasek skrótów pod siatką. */
  hotbar: { x: 8, y: 142, step: 18, cols: 9 },
  /** Margines wokół przedmiotu w slocie (16 px w 18-pikselowej kratce). */
  slotInset: 1,
  /** Maksymalna skala panelu na ekranie (2× jak waniliowe GUI scale). */
  maxScale: 2,
} as const;

/** Kowadło – `gui/container/anvil.png`. */
export const ANVIL = {
  sprite: 'anvil_gui',
  title: 'Kowadło',
  /** Pierwszy przedmiot (lewy slot). */
  slotA: { x: 27, y: 47 },
  /** Drugi przedmiot do połączenia / naprawy. */
  slotB: { x: 76, y: 47 },
  /** Slot wyniku. */
  output: { x: 134, y: 47 },
  /** Tło pola nazwy (`anvil/text_field.png`, 110 × 16) i samo pole tekstowe. */
  field: { x: 59, y: 20, w: 110, h: 16 },
  name: { x: 62, y: 24, w: 103, h: 12 },
  /** Koszt w poziomach – wanilia rysuje go pod slotem wyniku, przy prawej. */
  cost: { right: 166, y: 69 },
} as const;

/** Stół zaklęć – `gui/container/enchanting_table.png`. */
export const ENCHANT = {
  sprite: 'enchanting_gui',
  title: 'Zaklinanie',
  /** Slot na przedmiot i na lazuryt. */
  item: { x: 15, y: 47 },
  lapis: { x: 35, y: 47 },
  /** Trzy przyciski ofert (`enchantment_slot.png`, 108 × 19), co 19 px. */
  offers: [
    { x: 60, y: 13 },
    { x: 60, y: 32 },
    { x: 60, y: 51 },
  ],
  offerW: 108,
  offerH: 19,
} as const;

/** Statyw alchemiczny – `gui/container/brewing_stand.png`. */
export const BREWING = {
  sprite: 'brewing_gui',
  title: 'Statyw alchemiczny',
  /** Trzy fiolki – wanilia trzyma je w literę V (środkowa niżej). */
  bottles: [
    { x: 56, y: 51 },
    { x: 79, y: 58 },
    { x: 102, y: 51 },
  ],
  ingredient: { x: 79, y: 17 },
  fuel: { x: 17, y: 17 },
  /** Pęcherzyki (`bubbles.png`, 12 × 29) – rosną od dołu. */
  bubbles: { x: 63, y: 14, w: 12, h: 29 },
  /** Postęp warzenia (`brew_progress.png`, 9 × 28). */
  progress: { x: 97, y: 16, w: 9, h: 28 },
  /** Pasek paliwa (`fuel_length.png`, 18 × 4) – pod statywem. */
  fuelBar: { x: 60, y: 44, w: 18, h: 4 },
} as const;

/**
 * Skrzynia 27 slotów – `gui/container/generic_54.png`.
 *
 * Waniliowe `GenericContainerScreen` rysuje górną część (176 × 71) i dokleja
 * pod nią ekwipunek gracza (176 × 96), więc panel ma 176 × 167 – o 1 px
 * mniej niż pozostałe okna. Sloty leżą dokładnie tam, gdzie w grze.
 */
export const CHEST = {
  sprite: 'chest_gui',
  title: 'Skrzynia',
  width: 176,
  height: 167,
  /** Siatka 9 × 3 od (8, 18), wiersz co 18 px. */
  grid: { x: 8, y: 18, step: 18, cols: 9, rows: 3 },
  /** Ekwipunek gracza – ten sam co w innych oknach. */
  inv: { x: 8, y: 84 },
  hotbar: { x: 8, y: 142 },
} as const;

/** Współrzędne slotu skrzyni (0–26) w pikselach GUI. */
export function chestSlot(i: number): { x: number; y: number } {
  return {
    x: CHEST.grid.x + (i % CHEST.grid.cols) * CHEST.grid.step,
    y: CHEST.grid.y + Math.floor(i / CHEST.grid.cols) * CHEST.grid.step,
  };
}

/** Piec – `gui/container/furnace.png`. */
export const FURNACE = {
  sprite: 'furnace_gui',
  title: 'Piec',
  input: { x: 56, y: 17 },
  fuel: { x: 56, y: 53 },
  output: { x: 116, y: 31 },
  /** Płomień (`lit_progress.png`, 14 × 14) – rośnie od dołu. */
  lit: { x: 56, y: 36, w: 14, h: 14 },
  /** Strzałka postępu (`burn_progress.png`, 24 × 16). */
  burn: { x: 79, y: 34, w: 24, h: 16 },
} as const;

/** Współrzędne środka slotu ekwipunku (0–35) w pikselach GUI. */
export function containerInvSlot(i: number): { x: number; y: number } {
  if (i < 27) {
    return {
      x: CONTAINER.inv.x + (i % CONTAINER.inv.cols) * CONTAINER.inv.step,
      y: CONTAINER.inv.y + Math.floor(i / CONTAINER.inv.cols) * CONTAINER.inv.step,
    };
  }
  return {
    x: CONTAINER.hotbar.x + (i - 27) * CONTAINER.hotbar.step,
    y: CONTAINER.hotbar.y,
  };
}

/** Skala panelu – nigdy nie wychodzi za ekran, maksymalnie 2×. */
export function containerScale(viewportW: number, viewportH: number): number {
  const byW = (viewportW - 24) / CONTAINER.width;
  const byH = (viewportH - 84) / CONTAINER.height;
  return Math.max(0.75, Math.min(CONTAINER.maxScale, byW, byH));
}
