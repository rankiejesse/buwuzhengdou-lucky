import {test,expect} from '@playwright/test';
const nav=async(p,id)=>{await p.locator(`[data-page=${id}]`).click();};
const submit=async p=>{await p.locator('#owner-submit').click();await expect(p.locator('#owner-form')).not.toBeVisible();};
const read=async p=>p.evaluate(async()=>(await import('./storage.js')).repository.read('live'));
async function income(p){await nav(p,'income');await p.locator('#register-income').click();await p.locator('#cash-initial').fill('100');await p.locator('#cash-remaining').fill('200');await p.locator('#income-wechat').fill('600');await p.locator('#income-alipay').fill('300');await submit(p);}
async function book(p,name,basis='fixed',limit='1000'){await p.locator('#add-book').click();await p.locator('#book-name').fill(name);await p.locator('#book-basis').selectOption(basis);await p.locator(basis==='fixed'?'#book-limit':'#book-percent').fill(limit);await submit(p);}
async function category(p){await p.locator('#add-category').click();await p.locator('#category-name').fill('材料');await submit(p);}
test('daily registration, original time, calendar date edit, history, full backup and persistence offline',async({page,context})=>{
 await page.clock.setFixedTime(new Date('2026-11-10T08:00:00Z'));await page.goto('/');await income(page);let state=await read(page);const at=state.workbench.incomes[0].registeredAt;expect(state.workbench.incomes[0].date).toBe('2026-11-10');
 await page.clock.setFixedTime(new Date('2026-11-10T09:00:00Z'));await page.locator('#register-income').click();await page.locator('#income-wechat').fill('601');await submit(page);expect((await read(page)).workbench.incomes[0].registeredAt).toBe(at);
 await page.locator('#register-income').click();await page.locator('#income-time').fill('2026-11-09T12:30:00');await submit(page);expect((await read(page)).workbench.incomes[0].date).toBe('2026-11-09');
 const wb=await page.evaluate(async()=>{const {backup,validateBackup}=await import('./engine.js');const {repository}=await import('./storage.js');return validateBackup(JSON.parse(JSON.stringify(backup(await repository.read('live'))))).workbench;});expect(wb.incomes).toHaveLength(1);
 await expect(page.locator('#offline-status')).toContainText('离线已就绪');await page.evaluate(()=>navigator.serviceWorker.ready);await context.setOffline(true);await page.reload();await nav(page,'income');await expect(page.locator('#income-history')).toContainText('2026-11-09');await expect(page.locator('#income-history')).toContainText('1,001.00');
 await page.setViewportSize({width:412,height:915});await page.screenshot({path:'artifacts/workbench-income-phone.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('budget category and todo UI, purchase impacts another book, confirmation deletes and restores allocation',async({page})=>{
 await page.goto('/');await income(page);await nav(page,'budget');await book(page,'共享月预算','month','50');await book(page,'设备本');
 await page.locator('[data-book]').filter({hasText:'设备本'}).click();await category(page);await page.locator('[data-add-item]').click();await page.locator('#item-name').fill('新设备');await page.locator('#item-planned').fill('300');await submit(page);
 expect((await read(page)).workbench.books[1].categories[0].items[0].paid).toBe(false);await page.locator('[data-toggle-item]').click();await expect(page.locator('#item-actual')).toHaveValue('300.00');await page.locator('#item-actual').fill('200');await submit(page);
 await page.locator('#back-books').click();await expect(page.locator('[data-book]').filter({hasText:'共享月预算'})).toContainText('300.00');
 await page.locator('[data-book]').filter({hasText:'共享月预算'}).click();await category(page);await page.locator('[data-add-item]').click();await page.locator('#item-name').fill('耗材');await page.locator('#item-planned').fill('120');await page.locator('#item-actual').fill('100');await page.locator('#item-paid').check();await submit(page);await expect(page.locator('.money-grid').first()).toContainText('200.00');
 await page.setViewportSize({width:1280,height:800});await page.screenshot({path:'artifacts/workbench-budget-tablet.png',fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.swipe-row').hover();await page.locator('[data-delete=itemDelete]').click();await expect(page.locator('#dialog')).toContainText('确认删除');await page.locator('#ok-modal').click();await expect(page.locator('.money-grid').first()).toContainText('300.00');
 await nav(page,'data');await page.locator('#export-data').click();const state=await read(page);expect(state.workbench.books).toHaveLength(2);
});
test('Chinese is default on English tablet, system language can switch and persist without changing user content',async({browser})=>{
 const context=await browser.newContext({locale:'en-US'}),page=await context.newPage();await page.goto('/');await expect(page.locator('[data-page=income]')).toContainText('每日收支');await nav(page,'settings');await page.locator('#app-language').selectOption('system');await expect(page.locator('[data-page=income]')).toContainText('Daily income');await expect(page.locator('html')).toHaveAttribute('lang','en');
 await page.reload();await expect(page.locator('[data-page=budget]')).toContainText('Budget pool');await nav(page,'settings');await page.locator('#app-language').selectOption('zh-CN');await expect(page.locator('[data-page=income]')).toContainText('每日收支');await expect(page.locator('html')).toHaveAttribute('lang','zh-CN');await context.close();
});
test('touch swipe reveals trash without opening edit dialog; cancel delete keeps record',async({browser})=>{
 const context=await browser.newContext({hasTouch:true,viewport:{width:412,height:915}}),page=await context.newPage();await page.goto('/');await income(page);
 await page.locator('.swipe-front').evaluate(el=>{el.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',clientX:280,clientY:30}));el.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',clientX:100,clientY:30}));el.querySelector('button').click();});
 await expect(page.locator('.swipe-row')).toHaveClass(/revealed/);await expect(page.locator('#dialog')).not.toBeVisible();await page.locator('[data-delete=incomeDelete]').click();await page.locator('#cancel-modal').click();expect((await read(page)).workbench.incomes).toHaveLength(1);await context.close();
});
