import {PRIZES,dateKey,counts,availability,pool,backup,validateBackup} from './engine.js';
import {repository} from './storage.js';
const $=s=>document.querySelector(s), content=$('#content'), dialog=$('#dialog');
let mode=sessionStorage.getItem('bean-mode')==='sandbox'?'sandbox':'live';
let state, page='draw', busy=false, animating=false, draft=null, draftRevision=0, dirty=false, selectedDate=dateKey(), followToday=true, category='', forcedPrize='', toastTimer, installPrompt, modalResolve;
const channel=typeof BroadcastChannel!=='undefined'?new BroadcastChannel('bean-updates'):null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const stamp=t=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(t));
const time=t=>new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(t));
const n=v=>v===null?'不限':v;
const symbols={折扣:'✧',立减:'◇',体验卡:'▰'};
const names={draw:['幸运抽奖','LUCKY DRAW'],records:['今日中奖查询','LUCKY RECORDS'],inventory:['库存看板','PRIZE INVENTORY'],settings:['奖池设置','PRIZE SETTINGS'],data:['数据管理','DATA & BACKUP']};
function toast(message){$('#toast').textContent=message;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,4500);}
function closeModal(value){dialog.close();const resolve=modalResolve;modalResolve=null;resolve?.(value);}
function ask(title,message,{danger=false,label='确认',typed=false}={}){
  return new Promise(resolve=>{
    modalResolve=resolve;
    $('#dialog-content').innerHTML=`<p class="dialog-kicker">OWNER WORKSPACE</p><h2 class="dialog-title">${esc(title)}</h2><p class="dialog-copy">${esc(message)}</p>${typed?'<label class="field">请输入“清空”确认<input id="confirm-text" autocomplete="off" placeholder="清空"></label>':''}<div class="dialog-buttons"><button class="secondary" id="cancel-modal">取消</button><button class="${danger?'danger':'primary'}" id="ok-modal" ${typed?'disabled':''}>${esc(label)}</button></div>`;
    $('#cancel-modal').onclick=()=>closeModal(false);$('#ok-modal').onclick=()=>closeModal(true);
    if(typed)$('#confirm-text').oninput=e=>$('#ok-modal').disabled=e.target.value!=='清空';
    if(!dialog.open)dialog.showModal();
  });
}
dialog.addEventListener('cancel',e=>{e.preventDefault();if(modalResolve)closeModal(false);});
async function reload(){state=await repository.read(mode);}
async function act(cmd){const result=await repository.execute(mode,cmd);await reload();channel?.postMessage({mode});return result;}
async function safe(fn){if(busy)return;busy=true;try{await fn();}catch(e){toast(e.message||'操作失败，请重试');}finally{busy=false;}}
function heading(title,sub,extra=''){return `<div class="page-heading"><div><p class="eyebrow">BUWUZHENGDOU · LUCKY BEAN CLUB</p><h1>${title}</h1><p class="subtitle">${sub}</p></div>${extra}</div>`;}
function todayRows(){return state.records.filter(r=>r.date===dateKey());}
function render(){
  $('#test-banner').hidden=mode!=='sandbox';
  document.querySelectorAll('[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  $('#top-title').textContent=names[page][0];$('.top-subtitle').textContent=' / '+names[page][1];
  $('#today-label').textContent=dateKey().split('-').join(' . ');
  ({draw:renderDraw,records:renderRecords,inventory:renderInventory,settings:renderSettings,data:renderData})[page]();
}
function renderDraw(){
  const active=pool(state), session=state.session, settled=session&&session.status!=='pending';
  content.innerHTML=heading('今天，也有好豆运 ✦','轻轻一点，让幸运和快乐一起发生。',`<span class="day-ticket">✧ &nbsp; 每一份好运，都值得期待</span>`)+`
    ${mode==='sandbox'?`<div class="test-controls"><b>老板测试台</b><label for="force-prize">指定奖项</label><select id="force-prize"><option value="">按测试概率随机</option>${PRIZES.map(p=>`<option value="${p.id}">${p.name}</option>`).join('')}</select><span>指定抽取仍遵守测试库存限制</span></div>`:''}
    <div class="draw-layout"><section class="arcade" aria-label="幸运抽奖机"><div class="arcade-bar"><span>LUCKY BEAN MACHINE</span><div class="lights"><i></i><i></i><i></i></div></div><div class="arcade-stage">
      <span class="deco d1" aria-hidden="true">✦</span><span class="deco d2" aria-hidden="true">✧</span><span class="deco d3" aria-hidden="true">+</span><span class="deco d4" aria-hidden="true">+</span>
      <p class="arcade-title">好运扭一扭</p><div class="arcade-sub">A LITTLE BEAN OF LUCK</div>
      <div class="machine" aria-hidden="true"><div class="machine-top">LUCKY</div><div class="machine-body"><div class="reels"><span class="reel">✦</span><span class="reel">豆</span><span class="reel">✦</span></div><div class="machine-slot"></div></div><div class="machine-feet"><i></i><i></i></div><div class="machine-handle"></div></div>
      ${settled?`<div class="result-state">${session.status==='claimed'?'领取成功 · '+esc(session.name):'本次抽奖已放弃'}<small>${session.status==='claimed'?'好运已收好，祝你玩得开心！':'本次资格已作废，不发奖、不扣库存。'}</small></div><button id="next-customer" class="start-button settled-button">老板操作 · 下一位顾客 →</button><p class="owner-hint">请老板确认已交接下一位顾客，再继续抽奖</p>`:`<button id="start-draw" class="start-button" ${!active.length&&!session?'disabled':''}>${session?'查看中奖结果':active.length?'开始抽奖':'奖池暂时休息'}<span>➜</span></button><p class="arcade-hint">${active.length?'每位顾客一次机会 · 请由老板现场监督':'所有奖项均已暂停，请老板补充库存或调整概率'}</p>`}
      </div><div class="arcade-bottom"><span><b>✧</b> 十种小幸运</span><span><b>♡</b> 快乐不落空</span><span><b>▣</b> 无需登录</span></div></section>
      <div class="side-stack"><section class="card"><div class="card-heading"><h2>今日好运速报</h2><span class="card-label">TODAY</span></div><div class="stats-grid"><div><div class="stat-number">${todayRows().length}<small>份</small></div><div class="stat-label">今日已领取</div></div><div><div class="stat-number">${active.length}<small>/ 10</small></div><div class="stat-label">当前可抽奖项</div></div></div><div class="stat-foot"><span>●</span> &nbsp; ${active.length?'好运已就位，等你来开启':'请老板补充奖池'}${mode==='sandbox'?' · 测试数据':''}</div></section>
      <section class="card rules"><div class="card-heading"><h2>抽奖小约定</h2><span class="card-label">HOW TO PLAY</span></div><div class="rule"><span class="rule-num">01</span><span>点击开始抽奖，等待好运揭晓。</span></div><div class="rule"><span class="rule-num">02</span><span>抽中后确认领取，奖品才会正式发放。</span></div><div class="rule"><span class="rule-num">03</span><span>放弃即用完本次机会，不能重新抽奖。</span></div><p class="rules-note">折扣与立减仅限体验费，不折现、不找零，且不与其他优惠叠加。</p></section></div></div>
    <section class="prize-section"><div class="section-heading"><h2>本期幸运奖池 <span style="color:#baa6c9">✧</span></h2><small>10 种好礼 · 等你开启</small></div><div class="prize-grid">${state.prizes.map(p=>{const a=availability(state,p), effective=active.find(x=>x.id===p.id)?.effective||0;return `<div class="prize-tile ${p.category==='体验卡'?'card-prize':''} ${!a.available?'paused':''}" title="${esc(a.reason||'可抽取')} · 配置概率 ${p.probability}%">${p.category==='体验卡'?'<span class="ribbon">稀有</span>':''}<span class="prize-symbol">${symbols[p.category]}</span><strong>${p.name}</strong><small>${a.available?'当前 '+Number(effective.toFixed(2))+'%':'暂时停抽'}</small></div>`;}).join('')}</div><p class="foot-note">库存受限的奖项自动暂停，其余奖项按配置比例分配概率。好运限量，快乐不限量。</p></section>`;
  if($('#force-prize')){$('#force-prize').value=forcedPrize;$('#force-prize').onchange=e=>forcedPrize=e.target.value;}
  if($('#start-draw'))$('#start-draw').onclick=()=>safe(startDraw);
  if($('#next-customer'))$('#next-customer').onclick=()=>safe(async()=>{
    const id=state.session?.id;
    if(await ask('下一位顾客准备好了吗？','本次顾客的资格已经使用。请确认现在交接给另一位顾客。',{label:'确认 · 下一位'})){
      await reload();if(state.session?.id!==id||state.session?.status==='pending')throw Error('抽奖状态已变化，请重新检查');
      await act({type:'next',id});render();toast('已准备好，欢迎下一位顾客');
    }
  });
}
async function startDraw(){
  if(state.session){showResult();return;}
  const forceId=$('#force-prize')?.value||undefined;
  await act({type:'draw',forceId});
  animating=true;$('.arcade').classList.add('spinning');$('#start-draw').disabled=true;$('#start-draw').textContent='好运正在赶来…';
  const reels=[...document.querySelectorAll('.reel')],chars=['✦','豆','♡','7','◇'];let tick=0;
  const timer=setInterval(()=>reels.forEach((r,i)=>r.textContent=chars[(tick+++i)%chars.length]),110);
  await new Promise(r=>setTimeout(r,matchMedia('(prefers-reduced-motion: reduce)').matches?250:1800));clearInterval(timer);animating=false;render();showResult();
}
function showResult(){
  const session=state.session;if(!session||session.status!=='pending')return;
  $('#dialog-content').innerHTML=`<div class="claimed-burst"><p class="dialog-kicker">${mode==='sandbox'?'TEST MODE · 不会正式发奖':'YOUR LUCKY MOMENT'}</p><div class="result-confetti" aria-hidden="true">✦ · ✧ · ✦</div><div class="dialog-icon">${symbols[session.category]}</div><h2 class="dialog-title">恭喜你，抽中了</h2><div class="dialog-prize">${esc(session.name)}</div><p class="dialog-copy">确认领取后才会发放并扣减${mode==='sandbox'?'测试':''}库存。<br>放弃将用完本次机会，无法重新抽奖。</p><div class="dialog-buttons"><button class="secondary" id="abandon">放弃</button><button class="primary" id="claim">确认领取</button></div></div>`;
  if(!dialog.open)dialog.showModal();
  $('#claim').onclick=()=>safe(async()=>{
    $('#claim').disabled=true;$('#abandon').disabled=true;
    try{await act({type:'claim',id:session.id});closeModal();render();toast(mode==='sandbox'?'测试领取成功 · 正式库存未变化':'领取成功，好运已收好！');}
    catch(e){$('#claim').disabled=false;$('#abandon').disabled=false;throw e;}
  });
  $('#abandon').onclick=()=>safe(async()=>{
    if(await ask('确定放弃这份好运？','放弃不扣库存、不计入中奖记录，但本位顾客不能重新抽奖。',{label:'确认放弃'})){
      await act({type:'abandon',id:session.id});render();toast('本次资格已作废，请老板安排下一位顾客');
    }else showResult();
  });
}
function renderRecords(){
  if(followToday)selectedDate=dateKey();
  const rows=state.records.filter(r=>r.date===selectedDate&&(!category||r.category===category)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||a.id.localeCompare(b.id));
  content.innerHTML=heading('每一份好运，都有迹可循','仅展示已确认领取的记录，按领取时间从早到晚排序。')+`
    <div class="toolbar"><label>中奖日期<input id="record-date" type="date" value="${esc(selectedDate)}"></label><label>奖项类别<select id="category"><option value="">全部类别</option>${['折扣','立减','体验卡'].map(c=>`<option ${c===category?'selected':''}>${c}</option>`).join('')}</select></label><button id="go-today" class="secondary">回到今天</button><span class="date-count">${mode==='sandbox'?'测试':''}已领取 ${rows.length} 份</span></div>
    <div class="table-wrap"><table><thead><tr><th>序号</th><th>中奖日期</th><th>领取时间 ↑</th><th>奖项类别</th><th>具体奖项</th><th>领取状态</th></tr></thead><tbody>${rows.length?rows.map((r,i)=>`<tr><td>${String(i+1).padStart(2,'0')}</td><td>${r.date}</td><td>${time(r.at)}</td><td>${r.category}</td><td><strong>${r.name}</strong></td><td><span class="badge">已领取</span></td></tr>`).join(''):'<tr><td colspan="6"><div class="empty"><div class="empty-icon">▤</div>这一天还没有符合条件的领取记录<br><small>好事即将发生，耐心等一等。</small></div></td></tr>'}</tbody></table></div><p class="help">日期按北京时间（Asia/Shanghai）计算。默认跟随今天，跨天自动切换；手动选择历史日期后，停留在所选日期。</p>`;
  $('#record-date').onchange=e=>{selectedDate=e.target.value||dateKey();followToday=selectedDate===dateKey();renderRecords();};$('#category').onchange=e=>{category=e.target.value;renderRecords();};$('#go-today').onclick=()=>{followToday=true;selectedDate=dateKey();renderRecords();};
}
function renderInventory(){
  content.innerHTML=heading('好运库存，一眼看清','总库存、月上限、日上限同时生效，确认领取才消耗库存。',`<button class="secondary" id="to-settings">调整奖池 ↗</button>`)+`
    <div class="notice purple">总库存是累计发放上限；补货时请增加总库存数值。每日、每月按北京时间的自然日、自然月重新计算。</div>
    <div class="table-wrap"><table><thead><tr><th>奖项</th><th>初始总库存 / 当前总上限</th><th>累计已领取</th><th>剩余总库存</th><th>本月已领 / 月上限</th><th>今日已领 / 日上限</th><th>当前状态</th></tr></thead><tbody>${state.prizes.map(p=>{const a=availability(state,p);return `<tr><td><strong>${p.name}</strong></td><td>${n(p.total)}</td><td>${a.used.total}</td><td>${n(a.remaining)}</td><td>${a.used.monthly} / ${n(p.monthly)}</td><td>${a.used.daily} / ${n(p.daily)}</td><td><span class="badge ${a.available?'':'paused'}">${a.available?'可抽取':a.reason}</span></td></tr>`;}).join('')}</tbody></table></div><p class="help">“不限”表示该层级不设上限；设置为 0 则暂停。历史中奖查询即使被清空，库存消耗仍保留在独立库存流水中。</p>`;
  $('#to-settings').onclick=()=>navigate('settings');
}
function renderSettings(){
  if(!draft){draft=structuredClone(state.prizes);draftRevision=state.settingsRevision;}
  content.innerHTML=heading('把好运，调成喜欢的样子','十种奖项自由配比，库存留空表示不限。保存后只影响之后的抽奖。')+`
    <div class="notice">${mode==='sandbox'?'正在编辑独立测试奖池，不影响正式设置。':'当前编辑正式奖池，请由老板操作。'}总库存填写“累计最多发放数量”，不是当前剩余数；默认十种奖项不增不减。</div>
    <div class="table-wrap"><table id="settings-table"><thead><tr><th>奖项名称</th><th>中奖概率 %</th><th>总库存</th><th>月库存上限</th><th>日库存上限</th></tr></thead><tbody>${draft.map(p=>`<tr><td><strong>${p.name}</strong><span class="default-value">默认 ${PRIZES.find(x=>x.id===p.id).probability}%</span></td>${['probability','total','monthly','daily'].map(k=>`<td><input aria-label="${p.name}${{probability:'概率',total:'总库存',monthly:'月上限',daily:'日上限'}[k]}" data-id="${p.id}" data-field="${k}" type="number" min="0" ${k==='probability'?'max="100" step="any"':'step="1"'} placeholder="${k==='probability'?'0':'不限'}" value="${p[k]??''}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="action-row settings-foot"><button class="primary" id="save-settings">保存设置</button><button class="secondary" id="discard-settings">撤销修改</button><button class="secondary" id="restore-defaults">恢复默认</button><span class="sum" id="prob-sum"></span></div><p id="save-feedback" class="help">${dirty?'有未保存的修改':'设置已保存 · '+stamp(state.updatedAt)}</p>
    <section class="card mode-card"><div class="card-heading"><h2>老板专用测试模式</h2><span class="card-label">SANDBOX</span></div><p class="help">测试奖池、库存、流水和中奖记录独立保存。可指定十种奖项逐一测试；可修改测试概率与库存，并验证耗尽后的行为。</p><div class="action-row"><button id="toggle-test" class="secondary">${mode==='sandbox'?'退出测试，返回正式模式':'进入测试模式'}</button>${mode==='sandbox'?'<button id="reset-test" class="secondary">重置测试数据</button><button id="try-draw" class="primary">去测试抽奖 →</button>':''}</div></section>`;
  $('#settings-table').oninput=e=>{const {id,field}=e.target.dataset;if(!id)return;const value=e.target.value;draft.find(p=>p.id===id)[field]=field!=='probability'&&value===''?null:value===''?NaN:Number(value);dirty=true;$('#save-feedback').textContent='有未保存的修改';updateSum();};updateSum();
  $('#save-settings').onclick=()=>safe(async()=>{
    if(!$('#settings-table').querySelector('input:invalid')&&await ask('保存当前奖池设置？',`${mode==='sandbox'?'测试':'正式'}奖池的新概率与库存将立即用于之后的抽奖，历史记录保持原样。`,{label:'确认保存'})){
      await act({type:'settings',prizes:draft,expectedRevision:draftRevision});draft=null;dirty=false;render();toast('奖池设置保存成功');
    }else if($('#settings-table').querySelector('input:invalid'))throw Error('请检查概率与库存的输入');
  });
  $('#discard-settings').onclick=()=>safe(async()=>{if(!dirty||await ask('撤销未保存的修改？','将重新加载当前已保存的奖池。')){draft=null;dirty=false;await reload();render();toast('已加载保存的设置');}});
  $('#restore-defaults').onclick=()=>safe(restoreDefaults);$('#toggle-test').onclick=()=>safe(toggleTest);
  if($('#reset-test'))$('#reset-test').onclick=()=>safe(async()=>{if(await ask('重置全部测试数据？','仅重置测试奖池、测试库存和测试记录，不影响正式数据。')){await repository.resetSandbox();await reload();draft=null;dirty=false;render();toast('测试数据已重置');}});
  if($('#try-draw'))$('#try-draw').onclick=()=>navigate('draw');
}
function updateSum(){const sum=draft.reduce((s,p)=>s+p.probability,0);const valid=Number.isFinite(sum)&&Math.abs(sum-100)<1e-8;$('#prob-sum').textContent=`概率合计 ${Number.isFinite(sum)?Number(sum.toFixed(8)):'—'}% ${valid?'✓':'· 需为 100%'}`;$('#prob-sum').classList.toggle('invalid',!valid);$('#save-settings').disabled=!valid;}
async function restoreDefaults(){if(await ask('恢复默认奖池？','将恢复默认概率，并把三个库存限制设为不限。不会清除中奖记录、库存流水和已领取数量。',{label:'恢复默认'})){await act({type:'defaults'});draft=null;dirty=false;render();toast('已恢复十种默认奖项，历史记录已保留');}}
async function toggleTest(){
  if(state.session?.status==='pending')throw Error('请先确认领取或放弃当前中奖结果，再切换模式');
  if(dirty&&!await ask('放弃未保存的设置？','切换模式会丢弃当前未保存的修改。'))return;
  const entering=mode!=='sandbox';
  if(!await ask(entering?'进入老板测试模式？':'返回正式抽奖？',entering?'测试使用独立数据，可以放心验证流程和库存。正式顾客请使用正式模式。':'之后的抽奖将正式消耗库存并写入正式记录。',{label:entering?'进入测试':'返回正式'}))return;
  mode=entering?'sandbox':'live';sessionStorage.setItem('bean-mode',mode);draft=null;dirty=false;await reload();render();toast(entering?'已进入测试模式':'已返回正式模式');
}
function renderData(){
  const disabled=mode==='sandbox'?'disabled':'';
  content.innerHTML=heading('把好运，好好保存','数据只保存在当前设备、当前浏览器中。迁移设备前，请先导出备份。')+`
    ${mode==='sandbox'?'<div class="notice">测试模式下不可导入、清空或导出正式数据。请先退出测试模式。</div>':''}
    <div class="data-grid"><section class="card data-card"><div class="data-icon">↗ ▣</div><h2>导出完整备份</h2><p>包含奖项设置、中奖记录、库存变化流水与设置变更记录，保存为 JSON 文件。</p><button id="export-data" class="primary" ${disabled}>导出 JSON 备份 ↓</button></section>
    <section class="card data-card"><div class="data-icon">▣ ↙</div><h2>导入已有备份</h2><p>检查文件内容后，整份替换本机正式数据。不会自动合并；请先备份当前数据。</p><button id="import-data" class="secondary" ${disabled}>选择 JSON 文件 ↑</button><input id="import-file" type="file" accept=".json,application/json" hidden></section>
    <section class="card data-card"><div class="data-icon">↺</div><h2>恢复默认奖池</h2><p>恢复十种默认概率、库存限制设为不限。保留历史中奖记录、库存流水与累计领取数量。</p><button id="data-defaults" class="secondary" ${disabled}>恢复默认奖池</button></section>
    <section class="card data-card"><div class="data-icon">⌫</div><h2>清空历史中奖记录</h2><p>仅清空中奖查询记录。库存流水继续保留，已消耗的库存不会返还。此操作需要两次确认。</p><button id="clear-records" class="danger" ${disabled}>清空历史记录</button></section></div>
    <div class="notice purple">最后更新时间：${stamp(state.updatedAt)}<br>记录 ${state.records.length} 条 · 库存流水 ${state.ledger.length} 条 · 设置变更 ${state.audit.length} 条<br>本机数据不自动跨设备同步。导入旧备份会回滚库存，请勿将同一备份用于多台设备同时发奖。</div>
    <section class="card"><div class="card-heading"><h2>设备与离线使用</h2><button id="persist-storage" class="small-button">申请持久存储</button></div><p class="help" id="storage-state">正在检查浏览器存储…</p><p class="help">安卓 Chrome：首次联网打开，等待右下角显示“离线已就绪”，再从浏览器菜单选择“添加到主屏幕 / 安装应用”。清除浏览器站点数据、卸载或设备损坏可能丢失本机数据，请定期导出备份。</p></section>
    <section class="card mode-card"><h2>最近库存与设置变化</h2>${[...state.ledger.map(r=>({at:r.at,text:`领取 ${PRIZES.find(p=>p.id===r.prizeId).name} · 库存 -1`})),...state.audit.map(r=>({at:r.at,text:({settings:'修改概率或库存配置',defaults:'恢复默认奖池',clearRecords:'清空中奖查询记录（库存未返还）',import:'导入并替换备份'})[r.type]}))].sort((a,b)=>Date.parse(b.at)-Date.parse(a.at)).slice(0,20).map(r=>`<div class="audit-line">${stamp(r.at)} &nbsp; <b>${esc(r.text)}</b></div>`).join('')||'<p class="help">暂无变化，完整流水随 JSON 备份导出。</p>'}</section>`;
  $('#export-data').onclick=()=>safe(async()=>{
    await reload();const blob=new Blob([JSON.stringify(backup(state),null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download=`不务正豆-完整备份-${dateKey()}-${Date.now()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);toast('备份已生成，请确认文件已保存到下载目录');
  });
  $('#import-data').onclick=()=>$('#import-file').click();
  $('#import-file').onchange=e=>safe(async()=>{
    const file=e.target.files[0];e.target.value='';if(!file)return;if(file.size>20*1024*1024)throw Error('备份超过 20MB，请联系维护人员处理');
    let input;try{input=JSON.parse(await file.text());}catch{throw Error('JSON 文件无法解析，请选择完整备份');}
    const checked=validateBackup(input);
    if(await ask('确认导入并替换本机数据？',`备份更新时间：${stamp(checked.updatedAt)}\n包含 ${checked.records.length} 条中奖记录、${checked.ledger.length} 条库存流水。\n本机当前有 ${state.records.length} 条中奖记录。\n将覆盖现有数据，无法自动合并。待领取抽奖不会恢复，请先导出当前备份。`,{danger:true,label:'确认替换数据'})){
      await repository.replace('live',input);await reload();channel?.postMessage({mode});draft=null;dirty=false;render();toast('导入成功，已替换本机数据');
    }
  });
  $('#data-defaults').onclick=()=>safe(restoreDefaults);
  $('#clear-records').onclick=()=>safe(async()=>{
    if(await ask('清空所有历史中奖记录？',`将删除 ${state.records.length} 条中奖查询记录。库存流水保留，不返还库存。建议先导出备份。`,{danger:true,label:'继续'})){
      if(await ask('最后确认：此操作无法撤销','请输入“清空”，确认删除全部日期的正式中奖查询记录。',{danger:true,label:'清空全部历史记录',typed:true})){await act({type:'clearRecords'});render();toast('中奖查询记录已清空，库存消耗已保留');}
    }
  });
  const storageCheck=async()=>{if($('#storage-state'))$('#storage-state').textContent=await navigator.storage?.persisted?.()?'当前已获得持久存储许可。仍建议定期备份。':'当前由浏览器管理存储空间。可申请持久存储，减少空间不足时被自动清理的风险。';};storageCheck();
  $('#persist-storage').onclick=()=>safe(async()=>{const ok=await navigator.storage?.persist?.();toast(ok?'持久存储已启用':'浏览器暂未授予许可，安装到桌面并持续使用后可重试');await storageCheck();});
}
async function navigate(next){
  if(busy||animating)return;
  if(dirty&&next!=='settings'){if(!await ask('离开并放弃未保存的设置？','当前修改尚未保存，离开后将恢复已保存的奖池。'))return;draft=null;dirty=false;}
  if(next!==page&&next==='settings'){draft=null;dirty=false;}
  page=next;await reload();render();window.scrollTo(0,0);
}
document.querySelectorAll('[data-page]').forEach(b=>b.onclick=()=>navigate(b.dataset.page));
$('.brand').onclick=e=>{e.preventDefault();navigate('draw');};
$('#exit-test').onclick=()=>safe(toggleTest);
window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue='';}});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;$('#install').hidden=false;});
$('#install').onclick=async()=>{if(installPrompt){await installPrompt.prompt();installPrompt=null;$('#install').hidden=true;}};
const connection=()=>{$('#connection').textContent=navigator.onLine?'● 在线':'● 离线';};window.addEventListener('online',connection);window.addEventListener('offline',connection);connection();
channel?.addEventListener('message',async e=>{if(e.data.mode!==mode||busy||animating)return;await reload();if(!dirty){if(page==='settings')draft=null;render();if(dialog.open&&!modalResolve){if(state.session?.status==='pending')showResult();else closeModal();}}else toast('其他页面的数据已变化；保存时将检查设置版本');});
let lastDay=dateKey();
setInterval(async()=>{if(busy||animating||!state)return;const day=dateKey();if(day!==lastDay){lastDay=day;await reload();if(!dirty&&page!=='settings'&&page!=='data')render();}},1000);
document.addEventListener('visibilitychange',async()=>{if(document.visibilityState==='visible'&&state&&!busy&&!dirty&&!animating){await reload();if(page==='settings')draft=null;render();}});
async function initialize(){
  try{await reload();render();window.__beanStarted=true;window.dispatchEvent(new Event('bean-ready'));if(state.session?.status==='pending')showResult();}
  catch(e){window.__beanStarted=true;window.dispatchEvent(new Event('bean-ready'));content.innerHTML=`<section class="error-card"><h1>本机数据暂时无法打开</h1><p>${esc(e.message)}</p><p>请检查是否使用隐私模式、设备存储是否已满。为避免丢失数据，应用不会自动清空或覆盖数据库。</p><button class="secondary" onclick="location.reload()">重试打开</button><a class="secondary" href="./repair.html">启动帮助</a></section>`;}
  if('serviceWorker' in navigator){try{await navigator.serviceWorker.register('./sw.js',{scope:'./',updateViaCache:'none'});await navigator.serviceWorker.ready;$('#offline-status').textContent='● 离线已就绪 · 本机保存';}catch{$('#offline-status').textContent='离线缓存未就绪 · 请联网重试';}}
  else $('#offline-status').textContent='此浏览器不支持离线安装';
}
initialize();
