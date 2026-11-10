import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {createLocalServer} from './local-server.mjs';
const root=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2);
const noOpen=args.includes('--no-open')||process.env.MADAR_NO_OPEN==='1';
const offline=args.includes('--offline');
const portOption=args.find(arg=>arg.startsWith('--port='));
const requestedPort=portOption?Number(portOption.slice(7)):8765;
if(!Number.isInteger(requestedPort)||requestedPort<0||requestedPort>65535)throw new Error('Invalid port.');
if(Number(process.versions.node.split('.')[0])<22)throw new Error('Use the ready-to-run Windows download, or Node.js 22 and newer.');
function openBrowser(url){
 let child;
 if(process.platform==='win32')child=spawn('cmd.exe',['/d','/s','/c',`start "" "${url}"`],{detached:true,stdio:'ignore',windowsHide:true});
 else if(process.platform==='darwin')child=spawn('open',[url],{detached:true,stdio:'ignore'});
 else child=spawn('xdg-open',[url],{detached:true,stdio:'ignore'});
 child.on('error',()=>console.log('Open this address in your browser: '+url));child.unref();
}
async function existingApp(port){
 try{const r=await fetch(`http://127.0.0.1:${port}/__madar/health`,{signal:AbortSignal.timeout(700)});return r.ok&&(await r.json()).app==='madar-fpl';}catch{return false;}
}
if(requestedPort&&await existingApp(requestedPort)){
 const url=`http://127.0.0.1:${requestedPort}`;console.log('Madar is already running: '+url);if(!noOpen)openBrowser(url);
}else{
 const built=path.join(root,'dist','server','index.js');
 try{await fs.access(built);}catch{console.log('Preparing Madar (no package installation needed)...');await import('./build.mjs');}
 const {default:worker}=await import(pathToFileURL(built).href);
 let app;
 for(let attempt=0;attempt<10;attempt++){
  try{app=await createLocalServer({worker,port:requestedPort?requestedPort+attempt:0,offline});break;}catch(error){if(error.code!=='EADDRINUSE'||attempt===9)throw error;}
 }
 console.log('Madar FPL Advisor 1.1.0');console.log('Ready: '+app.url);console.log('Keep this window open. Press Ctrl+C to stop.');
 if(offline)console.log('Offline mode: using the dated official-data snapshot.');
 if(!noOpen)openBrowser(app.url);
 for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
}
