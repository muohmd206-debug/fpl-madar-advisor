import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import worker from '../dist/server/index.js';
import {createLocalServer} from '../local-server.mjs';

test('install manifest, icon dimensions and binary asset responses are valid',async()=>{
 const manifest=await (await worker.fetch(new Request('https://madar.test/manifest.webmanifest'))).json();
 assert.equal(manifest.display,'standalone');assert.equal(manifest.scope,'/');assert.equal(manifest.lang,'ar');assert.ok(manifest.icons.some(i=>i.purpose==='maskable'));
 for(const icon of manifest.icons){
  const response=await worker.fetch(new Request('https://madar.test'+icon.src));assert.equal(response.headers.get('Content-Type'),'image/png');
  const png=Buffer.from(await response.arrayBuffer());assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const size=Number(icon.sizes.split('x')[0]);assert.equal(png.readUInt32BE(16),size);assert.equal(png.readUInt32BE(20),size);
 }
 const sw=await worker.fetch(new Request('https://madar.test/sw.js'));assert.equal(sw.headers.get('Service-Worker-Allowed'),'/');
});

function swContext(){
 const listeners={},stores=new Map();
 const key=request=>new URL(typeof request==='string'?request:request.url,'https://madar.test').pathname;
 const caches={
  async open(name){if(!stores.has(name))stores.set(name,new Map());const store=stores.get(name);return {
   async match(request){return store.get(key(request))?.clone();},
   async put(request,response){store.set(key(request),response.clone());},
   async addAll(paths){for(const path of paths){const response=await worker.fetch(new Request('https://madar.test'+path));assert.equal(response.status,200,path);store.set(key(path),response.clone());}}
  };},
  async match(request){for(const store of stores.values())if(store.has(key(request)))return store.get(key(request)).clone();},
  async keys(){return [...stores.keys()];},async delete(name){return stores.delete(name);}
 };
 const self={location:{origin:'https://madar.test'},navigator:{onLine:false},clients:{claim:async()=>{}},skipWaiting:async()=>{},addEventListener:(name,fn)=>listeners[name]=fn};
 const context=vm.createContext({self,caches,URL,Request,Response,AbortSignal,fetch:async()=>{throw new Error('offline');}});
 vm.runInContext(fs.readFileSync(new URL('../src/sw.js',import.meta.url),'utf8'),context);
 return {context,caches,listeners,async lifecycle(type){let promise;listeners[type]({waitUntil:p=>promise=p});await promise;},async request(url,mode){let promise;const request=mode?{url,method:'GET',mode}:new Request(url);listeners.fetch({request,respondWith:p=>promise=p});return promise;}};
}

test('offline installation restores the full app and marks snapshot data stale',async()=>{
 const sw=swContext();await sw.lifecycle('install');await sw.lifecycle('activate');
 const response=await sw.request('https://madar.test/api/data?refresh=1');const data=await response.json();assert.equal(data.meta.live,false);assert.equal(data.meta.offline,true);assert.ok(data.elements.length>500);assert.ok(Date.parse(data.meta.fetchedAt));
 const page=await sw.request('https://madar.test/?source=installed','navigate');assert.match(await page.text(),/<html lang="ar" dir="rtl">/);
 const optimizer=await sw.request('https://madar.test/optimizer.js');assert.match(await optimizer.text(),/buildSquad/);
});

test('the newest saved data wins during an outage and imported teams are not cached',async()=>{
 const sw=swContext();await sw.lifecycle('install');const cache=await sw.caches.open('madar-data-v1');
 const data=await (await worker.fetch(new Request('https://madar.test/offline-data.json'))).json();data.meta.fetchedAt='2099-01-01T00:00:00Z';data.meta.live=true;
 await cache.put('/api/data',new Response(JSON.stringify(data)));
 const cached=await (await sw.request('https://madar.test/api/data')).json();assert.equal(cached.meta.fetchedAt,'2099-01-01T00:00:00Z');assert.equal(cached.meta.live,false);
 assert.equal(await sw.request('https://madar.test/api/entry/12345'),undefined);
 sw.context.self.navigator.onLine=true;sw.context.fetch=async()=>worker.fetch(new Request('https://madar.test/offline-data.json'));
 const serverFallback=await (await sw.request('https://madar.test/api/data')).json();assert.equal(serverFallback.meta.fetchedAt,'2099-01-01T00:00:00Z');
});

test('the portable local server serves the app, offline data and only binds loopback',async()=>{
 const app=await createLocalServer({worker,port:0,offline:true});
 try{
  assert.equal(app.server.address().address,'127.0.0.1');
  const health=await (await fetch(app.url+'/__madar/health')).json();assert.equal(health.app,'madar-fpl');
  const html=await (await fetch(app.url)).text();assert.match(html,/\/pwa.js/);
  const data=await (await fetch(app.url+'/api/data')).json();assert.equal(data.meta.live,false);assert.equal(data.meta.offline,true);
  const unavailable=await fetch(app.url+'/api/entry/123');assert.equal(unavailable.status,503);
  const head=await fetch(app.url+'/icons/icon-512.png',{method:'HEAD'});assert.equal(head.status,200);assert.equal((await head.arrayBuffer()).byteLength,0);
 }finally{await app.close();}
});
