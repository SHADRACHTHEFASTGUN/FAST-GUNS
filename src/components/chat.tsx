"use client";

/**
 * FAST GUNS — conversation view.
 * Minimal private-communication-terminal aesthetic. Honest states only:
 * SECURE CHANNEL is shown only when the handshake actually completed;
 * delivery ticks appear only after a real peer ack.
 */

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import type { ChatMessage } from "@/types";
import { StatePill, VerifiedBadge } from "@/components/common";
import { MAX_ATTACHMENT_BYTES } from "@/crypto/files";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  ArrowLeft,
  Check,
  CheckCheck,
  FileText,
  Image as ImageIcon,
  Mic,
  Paperclip,
  Plus,
  Send,
  ShieldAlert,
  Square,
  X,
} from "lucide-react";

export function ChatView() {
  const activeContactId = useAppStore((s) => s.activeContactId);
  const contacts = useAppStore((s) => s.contacts);
  const conversations = useAppStore((s) => s.conversations);
  const messagesByConvo = useAppStore((s) => s.messages);
  const connection = useAppStore((s) => s.connection);
  const selfFp = useAppStore((s) => s.identityPublic?.fingerprint ?? null);
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const sendText = useAppStore((s) => s.sendText);
  const sendAttachment = useAppStore((s) => s.sendAttachment);
  const getAttachmentUrl = useAppStore((s) => s.getAttachmentUrl);

  const contact = contacts.find((c) => c.id === activeContactId) ?? null;
  const selfFingerprint = selfFp;
  const convoId = contact && selfFingerprint
    ? conversationIdFor(selfFingerprint, contact.fingerprint)
    : null;
  const list = convoId ? messagesByConvo[convoId] ?? [] : [];

  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [attachOpen, setAttachOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const secure = connection.state === "secure";

  // auto-scroll to newest message
  useLayoutEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [list.length]);

  // keyboard-safe composer: refocus on secure transitions
  useEffect(() => {
    if (secure) inputRef.current?.focus();
  }, [secure]);

  if (!contact) {
    return (
      <div className="flex flex-1 items-center justify-center p-8 text-center text-[13px] text-muted-foreground">
        Conversation not found.
      </div>
    );
  }

  const doSendText = async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await sendText(text);
      setDraft("");
    } catch (err) {
      const code = err instanceof Error ? err.message : "error";
      toast({
        title: "Not sent",
        description:
          code === "no-secure-channel"
            ? "No secure channel. The peer must be online — connect first."
            : "The message could not be encrypted or transmitted.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  const doSendAttachment = async (file: File | Blob, name: string, kind: "image" | "file" | "voice") => {
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast({
        title: "File too large",
        description: `Attachments are limited to ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB in this release.`,
        variant: "destructive",
      });
      return;
    }
    try {
      await sendAttachment(file, name, kind);
      setAttachOpen(false);
    } catch {
      toast({
        title: "Not sent",
        description: "No secure channel. The peer must be online to receive files.",
        variant: "destructive",
      });
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        if (blob.size > 0) {
          void doSendAttachment(blob, `voice-${Date.now()}.webm`, "voice");
        }
      };
      recorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      toast({
        title: "Microphone unavailable",
        description: "Voice notes need microphone permission. Text and files still work.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* header */}
      <header className="sticky top-0 z-20 border-b border-border/70 bg-ink/95 px-3 pt-safe backdrop-blur-sm lg:rounded-t-2xl lg:border">
        <div className="flex items-center gap-2.5 py-3">
          <Button
            variant="outline"
            size="icon"
            onClick={() => {
              closeOverlay();
            }}
            className="size-9 shrink-0 rounded-lg border-input text-silver"
            aria-label="Back to chats"
          >
            <ArrowLeft className="size-4" />
          </Button>
          <button
            onClick={() => openOverlay({ name: "contact-detail", contactId: contact.id })}
            className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated font-mono text-[13px] font-semibold text-silver">
              {(contact.name || "?").slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="truncate text-[14px] font-medium text-foreground">{contact.name}</span>
              </span>
              <span className="mt-0.5 flex items-center gap-2">
                <VerifiedBadge verified={contact.verified} />
              </span>
            </span>
          </button>
          <StatePill state={connection.state} />
        </div>
      </header>

      {/* security banners (real state only) */}
      {contact.verified && connection.state === "secure" ? null : (
        <button
          onClick={() => openOverlay({ name: "verify", contactId: contact.id })}
          className="flex items-start gap-2 border-b border-alert/30 bg-alert/10 px-4 py-2.5 text-left"
        >
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-red-300" />
          <span className="text-[12px] leading-relaxed text-red-200">
            {connection.state === "secure"
              ? "Identity verification required. Compare fingerprints before trusting this channel."
              : "This contact's identity is not verified yet."}
          </span>
        </button>
      )}

      {/* messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4 lg:px-5" role="log" aria-live="polite">
        {list.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 py-16 text-center">
            <p className="font-mono text-[11px] tracking-[0.24em] text-metal uppercase">Private channel</p>
            <p className="max-w-xs text-[13px] leading-relaxed text-muted-foreground">
              Messages are encrypted locally before transmission. No message
              history exists yet.
            </p>
          </div>
        ) : (
          list.map((m) => (
            <MessageBubble
              key={m.id}
              message={m}
              selfFp={selfFingerprint}
              getAttachmentUrl={getAttachmentUrl}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* composer */}
      <footer className="sticky bottom-0 border-t border-border/70 bg-ink/95 px-3 pb-safe pt-2 backdrop-blur-sm lg:rounded-b-2xl lg:border lg:px-4">
        <div className="pb-2">
          {attachOpen ? (
            <div className="mb-2 grid grid-cols-3 gap-2 rounded-xl border border-border bg-surface p-2">
              <AttachButton
                icon={<ImageIcon className="size-4" />}
                label="Photo"
                onClick={() => imageInputRef.current?.click()}
              />
              <AttachButton
                icon={<FileText className="size-4" />}
                label="File"
                onClick={() => fileInputRef.current?.click()}
              />
              <AttachButton
                icon={<Mic className="size-4" />}
                label="Voice"
                onClick={() => {
                  setAttachOpen(false);
                  void toggleRecording();
                }}
              />
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setAttachOpen((o) => !o)}
              className={cn(
                "size-11 shrink-0 rounded-xl border-input text-silver",
                attachOpen && "bg-charcoal"
              )}
              aria-label="Attachments"
              aria-expanded={attachOpen}
            >
              {attachOpen ? <X className="size-4" /> : <Plus className="size-4" />}
            </Button>
            <div className="flex-1 rounded-xl border border-input bg-surface px-3 py-2">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void doSendText();
                  }
                }}
                rows={1}
                placeholder={recording ? "Recording voice note…" : "Encrypted message…"}
                disabled={recording}
                className="max-h-32 w-full resize-none bg-transparent text-[15px] leading-6 text-foreground placeholder:text-muted-foreground/60 focus:outline-none disabled:opacity-50"
                aria-label="Message"
              />
            </div>
            {draft.trim() ? (
              <Button
                size="icon"
                onClick={() => void doSendText()}
                disabled={sending}
                className="size-11 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-silver"
                aria-label="Send encrypted message"
              >
                <Send className="size-4" />
              </Button>
            ) : (
              <Button
                size="icon"
                variant="outline"
                onClick={() => void toggleRecording()}
                className={cn(
                  "size-11 shrink-0 rounded-xl border-input",
                  recording ? "border-alert/60 text-red-300 pulse-ring" : "text-silver"
                )}
                aria-label={recording ? "Stop recording" : "Record voice note"}
              >
                {recording ? <Square className="size-4" /> : <Mic className="size-4" />}
              </Button>
            )}
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doSendAttachment(f, f.name, "file");
            e.target.value = "";
          }}
        />
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void doSendAttachment(f, f.name, "image");
            e.target.value = "";
          }}
        />
      </footer>
    </div>
  );
}

function AttachButton({
  icon,
  label,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-lg border border-border bg-elevated font-mono text-[9px] tracking-[0.18em] text-silver uppercase transition-colors hover:border-metal/40"
    >
      {icon}
      {label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* message bubble                                                      */
/* ------------------------------------------------------------------ */

function MessageBubble({
  message,
  selfFp,
  getAttachmentUrl,
}: {
  message: ChatMessage;
  selfFp: string | null;
  getAttachmentUrl: (m: ChatMessage) => Promise<string | null>;
}) {
  if (message.kind === "system") {
    return (
      <div className="fade-up py-1.5 text-center">
        <span className="inline-block rounded-full border border-border bg-surface px-3 py-1 font-mono text-[9px] tracking-[0.16em] text-metal uppercase">
          {systemLabel(message.systemCode)}
        </span>
      </div>
    );
  }

  const outgoing = message.direction === "outgoing";
  const isImage = message.kind === "image";
  const isVoice = message.kind === "voice";

  return (
    <div className={cn("fade-up flex", outgoing ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] rounded-2xl border px-3.5 py-2.5 sm:max-w-[70%]",
          outgoing
            ? "rounded-br-md border-silver/15 bg-graphite text-foreground"
            : "rounded-bl-md border-border bg-charcoal text-foreground"
        )}
      >
        {message.attachment ? (
          <AttachmentBody
            message={message}
            isImage={isImage}
            isVoice={isVoice}
            getAttachmentUrl={getAttachmentUrl}
          />
        ) : (
          <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{message.text}</p>
        )}
        <div
          className={cn(
            "mt-1 flex items-center justify-end gap-1.5 font-mono text-[9px] text-muted-foreground",
            message.text && !message.attachment && "-mt-0.5"
          )}
        >
          <span className="tabular">
            {new Date(message.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </span>
          {outgoing ? (
            message.delivered ? (
              <CheckCheck className="size-3 text-silver" aria-label="Delivered" />
            ) : (
              <Check className="size-3" aria-label="Sent — awaiting peer acknowledgment" />
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

function AttachmentBody({
  message,
  isImage,
  isVoice,
  getAttachmentUrl,
}: {
  message: ChatMessage;
  isImage: boolean;
  isVoice: boolean;
  getAttachmentUrl: (m: ChatMessage) => Promise<string | null>;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    void getAttachmentUrl(message).then((u) => {
      if (!alive) return;
      if (u) setUrl(u);
      else setMissing(true);
    });
    return () => {
      alive = false;
    };
  }, [message, getAttachmentUrl]);

  const att = message.attachment!;
  const sizeLabel = formatSize(att.size);

  if (isImage) {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg">
        <img src={url} alt={att.name} className="max-h-64 w-auto rounded-lg" />
      </a>
    ) : (
      <div className="flex h-32 w-48 items-center justify-center rounded-lg bg-ink/60">
        {missing ? <span className="font-mono text-[10px] text-muted-foreground uppercase">Unavailable</span> : null}
      </div>
    );
  }
  if (isVoice) {
    return url ? (
      <div className="min-w-56">
        <audio controls src={url} className="w-full" aria-label="Voice note" />
      </div>
    ) : (
      <div className="flex items-center gap-2 font-mono text-[11px] text-muted-foreground uppercase">
        <Mic className="size-4" /> Voice note
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2.5">
      <span className="flex size-9 items-center justify-center rounded-lg border border-border bg-ink/60">
        <Paperclip className="size-4 text-silver" />
      </span>
      <span className="min-w-0">
        <span className="block max-w-52 truncate text-[13px] text-silver">{att.name}</span>
        <span className="font-mono text-[10px] text-muted-foreground">{sizeLabel}</span>
      </span>
      {url ? (
        <a
          href={url}
          download={att.name}
          className="ml-1 rounded-lg border border-border px-2.5 py-1.5 font-mono text-[9px] tracking-[0.14em] text-silver uppercase hover:bg-charcoal"
        >
          Save
        </a>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function conversationIdFor(fpA: string, fpB: string): string {
  const sorted = [fpA, fpB].sort();
  return `c_${sorted[0].slice(0, 16)}_${sorted[1].slice(0, 16)}`;
}

function systemLabel(code?: string): string {
  switch (code) {
    case "channel-secured":
      return "Encrypted channel ready";
    case "connection-established":
      return "Connection established";
    case "connection-closed":
      return "Connection closed";
    case "identity-verified":
      return "Identity verified";
    case "identity-changed":
      return "SECURITY ALERT — identity key changed";
    case "attachment-decrypted":
      return "Attachment decrypted";
    default:
      return "Security event";
  }
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
