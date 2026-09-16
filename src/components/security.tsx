"use client";

/**
 * FAST GUNS — security center, security log, threat model, about.
 * Every security statement here describes a real implemented mechanism or
 * an honestly stated limitation. No fake badges, no fake guarantees.
 */

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store/app-store";
import type { SecurityEventKind } from "@/types";
import {
  FingerprintText,
  KeyRow,
  ScreenHeader,
  SectionCard,
  StatePill,
} from "@/components/common";
import { DeviceIdentityCard } from "@/components/contacts";
import {
  ArrowLeft,
  Database,
  FileWarning,
  Fingerprint,
  KeyRound,
  Lock,
  Radio,
  ScrollText,
  ShieldCheck,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* security center                                                     */
/* ------------------------------------------------------------------ */

export function SecurityCenter() {
  const identity = useAppStore((s) => s.identityPublic);
  const vaultMeta = useAppStore((s) => s.vaultMeta);
  const contacts = useAppStore((s) => s.contacts);
  const connection = useAppStore((s) => s.connection);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const lockVault = useAppStore((s) => s.lockVault);
  const settings = useAppStore((s) => s.settings);

  const verifiedCount = contacts.filter((c) => c.verified).length;

  return (
    <div className="fade-up space-y-4">
      <ScreenHeader
        title="Security"
        subtitle="Real state only — this page never shows a status the code has not earned"
      />

      <SectionCard title="Device identity" icon={<Fingerprint className="size-3.5" />}>
        {identity ? (
          <>
            <KeyRow label="Name" value={identity.name || "Anonymous"} />
            <KeyRow label="Fingerprint" value={<FingerprintText fp={identity.fingerprint} />} />
            <KeyRow label="Keys created" value={new Date(identity.createdAt).toLocaleString()} />
            <KeyRow label="Key type" value="ECDH P-256 + ECDSA P-256 (WebCrypto)" />
            <div className="mt-3 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => openOverlay({ name: "identity" })}
                className="h-8 border-input font-mono text-[10px] tracking-[0.14em] text-silver uppercase hover:bg-charcoal"
              >
                Show QR
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={lockVault}
                className="h-8 border-input font-mono text-[10px] tracking-[0.14em] text-silver uppercase hover:bg-charcoal"
              >
                <Lock className="size-3.5" /> Lock now
              </Button>
            </div>
          </>
        ) : null}
      </SectionCard>

      <SectionCard title="Vault status" icon={<Lock className="size-3.5" />}>
        <KeyRow
          label="State"
          value={<span className="font-mono text-[11px] tracking-[0.14em] text-silver uppercase">Unlocked</span>}
        />
        <KeyRow
          label="Created"
          value={vaultMeta ? new Date(vaultMeta.createdAt).toLocaleString() : "—"}
        />
        <KeyRow
          label="Last unlock"
          value={vaultMeta ? new Date(vaultMeta.lastUnlockAt).toLocaleString() : "—"}
        />
        <KeyRow
          label="Password KDF"
          value={vaultMeta ? `PBKDF2-SHA256 × ${vaultMeta.iterations.toLocaleString()}` : "—"}
        />
        <KeyRow label="Auto-lock" value={`${settings.autoLockMinutes} min idle${settings.lockOnHide ? " · lock on hide" : ""}`} />
      </SectionCard>

      <SectionCard title="Encryption" icon={<KeyRound className="size-3.5" />}>
        <KeyRow label="Transport" value="WebRTC DataChannel (DTLS) + application layer" />
        <KeyRow label="Session key" value="Signed ephemeral ECDH → HKDF-SHA256" />
        <KeyRow label="Messages" value="AES-256-GCM (seq-bound AAD, replay-protected)" />
        <KeyRow label="At rest" value="AES-256-GCM under vault DEK (IndexedDB)" />
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          Honest limitations: session keys are destroyed on disconnect (session
          forward secrecy) but messages are not per-message ratcheted. PBKDF2
          is used because browsers do not ship Argon2id. Details in the threat
          model.
        </p>
      </SectionCard>

      <SectionCard title="Contact verification" icon={<ShieldCheck className="size-3.5" />}>
        <KeyRow
          label="Verified"
          value={contacts.length ? `${verifiedCount} / ${contacts.length}` : "No contacts"}
        />
        {contacts.some((c) => !c.verified) ? (
          <p className="mt-2 font-mono text-[10px] tracking-[0.14em] text-red-300 uppercase">
            {contacts.filter((c) => !c.verified).length} contact(s) require verification
          </p>
        ) : null}
      </SectionCard>

      <SectionCard title="Active connection" icon={<Radio className="size-3.5" />}>
        <div className="flex items-center justify-between gap-3">
          <StatePill state={connection.state} />
          {connection.detail ? (
            <span className="truncate text-[12px] text-muted-foreground">{connection.detail}</span>
          ) : null}
        </div>
        {connection.state === "secure" ? (
          <p className="mt-2 text-[12px] text-muted-foreground">
            Session key lives in memory only and is destroyed when the
            connection ends.
          </p>
        ) : null}
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-2">
        <MenuCard
          icon={<ScrollText className="size-4" />}
          title="Security log"
          body="Local, encrypted, never uploaded."
          onClick={() => openOverlay({ name: "security-log" })}
        />
        <MenuCard
          icon={<FileWarning className="size-4" />}
          title="Threat model"
          body="What is protected — and what is not."
          onClick={() => openOverlay({ name: "threat-model" })}
        />
        <MenuCard
          icon={<Database className="size-4" />}
          title="Backup"
          body="Encrypted export / import."
          onClick={() => openOverlay({ name: "backup" })}
        />
        <MenuCard
          icon={<Fingerprint className="size-4" />}
          title="About"
          body="Architecture and claims."
          onClick={() => openOverlay({ name: "about" })}
        />
      </div>
    </div>
  );
}

function MenuCard({
  icon,
  title,
  body,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="metal-panel rounded-xl p-4 text-left transition-colors hover:border-metal/30"
    >
      <span className="mb-2 flex size-8 items-center justify-center rounded-lg border border-border bg-elevated text-silver">
        {icon}
      </span>
      <span className="block font-mono text-[11px] font-semibold tracking-[0.18em] text-silver uppercase">
        {title}
      </span>
      <span className="mt-1 block text-[12px] text-muted-foreground">{body}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* security log                                                        */
/* ------------------------------------------------------------------ */

const KIND_LABEL: Record<SecurityEventKind, string> = {
  "vault-created": "VAULT CREATED",
  "vault-unlocked": "VAULT UNLOCKED",
  "vault-locked": "VAULT LOCKED",
  "vault-unlock-failed": "UNLOCK FAILED",
  "identity-created": "IDENTITY CREATED",
  "identity-verified": "IDENTITY VERIFIED",
  "identity-changed": "IDENTITY CHANGED",
  "backup-exported": "BACKUP EXPORTED",
  "backup-imported": "BACKUP IMPORTED",
  "connection-established": "CONNECTED",
  "connection-closed": "DISCONNECTED",
  "conversation-deleted": "CONVERSATION CLEARED",
  "data-wiped": "DATA WIPED",
  "contact-added": "CONTACT ADDED",
  "contact-deleted": "CONTACT DELETED",
  "settings-changed": "SETTINGS CHANGED",
  error: "ERROR",
};

export function SecurityLog() {
  const log = useAppStore((s) => s.securityLog);
  const closeOverlay = useAppStore((s) => s.closeOverlay);

  return (
    <div className="fade-up">
      <ScreenHeader title="Security log" subtitle="Local-only · encrypted · capped at 500 events" onBack={closeOverlay} />
      {log.length === 0 ? (
        <div className="metal-panel rounded-xl p-8 text-center text-[13px] text-muted-foreground">
          No events recorded yet.
        </div>
      ) : (
        <ul className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
          {log.map((e) => (
            <li key={e.id} className="metal-panel rounded-lg p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`font-mono text-[9px] tracking-[0.18em] uppercase ${
                    e.kind === "identity-changed" || e.kind === "error" ? "text-red-300" : "text-metal"
                  }`}
                >
                  {KIND_LABEL[e.kind]}
                </span>
                <span className="font-mono text-[9px] text-muted-foreground tabular">
                  {new Date(e.at).toLocaleString()}
                </span>
              </div>
              <p className="mt-1 text-[13px] text-foreground">{e.detail}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Message contents and keys are never written to this log — only facts.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* threat model (mandatory)                                            */
/* ------------------------------------------------------------------ */

const PROTECTS = [
  "Centralized plaintext message storage — there is no server message database.",
  "Server-side message access — the relay only handles WebRTC negotiation metadata.",
  "Database leaks of message plaintext — local records are AES-256-GCM ciphertext.",
  "Casual access to a stored database without the vault password.",
  "Interception of application-level plaintext — payloads are E2E encrypted before the transport.",
  "Silent identity substitution — peers sign handshakes; changed keys raise a visible alert.",
];

const DOES_NOT = [
  "A compromised device, operating system, or malicious browser extension.",
  "Screenshots, shoulder-surfing, or a stolen unlocked device.",
  "Phishing — verification only works if you actually compare fingerprints.",
  "Traffic analysis or complete metadata elimination (IPs, timing, rendezvous codes are observable).",
  "Availability when peers are offline — delivery requires an online peer; there is no server queue.",
  "Security of third-party infrastructure (signaling host, STUN servers, browser).",
  "Forward secrecy across stored history — saved messages remain decryptable while the vault is unlocked.",
  "An audited crypto implementation — this is a standard-primitives build, not a reviewed Signal fork.",
];

export function ThreatModel() {
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  return (
    <div className="fade-up">
      <ScreenHeader title="Threat model" subtitle="Read this before trusting any messenger" onBack={closeOverlay} />
      <SectionCard title="What FAST GUNS protects against" icon={<ShieldCheck className="size-3.5" />}>
        <ul className="space-y-2.5">
          {PROTECTS.map((t) => (
            <li key={t} className="flex gap-2.5 text-[13px] leading-relaxed text-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-silver" />
              {t}
            </li>
          ))}
        </ul>
      </SectionCard>
      <SectionCard title="What FAST GUNS does NOT guarantee" icon={<FileWarning className="size-3.5" />} className="mt-4 border-alert/30">
        <ul className="space-y-2.5">
          {DOES_NOT.map((t) => (
            <li key={t} className="flex gap-2.5 text-[13px] leading-relaxed text-muted-foreground">
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-alert" />
              {t}
            </li>
          ))}
        </ul>
      </SectionCard>
      <p className="mt-4 text-[12px] leading-relaxed text-muted-foreground">
        Security is a process, not a badge. If a mechanism cannot be
        implemented correctly, this product says so instead of pretending.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* about                                                               */
/* ------------------------------------------------------------------ */

export function About() {
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const identity = useAppStore((s) => s.identityPublic);
  const refreshStorageStats = useAppStore((s) => s.refreshStorageStats);
  const storageUsage = useAppStore((s) => s.storageUsage);

  useEffect(() => {
    void refreshStorageStats();
  }, [refreshStorageStats]);

  return (
    <div className="fade-up">
      <ScreenHeader title="About" subtitle="FAST GUNS v1.0 — private communications device" onBack={closeOverlay} />
      <SectionCard title="Architecture">
        <KeyRow label="Client" value="Next.js · React · TypeScript strict" />
        <KeyRow label="Crypto" value="WebCrypto (browser-native primitives)" />
        <KeyRow label="Storage" value="IndexedDB, all records DEK-encrypted" />
        <KeyRow label="Transport" value="WebRTC DataChannel, P2P ciphertext" />
        <KeyRow label="Signaling" value="Ephemeral in-memory relay, 10 min TTL, no persistence" />
        <KeyRow label="Telemetry" value="None. No analytics. No tracking." />
        {storageUsage ? (
          <KeyRow
            label="Local storage used"
            value={`${(storageUsage.usage / 1024 / 1024).toFixed(2)} MB · ${storageUsage.records} records`}
          />
        ) : null}
        {identity ? (
          <KeyRow label="This device" value={<FingerprintText fp={identity.fingerprint} compact />} />
        ) : null}
      </SectionCard>
      <SectionCard title="Claims policy" className="mt-4">
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          FAST GUNS describes what its code actually does and states its
          limitations plainly. It is not marketed as &ldquo;unbreakable&rdquo;,
          &ldquo;anonymous&rdquo;, or &ldquo;military grade&rdquo;, and it has
          not been independently audited.
        </p>
      </SectionCard>
    </div>
  );
}

/* re-export for the overlay router */
export function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="outline" size="icon" onClick={onClick} className="size-9 rounded-lg border-input text-silver" aria-label="Back">
      <ArrowLeft className="size-4" />
    </Button>
  );
}
