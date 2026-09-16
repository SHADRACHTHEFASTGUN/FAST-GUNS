"use client";

/**
 * FAST GUNS — VIOLENT EDITION landing / splash.
 * Full-screen cinematic hero with the huge transparent emblem, GSAP motion,
 * hacker-grade spec strip, and an encrypted WANTED-board teaser.
 * Clean of decorative lines/scanlines — motion carries the drama.
 */

import { useLayoutEffect, useRef } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ShieldCheck, KeyRound, Lock, Users, ArrowDown, Crosshair, Skull, MessagesSquare, FolderLock } from "lucide-react";
import { useAppStore } from "@/store/app-store";
import { VignetteBackdrop, Wordmark } from "@/components/common";
import { HeroEmblem, SlamText, Reveal, ParallaxGhost, usePunch } from "@/components/fx";
import gsap from "gsap";

const FEATURES = [
  {
    icon: KeyRound,
    title: "Sleutels gesmee op jou yster",
    body: "Jou kripto-identity word HIER gebore en bly HIER, boet. Private keys verlaat NOOIT die toestel nie — geen rekening, geen email, geen nommer. Niks wat hulle kan gryp as hulle kom nie, jou verstaan.",
    side: "left" as const,
    rot: -1.5,
  },
  {
    icon: Lock,
    title: "Kluis vol versluite kak",
    body: "Alles in die vault lê toegooi met AES-256-GCM onder 'n wagwoordsleutel wat 600 000 PBKDF2-rondes hardloop voor die deur oopmaak. Net ciphertext raak die storage. Lees gerus — dis onleesbare kak.",
    side: "right" as const,
    rot: 1.5,
  },
  {
    icon: ShieldCheck,
    title: "Reguit P2P. Geen middelman.",
    body: "Boodskappe word versleutel VOOR dit uitgaan en skiet direk oor die WebRTC DataChannel van jou yster na syne. Die relay help net mates mekaar vind — hy sien versleutelde geraas en NIKS anders nie, die arme sloerie.",
    side: "left" as const,
    rot: -1,
  },
  {
    icon: Users,
    title: "Verifieer of moer af",
    body: "Vergelyk vingerafdrukke met jou maat voor jy vertrou. Verander die sleutel op die kantlyn? ALARM — hard en dief — sodat jy dadelik weet daar's 'n poephool in die pad.",
    side: "right" as const,
    rot: 1,
  },
];

const STEPS = [
  {
    icon: KeyRound,
    n: "01",
    title: "SMEE",
    body: "Skep jou identity op die toestel. ECDH + ECDSA P-256, 600 000 PBKDF2-rondes. 30 sekondes, geen vrae nie.",
  },
  {
    icon: FolderLock,
    n: "02",
    title: "SLOT",
    body: "Alles wat jy skryf, stuur of plaas gaan in die AES-256-GCM kluis. Net ciphertext raak die skyf — ooit.",
  },
  {
    icon: MessagesSquare,
    n: "03",
    title: "SKIET",
    body: "Gesels direk oor WebRTC. Verifieer vingerafdrukke, plak wanted-posters, moer die spyware vir altyd.",
  },
];

const SPECS = [
  "AES-256-GCM",
  "ECDH P-256",
  "ECDSA-SIGNED HANDSHAKES",
  "PBKDF2 · 600 000 RONDES",
  "WEBRTC DATACHANNEL",
  "SEALED INDEXEDDB",
  "GEEN REKENINGS. NOOIT.",
];

const MARQUEE = [
  "FOK DIE SPYWARE",
  "MOER DIE DATABASE",
  "JOU CHATS BLY JOU NE",
  "AES-256-GCM",
  "E2EE OF NOGS NIKS",
  "GEEN KAK WAT GESPY WORD",
];

/* ------------------------------------------------------------------ */

function Marquee({ fast = false }: { fast?: boolean }) {
  const row = MARQUEE.join("  ✕  ") + "  ✕  ";
  return (
    <div aria-hidden className="relative overflow-hidden bg-[linear-gradient(180deg,#120303,#180505_50%,#120303)] py-3.5">
      <div className={fast ? "marquee-track-fast flex w-max" : "marquee-track flex w-max"}>
        <span className="pr-10 font-mono text-[11px] font-bold tracking-[0.3em] text-alert/90 uppercase whitespace-nowrap">
          {row}
        </span>
        <span className="pr-10 font-mono text-[11px] font-bold tracking-[0.3em] text-alert/90 uppercase whitespace-nowrap">
          {row}
        </span>
      </div>
    </div>
  );
}

/* title letters slam in after the emblem hits the ground */
function SlamTitle() {
  const ref = useRef<HTMLHeadingElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const letters = el.querySelectorAll<HTMLElement>("[data-letter]");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      gsap.set(letters, { opacity: 1, y: 0, scale: 1 });
      return;
    }
    gsap.set(letters, { opacity: 0, y: 90, scale: 1.5, filter: "blur(6px)" });
    gsap.to(letters, {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      duration: 0.34,
      ease: "power4.in",
      stagger: 0.055,
      delay: 0.95,
      onComplete: () => {
        gsap.fromTo(
          el,
          { x: 0 },
          {
            keyframes: [
              { x: -6, duration: 0.04 },
              { x: 5, duration: 0.04 },
              { x: -2, duration: 0.04 },
              { x: 0, duration: 0.04 },
            ],
          }
        );
      },
    });
  }, []);

  return (
    <h1
      ref={ref}
      aria-label="FAST GUNS"
      className="font-mono text-[46px] font-bold tracking-[0.16em] uppercase sm:text-7xl lg:text-8xl"
    >
      {"FAST GUNS".split("").map((ch, i) => (
        <span
          key={i}
          data-letter
          aria-hidden
          className={ch === " " ? "inline-block w-[0.4em] opacity-0" : "metal-text inline-block will-change-transform"}
        >
          {ch === " " ? "\u00A0" : ch}
        </span>
      ))}
    </h1>
  );
}

/* ------------------------------------------------------------------ */

export function Landing() {
  const startOnboarding = useAppStore((s) => s.startOnboarding);
  const setTab = useAppStore((s) => s.setTab);
  const vaultStatus = useAppStore((s) => s.vaultStatus);
  const punch = usePunch();

  const handleStart = (e: React.MouseEvent<HTMLButtonElement>) =>
    punch(e, () => startOnboarding());
  const handleUnlock = (e: React.MouseEvent<HTMLButtonElement>) =>
    punch(e, () => setTab("chats"));

  return (
    <div className="relative flex min-h-screen flex-col bg-ink grain">
      <VignetteBackdrop />

      {/* ---------------- header ---------------- */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between px-5 pt-safe sm:px-8">
        <div className="flex items-center gap-3 py-4">
          <Image
            src="/fastguns-logo.png"
            alt="FAST GUNS emblem"
            width={48}
            height={48}
            className="select-none drop-shadow-[0_6px_16px_rgba(0,0,0,0.8)]"
            priority
          />
          <Wordmark />
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden font-mono text-[10px] tracking-[0.28em] text-metal uppercase md:block">
            Enkripte komms · <span className="text-alert">moer die res</span>
          </span>
          <Button
            size="sm"
            onClick={handleStart}
            className="h-10 rounded-lg bg-alert font-mono text-[10px] font-bold tracking-[0.2em] text-white uppercase hover:bg-[#a51515]"
          >
            Skakel aan
          </Button>
        </div>
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-1 flex-col px-5 sm:px-8">
        {/* ---------------- SPLASH HERO ---------------- */}
        <section className="relative flex min-h-[calc(100svh-80px)] flex-col items-center justify-center pb-8 pt-2 text-center sm:pt-0">
          <HeroEmblem className="mb-5 sm:mb-7">
            <Image
              src="/fastguns-logo.png"
              alt="FAST GUNS — twee handschoene, twee pistole, kettings"
              width={1024}
              height={1024}
              priority
              className="w-[min(80vw,400px)] select-none drop-shadow-[0_34px_70px_rgba(0,0,0,0.9)] sm:w-[min(54vw,540px)]"
            />
          </HeroEmblem>

          <SlamTitle />

          <p className="hard-blink mt-4 font-mono text-[15px] font-bold tracking-[0.24em] uppercase sm:mt-5 sm:text-lg">
            <span className="blood-text">Moer die spyware.</span>
          </p>

          <div className="mt-5 grid max-w-2xl gap-3 sm:mt-6">
            <p className="text-[15px] leading-relaxed text-foreground/90 sm:text-[16px]">
              WhatsApp lees jou kak. Instagram verkoop jou saam met jou gatte.
              Hier boet — jou geselsies bly <span className="font-semibold text-silver">JOU FOKKEN besigheid</span>.
            </p>
            <p className="mx-auto max-w-xl text-[13px] leading-relaxed text-muted-foreground">
              Boodskappe word op jou yster gesmeer met AES-256-GCM en vlieg reguit
              oor WebRTC na die ander man se yster. Geen poephool in die middel wat
              kan luister nie. Versleutel voor dit uitgaan. Versluit waar dit lê.
            </p>
          </div>

          <div className="mt-8 flex w-full flex-col items-center gap-3 sm:w-auto sm:flex-row">
            <Button
              size="lg"
              onClick={handleStart}
              className="blood-glow h-13 w-full rounded-xl bg-alert px-8 font-mono text-[12px] font-bold tracking-[0.2em] text-white uppercase transition-colors hover:bg-[#a51515] sm:w-auto"
            >
              <Crosshair className="mr-2 size-4" />
              Skep jou identity
            </Button>
            {vaultStatus === "locked" ? (
              <Button
                size="lg"
                variant="outline"
                onClick={handleUnlock}
                className="h-13 w-full rounded-xl border-metal/40 px-8 font-mono text-[12px] tracking-[0.2em] text-silver uppercase hover:bg-charcoal sm:w-auto"
              >
                Maak die vault oop
              </Button>
            ) : null}
          </div>

          <p className="mt-5 font-mono text-[10px] tracking-[0.26em] text-metal uppercase">
            Geen nommer · Geen email · Geen rekening · Geen doos wat loer
          </p>

          <a
            href="#die-feite"
            className="mt-8 inline-flex flex-col items-center gap-1 font-mono text-[10px] tracking-[0.3em] text-muted-foreground uppercase transition-colors hover:text-alert sm:mt-10"
          >
            Hoekom dit moer werd is
            <ArrowDown className="size-4 animate-bounce text-alert" />
          </a>
        </section>

        {/* ---------------- marquee ---------------- */}
        <Marquee />

        {/* ---------------- manifesto ---------------- */}
        <section className="relative overflow-hidden py-20 text-center sm:py-28">
          <ParallaxGhost
            text="187"
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-[38vw] text-white/[0.025] sm:text-[26vw]"
          />
          <p className="mb-6 font-mono text-[10px] tracking-[0.34em] text-metal uppercase">
            — Die manifesto —
          </p>
          <SlamText
            className="mx-auto max-w-3xl font-mono font-bold uppercase leading-[1.08]"
            lines={[
              "DIE DATABASE",
              "IS DOOD.",
            ]}
            lineClassName="text-[9.5vw] sm:text-6xl lg:text-7xl"
          />
          <SlamText
            className="mx-auto mt-4 max-w-3xl font-mono font-bold uppercase leading-[1.08]"
            lines={["Jou chats. Jou yster.", <span key="b" className="blood-text">Jou FOKKEN besigheid.</span>]}
            lineClassName="text-[7vw] text-silver sm:text-4xl lg:text-5xl"
          />
          <Reveal from="up" delay={0.1} className="mx-auto mt-8 max-w-xl">
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Daar is geen sentrale server wat jou geselsies stoer nie. Geen
              cloud-kak wat deur regerings gesoek kan word nie. Alles bly op die
              twee ysters wat die gesels voer — soos dit hoort, ne.
            </p>
          </Reveal>
        </section>

        {/* ---------------- how it werk ---------------- */}
        <section className="pb-20 sm:pb-24">
          <SlamText
            lines={["HOE DIT WERK"]}
            className="mb-8 text-center"
            lineClassName="font-mono text-lg font-bold tracking-[0.24em] text-silver uppercase sm:text-2xl"
          />
          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((s) => (
              <Reveal key={s.n} from="up" rotate={s.n === "01" ? -1.5 : s.n === "02" ? 0 : 1.5} className="h-full">
                <article className="metal-panel group relative h-full overflow-hidden rounded-xl p-6 transition-all duration-300 hover:-translate-y-1 hover:border-metal/40">
                  <span className="pointer-events-none absolute -top-3 right-3 font-mono text-[56px] font-black text-white/[0.045]">
                    {s.n}
                  </span>
                  <s.icon className="mb-4 size-6 text-silver" aria-hidden />
                  <h3 className="mb-2 font-mono text-[13px] font-black tracking-[0.24em] text-silver">
                    {s.title}
                  </h3>
                  <p className="text-[13px] leading-relaxed text-muted-foreground">{s.body}</p>
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* ---------------- features ---------------- */}
        <section id="die-feite" className="grid gap-4 pb-20 sm:grid-cols-2 sm:pb-24">
          {FEATURES.map((f) => (
            <Reveal key={f.title} from={f.side} rotate={f.rot} className="h-full">
              <article className="blood-panel group h-full rounded-xl p-5 transition-all duration-300 hover:-translate-y-1 hover:border-alert/45 hover:shadow-[0_16px_40px_rgba(0,0,0,0.6),0_0_28px_rgba(180,24,24,0.12)] sm:p-6">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex size-9 items-center justify-center rounded-lg border border-alert/30 bg-alert/10 text-alert">
                    <f.icon className="size-4.5" aria-hidden />
                  </span>
                  <span className="font-mono text-[9px] tracking-[0.3em] text-metal uppercase">
                    {String(FEATURES.indexOf(f) + 1).padStart(2, "0")}
                  </span>
                </div>
                <h2 className="mb-2 font-mono text-[12px] font-bold tracking-[0.18em] text-silver uppercase">
                  {f.title}
                </h2>
                <p className="text-[13px] leading-relaxed text-muted-foreground">{f.body}</p>
              </article>
            </Reveal>
          ))}
        </section>

        {/* ---------------- WANTED teaser ---------------- */}
        <Reveal from="up" className="pb-20 sm:pb-24">
          <section className="relative overflow-hidden rounded-2xl border border-alert/25 bg-[linear-gradient(135deg,#170404_0%,#0d0d0d_55%,#1a0505_100%)] p-7 sm:p-10">
            <ParallaxGhost
              text="WANTED"
              className="absolute -right-6 top-1/2 -translate-y-1/2 text-[22vw] text-white/[0.02] sm:text-[9rem]"
            />
            <div className="relative z-10 flex flex-col items-start gap-6 lg:flex-row lg:items-center">
              <div className="flex-1">
                <p className="mb-2 flex items-center gap-2 font-mono text-[10px] tracking-[0.3em] text-alert uppercase">
                  <Skull className="size-4" /> Nuut · Encrypted
                </p>
                <h2 className="font-mono text-3xl font-black uppercase leading-[1.05] sm:text-4xl">
                  <span className="metal-text">Die </span>
                  <span className="blood-text">Wanted</span>
                  <span className="metal-text"> bord</span>
                </h2>
                <p className="mt-3 max-w-lg text-[13.5px] leading-relaxed text-muted-foreground">
                  Plak wanted-posters met foto's en video's — alias, misdaad,
                  koopsom, status. Elke poster en elke media-lêer word met jou
                  vault-sleutel verseël voordat dit gestoor word. Dis jou
                  private dossier, boet — niemand anders sien dit nie.
                </p>
              </div>
              <div className="wanted-mini-poster shrink-0 select-none text-center">
                <p className="wanted-title font-mono text-[22px] font-black text-[#1a1210]">WANTED</p>
                <Image
                  src="/fastguns-logo.png"
                  alt=""
                  width={64}
                  height={64}
                  className="mx-auto my-2 opacity-80 mix-blend-multiply"
                />
                <p className="font-mono text-[7.5px] tracking-[0.26em] text-[#5a4a3a] uppercase">
                  Alive or cached
                </p>
              </div>
            </div>
          </section>
        </Reveal>

        {/* ---------------- specs ---------------- */}
        <Marquee fast />

        <section className="py-16 text-center sm:py-20">
          <SlamText
            lines={["WAT ONS GEBRUIK OM JOU TE BESKERM"]}
            className="mx-auto max-w-2xl"
            lineClassName="font-mono text-lg font-bold tracking-[0.14em] text-silver uppercase sm:text-2xl"
          />
          <Reveal stagger className="mt-8 flex flex-wrap items-center justify-center gap-2.5">
            {SPECS.map((s) => (
              <span
                key={s}
                className="rounded-full border border-border bg-surface px-4 py-2 font-mono text-[10px] tracking-[0.22em] text-silver uppercase transition-colors hover:border-alert/40 hover:text-white"
              >
                {s}
              </span>
            ))}
          </Reveal>
        </section>

        {/* ---------------- honesty ---------------- */}
        <Reveal from="up" className="mb-20 sm:mb-24">
          <section className="metal-panel-elevated rounded-xl p-5 sm:p-7">
            <h2 className="mb-3 font-mono text-[11px] font-bold tracking-[0.22em] text-silver uppercase">
              Wat ons <span className="text-alert">NIE</span> claim nie
            </h2>
            <p className="text-[13px] leading-relaxed text-muted-foreground">
              Geen &ldquo;onbreekbaar&rdquo;-bofbal hier nie, jou hoor. As jou yster gesteel
              word terwyl die vault oopgelok is, kan geen encryption jou red nie —
              niks kan nie, en wie anders so sê, lieg vir jou. En encryption kan nie
              n brandende battery of 'n screenshot red nie. Lees die threat model
              voor jy hierdie ding vir enigiets ernstigs vertrou.
            </p>
          </section>
        </Reveal>

        {/* ---------------- final CTA ---------------- */}
        <section className="relative pb-20 text-center sm:pb-24">
          <SlamText
            className="mx-auto max-w-3xl font-mono font-bold uppercase leading-[1.05]"
            lines={["GENOEG GEKAK", "PRAAT."]}
            lineClassName="text-[11vw] sm:text-6xl lg:text-7xl"
          />
          <Reveal from="up" delay={0.15} className="mx-auto mt-6 max-w-md">
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              Skep jou identity in 30 sekondes, laai die kluis, en sê totsiens aan
              die spiekoppe. Vir altyd. Verniet.
            </p>
          </Reveal>
          <Reveal from="up" delay={0.25} className="mt-9 flex justify-center">
            <Button
              size="lg"
              onClick={handleStart}
              className="blood-glow h-14 w-full max-w-xs rounded-xl bg-alert font-mono text-[13px] font-bold tracking-[0.24em] text-white uppercase transition-colors hover:bg-[#a51515] sm:w-auto"
            >
              <Crosshair className="mr-2 size-4" />
              Skakel aan &amp; moer
            </Button>
          </Reveal>
        </section>
      </main>

      {/* ---------------- footer (sticky bottom) ---------------- */}
      <footer className="relative z-10 mt-auto bg-ink/80 px-5 py-6 pb-safe sm:px-8">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-3 text-center sm:flex-row sm:text-left">
          <p className="font-mono text-[10px] tracking-[0.2em] text-metal uppercase">
            FAST GUNS · Privaat by argitektuur · Jou sleutels bly <span className="text-alert">JOU NE</span>
          </p>
          <p className="text-[11px] text-muted-foreground">
            Versleutel voor dit uitgaan. Verifieer voor jy vertrou. Moer die res.
          </p>
        </div>
      </footer>
    </div>
  );
}
