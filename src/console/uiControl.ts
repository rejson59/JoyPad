import { useCallback, useEffect, useRef } from 'react';
import { notify } from '../platform/notifications';
import { loadLanguage, t } from '../platform/i18n';
import { padHost } from '../net/padHost';
import type { RemoteCommand } from '../net/protocol';
import { adjustable, collectNavItems, entryTarget, focusedIndex, isTypingTarget, moveTo, navScope, reveal, focusUiScope, stepRange, stepSelect, stepStepper, type NavItem } from './focusSurface';
import { shouldStep, stickDirection, type NavDirection } from './spatialNav';
import { systemSound } from './sound';
import { motionBehavior } from './preferences';
import { noteUiEngineMount, runUiShortcut } from './uiContext';
import { getTvFullscreenMode, satisfyTvFullscreen, toggleTvFullscreen } from './tvFullscreen';

/**
 * Jedno miejsce, w którym pad, pilot i klawiatura sterują interfejsem systemu.
 *
 * Komendy (`left/right/up/down/select/back/x/y/fullscreen/…`) są wspólne dla
 * klawiatury, pada USB (Gamepad API) i telefonu-admina, więc każdy klikalny
 * element jest osiągalny tą samą drogą — bez osobnych skrótów w komponentach.
 */
const MOVE: Partial<Record<RemoteCommand, NavDirection>> = { left: 'left', right: 'right', up: 'up', down: 'down' };
const KEY: Record<string, RemoteCommand> = {
  ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down',
  Enter: 'select', ' ': 'select', Escape: 'back', Backspace: 'back', Home: 'home',
};
/** Gamepad API: krzyżak, A/B/X/Y, Start, Select. */
const PAD_BUTTONS: Record<number, RemoteCommand> = {
  0: 'select', 1: 'back', 2: 'x', 3: 'y', 8: 'back', 9: 'home',
  12: 'up', 13: 'down', 14: 'left', 15: 'right',
};

/**
 * Który pad steruje interfejsem. Wolimy te z mapowaniem `standard`, ale tanie
 * kontrolery i starsze sterowniki zgłaszają puste mapowanie — odrzucenie ich
 * wyglądałoby dla gracza jak „pad się zgubił".
 */
export function interfaceGamepad(pads = navigator.getGamepads?.() ?? []): Gamepad | null {
  let fallback: Gamepad | null = null;
  for (const pad of pads) {
    if (!pad || !pad.connected) continue;
    if (pad.mapping === 'standard') return pad;
    if (!fallback && pad.buttons.length >= 16) fallback = pad;
  }
  return fallback;
}

function scrollFallback(dir: NavDirection) {
  const behavior = motionBehavior();
  const stepX = Math.round(window.innerWidth * .72), stepY = Math.round(window.innerHeight * .5);
  if (dir === 'left') window.scrollBy({ left: -stepX, behavior });
  else if (dir === 'right') window.scrollBy({ left: stepX, behavior });
  else if (dir === 'up') window.scrollBy({ top: -stepY, behavior });
  else window.scrollBy({ top: stepY, behavior });
}

/** Przeniesienie fokusa o jeden krok w zadanym kierunku. False = nic tu nie ma. */
export function stepFocus(dir: NavDirection) {
  const scope = navScope();
  if (!scope) return false;
  const items = collectNavItems(scope);
  if (!items.length) return false;
  const from: NavItem | null = items[focusedIndex(items, document.activeElement)] ?? null;
  if (!from) {
    const entry = entryTarget(scope, items, scope.dataset.uiFocus);
    if (!entry) return false;
    entry.el.focus({ preventScroll: true });
    reveal(entry, 'instant');
    systemSound('move');
    return true;
  }
  // Suwaki i listy najpierw zmieniają wartość — inaczej regulacja padem byłaby niemożliwa.
  const kind = adjustable(from.el);
  if (kind === 'range' && stepRange(from.el as HTMLInputElement, dir === 'right' || dir === 'up' ? 1 : -1)) { notePlamek('poke'); return true; }
  // Lista rozwijana: wszystkie cztery strzałki zmieniają opcję — na telewizorze nie ma
  // nic innego do roboty nad zamkniętym `<select>`.
  if (kind === 'select' && stepSelect(from.el as HTMLSelectElement, dir === 'up' || dir === 'left' ? -1 : 1)) { notePlamek('poke'); return true; }
  // Stepper ustawień gry: ←/→ zmienia wartość, ↑/↓ wychodzi na inną pozycję (zwykły ruch).
  if (kind === 'stepper' && (dir === 'left' || dir === 'right')
    && stepStepper(from.el, dir === 'right' ? 1 : -1)) { notePlamek('poke'); return true; }
  const next = moveTo(items, from, dir);
  if (!next) {
    // W tej samej grupie zawijamy (rail z kafelkami), poza nią — przewijamy ekran.
    const lane = items.filter(item => item.rect.group === from.rect.group);
    const wrapped = dir === 'left' || dir === 'up' ? lane[0] : lane[lane.length - 1];
    if (!wrapped || wrapped === from) { scrollFallback(dir); return false; }
    wrapped.el.focus({ preventScroll: true });
    reveal(wrapped, motionBehavior());
    systemSound('move');
    return true;
  }
  next.el.focus({ preventScroll: true });
  reveal(next, motionBehavior());
  systemSound('move');
  return true;
}

export interface UiControlOptions {
  /** false, gdy trwa runda: komendy idą wtedy do gry, nie do interfejsu. */
  enabled: boolean;
  onCommand?: (command: RemoteCommand) => void;
  /** Klawiatura/pad ma obsłużyć `select` tylko gdy surface nic nie chce (fallback aplikacji). */
  onSelect?: () => boolean | void;
}

/** Pad znika w połowie ruchu — kasujemy zapamiętany kierunek, żeby nie „jechał" sam. */
let dropPollHeld = () => {};

/**
 * Plamek (maskotka fokusa) dostaje informację zwrotną o tym, co pilot właśnie zrobił.
 * Zdarzenie, nie re-render: `Plamek.tsx` samo się podłącza, a aplikacja telewizora
 * nie przerysowuje całego ekranu przy każdym kiwnięciu. Brak słuchacza = brak kosztu.
 */
export type PlamekReaction = 'select' | 'back' | 'poke' | 'blocked' | 'lean';

export function notePlamek(kind: PlamekReaction, dir: NavDirection | null = null) {
  window.dispatchEvent(new CustomEvent('joypad-plamek', { detail: { kind, dir } }));
}

export function useUiControls({ enabled, onCommand, onSelect }: UiControlOptions, adminCommands = true) {
  const enabledRef = useRef(enabled);
  const handlers = useRef({ onCommand, onSelect });
  // Refu nie wolno pisać w renderze (react-hooks/refs). Zdarzenia nie wyprzedzą
  // efektu, więc najświeższe kolbaki są podstawiane tuż po nim.
  useEffect(() => { handlers.current = { onCommand, onSelect }; });
  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  const dispatch = useCallback((command: RemoteCommand) => {
    // Okienko nad rozgrywką (pauza) nadal należy do interfejsu — stąd sprawdzamy
    // też otwarty dialog, bo aplikacja nie re-renderuje się przy jego otwarciu.
    const nav = enabledRef.current || Boolean(document.querySelector('dialog[open]'));
    const move = MOVE[command];
    if (move) {
      if (!nav) { handlers.current.onCommand?.(command); return; }
      // Buźka czyta intencję: nastawia się na kierunek komendy, ZANIM fokus się zmieni.
      // To freebie — kierunek i tak już tu jest, więc nie liczymy niczego podwójnie.
      notePlamek('lean', move);
      // Ściana nie może być ciszą: Plamek dostaje „zawadzono", więc wiemy, że nic nie umknęło.
      if (!stepFocus(move)) notePlamek('blocked');
      return;
    }
    if (command === 'select') {
      if (!nav) { handlers.current.onCommand?.(command); return; }
      const el = document.activeElement;
      // Entrowanie na polu wyboru to następna opcja, nie zatwierdzenie — buźka kiwa.
      if (el instanceof HTMLSelectElement) { stepSelect(el, 1); notePlamek('poke'); return; }
      // Enter na stepperze to „następna wartość" — na telewizorze nie ma kółka myszy.
      if (el instanceof HTMLElement && adjustable(el) === 'stepper') { stepStepper(el, 1); notePlamek('poke'); return; }
      // `body` to nie przycisk: bez tego sprawdzania A z niczego nie uruchomiłoby gry.
      if (el instanceof HTMLElement && el !== document.body && el !== document.documentElement) { notePlamek('select'); el.click(); return; }
      // Otwarty modal przejmuje interakcję do końca. Fokus potrafi w nim wypaść z
      // elementu (panel potwierdzenia podmienia przyciski w DOM-ie i aktywny węzeł
      // ląduje na `body`) — wtedy `select` NIE wolno oddawać grze, bo „A" zamiast
      // zostać w okienku odpauzowywałoby rundę. Odwieszamy fokus na pierwszej pozycji
      // okienka i mówimy o tym maskotką (trafienie w ścianę, nie w pustkę).
      const modal = document.querySelector<HTMLElement>('dialog[open]');
      if (modal) { focusUiScope(modal); notePlamek('blocked'); return; }
      if (!handlers.current.onSelect?.()) handlers.current.onCommand?.(command);
      else notePlamek('select');
      return;
    }
    if (command === 'x' || command === 'y') {
      // Skróty X/Y załatwiamy sami — Plamek kiwa tylko, gdy skrót naprawdę coś zrobił.
      if (runUiShortcut(command)) notePlamek('poke');
      else handlers.current.onCommand?.(command);
      return;
    }
    if (command === 'fullscreen') { if (nav) toggleTvFullscreen(); return; }
    if (command === 'back') {
      if (getTvFullscreenMode() === 'on') { toggleTvFullscreen(); return; }
      notePlamek('back');
      if (!document.querySelector('dialog[open]')) handlers.current.onCommand?.(command);
      else window.dispatchEvent(new CustomEvent('joypad-dialog-command', { detail: command }));
      return;
    }
    handlers.current.onCommand?.(command);
  }, []);

  // Klawiatura telewizora i pilota przeglądarki.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const target = event.target instanceof Element ? event.target : null;
      const typing = isTypingTarget(target);
      let command: RemoteCommand | undefined = KEY[event.key];
      if (event.key === 'Tab') command = event.shiftKey ? 'left' : 'right';
      if (!command) return;
      // W polu tekstowym pad nie ma czego szukać — zostaje tylko Escape, żeby wyjść.
      if (typing && command !== 'back') return;
      // Każdy prawdziwy klawisz na telewizorze domyka „uzbrojone" wejście w pełny ekran,
      // więc robimy to przed bramkami — inaczej klawisz wciśnięty w grze nic by nie dał.
      satisfyTvFullscreen();
      // W grze klawiatura jest sterowaniem — wchodzi do nas tylko to, co dotyczy
      // okienka otwartego nad rozgrywką (pauza, wyniki).
      if (!enabledRef.current && !document.querySelector('dialog[open]')) return;
      event.preventDefault();
      event.stopPropagation();
      dispatch(command);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [dispatch]);

  // Prawdziwy pad na USB/BT: martwa strefa, powtarzanie przy trzymaniu i krawędzie przycisków.
  useEffect(() => {
    let raf = 0;
    let held: NavDirection | null = null;
    let heldSince = 0;
    let lastStep = 0;
    let previous = new Set<number>();
    const poll = (now: number) => {
      raf = requestAnimationFrame(poll);
      const pad = interfaceGamepad();
      if ((!enabledRef.current && !document.querySelector('dialog[open]')) || !pad || document.hidden) { held = null; previous = new Set(); return; }
      // Analog trzymany na telewizorze to też gest użytkownika — pełny ekran wstaje właśnie tak.
      satisfyTvFullscreen();
      const axes = pad.axes ?? [];
      const direction = stickDirection(Number(axes[0]) || 0, Number(axes[1]) || 0)
        ?? (pad.buttons[12]?.pressed ? 'up' : pad.buttons[13]?.pressed ? 'down' : pad.buttons[14]?.pressed ? 'left' : pad.buttons[15]?.pressed ? 'right' : null);
      if (direction !== held) {
        held = direction;
        // Pierwsze naciśnięcie idzie od razu; dopiero przytrzymanie wchodzi w rytm powtórzeń.
        if (direction) { heldSince = now; lastStep = now; dispatch(direction); }
      } else if (direction && shouldStep(now - heldSince, now - lastStep)) {
        lastStep = now;
        dispatch(direction);
      }
      const pressed = new Set<number>();
      for (const [index, command] of Object.entries(PAD_BUTTONS)) {
        const at = Number(index);
        if (!pad.buttons[at]?.pressed) continue;
        pressed.add(at);
        if (!previous.has(at)) dispatch(command);
      }
      previous = pressed;
    };
    const drop = () => { held = null; previous = new Set(); };
    dropPollHeld = drop;
    window.addEventListener('blur', drop);
    raf = requestAnimationFrame(poll);
    return () => { dropPollHeld = () => {}; window.removeEventListener('blur', drop); cancelAnimationFrame(raf); };
  }, [dispatch]);

  // Pad usypa w połowie wieczoru albo znika po odłączeniu kabla. Mówimy o tym wprost,
  // zamiast zostawiać gracza z kursorzem, który „nie słucha".
  useEffect(() => {
    const label = (pad: Gamepad | null) => (pad?.id ?? 'USB').split(/[[(,]/)[0]!.trim().slice(0, 42) || 'Pad';
    const onConnected = (event: Event) => {
      dropPollHeld();
      const pad = (event as GamepadEvent).gamepad;
      notify(t(loadLanguage(), 'pad.tvConnected', { name: label(pad) }), undefined, 'system');
      systemSound('confirm');
    };
    const onDisconnected = () => {
      dropPollHeld();
      notify(t(loadLanguage(), 'pad.tvLost'), t(loadLanguage(), 'pad.tvLostDetail'), 'system');
      systemSound('back');
    };
    window.addEventListener('gamepadconnected', onConnected);
    window.addEventListener('gamepaddisconnected', onDisconnected);
    return () => {
      window.removeEventListener('gamepadconnected', onConnected);
      window.removeEventListener('gamepaddisconnected', onDisconnected);
    };
  }, []);

  // Podpowiedzi na dole ekranu pokazują się tylko tam, gdzie pad naprawdę rządzi.
  useEffect(() => noteUiEngineMount(), []);

  // Telefon-admin wysyła te same komendy — tu wchodzi jedyny punkt wejścia.
  useEffect(() => {
    if (!adminCommands) return;
    const had = padHost.onAdminCommand;
    padHost.onAdminCommand = dispatch;
    return () => { padHost.onAdminCommand = had; };
  }, [adminCommands, dispatch]);

  return { dispatch };
}
