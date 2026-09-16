/**
 * FAST GUNS — attachment encryption.
 *
 * Files are read locally, encrypted in memory with a random per-file
 * AES-256-GCM key, and only the ciphertext is chunked over the
 * DataChannel. The per-file key travels ONLY inside a session-key
 * encrypted metadata frame. Plaintext file bytes never touch the network.
 */

import { aesGcmDecrypt, aesGcmEncrypt, importAesKey, randomBytes, randomUuid, toBase64, fromBase64 } from "./primitives";

export const CHUNK_SIZE = 16 * 1024; // 16 KiB chunks for DataChannel
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // honest 25 MB limit

export interface EncryptedFile {
  id: string;
  /** full ciphertext (file encrypted under its own random key) */
  data: Uint8Array;
  keyB64: string;
  ivB64: string;
  chunkCount: number;
}

export interface FileMeta {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: "image" | "file" | "voice";
  keyB64: string;
  ivB64: string;
  chunkCount: number;
}

export async function encryptFile(
  file: File | Blob,
  name: string,
  kind: FileMeta["kind"]
): Promise<EncryptedFile> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength > MAX_ATTACHMENT_BYTES) {
    throw new Error("attachment-too-large");
  }
  const rawKey = randomBytes(32);
  try {
    const key = await importAesKey(rawKey, false, ["encrypt", "decrypt"]);
    const { iv, ct } = await aesGcmEncrypt(key, bytes);
    const chunkCount = Math.max(1, Math.ceil(ct.byteLength / CHUNK_SIZE));
    return {
      id: randomUuid(),
      data: new Uint8Array(ct),
      keyB64: toBase64(rawKey),
      ivB64: toBase64(iv),
      chunkCount,
    };
  } finally {
    // best-effort cleanup of the key material copy
    rawKey.fill(0);
  }
}

export async function decryptFile(
  data: Uint8Array,
  keyB64: string,
  ivB64: string
): Promise<Blob> {
  const rawKey = fromBase64(keyB64);
  const key = await importAesKey(rawKey, false, ["encrypt", "decrypt"]);
  const plain = await aesGcmDecrypt(key, fromBase64(ivB64), data);
  return new Blob([plain]);
}

export function sliceChunks(data: Uint8Array, chunkSize = CHUNK_SIZE): Uint8Array[] {
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < data.byteLength; offset += chunkSize) {
    chunks.push(data.subarray(offset, offset + chunkSize));
  }
  return chunks.length ? chunks : [new Uint8Array(0)];
}
