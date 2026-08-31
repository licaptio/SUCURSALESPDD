const CACHE='abarrotes-pdd-v25';
const LOCAL=['./','./index.html','./manifest.webmanifest','./assets/styles.css?v=25','./assets/styles.css','./assets/app.js?v=25','./assets/app.js','./assets/telegram-config.js','./assets/logo.jfif','./assets/bodega-bg.webp','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await Promise.allSettled(LOCAL.map(async u=>{try{const r=await fetch(u,{cache:'reload'});if(r.ok)await c.put(u,r.clone())}catch{}}));await self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{
 if(e.request.method!=='GET')return;
 const url=new URL(e.request.url);
 const same=url.origin===self.location.origin;
 if(!same)return; // Firebase/CDN se manejan por el navegador; nunca bloquean la instalación del SW.
 if(e.request.mode==='navigate'){
   e.respondWith((async()=>{try{const r=await fetch(e.request,{cache:'no-store'});if(r.ok){const c=await caches.open(CACHE);c.put('./index.html',r.clone()).catch(()=>{})}return r}catch{ return (await caches.match('./index.html')) || new Response('Sin conexión',{status:503})}})());
   return;
 }
 e.respondWith((async()=>{const cached=await caches.match(e.request)||await caches.match(url.pathname.split('/').pop()?'.'+url.pathname.substring(url.pathname.indexOf('/assets/')):'');if(cached)return cached;try{const r=await fetch(e.request);if(r.ok){const c=await caches.open(CACHE);c.put(e.request,r.clone()).catch(()=>{})}return r}catch{return new Response('Sin conexión',{status:503})}})());
});
