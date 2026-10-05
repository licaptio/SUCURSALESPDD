const APP_PREFIX = "provsoft-monitor-transferencias-pc-";
const CACHE_NAME = APP_PREFIX + "v1.0.1";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./config.js",
  "./logo.jfif",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/maskable_icon.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      for (const asset of APP_ASSETS) {
        try { await cache.add(asset); }
        catch (error) { console.warn("No se pudo cachear:", asset, error); }
      }
    })
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys
        .filter(key => key.startsWith(APP_PREFIX) && key !== CACHE_NAME)
        .map(key => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const esArchivoApp =
    event.request.mode === "navigate" ||
    url.pathname.endsWith("/index.html") ||
    url.pathname.endsWith("/config.js");

  // HTML/config: primero red para evitar ejecutar versiones viejas del monitor.
  if (esArchivoApp) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copia = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
          return response;
        })
        .catch(() => caches.match(event.request).then(r => r || caches.match("./index.html")))
    );
    return;
  }

  // Recursos estáticos: caché primero.
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request).then(response => {
        const copia = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
        return response;
      })
    )
  );
});
