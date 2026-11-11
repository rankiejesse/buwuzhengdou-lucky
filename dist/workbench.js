// Amounts are integer cents. This module has no browser or storage dependencies.
export const emptyWorkbench=()=>({incomes:[],books:[]});
const day=t=>{const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(t));return ['year','month','day'].map(k=>parts.find(p=>p.type===k).value).join('-');};
export function moneyInput(value){
  const text=String(value).trim();if(!/^\d{1,9}(\.\d{1,2})?$/.test(text))throw Error('金额须为非负数字，最多两位小数');
  const [a,b='']=text.split('.');return Number(a)*100+Number(b.padEnd(2,'0'));
}
const cents=v=>Number.isSafeInteger(v)&&v>=0&&v<=99999999999;
const title=v=>typeof v==='string'&&v.trim().length>0&&v.length<=80;
const instant=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
export const incomeValue=r=>r.remaining-r.initial+r.wechat+r.alipay;
export function periodMatch(at,period,now=Date.now()) {const d=day(at),today=day(now);return period==='total'||(period==='year'?d.slice(0,4)===today.slice(0,4):d.slice(0,7)===today.slice(0,7));}
export function revenue(w,period,now=Date.now()){return w.incomes.filter(r=>periodMatch(r.registeredAt,period,now)).reduce((s,r)=>s+incomeValue(r),0);}
export function bookTotals(w,book,now=Date.now()){
  const own=book.categories.flatMap(c=>c.items).filter(i=>!i.paid||book.basis==='fixed'||periodMatch(i.paidAt,book.basis,now)),spent=own.filter(i=>i.paid).reduce((s,i)=>s+i.actual,0),planned=own.reduce((s,i)=>s+(i.paid?i.actual:i.planned),0);
  const source=book.basis==='fixed'?null:revenue(w,book.basis,now);
  const other=book.basis==='fixed'?0:w.books.filter(b=>b.id!==book.id).flatMap(b=>b.categories.flatMap(c=>c.items)).filter(i=>i.paid&&periodMatch(i.paidAt,book.basis,now)).reduce((s,i)=>s+i.actual,0);
  const allocation=book.basis==='fixed'?book.limit:Math.round(source*book.percent/10000)-other;
  return {source,other,allocation,spent,planned,plannedRemaining:allocation-planned,actualRemaining:allocation-spent};
}
export function validateWorkbench(w){
  if(!w||!Array.isArray(w.incomes)||!Array.isArray(w.books))throw Error('收支或预算数据不完整');
  if(w.noteChips!==undefined&&(!Array.isArray(w.noteChips)||w.noteChips.length>100||w.noteChips.some(t=>typeof t!=='string'||!t.trim()||t.length>40)))throw Error('备注气泡无效（最多100个）');
  if(w.copyFields!==undefined&&(!w.copyFields||typeof w.copyFields!=='object'||Object.values(w.copyFields).some(v=>typeof v!=='boolean')))throw Error('复制设置无效');
  const ids=new Set(),dates=new Set();const id=v=>{if(typeof v!=='string'||!v||v.length>100||ids.has(v))throw Error('工作台记录标识无效或重复');ids.add(v);};
  for(const r of w.incomes){id(r.id);if(r.note!==undefined&&(typeof r.note!=='string'||r.note.length>1000))throw Error('备注最多1000字');if(!instant(r.registeredAt)||!instant(r.createdAt)||!instant(r.updatedAt)||r.date!==day(r.registeredAt)||dates.has(r.date)||!['initial','remaining','wechat','alipay'].every(k=>cents(r[k])))throw Error('每日收支记录无效或日期重复');dates.add(r.date);}
  for(const b of w.books){id(b.id);if(!title(b.name)||!['fixed','month','year','total'].includes(b.basis)||!cents(b.limit)||!Number.isInteger(b.percent)||b.percent<0||b.percent>10000||!instant(b.createdAt)||!Array.isArray(b.categories))throw Error('预算本配置无效');
    for(const c of b.categories){id(c.id);if(!title(c.name)||!Array.isArray(c.items))throw Error('预算类别无效');for(const i of c.items){id(i.id);if(!title(i.name)||!cents(i.planned)||!cents(i.actual)||typeof i.paid!=='boolean'||!instant(i.createdAt)||(i.paid?!instant(i.paidAt):i.paidAt!==null))throw Error('预算待办无效');}}
  }return w;
}
export function workbenchCommand(input,cmd,now=Date.now(),uuid=()=>crypto.randomUUID()){
  const w=structuredClone(input||emptyWorkbench()),at=new Date(now).toISOString();
  const book=()=>{const b=w.books.find(b=>b.id===cmd.bookId);if(!b)throw Error('预算本已删除，请刷新');return b;};
  if(cmd.type==='preferences'){w.copyFields=cmd.fields;
  }else if(cmd.type==='chipAdd'){const text=cmd.text.trim();if(!text||text.length>40)throw Error('气泡文字需要1至40字');w.noteChips=[...new Set([...(w.noteChips||[]),text])];
  }else if(cmd.type==='chipDelete'){w.noteChips=(w.noteChips||[]).filter(t=>t!==cmd.text);
  }else if(cmd.type==='incomeSave'){
    const old=w.incomes.find(r=>r.id===cmd.id);if(cmd.id&&!old)throw Error('记录已删除，请刷新');
    const registeredAt=cmd.registeredAt||(old?.registeredAt??at);if(!instant(registeredAt)||Date.parse(registeredAt)>now)throw Error('登记时间无效或晚于当前时间');const date=day(registeredAt);
    if(w.incomes.some(r=>r.date===date&&r.id!==old?.id))throw Error('这一天已有登记，请修改原记录');
    const row={id:old?.id||uuid(),createdAt:old?.createdAt||at,registeredAt,updatedAt:at,date,note:cmd.note??old?.note??'',...Object.fromEntries(['initial','remaining','wechat','alipay'].map(k=>[k,cmd[k]]))};
    if(old)w.incomes[w.incomes.indexOf(old)]=row;else w.incomes.push(row);
  }else if(cmd.type==='incomeDelete'){if(!w.incomes.some(r=>r.id===cmd.id))throw Error('记录已删除');w.incomes=w.incomes.filter(r=>r.id!==cmd.id);
  }else if(cmd.type==='bookSave'){
    const old=cmd.bookId?book():null,row={id:old?.id||uuid(),name:cmd.name.trim(),basis:cmd.basis,limit:cmd.limit,percent:cmd.percent,createdAt:old?.createdAt||at,categories:old?.categories||[]};
    if(old)w.books[w.books.indexOf(old)]=row;else w.books.push(row);
  }else if(cmd.type==='bookDelete'){book();w.books=w.books.filter(b=>b.id!==cmd.bookId);
  }else if(cmd.type==='categorySave'){book().categories.push({id:uuid(),name:cmd.name.trim(),items:[]});
  }else if(cmd.type==='categoryDelete'){const b=book();if(!b.categories.some(c=>c.id===cmd.categoryId))throw Error('类别已删除');b.categories=b.categories.filter(c=>c.id!==cmd.categoryId);
  }else if(['itemSave','itemDelete','itemToggle'].includes(cmd.type)){
    const c=book().categories.find(c=>c.id===cmd.categoryId);if(!c)throw Error('类别已删除');const old=c.items.find(i=>i.id===cmd.id);if(cmd.id&&!old)throw Error('待办已删除');
    if(cmd.type==='itemDelete')c.items=c.items.filter(i=>i.id!==cmd.id);
    else if(cmd.type==='itemToggle'){old.paid=!old.paid;old.paidAt=old.paid?at:null;}
    else {const row={id:old?.id||uuid(),name:cmd.name.trim(),planned:cmd.planned,actual:cmd.actual,paid:!!cmd.paid,paidAt:cmd.paid?(old?.paidAt||at):null,createdAt:old?.createdAt||at};if(old)c.items[c.items.indexOf(old)]=row;else c.items.push(row);}
  }else throw Error('未知工作台操作');
  return validateWorkbench(w);
}
