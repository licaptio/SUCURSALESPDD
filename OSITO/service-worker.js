const CACHE_NAME = "provsoft-osito-v1";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./pwa-register.js",
  "./logo.jfif",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./altamerma_osito.html",
  "./config.js",
  "./devoluciomerca_osito.html",
  "./listatransfer_osito.html",
  "./menuoso.html",
  "./solicitudmerca_osito.html"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_ASSETS))
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

  event.respondWith(
    fetch(event.request)
      .then(response => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
