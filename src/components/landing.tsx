"use client";

/**
 * FAST GUNS — landing.
 * Premium privacy product hero: monochrome metallic emblem, factual
 * language, no fake metrics, no exaggerated claims.
 */

import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ShieldCheck, KeyRound, Lock, Users, ArrowDown } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { VignetteBackdrop, Wordmark } from "@/components/common";

const FEATURES = [
  {
    icon: KeyRound,
    title: "Device-Generated Identity",
    body: "Your cryptographic identity is created on this device. Private keys never leave it — there are no accounts, emails or phone numbers.",
  },
  {
    icon: Lock,
    title: "Encrypted Local Vault",
    body: "Conversations are sealed with AES-256-GCM under a password-derived key. Only ciphertext ever touches storage.",
  },
  {
    icon: ShieldCheck,
    title: "Peer-to-Peer Ciphertext",
    body: "Messages are encrypted before transmission and exchanged directly between peers over WebRTC. The relay cannot read them.",
  },
  {
    icon: Users,
    title: "Verify Before You Trust",
    body: "Compare fingerprints with your contact to cryptographically confirm who you are talking to. Key changes trigger a security alert.",
  },
];

export function Landing() {
  const startOnboarding = useAppStore((s) => s.startOnboarding);
  const setTab = useAppStore((s) => s.setTab);
  const vaultStatus = useAppStore((s) => s.vaultStatus);

  return (
    <div className="relative flex min-h-screen flex-col bg-ink grain">
      <VignetteBackdrop />

      <header className="relative z-10 flex items-center justify-between px-5 pt-safe sm:px-8">
        <div className="flex items-center gap-3 py-4">
          <Image src="/fastguns-logo.png" alt="FAST GUNS emblem" width={34} height={34} className="rounded-md" priority />
          <Wordmark />
        </div>
        <span className="hidden font-mono text-[10px] tracking-[0.28em] text-metal uppercase sm:block">
          Encrypted Communications
        </span>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-5 sm:px-8">
        <section className="flex flex-col items-center pt-10 pb-14 text-center sm:pt-16">
          <div className="breathe relative mb-8 drop-shadow-[0_24px_48px_rgba(0,0,0,0.8)]">
            <Image
              src="/fastguns-logo.png"
              alt="FAST GUNS — mirrored metallic emblem"
              width={188}
              height={188}
              className="rounded-2xl border border-white/5"
              priority
            />
          </div>

          <h1 className="font-mono text-[26px] font-bold tracking-[0.3em] uppercase sm:text-4xl">
            <span className="metal-text">FAST GUNS</span>
          </h1>
          <p className="mt-3 max-w-xl font-mono text-[12px] leading-relaxed tracking-[0.14em] text-metal uppercase sm:text-[13px]">
            Private communications.
            <br />
            Without the centralized chat database.
          </p>
          <p className="mt-5 max-w-lg text-[14px] leading-relaxed text-muted-foreground">
            Messages are encrypted on your device and exchanged directly between
            peers whenever possible. A minimal relay helps peers find each other —
            it never receives keys or message content.
          </p>

          <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Button
              size="lg"
              onClick={startOnboarding}
              className="h-12 w-full rounded-xl bg-primary font-mono text-[12px] font-semibold tracking-[0.2em] text-primary-foreground uppercase shadow-[0_10px_30px_rgba(0,0,0,0.5)] hover:bg-silver sm:w-auto sm:px-8"
            >
              Create Identity
            </Button>
            {vaultStatus === "locked" ? (
              <Button
                size="lg"
                variant="outline"
                onClick={() => setTab("chats")}
                className="h-12 w-full rounded-xl border-metal/40 font-mono text-[12px] tracking-[0.2em] text-silver uppercase hover:bg-charcoal sm:w-auto sm:px-8"
              >
                Unlock Vault
              </Button>
            ) : null}
          </div>

          <a
            href="#features"
            className="mt-12 inline-flex flex-col items-center gap-1 font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase transition-colors hover:text-silver"
          >
            How it protects you
            <ArrowDown className="size-3.5 animate-bounce" />
          </a>
        </section>

        <section id="features" className="grid gap-3 pb-16 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="metal-panel fade-up rounded-xl p-5 transition-colors hover:border-metal/30"
            >
              <f.icon className="mb-3 size-5 text-silver" aria-hidden />
              <h2 className="mb-1.5 font-mono text-[11px] font-semibold tracking-[0.2em] text-silver uppercase">
                {f.title}
              </h2>
              <p className="text-[13px] leading-relaxed text-muted-foreground">{f.body}</p>
            </article>
          ))}
        </section>

        <section className="metal-panel-elevated mb-14 rounded-xl p-5">
          <h2 className="mb-2 font-mono text-[11px] font-semibold tracking-[0.22em] text-silver uppercase">
            What FAST GUNS does not claim
          </h2>
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            No &ldquo;unbreakable&rdquo; marketing. No anonymous-browsing promises. Encrypted
            transport and encrypted storage still cannot protect a compromised
            device, a stolen unlocked phone, or a screenshot. Read the full
            threat model before trusting any messenger with anything serious.
          </p>
        </section>
      </main>

      <footer className="relative z-10 mt-auto border-t border-border/70 bg-ink/80 px-5 py-5 pb-safe sm:px-8">
        <div className="mx-auto flex max-w-3xl flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
          <p className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
            FAST GUNS · Private by architecture · Your keys stay yours
          </p>
          <p className="text-[11px] text-muted-foreground">
            Encrypted locally before transmission. Verify before you trust.
          </p>
        </div>
      </footer>
    </div>
  );
}
