import {test} from 'node:test';
import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
test('all app assets and modules are available with correct content types',async()=>{
 for(const path of ['/','/app.js','/model.mjs','/optimizer.js','/styles.css','/favicon.svg']){const r=await worker.fetch(new Request('https://madar.test'+path));assert.equal(r.status,200,path);const body=await r.text();assert.ok(body.length>50,path);assert.ok(r.headers.get('Content-Type'),path);if(path==='/')assert.match(body,/<html lang="ar" dir="rtl">/);}
 const missing=await worker.fetch(new Request('https://madar.test/unknown'));assert.equal(missing.status,404);
});
test('an upstream outage returns a clearly dated fallback with all statistics',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async()=>{throw new Error('network unavailable');};
 try{const r=await worker.fetch(new Request('https://madar.test/api/data'));assert.equal(r.status,200);const d=await r.json();assert.equal(d.meta.live,false);assert.ok(Date.parse(d.meta.fetchedAt));assert.ok(d.elements.length>500);assert.ok(d.fixtures.length>=380);assert.ok(Object.keys(d.histories).length>300);assert.ok(d.events.find(e=>e.id===11));}finally{globalThis.fetch=original;}
});
test('API rejects unsupported methods and does not expose arbitrary upstream paths',async()=>{
 const post=await worker.fetch(new Request('https://madar.test/api/data',{method:'POST'}));assert.equal(post.status,405);
 const invalid=await worker.fetch(new Request('https://madar.test/api/entry/../../secrets'));assert.notEqual(invalid.status,200);
 const unknown=await worker.fetch(new Request('https://madar.test/api/arbitrary'));assert.equal(unknown.status,404);
});
test('live data refresh preserves snapshot history and marks the data live',async()=>{
 const original=globalThis.fetch;const data=await (await worker.fetch(new Request('https://madar.test/api/data'))).json();
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).includes('bootstrap-static')?data:data.fixtures),{status:200,headers:{'Content-Type':'application/json'}});
 try{const r=await worker.fetch(new Request('https://madar.test/api/data?refresh=1'));const live=await r.json();assert.equal(live.meta.live,true);assert.ok(live.histories['411'].length);assert.ok(Date.parse(live.meta.historyFetchedAt));}finally{globalThis.fetch=original;}
});
