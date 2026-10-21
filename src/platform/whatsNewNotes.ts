import { Car, Gamepad2, LayoutDashboard, Palette, Pizza, Sparkles, Tv, Type, Video } from 'lucide-react';

/**
 * Treść notatek wersji — dane bez widoku, żeby test przeglądarkowy mógł je czytać
 * ze źródła zamiast przypinać literały (`'Moments Gallery'` z 1.8 padł razem z listą
 * 1.9.0). Zasada jak przy numerach wersji: jedno źródło prawdy, test nie może się
 * z nim rozjechać. Moduł nie importuje Reacta ani `Sheet`, więc import w teście nie
 * ciągnie za sobą drzewa komponentów.
 */
export const UPDATES = [
  {
    title: { pl: 'Jedna oprawa rundy dla wszystkich gier.', en: 'One round shell for every game.' },
    detail: { pl: 'Stalowy Front gra na tym samym HUD-zie co reszta biblioteki: jeden pasek górny, karty graczy, nakładki, pasek klawiszy i okienka pauzy. Gry różnią się światem, nie interfejsem.', en: 'Steel Front now plays on the same HUD as the rest of the library: one top bar, player cards, overlays, key strip and pause window. Games differ by world, not by interface.' },
    icon: LayoutDashboard, color: '#ff9a52',
  },
  {
    title: { pl: 'Każda gra ma swój kolor.', en: 'Every game has its own colour.' },
    detail: { pl: 'Pęd jest neonowo różowy, Orbitalna Fala fioletowa, Turbo League cyanowa, Nocna Dostawa kwasowo zieliona. Akcent barwi tło areny, klawisze START i WRÓĆ oraz poświatę okładki w bibliotece.', en: 'Neon Rush is neon pink, Orbital Wave violet, Turbo League cyan, Night Delivery acid green. The accent tints the arena background, the START and RESUME keys and the cover glow in the library.' },
    icon: Palette, color: '#baa6fa',
  },
  {
    title: { pl: 'Nagrania botów w każdej grywalnej grze.', en: 'Bot recordings in every playable game.' },
    detail: { pl: 'Wężowy Wir, Turbo League i Nocna Dostawa dołączają do czołgów, wyścigu i kosmosu: sześć urywków 1920×1080 bez dźwięku, granych przez własne boty silników, nagrywanych w CI i odtwarzanych w tle biblioteki.', en: 'Snake Vortex, Turbo League and Night Delivery join tanks, racing and space: six silent 1920×1080 excerpts played by the engines’ own bots, recorded in CI and looping behind the library.' },
    icon: Video, color: '#4fd2ff',
  },
  {
    title: { pl: 'Napisy w grze rysowane z systemu.', en: 'In-game text drawn from the system.' },
    detail: { pl: 'Imiona nad jednostkami, liczniki i znaki wodne aren korzystają z tych samych krojów i kolorów co konsola (Outfit, Space Grotesk, JetBrains Mono). Test porównuje paletę płótna z `palette.css`, więc nie rozjedzie się sama.', en: 'Names over units, counters and arena watermarks use the same faces and colours as the console (Outfit, Space Grotesk, JetBrains Mono). A test compares the canvas palette with `palette.css`, so it cannot drift apart.' },
    icon: Type, color: '#c9f25e',
  },
  {
    title: { pl: 'Turbo League gra naprawdę.', en: 'Turbo League is really playable.' },
    detail: { pl: 'Piłka samochodowa 3D na stadionie: pełna fizyka, boost z żółtych pól, odbicia od band i powtórki goli. Mecze od 1v1 do 2v2, do 3/5/7 goli, złoty gol w dogrywce.', en: '3D car soccer on a stadium: full physics, boost from the yellow pads, wall rebounds and goal replays. Matches from 1v1 up to 2v2, first to 3/5/7 goals, golden goal in extra time.' },
    icon: Car, color: '#ff9a52',
  },
  {
    title: { pl: 'WEBZA — Nocna Dostawa.', en: 'WEBZA — Night Delivery.' },
    detail: { pl: 'Kurierzy pizzy huśtają się na sieci między dachami i trafiają w światło zamówień. Grajcie razem po ocenę zespołu albo rywalizujcie o MVP zmiany.', en: 'Pizza couriers swing on a web between rooftops and hit the light of every order. Play together for a team rating or compete for shift MVP.' },
    icon: Pizza, color: '#edbd78',
  },
  {
    title: { pl: 'Pad steruje całą konsolą.', en: 'The pad drives the whole console.' },
    detail: { pl: 'Klawiatura, pad USB i pilot z telefonu przechodzą przez każdy klikalny element: bibliotekę, okienka, centrum pokoju i ustawienia. A zatwierdza, B cofa, X/Y to skróty podpisane na dole ekranu.', en: 'Keyboard, USB pad and the phone remote reach every clickable element: the library, sheets, room centre and settings. A confirms, B goes back, X/Y are the shortcuts signed at the bottom of the screen.' },
    icon: Gamepad2, color: '#baa6fa',
  },
  {
    title: { pl: 'Profile ekranu: TV, komputer, tablet, telefon.', en: 'Screen profiles: TV, computer, tablet, phone.' },
    detail: { pl: 'Duży ekran nie wymaga przewijania, tablet dostaje większe cele dotyku, a administrator rozkłada pełny ekran telewizora ze swojego pada.', en: 'The big screen needs no scrolling, tablets get larger touch targets and the admin can expand TV fullscreen straight from their pad.' },
    icon: Tv, color: '#5eead4',
  },
  {
    title: { pl: 'Plamek pokazuje, gdzie jesteś.', en: 'Plamek shows where you are.' },
    detail: { pl: 'Plama farby z buźką zastępuje ramkę fokusa: ścieka z otoczki, przelatuje na następny element i rozlewa się wokół niego. Przy ograniczonym ruchu zostaje sam poślizg.', en: 'A paint blob with a face replaces the focus ring: it drips off the outline, flies to the next element and spills around it. With reduced motion only the slide remains.' },
    icon: Sparkles, color: '#e4a766',
  },
  {
    title: { pl: 'BlockCraft — zapowiedź.', en: 'BlockCraft — an announcement.' },
    detail: { pl: 'Przygotowujemy sandbox z budowaniem z bloków. To tylko zapowiedź — gra nie jest jeszcze dostępna.', en: 'A block-building sandbox is planned. This is only an announcement — the game is not playable yet.' },
    icon: Sparkles, color: '#7cd67f',
  },
] as const;
