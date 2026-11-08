import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';

test('the complete app starts and claims without external styles or module requests',async({page,context})=>{
 await context.route(/\/(app|engine|storage)\.js|\/style\.css/,route=>route.abort());
 await page.goto('/index.html?source=installed');await expect(page.locator('#start-draw')).toBeVisible();
 await page.locator('#start-draw').click();await expect(page.locator('#claim')).toBeVisible();await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();
});

test('only the cached HTML is sufficient for a cold offline launch with missing directory entry',async({page,context})=>{
 await page.goto('/');await expect(page.locator('#offline-status')).toContainText('离线已就绪');
 await page.evaluate(async()=>{for(const key of await caches.keys()){const cache=await caches.open(key);for(const r of await cache.keys())if(!new URL(r.url).pathname.endsWith('/index.html'))await cache.delete(r);}});
 await context.setOffline(true);
 await page.goto('/?source=installed&launch=missing-root');await expect(page.locator('#start-draw')).toBeVisible();
 await page.locator('#start-draw').click();await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();
 await page.reload();await expect(page.locator('#next-customer')).toBeVisible();
});

test('older Chrome runtime APIs have compatible startup fallbacks',async({page})=>{
 await page.addInitScript(()=>{window.structuredClone=undefined;Array.prototype.at=undefined;Object.defineProperty(crypto,'randomUUID',{value:undefined,configurable:true,writable:true});});
 await page.goto('/');await expect(page.locator('#start-draw')).toBeVisible();await page.locator('#start-draw').click();await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();
});

test('stalled database startup shows recovery without resetting data or enabling draws',async({page})=>{
 await page.addInitScript(()=>{indexedDB.open=()=>({});});
 await page.clock.install();await page.goto('/');await page.clock.runFor(8500);
 await expect(page.getByRole('heading',{name:'启动还未完成'})).toBeVisible();await expect(page.getByRole('link',{name:'打开启动帮助'})).toBeVisible();await expect(page.locator('#start-draw')).toHaveCount(0);
});

test('safe repair upgrades the original worker and preserves settings, records, ledger and ticket',async({page,context})=>{
 const legacy=await readFile(new URL('../fixtures/sw-v1.js',import.meta.url),'utf8');
 await context.route('**/sw.js',route=>route.fulfill({contentType:'text/javascript',body:legacy}));
 await page.goto('/');await expect(page.locator('#offline-status')).toContainText('离线已就绪');
 await page.locator('#start-draw').click();await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();
 const before=await page.evaluate(async()=>{const {repository}=await import('./storage.js');const s=await repository.read('live');s.prizes[0].total=7;await repository.execute('live',{type:'settings',expectedRevision:s.settingsRevision,prizes:s.prizes});return repository.read('live');});
 await context.unroute('**/sw.js');
 await page.goto('/repair.html');await page.locator('#update').click();await expect(page.locator('#next-customer')).toBeVisible({timeout:35000});
 const after=await page.evaluate(async()=>(await import('./storage.js')).repository.read('live'));
 for(const key of ['prizes','records','ledger','session'])expect(after[key]).toEqual(before[key]);
 expect(await page.evaluate(()=>caches.keys())).toContain('bean-shell-v1.0.2');expect(await page.evaluate(()=>caches.keys())).not.toContain('bean-shell-v1.0.0');
 await context.setOffline(true);await page.goto('/?old-installed-launch');await expect(page.locator('#next-customer')).toBeVisible();
});

test('browser-only entry shares stock and records, remains browser-only offline, supports full screen',async({page,context})=>{
 await page.goto('/');await expect(page.locator('#start-draw')).toBeVisible();
 await page.locator('#start-draw').click();await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();
 const before=await page.evaluate(async()=>(await import('./storage.js')).repository.read('live'));
 await expect(page.locator('#offline-status')).toContainText('离线已就绪');
 await page.goto('/browser.html');await expect(page.locator('#next-customer')).toBeVisible();await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);await expect(page).toHaveTitle('不务正豆·浏览器兼容版');
 const after=await page.evaluate(async()=>(await import('./storage.js')).repository.read('live'));
 for(const key of ['prizes','records','ledger','session'])expect(after[key]).toEqual(before[key]);
 await page.locator('#fullscreen').click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(true);await page.locator('#fullscreen').click();await expect.poll(()=>page.evaluate(()=>!!document.fullscreenElement)).toBe(false);
 await context.setOffline(true);await page.reload();await expect(page.locator('#next-customer')).toBeVisible();await expect(page.locator('link[rel="manifest"]')).toHaveCount(0);await expect(page.locator('#install')).toBeHidden();
});

test('compatibility enable link upgrades a legacy worker and routes to browser mode preserving pending draw',async({page,context})=>{
 const legacy=await readFile(new URL('../fixtures/sw-v1.js',import.meta.url),'utf8');
 await context.route('**/sw.js',route=>route.fulfill({contentType:'text/javascript',body:legacy}));
 await page.goto('/');await expect(page.locator('#offline-status')).toContainText('离线已就绪');await page.locator('#start-draw').click();await expect(page.locator('#claim')).toBeVisible();
 const ticket=await page.evaluate(async()=>(await (await import('./storage.js')).repository.read('live')).session);
 await context.unroute('**/sw.js');await page.goto('/repair.html?mode=browser');await page.getByRole('button',{name:'启用兼容版'}).click();
 await expect(page).toHaveURL(/browser\.html$/,{timeout:35000});await expect(page.locator('#claim')).toBeVisible();
 const restored=await page.evaluate(async()=>(await (await import('./storage.js')).repository.read('live')).session);expect(restored).toEqual(ticket);
 await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();
});
