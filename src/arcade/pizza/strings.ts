/**
 * Napisy WEBZA widoczne w świecie gry (komunikaty, pływające teksty, podpowiedzi).
 *
 * Silnik pisze po polsku — polski tekst jest zarazem kluczem. Wersja angielska to
 * słownik; nieznany napis przechodzi bez zmian (nazwy własne, liczby, „x5”).
 * Dopisując nowy komunikat w `Game.ts`, dopisz tu jego tłumaczenie — test
 * `selftest:pizza` pilnuje, żeby żaden napis z silnika nie został bez pary.
 */

export type Lang = "pl" | "en";

export const EN: Record<string, string> = {
  START: "GO!",
  "Miasto jest głodne": "The city is hungry",
  "PIZZA STYGNIE": "PIZZA'S GETTING COLD",
  "Ostatnie sekundy zmiany": "Last seconds of the shift",
  "GORĄCE ZAMÓWIENIE": "HOT ORDER",
  "Krótki czas. Gruba kasa.": "Short fuse. Big money.",
  "PUSTY PLECAK": "EMPTY BAG",
  "Do furgonetki": "Back to the van",
  "PEŁNY PLECAK": "BAG FULL",
  "Można lecieć": "Good to go",
  "POWRÓT DO BAZY": "BACK TO BASE",
  ROZGRZANIE: "HEATING UP",
  "{name} wchodzi w strefę": "{name} enters the zone",
  PERFEKT: "PERFECT",
  SIEĆ: "WEB",
  LOT: "AIR",
  RUSH: "RUSH",
  VIP: "VIP",
  TRENING: "TRAINING",
  "SERIA x5": "STREAK x5",
  "SERIA x8": "STREAK x8",
  "Piec nie nadąża": "The oven can't keep up",
  "SERIA PRZERWANA": "STREAK BROKEN",
  STYGNIE: "COLD",
  "KONIEC ZMIANY": "SHIFT OVER",
  // komentarze do ocen
  "Ciasto ostygło. Miasto udaje, że was nie widziało.": "The dough went cold. The city pretends it never saw you.",
  "Dowiezione. Ledwo, ale dowiezione.": "Delivered. Barely, but delivered.",
  "Solidna noc. Klienci przestaną dzwonić. Na chwilę.": "A solid night. Customers will stop calling. For a while.",
  "Dzielnica już plotkuje. W dobrym sensie.": "The district is already talking. In a good way.",
  "Legendy nocnej zmiany. Piec bije brawo.": "Legends of the night shift. The oven applauds.",
  "Fizyka się poddała. Klienci płaczą ze szczęścia.": "Physics gave up. Customers are crying with joy.",
  // podpowiedzi (niezależne od urządzenia: pad i klawiatura mówią to samo)
  "Przytrzymaj AKCJĘ — sieć. Puść w dole łuku.": "Hold ACTION to swing. Let go at the bottom of the arc.",
  "Leć na słup światła — kurier rzuci pizzę sam.": "Fly at a light pillar — your courier throws the pizza for you.",
  "Pusty plecak uzupełnisz przy furgonetce. Wyżej = więcej punktów.": "Refill your bag at the van. Higher = more points.",
  "Kto pierwszy trafi w światło, ten ma punkty.": "First one to hit the light takes the points.",
};

export function loc(text: string, lang: Lang): string {
  if (lang !== "en" || !text) return text;
  return EN[text] ?? text;
}
