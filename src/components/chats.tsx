"use client";

/**
 * FAST GUNS — chats list + new connection flow.
 * Connection = ephemeral rendezvous (6-char code / QR / paste) → WebRTC →
 * signed handshake → secure channel. Nothing here fakes a connection.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app-store";
import type { Contact, Conversation } from "@/types";
import {
  CopyButton,
  FingerprintText,
  QrDisplay,
  ScreenHeader,
  Spinner,
  StatePill,
  VerifiedBadge,
} from "@/components/common";
import { decodeInvite } from "@/services/peer-session";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  Link2,
  QrCode,
  Radio,
  ClipboardPaste,
  Plus,
  ScanLine,
  UserRound,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* chats list                                                          */
/* ------------------------------------------------------------------ */

export function ChatList() {
  const conversations = useAppStore((s) => s.conversations);
  const contacts = useAppStore((s) => s.contacts);
  const messages = useAppStore((s) => s.messages);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const openChatWithContact = useAppStore((s) => s.openChatWithContact);

  const sorted = useMemo(
    () =>
      [...conversations].sort(
        (a, b) => (b.lastMessageAt ?? b.createdAt) - (a.lastMessageAt ?? a.createdAt)
      ),
    [conversations]
  );

  return (
    <div className="fade-up">
      <ScreenHeader
        title="Chats"
        subtitle={`${conversations.length} local ${conversations.length === 1 ? "conversation" : "conversations"} · encrypted on this device`}
        right={
          <Button
            size="sm"
            onClick={() => openOverlay({ name: "connect" })}
            className="h-9 gap-1.5 rounded-lg bg-primary font-mono text-[10px] font-semibold tracking-[0.18em] text-primary-foreground uppercase hover:bg-silver"
          >
            <Plus className="size-3.5" /> Connect
          </Button>
        }
      />

      {sorted.length === 0 ? (
        <div className="metal-panel flex flex-col items-center rounded-xl px-6 py-14 text-center">
          <Image
            src="/fastguns-logo.png"
            alt=""
            width={72}
            height={72}
            className="mb-5 rounded-xl opacity-80"
          />
          <h2 className="font-mono text-[12px] font-semibold tracking-[0.24em] text-silver uppercase">
            Private channel
          </h2>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            Messages are encrypted locally before transmission. No conversation
            history exists yet — connect with a peer to start one.
          </p>
          <Button
            onClick={() => openOverlay({ name: "connect" })}
            className="mt-6 h-11 rounded-xl font-mono text-[11px] tracking-[0.2em] uppercase"
          >
            <Radio className="size-4" /> Start secure chat
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((convo) => {
            const contact = contacts.find((c) => c.id === convo.contactId);
            if (!contact) return null;
            return (
              <li key={convo.id}>
                <ChatRow
                  convo={convo}
                  contact={contact}
                  preview={lastPreview(messages[convo.id])}
                  onOpen={() => openChatWithContact(contact.id)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function lastPreview(list?: { kind: string; text?: string; attachment?: { name: string }; direction: string }[]): string {
  const last = list?.[list.length - 1];
  if (!last) return "—";
  if (last.kind === "system") return "Security event";
  if (last.attachment) {
    if (last.kind === "voice") return "🎤 Voice note";
    return `📎 ${last.attachment.name}`;
  }
  return last.text ?? "—";
}

function ChatRow({
  convo,
  contact,
  preview,
  onOpen,
}: {
  convo: Conversation;
  contact: Contact;
  preview: string;
  onOpen: () => void;
}) {
  const time = convo.lastMessageAt ?? convo.createdAt;
  return (
    <button
      onClick={onOpen}
      className="metal-panel flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-colors hover:border-metal/30"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated font-mono text-[14px] font-semibold text-silver">
        {(contact.name || "?").slice(0, 1).toUpperCase()}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-[14px] font-medium text-foreground">{contact.name}</span>
          {contact.verified ? <VerifiedBadge verified /> : null}
        </span>
        <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">{preview}</span>
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1.5">
        <span className="font-mono text-[10px] text-muted-foreground">
          {new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        {convo.unread > 0 ? (
          <span className="min-w-5 rounded-full bg-silver px-1.5 text-center font-mono text-[10px] font-bold leading-5 text-ink">
            {convo.unread}
          </span>
        ) : null}
      </span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* connect overlay                                                     */
/* ------------------------------------------------------------------ */

type ConnectMode = "invite" | "code" | "paste" | "scan";

export function ConnectOverlay() {
  const [mode, setMode] = useState<ConnectMode>("invite");
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const cancelSession = useAppStore((s) => s.cancelSession);

  const switchMode = (next: ConnectMode) => {
    if (next !== mode) {
      // switching panes abandons any in-flight rendezvous (honest state)
      cancelSession();
      setMode(next);
    }
  };

  const leave = () => {
    cancelSession();
    closeOverlay();
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-border/70 px-4 pt-safe lg:rounded-t-2xl lg:border lg:px-5">
        <Button
          variant="outline"
          size="icon"
          onClick={leave}
          className="size-9 shrink-0 rounded-lg border-input text-silver"
          aria-label="Back"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="flex-1 py-3.5">
          <h1 className="font-mono text-[12px] font-semibold tracking-[0.24em] text-silver uppercase">
            New secure connection
          </h1>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Ephemeral rendezvous · keys never touch the relay
          </p>
        </div>
      </header>

      <div className="px-4 pt-4 lg:px-5">
        <div className="grid grid-cols-4 gap-1 rounded-xl border border-border bg-surface p-1" role="tablist">
          {(
            [
              { id: "invite", label: "Invite", icon: Radio },
              { id: "code", label: "Code", icon: Link2 },
              { id: "paste", label: "Paste", icon: ClipboardPaste },
              { id: "scan", label: "Scan", icon: QrCode },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={mode === t.id}
              onClick={() => switchMode(t.id)}
              className={cn(
                "flex min-h-[40px] items-center justify-center gap-1.5 rounded-lg font-mono text-[10px] tracking-[0.14em] uppercase transition-colors",
                mode === t.id ? "bg-charcoal text-silver shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]" : "text-muted-foreground hover:text-silver"
              )}
            >
              <t.icon className="size-3.5" />
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 px-4 pb-28 pt-4 lg:px-5 lg:pb-6">
        {mode === "invite" ? <InvitePane /> : null}
        {mode === "code" ? <CodePane /> : null}
        {mode === "paste" ? <PastePane /> : null}
        {mode === "scan" ? <ScanPane /> : null}
      </div>
    </div>
  );
}

function InvitePane() {
  const connection = useAppStore((s) => s.connection);
  const hostSession = useAppStore((s) => s.hostSession);
  const inviteString = useAppStore((s) => s.inviteString);
  const identityName = useAppStore((s) => s.identityPublic?.name ?? "");
  const startedRef = useRef(false);

  const code = connection.code;

  useEffect(() => {
    // host a session once when the invite pane opens
    if (startedRef.current) return;
    startedRef.current = true;
    void hostSession();
  }, [hostSession]);

  const states = connection.state;

  return (
    <div className="fade-up">
      <div className="metal-panel flex flex-col items-center rounded-xl p-6">
        <p className="mb-3 font-mono text-[10px] tracking-[0.24em] text-metal uppercase">
          Rendezvous code
        </p>
        {code ? (
          <p className="font-mono text-[34px] font-bold tracking-[0.22em] text-silver tabular">
            {code}
          </p>
        ) : (
          <Spinner className="my-3 size-6" />
        )}
        <p className="mt-2 text-center text-[12px] leading-relaxed text-muted-foreground">
          Share this code — or the QR — through any channel you already trust.
          The code only helps peers find each other; it is not a secret key.
        </p>
        {code ? (
          <div className="mt-5">
            <QrDisplay payload={inviteString() || code} size={188} />
          </div>
        ) : null}
        {code ? (
          <div className="mt-4 flex gap-2">
            <CopyButton value={code} label="Code" />
            <CopyButton value={inviteString()} label="Invite" />
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
        <div className="flex items-center gap-3">
          {states === "discovering-peer" ? <Spinner /> : null}
          <div>
            <p className="font-mono text-[10px] tracking-[0.18em] text-metal uppercase">Status</p>
            <p className="text-[13px] text-foreground">
              {states === "discovering-peer"
                ? `Waiting for a peer… (as ${identityName || "your device"})`
                : states === "connecting"
                  ? "Negotiating WebRTC…"
                  : states === "secure"
                    ? "Secure channel established"
                    : connection.detail ?? "—"}
            </p>
          </div>
        </div>
        <StatePill state={states} showLabel={false} />
      </div>

      {states === "error" ? (
        <Button
          variant="outline"
          onClick={() => {
            startedRef.current = false;
            void hostSession();
            startedRef.current = true;
          }}
          className="mt-3 w-full rounded-xl border-input font-mono text-[11px] tracking-[0.18em] uppercase"
        >
          Try again
        </Button>
      ) : null}
    </div>
  );
}

function CodePane() {
  const [code, setCode] = useState("");
  const joinSession = useAppStore((s) => s.joinSession);
  const connection = useAppStore((s) => s.connection);

  return (
    <div className="fade-up">
      <div className="metal-panel rounded-xl p-5">
        <Label htmlFor="join-code" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
          Peer rendezvous code
        </Label>
        <Input
          id="join-code"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 6))}
          placeholder="A1B2C3"
          autoFocus
          className="mt-2 h-14 rounded-xl border-input bg-ink text-center font-mono text-[22px] font-bold tracking-[0.3em] uppercase"
          onKeyDown={(e) => {
            if (e.key === "Enter" && code.length >= 4) void joinSession(code);
          }}
        />
        <p className="mt-2 text-[12px] text-muted-foreground">
          Your peer shows this in the Invite tab. Codes expire after 10 minutes.
        </p>
        <Button
          disabled={code.length < 4}
          onClick={() => void joinSession(code)}
          className="mt-4 h-12 w-full rounded-xl font-mono text-[11px] tracking-[0.2em] uppercase"
        >
          <Link2 className="size-4" />
          Join session
        </Button>
      </div>
      {connection.detail ? (
        <p className="mt-3 text-center text-[12px] text-red-300">{connection.detail}</p>
      ) : null}
    </div>
  );
}

function PastePane() {
  const [text, setText] = useState("");
  const joinSession = useAppStore((s) => s.joinSession);
  const connection = useAppStore((s) => s.connection);
  const [error, setError] = useState<string | null>(null);
  const invite = text.trim() ? decodeInvite(text) : null;

  return (
    <div className="fade-up">
      <div className="metal-panel rounded-xl p-5">
        <Label htmlFor="paste-invite" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
          Paste invite string
        </Label>
        <textarea
          id="paste-invite"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setError(null);
          }}
          rows={4}
          placeholder="FG1-…"
          className="mt-2 w-full resize-none rounded-lg border border-input bg-ink p-3 font-mono text-[12px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-metal"
        />
        {text.trim() && !invite ? (
          <p className="mt-2 font-mono text-[11px] tracking-[0.12em] text-red-300 uppercase">
            Not a valid FAST GUNS invite
          </p>
        ) : null}
        {invite ? (
          <div className="mt-3 rounded-lg border border-border bg-elevated p-3">
            <p className="font-mono text-[9px] tracking-[0.2em] text-metal uppercase">Peer claims identity</p>
            <div className="mt-1 flex items-center gap-2">
              <UserRound className="size-4 text-silver" />
              <span className="text-[13px] text-silver">{invite.name || "Unnamed"}</span>
            </div>
            <FingerprintText fp={invite.fp} className="mt-1 block" />
          </div>
        ) : null}
        <Button
          disabled={!invite || connection.state === "discovering-peer"}
          onClick={() => {
            if (!invite) return;
            void joinSession(invite.code, text.trim());
          }}
          className="mt-4 h-12 w-full rounded-xl font-mono text-[11px] tracking-[0.2em] uppercase"
        >
          <Link2 className="size-4" /> Connect
        </Button>
      </div>
      {error ? <p className="mt-3 text-center text-[12px] text-red-300">{error}</p> : null}
      {connection.detail ? (
        <p className="mt-3 text-center text-[12px] text-red-300">{connection.detail}</p>
      ) : null}
    </div>
  );
}

function ScanPane() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const joinSession = useAppStore((s) => s.joinSession);
  const joinedRef = useRef(false);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let raf = 0;
    let cancelled = false;

    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        setScanning(true);

        const { default: jsQR } = await import("jsqr");
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        const tick = () => {
          if (cancelled || !videoRef.current || !ctx) return;
          if (videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
            const image = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const found = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
            if (found?.data && !joinedRef.current) {
              const invite = decodeInvite(found.data);
              if (invite) {
                joinedRef.current = true;
                void joinSession(invite.code, found.data);
                return;
              }
            }
          }
          raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      } catch {
        setError(
          "Camera unavailable. Grant permission, or use the Code / Paste tabs instead."
        );
      }
    };
    void start();

    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className="fade-up">
      <div className="metal-panel relative overflow-hidden rounded-xl">
        <div className="relative aspect-square w-full bg-ink">
          <video ref={videoRef} muted playsInline className="size-full object-cover" aria-label="QR camera" />
          {scanning ? (
            <>
              <div className="pointer-events-none absolute inset-6 rounded-lg border border-silver/40" />
              <div className="scanline pointer-events-none absolute inset-x-6 h-0.5 bg-silver/60 shadow-[0_0_12px_rgba(199,199,199,0.6)]" />
            </>
          ) : null}
          {error ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-ink/90 p-6 text-center">
              <ScanLine className="size-6 text-metal" />
              <p className="text-[13px] leading-relaxed text-muted-foreground">{error}</p>
            </div>
          ) : null}
        </div>
      </div>
      <p className="mt-3 text-center text-[12px] leading-relaxed text-muted-foreground">
        Point the camera at your peer&rsquo;s invite QR. Only public identity
        data is encoded — never private keys.
      </p>
    </div>
  );
}
