const APP_PREFIX = "provsoft-monitor-transferencias-pc-";
const CACHE_NAME = APP_PREFIX + "v1.0.0";

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
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).catch(() => {
        if (event.request.mode === "navigate") {
          return caches.match("./index.html");
        }
        throw new Error("Sin conexión y recurso no disponible en caché");
      });
    })
  );
});
