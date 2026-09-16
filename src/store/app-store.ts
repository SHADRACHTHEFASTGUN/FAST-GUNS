/**
 * FAST GUNS — application state.
 *
 * SECURITY NOTE: private keys, the vault DEK and the live peer session are
 * held ONLY in module-level references below. They are never placed into
 * zustand state (which can be observed by devtools) and never persisted.
 */

import { create } from "zustand";
import type {
  AppSettings,
  ChatMessage,
  ConnectionState,
  Contact,
  Conversation,
  Fingerprint,
  Identity,
  PublicIdentity,
  SecurityEvent,
  VaultRecord,
} from "@/types";
import { createIdentity, sanitizeName } from "@/crypto/identity";
import { createVaultRecord, unlockVaultRecord } from "@/crypto/vault";
import { createBackupFile, openBackupFile, parseBackupJson, downloadJsonFile } from "@/crypto/backup";
import { decryptFile } from "@/crypto/files";
import { randomUuid } from "@/crypto/primitives";
import * as vaultStore from "@/storage/vault-store";
import { DEFAULT_SETTINGS } from "@/storage/vault-store";
import { PeerSession, encodeInvite, decodeInvite } from "@/services/peer-session";
import type { FileMeta } from "@/crypto/files";

/* ------------------------------------------------------------------ */
/* module-private security material — never in React state             */
/* ------------------------------------------------------------------ */

interface PrivateRefs {
  dek: CryptoKey | null;
  identity: Identity | null;
  session: PeerSession | null;
}

const privateRefs: PrivateRefs = { dek: null, identity: null, session: null };

/** decrypted attachment object URLs for this session (never persisted) */
const urlRegistry = new Map<string, string>();

/* ------------------------------------------------------------------ */
/* view model                                                          */
/* ------------------------------------------------------------------ */

export type Tab = "chats" | "contacts" | "security" | "settings";

export type OverlayName =
  | "chat"
  | "contact-detail"
  | "verify"
  | "connect"
  | "backup"
  | "threat-model"
  | "about"
  | "security-log"
  | "identity";

export interface Overlay {
  name: OverlayName;
  contactId?: string;
}

export interface IdentityAlert {
  expectedFp: Fingerprint;
  actualFp: Fingerprint;
}

export interface AppState {
  phase: "boot" | "landing" | "onboarding" | "unlock" | "app";
  tab: Tab;
  overlay: Overlay | null;
  vaultStatus: "none" | "locked" | "unlocked";
  vaultMeta: { createdAt: number; lastUnlockAt: number; iterations: number } | null;
  identityPublic: PublicIdentity | null;
  contacts: Contact[];
  conversations: Conversation[];
  messages: Record<string, ChatMessage[]>;
  settings: AppSettings;
  securityLog: SecurityEvent[];
  connection: { state: ConnectionState; detail?: string; code?: string; role?: "initiator" | "responder" };
  activeContactId: string | null;
  identityAlert: IdentityAlert | null;
  storageUsage: { usage: number; quota: number; records: number } | null;

  /* actions */
  boot: () => Promise<void>;
  startOnboarding: () => void;
  cancelOnboarding: () => void;
  createIdentityAndVault: (name: string, password: string) => Promise<void>;
  unlockVault: (password: string) => Promise<boolean>;
  lockVault: () => void;
  setTab: (tab: Tab) => void;
  openOverlay: (overlay: Overlay) => void;
  closeOverlay: () => void;
  openChatWithContact: (contactId: string) => void;
  hostSession: () => Promise<void>;
  joinSession: (code: string, inviteString?: string) => Promise<void>;
  cancelSession: () => void;
  sendText: (text: string) => Promise<void>;
  sendAttachment: (file: File | Blob, name: string, kind: "image" | "file" | "voice") => Promise<void>;
  markContactVerified: (contactId: string) => Promise<void>;
  renameContact: (contactId: string, name: string) => Promise<void>;
  deleteContact: (contactId: string) => Promise<void>;
  clearConversation: (contactId: string) => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => Promise<void>;
  exportBackup: (password: string) => Promise<void>;
  recoveryImport: (fileText: string, backupPassword: string, newVaultPassword: string) => Promise<void>;
  inAppImport: (fileText: string, backupPassword: string) => Promise<void>;
  wipeEverything: () => Promise<void>;
  dismissIdentityAlert: () => void;
  refreshStorageStats: () => Promise<void>;
  getAttachmentUrl: (message: ChatMessage) => Promise<string | null>;
  inviteString: () => string;
}

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

export function conversationIdForPair(fpA: Fingerprint, fpB: Fingerprint): string {
  const sorted = [fpA, fpB].sort();
  return `c_${sorted[0].slice(0, 16)}_${sorted[1].slice(0, 16)}`;
}

function requireIdentity(): Identity {
  if (!privateRefs.identity) throw new Error("vault-locked");
  return privateRefs.identity;
}

function publicOf(identity: Identity): PublicIdentity {
  return {
    idEcdhPub: identity.idEcdhPub,
    idEcdsaPub: identity.idEcdsaPub,
    fingerprint: identity.fingerprint,
    name: identity.name,
    createdAt: identity.createdAt,
  };
}

async function loadAllData(set: (partial: Partial<AppState>) => void): Promise<void> {
  const [contacts, conversations, settings, securityLog] = await Promise.all([
    vaultStore.listContacts(),
    vaultStore.listConversations(),
    vaultStore.loadSettings(),
    vaultStore.listSecurityEvents(),
  ]);
  const messages: Record<string, ChatMessage[]> = {};
  for (const convo of conversations) {
    const list = await vaultStore.listMessages(convo.id);
    messages[convo.id] = list.sort((a, b) => a.timestamp - b.timestamp);
  }
  set({
    contacts: contacts.sort((a, b) => a.name.localeCompare(b.name)),
    conversations: conversations.sort(
      (a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt)
    ),
    messages,
    settings,
    securityLog,
  });
}

/* ------------------------------------------------------------------ */
/* store                                                               */
/* ------------------------------------------------------------------ */

export const useAppStore = create<AppState>((set, get) => {
  /** attach all event wiring to a fresh PeerSession */
  const wireSession = (session: PeerSession): void => {
    session.setEvents({
      onState: (state, detail) => {
        set({ connection: { ...get().connection, state, detail } });
      },
      onSecure: ({ peerFp, peerName }) => {
        const peerKeys = privateRefs.session?.peerIdentity();
        const st = get();
        const selfFp = privateRefs.identity!.fingerprint;
        let contact = st.contacts.find((c) => c.fingerprint === peerFp) ?? null;
        const now = Date.now();
        if (!contact) {
          contact = {
            id: randomUuid(),
            name: peerName || "Unknown peer",
            fingerprint: peerFp,
            idEcdhPub: peerKeys?.idEcdhPub ?? ({} as JsonWebKey),
            idEcdsaPub: peerKeys?.idEcdsaPub ?? ({} as JsonWebKey),
            verified: false,
            verifiedAt: null,
            addedFingerprint: peerFp,
            createdAt: now,
            lastConnectedAt: now,
          };
          void vaultStore.putContact(contact);
          void vaultStore.appendSecurityEvent(
            "contact-added",
            `Contact added: ${peerFp.slice(0, 10)}…`
          );
        } else {
          const updated = { ...contact, lastConnectedAt: now };
          void vaultStore.putContact(updated);
          contact = updated;
        }
        void vaultStore.appendSecurityEvent(
          "connection-established",
          `Secure channel with ${peerFp.slice(0, 10)}… established.`
        );
        const convoId = conversationIdForPair(selfFp, peerFp);
        let conversation = st.conversations.find((c) => c.id === convoId) ?? null;
        if (!conversation) {
          conversation = {
            id: convoId,
            contactId: contact.id,
            contactFp: peerFp,
            createdAt: now,
            lastMessageAt: null,
            unread: 0,
          };
          void vaultStore.putConversation(conversation);
        }
        const sysMsg: ChatMessage = {
          id: randomUuid(),
          conversationId: convoId,
          senderFp: peerFp,
          kind: "system",
          systemCode: "channel-secured",
          timestamp: Date.now(),
          delivered: true,
          direction: "incoming",
        };
        void vaultStore.appendMessage(sysMsg);
        const contacts = st.contacts.some((c) => c.id === contact!.id)
          ? st.contacts.map((c) => (c.id === contact!.id ? contact! : c))
          : [...st.contacts, contact];
        const conversations = st.conversations.some((c) => c.id === convoId)
          ? st.conversations
          : [...st.conversations, conversation];
        set({
          contacts,
          conversations,
          activeContactId: contact.id,
          overlay: { name: "chat", contactId: contact.id },
          messages: {
            ...st.messages,
            [convoId]: [...(st.messages[convoId] ?? []), sysMsg],
          },
        });
      },
      onIncoming: (message: ChatMessage) => {
        const st = get();
        void vaultStore.appendMessage(message);
        const contact = st.contacts.find((c) => c.fingerprint === message.senderFp);
        const convo = contact
          ? st.conversations.find((c) => c.contactFp === message.senderFp)
          : null;
        if (convo) {
          const isOpen =
            st.overlay?.name === "chat" &&
            st.activeContactId === contact?.id &&
            typeof document !== "undefined" &&
            document.visibilityState === "visible";
          const updated: Conversation = {
            ...convo,
            lastMessageAt: message.timestamp,
            unread: isOpen ? 0 : convo.unread + 1,
          };
          void vaultStore.putConversation(updated);
          set({
            conversations: st.conversations.map((c) => (c.id === convo.id ? updated : c)),
            messages: {
              ...st.messages,
              [convo.id]: [...(st.messages[convo.id] ?? []), message],
            },
          });
        }
      },
      onDeliveryAck: (messageId: string) => {
        const st = get();
        for (const [convoId, list] of Object.entries(st.messages)) {
          const idx = list.findIndex((m) => m.id === messageId && !m.delivered);
          if (idx >= 0) {
            const updated = [...list];
            updated[idx] = { ...updated[idx], delivered: true };
            void vaultStore.updateMessage(updated[idx], updated[idx].timestamp);
            set({ messages: { ...st.messages, [convoId]: updated } });
            return;
          }
        }
      },
      onClosed: () => {
        if (privateRefs.session === null) return;
        set({ connection: { ...get().connection, state: "disconnected" } });
      },
    });

    session.onIdentityMismatch = (actualFp) => {
      const expected = session.expectedFingerprint();
      if (expected) {
        set({ identityAlert: { expectedFp: expected, actualFp } });
        void vaultStore.appendSecurityEvent(
          "identity-changed",
          `SECURITY ALERT: identity key changed for ${expected.slice(0, 10)}…`
        );
        const st = get();
        const contact = st.contacts.find((c) => c.fingerprint === expected);
        if (contact) {
          const convoId = conversationIdForPair(privateRefs.identity!.fingerprint, expected);
          const msg: ChatMessage = {
            id: randomUuid(),
            conversationId: convoId,
            senderFp: expected,
            kind: "system",
            systemCode: "identity-changed",
            timestamp: Date.now(),
            delivered: true,
            direction: "incoming",
          };
          void vaultStore.appendMessage(msg);
          set({
            messages: { ...st.messages, [convoId]: [...(st.messages[convoId] ?? []), msg] },
          });
        }
      }
    };

    session.onIncomingAttachment = (meta: FileMeta, ciphertext: Uint8Array, blob: Blob) => {
      void vaultStore.putAttachmentBlob(meta.id, ciphertext);
      const existing = urlRegistry.get(meta.id);
      if (existing) URL.revokeObjectURL(existing);
      urlRegistry.set(meta.id, URL.createObjectURL(blob));
      set({});
    };
  };

  return {
    phase: "boot",
    tab: "chats",
    overlay: null,
    vaultStatus: "none",
    vaultMeta: null,
    identityPublic: null,
    contacts: [],
    conversations: [],
    messages: {},
    settings: DEFAULT_SETTINGS,
    securityLog: [],
    connection: { state: "offline" },
    activeContactId: null,
    identityAlert: null,
    storageUsage: null,

    /* ---------------- boot / vault lifecycle ---------------- */

    boot: async () => {
      const record = await vaultStore.loadVaultRecord();
      if (record) {
        set({
          phase: "unlock",
          vaultStatus: "locked",
          vaultMeta: {
            createdAt: record.createdAt,
            lastUnlockAt: record.lastUnlockAt,
            iterations: record.iterations,
          },
        });
      } else {
        set({ phase: "landing", vaultStatus: "none" });
      }
    },

    startOnboarding: () => set({ phase: "onboarding" }),
    cancelOnboarding: () => set({ phase: "landing" }),

    createIdentityAndVault: async (rawName, password) => {
      const name = sanitizeName(rawName) || "Anonymous";
      const identity = await createIdentity(name);
      const record = await createVaultRecord(password);
      const unlocked = await unlockVaultRecord(password, record);
      if (!unlocked) throw new Error("vault-create-failed");
      privateRefs.dek = unlocked.dek;
      privateRefs.identity = identity;
      await vaultStore.initStorage(unlocked.dek);
      await vaultStore.saveIdentity(identity);
      await vaultStore.saveVaultRecord(record);
      const settings = { ...DEFAULT_SETTINGS, displayName: name };
      await vaultStore.saveSettings(settings);
      await vaultStore.appendSecurityEvent("vault-created", "Encrypted vault created on this device.");
      await vaultStore.appendSecurityEvent("identity-created", `Identity created: ${identity.fingerprint.slice(0, 10)}…`);
      set({
        phase: "app",
        vaultStatus: "unlocked",
        vaultMeta: {
          createdAt: record.createdAt,
          lastUnlockAt: record.lastUnlockAt,
          iterations: record.iterations,
        },
        identityPublic: publicOf(identity),
        settings,
        tab: "chats",
        // onboarding step 3: land on the encrypted backup screen first
        overlay: { name: "backup" },
      });
      await loadAllData(set);
    },

    unlockVault: async (password) => {
      const record = await vaultStore.loadVaultRecord();
      if (!record) {
        set({ phase: "landing", vaultStatus: "none" });
        return false;
      }
      const unlocked = await unlockVaultRecord(password, record);
      if (!unlocked) return false;
      privateRefs.dek = unlocked.dek;
      await vaultStore.initStorage(unlocked.dek);
      const identity = await vaultStore.loadIdentity();
      if (!identity) {
        privateRefs.dek = null;
        return false;
      }
      privateRefs.identity = identity;
      const updatedRecord = { ...record, lastUnlockAt: Date.now() };
      await vaultStore.saveVaultRecord(updatedRecord);
      await vaultStore.appendSecurityEvent("vault-unlocked", "Vault unlocked.");
      set({
        phase: "app",
        vaultStatus: "unlocked",
        vaultMeta: {
          createdAt: updatedRecord.createdAt,
          lastUnlockAt: updatedRecord.lastUnlockAt,
          iterations: updatedRecord.iterations,
        },
        identityPublic: publicOf(identity),
        overlay: null,
        activeContactId: null,
        connection: { state: "offline" },
        identityAlert: null,
      });
      await loadAllData(set);
      return true;
    },

    lockVault: () => {
      void vaultStore.appendSecurityEvent("vault-locked", "Vault locked — keys cleared from memory.");
      privateRefs.session?.close();
      privateRefs.session = null;
      privateRefs.dek = null;
      privateRefs.identity = null;
      for (const url of urlRegistry.values()) URL.revokeObjectURL(url);
      urlRegistry.clear();
      set({
        phase: "unlock",
        vaultStatus: "locked",
        identityPublic: null,
        contacts: [],
        conversations: [],
        messages: {},
        securityLog: [],
        overlay: null,
        activeContactId: null,
        connection: { state: "offline" },
        identityAlert: null,
      });
    },

    /* ---------------- navigation ---------------- */

    setTab: (tab) => set({ tab, overlay: null }),
    openOverlay: (overlay) => set({ overlay }),
    closeOverlay: () => set({ overlay: null }),

    openChatWithContact: (contactId) => {
      const contact = get().contacts.find((c) => c.id === contactId);
      if (!contact) return;
      const selfFp = privateRefs.identity!.fingerprint;
      const convoId = conversationIdForPair(selfFp, contact.fingerprint);
      const convo = get().conversations.find((c) => c.id === convoId);
      if (convo && convo.unread !== 0) {
        const updated = { ...convo, unread: 0 };
        void vaultStore.putConversation(updated);
        set({
          conversations: get().conversations.map((c) => (c.id === convoId ? updated : c)),
        });
      }
      set({ activeContactId: contactId, overlay: { name: "chat", contactId } });
    },

    /* ---------------- peer sessions ---------------- */

    hostSession: async () => {
      const identity = requireIdentity();
      get().cancelSession();
      const session = new PeerSession(identity, {
        onState: () => undefined,
        onSecure: () => undefined,
        onIncoming: () => undefined,
        onDeliveryAck: () => undefined,
        onClosed: () => undefined,
      });
      privateRefs.session = session;
      wireSession(session);
      try {
        const code = await session.host(null);
        set({ connection: { state: "discovering-peer", code, role: "initiator" } });
      } catch {
        privateRefs.session = null;
        set({ connection: { state: "error", detail: "Signaling service unreachable." } });
      }
    },

    joinSession: async (code, inviteString) => {
      const identity = requireIdentity();
      get().cancelSession();
      const invite = inviteString ? decodeInvite(inviteString) : null;
      const session = new PeerSession(identity, {
        onState: () => undefined,
        onSecure: () => undefined,
        onIncoming: () => undefined,
        onDeliveryAck: () => undefined,
        onClosed: () => undefined,
      });
      privateRefs.session = session;
      wireSession(session);
      try {
        await session.join(code, invite?.fp ?? null, invite?.fp ?? null);
        set({ connection: { state: "discovering-peer", code, role: "responder" } });
      } catch (err) {
        privateRefs.session = null;
        const message = err instanceof Error ? err.message : "join-failed";
        set({
          connection: {
            state: "error",
            detail:
              message === "not-found"
                ? "No session found for that code. It may have expired."
                : message === "channel-full"
                  ? "That session already has two peers."
                  : message === "own-channel"
                    ? "That is your own invite code."
                    : "Signaling service unreachable.",
          },
        });
      }
    },

    cancelSession: () => {
      privateRefs.session?.close();
      privateRefs.session = null;
      set({ connection: { state: "offline" }, activeContactId: null });
    },

    /* ---------------- messaging ---------------- */

    sendText: async (text) => {
      const session = privateRefs.session;
      if (!session || !session.isSecure) {
        throw new Error("no-secure-channel");
      }
      const message = await session.sendText(text);
      if (!message) throw new Error("send-failed");
      const st = get();
      const convo = st.conversations.find((c) => c.id === message.conversationId);
      if (convo) {
        const updated = { ...convo, lastMessageAt: message.timestamp };
        void vaultStore.putConversation(updated);
        set({
          conversations: st.conversations.map((c) => (c.id === convo.id ? updated : c)),
          messages: {
            ...st.messages,
            [convo.id]: [...(st.messages[convo.id] ?? []), message],
          },
        });
      }
      void vaultStore.appendMessage(message);
    },

    sendAttachment: async (file, name, kind) => {
      const session = privateRefs.session;
      if (!session || !session.isSecure) {
        throw new Error("no-secure-channel");
      }
      const message = await session.sendAttachment(file, name, kind);
      if (!message) throw new Error("send-failed");
      if (message.attachment) {
        const ciphertext = session.consumeSentCiphertext(message.attachment.id);
        if (ciphertext) {
          void vaultStore.putAttachmentBlob(message.attachment.id, ciphertext);
        }
      }
      const st = get();
      const convo = st.conversations.find((c) => c.id === message.conversationId);
      if (convo) {
        const updated = { ...convo, lastMessageAt: message.timestamp };
        void vaultStore.putConversation(updated);
        set({
          conversations: st.conversations.map((c) => (c.id === convo.id ? updated : c)),
          messages: {
            ...st.messages,
            [convo.id]: [...(st.messages[convo.id] ?? []), message],
          },
        });
      }
      void vaultStore.appendMessage(message);
    },

    /* ---------------- contacts ---------------- */

    markContactVerified: async (contactId) => {
      const st = get();
      const contact = st.contacts.find((c) => c.id === contactId);
      if (!contact) return;
      const updated: Contact = { ...contact, verified: true, verifiedAt: Date.now() };
      await vaultStore.putContact(updated);
      await vaultStore.appendSecurityEvent(
        "identity-verified",
        `Identity verified: ${contact.fingerprint.slice(0, 10)}…`
      );
      set({ contacts: st.contacts.map((c) => (c.id === contactId ? updated : c)) });
    },

    renameContact: async (contactId, name) => {
      const st = get();
      const contact = st.contacts.find((c) => c.id === contactId);
      if (!contact) return;
      const updated = { ...contact, name: sanitizeName(name) || contact.name };
      await vaultStore.putContact(updated);
      set({ contacts: st.contacts.map((c) => (c.id === contactId ? updated : c)) });
    },

    deleteContact: async (contactId) => {
      const st = get();
      const contact = st.contacts.find((c) => c.id === contactId);
      if (!contact || !privateRefs.identity) return;
      await vaultStore.deleteContact(contactId);
      const convoId = conversationIdForPair(privateRefs.identity.fingerprint, contact.fingerprint);
      await vaultStore.deleteConversation(convoId);
      await vaultStore.appendSecurityEvent(
        "contact-deleted",
        `Contact deleted: ${contact.fingerprint.slice(0, 10)}…`
      );
      set({
        contacts: st.contacts.filter((c) => c.id !== contactId),
        conversations: st.conversations.filter((c) => c.id !== convoId),
        messages: Object.fromEntries(Object.entries(st.messages).filter(([k]) => k !== convoId)),
        overlay: null,
        activeContactId: st.activeContactId === contactId ? null : st.activeContactId,
      });
    },

    clearConversation: async (contactId) => {
      const st = get();
      const contact = st.contacts.find((c) => c.id === contactId);
      if (!contact || !privateRefs.identity) return;
      const convoId = conversationIdForPair(privateRefs.identity.fingerprint, contact.fingerprint);
      await vaultStore.deleteConversation(convoId);
      await vaultStore.appendSecurityEvent(
        "conversation-deleted",
        `Local conversation cleared: ${contact.fingerprint.slice(0, 10)}…`
      );
      set({
        conversations: st.conversations.map((c) =>
          c.id === convoId ? { ...c, lastMessageAt: null, unread: 0 } : c
        ),
        messages: { ...st.messages, [convoId]: [] },
      });
    },

    /* ---------------- settings / backup ---------------- */

    updateSettings: async (partial) => {
      const next = { ...get().settings, ...partial };
      await vaultStore.saveSettings(next);
      await vaultStore.appendSecurityEvent("settings-changed", "Security settings updated.");
      set({ settings: next });
    },

    exportBackup: async (password) => {
      const identity = requireIdentity();
      const payload = {
        identity,
        contacts: await vaultStore.listContacts(),
        conversations: await vaultStore.listConversations(),
        messages: await vaultStore.allMessages(),
        settings: get().settings,
        securityLog: await vaultStore.listSecurityEvents(),
        exportedAt: Date.now(),
      };
      const backup = await createBackupFile(payload, password);
      const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      downloadJsonFile(`fastguns-backup-${date}.fastguns.json`, backup);
      await vaultStore.appendSecurityEvent("backup-exported", "Encrypted backup exported to a local file.");
      set({ securityLog: await vaultStore.listSecurityEvents() });
    },

    recoveryImport: async (fileText, backupPassword, newVaultPassword) => {
      const backupFile = parseBackupJson(fileText);
      const payload = await openBackupFile(backupFile, backupPassword);
      const record = await createVaultRecord(newVaultPassword);
      const unlocked = await unlockVaultRecord(newVaultPassword, record);
      if (!unlocked) throw new Error("vault-create-failed");
      await vaultStore.wipeAllLocalData();
      privateRefs.dek = unlocked.dek;
      privateRefs.identity = payload.identity;
      await vaultStore.initStorage(unlocked.dek);
      await vaultStore.saveVaultRecord(record);
      await vaultStore.saveIdentity(payload.identity);
      await vaultStore.saveSettings(payload.settings ?? DEFAULT_SETTINGS);
      for (const contact of payload.contacts ?? []) await vaultStore.putContact(contact);
      for (const convo of payload.conversations ?? []) await vaultStore.putConversation(convo);
      for (const message of payload.messages ?? []) await vaultStore.appendMessage(message);
      await vaultStore.appendSecurityEvent("backup-imported", "Encrypted backup imported and restored.");
      set({
        phase: "app",
        vaultStatus: "unlocked",
        vaultMeta: {
          createdAt: record.createdAt,
          lastUnlockAt: record.lastUnlockAt,
          iterations: record.iterations,
        },
        identityPublic: publicOf(payload.identity),
        settings: payload.settings ?? DEFAULT_SETTINGS,
        overlay: null,
      });
      await loadAllData(set);
    },

    inAppImport: async (fileText, backupPassword) => {
      const backupFile = parseBackupJson(fileText);
      const payload = await openBackupFile(backupFile, backupPassword);
      const record = await vaultStore.loadVaultRecord();
      if (!record) throw new Error("vault-locked");
      await vaultStore.wipeAllLocalData();
      await vaultStore.initStorage(privateRefs.dek!);
      await vaultStore.saveVaultRecord(record);
      await vaultStore.saveIdentity(payload.identity);
      privateRefs.identity = payload.identity;
      await vaultStore.saveSettings(payload.settings ?? DEFAULT_SETTINGS);
      for (const contact of payload.contacts ?? []) await vaultStore.putContact(contact);
      for (const convo of payload.conversations ?? []) await vaultStore.putConversation(convo);
      for (const message of payload.messages ?? []) await vaultStore.appendMessage(message);
      await vaultStore.appendSecurityEvent("backup-imported", "Encrypted backup imported; local data replaced.");
      set({
        identityPublic: publicOf(payload.identity),
        settings: payload.settings ?? DEFAULT_SETTINGS,
      });
      await loadAllData(set);
    },

    wipeEverything: async () => {
      privateRefs.session?.close();
      privateRefs.session = null;
      privateRefs.dek = null;
      privateRefs.identity = null;
      for (const url of urlRegistry.values()) URL.revokeObjectURL(url);
      urlRegistry.clear();
      await vaultStore.wipeAllLocalData();
      set({
        phase: "landing",
        vaultStatus: "none",
        vaultMeta: null,
        identityPublic: null,
        contacts: [],
        conversations: [],
        messages: {},
        securityLog: [],
        overlay: null,
        activeContactId: null,
        connection: { state: "offline" },
        identityAlert: null,
      });
    },

    dismissIdentityAlert: () => set({ identityAlert: null }),

    refreshStorageStats: async () => {
      try {
        const stats = await vaultStore.storageStats();
        set({ storageUsage: stats });
      } catch {
        set({ storageUsage: null });
      }
    },

    getAttachmentUrl: async (message) => {
      if (!message.attachment || !message.fileKeyB64 || !message.fileIvB64) return null;
      const cached = urlRegistry.get(message.attachment.id);
      if (cached) return cached;
      const ciphertext = await vaultStore.getAttachmentBlob(message.attachment.id);
      if (!ciphertext) return null;
      const blob = await decryptFile(ciphertext, message.fileKeyB64, message.fileIvB64);
      const url = URL.createObjectURL(blob);
      urlRegistry.set(message.attachment.id, url);
      return url;
    },

    inviteString: () => {
      const identity = privateRefs.identity;
      const code = get().connection.code;
      if (!identity || !code) return "";
      return encodeInvite({
        v: 1,
        app: "fastguns",
        code,
        fp: identity.fingerprint,
        name: identity.name,
      });
    },
  };
});

export type { VaultRecord };
