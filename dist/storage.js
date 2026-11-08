import {fresh,command,validateBackup} from './engine.js';
// Adapter boundary: a future server adapter can expose read/execute/replace.
// Never perform network/await inside a live IndexedDB transaction.
const DB_NAME='buwuzhengdou-lucky-v1';
let connection;
export async function openStore(){
  if(connection)return connection;
  connection=await new Promise((resolve,reject)=>{
    const r=indexedDB.open(DB_NAME,1);
    r.onupgradeneeded=()=>r.result.createObjectStore('states');
    r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('请关闭其他旧版本页面后重试'));
    r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();connection=null;};resolve(r.result);};
  });return connection;
}
export async function transact(key, reducer){
  const db=await openStore();
  return new Promise((resolve,reject)=>{
    let result, problem; let tx;
    try{tx=db.transaction('states','readwrite',{durability:'strict'});}catch{tx=db.transaction('states','readwrite');}
    const store=tx.objectStore('states'), r=store.get(key);
    r.onsuccess=()=>{try{const current=r.result||fresh();const outcome=reducer(current);store.put(outcome.state,key);result=outcome.result??outcome.state;}catch(e){problem=e;tx.abort();}};
    tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(problem||tx.error||Error('保存失败，请检查设备存储空间'));tx.onerror=()=>{};
  });
}
export const repository={
  read:key=>transact(key,state=>({state})),
  execute:(key,cmd)=>transact(key,state=>command(state,{...cmd,test:key==='sandbox'})),
  replace:(key,input)=>transact(key,old=>{
    if(old.session?.status==='pending')throw Error('请先处理当前中奖结果');
    const state=validateBackup(input);state.revision=old.revision+1;state.settingsRevision=old.settingsRevision+1;state.updatedAt=new Date().toISOString();
    state.audit.push({id:crypto.randomUUID(),at:state.updatedAt,type:'import',detail:{sourceUpdatedAt:input.state.updatedAt}});return {state};
  }),
  resetSandbox:()=>transact('sandbox',()=>({state:fresh()}))
};
