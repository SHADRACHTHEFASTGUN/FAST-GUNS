"use client";

/**
 * FAST GUNS — PWA registration.
 * Registers the service worker that provides the offline app shell.
 * The SW caches ONLY static assets — never messages, keys, or API data.
 *
 * NOTE: registration is skipped in development — dev asset URLs are not
 * content-hashed, so a cache-first SW would serve stale code and break
 * hot reload.
 */

import { useEffect } from "react";

export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const register = () => {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch(() => {
          /* offline shell unavailable — the app still works online */
        });
    };
    if (document.readyState === "complete") {
      register();
    } else {
      window.addEventListener("load", register, { once: true });
      return () => window.removeEventListener("load", register);
    }
  }, []);
  return null;
}
