/**
 * „Wychodzę z gry" to intencja, nie stan do renderowania.
 *
 * Flaga żyje w module, bo piszą ją handlery (klik w „Wróć do biblioteki", `home` z pada,
 * `back` z telefonu), a czytają efekty, silnik pauzy i okienko pauzy. `useRef`-a nie wolno
 * modyfikować poza efektami (`react-hooks/immutability`), a `useState` dołożyłby re-render
 * w środku kurtyny — czyli dokładnie w tym kadrze, w którego trakcie liczy się odpowiedź.
 *
 * Po co flaga: raz wypowiedziane wyjście nie może już nic odpauzować ani wystartować.
 * Dawniej klik „Wróć do biblioteki" w okienku pauzy znikał pod kurtyną, a pad albo
 * powtórzone `select` w tym samym kadrze przełączało pauzę z powrotem — gracz widział
 * arenę w ruchu zamiast biblioteki.
 */
let leaving = false;

/** Gracz powiedział „wychodzę" — od tej chwili tylko wyjście ma znaczenie. */
export function wishToLeave() { leaving = true; }

/** Runda startuje (albo gracz wrócił do menu) — intencja wyjścia wygasa. */
export function clearLeaveWish() { leaving = false; }

export function isLeaving() { return leaving; }
