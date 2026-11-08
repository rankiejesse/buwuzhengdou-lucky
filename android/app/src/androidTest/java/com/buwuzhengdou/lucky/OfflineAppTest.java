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
        async("const r=await import('./storage.js');const e=await import('./engine.js');await r.transact('live',()=>({state:e.fresh()}));await r.repository.resetSandbox();sessionStorage.setItem('bean-mode','live');return true;");
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
        fail("Timed out waiting for "+script);
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
        eval("document.querySelector("+quoted+").scrollIntoView({block:'center'})");SystemClock.sleep(150);
        JSONObject rect=(JSONObject)eval("(()=>{let r=document.querySelector("+quoted+").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2,w:innerWidth};})()");
        int[] coords=new int[2];int[] width=new int[1];InstrumentationRegistry.getInstrumentation().runOnMainSync(()->{activity.webView.getLocationOnScreen(coords);width[0]=activity.webView.getWidth();});
        double scale=width[0]/rect.getDouble("w");assertTrue(device.click(coords[0]+(int)(rect.getDouble("x")*scale),coords[1]+(int)(rect.getDouble("y")*scale)));
    }
    void claim() throws Exception {tap("#start-draw");waitJS("!!document.querySelector('#claim')");tap("#claim");waitJS("!!document.querySelector('#next-customer')");}
    void dataPage() throws Exception {tap("[data-page=data]");waitJS("!!document.querySelector('#export-data')");}

    @Test public void coldOfflineStartAndClaimPersistAfterActivityRecreation() throws Exception {
        PackageInfo info=activity.getPackageManager().getPackageInfo(activity.getPackageName(),android.content.pm.PackageManager.GET_PERMISSIONS);
        assertFalse(info.requestedPermissions!=null&&Arrays.asList(info.requestedPermissions).contains("android.permission.INTERNET"));
        assertEquals("object",eval("typeof BeanAndroid"));assertTrue(String.valueOf(eval("document.querySelector('#offline-status').textContent")).contains("内置离线"));
        async("const r=(await import('./storage.js')).repository;const s=await r.read('live');for(const p of s.prizes){p.probability=p.id==='p09'?100:0;}s.prizes[0].total=1;s.prizes[0].daily=1;s.prizes[0].monthly=1;await r.execute('live',{type:'settings',prizes:s.prizes,expectedRevision:s.settingsRevision});return true;");reload();
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
        claim();dataPage();tap("#export-data");
        String filename="bean-native-"+System.currentTimeMillis()+".json";
        UiObject2 name=device.wait(Until.findObject(By.clazz("android.widget.EditText")),15000);assertNotNull("Android save dialog",name);name.setText(filename);
        UiObject2 save=device.wait(Until.findObject(By.text(Pattern.compile("(?i)save|保存"))),10000);assertNotNull("Save action",save);save.click();
        assertTrue(device.wait(Until.hasObject(By.pkg(activity.getPackageName())),15000));SystemClock.sleep(1000);
        String saved=device.executeShellCommand("cat /sdcard/Download/"+filename);JSONObject snapshot=new JSONObject(saved);assertEquals(1,snapshot.getJSONObject("state").getJSONArray("records").length());
        async("await (await import('./storage.js')).repository.execute('live',{type:'clearRecords'});return true;");reload();dataPage();tap("#import-data");
        UiObject2 file=device.wait(Until.findObject(By.text(filename)),10000);assertNotNull("Exported backup in Android picker",file);file.click();
        waitJS("!!document.querySelector('#ok-modal')");tap("#ok-modal");waitJS("document.querySelector('#toast').textContent.includes('导入成功')");
        assertEquals(1,state().getJSONArray("records").length());assertEquals(1,state().getJSONArray("ledger").length());
    }
}
