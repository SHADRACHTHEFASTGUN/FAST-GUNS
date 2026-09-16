"use client";

/**
 * FAST GUNS — VIOLENT EDITION FX.
 * GSAP + ScrollTrigger animation arsenal:
 *  - HeroEmblem: logo slams in with screen shake + red muzzle flash
 *  - SlamText:   headline lines that hit like rounds on scroll
 *  - Reveal:     generic ScrollTrigger reveal (fly / slide / rotate / stagger)
 *  - ParallaxGhost: scrubbed background watermark
 *  - PunchButton: click = recoil punch, then fires the real handler
 * All motion respects prefers-reduced-motion.
 */

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { cn } from "@/lib/utils";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

function reducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/* ------------------------------------------------------------------ */
/* HERO EMBLEM — logo drops like a hammer                             */
/* ------------------------------------------------------------------ */

export function HeroEmblem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const el = scope.current;
    if (!el) return;
    const flash = el.querySelector<HTMLElement>("[data-fx-flash]");
    const emblem = el.querySelector<HTMLElement>("[data-fx-emblem]");
    const halo = el.querySelector<HTMLElement>("[data-fx-halo]");

    if (reducedMotion()) {
      gsap.set([emblem, halo], { opacity: 1, scale: 1, filter: "none" });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.set(emblem, { opacity: 0, scale: 2.6, filter: "blur(14px)" });
      gsap.set(halo, { opacity: 0, scale: 0.4 });

      const tl = gsap.timeline({ defaults: { ease: "power4.out" } });

      // halo rushes out first
      tl.to(halo, { opacity: 1, scale: 1.15, duration: 0.5, ease: "power2.in" }, 0.1);

      // the slam
      tl.to(
        emblem,
        {
          opacity: 1,
          scale: 1,
          filter: "blur(0px)",
          duration: 0.55,
          ease: "power4.in",
        },
        0.35
      );

      // impact: violent screen shake
      tl.add(() => {
        gsap.fromTo(
          el,
          { x: 0, y: 0 },
          {
            keyframes: [
              { x: -14, y: 8, duration: 0.05 },
              { x: 12, y: -9, duration: 0.05 },
              { x: -9, y: -5, duration: 0.05 },
              { x: 7, y: 5, duration: 0.05 },
              { x: -4, y: 2, duration: 0.05 },
              { x: 0, y: 0, duration: 0.05 },
            ],
            ease: "none",
          }
        );
        if (flash) {
          gsap.fromTo(
            flash,
            { opacity: 0.85 },
            { opacity: 0, duration: 0.5, ease: "power2.out" }
          );
        }
      });

      // settle breathe
      tl.to(
        emblem,
        { scale: 1.015, duration: 1.6, ease: "sine.inOut", yoyo: true, repeat: -1 },
        "+=0.15"
      );
    }, scope);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={scope} className={cn("relative", className)}>
      <div
        data-fx-flash
        aria-hidden
        className="pointer-events-none absolute -inset-16 z-20 opacity-0"
        style={{
          background:
            "radial-gradient(circle, rgba(220,40,40,0.5) 0%, rgba(220,40,40,0.12) 42%, transparent 70%)",
        }}
      />
      <div
        data-fx-halo
        aria-hidden
        className="pointer-events-none absolute inset-[-18%] z-0 opacity-0"
        style={{
          background:
            "radial-gradient(circle, rgba(255,255,255,0.07) 0%, rgba(255,255,255,0.02) 45%, transparent 70%)",
        }}
      />
      <div data-fx-emblem className="relative z-10 opacity-0">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* SLAM TEXT — lines that hit on scroll                               */
/* ------------------------------------------------------------------ */

export function SlamText({
  lines,
  className,
  lineClassName,
}: {
  lines: React.ReactNode[];
  className?: string;
  lineClassName?: string;
}) {
  const scope = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const el = scope.current;
    if (!el) return;
    const items = el.querySelectorAll<HTMLElement>("[data-slam-line]");

    if (reducedMotion()) {
      gsap.set(items, { opacity: 1, y: 0, skewX: 0, scale: 1 });
      return;
    }

    const ctx = gsap.context(() => {
      gsap.set(items, { opacity: 0, y: 64, skewX: -12, scale: 1.06 });
      ScrollTrigger.create({
        trigger: el,
        start: "top 78%",
        once: true,
        onEnter: () => {
          gsap.to(items, {
            opacity: 1,
            y: 0,
            skewX: 0,
            scale: 1,
            duration: 0.42,
            ease: "power4.in",
            stagger: 0.16,
            onComplete: () => {
              // recoil on the container after each slam lands
              gsap.fromTo(
                el,
                { x: 0 },
                {
                  keyframes: [
                    { x: -8, duration: 0.045 },
                    { x: 7, duration: 0.045 },
                    { x: -4, duration: 0.045 },
                    { x: 0, duration: 0.045 },
                  ],
                  ease: "none",
                }
              );
            },
          });
        },
      });
    }, scope);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={scope} className={className}>
      {lines.map((l, i) => (
        <div
          key={i}
          data-slam-line
          className={cn("opacity-0 will-change-transform", lineClassName)}
        >
          {l}
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* REVEAL — generic ScrollTrigger entrance                            */
/* ------------------------------------------------------------------ */

type RevealProps = {
  children: ReactNode;
  className?: string;
  /** fly direction: up | down | left | right | none */
  from?: "up" | "down" | "left" | "right" | "none";
  rotate?: number;
  delay?: number;
  /** stagger direct children instead of treating wrapper as one block */
  stagger?: boolean;
  start?: string;
};

export function Reveal({
  children,
  className,
  from = "up",
  rotate = 0,
  delay = 0,
  stagger = false,
  start = "top 85%",
}: RevealProps) {
  const scope = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const el = scope.current;
    if (!el) return;

    if (reducedMotion()) {
      gsap.set(el.querySelectorAll<HTMLElement>("[data-reveal-item]"), { opacity: 1, x: 0, y: 0, rotate: 0 });
      return;
    }

    const x = from === "left" ? -56 : from === "right" ? 56 : 0;
    const y = from === "up" ? 48 : from === "down" ? -48 : 0;

    const ctx = gsap.context(() => {
      const targets = stagger
        ? el.querySelectorAll<HTMLElement>("[data-reveal-item]")
        : [el.querySelector<HTMLElement>("[data-reveal-item]") ?? el];
      gsap.set(targets, { opacity: 0, x, y, rotate });
      ScrollTrigger.create({
        trigger: el,
        start,
        once: true,
        onEnter: () =>
          gsap.to(targets, {
            opacity: 1,
            x: 0,
            y: 0,
            rotate: 0,
            duration: 0.7,
            delay,
            ease: "power3.out",
            stagger: stagger ? 0.12 : 0,
          }),
      });
    }, scope);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={scope} className={className}>
      {stagger ? (
        // each direct child becomes a reveal item
        Array.isArray(children) ? (
          (children as ReactNode[]).map((c, i) => (
            <div data-reveal-item key={i} className="opacity-0 will-change-transform">
              {c}
            </div>
          ))
        ) : (
          <div data-reveal-item className="opacity-0 will-change-transform">
            {children}
          </div>
        )
      ) : (
        <div data-reveal-item className="opacity-0 will-change-transform">
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PARALLAX GHOST — scrubbed watermark                                */
/* ------------------------------------------------------------------ */

export function ParallaxGhost({
  text,
  className,
  speed = 18,
}: {
  text: string;
  className?: string;
  speed?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || reducedMotion()) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        el,
        { yPercent: -speed },
        {
          yPercent: speed,
          ease: "none",
          scrollTrigger: {
            trigger: el,
            start: "top bottom",
            end: "bottom top",
            scrub: 1.1,
          },
        }
      );
    });
    return () => ctx.revert();
  }, [speed]);

  return (
    <div
      ref={ref}
      aria-hidden
      className={cn(
        "pointer-events-none select-none whitespace-nowrap font-mono font-bold uppercase leading-none",
        className
      )}
    >
      {text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* PUNCH BUTTON — click recoil, then fire                             */
/* ------------------------------------------------------------------ */

export function usePunch() {
  const punch = (event: { currentTarget: HTMLElement | null }, after?: () => void) => {
    const el = event.currentTarget;
    if (!el || reducedMotion()) {
      after?.();
      return;
    }
    gsap.fromTo(
      el,
      { scale: 1 },
      {
        keyframes: [
          { scale: 0.9, duration: 0.07, ease: "power3.in" },
          { scale: 1.06, duration: 0.11, ease: "power3.out" },
          { scale: 1, duration: 0.12, ease: "power2.inOut" },
        ],
        onComplete: () => after?.(),
      }
    );
  };
  return punch;
}
