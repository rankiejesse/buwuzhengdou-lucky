import {test,expect} from '@playwright/test';
async function open(page){await page.goto('/');await expect(page.locator('#start-draw')).toBeVisible();}
async function nav(page,name){const b=page.getByRole('navigation').getByRole('button',{name,exact:true});await b.click();await expect(b).toHaveClass(/active/);}
async function seedOwner(page){await page.evaluate(async()=>{const {security}=await import('./storage.js');if(!(await security.info()).configured)await security.setup('2468',[{question:'自定义问题甲',answer:'豆苗'},{question:'备用问题乙',answer:'Lucky Bean'}]);});}
async function raw(page,key='live'){return page.evaluate(async key=>(await import('./storage.js')).repository.read(key),key);}
async function submit(page){await page.locator('#owner-submit').click();await expect(page.locator('#owner-form')).not.toBeVisible();}
async function unlock(page,password='2468'){await page.locator('#unlock-settings').click();await page.locator('#owner-password').fill(password);await submit(page);}
async function claim(page){await page.locator('#start-draw').click();await page.locator('#claim').click();await expect(page.locator('#next-customer')).toBeVisible();}
async function next(page){await page.locator('#next-customer').click();await page.locator('#ok-modal').click();await expect(page.locator('#start-draw')).toBeVisible();}

test('owner setup, locked probability/stock edits, password change and choice of custom recovery question',async({page})=>{
 await open(page);await nav(page,'奖池设置');await expect(page.getByLabel('9折概率',{exact:true})).toBeDisabled();
 await page.locator('#setup-owner').click();await page.locator('#new-password').fill('2468');await page.locator('#repeat-password').fill('2468');
 await page.locator('.question-text').fill('首次种的植物？');await page.locator('.question-answer').fill('豆苗');await page.locator('#add-question').click();
 await page.locator('.question-text').nth(1).fill('备用暗号？');await page.locator('.question-answer').nth(1).fill('Lucky Bean');await submit(page);
 await expect(page.getByLabel('9折概率',{exact:true})).toBeEnabled();await page.getByLabel('9折概率',{exact:true}).fill('19.5');await page.getByLabel('8折概率',{exact:true}).fill('10.5');await page.getByLabel('9折周库存',{exact:true}).fill('3');
 await page.locator('#save-settings').click();await page.locator('#ok-modal').click();await expect(page.getByLabel('9折概率',{exact:true})).toBeDisabled();expect((await raw(page)).prizes[0].weekly).toBe(3);
 await page.locator('#unlock-settings').click();await page.locator('#owner-password').fill('wrong');await page.locator('#owner-submit').click();await expect(page.locator('#owner-error')).toContainText('不正确');await page.locator('#owner-cancel').click();await expect(page.getByLabel('9折概率',{exact:true})).toBeDisabled();
 await page.locator('#change-password').click();await page.locator('#old-password').fill('2468');await page.locator('#new-password').fill('1357');await page.locator('#repeat-password').fill('1357');await submit(page);
 await page.locator('#reset-password').click();await expect(page.locator('#reset-question option')).toHaveCount(2);await page.locator('#reset-answer').fill('Lucky Bean');await page.locator('#new-password').fill('8642');await page.locator('#repeat-password').fill('8642');await page.locator('#owner-submit').click();await expect(page.locator('#owner-error')).toContainText('答案不正确');
 await page.locator('#reset-question').selectOption({index:1});await page.locator('#reset-answer').fill('  LUCKY BEAN  ');await submit(page);await unlock(page,'8642');
 await expect(page.getByLabel('9折周库存',{exact:true})).toBeEnabled();await page.setViewportSize({width:1280,height:850});await page.screenshot({path:'artifacts/owner-settings.png',fullPage:true});
 const secrecy=await page.evaluate(async()=>{const {openStore,repository}=await import('./storage.js');const db=await openStore();const secret=await new Promise(resolve=>{const r=db.transaction('states').objectStore('states').get('__owner_security');r.onsuccess=()=>resolve(r.result);});return {secret:JSON.stringify(secret),backup:JSON.stringify((await import('./engine.js')).backup(await repository.read('live')))};});
 for(const value of ['2468','1357','8642','Lucky Bean','豆苗'])expect(secrecy.secret).not.toContain(value);expect(secrecy.backup).not.toContain('passwordHash');expect(secrecy.backup).not.toContain('answerHash');
});

test('repository requires single-use authorization, revokes across password changes, persists failed-attempt lock',async({page,context})=>{
 await open(page);await seedOwner(page);
 const first=await page.evaluate(async()=>{const {repository,security}=await import('./storage.js');const s=await repository.read('live');let denied=false,reused=false;try{await repository.execute('live',{type:'settings',prizes:s.prizes,expectedRevision:s.settingsRevision});}catch{denied=true;}
 const token=await security.authorize('2468');await repository.execute('live',{type:'settings',prizes:s.prizes,expectedRevision:s.settingsRevision,authorization:token});try{await repository.execute('live',{type:'defaults',authorization:token});}catch{reused=true;}return {denied,reused,stale:await security.authorize('2468')};});
 expect(first.denied).toBe(true);expect(first.reused).toBe(true);
 const other=await context.newPage();await other.goto('/');await other.evaluate(async()=>{await (await import('./storage.js')).security.changePassword('2468','1357');});
 expect(await page.evaluate(async token=>{try{await (await import('./storage.js')).repository.execute('live',{type:'defaults',authorization:token});return false;}catch{return true;}},first.stale)).toBe(true);
 const lock=await page.evaluate(async()=>{const {security}=await import('./storage.js');for(let i=0;i<5;i++)try{await security.authorize('wrong');}catch{}return security.info();});expect(lock.lockUntil).toBeGreaterThan(Date.now());
 await page.reload();expect(await page.evaluate(async()=>{try{await (await import('./storage.js')).security.authorize('1357');return false;}catch(e){return e.message.includes('秒后');}})).toBe(true);
 await page.clock.setFixedTime(new Date(lock.lockUntil+1000));expect(await page.evaluate(async()=>!!await (await import('./storage.js')).security.authorize('1357'))).toBe(true);
});

test('temporary week/month restock respects other limits and expires at natural cycle reset',async({page})=>{
 await page.clock.setFixedTime(new Date('2026-11-09T04:00:00Z'));await open(page);await seedOwner(page);
 await page.evaluate(async()=>{const {repository,security}=await import('./storage.js');const s=await repository.read('live');for(const p of s.prizes)p.probability=p.id==='p09'?100:0;s.prizes[0].weekly=0;s.prizes[0].monthly=0;s.prizes[0].daily=2;await repository.execute('live',{type:'settings',prizes:s.prizes,expectedRevision:s.settingsRevision,authorization:await security.authorize('2468')});});
 await nav(page,'奖池设置');
 for(const period of ['weekly','monthly']){await page.locator('#add-topup').click();await page.locator('#topup-period').selectOption(period);await page.locator('#topup-quantity').fill('5');await page.locator('#topup-password').fill('2468');if(period==='monthly')await expect(page.locator('#topup-expiry')).toContainText('12/01');await submit(page);}
 await nav(page,'幸运抽奖');await claim(page);await next(page);await claim(page);await next(page);await expect(page.locator('#start-draw')).toBeDisabled();
 await page.clock.setFixedTime(new Date('2026-11-10T04:00:00Z'));await page.reload();await expect(page.locator('#start-draw')).toBeEnabled();
 await page.clock.setFixedTime(new Date('2026-11-15T16:00:01Z'));await page.reload();await expect(page.locator('#start-draw')).toBeDisabled();expect((await raw(page)).records).toHaveLength(2);
 const limits=await page.evaluate(async()=>{const s=await (await import('./storage.js')).repository.read('live');return (await import('./engine.js')).effectiveLimits(s,s.prizes[0]);});expect(limits.weekly).toBe(0);expect(limits.monthly).toBe(5);
 await nav(page,'奖池设置');await expect(page.locator('tr').filter({hasText:'本周'})).toContainText('已到期');
});

test('one-confirmation full clear removes business data in both modes but preserves configuration and security',async({page})=>{
 await open(page);await seedOwner(page);
 await page.evaluate(async()=>{const {repository,security}=await import('./storage.js');for(const key of ['live','sandbox']){const s=await repository.read(key);s.prizes[0].weekly=7;await repository.execute(key,{type:'settings',prizes:s.prizes,expectedRevision:s.settingsRevision,authorization:await security.authorize('2468')});await repository.execute(key,{type:'topup',prizeId:'p09',period:'weekly',quantity:2,authorization:await security.authorize('2468')});const ticket=await repository.execute(key,{type:'draw'});await repository.execute(key,{type:'claim',id:ticket.id});}});
 await nav(page,'奖池设置');await page.locator('#clear-all-data').click();await expect(page.locator('#dialog')).toBeVisible();await page.locator('#ok-modal').click();await expect(page.locator('#dialog')).not.toBeVisible();await expect(page.getByRole('status')).toContainText('已清除');
 for(const key of ['live','sandbox']){const s=await raw(page,key);expect(s.records).toHaveLength(0);expect(s.ledger).toHaveLength(0);expect(s.topups).toHaveLength(0);expect(s.session).toBeNull();expect(s.prizes[0].weekly).toBe(7);}
 expect(await page.evaluate(async()=>{const {security}=await import('./storage.js');return {info:await security.info(),authorized:!!await security.authorize('2468')};})).toMatchObject({info:{configured:true,questions:[{question:'自定义问题甲'},{question:'备用问题乙'}]},authorized:true});
 await expect(page.getByLabel('9折概率',{exact:true})).toBeDisabled();
});

test('old installed data migrates in place, and import cannot replace the device owner password',async({page})=>{
 await open(page);await seedOwner(page);
 await page.evaluate(async()=>{const {transact}=await import('./storage.js');const e=await import('./engine.js');let s=e.fresh();s=e.command(s,{type:'draw'}).state;s=e.command(s,{type:'claim',id:s.session.id}).state;s.schema=1;delete s.topups;s.prizes=s.prizes.map(({weekly,...p})=>({...p,total:p.id==='p09'?9:null}));await transact('live',()=>({state:s}));});
 await page.reload();const migrated=await raw(page);expect(migrated.schema).toBe(2);expect(migrated.prizes[0].weekly).toBe(9);expect(migrated.records).toHaveLength(1);
 await nav(page,'奖池设置');await expect(page.getByText('旧版“总库存”数值已转为“每周库存上限”',{exact:false})).toBeVisible();
 const result=await page.evaluate(async()=>{const {repository,security}=await import('./storage.js');const e=await import('./engine.js');const before=await security.info();await repository.replace('live',e.backup(await repository.read('live')),await security.authorize('2468'));return {before,after:await security.info(),authorized:!!await security.authorize('2468')};});expect(result.after.questions).toEqual(result.before.questions);expect(result.authorized).toBe(true);
});

test('database upgrade closes old clients and refuses v1 code without deleting its existing state',async({page})=>{
 await page.addInitScript(()=>{
   const request=indexedDB.open('buwuzhengdou-lucky-v1',1);
   request.onupgradeneeded=()=>{const store=request.result.objectStoreNames.contains('states')?request.transaction.objectStore('states'):request.result.createObjectStore('states');store.put({marker:'legacy-data'},'legacy-marker');};
   request.onsuccess=()=>{request.result.onversionchange=()=>{window.__oldClientClosed=true;request.result.close();};};
 });
 await open(page);expect(await page.evaluate(()=>window.__oldClientClosed)).toBe(true);
 const result=await page.evaluate(()=>new Promise(resolve=>{const r=indexedDB.open('buwuzhengdou-lucky-v1',1);r.onerror=()=>resolve(r.error.name);r.onsuccess=()=>{r.result.close();resolve('opened');};}));expect(result).toBe('VersionError');expect((await raw(page)).schema).toBe(2);
 expect(await page.evaluate(async()=>{const db=await (await import('./storage.js')).openStore();return new Promise(resolve=>{const r=db.transaction('states').objectStore('states').get('legacy-marker');r.onsuccess=()=>resolve(r.result.marker);});})).toBe('legacy-data');
});
