/**
 * HMAC‑SHA1 + base64 w czystym JavaScripcie.
 *
 * Potrzebne do wygenerowania krótkotrwałych danych logowania do darmowego TURN
 * (schemat „use-auth-secret”, ten sam co w coturn / TURN REST API).
 *
 * Celowo nie używamy `crypto.subtle` — jest dostępne wyłącznie w bezpiecznym
 * kontekście (HTTPS/localhost), a gra bywa otwierana po LAN‑owym `http://192.168.x.x`,
 * gdzie `crypto.subtle` po prostu nie istnieje. Ten kod działa wszędzie.
 */

function rotl(x: number, n: number): number {
  return ((x << n) | (x >>> (32 - n))) | 0;
}

function utf8(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}

/** SHA‑1 (RFC 3174) — 20 bajtów skrótu. */
export function sha1(msg: Uint8Array): Uint8Array {
  const bitLen = msg.length * 8;
  const withPad = msg.length + 1;
  const total = withPad + ((56 - (withPad % 64) + 64) % 64) + 8;

  const buf = new Uint8Array(total);
  buf.set(msg, 0);
  buf[msg.length] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setUint32(total - 8, Math.floor(bitLen / 0x100000000));
  dv.setUint32(total - 4, bitLen >>> 0);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Int32Array(80);

  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = dv.getInt32(i + j * 4);
    for (let j = 16; j < 80; j++) w[j] = rotl(w[j - 3] ^ w[j - 8] ^ w[j - 14] ^ w[j - 16], 1);

    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let j = 0; j < 80; j++) {
      let f: number, k: number;
      if (j < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (j < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (j < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const t = (rotl(a, 5) + f + e + k + w[j]) | 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = t;
    }
    h0 = (h0 + a) | 0; h1 = (h1 + b) | 0; h2 = (h2 + c) | 0; h3 = (h3 + d) | 0; h4 = (h4 + e) | 0;
  }

  const out = new Uint8Array(20);
  const odv = new DataView(out.buffer);
  odv.setInt32(0, h0); odv.setInt32(4, h1); odv.setInt32(8, h2); odv.setInt32(12, h3); odv.setInt32(16, h4);
  return out;
}

/** HMAC‑SHA1 (RFC 2104). */
export function hmacSha1(key: string | Uint8Array, message: string): Uint8Array {
  let k = typeof key === 'string' ? utf8(key) : key;
  if (k.length > 64) k = sha1(k);

  const block = new Uint8Array(64);
  block.set(k, 0);
  const ipad = new Uint8Array(64);
  const opad = new Uint8Array(64);
  for (let i = 0; i < 64; i++) { ipad[i] = block[i] ^ 0x36; opad[i] = block[i] ^ 0x5c; }

  return sha1(concat(opad, sha1(concat(ipad, utf8(message)))));
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : B64[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : B64[b2 & 0x3f];
  }
  return out;
}
