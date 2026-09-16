/**
 * FAST GUNS — raw access to the `meta` object store.
 *
 * The meta store holds ONLY non-secret envelope data required before the
 * vault is unlocked (the wrapped-DEK record). It contains no plaintext
 * keys, no messages, no contacts. Everything else in IndexedDB is
 * DEK-encrypted through EncryptedStorage.
 */

const DB_NAME = "fastguns-vault";
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of [
        "meta",
        "kv",
        "contacts",
        "conversations",
        "messages",
        "attachments",
        "log",
      ] as const) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store);
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IndexedDB open failed"));
  });
}

export async function openMetaRaw<T>(id: string): Promise<T | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("meta", "readonly").objectStore("meta").get(id);
    req.onsuccess = () => resolve((req.result as T) ?? null);
    req.onerror = () => reject(req.error ?? new Error("meta read failed"));
  });
}

export async function openMetaPut(id: string, value: unknown): Promise<void> {
  if (typeof indexedDB === "undefined") throw new Error("IndexedDB unavailable");
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction("meta", "readwrite").objectStore("meta").put(value, id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error ?? new Error("meta write failed"));
  });
}

export async function openMetaDelete(id: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  const db = await openDb();
  return new Promise((resolve) => {
    const req = db.transaction("meta", "readwrite").objectStore("meta").delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => resolve();
  });
}
