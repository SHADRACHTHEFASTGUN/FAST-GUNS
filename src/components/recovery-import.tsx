"use client";

/**
 * FAST GUNS — encrypted backup file import helper.
 * Reads a .fastguns.json file, asks for its backup password, then hands
 * the payload to the caller (recovery import or in-app import).
 */

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseBackupJson } from "@/crypto/backup";
import { Spinner } from "@/components/common";

interface PendingImport {
  fileText: string;
  fileName: string;
  mode?: "in-app" | "recovery";
  onImport:
    | ((fileText: string, backupPassword: string) => Promise<void>)
    | ((fileText: string, backupPassword: string, newVaultPassword: string) => Promise<void>);
}

const IMPORT_REQUEST = "fg-import-request";
const IMPORT_ERROR = "fg-import-error";

/** Imperative helper used from file inputs. `mode: "recovery"` asks for a
 *  NEW vault password in addition to the backup password (3-arg onImport). */
export function openBackupImportFlow(opts: {
  file: File;
  mode?: "in-app" | "recovery";
  onImport:
    | ((fileText: string, backupPassword: string) => Promise<void>)
    | ((fileText: string, backupPassword: string, newVaultPassword: string) => Promise<void>);
}): void {
  const reader = new FileReader();
  reader.onload = () => {
    const fileText = String(reader.result ?? "");
    try {
      parseBackupJson(fileText);
    } catch {
      window.dispatchEvent(
        new CustomEvent(IMPORT_ERROR, {
          detail: "This file is not a FAST GUNS encrypted backup.",
        })
      );
      return;
    }
    window.dispatchEvent(
      new CustomEvent(IMPORT_REQUEST, {
        detail: {
          fileText,
          fileName: opts.file.name,
          mode: opts.mode ?? "in-app",
          onImport: opts.onImport,
        },
      })
    );
  };
  reader.readAsText(opts.file);
}

export async function recoveryImportFromFile(
  file: File,
  onImport: (fileText: string, backupPassword: string, newVaultPassword: string) => Promise<void>
): Promise<void> {
  openBackupImportFlow({ file, mode: "recovery", onImport });
}

/** Global dialog mounted once in the app root. Supports recovery mode
 *  (backup password + NEW vault password) and in-app mode (backup password). */
export function BackupImportDialog() {
  const [pending, setPending] = useState<(PendingImport & { mode: "in-app" | "recovery" }) | null>(null);
  const [password, setPassword] = useState("");
  const [newVaultPassword, setNewVaultPassword] = useState("");
  const [confirmVaultPassword, setConfirmVaultPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onRequest = (evt: Event) => {
      const detail = (evt as CustomEvent).detail as PendingImport & { mode?: "in-app" | "recovery" };
      setPending({ ...detail, mode: detail.mode ?? "in-app" });
      setPassword("");
      setNewVaultPassword("");
      setConfirmVaultPassword("");
      setError(null);
    };
    const onError = (evt: Event) => {
      setError(String((evt as CustomEvent).detail));
    };
    window.addEventListener(IMPORT_REQUEST, onRequest);
    window.addEventListener(IMPORT_ERROR, onError);
    return () => {
      window.removeEventListener(IMPORT_REQUEST, onRequest);
      window.removeEventListener(IMPORT_ERROR, onError);
    };
  }, []);

  const recoveryReady =
    pending?.mode !== "recovery" ||
    (newVaultPassword.length >= 8 && newVaultPassword === confirmVaultPassword);

  const submit = async () => {
    if (!pending || !password || busy || !recoveryReady) return;
    setBusy(true);
    setError(null);
    try {
      if (pending.mode === "recovery") {
        await (pending.onImport as (t: string, p: string, n: string) => Promise<void>)(
          pending.fileText,
          password,
          newVaultPassword
        );
      } else {
        await (pending.onImport as (t: string, p: string) => Promise<void>)(pending.fileText, password);
      }
      setPending(null);
    } catch {
      setError("Wrong backup password or corrupted file.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
      <DialogContent className="metal-panel-elevated border-border sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-mono text-sm tracking-[0.18em] uppercase">
            {pending?.mode === "recovery" ? "Recover from backup" : "Import encrypted backup"}
          </DialogTitle>
          <DialogDescription className="pt-1 text-[13px] text-muted-foreground">
            {pending?.mode === "recovery"
              ? "A new local vault will be created and the backup restored into it."
              : pending
                ? `Enter the backup password for ${pending.fileName}.`
                : ""}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="backup-import-password" className="font-mono text-[9px] tracking-[0.2em] text-metal uppercase">
              Backup password
            </Label>
            <Input
              id="backup-import-password"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1.5 h-11 rounded-lg border-input bg-ink"
            />
          </div>
          {pending?.mode === "recovery" ? (
            <>
              <div>
                <Label htmlFor="new-vault-password" className="font-mono text-[9px] tracking-[0.2em] text-metal uppercase">
                  New vault password (min 8)
                </Label>
                <Input
                  id="new-vault-password"
                  type="password"
                  value={newVaultPassword}
                  onChange={(e) => setNewVaultPassword(e.target.value)}
                  className="mt-1.5 h-11 rounded-lg border-input bg-ink"
                />
              </div>
              <div>
                <Label htmlFor="confirm-vault-password" className="font-mono text-[9px] tracking-[0.2em] text-metal uppercase">
                  Confirm new vault password
                </Label>
                <Input
                  id="confirm-vault-password"
                  type="password"
                  value={confirmVaultPassword}
                  onChange={(e) => setConfirmVaultPassword(e.target.value)}
                  className="mt-1.5 h-11 rounded-lg border-input bg-ink"
                />
              </div>
            </>
          ) : null}
          {error ? (
            <p className="font-mono text-[11px] tracking-[0.12em] text-red-300 uppercase">{error}</p>
          ) : null}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="border-input" onClick={() => setPending(null)}>
            Cancel
          </Button>
          <Button disabled={!password || busy || !recoveryReady} onClick={() => void submit()}>
            {busy ? <Spinner className="text-primary-foreground" /> : null} Restore
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
