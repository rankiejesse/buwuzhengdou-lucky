const ITERATIONS=600000;
const hex=bytes=>Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
const unhex=text=>Uint8Array.from(text.match(/../g)||[],c=>parseInt(c,16));
export function validatePassword(value){if(typeof value!=='string'||value.length<4||value.length>64)throw Error('密码长度应为4至64位');}
const normalized=value=>String(value).normalize('NFKC').trim().toLowerCase();
export async function hashSecret(value,answer=false){
  const salt=hex(crypto.getRandomValues(new Uint8Array(16)));
  return {salt,iterations:ITERATIONS,digest:await derive(value,salt,ITERATIONS,answer)};
}
async function derive(value,salt,iterations,answer){
  const text=(answer?'answer\0':'password\0')+(answer?normalized(value):value);
  const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(text),'PBKDF2',false,['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations},key,256));
}
export async function verifySecret(value,hash,answer=false){
  if(typeof value!=='string'||!hash||value.length>256)return false;
  const valueHash=await derive(value,hash.salt,hash.iterations,answer);let difference=valueHash.length^hash.digest.length;
  for(let i=0;i<valueHash.length;i++)difference|=valueHash.charCodeAt(i)^hash.digest.charCodeAt(i);return difference===0;
}
export async function hashQuestions(questions){
  if(!Array.isArray(questions)||questions.length<1||questions.length>5)throw Error('请设置1至5个自定义安全问题');
  const seen=new Set(),rows=[];
  for(const row of questions){
    const question=String(row.question||'').trim(),answer=String(row.answer||'');
    if(!question||question.length>100||!normalized(answer)||answer.length>128||seen.has(question))throw Error('问题不得重复或留空，答案不得留空；问题最多100字，答案最多128字');
    seen.add(question);rows.push({id:crypto.randomUUID(),question,answerHash:await hashSecret(answer,true)});
  }
  return rows;
}
