"use client";

/**
 * FAST GUNS — onboarding.
 * Step 1 identity name → step 2 vault password → real key forging →
 * step 3 encrypted backup → enter the vault.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app-store";
import { assessPasswordStrength } from "@/crypto/vault";
import {
  ConfirmDialog,
  FingerprintText,
  Spinner,
  StrengthMeter,
  VignetteBackdrop,
  Wordmark,
} from "@/components/common";
import { AlertTriangle, ArrowRight, Check, Download, KeyRound, Lock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Step = 0 | 1 | 2 | 3;

const STEP_TITLES = ["Identity", "Vault", "Forge", "Backup"];

export function Onboarding() {
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [forging, setForging] = useState(false);
  const [forgeStage, setForgeStage] = useState(0);
  const [backupDone, setBackupDone] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [skipConfirm, setSkipConfirm] = useState(false);

  const createIdentityAndVault = useAppStore((s) => s.createIdentityAndVault);
  const exportBackup = useAppStore((s) => s.exportBackup);
  const cancelOnboarding = useAppStore((s) => s.cancelOnboarding);
  const identityPublic = useAppStore((s) => s.identityPublic);

  // trigger the real crypto work on the "forge" step
  useEffect(() => {
    if (step !== 2 || !forging) return;
    let cancelled = false;
    const run = async () => {
      const stages = [
        [260, 1],
        [900, 2],
        [1500, 3],
      ] as const;
      for (const [delay, s] of stages) {
        await new Promise((r) => setTimeout(r, delay));
        if (cancelled) return;
        setForgeStage(s);
      }
      try {
        await createIdentityAndVault(name, password);
        if (!cancelled) {
          setForging(false);
          setStep(3);
        }
      } catch {
        if (!cancelled) {
          setForging(false);
          setStep(1);
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [step, forging]);

  const pwStrength = assessPasswordStrength(password);
  const passwordsMatch = password.length > 0 && password === confirm;
  const canForge = name.trim().length >= 2 && passwordsMatch && pwStrength.score >= 2;

  if (step === 2) {
    return (
      <ForgeScreen
        stage={forgeStage}
        fingerprint={identityPublic?.fingerprint ?? null}
      />
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-ink grain">
      <VignetteBackdrop />
      <header className="relative z-10 flex items-center justify-between px-5 pt-safe sm:px-8">
        <div className="flex items-center gap-3 py-4">
          <Image src="/fastguns-logo.png" alt="FAST GUNS emblem" width={30} height={30} className="rounded-md" />
          <Wordmark />
        </div>
        <button
          onClick={cancelOnboarding}
          className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase hover:text-silver"
        >
          Cancel
        </button>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-md flex-1 px-5 pb-16">
        {/* progress */}
        <ol className="mb-8 flex items-center gap-2" aria-label="Onboarding progress">
          {STEP_TITLES.map((t, i) => (
            <li key={t} className="flex flex-1 flex-col gap-1.5">
              <span
                className={cn(
                  "h-1 rounded-full",
                  i < step ? "bg-silver" : i === step ? "bg-silver/60" : "bg-charcoal"
                )}
              />
              <span
                className={cn(
                  "font-mono text-[9px] tracking-[0.18em] uppercase",
                  i <= step ? "text-silver" : "text-muted-foreground"
                )}
              >
                {t}
              </span>
            </li>
          ))}
        </ol>

        {step === 0 ? (
          <section className="fade-up">
            <StepHeading
              icon={<KeyRound className="size-4" />}
              title="Create your identity"
              body="A key pair is generated on this device. The private key is sealed inside your encrypted vault and never leaves it. No email, no phone number, no account."
            />
            <div className="metal-panel rounded-xl p-5">
              <Label htmlFor="identity-name" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
                Display name
              </Label>
              <Input
                id="identity-name"
                autoFocus
                value={name}
                maxLength={32}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ghost"
                className="mt-2 h-12 rounded-lg border-input bg-ink text-[15px]"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim().length >= 2) setStep(1);
                }}
              />
              <p className="mt-2 text-[12px] text-muted-foreground">
                Shared with peers during connection. Choose anything.
              </p>
            </div>
            <Button
              size="lg"
              disabled={name.trim().length < 2}
              onClick={() => setStep(1)}
              className="mt-5 h-12 w-full rounded-xl font-mono text-[12px] tracking-[0.2em] uppercase"
            >
              Continue <ArrowRight className="size-4" />
            </Button>
          </section>
        ) : null}

        {step === 1 ? (
          <section className="fade-up">
            <StepHeading
              icon={<Lock className="size-4" />}
              title="Secure your vault"
              body="This password derives your vault key with PBKDF2 (600,000 rounds). It is never stored or transmitted. If you lose it and your backup, your data cannot be recovered."
            />
            <div className="metal-panel space-y-4 rounded-xl p-5">
              <div>
                <Label htmlFor="vault-password" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
                  Vault password
                </Label>
                <Input
                  id="vault-password"
                  type="password"
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-2 h-12 rounded-lg border-input bg-ink text-[15px]"
                />
                <div className="mt-2.5">
                  <StrengthMeter score={pwStrength.score} />
                  <p className="mt-1.5 font-mono text-[10px] tracking-[0.16em] text-metal uppercase">
                    {pwStrength.label}
                    {pwStrength.issues.length ? ` — ${pwStrength.issues[0]}` : ""}
                  </p>
                </div>
              </div>
              <div>
                <Label htmlFor="vault-confirm" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
                  Confirm password
                </Label>
                <Input
                  id="vault-confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={cn(
                    "mt-2 h-12 rounded-lg border-input bg-ink text-[15px]",
                    confirm.length > 0 && !passwordsMatch && "border-alert"
                  )}
                />
              </div>
            </div>
            <Button
              size="lg"
              disabled={!canForge}
              onClick={() => {
                setForgeStage(0);
                setForging(true);
                setStep(2);
              }}
              className="mt-5 h-12 w-full rounded-xl font-mono text-[12px] tracking-[0.2em] uppercase"
            >
              Forge identity <ArrowRight className="size-4" />
            </Button>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="fade-up">
            <StepHeading
              icon={<ShieldAlert className="size-4" />}
              title="Save your backup"
              body="Your vault lives only on this device. An encrypted backup file restores your identity and conversations if this browser is ever cleared."
            />
            <div className="metal-panel space-y-4 rounded-xl p-5">
              <div>
                <Label htmlFor="backup-password" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
                  Backup password (separate from vault)
                </Label>
                <Input
                  id="backup-password"
                  type="password"
                  value={backupPassword}
                  onChange={(e) => setBackupPassword(e.target.value)}
                  className="mt-2 h-12 rounded-lg border-input bg-ink text-[15px]"
                />
              </div>
              <Button
                variant="outline"
                disabled={backupPassword.length < 8}
                onClick={async () => {
                  try {
                    await exportBackup(backupPassword);
                    setBackupDone(true);
                    toast({ title: "Backup downloaded", description: "Store it somewhere safe — it is encrypted, but treat it like a key." });
                  } catch {
                    toast({ title: "Backup failed", description: "Could not create the backup file.", variant: "destructive" });
                  }
                }}
                className="h-12 w-full rounded-xl border-metal/40 font-mono text-[11px] tracking-[0.2em] text-silver uppercase hover:bg-charcoal"
              >
                <Download className="size-4" /> Download encrypted backup
              </Button>
              {backupDone ? (
                <p className="flex items-center gap-2 text-[12px] text-silver">
                  <Check className="size-4" /> Backup file saved. Keep it private.
                </p>
              ) : (
                <p className="flex items-start gap-2 text-[12px] leading-relaxed text-muted-foreground">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-metal" />
                  Recommended. You can also create one later in Security.
                </p>
              )}
            </div>
            <div className="mt-5 flex items-center justify-between">
              <button
                onClick={() => setSkipConfirm(true)}
                className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground uppercase hover:text-silver"
              >
                Skip for now
              </button>
              <EnterButton />
            </div>
            <BackupNote />
          </section>
        ) : null}
      </main>

      <ConfirmDialog
        open={skipConfirm}
        onOpenChange={setSkipConfirm}
        title="Skip backup?"
        description="Without a backup, clearing this browser's storage deletes your identity and every conversation permanently. This cannot be undone by anyone."
        confirmLabel="Skip anyway"
        onConfirm={() => setSkipConfirm(false)}
      />
    </div>
  );
}

function EnterButton() {
  const setTab = useAppStore((s) => s.setTab);
  return (
    <Button
      size="lg"
      onClick={() => setTab("chats")}
      className="h-12 min-w-40 rounded-xl font-mono text-[12px] tracking-[0.2em] uppercase"
    >
      Enter vault <ArrowRight className="size-4" />
    </Button>
  );
}

function BackupNote() {
  return (
    <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
      Backups are never uploaded. They are files you keep.
    </p>
  );
}

function StepHeading({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="mb-5">
      <div className="mb-3 flex size-9 items-center justify-center rounded-lg border border-border bg-surface text-silver">
        {icon}
      </div>
      <h1 className="font-mono text-[15px] font-semibold tracking-[0.22em] text-silver uppercase">
        {title}
      </h1>
      <p className="mt-2 text-[13px] leading-relaxed text-muted-foreground">{body}</p>
    </div>
  );
}

function ForgeScreen({ stage, fingerprint }: { stage: number; fingerprint: string | null }) {
  const lines = [
    "Generating identity keys (ECDH P-256 · ECDSA P-256)…",
    "Deriving vault key — PBKDF2-SHA256 × 600,000…",
    "Sealing vault envelope (AES-256-GCM)…",
    "Writing encrypted records…",
  ];
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-ink px-6 grain">
      <VignetteBackdrop />
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="spin-slow mb-8">
          <Image src="/fastguns-logo.png" alt="" width={96} height={96} className="rounded-xl opacity-90" priority />
        </div>
        <h1 className="font-mono text-[13px] font-semibold tracking-[0.3em] text-silver uppercase">
          Forging identity
        </h1>
        <ul className="mt-6 space-y-2.5 text-left">
          {lines.map((line, i) => (
            <li key={line} className="flex items-center gap-2.5 font-mono text-[11px] text-muted-foreground">
              {i < stage ? (
                <Check className="size-3.5 text-silver" />
              ) : i === stage ? (
                <Spinner className="size-3.5" />
              ) : (
                <span className="size-3.5 rounded-full border border-charcoal" />
              )}
              <span className={cn(i <= stage && "text-silver")}>{line}</span>
            </li>
          ))}
        </ul>
        {fingerprint ? (
          <div className="mt-8">
            <p className="mb-1 font-mono text-[9px] tracking-[0.24em] text-metal uppercase">Identity fingerprint</p>
            <FingerprintText fp={fingerprint} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
