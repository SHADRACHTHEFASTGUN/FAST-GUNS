"use client";

/**
 * FAST GUNS — shared UI primitives.
 * Monochrome industrial design language: metal panels, engraved labels,
 * silver accents, precise hairlines. No neon, no rainbow, no glassmorphism.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Check, Copy, ShieldCheck, ShieldAlert, Loader2 } from "lucide-react";
import QRCode from "qrcode";
import type { ConnectionState, Fingerprint } from "@/types";
import { formatFingerprint } from "@/crypto/primitives";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* brand                                                               */
/* ------------------------------------------------------------------ */

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <Image
      src="/fastguns-logo.png"
      alt="FAST GUNS emblem"
      width={size}
      height={size}
      className={cn("rounded-md select-none", className)}
      priority={size >= 96}
    />
  );
}

export function Wordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-mono text-[13px] font-semibold tracking-[0.32em] text-silver uppercase engraved",
        className
      )}
    >
      Fast Guns
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* fingerprints                                                        */
/* ------------------------------------------------------------------ */

export function FingerprintText({
  fp,
  className,
  compact = false,
}: {
  fp: Fingerprint;
  className?: string;
  compact?: boolean;
}) {
  const groups = useMemo(() => {
    if (compact) {
      const clean = fp.replace(/[^0-9A-Z]/gi, "").toUpperCase();
      return [clean.slice(0, 5), clean.slice(-5)];
    }
    return formatFingerprint(fp).split("-");
  }, [fp, compact]);
  return (
    <span
      className={cn(
        "font-mono tabular tracking-wider text-silver break-all",
        compact ? "text-[11px]" : "text-[12px] sm:text-[13px]",
        className
      )}
    >
      {groups.join(compact ? "·" : "-")}
    </span>
  );
}

export function CopyButton({
  value,
  label,
  className,
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn("h-8 gap-1.5 border-input text-muted-foreground hover:text-silver", className)}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
        } catch {
          /* clipboard may be unavailable — ignore honestly */
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      aria-label={label ?? "Copy"}
    >
      {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      <span className="text-[11px] tracking-widest uppercase">{copied ? "Copied" : label ?? "Copy"}</span>
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* connection state                                                    */
/* ------------------------------------------------------------------ */

const STATE_LABEL: Record<ConnectionState, string> = {
  offline: "OFFLINE",
  "discovering-peer": "DISCOVERING PEER",
  connecting: "CONNECTING",
  connected: "CONNECTED",
  secure: "SECURE CHANNEL",
  disconnected: "DISCONNECTED",
  error: "ERROR",
};

export function StatePill({
  state,
  className,
  showLabel = true,
}: {
  state: ConnectionState;
  className?: string;
  showLabel?: boolean;
}) {
  const tone =
    state === "secure"
      ? "border-silver/40 text-silver bg-silver/5"
      : state === "error"
        ? "border-alert/50 text-red-300 bg-alert/10"
        : state === "offline" || state === "disconnected"
          ? "border-border text-muted-foreground bg-secondary"
          : "border-metal/40 text-metal bg-charcoal animate-pulse";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[10px] tracking-[0.14em] uppercase whitespace-nowrap",
        tone,
        className
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {showLabel ? STATE_LABEL[state] : ""}
    </span>
  );
}

export function VerifiedBadge({ verified }: { verified: boolean }) {
  return verified ? (
    <Badge
      variant="outline"
      className="gap-1 border-silver/40 bg-silver/5 font-mono text-[10px] tracking-[0.12em] text-silver uppercase"
    >
      <ShieldCheck className="size-3" /> Verified
    </Badge>
  ) : (
    <Badge
      variant="outline"
      className="gap-1 border-alert/50 bg-alert/10 font-mono text-[10px] tracking-[0.12em] text-red-300 uppercase"
    >
      <ShieldAlert className="size-3" /> Unverified
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* layout primitives                                                   */
/* ------------------------------------------------------------------ */

export function SectionCard({
  title,
  icon,
  children,
  className,
  action,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <section className={cn("metal-panel rounded-xl p-4 sm:p-5", className)}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-mono text-[11px] font-semibold tracking-[0.22em] text-metal uppercase">
          {icon}
          {title}
        </h2>
        {action}
      </header>
      {children}
    </section>
  );
}

export function KeyRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/60 py-2 last:border-0">
      <span className="font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
        {label}
      </span>
      <span className="text-right text-[13px] text-foreground">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* QR                                                                  */
/* ------------------------------------------------------------------ */

export function QrDisplay({ payload, size = 208 }: { payload: string; size?: number }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(payload, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: size * 2,
      color: { dark: "#050505ff", light: "#f4f4f4ff" },
    })
      .then((url) => {
        if (alive) setDataUrl(url);
      })
      .catch(() => setDataUrl(null));
    return () => {
      alive = false;
    };
  }, [payload, size]);
  if (!dataUrl) {
    return <div className="size-[208px] animate-pulse rounded-lg bg-charcoal" aria-label="QR encoding" />;
  }
  return (
    <img
      src={dataUrl}
      alt="Identity QR code"
      width={size}
      height={size}
      className="rounded-lg border-4 border-background shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
    />
  );
}

/* ------------------------------------------------------------------ */
/* confirm dialog (destructive flows)                                  */
/* ------------------------------------------------------------------ */

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  requirePhrase,
  destructive = true,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel: string;
  requirePhrase?: string;
  destructive?: boolean;
  onConfirm: () => void;
}) {
  const [phrase, setPhrase] = useState("");
  // reset the confirmation phrase when the dialog closes
  // (render-time state adjustment — the recommended React pattern)
  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setPhrase("");
  }
  const ready = !requirePhrase || phrase.trim().toUpperCase() === requirePhrase.toUpperCase();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="metal-panel-elevated border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm tracking-[0.18em] uppercase">
            {title}
          </DialogTitle>
          <DialogDescription className="pt-1 text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </DialogDescription>
        </DialogHeader>
        {requirePhrase ? (
          <input
            value={phrase}
            onChange={(e) => setPhrase(e.target.value)}
            placeholder={`Type ${requirePhrase} to confirm`}
            className="w-full rounded-lg border border-input bg-ink px-3 py-2 font-mono text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-1 focus:ring-metal"
            aria-label={`Type ${requirePhrase} to confirm`}
          />
        ) : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" className="border-input" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={!ready}
            onClick={() => {
              onConfirm();
              onOpenChange(false);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* misc                                                                */
/* ------------------------------------------------------------------ */

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn("size-4 animate-spin text-metal", className)} />;
}

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  right,
}: {
  title: string;
  subtitle?: React.ReactNode;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  return (
    <header className="mb-4 flex items-center gap-3">
      {onBack ? (
        <Button
          variant="outline"
          size="icon"
          onClick={onBack}
          className="size-9 shrink-0 rounded-lg border-input text-silver"
          aria-label="Back"
        >
          <ChevronLeftIcon />
        </Button>
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 className="truncate font-mono text-[13px] font-semibold tracking-[0.24em] text-silver uppercase">
          {title}
        </h1>
        {subtitle ? <div className="mt-0.5 truncate text-[12px] text-muted-foreground">{subtitle}</div> : null}
      </div>
      {right}
    </header>
  );
}

function ChevronLeftIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-4">
      <path d="m15 18-6-6 6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** subtle metallic vignette backdrop for hero screens */
export function VignetteBackdrop() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute left-1/2 top-[-30%] size-[720px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(199,199,199,0.055)_0%,rgba(0,0,0,0)_60%)]" />
      <div className="absolute bottom-[-40%] left-1/2 size-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(140,140,140,0.04)_0%,rgba(0,0,0,0)_60%)]" />
    </div>
  );
}

/** password strength bar (honest heuristic) */
export function StrengthMeter({ score }: { score: number }) {
  return (
    <div className="flex gap-1" aria-label={`Password strength ${score} of 4`}>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full transition-colors",
            i < score ? "bg-silver" : "bg-charcoal"
          )}
        />
      ))}
    </div>
  );
}

/** hook: run an effect once on mount (client only) */
export function useMounted() {
  const ref = useRef(false);
  useEffect(() => {
    ref.current = true;
  }, []);
  return ref;
}
