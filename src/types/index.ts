/**
 * FAST GUNS — core domain types.
 * Strict typing for all security-relevant structures.
 */

/** Base32 (Crockford) fingerprint, e.g. FG-AB12C-D3E45-F6GHI-JKLMN */
export type Fingerprint = string;

export type IdentityRole = "initiator" | "responder";

/** JSON Web Key (public or private part). */
export type Jwk = JsonWebKey;

/** Public identity information — safe to share / encode in QR. */
export interface PublicIdentity {
  /** ECDH P-256 public key (JWK) used for identity binding. */
  idEcdhPub: Jwk;
  /** ECDSA P-256 public key (JWK) used to sign handshakes. */
  idEcdsaPub: Jwk;
  /** Derived fingerprint of the two public keys. */
  fingerprint: Fingerprint;
  /** Optional user-chosen display name (not a secret, user controlled). */
  name: string;
  /** Key creation timestamp (ms). */
  createdAt: number;
}

/** Full local identity — private keys never leave the vault/device. */
export interface Identity extends PublicIdentity {
  /** ECDH P-256 private key (JWK) — encrypted at rest inside the vault. */
  idEcdhPriv: Jwk;
  /** ECDSA P-256 private key (JWK) — encrypted at rest inside the vault. */
  idEcdsaPriv: Jwk;
}

/** Persisted vault envelope. The wrapped DEK can only be opened with the password. */
export interface VaultRecord {
  v: 1;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  /** base64 salt (32 bytes). */
  salt: string;
  /** base64 AES-GCM IV (12 bytes). */
  iv: string;
  /** base64 AES-256-GCM ciphertext of the raw 32-byte Data Encryption Key. */
  wrappedDek: string;
  /** ms timestamp of vault creation. */
  createdAt: number;
  /** ms timestamp of the last successful unlock. */
  lastUnlockAt: number;
}

/** A locally stored contact. Private keys are never part of a contact. */
export interface Contact {
  /** Local random identifier (random UUID, not sensitive). */
  id: string;
  name: string;
  fingerprint: Fingerprint;
  /** Public keys captured when the contact was first seen. */
  idEcdhPub: Jwk;
  idEcdsaPub: Jwk;
  /** True only after the user completed explicit fingerprint verification. */
  verified: boolean;
  /** ms timestamp verification happened, null if never. */
  verifiedAt: number | null;
  /** Fingerprint the contact had when added; detects identity key change. */
  addedFingerprint: Fingerprint;
  createdAt: number;
  lastConnectedAt: number | null;
  note?: string;
}

export type MessageKind = "text" | "image" | "file" | "voice" | "system";

export type SystemEventCode =
  | "connection-established"
  | "connection-closed"
  | "identity-verified"
  | "identity-changed"
  | "channel-secured"
  | "attachment-decrypted"
  | "error";

export interface EncryptedAttachment {
  /** Encrypted-at-rest attachment id (plaintext id is a random uuid). */
  id: string;
  /** Encrypted fields — stored as ciphertext blobs by EncryptedStorage. */
  name: string;
  mime: string;
  size: number;
  /** Local object URL created on decrypt-for-display (memory only). */
  localUrl?: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  /** sender fingerprint */
  senderFp: Fingerprint;
  kind: MessageKind;
  /** decrypted plaintext (kept in memory only; persisted re-encrypted). */
  text?: string;
  attachment?: EncryptedAttachment;
  /** per-file AES key + iv, stored ONLY inside DEK-encrypted local records. */
  fileKeyB64?: string;
  fileIvB64?: string;
  timestamp: number;
  /** delivery is only marked after the peer DataChannel actually acked. */
  delivered: boolean;
  /** incoming = from peer, outgoing = from this device. */
  direction: "incoming" | "outgoing";
  /** system security events carry a code instead of text from peers. */
  systemCode?: SystemEventCode;
}

export interface Conversation {
  /** derived from the contact fingerprint pair (pseudonymous key material). */
  id: string;
  contactId: string;
  contactFp: Fingerprint;
  createdAt: number;
  lastMessageAt: number | null;
  /** locally tracked unread counter — never synced anywhere. */
  unread: number;
}

export type ConnectionState =
  | "offline"
  | "discovering-peer"
  | "connecting"
  | "connected"
  | "secure"
  | "disconnected"
  | "error";

export interface PeerSessionMeta {
  peerFp: Fingerprint | null;
  peerName: string | null;
  /** invite fingerprint claimed before handshake (from QR / invite code). */
  claimedFp: Fingerprint | null;
  startedAt: number;
}

/** Wire frame for application-layer encrypted chat messages. */
export interface WireFrame {
  t: "m";
  iv: string;
  seq: number;
  ct: string;
  fp: Fingerprint;
}

/** Wire frames for encrypted attachment transfer (control plane). */
export interface WireFileStart {
  t: "fs";
  id: string;
  /** session-key-encrypted metadata payload (iv + ct). */
  iv: string;
  ct: string;
  /** sequence number used for the encrypted metadata frame. */
  seq: number;
  fp: Fingerprint;
}

export interface WireFileEnd {
  t: "fe";
  id: string;
  fp: Fingerprint;
}

export interface WireError {
  t: "err";
  code: "bad-frame" | "decrypt-failed" | "replay";
  fp: Fingerprint;
}

/** Delivery ack — honest delivery means the peer actually confirmed receipt. */
export interface WireAck {
  t: "ack";
  id: string;
  fp: Fingerprint;
}

export type WireMessage = WireFrame | WireFileStart | WireFileEnd | WireError | WireAck;

export interface SecureEnvelope {
  /** base64 IV */
  iv: string;
  /** base64 ciphertext */
  ct: string;
}

export interface VaultMaterial {
  /** non-extractable AES-256-GCM key used for local storage encryption. */
  dek: CryptoKey;
  unlockedAt: number;
}

export type SecurityEventKind =
  | "vault-created"
  | "vault-unlocked"
  | "vault-locked"
  | "vault-unlock-failed"
  | "identity-created"
  | "identity-verified"
  | "identity-changed"
  | "backup-exported"
  | "backup-imported"
  | "connection-established"
  | "connection-closed"
  | "conversation-deleted"
  | "data-wiped"
  | "contact-added"
  | "contact-deleted"
  | "settings-changed"
  | "error";

export interface SecurityEvent {
  id: string;
  kind: SecurityEventKind;
  at: number;
  /** short, human-readable, never contains message content or keys. */
  detail: string;
}

export interface AppSettings {
  autoLockMinutes: number;
  lockOnHide: boolean;
  /** invite display name */
  displayName: string;
}

export interface EncryptedBackupFile {
  v: 1;
  format: "fastguns-encrypted-backup";
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
  createdAt: number;
}

export interface BackupPayload {
  identity: Identity;
  contacts: Contact[];
  conversations: Conversation[];
  messages: ChatMessage[];
  settings: AppSettings;
  securityLog: SecurityEvent[];
  exportedAt: number;
}
