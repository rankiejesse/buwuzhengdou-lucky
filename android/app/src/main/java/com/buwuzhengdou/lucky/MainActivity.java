package com.buwuzhengdou.lucky;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.ActivityNotFoundException;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.webkit.*;
import android.widget.*;
import androidx.webkit.WebViewAssetLoader;
import org.json.JSONObject;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String HOST = "appassets.androidplatform.net";
    private static final String START = "https://" + HOST + "/assets/www/index.html";
    private static final int OPEN_JSON = 41, SAVE_JSON = 42;
    private static final int MAX_BACKUP = 20 * 1024 * 1024;
    private FrameLayout root;
    WebView webView;
    private ValueCallback<Uri[]> fileCallback;
    private boolean exportBusy;
    private File pendingExport;
    private final ExecutorService files = Executors.newSingleThreadExecutor();

    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved);
        pendingExport = new File(getCacheDir(), "pending-backup.json");
        exportBusy = saved != null && saved.getBoolean("exportBusy") && pendingExport.exists();
        root = new FrameLayout(this); root.setBackgroundColor(Color.rgb(247,245,239)); setContentView(root);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            root.setOnApplyWindowInsetsListener((v,insets) -> {
                android.graphics.Insets bars = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                v.setPadding(bars.left,bars.top,bars.right,bars.bottom); return insets;
            });
        }
        createWebView();
        if(Build.VERSION.SDK_INT>=33)getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT,this::confirmExit);
        getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private static boolean local(Uri uri) {
        return "https".equals(uri.getScheme()) && HOST.equals(uri.getHost()) && uri.getPath() != null && uri.getPath().startsWith("/assets/www/");
    }

    @SuppressWarnings("SetJavaScriptEnabled") private void createWebView() {
        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(247,245,239));
        root.addView(webView,new FrameLayout.LayoutParams(-1,-1));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setJavaScriptCanOpenWindowsAutomatically(false); settings.setSupportMultipleWindows(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSafeBrowsingEnabled(false); // Only bundled app assets can load; no network permission.
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        WebViewAssetLoader loader = new WebViewAssetLoader.Builder().addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this)).build();
        webView.addJavascriptInterface(new BackupBridge(), "BeanAndroid");
        webView.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (local(request.getUrl())) {
                    WebResourceResponse response = loader.shouldInterceptRequest(request.getUrl());
                    if (response != null) return response;
                }
                return new WebResourceResponse("text/plain","UTF-8",403,"Local content only",java.util.Collections.emptyMap(), new ByteArrayInputStream("Unavailable".getBytes(StandardCharsets.UTF_8)));
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (local(request.getUrl())) return false;
                toast("离线版只打开应用内页面"); return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showRecovery("应用页面未能打开，请重试。本机数据不会被清除。");
            }
            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                root.removeView(view); view.destroy(); webView=null;
                showRecovery("显示组件意外退出。请重试打开，已保存的数据会保留。"); return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("*/*");
                intent.putExtra(Intent.EXTRA_MIME_TYPES,new String[]{"application/json","text/plain","application/octet-stream"});
                try { startActivityForResult(intent, OPEN_JSON); }
                catch (ActivityNotFoundException e) { fileCallback.onReceiveValue(null);fileCallback=null;toast("未找到系统文件选择器"); }
                return true;
            }
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                if (BuildConfig.DEBUG) Log.d("BeanWeb",message.message());return true;
            }
            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }
        });
        webView.loadUrl(START);
    }

    private void showRecovery(String message) {
        root.removeAllViews();
        LinearLayout box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(40,80,40,40);
        TextView text=new TextView(this);text.setText(message);text.setTextSize(20);box.addView(text);
        Button retry=new Button(this);retry.setText("重试打开");box.addView(retry);
        retry.setOnClickListener(v->{if(webView!=null){webView.destroy();webView=null;}root.removeAllViews();createWebView();});root.addView(box);
    }

    private void toast(String text) { runOnUiThread(()->Toast.makeText(this,text,Toast.LENGTH_LONG).show()); }

    public final class BackupBridge {
        @JavascriptInterface public void saveBackup(String json, String name) {
            if(json==null || json.length()>MAX_BACKUP){toast("备份超过20MB，未能保存");return;}
            try { JSONObject object=new JSONObject(json);int version=object.optInt("version");if(!"buwuzhengdou-backup".equals(object.optString("format"))||(version!=1&&version!=2))throw new IllegalArgumentException(); }
            catch(Exception e){toast("备份内容无效，未能保存");return;}
            String cleanName=name==null?"不务正豆-完整备份.json":name.replaceAll("[^\\p{L}\\p{N}._-]","_");
            final String title=cleanName.substring(0,Math.min(cleanName.length(),100));
            runOnUiThread(()->{
                if(exportBusy){toast("请先完成当前备份保存");return;}exportBusy=true;
                files.execute(()->{
                    try{
                        byte[] bytes=json.getBytes(StandardCharsets.UTF_8);if(bytes.length>MAX_BACKUP)throw new IOException("too large");
                        try(FileOutputStream out=new FileOutputStream(pendingExport)){out.write(bytes);out.getFD().sync();}
                        runOnUiThread(()->{
                            if(isFinishing()||isDestroyed())return;
                            Intent intent=new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/json");
                            intent.putExtra(Intent.EXTRA_TITLE,title.endsWith(".json")?title:title+".json");
                            try{startActivityForResult(intent,SAVE_JSON);}catch(ActivityNotFoundException e){exportBusy=false;toast("未找到系统文件保存窗口");}
                        });
                    }catch(IOException e){runOnUiThread(()->{exportBusy=false;toast("备份准备失败，请检查设备存储空间");});}
                });
            });
        }
    }

    @Override protected void onActivityResult(int requestCode,int resultCode,Intent data) {
        super.onActivityResult(requestCode,resultCode,data);
        if(requestCode==OPEN_JSON){
            if(fileCallback!=null){Uri uri=resultCode==RESULT_OK&&data!=null?data.getData():null;fileCallback.onReceiveValue(uri==null?null:new Uri[]{uri});fileCallback=null;}
        }else if(requestCode==SAVE_JSON){
            Uri uri=resultCode==RESULT_OK&&data!=null?data.getData():null;
            if(uri==null){exportBusy=false;toast("已取消备份保存");return;}
            files.execute(()->{
                try(InputStream input=new FileInputStream(pendingExport);OutputStream output=getContentResolver().openOutputStream(uri,"wt")){
                    if(output==null)throw new IOException("no destination");byte[] buffer=new byte[8192];int len;while((len=input.read(buffer))!=-1)output.write(buffer,0,len);output.flush();
                    toast("完整备份已保存");
                }catch(IOException e){toast("备份保存失败，请重新导出");}
                finally{pendingExport.delete();runOnUiThread(()->exportBusy=false);}
            });
        }
    }
    @Override protected void onSaveInstanceState(Bundle out) { super.onSaveInstanceState(out);out.putBoolean("exportBusy",exportBusy); }
    @Override public void onBackPressed() {
        confirmExit();
    }
    private void confirmExit() {
        new AlertDialog.Builder(this).setTitle("退出抽奖应用？").setMessage("已保存的设置、库存与记录会保留，待领取结果会在下次打开时恢复。")
            .setNegativeButton("继续使用",null).setPositiveButton("退出",(d,w)->finish()).show();
    }
    @Override protected void onDestroy() {
        if(fileCallback!=null){fileCallback.onReceiveValue(null);fileCallback=null;}
        if(webView!=null){root.removeView(webView);webView.destroy();webView=null;}
        files.shutdown();super.onDestroy();
    }
}
