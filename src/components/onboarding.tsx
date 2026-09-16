"use client";

/**
 * FAST GUNS — onboarding.
 * Step 1 identity name → step 2 vault password → real key forging (hacker
 * terminal wired to REAL crypto stage callbacks) → step 3 backup → vault.
 *
 * HONESTY: WebCrypto PBKDF2 runs as one atomic 600k-round call and exposes
 * no intermediate progress. The terminal's iteration ticker and hex stream
 * are visualisation only (hex = real CSPRNG output) and are labelled as such.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app-store";
import { assessPasswordStrength } from "@/crypto/vault";
import type { ForgeStage } from "@/crypto/identity";
import {
  ConfirmDialog,
  FingerprintText,
  VignetteBackdrop,
  Wordmark,
} from "@/components/common";
import { AlertTriangle, ArrowRight, Check, Download, KeyRound, Lock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

type Step = 0 | 1 | 2 | 3;

const STEP_TITLES = ["Identity", "Vault", "Forge", "Backup"];

interface StageHit {
  stage: ForgeStage;
  at: number;
}

export function Onboarding() {
  const [step, setStep] = useState<Step>(0);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [forging, setForging] = useState(false);
  const [forgeDone, setForgeDone] = useState(false);
  const [stageHits, setStageHits] = useState<StageHit[]>([]);
  const [backupDone, setBackupDone] = useState(false);
  const [backupPassword, setBackupPassword] = useState("");
  const [skipConfirm, setSkipConfirm] = useState(false);

  const createIdentityAndVault = useAppStore((s) => s.createIdentityAndVault);
  const exportBackup = useAppStore((s) => s.exportBackup);
  const cancelOnboarding = useAppStore((s) => s.cancelOnboarding);
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  const identityPublic = useAppStore((s) => s.identityPublic);

  // trigger the real crypto work on the "forge" step — wired to REAL stages
  useEffect(() => {
    if (step !== 2 || !forging) return;
    let cancelled = false;
    const t0 = performance.now();
    const run = async () => {
      try {
        await createIdentityAndVault(name, password, (stage: ForgeStage) => {
          if (!cancelled) {
            setStageHits((prev) => [...prev, { stage, at: (performance.now() - t0) / 1000 }]);
          }
        });
        if (!cancelled) {
          setForging(false);
          setForgeDone(true);
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
  }, [step, forging, name, password, createIdentityAndVault]);

  const pwStrength = assessPasswordStrength(password);
  const passwordsMatch = password.length > 0 && password === confirm;
  const canForge = name.trim().length >= 2 && passwordsMatch && pwStrength.score >= 2;

  if (step === 2) {
    return (
      <ForgeScreen
        stageHits={stageHits}
        fingerprint={identityPublic?.fingerprint ?? null}
        done={forgeDone}
        onContinue={() => setStep(3)}
      />
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-ink grain">
      <VignetteBackdrop />
      <header className="relative z-10 flex items-center justify-between px-5 pt-safe sm:px-8">
        <div className="flex items-center gap-3 py-4">
          <Image src="/fastguns-logo.png" alt="FAST GUNS emblem" width={34} height={34} className="select-none" />
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
                setStageHits([{ stage: "init", at: 0 }]);
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
        onConfirm={() => {
          setSkipConfirm(false);
          completeOnboarding();
        }}
      />
    </div>
  );
}

function EnterButton() {
  const completeOnboarding = useAppStore((s) => s.completeOnboarding);
  return (
    <Button
      size="lg"
      onClick={completeOnboarding}
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

function StrengthMeter({ score }: { score: number }) {
  return (
    <div className="flex gap-1" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1 flex-1 rounded-full",
            i < score ? (score >= 3 ? "bg-silver" : "bg-metal") : "bg-charcoal"
          )}
        />
      ))}
    </div>
  );
}

/* ================================================================== */
/* FORGE TERMINAL — hacker-style, wired to REAL crypto stage callbacks */
/* ================================================================== */

const STAGE_ORDER: { stage: ForgeStage; cmd: string; desc: string }[] = [
  { stage: "keygen-ecdh", cmd: "gen --curve P-256 --use ECDH", desc: "ECDH keypair" },
  { stage: "keygen-ecdsa", cmd: "gen --curve P-256 --use ECDSA", desc: "signing keypair" },
  { stage: "fingerprint", cmd: "hash SHA-256 → base32", desc: "identity fingerprint" },
  { stage: "kdf", cmd: "kdf PBKDF2-SHA256 --rounds 600000", desc: "vault KEK derivation" },
  { stage: "seal", cmd: "seal AES-256-GCM --aad fastguns-vault-v1", desc: "wrap vault DEK" },
  { stage: "unwrap", cmd: "verify --roundtrip DEK", desc: "key unwrap proof" },
  { stage: "persist", cmd: "write → IndexedDB (sealed)", desc: "encrypted records" },
];

function ForgeScreen({
  stageHits,
  fingerprint,
  done,
  onContinue,
}: {
  stageHits: StageHit[];
  fingerprint: string | null;
  done: boolean;
  onContinue: () => void;
}) {
  const kdfIdx = STAGE_ORDER.findIndex((s) => s.stage === "kdf");
  const kdfRunning =
    stageHits.some((h) => h.stage === "kdf") && !stageHits.some((h) => h.stage === "seal");
  const stageIdxFor = (stage: ForgeStage) =>
    stageHits.reduce((acc, h, i) => (h.stage === stage ? i : acc), -1);

  return (
    <div className="relative flex min-h-screen flex-col bg-ink grain">
      <VignetteBackdrop />

      <main className="relative z-10 mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        {/* terminal window */}
        <div className="metal-panel-elevated overflow-hidden rounded-xl border border-border/80 font-mono shadow-[0_30px_80px_rgba(0,0,0,0.7)]">
          {/* title bar */}
          <div className="flex items-center justify-between border-b border-border/70 bg-[#0b0b0b] px-4 py-2.5">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-alert hard-blink" aria-hidden />
              <span className="text-[10px] tracking-[0.24em] text-silver uppercase">
                fastguns://secure-forge
              </span>
            </div>
            <span className="text-[9px] tracking-[0.2em] text-metal uppercase">
              ECDH·P-256 / ECDSA·P-256 / AES-256-GCM
            </span>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1.5fr_1fr]">
            {/* log stream */}
            <div className="border-border/70 p-4 sm:p-5 lg:border-r">
              <p className="mb-3 text-[10px] tracking-[0.2em] text-metal uppercase">
                root@fastguns:~$ ./forge --identity --vault
              </p>
              <ol className="space-y-2">
                <LogLine
                  label="init"
                  detail="WebCrypto secure context verified"
                  state={stageHits.length > 0 ? "done" : "running"}
                  at={0}
                />
                {STAGE_ORDER.map((s) => {
                  const hitIdx = stageIdxFor(s.stage);
                  const state: "pending" | "running" | "done" =
                    hitIdx >= 0
                      ? s.stage === "persist" && !done
                        ? "running"
                        : "done"
                      : stageHits.length > 0 && kdfIdx >= 0
                        ? pendingState(stageHits, STAGE_ORDER, s.stage)
                        : "pending";
                  return (
                    <LogLine
                      key={s.stage}
                      label={s.cmd}
                      detail={s.desc}
                      state={state}
                      at={hitIdx >= 0 ? stageHits[hitIdx].at : null}
                    />
                  );
                })}
              </ol>

              {done && fingerprint ? (
                <div className="mt-4 rounded-lg border border-silver/20 bg-surface p-3">
                  <p className="text-[9px] tracking-[0.24em] text-metal uppercase">
                    Identity forged — fingerprint
                  </p>
                  <div className="mt-1">
                    <FingerprintText fp={fingerprint} />
                  </div>
                </div>
              ) : null}
            </div>

            {/* entropy panel */}
            <div className="flex flex-col gap-4 border-t border-border/70 bg-[#0a0a0a] p-4 sm:p-5 lg:border-t-0">
              <EntropyPanel active={stageHits.length > 0} />
              {kdfRunning ? <KdfTicker /> : null}
            </div>
          </div>

          {/* progress + honest note */}
          <div className="border-t border-border/70 px-4 py-3 sm:px-5">
            <div className="flex gap-1.5" aria-hidden>
              {STAGE_ORDER.map((s, i) => {
                const hit = stageIdxFor(s.stage) >= 0;
                return (
                  <span
                    key={s.stage}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors duration-300",
                      hit ? (i === STAGE_ORDER.length - 1 && !done ? "bg-silver/60" : "bg-silver") : "bg-charcoal"
                    )}
                  />
                );
              })}
            </div>
            <p className="mt-2.5 text-[9.5px] leading-relaxed text-muted-foreground">
              HONESTY: WebCrypto PBKDF2 is one atomic 600 000-round call — it exposes no true
              intermediate progress. The ticker below-left is a UI estimate and the hex stream
              is real CSPRNG output (visual). Nothing here is faked as crypto.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col items-center gap-4">
          {done ? (
            <Button
              size="lg"
              onClick={onContinue}
              className="h-12 min-w-56 rounded-xl bg-alert font-mono text-[12px] font-bold tracking-[0.2em] text-white uppercase hover:bg-[#a51515]"
            >
              Continue → backup <ArrowRight className="ml-1 size-4" />
            </Button>
          ) : null}
          <Image
            src="/fastguns-logo.png"
            alt=""
            width={72}
            height={72}
            className={cn("select-none drop-shadow-[0_16px_36px_rgba(0,0,0,0.85)]", !done && "spin-slow opacity-80")}
          />
        </div>
      </main>
    </div>
  );
}

function pendingState(
  hits: StageHit[],
  order: { stage: ForgeStage }[],
  stage: ForgeStage
): "pending" | "running" {
  // a stage is "running" if the previous stage just completed and it's next
  const completed = new Set(hits.map((h) => h.stage));
  const idx = order.findIndex((s) => s.stage === stage);
  if (idx > 0 && completed.has(order[idx - 1].stage) && !completed.has(stage)) return "running";
  if (idx === 0 && completed.size > 0 && !completed.has(stage)) return "running";
  return "pending";
}

function LogLine({
  label,
  detail,
  state,
  at,
}: {
  label: string;
  detail: string;
  state: "pending" | "running" | "done";
  at: number | null;
}) {
  return (
    <li className="flex items-baseline gap-2 text-[11px] leading-relaxed sm:text-[11.5px]">
      <span className="w-14 shrink-0 text-right text-[9px] text-metal tabular">
        {at !== null ? `t+${at.toFixed(2)}s` : "t+ ····"}
      </span>
      <span className="shrink-0">
        {state === "done" ? (
          <Check className="size-3.5 translate-y-0.5 text-silver" aria-label="pass" />
        ) : state === "running" ? (
          <span className="inline-block size-3.5 translate-y-0.5 animate-pulse rounded-full border border-silver" aria-label="running" />
        ) : (
          <span className="inline-block size-3.5 translate-y-0.5 rounded-full border border-charcoal" aria-label="pending" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("break-all", state === "pending" ? "text-muted-foreground/50" : "text-silver")}>
          [{label}]
        </span>{" "}
        <span className={cn("text-muted-foreground", state === "pending" && "opacity-50")}>
          — {detail}
        </span>
        {state === "done" ? <span className="text-[10px] tracking-[0.18em] text-silver"> OK</span> : null}
      </span>
    </li>
  );
}

/** Live hex stream — REAL crypto.getRandomValues output, visual only. */
function HexStream({ active }: { active: boolean }) {
  const [lines, setLines] = useState<string[]>([]);
  useEffect(() => {
    if (!active) return;
    const push = () => {
      const bytes = new Uint8Array(10);
      crypto.getRandomValues(bytes);
      const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(" ");
      setLines((prev) => [hex, ...prev].slice(0, 9));
    };
    push();
    const t = setInterval(push, 130);
    return () => clearInterval(t);
  }, [active]);

  return (
    <div className="space-y-0.5 text-[9.5px] leading-relaxed text-silver/80">
      {lines.length === 0 ? <span className="text-metal">awaiting entropy…</span> : null}
      {lines.map((l, i) => (
        <p key={`${i}-${l}`} style={{ opacity: 1 - i * 0.09 }}>
          {l}
        </p>
      ))}
    </div>
  );
}

/** Entropy sparkline — real CSPRNG samples rendered as bars. */
function Sparkline({ active }: { active: boolean }) {
  const [bars, setBars] = useState<number[]>(() => Array.from({ length: 28 }, () => 0.1));
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => {
      const bytes = new Uint8Array(28);
      crypto.getRandomValues(bytes);
      setBars(Array.from(bytes, (b) => 0.15 + (b / 255) * 0.85));
    }, 120);
    return () => clearInterval(t);
  }, [active]);
  return (
    <div className="flex h-10 items-end gap-[3px]" aria-hidden>
      {bars.map((b, i) => (
        <span
          key={i}
          className="flex-1 rounded-t-sm bg-silver/70 transition-[height] duration-100"
          style={{ height: `${b * 100}%` }}
        />
      ))}
    </div>
  );
}

function EntropyPanel({ active }: { active: boolean }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <p className="text-[9px] tracking-[0.24em] text-metal uppercase">CSPRNG pool · live</p>
        {active ? <span className="size-1.5 animate-pulse rounded-full bg-alert" /> : null}
      </div>
      <Sparkline active={active} />
      <div className="mt-3">
        <HexStream active={active} />
      </div>
    </div>
  );
}

/**
 * Iteration ticker for the PBKDF2 stage. HONEST: this is a UI estimate —
 * WebCrypto gives no progress events. It eases toward 600 000 and snaps to
 * VERIFIED when the stage completes.
 */
function KdfTicker() {
  const target = 600_000;
  const [shown, setShown] = useState(0);
  const start = useRef<number>(0);
  useEffect(() => {
    start.current = performance.now();
    let raf = 0;
    const ease = () => {
      const elapsed = (performance.now() - start.current) / 1000;
      // ease toward target assuming ~2.5s derivation; never quite reaches it
      const estimate = Math.min(target * 0.97, (elapsed / 2.5) * target);
      setShown(Math.floor(estimate));
      raf = requestAnimationFrame(ease);
    };
    raf = requestAnimationFrame(ease);
    return () => cancelAnimationFrame(raf);
  }, []);
  const pct = ((shown / target) * 100).toFixed(1);
  return (
    <div className="rounded-lg border border-silver/15 bg-surface p-3">
      <div className="flex items-baseline justify-between">
        <p className="text-[9px] tracking-[0.24em] text-metal uppercase">PBKDF2 rounds</p>
        <p className="text-[11px] text-silver tabular">{pct}%</p>
      </div>
      <p className="mt-1 text-[19px] font-bold text-silver tabular">
        {shown.toLocaleString("en-US")}
        <span className="ml-1 text-[10px] text-metal">/ 600 000</span>
      </p>
      <p className="mt-1 text-[8.5px] leading-relaxed text-muted-foreground">
        UI estimate — WebCrypto exposes no real progress for this call.
      </p>
    </div>
  );
}
