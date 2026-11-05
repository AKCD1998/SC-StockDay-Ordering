package th.co.scgroup1989.scpda;
import android.app.Activity;
import android.Manifest;
import android.os.*;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.view.*;
import android.webkit.*;
import java.io.*;
import java.util.*;

// Only immutable bundled assets are allowed into these WebViews. Remote links
// open outside the bridge-bearing WebView; file/content access is disabled.
public abstract class AssetActivity extends Activity {
 static final String ASSET_ORIGIN="https://appassets.androidplatform.net";
 protected WebView web;private PermissionRequest cameraRequest;
 protected void createView(String entry){
  getWindow().setStatusBarColor(Color.rgb(246,248,252));getWindow().setNavigationBarColor(Color.rgb(246,248,252));getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR|View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR);
  web=new WebView(this);web.setBackgroundColor(Color.rgb(246,248,252));WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setAllowFileAccess(false);s.setAllowContentAccess(false);s.setAllowFileAccessFromFileURLs(false);s.setAllowUniversalAccessFromFileURLs(false);s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);s.setCacheMode(WebSettings.LOAD_NO_CACHE);s.setSaveFormData(false);s.setMediaPlaybackRequiresUserGesture(false);s.setSupportMultipleWindows(false);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){return !trusted(r.getUrl());}
   @Override public WebResourceResponse shouldInterceptRequest(WebView v,WebResourceRequest r){
    if(!trusted(r.getUrl())||!r.getMethod().equals("GET"))return denied();String path=r.getUrl().getPath();if(path==null||path.contains("..")||path.contains("\\")||!path.matches("/[a-zA-Z0-9_.-]+"))return denied();
    try{String mime=path.endsWith(".html")?"text/html":path.endsWith(".png")?"image/png":"application/octet-stream";Map<String,String> h=new HashMap<>();h.put("Cache-Control","no-store");h.put("Content-Security-Policy","default-src 'none'; script-src 'unsafe-inline' 'wasm-unsafe-eval'; style-src 'unsafe-inline'; img-src 'self' data:; font-src data:; media-src blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'");h.put("Permissions-Policy","camera=(self), microphone=()");return new WebResourceResponse(mime,mime.equals("text/html")?"UTF-8":null,200,"OK",h,getAssets().open(path.substring(1)));}catch(IOException e){return denied();}
   }
  });setContentView(web);configure();web.loadUrl(ASSET_ORIGIN+"/"+entry);
 }
 protected void configure(){web.setWebChromeClient(new WebChromeClient(){
  @Override public void onPermissionRequest(final PermissionRequest p){runOnUiThread(()->{if(!trusted(p.getOrigin())){p.deny();return;}boolean video=false;for(String r:p.getResources())if(r.equals(PermissionRequest.RESOURCE_VIDEO_CAPTURE))video=true;if(!video){p.deny();return;}if(checkSelfPermission(Manifest.permission.CAMERA)==PackageManager.PERMISSION_GRANTED)p.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else{if(cameraRequest!=null)cameraRequest.deny();cameraRequest=p;requestPermissions(new String[]{Manifest.permission.CAMERA},41);}});}
  @Override public void onPermissionRequestCanceled(PermissionRequest p){if(cameraRequest==p)cameraRequest=null;}
 });}
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] results){super.onRequestPermissionsResult(code,permissions,results);if(code==41&&cameraRequest!=null){PermissionRequest p=cameraRequest;cameraRequest=null;if(results.length>0&&results[0]==PackageManager.PERMISSION_GRANTED&&trusted(p.getOrigin()))p.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else p.deny();}}
 static boolean trusted(Uri u){return u!=null&&"https".equals(u.getScheme())&&"appassets.androidplatform.net".equals(u.getHost())&&u.getPort()==-1;}
 static WebResourceResponse denied(){return new WebResourceResponse("text/plain","UTF-8",403,"Forbidden",Collections.<String,String>emptyMap(),new ByteArrayInputStream(new byte[0]));}
 @Override protected void onPause(){super.onPause();if(web!=null){web.evaluateJavascript("window.dispatchEvent(new Event('scpda-background'));",null);web.onPause();}}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
 @Override protected void onDestroy(){if(cameraRequest!=null){cameraRequest.deny();cameraRequest=null;}if(web!=null){web.removeJavascriptInterface("SCPDAHost");web.destroy();}super.onDestroy();}
 @Override public void onBackPressed(){if(web!=null)web.evaluateJavascript("(()=>{const d=document.querySelector('dialog[open]');if(d){const b=d.querySelector('#cameraClose,#closeAccount');if(b)b.click();else d.close();return true;}return false;})()",r->{if(!"true".equals(r))finish();});else super.onBackPressed();}
}
