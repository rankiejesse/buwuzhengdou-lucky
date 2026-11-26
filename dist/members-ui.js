import {searchMembers,memberBalance} from './members.js';
import {moneyInput} from './workbench.js';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'¥'+(n/100).toFixed(2),$=s=>document.querySelector(s);
const field=(id,label,props='')=>`<label class="field owner-field">${label}<input id="${id}" ${props}></label>`;
const amount=id=>moneyInput($(id).value||'0');
export function createMemberUI(ctx){let selected=null,query='';
 async function edit(member){const create=!member,transactionId=crypto.randomUUID(),id=member?.id||crypto.randomUUID();
 const body=field('member-name','名字',`required maxlength="80" value="${esc(member?.name||'')}"`)+field('member-phone','手机号码',`type="tel" inputmode="tel" required pattern="[0-9]{6,20}" value="${esc(member?.phone||'')}"`)+(create?paymentFields('首充金额（30元起）'): '');
 const ok=await ctx.formDialog(create?'新建会员与首充':'修改会员信息',body,async()=>{await ctx.act({type:'member:'+(create?'create':'edit'),id,transactionId,name:$('#member-name').value,phone:$('#member-phone').value,...(create?{amount:amount('#member-amount'),gift:amount('#member-gift'),note:$('#member-note').value}:{})});selected=id;},'保存',create?giftHook:undefined);if(ok){render();ctx.toast('会员信息已保存');}}
 function paymentFields(label){return field('member-amount',label,'type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00" required')+field('member-gift','赠送金额（默认充值的10%，可修改）','type="number" step="0.01" min="0" inputmode="decimal" placeholder="0.00"')+field('member-note','备注（可留空）','maxlength="500"')+'<p class="help">充值与赠送一并计入可用余额；金额保存后写入不可重复执行的流水。</p>';}
 function giftHook(){
  let manual=false;
  $('#member-gift').oninput=()=>{manual=true;};
  $('#member-amount').oninput=()=>{if(manual)return;try{$('#member-gift').value=(Math.round(amount('#member-amount')/10)/100).toFixed(2);}catch{$('#member-gift').value='';}};
 }
 async function payment(m,type){const transactionId=crypto.randomUUID();const body=type==='recharge'?paymentFields('续充金额（10元起）'):field('member-amount','消费金额',`type="number" step="0.01" min="0.01" max="${(memberBalance(m)/100).toFixed(2)}" inputmode="decimal" required placeholder="0.00"`)+field('member-note','消费备注（可留空）','maxlength="500"');
 const ok=await ctx.formDialog(type==='recharge'?'会员续充':'记录会员消费',`<p>${esc(m.name)} · ${esc(m.phone)}<br>可用余额 ${money(memberBalance(m))}</p>`+body,()=>ctx.act({type:'member:'+type,id:m.id,transactionId,amount:amount('#member-amount'),gift:type==='recharge'?amount('#member-gift'):0,note:$('#member-note').value}),'确认保存',type==='recharge'?giftHook:undefined);if(ok){render();ctx.toast(type==='recharge'?'充值成功':'消费已记录');}}
 function render(){if(!ctx.staff()){ctx.content.innerHTML='<section class="card">请先切换到店员模式</section>';return;}if(ctx.mode()==='sandbox'){ctx.content.innerHTML='<section class="card">会员操作只在正式模式使用，请退出测试模式。</section>';return;}
 const rows=ctx.state().members||[],m=rows.find(m=>m.id===selected);
 ctx.content.innerHTML=ctx.heading('会员管理','首充30元起 · 续充10元起 · 赠送默认10%',`<button class="primary" id="member-create">＋ 新建会员</button>`)+
 (m?`<section class="card"><div class="action-row"><button id="member-back" class="secondary">← 返回搜索</button><button id="member-edit" class="secondary">修改信息</button></div><h2 data-user-text>${esc(m.name)}</h2><p>${esc(m.phone)}</p><div class="money-grid"><div class="money-metric"><small>剩余可用金额</small><strong>${money(memberBalance(m))}</strong></div><div class="money-metric"><small>累计充值</small><strong>${money(m.transactions.filter(t=>t.type==='recharge').reduce((n,t)=>n+t.amount,0))}</strong></div><div class="money-metric"><small>累计赠送</small><strong>${money(m.transactions.reduce((n,t)=>n+t.gift,0))}</strong></div></div><div class="action-row"><button id="member-recharge" class="primary">充值</button><button id="member-spend" class="secondary" ${memberBalance(m)<=0?'disabled':''}>记录消费</button></div></section><section class="card mode-card"><h2>充值与消费记录</h2>${[...m.transactions].reverse().map(t=>`<div class="member-ledger"><b>${t.type==='recharge'?'充值 '+money(t.amount)+' · 赠送 '+money(t.gift):'消费 −'+money(t.amount)}</b><small>${ctx.stamp(t.at)}</small><span data-user-text>${esc(t.note)}</span></div>`).join('')}</section>`:
 `<section class="card"><label class="field">实时搜索姓名、手机号码或尾号<input id="member-search" type="search" autocomplete="off" placeholder="输入即显示匹配结果" value="${esc(query)}"></label><p class="help">数字搜索优先展示手机尾号匹配，其次展示号码中间部分匹配。</p><div id="member-results"></div><p class="help">会员共 ${rows.length} 位，数据保存在本机，随完整JSON备份导出。</p></section>`);
 $('#member-create').onclick=()=>ctx.safe(()=>edit());
 if(m){$('#member-back').onclick=()=>{selected=null;render();};$('#member-edit').onclick=()=>ctx.safe(()=>edit(m));$('#member-recharge').onclick=()=>ctx.safe(()=>payment(m,'recharge'));$('#member-spend').onclick=()=>ctx.safe(()=>payment(m,'spend'));}
 else {const list=()=>{const matches=searchMembers(rows,query);$('#member-results').innerHTML=matches.map(m=>`<button class="member-result" data-member="${esc(m.id)}"><b data-user-text>${esc(m.name)}</b><span>${esc(m.phone)}</span></button>`).join('')||`<p class="empty">${query.trim()?'暂无匹配会员':'输入姓名、完整号码或尾号查找会员'}</p>`;document.querySelectorAll('[data-member]').forEach(b=>b.onclick=()=>{$('#member-search').blur();selected=b.dataset.member;render();});};$('#member-search').oninput=e=>{query=e.target.value;list();};list();}
 }
 return {render};
}
