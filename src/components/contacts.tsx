"use client";

/**
 * FAST GUNS — contacts + identity verification.
 * Verification corresponds to real cryptographic facts: fingerprints are
 * derived from the peer's public identity keys. Marking a contact verified
 * is a deliberate human action, never a side effect of connecting.
 */

import { useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app-store";
import type { Contact } from "@/types";
import {
  ConfirmDialog,
  CopyButton,
  FingerprintText,
  KeyRow,
  QrDisplay,
  ScreenHeader,
  SectionCard,
  VerifiedBadge,
} from "@/components/common";
import { encodeInvite } from "@/services/peer-session";
import {
  ArrowLeft,
  BadgeCheck,
  FileWarning,
  ShieldCheck,
  Trash2,
  UserRound,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* contacts list                                                       */
/* ------------------------------------------------------------------ */

export function Contacts() {
  const contacts = useAppStore((s) => s.contacts);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const openChatWithContact = useAppStore((s) => s.openChatWithContact);

  return (
    <div className="fade-up">
      <ScreenHeader
        title="Contacts"
        subtitle={`${contacts.length} stored locally · encrypted at rest`}
      />
      {contacts.length === 0 ? (
        <div className="metal-panel flex flex-col items-center rounded-xl px-6 py-12 text-center">
          <UserRound className="mb-4 size-8 text-metal" />
          <h2 className="font-mono text-[12px] font-semibold tracking-[0.24em] text-silver uppercase">
            No contacts yet
          </h2>
          <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-muted-foreground">
            Contacts appear here after you establish a secure channel. Verify
            their fingerprint to mark the identity as trusted.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {contacts.map((c) => (
            <li key={c.id}>
              <button
                onClick={() => openOverlay({ name: "contact-detail", contactId: c.id })}
                className="metal-panel flex w-full items-center gap-3 rounded-xl p-3.5 text-left transition-colors hover:border-metal/30"
              >
                <span className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-border bg-elevated font-mono text-[14px] font-semibold text-silver">
                  {(c.name || "?").slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[14px] font-medium text-foreground">{c.name}</span>
                    <VerifiedBadge verified={c.verified} />
                  </span>
                  <FingerprintText fp={c.fingerprint} compact className="mt-0.5 block" />
                </span>
                <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                  {c.lastConnectedAt
                    ? `seen ${new Date(c.lastConnectedAt).toLocaleDateString()}`
                    : "never connected"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {contacts.some((c) => !c.verified) ? (
        <SectionCard
          title="Verification required"
          icon={<FileWarning className="size-3.5" />}
          className="mt-4 border-alert/30"
        >
          <p className="text-[12px] leading-relaxed text-muted-foreground">
            An unverified contact only proves a valid signature — not that it
            belongs to the person you think. Compare fingerprints out-of-band
            (in person, or another trusted channel) and mark them verified.
          </p>
        </SectionCard>
      ) : null}

      {contacts.length > 0 ? (
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {contacts
            .filter((c) => !c.verified)
            .map((c) => (
              <Button
                key={c.id}
                variant="outline"
                onClick={() => openChatWithContact(c.id)}
                className="h-10 justify-start rounded-xl border-input font-mono text-[10px] tracking-[0.16em] text-silver uppercase hover:bg-charcoal"
              >
                <BadgeCheck className="size-3.5" /> Open chat · {c.name}
              </Button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* contact detail                                                      */
/* ------------------------------------------------------------------ */

export function ContactDetail({ contactId }: { contactId: string }) {
  const contact = useAppStore((s) => s.contacts.find((c) => c.id === contactId));
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const renameContact = useAppStore((s) => s.renameContact);
  const deleteContact = useAppStore((s) => s.deleteContact);
  const clearConversation = useAppStore((s) => s.clearConversation);
  const openChatWithContact = useAppStore((s) => s.openChatWithContact);

  const [name, setName] = useState(contact?.name ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  if (!contact) {
    return <div className="p-8 text-center text-[13px] text-muted-foreground">Contact not found.</div>;
  }

  return (
    <div className="fade-up">
      <ScreenHeader
        title="Contact"
        subtitle={contact.fingerprint.slice(0, 12) + "…"}
        onBack={closeOverlay}
        right={<VerifiedBadge verified={contact.verified} />}
      />

      <div className="space-y-4">
        <SectionCard title="Identity">
          <div className="flex items-center gap-4">
            <span className="flex size-14 items-center justify-center rounded-xl border border-border bg-elevated font-mono text-[18px] font-semibold text-silver">
              {(contact.name || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <Label htmlFor="contact-name" className="font-mono text-[9px] tracking-[0.2em] text-metal uppercase">
                Display name
              </Label>
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={() => name.trim() && name !== contact.name && void renameContact(contact.id, name)}
                className="mt-1 h-10 rounded-lg border-input bg-ink text-[14px]"
                maxLength={32}
              />
            </div>
          </div>
          <div className="mt-4">
            <KeyRow
              label="Fingerprint"
              value={<FingerprintText fp={contact.fingerprint} />}
            />
            <KeyRow
              label="Verified"
              value={
                contact.verified && contact.verifiedAt
                  ? new Date(contact.verifiedAt).toLocaleString()
                  : "Not verified"
              }
            />
            <KeyRow
              label="Added"
              value={new Date(contact.createdAt).toLocaleDateString()}
            />
            <KeyRow
              label="Last connection"
              value={
                contact.lastConnectedAt
                  ? new Date(contact.lastConnectedAt).toLocaleString()
                  : "Never"
              }
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <CopyButton value={contact.fingerprint} label="Fingerprint" />
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 border-input font-mono text-[11px] tracking-[0.14em] text-silver uppercase hover:bg-charcoal"
              onClick={() => openOverlay({ name: "verify", contactId: contact.id })}
            >
              <ShieldCheck className="size-3.5" /> Verify identity
            </Button>
            <Button
              size="sm"
              className="h-8 gap-1.5 rounded-lg bg-primary font-mono text-[11px] tracking-[0.14em] text-primary-foreground uppercase hover:bg-silver"
              onClick={() => openChatWithContact(contact.id)}
            >
              Open chat
            </Button>
          </div>
        </SectionCard>

        <SectionCard title="Danger zone" icon={<Trash2 className="size-3.5" />}>
          <div className="flex flex-col gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmClear(true)}
              className="h-10 justify-start rounded-lg border-input font-mono text-[10px] tracking-[0.16em] text-silver uppercase hover:bg-charcoal"
            >
              Clear conversation (local)
            </Button>
            <Button
              variant="destructive"
              onClick={() => setConfirmDelete(true)}
              className="h-10 justify-start rounded-lg font-mono text-[10px] tracking-[0.16em] uppercase"
            >
              <Trash2 className="size-3.5" /> Delete contact & conversation
            </Button>
          </div>
        </SectionCard>
      </div>

      <ConfirmDialog
        open={confirmClear}
        onOpenChange={setConfirmClear}
        title="Clear conversation?"
        description="Deletes every locally stored (encrypted) message record with this contact. The peer's copy is unaffected."
        confirmLabel="Clear"
        onConfirm={() => void clearConversation(contact.id)}
      />
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete contact?"
        description="Removes the contact, the conversation and its stored ciphertext from this device. Future connections will treat this peer as a brand-new identity."
        confirmLabel="Delete"
        requirePhrase="DELETE"
        onConfirm={() => void deleteContact(contact.id)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* verify identity                                                     */
/* ------------------------------------------------------------------ */

export function VerifyIdentity({ contactId }: { contactId: string }) {
  const contact = useAppStore((s) => s.contacts.find((c) => c.id === contactId));
  const identity = useAppStore((s) => s.identityPublic);
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const markContactVerified = useAppStore((s) => s.markContactVerified);

  const [compared, setCompared] = useState(contact?.verified ?? false);

  if (!contact || !identity) {
    return <div className="p-8 text-center text-[13px] text-muted-foreground">Contact not found.</div>;
  }

  const match = contact.fingerprint === contact.addedFingerprint;

  return (
    <div className="fade-up">
      <ScreenHeader
        title="Verify identity"
        subtitle="Confirm you are talking to the right person"
        onBack={closeOverlay}
      />

      {!match ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-alert/40 bg-alert/10 p-4">
          <FileWarning className="mt-0.5 size-4 shrink-0 text-red-300" />
          <p className="text-[12px] leading-relaxed text-red-200">
            SECURITY ALERT — this contact&rsquo;s identity key has changed since
            it was first recorded. Do not assume this is safe until you verify
            the new fingerprint through a channel you trust.
          </p>
        </div>
      ) : null}

      <SectionCard title="Step 1 — read the fingerprints">
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-elevated p-4">
            <p className="mb-1.5 font-mono text-[9px] tracking-[0.22em] text-metal uppercase">
              Your fingerprint ({identity.name || "this device"})
            </p>
            <FingerprintText fp={identity.fingerprint} />
            <div className="mt-2">
              <CopyButton value={identity.fingerprint} label="Copy mine" />
            </div>
          </div>
          <div className="rounded-xl border border-border bg-elevated p-4">
            <p className="mb-1.5 font-mono text-[9px] tracking-[0.22em] text-metal uppercase">
              Contact fingerprint ({contact.name})
            </p>
            <FingerprintText fp={contact.fingerprint} />
            <div className="mt-2">
              <CopyButton value={contact.fingerprint} label="Copy theirs" />
            </div>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Step 2 — compare out-of-band" className="mt-4">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Read the strings to each other in person, over a call, or through any
          channel you independently trust. They must match character for
          character. You can also compare the QR codes below visually.
        </p>
        <div className="mt-4 flex flex-wrap items-center justify-around gap-4">
          <div className="text-center">
            <QrDisplay payload={encodeInvite({ v: 1, app: "fastguns", code: "VERIFY", fp: identity.fingerprint, name: identity.name })} size={140} />
            <p className="mt-2 font-mono text-[9px] tracking-[0.2em] text-metal uppercase">Yours</p>
          </div>
          <div className="text-center">
            <QrDisplay payload={encodeInvite({ v: 1, app: "fastguns", code: "VERIFY", fp: contact.fingerprint, name: contact.name })} size={140} />
            <p className="mt-2 font-mono text-[9px] tracking-[0.2em] text-metal uppercase">Theirs</p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Step 3 — mark verification" className="mt-4">
        {contact.verified ? (
          <p className="flex items-center gap-2 text-[13px] text-silver">
            <ShieldCheck className="size-4" /> Verified{" "}
            {contact.verifiedAt ? `on ${new Date(contact.verifiedAt).toLocaleDateString()}` : ""}
          </p>
        ) : (
          <>
            <label className="flex items-start gap-3 text-[13px] leading-relaxed text-muted-foreground">
              <input
                type="checkbox"
                checked={compared}
                onChange={(e) => setCompared(e.target.checked)}
                className="mt-1 size-4 accent-[#c7c7c7]"
              />
              I compared both fingerprints through a trusted channel and they match.
            </label>
            <Button
              disabled={!compared || !match}
              onClick={() => void markContactVerified(contact.id).then(closeOverlay)}
              className="mt-4 h-11 w-full rounded-xl font-mono text-[11px] tracking-[0.2em] uppercase"
            >
              <ShieldCheck className="size-4" /> Mark as verified
            </Button>
          </>
        )}
      </SectionCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* my identity (QR)                                                    */
/* ------------------------------------------------------------------ */

export function DeviceIdentityCard() {
  const identity = useAppStore((s) => s.identityPublic);
  if (!identity) return null;
  return (
    <div className="metal-panel flex flex-col items-center rounded-xl p-6 text-center">
      <Image src="/fastguns-logo.png" alt="" width={56} height={56} className="mb-4 rounded-xl opacity-90" />
      <p className="font-mono text-[10px] tracking-[0.24em] text-metal uppercase">Device identity</p>
      <p className="mt-1 text-[16px] font-medium text-silver">{identity.name || "Anonymous"}</p>
      <div className="mt-3">
        <QrDisplay
          payload={encodeInvite({ v: 1, app: "fastguns", code: "IDENTITY", fp: identity.fingerprint, name: identity.name })}
          size={172}
        />
      </div>
      <FingerprintText fp={identity.fingerprint} className="mt-3 block" />
      <p className="mt-3 max-w-xs text-[11px] leading-relaxed text-muted-foreground">
        This QR contains public identity data only. Peers can use it to confirm
        they are talking to this device.
      </p>
    </div>
  );
}

export function BackArrow() {
  return <ArrowLeft className="size-4" />;
}
