import {fresh,command,validateBackup,migrateState,clearBusiness} from './engine.js';
import {hashSecret,verifySecret,hashQuestions,validatePassword} from './auth.js';
// Adapter boundary: a future server adapter can expose read/execute/replace.
// Never perform network/await inside a live IndexedDB transaction.
const DB_NAME='buwuzhengdou-lucky-v1';
let connection;
const SECURITY='__owner_security',grants=new Map();
const emptySecurity=()=>({revision:0,passwordHash:null,questions:[],failures:0,lockUntil:0});
const protectedCommands=new Set(['settings','defaults','topup','cancelTopup']);
function locked(s){if(s.lockUntil>Date.now())throw Error(`验证错误次数过多，请${Math.ceil((s.lockUntil-Date.now())/1000)}秒后重试`);}
function consume(token){const grant=grants.get(token);grants.delete(token);if(!grant||grant.until<Date.now())throw Error('请先输入老板密码，或重新解锁设置');return grant;}
function checkGrant(s,grant){if(!s.passwordHash||s.revision!==grant.revision||grant.until<Date.now())throw Error('密码或授权已变化，请重新输入密码');locked(s);}
export async function openStore(){
  if(connection)return connection;
  connection=await new Promise((resolve,reject)=>{
    // Version 2 closes v1 clients, preventing old cached code from bypassing new owner guards.
    const r=indexedDB.open(DB_NAME,2);
    r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains('states'))r.result.createObjectStore('states');};
    r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('请关闭其他旧版本页面后重试'));
    r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();connection=null;};resolve(r.result);};
  });return connection;
}
export async function transact(key, reducer, grant=null){
  const db=await openStore();
  return new Promise((resolve,reject)=>{
    let result, problem; let tx;
    try{tx=db.transaction('states','readwrite',{durability:'strict'});}catch{tx=db.transaction('states','readwrite');}
    const store=tx.objectStore('states');
    const run=()=>{const r=store.get(key);r.onsuccess=()=>{try{const current=migrateState(r.result||fresh());const outcome=reducer(current);store.put(outcome.state,key);result=outcome.result??outcome.state;}catch(e){problem=e;tx.abort();}};};
    if(grant){const r=store.get(SECURITY);r.onsuccess=()=>{try{checkGrant(r.result||emptySecurity(),grant);run();}catch(e){problem=e;tx.abort();}};}else run();
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(problem||tx.error||Error('保存失败，请检查设备存储空间'));tx.onerror=()=>{};
  });
}
export const repository={
  read:key=>transact(key,state=>({state})),
  execute:(key,cmd)=>{const grant=protectedCommands.has(cmd.type)?consume(cmd.authorization):null;return transact(key,state=>command(state,{...cmd,test:key==='sandbox'}),grant);},
  replace:(key,input,authorization)=>transact(key,old=>{
    if(old.session?.status==='pending')throw Error('请先处理当前中奖结果');
    const state=validateBackup(input);state.revision=old.revision+1;state.settingsRevision=old.settingsRevision+1;state.updatedAt=new Date().toISOString();
    state.audit.push({id:crypto.randomUUID(),at:state.updatedAt,type:'import',detail:{sourceUpdatedAt:input.state.updatedAt}});return {state};
  },consume(authorization)),
  resetSandbox:()=>transact('sandbox',()=>({state:fresh()}))
};

async function securityTransaction(reducer){
  const db=await openStore();return new Promise((resolve,reject)=>{
    const tx=db.transaction('states','readwrite'),store=tx.objectStore('states'),r=store.get(SECURITY);let result,problem;
    r.onsuccess=()=>{try{const outcome=reducer(r.result||emptySecurity());if(outcome.state)store.put(outcome.state,SECURITY);result=outcome.result;}catch(e){problem=e;tx.abort();}};
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(problem||tx.error||Error('安全设置保存失败'));tx.onerror=()=>{};
  });
}
const snapshot=()=>securityTransaction(state=>({result:state}));
async function verifyOwner(value,questionId){
  const s=await snapshot();if(!s.passwordHash)throw Error('请先设置老板密码和安全问题');locked(s);
  const hash=questionId?s.questions.find(q=>q.id===questionId)?.answerHash:s.passwordHash;
  const correct=await verifySecret(value,hash,!!questionId);
  const result=await securityTransaction(current=>{
    if(current.revision!==s.revision)throw Error('安全设置已变化，请重新验证');locked(current);
    if(!correct){const failures=current.failures+1;return {state:{...current,failures,lockUntil:failures>=5?Date.now()+30000:0},result:false};}
    return {state:{...current,failures:0,lockUntil:0},result:true};
  });
  if(!result)throw Error(questionId?'安全问题答案不正确':'老板密码不正确');return s;
}
export const security={
  info:async()=>{const s=await snapshot();return {configured:!!s.passwordHash,revision:s.revision,questions:s.questions.map(({id,question})=>({id,question})),lockUntil:s.lockUntil};},
  setup:async(password,questions)=>{
    validatePassword(password);const passwordHash=await hashSecret(password),rows=await hashQuestions(questions);
    await securityTransaction(s=>{if(s.passwordHash)throw Error('老板密码已设置，请使用修改密码');return {state:{revision:s.revision+1,passwordHash,questions:rows,failures:0,lockUntil:0}};});
  },
  authorize:async(password)=>{const s=await verifyOwner(password);const token=crypto.randomUUID();grants.set(token,{revision:s.revision,until:Date.now()+15*60000});return token;},
  changePassword:async(oldPassword,password)=>{
    validatePassword(password);const s=await verifyOwner(oldPassword),passwordHash=await hashSecret(password);
    await securityTransaction(current=>{if(current.revision!==s.revision)throw Error('安全设置已变化，请重新验证');return {state:{...current,passwordHash,revision:current.revision+1,failures:0,lockUntil:0}};});grants.clear();
  },
  changeQuestions:async(password,questions)=>{
    const s=await verifyOwner(password),rows=await hashQuestions(questions);
    await securityTransaction(current=>{if(current.revision!==s.revision)throw Error('安全设置已变化，请重新验证');return {state:{...current,questions:rows,revision:current.revision+1}};});grants.clear();
  },
  resetPassword:async(questionId,answer,password)=>{
    validatePassword(password);if(!questionId)throw Error('请选择一个安全问题');const s=await verifyOwner(answer,questionId),passwordHash=await hashSecret(password);
    await securityTransaction(current=>{if(current.revision!==s.revision)throw Error('安全设置已变化，请重新验证');return {state:{...current,passwordHash,revision:current.revision+1,failures:0,lockUntil:0}};});grants.clear();
  },
};
repository.clearData=async()=>{
  const db=await openStore();await new Promise((resolve,reject)=>{
    let tx;try{tx=db.transaction('states','readwrite',{durability:'strict'});}catch{tx=db.transaction('states','readwrite');}const store=tx.objectStore('states');let problem;
    for(const key of ['live','sandbox']){const r=store.get(key);r.onsuccess=()=>{try{store.put(clearBusiness(r.result||fresh()),key);}catch(e){problem=e;tx.abort();}};}
    const r=store.get(SECURITY);r.onsuccess=()=>{if(r.result)store.put({...r.result,revision:r.result.revision+1},SECURITY);};
    tx.oncomplete=resolve;tx.onabort=()=>reject(problem||tx.error||Error('清除数据失败'));tx.onerror=()=>{};
  });grants.clear();
};
