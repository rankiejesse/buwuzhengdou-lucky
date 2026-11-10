import {workbenchCommand,validateWorkbench} from './workbench.js';
// Pure domain layer. The repository applies each command inside one IndexedDB transaction.
export const PRIZES = [
  ['p09','9折','折扣',20], ['p08','8折','折扣',10], ['p07','7折','折扣',5],
  ['p06','6折','折扣',16], ['p05','5折','折扣',2], ['m03','减3元','立减',5],
  ['m02','减2元','立减',15], ['m01','减1元','立减',25],
  ['slot','时段卡一张','体验卡',1.5], ['day','全天卡一张','体验卡',0.5]
].map(([id,name,category,probability])=>({id,name,category,probability,weekly:null,monthly:null,daily:null}));
export const ZONE = 'Asia/Shanghai';
export function dateKey(time = Date.now()) {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));
  return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');
}
export function fresh(now = Date.now()) {
  return {schema:2,revision:0,settingsRevision:0,updatedAt:new Date(now).toISOString(),prizes:structuredClone(PRIZES),records:[],ledger:[],audit:[],topups:[],session:null};
}
export function weekKey(now=Date.now()) {
  const d=new Date(dateKey(now)+'T00:00:00Z');d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return d.toISOString().slice(0,10);
}
export function cycleEnd(period,now=Date.now()) {
  if(period==='weekly')return new Date(Date.parse(weekKey(now)+'T00:00:00+08:00')+7*86400000).toISOString();
  if(period==='monthly'){const [y,m]=dateKey(now).split('-').map(Number);return new Date(Date.UTC(y,m,1)-8*3600000).toISOString();}
  throw Error('补货周期只能选择本周或本月');
}
export function migrateState(input,now=Date.now()) {
  if(input.schema===2)return input;
  if(input.schema!==1)throw Error('不支持的数据版本，请使用更新版本应用');
  const s=structuredClone(input);
  s.prizes=s.prizes.map(({total,...p})=>({...p,weekly:total}));validatePrizes(s.prizes);
  s.schema=2;s.topups=[];s.migratedFrom=1;s.settingsRevision++;s.revision++;s.updatedAt=new Date(now).toISOString();
  s.audit.push({id:crypto.randomUUID(),at:s.updatedAt,type:'migration',detail:{from:1,to:2,rule:'总库存数值转为每周上限，保留全部历史领取流水'}});return s;
}
export function counts(state,id,now=Date.now()) {
  const d=dateKey(now), month=d.slice(0,7),week=weekKey(now); let total=0, weekly=0, monthly=0, daily=0;
  for (const row of state.ledger) if(row.prizeId===id) {total++;if(row.date>=week&&row.date<=d)weekly++;if(row.date.startsWith(month))monthly++;if(row.date===d)daily++;}
  return {total,weekly,monthly,daily};
}
export function topupActive(t,now=Date.now()){return !t.cancelledAt&&Date.parse(t.createdAt)<=now&&now<Date.parse(t.expiresAt);}
export function effectiveLimits(state,prize,now=Date.now()) {
  const bonus={weekly:0,monthly:0};for(const t of state.topups||[])if(t.prizeId===prize.id&&topupActive(t,now))bonus[t.period]+=t.quantity;
  return {weekly:prize.weekly===null?null:prize.weekly+bonus.weekly,monthly:prize.monthly===null?null:prize.monthly+bonus.monthly,daily:prize.daily,bonus};
}
export function availability(state, prize, now=Date.now()) {
  const used=counts(state,prize.id,now), reasons=[],limits=effectiveLimits(state,prize,now);
  if(prize.probability===0)reasons.push('概率为 0');
  for (const [key,label] of [['weekly','周上限'],['monthly','月上限'],['daily','日上限']]) if(limits[key]!==null&&used[key]>=limits[key])reasons.push(`${label}已用完`);
  return {used,limits,available:reasons.length===0,reason:reasons.join('、'),remaining:limits.weekly===null?null:Math.max(0,limits.weekly-used.weekly)};
}
export function pool(state,now=Date.now()) {
  const rows=state.prizes.filter(p=>availability(state,p,now).available);
  const sum=rows.reduce((s,p)=>s+p.probability,0);
  return rows.map(p=>({...p,effective:p.probability/sum*100}));
}
export function validatePrizes(prizes) {
  if(!Array.isArray(prizes)||prizes.length!==10)throw Error('必须保留全部十种奖项');
  for(const def of PRIZES){
    const p=prizes.find(x=>x.id===def.id);
    if(!p||p.name!==def.name||p.category!==def.category||prizes.filter(x=>x.id===def.id).length!==1)throw Error('奖项名称、类别或标识不正确');
    if(typeof p.probability!=='number'||!Number.isFinite(p.probability)||p.probability<0||p.probability>100)throw Error('概率必须为 0 至 100 的数字');
    for(const k of ['weekly','monthly','daily'])if(p[k]!==null&&(!Number.isSafeInteger(p[k])||p[k]<0))throw Error('库存只能为非负整数或留空');
  }
  if(Math.abs(prizes.reduce((s,p)=>s+p.probability,0)-100)>1e-8)throw Error('十种奖项的配置概率合计必须为 100%（库存暂停不改变配置概率）');
}
const pending=s=>{if(s.session?.status==='pending')throw Error('请先处理当前中奖结果');};
export function command(state, cmd, now=Date.now(), random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296, uuid=()=>crypto.randomUUID()) {
  const s=structuredClone(migrateState(state,now)), at=new Date(now).toISOString(); let result;
  const audit=(type,detail)=>s.audit.push({id:uuid(),at,type,detail});
  switch(cmd.type){
    case 'draw': {
      if(s.session)throw Error('本次资格已经使用，请老板交接下一位顾客');
      const active=pool(s,now); if(!active.length)throw Error('奖池库存不足，请老板补充库存');
      let p;
      if(cmd.forceId){if(!cmd.test)throw Error('正式模式不能指定奖项');p=active.find(x=>x.id===cmd.forceId);if(!p)throw Error('指定测试奖项已暂停，请调整测试库存');}
      else {let r=random()*active.reduce((n,p)=>n+p.probability,0);p=active.find(x=>(r-=x.probability)<0)||active.at(-1);}
      s.session={id:uuid(),prizeId:p.id,name:p.name,category:p.category,drawnAt:at,status:'pending'};result=s.session;break;
    }
    case 'claim': {
      if(!s.session||s.session.id!==cmd.id)throw Error('抽奖凭据已失效');
      if(s.session.status==='claimed'){result=s.session;break;}
      if(s.session.status!=='pending')throw Error('本次抽奖已放弃，不能领取');
      const p=s.prizes.find(p=>p.id===s.session.prizeId);
      if(!availability(s,p,now).available)throw Error('该奖项当前库存不足，无法领取，请联系老板');
      const row={id:s.session.id,prizeId:p.id,name:s.session.name,category:s.session.category,at,date:dateKey(now),status:'claimed'};
      s.ledger.push({id:row.id,prizeId:p.id,at,date:row.date,delta:-1});
      s.records.push(row);s.session={...s.session,status:'claimed',claimedAt:at}; result=s.session;break;
    }
    case 'abandon': {
      if(!s.session||s.session.id!==cmd.id||s.session.status!=='pending')throw Error('没有可放弃的中奖结果');
      s.session.status='abandoned'; s.session.settledAt=at;result=s.session;break;
    }
    case 'next':
      pending(s);if(cmd.id!==undefined&&s.session?.id!==cmd.id)throw Error('顾客交接状态已变化，请重新检查');s.session=null;break;
    case 'settings':
      pending(s);if(cmd.expectedRevision!==s.settingsRevision)throw Error('另一页面已修改奖池，请重新打开设置后保存');
      validatePrizes(cmd.prizes);audit('settings',{before:s.prizes,after:cmd.prizes});s.prizes=structuredClone(cmd.prizes);s.settingsRevision++;delete s.migratedFrom;break;
    case 'defaults':pending(s);audit('defaults',{before:s.prizes,after:PRIZES});s.prizes=structuredClone(PRIZES);s.topups=[];s.settingsRevision++;delete s.migratedFrom;break;
    case 'topup': {
      pending(s);const p=s.prizes.find(p=>p.id===cmd.prizeId);
      if(!p||!['weekly','monthly'].includes(cmd.period)||!Number.isSafeInteger(cmd.quantity)||cmd.quantity<=0)throw Error('请选择奖项、补货周期，并输入正整数数量');
      if(p[cmd.period]===null)throw Error('该周期库存已设为不限，无需补货');
      if(!Number.isSafeInteger(effectiveLimits(s,p,now)[cmd.period]+cmd.quantity))throw Error('补货数量过大');
      const topup={id:uuid(),prizeId:p.id,period:cmd.period,quantity:cmd.quantity,createdAt:at,expiresAt:cycleEnd(cmd.period,now)};
      s.topups.push(topup);audit('topup',topup);result=topup;break;
    }
    case 'cancelTopup': {
      pending(s);const topup=s.topups.find(t=>t.id===cmd.id);
      if(!topup||!topupActive(topup,now))throw Error('该补货已失效或已撤销');
      topup.cancelledAt=at;audit('cancelTopup',{id:topup.id});break;
    }
    case 'clearRecords':pending(s);audit('clearRecords',{removed:s.records.length});s.records=[];break;
    default:if(cmd.type.startsWith('workbench:')){if(cmd.expectedRevision!==undefined&&cmd.expectedRevision!==s.revision)throw Error('数据已在其他页面变化，请关闭窗口后重新编辑');s.workbench=workbenchCommand(s.workbench,{...cmd,type:cmd.type.slice(10)},now,uuid);break;}throw Error('未知操作');
  }
  s.revision++;s.updatedAt=at;return {state:s,result};
}
function validTime(t){return typeof t==='string' && /^\d{4}-\d{2}-\d{2}T/.test(t)&&Number.isFinite(Date.parse(t));}
export function validateBackup(input) {
  if(!input||input.format!=='buwuzhengdou-backup'||![1,2].includes(input.version))throw Error('不是本应用支持的 v1/v2 备份');
  if(!input.state||input.state.schema!==input.version)throw Error('备份版本与数据版本不一致');
  const s=input.state.schema===1?migrateState(input.state):structuredClone(input.state);validatePrizes(s.prizes);
  if(s.workbench!==undefined)validateWorkbench(s.workbench);
  for(const k of ['records','ledger','audit'])if(!Array.isArray(s[k]))throw Error('备份缺少完整记录');
  for(const k of ['revision','settingsRevision'])if(!Number.isSafeInteger(s[k])||s[k]<0)throw Error('版本号无效');
  if(!validTime(s.updatedAt))throw Error('更新时间无效');
  const ids=new Set(),ledgerById=new Map();
  for(const row of s.ledger){
    if(!row||typeof row.id!=='string'||!row.id||row.id.length>100||ids.has(row.id)||!PRIZES.some(p=>p.id===row.prizeId)||row.delta!==-1||!validTime(row.at)||row.date!==dateKey(row.at))throw Error('库存变化记录无效或重复');ids.add(row.id);ledgerById.set(row.id,row);
  }
  const recordIds=new Set();
  for(const row of s.records){
    const p=PRIZES.find(p=>p.id===row.prizeId),l=ledgerById.get(row.id);
    if(!p||!l||l.prizeId!==row.prizeId||l.at!==row.at||row.date!==l.date||row.name!==p.name||row.category!==p.category||row.status!=='claimed'||recordIds.has(row.id))throw Error('中奖记录与库存变化不一致');recordIds.add(row.id);
  }
  for(const row of s.audit){
    if(!row||typeof row.id!=='string'||!validTime(row.at)||!['settings','defaults','clearRecords','import','migration','topup','cancelTopup','clearData'].includes(row.type)||!row.detail||typeof row.detail!=='object')throw Error('设置变更记录无效');
  }
  if(!Array.isArray(s.topups))throw Error('缺少临时补货记录');
  const topupIds=new Set();for(const t of s.topups){
    if(!t||typeof t.id!=='string'||topupIds.has(t.id)||!PRIZES.some(p=>p.id===t.prizeId)||!['weekly','monthly'].includes(t.period)||!Number.isSafeInteger(t.quantity)||t.quantity<=0||!validTime(t.createdAt)||!validTime(t.expiresAt)||t.expiresAt!==cycleEnd(t.period,t.createdAt)||(t.cancelledAt&&!validTime(t.cancelledAt)))throw Error('临时补货记录无效');topupIds.add(t.id);
  }
  for(const p of s.prizes){const limits=effectiveLimits(s,p);for(const k of ['weekly','monthly'])if(limits[k]!==null&&!Number.isSafeInteger(limits[k]))throw Error('临时补货额度超出支持范围');}
  // Never restore a redeemable ticket. Restoring a backup is a replacement, not a sync merge.
  return {...structuredClone(s),session:null};
}
export function backup(state){return {format:'buwuzhengdou-backup',version:2,exportedAt:new Date().toISOString(),timezone:ZONE,state:structuredClone(state)};}
export function clearBusiness(state,now=Date.now()) {
  const old=migrateState(state,now),s=fresh(now);s.prizes=structuredClone(old.prizes);s.revision=old.revision+1;s.settingsRevision=old.settingsRevision+1;
  if(old.workbench)s.workbench=structuredClone(old.workbench);
  s.audit.push({id:crypto.randomUUID(),at:s.updatedAt,type:'clearData',detail:{removedRecords:old.records.length,removedLedger:old.ledger.length,removedTopups:old.topups.length}});return s;
}
