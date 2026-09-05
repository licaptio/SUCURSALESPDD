const CACHE_NAME = "salidas-zapata-v5-fuente-articulos";

const ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./config.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const req = event.request;

  // Para HTML/JS/CSS/config primero intenta red. Así el celular no queda atorado en app.js viejo.
  const url = new URL(req.url);
  const esArchivoApp = ["/", "/index.html", "/app.js", "/config.js", "/styles.css", "/manifest.json"].some(x => url.pathname.endsWith(x));

  if (req.method === "GET" && esArchivoApp) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copia = res.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(req, copia));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  event.respondWith(caches.match(req).then(cached => cached || fetch(req)));
});
