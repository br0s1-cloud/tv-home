// Keeps Brosi Home's interface on the TV so it opens fast.
// Page: try the network first (≤1.5s) so updates show immediately, else the saved copy.
// Versioned CSS/JS (?v=...): never change, so serve the saved copy.
const CACHE = "bh-shell";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html");

  e.respondWith(caches.open(CACHE).then(async (cache) => {
    if (isPage) {
      const key = new Request(url.origin + url.pathname);
      const net = fetch(req, { cache: "no-store" }).then((res) => {
        if (res && res.ok) cache.put(key, res.clone());
        return res;
      });
      const saved = await cache.match(key);
      if (!saved) return net;
      const timeout = new Promise((r) => setTimeout(() => r(saved), 1500));
      return Promise.race([net.catch(() => saved), timeout]);
    }
    const hit = await cache.match(req);
    if (hit && url.searchParams.has("v")) return hit;
    const fresh = fetch(req).then((res) => {
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
