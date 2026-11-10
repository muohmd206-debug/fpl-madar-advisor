import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {deflateRawSync} from 'node:zlib';
import {createHash} from 'node:crypto';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const runtimeArg=process.argv.find(arg=>arg.startsWith('--runtime-dir='));
if(!runtimeArg)throw new Error('Pass --runtime-dir=/absolute/path containing verified node.exe, LICENSE and VERIFIED.json');
const runtime=path.resolve(runtimeArg.slice('--runtime-dir='.length));
const version=JSON.parse(await fs.readFile(path.join(root,'package.json'),'utf8')).version;
const provenance=JSON.parse(await fs.readFile(path.join(runtime,'VERIFIED.json'),'utf8'));
const binary=await fs.readFile(path.join(runtime,'node.exe'));
if(binary.subarray(0,2).toString()!=='MZ'||createHash('sha256').update(binary).digest('hex')!==provenance.executable_sha256)throw new Error('Windows runtime verification failed.');
const inputs=[['START-MADAR.cmd','START-MADAR.cmd'],['start.mjs','start.mjs'],['local-server.mjs','local-server.mjs'],['dist/server/index.js','dist/server/index.js'],['WINDOWS-START.html','START-HERE.html']];
const entries=[];
for(const [source,target] of inputs){let contents=await fs.readFile(path.join(root,source));if(target.endsWith('.cmd'))contents=Buffer.from(contents.toString().replace(/\r?\n/g,'\r\n'));entries.push(['Madar/'+target,contents]);}
entries.push(['Madar/package.json',Buffer.from(JSON.stringify({name:'madar-fpl-portable',version,type:'module',private:true,scripts:{start:'node start.mjs'}}))]);
entries.push(['Madar/runtime/node.exe',binary]);
entries.push(['Madar/runtime/LICENSE.txt',await fs.readFile(path.join(runtime,'LICENSE'))]);
entries.push(['Madar/runtime/PROVENANCE.json',Buffer.from(JSON.stringify(provenance,null,2))]);
const table=new Uint32Array(256);for(let i=0;i<256;i++){let c=i;for(let j=0;j<8;j++)c=(c&1)?0xedb88320^(c>>>1):c>>>1;table[i]=c>>>0;}
function crc32(buffer){let crc=0xffffffff;for(const value of buffer)crc=(crc>>>8)^table[(crc^value)&255];return (crc^0xffffffff)>>>0;}
const local=[],central=[];let offset=0;
for(const [name,body] of entries){
 const filename=Buffer.from(name),compressed=deflateRawSync(body,{level:8}),crc=crc32(body);
 const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50,0);header.writeUInt16LE(20,4);header.writeUInt16LE(0x800,6);header.writeUInt16LE(8,8);header.writeUInt16LE(33,12);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(body.length,22);header.writeUInt16LE(filename.length,26);
 const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50,0);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(0x800,8);directory.writeUInt16LE(8,10);directory.writeUInt16LE(33,14);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(compressed.length,20);directory.writeUInt32LE(body.length,24);directory.writeUInt16LE(filename.length,28);directory.writeUInt32LE(offset,42);
 local.push(header,filename,compressed);central.push(directory,filename);offset+=header.length+filename.length+compressed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const archive=Buffer.concat([...local,directory,end]);
const output=path.join(root,'releases');await fs.mkdir(output,{recursive:true});
const name='Madar-Windows-x64.zip';await fs.writeFile(path.join(output,name),archive);
const sha256=createHash('sha256').update(archive).digest('hex');
await fs.writeFile(path.join(output,'SHA256SUMS.txt'),sha256+'  '+name+'\n');
console.log(JSON.stringify({version,archive:path.join(output,name),bytes:archive.length,sha256,entries:entries.length}));
