/**
 * FAST GUNS — secure session layer (application-level E2EE).
 *
 * Handshake (both directions, over the WebRTC DataChannel):
 *   1. each side generates a fresh ephemeral ECDH P-256 key pair
 *   2. each side signs (role || identity ECDH pub || identity ECDSA pub ||
 *      ephemeral pub) with its long-term ECDSA identity key
 *   3. both sides perform ECDH(own ephemeral priv, peer ephemeral pub)
 *   4. session key = HKDF-SHA256(shared secret,
 *         salt  = SHA-256(sorted fingerprint pair),
 *         info  = "fastguns-session-v1" || both fingerprints)
 *
 * Result: every message is encrypted with AES-256-GCM under a key that:
 *   - is bound to both verified-signature identities (authentication),
 *   - exists only in RAM and is destroyed when the session ends
 *     (forward secrecy for the live session: captured ciphertext cannot
 *     be decrypted after the session without an ephemeral private key),
 *   - is NOT ratcheted per-message (honest limitation, see threat model).
 *
 * Replay protection: strictly increasing sequence numbers are part of
 * the AES-GCM additional authenticated data, so replayed or reordered
 * frames fail authentication.
 *
 * The signaling server never sees any of this material — it only relays
 * WebRTC SDP/ICE metadata, and the DataChannel carries ciphertext.
 */

import type {
  Fingerprint,
  Identity,
  IdentityRole,
  SecureEnvelope,
  WireFrame,
} from "@/types";
import {
  aesGcmDecrypt,
  aesGcmEncrypt,
  fromBase64,
  fromUtf8,
  hkdfBits,
  importAesKey,
  sha256,
  toBase64,
  utf8,
} from "./primitives";
import {
  exportPublicJwk,
  fingerprintIdentity,
  importEcdhPrivate,
  importEcdhPublic,
  signHandshakeFull,
  verifyHandshakeSignature,
  wirePublicJwk,
} from "./identity";

export interface HelloBundle {
  v: 1;
  t: "hello";
  role: IdentityRole;
  name: string;
  fp: Fingerprint;
  idEcdhPub: JsonWebKey;
  idEcdsaPub: JsonWebKey;
  ephPub: JsonWebKey;
  sig: string; // base64 ECDSA signature
}

export interface SecureSession {
  key: CryptoKey;
  /** local device fingerprint (AAD binding) */
  selfFp: Fingerprint;
  /** next outgoing sequence number */
  sendSeq: number;
  /** highest accepted incoming sequence number per direction */
  recvSeq: number;
  peerFp: Fingerprint;
  peerName: string;
  peerIdEcdhPub: JsonWebKey;
  peerIdEcdsaPub: JsonWebKey;
  establishedAt: number;
}

export function sessionChannelId(selfFp: string, peerFp: string): string {
  const sorted = [selfFp, peerFp].sort();
  return `${sorted[0].slice(0, 12)}_${sorted[1].slice(0, 12)}`;
}

/** Build a signed hello bundle with a fresh ephemeral key. */
export async function createHello(
  identity: Identity,
  role: IdentityRole
): Promise<{ hello: HelloBundle; ephemeralPriv: CryptoKey }> {
  const eph = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
  const ephPub = await exportPublicJwk(eph.publicKey);
  const sig = await signHandshakeFull(
    identity.idEcdsaPriv,
    identity.idEcdhPub,
    identity.idEcdsaPub,
    ephPub,
    role
  );
  return {
    hello: {
      v: 1,
      t: "hello",
      role,
      name: identity.name,
      fp: identity.fingerprint,
      idEcdhPub: wirePublicJwk(identity.idEcdhPub),
      idEcdsaPub: wirePublicJwk(identity.idEcdsaPub),
      ephPub: wirePublicJwk(ephPub),
      sig: toBase64(sig),
    },
    ephemeralPriv: eph.privateKey,
  };
}

export interface HelloResult {
  ok: boolean
  reason?:
    | "bad-json"
    | "bad-version"
    | "bad-role"
    | "bad-keys"
    | "bad-signature"
    | "fingerprint-mismatch";
  hello?: HelloBundle;
  /** recomputed fingerprint from the received public keys. */
  computedFp?: Fingerprint;
}

export function parseHello(raw: string): HelloResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, reason: "bad-json" };
  }
  const h = parsed as Partial<HelloBundle>;
  if (!h || h.t !== "hello" || h.v !== 1) return { ok: false, reason: "bad-version" };
  if (h.role !== "initiator" && h.role !== "responder") return { ok: false, reason: "bad-role" };
  if (!h.fp || !h.idEcdhPub || !h.idEcdsaPub || !h.ephPub || !h.sig) {
    return { ok: false, reason: "bad-keys" };
  }
  return { ok: true, hello: h as HelloBundle };
}

/**
 * Verify the peer hello and derive the session key.
 * `expectedFp` comes from a saved contact or an invite — when the live
 * fingerprint differs, callers must raise a SECURITY ALERT and must not
 * silently replace the stored identity key.
 */
export async function establishSession(
  ownIdentity: Identity,
  ownRole: IdentityRole,
  ownEphemeralPriv: CryptoKey,
  peerHello: HelloBundle,
  expectedFp: Fingerprint | null
): Promise<{ ok: boolean; reason?: HelloResult["reason"]; session?: SecureSession }> {
  // 1. fingerprint check: recomputed from received public keys
  const computedFp = await fingerprintIdentity(peerHello.idEcdhPub, peerHello.idEcdsaPub);
  if (computedFp !== peerHello.fp) {
    return { ok: false, reason: "fingerprint-mismatch" };
  }
  if (expectedFp && computedFp !== expectedFp) {
    return { ok: false, reason: "fingerprint-mismatch" };
  }
  // 2. role sanity — peers must hold opposite roles
  const ownExpectedPeerRole = ownRole === "initiator" ? "responder" : "initiator";
  if (peerHello.role !== ownExpectedPeerRole) {
    return { ok: false, reason: "bad-role" };
  }
  // 3. signature check — binds ephemeral key to the identity
  let sigValid = false;
  try {
    sigValid = await verifyHandshakeSignature(
      peerHello.idEcdsaPub,
      peerHello.idEcdhPub,
      peerHello.ephPub,
      peerHello.role,
      fromBase64(peerHello.sig).buffer as ArrayBuffer
    );
  } catch {
    sigValid = false;
  }
  if (!sigValid) {
    return { ok: false, reason: "bad-signature" };
  }
  // 4. ECDH
  const peerEph = await importEcdhPublic(peerHello.ephPub);
  const shared = await crypto.subtle.deriveBits(
    { name: "ECDH", public: peerEph },
    ownEphemeralPriv,
    256
  );
  // 5. HKDF → session key
  const sortedFps = [ownIdentity.fingerprint, peerHello.fp].sort();
  const saltInput = utf8(`fastguns-salt-v1|${sortedFps[0]}|${sortedFps[1]}`);
  const salt = await sha256(saltInput);
  const info = utf8(`fastguns-session-v1|${sortedFps[0]}|${sortedFps[1]}`);
  const okm = await hkdfBits(shared, new Uint8Array(salt), info, 32);
  const key = await importAesKey(okm, false, ["encrypt", "decrypt"]);

  return {
    ok: true,
    session: {
      key,
      selfFp: ownIdentity.fingerprint,
      sendSeq: 1,
      recvSeq: 0,
      peerFp: peerHello.fp,
      peerName: peerHello.name,
      peerIdEcdhPub: peerHello.idEcdhPub,
      peerIdEcdsaPub: peerHello.idEcdsaPub,
      establishedAt: Date.now(),
    },
  };
}

/**
 * AAD binds every frame to the sorted fingerprint pair and its sequence
 * number — identical on both sides, unique per frame.
 */
function frameAad(fpA: string, fpB: string, seq: number): Uint8Array {
  const sorted = [fpA, fpB].sort();
  return utf8(`fastguns-msg-v1|${sorted[0]}|${sorted[1]}|${seq}`);
}

/** Encrypt one outgoing message frame. */
export async function encryptFrame(
  session: SecureSession,
  plaintext: string,
  selfFp: string
): Promise<WireFrame> {
  const seq = session.sendSeq++;
  const { iv, ct } = await aesGcmEncrypt(
    session.key,
    utf8(plaintext),
    frameAad(selfFp, session.peerFp, seq)
  );
  return { t: "m", iv: toBase64(iv), seq, ct: toBase64(ct), fp: selfFp };
}

/**
 * Decrypt one incoming frame. Throws on tamper / replay / wrong key —
 * callers translate this into an honest user-facing error.
 */
export async function decryptFrame(
  session: SecureSession,
  frame: WireFrame
): Promise<string> {
  if (frame.fp !== session.peerFp) {
    throw new Error("sender-mismatch");
  }
  if (!Number.isInteger(frame.seq) || frame.seq <= session.recvSeq) {
    throw new Error("replay-or-out-of-order");
  }
  const plaintext = await aesGcmDecrypt(
    session.key,
    fromBase64(frame.iv),
    fromBase64(frame.ct),
    frameAad(session.peerFp, session.selfFp, frame.seq)
  );
  session.recvSeq = frame.seq;
  return fromUtf8(plaintext);
}

/** Encrypt arbitrary metadata (e.g. attachment descriptions). */
export async function encryptMetadata(
  session: SecureSession,
  value: unknown,
  selfFp: string
): Promise<SecureEnvelope & { seq: number }> {
  const seq = session.sendSeq++;
  const { iv, ct } = await aesGcmEncrypt(
    session.key,
    utf8(JSON.stringify(value)),
    frameAad(selfFp, session.peerFp, seq)
  );
  return { iv: toBase64(iv), ct: toBase64(ct), seq };
}

export async function decryptMetadata<T>(
  session: SecureSession,
  envelope: SecureEnvelope,
  seq: number
): Promise<T> {
  if (!Number.isInteger(seq) || seq <= session.recvSeq) {
    throw new Error("replay-or-out-of-order");
  }
  const plain = await aesGcmDecrypt(
    session.key,
    fromBase64(envelope.iv),
    fromBase64(envelope.ct),
    frameAad(session.peerFp, session.selfFp, seq)
  );
  session.recvSeq = seq;
  return JSON.parse(fromUtf8(plain)) as T;
}
