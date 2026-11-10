import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildSquad,enrich,validateSquad,bestLineup,sellingPrice,transferIdeas,chipAdvice} from '../src/model.mjs';
const data={...JSON.parse(fs.readFileSync(new URL('../data/bootstrap.json',import.meta.url))),fixtures:JSON.parse(fs.readFileSync(new URL('../data/fixtures.json',import.meta.url))),histories:JSON.parse(fs.readFileSync(new URL('../data/histories.json',import.meta.url)))};
const gw=data.events.find(e=>e.is_next)?.id||11;
const players=enrich(data,gw);
let chosen;
test('a new £100m squad satisfies budget, position, uniqueness and club constraints',()=>{
 chosen=buildSquad(players,1000);assert.deepEqual(validateSquad(chosen,1000),[]);assert.equal(chosen.length,15);assert.ok(chosen.every(p=>p.chance>=.75));
 console.log('Selected squad',chosen.map(p=>p.web_name).join(', '));console.log('Cost',chosen.reduce((s,p)=>s+p.now_cost,0)/10);
});
test('lineup has eleven legal starters, four reserves and a captain whose points count twice',()=>{
 const l=bestLineup(chosen);assert.equal(l.starters.length,11);assert.equal(l.bench.length,4);assert.equal(l.starters.filter(p=>p.element_type===1).length,1);assert.ok(l.starters.filter(p=>p.element_type===2).length>=3);assert.notEqual(l.captain.id,l.vice.id);assert.equal(l.points,l.starters.reduce((s,p)=>s+p.xp,0)+l.captain.xp);assert.equal(new Set([...l.starters,...l.bench].map(p=>p.id)).size,15);
 console.log('Captain',l.captain.web_name,'XP',l.points.toFixed(2),'Formation',l.formation);
});
test('selling value rounds profit down and charges losses in full',()=>{assert.equal(sellingPrice(50,53),51);assert.equal(sellingPrice(50,54),52);assert.equal(sellingPrice(50,51),50);assert.equal(sellingPrice(50,48),48);assert.equal(sellingPrice(50,50),50);});
test('every proposed transfer is legal, affordable, and includes the four-point hit when no transfer remains',()=>{
 const ideas=transferIdeas(chosen,players,35,{},0);assert.ok(ideas.length>0);for(const idea of ideas){const after=chosen.map(p=>p.id===idea.out.id?idea.in:p);assert.deepEqual(validateSquad(after,chosen.reduce((s,p)=>s+p.now_cost,0)+35),[]);assert.ok(idea.bank>=0);assert.equal(idea.hit,4);assert.equal(idea.netGain,idea.gain-4);}
});
test('missing history and missing fixtures do not produce NaN or invented opponents',()=>{
 const missing={...data,histories:{},fixtures:[]};const ps=enrich(missing,gw);assert.ok(ps.every(p=>Number.isFinite(p.xp)&&p.xp===0&&p.cs===null));
});
test('blank and double gameweeks change forecasts according to actual fixture counts',()=>{
 const p=players.find(p=>p.xp>3);const fixtures=data.fixtures.filter(f=>f.event===gw&&(f.team_h===p.team||f.team_a===p.team));assert.ok(fixtures.length);
 const extra={...fixtures[0],id:99999};const twice=enrich({...data,fixtures:[...data.fixtures,extra]},gw).find(x=>x.id===p.id);assert.ok(Math.abs(twice.xp-p.xp*2)<1e-8);
 const blank=enrich({...data,fixtures:data.fixtures.filter(f=>!fixtures.some(o=>o.id===f.id))},gw).find(x=>x.id===p.id);assert.equal(blank.xp,0);
});
test('unavailable players receive zero predicted points and are excluded by the optimizer',()=>{
 const p=players.find(p=>p.xp>3);const changed={...data,elements:data.elements.map(x=>x.id===p.id?{...x,status:'i',chance_of_playing_next_round:0}:x)};const ps=enrich(changed,gw);assert.equal(ps.find(x=>x.id===p.id).xp,0);
});
test('chip windows and a used chip are honored',()=>{const tips=chipAdvice(data,chosen,gw,true,{wildcard:false});assert.equal(tips.find(c=>c.key==='wildcard').available,false);for(const tip of tips.filter(c=>c.available)){assert.ok(tip.stop>=gw);}});
test('impossible budgets fail clearly instead of returning an invalid squad',()=>{assert.throws(()=>buildSquad(players,100),/الميزانية/);});
