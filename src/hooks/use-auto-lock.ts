"use client";

/**
 * FAST GUNS — vault auto-lock.
 *
 * Locks the vault when:
 *  - the user is inactive for `autoLockMinutes` (activity = pointer, keys,
 *    scroll, touch), and/or
 *  - the app stays hidden (tab switch / app background) for more than 30s
 *    when `lockOnHide` is enabled.
 *
 * These are real timers driving a real lock — no cosmetic security states.
 */

import { useEffect } from "react";
import { useAppStore } from "@/store/app-store";

const HIDE_LOCK_DELAY_MS = 30_000;

export function useAutoLock(): void {
  const vaultStatus = useAppStore((s) => s.vaultStatus);
  const settings = useAppStore((s) => s.settings);
  const lockVault = useAppStore((s) => s.lockVault);

  useEffect(() => {
    if (vaultStatus !== "unlocked") return;

    let lastActivity = Date.now();
    let hiddenAt: number | null = null;

    const activity = () => {
      lastActivity = Date.now();
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        hiddenAt = Date.now();
      } else {
        hiddenAt = null;
        lastActivity = Date.now();
      }
    };

    const interval = setInterval(() => {
      const now = Date.now();
      const idleLimit = Math.max(1, settings.autoLockMinutes) * 60_000;
      if (now - lastActivity >= idleLimit) {
        lockVault();
        return;
      }
      if (settings.lockOnHide && hiddenAt !== null && now - hiddenAt >= HIDE_LOCK_DELAY_MS) {
        lockVault();
      }
    }, 5_000);

    const events: (keyof WindowEventMap)[] = [
      "pointerdown",
      "keydown",
      "wheel",
      "touchstart",
      "focus",
    ];
    events.forEach((e) => window.addEventListener(e, activity, { passive: true }));
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(interval);
      events.forEach((e) => window.removeEventListener(e, activity));
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [vaultStatus, settings.autoLockMinutes, settings.lockOnHide, lockVault]);
}
