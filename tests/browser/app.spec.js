import {test,expect,chromium,devices} from '@playwright/test';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
async function ready(page){await page.goto('/');await expect(page.getByRole('button',{name:'开始抽奖'})).toBeVisible();await page.evaluate(async()=>{const {security}=await import('./storage.js');if(!(await security.info()).configured)await security.setup('2468',[{question:'测试暗号',answer:'豆'}]);});}
async function ownerPassword(page){await expect(page.locator('#owner-password')).toBeVisible();await page.locator('#owner-password').fill('2468');await page.locator('#owner-submit').click();await expect(page.locator('#owner-form')).not.toBeVisible();}
async function unlock(page){await page.locator('#unlock-settings').click();await ownerPassword(page);await expect(page.getByLabel('9折概率',{exact:true})).toBeEnabled();}
async function nav(page,name){const b=page.getByRole('navigation').getByRole('button',{name,exact:true});await b.click();await expect(b).toHaveClass(/active/);}
async function confirm(page,name='确认'){await page.locator('dialog').getByRole('button',{name,exact:true}).click();}
async function raw(page,key='live'){return page.evaluate(async key=>(await import('./storage.js')).repository.read(key),key);}
async function draw(page){await page.getByRole('button',{name:'开始抽奖'}).click();await expect(page.locator('#claim')).toBeVisible();}
async function next(page){await page.locator('#next-customer').click();await confirm(page,'确认 · 下一位');await expect(page.getByRole('button',{name:'开始抽奖'})).toBeVisible();}
async function seed(page,fn){await page.evaluate(fn);await page.reload();}

test('tablet landscape and phone portrait show usable complete app without horizontal body overflow',async({page})=>{
 await page.setViewportSize({width:1280,height:800});await ready(page);
 await page.screenshot({path:'artifacts/tablet.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/phone.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
 const b=await page.locator('#start-draw').boundingBox();expect(b.height).toBeGreaterThan(44);expect(b.width).toBeGreaterThan(180);
 for(const name of ['今日中奖查询','库存看板','奖池设置','数据管理']){await nav(page,name);await expect(page.locator('main h1')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();}
});

test('pending survives reload; rapid clicks and concurrent tabs issue only once; reopen persists',async({page,context})=>{
 await ready(page);await page.locator('#start-draw').evaluate(b=>{b.click();b.click();b.click();});
 await expect(page.locator('#claim')).toBeVisible();const pending=await raw(page);expect(pending.records).toHaveLength(0);
 await page.reload();await expect(page.locator('#claim')).toBeVisible();
 const second=await context.newPage();await second.goto('/');await expect(second.locator('#claim')).toBeVisible();
 await Promise.all([page.locator('#claim').evaluate(b=>{b.click();b.click();}),second.locator('#claim').evaluate(b=>b.click())]);
 await expect.poll(async()=>(await raw(page)).records.length).toBe(1);
 let s=await raw(page);expect(s.ledger).toHaveLength(1);expect(s.session.status).toBe('claimed');
 await page.close();await second.close();const reopened=await context.newPage();await reopened.goto('/');await expect(reopened.locator('#next-customer')).toBeVisible();s=await raw(reopened);expect(s.records).toHaveLength(1);expect(s.ledger).toHaveLength(1);
 await nav(reopened,'库存看板');await expect(reopened.locator('table tbody tr').filter({has:reopened.getByText(s.records[0].name,{exact:true})}).locator('td').nth(2)).toHaveText('1');
});

test('abandon has no stock or record, persists lock after reload, supervised next still works',async({page})=>{
 await ready(page);await draw(page);await page.locator('#abandon').click();await confirm(page,'确认放弃');await expect(page.locator('#next-customer')).toBeVisible();
 let s=await raw(page);expect(s.records).toHaveLength(0);expect(s.ledger).toHaveLength(0);expect(s.session.status).toBe('abandoned');
 await page.reload();await expect(page.locator('#next-customer')).toBeVisible();await expect(page.locator('#start-draw')).toHaveCount(0);
 await next(page);await draw(page);await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();expect((await raw(page)).records).toHaveLength(1);
});

test('settings decimals, sum validation, zero inventory and preserving defaults/history',async({page})=>{
 await ready(page);await nav(page,'奖池设置');await expect(page.locator('tbody tr')).toHaveCount(10);await unlock(page);
 await page.getByLabel('9折概率',{exact:true}).fill('19.25');await expect(page.locator('#save-settings')).toBeDisabled();await expect(page.locator('#prob-sum')).toContainText('99.25%');
 await page.getByLabel('8折概率',{exact:true}).fill('10.75');await expect(page.locator('#save-settings')).toBeEnabled();
 for(const p of ['9折','8折','7折','6折','5折','减3元','减2元','减1元','时段卡一张','全天卡一张'])await page.getByLabel(p+'周库存',{exact:true}).fill('0');
 await page.locator('#save-settings').click();await confirm(page,'确认保存');await expect(page.getByRole('status')).toContainText('保存成功');
 await page.reload();expect((await raw(page)).prizes[0].probability).toBe(19.25);
 await expect(page.locator('#start-draw')).toBeDisabled();await expect(page.locator('#start-draw')).toContainText('奖池暂时休息');
 await nav(page,'奖池设置');await page.locator('#restore-defaults').click();await confirm(page,'恢复默认');await ownerPassword(page);await expect(page.locator('#prob-sum')).toContainText('100%');expect((await raw(page)).prizes[0].probability).toBe(20);
});

test('sandbox forced ten prizes and depleted stock are isolated from live',async({page})=>{
 await ready(page);await nav(page,'奖池设置');await page.locator('#toggle-test').click();await confirm(page,'进入测试');await expect(page.locator('#test-banner')).toBeVisible();
 await unlock(page);
 await page.getByLabel('9折周库存',{exact:true}).fill('1');await page.locator('#save-settings').click();await confirm(page,'确认保存');await expect(page.getByRole('status')).toContainText('保存成功');
 await nav(page,'幸运抽奖');
 for(const [id,name] of [['p09','9折'],['p08','8折'],['p07','7折'],['p06','6折'],['p05','5折'],['m03','减3元'],['m02','减2元'],['m01','减1元'],['slot','时段卡一张'],['day','全天卡一张']]){
   await page.locator('#force-prize').selectOption(id);await draw(page);await expect(page.locator('.dialog-prize')).toHaveText(name);await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();await next(page);
 }
 await page.locator('#force-prize').selectOption('p09');await page.locator('#start-draw').click();await expect(page.getByRole('status')).toContainText('已暂停');
 expect((await raw(page,'sandbox')).records).toHaveLength(10);expect((await raw(page,'live')).records).toHaveLength(0);expect((await raw(page,'live')).ledger).toHaveLength(0);
 await page.locator('#exit-test').click();await confirm(page,'返回正式');await expect(page.locator('#test-banner')).toBeHidden();expect((await raw(page)).prizes[0].weekly).toBeNull();
});

test('JSON export/import uses owner password and one-confirmation history clear preserves ledger',async({page})=>{
 await ready(page);await draw(page);await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();await nav(page,'数据管理');
 const downloading=page.waitForEvent('download');await page.locator('#export-data').click();const download=await downloading;const downloadPath=await download.path();
 const saved=await raw(page);expect(saved.records).toHaveLength(1);
 await page.locator('#clear-records').click();await confirm(page,'确认清空');
 await expect.poll(async()=>(await raw(page)).records.length).toBe(0);expect((await raw(page)).ledger).toHaveLength(1);
 await page.locator('#import-file').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from('{"format":"bad"}')});await expect(page.getByRole('status')).toContainText('备份');expect((await raw(page)).records).toHaveLength(0);
 await page.locator('#import-file').setInputFiles(downloadPath);await confirm(page,'确认替换数据');await ownerPassword(page);await expect.poll(async()=>(await raw(page)).records.length).toBe(1);expect((await raw(page)).ledger).toHaveLength(1);expect((await raw(page)).session).toBeNull();
});

test('records sort ascending, category filter, history and midnight rollover',async({page})=>{
 await ready(page);await seed(page,async()=>{
   const {repository,security}=await import('./storage.js');const {fresh,command}=await import('./engine.js');let s=fresh();
   for(const [at,r] of [['2026-11-08T04:00:00Z',.1],['2026-11-08T01:00:00Z',.8],['2026-11-07T06:00:00Z',.995]]){
     s=command(s,{type:'draw'},Date.parse(at),()=>r).state;s=command(s,{type:'claim',id:s.session.id},Date.parse(at)).state;s=command(s,{type:'next'},Date.parse(at)).state;
   }await repository.replace('live',{format:'buwuzhengdou-backup',version:2,state:s},await security.authorize('2468'));
 });
 await page.clock.install({time:new Date('2026-11-08T08:00:00Z')});await nav(page,'今日中奖查询');await expect(page.locator('tbody tr')).toHaveCount(2);
 await expect(page.locator('tbody tr').first()).toContainText('09:00:00');await expect(page.locator('tbody tr').last()).toContainText('12:00:00');
 await page.locator('#category').selectOption('立减');await expect(page.locator('tbody tr')).toHaveCount(1);await expect(page.locator('tbody tr')).toContainText('减1元');
 await page.locator('#category').selectOption('');await page.locator('#record-date').fill('2026-11-07');await expect(page.locator('tbody tr')).toContainText('全天卡一张');
 await page.locator('#go-today').click();await page.clock.setSystemTime(new Date('2026-11-08T16:00:01Z'));await page.clock.runFor(1100);await expect(page.locator('#record-date')).toHaveValue('2026-11-09');await expect(page.locator('.empty')).toBeVisible();
 expect((await raw(page)).records).toHaveLength(3);
});

test('offline reload and new page preserve app and allow real claim, scoped PWA assets',async({page,context})=>{
 await ready(page);await expect(page.locator('#offline-status')).toContainText('离线已就绪');
 await page.evaluate(()=>navigator.serviceWorker.ready);await page.reload();await context.setOffline(true);await page.reload();await expect(page.locator('#start-draw')).toBeVisible();
 await draw(page);await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();expect((await raw(page)).records).toHaveLength(1);
 const offline=await context.newPage();await offline.goto('/');await expect(offline.locator('#next-customer')).toBeVisible();await expect(offline.locator('#connection')).toContainText('离线');
 const manifest=await offline.evaluate(async()=>await (await fetch('./manifest.webmanifest')).json());expect(manifest.display).toBe('standalone');expect(manifest.id).toBe('./');expect(manifest.start_url).toBe('./index.html?source=installed');
 await context.setOffline(false);
});

test('concurrent settings modification rejected instead of silent overwrite',async({page,context})=>{
 await ready(page);await nav(page,'奖池设置');await unlock(page);await page.getByLabel('9折周库存',{exact:true}).fill('5');
 const other=await context.newPage();await other.goto('/');await nav(other,'奖池设置');await unlock(other);await other.getByLabel('9折周库存',{exact:true}).fill('10');await other.locator('#save-settings').click();await confirm(other,'确认保存');
 await expect(other.getByRole('status')).toContainText('保存成功');await page.locator('#save-settings').click();await confirm(page,'确认保存');await expect(page.getByRole('status')).toContainText('另一页面已修改');expect((await raw(page)).prizes[0].weekly).toBe(10);
});

test('Android touch emulation: responsive navigation, draw, claim and result',async({browser})=>{
 const context=await browser.newContext({...devices['Pixel 7'],timezoneId:'Asia/Shanghai',locale:'zh-CN'});
 const page=await context.newPage();await page.goto('http://localhost:4173');await expect(page.locator('#start-draw')).toBeVisible();
 expect(await page.evaluate(()=>navigator.maxTouchPoints)).toBeGreaterThan(0);
 for(const name of ['今日中奖查询','库存看板','奖池设置','数据管理','幸运抽奖']){await page.getByRole('navigation').getByRole('button',{name,exact:true}).tap();await expect(page.getByRole('navigation').getByRole('button',{name,exact:true})).toHaveClass(/active/);}
 await page.locator('#start-draw').tap();await expect(page.locator('#claim')).toBeVisible();await page.screenshot({path:'artifacts/android-result.png',fullPage:true});
 await page.locator('#claim').tap();await expect(page.locator('#next-customer')).toBeVisible();expect((await raw(page)).records).toHaveLength(1);await context.close();
});

test('full browser process closes and reopens offline with stock and records persisted',async()=>{
 const profile=await mkdtemp(join(tmpdir(),'bean-pwa-test-'));let context;
 try{
   context=await chromium.launchPersistentContext(profile,{headless:true,timezoneId:'Asia/Shanghai'});
   let page=await context.newPage();await page.goto('http://localhost:4173');await expect(page.locator('#offline-status')).toContainText('离线已就绪');
   await draw(page);await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();const before=await raw(page);await context.close();
   context=await chromium.launchPersistentContext(profile,{headless:true,timezoneId:'Asia/Shanghai'});await context.setOffline(true);
   page=await context.newPage();await page.goto('http://localhost:4173');await expect(page.locator('#next-customer')).toBeVisible();const after=await raw(page);
   expect(after.records).toEqual(before.records);expect(after.ledger).toEqual(before.ledger);expect(after.prizes).toEqual(before.prizes);
 }finally{await context?.close();await rm(profile,{recursive:true,force:true});}
});
