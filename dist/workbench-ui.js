import {emptyWorkbench,moneyInput,incomeValue,revenue,bookTotals} from './workbench.js';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:'CNY'}).format(v/100);
const inputAmount=v=>(v/100).toFixed(2);
const field=(id,label,value=0)=>`<label class="field owner-field">${label}<input id="${id}" type="number" inputmode="decimal" min="0" max="999999999.99" step="0.01" placeholder="0.00" value="${value===0?'':inputAmount(value)}"></label>`;
const localTime=at=>{const p=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(at));return p.replace(' ','T');};
const amount=id=>moneyInput($(id).value||'0');
const basisLabels={fixed:'固定总预算',month:'本月收入',year:'本年收入',total:'总收入'};
const trash=(type,id,extra='')=>`<button class="trash-button" data-delete="${type}" data-id="${esc(id)}" ${extra} aria-label="删除" title="删除"><svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg></button>`;
const swipe=(body,button)=>`<div class="swipe-row">${button}<div class="swipe-front">${body}</div></div>`;
const metric=(label,value)=>`<div class="money-metric"><small>${label}</small><strong class="${value<0?'negative':''}">${money(value)}</strong></div>`;

export function createWorkbenchUI(ctx){
 let selectedBook=null;const collapsed=new Set();
 const w=()=>ctx.state().workbench||emptyWorkbench();
 let formRevision=null;
 const execute=async cmd=>{await ctx.act({...cmd,type:'workbench:'+cmd.type,expectedRevision:formRevision??ctx.state().revision});};
 const form=async(...args)=>{formRevision=ctx.state().revision;try{return await ctx.formDialog(...args);}finally{formRevision=null;}};
 async function incomeForm(row){
  const at=row?.registeredAt||new Date().toISOString();
  const body=`<p class="help">当天增值＝剩余现金－初始现金＋微信＋支付宝。修改金额保留初次登记时间；更改下方日历才调整所属日期。时间按北京时间。</p>`+field('cash-initial','初始现金',row?.initial)+field('cash-remaining','剩余现金',row?.remaining)+field('income-wechat','微信收入',row?.wechat)+field('income-alipay','支付宝收入',row?.alipay)+`<label class="field owner-field">登记时间（日历选择）<input id="income-time" type="datetime-local" step="1" required value="${localTime(at)}" max="${localTime(new Date().toISOString())}"></label><p class="help" id="income-preview"></p>`;
  const noteBody=`<label class="field owner-field">收入备注（可留空）<textarea id="income-note" maxlength="1000" rows="3" placeholder="填写备注，或点选快捷气泡">${esc(row?.note||'')}</textarea></label><div id="note-chips" class="note-chips"></div><div class="action-row"><input id="new-chip" maxlength="40" placeholder="新建快捷气泡"><button type="button" id="add-chip" class="small-button">＋ 保存气泡</button></div>`;
  let changed=false;
  const ok=await form(row?'修改当日收入':'登记当日收入',body+noteBody,async()=>{await execute({type:'incomeSave',note:$('#income-note').value,id:row?.id,initial:amount('#cash-initial'),remaining:amount('#cash-remaining'),wechat:amount('#income-wechat'),alipay:amount('#income-alipay'),registeredAt:changed?new Date($('#income-time').value+'+08:00').toISOString():row?.registeredAt});},'保存登记',()=>{
   const chips=()=>{ $('#note-chips').innerHTML=(w().noteChips||[]).map((text,i)=>`<span class="note-chip"><button type="button" data-chip="${i}">${esc(text)}</button><button type="button" data-remove-chip="${i}" aria-label="删除气泡">×</button></span>`).join('');document.querySelectorAll('[data-chip]').forEach(b=>b.onclick=()=>{const input=$('#income-note');input.value=[input.value,w().noteChips[Number(b.dataset.chip)]].filter(Boolean).join(' ').slice(0,1000);});document.querySelectorAll('[data-remove-chip]').forEach(b=>b.onclick=()=>chipAction('chipDelete',w().noteChips[Number(b.dataset.removeChip)]));};
   let chipBusy=false;const chipAction=async(type,text)=>{if(chipBusy)return;chipBusy=true;$('#owner-submit').disabled=true;$('#owner-cancel').disabled=true;try{await execute({type,text});formRevision=ctx.state().revision;chips();$('#new-chip').value='';}catch(e){$('#owner-error').textContent=e.message;}finally{chipBusy=false;$('#owner-submit').disabled=false;$('#owner-cancel').disabled=false;}};
   $('#add-chip').onclick=()=>chipAction('chipAdd',$('#new-chip').value);chips();
   $('#income-time').oninput=()=>changed=true;
   const preview=()=>{try{$('#income-preview').textContent='现金变化：'+money(amount('#cash-remaining')-amount('#cash-initial'))+' · 当天增值：'+money(amount('#cash-remaining')-amount('#cash-initial')+amount('#income-wechat')+amount('#income-alipay'));}catch{$('#income-preview').textContent='请填写金额';}};
   ['#cash-initial','#cash-remaining','#income-wechat','#income-alipay'].forEach(id=>$(id).oninput=preview);preview();
  });if(ok){ctx.render();ctx.toast('收入已保存，收入与预算已更新');}
 }
 function renderIncome(){
  const data=w(),today=ctx.dateKey(),row=data.incomes.find(r=>r.date===today),locked=ctx.mode()==='sandbox';
  ctx.content.innerHTML=ctx.heading('每日收入','记下今天的现金与线上收入，轻松查看店里的成长。')+`
   ${locked?'<div class="notice">测试模式不修改收入和预算，请先退出测试模式。</div>':''}
   <section class="card"><div class="card-heading"><h2>收入预览</h2><span class="badge">人民币 · 北京时间</span></div><div class="money-grid">${metric('总收入',revenue(data,'total'))}${metric('本月收入',revenue(data,'month'))}${metric('本年收入',revenue(data,'year'))}</div><p class="help">收入按已登记日期汇总当天增值，允许为负数；尚未扣除预算支出，作为预算的收入基数。</p></section>
   <section class="card mode-card"><div class="card-heading"><h2>今日收入</h2><button class="primary" id="register-income" ${locked?'disabled':''}>${row?'修改今日登记':'＋ 登记今日收入'}</button></div>${row?`<div class="money-grid">${metric('初始现金',row.initial)}${metric('剩余现金',row.remaining)}${metric('现金变化',row.remaining-row.initial)}${metric('微信收入',row.wechat)}${metric('支付宝收入',row.alipay)}${metric('当天增值',incomeValue(row))}</div><p class="help">登记时间：${ctx.stamp(row.registeredAt)} · 修改金额不会重记登记时间。</p><p data-user-text>${esc(row.note||'')}</p>`:'<p class="empty">今天还没有登记，营业结束时记一笔吧。</p>'}</section>
   <section class="card mode-card"><div class="card-heading"><h2>收入日历与历史</h2><label class="field">选择月份<input type="month" id="income-month" value="${today.slice(0,7)}"></label></div><div id="income-history"></div><p class="help">左滑记录可显示垃圾桶，点击后确认删除。删除收入会同步调整百分比预算。</p></section>`;
  $('#register-income').onclick=()=>ctx.safe(()=>incomeForm(row));
  const list=()=>{const rows=data.incomes.filter(r=>r.date.startsWith($('#income-month').value)).sort((a,b)=>b.date.localeCompare(a.date));$('#income-history').innerHTML=rows.map(r=>swipe(`<button class="plain row-open" data-edit-income="${esc(r.id)}" ${locked?'disabled':''}><b>${r.date}</b><span>登记 ${ctx.stamp(r.registeredAt)}</span><strong>${money(incomeValue(r))}</strong><small data-user-text>${esc(r.note||'')}</small></button>`,trash('incomeDelete',r.id))).join('')||'<p class="empty">这个月还没有登记。</p>';bindSwipes(locked);document.querySelectorAll('[data-edit-income]').forEach(b=>b.onclick=()=>ctx.safe(()=>incomeForm(data.incomes.find(r=>r.id===b.dataset.editIncome))));};
  $('#income-month').onchange=list;list();
 }
 async function bookForm(book){
  const ok=await form(book?'修改预算本':'新建预算小本',`<label class="field owner-field">预算本名称<input id="book-name" maxlength="80" required value="${esc(book?.name||'')}"></label><label class="field owner-field">预算来源<select id="book-basis">${Object.entries(basisLabels).map(([v,l])=>`<option value="${v}" ${book?.basis===v?'selected':''}>${l}</option>`).join('')}</select></label><div id="fixed-field">${field('book-limit','总预算',book?.limit)}</div><div id="percent-field">${field('book-percent','收入百分比（0至100）',(book?.percent??1000))}</div><p class="help">百分比预算＝所选期间收入×比例－其他预算本在该期间的实际支出。拟购不会占用其他本子资金。月/年预算随自然周期变化。</p>`,async()=>{
   await execute({type:'bookSave',bookId:book?.id,name:$('#book-name').value,basis:$('#book-basis').value,limit:amount('#book-limit'),percent:amount('#book-percent')});
  },'保存预算本',()=>{const update=()=>{const fixed=$('#book-basis').value==='fixed';$('#fixed-field').hidden=!fixed;$('#percent-field').hidden=fixed;$('#book-limit').disabled=!fixed;$('#book-percent').disabled=fixed;$('#book-percent').max='100';};$('#book-basis').onchange=update;update();});if(ok){ctx.render();ctx.toast('预算本已保存');}
 }
 async function itemForm(book,category,item){
  const ok=await form(item?'修改预算待办':'添加拟购待办',`<label class="field owner-field">拟购项目<input id="item-name" maxlength="80" required value="${esc(item?.name||'')}"></label>`+field('item-planned','拟购金额',item?.planned)+field('item-actual','实际金额',item?.actual)+`<label class="check-field"><input id="item-paid" type="checkbox" ${item?.paid?'checked':''}> 已购买，计入实际支出</label><p class="help">只有勾选已购买才扣减实际余额，并影响其他百分比预算本。首次勾选自动记录支出时间，修改金额保留该时间。</p>`,async()=>execute({type:'itemSave',bookId:book.id,categoryId:category.id,id:item?.id,name:$('#item-name').value,planned:amount('#item-planned'),actual:amount('#item-actual'),paid:$('#item-paid').checked}),'保存待办');if(ok){ctx.render();ctx.toast('预算待办已保存');}
 }
 function renderBudget(){
  const data=w(),book=data.books.find(b=>b.id===selectedBook),locked=ctx.mode()==='sandbox';
  ctx.content.innerHTML=ctx.heading('预算小池','把想买的记下来，让每一笔实际支出都有去处。',`<button class="primary" id="add-book" ${locked?'disabled':''}>＋ 新建预算本</button>`)+
   (locked?'<div class="notice">测试模式不修改收入和预算，请先退出测试模式。</div>':'')+
   (book?renderBook(book):`<div class="budget-books">${data.books.map(b=>{const t=bookTotals(data,b);return swipe(`<button class="plain book-open" data-book="${esc(b.id)}"><span class="book-icon">▤</span><b data-user-text>${esc(b.name)}</b><small>${basisLabels[b.basis]}${b.basis==='fixed'?'':' × '+b.percent/100+'%'}</small><div class="money-grid">${metric('当前额度',t.allocation)}${metric('拟购后剩余',t.plannedRemaining)}${metric('实际剩余',t.actualRemaining)}</div><span class="inline-link">打开预算本 →</span></button>`,trash('bookDelete',b.id));}).join('')}</div>${data.books.length?'':'<section class="card empty">还没有预算本，建一个小本开始计划吧。</section>'}<p class="help">不同百分比预算共用实际资金，拟购可重叠；只有实购才扣款。各预算本额度不能直接相加当作可用现金。左滑显示删除按钮。</p>`);
  $('#add-book').onclick=()=>ctx.safe(()=>bookForm());
  document.querySelectorAll('[data-book]').forEach(b=>b.onclick=()=>{selectedBook=b.dataset.book;ctx.render();});
  if(book){
   $('#back-books').onclick=()=>{selectedBook=null;ctx.render();};$('#edit-book').onclick=()=>ctx.safe(()=>bookForm(book));
   $('#add-category').onclick=()=>ctx.safe(async()=>{const ok=await form('新建预算类别','<label class="field owner-field">类别名称<input id="category-name" required maxlength="80" placeholder="例如：材料、设备"></label>',()=>execute({type:'categorySave',bookId:book.id,name:$('#category-name').value}),'新增类别');if(ok)ctx.render();});
   document.querySelectorAll('[data-add-item]').forEach(b=>b.onclick=()=>ctx.safe(()=>itemForm(book,book.categories.find(c=>c.id===b.dataset.addItem))));
   document.querySelectorAll('[data-edit-item]').forEach(b=>b.onclick=()=>ctx.safe(()=>{const c=book.categories.find(c=>c.id===b.dataset.category);return itemForm(book,c,c.items.find(i=>i.id===b.dataset.editItem));}));
   document.querySelectorAll('[data-toggle-item]').forEach(b=>b.onchange=()=>ctx.safe(async()=>{document.querySelectorAll('[data-toggle-item]').forEach(input=>input.disabled=true);try{await execute({type:'itemToggle',bookId:book.id,categoryId:b.dataset.category,id:b.dataset.toggleItem});}finally{ctx.render();}}));
   document.querySelectorAll('.todo-row').forEach(row=>{row.closest('.swipe-front').onclick=e=>{if(!e.target.closest('input,button'))row.querySelector('[data-edit-item]').click();};});
  }
  document.querySelectorAll('[data-collapse]').forEach(b=>b.onclick=()=>{const id=b.dataset.collapse;collapsed.has(id)?collapsed.delete(id):collapsed.add(id);b.setAttribute('aria-expanded',String(!collapsed.has(id)));b.textContent=collapsed.has(id)?'展开 ▾':'收起 ▴';b.closest('.budget-category').querySelector('.category-items').hidden=collapsed.has(id);});
  bindSwipes(locked);
 }
 function renderBook(book){const t=bookTotals(w(),book);return `<section class="card"><div class="action-row"><button class="secondary" id="back-books">← 全部预算本</button><button class="secondary" id="edit-book">修改预算</button><button class="primary" id="add-category">＋ 新建类别</button></div><h2 class="book-title" data-user-text>${esc(book.name)}</h2><p class="help">${basisLabels[book.basis]}${book.basis==='fixed'?'':' × '+book.percent/100+'% − 其他本子实际支出 '+money(t.other)}。拟购后余额按未购计划＋已购实际金额计算，避免重复扣款。</p><div class="money-grid">${metric('当前额度',t.allocation)}${metric('拟购与已购合计',t.planned)}${metric('实际已花',t.spent)}${metric('拟购后剩余',t.plannedRemaining)}${metric('实际剩余',t.actualRemaining)}</div>${t.actualRemaining<0?'<p class="notice">实际支出已超出当前额度，请调整预算或减少支出。</p>':''}</section>`+book.categories.map(c=>`<section class="card mode-card budget-category"><div class="card-heading category-heading"><h2 data-user-text>${esc(c.name)}</h2><button class="small-button" data-collapse="${esc(c.id)}" aria-expanded="${!collapsed.has(c.id)}">${collapsed.has(c.id)?'展开 ▾':'收起 ▴'}</button><div class="action-row"><button class="small-button" data-add-item="${esc(c.id)}">＋ 添加待办</button><button class="small-button category-remove" data-delete="categoryDelete" data-id="${esc(c.id)}" data-book-id="${esc(book.id)}" aria-label="删除类别">删除类别</button></div></div><div class="category-items" ${collapsed.has(c.id)?'hidden':''}>${c.items.map(i=>swipe(`<div class="todo-row ${i.paid?'paid':''}"><input type="checkbox" aria-label="已购买 ${esc(i.name)}" data-toggle-item="${esc(i.id)}" data-category="${esc(c.id)}" ${i.paid?'checked':''}><button class="plain todo-open" data-edit-item="${esc(i.id)}" data-category="${esc(c.id)}"><b data-user-text>${esc(i.name)}</b><span>拟购 ${money(i.planned)} · 实际 ${money(i.actual)} · ${i.paid?'已购买':'待购买'}</span>${i.paid?`<small>${ctx.stamp(i.paidAt)}</small>`:''}</button></div>`,trash('itemDelete',i.id,`data-book-id="${esc(book.id)}" data-category-id="${esc(c.id)}"`))).join('')||'<p class="empty">还没有待办，先记下想买的东西。</p>'}</div></section>`).join('');}
 function bindSwipes(locked){
  document.querySelectorAll('.swipe-row').forEach(row=>{let start=null,suppressUntil=0;const front=row.querySelector('.swipe-front');front.addEventListener('pointerdown',e=>{if(e.pointerType!=='mouse')start={x:e.clientX,y:e.clientY};});front.addEventListener('pointerup',e=>{if(!start)return;const dx=e.clientX-start.x,dy=e.clientY-start.y;if(Math.abs(dx)>45&&Math.abs(dx)>Math.abs(dy)*1.5){row.classList.toggle('revealed',dx<0);suppressUntil=Date.now()+500;}start=null;});front.addEventListener('click',e=>{if(Date.now()<suppressUntil){e.preventDefault();e.stopPropagation();}},true);front.addEventListener('pointercancel',()=>start=null);});
  document.querySelectorAll('[data-delete]').forEach(b=>{b.disabled=locked;b.onclick=()=>ctx.safe(async()=>{
   const msg={incomeDelete:'删除后收入预览及百分比预算将重新计算。',bookDelete:'将删除整本类别与待办，已登记的实际支出也会移除，其他预算额度将重新计算。',categoryDelete:'将删除该类别及所有待办，已登记的实际支出也会移除。',itemDelete:'将移除此待办及其实际支出，并重新计算预算。'}[b.dataset.delete];
   if(!await ctx.ask('确认删除？',msg,{danger:true,label:'确认删除'}))return;
   await execute({type:b.dataset.delete,id:b.dataset.id,bookId:b.dataset.bookId||(b.dataset.delete==='bookDelete'?b.dataset.id:undefined),categoryId:b.dataset.categoryId||(b.dataset.delete==='categoryDelete'?b.dataset.id:undefined)});ctx.render();ctx.toast('已删除，相关金额已更新');
  });});
  if(locked)document.querySelectorAll('#edit-book,#add-category,[data-add-item],[data-edit-item],[data-toggle-item]').forEach(b=>b.disabled=true);
 }
 return {renderIncome,renderBudget};
}
