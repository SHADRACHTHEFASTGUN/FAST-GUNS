/**
 * FAST GUNS — local vault.
 *
 * The vault protects the local key hierarchy with a user password:
 *
 *   password ──PBKDF2-SHA256 (600k iterations, 32B salt)──▶ KEK
 *   random 32-byte DEK ──AES-256-GCM under KEK──▶ wrappedDek (persisted)
 *   DEK (non-extractable CryptoKey) ──▶ encrypts every IndexedDB record
 *
 * Properties:
 *   - The raw password is never stored anywhere.
 *   - The KEK is non-extractable and exists only transiently in memory.
 *   - The DEK is non-extractable after import; ciphertext+KEK is the only
 *     way to obtain it, so a wrong password simply fails GCM authentication.
 *   - Locking the vault drops all key material from memory. There is no
 *     plaintext copy on disk, so closing the browser locks the vault.
 *
 * Honest limitation: WebCrypto does not implement Argon2id. PBKDF2-SHA256
 * with a high iteration count is the strongest native option; it is
 * GPU/ASIC-weaker than Argon2id. This is stated in the threat model.
 */

import type { VaultRecord } from "@/types";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveAesKeyFromPassword,
  fromBase64,
  randomBytes,
  toBase64,
  zeroize,
} from "./primitives";

export const PBKDF2_ITERATIONS = 600_000;
const VAULT_AAD = "fastguns-vault-v1";

export async function createVaultRecord(
  password: string,
  onStage?: (stage: "kdf" | "seal") => Promise<void> | void
): Promise<VaultRecord> {
  const salt = randomBytes(32);
  await onStage?.("kdf");
  const kek = await deriveAesKeyFromPassword(password, salt, PBKDF2_ITERATIONS);
  const dekRaw = randomBytes(32);
  try {
    await onStage?.("seal");
    const { iv, ct } = await aesGcmEncrypt(kek, dekRaw, new TextEncoder().encode(VAULT_AAD));
    return {
      v: 1,
      kdf: "PBKDF2-SHA256",
      iterations: PBKDF2_ITERATIONS,
      salt: toBase64(salt),
      iv: toBase64(iv),
      wrappedDek: toBase64(ct),
      createdAt: Date.now(),
      lastUnlockAt: Date.now(),
    };
  } finally {
    zeroize(dekRaw);
  }
}

export interface UnlockedVault {
  /** non-extractable AES-256-GCM key for local storage encryption. */
  dek: CryptoKey;
  record: VaultRecord;
}

/** Attempt to unwrap the DEK. Returns null when the password is wrong. */
export async function unlockVaultRecord(
  password: string,
  record: VaultRecord
): Promise<UnlockedVault | null> {
  try {
    const salt = fromBase64(record.salt);
    const iv = fromBase64(record.iv);
    const ct = fromBase64(record.wrappedDek);
    const kek = await deriveAesKeyFromPassword(password, salt, record.iterations);
    const dekRaw = await aesGcmDecrypt(kek, iv, ct, new TextEncoder().encode(VAULT_AAD));
    const dekBytes = new Uint8Array(dekRaw);
    try {
      // non-extractable: UI can use it, but can never read the raw bits back
      const dek = await crypto.subtle.importKey(
        "raw",
        dekBytes as BufferSource,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
      );
      return { dek, record };
    } finally {
      zeroize(dekBytes);
    }
  } catch {
    // GCM authentication failure — wrong password or corrupted record.
    return null;
  }
}

export function withLastUnlock(record: VaultRecord): VaultRecord {
  return { ...record, lastUnlockAt: Date.now() };
}

export interface PasswordStrength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  issues: string[];
}

/** Honest client-side strength heuristic — never a guarantee of security. */
export function assessPasswordStrength(password: string): PasswordStrength {
  const issues: string[] = [];
  let score = 0;
  if (password.length >= 12) score += 2;
  else if (password.length >= 8) score += 1;
  else issues.push("Use at least 12 characters");
  if (password.length >= 16) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  else issues.push("Mix upper and lower case");
  if (/\d/.test(password)) score += 0.5;
  else issues.push("Add digits");
  if (/[^A-Za-z0-9]/.test(password)) score += 0.5;
  else issues.push("Add a symbol");
  if (/^(.)\1+$/.test(password)) {
    score = 0;
    issues.push("Avoid repeated characters");
  }
  if (password.length < 8) {
    score = 0;
  }
  const clamped = Math.min(4, Math.floor(score)) as 0 | 1 | 2 | 3 | 4;
  const labels = ["VERY WEAK", "WEAK", "FAIR", "STRONG", "STRONG"] as const;
  return { score: clamped, label: labels[clamped], issues: issues.slice(0, 3) };
}
