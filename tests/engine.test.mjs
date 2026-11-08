import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PRIZES,fresh,command,counts,pool,availability,dateKey,backup,validateBackup,validatePrizes,weekKey,cycleEnd,effectiveLimits,migrateState,clearBusiness} from '../dist/engine.js';
let serial=0;const at=Date.parse('2026-11-08T05:00:00Z');
const run=(s,c,now=at,random=()=>0)=>command(s,c,now,random,()=>`id-${++serial}`).state;
const only=(id)=>PRIZES.map(p=>({...p,probability:p.id===id?100:0}));
function configured(prizes){return run(fresh(at),{type:'settings',prizes,expectedRevision:0});}
function claim(s,now=at){s=run(s,{type:'draw'},now);return run(s,{type:'claim',id:s.session.id},now);}
test('exact ten defaults and 100 percent, decimal configuration validation',()=>{
 assert.equal(PRIZES.length,10);validatePrizes(PRIZES);assert.equal(PRIZES.reduce((s,p)=>s+p.probability,0),100);
 for(const value of [-1,101,NaN,Infinity])assert.throws(()=>validatePrizes(PRIZES.map((p,i)=>i? p:{...p,probability:value})));
 for(const value of [-1,.5,NaN,'10'])assert.throws(()=>validatePrizes(PRIZES.map((p,i)=>i?p:{...p,weekly:value})));
 assert.throws(()=>validatePrizes(PRIZES.slice(1)));assert.throws(()=>validatePrizes(PRIZES.map((p,i)=>i?p:{...p,probability:19})));
});
test('weighted boundaries make all ten prizes reachable',()=>{
 let lower=0;for(const p of PRIZES){let s=run(fresh(at),{type:'draw'},at,()=> (lower+p.probability/2)/100);assert.equal(s.session.prizeId,p.id);lower+=p.probability;}
});
test('only confirmed claims consume stock; duplicate claim is idempotent',()=>{
 let s=run(fresh(at),{type:'draw'});assert.equal(s.ledger.length,0);assert.equal(s.records.length,0);
 assert.throws(()=>run(s,{type:'draw'}));const id=s.session.id;s=run(s,{type:'claim',id});s=run(s,{type:'claim',id});
 assert.equal(s.records.length,1);assert.equal(s.ledger.length,1);assert.equal(counts(s,'p09',at).total,1);
 assert.throws(()=>run(s,{type:'claim',id:'foreign'}));
});
test('abandon burns ticket, allows supervised handoff; no stock or formal record',()=>{
 let s=run(fresh(at),{type:'draw'});assert.throws(()=>run(s,{type:'next'}));
 s=run(s,{type:'abandon',id:s.session.id});assert.equal(s.ledger.length,0);assert.equal(s.records.length,0);
 assert.throws(()=>run(s,{type:'draw'}));assert.throws(()=>run(s,{type:'claim',id:s.session.id}));
 s=run(s,{type:'next'});s=run(s,{type:'draw'});assert.equal(s.session.status,'pending');
});
test('week/month/day simultaneous limits and calendar reset in Shanghai',()=>{
 let prizes=only('day');prizes.at(-1).weekly=2;prizes.at(-1).monthly=3;prizes.at(-1).daily=1;
 let s=configured(prizes);s=claim(s);assert.equal(pool(s,at).length,0);
 const nextDay=Date.parse('2026-11-08T16:00:00Z');assert.equal(dateKey(nextDay),'2026-11-09');assert.equal(pool(s,nextDay).length,1);
 s=run(s,{type:'next'},nextDay);s=claim(s,nextDay);assert.equal(pool(s,nextDay+86400000).length,1);
 s=run(s,{type:'next'},nextDay+86400000);s=claim(s,nextDay+86400000);assert.equal(pool(s,nextDay+2*86400000).length,0);
 assert.equal(pool(s,nextDay+7*86400000).length,0,'month quota still blocks a new week');
 const nextMonth=Date.parse('2026-11-30T16:00:00Z');assert.equal(dateKey(nextMonth),'2026-12-01');assert.equal(pool(s,nextMonth).length,1);
 s=run(s,{type:'next'},nextMonth);s=claim(s,nextMonth);assert.equal(pool(s,Date.parse('2027-01-01')).length,1);
 assert.equal(counts(s,'day',nextMonth).total,4);
});
test('zero, null and probability normalization follow effective pool',()=>{
 let s=fresh(at);s.prizes[0].weekly=0;const p=pool(s,at);assert.equal(p.length,9);assert.ok(Math.abs(p.reduce((n,x)=>n+x.effective,0)-100)<1e-9);assert.equal(p.find(x=>x.id==='p08').effective,12.5);
 for(const prize of s.prizes){prize.daily=0;}assert.equal(pool(s,at).length,0);assert.throws(()=>run(s,{type:'draw'}));
});
test('claim rechecks inventory at time of redemption, does not partially write',()=>{
 let s=run(fresh(at),{type:'draw'});s.prizes[0].weekly=0;const original=structuredClone(s);
 assert.throws(()=>run(s,{type:'claim',id:s.session.id}));assert.deepEqual(s,original);
});
test('settings revisions, pending guards, defaults and clearing preserve inventory',()=>{
 let s=claim(fresh(at));const previous=s.records[0];
 assert.throws(()=>run(s,{type:'settings',prizes:PRIZES,expectedRevision:42}));
 s=run(s,{type:'defaults'});assert.deepEqual(s.records[0],previous);assert.equal(s.ledger.length,1);
 s=run(s,{type:'clearRecords'});assert.equal(s.records.length,0);assert.equal(counts(s,'p09',at).total,1);
 s=run(s,{type:'next'});s=run(s,{type:'draw'});for(const type of ['settings','defaults','clearRecords','next'])assert.throws(()=>run(s,{type,prizes:PRIZES,expectedRevision:s.settingsRevision}));
});
test('backup roundtrip, schema validation, duplicate and tampered ledger rejection',()=>{
 const s=claim(fresh(at));const b=backup(s);const restored=validateBackup(JSON.parse(JSON.stringify(b)));
 assert.deepEqual(restored.records,s.records);assert.deepEqual(restored.ledger,s.ledger);assert.equal(restored.session,null);
 const d=structuredClone(b);d.state.ledger.push(d.state.ledger[0]);assert.throws(()=>validateBackup(d));
 const mismatch=structuredClone(b);mismatch.state.records[0].name='伪造';assert.throws(()=>validateBackup(mismatch));
 const empty=structuredClone(b);empty.state.ledger=[];assert.throws(()=>validateBackup(empty));
 assert.throws(()=>validateBackup({format:'other'}));
});
test('test forced prize allowed only in test scope and does not mutate input',()=>{
 const original=fresh(at);assert.throws(()=>run(original,{type:'draw',forceId:'day'}));
 const test=run(original,{type:'draw',test:true,forceId:'day'});assert.equal(test.session.prizeId,'day');assert.equal(original.session,null);
});

test('Shanghai week starts Monday, including year boundary; bonus expiry matches natural cycles',()=>{
 assert.equal(weekKey('2026-11-08T15:59:59Z'),'2026-11-02');assert.equal(weekKey('2026-11-08T16:00:00Z'),'2026-11-09');
 assert.equal(weekKey('2027-01-01T00:00:00Z'),'2026-12-28');
 assert.equal(cycleEnd('weekly','2026-11-08T15:59:59Z'),'2026-11-08T16:00:00.000Z');
 assert.equal(cycleEnd('monthly','2026-12-25T00:00:00Z'),'2026-12-31T16:00:00.000Z');
});
test('temporary stock adds selected quota only, expires, supports cancellation and cannot bypass daily limit',()=>{
 const monday=Date.parse('2026-11-09T01:00:00Z');let prizes=only('p09');prizes[0].weekly=1;prizes[0].monthly=1;prizes[0].daily=2;
 let s=claim(configured(prizes),monday);s=run(s,{type:'next'},monday);
 s=run(s,{type:'topup',prizeId:'p09',period:'weekly',quantity:2},monday);assert.equal(pool(s,monday).length,0,'monthly quota still blocks');
 s=run(s,{type:'topup',prizeId:'p09',period:'monthly',quantity:2},monday);assert.equal(pool(s,monday).length,1);
 s=claim(s,monday);s=run(s,{type:'next'},monday);assert.equal(pool(s,monday).length,0,'daily quota still blocks');
 assert.equal(pool(s,monday+86400000).length,1);assert.equal(effectiveLimits(s,s.prizes[0],monday+7*86400000).weekly,1);
 assert.equal(effectiveLimits(s,s.prizes[0],Date.parse('2026-11-30T16:00:00Z')).monthly,1);
 s=run(s,{type:'cancelTopup',id:s.topups[0].id},monday+86400000);assert.equal(pool(s,monday+86400000).length,0);assert.equal(s.records.length,2);
 assert.throws(()=>run(s,{type:'topup',prizeId:'p09',period:'weekly',quantity:0},monday));
 assert.throws(()=>run(fresh(),{type:'topup',prizeId:'p09',period:'weekly',quantity:1},monday),'unlimited quota needs no topup');
});
test('v1 migration keeps history and maps total to weekly; v2 backup retains topups and rejects corrupt expiry',()=>{
 let current=claim(fresh(at));const old={...current,schema:1};delete old.topups;old.prizes=old.prizes.map(({weekly,...p})=>({...p,total:p.id==='p09'?7:null}));
 const restored=validateBackup({format:'buwuzhengdou-backup',version:1,state:old});assert.equal(restored.schema,2);assert.equal(restored.prizes[0].weekly,7);assert.equal(restored.prizes[0].total,undefined);assert.deepEqual(restored.records,current.records);
 let s=run(restored,{type:'topup',prizeId:'p09',period:'weekly',quantity:3},at);const b=backup(s);assert.equal(b.version,2);assert.deepEqual(validateBackup(b).topups,s.topups);
 b.state.topups[0].expiresAt='2030-01-01T00:00:00.000Z';assert.throws(()=>validateBackup(b));
});
test('clear business resets histories, temporary stock and session while preserving prize configuration',()=>{
 let prizes=only('p09');prizes[0].weekly=5;let s=claim(configured(prizes));s=run(s,{type:'topup',prizeId:'p09',period:'weekly',quantity:3});
 const cleared=clearBusiness(s,at);assert.deepEqual(cleared.prizes,s.prizes);for(const key of ['records','ledger','topups'])assert.equal(cleared[key].length,0);assert.equal(cleared.session,null);assert.equal(cleared.audit[0].type,'clearData');
});
