import type { Language } from '../platform/i18n';

/** Connection is not a player ready vote. Local play never waits for a broker. */
export function sessionSummary(padCount: number, roomAvailable: boolean, language: Language = 'pl') {
  const count = Math.max(0, Math.min(4, Math.trunc(padCount)));
  if (language === 'en') return {
    count,
    title: count ? 'The crew is here.' : 'From couch to game.',
    status: count ? `${count}/4 controllers connected` : 'Keyboard ready',
    next: count ? 'Choose your settings and start the round.' : 'Play with a keyboard or invite a phone.',
    invite: count === 4 ? 'Manage controllers' : count ? 'Add another controller' : 'Invite a phone',
    pairing: roomAvailable ? 'Scan the code with your phone camera.' : 'Connecting to the room. You can play on keyboard now.',
  };
  return {
    count,
    title: count ? 'Ekipa na miejscu.' : 'Z kanapy do gry.',
    status: count ? `${count}/4 padów połączonych` : 'Klawiatura dostępna',
    next: count ? 'Wybierz ustawienia i rozpocznij rundę.' : 'Graj na klawiaturze lub zaproś telefon.',
    invite: count === 4 ? 'Zarządzaj padami' : count ? 'Dodaj kolejny pad' : 'Zaproś telefon',
    pairing: roomAvailable ? 'Zeskanuj kod aparatem telefonu.' : 'Łączymy pokój. Na klawiaturze możesz grać od razu.',
  };
}

export function readinessText(players: { nick: string; ready?: boolean }[], language: Language = 'pl') {
  const ready = players.filter(p => p.ready).map(p => p.nick);
  const waiting = players.filter(p => !p.ready).map(p => p.nick);
  if (language === 'en') return [ready.length ? `Ready: ${ready.join(', ')}.` : '', waiting.length ? `Waiting for: ${waiting.join(', ')}.` : players.length ? 'The whole crew is ready.' : 'Play on keyboard or connect a controller.'].filter(Boolean).join(' ');
  return [ready.length ? `Gotowi: ${ready.join(', ')}.` : '', waiting.length ? `Czekamy na: ${waiting.join(', ')}.` : players.length ? 'Cała ekipa gotowa.' : 'Graj na klawiaturze lub dodaj pad.'].filter(Boolean).join(' ');
}
