# Worklog — FAST GUNS (Encrypted Communications PWA)

Project: FAST GUNS — mobile-first, end-to-end encrypted, local-first P2P chat (spec: "BLACKBOX" build spec, branded FAST GUNS with uploaded FAST.png logo).

---
Task ID: 1
Agent: main
Task: Setup — deps, logo assets, favicon/icons

Work Log:
- Read full build spec (Pasted Content_1789556715536.txt) and FAST.png logo (black metallic gothic emblem, mirrored pistols + gloved hands + chains, monochrome).
- Plan: brand = FAST GUNS; aesthetic = black/graphite/silver private communications hardware; real WebCrypto E2EE (ECDH P-256 + ECDSA P-256 + HKDF + AES-256-GCM), PBKDF2-SHA256 (600k) vault KDF, encrypted IndexedDB, WebRTC DataChannel P2P with ephemeral socket.io signaling (port 3003), PWA, iOS-first mobile UX.
- Constraint: single route `/` (SPA-style view switching), API not server actions, signaling via mini-service + XTransformPort.

---
Task ID: 2-6
Agent: main
Task: Core systems (design system, crypto, storage, signaling, app core)

Work Log:
- globals.css: FAST GUNS dark monochrome design system (ink #050505, surface #111, silver #C7C7C7, restrained alert red), metal-panel/metal-text utilities, grain, safe-area utils, industrial animations, reduced-motion support.
- layout.tsx: metadata, favicon/icons from FAST.png, PWA meta (appleWebApp, viewport-fit cover, themeColor #050505).
- src/types: strict domain types (Identity, VaultRecord, Contact, ChatMessage, Wire frames incl. WireAck, SecurityEvent, backup).
- src/crypto/primitives.ts: WebCrypto only — SHA-256, HKDF-SHA256, AES-256-GCM (AAD), PBKDF2, base32/base64url, canonical JSON, zeroize.
- src/crypto/identity.ts: ECDH P-256 + ECDSA P-256 identity, SHA-256 fingerprint (base32, FG-XXXXX…), signed handshakes (role-bound), sanitizeName.
- src/crypto/vault.ts: PBKDF2-SHA256 600k → KEK; random DEK wrapped via AES-GCM; non-extractable DEK; password strength; honest PBKDF2-vs-Argon2id note.
- src/crypto/session.ts: signed ephemeral-ECDH handshake, HKDF session key (fingerprint-pair salt/info), seq-number AAD replay protection, encrypt/decryptFrame + metadata envelopes.
- src/crypto/files.ts: per-file random AES key, 16KiB ciphertext chunks, 25MB honest cap. src/crypto/backup.ts: separate backup password, .fastguns.json export/import.
- src/storage/encrypted-store.ts: IndexedDB treated as untrusted; every record AES-GCM sealed (AAD=store|id); attachments stored as ciphertext; listByPrefix for conversations; deleteDatabase for wipe. meta-raw.ts for the pre-unlock wrapped-DEK envelope. vault-store.ts: high-level API + 500-entry security log + storage stats.
- mini-services/signaling: socket.io on 3003, in-memory channel Map, 10min TTL sweep, payload caps, relay-only (SDP/ICE), no logging, started via bun --hot (health via socket.io only).
- src/services: signaling-client (io('/?XTransformPort=3003')), peer-session (WebRTC + handshake + encrypted frames + chunked attachments + acks + invite encode/decode FG1-…).
- src/store/app-store.ts: zustand; DEK/identity/session only in module refs; boot/onboarding/unlock/lock; contact+conversation auto-creation on secure handshake; incoming/ack wiring; verified flow; backup export + recovery/in-app import; wipe; auto-lock hook (idle + hidden 30s).
- tsc --noEmit: clean (excluding pre-existing skills/ folder errors).

Stage Summary:
- Security architecture is REAL: WebCrypto E2EE (signed ephemeral ECDH → HKDF → AES-GCM), password-wrapped DEK vault, all-at-rest encryption, ephemeral signaling that cannot read content. Honest limitations documented in code (PBKDF2 not Argon2id, no per-message ratchet, session-scoped forward secrecy only).
- Next: UI (landing/onboarding/unlock/shell/chats/chat/contacts/verify/security/settings), PWA files, docs, verification.

---
Task ID: 7-12
Agent: main
Task: UI build, PWA, docs, end-to-end browser verification

Work Log:
- Built all UI: landing (emblem hero, factual copy, sticky footer), onboarding (name → password+strength → real "forging" crypto screen → encrypted backup download), unlock (emblem, wrong-password honesty, recovery import, erase), app shell (mobile bottom nav + desktop sidebar), chats list, connect overlay (Invite code+QR / Code / Paste / Scan via jsQR), chat view (bubbles, delivered-ack ticks, system events, verify banner, attachments sheet, voice notes), contacts + fingerprint verification (3-step, QR compare), security center (device identity, vault status, encryption facts, honest limitations), security log, threat model, about, settings (auto-lock, backup, network, storage, destructive wipes with phrase confirm).
- PWA: manifest.webmanifest, sw.js (static-assets-only cache; dev registration disabled), iOS meta, security headers in next.config (CSP, HSTS, nosniff, DENY frame, no-referrer, permissions).
- Docs: README.md (architecture, crypto model, threat model, dev/testing) + SECURITY.md (assumptions, storage table, 10 honest limitations, checklist).
- Browser verification (agent-browser, TWO parallel sessions through the gateway :81): landing → onboarding (real PBKDF2 600k executed) → backup export (verified file downloaded) → connect (rendezvous code + QR registered on relay) → P2P: second identity joined via code → SECURE CHANNEL (signed ephemeral-ECDH handshake + HKDF) → E2EE text both directions with delivered acks → encrypted file attachment transferred in ciphertext chunks and decrypted → contact verification flow → full reload + unlock → complete history + attachments decrypted from IndexedDB → security center shows real data → desktop sidebar layout → sticky footer verified programmatically.

Bugs found & fixed during verification:
1. Backup step was skipped after onboarding (store phase race) → post-creation routes to Backup overlay.
2. Connect-pane switching left a pending session blocking Join → cancelSession on tab switch.
3. Host armed a 25s timeout while WAITING for a peer, silently killing channels → timeout now arms only at negotiation start (hosting is patient).
4. Chrome exports JWKs with key_ops that break re-import → wirePublicJwk strips to {kty,crv,x,y}.
5. THE handshake blocker: importEcdhPublic requested ['deriveBits'] on a public key — DataError; ECDH public keys must import with EMPTY usages.
6. completeHandshake failures were silent unhandled rejections → surfaced as honest error states.
7. Service worker cache-first on /_next/static served stale dev chunks → SW registration disabled in development.

Stage Summary:
- End-to-end verified: two independent browser sessions created identities, found each other through the ephemeral relay, established a real AES-256-GCM secure channel over WebRTC, exchanged encrypted text + files, persisted ciphertext locally, and restored everything after reload + unlock. All security states shown in the UI are real.
- lint ✓, tsc ✓, dev.log clean, signaling relay healthy on :3003.

---
Task ID: 13
Agent: main
Task: VIOLENT EDITION — 100x better look, transparent logo, GSAP animations, vulgar Afrikaans/Coloured slang, invisible scrollbars, mobile polish, GitHub push

Work Log:
- Logo surgery (scripts/strip-logo-bg.mjs): edge-connected flood-fill stripped the black background from FAST.png (soft alpha on boundary ring, interior blacks in guns/chains preserved), trimmed + squared to 1024px transparent PNG; regenerated icon set (16/32/48 transparent favicons; 180/192/512 black-backed for apple/maskable).
- Added gsap@3.15.0. New src/components/fx.tsx FX arsenal: HeroEmblem (logo slams in with screen shake + red muzzle flash), SlamText (ScrollTrigger slam lines with recoil), Reveal (directional fly-in w/ rotation + stagger), ParallaxGhost (scrubbed watermark), usePunch (click recoil). All respect prefers-reduced-motion.
- globals.css: ALL scrollbars hidden globally (html/body/*, Firefox + WebKit) while scrolling stays functional; VIOLENT EDITION utilities (blood-text, blood-panel, blood-glow, alert-flicker, marquee tracks, muzzle-flash, hard-blink, 44px touch targets); --alert pushed to #c81e1e.
- landing.tsx rebuilt: huge transparent emblem hero (min(76vw,340px) mobile / min(52vw,420px) desktop), per-letter slammed FAST GUNS title, blood tagline "MOER DIE SPYWARE.", aggressive Afrikaans/Coloured-slang copy throughout (fokken/moer/kak/poephool/sloerie/boet/ne/jou ne), dual marquee strips, manifesto slam section over parallax "187" ghost, 4 blood-panel feature cards flying in alternating directions, honest-spec chips (AES-256-GCM, ECDH P-256, PBKDF2 600k), "WAT ONS NIE CLAIM NIE" honesty panel, "GENOEG GEKAK PRAAT." CTA with blood-glow button. Sticky footer kept (mt-auto).
- shell.tsx: mobile top-bar logo 28→38px transparent w/ drop shadow, sidebar logo 44px + red "Moer die spyware" tagline, bottom-nav backdrop-blur-md.
- layout.tsx: aggressive SEO/OG description in Afrikaans slang.
- BUG FIX: dev server served stale globals.css (Turbopack persistent cache in .next) — new utilities missing from served chunk; killed server, rm -rf .next, restart → CSS correct.
- Verification (agent-browser): desktop 1440x900 — hero slam renders, blood-text computes correctly, manifesto/features/specs/honesty/CTA/footer all fire via ScrollTrigger, no console errors; CTA click → GSAP punch → onboarding opens; full onboarding (PBKDF2 600k) + backup download + lock/unlock round-trip passes. Mobile 390x844 — hero, stacked blood cards, marquee, full-width CTA, shell bottom nav all verified; scrollbar-width:none confirmed on html/body.
- GitHub: committed (16 files) and pushed to https://github.com/SHADRACHTHEFASTGUN/FAST-GUNS (repo created via API; token used inline only, NOT stored in .git/config; runtime data gitignored).

Stage Summary:
- Site is the VIOLENT EDITION: transparent emblem everywhere, GSAP-driven violent motion, zero visible scrollbars, mobile-first polish, fully Afrikaans/Coloured-slang aggressive copy while security claims stay honest.
- Live on GitHub: SHADRACHTHEFASTGUN/FAST-GUNS @ 1581a0b.
- NOTE: user's PAT was pasted in chat — recommend revoking/rotating it.
