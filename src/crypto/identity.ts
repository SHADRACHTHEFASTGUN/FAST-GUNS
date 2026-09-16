/**
 * FAST GUNS — local identity.
 *
 * Every device generates its own identity fully on-device:
 *   - ECDH P-256 key pair  → identity key agreement material
 *   - ECDSA P-256 key pair → signs handshakes so peers can bind session
 *                            keys to a stable identity
 *
 * Private keys are exported as JWK and stored ONLY inside the encrypted
 * vault. They never leave the device in any other form.
 */

import type { Fingerprint, Jwk, PublicIdentity, Identity, IdentityRole } from "@/types";
import {
  canonicalJson,
  sha256,
  toBase32,
  utf8,
} from "./primitives";

export async function generateEcdhKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, [
    "deriveBits",
  ]);
}

export async function generateEcdsaKeyPair(): Promise<CryptoKeyPair> {
  return crypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256", hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
}

export async function exportPublicJwk(key: CryptoKey): Promise<Jwk> {
  return crypto.subtle.exportKey("jwk", key);
}

/**
 * Public EC keys travel as only {kty, crv, x, y}. Browsers export JWKs
 * with `key_ops`/`ext` fields that can make `importKey` reject the key
 * (usage-superset rule), and those fields carry no security meaning.
 */
export function wirePublicJwk(jwk: Jwk): Jwk {
  return { kty: jwk.kty, crv: jwk.crv, x: jwk.x, y: jwk.y };
}

export async function exportPrivateJwk(key: CryptoKey): Promise<Jwk> {
  return crypto.subtle.exportKey("jwk", key);
}

export async function importEcdhPublic(jwk: Jwk): Promise<CryptoKey> {
  // ECDH public keys support NO key usages (deriveBits is private-only).
  // Requesting usages here throws DataError in conforming browsers.
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

export async function importEcdhPrivate(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, [
    "deriveBits",
  ]);
}

export async function importEcdsaPublic(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "verify",
  ]);
}

export async function importEcdsaPrivate(jwk: Jwk): Promise<CryptoKey> {
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
}

/** Canonical bytes describing a public identity — the signing payload. */
function identityCanonicalBytes(idEcdhPub: Jwk, idEcdsaPub: Jwk): Uint8Array {
  return utf8(
    canonicalJson({
      v: 1,
      usage: "fastguns-identity-v1",
      ecdh: { crv: idEcdhPub.crv, kty: idEcdhPub.kty, x: idEcdhPub.x, y: idEcdhPub.y },
      ecdsa: { crv: idEcdsaPub.crv, kty: idEcdsaPub.kty, x: idEcdsaPub.x, y: idEcdsaPub.y },
    })
  );
}

/**
 * Fingerprint = SHA-256 over the canonical form of both identity public keys.
 * First 20 bytes → base32 (32 chars). The fingerprint IS the public ID:
 * it cannot be chosen or spoofed without holding the private keys.
 */
export async function fingerprintIdentity(
  idEcdhPub: Jwk,
  idEcdsaPub: Jwk
): Promise<Fingerprint> {
  const digest = await sha256(identityCanonicalBytes(idEcdhPub, idEcdsaPub));
  const bytes = new Uint8Array(digest).slice(0, 20);
  return toBase32(bytes);
}

export type ForgeStage =
  | "init"
  | "keygen-ecdh"
  | "keygen-ecdsa"
  | "kdf"
  | "seal"
  | "unwrap"
  | "fingerprint"
  | "persist"
  | "done";

export async function createIdentity(
  name: string,
  onStage?: (stage: ForgeStage) => Promise<void> | void
): Promise<Identity> {
  await onStage?.("keygen-ecdh");
  const ecdh = await generateEcdhKeyPair();
  await onStage?.("keygen-ecdsa");
  const ecdsa = await generateEcdsaKeyPair();

  const idEcdhPub = await exportPublicJwk(ecdh.publicKey);
  const idEcdhPriv = await exportPrivateJwk(ecdh.privateKey);
  const idEcdsaPub = await exportPublicJwk(ecdsa.publicKey);
  const idEcdsaPriv = await exportPrivateJwk(ecdsa.privateKey);

  await onStage?.("fingerprint");
  const fingerprint = await fingerprintIdentity(idEcdhPub, idEcdsaPub);

  return {
    idEcdhPub,
    idEcdhPriv,
    idEcdsaPub,
    idEcdsaPriv,
    fingerprint,
    name: sanitizeName(name),
    createdAt: Date.now(),
  };
}

export async function publicIdentityOf(identity: Identity): Promise<PublicIdentity> {
  return {
    idEcdhPub: identity.idEcdhPub,
    idEcdsaPub: identity.idEcdsaPub,
    fingerprint: identity.fingerprint,
    name: identity.name,
    createdAt: identity.createdAt,
  };
}

/**
 * Sign the handshake payload:
 *   role || identity ECDH pub || identity ECDSA pub || ephemeral ECDH pub
 *
 * The signature binds the ephemeral session key to this device's stable
 * identity for a specific role, preventing unknown-key-share and
 * reflection attacks.
 */
export async function signHandshakeFull(
  idEcdsaPrivJwk: Jwk,
  idEcdhPub: Jwk,
  idEcdsaPub: Jwk,
  ephemeralPub: Jwk,
  role: IdentityRole
): Promise<ArrayBuffer> {
  const key = await importEcdsaPrivate(idEcdsaPrivJwk);
  const payload = utf8(
    canonicalJson({
      v: 1,
      usage: "fastguns-handshake-v1",
      role,
      id: { kty: idEcdhPub.kty, crv: idEcdhPub.crv, x: idEcdhPub.x, y: idEcdhPub.y },
      sig: { kty: idEcdsaPub.kty, crv: idEcdsaPub.crv, x: idEcdsaPub.x, y: idEcdsaPub.y },
      eph: { kty: ephemeralPub.kty, crv: ephemeralPub.crv, x: ephemeralPub.x, y: ephemeralPub.y },
    })
  );
  return crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, payload as BufferSource);
}

export async function verifyHandshakeSignature(
  idEcdsaPub: Jwk,
  idEcdhPubClaimed: Jwk,
  ephemeralPub: Jwk,
  role: IdentityRole,
  signature: ArrayBuffer
): Promise<boolean> {
  try {
    const key = await importEcdsaPublic(idEcdsaPub);
    const payload = utf8(
      canonicalJson({
        v: 1,
        usage: "fastguns-handshake-v1",
        role,
        id: {
          kty: idEcdhPubClaimed.kty,
          crv: idEcdhPubClaimed.crv,
          x: idEcdhPubClaimed.x,
          y: idEcdhPubClaimed.y,
        },
        sig: { kty: idEcdsaPub.kty, crv: idEcdsaPub.crv, x: idEcdsaPub.x, y: idEcdsaPub.y },
        eph: { kty: ephemeralPub.kty, crv: ephemeralPub.crv, x: ephemeralPub.x, y: ephemeralPub.y },
      })
    );
    return crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" },
      key,
      signature,
      payload as BufferSource
    );
  } catch {
    return false;
  }
}

export function sanitizeName(name: string): string {
  // strip control characters, trim, cap length
  return name.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 32);
}
