import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as model from '../src/model.mjs';
const data={...JSON.parse(fs.readFileSync(new URL('../data/bootstrap.json',import.meta.url))),fixtures:JSON.parse(fs.readFileSync(new URL('../data/fixtures.json',import.meta.url))),histories:JSON.parse(fs.readFileSync(new URL('../data/histories.json',import.meta.url))),meta:{...JSON.parse(fs.readFileSync(new URL('../data/snapshot.json',import.meta.url))),live:false}};
data.meta.historyFetchedAt||=data.meta.fetchedAt;
const chosen=model.buildSquad(model.enrich(data,11),1000);
const nodes={};const element=()=>({innerHTML:'',textContent:'',classList:{add(){},remove(){}},style:{},focus(){},children:[],addEventListener(){},querySelector(){return element();}});
const document={body:{style:{}},activeElement:element(),querySelector(selector){return nodes[selector]||=(element());},addEventListener(){},createElement(){return element();}};
const saved=new Map([['madar-fpl-v1',JSON.stringify({settings:{gw:11},squad:chosen.map(p=>p.id)})]]);
const context=vm.createContext({model,document,location:{hash:'',reload(){}},window:{addEventListener(){},scrollTo(){}},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)},fetch:async()=>new Response(JSON.stringify(data)),setTimeout,clearTimeout,Intl,URL,Blob,console});
let source=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const imported=source.match(/^import \{([^}]+)\}/)[1];
source=source.replace(/^import[^\n]+\n/,`const {${imported}}=model;\n`).replace(/init\(\);\s*$/,'globalThis.appReady=init();');
vm.runInContext(source,context);
await context.appReady;
test('every navigation view renders with official statistics and no runtime error',()=>{
 for(const page of ['dashboard','squad','transfers','players','fixtures','prices','chips','advisor','settings','method']){
  vm.runInContext(`page='${page}';render();`,context);const html=nodes['#app'].innerHTML;
  assert.ok(html.includes('مَدار'),page);assert.ok(!html.includes('NaN'),page);assert.ok(!html.includes('undefined'),page);assert.ok(html.includes('id="main"'),page);assert.ok(html.includes('FPL'),page);
 }
});
test('the advisor grounds captain, transfer and price answers in the selected squad',()=>{
 const captain=vm.runInContext("answer('من أكبتن؟')",context);assert.ok(chosen.some(p=>captain.includes(p.web_name)));assert.match(captain,/xGI/);
 const price=vm.runInContext("answer('كيف أحسب قيمة البيع؟')",context);assert.match(price,/£5.1m/);
 const unsupported=vm.runInContext("answer('ما أخبار النادي في الصحافة؟')",context);assert.match(unsupported,/مصدرًا إضافيًا/);
});
test('player details render numeric evidence and a dated source, including defensive statistics',async()=>{
 const defender=chosen.find(p=>p.element_type===2);await vm.runInContext(`playerModal(${defender.id})`,context);
 const html=nodes['#modal-root'].innerHTML;assert.ok(html.includes(defender.web_name));assert.ok(html.includes('xGC'));assert.ok(html.includes('تحديث السجل'));assert.ok(!html.includes('NaN'));
});
