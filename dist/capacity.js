export const MAX_QUERY_RECORDS=20000;
export const MAX_BACKUP_BYTES=256*1024*1024;
// Only prize query detail is disposable; business data and stock accounting are retained.
export function compactPrizeHistory(input,limit=MAX_QUERY_RECORDS,now=Date.now()){
 if(input.records.length<=limit&&input.ledger.length<=limit+5000)return input;
 const newest=input.records.map((r,i)=>({i,at:Date.parse(r.at)})).sort((a,b)=>b.at-a.at||b.i-a.i).slice(0,limit);
 const keep=new Set(newest.map(r=>r.i)),records=input.records.filter((_,i)=>keep.has(i)),ids=new Set(records.map(r=>r.id));
 const archive=new Map((input.ledgerArchive||[]).map(r=>[r.date+'|'+r.prizeId,{...r}])),ledger=[];
 for(const row of input.ledger){if(ids.has(row.id)){ledger.push(row);continue;}const key=row.date+'|'+row.prizeId;const r=archive.get(key)||{date:row.date,prizeId:row.prizeId,count:0};r.count++;archive.set(key,r);}
 const dropped=input.records.length-records.length;
 return {...input,records,ledger,ledgerArchive:[...archive.values()].sort((a,b)=>a.date.localeCompare(b.date)||a.prizeId.localeCompare(b.prizeId)),retention:{...(input.retention||{}),droppedRecords:(input.retention?.droppedRecords||0)+dropped,recordsLimit:limit,lastPrunedAt:new Date(now).toISOString()}};
}
export function bytesOf(text){let bytes=0;for(let i=0;i<text.length;i++){const c=text.charCodeAt(i);if(c<128)bytes++;else if(c<2048)bytes+=2;else if(c>=0xd800&&c<=0xdbff&&i+1<text.length&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){bytes+=4;i++;}else bytes+=3;}return bytes;}
export async function readBackupFile(file){
 if(file.size>MAX_BACKUP_BYTES)throw Error('备份文件超过256MB，未修改本机数据');
 const header=new Uint8Array(await file.slice(0,2).arrayBuffer());let text;
 if(header[0]===31&&header[1]===139){if(typeof DecompressionStream==='undefined')throw Error('请更新安卓系统WebView后导入压缩备份');const reader=file.stream().pipeThrough(new DecompressionStream('gzip')).getReader(),decoder=new TextDecoder('utf-8',{fatal:true}),parts=[];let size=0;try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BACKUP_BYTES){await reader.cancel();throw Error('解压后的备份超过256MB，未修改本机数据');}parts.push(decoder.decode(value,{stream:true}));}parts.push(decoder.decode());text=parts.join('');}catch(e){throw Error(e.message.includes('256MB')?e.message:'压缩备份损坏或无法解压，未修改本机数据');}}
 else text=await file.text();
 try{return JSON.parse(text);}catch{throw Error('备份JSON无法解析，未修改本机数据');}
}
export async function exportBackupFile(json,name,nativeBridge,onProgress=()=>{}){
 if(bytesOf(json)>MAX_BACKUP_BYTES)throw Error('完整业务备份超过256MB，未删除任何会员、预算或收入数据；请联系维护人员扩容');
 const compressed=typeof CompressionStream!=='undefined';name=name.replace(/\.json$/,compressed?'.json.gz':'.json');let stream=new Blob([json],{type:'application/json'}).stream();if(compressed)stream=stream.pipeThrough(new CompressionStream('gzip'));
 if(nativeBridge?.beginBackup){if(!nativeBridge.beginBackup(name,compressed))throw Error('请先完成当前备份保存');const reader=stream.getReader();try{let size=0;while(true){const {value,done}=await reader.read();if(done)break;for(let i=0;i<value.length;i+=49152){const chunk=value.subarray(i,i+49152);let binary='';for(let j=0;j<chunk.length;j++)binary+=String.fromCharCode(chunk[j]);if(!nativeBridge.appendBackupChunk(btoa(binary)))throw Error('备份写入失败，请检查设备空间');size+=chunk.length;}onProgress(size);}if(!nativeBridge.finishBackup())throw Error('备份准备失败，请重试');}catch(e){nativeBridge.cancelBackup();throw e;}return;}
 const blob=await new Response(stream).blob();if(nativeBridge?.saveBackup){nativeBridge.saveBackup(json,name.replace(/\.gz$/,''));return;}const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
