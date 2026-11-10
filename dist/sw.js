const CACHE='bean-shell-v1.3.0';
const FILES=['./index.html','./browser.html','./repair.html','./style.css','./app.js','./engine.js','./storage.js','./auth.js','./workbench.js','./workbench-ui.js','./language.js','./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png'];
self.addEventListener('install',event=>event.waitUntil((async()=>{
  const cache=await caches.open(CACHE);
  await cache.addAll(FILES.map(path=>new Request(new URL(path,self.location),{cache:'reload'})));
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for(const k of await caches.keys())if(k.startsWith('bean-shell-')&&k!==CACHE)await caches.delete(k);
  await self.clients.claim();
})()));
// Explicit activation from the repair page; ordinary updates wait for clients to close.
self.addEventListener('message',event=>{if(event.data?.type==='ACTIVATE_BEAN_UPDATE')self.skipWaiting();});
async function network(request){
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);
  try{return await fetch(request,{signal:controller.signal});}finally{clearTimeout(timer);}
}
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url),scope=new URL('./',self.location);
  if(event.request.method!=='GET'||url.origin!==scope.origin||!url.pathname.startsWith(scope.pathname))return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    if(event.request.mode==='navigate'){
      const isRepair=url.pathname===new URL('./repair.html',scope).pathname;
      if(isRepair){try{const response=await network(event.request);if(response.ok)return response;}catch{}}
      // Launch aliases, queries and missing directory entries share the cached document.
      const isBrowser=url.pathname===new URL('./browser.html',scope).pathname;
      const shell=await cache.match(isRepair?'./repair.html':isBrowser?'./browser.html':'./index.html',{ignoreSearch:true,ignoreVary:true});
      if(shell)return shell;
      try{return await network(event.request);}catch{return new Response('<!doctype html><html lang="zh-CN"><meta name="viewport" content="width=device-width"><title>启动需要联网</title><body style="padding:32px;background:#f7f5ef;color:#63477c;font:18px sans-serif"><h1>请联网完成应用更新</h1><p>启动文件暂不可用，本机奖池与领取记录未被清除。</p><a href="./repair.html">打开启动帮助</a></body></html>',{status:503,headers:{'Content-Type':'text/html; charset=utf-8'}});}
    }
    const hit=await cache.match(event.request,{ignoreSearch:true,ignoreVary:true});
    return hit||network(event.request);
  })());
});
