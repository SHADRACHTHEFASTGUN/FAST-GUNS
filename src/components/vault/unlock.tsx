"use client";

/**
 * FAST GUNS — unlock vault.
 * Black screen. Emblem. Password. Real GCM-authenticated unlock.
 */

import { useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAppStore } from "@/store/app-store";
import {
  ConfirmDialog,
  Spinner,
  VignetteBackdrop,
  Wordmark,
} from "@/components/common";
import { FileUp, LockKeyhole } from "lucide-react";
import { recoveryImportFromFile } from "@/components/recovery-import";
import { cn } from "@/lib/utils";

export function Unlock() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [wipeOpen, setWipeOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const unlockVault = useAppStore((s) => s.unlockVault);
  const wipeEverything = useAppStore((s) => s.wipeEverything);
  const vaultMeta = useAppStore((s) => s.vaultMeta);
  const recoveryImport = useAppStore((s) => s.recoveryImport);

  const submit = async () => {
    if (!password || busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await unlockVault(password);
    setBusy(false);
    if (!ok) {
      setFailed(true);
      setAttempts((a) => a + 1);
      setPassword("");
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-ink grain">
      <VignetteBackdrop />
      <header className="relative z-10 flex items-center justify-between px-5 pt-safe sm:px-8">
        <div className="flex items-center gap-3 py-4">
          <Image src="/fastguns-logo.png" alt="FAST GUNS emblem" width={30} height={30} className="rounded-md" />
          <Wordmark />
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-sm flex-1 flex-col items-center justify-center px-5 pb-24">
        <div className="breathe mb-8 drop-shadow-[0_24px_48px_rgba(0,0,0,0.85)]">
          <Image
            src="/fastguns-logo.png"
            alt="FAST GUNS emblem"
            width={120}
            height={120}
            className="rounded-xl border border-white/5"
            priority
          />
        </div>

        <h1 className="font-mono text-[13px] font-semibold tracking-[0.3em] text-silver uppercase">
          Unlock vault
        </h1>
        <p className="mt-2 text-center text-[12px] text-muted-foreground">
          Enter the vault password to decrypt this device&rsquo;s records.
        </p>

        <form
          className="mt-8 w-full"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <Label htmlFor="unlock-password" className="sr-only">
            Vault password
          </Label>
          <Input
            id="unlock-password"
            type="password"
            autoFocus
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setFailed(false);
            }}
            placeholder="Vault password"
            className={cn(
              "h-13 rounded-xl border-input bg-surface px-4 py-3.5 text-center text-[15px] tracking-wide",
              failed && "animate-pulse border-alert"
            )}
          />
          {failed ? (
            <p className="mt-2 text-center font-mono text-[11px] tracking-[0.14em] text-red-300 uppercase">
              Wrong password — decryption failed
              {attempts > 1 ? ` (${attempts} attempts)` : ""}
            </p>
          ) : null}
          <Button
            type="submit"
            size="lg"
            disabled={!password || busy}
            className="mt-4 h-12 w-full rounded-xl font-mono text-[12px] font-semibold tracking-[0.24em] uppercase"
          >
            {busy ? <Spinner className="text-primary-foreground" /> : <LockKeyhole className="size-4" />}
            {busy ? "Deriving key…" : "Unlock"}
          </Button>
        </form>

        {vaultMeta ? (
          <p className="mt-6 font-mono text-[10px] tracking-[0.18em] text-muted-foreground uppercase">
            Vault created {new Date(vaultMeta.createdAt).toLocaleDateString()} · PBKDF2 ×
            {vaultMeta.iterations.toLocaleString()}
          </p>
        ) : null}

        <div className="mt-10 flex w-full flex-col items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 font-mono text-[10px] tracking-[0.2em] text-metal uppercase transition-colors hover:text-silver"
          >
            <FileUp className="size-3.5" /> Import encrypted backup
          </button>
          <button
            onClick={() => setWipeOpen(true)}
            className="font-mono text-[10px] tracking-[0.2em] text-muted-foreground/70 uppercase transition-colors hover:text-red-300"
          >
            Lost password? Erase this vault
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept=".json,.fastguns,application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            void recoveryImportFromFile(file, recoveryImport);
            e.target.value = "";
          }}
        />
      </main>

      <ConfirmDialog
        open={wipeOpen}
        onOpenChange={setWipeOpen}
        title="Erase this vault?"
        description="Without the password the encrypted data cannot be opened — by anyone. Erasing removes your identity, contacts and every stored conversation from this device. A backup file can restore your identity afterwards."
        confirmLabel="Erase everything"
        requirePhrase="ERASE"
        onConfirm={() => {
          void wipeEverything();
        }}
      />

      <footer className="relative z-10 mt-auto pb-6 text-center font-mono text-[9px] tracking-[0.24em] text-muted-foreground/60 uppercase pb-safe">
        Private by architecture · Nothing leaves this device unlocked
      </footer>
    </div>
  );
}
