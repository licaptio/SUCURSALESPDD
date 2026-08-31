const CACHE='abarrotes-pdd-v14';
const LOCAL=['./','./index.html','./manifest.webmanifest','./assets/styles.css','./assets/app.js?v=14','./assets/app.js','./assets/firebase-config.js','./assets/telegram-config.js','./assets/logo.jfif','./assets/bodega-bg.webp','./assets/icons/icon-192.png','./assets/icons/icon-512.png'];
const EXTERNAL=[
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js',
  'https://cdn.jsdelivr.net/npm/jspdf@2.5.2/+esm'
];
self.addEventListener('install',e=>e.waitUntil((async()=>{
  const c=await caches.open(CACHE);
  await Promise.allSettled([...LOCAL,...EXTERNAL].map(async u=>{try{const r=await fetch(u,{cache:'reload'});if(r&&r.ok)await c.put(u,r.clone())}catch{}}));
  await self.skipWaiting();
})()));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  const isNav=e.request.mode==='navigate';
  e.respondWith((async()=>{
    const cached=await caches.match(e.request,{ignoreSearch:false}) || await caches.match(e.request.url.replace(/\?v=14$/,''));
    try{
      const r=await fetch(e.request);
      if(r && (r.ok||r.type==='opaque')){const c=await caches.open(CACHE);c.put(e.request,r.clone()).catch(()=>{})}
      return r;
    }catch(err){
      if(cached)return cached;
      if(isNav){const shell=await caches.match('./index.html');if(shell)return shell}
      return new Response('Sin conexión',{status:503,statusText:'Offline'});
    }
  })());
});
