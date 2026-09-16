/**
 * FAST GUNS — cryptographic primitives.
 *
 * Uses only standard, browser-native WebCrypto primitives:
 *   - crypto.getRandomValues for all randomness
 *   - SHA-256 digests
 *   - HKDF-SHA256 key derivation
 *   - AES-256-GCM authenticated encryption
 *   - PBKDF2-SHA256 password KDF
 *   - ECDH P-256 key agreement, ECDSA P-256 signatures
 *
 * No custom algorithms. No ECB. No nonce reuse. No raw-password keys.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function randomUuid(): string {
  return crypto.randomUUID();
}

export function utf8(value: string): Uint8Array {
  return encoder.encode(value);
}

export function fromUtf8(data: ArrayBuffer | Uint8Array): string {
  return decoder.decode(data);
}

export function toHex(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function toBase64(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function toBase64Url(bytes: Uint8Array): string {
  return toBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function fromBase64Url(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  return fromBase64(padded);
}

export async function sha256(data: ArrayBuffer | Uint8Array): Promise<ArrayBuffer> {
  return crypto.subtle.digest("SHA-256", data as BufferSource);
}

export async function sha256Hex(data: ArrayBuffer | Uint8Array): Promise<string> {
  return toHex(await sha256(data));
}

export function generateIv(): Uint8Array {
  return randomBytes(12);
}

/** Crockford base32 (no I, L, O). */
const BASE32_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function toBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < bytes.length; i++) {
    value = (value << 8) | bytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * HKDF-SHA256 → derived bits.
 */
export async function hkdfBits(
  ikm: ArrayBuffer,
  salt: Uint8Array,
  info: Uint8Array,
  lengthBytes: number
): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey("raw", ikm, "HKDF", false, ["deriveBits"]);
  return crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    lengthBytes * 8
  );
}

/** AES-256-GCM encrypt with additional authenticated data. */
export async function aesGcmEncrypt(
  key: CryptoKey,
  plaintext: ArrayBuffer | Uint8Array,
  aad?: Uint8Array
): Promise<{ iv: Uint8Array; ct: ArrayBuffer }> {
  const iv = generateIv();
  const params: AesGcmParams = { name: "AES-GCM", iv: iv as BufferSource };
  if (aad) params.additionalData = aad as BufferSource;
  const ct = await crypto.subtle.encrypt(params, key, plaintext as BufferSource);
  return { iv, ct };
}

/** AES-256-GCM decrypt. Throws OperationError on auth failure / wrong key. */
export async function aesGcmDecrypt(
  key: CryptoKey,
  iv: Uint8Array,
  ct: ArrayBuffer | Uint8Array,
  aad?: Uint8Array
): Promise<ArrayBuffer> {
  const params: AesGcmParams = { name: "AES-GCM", iv: iv as BufferSource };
  if (aad) params.additionalData = aad as BufferSource;
  return crypto.subtle.decrypt(params, key, ct as BufferSource);
}

export async function importAesKey(
  raw: ArrayBuffer | Uint8Array,
  extractable: boolean,
  usages: KeyUsage[] = ["encrypt", "decrypt"]
): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, extractable, usages);
}

/** PBKDF2-SHA256 → AES-256-GCM key (non-extractable). */
export async function deriveAesKeyFromPassword(
  password: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey(
    "raw",
    utf8(password) as BufferSource,
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

/** Constant-shape JSON stringifier: sorted object keys, stable output. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(",")}}`;
}

/** Overwrite a key buffer in place (best-effort memory hygiene). */
export function zeroize(bytes: Uint8Array): void {
  bytes.fill(0);
}

export function formatFingerprint(fp: string): string {
  // fp is base32 without dashes; display as FG-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX-XXXXX
  const clean = fp.replace(/[^0-9A-Z]/gi, "").toUpperCase();
  const groups = clean.match(/.{1,5}/g) ?? [];
  return `FG-${groups.join("-")}`;
}

export function compactFingerprint(fp: string): string {
  const clean = fp.replace(/[^0-9A-Z]/gi, "").toUpperCase();
  return `FG·${clean.slice(0, 5)}…${clean.slice(-5)}`;
}
