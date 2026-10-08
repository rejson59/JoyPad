/**
 * ============================================================================
 *  SKRYPT FILMU „JOYPAD" — JEDNO MIEJSCE DO EDYCJI
 * ============================================================================
 *
 * Ten plik jest **danymi**, nie kodem: scena to obiekt w tablicy `film.scenes`.
 * Wszystkie napisy, czasy, ruchy kamery i dźwięki siedzą tutaj. Silnik
 * (`timeline.ts`) tylko czyta ten opis, a rysowanie (`scenes.tsx`) zamienia go
 * na obraz. Dzięki temu nową scenę dodajesz bez dotykania ani jednego
 * komponentu Reacta.
 *
 * ----------------------------------------------------------------------------
 *  JAK DODAĆ NOWĄ SCENĘ (przepis)
 * ----------------------------------------------------------------------------
 * 1. Wybierz `view` — gotowy zestaw klocków, który umie narysować scenę:
 *      'coldOpen' | 'library' | 'pair' | 'handoff' | 'play' | 'split' | 'moments' | 'outro'
 *    Nowy `view` to nowy komponent w `scenes.tsx` + rejestracja w `SCENE_VIEWS`.
 * 2. Wstaw obiekt scen do `film.scenes` **w kolejności odtwarzania**. Silnik sam
 *    liczy, gdzie scena się zaczyna (`startMs`), nie podajesz czasu globalnego.
 * 3. Wypełnij `chapter` (nazwa rozdziału na pasku odtwarzacza) i `ms` (długość).
 * 4. Napisz `cues` — każde wejście elementu ma własne `id`, czas `at`
 *    (milisekundy od początku sceny) i długość `dur`. Scena czyta je przez
 *    `cue('id')`, więc kolejność w tablicy nie ma znaczenia, a czasy możesz
 *    szlifować bez ruszania rysowania.
 * 5. Dodaj `camera` (klatki kluczowe ruchu kamery), `sound` (jednym zdaniem:
 *    dźwięki scenicznymi) i `poster` (0..1 — klatka do wersji statycznej
 *    i do storyboardu).
 * 6. Teksty pisz w obu językach (`{ pl, en }`). Polski w cudzysłowie „…", bez
 *    twardych spacji; angielski swobodnie. `cue` bez tekstu to czysty ruch.
 * 7. Uruchom `npm run selftest:cinema` — pakiet sprawdza, czy czasy są
 *    rosnące, czy `cue` nie wychodzi za scenę i czy oba języki mają teksty.
 *
 * Skróty, które warto znać:
 *   at: -400   → element wchodzi PRZED początkiem sceny (dokładnie wtedy, gdy
 *                poprzednia jeszcze się domyka — dobre na „przenikanie").
 *   hold: 1200 → po wejściu element stoi nieruchomo tyle ms.
 *   fade: 400  → a potem tyle ms wychodzi (wtedy `cue().v` spada do zera).
 *   ease: …    → krzywa wejścia, jedna z nazw w `EASE_NAMES` (bez odbić!).
 */

export type Lang = 'pl' | 'en';

export interface Text { pl: string; en: string }

/** Tekst w wybranym języku. */
export const pick = (text: Text | undefined, language: Lang): string => (text ? (language === 'en' ? text.en : text.pl) : '');

/** Krzywe są celowo bez sprężynek i odbić — „okrągłe i płynne", nigdy gumowe. */
export const EASE_NAMES = ['linear', 'inOut', 'outExpo', 'outQuint', 'outCubic', 'outBack', 'inQuad', 'step'] as const;
export type EaseName = typeof EASE_NAMES[number];

/** Klocki, z których zbudowane są sceny — rejestr w `scenes.tsx`. */
export type ViewId = 'coldOpen' | 'library' | 'pair' | 'handoff' | 'play' | 'split' | 'moments' | 'outro';

/** Dźwięki generowane proceduralnie (`score.ts`) — zero plików audio. */
export type SoundKind = 'hum' | 'whoosh' | 'tick' | 'impact' | 'riser' | 'chime' | 'ui' | 'success' | 'sweep';

/** Jedno wejście elementu. `id` czyta scena, reszta to czas i krzywa. */
export interface Cue {
  id: string;
  /** ms od początku sceny (może być ujemne — wejście „pod" poprzednią scenę). */
  at: number;
  /** długość wejścia w ms (domyślnie 700). */
  dur?: number;
  /** postój po wejściu, zanim element zacznie znikać. */
  hold?: number;
  /** wyjście w ms; 0 = element zostaje do końca sceny. */
  fade?: number;
  ease?: EaseName;
}

/** Dźwięk przypięty do czasu sceny. `note` to półton względem C (np. 7 = G). */
export interface SoundCue { at: number; kind: SoundKind; gain?: number; note?: number }

/** Klatka kluczowa kamery: położenie sceny w „przestrzeni" filmu, w % sceny. */
export interface CamKey { at: number; x?: number; y?: number; scale?: number; rot?: number; ease?: EaseName }

export interface Scene {
  id: string;
  view: ViewId;
  /** Nazwa rozdziału na pasku odtwarzacza. */
  chapter: Text;
  /** Długość sceny — ostatnie słowo o czasie. */
  ms: number;
  /** Mała etykieta nad tytułem (np. „BIBLIOTEKA"). */
  label?: Text;
  title?: Text;
  sub?: Text;
  /** Trzy krótkie hasła pod tytułem — czytelne z dziesięciu metrów. */
  chips?: Text[];
  /** Dowolne dodatkowe napisy sceny (odczyt przez `copy('klucz')`). */
  extra?: Record<string, Text>;
  cues: Cue[];
  camera: CamKey[];
  sound?: SoundCue[];
  /** Klatka reprezentatywna 0..1 — wersja statyczna i storyboard. */
  poster: number;
  /** Co robi wersja lekka: 'same' (bez zmian), 'simplify', 'skip'. */
  lite?: 'same' | 'simplify' | 'skip';
  /** Co robi wersja statyczna: 'still' (klatka postera), 'skip'. */
  still?: 'still' | 'skip';
  /** Dane na żywo, które scena może pokazać obok treści. */
  bind?: ('qr' | 'players')[];
  /** Nagrania z `public/previews/`, które scena może odtworzyć (pierwsze = główne). */
  videos?: string[];
  /** Notatka dla reżysera — nie trafia na ekran. */
  note?: string;
}

export interface FilmScript {
  id: string;
  /** Podbij, żeby powtórzyć pytanie „pierwsze wejście" po dużej zmianie filmu. */
  version: number;
  title: Text;
  subtitle: Text;
  /** Napisy interfejsu odtwarzacza (pasek, skróty, jakość). */
  ui: {
    eyebrow: Text;
    skip: Text;
    pause: Text;
    resume: Text;
    replay: Text;
    next: Text;
    chapter: Text;
    quality: Text;
    qualityAuto: Text;
    qualityHigh: Text;
    qualityLite: Text;
    qualityStatic: Text;
    storyboard: Text;
    close: Text;
    padHints: Text;
    keyHints: Text;
  };
  /** Ekran powitalny — pytanie o poradnik i ostrzeżenie po „Nie". */
  welcome: {
    title: Text;
    ask: Text;
    yes: Text;
    yesHint: Text;
    no: Text;
    warnTitle: Text;
    warn1: Text;
    warn2: Text;
    warn3: Text;
    watch: Text;
    warnSkip: Text;
    peek1: Text;
    peek2: Text;
    peek3: Text;
  };
  scenes: Scene[];
}

const t = (pl: string, en: string): Text => ({ pl, en });

/** Wersja skryptu: podbij, gdy zmienisz film na tyle, że warto zapytać ponownie. */
export const FILM_VERSION = 1;

export const filmScript: FilmScript = {
  id: 'joypad-first-run',
  version: FILM_VERSION,
  title: t('Poznaj JoyPad', 'Meet JoyPad'),
  subtitle: t('Krótki poradnik i reklama w jednym', 'A short tutorial and a trailer in one'),
  ui: {
    eyebrow: t('JOYPAD / PORADNIK', 'JOYPAD / TUTORIAL'),
    skip: t('Pomiń', 'Skip'),
    pause: t('Pauza', 'Pause'),
    resume: t('Wróć do filmu', 'Resume'),
    replay: t('Od nowa', 'Replay'),
    next: t('Dalej', 'Next'),
    chapter: t('Rozdział', 'Chapter'),
    quality: t('Jakość', 'Quality'),
    qualityAuto: t('Auto', 'Auto'),
    qualityHigh: t('Pełna', 'Full'),
    qualityLite: t('Lekka', 'Light'),
    qualityStatic: t('Statyczna', 'Static'),
    storyboard: t('Wersja statyczna — naciśnij, aby przejść do następnej sceny', 'Static version — press to move to the next scene'),
    close: t('Zamknij poradnik', 'Close the tutorial'),
    padHints: t('Pad: B — pomiń · A — pauza · Y — następna scena', 'Pad: B — skip · A — pause · Y — next scene'),
    keyHints: t('Klawiatura: Esc — pomiń · Spacja — pauza · → — następna scena', 'Keyboard: Esc — skip · Space — pause · → — next scene'),
  },
  welcome: {
    title: t('Witaj w JoyPad!', 'Welcome to JoyPad!'),
    ask: t('Chcesz zobaczyć krótki poradnik?', 'Want to watch a short tutorial?'),
    yes: t('Tak, pokaż poradnik', 'Yes, show me'),
    yesHint: t('Około minuty. Możesz pominąć w każdej chwili.', 'About a minute. You can skip it any time.'),
    no: t('Nie, dziękuję', 'No, thanks'),
    warnTitle: t('Bez poradnika może być trudniej', 'It may be harder without the tutorial'),
    warn1: t('Telewizor nie ma własnych przycisków — grę wybierasz telefonem albo padem.', 'The TV has no buttons of its own — you pick games with a phone or a gamepad.'),
    warn2: t('Telefon łączy się kodem QR, który zobaczysz na ekranie. Bez tej wiedzy pierwsza runda zajmie więcej czasu.', 'A phone joins through the QR code shown on screen. Without it, your first round takes longer.'),
    warn3: t('Zawsze możesz wrócić: Ustawienia → Poradnik.', 'You can always come back: Settings → Tutorial.'),
    watch: t('Pokaż mi jednak poradnik', 'Show me the tutorial after all'),
    warnSkip: t('Rozumiem, gram bez poradnika', 'Understood, play without it'),
    peek1: t('Telefon jako kontroler', 'A phone as the controller'),
    peek2: t('Wspólny albo podzielony ekran', 'Shared or split screen'),
    peek3: t('Momenty i powtórki akcji', 'Moments and action replays'),
  },
  scenes: [
    {
      id: 'coldopen',
      view: 'coldOpen',
      chapter: t('Start', 'Start'),
      ms: 4400,
      extra: {
        word1: t('Twój wieczór.', 'Your evening.'),
        word2: t('Twoja gra.', 'Your game.'),
        mark: t('JoyPad', 'JoyPad'),
        kicker: t('MOŻESZ GRAĆ JUŻ ZA CHWILĘ', 'YOU COULD BE PLAYING ALREADY'),
      },
      cues: [
        { id: 'ember', at: 120, dur: 900, ease: 'outQuint' },
        { id: 'drop', at: 900, dur: 620, ease: 'inQuad' },
        { id: 'splat', at: 1500, dur: 420, ease: 'outExpo' },
        { id: 'reform', at: 1900, dur: 900, ease: 'outBack' },
        { id: 'word1', at: 2350, dur: 900, ease: 'outQuint' },
        { id: 'word2', at: 2650, dur: 900, ease: 'outQuint' },
        { id: 'kicker', at: 3250, dur: 1100, ease: 'outCubic' },
      ],
      camera: [
        { at: 0, scale: 1.09, y: -12 },
        { at: 1, scale: 1, y: 0, ease: 'outCubic' },
      ],
      sound: [
        { at: 120, kind: 'riser', gain: .5 },
        { at: 1500, kind: 'impact', gain: .8 },
        { at: 2350, kind: 'chime', gain: .5 },
        { at: 3250, kind: 'sweep', gain: .35 },
      ],
      poster: .62,
      note: 'Plamek spada z iskry, rozbija się i wstaje jako kulka z oczami.',
    },
    {
      id: 'library',
      view: 'library',
      chapter: t('Biblioteka', 'Library'),
      ms: 5200,
      label: t('BIBLIOTEKA', 'LIBRARY'),
      title: t('Wybierz świat.', 'Choose a world.'),
      sub: t('Sześć światów na jednym ekranie — od czołgów po neonowe wyścigi.', 'Six worlds on one screen — from tanks to neon racing.'),
      chips: [t('6 ŚWIATÓW', '6 WORLDS'), t('BEZ INSTALACJI', 'NOTHING TO INSTALL'), t('2–4 GRACZY', '2–4 PLAYERS')],
      extra: {
        focusTag: t('WYBÓR', 'SELECTED'),
        soonTag: t('ZAPOWIEDŹ', 'IN DEVELOPMENT'),
      },
      cues: [
        { id: 'shelf', at: 0, dur: 1400, ease: 'outQuint' },
        { id: 'label', at: 260, dur: 700, ease: 'outCubic' },
        { id: 'title', at: 380, dur: 900, ease: 'outQuint' },
        { id: 'sub', at: 700, dur: 900, ease: 'outCubic' },
        { id: 'chips', at: 1000, dur: 800, ease: 'outCubic' },
        { id: 'focus', at: 1250, dur: 560, ease: 'outExpo' },
        { id: 'focus', at: 2650, dur: 560, ease: 'outExpo' },
        { id: 'focus', at: 3750, dur: 560, ease: 'outExpo' },
        { id: 'plamek', at: 1500, dur: 1100, ease: 'outBack' },
      ],
      camera: [
        { at: 0, x: 90, y: 10, scale: 1.04, rot: -1.4 },
        { at: .55, x: -60, y: 0, scale: 1.01, rot: .5, ease: 'inOut' },
        { at: 1, x: -150, y: -8, scale: 1.06, rot: -0.8, ease: 'inOut' },
      ],
      sound: [
        { at: 0, kind: 'whoosh', gain: .5 },
        { at: 380, kind: 'chime', gain: .35, note: 0 },
        { at: 1250, kind: 'tick', gain: .5 },
        { at: 2650, kind: 'tick', gain: .5 },
        { at: 3750, kind: 'tick', gain: .5 },
        { at: 1300, kind: 'ui', gain: .35 },
      ],
      poster: .5,
      note: 'Półka okładek przewija się pod kamerą, pierścień fokusa wędruje po kafelkach, Plamek siedzi nad wybranym.',
    },
    {
      id: 'pair',
      view: 'pair',
      chapter: t('Połączenie', 'Pairing'),
      ms: 7000,
      label: t('WSPÓLNY EKRAN', 'SHARED SCREEN'),
      title: t('Zeskanuj kod QR.', 'Scan the QR code.'),
      sub: t('Telefon staje się kontrolerem w kilka sekund. Bez aplikacji i bez kont.', 'Your phone becomes a controller in seconds. No app, no account.'),
      chips: [t('1 SKAN', 'ONE SCAN'), t('BEZ APLIKACJI', 'NO APP'), t('DO 4 PADÓW', 'UP TO 4 PADS')],
      extra: {
        codeLabel: t('KOD POKOJU', 'ROOM CODE'),
        qrHint: t('Kod odświeża się sam', 'The code refreshes itself'),
        joined: t('DOŁĄCZYŁ DO POKOJU', 'JOINED THE ROOM'),
        waiting: t('CZEKA NA GRACZY', 'WAITING FOR PLAYERS'),
      },
      cues: [
        { id: 'tv', at: 0, dur: 900, ease: 'outQuint' },
        { id: 'panel', at: 300, dur: 800, ease: 'outCubic' },
        { id: 'qr', at: 620, dur: 1000, ease: 'outCubic' },
        { id: 'scan', at: 1400, dur: 900, ease: 'linear' },
        { id: 'phone', at: 2100, dur: 1100, ease: 'outBack' },
        { id: 'beam', at: 3100, dur: 700, ease: 'outCubic' },
        { id: 'ping', at: 3450, dur: 700, ease: 'outExpo' },
        { id: 'label', at: 1200, dur: 700, ease: 'outCubic' },
        { id: 'title', at: 1350, dur: 900, ease: 'outQuint' },
        { id: 'sub', at: 1750, dur: 900, ease: 'outCubic' },
        { id: 'chips', at: 2100, dur: 800, ease: 'outCubic' },
      ],
      camera: [
        { at: 0, scale: 1.12, rot: 1.2, x: 40 },
        { at: .45, scale: 1, rot: 0, x: 0, ease: 'inOut' },
        { at: 1, scale: 1.05, rot: -.8, x: -40, ease: 'inOut' },
      ],
      sound: [
        { at: 0, kind: 'hum', gain: .3 },
        { at: 620, kind: 'tick', gain: .4, note: 4 },
        { at: 1400, kind: 'sweep', gain: .3 },
        { at: 3100, kind: 'riser', gain: .4 },
        { at: 3450, kind: 'success', gain: .6 },
      ],
      poster: .62,
      bind: ['qr', 'players'],
      note: 'Prawdziwy kod QR z pokoju (albo zaproszenie do aplikacji) + prawdziwy licznik graczy, jeśli ktoś właśnie dołączył.',
    },
    {
      id: 'handoff',
      view: 'handoff',
      chapter: t('Kontroler', 'Controller'),
      ms: 7000,
      label: t('KONTROLER', 'CONTROLLER'),
      title: t('Telefon = kontroler.', 'Your phone is the controller.'),
      sub: t('Dwa kciuki, joystick, przyciski i wibracje — dokładnie tam, gdzie je czujesz.', 'Two thumbs, a stick, buttons and haptics — right where your hands are.'),
      chips: [t('JOYSTICK', 'STICK'), t('WIBRACJE', 'HAPTICS'), t('BEZ APLIKACJI', 'NO APP')],
      extra: {
        padHeader: t('PAD 1 · POŁĄCZONY', 'PAD 1 · CONNECTED'),
        ready: t('GOTOWY', 'READY'),
        zoom: t('ZBLIŻENIE', 'CLOSE-UP'),
      },
      cues: [
        { id: 'screen', at: 0, dur: 700, ease: 'outQuint' },
        { id: 'padUi', at: 250, dur: 800, ease: 'outCubic' },
        { id: 'controller', at: 700, dur: 1500, ease: 'inQuad' },
        { id: 'impact', at: 2200, dur: 420, ease: 'outExpo' },
        { id: 'ripple', at: 2250, dur: 900, ease: 'outExpo', fade: 300 },
        { id: 'splat', at: 2250, dur: 520, ease: 'outExpo' },
        { id: 'reform', at: 2950, dur: 1000, ease: 'outBack' },
        { id: 'stick', at: 3900, dur: 1600, ease: 'inOut' },
        { id: 'press', at: 4900, dur: 420, ease: 'outExpo' },
        { id: 'ready', at: 5400, dur: 600, ease: 'outBack' },
        { id: 'label', at: 900, dur: 700, ease: 'outCubic' },
        { id: 'title', at: 1050, dur: 900, ease: 'outQuint' },
        { id: 'sub', at: 1450, dur: 900, ease: 'outCubic' },
        { id: 'chips', at: 1800, dur: 800, ease: 'outCubic' },
      ],
      camera: [
        { at: 0, scale: 1.16, y: 30, rot: 0 },
        { at: .3, scale: 1.02, y: 0, ease: 'inOut' },
        { at: .62, scale: 1.05, y: -10, ease: 'inOut' },
        { at: 1, scale: 1.09, y: 0, x: -20, ease: 'inOut' },
      ],
      sound: [
        { at: 700, kind: 'riser', gain: .7 },
        { at: 2200, kind: 'impact', gain: .9 },
        { at: 2950, kind: 'whoosh', gain: .3 },
        { at: 3900, kind: 'ui', gain: .3 },
        { at: 4300, kind: 'tick', gain: .3, note: 7 },
        { at: 4700, kind: 'tick', gain: .3, note: 9 },
        { at: 4900, kind: 'ui', gain: .5, note: 12 },
        { at: 5400, kind: 'success', gain: .5 },
      ],
      poster: .74,
      videos: [],
      note: 'Kontroler wpada dosłownie w ekran telefonu: tuman, pęknięcie światła, Plamek rozbryzguje się i wraca na przycisk A.',
    },
    {
      id: 'play',
      view: 'play',
      chapter: t('Runda', 'Round'),
      ms: 6000,
      label: t('RUNDA', 'ROUND'),
      title: t('Trzy. Dwa. Jeden.', 'Three. Two. One.'),
      sub: t('Jeden ekran, wspólna arena, jedna runda. Odliczanie widzi cała ekipa.', 'One screen, one arena, one round. The whole crew sees the countdown.'),
      chips: [t('2–4 GRACZY', '2–4 PLAYERS'), t('BOTY W GRZE', 'BOTS INCLUDED'), t('4 KONTROLERY', '4 CONTROLLERS')],
      extra: {
        countdown: t('START', 'GO'),
        arenaLabel: t('STALOWY FRONT · WSPÓLNY EKRAN', 'STEEL FRONT · SHARED SCREEN'),
        readyChip: t('GOTOWY', 'READY'),
      },
      cues: [
        { id: 'pull', at: 0, dur: 1100, ease: 'outQuint' },
        { id: 'tv', at: 0, dur: 900, ease: 'outQuint' },
        { id: 'video', at: 600, dur: 500, ease: 'outCubic' },
        { id: 'phone', at: 200, dur: 1000, ease: 'outBack' },
        { id: 'p1', at: 900, dur: 520, ease: 'outBack' },
        { id: 'p2', at: 1200, dur: 520, ease: 'outBack' },
        { id: 'p3', at: 1500, dur: 520, ease: 'outBack' },
        { id: 'p4', at: 1800, dur: 520, ease: 'outBack' },
        { id: 'n3', at: 2500, dur: 380, ease: 'outExpo', fade: 200 },
        { id: 'n2', at: 2950, dur: 380, ease: 'outExpo', fade: 200 },
        { id: 'n1', at: 3400, dur: 380, ease: 'outExpo', fade: 200 },
        { id: 'go', at: 3850, dur: 500, ease: 'outExpo', fade: 400 },
        { id: 'label', at: 2200, dur: 700, ease: 'outCubic' },
        { id: 'title', at: 2350, dur: 900, ease: 'outQuint' },
        { id: 'sub', at: 2750, dur: 900, ease: 'outCubic' },
        { id: 'chips', at: 3100, dur: 800, ease: 'outCubic' },
      ],
      camera: [
        { at: 0, scale: 1.14, x: -60, rot: 1 },
        { at: .4, scale: 1.01, x: 0, rot: 0, ease: 'inOut' },
        { at: .78, scale: 1, x: 0, ease: 'inOut' },
        { at: 1, scale: 1.06, x: 30, rot: -.6, ease: 'inOut' },
      ],
      sound: [
        { at: 600, kind: 'whoosh', gain: .4 },
        { at: 900, kind: 'ui', gain: .3, note: 0 },
        { at: 1200, kind: 'ui', gain: .3, note: 4 },
        { at: 1500, kind: 'ui', gain: .3, note: 7 },
        { at: 1800, kind: 'ui', gain: .3, note: 12 },
        { at: 2500, kind: 'tick', gain: .7, note: 7 },
        { at: 2950, kind: 'tick', gain: .7, note: 7 },
        { at: 3400, kind: 'tick', gain: .7, note: 7 },
        { at: 3850, kind: 'impact', gain: .7, note: 12 },
        { at: 4300, kind: 'riser', gain: .3 },
      ],
      poster: .68,
      videos: ['tanks'],
      note: 'Prawdziwe nagranie rozgrywki z tego repozytorium — wspólny ekran i cztery kontrolery dołączają po kolei.',
    },
    {
      id: 'split',
      view: 'split',
      chapter: t('Podzielony ekran', 'Split screen'),
      ms: 6000,
      label: t('WIDOK ARENY', 'ARENA VIEW'),
      title: t('Albo cztery osobne widoki.', 'Or four separate views.'),
      sub: t('Pad steruje też menu gry: widok, format meczu, start.', 'The pad also steers the game menu: view, match format, start.'),
      chips: [t('WSPÓLNY', 'SHARED'), t('PODZIELONY', 'SPLIT'), t('TURNIEJ', 'TOURNAMENT')],
      extra: {
        menuTitle: t('USTAWIENIA GRY', 'GAME SETUP'),
        row1: t('WIDOK ARENY', 'ARENA VIEW'),
        row2: t('FORMAT MECZU', 'MATCH FORMAT'),
        row3: t('PROFIL SPRZĘTU', 'HARDWARE PROFILE'),
        optShared: t('WSPÓLNY', 'SHARED'),
        optSplit: t('PODZIELONY', 'SPLIT'),
        optClassic: t('KLASYCZNY', 'CLASSIC'),
        optTournament: t('TURNIEJ', 'TOURNAMENT'),
        optBalanced: t('ZRÓWNOWAŻONY', 'BALANCED'),
        optPerf: t('WYDAJNY', 'PERFORMANCE'),
        optQuality: t('JAKOŚĆ', 'QUALITY'),
        tournament: t('TURNIEJ 1/3', 'TOURNAMENT 1/3'),
      },
      cues: [
        { id: 'tiles', at: 0, dur: 1200, ease: 'outQuint' },
        { id: 't1', at: 200, dur: 700, ease: 'outBack' },
        { id: 't2', at: 360, dur: 700, ease: 'outBack' },
        { id: 't3', at: 520, dur: 700, ease: 'outBack' },
        { id: 't4', at: 680, dur: 700, ease: 'outBack' },
        { id: 'seams', at: 1000, dur: 800, ease: 'outCubic' },
        { id: 'menu', at: 1200, dur: 800, ease: 'outCubic' },
        { id: 'step1', at: 2100, dur: 420, ease: 'outExpo' },
        { id: 'step2', at: 3000, dur: 420, ease: 'outExpo' },
        { id: 'step3', at: 3900, dur: 420, ease: 'outExpo' },
        { id: 'label', at: 1600, dur: 700, ease: 'outCubic' },
        { id: 'title', at: 1750, dur: 900, ease: 'outQuint' },
        { id: 'sub', at: 2150, dur: 900, ease: 'outCubic' },
        { id: 'chips', at: 2500, dur: 800, ease: 'outCubic' },
      ],
      camera: [
        { at: 0, scale: 1.12, rot: -1.4 },
        { at: .5, scale: 1.01, rot: .4, ease: 'inOut' },
        { at: 1, scale: 1.05, rot: -1, x: -30, ease: 'inOut' },
      ],
      sound: [
        { at: 200, kind: 'ui', gain: .35, note: 0 },
        { at: 360, kind: 'ui', gain: .35, note: 4 },
        { at: 520, kind: 'ui', gain: .35, note: 7 },
        { at: 680, kind: 'ui', gain: .35, note: 12 },
        { at: 1000, kind: 'whoosh', gain: .35 },
        { at: 2100, kind: 'tick', gain: .5 },
        { at: 3000, kind: 'tick', gain: .5 },
        { at: 3900, kind: 'tick', gain: .5 },
      ],
      poster: .62,
      videos: ['tanks', 'race', 'orbit'],
      note: 'Cztery kafle wjeżdżają kaskadą; czwarty to prawdziwe menu gry, po którym chodzi pierścień pada.',
    },
    {
      id: 'moments',
      view: 'moments',
      chapter: t('Momenty', 'Moments'),
      ms: 5000,
      label: t('MOMENTS', 'MOMENTS'),
      title: t('Każdy dobry moment zostaje.', 'Every good moment stays.'),
      sub: t('Powtórki wideo z rundy — obejrzyj teraz albo zapisz w galerii.', 'Video replays of the round — watch now or save to the gallery.'),
      chips: [t('POWTÓRKA', 'REPLAY'), t('ZWOLNIONE 0.25×', 'SLOW-MO 0.25×'), t('GALERIA', 'GALLERY')],
      extra: {
        freeze: t('MOMENT ZNALEZIONY', 'MOMENT FOUND'),
        saved: t('ZAPISANO W GALERII', 'SAVED TO GALLERY'),
        scrub: t('PRZEWIJANIE POWTÓRKI', 'REPLAY SCRUBBER'),
        tags: t('AKCJA · WYGRANA · REWANŻ', 'PLAY · VICTORY · REMATCH'),
      },
      cues: [
        { id: 'frame', at: 0, dur: 800, ease: 'outQuint' },
        { id: 'freeze', at: 700, dur: 380, ease: 'outExpo' },
        { id: 'slowmo', at: 900, dur: 600, ease: 'outBack' },
        { id: 'sweep', at: 1100, dur: 1500, ease: 'linear' },
        { id: 'bracket', at: 1500, dur: 700, ease: 'outQuint' },
        { id: 'card', at: 2700, dur: 900, ease: 'outBack' },
        { id: 'stamp', at: 3300, dur: 500, ease: 'outExpo' },
        { id: 'tags', at: 3600, dur: 800, ease: 'outCubic' },
        { id: 'label', at: 1900, dur: 700, ease: 'outCubic' },
        { id: 'title', at: 2050, dur: 900, ease: 'outQuint' },
        { id: 'sub', at: 2450, dur: 900, ease: 'outCubic' },
        { id: 'chips', at: 2800, dur: 800, ease: 'outCubic' },
      ],
      camera: [
        { at: 0, scale: 1.1, y: 20 },
        { at: .35, scale: 1.0, y: 0, ease: 'inOut' },
        { at: .8, scale: 1.03, x: -24, ease: 'inOut' },
        { at: 1, scale: 1.07, x: -50, ease: 'inOut' },
      ],
      sound: [
        { at: 700, kind: 'impact', gain: .5 },
        { at: 1100, kind: 'whoosh', gain: .3 },
        { at: 2700, kind: 'riser', gain: .35 },
        { at: 3300, kind: 'chime', gain: .5, note: 7 },
        { at: 3600, kind: 'success', gain: .4 },
      ],
      poster: .68,
      videos: ['tanks'],
      note: 'Klatka zatrzymuje się, przewijanie zwalnia, a karta „zapisano w galerii" wjeżdża z prawej.',
    },
    {
      id: 'outro',
      view: 'outro',
      chapter: t('Zaproszenie', 'Invitation'),
      ms: 5600,
      title: t('Zapraszamy do stołu.', 'Pull up a seat.'),
      sub: t('Zeskanuj kod, weź telefon i zagrajcie razem.', 'Scan the code, grab a phone and play together.'),
      chips: [t('ZESKANUJ KOD', 'SCAN THE CODE'), t('ZAGRAJCIE RAZEM', 'PLAY TOGETHER'), t('MIŁEGO WIECZORU', 'HAVE A GOOD ONE')],
      extra: {
        mark: t('JoyPad', 'JoyPad'),
        tagline: t('Twój wieczór. Twoja gra.', 'Your evening. Your game.'),
        version: t('JOYPAD OS · 1.7', 'JOYPAD OS · 1.7'),
      },
      cues: [
        { id: 'settle', at: 0, dur: 1200, ease: 'outQuint' },
        { id: 'mark', at: 500, dur: 1100, ease: 'outBack' },
        { id: 'flare', at: 1200, dur: 900, ease: 'outCubic' },
        { id: 'tagline', at: 1500, dur: 900, ease: 'outQuint' },
        { id: 'chips', at: 2100, dur: 800, ease: 'outCubic' },
        { id: 'orbit', at: 1900, dur: 2600, ease: 'linear' },
        { id: 'version', at: 2900, dur: 800, ease: 'outCubic' },
      ],
      camera: [
        { at: 0, scale: 1.08 },
        { at: .7, scale: 1, ease: 'inOut' },
        { at: 1, scale: 1.02, ease: 'inOut' },
      ],
      sound: [
        { at: 0, kind: 'whoosh', gain: .35 },
        { at: 500, kind: 'chime', gain: .55, note: 0 },
        { at: 1500, kind: 'chime', gain: .45, note: 7 },
        { at: 2100, kind: 'success', gain: .5 },
        { at: 2900, kind: 'chime', gain: .35, note: 12 },
      ],
      poster: .78,
      note: 'Wszystko odjeżdża w ciemność, zostaje znak JoyPada, hasło i Plamek krążący wokół sygnetu.',
    },
  ],
};
