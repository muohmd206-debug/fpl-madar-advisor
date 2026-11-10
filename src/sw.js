const SHELL='madar-shell-v1.1.0';
const DATA='madar-data-v1';
const FILES=['/','/app.js','/styles.css','/model.mjs','/optimizer.js','/pwa.js','/favicon.svg','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png','/offline-data.json'];
self.addEventListener('install',event=>{
 event.waitUntil(caches.open(SHELL).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
 event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('madar-shell-')&&k!==SHELL).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
async function savedData(){
 const cache=await caches.open(DATA);
 const known=await cache.match('/api/data')||await caches.match('/offline-data.json');
 if(!known)return new Response(JSON.stringify({error:'افتح التطبيق مرة واحدة أثناء الاتصال بالإنترنت لحفظ بياناته.'}),{status:503,headers:{'Content-Type':'application/json'}});
 const data=await known.json();data.meta={...data.meta,live:false,offline:true};
 return new Response(JSON.stringify(data),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
async function dataRequest(request){
 try{
  if(self.navigator?.onLine===false)return savedData();
  const result=await fetch(request,{signal:AbortSignal.timeout(16000)});
  if(!result.ok)return savedData();
  const copy=result.clone();const data=await copy.json();
  if(Array.isArray(data.elements)&&data.meta?.live){const cache=await caches.open(DATA);await cache.put('/api/data',result.clone());}
  // A server-side outage can return a successful, older snapshot. Keep the newer saved response.
  if(!data.meta?.live){const cache=await caches.open(DATA),known=await cache.match('/api/data');if(known){const prior=await known.clone().json();if(Date.parse(prior.meta?.fetchedAt)>Date.parse(data.meta?.fetchedAt))return savedData();}}
  return result;
 }catch{return savedData();}
}
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin)return;
 if(url.pathname==='/api/data'){event.respondWith(dataRequest(request));return;}
 // Team IDs and imported team responses are never cached by the service worker.
 if(url.pathname.startsWith('/api/')||url.pathname.startsWith('/__madar/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request,{signal:AbortSignal.timeout(5000)}).catch(()=>caches.match('/')));return;
 }
 if(FILES.includes(url.pathname))event.respondWith(caches.match(url.pathname).then(known=>known||fetch(request)));
});
