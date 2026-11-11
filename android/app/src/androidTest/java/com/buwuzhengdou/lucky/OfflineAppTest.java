package com.buwuzhengdou.lucky;

import android.content.pm.PackageInfo;
import android.os.SystemClock;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.*;
import org.junit.*;
import org.junit.runner.RunWith;
import org.json.*;
import java.util.Arrays;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Pattern;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class OfflineAppTest {
    ActivityScenario<MainActivity> scenario;
    MainActivity activity;
    UiDevice device;
    @Before public void setup() throws Exception {
        device=UiDevice.getInstance(InstrumentationRegistry.getInstrumentation());
        scenario=ActivityScenario.launch(MainActivity.class);scenario.onActivity(a->activity=a);
        waitJS("window.__beanStarted === true");
        async("const r=await import('./storage.js');const e=await import('./engine.js');await r.transact('live',()=>({state:e.fresh()}));await r.repository.resetSandbox();const db=await r.openStore();await new Promise((resolve,reject)=>{const tx=db.transaction('states','readwrite');tx.objectStore('states').delete('__owner_security');tx.oncomplete=resolve;tx.onabort=reject;});await r.security.setup('2468',[{question:'测试问题',answer:'豆'}]);sessionStorage.setItem('bean-mode','live');return true;");
        reload();
    }
    @After public void close(){if(scenario!=null)scenario.close();}

    Object eval(String script) throws Exception {
        CountDownLatch latch=new CountDownLatch(1);AtomicReference<String> value=new AtomicReference<>();
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->activity.webView.evaluateJavascript(script,result->{value.set(result);latch.countDown();}));
        assertTrue("JavaScript callback timed out",latch.await(10,TimeUnit.SECONDS));
        return new JSONTokener(value.get()==null?"null":value.get()).nextValue();
    }
    void waitJS(String script) throws Exception {
        long deadline=SystemClock.elapsedRealtime()+20000;
        while(SystemClock.elapsedRealtime()<deadline){if(Boolean.TRUE.equals(eval(script)))return;SystemClock.sleep(100);}
        device.executeShellCommand("screencap -p /sdcard/Download/bean-test-failure.png");
        fail("Timed out waiting for "+script+"; layout="+eval("({height:innerHeight,visualHeight:visualViewport.height,active:document.activeElement?.id,dialog:document.querySelector('dialog').getBoundingClientRect().toJSON()})"));
    }
    Object async(String body) throws Exception {
        body=body.replace("import('./storage.js')","import('https://appassets.androidplatform.net/assets/www/storage.js')").replace("import('./engine.js')","import('https://appassets.androidplatform.net/assets/www/engine.js')");
        eval("window.__nativeTest={done:false};(async()=>{try{window.__nativeTest.value=await(async()=>{"+body+"})();}catch(e){window.__nativeTest.error=e.message;}finally{window.__nativeTest.done=true;}})();");
        waitJS("window.__nativeTest && window.__nativeTest.done === true");
        JSONObject result=(JSONObject)eval("window.__nativeTest");assertFalse(result.optString("error"),result.has("error"));return result.opt("value");
    }
    JSONObject state() throws Exception {return (JSONObject)async("return (await import('./storage.js')).repository.read('live');");}
    void reload() throws Exception {
        eval("window.__beanStarted=false");scenario.onActivity(a->a.webView.reload());waitJS("window.__beanStarted===true");
    }
    void tap(String selector) throws Exception {
        String quoted=JSONObject.quote(selector);waitJS("!!document.querySelector("+quoted+")");
        // Mimic dismissing the soft keyboard before tapping non-input controls in long dialogs.
        eval("if(document.activeElement?.matches('input,textarea'))document.activeElement.blur()");
        InstrumentationRegistry.getInstrumentation().runOnMainSync(()->((android.view.inputmethod.InputMethodManager)activity.getSystemService(android.content.Context.INPUT_METHOD_SERVICE)).hideSoftInputFromWindow(activity.webView.getWindowToken(),0));
        SystemClock.sleep(300);
        eval("document.querySelector("+quoted+").scrollIntoView({block:'center'})");SystemClock.sleep(350);
        JSONObject rect=(JSONObject)eval("(()=>{let r=document.querySelector("+quoted+").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth};})()");
        int[] coords=new int[2];int[] width=new int[1];InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{activity.webView.getLocationOnScreen(coords);width[0]=activity.webView.getWidth();});
        double scale=width[0]/rect.getDouble("w");
        System.out.println("tap "+selector+" rect="+rect+" native="+coords[0]+","+coords[1]+" width="+width[0]+" scroll="+eval("({x:scrollX,y:scrollY,dpr:devicePixelRatio,active:document.querySelector('.nav-item.active')?.dataset.page})"));
        assertTrue(device.click(coords[0]+(int)(rect.getDouble("x")*scale),coords[1]+(int)(rect.getDouble("y")*scale)));
    }
    void claim() throws Exception {tap("#start-draw");waitJS("!!document.querySelector('#claim')");tap("#claim");waitJS("!!document.querySelector('#next-customer')");}
    void dataPage() throws Exception {tap("[data-page=data]");waitJS("!!document.querySelector('#export-data')");}

    @Test public void coldOfflineStartAndClaimPersistAfterActivityRecreation() throws Exception {
        PackageInfo info=activity.getPackageManager().getPackageInfo(activity.getPackageName(),android.content.pm.PackageManager.GET_PERMISSIONS);
        assertFalse(info.requestedPermissions!=null&&Arrays.asList(info.requestedPermissions).contains("android.permission.INTERNET"));
        assertEquals("object",eval("typeof BeanAndroid"));assertTrue(String.valueOf(eval("document.querySelector('#offline-status').textContent")).contains("内置离线"));
        async("const {repository:r,security}=await import('./storage.js');const s=await r.read('live');for(const p of s.prizes){p.probability=p.id==='p09'?100:0;}s.prizes[0].weekly=1;s.prizes[0].daily=1;s.prizes[0].monthly=1;await r.execute('live',{type:'settings',prizes:s.prizes,expectedRevision:s.settingsRevision,authorization:await security.authorize('2468')});return true;");reload();
        claim();JSONObject s=state();assertEquals(1,s.getJSONArray("records").length());assertEquals(1,s.getJSONArray("ledger").length());
        scenario.recreate();scenario.onActivity(a->activity=a);waitJS("window.__beanStarted===true");assertEquals(s.getJSONArray("records").toString(),state().getJSONArray("records").toString());
        tap("#next-customer");tap("#ok-modal");waitJS("!!document.querySelector('#start-draw')");assertEquals(Boolean.TRUE,eval("document.querySelector('#start-draw').disabled"));
    }

    @Test public void pendingAndAbandonedTicketsSurviveReloadWithoutIssuing() throws Exception {
        tap("#start-draw");waitJS("!!document.querySelector('#claim')");String ticket=state().getJSONObject("session").getString("id");
        reload();waitJS("!!document.querySelector('#claim')");assertEquals(ticket,state().getJSONObject("session").getString("id"));
        tap("#abandon");tap("#ok-modal");waitJS("!!document.querySelector('#next-customer')");reload();
        assertEquals(0,state().getJSONArray("records").length());assertEquals(0,state().getJSONArray("ledger").length());assertEquals("abandoned",state().getJSONObject("session").getString("status"));
        tap("#next-customer");tap("#ok-modal");waitJS("!!document.querySelector('#start-draw')");assertEquals(Boolean.FALSE,eval("document.querySelector('#start-draw').disabled"));
    }

    @Test public void exportAndImportThroughAndroidDocumentPicker() throws Exception {
        async("await (await import('./storage.js')).repository.execute('live',{type:'workbench:incomeSave',initial:10000,remaining:20000,wechat:60000,alipay:30000});return true;");
        claim();dataPage();tap("#export-data");
        String filename="bean-native-"+System.currentTimeMillis()+".json";
        UiObject2 name=device.wait(Until.findObject(By.clazz("android.widget.EditText")),15000);assertNotNull("Android save dialog",name);name.setText(filename);
        UiObject2 save=device.wait(Until.findObject(By.text(Pattern.compile("(?i)save|保存"))),10000);assertNotNull("Save action",save);save.click();
        assertTrue(device.wait(Until.hasObject(By.pkg(activity.getPackageName())),15000));SystemClock.sleep(1000);
        String saved=device.executeShellCommand("cat /sdcard/Download/"+filename);JSONObject snapshot=new JSONObject(saved);assertEquals(1,snapshot.getJSONObject("state").getJSONArray("records").length());
        async("await (await import('./storage.js')).repository.execute('live',{type:'clearRecords'});return true;");reload();dataPage();tap("#import-data");
        UiObject2 file=device.wait(Until.findObject(By.text(filename)),10000);assertNotNull("Exported backup in Android picker",file);file.click();
        waitJS("!!document.querySelector('#ok-modal')");tap("#ok-modal");waitJS("!!document.querySelector('#owner-password')");eval("document.querySelector('#owner-password').value='2468'");tap("#owner-submit");waitJS("document.querySelector('#toast').textContent.includes('导入成功')");
        assertEquals(1,state().getJSONArray("records").length());assertEquals(1,state().getJSONArray("ledger").length());
        assertEquals(60000,state().getJSONObject("workbench").getJSONArray("incomes").getJSONObject(0).getInt("wechat"));
    }

    @Test public void workbenchIncomeBudgetsAndChineseLocalePersistOffline() throws Exception {
        assertEquals("zh",activity.getResources().getConfiguration().getLocales().get(0).getLanguage());
        tap("[data-page=income]");tap("#register-income");waitJS("!!document.querySelector('#cash-initial')");
        assertEquals("",eval("document.querySelector('#cash-initial').value"));assertEquals("0.00",eval("document.querySelector('#cash-initial').placeholder"));
        eval("document.querySelector('#cash-initial').value='100';document.querySelector('#cash-remaining').value='200';document.querySelector('#income-wechat').value='600';document.querySelector('#income-note').value='安卓备注'");tap("#owner-submit");waitJS("!document.querySelector('dialog').open");
        assertEquals("安卓备注",state().getJSONObject("workbench").getJSONArray("incomes").getJSONObject(0).getString("note"));
        String first=state().getJSONObject("workbench").getJSONArray("incomes").getJSONObject(0).getString("registeredAt");
        tap("#register-income");waitJS("document.querySelector('dialog').open && !!document.querySelector('#cash-remaining')");eval("document.querySelector('#cash-remaining').value='201'");tap("#owner-submit");waitJS("!document.querySelector('dialog').open");
        assertEquals(first,state().getJSONObject("workbench").getJSONArray("incomes").getJSONObject(0).getString("registeredAt"));
        tap("[data-page=budget]");tap("#add-book");waitJS("!!document.querySelector('#book-name')");eval("document.querySelector('#book-name').value='材料预算';document.querySelector('#book-limit').value='500'");tap("#owner-submit");waitJS("!document.querySelector('dialog').open");
        tap("[data-book]");tap("#add-category");waitJS("!!document.querySelector('#category-name')");eval("document.querySelector('#category-name').value='耗材'");tap("#owner-submit");waitJS("!document.querySelector('dialog').open");
        tap("[data-add-item]");waitJS("!!document.querySelector('#item-name')");eval("document.querySelector('#item-name').value='豆子';document.querySelector('#item-planned').value='100';document.querySelector('#item-actual').value='80';document.querySelector('#item-paid').checked=true");tap("#owner-submit");waitJS("!document.querySelector('dialog').open");
        assertTrue(String.valueOf(eval("document.querySelector('.money-grid').textContent")).contains("420.00"));
        tap("[data-toggle-item]");waitJS("!document.querySelector('[data-toggle-item]').checked");assertEquals(Boolean.FALSE,eval("document.querySelector('dialog').open"));
        tap("[data-toggle-item]");waitJS("document.querySelector('[data-toggle-item]').checked && !document.querySelector('[data-toggle-item]').disabled");assertEquals(Boolean.FALSE,eval("document.querySelector('dialog').open"));
        tap(".todo-row .copy-action");waitJS("document.querySelector('#toast').textContent.includes('已复制')");scenario.onActivity(a->{android.content.ClipboardManager clipboard=(android.content.ClipboardManager)a.getSystemService(android.content.Context.CLIPBOARD_SERVICE);assertTrue(clipboard.getPrimaryClip().getItemAt(0).getText().toString().contains("豆子"));});
        tap("[data-edit-item]");waitJS("document.querySelector('dialog').open && !!document.querySelector('#item-actual')");assertEquals("80.00",eval("document.querySelector('#item-actual').value"));tap("#owner-cancel");
        scenario.recreate();scenario.onActivity(a->activity=a);waitJS("window.__beanStarted===true");
        assertEquals(1,state().getJSONObject("workbench").getJSONArray("books").length());assertEquals(20100,state().getJSONObject("workbench").getJSONArray("incomes").getJSONObject(0).getInt("remaining"));
        tap("[data-page=settings]");tap("#clear-all-data");tap("#ok-modal");waitJS("document.querySelector('#toast').textContent.includes('已清除')");assertEquals(1,state().getJSONObject("workbench").getJSONArray("books").length());
    }

    @Test public void ownerPasswordsTemporaryStockRecoveryAndOneConfirmationClear() throws Exception {
        tap("[data-page=settings]");waitJS("!!document.querySelector('#unlock-settings')");
        assertEquals(Boolean.TRUE,eval("document.querySelector('[data-field=weekly]').disabled"));
        tap("#unlock-settings");waitJS("!!document.querySelector('#owner-password')");eval("document.querySelector('#owner-password').value='wrong'");tap("#owner-submit");waitJS("document.querySelector('#owner-error').textContent.includes('不正确')");tap("#owner-cancel");
        tap("#unlock-settings");waitJS("document.querySelector('dialog').open && !!document.querySelector('#owner-password')");eval("document.querySelector('#owner-password').value='2468'");tap("#owner-submit");waitJS("!document.querySelector('[data-field=weekly]').disabled");
        eval("(()=>{const e=document.querySelector('[data-id=p09][data-field=weekly]');e.value='3';e.dispatchEvent(new Event('input',{bubbles:true}));})()");
        tap("#save-settings");tap("#ok-modal");waitJS("document.querySelector('[data-field=weekly]').disabled");assertEquals(3,state().getJSONArray("prizes").getJSONObject(0).getInt("weekly"));
        tap("#add-topup");waitJS("!!document.querySelector('#topup-password')");eval("document.querySelector('#topup-quantity').value='2';document.querySelector('#topup-password').value='2468'");tap("#owner-submit");waitJS("!document.querySelector('dialog').open");assertEquals(1,state().getJSONArray("topups").length());
        tap("#change-questions");waitJS("!!document.querySelector('#old-password')");eval("document.querySelector('#old-password').value='2468';document.querySelector('.question-text').value='自定义第一题';document.querySelector('.question-answer').value='甲'");tap("#add-question");
        waitJS("document.querySelectorAll('.question-text').length===2");eval("document.querySelectorAll('.question-text')[1].value='自定义第二题';document.querySelectorAll('.question-answer')[1].value='Lucky Bean'");tap("#owner-submit");waitJS("!document.querySelector('dialog').open");
        tap("#reset-password");waitJS("!!document.querySelector('#reset-answer')");eval("document.querySelector('#reset-question').selectedIndex=1;document.querySelector('#reset-answer').value='  LUCKY BEAN  ';document.querySelector('#new-password').value='8642';document.querySelector('#repeat-password').value='8642'");tap("#owner-submit");waitJS("!document.querySelector('dialog').open");
        scenario.recreate();scenario.onActivity(a->activity=a);waitJS("window.__beanStarted===true");
        assertEquals(Boolean.TRUE,async("return !!await (await import('./storage.js')).security.authorize('8642');"));
        tap("[data-page=settings]");waitJS("!!document.querySelector('#clear-all-data')");tap("#clear-all-data");tap("#ok-modal");waitJS("document.querySelector('#toast').textContent.includes('已清除')");
        assertEquals(0,state().getJSONArray("records").length());assertEquals(0,state().getJSONArray("ledger").length());assertEquals(0,state().getJSONArray("topups").length());assertEquals(3,state().getJSONArray("prizes").getJSONObject(0).getInt("weekly"));
        assertEquals(Boolean.TRUE,async("return !!await (await import('./storage.js')).security.authorize('8642');"));
    }
}
