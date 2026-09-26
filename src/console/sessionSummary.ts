/** Connection is not a player ready vote. Local play never waits for a broker. */
export function sessionSummary(padCount: number, roomAvailable: boolean) {
  const count = Math.max(0, Math.min(4, Math.trunc(padCount)));
  return {
    count,
    title: count ? 'Ekipa na miejscu.' : 'Z kanapy do gry.',
    status: count ? `${count}/4 padów połączonych` : 'Klawiatura dostępna',
    next: count ? 'Wybierz ustawienia i rozpocznij rundę.' : 'Graj na klawiaturze lub zaproś telefon.',
    invite: count === 4 ? 'Zarządzaj padami' : count ? 'Dodaj kolejny pad' : 'Zaproś telefon',
    pairing: roomAvailable ? 'Zeskanuj kod aparatem telefonu.' : 'Łączymy pokój. Na klawiaturze możesz grać od razu.',
  };
}

export function readinessText(players: { nick: string; ready?: boolean }[]) {
  const ready = players.filter(p => p.ready).map(p => p.nick);
  const waiting = players.filter(p => !p.ready).map(p => p.nick);
  return [ready.length ? `Gotowi: ${ready.join(', ')}.` : '', waiting.length ? `Czekamy na: ${waiting.join(', ')}.` : players.length ? 'Cała ekipa gotowa.' : 'Graj na klawiaturze lub dodaj pad.'].filter(Boolean).join(' ');
}
