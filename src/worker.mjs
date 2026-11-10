// Build injects local assets and the dated official-data snapshot above this module.
let cache=null;
const historyCache=new Map();
const response=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
async function official(path){
 const result=await fetch('https://fantasy.premierleague.com/api/'+path,{headers:{'Accept':'application/json','User-Agent':'Madar-FPL-Advisor/1.0'},signal:AbortSignal.timeout(14000)});
 if(!result.ok)throw new Error('FPL '+result.status);
 return result.json();
}
async function getData(force=false){
 if(!force&&cache&&Date.now()-cache.time<180000)return cache.data;
 try{
  const [bootstrap,fixtures]=await Promise.all([official('bootstrap-static/'),official('fixtures/')]);
  if(!Array.isArray(bootstrap.elements)||!Array.isArray(bootstrap.events)||!Array.isArray(fixtures))throw new Error('invalid data');
  const data={...bootstrap,fixtures,histories:SNAPSHOT.histories,meta:{fetchedAt:new Date().toISOString(),historyFetchedAt:SNAPSHOT.meta.historyFetchedAt||SNAPSHOT.meta.fetchedAt,live:true,source:'https://fantasy.premierleague.com/api/'}};
  cache={time:Date.now(),data};return data;
 }catch{
  if(cache){return {...cache.data,meta:{...cache.data.meta,live:false,cached:true}};}
  return SNAPSHOT;
 }
}
export default {
 async fetch(request){
  const url=new URL(request.url),path=url.pathname;
  if(request.method!=='GET'&&request.method!=='HEAD')return response({error:'طريقة الطلب غير مدعومة.'},405);
  try{
   if(path==='/api/data')return response(await getData(url.searchParams.get('refresh')==='1'));
   if(path==='/offline-data.json')return response({...SNAPSHOT,meta:{...SNAPSHOT.meta,live:false,offline:true}});
   const history=path.match(/^\/api\/history\/(\d{1,7})$/);
   if(history){const id=Number(history[1]);const base=await getData();if(!base.elements.some(p=>p.id===id))return response({error:'اللاعب غير موجود.'},404);const known=historyCache.get(id);if(known&&Date.now()-known.time<900000)return response(known.data);try{const fresh=await official(`element-summary/${id}/`);historyCache.set(id,{time:Date.now(),data:fresh});return response(fresh);}catch{return response({error:'تعذر تحديث سجل اللاعب.'},503);}}
   const entry=path.match(/^\/api\/entry\/(\d{1,8})$/);
   if(entry){
    const id=Number(entry[1]);if(!id)return response({error:'رقم الفريق غير صالح.'},400);
    let details;try{details=await official(`entry/${id}/`);}catch{return response({error:'تعذر العثور على فريق بهذا الرقم. تأكد من Team ID.'},404);}
    const base=await getData();const current=base.events.find(e=>e.is_current)?.id||base.events.filter(e=>e.finished).at(-1)?.id||1;
    let picks,event=current;
    for(let gw=current;gw>=Math.max(1,current-2);gw--){try{const p=await official(`entry/${id}/event/${gw}/picks/`);if(p.picks?.length===15){picks=p.picks;event=gw;break;}}catch{}}
    if(!picks)return response({error:'لا توجد تشكيلة عامة منشورة للفريق بعد. أدخل فريقك محليًا أو انتظر أول جولة.'},404);
    return response({entry:{id:details.id,name:details.name,summary_overall_rank:details.summary_overall_rank,last_deadline_bank:details.last_deadline_bank},picks,event});
   }
   if(path.startsWith('/api/'))return response({error:'المسار غير موجود.'},404);
   const asset=ASSETS[path]||(path==='/'?ASSETS['/index.html']:null);
   if(!asset)return new Response('Page not found',{status:404});
   const body=asset.encoding==='base64'?Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0)):asset.body;
   return new Response(request.method==='HEAD'?null:body,{headers:{'Content-Type':asset.type,'Cache-Control':'public, max-age=0, must-revalidate','X-Content-Type-Options':'nosniff',...(path==='/sw.js'?{'Service-Worker-Allowed':'/'}:{}),'Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; base-uri 'self'; form-action 'self'"}});
  }catch{return response({error:'تعذر إكمال الطلب. حاول التحديث مرة أخرى.'},500);}
 }
};
