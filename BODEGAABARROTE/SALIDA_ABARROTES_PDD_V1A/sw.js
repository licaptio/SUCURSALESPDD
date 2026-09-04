const CACHE='abarrotes-pdd-v32-ahorro';
const LOCAL=['./','./index.html','./manifest.webmanifest','./assets/styles.css?v=32','./assets/app.js?v=32','./assets/telegram-config.js','./assets/firebase-connections.js?v=32','./assets/logo.jfif','./assets/bodega-bg.webp','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await Promise.allSettled(LOCAL.map(async u=>{try{const r=await fetch(u,{cache:'reload'});if(r.ok)await c.put(u,r.clone())}catch{}}));await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const url=new URL(e.request.url);if(url.origin!==self.location.origin)return;
  const isFreshCode=e.request.mode==='navigate'||/\/(index\.html|sw\.js)$/.test(url.pathname)||/\/assets\/(app\.js|styles\.css)$/.test(url.pathname);
  if(isFreshCode){
    e.respondWith((async()=>{try{const r=await fetch(e.request,{cache:'no-store'});if(r.ok){const c=await caches.open(CACHE);c.put(e.request,r.clone()).catch(()=>{})}return r}catch{return (await caches.match(e.request))||(e.request.mode==='navigate'?await caches.match('./index.html'):null)||new Response('Sin conexión',{status:503})}})());
    return;
  }
  e.respondWith((async()=>{const cached=await caches.match(e.request);if(cached)return cached;try{const r=await fetch(e.request,{cache:'no-cache'});if(r.ok){const c=await caches.open(CACHE);c.put(e.request,r.clone()).catch(()=>{})}return r}catch{return new Response('Sin conexión',{status:503})}})());
});
