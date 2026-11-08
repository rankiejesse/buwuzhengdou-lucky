import {test} from 'node:test';
import assert from 'node:assert/strict';
import {hashSecret,verifySecret,hashQuestions,validatePassword} from '../dist/auth.js';
test('salted PBKDF2 verifies exact passwords without retaining plaintext',async()=>{
 const a=await hashSecret('test-owner-2468'),b=await hashSecret('test-owner-2468');assert.notEqual(a.salt,b.salt);assert.notEqual(a.digest,b.digest);
 assert.equal(a.iterations,600000);assert.ok(await verifySecret('test-owner-2468',a));assert.equal(await verifySecret('wrong',a),false);assert.equal(JSON.stringify(a).includes('test-owner-2468'),false);
});
test('custom security questions hash normalized answers and validate configured choices',async()=>{
 const rows=await hashQuestions([{question:'自定义问题甲',answer:'Lucky Bean'},{question:'自定义问题乙',answer:'豆苗'}]);assert.equal(rows.length,2);
 assert.ok(await verifySecret('  LUCKY BEAN ',rows[0].answerHash,true));assert.ok(await verifySecret('豆苗',rows[1].answerHash,true));assert.equal(await verifySecret('别的答案',rows[1].answerHash,true),false);
 assert.equal(JSON.stringify(rows).includes('Lucky Bean'),false);await assert.rejects(()=>hashQuestions([]));await assert.rejects(()=>hashQuestions([{question:'同题',answer:'甲'},{question:'同题',answer:'乙'}]));
 for(const p of ['', '123', 'a'.repeat(65)])assert.throws(()=>validatePassword(p));validatePassword('2468');
});
