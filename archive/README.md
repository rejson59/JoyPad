# archive/

Pakiety źródłowe gier zewnętrznych, **już zintegrowanych** z JoyPad. Trzymamy je wyłącznie
dla referencji — nie są używane w buildzie ani w runtime.

| Plik | Co to jest | Gdzie żyje kod |
| --- | --- | --- |
| `orbitalna-fala.zip` | Oryginalne źródła STAR CLASH 3D (demo „Orbitalna Fala") przed integracją | `src/arcade/starclash/` (adapter `StarClashRound.ts` + silnik `Game.ts`) |

Reguła `*.zip` w `.gitignore` obejmuje nowe paczki robocze; pliki w tym katalogu są wyjątkiem
(`!archive/*.zip`) i celowo trafiają do repo jako materiał źródłowy historii integracji.

Procedura integracji nowej paczki: [docs/game-building-prompts.md](../docs/game-building-prompts.md).
