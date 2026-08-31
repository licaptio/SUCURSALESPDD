const CACHE='abarrotes-pdd-v11';
const LOCAL=['./','./index.html','./manifest.webmanifest','./assets/styles.css','./assets/app.js','./assets/firebase-config.js','./assets/telegram-config.js','./assets/logo.jfif','./assets/bodega-bg.webp','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(LOCAL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const isNav=e.request.mode==='navigate';
  e.respondWith(fetch(e.request,{cache:'no-store'}).then(r=>{
    if(r&&r.ok&&new URL(e.request.url).origin===location.origin){const cp=r.clone();caches.open(CACHE).then(c=>c.put(e.request,cp))}
    return r;
  }).catch(async()=>{
    const cached=await caches.match(e.request);
    if(cached)return cached;
    if(isNav)return caches.match('./index.html');
    return Response.error();
  }));
});
