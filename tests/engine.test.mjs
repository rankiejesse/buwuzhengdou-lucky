import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PRIZES,fresh,command,counts,pool,availability,dateKey,backup,validateBackup,validatePrizes} from '../dist/engine.js';
let serial=0;const at=Date.parse('2026-11-08T05:00:00Z');
const run=(s,c,now=at,random=()=>0)=>command(s,c,now,random,()=>`id-${++serial}`).state;
const only=(id)=>PRIZES.map(p=>({...p,probability:p.id===id?100:0}));
function configured(prizes){return run(fresh(at),{type:'settings',prizes,expectedRevision:0});}
function claim(s,now=at){s=run(s,{type:'draw'},now);return run(s,{type:'claim',id:s.session.id},now);}
test('exact ten defaults and 100 percent, decimal configuration validation',()=>{
 assert.equal(PRIZES.length,10);validatePrizes(PRIZES);assert.equal(PRIZES.reduce((s,p)=>s+p.probability,0),100);
 for(const value of [-1,101,NaN,Infinity])assert.throws(()=>validatePrizes(PRIZES.map((p,i)=>i? p:{...p,probability:value})));
 for(const value of [-1,.5,NaN,'10'])assert.throws(()=>validatePrizes(PRIZES.map((p,i)=>i?p:{...p,total:value})));
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
test('total/month/day simultaneous limits and calendar reset in Shanghai',()=>{
 let prizes=only('day');prizes.at(-1).total=3;prizes.at(-1).monthly=2;prizes.at(-1).daily=1;
 let s=configured(prizes);s=claim(s);assert.equal(pool(s,at).length,0);
 const nextDay=Date.parse('2026-11-08T16:00:00Z');assert.equal(dateKey(nextDay),'2026-11-09');assert.equal(pool(s,nextDay).length,1);
 s=run(s,{type:'next'},nextDay);s=claim(s,nextDay);assert.equal(pool(s,nextDay+86400000).length,0);
 const nextMonth=Date.parse('2026-11-30T16:00:00Z');assert.equal(dateKey(nextMonth),'2026-12-01');assert.equal(pool(s,nextMonth).length,1);
 s=run(s,{type:'next'},nextMonth);s=claim(s,nextMonth);assert.equal(pool(s,Date.parse('2027-01-01')).length,0);
 assert.equal(counts(s,'day',nextMonth).total,3);
});
test('zero, null and probability normalization follow effective pool',()=>{
 let s=fresh(at);s.prizes[0].total=0;const p=pool(s,at);assert.equal(p.length,9);assert.ok(Math.abs(p.reduce((n,x)=>n+x.effective,0)-100)<1e-9);assert.equal(p.find(x=>x.id==='p08').effective,12.5);
 for(const prize of s.prizes){prize.daily=0;}assert.equal(pool(s,at).length,0);assert.throws(()=>run(s,{type:'draw'}));
});
test('claim rechecks inventory at time of redemption, does not partially write',()=>{
 let s=run(fresh(at),{type:'draw'});s.prizes[0].total=0;const original=structuredClone(s);
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
