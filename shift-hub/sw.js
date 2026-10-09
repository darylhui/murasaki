// Keeps the Shift Hub working when the internet drops.
// Network first, so a new version shows up as soon as it's online; the
// cached copy is only used when the network fails. Only the hub's own files
// are cached. Saved data lives in localStorage and never passes through here.
const CACHE = "shift-hub-v1";
const FILES = ["./", "index.html", "style.css", "data.js", "app.js", "manifest.webmanifest", "icon-192.png", "icon-512.png", "favicon-32.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match("index.html")))
  );
});
