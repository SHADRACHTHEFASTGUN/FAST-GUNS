/**
 * FAST GUNS — signaling client.
 *
 * Connects to the ephemeral signaling service and exposes a minimal
 * promise-based API. Only WebRTC negotiation payloads ever pass through
 * here — by construction this layer has no access to message content
 * or cryptographic material.
 */

import { io, Socket } from "socket.io-client";

export type SignalingError =
  | "invalid-code"
  | "code-taken"
  | "not-found"
  | "channel-full"
  | "own-channel"
  | "invalid-signal"
  | "no-peer"
  | "connect-failed";

interface Ack<T> {
  ok: boolean;
  error?: SignalingError;
  creatorFp?: string | null;
  value?: T;
}

export interface SignalingEvents {
  onPeerJoined: (fp: string | null) => void;
  onSignal: (payload: unknown) => void;
  onChannelClosed: (reason: string) => void;
  onDisconnected: () => void;
  onConnected: () => void;
}

const SIGNALING_PATH = "/?XTransformPort=3003";

export class SignalingClient {
  private socket: Socket | null = null;
  private events: Partial<SignalingEvents> = {};

  on<K extends keyof SignalingEvents>(event: K, handler: SignalingEvents[K]): void {
    this.events[event] = handler;
  }

  private emit<K extends keyof SignalingEvents>(event: K, ...args: Parameters<SignalingEvents[K]>): void {
    const handler = this.events[event];
    if (handler) {
      (handler as (...a: unknown[]) => void)(...args);
    }
  }

  async connect(): Promise<void> {
    if (this.socket?.connected) return;
    await new Promise<void>((resolve, reject) => {
      const socket = io(SIGNALING_PATH, {
        transports: ["websocket", "polling"],
        forceNew: true,
        reconnection: false, // sessions are ephemeral — user retries explicitly
        timeout: 10000,
      });
      const timer = setTimeout(() => {
        socket.close();
        reject(new Error("connect-failed"));
      }, 12000);
      socket.on("connect", () => {
        clearTimeout(timer);
        this.socket = socket;
        this.bind(socket);
        this.emit("onConnected");
        resolve();
      });
      socket.on("connect_error", () => {
        clearTimeout(timer);
        reject(new Error("connect-failed"));
      });
    });
  }

  private bind(socket: Socket): void {
    socket.on("peer-joined", (data: { fp: string | null }) => {
      this.emit("onPeerJoined", data?.fp ?? null);
    });
    socket.on("signal", (data: { payload: unknown }) => {
      this.emit("onSignal", data?.payload);
    });
    socket.on("channel-closed", (data: { reason: string }) => {
      this.emit("onChannelClosed", data?.reason ?? "unknown");
    });
    socket.on("disconnect", () => {
      this.emit("onDisconnected");
    });
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  createChannel(code: string, fp: string | null): Promise<void> {
    return this.call("channel:create", { code, fp });
  }

  joinChannel(code: string, fp: string | null): Promise<string | null> {
    return this.call<{ creatorFp: string | null }>("channel:join", { code, fp }).then(
      (res) => res?.creatorFp ?? null
    );
  }

  signal(code: string, payload: unknown): Promise<void> {
    return this.call("signal", { code, payload });
  }

  leave(): void {
    if (this.socket?.connected) {
      this.socket.emit("channel:leave");
    }
  }

  destroy(): void {
    this.leave();
    this.socket?.removeAllListeners();
    this.socket?.close();
    this.socket = null;
    this.events = {};
  }

  private call<T = void>(event: string, data: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("not-connected"));
        return;
      }
      const timer = setTimeout(() => reject(new Error("signal-timeout")), 15000);
      this.socket.emit(event, data, (resp: Ack<T>) => {
        clearTimeout(timer);
        if (resp?.ok) {
          resolve(resp.value ?? (resp as unknown as T));
        } else {
          reject(new Error(resp?.error ?? "signal-error"));
        }
      });
    });
  }
}

/** Human-friendly, unambiguous rendezvous code (Crockford base32). */
const CODE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

export function generateChannelCode(length = 6): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}
