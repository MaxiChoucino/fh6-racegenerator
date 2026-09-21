const PREFIX = "fh6-random-";
const CACHE = `${PREFIX}v3`;
const PHOTOS = `${PREFIX}photos-v1`;
const CORE = [
  "./", "./index.html", "./styles.css", "./app.js", "./races.js", "./car-photos.js",
  "./manifest.webmanifest", "./icons/icon-192.png", "./icons/icon-512.png", "./icons/icon.svg",
  "./assets/fh6-cover.webp", "./assets/fh6-map.jpg"
];
self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", event => {
  event.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(key => key.startsWith(PREFIX) && key !== CACHE && key !== PHOTOS).map(key => caches.delete(key))))
    .then(() => self.clients.claim()));
});

// Sólo se guardan las últimas 40 fotos vistas; las listas online las maneja app.js.
let photoWrites = Promise.resolve();
function rememberPhoto(request, response) {
  photoWrites = photoWrites.catch(() => {}).then(async () => {
    const cache = await caches.open(PHOTOS);
    await cache.put(request, response);
    const keys = await cache.keys();
    await Promise.all(keys.slice(0, Math.max(0, keys.length - 40)).map(key => cache.delete(key)));
  });
  return photoWrites;
}
function isCarPhoto(url) {
  return url.protocol === "https:" && url.hostname === "raw.githubusercontent.com"
    && /^\/pixelswiftali\/forzadata\/[^/]+\/images\/[a-z0-9_-]+\.png$/i.test(url.pathname);
}
self.addEventListener("message", event => {
  if (event.data?.type !== "CACHE_PHOTO") return;
  let url;
  try { url = new URL(event.data.url); } catch { return; }
  if (!isCarPhoto(url)) return;
  event.waitUntil((async () => {
    const request = new Request(url.href, { mode: "no-cors", credentials: "omit" });
    const cache = await caches.open(PHOTOS);
    if (await cache.match(request)) return;
    const response = await fetch(request);
    if (response.ok || response.type === "opaque") await rememberPhoto(request, response);
  })().catch(() => {}));
});
self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin) {
    event.respondWith(caches.open(CACHE).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return cached;
      try { return await fetch(request); }
      catch (error) {
        if (request.mode === "navigate") return await cache.match("./index.html");
        throw error;
      }
    }));
  } else if (request.destination === "image" && isCarPhoto(url)) {
    const result = caches.open(PHOTOS).then(async cache => {
      const cached = await cache.match(request);
      if (cached) return { response: cached };
      const response = await fetch(request);
      return { response, write: response.ok || response.type === "opaque" ? rememberPhoto(request, response.clone()) : null };
    });
    event.respondWith(result.then(value => value.response));
    event.waitUntil(result.then(value => value.write).catch(() => {}));
  }
});
