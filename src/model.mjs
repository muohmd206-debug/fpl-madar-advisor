export const n = v => Number(v) || 0;
export const clamp = (v,a,b) => Math.max(a,Math.min(b,v));
export const POS = {1:'حارس',2:'دفاع',3:'وسط',4:'هجوم'};
export const REQUIRED = {1:2,2:5,3:5,4:3};
export const money = v => `£${(n(v)/10).toFixed(1)}m`;
export function sellingPrice(buy,current){return current<=buy?current:buy+Math.floor((current-buy)/2);}
export function fixturesFor(data,team,gw){return data.fixtures.filter(f=>f.event===gw&&(f.team_h===team||f.team_a===team));}
export function opponent(data,f,team){const home=f.team_h===team;const id=home?f.team_a:f.team_h;return {team:data.teams.find(t=>t.id===id),home,fdr:home?f.team_h_difficulty:f.team_a_difficulty};}
export function availability(p){if(p.status==='a')return 1; if(p.chance_of_playing_next_round!=null)return n(p.chance_of_playing_next_round)/100;return p.status==='d'?.75:0;}
export function recent(p,data,gw){
  const history=(data.histories?.[p.id]||[]).filter(h=>h.round<gw).sort((a,b)=>a.round-b.round||String(a.kickoff_time).localeCompare(String(b.kickoff_time))).slice(-5);
  const sum=k=>history.reduce((s,h)=>s+n(h[k]),0);
  const minutes=sum('minutes');const games=history.length;
  const season90=Math.max(1,n(p.minutes)/90);const rec90=Math.max(1,minutes/90);const weight=clamp(minutes/360,0,.7);
  const rate=(key,total)=>games?(sum(key)/rec90*weight+n(total)/season90*(1-weight)):n(total)/season90;
  const completed=Math.max(1,data.events.filter(e=>e.finished).length);
  const avg=games?minutes/games:n(p.minutes)/completed;
  return {history,games,minutes,xg:games?sum('expected_goals'):n(p.expected_goals),xa:games?sum('expected_assists'):n(p.expected_assists),xgc:games?sum('expected_goals_conceded'):n(p.expected_goals_conceded),goals:games?sum('goals_scored'):n(p.goals_scored),assists:games?sum('assists'):n(p.assists),xg90:rate('expected_goals',p.expected_goals),xa90:rate('expected_assists',p.expected_assists),xgc90:rate('expected_goals_conceded',p.expected_goals_conceded),saves90:rate('saves',p.saves),bonus90:rate('bonus',p.bonus),avgMinutes:clamp(avg,0,90),window:games?'آخر '+games+' مباريات':'الموسم',defRate:games?history.filter(h=>n(h.defensive_contribution)>=(p.element_type===2?10:12)).length/games:0};
}
function teamRates(data){
  const rates={};
  for(const t of data.teams){
    const ps=data.elements.filter(p=>p.team===t.id);const games=Math.max(1,data.fixtures.filter(f=>f.finished&&(f.team_h===t.id||f.team_a===t.id)).length);
    const defenders=ps.filter(p=>p.minutes>180).sort((a,b)=>b.minutes-a.minutes).slice(0,5);
    const xgc=defenders.length?defenders.reduce((s,p)=>s+n(p.expected_goals_conceded)/Math.max(1,p.minutes/90),0)/defenders.length:1.4;
    rates[t.id]={xg:ps.reduce((s,p)=>s+n(p.expected_goals),0)/games,xgc};
  }return rates;
}
export function enrich(data,gw,horizon=5,risk='balanced'){
 const rates=teamRates(data);const league=Math.max(.7,Object.values(rates).reduce((s,r)=>s+r.xg,0)/Math.max(1,data.teams.length));
 return data.elements.map(p=>{
  const r=recent(p,data,gw);const chance=availability(p);const minuteFactor=r.avgMinutes/90;
  const forecast=g=>fixturesFor(data,p.team,g).reduce((sum,f)=>{
   const op=opponent(data,f,p.team);const strength=({1:1.25,2:1.12,3:1,4:.84,5:.7}[op.fdr]||1)*(op.home?1.04:.96);
   const lambda=clamp((rates[p.team]?.xgc||1.4)*(rates[op.team.id]?.xg||league)/league*(op.home?.92:1.08),.25,3.5);
   const clean=Math.exp(-lambda);const sixty=clamp((r.avgMinutes-30)/40,0,1);
   const appearance=minuteFactor>0?(1+sixty):0;
   const attack=(r.xg90*({1:6,2:6,3:5,4:4}[p.element_type])+r.xa90*3)*minuteFactor*strength;
   const cs=clean*({1:4,2:4,3:1,4:0}[p.element_type])*sixty;
   const concede=p.element_type<=2?lambda/2-(1-Math.exp(-2*lambda))/4:0;
   const saves=p.element_type===1?r.saves90/3*minuteFactor:0;
   const defensive=p.element_type>1?2*r.defRate:0;
   const cards=(n(p.yellow_cards)*.1+n(p.red_cards)*.3)/Math.max(1,p.minutes/90);
   return sum+Math.max(0,(appearance+attack+cs-concede*sixty+saves+Math.min(1.2,r.bonus90)*minuteFactor+defensive-cards)*chance);
  },0);
  const forecasts=Array.from({length:horizon},(_,i)=>forecast(gw+i));
  const xgiForecasts=Array.from({length:horizon},(_,i)=>fixturesFor(data,p.team,gw+i).reduce((sum,f)=>{const op=opponent(data,f,p.team);const factor=({1:1.25,2:1.12,3:1,4:.84,5:.7}[op.fdr]||1)*(op.home?1.04:.96);return sum+(r.xg90+r.xa90)*minuteFactor*factor*chance;},0));
  const currentFixtures=fixturesFor(data,p.team,gw);
  const cs=currentFixtures.map(f=>{const op=opponent(data,f,p.team);return Math.exp(-clamp((rates[p.team]?.xgc||1.4)*(rates[op.team.id]?.xg||league)/league*(op.home?.92:1.08),.25,3.5));});
  const ownership=n(p.selected_by_percent);const style=risk==='chase'?(ownership<10?.2:0):risk==='protect'?(ownership>25?.12:0):0;
  return {...p,recent:r,xp:forecasts[0]||0,forecasts,xgi:xgiForecasts[0]||0,xgiScore:(xgiForecasts[0]||0)*.5+xgiForecasts.reduce((a,b)=>a+b,0)/horizon*.5,score:(forecasts[0]||0)*.5+forecasts.reduce((a,b)=>a+b,0)/horizon*.5+style,cs:cs.length?cs[0]:null,chance,net:n(p.transfers_in_event)-n(p.transfers_out_event),ppm:n(p.total_points)/(p.now_cost/10)};
 });
}
export function bestLineup(squad,key='xp'){
 const groups={};for(let pos=1;pos<=4;pos++)groups[pos]=squad.filter(p=>p.element_type===pos).sort((a,b)=>b[key]-a[key]);
 let best=null;
 for(let d=3;d<=5;d++)for(let m=2;m<=5;m++){
  const f=10-d-m;if(f<1||f>3||groups[2].length<d||groups[3].length<m||groups[4].length<f||!groups[1].length)continue;
  const starters=[groups[1][0],...groups[2].slice(0,d),...groups[3].slice(0,m),...groups[4].slice(0,f)];
  const trusted=starters.filter(p=>p.chance>=.75&&p.recent.avgMinutes>=60);
  const sorted=[...(trusted.length>=2?trusted:starters)].sort((a,b)=>(key==='score'?b.xgiScore-a.xgiScore:b.xgi-a.xgi)||b[key]-a[key]);
  const score=starters.reduce((s,p)=>s+p[key],0)+(sorted[0]?.[key]||0);
  if(!best||score>best.points)best={starters,captain:sorted[0],vice:sorted[1],formation:`${d}-${m}-${f}`,points:score};
 }
 if(!best)return {starters:[],bench:squad,captain:null,vice:null,formation:'—',points:0};
 const ids=new Set(best.starters.map(p=>p.id));best.bench=squad.filter(p=>!ids.has(p.id)).sort((a,b)=>(a.element_type===1?1:0)-(b.element_type===1?1:0)||b[key]-a[key]);return best;
}
export function validateSquad(squad,budget=1000){
 const errors=[];if(squad.length!==15)errors.push('يجب اختيار 15 لاعبًا');
 if(new Set(squad.map(p=>p.id)).size!==squad.length)errors.push('يوجد لاعب مكرر');
 for(const [pos,count] of Object.entries(REQUIRED))if(squad.filter(p=>p.element_type===n(pos)).length!==count)errors.push('عدد لاعبي '+POS[pos]+' غير صحيح');
 const clubs={};for(const p of squad)clubs[p.team]=(clubs[p.team]||0)+1;if(Object.values(clubs).some(c=>c>3))errors.push('الحد الأقصى 3 لاعبين من النادي نفسه');
 if(squad.reduce((s,p)=>s+p.now_cost,0)>budget)errors.push('تجاوزت الميزانية');return errors;
}
function objective(squad){const l=bestLineup(squad,'score');return l.points+l.bench.reduce((s,p)=>s+p.score*.12,0);}
export function buildSquad(players,budget=1000){
 const pool=players.filter(p=>p.can_select!==false&&!p.removed&&p.chance>=.75&&p.recent.avgMinutes>=35&&p.minutes>=90);
 let best=null;const premiums=[...pool].sort((a,b)=>b.score-a.score).slice(0,4);
 for(let attempt=0;attempt<9;attempt++){
  let squad=[];const counts={};const forced=attempt>0&&attempt<5?premiums[attempt-1]:null;
  if(forced){squad.push(forced);counts[forced.team]=1;}
  for(let pos=1;pos<=4;pos++){
   const sorted=pool.filter(p=>p.element_type===pos).sort((a,b)=>a.now_cost-b.now_cost||b.score-a.score);
   while(squad.filter(p=>p.element_type===pos).length<REQUIRED[pos]){
    const p=sorted.find(p=>!squad.some(s=>s.id===p.id)&&(counts[p.team]||0)<3);if(!p)break;squad.push(p);counts[p.team]=(counts[p.team]||0)+1;
   }
  }
  if(validateSquad(squad,budget).length)continue;
  let cost=squad.reduce((s,p)=>s+p.now_cost,0);let value=objective(squad);
  const exponent=[.75,.75,.8,.65,.6,.5,.9,1,.35][attempt];
  for(let iteration=0;iteration<45;iteration++){
   let move=null;let moveRank=0;
   for(let i=0;i<squad.length;i++){
    const old=squad[i];
    for(const p of pool){
     if(p.element_type!==old.element_type||squad.some(s=>s.id===p.id)||cost-old.now_cost+p.now_cost>budget||((counts[p.team]||0)-(old.team===p.team?1:0))>=3)continue;
     if(p.score<=old.score&&p.now_cost>=old.now_cost)continue;
     const next=[...squad];next[i]=p;const gain=objective(next)-value;const extra=p.now_cost-old.now_cost;
     const rank=gain/Math.pow(Math.max(1,extra),exponent);
     if(gain>.002&&rank>moveRank){move={i,p,extra,gain};moveRank=rank;}
    }
   }
   if(!move)break;const old=squad[move.i];counts[old.team]--;counts[move.p.team]=(counts[move.p.team]||0)+1;squad[move.i]=move.p;cost+=move.extra;value+=move.gain;
  }
  if(!best||value>best.value)best={squad,value};
 }
 if(!best)throw new Error('الميزانية لا تكفي لفريق مكتمل من اللاعبين المتاحين. ارفعها أو عدّل اختيارك.');
 return best.squad;
}
export function transferIdeas(squad,players,bank=0,purchases={},free=1){
 const result=[];const ids=new Set(squad.map(p=>p.id));
 for(const out of squad){
  const sale=sellingPrice(purchases[out.id]??out.now_cost,out.now_cost);
  const current=out.forecasts.slice(0,3).reduce((a,b)=>a+b,0);
  for(const incoming of players){
   if(ids.has(incoming.id)||incoming.element_type!==out.element_type||incoming.chance<.75||incoming.recent.avgMinutes<45||incoming.now_cost>sale+bank)continue;
   if(squad.filter(p=>p.team===incoming.team&&p.id!==out.id).length>=3)continue;
   const gain=incoming.forecasts.slice(0,3).reduce((a,b)=>a+b,0)-current;const hit=free>0?0:4;
   if(gain>0)result.push({out,in:incoming,gain,hit,netGain:gain-hit,bank:bank+sale-incoming.now_cost,sale});
  }
 }
 return result.sort((a,b)=>b.netGain-a.netGain).filter((x,i,a)=>a.findIndex(y=>y.out.id===x.out.id)===i).slice(0,6);
}
export function priceSignal(p){
 const flow=n(p.net??n(p.transfers_in_event)-n(p.transfers_out_event));
 return {label:flow>0?'ضغط شراء':flow<0?'ضغط بيع':'مستقر',direction:Math.sign(flow),flow,change:n(p.cost_change_event)/10};
}
export function chipAdvice(data,squad,gw,isNew=true,enabled={}){
 const lineup=bestLineup(squad);const active=data.chips?.filter(c=>gw>=c.start_event&&gw<=c.stop_event)||[];
 const window=name=>active.find(c=>c.name===name);const opportunities=[];
 for(let g=gw;g<Math.min(39,gw+5);g++){
  const blanks=squad.filter(p=>!fixturesFor(data,p.team,g).length).length;const doubles=squad.filter(p=>fixturesFor(data,p.team,g).length>1).length;
  opportunities.push({gw:g,blanks,doubles});
 }
 const names={wildcard:'Wildcard',freehit:'Free Hit',bboost:'Bench Boost','3xc':'Triple Captain'};
 return Object.keys(names).map(key=>{
  const w=window(key);const available=!!w&&enabled[key]!==false;let advice='احتفظ بها لحين اتضاح الجدول والأخبار.';let status='انتظر';
  if(key==='wildcard')advice=isNew?'تكوين فريقك الأول مجاني؛ لا تحتاج وايلدكارد للبدء.':'فكّر بها إذا احتجت إلى تغيير 5 لاعبين أو أكثر، بعد مقارنة تكلفة الخصم.';
  if(key==='freehit'){const blank=opportunities.find(o=>o.blanks>=5);advice=blank?`راجع الجولة ${blank.gw}: ${blank.blanks} لاعبين بلا مباراة في فريقك.`:'لا توجد جولة شاغرة مؤثرة في فريقك ضمن الجولات الخمس المعروضة.';if(blank)status='راقب';}
  if(key==='bboost')advice=`الدكة متوقعة عند ${lineup.bench.reduce((s,p)=>s+p.xp,0).toFixed(1)} نقطة في هذه الجولة. استخدمها بعد تأكيد مشاركة الأربعة.`;
  if(key==='3xc'){const captain=lineup.captain;const double=captain&&fixturesFor(data,captain.team,gw).length>1;advice=double?`لدى ${captain.web_name} أكثر من مباراة؛ راجع دقائق اللعب والإصابات قبل القرار.`:'الأفضل مبدئيًا انتظار جولة مزدوجة لكابتن موثوق الدقائق.';if(double)status='راقب';}
  return {key,name:names[key],available,stop:w?.stop_event,status:available?status:'غير متاحة',advice:available?advice:'خارج النافذة المتاحة، أو حددتها كمستخدمة.'};
 });
}
