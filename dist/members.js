// Replay integer-cent ledger: actual paid funds are always consumed before gifts.
export function memberFunds(m){let paid=0,gift=0;for(const t of m.transactions){if(t.type==='recharge'){paid+=t.amount;gift+=t.gift;}else if(t.type==='spend'){const paidUsed=Math.min(paid,t.amount);paid-=paidUsed;gift-=t.amount-paidUsed;}else if(t.type==='refund'){paid-=t.amount;gift-=t.gift;}}return {paid,gift,total:paid+gift,refundable:paid};}
export const memberBalance=m=>memberFunds(m).total;
export function searchMembers(members,query){const q=query.trim().toLowerCase();const digits=/^\d+$/.test(q);return members.filter(m=>!m.deletedAt&&(!q|| (digits?m.phone.includes(q):m.name.toLowerCase().includes(q)))).sort((a,b)=>(digits?Number(b.phone.endsWith(q))-Number(a.phone.endsWith(q)):0)||a.name.localeCompare(b.name,'zh-CN')||a.phone.localeCompare(b.phone));}
const money=n=>Number.isSafeInteger(n)&&n>=0&&n<=99999999999;
export function validateMembers(rows){
 if(!Array.isArray(rows))throw Error('会员数据无效');const ids=new Set(),phones=new Set(),txids=new Set();
 for(const m of rows){
  if(!m||typeof m.id!=='string'||ids.has(m.id)||typeof m.name!=='string'||!m.name.trim()||m.name.length>80||!/^\d{6,20}$/.test(m.phone)||(!m.deletedAt&&phones.has(m.phone))||!Array.isArray(m.transactions)||!m.transactions.length||!Number.isFinite(Date.parse(m.createdAt))||(m.deletedAt&&!Number.isFinite(Date.parse(m.deletedAt))))throw Error('会员姓名、号码或记录无效');
  ids.add(m.id);if(!m.deletedAt)phones.add(m.phone);let paid=0,gift=0;
  for(const [index,t] of m.transactions.entries()){
   if(!t||typeof t.id!=='string'||!t.id||txids.has(t.id)||!['recharge','spend','refund'].includes(t.type)||!money(t.amount)||!money(t.gift)||!Number.isFinite(Date.parse(t.at))||typeof t.note!=='string'||t.note.length>500)throw Error('会员流水无效');txids.add(t.id);
   if(t.type==='recharge'){if(t.amount<(index===0?3000:1000))throw Error('首充30元起，续充10元起');paid+=t.amount;gift+=t.gift;}
   else if(t.type==='spend'){if(index===0||t.amount<=0||t.gift!==0)throw Error('消费流水无效');const used=Math.min(paid,t.amount),giftUsed=t.amount-used;if((t.paidUsed!==undefined&&t.paidUsed!==used)||(t.giftUsed!==undefined&&t.giftUsed!==giftUsed))throw Error('消费资金拆分不一致');paid-=used;gift-=giftUsed;}
   else {if(index===0||t.amount!==paid||t.gift!==gift||paid+gift<=0)throw Error('退款应退清实付余额并清空全部赠金');paid=0;gift=0;}
   if(!Number.isSafeInteger(paid)||paid<0||!Number.isSafeInteger(gift)||gift<0||!Number.isSafeInteger(paid+gift))throw Error('会员余额或流水不一致');
  }
  if(m.deletedAt&&paid+gift!==0)throw Error('有余额的会员请先退款或清零再删除');
 }
 return rows;
}
export function memberCommand(input,cmd,now=Date.now()){
 const rows=structuredClone(input||[]),at=new Date(now).toISOString();
 if(cmd.type==='create'){if(rows.some(m=>m.id===cmd.id))return rows;rows.push({id:cmd.id,name:cmd.name.trim(),phone:cmd.phone.trim(),createdAt:at,transactions:[{id:cmd.transactionId,type:'recharge',amount:cmd.amount,gift:cmd.gift??Math.round(cmd.amount/10),note:cmd.note||'',at}]});}
 else {
  const m=rows.find(m=>m.id===cmd.id);if(!m)throw Error('会员不存在');
  if(cmd.transactionId&&m.transactions.some(t=>t.id===cmd.transactionId))return rows;
  if(m.deletedAt){if(cmd.type==='delete')return rows;throw Error('会员已删除，仅可查看历史');}
  const f=memberFunds(m);
  if(cmd.type==='edit'){m.name=cmd.name.trim();m.phone=cmd.phone.trim();}
  else if(cmd.type==='delete'){if(f.total!==0)throw Error('有余额的会员请先退款或清零再删除');m.deletedAt=at;}
  else if(cmd.type==='refund'){
   if(cmd.amount!==f.paid||cmd.gift!==f.gift)throw Error('余额已变化，请核对后重新打开退款窗口');
   if(f.total<=0)throw Error('没有可退金额或可清空赠金');
   m.transactions.push({id:cmd.transactionId,type:'refund',amount:f.paid,gift:f.gift,note:cmd.note||'',at});if(cmd.deleteAfter)m.deletedAt=at;
  }else {
   if(cmd.type==='spend'&&cmd.amount>f.total)throw Error('会员余额不足，不能消费');if(!['recharge','spend'].includes(cmd.type))throw Error('未知会员操作');
   const split=cmd.type==='spend'?{paidUsed:Math.min(f.paid,cmd.amount),giftUsed:Math.max(0,cmd.amount-f.paid)}:{};
   m.transactions.push({id:cmd.transactionId,type:cmd.type,amount:cmd.amount,gift:cmd.type==='recharge'?(cmd.gift??Math.round(cmd.amount/10)):0,...split,note:cmd.note||'',at});
  }
 }
 return validateMembers(rows);
}
export function memberLedger(m){let paid=0,gift=0;return m.transactions.map(t=>{let paidUsed=0,giftUsed=0;if(t.type==='recharge'){paid+=t.amount;gift+=t.gift;}else if(t.type==='spend'){paidUsed=Math.min(paid,t.amount);giftUsed=t.amount-paidUsed;paid-=paidUsed;gift-=giftUsed;}else if(t.type==='refund'){paid-=t.amount;gift-=t.gift;}return {...t,paidUsed,giftUsed,paidAfter:paid,giftAfter:gift};});}
