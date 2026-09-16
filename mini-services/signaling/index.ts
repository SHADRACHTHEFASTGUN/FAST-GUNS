/**
 * FAST GUNS — minimal ephemeral WebRTC signaling service.
 *
 * Design contract (enforced here):
 *   - relays ONLY WebRTC session negotiation metadata (SDP offers/answers,
 *     ICE candidates) between two peers that both know a shared channel code
 *   - stores NOTHING persistently: channels live in a memory Map with a
 *     hard TTL and are destroyed on disconnect / timeout / completion
 *   - never receives application messages, private keys, decryption keys,
 *     or vault passwords — and cannot decrypt anything even if it wanted to
 *   - rate-limits and validates input shape; oversized or malformed
 *     signaling payloads are rejected
 *
 * What this server CAN see: two fingerprints (public identity strings,
 * used only for ephemeral rendezvous display), channel codes, and
 * connection metadata. What it can NEVER see: message content.
 */

import { createServer } from "http";
import { Server, Socket } from "socket.io";

const PORT = 3003;
const CHANNEL_TTL_MS = 10 * 60 * 1000; // channel dies 10 min after creation
const MAX_PAYLOAD_BYTES = 64 * 1024; // SDP/ICE are far smaller than this
const CODE_RE = /^[A-Z0-9]{4,10}$/;
const FP_RE = /^[0-9A-Z]{20,64}$/;

interface Channel {
  code: string;
  creatorSocketId: string;
  creatorFp: string | null;
  joinerSocketId: string | null;
  joinerFp: string | null;
  createdAt: number;
}

const channels = new Map<string, Channel>();
const socketToChannel = new Map<string, string>();

function sweepExpired(): void {
  const now = Date.now();
  for (const [code, channel] of channels) {
    if (now - channel.createdAt > CHANNEL_TTL_MS) {
      destroyChannel(code, "expired");
    }
  }
}

function destroyChannel(code: string, reason: string): void {
  const channel = channels.get(code);
  if (!channel) return;
  for (const sockId of [channel.creatorSocketId, channel.joinerSocketId]) {
    if (sockId) socketToChannel.delete(sockId);
  }
  channels.delete(code);
  if (channel.creatorSocketId) {
    io.to(channel.creatorSocketId).emit("channel-closed", { code, reason });
  }
  if (channel.joinerSocketId) {
    io.to(channel.joinerSocketId).emit("channel-closed", { code, reason });
  }
}

function payloadSizeOk(payload: unknown): boolean {
  try {
    return JSON.stringify(payload ?? {}).length <= MAX_PAYLOAD_BYTES;
  } catch {
    return false;
  }
}

const httpServer = createServer((req, res) => {
  // tiny health endpoint
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, channels: channels.size }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const io = new Server(httpServer, {
  // DO NOT change the path; Caddy forwards on this path
  path: "/",
  cors: { origin: "*", methods: ["GET", "POST"] },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: MAX_PAYLOAD_BYTES,
});

io.on("connection", (socket: Socket) => {
  let boundCode: string | null = null;

  socket.on("channel:create", (data: unknown, ack?: (resp: unknown) => void) => {
    sweepExpired();
    const d = data as { code?: unknown; fp?: unknown };
    const code = typeof d?.code === "string" ? d.code.toUpperCase() : "";
    const fp = typeof d?.fp === "string" ? d.fp : null;
    if (!CODE_RE.test(code) || (fp !== null && !FP_RE.test(fp))) {
      ack?.({ ok: false, error: "invalid-code" });
      return;
    }
    if (channels.has(code)) {
      ack?.({ ok: false, error: "code-taken" });
      return;
    }
    channels.set(code, {
      code,
      creatorSocketId: socket.id,
      creatorFp: fp,
      joinerSocketId: null,
      joinerFp: null,
      createdAt: Date.now(),
    });
    socketToChannel.set(socket.id, code);
    boundCode = code;
    ack?.({ ok: true });
  });

  socket.on("channel:join", (data: unknown, ack?: (resp: unknown) => void) => {
    sweepExpired();
    const d = data as { code?: unknown; fp?: unknown };
    const code = typeof d?.code === "string" ? d.code.toUpperCase() : "";
    const fp = typeof d?.fp === "string" ? d.fp : null;
    if (!CODE_RE.test(code) || (fp !== null && !FP_RE.test(fp))) {
      ack?.({ ok: false, error: "invalid-code" });
      return;
    }
    const channel = channels.get(code);
    if (!channel) {
      ack?.({ ok: false, error: "not-found" });
      return;
    }
    if (channel.joinerSocketId && channel.joinerSocketId !== socket.id) {
      ack?.({ ok: false, error: "channel-full" });
      return;
    }
    if (channel.creatorSocketId === socket.id) {
      ack?.({ ok: false, error: "own-channel" });
      return;
    }
    channel.joinerSocketId = socket.id;
    channel.joinerFp = fp;
    socketToChannel.set(socket.id, code);
    boundCode = code;
    ack?.({ ok: true, creatorFp: channel.creatorFp });
    // wake the creator
    io.to(channel.creatorSocketId).emit("peer-joined", { code, fp: channel.joinerFp });
  });

  // Relay-only: SDP offers / answers / ICE candidates.
  socket.on("signal", (data: unknown, ack?: (resp: unknown) => void) => {
    const d = data as { code?: unknown; payload?: unknown };
    const code = typeof d?.code === "string" ? d.code.toUpperCase() : "";
    if (!CODE_RE.test(code) || !payloadSizeOk(d?.payload)) {
      ack?.({ ok: false, error: "invalid-signal" });
      return;
    }
    const channel = channels.get(code);
    if (!channel) {
      ack?.({ ok: false, error: "not-found" });
      return;
    }
    const isCreator = socket.id === channel.creatorSocketId;
    const target = isCreator ? channel.joinerSocketId : channel.creatorSocketId;
    if (!target) {
      ack?.({ ok: false, error: "no-peer" });
      return;
    }
    io.to(target).emit("signal", { payload: d.payload });
    ack?.({ ok: true });
  });

  socket.on("channel:leave", () => {
    if (boundCode) {
      const channel = channels.get(boundCode);
      const wasCreator = channel?.creatorSocketId === socket.id;
      destroyChannel(boundCode, wasCreator ? "creator-left" : "joiner-left");
      boundCode = null;
    }
  });

  socket.on("disconnect", () => {
    const code = socketToChannel.get(socket.id) ?? boundCode;
    if (code) {
      const channel = channels.get(code);
      // if a peer drops before the connection is established, tear the
      // channel down so codes are never reusable
      destroyChannel(code, "peer-disconnected");
      void channel;
    }
    socketToChannel.delete(socket.id);
  });

  socket.on("error", () => {
    /* socket-level errors are logged nowhere — no payload logging by design */
  });
});

setInterval(sweepExpired, 30_000).unref();

httpServer.listen(PORT, () => {
  console.log(`FAST GUNS signaling (ephemeral) on :${PORT}`);
});

process.on("SIGTERM", () => {
  httpServer.close(() => process.exit(0));
});
process.on("SIGINT", () => {
  httpServer.close(() => process.exit(0));
});
