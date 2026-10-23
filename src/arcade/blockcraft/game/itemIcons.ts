import { ITEM_LIST, type ItemDef } from './items';
import { officialItemPixels } from './packArt';

/**
 * Pixel-art painter for item icons.
 *
 * Every icon is authored as sixteen 16-character rows. Characters map to
 * palette colours ('.' or ' ' = transparent), which keeps the art readable
 * and easy to tweak next to the thing it depicts. The painted 16x16 canvas
 * is upscaled 3x with nearest-neighbour so it stays crisp in the UI.
 */

function paint(rows: string[], pal: Record<string, string>): string {
  const c = document.createElement('canvas');
  c.width = 16;
  c.height = 16;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  if (rows.length !== 16) throw new Error(`icon art needs 16 rows, got ${rows.length}`);
  rows.forEach((row, y) => {
    if (row.length !== 16) throw new Error(`icon row ${y} has ${row.length} chars: "${row}"`);
    for (let x = 0; x < 16; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      const color = pal[ch];
      if (!color) throw new Error(`icon row ${y} uses unknown palette char "${ch}"`);
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  });
  const out = document.createElement('canvas');
  out.width = 48;
  out.height = 48;
  const o = out.getContext('2d');
  if (!o) return c.toDataURL();
  o.imageSmoothingEnabled = false;
  o.drawImage(c, 0, 0, 48, 48);
  return out.toDataURL();
}

/** Darkens/lightens a #rrggbb colour by a fixed amount (negative = darker). */
function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, v + amt));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

// ---------------------------------------------------------------------------
// Shared silhouettes
// ---------------------------------------------------------------------------

/** Round mound of powder/dust (gunpowder, redstone, glowstone dust…). */
const PILE = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '................',
  '.......x.x......',
  '.....x.x.x.x....',
  '......xxxx......',
  '....xxXxxxxx....',
  '...xxXxxxXxxx...',
  '..xxxxxXxxxxxx..',
  '..xXxxXxxxXxxX..',
  '...dddddddddd...',
  '................',
  '................',
];

/** Beveled metal bar (iron & gold ingots). */
const INGOT = [
  '................',
  '................',
  '................',
  '................',
  '................',
  '....LLLLLLLL....',
  '...LHHHHHHHHD...',
  '..LHHHHHHHHHDD..',
  '.LHHHHHHHHHHHDD.',
  '.LHHHHHHHHHHHDD.',
  '.HHHHHHHHHHHDDD.',
  '.DDDDDDDDDDDDDD.',
  '..DDDDDDDDDDDD..',
  '................',
  '................',
  '................',
];

/** Cut gem with a wide table and a pointed culet (diamond, emerald…). */
const GEM_TALL = [
  '................',
  '................',
  '......LLLL......',
  '.....LWHHHD.....',
  '....LWHHHHDD....',
  '....LHHHHHDD....',
  '...LWHHHHHHDD...',
  '...LWHHHHHHDD...',
  '...LWHHHHHHDD...',
  '....LHHHHHDD....',
  '....LHHHHHDD....',
  '.....LHHHDD.....',
  '......LHDD......',
  '.......DD.......',
  '................',
  '................',
];

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

const ART: Record<number, [Record<string, string>, string[]]> = {
  // -- Patyk ----------------------------------------------------------------
  100: [
    {
      w: '#c89058', W: '#a06a32', d: '#6e4418',
    }, [
      '................',
      '................',
      '............d...',
      '...........wd...',
      '..........wd....',
      '.........wd.....',
      '........wd......',
      '.......wd.......',
      '......wd........',
      '.....wd.........',
      '....wd..........',
      '...wd...........',
      '..wd............',
      '..d.............',
      '................',
      '................',
    ]],

  // -- Węgiel ---------------------------------------------------------------
  101: [
    {
      C: '#2e2e2e', d: '#161616', L: '#4a4a4a', W: '#606060',
    }, [
      '................',
      '................',
      '................',
      '................',
      '.....CCC........',
      '...CCCCCCC......',
      '..CCLCCCCCC.....',
      '..CCCCCCCLCC....',
      '.CCCCCCCCCCdC...',
      '.CCLCCCCCCdCCd..',
      '.CCCCCCdCCCCCd..',
      '..CCCdCCCCCCCd..',
      '...CCCCCdCCCd...',
      '.....ddddddd....',
      '................',
      '................',
    ]],

  // -- Sztabki ---------------------------------------------------------------
  102: [
    {
      H: '#d4d4d8', L: '#f4f4f6', D: '#8a8a92',
    }, INGOT],
  103: [
    {
      H: '#f2ca3c', L: '#fbe98c', D: '#b88a14',
    }, INGOT],

  // -- Diament ---------------------------------------------------------------
  104: [
    {
      H: '#41e2d1', L: '#8ff2e8', D: '#1f9e90', W: '#ffffff',
    }, [
      '................',
      '................',
      '.....LLLLLL.....',
      '....LWHHHHHD....',
      '...LWHHHHHHDD...',
      '..LWHHHHHHHHDD..',
      '..LHHHHHHHHHDD..',
      '.LWHHHHHHHHHHDD.',
      '.LHHHHHHHHHHHDD.',
      '..DHHHHHHHHHDD..',
      '..DHHHHHHHHDD...',
      '...DHHHHHHHDD...',
      '....DHHHHHDD....',
      '.....DHHHDD.....',
      '......DHDD......',
      '.......DD.......',
    ]],

  // -- Proch -----------------------------------------------------------------
  105: [
    {
      x: '#7a7a80', X: '#a2a2a8', d: '#4e4e54',
    }, PILE],

  // -- Nasiona ----------------------------------------------------------------
  106: [
    {
      S: '#5a9a3a', L: '#8ac45e', d: '#3a6a24',
    }, [
      '................',
      '................',
      '................',
      '.......SS.......',
      '......SLS..SS...',
      '.......S..SLS...',
      '............S...',
      '..SS....SS......',
      '.SLSd..SLS......',
      '..Sd....S.......',
      '.......SS...SS..',
      '........S..SLS..',
      '.............S..',
      '................',
      '................',
      '................',
    ]],

  // -- Pszenica ----------------------------------------------------------------
  107: [
    {
      G: '#d9b34a', L: '#eed678', d: '#a8842e', S: '#c8a03a', s: '#96762a',
    }, [
      '................',
      '.LL....LL....LL.',
      '.LG...LGL...LGL.',
      '..G...LGL...LGL.',
      '.LG..LGLG..LGLG.',
      '.LG..LGLG..LGLG.',
      '..d...LG....LG..',
      '..s...sd...sd...',
      '..s...s....s....',
      '..s..s.....s....',
      '..s..s....s.....',
      '...ss.....s.....',
      '...s.....ss.....',
      '...s....s.......',
      '................',
      '................',
    ]],

  // -- Jabłko -----------------------------------------------------------------
  108: [
    {
      R: '#d0342c', D: '#8e1f1a', L: '#f07a6a', W: '#ffd7d0', B: '#6a3a1a', G: '#3e8a32',
    }, [
      '................',
      '.......BB.......',
      '......B..GG.....',
      '....RRRBRRR.....',
      '...RRLLRRRRRR...',
      '..RLLLRRRRRRRD..',
      '..RLLRRRRRRRRD..',
      '.RRLLRRRRRRRRDD.',
      '.RRLRRRRRRRRRDD.',
      '.RRRRRRRRRRRDDD.',
      '.RRRRRRRRRRRDDD.',
      '..RRRRRRRRRRDD..',
      '...RRDRRRRDD....',
      '....DDRRRDD.....',
      '................',
      '................',
    ]],

  // -- Chleb ------------------------------------------------------------------
  109: [
    {
      C: '#c8913e', L: '#e2b56a', D: '#8a5a20', S: '#9a6a28',
    }, [
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....CCCCCCC....',
      '...CCLLLLLCCC...',
      '..CLLLLLLLLCDC..',
      '..CLLCCLLLLCDD..',
      '.CCLLCCLLCCDDD..',
      '.CLLCCLLCCDDDD..',
      '.CCCCCCCCCDDDD..',
      '..DDDDDDDDDDD...',
      '................',
      '................',
      '................',
    ]],

  // -- Mięsa ------------------------------------------------------------------
  // Surowa wieprzowina: różowy kotlet z kością
  110: [
    {
      M: '#f0a0a8', L: '#f9cdd2', D: '#c4737d', F: '#f7ead9',
    }, [
      '................',
      '................',
      '................',
      '................',
      '......MMMMMM....',
      '....MMMMMMMMMM..',
      '...MLLMMMLMMMMM.',
      '..MLLMMMMMMMDMM.',
      '..FMMMMMMMMMDD..',
      '.FFMMMMMMMDDD...',
      '.FFMMMMMDDDD....',
      '..FMMDDDDD......',
      '...DDDDDD.......',
      '................',
      '................',
      '................',
    ]],
  // Pieczona wieprzowina
  111: [
    {
      M: '#c98858', L: '#e8b27e', D: '#96603a', F: '#e8d0a8',
    }, [
      '................',
      '................',
      '................',
      '................',
      '......MMMMMM....',
      '....MMMMMMMMMM..',
      '...MLLMMMLMMMMM.',
      '..MLLMMMMMMMDMM.',
      '..FMMMMMMMMMDD..',
      '.FFMMMMMMMDDD...',
      '.FFMMMMMDDDD....',
      '..FMMDDDDD......',
      '...DDDDDD.......',
      '................',
      '................',
      '................',
    ]],
  // Surowa wołowina
  112: [
    {
      M: '#c1443f', L: '#e0837a', D: '#8e2f2c', F: '#f0d0c8',
    }, [
      '................',
      '................',
      '................',
      '................',
      '................',
      '....MMMMMMMM....',
      '...MLLMMMMMMM...',
      '..MLLMMFMMMMMD..',
      '..MLMMMFFMMMMD..',
      '..MMMMMFMMMDDD..',
      '..MMMMMMMMMDDD..',
      '...MMMMMMDDDD...',
      '....DDDDDDDD....',
      '................',
      '................',
      '................',
    ]],
  // Stek
  113: [
    {
      M: '#8a4a30', L: '#b06a44', D: '#5e2f1e', G: '#3a1d12', F: '#d8a066',
    }, [
      '................',
      '................',
      '................',
      '................',
      '................',
      '....MMMMMMMM....',
      '...MLLMMMMMMM...',
      '..MLLMGMMMGMM...',
      '..MLMMMGMMMGMD..',
      '..MMMMMGMMMGMD..',
      '..MMMMMMMMMMDD..',
      '...FMMMMMMDDD...',
      '....FDDDDDDD....',
      '................',
      '................',
      '................',
    ]],
  // Surowy kurczak
  114: [
    {
      M: '#f2cdbb', L: '#fae6da', D: '#cf9a84', B: '#f0ead8', b: '#c2b89a',
    }, [
      '................',
      '................',
      '................',
      '................',
      '......MMMM......',
      '.....MLMMMM.....',
      '....MLLMMMMMM...',
      '...MLLMMMMMMMD..',
      '...MMMMMMMMMMD..',
      '..MMMMMMMMMMDD..',
      '...MMMMMMMDDD...',
      '....DMMMDDDD....',
      '.....BDDD.......',
      '....BbB.........',
      '................',
      '................',
    ]],
  // Pieczony kurczak (udko)
  115: [
    {
      M: '#d99a4e', L: '#f2c184', D: '#a86a32', B: '#f0ead8', b: '#c2b89a',
    }, [
      '................',
      '................',
      '................',
      '.......MMMM.....',
      '......MMMMMMM...',
      '.....MLMMMMMM...',
      '....MLLMMMMMD...',
      '....MLMMMMMDD...',
      '....MLMMMMDD....',
      '.....MMMMMDD....',
      '......MDDDD.....',
      '.......DDD......',
      '.....BB.........',
      '....BbBB........',
      '................',
      '................',
    ]],

  // -- Wiadra -----------------------------------------------------------------
  116: [
    {
      M: '#b0b0b8', L: '#d8d8de', D: '#78787e', I: '#5a5a62', H: '#8a8a90',
    }, [
      '................',
      '................',
      '...H......H.....',
      '...H......H.....',
      '....H....H......',
      '..MMMMMMMMMMMM..',
      '..MIIIIIIIIIIM..',
      '...MIIIIIIIIM...',
      '...MLIIIIIIDM...',
      '....MLIIIIDM....',
      '....MLIIIDM.....',
      '.....MLIDM......',
      '.....MDDM.......',
      '......MM........',
      '................',
      '................',
    ]],
  117: [
    {
      M: '#b0b0b8', L: '#d8d8de', D: '#78787e', I: '#3a6ad4', H: '#8a8a90', W: '#6a92f0',
    }, [
      '................',
      '................',
      '...H......H.....',
      '...H......H.....',
      '....H....H......',
      '..MMMMMMMMMMMM..',
      '..MIIIIIIIIIIM..',
      '...MWIIIIIIIM...',
      '...MLWIIIIIDM...',
      '....MLWIIIDM....',
      '....MLWIIDM.....',
      '.....MLIDM......',
      '.....MDDM.......',
      '......MM........',
      '................',
      '................',
    ]],
  118: [
    {
      M: '#b0b0b8', L: '#d8d8de', D: '#78787e', I: '#e05010', H: '#8a8a90', W: '#ffb040',
    }, [
      '................',
      '................',
      '...H......H.....',
      '...H......H.....',
      '....H....H......',
      '..MMMMMMMMMMMM..',
      '..MIIIIIIIIIIM..',
      '...MWIIIIIIIM...',
      '...MLWIIIIIDM...',
      '....MLWIIIDM....',
      '....MLWIIDM.....',
      '.....MLIDM......',
      '.....MDDM.......',
      '......MM........',
      '................',
      '................',
    ]],

  // -- Krzemień -----------------------------------------------------------------
  140: [
    {
      G: '#4a4a52', L: '#6e6e78', D: '#2c2c33', W: '#9a9aa4',
    }, [
      '................',
      '................',
      '................',
      '................',
      '......GG........',
      '.....GLLG.......',
      '....GLLGGG......',
      '...GLLGGGGG.....',
      '...GLGGGGGGD....',
      '..GGGGGGGGGDD...',
      '..GGGGGGGGGDD...',
      '...DGGGGGGDD....',
      '....DDDDDDD.....',
      '................',
      '................',
      '................',
    ]],

  // -- Kompas -----------------------------------------------------------------
  143: [
    {
      M: '#9a9aa2', L: '#c8c8d0', D: '#5a5a62', F: '#3a3a44', R: '#e24a4a', W: '#eeeef2', P: '#e2b93c',
    }, [
      '................',
      '................',
      '.....MMMMMM.....',
      '....MLLLLLLM....',
      '...MLFFFFFFFLM..',
      '...MFFFRFFFFDM..',
      '..MFFFFRRFFFFDM.',
      '..MFFFFRPFFFFDM.',
      '..MFFFFWPFFFFDM.',
      '..MFFFFWWFFFFDM.',
      '...MFFFFFFFDDM..',
      '...MDFFFFFDDDM..',
      '....MDDDDD DM...',
      '.....MDDDDM.....',
      '......MMMM......',
      '................',
    ]],

  // -- Zegar -----------------------------------------------------------------
  144: [
    {
      M: '#e2b93c', L: '#f6dc80', D: '#a8842e', F: '#6a4a10', S: '#ffe89a', w: '#e8ecf4',
    }, [
      '................',
      '................',
      '.....MMMMMM.....',
      '....MLLLLLLM....',
      '...MLFFFFFFFLM..',
      '...MFFFSSFFFDM..',
      '..MFFFS SSFFFDM.',
      '..MFFSSSSSSFFDM.',
      '..MFFSS SSFFFDM.',
      '..MFFFFSSFFFFDM.',
      '...MFFFFFFFDDM..',
      '...MDwFFFFDDDM..',
      '....MDDDDDDDM...',
      '.....MDDDDM.....',
      '......MMMM......',
      '................',
    ]],

  // -- Struna -----------------------------------------------------------------
  145: [
    {
      W: '#e8e8ea', D: '#b9b9bd',
    }, [
      '................',
      '................',
      '......WW........',
      '.....WDWW.......',
      '.....W..D.......',
      '......W.........',
      '.......WW.......',
      '........DW......',
      '.........WW.....',
      '.........D......',
      '........WW......',
      '.......WD.......',
      '......WW........',
      '......D.........',
      '................',
      '................',
    ]],

  // -- Kość -----------------------------------------------------------------
  146: [
    {
      W: '#efe9d8', D: '#c9c0a8',
    }, [
      '................',
      '................',
      '..........WW....',
      '.........WWWW...',
      '........WWDDWW..',
      '.......WWD..D...',
      '......WWD.......',
      '.....WWD........',
      '....WWD.........',
      '...WWD..........',
      '..WWDD..........',
      '.WWDDWW.........',
      '.WWWWDD.........',
      '..WW............',
      '................',
      '................',
    ]],

  // -- Pióro -----------------------------------------------------------------
  147: [
    {
      W: '#f4f4f2', D: '#c9c9c4', S: '#c9b98a', s: '#a89868',
    }, [
      '................',
      '............W...',
      '...........WWW..',
      '..........WWWD..',
      '.........WWWD...',
      '........WWWDS...',
      '.......WWWDS....',
      '......WWWDS.....',
      '.....WWWDs......',
      '....WWWDS.......',
      '.....WWDs.......',
      '......SD........',
      '.....S..........',
      '....S...........',
      '................',
      '................',
    ]],

  // -- Strzała -----------------------------------------------------------------
  148: [
    {
      H: '#4a4a52', L: '#7a7a84', w: '#8a6a3a', d: '#6a4e28', F: '#e8e8ea', f: '#c8c8cc',
    }, [
      '................',
      '............H...',
      '...........HH...',
      '..........HLH...',
      '.........HLwH...',
      '........HLww....',
      '.......Hwwd.....',
      '......Hwwd......',
      '.....Fwwd.......',
      '....FFwd........',
      '...fFFd.........',
      '..fFFfd.........',
      '.fFffd..........',
      '.ff.............',
      '................',
      '................',
    ]],

  // -- Łuk -----------------------------------------------------------------
  149: [
    {
      w: '#8a5a2b', d: '#6a3f1c', L: '#a8783e', S: '#e8e8ea',
    }, [
      '................',
      '.....www........',
      '....wL..d.......',
      '...wL....d......',
      '...S.....d......',
      '..wS......d.....',
      '..wS......d.....',
      '..wS......d.....',
      '..wS......d.....',
      '..wS......d.....',
      '...S.....d......',
      '...wL....d......',
      '....wL..d.......',
      '.....www........',
      '................',
      '................',
    ]],

  // -- Lazuryt -----------------------------------------------------------------
  150: [
    {
      C: '#2a4cc0', L: '#6a8fe8', D: '#1a2f80', W: '#a8c4ff',
    }, [
      '................',
      '................',
      '................',
      '................',
      '.....CCLC.......',
      '...CCLCCCLC.....',
      '..CCLCCCCCCL....',
      '..CCLCCCCCCLC...',
      '..CCCCCCCLCCD...',
      '...CCLCCCCCCD...',
      '....CCLCCCCD....',
      '......CCCCD.....',
      '.......DDDD.....',
      '................',
      '................',
      '................',
    ]],

  // -- Papier -----------------------------------------------------------------
  151: [
    {
      W: '#f4f4ee', D: '#c9c9c2', S: '#9a9a94', L: '#ffffff',
    }, [
      '................',
      '................',
      '..LLLLLLLLLL....',
      '..LWWWWWWWWD....',
      '..LWSSSSSWWD....',
      '..LWWWWWWWWD....',
      '..LWSSSSSSWD....',
      '..LWWWWWWWWD....',
      '..LWSSSSSWWD....',
      '..LWWWWWWWWD....',
      '..LWWWWWWWWD....',
      '..LDDDDDDDDD....',
      '...DDDDDDDD.....',
      '................',
      '................',
      '................',
    ]],

  // -- Książka -----------------------------------------------------------------
  152: [
    {
      C: '#9a4a3a', D: '#6a2a20', L: '#b86450', P: '#f0e8d8', p: '#c9bfa4', B: '#c9a0ff',
    }, [
      '................',
      '................',
      '................',
      '..CCCCCCCCCC....',
      '..CLLLLLLLLCD...',
      '..CLPPPPPPPCDD..',
      '..CLPPPPPPPCpD..',
      '..CLPPBPPPPCpD..',
      '..CLPPPPPPPCpD..',
      '..CLPPPPBPPCpD..',
      '..CLPPPPPPPCpD..',
      '..CLpppppppCDD..',
      '..CDDDDDDDDD....',
      '...DDDDDDDD.....',
      '................',
      '................',
    ]],

  // -- Szmaragd -----------------------------------------------------------------
  153: [
    {
      H: '#2ed06a', L: '#7ce8a4', D: '#168a48', W: '#d0ffe0',
    }, GEM_TALL],

  // -- Skóra -----------------------------------------------------------------
  200: [
    {
      T: '#9a6a42', L: '#c09468', D: '#6a4526',
    }, [
      '................',
      '................',
      '..D........D....',
      '..TD......DT....',
      '..TTD....DTT....',
      '.DTTTTDDTTTTD...',
      '.DTTTTTTTTTTD...',
      '.DTTLTTTTTLTD...',
      '.DTTTLTTTLTTD...',
      '.DTTTTTTTTTTD...',
      '..DTTTTTTTTD....',
      '..DTTDDDDTTD....',
      '...TD....DT.....',
      '....D....D......',
      '................',
      '................',
    ]],

  // -- Czerwony proszek ----------------------------------------------------------
  230: [
    {
      x: '#c42a2a', X: '#ff5a4a', d: '#8a1a1a',
    }, PILE],

  // -- Kwarc -----------------------------------------------------------------
  231: [
    {
      W: '#f7f3ea', L: '#ffffff', D: '#c9c0ac', E: '#8a8070',
    }, [
      '................',
      '................',
      '.......LL.......',
      '......LLL.......',
      '......WLL.......',
      '.....WWLL.......',
      '.....WWLD.......',
      '....WWWLD.......',
      '....WWWLD.......',
      '...WWWLDD.......',
      '...WWWLDD.......',
      '..WWWLDDD.......',
      '..WWLDDD........',
      '...EEDD.........',
      '....EE..........',
      '................',
    ]],

  // -- Kula szlamu -------------------------------------------------------------
  232: [
    {
      S: '#6ab86a', L: '#a8e0a0', D: '#3e8a42', W: '#d0f4c8',
    }, [
      '................',
      '................',
      '................',
      '................',
      '.....SSSSSS.....',
      '....SLLSSSSS....',
      '...SLLSSSSSSS...',
      '..SLLSSSSSSSSD..',
      '..SLSSSSSSSSSD..',
      '..SSSSSSSSSSSD..',
      '..SSSSSSSSSSDD..',
      '...SSSSSSSSDD...',
      '....SSSSSSDD....',
      '.....DDDDDD.....',
      '................',
      '................',
    ]],

  // -- Netherowa cegła -----------------------------------------------------------
  233: [
    {
      F: '#4a2424', T: '#6a3430', D: '#2e1414', M: '#1e0c0c',
    }, [
      '................',
      '................',
      '................',
      '................',
      '....TTTTTTTTT...',
      '...TFFFFFFFFFD..',
      '..TFFFFFFFFFDD..',
      '..TFFFFFFFFFDD..',
      '..MMMMMMMMMMM...',
      '..TFFFFFFFFFD...',
      '..TFFFFFFFFFDD..',
      '..FFFFFFFFFDD...',
      '..MDDDDDDDDD....',
      '................',
      '................',
      '................',
    ]],

  // -- Perła Endu ---------------------------------------------------------------
  234: [
    {
      S: '#3a8a7a', L: '#6ac4b0', D: '#1e5044', W: '#c8f0e0',
    }, [
      '................',
      '................',
      '................',
      '................',
      '.....SSSSSS.....',
      '....SLLSSSSS....',
      '...SLLSSSSSSS...',
      '..SLLSSSSLSSSD..',
      '..SLSSSSSLSSSD..',
      '..SSSSSSSSSSDD..',
      '..SSSSDSSSSSDD..',
      '...SSSDDDSSDD...',
      '....SSDDDSDD....',
      '.....DDDDDD.....',
      '................',
      '................',
    ]],

  // -- Płomienna różdżka -----------------------------------------------------------
  235: [
    {
      w: '#f2b93c', L: '#ffe08a', d: '#c88a1a', S: '#fff6c8',
    }, [
      '..........SS....',
      '.........wLw....',
      '........wLwd....',
      '.......wLwd.....',
      '......wLwd......',
      '.....wLwd.......',
      '....wLwd........',
      '...wLwd.........',
      '..wLwd..........',
      '..wLd...........',
      '..wd............',
      '..S.............',
      '...S............',
      '................',
      '................',
      '................',
    ]],

  // -- Łza Ghasta ---------------------------------------------------------------
  236: [
    {
      W: '#e8f0f8', L: '#ffffff', D: '#c9d8e8', B: '#a8bcd4',
    }, [
      '................',
      '................',
      '.......WL.......',
      '.......WL.......',
      '......WLL.......',
      '......WLD.......',
      '.....WLLD.......',
      '.....WLLD.......',
      '....WLLLLD......',
      '....WLLLLD......',
      '...WLLLLLLD.....',
      '...WLLWLLLD.....',
      '...WLLLLLLDD....',
      '....DLLLDDD.....',
      '.....DDDDD......',
      '................',
    ]],

  // -- Magmowy krem -------------------------------------------------------------
  237: [
    {
      S: '#d8703a', L: '#f2b06a', D: '#8a3a1a', W: '#ffd898',
    }, [
      '................',
      '................',
      '................',
      '................',
      '.....SSSSSS.....',
      '....SLLSSSSS....',
      '...SLLWSSSSSS...',
      '..SLLSSSDSSSSD..',
      '..SLSSSSSSDSSD..',
      '..SSSSDSSSSSSD..',
      '..SSSSSSDSSSDD..',
      '...SSDSSSSSDD...',
      '....SSSSSSDD....',
      '.....DDDDDD.....',
      '................',
      '................',
    ]],

  // -- Plaster miodu -------------------------------------------------------------
  238: [
    {
      w: '#e8b040', e: '#d89c28', L: '#f8d878', D: '#b07818', W: '#ffeeb0',
    }, [
      '................',
      '................',
      '................',
      '................',
      '.....W..W.......',
      '....Wew.weW.....',
      '...wewwwwwew....',
      '..wwewwwweww....',
      '..wweDDDDeww....',
      '..wwewwwweww....',
      '...wewwwwwew....',
      '....WeDweW......',
      '.....W..W.......',
      '................',
      '................',
      '................',
    ]],

  // -- Brodawka Netheru -----------------------------------------------------------
  239: [
    {
      R: '#a82828', L: '#d84a4a', D: '#6a1414', S: '#d8c8a8', s: '#a89068',
    }, [
      '................',
      '................',
      '................',
      '................',
      '....LRR.........',
      '...LRRLRR.......',
      '..LRRRLRRLR.....',
      '..RRRRRRRRLR....',
      '..RRLRRRLRRR....',
      '..RRRLRRRLRD....',
      '...RRRRRRRDD....',
      '....DRDDRD......',
      '....sD..Ds......',
      '...ss....s......',
      '................',
      '................',
    ]],

  // -- Jasnogłazowy pył -----------------------------------------------------------
  240: [
    {
      x: '#f2d84a', X: '#fff2a8', d: '#d89020',
    }, PILE],

  // -- Odłamek pryzmarynu -----------------------------------------------------------
  241: [
    {
      B: '#4ab8a8', L: '#8ae8d8', D: '#2a8074', W: '#c8fff0',
    }, [
      '................',
      '................',
      '................',
      '.........LL.....',
      '........LLL.....',
      '.......WLLB.....',
      '......WLLBB.....',
      '.....WLLBB......',
      '.....WLLBB......',
      '....WLLBBD......',
      '....WLBBD.......',
      '...WLBBD........',
      '..LLBBD.........',
      '..LBBD..........',
      '..DDD...........',
      '................',
    ]],

  // -- 2.3 „Wyprawa i ratunek” ---------------------------------------------------------
  // Surowa ryba: srebrno-zielona, spiczony ogon
  243: [
    {
      M: '#b9a184',
      L: '#e2d2bb',
      D: '#7e6a52',
      W: '#3f6f6a',
      E: '#c4453f',
    }, [
      '................',
      '................',
      '................',
      '................',
      '..D...DDDDDDDD..',
      '.DD..DWWWWWWWWD.',
      'DD..DMMMMMMMEEMM',
      'DD..DMMMMMMDMMMM',
      'DD..DMMMMMMMMMMM',
      'DD...DLLLLLLLLD.',
      '.DD...DDDDDDDD..',
      '................',
      '................',
      '................',
      '................',
      '................',
    ]],
  // Pieczona ryba: zlota skorka i przypalony ogon
  244: [
    {
      M: '#d29a58',
      L: '#f0c184',
      D: '#8a5c2c',
      W: '#7a4a22',
      E: '#c4453f',
    }, [
      '................',
      '................',
      '................',
      '................',
      '..D...DDDDDDDD..',
      '.DD..DWWWWWWWWD.',
      'DD..DMMMMMMMEEMM',
      'DD..DMMMMMMDMMMM',
      'DD..DMMMMMMMMMMM',
      'DD...DLLLLLLLLD.',
      '.DD...DDDDDDDD..',
      '................',
      '................',
      '................',
      '................',
      '................',
    ]],
  // Surowy losos: rozowy z jasnym grzbietem
  245: [
    {
      M: '#e08a6a',
      L: '#f6bda6',
      D: '#a4563c',
      W: '#f2d9cf',
      E: '#c4453f',
    }, [
      '................',
      '................',
      '................',
      '................',
      '..D...DDDDDDDD..',
      '.DD..DWWWWWWWWD.',
      'DD..DMMMMMMMEEMM',
      'DD..DMMMMMMDMMMM',
      'DD..DMMMMMMMMMMM',
      'DD...DLLLLLLLLD.',
      '.DD...DDDDDDDD..',
      '................',
      '................',
      '................',
      '................',
      '................',
    ]],
  // Pieczony losos: ciemniejszy, z przypaleniem
  246: [
    {
      M: '#e0703a',
      L: '#f5a06a',
      D: '#94441e',
      W: '#6d2f14',
      E: '#c4453f',
    }, [
      '................',
      '................',
      '................',
      '................',
      '..D...DDDDDDDD..',
      '.DD..DWWWWWWWWD.',
      'DD..DMMMMMMMEEMM',
      'DD..DMMMMMMDMMMM',
      'DD..DMMMMMMMMMMM',
      'DD...DLLLLLLLLD.',
      '.DD...DDDDDDDD..',
      '................',
      '................',
      '................',
      '................',
      '................',
    ]],
  // Totem Ratowania: glowka z nasadia, swiecace oczy i klejnot
  248: [
    {
      M: '#c9963a',
      L: '#f0d27a',
      D: '#8a5f18',
      W: '#fff4c0',
      K: '#241808',
      G: '#3aa87a',
    }, [
      '................',
      '....DDDDDDDD....',
      '..DDMMMMMMMMDD..',
      '.DMMMMMMMMMMMMD.',
      '.DLMMMMMMMMMMMD.',
      '.DLMWWW.WW.LD...',
      '.DLMWKK.KK.LD...',
      '.DLMWKK.KK.LD...',
      '.DLMWWW.WW.LD...',
      '.DLMMMMMMMMMMMD.',
      '.DMMMMMMMMMMMMD.',
      '..DMMMMMMMMMMD..',
      '..DDMMGGGGMMDD..',
      '....MMGGGGMM....',
      '...DDDDDDDDDDD..',
      '................',
    ]],

  // -- 2.4 „Godzina alchemika” ----------------------------------------------------
  // Szklana fiolka: wąska szyjka, zaokrąglone dno, błysk po lewej.
  342: [
    { G: '#cfeaf5', g: '#8fb8cc', W: '#ffffff', D: '#5c8499' }, [
      '................',
      '.....GGGGGG.....',
      '.....GWW..G.....',
      '.....GWW..G.....',
      '....GGWW..GG....',
      '....GGW....GG...',
      '...GGWW....GG...',
      '...GGW......GG..',
      '...GGW......GG..',
      '..GGWW......GG..',
      '..GGW........GG.',
      '..GGW........GG.',
      '..GGGGGGGGGGGG..',
      '..GGGGGGGGGGGG..',
      '...GGGGGGGGGG...',
      '....GGGGGGGG....',
    ]],
  // Fiolka z wodą: woda wypełnia dół szyjki i dno.
  343: [
    { G: '#cfeaf5', W: '#ffffff', w: '#3a6ad4', W2: '#6a9ae8' }, [
      '................',
      '.....GGGGGG.....',
      '.....GWW..G.....',
      '.....GWW..G.....',
      '....GGWW..GG....',
      '....GGWW..GG....',
      '...GGWWWWGGG....',
      '...GGWWWWWWGG...',
      '..GGWWWWWWWWGG..',
      '..GGWWWWWWWWGG..',
      '..GGWWWWWWWWGG..',
      '..GGWWWWWWWWGG..',
      '..GGGGGGGGGGGG..',
      '..GGGGGGGGGGGG..',
      '...GGGGGGGGGG...',
      '....GGGGGGGG....',
    ]],
  // Cukier: biała kostka cukru z drobinami.
  341: [
    { W: '#ffffff', w: '#e8e4da', D: '#c4beb0', d: '#a8a294' }, [
      '................',
      '................',
      '................',
      '................',
      '................',
      '.....WWWWWW.....',
      '....WWWWWWWW....',
      '...WWWWdWWWWWW..',
      '..WWWWWWWWWWWW..',
      '..WWWdWWWWWWWW..',
      '..WWWWWWWWWWWW..',
      '...WWWWWWWWWW...',
      '....dWWWWWWd....',
      '.....dddddd.....',
      '................',
      '................',
    ]],
  // Butelka miodu: bursztynowy miód prawie po szyjkę.
  344: [
    { G: '#cfeaf5', W: '#ffffff', m: '#e8a020', M: '#c07810', y: '#f8c848' }, [
      '................',
      '.....GGGGGG.....',
      '.....GWW..G.....',
      '.....GWW..G.....',
      '....GGWW..GG....',
      '....GGWW..GG....',
      '...GGWWWWWGG....',
      '...GGWmmmmmGG...',
      '..GGWmyyymGGG...',
      '..GGWmmmmmmGG...',
      '..GGWmmmmmmGG...',
      '..GGWmmMMmmGG...',
      '..GGGGGGGGGGGG..',
      '..GGGGGGGGGGGG..',
      '...GGGGGGGGGG...',
      '....GGGGGGGG....',
    ]],
};

/** 2.4: sylwetka fiolki z barwioną cieczą – wspólna dla wszystkich napojów. */
function potionArt(liquid: string, light: string, dark: string): [Record<string, string>, string[]] {
  return [
    { G: '#cfeaf5', W: '#ffffff', L: liquid, H: light, D: dark },
    [
      '................',
      '.....GGGGGG.....',
      '.....GWW..G.....',
      '.....GWW..G.....',
      '....GGWW..GG....',
      '....GGWW..GG....',
      '...GGWWWWWGG....',
      '...GGWLLLLLGG...',
      '..GGWLLLLLLLGG..',
      '..GGWLLLLLLLGG..',
      '..GGWHLLLLLGG...',
      '..GGWHLLLLLGG...',
      '..GGWLLLLLLGG...',
      '..GGWDDDDLLGG...',
      '..GGGGGGGGGGGG..',
      '....GGGGGGGG....',
    ],
  ];
}

const POTION_ART: Record<number, [Record<string, string>, string[]]> = {
  // zaczarowany napój: mętna, kremowa esencja
  345: potionArt('#c8b8a8', '#e8dcc8', '#9a8a76'),
  // leczący: krwisty róż
  346: potionArt('#d44a5a', '#f08a94', '#8a2030'),
  // ognioodporność: rozgrzany bursztyn
  347: potionArt('#e07820', '#f8a848', '#9a4a10'),
  // szybkość: świeża limonka
  348: potionArt('#b8e04a', '#d8f08a', '#7a9a28'),
  // nocne widzenie: luminescencyjna zieleń
  349: potionArt('#4ad0a8', '#8af0d0', '#28907a'),
  // siła: rozgrzana miedź
  350: potionArt('#e0a030', '#f8c858', '#9a6414'),
  // regeneracja: różowy korzeń
  351: potionArt('#e06090', '#f898bc', '#9a3058'),
};
Object.assign(ART, POTION_ART);

// ---------------------------------------------------------------------------
// Tools – silhouettes are shared, colours come from the item tier.
// ---------------------------------------------------------------------------

const HANDLE_LIGHT = '#a06a32';
const HANDLE_DARK = '#6e4418';
const HANDLE_HI = '#c89058';

function toolPal(it: ItemDef): Record<string, string> {
  return {
    H: it.color,
    D: shade(it.color, -52),
    L: shade(it.color, 46),
    W: shade(it.color, 90),
    w: HANDLE_LIGHT,
    d: HANDLE_DARK,
    v: HANDLE_HI,
    S: '#e8e8ea', // bow string
    f: '#ffd84a', // sparks
    F: '#4a4a52', // flint
    P: '#c44848', // pivot screw
    B: '#c8c8d0', // iron boss
    b: '#8a8a92',
  };
}

function toolArt(it: ItemDef): string[] {
  const k = it.tool;
  if (k === 'pick') {
    return [
      '................',
      '...HHHHHHHHHH...',
      '..HLLLLLLLLLLHH.',
      '.HHD.....vv.DHH.',
      '.HH.....vv..DHH.',
      '.HD....vv...DHH.',
      '.H....vv....DH..',
      '.....vv.....D...',
      '....vv..........',
      '...vv...........',
      '..vv............',
      '.vv.............',
      '.v..............',
      '................',
      '................',
      '................',
    ];
  }
  if (k === 'axe') {
    return [
      '................',
      '....HHHHH.......',
      '...HLLLLHH......',
      '..HLLLLHHv......',
      '..HLLHHHv.......',
      '..DHHHvv........',
      '...Dvv..........',
      '..vv............',
      '.vv.............',
      'vv..............',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  }
  if (k === 'shovel') {
    return [
      '................',
      '.....HHHH.......',
      '....HLLLLH......',
      '....HLLLLH......',
      '.....HLLH.......',
      '......vv........',
      '.....vv.........',
      '....vv..........',
      '...vv...........',
      '..vv............',
      '.vv.............',
      '.v..............',
      '................',
      '................',
      '................',
      '................',
    ];
  }
  if (k === 'sword') {
    return [
      '.............HH.',
      '............HLH.',
      '...........HLWD.',
      '..........HLWD..',
      '.........HLWD...',
      '........HLWD....',
      '.......HLWD.....',
      '......HLWD......',
      '.dd..HLWD.......',
      '..ddHLWD........',
      '...ddd..........',
      '..vddd..........',
      '.vv..d..........',
      '................',
      '................',
      '................',
    ];
  }
  if (k === 'hoe') {
    return [
      '................',
      '...HHHHHHH......',
      '..HL....DHH.....',
      '..HD.....vv.....',
      '...D....vv......',
      '.......vv.......',
      '......vv........',
      '.....vv.........',
      '....vv..........',
      '...vv...........',
      '..vv............',
      '.vv.............',
      '.v..............',
      '................',
      '................',
      '................',
    ];
  }
  if (k === 'shears') {
    return [
      '................',
      '..W..........W..',
      '..WL........LW..',
      '...WL......LW...',
      '...WWL....LWW...',
      '....WWL..LWW....',
      '.....WWLLWW.....',
      '......WLWL......',
      '.....PW..WP.....',
      '....PW....WP....',
      '....W......W....',
      '...PW......WP...',
      '...WW......WW...',
      '................',
      '................',
      '................',
    ];
  }
  if (k === 'igniter') {
    return [
      '................',
      '................',
      '..........FFF...',
      '.........Fffff..',
      '........FFfff...',
      '.......FFF......',
      '...HHHHFFF......',
      '..HH..HFFF......',
      '..HH............',
      '..H.............',
      '..HH..H.........',
      '...HHHHH........',
      '................',
      '.....f.f........',
      '................',
      '................',
    ];
  }
  if (k === 'bow') {
    return [
      '................',
      '.....wwww.......',
      '....wL..d.......',
      '...wL....d......',
      '...S.....d......',
      '..wS......d.....',
      '..wS......d.....',
      '..wS......d.....',
      '..wS......d.....',
      '..wS......d.....',
      '...S.....d......',
      '...wL....d......',
      '....wL..d.......',
      '.....wwww.......',
      '................',
      '................',
    ];
  }
  if (k === 'rod') {
    return [
      '................',
      '................',
      '.........ww.....',
      '........ww......',
      '.......ww.......',
      '......ww........',
      '.....ww.........',
      '....ww..........',
      '...ww...........',
      '..ww............',
      '.ww.............',
      'wwd.............',
      'ww..............',
      '..vv............',
      '...vv...........',
      '....vv..........',
    ];
  }
  if (k === 'spyglass') {
    return [
      '................',
      '................',
      '................',
      '...DDD...DDD....',
      '..DLLD..DLLD....',
      '..DLLD..DLLD....',
      '..DLLD..DLLD....',
      '...DDHDHDDD.....',
      '.....DHD........',
      '....DHHHD.......',
      '...DHHLLHD......',
      '...DHLLLHD......',
      '...DHLLLHD......',
      '...DHHLLHD......',
      '....DHHHD.......',
      '.....DDD........',
    ];
  }
  // shield
  return [
    '................',
    '...dddddddddd...',
    '..dwwwwwwwwwwd..',
    '..dwLLwwwwwwwd..',
    '..dwLwwwwLwwwd..',
    '..dwwwwwBBBwwd..',
    '..dwwwwBHBwwd...',
    '..dwwwwBBBwwd...',
    '..dwwwwwLwwwd...',
    '..dwwwwwwwwwwd..',
    '..dwwwwwwwwwwd..',
    '...dwwwwwwwwd...',
    '....dwwwwwwd....',
    '.....dwwwwd.....',
    '......dddd......',
    '................',
  ];
}

// ---------------------------------------------------------------------------
// Armor – one silhouette per slot, coloured by tier.
// ---------------------------------------------------------------------------

function armorArt(it: ItemDef): string[] {
  const slot = it.armor?.slot ?? 0;
  if (slot === 0) {
    // helmet: dome with a brim and a nose guard
    return [
      '................',
      '....HHHHHHHH....',
      '...HLLLLLLLLH...',
      '..HLLLLLLLLLLH..',
      '..HLHHHHHHHHDH..',
      '..HLHDDDDDHHDH..',
      '..HHHHHHHHHHDH..',
      '..DDDDDDDDDDDH..',
      '...H.........H..',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ];
  }
  if (slot === 1) {
    // chestplate: shoulders, neck notch, torso
    return [
      '................',
      '.HHH........HHH.',
      'HLLHH......HHLLH',
      'HLHHHHHHHHHHHHLH',
      'HLHHHHHHHHHHHHLH',
      '.DHHHHHHHHHHHHD.',
      '.DHHHHDHHHDHHHD.',
      '.DHHHHDDDDHHHHD.',
      '.DHHHHHHHHHHHHD.',
      '.DHHHHHHHHHHHHD.',
      '..DHHHHHHHHHHD..',
      '..DDHHHHHHHHDD..',
      '...DDDDDDDDDD...',
      '................',
      '................',
      '................',
    ];
  }
  if (slot === 2) {
    // leggings: waistband and two legs
    return [
      '................',
      '...HHHHHHHHHH...',
      '..HLLLLLLLLLLH..',
      '..DHHHHHHHHHHD..',
      '..DHHH....HHHD..',
      '..DHHH....HHHD..',
      '..DHHH....HHHD..',
      '..DHHH....HHHD..',
      '..DHHH....HHHD..',
      '..DHHD....DHHD..',
      '...DHD....DHD...',
      '....DD....DD....',
      '................',
      '................',
      '................',
      '................',
    ];
  }
  // boots
  return [
    '................',
    '................',
    '................',
    '................',
    '...HHH....HHH...',
    '...HLLH...HLLH..',
    '...HLLH...HLLH..',
    '...HLLH...HLLH..',
    '...HLLH...HLLH..',
    '..HHLLHH..HHLLHH',
    '.HHLLLLHHHHLLLLH',
    'HHLLLLLLLLLLLLLH',
    'DDDDDDDDDDDDDDDD',
    '................',
    '................',
    '................',
  ];
}

function armorPal(it: ItemDef): Record<string, string> {
  return { H: it.color, D: shade(it.color, -60), L: shade(it.color, 50), B: '#c8c8d0', b: '#8a8a92' };
}

// ---------------------------------------------------------------------------

/**
 * 2.17: ikona z paczki (16×16 RGBA) → data URL 48×48 powiększony bez
 * wygładzania. Gdy canvas nie działa (np. w testach), zwracamy `null`
 * i gra zostaje przy rysowanej ikonie.
 */
function paintPixels(px: Uint8Array): string | null {
  try {
    const c = document.createElement('canvas');
    c.width = 16;
    c.height = 16;
    const ctx = c.getContext('2d');
    if (!ctx) return null;
    const img = ctx.createImageData(16, 16);
    img.data.set(px);
    ctx.putImageData(img, 0, 0);
    const out = document.createElement('canvas');
    out.width = 48;
    out.height = 48;
    const o = out.getContext('2d');
    if (!o) return c.toDataURL();
    o.imageSmoothingEnabled = false;
    o.drawImage(c, 0, 0, 48, 48);
    const url = out.toDataURL();
    return url && url.length > 'data:,'.length ? url : null;
  } catch {
    return null;
  }
}

export function buildItemIcons(): Record<number, string> {
  const icons: Record<number, string> = {};
  // 2.17: najpierw ikony z paczki (Pixel Perfection CE) – tylko dla
  // przedmiotów, które paczka 1.16 naprawdę ma.
  const fromPack: Record<number, string> = {};
  for (const it of ITEM_LIST) {
    const px = officialItemPixels(it.id);
    if (!px) continue;
    const url = paintPixels(px);
    if (url) fromPack[it.id] = url;
  }
  for (const it of ITEM_LIST) {
    if (fromPack[it.id]) {
      icons[it.id] = fromPack[it.id];
      continue;
    }
    if (it.kind === 'armor') icons[it.id] = paint(armorArt(it), armorPal(it));
    else if (it.kind === 'tool') icons[it.id] = paint(toolArt(it), toolPal(it));
    else if (ART[it.id]) icons[it.id] = paint(ART[it.id][1], ART[it.id][0]);
    else if (it.kind === 'food') icons[it.id] = paint(ART[108][1], { ...ART[108][0], R: it.color });
    else icons[it.id] = paint(INGOT, { H: it.color, L: shade(it.color, 46), D: shade(it.color, -52) });
  }
  return icons;
}

