import {test} from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorkbench,workbenchCommand as command,moneyInput,incomeValue,revenue,bookTotals,validateWorkbench} from '../dist/workbench.js';
import {fresh,command as engine,backup,validateBackup,clearBusiness} from '../dist/engine.js';
const now=Date.parse('2026-11-10T10:00:00Z');let nextId=0;const run=(w,c,t=now)=>command(w,c,t,()=>`id-${++nextId}`);
const income=(w,t=now)=>run(w,{type:'incomeSave',initial:10000,remaining:20000,wechat:60000,alipay:30000},t);
const addBook=(w,name,basis,limit=0,percent=5000)=>run(w,{type:'bookSave',name,basis,limit,percent});
function addItem(w,bookId,planned,actual,paid,t=now){w=run(w,{type:'categorySave',bookId,name:'设备'},t);return run(w,{type:'itemSave',bookId,categoryId:w.books.find(b=>b.id===bookId).categories.at(-1).id,name:'耗材',planned,actual,paid},t);}
test('integer cents and daily increase; edits retain first registration, calendar redate rejects duplicate/future',()=>{
 assert.equal(moneyInput('0.29'),29);for(const x of ['-1','1.234','1e3','','Infinity'])assert.throws(()=>moneyInput(x));
 let w=income(emptyWorkbench());const r=w.incomes[0];assert.equal(incomeValue(r),100000);
 w=run(w,{type:'incomeSave',id:r.id,initial:10000,remaining:5000,wechat:0,alipay:0},now+10000);assert.equal(w.incomes[0].registeredAt,r.registeredAt);assert.equal(w.incomes[0].createdAt,r.createdAt);assert.equal(incomeValue(w.incomes[0]),-5000);
 w=income(w,now-86400000);assert.throws(()=>run(w,{type:'incomeSave',id:r.id,initial:0,remaining:0,wechat:0,alipay:0,registeredAt:new Date(now-86400000).toISOString()}));
 assert.throws(()=>income(w,now));assert.throws(()=>run(w,{type:'incomeSave',initial:0,remaining:0,wechat:0,alipay:0,registeredAt:new Date(now+1000).toISOString()}));
});
test('percentage multiplies income first, then deducts other actual spending; planned does not reserve shared funds',()=>{
 let w=income(emptyWorkbench());w=addBook(w,'百分比','month');w=addBook(w,'固定','fixed',100000);const a=w.books[0].id,b=w.books[1].id;
 w=addItem(w,b,30000,20000,false);assert.equal(bookTotals(w,w.books[0],now).allocation,50000);
 const c=w.books[1].categories[0],i=c.items[0];w=run(w,{type:'itemToggle',bookId:b,categoryId:c.id,id:i.id});assert.equal(bookTotals(w,w.books[0],now).allocation,30000);
 w=addItem(w,a,12000,10000,true);const totals=bookTotals(w,w.books[0],now);assert.equal(totals.actualRemaining,20000);assert.equal(totals.plannedRemaining,20000);assert.equal(totals.spent,10000);assert.equal(bookTotals(w,w.books[1],now).actualRemaining,80000);
 w=run(w,{type:'itemDelete',bookId:b,categoryId:c.id,id:i.id});assert.equal(bookTotals(w,w.books[0],now).actualRemaining,40000);
});
test('month/year rollover uses Shanghai date and actual payment date, fixed lifetime budget retains expenses',()=>{
 let w=income(emptyWorkbench(),Date.parse('2026-10-31T15:59:00Z'));w=income(w,Date.parse('2026-10-31T16:01:00Z'));assert.equal(revenue(w,'month',now),100000);assert.equal(revenue(w,'year',now),200000);
 w=addBook(w,'月','month');const a=w.books[0].id;w=addItem(w,a,12000,10000,true,Date.parse('2026-10-31T15:59:00Z'));assert.equal(bookTotals(w,w.books[0],now).spent,0);assert.equal(bookTotals(w,w.books[0],now).actualRemaining,50000);
 assert.equal(revenue(w,'year',Date.parse('2027-01-01T00:00:00Z')),0);
});
test('workbench commands, backup validation and lottery-only clear retain finances; malformed backup fails atomically',()=>{
 let s=engine(fresh(now),{type:'workbench:incomeSave',initial:0,remaining:123,wechat:0,alipay:0},now).state;assert.equal(s.workbench.incomes[0].remaining,123);
 assert.deepEqual(validateBackup(backup(s)).workbench,s.workbench);assert.deepEqual(clearBusiness(s).workbench,s.workbench);
 const b=backup(s);b.state.workbench.incomes[0].remaining=0.1;assert.throws(()=>validateBackup(b));assert.equal(s.workbench.incomes[0].remaining,123);
 const w=income(emptyWorkbench());w.incomes.push(structuredClone(w.incomes[0]));assert.throws(()=>validateWorkbench(w));
});
