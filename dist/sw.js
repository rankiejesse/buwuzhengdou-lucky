const CACHE='bean-shell-v1.0.0';
const FILES=['./','./index.html','./style.css','./app.js','./engine.js','./storage.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));});
// Do not skipWaiting: the new shell activates after old clients close, keeping modules coherent.
self.addEventListener('activate',event=>{event.waitUntil((async()=>{for(const k of await caches.keys())if(k.startsWith('bean-shell-')&&k!==CACHE)await caches.delete(k);await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!url.pathname.startsWith(new URL('./',self.location).pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);const hit=await cache.match(event.request,{ignoreSearch:true});if(hit)return hit;
    if(event.request.mode==='navigate'){try{return await fetch(event.request);}catch{return await cache.match('./index.html');}}
    return fetch(event.request);
  })());
});
