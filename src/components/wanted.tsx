"use client";

/**
 * FAST GUNS — WANTED board.
 * Encrypted wanted posters: alias, crime, bounty, status + encrypted photo
 * and video. Everything is sealed at rest:
 *   - poster record (incl. per-file keys) → AES-256-GCM under the vault DEK
 *   - media blobs → per-file random AES-256-GCM key, ciphertext in IndexedDB
 * Nothing ever leaves the device. Decryption happens in memory only.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/common";
import { useAppStore } from "@/store/app-store";
import * as vaultStore from "@/storage/vault-store";
import { encryptFile, decryptFile, MAX_ATTACHMENT_BYTES } from "@/crypto/files";
import { randomUuid } from "@/crypto/primitives";
import type { WantedMediaRef, WantedPoster, WantedStatus } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";
import {
  FileVideo,
  ImageIcon,
  Loader2,
  Lock,
  Plus,
  Skull,
  Trash2,
  X,
} from "lucide-react";

const STATUS_ORDER: WantedStatus[] = ["on-the-loose", "seen", "caught"];

const STAMP: Record<WantedStatus, { label: string; className: string }> = {
  "on-the-loose": {
    label: "OP DIE LOOPIES",
    className: "border-red-700 text-red-700",
  },
  seen: {
    label: "GESIEN",
    className: "border-neutral-700 text-neutral-800",
  },
  caught: {
    label: "GEMOER",
    className: "border-red-900 text-red-900 line-through",
  },
};

/* decrypted object URLs for this session only — revoked on unmount/delete */
const urlRegistry = new Map<string, string>();

export function WantedBoard() {
  const [posters, setPosters] = useState<WantedPoster[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const vaultStatus = useAppStore((s) => s.vaultStatus);

  useEffect(() => {
    if (vaultStatus !== "unlocked") return;
    let alive = true;
    (async () => {
      try {
        const list = await vaultStore.listWantedPosters();
        if (alive) setPosters(list);
      } catch {
        if (alive) setPosters([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, [vaultStatus]);

  // revoke every decrypted URL when the board unmounts
  useEffect(() => {
    const registry = urlRegistry;
    return () => {
      for (const url of registry.values()) URL.revokeObjectURL(url);
      registry.clear();
    };
  }, []);

  const handleCreated = useCallback(
    (poster: WantedPoster) => {
      setPosters((prev) => [poster, ...(prev ?? [])]);
      setAdding(false);
    },
    []
  );

  const handleDeleted = useCallback(async (id: string) => {
    for (const [key, url] of urlRegistry) {
      if (key.startsWith(`${id}:`)) {
        URL.revokeObjectURL(url);
        urlRegistry.delete(key);
      }
    }
    await vaultStore.deleteWantedPoster(id);
    setPosters((prev) => (prev ?? []).filter((p) => p.id !== id));
    setConfirmDelete(null);
  }, []);

  const cycleStatus = useCallback(async (poster: WantedPoster) => {
    const next = STATUS_ORDER[(STATUS_ORDER.indexOf(poster.status) + 1) % STATUS_ORDER.length];
    const updated: WantedPoster = { ...poster, status: next, updatedAt: Date.now() };
    await vaultStore.putWantedPoster(updated);
    setPosters((prev) => (prev ?? []).map((p) => (p.id === poster.id ? updated : p)));
  }, []);

  const deleteTarget = useMemo(
    () => posters?.find((p) => p.id === confirmDelete) ?? null,
    [posters, confirmDelete]
  );

  return (
    <div className="pb-4">
      {/* board header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-mono text-[15px] font-bold tracking-[0.24em] text-silver uppercase">
            <Skull className="size-4.5 text-alert" aria-hidden />
            Wanted bord
          </h1>
          <p className="mt-1 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
            {posters ? `${posters.length} poster${posters.length === 1 ? "" : "s"}` : "Laai…"} ·{" "}
            <span className="inline-flex items-center gap-1 text-alert">
              <Lock className="size-3" /> versluite
            </span>
          </p>
        </div>
        <Button
          size="sm"
          onClick={() => setAdding(true)}
          className="h-10 rounded-lg bg-alert font-mono text-[11px] font-bold tracking-[0.18em] text-white uppercase hover:bg-[#a51515]"
        >
          <Plus className="mr-1 size-4" /> Nuwe poster
        </Button>
      </div>

      {/* grid */}
      {posters === null ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-80 animate-pulse rounded-lg bg-surface" />
          ))}
        </div>
      ) : posters.length === 0 ? (
        <EmptyBoard />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {posters.map((p) => (
            <PosterCard
              key={p.id}
              poster={p}
              onCycleStatus={() => void cycleStatus(p)}
              onDelete={() => setConfirmDelete(p.id)}
            />
          ))}
        </div>
      )}

      {adding ? (
        <AddPosterOverlay onCancel={() => setAdding(false)} onCreated={handleCreated} />
      ) : null}

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title="Moer hierdie poster?"
        description={
          deleteTarget
            ? `"${deleteTarget.alias}" en sy geënkripteerde media word permanent van hierdie toestel verwyder. Niemand kan dit herstel nie.`
            : ""
        }
        confirmLabel="Moer hom"
        onConfirm={() => confirmDelete && void handleDeleted(confirmDelete)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* poster card                                                         */
/* ------------------------------------------------------------------ */

function PosterCard({
  poster,
  onCycleStatus,
  onDelete,
}: {
  poster: WantedPoster;
  onCycleStatus: () => void;
  onDelete: () => void;
}) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoState, setVideoState] = useState<"sealed" | "loading" | "ready" | "error">("sealed");
  const [imageError, setImageError] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // images decrypt eagerly (bounded size); videos decrypt on demand
  useEffect(() => {
    const ref = poster.image;
    if (!ref) return;
    const cacheKey = `${poster.id}:img`;
    let url = urlRegistry.get(cacheKey) ?? null;
    if (url) {
      setImageUrl(url);
      return;
    }
    let revokeLater: string | null = null;
    (async () => {
      try {
        const ct = await vaultStore.getAttachmentBlob(ref.id);
        if (!ct) throw new Error("missing");
        const blob = await decryptFile(ct, ref.keyB64, ref.ivB64);
        revokeLater = URL.createObjectURL(blob);
        urlRegistry.set(cacheKey, revokeLater);
        if (mounted.current) setImageUrl(revokeLater);
      } catch {
        if (mounted.current) setImageError(true);
      }
    })();
    return () => {
      if (revokeLater && !urlRegistry.get(cacheKey)) URL.revokeObjectURL(revokeLater);
    };
  }, [poster.id, poster.image]);

  const playVideo = useCallback(async () => {
    const ref = poster.video;
    if (!ref || videoState === "loading" || videoState === "ready") return;
    const cacheKey = `${poster.id}:vid`;
    const cached = urlRegistry.get(cacheKey);
    if (cached) {
      setVideoUrl(cached);
      setVideoState("ready");
      return;
    }
    setVideoState("loading");
    try {
      const ct = await vaultStore.getAttachmentBlob(ref.id);
      if (!ct) throw new Error("missing");
      const blob = await decryptFile(ct, ref.keyB64, ref.ivB64);
      const url = URL.createObjectURL(blob);
      urlRegistry.set(cacheKey, url);
      setVideoUrl(url);
      setVideoState("ready");
    } catch {
      setVideoState("error");
    }
  }, [poster.id, poster.video, videoState]);

  const stamp = STAMP[poster.status];

  return (
    <article className="wanted-paper relative overflow-hidden rounded-lg shadow-[0_14px_34px_rgba(0,0,0,0.55)]">
      {/* stamp */}
      <button
        onClick={onCycleStatus}
        title="Tap om status te verander"
        aria-label={`Status: ${stamp.label}. Tap om te verander.`}
        className={cn(
          "absolute top-3 right-3 z-20 rotate-[8deg] rounded-md border-[3px] px-2.5 py-1 font-mono text-[10px] font-black tracking-[0.14em] uppercase opacity-90 transition-transform hover:scale-105",
          stamp.className
        )}
      >
        {stamp.label}
      </button>

      <div className="p-4 pb-3 text-center">
        <h3 className="wanted-title font-mono text-[26px] font-black tracking-[0.08em] text-[#1a1210]">
          WANTED
        </h3>
        <p className="font-mono text-[8.5px] font-semibold tracking-[0.3em] text-[#5a4a3a] uppercase">
          Alive or cached
        </p>
      </div>

      {/* photo / video window */}
      <div className="relative mx-auto w-[86%] overflow-hidden rounded-sm border-[3px] border-[#1a1210] bg-[#b7ad99] shadow-[inset_0_0_18px_rgba(0,0,0,0.35)]">
        <div className="aspect-square w-full">
          {poster.image && imageUrl ? (
            <img
              src={imageUrl}
              alt={`Wanted: ${poster.alias}`}
              className="size-full object-cover"
              loading="lazy"
            />
          ) : poster.image && imageError ? (
            <SealedMedia icon={<Lock className="size-7" />} label="KAN NIE OOPMAAK NIE" />
          ) : poster.image ? (
            <SealedMedia icon={<Loader2 className="size-7 animate-spin" />} label="ONSLOUT…" />
          ) : (
            <div className="flex size-full flex-col items-center justify-center gap-1 bg-[repeating-linear-gradient(45deg,#c9c0ac_0_12px,#bdb4a0_12px_24px)] text-[#6b5a44]">
              <Image src="/fastguns-logo.png" alt="" width={54} height={54} className="opacity-70 mix-blend-multiply" />
              <span className="font-mono text-[8px] tracking-[0.22em] uppercase">Geen foto nie</span>
            </div>
          )}
        </div>

        {/* video badge / player trigger */}
        {poster.video ? (
          videoUrl ? (
            <video
              src={videoUrl}
              controls
              playsInline
              className="absolute inset-0 size-full bg-black object-contain"
              aria-label={`Wanted video: ${poster.alias}`}
            />
          ) : (
            <button
              onClick={() => void playVideo()}
              className="absolute inset-0 z-10 flex items-end justify-center bg-black/0 pb-2 transition-colors hover:bg-black/30"
              aria-label="Play encrypted video"
            >
              <span className="flex items-center gap-1.5 rounded-full bg-black/75 px-3 py-1.5 font-mono text-[9px] tracking-[0.18em] text-white uppercase">
                {videoState === "loading" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : (
                  <FileVideo className="size-3.5" />
                )}
                {videoState === "loading" ? "Onslout…" : videoState === "error" ? "FOUT" : "Video · AES-256"}
              </span>
            </button>
          )
        ) : null}
      </div>

      {/* details */}
      <div className="px-5 pt-3 pb-5 text-center">
        <p className="font-mono text-[9px] font-bold tracking-[0.28em] text-[#7a2b1e] uppercase">Reward</p>
        <p className="font-mono text-[19px] font-black tracking-wide text-[#1a1210]">{poster.bounty || "—"}</p>
        <p className="wanted-alias mt-1.5 font-mono text-[15px] font-black tracking-[0.06em] text-[#1a1210] uppercase">
          {poster.alias}
        </p>
        {poster.crime ? (
          <p className="mt-1 text-[11px] font-semibold leading-snug text-[#4a3b2c]">
            <span className="font-mono text-[8.5px] tracking-[0.2em] uppercase">Misdaad: </span>
            {poster.crime}
          </p>
        ) : null}
        {poster.notes ? (
          <p className="mt-1.5 text-[10.5px] leading-snug text-[#5a4a3a] italic">{poster.notes}</p>
        ) : null}
        <p className="mt-2 font-mono text-[7.5px] tracking-[0.24em] text-[#8a7a64] uppercase">
          Verseël · {new Date(poster.createdAt).toLocaleDateString("af-ZA")}
        </p>
      </div>

      <button
        onClick={onDelete}
        aria-label={`Delete poster ${poster.alias}`}
        className="absolute bottom-2.5 right-2.5 z-20 rounded-md p-1.5 text-[#8a7a64] transition-colors hover:bg-[#1a1210]/10 hover:text-[#7a2b1e]"
      >
        <Trash2 className="size-4" />
      </button>
    </article>
  );
}

function SealedMedia({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex size-full flex-col items-center justify-center gap-1.5 bg-[repeating-linear-gradient(45deg,#c9c0ac_0_12px,#bdb4a0_12px_24px)] text-[#5a4a3a]">
      {icon}
      <span className="font-mono text-[8px] tracking-[0.22em] uppercase">{label}</span>
    </div>
  );
}

function EmptyBoard() {
  return (
    <div className="metal-panel flex flex-col items-center rounded-xl px-6 py-12 text-center">
      <Image
        src="/fastguns-logo.png"
        alt=""
        width={72}
        height={72}
        className="mb-4 opacity-90 drop-shadow-[0_10px_24px_rgba(0,0,0,0.7)]"
      />
      <h2 className="font-mono text-[12px] font-bold tracking-[0.26em] text-silver uppercase">
        Die bord is leeg
      </h2>
      <p className="mt-2 max-w-xs text-[12.5px] leading-relaxed text-muted-foreground">
        Plaas jou eerste wanted poster: alias, misdaad, koopsom, foto — selfs
        'n video. Alles word versluit op hierdie toestel voordat dit gestoor
        word. Niks word ooit opgelaai nie.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* add-poster overlay                                                  */
/* ------------------------------------------------------------------ */

function AddPosterOverlay({
  onCancel,
  onCreated,
}: {
  onCancel: () => void;
  onCreated: (poster: WantedPoster) => void;
}) {
  const [alias, setAlias] = useState("");
  const [bounty, setBounty] = useState("");
  const [crime, setCrime] = useState("");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState<WantedStatus>("on-the-loose");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const imageInput = useRef<HTMLInputElement>(null);
  const videoInput = useRef<HTMLInputElement>(null);

  // revoke previews on close
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  const pickImage = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Nie 'n foto nie", description: "Kies 'n beeldlêer (JPG / PNG / WebP).", variant: "destructive" });
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast({ title: "Te groot, boet", description: "Media is beperk tot 25 MB — dis 'n eerlike limiet.", variant: "destructive" });
      return;
    }
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
  };

  const pickVideo = (file: File | null) => {
    if (!file) return;
    if (!file.type.startsWith("video/")) {
      toast({ title: "Nie 'n video nie", description: "Kies 'n videolêer (MP4 / WebM / MOV).", variant: "destructive" });
      return;
    }
    if (file.size > MAX_ATTACHMENT_BYTES) {
      toast({ title: "Te groot, boet", description: "Video is beperk tot 25 MB — knip dit korter.", variant: "destructive" });
      return;
    }
    setVideoFile(file);
  };

  const canSave = alias.trim().length >= 2 && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const poster: WantedPoster = {
        id: randomUuid(),
        alias: alias.trim().slice(0, 48),
        bounty: bounty.trim().slice(0, 24) || "R0",
        crime: crime.trim().slice(0, 140),
        notes: notes.trim().slice(0, 240),
        status,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      if (imageFile) {
        poster.image = await sealMedia(imageFile, "image");
      }
      if (videoFile) {
        poster.video = await sealMedia(videoFile, "video");
      }
      await vaultStore.putWantedPoster(poster);
      toast({
        title: "Poster geplak",
        description: `"${poster.alias}" hang nou aan die bord — verseël met AES-256-GCM.`,
      });
      onCreated(poster);
    } catch (e) {
      const msg = e instanceof Error && e.message === "attachment-too-large" ? "Media oorskry 25 MB." : "Kon nie die poster verseël nie.";
      toast({ title: "Gefaal", description: msg, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/98 backdrop-blur-sm">
      <header className="flex items-center justify-between border-b border-border px-4 pt-safe sm:px-6">
        <h1 className="py-4 font-mono text-[13px] font-bold tracking-[0.24em] text-silver uppercase">
          Nuwe wanted poster
        </h1>
        <button
          onClick={onCancel}
          aria-label="Close"
          className="rounded-lg p-2 text-muted-foreground hover:text-silver"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="mx-auto w-full max-w-md flex-1 space-y-4 overflow-y-auto px-4 py-5 pb-24">
        <div className="metal-panel space-y-4 rounded-xl p-4">
          <div>
            <Label htmlFor="w-alias" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
              Alias *
            </Label>
            <Input
              id="w-alias"
              autoFocus
              value={alias}
              maxLength={48}
              onChange={(e) => setAlias(e.target.value)}
              placeholder="byv. Spook van Silverton"
              className="mt-1.5 h-11 rounded-lg bg-ink text-[15px]"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="w-bounty" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
                Koopsom
              </Label>
              <Input
                id="w-bounty"
                value={bounty}
                maxLength={24}
                onChange={(e) => setBounty(e.target.value)}
                placeholder="R50 000"
                className="mt-1.5 h-11 rounded-lg bg-ink text-[15px]"
              />
            </div>
            <div>
              <Label htmlFor="w-status" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
                Status
              </Label>
              <select
                id="w-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as WantedStatus)}
                className="mt-1.5 h-11 w-full rounded-lg border border-input bg-ink px-3 font-mono text-[12px] tracking-[0.1em] text-silver uppercase"
              >
                <option value="on-the-loose">OP DIE LOOPIES</option>
                <option value="seen">GESIEN</option>
                <option value="caught">GEMOER</option>
              </select>
            </div>
          </div>
          <div>
            <Label htmlFor="w-crime" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
              Misdaad
            </Label>
            <Input
              id="w-crime"
              value={crime}
              maxLength={140}
              onChange={(e) => setCrime(e.target.value)}
              placeholder="byv. Het my laaste pakkie chips gevat"
              className="mt-1.5 h-11 rounded-lg bg-ink text-[15px]"
            />
          </div>
          <div>
            <Label htmlFor="w-notes" className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
              Notas
            </Label>
            <textarea
              id="w-notes"
              value={notes}
              maxLength={240}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Laas gesien waar? Gewapen en gevaarlik?"
              rows={2}
              className="mt-1.5 w-full rounded-lg border border-input bg-ink px-3 py-2.5 text-[14px] text-foreground placeholder:text-muted-foreground focus-visible:outline-ring"
            />
          </div>
        </div>

        {/* media */}
        <div className="metal-panel space-y-3 rounded-xl p-4">
          <p className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
            <Lock className="size-3 text-alert" /> Media word versluit voor stoor
          </p>

          <input
            ref={imageInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => pickImage(e.target.files?.[0] ?? null)}
          />
          <input
            ref={videoInput}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => pickVideo(e.target.files?.[0] ?? null)}
          />

          <button
            onClick={() => imageInput.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-input p-3 text-left transition-colors hover:border-metal/50"
          >
            {imagePreview ? (
              <img src={imagePreview} alt="Foto voorbeeld" className="size-14 rounded-md object-cover" />
            ) : (
              <span className="flex size-14 items-center justify-center rounded-md bg-charcoal text-silver">
                <ImageIcon className="size-5" />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block font-mono text-[11px] tracking-[0.14em] text-silver uppercase">
                {imageFile ? imageFile.name : "Foto kies"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {imageFile
                  ? `${(imageFile.size / 1024 / 1024).toFixed(1)} MB — word verseël`
                  : "JPG / PNG / WebP · maks 25 MB"}
              </span>
            </span>
          </button>

          <button
            onClick={() => videoInput.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-input p-3 text-left transition-colors hover:border-metal/50"
          >
            <span className="flex size-14 items-center justify-center rounded-md bg-charcoal text-silver">
              <FileVideo className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-mono text-[11px] tracking-[0.14em] text-silver uppercase">
                {videoFile ? videoFile.name : "Video kies (opsioneel)"}
              </span>
              <span className="block text-[11px] text-muted-foreground">
                {videoFile
                  ? `${(videoFile.size / 1024 / 1024).toFixed(1)} MB — word verseël`
                  : "MP4 / WebM · maks 25 MB · kort clip"}
              </span>
            </span>
          </button>
        </div>

        <Button
          size="lg"
          disabled={!canSave}
          onClick={() => void save()}
          className="h-12 w-full rounded-xl bg-alert font-mono text-[12px] font-bold tracking-[0.2em] text-white uppercase hover:bg-[#a51515]"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" /> Versluel &amp; plak…
            </>
          ) : (
            "Plak aan die bord"
          )}
        </Button>
      </div>
    </div>
  );
}

async function sealMedia(file: File, kind: "image" | "video"): Promise<WantedMediaRef> {
  const enc = await encryptFile(file, file.name, kind === "video" ? "file" : "image");
  await vaultStore.putAttachmentBlob(enc.id, enc.data);
  return {
    id: enc.id,
    name: file.name.slice(0, 80),
    mime: file.type || (kind === "video" ? "video/mp4" : "image/jpeg"),
    size: file.size,
    kind,
    keyB64: enc.keyB64,
    ivB64: enc.ivB64,
  };
}
