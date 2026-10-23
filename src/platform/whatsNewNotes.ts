import { AlertTriangle, Cpu, Droplets, FlaskConical, Keyboard, LayoutDashboard, Smartphone, Sparkles, Trophy, Video } from 'lucide-react';

/**
 * Treść notatek wersji — dane bez widoku, żeby test przeglądarkowy mógł je czytać
 * ze źródła zamiast przypinać literały (`'Moments Gallery'` z 1.8 padł razem z listą
 * 1.9.0). Zasada jak przy numerach wersji: jedno źródło prawdy, test nie może się
 * z nim rozjechać. Moduł nie importuje Reacta ani `Sheet`, więc import w teście nie
 * ciągnie za sobą drzewa komponentów.
 */
export const UPDATES = [
  {
    title: { pl: 'Karta pilota i osiągnięcia.', en: 'Pilot card & achievements.' },
    detail: { pl: 'Dwanaście trofeów wyprowadzonych wyłącznie z sygnałów rundy (wynik oraz zdarzenia: impuls, eliminacja, tarcza, respawn), karta pilota z licznikiem rund, zwycięstw, światów i rekordem impulsów. Trofea wiszą też na kafelkach gier, a odblokowanie świętuje toastem.', en: 'Twelve trophies derived purely from round signals (the result plus pickup, elimination, shield and respawn events), a pilot card counting rounds, wins, worlds and a pickup record. Trophies also hang on game tiles, and unlocking one is celebrated with a toast.' },
    icon: Trophy, color: '#ff9a52',
  },
  {
    title: { pl: 'Telefon dostał własny układ konsoli.', en: 'The phone got its own console layout.' },
    detail: { pl: 'Profil handheld przestał być pomniejszonym komputerem: zawijany pasek górny, jedna kolumna, półka 2×, cele dotyku 44 px i stopka bez skrótów klawiszowych. Playwright w CI emuluje iPhone’a i pilnuje, że żaden przycisk nie wypada poza okno.', en: 'The handheld profile stopped being a shrunk computer: wrapping top bar, single column, 2× shelf, 44 px touch targets and a footer without key hints. Playwright in CI emulates an iPhone and makes sure no button falls outside the window.' },
    icon: Smartphone, color: '#ff7ad9',
  },
  {
    title: { pl: 'Strzałki sterują też rundą solo.', en: 'Arrows steer solo rounds too.' },
    detail: { pl: 'Katalog obiecuje „Strzałki lub joystick”, ale strzałki były zestawem drugiego slotu. Gdy drugi slot nie ma człowieka, gracz 1 słucha i WASD, i strzałek; przy dwóch graczach z klawiatury podział zostaje klasyczny.', en: 'The catalogue promises “arrows or stick”, yet arrows belonged to the second slot. With no human in slot two, player one listens to both WASD and arrows; with two keyboard players the classic split stays.' },
    icon: Keyboard, color: '#d8a262',
  },
  {
    title: { pl: '3D nie znika po kilku rundach.', en: '3D no longer vanishes after a few rounds.' },
    detail: { pl: 'Silniki 3D nie oddawały kontekstów WebGL, więc limit przeglądarki (~16) po kilku rundach zrzucał gry do widoku z góry. Teraz każdy silnik zwraca kontekst w `dispose()`, a sonda pyta jednorazowe płótno.', en: '3D engines never returned their WebGL contexts, so the browser limit (~16) silently dropped games to the top-down view after a few rounds. Every engine now releases its context in `dispose()` and the probe asks a throwaway canvas.' },
    icon: Cpu, color: '#4fd2ff',
  },
  {
    title: { pl: 'Fallback 2D mówi, dlaczego.', en: 'The 2D fallback says why.' },
    detail: { pl: 'Zrzut do widoku z góry przestał być cichy: chip „TRYB 2D · powód” w oprawie rundy i `window.joypadRenderReport` rozróżniają brak WebGL2, błąd importu fragmentu i błąd silnika.', en: 'Dropping to the top-down view is no longer silent: a “2D MODE · reason” chip in the round shell and `window.joypadRenderReport` tell missing WebGL2, a chunk import failure and an engine error apart.' },
    icon: AlertTriangle, color: '#edbd78',
  },
  {
    title: { pl: 'Nagrania botów: komplet 6/6 z bramką.', en: 'Bot recordings: the full 6/6 set, gated.' },
    detail: { pl: 'CI nagrało brakujące trzy światy i wcommitowało je do repo; brama PREVIEW pilnuje teraz kompletu par mp4+webm w Full HD przy każdej zmianie, a `PREVIEW_REVISION` wymienia klipy w przeglądarkach.', en: 'CI recorded the three missing worlds and committed them; the PREVIEW gate now enforces the full set of Full HD mp4+webm pairs on every change, and `PREVIEW_REVISION` swaps the clips in browsers.' },
    icon: Video, color: '#baa6fa',
  },
  {
    title: { pl: 'Plamek oddycha w spoczynku.', en: 'Plamek breathes at rest.' },
    detail: { pl: 'Maskotka nie zastyga: kałuża farby pęcznieje, kropla zwisi i wraca, a odblask jedzie po rancie — spoczynkowa farba wygląda mokro, choć bramki trzymają suchy sufit czytelności.', en: 'The mascot no longer sets: the paint pool swells, a droplet hangs and returns, and a gleam travels the rim — resting paint reads wet while gates keep the dry readability ceiling.' },
    icon: Droplets, color: '#ff9a52',
  },
  {
    title: { pl: 'Testy telefonu i sterowania w CI.', en: 'Phone & controls tests in CI.' },
    detail: { pl: 'Nowy `tests/phone.spec.ts` sprawdza układ handheld i sterowanie węża stanem wejścia rundy (`debugInput`), więc zgłoszenia „nie działa na telefonie” mają twardy dowód odwrotny.', en: 'A new `tests/phone.spec.ts` verifies the handheld layout and Snake steering through the round’s input state (`debugInput`), so “it breaks on phone” reports now have hard counter-evidence.' },
    icon: FlaskConical, color: '#7cd67f',
  },
  {
    title: { pl: 'Półka bez sierot, jedno tło systemu.', en: 'Orphan-free shelf, one system background.' },
    detail: { pl: 'Biblioteka liczy kolumny tak, by nigdy nie został rząd-sierota, marginesy iOS są prawdziwe, a tło i scrollbary czytają tokeny systemu zamiast własnych kolorów gier.', en: 'The library counts columns so no orphan row remains, iOS margins are real, and the background plus scrollbars read system tokens instead of per-game colours.' },
    icon: LayoutDashboard, color: '#c9f25e',
  },
  {
    title: { pl: 'Wydanie 2.0: rundy 20–24 jednym pakietem.', en: 'Release 2.0: rounds 20–24 in one package.' },
    detail: { pl: 'Wszystko powyżej składa się na pierwsze duże wydanie po 1.9: konsola pamięta Twoje granie, telefon jest pełnoprawnym ekranem, a 3D trzyma się swojego miejsca.', en: 'Everything above adds up to the first big release since 1.9: the console remembers your play, the phone is a first-class screen, and 3D stays in its seat.' },
    icon: Sparkles, color: '#ffb77f',
  },
] as const;
