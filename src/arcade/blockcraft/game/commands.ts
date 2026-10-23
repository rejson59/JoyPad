/**
 * BlockCraft 2.9 „Nowy wygląd” – katalog komend czatu.
 *
 * Wcześniej jedynym opisem komend był długi tekst z `/help`, w którym łatwo
 * było się zgubić – szczególnie na telefonie, gdzie nie ma klawisza `E` ani
 * `Esc`, a wpisanie ukośnika i nazwy z pamięci jest niewygodne. Ten moduł
 * trzyma jedno źródło prawdy: czat pokazuje z niego podpowiedzi i pełną listę
 * (tapnięcie wstawia komendę), a `/help` drukuje to samo w oknie gry.
 *
 * Kategorie są krótkie, żeby lista mieściła się na ekranie telefonu.
 */

export type CommandCategory = 'gracz' | 'świat' | 'przedmioty' | 'punkty' | 'pomoc';

export interface CommandInfo {
  /** Nazwa bez ukośnika, np. `gamemode`. */
  name: string;
  /** Inne nazwy, które rozumie silnik. */
  aliases?: string[];
  /** Pełna składnia bez ukośnika, np. `give <przedmiot> [ilość]`. */
  usage: string;
  /** Jedno zdanie: co robi komenda. */
  description: string;
  /** Gotowy do wpisania przykład. */
  example: string;
  category: CommandCategory;
  /** Słowa, po których też warto znaleźć komendę (polskie nazwy, skróty). */
  keywords?: string[];
}

export const COMMAND_CATEGORIES: { id: CommandCategory; label: string; icon: string }[] = [
  { id: 'gracz', label: 'Gracz', icon: '🧍' },
  { id: 'świat', label: 'Świat', icon: '🌍' },
  { id: 'przedmioty', label: 'Przedmioty i moby', icon: '🎁' },
  { id: 'punkty', label: 'Punkty podróży', icon: '📍' },
  { id: 'pomoc', label: 'Pomoc', icon: '❓' },
];

/**
 * Pełna lista komend silnika. Kolejność w obrębie kategorii jest celowa:
 * najpierw to, po co gracz sięga najczęściej.
 */
export const COMMANDS: CommandInfo[] = [
  {
    name: 'gamemode',
    aliases: ['gm'],
    usage: 'gamemode <survival|creative>',
    description: 'Przełącza tryb przetrwania i kreatywny (można też skrótem „s” i „c”).',
    example: '/gamemode creative',
    category: 'gracz',
    keywords: ['tryb', 'kreatywny', 'przetrwanie', 'mode'],
  },
  {
    name: 'heal',
    usage: 'heal',
    description: 'Uzupełnia zdrowie, głód i powietrze.',
    example: '/heal',
    category: 'gracz',
    keywords: ['lecz', 'zdrowie', 'ulecz'],
  },
  {
    name: 'xp',
    usage: 'xp <ilość>',
    description: 'Dodaje doświadczenie (maksymalnie 5000 naraz).',
    example: '/xp 50',
    category: 'gracz',
    keywords: ['doświadczenie', 'poziom', 'level'],
  },
  {
    name: 'kill',
    usage: 'kill',
    description: 'Kończy życie gracza – odrodzisz się w punkcie startu.',
    example: '/kill',
    category: 'gracz',
    keywords: ['śmierć', 'zabij'],
  },
  {
    name: 'clear',
    usage: 'clear',
    description: 'Czyści cały ekwipunek wraz z paskiem szybkiego wyboru.',
    example: '/clear',
    category: 'gracz',
    keywords: ['wyczyść', 'ekwipunek'],
  },
  {
    name: 'time',
    usage: 'time set <day|noon|night|midnight>',
    description: 'Ustawia porę dnia; przyjmuje też liczbę ticków.',
    example: '/time set night',
    category: 'świat',
    keywords: ['czas', 'dzień', 'noc', 'pora'],
  },
  {
    name: 'weather',
    aliases: ['pogoda'],
    usage: 'weather <clear|rain>',
    description: 'Włącza lub wyłącza deszcz i burzę.',
    example: '/weather rain',
    category: 'świat',
    keywords: ['deszcz', 'słońce', 'burza'],
  },
  {
    name: 'tp',
    usage: 'tp <x> <y> <z>',
    description: 'Teleportuje gracza na podane współrzędne.',
    example: '/tp 100 70 -40',
    category: 'świat',
    keywords: ['teleport', 'przenieś'],
  },
  {
    name: 'spawn',
    usage: 'spawn',
    description: 'Wraca do punktu odrodzenia (z Netheru także do nadświatu).',
    example: '/spawn',
    category: 'świat',
    keywords: ['start', 'odrodzenie', 'dom'],
  },
  {
    name: 'seed',
    usage: 'seed',
    description: 'Pokazuje ziarno świata – przydatne, by podzielić się mapą.',
    example: '/seed',
    category: 'świat',
    keywords: ['ziarno', 'mapa'],
  },
  {
    name: 'village',
    aliases: ['wioska'],
    usage: 'village',
    description: 'Teleportuje do najbliższej wioski w promieniu czterech chunków.',
    example: '/village',
    category: 'świat',
    keywords: ['wieś', 'mieszkańcy'],
  },
  {
    name: 'give',
    usage: 'give <przedmiot|id> [ilość]',
    description: 'Daje przedmiot lub blok; nazwy są po polsku albo angielsku.',
    example: '/give kilof',
    category: 'przedmioty',
    keywords: ['daj', 'przedmiot', 'blok'],
  },
  {
    name: 'summon',
    usage: 'summon <mob> [zawód]',
    description: 'Przyzywa zwierzę lub potwora; mieszkańcowi można wybrać zawód.',
    example: '/summon villager kowal',
    category: 'przedmioty',
    keywords: ['mob', 'przyzwij', 'spawn'],
  },
  {
    name: 'enchant',
    usage: 'enchant <zaklęcie> [poziom]',
    description: 'Zaklina trzymany przedmiot; bez nazwy wypisuje dostępne zaklęcia.',
    example: '/enchant efficiency 3',
    category: 'przedmioty',
    keywords: ['zaklęcie', 'zaklinanie'],
  },
  {
    name: 'tpa',
    aliases: ['teleport'],
    usage: 'tpa <nick>',
    description: 'Prosi innego gracza o teleportację do niego – on musi zgodzić się.',
    example: '/tpa Ziomek',
    category: 'punkty',
    keywords: ['teleport', 'teleportacja', 'zgub', 'znajdź', 'znajdz', 'razem', 'multiplayer'],
  },
  {
    name: 'tpaccept',
    aliases: ['tpayes'],
    usage: 'tpaccept',
    description: 'Zgadza się na prośbę o teleportację (można też przyciskiem w HUD).',
    example: '/tpaccept',
    category: 'punkty',
    keywords: ['zgoda', 'przyjmij', 'teleport'],
  },
  {
    name: 'tpdeny',
    aliases: ['tpano'],
    usage: 'tpdeny',
    description: 'Odmawia teleportacji i odrzuca prośbę.',
    example: '/tpdeny',
    category: 'punkty',
    keywords: ['odmowa', 'odrzuć', 'odrzuc', 'teleport'],
  },
  {
    name: 'waypoint',
    aliases: ['punkt'],
    usage: 'waypoint <add|list|select|remove> [nazwa|numer]',
    description: 'Dodaje, listuje, wybiera i usuwa punkty podróży (do 12).',
    example: '/waypoint add Baza',
    category: 'punkty',
    keywords: ['punkt', 'nawigacja', 'kompas'],
  },
  {
    name: 'help',
    usage: 'help',
    description: 'Wypisuje wszystkie komendy w oknie czatu.',
    example: '/help',
    category: 'pomoc',
    keywords: ['pomoc', 'komendy', 'lista'],
  },
  {
    name: 'blocks',
    usage: 'blocks',
    description: 'Wypisuje identyfikatory bloków przydatne w /give.',
    example: '/blocks',
    category: 'pomoc',
    keywords: ['bloki', 'id'],
  },
];

/** Normalizacja do porównań: małe litery i bez polskich znaków. */
export function foldCommand(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ł/g, 'l')
    .replace(/\s+/g, ' ')
    .trim();
}

export function commandByName(name: string): CommandInfo | undefined {
  const q = foldCommand(name.replace(/^\//, ''));
  return COMMANDS.find((c) => c.name === q || (c.aliases ?? []).includes(q));
}

/**
 * Podpowiedzi do czatu. Puste zapytanie zwraca początek listy (przydatne po
 * samym ukośniku), a trafienia w nazwę są zawsze przed trafieniami w opis.
 */
export function searchCommands(query: string, limit = 6): CommandInfo[] {
  const raw = query.replace(/^\//, '').trim();
  const q = foldCommand(raw);
  if (!q) return COMMANDS.slice(0, limit);
  const scored: { cmd: CommandInfo; score: number }[] = [];
  for (const cmd of COMMANDS) {
    const names = [cmd.name, ...(cmd.aliases ?? [])].map(foldCommand);
    const haystack = foldCommand([cmd.usage, cmd.description, ...(cmd.keywords ?? [])].join(' '));
    let score = 0;
    if (names.some((n) => n === q)) score = 100;
    else if (names.some((n) => n.startsWith(q))) score = 80;
    else if (names.some((n) => n.includes(q))) score = 60;
    else if (haystack.includes(q)) score = 30;
    if (score > 0) scored.push({ cmd, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.cmd.name.localeCompare(b.cmd.name))
    .slice(0, limit)
    .map((s) => s.cmd);
}

/** Wstawia nazwę komendy do pola tekstowego, zostawiając miejsce na argumenty. */
export function applyCommandSuggestion(text: string, cmd: CommandInfo): string {
  const typed = text.replace(/^\//, '');
  // Gdy gracz wpisał już argumenty, nie kasujemy ich – tylko podmieniamy nazwę.
  const parts = typed.split(/\s+/);
  const rest = parts.slice(1).join(' ');
  const hasArgs = rest.length > 0;
  return `/${cmd.name}${hasArgs ? ' ' + rest : ' '}`;
}
