/*
 * FAST GUNS — service worker.
 *
 * CACHE POLICY (security-relevant):
 *   - ONLY static, non-sensitive application assets are cached
 *     (Next build output chunks, icons, manifest, the logo).
 *   - NOTHING dynamic is cached: no API responses, no signaling traffic,
 *     no message data (there is no server-side message data at all).
 *   - The HTML app shell uses network-first with a cache fallback so the
 *     vault unlock screen works offline.
 */

const VERSION = "fastguns-v1";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;

const SHELL_URL = "/";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.add(SHELL_URL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return; // never touch non-GET

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // cross-origin: bypass

  // socket.io / signaling / API: network only, never cached
  if (url.pathname.startsWith("/socket.io") || url.pathname.startsWith("/api")) {
    return;
  }

  // hashed build assets + icons: cache-first (immutable content)
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/fastguns-logo.png" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            const copy = res.clone();
            caches.open(ASSET_CACHE).then((cache) => cache.put(req, copy));
            return res;
          })
      )
    );
    return;
  }

  // app shell: network-first, fall back to cached shell when offline
  if (req.mode === "navigate" || url.pathname === "/") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((cache) => cache.put(SHELL_URL, copy));
          return res;
        })
        .catch(() => caches.match(SHELL_URL).then((hit) => hit ?? Response.error()))
    );
  }
});
