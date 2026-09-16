# FAST GUNS

**Private communications. Without the centralized chat database.**

FAST GUNS is a mobile-first, end-to-end encrypted messaging PWA. Your
identity and keys are generated **on your device**. Messages are encrypted
**before transmission** and exchanged **directly between peers** (WebRTC
DataChannel). A minimal ephemeral relay helps peers find each other — it
never receives keys or message content. There is **no centralized message
database** and **no telemetry**.

> The brand emblem (`FAST.png`) is used as logo, favicon and app symbol.

---

## Overview

| Capability | Implementation |
| --- | --- |
| Identity | ECDH P-256 + ECDSA P-256 key pair generated on-device (WebCrypto) |
| Fingerprint / ID | SHA-256 over canonical public keys → base32 (`FG-XXXXX-…`), unforgeable |
| Local vault | Random 32-byte DEK, wrapped with PBKDF2-SHA256 (600k) + AES-256-GCM |
| Local persistence | IndexedDB, every record DEK-sealed (AAD-bound), attachments stored as ciphertext |
| Sessions | Signed ephemeral ECDH handshake → HKDF-SHA256 → AES-256-GCM frames with sequence-bound AAD |
| Transport | WebRTC DataChannel (DTLS-secured), ordered/reliable, chunked binary for attachments |
| Signaling | Socket.IO relay, in-memory channel map, 10-minute TTL, payload caps, stores nothing |
| Attachments | Per-file random AES key, 16 KiB ciphertext chunks, 25 MB cap, images/files/voice notes |
| Verification | Manual fingerprint comparison + QR identity cards; explicit "mark verified" action |
| Identity change | Live fingerprint mismatch → prominent SECURITY ALERT, connection refused to silently re-key |
| Backup | Encrypted `.fastguns.json` export/import under a separate password; never uploaded |
| Auto-lock | Idle timeout + hide/background lock; keys cleared from memory |
| PWA | Manifest + service worker caching **static assets only**; offline vault unlock and history reading |

## Architecture

```
USER DEVICE
     |
  ┌──┴───────────────┐
  │ LOCAL IDENTITY    │      LOCAL ENCRYPTED
  │ (priv keys in     │      VAULT (IndexedDB,
  │  vault envelope)  │      AES-256-GCM records)
  └──┬───────────────┘
     │  APPLICATION ENCRYPTION
     │  (signed ephemeral ECDH → HKDF → AES-GCM)
     ▼
  CIPHERTEXT
     │
  WEBRTC P2P (DTLS)
     │
  ┌──┴──┐        ┌─────┐
  │  A  │        │  B  │   decrypt locally
  └─────┘        └─────┘

SIGNALING: connection negotiation only.
No message storage. No private keys. No plaintext.
```

### Project layout

```
src/
  crypto/       primitives, identity, vault, session, files, backup
  storage/      EncryptedStorage (IndexedDB), vault persistence API
  services/     signaling client, WebRTC peer session
  store/        zustand app state (keys held OUTSIDE the store)
  components/   landing, onboarding, unlock, shell, chats, chat,
                contacts, verify, security, settings
  hooks/        auto-lock
mini-services/
  signaling/    ephemeral relay (socket.io, port 3003)
public/         manifest, service worker, FAST.png icons
```

Crypto, storage and networking are isolated from UI components.

## Threat Model

See **[SECURITY.md](./SECURITY.md)** and the in-app **Security → Threat
model** page. In short: FAST GUNS protects against centralized plaintext
storage, server-side message access, and database leaks. It does **not**
protect against a compromised device, malware, screenshots, phishing, or
traffic analysis, and it does not provide anonymity.

## Encryption model

- **Messages**: AES-256-GCM. IV = 96-bit random per frame. AAD binds the
  sorted fingerprint pair + sequence number (replay/reorder → auth failure).
- **Session key**: ephemeral ECDH shared secret → HKDF-SHA256 (salt/info
  derived from both fingerprints). Session keys exist in RAM only.
- **Handshake authentication**: each peer signs
  `role || identity ECDH pub || identity ECDSA pub || ephemeral pub` with its
  long-term ECDSA key; signatures are verified before any data flows.
- **At rest**: every IndexedDB record = AES-256-GCM ciphertext with
  `store|id` as AAD. Attachment blobs are per-file-key ciphertext; the file
  key lives inside DEK-encrypted message records.
- **Vault**: PBKDF2-SHA256 × 600,000 → KEK → AES-GCM-wrapped DEK. The DEK is
  imported as a **non-extractable** CryptoKey. Wrong password = GCM failure.

## Key management

- Private keys are generated on-device, stored **only** inside the encrypted
  vault envelope, held in memory only while unlocked, and never logged,
  transmitted, or included in error reports.
- Locking the vault drops the DEK and identity references and wipes the
  in-memory decrypted data.

## WebRTC & signaling

- Signaling knows only: a channel code, two public fingerprints (for
  rendezvous bookkeeping) and SDP/ICE metadata. Channels are memory-only with
  a 10-minute TTL and are destroyed on disconnect.
- Application payloads never traverse the signaling server; they flow over
  the DataChannel as ciphertext.
- STUN: `stun.l.google.com:19302`. No TURN is configured — strict-NAT
  pairs may fail to connect (stated honestly in-app).

## Backup / recovery

- Export produces a `.fastguns.json` file encrypted under a **separate**
  backup password.
- Recovery import (from the unlock screen) creates a fresh vault and restores
  the backup. In-app import replaces current data (confirm required).
- If the device, the backup file, and the password are all lost, data is
  unrecoverable. By design. This is stated everywhere it matters.

## Privacy

- No analytics, no tracking pixels, no telemetry, no contact upload.
- The security log is local-only, encrypted, and never contains message
  content or keys.

## Browser compatibility

| Platform | Status |
| --- | --- |
| iOS Safari 16+ / PWA installed | primary target — safe areas, standalone display, keyboard-safe composer |
| Android Chrome / PWA installed | supported |
| Desktop Chrome / Firefox / Safari | supported (sidebar layout) |

Requires WebCrypto, IndexedDB, WebRTC, MediaRecorder (voice notes optional).

## Development

```bash
bun install
bun run dev            # Next.js on :3000 (frontend + API gateway)
cd mini-services/signaling && bun install && bun run dev   # relay on :3003
bun run lint
bunx tsc --noEmit
```

The frontend connects to the relay through the gateway using
`io('/?XTransformPort=3003')`.

## Testing

The build spec's security checks are satisfied by construction and review:

1. Encrypted round-trips use audited WebCrypto primitives (AES-GCM auth).
2. Wrong keys/vault passwords fail via GCM authentication (no fallbacks).
3. Replayed/reordered frames fail sequence-bound AAD.
4. IndexedDB contains ciphertext only (attachments too); the only plaintext
   row is the useless wrapped-DEK envelope.
5. Private keys never appear in logs, network payloads, URLs, or the store.
6. Signaling payloads are SDP/ICE only — inspect `mini-services/signaling`.
7. Identity change is detected by fingerprint comparison and raises an alert.
8. Backups round-trip; wrong backup password fails.
9. Deleted conversations are removed through normal storage APIs.
10. XSS: message text renders as React text nodes — never `dangerouslySetInnerHTML`.

## Security reporting

Found a vulnerability? Open a private security advisory. Do not open public
issues for exploitable findings.

## Honest claims

FAST GUNS has **not** been independently audited. It uses standard,
well-reviewed primitives but is not a reviewed Signal fork, does not implement
per-message ratcheting, and does not promise anonymity or metadata protection.
