# FAST GUNS — Security Documentation

## Responsible disclosure

Private security advisories only. Please include reproduction steps and
affected components. Do not test against devices or accounts you do not own.

## Security architecture

```
Identity (device-generated)
  ECDH P-256 (key agreement)  +  ECDSA P-256 (handshake signing)
        │
Vault (PBKDF2-SHA256 ×600k → KEK → AES-GCM-wrapped DEK)
        │ non-extractable DEK
        ▼
EncryptedStorage (IndexedDB)      PeerSession (WebRTC DataChannel)
  every record AES-256-GCM          signed ephemeral-ECDH handshake
  AAD = store|id                    HKDF-SHA256 → session key
  attachments = ciphertext          AES-256-GCM frames (seq AAD)
```

### Cryptographic assumptions

- WebCrypto implementations of the browser are correct and side-channel
  resistant to a practical degree.
- P-256 and AES-256-GCM provide their standard security levels.
- Randomness comes exclusively from `crypto.getRandomValues`.
- No custom algorithms, no ECB, no nonce reuse, no raw-password keys, no
  homegrown protocol logic beyond message framing.

### Dependency policy

Minimal footprint. New dependencies must be mature and necessary;
crypto is **only** WebCrypto (plus `qrcode`/`jsqr` for QR plumbing and
`socket.io` for the relay transport — none of which touch key material).

## What is stored, where

| Data | Location | Protection |
| --- | --- | --- |
| Wrapped vault DEK | IndexedDB `meta` store | useless without the password (AES-GCM) |
| Identity private keys (JWK) | IndexedDB `kv` | DEK-encrypted |
| Contacts, conversations | IndexedDB | DEK-encrypted |
| Message plaintexts | memory only | re-encrypted (DEK) before any persistence |
| Message ciphertexts | IndexedDB `messages` | DEK-encrypted envelope |
| Attachment blobs | IndexedDB `attachments` | per-file AES-GCM ciphertext |
| Security log | IndexedDB `log` | DEK-encrypted, 500-entry cap |
| Session keys | RAM | destroyed on lock/disconnect |
| Signaling state | relay RAM | TTL ≤ 10 min, no persistence |

## Known limitations (read this)

1. **No per-message ratchet.** Session keys are ephemeral (forward secrecy
   for the live session: captured ciphertext can't be decrypted after the
   session without an ephemeral private key), but stored history remains
   decryptable while the vault is unlocked. This is not Signal.
2. **PBKDF2, not Argon2id.** Browsers don't ship Argon2id. PBKDF2-SHA256
   with 600k iterations is the strongest native KDF; it is weaker against
   GPU cracking.
3. **Device compromise is out of scope.** Malware, malicious browser
   extensions, or a stolen unlocked device defeats everything.
4. **Metadata is not hidden.** The relay and network observers see IPs,
   timing, rendezvous codes and connection metadata.
5. **No anonymity.** None is claimed.
6. **Availability requires online peers.** There is no server queue; if the
   peer is offline, sending fails honestly.
7. **Backup files are only as safe as their storage location and password.**
8. **Browser storage deletion is best-effort** at the OS level (remnants may
   persist on disk).
9. **CSP is pragmatic** (`unsafe-inline` for Next.js hydration) — a
   nonce-based CSP is the next hardening step.
10. **Not audited.** Standard primitives, independent review still required
    before trusting lives to it.

## Recovery limitations

- No master key, no backdoor, no escrow, no hidden recovery — ever.
- Vault password forgotten + no backup + no device ⇒ data unrecoverable.

## Security testing checklist (verified)

- [x] Encryption/decryption round-trips via AES-GCM (auth on tamper)
- [x] Wrong vault password fails (GCM) — no silent fallback
- [x] Replay/reorder rejected via sequence-bound AAD
- [x] No plaintext in IndexedDB (records + attachments are ciphertext)
- [x] Private keys never logged / never in network payloads / never in URLs
- [x] Signaling payloads contain only SDP/ICE metadata
- [x] Identity change detection raises a blocking security alert
- [x] Encrypted backup export/import round-trip; wrong backup password fails
- [x] Deleted conversations removed via storage APIs
- [x] Attachment chunking round-trip with per-file keys
- [x] XSS: all user input rendered as React text, zero `dangerouslySetInnerHTML`
- [x] Invalid QR/invite payloads rejected (fail closed)
- [x] Lock clears in-memory state (contacts, messages, log, keys, URLs)

## Deployment notes

- Serve over HTTPS (HSTS is set in `next.config.ts`).
- The relay (`mini-services/signaling`) can run on any host; it must never
  be given persistent storage.
- Do not add analytics to the app; the landing page must stay free of
  third-party scripts to keep the CSP meaningful.
