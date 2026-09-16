/**
 * FAST GUNS — EncryptedStorage.
 *
 * IndexedDB is treated as UNTRUSTED local storage. Every sensitive value
 * is serialized, then encrypted with the vault's non-extractable DEK
 * (AES-256-GCM) BEFORE it is written. The record key + store name are
 * bound as additional authenticated data, so records cannot be swapped
 * between slots.
 *
 * Nothing in the database can be read without an unlocked vault:
 *   - message plaintext, contact names, filenames → ciphertext
 *   - private identity keys → ciphertext (inside the vault envelope)
 *   - the only plaintext row is the wrapped-DEK vault envelope itself,
 *     which is useless without the password.
 *
 * Attachment binaries are stored as ciphertext produced with a per-file
 * random key; that key lives only inside DEK-encrypted message records.
 */

import type { SecureEnvelope } from "@/types";
import { aesGcmDecrypt, aesGcmEncrypt, fromBase64, fromUtf8, toBase64, utf8 } from "@/crypto/primitives";

const DB_NAME = "fastguns-vault";
const DB_VERSION = 1;

export type StoreName =
  | "meta" // plaintext envelope records only (wrapped DEK) — no secrets
  | "kv"
  | "contacts"
  | "conversations"
  | "messages"
  | "attachments"
  | "log";

const ENCRYPTED_STORES: readonly StoreName[] = [
  "kv",
  "contacts",
  "conversations",
  "messages",
  "log",
];

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB unavailable"));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of ["meta", "kv", "contacts", "conversations", "messages", "attachments", "log"] as const) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
  return dbPromise;
}

function tx(db: IDBDatabase, store: StoreName, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(store, mode).objectStore(store);
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("IndexedDB request failed"));
  });
}

export class EncryptedStorage {
  private constructor(private readonly dek: CryptoKey) {}

  static async create(dek: CryptoKey): Promise<EncryptedStorage> {
    // ensure schema exists before use
    await openDb();
    return new EncryptedStorage(dek);
  }

  private aad(store: StoreName, id: string): Uint8Array {
    return utf8(`fastguns-store-v1|${store}|${id}`);
  }

  async put<T>(store: StoreName, id: string, value: T): Promise<void> {
    if (!ENCRYPTED_STORES.includes(store)) {
      throw new Error(`store ${store} is not encryptable`);
    }
    const { iv, ct } = await aesGcmEncrypt(
      this.dek,
      utf8(JSON.stringify(value)),
      this.aad(store, id)
    );
    const envelope: SecureEnvelope = { iv: toBase64(iv), ct: toBase64(ct) };
    const db = await openDb();
    await requestToPromise(tx(db, store, "readwrite").put(envelope, id));
  }

  async get<T>(store: StoreName, id: string): Promise<T | null> {
    if (!ENCRYPTED_STORES.includes(store)) {
      throw new Error(`store ${store} is not encryptable`);
    }
    const db = await openDb();
    const envelope = await requestToPromise<SecureEnvelope | undefined>(
      tx(db, store, "readonly").get(id)
    );
    if (!envelope) return null;
    const plain = await aesGcmDecrypt(
      this.dek,
      fromBase64(envelope.iv),
      fromBase64(envelope.ct),
      this.aad(store, id)
    );
    return JSON.parse(fromUtf8(plain)) as T;
  }

  async delete(store: StoreName, id: string): Promise<void> {
    const db = await openDb();
    await requestToPromise(tx(db, store, "readwrite").delete(id));
  }

  async list<T>(store: StoreName): Promise<T[]> {
    if (!ENCRYPTED_STORES.includes(store)) {
      throw new Error(`store ${store} is not encryptable`);
    }
    const db = await openDb();
    const raw = await requestToPromise<IDBValidKey[]>(tx(db, store, "readonly").getAllKeys());
    const out: T[] = [];
    for (const key of raw) {
      const value = await this.get<T>(store, String(key));
      if (value !== null) out.push(value);
    }
    return out;
  }

  async listKeys(store: StoreName): Promise<string[]> {
    const db = await openDb();
    const raw = await requestToPromise<IDBValidKey[]>(tx(db, store, "readonly").getAllKeys());
    return raw.map(String);
  }

  /**
   * List records whose key starts with `prefix` (used for per-conversation
   * message ranges). Returns newest last.
   */
  async listByPrefix<T>(store: StoreName, prefix: string, limit = Infinity, newestFirst = false): Promise<T[]> {
    const db = await openDb();
    const keys = (await this.listKeys(store)).filter((k) => k.startsWith(prefix));
    keys.sort();
    if (newestFirst) keys.reverse();
    const sliced = keys.slice(0, Math.min(limit, keys.length));
    const out: T[] = [];
    for (const key of newestFirst ? sliced.reverse() : sliced) {
      const value = await this.get<T>(store, key);
      if (value !== null) out.push(value);
    }
    return out;
  }

  /** Attachments are stored as ciphertext produced by the file crypto. */
  async putAttachment(id: string, ciphertext: Uint8Array): Promise<void> {
    const db = await openDb();
    await requestToPromise(tx(db, "attachments", "readwrite").put(ciphertext, id));
  }

  async getAttachment(id: string): Promise<Uint8Array | null> {
    const db = await openDb();
    const buf = await requestToPromise<ArrayBuffer | undefined>(
      tx(db, "attachments", "readonly").get(id)
    );
    return buf ? new Uint8Array(buf) : null;
  }

  async deleteAttachment(id: string): Promise<void> {
    const db = await openDb();
    await requestToPromise(tx(db, "attachments", "readwrite").delete(id));
  }

  async clear(store: StoreName): Promise<void> {
    const db = await openDb();
    await requestToPromise(tx(db, store, "readwrite").clear());
  }
}

/** Delete the entire local database (destructive wipe). */
export async function deleteDatabase(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  dbPromise = null;
  await new Promise<void>((resolve) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
    req.onblocked = () => resolve();
  });
}

export async function countRecords(store: StoreName): Promise<number> {
  const db = await openDb();
  return requestToPromise(tx(db, store, "readonly").count());
}
