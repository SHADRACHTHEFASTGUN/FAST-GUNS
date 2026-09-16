"use client";

/**
 * FAST GUNS — settings.
 * Identity, vault/auto-lock, backup, network info, appearance (dark
 * locked, honestly), storage, and destructive actions with multi-step
 * confirmation.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppStore } from "@/store/app-store";
import {
  ConfirmDialog,
  FingerprintText,
  KeyRow,
  ScreenHeader,
  SectionCard,
  Spinner,
} from "@/components/common";
import { openBackupImportFlow } from "@/components/recovery-import";
import { Download, FileUp, Lock, Palette, Save, Settings2, Trash2, Wifi } from "lucide-react";

export function Settings() {
  const identity = useAppStore((s) => s.identityPublic);
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const openOverlay = useAppStore((s) => s.openOverlay);
  const lockVault = useAppStore((s) => s.lockVault);
  const wipeEverything = useAppStore((s) => s.wipeEverything);
  const refreshStorageStats = useAppStore((s) => s.refreshStorageStats);
  const storageUsage = useAppStore((s) => s.storageUsage);
  const inAppImport = useAppStore((s) => s.inAppImport);

  const [name, setName] = useState(identity?.name ?? "");
  const [saved, setSaved] = useState(false);
  const [wipeOpen, setWipeOpen] = useState(false);
  const backupFileRef = useRef<HTMLInputElement>(null);

  // render-time state adjustment when the identity record changes
  const identityName = identity?.name ?? "";
  const [prevIdentityName, setPrevIdentityName] = useState(identityName);
  if (prevIdentityName !== identityName) {
    setPrevIdentityName(identityName);
    setName(identityName);
  }

  useEffect(() => {
    void refreshStorageStats();
  }, [refreshStorageStats]);

  const saveName = async () => {
    if (!name.trim()) return;
    await updateSettings({ displayName: name.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
  };

  return (
    <div className="fade-up space-y-4">
      <ScreenHeader title="Settings" subtitle="Local preferences only — nothing syncs" />

      <SectionCard title="Identity" icon={<Settings2 className="size-3.5" />}>
        <Label htmlFor="display-name" className="font-mono text-[9px] tracking-[0.2em] text-metal uppercase">
          Display name
        </Label>
        <div className="mt-1.5 flex gap-2">
          <Input
            id="display-name"
            value={name}
            maxLength={32}
            onChange={(e) => setName(e.target.value)}
            className="h-10 flex-1 rounded-lg border-input bg-ink text-[14px]"
          />
          <Button
            variant="outline"
            size="icon"
            onClick={() => void saveName()}
            className="size-10 shrink-0 rounded-lg border-input text-silver"
            aria-label="Save name"
          >
            {saved ? <Save className="size-4" /> : <Save className="size-4" />}
          </Button>
        </div>
        {identity ? (
          <div className="mt-3">
            <KeyRow label="Fingerprint" value={<FingerprintText fp={identity.fingerprint} compact />} />
          </div>
        ) : null}
      </SectionCard>

      <SectionCard title="Vault & auto-lock" icon={<Lock className="size-3.5" />}>
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] text-foreground">Lock when idle</p>
              <p className="text-[11px] text-muted-foreground">Clears keys from memory.</p>
            </div>
            <Select
              value={String(settings.autoLockMinutes)}
              onValueChange={(v) => void updateSettings({ autoLockMinutes: Number(v) })}
            >
              <SelectTrigger className="w-28 rounded-lg border-input bg-ink font-mono text-[11px] uppercase">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="border-border bg-popover">
                <SelectItem value="1">1 min</SelectItem>
                <SelectItem value="5">5 min</SelectItem>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="60">60 min</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[13px] text-foreground">Lock when app hides</p>
              <p className="text-[11px] text-muted-foreground">30s after tab switch / background.</p>
            </div>
            <Switch
              checked={settings.lockOnHide}
              onCheckedChange={(v) => void updateSettings({ lockOnHide: v })}
              aria-label="Lock when app hides"
            />
          </div>
          <Button
            variant="outline"
            onClick={lockVault}
            className="h-10 w-full rounded-lg border-input font-mono text-[10px] tracking-[0.18em] text-silver uppercase hover:bg-charcoal"
          >
            <Lock className="size-3.5" /> Lock now
          </Button>
        </div>
      </SectionCard>

      <SectionCard title="Backup" icon={<Download className="size-3.5" />}>
        <p className="mb-3 text-[12px] leading-relaxed text-muted-foreground">
          Encrypted export / import lives in the Backup screen. Backups are
          never uploaded anywhere.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => openOverlay({ name: "backup" })}
            className="h-9 border-input font-mono text-[10px] tracking-[0.16em] text-silver uppercase hover:bg-charcoal"
          >
            Manage backup
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              backupFileRef.current?.click()
            }
            className="h-9 border-input font-mono text-[10px] tracking-[0.16em] text-silver uppercase hover:bg-charcoal"
          >
            <FileUp className="size-3.5" /> Import file
          </Button>
        </div>
        <input
          ref={backupFileRef}
          type="file"
          accept=".json,.fastguns,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openBackupImportFlow({ file: f, onImport: inAppImport });
            e.target.value = "";
          }}
        />
      </SectionCard>

      <SectionCard title="Network" icon={<Wifi className="size-3.5" />}>
        <KeyRow label="Transport" value="WebRTC DataChannel (ordered, reliable)" />
        <KeyRow label="NAT traversal" value="STUN: stun.l.google.com:19302" />
        <KeyRow label="Signaling" value="Ephemeral relay · TTL 10 min · stores nothing" />
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          If both peers are behind strict NATs and no TURN server is
          configured, direct connection can fail — this is stated honestly
          rather than hidden.
        </p>
      </SectionCard>

      <SectionCard title="Appearance" icon={<Palette className="size-3.5" />}>
        <div className="flex items-center gap-3">
          <Image src="/fastguns-logo.png" alt="" width={40} height={40} className="rounded-lg opacity-90" />
          <div>
            <p className="text-[13px] text-foreground">Dark. Locked.</p>
            <p className="text-[11px] text-muted-foreground">
              A private communications device doesn&rsquo;t need a light mode.
            </p>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Storage" icon={<Download className="size-3.5" />}>
        <KeyRow
          label="Used"
          value={storageUsage ? `${(storageUsage.usage / 1024 / 1024).toFixed(2)} MB` : "—"}
        />
        <KeyRow label="Records" value={storageUsage ? String(storageUsage.records) : "—"} />
        <p className="mt-2 text-[11px] text-muted-foreground">
          Deleting a conversation removes its ciphertext records; the OS may
          retain remnants on disk (an honest limitation of browser storage).
        </p>
      </SectionCard>

      <SectionCard title="Danger zone" icon={<Trash2 className="size-3.5" />} className="border-alert/30">
        <Button
          variant="destructive"
          onClick={() => setWipeOpen(true)}
          className="h-10 w-full rounded-lg font-mono text-[10px] tracking-[0.18em] uppercase"
        >
          <Trash2 className="size-3.5" /> Delete all data
        </Button>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Removes identity, contacts, conversations, attachments and logs from
          this device. Requires typing confirmation.
        </p>
      </SectionCard>

      <ConfirmDialog
        open={wipeOpen}
        onOpenChange={setWipeOpen}
        title="Delete all data?"
        description="This erases your identity and every locally stored record on this device. Without an encrypted backup file, nothing can be recovered — by anyone."
        confirmLabel="Erase everything"
        requirePhrase="DELETE"
        onConfirm={() => void wipeEverything()}
      />
    </div>
  );
}

/** Backup management overlay (export + import + recovery warnings) */
export function BackupOverlay() {
  const exportBackup = useAppStore((s) => s.exportBackup);
  const inAppImport = useAppStore((s) => s.inAppImport);
  const closeOverlay = useAppStore((s) => s.closeOverlay);

  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <div className="fade-up">
      <ScreenHeader title="Backup" subtitle="Your data is your responsibility" onBack={closeOverlay} />

      <SectionCard title="Export encrypted backup" icon={<Download className="size-3.5" />}>
        <Label htmlFor="export-password" className="font-mono text-[9px] tracking-[0.2em] text-metal uppercase">
          Backup password (separate from vault)
        </Label>
        <Input
          id="export-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 h-11 rounded-lg border-input bg-ink"
          placeholder="Min 8 characters"
        />
        <Button
          disabled={password.length < 8 || busy}
          onClick={async () => {
            setBusy(true);
            try {
              await exportBackup(password);
            } finally {
              setBusy(false);
            }
          }}
          className="mt-3 h-11 w-full rounded-xl font-mono text-[11px] tracking-[0.18em] uppercase"
        >
          {busy ? <Spinner className="text-primary-foreground" /> : <Download className="size-4" />}
          Download .fastguns.json
        </Button>
        <p className="mt-3 text-[12px] leading-relaxed text-muted-foreground">
          The file re-encrypts your identity (including private keys), contacts
          and message ciphertexts with PBKDF2 + AES-256-GCM under this separate
          password.
        </p>
      </SectionCard>

      <SectionCard title="Import backup" icon={<FileUp className="size-3.5" />} className="mt-4">
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          Restores identity and conversations from a backup file. This
          replaces all current local data.
        </p>
        <Button
          variant="outline"
          onClick={() => fileRef.current?.click()}
          className="mt-3 h-11 w-full rounded-xl border-input font-mono text-[10px] tracking-[0.18em] text-silver uppercase hover:bg-charcoal"
        >
          Choose backup file
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,.fastguns,application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) openBackupImportFlow({ file: f, onImport: inAppImport });
            e.target.value = "";
          }}
        />
      </SectionCard>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-alert/40 bg-alert/10 p-4">
        <Trash2 className="mt-0.5 size-4 shrink-0 text-red-300" />
        <p className="text-[12px] leading-relaxed text-red-200">
          If you lose this device AND your encrypted backup AND its password,
          your identity and locally stored messages are unrecoverable. Nothing
          and nobody can restore them.
        </p>
      </div>
    </div>
  );
}
