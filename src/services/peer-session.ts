/**
 * FAST GUNS — WebRTC peer session.
 *
 * Owns the full lifecycle of one peer-to-peer session:
 *
 *   rendezvous (ephemeral signaling) ─▶ WebRTC negotiation ─▶
 *   DataChannel ─▶ signed ephemeral-ECDH handshake ─▶
 *   AES-256-GCM encrypted frames ─▶ chunked encrypted attachments
 *
 * Security invariants enforced here:
 *   - the DataChannel only ever carries: hello bundles (public keys +
 *     signatures), session-key-encrypted frames, per-file ciphertext
 *     chunks, and acks — never plaintext application messages
 *   - the session is marked "secure" ONLY after the handshake succeeded
 *     (signature verification + fingerprint check + key derivation)
 *   - identity-key change vs a saved contact/invite raises an alert and
 *     refuses to silently replace the stored key
 *   - unknown/binary input that cannot be parsed is dropped, not parsed
 *     further (fail closed)
 */

import type {
  ChatMessage,
  ConnectionState,
  Fingerprint,
  Identity,
  IdentityRole,
  WireAck,
  WireFileEnd,
  WireFileStart,
  WireMessage,
} from "@/types";
import { encryptFile, decryptFile, sliceChunks, type FileMeta } from "@/crypto/files";
import { randomUuid, toBase64Url, fromBase64Url } from "@/crypto/primitives";
import { createHello, establishSession, encryptFrame, decryptFrame, encryptMetadata, decryptMetadata, parseHello, type SecureSession } from "@/crypto/session";
import { SignalingClient, generateChannelCode } from "./signaling-client";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
];

const CONNECT_TIMEOUT_MS = 25_000;
const HANDSHAKE_TIMEOUT_MS = 15_000;
const BACKPRESSURE_LIMIT = 1_048_576; // 1 MiB

export interface PeerSessionEvents {
  onState: (state: ConnectionState, detail?: string) => void;
  onSecure: (info: { peerFp: Fingerprint; peerName: string }) => void;
  onIncoming: (message: ChatMessage) => void;
  onDeliveryAck: (messageId: string) => void;
  onClosed: (reason: string) => void;
}

export interface InvitePayload {
  v: 1;
  app: "fastguns";
  code: string;
  fp: Fingerprint;
  name: string;
}

export function encodeInvite(invite: InvitePayload): string {
  return `FG1-${toBase64Url(new TextEncoder().encode(JSON.stringify(invite)))}`;
}

export function decodeInvite(text: string): InvitePayload | null {
  try {
    const trimmed = text.trim();
    if (!trimmed.startsWith("FG1-")) return null;
    const json = new TextDecoder().decode(fromBase64Url(trimmed.slice(4)));
    const parsed = JSON.parse(json) as Partial<InvitePayload>;
    if (parsed?.v !== 1 || parsed?.app !== "fastguns" || !parsed.code || !parsed.fp) {
      return null;
    }
    return parsed as InvitePayload;
  } catch {
    return null;
  }
}

interface IncomingFileBuffer {
  meta: FileMeta;
  chunks: Uint8Array[];
  received: number;
}

export interface PeerIdentityInfo {
  fp: Fingerprint;
  name: string;
  idEcdhPub: JsonWebKey;
  idEcdsaPub: JsonWebKey;
}

export class PeerSession {
  private signaling = new SignalingClient();
  private pc: RTCPeerConnection | null = null;
  private dc: RTCDataChannel | null = null;
  private session: SecureSession | null = null;
  private identity: Identity;
  private role: IdentityRole = "initiator";
  private code: string | null = null;
  private expectedFp: Fingerprint | null = null;
  private events: PeerSessionEvents;
  private helloSent = false;
  private peerHelloRaw: string | null = null;
  private pendingIce: RTCIceCandidateInit[] = [];
  private remoteReady = false;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null;
  private incomingFile: IncomingFileBuffer | null = null;
  private closed = false;

  constructor(identity: Identity, events: PeerSessionEvents) {
    this.identity = identity;
    this.events = events;
  }

  /** replace event handlers (used by the store after construction) */
  setEvents(events: PeerSessionEvents): void {
    this.events = events;
  }

  get connectionCode(): string | null {
    return this.code;
  }

  get state(): ConnectionState {
    if (!this.pc && !this.code) return "offline";
    if (this.session) return "secure";
    return "connecting";
  }

  get isSecure(): boolean {
    return this.session !== null;
  }

  get peerFp(): Fingerprint | null {
    return this.session?.peerFp ?? null;
  }

  /** full peer identity captured from the verified handshake */
  peerIdentity(): PeerIdentityInfo | null {
    if (!this.session) return null;
    return {
      fp: this.session.peerFp,
      name: this.session.peerName,
      idEcdhPub: this.session.peerIdEcdhPub,
      idEcdsaPub: this.session.peerIdEcdsaPub,
    };
  }

  expectedFingerprint(): Fingerprint | null {
    return this.expectedFp;
  }

  /** Start as the peer that CREATES the rendezvous channel (initiator). */
  async host(expectedFp: Fingerprint | null): Promise<string> {
    this.role = "initiator";
    this.expectedFp = expectedFp;
    const code = generateChannelCode(6);
    this.code = code;
    this.setState("discovering-peer");
    await this.signaling.connect();
    await this.signaling.createChannel(code, this.identity.fingerprint);
    this.signaling.on("onPeerJoined", () => {
      void this.negotiate();
    });
    this.signaling.on("onSignal", (payload) => void this.onSignal(payload));
    this.signaling.on("onChannelClosed", (reason) => this.handleClosed(reason));
    this.signaling.on("onDisconnected", () => this.handleClosed("signaling-lost"));
    // NOTE: no global timeout while WAITING for a peer — hosting is an
    // explicit, patient state. The negotiation timer arms once a peer
    // actually joins.
    return code;
  }

  /** Start as the peer that JOINS an existing channel (responder). */
  async join(code: string, expectedFp: Fingerprint | null, claimedCreatorFp: Fingerprint | null): Promise<void> {
    this.role = "responder";
    this.code = code.toUpperCase();
    this.expectedFp = expectedFp ?? claimedCreatorFp;
    this.setState("discovering-peer");
    await this.signaling.connect();
    const creatorFp = await this.signaling.joinChannel(this.code, this.identity.fingerprint);
    if (this.expectedFp === null && creatorFp) {
      this.expectedFp = creatorFp;
    }
    this.signaling.on("onSignal", (payload) => void this.onSignal(payload));
    this.signaling.on("onChannelClosed", (reason) => this.handleClosed(reason));
    this.signaling.on("onDisconnected", () => this.handleClosed("signaling-lost"));
    this.armTimeouts();
  }

  private armTimeouts(): void {
    this.connectTimer = setTimeout(() => {
      if (!this.session && !this.closed) {
        this.setState("error", "Connection timed out. The peer may not be online.");
        this.teardown("timeout");
      }
    }, CONNECT_TIMEOUT_MS);
  }

  private async negotiate(): Promise<void> {
    try {
      this.setState("connecting");
      // peer is here — WebRTC negotiation must complete within the timeout
      this.connectTimer = setTimeout(() => {
        if (!this.session && !this.closed) {
          this.setState("error", "Connection timed out during negotiation.");
          this.teardown("timeout");
        }
      }, CONNECT_TIMEOUT_MS);
      this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      const dc = this.pc.createDataChannel("fg-secure", { ordered: true });
      this.bindDataChannel(dc);
      this.pc.onicecandidate = (evt) => {
        if (evt.candidate && this.code) {
          void this.signaling
            .signal(this.code, { type: "ice", candidate: evt.candidate.toJSON() })
            .catch(() => undefined);
        }
      };
      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);
      await this.signaling.signal(this.code!, { type: "offer", sdp: offer.sdp });
    } catch {
      this.setState("error", "Could not negotiate a peer connection.");
      this.teardown("negotiation-failed");
    }
  }

  private async onSignal(payload: unknown): Promise<void> {
    if (this.closed || !this.code) return;
    try {
      const sig = payload as { type?: string; sdp?: string; candidate?: RTCIceCandidateInit };
      if (sig.type === "offer" && typeof sig.sdp === "string") {
        if (this.role !== "responder") return;
        this.setState("connecting");
        this.pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        this.pc.ondatachannel = (evt) => this.bindDataChannel(evt.channel);
        this.pc.onicecandidate = (evt) => {
          if (evt.candidate) {
            void this.signaling
              .signal(this.code!, { type: "ice", candidate: evt.candidate.toJSON() })
              .catch(() => undefined);
          }
        };
        await this.pc.setRemoteDescription({ type: "offer", sdp: sig.sdp });
        for (const cand of this.pendingIce.splice(0)) {
          try {
            await this.pc.addIceCandidate(cand);
          } catch {
            /* stale candidate */
          }
        }
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        await this.signaling.signal(this.code, { type: "answer", sdp: answer.sdp });
        this.remoteReady = true;
      } else if (sig.type === "answer" && typeof sig.sdp === "string") {
        if (this.role !== "initiator" || !this.pc) return;
        await this.pc.setRemoteDescription({ type: "answer", sdp: sig.sdp });
        for (const cand of this.pendingIce.splice(0)) {
          try {
            await this.pc.addIceCandidate(cand);
          } catch {
            /* stale candidate */
          }
        }
        this.remoteReady = true;
      } else if (sig.type === "ice" && sig.candidate) {
        if (this.pc?.remoteDescription) {
          try {
            await this.pc.addIceCandidate(sig.candidate);
          } catch {
            /* stale candidate */
          }
        } else {
          this.pendingIce.push(sig.candidate);
        }
      }
    } catch {
      this.setState("error", "WebRTC negotiation failed.");
      this.teardown("negotiation-failed");
    }
  }

  private bindDataChannel(dc: RTCDataChannel): void {
    this.dc = dc;
    dc.binaryType = "arraybuffer";
    dc.onopen = () => {
      void this.runHandshake();
    };
    dc.onmessage = (evt) => void this.onDataChannelMessage(evt.data);
    dc.onclose = () => {
      if (!this.closed) {
        this.events.onState("disconnected");
        this.events.onClosed("datachannel-closed");
      }
    };
    dc.onerror = () => {
      if (!this.closed) this.events.onState("error", "Data channel error.");
    };
  }

  private async runHandshake(): Promise<void> {
    if (this.helloSent) return;
    this.helloSent = true;
    this.setState("connected", "Generating session keys…");
    this.handshakeTimer = setTimeout(() => {
      if (!this.session && !this.closed) {
        this.setState("error", "Secure handshake did not complete.");
        this.teardown("handshake-timeout");
      }
    }, HANDSHAKE_TIMEOUT_MS);

    const { hello, ephemeralPriv } = await createHello(this.identity, this.role);
    this.ephemeralPriv = ephemeralPriv;
    this.dc?.send(JSON.stringify(hello));
    this.setState("connected", "Verifying peer identity…");

    // if we are the responder and peer hello arrived before DC open, use it now
    if (this.peerHelloRaw) {
      await this.completeHandshake(this.peerHelloRaw);
    }
  }

  private async onDataChannelMessage(data: unknown): Promise<void> {
    if (typeof data === "string") {
      let parsed: unknown;
      try {
        parsed = JSON.parse(data);
      } catch {
        return; // fail closed
      }
      const wire = parsed as WireMessage;
      if (wire && (wire as { t?: string }).t === "hello") {
        this.setState("connected", "Peer identity received — verifying signature…");
        this.peerHelloRaw = data;
        await this.completeHandshake(data);
        return;
      }
      if (!this.session) return; // nothing else is accepted before the handshake
      try {
        switch (wire.t) {
          case "m": {
            const plain = await decryptFrame(this.session, wire);
            this.events.onIncoming({
              id: randomUuid(),
              conversationId: this.conversationIdFor(wire.fp),
              senderFp: wire.fp,
              kind: "text",
              text: plain,
              timestamp: Date.now(),
              delivered: true,
              direction: "incoming",
            });
            break;
          }
          case "fs": {
            const meta = await decryptMetadata<FileMeta>(
              this.session,
              { iv: wire.iv, ct: wire.ct },
              wire.seq
            );
            this.incomingFile = { meta, chunks: [], received: 0 };
            break;
          }
          case "fe": {
            await this.finishIncomingFile(wire);
            break;
          }
          case "ack": {
            this.events.onDeliveryAck((wire as WireAck).id);
            break;
          }
          default:
            break;
        }
      } catch {
        // honest failure: drop the frame, never render unverified content
        this.events.onState("secure", "A frame failed to decrypt and was dropped.");
      }
      return;
    }

    // binary → attachment ciphertext chunk
    if (data instanceof ArrayBuffer && this.incomingFile) {
      const buf = this.incomingFile;
      buf.chunks.push(new Uint8Array(data));
      buf.received += data.byteLength;
    }
  }
  private conversationIdFor(peerFp: Fingerprint): string {
    const sorted = [this.identity.fingerprint, peerFp].sort();
    return `c_${sorted[0].slice(0, 16)}_${sorted[1].slice(0, 16)}`;
  }

  private async finishIncomingFile(wire: WireFileEnd): Promise<void> {
    const buf = this.incomingFile;
    this.incomingFile = null;
    if (!buf || wire.id !== buf.meta.id) return;
    try {
      const total = new Uint8Array(buf.received);
      let offset = 0;
      for (const chunk of buf.chunks) {
        total.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const blob = await decryptFile(total, buf.meta.keyB64, buf.meta.ivB64);
      this.events.onIncoming({
        id: randomUuid(),
        conversationId: this.conversationIdFor(this.session!.peerFp),
        senderFp: this.session!.peerFp,
        kind: buf.meta.kind === "voice" ? "voice" : buf.meta.kind,
        text: undefined,
        attachment: {
          id: buf.meta.id,
          name: buf.meta.name,
          mime: buf.meta.mime,
          size: buf.meta.size,
        },
        // file key persisted ONLY inside the DEK-encrypted local record
        fileKeyB64: buf.meta.keyB64,
        fileIvB64: buf.meta.ivB64,
        timestamp: Date.now(),
        delivered: true,
        direction: "incoming",
      });
      // hand ciphertext + decrypted blob to the store for persistence & display
      this.onIncomingAttachment?.(buf.meta, total, blob);
    } catch {
      this.events.onState("secure", "An attachment failed to decrypt and was discarded.");
    }
  }

  /** set by the store: persist ciphertext, create display URL for the blob */
  onIncomingAttachment: ((meta: FileMeta, ciphertext: Uint8Array, blob: Blob) => void) | null = null;

  private async completeHandshake(raw: string): Promise<void> {
    if (this.session) return;
    try {
      const parsed = parseHello(raw);
      if (!parsed.ok || !parsed.hello) {
        this.setState("error", "Peer identity could not be verified.");
        this.teardown("bad-hello");
        return;
      }
      const result = await establishSession(
        this.identity,
        this.role,
        await this.ephemeralPrivForHandshake(),
        parsed.hello,
        this.expectedFp
      );
      if (!result.ok || !result.session) {
        if (result.reason === "fingerprint-mismatch") {
          this.onIdentityMismatch?.(parsed.hello.fp);
          this.setState("error", "IDENTITY MISMATCH — this peer is not the identity you expected.");
        } else {
          this.setState("error", "Secure handshake failed.");
        }
        this.teardown("handshake-failed");
        return;
      }
      this.session = result.session;
      if (this.connectTimer) clearTimeout(this.connectTimer);
      if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
      this.setState("secure");
      this.events.onSecure({ peerFp: this.session.peerFp, peerName: this.session.peerName });
    } catch (err) {
      // never let a handshake failure pass silently — surface an honest error
      const detail = err instanceof Error ? `Secure handshake failed (${err.name}).` : "Secure handshake failed.";
      this.setState("error", detail);
      this.teardown("handshake-exception");
    }
  }

  /** set by the store to raise SECURITY ALERT when keys changed */
  onIdentityMismatch: ((actualFp: Fingerprint) => void) | null = null;

  private ephemeralPriv: CryptoKey | null = null;

  private async ephemeralPrivForHandshake(): Promise<CryptoKey> {
    if (!this.ephemeralPriv) throw new Error("missing-ephemeral");
    return this.ephemeralPriv;
  }

  async sendText(text: string): Promise<ChatMessage | null> {
    if (!this.session || !this.dc || this.dc.readyState !== "open") return null;
    const frame = await encryptFrame(this.session, text, this.identity.fingerprint);
    const message: ChatMessage = {
      id: randomUuid(),
      conversationId: this.conversationIdFor(this.session.peerFp),
      senderFp: this.identity.fingerprint,
      kind: "text",
      text,
      timestamp: Date.now(),
      delivered: false,
      direction: "outgoing",
    };
    this.dc.send(JSON.stringify({ ...frame, ref: message.id }));
    this.dc.send(JSON.stringify({ t: "ack", id: message.id, fp: this.identity.fingerprint }));
    return message;
  }

  async sendAttachment(
    file: File | Blob,
    name: string,
    kind: FileMeta["kind"]
  ): Promise<ChatMessage | null> {
    if (!this.session || !this.dc || this.dc.readyState !== "open") return null;
    const encrypted = await encryptFile(file, name, kind);
    const meta: FileMeta = {
      id: encrypted.id,
      name,
      mime: file.type || "application/octet-stream",
      size: file.size,
      kind,
      keyB64: encrypted.keyB64,
      ivB64: encrypted.ivB64,
      chunkCount: encrypted.chunkCount,
    };
    const envelope = await encryptMetadata(this.session, meta, this.identity.fingerprint);
    const message: ChatMessage = {
      id: randomUuid(),
      conversationId: this.conversationIdFor(this.session.peerFp),
      senderFp: this.identity.fingerprint,
      kind: meta.kind === "voice" ? "voice" : meta.kind,
      attachment: { id: meta.id, name: meta.name, mime: meta.mime, size: meta.size },
      fileKeyB64: meta.keyB64,
      fileIvB64: meta.ivB64,
      timestamp: Date.now(),
      delivered: false,
      direction: "outgoing",
    };
    this.sentCiphertexts.set(meta.id, encrypted.data);
    this.dc.send(
      JSON.stringify({
        t: "fs",
        id: meta.id,
        iv: envelope.iv,
        ct: envelope.ct,
        seq: envelope.seq,
        fp: this.identity.fingerprint,
      })
    );
    for (const chunk of sliceChunks(encrypted.data)) {
      await this.drain();
      // slice() gives each chunk its own exact-size ArrayBuffer copy
      this.dc.send(chunk.slice().buffer as ArrayBuffer);
    }
    this.dc.send(
      JSON.stringify({ t: "fe", id: meta.id, fp: this.identity.fingerprint })
    );
    this.dc.send(JSON.stringify({ t: "ack", id: message.id, fp: this.identity.fingerprint }));
    return message;
  }

  /** retrieve (and stop retaining) the ciphertext of a just-sent attachment */
  consumeSentCiphertext(id: string): Uint8Array | null {
    const data = this.sentCiphertexts.get(id) ?? null;
    this.sentCiphertexts.delete(id);
    return data;
  }

  private sentCiphertexts = new Map<string, Uint8Array>();

  private drain(): Promise<void> {
    const dc = this.dc;
    if (!dc || dc.bufferedAmount < BACKPRESSURE_LIMIT) return Promise.resolve();
    return new Promise((resolve) => {
      const handler = () => {
        dc.removeEventListener("bufferedamountlow", handler);
        resolve();
      };
      dc.addEventListener("bufferedamountlow", handler);
      dc.bufferedAmountLowThreshold = 262_144;
      // safety valve
      setTimeout(handler, 3000);
    });
  }

  private setState(state: ConnectionState, detail?: string): void {
    this.events.onState(state, detail);
  }

  private handleClosed(reason: string): void {
    if (this.closed) return;
    this.events.onState("disconnected");
    this.events.onClosed(reason);
  }

  close(): void {
    this.teardown("user-closed");
  }

  private teardown(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    if (this.connectTimer) clearTimeout(this.connectTimer);
    if (this.handshakeTimer) clearTimeout(this.handshakeTimer);
    try {
      this.dc?.close();
    } catch {
      /* already closed */
    }
    try {
      this.pc?.close();
    } catch {
      /* already closed */
    }
    this.signaling.destroy();
    this.dc = null;
    this.pc = null;
    this.session = null;
    this.ephemeralPriv = null;
    this.events.onClosed(reason);
  }
}
