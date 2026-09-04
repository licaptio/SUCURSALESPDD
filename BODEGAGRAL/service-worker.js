const CACHE_NAME = "proveedora-transferencias-v4";

const APP_ASSETS = [
  "./",
  "./indexasdasdsa321323.html",
  "./menuinicio.html",
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
        try {
          await cache.add(asset);
        } catch (error) {
          console.warn("No se pudo cachear:", asset, error);
        }
      }
    })
  );

  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    )
  );

  self.clients.claim();
});

self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copia = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
          return response;
        })
        .catch(async () => {
          return (
            await caches.match(event.request) ||
            await caches.match("./indexasdasdsa321323.html")
          );
        })
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        const copia = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copia));
        return response;
      });
    })
  );
});
