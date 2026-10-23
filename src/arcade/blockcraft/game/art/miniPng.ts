/**
 * 2.17: minimalny dekoder PNG (bez DOM i bez zależności).
 *
 * Grafika z paczki jest wbudowana w build jako PNG w base64, a atlas trzeba
 * złożyć **synchronicznie**, zanim powstanie pierwsza tekstura Three.js.
 * Dlatego zamiast `Image` + canvas (asynchroniczne) mamy tutaj własny
 * inflate (DEFLATE) i odpakowywanie filtrów PNG. Obsługiwane są wszystkie
 * typy, które faktycznie występują w paczce: 8-bit RGB/RGBA/indeksowane
 * i 1–8-bitowa skala szarości, bez przeplotu.
 */

/** base64 → bajty (bez `atob`, żeby działało w każdym środowisku). */
export function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/^data:[^,]*,/, '').replace(/\s+/g, '');
  const table = new Uint8Array(256);
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  for (let i = 0; i < alphabet.length; i++) table[alphabet.charCodeAt(i)] = i;
  const pad = clean.endsWith('==') ? 2 : clean.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((clean.length * 3) / 4 - pad);
  let o = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const a = table[clean.charCodeAt(i)];
    const b = table[clean.charCodeAt(i + 1)];
    const c = table[clean.charCodeAt(i + 2)];
    const d = table[clean.charCodeAt(i + 3)];
    const n = (a << 18) | (b << 12) | (c << 6) | d;
    if (o < bytes.length) bytes[o++] = (n >> 16) & 255;
    if (o < bytes.length) bytes[o++] = (n >> 8) & 255;
    if (o < bytes.length) bytes[o++] = n & 255;
  }
  return bytes;
}

// ---------------------------------------------------------------------------
// DEFLATE (RFC 1951)
// ---------------------------------------------------------------------------

const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];
const CLEN_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

type Huffman = { counts: Uint16Array; symbols: Uint16Array };

function buildHuffman(lengths: Uint8Array | number[]): Huffman {
  const counts = new Uint16Array(16);
  for (let i = 0; i < lengths.length; i++) counts[lengths[i]]++;
  counts[0] = 0;
  const offs = new Uint16Array(16);
  for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + counts[i - 1];
  const symbols = new Uint16Array(lengths.length);
  for (let i = 0; i < lengths.length; i++) if (lengths[i]) symbols[offs[lengths[i]]++] = i;
  return { counts, symbols };
}

class BitReader {
  private pos = 0;
  private bit = 0;
  constructor(private readonly data: Uint8Array) {}
  read(n: number): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const byte = this.data[this.pos] ?? 0;
      v |= ((byte >> this.bit) & 1) << i;
      this.bit++;
      if (this.bit === 8) {
        this.bit = 0;
        this.pos++;
      }
    }
    return v;
  }
  align() {
    if (this.bit) {
      this.bit = 0;
      this.pos++;
    }
  }
  /** Bieżąca pozycja w bajtach (po `align()`). */
  get offset() {
    return this.pos;
  }
  skip(n: number) {
    this.pos += n;
    this.bit = 0;
  }
}

function decodeSymbol(br: BitReader, h: Huffman): number {
  let code = 0;
  let first = 0;
  let index = 0;
  for (let len = 1; len < 16; len++) {
    code |= br.read(1);
    const count = h.counts[len];
    if (code - first < count) return h.symbols[index + (code - first)];
    index += count;
    first = (first + count) << 1;
    code <<= 1;
  }
  throw new Error('zły kod Huffmana');
}

function inflateRaw(
  src: Uint8Array,
  start = 0,
  sizeHint = 1 << 16,
  maxOut = 1 << 26
): { data: Uint8Array; bytesRead: number } {
  let buf = new Uint8Array(Math.max(1024, sizeHint));
  let outLen = 0;
  const grow = (n: number) => {
    if (outLen + n > maxOut) throw new Error('strumień PNG większy niż oczekiwano');
    if (outLen + n <= buf.length) return;
    let cap = buf.length * 2;
    while (cap < outLen + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(buf.subarray(0, outLen));
    buf = next;
  };
  const br = new BitReader(src.subarray(start));
  let last = 0;
  while (!last) {
    last = br.read(1);
    const type = br.read(2);
    if (type === 0) {
      // Blok niestarowany: [LEN][NLEN][dane], wyrównany do bajtu.
      br.align();
      const base = br.offset;
      const len = (src[start + base] | (src[start + base + 1] << 8)) & 0xffff;
      grow(len);
      for (let i = 0; i < len; i++) buf[outLen++] = src[start + base + 4 + i];
      br.skip(4 + len);
      continue;
    }
    let lit: Huffman;
    let dist: Huffman;
    if (type === 1) {
      const litLens = new Uint8Array(288);
      for (let i = 0; i < 144; i++) litLens[i] = 8;
      for (let i = 144; i < 256; i++) litLens[i] = 9;
      for (let i = 256; i < 280; i++) litLens[i] = 7;
      for (let i = 280; i < 288; i++) litLens[i] = 8;
      lit = buildHuffman(litLens);
      dist = buildHuffman(new Uint8Array(30).fill(5));
    } else if (type === 2) {
      const hlit = br.read(5) + 257;
      const hdist = br.read(5) + 1;
      const hclen = br.read(4) + 4;
      const clen = new Uint8Array(19);
      for (let i = 0; i < hclen; i++) clen[CLEN_ORDER[i]] = br.read(3);
      const clenHuff = buildHuffman(clen);
      const lengths = new Uint8Array(hlit + hdist);
      let i = 0;
      while (i < hlit + hdist) {
        const sym = decodeSymbol(br, clenHuff);
        if (sym < 16) lengths[i++] = sym;
        else if (sym === 16) {
          const prev = lengths[i - 1];
          const repeat = 3 + br.read(2);
          for (let j = 0; j < repeat; j++) lengths[i++] = prev;
        } else if (sym === 17) {
          const repeat = 3 + br.read(3);
          for (let j = 0; j < repeat; j++) lengths[i++] = 0;
        } else {
          const repeat = 11 + br.read(7);
          for (let j = 0; j < repeat; j++) lengths[i++] = 0;
        }
      }
      lit = buildHuffman(lengths.subarray(0, hlit));
      dist = buildHuffman(lengths.subarray(hlit));
    } else {
      throw new Error('zły blok DEFLATE');
    }
    for (;;) {
      const sym = decodeSymbol(br, lit);
      if (sym < 256) {
        grow(1);
        buf[outLen++] = sym;
      } else if (sym === 256) {
        break;
      } else {
        const li = sym - 257;
        if (li >= LEN_BASE.length) throw new Error('zła długość');
        const len = LEN_BASE[li] + br.read(LEN_EXTRA[li]);
        const di = decodeSymbol(br, dist);
        const d = DIST_BASE[di] + br.read(DIST_EXTRA[di]);
        grow(len);
        for (let j = 0; j < len; j++) {
          buf[outLen] = buf[outLen - d];
          outLen++;
        }
      }
    }
  }
  return { data: buf.subarray(0, outLen), bytesRead: br.offset };
}

// ---------------------------------------------------------------------------
// PNG
// ---------------------------------------------------------------------------

export interface DecodedImage {
  width: number;
  height: number;
  /** RGBA, 4 bajty na piksel. */
  data: Uint8Array;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Dekoduje PNG (base64 albo bajty) do RGBA. */
export function decodePng(input: string | Uint8Array): DecodedImage {
  const bytes = typeof input === 'string' ? base64ToBytes(input) : input;
  if (bytes.length < 8 || bytes[0] !== 0x89 || bytes[1] !== 0x50) throw new Error('to nie PNG');
  let off = 8;
  let width = 0;
  let height = 0;
  let depth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette: Uint8Array | null = null;
  let trns: Uint8Array | null = null;
  const idat: Uint8Array[] = [];
  const readU32 = (p: number) =>
    ((bytes[p] << 24) | (bytes[p + 1] << 16) | (bytes[p + 2] << 8) | bytes[p + 3]) >>> 0;
  while (off < bytes.length) {
    const len = readU32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    const data = bytes.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = readU32(off + 8);
      height = readU32(off + 12);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'PLTE') palette = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (!width || !height) throw new Error('PNG bez IHDR');
  if (interlace) throw new Error('PNG z przeplotem nieobsługiwany');

  const merged = new Uint8Array(idat.reduce((s, c) => s + c.length, 0));
  let p = 0;
  for (const chunk of idat) {
    merged.set(chunk, p);
    p += chunk.length;
  }
  // PNG trzyma DEFLATE w opakowaniu zlib (2-bajtowy nagłówek + suma Adlera).
  // Rozpoznajemy je po metodzie kompresji i sumie kontrolnej nagłówka.
  const zlib = merged.length > 2 && (merged[0] & 0x0f) === 8 && ((merged[0] << 8) | merged[1]) % 31 === 0;
  const expected = (Math.ceil((width * 4 * 8) / 8) + 1) * height;
  const raw = inflateRaw(merged, zlib ? 2 : 0, expected, expected + 1024).data;

  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[colorType] ?? 1;
  const bpp = Math.max(1, Math.ceil((channels * depth) / 8));
  const stride = Math.ceil((width * channels * depth) / 8);
  const lines = new Uint8Array(stride * height);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = src[x];
      if (filter === 1) v = (v + a) & 255;
      else if (filter === 2) v = (v + b) & 255;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 255;
      else if (filter === 4) v = (v + paeth(a, b, c)) & 255;
      cur[x] = v;
    }
    lines.set(cur, y * stride);
    prev = cur;
  }

  const sample = (x: number, y: number) => {
    if (depth === 8) return lines[y * stride + x];
    const perByte = 8 / depth;
    const byte = lines[y * stride + Math.floor(x / perByte)];
    return (byte >> (8 - depth * ((x % perByte) + 1))) & ((1 << depth) - 1);
  };

  const out = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 255;
      if (colorType === 3 && palette) {
        const idx = sample(x, y);
        r = palette[idx * 3];
        g = palette[idx * 3 + 1];
        b = palette[idx * 3 + 2];
        if (trns && idx < trns.length) a = trns[idx];
      } else if (colorType === 0) {
        r = g = b = depth === 8 ? sample(x, y) : Math.round((sample(x, y) / ((1 << depth) - 1)) * 255);
        if (trns) a = sample(x, y) === ((trns[0] << 8) | trns[1]) ? 0 : 255;
      } else if (colorType === 4) {
        r = g = b = lines[(y * stride) + x * 2];
        a = lines[y * stride + x * 2 + 1];
      } else if (colorType === 2) {
        r = lines[y * stride + x * 3];
        g = lines[y * stride + x * 3 + 1];
        b = lines[y * stride + x * 3 + 2];
      } else {
        r = lines[y * stride + x * 4];
        g = lines[y * stride + x * 4 + 1];
        b = lines[y * stride + x * 4 + 2];
        a = lines[y * stride + x * 4 + 3];
      }
      out[i] = r;
      out[i + 1] = g;
      out[i + 2] = b;
      out[i + 3] = a;
    }
  }
  return { width, height, data: out };
}

/** Szybki test, czy bajty wyglądają na PNG. */
export function looksLikePng(input: string | Uint8Array): boolean {
  if (typeof input !== 'string') return input[0] === 0x89 && input[1] === 0x50;
  return input.includes('iVBORw0KGgo');
}
