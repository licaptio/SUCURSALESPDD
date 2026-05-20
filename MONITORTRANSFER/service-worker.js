const CACHE_NAME = "proveedora-transferencias-v4";

const APP_ASSETS = [
  "./",
  "./index.html",
  "./manifest.json",
  "./config.js",
  "./logo.jfif",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
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

  event.respondWith(

    caches.match(event.request).then(response => {

      return response || fetch(event.request);

    })

  );

});
