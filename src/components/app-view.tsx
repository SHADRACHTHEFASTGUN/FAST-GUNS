"use client";

/**
 * FAST GUNS — application view controller.
 * Single-route SPA: phase machine (boot → landing/onboarding/unlock → app)
 * plus overlay routing for chat/contacts/verify/connect/security screens.
 */

import { useEffect } from "react";
import Image from "next/image";
import { useAppStore } from "@/store/app-store";
import { useAutoLock } from "@/hooks/use-auto-lock";
import { AppShell, OverlayPanel } from "@/components/shell";
import { Landing } from "@/components/landing";
import { Onboarding } from "@/components/onboarding";
import { Unlock } from "@/components/vault/unlock";
import { ChatList, ConnectOverlay } from "@/components/chats";
import { ChatView } from "@/components/chat";
import { Contacts, ContactDetail, VerifyIdentity, DeviceIdentityCard } from "@/components/contacts";
import { About, SecurityCenter, SecurityLog, ThreatModel } from "@/components/security";
import { BackupOverlay, Settings } from "@/components/settings";
import { WantedBoard } from "@/components/wanted";
import { BackupImportDialog } from "@/components/recovery-import";
import { ServiceWorkerRegistration } from "@/components/sw-registration";
import { Button } from "@/components/ui/button";
import { VignetteBackdrop, Wordmark } from "@/components/common";
import { ShieldAlert, X } from "lucide-react";

export function FastGunsApp() {
  const phase = useAppStore((s) => s.phase);
  const boot = useAppStore((s) => s.boot);
  const tab = useAppStore((s) => s.tab);
  const overlay = useAppStore((s) => s.overlay);
  const identityAlert = useAppStore((s) => s.identityAlert);
  const dismissIdentityAlert = useAppStore((s) => s.dismissIdentityAlert);
  const contacts = useAppStore((s) => s.contacts);

  useAutoLock();

  useEffect(() => {
    void boot();
  }, [boot]);

  // PWA offline shell (static assets only — never message data)
  // mounted for all phases so the SW is registered on first visit
  return (
    <PwaRoot>
      {phase === "boot" ? (
        <BootSplash />
      ) : phase === "landing" ? (
        <Landing />
      ) : phase === "onboarding" ? (
        <Onboarding />
      ) : phase === "unlock" ? (
        <Unlock />
      ) : (
        <AppPhase
          tab={tab}
          overlay={overlay}
          identityAlert={identityAlert}
          dismissIdentityAlert={dismissIdentityAlert}
          contacts={contacts}
        />
      )}
    </PwaRoot>
  );
}

function PwaRoot({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ServiceWorkerRegistration />
      {children}
    </>
  );
}

function AppPhase({
  tab,
  overlay,
  identityAlert,
  dismissIdentityAlert,
  contacts,
}: {
  tab: string;
  overlay: { name: string; contactId?: string } | null;
  identityAlert: { expectedFp: string; actualFp: string } | null;
  dismissIdentityAlert: () => void;
  contacts: { id: string; name: string; fingerprint: string }[];
}) {
  const alertContact = identityAlert
    ? contacts.find((c) => c.fingerprint === identityAlert.expectedFp)
    : null;

  return (
    <>
      <AppShell>
        {tab === "chats" ? <ChatList /> : null}
        {tab === "wanted" ? <WantedBoard /> : null}
        {tab === "contacts" ? <Contacts /> : null}
        {tab === "security" ? <SecurityCenter /> : null}
        {tab === "settings" ? <Settings /> : null}
      </AppShell>

      {overlay ? (
        <OverlayPanel>
          {overlay.name === "connect" ? <ConnectOverlay /> : null}
          {overlay.name === "chat" && overlay.contactId ? <ChatView /> : null}
          {overlay.name === "contact-detail" && overlay.contactId ? (
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 lg:px-6 lg:pb-6">
              <ContactDetail contactId={overlay.contactId} />
            </div>
          ) : null}
          {overlay.name === "verify" && overlay.contactId ? (
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 lg:px-6 lg:pb-6">
              <VerifyIdentity contactId={overlay.contactId} />
            </div>
          ) : null}
          {overlay.name === "backup" ? (
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 lg:px-6 lg:pb-6">
              <BackupOverlay />
            </div>
          ) : null}
          {overlay.name === "security-log" ? (
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 lg:px-6 lg:pb-6">
              <SecurityLog />
            </div>
          ) : null}
          {overlay.name === "threat-model" ? (
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 lg:px-6 lg:pb-6">
              <ThreatModel />
            </div>
          ) : null}
          {overlay.name === "about" ? (
            <div className="flex-1 overflow-y-auto px-4 pt-4 pb-28 lg:px-6 lg:pb-6">
              <About />
            </div>
          ) : null}
          {overlay.name === "identity" ? (
            <div className="flex flex-1 flex-col overflow-y-auto px-4 pt-4 pb-28 lg:px-6 lg:pb-6">
              <IdentityQrPanel />
            </div>
          ) : null}        </OverlayPanel>
      ) : null}

      <BackupImportDialog />

      {/* SECURITY ALERT — identity key changed */}
      {identityAlert ? (
        <div className="fixed inset-x-0 top-0 z-50 px-3 pt-safe">
          <div className="mx-auto mt-2 max-w-xl rounded-xl border border-alert/60 bg-[#1a0d0d] p-4 shadow-[0_16px_48px_rgba(0,0,0,0.7)]">
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-red-300" />
              <div className="min-w-0 flex-1">
                <p className="font-mono text-[11px] font-semibold tracking-[0.2em] text-red-300 uppercase">
                  Security alert — identity key changed
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-red-100">
                  {alertContact ? `${alertContact.name}'s` : "This peer's"} identity key does not
                  match the one previously recorded. Do not assume this is safe
                  until you verify the new fingerprint through a trusted
                  channel.
                </p>
                <p className="mt-2 font-mono text-[10px] leading-relaxed text-red-200/80">
                  expected {identityAlert.expectedFp.slice(0, 12)}… · got{" "}
                  {identityAlert.actualFp.slice(0, 12)}…
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={dismissIdentityAlert}
                  className="mt-3 h-8 border-red-300/30 font-mono text-[10px] tracking-[0.16em] text-red-200 uppercase hover:bg-red-300/10"
                >
                  Acknowledge
                </Button>
              </div>
              <button
                onClick={dismissIdentityAlert}
                className="rounded-lg p-1.5 text-red-300/70 hover:text-red-200"
                aria-label="Dismiss security alert"
              >
                <X className="size-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function IdentityQrPanel() {
  const closeOverlay = useAppStore((s) => s.closeOverlay);
  const identity = useAppStore((s) => s.identityPublic);
  return (
    <div>
      <header className="mb-4 flex items-center justify-between">
        <h1 className="font-mono text-[13px] font-semibold tracking-[0.24em] text-silver uppercase">
          My identity
        </h1>
        <Button variant="outline" size="icon" onClick={closeOverlay} className="size-9 rounded-lg border-input text-silver" aria-label="Close">
          <X className="size-4" />
        </Button>
      </header>
      {identity ? <DeviceIdentityCard /> : null}
    </div>
  );
}

function BootSplash() {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-ink grain">
      <VignetteBackdrop />
      <div className="relative z-10 flex flex-col items-center">
        <div className="breathe">
          <Image
            src="/fastguns-logo.png"
            alt="FAST GUNS"
            width={168}
            height={168}
            className="select-none drop-shadow-[0_28px_56px_rgba(0,0,0,0.9)]"
            priority
          />
        </div>
        <div className="mt-8">
          <Wordmark />
        </div>
        <p className="mt-3 font-mono text-[9px] tracking-[0.32em] text-metal uppercase">
          Secure communications device
        </p>
        <div className="mt-6 h-px w-24 overflow-hidden bg-charcoal">
          <div className="hard-blink h-full w-1/3 bg-alert" />
        </div>
      </div>
    </div>
  );
}
