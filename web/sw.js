// Keeps Brosi Home's interface on the TV so it opens instantly.
// Shows the saved copy right away, fetches the latest in the background,
// and the next launch uses it. Data (weather, scores, videos) isn't cached here.
const CACHE = "bh-shell";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  const isPage = req.mode === "navigate" || url.pathname.endsWith("/") || url.pathname.endsWith("index.html");
  e.respondWith(caches.open(CACHE).then(async (cache) => {
    const key = isPage ? new Request(url.origin + url.pathname) : req;
    const hit = await cache.match(key);
    const fresh = fetch(req).then((res) => {
      if (res && res.ok) cache.put(key, res.clone());
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
