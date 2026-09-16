/**
 * FAST GUNS — high-level vault persistence API.
 * The UI never touches raw IndexedDB records — only this module does.
 */

import type {
  AppSettings,
  ChatMessage,
  Contact,
  Conversation,
  Identity,
  SecurityEvent,
  SecurityEventKind,
  VaultRecord,
} from "@/types";
import { randomUuid } from "@/crypto/primitives";
import {
  EncryptedStorage,
  countRecords,
  deleteDatabase,
} from "./encrypted-store";

const KV_IDENTITY = "identity";
const KV_SETTINGS = "settings";
const LOG_LIMIT = 500;

export const DEFAULT_SETTINGS: AppSettings = {
  autoLockMinutes: 5,
  lockOnHide: true,
  displayName: "",
};

let storage: EncryptedStorage | null = null;

export function hasStorage(): boolean {
  return storage !== null;
}

export async function initStorage(dek: CryptoKey): Promise<EncryptedStorage> {
  storage = await EncryptedStorage.create(dek);
  return storage;
}

export function getStorage(): EncryptedStorage {
  if (!storage) throw new Error("vault-locked");
  return storage;
}

/* ------------------------------------------------------------------ */
/* vault envelope (plaintext store — contains only wrapped key data)   */
/* ------------------------------------------------------------------ */

export async function loadVaultRecord(): Promise<VaultRecord | null> {
  const { openMetaRaw } = await import("./meta-raw");
  return openMetaRaw<VaultRecord>("vault");
}

export async function saveVaultRecord(record: VaultRecord): Promise<void> {
  const { openMetaPut } = await import("./meta-raw");
  await openMetaPut("vault", record);
}

/* ------------------------------------------------------------------ */
/* identity                                                            */
/* ------------------------------------------------------------------ */

export async function saveIdentity(identity: Identity): Promise<void> {
  await getStorage().put("kv", KV_IDENTITY, identity);
}

export async function loadIdentity(): Promise<Identity | null> {
  return getStorage().get<Identity>("kv", KV_IDENTITY);
}

/* ------------------------------------------------------------------ */
/* settings                                                            */
/* ------------------------------------------------------------------ */

export async function saveSettings(settings: AppSettings): Promise<void> {
  await getStorage().put("kv", KV_SETTINGS, settings);
}

export async function loadSettings(): Promise<AppSettings> {
  const stored = await getStorage().get<AppSettings>("kv", KV_SETTINGS);
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

/* ------------------------------------------------------------------ */
/* contacts                                                            */
/* ------------------------------------------------------------------ */

export async function putContact(contact: Contact): Promise<void> {
  await getStorage().put("contacts", contact.id, contact);
}

export async function listContacts(): Promise<Contact[]> {
  return getStorage().list<Contact>("contacts");
}

export async function deleteContact(id: string): Promise<void> {
  await getStorage().delete("contacts", id);
}

/* ------------------------------------------------------------------ */
/* conversations                                                       */
/* ------------------------------------------------------------------ */

export async function putConversation(convo: Conversation): Promise<void> {
  await getStorage().put("conversations", convo.id, convo);
}

export async function listConversations(): Promise<Conversation[]> {
  return getStorage().list<Conversation>("conversations");
}

export async function deleteConversation(id: string): Promise<void> {
  await getStorage().delete("conversations", id);
  const storage = getStorage();
  const keys = await storage.listKeys("messages");
  const doomed = keys.filter((k) => k.startsWith(`${id}:`));
  for (const key of doomed) {
    await storage.delete("messages", key);
  }
}

/* ------------------------------------------------------------------ */
/* messages                                                            */
/* ------------------------------------------------------------------ */

export function messageKey(conversationId: string, timestamp: number): string {
  return `${conversationId}:${timestamp.toString(36).padStart(12, "0")}:${randomUuid()}`;
}

export async function appendMessage(message: ChatMessage): Promise<void> {
  await getStorage().put("messages", messageKey(message.conversationId, message.timestamp), message);
}

export async function listMessages(conversationId: string, limit = 300): Promise<ChatMessage[]> {
  return getStorage().listByPrefix<ChatMessage>("messages", `${conversationId}:`, limit, true);
}

export async function deleteMessageRecord(message: ChatMessage): Promise<void> {
  const storage = getStorage();
  const keys = await storage.listKeys("messages");
  // find by unique id scan (ids are random uuids; bounded by per-convo keys)
  for (const key of keys.filter((k) => k.startsWith(`${message.conversationId}:`))) {
    const rec = await storage.get<ChatMessage>("messages", key);
    if (rec && rec.id === message.id) {
      await storage.delete("messages", key);
      if (rec.attachment) await storage.deleteAttachment(rec.attachment.id);
      return;
    }
  }
}

export async function updateMessage(message: ChatMessage, keyHintTimestamp: number): Promise<void> {
  // messages are immutable except delivered/localUrl flags — rewrite in place
  const storage = getStorage();
  const keys = (await storage.listKeys("messages")).filter((k) =>
    k.startsWith(`${message.conversationId}:`)
  );
  for (const key of keys) {
    const rec = await storage.get<ChatMessage>("messages", key);
    if (rec && rec.id === message.id) {
      await storage.put("messages", key, message);
      return;
    }
  }
  void keyHintTimestamp;
}

export async function allMessages(): Promise<ChatMessage[]> {
  return getStorage().list<ChatMessage>("messages");
}

/* ------------------------------------------------------------------ */
/* attachments (ciphertext blobs)                                      */
/* ------------------------------------------------------------------ */

export async function putAttachmentBlob(id: string, ciphertext: Uint8Array): Promise<void> {
  await getStorage().putAttachment(id, ciphertext);
}

export async function getAttachmentBlob(id: string): Promise<Uint8Array | null> {
  return getStorage().getAttachment(id);
}

/* ------------------------------------------------------------------ */
/* security log (local-only, encrypted)                                */
/* ------------------------------------------------------------------ */

export async function appendSecurityEvent(kind: SecurityEventKind, detail: string): Promise<SecurityEvent> {
  const event: SecurityEvent = { id: randomUuid(), kind, at: Date.now(), detail };
  await getStorage().put("log", `${event.at.toString(36)}:${event.id}`, event);
  const keys = await getStorage().listKeys("log");
  if (keys.length > LOG_LIMIT) {
    keys.sort();
    for (const key of keys.slice(0, keys.length - LOG_LIMIT)) {
      await getStorage().delete("log", key);
    }
  }
  return event;
}

export async function listSecurityEvents(): Promise<SecurityEvent[]> {
  const events = await getStorage().list<SecurityEvent>("log");
  return events.sort((a, b) => b.at - a.at);
}

/* ------------------------------------------------------------------ */
/* storage stats + destructive wipe                                    */
/* ------------------------------------------------------------------ */

export async function storageStats(): Promise<{ usage: number; quota: number; records: number }> {
  let usage = 0;
  let quota = 0;
  if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
    const est = await navigator.storage.estimate();
    usage = est.usage ?? 0;
    quota = est.quota ?? 0;
  }
  let records = 0;
  for (const store of ["contacts", "conversations", "messages", "log"] as const) {
    records += await countRecords(store);
  }
  return { usage, quota, records };
}

/** Destructive: remove every local record. Used by DELETE ALL DATA. */
export async function wipeAllLocalData(): Promise<void> {
  storage = null;
  await deleteDatabase();
}
