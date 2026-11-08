// Pure domain layer. The repository applies each command inside one IndexedDB transaction.
export const PRIZES = [
  ['p09','9折','折扣',20], ['p08','8折','折扣',10], ['p07','7折','折扣',5],
  ['p06','6折','折扣',16], ['p05','5折','折扣',2], ['m03','减3元','立减',5],
  ['m02','减2元','立减',15], ['m01','减1元','立减',25],
  ['slot','时段卡一张','体验卡',1.5], ['day','全天卡一张','体验卡',0.5]
].map(([id,name,category,probability])=>({id,name,category,probability,total:null,monthly:null,daily:null}));
export const ZONE = 'Asia/Shanghai';
export function dateKey(time = Date.now()) {
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:ZONE,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(time));
  return ['year','month','day'].map(k=>p.find(x=>x.type===k).value).join('-');
}
export function fresh(now = Date.now()) {
  return {schema:1,revision:0,settingsRevision:0,updatedAt:new Date(now).toISOString(),prizes:structuredClone(PRIZES),records:[],ledger:[],audit:[],session:null};
}
export function counts(state,id,now=Date.now()) {
  const d=dateKey(now), month=d.slice(0,7); let total=0, monthly=0, daily=0;
  for (const row of state.ledger) if(row.prizeId===id) {total++; if(row.date.startsWith(month))monthly++; if(row.date===d)daily++;}
  return {total,monthly,daily};
}
export function availability(state, prize, now=Date.now()) {
  const used=counts(state,prize.id,now), reasons=[];
  if(prize.probability===0)reasons.push('概率为 0');
  for (const [key,label] of [['total','总库存'],['monthly','月上限'],['daily','日上限']]) if(prize[key]!==null&&used[key]>=prize[key])reasons.push(`${label}已用完`);
  return {used,available:reasons.length===0,reason:reasons.join('、'),remaining:prize.total===null?null:Math.max(0,prize.total-used.total)};
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
    for(const k of ['total','monthly','daily'])if(p[k]!==null&&(!Number.isSafeInteger(p[k])||p[k]<0))throw Error('库存只能为非负整数或留空');
  }
  if(Math.abs(prizes.reduce((s,p)=>s+p.probability,0)-100)>1e-8)throw Error('十种奖项的配置概率合计必须为 100%（库存暂停不改变配置概率）');
}
const pending=s=>{if(s.session?.status==='pending')throw Error('请先处理当前中奖结果');};
export function command(state, cmd, now=Date.now(), random=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296, uuid=()=>crypto.randomUUID()) {
  const s=structuredClone(state), at=new Date(now).toISOString(); let result;
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
      validatePrizes(cmd.prizes);audit('settings',{before:s.prizes,after:cmd.prizes});s.prizes=structuredClone(cmd.prizes);s.settingsRevision++;break;
    case 'defaults':pending(s);audit('defaults',{before:s.prizes,after:PRIZES});s.prizes=structuredClone(PRIZES);s.settingsRevision++;break;
    case 'clearRecords':pending(s);audit('clearRecords',{removed:s.records.length});s.records=[];break;
    default:throw Error('未知操作');
  }
  s.revision++;s.updatedAt=at;return {state:s,result};
}
function validTime(t){return typeof t==='string' && /^\d{4}-\d{2}-\d{2}T/.test(t)&&Number.isFinite(Date.parse(t));}
export function validateBackup(input) {
  if(!input||input.format!=='buwuzhengdou-backup'||input.version!==1)throw Error('不是本应用支持的 v1 备份');
  const s=input.state;
  if(!s||s.schema!==1)throw Error('不支持的数据版本');validatePrizes(s.prizes);
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
    if(!row||typeof row.id!=='string'||!validTime(row.at)||!['settings','defaults','clearRecords','import'].includes(row.type)||!row.detail||typeof row.detail!=='object')throw Error('设置变更记录无效');
  }
  // Never restore a redeemable ticket. Restoring a backup is a replacement, not a sync merge.
  return {...structuredClone(s),session:null};
}
export function backup(state){return {format:'buwuzhengdou-backup',version:1,exportedAt:new Date().toISOString(),timezone:ZONE,state:structuredClone(state)};}
