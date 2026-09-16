/**
 * FAST GUNS — encrypted backup.
 *
 * A backup re-encrypts the user's identity (including private keys),
 * contacts, conversations and message ciphertexts under a SEPARATE
 * backup password with PBKDF2-SHA256 + AES-256-GCM.
 *
 * Backups are never uploaded anywhere — the user downloads a file and
 * is responsible for storing it. If the backup password AND the vault
 * password AND the device are all lost, the data is unrecoverable.
 * That is stated plainly in the UI and the threat model.
 */

import type { BackupPayload, EncryptedBackupFile } from "@/types";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  deriveAesKeyFromPassword,
  fromBase64,
  fromUtf8,
  randomBytes,
  toBase64,
  utf8,
} from "./primitives";

const BACKUP_AAD = "fastguns-backup-v1";
export const BACKUP_ITERATIONS = 600_000;

export async function createBackupFile(
  payload: BackupPayload,
  backupPassword: string
): Promise<EncryptedBackupFile> {
  const salt = randomBytes(32);
  const key = await deriveAesKeyFromPassword(backupPassword, salt, BACKUP_ITERATIONS);
  const { iv, ct } = await aesGcmEncrypt(key, utf8(JSON.stringify(payload)), utf8(BACKUP_AAD));
  return {
    v: 1,
    format: "fastguns-encrypted-backup",
    kdf: "PBKDF2-SHA256",
    iterations: BACKUP_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ct: toBase64(ct),
    createdAt: Date.now(),
  };
}

export async function openBackupFile(
  file: EncryptedBackupFile,
  backupPassword: string
): Promise<BackupPayload> {
  if (file.format !== "fastguns-encrypted-backup" || file.v !== 1) {
    throw new Error("not-a-fastguns-backup");
  }
  const key = await deriveAesKeyFromPassword(
    backupPassword,
    fromBase64(file.salt),
    file.iterations
  );
  const plain = await aesGcmDecrypt(
    key,
    fromBase64(file.iv),
    fromBase64(file.ct),
    utf8(BACKUP_AAD)
  );
  return JSON.parse(fromUtf8(plain)) as BackupPayload;
}

export function parseBackupJson(text: string): EncryptedBackupFile {
  const parsed: unknown = JSON.parse(text);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as EncryptedBackupFile).format !== "fastguns-encrypted-backup"
  ) {
    throw new Error("not-a-fastguns-backup");
  }
  return parsed as EncryptedBackupFile;
}

export function downloadJsonFile(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
