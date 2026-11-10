import http from 'node:http';

export async function createLocalServer({worker,port=8765,offline=false}={}){
 if(!worker?.fetch)throw new Error('A built Madar worker is required.');
 let origin;
 const server=http.createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,origin).pathname;
   if(path==='/__madar/health'){
    res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify({app:'madar-fpl',version:'1.1.1'}));return;
   }
   if(offline&&path.startsWith('/api/')&&path!=='/api/data'){
    res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'هذه العملية تحتاج اتصالًا بالإنترنت.'}));return;
   }
   const url=new URL(offline&&path==='/api/data'?'/offline-data.json':req.url,origin);
   const request=new Request(url,{method:req.method,headers:{Accept:req.headers.accept||'*/*'}});
   const result=await worker.fetch(request);
   res.writeHead(result.status,Object.fromEntries(result.headers));
   res.end(req.method==='HEAD'?undefined:Buffer.from(await result.arrayBuffer()));
  }catch{
   if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json'});
   res.end(JSON.stringify({error:'تعذر إكمال الطلب المحلي.'}));
  }
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
 origin=`http://127.0.0.1:${server.address().port}`;
 return {server,url:origin,close:()=>new Promise((resolve,reject)=>{server.closeIdleConnections();server.close(error=>error?reject(error):resolve());})};
}
